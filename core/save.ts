/**
 * core/save.ts — the build-doc §7.8 save file: shape, storage, and deterministic replay.
 *
 * `{version:1, seed, year, tick, currentNode, party[], box[], money, items, questFlags, nodeStates,
 * actionLog[]}` — locked decision L12 puts it in localStorage across 3 slots, but this module is
 * ENGINE-AGNOSTIC (L11): it never touches `window`, `localStorage` or `document`. It takes a
 * `StorageLike` instead, so the Phaser boot scene hands it `window.localStorage`, the balance
 * harness hands it `MemoryStorage`, and the tests hand it whichever they need.
 *
 * Determinism (build-doc §8.1, test `det_replay`): identical (seed, actionLog) ⇒ byte-identical
 * final save. `serialize` is CANONICAL — object keys are sorted at every depth — so "byte-identical"
 * is a statement about values and never an accident of key insertion order.
 */

import { zSaveFile } from "./schemas";
import type {
  ActionLogEntry,
  Balance,
  GameAction,
  GymLeader,
  NodeFile,
  NodeState,
  OwnedCreature,
  SaveFile,
} from "./types";
import type { AdvanceYearResult, RandomFn, YearRetirementPrompt, YearTurnDeps } from "./lifecycle";
import {
  cloneNodeState,
  enterPendingActs,
  LifecycleError,
  resolveRetirement,
  rollHeirChoice,
  runYearTurn,
  yearTurnActions,
} from "./lifecycle";
// L10 — the ACT half of the tape. A gym victory is the act model's only numeric input, so replay
// must award the badge and enter the acts it earned exactly as `OverworldScene.winGym` does, or a
// replayed run has no badges, no acts and no Cullbrand raid.
import { awardBadge } from "./acts";
import type { Rng, RngState } from "./rng";
import { subsystemRng } from "./rng";
// build-doc §7.3 step 4's clamp, and G3's single source of truth for a population write: replay
// must move a count exactly the way live play moves it, so it calls the same function.
// (core/ecosim.ts imports nothing from this module, so there is no cycle.)
import { clampPopulationCount } from "./ecosim";

/* ────────────────────────────────────────────────────────────────────────────
 * Storage seam (L11)
 * ──────────────────────────────────────────────────────────────────────────── */

/** The three `localStorage` members this module uses, and nothing else. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory `StorageLike` for tests, the harness, and headless replay. */
export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  /** Test/harness affordance: the raw keys currently held. */
  keys(): string[] {
    return [...this.map.keys()];
  }
}

export class SaveVersionError extends Error {
  readonly found: number;
  readonly expected: number;
  constructor(message: string, found: number, expected: number) {
    super(message);
    this.name = "SaveVersionError";
    this.found = found;
    this.expected = expected;
  }
}

export class SaveCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveCorruptError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The stored shape
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Per-subsystem RNG stream state, keyed by the subsystem tag (build-doc §8.1 / balance.rng
 * subsystemTags). The value is opaque to this module — an xorshift128 stream is four uint32s, but
 * core/save.ts only promises to round-trip whatever numbers core/rng.ts hands it, so the two can be
 * retuned independently.
 */
export type RngStreamStates = Record<string, number[]>;

/**
 * The save as written to storage: build-doc §7.8 verbatim, plus one OPTIONAL additive field.
 *
 * `rngState` exists because §7.8's own determinism promise is about (seed, actionLog), which
 * reconstructs a stream only by replaying the whole log. A save taken mid-run has to come back with
 * its streams where it left them, so the stream state rides along. A save written without it is a
 * plain §7.8 save and still loads — but it resumes at the TOP of every stream, so a run continued
 * from it diverges from the run that wrote it. `openStreams` + `writeSlot(..., streams)` are how a
 * caller keeps that from happening; see `openStreams` for the whole loop.
 */
export interface SaveEnvelope extends SaveFile {
  rngState?: RngStreamStates;
}

/* ────────────────────────────────────────────────────────────────────────────
 * RNG streams across a save/load (build-doc §8.1)
 * ──────────────────────────────────────────────────────────────────────────── */

/** The seeded streams a running game holds, keyed by `balance.rng.subsystemTags`. */
export type RngStreams = Record<string, Rng>;

