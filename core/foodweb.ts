/**
 * core/foodweb.ts — the derived food web, and the two derivations that hang off it.
 *
 * build-doc §8.3 (test `no_shadow_tables`): "no file other than `core/foodweb.ts` may compute diet
 * edges; no encounter-weight literal tables anywhere". THIS IS THAT FILE. Nothing else in the repo
 * may decide who eats whom.
 *
 * build-doc §7.3, from bible §5: "Edges derived per node, per bible §5: Apex eats {Mesopredator,
 * large Grazer} in habitat; Mesopredator eats Grazers; Grazers eat Producers + floraStock;
 * Scavengers eat nothing live; plus each species' `dietExceptions`; Ancients eat nothing (presence
 * effects instead)."
 *
 * build-doc §7.2 "Derivations (never stored)": "encounter weight of species s = populations[s].count
 * (0 count = 0 encounters — the cascade is visible for free), filtered by `seasonalWindow`,
 * Scavenger weight × (1 + recentDeaths/10). Bait lookup: bait matches target if bait's tag ∈
 * target's derived diet (7.3)." Both live here, because both are derivations off the same node JSON
 * — putting either anywhere else would be the second table G3 forbids.
 *
 * Pure TypeScript, zero engine imports (L11). Every number comes from `balance` (G11).
 */

import type {
  AgeClass,
  BaitMatch,
  Balance,
  EncounterWeight,
  FoodWeb,
  HabitatSentinel,
  NodeFile,
  NodePopulation,
  Role,
  Season,
  SpeciesLine,
  TypeName,
} from "./types";
import { ROLES } from "./types";
import type { Rng } from "./rng";

/* ────────────────────────────────────────────────────────────────────────────
 * The live node the sim and the derivations read
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A node as the ecology sees it: the shipped `NodeFile` fields the web needs, plus the §7.3 step-5
 * `recentDeaths` accumulator that the save carries in `NodeState`.
 *
 * Typed as a widening of `NodeFile` on purpose — build-doc §7.2 "Sim initial state = the file as
 * shipped", so a `NodeFile` IS an `EcoNode` with `recentDeaths` defaulting to 0.
 */
export interface EcoNode {
  id: string;
  biome: string;
  adjacency: string[];
  floraStock: number;
  populations: Record<string, NodePopulation>;
  recentDeaths?: number;
}

/** build-doc §7.2 — the shipped file is the year-1 sim state; this is the only conversion needed. */
export function toEcoNode(file: NodeFile, recentDeaths = 0): EcoNode {
  return {
    id: file.id,
    biome: file.biome,
    adjacency: [...file.adjacency],
    floraStock: file.floraStock,
    populations: clonePopulations(file.populations),
    recentDeaths,
  };
}

/**
 * A population map's ids sorted alphabetically — the SERIALISATION order, matching what
 * `core/save.ts` writes, so a node that has been through the sim is byte-stable however it was
 * built. Iteration order for the arithmetic is {@link orderedLineIds}, which is a different and
 * stronger requirement.
 */
export function lineIdsOf(pops: Record<string, NodePopulation>): string[] {
  return Object.keys(pops).sort();
}

/**
 * Deep copy of a population map — the sim never mutates its input. Emitted in sorted key order (see
 * {@link lineIdsOf}), so a node that has been through one step serialises identically however it was
 * built.
 */
export function clonePopulations(pops: Record<string, NodePopulation>): Record<string, NodePopulation> {
  const out: Record<string, NodePopulation> = {};
  for (const id of lineIdsOf(pops)) {
    const p = pops[id];
    if (!p) continue;
    out[id] = { count: p.count, breedRate: p.breedRate, carryCap: p.carryCap };
  }
  return out;
}

