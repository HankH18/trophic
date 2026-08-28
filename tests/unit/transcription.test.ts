/**
 * tests/unit/transcription.test.ts — build-doc §15 lane A1 gate:
 * "transcription spot-check test vs bible tables".
 *
 * This file is the tripwire on guardrail G2 (do not invent species, moves, types, statuses, towns
 * or roster changes). It reads the shipped JSON off disk — NOT through core/schemas.ts — so a
 * schema that quietly widened cannot hide a content drift. Every expectation below is transcribed
 * from docs/content-bible.md; if the data and the bible disagree, this test fails and the fix is the
 * data, never a weakened assertion.
 *
 * The binding rule, learned the hard way: a COUNT is not an identity. Asserting "27 species" lets a
 * whole bible species be renamed or swapped for an invented one and stay green. So the bible's §4
 * roster, §3 move pool and §7 rosters are transcribed here as tables and compared element for
 * element — name, per-age type, per-age role, habitat — not summarised.
 *
 * The last two describe blocks are ecology gates rather than transcription: they hold the shipped
 * numbers to the properties build-doc §10.2 and §1 require of them (an Apex must be able to starve;
 * the year-1 over-catch beat must be reachable in real play). They are arithmetic over the shipped
 * files only — core/foodweb.ts remains the sole RUNTIME deriver of diet edges (build-doc §8.3).
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  AgeClass,
  Balance,
  GymLeader,
  MovesFile,
  NodeFile,
  Role,
  Season,
  SpeciesLine,
  TypeChart,
  TypeName,
} from "../../core/types";
import { AGE_CLASSES, ROLES, TYPE_NAMES } from "../../core/types";

const read = (rel: string): unknown => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8"));

const species = (read("data/species.json") as { species: SpeciesLine[] }).species;
const movesFile = read("data/moves.json") as MovesFile;
const gyms = (read("data/gyms.json") as { gyms: GymLeader[] }).gyms;
const balance = read("data/balance.json") as Balance;
const balanceRaw = readFileSync(new URL("../../data/balance.json", import.meta.url), "utf8");

const nodeFileNames = readdirSync(new URL("../../data/nodes", import.meta.url)).filter((f) => f.endsWith(".json")).sort();
const nodes = nodeFileNames.map((f) => read(`data/nodes/${f}`) as NodeFile);

function line(id: string): SpeciesLine {
  const s = species.find((x) => x.id === id);
  if (!s) throw new Error(`no species line "${id}" in data/species.json`);
  return s;
}
function move(id: string) {
  const m = movesFile.moves.find((x) => x.id === id);
  if (!m) throw new Error(`no move "${id}" in data/moves.json`);
  return m;
}
function gym(id: string): GymLeader {
  const g = gyms.find((x) => x.id === id);
  if (!g) throw new Error(`no gym leader "${id}" in data/gyms.json`);
  return g;
}
function node(id: string): NodeFile {
  const n = nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node "${id}" in data/nodes/`);
  return n;
}

/** Most lines carry one value across all three age forms; the metamorphic ones do not. */
const all3 = <T>(v: T): Record<AgeClass, T> => ({ J: v, A: v, E: v });

/* ──────────────────────────────────────────────────────────────────────────
 * bible §4 — the roster table, transcribed row for row.
 *
 * Columns: "# | Name | Type(s) | Role | Habitat". Bogling (row 9) is the juvenile of the Mirefin
 * line (row 11) and Gloomgrub is the juvenile of Gloomoth (row 16, prose), per the §4 metamorphic
 * paragraph — so 28 numbered rows become 27 lines. "Grazer (large)" (row 18) rides as sizeClass;
 * "starter" / "roaming" / "(hidden)" ride as habitat tags.
 * ────────────────────────────────────────────────────────────────────────── */
interface BibleRow {
  id: string;
  forms: Record<AgeClass, string>;
  dexIds: string[];
  types: Record<AgeClass, TypeName[]>;
  role: Record<AgeClass, Role>;
  habitat: string[];
  metamorphic: boolean;
  ancient: boolean;
  seasonalWindow?: Season;
  sizeClass?: "large";
  dietExceptions?: string[];
}

const BIBLE_ROSTER: BibleRow[] = [
  // rows 1–3: starters, full 3-stage metamorphic lines (§4 prose).
  {
    id: "cindril-line",
    forms: { J: "Cindril", A: "Vulkindle", E: "Pyrevane" },
    dexIds: ["Cindril", "Vulkindle", "Pyrevane"],
    types: all3(["Fire"]),
    role: all3("Mesopredator"),
    habitat: ["starter"],
    metamorphic: true,
    ancient: false,
  },
  {
    id: "puddlisk-line",
    forms: { J: "Puddlisk", A: "Rillisk", E: "Maelstrisk" },
    dexIds: ["Puddlisk", "Rillisk", "Maelstrisk"],
    types: all3(["Water"]),
    role: all3("Mesopredator"),
    habitat: ["starter"],
    metamorphic: true,
    ancient: false,
  },
  {
    id: "thornlet-line",
    forms: { J: "Thornlet", A: "Bramblore", E: "Thornwald" },
    dexIds: ["Thornlet", "Bramblore", "Thornwald"],
    types: all3(["Plant"]),
    role: all3("Mesopredator"),
    habitat: ["starter"],
    metamorphic: true,
    ancient: false,
  },
  // row 4 — Nibbin | Beast | Grazer | Meadow
  {
    id: "nibbin-line",
    forms: all3("Nibbin"),
    dexIds: ["Nibbin"],
    types: all3(["Beast"]),
    role: all3("Grazer"),
    habitat: ["Meadow"],
    metamorphic: false,
    ancient: false,
  },
  // row 5 — Pollywisp | Wind/Plant | Grazer | Meadow (spring migrant, §5)
  {
    id: "pollywisp-line",
    forms: all3("Pollywisp"),
    dexIds: ["Pollywisp"],
    types: all3(["Wind", "Plant"]),
    role: all3("Grazer"),
    habitat: ["Meadow"],
    metamorphic: false,
    ancient: false,
    seasonalWindow: "spring",
  },
  // row 6 — Bramblehog | Plant | Grazer | Meadow
  {
    id: "bramblehog-line",
    forms: all3("Bramblehog"),
    dexIds: ["Bramblehog"],
    types: all3(["Plant"]),
    role: all3("Grazer"),
    habitat: ["Meadow"],
    metamorphic: false,
    ancient: false,
  },
  // row 7 — Skir | Wind | Mesopredator | Meadow
  {
    id: "skir-line",
    forms: all3("Skir"),
    dexIds: ["Skir"],
    types: all3(["Wind"]),
    role: all3("Mesopredator"),
    habitat: ["Meadow"],
    metamorphic: false,
    ancient: false,
  },
  // row 8 — Loamunder | Earth/Plant | Producer | Meadow
  {
    id: "loamunder-line",
    forms: all3("Loamunder"),
    dexIds: ["Loamunder"],
    types: all3(["Earth", "Plant"]),
    role: all3("Producer"),
    habitat: ["Meadow"],
    metamorphic: false,
    ancient: false,
  },
  // rows 9 + 11 — Bogling (Water, Grazer, Marsh) → Mirefin (Water/Poison, Mesopredator, Marsh)
  {
    id: "mirefin-line",
    forms: { J: "Bogling", A: "Mirefin", E: "Mirefin" },
    dexIds: ["Bogling", "Mirefin"],
    types: { J: ["Water"], A: ["Water", "Poison"], E: ["Water", "Poison"] },
    role: { J: "Grazer", A: "Mesopredator", E: "Mesopredator" },
    habitat: ["Marsh"],
    metamorphic: true,
    ancient: false,
  },
  // row 10 — Reedrick | Plant/Wind | Grazer | Marsh (summer migrant, §5)
  {
    id: "reedrick-line",
    forms: all3("Reedrick"),
    dexIds: ["Reedrick"],
    types: all3(["Plant", "Wind"]),
    role: all3("Grazer"),
    habitat: ["Marsh"],
    metamorphic: false,
    ancient: false,
    seasonalWindow: "summer",
  },
  // row 12 — Fenmaw | Water | Apex | Marsh (+ §5 exception: also eats Reedrick)
  {
    id: "fenmaw-line",
    forms: all3("Fenmaw"),
    dexIds: ["Fenmaw"],
    types: all3(["Water"]),
    role: all3("Apex"),
    habitat: ["Marsh"],
    metamorphic: false,
    ancient: false,
    dietExceptions: ["reedrick-line"],
  },
  // row 13 — Sporantle | Poison/Plant | Producer | Marsh/Forest
  {
    id: "sporantle-line",
    forms: all3("Sporantle"),
    dexIds: ["Sporantle"],
    types: all3(["Poison", "Plant"]),
    role: all3("Producer"),
    habitat: ["Marsh", "Forest"],
    metamorphic: false,
    ancient: false,
  },
  // row 14 — Mosslet | Plant | Grazer | Forest
  {
    id: "mosslet-line",
    forms: all3("Mosslet"),
    dexIds: ["Mosslet"],
    types: all3(["Plant"]),
    role: all3("Grazer"),
    habitat: ["Forest"],
    metamorphic: false,
    ancient: false,
  },
  // row 15 — Webvern | Poison | Mesopredator | Forest
  {
    id: "webvern-line",
    forms: all3("Webvern"),
    dexIds: ["Webvern"],
    types: all3(["Poison"]),
    role: all3("Mesopredator"),
    habitat: ["Forest"],
    metamorphic: false,
    ancient: false,
  },
  // row 16 — Gloomoth | Dark/Wind | Grazer | Forest; juvenile Gloomgrub is Poison/Plant (autumn migrant)
  {
    id: "gloomoth-line",
    forms: { J: "Gloomgrub", A: "Gloomoth", E: "Gloomoth" },
    dexIds: ["Gloomgrub", "Gloomoth"],
    types: { J: ["Poison", "Plant"], A: ["Dark", "Wind"], E: ["Dark", "Wind"] },
    role: all3("Grazer"),
    habitat: ["Forest"],
    metamorphic: true,
    ancient: false,
    seasonalWindow: "autumn",
  },
  // row 17 — Duskstalk | Dark | Apex | Forest
  {
    id: "duskstalk-line",
    forms: all3("Duskstalk"),
    dexIds: ["Duskstalk"],
    types: all3(["Dark"]),
    role: all3("Apex"),
    habitat: ["Forest"],
    metamorphic: false,
    ancient: false,
  },
  // row 18 — Barkhide | Plant/Earth | Grazer (large) | Forest
  {
    id: "barkhide-line",
    forms: all3("Barkhide"),
    dexIds: ["Barkhide"],
    types: all3(["Plant", "Earth"]),
    role: all3("Grazer"),
    habitat: ["Forest"],
    metamorphic: false,
    ancient: false,
    sizeClass: "large",
  },
  // row 19 — Ashvole | Fire | Grazer | Steppe
  {
    id: "ashvole-line",
    forms: all3("Ashvole"),
    dexIds: ["Ashvole"],
    types: all3(["Fire"]),
    role: all3("Grazer"),
    habitat: ["Steppe"],
    metamorphic: false,
    ancient: false,
  },
  // row 20 — Pyrelisk | Fire/Earth | Mesopredator | Steppe
  {
    id: "pyrelisk-line",
    forms: all3("Pyrelisk"),
    dexIds: ["Pyrelisk"],
    types: all3(["Fire", "Earth"]),
    role: all3("Mesopredator"),
    habitat: ["Steppe"],
    metamorphic: false,
    ancient: false,
  },
  // row 21 — Cragmar | Earth | Grazer | Steppe
  {
    id: "cragmar-line",
    forms: all3("Cragmar"),
    dexIds: ["Cragmar"],
    types: all3(["Earth"]),
    role: all3("Grazer"),
    habitat: ["Steppe"],
    metamorphic: false,
    ancient: false,
  },
  // row 22 — Stonewing | Earth/Wind | Apex | Steppe
  {
    id: "stonewing-line",
    forms: all3("Stonewing"),
    dexIds: ["Stonewing"],
    types: all3(["Earth", "Wind"]),
    role: all3("Apex"),
    habitat: ["Steppe"],
    metamorphic: false,
    ancient: false,
  },
  // row 23 — Carricrow | Dark/Wind | Scavenger | roaming
  {
    id: "carricrow-line",
    forms: all3("Carricrow"),
    dexIds: ["Carricrow"],
    types: all3(["Dark", "Wind"]),
    role: all3("Scavenger"),
    habitat: ["roaming"],
    metamorphic: false,
    ancient: false,
  },
  // row 24 — Umbrat | Dark | Grazer | Vale
  {
    id: "umbrat-line",
    forms: all3("Umbrat"),
    dexIds: ["Umbrat"],
    types: all3(["Dark"]),
    role: all3("Grazer"),
    habitat: ["Vale"],
    metamorphic: false,
    ancient: false,
  },
  // row 25 — Wispurr | Dark/Beast | Mesopredator | Vale (winter migrant, §5)
  {
    id: "wispurr-line",
    forms: all3("Wispurr"),
    dexIds: ["Wispurr"],
    types: all3(["Dark", "Beast"]),
    role: all3("Mesopredator"),
    habitat: ["Vale"],
    metamorphic: false,
    ancient: false,
    seasonalWindow: "winter",
  },
  // row 26 — Vellsire | Beast/Dark | Ancient Apex | Sanctum. The "hidden" tag is added to the
  // bible's habitat: it is what gates the Ancient behind its sign chain, and without it Vellsire
  // derives as an ordinary wild encounter worth a third of the sanctum's weight.
  {
    id: "vellsire-line",
    forms: all3("Vellsire"),
    dexIds: ["Vellsire"],
    types: all3(["Beast", "Dark"]),
    role: all3("AncientApex"),
    habitat: ["Sanctum", "hidden"],
    metamorphic: false,
    ancient: true,
  },
  // row 27 — Kilnback | Fire/Earth | Ancient Apex | Steppe (hidden)
  {
    id: "kilnback-line",
    forms: all3("Kilnback"),
    dexIds: ["Kilnback"],
    types: all3(["Fire", "Earth"]),
    role: all3("AncientApex"),
    habitat: ["Steppe", "hidden"],
    metamorphic: false,
    ancient: true,
  },
  // row 28 — Undermere | Water/Dark | Ancient Apex | Marsh (hidden)
  {
    id: "undermere-line",
    forms: all3("Undermere"),
    dexIds: ["Undermere"],
    types: all3(["Water", "Dark"]),
    role: all3("AncientApex"),
    habitat: ["Marsh", "hidden"],
    metamorphic: false,
    ancient: true,
  },
];

