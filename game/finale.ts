/**
 * game/finale.ts — the last thirty seconds of the demo, which had no writer.
 *
 * ══ WHY THIS FILE EXISTS ══
 * `data/dialogue.json`'s two epilogues gate on `story.vellsire.resolved` and read
 * `story.vellsire.outcome`. Measured: both keys appeared in exactly three shipped files and all
 * three mentions were COMMENTS (`core/quests.ts`, `game/quests.ts`, `core/dialogue-schema.ts`),
 * each naming the gap as declared. The only places either key was ever WRITTEN were tests, which set
 * it by hand and then asserted the epilogue fires. It does fire. Nothing in the game ever set it —
 * so a 2095-test green suite certified a dead finale, on build-doc §16's never-cut Vellsire beat.
 *
 * ══ WHO WRITES WHAT, AND WHY IT IS SPLIT ══
 * `sanctum.vellsire.approach` offers two choices and they are not the same KIND of choice:
 *
 *   • **Stand aside** is complete the instant it is taken. Nothing is rolled and nothing can fail,
 *     so the entry records the whole resolution itself in `setFlags` — `story.vellsire.attempt`,
 *     `story.vellsire.resolved` and `story.vellsire.outcome` — and the released epilogue is eligible
 *     on the very next `playPendingCutscene()`. That is the corpus writing its own flags, which is
 *     this project's standing rule (ruling D-a) and needs no code at all.
 *   • **Set the snare** cannot be resolved by the entry, because the outcome is a BATTLE's. The
 *     entry records only the attempt; this module runs the fight and writes the outcome.
 *
 * So each key has exactly one authority per branch, and neither branch can silently not happen.
 *
 * ══ THE ENCOUNTER IS SCRIPTED, AND THAT IS WHAT KEEPS G3 INTACT ══
 * The stag is built HERE, directly, in the `game/gym-battle.ts` shape — it is NOT rolled through
 * `game/encounters.ts`' derived weight table. bible §8's finale is a meeting in the ring, not a
 * foray, and routing it through the weight table would have made the never-cut beat depend on a
 * roll against a line the encounter layer deliberately holds at zero until the finale is earned
 * (`balance.encounter.finaleGatedNode`). Nothing here is a second encounter table: there is one
 * individual, of the one Ancient line the gated node actually carries, read out of the node's own
 * populations.
 *
 * ══ WHAT IT IS NOT ALLOWED TO BE ══
 * • **No catch arithmetic.** `core/battle.ts` decides whether a snare holds (`balance.catch
 *   .baseCatchAncient`, bible §4's "very hard catches") and reports it through `caughtIndividual`;
 *   the population write is `game/wild-battle.ts` `applyCatchToSave` → `core/ecosim.ts` `applyCatch`,
 *   the same function `core/save.ts`'s replay reaches, so the live path and the replay path move the
 *   count identically.
 * • **No species id, no node id, no line id typed in (G2/G11).** The node is
 *   `balance.encounter.finaleGatedNode`; the line is whichever `ancient` species has a population
 *   there. Both are read, never named.
 * • **No engine.** No Phaser import; the whole resolution runs in a node test with no DOM.
 * • **No `Math.random` (G11).** The stag is built off an injected `core/rng.ts` stream.
 *
 * ══ A DECLARED DEVIATION: A FAILED SNARE RESOLVES AS RELEASED ══
 * bible §4 makes Ancients very hard catches, so a snare that does not hold is the COMMON outcome.
 * Every non-catch end of the fight — a failed snare, a fled fight, a fainted party, even a defeated
 * stag — resolves as `released`: the animal is out there and the coefficient applies, which is
 * exactly what `maren.epilogue.released` says. A third terminal state would need a third full
 * epilogue on the most-watched beat in the demo. The alternative is a finale that can end with
 * nothing written, which is the defect this module exists to remove.
 */

import { runCompleteFlag } from "../core/acts";
import type { CaughtIndividual, BattleContext } from "../core/battle";
import { makeBattleContext, predationOracleFromWebs } from "../core/battle";
import { deriveFoodWeb, indexSpecies, toEcoNode, type EcoNode } from "../core/foodweb";
import { fromNodeState, projectRegion, toNodeState } from "../core/ecosim";
import type { Rng } from "../core/rng";
import type { SaveEnvelope } from "../core/save";
import {
  AGE_CLASSES,
  type AgeClass,
  type Balance,
  type BattleInput,
  type BattlerSpec,
  type BattleState,
  type Content,
  type NodeState,
  type Season,
  type SpeciesLine,
} from "../core/types";
import type { FlagValue } from "../core/dialogue-schema";
import { rollLevel } from "./encounters";
import {
  applyCatchToSave,
  liveNodeOf,
  partyProblem,
  partySpecs,
  rollWildTraits,
  type CatchApplication,
} from "./wild-battle";

