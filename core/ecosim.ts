/**
 * core/ecosim.ts — the deterministic population sim (build-doc §7.3, locked decision L10).
 *
 * `ecosim.step(node, season, rng)` runs at every season boundary and implements §7.3's six numbered
 * steps IN ORDER, each marked below with its number. Every constant is read from data/balance.json
 * (G11 / INV-4); the only randomness is the seeded stream from core/rng.ts (no `Math.random`, G11).
 *
 * GUARDRAIL G6 — "Do not script the demo cascade into the sim; it must emerge from the §7.3 rules."
 * There is no species id anywhere in this file, no branch on a role, a node, a biome or an Ancient's
 * effect name, and no rule that reads "if apex prey low then …". The only strings this file compares
 * against are `PRESENCE_MODES`, a structural vocabulary. The cascade the demo records is the same
 * arithmetic every node runs every season, and `tests/property/ecosim.test.ts::cascade_emerges`
 * proves it two ways: a source gate (no gameplay identity as a literal, no comparison against
 * anything but a mode — and adjacent string concatenations are collapsed first, so `"Ap" + "ex"` is
 * the same rig as `"Apex"`), and a structural one that RELABELS every species, node and biome and
 * re-runs the region, which no amount of indirection survives.
 *
 * Diet edges are NEVER computed here — they come from core/foodweb.ts, which build-doc §8.3 makes
 * their only home.
 *
 * DETERMINISM (L10 / §8.1): every loop runs in `orderedLineIds` order, and each node in a region
 * runs on its own stream split off the shared one, so a trajectory depends on the numbers and the
 * seed — not on how a populations map was built, not on where a node sits in an array, and not on
 * what anything is called.
 */

import type {
  Balance,
  NodeFile,
  NodeState,
  PresenceEffect,
  PresenceEffectRule,
  PresenceMode,
  Role,
  Season,
  TypeName,
} from "./types";
import { PRESENCE_MODES } from "./types";
import type { EcoNode, SpeciesIndex } from "./foodweb";
import {
  availablePrey,
  cloneEcoNode,
  clonePopulations,
  demandOf,
  deriveFoodWeb,
  hasLiveDiet,
  indexSpecies,
  orderedLineIds,
  preyPools,
  toEcoNode,
  webRole,
  webTypes,
} from "./foodweb";
import type { FoodWeb } from "./types";
import type { Rng } from "./rng";
import { deriveStreams } from "./rng";
import { validateContent } from "./schemas";
import rawBalanceJson from "../data/balance.json";

