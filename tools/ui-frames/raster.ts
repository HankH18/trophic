/**
 * tools/ui-frames/raster.ts — a byte canvas and the pixel primitives the frames are drawn from.
 *
 * WHY THIS IS HAND-RASTERISED AND NOT GENERATED
 * ─────────────────────────────────────────────
 * Every other art class in this repo comes out of `tools/comfy` and a diffusion model. A UI frame
 * must not: it is geometry, it has to land on an EXACT pixel size (`tools/comfy/manifest.json`
 * pins six of them), it has to nine-slice against real text, and a diffusion model cannot hit any
 * of the three. `assets/reference/gen2/violet-city-gs.png` at native resolution shows what the
 * target actually is — a hard 1px keyline, a flat fill, one inner line, and nothing anti-aliased —
 * and that is four rectangle operations, not a generation.
 *
 * NO RANDOMNESS ANYWHERE (G11). The one place a generator would normally reach for a seed is the
 * dither, and this file uses an ORDERED dither instead: {@link dither} is a pure function of (x, y),
 * so the output is byte-identical on every run without a seed, an RNG stream or a `Math.random` to
 * ban. `core/rng.ts` is deliberately not imported — there is nothing here for it to do.
 *
 * ALPHA IS TWO-VALUED. A pixel is opaque or it is absent. Nothing here can emit a partial alpha,
 * because a soft edge is the single most reliable way to make a pixel-art frame read as a modern
 * flat-design panel (EVAL-STANDARD §1.6: soft drop shadows are a fail, a hard dark edge is right).
 */

/** `[r, g, b, a]`, each 0–255. `a` is only ever 0 or 255 — see the header. */
export type Rgba = readonly [number, number, number, number];

/**
 * The absence of a pixel — a prop's exterior, and anything a frame deliberately does not paint.
 *
 * The UI plates are fully opaque and square-cornered: the first cut chamfered them, and looking at
 * the result at 1× the missing corner pixel read as damage rather than as a rounding. Gold does not
 * chamfer either — see the note on `plate()` in `frames.ts`.
 */
export const CLEAR: Rgba = [0, 0, 0, 0];

