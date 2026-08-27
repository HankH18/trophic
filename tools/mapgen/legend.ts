/**
 * tools/mapgen/legend.ts — what each character in a layout MEANS.
 *
 * A layout (`tools/mapgen/layouts/<id>.txt`) is one character per collision cell. This file is the
 * single place that says which characters block, which carry a point anchor, and what colour each
 * takes in the ControlNet conditioning image. Everything else in `tools/mapgen/` reads the legend;
 * nothing else restates it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO RULES THAT ARE NOT NEGOTIABLE, because the engine already decided them
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. `#` IS THE ONLY BLOCKED CHARACTER THE ENGINE KNOWS. `gridFromAscii` (game/collision.ts:770)
 *    sets a cell blocked iff its character is `#`; every other character parses as walkable floor.
 *    So a layout may spell its walls with several characters — `B` for a building, `W` for water,
 *    `T` for a treeline — but `tools/mapgen/layout.ts` NORMALISES every `blocks: true` character to
 *    `#` before handing the string to `gridFromAscii`. The extra characters exist for the control
 *    image and for region typing; they never reach the engine's parser as themselves.
 *
 * 2. AN ANCHOR CHARACTER MUST BE WALKABLE. The brief's whole reason for one string carrying both
 *    geometry and anchors is that "a second pass reads `D`/`@`/`C`-style chars as anchors while the
 *    collision parse sees floor". An anchor that blocked would be a prop baked into collision, which
 *    core/types.ts:135 forbids in as many words ("interaction radius, never baked into collision"),
 *    and it could strand the spawn. `assertLegendWellFormed` refuses a legend that breaks this.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGION KINDS ARE AN OPEN STRING, NOT AN ENUM
 * ─────────────────────────────────────────────────────────────────────────────
 * `kind` is `string` on purpose. Maps need `path-corridor` and `building-footprint`; interiors need
 * `counter`, `bench`, `stairwell`. One schema serves both only if adding a kind is adding a row to
 * a table rather than widening a union that six `switch` statements have to learn. `controlColourOf`
 * therefore has a deterministic hash fallback: a kind nobody has picked a colour for still renders,
 * flat and stable, instead of throwing or rendering as background.
 */

/** One character's meaning. `kind` is deliberately an open string — see the header. */
export interface LegendEntry {
  /** The single character as it appears in the layout body. */
  char: string;
  /** Open string. New kinds are new rows here, never a widened union. */
  kind: string;
  /** True ⇒ normalised to `#` before `gridFromAscii` sees it. */
  blocks: boolean;
  /** True ⇒ the second pass emits a point anchor at this cell. Implies `blocks: false`. */
  anchor: boolean;
  /** Flat RGB for the ControlNet conditioning image. */
  control: readonly [number, number, number];
  note: string;
}

/** The character `game/collision.ts` `gridFromAscii` treats as blocked. Not ours to choose. */
export const ENGINE_BLOCKED_CHAR = '#';

/** The character a normalised layout uses for every walkable cell. Any non-`#` char would do. */
export const ENGINE_FLOOR_CHAR = '.';

/**
 * The shipped legend.
 *
 * Colours are chosen for SEPARATION rather than for prettiness: a ControlNet conditioning image is
 * read as flat regions with hard edges, so two kinds that a sampler must tell apart must not be
 * near-neighbours in RGB. They are tool constants, not gameplay constants — nothing here reaches the
 * sim, the battle reducer or the save — which is why they sit in code and not in `data/balance.json`
 * (G11 governs gameplay numbers).
 */
