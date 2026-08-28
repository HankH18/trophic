/**
 * game/wild-battle.ts — the join between meeting a wild creature and the survey moving.
 *
 * ══ WHAT WAS MISSING, AND WHY IT MATTERED MOST ══
 * build-doc §1's first never-cut demo beat is: hammer a prey species in year 1, open year 2 with its
 * predator gone. Every piece of that existed and none of them touched: `core/battle.ts` reported a
 * catch through `caughtIndividual`, `core/ecosim.ts` could apply one through `applyCatch`, and
 * `tests/integration/seams.test.ts` joined them BY HAND and proved the survey goes 11 → 10. But
 * nothing in the shipping game did: `OverworldScene` exposed an `onEncounter` seam that
 * `game/boot.ts` never supplied, no file in `game/` started the battle scene, and no file in `game/`
 * ever wrote a catch into `save.nodeStates`. Driven headlessly, the real overworld met 56 wild
 * creatures across two in-game years and moved not one population; the ecology moved only on season
 * boundaries. The catch→survey loop was proven in core and reachable from nowhere.
 *
 * This module is that join, and it is the ONLY one. It is where an `Encounter` becomes a
 * `BattleInput`, and where a `CaughtIndividual` becomes a decremented count and a creature in the
 * player's party.
 *
 * ══ WHAT IT IS NOT ALLOWED TO BE ══
 * • **No rules.** There is no damage, catch-probability, turn-order, XP or population arithmetic
 *   here. The population write is `core/ecosim.ts` `applyCatch` — the same function
 *   `core/save.ts`'s `replay` reaches through `adjustPopulation`, so the live path and the replay
 *   path move the count identically, clamps included. The creature the player gains is
 *   `core/lifecycle.ts` `newOwnedCreature`.
 * • **No engine.** No Phaser import, so the whole hand-off is exercised in a node test with no DOM.
 *   The scene supplies the launch; this decides what is launched and what is done with the result.
 * • **No content invented (G2).** The starter line is read out of `data/species.json` by the
 *   `"starter"` habitat sentinel core/types.ts already declares; no species id is written here.
 * • **No moralising copy (G7).** Nothing in this file produces a player-facing string at all.
 *
 * ══ THE ONE RULE THAT SHOULD NOT LIVE HERE ══
 * {@link rollWildTraits} implements bible §2's "1 per wild creature, Elders roll rare traits" from
 * `balance.traits`. It belongs in `core/`, next to `core/lifecycle.ts`'s heir-trait roll, and
 * `tools/harness/player.ts` already carries a private second copy of it — so the balance report
 * describes a player whose creatures the game could not produce. `core/` is read-only to this lane;
 * the duplication stands. The two implementations are deliberately draw-for-draw identical (a
 * chance drawn only for an Elder, then one `pick` per slot) so collapsing them is a delete.
 *
 * NUMBERS (G11): `balance.traits`, `balance.xp.starterLevel`, `balance.party.maxPartySize`,
 * `balance.economy`/`balance.snare` item ids through the save's own bag, and the purse a beaten
 * trainer pays through `core/save.ts` `trainerPayout` (`balance.economy.trainerPayoutPerLevel`,
 * never restated here). No literal.
 * RANDOMNESS (G11): the injected `core/rng.ts` stream. No `Math.random`.
 */

import {
  caughtIndividual,
  makeBattleContext,
  predationOracleFromWebs,
  xpOf,
  type BattleContext,
  type CaughtIndividual,
} from "../core/battle";
import { applyCatch, fromNodeState, toNodeState } from "../core/ecosim";
import { deriveFoodWeb, indexSpecies, toEcoNode, type EcoNode } from "../core/foodweb";
import { newOwnedCreature } from "../core/lifecycle";
import type { Rng } from "../core/rng";
import {
  appendAction,
  applyBattleAftermath,
  applyCaught,
  applyPayout,
  battleAftermathAction,
  catchAction,
  payoutAction,
  trainerPayout,
  type BattleAftermath,
  type SaveEnvelope,
} from "../core/save";
import type {
  AgeClass,
  Balance,
  BattleInput,
  BattlerSpec,
  BattleKind,
  BattleState,
  Content,
  NodeFile,
  OwnedCreature,
  SpeciesLine,
  Trait,
} from "../core/types";
import type { Encounter } from "./encounters";

