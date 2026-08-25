/**
 * game/ledger-view.ts — the three number screens of build-doc §15 C4, as pure view models:
 * the per-node **ecology ledger**, the **dex entry**, and the **creature summary card**.
 *
 * Why these live outside the Phaser scenes (locked decision L11's shape, applied to the UI):
 *
 * 1. **Hard Req 2 is a claim about integers on screen** — "the in-game ledger shows real numbers,
 *    never proxies". A claim about rendered text is only checkable if the text is produced by
 *    something a test can call. Every renderer below returns strings; `tests/unit/ledger-view.test.ts`
 *    asserts them character for character against a fixture save.
 * 2. **build-doc §8.3 / `no_shadow_tables`:** "ledger UI reads `nodeStates` objects directly". Every
 *    count on this page is read at render time out of the `NodeState` it was handed —
 *    `state.populations[lineId].count` — and nothing here caches, stores, mirrors or summarises those
 *    numbers into a second structure that could go stale. `LedgerPage` is the render of one call,
 *    built and thrown away; it is not a table anything else reads.
 * 3. **build-doc §4 step 6 / Hard Req 7:** "The epilogue reuses the same renderer over the final
 *    state — the ending is a ledger read." So every entry point takes the state as an ARGUMENT.
 *    Nothing here reaches for a current save, a singleton or a global; hand it `projectRegion`'s
 *    output and it renders the epilogue.
 *
 * Guardrail G7 — no moralizing copy about catching, here or in any string this file emits. The
 * labels are nouns and the values are integers. The ledger is the moral.
 *
 * Guardrail G3 / §8.3 — nothing here decides who eats whom, what a species' encounter weight is, or
 * what rate it breeds at. Every such answer is asked of `core/`:
 *
 *   - seasonal status ................ `core/foodweb.ts` `migrantStatus`
 *   - "would the roll produce this" .. `core/foodweb.ts` `encounterWeights` (the roll's own call)
 *   - the breed rate in force ........ `core/ecosim.ts` `step`'s report (see {@link effectiveRates})
 *
 * Those are the calls the sim and the encounter roll make themselves, so the screen cannot drift
 * from them — but note what that does and does not buy. `DexEntry.active` is the SEASONAL answer
 * only; the roll additionally applies bible §4's sign-chain gate and weights by the live count, so
 * `active` alone is not the roll's verdict. `encounterGated` carries the second filter and the
 * count is printed beside it, which is what Hard Req 10 asks the card to make legible.
 */

import { effectiveStats, movesKnownAt } from "../core/battle";
import { seasonAt } from "../core/clock";
import { derivePresence, ecoConstants, fromNodeState, makeContext, step } from "../core/ecosim";
import {
  encounterWeights,
  indexSpecies,
  migrantStatus,
  orderedLineIds,
  toEcoNode,
  webAgeClass,
  webRole,
  type EcoNode,
  type EncounterOptions,
  type SpeciesIndex,
} from "../core/foodweb";
import { isNever, projectedRetirementYear, retiresBeyondFinalYear } from "../core/lifecycle";
import { createRng } from "../core/rng";
import { AGE_CLASSES } from "../core/types";
import type {
  AgeClass,
  Balance,
  Boon,
  Content,
  MoveDef,
  NodeFile,
  NodeState,
  OwnedCreature,
  Role,
  SaveFile,
  Season,
  SpeciesLine,
  Stats,
  Trait,
  TypeName,
} from "../core/types";

/* ────────────────────────────────────────────────────────────────────────────
 * Shared formatting. Layout only — no gameplay constant is decided here (G11);
 * every gameplay number on these screens is read from state or from balance.json.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Column widths, in monospace character cells. Presentation, not gameplay. */
const W_LABEL = 14;
const W_COUNT = 5;
const W_CAP = 5;
const BREED_DECIMALS = 3;

/**
 * Decimals for the node's REAL-valued accumulators. `floraStock` and `recentDeaths` are `z.number()`
 * in core, not integers (build-doc §7.3: flora is an "abstract producer stock", recentDeaths a
 * decaying accumulator), so the moment one season steps they carry seventeen significant digits.
 * Printed raw they made the ledger's totals line 99 characters wide on a 480px canvas and clipped
 * the two integers the line exists for straight off the right edge.
 */
const REAL_DECIMALS = 1;

/**
 * How many extra decimals a shortened value may grow to keep a non-zero number from printing as 0.
 * Past this it is printed in exponent form instead, which is shorter than the zeros.
 */
const EXTRA_DECIMALS_MAX = 5;

/** What a field reads when the answer is genuinely unknown — never what a COUNT reads. */
export const NO_VALUE = "—";

/** `value` cut — never rounded — to `decimals`, toward zero. */
function truncateTo(value: number, decimals: number): string {
  const scale = 10 ** decimals;
  return (Math.trunc(value * scale) / scale).toFixed(decimals);
}

/**
 * A real number shortened to `decimals`, under the two rules that keep shortening from stating
 * something the state does not hold. The shared half of {@link renderNumber} and {@link renderRate}.
 *
 *  1. **Rounding may never carry into the integer part.** `(99.95).toFixed(1)` is `"100.0"` — and
 *     100 is `balance.ecosim.floraMax`, the ceiling the node had NOT reached. Where the carry would
 *     cross an integer the value is cut instead, so an integer ceiling or floor is never printed by
 *     a value that has not got there. Everywhere else it rounds, because rounding is the more
 *     accurate answer and cutting would print 43.099999999999994 — a stock that is 43.1 — as 43.0.
 *  2. **A non-zero value never reads as zero.** `(0.04).toFixed(1)` is `"0.0"`, and 0 is this
 *     screen's word for gone. So the fraction widens until a significant digit appears, and past
 *     {@link EXTRA_DECIMALS_MAX} the value goes to exponent form — still a number, still not 0.
 */
