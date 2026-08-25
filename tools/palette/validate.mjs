/**
 * tools/palette/validate.mjs — does the frozen palette actually SERVE each class?
 *
 * `fit.mjs` reports a mean ΔE2000 per image. A mean is the wrong instrument for the question that
 * matters at gate B0, which is not "how much did the picture move" but "did the things that make
 * this character THIS character survive". The cap's yellow star badge is a few hundred pixels out
 * of ~390k; it can be annihilated without moving the image mean by 0.01. So this script scores the
 * palette on named SEMANTIC BANDS — star yellow, shirt/cap green, skin, leather brown, dark
 * outline — and reports the error inside each band separately.
 *
 * It also reports HUE COVERAGE of the frozen 32, because the palette is fitted only to the five
 * approved trials and every future asset must quantize into it. A hue family absent from the trial
 * set is a hue family no future asset can use.
 *
 * Every assignment here is done the way `tools/postprocess/steps.ts::quantize` does it — nearest
 * palette entry by squared euclidean distance in sRGB — so the numbers are the pipeline's numbers.
 *
 *   npx tsx tools/palette/validate.mjs            # score the frozen data/palette.json
 *   npx tsx tools/palette/validate.mjs --all      # score all six bake-off candidates side by side
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import {
  loadContent, histogram, unpack, rgbToLab, deltaE2000, toHex, hexToRgb,
} from './color.mjs';

const OUT_DIR = 'assets/approved-trials/_palette-freeze';
const REPORT = `${OUT_DIR}/_fit-report.json`;

const SOURCES = [
  { id: 'player',  file: 'assets/approved-trials/player-APPROVED.png' },
  { id: 'fox',     file: 'assets/approved-trials/creature-fox.png' },
  { id: 'croc',    file: 'assets/approved-trials/creature-croc.png' },
  { id: 'trainer', file: 'assets/approved-trials/trainer-battle.png' },
  { id: 'map',     file: 'assets/approved-trials/town-map.png' },
];

/**
 * Semantic bands, defined in LAB so they are about perceived colour rather than channel values.
 * These are the L6 identity features — `green shirt, ranger cap with star badge, leather satchel,
 * walking boots` — plus the outline that carries the pixel-art read.
 */
const BANDS = {
  'star yellow': (c) => c.L >= 70 && c.L <= 96 && c.a >= -15 && c.a <= 28 && c.b > 55,
  'shirt/cap green': (c) => c.a < -18 && c.b > 8 && c.L >= 25 && c.L <= 75,
  'skin': (c) => c.L >= 62 && c.L <= 92 && c.a >= 8 && c.a <= 30 && c.b >= 16 && c.b <= 48,
  'leather brown': (c) => c.L >= 18 && c.L <= 58 && c.a >= 5 && c.a <= 32 && c.b >= 12 && c.b <= 48,
  'dark outline': (c) => c.L < 22,
};

const HUE_FAMILIES = [
  ['red',     345, 15], ['orange', 15, 55], ['yellow', 55, 95], ['yellow-green', 95, 135],
  ['green',   135, 175], ['cyan', 175, 215], ['blue', 215, 265], ['violet', 265, 305], ['magenta', 305, 345],
];

/* ── inputs ───────────────────────────────────────────────────────────────── */

const report = JSON.parse(await readFile(REPORT, 'utf8'));
const frozen = JSON.parse(await readFile('data/palette.json', 'utf8'));

const palettes = process.argv.includes('--all')
  ? [
    ...report.candidates.map((c) => ({ name: `${c.space}/${c.weighting}`, hexes: c.hexes })),
    { name: 'FROZEN (data/palette.json)', hexes: frozen.colors.map((c) => c.hex) },
  ]
  : [{ name: 'FROZEN (data/palette.json)', hexes: frozen.colors.map((c) => c.hex) }];

console.log('loading sources…');
const images = [];
for (const s of SOURCES) {
  const img = await loadContent(s.file);
  images.push({ ...s, img, hist: histogram(img) });
}

/* ── scoring ──────────────────────────────────────────────────────────────── */

function prepare(hexes) {
  const rgb = hexes.map(hexToRgb);
  return { rgb, lab: rgb.map((c) => rgbToLab(c.r, c.g, c.b)) };
}

