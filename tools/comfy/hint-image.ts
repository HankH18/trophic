/**
 * tools/comfy/hint-image.ts — a `tools/mapgen/layouts/*.txt` rendered as a ControlNet hint.
 *
 * ── WHY THIS EXISTS AND DOES NOT JUST USE assets/raw/_layouts/control-*.png ────────────────────
 * `tools/mapgen/render.ts` already writes a control image, and it is nearly right. It paints the
 * FOUR ANCHOR CHARACTERS as their own saturated legend colours: `@` spawn is magenta (240,96,200),
 * `*` prop is yellow (240,208,64), `D` door is orange (240,144,48), `^` edge-mouth is near-white.
 * Those are documentary markers for a human reading the layout — a 16-native-px square of pure
 * magenta at the exact centre of the frame is not geometry, and `tools/artverify/EVAL-STANDARD.md`
 * §1.3 names **"a floating pink cube"** as one of the seven defects in the single image the owner
 * rejected hardest. Feeding one to a conditioning model at the one coordinate the contracts require
 * to be open standable ground would be arranging for that defect on purpose.
 *
 * So this renderer FLATTENS every anchor into terrain before colouring: an anchor cell takes the
 * most common non-anchor character among its eight neighbours (ties broken by legend order, so the
 * result is deterministic), falling back to open ground. `^` on a path mouth becomes path, `@` at
 * the centre becomes clearing, `D` beside a wall becomes the floor it is entered from. Collision,
 * props and spawn are unaffected — they are read from the .txt by the engine, never from a PNG.
 *
 * Nothing else about the encoding moves: flat legend colours, hard edges, nearest-neighbour blow-up
 * to `mapNativePx`, exactly as `render.ts` documents and for the same reason.
 *
 * ── WHAT THIS IMAGE STILL CONTAINS THAT IS WORTH KNOWING BEFORE READING A RESULT ──────────────
 * Two features of the layouts are themselves edge-to-edge lines, and a hint cannot be judged
 * without saying so:
 *   1. Every layout is RINGED by a border of wall characters, so the hint carries a frame. On a
 *      volcanic node a rock rim reads as terrain; on a meadow it is the "wall ringing the whole
 *      frame" this round is trying to remove. Report it per node; do not assume it is harmless.
 *   2. The path corridor runs from the bottom edge to the top edge by construction, because the
 *      art convention is bottom = back toward Hearthollow, top = onward to the Sanctum. One
 *      meandering path is not the grid defect (EVAL-STANDARD §3.8 — a single crossroads is not a
 *      violation) but it IS a line that touches two edges, and it will show up in the output.
 *
 * ── THREE ENCODINGS, BECAUSE ONE OF THEM WAS MEASURED INERT ────────────────────────────────────
 * `seg` — flat legend colour per cell — is the encoding `tools/mapgen/render.ts` describes and the
 * one this lane tried first. Swept against cindershelf at ControlNet strengths 0.25 / 0.35 / 0.45 /
 * 0.60 with the LoRA on and the seed held at 42, it moved detail and brightness and **did not move
 * the layout at any strength**: the prompt's quadrant grid survived every cell unchanged. That is
 * a plausible failure for it — `Z-Image-Turbo-Fun-Controlnet-Union` is trained on the usual union
 * of canny / depth / pose / normal, and a project-specific legend palette is not a segmentation
 * encoding it has ever seen. A colour it cannot decode is a colour it can only treat as tint.
 *
 * So `edges` and `depth` exist: the same geometry re-encoded into two conditions the union of a
 * ControlNet family is actually trained on. They are alternatives to `seg`, not improvements on it;
 * which one controls layout is a measurement, and `seg`'s null result is recorded above so nobody
 * runs that sweep twice.
 */
import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { DEFAULT_LEGEND, legendIndex, type LegendEntry } from '../mapgen/legend.ts';

export class HintImageError extends Error {}

/** Where the hand-edited layouts live. Read-only from this lane. */
export const LAYOUT_DIR = 'tools/mapgen/layouts';

/** The separator `tools/mapgen/layout.ts` puts between the header commentary and the grid. */
const BODY_SEPARATOR = '---';

export interface HintGrid {
  cols: number;
  rows: number;
  /** One row per line, anchors already flattened to terrain. */
  cells: string[];
}

/** Split a layout file into its grid body. The header is commentary and is dropped. */
export function bodyOf(text: string): string[] {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() === BODY_SEPARATOR);
  if (at < 0) throw new HintImageError(`layout has no "${BODY_SEPARATOR}" separator line`);
  const body = lines.slice(at + 1).filter((l) => l.length > 0);
  if (body.length === 0) throw new HintImageError('layout has no grid body after the separator');
  return body;
}

/**
 * Replace every anchor character with terrain, so the hint carries geometry and nothing else.
 * See the header for why this is not an optional tidy-up.
 */
