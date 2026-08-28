/**
 * core/foodweb.ts — the derived food web, and the two derivations that hang off it.
 *
 * build-doc §8.3 (test `no_shadow_tables`): "no file other than `core/foodweb.ts` may compute diet
 * edges; no encounter-weight literal tables anywhere". THIS IS THAT FILE. Nothing else in the repo
 * may decide who eats whom.
 *
 * build-doc §7.3, from bible §5: "Edges derived per node, per bible §5: Apex eats {Mesopredator,
 * large Grazer} in habitat; Mesopredator eats Grazers; Grazers eat Producers + floraStock;
 * Scavengers eat nothing live; plus each species' `dietExceptions`; Ancients eat nothing (presence
 * effects instead)."
 *
 * build-doc §7.2 "Derivations (never stored)": "encounter weight of species s = populations[s].count
 * (0 count = 0 encounters — the cascade is visible for free), filtered by `seasonalWindow`,
 * Scavenger weight × (1 + recentDeaths/10). Bait lookup: bait matches target if bait's tag ∈
 * target's derived diet (7.3)." Both live here, because both are derivations off the same node JSON
 * — putting either anywhere else would be the second table G3 forbids.
 *
 * Pure TypeScript, zero engine imports (L11). Every number comes from `balance` (G11).
 */

import type {
  AgeClass,
  BaitMatch,
  Balance,
  EncounterMask,
  EncounterWeight,
  FoodWeb,
  HabitatSentinel,
  NodeFile,
  NodePopulation,
  Role,
  Season,
  SpeciesLine,
  TypeName,
} from "./types";
import { ROLES } from "./types";
import type { Rng } from "./rng";

/* ────────────────────────────────────────────────────────────────────────────
 * The live node the sim and the derivations read
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A node as the ecology sees it: the shipped `NodeFile` fields the web needs, plus the §7.3 step-5
 * `recentDeaths` accumulator that the save carries in `NodeState`.
 *
 * Typed as a widening of `NodeFile` on purpose — build-doc §7.2 "Sim initial state = the file as
 * shipped", so a `NodeFile` IS an `EcoNode` with `recentDeaths` defaulting to 0.
 */
export interface EcoNode {
  id: string;
  biome: string;
  adjacency: string[];
  floraStock: number;
  populations: Record<string, NodePopulation>;
  recentDeaths?: number;
}

/** build-doc §7.2 — the shipped file is the year-1 sim state; this is the only conversion needed. */
export function toEcoNode(file: NodeFile, recentDeaths = 0): EcoNode {
  return {
    id: file.id,
    biome: file.biome,
    adjacency: [...file.adjacency],
    floraStock: file.floraStock,
    populations: clonePopulations(file.populations),
    recentDeaths,
  };
}

/**
 * A population map's ids sorted alphabetically — the SERIALISATION order, matching what
 * `core/save.ts` writes, so a node that has been through the sim is byte-stable however it was
 * built. Iteration order for the arithmetic is {@link orderedLineIds}, which is a different and
 * stronger requirement.
 */
export function lineIdsOf(pops: Record<string, NodePopulation>): string[] {
  return Object.keys(pops).sort();
}

/**
 * Deep copy of a population map — the sim never mutates its input. Emitted in sorted key order (see
 * {@link lineIdsOf}), so a node that has been through one step serialises identically however it was
 * built.
 */
export function clonePopulations(pops: Record<string, NodePopulation>): Record<string, NodePopulation> {
  const out: Record<string, NodePopulation> = {};
  for (const id of lineIdsOf(pops)) {
    const p = pops[id];
    if (!p) continue;
    out[id] = { count: p.count, breedRate: p.breedRate, carryCap: p.carryCap };
  }
  return out;
}