export const DEFAULT_LEGEND: readonly LegendEntry[] = [
  /* ── floor ─────────────────────────────────────────────────────────────── */
  {
    char: '.',
    kind: 'open-ground',
    blocks: false,
    anchor: false,
    control: [120, 160, 96],
    note: 'plain walkable ground; the default fill',
  },
  {
    char: ',',
    kind: 'scrub',
    blocks: false,
    anchor: false,
    control: [96, 136, 72],
    note: 'walkable but textured — long grass, ferns, heather',
  },
  {
    char: ':',
    kind: 'path-corridor',
    blocks: false,
    anchor: false,
    control: [208, 184, 136],
    note: 'the worn track that joins the map edges through the middle',
  },
  {
    char: 'o',
    kind: 'centre-clearing',
    blocks: false,
    anchor: false,
    control: [168, 200, 128],
    note: 'the open region at native (512,512) the spawn search lands in',
  },
  {
    char: '~',
    kind: 'shallow',
    blocks: false,
    anchor: false,
    control: [120, 176, 200],
    note: 'walkable water margin — wadeable, not a wall',
  },

  /* ── walls (all normalised to `#` for the engine) ──────────────────────── */
  {
    char: '#',
    kind: 'wall',
    blocks: true,
    anchor: false,
    control: [48, 48, 56],
    note: 'generic impassable mass with no more specific kind',
  },
  {
    char: 'B',
    kind: 'building-footprint',
    blocks: true,
    anchor: false,
    control: [200, 80, 72],
    note: 'a building the player walks around, never through',
  },
  {
    char: 'T',
    kind: 'tree-mass',
    blocks: true,
    anchor: false,
    control: [32, 88, 56],
    note: 'trunks and thicket dense enough to stop a walk',
  },
  {
    char: 'W',
    kind: 'water',
    blocks: true,
    anchor: false,
    control: [40, 72, 152],
    note: 'open water — deep enough to block',
  },
  {
    char: 'R',
    kind: 'rock',
    blocks: true,
    anchor: false,
    control: [112, 104, 104],
    note: 'basalt, scree, standing stone, crater rim',
  },
  {
    char: 'F',
    kind: 'fence',
    blocks: true,
    anchor: false,
    control: [144, 112, 64],
    note: 'a thin built barrier — pen rail, jetty edge, ore-cart rail',
  },

  /* ── anchors (walkable by construction — see rule 2 in the header) ─────── */
  {
    char: '*',
    kind: 'prop-anchor',
    blocks: false,
    anchor: true,
    control: [240, 208, 64],
    note: "a data/nodes/*.json props[] entry, at floor(x/cellPx), floor(y/cellPx)",
  },
  {
    char: '@',
    kind: 'spawn-anchor',
    blocks: false,
    anchor: true,
    control: [240, 96, 200],
    note: 'documentary marker for the centre cell the spawn search starts from',
  },
  {
    char: '^',
    kind: 'edge-mouth',
    blocks: false,
    anchor: true,
    control: [248, 240, 224],
    note: 'the cell where a corridor meets the map edge; one per declared adjacency',
  },
  {
    char: 'D',
    kind: 'door-anchor',
    blocks: false,
    anchor: true,
    control: [240, 144, 48],
    note: 'the walkable cell a building is entered from',
  },
];

export class LegendError extends Error {}

/**
 * Refuse a legend that breaks either engine rule, or that spells one character two ways. Called by
 * every entry point, so a legend a human extends is checked before it can produce a layout.
 */
export function assertLegendWellFormed(entries: readonly LegendEntry[]): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.char.length !== 1) problems.push(`"${e.char}" is not a single character`);
    if (seen.has(e.char)) problems.push(`character "${e.char}" is declared twice`);
    seen.add(e.char);
    if (e.anchor && e.blocks) {
      problems.push(
        `"${e.char}" (${e.kind}) is both an anchor and a wall — an anchor must parse as floor, ` +
          `because game/collision.ts reads anchors as walkable and core/types.ts forbids baking a ` +
          `prop into collision`,
      );
    }
    if (e.blocks && e.char !== ENGINE_BLOCKED_CHAR && e.char === ENGINE_FLOOR_CHAR) {
      problems.push(`"${e.char}" blocks but is the floor character`);
    }
  }
  if (!seen.has(ENGINE_BLOCKED_CHAR)) problems.push(`the legend has no "${ENGINE_BLOCKED_CHAR}" row`);
  if (!seen.has(ENGINE_FLOOR_CHAR)) problems.push(`the legend has no "${ENGINE_FLOOR_CHAR}" row`);
  if (problems.length > 0) throw new LegendError(`tools/mapgen legend is malformed:\n  · ${problems.join('\n  · ')}`);
}

/** Char → entry, checked. */
export function legendIndex(entries: readonly LegendEntry[] = DEFAULT_LEGEND): Map<string, LegendEntry> {
  assertLegendWellFormed(entries);
  return new Map(entries.map((e) => [e.char, e]));
}

/** Kind → entry, first row wins. Two chars may share a kind; the colour comes from the first. */
export function kindIndex(entries: readonly LegendEntry[] = DEFAULT_LEGEND): Map<string, LegendEntry> {
  const out = new Map<string, LegendEntry>();
  for (const e of entries) if (!out.has(e.kind)) out.set(e.kind, e);
  return out;
}

/**
 * Flat colour for a kind. A kind the legend has never heard of — an interior's `stairwell`, say,
 * written by a later session — gets a stable colour from an FNV-1a hash of its name rather than a
 * throw. Deterministic, so the same unknown kind is the same colour on every run and in every image.
 */
export function controlColourOf(
  kind: string,
  entries: readonly LegendEntry[] = DEFAULT_LEGEND,
): readonly [number, number, number] {
  const known = kindIndex(entries).get(kind);
  if (known) return known.control;
  let h = 0x811c9dc5;
  for (let i = 0; i < kind.length; i += 1) {
    h ^= kind.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Kept off the extremes so an unknown kind never collides with pure black or pure white, which the
  // mask encoding uses for "blocked" and "walkable" and a reviewer reads as those.
  const band = (shift: number): number => 40 + (((h >>> shift) & 0xff) % 176);
  return [band(0), band(8), band(16)];
}

/** The legend as the lines that go in a layout file's header, so the artefact explains itself. */
export function legendHeaderLines(entries: readonly LegendEntry[] = DEFAULT_LEGEND): string[] {
  const width = Math.max(...entries.map((e) => e.kind.length));
  return entries.map((e) => {
    const role = e.blocks ? 'WALL ' : e.anchor ? 'ANCH ' : 'floor';
    return `  ${e.char}  ${role}  ${e.kind.padEnd(width)}  ${e.note}`;
  });
}
