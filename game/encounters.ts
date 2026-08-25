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
 *     extinction check anywhere in the code. The cascade is visible because the ledger and the
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

import { encounterWeights, rollEncounter, type EcoNode, type SpeciesIndex } from "../core/foodweb";
import type { Rng } from "../core/rng";
import { AGE_CLASSES, type AgeClass, type Balance, type EncounterWeight, type Season } from "../core/types";

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
  /** From the save. Sets the wild level band (`balance.encounter.levelByYear`). */
  year: number;
  /** Sign-chains the player has completed; gates the Ancients (bible §4). */
  unlockedSignChains?: ReadonlySet<string>;
}

/** One wild creature, ready for `BattlerSpec` (core/types.ts) once the battle lane adds traits. */
export interface Encounter {
  nodeId: string;
  lineId: string;
  age: AgeClass;
  level: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Rates — build-doc §7.2 derivations, DEVIATIONS D18
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Steps in one foray, i.e. how many grid steps the player walks per clock tick.
 *
 * DEVIATIONS D18: build-doc §4 says "a foray step rolls encounter**s**" while §3 L8 charges a foray
 * ONE tick, so a foray is an excursion of `stepsPerForay` rolls at `encounterChancePerStep`. The
 * overworld makes that literal — a completed movement step IS a foray step — and charges the tick
 * once the count comes round. `clock.ticksPerYear × stepsPerForay × encounterChancePerStep` is
 * therefore the player's real maximum encounters per year, which is the arithmetic the year-1
 * over-catch beat depends on (build-doc §15 I2).
 */
export function stepsPerForay(balance: Balance): number {
  return balance.encounter.stepsPerForay;
}

export function encounterChancePerStep(balance: Balance): number {
  return balance.encounter.encounterChancePerStep;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The derived table — read, never written (G3)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every line at this node with its DERIVED weight and its active/dormant flag.
 *
 * A straight pass-through to core/foodweb.ts, and it stays a pass-through: the dex, the sign cards,
 * the ledger and the roll must all read one array, or "why is nothing spawning" gets two answers.
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
 * Wild level for the given year: `levelByYear[year - startYear]`, jittered by ±`levelJitter`, held
 * inside [`minLevel`, `xp.levelCap`] (bible §2: "Levels 1–40").
 *
 * Years past the end of the band table reuse its last entry rather than extrapolating — a six-entry
 * table for a six-year game is exact, and an epilogue projection past year 6 should not invent a
 * level ramp nobody tuned.
 */
export function rollLevel(balance: Balance, year: number, rng: Rng): number {
  const band = balance.encounter.levelByYear;
  const index = Math.min(Math.max(0, year - balance.clock.startYear), band.length - 1);
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
  return {
    nodeId: ctx.node.id,
    lineId,
    age: rollAge(ctx.balance, rng),
    level: rollLevel(ctx.balance, ctx.year, rng),
  };
}

/**
 * One foray step: the per-step chance gate, then the derived roll.
 *
 * Draw order is fixed — chance, species, age, level — so a replay of the same seed meets the same
 * creatures (L10 / §8.1). The gate is evaluated first and short-circuits, so a step that meets
 * nothing costs exactly one draw.
 */
export function rollForayStep(ctx: ForayContext, rng: Rng): Encounter | null {
  if (!rng.chance(encounterChancePerStep(ctx.balance))) return null;
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

export interface AbsenceReason {
  lineId: string;
  /** "migrating" / "dormant" from core/foodweb.ts, or null when the line is simply gone. */
  seasonal: "dormant" | "migrating" | null;
  /** The live count — Hard Req 2 says the UI shows the real number, never a proxy. */
  count: number;
}

/**
 * Why is this line not appearing? Derived from the same table the roll uses, so seasonal absence is
 * never confusable with a population crash (bible §5 legibility requirement).
 *
 * G7: numbers only. Nothing here is allowed to editorialise about what the player did — the count
 * is the whole statement.
 */
export function absentLines(ctx: ForayContext): AbsenceReason[] {
  const out: AbsenceReason[] = [];
  for (const entry of encounterTable(ctx)) {
    if (entry.active && entry.weight > 0) continue;
    out.push({
      lineId: entry.lineId,
      seasonal: entry.dormantReason ?? null,
      count: ctx.node.populations[entry.lineId]?.count ?? 0,
    });
  }
  return out;
}
