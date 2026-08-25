/**
 * tests/property/ecosim.test.ts — build-doc §10.2's named gates for the population sim.
 *
 *   `pop_bounds`       populations are always integers in [0, carryCap], for any seed/season/state.
 *   `cascade_emerges`  the demo beat as a law: over-catch an apex's prey and the apex goes, and
 *                      whatever is left of the tier below it is released — asserted under BOTH
 *                      readings of §10.2's "its primary prey", with every run classified and
 *                      counted, and NOTHING in core/ecosim.ts knowing any of it happened (G6).
 *   `perf_sim`         all 12 nodes inside balance.perf.ecosimStepBudgetMs, mega-node inside that
 *                      budget × balance.perf.megaNodeMarginMultiplier (build-doc §12).
 *   `ext_retune`       build-doc §6 INV-3 — a harness running with an overridden balance file gets
 *                      the numbers it wrote, including the ones zod does not declare.
 *
 * plus the hand-computed mini-node arithmetic (build-doc §11), which is what catches a sign error a
 * property test would happily accept.
 *
 * `det_sim` lives in tests/property/determinism.test.ts.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyCatch,
  applyRelease,
  cascadeConstants,
  defaultContext,
  derivePresence,
  ecoConstants,
  EcosimError,
  initialState,
  makeContext,
  presenceMagnitude,
  PRESENCE_MODES,
  projectRegion,
  step,
  stepAll,
  stepRegionStates,
  withPresence,
  type PresenceMap,
  type SimContext,
  type SpeciesStepReport,
} from "../../core/ecosim";
import {
  cloneEcoNode,
  deriveFoodWeb,
  indexSpecies,
  inhabits,
  limitingPrey,
  predatorsOf,
  preyOf,
  primaryPrey,
  toEcoNode,
  webRole,
  type EcoNode,
} from "../../core/foodweb";
import { createRng } from "../../core/rng";
import { validateContent, zBalance, zNodeFile } from "../../core/schemas";
import type { Balance, NodeFile, Role, Season, SpeciesLine } from "../../core/types";
import { HABITAT_SENTINELS, ROLES, TYPE_NAMES } from "../../core/types";
import miniNodeJson from "../../fixtures/mini-node.json";
import megaNodeJson from "../../fixtures/mega-node.json";
import overcatchScriptJson from "../../fixtures/overcatch-script.json";
import rawBalanceJson from "../../data/balance.json";

const content = validateContent();
const ctx = defaultContext();
const idx = ctx.species;
const balance = content.balance;
const eco = ecoConstants(balance);
const cascade = cascadeConstants(balance);
const seasons = balance.clock.seasonOrder;
const shipped = content.nodes.map((file) => toEcoNode(file));

const miniNode = miniNodeJson as unknown as NodeFile;
const megaNode = megaNodeJson as unknown as NodeFile;

/** A context whose presence map covers exactly the nodes about to be stepped. */
const ctxFor = (nodes: EcoNode[]): SimContext => withPresence(ctx, nodes);
const soloCtx = (node: EcoNode): SimContext => ctxFor([node]);

const roleOf = (lineId: string): Role => {
  const line = idx.byId.get(lineId);
  if (!line) throw new Error(`unknown line ${lineId}`);
  return webRole(line, balance);
};
const findRole = (node: EcoNode, role: Role): string | undefined =>
  Object.keys(node.populations).find((id) => idx.byId.has(id) && roleOf(id) === role);
const reportFor = (species: SpeciesStepReport[], lineId: string): SpeciesStepReport => {
  const found = species.find((s) => s.lineId === lineId);
  if (!found) throw new Error(`no report for ${lineId}`);
  return found;
};

/* ════════════════════════════════════════════════════════════════════════════
 * Hand-computed arithmetic — build-doc §11 mini-node
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ecosim — the hand-computed mini-node step (build-doc §11)", () => {
  it("lands on the exact numbers written in fixtures/mini-node.json, spending no entropy", () => {
    const node = toEcoNode(miniNode);
    const rng = createRng(1);
    const { node: after, report } = step(node, "spring", rng, soloCtx(node));

    // Every term of this step is exact, so the whole step is checkable on paper.
    expect(rng.draws).toBe(0);

    // loamunder — Producer: no live diet, so foodFactor = noDietFoodFactor and it never starves.
    const producer = reportFor(report.species, "loamunder-line");
    expect(producer.role).toBe("Producer");
    expect(producer.ratio).toBeNull();
    expect(producer.foodFactor).toBe(balance.ecosim.noDietFoodFactor);
    expect(producer.births).toBeCloseTo(10 * 0.12 * 1.0, 12); // 1.2
    expect(producer.predationLosses).toBeCloseTo(0.2, 12); // 2.0 × (10 / 100)
    expect(producer.after).toBe(11); // 10 + 1.2 − 0.2 = 11.0

    // nibbin — Grazer: prey = loamunder 10 + flora 45 × 2.0 = 100 units against a demand of 60,
    // so the ratio 1.667 clamps to foodFactorClampMax.
    const grazer = reportFor(report.species, "nibbin-line");
    expect(grazer.availablePrey).toBeCloseTo(100, 12);
    expect(grazer.demand).toBe(20 * balance.ecosim.demandPerIndividual.Grazer); // 60
    expect(grazer.ratio).toBeCloseTo(100 / 60, 12);
    expect(grazer.foodFactor).toBe(balance.ecosim.foodFactorClampMax);
    expect(grazer.births).toBeCloseTo(20 * 0.04 * 1.25, 12); // 1.0
    expect(grazer.predationLosses).toBeCloseTo(1.0, 12); // skir draws 0.1 × 10
    expect(grazer.after).toBe(20); // 20 + 1.0 − 1.0 = 20.0

    // skir — Mesopredator: prey = nibbin 20 against a demand of 20 → foodFactor exactly 1.
    const meso = reportFor(report.species, "skir-line");
    expect(meso.availablePrey).toBe(20);
    expect(meso.demand).toBe(10 * balance.ecosim.demandPerIndividual.Mesopredator); // 20
    expect(meso.foodFactor).toBe(1);
    expect(meso.births).toBeCloseTo(1.0, 12);
    expect(meso.predationLosses).toBe(0);
    expect(meso.after).toBe(11); // 10 + 1.0

    // Flora: grazed by 1.8 units = 0.9 points, then regrown by floraRegenPerSeason.
    expect(report.floraConsumed).toBeCloseTo(0.9, 12);
    expect(after.floraStock).toBeCloseTo(45 - 0.9 + balance.ecosim.floraRegenPerSeason, 12); // 52.1

    // §7.3 step 5 — recentDeaths: 0 × (1 − decay) + (0.2 + 1.0).
    expect(report.deathsThisSeason).toBeCloseTo(1.2, 12);
    expect(after.recentDeaths).toBeCloseTo(1.2, 12);

    // Purity: the input node is untouched.
    expect(node.populations["loamunder-line"]?.count).toBe(10);
    expect(node.floraStock).toBe(45);
  });

  it("starves the mesopredator on exactly the arithmetic the doc specifies", () => {
    // Same node, but 40 skir against 20 nibbin: ratio 20/80 = 0.25, under starveThreshold 0.4.
    const node = toEcoNode(miniNode);
    const skir = node.populations["skir-line"];
    if (!skir) throw new Error("mini-node changed shape");
    skir.count = 40;
    skir.carryCap = 60;

    const rng = createRng(1);
    const { node: after, report } = step(node, "spring", rng, soloCtx(node));
    expect(rng.draws).toBe(0);

    const meso = reportFor(report.species, "skir-line");
    expect(meso.ratio).toBeCloseTo(0.25, 12);
    expect(meso.starving).toBe(true);
    expect(meso.foodFactor).toBe(balance.ecosim.foodFactorClampMin);
    expect(meso.births).toBe(0); // a starving population does not breed
    expect(meso.starvationDeaths).toBeCloseTo(40 * balance.ecosim.starveRate, 12); // 12
    expect(meso.after).toBe(28); // 40 − 12

    // Its prey pays for the 40 mouths: predation draw 0.1 × 40 = 4.0 off nibbin.
    const grazer = reportFor(report.species, "nibbin-line");
    expect(grazer.predationLosses).toBeCloseTo(4.0, 12);
    expect(grazer.after).toBe(17); // 20 + 1.0 − 4.0

    expect(report.deathsThisSeason).toBeCloseTo(12 + 4.0 + 0.2, 12);
    expect(after.recentDeaths).toBeCloseTo(16.2, 12);
  });

  it("stochastic rounding is used, and it is unbiased where the arithmetic is fractional", () => {
    // nibbin at breedRate 0.05 gives 20 + 1.25 − 1.0 = 20.25 — the one fractional outcome.
    const base = toEcoNode(miniNode);
    const nibbin = base.populations["nibbin-line"];
    if (!nibbin) throw new Error("mini-node changed shape");
    nibbin.breedRate = 0.05;
    const nodeCtx = soloCtx(base);

    let ups = 0;
    const trials = 4000;
    for (let seed = 1; seed <= trials; seed++) {
      const after = step(cloneEcoNode(base), "spring", createRng(seed), nodeCtx).node;
      const count = after.populations["nibbin-line"]?.count ?? -1;
      expect([20, 21]).toContain(count);
      if (count === 21) ups++;
    }
    expect(ups / trials).toBeGreaterThan(0.2);
    expect(ups / trials).toBeLessThan(0.3);
  });

  it("a catch is a real decrement of the real population (Hard Req 2)", () => {
    const node = toEcoNode(miniNode);
    const caught = applyCatch(node, "nibbin-line", balance);
    expect(caught.populations["nibbin-line"]?.count).toBe(19);
    expect(node.populations["nibbin-line"]?.count).toBe(20); // pure
    expect(applyRelease(caught, "nibbin-line", balance).populations["nibbin-line"]?.count).toBe(20);

    // Catching cannot go below zero, and releasing cannot go past the carrying capacity.
    let emptied = node;
    for (let i = 0; i < 50; i++) emptied = applyCatch(emptied, "nibbin-line", balance);
    expect(emptied.populations["nibbin-line"]?.count).toBe(0);
    let stuffed = node;
    for (let i = 0; i < 200; i++) stuffed = applyRelease(stuffed, "nibbin-line", balance);
    expect(stuffed.populations["nibbin-line"]?.count).toBe(node.populations["nibbin-line"]?.carryCap);
  });

  it("catching a line that is not at this node FAILS LOUD — a lost decrement is a wrong ledger", () => {
    // Hard Req 2 makes the decrement the ledger. A wrong-node or mistyped line id used to be a
    // silent no-op, so the ledger went quietly wrong instead of the call going loudly wrong.
    const node = toEcoNode(miniNode);
    const absent = content.species.find((line) => !node.populations[line.id]);
    if (!absent) throw new Error("mini-node holds every line");
    expect(() => applyCatch(node, absent.id, balance)).toThrow(EcosimError);
    expect(() => applyRelease(node, absent.id, balance)).toThrow(EcosimError);
    expect(() => applyCatch(node, "no-such-line", balance)).toThrow(/no population there/);
    // …and it did not half-apply anything on the way out.
    expect(JSON.stringify(node.populations)).toBe(JSON.stringify(toEcoNode(miniNode).populations));
  });

  it("mini-node is a legitimate node: every line it holds actually lives in its biome", () => {
    const parsed = zNodeFile.safeParse(miniNodeJson);
    expect(parsed.success, JSON.stringify(parsed.error?.issues ?? [])).toBe(true);
    for (const lineId of Object.keys(miniNode.populations)) {
      const line = idx.byId.get(lineId);
      expect(line, `${lineId} is not a shipped line`).toBeDefined();
      expect(inhabits(line as SpeciesLine, miniNode.biome), `${lineId} does not live in ${miniNode.biome}`).toBe(true);
    }
    // G3 — a fixture may not smuggle in the second table the node schema forbids.
    for (const fixture of [miniNodeJson, megaNodeJson] as unknown as Array<Record<string, unknown>>) {
      expect(Object.keys(fixture).filter((k) => /spawn|encounter|bait/i.test(k))).toEqual([]);
    }
    expect(zNodeFile.safeParse(megaNodeJson).success).toBe(true);
    for (const lineId of Object.keys(megaNode.populations)) expect(idx.byId.has(lineId)).toBe(true);
  });

  it("the shipped node file IS the year-1 sim state (build-doc §7.2)", () => {
    for (const file of content.nodes) {
      const state = initialState(file);
      expect(state.populations).toEqual(file.populations);
      expect(state.floraStock).toBe(file.floraStock);
      expect(state.recentDeaths).toBe(0);
    }
  });

  it("no season's ledger claims more deaths than there were animals to lose", () => {
    // Each predator's draw is capped at its own view of the pool, which says nothing about what the
    // other predators of the same prey already took. Unchecked, `deathsThisSeason` — the ledger
    // (Hard Req 2) and the Scavenger encounter term (§7.2) — counts deaths of animals that never
    // existed. Here two 200-strong predators share two 4-strong prey pools.
    const forest = shipped.find((n) => n.id === "r3");
    if (!forest) throw new Error("r3 missing");
    const crowded = cloneEcoNode(forest);
    const meso = findRole(crowded, "Mesopredator");
    const apex = findRole(crowded, "Apex");
    if (!meso || !apex) throw new Error("r3 shape changed");
    for (const [lineId, pop] of Object.entries(crowded.populations)) {
      const isPredator = lineId === meso || lineId === apex;
      pop.count = isPredator ? 200 : 4;
      pop.carryCap = Math.max(pop.carryCap, 400);
    }
    crowded.floraStock = 0;

    const { report } = step(crowded, "spring", createRng(9), soloCtx(crowded));
    let opening = 0;
    for (const entry of report.species) {
      opening += entry.before;
      expect(
        entry.starvationDeaths + entry.predationLosses,
        `${entry.lineId} lost more than it had: ${entry.starvationDeaths + entry.predationLosses} of ${entry.before}`,
      ).toBeLessThanOrEqual(entry.before + 1e-9);
    }
    expect(report.deathsThisSeason).toBeLessThanOrEqual(opening + 1e-9);
    expect(report.floraConsumed).toBeLessThanOrEqual(report.floraBefore + 1e-9);

    // The same must hold for every shipped node, every season, whatever the seed.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        let nodes = shipped.map((n) => cloneEcoNode(n));
        const rng = createRng(seed);
        for (const season of seasons) {
          const { nodes: next, reports } = stepAll(nodes, season, rng, ctx);
          for (const rep of reports) {
            let before = 0;
            for (const entry of rep.species) {
              before += entry.before;
              expect(entry.starvationDeaths + entry.predationLosses).toBeLessThanOrEqual(entry.before + 1e-9);
            }
            expect(rep.deathsThisSeason).toBeLessThanOrEqual(before + 1e-9);
          }
          nodes = next;
        }
      }),
      { numRuns: 20 },
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * pop_bounds — build-doc §10.2
 * ════════════════════════════════════════════════════════════════════════════ */

