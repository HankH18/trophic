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
 * WHERE, AS WELL AS WHAT. A foray step now asks two questions, and they have two owners. WHAT can
 * be met is `encounterWeights()` off the node's populations, as above. WHERE it can be met is the
 * node's encounter mask, derived from the hand-authored ASCII layout the art lane composes the map
 * from — so the long grass a player sees is the long grass that rolls, and a step on a road or a
 * town square meets nothing. The mask carries no species, no weight and no count; it can silence a
 * cell and it can never change which animal a cell hands over (G3).
 *
 * NUMBERS (G11): `balance.encounter` — `stepsPerForay`, `encounterChancePerStep`,
 * `encounterTileFraction`, `encounterTerrainChar`, `ageWeights`, `levelByYear`, `levelJitter`,
 * `minLevel` — plus `balance.xp.levelCap`. Nothing is a literal.
 * RANDOMNESS (G11): `core/rng.ts` only. No `Math.random`.
 */

import {
  cellRollsEncounters,
  encounterMaskFromLayout,
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
  type EncounterMask,
  type EncounterWeight,
  type Season,
  type Trait,
} from "../core/types";
// The art lane's own answer to "which characters can the player not stand on". core/ may not reach
// tools/ (tests/gates/guardrails.test.ts holds its import closure to data/ and zod), so the legend
// meets the game HERE and is handed down — one legend, not a second list of wall characters.
import { DEFAULT_LEGEND } from "../tools/mapgen/legend";
import { rollWildTraits } from "./wild-battle";

// The twelve hand-authored layouts, statically imported exactly as core/schemas.ts statically
// imports the twelve node JSONs: in the bundle, no fetch, no filesystem, nothing to resolve at run
// time. See {@link encounterMaskFor} for why they are the encounter mask's only source.
import bowerdeepLayout from "../tools/mapgen/layouts/bowerdeep.txt?raw";
import brackwaterLayout from "../tools/mapgen/layouts/brackwater.txt?raw";
import cindershelfLayout from "../tools/mapgen/layouts/cindershelf.txt?raw";
import duskhollowLayout from "../tools/mapgen/layouts/duskhollow.txt?raw";
import hearthollowLayout from "../tools/mapgen/layouts/hearthollow.txt?raw";
import r1Layout from "../tools/mapgen/layouts/r1.txt?raw";
import r2Layout from "../tools/mapgen/layouts/r2.txt?raw";
import r3Layout from "../tools/mapgen/layouts/r3.txt?raw";
import r4Layout from "../tools/mapgen/layouts/r4.txt?raw";
import r5Layout from "../tools/mapgen/layouts/r5.txt?raw";
import sanctumApproachLayout from "../tools/mapgen/layouts/sanctum-approach.txt?raw";
import sanctumLayout from "../tools/mapgen/layouts/sanctum.txt?raw";

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
  /**
   * WHERE the player is standing, and the mask that says whether animals are there.
   *
   * OPTIONAL, AND THE TWO CASES ARE DIFFERENT QUESTIONS RATHER THAN A FALLBACK:
   *   • PRESENT — the caller knows the cell. The step rolls at `encounterChancePerStep` if that cell
   *     is encounter terrain and at nothing if it is not. This is what the overworld asks, because a
   *     walked step happens somewhere.
   *   • ABSENT — the caller has no position to give: the balance harness walking a headless region,
   *     or the year's encounter budget. The step rolls at the position-blind average,
   *     `stepEncounterChance`, which is what every caller did before the mask existed. It is not a
   *     degraded answer to the first question; it is the honest answer to a different one.
   */
  footing?: ForayFooting;
}

