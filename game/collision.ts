/**
 * game/collision.ts — the node's collision mask, sampled once into a packed bitfield.
 *
 * build-doc §7.6, verbatim: "Collision mask: 1-bit PNG at map native res, sampled on a 16px grid
 * (64×64 cells) into a packed bitfield at build time. Player logical sprite 32×48, tile step 32px,
 * grid movement Gold-style."
 *
 * Hard Req 5 / guardrail G4: **ONE mask per node serves all six years.** Nothing in this file takes
 * a year. `NodeFile.collisionMask` is a single string for exactly that reason, and the overlay-diff
 * acceptance test (build-doc §8.2) is what keeps it true of the art. If you ever find yourself
 * wanting a per-year mask, the variant that made you want it has failed overlay-diff.
 *
 * G1: no tilesets. A "cell" here is a sample of one painted image, not a tile in a tilemap. The map
 * is one picture; this is one bitmap over it.
 *
 * ENGINE-FREE ON PURPOSE. This module imports no Phaser (it is the half of the overworld that has
 * to be testable headlessly, and the collision editor — a separate Vite target, build-doc §5 —
 * reuses it verbatim). The Phaser-side pixel read and the on-screen overlay draw live in
 * game/mapview.ts; what is *decided* about walkability lives here.
 *
 * NUMBERS (G11): every dimension comes from `balance.map`. The only literals below are facts about
 * the file format and the bit packing (8 bits to a byte, 255 as the 8-bit channel maximum, 3 colour
 * channels), which are not gameplay constants and could not live in balance.json meaningfully.
 */

import type { Balance, CollisionGrid } from "../core/types";

/* ────────────────────────────────────────────────────────────────────────────
 * Format facts — not gameplay constants (G11 / INV-4)
 * ──────────────────────────────────────────────────────────────────────────── */

const BITS_PER_BYTE = 8;
/** Maximum value of one 8-bit colour channel as a canvas/PNG decode hands it back. */
const CHANNEL_MAX = 255;
/** Colour channels averaged for luminance. A 1-bit mask decodes to 0 or CHANNEL_MAX on all three. */
const COLOUR_CHANNELS = 3;

/* ────────────────────────────────────────────────────────────────────────────
 * The raster a mask arrives as
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A decoded mask image. Deliberately structural rather than `ImageData`: the browser hands us a real
 * `ImageData` (game/mapview.ts reads one off the Phaser texture), a test hands us a literal, and the
 * collision editor may hand us a canvas buffer. All three satisfy this.
 */
export interface MaskPixels {
  width: number;
  height: number;
  /** Row-major, `channels` values per pixel. RGBA is the canvas default. */
  data: ArrayLike<number>;
  /** Values per pixel. 4 = RGBA (default), 3 = RGB, 1 = single channel. */
  channels?: number;
}

/**
 * Which ink marks a cell impassable.
 *
 * THE MASK CONTRACT: a mask is a 1-bit image at map-native resolution where the **dark** pixels are
 * the walls. This is the polarity the collision editor must write and the polarity `sampleMask`
 * assumes unless told otherwise. Fully transparent pixels are treated as *unpainted*, i.e. walkable,
 * so a mask exported with an alpha channel and no background still reads correctly.
 */
export type MaskPolarity = "dark-blocks" | "light-blocks";

/**
 * How the pixels inside one cell decide the cell.
 *
 * `majority` (default) is the honest reading of "sampled on a 16px grid": the cell takes the side
 * more of its pixels are on. `any` is the conservative reading — one dark pixel blocks the cell —
 * and exists because the collision editor wants it for thin hand-drawn walls. Neither is a tunable
 * magnitude; they are two named rules, so no threshold number leaks into code (G11).
 */
export type CellPolicy = "majority" | "any";