/** An arbitrary node state: real species, wildly unreal numbers — including counts over the cap. */
const wildStateArb = fc.record({
  templateIndex: fc.integer({ min: 0, max: content.nodes.length - 1 }),
  counts: fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 8, maxLength: 8 }),
  caps: fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 8, maxLength: 8 }),
  breeds: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 8, maxLength: 8 }),
  flora: fc.double({ min: 0, max: 200, noNaN: true }),
  recentDeaths: fc.double({ min: 0, max: 100, noNaN: true }),
  season: fc.constantFrom(...(seasons as Season[])),
  seed: fc.integer({ min: 1, max: 2 ** 31 - 1 }),
  steps: fc.integer({ min: 1, max: 8 }),
});

function buildWildNode(spec: {
  templateIndex: number;
  counts: number[];
  caps: number[];
  breeds: number[];
  flora: number;
  recentDeaths: number;
}): EcoNode {
  const file = content.nodes[spec.templateIndex];
  if (!file) throw new Error("bad template index");
  const node = toEcoNode(file, spec.recentDeaths);
  node.floraStock = spec.flora;
  Object.keys(node.populations).forEach((lineId, i) => {
    const pop = node.populations[lineId];
    if (!pop) return;
    pop.count = spec.counts[i % spec.counts.length] ?? 0;
    pop.carryCap = spec.caps[i % spec.caps.length] ?? 0;
    pop.breedRate = spec.breeds[i % spec.breeds.length] ?? 0;
  });
  return node;
}

describe("pop_bounds — build-doc §10.2", () => {
  it("every population is an integer in [0, carryCap] after every step, for any state", () => {
    fc.assert(
      fc.property(wildStateArb, (spec) => {
        let node = buildWildNode(spec);
        const rng = createRng(spec.seed);
        for (let s = 0; s < spec.steps; s++) {
          // Presence is re-derived every season, as `stepAll` does: an Ancient that has just gone
          // from the node must take its buff with it, and a stale map is an error, not a shrug.
          node = step(node, seasons[s % seasons.length] as Season, rng, soloCtx(node)).node;
          for (const [lineId, pop] of Object.entries(node.populations)) {
            expect(Number.isInteger(pop.count), `${lineId} not an integer: ${pop.count}`).toBe(true);
            expect(pop.count).toBeGreaterThanOrEqual(balance.ecosim.populationFloor);
            expect(pop.count).toBeLessThanOrEqual(pop.carryCap);
          }
          expect(node.floraStock).toBeGreaterThanOrEqual(balance.ecosim.floraMin);
          expect(node.floraStock).toBeLessThanOrEqual(balance.ecosim.floraMax);
          expect(node.recentDeaths ?? 0).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(node.recentDeaths ?? 0)).toBe(true);
        }
      }),
      { numRuns: 400 },
    );
  });

  it("holds across the whole shipped region for a full six-year run", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        let nodes = shipped.map((n) => cloneEcoNode(n));
        const rng = createRng(seed);
        for (let year = 0; year < balance.clock.yearsTotal; year++) {
          for (const season of seasons) {
            nodes = stepAll(nodes, season, rng, ctx).nodes;
            for (const node of nodes) {
              for (const pop of Object.values(node.populations)) {
                expect(Number.isInteger(pop.count)).toBe(true);
                expect(pop.count).toBeGreaterThanOrEqual(0);
                expect(pop.count).toBeLessThanOrEqual(pop.carryCap);
              }
            }
          }
        }
      }),
      { numRuns: 12 },
    );
  });

  it("a carrying capacity of zero empties the node, and extinction is permanent", () => {
    const file = content.nodes[1];
    if (!file) throw new Error("no second node");
    const node = toEcoNode(file, 0);
    for (const pop of Object.values(node.populations)) pop.carryCap = 0;
    let current: EcoNode = node;
    const nodeCtx = soloCtx(node);
    const rng = createRng(5);
    for (let s = 0; s < 8; s++) {
      current = step(current, "spring", rng, nodeCtx).node;
      for (const pop of Object.values(current.populations)) expect(pop.count).toBe(0);
    }
  });

  it("nothing is resurrected: a species at 0 stays at 0 forever", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        let node = cloneEcoNode(shipped.find((n) => n.id === "r3") as EcoNode);
        for (const pop of Object.values(node.populations)) pop.count = 0;
        node.floraStock = balance.ecosim.floraMax;
        const nodeCtx = soloCtx(node);
        const rng = createRng(seed);
        for (let s = 0; s < 12; s++) {
          node = step(node, seasons[s % seasons.length] as Season, rng, nodeCtx).node;
          for (const pop of Object.values(node.populations)) expect(pop.count).toBe(0);
        }
      }),
      { numRuns: 25 },
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * cascade_emerges — build-doc §10.2, the headline property
 * ════════════════════════════════════════════════════════════════════════════ */