/* ────────────────────────────────────────────────────────────────────────────
 * The trait roll (see the header — this wants to be in core/)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * bible §2 — "Traits: flat ±10% modifiers with names. **1 per wild creature**, +1 slot via
 * inheritance, **Elders roll rare traits**."
 *
 * `balance.traits.slotsPerWildCreature` picks from `balance.traits.pool`; an Elder rolls the rare
 * half of that pool with probability `balance.traits.elderRareChance`. The common half includes the
 * five NEGATIVE traits, which is deliberate: a wild-caught team carries its duds, and that is what
 * makes an Elder's rare roll worth having.
 *
 * The magnitude of a trait is `balance.stats.traitModPct` and is applied by `core/battle.ts`
 * `effectiveStats`; nothing here knows what ±10% is.
 *
 * DRAW ORDER, stated because a replay depends on it: `chance` is drawn only for an Elder (the `&&`
 * short-circuits), then one `pick` per slot. This is draw-for-draw what `tools/harness/player.ts`
 * does, so the harness's measured player and the game's wild creatures come off the same rule.
 */
export function rollWildTraits(balance: Balance, age: AgeClass, rng: Rng): Trait[] {
  const out: Trait[] = [];
  for (let slot = 0; slot < balance.traits.slotsPerWildCreature; slot += 1) {
    const rare = age === "E" && rng.chance(balance.traits.elderRareChance);
    const pool = balance.traits.pool.filter((t) => (t.rarity === "rare") === rare);
    const picked = rng.pick(pool.length > 0 ? pool : balance.traits.pool);
    if (picked) out.push({ ...picked });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Encounter → BattleInput
 * ──────────────────────────────────────────────────────────────────────────── */

/** A party member as the reducer takes it. A field mapping — no rule, no derived number. */
export function battlerSpecOf(creature: OwnedCreature): BattlerSpec {
  const spec: BattlerSpec = {
    uid: creature.uid,
    lineId: creature.lineId,
    age: creature.age,
    level: creature.level,
    traits: creature.traits.map((t) => ({ ...t })),
  };
  if (creature.boons && creature.boons.length > 0) spec.boons = creature.boons.map((b) => ({ ...b }));
  if (creature.curHp !== undefined) spec.curHp = creature.curHp;
  // The banked XP goes back IN. This is the read-back half of the loop `applyBattleResult` below
  // writes: the aftermath has always stored `OwnedCreature.xp`, and until `BattlerSpec.xp` existed
  // `core/battle.ts` `makeBattler` opened every battler at 0, so the total accumulated on the save
  // and was thrown away at the start of the very next fight. Copied verbatim — no clamp, no
  // rescale, no re-derivation from the level — because a carried number that any reader could
  // recompute differently is exactly the second source of truth this module refuses to be. Every
  // launcher (wild, gym, rival, finale) reaches the reducer through `partySpecs`, so this one line
  // wires all four.
  if (creature.xp !== undefined) spec.xp = creature.xp;
  if (creature.nickname !== undefined) spec.nickname = creature.nickname;
  if (creature.metamorphosed !== undefined) spec.metamorphosed = creature.metamorphosed;
  return spec;
}

/** The wild creature met, as the reducer takes it. Its uid names the node and the line it came from. */
export function wildBattlerSpec(encounter: Encounter): BattlerSpec {
  return {
    uid: wildUid(encounter),
    lineId: encounter.lineId,
    age: encounter.age,
    level: encounter.level,
    traits: encounter.traits.map((t) => ({ ...t })),
  };
}

/**
 * A stable, collision-free id for the individual met.
 *
 * It has to survive into `CaughtIndividual.uid` and out again as `OwnedCreature.uid`, and two
 * animals of the same line caught at the same node in the same run must not share one — a save with
 * two creatures at one uid loses one of them at the first retirement lookup. The action-log length
 * is the run's own monotonic counter, so this is unique without a second counter to keep.
 */
export function wildUid(encounter: Encounter, seq = 0): string {
  return `wild-${encounter.nodeId}-${encounter.lineId}-${String(seq)}`;
}

/**
 * The player's fightable party, in order — every unboxed member, fainted ones INCLUDED.
 *
 * The fainted are deliberately still here: `core/battle.ts` `startBattle` fields the first STANDING
 * member and keeps the rest of the party available to switch in, so filtering them out here would
 * quietly shorten every fight. "Can this party field anyone at all" is a different question and has
 * its own function — {@link standingSpecs} — precisely so that neither answer has to be inferred
 * from the other.
 */
export function partySpecs(save: SaveEnvelope): BattlerSpec[] {
  return save.party.filter((c) => c.boxed !== true).map(battlerSpecOf);
}

/**
 * Is this battler standing? `core/battle.ts` `startBattle`'s own condition, in ONE place.
 *
 * `curHp === undefined` means "full" — `BattlerSpec.curHp` is an optional carry-in, absent on a
 * creature that has never been hurt — which is why the test is not `> 0` alone. Exported so the
 * overworld's last-ditch check before the hand-off asks the same question rather than re-spelling
 * it; two spellings of a reducer precondition drift, and the drift is only found by the throw.
 */
export function isStanding(spec: Pick<BattlerSpec, "curHp">): boolean {
  return spec.curHp === undefined || spec.curHp > 0;
}

/** The party members that can actually be sent out — {@link partySpecs} minus the fainted. */
export function standingSpecs(save: SaveEnvelope): BattlerSpec[] {
  return partySpecs(save).filter(isStanding);
}

/**
 * Why NO fight of any kind can start from this save, or null — the one clause all four launchers
 * share (wild, gym, rival, finale).
 *
 * ⚠ THE SECOND CLAUSE IS THE POINT, and it is the one that was missing. All four launchers asked
 * `partySpecs(save).length === 0`, which counts party MEMBERS: a party made only of fainted
 * creatures passed every one of them, and `core/battle.ts` `startBattle` then THREW — "every
 * battler in the player party is already fainted — there is nothing to field." A refusal that is
 * SAID belongs here; an exception out of the reducer is a crash where a sentence was owed, and by
 * the time the overworld reaches it the battle's `clock.battleTicks` has already been spent.
 *
 * One function rather than four copies of the same two strings, because four copies is how the
 * first clause came to be right in four places and the second missing from all four.
 *
 * THE SECOND SENTENCE IS THE ONE THE GAME ALREADY SAYS. `game/scenes/OverworldScene.ts`
 * `unfieldableProblem` — the last-ditch check in front of the reducer — has always worded this
 * exact condition "nothing in the party is standing", so that is the wording here rather than a
 * second spelling of one refusal. Its `— nothing can be sent out` tail is the sibling clause's, so
 * the two refusals read as the pair they are.
 */
export function partyProblem(save: SaveEnvelope): string | null {
  if (partySpecs(save).length === 0) {
    return "no creature in the party — nothing can be sent out";
  }
  if (standingSpecs(save).length === 0) {
    return "nothing in the party is standing — nothing can be sent out";
  }
  return null;
}

/**
 * Why a wild battle cannot start right now, or null when it can.
 *
 * Returned rather than thrown, and rather than being discovered inside the reducer: an overworld
 * that silently drops the hand-off is exactly the state this lane was repaired out of. The scene
 * prints this string.
 */
export function wildBattleProblem(save: SaveEnvelope): string | null {
  return partyProblem(save);
}

export interface WildBattleBuild {
  input: BattleInput;
  ctx: BattleContext;
}

/**
 * Everything `BattleScene` needs for one wild encounter.
 *
 * The `PredationOracle` is built from `deriveFoodWeb` at THIS node — §7.4's predation bonus is
 * per-node and core/foodweb.ts is the only module allowed to compute a diet edge (G3/G6). The web is
 * derived from the LIVE node, so a species the player has already removed from the node is absent
 * from the web the fight is scored against, exactly as the ecology says it is.
 */
export function buildWildBattle(opts: {
  content: Content;
  save: SaveEnvelope;
  encounter: Encounter;
  /** The live node (`fromNodeState(file, save.nodeStates[id])`). */
  node: EcoNode;
  /** Unique-per-encounter counter; the save's action-log length is the natural one. */
  seq?: number;
}): WildBattleBuild {
  const { content, save, encounter, node } = opts;
  const idx = indexSpecies(content.species);
  const web = deriveFoodWeb(node, idx, content.balance);
  const ctx = makeBattleContext(content, predationOracleFromWebs([web]));

  const input: BattleInput = {
    seed: save.seed,
    kind: "wild",
    playerParty: partySpecs(save),
    enemyParty: [{ ...wildBattlerSpec(encounter), uid: wildUid(encounter, opts.seq ?? save.actionLog.length) }],
    nodeId: encounter.nodeId,
    // The bag IS the save's items (build-doc §7.8). No snare is conjured for the fight.
    //
    // ⚠ THIS COMMENT USED TO CLAIM "a player with no snares cannot catch anything, which is the
    // honest state and the one the economy tunes." THAT WAS FALSE, and it never went red. Measured
    // through this exact seam from a real `startNewGame`: a fresh save's `items` is `{}` (core/
    // save.ts:421, and no production caller passes `opts.items`), and `bagHas` in core/battle.ts:1208
    // returns TRUE for a key that is ABSENT — "untracked", an affordance for the balance harness,
    // which carries no bag. `bagConsume` likewise returns early on an absent key. So the guard at
    // core/battle.ts:1537 never fires for a new player: snares throw at the shipped chance, the count
    // never decrements, and catching is UNLIMITED rather than impossible.
    //
    // The guard itself is sound — with `items: {base: 2}` the two throws decrement and the third is
    // refused with `actionRejected`. The economy is enforced only for a key that is PRESENT, and
    // nothing writes one. That is why Maren's "three of them, in the satchel by the door" has never
    // corresponded to anything.
    //
    // Every catching test mints its own bag (`{master: 99}`, `{master: 4}`), so the suite's green
    // about catching is evidence about FIXTURES. Nothing in tests/ covers the player's real bag —
    // which is how a false comment survived 2,954 passing tests. If you add a grant, add that test.
    bag: { ...save.items },
  };
  return { input, ctx };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Battle outcome → the survey (Hard Req 2)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CatchApplication {
  save: SaveEnvelope;
  /** The line's count at that node BEFORE and AFTER. Hard Req 2's real numbers, for the HUD. */
  before: number;
  after: number;
  /** The creature the player now owns, or null when the party and box were both full. */
  gained: OwnedCreature | null;
  /** Non-null when the catch could not be applied at all — printed, never swallowed. */
  problem: string | null;
}

/**
 * Apply one catch: move the real number, log the action, and add the creature.
 *
 * ORDER AND OWNERSHIP, because this is the seam that was proven by a hand-written test and by
 * nothing in production:
 *   1. `newOwnedCreature` (core/lifecycle.ts) for the party side — which is where the Ancient
 *      exemption (G10 / Hard Req 4) and the projected retirement year are decided, not here. It
 *      goes FIRST because the tape entry carries the creature it builds.
 *   2. `appendAction(catchAction(nodeId, gained))` — the tape, carrying BOTH halves of the act:
 *      `core/save.ts` `replay` applies the very same decrement through `adjustPopulation` and puts
 *      back the very same individual through `applyCaught`, so a replay of the log reproduces this
 *      save — the whole save, not just its counts (L10).
 *   3. `applyCatch` (core/ecosim.ts) on the live node, written back through `toNodeState`. This is
 *      the ONE population writer for the live path; §7.3 step 4's clamp lives inside it.
 *   4. `applyCaught` (core/save.ts) for the live party — the same applier replay reaches, so the
 *      run and its replay cannot answer "party or box" differently.
 *
 * A catch of a line that has no population at this node is a loud throw inside `applyCatch`; it is
 * caught and returned as `problem` so the overworld can print it instead of dying mid-foray.
 */
export function applyCatchToSave(
  save: SaveEnvelope,
  caught: CaughtIndividual,
  content: Content,
): CatchApplication {
  const nodeId = caught.nodeId;
  if (nodeId === undefined) {
    return {
      save,
      before: 0,
      after: 0,
      gained: null,
      problem: `catch of "${caught.lineId}" carries no nodeId — nothing can be decremented (Hard Req 2)`,
    };
  }

  if (!nodeFileOf(content, nodeId)) {
    return { save, before: 0, after: 0, gained: null, problem: `no node "${nodeId}" in data/nodes/` };
  }

  // The SAME resolver the encounter roll and the HUD use — see `liveNodeOf`. A second `state ? … : …`
  // here is the two-answers defect again, on the number a catch is about to move.
  const live = liveNodeOf(content, save, nodeId);
  const before = live.populations[caught.lineId]?.count ?? 0;

  let next: EcoNode;
  try {
    next = applyCatch(live, caught.lineId, content.balance);
  } catch (err) {
    return {
      save,
      before,
      after: before,
      gained: null,
      problem: err instanceof Error ? err.message : String(err),
    };
  }

  /*
   * ⚠ THE CREATURE IS BUILT BEFORE THE TAPE ENTRY, AND THAT ORDER IS THE WHOLE OF T-34's LAST LINE.
   * The entry carries the individual (`core/save.ts` `catchAction`), so it cannot be written until
   * the individual exists. It used to be appended first, from `{t,nodeId,lineId,uid}` alone, and a
   * replay of that tape reached the right population and a party one creature SHORT — measured
   * through this very function: live `["provisional-starter","wild-r1-nibbin-line-0"]` against
   * replayed `["provisional-starter"]`, populations 10/10 on both sides. L10 was false for any run
   * containing a catch.
   *
   * Reading `save` rather than `after` for the year and the cohort decision is not a change of
   * answer: `appendAction` writes `actionLog` and nothing else — not `year`, not `party`, not `box`.
   */
  const line = content.species.find((s) => s.id === caught.lineId);
  let gained: OwnedCreature | null = null;
  let problem: string | null = null;
  if (!line) {
    problem = `no species line "${caught.lineId}" in data/species.json — the count moved, the creature did not`;
  } else {
    gained = newOwnedCreature(
      {
        uid: caught.uid,
        lineId: caught.lineId,
        age: caught.age,
        level: caught.level,
        caughtYear: save.year,
        traits: caught.traits,
        metamorphosed: caught.metamorphosed,
        // The party is capacity-limited (build-doc §7.8); a full party boxes the newcomer, and
        // core/lifecycle.ts's year turn ages boxed creatures exactly as it ages party ones (G10).
        boxed: save.party.length >= content.balance.party.maxPartySize,
      },
      line,
      content.balance,
    );
    if (gained.boxed === true && save.box.length >= content.balance.party.maxBoxSize) {
      gained = null;
      problem = `party (${content.balance.party.maxPartySize}) and box (${content.balance.party.maxBoxSize}) are both full — the count moved, the creature was not kept`;
    }
  }

  /*
   * THE BARE ENTRY IS STILL WHAT THE TWO KEPT-NOTHING CASES WRITE, and it is the honest record of
   * them: an unknown line, or a full party AND box, moved the count and kept no creature, so there
   * is no creature for the entry to carry. `caughtFromCatchAction` reads such an entry as null and
   * `replay` applies the population half alone — which is exactly what happened live.
   */
  let after: SaveEnvelope = appendAction(
    save,
    gained
      ? catchAction(nodeId, gained)
      : { t: "catch", nodeId, lineId: caught.lineId, uid: caught.uid },
  );
  after = {
    ...after,
    nodeStates: { ...after.nodeStates, [nodeId]: toNodeState(next) },
  };
  if (gained) {
    // `core/save.ts`'s own applier, the same one `replay` reaches through the entry just appended.
    // Two spellings of "party or box" is how the live save and its replay came to disagree once.
    after = applyCaught(after, gained);
  }

  return {
    save: after,
    before,
    after: next.populations[caught.lineId]?.count ?? 0,
    gained,
    problem,
  };
}

/**
 * The whole outcome of one wild battle, applied to the save.
 *
 * `caughtIndividual` is core/battle.ts's own reporter and is non-null exactly when the outcome is
 * `"caught"` — this file does not decide whether a catch happened, it only carries out the one that
 * did. A fled, won or lost battle changes no population, which is the correct reading of §7.2: the
 * survey counts what the player took, not what the player fought.
 */
export function applyWildBattleOutcome(opts: {
  save: SaveEnvelope;
  content: Content;
  state: BattleState;
  ctx: BattleContext;
  /** Pass core/battle.ts's own report when the scene already has it; otherwise it is re-read here. */
  caught?: CaughtIndividual | null;
}): CatchApplication | null {
  const caught = opts.caught === undefined ? caughtIndividual(opts.state, opts.ctx) : opts.caught;
  if (!caught) return null;
  return applyCatchToSave(opts.save, caught, opts.content);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Battle outcome → the PARTY (build-doc §7.4 → §7.8)
 *
 * ⚠ THE ONE PLACE A FIGHT'S COST IS TAKEN OFF THE SAVE, and it is deliberately shared by all four
 * launchers — wild, gym, rival and finale — for the reason `partyProblem` above is shared: four
 * copies of one clause is how the first half came to be right in four places and the second half
 * missing from all four.
 *
 * WHAT WAS TRUE BEFORE THIS EXISTED: `save.party[].curHp` had ZERO writers outside
 * `core/lifecycle.ts` (creation, and the year turn's proportional rescale). Damage evaporated
 * between fights, so losing a battle cost nothing and an inn's rest would have healed nothing that
 * needed healing. No file in `game/` ever assigned `OwnedCreature.level` or `.xp` either, so a
 * creature carried six in-game years was exactly as strong on the last day as the first. And the
 * bag was copied into `BattleInput.bag` and never copied back, so consumables were infinite.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What the fight left behind, read off the reducer's FINAL STATE rather than replayed out of its
 * event log. That choice is the load-bearing one in this file, so here is why:
 *
 *   • **The events cannot reconstruct it.** `core/types.ts`'s `BattleEvent` union is thin on
 *     purpose — `damage` names the victim but not the attacker, `levelUp` carries the new level but
 *     neither `maxHp` nor `curHp`, and `itemUsed` says nothing about what the stack went down to.
 *     Rebuilding HP from `damage` + `heal` + `statusTick` + the level-up HP bump would mean a second
 *     implementation of §7.4's arithmetic living in `game/`, which is the exact thing L11 and this
 *     module's own header forbid.
 *   • **The final state already IS the answer**, and it is just as deterministic: `BattleState` is a
 *     pure function of (input, actions, rng), so reading it adds no new source of divergence. The
 *     module already reads the same state for the same reason — `caughtIndividual(state, ctx)` is
 *     core's own report, not a reconstruction from `snareThrown`/`caught` events.
 *   • **The scene stays a replayer of `events[]`.** Nothing here runs on screen; the scene narrates
 *     the log and the launcher takes the consequence, which keeps the two jobs apart.
 *
 * Only the PLAYER side is read, and it is read through `state.playerOrder` rather than by filtering
 * `battlers` on `side` — a caught wild creature's uid is in `battlers` too, and it must not be
 * mistaken for a party member whose HP is owed a write.
 */
export function battleAftermath(
  state: Pick<BattleState, "battlers" | "playerOrder" | "bag">,
): BattleAftermath {
  const party: BattleAftermath["party"] = [];
  for (const uid of state.playerOrder) {
    const battler = state.battlers[uid];
    if (!battler) continue;
    party.push({ uid, curHp: battler.curHp, level: battler.level, xp: xpOf(battler) });
  }
  return { party, items: { ...state.bag } };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The purse (bible §11 — "Currency from quests + trainer battles")
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The `BattleKind` a beaten TRAINER wears, named once so a typo is a compile error rather than a
 * fight that silently pays nothing. `core/types.ts` `BATTLE_KINDS` is
 * `["wild", "trainer", "gym", "ancient"]` — there is no `"rival"` kind: `game/rival.ts` builds its
 * input with `kind: "trainer"`, and the rival IS the trainer the bible's §11 line is about.
 */
const TRAINER_KIND: BattleKind = "trainer";

/**
 * WHAT A FINISHED FIGHT OWES, in money. Zero for everything that is not a WON trainer battle, and
 * zero is not a special case — it is the answer for the other three kinds, for a loss, for a flee
 * and for an unresolved state.
 *
 * WHY ONLY `"trainer"`. content-bible §11: "Currency from quests + trainer battles; sinks: snares,
 * bait mats, inn, forge." The four launchers build four distinct kinds — `game/wild-battle.ts`
 * `"wild"`, `game/gym-battle.ts` `"gym"`, `game/rival.ts` `"trainer"`, `game/finale.ts`
 * `"ancient"` — so "trainer battles" names exactly one of them. Whether a GYM leader is also a
 * "trainer" for the purposes of that sentence is an OPEN question and is recorded as one rather
 * than answered here (G2): the bible's audio manifest groups them ("Trainer/gym battle"), its
 * economy line does not, and inventing the wider reading would mint currency no document asks for.
 *
 * THE LEVELS COME OFF `enemyOrder`, NOT off a filter of `battlers` on `side`. A caught wild
 * battler is in `battlers` too, and `enemyOrder` is the roster the loser actually fielded — which
 * is what `core/save.ts` `trainerPayout` prices. The arithmetic itself is entirely that function's:
 * nothing here multiplies, and `balance.economy.trainerPayoutPerLevel` is never named as a number
 * (G11).
 */
export function trainerPurse(
  state: Pick<BattleState, "battlers" | "enemyOrder" | "kind" | "outcome">,
  balance: Balance,
): number {
  if (state.kind !== TRAINER_KIND || state.outcome !== "win") return 0;
  const levels: number[] = [];
  for (const uid of state.enemyOrder) {
    const battler = state.battlers[uid];
    if (battler) levels.push(battler.level);
  }
  return trainerPayout(levels, balance);
}

/**
 * Apply a finished fight to the save: the tape entry, then the write. The ONE call all four
 * launchers' finish handlers make.
 *
 * ORDER AND OWNERSHIP, stated because this is a seam a replay depends on:
 *   1. `appendAction(battleAftermathAction(...))` — the tape. `core/save.ts` `replay` reads that
 *      entry and applies it through the very same `applyBattleAftermath`, so a replay of the log
 *      reproduces this save (L10 / build-doc §8.1). Logging is NOT optional: neither the encounter
 *      roll nor a single in-battle action reaches the tape, so a fight's cost cannot be re-derived
 *      from anything else on it.
 *   2. `applyBattleAftermath` — core/save.ts's own writer, the same one replay reaches.
 *
 * Safe to call BEFORE or AFTER `applyWildBattleOutcome`/`resolveVellsireCatch` on the same fight:
 * the aftermath names only battlers that were fielded, and a creature caught in that fight is not
 * one of them. Call it first, so the tape reads as the fight and then its prize.
 *
 * ══ AND NOW THE PURSE (bible §11), LEVIED HERE FOR THE REASON THE AFTERMATH IS ══
 * This is where the four launchers converge, so it is the only place a payout can be levied exactly
 * ONCE per fight without four copies of the clause. {@link trainerPurse} decides whether anything is
 * owed; a fight that owes nothing appends nothing, so a wild, gym or ancient fight's tape is
 * byte-identical to what it was before this paragraph existed.
 *
 * IT GOES ON THE TAPE, through `payoutAction` + `applyPayout` — the same applier `replay`'s
 * `case "payout"` reaches. A write that skipped the tape would make L10 silently false in exactly
 * the shape `{t:"innRest"}` once shipped in: the live save richer than its own replay, and the
 * divergence loading cleanly.
 *
 * ⚠ `balance` IS OPTIONAL, AND WITHOUT IT NOTHING IS PAID. That is not a policy, it is a
 * compatibility seam and it is the one hazard in this function: `SaveEnvelope` carries no `Balance`
 * and `BattleState` carries no `Balance`, so the purse cannot be priced from the two arguments this
 * function had. Making the third argument REQUIRED would have been a compile error in three test
 * files and in `game/scenes/OverworldScene.ts`, none of which this lane may edit. So the production
 * launchers MUST pass it — `ctx.balance` is in scope at all four call sites — and a launcher that
 * forgets pays nothing while looking correct. `tests/unit/trainer-payout.test.ts` §5 asserts the
 * four call sites in `OverworldScene` supply it, so forgetting is a red test rather than a quiet
 * zero.
 */
export function applyBattleResult(
  save: SaveEnvelope,
  state: Pick<BattleState, "battlers" | "playerOrder" | "bag" | "enemyOrder" | "kind" | "outcome">,
  balance?: Balance,
): SaveEnvelope {
  const aftermath = battleAftermath(state);
  const next = applyBattleAftermath(appendAction(save, battleAftermathAction(aftermath)), aftermath);
  if (balance === undefined) return next;
  const purse = trainerPurse(state, balance);
  // Nothing owed, nothing written — the "nothing to do" early return `applyRunFlags` uses, and the
  // reason a wild fight's tape did not grow a `{"t":"payout","amount":0}` entry.
  if (purse === 0) return next;
  return applyPayout(appendAction(next, payoutAction(purse)), purse);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The provisional starter
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The uid the stand-in starter carries, so lane C7's opening beat can find and replace it, and so a
 * test can tell a seeded starter from a caught creature.
 */
export const PROVISIONAL_STARTER_UID = "provisional-starter";

/**
 * bible §4 rows 1–3 — the three starter lines are "not wild-spawning; obtained from Warden Maren",
 * and they carry the `"starter"` habitat sentinel core/types.ts declares. Read, never named (G2).
 */
export function starterLines(content: Content): SpeciesLine[] {
  return content.species.filter((line) => line.habitat.includes("starter"));
}

/**
 * A STAND-IN starter, for the state the game is actually in: lane C7 owns the opening beat where
 * Warden Maren offers a choice of three, and until it lands `startNewGame` produced an EMPTY party —
 * which meant a wild encounter could never become a battle, so build-doc §1's first never-cut beat
 * was unreachable by playing the game at all.
 *
 * This is a placeholder in exactly the sense the flat coloured rectangles are: it keeps the vertical
 * slice playable and it must never be mistaken for the opening beat. It is the FIRST starter line in
 * data order (no choice is simulated), at `balance.xp.starterLevel`, age J, with no traits — the
 * player is handed it, not caught in the grass — and it wears {@link PROVISIONAL_STARTER_UID}.
 * `startNewGame` only reaches for it when its caller supplied no party, so the day C7 passes one
 * this stops being used without a line changing.
 */
export function provisionalStarter(content: Content): OwnedCreature | null {
  const line = starterLines(content)[0];
  if (!line) return null;
  return newOwnedCreature(
    {
      uid: PROVISIONAL_STARTER_UID,
      lineId: line.id,
      age: "J",
      level: content.balance.xp.starterLevel,
      caughtYear: content.balance.clock.startYear,
    },
    line,
    content.balance,
  );
}

/** The shipped node file for an id — the one lookup this module needs and does not want copied. */
export function nodeFileOf(content: Content, id: string): NodeFile | undefined {
  return content.nodes.find((n) => n.id === id);
}

/**
 * ⚠ THE ONE PLACE THE POPULATION FALLBACK IS DECIDED. The live node = the shipped file with the
 * save's populations, flora and recentDeaths on it.
 *
 * Every reader of a count goes through here — the encounter roll, the overworld HUD, the catch that
 * is about to move the number. There used to be two: `OverworldScene.liveNode` fell back to the
 * shipped file when a node had no `nodeStates` entry (the INV-2 "a save that predates this node"
 * case, which `tests/gates/extensibility.test.ts` treats as supported), while `countOf` and this
 * module independently fell back to 0. The HUD then printed every line as `0` while creatures kept
 * spawning at the shipped weights, and an encounter banner read `pollywisp-line J L8 — count 0`.
 * That is build-doc §8.3's two answers to one number, on the number Hard Req 2 is about.
 *
 * build-doc §7.2 — "sim initial state = the file as shipped" — is the fallback, and `toEcoNode`
 * deep-copies, so a running game never aliases the shipped JSON.
 */
export function liveNodeOf(content: Content, save: SaveEnvelope, nodeId: string): EcoNode {
  const file = nodeFileOf(content, nodeId);
  if (!file) throw new Error(`no node "${nodeId}" in data/nodes/`);
  const state = save.nodeStates[nodeId];
  return state ? fromNodeState(file, state) : toEcoNode(file);
}