/** Deep copy of a node (populations included). */
export function cloneEcoNode(node: EcoNode): EcoNode {
  return {
    id: node.id,
    biome: node.biome,
    adjacency: [...node.adjacency],
    floraStock: node.floraStock,
    populations: clonePopulations(node.populations),
    recentDeaths: node.recentDeaths ?? 0,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Species lookup
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SpeciesIndex {
  byId: Map<string, SpeciesLine>;
  all: SpeciesLine[];
  /** Position of each line in `data/species.json` — see {@link orderedLineIds}. */
  order: Map<string, number>;
}

export function indexSpecies(species: SpeciesLine[]): SpeciesIndex {
  const byId = new Map<string, SpeciesLine>();
  const order = new Map<string, number>();
  species.forEach((line, i) => {
    byId.set(line.id, line);
    order.set(line.id, i);
  });
  return { byId, all: species, order };
}

/**
 * The node's line ids in the ONE order the ecology iterates them in: the order they appear in
 * `data/species.json`.
 *
 * Two things force a canonical order. (1) `Object.keys` hands back INSERTION order, and the shipped
 * node JSON, a save written by `core/save.ts` (which sorts every key at every depth), and a
 * hand-built fixture all differ in it — so anything consuming entropy per line (§7.3 step 4's
 * stochastic rounding) would bind each species to a position in the RNG stream and save → load →
 * continue would diverge from an uninterrupted run of the same action log. That breaks L10 / §8.1.
 * (2) The order must not be derivable from the NAMES either, or the sim's arithmetic depends on what
 * things are called, and "nothing in here knows which species it is" (G6) stops being checkable by
 * relabelling the content and re-running it.
 *
 * The content file's own order satisfies both. Lines absent from the index (never a shipped state)
 * sort last, alphabetically, so the function is total.
 */
export function orderedLineIds(pops: Record<string, NodePopulation>, idx: SpeciesIndex): string[] {
  return Object.keys(pops).sort((a, b) => {
    const ia = idx.order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = idx.order.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ia === ib ? a.localeCompare(b) : ia - ib;
  });
}

/**
 * bible §5 — "the population sim tracks the line as one age-structured species", while
 * `NodeFile.populations` carries ONE count per line. Which age class's role/type the web reads is
 * therefore a tunable, not a code decision: `balance.ecosim.webRoleAgeClass` (shipped: "A", the
 * adult — so the Mirefin line is a Mesopredator in the web even though its juveniles graze).
 *
 * DEVIATIONS.md D14 / DEVIATIONS-lane-a2.md A2-D11 carry the flag: build-doc §7.1's `role` is
 * per-age and bible §4 designs a mid-life role shift, but the inlined §7.2 `populations` schema
 * carries one scalar count per line with no age breakdown, so exactly one of the two roles can drive
 * the web. This is that choice, made as data rather than in code.
 */
export function webAgeClass(balance: Balance): AgeClass {
  return balance.ecosim.webRoleAgeClass;
}

export function webRole(line: SpeciesLine, balance: Balance): Role {
  return line.role[webAgeClass(balance)];
}

export function webTypes(line: SpeciesLine, balance: Balance): TypeName[] {
  return line.types[webAgeClass(balance)];
}

/** build-doc §7.1 — `habitat`: node biome tags; "roaming" = all. */
const ROAMING: HabitatSentinel = "roaming";

export function inhabits(line: SpeciesLine, biome: string): boolean {
  return line.habitat.includes(biome) || line.habitat.includes(ROAMING);
}

/** bible §4 — exactly one line is marked "Grazer (large)"; §5 lets an Apex take those. */
export function isLargeGrazer(line: SpeciesLine, balance: Balance): boolean {
  return webRole(line, balance) === "Grazer" && line.sizeClass === "large";
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.3 — the derivation. The ONLY diet-edge computation in the repo (§8.3, G3).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Which roles a role eats, per bible §5. Data, not branching: a role missing from this map eats
 * nothing live (Producer photosynthesises, Scavenger "eats nothing live", AncientApex "eats
 * nothing — presence effects instead"). No species id appears anywhere in this file (G6).
 */
const ROLE_DIET: Readonly<Record<Role, readonly Role[]>> = {
  Producer: [],
  Grazer: ["Producer"],
  Mesopredator: ["Grazer"],
  Apex: ["Mesopredator", "Grazer"], // Grazers only when large — see largeGrazerOnly below
  Scavenger: [],
  AncientApex: [],
};

/** bible §5 — "Apex eats Mesopredators and **large** Grazers"; the Mesopredator has no such limit. */
const LARGE_GRAZER_ONLY: Readonly<Record<Role, boolean>> = {
  Producer: false,
  Grazer: false,
  Mesopredator: false,
  Apex: true,
  Scavenger: false,
  AncientApex: false,
};

/** bible §5 — "Grazers eat Producers (creature Producers + each node's abstract flora stock)". */
const FLORA_FEEDERS: Readonly<Record<Role, boolean>> = {
  Producer: false,
  Grazer: true,
  Mesopredator: false,
  Apex: false,
  Scavenger: false,
  AncientApex: false,
};

/**
 * The role tag(s) the node's abstract flora stock stands in for — derived from the same two tables,
 * never restated: whatever a flora-feeding role eats is what the flora pool is a pool OF (bible §5
 * "Grazers eat Producers (creature Producers + each node's abstract flora stock)").
 */
const FLORA_ROLE_TAGS: ReadonlySet<string> = new Set(
  ROLES.filter((role) => FLORA_FEEDERS[role]).flatMap((role) => [...ROLE_DIET[role]]),
);

/**
 * Derive the node's food web from roles + habitat + exceptions. Never stored (build-doc §7.2
 * "Derivations (never stored)"), never enumerated per-pair (bible §5 "rule-derived").
 *
 * A line participates only if it is PRESENT in this node's populations (the node JSON is the single
 * source of truth for who is here) AND its habitat admits the node's biome (bible §5 "in its
 * habitat"; "roaming" admits every biome). Lines with count 0 keep their structural edges — an
 * extinct predator still tells the survey what it used to eat — but contribute 0 prey units.
 */
export function deriveFoodWeb(node: EcoNode, idx: SpeciesIndex, balance: Balance): FoodWeb {
  const present: SpeciesLine[] = [];
  for (const id of orderedLineIds(node.populations, idx)) {
    const line = idx.byId.get(id);
    // bible §5's "in its habitat" clause. A line listed in a node's populations whose habitat tag
    // does not admit that node's biome takes no part in the web: it neither eats nor is eaten there.
    // tests/property/foodweb.test.ts::"the habitat clause is load-bearing" is what binds this line.
    if (line && inhabits(line, node.biome)) present.push(line);
  }

  const edges: Record<string, string[]> = {};
  const floraFeeders: string[] = [];

  for (const predator of present) {
    const role = webRole(predator, balance);
    const eats = ROLE_DIET[role];
    const prey: string[] = [];

    for (const candidate of present) {
      if (candidate.id === predator.id) continue; // no line eats itself
      const preyRole = webRole(candidate, balance);
      if (!eats.includes(preyRole)) continue;
      if (LARGE_GRAZER_ONLY[role] && preyRole === "Grazer" && !isLargeGrazer(candidate, balance)) continue;
      prey.push(candidate.id);
    }

    // bible §5 exceptions table — "Fenmaw also eats Reedrick". Additive, still habitat- and
    // presence-gated: an exception cannot conjure prey that is not at this node.
    for (const exceptionId of predator.dietExceptions ?? []) {
      if (exceptionId === predator.id) continue;
      if (!node.populations[exceptionId]) continue;
      const line = idx.byId.get(exceptionId);
      if (!line || !inhabits(line, node.biome)) continue;
      if (!prey.includes(exceptionId)) prey.push(exceptionId);
    }

    edges[predator.id] = prey;
    if (FLORA_FEEDERS[role]) floraFeeders.push(predator.id);
  }

  return { nodeId: node.id, edges, floraFeeders };
}

/** Prey line ids of one predator at this node (empty for Producers, Scavengers and Ancients). */
export function preyOf(web: FoodWeb, lineId: string): string[] {
  return web.edges[lineId] ?? [];
}

/** Every line at this node that eats `lineId` — what "release" is the removal of. */
export function predatorsOf(web: FoodWeb, lineId: string): string[] {
  const out: string[] = [];
  for (const predatorId of Object.keys(web.edges)) {
    if ((web.edges[predatorId] ?? []).includes(lineId)) out.push(predatorId);
  }
  return out;
}

/** True when this line grazes the node's abstract flora stock (bible §5). */
export function feedsOnFlora(web: FoodWeb, lineId: string): boolean {
  return web.floraFeeders.includes(lineId);
}

/** One prey pool of one predator, in prey units. */
export interface PreyPool {
  /** Line id, or null for the node's abstract flora stock. */
  lineId: string | null;
  units: number;
}

/**
 * The predator's prey pools, in prey units: one unit per prey individual, and
 * `balance.ecosim.floraPreyUnitsPerPoint` units per point of flora stock (build-doc §7.2 flora is
 * "abstract producer stock, 0–100" — the conversion is what puts it on the same scale as bodies).
 */
export function preyPools(node: EcoNode, web: FoodWeb, lineId: string, balance: Balance): PreyPool[] {
  const pools: PreyPool[] = [];
  for (const preyId of preyOf(web, lineId)) {
    pools.push({ lineId: preyId, units: node.populations[preyId]?.count ?? 0 });
  }
  if (feedsOnFlora(web, lineId)) {
    pools.push({ lineId: null, units: node.floraStock * balance.ecosim.floraPreyUnitsPerPoint });
  }
  return pools;
}

/** Total prey units available to one line — the numerator of §7.3 step 1's foodFactor. */
export function availablePrey(node: EcoNode, web: FoodWeb, lineId: string, balance: Balance): number {
  let total = 0;
  for (const pool of preyPools(node, web, lineId, balance)) total += pool.units;
  return total;
}

/**
 * §7.3 step 1/2 denominator: `demand[s] = count[s] × demandPerIndividual[role of s]`.
 * A role whose figure is 0 has no live diet at all and never starves (balance.json `_demand`).
 */
export function demandOf(node: EcoNode, idx: SpeciesIndex, lineId: string, balance: Balance): number {
  const line = idx.byId.get(lineId);
  const pop = node.populations[lineId];
  if (!line || !pop) return 0;
  return pop.count * balance.ecosim.demandPerIndividual[webRole(line, balance)];
}

/** True when this line has a live diet at all (Producers/Scavengers/Ancients do not). */
export function hasLiveDiet(idx: SpeciesIndex, lineId: string, balance: Balance): boolean {
  const line = idx.byId.get(lineId);
  if (!line) return false;
  return balance.ecosim.demandPerIndividual[webRole(line, balance)] > 0;
}

/** availablePrey / demand — null when the line has no live diet (nothing to divide). */
export function foodRatio(
  node: EcoNode,
  web: FoodWeb,
  idx: SpeciesIndex,
  lineId: string,
  balance: Balance,
): number | null {
  if (!hasLiveDiet(idx, lineId, balance)) return null;
  const demand = demandOf(node, idx, lineId, balance);
  if (demand <= 0) return null;
  return availablePrey(node, web, lineId, balance) / demand;
}

/**
 * The predator's PRIMARY prey: the pool it draws the most of its food from right now.
 *
 * Derived, never declared — as populations move, so does the answer, which is the whole point:
 * "primary prey" is a fact about the current state, not a label on a species. Flora never counts as
 * a primary prey line (it is not catchable, so a player cannot over-catch it).
 */
export function primaryPrey(node: EcoNode, web: FoodWeb, lineId: string, balance: Balance): string | null {
  let best: string | null = null;
  let bestUnits = -1;
  for (const pool of preyPools(node, web, lineId, balance)) {
    if (pool.lineId === null) continue;
    // Ties broken alphabetically — the SAME rule {@link limitingPrey} sorts by, so the two can never
    // disagree about which pool is the biggest (two pools of equal size is the common case at
    // shipped counts, and "primary prey" must be one answer, not two).
    const better = pool.units > bestUnits || (pool.units === bestUnits && best !== null && pool.lineId < best);
    if (better) {
      best = pool.lineId;
      bestUnits = pool.units;
    }
  }
  return best;
}

/**
 * The prey the predator actually DEPENDS on: prey lines taken in descending abundance until
 * removing them would drop the predator under `balance.ecosim.starveThreshold`.
 *
 * DEVIATIONS-lane-a2.md A2-D10 — build-doc §10.2 says "forcing **its primary prey**", singular, and
 * that is {@link primaryPrey}. Read literally the §10.2 property is FALSE on the shipped content
 * wherever the apex can substitute one pool for another (measured per node by
 * tests/property/ecosim.test.ts, which asserts BOTH readings and publishes which nodes fall in which
 * class). `limitingPrey` is the set reading: the minimal set of catchable pools whose loss starves
 * the predator — equal to `[primaryPrey]` exactly when the predator is a specialist. Nothing about
 * the cascade is enumerated (G6); this is computed from the same web every other reader uses.
 */
export function limitingPrey(
  node: EcoNode,
  web: FoodWeb,
  idx: SpeciesIndex,
  lineId: string,
  balance: Balance,
  forcedFraction: number,
): string[] {
  if (!hasLiveDiet(idx, lineId, balance)) return [];
  const demand = demandOf(node, idx, lineId, balance);
  if (demand <= 0) return [];

  const pools = preyPools(node, web, lineId, balance)
    .filter((p): p is PreyPool & { lineId: string } => p.lineId !== null)
    .sort((a, b) => (b.units === a.units ? a.lineId.localeCompare(b.lineId) : b.units - a.units));

  const taken: string[] = [];
  let remaining = availablePrey(node, web, lineId, balance);
  for (const pool of pools) {
    if (remaining / demand < balance.ecosim.starveThreshold) return taken;
    // Over-catching a pool to `forcedFraction` leaves that fraction behind, not nothing.
    remaining -= pool.units * (1 - forcedFraction);
    taken.push(pool.lineId);
  }
  // Every catchable pool over-caught and the predator still eats: nothing here is limiting. A
  // flora-grazing line is the usual case — you cannot over-catch a meadow.
  return remaining / demand < balance.ecosim.starveThreshold ? taken : [];
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.2 Derivation 1 — encounter weights (never a table: G3)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface EncounterOptions {
  /** Current season — migrants outside their window drop out (Hard Req 10). */
  season: Season;
  /**
   * Sign-chains the player has completed. A line whose habitat carries
   * `balance.encounter.signChainGatedHabitatTag` stays out of the ordinary pool until its chain is
   * unlocked (bible §4: the Ancients are "gated behind rare sign-card chains").
   */
  unlockedSignChains?: ReadonlySet<string>;
}

/**
 * bible §5 legibility requirement: "dex entries and sign cards flag migrants as 'dormant' or
 * 'migrating' out of season, so seasonal absence is never confusable with a population crash."
 *
 * The two words are earned, not arbitrary: on the shoulders of its window (the season either side
 * of it) the animal is on the move — "migrating"; deeper out of season it is "dormant". Derived
 * from `balance.clock.seasonOrder`, so it stays true if the order is retuned.
 */
export function migrantStatus(
  line: SpeciesLine,
  season: Season,
  balance: Balance,
): { active: boolean; dormantReason?: "dormant" | "migrating" } {
  const window = line.seasonalWindow;
  if (!window) return { active: true };
  if (window === season) return { active: true };

  const order = balance.clock.seasonOrder;
  const here = order.indexOf(season);
  const there = order.indexOf(window);
  if (here < 0 || there < 0) return { active: false, dormantReason: "dormant" };

  const n = order.length;
  const forward = (there - here + n) % n;
  const distance = Math.min(forward, n - forward);
  return { active: false, dormantReason: distance === 1 ? "migrating" : "dormant" };
}

/**
 * build-doc §7.2 — "encounter weight of species s = `populations[s].count` (0 count = 0 encounters
 * — the cascade is visible for free), filtered by `seasonalWindow`, Scavenger weight ×
 * (1 + recentDeaths/10)."
 *
 * Every entry is returned, including the zero-weighted ones: the dex and the sign cards need to say
 * WHY something is absent (migrating vs wiped out), and that answer must come from the same call
 * the encounter roll uses, or the two can disagree.
 */
export function encounterWeights(
  node: EcoNode,
  idx: SpeciesIndex,
  balance: Balance,
  opts: EncounterOptions,
): EncounterWeight[] {
  const gatedTag = balance.encounter.signChainGatedHabitatTag;
  const unlocked = opts.unlockedSignChains;
  const recentDeaths = node.recentDeaths ?? 0;
  const out: EncounterWeight[] = [];

  for (const lineId of orderedLineIds(node.populations, idx)) {
    const pop = node.populations[lineId];
    const line = idx.byId.get(lineId);
    if (!pop || !line) continue;

    // DEVIATIONS A2-D12 — a THIRD filter beyond build-doc §7.2's two (seasonalWindow, Scavenger ×
    // recentDeaths): bible §4's "gated behind rare sign-card chains". Without it the finale
    // legendary derives as an ordinary wild encounter, because §7.2's weight IS the live count and
    // the Ancients sit in `populations` (the single source of truth, G3). The tag is data
    // (`balance.encounter.signChainGatedHabitatTag`), never a literal here.
    const gated = line.habitat.includes(gatedTag) && !(unlocked?.has(lineId) ?? false);
    const status = migrantStatus(line, opts.season, balance);

    if (gated) {
      out.push({ lineId, weight: 0, active: false });
      continue;
    }
    if (!status.active) {
      const entry: EncounterWeight = {
        lineId,
        weight: balance.encounter.outOfSeasonWeight,
        active: false,
      };
      if (status.dormantReason) entry.dormantReason = status.dormantReason;
      out.push(entry);
      continue;
    }

    let weight = pop.count;
    if (webRole(line, balance) === "Scavenger") {
      // bible §4/§5 — "carrion crow — spawn weight rises where webs crash".
      weight *= 1 + recentDeaths / balance.encounter.scavengerRecentDeathsDivisor;
    }
    out.push({ lineId, weight, active: weight > 0 });
  }

  return out;
}

/**
 * Roll one encounter off the derived weights. Returns null when nothing is available — an emptied
 * node genuinely produces no encounters rather than falling back to a table (G3).
 */
export function rollEncounter(weights: readonly EncounterWeight[], rng: Rng): string | null {
  const picked = rng.pickWeighted(weights, (w) => (w.active ? w.weight : 0));
  return picked ? picked.lineId : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.2 Derivation 2 — bait match (never a table: G3)
 * ──────────────────────────────────────────────────────────────────────────── */

const ROLE_TAGS: ReadonlySet<string> = new Set(ROLES);

/**
 * build-doc §7.2 — "Bait lookup: bait matches target if bait's tag ∈ target's derived diet (7.3)."
 *
 * A bait tag is either a species line id (bible §11's species-specific bait) or a role name (its
 * role-generic bait). The answer feeds `balance.catch.baitMult` — `"species"` 2.0, `"role"` 1.5,
 * `"none"` 1.0 — so the strength of a bait is a fact about the web, not a lookup table.
 */
export function baitMatchFor(
  baitTag: string | undefined,
  targetLineId: string,
  node: EcoNode,
  idx: SpeciesIndex,
  balance: Balance,
  web?: FoodWeb,
): BaitMatch {
  if (!baitTag) return "none";
  const resolved = web ?? deriveFoodWeb(node, idx, balance);
  const diet = preyOf(resolved, targetLineId);

  if (diet.includes(baitTag)) return "species";

  if (ROLE_TAGS.has(baitTag)) {
    for (const preyId of diet) {
      const prey = idx.byId.get(preyId);
      if (prey && webRole(prey, balance) === baitTag) return "role";
    }
    // DEVIATIONS A2-D13 — an extension of build-doc §7.2's "bait's tag ∈ target's derived diet":
    // bible §5 gives Grazers TWO food sources ("creature Producers + each node's abstract flora
    // stock"), and at a node with no creature Producer (bible §4 leaves Steppe and Vale without one
    // — DEVIATIONS D12) the derived diet is empty, so the cheap role-generic Producer bait would
    // match nothing at exactly the nodes where a Grazer is the only thing to bait. The flora pool is
    // a Producer pool; this says so.
    if (feedsOnFlora(resolved, targetLineId) && FLORA_ROLE_TAGS.has(baitTag)) return "role";
  }

  return "none";
}