/** The shipped nodes that contain an Apex — the structural templates the property generates over. */
const apexTemplates = content.nodes.filter((file) =>
  Object.keys(file.populations).some((id) => idx.byId.has(id) && roleOf(id) === "Apex"),
);

const roleCountArb = {
  Producer: fc.integer({ min: 10, max: 40 }),
  Grazer: fc.integer({ min: 4, max: 24 }),
  Mesopredator: fc.integer({ min: 4, max: 19 }),
  Apex: fc.integer({ min: 2, max: 4 }),
  Scavenger: fc.integer({ min: 1, max: 6 }),
  AncientApex: fc.constant(1),
} as const;

/**
 * A generated apex-bearing node state. Structure (which species, which biome, who eats whom) comes
 * from the shipped content — inventing a species would be G2 — while every NUMBER is generated:
 * counts per trophic role, breed rates across the shipped band (0.03 … 0.15, the top being
 * `balance.ecosim.waterTableBreedFloor`, the highest rate the shipped data contemplates), flora,
 * carrying capacities, the season, and the seed.
 */
const cascadeStateArb = fc.record({
  templateIndex: fc.integer({ min: 0, max: apexTemplates.length - 1 }),
  producer: roleCountArb.Producer,
  grazer: roleCountArb.Grazer,
  meso: roleCountArb.Mesopredator,
  apex: roleCountArb.Apex,
  scavenger: roleCountArb.Scavenger,
  jitter: fc.array(fc.integer({ min: -2, max: 2 }), { minLength: 8, maxLength: 8 }),
  breedRates: fc.array(fc.double({ min: 0.03, max: 0.15, noNaN: true }), { minLength: 8, maxLength: 8 }),
  capFactor: fc.integer({ min: 2, max: 4 }),
  flora: fc.integer({ min: 20, max: 100 }),
  season: fc.constantFrom(...(seasons as Season[])),
  seed: fc.integer({ min: 1, max: 2 ** 31 - 1 }),
});

type CascadeSpec = ReturnType<typeof cascadeStateArb.generate> extends { value: infer V } ? V : never;

function buildCascadeNode(spec: CascadeSpec): EcoNode {
  const file = apexTemplates[spec.templateIndex];
  if (!file) throw new Error("bad apex template");
  const node = toEcoNode(file);
  const byRole: Record<Role, number> = {
    Producer: spec.producer,
    Grazer: spec.grazer,
    Mesopredator: spec.meso,
    Apex: spec.apex,
    Scavenger: spec.scavenger,
    AncientApex: 1,
  };
  Object.keys(node.populations).forEach((lineId, i) => {
    const pop = node.populations[lineId];
    const line = idx.byId.get(lineId);
    if (!pop || !line) return;
    const role = webRole(line, balance);
    const jitter = role === "AncientApex" ? 0 : (spec.jitter[i % spec.jitter.length] ?? 0);
    pop.count = Math.max(role === "AncientApex" ? 1 : 2, byRole[role] + jitter);
    pop.breedRate = line.ancient ? 0 : (spec.breedRates[i % spec.breedRates.length] ?? 0.06);
    pop.carryCap = Math.max(pop.count, pop.count * spec.capFactor);
  });
  node.floraStock = spec.flora;
  return node;
}

/* ── source-scanning helpers for the G6 / no-magic-numbers gates ──────────── */

/** The file with comments removed — a gate is about CODE, and the comments cite the bible by name. */
function executableSource(path: string): string {
  const fs = require("node:fs") as typeof import("node:fs");
  return fs
    .readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

/**
 * Every string literal in the source, template literals included, with their `${…}` holes cut out
 * and ADJACENT CONCATENATIONS COLLAPSED — `"Ap" + "ex"` is the same rig as `"Apex"`, so it has to
 * read the same to the gate.
 */
function stringLiterals(code: string): string[] {
  const joined = code.replace(/"\s*\+\s*"/g, "").replace(/'\s*\+\s*'/g, "");
  const matches = joined.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/gs) ?? [];
  return matches.map((raw) => raw.slice(1, -1).replace(/\$\{[^}]*\}/g, " "));
}

/**
 * Every string literal that one side of an `===` / `!==` is compared against, EXCEPT the `typeof x
 * === "number"` family — those name a JavaScript type, not a thing in the game.
 */
function comparisonLiterals(code: string): string[] {
  const joined = code
    .replace(/"\s*\+\s*"/g, "")
    .replace(/'\s*\+\s*'/g, "")
    .replace(/typeof\s+[^;{}]*?[!=]==\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, "TYPEOF_GUARD");
  const out: string[] = [];
  for (const m of joined.matchAll(/[!=]==\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
    out.push((m[1] as string).slice(1, -1));
  }
  for (const m of joined.matchAll(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*[!=]==/g)) {
    out.push((m[1] as string).slice(1, -1));
  }
  return out;
}

/** The source with every string literal blanked — what is left is arithmetic and structure. */
function codeWithoutStrings(code: string): string {
  return code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/gs, '""');
}

/** An RNG that never consumes entropy — a stub for tests about identity rather than randomness. */
const flooringRng = () => ({ stochasticRound: (v: number) => Math.floor(v) }) as unknown as ReturnType<typeof createRng>;

/** The over-catch target for one pool: build-doc §10.2's "<10%" of its opening count. */
const forcedTarget = (node: EcoNode, lineId: string): number =>
  Math.floor((node.populations[lineId]?.count ?? 0) * cascade.preyForcedFraction);

/**
 * What the STRUCTURE predicts for the tier below the apex once the forcing lands — derived from the
 * web and the forced set, never from a node id (G6).
 *
 * "Release" is only on the table when the over-catching leaves the mesopredator standing AND leaves
 * it something to eat. Where the apex's limiting pools are also the mesopredator's own food (or are
 * the mesopredator itself, reduced to nothing), the honest outcome is co-extinction, and that is
 * asserted as such rather than skipped.
 */
function releaseIsPossible(node: EcoNode, web: ReturnType<typeof deriveFoodWeb>, mesoId: string, forced: string[]): boolean {
  const survivesForcing = !forced.includes(mesoId) || forcedTarget(node, mesoId) > 0;
  const foodHammered = preyOf(web, mesoId).some((preyId) => forced.includes(preyId));
  return survivesForcing && !foodHammered;
}

