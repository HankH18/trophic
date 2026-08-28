/**
 * tests/gates/layout-encounter-contract.test.ts — THE MAP AND THE POPULATIONS MUST AGREE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE RULING THIS ENFORCES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * The art lane composes each map from tiles stamped out of a hand-authored ASCII layout — one
 * character per 16px collision cell, 64×64 cells over a 1024² native map. `,` is scrub: the
 * walkable-but-textured terrain that IS the encounter terrain. `data/nodes/<id>.json` declares, in
 * the same breath, which lines live at that node — and under G3 that declaration is the encounter
 * table, because "encounter weight of a species IS populations[s].count".
 *
 * Two lanes, two files, one claim about the same world. Agreed between them:
 *
 *   **A node with no encounter cells means "no wild encounters here", stated by the layout.**
 *
 * That reading is only worth anything as a BICONDITIONAL, and both directions are asserted
 * separately below so a failure says which one broke:
 *
 *   → populations non-empty  ⇒  at least one encounter cell.  A node that declares six lines and
 *     draws nowhere to meet them is six species the player can never see. This is the direction
 *     that was actually red: `cindershelf` shipped 0 encounter cells against 6 declared lines,
 *     one of which (`pyrelisk-line`) is a STARTER line.
 *   → zero encounter cells   ⇒  populations empty.  The same fact from the other side, and the
 *     direction that keeps the first one from being satisfied by deleting the animals.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE TRAP IN THE FILE FORMAT — WHY A `grep -o ',' | wc -l` IS A BROKEN INSTRUMENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * A layout `.txt` is NOT a bare grid. It opens with a long prose header — the coordinate space, the
 * seed data, the decisions the author made, and a legend — and only then the 64 rows. **Every one of
 * those header sections is full of commas**, and the legend contains the literal line
 * `#   ,  floor  scrub`. Measured on the COMMITTED tree, so you can reproduce it: counting `,` over
 * the whole cindershelf file gives 255 while its grid holds 180. The gap is the header.
 *
 * That gap is not a wobble, and the reason this matters is the case where the two counts disagree
 * about the ANSWER rather than the amount. When cindershelf's defect was live its grid held ZERO
 * scrub cells while its file still counted dozens of commas in the prose — so a whole-file count
 * reported the node as having encounter terrain, i.e. **it reported "no bug", and reported it as a
 * pass.** Any parse that does not isolate the grid first is an instrument that certifies success.
 *
 * ⚠ That defective file was never committed — it lived in a gitignored directory and is gone — so
 * the exact figure from that moment is NOT reproducible from this repository and is deliberately
 * not quoted here. The 255/180 pair above is. A number nobody can reproduce is a number that will
 * be repeated into briefs long after it stopped being true; this file does not add to that stock.
 *
 * ── HOW THE GRID IS ISOLATED, AND WHY IT IS NOT A SPLIT ON `---` ─────────────────────────────────
 * The grid is **the longest run of CONSECUTIVE lines that are each EXACTLY `GRID_SIDE` characters
 * long.** Two independent lanes derived this rule separately and agree on all twelve nodes.
 *
 * Every shipped layout does also carry a `---` separator immediately above its grid, and splitting
 * on it looks simpler. It is the fragile one and it is deliberately NOT used here: a separator split
 * takes the FIRST `---`, so the day a header contains one — a rule under a heading, an em-dash run in
 * prose, a quoted diff — the "grid" silently starts in the middle of the prose and every reading
 * below it changes. **Do not "simplify" this to a separator split.**
 *
 * The longest-run rule is doing real work rather than being a fancy way of saying the same thing,
 * and that is measured rather than asserted: three of the twelve files (`cindershelf`, `duskhollow`,
 * `r2`) contain a PROSE line that happens to be exactly 64 characters wide, ABOVE the grid. A
 * first-run rule would parse a one-line comment as the map. `BINDS — the longest-run parse is doing
 * real work` below re-derives that from the shipped files on every run, so if the header prose ever
 * stops producing incidental 64-char lines the reader is told the binder went slack rather than
 * being left with a rule whose justification has quietly expired.
 *
 * A TIE IS A FAILURE, never a coin-flip. If two runs share the maximum length the file is ambiguous
 * and `findGrid` says so; picking either would be a parse that looks confident and is guessing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE STRUCTURAL PROPERTY THAT MATTERS MOST: THIS GATE ENUMERATES FROM `data/nodes/`, NEVER FROM
 * THE LAYOUT DIRECTORY
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * A gate that walks the layout directory FAILS OPEN. Move the layouts, rename them, empty the
 * directory, point `LAYOUT_DIR` at a typo — the loop runs zero times, nothing is asserted, and the
 * suite reports success over an absence. This project has been burned by exactly that shape before:
 * a fully green suite once certified 39 dialogue entries the player could not reach, including both
 * epilogues, because the checks supplied their own scope. `tests/gates/reachability.test.ts` is the
 * standing answer to it, and `tests/gates/asset-palette-contract.test.ts` records the same failure
 * mode for assets ("a gate whose scope is a directory listing cannot notice a DELETION").
 *
 * So the scope here is the NODES, and it is taken from two sources that fail in opposite directions:
 *
 *   • `readdirSync('data/nodes')` — what is on disk. Sees a node file that has been added.
 *   • `validateContent().nodes` — the STATICALLY IMPORTED bundle. `core/schemas.ts` imports all
 *     twelve node JSONs by name, so a deleted or renamed node file is a module-resolution failure
 *     rather than a shorter list. This half cannot silently shrink.
 *
 * They are asserted to agree, and asserted to be non-empty, so neither an empty `data/nodes/` nor an
 * unwired new node can pass. **A node with no layout file is then a FAILURE, reported by name** —
 * never a skip, never a shorter loop.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHERE THE LAYOUTS LIVE, AND WHY THE LOCATION IS PART OF THE CONTRACT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * `LAYOUT_DIR` is `tools/mapgen/layouts/`, which is where `render.ts` and `verify.ts` already look.
 * It is a single named constant so the path is one edit rather than many; do not inline it below.
 *
 * IT HAS ALREADY MOVED ONCE, AND BOTH REASONS ARE WORTH KEEPING, because they are the argument for
 * why this gate reads a TRACKED directory and must go on doing so:
 *
 *   1. The hand-authored layouts were written into `assets/raw/_trials/tiles/layouts/`, and
 *      `.gitignore` line 8 is `assets/raw/**`. So the entire design pass — twelve authored maps —
 *      was untracked and existed in exactly one place on disk, where a `git clean -xfd` from any
 *      agent in this shared tree would have deleted it with no flag and no trace. They were copied
 *      here and committed for that reason before anything else was built on them. A gate that reads
 *      an ignored directory is also a gate that is red on every fresh clone and in CI, for a reason
 *      that has nothing to do with the art.
 *   2. This directory previously held the twelve SEEDED layouts `tools/mapgen/seed.ts` wrote — the
 *      ancestors of the authored ones, not the same content. Six of them (`brackwater`,
 *      `cindershelf`, `r2`, `r4`, `sanctum-approach`, `sanctum`) carried ZERO `,` cells while their
 *      nodes declared populations, so this gate reds on six nodes if the seed layouts ever come
 *      back. That red would be CORRECT: it would be reporting that nothing composes from the seed
 *      layouts any more. If you meet it, the fix is upstream — do not point this constant elsewhere
 *      to get away from it.
 *
 * ⚠ Which is also why `tools/mapgen/run.ts seed --force` is guarded: the seeder can put exactly the
 * content described in (2) back into exactly this directory, and this gate is one of the few things
 * that would notice.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * G11, AND WHY 64 AND THE ALPHABET LIVE IN THIS FILE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * G11 forbids a GAMEPLAY constant as a literal in code — a damage coefficient, a catch rate, a party
 * size. `GRID_SIDE` and `LAYOUT_ALPHABET` are neither. They are the STRUCTURAL PROPERTIES OF A FILE
 * FORMAT: the shape a `.txt` must have to be parseable at all, and the alphabet it may be spelled
 * in. Nothing in `core/` reads them, they never reach the sim, the battle reducer or the save, and
 * `data/balance.json` is not where a file format's grammar belongs. `tools/mapgen/legend.ts` makes
 * the same argument for the legend's own control colours in as many words. **This is deliberate;
 * please do not "fix" it by moving them into balance.json.**
 *
 * The alphabet is nevertheless not left free-floating: it is declared here as a closed set AND
 * asserted to be exactly the character set `DEFAULT_LEGEND` declares. That is what makes it closed
 * in a useful way — an unknown character in a grid is a failure here, and a new terrain kind has to
 * be a deliberate edit in BOTH places, which is the point of a closed set. The encounter character
 * is bound the same way: `,` is asserted to be the legend's `scrub` row rather than trusted as a
 * literal, so re-lettering the legend reddens this file instead of silently moving what it counts.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findLayoutGrid, type LayoutGridParse, type LayoutRun } from "../../core/foodweb";
import { validateContent } from "../../core/schemas";
import { DEFAULT_LEGEND } from "../../tools/mapgen/legend.ts";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const content = validateContent();

/* ════════════════════════════════════════════════════════════════════════════
 * 0. The two paths, and the format's grammar
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * WHERE THE HAND-AUTHORED LAYOUTS LIVE — tracked, and the same directory `render.ts` and
 * `verify.ts` read. See the header for why the location is itself part of the contract and why
 * moving this constant is the wrong response to a red. Named so the path is one edit; do not
 * inline it anywhere below.
 */
