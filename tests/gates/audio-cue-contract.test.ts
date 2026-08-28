/**
 * tests/gates/audio-cue-contract.test.ts — the cue names in code ARE the cue names in the bible.
 *
 * This is a set-identity gate, and it is in `tests/gates/` rather than `tests/unit/` because it is
 * permanent: it exists to make a renamed, dropped or invented cue RED instead of silent. Audio is
 * the one layer whose regression is inaudible — a cue that quietly stops being asked for sounds
 * exactly like a cue whose file has not been curated yet — so the names have to be pinned to the
 * authored source rather than to each other.
 *
 * THE BINDING RULE, borrowed from tests/unit/transcription.test.ts, which learned it the hard way:
 * **a COUNT is not an identity.** Asserting "eleven music cues" lets a bible track be renamed or
 * swapped for an invented one and stay green. So docs/content-bible.md §12a is READ OFF DISK and
 * its table is compared to `game/audio.ts` row for row — label, Context and Mood spec — not
 * summarised.
 *
 * Guardrail G2: never invent authored content. Eleven rows is the bible's own number ("Eleven rows,
 * not sixteen"), and §12a states why a twelfth does not exist yet ("A twelfth row waits on a node
 * becoming walkable"). A cue added here without being added there is an invention.
 *
 * The second half of this file is the LICENCE gate. Audio, unlike this repo's `assets/reference/`
 * captures, is redistributed inside the shipped game. So no audio file may exist in the tree
 * without a provenance row naming its source, author, licence and retrieval date, and the licence
 * must be CC0 or public domain. It was written while `assets/audio/` was still empty, so that it
 * was already standing when the first file landed; it now guards eleven real tracks.
 *
 * The header above says the table is compared "label, Context and Mood spec". The Context column is
 * the exception, and `the Context column stays in the bible` below says why: its cell for "Ancient
 * encounter" names three SPECIES, which tests/property/foodweb.test.ts refuses in any string
 * literal under core/, game/ or tools/.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ALL_CUES,
  CUE_DIRECTORY,
  CUE_KINDS,
  JINGLE_CUES,
  MUSIC_CUES,
  SFX_CUES,
  SNARE_SHAKE_REPEATS,
  cueIdForFile,
  cueIds,
  globbedCueFiles,
  indexCueFiles,
} from "../../game/audio";

const bible = readFileSync(new URL("../../docs/content-bible.md", import.meta.url), "utf8");

/** §12a, from its heading to the next `## ` heading. */
function section12a(): string {
  const start = bible.indexOf("## 12a. Audio Spec");
  expect(start, "docs/content-bible.md has no '## 12a. Audio Spec' heading").toBeGreaterThan(-1);
  const rest = bible.slice(start + 1);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

const SPEC = section12a();

/* ────────────────────────────────────────────────────────────────────────────
 * The music table — parsed mechanically, compared row for row
 * ──────────────────────────────────────────────────────────────────────────── */

interface BibleTrackRow {
  track: string;
  context: string;
  mood: string;
}

/**
 * The §12a track manifest, parsed out of the markdown table.
 *
 * Nothing about this parse is interpretive: it takes the pipe-delimited rows between the header
 * separator and the blank line, and trims each cell. If the bible's table stops being a table, this
 * throws its own way to red rather than silently producing zero rows — which is why the row count
 * is asserted before anything is compared.
 */
function parseTrackTable(): BibleTrackRow[] {
  const lines = SPEC.split("\n");
  const headerAt = lines.findIndex((l) => /^\|\s*Track\s*\|\s*Context\s*\|\s*Mood spec\s*\|/.test(l));
  expect(headerAt, "§12a has no | Track | Context | Mood spec | table header").toBeGreaterThan(-1);

  const rows: BibleTrackRow[] = [];
  // +2 skips the header and the |---|---|---| separator beneath it.
  for (let i = headerAt + 2; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || !line.trimStart().startsWith("|")) break;
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    expect(cells, `§12a table row ${i - headerAt - 1} is not three cells: ${line}`).toHaveLength(3);
    rows.push({ track: cells[0] ?? "", context: cells[1] ?? "", mood: cells[2] ?? "" });
  }
  return rows;
}