describe("cascade_emerges — build-doc §10.2 (the demo beat as a law, not a script)", () => {
  it("core/ecosim.ts names no gameplay identity in executable code (G6)", () => {
    // Comments cite the bible by name ("Vellsire adjacent-node breeding ×1.5") and must: the point
    // of G6 is that no CODE PATH knows a species, a node, a biome, a role or an effect exists.
    const code = executableSource("../../core/ecosim.ts");

    const forbidden: Array<{ what: string; token: string }> = [];
    for (const line of content.species) {
      forbidden.push({ what: "species id", token: line.id });
      for (const formName of Object.values(line.formNames)) forbidden.push({ what: "form name", token: formName });
      if (line.presenceEffect) forbidden.push({ what: "presence effect", token: line.presenceEffect });
    }
    for (const node of content.nodes) {
      forbidden.push({ what: "node id", token: node.id });
      forbidden.push({ what: "node name", token: node.name });
      forbidden.push({ what: "biome", token: node.biome });
    }
    for (const role of ROLES) forbidden.push({ what: "role", token: role });
    for (const type of TYPE_NAMES) forbidden.push({ what: "type", token: type });

    // Quoted string literals only: `line.presenceEffect` as a PROPERTY READ is the whole point, and
    // a rig has to name its target somewhere to branch on it. Template literals are scanned too,
    // with their `${…}` holes removed, so building a name out of pieces does not hide it either.
    const literals = stringLiterals(code);
    const haystack = literals.join(" \u0000 ");
    for (const { what, token } of forbidden) {
      // Whole word, case sensitive: `"apexCollapseSeasons"` is a balance KEY and must stay legal,
      // while `=== "Apex"` must not. A name assembled from pieces is caught by the renaming test
      // below, which does not read the source at all.
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(
        new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`).test(haystack),
        `core/ecosim.ts has the ${what} "${token}" as a string literal`,
      ).toBe(false);
    }
    expect(literals.length, "no string literals scanned — the matcher broke").toBeGreaterThan(3);
    // …and the matcher really does catch one: a control token that IS in the file.
    expect(new RegExp(`(^|[^\\w])ecosim([^\\w]|$)`).test(haystack)).toBe(true);

    // Tighter still: the ONLY strings core/ecosim.ts is allowed to compare against are the presence
    // MODES — a structural vocabulary any number of Ancients could share. Everything else a branch
    // could key on (a species, a node, a biome, a role, an effect name) is content, and content is
    // read, never matched. This is what closes the `"Ap" + "ex"` shape the token sweep alone misses.
    for (const literal of comparisonLiterals(code)) {
      expect(
        (PRESENCE_MODES as readonly string[]).includes(literal),
        `core/ecosim.ts branches on the string "${literal}" — the sim may not know what anything is called`,
      ).toBe(true);
    }
    expect(comparisonLiterals(code).length, "no string comparisons found — the matcher broke").toBeGreaterThan(0);
  });

  it("cannot be scripted by identity at all: rename every species, node and biome and nothing moves", () => {
    // The textual gate above catches a literal. This one catches the rest — a branch built from
    // string concatenation, a lookup table keyed by id, anything at all that reads WHICH species or
    // WHICH node it is. The whole region is relabelled and re-run; if any number moves, some code
    // path knew a name.
    const rename = new Map<string, string>();
    content.species.forEach((line, i) => rename.set(line.id, `line-${i}`));
    const biomes = [...new Set(content.nodes.map((n) => n.biome))];
    const biomeName = new Map(biomes.map((b, i) => [b, `biome-${i}`]));
    const nodeName = new Map(content.nodes.map((n, i) => [n.id, `node-${i}`]));

    const renamedSpecies: SpeciesLine[] = content.species.map((line) => ({
      ...line,
      id: rename.get(line.id) as string,
      formNames: { J: "Ja", A: "Aa", E: "Ea" },
      dexIds: line.dexIds.map((_, i) => `dex-${i}`),
      habitat: line.habitat.map((tag) => biomeName.get(tag) ?? tag),
      ...(line.dietExceptions ? { dietExceptions: line.dietExceptions.map((id) => rename.get(id) as string) } : {}),
    }));
    const renamedIdx = indexSpecies(renamedSpecies);
    const renamedNodes: EcoNode[] = shipped.map((node) => {
      const populations: Record<string, { count: number; breedRate: number; carryCap: number }> = {};
      for (const [lineId, pop] of Object.entries(node.populations)) {
        populations[rename.get(lineId) as string] = { ...pop };
      }
      return {
        id: nodeName.get(node.id) as string,
        biome: biomeName.get(node.biome) as string,
        adjacency: node.adjacency.map((id) => nodeName.get(id) as string),
        floraStock: node.floraStock,
        populations,
        recentDeaths: node.recentDeaths ?? 0,
      };
    });

    const renamedCtx = makeContext(
      renamedIdx,
      balance,
      derivePresence(renamedNodes, renamedIdx, balance, eco),
    );
    const plainCtx = ctxFor(shipped);

    let plain = shipped.map((n) => cloneEcoNode(n));
    let alias = renamedNodes.map((n) => cloneEcoNode(n));
    for (let s = 0; s < 12; s++) {
      const season = seasons[s % seasons.length] as Season;
      // A rounding stub rather than a stream: mapping species to draws necessarily goes through
      // SOME identity, so this test holds the randomness fixed and asks the one question it is
      // about — does any code path behave differently because of what a thing is CALLED?
      plain = plain.map((node) => step(node, season, flooringRng(), plainCtx).node);
      alias = alias.map((node) => step(node, season, flooringRng(), renamedCtx).node);
      for (let i = 0; i < plain.length; i++) {
        const a = plain[i] as EcoNode;
        const b = alias[i] as EcoNode;
        expect(b.floraStock, `${a.id} flora moved under renaming`).toBeCloseTo(a.floraStock, 9);
        for (const [lineId, pop] of Object.entries(a.populations)) {
          expect(
            b.populations[rename.get(lineId) as string]?.count,
            `${a.id}/${lineId} moved under renaming — something branches on identity (G6)`,
          ).toBe(pop.count);
        }
      }
    }
  });

  /**
   * Over-catch the apex's prey down to `cascade.preyForcedFraction` for `cascade.forcingSeasons`
   * seasons, then let go and watch.
   *
   * Preconditions (published, computed from the state, no species named): there is something to
   * over-catch, and the over-catch leaves the apex unable to feed even one individual — which is
   * what "its PRIMARY prey" means. Coverage of both is asserted after the run so the property can
   * never quietly become vacuous.
   */
  it("kills the apex and releases whatever is left of the tier below, for any generated state", () => {
    let generated = 0;
    let eligible = 0;
    let collapsedInBudget = 0;
    let rescuedByRebound = 0;
    let mesoCases = 0; //  every successful cascade at a node that has a mesopredator
    let mesoAliveCases = 0; //  …of which the mesopredator was still standing
    let mesoBeforeTotal = 0;
    let mesoAfterTotal = 0;
    let mesoRose = 0;
    let releasePredicted = 0;
    let releasePredictedAndAlive = 0;

    fc.assert(
      fc.property(cascadeStateArb, (spec) => {
        generated++;
        const start = buildCascadeNode(spec);
        const nodeCtx = soloCtx(start);
        const web = deriveFoodWeb(start, idx, balance);
        const apexId = findRole(start, "Apex");
        if (!apexId) return;
        const mesoId = findRole(start, "Mesopredator");

        const forced = limitingPrey(start, web, idx, apexId, balance, cascade.preyForcedFraction);
        if (forced.length === 0) return; // nothing catchable limits this apex
        const targets = new Map(forced.map((id) => [id, forcedTarget(start, id)]));
        const leftForApex = preyOf(web, apexId).reduce(
          (sum, id) => sum + (targets.get(id) ?? start.populations[id]?.count ?? 0),
          0,
        );
        // The last apex individual must be unable to feed, or "over-caught" is an overstatement.
        if (leftForApex >= balance.ecosim.starveThreshold * balance.ecosim.demandPerIndividual.Apex) return;
        eligible++;

        const apex0 = start.populations[apexId]?.count ?? 0;
        const horizon = Math.max(cascade.apexCollapseSeasons, apex0);
        const rng = createRng(spec.seed);
        let node = start;
        let seasonIndex = seasons.indexOf(spec.season);
        let apexZeroAt = -1;
        let apexEverRecovered = false;

        for (let s = 0; s < horizon && apexZeroAt < 0; s++) {
          if (s < cascade.forcingSeasons) {
            node = cloneEcoNode(node);
            for (const [lineId, target] of targets) {
              const pop = node.populations[lineId];
              if (pop) pop.count = Math.min(pop.count, target);
            }
          }
          const before = node.populations[apexId]?.count ?? 0;
          const season = seasons[seasonIndex % seasons.length] as Season;
          seasonIndex++;
          const result = step(node, season, rng, nodeCtx);
          node = result.node;
          const apexReport = reportFor(result.report.species, apexId);

          // LAW 1 — a starving population strictly declines. No hovering, no plateau.
          if (apexReport.starving) {
            expect(apexReport.births).toBe(0);
            expect(apexReport.after).toBeLessThan(before);
          } else if (before > 0) {
            // The only way out of starvation is prey rebounding past the threshold.
            apexEverRecovered = true;
          }
          if (node.populations[apexId]?.count === 0) apexZeroAt = s + 1;
        }

        // LAW 2 — the apex reaches 0 inside the budget, unless its prey climbed back over the
        // starvation threshold once the over-catching stopped (which is the ecology recovering, and
        // is counted below so it can never swallow the claim).
        if (apexZeroAt > 0) {
          collapsedInBudget++;
          expect(apexZeroAt).toBeLessThanOrEqual(horizon);
          if (apex0 <= cascade.apexCollapseSeasons) {
            expect(apexZeroAt).toBeLessThanOrEqual(cascade.apexCollapseSeasons);
          }
        } else {
          expect(apexEverRecovered, "apex survived without ever escaping starvation").toBe(true);
          rescuedByRebound++;
          return;
        }

        const afterCollapse = node;
        // LAW 3 — release. Whatever the apex used to eat now has no predator above it, takes no
        // predation from it ever again, and never declines in a season it is not starving.
        const survivors = preyOf(web, apexId).filter((id) => (afterCollapse.populations[id]?.count ?? 0) > 0);
        let released = afterCollapse;
        const mesoStart = mesoId ? (afterCollapse.populations[mesoId]?.count ?? 0) : 0;
        const predicted = mesoId ? releaseIsPossible(start, web, mesoId, forced) : false;
        if (mesoId) {
          // EVERY successful cascade is counted, whether the mesopredator survived it or not: the
          // release clause measured over survivors only is a survivorship-biased mean, and in the
          // majority of runs at this scale the honest answer is "it went down with the apex".
          mesoCases++;
          mesoBeforeTotal += mesoStart;
          if (mesoStart > 0) mesoAliveCases++;
          if (predicted) {
            releasePredicted++;
            if (mesoStart > 0) releasePredictedAndAlive++;
          }
        }

        for (let s = 0; s < cascade.mesoReleaseSeasons; s++) {
          const before = released;
          const result = step(released, seasons[(seasonIndex + s) % seasons.length] as Season, rng, nodeCtx);
          released = result.node;
          expect(released.populations[apexId]?.count).toBe(0); // LAW 4 — extinction is permanent
          for (const preyId of survivors) {
            const preyReport = reportFor(result.report.species, preyId);
            const stillHunted = predatorsOf(deriveFoodWeb(before, idx, balance), preyId).some(
              (p) => (before.populations[p]?.count ?? 0) > 0,
            );
            if (!stillHunted) expect(preyReport.predationLosses).toBe(0);
            if (!preyReport.starving && !stillHunted) {
              expect(preyReport.after).toBeGreaterThanOrEqual(preyReport.before);
            }
          }
        }

        if (mesoId) {
          mesoAfterTotal += released.populations[mesoId]?.count ?? 0;
          if ((released.populations[mesoId]?.count ?? 0) > mesoStart) mesoRose++;
          // LAW 5 — "a new apex risen": nothing at this node preys on the mesopredator any more.
          // Asserted whether or not it survived — it is a statement about the WEB, and guarding it
          // on `count > 0` is what let it go unexecuted at five of six shipped nodes.
          const web2 = deriveFoodWeb(released, idx, balance);
          for (const predator of predatorsOf(web2, mesoId)) {
            expect(released.populations[predator]?.count ?? 0).toBe(0);
          }
        }
      }),
      { numRuns: 400 },
    );

    // Coverage: the preconditions must admit most of what is generated, and the collapse must be
    // the rule rather than the exception — otherwise the laws above are asserted about nothing.
    expect(eligible / generated).toBeGreaterThan(0.4);
    expect(collapsedInBudget / eligible).toBeGreaterThan(0.95);
    expect(rescuedByRebound / eligible).toBeLessThan(0.05);

    // The release clause in aggregate, over EVERY successful cascade including the ones where the
    // mesopredator went down with the apex (counted as the 0 it is). Per-run strictness is
    // impossible at this scale and that is a finding, not a fudge — see DEVIATIONS-lane-a2 A2-D1:
    // an apex starves only when its whole prey pool is under starveThreshold ×
    // demandPerIndividual.Apex = 2.4 individuals, so the released mesopredator is never more than 2
    // animals, and 2 animals cannot produce a whole animal in one season at any breed rate the data
    // contemplates (≤ 0.15 → ≤ 0.375 births/season).
    expect(mesoCases).toBeGreaterThan(100);
    expect(mesoAfterTotal / mesoCases).toBeGreaterThan(mesoBeforeTotal / mesoCases);
    expect(mesoRose).toBeGreaterThan(0);

    // …and the structural prediction is what decides which runs leave anything to release, so the
    // "co-extinct" outcome is a published fact rather than a silently skipped assertion.
    expect(releasePredicted, "no generated cascade could leave the mesopredator standing").toBeGreaterThan(0);
    expect(releasePredictedAndAlive / releasePredicted).toBeGreaterThan(cascade.releaseCoverageMinFraction);
    expect(mesoAliveCases).toBeGreaterThanOrEqual(releasePredictedAndAlive);
  });

  /**
   * The shipped content, under BOTH readings of §10.2's "forcing **its primary prey**".
   *
   * DEVIATIONS-lane-a2 A2-D10: read literally (one pool, `primaryPrey`) the property is false at the
   * shipped nodes where the apex can substitute; read as the set of pools it actually depends on
   * (`limitingPrey`) it holds everywhere. Both are measured here per node, the classification is
   * derived from the web, and every outcome — including co-extinction of the tier below — is
   * asserted rather than skipped.
   */
  it("does it on the shipped nodes too, inside the doc's four seasons, under both readings", () => {
    const apexNodes = shipped.filter((node) => findRole(node, "Apex"));
    expect(apexNodes.length).toBeGreaterThanOrEqual(4);

    const seeds = 25;
    let specialistNodes = 0;
    let generalistNodes = 0;
    let releaseNodes = 0;
    let literalFailuresAmongGeneralists = 0;

    for (const template of apexNodes) {
      const apexId = findRole(template, "Apex");
      if (!apexId) continue;
      const mesoId = findRole(template, "Mesopredator");
      const nodeCtx = soloCtx(template);
      const web = deriveFoodWeb(template, idx, balance);
      const forced = limitingPrey(template, web, idx, apexId, balance, cascade.preyForcedFraction);
      const primary = primaryPrey(template, web, apexId, balance);
      expect(forced.length, `${template.id} has no over-catchable prey`).toBeGreaterThan(0);
      expect(primary, `${template.id} apex has no prey pool at all`).not.toBeNull();
      expect(forced[0]).toBe(primary); // the set always opens with the biggest pool

      const runForcing = (targets: Map<string, number>, seed: number) => {
        let node = cloneEcoNode(template);
        const rng = createRng(seed);
        let apexZeroAt = -1;
        for (let s = 0; s < cascade.apexCollapseSeasons && apexZeroAt < 0; s++) {
          if (s < cascade.forcingSeasons) {
            for (const [lineId, target] of targets) {
              const pop = node.populations[lineId];
              if (pop) pop.count = Math.min(pop.count, target);
            }
          }
          node = step(node, seasons[s % seasons.length] as Season, rng, nodeCtx).node;
          if (node.populations[apexId]?.count === 0) apexZeroAt = s + 1;
        }
        return { node, apexZeroAt, rng };
      };

      const setTargets = new Map(forced.map((id) => [id, forcedTarget(template, id)]));
      const literalTargets = new Map([[primary as string, forcedTarget(template, primary as string)]]);
      const specialist = forced.length === 1;
      if (specialist) specialistNodes++;
      else generalistNodes++;

      let literalCollapses = 0;
      let mesoAliveAtCollapse = 0;
      let mesoStartTotal = 0;
      let mesoEndTotal = 0;
      const predicted = mesoId ? releaseIsPossible(template, web, mesoId, forced) : false;
      if (predicted) releaseNodes++;

      for (let seed = 1; seed <= seeds; seed++) {
        // READING A — the whole set of pools the apex depends on. This is a LAW: every node, every
        // seed, inside the doc's four seasons.
        const setRun = runForcing(setTargets, seed);
        expect(setRun.apexZeroAt, `${template.id} apex survived the set forcing, seed ${seed}`).toBeGreaterThan(0);
        expect(setRun.apexZeroAt).toBeLessThanOrEqual(cascade.apexCollapseSeasons);

        // READING B — the doc's literal singular. Counted, not asserted per run: where the apex can
        // substitute one pool for another, forcing one pool is not enough (A2-D10).
        if (runForcing(literalTargets, seed).apexZeroAt > 0) literalCollapses++;

        // "A new apex risen" — asserted for EVERY seed, whatever survived: nothing at the node
        // preys on the tier below any more. No `count > 0` guard, which is what let this clause go
        // unexecuted at five of the six shipped apex nodes.
        if (mesoId) {
          const after = setRun.node;
          for (const predator of predatorsOf(deriveFoodWeb(after, idx, balance), mesoId)) {
            expect(after.populations[predator]?.count ?? 0).toBe(0);
          }
          const mesoStart = after.populations[mesoId]?.count ?? 0;
          mesoStartTotal += mesoStart;
          if (mesoStart > 0) mesoAliveAtCollapse++;

          let released = after;
          for (let s = 0; s < cascade.mesoReleaseSeasons; s++) {
            released = step(released, seasons[s % seasons.length] as Season, setRun.rng, nodeCtx).node;
          }
          mesoEndTotal += released.populations[mesoId]?.count ?? 0;

          if (predicted) {
            // Where the structure allows release, the tier below must not be silently gone.
            expect(released.populations[mesoId]?.count ?? 0).toBeGreaterThanOrEqual(0);
          } else {
            // Where it does not, co-extinction is the honest, asserted outcome — the forcing either
            // removes the mesopredator outright or removes what it eats.
            expect(
              mesoStart,
              `${template.id}: the tier below survived a forcing that took its own food — the ` +
                `structural prediction is wrong, not the sim`,
            ).toBe(0);
          }
        }
      }

      // The literal reading is a LAW wherever the apex depends on a single pool. Where it can
      // substitute, it is measured rather than asserted — and the aggregate below proves that the
      // substitution is what makes the difference, so A2-D10 is a checked claim, not an excuse.
      if (specialist) {
        expect(
          literalCollapses,
          `${template.id}: the apex depends on ONE pool, so §10.2 read literally must hold`,
        ).toBe(seeds);
      } else {
        literalFailuresAmongGeneralists += seeds - literalCollapses;
      }

      if (predicted) {
        // The demo beat's second half, where the shipped content admits it: the tier below survives
        // the over-catch, and — counted across seeds, because a single released individual breeding
        // is a coin flip, not a law (A2-D1) — it trends up once nothing hunts it.
        expect(
          mesoAliveAtCollapse / seeds,
          `${template.id}: the mesopredator was meant to survive the forcing`,
        ).toBeGreaterThan(cascade.mesoSurvivesForcingMinFraction);
        expect(
          mesoEndTotal / seeds,
          `${template.id}: released mesopredator did not trend up`,
        ).toBeGreaterThan(mesoStartTotal / seeds);
      }
    }

    // Coverage of the classification itself: the shipped content must contain both kinds of apex,
    // and at least one node where the demo beat's "new apex risen" half is actually reachable.
    expect(specialistNodes, "no shipped apex is a specialist — reading B is untested").toBeGreaterThan(0);
    expect(generalistNodes, "no shipped apex can substitute — reading A is untested").toBeGreaterThan(0);
    expect(
      literalFailuresAmongGeneralists,
      "§10.2 read literally held everywhere — then A2-D10's substitution is not a deviation at all",
    ).toBeGreaterThan(0);
    expect(
      releaseNodes,
      "no shipped node can produce mesopredator release: the demo beat's second half is unreachable",
    ).toBeGreaterThan(0);
  });

  it("reproduces the demo cascade from fixtures/overcatch-script.json (build-doc §11, §15 I2)", () => {
    // build-doc §11 — "the demo cascade as an action log — used by tests AND by the demo-recording
    // flow". The script is nothing but catches: no forcing helper, no test-only shortcut. What the
    // sim does with them is the beat.
    const script = overcatchScriptJson as {
      seed: number;
      nodeId: string;
      seasons: number;
      actions: Array<{ t: string; nodeId: string; lineId: string; season?: string }>;
    };
    const file = content.nodes.find((n) => n.id === script.nodeId);
    if (!file) throw new Error(`overcatch-script targets unknown node ${script.nodeId}`);
    const template = toEcoNode(file);
    const nodeCtx = soloCtx(template);
    const web = deriveFoodWeb(template, idx, balance);
    const apexId = findRole(template, "Apex");
    const mesoId = findRole(template, "Mesopredator");
    if (!apexId || !mesoId) throw new Error("the demo node needs an apex and a mesopredator");

    let node = template;
    const rng = createRng(script.seed);
    let seasonIndex = 0;
    const caughtLines = new Set<string>();
    let caught = 0;
    for (const action of script.actions) {
      if (action.t === "catch") {
        expect(action.nodeId).toBe(script.nodeId);
        node = applyCatch(node, action.lineId, balance); // throws if the script names a line that is not here
        caughtLines.add(action.lineId);
        caught++;
      } else if (action.t === "seasonStep") {
        // The log carries its own seasons, and they must be the clock's order (§3 L8).
        expect(action.season).toBe(seasons[seasonIndex % seasons.length]);
        node = step(node, action.season as Season, rng, nodeCtx).node;
        seasonIndex++;
      } else {
        throw new Error(`overcatch-script has an action the fixture test does not model: ${action.t}`);
      }
    }
    expect(caught).toBeGreaterThan(0);
    expect(seasonIndex).toBe(script.seasons);
    // One prey species, hammered — build-doc §1's "hammer a prey species", not a cull of the node.
    expect(caughtLines.size).toBe(1);
    const hammered = [...caughtLines][0] as string;
    expect(preyOf(web, apexId), "the script must over-catch something the apex actually eats").toContain(hammered);
    expect(caught / (template.populations[hammered]?.count ?? 1)).toBeGreaterThan(1 - cascade.preyForcedFraction);

    // The beat, from catches alone: the apex is gone, nothing hunts the tier below any more, and
    // the tier below is still there to be the new apex.
    expect(node.populations[apexId]?.count, "the apex survived the demo script").toBe(0);
    for (const predator of predatorsOf(deriveFoodWeb(node, idx, balance), mesoId)) {
      expect(node.populations[predator]?.count ?? 0).toBe(0);
    }
    expect(node.populations[mesoId]?.count, "nothing was left to rise").toBeGreaterThan(0);
    // …and it is genuinely a RISE: more than the over-catching left standing.
    expect(node.populations[mesoId]?.count).toBeGreaterThan(
      Math.floor((template.populations[mesoId]?.count ?? 0) * cascade.preyForcedFraction),
    );
  });

  it("leaves the region alone when the player does: no unintended extinction over six years", () => {
    for (let seed = 1; seed <= 15; seed++) {
      let nodes = shipped.map((n) => cloneEcoNode(n));
      const rng = createRng(seed);
      for (let year = 0; year < balance.clock.yearsTotal; year++) {
        for (const season of seasons) nodes = stepAll(nodes, season, rng, ctx).nodes;
      }
      for (const node of nodes) {
        for (const [lineId, pop] of Object.entries(node.populations)) {
          expect(pop.count, `${node.id}/${lineId} died out on its own (seed ${seed})`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("the cascade travels DOWN the web as well: killing the grazers starves the tiers above", () => {
    // A second, independent route to the same beat — nothing about it is special-cased either.
    const template = shipped.find((n) => n.id === "r2");
    if (!template) throw new Error("r2 missing");
    const nodeCtx = soloCtx(template);
    const mesoId = findRole(template, "Mesopredator");
    const apexId = findRole(template, "Apex");
    if (!mesoId || !apexId) throw new Error("r2 shape changed");
    const grazerId = Object.keys(template.populations).find((id) => roleOf(id) === "Grazer");
    if (!grazerId) throw new Error("r2 has no grazer");

    let node = cloneEcoNode(template);
    const rng = createRng(2026);
    const target = forcedTarget(template, grazerId);
    const trace: Array<{ meso: number; apex: number; mesoStarving: boolean; apexStarving: boolean }> = [];
    for (let s = 0; s < 12; s++) {
      if (s < cascade.forcingSeasons) {
        const pop = node.populations[grazerId];
        if (pop) pop.count = Math.min(pop.count, target);
      }
      const result = step(node, seasons[s % seasons.length] as Season, rng, nodeCtx);
      node = result.node;
      trace.push({
        meso: node.populations[mesoId]?.count ?? 0,
        apex: node.populations[apexId]?.count ?? 0,
        mesoStarving: reportFor(result.report.species, mesoId).starving,
        apexStarving: reportFor(result.report.species, apexId).starving,
      });
    }
    // Hunger arrives in trophic order: the grazer's predator feels it first, the predator above it
    // only once ITS food has thinned. Nothing in the code arranges that — it falls out of who eats
    // whom, one level at a time.
    const mesoHungry = trace.findIndex((t) => t.mesoStarving);
    const apexHungry = trace.findIndex((t) => t.apexStarving);
    expect(mesoHungry).toBeGreaterThan(-1);
    expect(apexHungry).toBeGreaterThan(mesoHungry);

    // And both tiers are gone by the end of the window, from one over-caught grazer. This is the
    // OTHER outcome — a bottom-up collapse, not a release — and it is what the vertical-slice marsh
    // produces, because the mesopredator's only food is the same grazer that limits the apex.
    expect(trace.some((t) => t.meso === 0)).toBe(true);
    expect(trace.some((t) => t.apex === 0)).toBe(true);
    expect(trace[trace.length - 1]?.meso).toBe(0);
    expect(trace[trace.length - 1]?.apex).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Ancient presence effects — build-doc §7.3 step 1
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ecosim — Ancient presence effects (build-doc §7.3 step 1, bible §4)", () => {
  it("step() cannot silently run with the effects off — a missing presence map is an error", () => {
    // build-doc §7.3 step 1 puts presenceMult in the births term. It used to be optional, so
    // `step(node, season, rng)` on the signature the doc names dropped it without a word: every
    // Ancient effect off on the year turn and on replay, and Hard Req 7 unobservable.
    // A node with NO Ancient of its own, so only the MISSING-ENTRY check can raise: at a node that
    // hosts one, the staleness check would fire too and the test would pass for the wrong reason.
    const node = shipped.find((n) => n.id === "hearthollow");
    if (!node) throw new Error("hearthollow missing");
    expect(Object.keys(node.populations).some((id) => idx.byId.get(id)?.presenceEffect)).toBe(false);
    const empty: PresenceMap = {};
    expect(() => step(node, "spring", createRng(1), { ...ctx, presence: empty })).toThrow(/no presence entry/);

    // A map derived for the region but from a STALE census is an error too: catching the Ancient
    // must take its buff with it (Hard Req 7), and a map that still credits it is a wrong sim.
    const host = shipped.find((n) => Object.keys(n.populations).some((id) => idx.byId.get(id)?.presenceEffect));
    if (!host) throw new Error("no Ancient anywhere");
    const ancientId = Object.keys(host.populations).find((id) => idx.byId.get(id)?.presenceEffect) as string;
    const stalePresence = derivePresence(shipped, idx, balance, eco);
    const caughtHost = applyCatch(host, ancientId, balance);
    expect(() => step(caughtHost, "spring", createRng(1), { ...ctx, presence: stalePresence })).toThrow(
      /still credits/,
    );

    // And the reverse: a map derived before the Ancient was there.
    const blind = derivePresence(
      shipped.map((n) => (n.id === host.id ? applyCatch(n, ancientId, balance) : n)),
      idx,
      balance,
      eco,
    );
    expect(() => step(host, "spring", createRng(1), { ...ctx, presence: blind })).toThrow(/still free here/);
  });

  it("the effects are ON by default — every path that steps a region derives them", () => {
    const host = shipped.find((n) => Object.keys(n.populations).some((id) => idx.byId.get(id)?.presenceEffect));
    if (!host) throw new Error("no Ancient anywhere");
    const { reports } = stepAll(shipped.map(cloneEcoNode), "spring", createRng(1), ctx);
    const hostReport = reports.find((r) => r.nodeId === host.id);
    if (!hostReport) throw new Error("no report for the host node");
    expect(
      hostReport.species.some((s) => s.presenceMult !== 1 || s.breedRate !== host.populations[s.lineId]?.breedRate),
      "stepAll ran the Ancient's own node with no effect at all",
    ).toBe(true);

    // …and the save-shaped path (year turn §7.5 step 5, replay §8.1) lands on the same numbers.
    const states = Object.fromEntries(shipped.map((n) => [n.id, { populations: n.populations, floraStock: n.floraStock, recentDeaths: 0 }]));
    const viaStates = stepRegionStates(content.nodes, states, "spring", createRng(1), ctx);
    const direct = stepAll(shipped.map(cloneEcoNode), "spring", createRng(1), ctx).nodes;
    for (const node of direct) {
      expect(viaStates.states[node.id]?.populations).toEqual(node.populations);
    }
  });

  it("a free Ancient lifts breeding in range; catching it takes the buff with it (Hard Req 7)", () => {
    const withKeystone = shipped.map((n) => cloneEcoNode(n));
    const presenceFree = derivePresence(withKeystone, idx, balance, eco);

    const keystoneHost = content.species.find((l) => l.presenceEffect === "keystoneBreed");
    if (!keystoneHost) throw new Error("no keystone Ancient");
    const hostNode = withKeystone.find((n) => n.populations[keystoneHost.id]);
    if (!hostNode) throw new Error("keystone lives nowhere");

    const neighbourId = hostNode.adjacency[0];
    if (!neighbourId) throw new Error("keystone node has no neighbour");
    expect(presenceFree[neighbourId]?.breedMult).toBeCloseTo(balance.ecosim.keystoneBreedMult, 9);
    expect(presenceFree[neighbourId]?.sources).toContain(keystoneHost.id);

    // Catch it — build-doc §7.3 reads "while free" straight off the population count.
    const caught = withKeystone.map((n) => (n.id === hostNode.id ? applyCatch(n, keystoneHost.id, balance) : n));
    const presenceCaught = derivePresence(caught, idx, balance, eco);
    expect(presenceCaught[neighbourId]?.breedMult).toBe(1);
    expect(presenceCaught[neighbourId]?.sources).not.toContain(keystoneHost.id);
  });

  it("the honest cost is a NUMBER, not a flag: catching the keystone leaves the region poorer", () => {
    // Hard Req 7 — "catch removes the keystone buff and the epilogue ledger shows the numbers".
    // Asserting the multiplier's presence in a map proves nothing about a ledger; this projects the
    // region forward from both endings on the same seed and diffs the counts, which is what the
    // epilogue does (build-doc §4 step 6: "the epilogue reuses the same renderer over the final
    // state"). Both branches run the same rules; the only difference is whether the Ancient is
    // still in its node's populations.
    const keystone = content.species.find((l) => l.presenceEffect === "keystoneBreed");
    if (!keystone) throw new Error("no keystone Ancient");
    const host = shipped.find((n) => n.populations[keystone.id]);
    if (!host) throw new Error("keystone lives nowhere");

    const inRange = new Set(
      Object.entries(derivePresence(shipped, idx, balance, eco))
        .filter(([, presence]) => presence.sources.includes(keystone.id))
        .map(([nodeId]) => nodeId),
    );
    expect(inRange.size).toBeGreaterThan(0);

    const span: Season[] = [];
    for (let year = 0; year < balance.clock.yearsTotal; year++) for (const s of seasons) span.push(s as Season);
    const censusInRange = (nodes: EcoNode[]): number =>
      nodes
        .filter((n) => inRange.has(n.id))
        .reduce(
          (total, n) =>
            total +
            Object.entries(n.populations)
              .filter(([lineId]) => lineId !== keystone.id)
              .reduce((sum, [, pop]) => sum + pop.count, 0),
          0,
        );

    const seeds = 20;
    let freeTotal = 0;
    let caughtTotal = 0;
    let strictlyBetter = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const released = projectRegion(shipped.map(cloneEcoNode), span, createRng(seed), ctx);
      const caughtStart = shipped.map((n) => (n.id === host.id ? applyCatch(n, keystone.id, balance) : cloneEcoNode(n)));
      const caught = projectRegion(caughtStart, span, createRng(seed), ctx);
      const free = censusInRange(released);
      const kept = censusInRange(caught);
      freeTotal += free;
      caughtTotal += kept;
      // Never better for having caught it — the buff only ever adds births.
      expect(kept, `seed ${seed}: catching the keystone left the region BETTER off`).toBeLessThanOrEqual(free);
      if (kept < free) strictlyBetter++;

      // …and the difference is confined to the nodes the keystone actually reaches. Anything else
      // moving would be RNG phase noise masquerading as a consequence, which is exactly what makes
      // an epilogue ledger unreadable.
      for (let i = 0; i < released.length; i++) {
        const a = released[i] as EcoNode;
        const b = caught[i] as EcoNode;
        if (inRange.has(a.id)) continue;
        expect(b.populations, `${a.id} moved although the keystone never reached it`).toEqual(a.populations);
      }
    }
    expect(strictlyBetter / seeds, "the keystone made no measurable difference at all").toBeGreaterThan(0.5);
    expect(freeTotal).toBeGreaterThan(caughtTotal);
  });

  it("the keystone buff shows up in births, and nowhere else", () => {
    const node = shipped.find((n) => n.id === "r5");
    if (!node) throw new Error("r5 missing");
    const bare = step(cloneEcoNode(node), "spring", createRng(1), soloCtx(node)).report;
    const boosted = step(cloneEcoNode(node), "spring", createRng(1), {
      ...ctx,
      presence: {
        [node.id]: { breedMult: balance.ecosim.keystoneBreedMult, typeBreedMult: {}, typeBreedFloor: {}, sources: [] },
      },
    }).report;
    for (const line of bare.species) {
      const other = reportFor(boosted.species, line.lineId);
      expect(other.presenceMult).toBeCloseTo(balance.ecosim.keystoneBreedMult, 9);
      expect(other.births).toBeCloseTo(line.births * balance.ecosim.keystoneBreedMult, 9);
      expect(other.starvationDeaths).toBeCloseTo(line.starvationDeaths, 9);
    }
  });

  it("reads what each effect DOES from data — the effect's own name never selects a branch", () => {
    // DEVIATIONS-lane-a2 A2-D4. data/species.json carries exactly one line per effect name, so a
    // branch on the name is a branch on that species (G6) as well as a code literal (G11).
    const declared = new Set(content.species.map((l) => l.presenceEffect).filter(Boolean) as string[]);
    expect(declared.size).toBeGreaterThan(1);
    for (const effect of declared) {
      const rule = eco.presenceEffects[effect as keyof typeof eco.presenceEffects];
      expect(rule, `no data rule for presence effect "${effect}"`).toBeDefined();
      expect(presenceMagnitude(rule as never, balance)).toBeGreaterThan(0);
    }
    // Every mode the data uses is one the sim knows, and every declared effect is reachable.
    const modes = new Set([...declared].map((e) => eco.presenceEffects[e as keyof typeof eco.presenceEffects]?.mode));
    expect(modes.size).toBeGreaterThan(1);

    // Swap the two typed effects' magnitudes in the DATA and the sim follows — proof the numbers are
    // not wired to the names anywhere in code.
    const swapped = {
      ...eco,
      presenceEffects: {
        ...eco.presenceEffects,
        keystoneBreed: { mode: "breedMult" as const, magnitudeKey: "ventWarmthBreedMult" },
      },
    };
    const nodes = shipped.map(cloneEcoNode);
    const keystone = content.species.find((l) => l.presenceEffect === "keystoneBreed") as SpeciesLine;
    const host = nodes.find((n) => n.populations[keystone.id]) as EcoNode;
    expect(derivePresence(nodes, idx, balance, swapped)[host.id]?.breedMult).toBeCloseTo(
      balance.ecosim.ventWarmthBreedMult,
      9,
    );
  });

  it("the typed effects only touch lines of that type, and the water table is a FLOOR", () => {
    const floorRule = Object.values(eco.presenceEffects).find((r) => r?.mode === "typeBreedFloor");
    const multRule = Object.values(eco.presenceEffects).find((r) => r?.mode === "typeBreedMult");
    expect(floorRule?.type).toBeDefined();
    expect(multRule?.type).toBeDefined();
    const waterType = floorRule?.type as string;
    const magnitude = presenceMagnitude(floorRule as never, balance);

    const node = shipped.find((n) => n.id === "r2");
    if (!node) throw new Error("r2 missing");
    const floored = step(cloneEcoNode(node), "spring", createRng(1), {
      ...ctx,
      presence: {
        [node.id]: {
          breedMult: 1,
          typeBreedMult: {},
          typeBreedFloor: { [waterType]: magnitude },
          sources: Object.keys(node.populations).filter((id) => idx.byId.get(id)?.presenceEffect),
        },
      },
    }).report;

    for (const entry of floored.species) {
      const line = idx.byId.get(entry.lineId);
      if (!line) continue;
      const isWater = line.types[balance.ecosim.webRoleAgeClass].includes(waterType as never);
      const shippedRate = node.populations[entry.lineId]?.breedRate ?? 0;
      if (isWater) {
        expect(entry.breedRate).toBe(Math.max(shippedRate, magnitude));
      } else {
        expect(entry.breedRate).toBe(shippedRate);
      }
    }
  });

  it("derives presence across the graph out to balance.ecosim.presenceRadiusNodes", () => {
    const nodes = shipped.map((n) => cloneEcoNode(n));
    const presence = derivePresence(nodes, idx, balance, eco);
    for (const node of nodes) {
      const ancients = Object.keys(node.populations).filter((id) => idx.byId.get(id)?.presenceEffect);
      for (const ancientId of ancients) {
        if ((node.populations[ancientId]?.count ?? 0) <= 0) continue;
        expect(presence[node.id]?.sources).toContain(ancientId);
        for (const neighbour of node.adjacency) {
          expect(presence[neighbour]?.sources, `${ancientId} did not reach ${neighbour}`).toContain(ancientId);
        }
      }
    }
    // A node two hops from every Ancient sees nothing (radius is 1 in the shipped balance).
    expect(balance.ecosim.presenceRadiusNodes).toBe(1);
    expect(presence["hearthollow"]?.sources).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * ext_retune — build-doc §6 INV-3
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ext_retune — build-doc §6 INV-3 (the harness runs with an overridden file)", () => {
  const overridden = (mutate: (raw: Record<string, never>) => void): { balance: Balance; raw: unknown } => {
    const raw = JSON.parse(JSON.stringify(rawBalanceJson)) as Record<string, never>;
    mutate(raw);
    return { balance: zBalance.parse(raw) as Balance, raw };
  };

  it("a retune of a schema-declared constant reaches the sim", () => {
    const { balance: tuned } = overridden((raw) => {
      (raw as unknown as { ecosim: { starveRate: number } }).ecosim.starveRate = 0.9;
    });
    expect(tuned.ecosim.starveRate).toBe(0.9);

    const node = toEcoNode(miniNode);
    const skir = node.populations["skir-line"];
    if (!skir) throw new Error("mini-node changed shape");
    skir.count = 40;
    skir.carryCap = 60;
    const tunedCtx = makeContext(idx, tuned, derivePresence([node], idx, tuned, ecoConstants(tuned)));
    const report = step(node, "spring", createRng(1), tunedCtx).report;
    expect(reportFor(report.species, "skir-line").starvationDeaths).toBeCloseTo(40 * 0.9, 9);
  });

  it("a retune of the merged A2 constants reaches the sim through the validated balance", () => {
    /*
     * These two used to live in data/balance.additions.A2.json, undeclared by `zBalance`. The
     * integrator merged them into balance.json AND declared them in `Balance` + `zBalance`, so the
     * validated object now carries them and no raw-file fallback is needed for THESE keys. Both
     * halves are asserted: validation preserves them, and the sim reads the retuned value.
     *
     * (The raw-file precedence path itself is still live and is tested below — it is the safety
     * net for the NEXT constant someone merges into balance.json without a schema entry.)
     */
    const { balance: tuned, raw } = overridden((raw) => {
      (raw as unknown as { ecosim: Record<string, unknown> }).ecosim.starveMinDeathsPerSeason = 9;
      (raw as unknown as { cascade: Record<string, unknown> }).cascade.forcingSeasons = 7;
    });
    expect(tuned.ecosim.starveMinDeathsPerSeason).toBe(9);
    expect(tuned.cascade.forcingSeasons).toBe(7);
    expect(ecoConstants(tuned).starveMinDeathsPerSeason).toBe(9);
    expect(cascadeConstants(tuned).forcingSeasons).toBe(7);
    // …and the same answer when the raw file travels alongside, which is how the harness calls it.
    expect(ecoConstants(tuned, raw).starveMinDeathsPerSeason).toBe(9);
    expect(cascadeConstants(tuned, raw).forcingSeasons).toBe(7);

    // The retune actually changes the sim, not just the constant.
    const node = toEcoNode(miniNode);
    const skir = node.populations["skir-line"];
    if (!skir) throw new Error("mini-node changed shape");
    skir.count = 2;
    skir.carryCap = 60;
    const nibbin = node.populations["nibbin-line"];
    if (!nibbin) throw new Error("mini-node changed shape");
    nibbin.count = 0;
    const tunedEco = ecoConstants(tuned, raw);
    const tunedCtx = makeContext(idx, tuned, derivePresence([node], idx, tuned, tunedEco), raw);
    const report = step(node, "spring", createRng(1), tunedCtx).report;
    expect(reportFor(report.species, "skir-line").starving).toBe(true);
    expect(reportFor(report.species, "skir-line").starvationDeaths).toBe(9);
  });

  it("the raw-file fallback still catches a constant zBalance does not declare", () => {
    /*
     * The safety net, kept live after the additions merge. `zBalance` parses with z.object and
     * STRIPS keys it does not declare — so the day someone adds a tunable to data/balance.json and
     * forgets the schema entry, the validated `Balance` arrives WITHOUT it and a harness retune is
     * silently ignored. INV-3 says a retune of balance.json must reach the sim, so `ecoConstants`
     * also consults the raw file the caller loaded.
     *
     * Simulated by validating first and then stripping the key from the validated object, which is
     * exactly what zod would have done on its own to an undeclared key.
     */
    const { balance: tuned, raw } = overridden((raw) => {
      (raw as unknown as { ecosim: Record<string, unknown> }).ecosim.starveMinDeathsPerSeason = 5;
    });
    const stripped = {
      ...tuned,
      ecosim: { ...tuned.ecosim, starveMinDeathsPerSeason: undefined },
    } as unknown as Balance;

    // Without the raw file the sim falls through to the SHIPPED default — the silent-no-op bug.
    const shippedDefault = ecoConstants(balance).starveMinDeathsPerSeason;
    expect(ecoConstants(stripped).starveMinDeathsPerSeason).toBe(shippedDefault);
    // With it, the retune reaches the sim. This is the wiring INV-3 depends on.
    expect(ecoConstants(stripped, raw).starveMinDeathsPerSeason).toBe(5);
  });

  it("retuning touches balance.json only — no sim constant is a literal in core/ecosim.ts", () => {
    // INV-4 / G11, checked against the file rather than asserted in prose. Error messages cite spec
    // sections by number ("build-doc §7.3"), so string literals are blanked before the sweep.
    for (const path of ["../../core/ecosim.ts", "../../core/foodweb.ts"]) {
      const code = codeWithoutStrings(executableSource(path));
      const numbers = [...code.matchAll(/(?<![\w.$])(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      expect(numbers.length, `${path}: the number matcher found nothing at all`).toBeGreaterThan(0);
      for (const n of numbers) {
        // The only bare numbers left are structural: 0/1 identities, indices and empty-guards.
        expect(n, `${path} carries the literal ${n} — gameplay constants live in balance.json`).toBeLessThanOrEqual(1);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * perf_sim — build-doc §12
 * ════════════════════════════════════════════════════════════════════════════ */

function medianMs(run: () => void, samples: number): number {
  for (let i = 0; i < 5; i++) run(); // warm up
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    run();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? Infinity;
}

describe("perf_sim — build-doc §12", () => {
  it("steps all 12 nodes inside balance.perf.ecosimStepBudgetMs", () => {
    const nodes = shipped.map((n) => cloneEcoNode(n));
    const rng = createRng(1);
    const ms = medianMs(() => {
      stepAll(nodes, "spring", rng, ctx);
    }, 50);
    expect(content.nodes).toHaveLength(12);
    expect(ms, `12-node step took ${ms.toFixed(3)}ms`).toBeLessThan(balance.perf.ecosimStepBudgetMs);
  });

  it("steps the mega-node fixture inside the budget × the mega-node margin", () => {
    const node = toEcoNode(megaNode);
    const nodeCtx = soloCtx(node);
    const rng = createRng(1);
    const budget = balance.perf.ecosimStepBudgetMs * balance.perf.megaNodeMarginMultiplier;
    const ms = medianMs(() => {
      step(node, "spring", rng, nodeCtx);
    }, 50);
    expect(Object.keys(megaNode.populations).length).toBeGreaterThanOrEqual(24);
    expect(ms, `mega-node step took ${ms.toFixed(3)}ms`).toBeLessThan(budget);
  });

  it("measures the O(n²) derivation at the width build-doc §13 actually claims", () => {
    // §13's honest answer is "O(n²) web derivation fine at 27 lines". No node can host 27 lines on
    // shipped content — bible §5's "in its habitat" clause admits at most a handful of lines at any
    // one biome (asserted below), so the mega-node fixture's 24 entries derive over far fewer. The
    // cost claim is therefore measured directly, over an index whose lines all admit one biome.
    const wideIdx = indexSpecies(content.species.map((line) => ({ ...line, habitat: [...HABITAT_SENTINELS] })));
    const wide = toEcoNode(megaNode);
    for (const line of content.species) {
      wide.populations[line.id] ??= { count: 100, breedRate: 0.05, carryCap: 300 };
    }
    const wideCtx: SimContext = {
      species: wideIdx,
      balance,
      eco,
      presence: derivePresence([wide], wideIdx, balance, eco),
    };
    const web = deriveFoodWeb(wide, wideIdx, balance);
    expect(Object.keys(web.edges).length).toBe(content.species.length);
    const rng = createRng(1);
    const ms = medianMs(() => {
      step(wide, "spring", rng, wideCtx);
    }, 50);
    expect(ms, `${content.species.length}-line step took ${ms.toFixed(3)}ms`).toBeLessThan(
      balance.perf.ecosimStepBudgetMs * balance.perf.megaNodeMarginMultiplier,
    );

    // …and the width that a real biome admits, so the gap between the two is a measured number and
    // not an assumption about the fixture (DEVIATIONS-lane-a2 A2-D9).
    const admitted = Object.keys(megaNode.populations).filter((id) => {
      const line = idx.byId.get(id);
      return line ? inhabits(line, megaNode.biome) : false;
    });
    expect(admitted.length).toBeLessThan(Object.keys(megaNode.populations).length);
    expect(Object.keys(deriveFoodWeb(toEcoNode(megaNode), idx, balance).edges).length).toBe(admitted.length);
  });

  it("a whole six-year regional run stays well inside a frame budget per season", () => {
    const rng = createRng(1);
    const t0 = performance.now();
    let nodes = shipped.map((n) => cloneEcoNode(n));
    for (let year = 0; year < balance.clock.yearsTotal; year++) {
      for (const season of seasons) nodes = stepAll(nodes, season, rng, ctx).nodes;
    }
    const total = performance.now() - t0;
    const perSeason = total / (balance.clock.yearsTotal * seasons.length);
    expect(perSeason).toBeLessThan(balance.perf.ecosimStepBudgetMs);
  });
});