const LAYOUT_DIR = "tools/mapgen/layouts";

/** Where the node declarations live. The SCOPE of this gate comes from here, never from above. */
const NODE_DIR = "data/nodes";

/**
 * 64 rows of 64 columns. A structural property of the file format, not a gameplay constant — see the
 * G11 note in the header. It is the same 64 on both axes by construction: the layout is one
 * character per `balance.map.collisionCellPx` (16px) cell over a 1024² native map, and the layout
 * headers state it as "grid 64 cols × 64 rows".
 */
const GRID_SIDE = 64;

/**
 * THE CLOSED ALPHABET. Every character any grid may contain.
 *
 * It is closed on purpose: a character nobody declared is either a typo that will stamp the wrong
 * tile, or a new terrain kind that arrived without anyone deciding what it means for collision, for
 * the control image, or for encounters. Both deserve a human, so both are a failure here and the fix
 * is a deliberate edit to this set AND to `tools/mapgen/legend.ts` — which is asserted, below, to
 * hold exactly these fifteen characters.
 *
 * Measured as the union over all twelve shipped grids, and identical to the legend's own alphabet.
 */
const LAYOUT_ALPHABET: ReadonlySet<string> = new Set([
  ".", // floor  open-ground         the default fill
  ",", // floor  scrub               THE ENCOUNTER TERRAIN — see ENCOUNTER_CHAR
  ":", // floor  path-corridor       the worn track joining the map edges
  "o", // floor  centre-clearing     the open region the spawn search lands in
  "~", // floor  shallow             wadeable water margin
  "#", // WALL   wall                generic impassable mass
  "B", // WALL   building-footprint
  "T", // WALL   tree-mass
  "W", // WALL   water               deep enough to block
  "R", // WALL   rock                basalt, scree, standing stone, crater rim
  "F", // WALL   fence               pen rail, jetty edge, ore-cart rail
  "*", // ANCH   prop-anchor         a data/nodes/*.json props[] entry
  "@", // ANCH   spawn-anchor
  "^", // ANCH   edge-mouth          where a corridor meets the map edge
  "D", // ANCH   door-anchor
]);