/** Deep copy of a node (populations included). */
export function cloneEcoNode(node: EcoNode): EcoNode {
  return {
    id: node.id,
    biome: node.biome,
    adjacency: [...node.adjacency],
    floraStock: node.floraStock,
    populations: clonePopulations(node.populations),
    recentDeaths: node.recentDeaths ?? 0,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Species lookup
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SpeciesIndex {
  byId: Map<string, SpeciesLine>;
  all: SpeciesLine[];
  /** Position of each line in `data/species.json` — see {@link orderedLineIds}. */
  order: Map<string, number>;
}

export function indexSpecies(species: SpeciesLine[]): SpeciesIndex {
  const byId = new Map<string, SpeciesLine>();
  const order = new Map<string, number>();
  species.forEach((line, i) => {
    byId.set(line.id, line);
    order.set(line.id, i);
  });
  return { byId, all: species, order };
}

/**
 * The node's line ids in the ONE order the ecology iterates them in: the order they appear in
 * `data/species.json`.
 *
 * Two things force a canonical order. (1) `Object.keys` hands back INSERTION order, and the shipped
 * node JSON, a save written by `core/save.ts` (which sorts every key at every depth), and a
 * hand-built fixture all differ in it — so anything consuming entropy per line (§7.3 step 4's
 * stochastic rounding) would bind each species to a position in the RNG stream and save → load →
 * continue would diverge from an uninterrupted run of the same action log. That breaks L10 / §8.1.
 * (2) The order must not be derivable from the NAMES either, or the sim's arithmetic depends on what
 * things are called, and "nothing in here knows which species it is" (G6) stops being checkable by
 * relabelling the content and re-running it.
 *
 * The content file's own order satisfies both. Lines absent from the index (never a shipped state)
 * sort last, alphabetically, so the function is total.
 */
export function orderedLineIds(pops: Record<string, NodePopulation>, idx: SpeciesIndex): string[] {
  return Object.keys(pops).sort((a, b) => {
    const ia = idx.order.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = idx.order.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ia === ib ? a.localeCompare(b) : ia - ib;
  });
}

/**
 * bible §5 — "the population sim tracks the line as one age-structured species", while
 * `NodeFile.populations` carries ONE count per line. Which age class's role/type the web reads is
 * therefore a tunable, not a code decision: `balance.ecosim.webRoleAgeClass` (shipped: "A", the
 * adult — so the Mirefin line is a Mesopredator in the web even though its juveniles graze).
 *
 * build-doc §7.1's `role` is per-age and bible §4 designs a mid-life role shift, but the inlined
 * §7.2 `populations` schema carries one scalar count per line with no age breakdown, so exactly one
 * of the two roles can drive the web. This is that choice, made as data rather than in code.
 */
export function webAgeClass(balance: Balance): AgeClass {
  return balance.ecosim.webRoleAgeClass;
}

export function webRole(line: SpeciesLine, balance: Balance): Role {
  return line.role[webAgeClass(balance)];
}

export function webTypes(line: SpeciesLine, balance: Balance): TypeName[] {
  return line.types[webAgeClass(balance)];
}

/** build-doc §7.1 — `habitat`: node biome tags; "roaming" = all. */
const ROAMING: HabitatSentinel = "roaming";

export function inhabits(line: SpeciesLine, biome: string): boolean {
  return line.habitat.includes(biome) || line.habitat.includes(ROAMING);
}

/** bible §4 — exactly one line is marked "Grazer (large)"; §5 lets an Apex take those. */
export function isLargeGrazer(line: SpeciesLine, balance: Balance): boolean {
  return webRole(line, balance) === "Grazer" && line.sizeClass === "large";
}

/**
 * build-doc §10.2's release clause names ONE tier — "**mesopredator** count strictly rising within
 * 4 seasons" — so anything measuring that clause has to ask which lines are mesopredators.
 *
 * It lives here rather than at the call site because §8.3 gives role names one home, and
 * `tests/property/foodweb.test.ts::"the role→role diet lives in core/foodweb.ts and nowhere else"`
 * enforces that: a role name written as a literal in `tools/` or `game/` is a second role table by
 * construction. This adds no rule — it is `webRole` with the §10.2 tier named once.
 */
export function isMesopredator(line: SpeciesLine, balance: Balance): boolean {
  return webRole(line, balance) === "Mesopredator";
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.3 — the derivation. The ONLY diet-edge computation in the repo (§8.3, G3).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The chance that ONE walked step meets something WHEN NOBODY KNOWS WHERE THE PLAYER IS STANDING.
 *
 * ⚠ THIS IS NO LONGER THE GATE THE GAME ROLLS. It was, and the note is worth keeping because the
 * shape of the old defect is the argument for the new shape: `encounterTileFraction` was a scalar
 * stand-in for a mask nobody had, so this product was applied to EVERY walked cell of every node —
 * a step on a road, in a town square, or on a building's doorstep met wild animals at exactly the
 * rate of a step in tall grass. Where the player is standing is now a fact, not a probability:
 * {@link cellRollsEncounters} reads it off the node's {@link EncounterMask}, and a positioned step
 * rolls at `encounterChancePerStep` on encounter terrain and at nothing anywhere else.
 *
 * What survives here is the POSITION-BLIND expectation, for the two callers that genuinely have no
 * cell to read: the year's encounter budget (`tests/unit/transcription.test.ts`), which asks what a
 * whole year of foraying is worth, and `tools/harness/full-run.ts`, which walks a headless region.
 * For them the honest rate is (share of encounter terrain) × `encounterChancePerStep`, and
 * `encounter.encounterTileFraction` is that share as one number — measured against the twelve
 * committed layouts and pinned to the route band by `tests/unit/encounter-mask.test.ts`, so it
 * cannot drift away from the maps and become a second opinion about where the grass is (G3).
 *
 * It lives in core/ rather than in game/ because BOTH the game and the balance harness need it and
 * they must not each own a copy. `tools/harness/full-run.ts` rolled the raw `encounterChancePerStep`
 * while the overworld rolled the gated product, which would have made every published encounter,
 * catch and extinction figure describe a region four times denser than the one the player walks —
 * an instrument measuring a different game. One function, both callers.
 */
export function stepEncounterChance(balance: Balance): number {
  return balance.encounter.encounterTileFraction * balance.encounter.encounterChancePerStep;
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.2 Derivation 3 — the encounter MASK. It says WHERE; the node file says WHAT.
 *
 * G3 IS THE CONSTRAINT THAT SHAPES EVERY LINE BELOW. There is no second encounter table here and
 * there cannot be one: nothing in this section knows a species id, a role, a weight or a count. A
 * mask can silence a cell. It can never change WHICH animal a cell hands over, nor conjure one the
 * node's `populations` do not declare — that answer stays {@link encounterWeights}'s alone, derived
 * from `data/nodes/<id>.json`, which remains the single source of truth for what lives at a node.
 *
 * THE MASK IS DERIVED, NEVER AUTHORED. Its source is `tools/mapgen/layouts/<id>.txt` — the same
 * hand-authored 64×64 ASCII grid the art lane composes the painted map from — so the grass the
 * player SEES and the grass that ROLLS are the same grass by construction, with no second file to
 * keep in step and nothing to sample out of a painting.
 *
 * WHY core/ PARSES THE LAYOUT BUT DOES NOT READ IT. `tests/gates/guardrails.test.ts`
 * `no_phaser_in_core` holds core/'s whole import closure to `data/` and zod, so this file may not
 * reach `tools/` for the layout text OR for the legend's blocking characters, and L11 forbids it
 * doing filesystem work at an engine's behest. Both therefore arrive as ARGUMENTS: `game/
 * encounters.ts` holds the twelve layouts (static imports, exactly as `core/schemas.ts` holds the
 * twelve node JSONs) and hands the text and the blocking set in. The derivation is pure.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One maximal run of consecutive lines that are each exactly the grid's width. */
export interface LayoutRun {
  /** 1-based line number of the run's first line, so a complaint names a line a human can open. */
  firstLine: number;
  length: number;
}

/** What {@link findLayoutGrid} could make of a layout file. */
export interface LayoutGridParse {
  /** The grid rows, verbatim. Empty when the file holds no run at all. */
  rows: string[];
  /** 1-based line the grid starts on, or 0 when there is no run. */
  firstLine: number;
  /** Every maximal run in the file, longest first — reported so a bad parse is legible. */
  runs: LayoutRun[];
  /** Two or more runs tie for longest: the file is ambiguous and must not be guessed at. */
  ambiguous: boolean;
}

/**
 * Isolate a layout's grid: THE LONGEST RUN OF CONSECUTIVE LINES THAT ARE EACH EXACTLY `lineWidth`
 * CHARACTERS.
 *
 * ⚠ A LAYOUT `.txt` IS NOT A BARE GRID, and every cheaper rule gets a different answer:
 *
 *   • Counting the encounter character over the WHOLE FILE is wrong by roughly double. The files
 *     open with a long prose header — the coordinate space, the seed data, the author's decisions
 *     and a legend — and all of it is full of commas; the legend contains the literal line
 *     `#   ,  floor  scrub`. Measured on the committed tree: cindershelf's file holds 255 commas and
 *     its grid holds 180.
 *   • Splitting on the `---` separator every shipped layout carries is the fragile one. A separator
 *     split takes the FIRST `---`, so the day a header contains one — a rule under a heading, an
 *     em-dash run in prose, a quoted diff — the "grid" silently starts in the middle of the prose.
 *   • Taking the FIRST run of full-width lines is wrong TODAY, not hypothetically: three of the
 *     twelve (`cindershelf`, `duskhollow`, `r2`) carry a prose line of exactly grid width ABOVE the
 *     grid, so a first-run rule parses a one-line comment as the map.
 *
 * A TIE IS A FAILURE, never a coin-flip: {@link LayoutGridParse.ambiguous} is set and the caller
 * must refuse. Picking either run would be a parse that looks confident and is guessing.
 *
 * This function does NOT enforce the shape — it returns whatever the longest run is, however short,
 * so a malformed file is reported as "63 lines" by its caller rather than silently parsing to
 * something with no encounter cells. `tests/gates/layout-encounter-contract.test.ts` calls this same
 * function, so the gate that measures the layouts and the game that plays them cannot come to
 * different conclusions about where a grid starts.
 */
export function findLayoutGrid(text: string, lineWidth: number): LayoutGridParse {
  const lines = text.split("\n");
  const runs: LayoutRun[] = [];
  let start = -1;
  for (let i = 0; i <= lines.length; i += 1) {
    const isGridWidth = i < lines.length && (lines[i] as string).length === lineWidth;
    if (isGridWidth) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      runs.push({ firstLine: start + 1, length: i - start });
      start = -1;
    }
  }
  runs.sort((a, b) => b.length - a.length || a.firstLine - b.firstLine);
  const best = runs[0];
  if (best === undefined) return { rows: [], firstLine: 0, runs, ambiguous: false };
  const ambiguous = runs.length > 1 && (runs[1] as LayoutRun).length === best.length;
  return {
    rows: lines.slice(best.firstLine - 1, best.firstLine - 1 + best.length),
    firstLine: best.firstLine,
    runs,
    ambiguous,
  };
}

/** A layout that cannot be read as a grid. Loud on purpose — see {@link encounterMaskFromLayout}. */
export class EncounterMaskError extends Error {}

/**
 * Derive one node's encounter mask from its layout.
 *
 * `blockingChars` is the art lane's answer to "which characters can the player not stand on"
 * (`tools/mapgen/legend.ts` `blocks`), passed in because core/ may not import it — see this
 * section's header. It affects only {@link EncounterMask.walkableCells}, the denominator of the
 * node's encounter-terrain share; whether a CELL rolls is decided by the encounter character alone,
 * and that character is `balance.encounter.encounterTerrainChar` rather than a literal here (G11).
 *
 * ⚠ IT THROWS ON A MALFORMED LAYOUT RATHER THAN RETURNING AN EMPTY MASK. The two failures a bad
 * parse can produce are a mask with no cells set and a mask with the wrong cells set, and the first
 * is indistinguishable from a node that honestly draws no grass. A game that quietly stops producing
 * encounters is the worst available outcome, so a layout that is not exactly
 * `balance.map.collisionCols × collisionRows` is a loud failure at the moment it is read.
 * `tests/gates/layout-encounter-contract.test.ts` holds all twelve to that shape, so on the shipped
 * tree this cannot fire.
 */
export function encounterMaskFromLayout(
  nodeId: string,
  layoutText: string,
  balance: Balance,
  blockingChars: ReadonlySet<string>,
): EncounterMask {
  const cols = balance.map.collisionCols;
  const rows = balance.map.collisionRows;
  const parse = findLayoutGrid(layoutText, cols);

  if (parse.ambiguous) {
    throw new EncounterMaskError(
      `${nodeId}: the layout holds two runs of ${String(parse.runs[0]?.length ?? 0)} lines of exactly ` +
        `${String(cols)} characters, so which one is the map is a guess. The parse refuses to make it.`,
    );
  }
  if (parse.rows.length !== rows) {
    throw new EncounterMaskError(
      `${nodeId}: the layout's longest run of ${String(cols)}-character lines is ` +
        `${String(parse.rows.length)} rows, not ${String(rows)}` +
        (parse.firstLine > 0 ? ` (it starts at line ${String(parse.firstLine)})` : "") +
        `. An encounter mask derived from a bad parse would silence the node instead of saying so.`,
    );
  }

  const terrain = balance.encounter.encounterTerrainChar;
  const cells: boolean[] = [];
  let encounterCells = 0;
  let walkableCells = 0;
  for (let row = 0; row < rows; row += 1) {
    const line = parse.rows[row] as string;
    for (let col = 0; col < cols; col += 1) {
      const ch = line[col] as string;
      const isTerrain = ch === terrain;
      cells.push(isTerrain);
      if (isTerrain) encounterCells += 1;
      if (!blockingChars.has(ch)) walkableCells += 1;
    }
  }
  return { nodeId, cols, rows, cells, encounterCells, walkableCells };
}

/**
 * Can a step completed on this cell roll an encounter?
 *
 * TOTAL BY DESIGN: a cell outside the grid reads `false` rather than throwing or wrapping. An
 * out-of-bounds cell is not a place the player can be standing, and the honest answer for a place
 * nobody is standing is "no animals here" — never an exception thrown out of a movement step, and
 * never a wrap that would make the north edge of the map roll the south edge's grass.
 */
export function cellRollsEncounters(mask: EncounterMask, col: number, row: number): boolean {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || row < 0 || col >= mask.cols || row >= mask.rows) return false;
  return mask.cells[row * mask.cols + col] === true;
}

/**
 * The node's own encounter-terrain share: encounter cells over cells the player can stand on.
 *
 * This is the per-node number `encounter.encounterTileFraction` is a single region-wide stand-in
 * for, and it is what a position-blind caller SHOULD use once it knows which node it is walking.
 * Zero for a node that draws no encounter terrain, and zero — rather than a division by nothing —
 * for the degenerate mask with nowhere to stand at all.
 */
export function encounterCellShare(mask: EncounterMask): number {
  if (mask.walkableCells <= 0) return 0;
  return mask.encounterCells / mask.walkableCells;
}

/**
 * Which roles a role eats, per bible §5. Data, not branching: a role missing from this map eats
 * nothing live (Producer photosynthesises, Scavenger "eats nothing live", AncientApex "eats
 * nothing — presence effects instead"). No species id appears anywhere in this file (G6).
 *
 * ⚠ THIS TABLE IS WHY MESOPREDATOR RELEASE CANNOT BE GUARANTEED, and the reason lives here rather
 * than only in the spec because this is the line that causes it.
 *
 * `Apex: ["Mesopredator", …]` means every apex's diet contains its own mesopredator. At most nodes
 * — and at r4, the shipped cascade node, exclusively — the mesopredator IS the apex's limiting prey
 * pool. So the animal you must crash to starve the apex is the same animal that a textbook
 * mesopredator release would set free. Crash it hard enough to kill the apex and it is itself too
 * far down to rebound inside the window; leave it high enough to rebound and the apex does not
 * starve. The two halves of the classic story are in direct competition through this one edge.
 *
 * Measured: release accompanies the apex collapse in 12.5% of real-play runs and 0–13% across a
 * 128-seed sweep. build-doc §10.2 was amended to assert the apex collapse and merely REPORT the
 * release, because Hank ruled the sim stays as it is — *"letting the biomes gain a mind of their own
 * and not forcing any particular outcomes"*. Both outcomes are correct outputs of the same web.
 *
 * Do not "fix" this by giving apexes a second prey pool, by tuning `balance.json`, by filtering the
 * report, or by selecting seeds where release happens. The first two change a diet and break G2;
 * the last two script the beat and break G6. If the release rate is ever to rise, it is a content
 * ruling from Hank about diets, not a correction anyone makes here.
 */
const ROLE_DIET: Readonly<Record<Role, readonly Role[]>> = {
  Producer: [],
  Grazer: ["Producer"],
  Mesopredator: ["Grazer"],
  Apex: ["Mesopredator", "Grazer"], // Grazers only when large — see largeGrazerOnly below
  Scavenger: [],
  AncientApex: [],
};

/** bible §5 — "Apex eats Mesopredators and **large** Grazers"; the Mesopredator has no such limit. */
const LARGE_GRAZER_ONLY: Readonly<Record<Role, boolean>> = {
  Producer: false,
  Grazer: false,
  Mesopredator: false,
  Apex: true,
  Scavenger: false,
  AncientApex: false,
};

/** bible §5 — "Grazers eat Producers (creature Producers + each node's abstract flora stock)". */
const FLORA_FEEDERS: Readonly<Record<Role, boolean>> = {
  Producer: false,
  Grazer: true,
  Mesopredator: false,
  Apex: false,
  Scavenger: false,
  AncientApex: false,
};

/**
 * The role tag(s) the node's abstract flora stock stands in for — derived from the same two tables,
 * never restated: whatever a flora-feeding role eats is what the flora pool is a pool OF (bible §5
 * "Grazers eat Producers (creature Producers + each node's abstract flora stock)").
 */
const FLORA_ROLE_TAGS: ReadonlySet<string> = new Set(
  ROLES.filter((role) => FLORA_FEEDERS[role]).flatMap((role) => [...ROLE_DIET[role]]),
);

/**
 * Derive the node's food web from roles + habitat + exceptions. Never stored (build-doc §7.2
 * "Derivations (never stored)"), never enumerated per-pair (bible §5 "rule-derived").
 *
 * A line participates only if it is PRESENT in this node's populations (the node JSON is the single
 * source of truth for who is here) AND its habitat admits the node's biome (bible §5 "in its
 * habitat"; "roaming" admits every biome). Lines with count 0 keep their structural edges — an
 * extinct predator still tells the survey what it used to eat — but contribute 0 prey units.
 */
export function deriveFoodWeb(node: EcoNode, idx: SpeciesIndex, balance: Balance): FoodWeb {
  const present: SpeciesLine[] = [];
  for (const id of orderedLineIds(node.populations, idx)) {
    const line = idx.byId.get(id);
    // bible §5's "in its habitat" clause. A line listed in a node's populations whose habitat tag
    // does not admit that node's biome takes no part in the web: it neither eats nor is eaten there.
    // tests/property/foodweb.test.ts::"the habitat clause is load-bearing" is what binds this line.
    if (line && inhabits(line, node.biome)) present.push(line);
  }

  const edges: Record<string, string[]> = {};
  const floraFeeders: string[] = [];

  for (const predator of present) {
    const role = webRole(predator, balance);
    const eats = ROLE_DIET[role];
    const prey: string[] = [];

    for (const candidate of present) {
      if (candidate.id === predator.id) continue; // no line eats itself
      const preyRole = webRole(candidate, balance);
      if (!eats.includes(preyRole)) continue;
      if (LARGE_GRAZER_ONLY[role] && preyRole === "Grazer" && !isLargeGrazer(candidate, balance)) continue;
      prey.push(candidate.id);
    }

    // bible §5 exceptions table — "Fenmaw also eats Reedrick". Additive, still habitat- and
    // presence-gated: an exception cannot conjure prey that is not at this node.
    for (const exceptionId of predator.dietExceptions ?? []) {
      if (exceptionId === predator.id) continue;
      if (!node.populations[exceptionId]) continue;
      const line = idx.byId.get(exceptionId);
      if (!line || !inhabits(line, node.biome)) continue;
      if (!prey.includes(exceptionId)) prey.push(exceptionId);
    }

    edges[predator.id] = prey;
    if (FLORA_FEEDERS[role]) floraFeeders.push(predator.id);
  }

  return { nodeId: node.id, edges, floraFeeders };
}

/** Prey line ids of one predator at this node (empty for Producers, Scavengers and Ancients). */
export function preyOf(web: FoodWeb, lineId: string): string[] {
  return web.edges[lineId] ?? [];
}

/** Every line at this node that eats `lineId` — what "release" is the removal of. */
export function predatorsOf(web: FoodWeb, lineId: string): string[] {
  const out: string[] = [];
  for (const predatorId of Object.keys(web.edges)) {
    if ((web.edges[predatorId] ?? []).includes(lineId)) out.push(predatorId);
  }
  return out;
}

/** True when this line grazes the node's abstract flora stock (bible §5). */
export function feedsOnFlora(web: FoodWeb, lineId: string): boolean {
  return web.floraFeeders.includes(lineId);
}

/** One prey pool of one predator, in prey units. */
export interface PreyPool {
  /** Line id, or null for the node's abstract flora stock. */
  lineId: string | null;
  units: number;
}

/**
 * The predator's prey pools, in prey units: one unit per prey individual, and
 * `balance.ecosim.floraPreyUnitsPerPoint` units per point of flora stock (build-doc §7.2 flora is
 * "abstract producer stock, 0–100" — the conversion is what puts it on the same scale as bodies).
 */
export function preyPools(node: EcoNode, web: FoodWeb, lineId: string, balance: Balance): PreyPool[] {
  const pools: PreyPool[] = [];
  for (const preyId of preyOf(web, lineId)) {
    pools.push({ lineId: preyId, units: node.populations[preyId]?.count ?? 0 });
  }
  if (feedsOnFlora(web, lineId)) {
    pools.push({ lineId: null, units: node.floraStock * balance.ecosim.floraPreyUnitsPerPoint });
  }
  return pools;
}

/** Total prey units available to one line — the numerator of §7.3 step 1's foodFactor. */
export function availablePrey(node: EcoNode, web: FoodWeb, lineId: string, balance: Balance): number {
  let total = 0;
  for (const pool of preyPools(node, web, lineId, balance)) total += pool.units;
  return total;
}

/**
 * §7.3 step 1/2 denominator: `demand[s] = count[s] × demandPerIndividual[role of s]`.
 * A role whose figure is 0 has no live diet at all and never starves (balance.json `_demand`).
 */
export function demandOf(node: EcoNode, idx: SpeciesIndex, lineId: string, balance: Balance): number {
  const line = idx.byId.get(lineId);
  const pop = node.populations[lineId];
  if (!line || !pop) return 0;
  return pop.count * balance.ecosim.demandPerIndividual[webRole(line, balance)];
}

/** True when this line has a live diet at all (Producers/Scavengers/Ancients do not). */
export function hasLiveDiet(idx: SpeciesIndex, lineId: string, balance: Balance): boolean {
  const line = idx.byId.get(lineId);
  if (!line) return false;
  return balance.ecosim.demandPerIndividual[webRole(line, balance)] > 0;
}

/** availablePrey / demand — null when the line has no live diet (nothing to divide). */
export function foodRatio(
  node: EcoNode,
  web: FoodWeb,
  idx: SpeciesIndex,
  lineId: string,
  balance: Balance,
): number | null {
  if (!hasLiveDiet(idx, lineId, balance)) return null;
  const demand = demandOf(node, idx, lineId, balance);
  if (demand <= 0) return null;
  return availablePrey(node, web, lineId, balance) / demand;
}

/**
 * The predator's PRIMARY prey: the pool it draws the most of its food from right now.
 *
 * Derived, never declared — as populations move, so does the answer, which is the whole point:
 * "primary prey" is a fact about the current state, not a label on a species. Flora never counts as
 * a primary prey line (it is not catchable, so a player cannot over-catch it).
 */
export function primaryPrey(node: EcoNode, web: FoodWeb, lineId: string, balance: Balance): string | null {
  let best: string | null = null;
  let bestUnits = -1;
  for (const pool of preyPools(node, web, lineId, balance)) {
    if (pool.lineId === null) continue;
    // Ties broken alphabetically — the SAME rule {@link limitingPrey} sorts by, so the two can never
    // disagree about which pool is the biggest (two pools of equal size is the common case at
    // shipped counts, and "primary prey" must be one answer, not two).
    const better = pool.units > bestUnits || (pool.units === bestUnits && best !== null && pool.lineId < best);
    if (better) {
      best = pool.lineId;
      bestUnits = pool.units;
    }
  }
  return best;
}

/**
 * The prey the predator actually DEPENDS on: prey lines taken in descending abundance until
 * removing them would drop the predator under `balance.ecosim.starveThreshold`.
 *
 * build-doc §10.2 says "forcing **its primary prey**", singular, and that is
 * {@link primaryPrey}. Read literally the §10.2 property is FALSE on the shipped content
 * wherever the apex can substitute one pool for another (measured per node by
 * tests/property/ecosim.test.ts, which asserts BOTH readings and publishes which nodes fall in which
 * class). `limitingPrey` is the set reading: the minimal set of catchable pools whose loss starves
 * the predator — equal to `[primaryPrey]` exactly when the predator is a specialist. Nothing about
 * the cascade is enumerated (G6); this is computed from the same web every other reader uses.
 */
export function limitingPrey(
  node: EcoNode,
  web: FoodWeb,
  idx: SpeciesIndex,
  lineId: string,
  balance: Balance,
  forcedFraction: number,
): string[] {
  if (!hasLiveDiet(idx, lineId, balance)) return [];
  const demand = demandOf(node, idx, lineId, balance);
  if (demand <= 0) return [];

  const pools = preyPools(node, web, lineId, balance)
    .filter((p): p is PreyPool & { lineId: string } => p.lineId !== null)
    .sort((a, b) => (b.units === a.units ? a.lineId.localeCompare(b.lineId) : b.units - a.units));

  const taken: string[] = [];
  let remaining = availablePrey(node, web, lineId, balance);
  for (const pool of pools) {
    if (remaining / demand < balance.ecosim.starveThreshold) return taken;
    // Over-catching a pool to `forcedFraction` leaves that fraction behind, not nothing.
    remaining -= pool.units * (1 - forcedFraction);
    taken.push(pool.lineId);
  }
  // Every catchable pool over-caught and the predator still eats: nothing here is limiting. A
  // flora-grazing line is the usual case — you cannot over-catch a meadow.
  return remaining / demand < balance.ecosim.starveThreshold ? taken : [];
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.2 Derivation 1 — encounter weights (never a table: G3)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface EncounterOptions {
  /** Current season — migrants outside their window drop out (Hard Req 10). */
  season: Season;
  /**
   * Sign-chains the player has completed. A line whose habitat carries
   * `balance.encounter.signChainGatedHabitatTag` stays out of the ordinary pool until its chain is
   * unlocked (bible §4: the Ancients are "gated behind rare sign-card chains").
   */
  unlockedSignChains?: ReadonlySet<string>;
}

/**
 * bible §5 legibility requirement: "dex entries and sign cards flag migrants as 'dormant' or
 * 'migrating' out of season, so seasonal absence is never confusable with a population crash."
 *
 * The two words are earned, not arbitrary: on the shoulders of its window (the season either side
 * of it) the animal is on the move — "migrating"; deeper out of season it is "dormant". Derived
 * from `balance.clock.seasonOrder`, so it stays true if the order is retuned.
 */
export function migrantStatus(
  line: SpeciesLine,
  season: Season,
  balance: Balance,
): { active: boolean; dormantReason?: "dormant" | "migrating" } {
  const window = line.seasonalWindow;
  if (!window) return { active: true };
  if (window === season) return { active: true };

  const order = balance.clock.seasonOrder;
  const here = order.indexOf(season);
  const there = order.indexOf(window);
  if (here < 0 || there < 0) return { active: false, dormantReason: "dormant" };

  const n = order.length;
  const forward = (there - here + n) % n;
  const distance = Math.min(forward, n - forward);
  return { active: false, dormantReason: distance === 1 ? "migrating" : "dormant" };
}

/**
 * build-doc §7.2 — "encounter weight of species s = `populations[s].count` (0 count = 0 encounters
 * — the cascade is visible for free), filtered by `seasonalWindow`, Scavenger weight ×
 * (1 + recentDeaths/10)."
 *
 * Every entry is returned, including the zero-weighted ones: the dex and the sign cards need to say
 * WHY something is absent (migrating vs wiped out), and that answer must come from the same call
 * the encounter roll uses, or the two can disagree.
 */
export function encounterWeights(
  node: EcoNode,
  idx: SpeciesIndex,
  balance: Balance,
  opts: EncounterOptions,
): EncounterWeight[] {
  const gatedTag = balance.encounter.signChainGatedHabitatTag;
  const unlocked = opts.unlockedSignChains;
  const recentDeaths = node.recentDeaths ?? 0;
  const out: EncounterWeight[] = [];

  for (const lineId of orderedLineIds(node.populations, idx)) {
    const pop = node.populations[lineId];
    const line = idx.byId.get(lineId);
    if (!pop || !line) continue;

    // A THIRD filter beyond build-doc §7.2's two (seasonalWindow, Scavenger × recentDeaths):
    // bible §4's "gated behind rare sign-card chains". Without it the finale
    // legendary derives as an ordinary wild encounter, because §7.2's weight IS the live count and
    // the Ancients sit in `populations` (the single source of truth, G3). The tag is data
    // (`balance.encounter.signChainGatedHabitatTag`), never a literal here.
    const gated = line.habitat.includes(gatedTag) && !(unlocked?.has(lineId) ?? false);
    const status = migrantStatus(line, opts.season, balance);

    if (gated) {
      out.push({ lineId, weight: 0, active: false });
      continue;
    }
    if (!status.active) {
      const entry: EncounterWeight = {
        lineId,
        weight: balance.encounter.outOfSeasonWeight,
        active: false,
      };
      if (status.dormantReason) entry.dormantReason = status.dormantReason;
      out.push(entry);
      continue;
    }

    let weight = pop.count;
    if (webRole(line, balance) === "Scavenger") {
      // bible §4/§5 — "carrion crow — spawn weight rises where webs crash".
      weight *= 1 + recentDeaths / balance.encounter.scavengerRecentDeathsDivisor;
    }
    out.push({ lineId, weight, active: weight > 0 });
  }

  return out;
}

/**
 * Roll one encounter off the derived weights. Returns null when nothing is available — an emptied
 * node genuinely produces no encounters rather than falling back to a table (G3).
 */
export function rollEncounter(weights: readonly EncounterWeight[], rng: Rng): string | null {
  const picked = rng.pickWeighted(weights, (w) => (w.active ? w.weight : 0));
  return picked ? picked.lineId : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * §7.2 Derivation 2 — bait match (never a table: G3)
 * ──────────────────────────────────────────────────────────────────────────── */

const ROLE_TAGS: ReadonlySet<string> = new Set(ROLES);

/**
 * build-doc §7.2 — "Bait lookup: bait matches target if bait's tag ∈ target's derived diet (7.3)."
 *
 * A bait tag is either a species line id (bible §11's species-specific bait) or a role name (its
 * role-generic bait). The answer feeds `balance.catch.baitMult` — `"species"` 2.0, `"role"` 1.5,
 * `"none"` 1.0 — so the strength of a bait is a fact about the web, not a lookup table.
 */
export function baitMatchFor(
  baitTag: string | undefined,
  targetLineId: string,
  node: EcoNode,
  idx: SpeciesIndex,
  balance: Balance,
  web?: FoodWeb,
): BaitMatch {
  if (!baitTag) return "none";
  const resolved = web ?? deriveFoodWeb(node, idx, balance);
  const diet = preyOf(resolved, targetLineId);

  if (diet.includes(baitTag)) return "species";

  if (ROLE_TAGS.has(baitTag)) {
    for (const preyId of diet) {
      const prey = idx.byId.get(preyId);
      if (prey && webRole(prey, balance) === baitTag) return "role";
    }
    // An extension of build-doc §7.2's "bait's tag ∈ target's derived diet":
    // bible §5 gives Grazers TWO food sources ("creature Producers + each node's abstract flora
    // stock"), and at a node with no creature Producer (bible §4 leaves Steppe and Vale without
    // one) the derived diet is empty, so the cheap role-generic Producer bait would
    // match nothing at exactly the nodes where a Grazer is the only thing to bait. The flora pool is
    // a Producer pool; this says so.
    if (feedsOnFlora(resolved, targetLineId) && FLORA_ROLE_TAGS.has(baitTag)) return "role";
  }

  return "none";
}
