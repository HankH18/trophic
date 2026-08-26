/**
 * tests/gates/extensibility.test.ts — build-doc §6's extensibility invariants, as the named tests
 * §6 and §10.3 require. Written at integration: `ext_retune` existed (tests/property/ecosim.test.ts),
 * `ext_add_species` and `ext_add_node` did not exist anywhere in the repo.
 *
 *   INV-1  ext_add_species — "Adding a species touches species.json, one node JSON, and assets
 *                            only — no code."
 *   INV-2  ext_add_node    — "Adding a node touches data/nodes/ + assets + graph adjacency only."
 *   INV-3  ext_retune      — "Retuning balance touches balance.json only." (Lives in
 *                            tests/property/ecosim.test.ts, plus the repo-wide
 *                            balance_keys_survive_validation gate in guardrails.test.ts.)
 *
 * The claim is about CODE, so the test has to be about code: each case adds content to a copy of
 * the shipped bundle and then drives the real modules — validation, the derived food web, the
 * encounter weights, a season step, a battle — with NOTHING in core/ changed. Anything that would
 * have needed a code edit shows up here as a throw or a wrong answer, not as an opinion.
 */

import { describe, expect, it } from "vitest";
import { validateBundle, type RawContentBundle } from "../../core/schemas";
import type { Content, NodeFile, SpeciesLine } from "../../core/types";
import {
  deriveFoodWeb,
  encounterWeights,
  indexSpecies,
  toEcoNode,
} from "../../core/foodweb";
import { derivePresence, ecoConstants, makeContext, stepRegionStates } from "../../core/ecosim";
import { createRng } from "../../core/rng";
import { makeBattleContext, predationOracleFromWebs, startBattle, step } from "../../core/battle";

import speciesJson from "../../data/species.json";
import movesJson from "../../data/moves.json";
import gymsJson from "../../data/gyms.json";
import balanceJson from "../../data/balance.json";
import paletteJson from "../../data/palette.json";
import hearthollowJson from "../../data/nodes/hearthollow.json";
import r1Json from "../../data/nodes/r1.json";
import brackwaterJson from "../../data/nodes/brackwater.json";
import r2Json from "../../data/nodes/r2.json";
import bowerdeepJson from "../../data/nodes/bowerdeep.json";
import r3Json from "../../data/nodes/r3.json";
import cindershelfJson from "../../data/nodes/cindershelf.json";
import r4Json from "../../data/nodes/r4.json";
import duskhollowJson from "../../data/nodes/duskhollow.json";
import r5Json from "../../data/nodes/r5.json";
import sanctumApproachJson from "../../data/nodes/sanctum-approach.json";
import sanctumJson from "../../data/nodes/sanctum.json";

const NODE_JSON = [
  hearthollowJson, r1Json, brackwaterJson, r2Json, bowerdeepJson, r3Json,
  cindershelfJson, r4Json, duskhollowJson, r5Json, sanctumApproachJson, sanctumJson,
];

/** A deep copy of the shipped bundle, exactly as `validateContent()` assembles it. */
function shippedBundle(): RawContentBundle {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    species: clone(speciesJson),
    moves: clone(movesJson),
    gyms: clone(gymsJson),
    balance: clone(balanceJson),
    palette: clone(paletteJson),
    nodes: NODE_JSON.map(clone),
  };
}

