/**
 * tools/overlay-diff/edges.ts — the edge extraction half of build-doc §8.2.
 *
 * §8.2: "threshold both base map and candidate year variant to walkability-relevant edges (Sobel on
 * luminance), dilate 2px, compute IoU of edge maps restricted to the walkable cells of the collision
 * mask. Accept iff IoU ≥ 0.85 (tunable)."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE READING OF `balance.overlayDiff.sobelThreshold` — and why it changed.
 * ─────────────────────────────────────────────────────────────────────────────
 * §8.2 does not say what the number is a fraction OF, so the reading has to be stated somewhere.
 * The first version of this file read it as a fraction of the operator's theoretical full scale
 * (|G| ≤ 4√2 for luminance in [0, 1]) and that reading was measured to be wrong twice over:
 *
 *   · An edge then required a luminance step of ΔL ≥ 0.3557 IN A SINGLE PIXEL. A dark-brown
 *     building (lum 0.225) on mid-green ground (lum 0.518) is ΔL = 0.293 and produced *zero* edge
 *     pixels, so moving that building scored IoU exactly 1.0000 and was ACCEPTED. Measured on a
 *     1024² synthetic town with those exact colours: move one building 32px → IoU 1.0000.
 *   · The edge set moved with overall BRIGHTNESS. Measured on assets/approved-trials/town-map.png
 *     with the layout byte-identical, mask restricted: a global ×0.90 tint alone scored 0.8197 and
 *     was REJECTED, and an ordinary aged pass (tint ×0.94 + grain + rot blotches) scored 0.8220 and
 *     was REJECTED. Bible §6's aging arcs ARE tone passes, so the gate was on course to reject
 *     every legitimate year variant and leave `yearVariants` empty forever.
 *
 * Both are the same defect: an ABSOLUTE threshold on a quantity that has no absolute meaning.
 * The reading now is:
 *
 *     the luminance field is first normalised to the image's OWN contrast range (robust 1st/99th
 *     percentiles), and `sobelThreshold` is a fraction of full scale ON THAT NORMALISED FIELD.
 *
 * So `sobelThreshold: 0.25` still reads as "a quarter of full-scale contrast" — the phrase the
 * tunable was written for — but "full scale" now means the contrast this painting actually uses
 * instead of a black-to-white step the painting never contains. Two consequences, both measured on
 * the real map: a linear tint of ANY depth is now exactly invariant (×0.90 scores 0.9977, ×0.80
 * scores 0.9970, where before they scored 0.8186 and 0.6110), and structure a painting renders at
 * modest contrast now registers as an edge instead of vanishing.
 *
 * What this does NOT fix, and does not pretend to: a monotone-but-non-linear repaint (palette
 * quantisation of a dimmed map, for instance) still moves the edge set, because banding is real
 * structure. See tests/unit/overlay-diff.test.ts, which measures that on five real 1024² maps.
 *
 * Everything here is a pure function over typed arrays: no image library, no disk, no configuration
 * beyond the numbers passed in, so the self-test in tests/unit/overlay-diff.test.ts can construct
 * its own synthetic pairs and know exactly what it is measuring.
 */
import type { Raster } from '../postprocess/raster.ts';
import { CHANNELS } from '../postprocess/raster.ts';