function shortenReal(value: number, decimals: number): string {
  for (let d = decimals; d <= decimals + EXTRA_DECIMALS_MAX; d += 1) {
    const rounded = value.toFixed(d);
    const carried = Math.trunc(Number(rounded)) !== Math.trunc(value);
    const text = carried ? truncateTo(value, d) : rounded;
    if (Number(text) !== 0) return text;
  }
  return value.toExponential(1);
}

/**
 * A number as the screens print it: an integer verbatim, a real value shortened to {@link
 * REAL_DECIMALS}.
 *
 * This is a WIDTH bound, and it goes through {@link shortenReal} so that shortening can never state
 * something the state does not hold — the two lies `value.toFixed(1)` told being a `floraStock` of
 * 99.95 printed as `100.0` (the cap `balance.ecosim.floraMax` names, which the node had not
 * reached) and a `recentDeaths` of 0.04 printed as `0.0` (which is this screen's word for gone, for
 * a number §7.2 makes the live Scavenger encounter multiplier).
 *
 * Every count on these screens is an integer and passes through unchanged; only the two real-valued
 * node accumulators are ever shortened. Use it for anything whose value comes out of `NodeState`,
 * because two of those fields are floats and the flora vertex on the web diagram is one of them.
 */
export function renderNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  return shortenReal(value, REAL_DECIMALS);
}

/**
 * A breed rate as the `breed` column prints it — the same two rules as {@link renderNumber}, at
 * {@link BREED_DECIMALS}, and always with its decimals so the column lines up.
 *
 * The second rule matters more here than anywhere else on the screen. `0.000` in this column is
 * what a line whose births the sim has SUPPRESSED reads (a starving apex, mid-cascade), so a rate
 * that is merely very small must never borrow that spelling: `toFixed(3)` printed 0.0004 as
 * `0.000`, which is a line that is breeding, drawn as a line that is not. The shipped clamps keep
 * rates well above that today (`ecosim.foodFactorClampMin` × the smallest stored rate), which is
 * exactly why this would have gone unnoticed after a retune.
 */