/** Thrown for a caller error the sim must not paper over (build-doc §7: "fail loud on drift"). */
export class EcosimError extends Error {
  override name = "EcosimError";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sim tunables (all of them now live in data/balance.json — merged at integration)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Re-exported from core/types.ts, where the vocabulary moved at integration so that
 * `Balance.ecosim.presenceEffects` could be typed against it. The effect's NAME still never reaches
 * a conditional in this file. `data/species.json` carries exactly one
 * line per effect name, so `if (effect === "waterTable")` would have been `if (this is Undermere)`,
 * which is the species-shaped branch G6 forbids and the code literal G11 forbids.
 */
export { PRESENCE_MODES };
export type { PresenceMode, PresenceEffectRule };

export interface EcoConstants {
  /** A starving population loses at least this many individuals per season. */
  starveMinDeathsPerSeason: number;
  /** A starving population does not breed this season. */
  starveSuppressesBirths: boolean;
  /** bible §4 — how each Ancient presence effect acts, and on what. Keyed by effect name. */
  presenceEffects: Partial<Record<PresenceEffect, PresenceEffectRule>>;
}

/** build-doc §10.2 thresholds for the `cascade_emerges` claim (used by the property test). */
export interface CascadeConstants {
  preyForcedFraction: number;
  forcingSeasons: number;
  apexCollapseSeasons: number;
  mesoReleaseSeasons: number;
  /** Coverage floor: fraction of seeds where a meso forced to ≥1 is alive when the apex reaches 0. */
  mesoSurvivesForcingMinFraction: number;
  /** Coverage floor: fraction of generated cascades that leave a mesopredator to be released. */
  releaseCoverageMinFraction: number;
}

type LooseRecord = Record<string, unknown>;

function group(source: unknown, key: string): LooseRecord {
  const root = (source ?? {}) as LooseRecord;
  const inner = root[key];
  return (inner ?? {}) as LooseRecord;
}

/**
 * Look a constant up across the sources in precedence order.
 *
 * Why more than one source: `zBalance` parses with `z.object`, which STRIPS keys the schema does not
 * declare — so a constant merged into balance.json whose schema has not caught up is absent from a
 * validated `Balance`, and a HARNESS RUNNING WITH AN OVERRIDDEN FILE would have its retune silently
 * ignored. That is precisely the failure build-doc §6 INV-3 and its named test `ext_retune` exist to
 * prevent, and `tests/gates/schemas.test.ts` now gates every leaf of balance.json against it.
 *
 * So a caller that loaded a balance file may hand the RAW parsed JSON alongside the validated
 * object ({@link ecoConstants}'s second argument). Precedence: validated Balance → the caller's raw
 * file → the shipped balance.json. The last is the shipped default; the first two are the override,
 * and one of them always carries a retune.
 */
function lookup(sources: LooseRecord[], key: string): unknown {
  for (const source of sources) {
    const value = source[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function num(sources: LooseRecord[], key: string): number {
  const value = lookup(sources, key);
  if (typeof value === "number") return value;
  throw new EcosimError(`missing numeric constant "${key}" in balance.ecosim / balance.cascade (data/balance.json)`);
}

function bool(sources: LooseRecord[], key: string): boolean {
  const value = lookup(sources, key);
  if (typeof value === "boolean") return value;
  throw new EcosimError(`missing boolean constant "${key}" in balance.ecosim / balance.cascade (data/balance.json)`);
}

function str(source: LooseRecord, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * INV-3 — the tunables the sim runs on, resolved from the caller's balance (validated), the
 * caller's raw balance file if it supplied one, and the shipped defaults.
 *
 * `raw` is what makes `ext_retune` true for the constants zod does not (yet) declare: a harness that
 * loads an overridden `balance.json` passes the parsed file here and its retune takes effect.
 */
export function ecoConstants(balance: Balance, raw?: unknown): EcoConstants {
  const sources: LooseRecord[] = [
    balance.ecosim as unknown as LooseRecord,
    group(raw, "ecosim"),
    group(rawBalanceJson, "ecosim"),
  ];
  const effectsSource = (lookup(sources, "presenceEffects") as LooseRecord | undefined) ?? {};
  const presenceEffects: Partial<Record<PresenceEffect, PresenceEffectRule>> = {};
  for (const key of Object.keys(effectsSource)) {
    if (key.startsWith("_")) continue; // documentation keys in the JSON
    const entry = effectsSource[key];
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as LooseRecord;
    const mode = str(record, "mode");
    const magnitudeKey = str(record, "magnitudeKey");
    if (!mode || !magnitudeKey) {
      throw new EcosimError(`presenceEffects."${key}" needs both a mode and a magnitudeKey`);
    }
    if (!(PRESENCE_MODES as readonly string[]).includes(mode)) {
      throw new EcosimError(`presenceEffects."${key}" has unknown mode "${mode}"`);
    }
    if (typeof lookup(sources, magnitudeKey) !== "number") {
      throw new EcosimError(`presenceEffects."${key}" points at missing magnitude "${magnitudeKey}"`);
    }
    const type = str(record, "type");
    const rule: PresenceEffectRule = { mode: mode as PresenceMode, magnitudeKey };
    if (type !== undefined) rule.type = type as TypeName;
    if ((rule.mode !== "breedMult") !== (rule.type !== undefined)) {
      throw new EcosimError(
        `presenceEffects."${key}": mode "${rule.mode}" ${rule.mode === "breedMult" ? "takes no" : "needs a"} type`,
      );
    }
    presenceEffects[key as PresenceEffect] = rule;
  }
  return {
    starveMinDeathsPerSeason: num(sources, "starveMinDeathsPerSeason"),
    starveSuppressesBirths: bool(sources, "starveSuppressesBirths"),
    presenceEffects,
  };
}

/** The magnitude an effect rule points at, resolved through the same INV-3 precedence chain. */
export function presenceMagnitude(rule: PresenceEffectRule, balance: Balance, raw?: unknown): number {
  return num(
    [
      balance.ecosim as unknown as LooseRecord,
      group(raw, "ecosim"),
      group(rawBalanceJson, "ecosim"),
    ],
    rule.magnitudeKey,
  );
}

export function cascadeConstants(balance: Balance, raw?: unknown): CascadeConstants {
  const sources: LooseRecord[] = [
    group(balance as unknown, "cascade"),
    group(raw, "cascade"),
    group(rawBalanceJson, "cascade"),
  ];
  return {
    preyForcedFraction: num(sources, "preyForcedFraction"),
    forcingSeasons: num(sources, "forcingSeasons"),
    apexCollapseSeasons: num(sources, "apexCollapseSeasons"),
    mesoReleaseSeasons: num(sources, "mesoReleaseSeasons"),
    mesoSurvivesForcingMinFraction: num(sources, "mesoSurvivesForcingMinFraction"),
    releaseCoverageMinFraction: num(sources, "releaseCoverageMinFraction"),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Ancient presence effects (§7.3 step 1 `presenceMult`)
 * ──────────────────────────────────────────────────────────────────────────── */

/** What an Ancient does to one node's breeding while it is still free. */
export interface NodePresence {
  /** Multiplier applied to every line's breeding (bible §4 Vellsire, the keystone). */
  breedMult: number;
  /** Multiplier applied to lines of a given type (bible §4 Kilnback — warm vents). */
  typeBreedMult: Partial<Record<TypeName, number>>;
  /** Floor applied to the breedRate of lines of a given type (bible §4 Undermere — water table). */
  typeBreedFloor: Partial<Record<TypeName, number>>;
  /** Ancient line ids exerting an effect here — the survey shows what the player is about to lose. */
  sources: string[];
}

export type PresenceMap = Record<string, NodePresence>;

function emptyPresence(): NodePresence {
  return { breedMult: 1, typeBreedMult: {}, typeBreedFloor: {}, sources: [] };
}

/** Graph distance in nodes, capped at `radius` (adjacency is symmetric — enforced by A1's schema). */
function nodesWithin(nodes: EcoNode[], fromId: string, radius: number): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([fromId]);
  let frontier = [fromId];
  for (let d = 0; d < radius; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const adj of byId.get(id)?.adjacency ?? []) {
        if (seen.has(adj) || !byId.has(adj)) continue;
        seen.add(adj);
        next.push(adj);
      }
    }
    frontier = next;
  }
  return [...seen];
}

/**
 * build-doc §7.3 step 1 — "presenceMult per Ancient effects (Vellsire adjacent-node breeding ×1.5
 * while free; Kilnback: Fire spawns active; Undermere: Water breedRate floor)".
 *
 * "While free" is read straight off the single source of truth: the Ancient's own count at its node.
 * Catch it and the count goes to 0, the effect disappears, and the epilogue survey shows the
 * difference — Hard Req 7's honest cost, with no separate flag to keep in sync.
 *
 * Radius is `balance.ecosim.presenceRadiusNodes` and includes the host node itself: the vents are
 * warmest where the tortoise sleeps.
 */
export function derivePresence(
  nodes: EcoNode[],
  idx: SpeciesIndex,
  balance: Balance,
  eco: EcoConstants,
  raw?: unknown,
): PresenceMap {
  const map: PresenceMap = {};
  for (const node of nodes) map[node.id] = emptyPresence();

  // Hosts in canonical order so that a region handed over in a different order derives the same map
  // (float multiplication is commutative but not associative, and `sources` is a list).
  for (const host of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const lineId of orderedLineIds(host.populations, idx)) {
      const pop = host.populations[lineId];
      const line = idx.byId.get(lineId);
      if (!pop || !line || !line.presenceEffect) continue;
      if (pop.count <= 0) continue; // caught or gone — the buff goes with it

      const rule = eco.presenceEffects[line.presenceEffect];
      if (!rule) {
        throw new EcosimError(
          `species carries presenceEffect "${line.presenceEffect}" with no rule in ` +
            `balance ecosim.presenceEffects — bible §4 names what each Ancient does; the sim reads it ` +
            `from data, never from the effect's name (G11)`,
        );
      }
      const magnitude = presenceMagnitude(rule, balance, raw);

      for (const targetId of nodesWithin(nodes, host.id, balance.ecosim.presenceRadiusNodes)) {
        const presence = map[targetId];
        if (!presence) continue;
        presence.sources.push(lineId);
        applyPresenceRule(presence, rule, magnitude);
      }
    }
  }
  for (const presence of Object.values(map)) presence.sources.sort();
  return map;
}

/**
 * The three shapes an effect can take, selected by the rule's `mode` — a structural vocabulary
 * declared in `PRESENCE_MODES`, not the effect's own name. Adding a fourth Ancient with the same
 * shape as an existing one is a data edit (INV-1), not a code edit.
 */
function applyPresenceRule(presence: NodePresence, rule: PresenceEffectRule, magnitude: number): void {
  if (rule.mode === "breedMult" || rule.type === undefined) {
    presence.breedMult *= magnitude;
    return;
  }
  if (rule.mode === "typeBreedFloor") {
    const current = presence.typeBreedFloor[rule.type] ?? 0;
    presence.typeBreedFloor[rule.type] = Math.max(current, magnitude);
    return;
  }
  const current = presence.typeBreedMult[rule.type] ?? 1;
  presence.typeBreedMult[rule.type] = current * magnitude;
}

/**
 * The presence map a caller MUST have handed `step` for this node: derived over the whole region,
 * because a keystone's reach is a graph fact (build-doc §7.3 step 1, radius
 * `balance.ecosim.presenceRadiusNodes`).
 */
function presenceFor(ctx: SimContext, node: EcoNode): NodePresence {
  const presence = ctx.presence[node.id];
  if (!presence) {
    throw new EcosimError(
      `no presence entry for node "${node.id}". build-doc §7.3 step 1 makes presenceMult part of the ` +
        `births term, and an Ancient's effect reaches its NEIGHBOURS, so it cannot be derived from one ` +
        `node: derive it over the region (derivePresence / stepAll / stepRegionStates) and pass it in ` +
        `the context. Silently stepping with the effects off is how Hard Req 7's honest cost ` +
        `disappears without a word.`,
    );
  }
  // …and it must have been derived from THIS state, not a stale one. Checkable at the host node,
  // which is where Hard Req 7's catch happens: the Ancient's own count is the "while free" flag.
  for (const lineId of orderedLineIds(node.populations, ctx.species)) {
    const pop = node.populations[lineId];
    const line = ctx.species.byId.get(lineId);
    if (!pop || !line?.presenceEffect) continue;
    const listed = presence.sources.includes(lineId);
    if (pop.count > 0 && !listed) {
      throw new EcosimError(
        `presence for "${node.id}" was derived without "${lineId}", which is still free here — ` +
          `re-derive it from the current state`,
      );
    }
    if (pop.count <= 0 && listed) {
      throw new EcosimError(
        `presence for "${node.id}" still credits "${lineId}", which is gone from this node — ` +
          `catching an Ancient must take its buff with it (Hard Req 7)`,
      );
    }
  }
  return presence;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step context + per-step reporting
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SimContext {
  species: SpeciesIndex;
  balance: Balance;
  eco: EcoConstants;
  /**
   * Presence effects per node id — REQUIRED, and required to cover every node that will be stepped.
   *
   * It used to be optional, which meant `step(node, season, rng)` on the signature build-doc §7.3
   * actually names silently dropped step 1's `presenceMult`: every Ancient effect off, no warning,
   * and Hard Req 7's "catch removes the keystone buff" unobservable. Missing is now an error
   * ({@link presenceFor}); "no Ancient anywhere" is spelled `derivePresence([...], …)` over the
   * region, which returns an entry per node saying exactly that.
   */
  presence: PresenceMap;
  /** The caller's raw balance file, if it loaded one — INV-3 / `ext_retune`. */
  raw?: unknown;
}

/** One line's full arithmetic for one season — what the survey and the tests read. */
export interface SpeciesStepReport {
  lineId: string;
  role: Role;
  before: number;
  after: number;
  availablePrey: number;
  demand: number;
  /** availablePrey / demand, or null for a line with no live diet. */
  ratio: number | null;
  foodFactor: number;
  starving: boolean;
  breedRate: number;
  presenceMult: number;
  births: number;
  starvationDeaths: number;
  predationLosses: number;
  /** Real-valued change before stochastic rounding: births − starvation − predation. */
  net: number;
}

export interface StepReport {
  nodeId: string;
  season: Season;
  species: SpeciesStepReport[];
  floraBefore: number;
  floraConsumed: number;
  floraAfter: number;
  deathsThisSeason: number;
  recentDeathsBefore: number;
  recentDeathsAfter: number;
  web: FoodWeb;
}

export interface StepResult {
  node: EcoNode;
  report: StepReport;
}

let cachedContext: SimContext | null = null;

/**
 * The shipped content as a sim context, with presence derived over the shipped node files — which
 * build-doc §7.2 declares the sim's initial state ("Sim initial state = the file as shipped").
 *
 * It stays correct only while the region is at that state: catch an Ancient and this map is stale,
 * which {@link presenceFor} turns into a loud error rather than a silently wrong buff. Live play
 * should go through {@link stepAll} / {@link stepRegionStates}, which re-derive every season.
 */
export function defaultContext(): SimContext {
  if (!cachedContext) {
    const content = validateContent();
    const species = indexSpecies(content.species);
    const eco = ecoConstants(content.balance);
    cachedContext = {
      species,
      balance: content.balance,
      eco,
      presence: derivePresence(content.nodes.map((file) => toEcoNode(file)), species, content.balance, eco),
    };
  }
  return cachedContext;
}

/** Build a context from explicit content — the balance harness and the tests use this. */
export function makeContext(
  species: SpeciesIndex,
  balance: Balance,
  presence: PresenceMap,
  raw?: unknown,
): SimContext {
  const ctx: SimContext = { species, balance, eco: ecoConstants(balance, raw), presence };
  if (raw !== undefined) ctx.raw = raw;
  return ctx;
}

/**
 * The same context with presence re-derived over `nodes` — the one-line answer to "I am stepping
 * this region / this fixture, what is its presence map?".
 */
export function withPresence(ctx: SimContext, nodes: EcoNode[]): SimContext {
  return { ...ctx, presence: derivePresence(nodes, ctx.species, ctx.balance, ctx.eco, ctx.raw) };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.3 — the population step
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * build-doc §7.3 `ecosim.step(node, season, rng)`. Pure: the input node is never mutated; the
 * returned node is a fresh object, so a trajectory is a list of snapshots and replay is free (L10).
 *
 * Every term is computed against the SNAPSHOT of the season's opening counts and only then applied,
 * and every loop runs in CANONICAL order (`orderedLineIds` — the order of `data/species.json`, which
 * neither the node JSON's key order nor a renaming can move), so neither the arithmetic nor the point
 * in the RNG stream a species draws at can depend on how the map was built — which is what makes
 * save → load → continue land on the same numbers as an uninterrupted run (L10, §8.1).
 */
export function step(node: EcoNode, season: Season, rng: Rng, context?: SimContext): StepResult {
  const ctx = context ?? defaultContext();
  const { balance, species: idx, eco } = ctx;
  const cfg = balance.ecosim;

  // The web is DERIVED, here and nowhere else (build-doc §8.3, G3).
  const web = deriveFoodWeb(node, idx, balance);
  const presence = presenceFor(ctx, node);

  const ids = orderedLineIds(node.populations, idx);
  const births: Record<string, number> = {};
  const starvationDeaths: Record<string, number> = {};
  const predationLosses: Record<string, number> = {};
  const reports: SpeciesStepReport[] = [];

  // ── §7.3 step 1 (births) and step 2 (starvation) ───────────────────────────
  for (const lineId of ids) {
    const pop = node.populations[lineId];
    const line = idx.byId.get(lineId);
    births[lineId] = 0;
    starvationDeaths[lineId] = 0;
    predationLosses[lineId] = 0;
    if (!pop || !line) continue;

    const role = webRole(line, balance);
    const available = availablePrey(node, web, lineId, balance);
    const demand = demandOf(node, idx, lineId, balance);
    const liveDiet = hasLiveDiet(idx, lineId, balance);
    const ratio = liveDiet && demand > 0 ? available / demand : null;

    // A line with no live diet (Producer, Scavenger, Ancient) never divides by a zero demand and
    // never starves — balance.json `ecosim._demand`.
    const foodFactor =
      ratio === null ? cfg.noDietFoodFactor : clamp(ratio, cfg.foodFactorClampMin, cfg.foodFactorClampMax);

    // §7.3 step 2 — "if availablePrey/demand < starveThreshold, deaths = count × starveRate".
    const starving = ratio !== null && ratio < cfg.starveThreshold;

    // §7.3 step 1 — presence multipliers (Ancients). Typeless effects lift every line; typed ones
    // only touch lines carrying that type at the web's age class.
    let presenceMult = presence.breedMult;
    let breedRate = pop.breedRate;
    for (const type of webTypes(line, balance)) {
      presenceMult *= presence.typeBreedMult[type] ?? 1;
      breedRate = Math.max(breedRate, presence.typeBreedFloor[type] ?? 0);
    }

    // §7.3 step 1 — births[s] = count × breedRate × foodFactor × presenceMult.
    // A starving population puts nothing into the next generation (balance.ecosim
    // `starveSuppressesBirths`), which is what makes a crash resolve instead of hovering.
    const born =
      pop.count > 0 && !(starving && eco.starveSuppressesBirths)
        ? pop.count * breedRate * foodFactor * presenceMult
        : 0;

    const died = starving && pop.count > 0 ? Math.max(pop.count * cfg.starveRate, eco.starveMinDeathsPerSeason) : 0;

    births[lineId] = born;
    starvationDeaths[lineId] = died;

    reports.push({
      lineId,
      role,
      before: pop.count,
      after: pop.count, // filled in at step 4
      availablePrey: available,
      demand,
      ratio,
      foodFactor,
      starving,
      breedRate,
      presenceMult,
      births: born,
      starvationDeaths: died,
      predationLosses: 0,
      net: 0,
    });
  }

  // ── §7.3 step 3 — predation transfer ───────────────────────────────────────
  // "each predator consumes predationDraw (default 0.1 × predatorCount) from prey pools,
  // proportionally across its prey." Drawn against the season's opening counts, capped by what is
  // actually there: a predator cannot eat prey that does not exist.
  let floraConsumedRaw = 0;
  for (const lineId of ids) {
    const pop = node.populations[lineId];
    if (!pop || pop.count <= 0) continue;
    const pools = preyPools(node, web, lineId, balance);
    if (pools.length === 0) continue;

    let poolTotal = 0;
    for (const pool of pools) poolTotal += pool.units;
    if (poolTotal <= 0) continue;

    const draw = Math.min(cfg.predationDraw * pop.count, poolTotal);
    for (const pool of pools) {
      if (pool.units <= 0) continue;
      const share = draw * (pool.units / poolTotal);
      if (pool.lineId === null) {
        floraConsumedRaw += share / cfg.floraPreyUnitsPerPoint;
      } else {
        predationLosses[pool.lineId] = (predationLosses[pool.lineId] ?? 0) + share;
      }
    }
  }

  // Each predator's draw is capped at ITS OWN view of the pool, which says nothing about what the
  // other predators of the same prey already took — so the SUM could exceed the prey that exists.
  // The population clamp below would hide the overshoot, but `deathsThisSeason` would still carry
  // it, and that number is what the survey reports (Hard Req 2) and the Scavenger encounter term
  // (§7.2). A survey counting deaths of animals that never existed is not a survey of real numbers,
  // so removal is capped at what is actually there, after starvation has taken its share.
  for (const lineId of ids) {
    const opening = node.populations[lineId]?.count ?? 0;
    const available = Math.max(0, opening - (starvationDeaths[lineId] ?? 0));
    const drawn = predationLosses[lineId] ?? 0;
    if (drawn > available) predationLosses[lineId] = available;
  }
  const floraBefore = node.floraStock;
  const floraConsumed = Math.min(floraConsumedRaw, Math.max(0, floraBefore - cfg.floraMin));

  // ── §7.3 step 4 — clamp to [0, carryCap], round via the seeded RNG ─────────
  const nextPopulations = clonePopulations(node.populations);
  let deathsThisSeason = 0;
  for (const report of reports) {
    const pop = nextPopulations[report.lineId];
    if (!pop) continue;
    const lost = predationLosses[report.lineId] ?? 0;
    report.predationLosses = lost;
    report.net = report.births - report.starvationDeaths - lost;

    const real = clamp(pop.count + report.net, cfg.populationFloor, pop.carryCap);
    const rounded = rng.stochasticRound(real);
    pop.count = Math.round(clamp(rounded, cfg.populationFloor, pop.carryCap));
    report.after = pop.count;

    // §7.3 step 5 input — starvation and predation are deaths; a catch is not (that is the player's
    // survey entry, applied at action time by applyCatch). Both terms are now bounded by the
    // opening count, so the season's death count is a number of animals that were really there.
    deathsThisSeason += report.starvationDeaths + lost;
  }

  // Flora is the node's abstract producer stock (build-doc §7.2, 0–100): grazed down by step 3,
  // regrown every season, clamped to its own band.
  const floraAfter = clamp(floraBefore - floraConsumed + cfg.floraRegenPerSeason, cfg.floraMin, cfg.floraMax);

  // ── §7.3 step 5 — recentDeaths accumulator (drives Carricrow weight) ───────
  const recentDeathsBefore = node.recentDeaths ?? 0;
  const recentDeathsAfter =
    recentDeathsBefore * (1 - cfg.recentDeathsDecayPerSeason) + deathsThisSeason;

  // ── §7.3 step 6 — cascade emergence: deliberately NO code. ─────────────────
  // "these rules alone must produce mesopredator-release when an apex's prey is over-caught …
  // DO NOT hard-code the demo cascade (G6)." Verified by tests/property/ecosim.test.ts.

  return {
    node: {
      id: node.id,
      biome: node.biome,
      adjacency: [...node.adjacency],
      floraStock: floraAfter,
      populations: nextPopulations,
      recentDeaths: recentDeathsAfter,
    },
    report: {
      nodeId: node.id,
      season,
      species: reports,
      floraBefore,
      floraConsumed,
      floraAfter,
      deathsThisSeason,
      recentDeathsBefore,
      recentDeathsAfter,
      web,
    },
  };
}

/**
 * One season boundary across the whole region (build-doc §4 step 5).
 *
 * Presence is ALWAYS re-derived from the nodes handed in, never taken from the context: an Ancient's
 * effect is a fact about the current region state, and the season the player catches one is the
 * season the buff must stop (Hard Req 7). A context's presence map is for stepping a single node.
 *
 * Each node runs on its OWN stream, split off the shared one by {@link deriveStreams}, which
 * consumes exactly one parent draw PER STEP — not per node. With a single shared stream the number
 * of fractional values one node happened to round phase-shifted every node stepped after it, so a
 * change at Cindershelf moved the numbers at Hearthollow — six graph hops away, sharing one species,
 * with no causal path. Determinism was never at risk; the survey's readability was (Hard Req 2, and
 * Hard Req 7's epilogue survey, which is a diff of two runs).
 *
 * Per-STEP rather than per-node is what makes build-doc §6 INV-2 true: one draw per node made the
 * parent's cost the size of the region, so adding a thirteenth node phase-shifted every other node
 * from the next season onward. Gated by tests/gates/extensibility.test.ts::ext_add_node.
 */
export function stepAll(
  nodes: EcoNode[],
  season: Season,
  rng: Rng,
  context?: SimContext,
): { nodes: EcoNode[]; reports: StepReport[] } {
  const base = context ?? defaultContext();
  const ctx: SimContext = {
    ...base,
    presence: derivePresence(nodes, base.species, base.balance, base.eco, base.raw),
  };
  // Streams are keyed by node id and cost the parent ONE draw for the whole region, so neither the
  // order the region was handed over in, nor how many nodes it holds (INV-2), moves any node's draws.
  const streams = deriveStreams(rng, nodes.map((n) => n.id).sort());

  const out: EcoNode[] = [];
  const reports: StepReport[] = [];
  for (const node of nodes) {
    const stream = streams.get(node.id);
    if (!stream) throw new EcosimError(`duplicate node id "${node.id}" in the region`);
    streams.delete(node.id); // a region may not list the same node twice
    const result = step(node, season, stream, ctx);
    out.push(result.node);
    reports.push(result.report);
  }
  return { nodes: out, reports };
}

/**
 * The same season boundary over the save's `nodeStates` (build-doc §7.8: "nodeStates (full
 * NodeFile.populations+floraStock per node)" IS the live sim).
 *
 * This is the shape the year turn (§7.5 step 5) and action-log replay (§8.1) need: they hold a
 * `Record<nodeId, NodeState>` and step it, and they must not have to know how presence is derived —
 * which is exactly how the effects came to be silently off on both of those paths.
 */
export function stepRegionStates(
  files: readonly NodeFile[],
  states: Readonly<Record<string, NodeState>>,
  season: Season,
  rng: Rng,
  context?: SimContext,
): { states: Record<string, NodeState>; reports: StepReport[] } {
  const ctx = context ?? defaultContext();
  const nodes: EcoNode[] = [];
  for (const file of files) {
    const state = states[file.id];
    nodes.push(state ? fromNodeState(file, state) : toEcoNode(file));
  }
  const result = stepAll(nodes, season, rng, ctx);
  const out: Record<string, NodeState> = {};
  for (const node of result.nodes) out[node.id] = toNodeState(node);
  return { states: out, reports: result.reports };
}

/**
 * Hard Req 7 — "the epilogue survey shows the numbers". The ending is a survey read (build-doc §4
 * step 6), and the difference the player's choice made only exists in the seasons that follow it, so
 * the epilogue projects the region forward from the state the choice left behind and reports what it
 * finds. Same rules, same seed, no special case: the only input that differs between the two endings
 * is whether the Ancient is still in its node's populations.
 */
export function projectRegion(
  nodes: EcoNode[],
  seasons: readonly Season[],
  rng: Rng,
  context?: SimContext,
): EcoNode[] {
  let current = nodes.map((n) => cloneEcoNode(n));
  for (const season of seasons) current = stepAll(current, season, rng, context).nodes;
  return current;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Player actions on populations (build-doc §7.3: "Player catch/release directly
 * increments/decrements `count` at action time.")
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The population `lineId` occupies at this node — or a loud error.
 *
 * A line that is not at this node used to be a silent no-op, so a wrong-node or mistyped line id
 * lost Hard Req 2's decrement without a word and left the in-game survey quietly wrong. build-doc §7
 * asks for exactly the opposite ("fail loud on drift"), and core/lifecycle.ts already fails loud for
 * the analogous raid case.
 */
function populationAt(node: EcoNode, lineId: string, verb: string) {
  const pop = node.populations[lineId];
  if (!pop) {
    throw new EcosimError(
      `cannot ${verb} "${lineId}" at node "${node.id}": that line has no population there. ` +
        `Hard Req 2 makes this a real decrement of a real number — a no-op would leave the survey wrong.`,
    );
  }
  return pop;
}

/**
 * build-doc §7.3 step 4 — "Clamp to [0, carryCap]" — as ONE function, with the lower bound read
 * from `balance.ecosim.populationFloor` (G11 / INV-4: 0 is the shipped value, not the rule).
 *
 * INTEGRATION NOTE. Every writer of a population count goes through this, and there are two of
 * them: the season step above, and the player's catch/release below. core/save.ts's `replay` is
 * the third caller — it imports this rather than restating the arithmetic. Before integration it
 * DID restate it, and the two disagreed in both directions: replaying a release at carrying
 * capacity produced `carryCap + 1` (measured at r1 bramblehog-line: 22 against a cap of 21, which
 * breaks the §10.2 `pop_bounds` property on the replay path), and `applyCatch` clamped at a
 * literal 0 while `replay` clamped at `populationFloor`, so retuning that key moved one writer and
 * not the other. Either one makes a replayed save disagree with the live play it recorded, which
 * is locked decision L10's whole claim.
 */
export function clampPopulationCount(count: number, carryCap: number, balance: Balance): number {
  return clamp(count, balance.ecosim.populationFloor, carryCap);
}

/** Hard Req 2 — catching decrements the real population of that species at that node. */
export function applyCatch(node: EcoNode, lineId: string, balance: Balance): EcoNode {
  const next = cloneEcoNode(node);
  const pop = populationAt(next, lineId, "catch");
  pop.count = clampPopulationCount(pop.count - 1, pop.carryCap, balance);
  return next;
}

/** Releasing puts the individual back, never above the node's carrying capacity. */
export function applyRelease(node: EcoNode, lineId: string, balance: Balance): EcoNode {
  const next = cloneEcoNode(node);
  const pop = populationAt(next, lineId, "release");
  pop.count = clampPopulationCount(pop.count + 1, pop.carryCap, balance);
  return next;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Save-shaped helpers (build-doc §7.8 `nodeStates` is the live sim)
 * ──────────────────────────────────────────────────────────────────────────── */

/** build-doc §7.2 — "Sim initial state = the file as shipped". */
export function initialState(file: NodeFile): NodeState {
  return { populations: clonePopulations(file.populations), floraStock: file.floraStock, recentDeaths: 0 };
}

export function toNodeState(node: EcoNode): NodeState {
  return {
    populations: clonePopulations(node.populations),
    floraStock: node.floraStock,
    recentDeaths: node.recentDeaths ?? 0,
  };
}

/** Rehydrate the live sim node from the shipped file plus the save's state. */
export function fromNodeState(file: NodeFile, state: NodeState): EcoNode {
  const node = toEcoNode(file, state.recentDeaths);
  node.populations = clonePopulations(state.populations);
  node.floraStock = state.floraStock;
  return node;
}