export function flattenAnchors(body: string[], legend: readonly LegendEntry[] = DEFAULT_LEGEND): HintGrid {
  const index = legendIndex(legend);
  const order = new Map(legend.map((e, i) => [e.char, i]));
  const rows = body.length;
  const cols = Math.max(...body.map((l) => l.length));
  const isAnchor = (ch: string): boolean => index.get(ch)?.anchor === true;

  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    let line = '';
    for (let c = 0; c < cols; c += 1) {
      const ch = body[r]?.[c] ?? '.';
      if (!isAnchor(ch)) {
        line += index.has(ch) ? ch : '.';
        continue;
      }
      const tally = new Map<string, number>();
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const n = body[r + dy]?.[c + dx];
          if (n === undefined || !index.has(n) || isAnchor(n)) continue;
          tally.set(n, (tally.get(n) ?? 0) + 1);
        }
      }
      let best = '.';
      let bestN = 0;
      for (const [n, count] of tally) {
        const better = count > bestN || (count === bestN && (order.get(n) ?? 99) < (order.get(best) ?? 99));
        if (better) {
          best = n;
          bestN = count;
        }
      }
      line += best;
    }
    out.push(line);
  }
  return { cols, rows, cells: out };
}

/**
 * How the geometry is written into the conditioning image. See the header for why there is
 * more than one.
 *   seg    flat legend colour per cell — semantic regions, hard edges
 *   edges  white boundary lines on black wherever two adjacent cells differ — canny-equivalent
 *   depth  flat greyscale per cell, tall things bright and ground dark — depth-equivalent
 */
export type HintKind = 'seg' | 'edges' | 'depth';

export const HINT_KINDS: readonly HintKind[] = ['seg', 'edges', 'depth'];

/**
 * Height per legend kind for the `depth` encoding, brightest = nearest the camera on a top-down
 * map. These are TOOL constants — nothing here reaches the sim, the reducer or the save — which is
 * the same reason `legend.ts` keeps its control colours in code rather than in `data/balance.json`
 * (G11 governs gameplay numbers).
 */
const DEPTH_OF: Readonly<Record<string, number>> = {
  'building-footprint': 236,
  'tree-mass': 200,
  rock: 176,
  wall: 160,
  fence: 132,
  'open-ground': 96,
  scrub: 88,
  'centre-clearing': 100,
  'path-corridor': 72,
  shallow: 48,
  water: 24,
};

const DEPTH_FALLBACK = 96;

/** Half-width in pixels of a boundary line in the `edges` encoding. */
const EDGE_HALF_WIDTH = 2;

/**
 * White boundary lines on black wherever two adjacent cells carry different characters. Drawn at
 * OUTPUT resolution rather than by upscaling a 64×64 edge grid, because a boolean grid blown up
 * nearest-neighbour gives a 16-pixel-thick line — a filled band, not an edge.
 */