/** `"#rrggbb"` → opaque `Rgba`. Throws rather than silently painting black on a typo. */
export function rgba(hex: string): Rgba {
  const match = /^#([0-9a-fA-F]{6})$/u.exec(hex);
  if (!match?.[1]) throw new Error(`tools/ui-frames: "${hex}" is not a #rrggbb colour`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 0xff];
}

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly px: Uint8Array;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(`tools/ui-frames: bad canvas size ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.px = new Uint8Array(width * height * 4);
  }

  /** Out-of-bounds writes are dropped, so a frame builder can draw past an edge without guarding. */
  set(x: number, y: number, colour: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.px[i] = colour[0];
    this.px[i + 1] = colour[1];
    this.px[i + 2] = colour[2];
    this.px[i + 3] = colour[3];
  }

  get(x: number, y: number): Rgba {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return CLEAR;
    const i = (y * this.width + x) * 4;
    return [this.px[i] ?? 0, this.px[i + 1] ?? 0, this.px[i + 2] ?? 0, this.px[i + 3] ?? 0];
  }

  fillRect(x: number, y: number, w: number, h: number, colour: Rgba): void {
    for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) this.set(x + dx, y + dy, colour);
  }

  /** A 1px outline ON the given rect — the rect's own edge pixels, not outside them. */
  strokeRect(x: number, y: number, w: number, h: number, colour: Rgba): void {
    this.hline(x, y, w, colour);
    this.hline(x, y + h - 1, w, colour);
    this.vline(x, y, h, colour);
    this.vline(x + w - 1, y, h, colour);
  }

  hline(x: number, y: number, w: number, colour: Rgba): void {
    for (let dx = 0; dx < w; dx += 1) this.set(x + dx, y, colour);
  }

  vline(x: number, y: number, h: number, colour: Rgba): void {
    for (let dy = 0; dy < h; dy += 1) this.set(x, y + dy, colour);
  }

  /** Every distinct RGBA the canvas holds, as `r,g,b,a` keys. The colour-count check reads this. */
  colours(): Set<string> {
    const seen = new Set<string>();
    for (let i = 0; i < this.px.length; i += 4) {
      seen.add(`${this.px[i]},${this.px[i + 1]},${this.px[i + 2]},${this.px[i + 3]}`);
    }
    return seen;
  }
}

/**
 * The ordered dither used for an EMPTY recess — the portrait well before art lands in it, and the
 * sign card's grain.
 *
 * `level` 1 lights one pixel in four, 2 lights one in two (a true checkerboard), 3 lights three in
 * four. Gold's ground tiles are exactly this: a sparse regular pattern of single pixels, never a
 * gradient and never noise. A recess left as a flat block reads as a colour swatch; dithered, it
 * reads as an empty slot waiting for a sprite.
 *
 * PURE IN (x, y). No state, no seed, no RNG — which is why this file imports nothing (G11).
 */
export function dither(x: number, y: number, level: 1 | 2 | 3): boolean {
  const cell = ((x & 1) << 1) | (y & 1); // 0..3, a 2×2 Bayer cell
  if (level === 2) return ((x + y) & 1) === 0;
  if (level === 1) return cell === 0;
  return cell !== 3;
}

/** Fill a rect with a dithered mix: `on` where {@link dither} lights, `off` elsewhere. */
export function ditherRect(
  c: Canvas,
  x: number,
  y: number,
  w: number,
  h: number,
  on: Rgba,
  off: Rgba,
  level: 1 | 2 | 3 = 1,
): void {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      c.set(x + dx, y + dy, dither(x + dx, y + dy, level) ? on : off);
    }
  }
}

/** Blit `src` onto `dst` at (x, y). Transparent source pixels are skipped, not composited. */
export function blit(dst: Canvas, src: Canvas, x: number, y: number): void {
  for (let dy = 0; dy < src.height; dy += 1) {
    for (let dx = 0; dx < src.width; dx += 1) {
      const p = src.get(dx, dy);
      if (p[3] === 0) continue;
      dst.set(x + dx, y + dy, p);
    }
  }
}

/** Nearest-neighbour integer upscale. The only scaling this lane ever does (build-doc §7.6). */
export function scale(src: Canvas, factor: number): Canvas {
  const out = new Canvas(src.width * factor, src.height * factor);
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const p = src.get(x, y);
      out.fillRect(x * factor, y * factor, factor, factor, p);
    }
  }
  return out;
}

/**
 * Draw a 1-bit glyph grid — rows of `#` (on) and anything else (off) — at an integer scale.
 *
 * Used only by the title wordmark. Body text is NOT drawn this way: the game renders it with
 * Phaser's `add.text`, and a contact sheet that drew it in a hand-made font would be a picture of a
 * UI the code lane cannot build. See `tools/ui-frames/text.ts`.
 */
export function drawGlyph(
  c: Canvas,
  rows: readonly string[],
  x: number,
  y: number,
  colour: Rgba,
  factor = 1,
): void {
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx += 1) {
      if (row[rx] !== "#") continue;
      c.fillRect(x + rx * factor, y + ry * factor, factor, factor, colour);
    }
  });
}

/**
 * Nine-slice a frame texture to an arbitrary size.
 *
 * The four `slice`×`slice` corners are copied 1:1; the four edges and the middle are TILED from the
 * source's corresponding strip. Tiling rather than stretching is deliberate and is safe here for a
 * checked reason: `render.ts` verifies that every edge strip of every nine-sliced frame is
 * translation-invariant, so tiling and stretching produce identical pixels and an implementer
 * cannot get a different frame by picking the other mode. It is also the only mode that survives a
 * non-integer scale without resampling, and `pixelArt: true` means nothing here may ever resample.
 *
 * This is the reference implementation of what the code lane's widget must do. It lives in the tool
 * so the contact sheet shows the frame at the size the WIDGET will draw it — 464×68 for the
 * dialogue box, 150×46 for a combatant card — and not at the size the PNG happens to be.
 */
export function nineSlice(src: Canvas, width: number, height: number, slice: number): Canvas {
  if (width < slice * 2 || height < slice * 2) {
    throw new Error(
      `tools/ui-frames: cannot nine-slice ${src.width}×${src.height} down to ${width}×${height} ` +
        `with a ${slice}px corner — the corners would overlap.`,
    );
  }
  const out = new Canvas(width, height);
  const srcMidW = src.width - slice * 2;
  const srcMidH = src.height - slice * 2;
  const dstMidW = width - slice * 2;
  const dstMidH = height - slice * 2;

  /** Source coordinate for a destination coordinate on one axis. */
  const map = (d: number, dstLen: number, srcLen: number, srcMid: number): number => {
    if (d < slice) return d;
    if (d >= dstLen - slice) return srcLen - (dstLen - d);
    return slice + ((d - slice) % srcMid);
  };

  for (let y = 0; y < height; y += 1) {
    const sy = map(y, height, src.height, srcMidH);
    for (let x = 0; x < width; x += 1) {
      const sx = map(x, width, src.width, srcMidW);
      out.set(x, y, src.get(sx, sy));
    }
  }
  void dstMidW;
  void dstMidH;
  return out;
}
