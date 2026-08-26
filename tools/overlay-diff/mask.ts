/**
 * tools/overlay-diff/mask.ts — "restricted to the walkable cells of the collision mask" (§8.2).
 *
 * "CELLS", not pixels, and that word is load-bearing. `balance.map` says the mask is sampled on a
 * 16px grid — `collisionCols`/`collisionRows` 64×64 over a `mapNativePx` 1024² painting — so the
 * unit of walkability is the cell the player actually moves through, not the pixel. Restricting the
 * IoU per-pixel instead would let a variant drift the *inside* of a blocked building freely while
 * failing it for repainting the texture of a path, which is backwards.
 *
 * THE MASK ENCODING IS DECLARED HERE because nothing else in the repo declares it yet:
 * tools/collision-editor/ is an empty directory, and `data/nodes/*.json` only carries the path.
 *
 *     WHITE (luminance ≥ 0.5) and opaque  ⇒ WALKABLE
 *     black, or any transparent pixel     ⇒ BLOCKED
 *
 * A cell is walkable iff the majority of its pixels are. The mask may be authored at cell
 * resolution (64×64) or at map resolution (1024²) — both are read the same way, because the sampler
 * works in cell space and asks the mask for whatever pixels fall inside each cell. When the
 * collision editor lands it must either match this, or change it here and in one place only.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PREMISE THIS FILE RESTS ON IS NOT YET VERIFIED AGAINST A SHIPPED MASK. Say so.
 * ─────────────────────────────────────────────────────────────────────────────
 * There IS now a producer, and it agrees. `tools/collision-editor/` writes masks through
 * `game/collision.ts`'s `maskRasterFrom` — fully opaque black-and-white at `balance.map.mapNativePx`
 * — and `tests/unit/collision.test.ts` compares that raster against THIS file's `walkableCells`, so
 * the two readings are bound by a test rather than by two headers agreeing in prose. Measured
 * directly: an adversarial grid with 818 of 4096 cells blocked round-trips with 0 cells disagreeing,
 * byte-identically to `cellsToRaster(cells, grid, collisionCellPx)` below.
 *
 * What is STILL NOT verified, and it is the part the gate's numbers rest on: **not one** of the
 * twelve masks `data/nodes/*.json` names exists on disk, and neither do the twelve base maps —
 * `npx tsx tools/overlay-diff/run.ts --node=r1 --candidate=<png>` exits 2 on the base map before it
 * ever reaches a mask. So Hard Req 5 has never been measured against a mask a human drew for the art
 * it belongs to, and both of §8.2's criteria move with how generously a mask blocks: what the
 * restriction discards is what the gate cannot see (diff.ts), and how much of a displaced feature
 * lands in walkable cells decides whether it registers at all. Every number in diff.ts's header came
 * from a LUMINANCE-DERIVED STAND-IN mask over five palette-trial paintings.
 *
 * What IS verified from inside this directory:
 *   · the encoding round-trips through `cellsToRaster` → `walkableCells` at cell resolution;
 *   · a mask authored at 64×64 and the SAME mask authored at 1024² produce identical cell
 *     walkability and identical gate verdicts end to end — the "both are read the same way" claim
 *     above, which was previously only a sentence;
 *   · the whole gate runs against real mask FILES on disk, written in this encoding, at BOTH
 *     authoring resolutions, through `overlayDiffGate` (tests/unit/manifest.test.ts).
 * A test asserts that zero node masks exist, so the day one is authored it goes red and whoever is
 * there must re-measure.
 */
import type { Raster } from '../postprocess/raster.ts';
import { CHANNELS, idx } from '../postprocess/raster.ts';

export interface CellGrid {
  cols: number;
  rows: number;
}

export class MaskError extends Error {}

/**
 * The encoding, as data rather than as prose, so the collision editor can IMPORT it instead of
 * restating it. A second statement of a convention is a second thing that can drift.
 */