/** Rec. 709 luminance in [0, 1]. Alpha is composited over white — a map has none, a test fixture might. */
export function luminance(src: Raster): Float32Array {
  const out = new Float32Array(src.width * src.height);
  for (let p = 0, i = 0; i < src.data.length; i += CHANNELS, p++) {
    const a = src.data[i + 3]! / 255;
    const r = (src.data[i]! * a + 255 * (1 - a)) / 255;
    const g = (src.data[i + 1]! * a + 255 * (1 - a)) / 255;
    const b = (src.data[i + 2]! * a + 255 * (1 - a)) / 255;
    out[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return out;
}

/** Max |G| for a 3×3 Sobel over a signal in [0, 1]: |Gx| ≤ 4, |Gy| ≤ 4, so |G| ≤ 4√2. */
export const SOBEL_MAX = 4 * Math.SQRT2;

/**
 * The three numbers below are properties of the ESTIMATOR, not gameplay tunables, which is why
 * they live here rather than in data/balance.json (G11 is about gameplay constants; the Rec. 709
 * coefficients above and mask.ts's 0.5 encoding midpoint are in the same family).
 *
 *   · LUMINANCE_STEP — one 8-bit code step. An image whose whole contrast range is under one code
 *     step carries no structure that survived encoding, so it has no edges by definition.
 *   · CONTRAST_TAIL — the fraction ignored at each end when measuring an image's own range, so a
 *     handful of specular or crushed pixels cannot set the scale for the whole frame. At 1024² this
 *     is ~10 486 pixels per tail.
 *   · CONTRAST_BINS — the histogram resolution the percentiles are read at. 256 matches the source's
 *     own 8-bit precision, and a histogram is O(n) where a sort is O(n log n) on a million pixels.
 */
export const LUMINANCE_STEP = 1 / 255;
export const CONTRAST_TAIL = 0.01;
export const CONTRAST_BINS = 256;

export interface ContrastRange {
  /** Luminance at the low tail. */
  lo: number;
  /** Luminance at the high tail. */
  hi: number;
  /** hi − lo: the contrast this image actually uses. */
  range: number;
  /** True when the range is under one 8-bit code step — the image carries no structure. */
  flat: boolean;
}

/**
 * The contrast an image actually uses, measured robustly. Percentiles rather than min/max: a single
 * blown-out pixel would otherwise set the scale for a million of its neighbours.
 *
 * `within` restricts the population the percentiles are read from — see `edgeMap`. Pixels outside it
 * are still normalised by the resulting range; they simply do not get a vote on what the range is.
 */
export function contrastRange(
  lum: Float32Array,
  tail: number = CONTRAST_TAIL,
  within?: Uint8Array,
): ContrastRange {
  const hist = new Uint32Array(CONTRAST_BINS);
  const top = CONTRAST_BINS - 1;
  let n = 0;
  for (let i = 0; i < lum.length; i++) {
    if (within && !within[i]) continue;
    n++;
    const v = lum[i]!;
    const b = v <= 0 ? 0 : v >= 1 ? top : Math.round(v * top);
    hist[b] = (hist[b] ?? 0) + 1;
  }
  if (n === 0) return { lo: 0, hi: 0, range: 0, flat: true };
  const want = Math.min(n - 1, Math.floor(tail * n));
  let seen = 0;
  let loBin = 0;
  for (let b = 0; b <= top; b++) {
    seen += hist[b] ?? 0;
    if (seen > want) {
      loBin = b;
      break;
    }
  }
  seen = 0;
  let hiBin = top;
  for (let b = top; b >= 0; b--) {
    seen += hist[b] ?? 0;
    if (seen > want) {
      hiBin = b;
      break;
    }
  }
  const lo = loBin / top;
  const hi = hiBin / top;
  const range = hi - lo;
  return { lo, hi, range, flat: range < LUMINANCE_STEP };
}

/**
 * Stretch a luminance field onto a contrast range. NOT clamped, and that is load-bearing.
 *
 * The percentiles exist to set the SCALE robustly — so a handful of specular pixels cannot decide
 * the gain for a million neighbours — not to delete the content outside them. Clamping did delete
 * it, and with a mask-restricted range (see `edgeMap`) it deleted a lot: on the synthetic town the
 * walkable range is ground .471 → path .902, so a hut at luminance .078 clamped to exactly the same
 * 0 as the ground it stands on. Its outline vanished, and a hut MOVED BY ONE COLLISION CELL scored
 * IoU 1.0000 and was ACCEPTED — the gate's headline failure mode, reintroduced by a clamp.
 *
 * Unclamped, a value below `lo` is simply negative and a value above `hi` is above 1; the Sobel
 * magnitude that follows is a difference of neighbours, so it neither knows nor cares, and
 * `sobelThreshold` keeps meaning "this fraction of the contrast the image actually uses".
 */
export function contrastNormalise(lum: Float32Array, cr: ContrastRange): Float32Array {
  const out = new Float32Array(lum.length);
  if (cr.flat) return out;
  const inv = 1 / cr.range;
  for (let i = 0; i < lum.length; i++) out[i] = (lum[i]! - cr.lo) * inv;
  return out;
}

/**
 * Sobel magnitude, normalised to [0, 1]. Border pixels are computed with edge clamping rather than
 * skipped: a variant that differs only at the frame would otherwise score identically to one that
 * does not, and the frame of a map is exactly where a drifted layout shows first.
 */
export function sobelMagnitude(lum: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return lum[cy * width + cx]!;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = at(x - 1, y - 1);
      const tc = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const ml = at(x - 1, y);
      const mr = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const bc = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
      out[y * width + x] = Math.sqrt(gx * gx + gy * gy) / SOBEL_MAX;
    }
  }
  return out;
}

