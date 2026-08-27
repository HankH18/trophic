/**
 * tools/mapgen/render.ts — one layout, two images.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE MASK GOES THROUGH THE ENGINE'S OWN ENCODER. NOT A SECOND ONE.
 * ═════════════════════════════════════════════════════════════════════════════
 * `maskRasterFrom(grid, balance)` (game/collision.ts:273) is the declared inverse of `sampleMask`.
 * It writes `balance.map.mapNativePx`² RGBA, ink 0 on a blocked cell and 255 on a walkable one,
 * **alpha 255 on every pixel**. This file calls it and hands the bytes to `writeRaster`; it does not
 * decide what a mask looks like, and there is deliberately no second implementation here that could
 * come to disagree with the engine about a wall.
 *
 * The alpha matters more than it looks. `readMask` sets `usable: false` if ANY pixel has
 * `alpha * 2 <= 255`, and the message it prints says why: `game/collision.ts` reads an unpainted
 * pixel as WALKABLE (`pixelIsBlocked` returns false on low alpha) while `tools/overlay-diff/mask.ts`
 * reads it as BLOCKED (`MASK_ENCODING.transparentIsBlocked`). A mask with one transparent pixel is a
 * file the game and the Hard Req 5 gate disagree about, so the loader refuses it and falls back to
 * the synthesised border grid. That refusal is the polarity conflict `tools/collision-editor/`
 * exists to arbitrate, and it is why `writeRaster` is given four channels and never three.
 *
 * The sampler's defaults are what ships: `OverworldScene.buildNodeView` calls `loadCollision(...)`
 * with no options, so `sampleMask` falls to `polarity: 'dark-blocks'` and `policy: 'majority'`.
 * `dark-blocks` is what makes ink-0 mean blocked; `majority` is what makes a cell's verdict the
 * verdict of most of its pixels. Because `maskRasterFrom` paints every pixel of a cell the same
 * value, majority and any agree here — which is exactly why the round trip is exact.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE CONTROL IMAGE
 * ═════════════════════════════════════════════════════════════════════════════
 * A ControlNet conditioning image is read as flat regions with hard edges, so this one is a
 * nearest-neighbour blow-up of the character grid: one legend colour per cell, no blending, no
 * anti-aliasing, no gradient anywhere. Same size as the mask and as the painted map, so the three
 * line up pixel for pixel and a reviewer can flip between them.
 */

import { maskRasterFrom } from '../../game/collision.ts';
import type { Balance } from '../../core/types.ts';
import { readRaster, writeRaster, type Raster } from '../postprocess/raster.ts';
import { controlColourOf, legendIndex } from './legend.ts';
import { charAt, collisionGridOf, type LayoutDoc } from './layout.ts';

export class RenderError extends Error {}

/** The mask raster for a layout — the engine's encoder, unmodified. */
export function maskRasterOf(doc: LayoutDoc, balance: Balance): Raster {
  const pixels = maskRasterFrom(collisionGridOf(doc), balance);
  if (pixels.channels !== 4) {
    throw new RenderError(
      `maskRasterFrom returned ${pixels.channels ?? '?'} channels; a collision mask must carry alpha, ` +
        `because readMask refuses a file with any pixel at or below half alpha`,
    );
  }
  // `MaskPixels.data` is `ArrayLike<number>` on purpose — a browser `ImageData`, a test literal and
  // a canvas buffer all satisfy it. `Raster.data` is the concrete `Uint8ClampedArray` the whole art
  // lane shares, so narrow rather than assert: `maskRasterFrom` allocates a Uint8ClampedArray today
  // and the copy is a no-op cost against the certainty.
  const data =
    pixels.data instanceof Uint8ClampedArray ? pixels.data : Uint8ClampedArray.from(pixels.data as ArrayLike<number>);
  return { width: pixels.width, height: pixels.height, data };
}

/**
 * The ControlNet conditioning image: the character grid, flat, at map-native resolution.
 *
 * The scale is derived rather than assumed — `mapNativePx / cols` is the same `cellPx` the layout is
 * authored against — so a retune of either moves the image and the layout together.
 */
export function controlRasterOf(doc: LayoutDoc, balance: Balance): Raster {
  const side = Math.floor(balance.map.mapNativePx);
  const index = legendIndex(doc.legend);
  const data = new Uint8ClampedArray(side * side * 4);
  for (let y = 0; y < side; y += 1) {
    const row = Math.min(doc.dims.rows - 1, Math.floor((y * doc.dims.rows) / side));
    for (let x = 0; x < side; x += 1) {
      const col = Math.min(doc.dims.cols - 1, Math.floor((x * doc.dims.cols) / side));
      const entry = index.get(charAt(doc, col, row));
      const [r, g, b] = entry ? entry.control : controlColourOf('unknown', doc.legend);
      const at = (y * side + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    }
  }
  return { width: side, height: side, data };
}

export async function writeControl(path: string, doc: LayoutDoc, balance: Balance): Promise<void> {
  await writeRaster(path, controlRasterOf(doc, balance));
}

export async function writeMask(path: string, doc: LayoutDoc, balance: Balance): Promise<void> {
  await writeRaster(path, maskRasterOf(doc, balance));
}

/**
 * Read a mask PNG back as the engine's `MaskPixels`. Used by the tests to prove the file on disk —
 * not just the in-memory buffer — survives `readMask` with `usable: true`.
 */
export async function readMaskPixelsFromDisk(path: string): Promise<{
  width: number;
  height: number;
  data: Uint8ClampedArray;
  channels: number;
}> {
  const raster = await readRaster(path);
  return { width: raster.width, height: raster.height, data: raster.data, channels: 4 };
}
