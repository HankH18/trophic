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
  zSaveFileFor,
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

  // The dual check is `includes()`-based, and `includes()` is blind to multiplicity and to
  // reflexivity. Both of these were ACCEPTED: the chart stayed its own dual while carrying a
  // matchup that resolves a type against itself, or a strength counted twice.
  it("a type listed twice in the same strongVs", () =>
    rejects((b) => b.moves.typeChart.Fire.strongVs.push("Plant"), /Fire\.strongVs lists the same type more than once/));
  it("a type listed twice in the same weakVs", () =>
    rejects((b) => b.moves.typeChart.Fire.weakVs.push("Water"), /Fire\.weakVs lists the same type more than once/));
  it("a type strong against itself", () =>
    rejects((b) => {
      b.moves.typeChart.Fire.strongVs.push("Fire");
      b.moves.typeChart.Fire.weakVs.push("Fire"); // keep the dual satisfied, so ONLY reflexivity is under test
    }, /Fire is listed in its own strongVs/));
  it("a type both strong and weak against the same defender", () =>
    rejects((b) => {
      // Fire already beats Plant; make Plant beat Fire too, keeping both duals intact.
      b.moves.typeChart.Plant.strongVs.push("Fire");
      b.moves.typeChart.Fire.weakVs.push("Plant");
    }, /Fire is both strong and weak vs Plant/));
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

  /*
   * Hard Req 9 — "Gym rosters fixed per bible §7", counting the signature, at sizes 3/4/5/6/6/6
   * (gym 1 amended from 4 by DEVIATIONS D-A5-G1; the other five are the bible's).
   * tests/unit/transcription.test.ts caught every one of these against the SHIPPED tree, so the
   * repo was safe; validateBundle did not, and validateBundle is what runs at boot against whatever
   * content the build is actually carrying. A save loaded onto a five-slot gym 1 is the failure the
   * transcription test cannot be present for.
   */
  it("gym 1 shrunk below its Hard Req 9 roster size", () =>
    rejects((b) => b.gyms.gyms[0].slots.pop(), /gym maribel: roster of 2 .* Hard Req 9 fixes gym 1 at 3/));
  it("gym 1 grown past its Hard Req 9 roster size", () =>
    rejects(
      (b) => b.gyms.gyms[0].slots.push(structuredClone(b.gyms.gyms[0].slots[0])),
      /gym maribel: roster of 4 .* Hard Req 9 fixes gym 1 at 3/,
    ));
  it("gym 6 shrunk below its Hard Req 9 roster size", () =>
    rejects((b) => b.gyms.gyms[5].slots.pop(), /gym greaves: roster of 5 .* Hard Req 9 fixes gym 6 at 6/));
  it("a seventh gym leader", () =>
    rejects((b) => {
      const extra = structuredClone(b.gyms.gyms[5]);
      extra.id = "wick";
      b.gyms.gyms.push(extra);
    }, /expected 6 leaders \(Hard Req 9\), found 7/));
  it("a fifth gym leader removed", () =>
    rejects((b) => b.gyms.gyms.pop(), /expected 6 leaders \(Hard Req 9\), found 5/));
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

  /*
   * build-doc §7.6's derived identities. Before these existed the eleven `balance.map` keys were
   * eleven FREE integers: every one of them survived arbitrary mutation with the whole suite green,
   * and the two halves of "1024 native, 16px grid, 64×64 cells" could drift apart in silence. The
   * cases below are the ones that matter — each leaves a collision grid that does not cover the
   * painting it is sampled from, or a movement step that is not one cell.
   */
  it("a map native size that no longer divides into the declared cell count", () =>
    rejects((b) => (b.balance.map.mapNativePx = 512), /collisionCols is 64, but a 16px grid over a 512px map has 32 cells/));
  it("a collision column count that does not match the grid", () =>
    rejects((b) => (b.balance.map.collisionCols = 32), /collisionCols is 32, but a 16px grid over a 1024px map has 64 cells/));
  it("a collision row count that does not match the grid", () =>
    rejects((b) => (b.balance.map.collisionRows = 32), /collisionRows is 32, but a 16px grid over a 1024px map has 64 cells/));
  it("a cell size that no longer divides the map", () =>
    rejects((b) => (b.balance.map.collisionCellPx = 8), /collisionCols is 64, but a 8px grid over a 1024px map has 128 cells/));
  it("a tile step that is not one collision cell at render scale", () =>
    rejects((b) => (b.balance.map.tileStepPx = 16), /tileStepPx is 16, but one 16px collision cell rendered at 2× is 32 world px/));
  it("a render scale that puts the movement grid out of step with the mask", () =>
    rejects((b) => (b.balance.map.mapRenderScale = 3), /tileStepPx is 32, but one 16px collision cell rendered at 3× is 48 world px/));

  /*
   * build-doc §7.5 step 5 — the raids are DATA, and every id in them is a reference into another
   * file. A dangling one is a year turn that decrements nothing, silently.
   */
  it("a raid aimed at a node that does not exist", () =>
    rejects((b) => (b.balance.yearEvents.raids[0].nodeId = "moonbase"), /targets node "moonbase", which is not a node/));
  it("a raid aimed at a species line that does not exist", () =>
    rejects((b) => (b.balance.yearEvents.raids[0].targets[0].lineId = "dragon-line"), /targets "dragon-line", which is not a species line/));
  it("a raid scheduled past the end of the run", () =>
    rejects((b) => (b.balance.yearEvents.raids[0].year = 9), /fires in year 9, past the 6-year run/));
  it("two raids under the same id", () =>
    rejects((b) => b.balance.yearEvents.raids.push(structuredClone(b.balance.yearEvents.raids[0])), /duplicate yearEvents\.raids id/));
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("corrupted palette.json is rejected", () => {
  it("colorCount out of step with the colors", () =>
    rejects((b) => (b.palette.colorCount = 99), /colorCount 99 does not match/));
  it("a hex that is not a hex", () => rejects((b) => (b.palette.colors[0].hex = "cornflower"), /palette\.json/));
  it("frozen as a string", () => rejects((b) => (b.palette.frozen = "yes"), /palette\.json/));

  /*
   * The CONTRACT, not the colours. Gate B0 is "a value swap, not a restructure"
   * (docs/LANE-A-STATUS.md §4), so the hexes are legitimately in flux and are pinned NOWHERE. What
   * Lane B indexes against is the count and the positional ids — and that had no gate at all: a
   * `c00` → `z00` rename, a swatch removed, and a `frozen: false → true` claim about a gate that
   * had not run all survived the full suite.
   */
  it("a swatch id renamed away from its positional contract", () =>
    rejects((b) => (b.palette.colors[0].id = "z00"), /swatch 0 is "z00", expected "c00"/));
  it("swatches reordered, so an id no longer names its own position", () =>
    rejects((b) => {
      const [a, c] = [b.palette.colors[3], b.palette.colors[4]];
      b.palette.colors[3] = c;
      b.palette.colors[4] = a;
    }, /swatch 3 is "c04", expected "c03"/));
  it("a palette that is no longer 32 swatches", () =>
    rejects((b) => {
      b.palette.colors.pop();
      b.palette.colorCount = b.palette.colors.length; // keep the count honest: ONLY the size is under test
    }, /expected the 32-swatch palette \(build-doc §8\.4\), found 31/));
  it("a freeze claimed with no gate-B0 date behind it", () =>
    rejects((b) => (b.palette.frozenAt = null), /frozen=true but frozenAt=null/));
  it("a gate-B0 date with the freeze claim withdrawn", () =>
    rejects((b) => (b.palette.frozen = false), /frozen=false but frozenAt="/));
  it("a frozenAt that is not a date", () =>
    rejects((b) => (b.palette.frozenAt = "soon"), /palette\.json/));

  it("but the COLOURS are free — gate B0 is a value swap, and the hexes are pinned nowhere", () => {
    const bundle = clone();
    for (const c of (bundle.palette as any).colors) c.hex = "#123456";
    expect(() => validateBundle(bundle)).not.toThrow();
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * G3 across EVERY content file, not just data/nodes/.
 *
 * Hard Req 3 ("No second table may exist") and build-doc §8.3 ("no encounter-weight literal tables
 * anywhere") are unscoped, but the raw-key sweep used to run only inside `raw.nodes`. species.json,
 * moves.json, gyms.json and palette.json parse with `z.object`, which STRIPS undeclared keys in
 * silence — so every one of the tables below was ACCEPTED, with nothing to see in the error output
 * and nothing for the typechecker to complain about.
 * ────────────────────────────────────────────────────────────────────────── */
describe("a second table in any content file is rejected (G3 / Hard Req 3)", () => {
  it("a spawn table on species.json", () =>
    rejects((b) => (b.species.spawnTables = { "nibbin-line": 40 }), /species\.json: key "spawnTables" — encounter weights are DERIVED/));
  it("encounter weights on moves.json", () =>
    rejects((b) => (b.moves.encounterWeights = { singe: 3 }), /moves\.json: key "encounterWeights" — encounter weights are DERIVED/));
  it("a bait table on gyms.json", () =>
    rejects((b) => (b.gyms.baitTable = { worm: "mirefin-line" }), /gyms\.json: key "baitTable" — encounter weights are DERIVED/));
  it("a bait lookup on palette.json", () =>
    rejects((b) => (b.palette.baitLookup = { worm: "c00" }), /palette\.json: key "baitLookup" — encounter weights are DERIVED/));

  // The half the /spawn|encounter|bait/ regex cannot see: a table under an innocent name. Only the
  // allow-list catches these, and only because it runs on the RAW object.
  it("a diet-edge table on species.json — the one derivation §8.3 gives core/foodweb.ts alone", () =>
    rejects((b) => (b.species.dietEdges = { "fenmaw-line": ["mirefin-line"] }), /species\.json: unknown key "dietEdges"/));
  it("a second type chart on moves.json", () =>
    rejects((b) => (b.moves.typeChartMultipliers = { Fire: 1.5 }), /moves\.json: unknown key "typeChartMultipliers"/));
  it("a roll table on gyms.json", () =>
    rejects((b) => (b.gyms.rollTable = [["maribel", 3]]), /gyms\.json: unknown key "rollTable"/));
  it("a shadow group on balance.json", () =>
    rejects((b) => (b.balance.speciesWeights = { "nibbin-line": 40 }), /balance\.json: unknown key "speciesWeights"/));

  it("but balance.json's own `encounter` and `catch` groups are not second tables", () => {
    // The allow-list is consulted BEFORE the regex for exactly this reason: two legitimate
    // balance.json group names match /spawn|encounter|bait/ and must not be flagged.
    expect(() => validateContent()).not.toThrow();
    expect(Object.keys(validateContent().balance)).toEqual(expect.arrayContaining(["encounter", "catch"]));
  });

  it("and every content file keeps its `_`-prefixed documentation", () => {
    const bundle = clone();
    (bundle.species as any)._note = "documentation is allowed";
    (bundle.moves as any)._note = "documentation is allowed";
    (bundle.gyms as any)._note = "documentation is allowed";
    (bundle.palette as any)._note = "documentation is allowed";
    (bundle.balance as any)._note = "documentation is allowed";
    expect(() => validateBundle(bundle)).not.toThrow();
  });
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

  /*
   * A hand-edited or corrupted slot reaches core/save.ts `replay()` through this schema and nothing
   * else, so the party bound has to be here. A seven-member party used to parse cleanly and only
   * fail later, deep inside the reducer, as a battler with no slot to stand in. The bound is
   * balance.party.maxPartySize — read, never restated (G11 / INV-3).
   */
  const balance = validateContent().balance;
  const member = (uid: string) => ({ ...structuredClone(save.party[0]), uid });

  it("refuses a party larger than balance.party.maxPartySize", () => {
    const overfull = {
      ...save,
      party: Array.from({ length: balance.party.maxPartySize + 1 }, (_, i) => member(`c${i}`)),
    };
    expect(() => zSaveFile.parse(overfull)).toThrow();
    // …and the legal maximum still loads, or the bound would be off by one.
    expect(() =>
      zSaveFile.parse({ ...save, party: Array.from({ length: balance.party.maxPartySize }, (_, i) => member(`c${i}`)) }),
    ).not.toThrow();
  });

  it("refuses a box larger than balance.party.maxBoxSize", () => {
    const overfull = {
      ...save,
      box: Array.from({ length: balance.party.maxBoxSize + 1 }, (_, i) => member(`b${i}`)),
    };
    expect(() => zSaveFile.parse(overfull)).toThrow();
    expect(() =>
      zSaveFile.parse({ ...save, box: Array.from({ length: balance.party.maxBoxSize }, (_, i) => member(`b${i}`)) }),
    ).not.toThrow();
  });

  it("takes the bound from the balance it is handed, not from a copy of the number", () => {
    // zSaveFileFor is what a lane holding an overridden balance calls (INV-3: a retune is a
    // balance.json edit). Shrink the cap and the same save that passed above must now fail.
    const tight = zSaveFileFor({ ...balance.party, maxPartySize: 1 });
    expect(() => tight.parse(save)).not.toThrow(); // the fixture party is one member
    expect(() => tight.parse({ ...save, party: [member("c0"), member("c1")] })).toThrow();
  });

  /*
   * `actionLog[].action` stays permissive on purpose — pinning the GameAction union here would make
   * every lane that adds an action edit core/schemas.ts (INV-1/INV-2 spirit). What is NOT optional
   * is the discriminant every replayer switches on: an entry whose action is null, a number or `{}`
   * cannot be replayed by anything, so accepting it only moves the failure to replay time.
   */
  it("accepts an action shape core/ has never seen, as long as it is dispatchable", () => {
    expect(() =>
      zSaveFile.parse({
        ...save,
        actionLog: [{ seq: 0, year: 1, tick: 0, action: { t: "someLaterLanesAction", payload: { a: 1 } } }],
      }),
    ).not.toThrow();
  });

  it("refuses a replay tape entry that no replayer could dispatch", () => {
    for (const action of [null, 7, "travel", {}, { t: "" }, []]) {
      expect(() => zSaveFile.parse({ ...save, actionLog: [{ seq: 0, year: 1, tick: 0, action }] }), JSON.stringify(action)).toThrow();
    }
  });
});
