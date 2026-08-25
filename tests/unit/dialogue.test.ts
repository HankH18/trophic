/**
 * tests/unit/dialogue.test.ts — the gate on `data/dialogue.json` (build-doc §15 C7).
 *
 * Five jobs, in order of how much they can catch:
 *
 *  1. **The schema BINDS.** `core/dialogue-schema.ts` must reject a malformed entry, not repair it.
 *     Every corruption below is checked for the specific field its complaint should name, not merely
 *     for "something threw".
 *  2. **G2 — nothing invented.** Every creature, place, person and organisation named in a line must
 *     already exist in `data/species.json`, `data/nodes/`, `data/gyms.json` or a capped bible list.
 *     Read off disk (like tests/unit/transcription.test.ts), deliberately NOT through the schema, so
 *     a widened schema cannot hide a drift. Two rules: a per-token rule and a multi-word place rule,
 *     because a per-token rule alone lets "The Ash Steppe" through.
 *  3. **Content truth.** Every diet, grazing, season and age claim the dialogue makes is checked
 *     against the thing that actually decides it — `core/foodweb.ts`'s derivation, `species.json`'s
 *     `seasonalWindow`, `balance.json`'s `age.yearsInClass`. Copy is content, and content can be
 *     wrong about its own game.
 *  4. **Budget + structure.** bible §13.13 (~10 lines per named NPC, ~3 per ambient, 400–500 total)
 *     with a real per-speaker ceiling, the three Ancient sign chains contiguous and REACHABLE, and
 *     the four lore surfaces bible §4 marks required content all present.
 *  5. **G7 — no moralizing copy about catching.** A vocabulary scan with positive controls (known-bad
 *     samples must be caught) and negative controls (real observational lines must not be).
 *
 *     **This is a vocabulary tripwire, not a G7 gate.** A regex cannot detect tone: "Nobody showed
 *     you when to stop." and "You could have left one." use no banned word and are reprimands.
 *     Those are caught only by the line-by-line judgement-vs-observation read recorded in
 *     docs/DIALOGUE-NOTES.md, which must be repeated by hand whenever lines are added.
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DIALOGUE_KINDS,
  DialogueValidationError,
  conditionHolds,
  selectEntry,
  validateDialogue,
  validateDialogueFile,
} from "@core/dialogue-schema";
import type { DialogueContext, DialogueEntry, DialogueFile, FlagValue } from "@core/dialogue-schema";
import { deriveFoodWeb, indexSpecies } from "@core/foodweb";
import { validateContent } from "@core/schemas";
import { ROLES, STATUS_NAMES, TYPE_NAMES } from "@core/types";

/* ── shipped files, read off disk ────────────────────────────────────────── */

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8")) as unknown;

interface RawSpeaker {
  id: string;
  name: string;
  kind: string;
  home?: string;
  portrait: string;
}
interface RawDialogue {
  _counts: { speakers: number; entries: number; lines: number };
  _chains: Record<string, string>;
  speakers: RawSpeaker[];
  entries: DialogueEntry[];
}
const raw = readJson("data/dialogue.json") as RawDialogue;

interface RawTrait {
  name: string;
}
const speciesRaw = readJson("data/species.json") as {
  species: { id: string; dexIds: string[]; formNames: Record<string, string>; seasonalWindow?: string }[];
};
const gymsRaw = readJson("data/gyms.json") as {
  gyms: {
    name: string;
    slots: { traits?: RawTrait[] }[];
    signature: { nickname?: string; traits?: RawTrait[] };
  }[];
};
const balanceRaw = readJson("data/balance.json") as {
  age: { yearsInClass: { J: number; A: number; E: number } };
};
const nodeFiles = readdirSync("data/nodes")
  .filter((f) => f.endsWith(".json"))
  .map((f) => readJson(`data/nodes/${f}`) as { id: string; name: string; props: { id: string }[] });

const NODE_IDS = new Set(nodeFiles.map((n) => n.id));
const PROP_IDS = new Set(nodeFiles.flatMap((n) => n.props.map((p) => p.id)));
const SPEAKER_IDS = new Set(raw.speakers.map((s) => s.id));
const ENTRY = new Map(raw.entries.map((e) => [e.id, e] as const));

const ALL_TEXTS: { entryId: string; text: string }[] = raw.entries.flatMap((e) => [
  ...e.lines.map((l) => ({ entryId: e.id, text: l.text })),
  ...(e.choices ?? []).map((c) => ({ entryId: e.id, text: c.text })),
]);

const LINE_COUNT = raw.entries.reduce((n, e) => n + e.lines.length, 0);

const bodyOf = (id: string): string => (ENTRY.get(id)?.lines ?? []).map((l) => l.text).join(" ");

/* ────────────────────────────────────────────────────────────────────────────
 * 1. The schema binds
 * ──────────────────────────────────────────────────────────────────────────── */

const clone = (): RawDialogue => JSON.parse(JSON.stringify(raw)) as RawDialogue;

/** Assert the mutation is rejected AND that the complaint names the field that is actually wrong. */
function expectRejected(mutate: (f: RawDialogue) => void, complaint: RegExp): void {
  const bad = clone();
  mutate(bad);
  let thrown: unknown;
  try {
    validateDialogueFile(bad);
  } catch (err) {
    thrown = err;
  }
  expect(thrown, "the schema accepted a malformed dialogue file").toBeDefined();
  expect(String(thrown)).toMatch(complaint);
}