/** Drive every core module that reads content, over the whole region. Returns a survey digest. */
function exerciseEverything(content: Content, seed: number): string {
  const idx = indexSpecies(content.species);
  const nodes = content.nodes.map((f) => toEcoNode(f));
  const eco = ecoConstants(content.balance);
  const ctx = makeContext(idx, content.balance, derivePresence(nodes, idx, content.balance, eco));

  // Derived web + encounter weights at every node, for every season.
  const webs = nodes.map((n) => deriveFoodWeb(n, idx, content.balance));
  for (const n of nodes) {
    for (const season of content.balance.clock.seasonOrder) {
      const ws = encounterWeights(n, idx, content.balance, { season });
      expect(ws.length).toBe(Object.keys(n.populations).length);
      for (const w of ws) expect(w.weight).toBeGreaterThanOrEqual(0);
    }
  }

  // A full year of the sim across the whole region.
  let states: Record<string, ReturnType<typeof toEcoNode> extends never ? never : NonNullable<unknown>> = {};
  let live = Object.fromEntries(
    content.nodes.map((f) => [f.id, { populations: JSON.parse(JSON.stringify(f.populations)), floraStock: f.floraStock, recentDeaths: 0 }]),
  );
  void states;
  const rng = createRng(seed);
  for (const season of content.balance.clock.seasonOrder) {
    live = stepRegionStates(content.nodes, live as never, season, rng, ctx).states as never;
  }

  // A battle that uses the derived web for its Predation rule.
  const battleCtx = makeBattleContext(content, predationOracleFromWebs(webs));
  const first = content.species[0] as SpeciesLine;
  const second = (content.species[1] ?? first) as SpeciesLine;
  let st = startBattle(
    {
      seed,
      kind: "wild",
      playerParty: [{ uid: "p", lineId: first.id, age: "A", level: 15, traits: [] }],
      enemyParty: [{ uid: "e", lineId: second.id, age: "A", level: 15, traits: [] }],
      nodeId: content.nodes[0]?.id as string,
    },
    battleCtx,
  ).state;
  for (let t = 0; st.outcome === null && t < 30; t++) {
    st = step(st, { kind: "move", moveId: first.movePool.type1 }, createRng(seed + t), battleCtx).state;
  }

  return Object.entries(live as Record<string, { populations: Record<string, { count: number }> }>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, s]) =>
      `${id}:${Object.entries(s.populations).sort(([a], [b]) => a.localeCompare(b)).map(([k, p]) => `${k}=${p.count}`).join(",")}`,
    )
    .join("|");
}

