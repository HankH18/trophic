/**
 * tools/checkpoints/checkpoints.ts — ACT CHECKPOINTS: the shape, and the loader that verifies one.
 *
 * WHY THIS EXISTS. Every audit of this game has had to start at `startNewGame` and play forward, so
 * act 1 is examined constantly and acts 4–6 — the league, the finale, the retirement beat, both
 * epilogues, i.e. where BOTH never-cut demo beats live — hardly at all. A checkpoint lets a test or
 * an agent begin at act N.
 *
 * ⚠ A CHECKPOINT IS A TAPE, NOT A SAVE, AND THAT IS THE WHOLE DESIGN.
 * A hand-authored save JSON proves nothing about the game: it can encode a state the rules can never
 * produce, and every test standing on it measures the fixture rather than the code. So a checkpoint
 * stores the ACTION LOG that reaches the act — locked decision L10's own artefact ("identical
 * (seed, actionLog) ⇒ byte-identical final save") — and loading one is `core/save.ts` `replay`.
 * That makes each checkpoint self-verifying: a tape that does not replay is not a reachable state,
 * and {@link loadCheckpoint} says so instead of handing back something plausible.
 *
 * ⚠ WHAT THE TAPE CANNOT CARRY, DECLARED RATHER THAN PAPERED OVER (see {@link CheckpointFile}).
 * `core/types.ts` `GameAction` is a closed union with no member for a quest flag and none for the
 * starter, so the opening beat's `story.opening.done` — act 1's whole gate in `balance.acts.gates`
 * — reaches the save through `game/dialogue-runner.ts` `applyRunFlags`, which appends nothing.
 * A checkpoint at act ≥ 1 therefore has an OFF-TAPE PRELUDE, and the prelude is CODE both the
 * generator and the loader run ({@link applyPrologue}) rather than data anybody typed: it is
 * `core/acts.ts` `setQuestFlags(prologueExitFlags(balance))` — the exact pair
 * `game/scenes/OverworldScene.ts` `openPrologue` uses to stand in for the unowned opening beat —
 * followed by the `enterPendingActs` that `advanceActs()` runs next. Nothing is hand-written; the
 * flag NAMES are read out of `data/balance.json` and appear nowhere in this file (G11).
 *
 * ⚠ AND `travel` IS APPLIED BY THE HOST, WHICH IS WHAT `applyOther` IS FOR. `replay` deliberately
 * applies no state for a `{t:"travel"}` entry — it is the tick CHARGE, not the move — so a tape
 * replayed with no host hook leaves the player standing where the run began. `ReplayDeps.applyOther`
 * is core's documented seam for exactly this ("the actions other lanes own (travel, foray, battle,
 * inn)"), and {@link travelHost} is this lane's hook for it. It is three lines and it is declared,
 * because a checkpoint that quietly mixed replay-derived state with state a loader invented would be
 * worse than one that carried neither.
 *
 * ⚠ NOTHING HERE OR IN THE GENERATOR MAY REACH A SCENE, and that is a correctness rule before it is
 * a layering one. `tests/gates/guardrails.test.ts` `no_phaser_in_node_reachable` walks every import
 * — TYPE imports included — out of every node-side tool, and `game/boot.ts` and
 * `game/scenes/YearTurnScene.ts` both reach the engine that way. Driving them would also have made a
 * checkpoint a product of the PRESENTATION layer, whose reproducibility depends on Phaser behaving
 * identically — which is the exact coupling the tape exists to avoid. So this lane imports `core/`
 * plus exactly ONE `game/` module: `game/year-replay.ts`, which imports `@core/*` and nothing else.
 * Measured: driving `core/lifecycle.ts` `advanceYear` in place of the year-turn scene reproduces
 * every checkpoint BYTE FOR BYTE (sha-256 identical), so nothing about a recorded run turned out to
 * live in the presentation layer. Two small rules — where a run starts and what it starts holding —
 * are restated here because their production homes are unreachable from a node tool; both are bound
 * byte-for-byte to `game/boot.ts` `startNewGame` by §1 of `tests/unit/act-checkpoints.test.ts`.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  actGates,
  actOf,
  badgeCount,
  firstAct,
  lastAct,
  prologueExitFlags,
  runIsComplete,
  setQuestFlags,
  unlockedNodeIds,
} from "@core/acts";
import { enterPendingActs, newOwnedCreature } from "@core/lifecycle";
import { subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import { newSave, replay, type SaveEnvelope } from "@core/save";
import { HABITAT_SENTINELS } from "@core/types";
import type { ActionLogEntry, Balance, Content, GymLeader, OwnedCreature } from "@core/types";

import { replayRegionHooks, withClockFromLog } from "@game/year-replay";
import { defaultContext } from "@core/ecosim";
import { advanceAction, type ClockActionKind, type ClockState } from "@core/clock";

export class CheckpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Where the tapes live, and what one file holds
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `fixtures/`, beside `overcatch-script.json`.
 *
 * build-doc §11 already names that file "the demo cascade as an action log — used by tests AND by
 * the demo-recording flow", so recorded player actions committed as data have a home and this is it.
 * `data/` is content the game reads at boot and these are not that; `tests/` would put them out of
 * reach of `tools/`.
 */
