/**
 * tools/harness/probe.ts — measure a suggested `balance.json` delta instead of guessing at it.
 *
 * build-doc §10.5's overnight loop is "agent runs harness → adjusts `balance.json` only (INV-3) →
 * reruns → commits report". This is that loop, run once per proposal, inside a single report: each
 * candidate delta is applied to a COPY of the balance file, re-validated through the same
 * `validateBundle` the game boots with, and re-measured. No code changes; nothing on disk changes.
 *
 * It is also the strongest available demonstration that the named test `ext_retune` is true of this
 * harness: every report contains several runs against overridden balance objects, and if the
 * override path ever stopped working the probes would report a delta of exactly zero.
 *
 * G11: the proposals' magnitudes are derived from the SHIPPED values (a multiple, a redistribution)
 * rather than written as new constants, and none of them is applied to `data/balance.json`.
 */

import { loadContentFromRaw, type LoadedContent } from "./content";
import { runGymSim } from "./gym-sim";
import { runRoundRobin } from "./round-robin";
import type { LevelModel } from "./player";

export interface DeltaProposal {
  /** Dotted path into balance.json. */
  path: string;
  from: unknown;
  to: unknown;
  /** Which measurement the delta is expected to move. */
  probe: "gym" | "chart";
  /** For the gym probe: which level model to re-measure under. */
  model?: LevelModel;
}

export interface DeltaProbeResult {
  proposal: DeltaProposal;
  /** Human-readable before/after of the thing the delta was supposed to move. */
  before: string;
  after: string;
  /** Signed change in the headline figure, in win-rate points. */
  change: number;
  /** Per-row detail, for the report table. */
  rows: Array<{ label: string; before: number; after: number }>;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Set a dotted path on a plain object, creating nothing — a bad path throws rather than no-ops. */
function setPath(root: unknown, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor = root as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i] as string;
    const next = cursor[key];
    if (next === null || typeof next !== "object") {
      throw new Error(`tools/harness: balance path "${path}" does not exist (stopped at "${key}")`);
    }
    cursor = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1] as string;
  if (!(last in cursor)) {
    throw new Error(`tools/harness: balance path "${path}" does not exist (no key "${last}")`);
  }
  cursor[last] = value;
}

/** Read a dotted path, for reporting the "from" value without hard-coding it. */
export function readPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const key of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/** The overridden content a proposal implies. Nothing on disk is touched. */
export function contentWithDelta(loaded: LoadedContent, proposal: DeltaProposal): LoadedContent {
  const raw = deepClone(loaded.rawBalance);
  setPath(raw, proposal.path, proposal.to);
  return loadContentFromRaw(raw, `${loaded.balancePath ?? "data/balance.json"} + ${proposal.path}`);
}

export interface ProbeBudget {
  gymSeeds: number;
  chartSeeds: number;
  drafts: number;
}

export function probeDelta(
  loaded: LoadedContent,
  proposal: DeltaProposal,
  budget: ProbeBudget,
): DeltaProbeResult {
  const tuned = contentWithDelta(loaded, proposal);

  if (proposal.probe === "gym") {
    const model: LevelModel = proposal.model ?? "trained";
    const before = runGymSim(loaded, budget.gymSeeds, budget.drafts, model);
    const after = runGymSim(tuned, budget.gymSeeds, budget.drafts, model);
    const rows = before.gyms.map((g, i) => ({
      label: g.gymName,
      before: g.winRate,
      after: after.gyms[i]?.winRate ?? 0,
    }));
    const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
    const b = mean(rows.map((r) => r.before));
    const a = mean(rows.map((r) => r.after));
    return {
      proposal,
      before: `mean gym win rate ${(b * 100).toFixed(1)}%`,
      after: `mean gym win rate ${(a * 100).toFixed(1)}%`,
      change: a - b,
      rows,
    };
  }

  const before = runRoundRobin(loaded, budget.chartSeeds);
  const after = runRoundRobin(tuned, budget.chartSeeds);
  const afterById = new Map(after.lines.map((l) => [l.lineId, l.peerWinRate]));
  // The delta is judged on the lines that were OUT of band, since that is what it is for.
  const tail = before.lines.filter((l) => !l.ancient && l.peerFlagged);
  const rows = tail.map((l) => ({
    label: l.formName,
    before: l.peerWinRate,
    after: afterById.get(l.lineId) ?? 0,
  }));
  const inBandBefore = before.lines.filter((l) => !l.ancient && !l.peerFlagged).length;
  const inBandAfter = after.lines.filter((l) => !l.ancient && !l.peerFlagged).length;
  const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
  return {
    proposal,
    before: `${inBandBefore} of ${before.lines.filter((l) => !l.ancient).length} lines in band`,
    after: `${inBandAfter} of ${after.lines.filter((l) => !l.ancient).length} lines in band`,
    change: mean(rows.map((r) => r.after)) - mean(rows.map((r) => r.before)),
    rows,
  };
}
