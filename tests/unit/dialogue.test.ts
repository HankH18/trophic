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
  ACT_GYM_IDS,
  DIALOGUE_KINDS,
  DialogueValidationError,
  FIRST_ACT,
  FIRST_YEAR,
  LAST_ACT,
  NOMINAL_YEARS,
  actFromFlags,
  conditionHolds,
  selectEntry,
  selectPropEntry,
  validateDialogue,
  validateDialogueFile,
} from "@core/dialogue-schema";
import type { DialogueContext, DialogueEntry, DialogueFile, FlagValue } from "@core/dialogue-schema";
import { actOf, awardBadge, badgeFlagFor, firstAct, lastAct } from "@core/acts";
import { deriveFoodWeb, indexSpecies } from "@core/foodweb";
import { validateContent } from "@core/schemas";
import { ROLES, STATUS_NAMES, TYPE_NAMES } from "@core/types";
import type { Balance, GymLeader } from "@core/types";

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
    id: string;
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
  .map(
    (f) =>
      readJson(`data/nodes/${f}`) as {
        id: string;
        name: string;
        props: { id: string }[];
        populations: Record<string, { count: number }>;
      },
  );

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

  /*
   * THE TWO PERMANENTLY-FALSE CLAUSES THE GLOBAL LINE CHECK LET THROUGH.
   *
   * `conditionHolds` reads `ctx.populations[node]?.[lineId]` and is false for ever once that is
   * `undefined`, so a real line at a node that never carried it is dead corpus — and so is a
   * threshold above the line's own `carryCap`. Both validated while the check was `LINE_IDS.has`,
   * which is a REGION-wide set. Neither is a hypothetical: the never-cut finale's
   * `sanctum.vellsire.approach` gates on `population sanctum/vellsire-line gte 1` against a line
   * shipped at `count 1, breedRate 0, carryCap 1` — one keystroke off and the beat is unreachable
   * with every test still green.
   */
  it("rejects a population condition reading a line the NODE does not carry", () => {
    expectRejected((f) => {
      const p = f.entries.find((x) => (x.when?.population ?? []).length > 0)!.when!.population![0]!;
      p.node = "hearthollow";
      p.lineId = "vellsire-line"; // a real line — but never at Hearthollow
    }, /has no population of that line — the clause can never hold/);
  });

  it("rejects a population threshold above that line's carryCap at that node", () => {
    expectRejected((f) => {
      const p = f.entries.find((x) => (x.when?.population ?? []).length > 0)!.when!.population![0]!;
      p.node = "sanctum";
      p.lineId = "vellsire-line";
      p.op = "gte";
      p.value = 2; // carryCap is 1
    }, /is above that line's carryCap 1 — the clause can never hold/);
  });

  it("still ACCEPTS the finale's own clause — the check refuses only the impossible direction", () => {
    const f = JSON.parse(JSON.stringify(raw)) as DialogueFile;
    const p = f.entries.find((x) => (x.when?.population ?? []).length > 0)!.when!.population![0]!;
    p.node = "sanctum";
    p.lineId = "vellsire-line";
    p.op = "gte";
    p.value = 1; // exactly the carryCap — reachable, and what the corpus ships
    expect(() => validateDialogueFile(f)).not.toThrow();
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
      f.entries.find((x) => x.when?.yearMin !== undefined)!.when!.years = [2];
    }, /never both/);
  });

  it("rejects a condition that uses both `act` and an act range", () => {
    expectRejected((f) => {
      f.entries.find((x) => (x.when?.act ?? []).length > 0)!.when!.actMin = 2;
    }, /never both/);
  });

  it("rejects a year below 1", () => {
    expectRejected((f) => {
      f.entries.find((x) => x.when?.yearMin !== undefined)!.when!.yearMin = 0;
    }, /when\.yearMin/);
  });

  /**
   * Q3 (the authorised L8 amendment): the calendar is UNBOUNDED. Year 7+ was rejected by the old
   * `max(clock.yearsTotal)` bound, which is exactly the assumption that made a year-8 run lose the
   * finale. A world-ageing line must be free to speak in year 12.
   */
  it("accepts a calendar year past the nominal span (Q3 — the calendar never ends)", () => {
    const far = clone();
    const target = far.entries.find((x) => x.when?.yearMin !== undefined)!;
    target.when!.yearMin = NOMINAL_YEARS * 5;
    expect(() => validateDialogueFile(far)).not.toThrow();
  });

  it("rejects an act past the last act (there is no act 7)", () => {
    expectRejected((f) => {
      f.entries.find((x) => (x.when?.act ?? []).length > 0)!.when!.act = [LAST_ACT + 1];
    }, /when\.act\[0\]/);
  });

  it("rejects an act below the prologue, and ACCEPTS the prologue itself", () => {
    // The bound is `balance.acts.first`, not 1. It was 1 — the gym COUNT stood in for the act
    // ladder — and a prologue-only line was therefore unauthorable while every new save sat in
    // the prologue. `maren.opening` ships `act: [0]`; if this bound ever creeps back up, the
    // game's first scene stops existing and only this assertion says so.
    expect(FIRST_ACT).toBe(firstAct(content.balance));
    expect(LAST_ACT).toBe(lastAct(content.balance));
    const ok = clone();
    ok.entries.find((x) => (x.when?.act ?? []).length > 0)!.when!.act = [FIRST_ACT];
    expect(() => validateDialogueFile(ok)).not.toThrow();
    expectRejected((f) => {
      f.entries.find((x) => (x.when?.act ?? []).length > 0)!.when!.act = [FIRST_ACT - 1];
    }, /when\.act\[0\]/);
  });

  it("rejects actMin above actMax", () => {
    expectRejected((f) => {
      const e = f.entries.find((x) => x.when?.actMin !== undefined)!;
      delete e.when!.actMin;
      e.when!.actMin = 4;
      e.when!.actMax = 2;
    }, /actMin must not exceed actMax/);
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

/** Quest-NPC given names coined for this file (docs/DIALOGUE-NOTES.md D-1). Capped.
 *  "Hetty" replaced "Nessa" on 2026-08-25 (DEVIATIONS D-Q2-4): Nessa is the Galar Gym Leader of
 *  Hulbury, a WATER-type specialist whose father is canonically a fisher — same name, same
 *  element, same role shape as our Brackwater angler. The SPEAKER ID `nessa` and every
 *  `nessa.*` entry id deliberately did not move; only the display name did (D-Q4-5). */
const COINED_NPC_NAMES = ["Tolm", "Hetty", "Halder", "Pell", "Gerta", "Ives", "Orrin"] as const;

/**
 * THE CAST, coined in `docs/CAST-AND-VOICE.md` §4 and enumerated verbatim in its Appendix D.
 * Appendix C5 required this as a THIRD capped list rather than a raise of `COINED_NPC_NAMES`,
 * whose cap of 8 is the property that stops the corpus inventing quest-givers: raising 7 -> 48
 * would void the assertion instead of extending it. Both original lists keep their exact values.
 *
 * The list gates the prose; the prose never gates the list. It is written out here rather than
 * derived from `raw.speakers`, because a speaker table that whitelists its own display names
 * would let the file certify its own inventions — `dialogue.test.ts` has a test for exactly that.
 *
 * Rule A scans line text, so strictly only names actually SPOKEN need to be here (today that is
 * Corbett, whom the Brackwater dockhand and Hetty's nephew both name). All 41 are listed anyway,
 * so a later cross-reference does not red the suite for a writer who had no way to know.
 */
const CAST_NAMES = [
  "Aldis", "Kett", "Judd", "Tibb", "Rask", "Tamsin", "Mott", "Elsbet", "Hild", "Gunn",
  "Parnel", "Jem", "Ulla", "Corbett", "Yule", "Zeb", "Garrow", "Cass", "Fitch", "Dunstan",
  "Whit", "Berit", "Annis", "Snell", "Nunn", "Ebba", "Cob", "Rowe", "Effie", "Hesk",
  "Bly", "Idony", "Fay", "Ingram", "Alwin", "Isbel", "Vann", "Hurst", "Slade", "Pinder", "Dorn",
] as const;

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
 *
 * RECOMPUTED against the rewritten corpus rather than extended. The list stood at 36 and 23 of
 * those words no longer appear anywhere in the copy, so keeping them would have been 23 live
 * escape hatches earning their place by history. It is now exactly the set rule A cannot clear on
 * its own: emptying the list and reading back the offenders yields these thirteen and nothing else.
 * Shrinking an allow-list is the direction that tightens the assertion — headroom under the cap is
 * a side effect, not the reason.
 */
const ORDINARY_WORDS = [
  "Beaten",
  "Bitten",
  "Children",
  "Coarse",
  "Drought",
  "Forage",
  "Instructions",
  "Invoices",
  "Pinned",
  "Poisonous",
  "Rent",
  "Wear",
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
  ...CAST_NAMES,
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
    expect(CAST_NAMES.length).toBeLessThanOrEqual(48);
    expect(ORDINARY_WORDS.length).toBeLessThanOrEqual(45);
    for (const n of CAST_NAMES) {
      expect(SPECIES_NAMES.has(n), `${n} is a species name`).toBe(false);
      expect(PLACE_HEADS.has(n), `${n} is a place head`).toBe(false);
      expect(
        gymTraitNames.some((t) => words(t).includes(n)),
        `${n} is part of a trait name`,
      ).toBe(false);
    }
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
      ...CAST_NAMES,
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
  { entry: "gerta.quest.crash.done", node: "r4", predator: "pyrelisk-line", prey: "cragmar-line" },
  { entry: "sel.quest.wager.accepted", node: "brackwater", predator: "mirefin-line", prey: "reedrick-line" },
  { entry: "odo.post.win", node: "brackwater", predator: "mirefin-line", prey: "reedrick-line" },
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
    expect(LINE_COUNT).toBeLessThanOrEqual(560);
    // RAISED 400-500 -> 400-560 (docs/DEVIATIONS.md D-BUDGET-1, authorised by Hank this
    // session). Two measured reasons: wiring the 39 unreachable entries added a finale loss
    // branch, which pinned the corpus at exactly 500/500 with no headroom; and the amended
    // prose standard (cast-and-voice.md Appendix F) favours plainer, baggier speech, which
    // sometimes means splitting one cramped line into two. The per-speaker ceilings below
    // are UNCHANGED, so the bound stays real — this raises the total, not the shape.
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
  /*
   * ⚠ `story.vellsire.resolved` and `story.vellsire.outcome` USED TO STAND HERE, and their standing
   * here was the defect rather than the contract: nothing in the repo wrote either one, so both
   * epilogues — build-doc §16's never-cut Vellsire beat — were unreachable while this list called
   * the gap "external" and every test stayed green. `sanctum.vellsire.approach`'s stand-aside branch
   * now resolves itself in its own `setFlags`, so the corpus writes both keys and neither is owed to
   * anybody; `game/finale.ts` resolves the snare branch, which the corpus structurally cannot.
   */
] as const;

/**
 * Keys the corpus DOES write, but for which the GAME supplies a value the corpus structurally
 * cannot.
 *
 * Exactly one: `story.vellsire.outcome`. `sanctum.vellsire.approach`'s stand-aside branch writes
 * `"released"` in its own `setFlags` — standing aside is complete the moment it is chosen — but only
 * a snare that actually HOLDS can write `"caught"`, and whether it holds is `core/battle.ts`'s
 * report, resolved by `game/finale.ts` `resolveVellsireCatch`. So the KEY is not owed to anybody
 * (which is why it is not in {@link EXTERNAL_FLAGS}) while one of its VALUES still is. Seeded as a
 * wildcard below, or the value-aware fixpoint reports the caught epilogue dead for the wrong reason.
 */
const GAME_VALUED_FLAGS = ["story.vellsire.outcome"] as const;

const truthy = (v: FlagValue): boolean => v !== false;

/** The earliest calendar year an entry can fire in. Q3: forward-open unless `yearMax` says otherwise. */
const earliestYear = (e: DialogueEntry): number =>
  e.when?.years !== undefined ? Math.min(...e.when.years) : (e.when?.yearMin ?? 1);

/**
 * The earliest act an entry can fire in.
 *
 * The default is `FIRST_ACT` (0 — the prologue), NOT 1. It was 1, which made this function return
 * the same answer for `act: [1]` and for no act clause at all, so a table of floors could not tell
 * "opens in act 1" from "has no act prerequisite" and a deleted `act: [1]` was invisible. The exact
 * act CLAUSE is what the split is asserted on now (`ACT_GATE` below); this helper survives only for
 * the chain-ordering and witness code, where a floor is the right question.
 */
const earliestAct = (e: DialogueEntry): number =>
  e.when?.act !== undefined ? Math.min(...e.when.act) : (e.when?.actMin ?? FIRST_ACT);

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
  for (const f of [...EXTERNAL_FLAGS, ...GAME_VALUED_FLAGS]) {
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
    for (const chain of chains) {
      const steps = raw.entries
        .filter((e) => e.signChain === chain && e.chainStep !== undefined)
        .sort((a, b) => a.chainStep! - b.chainStep!);
      let floor = 1;
      for (const e of steps) {
        expect(earliestYear(e), `${e.id} opens before its predecessor (year ${floor})`).toBeGreaterThanOrEqual(floor);
        floor = earliestYear(e);
      }
    }
  });

  /**
   * Q3 moved the chains off the calendar and onto the act axis, so the ordering invariant has to
   * move with them or it stops biting: with every chain step's year floor now 1, the year form
   * above passes for any arrangement whatsoever.
   */
  it("a chain step is never gated to an EARLIER act than its predecessor", () => {
    for (const chain of chains) {
      const steps = raw.entries
        .filter((e) => e.signChain === chain && e.chainStep !== undefined)
        .sort((a, b) => a.chainStep! - b.chainStep!);
      let floor = FIRST_ACT;
      for (const e of steps) {
        expect(earliestAct(e), `${e.id} opens before its predecessor (act ${floor})`).toBeGreaterThanOrEqual(floor);
        floor = earliestAct(e);
      }
      expect(earliestAct(steps.at(-1)!), `${chain} never reaches a late act`).toBeGreaterThan(1);
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

const emptyCtx: DialogueContext = {
  act: 1,
  year: FIRST_YEAR,
  season: "spring",
  flags: {},
  populations: {},
  floraStock: {},
};

/** The context a brand-new save actually hands the resolver: the prologue, year one, nothing set. */
const newSaveCtx: DialogueContext = { ...emptyCtx, act: FIRST_ACT };

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
      act: 2,
      year: 4,
      populations: { r2: { "mirefin-line": mirefin } },
    });
    expect(selectEntry(file, "sel", "brackwater", "greeting", ctx(2))?.id).toBe("sel.docks.rotting");
    expect(selectEntry(file, "sel", "brackwater", "greeting", ctx(12))?.id).toBe("sel.docks.rebuilt");
    expect(selectEntry(file, "sel", "brackwater", "greeting", ctx(6))?.id).toBe("sel.greeting");
  });

  it("conditionHolds respects the act axis independently of the calendar", () => {
    // The whole of Q3 in six assertions: an act clause ignores the year, a year clause ignores
    // the act, and neither can stand in for the other.
    expect(conditionHolds({ act: [6] }, { ...emptyCtx, act: 6, year: 1 })).toBe(true);
    expect(conditionHolds({ act: [6] }, { ...emptyCtx, act: 6, year: 30 })).toBe(true);
    expect(conditionHolds({ act: [6] }, { ...emptyCtx, act: 5, year: 6 })).toBe(false);
    expect(conditionHolds({ actMin: 4 }, { ...emptyCtx, act: 4, year: 1 })).toBe(true);
    expect(conditionHolds({ actMin: 4 }, { ...emptyCtx, act: 3, year: 99 })).toBe(false);
    expect(conditionHolds({ actMax: 2 }, { ...emptyCtx, act: 3, year: 1 })).toBe(false);
    expect(conditionHolds({ yearMin: 3 }, { ...emptyCtx, act: 6, year: 2 })).toBe(false);
    expect(conditionHolds({ yearMin: 3 }, { ...emptyCtx, act: 1, year: 3 })).toBe(true);
    // both axes at once — an act beat that also waits for the world to age
    expect(conditionHolds({ actMin: 4, yearMin: 3 }, { ...emptyCtx, act: 4, year: 3 })).toBe(true);
    expect(conditionHolds({ actMin: 4, yearMin: 3 }, { ...emptyCtx, act: 4, year: 2 })).toBe(false);
    expect(conditionHolds({ actMin: 4, yearMin: 3 }, { ...emptyCtx, act: 3, year: 3 })).toBe(false);
  });

  it("a context off either clock throws instead of quietly answering false", () => {
    // The failure this replaces: `ctx.act = 0` made every act clause evaluate false and every
    // unclaused entry eligible, so the game rendered fallback lines everywhere and reported
    // nothing. An unrepresentable act is a caller bug and must arrive as one.
    for (const act of [FIRST_ACT - 1, LAST_ACT + 1, 1.5, Number.NaN]) {
      expect(() => conditionHolds({ actMin: 1 }, { ...emptyCtx, act }), `act ${String(act)}`).toThrow(
        DialogueValidationError,
      );
      expect(() =>
        selectEntry(validateDialogue(), "maren", "hearthollow", "greeting", { ...emptyCtx, act }),
      ).toThrow(DialogueValidationError);
    }
    for (const year of [FIRST_YEAR - 1, 0, -3, 2.5]) {
      expect(() => conditionHolds({ yearMin: 1 }, { ...emptyCtx, year }), `year ${String(year)}`).toThrow(
        DialogueValidationError,
      );
    }
    // and the whole legal range is legal, including the prologue and a year far past the nominal span
    for (let act = FIRST_ACT; act <= LAST_ACT; act += 1) {
      expect(() => conditionHolds(undefined, { ...emptyCtx, act, year: NOMINAL_YEARS * 5 })).not.toThrow();
    }
  });

  /**
   * REPLACES "actFromFlags is the badge ladder, clamped at the last act" (deleted, not weakened).
   *
   * That test asserted `actFromFlags({}) === 1` — a brand-new save is in act 1 — which is FALSE of
   * the game. `data/balance.json` ships `acts.first: 0` and `core/acts.ts` `actOf` returns 0 for a
   * save that has not finished Maren's opening chain; `tests/unit/acts.test.ts` asserts exactly
   * that. The dialogue lane had a second derivation (`1 + badgesBeaten`) that could never return 0,
   * this test pinned it, and the two disagreed at precisely the point the whole opening chain was
   * gated on. The corpus said `act: [1]`; the game said act 0; nothing was red; the game could not
   * be started. So the contract asserted here is now AGREEMENT with the one authority, at every
   * rung including the prologue.
   */
  it("the dialogue act axis is core/acts.ts and agrees with it at every rung, prologue included", () => {
    const B: Balance = content.balance;
    const G: GymLeader[] = content.gyms;
    const beat = (n: number): Record<string, FlagValue> =>
      Object.fromEntries(ACT_GYM_IDS.slice(0, n).map((id) => [`gym.${id}.beaten`, true]));

    // the prologue: no flags at all is act 0, and it is the act a new save is in
    expect(actFromFlags({})).toBe(FIRST_ACT);
    expect(actOf({ questFlags: {} }, G, B)).toBe(FIRST_ACT);

    // act 1 opens on the flag the opening chain writes, at zero badges
    expect(actFromFlags({ "story.opening.done": true })).toBe(1);

    // and every rung above it, both ways
    for (let n = 0; n <= ACT_GYM_IDS.length; n += 1) {
      const flags = { ...beat(n), "story.opening.done": true };
      expect(actFromFlags(flags), `${String(n)} badges`).toBe(actOf({ questFlags: flags }, G, B));
    }
    // beating the last act's leader is the finale, not a seventh act
    expect(actFromFlags({ ...beat(ACT_GYM_IDS.length), "story.opening.done": true })).toBe(LAST_ACT);
    // a falsy flag is not a badge
    expect(actFromFlags({ [badgeFlagFor(ACT_GYM_IDS[0]!, B)]: false })).toBe(FIRST_ACT);
    // the gym list is the shipped table, not a number typed into code — and it is NOT the ladder:
    // six gyms, seven acts, because act 0 is the prologue. Conflating the two is the original bug.
    expect(ACT_GYM_IDS).toEqual(gymsRaw.gyms.map((g) => g.id));
    expect(LAST_ACT - FIRST_ACT).toBe(ACT_GYM_IDS.length);
    expect(ACT_GYM_IDS.length).not.toBe(LAST_ACT - FIRST_ACT + 1);
    // the ladder is exactly balance.acts.gates, row for row — not a count of anything else
    expect(content.balance.acts.gates.map((g) => g.act).sort((a, b) => a - b)).toEqual(
      Array.from({ length: LAST_ACT - FIRST_ACT + 1 }, (_, i) => FIRST_ACT + i),
    );
  });

  /**
   * The bounds must be READ FROM `balance.acts`, not computed from the gym table.
   *
   * Numerically the two agree today — six gyms, `acts.last: 6` — so no value assertion can tell
   * them apart, and `ACTS_TOTAL = ACT_GYM_IDS.length` standing in for the last act is precisely how
   * the act ladder got its wrong floor in the first place. Add a seventh leader, or retune
   * `acts.last`, and a gym-count bound silently disagrees with the game again. This is the only
   * assertion that survives that day, so it reads the source rather than the numbers.
   */
  it("the act bounds are read from balance.acts, never counted off the gym table", () => {
    const src = readFileSync("core/dialogue-schema.ts", "utf8");
    const firstDecl = /export const FIRST_ACT: number = (.+);/.exec(src)?.[1];
    const lastDecl = /export const LAST_ACT: number = (.+);/.exec(src)?.[1];
    expect(firstDecl, "FIRST_ACT is not declared").toBeDefined();
    expect(lastDecl, "LAST_ACT is not declared").toBeDefined();
    for (const [name, decl] of [
      ["FIRST_ACT", firstDecl!],
      ["LAST_ACT", lastDecl!],
    ] as const) {
      expect(decl, `${name} is not derived from core/acts.ts over the shipped balance`).toMatch(
        /^(firstAct|lastAct)\(ACT_BALANCE\)$/,
      );
      expect(decl, `${name} counts the gym table`).not.toMatch(/ACT_GYM_IDS|gyms/);
    }
    // and the gym count is not exported as an act total any more, under any name
    expect(src).not.toMatch(/export const ACTS_TOTAL/);
  });

  /**
   * The contract the dialogue lane DEPENDS ON, asserted from this side of the boundary.
   *
   * `core/acts.ts`'s own docstring says in bold that the clock is not an input, and every act gate
   * in `data/dialogue.json` was re-written on that promise. If the calendar ever leaks back into
   * `actOf`, every act-gated beat silently starts firing on a timetable again — which is the exact
   * regression Q3 exists to remove — and the dialogue corpus would be wrong without changing.
   */
  it("the act a dialogue gate reads is never a function of the calendar", () => {
    const B: Balance = content.balance;
    const G: GymLeader[] = content.gyms;
    const bare = actOf({ questFlags: {} }, G, B);
    for (const year of [FIRST_YEAR, 2, NOMINAL_YEARS, NOMINAL_YEARS + 6, NOMINAL_YEARS * 5]) {
      // a save carrying a calendar year, handed to the act model: the year must not move the act
      const withYear = { questFlags: {}, year } as unknown as { questFlags: Record<string, FlagValue> };
      expect(actOf(withYear, G, B), `year ${String(year)} moved the act`).toBe(bare);
    }
    // and one badge moves it, so the probe above is not passing because nothing moves it
    expect(actOf(awardBadge({ questFlags: {} }, ACT_GYM_IDS[0]!, B), G, B)).toBeGreaterThan(bare);
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

  /**
   * AMENDED for Q3. This used to demand ≥3 year-conditioned entries per slice node, back when the
   * calendar carried the story as well as the world. Under the L8 amendment those are two axes, so
   * the assertion now demands BOTH — ≥2 act-conditioned (the story moves with the player) and ≥2
   * year-conditioned (the world ages regardless) — which binds four entries per node where the old
   * form bound three, and binds them on the axis each actually belongs to.
   */
  it("the vertical slice moves on BOTH clocks (Q3: acts for story, calendar for ageing)", () => {
    for (const node of ["hearthollow", "r1", "brackwater", "r2"]) {
      const here = raw.entries.filter((e) => e.node === node);
      const yearAware = here.filter((e) => e.when?.years !== undefined || e.when?.yearMin !== undefined);
      const actAware = here.filter((e) => e.when?.act !== undefined || e.when?.actMin !== undefined);
      const stateAware = here.filter(
        (e) => (e.when?.population ?? []).length > 0 || (e.when?.floraStock ?? []).length > 0,
      );
      expect(yearAware.length, `${node} has no calendar-conditioned dialogue`).toBeGreaterThanOrEqual(2);
      expect(actAware.length, `${node} has no act-conditioned dialogue`).toBeGreaterThanOrEqual(2);
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
 * 7b. Q3 — two clocks, and every entry reachable under both
 *
 * The defect this section exists for: `data/dialogue.json` was authored against content-bible §6's
 * "six acts = six years" equation, so 44 entries — the whole rival arc, both Greaves cutscenes, the
 * finale, the Vellsire choice and both epilogues — gated on an exact calendar year. Under the
 * authorised L8 amendment the calendar is unbounded and does not carry progression, so a player who
 * reached the Sanctum in year 8 saw NONE of the ending and nothing went red.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Populations/flora big enough to satisfy a `gte` and small enough to satisfy an `lte`. */
const CARRY_CAP = new Map<string, Map<string, number>>(
  content.nodes.map((n) => [n.id, new Map(Object.entries(n.populations).map(([k, v]) => [k, v.carryCap]))] as const),
);

/**
 * Build the world a single entry needs, clause by clause, and hand it to the real `conditionHolds`.
 * Returns undefined when the clauses CONTRADICT — which is the unreachability this is hunting.
 */
function witnessFor(e: DialogueEntry, year: number): DialogueContext | undefined {
  const w = e.when ?? {};

  const act = earliestAct(e);
  if (w.actMax !== undefined && act > w.actMax) return undefined;
  if (w.act !== undefined && w.act.some((a) => a < FIRST_ACT || a > LAST_ACT)) return undefined;

  const y = Math.max(year, earliestYear(e));
  const chosenYear = w.years !== undefined ? (w.years.includes(y) ? y : Math.max(...w.years)) : y;
  if (w.yearMax !== undefined && chosenYear > w.yearMax) return undefined;

  const flags: Record<string, FlagValue> = {};
  for (const k of w.flagsSet ?? []) flags[k] = true;
  for (const fe of w.flagEquals ?? []) flags[fe.key] = fe.value;
  for (const k of w.flagsUnset ?? []) {
    if (k in flags) return undefined; // required and forbidden at once
  }

  const populations: Record<string, Record<string, number>> = {};
  for (const p of w.population ?? []) {
    const cap = CARRY_CAP.get(p.node)?.get(p.lineId);
    if (cap === undefined) return undefined;
    const want =
      p.op === "lt" ? p.value - 1 : p.op === "lte" || p.op === "eq" ? p.value : p.op === "gte" ? p.value : p.value + 1;
    if (want < 0 || want > cap) return undefined;
    const node = (populations[p.node] ??= {});
    const prev = node[p.lineId];
    if (prev !== undefined && prev !== want) return undefined; // two clauses disagree
    node[p.lineId] = want;
  }

  const floraStock: Record<string, number> = {};
  for (const f of w.floraStock ?? []) {
    const want =
      f.op === "lt" ? f.value - 1 : f.op === "lte" || f.op === "eq" ? f.value : f.op === "gte" ? f.value : f.value + 1;
    if (want < 0 || want > content.balance.ecosim.floraMax) return undefined;
    const prev = floraStock[f.node];
    if (prev !== undefined && prev !== want) return undefined;
    floraStock[f.node] = want;
  }

  return {
    act,
    year: chosenYear,
    season: w.seasons?.[0] ?? "spring",
    flags,
    populations,
    floraStock,
  };
}

describe("Q3 — the calendar and the acts are two clocks", () => {
  const file = validateDialogue();
  /** Well past `NOMINAL_YEARS`, which is the pacing the file was authored against. */
  const FAR_YEARS = [NOMINAL_YEARS, NOMINAL_YEARS + 2, NOMINAL_YEARS * 2, NOMINAL_YEARS * 5];

  it("no entry anywhere is unreachable — every one has a world that fires it", () => {
    // A constructive fixpoint over the whole condition space, not just the chain flags: for each
    // entry, build a context from its own clauses and require the SHIPPED resolver to accept it.
    const unreachable: string[] = [];
    for (const e of raw.entries) {
      const ctx = witnessFor(e, 1);
      if (ctx === undefined || !conditionHolds(e.when, ctx)) unreachable.push(e.id);
    }
    expect(unreachable).toEqual([]);
  });

  it("the witness a reachability proof uses is a world a player could actually hold", () => {
    // Otherwise the assertion above proves only that the builder can invent a context.
    const acquired = reachableFlags();
    const bogus: string[] = [];
    for (const e of raw.entries) {
      const ctx = witnessFor(e, 1);
      if (ctx === undefined) {
        bogus.push(`${e.id}: no witness at all`);
        continue;
      }
      if (ctx.act < FIRST_ACT || ctx.act > LAST_ACT) bogus.push(`${e.id}: act ${String(ctx.act)}`);
      if (!Number.isInteger(ctx.year) || ctx.year < FIRST_YEAR) bogus.push(`${e.id}: year ${String(ctx.year)}`);
      for (const k of Object.keys(ctx.flags)) {
        if (!acquired.has(k)) bogus.push(`${e.id}: flag ${k} is not reachable`);
      }
      for (const [nodeId, lines] of Object.entries(ctx.populations)) {
        for (const [lineId, n] of Object.entries(lines)) {
          const cap = CARRY_CAP.get(nodeId)?.get(lineId);
          if (cap === undefined || n < 0 || n > cap) bogus.push(`${e.id}: ${nodeId}.${lineId}=${String(n)}`);
        }
      }
    }
    expect(bogus).toEqual([]);
  });

  it("the unreachability probe bites — a contradictory condition is caught", () => {
    const impossible: DialogueEntry = {
      ...raw.entries.find((e) => (e.when?.population ?? []).length > 0)!,
      when: {
        population: [
          { node: "r2", lineId: "mirefin-line", op: "gte", value: 9 },
          { node: "r2", lineId: "mirefin-line", op: "lte", value: 4 },
        ],
      },
    };
    expect(witnessFor(impossible, 1)).toBeUndefined();
    const overCap: DialogueEntry = {
      ...impossible,
      when: { population: [{ node: "r2", lineId: "mirefin-line", op: "gte", value: 9999 }] },
    };
    expect(witnessFor(overCap, 1)).toBeUndefined();
    const selfBlocking: DialogueEntry = {
      ...impossible,
      when: { flagsSet: ["story.greaves.beaten"], flagsUnset: ["story.greaves.beaten"] },
    };
    expect(witnessFor(selfBlocking, 1)).toBeUndefined();
  });

  it("every entry still fires in a calendar year far past the nominal span", () => {
    // The exact shape of the shipped defect: fine at year 6, silent at year 8.
    for (const year of FAR_YEARS) {
      const lost: string[] = [];
      for (const e of raw.entries) {
        const ctx = witnessFor(e, year);
        if (ctx === undefined || !conditionHolds(e.when, ctx)) lost.push(e.id);
      }
      expect(lost, `entries lost in year ${String(year)}`).toEqual([]);
    }
  });

  /* ── the game can be started: the opening, driven by the REAL act authority ── */

  /**
   * A save walked forward by `core/acts.ts`, not by a hand-written act number.
   *
   * Every other probe in this file supplies its own `act`, so all of them agreed with a corpus that
   * disagreed with the game. This one never types an act: it builds a `SaveFile`-shaped bag of
   * quest flags, asks `actOf()` what act that is — the same call `game/registry.ts` and
   * `OverworldScene` make — and hands the answer to `selectEntry()`. It fails against the shipped
   * `act: [1]` opening chain, because a brand-new save is in act 0, and the three entries that
   * write `story.opening.done` were themselves behind the gate that flag opens: a deadlock whose
   * only symptom was Maren having nothing to say.
   */
  const ctxForSave = (questFlags: Record<string, FlagValue>, year = FIRST_YEAR): DialogueContext => ({
    ...emptyCtx,
    act: actOf({ questFlags }, content.gyms, content.balance),
    year,
    flags: questFlags,
  });

  it("a brand-new save is in the prologue and Maren opens the game there", () => {
    const fresh: Record<string, FlagValue> = {};
    const ctx = ctxForSave(fresh);
    expect(ctx.act, "a new save is not in the act the corpus gates the opening on").toBe(FIRST_ACT);
    expect(selectEntry(file, "maren", "hearthollow", "cutscene", ctx)?.id).toBe("maren.opening");
    // and the choice that starts the game is on it
    expect(selectEntry(file, "maren", "hearthollow", "cutscene", ctx)?.choices?.length).toBe(3);
  });

  it("the whole opening chain is reachable, in order, from an empty save", () => {
    // Each step takes the flags the previous one writes; the act is re-derived every time.
    let flags: Record<string, FlagValue> = {};
    const play = (id: string): void => {
      const ctx = ctxForSave(flags);
      const chosen = selectEntry(file, "maren", "hearthollow", "cutscene", ctx);
      expect(chosen?.id, `stuck before ${id} at act ${String(ctx.act)}`).toBe(id);
      flags = { ...flags, ...(chosen?.setFlags ?? {}) };
    };
    play("maren.opening");
    // the player picks a starter — the goto target, evaluated in the act it is actually reached in
    const starter = ENTRY.get("maren.starter.puddlisk")!;
    expect(conditionHolds(starter.when, ctxForSave(flags)), "the starter branch is not reachable").toBe(true);
    flags = { ...flags, ...(starter.setFlags ?? {}) };
    expect(flags["story.opening.done"]).toBe(true);
    // choosing a starter is what opens act 1
    expect(ctxForSave(flags).act).toBe(1);
    play("maren.tutorial.snare");
    play("maren.tutorial.survey");
    // the ledger tutorial offers First Signs, and Maren's act-1 greeting is now the one she gives
    expect(flags["quest.first-signs.offered"]).toBe(true);
    const afterOpening = { ...ctxForSave(flags), floraStock: { r1: 78 } };
    expect(selectEntry(file, "maren", "hearthollow", "greeting", afterOpening)?.id).toBe("maren.greeting.act1");
  });

  it("the prologue closes behind the player and cannot replay", () => {
    const done = ctxForSave({ "story.opening.done": true, "story.starter": "puddlisk-line" });
    expect(done.act).toBe(1);
    for (const id of ["maren.opening", "maren.starter.cindril", "maren.starter.puddlisk", "maren.starter.thornlet"]) {
      expect(conditionHolds(ENTRY.get(id)!.when, done), `${id} replays after the prologue`).toBe(false);
    }
  });

  it("act-0 content lives only in the node act 0 opens, and act-gated content never opens early", () => {
    // Act 0 opens hearthollow ALONE (balance.acts.gates), so an act-0 gate anywhere else would be a
    // line written for a place the player cannot stand in yet.
    const act0Entries = raw.entries.filter((e) => (e.when?.act ?? []).includes(FIRST_ACT));
    expect(act0Entries.length, "the prologue lost its content").toBeGreaterThan(0);
    expect(act0Entries.filter((e) => e.node !== "hearthollow").map((e) => e.id)).toEqual([]);

    // and the other direction: every act clause in the corpus names an act whose gate row opens the
    // node the entry stands in, so no beat can be gated to an act its own node is not open in.
    const unlockAct = new Map<string, number>();
    for (const gate of content.balance.acts.gates) {
      for (const nodeId of gate.nodes) if (!unlockAct.has(nodeId)) unlockAct.set(nodeId, gate.act);
    }
    expect(
      raw.entries
        .filter((e) => e.when?.act !== undefined || e.when?.actMin !== undefined)
        .filter((e) => (unlockAct.get(e.node) ?? FIRST_ACT) > earliestAct(e))
        .map((e) => `${e.id}: gated act ${String(earliestAct(e))} but ${e.node} opens at ${String(unlockAct.get(e.node))}`),
    ).toEqual([]);

    // Wick is not on Meadow Reach during the prologue, because Meadow Reach is not open.
    for (const kind of ["battle-pre", "battle-win", "battle-loss"] as const) {
      expect(selectEntry(file, "wick", "r1", kind, newSaveCtx), "wick speaks on r1 in the prologue").toBeUndefined();
    }
  });

  /* ── the never-cut beats, named one by one ─────────────────────────────── */

  /*
   * ⚠ THE POPULATIONS ARE NOT DECORATION HERE. `sanctum.vellsire.approach` carries
   * `population: [{node:"sanctum", lineId:"vellsire-line", op:"gte", value:1}]` so the cutscene
   * cannot narrate a stag that is not standing in the ring — before that clause a player could
   * snare the Vellsire in an ordinary foray and then be shown it arriving. A `populations: {}`
   * context reads every count as ABSENT, so the finale has to be resolved against the shipped
   * node file, which is what a save at the ring actually carries. Read, never typed in (G2).
   */
  const shippedPopulations = (): Record<string, Record<string, number>> => {
    const out: Record<string, Record<string, number>> = {};
    for (const n of nodeFiles) {
      const counts: Record<string, number> = {};
      for (const [lineId, pop] of Object.entries(n.populations)) counts[lineId] = pop.count;
      out[n.id] = counts;
    }
    return out;
  };

  const finaleCtx = (year: number, flags: Record<string, FlagValue>): DialogueContext => ({
    ...emptyCtx,
    act: LAST_ACT,
    year,
    flags,
    populations: shippedPopulations(),
  });

  it("the finale resolves at the last act in ANY calendar year", () => {
    for (const year of FAR_YEARS) {
      /*
       * ⚠ THE SEND-OFF WAITS FOR THE FIGHT, and that is a corpus fact worth asserting in every
       * year. `story.greaves.entered` is written by `wick.act6.pre`, so gating `maren.finale` on
       * it ALONE made her "Go on. I'll hold the page." eligible the instant Wick finished speaking
       * — and `finishDialogue` plays a queued cutscene before the continuation that opens the
       * battle, so the send-off was delivered between the challenge and the fight and then latched
       * on `story.finale.spoken` for ever. `rival.act6.playerResult` is written by BOTH
       * `wick.act6.win` and `wick.act6.loss`, so this waits for the fight to have HAPPENED without
       * requiring the player to have won it (B5 / D-Q8-4).
       */
      const midFight = finaleCtx(year, { "story.greaves.entered": true });
      expect(
        selectEntry(file, "maren", "sanctum-approach", "cutscene", midFight)?.id,
        `year ${String(year)}: the send-off interposed before the act-6 fight`,
      ).toBeUndefined();

      const beforeGreaves = finaleCtx(year, {
        "story.greaves.entered": true,
        "rival.act6.playerResult": "loss",
      });
      expect(selectEntry(file, "maren", "sanctum-approach", "cutscene", beforeGreaves)?.id, `year ${String(year)}`).toBe(
        "maren.finale",
      );
      expect(selectEntry(file, "greaves", "sanctum", "battle-pre", finaleCtx(year, {}))?.id, `year ${String(year)}`).toBe(
        "greaves.finale.pre",
      );
      expect(
        selectEntry(file, "greaves", "sanctum", "battle-win", finaleCtx(year, {}))?.id,
        `year ${String(year)}`,
      ).toBe("greaves.finale.post");
    }
  });

  it("the Vellsire choice resolves at the last act in ANY calendar year", () => {
    /*
     * ASKED THROUGH THE SELECTOR THE GAME ACTUALLY USES. This reached the beat by
     * `selectEntry(file, "prop-antler-stone", …)` — a (speaker, node, kind) lookup — and so it was
     * pinned to the entry's SPEAKER, which is not how any prop reaches the screen:
     * `OverworldScene` calls `propDialogueFor` (= `selectPropEntry`), which discriminates on
     * `propId` and never looks at the speaker at all. The prose pass moved this beat's speaker to
     * `narration` — three lines of third-person description of a stag walking into the ring, which
     * is not the standing stone talking — and this went red while the shipped path was untouched.
     * A test that goes red for a change the player cannot observe was reading the wrong key.
     * `validateDialogueFile` already pins a `propId` to its own node, so the pair is exact.
     */
    for (const year of FAR_YEARS) {
      const ctx = finaleCtx(year, { "story.greaves.beaten": true });
      const chosen = selectPropEntry(file, "sanctum-antler-ring", "sanctum", ctx);
      expect(chosen?.id, `year ${String(year)}`).toBe("sanctum.vellsire.approach");
      expect(chosen?.choices?.length, "the choice itself must survive").toBe(2);
    }
  });

  it("both epilogues resolve at the last act in ANY calendar year", () => {
    for (const year of FAR_YEARS) {
      for (const [outcome, id] of [
        ["caught", "maren.epilogue.caught"],
        ["released", "maren.epilogue.released"],
      ] as const) {
        const ctx = finaleCtx(year, {
          "story.vellsire.resolved": true,
          "story.vellsire.outcome": outcome,
        });
        expect(selectEntry(file, "maren", "sanctum", "cutscene", ctx)?.id, `${outcome} in year ${String(year)}`).toBe(
          id,
        );
      }
    }
  });

  /**
   * The ending is an ENDING — it plays once and then it is behind the player.
   *
   * `actMin: 6` is forward-open on a clock that never stops, so it terminates nothing on its own.
   * The epilogues wrote `story.epilogue.shown` and no clause anywhere read it, which meant the last
   * cutscene in the game replayed on every subsequent word with Maren at the Sanctum, in year 6 and
   * in year 30 alike. The old `years: [6]` was the only thing that had ever ended them, and moving
   * to the act axis removed it. `maren.finale` one entry away already had the pattern
   * (`flagsUnset: story.finale.spoken` + `setFlags`); this asserts both epilogues now do too.
   */
  it("an epilogue plays once and is then over, in every calendar year", () => {
    for (const year of FAR_YEARS) {
      for (const outcome of ["caught", "released"] as const) {
        const shown = finaleCtx(year, {
          "story.vellsire.resolved": true,
          "story.vellsire.outcome": outcome,
          "story.epilogue.shown": true,
        });
        expect(
          selectEntry(file, "maren", "sanctum", "cutscene", shown),
          `${outcome} epilogue replays in year ${String(year)}`,
        ).toBeUndefined();
      }
    }
  });

  it("every one-shot beat gates on the flag it writes, so none of them can loop", () => {
    // Generalised from the chain-step rule, which only covered `signChain` entries and so could not
    // see the epilogues. A cutscene that marks itself "shown/spoken/seen/done" and does not read
    // that mark is a cutscene with no ending.
    const ONE_SHOT_MARK = /\.(shown|spoken|seen|met|steppe|done)$/;
    expect(
      raw.entries
        .filter((e) => e.kind === "cutscene")
        .flatMap((e) =>
          Object.keys(e.setFlags ?? {})
            .filter((k) => ONE_SHOT_MARK.test(k))
            .filter((k) => !(e.when?.flagsUnset ?? []).includes(k))
            .map((k) => `${e.id} writes ${k} and never reads it`),
        ),
    ).toEqual([]);
  });

  it("the finale does NOT fire before its act, however late the calendar runs", () => {
    // The other direction: decoupling must not turn the ending into something a year-30 player
    // gets for free without the badges. Each probe carries ONLY the flags its target needs, so it
    // is the ACT clause being tested and not a flag standing in for one.
    const early = (flags: Record<string, FlagValue>): DialogueContext => ({
      ...emptyCtx,
      act: LAST_ACT - 1,
      year: NOMINAL_YEARS * 5,
      flags,
    });
    expect(selectEntry(file, "greaves", "sanctum", "battle-pre", early({}))).toBeUndefined();
    expect(selectEntry(file, "greaves", "sanctum", "battle-win", early({}))).toBeUndefined();
    expect(
      selectEntry(file, "prop-antler-stone", "sanctum", "cutscene", early({ "story.greaves.beaten": true })),
    ).toBeUndefined();
    expect(
      selectEntry(file, "maren", "sanctum-approach", "cutscene", early({ "story.greaves.entered": true }))?.id,
    ).not.toBe("maren.finale");
    for (const outcome of ["caught", "released"]) {
      const ctx = early({ "story.vellsire.resolved": true, "story.vellsire.outcome": outcome });
      expect(selectEntry(file, "maren", "sanctum", "cutscene", ctx), outcome).toBeUndefined();
    }
  });

  const RIVAL_NODE: Record<number, string> = { 1: "r1", 2: "r2", 3: "r3", 4: "r4", 5: "r5", 6: "sanctum-approach" };

  it("the rival arc fires in every act, in every calendar year", () => {
    for (let act = 1; act <= LAST_ACT; act += 1) {
      const node = RIVAL_NODE[act]!;
      for (const year of [FIRST_YEAR, ...FAR_YEARS]) {
        const ctx: DialogueContext = { ...emptyCtx, act, year };
        expect(selectEntry(file, "wick", node, "battle-pre", ctx)?.id, `act ${String(act)} year ${String(year)}`).toBe(
          `wick.act${String(act)}.pre`,
        );
        expect(selectEntry(file, "wick", node, "battle-win", ctx)?.id).toBe(`wick.act${String(act)}.win`);
        expect(selectEntry(file, "wick", node, "battle-loss", ctx)?.id).toBe(`wick.act${String(act)}.loss`);
      }
    }
  });

  /**
   * THE ROW THE DIAGONAL ABOVE CANNOT SEE, and the reason the arc is on `actMin` and not `act: [N]`.
   *
   * Wick's act-N encounter lives on route rN. `data/balance.json` `acts.gates` opens town N and
   * route N in the SAME act, and town N+1 needs town N's badge — so beating gym N (which is in town
   * N, not on rN) puts the save in act N+1 while the player may never have walked rN. Under an act
   * EQUALITY that encounter is then gone for good: an unrecoverable dead-end reached by playing
   * efficiently. Nothing else in the arc needed the equality — every `.pre` already carries
   * `flagsUnset: rival.actN.fought`, and each route hosts exactly one Wick battle, so the `.win` /
   * `.loss` pair cannot collide either.
   */
  it("an encounter the player walked past is still waiting on its route in a later act", () => {
    for (let act = 1; act < LAST_ACT; act += 1) {
      const node = RIVAL_NODE[act]!;
      for (let later = act + 1; later <= LAST_ACT; later += 1) {
        const ctx: DialogueContext = { ...emptyCtx, act: later, year: NOMINAL_YEARS * 3 };
        expect(
          selectEntry(file, "wick", node, "battle-pre", ctx)?.id,
          `wick.act${String(act)}.pre lost at act ${String(later)}`,
        ).toBe(`wick.act${String(act)}.pre`);
        expect(selectEntry(file, "wick", node, "battle-win", ctx)?.id).toBe(`wick.act${String(act)}.win`);
      }
    }
  });

  it("...and is gone once it has actually been fought, in that act and in every later one", () => {
    // The other direction, which is what `flagsUnset` buys: a floor must not re-offer a done fight.
    for (let act = 1; act <= LAST_ACT; act += 1) {
      const node = RIVAL_NODE[act]!;
      const fought = { [`rival.act${String(act)}.fought`]: true };
      for (let later = act; later <= LAST_ACT; later += 1) {
        const ctx: DialogueContext = { ...emptyCtx, act: later, flags: fought };
        expect(
          selectEntry(file, "wick", node, "battle-pre", ctx),
          `wick.act${String(act)}.pre re-offered at act ${String(later)}`,
        ).toBeUndefined();
      }
    }
  });

  it("the rival is never on a route before that route is open", () => {
    // The floor must still be a floor: `actMin: N` where route N unlocks at act N, from balance.
    for (let act = 1; act <= LAST_ACT; act += 1) {
      const node = RIVAL_NODE[act]!;
      for (let earlier = FIRST_ACT; earlier < act; earlier += 1) {
        const ctx: DialogueContext = { ...emptyCtx, act: earlier };
        for (const kind of ["battle-pre", "battle-win", "battle-loss"] as const) {
          expect(selectEntry(file, "wick", node, kind, ctx), `${node} ${kind} at act ${String(earlier)}`).toBeUndefined();
        }
      }
    }
  });

  it("a world-ageing line still reads sensibly in a year the file was never written for", () => {
    // Town ageing legitimately stays on the calendar (Q3), so it must not go mute or go exact.
    const late = NOMINAL_YEARS * 2;
    const rotting: DialogueContext = { ...emptyCtx, act: 2, year: late, populations: { r2: { "mirefin-line": 2 } } };
    expect(selectEntry(file, "sel", "brackwater", "greeting", rotting)?.id).toBe("sel.docks.rotting");
    const rebuilt: DialogueContext = { ...emptyCtx, act: 2, year: late, populations: { r2: { "mirefin-line": 12 } } };
    expect(selectEntry(file, "sel", "brackwater", "greeting", rebuilt)?.id).toBe("sel.docks.rebuilt");
    const mid: DialogueContext = { ...emptyCtx, act: 2, year: late, populations: { r2: { "mirefin-line": 6 } } };
    expect(selectEntry(file, "sel", "brackwater", "greeting", mid)?.id).toBe("sel.greeting");
    // and the calendar-gated ambient set is still speaking at that year
    expect(
      selectEntry(file, "hearthollow-fenceman", "hearthollow", "ambient", { ...emptyCtx, year: late })?.id,
    ).toBe("amb.hearthollow-fenceman.late");
  });

  /* ── the axis rules the split was made on ──────────────────────────────── */

  /**
   * The whole story spine, by hand, with **the exact act clause each beat carries** — the split this
   * change made, published so it is reviewable here and not only in a JSON diff.
   *
   * REPLACES a table of act FLOORS. A floor could not tell `act: [1]` from no act clause at all
   * (both floor to 1), so every row that read `1` bound nothing: the verifier deleted `act: [1]`
   * from BOTH tutorials and the whole suite stayed green. Worse, the floors it did assert were the
   * wrong ladder — the opening chain shipped `act: [1]` while a new save is in act 0, and the table
   * agreed with the corpus instead of with the game. The clause itself is asserted now, so a
   * deleted gate, a drifted gate and an equality-where-a-floor-belongs are all three visible.
   *
   * `null` means "no act clause, deliberately": a beat whose only gate is a flag, because it must
   * never expire. Every other row is the literal `when.act` / `when.actMin` the entry ships.
   */
  type ActGateShape = { act: number[] } | { actMin: number } | null;
  const ACT_GATE: Record<string, ActGateShape> = {
    // the prologue — act 0 is where a brand-new save is, and where these four alone may fire
    "maren.opening": { act: [FIRST_ACT] },
    "maren.starter.cindril": { act: [FIRST_ACT] },
    "maren.starter.puddlisk": { act: [FIRST_ACT] },
    "maren.starter.thornlet": { act: [FIRST_ACT] },
    // the tutorials straddle the act 0 -> 1 boundary: their `goto` source is the starter entry that
    // WRITES story.opening.done, so an act clause on either side of it can strand them. Flags only.
    "maren.tutorial.snare": null,
    "maren.tutorial.survey": null,
    "maren.tutorial.release": { actMin: 2 },
    // must never expire — this was D2, the First Signs dead-end
    "maren.quest.first-signs.offer": null,
    "maren.quest.first-signs.done": null,
    "maren.keystone.1": null,
    "maren.keystone.2": { actMin: 2 },
    "maren.keystone.3": { actMin: 3 },
    "maren.keystone.4": { actMin: 4 },
    "maren.keystone.5": { actMin: 5 },
    "maren.keystone.6": { actMin: 6 },
    "maren.crash-survey": { actMin: 4 },
    "maren.finale": { actMin: 6 },
    "maren.epilogue.caught": { actMin: 6 },
    "maren.epilogue.released": { actMin: 6 },
    "greaves.act3.intro": { actMin: 3 },
    "greaves.act4.steppe": { actMin: 4 },
    "greaves.finale.pre": { actMin: 6 },
    "greaves.finale.post": { actMin: 6 },
    "sanctum.vellsire.approach": { actMin: 6 },
    "prop.sanctum-antler-ring": { actMin: 6 },
    "prop.sanctum-approach-antler-gate": { actMin: 6 },
    "tolm.quest.fallow.offer": null,
    "sel.quest.wager.offer": { actMin: 2 },
    "nessa.quest.restock.offer": { actMin: 2 },
    "halder.quest.silk.offer": { actMin: 3 },
    "pell.quest.lanternless.offer": { actMin: 3 },
    "gerta.quest.crash.offer": { actMin: 4 },
    "bram.quest.forge.offer": { actMin: 4 },
    "ives.quest.census.offer": { actMin: 5 },
    "orrin.quest.trail.offer": { actMin: 5 },
    // the steppe arrival is a FLOOR and a one-shot: act 4 opens cindershelf AND r4, so Sable's
    // badge is takeable without ever walking r4, and an equality would lose the only line that
    // frames the crash for exactly the early arriver Q6 is written for.
    "amb.r4-worker.arrival": { actMin: 4 },
    "amb.r4-worker.emptied": { actMin: 4 },
    // the rival: a FLOOR per act, never an equality — see the walked-past assertions above
    ...Object.fromEntries(
      [1, 2, 3, 4, 5, 6].flatMap((n) =>
        ["pre", "win", "loss"].map((k) => [`wick.act${String(n)}.${k}`, { actMin: n }] as const),
      ),
    ),
  };
  const STORY_SPINE = Object.keys(ACT_GATE);

  /** The act half of an entry's condition, and nothing else. */
  const actClauseOf = (e: DialogueEntry): ActGateShape =>
    e.when?.act !== undefined
      ? { act: e.when.act }
      : e.when?.actMin !== undefined
        ? { actMin: e.when.actMin }
        : null;

  it("the story spine names entries that all still exist", () => {
    expect(STORY_SPINE.filter((id) => !ENTRY.has(id))).toEqual([]);
  });

  it("no story beat gates on the calendar — the finale cannot be lost to a slow run", () => {
    expect(
      STORY_SPINE.filter((id) => {
        const w = ENTRY.get(id)!.when ?? {};
        return w.years !== undefined || w.yearMin !== undefined || w.yearMax !== undefined;
      }),
    ).toEqual([]);
  });

  it("every story beat carries exactly the act clause the split put on it", () => {
    // Catches all four directions the floor table could not: a gate DELETED, a gate MOVED, an
    // `actMin` silently narrowed to an `act` equality, and an `act` equality silently widened.
    expect(
      Object.entries(ACT_GATE)
        .filter(([id, want]) => JSON.stringify(actClauseOf(ENTRY.get(id)!)) !== JSON.stringify(want))
        .map(([id, want]) => `${id}: ships ${JSON.stringify(actClauseOf(ENTRY.get(id)!))}, split says ${JSON.stringify(want)}`),
    ).toEqual([]);
  });

  it("the exact-clause table bites where the floor table did not", () => {
    // The verifier's sabotage, run against the assertion above rather than by hand: deleting
    // `act: [0]` from a prologue entry, and swapping a rival floor for the equality that shipped.
    const stripped: DialogueEntry = { ...ENTRY.get("maren.opening")!, when: { flagsUnset: ["story.opening.done"] } };
    expect(JSON.stringify(actClauseOf(stripped))).not.toBe(JSON.stringify(ACT_GATE["maren.opening"]));
    const pinned: DialogueEntry = { ...ENTRY.get("wick.act1.pre")!, when: { act: [1] } };
    expect(JSON.stringify(actClauseOf(pinned))).not.toBe(JSON.stringify(ACT_GATE["wick.act1.pre"]));
  });

  /**
   * An `act` EQUALITY is a closing door, so the entries that carry one are enumerated by hand.
   *
   * Every equality outside this list is a bug of the shape the rival arc had: town N's gym and
   * route N open in the same act, so a beat pinned to act N anywhere the player might not have gone
   * yet is lost by anyone who takes the badge first. The eleven below are the two cases where
   * "this act and no other" is the design — the prologue, which act 1 permanently closes, and each
   * act's arrival greeting, whose successor takes over the moment the act advances.
   */
  const ACT_EQUALITY_IS_THE_DESIGN = [
    "maren.opening",
    "maren.starter.cindril",
    "maren.starter.puddlisk",
    "maren.starter.thornlet",
    "maren.greeting.act1",
    "maren.greeting.act2",
    "maren.greeting.act3",
    "maren.greeting.act4",
    "maren.greeting.act5",
    "maren.greeting.act6",
  ] as const;

  it("an act equality is only used where the door is meant to close", () => {
    expect(raw.entries.filter((e) => e.when?.act !== undefined).map((e) => e.id).sort()).toEqual(
      [...ACT_EQUALITY_IS_THE_DESIGN].sort(),
    );
  });

  it("the rival meets you once per act — on a FLOOR, so walking past a route does not lose him", () => {
    // WAS `expect(e.when?.act).toEqual([n])`. That equality was the defect, not the contract: it
    // deleted each act's encounter at the moment the player earned a reason to cross that act's
    // route. The stated reason for it — "`actMin` would leave his act-1 lines still firing at
    // Meadow Reach in act 6" — is false: every `.pre` carries `flagsUnset: rival.actN.fought`
    // (asserted below), and each route hosts exactly one Wick battle, so `.win`/`.loss` cannot
    // collide. The behavioural consequences are asserted in the three tests above this section.
    for (let n = 1; n <= LAST_ACT; n += 1) {
      for (const kind of ["pre", "win", "loss"]) {
        const e = ENTRY.get(`wick.act${String(n)}.${kind}`)!;
        expect(e.when?.actMin, `wick.act${String(n)}.${kind}`).toBe(n);
        expect(e.when?.act, `wick.act${String(n)}.${kind} is pinned to one act`).toBeUndefined();
      }
      // the guard that makes the floor safe, named rather than assumed
      expect(ENTRY.get(`wick.act${String(n)}.pre`)!.when?.flagsUnset).toEqual([`rival.act${String(n)}.fought`]);
      // and the route really does host exactly one Wick battle, which is why `.win`/`.loss` need none
      const node = RIVAL_NODE[n]!;
      expect(raw.entries.filter((e) => e.speaker === "wick" && e.node === node && e.kind === "battle-win")).toHaveLength(1);
    }
  });

  it("no entry anywhere gates on an exact calendar year (Q3: prefer a floor to an equality)", () => {
    expect(raw.entries.filter((e) => e.when?.years !== undefined).map((e) => e.id)).toEqual([]);
  });

  it("no calendar clause carries a ceiling that could silence it in a long run", () => {
    // `yearMax` is legal and occasionally right, but nothing ships one, and a new one is a
    // decision rather than an oversight.
    expect(raw.entries.filter((e) => e.when?.yearMax !== undefined).map((e) => e.id)).toEqual([]);
  });

  /**
   * The other half of the split: town ageing stays on the world's clock (Q3 says so explicitly), so
   * these must NOT quietly migrate to the act axis the next time somebody re-gates something.
   */
  const CALENDAR_AGEING = [
    "sel.docks.rotting",
    "sel.docks.rebuilt",
    "bram.mine.expanding",
    "bram.mine.closing",
    "amb.bowerdeep-logger.thin",
    "amb.hearthollow-elder.bloom",
    "amb.hearthollow-elder.thin",
    "amb.hearthollow-child.older",
    "amb.hearthollow-fenceman.late",
    "amb.brackwater-dockhand.rot",
    "amb.brackwater-dockhand.rebuilt",
    "amb.brackwater-netmender.late",
    "amb.r1-forager.late",
    "maren.retirement",
  ] as const;

  it("town ageing and retirement stay on the calendar", () => {
    for (const id of CALENDAR_AGEING) {
      const e = ENTRY.get(id);
      expect(e, `${id} is gone`).toBeDefined();
      expect(e!.when?.yearMin, `${id} left the calendar`).toBeGreaterThanOrEqual(2);
      expect(e!.when?.act, `${id} joined the act axis`).toBeUndefined();
      expect(e!.when?.actMin, `${id} joined the act axis`).toBeUndefined();
    }
  });

  /**
   * D19, unresolved and Hank's to rule on: six lines state "six years" as the length of a run, and
   * the calendar is now unbounded, so a year-12 player can be told they have been counting for six.
   * This does not rewrite them — G2 — it pins the set, so the ruling has an exact checklist and a
   * seventh cannot appear unnoticed. See docs/DIALOGUE-NOTES.md §8.
   */
  it("the lines that hardcode a run length are exactly the six already flagged (D19)", () => {
    // "six YEARS" only. Greaves' "six-year contract" (greaves.act4.steppe) is the Cullbrand
    // contract — a fixed historical fact, not the player's run — and it is pinned separately by
    // the steppe-duration assertion. Vesper's "nine years" is her own argument with Halder.
    const RUN_LENGTH = /\bsix years\b/i;
    const found = raw.entries
      .filter((e) => e.lines.some((l) => RUN_LENGTH.test(l.text)))
      .map((e) => e.id)
      .sort();
    expect(found).toEqual([
      "amb.brackwater-netmender.late",
      "amb.hearthollow-fenceman.late",
      "amb.r1-forager.late",
      "greaves.finale.pre",
      "maren.epilogue.released",
      "wick.act6.win",
    ]);
  });

  /**
   * The wider version of D19, and the one that actually guards the change made here. Moving a beat
   * onto the act axis frees it from the calendar — which is the fix — but it also means any year
   * figure in its copy is no longer anchored to anything. So every act-gated line that names a
   * span in years is enumerated, count for count (the pattern `DIET_LINE_REVIEW` uses), and each is
   * classified: `world` = a fact about Fallowmere that is true whenever it is said; `run-length` =
   * a claim about how long THIS run has been, which the unbounded calendar can falsify.
   *
   * Adding a year figure to an act-gated line fails here until it has been read and classified.
   * Nothing is rewritten — D19 is Hank's ruling, see docs/DIALOGUE-NOTES.md §8.
   */
  const ACT_GATED_YEAR_CLAIMS: Record<string, { lines: number; kind: "world" | "run-length" }> = {
    "gerta.warm.testimony": { lines: 1, kind: "world" }, // 31 years of shaft temperature log
    "greaves.act4.steppe": { lines: 2, kind: "world" }, // the Cullbrand contract, closed in four
    "greaves.finale.post": { lines: 1, kind: "world" }, // "forty years of records" — his career
    "greaves.finale.pre": { lines: 1, kind: "run-length" }, // "you've been counting for six years"
    "maren.epilogue.released": { lines: 1, kind: "run-length" }, // "spent six years finding"
    "maren.keystone.2": { lines: 1, kind: "world" }, // the herd, thirty years gone
    "maren.keystone.5": { lines: 1, kind: "world" }, // the vanishing, thirty years
    "maren.opening": { lines: 2, kind: "world" }, // a juvenile's three-year lifespan
    "orrin.vanishing": { lines: 2, kind: "world" }, // ninety years of margin entries
    "sel.quest.wager.offer": { lines: 1, kind: "world" }, // an Elder is one year from retiring
    "wick.act2.pre": { lines: 1, kind: "world" }, // the fishery, indexed for sixty years
    "wick.act3.win": { lines: 1, kind: "run-length" }, // "three years running" — act 3 may be year 1
    "wick.act4.pre": { lines: 1, kind: "world" }, // Cullbrand paid out for four years
    /*
     * ADDED by the prose pass, each read before it was classified. Neither is a claim about how
     * long the PLAYER has been counting, which is the only thing an act gate can falsify:
     *   maren.greeting.act3 "Two years since I walked this canopy properly" — how stale HER board
     *     is, anchored to her last survey and not to the run; the beat exists to hand the canopy
     *     figures to Vesper, so the span is the reason for the handover.
     *   wick.act5.pre "Two years I've looked for the answer to that" — anchored to the corridor
     *     where Greaves gave him the argument, which happened inside Cullbrand before act 1.
     * Both stay `world`, so the four-name run-length pin below is untouched.
     */
    "maren.greeting.act3": { lines: 1, kind: "world" },
    "wick.act5.pre": { lines: 1, kind: "world" },
    /*
     * REMOVED: `prop.cindershelf-shrine-deep` was a row for "thirty-one years of still air", and
     * the deep-shrine copy no longer names a span — it counts wax cuts instead. The thirty-one
     * years moved to `gerta.warm.testimony`, which is already reviewed above and still matches at
     * one line. Recorded rather than dropped: a register row whose entry stops matching goes
     * silently dead in one direction, which is the failure this whole block exists to catch.
     */
    "wick.act6.win": { lines: 1, kind: "run-length" }, // "six years"
  };

  it("every act-gated line that names a span in years has been read and classified", () => {
    const SPAN =
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|ninety|\d+)[- ]?years?\b/i;
    const actual = new Map<string, number>();
    for (const e of raw.entries) {
      const w = e.when ?? {};
      if (w.act === undefined && w.actMin === undefined) continue;
      const n = e.lines.filter((l) => SPAN.test(l.text)).length;
      if (n > 0) actual.set(e.id, n);
    }
    const diff: string[] = [];
    for (const [id, n] of actual) {
      const want = ACT_GATED_YEAR_CLAIMS[id]?.lines;
      if (want !== n) diff.push(`${id}: ${String(n)} year-span line(s), reviewed ${String(want ?? 0)}`);
    }
    for (const [id, row] of Object.entries(ACT_GATED_YEAR_CLAIMS)) {
      if (!actual.has(id)) diff.push(`${id}: reviewed ${String(row.lines)} but names no year span now`);
    }
    expect(diff.sort()).toEqual([]);
  });

  it("the run-length claims an act gate can falsify are exactly the four named", () => {
    // These say how long the PLAYER has been at it. Act-gated, so a fast run makes them false;
    // they are load-bearing finale lines and the reword is D19, not this task's to make.
    expect(
      Object.entries(ACT_GATED_YEAR_CLAIMS)
        .filter(([, r]) => r.kind === "run-length")
        .map(([id]) => id)
        .sort(),
    ).toEqual(["greaves.finale.pre", "maren.epilogue.released", "wick.act3.win", "wick.act6.win"]);
  });

  /**
   * D19's OTHER half, which STORY-REVIEW does not name and the act split could not fix.
   *
   * A calendar-gated line that counts years is anchored at one end only: `yearMin: N` is
   * forward-open, so the figure in the copy is true at exactly year N and drifts every year after.
   * `amb.r1-forager.late` shipped *"Six years on the same four miles of Reach"* behind `yearMin: 5`
   * and so was false at its own earliest firing — before Q3 as well as after. THE GATE was the
   * defect there and the gate is fixed (5 → 6); the forward drift is a reword and the reword is
   * Hank's ruling (D19), so it is enumerated rather than written.
   *
   * `floor` is the year the line first fires; `says` is the figure its copy names. Where they are
   * equal the line is true at its floor, which is the most an unbounded calendar allows without a
   * rewrite. `null` means the figure is a fact about Fallowmere and not about this run.
   */
  const CALENDAR_YEAR_CLAIMS: Record<string, { floor: number; says: number | null }> = {
    "amb.brackwater-dockhand.rebuilt": { floor: 3, says: null }, // eleven years since new timber — the dock's history
    "amb.bowerdeep-logger.thin": { floor: 4, says: null }, // nobody has cut there in four years — the canopy's
    "amb.hearthollow-fenceman.late": { floor: 6, says: 6 }, // "Six years I've mended this line"
    "amb.brackwater-netmender.late": { floor: 6, says: 6 }, // "three times in six years"
    "amb.r1-forager.late": { floor: 6, says: 6 }, // "Six years on the same four miles"
  };

  it("every calendar-gated line that names a span in years has been read and classified", () => {
    const SPAN =
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|ninety|\d+)[- ]?years?\b/i;
    const actual = raw.entries
      .filter((e) => {
        const w = e.when ?? {};
        return w.years !== undefined || w.yearMin !== undefined || w.yearMax !== undefined;
      })
      .filter((e) => e.lines.some((l) => SPAN.test(l.text)))
      .map((e) => e.id)
      .sort();
    expect(actual).toEqual(Object.keys(CALENDAR_YEAR_CLAIMS).sort());
  });

  it("a run-length claim on the calendar is true at the year it first fires", () => {
    // The half of D19 that IS a defect rather than a ruling: a gate that disagrees with its own
    // copy is wrong at every reading, not just the late ones.
    expect(
      Object.entries(CALENDAR_YEAR_CLAIMS)
        .filter(([, r]) => r.says !== null)
        .filter(([id, r]) => (ENTRY.get(id)!.when?.yearMin ?? FIRST_YEAR) !== r.says)
        .map(([id, r]) => `${id}: says ${String(r.says)} years, fires from year ${String(ENTRY.get(id)!.when?.yearMin)}`),
    ).toEqual([]);
  });

  /**
   * Hard Req 2 and `docs/STORY-REVIEW.md` D12: the ledger shows real numbers, so NPC copy that
   * quotes one must read the same state the ledger reads. A line that names a count with no
   * `population` clause is a line the HUD can contradict on the same screen.
   *
   * `live` = quotes the live ledger and must carry the clause. `world` = the number is a fact about
   * Fallowmere, an order book, an inventory or a biography, and no clause belongs on it.
   */
  const COUNT_CLAIM_REVIEW: Record<string, "live" | "world"> = {
    "maren.tutorial.snare": "world", // "Snares. Three of them." — the player's kit, not a node
    "vesper.pre": "world", // Halder's ORDER is for three Webvern; the order is not the count
    "tolm.greeting": "world", // four fields — his farm, not a population
    "tolm.quest.fallow.offer": "live", // "There are twenty-four of them my side of the fence"
    "tolm.quest.fallow.done.kept": "live", // "Twenty-four, and two of them juveniles"
    "halder.quest.silk.offer": "world", // "Three Webvern, adult, alive" — the ORDER size, not a count
    "orrin.vanishing": "world", // two hundred and six margin entries across ninety years
    "prop.r2-idol-shallows": "world", // "between the two of them" — the two idols
    "amb.r1-forager.thin": "live", // "all morning for two Nibbin"
    "amb.cindershelf-elder.base": "world", // "One of them kept his gloves on" — company men in a front room
    /*
     * ADDED by the prose pass. Every one of the four is a `world` row and not one of them could
     * have been anything else: `live` demands a `population` clause, and the pass was forbidden
     * from touching a `when` object, so a genuinely live count arriving here would have been a
     * corpus defect to fix rather than a row to write. Each was read against its whole beat:
     */
    "gerta.warm.testimony": "world", // "the two of them compare" — the two SHAFTS, a depth pair
    "maribel.greeting": "world", // "Two Bramblehog, two jobs" — her own stock, named, in her shed
    "odo.greeting": "world", // "no buyer for one of them" — the market, not a figure off the marsh
    "orrin.quest.trail.declined": "world", // "the four you walked" — of the six standing stones
    /*
     * REMOVED, and named so the removals are decisions rather than drift: `wick.act6.win`,
     * `gerta.greeting` and `noct.post.win` were rows for copy that no longer names a count.
     * A row whose entry stops matching is invisible to the set-equality assertion in only one
     * direction, so the deletions are recorded here rather than silently dropped.
     */
  };

  it("every line that names a count has been read and classified", () => {
    const NUM = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|twenty-four|thirty|forty|fifty|sixty|ninety|hundred|\\d+)";
    const COUNT = new RegExp(
      `\\b${NUM}[- ](?:of them|of these|left|standing|nests?|head|Fenmaw|Mirefin|Nibbin|Loamunder|Stonewing|Cragmar|Pyrelisk|Webvern|Carricrow|Bramblehog)\\b` +
        `|\\bthere (?:are|were) ${NUM}\\b|\\bcount is ${NUM}\\b|\\bdown to ${NUM}\\b`,
      "i",
    );
    const actual = raw.entries
      .filter((e) => e.lines.some((l) => COUNT.test(l.text)))
      .map((e) => e.id)
      .sort();
    expect(actual).toEqual(Object.keys(COUNT_CLAIM_REVIEW).sort());
  });

  it("a line that quotes the live ledger reads the live ledger", () => {
    // `tolm.quest.fallow.offer` quotes the Hearthollow Loamunder count and had NO clause at all —
    // it lost its `years: [1]` in the re-gating and gained nothing, so it could assert a number the
    // ledger contradicted, forever, on both clocks. Its own completion beat one entry away already
    // carried the clause it needed.
    expect(
      Object.entries(COUNT_CLAIM_REVIEW)
        .filter(([, kind]) => kind === "live")
        .filter(([id]) => (ENTRY.get(id)!.when?.population ?? []).length === 0)
        .map(([id]) => `${id} quotes a count with no population clause`),
    ).toEqual([]);
  });

  /**
   * The same rule on the abundance axis. `maren.greeting.act1` claimed Meadow Reach was "holding at
   * a decent flora stock" with no `floraStock` clause; under `years: [1]` that was wrong for at most
   * one in-game year, and under `act: [1]` — an act with no calendar bound at all — it was wrong for
   * as long as the player stayed there. The threshold is DERIVED from the corpus rather than
   * invented (G2): the shipped neighbours call r1 "thin" at `lte 45`, so "decent" is `gte 46` —
   * the weakest claim consistent with the copy and with numbers already in the file.
   */
  const FLORA_CLAIM_REVIEW: Record<string, "live" | "world"> = {
    "maren.greeting.act1": "live", // "The green's holding up out there this year"
    "amb.r1-forager.bloom": "live", // "The Reach has never come up this thick for me"
    "amb.hearthollow-elder.bloom": "live", // "come up green right down to the fence line"
    "amb.hearthollow-elder.thin": "live", // "The Reach is short this year"
    // Reviewed and deliberately left unclaused, the first recorded in docs/DIALOGUE-NOTES.md §8:
    "maren.keystone.4": "world", // "There's less green up on that steppe than there is on the Reach"
    // — a comparison between two places, not a reading of one, and a live gate on a Vellsire CHAIN
    // step could strand the chain if r4's flora recovers
    "gerta.quest.crash.offer": "world", // the ASSIGNMENT: "How far up the green gets now, measured
    // off the old cairn" — she is sending the player to take the reading, not quoting one
    "gerta.quest.crash.done": "world", // where the reading gets FILED: "The green off the cairn goes
    // in the front" — a sentence about the log book, not about the scarp
    "festival.hearthollow": "world", // "The lanterns are up on the green" — the village green
    "maribel.post.win": "world", // "the whole green goes up in lanterns" — the same village green
  };

  /**
   * THE DETECTOR WENT DEAD AND THE REGISTER KEPT REPORTING GREEN, which is the failure mode this
   * whole file exists to prevent. It keyed on the literal string "flora stock" — `nodeState.floraStock`
   * spoken aloud by a character — and the prose rewrite correctly deleted every instance of it as
   * system vocabulary. Four rows then matched nothing, and a scan that matches nothing cannot fail.
   *
   * Its first replacement was a closed list of the six SENTENCES the copy then happened to use, and
   * that lasted exactly one more prose pass: two of the six were reworded and their rows went dead
   * the same silent way. A detector keyed on sentences is a detector that expires.
   *
   * So it is keyed on the corpus's own ground-cover NOUN instead. "The green" is what every voice in
   * Fallowmere calls the stuff growing on a node — Maren, the warden, the Hearthollow elder and
   * Gerta all use it — with the two phrases that name a level without using the noun bolted on
   * (`amb.r1-forager.bloom` and `amb.hearthollow-elder.thin` are both `floraStock`-gated and neither
   * says "green"). This DOES catch the lanterns on the village green, which the sentence list was
   * built to dodge. Catching them is the point: two honest `world` rows cost nothing, and the reason
   * the previous detector could die is that it was tuned to match only what someone had already
   * read. Cheap false positives are what keeps a review register alive.
   *
   * The second assertion is the half that cannot go dead, because it is driven by DATA rather than
   * by prose: every entry carrying a `floraStock` clause must appear here. A clause can no longer
   * be added to an entry without someone reading what that entry actually says.
   */
  const FLORA = /\bgreen\b|\bcome up this thick\b|\bis short this year\b/i;

  it("every line that names ground cover has been read and classified", () => {
    const actual = raw.entries
      .filter((e) => e.lines.some((l) => FLORA.test(l.text)))
      .map((e) => e.id)
      .sort();
    expect(actual).toEqual(Object.keys(FLORA_CLAIM_REVIEW).sort());
  });

  it("every entry gated on floraStock has had its copy read", () => {
    expect(
      raw.entries
        .filter((e) => (e.when?.floraStock ?? []).length > 0)
        .map((e) => e.id)
        .filter((id) => FLORA_CLAIM_REVIEW[id] !== "live")
        .sort(),
    ).toEqual([]);
  });

  it("a line that quotes live flora reads live flora", () => {
    expect(
      Object.entries(FLORA_CLAIM_REVIEW)
        .filter(([, kind]) => kind === "live")
        .filter(([id]) => (ENTRY.get(id)!.when?.floraStock ?? []).length === 0)
        .map(([id]) => `${id} claims an abundance with no floraStock clause`),
    ).toEqual([]);
  });

  /**
   * WRITTEN but never READ — the audit that would have caught the looping epilogue.
   *
   * `story.epilogue.shown` was written by both epilogues and read by nothing, which is what "the
   * ending replays forever" looks like in the data. The remaining rows are real: they are the
   * corpus's OUTPUT to the game layer (which starter, which rival result, which quest ending, which
   * trail stone, which chain finished). Each one is named, so a new orphan is a decision.
   */
  const WRITE_ONLY_FLAGS: Record<string, string> = {
    "chain.kilnback.step6": "terminal chain step — nothing follows it inside the corpus",
    "chain.undermere.step7": "terminal chain step",
    "chain.vellsire.complete": "the gate on the Vellsire hunt; the game layer reads it (Q3b/Q7)",
    "lore.scavenger.unlocked": "a lore unlock the game layer reads",
    "quest.fallow-field.result": "quest outcome, for the epilogue ledger",
    "quest.silk-shortage.heard-vesper": "the Silk Shortage deferral (STORY-REVIEW D14, open)",
    "quest.silk-shortage.result": "quest outcome, for the epilogue ledger",
    "rival.act1.playerResult": "rival outcome, for the epilogue ledger",
    "rival.act2.playerResult": "rival outcome, for the epilogue ledger",
    "rival.act3.playerResult": "rival outcome, for the epilogue ledger",
    "rival.act4.playerResult": "rival outcome, for the epilogue ledger",
    "rival.act5.playerResult": "rival outcome, for the epilogue ledger",
    /*
     * `rival.act6.playerResult` USED TO BE HERE and is deliberately gone: `maren.finale` now READS
     * it, which is what makes her send-off wait for the act-6 fight instead of interposing before
     * it. A write-only flag that acquires a reader leaves this list — that is the list working.
     */
    "story.starter": "which starter was chosen — the Legacy beat reads it",
    "story.vellsire.attempt": "the choice is made; the OUTCOME is the game layer's to write",
    "trail.stone.r1": "Vellsire's Trail progress, counted by the game layer",
    "trail.stone.r2": "Vellsire's Trail progress",
    "trail.stone.sanctum-approach": "Vellsire's Trail progress",
  };

  it("every flag the corpus writes is either read by the corpus or a named output", () => {
    const written = new Set<string>();
    for (const e of raw.entries) {
      for (const bag of [e.setFlags ?? {}, ...(e.choices ?? []).map((c) => c.setFlags ?? {})]) {
        for (const k of Object.keys(bag)) written.add(k);
      }
    }
    const read = new Set<string>();
    for (const e of raw.entries) {
      for (const k of e.when?.flagsSet ?? []) read.add(k);
      for (const k of e.when?.flagsUnset ?? []) read.add(k);
      for (const fe of e.when?.flagEquals ?? []) read.add(fe.key);
    }
    expect([...written].filter((k) => !read.has(k)).sort()).toEqual(Object.keys(WRITE_ONLY_FLAGS).sort());
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
