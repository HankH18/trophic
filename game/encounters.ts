/**
 * game/encounters.ts — rolling an encounter on a foray step.
 *
 * ══ GUARDRAIL G3, WHICH IS THE WHOLE POINT OF THIS FILE ══
 * "Do not create any second encounter/spawn/bait table — all derived from node JSON."
 * There is NO table here. There is no species id, no role name, no weight literal and no bias of any
 * kind in this module. Every weight is `encounterWeights()` from core/foodweb.ts, which is the one
 * place build-doc §8.3 allows a diet edge or an encounter weight to be computed, and which returns
 * exactly what build-doc §7.2 specifies: **the live population count**.
 *
 * What that buys, for free, is the never-cut demo beat (build-doc §1 beat 1):
 *   • A species at count 0 has weight 0, and `Rng.pickWeighted` skips zero weights — so a line the
 *     player has caught to extinction produces EXACTLY ZERO encounters, permanently, with no
 *     extinction check anywhere in the code. The cascade is visible because the survey and the
 *     encounter roll read the same number.
 *   • A predator that starves out of the node stops appearing for the same reason and by the same
 *     arithmetic — nothing here knows what a predator is (G6).
 *
 * Hard Req 10 / `migrant_legibility`: an out-of-season migrant is filtered by core/foodweb.ts's
 * `migrantStatus`, which also says *why* (dormant vs migrating). {@link encounterTable} hands the
 * dex and the sign cards that same array, from the same call the roll uses, so the two can never
 * disagree about whether a species is absent or merely away.
 *
 * ENGINE-FREE. No Phaser import; the scene calls in.
 *
 * NUMBERS (G11): `balance.encounter` — `stepsPerForay`, `encounterChancePerStep`, `ageWeights`,
 * `levelByYear`, `levelJitter`, `minLevel` — plus `balance.xp.levelCap`. Nothing is a literal.
 * RANDOMNESS (G11): `core/rng.ts` only. No `Math.random`.
 */

import {
  encounterWeights,
  rollEncounter,
  stepEncounterChance,
  type EcoNode,
  type SpeciesIndex,
} from "../core/foodweb";
import type { Rng } from "../core/rng";
import {
  AGE_CLASSES,
  type AgeClass,
  type Balance,
  type EncounterWeight,
  type Season,
  type Trait,
} from "../core/types";
import { rollWildTraits } from "./wild-battle";

/* ────────────────────────────────────────────────────────────────────────────
 * The question an encounter roll is asked
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ForayContext {
  /** The LIVE node — `fromNodeState(file, save.nodeStates[id])`, never the shipped file. */
  node: EcoNode;
  species: SpeciesIndex;
  balance: Balance;
  /** From `core/clock.ts` `seasonOf(clock, balance)`. */
  season: Season;
  /**
   * The ACT the player is in (`core/acts.ts` `actOf`), NEVER the calendar year. Sets the wild level
   * band — see {@link rollLevel} for the measurement that moved it off the calendar.
   */
  act: number;
  /** Sign-chains the player has completed; gates the Ancients (bible §4). */
  unlockedSignChains?: ReadonlySet<string>;
}

/**
 * One wild creature, complete — every field `BattlerSpec` (core/types.ts) requires.
 *
 * `traits` used to be missing, and `BattlerSpec.traits` is not optional: the encounter could not be
 * handed to a battle without someone inventing the trait roll at the hand-off. bible §2 puts one
 * trait on every wild creature, so an encounter without traits is not an under-specified encounter,
 * it is a wrong one — and the balance report already described a player fielding wild-rolled traits
 * that the game had no way to produce. The roll is `rollWildTraits` (game/wild-battle.ts), off the
 * same seeded stream, so a replay of the seed meets the same animal down to its traits.
 */
