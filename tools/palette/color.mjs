/**
 * tools/palette/color.mjs — colour science + image sampling for the gate-B0 palette freeze.
 *
 * WHY LAB AND NOT RGB. build-doc §8.4 asks for "32 colors, k-means over the approved trial set".
 * k-means minimises squared distance in whatever space you hand it, and squared distance in sRGB
 * is not perceived error — it over-spends centroids on bright saturated regions and under-spends
 * on darks, which is exactly where sprite outlines live. Everything here works in CIELAB (D65),
 * where Euclidean distance is at least an approximation of perceived difference, and the reported
 * error is CIEDE2000, the current standard for "would a human see this".
 *
 * WHY THE BACKGROUND IS FLOOD-FILLED AND NOT THRESHOLDED. Every §9.2 prompt ends in
 * `plain white background`, so the backdrop is a known, flat, border-connected region. A plain
 * "drop anything near white" threshold would also eat legitimate content — the map's pale stone,
 * a sprite's eye highlight — and hand the k-means a palette with a hole where its lightest tones
 * should be. Border-connected flood fill drops the backdrop and nothing else. The 2px dilation
 * afterwards removes the anti-aliased rim, which is generator artefact rather than art: without
 * it a few thousand off-white halo pixels per sprite bid for palette slots that the actual
 * artwork needs.
 */
import sharp from 'sharp';

/* ── sRGB ⇄ CIELAB (D65 / 2°) ─────────────────────────────────────────────── */

const D65 = { x: 95.047, y: 100.0, z: 108.883 };

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB byte triple → {L,a,b}. */
export function rgbToLab(r, g, b) {
  const R = srgbToLinear(r) * 100, G = srgbToLinear(g) * 100, B = srgbToLinear(b) * 100;
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / D65.x;
  const y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / D65.y;
  const z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / D65.z;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const linearToSrgb = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/** {L,a,b} → sRGB byte triple, clipped to gamut. Used to turn a centroid back into a swatch. */
export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (f) => (f ** 3 > 216 / 24389 ? f ** 3 : (116 * f - 16) * 27 / 24389);
  const x = inv(fx) * D65.x / 100, y = inv(fy) * D65.y / 100, z = inv(fz) * D65.z / 100;
  return {
    r: linearToSrgb(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    g: linearToSrgb(x * -0.9692660 + y * 1.8760108 + z * 0.0415560),
    b: linearToSrgb(x * 0.0556434 + y * -0.2040259 + z * 1.0572252),
  };
}

export const toHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/* ── CIEDE2000 ────────────────────────────────────────────────────────────── */

const RAD = Math.PI / 180, DEG = 180 / Math.PI;

/**
 * CIEDE2000 between two LAB colours. Rough reading of the result: ΔE < 1 is invisible,
 * 1–2 is visible only side by side, 2–5 is a noticeable but same-colour shift, > 5 reads as a
 * different colour, > 10 is a different hue.
 */
export function deltaE2000(c1, c2) {
  const kL = 1, kC = 1, kH = 1;
  const C1 = Math.hypot(c1.a, c1.b), C2 = Math.hypot(c2.a, c2.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * c1.a, a2p = (1 + G) * c2.a;
  const C1p = Math.hypot(a1p, c1.b), C2p = Math.hypot(a2p, c2.b);
  const h = (a, b) => { if (a === 0 && b === 0) return 0; const d = Math.atan2(b, a) * DEG; return d >= 0 ? d : d + 360; };
  const h1p = h(a1p, c1.b), h2p = h(a2p, c2.b);

  const dLp = c2.L - c1.L;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else dhp = h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

  const Lbp = (c1.L + c2.L) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;

  const T = 1 - 0.17 * Math.cos((hbp - 30) * RAD) + 0.24 * Math.cos(2 * hbp * RAD)
    + 0.32 * Math.cos((3 * hbp + 6) * RAD) - 0.20 * Math.cos((4 * hbp - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * RAD) * Rc;

  return Math.sqrt(
    (dLp / (kL * Sl)) ** 2 + (dCp / (kC * Sc)) ** 2 + (dHp / (kH * Sh)) ** 2
    + Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh)),
  );
}

/* ── image sampling ───────────────────────────────────────────────────────── */

/** The flat generated backdrop, per §9.2's `plain white background`. Declared, never sampled. */
const BG_MIN_CHANNEL = 240;
const BG_MAX_SPREAD = 12;
const AA_RIM_DILATE = 2;

const isNearWhite = (r, g, b) =>
  r >= BG_MIN_CHANNEL && g >= BG_MIN_CHANNEL && b >= BG_MIN_CHANNEL
  && Math.max(r, g, b) - Math.min(r, g, b) <= BG_MAX_SPREAD;

/**
 * Load an image as flat RGB plus a content mask that excludes the border-connected white backdrop
 * and its anti-aliased rim. An image with no white border (the town map is full-bleed) comes back
 * fully masked in, which is the correct answer rather than a special case.
 */
export async function loadContent(path) {
  const { data, info } = await sharp(path).flatten({ background: '#ffffff' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const n = w * h;
  const rgb = new Uint8Array(n * 3);
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    rgb[i * 3] = data[p]; rgb[i * 3 + 1] = data[p + 1]; rgb[i * 3 + 2] = data[p + 2];
  }

  // 1. flood fill the backdrop inward from every border pixel that is near-white
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (i) => {
    if (bg[i]) return;
    if (!isNearWhite(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])) return;
    bg[i] = 1; stack.push(i);
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  // 2. dilate the backdrop by AA_RIM_DILATE so the anti-aliased halo is not treated as art
  let mask = bg;
  for (let pass = 0; pass < AA_RIM_DILATE; pass++) {
    const next = mask.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i]) continue;
        if ((x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1])
          || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])) next[i] = 1;
      }
    }
    mask = next;
  }

  let content = 0;
  for (let i = 0; i < n; i++) if (!mask[i]) content++;
  return { width: w, height: h, rgb, isBackground: mask, contentPixels: content };
}

/** Exact colour histogram over the content pixels: Map<packed 0xRRGGBB, count>. */
export function histogram({ rgb, isBackground }) {
  const hist = new Map();
  for (let i = 0; i < isBackground.length; i++) {
    if (isBackground[i]) continue;
    const key = (rgb[i * 3] << 16) | (rgb[i * 3 + 1] << 8) | rgb[i * 3 + 2];
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  return hist;
}

export const unpack = (key) => ({ r: (key >> 16) & 0xff, g: (key >> 8) & 0xff, b: key & 0xff });
