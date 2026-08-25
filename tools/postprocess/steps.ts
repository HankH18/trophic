/**
 * tools/postprocess/steps.ts — build-doc §9.3's chain, one pure function per step.
 *
 *   §9.3, per sprite: (1) nearest-neighbour downscale to target · (2) quantize to palette.json
 *                     (3) background removal · (4) pack to atlases.
 *   §9.3, maps:       downscale to 1024² retained, quantize, NO background removal.
 *
 * Steps 1–3 live here; step 4 (atlas packing) is `atlas.ts`, because it is many→one.
 *
 * IDEMPOTENCE is the property these are written for, and each step earns it structurally rather
 * than by inspection:
 *
 *   trim       — the bbox it returns is minimal, so every edge of the result holds at least one
 *                non-background pixel; the second run therefore computes the full frame and
 *                returns the input unchanged.
 *   downscale  — target == source size is the identity mapping (floor(x·w/w) === x), so re-running
 *                a file already at target does nothing at all.
 *   quantize   — every palette colour is its own nearest palette colour at distance 0, and ties
 *                break to the lowest index, so the second pass is a fixed point.
 *   removeBg   — an already-transparent pixel counts as background, so the second pass seeds the
 *                same border set, finds the same connected region, and writes the same bytes.
 *
 * THE BACKGROUND KEY IS DECLARED, NOT SAMPLED, and that is what buys trim and removeBg their
 * idempotence. An earlier draft took the key from the median border colour; that is unstable under
 * its own output (after a tight trim the border is mostly SUBJECT, so the sampled key becomes a
 * subject colour and the second pass eats the sprite) and it silently mangles a pale creature on
 * white. The key is white because every prompt in the manifest ends in `plain white background` —
 * the §9.2 skeleton, verbatim — so it is a fact about the generator, recorded per class in
 * `classes.<c>.postprocess.backgroundKey`. `sampleBackgroundKey` stays for diagnostics.
 *
 * A step that is only "probably" idempotent gets re-run by a human at 3am and silently erodes an
 * asset one pass at a time; these are re-run by a batch runner that has no idea what it is looking
 * at, so the property has to hold by construction.
 */
import type { Raster } from './raster.ts';
import { CHANNELS, RasterError, assertWellFormed, blankRaster, cloneRaster, idx } from './raster.ts';
import type { PaletteRgb } from './palette.ts';

/* ════════════════════════════════════════════════════════════════════════════
 * Step 0 (addition — see the deviation note in tools/comfy/manifest.json `_deviations`)
 * Trim the flat generated background to the subject's bounding box.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface BackgroundOptions {
  /** The declared flat background colour — see the header. */
  key: Rgb;
  /** Per-channel tolerance, 0–255. */
  tolerance: number;
}

/** White: what `plain white background` in every §9.2 prompt skeleton produces. */
export const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/**
 * DIAGNOSTIC ONLY — the median border colour. Useful for answering "what did this generation
 * actually put behind the subject", never for driving trim or removal; see the header for why.
 */
export function sampleBackgroundKey(src: Raster): Rgb {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const consider = (x: number, y: number) => {
    const i = idx(src, x, y);
    if (src.data[i + 3]! === 0) return;
    rs.push(src.data[i]!);
    gs.push(src.data[i + 1]!);
    bs.push(src.data[i + 2]!);
  };
  for (let x = 0; x < src.width; x++) {
    consider(x, 0);
    consider(x, src.height - 1);
  }
  for (let y = 0; y < src.height; y++) {
    consider(0, y);
    consider(src.width - 1, y);
  }
  if (rs.length === 0) return WHITE;
  const mid = (xs: number[]) => {
    xs.sort((a, b) => a - b);
    return xs[(xs.length - 1) >> 1]!;
  };
  return { r: mid(rs), g: mid(gs), b: mid(bs) };
}

function isBackgroundPixel(src: Raster, i: number, key: Rgb, tol: number): boolean {
  if (src.data[i + 3]! === 0) return true;
  return (
    Math.abs(src.data[i]! - key.r) <= tol &&
    Math.abs(src.data[i + 1]! - key.g) <= tol &&
    Math.abs(src.data[i + 2]! - key.b) <= tol
  );
}

/**
 * Crop away the uniform border. Returns the source unchanged when nothing is trimmable, so
 * `trim(trim(x))` is `trim(x)`; returns a 1×1 transparent raster for an entirely blank input
 * rather than throwing, because a failed generation must not crash a 288-row batch.
 */