/**
 * The character that IS an encounter cell.
 *
 * Bound to the legend below rather than trusted: `,` is the legend's `scrub` row, "walkable but
 * textured — long grass, ferns, heather". If someone re-letters that row, this gate must move with
 * it or it starts counting a character that no longer means grass — which is the same class of
 * defect as counting commas in the prose, arrived at from the other direction.
 */
const ENCOUNTER_CHAR = ",";

/** The legend kind `ENCOUNTER_CHAR` must carry. The binding runs in section 2. */
const ENCOUNTER_KIND = "scrub";

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The parse. Everything below is only as good as this.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * THE PARSE IS `core/foodweb.ts` `findLayoutGrid`, NOT A COPY OF IT.
 *
 * It used to live here, and the rule it implements is documented at its new home in as much detail:
 * the grid is the LONGEST RUN of consecutive lines that are each exactly `GRID_SIDE` characters,
 * deliberately not a split on `---` and deliberately not the FIRST such run, with a tie treated as a
 * failure rather than a coin-flip.
 *
 * It MOVED because the engine now needs the same answer. `game/encounters.ts` derives each node's
 * encounter mask from these same twelve files, so the parse decides what the player can meet and
 * where — and two implementations of "where does the grid start" would be a gate measuring one map
 * while the game plays another. That is the same defect this file's header describes for comma
 * counting, arrived at from the other side. One function, both readers.
 *
 * `GRID_SIDE` stays here and is passed IN, so the G11 argument in the header is unchanged: the file
 * format's shape is this gate's constant, not a gameplay one. `core/foodweb.ts` takes its own width
 * from `balance.map.collisionCols`, and the two are asserted equal below.
 *
 * `Run` and `GridParse` are kept as local aliases so every message and helper below reads exactly as
 * it did.
 */
type Run = LayoutRun;
type GridParse = LayoutGridParse;

function findGrid(text: string): GridParse {
  return findLayoutGrid(text, GRID_SIDE);
}

/** `null` when the grid is exactly `GRID_SIDE`², otherwise the reason it is not, spelled out. */
function shapeProblem(parse: GridParse): string | null {
  if (parse.rows.length === 0) {
    return `no run of ${String(GRID_SIDE)}-character lines anywhere in the file — this is not a layout`;
  }
  if (parse.ambiguous) {
    const tied = parse.runs
      .filter((r) => r.length === (parse.runs[0] as Run).length)
      .map((r) => `line ${String(r.firstLine)}`)
      .join(", ");
    return (
      `AMBIGUOUS: ${String(parse.runs[0]?.length ?? 0)} lines of exactly ${String(GRID_SIDE)} ` +
      `characters appear in ${String(parse.runs.filter((r) => r.length === (parse.runs[0] as Run).length).length)} ` +
      `places (${tied}). The parse refuses to guess which is the map.`
    );
  }
  if (parse.rows.length !== GRID_SIDE) {
    return (
      `the grid at line ${String(parse.firstLine)} is ${String(parse.rows.length)} rows, not ` +
      `${String(GRID_SIDE)}. Every row IS ${String(GRID_SIDE)} characters wide, so the run ended ` +
      "where a row is a different width — look at the first line after the run, and at the line " +
      "before it"
    );
  }
  // The run is defined by width, so this cannot fire through `findGrid` — it is here so the function
  // is honest about its own contract for any caller that hands it rows from somewhere else.
  const bad = parse.rows.findIndex((r) => r.length !== GRID_SIDE);
  if (bad !== -1) {
    return (
      `row ${String(bad)} (file line ${String(parse.firstLine + bad)}) is ` +
      `${String((parse.rows[bad] as string).length)} characters, not ${String(GRID_SIDE)}`
    );
  }
  return null;
}

interface UnknownChar {
  char: string;
  /** Grid coordinates, 0-based, so a reader can find the cell. */
  col: number;
  row: number;
  /** 1-based line in the file, so a reader can find the line. */
  line: number;
  count: number;
}

/** Every character in the grid that is not in the closed alphabet, first occurrence located. */
function unknownChars(parse: GridParse): UnknownChar[] {
  const found = new Map<string, UnknownChar>();
  parse.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (LAYOUT_ALPHABET.has(ch)) return;
      const seen = found.get(ch);
      if (seen) seen.count += 1;
      else found.set(ch, { char: ch, col: c, row: r, line: parse.firstLine + r, count: 1 });
    });
  });
  return [...found.values()].sort((a, b) => b.count - a.count);
}

/** How many cells of the grid are encounter terrain. */
function encounterCells(parse: GridParse): number {
  let n = 0;
  for (const row of parse.rows) for (const ch of row) if (ch === ENCOUNTER_CHAR) n += 1;
  return n;
}

/**
 * Walkable cells, for the advisory density reading only. `tools/mapgen/legend.ts` is explicit that
 * `#` is the only character the ENGINE treats as blocked and that `tools/mapgen/layout.ts`
 * normalises every `blocks: true` character to `#` first, so blockedness is read off the legend
 * here rather than from a second list of wall characters.
 */