export const MASK_ENCODING = {
  /** Luminance at or above this, with a non-zero alpha, is walkable. */
  walkableLuminance: 0.5,
  /** Any fully transparent pixel is BLOCKED — "unpainted" is never "walk here". */
  transparentIsBlocked: true,
  /** A cell is walkable iff strictly more than half its sampled pixels are. */
  rule: 'majority' as const,
  walkableRgba: [255, 255, 255, 255] as const,
  blockedRgba: [0, 0, 0, 255] as const,
} as const;

/** Walkability per collision CELL, row-major, length cols × rows. */
export function walkableCells(mask: Raster, grid: CellGrid): Uint8Array {
  if (grid.cols <= 0 || grid.rows <= 0) throw new MaskError(`bad collision grid ${grid.cols}x${grid.rows}`);
  const out = new Uint8Array(grid.cols * grid.rows);
  for (let cy = 0; cy < grid.rows; cy++) {
    const y0 = Math.floor((cy * mask.height) / grid.rows);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * mask.height) / grid.rows));
    for (let cx = 0; cx < grid.cols; cx++) {
      const x0 = Math.floor((cx * mask.width) / grid.cols);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * mask.width) / grid.cols));
      let walkable = 0;
      let total = 0;
      for (let y = y0; y < Math.min(y1, mask.height); y++) {
        for (let x = x0; x < Math.min(x1, mask.width); x++) {
          const i = idx(mask, x, y);
          total++;
          if (mask.data[i + 3]! === 0) continue; // MASK_ENCODING.transparentIsBlocked
          const lum =
            (0.2126 * mask.data[i]! + 0.7152 * mask.data[i + 1]! + 0.0722 * mask.data[i + 2]!) / 255;
          if (lum >= MASK_ENCODING.walkableLuminance) walkable++;
        }
      }
      out[cy * grid.cols + cx] = total > 0 && walkable * 2 > total ? 1 : 0;
    }
  }
  return out;
}

/** Expand cell walkability to a per-pixel mask over a `width`×`height` map. */
export function walkablePixels(cells: Uint8Array, grid: CellGrid, width: number, height: number): Uint8Array {
  if (cells.length !== grid.cols * grid.rows) {
    throw new MaskError(`cell array is ${cells.length}, grid is ${grid.cols}x${grid.rows}`);
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const cy = Math.min(grid.rows - 1, Math.floor((y * grid.rows) / height));
    for (let x = 0; x < width; x++) {
      const cx = Math.min(grid.cols - 1, Math.floor((x * grid.cols) / width));
      out[y * width + x] = cells[cy * grid.cols + cx]!;
    }
  }
  return out;
}

/** Convenience: mask raster → per-pixel walkability over the map's own dimensions. */
export function walkableMaskFor(mask: Raster, grid: CellGrid, width: number, height: number): Uint8Array {
  return walkablePixels(walkableCells(mask, grid), grid, width, height);
}

/** A fully-walkable mask, for the degenerate "no mask authored yet" case. Always reported, never silent. */
export function allWalkable(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height).fill(1);
}

/**
 * Render a cell grid back to a raster in `MASK_ENCODING` — a debug view, and the reference PRODUCER
 * of the encoding until tools/collision-editor/ exists. `scale` writes the same mask at map
 * resolution instead of cell resolution; both must read back identically, and a test asserts it.
 */
export function cellsToRaster(cells: Uint8Array, grid: CellGrid, scale = 1): Raster {
  if (!Number.isInteger(scale) || scale < 1) throw new MaskError(`cellsToRaster: bad scale ${scale}`);
  if (cells.length !== grid.cols * grid.rows) {
    throw new MaskError(`cell array is ${cells.length}, grid is ${grid.cols}x${grid.rows}`);
  }
  const width = grid.cols * scale;
  const height = grid.rows * scale;
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let y = 0; y < height; y++) {
    const cy = Math.floor(y / scale);
    for (let x = 0; x < width; x++) {
      const cx = Math.floor(x / scale);
      const rgba = cells[cy * grid.cols + cx] ? MASK_ENCODING.walkableRgba : MASK_ENCODING.blockedRgba;
      const i = (y * width + x) * CHANNELS;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    }
  }
  return { width, height, data };
}