export function edgeRaster(grid: HintGrid, side: number): Buffer {
  const data = Buffer.alloc(side * side * 3, 0);
  const cellW = side / grid.cols;
  const cellH = side / grid.rows;
  const at = (c: number, r: number): string => grid.cells[r]?.[c] ?? '.';
  for (let y = 0; y < side; y += 1) {
    const r = Math.min(grid.rows - 1, Math.floor(y / cellH));
    const nearTop = y - r * cellH < EDGE_HALF_WIDTH;
    const nearBottom = (r + 1) * cellH - y <= EDGE_HALF_WIDTH;
    for (let x = 0; x < side; x += 1) {
      const c = Math.min(grid.cols - 1, Math.floor(x / cellW));
      const here = at(c, r);
      const on =
        (nearTop && r > 0 && at(c, r - 1) !== here) ||
        (nearBottom && r < grid.rows - 1 && at(c, r + 1) !== here) ||
        (x - c * cellW < EDGE_HALF_WIDTH && c > 0 && at(c - 1, r) !== here) ||
        ((c + 1) * cellW - x <= EDGE_HALF_WIDTH && c < grid.cols - 1 && at(c + 1, r) !== here);
      if (!on) continue;
      const i = (y * side + x) * 3;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }
  return data;
}

/** Flat greyscale per cell — tall things bright, ground dark. Nearest-neighbour, no blending. */
export function depthRaster(grid: HintGrid, side: number, legend: readonly LegendEntry[] = DEFAULT_LEGEND): Buffer {
  const index = legendIndex(legend);
  const data = Buffer.alloc(side * side * 3);
  for (let y = 0; y < side; y += 1) {
    const r = Math.min(grid.rows - 1, Math.floor((y * grid.rows) / side));
    for (let x = 0; x < side; x += 1) {
      const c = Math.min(grid.cols - 1, Math.floor((x * grid.cols) / side));
      const kind = index.get(grid.cells[r]?.[c] ?? '.')?.kind ?? 'open-ground';
      const v = DEPTH_OF[kind] ?? DEPTH_FALLBACK;
      const i = (y * side + x) * 3;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
    }
  }
  return data;
}

/** Flat legend colour per cell, nearest-neighbour to `side`×`side`. No blending anywhere. */
export function hintRaster(grid: HintGrid, side: number, legend: readonly LegendEntry[] = DEFAULT_LEGEND): Buffer {
  const index = legendIndex(legend);
  const data = Buffer.alloc(side * side * 3);
  for (let y = 0; y < side; y += 1) {
    const r = Math.min(grid.rows - 1, Math.floor((y * grid.rows) / side));
    for (let x = 0; x < side; x += 1) {
      const c = Math.min(grid.cols - 1, Math.floor((x * grid.cols) / side));
      const entry = index.get(grid.cells[r]?.[c] ?? '.') ?? index.get('.')!;
      const at = (y * side + x) * 3;
      data[at] = entry.control[0];
      data[at + 1] = entry.control[1];
      data[at + 2] = entry.control[2];
    }
  }
  return data;
}

/**
 * Replace every wall cell that is 4-connected to the image border with open ground.
 *
 * WHY THIS IS A SEPARATE KNOB AND NOT A FIX TO THE LAYOUTS. A layout is a COLLISION spec, and its
 * outer ring of wall is doing a real job there: it is what stops the player walking off the map.
 * As a COMPOSITION brief the same ring is the defect — "a wall ringing the whole frame" is one of
 * the eight edge-to-edge dividers this round exists to remove, and handing it to a conditioning
 * model is asking for it back. The two readings of one file disagree, so the layouts stay as they
 * are and the hint drops the ring.
 *
 * Interior masses are untouched: only wall connected to the frame goes. A crater rim in the middle
 * of a map is terrain and belongs in the hint.
 *
 * **IT IS A NO-OP ON THE `edges` ENCODING, AND THAT COST TWO BILLED GENERATIONS.** `edgeRaster`
 * draws a line wherever two adjacent cells CARRY DIFFERENT CHARACTERS; it never encodes which
 * characters. Turning the ring from tree-mass into open ground leaves a ring-shaped boundary in
 * exactly the same place against the scrub inside it, so the hint is byte-identical, the server
 * content-addresses it to the same name, and the run produces the same picture at full price. An
 * edge encoding can only ever transmit the ring's OUTLINE — which is itself a finding, because it
 * is the encoding that produced the hardest frames. `writeHint` refuses the combination.
 */
export function openBorder(grid: HintGrid, legend: readonly LegendEntry[] = DEFAULT_LEGEND): HintGrid {
  const index = legendIndex(legend);
  const blocks = (ch: string): boolean => index.get(ch)?.blocks === true;
  const cells = grid.cells.map((l) => l.split(''));
  const seen = new Set<number>();
  const stack: Array<[number, number]> = [];
  const push = (c: number, r: number): void => {
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return;
    const k = r * grid.cols + c;
    if (seen.has(k) || !blocks(cells[r]?.[c] ?? '.')) return;
    seen.add(k);
    stack.push([c, r]);
  };
  for (let c = 0; c < grid.cols; c += 1) {
    push(c, 0);
    push(c, grid.rows - 1);
  }
  for (let r = 0; r < grid.rows; r += 1) {
    push(0, r);
    push(grid.cols - 1, r);
  }
  while (stack.length > 0) {
    const [c, r] = stack.pop()!;
    const row = cells[r];
    if (row) row[c] = '.';
    push(c + 1, r);
    push(c - 1, r);
    push(c, r + 1);
    push(c, r - 1);
  }
  return { cols: grid.cols, rows: grid.rows, cells: cells.map((l) => l.join('')) };
}

/** Read one node's layout, flatten it, and write the hint PNG. Returns the path written. */
export async function writeHint(
  nodeId: string,
  dest: string,
  kind: HintKind = 'seg',
  opts: { openBorder?: boolean } = {},
  side = 1024,
): Promise<string> {
  if (opts.openBorder && kind === 'edges') {
    throw new HintImageError(
      'openBorder is a no-op on the `edges` encoding — the ring\'s outline survives its material ' +
        'being changed, the hint comes out byte-identical, and the generation bills for a repeat. ' +
        'See openBorder\'s note. Use `depth` or `seg` to test a ring-less hint.',
    );
  }
  const text = await readFile(`${LAYOUT_DIR}/${nodeId}.txt`, 'utf8');
  let grid = flattenAnchors(bodyOf(text));
  if (opts.openBorder) grid = openBorder(grid);
  const raw =
    kind === 'edges' ? edgeRaster(grid, side) : kind === 'depth' ? depthRaster(grid, side) : hintRaster(grid, side);
  await mkdir(dirname(dest), { recursive: true });
  await sharp(raw, { raw: { width: side, height: side, channels: 3 } }).png({ compressionLevel: 9 }).toFile(dest);
  return dest;
}