export function renderRate(value: number): string {
  if (value === 0) return (0).toFixed(BREED_DECIMALS);
  return shortenReal(value, BREED_DECIMALS);
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function padLabel(text: string): string {
  return text.length >= W_LABEL ? text : text.padEnd(W_LABEL, " ");
}

/**
 * The text metrics the three C4 scenes draw with, in ONE place so that the width a test checks is
 * the width the scene actually uses. `advancePx` is the cell advance of the 10px monospace face
 * measured from a live Phaser `Text` object at this size.
 *
 * Presentation only: G11 governs gameplay constants, which live in `data/balance.json`. The canvas
 * these are measured against does not — `balance.map.virtualWidth` is read for that.
 */
export const SCREEN_TEXT = {
  fontFamily: "monospace",
  fontPx: 10,
  lineHeight: 12,
  padPx: 8,
  advancePx: 6,
} as const;

/**
 * How many characters fit on one line drawn at `leftPx`, leaving one pad at the right edge.
 *
 * A line longer than this does not wrap and does not shrink — Phaser draws it straight off the
 * canvas, and the reader loses whatever was at the end of it. `tests/unit/ledger-view.test.ts`
 * asserts every line these renderers can emit against this budget.
 */
export function columnBudget(balance: Balance, leftPx: number): number {
  return Math.floor((balance.map.virtualWidth - leftPx - SCREEN_TEXT.padPx) / SCREEN_TEXT.advancePx);
}

/**
 * The art slots the dex and the summary card draw their text beside — here rather than in the
 * scenes so the left edge a width test measures from is the left edge the scene draws at.
 */
export const DEX_ART_BOX = { x: 8, y: 32, width: 128, height: 128 } as const;
export const SUMMARY_ART_BOX = { x: 8, y: 32, width: 96, height: 96 } as const;

/** Where a card's text starts, given the art slot it sits beside. */
export function textLeftOf(box: { x: number; width: number }): number {
  return box.x + box.width + SCREEN_TEXT.padPx;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The ecology ledger (bible §12 "ecology ledger (per-node populations + web view)")
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The number of season steps in one year, derived from the clock rather than counted by hand:
 * `ticksPerYear / ticksPerSeason` (build-doc §3 L8, 16 / 4). It is how far back "recent seasons"
 * reaches, so retuning the clock retunes the trend window with it (INV-3).
 */
export function seasonsPerYear(balance: Balance): number {
  return Math.max(1, Math.round(balance.clock.ticksPerYear / balance.clock.ticksPerSeason));
}

/**
 * One reading of a node, taken at a season boundary.
 *
 * `NodeState` (build-doc §7.8) carries the CURRENT counts and nothing else — there is no history in
 * the save, and this module will not invent one by re-simulating (that would be a second sim, and it
 * would disagree with the real one the moment anything else touched a population). So the trend is
 * kept honestly: whoever runs the season step records a sample, and a ledger opened with no samples
 * renders its trend as one number — the live one — and a net of `NO_VALUE`, never a fabricated slope.
 *
 * **The caller contract, and why `year`/`season` are on the sample.** Under the natural wiring —
 * step the season, then record a sample — the newest sample IS the reading the ledger is currently
 * showing. {@link buildLedgerPage} therefore REPLACES that reading with the live count rather than
 * appending beside it; appending drew the current number twice and ended every trend with a flat
 * step that never happened. The stamp is what makes the two distinguishable, so a sample recorded
 * without its real year and season will corrupt the trend it is put into.
 */
export interface LedgerSample {
  year: number;
  season: Season;
  /** line id → count, copied out of the state at sample time. */
  counts: Record<string, number>;
  floraStock: number;
}

export type LedgerHistory = readonly LedgerSample[];

/** Snapshot the live counts. Pure; the caller owns where the history lives. */
export function sampleNodeState(state: NodeState, year: number, season: Season): LedgerSample {
  const counts: Record<string, number> = {};
  for (const lineId of Object.keys(state.populations)) {
    const pop = state.populations[lineId];
    if (pop) counts[lineId] = pop.count;
  }
  return { year, season, counts, floraStock: state.floraStock };
}

/** Append a sample, keeping at most one year of seasons. Returns a new array; never mutates. */
export function recordSample(
  history: LedgerHistory,
  sample: LedgerSample,
  balance: Balance,
): LedgerSample[] {
  const keep = seasonsPerYear(balance);
  return [...history, sample].slice(-keep);
}

export interface LedgerRow {
  lineId: string;
  /** The form name the ledger shows: the age class the web reads (balance.ecosim.webRoleAgeClass). */
  label: string;
  /** Read straight off `state.populations[lineId].count` — Hard Req 2's real integer. */
  count: number;
  carryCap: number;
  /**
   * The rate this line will actually breed at this season — `core/ecosim.ts`'s own report of what
   * it multiplies the count by, NOT the rate stored in the state and NOT a partial product of it.
   * See {@link effectiveRates}: on the shipped year-1 state it differs from the stored rate on 34
   * rows across 10 nodes, in both directions, and it is 0 for a starving line.
   *
   * The binding that makes this checkable: `count × breedRate` IS the sim's own projected births.
   */
  breedRate: number;
  /** `state.populations[lineId].breedRate` as stored — no Ancient in range, food at parity. */
  baseBreedRate: number;
  /**
   * The stored rate after §7.3 step 1's Ancient presence effects and before food. It differs from
   * `baseBreedRate` exactly when an Ancient is in range, which is what {@link LedgerPage.presenceSources}
   * names and what Hard Req 7 turns off when the player catches one.
   */
  presenceBreedRate: number;
  /** `core/ecosim.ts`'s own `foodFactor` for this line this season. */
  foodFactor: number;
  /** `core/ecosim.ts`'s own `starving` flag — when true the sim gives this line no births at all. */
  starving: boolean;
  role: Role;
  /**
   * The retained readings, oldest first, at most {@link seasonsPerYear} of them, the live count
   * last. The live count REPLACES the newest sample when that sample is this same year and season
   * (it is the same reading, taken at the boundary), and is appended otherwise.
   */
  trend: number[];
  /** last − first across the rendered trend; null when there is no earlier reading to compare to. */
  delta: number | null;
  /** count === 0. Rendered as the integer 0, never as a word. */
  extinct: boolean;
  /** True for the four seasonal migrants (Hard Req 10). */
  seasonal: boolean;
  /** The migrant's window, so the row can name it rather than describe the population. */
  seasonalWindow?: Season;
  /** Set when a migrant is out of its window — so a seasonal 0 is never read as a crash. */
  dormantReason?: "dormant" | "migrating";
}

export interface LedgerPage {
  nodeId: string;
  nodeName: string;
  biome: string;
  year: number;
  season: Season;
  floraStock: number;
  floraMax: number;
  recentDeaths: number;
  rows: LedgerRow[];
  /** Sum of the rendered counts — the same integers, added up. */
  totalIndividuals: number;
  /** How many lines at this node stand at 0. */
  atZero: number;
  /**
   * The Ancients whose presence is lifting breed rates at this node, by the name the rows use —
   * `core/ecosim.ts` `derivePresence`'s own `sources` list ("the ledger shows what the player is
   * about to lose"). Empty when nothing is in range. Catch the Ancient and the list empties, the
   * `breed` column drops back to the stored rate, and Hard Req 7's cost is on screen as a number.
   */
  presenceSources: string[];
}

/**
 * The region a ledger page is read out of.
 *
 * **Why a page needs the whole region and not just its own node.** build-doc §7.3 step 1's presence
 * effects reach `balance.ecosim.presenceRadiusNodes` hops through the node graph, so what a line
 * breeds at HERE depends on where the Ancients are THERE. A ledger handed one detached `NodeState`
 * cannot know its own breed rates, and the version of this module that took one printed the stored
 * rate instead — a number the sim was not using. Requiring the region makes that mistake
 * unavailable rather than merely fixed.
 */
export interface LedgerRegion {
  /** Every node file the states belong to. */
  files: readonly NodeFile[];
  /** build-doc §7.8 `nodeStates` — or, for the epilogue, `projectRegion`'s output. */
  states: Readonly<Record<string, NodeState>>;
}

export interface LedgerArgs {
  /** Which node in {@link region} to render. */
  nodeId: string;
  region: LedgerRegion;
  species: readonly SpeciesLine[];
  balance: Balance;
  year: number;
  season: Season;
  history?: LedgerHistory;
}

/**
 * What one line's breed rate is made of this season, as `core/ecosim.ts` reports it.
 *
 * Three numbers rather than one because they answer different questions and the ledger needs both
 * of the first two: `presence` is what an Ancient in range is doing (Hard Req 7 — catch it and this
 * falls back to the stored rate), `inForce` is what the sim will actually multiply the count by.
 */
export interface SpeciesRate {
  /** `breedRate × presenceMult` — §7.3 step 1's Ancient effects, before food is considered. */
  presence: number;
  /** The multiplier the sim applies to the count this season. 0 when it suppresses births. */
  inForce: number;
  /** `core/ecosim.ts`'s own `foodFactor` — availablePrey/demand, clamped. */
  foodFactor: number;
  /** `core/ecosim.ts`'s own `starving` flag for this line this season. */
  starving: boolean;
}

/**
 * The breed rate `core/ecosim.ts` will use for each line at this node this season, and the Ancients
 * responsible — both taken from core, neither recomputed here.
 *
 * **The two defects this exists to close.** The stored `populations[line].breedRate` is only the
 * rate with nothing in range and food at parity. §7.3 step 1 is
 * `births = count × breedRate × foodFactor × presenceMult`, and a starving line puts **nothing**
 * into the next generation (`balance.ecosim.starveSuppressesBirths`):
 *
 *  1. The presence effects — `keystoneBreed ×1.5`, `ventWarmth ×1.25`, the water-table floor — lift
 *     the stored rate before anything breeds.
 *  2. `foodFactor` scales it again, in both directions. Dropping it put the ledger 34 rows out
 *     across 10 nodes on the UNTOUCHED year-1 state, and during the cascade beat it printed a
 *     starving apex breeding at its *highest* rate (`0.045→0.056`) in the same season the sim gave
 *     it zero births and four starvation deaths.
 *
 * Hard Req 2 asks for the real number, and the real number is `inForce`.
 *
 * **Why it asks `step` instead of doing the arithmetic.** §7.3's rule has exactly one
 * implementation, in `core/ecosim.ts`; a second one here is how a screen and an engine come to
 * disagree after a retune (see the Lane A integration defect I3, where two implementations of the
 * population write differed in both directions). So the sim is asked — and for a line that has
 * individuals, `inForce` is read back as `births / count`, which is *by construction* whatever the
 * sim multiplied by, with no rule about food or starvation restated here at all. Only an EMPTY line
 * has to fall back to the product of the reported factors, because its births are 0 by arithmetic
 * (`0 × anything`) rather than by rate, and 0/0 is not a rate. **The step's projected counts are
 * discarded**; nothing here advances anything.
 *
 * The generator handed over is a throwaway seeded from `balance.rng.defaultSeed`: the report fields
 * read below are all computed before `step` touches it, so the answer cannot depend on the seed, and
 * `tests/unit/ledger-view.test.ts` runs it at two different seeds to keep that true.
 */
export function effectiveRates(args: {
  nodeId: string;
  region: LedgerRegion;
  species: readonly SpeciesLine[];
  balance: Balance;
  season: Season;
}): { rates: Map<string, SpeciesRate>; presenceSources: string[] } {
  const { nodeId, region, balance, season } = args;
  const idx: SpeciesIndex = indexSpecies([...args.species]);
  const eco = ecoConstants(balance);

  // Same rehydration `stepRegionStates` does: the live state where there is one, the shipped file
  // otherwise (build-doc §7.2 "sim initial state = the file as shipped").
  const nodes: EcoNode[] = region.files.map((file) => {
    const state = region.states[file.id];
    return state ? fromNodeState(file, state) : toEcoNode(file);
  });
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`ledger: node "${nodeId}" is not in the region handed over`);

  const presence = derivePresence(nodes, idx, balance, eco);
  const ctx = makeContext(idx, balance, presence);
  const report = step(node, season, createRng(balance.rng.defaultSeed), ctx).report;

  const rates = new Map<string, SpeciesRate>();
  for (const species of report.species) {
    rates.set(species.lineId, {
      presence: species.breedRate * species.presenceMult,
      // `before` is the count the sim multiplied. Asking it back this way is what keeps the
      // starvation rule in core/ecosim.ts and out of this screen.
      inForce:
        species.before > 0
          ? species.births / species.before
          : species.breedRate * species.presenceMult * species.foodFactor,
      foodFactor: species.foodFactor,
      starving: species.starving,
    });
  }
  const ageClass = webAgeClass(balance);
  const presenceSources = (presence[nodeId]?.sources ?? []).map(
    (lineId) => idx.byId.get(lineId)?.formNames[ageClass] ?? lineId,
  );
  return { rates, presenceSources };
}

/**
 * Build the ledger page for one node from the live state.
 *
 * The count on every row is `region.states[nodeId].populations[lineId].count` — this function is the
 * only step between the save's object and the glyph on screen, which is what §8.3's "reads
 * `nodeStates` objects directly" asks for.
 */
export function buildLedgerPage(args: LedgerArgs): LedgerPage {
  const { nodeId, region, balance, year, season } = args;
  const file = region.files.find((n) => n.id === nodeId);
  if (!file) throw new Error(`ledger: no node "${nodeId}" in the region handed over`);
  const state = region.states[nodeId];
  if (!state) throw new Error(`ledger: the region carries no nodeState for "${nodeId}"`);

  const idx: SpeciesIndex = indexSpecies([...args.species]);
  const ageClass = webAgeClass(balance);
  const history = args.history ?? [];
  const keep = seasonsPerYear(balance);
  const { rates, presenceSources } = effectiveRates({
    nodeId,
    region,
    species: args.species,
    balance,
    season,
  });

  const rows: LedgerRow[] = [];
  let totalIndividuals = 0;
  let atZero = 0;

  for (const lineId of orderedLineIds(state.populations, idx)) {
    const pop = state.populations[lineId];
    const line = idx.byId.get(lineId);
    if (!pop || !line) continue;

    const count = pop.count;
    totalIndividuals += count;
    if (count === 0) atZero += 1;

    const readings: number[] = [];
    for (const sample of history) {
      const seen = sample.counts[lineId];
      if (typeof seen === "number") readings.push(seen);
    }
    // The live count is the reading for THIS year and season. When the newest sample carries the
    // same stamp it IS that reading — taken at the season boundary, possibly before a catch moved
    // it — so the live number replaces it. Appending instead rendered the current count twice and
    // put a flat final step on every trend that no season had produced.
    const newest = history[history.length - 1];
    const sameReading =
      newest !== undefined &&
      newest.year === year &&
      newest.season === season &&
      typeof newest.counts[lineId] === "number";
    if (sameReading && readings.length > 0) readings[readings.length - 1] = count;
    else readings.push(count);

    // …and the window the ledger draws is the window `recordSample` keeps, never one longer.
    const trend = readings.slice(-keep);
    const first = trend[0];
    const delta = trend.length > 1 && typeof first === "number" ? count - first : null;

    const status = migrantStatus(line, season, balance);
    // A line the sim did not report on (it cannot happen for a line that is in `populations`, but
    // the map lookup is still a lookup) falls back to the stored rate with no food term — the
    // honest "all we know" answer, never a guessed one.
    const rate = rates.get(lineId);
    const row: LedgerRow = {
      lineId,
      label: line.formNames[ageClass],
      count,
      carryCap: pop.carryCap,
      breedRate: rate?.inForce ?? pop.breedRate,
      baseBreedRate: pop.breedRate,
      presenceBreedRate: rate?.presence ?? pop.breedRate,
      foodFactor: rate?.foodFactor ?? 1,
      starving: rate?.starving ?? false,
      role: webRole(line, balance),
      trend,
      delta,
      extinct: count === 0,
      seasonal: line.seasonalWindow !== undefined,
    };
    if (line.seasonalWindow) row.seasonalWindow = line.seasonalWindow;
    if (status.dormantReason) row.dormantReason = status.dormantReason;
    rows.push(row);
  }

  return {
    nodeId: file.id,
    nodeName: file.name,
    biome: file.biome,
    year,
    season,
    floraStock: state.floraStock,
    floraMax: balance.ecosim.floraMax,
    recentDeaths: state.recentDeaths,
    rows,
    totalIndividuals,
    atZero,
    presenceSources,
  };
}

/**
 * The same page, read out of a save. `save.nodeStates` IS the live sim (build-doc §7.8), and the
 * season comes from the save's own tick, so nothing about the page is passed in twice.
 */
export function ledgerPageForSave(
  save: SaveFile,
  nodeId: string,
  content: Content,
  history?: LedgerHistory,
): LedgerPage {
  const args: LedgerArgs = {
    nodeId,
    region: { files: content.nodes, states: save.nodeStates },
    species: content.species,
    balance: content.balance,
    year: save.year,
    season: seasonAt(save.tick, content.balance),
  };
  if (history) args.history = history;
  return buildLedgerPage(args);
}

export const LEDGER_COLUMNS = `${padLabel("line")}${"count".padStart(W_COUNT)}${"cap".padStart(W_CAP)}  breed  seasons`;

export function renderLedgerHeader(page: LedgerPage): string {
  return `${page.nodeName} — year ${page.year} · ${page.season}`;
}

/**
 * The node-level numbers, on one line. Every one of them is a number, not a band.
 *
 * The two real-valued ones go through {@link renderNumber}: unbounded they ran this line to 99
 * characters and pushed `individuals` and `at 0` — the integers the line exists for — off a 480px
 * canvas.
 */
export function renderLedgerTotals(page: LedgerPage): string {
  return (
    `flora ${renderNumber(page.floraStock)}/${renderNumber(page.floraMax)} · ` +
    `recent deaths ${renderNumber(page.recentDeaths)} · ` +
    `lines ${page.rows.length} · individuals ${page.totalIndividuals} · at 0: ${page.atZero}`
  );
}

/** What a page reads when no Ancient is in range. A word, because it is not a count. */
export const NO_PRESENCE = "none";

/**
 * Which Ancients are lifting this node's breed rates — the line that makes the `breed` column's
 * arrow legible, and the one Hard Req 7 turns on: catch the Ancient and this reads `none`, every
 * arrow disappears, and the rates fall back to the stored ones in front of the player.
 */
export function renderLedgerPresence(page: LedgerPage): string {
  return `presence: ${page.presenceSources.length > 0 ? page.presenceSources.join(", ") : NO_PRESENCE}`;
}

/**
 * The seasonal note at the end of a row, and the one place the two directions of Hard Req 10 are
 * kept apart.
 *
 *  - **A migrant out of its window, with individuals present** reads `dormant` / `migrating`. That
 *    is Hard Req 10 as written (bible §5): a low seasonal count must not read as a crash.
 *  - **A migrant at 0** reads `window <season>` instead — the calendar fact, with no word about
 *    where the population is. `migrating` beside a real 0 was the open reverse of the same
 *    requirement: nothing on the row separated "absent because of the calendar" from "0 because you
 *    caught them all", and a count never moves for a seasonal reason, so the seasonal word can only
 *    be a false explanation there. The window is still named, so the row still says this is a
 *    migrant and when it is catchable.
 *
 * A line with no window gets no note at all — inventing one would make the flag mean nothing.
 */
export function renderSeasonalNote(row: LedgerRow): string {
  if (row.extinct) return row.seasonalWindow ? `window ${row.seasonalWindow}` : "";
  return row.dormantReason ?? "";
}

/**
 * One species row. Reads, for r1's nibbin line at the shipped state (stored rate → the rate in
 * force, which food and the Ancients move):
 *
 *     Nibbin           11   33  0.060→0.075  11  net —
 *
 * for a starving line, whose births the sim suppresses outright:
 *
 *     Pyrelisk         14   42  0.045→0.000  14  net —
 *
 * and for a line that has been caught to zero, with a season of history behind it:
 *
 *     Skir              0   24  0.045  8 5 2 0  net -8
 */
export function renderLedgerRow(row: LedgerRow): string {
  const inForce = renderRate(row.breedRate);
  const stored = renderRate(row.baseBreedRate);
  // Both numbers, never just the one the player cannot act on: the left is what this line breeds at
  // alone, the right is what the sim multiplies its count by this season — food, Ancients and the
  // starvation cut-off all folded in, because that is the number that decides the next generation.
  //
  // Compared as RENDERED, not as floats: `inForce` is a product of three reported factors, so a
  // line whose factors are all 1 lands on 0.05000000000000001 and drew `0.050→0.050`, an arrow
  // between one number and itself. Two rates the player cannot tell apart are one rate.
  const breed = inForce === stored ? inForce : `${stored}→${inForce}`;
  const head =
    padLabel(row.label) +
    String(row.count).padStart(W_COUNT) +
    String(row.carryCap).padStart(W_CAP) +
    `  ${breed}`;
  const trend = `  ${row.trend.join(" ")}`;
  const net = `  net ${row.delta === null ? NO_VALUE : signed(row.delta)}`;
  const note = renderSeasonalNote(row);
  return head + trend + net + (note ? `  ${note}` : "");
}

export function renderLedgerPage(page: LedgerPage): string[] {
  return [
    renderLedgerHeader(page),
    renderLedgerTotals(page),
    renderLedgerPresence(page),
    LEDGER_COLUMNS,
    ...page.rows.map(renderLedgerRow),
  ];
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The dex (bible §12 "dex (painted art)"; Hard Req 10 legibility)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The asset id a dex identity wants. Art for the painted dex class does not exist yet (build-doc
 * §9.4 / §15 B2), so this is a KEY, not a promise: `DexScene` asks the texture cache for it and
 * draws a labelled placeholder carrying this exact string when the answer is no. A placeholder that
 * says which asset is missing is a work item; one that looks like art is a lie.
 */
export function dexArtId(dexId: string): string {
  return `dex/${dexId.toLowerCase()}`;
}

export interface DexEntry {
  /** The named identity (bible §4: 35 of them, including the age names). */
  dexId: string;
  lineId: string;
  /**
   * Every named identity of this line, in age order. The region count below is a LINE total (core
   * tracks one count per line, not one per form), so a card belonging to a line with more than one
   * identity has to say that its integer covers all of them.
   */
  lineDexIds: string[];
  /** The age class this identity IS — the first form whose name matches. */
  ageClass: AgeClass;
  types: TypeName[];
  role: Role;
  habitat: string[];
  metamorphic: boolean;
  ancient: boolean;
  seasonalWindow?: Season;
  /**
   * SEASONAL availability, and nothing else: `migrantStatus`'s answer, false only for a migrant
   * outside its window (Hard Req 10).
   *
   * It is **not** the encounter roll's verdict, and reading it as one is a trap: the roll applies
   * two further filters — the sign-chain gate ({@link encounterGated}) and the live count, which is
   * 0 for a wiped line. "Can I meet this here right now" is `active && !encounterGated && count>0`,
   * and `tests/unit/ledger-view.test.ts` holds that identity against `encounterWeights` itself over
   * every shipped node and season.
   */
  active: boolean;
  dormantReason?: "dormant" | "migrating";
  /**
   * True when the encounter roll refuses this line for a reason that is not the season — on the
   * shipped content, bible §4's "gated behind rare sign-card chains" (the three Ancients).
   */
  encounterGated: boolean;
  artId: string;
}

/** Which age class a named dex identity belongs to. */
function ageClassOfDexId(line: SpeciesLine, dexId: string): AgeClass {
  for (const age of AGE_CLASSES) {
    if (line.formNames[age] === dexId) return age;
  }
  return AGE_CLASSES[0];
}

/** The one individual the probe below carries, so the question asked is about the FILTERS. */
const PROBE_INDIVIDUALS = 1;

/**
 * Would the encounter roll refuse this line for a reason other than the season?
 *
 * **The defect this closes.** The dex used to consult `migrantStatus` alone, while
 * `encounterWeights` applies a third filter the dex knew nothing about — bible §4's sign-chain gate
 * on `balance.encounter.signChainGatedHabitatTag`. So the card read plainly "individuals in region
 * 1" for Undermere, Kilnback and Vellsire: creatures the roll can never produce until their chain
 * is finished.
 *
 * **Why it asks rather than tests the tag itself.** `encounterWeights` IS the roll's own call, so a
 * change to the gate — or a fourth filter — moves this flag with it instead of leaving a stale copy
 * of the rule in the UI. The probe node carries one individual of one line because the question is
 * which FILTER refuses it, not how many there are; the real count is read separately, straight out
 * of `nodeStates` ({@link regionalCount}).
 *
 * **Why the probe is run in the line's own window and not in `season`.** `encounterWeights` checks
 * the gate BEFORE the season and returns a bare `active: false` with no `dormantReason`, so the two
 * refusals are indistinguishable in its answer. Asking the caller's season and then subtracting the
 * seasonal case afterwards lost the gate flag for any line that was BOTH gated and out of window:
 * the card dropped "not in the wild encounter pool" in three seasons out of four and said only
 * `migrating`, which is the reason the player could wait out. Asking in the window the line IS
 * active in leaves the gate as the only refusal the probe can produce, so the answer is a fact
 * about the line rather than about the calendar — which is what the flag claims to be. No shipped
 * line is currently both (the three Ancients carry no `seasonalWindow`), so this is a trap set for
 * the next piece of content, not a live defect; `tests/unit/ledger-view.test.ts` drives it with a
 * synthetic line that is.
 */
function encounterGatedFor(
  line: SpeciesLine,
  season: Season,
  balance: Balance,
  unlockedSignChains?: ReadonlySet<string>,
): boolean {
  const probe: EcoNode = {
    id: line.id,
    biome: line.habitat[0] ?? "",
    adjacency: [],
    floraStock: 0,
    populations: {
      [line.id]: { count: PROBE_INDIVIDUALS, breedRate: 0, carryCap: PROBE_INDIVIDUALS },
    },
    recentDeaths: 0,
  };
  const opts: EncounterOptions = { season: line.seasonalWindow ?? season };
  if (unlockedSignChains) opts.unlockedSignChains = unlockedSignChains;
  const verdict = encounterWeights(probe, indexSpecies([line]), balance, opts)[0];
  // In its own window the seasonal filter passes and the probe carries an individual, so the only
  // thing left that can refuse it is the gate.
  return verdict !== undefined && !verdict.active;
}

export interface DexOptions {
  /** Sign-chains the player has completed — passed straight to `core/foodweb.ts`. */
  unlockedSignChains?: ReadonlySet<string>;
}

export function buildDexEntry(
  line: SpeciesLine,
  dexId: string,
  season: Season,
  balance: Balance,
  opts?: DexOptions,
): DexEntry {
  const age = ageClassOfDexId(line, dexId);
  // Hard Req 10 / bible §5 — the SAME call the encounter roll makes for the seasonal filter…
  const status = migrantStatus(line, season, balance);
  const entry: DexEntry = {
    dexId,
    lineId: line.id,
    lineDexIds: [...line.dexIds],
    ageClass: age,
    types: [...line.types[age]],
    role: line.role[age],
    habitat: [...line.habitat],
    metamorphic: line.metamorphic,
    ancient: line.ancient,
    active: status.active,
    // …and the same call again for the filter `migrantStatus` knows nothing about.
    encounterGated: encounterGatedFor(line, season, balance, opts?.unlockedSignChains),
    artId: dexArtId(dexId),
  };
  if (line.seasonalWindow) entry.seasonalWindow = line.seasonalWindow;
  if (status.dormantReason) entry.dormantReason = status.dormantReason;
  return entry;
}

/** Every named identity in `data/species.json`, in file order. */
export function buildDexEntries(
  species: readonly SpeciesLine[],
  season: Season,
  balance: Balance,
  opts?: DexOptions,
): DexEntry[] {
  const out: DexEntry[] = [];
  for (const line of species) {
    for (const dexId of line.dexIds) out.push(buildDexEntry(line, dexId, season, balance, opts));
  }
  return out;
}

/**
 * Hard Req 10, the whole of it: "dex + sign cards flag them dormant/migrating out of season", so
 * that "seasonal absence is never confusable with a population crash" (bible §5).
 *
 * A non-migrant returns "" — it has no seasonal story, and inventing one would make the flag mean
 * nothing. A migrant in its window says so with its window named, because "no flag" and "not a
 * migrant" must not look the same on the card either.
 */
export function renderDexSeasonStatus(entry: DexEntry): string {
  if (!entry.seasonalWindow) return "";
  if (entry.active) return `active · window ${entry.seasonalWindow}`;
  const reason = entry.dormantReason ?? "dormant";
  return `${reason} · window ${entry.seasonalWindow}`;
}

/**
 * What the card says when the roll will not produce this line however long the player waits.
 *
 * Deliberately mechanical: it states what the encounter roll does, not why — the "why" on the
 * shipped content is a sign chain, and wording it that way would be this file restating a rule that
 * lives in `core/foodweb.ts` and could stop being true.
 */
export const NOT_IN_ENCOUNTER_POOL = "not in the wild encounter pool";

/**
 * The flag lines of one card, in the order they are drawn — the two reasons a creature is not in
 * front of you that are NOT "there are none left", which is the integer above them.
 */
export function renderDexFlags(entry: DexEntry): string[] {
  const out: string[] = [];
  if (entry.encounterGated) out.push(NOT_IN_ENCOUNTER_POOL);
  const season = renderDexSeasonStatus(entry);
  if (season) out.push(season);
  return out;
}

/**
 * Individuals of one line across every node state handed over — a straight read of `nodeStates`
 * (§8.3), summed at call time, never cached anywhere.
 *
 * Note the unit: core tracks ONE count per species LINE, not one per named form, so this is a line
 * total and {@link renderDexEntry} labels it as one on a multi-form card.
 */
export function regionalCount(states: Readonly<Record<string, NodeState>>, lineId: string): number {
  let total = 0;
  for (const nodeId of Object.keys(states)) {
    total += states[nodeId]?.populations[lineId]?.count ?? 0;
  }
  return total;
}

/** How a line-total count is qualified on a card that depicts only one of the line's forms. */
export const ALL_FORMS = "all forms";

/**
 * The dex entry as the lines `DexScene` draws beside the art.
 *
 * `regional` is the live count across the region when the caller has the states. Printing it next
 * to the flags is the whole of Hard Req 10's legibility clause: the reasons a creature is not in
 * front of you — out of season, held back by a chain, or gone — are then on screen at once and are
 * different things to read, words against an integer.
 *
 * **The count is a LINE total.** core carries one population per species line, so Bogling, Mirefin
 * and Fenmaw share one number. Three cards each printing a bare "individuals in region 14" read as
 * 42 animals; the qualifier is what stops that, and it is on the card rather than in the sum
 * because the sum is right — it is the label that was wrong.
 */
export function renderDexEntry(entry: DexEntry, regional?: number | null): string[] {
  const lines = [
    entry.dexId,
    `${entry.types.join("/")} · ${entry.role}`,
    `habitat ${entry.habitat.join(", ")}`,
  ];
  if (typeof regional === "number") {
    const scope = entry.lineDexIds.length > 1 ? ` · ${ALL_FORMS}` : "";
    lines.push(`individuals in region ${regional}${scope}`);
  }
  lines.push(...renderDexFlags(entry));
  return lines;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3. The creature summary card
 *    bible §12: "team/creature summary (shows projected retirement year)" — a hard requirement.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface SummaryMove {
  id: string;
  name: string;
}

export interface SummaryCard {
  uid: string;
  nickname?: string;
  lineId: string;
  formName: string;
  types: TypeName[];
  role: Role;
  age: AgeClass;
  level: number;
  caughtYear: number;
  /** null for an Ancient — it has no countdown (Hard Req 4 / G10). */
  yearsRemaining: number | null;
  /** core/lifecycle.ts's answer at `currentYear`; null when the creature never retires. */
  projectedRetirementYear: number | null;
  /**
   * True when the projection lands past `balance.clock.yearsTotal` years of play.
   *
   * A PACING note, not a warning (D-Q3-1): the calendar is unbounded, so year 7 does arrive. It used
   * to mean "past the last year the game has".
   */
  beyondFinalYear: boolean;
  ancient: boolean;
  metamorphosed: boolean;
  boxed: boolean;
  traits: Trait[];
  /** null when no relic slot is unlocked — the card says so rather than hiding the row. */
  relicSlot: string | null;
  boons: Boon[];
  moves: SummaryMove[];
  stats: Stats;
  artId: string;
}

export interface SummaryArgs {
  creature: OwnedCreature;
  species: readonly SpeciesLine[];
  moves: readonly MoveDef[];
  balance: Balance;
  currentYear: number;
}

export function buildSummaryCard(args: SummaryArgs): SummaryCard {
  const { creature, balance, currentYear } = args;
  const line = args.species.find((s) => s.id === creature.lineId);
  if (!line) throw new Error(`summary: no species line "${creature.lineId}" in content`);

  const moveNames = new Map<string, string>();
  for (const move of args.moves) moveNames.set(move.id, move.name);

  // The projection has ONE implementation (core/lifecycle.ts). Restating `currentYear +
  // yearsRemaining` here is exactly how a card and an engine come to disagree after a year turn.
  const projected = projectedRetirementYear(creature, currentYear, line);
  const never = isNever(projected);

  const card: SummaryCard = {
    uid: creature.uid,
    lineId: creature.lineId,
    formName: line.formNames[creature.age],
    types: [...line.types[creature.age]],
    role: line.role[creature.age],
    age: creature.age,
    level: creature.level,
    caughtYear: creature.caughtYear,
    yearsRemaining: isNever(creature.yearsRemaining) ? null : creature.yearsRemaining,
    projectedRetirementYear: never ? null : projected,
    beyondFinalYear: retiresBeyondFinalYear(creature, balance),
    ancient: line.ancient,
    metamorphosed: creature.metamorphosed === true,
    boxed: creature.boxed === true,
    traits: creature.traits.map((t) => ({ ...t })),
    relicSlot: creature.relicSlot ?? null,
    boons: creature.boons.map((b) => ({ ...b })),
    moves: movesKnownAt(line, creature.level, balance).map((id) => ({
      id,
      name: moveNames.get(id) ?? id,
    })),
    stats: effectiveStats({
      line,
      age: creature.age,
      level: creature.level,
      balance,
      traits: creature.traits,
      boons: creature.boons,
      ...(creature.metamorphosed !== undefined ? { metamorphosed: creature.metamorphosed } : {}),
    }),
    artId: dexArtId(line.formNames[creature.age]),
  };
  if (creature.nickname !== undefined) card.nickname = creature.nickname;
  return card;
}

/**
 * The bible §12 hard-requirement line. Three honest answers, never a rounded-off one:
 *  - a year number, for anything with a countdown;
 *  - "never", for a caught Ancient (bible §4: Ancients do not age);
 *  - the year plus a pacing note when it lands past the years normal pacing expects (D-A4-14, as
 *    amended by D-Q3-1: that year DOES arrive now, so the note reads "beyond" rather than "past").
 */
export function renderRetirementYear(card: SummaryCard, balance: Balance): string {
  if (card.projectedRetirementYear === null) return "retires: never";
  const expectedLastYear = balance.clock.startYear + balance.clock.yearsTotal - 1;
  const beyond = card.beyondFinalYear ? ` (beyond year ${expectedLastYear})` : "";
  return `retires: year ${card.projectedRetirementYear}${beyond}`;
}

export function renderSummaryCard(card: SummaryCard, balance: Balance): string[] {
  const name = card.nickname ? `${card.nickname} (${card.formName})` : card.formName;
  const stats = card.stats;
  const traits = card.traits.length
    ? card.traits.map((t) => `${t.name} ${t.direction === "up" ? "+" : "-"}${t.stat}`).join(" · ")
    : NO_VALUE;
  const boons = card.boons.length ? card.boons.map((b) => `${b.name} +${b.stat}`).join(" · ") : NO_VALUE;
  return [
    `${name} — Lv ${card.level} · ${card.age}`,
    `${card.types.join("/")} · ${card.role}`,
    renderRetirementYear(card, balance),
    `caught year ${card.caughtYear} · years remaining ${card.yearsRemaining === null ? NO_VALUE : card.yearsRemaining}`,
    `hp ${stats.hp} · atk ${stats.atk} · def ${stats.def} · spd ${stats.spd} · ins ${stats.ins}`,
    `traits: ${traits}`,
    `relic: ${card.relicSlot ?? NO_VALUE}`,
    `boons: ${boons}`,
    `moves: ${card.moves.length ? card.moves.map((m) => m.name).join(", ") : NO_VALUE}`,
  ];
}