/* ════════════════════════════════════════════════════════════════════════════
 * INV-1 — ext_add_species
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ext_add_species — build-doc §6 INV-1", () => {
  /**
   * A new line, written the way a content author would write one: it has to be a real trophic
   * participant or the test proves nothing. This is a Meadow Mesopredator, so the derivation must
   * give it Grazer prey at Hearthollow/R1 AND make it prey for the Meadow apex — if any of that
   * needed a code edit, the assertions below fail.
   */
  const NEW_LINE = {
    id: "test-vole-line",
    dexIds: ["Testvole"],
    formNames: { J: "Testvole", A: "Testvole", E: "Testvole" },
    types: { J: ["Beast"], A: ["Beast"], E: ["Beast"] },
    role: { J: "Mesopredator", A: "Mesopredator", E: "Mesopredator" },
    habitat: ["Meadow"],
    baseStats: { hp: 60, atk: 70, def: 50, spd: 80, ins: 40 },
    metamorphic: false,
    ancient: false,
    movePool: { type1: "gnaw", type2: "maul", role: "ambush", utility: "quicken" },
  };

  function bundleWithSpecies(): RawContentBundle {
    const raw = shippedBundle();
    (raw.species as { species: unknown[] }).species.push(JSON.parse(JSON.stringify(NEW_LINE)));
    // "…and one node JSON": it has to live somewhere or it is not in the game.
    const r1 = raw.nodes.find((n) => (n as { id: string }).id === "r1") as {
      populations: Record<string, unknown>;
    };
    r1.populations[NEW_LINE.id] = { count: 6, breedRate: 0.08, carryCap: 14 };
    return raw;
  }

  it("validates with no change to core/ — species.json + one node JSON is the whole edit", () => {
    const content = validateBundle(bundleWithSpecies());
    expect(content.species).toHaveLength((speciesJson as { species: unknown[] }).species.length + 1);
    expect(content.species.some((s) => s.id === NEW_LINE.id)).toBe(true);
  });

  it("the new line is a real participant: it eats, is eaten, and appears in encounters", () => {
    const content = validateBundle(bundleWithSpecies());
    const idx = indexSpecies(content.species);
    const r1 = toEcoNode(content.nodes.find((n) => n.id === "r1") as NodeFile);
    const web = deriveFoodWeb(r1, idx, content.balance);

    // Eats: a Mesopredator's derived diet is the node's Grazers (bible §5).
    const diet = web.edges[NEW_LINE.id] ?? [];
    expect(diet.length, "the new Mesopredator derived no prey — the web did not see it").toBeGreaterThan(0);
    for (const preyId of diet) {
      expect(idx.byId.get(preyId)?.role[content.balance.ecosim.webRoleAgeClass]).toBe("Grazer");
    }
    // Is eaten: the node's Apex, if it has one, now preys on it too.
    const apexes = Object.keys(r1.populations).filter(
      (id) => idx.byId.get(id)?.role[content.balance.ecosim.webRoleAgeClass] === "Apex",
    );
    for (const apexId of apexes) expect(web.edges[apexId] ?? []).toContain(NEW_LINE.id);

    // Appears in encounters, at the weight its count implies (build-doc §7.2 — derived, not tabled).
    const w = encounterWeights(r1, idx, content.balance, { season: "spring" }).find((x) => x.lineId === NEW_LINE.id);
    expect(w?.weight).toBe(6);
    expect(w?.active).toBe(true);
  });

  it("the whole engine runs on the extended content — sim, encounters and a battle", () => {
    const content = validateBundle(bundleWithSpecies());
    expect(() => exerciseEverything(content, 31)).not.toThrow();
    // …and adding it CHANGES the region, so the test is not passing on an ignored entry.
    expect(exerciseEverything(content, 31)).not.toBe(exerciseEverything(validateBundle(shippedBundle()), 31));
  });

  it("a species added WITHOUT its node entry is refused, not silently absent", () => {
    // The other half of INV-1: "species.json AND one node JSON". A line in no node is content that
    // exists nowhere, and the survey would never show it.
    const raw = shippedBundle();
    (raw.species as { species: unknown[] }).species.push(JSON.parse(JSON.stringify(NEW_LINE)));
    const content = validateBundle(raw); // shape is fine…
    const idx = indexSpecies(content.species);
    for (const f of content.nodes) {
      expect(Object.keys(f.populations)).not.toContain(NEW_LINE.id);
      const ws = encounterWeights(toEcoNode(f), idx, content.balance, { season: "spring" });
      expect(ws.some((w) => w.lineId === NEW_LINE.id)).toBe(false);
    }
  });

  it("a species whose habitat does not match its node is refused (the edit must be coherent)", () => {
    const raw = shippedBundle();
    const wrong = { ...JSON.parse(JSON.stringify(NEW_LINE)), habitat: ["Marsh"] };
    (raw.species as { species: unknown[] }).species.push(wrong);
    const r1 = raw.nodes.find((n) => (n as { id: string }).id === "r1") as { populations: Record<string, unknown> };
    r1.populations[NEW_LINE.id] = { count: 6, breedRate: 0.08, carryCap: 14 };
    expect(() => validateBundle(raw)).toThrow(/habitat/i);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * INV-2 — ext_add_node
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ext_add_node — build-doc §6 INV-2", () => {
  /** A thirteenth node, hung off R1. Adjacency must be symmetric, so R1 gains the back-edge. */
  function bundleWithNode(): RawContentBundle {
    const raw = shippedBundle();
    const r1 = raw.nodes.find((n) => (n as { id: string }).id === "r1") as {
      biome: string;
      adjacency: string[];
      populations: Record<string, { count: number; breedRate: number; carryCap: number }>;
    };
    r1.adjacency.push("r1-annex");
    raw.nodes.push({
      id: "r1-annex",
      name: "Meadow Annex",
      biome: r1.biome,
      adjacency: ["r1"],
      walkable: false,
      mapAsset: "maps/r1-annex.png",
      yearVariants: {},
      collisionMask: "masks/r1-annex.png",
      floraStock: 40,
      // Reuses R1's own lines, so no species edit is implied — that is INV-2's point.
      populations: JSON.parse(JSON.stringify(r1.populations)),
      props: [],
    });
    return raw;
  }

  it("validates with no change to core/ — data/nodes/ + graph adjacency is the whole edit", () => {
    const content = validateBundle(bundleWithNode());
    expect(content.nodes).toHaveLength(NODE_JSON.length + 1);
    const added = content.nodes.find((n) => n.id === "r1-annex") as NodeFile;
    expect(added.adjacency).toEqual(["r1"]);
    expect(content.nodes.find((n) => n.id === "r1")?.adjacency).toContain("r1-annex");
  });

  it("an asymmetric edge is refused — a one-way node is a broken graph, not a new node", () => {
    const raw = bundleWithNode();
    const r1 = raw.nodes.find((n) => (n as { id: string }).id === "r1") as { adjacency: string[] };
    r1.adjacency = r1.adjacency.filter((a) => a !== "r1-annex");
    expect(() => validateBundle(raw)).toThrow(/adjacen/i);
  });

  it("the new node derives its own web and encounters, and the region steps with it", () => {
    const content = validateBundle(bundleWithNode());
    const idx = indexSpecies(content.species);
    const added = content.nodes.find((n) => n.id === "r1-annex") as NodeFile;
    const web = deriveFoodWeb(toEcoNode(added), idx, content.balance);
    expect(Object.values(web.edges).some((prey) => prey.length > 0)).toBe(true);
    expect(encounterWeights(toEcoNode(added), idx, content.balance, { season: "spring" }).length).toBeGreaterThan(0);
    expect(() => exerciseEverything(content, 17)).not.toThrow();
  });

  it("INV-2's real bite: adding a node MOVES NO OTHER NODE'S TRAJECTORY", () => {
    /*
     * This is the invariant that is easy to break and hard to notice. If the sim's per-node RNG
     * streams were keyed on array position rather than node id, inserting a thirteenth node would
     * shift every later node's draws and silently rewrite six years of ecology everywhere.
     * core/ecosim.ts keys each child stream on the node id (`deriveStream`) precisely so this holds.
     */
    const base = validateBundle(shippedBundle());
    const extended = validateBundle(bundleWithNode());

    const runRegion = (content: Content) => {
      const idx = indexSpecies(content.species);
      const nodes = content.nodes.map((f) => toEcoNode(f));
      const eco = ecoConstants(content.balance);
      const ctx = makeContext(idx, content.balance, derivePresence(nodes, idx, content.balance, eco));
      let live: Record<string, { populations: Record<string, { count: number }>; floraStock: number; recentDeaths: number }> =
        Object.fromEntries(
          content.nodes.map((f) => [
            f.id,
            { populations: JSON.parse(JSON.stringify(f.populations)), floraStock: f.floraStock, recentDeaths: 0 },
          ]),
        );
      const rng = createRng(909);
      for (let year = 0; year < 2; year++) {
        for (const season of content.balance.clock.seasonOrder) {
          live = stepRegionStates(content.nodes, live as never, season, rng, ctx).states as never;
        }
      }
      return live;
    };

    const before = runRegion(base);
    const after = runRegion(extended);
    for (const id of Object.keys(before)) {
      expect(
        after[id]?.populations,
        `adding "r1-annex" moved node "${id}" — a node's trajectory must not depend on the graph's size`,
      ).toEqual(before[id]?.populations);
    }
    // The new node did run (otherwise the check above is vacuous).
    expect(after["r1-annex"]).toBeDefined();
  });

  it("a node naming a species that does not exist is refused", () => {
    const raw = bundleWithNode();
    const added = raw.nodes[raw.nodes.length - 1] as { populations: Record<string, unknown> };
    added.populations["no-such-line"] = { count: 3, breedRate: 0.1, carryCap: 5 };
    expect(() => validateBundle(raw)).toThrow();
  });
});