/** Threshold a normalised magnitude field into a binary edge map. */
export function thresholdEdges(mag: Float32Array, threshold: number): Uint8Array {
  const out = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) out[i] = mag[i]! >= threshold ? 1 : 0;
  return out;
}

/**
 * Square (Chebyshev) dilation by `radius` pixels — §8.2's "dilate 2px".
 *
 * Separated into a horizontal then a vertical pass, which is exact for a square element and turns
 * an O(w·h·r²) operation into O(w·h·r); at 1024² with r=2 that is the difference between a tool you
 * run on 28 variants and one you avoid running.
 */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return Uint8Array.from(mask);
  const mid = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let hit = 0;
      const lo = Math.max(0, x - radius);
      const hi = Math.min(width - 1, x + radius);
      for (let k = lo; k <= hi; k++) {
        if (mask[row + k]) {
          hit = 1;
          break;
        }
      }
      mid[row + x] = hit;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let hit = 0;
      const lo = Math.max(0, y - radius);
      const hi = Math.min(height - 1, y + radius);
      for (let k = lo; k <= hi; k++) {
        if (mid[k * width + x]) {
          hit = 1;
          break;
        }
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}

export interface EdgeOptions {
  sobelThreshold: number;
  dilatePx: number;
}

/**
 * §8.2's first clause, end to end: luminance → normalise to the image's own contrast range →
 * Sobel → threshold → dilate.
 *
 * A flat image returns an empty edge map rather than "every pixel is an edge": with no contrast
 * there is nothing for the normalisation to stretch, and diff.ts REJECTS an empty union rather than
 * scoring it 1.0, so a blank generation still fails loudly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `walkable` — WHY THE RANGE IS MEASURED OVER THE MASK, AND NOT OVER THE FRAME.
 * ─────────────────────────────────────────────────────────────────────────────
 * The gain applied here is `1 / contrastRange(...).range`, and a gain is global: change any pixel
 * enough to move the 1st/99th percentiles and EVERY gradient in the frame is rescaled. Measured on
 * `assets/approved-trials/town-map.png`: a 64×64 pure-white patch — 4096 px, 0.39% of the frame,
 * under the 1% CONTRAST_TAIL, so the percentiles do not reject it — moved `range` 0.7294 → 0.7961
 * and changed 21 062 edge pixels OUTSIDE the patch (9.7% of the far field); a 128×128 patch changed
 * 20.7% of the far field and dropped the whole-frame IoU to 0.7870.
 *
 * §8.2 restricts the COMPARISON to the walkable cells. If the statistic that calibrates the
 * comparison is measured over the whole frame, the restriction does not restrict: a change confined
 * entirely to BLOCKED cells — Cindershelf's "vents flare" (bible §6) is exactly that, vents and
 * buildings are the blocked cells — moves the edge map inside the walkable cells and the variant is
 * rejected with the layout byte-identical. Measured: a soft glow (radius 96, strength 0.30) inside a
 * blocked corner, with every walkable pixel byte-identical, scored IoU 0.9535 and REJECTED.
 *
 * So the range is read from the same population the IoU is: when a mask is supplied, only walkable
 * pixels vote. Blocked pixels are still normalised (and still Sobelled) with that range, because a
 * building's OUTLINE is the boundary between blocked and walkable and it must keep registering — but
 * repainting the inside of a building can no longer reach across the map. Tint invariance (B-D23) is
 * untouched: a linear tint scales the walkable range exactly as it scales the whole-frame one.
 *
 * With no mask, `within` is undefined and this is the whole frame, exactly as before.
 */
export function edgeMap(src: Raster, opts: EdgeOptions, walkable?: Uint8Array): Uint8Array {
  const lum = luminance(src);
  const cr = contrastRange(lum, CONTRAST_TAIL, walkable);
  if (cr.flat) return new Uint8Array(src.width * src.height);
  const mag = sobelMagnitude(contrastNormalise(lum, cr), src.width, src.height);
  return dilate(thresholdEdges(mag, opts.sobelThreshold), src.width, src.height, opts.dilatePx);
}