export const CHECKPOINT_DIR = new URL("../../fixtures/act-checkpoints/", import.meta.url);

/** The id of the checkpoint taken once the run's end condition holds. Not an act — see {@link claimOf}. */
export const RUN_COMPLETE_ID = "run-complete";

/** The prefix an act checkpoint's id carries, so `act-4` parses back to the number 4. */
const ACT_ID_PREFIX = "act-";

/**
 * One committed checkpoint.
 *
 * Deliberately holds NO expectation about badges, unlocks or the clock. Everything a checkpoint
 * CLAIMS is re-derived from `core/acts.ts` and from the tape at load time ({@link claimOf},
 * {@link loadCheckpoint}) — writing it down here as well would be two authorities on the act model,
 * and the file on disk would be the one that never turns red.
 */
export interface CheckpointFile {
  /** Member of {@link checkpointIds}. */
  id: string;
  /** The run's seed — `newSave`'s, and every subsystem stream's. */
  seed: number;
  /**
   * True when the run's opening beat has been played.
   *
   * A BOOLEAN AND NOT A FLAG LIST, on purpose. The flags themselves are `prologueExitFlags(balance)`
   * — read out of `data/balance.json` by {@link applyPrologue}, which both the generator and the
   * loader call — so a checkpoint cannot smuggle in a flag the act ladder does not ask for by
   * editing this file. What it records is only WHETHER the prelude ran.
   */
  prologue: boolean;
  /**
   * The replay tape: what the run did, in order, exactly as `core/save.ts` `appendAction` and
   * `core/lifecycle.ts` `yearTurnActions` wrote it.
   */
  tape: ActionLogEntry[];
  /** sha-256 of {@link canonicalTape}. Integrity only — the SUBSTANTIVE check is that it replays. */
  tapeDigest: string;
  /**
   * What the generator knowingly did NOT put on the tape, in prose, so a reader of the file is told
   * rather than left to infer it. Not machine-checked; {@link loadCheckpoint} verifies the state,
   * not the prose.
   */
  notOnTape: string[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * The checkpoint set — derived from the act model, never listed
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every act the region HAS, ascending, out of `balance.acts.gates`.
 *
 * Read rather than written down: adding a seventh act to data/balance.json must make the coverage
 * assertion in tests/gates/act-checkpoint-honesty.test.ts red, not leave a silent hole.
 */
export function checkpointActs(balance: Balance): number[] {
  return [...new Set(actGates(balance).map((g) => g.act))].sort((a, b) => a - b);
}

/** Every checkpoint id this content set must have: one per act, plus the finished run. */
export function checkpointIds(balance: Balance): string[] {
  return [...checkpointActs(balance).map((a) => `${ACT_ID_PREFIX}${String(a)}`), RUN_COMPLETE_ID];
}

/** What a checkpoint id claims about the save it loads to. Both halves come from `core/acts.ts`. */
export interface CheckpointClaim {
  /** What `core/acts.ts` `actOf` must answer. */
  act: number;
  /** What `core/acts.ts` `runIsComplete` must answer. */
  runComplete: boolean;
}

/**
 * The claim behind an id.
 *
 * `run-complete` claims the LAST act because that is what `actOf` answers for a save that has beaten
 * every leader: no gate above `lastAct` exists, so the act cannot rise further and the run's ending
 * is a separate condition (`runIsComplete`), not a seventh rung.
 */
export function claimOf(id: string, balance: Balance): CheckpointClaim {
  if (id === RUN_COMPLETE_ID) return { act: lastAct(balance), runComplete: true };
  if (!id.startsWith(ACT_ID_PREFIX)) {
    throw new CheckpointError(`"${id}" is not a checkpoint id — expected one of ${checkpointIds(balance).join(", ")}`);
  }
  const act = Number.parseInt(id.slice(ACT_ID_PREFIX.length), 10);
  if (!checkpointActs(balance).includes(act)) {
    throw new CheckpointError(
      `checkpoint "${id}" names act ${String(act)}, which data/balance.json's act ladder does not have`,
    );
  }
  return { act, runComplete: false };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The initial save, and the off-tape prelude
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Where a new run stands — `game/boot.ts` `startNodeId`'s rule, restated here and BOUND BY A TEST.
 *
 * ⚠ WHY IT IS RESTATED RATHER THAN IMPORTED, WHICH IS THE ONLY INTERESTING THING ABOUT IT.
 * `game/boot.ts` type-imports `OverworldScene` and `SurveyScene`, and `tests/gates/guardrails.test.ts`
 * `no_phaser_in_node_reachable` walks type imports as well as value ones — correctly, because a
 * type import is the same dependency one edit away from throwing. So a module under `tools/` may not
 * name `game/boot.ts` at all, and this lane may not edit `game/`. Six lines of content lookup is the
 * cheapest honest resolution, and the SECOND reader is bound to the first: §1 of
 * `tests/unit/act-checkpoints.test.ts` drives the real `startNewGame` through a MemoryStorage-backed
 * registry and requires `serialize` equality with what {@link checkpointInitialSave} builds. If boot
 * changes how a run is seeded, that test reddens; it cannot drift in silence.
 */
export function startNodeOf(content: Content): string {
  const firstGym = content.gyms[0];
  if (firstGym && content.nodes.some((n) => n.id === firstGym.town)) return firstGym.town;
  const firstNode = content.nodes[0];
  if (firstNode) return firstNode.id;
  throw new CheckpointError("content has no nodes — there is nowhere for a run to start");
}

/**
 * The habitat sentinel the three starter lines carry — bible §4 rows 1–3, "not wild-spawning;
 * obtained from Warden Maren". `core/types.ts` `HABITAT_SENTINELS` declares the vocabulary and
 * `game/wild-battle.ts` `starterLines` is the authority on which member means this; the membership
 * is CHECKED rather than trusted, so a rename in core reddens on import instead of silently
 * selecting no lines and leaving every checkpoint with an empty party.
 */
const STARTER_HABITAT = "starter";
if (!(HABITAT_SENTINELS as readonly string[]).includes(STARTER_HABITAT)) {
  throw new CheckpointError(
    `core/types.ts HABITAT_SENTINELS no longer carries "${STARTER_HABITAT}" — the starter lines ` +
      `cannot be found, and tools/checkpoints must be re-pointed at whatever replaced it`,
  );
}

/**
 * The stand-in starter a new run is handed — `game/wild-battle.ts` `provisionalStarter`'s rule,
 * restated here for the same reason {@link startNodeOf} is, and bound by the same test.
 *
 * ⚠ WHY IT IS NOT IMPORTED. `game/wild-battle.ts` is engine-free, but it type-imports
 * `game/encounters.ts`, which imports the map layouts as `"…/r1.txt?raw"` — and
 * `tests/gates/guardrails.test.ts` cannot RESOLVE a `?raw` specifier, so a node-side tool reaching
 * it makes that gate's walk report unresolved specifiers and refuse to call its own clean result
 * meaningful. That is the gate working: a walk that stopped early must not read as a clean one.
 * `game/` is not this lane's to edit, so the rule is restated and BOUND — §1 of
 * `tests/unit/act-checkpoints.test.ts` drives the real `game/boot.ts` `startNewGame` and requires
 * `serialize` equality with {@link checkpointInitialSave}, uid, level, age and traits included.
 *
 * The rule, from `provisionalStarter`'s own doc: the FIRST starter line in data order (no choice is
 * simulated), at `balance.xp.starterLevel`, age J, no traits — the player is handed it, not caught
 * in the grass. No number here is a literal (G11); every one is read off balance.
 */
export function provisionalStarterOf(content: Content): OwnedCreature | null {
  const line = content.species.filter((l) => l.habitat.includes(STARTER_HABITAT))[0];
  if (!line) return null;
  return newOwnedCreature(
    {
      // The uid `game/wild-battle.ts` PROVISIONAL_STARTER_UID declares. Written once here and
      // proven equal by the byte-identity test above rather than imported through the `?raw` graph.
      uid: "provisional-starter",
      lineId: line.id,
      age: "J",
      level: content.balance.xp.starterLevel,
      caughtYear: content.balance.clock.startYear,
    },
    line,
    content.balance,
  );
}

/**
 * The save a run BEGINS from — the one `replay` is handed.
 *
 * Three inputs, all `game/boot.ts` `startNewGame`'s: the seed, {@link startNodeOf} and
 * {@link provisionalStarterOf}. `tests/unit/act-checkpoints.test.ts` §1 binds the whole result to
 * the real `startNewGame`, byte for byte.
 *
 * ⚠ THE STARTER IS PART OF ESTABLISHING THE RUN, NOT PART OF THE TAPE. `core/types.ts` `GameAction`
 * has no `starter` member (`core/save.ts` `applyStarterChoice` says so and `game/dialogue-runner.ts`
 * `applyRunStarter` logs when the premise breaks), so the party a checkpoint loads with is the
 * PROVISIONAL starter — never a chosen one. A checkpoint cannot honestly carry the opening beat's
 * choice until that union member exists.
 */
export function checkpointInitialSave(content: Content, seed: number): SaveEnvelope {
  const starter = provisionalStarterOf(content);
  return newSave(
    {
      seed,
      currentNode: startNodeOf(content),
      nodes: content.nodes,
      ...(starter ? { party: [starter] } : {}),
    },
    content.balance,
  );
}

/**
 * The opening beat, applied OFF the tape because no `GameAction` can carry it.
 *
 * Both calls are the production ones, in the production order:
 *   • `setQuestFlags(save, prologueExitFlags(balance))` is what `game/scenes/OverworldScene.ts`
 *     `openPrologue` does while no lane owns the opening beat — the flags come out of
 *     `balance.acts.gates`, so no flag name is spelled here (G11);
 *   • `enterPendingActs` is what `advanceActs()` runs immediately after, and it is what applies an
 *     act's entry scripts. Skipping it would leave `story.actEntered` unset, and the run's first
 *     `gymVictory` would then enter — and re-apply the scripts of — every act below it at once.
 *
 * Shared by the generator and the loader so there is one implementation of the prelude, which is
 * what keeps a loaded checkpoint equal to the run the generator drove.
 */
export function applyPrologue(
  save: SaveEnvelope,
  gyms: readonly GymLeader[],
  balance: Balance,
): SaveEnvelope {
  const flagged = setQuestFlags(save, prologueExitFlags(balance));
  return { ...flagged, ...enterPendingActs(flagged, { balance, gyms }).save };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Replay wiring — the season step, and the one host hook
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The `applyOther` a host must supply for `travel` to mean anything on the replay path.
 *
 * `core/save.ts` `replay` treats `{t:"travel"}` as the tick charge and applies no state for it, so a
 * tape replayed with no hook rebuilds a run standing wherever it began. `ReplayDeps.applyOther` is
 * the documented seam — "the actions other lanes own (travel, foray, battle, inn)" — and this is the
 * whole of what this lane does with it: the move, and nothing else.
 *
 * ⚠ IT IS NOT `enterNode`. The live shell's arrival does more than set a field (interiors, props,
 * the encounter mask), none of which is save state a checkpoint claims. What IS claimed is
 * `currentNode`, and the generator refuses to emit a checkpoint whose replay disagrees with the run
 * it drove — so this hook being wrong is a red generator, not a quiet checkpoint.
 */
export function travelHost(save: SaveEnvelope, entry: ActionLogEntry): SaveEnvelope {
  const action = entry.action;
  if (action.t !== "travel") return save;
  const to = (action as { to?: unknown }).to;
  if (typeof to !== "string" || to.length === 0) return save;
  return { ...save, currentNode: to };
}

/** The clock a run starts on — `balance.clock`'s own, never a literal (G11). */
export function startClock(balance: Balance): ClockState {
  return { year: balance.clock.startYear, tick: balance.clock.startTick, subTick: 0 };
}

/**
 * The `GameAction` tags that cost time — build-doc §3 L8's four costing actions.
 *
 * A `Record<ClockActionKind, true>` and NOT an `||` chain, for the reason `game/year-replay.ts`
 * `TICK_COSTING` gives in full: `battle` once joined `ClockActionKind` while a three-way `===` chain
 * stayed green, and every logged fight was then priced at zero on the replay path. A Record turns
 * this file red until a new member is listed. The COSTS are never named here; `advanceAction` reads
 * them out of `balance.clock` (G11).
 */
const TICK_COSTING: Record<ClockActionKind, true> = { travel: true, foray: true, inn: true, battle: true };
const TICK_COSTING_TAGS: ReadonlySet<string> = new Set(Object.keys(TICK_COSTING));

/**
 * Whether the tape's own `{year, tick, subTick}` stamps are what TODAY's `balance.clock` says they
 * would be — or the first place they are not.
 *
 * ⚠ THIS IS THE CHECK THAT CATCHES A RETUNED METER, AND IT HAD TO BE WRITTEN BECAUSE THE OBVIOUS
 * ONE DOES NOT. `game/year-replay.ts` `clockFromLog` RE-ESTABLISHES the clock from each entry's own
 * stamp before advancing it — "the clock is re-established from the entry itself and then advanced
 * by the REAL transition" — which is right for its job and means it cannot notice that the stamps
 * disagree with the prices. Measured: raising `balance.clock.ticksPerYear` by one leaves every
 * checkpoint loading cleanly through `replay` + `withClockFromLog`, even though the recorded run's
 * year turn happened at a tick the retuned meter would never have ended a year on — a tape that the
 * rules can no longer produce, loading in silence. So the stamps are ACCUMULATED here instead:
 * start at `startClock`, and require each costing entry to carry the clock the previous ones left.
 *
 * A year turn needs no clause of its own. `advanceAction` returns a clock already in the new year
 * carrying the fraction that straddled the boundary, and `core/save.ts` `appendYearTurn` +
 * `finishYearTurn` put exactly that back — so the accumulated clock and the tape stay in step across
 * the turn without this function modelling the turn at all.
 */
export function tapeClockProblem(tape: readonly ActionLogEntry[], balance: Balance): string | null {
  let clock = startClock(balance);
  for (const entry of tape) {
    const t = entry.action.t;
    if (!TICK_COSTING_TAGS.has(t)) continue;
    const stamp = { year: entry.year, tick: entry.tick, subTick: entry.subTick ?? 0 };
    if (stamp.year !== clock.year || stamp.tick !== clock.tick || stamp.subTick !== clock.subTick) {
      return (
        `entry ${String(entry.seq)} ("${t}") is stamped year ${String(stamp.year)} tick ` +
        `${String(stamp.tick)}.${String(stamp.subTick)}, but the actions before it spend to year ` +
        `${String(clock.year)} tick ${String(clock.tick)}.${String(clock.subTick)} under this ` +
        `build's balance.clock`
      );
    }
    clock = advanceAction(clock, t as ClockActionKind, balance).clock;
  }
  return null;
}

/**
 * Replay a tape onto an initial save the way the shipped shell would.
 *
 * `replayRegionHooks` because `replay` hands out a PER-NODE season step while the live shell steps
 * the whole REGION in one call, and those are not the same computation (`game/year-replay.ts` has
 * the measured 17-population divergence). `withClockFromLog` because `replay` models no clock at all
 * and every entry carries the `{year, tick, subTick}` it was taken at.
 */
export function replayTape(
  initial: SaveEnvelope,
  tape: readonly ActionLogEntry[],
  content: Content,
): SaveEnvelope {
  const balance = content.balance;
  const simTag = balance.rng.subsystemTags[1];
  if (simTag === undefined) {
    throw new CheckpointError(
      "balance.rng.subsystemTags has no sim stream — the season step cannot be replayed",
    );
  }
  const hooks = replayRegionHooks({
    content,
    simRng: subsystemRng(initial.seed, simTag),
    initialStates: initial.nodeStates,
    context: defaultContext(),
    applyOther: travelHost,
  });
  const replayed = replay(initial, tape, {
    species: content.species,
    gyms: content.gyms,
    balance,
    nodes: content.nodes,
    ecosimStep: hooks.ecosimStep,
    applyOther: hooks.applyOther,
  });
  return withClockFromLog(replayed, startClock(balance), tape, balance);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Serialising a checkpoint
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The tape as bytes, for the digest.
 *
 * `JSON.stringify` over the entries alone, with keys written in a fixed order rather than trusted to
 * insertion order, so the digest is a fact about the tape and not about which build wrote the file.
 */
export function canonicalTape(tape: readonly ActionLogEntry[]): string {
  return JSON.stringify(
    tape.map((e) => ({
      seq: e.seq,
      year: e.year,
      tick: e.tick,
      subTick: e.subTick ?? 0,
      action: sortKeys(e.action) as unknown,
    })),
  );
}

/** Deep key-sort, so two structurally equal actions hash the same. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = sortKeys((value as Record<string, unknown>)[key]);
  }
  return out;
}

export function tapeDigest(tape: readonly ActionLogEntry[]): string {
  return createHash("sha256").update(canonicalTape(tape)).digest("hex");
}

/** The path a checkpoint id is stored at. */
export function checkpointPath(id: string): URL {
  return new URL(`${id}.json`, CHECKPOINT_DIR);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Loading — and refusing
 * ──────────────────────────────────────────────────────────────────────────── */

export interface LoadedCheckpoint {
  /** The save a caller starts from: replay-derived, with the clock its own tape says the run ended on. */
  save: SaveEnvelope;
  /** The file as committed. */
  file: CheckpointFile;
  /** What `core/acts.ts` says about {@link save}, recomputed — never read off the file. */
  claim: CheckpointClaim;
  /** Every node `core/acts.ts` `unlockedNodeIds` opens at this act. */
  unlockedNodes: string[];
  /** How many of the region's leaders this save has beaten, per `core/acts.ts` `badgeCount`. */
  badges: number;
  /** Human-readable provenance — which parts are replay-derived and which are not. */
  provenance: string[];
}

function readFile(id: string): unknown {
  const path = checkpointPath(id);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (err) {
    throw new CheckpointError(
      `checkpoint "${id}" could not be read from ${path.pathname}: ` +
        `${err instanceof Error ? err.message : String(err)} — run \`npx tsx tools/checkpoints/generate.ts\``,
    );
  }
}

/**
 * Shape-check the file. Deliberately strict about the frame and permissive about an ACTION's
 * payload, exactly as `core/schemas.ts` `zSaveFileFor` is: the tape's entries are produced and
 * consumed by `core/`, and pinning the `GameAction` union here would make every lane that adds an
 * action edit this file. What is pinned is what makes an entry dispatchable at all — a non-empty
 * `t` — because `replay` cannot do anything with an entry that lacks one.
 */
function parseFile(id: string, raw: unknown): CheckpointFile {
  const bad = (why: string): never => {
    throw new CheckpointError(`checkpoint "${id}" is not a checkpoint file: ${why}`);
  };
  if (raw === null || typeof raw !== "object") return bad("it is not an object");
  const o = raw as Record<string, unknown>;
  if (o["id"] !== id) return bad(`its "id" is ${JSON.stringify(o["id"])}, not "${id}"`);
  if (typeof o["seed"] !== "number" || !Number.isSafeInteger(o["seed"])) return bad(`"seed" is not an integer`);
  if (typeof o["prologue"] !== "boolean") return bad(`"prologue" is not a boolean`);
  if (typeof o["tapeDigest"] !== "string" || o["tapeDigest"].length === 0) return bad(`"tapeDigest" is missing`);
  if (!Array.isArray(o["tape"])) return bad(`"tape" is not an array`);
  if (!Array.isArray(o["notOnTape"]) || o["notOnTape"].some((s) => typeof s !== "string")) {
    return bad(`"notOnTape" is not a list of strings`);
  }
  const tape: ActionLogEntry[] = [];
  for (const [i, entry] of (o["tape"] as unknown[]).entries()) {
    if (entry === null || typeof entry !== "object") return bad(`tape entry ${String(i)} is not an object`);
    const e = entry as Record<string, unknown>;
    const action = e["action"];
    if (action === null || typeof action !== "object") return bad(`tape entry ${String(i)} has no action`);
    const t = (action as Record<string, unknown>)["t"];
    if (typeof t !== "string" || t.length === 0) {
      return bad(`tape entry ${String(i)}'s action has no "t" discriminant — nothing can replay it`);
    }
    if (typeof e["seq"] !== "number" || typeof e["year"] !== "number" || typeof e["tick"] !== "number") {
      return bad(`tape entry ${String(i)} is missing seq/year/tick`);
    }
    tape.push({
      seq: e["seq"],
      year: e["year"],
      tick: e["tick"],
      subTick: typeof e["subTick"] === "number" ? e["subTick"] : 0,
      action: action as ActionLogEntry["action"],
    });
  }
  return {
    id,
    seed: o["seed"],
    prologue: o["prologue"],
    tape,
    tapeDigest: o["tapeDigest"],
    notOnTape: o["notOnTape"] as string[],
  };
}

export interface LoadOptions {
  /** Overrides the shipped content — the balance harness passes a retuned bundle. */
  content?: Content;
}

/**
 * Load the checkpoint `id` and hand back the save it reaches — VERIFYING as it goes.
 *
 * Six refusals, in order, and none of them is decorative:
 *   1. the file is a checkpoint file at all (shape);
 *   2. its tape hashes to the digest it carries — an edited tape is not the artefact the generator
 *      produced, whatever it happens to replay to;
 *   3. the tape's own clock stamps are what THIS build's `balance.clock` prices would produce
 *      ({@link tapeClockProblem}) — the check that catches a retuned meter, which `replay` and
 *      `withClockFromLog` between them do not;
 *   4. `replay` accepts it. This is the substantive one: `replay` refuses a log whose `seq` is not
 *      gapless, whose year turn lands in the wrong year, whose retirement has no pending prompt, and
 *      whose catch names a node or a line the save does not carry. A tape that is not a state the
 *      rules can produce dies here;
 *   5. `game/year-replay.ts` `withClockFromLog` agrees with the replayed year;
 *   6. `core/acts.ts` says the loaded save is at the act the id claims, and that the run is finished
 *      exactly when the id says it is. Recomputed here, never read off the file.
 */
export function loadCheckpoint(id: string, opts: LoadOptions = {}): LoadedCheckpoint {
  const content = opts.content ?? validateContent();
  const balance = content.balance;
  const claim = claimOf(id, balance);

  const file = parseFile(id, readFile(id));

  const digest = tapeDigest(file.tape);
  if (digest !== file.tapeDigest) {
    throw new CheckpointError(
      `checkpoint "${id}" has been edited since it was generated: its tape hashes to ${digest} but ` +
        `the file claims ${file.tapeDigest}. A checkpoint is a recording of a run, not a state to ` +
        `hand-write — regenerate it with \`npx tsx tools/checkpoints/generate.ts\`.`,
    );
  }

  const clockProblem = tapeClockProblem(file.tape, balance);
  if (clockProblem !== null) {
    throw new CheckpointError(
      `checkpoint "${id}" no longer replays: its recorded clock and this build's balance.clock ` +
        `disagree — ${clockProblem}. The tape is a run that happened under different tick prices; ` +
        `regenerate it with \`npx tsx tools/checkpoints/generate.ts\`.`,
    );
  }

  const initial = checkpointInitialSave(content, file.seed);
  const based = file.prologue ? applyPrologue(initial, content.gyms, balance) : initial;

  let save: SaveEnvelope;
  try {
    save = replayTape(based, file.tape, content);
  } catch (err) {
    throw new CheckpointError(
      `checkpoint "${id}" no longer replays: ${err instanceof Error ? err.message : String(err)}. ` +
        `The tape is ${String(file.tape.length)} recorded actions; either a rule changed under it ` +
        `or the file was edited. Regenerate it and read the diff — a checkpoint that cannot be ` +
        `rebuilt from the rules is not a reachable state.`,
    );
  }

  const act = actOf(save, content.gyms, balance);
  if (act !== claim.act) {
    throw new CheckpointError(
      `checkpoint "${id}" replays to act ${String(act)}, not the act ${String(claim.act)} it is ` +
        `named for (badges: ${String(badgeCount(save, content.gyms, balance))}/${String(content.gyms.length)}). ` +
        `core/acts.ts is the authority; the file is not.`,
    );
  }
  const complete = runIsComplete(save, content.gyms, balance);
  if (complete !== claim.runComplete) {
    throw new CheckpointError(
      `checkpoint "${id}" replays to runIsComplete=${String(complete)}, but its id claims ` +
        `${String(claim.runComplete)}`,
    );
  }

  return {
    save,
    file,
    claim,
    unlockedNodes: unlockedNodeIds(act, balance),
    badges: badgeCount(save, content.gyms, balance),
    provenance: [
      `replay-derived: party, box, bag, money, questFlags, nodeStates — core/save.ts replay() over ` +
        `${String(file.tape.length)} recorded actions`,
      `replay-derived: year/tick/subTick — game/year-replay.ts withClockFromLog, read back off the tape`,
      `host-applied: currentNode — replay applies no state for {t:"travel"}; tools/checkpoints ` +
        `travelHost is the ReplayDeps.applyOther hook core provides for it`,
      file.prologue
        ? `NOT on the tape: the opening beat. core/acts.ts prologueExitFlags + enterPendingActs were ` +
          `applied to the INITIAL save, because GameAction carries no flag member`
        : `NOT applied: the opening beat — this checkpoint is the prologue act`,
      ...file.notOnTape.map((s) => `NOT on the tape: ${s}`),
    ],
  };
}

/** Every committed checkpoint, loaded and verified. Throws on the first one that is not honest. */
export function loadAllCheckpoints(opts: LoadOptions = {}): LoadedCheckpoint[] {
  const content = opts.content ?? validateContent();
  return checkpointIds(content.balance).map((id) => loadCheckpoint(id, { content }));
}

/** The prologue act — the one checkpoint whose `prologue` is false. Read, never written down. */
export function prologueCheckpointId(balance: Balance): string {
  return `${ACT_ID_PREFIX}${String(firstAct(balance))}`;
}
