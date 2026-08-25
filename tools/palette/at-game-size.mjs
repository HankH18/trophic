/**
 * tools/palette/at-game-size.mjs — gate B0 acceptance at the size the player is actually SEEN.
 *
 * Everything else in this freeze measures 1024² renderings. Nobody ever sees those. §7.6 puts the
 * player on screen as a 32x48 logical sprite, and §9.3 fixes the order that gets it there:
 * downscale FIRST, then quantize. Order matters — nearest-neighbour downscaling of a quantized
 * image and quantizing of a downscaled image are different pictures, and the second is what ships.
 *
 * The steps here are IMPORTED from `tools/postprocess/steps.ts`, the real pipeline, rather than
 * reimplemented. A validation that reimplements the thing it validates proves only that two of my
 * own functions agree; importing means a green result here is evidence about the code that will
 * actually run.
 *
 * The question this answers is not "what is the mean error" — at 1,536 pixels a mean is nearly
 * meaningless. It is: after the downscale, how many pixels are LEFT of the star badge, the satchel
 * and the boots, and do they still hold their colour? A feature that survives quantization
 * perfectly and then lands on two pixels has not survived.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { loadPalette } from '../postprocess/palette.ts';
import { trimBackground, nearestResample, quantize, removeFlatBackground, WHITE } from '../postprocess/steps.ts';
import { rgbToLab, deltaE2000, toHex } from './color.mjs';

const OUT = 'assets/approved-trials/_palette-freeze/at-game-size';
const TOLERANCE = 12;                 // per-channel, matches the downscale-check convention
const TARGETS = [
  { w: 32, h: 48, tag: '32x48', note: '§7.6 logical overworld sprite — the real game size' },
  { w: 64, h: 96, tag: '64x96', note: 'reference only: 2x, to separate "palette lost it" from "resolution lost it"' },
];

/** The L6 identity features, as LAB bands. Same definitions as tools/palette/validate.mjs. */
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
const write = (r, path) =>
  sharp(Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length),
    { raw: { width: r.width, height: r.height, channels: 4 } }).png().toFile(path);

function bandCensus(r) {
  const rows = {};
  for (const n of Object.keys(BANDS)) rows[n] = { px: 0, colours: new Map() };
  let opaque = 0;
  for (let i = 0; i < r.data.length; i += 4) {
    if (r.data[i + 3] < 128) continue;
    opaque++;
    const lab = rgbToLab(r.data[i], r.data[i + 1], r.data[i + 2]);
    for (const [n, test] of Object.entries(BANDS)) {
      if (!test(lab)) continue;
      rows[n].px++;
      const hex = toHex({ r: r.data[i], g: r.data[i + 1], b: r.data[i + 2] });
      rows[n].colours.set(hex, (rows[n].colours.get(hex) ?? 0) + 1);
    }
  }
  return { rows, opaque };
}

const palette = loadPalette();
console.log(`palette: ${palette.length} colours from data/palette.json\n`);
await mkdir(OUT, { recursive: true });

const src = await toRaster('assets/approved-trials/player-APPROVED.png');
const bgOpts = { key: WHITE, tolerance: TOLERANCE };

// §9.3 step 0/1 — trim the flat backdrop to the subject bbox, then nearest-neighbour downscale.
const trimmed = trimBackground(src, bgOpts);
console.log(`trim: ${src.width}x${src.height} -> ${trimmed.width}x${trimmed.height}`);

// The 1024² reference census, for "was it the palette or the resolution".
const refQ = quantize(trimmed, palette);
const ref = bandCensus(refQ);

const report = { palette: 'data/palette.json', source: 'assets/approved-trials/player-APPROVED.png', targets: [] };