export interface Encounter {
  nodeId: string;
  lineId: string;
  age: AgeClass;
  level: number;
  /** bible §2 — `balance.traits.slotsPerWildCreature` of them; Elders may roll the rare pool. */
  traits: Trait[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Rates — build-doc §7.2 derivations
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Steps in one foray, i.e. how many grid steps the player walks per clock tick.
 *
 * build-doc §4 says "a foray step rolls encounter**s**" while §3 L8 charges a foray ONE tick, so a
 * foray is an excursion of `stepsPerForay` rolls at `encounterChancePerStep`. The overworld makes
 * that literal — a completed movement step IS a foray step — and charges the tick once the count
 * comes round.
 *
 * ⚠ THE YEAR'S ENCOUNTER BUDGET IS NOT `ticksPerYear × stepsPerForay × encounterChancePerStep`.
 * That product was true once and is now false twice over. Encounters roll on the grass share, so
 * the rate is `stepEncounterChance` (core/foodweb.ts), not the bare tunable; and a battle costs
 * `clock.battleTicks`, so battles spend the same meter forays do and not every tick can buy a
 * foray. The honest form, and the one tests/unit/transcription.test.ts gates:
 *     e               = stepsPerForay × encounterTileFraction × encounterChancePerStep
 *     foraysPerYear   = ticksPerYear / (forayTicks + e × battleTicks)
 *     encountersPerYear = e × foraysPerYear
 * Shipped, that is 54.0 a year. The old product reports 449.28 — 8.3× the truth — which is what
 * makes it worth naming here rather than deleting quietly.
 */
export function stepsPerForay(balance: Balance): number {
  return balance.encounter.stepsPerForay;
}

export function encounterChancePerStep(balance: Balance): number {
  return balance.encounter.encounterChancePerStep;
}

/** Grass gating — the share of a node's walkable cells that are encounter tiles. */
export function encounterTileFraction(balance: Balance): number {
  return balance.encounter.encounterTileFraction;
}

/**
 * The chance that ONE walked step meets something — the two halves of grass gating multiplied.
 *
 * Encounters roll on tall grass, not on every cell of the map, so a walked step first has to BE on
 * an encounter tile (`encounterTileFraction`) and then has to roll (`encounterChancePerStep`).
 * Collapsing the pair into one draw here rather than rolling twice is deliberate and load-bearing:
 * L10 requires that a replay of the same seed meets the same creatures, and the draw ORDER is the
 * contract (chance, species, age, level, traits — see {@link rollForayStep}). A second draw for the
 * tile would renumber every draw after it and desynchronise every existing fixture.
 *
 * When painted maps exist, the fraction becomes a sampled property of the node's encounter mask and
 * this function takes the node — the product, and the single draw, stay exactly as they are.
 */
export function effectiveEncounterChance(balance: Balance): number {
  // Delegates: core/foodweb.ts owns the one definition, so the harness and the overworld cannot
  // drift apart on how dense the region is. Kept as a named re-export because game/ reads better
  // saying "effective encounter chance" than reaching into the food web for it.
  return stepEncounterChance(balance);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The derived table — read, never written (G3)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every line at this node with its DERIVED weight and its active/dormant flag.
 *
 * A straight pass-through to core/foodweb.ts, and it stays a pass-through: the dex, the sign cards,
 * the survey and the roll must all read one array, or "why is nothing spawning" gets two answers.
 */
export function encounterTable(ctx: ForayContext): EncounterWeight[] {
  const opts = ctx.unlockedSignChains
    ? { season: ctx.season, unlockedSignChains: ctx.unlockedSignChains }
    : { season: ctx.season };
  return encounterWeights(ctx.node, ctx.species, ctx.balance, opts);
}

/** Sum of the weights that can actually roll. Zero ⇒ the node is empty and nothing will appear. */
export function totalActiveWeight(table: readonly EncounterWeight[]): number {
  let total = 0;
  for (const entry of table) if (entry.active && entry.weight > 0) total += entry.weight;
  return total;
}

/** True when a foray here cannot produce anything — an emptied node, honestly reported. */
export function nodeIsEmpty(ctx: ForayContext): boolean {
  return totalActiveWeight(encounterTable(ctx)) <= 0;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Age and level of the individual met
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Which age class showed up — `balance.encounter.ageWeights` (shipped J .5 / A .4 / E .1).
 *
 * Iterated over `AGE_CLASSES` from core/types.ts, so the order is the vocabulary's and not this
 * file's, and consumes exactly one draw whatever the weights are.
 */
export function rollAge(balance: Balance, rng: Rng): AgeClass {
  const weights = balance.encounter.ageWeights;
  const picked = rng.pickWeighted(AGE_CLASSES, (age) => weights[age]);
  return picked ?? AGE_CLASSES[0];
}

/**
 * Wild level for the given ACT: `levelByYear[act - 1]`, jittered by ±`levelJitter`, held inside
 * [`minLevel`, `xp.levelCap`] (bible §2: "Levels 1–40").
 *
 * ⚠ THIS USED TO READ THE CALENDAR, and under two clocks that was a fail state by the back door.
 * The band was indexed `year - startYear`, so a player still in act 1 on Route 1 in calendar year 6
 * met **level 34–38** wild creatures while their heirs entered at ~5 — measured across years 1–30:
 * 6, 11, 20, 26, 31, 37, then 34–38 for ever. The calendar carries no countdown — a slow player is
 * meant to see the whole story — and a level band that climbs with a clock the player does not
 * control is that countdown by the back door.
 *
 * The array's OTHER reader — `tools/harness/player.ts`, which decides what an UNTRAINED player
 * walks into a gym with — has always indexed it by the leader's ACT, and its six values are tuned
 * against the gym ramp, which is an act ladder. So this is the two readings agreeing rather
 * than a new opinion: the key keeps its shipped name (renaming it is data + schema + harness, and
 * `_levelByYear` in data/balance.json now says what it really indexes).
 *
 * Acts past the end of the band table reuse its last entry rather than extrapolating, and act 0 —
 * the prologue — reads the first: nobody tuned a seventh band and the prologue is not act 1's
 * harder cousin.
 */
export function rollLevel(balance: Balance, act: number, rng: Rng): number {
  const band = balance.encounter.levelByYear;
  const index = Math.min(Math.max(0, act - 1), band.length - 1);
  const base = band[index] ?? band[band.length - 1] ?? balance.encounter.minLevel;
  const jitter = balance.encounter.levelJitter;
  const rolled = base + rng.int(-jitter, jitter + 1);
  return Math.min(balance.xp.levelCap, Math.max(balance.encounter.minLevel, rolled));
}

/* ────────────────────────────────────────────────────────────────────────────
 * The rolls
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Roll the species, then the individual. No chance gate — the caller has already decided that
 * something appears. Null when every weight is 0, which is what an emptied node looks like: there is
 * no fallback table to reach for (G3).
 */
export function rollEncounterAt(ctx: ForayContext, rng: Rng): Encounter | null {
  const lineId = rollEncounter(encounterTable(ctx), rng);
  if (lineId === null) return null;
  // BF-4. bible §4: Ancients "do not age and do not evolve — permanently Elder stage", and G10
  // exempts a caught one from year turns. The wild roll did not know that, so an unlocked Ancient
  // arrived as a Juvenile — measured at 4000 seeds: undermere J 40 / A 37 / E 10.
  //
  // `rollAge` is still CALLED and its draw still consumed, so the draw order (chance, species, age,
  // level, traits) is byte-identical and every seed replays to the same encounter (L10 / §8.1).
  // Only the value is clamped. Skipping the draw instead would have shifted every downstream roll.
  const rolled = rollAge(ctx.balance, rng);
  const age: AgeClass = ctx.species.byId.get(lineId)?.ancient === true ? "E" : rolled;
  const level = rollLevel(ctx.balance, ctx.act, rng);
  return {
    nodeId: ctx.node.id,
    lineId,
    age,
    level,
    // Last, so adding it did not renumber the draws that decide WHICH animal was met — the species,
    // age and level of any given seed are the same as before traits existed.
    traits: rollWildTraits(ctx.balance, age, rng),
  };
}

/**
 * One foray step: the per-step chance gate, then the derived roll.
 *
 * Draw order is fixed — chance, species, age, level, traits — so a replay of the same seed meets the
 * same creatures (L10 / §8.1). The gate is evaluated first and short-circuits, so a step that meets
 * nothing costs exactly one draw.
 */
export function rollForayStep(ctx: ForayContext, rng: Rng): Encounter | null {
  if (!rng.chance(effectiveEncounterChance(ctx.balance))) return null;
  return rollEncounterAt(ctx, rng);
}

/**
 * Headless whole-foray roll — `stepsPerForay` steps in one call. The balance harness and the
 * over-catch feasibility check want the excursion, not the frames; the overworld uses
 * {@link rollForayStep} per movement step instead, and the two consume the stream identically.
 */
export function rollForay(ctx: ForayContext, rng: Rng): Encounter[] {
  const out: Encounter[] = [];
  const steps = stepsPerForay(ctx.balance);
  for (let i = 0; i < steps; i += 1) {
    const met = rollForayStep(ctx, rng);
    if (met) out.push(met);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Legibility — Hard Req 10
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * WHY a line is not appearing — a closed set of four, because there are four ways core/foodweb.ts
 * can hand back an inactive entry and Hard Req 10 needs them told apart.
 *
 * `"wiped"` and `"gated"` used to be the same word on screen. `AbsenceReason` could say
 * "dormant" | "migrating" | null, and null was documented as "the line is simply gone" — so a
 * sign-chain-gated Ancient (bible §4: not catchable until you have walked its chain) printed
 * exactly what a species the player had caught to extinction printed, while its real count sat at 1.
 * On `r2`, on the never-cut vertical slice, the HUD read `undermere-line: 1 (absent)`. bible §5 and
 * Hard Req 10 require that a wiped line and an away line be distinguishable; a third state the
 * vocabulary could not name broke that for the one species the finale hangs on.
 */
export type AbsenceCause =
  /** count 0 at this node. The survey's own number is the whole explanation (G7). */
  | "wiped"
  /** Out of its `seasonalWindow`, far side — core/foodweb.ts `migrantStatus`. */
  | "dormant"
  /** Out of its `seasonalWindow`, one season either side — on the move. */
  | "migrating"
  /** Present in real numbers, held out of the pool until its sign chain is unlocked (bible §4). */
  | "gated";

export interface AbsenceReason {
  lineId: string;
  cause: AbsenceCause;
  /** The live count — Hard Req 2 says the UI shows the real number, never a proxy. */
  count: number;
}

/**
 * Classify one inactive entry, from the entry and its live count alone.
 *
 * NOT a restatement of core/foodweb.ts's rules (G3/G6 — this file may not decide what is gated any
 * more than it may decide what eats what). It reads the shape of what core returned:
 * `encounterWeights` produces an inactive entry in exactly three ways — with a `dormantReason` (the
 * migrant branch), or without one and with weight 0, which is either the gate branch or a count of
 * 0. The count separates those last two, and it is the same number the survey prints. The
 * classification is proved against core rather than assumed: `tests/unit/encounters.test.ts` walks
 * every shipped node in every season and checks that every line called `"gated"` becomes active when
 * — and only when — its own chain is unlocked.
 *
 * G7: numbers only. Nothing here editorialises about what the player did; the count is the statement.
 */
export function absenceCauseOf(entry: EncounterWeight, count: number): AbsenceCause {
  if (entry.dormantReason) return entry.dormantReason;
  if (count <= 0) return "wiped";
  return "gated";
}

/**
 * Why is each absent line absent? Derived from the same table the roll uses, so seasonal absence is
 * never confusable with a population crash, nor with a gate (bible §5 legibility requirement).
 */
export function absentLines(ctx: ForayContext): AbsenceReason[] {
  const out: AbsenceReason[] = [];
  for (const entry of encounterTable(ctx)) {
    if (entry.active && entry.weight > 0) continue;
    const count = ctx.node.populations[entry.lineId]?.count ?? 0;
    out.push({ lineId: entry.lineId, cause: absenceCauseOf(entry, count), count });
  }
  return out;
}
