/**
 * tools/mapgen/layout.ts — the layout artefact: its coordinate space, its parser, its two passes.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE COORDINATE SPACE, DERIVED — every number below comes from `balance.map`
 * ═════════════════════════════════════════════════════════════════════════════
 *
 *   mapNativePx     1024   the painted map's own pixel size
 *   collisionCellPx   16   build-doc §7.6's sampling step
 *   collisionCols/Rows 64   1024 / 16 = 64, and the file agrees
 *   mapRenderScale     2   1024 native × 2 = 2048 world px on screen
 *   tileStepPx        32   2048 / 32 = 64 movement tiles across
 *
 * So a layout is **64 characters wide by 64 lines tall**, one character per collision cell, and the
 * three lattices coincide exactly:
 *
 *   cell (c, r)  ⇔  native px [16c, 16c+16) × [16r, 16r+16)
 *                ⇔  world px  [32c, 32c+32) × [32r, 32r+32)
 *                ⇔  movement tile (c, r), because worldCellPx (16 × 2 = 32) == tileStepPx (32)
 *
 * That last equality is a COINCIDENCE OF THE CURRENT TUNING, not a law. `game/collision.ts` never
 * assumes it — `worldCellPx` and `tileWalkable` convert explicitly — and neither does this file:
 * every conversion here goes through `layoutDims`. If `mapRenderScale` or `tileStepPx` is retuned
 * the layout stays 64×64 (it is pinned to the collision grid) and the tile lattice moves under it,
 * which is the correct behaviour.
 *
 * The origin is TOP-LEFT, matching `data/nodes/*.json` `props[].x/y` ("Position in map-native
 * pixels", core/types.ts:139) and matching the mask raster's row order.
 *
 *   col = floor(nativeX / collisionCellPx)      nativeX of a cell's left edge  = col * collisionCellPx
 *   row = floor(nativeY / collisionCellPx)      nativeY of a cell's top edge   = row * collisionCellPx
 *
 * The centre of the map, native (512, 512), is cell (32, 32) — the top-left corner of that cell,
 * exactly. It is also movement tile (32, 32), which is where `firstWalkableTile` starts its ring
 * search (`Math.floor(64 / 2)` on both axes). Every layout must leave that cell walkable.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE FILE FORMAT
 * ═════════════════════════════════════════════════════════════════════════════
 *
 *     # ... any number of header lines, each beginning with '#'
 *     ---
 *     <rows lines of exactly cols characters>
 *
 * The `---` separator is explicit rather than heuristic FOR ONE REASON: `#` is simultaneously the
 * comment marker a human expects and the wall character `gridFromAscii` reads. A parser that
 * guessed would read a header line as a solid row of wall. So the split is a literal sentinel and
 * the body is validated to exact dimensions before anything looks at it.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE TWO PASSES
 * ═════════════════════════════════════════════════════════════════════════════
 * One string, read twice:
 *   · `collisionGridOf` normalises every wall character to `#` and hands the result to
 *     `gridFromAscii` — the engine's own parser (game/collision.ts:770), tested, engine-free, and
 *     until now with zero production callers. Not reimplemented here.
 *   · `anchorsOf` and `regionsOf` re-read the SAME string for the characters the collision pass saw
 *     as floor, plus the connected components of each character for typed regions.
 */

import { gridFromAscii } from '../../game/collision.ts';
import type { Balance, CollisionGrid } from '../../core/types.ts';
import {
  DEFAULT_LEGEND,
  ENGINE_BLOCKED_CHAR,
  ENGINE_FLOOR_CHAR,
  legendIndex,
  type LegendEntry,
} from './legend.ts';

export class LayoutError extends Error {}

/** The separator between the header and the body. */
export const BODY_SEPARATOR = '---';