/** Exactly steps.ts::quantize — nearest by squared euclidean distance in sRGB, ties to low index. */
function nearest(pal, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let k = 0; k < pal.rgb.length; k++) {
    const dr = r - pal.rgb[k].r, dg = g - pal.rgb[k].g, db = b - pal.rgb[k].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

function bandScores(pal, im) {
  const rows = {};
  for (const name of Object.keys(BANDS)) rows[name] = { px: 0, sum: 0, max: 0, worst: null, hit: new Set() };
  let contentTotal = 0;
  for (const [key, count] of im.hist) {
    const { r, g, b } = unpack(key);
    const lab = rgbToLab(r, g, b);
    contentTotal += count;
    for (const [name, test] of Object.entries(BANDS)) {
      if (!test(lab)) continue;
      const k = nearest(pal, r, g, b);
      const de = deltaE2000(lab, pal.lab[k]);
      const row = rows[name];
      row.px += count; row.sum += de * count; row.hit.add(k);
      if (de > row.max) { row.max = de; row.worst = { src: toHex({ r, g, b }), dst: pal.rgb[k], de }; }
    }
  }
  for (const row of Object.values(rows)) {
    row.mean = row.px ? row.sum / row.px : 0;
    row.share = row.px / contentTotal;
    row.slots = row.hit.size;
  }
  return { rows, contentTotal };
}

const results = [];
for (const p of palettes) {
  const pal = prepare(p.hexes);
  const per = images.map((im) => ({ id: im.id, ...bandScores(pal, im) }));
  results.push({ name: p.name, pal, per });
}

/* ── band tables ──────────────────────────────────────────────────────────── */

for (const bandName of Object.keys(BANDS)) {
  console.log('\n' + '═'.repeat(104));
  console.log(`BAND: ${bandName}   —   mean ΔE2000 inside the band  (slots = distinct palette entries the band lands on)`);
  console.log('═'.repeat(104));
  console.log('palette'.padEnd(28) + images.map((i) => i.id.padStart(15)).join(''));
  console.log('─'.repeat(104));
  for (const r of results) {
    const cells = r.per.map((p) => {
      const row = p.rows[bandName];
      return row.px === 0 ? '—'.padStart(15) : `${row.mean.toFixed(2)}/${row.slots}`.padStart(15);
    }).join('');
    console.log(r.name.padEnd(28) + cells);
  }
  const ref = results[results.length - 1].per;
  console.log('band share of content'.padEnd(28)
    + ref.map((p) => `${(p.rows[bandName].share * 100).toFixed(2)}%`.padStart(15)).join(''));
}

/* ── player identity detail, for the frozen palette ───────────────────────── */

const fz = results[results.length - 1];
const player = fz.per.find((p) => p.id === 'player');
console.log('\n' + '═'.repeat(104));
console.log('PLAYER IDENTITY DETAIL — frozen palette (this is the L6 lock: green shirt, star badge, satchel, boots)');
console.log('═'.repeat(104));
console.log('band'.padEnd(18) + 'px'.padStart(9) + 'share'.padStart(9) + 'meanΔE'.padStart(9)
  + 'maxΔE'.padStart(9) + 'slots'.padStart(7) + '  worst source → palette');
for (const [name, row] of Object.entries(player.rows)) {
  const w = row.worst;
  console.log(name.padEnd(18) + String(row.px).padStart(9) + `${(row.share * 100).toFixed(2)}%`.padStart(9)
    + row.mean.toFixed(2).padStart(9) + row.max.toFixed(2).padStart(9) + String(row.slots).padStart(7)
    + (w ? `  ${w.src} → ${toHex(w.dst)}  (ΔE ${w.de.toFixed(1)})` : ''));
}

/* ── hue coverage of the frozen 32 ────────────────────────────────────────── */

console.log('\n' + '═'.repeat(104));
console.log('HUE COVERAGE OF THE FROZEN 32 — a family with 0 slots is a family no future asset can quantize into');
console.log('═'.repeat(104));
const NEUTRAL = 10;
const fam = Object.fromEntries(HUE_FAMILIES.map(([n]) => [n, []]));
const neutrals = [];
for (const [i, c] of fz.pal.lab.entries()) {
  const chroma = Math.hypot(c.a, c.b);
  const hex = toHex(fz.pal.rgb[i]);
  if (chroma < NEUTRAL) { neutrals.push(hex); continue; }
  const hue = (Math.atan2(c.b, c.a) * 180 / Math.PI + 360) % 360;
  const f = HUE_FAMILIES.find(([, lo, hi]) => (lo > hi ? hue >= lo || hue < hi : hue >= lo && hue < hi));
  fam[f[0]].push(hex);
}
/**
 * The slot count alone cannot say whether a gap is a BUG or a faithful report. k-means spends
 * slots where the data is; a family with no slots may simply be a family the approved trials do
 * not contain. So the source set's own hue distribution is measured alongside, and the two are
 * printed together: a family with a real share and no slots is a fit failure, while a family with
 * ~0 share and no slots is the trial set telling you it has no such colours — which is a fact
 * about the SOURCE SET, and a forward risk for every asset class not represented in it.
 */
const srcHue = Object.fromEntries([...HUE_FAMILIES.map(([n]) => [n, 0]), ['neutral', 0]]);
let srcTotal = 0;
for (const im of images) {
  for (const [key, count] of im.hist) {
    const { r, g, b } = unpack(key);
    const c = rgbToLab(r, g, b);
    srcTotal += count;
    if (Math.hypot(c.a, c.b) < NEUTRAL) { srcHue.neutral += count; continue; }
    const hue = (Math.atan2(c.b, c.a) * 180 / Math.PI + 360) % 360;
    const f = HUE_FAMILIES.find(([, lo, hi]) => (lo > hi ? hue >= lo || hue < hi : hue >= lo && hue < hi));
    srcHue[f[0]] += count;
  }
}
const pct = (n) => `${((n / srcTotal) * 100).toFixed(2)}%`.padStart(8);
console.log('family'.padEnd(18) + 'slots' + '  src share' + '   swatches');
console.log(`neutral (chroma<${NEUTRAL})`.padEnd(18) + String(neutrals.length).padStart(5)
  + pct(srcHue.neutral) + '   ' + neutrals.join(' '));
for (const [n] of HUE_FAMILIES) {
  console.log(n.padEnd(18) + String(fam[n].length).padStart(5) + pct(srcHue[n]) + '   '
    + (fam[n].join(' ') || '*** EMPTY ***'));
}

/* ── previews: quantized sources + a ΔE heat map ──────────────────────────── */

await mkdir(`${OUT_DIR}/quantized`, { recursive: true });
console.log('\nwriting previews…');
const previewStats = {};
for (const im of images) {
  const { width: w, height: h, rgb, isBackground } = im.img;
  const out = Buffer.alloc(w * h * 3);
  const heat = Buffer.alloc(w * h * 3);
  const lut = new Map();
  let sum = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const key = (r << 16) | (g << 8) | b;
    let e = lut.get(key);
    if (e === undefined) {
      const k = nearest(fz.pal, r, g, b);
      e = { k, de: deltaE2000(rgbToLab(r, g, b), fz.pal.lab[k]) };
      lut.set(key, e);
    }
    const c = fz.pal.rgb[e.k];
    out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
    // The un-scored backdrop is a blue that cannot occur on the ramp below (every ramp colour has
    // r ≥ b). It used to be filled white, which is also the TOP of the ramp — so "no error here"
    // and "the error is off the scale" were the same pixel value, and the images the palette is
    // worst on rendered as the cleanest-looking heat maps. See B-D51.
    if (isBackground[i]) { heat[i * 3] = 0x33; heat[i * 3 + 1] = 0x50; heat[i * 3 + 2] = 0x6e; continue; }
    sum += e.de; n++;
    // heat map: black → red → yellow → WHITE-HOT across ΔE 0 → 15+
    const t = Math.min(1, e.de / 15);
    heat[i * 3] = Math.round(255 * Math.min(1, t * 3));
    heat[i * 3 + 1] = Math.round(255 * Math.max(0, Math.min(1, t * 3 - 1)));
    heat[i * 3 + 2] = Math.round(255 * Math.max(0, Math.min(1, t * 3 - 2)));
  }
  await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png()
    .toFile(`${OUT_DIR}/quantized/${im.id}-quantized.png`);
  await sharp(heat, { raw: { width: w, height: h, channels: 3 } }).png()
    .toFile(`${OUT_DIR}/quantized/${im.id}-deltaE-heatmap.png`);
  // side-by-side original | quantized, so the comparison needs no toggling
  await sharp({ create: { width: w * 2 + 8, height: h, channels: 3, background: '#101010' } })
    .composite([
      { input: await sharp(im.file).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer(), left: 0, top: 0 },
      { input: await sharp(out, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(), left: w + 8, top: 0 },
    ]).png().toFile(`${OUT_DIR}/quantized/${im.id}-BEFORE-AFTER.png`);
  previewStats[im.id] = { meanDeltaE2000OverContent: Number((sum / n).toFixed(3)) };
  console.log(`  ${im.id.padEnd(8)} mean ΔE over content pixels ${(sum / n).toFixed(3)}`);
}

await writeFile(`${OUT_DIR}/_validation.json`, JSON.stringify({
  palette: 'data/palette.json',
  frozenAt: frozen.frozenAt,
  assignment: 'nearest in sRGB (tools/postprocess/steps.ts::quantize)',
  errorMetric: 'CIEDE2000',
  bands: Object.fromEntries(fz.per.map((p) => [p.id, Object.fromEntries(
    Object.entries(p.rows).map(([n, r]) => [n, {
      pixels: r.px, share: Number(r.share.toFixed(5)), meanDeltaE: Number(r.mean.toFixed(3)),
      maxDeltaE: Number(r.max.toFixed(3)), paletteSlotsUsed: r.slots,
    }]),
  )])),
  hueCoverage: { neutral: neutrals, ...fam },
  sourceHueShare: Object.fromEntries(Object.entries(srcHue).map(([k, v]) => [k, Number((v / srcTotal).toFixed(5))])),
  previewStats,
}, null, 2) + '\n');
console.log(`\nwrote ${OUT_DIR}/_validation.json and ${OUT_DIR}/quantized/*`);
