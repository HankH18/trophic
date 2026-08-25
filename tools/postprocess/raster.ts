/**
 * tools/postprocess/raster.ts — the one image representation the whole art lane shares.
 *
 * Everything downstream of here is a PURE FUNCTION `Raster -> Raster`. That is the property
 * build-doc §9.3 is actually asking for when it says "every step idempotent and re-runnable from
 * raw/": a step that reaches out to the filesystem, or that carries state between calls, cannot be
 * shown idempotent, only asserted to be. Only the two functions at the bottom of this file touch
 * disk, and they are the only place `sharp` is imported in the chain.
 *
 * RGBA, 8 bits per channel, row-major, no stride padding. `data.length === width * height * 4`.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Raster {
  width: number;
  height: number;
  /** RGBA, row-major, length === width * height * 4. */
  data: Uint8ClampedArray;
}

export const CHANNELS = 4;

export class RasterError extends Error {}

/** Allocate a fully transparent raster. */
export function blankRaster(width: number, height: number): Raster {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RasterError(`blankRaster: bad size ${width}x${height}`);
  }
  return { width, height, data: new Uint8ClampedArray(width * height * CHANNELS) };
}

export function cloneRaster(src: Raster): Raster {
  return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
}

/** Byte-for-byte equality, used by the idempotency tests and by the write-if-changed path. */
export function rastersEqual(a: Raster, b: Raster): boolean {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

export function assertWellFormed(r: Raster, where: string): void {
  if (r.data.length !== r.width * r.height * CHANNELS) {
    throw new RasterError(`${where}: raster is ${r.width}x${r.height} but carries ${r.data.length} bytes`);
  }
}

/** Index of pixel (x, y)'s red byte. Callers add 1/2/3 for G/B/A. */
export function idx(r: Raster, x: number, y: number): number {
  return (y * r.width + x) * CHANNELS;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Disk I/O — the only impure functions in the post-process chain.
 * ──────────────────────────────────────────────────────────────────────────── */

export async function readRaster(path: string): Promise<Raster> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== CHANNELS) {
    throw new RasterError(`readRaster(${path}): expected RGBA, got ${info.channels} channels`);
  }
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

/**
 * Write a PNG. The encoder options are pinned rather than left to sharp's defaults because
 * "running twice gives identical bytes" (§10.4) is only true if the encoder is told to be
 * deterministic: adaptive filtering picks a per-row filter from image content, and libvips'
 * palette path runs a quantizer, so both are turned off. The pixels are already quantized to
 * `data/palette.json` by then — re-quantizing in the encoder would be a second, unrecorded palette.
 */
export async function writeRaster(path: string, r: Raster): Promise<void> {
  assertWellFormed(r, `writeRaster(${path})`);
  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength), {
    raw: { width: r.width, height: r.height, channels: CHANNELS },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toFile(path);
}