/* ────────────────────────────────────────────────────────────────────────────
 * The three keys
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What the player CHOSE at the ring — written by `sanctum.vellsire.approach`'s two choices.
 *
 * `"catch"` on "Set the snare.", `"release"` on "Stand aside and let it pass." Read here, never
 * written here: the choice is the corpus's and the outcome is this module's.
 */
export const VELLSIRE_ATTEMPT_FLAG = "story.vellsire.attempt";

/** Set once the beat is behind the player, whichever way it went. Both epilogues require it. */
export const VELLSIRE_RESOLVED_FLAG = "story.vellsire.resolved";

/** `"caught"` or `"released"` — the key the two epilogues discriminate on with `flagEquals`. */
export const VELLSIRE_OUTCOME_FLAG = "story.vellsire.outcome";

/**
 * Set once one of the two epilogue cutscenes has PLAYED — written by `maren.epilogue.caught` and
 * `maren.epilogue.released`, read by both so neither replays.
 *
 * ⚠ THIS, AND NOT A FULL BADGE LADDER, IS WHEN THE RUN'S ENDING HAS HAPPENED. `core/acts.ts`
 * `runIsComplete` returns true on `badgeCount >= gyms.length` as well as on the flag, and
 * `winGym` → `advanceActs` → `maybeCompleteRun` runs BEFORE `playBattleOutcome` plays
 * `greaves.finale.post` — so the ending latch fired on the sixth badge, before `story.greaves
 * .beaten` existed, before `sanctum.vellsire.approach` had even been offered, and before either
 * epilogue. Measured: at the sixth badge `runIsComplete` was already true with
 * `story.greaves.beaten` undefined. And because the latch is one-shot, an epilogue wired to it
 * would have reported the region as it stood BEFORE the choice it exists to report, then never
 * fired again.
 */
export const EPILOGUE_SHOWN_FLAG = "story.epilogue.shown";

/** True once an epilogue has played — the run's ending is behind the player. */
export function epilogueShown(save: Pick<SaveEnvelope, "questFlags">): boolean {
  const value: FlagValue | undefined = save.questFlags[EPILOGUE_SHOWN_FLAG];
  return value !== undefined && value !== false;
}

/** The two terminal states of the finale. There is deliberately no third — see the header. */
export type VellsireOutcome = "caught" | "released";

/** The two things the player can do at the ring, as the corpus spells them. */
export type VellsireAttempt = "catch" | "release";

/** What the player chose at the ring, or null if they have not stood there yet. */
export function vellsireAttempt(save: Pick<SaveEnvelope, "questFlags">): VellsireAttempt | null {
  const value: FlagValue | undefined = save.questFlags[VELLSIRE_ATTEMPT_FLAG];
  return value === "catch" || value === "release" ? value : null;
}

/** True once the finale has a recorded outcome. The latch that stops the ring replaying. */
export function vellsireResolved(save: Pick<SaveEnvelope, "questFlags">): boolean {
  const value: FlagValue | undefined = save.questFlags[VELLSIRE_RESOLVED_FLAG];
  return value !== undefined && value !== false;
}

/** The outcome on record, or null. */
export function vellsireOutcome(save: Pick<SaveEnvelope, "questFlags">): VellsireOutcome | null {
  const value: FlagValue | undefined = save.questFlags[VELLSIRE_OUTCOME_FLAG];
  return value === "caught" || value === "released" ? value : null;
}