/** Everything the layout's coordinate space is, derived from `balance.map` and nothing else. */
export interface LayoutDims {
  cols: number;
  rows: number;
  /** Native pixels per cell — `balance.map.collisionCellPx`, cross-checked against mapNativePx/cols. */
  cellPx: number;
  /** The painted map's native side, `balance.map.mapNativePx`. */
  nativePx: number;
  /** World pixels per cell — cellPx × mapRenderScale. */
  worldCellPx: number;
  /** Movement tiles across the world — worldSizePx / tileStepPx. */
  tileCols: number;
  tileRows: number;
}

/**
 * The one place layout dimensions are computed. Throws if `balance.map` is internally inconsistent,
 * because a layout authored against 64 columns and sampled against 63 is a silently wrong mask.
 */
export function layoutDims(balance: Balance): LayoutDims {
  const m = balance.map;
  const cols = Math.floor(m.collisionCols);
  const rows = Math.floor(m.collisionRows);
  const cellPx = Math.floor(m.collisionCellPx);
  const nativePx = Math.floor(m.mapNativePx);
  if (cols <= 0 || rows <= 0 || cellPx <= 0 || nativePx <= 0) {
    throw new LayoutError(`balance.map has a non-positive dimension: ${cols}×${rows} cells of ${cellPx}px over ${nativePx}px`);
  }
  if (cols * cellPx !== nativePx || rows * cellPx !== nativePx) {
    throw new LayoutError(
      `balance.map is inconsistent: ${cols}×${rows} cells of ${cellPx} native px do not tile a ` +
        `${nativePx}² map. game/collision.ts derives cellPx as mapNativePx/collisionCols ` +
        `(${nativePx / cols}), so a layout authored at ${cellPx}px would sample somewhere else.`,
    );
  }
  const worldSide = nativePx * m.mapRenderScale;
  return {
    cols,
    rows,
    cellPx,
    nativePx,
    worldCellPx: cellPx * m.mapRenderScale,
    tileCols: Math.floor(worldSide / m.tileStepPx),
    tileRows: Math.floor(worldSide / m.tileStepPx),
  };
}

/** A single walkable cell that also carries a point marker. */
export interface LayoutAnchor {
  char: string;
  kind: string;
  col: number;
  row: number;
  /** Native pixel of the cell's TOP-LEFT corner. */
  nativeX: number;
  nativeY: number;
  /** Native pixel of the cell's centre — what a prop's authored (x,y) is compared against. */
  centreX: number;
  centreY: number;
}

/** A 4-connected run of one character, with its bounding box in both spaces. */
export interface LayoutRegion {
  char: string;
  /** OPEN STRING. See tools/mapgen/legend.ts. */
  kind: string;
  blocks: boolean;
  cells: number;
  /** Inclusive cell bounds. */
  col0: number;
  row0: number;
  col1: number;
  row1: number;
  /** Bounding box in native pixels; `nativeW`/`nativeH` are the SPAN, i.e. (col1-col0+1)*cellPx. */
  nativeX: number;
  nativeY: number;
  nativeW: number;
  nativeH: number;
  /** True iff every cell in the bounding box belongs to the region — i.e. it is a solid rectangle. */
  rectangular: boolean;
}

/** A parsed layout file. `body` is the exact rows × cols character block. */
export interface LayoutDoc {
  nodeId: string;
  dims: LayoutDims;
  /** Header lines WITHOUT their leading '#', in file order. */
  header: string[];
  /** rows strings of exactly cols characters. */
  body: string[];
  legend: readonly LegendEntry[];
}

function entryOf(doc: LayoutDoc, char: string): LegendEntry {
  const e = legendIndex(doc.legend).get(char);
  if (!e) throw new LayoutError(`layout "${doc.nodeId}": character "${char}" is not in the legend`);
  return e;
}

export function charAt(doc: LayoutDoc, col: number, row: number): string {
  const line = doc.body[row];
  if (line === undefined) throw new LayoutError(`layout "${doc.nodeId}": row ${row} is out of range`);
  const ch = line[col];
  if (ch === undefined) throw new LayoutError(`layout "${doc.nodeId}": col ${col} is out of range on row ${row}`);
  return ch;
}