for (const t of TARGETS) {
  // ORDER IS LOAD-BEARING (§9.3): downscale, THEN quantize, THEN background removal.
  const small = nearestResample(trimmed, t.w, t.h);
  const q = quantize(small, palette);
  const cut = removeFlatBackground(q, bgOpts);

  await write(q, `${OUT}/player-${t.tag}.png`);
  await write(cut, `${OUT}/player-${t.tag}-nobg.png`);
  await sharp(`${OUT}/player-${t.tag}.png`).resize(t.w * 12, t.h * 12, { kernel: 'nearest' })
    .png().toFile(`${OUT}/player-${t.tag}-x12.png`);
  // the un-quantized downscale, so palette loss is separable from resolution loss
  await write(small, `${OUT}/player-${t.tag}-UNQUANTIZED.png`);
  await sharp(`${OUT}/player-${t.tag}-UNQUANTIZED.png`).resize(t.w * 12, t.h * 12, { kernel: 'nearest' })
    .png().toFile(`${OUT}/player-${t.tag}-UNQUANTIZED-x12.png`);

  const before = bandCensus(small);
  const after = bandCensus(q);

  // How far did quantization move the downscaled pixels? At this size, per-pixel is tractable.
  let sum = 0, n = 0, worst = 0, worstPair = null;
  for (let i = 0; i < small.data.length; i += 4) {
    if (q.data[i + 3] < 128) continue;
    const a = rgbToLab(small.data[i], small.data[i + 1], small.data[i + 2]);
    const b = rgbToLab(q.data[i], q.data[i + 1], q.data[i + 2]);
    const de = deltaE2000(a, b);
    sum += de; n++;
    if (de > worst) {
      worst = de;
      worstPair = { src: toHex({ r: small.data[i], g: small.data[i + 1], b: small.data[i + 2] }), dst: toHex({ r: q.data[i], g: q.data[i + 1], b: q.data[i + 2] }) };
    }
  }

  console.log('\n' + '═'.repeat(92));
  console.log(`${t.w}x${t.h}   ${t.note}`);
  console.log('═'.repeat(92));
  console.log(`pixels ${t.w * t.h}   opaque after background removal ${bandCensus(cut).opaque}`);
  console.log(`quantization at this size: mean ΔE ${(sum / n).toFixed(2)}, max ΔE ${worst.toFixed(2)}`
    + (worstPair ? ` (${worstPair.src} → ${worstPair.dst})` : ''));
  console.log(`distinct colours: downscaled ${new Set(colourKeys(small)).size} → quantized ${new Set(colourKeys(q)).size}`);
  console.log('');
  console.log('band'.padEnd(18) + 'px@1024²'.padStart(10) + 'px pre-q'.padStart(10) + 'px post-q'.padStart(11)
    + 'survived'.padStart(10) + '   colours held post-quantize');
  const targetRow = { size: `${t.w}x${t.h}`, meanDeltaE: Number((sum / n).toFixed(3)), maxDeltaE: Number(worst.toFixed(3)), bands: {} };
  for (const name of Object.keys(BANDS)) {
    const r1024 = ref.rows[name].px, pre = before.rows[name].px, post = after.rows[name].px;
    const held = [...after.rows[name].colours.entries()].sort((a, b) => b[1] - a[1])
      .map(([hex, c]) => `${hex}x${c}`).join(' ');
    console.log(name.padEnd(18) + String(r1024).padStart(10) + String(pre).padStart(10) + String(post).padStart(11)
      + (post > 0 ? 'YES' : '*** LOST ***').padStart(10) + '   ' + (held || '—'));
    targetRow.bands[name] = { pixelsAt1024: r1024, pixelsPreQuantize: pre, pixelsPostQuantize: post, coloursHeld: held || null };
  }
  report.targets.push(targetRow);
}

function colourKeys(r) {
  const out = [];
  for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 3] >= 128) out.push((r.data[i] << 16) | (r.data[i + 1] << 8) | r.data[i + 2]);
  return out;
}

await writeFile(`${OUT}/_at-game-size.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`\nwrote ${OUT}/  (x12 nearest upscales are the ones to look at by eye)`);
