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
 * ══ THE MASK CONTRACT — ONE DECLARATION, TWO READERS ══
 *
 * A collision mask is a 1-bit image at map-native resolution, **fully opaque**, where the **dark**
 * pixels are the walls:
 *
 *     opaque dark  (luminance < ½)  ⇒ BLOCKED
 *     opaque light (luminance ≥ ½)  ⇒ WALKABLE
 *     any transparency              ⇒ NOT A CONFORMING MASK (refused, see {@link maskHealth})
 *
 * The opacity clause is load-bearing and was added after a measured defect. Two modules read the
 * same mask file: this one, at runtime, and `tools/overlay-diff/mask.ts`, which restricts the
 * Hard Req 5 / G4 acceptance IoU to "the walkable cells of the collision mask" (build-doc §8.2).
 * On **opaque** rasters the two agree cell-for-cell — `tests/unit/collision.test.ts` proves it over
 * random rasters rather than asserting it. On **transparent** pixels they cannot: this file reads an
 * unpainted pixel as walkable (a sampler rule, so `sampleMask` never invents ink), while the gate
 * counts it toward the cell's total and never toward its walkable half, i.e. blocked. A mask with an
 * alpha background therefore played as an open field here and made every year variant fail the gate
 * with "the collision mask marks no walkable cells at all".
 *
 * The fix is not to pick a winner for an input neither reader can honestly interpret. It is to
 * declare that input out of contract, refuse it loudly at load ({@link collisionFromMask}), and make
 * the one producer — `tools/collision-editor/` — write nothing but fully opaque black and white.
 * Both readers then answer identically on every mask the project can actually contain.
 *
 * `sampleMask`'s own pixel rule is unchanged and still documented below: it is the pure sampler, and
 * a caller that hands it a transparent pixel gets "unpainted, therefore walkable". Whether such a
 * raster may be PLAYED is {@link maskHealth}'s question, not the sampler's.
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
  /**
   * What the mask file turned out to BE, when there was one — `null` only when no pixels reached us
   * at all. `source`/`synthetic` answer "did a file decode"; this answers "is it a usable mask",
   * which is the question a fully transparent PNG and an all-black PNG both used to pass silently.
   */
  health: MaskHealth | null;
  /** One line a HUD or the debug overlay can print verbatim. */
  note: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Is this raster a mask we can play? — the contract, checked
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The verdict on one decoded mask raster.
 *
 * `problems` is written to be printed: every entry is a whole sentence naming the file's own
 * numbers. `usable: false` means the game must NOT treat this as authored geometry — the loader
 * falls back to the synthesised placeholder and says which problem sent it there.
 */
export interface MaskHealth {
  /** false ⇒ out of contract; do not play it as authored geometry. */
  usable: boolean;
  /** Every departure from the contract, ready to print. Empty ⇒ conforming and unremarkable. */
  problems: string[];
  /** Pixels whose alpha is at or below half — the out-of-contract case (see {@link MaskPolarity}). */
  transparentPixels: number;
  totalPixels: number;
  blockedCells: number;
  walkableCells: number;
}

/** A mask raster read once: the grid it samples to, and the verdict on the file itself. */
export interface MaskReading {
  grid: CollisionGrid;
  health: MaskHealth;
}

function countTransparent(pixels: MaskPixels): number {
  const channels = channelsOf(pixels);
  if (channels < 4) return 0;
  const data = pixels.data;
  const count = Math.max(0, Math.floor(pixels.width)) * Math.max(0, Math.floor(pixels.height));
  let transparent = 0;
  for (let i = 0; i < count; i += 1) {
    const alpha = data[i * channels + 3] ?? CHANNEL_MAX;
    if (alpha * 2 <= CHANNEL_MAX) transparent += 1;
  }
  return transparent;
}

/**
 * Sample a mask AND judge it, in one pass over the file.
 *
 * The three verdicts, and why each is the one it is:
 *
 * • **Any transparency ⇒ unusable.** See {@link MaskPolarity}: this module and
 *   `tools/overlay-diff/mask.ts` read opaque pixels identically and transparent pixels oppositely,
 *   so a mask with an alpha channel is a file the game and the Hard Req 5 gate would disagree
 *   about. Refusing it is the only reading that cannot be silently wrong.
 * • **No walkable cell ⇒ unusable.** There is nowhere to stand. `firstWalkableTile` documents its
 *   null as "a broken mask, not a spawn bug"; this is where that is caught, before a caller can
 *   swallow the null and spawn the player inside a wall.
 * • **No blocked cell ⇒ reported, not refused.** An open field is a legal map. It is still worth
 *   printing, because it is exactly what a mask that failed to paint looks like.
 */
export function readMask(
  nodeId: string,
  pixels: MaskPixels,
  balance: Balance,
  opts: MaskSampleOptions = {},
): MaskReading {
  const grid = sampleMask(nodeId, pixels, balance, opts);
  const cells = grid.cols * grid.rows;
  const blocked = blockedCount(grid);
  const walkable = cells - blocked;
  const totalPixels = Math.max(0, Math.floor(pixels.width)) * Math.max(0, Math.floor(pixels.height));
  const transparent = countTransparent(pixels);

  const problems: string[] = [];
  let usable = true;

  if (totalPixels === 0) {
    problems.push("the mask decoded to no pixels at all");
    usable = false;
  }
  if (transparent > 0) {
    problems.push(
      `${transparent} of ${totalPixels} pixels are transparent — a collision mask must be fully ` +
        `opaque, because game/collision.ts reads an unpainted pixel as walkable and ` +
        `tools/overlay-diff/mask.ts reads it as blocked, so the game and the Hard Req 5 gate would ` +
        `disagree about this file`,
    );
    usable = false;
  }
  if (walkable === 0) {
    problems.push(`the mask marks all ${cells} cells blocked — there is nowhere to stand`);
    usable = false;
  }
  if (blocked === 0) {
    problems.push(`the mask marks 0 of ${cells} cells blocked — the whole map is open`);
  }

  return {
    grid,
    health: {
      usable,
      problems,
      transparentPixels: transparent,
      totalPixels,
      blockedCells: blocked,
      walkableCells: walkable,
    },
  };
}