/** Write a resolution onto a save. Pure — the caller adopts the result. */
export function recordVellsireOutcome<S extends { questFlags: Record<string, FlagValue> }>(
  save: S,
  outcome: VellsireOutcome,
): S {
  return {
    ...save,
    questFlags: {
      ...save.questFlags,
      [VELLSIRE_RESOLVED_FLAG]: true,
      [VELLSIRE_OUTCOME_FLAG]: outcome,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Where the ring is, and what stands in it
 * ──────────────────────────────────────────────────────────────────────────── */

/** The node bible §8's finale happens at — `balance.encounter.finaleGatedNode`, never typed in. */
export function finaleNodeId(balance: Balance): string {
  return balance.encounter.finaleGatedNode;
}

/**
 * True once the finale encounter is unlocked — `balance.acts.runCompleteFlag`, i.e. Greaves beaten.
 *
 * The SAME key `core/acts.ts` `runIsComplete` reads, resolved through its own accessor rather than
 * respelled here. `runIsComplete` also returns true at a full badge ladder; this deliberately does
 * not, because the gate is about the Sanctum fight having HAPPENED, which is what the approach
 * cutscene narrates.
 */
export function finaleUnlocked(save: Pick<SaveEnvelope, "questFlags">, balance: Balance): boolean {
  return save.questFlags[runCompleteFlag(balance)] === true;
}

/**
 * The Ancient line standing at the finale node — read off the node's own populations.
 *
 * `data/species.json` marks exactly one line `ancient` with a population at the Sanctum. No species
 * id appears in this file (G2), so renaming the line follows the data, and a content set that put a
 * different Ancient in the ring would field that one.
 */
export function finaleAncientLine(content: Content, nodeId: string): SpeciesLine | null {
  const node = content.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return content.species.find((s) => s.ancient && node.populations[s.id] !== undefined) ?? null;
}

/**
 * The age an Ancient is met at.
 *
 * The TERMINAL class of `core/types.ts` `AGE_CLASSES`, not a literal: `core/lifecycle.ts`
 * `newOwnedCreature` forces an Ancient to that class whatever it is handed (G10 — "Caught Ancients
 * never age"), and the approach cutscene says the same thing in words. Deriving it means the two
 * cannot disagree.
 */
export function ancientAgeClass(): AgeClass {
  const terminal = AGE_CLASSES[AGE_CLASSES.length - 1];
  if (terminal === undefined) throw new Error("core/types.ts AGE_CLASSES is empty");
  return terminal;
}

/** The uid the scripted stag carries. One individual, one node — no counter is needed. */
export function vellsireUid(nodeId: string, lineId: string): string {
  return `finale-${nodeId}-${lineId}`;
}

export interface VellsireBattleBuild {
  input: BattleInput;
  ctx: BattleContext;
  /** The scripted individual, so the caller can report what was met. */
  enemy: BattlerSpec;
  nodeId: string;
  lineId: string;
}

/**
 * Build the one scripted Ancient encounter.
 *
 * `kind: "ancient"` — `core/battle.ts` already carries it, already allows a snare in it, and already
 * prices it at `balance.catch.baseCatchAncient`. `nodeId` IS set (unlike a gym or a trainer fight),
 * because a successful snare here must move the Sanctum's real number: Hard Req 2 does not stop
 * being true because the animal is the last one.
 *
 * LEVEL is `rollLevel(balance, act, rng)` — the region's own band at that act, drawn off the same
 * seeded stream a wild individual is drawn from, so the finale replays identically (L10). TRAITS are
 * `rollWildTraits`, for the same reason. Draw order: level, then traits.
 */
export function buildVellsireBattle(opts: {
  content: Content;
  save: SaveEnvelope;
  act: number;
  rng: Rng;
  /** The live finale node (`liveNodeOf(content, save, finaleNodeId(balance))`). */
  node?: EcoNode;
}): VellsireBattleBuild {
  const { content, save, act, rng } = opts;
  const balance = content.balance;
  const nodeId = finaleNodeId(balance);
  const line = finaleAncientLine(content, nodeId);
  if (!line) throw new Error(`no ancient line with a population at "${nodeId}" — the ring is empty`);
  const node = opts.node ?? liveNodeOf(content, save, nodeId);

  const age = ancientAgeClass();
  const level = rollLevel(balance, act, rng);
  const enemy: BattlerSpec = {
    uid: vellsireUid(nodeId, line.id),
    lineId: line.id,
    age,
    level,
    traits: rollWildTraits(balance, age, rng),
  };

  const idx = indexSpecies(content.species);
  const web = deriveFoodWeb(node, idx, balance);
  const ctx = makeBattleContext(content, predationOracleFromWebs([web]));

  const input: BattleInput = {
    seed: save.seed,
    kind: "ancient",
    // `game/wild-battle.ts`'s reading of "who can fight", not a second one.
    playerParty: partySpecs(save),
    enemyParty: [enemy],
    nodeId,
    bag: { ...save.items },
  };
  return { input, ctx, enemy, nodeId, lineId: line.id };
}

/** Why the finale fight cannot start right now, or null. The overworld prints this string. */
export function vellsireBattleProblem(save: SaveEnvelope): string | null {
  // The party clause is `game/wild-battle.ts`'s, not a second reading of it: it refuses an EMPTY
  // party and an all-fainted one, and the second used to fall through to `startBattle`'s throw.
  return partyProblem(save);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The resolution
 * ──────────────────────────────────────────────────────────────────────────── */

export interface VellsireResolution {
  save: SaveEnvelope;
  outcome: VellsireOutcome;
  /** The catch application when the snare held — the real numbers, for the banner. Null otherwise. */
  applied: CatchApplication | null;
  /** Non-null when the count could not be moved; printed, never swallowed. */
  problem: string | null;
}

/**
 * Resolve a snare attempt into an outcome, and write it.
 *
 * `caught` is `core/battle.ts`'s own report and is non-null exactly when the snare held. Anything
 * else — including a won fight and a lost one — is `released`; see the header for why that is a
 * declared deviation rather than a shrug.
 *
 * The catch, when it happens, goes through the ONE catch path (`applyCatchToSave`): the tape, then
 * `applyCatch`, then `newOwnedCreature`. G10 is therefore satisfied by construction — the caught
 * stag comes back with `yearsRemaining` NEVER and is skipped by the year turn, which is precisely
 * what `maren.epilogue.caught` asserts in words.
 *
 * ⚠ THIS IS THE OUTCOME, NOT THE COST, and the split is deliberate rather than an omission. What
 * the ring did to the party's HP, levels and bag is `game/wild-battle.ts`
 * `applyBattleResult(save, state)` — the ONE writer all four launchers share, on the same terms
 * they share `partyProblem`. It is kept out of here because this function is deliberately asked of
 * `Pick<BattleState, "outcome">`: the stand-aside branch and the no-battle-scene branch resolve the
 * finale with no `BattleState` to read, and widening the parameter would make a beat that must
 * never silently not happen depend on having fought.
 */
export function resolveVellsireCatch(opts: {
  save: SaveEnvelope;
  content: Content;
  state: Pick<BattleState, "outcome">;
  caught: CaughtIndividual | null;
}): VellsireResolution {
  const { content, state, caught } = opts;
  if (!caught) {
    return {
      save: recordVellsireOutcome(opts.save, "released"),
      outcome: "released",
      applied: null,
      problem: null,
    };
  }
  const applied = applyCatchToSave(opts.save, caught, content);
  return {
    save: recordVellsireOutcome(applied.save, "caught"),
    outcome: "caught",
    applied,
    problem: applied.problem,
  };
}

/**
 * Resolve the branch the player took at the ring, WITHOUT a battle.
 *
 * Used for the stand-aside branch when the corpus has not already recorded it (an older save, or a
 * content set whose choice carries no `setFlags`), and for the honest degraded answer when the
 * battle scene is not registered — the same discipline `playEntry` uses for a missing dialogue box:
 * a beat that silently does not happen is worse than a degraded one, and the caller SAYS which it
 * got. Returns null when there is nothing to resolve.
 */
export function resolveVellsireWithoutBattle(save: SaveEnvelope): VellsireResolution | null {
  if (vellsireResolved(save)) return null;
  const attempt = vellsireAttempt(save);
  if (attempt === null) return null;
  return {
    save: recordVellsireOutcome(save, "released"),
    outcome: "released",
    applied: null,
    problem: null,
  };
}

/** The outcome the reducer reported, as a banner says it. G7: an identifier, and nothing else. */
export function vellsireBattleOutcomeLabel(state: Pick<BattleState, "outcome">): string {
  return state.outcome ?? "unresolved";
}

/* ────────────────────────────────────────────────────────────────────────────
 * The epilogue survey — "the ending is a survey read" (build-doc §4 step 6)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How far the epilogue projects the region forward.
 *
 * `balance.clock.yearsTotal` years of `balance.clock.seasonOrder` — DERIVED from two published
 * keys, never a literal horizon (G11). It is the same span `tests/property/ecosim.test.ts` already
 * measures the keystone's consequence over, so the number the epilogue shows and the number the
 * property test proves are reached the same way.
 */
export function epilogueSeasons(balance: Balance): Season[] {
  const out: Season[] = [];
  for (let year = 0; year < balance.clock.yearsTotal; year += 1) {
    for (const season of balance.clock.seasonOrder) out.push(season);
  }
  return out;
}

/**
 * The region as it will stand after the player's last choice has had time to matter.
 *
 * `projectRegion`'s own header: "the difference the player's choice made only exists in the seasons
 * that follow it, so the epilogue projects the region forward from the state the choice left behind
 * and reports what it finds." That function had ZERO callers outside a property test — the epilogue
 * it was written for launched nothing — which is why this exists and why it is here rather than in
 * a scene: it is pure, it takes an injected `Rng` (G11 — no `Math.random`), and it can be measured
 * in a node test.
 *
 * The starting state is the SAVE's `nodeStates` where it has one and the shipped file otherwise —
 * the same `state ? … : …` resolution `stepRegionStates` uses, so a catch the player made is in the
 * numbers the ending reports.
 */
export function projectEpilogueRegion(opts: {
  content: Content;
  save: Pick<SaveEnvelope, "nodeStates">;
  rng: Rng;
}): Record<string, NodeState> {
  const { content, save, rng } = opts;
  const start = content.nodes.map((file) => {
    const state = save.nodeStates[file.id];
    return state ? fromNodeState(file, state) : toEcoNode(file);
  });
  const projected = projectRegion(start, epilogueSeasons(content.balance), rng);
  const out: Record<string, NodeState> = {};
  for (const node of projected) out[node.id] = toNodeState(node);
  return out;
}