const BLOCKING_CHARS: ReadonlySet<string> = new Set(
  DEFAULT_LEGEND.filter((e) => e.blocks).map((e) => e.char),
);

function walkableCells(parse: GridParse): number {
  let n = 0;
  for (const row of parse.rows) for (const ch of row) if (!BLOCKING_CHARS.has(ch)) n += 1;
  return n;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The scope — taken from the NODES, and proven non-vacuous before it is used
 * ════════════════════════════════════════════════════════════════════════════ */

/** Node ids on disk under `data/nodes/`. Sees an ADDED node file. */
const NODE_IDS_ON_DISK: string[] = existsSync(resolve(ROOT, NODE_DIR))
  ? readdirSync(resolve(ROOT, NODE_DIR))
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.slice(0, -".json".length))
      .sort()
  : [];

/**
 * Node ids from the STATICALLY IMPORTED bundle. Cannot silently shrink: `core/schemas.ts` imports
 * every node JSON by name, so a deleted file is a resolution failure, not a shorter list.
 */
const NODE_IDS_WIRED: string[] = content.nodes.map((n) => n.id).sort();

interface NodeLayout {
  id: string;
  /** Repo-relative, so every message names a path someone can open. */
  path: string;
  exists: boolean;
  parse: GridParse;
  /**
   * The line ids `data/nodes/<id>.json` declares.
   *
   * ⚠ SHAPE, MEASURED RATHER THAN ASSUMED: `populations` is an OBJECT keyed by species-line id, each
   * value `{ count, breedRate, carryCap }` (`zNodePopulation` in `core/schemas.ts`) — NOT an array.
   * A node with no `populations` key would parse to `{}` and read as empty here; on the shipped tree
   * all twelve declare the key, holding 1 to 7 lines.
   *
   * ⚠ AND IT IS THE KEYS, NOT `count > 0`. That was considered and rejected: a line at count 0 with
   * a positive `breedRate` REGROWS under `core/ecosim.ts` and becomes catchable again, so keying the
   * contract on the standing count would make it true today and false after a year turn. The
   * declaration is the durable statement about what lives there, and it is what G3 calls the
   * encounter table. The two readings coincide on the shipped tree anyway — the smallest declared
   * count in `data/nodes/` is 1 — so nothing is being loosened by choosing the stable one.
   */
  lines: string[];
}

const LAYOUTS: NodeLayout[] = content.nodes.map((node) => {
  const path = `${LAYOUT_DIR}/${node.id}.txt`;
  const abs = resolve(ROOT, path);
  const exists = existsSync(abs);
  return {
    id: node.id,
    path,
    exists,
    parse: exists ? findGrid(readFileSync(abs, "utf8")) : { rows: [], firstLine: 0, runs: [], ambiguous: false },
    lines: Object.keys(node.populations).sort(),
  };
});