describe("bible §12a — the eleven music cues, name for name", () => {
  const table = parseTrackTable();

  it("the bible still states eleven, and still has eleven rows", () => {
    // Both halves matter. The prose number and the table can drift apart, and if they do, the fix
    // is the bible, never this assertion.
    expect(SPEC).toContain("**Track manifest — eleven tracks**");
    expect(SPEC).toContain("**Eleven rows, not sixteen.**");
    expect(table).toHaveLength(11);
  });

  it("game/audio.ts carries exactly the bible's eleven, in the bible's order", () => {
    expect(MUSIC_CUES.map((c) => c.bibleLabel)).toEqual(table.map((r) => r.track));
  });

  it("THE IDENTITY: the label SET matches — a rename on either side reddens here", () => {
    // Order is asserted above; this is the assertion that survives a deliberate reorder and still
    // catches a swap, a drop, or an invented twelfth. Sets, not counts.
    expect(new Set(MUSIC_CUES.map((c) => c.bibleLabel))).toEqual(new Set(table.map((r) => r.track)));
    expect(MUSIC_CUES).toHaveLength(table.length);
  });

  it("each cue also carries the bible's Mood spec verbatim", () => {
    // The mood spec is the whole brief a curation pass works from. A cue that keeps its name and
    // loses its mood is a cue that will be filled with the wrong track.
    for (const [i, row] of table.entries()) {
      const cue = MUSIC_CUES[i];
      expect(cue, `no code cue at table index ${i} (${row.track})`).toBeDefined();
      expect(cue?.mood, `mood spec for "${row.track}"`).toBe(row.mood);
    }
  });

  it("the Context column stays in the bible, and is not copied into code", () => {
    // Not a style preference. §12a's Context cell for "Ancient encounter" names three SPECIES, and
    // tests/property/foodweb.test.ts refuses a species name in any string literal under core/,
    // game/ or tools/ (build-doc §8.3/§10.3, G2/G3: content belongs in data/, not in code). Copying
    // the column into game/audio.ts failed that gate, which was right to fail. It is also redundant
    // — musicCueFor() answers "where does this play" as code. This asserts the column is still
    // populated in the bible, where it is authored, and that no cue object grew one back.
    for (const row of table) expect(row.context.length, `bible context for "${row.track}"`).toBeGreaterThan(0);
    for (const cue of MUSIC_CUES) {
      expect(Object.keys(cue), `${cue.id} must not carry a context field`).not.toContain("context");
    }
  });

  it("the bible's own priority call is carried on the cue it is about", () => {
    // §12a, on Retirement / legacy: "this cue carries the game's emotional beat; pick it first".
    // It is a curation instruction, so it has to survive on the cue and not only in the document.
    const retirement = MUSIC_CUES.find((c) => c.id === "retirement-legacy");
    expect(retirement?.bibleLabel).toBe("Retirement / legacy");
    expect(retirement?.mood).toContain("pick it first");
    expect(SPEC).toContain("this cue carries the game's emotional beat; pick it first");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The jingles — a clean comma list of five
 * ──────────────────────────────────────────────────────────────────────────── */

describe("bible §12a — the five jingles", () => {
  const line = SPEC.split("\n").find((l) => l.startsWith("Jingles (short stingers):"));

  it("the bible still states them as one comma list", () => {
    expect(line, "§12a has no 'Jingles (short stingers):' line").toBeDefined();
  });

  it("game/audio.ts carries exactly those five, in order", () => {
    const names = (line ?? "")
      .replace("Jingles (short stingers):", "")
      .replace(/\.\s*$/, "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    expect(names).toHaveLength(5);
    expect(JINGLE_CUES.map((c) => c.bibleLabel)).toEqual(names);
    expect(new Set(JINGLE_CUES.map((c) => c.bibleLabel))).toEqual(new Set(names));
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The SFX set — a BYTE LOCK on the sentence, plus the expansion it was read into
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * §12a's SFX sentence, transcribed here character for character.
 *
 * Why a byte lock instead of a parser: unlike the table and the jingle list, this sentence is not
 * mechanically unambiguous. "shake ×3" is a repetition count written inline with cue names, and
 * "catch success" appears in it AND in the jingle list. `game/audio.ts` states the two readings it
 * took; a parser here would only re-state them, and a gate that re-derives an interpretation from
 * the interpretation it is checking proves nothing.
 *
 * So the sentence itself is pinned. Any edit to it — a new SFX, a dropped one, a rewording —
 * reddens this gate loudly, and a human then decides what the expansion below becomes. That is the
 * right failure: an ambiguous source should stop a person, not be silently re-guessed by a test.
 */
const SFX_SENTENCE_VERBATIM =
  "**SFX set:** menu move/confirm/cancel, battle hit, super-effective hit (brighter), status apply, " +
  "snare throw / shake ×3 / catch success, flee, footsteps (grass, wood, stone), door, sign-card reveal, " +
  "survey open.";

/**
 * The expansion of that sentence, transcribed independently of `game/audio.ts` — this is a second
 * hand copying the same source, which is what makes comparing them worth anything.
 *
 * The two readings, stated in `game/audio.ts` and repeated here so this file stands alone:
 *   1. "shake ×3" is ONE cue played three times, so it contributes one name plus a repeat count.
 *   2. the "catch success" inside this sentence is the jingle of that name, not a second cue, so it
 *      contributes nothing here.
 */
const SFX_EXPANSION = [
  "menu move",
  "menu confirm",
  "menu cancel",
  "battle hit",
  "super-effective hit (brighter)",
  "status apply",
  "snare throw",
  "shake ×3",
  "flee",
  "footsteps (grass)",
  "footsteps (wood)",
  "footsteps (stone)",
  "door",
  "sign-card reveal",
  "survey open",
];

describe("bible §12a — the SFX set", () => {
  it("THE BYTE LOCK: the bible's SFX sentence is unchanged", () => {
    // If this reddens, the bible moved. Do not edit this constant to match — read the new sentence,
    // decide what it means for SFX_EXPANSION and game/audio.ts's SFX_CUES, and move all three.
    expect(SPEC).toContain(SFX_SENTENCE_VERBATIM);
  });

  it("game/audio.ts's SFX labels equal the transcribed expansion", () => {
    expect(SFX_CUES.map((c) => c.bibleLabel)).toEqual(SFX_EXPANSION);
    expect(new Set(SFX_CUES.map((c) => c.bibleLabel))).toEqual(new Set(SFX_EXPANSION));
  });

  it("reading 1 is carried as a count, not as three cue names", () => {
    expect(SNARE_SHAKE_REPEATS).toBe(3);
    expect(SFX_CUES.filter((c) => c.bibleLabel.includes("shake"))).toHaveLength(1);
  });

  it("reading 2 holds: 'catch success' is one cue, and it is the jingle", () => {
    expect(JINGLE_CUES.filter((c) => c.bibleLabel === "catch success")).toHaveLength(1);
    expect(SFX_CUES.filter((c) => c.bibleLabel === "catch success")).toHaveLength(0);
    expect(ALL_CUES.filter((c) => c.id === "catch-success")).toHaveLength(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The catalogue's own invariants
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the cue catalogue is internally coherent", () => {
  it("every cue id is unique across all three kinds", () => {
    expect(cueIds()).toHaveLength(ALL_CUES.length);
    expect(new Set(ALL_CUES.map((c) => c.id)).size).toBe(ALL_CUES.length);
  });

  it("every cue id is a filesystem-safe slug — it becomes a file basename", () => {
    // cueIdForFile() matches a dropped file to a cue by basename, so an id with a dot, a slash or a
    // space is an id no file can ever be named after.
    for (const cue of ALL_CUES) expect(cue.id, `cue id "${cue.id}"`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("every cue declares a kind the catalogue knows, and no kind is empty", () => {
    for (const cue of ALL_CUES) expect(CUE_KINDS).toContain(cue.kind);
    for (const kind of CUE_KINDS) {
      expect(ALL_CUES.filter((c) => c.kind === kind).length, `kind "${kind}"`).toBeGreaterThan(0);
      expect(CUE_DIRECTORY[kind], `directory for "${kind}"`).toMatch(/^[a-z]+$/);
    }
  });

  it("music loops and stingers do not — except the two §12a writes as one-shots", () => {
    // "Retirement / legacy" is "tender, SHORT, resolves upward" and "Festival / year-turn" is a
    // "celebratory jingle into a quiet OUTRO". Both resolve; looping them would talk over the beat
    // they exist for. Everything else in the table is a bed and loops.
    for (const cue of [...JINGLE_CUES, ...SFX_CUES]) expect(cue.loop, cue.id).toBe(false);
    const oneShots = MUSIC_CUES.filter((c) => !c.loop).map((c) => c.id);
    expect(oneShots).toEqual(["retirement-legacy", "festival"]);
  });

  it("only music cues carry a Mood spec — the bible gives the jingles and SFX none", () => {
    for (const cue of MUSIC_CUES) {
      expect(cue.mood, cue.id).not.toBeNull();
    }
    for (const cue of [...JINGLE_CUES, ...SFX_CUES]) {
      expect(cue.mood, cue.id).toBeNull();
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE LICENCE GATE — nothing ships without provenance
 * ──────────────────────────────────────────────────────────────────────────── */

const AUDIO_DIR = new URL("../../assets/audio/", import.meta.url);
const PROVENANCE = new URL("PROVENANCE.md", AUDIO_DIR);

/** Every audio file under assets/audio/, as a path relative to that directory. */
function shippedAudioFiles(): string[] {
  const root = AUDIO_DIR.pathname;
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) walk(full, `${prefix}${entry}/`);
      else if (/\.(ogg|mp3|m4a|wav|flac|opus)$/i.test(entry)) out.push(`${prefix}${entry}`);
    }
  };
  walk(root, "");
  return out;
}

/**
 * The provenance table, as `{file: {source, author, licence, retrieved}}`.
 *
 * The columns are fixed by this gate rather than by the file, so a row that drops its licence
 * column cannot pass by being shorter.
 */
function parseProvenance(): Map<string, { source: string; author: string; licence: string; retrieved: string }> {
  const rows = new Map<string, { source: string; author: string; licence: string; retrieved: string }>();
  if (!existsSync(PROVENANCE.pathname)) return rows;
  const text = readFileSync(PROVENANCE, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length !== 5) continue;
    const [file, source, author, licence, retrieved] = cells;
    if (file === undefined || file === "File" || /^-+$/.test(file)) continue;
    rows.set(file, {
      source: source ?? "",
      author: author ?? "",
      licence: licence ?? "",
      retrieved: retrieved ?? "",
    });
  }
  return rows;
}

/**
 * Licences this project may redistribute. CC0 and public domain ONLY.
 *
 * NOT on this list, deliberately: CC-BY (bible §12a calls it "acceptable with an attribution file",
 * and this gate is stricter than the bible because an attribution obligation the build cannot prove
 * it honours is a licence risk, not a licence), and anything NonCommercial or ShareAlike.
 */
const ALLOWED_LICENCES = [/\bCC0\b/i, /\bpublic domain\b/i, /\bunlicense\b/i];

describe("LICENCE GATE — audio is redistributed, so nothing ships unprovenanced", () => {
  const files = shippedAudioFiles();
  const provenance = parseProvenance();

  it("the provenance file exists next to the audio", () => {
    // It exists before the audio does, on purpose: the file that records a licence must never be
    // the thing someone remembers to add afterwards.
    expect(existsSync(PROVENANCE.pathname), "assets/audio/PROVENANCE.md is missing").toBe(true);
  });

  it("every shipped audio file has a provenance row", () => {
    const missing = files.filter((f) => !provenance.has(f));
    expect(missing, `audio files with no row in assets/audio/PROVENANCE.md: ${missing.join(", ")}`).toEqual([]);
  });

  it("every provenance row names a source URL, an author, a licence and a retrieval date", () => {
    for (const [file, row] of provenance) {
      expect(row.source, `${file}: source`).toMatch(/^https?:\/\/\S+$/);
      expect(row.author.length, `${file}: author`).toBeGreaterThan(0);
      expect(row.licence.length, `${file}: licence`).toBeGreaterThan(0);
      expect(row.retrieved, `${file}: retrieved`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("every licence is CC0 or public domain — CC-BY, NC and SA are all refused", () => {
    for (const [file, row] of provenance) {
      const ok = ALLOWED_LICENCES.some((re) => re.test(row.licence));
      expect(ok, `${file} is licensed "${row.licence}", which is not CC0/public domain`).toBe(true);
      expect(row.licence, `${file}: NonCommercial is not redistributable here`).not.toMatch(/\bNC\b|NonCommercial/i);
      expect(row.licence, `${file}: ShareAlike is not redistributable here`).not.toMatch(/\bSA\b|ShareAlike/i);
    }
  });

  it("no provenance row describes a file that is not there", () => {
    const orphans = [...provenance.keys()].filter((f) => !files.includes(f));
    expect(orphans, `provenance rows with no file: ${orphans.join(", ")}`).toEqual([]);
  });

  it("every shipped audio file answers to a cue — an unplayable file still carries a licence", () => {
    const unclaimed = files.filter((f) => cueIdForFile(f) === null);
    expect(unclaimed, `audio files matching no cue id: ${unclaimed.join(", ")}`).toEqual([]);
  });

  it("THE REAL LOADER PATH: the shipped glob sees exactly the files on disk, and all of them are cues", () => {
    // Everything else in the audio suite injects a `{cueId: url}` map, which proves the director
    // works and proves NOTHING about whether the build can actually see the files. This drives
    // globbedCueFiles() — the same `import.meta.glob` the game boots through, resolved by the same
    // Vite that builds it — so "the audio is wired up" is evidence about the production path.
    const index = indexCueFiles(globbedCueFiles());
    expect(index.unclaimed, `globbed files matching no cue: ${index.unclaimed.join(", ")}`).toEqual([]);
    expect([...index.urls.keys()].sort()).toEqual(files.map((f) => cueIdForFile(f)).filter((id) => id !== null).sort());
    // And every URL it produced is one the browser could actually request.
    for (const [id, url] of index.urls) expect(url.length, `url for ${id}`).toBeGreaterThan(0);
  });

  it("every shipped audio file sits under the directory its cue's kind names", () => {
    for (const file of files) {
      const id = cueIdForFile(file);
      if (id === null) continue;
      const cue = ALL_CUES.find((c) => c.id === id);
      expect(cue, file).toBeDefined();
      if (cue === undefined) continue;
      const dir = `${CUE_DIRECTORY[cue.kind]}/`;
      expect(file.startsWith(dir), `${file} should be under ${dir}`).toBe(true);
    }
  });
});
