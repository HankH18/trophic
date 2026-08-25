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
 */
import type { Raster } from '../postprocess/raster.ts';
import { CHANNELS, idx } from '../postprocess/raster.ts';

export interface CellGrid {
  cols: number;
  rows: number;
}

export class MaskError extends Error {}

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
          if (mask.data[i + 3]! === 0) continue;
          const lum =
            (0.2126 * mask.data[i]! + 0.7152 * mask.data[i + 1]! + 0.0722 * mask.data[i + 2]!) / 255;
          if (lum >= 0.5) walkable++;
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

/** Debug helper: render a cell grid back to a raster so a human can see what the tool read. */
export function cellsToRaster(cells: Uint8Array, grid: CellGrid): Raster {
  const data = new Uint8ClampedArray(grid.cols * grid.rows * CHANNELS);
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i] ? 255 : 0;
    data[i * CHANNELS] = v;
    data[i * CHANNELS + 1] = v;
    data[i * CHANNELS + 2] = v;
    data[i * CHANNELS + 3] = 255;
  }
  return { width: grid.cols, height: grid.rows, data };
}