/** [x, y, z, w] — the four uint32 words of an xorshift128 state (core/rng.ts `RngState`). */
const RNG_STATE_WORDS = ["x", "y", "z", "w"] as const;

function encodeRngState(state: RngState): number[] {
  return RNG_STATE_WORDS.map((k) => state[k]);
}

function decodeRngState(words: readonly number[], tag: string): RngState {
  if (words.length !== RNG_STATE_WORDS.length) {
    throw new SaveCorruptError(
      `save.rngState["${tag}"] has ${words.length} words, not ${RNG_STATE_WORDS.length}`,
    );
  }
  const [x, y, z, w] = words as [number, number, number, number];
  return { x, y, z, w };
}

/**
 * Open every subsystem stream for a save, positioned where the save left it.
 *
 * This is the load half of the mid-run save. Without it a "continue" rebuilds each stream from
 * `(seed, tag)` alone — i.e. at draw zero — so the continued run redraws numbers the interrupted run
 * had already spent and lands on a different save than an uninterrupted play of the same actions.
 *
 *   load:  const streams = openStreams(readSlot(...), balance);
 *   play:  advanceYear(save, { …, rng: () => streams.sim.nextFloat() })
 *   save:  writeSlot(storage, slot, save, balance, streams)
 */
export function openStreams(save: SaveEnvelope, balance: Balance): RngStreams {
  const streams: RngStreams = {};
  for (const tag of balance.rng.subsystemTags) {
    const stream = subsystemRng(save.seed, tag);
    const stored = save.rngState?.[tag];
    if (stored) stream.restore(decodeRngState(stored, tag));
    streams[tag] = stream;
  }
  return streams;
}

/** Snapshot every stream's position for storage. */
export function captureStreams(streams: RngStreams): RngStreamStates {
  const out: RngStreamStates = {};
  for (const tag of Object.keys(streams)) {
    const stream = streams[tag];
    if (stream) out[tag] = encodeRngState(stream.save());
  }
  return out;
}

/** The save plus the current stream positions. Pure. */
export function withStreamState(save: SaveEnvelope, streams: RngStreams): SaveEnvelope {
  return { ...save, rngState: captureStreams(streams) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Canonical serialization
 * ──────────────────────────────────────────────────────────────────────────── */

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      const child = src[key];
      if (child === undefined) continue;
      out[key] = canonicalize(child);
    }
    return out;
  }
  return value;
}

/**
 * JSON with object keys sorted at every depth. build-doc §8.1's property is "byte-identical final
 * save"; without canonical ordering that property would also be asserting the order in which two
 * code paths happened to assign fields, which is not what determinism means.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function serialize(save: SaveEnvelope): string {
  return canonicalStringify(save);
}

function readRngState(raw: unknown): RngStreamStates | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const candidate = (raw as { rngState?: unknown }).rngState;
  if (candidate === null || candidate === undefined) return undefined;
  if (typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new SaveCorruptError("save.rngState must be an object keyed by subsystem tag");
  }
  const out: RngStreamStates = {};
  const src = candidate as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    const stream = src[key];
    if (!Array.isArray(stream) || stream.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      throw new SaveCorruptError(`save.rngState["${key}"] must be an array of finite numbers`);
    }
    out[key] = stream.slice() as number[];
  }
  return out;
}

export function saveVersionOf(balance: Balance): number {
  return balance.party.saveVersion;
}

/**
 * The version literal `core/schemas.ts` `zSaveFile` accepts. NOT the game's save version — that is
 * `saveVersionOf(balance)` and lives in balance.json. This exists only so `deserialize` can satisfy
 * a schema that hard-pins the number while the real check runs against balance.
 */

/**
 * build-doc §7.8 — "Migration: refuse older versions with a clear message (demo scope)."
 * A newer version is refused just as loudly: silently loading a shape this build does not know is
 * how a save gets corrupted rather than rejected.
 */