/* ────────────────────────────────────────────────────────────────────────── */
describe("species roster — bible §4", () => {
  it("ships exactly the bible's lines, in the bible's order, under the bible's names", () => {
    // Identity, not cardinality: renaming a line, dropping one, or slipping in an invented one
    // fails here. bible §4 asset count: "27 lines … + 35 named dex identities".
    expect(species.map((s) => s.id)).toEqual(BIBLE_ROSTER.map((r) => r.id));
    expect(species.length).toBe(27);
    expect(species.reduce((n, s) => n + s.dexIds.length, 0)).toBe(35);
  });

  it("transcribes every line's form names, dex identities, per-age types, role and habitat", () => {
    for (const row of BIBLE_ROSTER) {
      const s = line(row.id);
      expect(s.formNames, `${row.id} formNames`).toEqual(row.forms);
      expect(s.dexIds, `${row.id} dexIds`).toEqual(row.dexIds);
      expect(s.types, `${row.id} types`).toEqual(row.types);
      expect(s.role, `${row.id} role`).toEqual(row.role);
      expect(s.habitat, `${row.id} habitat`).toEqual(row.habitat);
      expect(s.metamorphic, `${row.id} metamorphic`).toBe(row.metamorphic);
      expect(s.ancient, `${row.id} ancient`).toBe(row.ancient);
      expect(s.seasonalWindow, `${row.id} seasonalWindow`).toBe(row.seasonalWindow);
      expect(s.sizeClass, `${row.id} sizeClass`).toBe(row.sizeClass);
      expect(s.dietExceptions, `${row.id} dietExceptions`).toEqual(row.dietExceptions);
    }
  });

  it("names every dex identity after a form the line actually has", () => {
    for (const s of species) {
      const forms = new Set(AGE_CLASSES.map((a) => s.formNames[a]));
      expect([...s.dexIds].sort(), `${s.id}`).toEqual([...forms].sort());
    }
  });

  it("has exactly four seasonal migrants, one per season (bible §5, Hard Req 10)", () => {
    const migrants = species.filter((s) => s.seasonalWindow);
    expect(migrants.map((s) => s.id).sort()).toEqual(
      ["gloomoth-line", "pollywisp-line", "reedrick-line", "wispurr-line"].sort(),
    );
    expect(line("pollywisp-line").seasonalWindow).toBe("spring");
    expect(line("reedrick-line").seasonalWindow).toBe("summer");
    expect(line("gloomoth-line").seasonalWindow).toBe("autumn");
    expect(line("wispurr-line").seasonalWindow).toBe("winter");
    expect(migrants.length).toBe(4);
  });

  it("marks exactly the five metamorphic lines (bible §4: 3 starters + 2 wild)", () => {
    expect(species.filter((s) => s.metamorphic).map((s) => s.id).sort()).toEqual(
      ["cindril-line", "gloomoth-line", "mirefin-line", "puddlisk-line", "thornlet-line"].sort(),
    );
    // The two wild metamorphic lines are the ONLY lines whose type or role shifts with age.
    const shifts = species.filter(
      (s) => new Set(AGE_CLASSES.map((a) => JSON.stringify(s.types[a]))).size > 1 || new Set(AGE_CLASSES.map((a) => s.role[a])).size > 1,
    );
    expect(shifts.map((s) => s.id).sort()).toEqual(["gloomoth-line", "mirefin-line"]);
    // Bogling and Gloomgrub are age forms, never lines of their own.
    expect(species.some((s) => s.id === "bogling-line")).toBe(false);
    expect(species.some((s) => s.id === "gloomgrub-line")).toBe(false);
  });

  it("ships exactly three Ancients, gated, each with its presence effect (bible §4)", () => {
    const ancients = species.filter((s) => s.ancient);
    expect(ancients.map((s) => s.id)).toEqual(["vellsire-line", "kilnback-line", "undermere-line"]);
    for (const a of ancients) {
      expect(new Set(AGE_CLASSES.map((c) => a.formNames[c])).size).toBe(1); // one form each
      expect(a.metamorphic).toBe(false);
      // bible §4: "Very hard catches, gated behind rare sign-card chains." Without the gate tag an
      // Ancient derives as an ordinary wild encounter off its node count (build-doc §7.2).
      expect(a.habitat, `${a.id} sign-chain gate`).toContain(balance.encounter.signChainGatedHabitatTag);
    }
    expect(line("vellsire-line").presenceEffect).toBe("keystoneBreed");
    expect(line("kilnback-line").presenceEffect).toBe("ventWarmth");
    expect(line("undermere-line").presenceEffect).toBe("waterTable");
    // No non-Ancient may carry a presence effect or the gate tag.
    expect(species.filter((s) => s.presenceEffect && !s.ancient)).toEqual([]);
    expect(species.filter((s) => s.habitat.includes(balance.encounter.signChainGatedHabitatTag)).map((s) => s.id)).toEqual([
      "vellsire-line",
      "kilnback-line",
      "undermere-line",
    ]);
  });

  it("carries the bible's diet exception and roaming habitat", () => {
    // bible §5 exceptions table: "Fenmaw also eats Reedrick; Carricrow roams all habitats".
    expect(line("fenmaw-line").dietExceptions).toEqual(["reedrick-line"]);
    expect(line("carricrow-line").habitat).toEqual(["roaming"]);
    expect(species.filter((s) => s.dietExceptions).map((s) => s.id)).toEqual(["fenmaw-line"]);
    // bible §4 row 18: Barkhide is the sole "Grazer (large)" — the size Apex predation keys on.
    expect(line("barkhide-line").sizeClass).toBe("large");
    expect(species.filter((s) => s.sizeClass).map((s) => s.id)).toEqual(["barkhide-line"]);
  });

  it("assigns base stats by the published rule, not by taste (species.json _statRule)", () => {
    // Same class of hole as the gym-level one: a band plus a total lets any individual stat drift.
    // The rule species.json publishes is: role template (by ADULT role, with a separate template
    // for the one large Grazer) then a zero-sum ±5 tilt on the ADULT primary type.
    const TEMPLATE: Record<string, [number, number, number, number, number]> = {
      // RE-SPENT under T-11 (Hank: "re-spend the Producer template only"): a zero-sum single-axis
      // transfer of 20 points from Instinct to Attack, 85/40/80/35/60 → 85/60/80/35/40. The total
      // is still exactly 300 and the test below still pins it. The arithmetic behind the choice —
      // including why 10 of 24 lines sit outside the round-robin band no matter how the points are
      // spent — is recorded in data/species.json `_bandArithmetic`, beside the templates.
      Producer: [85, 60, 80, 35, 40],
      Grazer: [80, 55, 70, 45, 50],
      "Grazer(large)": [90, 65, 80, 35, 30],
      Mesopredator: [60, 70, 50, 80, 40],
      Apex: [75, 90, 65, 40, 30],
      Scavenger: [55, 60, 45, 75, 65],
      AncientApex: [95, 95, 85, 70, 55],
    };
    const TILT: Record<TypeName, [number, number]> = {
      Beast: [1, 4], // +atk / −ins
      Fire: [3, 2], // +spd / −def
      Water: [0, 3], // +hp  / −spd
      Plant: [2, 1], // +def / −atk
      Earth: [2, 3], // +def / −spd
      Wind: [3, 0], // +spd / −hp
      Poison: [4, 2], // +ins / −def
      Dark: [4, 0], // +ins / −hp
    };
    const KEYS = ["hp", "atk", "def", "spd", "ins"] as const;

    for (const s of species) {
      const adultRole = s.role.A;
      const key = adultRole === "Grazer" && s.sizeClass === "large" ? "Grazer(large)" : adultRole;
      const expected = [...TEMPLATE[key]!];
      const primary = s.types.A[0]!;
      const [up, down] = TILT[primary];
      expected[up]! += 5;
      expected[down]! -= 5;
      expect(KEYS.map((k) => s.baseStats[k]), `${s.id} baseStats (${key} + ${primary} tilt)`).toEqual(expected);
    }
  });

  it("keeps every base stat inside bible §2's 30–100 band, with banded totals", () => {
    const totals = new Set<number>();
    for (const s of species) {
      for (const [k, v] of Object.entries(s.baseStats)) {
        expect(Number.isInteger(v), `${s.id}.${k}`).toBe(true);
        expect(v, `${s.id}.${k}`).toBeGreaterThanOrEqual(30);
        expect(v, `${s.id}.${k}`).toBeLessThanOrEqual(100);
      }
      totals.add(Object.values(s.baseStats).reduce((a, b) => a + b, 0));
    }
    // Aging lines all total 300; the three Ancients all total 400. Nothing is strictly dominant.
    expect([...totals].sort((a, b) => a - b)).toEqual([300, 400]);
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * bible §3 — the 28-move pool, transcribed by id AND display name.
 * Four names are the bible's own (Singe/Pyre, Douse/Riptide) plus the 5 role and 7 utility names it
 * lists; the twelve remaining type-move names are coined and are pinned here too,
 * because a "coined" name that drifts silently is still a content change nobody approved.
 *
 * Three utility names below are the AMENDED bible: Harden, Screech and Snarl were
 * real Pokémon moves, so §3 now reads Bristle / Shriek / Daunt, and the "Roost" alias on
 * burrow-roost is gone. This list still transcribes the bible verbatim — the bible moved first.
 * The `id`s deliberately did NOT move: they are opaque keys no player ever sees.
 *
 * One coined type name below is the Q2 IP rename: the Plant heavy move, id `overgrow`,
 * now displays as "Thicket". "Overgrow" is a real Pokémon ABILITY (#65) — the one every Grass
 * starter line carries — and TROPHIC has a Plant starter line, so the collision landed in the
 * same slot of the same design. Thicket is Bramble scaled up: one thorny stem to a whole stand.
 * The id did not move here either — `data/species.json` movePool, the gym-01 fixture and
 * `tests/unit/battle.test.ts` all key on the string `overgrow`.
 * ────────────────────────────────────────────────────────────────────────── */
const BIBLE_MOVE_NAMES: Array<[string, string]> = [
  ["gnaw", "Gnaw"],
  ["maul", "Maul"],
  ["singe", "Singe"],
  ["pyre", "Pyre"],
  ["dous", "Douse"],
  ["riptide", "Riptide"],
  ["bramble", "Bramble"],
  ["overgrow", "Thicket"],
  ["sunder", "Sunder"],
  ["upheave", "Upheave"],
  ["harry", "Harry"],
  ["squall", "Squall"],
  ["blight", "Blight"],
  ["miasma", "Miasma"],
  ["shade", "Shade"],
  ["eclipse", "Eclipse"],
  ["regrow", "Regrow"],
  ["trample", "Trample"],
  ["ambush", "Ambush"],
  ["terrify", "Terrify"],
  ["scrounge", "Scrounge"],
  ["harden", "Bristle"],
  ["quicken", "Quicken"],
  ["screech", "Shriek"],
  ["focus", "Focus"],
  ["snarl", "Daunt"],
  ["burrow-roost", "Burrow"],
  ["lure", "Lure"],
];

/** Every one of these is a real Pokémon move, and Harden and Screech were our
 *  name AND our exact effect. They were renamed out of the pool. This
 *  list is the thing that must never come back — as a name, or as the `altName` alias Roost was. */
const RENAMED_AWAY_POKEMON_MOVE_NAMES = ["Harden", "Screech", "Snarl", "Roost"];

/** Second banned batch: real Pokémon ABILITY names. "Overgrow" was our Plant heavy
 *  MOVE and "Keen Eye" / "Strong Jaw" were TRAIT names, so one banned list has to be checked
 *  against both namespaces — a name evicted from `data/moves.json` must not reappear in
 *  `data/balance.json`'s trait pool, or the other way round. */
const RENAMED_AWAY_POKEMON_ABILITY_NAMES = ["Overgrow", "Keen Eye", "Strong Jaw"];

/** bible §3 names these verbatim; the rest of the 16 type moves are coined. */
const BIBLE_NAMED_MOVES = [
  "singe", "pyre", "dous", "riptide",
  "regrow", "trample", "ambush", "terrify", "scrounge",
  "harden", "quicken", "screech", "focus", "snarl", "burrow-roost", "lure",
];

/** bible §3: "one light (~40 power, secondary effect) + one heavy (~70 power) per type" — the light
 *  move's secondary fires at the rate the bible states for Singe and Douse: 20%. */
const LIGHT_MOVE_SECONDARY_CHANCE = 0.2;

describe("move pool — bible §3", () => {
  it("is exactly 28 moves — the bible's ids, in order, under the bible's names", () => {
    expect(movesFile.moves.map((m) => m.id)).toEqual(BIBLE_MOVE_NAMES.map(([id]) => id));
    expect(movesFile.moves.map((m) => m.name)).toEqual(BIBLE_MOVE_NAMES.map(([, name]) => name));
    expect(movesFile.moves.filter((m) => m.kind === "type").length).toBe(16);
    expect(movesFile.moves.filter((m) => m.kind === "role").length).toBe(5);
    expect(movesFile.moves.filter((m) => m.kind === "utility").length).toBe(7);
  });

  it("gives every type one light (40, 20% secondary) and one heavy (70) move", () => {
    for (const t of TYPE_NAMES) {
      const ofType = movesFile.moves.filter((m) => m.kind === "type" && m.type === t);
      expect(ofType.length, t).toBe(2);
      const light = ofType.find((m) => m.weight === "light");
      const heavy = ofType.find((m) => m.weight === "heavy");
      expect(light?.power, `${t} light`).toBe(40);
      expect(heavy?.power, `${t} heavy`).toBe(70);
      expect(heavy?.effects, `${t} heavy`).toEqual([]);
      // Every light move carries exactly one secondary at the bible's stated rate — not just the
      // two the bible spells out. A silent 0.9 on one type is a balance change nobody approved.
      expect(light?.effects.length, `${t} light secondary effect`).toBe(1);
      const effect = light?.effects[0];
      const chance = effect && "chance" in effect ? effect.chance : undefined;
      expect(chance, `${t} light secondary chance`).toBe(LIGHT_MOVE_SECONDARY_CHANCE);
    }
  });

  it("carries the named bible moves with their stated numbers", () => {
    // bible §3: "Fire: Singe (40, 20% Burn) / Pyre (70). Water: Douse (40, 20% Soak) / Riptide (70)."
    expect(move("singe").name).toBe("Singe");
    expect(move("singe").power).toBe(40);
    expect(move("singe").effects).toEqual([{ kind: "inflictStatus", status: "Burn", chance: 0.2 }]);
    expect(move("pyre").name).toBe("Pyre");
    expect(move("pyre").power).toBe(70);
    expect(move("dous").name).toBe("Douse");
    expect(move("dous").power).toBe(40);
    expect(move("dous").effects).toEqual([{ kind: "inflictStatus", status: "Soak", chance: 0.2 }]);
    expect(move("riptide").name).toBe("Riptide");
    expect(move("riptide").power).toBe(70);

    // bible §3 role moves (5).
    expect(move("regrow").role).toBe("Producer");
    expect(move("regrow").effects).toEqual([{ kind: "heal", mode: "fracMaxHp", amount: 0.3 }]);
    expect(move("trample").role).toBe("Grazer");
    expect(move("trample").power).toBe(50);
    expect(move("trample").effects).toEqual([{ kind: "bonusVsRole", role: "Producer", bonusPower: 25 }]);
    expect(move("ambush").role).toBe("Mesopredator");
    expect(move("ambush").power).toBe(60);
    expect(move("ambush").effects).toEqual([{ kind: "priority", scope: "entryTurn" }]);
    expect(move("terrify").role).toBe("Apex");
    expect(move("terrify").effects[0]).toMatchObject({ kind: "statMod", target: "enemy", stat: "atk", direction: "down", turns: 2 });
    expect(move("scrounge").role).toBe("Scavenger");
    expect(move("scrounge").power).toBe(40);
    expect(move("scrounge").effects).toEqual([{ kind: "heal", mode: "damageDealt" }]);
    // The five role moves cover five of the six roles; AncientApex fields Terrify.
    expect(movesFile.moves.filter((m) => m.kind === "role").map((m) => m.role)).toEqual([
      "Producer", "Grazer", "Mesopredator", "Apex", "Scavenger",
    ]);

    // bible §3 utility (7).
    expect(move("harden").effects[0]).toMatchObject({ target: "self", stat: "def", direction: "up" });
    expect(move("quicken").effects[0]).toMatchObject({ target: "self", stat: "spd", direction: "up" });
    expect(move("screech").effects[0]).toMatchObject({ target: "enemy", stat: "def", direction: "down" });
    expect(move("focus").effects[0]).toMatchObject({ target: "self", stat: "ins", direction: "up" });
    expect(move("snarl").effects[0]).toMatchObject({ target: "enemy", stat: "atk", direction: "down" });
    expect(move("burrow-roost").effects[0]).toMatchObject({ kind: "evade", skipTurn: true });
    // bible §3 used to name it "Burrow/Roost", which shipped as name + altName. Roost is a real
    // Pokémon move (Flying/Status, recovers half max HP), so the amended §3 names it "Burrow" alone
    // and the alias is deleted, not renamed. Asserting ABSENCE is the point: `altName` is
    // still optional in core/schemas.ts, so nothing but this stops it drifting back in.
    expect(move("burrow-roost").altName).toBeUndefined();
    expect(move("lure").effects).toEqual([{ kind: "catchOdds", multiplierKey: "lureMult" }]);

    // Every named bible move carries the name bible §3 gives it and is never flagged coined. The
    // three IP renames are still bible names — §3 was amended first, so Bristle / Shriek /
    // Daunt are transcribed, not coined, and `coined` must stay off them.
    for (const id of BIBLE_NAMED_MOVES) {
      expect(move(id).coined, `${id} is a bible name, not a coined one`).toBeUndefined();
    }
    // The twelve coined type-move names are flagged for the G15 IP sweep. These
    // are IDS: `overgrow` stays flagged coined after the Q2 rename, because "Thicket" is still an
    // agent coinage — bible §3 never named the Plant pair. Renaming it did not launder it.
    expect(movesFile.moves.filter((m) => m.coined).map((m) => m.id)).toEqual([
      "gnaw", "maul", "bramble", "overgrow", "sunder", "upheave", "harry", "squall", "blight", "miasma", "shade", "eclipse",
    ]);
  });

  it("statuses used by moves are exactly the bible's four", () => {
    const used = new Set(
      movesFile.moves.flatMap((m) => m.effects.filter((e) => e.kind === "inflictStatus").map((e) => e.status)),
    );
    expect([...used].sort()).toEqual(["Burn", "Daze", "Soak", "Toxin"]);
  });

  // G15. The four banned move collisions are gone and must not return by any route:
  // not as a `name`, not as the `altName` alias that carried Roost, and not on a move added later.
  it("carries no name that is a real Pokémon move — the four RED collisions are gone", () => {
    const surfaced = movesFile.moves.flatMap((m) => [m.name, m.altName].filter((n): n is string => !!n));
    for (const banned of RENAMED_AWAY_POKEMON_MOVE_NAMES) {
      expect(surfaced, `"${banned}" is a real Pokémon move — G15 bans it; rename the display name only, ids stay put`).not.toContain(banned);
    }
    // …and the replacements are actually in place, so this test cannot pass by the pool being empty.
    expect(surfaced).toContain("Bristle");
    expect(surfaced).toContain("Shriek");
    expect(surfaced).toContain("Daunt");
    expect(surfaced).toContain("Burrow");
    expect(surfaced.length).toBe(28); // 28 names, 0 aliases — every alias is gone, not just Roost's
  });

  // G15, Q2. "Overgrow" is a real Pokémon ABILITY, not a move — the signature
  // ability of every Grass starter line, and TROPHIC has a Plant starter line, so it landed in the
  // same slot of the same design. It was the Plant HEAVY move and is now "Thicket".
  it("carries no name that is a real Pokémon ability either — Overgrow is gone", () => {
    const surfaced = movesFile.moves.flatMap((m) => [m.name, m.altName].filter((n): n is string => !!n));
    for (const banned of RENAMED_AWAY_POKEMON_ABILITY_NAMES) {
      expect(surfaced, `"${banned}" is a real Pokémon ability — G15 bans it; rename the display name only, ids stay put`).not.toContain(banned);
    }
    // …and the replacement is in place, so this cannot pass by the Plant heavy slot going missing.
    const plantHeavy = movesFile.moves.find((m) => m.kind === "type" && m.type === "Plant" && m.weight === "heavy");
    expect(plantHeavy?.name).toBe("Thicket");
    expect(plantHeavy?.id).toBe("overgrow"); // the ID did not move
  });

  // The rename changed NAMES only. Effects are content and G2 protects them, so the seven utility
  // moves must still do exactly what bible §3's parentheses say they do, under their new names.
  it("changed names only — every renamed utility move keeps its bible effect and text", () => {
    expect(move("harden").name).toBe("Bristle");
    expect(move("harden").text).toBe("+Defense");
    expect(move("harden").power).toBe(0);
    expect(move("screech").name).toBe("Shriek");
    expect(move("screech").text).toBe("−enemy Defense");
    expect(move("screech").power).toBe(0);
    expect(move("snarl").name).toBe("Daunt");
    expect(move("snarl").text).toBe("−enemy Attack");
    expect(move("snarl").power).toBe(0);
    expect(move("burrow-roost").name).toBe("Burrow");
    expect(move("burrow-roost").text).toBe("skip turn, +evasion");
    // All three renamed moves still key their magnitude off balance.json, never a literal (G11).
    for (const id of ["harden", "screech", "snarl"]) {
      expect(move(id).effects[0]).toMatchObject({ magnitudeKey: "utilityStatMod" });
    }
    // Same rule for the Q2 rename: "Overgrow" → "Thicket" moved the display name and nothing else.
    // The Plant heavy move is still 70 power with no effects, exactly as bible §3's pattern says.
    expect(move("overgrow").name).toBe("Thicket");
    expect(move("overgrow").type).toBe("Plant");
    expect(move("overgrow").weight).toBe("heavy");
    expect(move("overgrow").power).toBe(70);
    expect(move("overgrow").text).toBe("70");
    expect(move("overgrow").effects).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("type chart — bible §1", () => {
  // Transcribed straight out of the bible §1 table. "Weak vs" is "takes 1.5× from".
  const BIBLE_CHART: TypeChart = {
    Beast: { strongVs: [], weakVs: ["Poison", "Dark"] },
    Fire: { strongVs: ["Plant", "Poison", "Dark"], weakVs: ["Water", "Earth"] },
    Water: { strongVs: ["Fire", "Earth"], weakVs: ["Plant", "Wind"] },
    Plant: { strongVs: ["Water", "Earth"], weakVs: ["Fire", "Poison"] },
    Earth: { strongVs: ["Fire", "Wind"], weakVs: ["Water", "Plant"] },
    Wind: { strongVs: ["Water", "Poison"], weakVs: ["Earth", "Dark"] },
    Poison: { strongVs: ["Plant", "Beast"], weakVs: ["Fire", "Wind"] },
    Dark: { strongVs: ["Wind", "Beast"], weakVs: ["Fire"] },
  };

  /** The rule build-doc §7.4 reads off the chart; VALUES come from balance.json, never from code. */
  function mult(attacker: TypeName, defender: TypeName): number {
    if (movesFile.typeChart[attacker].strongVs.includes(defender)) return balance.types.superEffective;
    if (movesFile.typeChart[defender].strongVs.includes(attacker)) return balance.types.resisted;
    return balance.types.neutral;
  }

  it("round-trips the bible §1 table exactly", () => {
    expect(movesFile.typeChart).toEqual(BIBLE_CHART);
  });

  it("is its own dual: every strongVs has the matching weakVs", () => {
    for (const a of TYPE_NAMES) {
      for (const d of movesFile.typeChart[a].strongVs) expect(movesFile.typeChart[d].weakVs, `${a}->${d}`).toContain(a);
      for (const s of movesFile.typeChart[a].weakVs) expect(movesFile.typeChart[s].strongVs, `${s}->${a}`).toContain(a);
    }
  });

  it("resolves specific matchups in BOTH directions", () => {
    const SUPER = balance.types.superEffective;
    const RESIST = balance.types.resisted;
    const NEUTRAL = balance.types.neutral;
    expect(SUPER).toBe(1.5);
    expect(RESIST).toBe(0.67);
    expect(NEUTRAL).toBe(1);

    expect(mult("Fire", "Plant")).toBe(SUPER); //  fire purges
    expect(mult("Plant", "Fire")).toBe(RESIST);
    expect(mult("Water", "Fire")).toBe(SUPER); //  water erodes
    expect(mult("Fire", "Water")).toBe(RESIST);
    expect(mult("Plant", "Earth")).toBe(SUPER); // growth overtakes
    expect(mult("Earth", "Plant")).toBe(RESIST);
    expect(mult("Earth", "Wind")).toBe(SUPER); //  stone smothers
    expect(mult("Wind", "Earth")).toBe(RESIST);
    expect(mult("Wind", "Poison")).toBe(SUPER); // wind harries
    expect(mult("Poison", "Wind")).toBe(RESIST);
    expect(mult("Poison", "Beast")).toBe(SUPER); // rot corrupts
    expect(mult("Beast", "Poison")).toBe(RESIST);
    expect(mult("Dark", "Beast")).toBe(SUPER); //  dusk swallows
    expect(mult("Beast", "Dark")).toBe(RESIST);
    expect(mult("Dark", "Wind")).toBe(SUPER);
    expect(mult("Wind", "Dark")).toBe(RESIST);
    expect(mult("Fire", "Dark")).toBe(SUPER);
    expect(mult("Dark", "Fire")).toBe(RESIST);
    // Beast attacks nothing at an advantage; it trades that for +10% base stats (bible §1).
    expect(movesFile.typeChart.Beast.strongVs).toEqual([]);
    expect(mult("Beast", "Fire")).toBe(NEUTRAL);
    expect(mult("Fire", "Beast")).toBe(NEUTRAL);
    expect(balance.types.beastBaseStatBonus).toBe(0.1);
    expect(balance.types.predation).toBe(1.25);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("gym rosters — bible §7", () => {
  it("ships six fixed leaders with roster sizes 3/4/5/6/6/6 including the signature", () => {
    // 3, not the bible's 4, at gym 1 only, authorised by Hank on the harness
    // measurement that gym 1 was the hardest fight in the game (26.0% against an 80–95% target).
    // The same three numbers are pinned in core/schemas.ts GYM_ROSTER_SIZES, which now REJECTS a
    // four-creature Maribel at boot — so the amendment cannot be undone silently in either place.
    expect(gyms.map((g) => g.id)).toEqual(["maribel", "odo", "vesper", "sable", "noct", "greaves"]);
    expect(gyms.map((g) => g.name)).toEqual(["Maribel", "Odo", "Vesper", "Sable", "Noct", "Magnate Greaves"]);
    expect(gyms.map((g) => g.slots.length + 1)).toEqual([3, 4, 5, 6, 6, 6]);
    expect(gyms.every((g) => g.source === "fixed")).toBe(true); // Hard Req 9 / G8
    expect(gyms.map((g) => g.type)).toEqual(["Beast", "Water", "Poison", "Fire", "Dark", "mixed"]);
    expect(gyms.map((g) => g.town)).toEqual(["hearthollow", "brackwater", "bowerdeep", "cindershelf", "duskhollow", "sanctum"]);
    // bible §7 labels the column "Yr"; the field is `act` and the numbers are the same.
    expect(gyms.map((g) => g.act)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("transcribes each roster line-for-line", () => {
    const roster = (g: GymLeader) => [...g.slots, g.signature].map((s) => `${s.lineId}:${s.age}`);
    // bible §7 reads "Nibbin (A), Bramblehog (A), Skir (A) | Old Nib — Nibbin (E)". The DUPLICATE
    // Nibbin (A) is the slot that was cut; every other leader is still verbatim.
    expect(roster(gym("maribel"))).toEqual(["bramblehog-line:A", "skir-line:A", "nibbin-line:E"]);
    expect(roster(gym("odo"))).toEqual(["mirefin-line:J", "reedrick-line:A", "mirefin-line:A", "fenmaw-line:E"]);
    expect(roster(gym("vesper"))).toEqual(["gloomoth-line:J", "sporantle-line:A", "mirefin-line:A", "webvern-line:A", "webvern-line:E"]);
    expect(roster(gym("sable"))).toEqual(["ashvole-line:A", "cragmar-line:A", "ashvole-line:E", "stonewing-line:A", "pyrelisk-line:A", "pyrelisk-line:E"]);
    expect(roster(gym("noct"))).toEqual(["gloomoth-line:A", "umbrat-line:A", "carricrow-line:A", "wispurr-line:A", "umbrat-line:E", "duskstalk-line:E"]);
    expect(roster(gym("greaves"))).toEqual(["carricrow-line:A", "pyrelisk-line:A", "mirefin-line:A", "duskstalk-line:E", "fenmaw-line:E", "stonewing-line:E"]);
  });

  it("keeps Maribel's named signature and its bible trait", () => {
    const sig = gym("maribel").signature;
    expect(sig.nickname).toBe("Old Nib");
    expect(sig.traits?.[0]).toMatchObject({ id: "thick-pelt", name: "Thick Pelt", stat: "def", direction: "up" });
    // bible §7: Vesper's signature carries a rare trait.
    expect(gym("vesper").signature.traits?.[0]?.rarity).toBe("rare");
    // Every roster trait is a trait from the one pool (bible §2), never a private gym-only trait.
    const pool = new Set(balance.traits.pool.map((t) => t.id));
    for (const g of gyms) {
      for (const slot of [...g.slots, g.signature]) {
        for (const t of slot.traits ?? []) expect(pool.has(t.id), `${g.id}: ${t.id}`).toBe(true);
      }
    }
  });

  it("levels EVERY slot by the published ramp, not just the leader's top slot", () => {
    // gyms.json `_levels`: "roster level = 8 + 6×(gym−1); the signature is +2". Checking only each
    // leader's maximum let any non-signature slot drift downward undetected.
    //
    // Gym 1's signature premium is +0, not +2. The rank-and-file ramp is
    // untouched everywhere, including gym 1 — the exception is ONE number, and it is asserted here
    // as an exact value rather than as a range, so it cannot slide any further.
    const signaturePremium = (i: number) => (i === 0 ? 0 : 2);
    gyms.forEach((g, i) => {
      const rosterLevel = 8 + 6 * i;
      for (const [j, slot] of g.slots.entries()) {
        expect(slot.level, `${g.id} slots[${j}]`).toBe(rosterLevel);
      }
      expect(g.signature.level, `${g.id} signature`).toBe(rosterLevel + signaturePremium(i));
    });
    expect(gyms.map((g) => g.signature.level)).toEqual([8, 16, 22, 28, 34, 40]);
    expect(gyms[gyms.length - 1]!.signature.level).toBe(balance.xp.levelCap); // build-doc §7.4 cap
  });

  it("keeps the region's wild level ramp two levels under the gym it feeds", () => {
    // The UNTRAINED player model fields the level the grass
    // sits at. At [4,10,16,22,28,34] that was FOUR under every leader and gym 1 measured 0.2% over
    // 500 seeds. This binds the relationship rather than the array, so a future retune of either
    // side has to move both.
    const rankAndFile = gyms.map((g) => Math.max(...g.slots.map((s) => s.level)));
    expect(rankAndFile).toEqual([8, 14, 20, 26, 32, 38]);
    expect(balance.encounter.levelByYear).toEqual(rankAndFile.map((l) => l - 2));
  });

  it("ramps the Elder count with the years (bible §7)", () => {
    // "one Elder in early gyms, two-to-three by the endgame".
    const elders = gyms.map((g) => [...g.slots, g.signature].filter((s) => s.age === "E").length);
    expect(elders).toEqual([1, 1, 1, 2, 2, 3]);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("nodes — bible §6", () => {
  it("ships all 12 nodes with the bible's names", () => {
    expect(nodes.length).toBe(12);
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ["bowerdeep", "brackwater", "cindershelf", "duskhollow", "hearthollow", "r1", "r2", "r3", "r4", "r5", "sanctum", "sanctum-approach"],
    );
    const name = (id: string) => node(id).name;
    expect(name("hearthollow")).toBe("Hearthollow");
    expect(name("r1")).toBe("Meadow Reach");
    expect(name("brackwater")).toBe("Brackwater");
    expect(name("r2")).toBe("Brackmarsh");
    expect(name("bowerdeep")).toBe("Bowerdeep");
    expect(name("r3")).toBe("Bowerdeep Wilds");
    expect(name("cindershelf")).toBe("Cindershelf");
    expect(name("r4")).toBe("Cinder Steppe");
    expect(name("duskhollow")).toBe("Duskhollow");
    expect(name("r5")).toBe("Duskhollow Vale");
    expect(name("sanctum")).toBe("The Sanctum Fallow");
    // bible §6 biome column.
    expect(nodes.map((n) => `${n.id}:${n.biome}`).sort()).toEqual(
      [
        "bowerdeep:Forest", "brackwater:Marsh", "cindershelf:Steppe", "duskhollow:Vale",
        "hearthollow:Meadow", "r1:Meadow", "r2:Marsh", "r3:Forest", "r4:Steppe", "r5:Vale",
        "sanctum-approach:Sanctum", "sanctum:Sanctum",
      ].sort(),
    );
  });

  it("makes exactly the vertical slice walkable (build-doc §1)", () => {
    expect(nodes.filter((n) => n.walkable).map((n) => n.id).sort()).toEqual(["brackwater", "hearthollow", "r1", "r2"]);
  });

  it("wires a connected, symmetric node graph", () => {
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      for (const a of n.adjacency) {
        expect(ids.has(a), `${n.id} -> ${a}`).toBe(true);
        expect(nodes.find((m) => m.id === a)?.adjacency, `${a} -> ${n.id}`).toContain(n.id);
      }
    }
    // Walk the graph from Hearthollow — every node must be reachable.
    const seen = new Set<string>(["hearthollow"]);
    const queue = ["hearthollow"];
    while (queue.length > 0) {
      const id = queue.shift();
      const cur = nodes.find((n) => n.id === id);
      for (const a of cur?.adjacency ?? []) {
        if (!seen.has(a)) {
          seen.add(a);
          queue.push(a);
        }
      }
    }
    expect(seen.size).toBe(12);
  });

  it("never ships a spawn table — encounter weights are DERIVED (G3)", () => {
    /*
     * A HAND-COPY OF `core/schemas.ts` `zNodeFileShape`'S OWN KEYS, kept independent of it on
     * purpose so a key smuggled into the schema still has to be smuggled past a human here too.
     *
     * `edgeMouths` was added when travel became a walk: `data/nodes/*.json` now carries the cell each
     * map edge leads out of, pinned to the `^` edge-mouth its own layout draws (`core/types.ts`
     * `EdgeMouth`, held to the shipped layout and mask by `tests/unit/edge-mouth-travel.test.ts`).
     * THE ASSERTION BELOW IS UNCHANGED — the list is the input, not the claim, and the claim is
     * still "nothing outside the §7.2 schema". `edgeMouths` is not a second table under another
     * name: it carries no species, no weight and no count, and the file-level `SECOND_TABLE_KEY`
     * sweep in `tests/gates/guardrails.test.ts` — the project's own definition of a second table by
     * name — does not match it.
     */
    const NODE_KEYS = ["id", "name", "biome", "adjacency", "walkable", "mapAsset", "yearVariants", "collisionMask", "floraStock", "populations", "props", "edgeMouths"];
    for (const n of nodes) {
      expect(Object.keys(n as object), n.id).not.toContain("spawnTables");
      // Any key beyond the schema's own (and `_`-prefixed documentation) is a second table under
      // another name — zod would silently strip it, so the raw object is what gets checked.
      const extra = Object.keys(n as object).filter((k) => !NODE_KEYS.includes(k) && !k.startsWith("_"));
      expect(extra, `${n.id} unexpected keys`).toEqual([]);
    }
    const raw = nodeFileNames.map((f) => readFileSync(new URL(`../../data/nodes/${f}`, import.meta.url), "utf8")).join("\n");
    expect(raw).not.toMatch(/"[^"]*(spawn|encounter|bait|weight|loot)[^"]*"\s*:/i);
  });

  it("keys every population by a real species line whose habitat matches the biome", () => {
    const ids = new Set(species.map((s) => s.id));
    for (const n of nodes) {
      expect(Object.keys(n.populations).length, `${n.id} has populations`).toBeGreaterThan(0);
      for (const [lineId, pop] of Object.entries(n.populations)) {
        expect(ids.has(lineId), `${n.id}: ${lineId}`).toBe(true);
        const s = line(lineId);
        expect(s.habitat.includes(n.biome) || s.habitat.includes("roaming"), `${n.id} (${n.biome}): ${lineId} ${JSON.stringify(s.habitat)}`).toBe(true);
        expect(Number.isInteger(pop.count)).toBe(true);
        expect(pop.count).toBeLessThanOrEqual(pop.carryCap);
        expect(pop.breedRate).toBeGreaterThanOrEqual(0);
      }
      expect(n.floraStock).toBeGreaterThanOrEqual(balance.ecosim.floraMin);
      expect(n.floraStock).toBeLessThanOrEqual(balance.ecosim.floraMax);
      expect(n.yearVariants).toEqual({}); // only overlay-diff-passed variants may ever be listed (G4)
      expect(n.mapAsset).toMatch(/^assets\/final\/maps\//);
      expect(n.collisionMask).toMatch(/^assets\/final\/maps\//);
    }
  });

  it("puts every species habitat on the map as a real node biome", () => {
    const biomes = new Set(nodes.map((n) => n.biome));
    const sentinels = new Set(["roaming", "starter", "hidden"]);
    for (const s of species) {
      for (const h of s.habitat) {
        if (sentinels.has(h)) continue;
        expect(biomes.has(h), `${s.id} habitat ${h}`).toBe(true);
      }
      // Every line except the three non-spawning starters must be placeable somewhere on the map.
      if (!s.habitat.includes("starter")) {
        expect(s.habitat.some((h) => !sentinels.has(h) || h === "roaming"), `${s.id} has a placeable habitat`).toBe(true);
      }
    }
    expect([...biomes].sort()).toEqual(["Forest", "Marsh", "Meadow", "Sanctum", "Steppe", "Vale"]);
    // The sentinels are used only where the bible uses them.
    expect(species.filter((s) => s.habitat.includes("roaming")).map((s) => s.id)).toEqual(["carricrow-line"]);
    expect(species.filter((s) => s.habitat.includes("starter")).map((s) => s.id)).toEqual(["cindril-line", "puddlisk-line", "thornlet-line"]);
  });

  it("stands the sign-chain trailhead props where the bible puts them (bible §4)", () => {
    const propsOf = (id: string) => node(id).props;
    // "antler standing-stones on routes"
    for (const route of ["r1", "r2", "r3", "r4", "r5", "sanctum-approach"]) {
      expect(propsOf(route).some((p) => p.kind === "antler-stone"), `${route} antler stone`).toBe(true);
    }
    // "shell-kiln shrines in the mine" (Cindershelf) — the Kilnback chain.
    expect(propsOf("cindershelf").filter((p) => p.kind === "shell-kiln-shrine").length).toBeGreaterThan(0);
    expect(propsOf("cindershelf").every((p) => p.kind !== "shell-kiln-shrine" || p.signChain === "kilnback-chain")).toBe(true);
    // "sunken idols visible in the marsh shallows" — the Undermere chain.
    const idols = nodes.flatMap((n) => n.props.filter((p) => p.kind === "sunken-idol").map((p) => ({ node: n.id, chain: p.signChain })));
    expect(idols.map((i) => i.node).sort()).toEqual(["brackwater", "r2"]);
    expect(idols.every((i) => i.chain === "undermere-chain")).toBe(true);
    // Ancients live where their chain does.
    expect(Object.keys(node("sanctum").populations)).toContain("vellsire-line");
    expect(Object.keys(node("cindershelf").populations)).toContain("kilnback-line");
    expect(Object.keys(node("r2").populations)).toContain("undermere-line");
  });

  it("assigns breed rates and carry caps by the published rule (node `_breedRule`)", () => {
    // The rule each node file publishes: breedRate by the line's ADULT role, carryCap = 3 × count,
    // Ancients pinned at count 1 / breedRate 0 / carryCap 1. Pinning it stops a single node quietly
    // out-breeding the player's catch throughput again (see the over-catch gate below).
    const BREED_BY_ROLE: Record<Role, number> = {
      Producer: 0.09,
      Grazer: 0.06,
      Mesopredator: 0.045,
      Apex: 0.03,
      Scavenger: 0.05,
      AncientApex: 0,
    };
    for (const n of nodes) {
      for (const [id, pop] of Object.entries(n.populations)) {
        const s = line(id);
        if (s.ancient) {
          expect([pop.count, pop.breedRate, pop.carryCap], `${n.id}/${id}`).toEqual([1, 0, 1]);
          continue;
        }
        expect(pop.breedRate, `${n.id}/${id} breedRate`).toBe(BREED_BY_ROLE[s.role[balance.ecosim.webRoleAgeClass]]);
        expect(pop.carryCap, `${n.id}/${id} carryCap`).toBe(pop.count * 3);
      }
    }
  });

  it("pins every node's floraStock, the one population number no published rule covers", () => {
    /*
     * `count`, `breedRate` and `carryCap` are all held by the rules each node file publishes in its
     * own `_breedRule` / `_pyramid` (the test above), so every mutation of them goes red. Its
     * sibling `floraStock` was free inside the balance.ecosim band: `hearthollow` +5 survived the
     * whole suite. It is not a free number — it is the base of the grazer tier (bible §5: grazers
     * eat "Producers + each node's abstract flora stock"), it feeds the starvation ratio in the
     * ecology gates below, and the §7.3 step-1 birth term rides on it.
     *
     * There is no rule to check it against: unlike its siblings, neither the build doc, the bible
     * nor the node files' own `_pyramid` states a derivation for flora — grep confirms it. Checked,
     * and the values do not fall out of the S=3/S=4 node scale, the biome, or the grazer budget. So
     * the honest binding is the transcription form used everywhere else in this file: the authored
     * values, listed, one line per node. Changing one is then a visible edit here, which is the
     * whole point. If a rule is ever published, this table should become a derivation like its
     * siblings'.
     */
    const AUTHORED_FLORA: Record<string, number> = {
      hearthollow: 60,
      r1: 78,
      brackwater: 55,
      r2: 72,
      bowerdeep: 66,
      r3: 84,
      cindershelf: 36,
      r4: 42,
      duskhollow: 44,
      r5: 58,
      "sanctum-approach": 35,
      sanctum: 50,
    };
    // Identity, not cardinality — every node is listed, and only the nodes that exist.
    expect(Object.keys(AUTHORED_FLORA).sort()).toEqual(nodes.map((n) => n.id).sort());
    for (const n of nodes) {
      expect(n.floraStock, `${n.id} floraStock`).toBe(AUTHORED_FLORA[n.id]);
      // …and it stays a whole stock inside the band the sim clamps it to (build-doc §7.2 "0–100").
      expect(Number.isInteger(n.floraStock), `${n.id} floraStock is a whole stock`).toBe(true);
      expect(n.floraStock).toBeGreaterThanOrEqual(balance.ecosim.floraMin);
      expect(n.floraStock).toBeLessThanOrEqual(balance.ecosim.floraMax);
    }
  });

  it("stacks populations as a trophic pyramid at every node, with the empty tiers published", () => {
    // The old form of this test was `if (producers > 0 && grazers > 0) expect(...)` — which cannot
    // fail at a node with no Producer, and five nodes have none. So the empty tiers are named here:
    // if a tier silently empties, the LIST assertion fails even though the inequality went vacuous.
    const NO_PRODUCER = ["cindershelf", "duskhollow", "r4", "r5", "sanctum", "sanctum-approach"]; // Steppe & Vale have no Producer species
    const NO_GRAZER = ["sanctum", "sanctum-approach"];
    const NO_MESO = ["sanctum", "sanctum-approach"];
    const NO_APEX = ["duskhollow", "hearthollow", "r1", "r5", "sanctum", "sanctum-approach"]; // Meadow & Vale have no Apex

    const roleOf = (id: string) => line(id).role[balance.ecosim.webRoleAgeClass];
    const totalAt = (n: NodeFile, role: Role) =>
      Object.entries(n.populations)
        .filter(([id]) => roleOf(id) === role)
        .reduce((sum, [, p]) => sum + p.count, 0);
    const emptyFor = (role: Role) => nodes.filter((n) => totalAt(n, role) === 0).map((n) => n.id).sort();

    expect(emptyFor("Producer")).toEqual(NO_PRODUCER);
    expect(emptyFor("Grazer")).toEqual(NO_GRAZER);
    expect(emptyFor("Mesopredator")).toEqual(NO_MESO);
    expect(emptyFor("Apex")).toEqual(NO_APEX);

    for (const n of nodes) {
      const producers = totalAt(n, "Producer");
      const grazers = totalAt(n, "Grazer");
      const mesos = totalAt(n, "Mesopredator");
      const apex = totalAt(n, "Apex");
      if (!NO_PRODUCER.includes(n.id)) expect(producers, `${n.id} producers > grazers`).toBeGreaterThan(grazers);
      if (!NO_MESO.includes(n.id)) expect(grazers, `${n.id} grazers > mesopredators`).toBeGreaterThan(mesos);
      if (!NO_APEX.includes(n.id)) expect(mesos, `${n.id} mesopredators > apex`).toBeGreaterThan(apex);
      // Ancients are a single gated individual, never a breeding population.
      for (const [id, pop] of Object.entries(n.populations)) {
        if (line(id).ancient) {
          expect(pop.count, `${n.id} ${id}`).toBe(1);
          expect(pop.breedRate).toBe(0);
          expect(pop.carryCap).toBe(1);
        }
      }
    }
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * Ecology gates — the shipped numbers vs the properties the build doc demands of them.
 *
 * These are NOT a runtime path: core/foodweb.ts remains the only module that derives diet edges at
 * run time (build-doc §8.3). What follows is bible §5 read back as an expectation over the shipped
 * files, so that a count, a breed rate or a demand figure can never again be authored into a state
 * where build-doc §10.2's `cascade_emerges` is arithmetically unreachable.
 * ────────────────────────────────────────────────────────────────────────── */
describe("ecology — the shipped numbers must be able to produce the cascade", () => {
  const roleOf = (id: string): Role => line(id).role[balance.ecosim.webRoleAgeClass];
  const demandOf = (id: string, count: number) => balance.ecosim.demandPerIndividual[roleOf(id)] * count;

  /**
   * bible §5, transcribed: "Apex eats Mesopredators and large Grazers in its habitat.
   * Mesopredators eat Grazers in their habitat. Grazers eat Producers (creature Producers + each
   * node's abstract flora stock). Scavengers eat nothing live … plus each species' dietExceptions;
   * Ancients eat nothing."
   */
  function preyAt(n: NodeFile, lineId: string): string[] {
    const role = roleOf(lineId);
    const others = Object.keys(n.populations).filter((id) => id !== lineId);
    const prey = new Set<string>();
    if (role === "Apex") {
      for (const id of others) {
        if (roleOf(id) === "Mesopredator") prey.add(id);
        if (roleOf(id) === "Grazer" && line(id).sizeClass === "large") prey.add(id);
      }
    } else if (role === "Mesopredator") {
      for (const id of others) if (roleOf(id) === "Grazer") prey.add(id);
    } else if (role === "Grazer") {
      for (const id of others) if (roleOf(id) === "Producer") prey.add(id);
    }
    for (const d of line(lineId).dietExceptions ?? []) if (others.includes(d)) prey.add(d);
    return [...prey];
  }

  function availableAt(n: NodeFile, lineId: string, preyScale = 1): number {
    const live = preyAt(n, lineId).reduce((sum, p) => sum + n.populations[p]!.count * preyScale, 0);
    // bible §5: grazers also eat "each node's abstract flora stock".
    const flora = roleOf(lineId) === "Grazer" ? n.floraStock * balance.ecosim.floraPreyUnitsPerPoint * preyScale : 0;
    return live + flora;
  }

  it("gives every role a demand figure, and only the no-diet roles a zero one", () => {
    // build-doc §7.3 step 2 has no exemption clause, so a Producer/Scavenger/Ancient with an empty
    // derived diet would read availablePrey/demand = 0 < starveThreshold and be killed at
    // starveRate every season. The rule that saves them has to be a NUMBER in balance.json, not a
    // special case in code (G11): demand 0 means "no live diet", and the sim uses noDietFoodFactor.
    for (const role of ROLES) {
      expect(balance.ecosim.demandPerIndividual[role], `demandPerIndividual.${role}`).toBeTypeOf("number");
    }
    const noDiet = ROLES.filter((r) => balance.ecosim.demandPerIndividual[r] === 0);
    expect([...noDiet].sort()).toEqual(["AncientApex", "Producer", "Scavenger"]);
    expect(balance.ecosim.noDietFoodFactor).toBeGreaterThanOrEqual(1);

    // The concrete consequences the build doc will not forgive: the finale legendary must survive
    // 20 seasons of sim (Hard Req 7), and Carricrow must still exist region-wide for Noct's,
    // Greaves' and Wick's rosters (bible §7/§8). Demand must be 0 at ANY population size.
    for (const count of [1, 10, 100]) {
      expect(demandOf("vellsire-line", count), "Vellsire").toBe(0);
      expect(demandOf("carricrow-line", count), "Carricrow").toBe(0);
      expect(demandOf("loamunder-line", count), "Loamunder").toBe(0);
      expect(demandOf("sporantle-line", count), "Sporantle").toBe(0);
    }
  });

  it("feeds every population at the shipped state — nothing starves at t=0", () => {
    for (const n of nodes) {
      for (const [id, pop] of Object.entries(n.populations)) {
        const demand = demandOf(id, pop.count);
        if (demand === 0) continue; // no live diet — foodFactor is noDietFoodFactor, never starvation
        const ratio = availableAt(n, id) / demand;
        expect(ratio, `${n.id}/${id} availablePrey/demand at the shipped state`).toBeGreaterThanOrEqual(
          balance.ecosim.starveThreshold,
        );
      }
    }
  });

  it("makes apex starvation REACHABLE at every node with an Apex (build-doc §10.2 cascade_emerges)", () => {
    // The property: "for any node with an Apex, forcing its primary prey to <10% for 2 consecutive
    // seasons yields apex count → 0". That is only true if 10% of the apex's derived prey pool sits
    // under balance.ecosim.starveThreshold × demand. Authored 10:1 prey:predator ratios against a
    // flat demand of 1.0 per individual made it false at four of six sites, both slice sites among
    // them — the never-cut demo beat could not have emerged from the §7.3 rules.
    const apexSites = nodes.flatMap((n) =>
      Object.keys(n.populations)
        .filter((id) => roleOf(id) === "Apex")
        .map((id) => ({ n, id })),
    );
    expect(apexSites.map((s) => `${s.n.id}/${s.id}`).sort()).toEqual([
      "bowerdeep/duskstalk-line",
      "brackwater/fenmaw-line",
      "cindershelf/stonewing-line",
      "r2/fenmaw-line",
      "r3/duskstalk-line",
      "r4/stonewing-line",
    ]);

    for (const { n, id } of apexSites) {
      const prey = preyAt(n, id);
      expect(prey.length, `${n.id}/${id} has prey at all`).toBeGreaterThan(0);
      const ratioAt10 = availableAt(n, id, 0.1) / demandOf(id, n.populations[id]!.count);
      expect(ratioAt10, `${n.id}/${id} prey at 10% must cross starveThreshold`).toBeLessThan(
        balance.ecosim.starveThreshold,
      );
    }
  });

  it("keeps the year-1 over-catch beat reachable in real play (build-doc §1 beat 1, §15 I2)", () => {
    // Encounter weight is the live count (build-doc §7.2), so hammering a species gets HARDER as it
    // thins: the player's catch rate scales with the target's share of the node. Against regrowth,
    // that made the demo beat arithmetically impossible when node totals were authored large.
    const oc = balance.harness.overcatch;
    /*
     * ⚠ THE INSTRUMENT WAS WRONG AND THIS IS THE REPAIR. This budget used to read
     *
     *     (ticksPerYear / forayTicks) × stepsPerForay × encounterChancePerStep
     *
     * and it OVER-REPORTED, in two independent ways, both of which arrived with the 52-tick retune:
     *
     *   (a) an encounter rolls on TALL GRASS, not on every walked cell. `game/encounters.ts`
     *       `effectiveEncounterChance` is `encounterTileFraction × encounterChancePerStep`, and the
     *       old form used the un-gated chance — a 4× over-count at the shipped fraction of 0.25;
     *   (b) a battle costs `clock.battleTicks`. Battles are charged against the SAME meter forays
     *       are, so "every tick of the year is a foray" was never true once fighting cost anything:
     *       an excursion that meets `e` creatures spends `forayTicks + e × battleTicks`, not
     *       `forayTicks`.
     *
     * The honest form, which conserves the year exactly (25 forays × 1 tick + 54 battles × 0.5 tick
     * = 52 ticks, the whole meter and not one tick more):
     *
     *     e      = stepsPerForay × encounterTileFraction × encounterChancePerStep   per foray
     *     cost   = forayTicks + e × battleTicks                                     ticks per foray
     *     forays = ticksPerYear / cost
     *     encounters = e × forays
     *
     * Against the shipped balance that is 54.0 encounters a year. The old formula read 138.24 under
     * the 16-tick meter and would read 449.28 under the 52-tick one — eight times the truth, and it
     * is the number this gate divides the demo beat's feasibility by, so the error was load-bearing
     * rather than cosmetic.
     *
     * This is a MAXIMUM and is deliberately generous: it assumes a player who spends every tick of
     * the year foraying and fighting, and never travels, never sleeps at an inn and never flees. A
     * beat that is infeasible against this number is infeasible in principle.
     *
     * It WAS also conservative in the other direction — a known gap, now CLOSED, and the note is
     * kept because the gap is what the shape of this formula was chosen against. `ClockActionKind`
     * has a `battle` member and `data/balance.json` prices it; what was missing was any caller, so
     * as wired battles were free and the real budget was 112.32 rather than 54.0. Both ends spend it
     * now: `game/scenes/OverworldScene.ts` calls `this.spendTicks("battle", action)` on every launch
     * that clears the guards, and `game/year-replay.ts` lists `battle` in `TICK_COSTING`, so a
     * replayed log is charged identically. Charging the honest cost here always held the beat to the
     * stricter of the two readings, which is exactly why wiring the charge up did not move this gate.
     */
    const encountersPerForay =
      balance.encounter.stepsPerForay *
      balance.encounter.encounterTileFraction *
      balance.encounter.encounterChancePerStep;
    const ticksPerForayExcursion = balance.clock.forayTicks + encountersPerForay * balance.clock.battleTicks;
    const foraysPerYear = balance.clock.ticksPerYear / ticksPerForayExcursion;
    const maxEncountersPerYear = encountersPerForay * foraysPerYear;

    // The budget must ACCOUNT FOR THE WHOLE YEAR AND NO MORE — the identity that would have caught
    // both halves of the old formula's error, since neither the tile gating nor the battle charge
    // can be dropped from it without the ticks stopping adding up.
    expect(
      foraysPerYear * balance.clock.forayTicks + maxEncountersPerYear * balance.clock.battleTicks,
    ).toBeCloseTo(balance.clock.ticksPerYear, 9);
    // …and it must be strictly below the un-gated count, or the grass gating is not being applied.
    expect(maxEncountersPerYear).toBeLessThan(
      balance.clock.ticksPerYear * balance.encounter.stepsPerForay * balance.encounter.encounterChancePerStep,
    );

    const referenceCatchP = Math.min(
      balance.catch.clampMax,
      Math.max(
        balance.catch.clampMin,
        balance.catch.baseCatch.A *
          balance.catch.snareTier[oc.snareTier] *
          balance.catch.baitMult[oc.baitMatch] *
          ((balance.catch.hpTermOffset - oc.referenceHpFrac) / balance.catch.hpTermDivisor),
      ),
    );
    const seasonsPerYear = balance.clock.ticksPerYear / balance.clock.ticksPerSeason;
    // The share below is averaged UNWEIGHTED over `seasonOrder`, which is only honest because every
    // season is the same length — core/schemas.ts refuses to boot unless
    // ticksPerYear === ticksPerSeason × seasonOrder.length. Pinned so the two cannot drift apart
    // and quietly turn a mean into a mis-weighting.
    expect(balance.clock.seasonOrder.length).toBe(seasonsPerYear);

    /*
     * ⚠ THE THIRD ERROR IN THE SAME FAMILY, AND THIS IS ITS REPAIR. The share term below used to be
     *
     *     const preyShare = preyPool / encounterable;
     *
     * which IGNORES `seasonalWindow` — the very first filter build-doc §7.2 lists on the weight.
     * `core/foodweb.ts` `encounterWeights()` gives an out-of-season line
     * `balance.encounter.outOfSeasonWeight` and `active: false`, and `rollEncounter()` picks on
     * `w.active ? w.weight : 0`, so three seasons in four a summer migrant cannot be met at all.
     *
     * WHAT IT PRICED: a player who can hunt `reedrick-line` all year. No such player exists.
     * Reedrick is bible §5's summer migrant and it is 18 of brackwater's 24-strong prey pool and 24
     * of r2's 32 — 75% of the apex's food at both marsh sites, reachable one season in four. The
     * flat form therefore read brackwater at 11.42 net removals a year and r2 at 9.46; driving the
     * real seams (stepEncounterChance → encounterWeights → rollEncounter → encounterCatchChance →
     * applyCatch, charging foray + battle ticks as tools/harness/full-run.ts does) over 100 seeds
     * with the player camped at the node measures 3.14 and 1.15. The seasonality-weighted form
     * below reads 3.63 and 1.72 — and it also tracks the simulator at the two sites the old filter
     * never reached: bowerdeep 6.56 against a measured 6.54, r4 9.08 against 8.49.
     *
     * WHY NOBODY SAW IT. The two errors named above both lived in the TICK BUDGET, so that is where
     * every later reading looked; the share read as pure content arithmetic — counts over counts,
     * every number straight off the shipped JSON, nothing to be wrong. And it erred GENEROUS. A
     * gate that over-reports the player's reach never goes red, and a green gate is not read.
     *
     * A gate whose number diverges from the simulator is worse than no gate: tuning toward it moves
     * the game away from the beat while the light stays green.
     */

    /** Encounter-active in season `s` — exactly what core/foodweb.ts `migrantStatus()` decides. */
    const activeIn = (lineId: string, season: Season): boolean => {
      const window = line(lineId).seasonalWindow;
      return window === undefined || window === season;
    };
    /** Out of the ordinary pool in EVERY season: bible §4's sign-chain gate (weight 0, never active). */
    const signGated = (lineId: string): boolean =>
      line(lineId).habitat.includes(balance.encounter.signChainGatedHabitatTag);
    // The share treats "out of season" as a hard removal from the pool, which is only faithful
    // because `outOfSeasonWeight` ships as 0 AND `rollEncounter()` zeroes an inactive entry anyway.
    // Retuned non-zero, a migrant would have to be carried as a reduced WEIGHT rather than dropped —
    // so the number the assumption rests on is pinned here beside it.
    expect(balance.encounter.outOfSeasonWeight).toBe(0);
    // Not modelled, and deliberately: the Scavenger × (1 + recentDeaths/divisor) term is 1 at the
    // shipped state (recentDeaths is a runtime field, 0 before any death) and only ever DILUTES the
    // prey share, so omitting it keeps this a maximum — the direction a feasibility gate may err in.

    const apexSites = nodes.flatMap((n) =>
      Object.keys(n.populations)
        .filter((id) => roleOf(id) === "Apex")
        .map((id) => ({ n, id })),
    );
    // Guard against the gate going vacuous: every shipped apex site is measured below.
    expect(apexSites.map((s) => `${s.n.id}/${s.id}`).sort()).toEqual([
      "bowerdeep/duskstalk-line",
      "brackwater/fenmaw-line",
      "cindershelf/stonewing-line",
      "r2/fenmaw-line",
      "r3/duskstalk-line",
      "r4/stonewing-line",
    ]);

    /*
     * WHERE THE BEAT IS ASSERTED, AND WHY IT IS NOT WHERE IT USED TO BE.
     *
     * This loop used to run over `nodes.filter((n) => n.walkable)` — brackwater and r2. Walkability
     * is the vertical slice's build order (build-doc §1); it is not the content's statement of where
     * demo beat 1 happens, and at those two nodes the content says the opposite. From
     * `fixtures/overcatch-script.json`'s own `_why`: the beat's second half — "a new apex risen" —
     * "needs the over-catching to leave the mesopredator standing AND to leave its own food intact.
     * On shipped content that holds only where the apex's primary prey IS the mesopredator … the
     * Cinder Steppe (r4 …). At the vertical-slice marsh (brackwater / r2) the same protocol produces
     * a two-tier COLLAPSE instead." So the gate was demanding the apex-starve budget at the two
     * sites the shipped script says are not the beat, and demanding it nowhere at the site that is.
     *
     * The beat's sites are DERIVED from that sentence rather than listed: a site qualifies when the
     * apex's whole derived prey pool is its mesopredator, and none of that mesopredator's own food
     * is in the pool the player is hammering. `tools/harness/fixture.ts` reaches the same two nodes
     * by the same property ("It is a no-op only at `r4` and `cindershelf`"), and the shipped
     * script's `nodeId` is required to be one of them below — so re-pointing the fixture at a node
     * where the beat cannot happen fails here rather than silently publishing a collapse as its
     * opposite.
     */
    const script = read("fixtures/overcatch-script.json") as {
      nodeId: string;
      actions: Array<{ t: string; nodeId?: string; lineId?: string }>;
    };
    const hammered = script.actions.find((a) => a.t === "catch");
    expect(hammered?.lineId, "fixtures/overcatch-script.json records no catch action").toBeDefined();

    /** The mesopredator tier's own food at this node — what the beat must leave standing. */
    const releasedTierFood = (n: NodeFile, apexId: string): Set<string> => {
      const mesos = preyAt(n, apexId).filter((p) => roleOf(p) === "Mesopredator");
      return new Set(mesos.flatMap((m) => preyAt(n, m)));
    };
    const contestedAt = (n: NodeFile, apexId: string): string[] => {
      const food = releasedTierFood(n, apexId);
      return preyAt(n, apexId).filter((p) => food.has(p));
    };

    const beatSites = apexSites.filter(({ n, id }) => contestedAt(n, id).length === 0);
    expect(beatSites.map((s) => `${s.n.id}/${s.id}`).sort()).toEqual([
      "cindershelf/stonewing-line",
      "r4/stonewing-line",
    ]);
    // The fixture's other half of the same sentence, checked independently: at those sites the
    // apex's prey pool IS the mesopredator tier, nothing else.
    for (const { n, id } of beatSites) {
      const prey = preyAt(n, id);
      expect(prey.length, `${n.id}/${id} has prey at all`).toBeGreaterThan(0);
      expect(prey.every((p) => roleOf(p) === "Mesopredator"), `${n.id}/${id} prey pool is the mesopredator tier`).toBe(true);
    }
    // …and the node the shipped script actually names is one of them, hammering a line that IS the
    // apex's prey there. This is the tie between the gate and the recorded beat.
    const scripted = beatSites.find((s) => s.n.id === script.nodeId);
    expect(scripted, `fixtures/overcatch-script.json targets ${script.nodeId}, which is not a beat site`).toBeDefined();
    expect(preyAt(scripted!.n, scripted!.id), `${script.nodeId}: the script hammers ${hammered?.lineId}`).toContain(
      hammered?.lineId,
    );

    for (const { n, id } of apexSites) {
      const prey = preyAt(n, id);
      expect(prey.length, `${n.id}/${id} has prey at all`).toBeGreaterThan(0);
      const preyPool = prey.reduce((sum, p) => sum + n.populations[p]!.count, 0);
      const countOf = (pid: string) => n.populations[pid]!.count;
      // Ancients are gated out of the ordinary encounter pool, so they do not dilute the weights.
      const encounterableIds = Object.keys(n.populations).filter((pid) => !signGated(pid));
      const encounterable = encounterableIds.reduce((sum, pid) => sum + countOf(pid), 0);
      const flatShare = preyPool / encounterable;

      /** The prey's share of what can actually be ROLLED in season `s` (build-doc §7.2 filter 1). */
      const shareIn = (s: Season): number => {
        const activePrey = prey.filter((p) => activeIn(p, s)).reduce((sum, p) => sum + countOf(p), 0);
        const activePool = encounterableIds.filter((pid) => activeIn(pid, s)).reduce((sum, pid) => sum + countOf(pid), 0);
        return activePool === 0 ? 0 : activePrey / activePool;
      };
      const preyShare =
        balance.clock.seasonOrder.reduce((sum, s) => sum + shareIn(s), 0) / balance.clock.seasonOrder.length;

      /*
       * THE IDENTITY THAT MAKES DROPPING THE SEASON TERM IMPOSSIBLE TO DO QUIETLY — the sibling of
       * the tick-conservation check above, and the thing that would have caught this error the day
       * it was written. Under the flat form `preyShare` is `flatShare` EXACTLY, so both branches go
       * red on the reversion rather than merely drifting.
       *
       * Both directions are theorems, not observations. Where the seasonal line is PREY, the
       * out-of-season share is (P−x)/(E−x) < P/E and the in-season share is P/E, so the mean is
       * strictly under the flat form. Where it is not prey, the out-of-season share is P/(E−y) >
       * P/E and the mean is strictly over it. Each holds only while a node's seasonal lines sit on
       * ONE side of the diet edge, which is true of all four migrants at all six apex sites — so
       * that precondition is asserted rather than assumed. A node hosting both would need the
       * direction re-derived; that is a red light to look at, never one to loosen.
       */
      const seasonalPrey = prey.filter((p) => line(p).seasonalWindow !== undefined);
      const seasonalOther = encounterableIds.filter((pid) => line(pid).seasonalWindow !== undefined && !prey.includes(pid));
      expect(
        seasonalPrey.length === 0 || seasonalOther.length === 0,
        `${n.id}/${id}: seasonal lines on BOTH sides of the diet edge — re-derive the direction below`,
      ).toBe(true);
      if (seasonalPrey.length > 0) {
        expect(
          preyShare,
          `${n.id}/${id}: ${seasonalPrey.join(", ")} is out of season 3 seasons in 4 — the share term dropped seasonalWindow`,
        ).toBeLessThan(flatShare);
      } else if (seasonalOther.length > 0) {
        expect(
          preyShare,
          `${n.id}/${id}: ${seasonalOther.join(", ")} leaves the pool out of season — the share term dropped seasonalWindow`,
        ).toBeGreaterThan(flatShare);
      }

      const removalsNeeded = preyPool - balance.ecosim.starveThreshold * demandOf(id, n.populations[id]!.count);
      const catchesPerYear = maxEncountersPerYear * preyShare * referenceCatchP;
      const birthsPerYear = prey.reduce((sum, p) => sum + countOf(p) * n.populations[p]!.breedRate, 0) * seasonsPerYear;
      const netRemovalPerYear = catchesPerYear - birthsPerYear;

      // THIS assertion runs at all six apex sites. The one BELOW does not — see the split. An
      // earlier revision of this comment said "at EVERY apex site — six, where the walkable filter
      // reached two" without saying which assertion it meant, which read as though the whole test
      // had widened. Only this one did; the starve-budget assertion went from two sites to two
      // sites, and they are a DISJOINT pair.
      expect(netRemovalPerYear, `${n.id}: regrowth of ${id}'s prey outpaces the maximum catch rate`).toBeGreaterThan(0);

      if (contestedAt(n, id).length > 0) {
        // NOT a beat site: the mesopredator's own food sits inside the pool the player must empty
        // to starve the apex, so the protocol takes two tiers down instead of releasing one.
        //
        // ⚠ WHAT THIS BRANCH USED TO DO, AND WHY IT WAS WORSE THAN NOTHING. It asserted
        // `contestedAt(n, id).every((p) => prey.includes(p))`. `contestedAt` is defined above as
        // `preyAt(n, apexId).filter((p) => food.has(p))` — a SUBSET OF `prey` BY CONSTRUCTION — so
        // that expectation was true for every possible `food` set, including the empty one and the
        // universe. It could not fail. It sat where a real assertion had been removed, and the
        // branch `continue`d past exactly and only the four sites where the assertion below fails.
        // That is the shape this project's own conduct rule forbids: a green obtained by skipping,
        // with something that looks like coverage left in the gap.
        //
        // ⚠ AND THE CITATION IT CARRIED WAS FALSE. It claimed the removed assertion was covered by
        // tests/property/ecosim.test.ts's "the cascade travels DOWN the web as well". That test
        // FORCES the removal by direct field assignment (`pop.count = Math.min(pop.count, target)`)
        // — no applyCatch, no rollEncounter, no tick budget. It proves the web propagates a removal
        // that has already happened. The assertion removed here proved a removal is ACHIEVABLE BY
        // PLAYING. Different properties; the second is not covered anywhere else.
        //
        // So the skip is replaced by the measured truth, which CAN fail. These four sites are
        // infeasible for the year-1 beat, and by a wide margin — the seasonality correction made
        // the shortfall worse, not better (brackwater 5.3x short, r2 14.4x). Pinning it means a
        // balance change that makes one of them reachable turns this RED and asks whether the beat
        // should move, instead of passing quietly at a site the fixture says is not the beat's.
        expect(
          netRemovalPerYear * oc.yearsBudget,
          `${n.id}/${id}: recorded as a two-tier-collapse site (${contestedAt(n, id).join(", ")} feeds ` +
            `both tiers), so the year-1 apex-starve beat is NOT expected here — but it is now ` +
            `reachable: ${(netRemovalPerYear * oc.yearsBudget).toFixed(2)} available against ` +
            `${removalsNeeded.toFixed(2)} needed. Either the beat moved or the balance did; decide ` +
            `which before making this pass.`,
        ).toBeLessThan(removalsNeeded);
        continue;
      }

      expect(
        netRemovalPerYear * oc.yearsBudget,
        `${n.id}: ${removalsNeeded.toFixed(1)} removals needed to starve ${id}, only ${netRemovalPerYear.toFixed(1)}/yr available`,
      ).toBeGreaterThanOrEqual(removalsNeeded);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("balance.json is the single home of every gameplay constant (G11 / INV-3)", () => {
  it("states the move-slot unlock levels as data, not as prose in a comment", () => {
    // bible §3: "4 move slots: 2 type moves + 1 role move + 1 utility, unlocked at levels 1/5/10/15";
    // build-doc §7.1 repeats them in movePool slot order. They lived only in a code comment, which
    // left core/battle.ts no way to answer "what does a level-7 creature know" without a literal.
    expect(balance.moves.slotUnlockLevels).toEqual({ type1: 1, type2: 5, role: 10, utility: 15 });
    const levels = Object.values(balance.moves.slotUnlockLevels);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels); // slot order IS unlock order
  });

  it("gives the trait system something to draw from (bible §2)", () => {
    // "Traits: flat ±10% modifiers with names ('Thick Pelt: +10% Defense'). 1 per wild creature,
    // +1 slot via inheritance, Elders roll rare traits." Every clause needs a home in data.
    expect(balance.stats.traitModPct).toBe(0.1);
    expect(balance.traits.slotsPerWildCreature).toBe(1);
    expect(balance.traits.inheritedSlotBonus).toBe(1);
    expect(balance.traits.maxSlots).toBe(2);
    expect(balance.traits.elderRareChance).toBeGreaterThan(0);
    expect(balance.traits.elderRareChance).toBeLessThan(1);

    const pool = balance.traits.pool;
    expect(pool.length).toBeGreaterThanOrEqual(10);
    expect(new Set(pool.map((t) => t.id)).size).toBe(pool.length);
    expect(pool.filter((t) => t.rarity === "rare").length).toBeGreaterThan(0);
    // The bible's own worked example must be in the pool, spelled its way.
    expect(pool.find((t) => t.id === "thick-pelt")).toMatchObject({ name: "Thick Pelt", stat: "def", direction: "up" });
    // Every stat is reachable, and the ±10% magnitude is never repeated per trait.
    expect(new Set(pool.map((t) => t.stat)).size).toBe(5);
    expect(pool.some((t) => t.direction === "down")).toBe(true);
    for (const t of pool) expect(Object.keys(t).sort()).toEqual(["direction", "id", "name", "rarity", "stat"]);
    // The rare pool is what an Elder roll is FOR — it never hands out a penalty.
    expect(pool.filter((t) => t.rarity === "rare").every((t) => t.direction === "up")).toBe(true);

    // G15, Q2. "Keen Eye" (#51) and "Strong Jaw" (#173) are real Pokémon
    // Abilities and were two of the fifteen trait names. Same banned
    // list as the move pool uses, checked here too: an evicted name must not reappear in the other
    // namespace. The two `id`s did NOT move — `keen-eye` and `strong-jaw` are read by
    // tests/unit/{catch,lifecycle}.test.ts and by core/, and no player ever sees them.
    const traitNames = pool.map((t) => t.name);
    for (const banned of RENAMED_AWAY_POKEMON_ABILITY_NAMES) {
      expect(traitNames, `"${banned}" is a real Pokémon ability — G15 bans it; rename the display name only, ids stay put`).not.toContain(banned);
    }
    // The replacements are in place under the untouched ids, so this cannot pass by the two traits
    // going missing. The pool is a 5×3 lattice and each name has to read as its column: "Bright
    // Eye" is the positive of "Dulled Sense", "Broad Jaw" the positive of "Soft Bite".
    expect(pool.find((t) => t.id === "keen-eye")).toEqual({
      id: "keen-eye", name: "Bright Eye", stat: "ins", direction: "up", rarity: "common",
    });
    expect(pool.find((t) => t.id === "strong-jaw")).toEqual({
      id: "strong-jaw", name: "Broad Jaw", stat: "atk", direction: "up", rarity: "common",
    });
    // The lattice the two renames had to sit inside: five stats × (common up, common down, rare up).
    expect(pool.map((t) => `${t.stat}/${t.direction}/${t.rarity}`).sort()).toEqual(
      ["atk", "def", "hp", "ins", "spd"].flatMap((s) => [`${s}/down/common`, `${s}/up/common`, `${s}/up/rare`]).sort(),
    );
    // Every trait name is a distinct display string, so a rename cannot collide with a sibling.
    expect(new Set(traitNames).size).toBe(pool.length);
  });

  it("numbers the medicines the bible only names (bible §11)", () => {
    expect(balance.medicine.salveItemId.length).toBeGreaterThan(0);
    expect(balance.medicine.salveHealFracMaxHp).toBeGreaterThan(0);
    expect(balance.medicine.tonicItemId.length).toBeGreaterThan(0);
    expect(balance.medicine.tonicClearsStatus).toBe(true);
    expect(balance.medicine.innRestFullHeal).toBe(true);
    expect(balance.clock.innTicks).toBe(2); // "inn rest (full heal, 2 ticks)"
    expect(balance.economy.salvePrice).toBeGreaterThan(0);
    expect(balance.economy.tonicPrice).toBeGreaterThan(0);
  });

  it("keeps no number in two places — a retune that changes nothing is worse than a literal", () => {
    // The light-type-move apply chance is stated per move by bible §3, so moves.json owns it and
    // balance.json must NOT carry a second copy (retuning the copy changed nothing: INV-3).
    expect(balanceRaw).not.toMatch(/applyChanceLightMove/);
    expect((balance.status as unknown as Record<string, unknown>)["applyChanceLightMove"]).toBeUndefined();
    const lightChances = movesFile.moves
      .filter((m) => m.weight === "light")
      .flatMap((m) => m.effects.map((e) => ("chance" in e ? e.chance : undefined)));
    expect(lightChances).toEqual(new Array(8).fill(LIGHT_MOVE_SECONDARY_CHANCE));

    // The scavenger recentDeaths divisor is an ENCOUNTER-weight term (build-doc §7.2), so it lives
    // once, under `encounter`; `ecosim.recentDeathsDivisor` was a second copy of the same 10.
    expect((balance.ecosim as unknown as Record<string, unknown>)["recentDeathsDivisor"]).toBeUndefined();
    expect(balance.encounter.scavengerRecentDeathsDivisor).toBeGreaterThan(0);
  });

  it("states the derivation rules the sim would otherwise have to invent", () => {
    // bible §5 tracks a line as age-structured while NodeFile.populations carries one scalar count,
    // so SOMETHING has to say which age's role drives the web.
    expect(balance.ecosim.webRoleAgeClass).toBe("A");
    expect(AGE_CLASSES).toContain(balance.ecosim.webRoleAgeClass);
    // A foray costs one tick (L8) but "rolls encounters" (build-doc §4) — the trio below is what
    // makes that plural, and what the over-catch feasibility gate above is measured against.
    expect(balance.encounter.stepsPerForay).toBeGreaterThan(1);
    expect(balance.encounter.encounterChancePerStep).toBeGreaterThan(0);
    expect(balance.encounter.encounterChancePerStep).toBeLessThanOrEqual(1);
    // Grass gating is the THIRD term and it was missing from this list while the over-catch gate
    // was over-reporting by 4×: a step has to be on an encounter tile before it may roll at all.
    // Unpinned, a retune could set it to 0 — no encounters anywhere — and nothing here would notice.
    expect(balance.encounter.encounterTileFraction).toBeGreaterThan(0);
    expect(balance.encounter.encounterTileFraction).toBeLessThanOrEqual(1);
    // The half-tick battle charge is the fourth, and it is what makes the budget a budget rather
    // than a multiplication: fighting spends the same meter foraying does.
    expect(balance.clock.battleTicks).toBeGreaterThan(0);
    // The Ancient gate is a tag, not a hard-coded id list (bible §4 sign-card chains).
    expect(balance.encounter.signChainGatedHabitatTag).toBe("hidden");
    // The reference player the over-catch gate assumes is stated, not assumed.
    expect(balance.harness.overcatch.yearsBudget).toBe(1); // build-doc §1: hammered in YEAR ONE
    expect(balance.catch.snareTier[balance.harness.overcatch.snareTier]).toBeGreaterThan(0);
    expect(balance.catch.baitMult[balance.harness.overcatch.baitMatch]).toBeGreaterThan(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
describe("referential integrity across the content files", () => {
  it("resolves every species movePool id to a real move", () => {
    const ids = new Set(movesFile.moves.map((m) => m.id));
    for (const s of species) {
      for (const [slot, id] of Object.entries(s.movePool)) {
        expect(ids.has(id), `${s.id}.movePool.${slot} = ${id}`).toBe(true);
      }
    }
    // Every move in the 28-pool is actually reachable by some line (nothing dead in the pool).
    const used = new Set(species.flatMap((s) => Object.values(s.movePool)));
    expect([...ids].filter((id) => !used.has(id)).sort()).toEqual([]);
  });

  it("gives every line the role move of its own adult role (species.json _movePoolRule)", () => {
    for (const s of species) {
      const roleMove = movesFile.moves.find((m) => m.id === s.movePool.role);
      const adultRole = s.role[balance.ecosim.webRoleAgeClass];
      // bible §3 defines five role moves for six roles, so AncientApex fields the
      // Apex move. Every other line must field its own role's move.
      expect(roleMove?.role, `${s.id} role move`).toBe(adultRole === "AncientApex" ? "Apex" : adultRole);
    }
  });

  it("resolves every gym slot to a real species line", () => {
    const ids = new Set(species.map((s) => s.id));
    for (const g of gyms) {
      for (const slot of [...g.slots, g.signature]) expect(ids.has(slot.lineId), `${g.id}: ${slot.lineId}`).toBe(true);
    }
  });

  it("gives every non-starter line at least one node to live in", () => {
    const placed = new Set(nodes.flatMap((n) => Object.keys(n.populations)));
    const unplaced = species.filter((s) => !s.habitat.includes("starter") && !placed.has(s.id)).map((s) => s.id);
    expect(unplaced).toEqual([]);
  });
});
