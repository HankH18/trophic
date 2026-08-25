/**
 * tests/gates/schemas.test.ts — build-doc §15 lane A1 gate: "schemas validate".
 *
 * Half of this file proves the shipped content passes validateContent(). The other half proves the
 * schema actually BINDS: a deliberately corrupted copy of every data file must be rejected. A schema
 * that accepts garbage is not a gate, so each corruption below is checked for the specific complaint
 * it should raise, not merely for "something threw".
 */

import { describe, expect, it } from "vitest";
import {
  ContentValidationError,
  shippedBundle,
  validateBundle,
  validateContent,
  zSaveFile,
  type RawContentBundle,
} from "../../core/schemas";

/** Deep copy so a corruption can never leak into another test through the imported JSON modules. */
function clone(): RawContentBundle {
  const b = shippedBundle();
  return {
    species: structuredClone(b.species),
    moves: structuredClone(b.moves),
    gyms: structuredClone(b.gyms),
    balance: structuredClone(b.balance),
    palette: structuredClone(b.palette),
    nodes: b.nodes.map((n) => structuredClone(n)),
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function rejects(mutate: (b: any) => void, match: RegExp): void {
  const bundle = clone();
  mutate(bundle);
  let thrown: unknown = null;
  try {
    validateBundle(bundle);
  } catch (e) {
    thrown = e;
  }
  expect(thrown, "corrupted content was ACCEPTED — the schema does not bind").toBeInstanceOf(ContentValidationError);
  expect((thrown as ContentValidationError).message).toMatch(match);
}

const node = (b: any, id: string) => b.nodes.find((n: any) => n.id === id);

/* ────────────────────────────────────────────────────────────────────────── */
describe("validateContent() on the shipped data", () => {
  it("parses every data/*.json without throwing", () => {
    const content = validateContent();
    expect(content.species.length).toBe(27);
    expect(content.moves.moves.length).toBe(28);
    expect(content.gyms.length).toBe(6);
    expect(content.nodes.length).toBe(12);
    expect(content.palette.colors.length).toBe(32);
    expect(content.balance.types.predation).toBe(1.25);
  });

  it("is idempotent and side-effect free", () => {
    expect(validateContent()).toEqual(validateContent());
    // Validating a corrupted clone must not disturb the shipped bundle.
    expect(() => validateBundle({ ...clone(), species: { species: [] } })).toThrow();
    expect(validateContent().species.length).toBe(27);
  });

  it("strips documentation keys, so the parsed content matches the TypeScript surface", () => {
    const content = validateContent();
    expect(Object.keys(content.balance)).not.toContain("_comment");
    expect(Object.keys(content.species[0]!)).not.toContain("_source");
    expect(Object.keys(content.nodes[0]!)).not.toContain("_pyramid");
  });

  it("reports drift readably: file label, bullet list, issue count", () => {
    const bundle = clone();
    (bundle.palette as any).colorCount = 99;
    (bundle.gyms as any).gyms[0].source = "ghost-team-feature";
    try {
      validateBundle(bundle);
      throw new Error("expected ContentValidationError");
    } catch (e) {
      const err = e as ContentValidationError;
      expect(err).toBeInstanceOf(ContentValidationError);
      expect(err.message).toMatch(/TROPHIC content validation failed/);
      expect(err.message).toContain("•");
      expect(err.message).toMatch(/gyms\.json/);
      expect(err.issues.length).toBeGreaterThan(0);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("corrupted species.json is rejected", () => {
  it("missing required field", () => rejects((b) => delete b.species.species[0].baseStats.hp, /species\.json/));
  it("unknown extra field", () => rejects((b) => (b.species.species[0].nonsense = true), /species\.json/));
  it("bad enum value", () => rejects((b) => (b.species.species[0].role.A = "Overlord"), /species\.json/));
  it("base stat outside the balance.json band", () =>
    rejects((b) => (b.species.species[0].baseStats.hp = 5), /outside balance\.stats band/));
  it("movePool id that resolves to nothing", () =>
    rejects((b) => (b.species.species[0].movePool.type1 = "fireball"), /is not a move in moves\.json/));
  it("dietException that is not a line", () =>
    rejects((b) => (b.species.species[0].dietExceptions = ["dragon-line"]), /is not a species line/));
  it("habitat that is not a node biome", () =>
    rejects((b) => (b.species.species[3].habitat = ["Tundra"]), /is not a node biome/));
  it("duplicate line ids", () =>
    rejects((b) => (b.species.species[1].id = b.species.species[0].id), /duplicate line ids/));
  it("an Ancient stripped of its presence effect", () =>
    rejects((b) => {
      const v = b.species.species.find((s: any) => s.id === "vellsire-line");
      delete v.presenceEffect;
    }, /ancient line has no presenceEffect/));
  it("a non-Ancient handed a presence effect", () =>
    rejects((b) => (b.species.species[3].presenceEffect = "keystoneBreed"), /presenceEffect on a non-Ancient/));
  it("a fifth seasonal migrant (Hard Req 10)", () =>
    rejects((b) => (b.species.species[3].seasonalWindow = "spring"), /exactly 4 seasonal migrants/));
  it("ancient flag out of step with the role record", () =>
    rejects((b) => {
      const v = b.species.species.find((s: any) => s.id === "vellsire-line");
      v.role.A = "Apex";
    }, /ancient=true but AncientApex-in-all-ages=false/));
  it("an Ancient left ungated, so it would derive as an ordinary wild encounter", () =>
    rejects((b) => {
      const v = b.species.species.find((s: any) => s.id === "vellsire-line");
      v.habitat = ["Sanctum"];
    }, /ancient line is missing the "hidden" habitat tag/));
  it("an ordinary line handed the sign-chain gate tag", () =>
    rejects((b) => (b.species.species[3].habitat = ["Meadow", "hidden"]), /only Ancients may carry the "hidden" gate tag/));
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("corrupted moves.json is rejected", () => {
  it("a move removed from the 28-pool", () => rejects((b) => b.moves.moves.pop(), /28-move pool/));
  it("negative power", () => rejects((b) => (b.moves.moves[0].power = -10), /moves\.json/));
  it("unknown move kind", () => rejects((b) => (b.moves.moves[0].kind = "spell"), /moves\.json/));
  it("unknown effect kind", () =>
    rejects((b) => (b.moves.moves[2].effects = [{ kind: "instantWin" }]), /moves\.json/));
  it("a status outside the bible's four", () =>
    rejects((b) => (b.moves.moves[2].effects[0].status = "Petrify"), /moves\.json/));
  it("a type chart that contradicts its own dual", () =>
    rejects((b) => (b.moves.typeChart.Fire.strongVs = ["Poison", "Dark"]), /typeChart: Plant is weak vs Fire/));
  it("a type chart missing a type", () => rejects((b) => delete b.moves.typeChart.Dark, /moves\.json/));
  it("duplicate move ids", () => rejects((b) => (b.moves.moves[1].id = b.moves.moves[0].id), /duplicate move ids/));
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("corrupted gyms.json is rejected", () => {
  it("a roster slot pointing at no species", () =>
    rejects((b) => (b.gyms.gyms[0].slots[0].lineId = "kraken-line"), /is not a species line/));
  it("a level past the cap", () =>
    rejects((b) => (b.gyms.gyms[0].signature.level = 99), /exceeds balance\.xp\.levelCap/));
  it("a town that is not a node", () => rejects((b) => (b.gyms.gyms[2].town = "atlantis"), /is not a node/));
  it("a source outside fixed|ghost", () => rejects((b) => (b.gyms.gyms[0].source = "improvised"), /gyms\.json/));
  it("an age class outside J|A|E", () => rejects((b) => (b.gyms.gyms[0].slots[0].age = "Y"), /gyms\.json/));
  it("a malformed trait", () =>
    rejects((b) => (b.gyms.gyms[0].signature.traits = [{ name: "Thick Pelt" }]), /gyms\.json/));
  it("a roster trait that is not in the one trait pool", () =>
    rejects(
      (b) =>
        (b.gyms.gyms[0].signature.traits = [
          { id: "iron-will", name: "Iron Will", stat: "def", direction: "up", rarity: "common" },
        ]),
      /trait "iron-will" is not in balance\.traits\.pool/,
    ));
  it("a roster trait that disagrees with the pool entry of the same id", () =>
    rejects((b) => (b.gyms.gyms[0].signature.traits[0].stat = "atk"), /trait "thick-pelt" disagrees with balance\.traits\.pool/));
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("corrupted balance.json is rejected", () => {
  it("a missing tunable", () => rejects((b) => delete b.balance.types.predation, /balance\.json/));
  it("a whole missing group", () => rejects((b) => delete b.balance.ecosim, /balance\.json/));
  it("a string where a number belongs", () =>
    rejects((b) => (b.balance.stats.baseStatMin = "thirty"), /balance\.json/));
  it("a probability outside 0–1", () => rejects((b) => (b.balance.catch.clampMin = 5), /balance\.json/));
  it("a season order that is not four seasons", () =>
    rejects((b) => (b.balance.clock.seasonOrder = ["spring", "summer"]), /balance\.json/));
  it("an age record missing an age class", () =>
    rejects((b) => delete b.balance.age.multiplier.E, /balance\.json/));

  // Groups a lane would otherwise have had to hard-code (G11 / INV-4).
  it("the move-slot unlock levels missing a slot", () =>
    rejects((b) => delete b.balance.moves.slotUnlockLevels.utility, /balance\.json/));
  it("the whole moves group missing", () => rejects((b) => delete b.balance.moves, /balance\.json/));
  it("the trait pool missing", () => rejects((b) => delete b.balance.traits.pool, /balance\.json/));
  it("a malformed trait in the pool", () =>
    rejects((b) => (b.balance.traits.pool[0].rarity = "legendary"), /balance\.json/));
  it("duplicate trait ids in the pool", () =>
    rejects((b) => (b.balance.traits.pool[1].id = b.balance.traits.pool[0].id), /duplicate trait ids/));
  it("a trait pool with no rare trait, though Elders roll rare traits", () =>
    rejects((b) => (b.balance.traits.pool = b.balance.traits.pool.filter((t: any) => t.rarity !== "rare")), /no rare trait/));
  it("trait slots that cannot hold an inherited trait", () =>
    rejects((b) => (b.balance.traits.maxSlots = 1), /maxSlots is smaller than/));
  it("the medicine group missing", () => rejects((b) => delete b.balance.medicine, /balance\.json/));
  it("a salve that heals nothing measurable", () =>
    rejects((b) => (b.balance.medicine.salveHealFracMaxHp = "a lot"), /balance\.json/));
  it("a per-role demand record missing a role", () =>
    rejects((b) => delete b.balance.ecosim.demandPerIndividual.Scavenger, /balance\.json/));
  it("a demand record that is a bare number again", () =>
    rejects((b) => (b.balance.ecosim.demandPerIndividual = 1.0), /balance\.json/));
  it("a no-diet food factor that would starve producers anyway", () =>
    rejects((b) => (b.balance.ecosim.noDietFoodFactor = 0), /balance\.json/));
  it("a web role age class outside J|A|E", () =>
    rejects((b) => (b.balance.ecosim.webRoleAgeClass = "adult"), /balance\.json/));
  it("a sign-chain gate tag that is not a declared habitat sentinel", () =>
    rejects((b) => (b.balance.encounter.signChainGatedHabitatTag = "secret"), /balance\.json/));
  it("a foray with no encounter rolls in it", () =>
    rejects((b) => (b.balance.encounter.stepsPerForay = 0), /balance\.json/));
  it("the over-catch reference player missing", () =>
    rejects((b) => delete b.balance.harness.overcatch, /balance\.json/));
  it("an over-catch snare tier that is not a snare tier", () =>
    rejects((b) => (b.balance.harness.overcatch.snareTier = "titanium"), /balance\.json/));
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("corrupted palette.json is rejected", () => {
  it("colorCount out of step with the colors", () =>
    rejects((b) => (b.palette.colorCount = 99), /colorCount 99 does not match/));
  it("a hex that is not a hex", () => rejects((b) => (b.palette.colors[0].hex = "cornflower"), /palette\.json/));
  it("frozen as a string", () => rejects((b) => (b.palette.frozen = "yes"), /palette\.json/));
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("corrupted node JSON is rejected", () => {
  it("a population key that is not a species line", () =>
    rejects((b) => (node(b, "r1").populations["dragon-line"] = { count: 3, breedRate: 0.1, carryCap: 9 }), /is not a species line/));
  it("a species placed outside its habitat", () =>
    rejects((b) => (node(b, "hearthollow").populations["umbrat-line"] = { count: 3, breedRate: 0.1, carryCap: 9 }), /does not include biome "Meadow"/));
  it("count above carryCap", () => rejects((b) => (node(b, "r1").populations["nibbin-line"].count = 9999), /exceeds carryCap/));
  it("a fractional population count", () =>
    rejects((b) => (node(b, "r1").populations["nibbin-line"].count = 12.5), /nodes\/r1\.json/));
  it("asymmetric adjacency", () => rejects((b) => node(b, "r1").adjacency.push("sanctum"), /is not symmetric/));
  it("adjacency to a node that does not exist", () =>
    rejects((b) => node(b, "r1").adjacency.push("moonbase"), /adjacency "moonbase" is not a node/));
  it("floraStock outside the balance band", () => rejects((b) => (node(b, "r1").floraStock = 500), /outside balance\.ecosim flora band/));
  it("a spawn table smuggled in as data (G3)", () =>
    rejects((b) => (node(b, "r1").spawnTables = { "nibbin-line": 40 }), /nodes\/r1\.json[\s\S]*spawnTables/));
  it("a second table under any other name (G3)", () => {
    rejects((b) => (node(b, "r1").encounterWeights = { "nibbin-line": 40 }), /encounter weights are DERIVED/);
    rejects((b) => (node(b, "r2").baitLookup = { worm: "mirefin-line" }), /encounter weights are DERIVED/);
  });
  it("a second table under an INNOCENT name the /spawn|encounter|bait/ sweep cannot see (G3)", () => {
    // zNodeFile is a non-strict object, so zod strips an undeclared key instead of complaining —
    // which let a table named "weights" or "rollTable" ride along invisibly. The raw key sweep now
    // allow-lists the schema's own keys plus `_`-prefixed documentation, and rejects the rest.
    rejects((b) => (node(b, "r1").weights = { "nibbin-line": 40 }), /unknown key "weights"/);
    rejects((b) => (node(b, "r2").rollTable = [["mirefin-line", 3]]), /unknown key "rollTable"/);
    rejects((b) => (node(b, "r3").lootTable = { silk: 2 }), /unknown key "lootTable"/);
  });
  it("but keeps the `_`-prefixed documentation every node file carries", () => {
    const bundle = clone();
    (bundle.nodes[0] as any)._note = "documentation is allowed";
    expect(() => validateBundle(bundle)).not.toThrow();
  });
  it("a walkable flag that is not a boolean", () => rejects((b) => (node(b, "r1").walkable = "yes"), /nodes\/r1\.json/));
  it("a prop with an unknown kind", () =>
    rejects((b) => (node(b, "r1").props[0].kind = "obelisk"), /nodes\/r1\.json/));
  it("a year variant under an out-of-range year", () =>
    rejects((b) => (node(b, "r1").yearVariants = { "7": "assets/final/maps/r1-y7.png" }), /nodes\/r1\.json/));
  it("duplicate node ids", () => rejects((b) => (node(b, "r2").id = "r1"), /duplicate node ids/));
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("save schema (build-doc §7.8)", () => {
  const save = {
    version: 1,
    seed: 42,
    year: 1,
    tick: 0,
    currentNode: "hearthollow",
    party: [
      {
        uid: "c1",
        lineId: "cindril-line",
        age: "J",
        level: 5,
        caughtYear: 1,
        yearsRemaining: 3,
        traits: [],
        boons: [],
        projectedRetirementYear: 4,
      },
    ],
    box: [],
    money: 0,
    items: { "snare-base": 5 },
    questFlags: { firstSigns: false },
    nodeStates: { hearthollow: { populations: { "nibbin-line": { count: 26, breedRate: 0.25, carryCap: 60 } }, floraStock: 60, recentDeaths: 0 } },
    actionLog: [],
  };

  it("accepts a well-formed save", () => {
    expect(zSaveFile.parse(save)).toBeTruthy();
  });

  it("refuses an older save version (build-doc §7.8 migration policy)", () => {
    expect(() => zSaveFile.parse({ ...save, version: 0 })).toThrow();
  });

  it("refuses a party member missing its lifespan bookkeeping", () => {
    const broken = structuredClone(save) as any;
    delete broken.party[0].yearsRemaining;
    expect(() => zSaveFile.parse(broken)).toThrow();
  });
});