export interface MaskSampleOptions {
  polarity?: MaskPolarity;
  policy?: CellPolicy;
  /** Grid width in cells. Default `balance.map.collisionCols`. */
  cols?: number;
  /** Grid height in cells. Default `balance.map.collisionRows`. */
  rows?: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Where a grid came from — the part that must never be mistaken for authored art
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `"authored"` — sampled from a real 1-bit mask PNG that a human drew in the collision editor.
 * `"synthesised"` — **no mask file existed**, so this module invented a walkable-everywhere-but-the-
 * border rectangle. A synthesised grid is a placeholder in exactly the sense the art placeholders
 * are: it keeps the game playable and it must never be read as a finished asset.
 */
export type CollisionSource = "authored" | "synthesised";

/**
 * A grid plus its provenance. Callers take this, not a bare {@link CollisionGrid}, so "is this a
 * real mask?" is answerable at every call site instead of being lost at the first hand-off.
 */
export interface LoadedCollision {
  grid: CollisionGrid;
  source: CollisionSource;
  /** `NodeFile.collisionMask` — the path we tried. Null when the node declared none at all. */
  maskPath: string | null;
  /**
   * Convenience mirror of `source === "synthesised"`. Present so a UI cannot forget to check: an
   * `if (collision.synthetic)` badge is one keystroke, and this whole field exists to make the
   * placeholder loud.
   */
  synthetic: boolean;
  /** One line a HUD or the debug overlay can print verbatim. */
  note: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Grid geometry
 * ──────────────────────────────────────────────────────────────────────────── */

export interface GridDimensions {
  cols: number;
  rows: number;
  /** Map-NATIVE pixels per cell (build-doc §7.6: 1024 native / 64 cells = 16). */
  cellPx: number;
}

/**
 * The grid the shipped balance asks for. `cellPx` is derived from the native map size and the column
 * count rather than read straight from `collisionCellPx`, so the three keys cannot silently drift
 * apart — {@link gridConsistencyProblem} is what complains when they do.
 */
export function gridDimensions(balance: Balance, opts: MaskSampleOptions = {}): GridDimensions {
  const cols = Math.max(1, Math.floor(opts.cols ?? balance.map.collisionCols));
  const rows = Math.max(1, Math.floor(opts.rows ?? balance.map.collisionRows));
  return { cols, rows, cellPx: balance.map.mapNativePx / cols };
}

/**
 * Returns a complaint string when `balance.map`'s three collision keys disagree — native size,
 * column/row count and cell size are three statements of one fact, and build-doc §7.6 states all
 * three (1024², 64×64, 16px). Null when they agree. {@link gridDimensions} derives `cellPx` from
 * the native size rather than reading `collisionCellPx`, so this is the check that the two agree.
 */
export function gridConsistencyProblem(balance: Balance): string | null {
  const { collisionCols, collisionRows, collisionCellPx, mapNativePx } = balance.map;
  if (collisionCols * collisionCellPx !== mapNativePx) {
    return `balance.map: collisionCols × collisionCellPx = ${collisionCols * collisionCellPx}, not mapNativePx ${mapNativePx}`;
  }
  if (collisionRows * collisionCellPx !== mapNativePx) {
    return `balance.map: collisionRows × collisionCellPx = ${collisionRows * collisionCellPx}, not mapNativePx ${mapNativePx}`;
  }
  return null;
}

/** Bytes a packed `cols × rows` bitfield occupies. */
export function packedByteLength(cols: number, rows: number): number {
  return Math.ceil((cols * rows) / BITS_PER_BYTE);
}

/** An all-walkable grid of the given shape. */
export function emptyGrid(nodeId: string, dims: GridDimensions): CollisionGrid {
  return {
    nodeId,
    cols: dims.cols,
    rows: dims.rows,
    cellPx: dims.cellPx,
    bits: new Uint8Array(packedByteLength(dims.cols, dims.rows)),
  };
}

export function inBounds(grid: CollisionGrid, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;
}

/**
 * Is this cell impassable?
 *
 * **Out of bounds reads as blocked.** The world is the painted map and nothing else, so walking off
 * the edge is walking into a wall — and a caller that forgot to bounds-check gets the safe answer
 * rather than an `undefined` that coerces to "walkable".
 */
export function isBlocked(grid: CollisionGrid, col: number, row: number): boolean {
  if (!inBounds(grid, col, row)) return true;
  const index = row * grid.cols + col;
  const byte = grid.bits[Math.floor(index / BITS_PER_BYTE)] ?? 0;
  return (byte & (1 << index % BITS_PER_BYTE)) !== 0;
}

/** Mutating setter — used by the sampler and by the collision editor's brush. */
export function setBlocked(grid: CollisionGrid, col: number, row: number, blocked: boolean): void {
  if (!inBounds(grid, col, row)) return;
  const index = row * grid.cols + col;
  const byteIndex = Math.floor(index / BITS_PER_BYTE);
  const mask = 1 << index % BITS_PER_BYTE;
  const byte = grid.bits[byteIndex] ?? 0;
  grid.bits[byteIndex] = blocked ? byte | mask : byte & ~mask;
}

/** Number of blocked cells — the one-number summary the editor and the tests read. */
export function blockedCount(grid: CollisionGrid): number {
  let n = 0;
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) if (isBlocked(grid, col, row)) n += 1;
  }
  return n;
}