export function deserialize(json: string, balance: Balance): SaveEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch (err) {
    throw new SaveCorruptError(`save data is not valid JSON: ${(err as Error).message}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SaveCorruptError("save data is not a save object");
  }

  const expected = saveVersionOf(balance);
  const found = (raw as { version?: unknown }).version;
  if (typeof found !== "number" || !Number.isInteger(found)) {
    throw new SaveCorruptError("save data has no integer `version` field — refusing to load it");
  }
  if (found < expected) {
    throw new SaveVersionError(
      `This save was written by TROPHIC save format v${found}, and this build reads v${expected}. ` +
        `Saves are not migrated (demo scope) — start a new game to play this build.`,
      found,
      expected,
    );
  }
  if (found > expected) {
    throw new SaveVersionError(
      `This save was written by TROPHIC save format v${found}, which is newer than the v${expected} ` +
        `this build reads. Update the game, or start a new game.`,
      found,
      expected,
    );
  }

  /*
   * The version has now been checked against `balance.party.saveVersion`, which is the ONE home for
   * that number (INV-3: retuning balance touches balance.json only). The raw object goes to zod
   * unaltered: at integration the second and third pins were removed (`zSaveFile` validated
   * `z.literal(1)` and `SaveFile.version` was the literal TYPE `1`), so this no longer has to
   * normalise the value and restore it afterwards. See DEVIATIONS D-A4-18.
   */
  const parsed = zSaveFile.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new SaveCorruptError(`save data failed validation:\n${issues}`);
  }

  const body: SaveEnvelope = { ...parsed.data, version: found };
  const rngState = readRngState(raw);
  return rngState ? { ...body, rngState } : body;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Slots (L12 — 3 slots)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Storage-key namespace. Not a gameplay constant — it names a bucket, it does not tune anything. */
export const SAVE_KEY_PREFIX = "trophic.save";

export function slotKey(slot: number): string {
  return `${SAVE_KEY_PREFIX}.${slot}`;
}

function assertSlot(slot: number, balance: Balance): void {
  const slots = balance.party.saveSlots;
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots) {
    throw new SaveCorruptError(`save slot ${slot} is out of range — this build has ${slots} slots`);
  }
}

/**
 * Write a save to a slot. Pass the live `streams` for a MID-RUN save: without them the stored save
 * has no stream position, and continuing from it replays numbers the interrupted run already spent
 * (build-doc §8.1). A brand-new game has nothing to capture and may omit them.
 */
export function writeSlot(
  storage: StorageLike,
  slot: number,
  save: SaveEnvelope,
  balance: Balance,
  streams?: RngStreams,
): void {
  assertSlot(slot, balance);
  storage.setItem(slotKey(slot), serialize(streams ? withStreamState(save, streams) : save));
}

export function readSlot(storage: StorageLike, slot: number, balance: Balance): SaveEnvelope | null {
  assertSlot(slot, balance);
  const json = storage.getItem(slotKey(slot));
  if (json === null) return null;
  return deserialize(json, balance);
}

export function deleteSlot(storage: StorageLike, slot: number, balance: Balance): void {
  assertSlot(slot, balance);
  storage.removeItem(slotKey(slot));
}

export interface SlotSummary {
  slot: number;
  /** null = empty slot; an Error = a slot this build refuses to load (version or corruption). */
  save: SaveEnvelope | null;
  error: Error | null;
}

/** Slot list for the title screen: never throws, so one bad slot cannot hide the other two. */
export function listSlots(storage: StorageLike, balance: Balance): SlotSummary[] {
  const out: SlotSummary[] = [];
  for (let slot = 0; slot < balance.party.saveSlots; slot += 1) {
    try {
      out.push({ slot, save: readSlot(storage, slot, balance), error: null });
    } catch (err) {
      out.push({ slot, save: null, error: err as Error });
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * New game
 * ──────────────────────────────────────────────────────────────────────────── */

export interface NewSaveOpts {
  seed: number;
  currentNode: string;
  /** build-doc §4 step 1 — "copies of every node JSON as live sim state". */
  nodes: readonly NodeFile[];
  party?: OwnedCreature[];
  box?: OwnedCreature[];
  money?: number;
  items?: Record<string, number>;
  questFlags?: Record<string, boolean | number | string>;
  rngState?: RngStreamStates;
}

/** Node file → live sim state. A deep copy: the shipped JSON is never aliased by a running game. */
export function nodeStateFrom(node: NodeFile): NodeState {
  const populations: Record<string, NodeState["populations"][string]> = {};
  for (const key of Object.keys(node.populations)) {
    const pop = node.populations[key];
    if (pop) populations[key] = { ...pop };
  }
  return { populations, floraStock: node.floraStock, recentDeaths: 0 };
}

/**
 * build-doc §4, runtime narrative step 1: "Boot loads balance.json, all content JSON, and the save
 * (or seeds a new one: RNG seed + copies of every node JSON as live sim state)."
 */
export function newSave(opts: NewSaveOpts, balance: Balance): SaveEnvelope {
  const nodeStates: Record<string, NodeState> = {};
  for (const node of opts.nodes) nodeStates[node.id] = nodeStateFrom(node);

  const save: SaveEnvelope = {
    // G11 / INV-4: the save version is a balance.json value, never a literal here. A build that
    // bumps `party.saveVersion` must be able to load the save its own new game just wrote.
    version: saveVersionOf(balance) as SaveFile["version"],
    seed: opts.seed,
    year: balance.clock.startYear,
    tick: balance.clock.startTick,
    currentNode: opts.currentNode,
    party: opts.party ? opts.party.map((c) => ({ ...c })) : [],
    box: opts.box ? opts.box.map((c) => ({ ...c })) : [],
    money: opts.money ?? 0,
    items: { ...(opts.items ?? {}) },
    questFlags: { ...(opts.questFlags ?? {}) },
    nodeStates,
    actionLog: [],
  };
  if (opts.rngState) save.rngState = { ...opts.rngState };
  return save;
}

/** The seq the next log entry must carry. */
export function nextSeq(save: SaveEnvelope): number {
  const last = save.actionLog[save.actionLog.length - 1];
  return last ? last.seq + 1 : 0;
}

/** Append one action to the log, numbering it. Pure. */
export function appendAction(save: SaveEnvelope, action: GameAction): SaveEnvelope {
  const entry: ActionLogEntry = {
    seq: nextSeq(save),
    year: save.year,
    tick: save.tick,
    action,
  };
  return { ...save, actionLog: [...save.actionLog, entry] };
}

/**
 * Append already-built entries (the year turn's tape) to a save's log.
 *
 * The numbering is CHECKED rather than repaired: `replay` renumbers its output from 0 upward, so a
 * log with a gap or a repeat can never equal its own replay, and build-doc §8.1's byte-identity
 * property would fail for a reason nothing points at. Failing here names the producer instead.
 */
export function appendEntries(
  save: SaveEnvelope,
  entries: readonly ActionLogEntry[],
): SaveEnvelope {
  let expected = nextSeq(save);
  for (const entry of entries) {
    if (entry.seq !== expected) {
      throw new SaveCorruptError(
        `action log entry is numbered ${entry.seq} where the log is at ${expected} — ` +
          `the log must be a gapless sequence from 0`,
      );
    }
    expected += 1;
  }
  return { ...save, actionLog: [...save.actionLog, ...entries] };
}

/**
 * The whole year-turn bookkeeping: take `advanceYear`'s result and the tick the turn started at,
 * and hand back the post-turn save with the turn's entries appended and correctly numbered.
 */
export function appendYearTurn(
  result: AdvanceYearResult,
  tickBefore: number,
): SaveEnvelope {
  const save = result.save as SaveEnvelope;
  return appendEntries(save, yearTurnActions(result, tickBefore));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Deterministic replay (build-doc §8.1 / L10, test `det_replay`)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReplayDeps extends YearTurnDeps {
  /**
   * data/gyms.json — the badge ladder `core/acts.ts` counts.
   *
   * REQUIRED, and deliberately not optional. A `gymVictory` in the tape awards a badge, which can
   * enter one or more acts, and act entry is what applies the Cullbrand raid (D-Q3-1). Without the
   * gym list replay cannot derive the act, and an optional field would have made that a SILENT
   * half-replay: badges present, acts absent, raid never applied, ledger quietly wrong. L10 says
   * the same (seed, actionLog) gives a byte-identical save; a missing dep must be a compile error,
   * not a different ending.
   */
  gyms: readonly GymLeader[];
  /**
   * The lifecycle stream, rebuilt from `save.seed` with core/rng.ts. Supplying it makes replay draw
   * the SAME number of values in the SAME order as live play did (the heir roll happens either way,
   * even though the log already fixes which choice was taken), so a replayed run leaves the stream
   * exactly where the live run left it.
   */
  rng?: RandomFn;
  /**
   * Handler for the actions other lanes own (travel, foray, battle, inn). Replay applies the
   * lifecycle and act actions itself and hands everything else here; without a handler those
   * entries are carried into the log unchanged and alter nothing.
   */
  applyOther?: (save: SaveEnvelope, entry: ActionLogEntry) => SaveEnvelope;
}

/**
 * build-doc §7.3 — "Player catch/release directly increments/decrements count at action time."
 *
 * A catch or release naming a node or a line the save does not have is a log that does not belong to
 * this save, and it fails the same way a stray retirement does: loudly. Silently ignoring it
 * replayed a mismatched tape to a wrong-but-plausible ledger, and Hard Req 2 is that the ledger
 * shows real numbers. The floor is `balance.ecosim.populationFloor` — the same floor the year turn's
 * raid respects; a second hard-coded 0 here was one quantity governed by two numbers (G11).
 */
function adjustPopulation(
  save: SaveEnvelope,
  balance: Balance,
  nodeId: string,
  lineId: string,
  delta: number,
): SaveEnvelope {
  const state = save.nodeStates[nodeId];
  if (!state) {
    throw new SaveCorruptError(
      `action log names node "${nodeId}", which this save has no state for — ` +
        `the log does not belong to this save`,
    );
  }
  const pop = state.populations[lineId];
  if (!pop) {
    throw new SaveCorruptError(
      `action log names species line "${lineId}" at node "${nodeId}", which has no such ` +
        `population — the log does not belong to this save`,
    );
  }
  const nodeStates: Record<string, NodeState> = { ...save.nodeStates };
  nodeStates[nodeId] = {
    ...state,
    populations: {
      ...state.populations,
      // build-doc §7.3 step 4's clamp has ONE implementation, in core/ecosim.ts. This module used
      // to restate it as `Math.max(populationFloor, count + delta)` — no upper bound — so replaying
      // a release at carrying capacity produced carryCap + 1 while the live path clamped, and
      // locked decision L10 ("identical (seed, actionLog) ⇒ byte-identical final save") was false
      // for any save whose log contained a release at a full node.
      [lineId]: { ...pop, count: clampPopulationCount(pop.count + delta, pop.carryCap, balance) },
    },
  };
  return { ...save, nodeStates };
}

/**
 * Replay an action log onto an initial save. Pure, and the whole point of L10: the same
 * (initial save, action log, deps) always produces the same final save, byte for byte.
 *
 * Actions this module applies itself:
 *   yearTurn   — core/lifecycle.ts `runYearTurn` (build-doc §7.5)
 *   retirement — core/lifecycle.ts `resolveRetirement` (build-doc §7.5 step 3)
 *   seasonStep — the injected `ecosimStep` (build-doc §7.3)
 *   gymVictory — core/acts.ts `awardBadge` + core/lifecycle.ts `enterPendingActs`. The badge is the
 *                act model's only numeric input and act entry applies the Cullbrand raid (D-Q3-1),
 *                so a tape without this case replays a run with no badges and an unharvested r4.
 *   catch/release — ONLY the node-population delta build-doc §7.3 attributes to the action itself
 *                   ("Player catch/release directly increments/decrements count at action time").
 *                   The party/box side needs the individual's age, level and traits, which the
 *                   action does not carry, so it belongs to `applyOther` (the game reducer, C1).
 */
export function replay(
  initial: SaveEnvelope,
  log: readonly ActionLogEntry[],
  deps: ReplayDeps,
): SaveEnvelope {
  /*
   * `initial` means initial. Replaying a MID-RUN save's own log onto itself — the obvious shape for
   * "reload and continue" — re-applies every catch, release and year turn the save already contains,
   * and the wrong ledger it produces is silent unless the log happens to hold a retirement. Reload
   * is `readSlot` + `openStreams`; replay is for a run rebuilt from its beginning.
   */
  if (initial.actionLog.length > 0) {
    throw new SaveCorruptError(
      `replay() takes the INITIAL save of a run, but this one already carries ` +
        `${initial.actionLog.length} logged actions — replaying its own log onto it would apply ` +
        `every action twice. To resume a saved run, use readSlot() + openStreams().`,
    );
  }

  let save: SaveEnvelope = { ...initial, actionLog: [] };
  let pending: YearRetirementPrompt[] = [];
  const applied: ActionLogEntry[] = [];

  const seasonOrder = deps.balance.clock.seasonOrder;

  for (const entry of log) {
    // The tape's own numbering is part of the save (build-doc §7.8). A gap or a repeat means the
    // log was assembled wrong, and renumbering it here would hide that forever.
    if (entry.seq !== applied.length) {
      throw new SaveCorruptError(
        `action log entry ${applied.length} is numbered ${entry.seq} — the log must be a gapless ` +
          `sequence from 0`,
      );
    }
    const action = entry.action;
    switch (action.t) {
      case "yearTurn": {
        // The entry says which year it ends in. A log from another save replays to a silently
        // different year unless that is checked — the sibling `retirement` branch checks its own.
        if (action.year !== save.year + 1) {
          throw new SaveCorruptError(
            `action log replays the year turn into year ${action.year} but the save is in year ` +
              `${save.year} — the log does not belong to this save`,
          );
        }
        const turn = runYearTurn(save, deps);
        save = { ...save, ...turn.save };
        pending = turn.prompts;
        break;
      }
      case "retirement": {
        const choice = action.choice;
        const idx = pending.findIndex((p) => p.parentUid === choice.parentUid);
        const prompt = pending[idx];
        if (!prompt) {
          throw new SaveCorruptError(
            `action log replays a retirement for "${choice.parentUid}" with no pending prompt — ` +
              `the log does not belong to this save`,
          );
        }
        pending = [...pending.slice(0, idx), ...pending.slice(idx + 1)];
        if (deps.rng) rollHeirChoice(prompt, deps.rng, deps.balance, save.year);
        try {
          const result = resolveRetirement(save, prompt, choice, deps);
          save = { ...save, ...result.save };
        } catch (err) {
          if (!(err instanceof LifecycleError)) throw err;
          // Live play never logs a choice it could not apply (`advanceYear` substitutes and reports
          // instead), so one in a log is a log that does not belong to this save.
          throw new SaveCorruptError(
            `action log replays an unapplicable retirement for "${choice.parentUid}": ` +
              `${err.message} — the log does not belong to this save`,
          );
        }
        break;
      }
      case "seasonStep": {
        if (deps.ecosimStep && seasonOrder.includes(action.season)) {
          const nodeStates: Record<string, NodeState> = {};
          for (const nodeId of Object.keys(save.nodeStates)) {
            const state = save.nodeStates[nodeId];
            if (!state) continue;
            // Cloned exactly as `runYearTurn` clones: `EcosimStepFn` is free to mutate and return
            // its argument, and replay's purity must not depend on which one core/ecosim.ts does.
            nodeStates[nodeId] = deps.ecosimStep(nodeId, cloneNodeState(state), action.season);
          }
          save = { ...save, nodeStates };
        }
        break;
      }
      case "gymVictory": {
        /*
         * THE ACT HALF OF L10. Before the raids moved off the calendar they rode on the `yearTurn`
         * entry, which this switch has always handled; keyed on the act (D-Q3-1) they ride on this
         * entry instead, and this case did not exist. Measured on a three-victory tape: live r4
         * ashvole 3 / cragmar 2 / recentDeaths 19 against replayed 14 / 10 / 0, with no badges and
         * act 0 — a replay that silently disagreed with the run it was replaying.
         *
         * It is `awardBadge` + `enterPendingActs`, the same two calls in the same order the live
         * path makes (`OverworldScene.winGym`), so there is no second answer to "what does a badge
         * do" here. `enterPendingActs` is idempotent through `ACT_ENTERED_FLAG`, exactly as the
         * live path relies on.
         */
        save = { ...save, ...awardBadge(save, action.gymId, deps.balance) };
        const entered = enterPendingActs(save, {
          balance: deps.balance,
          gyms: deps.gyms,
          ...(deps.yearEvents === undefined ? {} : { yearEvents: deps.yearEvents }),
        });
        save = { ...save, ...entered.save };
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      case "catch": {
        save = adjustPopulation(save, deps.balance, action.nodeId, action.lineId, -1);
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      case "release": {
        save = adjustPopulation(save, deps.balance, action.nodeId, action.lineId, +1);
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      default: {
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
    }
    applied.push({ seq: applied.length, year: entry.year, tick: entry.tick, action: entry.action });
  }

  return { ...save, actionLog: applied };
}