export function trimBackground(src: Raster, opts: BackgroundOptions): Raster {
  assertWellFormed(src, 'trimBackground');
  const key = opts.key;
  let minX = src.width;
  let minY = src.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (isBackgroundPixel(src, idx(src, x, y), key, opts.tolerance)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return blankRaster(1, 1);
  if (minX === 0 && minY === 0 && maxX === src.width - 1 && maxY === src.height - 1) return cloneRaster(src);
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = blankRaster(w, h);
  for (let y = 0; y < h; y++) {
    const from = idx(src, minX, y + minY);
    out.data.set(src.data.subarray(from, from + w * CHANNELS), y * w * CHANNELS);
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Step 1 — nearest-neighbour downscale to target (§9.3)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Nearest-neighbour resample to exactly `width`×`height`.
 *
 * Nearest-neighbour, not a filtered resize, because the whole point of §9.3 is to land on a pixel
 * grid: any interpolating kernel invents intermediate colours, which then get quantized to
 * whichever palette entry happens to be nearest and produces the fringe that reads as "AI upscale"
 * rather than as pixel art.
 */
export function nearestResample(src: Raster, width: number, height: number): Raster {
  assertWellFormed(src, 'nearestResample');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RasterError(`nearestResample: bad target ${width}x${height}`);
  }
  if (width === src.width && height === src.height) return cloneRaster(src);
  const out = blankRaster(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / width));
      const si = idx(src, sx, sy);
      const di = idx(out, x, y);
      out.data[di] = src.data[si]!;
      out.data[di + 1] = src.data[si + 1]!;
      out.data[di + 2] = src.data[si + 2]!;
      out.data[di + 3] = src.data[si + 3]!;
    }
  }
  return out;
}

/**
 * Resample into a target frame while preserving aspect ratio, centring what is left.
 *
 * Sprites are trimmed to their subject first, so their aspect ratio is whatever the generator felt
 * like; stretching a 700×1000 crop into 96×96 is the difference between a creature and a smear.
 * Padding is transparent, and the offsets are integer-floored so the result is deterministic.
 */
export function fitResample(src: Raster, width: number, height: number): Raster {
  assertWellFormed(src, 'fitResample');
  const scale = Math.min(width / src.width, height / src.height);
  const w = Math.max(1, Math.min(width, Math.floor(src.width * scale)));
  const h = Math.max(1, Math.min(height, Math.floor(src.height * scale)));
  const inner = nearestResample(src, w, h);
  if (w === width && h === height) return inner;
  const out = blankRaster(width, height);
  const ox = Math.floor((width - w) / 2);
  const oy = Math.floor((height - h) / 2);
  for (let y = 0; y < h; y++) {
    const from = idx(inner, 0, y);
    out.data.set(inner.data.subarray(from, from + w * CHANNELS), idx(out, ox, y + oy));
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Step 2 — quantize to data/palette.json (§9.3 / §8.4)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Snap every pixel's RGB to the nearest palette swatch by squared Euclidean distance, ties to the
 * lowest palette index. Alpha is carried through untouched: transparency is a mask, not a colour,
 * and the palette has no opinion about it.
 *
 * The palette is passed in rather than read here on purpose — `palette.ts` reads
 * `data/palette.json` from disk on every call so gate B0's freeze is a value swap in that file and
 * not an edit to this one.
 */
export function quantize(src: Raster, palette: readonly PaletteRgb[]): Raster {
  assertWellFormed(src, 'quantize');
  if (palette.length === 0) throw new RasterError('quantize: empty palette');
  const out = cloneRaster(src);
  // Memoise on the packed RGB: a quantized 96² sprite has at most 32 distinct colours, and even a
  // 1024² map collapses to a few tens of thousands of lookups instead of a million.
  const seen = new Map<number, number>();
  for (let i = 0; i < out.data.length; i += CHANNELS) {
    const r = out.data[i]!;
    const g = out.data[i + 1]!;
    const b = out.data[i + 2]!;
    const packed = (r << 16) | (g << 8) | b;
    let best = seen.get(packed);
    if (best === undefined) {
      let bestDist = Infinity;
      best = 0;
      for (let p = 0; p < palette.length; p++) {
        const sw = palette[p]!;
        const dr = r - sw.r;
        const dg = g - sw.g;
        const db = b - sw.b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      seen.set(packed, best);
    }
    const sw = palette[best]!;
    out.data[i] = sw.r;
    out.data[i + 1] = sw.g;
    out.data[i + 2] = sw.b;
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Step 3 — background removal (§9.3 "rembg"; see the deviation note)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Flood-fill the flat generated background from the border and clear it to transparent.
 *
 * §9.3 names `rembg`, a Python/ONNX salient-object segmenter. Every prompt in the manifest ends in
 * `plain white background` (the §9.2 skeleton, verbatim), so the background here is a known flat
 * key rather than an unknown photograph — which makes a border flood fill both exact and, unlike a
 * neural matte, deterministic and idempotent. That is logged as a deviation, not assumed.
 *
 * Flood-fill from the border rather than "clear every white pixel": a white highlight enclosed by
 * the subject is part of the subject, and keying on colour alone punches holes in eyes and teeth.
 */
export function removeFlatBackground(src: Raster, opts: BackgroundOptions): Raster {
  assertWellFormed(src, 'removeFlatBackground');
  const key = opts.key;
  const out = cloneRaster(src);
  const { width, height } = out;
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const cell = y * width + x;
    if (visited[cell]) return;
    if (!isBackgroundPixel(out, cell * CHANNELS, key, opts.tolerance)) return;
    visited[cell] = 1;
    stack.push(cell);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const cell = stack.pop()!;
    const x = cell % width;
    const y = (cell - x) / width;
    const i = cell * CHANNELS;
    // Zero the colour as well as the alpha so cleared pixels are byte-stable across runs.
    out.data[i] = 0;
    out.data[i + 1] = 0;
    out.data[i + 2] = 0;
    out.data[i + 3] = 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return out;
}