/** Deep copy — the editor edits a copy so a cancelled session changes nothing. */
export function cloneGrid(grid: CollisionGrid): CollisionGrid {
  return { ...grid, bits: new Uint8Array(grid.bits) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * World-space conversion
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * WORLD pixels per collision cell. build-doc §7.6: the painted map is 1024² native "rendered 2×
 * (2048² world)", and the mask is sampled at native resolution — so one 16px native cell is 32 world
 * pixels, which is also `tileStepPx`. That coincidence is what lets the movement grid and the
 * collision grid line up, but nothing here assumes it: every query converts explicitly, so a retune
 * of `mapRenderScale` or `tileStepPx` moves the overworld without breaking it.
 */
export function worldCellPx(grid: CollisionGrid, balance: Balance): number {
  return grid.cellPx * balance.map.mapRenderScale;
}

/** The painted map's extent in world pixels (build-doc §7.6: 1024 native × 2 = 2048). */
export function worldSizePx(balance: Balance): { width: number; height: number } {
  const side = balance.map.mapNativePx * balance.map.mapRenderScale;
  return { width: side, height: side };
}

/** Cell containing a world-space point. May be out of bounds; {@link isBlocked} handles that. */
export function cellAtWorld(
  grid: CollisionGrid,
  x: number,
  y: number,
  balance: Balance,
): { col: number; row: number } {
  const cell = worldCellPx(grid, balance);
  return { col: Math.floor(x / cell), row: Math.floor(y / cell) };
}

/** Top-left world-space corner of a cell. */
export function cellTopLeftWorld(
  grid: CollisionGrid,
  col: number,
  row: number,
  balance: Balance,
): { x: number; y: number } {
  const cell = worldCellPx(grid, balance);
  return { x: col * cell, y: row * cell };
}

export interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Does this world-space rectangle overlap ANY blocked cell (or leave the map)?
 *
 * This is the query movement actually makes: the player's logical footprint is a rectangle, the
 * collision grid may be coarser or finer than the movement grid, and "the destination tile is clear"
 * means every cell the footprint would touch is clear. A half-open rectangle — the right and bottom
 * edges are exclusive — so a footprint exactly one cell wide tests exactly one cell.
 */
export function rectBlocked(grid: CollisionGrid, rect: WorldRect, balance: Balance): boolean {
  const cell = worldCellPx(grid, balance);
  if (rect.w <= 0 || rect.h <= 0) return isBlocked(grid, Math.floor(rect.x / cell), Math.floor(rect.y / cell));
  const colFrom = Math.floor(rect.x / cell);
  const rowFrom = Math.floor(rect.y / cell);
  const colTo = Math.ceil((rect.x + rect.w) / cell) - 1;
  const rowTo = Math.ceil((rect.y + rect.h) / cell) - 1;
  for (let row = rowFrom; row <= rowTo; row += 1) {
    for (let col = colFrom; col <= colTo; col += 1) if (isBlocked(grid, col, row)) return true;
  }
  return false;
}

/**
 * Can the player stand with their logical footprint on tile (`tileCol`, `tileRow`)?
 *
 * The footprint is ONE tile step square at the player's feet — build-doc §7.6's 32×48 sprite is
 * 32 wide and 48 tall because the art overhangs upward (head and cap), not because the creature
 * occupies a tile and a half. Movement is grid-locked in WORLD space regardless of the painted art's
 * projection, so this is a plain axis-aligned rectangle however oblique the painting looks.
 */
export function tileWalkable(
  grid: CollisionGrid,
  tileCol: number,
  tileRow: number,
  balance: Balance,
): boolean {
  const step = balance.map.tileStepPx;
  return !rectBlocked(grid, { x: tileCol * step, y: tileRow * step, w: step, h: step }, balance);
}

/** Tile columns/rows that fit in the world at `tileStepPx` (build-doc §7.6: 2048 / 32 = 64). */
export function tileGridSize(balance: Balance): { cols: number; rows: number } {
  const world = worldSizePx(balance);
  return {
    cols: Math.floor(world.width / balance.map.tileStepPx),
    rows: Math.floor(world.height / balance.map.tileStepPx),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sampling — §7.6's "sampled on a 16px grid into a packed bitfield"
 * ──────────────────────────────────────────────────────────────────────────── */

function channelsOf(pixels: MaskPixels): number {
  return Math.max(1, Math.floor(pixels.channels ?? 4));
}

/**
 * Is one decoded pixel ink? Transparent pixels are unpainted and therefore walkable whatever the
 * polarity says; opaque pixels are compared against the midpoint of the channel range, which for a
 * true 1-bit mask (values 0 and 255 only) is any comparison at all.
 */
function pixelIsBlocked(pixels: MaskPixels, index: number, polarity: MaskPolarity): boolean {
  const channels = channelsOf(pixels);
  const base = index * channels;
  const data = pixels.data;

  if (channels >= 4) {
    const alpha = data[base + 3] ?? CHANNEL_MAX;
    if (alpha * 2 <= CHANNEL_MAX) return false; // unpainted
  }

  let sum = 0;
  const used = Math.min(channels, COLOUR_CHANNELS);
  for (let c = 0; c < used; c += 1) sum += data[base + c] ?? 0;
  const mean = sum / used;
  const dark = mean * 2 < CHANNEL_MAX;
  return polarity === "dark-blocks" ? dark : !dark;
}

/**
 * Sample a decoded mask into a packed bitfield.
 *
 * The mask is sampled proportionally, so a mask exported at a resolution other than
 * `balance.map.mapNativePx` still lands on the right cells rather than being cropped — the grid
 * always covers the whole image.
 */
export function sampleMask(
  nodeId: string,
  pixels: MaskPixels,
  balance: Balance,
  opts: MaskSampleOptions = {},
): CollisionGrid {
  const dims = gridDimensions(balance, opts);
  const grid = emptyGrid(nodeId, dims);
  const polarity = opts.polarity ?? "dark-blocks";
  const policy = opts.policy ?? "majority";

  const width = Math.max(0, Math.floor(pixels.width));
  const height = Math.max(0, Math.floor(pixels.height));
  if (width === 0 || height === 0) return grid;

  for (let row = 0; row < dims.rows; row += 1) {
    const yFrom = Math.floor((row * height) / dims.rows);
    const yTo = Math.max(yFrom + 1, Math.floor(((row + 1) * height) / dims.rows));
    for (let col = 0; col < dims.cols; col += 1) {
      const xFrom = Math.floor((col * width) / dims.cols);
      const xTo = Math.max(xFrom + 1, Math.floor(((col + 1) * width) / dims.cols));

      let ink = 0;
      let seen = 0;
      let shortCircuit = false;
      for (let y = yFrom; y < yTo && y < height && !shortCircuit; y += 1) {
        for (let x = xFrom; x < xTo && x < width; x += 1) {
          seen += 1;
          if (pixelIsBlocked(pixels, y * width + x, polarity)) {
            ink += 1;
            if (policy === "any") {
              shortCircuit = true;
              break;
            }
          }
        }
      }
      if (seen === 0) continue;
      const blocked = policy === "any" ? ink > 0 : ink * 2 >= seen;
      if (blocked) setBlocked(grid, col, row, true);
    }
  }

  return grid;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Loading — authored, or honestly synthesised
 * ──────────────────────────────────────────────────────────────────────────── */

/** A real mask, sampled. The only path that may return `source: "authored"`. */
export function collisionFromMask(
  nodeId: string,
  maskPath: string,
  pixels: MaskPixels,
  balance: Balance,
  opts: MaskSampleOptions = {},
): LoadedCollision {
  const grid = sampleMask(nodeId, pixels, balance, opts);
  return {
    grid,
    source: "authored",
    maskPath,
    synthetic: false,
    note: `authored mask ${maskPath} — ${grid.cols}×${grid.rows} cells, ${blockedCount(grid)} blocked`,
  };
}

/**
 * NO MASK EXISTS FOR THIS NODE. Build the only honest stand-in: walkable everywhere except a
 * one-cell wall around the border, so the node is playable and the player cannot walk off the world.
 *
 * This is a PLACEHOLDER, and every field of the result says so — `source: "synthesised"`,
 * `synthetic: true`, and a `note` written to be printed on screen. It is the collision equivalent of
 * a flat rectangle with the asset id on it: never let it read as authored geometry, and never let a
 * year-variant swap or an art hand-off quietly inherit it (Hard Req 5 / G4 are about a mask a human
 * drew — this is not one).
 */
export function synthesiseBorderCollision(
  nodeId: string,
  balance: Balance,
  maskPath: string | null = null,
  opts: MaskSampleOptions = {},
): LoadedCollision {
  const dims = gridDimensions(balance, opts);
  const grid = emptyGrid(nodeId, dims);
  for (let col = 0; col < dims.cols; col += 1) {
    setBlocked(grid, col, 0, true);
    setBlocked(grid, col, dims.rows - 1, true);
  }
  for (let row = 0; row < dims.rows; row += 1) {
    setBlocked(grid, 0, row, true);
    setBlocked(grid, dims.cols - 1, row, true);
  }
  const missing = maskPath === null ? "the node declares no mask" : `${maskPath} did not load`;
  return {
    grid,
    source: "synthesised",
    maskPath,
    synthetic: true,
    note: `SYNTHESISED collision (${missing}) — walkable except the border; NOT an authored mask`,
  };
}

/**
 * The load-time entry point: sample the mask if we have its pixels, otherwise synthesise and say so.
 * `pixels` is null when the mask PNG is absent or failed to decode — which is the shipped state
 * today, since no mask has been drawn yet.
 */
export function loadCollision(
  nodeId: string,
  maskPath: string | null,
  pixels: MaskPixels | null,
  balance: Balance,
  opts: MaskSampleOptions = {},
): LoadedCollision {
  if (pixels && maskPath) return collisionFromMask(nodeId, maskPath, pixels, balance, opts);
  return synthesiseBorderCollision(nodeId, balance, maskPath, opts);
}

/**
 * A tile the player can legally start on. Prefers the centre and spirals outward, so a synthesised
 * border grid puts the player in the middle of the map and an authored mask still finds ground.
 * Returns null when the node has no walkable tile at all — which is a broken mask, not a spawn bug.
 */
export function firstWalkableTile(
  grid: CollisionGrid,
  balance: Balance,
): { col: number; row: number } | null {
  const tiles = tileGridSize(balance);
  const midCol = Math.floor(tiles.cols / 2);
  const midRow = Math.floor(tiles.rows / 2);
  const maxRing = Math.max(tiles.cols, tiles.rows);
  for (let ring = 0; ring <= maxRing; ring += 1) {
    for (let dRow = -ring; dRow <= ring; dRow += 1) {
      for (let dCol = -ring; dCol <= ring; dCol += 1) {
        if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== ring) continue;
        const col = midCol + dCol;
        const row = midRow + dRow;
        if (col < 0 || row < 0 || col >= tiles.cols || row >= tiles.rows) continue;
        if (tileWalkable(grid, col, row, balance)) return { col, row };
      }
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Debug overlay — engine-free geometry (the collision editor reuses this)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Blocked cells as world-space rectangles, run-length merged along each row.
 *
 * Engine-free so both the overworld's debug key and the collision editor (a separate Vite target)
 * draw the SAME shapes from the same function — an editor whose overlay disagreed with the runtime
 * query would be a tool for drawing masks that are wrong in a way you cannot see. game/mapview.ts's
 * `drawCollisionOverlay` is the ten-line Phaser wrapper around this.
 */
export function debugOverlayRects(grid: CollisionGrid, balance: Balance): WorldRect[] {
  const cell = worldCellPx(grid, balance);
  const rects: WorldRect[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    let runStart = -1;
    for (let col = 0; col <= grid.cols; col += 1) {
      const solid = col < grid.cols && isBlocked(grid, col, row);
      if (solid && runStart < 0) runStart = col;
      if (!solid && runStart >= 0) {
        rects.push({ x: runStart * cell, y: row * cell, w: (col - runStart) * cell, h: cell });
        runStart = -1;
      }
    }
  }
  return rects;
}

/** ASCII dump — what a failing test prints so the mask is readable in the diff. */
export function gridToAscii(grid: CollisionGrid): string {
  const lines: string[] = [];
  for (let row = 0; row < grid.rows; row += 1) {
    let line = "";
    for (let col = 0; col < grid.cols; col += 1) line += isBlocked(grid, col, row) ? "#" : ".";
    lines.push(line);
  }
  return lines.join("\n");
}

/** Parse an ASCII picture into a grid — how a test states an expected mask readably. */
export function gridFromAscii(nodeId: string, ascii: string, cellPx: number): CollisionGrid {
  const lines = ascii
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const rows = lines.length;
  const cols = lines.reduce((max, l) => Math.max(max, l.length), 0);
  const grid = emptyGrid(nodeId, { cols, rows, cellPx });
  lines.forEach((line, row) => {
    for (let col = 0; col < line.length; col += 1) {
      if (line[col] === "#") setBlocked(grid, col, row, true);
    }
  });
  return grid;
}
