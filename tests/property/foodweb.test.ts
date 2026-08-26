/**
 * tests/property/foodweb.test.ts — the derived web and the two derivations that hang off it.
 *
 * build-doc §7.3 / bible §5: "Apex eats {Mesopredator, large Grazer} in habitat; Mesopredator eats
 * Grazers; Grazers eat Producers + floraStock; Scavengers eat nothing live; plus each species'
 * `dietExceptions`; Ancients eat nothing (presence effects instead)."
 *
 * build-doc §7.2 derivations: encounter weight = live count, migrants filtered by season, Scavenger
 * weight × (1 + recentDeaths/divisor); bait matches when its tag is in the target's derived diet.
 *
 * Named gate here: `migrant_legibility` (build-doc §10.2) — an out-of-season migrant never appears
 * in an encounter roll AND its dex-facing flag reads dormant/migrating, so seasonal absence is never
 * confusable with a population crash (bible §5 legibility requirement, Hard Req 10).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  availablePrey,
  baitMatchFor,
  deriveFoodWeb,
  encounterWeights,
  indexSpecies,
  inhabits,
  isLargeGrazer,
  limitingPrey,
  migrantStatus,
  orderedLineIds,
  predatorsOf,
  preyOf,
  primaryPrey,
  rollEncounter,
  toEcoNode,
  webRole,
  type EcoNode,
} from "../../core/foodweb";
import { cascadeConstants } from "../../core/ecosim";
import { createRng } from "../../core/rng";
import { validateContent } from "../../core/schemas";
import { ROLES, type NodeFile, type Role, type Season, type SpeciesLine } from "../../core/types";
import megaNodeJson from "../../fixtures/mega-node.json";
import { fileURLToPath } from "node:url";

const content = validateContent();
const idx = indexSpecies(content.species);
const balance = content.balance;
const cascade = cascadeConstants(balance);
const seasons = balance.clock.seasonOrder;
const nodes = content.nodes.map((file) => toEcoNode(file));

const lineOf = (id: string): SpeciesLine => {
  const line = idx.byId.get(id);
  if (!line) throw new Error(`unknown line ${id}`);
  return line;
};
const roleOf = (id: string): Role => webRole(lineOf(id), balance);

describe("foodweb — derivation rules (bible §5, build-doc §7.3)", () => {
  it("derives an edge set for every shipped node without inventing a line", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      expect(web.nodeId).toBe(node.id);
      for (const [predatorId, prey] of Object.entries(web.edges)) {
        expect(node.populations[predatorId]).toBeDefined();
        for (const preyId of prey) expect(node.populations[preyId]).toBeDefined();
      }
      for (const feeder of web.floraFeeders) expect(node.populations[feeder]).toBeDefined();
    }
  });

  it("Apex eats Mesopredators and LARGE Grazers only — never an ordinary Grazer", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const [predatorId, prey] of Object.entries(web.edges)) {
        if (roleOf(predatorId) !== "Apex") continue;
        for (const preyId of prey) {
          const exception = lineOf(predatorId).dietExceptions?.includes(preyId) ?? false;
          if (exception) continue;
          const role = roleOf(preyId);
          expect(["Mesopredator", "Grazer"]).toContain(role);
          if (role === "Grazer") expect(isLargeGrazer(lineOf(preyId), balance)).toBe(true);
        }
      }
    }
  });

  it("Mesopredators eat Grazers, Grazers eat Producers + flora", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const [predatorId, prey] of Object.entries(web.edges)) {
        const role = roleOf(predatorId);
        if (role === "Mesopredator") {
          for (const preyId of prey) {
            if (lineOf(predatorId).dietExceptions?.includes(preyId)) continue;
            expect(roleOf(preyId)).toBe("Grazer");
          }
        }
        if (role === "Grazer") {
          for (const preyId of prey) {
            if (lineOf(predatorId).dietExceptions?.includes(preyId)) continue;
            expect(roleOf(preyId)).toBe("Producer");
          }
          expect(web.floraFeeders).toContain(predatorId);
        }
      }
    }
  });

  it("Producers, Scavengers and Ancients eat nothing live", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const lineId of Object.keys(web.edges)) {
        const role = roleOf(lineId);
        if (role === "Producer" || role === "Scavenger" || role === "AncientApex") {
          expect(preyOf(web, lineId)).toEqual([]);
          expect(web.floraFeeders).not.toContain(lineId);
          expect(availablePrey(node, web, lineId, balance)).toBe(0);
        }
      }
    }
  });

  it("honours the bible §5 exceptions table where the exception is actually present", () => {
    const withExceptions = content.species.filter((l) => (l.dietExceptions?.length ?? 0) > 0);
    expect(withExceptions.length).toBeGreaterThan(0);
    for (const line of withExceptions) {
      for (const node of nodes) {
        if (!node.populations[line.id]) continue;
        const web = deriveFoodWeb(node, idx, balance);
        for (const exceptionId of line.dietExceptions ?? []) {
          if (!node.populations[exceptionId]) continue;
          expect(preyOf(web, line.id)).toContain(exceptionId);
        }
      }
    }
  });

  it("never lets a line eat itself, and keeps predator/prey lookups mutually consistent", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const [predatorId, prey] of Object.entries(web.edges)) {
        expect(prey).not.toContain(predatorId);
        for (const preyId of prey) expect(predatorsOf(web, preyId)).toContain(predatorId);
      }
    }
  });

  it("respects habitat: a line only participates where its biome tag (or 'roaming') admits it", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const lineId of Object.keys(web.edges)) {
        expect(inhabits(lineOf(lineId), node.biome)).toBe(true);
      }
    }
  });

  it("the habitat clause is LOAD-BEARING: a line the biome excludes takes no part in the web", () => {
    // The assertion above is vacuous on shipped data — core/schemas.ts already rejects any shipped
    // node whose populations hold a line its biome excludes, so deleting the filter from
    // `deriveFoodWeb` left the whole suite green. The mega-node stress fixture is the one node that
    // holds lines from every biome, which is exactly what makes it able to prove the clause
    // (bible §5: "Apex eats … in ITS HABITAT").
    const mega = toEcoNode(megaNodeJson as unknown as NodeFile);
    const admitted = Object.keys(mega.populations).filter((id) => inhabits(lineOf(id), mega.biome));
    const excluded = Object.keys(mega.populations).filter((id) => !inhabits(lineOf(id), mega.biome));
    expect(excluded.length, "the stress fixture no longer holds an out-of-biome line").toBeGreaterThan(0);

    const web = deriveFoodWeb(mega, idx, balance);
    expect(Object.keys(web.edges).sort()).toEqual([...admitted].sort());
    for (const lineId of excluded) {
      expect(preyOf(web, lineId), `${lineId} eats at a node it does not live in`).toEqual([]);
      expect(predatorsOf(web, lineId), `${lineId} is eaten at a node it does not live in`).toEqual([]);
      expect(web.floraFeeders).not.toContain(lineId);
    }

    // …and the clause actually removes edges rather than merely removing isolated lines: with the
    // same populations and every habitat widened, the web is strictly bigger. Without this, a
    // deleted filter would still pass the two checks above on a fixture that happened to be inert.
    const anywhere = indexSpecies(content.species.map((line) => ({ ...line, habitat: ["roaming"] })));
    const wide = deriveFoodWeb(mega, anywhere, balance);
    const edgeCount = (w: typeof web) => Object.values(w.edges).reduce((n, prey) => n + prey.length, 0);
    expect(edgeCount(wide)).toBeGreaterThan(edgeCount(web));
    expect(Object.keys(wide.edges).length).toBeGreaterThan(Object.keys(web.edges).length);
  });

  it("iterates in a canonical order that does not come from the ids", () => {
    // build-doc §8.1 / L10: the arithmetic must not depend on how a populations map was BUILT (the
    // node JSON's insertion order vs core/save.ts's sorted order), and G6 wants it not to depend on
    // what things are CALLED either. `orderedLineIds` is `data/species.json`'s own order.
    const node = nodes.find((n) => n.id === "r2");
    if (!node) throw new Error("r2 missing");
    const reversed: Record<string, (typeof node.populations)[string]> = {};
    for (const id of Object.keys(node.populations).reverse()) {
      reversed[id] = node.populations[id] as (typeof node.populations)[string];
    }
    expect(orderedLineIds(reversed, idx)).toEqual(orderedLineIds(node.populations, idx));
    expect(orderedLineIds(node.populations, idx)).not.toEqual(Object.keys(node.populations).sort());
    for (const id of orderedLineIds(node.populations, idx)) expect(idx.order.has(id)).toBe(true);
  });

  it("is a pure function of the node state — same input, same web", () => {
    for (const node of nodes) {
      expect(JSON.stringify(deriveFoodWeb(node, idx, balance))).toEqual(
        JSON.stringify(deriveFoodWeb(node, idx, balance)),
      );
    }
  });

  it("prey units count bodies plus the node's flora at the balance conversion", () => {
    const node = nodes.find((n) => n.id === "r1");
    if (!node) throw new Error("r1 missing");
    const web = deriveFoodWeb(node, idx, balance);
    const grazer = web.floraFeeders[0];
    if (!grazer) throw new Error("no flora feeder at r1");
    const bodies = preyOf(web, grazer).reduce((sum, id) => sum + (node.populations[id]?.count ?? 0), 0);
    expect(availablePrey(node, web, grazer, balance)).toBeCloseTo(
      bodies + node.floraStock * balance.ecosim.floraPreyUnitsPerPoint,
      9,
    );
  });
});

describe("foodweb — primary prey is derived from the live state, never labelled", () => {
  it("names the biggest pool the predator is currently drawing on", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const lineId of Object.keys(web.edges)) {
        const prey = preyOf(web, lineId);
        const primary = primaryPrey(node, web, lineId, balance);
        if (prey.length === 0) {
          expect(primary).toBeNull();
          continue;
        }
        const best = Math.max(...prey.map((id) => node.populations[id]?.count ?? 0));
        expect(node.populations[primary ?? ""]?.count).toBe(best);
      }
    }
  });

  it("moves when the populations move", () => {
    const node = nodes.find((n) => n.id === "r2");
    if (!node) throw new Error("r2 missing");
    const web = deriveFoodWeb(node, idx, balance);
    const apex = Object.keys(web.edges).find((id) => roleOf(id) === "Apex");
    if (!apex) throw new Error("no apex at r2");
    const prey = preyOf(web, apex);
    expect(prey.length).toBeGreaterThan(1);

    const before = primaryPrey(node, web, apex, balance);
    const swapped: EcoNode = JSON.parse(JSON.stringify(node)) as EcoNode;
    const other = prey.find((id) => id !== before);
    if (!other || !before) throw new Error("expected two prey pools");
    const beforePop = swapped.populations[before];
    const otherPop = swapped.populations[other];
    if (!beforePop || !otherPop) throw new Error("missing populations");
    otherPop.count = beforePop.count + 1;
    expect(primaryPrey(swapped, deriveFoodWeb(swapped, idx, balance), apex, balance)).toBe(other);
  });

  it("limitingPrey names exactly the pools whose loss would starve the predator", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const lineId of Object.keys(web.edges)) {
        const limiting = limitingPrey(node, web, idx, lineId, balance, cascade.preyForcedFraction);
        if (limiting.length === 0) continue;
        // Removing every limiting pool down to the forced fraction must cross the threshold —
        // counting the flora the predator can also eat, which no amount of catching removes.
        const flora = web.floraFeeders.includes(lineId)
          ? node.floraStock * balance.ecosim.floraPreyUnitsPerPoint
          : 0;
        const remaining =
          flora +
          preyOf(web, lineId).reduce((sum, id) => {
            const count = node.populations[id]?.count ?? 0;
            return sum + (limiting.includes(id) ? count * cascade.preyForcedFraction : count);
          }, 0);
        const demand = (node.populations[lineId]?.count ?? 0) * balance.ecosim.demandPerIndividual[roleOf(lineId)];
        expect(remaining / demand).toBeLessThan(balance.ecosim.starveThreshold);
        // … and it is minimal: the biggest pool always comes first.
        expect(limiting[0]).toBe(primaryPrey(node, web, lineId, balance));
      }
    }
  });
});

describe("migrant_legibility — build-doc §10.2, Hard Req 10, bible §5", () => {
  const migrants = content.species.filter((l) => l.seasonalWindow);

  it("ships exactly four migrants, one per season", () => {
    expect(migrants).toHaveLength(4);
    expect(migrants.map((m) => m.seasonalWindow).sort()).toEqual([...seasons].sort());
  });

  it("an out-of-season migrant NEVER appears in an encounter roll", () => {
    for (const migrant of migrants) {
      const home = nodes.filter((n) => n.populations[migrant.id]);
      expect(home.length).toBeGreaterThan(0);
      for (const node of home) {
        for (const season of seasons) {
          if (season === migrant.seasonalWindow) continue;
          const weights = encounterWeights(node, idx, balance, { season });
          const entry = weights.find((w) => w.lineId === migrant.id);
          expect(entry).toBeDefined();
          expect(entry?.weight).toBe(balance.encounter.outOfSeasonWeight);
          expect(entry?.active).toBe(false);

          const rng = createRng(1234);
          for (let i = 0; i < 3000; i++) {
            expect(rollEncounter(weights, rng)).not.toBe(migrant.id);
          }
        }
      }
    }
  });

  it("flags it dormant or migrating — never merely absent", () => {
    for (const migrant of migrants) {
      const home = nodes.find((n) => n.populations[migrant.id]);
      if (!home) throw new Error(`${migrant.id} lives nowhere`);
      const reasons = new Set<string>();
      for (const season of seasons) {
        const entry = encounterWeights(home, idx, balance, { season }).find((w) => w.lineId === migrant.id);
        if (season === migrant.seasonalWindow) {
          expect(entry?.active).toBe(true);
          expect(entry?.dormantReason).toBeUndefined();
        } else {
          expect(entry?.dormantReason).toBeDefined();
          expect(["dormant", "migrating"]).toContain(entry?.dormantReason);
          reasons.add(entry?.dormantReason ?? "");
        }
      }
      // Both words get used: on the shoulders of the window the animal is on the move.
      expect([...reasons].sort()).toEqual(["dormant", "migrating"]);
    }
  });

  it("in its own season a migrant weighs exactly its live count — no seasonal bonus", () => {
    for (const migrant of migrants) {
      for (const node of nodes) {
        const pop = node.populations[migrant.id];
        if (!pop) continue;
        const season = migrant.seasonalWindow as Season;
        const entry = encounterWeights(node, idx, balance, { season }).find((w) => w.lineId === migrant.id);
        expect(entry?.weight).toBe(pop.count);
        expect(entry?.active).toBe(pop.count > 0);
      }
    }
  });

  it("a crash is legible as a crash: zero count is active-but-empty, not dormant", () => {
    const node = nodes.find((n) => n.populations["pollywisp-line"]);
    if (!node) throw new Error("no pollywisp node");
    const crashed: EcoNode = JSON.parse(JSON.stringify(node)) as EcoNode;
    const pop = crashed.populations["pollywisp-line"];
    if (!pop) throw new Error("missing pollywisp");
    pop.count = 0;
    const entry = encounterWeights(crashed, idx, balance, {
      season: lineOf("pollywisp-line").seasonalWindow as Season,
    }).find((w) => w.lineId === "pollywisp-line");
    expect(entry?.weight).toBe(0);
    expect(entry?.active).toBe(false);
    expect(entry?.dormantReason).toBeUndefined();
  });

  it("migrantStatus is a pure function of (window, season, seasonOrder)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...seasons), fc.constantFrom(...seasons), (window, season) => {
        const line = { ...lineOf("nibbin-line"), seasonalWindow: window };
        const status = migrantStatus(line, season, balance);
        expect(status.active).toBe(window === season);
        if (!status.active) expect(["dormant", "migrating"]).toContain(status.dormantReason);
      }),
      { numRuns: 100 },
    );
  });
});

describe("encounter weights — derived from live counts (build-doc §7.2, G3)", () => {
  it("weight of a non-migrant equals its live population count", () => {
    for (const node of nodes) {
      for (const season of seasons) {
        for (const entry of encounterWeights(node, idx, balance, { season })) {
          const line = lineOf(entry.lineId);
          if (line.seasonalWindow || line.habitat.includes(balance.encounter.signChainGatedHabitatTag)) continue;
          if (webRole(line, balance) === "Scavenger") continue;
          expect(entry.weight).toBe(node.populations[entry.lineId]?.count ?? -1);
        }
      }
    }
  });

  it("a wiped-out species stops appearing entirely — the cascade is visible for free", () => {
    const node = nodes.find((n) => n.id === "r1");
    if (!node) throw new Error("r1 missing");
    const emptied: EcoNode = JSON.parse(JSON.stringify(node)) as EcoNode;
    for (const pop of Object.values(emptied.populations)) pop.count = 0;
    emptied.recentDeaths = 0;
    const weights = encounterWeights(emptied, idx, balance, { season: "spring" });
    expect(weights.every((w) => w.weight === 0)).toBe(true);
    const rng = createRng(3);
    for (let i = 0; i < 500; i++) expect(rollEncounter(weights, rng)).toBeNull();
  });

  it("Scavenger weight rises with recentDeaths (bible §4 'spawn weight rises where webs crash')", () => {
    const node = nodes.find((n) => n.id === "r3");
    if (!node) throw new Error("r3 missing");
    const scavenger = Object.keys(node.populations).find((id) => roleOf(id) === "Scavenger");
    if (!scavenger) throw new Error("no scavenger at r3");

    const quiet: EcoNode = { ...node, recentDeaths: 0 };
    const bloody: EcoNode = { ...node, recentDeaths: 20 };
    const quietWeight = encounterWeights(quiet, idx, balance, { season: "spring" }).find((w) => w.lineId === scavenger);
    const bloodyWeight = encounterWeights(bloody, idx, balance, { season: "spring" }).find(
      (w) => w.lineId === scavenger,
    );
    const count = node.populations[scavenger]?.count ?? 0;
    expect(quietWeight?.weight).toBe(count);
    expect(bloodyWeight?.weight).toBeCloseTo(
      count * (1 + 20 / balance.encounter.scavengerRecentDeathsDivisor),
      9,
    );
    expect(bloodyWeight?.weight).toBeGreaterThan(quietWeight?.weight ?? 0);
  });

  it("sign-chain-gated lines (the Ancients) stay out of the ordinary pool until unlocked", () => {
    const gatedTag = balance.encounter.signChainGatedHabitatTag;
    for (const node of nodes) {
      for (const lineId of Object.keys(node.populations)) {
        if (!lineOf(lineId).habitat.includes(gatedTag)) continue;
        const locked = encounterWeights(node, idx, balance, { season: "spring" }).find((w) => w.lineId === lineId);
        expect(locked?.weight).toBe(0);
        expect(locked?.active).toBe(false);

        const unlocked = encounterWeights(node, idx, balance, {
          season: "spring",
          unlockedSignChains: new Set([lineId]),
        }).find((w) => w.lineId === lineId);
        expect(unlocked?.weight).toBe(node.populations[lineId]?.count ?? 0);
      }
    }
  });

  it("rolls in proportion to live counts", () => {
    const node = nodes.find((n) => n.id === "hearthollow");
    if (!node) throw new Error("hearthollow missing");
    const weights = encounterWeights(node, idx, balance, { season: "summer" });
    const total = weights.reduce((s, w) => s + (w.active ? w.weight : 0), 0);
    const rng = createRng(20260824);
    const tally = new Map<string, number>();
    const n = 30_000;
    for (let i = 0; i < n; i++) {
      const id = rollEncounter(weights, rng);
      if (id) tally.set(id, (tally.get(id) ?? 0) + 1);
    }
    for (const w of weights) {
      if (!w.active) {
        expect(tally.get(w.lineId) ?? 0).toBe(0);
        continue;
      }
      expect((tally.get(w.lineId) ?? 0) / n).toBeCloseTo(w.weight / total, 1);
    }
  });
});

describe("bait match — derived from the target's diet (build-doc §7.2, G3)", () => {
  it("a species bait matches exactly when its line is in the target's derived diet", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const targetId of Object.keys(web.edges)) {
        const diet = preyOf(web, targetId);
        for (const candidateId of Object.keys(node.populations)) {
          const match = baitMatchFor(candidateId, targetId, node, idx, balance, web);
          if (diet.includes(candidateId)) expect(match).toBe("species");
          else expect(match).not.toBe("species");
        }
      }
    }
  });

  it("a role bait matches any target whose diet contains that role", () => {
    const node = nodes.find((n) => n.id === "r2");
    if (!node) throw new Error("r2 missing");
    const web = deriveFoodWeb(node, idx, balance);
    const apex = Object.keys(web.edges).find((id) => roleOf(id) === "Apex");
    const meso = Object.keys(web.edges).find((id) => roleOf(id) === "Mesopredator");
    if (!apex || !meso) throw new Error("r2 shape changed");
    expect(baitMatchFor("Mesopredator", apex, node, idx, balance, web)).toBe("role");
    expect(baitMatchFor("Grazer", meso, node, idx, balance, web)).toBe("role");
    expect(baitMatchFor("Apex", meso, node, idx, balance, web)).toBe("none");
    expect(baitMatchFor(undefined, meso, node, idx, balance, web)).toBe("none");
  });

  it("resolves to a multiplier that exists in balance.catch.baitMult", () => {
    const node = nodes[0];
    if (!node) throw new Error("no nodes");
    const web = deriveFoodWeb(node, idx, balance);
    for (const targetId of Object.keys(web.edges)) {
      const match = baitMatchFor("Grazer", targetId, node, idx, balance, web);
      expect(balance.catch.baitMult[match]).toBeGreaterThan(0);
    }
  });

  it("nothing baits a line that eats nothing live", () => {
    for (const node of nodes) {
      const web = deriveFoodWeb(node, idx, balance);
      for (const lineId of Object.keys(web.edges)) {
        const role = roleOf(lineId);
        if (role !== "Scavenger" && role !== "AncientApex" && role !== "Producer") continue;
        for (const tag of [...Object.keys(node.populations), "Grazer", "Mesopredator", "Producer"]) {
          expect(baitMatchFor(tag, lineId, node, idx, balance, web)).toBe("none");
        }
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * no_shadow_tables — build-doc §8.3, listed as an invariant gate in §10.3
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * "Grep/AST gate: no file other than `core/foodweb.ts` may compute diet edges; no encounter-weight
 * literal tables anywhere; survey UI reads `nodeStates` objects directly." (build-doc §8.3)
 *
 * The gate build-doc §10.3 names did not exist anywhere in the repo. It does now, and it binds the
 * three things a shadow table would have to do: name a species, restate the role→role diet, or ship
 * a per-species weight table in data.
 */