describe("dialogue schema", () => {
  it("accepts the shipped data/dialogue.json", () => {
    const file: DialogueFile = validateDialogue();
    expect(file.entries.length).toBe(raw.entries.length);
    expect(file.speakers.length).toBe(raw.speakers.length);
  });

  it("the file's own _counts metadata is true", () => {
    expect(raw._counts.speakers).toBe(raw.speakers.length);
    expect(raw._counts.entries).toBe(raw.entries.length);
    expect(raw._counts.lines).toBe(LINE_COUNT);
  });

  it("throws DialogueValidationError, not a bare Error", () => {
    const bad = clone();
    bad.entries[0]!.speaker = "nobody-at-all";
    expect(() => validateDialogueFile(bad)).toThrow(DialogueValidationError);
  });

  it("rejects an unknown key on an entry (typo'd field is an error, not a silent drop)", () => {
    expectRejected((f) => {
      (f.entries[0] as unknown as Record<string, unknown>)["speeker"] = "maren";
    }, /speeker/);
  });

  it("rejects an entry with no lines", () => {
    expectRejected((f) => {
      f.entries[0]!.lines = [];
    }, /entries\[0\]\.lines/);
  });

  it("rejects an empty line body", () => {
    expectRejected((f) => {
      f.entries[0]!.lines[0]!.text = "";
    }, /entries\[0\]\.lines\[0\]\.text/);
  });

  it("rejects a speaker id that is not declared", () => {
    expectRejected((f) => {
      f.entries[0]!.speaker = "not-a-speaker";
    }, /not declared in speakers/);
  });

  it("rejects a node id that is not a real node", () => {
    expectRejected((f) => {
      f.entries[0]!.node = "atlantis";
    }, /is not a node in data\/nodes/);
  });

  it("rejects a propId that lives in a different node", () => {
    expectRejected((f) => {
      const e = f.entries.find((x) => x.propId !== undefined)!;
      e.propId = "hearthollow-signpost";
      e.node = "duskhollow";
    }, /lives in node/);
  });

  it("rejects a propId that exists in no node file", () => {
    expectRejected((f) => {
      f.entries.find((x) => x.propId !== undefined)!.propId = "invented-prop";
    }, /is not a prop in any node file/);
  });

  it("rejects a goto that points at no entry", () => {
    expectRejected((f) => {
      f.entries[0]!.goto = "nowhere.at.all";
    }, /goto "nowhere\.at\.all" is not an entry id/);
  });

  it("rejects a choice goto that points at no entry", () => {
    const branching = raw.entries.find((e) => (e.choices ?? []).some((c) => c.goto !== undefined));
    expect(branching, "no branching entry to mutate").toBeDefined();
    expectRejected((f) => {
      f.entries.find((x) => x.id === branching!.id)!.choices![0]!.goto = "nowhere.at.all";
    }, /choice goto "nowhere\.at\.all" is not an entry id/);
  });

  it("rejects a signChain no prop placement declares", () => {
    expectRejected((f) => {
      f.entries.find((x) => x.signChain !== undefined)!.signChain = "griffin-chain";
    }, /is not declared by any prop placement/);
  });

  it("rejects a population condition naming a species line that does not exist", () => {
    expectRejected((f) => {
      f.entries.find((x) => (x.when?.population ?? []).length > 0)!.when!.population![0]!.lineId = "griffin-line";
    }, /unknown species line "griffin-line"/);
  });

  it("rejects a population condition naming a node that does not exist", () => {
    expectRejected((f) => {
      f.entries.find((x) => (x.when?.population ?? []).length > 0)!.when!.population![0]!.node = "atlantis";
    }, /population condition names unknown node "atlantis"/);
  });

  it("rejects chainStep without signChain", () => {
    expectRejected((f) => {
      f.entries.find((x) => x.signChain === undefined)!.chainStep = 3;
    }, /chainStep requires signChain/);
  });

  it("rejects a prop-kind entry with no propId", () => {
    expectRejected((f) => {
      delete f.entries.find((x) => x.kind === "prop")!.propId;
    }, /must name its propId/);
  });

  it("rejects duplicate entry ids", () => {
    expectRejected((f) => {
      f.entries.push(JSON.parse(JSON.stringify(f.entries[0])) as DialogueEntry);
    }, /duplicate entry id/);
  });

  it("rejects duplicate speaker ids", () => {
    expectRejected((f) => {
      f.speakers.push({ ...f.speakers[0]! });
    }, /duplicate speaker id/);
  });

  it("rejects a speaker home that is not a node", () => {
    expectRejected((f) => {
      f.speakers.find((s) => s.home !== undefined)!.home = "atlantis";
    }, /is not a node in data\/nodes/);
  });

  it("rejects a condition that uses both `years` and a year range", () => {
    expectRejected((f) => {
      f.entries.find((x) => (x.when?.years ?? []).length > 0)!.when!.yearMin = 2;
    }, /never both/);
  });

  it("rejects an out-of-range year", () => {
    expectRejected((f) => {
      f.entries.find((x) => (x.when?.years ?? []).length > 0)!.when!.years = [7];
    }, /when\.years\[0\]/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Reference integrity (asserted directly, not only via the schema)
 * ──────────────────────────────────────────────────────────────────────────── */

describe("dialogue references resolve", () => {
  it("every entry speaker is a declared NPC", () => {
    expect(raw.entries.filter((e) => !SPEAKER_IDS.has(e.speaker)).map((e) => `${e.id} -> ${e.speaker}`)).toEqual([]);
  });

  it("every line-level speaker override is a declared NPC", () => {
    expect(
      raw.entries.flatMap((e) =>
        e.lines
          .filter((l) => l.speaker !== undefined && !SPEAKER_IDS.has(l.speaker))
          .map((l) => `${e.id} -> ${String(l.speaker)}`),
      ),
    ).toEqual([]);
  });

  it("every entry node is a real node in data/nodes/", () => {
    expect(raw.entries.filter((e) => !NODE_IDS.has(e.node)).map((e) => `${e.id} -> ${e.node}`)).toEqual([]);
  });

  it("every speaker home is a real node", () => {
    expect(
      raw.speakers
        .filter((s) => s.home !== undefined && !NODE_IDS.has(s.home))
        .map((s) => `${s.id} -> ${String(s.home)}`),
    ).toEqual([]);
  });

  it("every propId is a real prop placement", () => {
    expect(
      raw.entries
        .filter((e) => e.propId !== undefined && !PROP_IDS.has(e.propId))
        .map((e) => `${e.id} -> ${String(e.propId)}`),
    ).toEqual([]);
  });

  it("every declared speaker is actually used (no dead NPC rows)", () => {
    const used = new Set(raw.entries.map((e) => e.speaker));
    expect(raw.speakers.filter((s) => !used.has(s.id)).map((s) => s.id)).toEqual([]);
  });

  it("every entry kind is in the closed vocabulary", () => {
    const kinds = new Set<string>(DIALOGUE_KINDS);
    expect(raw.entries.filter((e) => !kinds.has(e.kind)).map((e) => e.id)).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 3. G2 — every name in a line already exists
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * RULE A (per token). A capitalised token passes if
 *   (a) it is a name that already exists in the shipped **data** — species form/dex names, node ids
 *       and node display names, gym-leader names, nicknames and trait names, OR
 *   (b) it is a capitalised term from the game's own closed vocabulary (types, roles, statuses, and
 *       the capped `DOMAIN_NOUNS`), OR
 *   (c) the same word also appears in LOWERCASE somewhere in the corpus — what an ordinary English
 *       word that merely started a sentence does, and what an invented proper noun never does, OR
 *   (d) it is in the capped `BIBLE_NAMES` / `COINED_NPC_NAMES` / `ORDINARY_WORDS` lists.
 *
 * The allow-list is built from `data/` and these capped lists ONLY — **never from dialogue.json's
 * own speaker table**, which would let the file certify its own inventions (a speaker row named
 * "Grimwyrm" would whitelist "Grimwyrm" for all prose in the same file).
 *
 * RULE B (multi-word places). Rule A is per token, so "The Ash Steppe" passes it: "Steppe" is a real
 * word of a real node name and "ash" appears lowercase in the corpus. So every occurrence of
 * `<Capitalised> <place-head>` must be a canonical pair taken from a node's display name.
 * Sentence-initial first words are skipped — they are ordinary words, and rule A already vets them.
 */

/** Proper nouns from docs/content-bible.md that exist in no shipped data file. Capped. */
const BIBLE_NAMES = [
  "Fallowmere", // bible §0 — the region
  "Cullbrand", // bible §8 — the antagonist company
  "Maren", // bible §8 — mentor
  "Wick", // bible §8 — rival
  "Bram", // bible §10 — Cindershelf forge-smith
  "Sel", // bible §10 — Brackwater ferryman
] as const;

/** Quest-NPC given names coined for this file (docs/DIALOGUE-NOTES.md D-1). Capped. */
const COINED_NPC_NAMES = ["Tolm", "Nessa", "Halder", "Pell", "Gerta", "Ives", "Orrin"] as const;

/** Capitalised domain nouns that are game vocabulary rather than names. Capped. */
const DOMAIN_NOUNS = [
  "Instinct", // bible §2 — the fifth stat
  "Juvenile",
  "Adult",
  "Elder", // bible §2 — age classes, capitalised in play
  "Ancient", // bible §4 — Ancient Apex
  "Species",
  "Warden", // bible §8 — Maren's title
  "Magnate", // bible §7 — Greaves' title
  "Company", // bible §8 — the Cullbrand Company
] as const;

/**
 * Ordinary English words that appear only sentence-initially in this corpus, so rule (c) cannot
 * clear them. NOTHING that is a name, or part of one, may be added here — asserted below. Capped.
 */
const ORDINARY_WORDS = [
  "Apprenticeship",
  "Astronomers",
  "Beat",
  "Beaten",
  "Bed",
  "Breeding",
  "Coarse",
  "Cooled",
  "Corrections",
  "Deck",
  "Drought",
  "Drove",
  "Eyeless",
  "Fair",
  "Fewer",
  "Forage",
  "Fought",
  "Kiln",
  "Knowing",
  "Laid",
  "Later",
  "Miners",
  "Noted",
  "Painted",
  "Pick",
  "Pinned",
  "Pressed",
  "Rooms",
  "Salvage",
  "Slow",
  "Somebody",
  "Sounds",
  "Suit",
  "Twenty",
  "Unsentimental",
  "Win",
] as const;

const words = (s: string): string[] => s.match(/[A-Za-z]+/g) ?? [];

const SPECIES_NAMES = new Set(speciesRaw.species.flatMap((s) => [...s.dexIds, ...Object.values(s.formNames)]));

const gymTraitNames = gymsRaw.gyms.flatMap((g) => [
  ...(g.signature.traits ?? []).map((t) => t.name),
  ...g.slots.flatMap((s) => (s.traits ?? []).map((t) => t.name)),
]);

const KNOWN_NAMES = new Set<string>([
  ...SPECIES_NAMES,
  ...nodeFiles.flatMap((n) => [n.name, ...words(n.name), n.id]),
  ...gymsRaw.gyms.flatMap((g) => [...words(g.name), ...words(g.signature.nickname ?? "")]),
  ...gymTraitNames.flatMap(words),
  ...BIBLE_NAMES,
  ...COINED_NPC_NAMES,
  ...DOMAIN_NOUNS,
  ...ORDINARY_WORDS,
  ...TYPE_NAMES,
  ...ROLES,
  ...STATUS_NAMES,
]);

const LOWERCASE_CORPUS = new Set(
  ALL_TEXTS.flatMap(({ text }) => text.match(/\b[a-z][a-z'-]*\b/g) ?? []).map((w) => w.replace(/'.*$/, "")),
);

function proseNameIsKnown(token: string): boolean {
  const base = token.replace(/'.*$/, "");
  const title = base.length > 1 && base === base.toUpperCase() ? base[0]! + base.slice(1).toLowerCase() : base;
  const singular = title.replace(/s$/, "");
  if (KNOWN_NAMES.has(title) || KNOWN_NAMES.has(singular) || KNOWN_NAMES.has(base)) return true;
  return LOWERCASE_CORPUS.has(title.toLowerCase()) || LOWERCASE_CORPUS.has(singular.toLowerCase());
}

/** The last word of every node display name — the geographic head nouns. */
const PLACE_HEADS = new Set(nodeFiles.map((n) => words(n.name).at(-1)!));
/** Adjacent word pairs inside a node display name, minus a leading article. */
const CANONICAL_PLACE_PAIRS = new Set(
  nodeFiles.flatMap((n) => {
    const w = words(n.name).filter((x) => x !== "The");
    return w.slice(0, -1).map((a, i) => `${a} ${w[i + 1]!}`);
  }),
);

/** `<Capitalised> <place-head>` pairs in a text, skipping sentence-initial first words. */
function placePairs(text: string): string[] {
  const out: string[] = [];
  // Lookahead so the matches OVERLAP: in "The Ash Steppe" a consuming regex would take
  // "The Ash" and never see "Ash Steppe", which is the pair that matters.
  for (const m of text.matchAll(/([A-Z][a-z]+)(?=\s+([A-Z][a-z]+))/g)) {
    const before = text.slice(0, m.index).replace(/\s+$/, "");
    if (before === "" || /[.!?:—]$/.test(before)) continue;
    if (PLACE_HEADS.has(m[2]!)) out.push(`${m[1]!} ${m[2]!}`);
  }
  return out;
}

describe("G2 — no invented names in dialogue", () => {
  it("rule A: every capitalised word in every line resolves to existing content", () => {
    const offenders = new Set<string>();
    for (const { text } of ALL_TEXTS) {
      for (const token of text.match(/\b[A-Z][A-Za-z]*(?:'[a-z]+)?\b/g) ?? []) {
        if (/^I('m|'d|'ve|'ll)?$/.test(token)) continue;
        if (!proseNameIsKnown(token)) offenders.add(token);
      }
    }
    expect([...offenders].sort()).toEqual([]);
  });

  it("rule B: every multi-word place name is a canonical one", () => {
    const offenders = new Set<string>();
    for (const { text } of ALL_TEXTS) {
      for (const pair of placePairs(text)) if (!CANONICAL_PLACE_PAIRS.has(pair)) offenders.add(pair);
    }
    expect([...offenders].sort()).toEqual([]);
  });

  it("rule A bites — an invented single-word name is caught", () => {
    for (const bad of ["Grimwyrm", "Ashenvale", "Thornmere"]) expect(proseNameIsKnown(bad), bad).toBe(false);
  });

  it("rule B bites — an invented place built from real words is caught", () => {
    for (const bad of ["The Ash Steppe", "Meadow Vale", "Cinder Reach", "Fallow Approach", "Grim Hearthollow"]) {
      const pairs = placePairs(`He walked to ${bad} that morning.`);
      expect(
        pairs.some((p) => !CANONICAL_PLACE_PAIRS.has(p)),
        bad,
      ).toBe(true);
    }
  });

  it("rule B lets the real places through", () => {
    for (const good of ["Meadow Reach", "Cinder Steppe", "Duskhollow Vale", "Bowerdeep Wilds", "Sanctum Approach"]) {
      const pairs = placePairs(`He walked to ${good} that morning.`);
      expect(
        pairs.every((p) => CANONICAL_PLACE_PAIRS.has(p)),
        good,
      ).toBe(true);
    }
  });

  it("the scan lets real content through", () => {
    for (const name of ["Fenmaw", "Bogling", "Mirefin", "Vellsire", "Kilnback", "Undermere", "Brackmarsh", "Maren"]) {
      expect(proseNameIsKnown(name), name).toBe(true);
    }
  });

  it("the allow-list is not sourced from the dialogue file's own speaker table", () => {
    const src = readFileSync("tests/unit/dialogue.test.ts", "utf8");
    const block = src.slice(src.indexOf("const KNOWN_NAMES"), src.indexOf("const LOWERCASE_CORPUS"));
    expect(block).not.toMatch(/raw\.speakers/);
  });

  it("every escape-hatch list stays small, and none smuggles in a content name", () => {
    expect(BIBLE_NAMES.length).toBeLessThanOrEqual(8);
    expect(COINED_NPC_NAMES.length).toBeLessThanOrEqual(8);
    expect(DOMAIN_NOUNS.length).toBeLessThanOrEqual(12);
    expect(ORDINARY_WORDS.length).toBeLessThanOrEqual(45);
    for (const w of ORDINARY_WORDS) {
      expect(
        gymTraitNames.some((t) => words(t).includes(w)),
        `${w} is part of a trait name`,
      ).toBe(false);
      expect(SPECIES_NAMES.has(w), `${w} is a species name`).toBe(false);
      expect(PLACE_HEADS.has(w), `${w} is a place head`).toBe(false);
    }
  });

  it("every unaccounted capitalised token resolves to a shipped species", () => {
    // Not a tautology: the candidate set is "capitalised token nothing else accounts for", and the
    // assertion is that each one IS a species. An invented creature lands here and fails.
    const accounted = new Set<string>([
      ...nodeFiles.flatMap((n) => words(n.name)),
      ...nodeFiles.map((n) => n.id),
      ...gymsRaw.gyms.flatMap((g) => [...words(g.name), ...words(g.signature.nickname ?? "")]),
      ...gymTraitNames.flatMap(words),
      ...BIBLE_NAMES,
      ...COINED_NPC_NAMES,
      ...DOMAIN_NOUNS,
      ...ORDINARY_WORDS,
      ...TYPE_NAMES,
      ...ROLES,
      ...STATUS_NAMES,
    ]);
    const used = new Set<string>();
    for (const { text } of ALL_TEXTS) {
      for (const token of text.match(/\b[A-Z][a-z]+\b/g) ?? []) {
        const singular = token.replace(/s$/, "");
        if (accounted.has(token) || accounted.has(singular)) continue;
        if (LOWERCASE_CORPUS.has(token.toLowerCase()) || LOWERCASE_CORPUS.has(singular.toLowerCase())) continue;
        used.add(SPECIES_NAMES.has(token) ? token : singular);
      }
    }
    expect(used.size, "the corpus should actually name a lot of the roster").toBeGreaterThanOrEqual(15);
    for (const n of used) expect(SPECIES_NAMES.has(n), `${n} is not a shipped species`).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Content truth — what the copy asserts vs what the game computes
 * ──────────────────────────────────────────────────────────────────────────── */

const content = validateContent();
const speciesIndex = indexSpecies(content.species);
const nodeById = new Map(content.nodes.map((n) => [n.id, n] as const));

function eats(nodeId: string, predator: string, prey: string): boolean {
  const node = nodeById.get(nodeId);
  if (node === undefined) return false;
  return (deriveFoodWeb(node, speciesIndex, content.balance).edges[predator] ?? []).includes(prey);
}
function feedsOnFlora(nodeId: string, lineId: string): boolean {
  const node = nodeById.get(nodeId);
  if (node === undefined) return false;
  return deriveFoodWeb(node, speciesIndex, content.balance).floraFeeders.includes(lineId);
}

/** Every predator→prey claim the dialogue makes, with the node the claim is about. */
const DIET_CLAIMS: { entry: string; node: string; predator: string; prey: string }[] = [
  { entry: "maren.crash-survey", node: "r4", predator: "pyrelisk-line", prey: "ashvole-line" },
  { entry: "gerta.quest.crash.done", node: "r4", predator: "pyrelisk-line", prey: "ashvole-line" },
  { entry: "gerta.quest.crash.done", node: "r4", predator: "stonewing-line", prey: "pyrelisk-line" },
  { entry: "sel.quest.wager.accepted", node: "brackwater", predator: "mirefin-line", prey: "reedrick-line" },
  { entry: "nessa.quest.restock.accepted", node: "brackwater", predator: "fenmaw-line", prey: "mirefin-line" },
  { entry: "amb.brackwater-buyer.base", node: "brackwater", predator: "fenmaw-line", prey: "mirefin-line" },
  { entry: "amb.hearthollow-elder.base", node: "hearthollow", predator: "skir-line", prey: "nibbin-line" },
  { entry: "maribel.greeting.reach-thin", node: "r1", predator: "skir-line", prey: "nibbin-line" },
  { entry: "amb.r1-forager.thin", node: "r1", predator: "skir-line", prey: "nibbin-line" },
  { entry: "amb.duskhollow-shepherd.base", node: "duskhollow", predator: "wispurr-line", prey: "umbrat-line" },
];

/** Every grazer→flora claim the dialogue makes. */
const FLORA_CLAIMS: { entry: string; node: string; grazer: string }[] = [
  { entry: "vesper.greeting", node: "bowerdeep", grazer: "barkhide-line" },
  { entry: "amb.bowerdeep-logger.base", node: "bowerdeep", grazer: "barkhide-line" },
  { entry: "amb.bowerdeep-logger.thin", node: "r3", grazer: "barkhide-line" },
  { entry: "bram.mine.expanding", node: "r4", grazer: "cragmar-line" },
  { entry: "amb.cindershelf-elder.base", node: "r4", grazer: "cragmar-line" },
  { entry: "gerta.quest.crash.done", node: "r4", grazer: "ashvole-line" },
  { entry: "gerta.quest.crash.done", node: "r4", grazer: "cragmar-line" },
  { entry: "amb.duskhollow-shepherd.base", node: "duskhollow", grazer: "umbrat-line" },
  { entry: "vendor-brackwater.shop", node: "brackwater", grazer: "reedrick-line" },
];

/**
 * Edges the derivation does NOT produce, kept here so a future change to the web is forced past a
 * review of the copy that describes it. Every one of these was a real defect at some point.
 */
const FORBIDDEN_EDGES: { node: string; predator: string; prey: string; why: string }[] = [
  {
    node: "bowerdeep",
    predator: "duskstalk-line",
    prey: "gloomoth-line",
    why: "Apex takes Mesopredators and LARGE Grazers only; Gloomoth is a Grazer with no sizeClass",
  },
  {
    node: "brackwater",
    predator: "mirefin-line",
    prey: "mirefin-line",
    why: "Bogling is the J form of mirefin-line and the web reads adult roles — this is self-predation",
  },
  {
    node: "r4",
    predator: "stonewing-line",
    prey: "cragmar-line",
    why: "Cragmar is a non-large Grazer, so the steppe Apex cannot take it",
  },
];

/**
 * Every entry whose lines use a predation or grazing verb, with HOW MANY such lines it has.
 * Counting, not just listing, means adding a diet line to an already-reviewed entry also trips the
 * guard — which is exactly how "Duskstalk hunt the migration" got in the first time.
 */
const DIET_LINE_REVIEW = new Map<string, number>([
  ["amb.bowerdeep-logger.base", 1],
  ["amb.brackwater-dockhand.base", 1],
  ["amb.cindershelf-elder.base", 1],
  ["amb.duskhollow-shepherd.base", 1],
  ["amb.hearthollow-elder.base", 1],
  ["amb.hearthollow-forager.base", 1],
  ["amb.r1-forager.bloom", 1],
  ["amb.r1-forager.late", 1],
  ["bram.mine.expanding", 1],
  ["festival.brackwater", 1],
  ["gerta.quest.crash.done", 1],
  ["greaves.act4.steppe", 1],
  ["maren.crash-survey", 1],
  ["maren.keystone.1", 1],
  ["maren.tutorial.snare", 1],
  ["odo.post.win", 1],
  ["prop.r1-sign-forage", 1],
  ["prop.sanctum-antler-ring", 1],
  ["sel.quest.wager.accepted", 1],
  ["vendor-bowerdeep.shop", 1],
  ["vendor-hearthollow.shop", 1],
  ["vesper.greeting", 1],
  ["wick.act2.pre", 1],
  ["wick.act4.pre", 1],
]);

const PREDATION_VERB =
  /\b(eats?|ate|eaten|eating|hunts?|hunting|stalks?|stalking|preys?|graze[sd]?|grazing|brows(?:e|es|ing)|feeds? on)\b/i;

/** Which line a form name belongs to, so "Bogling" and "Mirefin" resolve to one line. */
const FORM_TO_LINE = new Map<string, string>(
  speciesRaw.species.flatMap((s) => Object.values(s.formNames).map((n) => [n, s.id] as const)),
);

describe("content truth — the copy against the game that computes it", () => {
  it("every diet claim in dialogue is an edge core/foodweb.ts actually derives", () => {
    expect(
      DIET_CLAIMS.filter((c) => !eats(c.node, c.predator, c.prey)).map(
        (c) => `${c.entry}: ${c.predator} -> ${c.prey} @ ${c.node}`,
      ),
    ).toEqual([]);
  });

  it("every grazing claim in dialogue is a flora edge core/foodweb.ts actually derives", () => {
    expect(
      FLORA_CLAIMS.filter((c) => !feedsOnFlora(c.node, c.grazer)).map(
        (c) => `${c.entry}: ${c.grazer} grazes @ ${c.node}`,
      ),
    ).toEqual([]);
  });

  it("every diet/grazing claim names an entry that still exists", () => {
    expect([...new Set([...DIET_CLAIMS, ...FLORA_CLAIMS].map((c) => c.entry).filter((id) => !ENTRY.has(id)))]).toEqual(
      [],
    );
  });

  it("the forbidden edges really are absent from the derivation (the table is not stale)", () => {
    expect(
      FORBIDDEN_EDGES.filter((f) => eats(f.node, f.predator, f.prey)).map(
        (f) => `${f.predator} -> ${f.prey} @ ${f.node} — ${f.why}`,
      ),
    ).toEqual([]);
  });

  it("no line makes a predation claim between two forms of the SAME line (self-predation)", () => {
    const offenders: string[] = [];
    for (const e of raw.entries) {
      for (const l of e.lines) {
        if (!PREDATION_VERB.test(l.text)) continue;
        const byLine = new Map<string, Set<string>>();
        for (const [form, lineId] of FORM_TO_LINE) {
          if (new RegExp(`\\b${form}s?\\b`).test(l.text)) {
            byLine.set(lineId, (byLine.get(lineId) ?? new Set()).add(form));
          }
        }
        for (const [lineId, forms] of byLine) {
          // Two forms of one line in a sentence with a predation verb is a diet claim the web
          // cannot produce — unless the line explicitly says they are one line, which is the point
          // odo.post.win makes on purpose.
          if (forms.size > 1 && !/one line|same line|same animal/i.test(l.text)) {
            offenders.push(`${e.id}: ${[...forms].join(" + ")} -> ${lineId}: ${l.text}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the predation-verb lines are exactly the hand-reviewed ones, count for count", () => {
    // Adding a diet line — even to an entry already on the list — fails until it is reviewed.
    const actual = new Map<string, number>();
    for (const e of raw.entries) {
      const n = e.lines.filter((l) => PREDATION_VERB.test(l.text)).length;
      if (n > 0) actual.set(e.id, n);
    }
    const diff: string[] = [];
    for (const [id, n] of actual) {
      const want = DIET_LINE_REVIEW.get(id);
      if (want !== n) diff.push(`${id}: ${String(n)} diet line(s), reviewed ${String(want ?? 0)}`);
    }
    for (const [id, n] of DIET_LINE_REVIEW) {
      if (!actual.has(id)) diff.push(`${id}: reviewed ${String(n)} but has no diet line now`);
    }
    expect(diff.sort()).toEqual([]);
  });

  it("the review set has no stale rows", () => {
    expect([...DIET_LINE_REVIEW.keys()].filter((id) => !ENTRY.has(id))).toEqual([]);
  });

  it("every seasonal claim matches species.json seasonalWindow (bible §5 migrants)", () => {
    const seasonOf = new Map(speciesRaw.species.map((s) => [s.id, s.seasonalWindow] as const));
    const CLAIMS: { entry: string; lineId: string; season: string }[] = [
      { entry: "maren.quest.first-signs.offer", lineId: "pollywisp-line", season: "spring" },
      { entry: "amb.hearthollow-forager.base", lineId: "pollywisp-line", season: "spring" },
      { entry: "vendor-brackwater.shop", lineId: "reedrick-line", season: "summer" },
      { entry: "amb.brackwater-netmender.base", lineId: "reedrick-line", season: "summer" },
      { entry: "pell.quest.lanternless.offer", lineId: "gloomoth-line", season: "autumn" },
      { entry: "amb.bowerdeep-lampkeeper.base", lineId: "gloomoth-line", season: "autumn" },
      { entry: "wick.act5.loss", lineId: "wispurr-line", season: "winter" },
      { entry: "amb.duskhollow-astronomer.base", lineId: "wispurr-line", season: "winter" },
      { entry: "vendor-duskhollow.shop", lineId: "wispurr-line", season: "winter" },
    ];
    expect(
      CLAIMS.filter((c) => seasonOf.get(c.lineId) !== c.season).map(
        (c) => `${c.entry}: claims ${c.lineId} is ${c.season}, species.json says ${String(seasonOf.get(c.lineId))}`,
      ),
    ).toEqual([]);
    // and the claim actually appears in the entry, so the table cannot drift off the copy
    for (const c of CLAIMS) expect(bodyOf(c.entry).toLowerCase(), c.entry).toContain(c.season);
  });

  it("a line that names the current season is gated on it", () => {
    // Otherwise a winter line fires in summer and states a falsehood.
    const offenders: string[] = [];
    for (const e of raw.entries) {
      for (const l of e.lines) {
        const m = /\bit is (spring|summer|autumn|winter)\b/i.exec(l.text);
        if (m && !(e.when?.seasons ?? []).includes(m[1]!.toLowerCase() as never)) {
          offenders.push(`${e.id}: "${l.text}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the starter age-form years match balance.json age.yearsInClass", () => {
    // A juvenile taken in year 1 is Adult after yearsInClass.J and Elder after J + A.
    const y = balanceRaw.age.yearsInClass;
    const NUMBER_WORD = ["zero", "one", "two", "three", "four", "five", "six"];
    const adultYear = NUMBER_WORD[1 + y.J]!;
    const elderYear = NUMBER_WORD[1 + y.J + y.A]!;
    for (const id of ["maren.starter.cindril", "maren.starter.puddlisk", "maren.starter.thornlet"]) {
      const body = bodyOf(id);
      expect(body, `${id} must name the adult year (${adultYear})`).toMatch(new RegExp(`\\b${adultYear}\\b`));
      expect(body, `${id} must name the elder year (${elderYear})`).toMatch(new RegExp(`\\b${elderYear}\\b`));
    }
  });

  it("the vanishing has one duration across every entry that states it", () => {
    const DURATION = /\b(two|three|four) decades\b|\b(twenty|thirty|forty) years\b/gi;
    const stated = new Set<string>();
    for (const e of raw.entries) {
      if (e.signChain !== "vellsire-chain" && !e.id.startsWith("orrin.")) continue;
      for (const l of e.lines) {
        for (const m of l.text.matchAll(DURATION)) {
          const v = (m[1] ?? m[2] ?? "").toLowerCase();
          stated.add(v === "two" || v === "twenty" ? "20" : v === "three" || v === "thirty" ? "30" : "40");
        }
      }
    }
    expect([...stated].sort(), "the Vellsire chain states more than one duration").toHaveLength(1);
  });

  it("the Cullbrand steppe contract has one duration across every speaker", () => {
    const stated = new Set<string>();
    for (const id of ["wick.act4.pre", "greaves.act4.steppe", "amb.cindershelf-worker.base"]) {
      for (const m of bodyOf(id).matchAll(/\b(four|five|six)[- ]year|\bfor (four|five|six) years\b/gi)) {
        stated.add((m[1] ?? m[2] ?? "").toLowerCase());
      }
    }
    expect([...stated].sort()).toEqual(["four", "six"]); // "a six-year contract, closed in four"
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 5. Budget (bible §13.13)
 * ──────────────────────────────────────────────────────────────────────────── */

function linesBySpeaker(): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of raw.entries) m.set(e.speaker, (m.get(e.speaker) ?? 0) + e.lines.length);
  return m;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * bible §13.13 budgets ~10 lines per named NPC. Four speakers legitimately exceed it: each carries
 * an Ancient lore chain or a six-act arc. They are named here with a ceiling, so "over budget" stays
 * a deliberate, bounded exception rather than an unbounded one.
 */
const NAMED_OVER_BUDGET: Record<string, number> = {
  maren: 72, // opening, tutorials, six keystone lectures, retirement, both epilogues
  wick: 40, // pre/post for six act battles
  sel: 34, // the whole Undermere chain plus the Ferryman's Wager
  bram: 24, // the whole Kilnback chain plus the forge
};
const NAMED_CEILING = 18;
const AMBIENT_CEILING = 9;
const PROP_CEILING = 30;

describe("dialogue budget — bible §13.13", () => {
  const per = linesBySpeaker();
  const idsOfKind = (k: string): string[] => raw.speakers.filter((s) => s.kind === k).map((s) => s.id);

  it('is "roughly 400–500 lines total"', () => {
    expect(LINE_COUNT).toBeGreaterThanOrEqual(400);
    expect(LINE_COUNT).toBeLessThanOrEqual(500);
  });

  it('named NPCs sit around "~10 lines" each', () => {
    const counts = idsOfKind("named").map((id) => per.get(id) ?? 0);
    expect(counts.length).toBeGreaterThanOrEqual(15);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(6);
    expect(median(counts)).toBeGreaterThanOrEqual(8);
    expect(median(counts)).toBeLessThanOrEqual(16);
  });

  it("no named NPC exceeds its ceiling (the budget has a real upper bound)", () => {
    expect(
      idsOfKind("named")
        .map((id) => [id, per.get(id) ?? 0] as const)
        .filter(([id, n]) => n > (NAMED_OVER_BUDGET[id] ?? NAMED_CEILING))
        .map(([id, n]) => `${id}=${n} (ceiling ${NAMED_OVER_BUDGET[id] ?? NAMED_CEILING})`),
    ).toEqual([]);
  });

  it("the over-budget list names only speakers that carry a chain or a six-act arc", () => {
    for (const id of Object.keys(NAMED_OVER_BUDGET)) {
      const carriesChain = raw.entries.some((e) => e.speaker === id && e.signChain !== undefined);
      const carriesArc = raw.entries.filter((e) => e.speaker === id && e.kind === "battle-pre").length >= 5;
      expect(carriesChain || carriesArc, `${id} is over budget for no declared reason`).toBe(true);
    }
    expect(Object.keys(NAMED_OVER_BUDGET).length).toBeLessThanOrEqual(5);
  });

  it('ambient NPCs sit around "~3 lines" each, and none runs away', () => {
    const counts = idsOfKind("ambient").map((id) => per.get(id) ?? 0);
    expect(counts.length).toBeGreaterThanOrEqual(24);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
    expect(median(counts)).toBe(3);
    expect(Math.max(...counts)).toBeLessThanOrEqual(AMBIENT_CEILING);
  });

  it("prop and generic speakers are budgeted too", () => {
    for (const id of idsOfKind("prop")) expect(per.get(id) ?? 0, id).toBeLessThanOrEqual(PROP_CEILING);
    for (const id of idsOfKind("generic")) expect(per.get(id) ?? 0, id).toBeLessThanOrEqual(6);
    expect(idsOfKind("prop").length).toBeGreaterThan(0);
    expect(idsOfKind("generic").length).toBeGreaterThan(0);
  });

  it("every one of the six bible §7 leaders and the three §8 principals speaks", () => {
    for (const id of ["maren", "wick", "greaves", "maribel", "odo", "vesper", "sable", "noct", "bram", "sel"]) {
      expect(per.get(id) ?? 0, id).toBeGreaterThan(0);
    }
  });

  it("every node has some dialogue", () => {
    const nodesWithLines = new Set(raw.entries.map((e) => e.node));
    for (const n of nodeFiles) expect(nodesWithLines.has(n.id), n.id).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 6. The three Ancient sign chains (bible §4 required lore surfaces)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Flags dialogue REQUIRES but never sets: granted by game systems (quest turn-ins, the retirement
 * flow, the festival event, the Vellsire encounter's outcome). Asserted exactly, so a typo'd flag
 * shows up as a NEW external requirement and fails, instead of quietly making a chain unreachable
 * by being assumed external.
 */
const EXTERNAL_FLAGS = [
  "event.festival.open",
  "lifecycle.first-retirement",
  "quest.after-the-crash.turnin",
  "quest.fallow-field.turnin",
  "quest.ferrymans-wager.turnin",
  "quest.first-signs.turnin",
  "quest.forge-a-legacy.turnin",
  "quest.lanternless-night.turnin",
  "quest.restock-the-shallows.turnin",
  "quest.silk-shortage.turnin",
  "quest.star-census.milestone",
  "quest.vellsires-trail.turnin",
  "story.vellsire.outcome",
  "story.vellsire.resolved",
] as const;

const truthy = (v: FlagValue): boolean => v !== false;

function flagsSetByDialogue(): Set<string> {
  const s = new Set<string>();
  const add = (bag: Record<string, FlagValue> | undefined): void => {
    for (const [k, v] of Object.entries(bag ?? {})) if (truthy(v)) s.add(k);
  };
  for (const e of raw.entries) {
    add(e.setFlags);
    for (const c of e.choices ?? []) add(c.setFlags);
  }
  return s;
}

function flagsRequiredByDialogue(): Set<string> {
  const s = new Set<string>();
  for (const e of raw.entries) {
    for (const k of e.when?.flagsSet ?? []) s.add(k);
    for (const fe of e.when?.flagEquals ?? []) s.add(fe.key);
  }
  return s;
}

/**
 * Fixpoint over what a player can hold. **Value-aware**: a `flagEquals` requirement is satisfied only
 * by an entry that sets that key to that VALUE (or by an external grant, which may carry any value).
 * Keying on the bare key made a `"catch"` / `"caught"` mismatch invisible.
 */
function reachableFlags(): Set<string> {
  const acquired = new Set<string>();
  for (const f of EXTERNAL_FLAGS) {
    acquired.add(f);
    acquired.add(`${f}=*`);
  }
  const satisfies = (key: string, value: FlagValue): boolean =>
    acquired.has(`${key}=${String(value)}`) || acquired.has(`${key}=*`);

  let changed = true;
  while (changed) {
    changed = false;
    for (const e of raw.entries) {
      if (!(e.when?.flagsSet ?? []).every((k) => acquired.has(k))) continue;
      if (!(e.when?.flagEquals ?? []).every((fe) => satisfies(fe.key, fe.value))) continue;
      const grants: Record<string, FlagValue>[] = [e.setFlags ?? {}, ...(e.choices ?? []).map((c) => c.setFlags ?? {})];
      for (const bag of grants) {
        for (const [k, v] of Object.entries(bag)) {
          if (!truthy(v)) continue;
          if (!acquired.has(k)) {
            acquired.add(k);
            changed = true;
          }
          if (!acquired.has(`${k}=${String(v)}`)) {
            acquired.add(`${k}=${String(v)}`);
            changed = true;
          }
        }
      }
    }
  }
  return acquired;
}

describe("Ancient lore chains — bible §4", () => {
  const chains = ["vellsire-chain", "undermere-chain", "kilnback-chain"] as const;
  const shortName = (c: string): string => c.replace("-chain", "");

  it("all three chains exist and are carried by more than one speaker", () => {
    for (const chain of chains) {
      const entries = raw.entries.filter((e) => e.signChain === chain);
      expect(entries.length, chain).toBeGreaterThanOrEqual(5);
      expect(new Set(entries.map((e) => e.speaker)).size, chain).toBeGreaterThanOrEqual(2);
    }
  });

  it("chain steps are 1..n, contiguous, and never duplicated", () => {
    for (const chain of chains) {
      const steps = raw.entries
        .filter((e) => e.signChain === chain && e.chainStep !== undefined)
        .map((e) => e.chainStep!)
        .sort((a, b) => a - b);
      expect(new Set(steps).size, `${chain} has duplicate steps`).toBe(steps.length);
      expect(steps[0], chain).toBe(1);
      expect(steps, `${chain} is not contiguous`).toEqual(steps.map((_, i) => i + 1));
      expect(steps.length, chain).toBeGreaterThanOrEqual(5);
    }
  });

  it("a chain opens step by step — no step is reachable before its predecessor", () => {
    for (const chain of chains) {
      const stepped = raw.entries
        .filter((e) => e.signChain === chain && (e.chainStep ?? 1) > 1)
        .filter((e) => (e.setFlags ?? {})[`chain.${shortName(chain)}.step${String(e.chainStep)}`] !== undefined);
      for (const e of stepped) {
        const prev = `chain.${shortName(chain)}.step${String(e.chainStep! - 1)}`;
        expect(e.when?.flagsSet ?? [], `${e.id} does not wait for ${prev}`).toContain(prev);
      }
      expect(stepped.length, chain).toBeGreaterThanOrEqual(4);
    }
  });

  it("no entry forbids a flag it also requires (a self-blocking condition)", () => {
    expect(
      raw.entries
        .filter((e) => (e.when?.flagsUnset ?? []).some((k) => (e.when?.flagsSet ?? []).includes(k)))
        .map((e) => e.id),
    ).toEqual([]);
  });

  it("a chain entry gates on the flag it grants, so it cannot re-fire forever", () => {
    expect(
      raw.entries
        .filter((e) => e.signChain !== undefined && e.setFlags !== undefined)
        .filter((e) => {
          const forbidden = new Set(e.when?.flagsUnset ?? []);
          return !Object.keys(e.setFlags ?? {}).some((g) => forbidden.has(g));
        })
        .map((e) => e.id),
    ).toEqual([]);
  });

  it("the set of externally-granted flags is exactly the documented list", () => {
    const set = flagsSetByDialogue();
    expect([...flagsRequiredByDialogue()].filter((f) => !set.has(f)).sort()).toEqual([...EXTERNAL_FLAGS].sort());
  });

  it("every chain is completable — its terminal flag is reachable", () => {
    const acquired = reachableFlags();
    for (const chain of chains) {
      expect(acquired.has(`chain.${shortName(chain)}.complete`), `${chain} is unreachable`).toBe(true);
    }
  });

  it("the fixpoint is value-aware — a caught/catch mismatch cannot pass", () => {
    // Direct probe of the sabotage that used to slip through.
    const acquired = reachableFlags();
    expect(acquired.has("story.vellsire.outcome=*")).toBe(true);
    expect(acquired.has("story.vellsire.attempt=catch")).toBe(true);
    expect(acquired.has("story.vellsire.attempt=nonsense")).toBe(false);
  });

  it("every side quest in bible §9 has a reachable completion", () => {
    const acquired = reachableFlags();
    for (const q of [
      "first-signs",
      "fallow-field",
      "restock-the-shallows",
      "ferrymans-wager",
      "silk-shortage",
      "lanternless-night",
      "after-the-crash",
      "forge-a-legacy",
      "vellsires-trail",
    ]) {
      expect(acquired.has(`quest.${q}.done`), `quest.${q}.done is unreachable`).toBe(true);
    }
  });

  it("both endings exist, gate on different outcomes, and speak in counts", () => {
    const epilogues = raw.entries.filter((e) => e.id.startsWith("maren.epilogue."));
    expect(epilogues.length).toBe(2);
    const outcomes = epilogues.map((e) => String(e.when?.flagEquals?.[0]?.value));
    expect(new Set(outcomes).size, "both epilogues gate on the same outcome value").toBe(2);
    for (const e of epilogues) expect(bodyOf(e.id), e.id).toMatch(/count|breeding|rate|coefficient/i);
  });

  it("a chain step is never gated to an EARLIER year than its predecessor", () => {
    // The flag fixpoint cannot see years, so a step moved back in time would look reachable.
    const earliest = (e: DialogueEntry): number =>
      e.when?.years !== undefined ? Math.min(...e.when.years) : (e.when?.yearMin ?? 1);
    for (const chain of chains) {
      const steps = raw.entries
        .filter((e) => e.signChain === chain && e.chainStep !== undefined)
        .sort((a, b) => a.chainStep! - b.chainStep!);
      let floor = 1;
      for (const e of steps) {
        expect(earliest(e), `${e.id} opens before its predecessor (year ${floor})`).toBeGreaterThanOrEqual(floor);
        floor = earliest(e);
      }
    }
  });

  it("every population condition names a count the node can actually reach", () => {
    // A `gte` above carryCap, or a `lte` below zero, is a condition that never fires.
    const caps = new Map<string, Map<string, number>>(
      content.nodes.map((n) => [n.id, new Map(Object.entries(n.populations).map(([k, v]) => [k, v.carryCap]))] as const),
    );
    const impossible: string[] = [];
    for (const e of raw.entries) {
      for (const c of e.when?.population ?? []) {
        const cap = caps.get(c.node)?.get(c.lineId);
        if (cap === undefined) {
          impossible.push(`${e.id}: ${c.lineId} does not live at ${c.node}`);
        } else if ((c.op === "gte" || c.op === "gt") && c.value > cap) {
          impossible.push(`${e.id}: ${c.lineId} ${c.op} ${String(c.value)} @ ${c.node}, carryCap ${String(cap)}`);
        }
      }
    }
    expect(impossible).toEqual([]);
  });

  it("the Vellsire outcome and attempt vocabularies are exactly the documented pair", () => {
    // The encounter writes `story.vellsire.outcome`; a typo on either side silently kills an ending.
    const ATTEMPTS = ["catch", "release"];
    const OUTCOMES = ["caught", "released"];
    const approach = ENTRY.get("sanctum.vellsire.approach")!;
    expect(
      (approach.choices ?? []).map((c) => String(c.setFlags?.["story.vellsire.attempt"])).sort(),
    ).toEqual(ATTEMPTS);
    expect(
      raw.entries
        .filter((e) => e.id.startsWith("maren.epilogue."))
        .map((e) => String(e.when?.flagEquals?.[0]?.value))
        .sort(),
    ).toEqual(OUTCOMES);
  });

  it("the Vellsire choice records an intent for the encounter to resolve, not the ending directly", () => {
    // bible §4 calls the Ancients "very hard catches" — a choice that jumps straight to "It's yours"
    // would skip the catch entirely.
    const approach = ENTRY.get("sanctum.vellsire.approach");
    expect(approach, "the Vellsire approach is missing").toBeDefined();
    expect(approach!.choices?.length).toBe(2);
    for (const c of approach!.choices ?? []) {
      expect(c.goto, "the choice must not jump straight to an epilogue").toBeUndefined();
      expect(Object.keys(c.setFlags ?? {})).toContain("story.vellsire.attempt");
    }
  });

  it("the four lore surfaces bible §4 calls required content are all present", () => {
    const textOf = (e: DialogueEntry): string => e.lines.map((l) => l.text).join(" ");

    // 1 — Sel's serpent tales (Undermere)
    const sel = raw.entries.filter((e) => e.speaker === "sel" && e.signChain === "undermere-chain");
    expect(sel.length, "Sel's serpent tales").toBeGreaterThanOrEqual(4);
    const selText = sel.map(textOf).join(" ");
    expect(selText).toMatch(/Undermere/);
    expect(selText).toMatch(/lake-beneath-the-lake/i);
    expect(selText).toMatch(/eyeless/i);

    // 2 — Bram and the miners on "the warm shell below" (Kilnback)
    const kiln = raw.entries.filter((e) => e.signChain === "kilnback-chain");
    expect(kiln.map((e) => e.speaker)).toContain("bram");
    expect(kiln.map((e) => e.speaker)).toContain("gerta");
    expect(kiln.map(textOf).join(" ")).toMatch(/warm shell below/i);
    expect(kiln.map(textOf).join(" ")).toMatch(/Kilnback|KILNBACK/);

    // 3 — Maren's keystone lectures (Vellsire)
    const keystone = raw.entries.filter((e) => e.speaker === "maren" && e.signChain === "vellsire-chain");
    expect(keystone.length, "Maren's keystone lectures").toBeGreaterThanOrEqual(5);
    expect(keystone.map(textOf).join(" ")).toMatch(/keystone/i);
    expect(keystone.map(textOf).join(" ")).toMatch(/Vellsire/);

    // 4 — Duskhollow astronomers on the Vellsire's vanishing
    const astro = raw.entries.filter(
      (e) => e.node === "duskhollow" && ["orrin", "ives", "duskhollow-astronomer"].includes(e.speaker),
    );
    const astroText = astro.map(textOf).join(" ");
    expect(astroText).toMatch(/vanishing/i);
    expect(astroText).toMatch(/Vellsire/);
    expect(astroText).toMatch(/margin|archive|log/i);
  });

  it("the file's own _chains documentation matches the shipped step counts", () => {
    for (const chain of chains) {
      const steps = raw.entries.filter((e) => e.signChain === chain && e.chainStep !== undefined).length;
      expect(raw._chains[chain], `${chain} doc`).toMatch(new RegExp(`Steps 1\\.\\.${String(steps)}\\b`));
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 7. Selection is total and unambiguous
 * ──────────────────────────────────────────────────────────────────────────── */

const emptyCtx: DialogueContext = { year: 1, season: "spring", flags: {}, populations: {}, floraStock: {} };

describe("dialogue selection", () => {
  it("every greeting/ambient group ships an unconditional fallback, so nobody is ever mute", () => {
    const groups = new Map<string, DialogueEntry[]>();
    for (const e of raw.entries) {
      if (e.kind !== "greeting" && e.kind !== "ambient") continue;
      const key = `${e.speaker}|${e.node}|${e.kind}`;
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    expect(groups.size).toBeGreaterThan(20);
    expect(
      [...groups.entries()]
        .filter(([, es]) => !es.some((e) => e.when === undefined || Object.keys(e.when).length === 0))
        .map(([k]) => k),
    ).toEqual([]);
  });

  it("a group never has two unconditional fallbacks (selection would be arbitrary)", () => {
    const counts = new Map<string, number>();
    for (const e of raw.entries) {
      if (e.when !== undefined && Object.keys(e.when).length > 0) continue;
      const key = `${e.speaker}|${e.node}|${e.kind}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  it("selectEntry returns the unconditional fallback with an empty context", () => {
    expect(selectEntry(validateDialogue(), "sel", "brackwater", "greeting", emptyCtx)?.id).toBe("sel.greeting");
  });

  it("a population clause actually switches the line", () => {
    const file = validateDialogue();
    const ctx = (mirefin: number): DialogueContext => ({
      ...emptyCtx,
      year: 4,
      populations: { r2: { "mirefin-line": mirefin } },
    });
    expect(selectEntry(file, "sel", "brackwater", "greeting", ctx(2))?.id).toBe("sel.docks.rotting");
    expect(selectEntry(file, "sel", "brackwater", "greeting", ctx(12))?.id).toBe("sel.docks.rebuilt");
    expect(selectEntry(file, "sel", "brackwater", "greeting", ctx(6))?.id).toBe("sel.greeting");
  });

  it("conditionHolds respects year, season, flags and flag VALUES", () => {
    expect(conditionHolds({ years: [2] }, { ...emptyCtx, year: 2 })).toBe(true);
    expect(conditionHolds({ years: [2] }, { ...emptyCtx, year: 3 })).toBe(false);
    expect(conditionHolds({ seasons: ["autumn"] }, { ...emptyCtx, season: "autumn" })).toBe(true);
    expect(conditionHolds({ seasons: ["autumn"] }, { ...emptyCtx, season: "winter" })).toBe(false);
    expect(conditionHolds({ flagsSet: ["a"] }, { ...emptyCtx, flags: { a: true } })).toBe(true);
    expect(conditionHolds({ flagsSet: ["a"] }, { ...emptyCtx, flags: { a: false } })).toBe(false);
    expect(conditionHolds({ flagsUnset: ["a"] }, emptyCtx)).toBe(true);
    expect(conditionHolds({ flagsUnset: ["a"] }, { ...emptyCtx, flags: { a: true } })).toBe(false);
    expect(conditionHolds({ flagEquals: [{ key: "x", value: "caught" }] }, { ...emptyCtx, flags: { x: "caught" } })).toBe(
      true,
    );
    expect(conditionHolds({ flagEquals: [{ key: "x", value: "caught" }] }, { ...emptyCtx, flags: { x: "catch" } })).toBe(
      false,
    );
  });

  it("the vertical slice is state-aware across years (bible §6 aging arcs)", () => {
    for (const node of ["hearthollow", "r1", "brackwater", "r2"]) {
      const here = raw.entries.filter((e) => e.node === node);
      const yearAware = here.filter((e) => e.when?.years !== undefined || e.when?.yearMin !== undefined);
      const stateAware = here.filter(
        (e) => (e.when?.population ?? []).length > 0 || (e.when?.floraStock ?? []).length > 0,
      );
      expect(yearAware.length, `${node} has no year-conditioned dialogue`).toBeGreaterThanOrEqual(3);
      expect(stateAware.length, `${node} has no population-conditioned dialogue`).toBeGreaterThanOrEqual(2);
    }
  });

  it("a line that asserts a depleted node is gated on that node's population", () => {
    // An unconditioned line cannot claim a species is absent — the ledger decides that, not the copy.
    const ABSENCE = /\bno (confirmed )?([A-Z][a-z]+)\b|\bthe ([A-Z][a-z]+) nest is empty\b/;
    const offenders: string[] = [];
    for (const e of raw.entries) {
      if ((e.when?.population ?? []).length > 0) continue;
      for (const l of e.lines) {
        const m = ABSENCE.exec(l.text);
        const name = m?.[2] ?? m?.[3];
        if (name !== undefined && SPECIES_NAMES.has(name)) offenders.push(`${e.id}: "${l.text}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 8. G7 — the moralizing-vocabulary tripwire
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * WHAT THIS CATCHES: explicit guilt/blame vocabulary, second-person accusation, the "lesson"
 * register, and the stock ecological-sermon phrases. Words that only ever appear in a reprimand are
 * banned outright even inside a negating sentence ("that isn't cruelty") — a scanner with exemptions
 * is not a scanner, so the copy is written around them instead.
 *
 * WHAT THIS CANNOT DO: detect tone. Every one of these is a reprimand and only some trip a pattern:
 *   "There were nine Fenmaw here the week you walked in. Say the number back to me."
 *   "I do not need the ledger to know which way you walked."
 * The control on those is the line-by-line read in docs/DIALOGUE-NOTES.md, not this list. Treat a
 * green scan as "no banned vocabulary", never as "G7 satisfied".
 */
const MORALIZING_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "fault", re: /\byour fault\b|\bat fault\b/i },
  { name: "blame", re: /\bblames?\b|\bblamed\b|\bblaming\b|\bto blame\b|\bhold \w+ against\b/i },
  { name: "guilt", re: /\bguilt\b|\bguilty\b/i },
  { name: "shame", re: /\bshame\b|\bshameful\b|\bashamed\b/i },
  { name: "you-did-this", re: /\byou (did|have done|'ve done) this\b/i },
  { name: "what-have-you-done", re: /\bwhat have you done\b/i },
  { name: "how-could-you", re: /\bhow could you\b/i },
  { name: "greed", re: /\bgreed\b|\bgreedy\b|\bselfish\b/i },
  { name: "cruelty", re: /\bcruel\b|\bcruelty\b|\bheartless\b|\bmerciless\b/i },
  { name: "shouldnt-have", re: /\bshould(n'?t| not) have (caught|taken|snared|hunted|killed|left)\b/i },
  { name: "could-have", re: /\bcould have (left|spared|stopped|walked away)\b/i },
  { name: "when-to-stop", re: /\bwhen to stop\b|\bknow when to\b/i },
  { name: "you-shouldnt", re: /\byou (should ?n'?t|should not|must ?n'?t|must not) (catch|take|snare|hunt|kill)\b/i },
  { name: "no-right", re: /\bno right to\b/i },
  { name: "lesson", re: /\blesson\b|\bteach you\b/i },
  { name: "moral", re: /\bmoral\b|\bmorally\b|\bimmoral\b/i },
  { name: "conscience", re: /\bconscience\b/i },
  { name: "sin", re: /\bsin\b|\bsinful\b|\bsins\b/i },
  { name: "evil", re: /\bevil\b|\bwicked\b|\bmonstrous\b/i },
  { name: "you-monster", re: /\byou monster\b/i },
  { name: "deserve", re: /\bdeserve[sd]?\b|\bdeserving\b/i },
  { name: "repent", re: /\brepent\b|\batone\b|\batonement\b|\bforgive (you|yourself)\b/i },
  { name: "karma", re: /\bkarma\b|\breckoning\b/i },
  { name: "poacher", re: /\bpoacher\b|\bpoachers\b|\bpoaching\b/i },
  { name: "slaughter", re: /\bslaughter\w*\b|\bmurder\w*\b|\bmassacre\w*\b|\bbutcher\w*\b/i },
  { name: "you-are-destroying", re: /\byou'?(re| are) (killing|ruining|destroying|wrecking|emptying)\b/i },
  { name: "you-destroyed", re: /\byou (ruined|destroyed|wrecked|emptied|killed) (it|this|them|us|everything|the)\b/i },
  { name: "hope-youre-happy", re: /\bhope you'?re (happy|proud|pleased)\b/i },
  { name: "be-proud", re: /\bwould be proud of you\b|\bproud of yourself\b/i },
  { name: "at-what-cost", re: /\bat what cost\b/i },
  { name: "worth-it", re: /\b(was|is) it worth it\b/i },
  { name: "think-about-what", re: /\bthink (about|of) what you\b/i },
  { name: "nature-sermon", re: /\bmother nature\b|\bbalance of nature\b|\bnature'?s (revenge|way)\b/i },
  { name: "land-will-judge", re: /\bthe \w+ will (remember|judge|never forgive)\b/i },
  { name: "youll-pay", re: /\byou'?(ll| will) (pay|answer) for\b/i },
  { name: "have-you-no", re: /\bhave you no\b/i },
  { name: "took-too-many", re: /\byou'?(ve| have)? ?(took|taken|caught|snared) too many\b/i },
  { name: "how-many-more", re: /\bleave them be\b|\bhow many more\b/i },
  { name: "not-an-accusation", re: /\bnot an accusation\b|\bnot accusing\b/i },
];

/** Deliberately moralizing samples. Every one must be caught, or the scan is decorative. */
const KNOWN_BAD = [
  "You should be ashamed of what you took out of this marsh.",
  "That's your fault. The Fenmaw are gone because of you.",
  "Was it worth it? Look at the shallows now.",
  "Every creature you snare is a life you had no right to take.",
  "I hope you're proud of yourself, warden.",
  "The meadow will remember what you did here.",
  "Poachers like you are why the count is down.",
  "Think about what you're doing before you set that snare.",
  "You've taken too many. Some day you'll learn the lesson.",
  "It's cruel, what you people do out there.",
  "How could you? There were only three left.",
  "You're destroying this marsh one snare at a time.",
  "Have you no conscience at all?",
  "How many more will you take before you stop?",
  "Maren showed you how to count. Nobody showed you when to stop.",
  "You could have left one.",
  "Wick would be proud of you.",
  "Every count you touch goes down. That is not an accusation, it is arithmetic.",
  "Numbers are the numbers; I don't hold books against people.",
];

/** Real observational lines from the file. None may trip the scan, or it is over-broad. */
const KNOWN_GOOD = [
  "The shallows used to take three nets. Now it's one.",
  "Haven't seen a Fenmaw this season.",
  "Meadow Reach is thin on Nibbin this season. I breed mine at home, so my count doesn't move when the Reach's does.",
  "The Company pays by the head and doesn't ask whose head. That's not sentiment. That's a price list.",
  "Buyer's contract prices the season off the Mirefin count in Brackmarsh. The count is what it is and so is the price.",
  "Walked the tussock line all morning for two Nibbin. It used to take about ten minutes.",
  "So the dock rots at the speed of the channel. That's not a saying. That's the accounting.",
];

const firstHit = (text: string): string | undefined => MORALIZING_PATTERNS.find((p) => p.re.test(text))?.name;

describe("G7 — moralizing-vocabulary tripwire", () => {
  it("catches every known-bad sample (the scan is not decorative)", () => {
    expect(KNOWN_BAD.filter((s) => firstHit(s) === undefined)).toEqual([]);
  });

  it("does not fire on plain observation (it is not over-broad)", () => {
    expect(KNOWN_GOOD.map((s) => [s, firstHit(s)] as const).filter(([, hit]) => hit !== undefined)).toEqual([]);
  });

  it("no shipped line matches a moralizing pattern", () => {
    expect(
      ALL_TEXTS.map(({ entryId, text }) => ({ entryId, text, hit: firstHit(text) }))
        .filter((h) => h.hit !== undefined)
        .map((h) => `${h.entryId} [${String(h.hit)}]: ${h.text}`),
    ).toEqual([]);
  });

  it("no shipped ENTRY matches one across its line breaks", () => {
    // The per-line scan cannot see a phrase split over two lines of the same entry.
    expect(
      raw.entries
        .map((e) => ({ id: e.id, hit: firstHit(bodyOf(e.id)) }))
        .filter((h) => h.hit !== undefined)
        .map((h) => `${h.id} [${String(h.hit)}]`),
    ).toEqual([]);
  });

  it("the epilogue states the cost of each ending in numbers, not in judgement", () => {
    for (const id of ["maren.epilogue.caught", "maren.epilogue.released"]) {
      const body = bodyOf(id);
      expect(body, id).not.toBe("");
      expect(firstHit(body), `${id} moralizes`).toBeUndefined();
      expect(body, `${id} does not state a rate`).toMatch(/rate|breeding|coefficient|count/i);
    }
  });

  it("no sentence is repeated across three or more speakers (the chorus check)", () => {
    // Individually-neutral lines become a chorus when three characters say the same thing.
    const bySentence = new Map<string, Set<string>>();
    for (const e of raw.entries) {
      for (const l of e.lines) {
        for (const s of l.text.split(/(?<=[.!?])\s+/)) {
          const key = s.toLowerCase().replace(/[^a-z ]/g, "").trim();
          if (key.split(" ").length < 4) continue;
          bySentence.set(key, (bySentence.get(key) ?? new Set()).add(e.speaker));
        }
      }
    }
    expect([...bySentence.entries()].filter(([, sp]) => sp.size >= 3).map(([k]) => k)).toEqual([]);
  });
});
