/**
 * game/year-replay.ts — replaying a run the SHELL produced through core/save.ts `replay`.
 *
 * build-doc §8.1 / locked decision L10: "identical (seed, actionLog) ⇒ byte-identical final save."
 * `core/save.ts` `replay` is the implementation of that claim, and it takes two things from its
 * caller that the shell has to supply carefully or the claim is false for the path the game actually
 * takes. This module is those two things, and nothing else — no rule of core's is restated here.
 *
 * 1. THE SEASON STEP. `replay` hands out a PER-NODE `ecosimStep` hook (its own `seasonStep` case, and
 *    `runYearTurn`'s step 5), while the live shell steps the whole REGION in one call
 *    (`stepRegionStates`, see game/scenes/YearTurnScene.ts `driveYearTurn`). Those are not the same
 *    computation: region stepping costs the parent stream exactly ONE draw for the whole region
 *    (which is what makes adding a node not move every other node's trajectory — INV-2)
 *    and it lets Ancient presence effects reach across adjacent nodes. Measured
 *    with the obvious per-node hook: 17 population counts across 6 nodes differed from the live run
 *    after ONE year turn. {@link replayRegionHooks} steps the region once per season and serves each
 *    node from that step, which reproduces the live numbers exactly.
 *
 * 2. THE CLOCK. `replay` does not model it at all: travel, foray, inn and battle move no tick on the
 *    replay path, and the `yearTurn` case takes `runYearTurn`'s reset (`balance.clock.startTick`). The live
 *    shell puts back the tick the clock carried into the new year (game/scenes/YearTurnScene.ts
 *    `finishYearTurn`), so an inn taken on the last tick of a year left the live save on tick 1 and
 *    its own replay on tick 0. The information was never missing — every `ActionLogEntry` carries the
 *    `{year, tick}` it was taken at, and the actions that cost ticks are named in `balance.clock` —
 *    so {@link clockFromLog} reads it back out of the log rather than the shell logging it twice.
 *
 * Engine-free (`import type` only for nothing at all — there is no engine reference here), so a node
 * test can drive a whole run through it.
 */

import type { ClockActionKind, ClockState } from "@core/clock";
import { advanceAction } from "@core/clock";
import type { SimContext } from "@core/ecosim";
import { stepRegionStates } from "@core/ecosim";
import type { EcosimStepFn } from "@core/lifecycle";
import type { Rng } from "@core/rng";
import type { SaveEnvelope } from "@core/save";
import type { ActionLogEntry, Balance, Content, NodeState, Season } from "@core/types";

export class YearReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YearReplayError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. The season step — a region step served per node
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReplayRegionDeps {
  content: Content;
  /**
   * The `sim` stream rebuilt from the save's seed at draw 0 — the same stream, at the same position,
   * the live run opened. Region stepping draws from it exactly once per season step.
   */
  simRng: Rng;
  /** The node states the run STARTED from (`initial.nodeStates`) — the mirror's first reading. */
  initialStates: Readonly<Record<string, NodeState>>;
  /**
   * The same `SimContext` the live run used, if it held one. Omitted ⇒ `stepRegionStates`'s own
   * default, which is what a live shell that never built one also gets.
   */
  context?: SimContext;
  /** Chained after the mirror is refreshed — the game reducer's own `applyOther`, if it has one. */
  applyOther?: (save: SaveEnvelope, entry: ActionLogEntry) => SaveEnvelope;
}

export interface ReplayRegionHooks {
  /** Pass as `ReplayDeps.ecosimStep`. */
  ecosimStep: EcosimStepFn;
  /**
   * Pass as `ReplayDeps.applyOther`. NOT optional in practice: it is how the mirror learns about
   * population changes made outside the season step (a catch, a release, and — through the first
   * tick-spending action after it — a year turn's scripted raid). Replaying with the `ecosimStep`
   * below and someone else's `applyOther` steps the region from stale counts.
   */
  applyOther: (save: SaveEnvelope, entry: ActionLogEntry) => SaveEnvelope;
  /** Region steps run so far — one per season, NOT one per node. */
  regionSteps(): number;
  /** Force the mirror to a set of states. `applyOther` does this for you on every logged action. */
  sync(states: Readonly<Record<string, NodeState>>): void;
}

/**
 * Hooks that make `replay` step the region exactly as the live shell did.
 *
 * ⚠ THE MIRROR. `replay`'s hook is asked one node at a time, but a region step needs every node's
 * current state before it can produce any of them. So this keeps a full copy of the region, steps it
 * once when a batch begins, and serves the rest of the batch out of that step. A batch ends when a
 * node is asked for twice, or when the season changes — which is exactly how `runYearTurn` and
 * `replay`'s `seasonStep` case iterate.
 *
 * The mirror is only as good as what it is told, which is what {@link ReplayRegionHooks.applyOther}
 * is for: catches and releases move counts between season steps, and `replay` calls `applyOther`
 * with the save after each one. A year turn's scripted raid changes counts without an `applyOther`
 * call of its own — it is picked up by the next logged action, and a year turn is always followed by
 * one before the next season boundary can be reached, because reaching it costs ticks.
 */