describe("the layout census cannot pass vacuously", () => {
  /**
   * The anti-fail-open assertion, and the reason this gate enumerates from `data/nodes/`. If this
   * ever reads zero, everything below is asserting over an empty loop and the suite would otherwise
   * report success over an absence.
   */
  it("takes its scope from data/nodes/ and finds nodes there", () => {
    expect(NODE_IDS_ON_DISK.length).toBeGreaterThan(0);
    expect(NODE_IDS_WIRED.length).toBeGreaterThan(0);
    expect(LAYOUTS.length).toBe(NODE_IDS_WIRED.length);
  });

  /**
   * The two halves of the scope fail in opposite directions, so they are asserted to agree: a node
   * JSON added to the directory but never wired into `core/schemas.ts` would be data nothing loads,
   * and a wired id with no file on disk would be a rename nobody finished.
   */
  it("the directory listing and the statically imported bundle name the same nodes", () => {
    expect(
      NODE_IDS_ON_DISK,
      `${NODE_DIR}/ and core/schemas.ts SHIPPED_NODE_JSON disagree about which nodes exist. ` +
        `on disk: ${NODE_IDS_ON_DISK.join(", ")} — wired: ${NODE_IDS_WIRED.join(", ")}`,
    ).toEqual(NODE_IDS_WIRED);
  });

  /**
   * BINDS the parse rule against the files it is a rule about.
   *
   * The longest-run rule is only worth its complexity if a FIRST-run rule would get a different
   * answer, and on the shipped tree it would: three layouts carry a prose line of exactly
   * `GRID_SIDE` characters above the grid. If this ever fails, the justification in the header has
   * expired — the rule may still be the right one for the reason given (a `---` in a header), but
   * nobody should go on citing a measurement that no longer reproduces.
   */
  it("BINDS — the longest-run parse is doing real work: prose lines of grid width exist above grids", () => {
    const decoys = LAYOUTS.filter((l) => l.exists && l.parse.runs.some((r) => r.firstLine < l.parse.firstLine));
    expect(
      decoys.length,
      "no layout header contains an incidental line of exactly " +
        `${String(GRID_SIDE)} characters any more, so a first-run parse would agree with the ` +
        "longest-run parse today. The rule stays (a `---` in a header is the fragile case the " +
        "separator split cannot survive), but this binder is no longer measuring anything.",
    ).toBeGreaterThan(0);
    // …and the decoys really are decoys: shorter than the grid, and above it.
    for (const l of decoys) {
      for (const r of l.parse.runs.filter((r) => r.firstLine < l.parse.firstLine)) {
        expect(r.length).toBeLessThan(GRID_SIDE);
      }
    }
  });

  /**
   * BINDS the closed alphabet to the legend, so the set above cannot fossilise away from the tooling
   * that stamps the tiles. A divergence in either direction wants a human: a character here that the
   * legend does not know is one this gate would wave through and `tools/mapgen/layout.ts` could not
   * normalise, and a legend row missing from here is a terrain kind that would fail the closed-set
   * gate the first time an author draws it.
   */
  it("BINDS — the closed alphabet is exactly the shipped legend's characters", () => {
    const legend = [...DEFAULT_LEGEND.map((e) => e.char)].sort();
    expect(
      [...LAYOUT_ALPHABET].sort(),
      "LAYOUT_ALPHABET and tools/mapgen/legend.ts DEFAULT_LEGEND have diverged. Both are edited " +
        "deliberately — decide what the new character means for collision, for the control image " +
        "and for encounters, then add it in both places.",
    ).toEqual(legend);
    expect(legend.length).toBeGreaterThan(0);
  });

  /**
   * BINDS the encounter character itself. `,` is not a magic literal here; it is the legend's scrub
   * row. Re-lettering that row without touching this file would leave the gate counting a character
   * that no longer means grass — a green over the wrong terrain.
   */
  it("BINDS — the encounter character is the legend's scrub row, and is walkable", () => {
    const entry = DEFAULT_LEGEND.find((e) => e.char === ENCOUNTER_CHAR);
    expect(entry, `the legend no longer declares "${ENCOUNTER_CHAR}"`).toBeDefined();
    expect(entry?.kind).toBe(ENCOUNTER_KIND);
    // Encounter terrain the player cannot stand in is not encounter terrain.
    expect(entry?.blocks).toBe(false);
    expect(BLOCKING_CHARS.has(ENCOUNTER_CHAR)).toBe(false);
  });

  /**
   * BINDS THE THIRD LANE. The character is now stated in THREE places that must agree, and until the
   * mask landed only two of them existed:
   *
   *   • `tools/mapgen/legend.ts` — the art lane's meaning ("scrub: walkable but textured");
   *   • this file — what the census counts;
   *   • `data/balance.json` `encounter.encounterTerrainChar` — what the GAME rolls on, which is the
   *     new one, and which G11 puts in balance.json rather than as a literal in `core/`.
   *
   * A re-lettering that moved only the legend would leave the game rolling on a character that no
   * longer means grass and this gate counting a third thing. All three are asserted equal here
   * because this is the only file that imports all three.
   */
  it("BINDS — balance.json's encounter terrain character is that same legend row", () => {
    expect(
      content.balance.encounter.encounterTerrainChar,
      "data/balance.json encounter.encounterTerrainChar and this gate disagree about which " +
        "character is grass — the game and the census would be counting different terrain",
    ).toBe(ENCOUNTER_CHAR);
    const entry = DEFAULT_LEGEND.find((e) => e.char === content.balance.encounter.encounterTerrainChar);
    expect(entry?.kind, "balance.json names a character the legend does not call scrub").toBe(ENCOUNTER_KIND);
  });

  /**
   * BINDS THE PARSE WIDTH. `GRID_SIDE` is this file's constant and `core/foodweb.ts` takes its own
   * from `balance.map.collisionCols`; the shared parser is only shared if the two are the same
   * number. If they ever differ, this gate and the running game isolate different grids out of the
   * same file, and both would look fine on their own.
   */
  it("BINDS — the gate's grid width is the one core/foodweb.ts parses with", () => {
    expect(content.balance.map.collisionCols).toBe(GRID_SIDE);
    expect(content.balance.map.collisionRows).toBe(GRID_SIDE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. GATE — every node has a layout file
 * ════════════════════════════════════════════════════════════════════════════ */

describe("GATE — every node declared in data/nodes/ has a layout", () => {
  it("names every node whose layout file is missing", () => {
    const missing = LAYOUTS.filter((l) => !l.exists);
    const report =
      `${String(missing.length)} node(s) are declared in ${NODE_DIR}/ and have NO layout file. ` +
      "The layout is the map, so a node without one has no ground, no collision and no encounter " +
      "terrain — and this gate refuses to shrink its loop over the absence:\n" +
      missing.map((m) => `  • ${m.id} — expected ${m.path}`).join("\n") +
      `\n\nIf EVERY node is listed, suspect the directory rather than the art: ${LAYOUT_DIR}/ is ` +
      "probably absent or renamed. It is tracked, so a fresh clone has it — which means an empty " +
      "one is a local event: a bad path in this file's LAYOUT_DIR, or files removed in the working " +
      "tree. Check `git status tools/mapgen/layouts` before anything else; the twelve layouts are " +
      "the hand-authored design pass and `git checkout` restores them. Repointing LAYOUT_DIR at a " +
      "directory where the files happen to be is never the fix — see this file's header.";
    expect(missing.length === 0 || report).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. GATE — grid shape, ASSERTED BEFORE ANY CONTENT READING
 *
 * The ordering is load-bearing rather than tidy. A malformed grid parses to a short run, a short run
 * holds few or no `,` cells, and the biconditional below would then go red on a node whose layout is
 * FINE — the right answer for the wrong reason, believed because the message named the right node.
 * Shape failures are therefore reported separately, in their own words, first.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("GATE — every layout grid is 64 rows of 64 characters", () => {
  it("names every grid that is not exactly square, and how it is wrong", () => {
    const broken = LAYOUTS.filter((l) => l.exists).flatMap((l) => {
      const problem = shapeProblem(l.parse);
      return problem === null ? [] : [{ id: l.id, path: l.path, problem }];
    });
    const report =
      `${String(broken.length)} layout(s) do not hold a ${String(GRID_SIDE)}×${String(GRID_SIDE)} ` +
      "grid. The grid is the longest run of consecutive lines of exactly " +
      `${String(GRID_SIDE)} characters (NOT a split on \`---\` — see this file's header). Nothing ` +
      "downstream of a bad parse is trustworthy, including the encounter counts below:\n" +
      broken.map((b) => `  • ${b.id} (${b.path})\n      ${b.problem}`).join("\n");
    expect(broken.length === 0 || report).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. GATE — the closed character set
 * ════════════════════════════════════════════════════════════════════════════ */

describe("GATE — every grid character is a declared terrain character", () => {
  it("names every unknown character, with the cell it first appears in", () => {
    const offenders = LAYOUTS.filter((l) => l.exists).flatMap((l) => {
      const unknown = unknownChars(l.parse);
      return unknown.length === 0 ? [] : [{ id: l.id, path: l.path, unknown }];
    });
    const report =
      `${String(offenders.length)} layout(s) contain characters no legend row declares. A new ` +
      "terrain kind must be a deliberate edit to LAYOUT_ALPHABET in this file AND to " +
      "tools/mapgen/legend.ts — never a character that appears in a grid and is waved through, " +
      "because the composer would stamp nothing for it and the collision parse would read it as " +
      "open floor:\n" +
      offenders
        .map(
          (o) =>
            `  • ${o.id} (${o.path})\n` +
            o.unknown
              .map(
                (u) =>
                  `      ${JSON.stringify(u.char)} ×${String(u.count)}, first at grid ` +
                  `(col ${String(u.col)}, row ${String(u.row)}) = file line ${String(u.line)}`,
              )
              .join("\n"),
        )
        .join("\n");
    expect(offenders.length === 0 || report).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6. GATE — the biconditional, one direction per assertion
 *
 * Two assertions rather than one so a failure says WHICH WAY it broke. "The layout and the node file
 * disagree" sends a reader to two files with no idea which one is wrong; "cindershelf declares 6
 * lines and draws 0 encounter cells" names the repair.
 *
 * ⚠ NON-WALKABLE NODES ARE NOT EXEMPT, and that is deliberate. Eight of the twelve currently ship
 * `"walkable": false` — the vertical slice is Hearthollow → R1 → Brackwater → R2 — and exempting
 * them would switch this gate off for two thirds of the region while the art for it is being drawn,
 * which is exactly when a layout/population disagreement is cheapest to fix. The contract is between
 * the layout and the declaration; whether the player can currently walk there is a third fact.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Only nodes whose grid parsed cleanly — a bad shape is section 4's failure, not this one's. */
const MEASURABLE = LAYOUTS.filter((l) => l.exists && shapeProblem(l.parse) === null);

describe("GATE — the layout and the populations agree, in both directions", () => {
  /**
   * DIRECTION 1 — populations non-empty ⇒ at least one encounter cell.
   *
   * The direction that was red: `cindershelf` declared six lines (`ashvole`, `cragmar`, `pyrelisk`,
   * `stonewing`, `carricrow`, `kilnback`) over a grid with ZERO scrub cells. `pyrelisk-line` is a
   * STARTER line, so the defect reached further than one node's encounter table.
   */
  it("DIRECTION populations ⇒ encounters: a node that declares lines draws somewhere to meet them", () => {
    const starved = MEASURABLE.filter((l) => l.lines.length > 0 && encounterCells(l.parse) === 0);
    const report =
      `${String(starved.length)} node(s) declare populations and draw NO encounter terrain. Under ` +
      "G3 the declaration IS the encounter table, so every line below is a species the player can " +
      `never meet at that node. The repair is scrub ("${ENCOUNTER_CHAR}") in the layout, or the ` +
      "removal of the lines from the node file — the two must say the same thing:\n" +
      starved
        .map(
          (s) =>
            `  • ${s.id} — ${String(s.lines.length)} line(s) declared, 0 encounter cells in ` +
            `${String(walkableCells(s.parse))} walkable cells\n` +
            `      declared: ${s.lines.join(", ")}\n` +
            `      layout:   ${s.path} (grid at line ${String(s.parse.firstLine)})`,
        )
        .join("\n");
    expect(starved.length === 0 || report).toBe(true);
  });

  /**
   * DIRECTION 2 — zero encounter cells ⇒ populations empty.
   *
   * ⚠ BE HONEST ABOUT WHAT THIS IS: it is the CONTRAPOSITIVE of DIRECTION 1, not a second direction.
   * "populations non-empty ⇒ some scrub" and "no scrub ⇒ no populations" are the same proposition,
   * and the two filters below select the same violating set with the conjuncts swapped. An earlier
   * version of this comment claimed the pair was a biconditional; it was not, and the commit that
   * landed it repeated the claim. The genuinely independent direction is asserted separately below.
   *
   * It is kept anyway, and the reason is the failure message rather than the logic: this one reads
   * from the LAYOUT's side and names what the layout was claiming, which is the sentence an author
   * looking at a grid needs. Two readings of one fact is a reasonable thing to have. Two readings
   * of one fact described as two facts is not.
   */
  it("DIRECTION no encounters ⇒ no populations: a node with no scrub declares no lines", () => {
    const silent = MEASURABLE.filter((l) => encounterCells(l.parse) === 0 && l.lines.length > 0);
    const report =
      `${String(silent.length)} node(s) state "no wild encounters here" in their layout — zero ` +
      "scrub cells — while their node file still declares lines. A layout that draws no encounter " +
      "terrain is a claim, and the node file has to agree with it:\n" +
      silent
        .map((s) => `  • ${s.id} — 0 encounter cells, still declares: ${s.lines.join(", ")}`)
        .join("\n");
    expect(silent.length === 0 || report).toBe(true);
  });

  /**
   * DIRECTION 3 — encounter cells ⇒ populations non-empty. THE ONE THE OTHER TWO DO NOT COVER.
   *
   * Direction 1 and its contrapositive both catch "species with nowhere to meet them". Neither
   * catches the inverse: a node that PAINTS encounter terrain while declaring no species at all.
   * That is scrub a player can walk into forever and never meet anything in — the encounter roll
   * fires and the table it draws from is empty. Once the encounter mask derives from this file the
   * grass is a promise the layout makes to the player, and this is what keeps the node file good
   * for it.
   *
   * It is green on all twelve today because every shipped node declares at least one line — the
   * thinnest is sanctum-approach at one. That is exactly the condition under which an unasserted
   * direction goes unnoticed, which is why it is written down rather than left to the census.
   */
  it("DIRECTION encounters ⇒ populations: a node that draws scrub has something living in it", () => {
    const empty = MEASURABLE.filter((l) => encounterCells(l.parse) > 0 && l.lines.length === 0);
    const report =
      `${String(empty.length)} node(s) draw encounter terrain while their node file declares no ` +
      "lines at all. The grass is a promise the layout makes — a player walking into it rolls an " +
      "encounter against an empty table and meets nothing, forever:\n" +
      empty
        .map((s) => `  • ${s.id} — ${String(encounterCells(s.parse))} encounter cells, 0 declared lines`)
        .join("\n");
    expect(empty.length === 0 || report).toBe(true);
  });

  /**
   * The pair above is a biconditional only if BOTH sides can be non-trivial, so the census is
   * asserted to contain both kinds of node it is capable of judging — at least one node with
   * populations, and enough of them measured that the gate is not being carried by one file.
   */
  it("the biconditional is asserted over every node, not over a survivor set", () => {
    expect(MEASURABLE.length).toBe(LAYOUTS.length);
    expect(MEASURABLE.filter((l) => l.lines.length > 0).length).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 7. Sabotage — every assertion above proven to bind, on synthetic inputs
 *
 * The project's rule: a green suite that has not been broken once is not evidence. The four
 * mutations below are the four ways this gate could be silently worthless — a scope that skips a
 * missing file, a shape check that waves a short grid through, an alphabet that is not closed, and a
 * biconditional that does not notice grass being removed. They are run against synthetic text rather
 * than against the shipped files so that nothing under assets/ or data/ is ever mutated to test a
 * test.
 * ════════════════════════════════════════════════════════════════════════════ */

/** A minimal well-formed layout: a header (with a decoy line of grid width), a `---`, then a grid. */
function syntheticLayout(rowFor: (r: number) => string): string {
  return [
    "# a synthetic layout",
    "#" + "x".repeat(GRID_SIDE - 1), // the decoy: prose of exactly grid width, above the grid
    "---",
    ...Array.from({ length: GRID_SIDE }, (_, r) => rowFor(r)),
    "",
  ].join("\n");
}

const openGround = (): string => ".".repeat(GRID_SIDE);
const groundWithScrub = (): string => "," + ".".repeat(GRID_SIDE - 1);

describe("SABOTAGE — the gate is capable of failing", () => {
  it("BINDS — the parse ignores the decoy and finds the grid, not the header line", () => {
    const parse = findGrid(syntheticLayout(openGround));
    expect(shapeProblem(parse)).toBeNull();
    expect(parse.rows.length).toBe(GRID_SIDE);
    expect(parse.firstLine).toBe(4);
    // The decoy was seen and rejected on length, which is the thing a first-run parse gets wrong.
    expect(parse.runs.some((r) => r.firstLine === 2 && r.length === 1)).toBe(true);
  });

  /**
   * The shipped scope with one node's file pretended away — measured as a DELTA against whatever is
   * actually on disk rather than against "exactly one missing", so that a genuinely absent layout
   * reddens the gate in section 3 (where the message names it) instead of also firing here with an
   * arithmetic error that says nothing about the cause.
   */
  it("BINDS — a missing layout file is a failure, not a skipped node", () => {
    const victim = LAYOUTS.find((l) => l.exists);
    expect(victim, "no layout file is present at all — section 3 has the report").toBeDefined();
    const baseline = LAYOUTS.filter((l) => !l.exists).length;
    const pretended = LAYOUTS.map((l) => (l.id === victim?.id ? { ...l, exists: false } : l));
    const missing = pretended.filter((l) => !l.exists);
    expect(missing.length).toBe(baseline + 1);
    expect(missing.map((m) => m.id)).toContain(victim?.id);
    // …and the scope it was measured against is the NODE list, so removing a FILE cannot shorten it.
    expect(pretended.length).toBe(content.nodes.length);
  });

  it("BINDS — a 63-row grid fails the shape assertion, and says so in rows", () => {
    const short = [
      "# a synthetic layout",
      "---",
      ...Array.from({ length: GRID_SIDE - 1 }, openGround),
      "",
    ].join("\n");
    const parse = findGrid(short);
    expect(parse.rows.length).toBe(GRID_SIDE - 1);
    expect(shapeProblem(parse)).toContain(`is ${String(GRID_SIDE - 1)} rows`);
  });

  it("BINDS — a 63-CHARACTER row fails too, by splitting the run rather than by passing", () => {
    const narrow = findGrid(
      syntheticLayout((r) => (r === 10 ? ".".repeat(GRID_SIDE - 1) : openGround())),
    );
    // The run breaks at the narrow row, so the longest run is one of the two halves — never 64.
    expect(narrow.rows.length).toBeLessThan(GRID_SIDE);
    expect(shapeProblem(narrow)).toContain("rows, not");
  });

  it("BINDS — an unknown character fails, and is located", () => {
    const parse = findGrid(syntheticLayout((r) => (r === 7 ? "..Z" + ".".repeat(GRID_SIDE - 3) : openGround())));
    expect(shapeProblem(parse)).toBeNull(); // the shape is fine; only the alphabet is wrong
    const unknown = unknownChars(parse);
    expect(unknown.map((u) => u.char)).toEqual(["Z"]);
    expect(unknown[0]).toMatchObject({ col: 2, row: 7, count: 1 });
    // …and a grid drawn only from the alphabet produces nothing.
    expect(unknownChars(findGrid(syntheticLayout(openGround)))).toEqual([]);
  });

  it("BINDS — removing every scrub cell from a real shipped layout reddens DIRECTION 1", () => {
    /*
     * The sabotage that matters most, run against the SHIPPED text of a node that declares
     * populations rather than against a synthetic — a synthetic proves the predicate, this proves
     * the predicate over the real file format, header and all. The file itself is never touched:
     * the text is read, mutated in memory, and thrown away.
     */
    const victim = MEASURABLE.find((l) => l.lines.length > 0 && encounterCells(l.parse) > 0);
    expect(victim, "no shipped node both declares lines and draws scrub — the sabotage has no subject").toBeDefined();
    if (victim === undefined) return;

    const text = readFileSync(resolve(ROOT, victim.path), "utf8");
    const before = findGrid(text);
    expect(encounterCells(before)).toBeGreaterThan(0);

    // Replace scrub with open ground ONLY inside the grid, so the header's commas are untouched —
    // which also demonstrates that the header's commas were never being counted in the first place.
    const lines = text.split("\n");
    for (let i = before.firstLine - 1; i < before.firstLine - 1 + before.rows.length; i += 1) {
      lines[i] = (lines[i] as string).split(ENCOUNTER_CHAR).join(".");
    }
    const razed = findGrid(lines.join("\n"));

    expect(shapeProblem(razed), "razing the scrub must not change the SHAPE").toBeNull();
    expect(encounterCells(razed)).toBe(0);
    expect(unknownChars(razed)).toEqual([]);
    // DIRECTION 1 fires: lines declared, nowhere to meet them.
    expect(victim.lines.length > 0 && encounterCells(razed) === 0).toBe(true);
    // …and the whole-file comma count is still non-zero, which is the naive instrument still
    // reporting a pass over a map with no grass on it.
    expect(lines.join("\n").split(ENCOUNTER_CHAR).length - 1).toBeGreaterThan(0);
  });

  it("BINDS — declaring lines at a node with no scrub reddens DIRECTION 2 as well", () => {
    const parse = findGrid(syntheticLayout(openGround));
    expect(encounterCells(parse)).toBe(0);
    const pretend = { lines: ["gate-sabotage-line"], parse };
    expect(encounterCells(pretend.parse) === 0 && pretend.lines.length > 0).toBe(true);
    // …and the honest version of that node — no scrub, no lines — is silent in both directions.
    const empty = { lines: [] as string[], parse };
    expect(encounterCells(empty.parse) === 0 && empty.lines.length > 0).toBe(false);
    // …as is a node with scrub and lines.
    const healthy = findGrid(syntheticLayout(groundWithScrub));
    expect(encounterCells(healthy)).toBe(GRID_SIDE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 8. Advisory census — never fails, and exists so a reader can see the shape of
 *    the region without opening twelve files
 *
 * Advisory for the reason `tests/gates/asset-palette-contract.test.ts` gives for its own: a density
 * band is taste with a number painted on it, and a countable target is the thing that gets optimised
 * while the map gets worse. What is ASSERTED above is the biconditional, which is a fact. The share
 * is printed so that a node sitting far outside the band its neighbours occupy is VISIBLE — a
 * question for a human, never a failure here.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("advisory — encounter terrain per node", () => {
  it("prints the census", () => {
    const rows = LAYOUTS.map((l) => {
      if (!l.exists) return `  ${l.id.padEnd(18)} NO LAYOUT FILE (${l.path})`;
      const problem = shapeProblem(l.parse);
      if (problem !== null) return `  ${l.id.padEnd(18)} UNPARSEABLE — ${problem}`;
      const scrub = encounterCells(l.parse);
      const walk = walkableCells(l.parse);
      const share = walk === 0 ? "—" : `${((100 * scrub) / walk).toFixed(1)}%`;
      return (
        `  ${l.id.padEnd(18)} scrub ${String(scrub).padStart(4)}  walkable ${String(walk).padStart(4)}  ` +
        `${share.padStart(6)} of walkable   lines ${String(l.lines.length)}   grid@${String(l.parse.firstLine)}`
      );
    });
    console.log(
      [
        `layout encounter census — ${LAYOUT_DIR}/ against ${NODE_DIR}/`,
        "  scrub    = cells of the ENCOUNTER character inside the isolated grid (never the whole file)",
        "  walkable = cells whose character is not a legend `blocks: true` row",
        "  lines    = keys of populations{} in data/nodes/<id>.json",
        ...rows,
      ].join("\n"),
    );
    expect(rows.length).toBe(LAYOUTS.length);
  });
});