/** The cell a foray step was completed on, against its node's derived encounter mask. */
export interface ForayFooting {
  /**
   * The node's mask — `encounterMaskFor(nodeId, balance)`. It must be the mask of `ForayContext.node`;
   * nothing checks, because the mask carries no populations and could not be checked against one
   * without this file learning what lives where, which is exactly the job G3 leaves to the node JSON.
   */
  mask: EncounterMask;
  /** Collision-grid cell, `game/movement.ts` `TilePosition` — the tile the step ENDED on. */
  col: number;
  row: number;
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
 *
 * ⚠ THE FRACTION IN THAT FORMULA IS AN AVERAGE, NOT THE GATE THE GAME ROLLS. A budget cannot be
 * asked cell by cell, so it uses the position-blind form; the running game reads the node's mask
 * instead. They agree over a route by measurement rather than by luck — the five routes carry
 * 24.10–25.99 % encounter terrain against the shipped 0.25 — and they deliberately do NOT agree in a
 * town, where the real share is 5.46–10.16 % and a player walking the square now meets far less than
 * this budget would predict. See `core/types.ts` at `encounterTileFraction`.
 */
export function stepsPerForay(balance: Balance): number {
  return balance.encounter.stepsPerForay;
}

export function encounterChancePerStep(balance: Balance): number {
  return balance.encounter.encounterChancePerStep;
}

/**
 * The POSITION-BLIND share of a node's walkable cells that are encounter terrain.
 *
 * ⚠ IT IS NOT THE SPATIAL GATE ANY MORE. It was: this fraction used to be applied to every walked
 * cell of every node, so a step on a road or a town square met animals at the rate of a step in tall
 * grass. The gate is now {@link encounterMaskFor} — a real per-cell answer read off the layout.
 * What survives here is the average, for callers with no cell to read; `core/types.ts` states which
 * two those are and why the shipped 0.25 is the ROUTE share rather than the region's.
 */
export function encounterTileFraction(balance: Balance): number {
  return balance.encounter.encounterTileFraction;
}

/**
 * The chance one walked step meets something WHEN THE CALLER CANNOT SAY WHERE THE PLAYER IS.
 *
 * Delegates: core/foodweb.ts owns the one definition, so the harness and the overworld cannot drift
 * apart on how dense the region is. Kept as a named re-export because game/ reads better saying
 * "effective encounter chance" than reaching into the food web for it.
 *
 * The positioned answer is {@link stepChanceOn}, and the two are the same claim at different
 * resolutions: this one is `share × chance` with the share averaged; that one is `chance` where the
 * grass actually is and zero where it is not.
 */
export function effectiveEncounterChance(balance: Balance): number {
  return stepEncounterChance(balance);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The encounter mask — WHERE. (The node JSON still says WHAT: G3.)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The twelve hand-authored layouts, by node id.
 *
 * ⚠ NOT A TABLE G3 CARES ABOUT, and the distinction is the point of this whole section: there is no
 * species id here, no weight, no bias and no count. A layout says which CELLS of a map are long
 * grass. What lives in that grass is `data/nodes/<id>.json`'s `populations`, derived into weights by
 * core/foodweb.ts and by nothing else. The mask can silence a cell; it cannot change which animal a
 * cell hands over, and it cannot conjure one the node does not declare.
 *
 * The ids are the map's keys rather than parsed out of a path, because a node whose layout is
 * missing must be a visible absence here — not a directory listing that quietly came back one short.
 * `tests/gates/layout-encounter-contract.test.ts` takes its scope from `data/nodes/` and names any
 * node with no layout by name, which is the check that keeps this map complete.
 */
const LAYOUT_TEXT: Readonly<Record<string, string>> = {
  bowerdeep: bowerdeepLayout,
  brackwater: brackwaterLayout,
  cindershelf: cindershelfLayout,
  duskhollow: duskhollowLayout,
  hearthollow: hearthollowLayout,
  r1: r1Layout,
  r2: r2Layout,
  r3: r3Layout,
  r4: r4Layout,
  r5: r5Layout,
  "sanctum-approach": sanctumApproachLayout,
  sanctum: sanctumLayout,
};

/**
 * The characters the player cannot stand on, taken from the art lane's legend rather than re-listed.
 *
 * `tools/mapgen/legend.ts` is explicit that `#` is the only character the ENGINE blocks and that
 * `tools/mapgen/layout.ts` normalises every `blocks: true` character to `#` before the collision
 * parser sees it — so a raw layout still spells its walls `B`, `T`, `W`, `R`, `F`, and a second list
 * of them here would be a copy that goes stale the first time a terrain kind is added. This feeds
 * only the mask's `walkableCells`, the denominator of a node's encounter-terrain share; it never
 * decides whether a cell rolls.
 */
const BLOCKING_CHARS: ReadonlySet<string> = new Set(
  DEFAULT_LEGEND.filter((entry) => entry.blocks).map((entry) => entry.char),
);

/**
 * Masks are derived once per node and kept. The derivation is pure and total over a fixed input —
 * the same layout text and the same balance always produce the same mask — so this is a cache and
 * never state: clearing it would change nothing but the time taken. It exists because a mask is
 * built from a 64x64 parse and the overworld would otherwise redo that on every completed step.
 */
const MASK_CACHE = new Map<string, EncounterMask>();

/**
 * The node's encounter mask, or `null` when this id has no layout.
 *
 * ⚠ NULL IS NOT A NODE WITH NO GRASS. A node that genuinely draws none has a mask whose
 * `encounterCells` is 0 and answers "no" for every cell — a claim its layout makes. `null` means
 * nothing was ASKED about a place with a layout: an interior room, a synthetic node in a test, an id
 * that does not name a map. A caller that gets `null` has no position to give and should leave
 * `ForayContext.footing` unset, which puts the roll back on the position-blind average rather than
 * silencing a node by accident.
 *
 * A real node missing from `LAYOUT_TEXT` is a failure rather than a null in practice:
 * `tests/gates/layout-encounter-contract.test.ts` enumerates from `data/nodes/` and names it.
 */
export function encounterMaskFor(nodeId: string, balance: Balance): EncounterMask | null {
  const cached = MASK_CACHE.get(nodeId);
  if (cached) return cached;
  const text = LAYOUT_TEXT[nodeId];
  if (text === undefined) return null;
  const mask = encounterMaskFromLayout(nodeId, text, balance, BLOCKING_CHARS);
  MASK_CACHE.set(nodeId, mask);
  return mask;
}

/** Every node id that has a layout, so a caller can check its coverage instead of assuming it. */
export function maskedNodeIds(): string[] {
  return Object.keys(LAYOUT_TEXT).sort();
}

/**
 * The chance a step COMPLETED ON THIS CELL meets something: the full per-step chance on encounter
 * terrain, and nothing anywhere else.
 *
 * There is no fraction in it. The fraction was the stand-in for not knowing where the player was;
 * with the mask in hand the question is answered rather than averaged.
 */
export function stepChanceOn(balance: Balance, mask: EncounterMask, col: number, row: number): number {
  return cellRollsEncounters(mask, col, row) ? balance.encounter.encounterChancePerStep : 0;
}

/** True when this context's step was completed on encounter terrain. False when it has no footing. */
export function standingOnEncounterTerrain(ctx: ForayContext): boolean {
  const footing = ctx.footing;
  if (!footing) return false;
  return cellRollsEncounters(footing.mask, footing.col, footing.row);
}

/**
 * The probability this step meets something — the one number {@link rollForayStep} is a draw
 * against, whichever question the caller is asking.
 */
export function stepChanceFor(ctx: ForayContext): number {
  const footing = ctx.footing;
  if (!footing) return effectiveEncounterChance(ctx.balance);
  return stepChanceOn(ctx.balance, footing.mask, footing.col, footing.row);
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
 * One foray step: the per-step chance gate, then the terrain, then the derived roll.
 *
 * Draw order is fixed — chance, species, age, level, traits — so a replay of the same seed meets the
 * same creatures (L10 / §8.1). The gate is evaluated first and short-circuits, so a step that meets
 * nothing costs exactly one draw.
 *
 * ══ THE TERRAIN IS A FILTER ON THE ONE DRAW. IT IS NOT A SECOND DRAW, AND IT IS NOT A ZERO ══
 *
 * Two spellings would have been shorter and both are wrong, so the reasons are here rather than in a
 * commit message:
 *
 *   • A SECOND `rng` CALL for the tile would renumber every draw after it and desynchronise every
 *     fixture in the project. This is the constraint that shaped the old scalar as well — the
 *     comment it replaces said so — and nothing about it has softened.
 *   • `rng.chance(0)` OFF GRASS looks like the tidy expression of "no animals here" and quietly is
 *     not: `core/rng.ts` returns false for `p <= 0` **without consuming a draw**. The number of
 *     draws a walk costs would then depend on the terrain the player happened to cross, so two runs
 *     of the same action log over a redrawn map would diverge, and
 *     `tests/unit/overworld-scene.test.ts`'s indoor guard — whose control is "the same walk OUTDOORS
 *     does move the encounter stream" — would start failing on a walk that stayed off the grass.
 *
 * So the step always makes exactly ONE draw, against the full `encounterChancePerStep` when the
 * caller gave a footing, and the terrain admits or refuses the result afterwards. The distribution
 * is identical to {@link stepChanceFor}; the stream's arithmetic is not.
 *
 * With no footing the behaviour is what it has always been, draw for draw: the position-blind
 * average, which is the honest answer for a caller that cannot say where the player is standing.
 */
export function rollForayStep(ctx: ForayContext, rng: Rng): Encounter | null {
  const gate = ctx.footing ? encounterChancePerStep(ctx.balance) : effectiveEncounterChance(ctx.balance);
  if (!rng.chance(gate)) return null;
  if (ctx.footing && !standingOnEncounterTerrain(ctx)) return null;
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