export function replayRegionHooks(deps: ReplayRegionDeps): ReplayRegionHooks {
  const { content, simRng } = deps;
  let mirror: Record<string, NodeState> = { ...deps.initialStates };
  let batch: Record<string, NodeState> | null = null;
  let batchSeason: Season | null = null;
  const served = new Set<string>();
  let steps = 0;

  const startBatch = (nodeId: string, state: NodeState, season: Season): void => {
    // The state replay just handed us is authoritative for its own node; the rest of the region
    // comes from the mirror.
    mirror = { ...mirror, [nodeId]: state };
    const result = stepRegionStates(content.nodes, mirror, season, simRng, deps.context);
    batch = result.states;
    batchSeason = season;
    mirror = { ...mirror, ...result.states };
    served.clear();
    steps += 1;
  };

  return {
    ecosimStep: (nodeId, state, season) => {
      if (batch === null || batchSeason !== season || served.has(nodeId)) {
        startBatch(nodeId, state, season);
      }
      served.add(nodeId);
      const stepped = batch?.[nodeId];
      if (!stepped) {
        throw new YearReplayError(
          `the log's save carries node "${nodeId}", which data/nodes/ does not — its season step ` +
            "could not run, and serving it back unstepped would replay an ecology that stood still",
        );
      }
      return stepped;
    },
    applyOther: (save, entry) => {
      mirror = { ...save.nodeStates };
      batch = null;
      return deps.applyOther ? deps.applyOther(save, entry) : save;
    },
    regionSteps: () => steps,
    sync: (states) => {
      mirror = { ...states };
      batch = null;
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. The clock — read back out of the log
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The `GameAction` tags that are also `ClockActionKind`s — build-doc §3 L8's four costing actions
 * (travel 1 / foray 1 / inn 2 / battle 0.5). The COSTS are never named here; they are
 * `balance.clock`'s and are read by `advanceAction` (G11).
 *
 * ⚠ A `Record<ClockActionKind, …>` AND NOT AN `||` CHAIN, and that is the whole repair. `battle`
 * joined `ClockActionKind`, `GameAction` and `balance.clock` and this function — then a chain of
 * three `===` comparisons — stayed green, so every logged fight was priced at ZERO on the replay
 * path. Measured on a tape of 51 forays and three battles: live `year 2 tick 0 subTick 1`,
 * rebuilt-from-the-log `year 1 tick 51 subTick 0`, and `withClockFromLog` then threw "the log does
 * not belong to this save" about a log that did. A wrong YEAR, not a wrong tick, on the tape L10
 * and build-doc §8.1 promise replays byte-identically. `core/clock.ts` says adding a member to
 * `ClockActionKind` is "deliberately noisy" — this Record is what makes that true HERE too: a new
 * member turns this file red until it is listed, which the `||` chain could never do.
 */
const TICK_COSTING: Record<ClockActionKind, true> = {
  travel: true,
  foray: true,
  inn: true,
  battle: true,
};

/** The same keys at runtime, so the list above is the only place the four are written down. */
const TICK_COSTING_TAGS: ReadonlySet<string> = new Set(Object.keys(TICK_COSTING));

/** The clock kind a logged action is charged as, or null for the ones that cost no time. */
function tickCostKind(action: ActionLogEntry["action"]): ClockActionKind | null {
  // The cast is guarded by the set, whose members ARE `ClockActionKind` by `TICK_COSTING`'s type.
  return TICK_COSTING_TAGS.has(action.t) ? (action.t as ClockActionKind) : null;
}

/**
 * The clock a logged run ended on, rebuilt from the log alone.
 *
 * Every entry carries the `{year, tick}` it was taken at, so the clock is re-established from the
 * entry itself and then advanced by the REAL transition (`advanceAction`) — no tick arithmetic of
 * this module's own, and no second home for L8's costs. A `yearTurn` entry only moves the clock when
 * the tick-spending action before it did not already carry it into the new year, which is the gym
 * victory case (build-doc §4's other trigger, which spends no ticks).
 *
 * This is what makes `finishYearTurn`'s carry recoverable: it is not extra state the shell invented,
 * it is the consequence of the last action in the log.
 */
export function clockFromLog(
  initial: ClockState,
  log: readonly ActionLogEntry[],
  balance: Balance,
): ClockState {
  let clock: ClockState = { ...initial };
  for (const entry of log) {
    const kind = tickCostKind(entry.action);
    if (kind !== null) {
      clock = advanceAction({ year: entry.year, tick: entry.tick, subTick: entry.subTick ?? 0 }, kind, balance).clock;
      continue;
    }
    if (entry.action.t === "yearTurn" && clock.year < entry.action.year) {
      clock = { year: entry.action.year, tick: balance.clock.startTick, subTick: 0 };
    }
  }
  return clock;
}

/**
 * A replayed save standing on the clock its own log says the run ended on.
 *
 * `replay` reproduces everything except the meter, and the meter is in the log. Throws rather than
 * silently disagreeing if the log's clock and the replayed save land in different YEARS — that is a
 * log that does not belong to this save, and it is the same failure `replay` itself refuses on.
 */
export function withClockFromLog(
  replayed: SaveEnvelope,
  initial: ClockState,
  log: readonly ActionLogEntry[],
  balance: Balance,
): SaveEnvelope {
  const clock = clockFromLog(initial, log, balance);
  if (clock.year !== replayed.year) {
    throw new YearReplayError(
      `the action log's clock ends in year ${String(clock.year)} but replaying it produced a save ` +
        `in year ${String(replayed.year)} — the log does not belong to this save`,
    );
  }
  // `subTick` carried too: dropping it silently refunded the fraction of a tick a half-cost action
  // had already spent, so a run containing an odd number of battles came back from a reload with
  // time it had used. The whole clock position is restored, not two thirds of it.
  return { ...replayed, year: clock.year, tick: clock.tick, subTick: clock.subTick };
}