/** {@link readMask}'s verdict alone — what the collision editor shows while you paint. */
export function maskHealth(
  pixels: MaskPixels,
  balance: Balance,
  opts: MaskSampleOptions = {},
): MaskHealth {
  return readMask("health-check", pixels, balance, opts).health;
}

/**
 * The INVERSE of {@link sampleMask}: a grid rendered back to a conforming mask raster.
 *
 * Black where blocked, white where walkable, **alpha 255 on every pixel**, at
 * `balance.map.mapNativePx` — build-doc §7.6's "1-bit PNG at map native res". It lives here, beside
 * the sampler, because an encoder that drifted from its decoder is a tool for writing masks that
 * are wrong in a way nobody can see; `tools/collision-editor/` calls this rather than owning a
 * second opinion about the format, and the round trip is asserted in tests/unit/collision.test.ts.
 *
 * Returns a {@link MaskPixels}, not an `ImageData`, so it is constructible in a node test — the
 * editor wraps it in one line.
 */
export function maskRasterFrom(grid: CollisionGrid, balance: Balance): MaskPixels {
  const side = Math.max(1, Math.floor(balance.map.mapNativePx));
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    const row = Math.min(grid.rows - 1, Math.floor((y * grid.rows) / side));
    for (let x = 0; x < side; x += 1) {
      const col = Math.min(grid.cols - 1, Math.floor((x * grid.cols) / side));
      const ink = isBlocked(grid, col, row) ? 0 : CHANNEL_MAX;
      const at = (y * side + x) * 4;
      data[at] = ink;
      data[at + 1] = ink;
      data[at + 2] = ink;
      data[at + 3] = CHANNEL_MAX;
    }
  }
  return { width: side, height: side, data, channels: 4 };
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

/**
 * A real mask, sampled AND judged. The only path that may return `source: "authored"` — and it only
 * does so for a raster that satisfies the contract in {@link MaskPolarity}.
 *
 * A mask that decodes but cannot be played (transparent, empty, or every cell blocked) is REFUSED:
 * the result is the synthesised placeholder, `source: "synthesised"`, and a note carrying the
 * verdict verbatim. Before this check, a fully transparent PNG loaded as
 * `source:"authored", synthetic:false, 0 blocked` — an entirely open map presented as authored
 * geometry — and an all-black PNG loaded as authored with every cell blocked, which then spawned the
 * player inside a wall.
 */
export function collisionFromMask(
  nodeId: string,
  maskPath: string,
  pixels: MaskPixels,
  balance: Balance,
  opts: MaskSampleOptions = {},
): LoadedCollision {
  const { grid, health } = readMask(nodeId, pixels, balance, opts);
  if (!health.usable) {
    const fallback = synthesiseBorderCollision(nodeId, balance, maskPath, opts);
    return {
      ...fallback,
      health,
      note:
        `REFUSED mask ${maskPath} — ${health.problems.join(" · ")}. ` +
        `SYNTHESISED collision instead — walkable except the border; NOT an authored mask`,
    };
  }
  const advisory = health.problems.length > 0 ? ` · ${health.problems.join(" · ")}` : "";
  return {
    grid,
    source: "authored",
    maskPath,
    synthetic: false,
    health,
    note: `authored mask ${maskPath} — ${grid.cols}×${grid.rows} cells, ${health.blockedCells} blocked${advisory}`,
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
    // No file reached us, so there is no file to have a verdict about. `collisionFromMask` overwrites
    // this with the real verdict when it refuses a mask that DID decode.
    health: null,
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

/** Where the player will stand, and — when that is nowhere legal — the sentence saying so. */
export interface SpawnChoice {
  tile: { col: number; row: number };
  /**
   * Null when `tile` is genuinely walkable. Otherwise a printable sentence: the tile is a
   * last-resort placement inside geometry, and whatever put the player there has to be said out
   * loud rather than looking like an ordinary spawn.
   */
  problem: string | null;
}

/**
 * {@link firstWalkableTile} with its null made unswallowable.
 *
 * The defect this replaces: callers wrote `firstWalkableTile(grid, balance) ?? { col: 0, row: 0 }`,
 * and (0,0) is blocked on any bordered grid — so a broken mask spawned the player inside a wall,
 * unable to move, with nothing on screen saying why. A `??` cannot be written against this signature
 * because the failure is not represented as a missing value; it is represented as a sentence the
 * caller has to do something with.
 */
export function chooseSpawnTile(grid: CollisionGrid, balance: Balance): SpawnChoice {
  const found = firstWalkableTile(grid, balance);
  if (found) return { tile: found, problem: null };
  const tiles = tileGridSize(balance);
  return {
    tile: { col: Math.floor(tiles.cols / 2), row: Math.floor(tiles.rows / 2) },
    problem:
      `NO WALKABLE TILE at "${grid.nodeId}" — all ${tiles.cols}×${tiles.rows} tiles are blocked by ` +
      `the ${grid.cols}×${grid.rows}-cell mask (${blockedCount(grid)} cells blocked). The player is ` +
      `standing in geometry and cannot move.`,
  };
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