function executableSource(path: string): string {
  const fs = require("node:fs") as typeof import("node:fs");
  return fs
    .readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function stringLiterals(code: string): string[] {
  const matches = code.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/gs) ?? [];
  return matches.map((raw) => raw.slice(1, -1));
}

function repoRoot(): string {
  const path = require("node:path") as typeof import("node:path");
  return path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
}

function sourceFiles(): string[] {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) out.push(full);
    }
  };
  for (const dir of ["core", "game", "tools"]) walk(path.join(repoRoot(), dir));
  return out;
}

describe("no_shadow_tables — build-doc §8.3 / §10.3", () => {
  const files = sourceFiles();

  it("finds the source tree it is supposed to be guarding", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("core/foodweb.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("core/battle.ts"))).toBe(true);
  });

  it("no shipping source names a species — a shadow table has to name its rows", () => {
    const ids = content.species.map((line) => line.id);
    const forms = content.species.flatMap((line) => Object.values(line.formNames));
    for (const file of files) {
      const literals = stringLiterals(executableSource(file)).join("   ");
      for (const token of [...ids, ...forms]) {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        expect(
          new RegExp(`(^|[^\\w-])${escaped}([^\\w-]|$)`).test(literals),
          `${file} names "${token}" — content belongs in data/, not in code (G2/G3)`,
        ).toBe(false);
      }
    }
  });

  it("the role→role diet lives in core/foodweb.ts and nowhere else", () => {
    // core/types.ts declares the VOCABULARY (the `ROLES` tuple) and core/schemas.ts validates
    // against it; neither derives an edge. Any other file carrying role names as data is a second
    // diet table by construction.
    const allowed = ["core/foodweb.ts", "core/types.ts", "core/schemas.ts"];
    for (const file of files) {
      if (allowed.some((suffix) => file.endsWith(suffix))) continue;
      const roleLiterals = stringLiterals(executableSource(file)).filter((lit) =>
        (ROLES as readonly string[]).includes(lit),
      );
      expect(roleLiterals, `${file} carries role names as data — §8.3 gives them one home`).toEqual([]);
    }
    // …and the one home really does carry it, so the rule is not passing by absence.
    const home = files.find((f) => f.endsWith("core/foodweb.ts")) as string;
    const homeRoles = stringLiterals(executableSource(home)).filter((lit) =>
      (ROLES as readonly string[]).includes(lit),
    );
    expect(homeRoles.length).toBeGreaterThan(2);
  });

  it("the §7.2 bait lookup has one implementation, and core/battle.ts calls it", () => {
    // core/battle.ts answers catch-time bait questions; if it re-derived the rule (species tag vs
    // role tag, the flora-Producer case, the web's age class) the two could drift with nothing red.
    const battle = files.find((f) => f.endsWith("core/battle.ts")) as string;
    const code = executableSource(battle);
    expect(code, "core/battle.ts no longer imports the one bait lookup").toContain("baitMatchFor");
    expect(code).toMatch(/import\s*\{[^}]*baitMatchFor[^}]*\}\s*from\s*["']\.\/foodweb["']/);
    // It must not restate the rule: the role-tag scan and the flora clause are foodweb's.
    expect(code).not.toMatch(/ROLE_TAGS|FLORA_ROLE_TAGS/);
  });

  it("no encounter-weight table exists in data — the weight IS the live count (G3)", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const root = repoRoot();
    const dataFiles = [
      ...fs
        .readdirSync(path.join(root, "data"))
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(root, "data", f)),
      ...fs.readdirSync(path.join(root, "data/nodes")).map((f) => path.join(root, "data/nodes", f)),
    ];
    expect(dataFiles.length).toBeGreaterThan(12);
    const ids = new Set(content.species.map((line) => line.id));
    for (const file of dataFiles) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
      const walk = (value: unknown, trail: string[]): void => {
        if (value === null || typeof value !== "object") return;
        if (Array.isArray(value)) {
          value.forEach((v, i) => walk(v, [...trail, String(i)]));
          return;
        }
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          if (key.startsWith("_")) continue; // documentation
          const isWeightTable =
            /spawn|encounter|bait/i.test(key) &&
            child !== null &&
            typeof child === "object" &&
            Object.keys(child as object).some((k) => ids.has(k));
          expect(isWeightTable, `${file}: ${[...trail, key].join(".")} is a second encounter table (G3)`).toBe(
            false,
          );
          walk(child, [...trail, key]);
        }
      };
      walk(parsed, []);
    }
  });
});