/**
 * Parse a layout file. Everything that could be wrong is wrong LOUDLY:
 *   · a missing `---`, so a headerless file cannot be read as if row 0 were a comment;
 *   · wrong dimensions, because `gridFromAscii` pads a short line with walkable cells silently and
 *     that is exactly the kind of quiet hole a collision mask must never have;
 *   · a character the legend does not know, because a typo that parsed as floor would be a hole.
 */
export function parseLayout(
  nodeId: string,
  text: string,
  balance: Balance,
  legend: readonly LegendEntry[] = DEFAULT_LEGEND,
): LayoutDoc {
  const dims = layoutDims(balance);
  const index = legendIndex(legend);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const cut = lines.indexOf(BODY_SEPARATOR);
  if (cut < 0) {
    throw new LayoutError(
      `layout "${nodeId}": no "${BODY_SEPARATOR}" separator line. The header and the body cannot be ` +
        `told apart without it, because "#" is both the comment marker and the wall character.`,
    );
  }
  const header = lines.slice(0, cut).map((l) => l.replace(/^#\s?/, ''));
  const body = lines.slice(cut + 1).filter((l, i, all) => !(l === '' && i === all.length - 1));

  const problems: string[] = [];
  if (body.length !== dims.rows) problems.push(`body has ${body.length} lines, expected ${dims.rows}`);
  body.forEach((line, row) => {
    if (line.length !== dims.cols) problems.push(`row ${row} is ${line.length} characters, expected ${dims.cols}`);
    for (let col = 0; col < line.length; col += 1) {
      const ch = line[col];
      if (ch !== undefined && !index.has(ch)) {
        problems.push(`row ${row} col ${col}: "${ch}" is not in the legend`);
      }
    }
  });
  if (problems.length > 0) {
    throw new LayoutError(`layout "${nodeId}" is malformed:\n  · ${problems.slice(0, 20).join('\n  · ')}`);
  }
  return { nodeId, dims, header, body, legend };
}

/** The file text for a doc — header lines re-prefixed, separator, body. Round-trips `parseLayout`. */
export function serialiseLayout(doc: LayoutDoc): string {
  const header = doc.header.map((l) => (l.length === 0 ? '#' : `# ${l}`));
  return [...header, BODY_SEPARATOR, ...doc.body, ''].join('\n');
}

/**
 * PASS 1 — collision. Every `blocks: true` character becomes `#`, every other character becomes
 * `.`, and the engine's own `gridFromAscii` does the rest. Normalising rather than reimplementing is
 * the point: a second parser is a second thing that can disagree with the engine about a wall.
 */
export function normalisedAscii(doc: LayoutDoc): string {
  const index = legendIndex(doc.legend);
  return doc.body
    .map((line) =>
      Array.from(line, (ch) => {
        const e = index.get(ch);
        if (!e) throw new LayoutError(`layout "${doc.nodeId}": character "${ch}" is not in the legend`);
        return e.blocks ? ENGINE_BLOCKED_CHAR : ENGINE_FLOOR_CHAR;
      }).join(''),
    )
    .join('\n');
}

export function collisionGridOf(doc: LayoutDoc): CollisionGrid {
  return gridFromAscii(doc.nodeId, normalisedAscii(doc), doc.dims.cellPx);
}

/** PASS 2a — the anchor characters, which pass 1 saw as floor. */
export function anchorsOf(doc: LayoutDoc): LayoutAnchor[] {
  const index = legendIndex(doc.legend);
  const out: LayoutAnchor[] = [];
  const half = doc.dims.cellPx / 2;
  for (let row = 0; row < doc.dims.rows; row += 1) {
    for (let col = 0; col < doc.dims.cols; col += 1) {
      const ch = charAt(doc, col, row);
      const e = index.get(ch);
      if (!e || !e.anchor) continue;
      const nativeX = col * doc.dims.cellPx;
      const nativeY = row * doc.dims.cellPx;
      out.push({
        char: ch,
        kind: e.kind,
        col,
        row,
        nativeX,
        nativeY,
        centreX: nativeX + half,
        centreY: nativeY + half,
      });
    }
  }
  return out;
}

/** PASS 2b — 4-connected components of each character, typed by the legend. */
export function regionsOf(doc: LayoutDoc, keep?: (entry: LegendEntry) => boolean): LayoutRegion[] {
  const { cols, rows, cellPx } = doc.dims;
  const seen = new Uint8Array(cols * rows);
  const out: LayoutRegion[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (seen[row * cols + col] === 1) continue;
      const ch = charAt(doc, col, row);
      const entry = entryOf(doc, ch);
      if (keep && !keep(entry)) {
        seen[row * cols + col] = 1;
        continue;
      }
      // Flood the component. An explicit stack, not recursion: a single region can be all 4096 cells.
      const stack: Array<[number, number]> = [[col, row]];
      seen[row * cols + col] = 1;
      const members: Array<[number, number]> = [];
      let c0 = col;
      let c1 = col;
      let r0 = row;
      let r1 = row;
      while (stack.length > 0) {
        const at = stack.pop();
        if (!at) break;
        const [cx, cy] = at;
        members.push([cx, cy]);
        if (cx < c0) c0 = cx;
        if (cx > c1) c1 = cx;
        if (cy < r0) r0 = cy;
        if (cy > r1) r1 = cy;
        const nbrs: Array<[number, number]> = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of nbrs) {
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (seen[ny * cols + nx] === 1) continue;
          if (charAt(doc, nx, ny) !== ch) continue;
          seen[ny * cols + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      const spanCols = c1 - c0 + 1;
      const spanRows = r1 - r0 + 1;
      out.push({
        char: ch,
        kind: entry.kind,
        blocks: entry.blocks,
        cells: members.length,
        col0: c0,
        row0: r0,
        col1: c1,
        row1: r1,
        nativeX: c0 * cellPx,
        nativeY: r0 * cellPx,
        nativeW: spanCols * cellPx,
        nativeH: spanRows * cellPx,
        rectangular: members.length === spanCols * spanRows,
      });
    }
  }
  return out;
}

/** Cells of every character whose kind is in `kinds`. */
export function cellsOfKinds(doc: LayoutDoc, kinds: readonly string[]): Set<number> {
  const wanted = new Set(kinds);
  const index = legendIndex(doc.legend);
  const out = new Set<number>();
  for (let row = 0; row < doc.dims.rows; row += 1) {
    for (let col = 0; col < doc.dims.cols; col += 1) {
      const e = index.get(charAt(doc, col, row));
      if (e && wanted.has(e.kind)) out.add(row * doc.dims.cols + col);
    }
  }
  return out;
}

/** Walkable cells reachable from a start cell, 4-connected. The playable region, measured. */
export function reachableFrom(doc: LayoutDoc, startCol: number, startRow: number): Set<number> {
  const { cols, rows } = doc.dims;
  const index = legendIndex(doc.legend);
  const blocked = (c: number, r: number): boolean => {
    const e = index.get(charAt(doc, c, r));
    return e === undefined || e.blocks;
  };
  const out = new Set<number>();
  if (startCol < 0 || startRow < 0 || startCol >= cols || startRow >= rows) return out;
  if (blocked(startCol, startRow)) return out;
  const stack: Array<[number, number]> = [[startCol, startRow]];
  out.add(startRow * cols + startCol);
  while (stack.length > 0) {
    const at = stack.pop();
    if (!at) break;
    const [cx, cy] = at;
    const nbrs: Array<[number, number]> = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of nbrs) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const key = ny * cols + nx;
      if (out.has(key)) continue;
      if (blocked(nx, ny)) continue;
      out.add(key);
      stack.push([nx, ny]);
    }
  }
  return out;
}

/** native px → cell, the conversion declared in this file's header. */
export function cellOfNative(dims: LayoutDims, nativeX: number, nativeY: number): { col: number; row: number } {
  return { col: Math.floor(nativeX / dims.cellPx), row: Math.floor(nativeY / dims.cellPx) };
}
