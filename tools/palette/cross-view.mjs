/**
 * tools/palette/cross-view.mjs — do the three player statics still agree AFTER quantization?
 *
 * This is the measurement that decides whether the back/side views can be called the same
 * character, and it is deliberately taken at the END of the pipeline rather than on the raw
 * renders. Two 1024² images can differ by ΔE 2 on the cap green and still land on the SAME frozen
 * swatch — in which case they are pixel-identical in the shipped sprite and the raw difference was
 * never real. The converse also happens: two nearly-equal greens can straddle a Voronoi boundary
 * and snap to different swatches, which is a visible flicker the raw ΔE would have called fine.
 *
 * So the question asked here is the one §9.6 will ask of the walk cycle — "cap, satchel, shirt
 * colour pixel-stable across frames after quantize" — applied to the statics that are its inputs.
 *
 * §9.3 order throughout: trim → nearest-neighbour downscale to 32x48 → quantize → background removal.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { loadPalette } from '../postprocess/palette.ts';
import { trimBackground, nearestResample, quantize, removeFlatBackground } from '../postprocess/steps.ts';
import { backgroundForClass } from '../postprocess/chain.ts';
import { rgbToLab, toHex } from './color.mjs';

const OUT = 'assets/approved-trials/_palette-freeze/cross-view';
const W = 32, H = 48;

const VIEWS = [
  { id: 'front', file: 'assets/approved-trials/player-APPROVED.png' },
  { id: 'back',  file: 'assets/raw/player/b0-player-back-e.png' },
  { id: 'side',  file: 'assets/raw/player/b0-player-side-b.png' },
];

const BANDS = {
  'star yellow': (c) => c.L >= 70 && c.L <= 96 && c.a >= -15 && c.a <= 28 && c.b > 55,
  'shirt/cap green': (c) => c.a < -18 && c.b > 8 && c.L >= 25 && c.L <= 75,
  'skin': (c) => c.L >= 62 && c.L <= 92 && c.a >= 8 && c.a <= 30 && c.b >= 16 && c.b <= 48,
  'leather brown': (c) => c.L >= 18 && c.L <= 58 && c.a >= 5 && c.a <= 32 && c.b >= 12 && c.b <= 48,
  'dark outline': (c) => c.L < 22,
};

async function toRaster(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}
const writePng = (r, p) =>
  sharp(Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length),
    { raw: { width: r.width, height: r.height, channels: 4 } }).png().toFile(p);

const palette = loadPalette();
// Background key + tolerance from `classes.player.postprocess` in tools/comfy/manifest.json — never
// a literal here (G11, B-D35). Step 3 runs after quantize, so the tolerance must admit the palette's
// image of white; at the old local `TOL = 12` this file cleared nothing under either candidate
// palette and would have reported three views that "agree" because all three were solid rectangles.
const bgOpts = await backgroundForClass('player');
await mkdir(OUT, { recursive: true });

const results = [];
for (const v of VIEWS) {
  const src = await toRaster(v.file);
  const trimmed = trimBackground(src, bgOpts);
  const small = nearestResample(trimmed, W, H);
  const q = quantize(small, palette);
  const cut = removeFlatBackground(q, bgOpts);
  await writePng(cut, `${OUT}/player-${v.id}-32x48.png`);
  await sharp(`${OUT}/player-${v.id}-32x48.png`).resize(W * 12, H * 12, { kernel: 'nearest' })
    .png().toFile(`${OUT}/player-${v.id}-32x48-x12.png`);

  // Which frozen swatches does each identity band land on, and how many pixels each?
  const bands = {};
  for (const n of Object.keys(BANDS)) bands[n] = new Map();
  let opaque = 0;
  for (let i = 0; i < cut.data.length; i += 4) {
    if (cut.data[i + 3] < 128) continue;
    opaque++;
    const hex = toHex({ r: cut.data[i], g: cut.data[i + 1], b: cut.data[i + 2] });
    const lab = rgbToLab(cut.data[i], cut.data[i + 1], cut.data[i + 2]);
    for (const [n, test] of Object.entries(BANDS)) if (test(lab)) bands[n].set(hex, (bands[n].get(hex) ?? 0) + 1);
  }
  results.push({ id: v.id, file: v.file, trimmed: `${trimmed.width}x${trimmed.height}`, opaque, bands });
  console.log(`${v.id.padEnd(6)} trim ${String(trimmed.width).padStart(4)}x${trimmed.height}  opaque@32x48 ${opaque}`);
}

console.log('\n' + '═'.repeat(100));
console.log('CROSS-VIEW SWATCH AGREEMENT AT 32x48 — do the three statics use the SAME frozen swatches?');
console.log('═'.repeat(100));
const summary = {};
for (const name of Object.keys(BANDS)) {
  console.log(`\n${name}`);
  const sets = results.map((r) => new Set(r.bands[name].keys()));
  for (const r of results) {
    const held = [...r.bands[name].entries()].sort((a, b) => b[1] - a[1]);
    console.log('  ' + r.id.padEnd(7) + String(held.reduce((a, [, c]) => a + c, 0)).padStart(5) + 'px   '
      + (held.map(([h, c]) => `${h}x${c}`).join(' ') || '—'));
  }
  const shared = [...sets[0]].filter((h) => sets.every((s) => s.has(h)));
  const union = new Set(sets.flatMap((s) => [...s]));
  // Dominant swatch per view: what the band actually reads as on screen.
  const dominants = results.map((r) => [...r.bands[name].entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
  const dominantAgrees = dominants.every((d) => d !== null && d === dominants[0]);
  console.log(`  shared by all 3: ${shared.join(' ') || 'NONE'}   (union ${union.size})`);
  console.log(`  dominant swatch: ${dominants.map((d, i) => `${results[i].id}=${d ?? '—'}`).join('  ')}`
    + `   ${dominantAgrees ? 'AGREE' : '*** DIVERGE ***'}`);
  summary[name] = { perView: Object.fromEntries(results.map((r) => [r.id, Object.fromEntries(r.bands[name])])), shared, dominants, dominantAgrees };
}

await writeFile(`${OUT}/_cross-view.json`, JSON.stringify({
  palette: 'data/palette.json', size: `${W}x${H}`,
  pipeline: 'trim -> nearestResample -> quantize -> removeFlatBackground (tools/postprocess/steps.ts)',
  views: results.map((r) => ({ id: r.id, file: r.file, trimmed: r.trimmed, opaquePixels: r.opaque })),
  bands: summary,
}, null, 2) + '\n');

// one strip so the three statics can be compared by eye at the size they ship
const strip = [];
let x = 8;
for (const v of VIEWS) {
  strip.push({ input: await sharp(`${OUT}/player-${v.id}-32x48-x12.png`).flatten({ background: '#ffffff' }).toBuffer(), left: x, top: 8 });
  strip.push({ input: Buffer.from(`<svg width="${W * 12}" height="24"><rect width="100%" height="100%" fill="#111"/><text x="${W * 6}" y="17" font-family="monospace" font-size="14" fill="#cfe" text-anchor="middle">${v.id} 32x48</text></svg>`), left: x, top: 8 + H * 12 });
  x += W * 12 + 8;
}
await sharp({ create: { width: x, height: H * 12 + 24 + 16, channels: 3, background: '#1a1a1a' } })
  .composite(strip).png().toFile(`${OUT}/_three-statics-32x48.png`);
console.log(`\nwrote ${OUT}/  (_three-statics-32x48.png is the eye check)`);
