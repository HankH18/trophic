/**
 * tools/palette/at-game-size-compare.mjs — frozen vs candidate at the size the player actually sees.
 *
 * Everything in compare.mjs measures 1024² renderings. Nobody ever sees those. §9.3 fixes the chain
 * that gets an asset on screen — nearest-neighbour downscale to target, THEN quantize, THEN
 * background removal — and §7.6/§9.3 fix the targets: battle sprites 96², overworld characters
 * 32×48. Order is load-bearing: quantizing a downscaled image and downscaling a quantized one are
 * different pictures, and the second is what ships.
 *
 * The steps are IMPORTED from `tools/postprocess/steps.ts`, the real pipeline, not reimplemented —
 * so a result here is evidence about the code that will actually run, not evidence that two of my
 * own functions agree. Same construction as the gate-B0 `at-game-size.mjs`, extended to score N
 * palettes on one raster so the comparison is exact rather than approximately re-derived.
 *
 * At 1,536 pixels (32×48) an image mean is nearly meaningless, so the instruments are:
 *   - how many DISTINCT swatches survive, and which ones — a sprite that collapses to 5 colours has
 *     lost its shading whatever its mean says
 *   - a per-band pixel census: after the downscale, how many pixels are LEFT of the star badge, and
 *     do they still hold a yellow? A feature that quantizes perfectly onto two pixels has not survived.
 *   - mean/max ΔE of the quantize step alone, measured against the un-quantized downscale, so
 *     palette loss is separable from resolution loss
 *
 *   node tools/palette/at-game-size-compare.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { loadPalette } from '../postprocess/palette.ts';
import { trimBackground, nearestResample, quantize, removeFlatBackground } from '../postprocess/steps.ts';
import { backgroundForClass } from '../postprocess/chain.ts';
import { rgbToLab, deltaE2000, toHex } from './color.mjs';

const OUT = 'assets/approved-trials/_palette-candidate/at-game-size';
// No local tolerance. Each subject names its §9.3 CLASS and the background key + tolerance are read
// from that class's `postprocess` block in tools/comfy/manifest.json (G11, B-D35). This file scores
// the palettes the freeze decision rests on, and step 3's tolerance is a property of the palette
// being scored — a literal 12 here cleared nothing under both candidates, so every candidate strip
// this file wrote was a solid rectangle while the frozen one was not.

const PALETTES = [
  { name: 'FROZEN', path: 'data/palette.json' },
  { name: 'CANDIDATE', path: 'data/palette.candidate.json' },
  { name: 'CLASS-EQ', path: 'assets/approved-trials/_palette-candidate/palette.candidate-classequal.json' },
];

/** §9.3 targets. The player is the only overworld-character class; everything else here is battle. */
const SUBJECTS = [
  { id: 'player', cls: 'player', file: 'assets/approved-trials/player-APPROVED.png', w: 32, h: 48, note: '§9.3 overworld char' },
  { id: 'fox-cindril', cls: 'creature-battle', file: 'assets/approved-trials/creature-fox.png', w: 96, h: 96, note: '§9.3 battle — warm control' },
  { id: 'puddlisk', cls: 'creature-battle', file: 'assets/raw/palette-trials/pt-puddlisk.png', w: 96, h: 96, note: '§9.3 battle — Water starter' },
  { id: 'fenmaw', cls: 'creature-battle', file: 'assets/raw/palette-trials/pt-fenmaw-b.png', w: 96, h: 96, note: '§9.3 battle — Water Apex' },
  { id: 'duskstalk', cls: 'creature-battle', file: 'assets/raw/palette-trials/pt-duskstalk.png', w: 96, h: 96, note: '§9.3 battle — Dark Apex' },
];

/** Same band definitions as validate.mjs / at-game-size.mjs, plus the cool regions. */
const BANDS = {
  'star yellow':      (c) => c.L >= 70 && c.L <= 96 && c.a >= -15 && c.a <= 28 && c.b > 55,
  'shirt/cap green':  (c) => c.a < -18 && c.b > 8 && c.L >= 25 && c.L <= 75,
  'skin':             (c) => c.L >= 62 && c.L <= 92 && c.a >= 8 && c.a <= 30 && c.b >= 16 && c.b <= 48,
  'leather brown':    (c) => c.L >= 18 && c.L <= 58 && c.a >= 5 && c.a <= 32 && c.b >= 12 && c.b <= 48,
  'dark outline':     (c) => c.L < 22,
  'cool (cyan/blue)': (c) => c.b < -6 && Math.hypot(c.a, c.b) >= 10,
};

const pals = PALETTES.map((p) => ({ ...p, rgb: loadPalette(p.path) }));

async function toRaster(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}
const write = (r, path) =>
  sharp(Buffer.from(r.data.buffer, r.data.byteOffset, r.data.length),
    { raw: { width: r.width, height: r.height, channels: 4 } }).png().toFile(path);

function census(r) {
  const rows = {};
  for (const n of Object.keys(BANDS)) rows[n] = { px: 0, colours: new Map() };
  const distinct = new Set();
  let opaque = 0;
  for (let i = 0; i < r.data.length; i += 4) {
    if (r.data[i + 3] < 128) continue;
    opaque++;
    const hex = toHex({ r: r.data[i], g: r.data[i + 1], b: r.data[i + 2] });
    distinct.add(hex);
    const lab = rgbToLab(r.data[i], r.data[i + 1], r.data[i + 2]);
    for (const [n, test] of Object.entries(BANDS)) {
      if (!test(lab)) continue;
      rows[n].px++;
      rows[n].colours.set(hex, (rows[n].colours.get(hex) ?? 0) + 1);
    }
  }
  return { rows, opaque, distinct };
}

await mkdir(OUT, { recursive: true });
const report = { chain: '§9.3: trim → nearest-neighbour downscale → quantize → background removal', subjects: [] };

for (const s of SUBJECTS) {
  const bgOpts = await backgroundForClass(s.cls);
  const src = await toRaster(s.file);
  const trimmed = trimBackground(src, bgOpts);
  // ORDER IS LOAD-BEARING (§9.3): downscale FIRST, then quantize.
  const small = nearestResample(trimmed, s.w, s.h);
  const pre = census(small);

  console.log('\n' + '═'.repeat(104));
  console.log(`${s.id}   ${s.w}x${s.h}   ${s.note}`);
  console.log(`  1024² trim ${trimmed.width}x${trimmed.height} → ${s.w}x${s.h};  `
    + `distinct colours before quantize ${pre.distinct.size}, opaque ${pre.opaque}`);
  console.log('═'.repeat(104));
  console.log('palette'.padEnd(12) + 'meanΔE'.padStart(9) + 'maxΔE'.padStart(9) + 'distinct'.padStart(10)
    + '   ' + Object.keys(BANDS).map((b) => b.slice(0, 9).padStart(11)).join(''));

  const row = { id: s.id, size: `${s.w}x${s.h}`, distinctPreQuantize: pre.distinct.size, palettes: {} };
  const strips = [];
  for (const pal of pals) {
    const q = quantize(small, pal.rgb);
    const cut = removeFlatBackground(q, bgOpts);
    const after = census(q);

    let sum = 0, n = 0, worst = 0, worstPair = null;
    for (let i = 0; i < small.data.length; i += 4) {
      if (q.data[i + 3] < 128) continue;
      const a = rgbToLab(small.data[i], small.data[i + 1], small.data[i + 2]);
      const b = rgbToLab(q.data[i], q.data[i + 1], q.data[i + 2]);
      const de = deltaE2000(a, b);
      sum += de; n++;
      if (de > worst) {
        worst = de;
        worstPair = { src: toHex({ r: small.data[i], g: small.data[i + 1], b: small.data[i + 2] }),
          dst: toHex({ r: q.data[i], g: q.data[i + 1], b: q.data[i + 2] }) };
      }
    }

    const tag = `${s.id}-${s.w}x${s.h}-${pal.name}`;
    await write(cut, `${OUT}/${tag}.png`);
    const x = Math.max(4, Math.round(384 / s.w));
    await sharp(`${OUT}/${tag}.png`).resize(s.w * x, s.h * x, { kernel: 'nearest' })
      .flatten({ background: '#101010' }).png().toFile(`${OUT}/${tag}-x${x}.png`);
    strips.push({ name: pal.name, file: `${OUT}/${tag}-x${x}.png` });

    console.log(pal.name.padEnd(12) + (sum / n).toFixed(2).padStart(9) + worst.toFixed(2).padStart(9)
      + String(after.distinct.size).padStart(10) + '   '
      + Object.keys(BANDS).map((b) => String(after.rows[b].px).padStart(11)).join(''));

    row.palettes[pal.name] = {
      quantizeMeanDeltaE: +(sum / n).toFixed(3), quantizeMaxDeltaE: +worst.toFixed(3), worstPair,
      distinctColoursAfterQuantize: after.distinct.size,
      // The proof that step 3 actually fired for THIS palette. Recorded per palette because the
      // failure it guards against is silent and palette-specific: at the old local tolerance 12 the
      // fill cleared nothing under either candidate, so `opaqueAfterBackgroundRemoval` equalled
      // `framePixels` and the strip written beside it was a solid rectangle (B-D50/B-D51). Equality
      // here is the defect; the three palettes converging a few hundred pixels below the frame is
      // what a working chain looks like.
      opaqueAfterBackgroundRemoval: census(cut).opaque,
      framePixels: s.w * s.h,
      bands: Object.fromEntries(Object.entries(after.rows).map(([b, r]) => [b, {
        pixels: r.px,
        coloursHeld: [...r.colours.entries()].sort((a, c) => c[1] - a[1]).map(([hex, c]) => `${hex}x${c}`).join(' ') || null,
      }])),
    };
  }
  console.log('band pixels pre-quantize'.padEnd(40) + Object.keys(BANDS).map((b) => String(pre.rows[b].px).padStart(11)).join(''));
  // Step 3 fired, per palette — the one line that separates a palette problem from a pipeline one.
  console.log(`  opaque after background removal (frame ${s.w * s.h}): `
    + pals.map((p) => `${p.name} ${row.palettes[p.name].opaqueAfterBackgroundRemoval}`).join('   ')
    + (pals.some((p) => row.palettes[p.name].opaqueAfterBackgroundRemoval === s.w * s.h)
      ? '   *** STILL A SOLID RECTANGLE — step 3 cleared nothing ***' : ''));
  for (const b of Object.keys(BANDS)) {
    if (pre.rows[b].px === 0) continue;
    const lost = pals.filter((p) => row.palettes[p.name].bands[b].pixels === 0).map((p) => p.name);
    if (lost.length) console.log(`  *** ${b}: LOST ENTIRELY under ${lost.join(', ')}`);
  }
  console.log(`  colours held in "${s.id === 'player' ? 'star yellow' : 'cool (cyan/blue)'}":`);
  for (const pal of pals) {
    const b = s.id === 'player' ? 'star yellow' : 'cool (cyan/blue)';
    console.log(`    ${pal.name.padEnd(11)} ${row.palettes[pal.name].bands[b].coloursHeld ?? '— none —'}`);
  }

  // one strip per subject: the three palettes side by side at nearest-neighbour zoom
  const metas = await Promise.all(strips.map((st) => sharp(st.file).metadata()));
  const G = 10, LABH = 26;
  const W = metas.reduce((a, m) => a + m.width + G, G);
  const H = metas[0].height + LABH + G * 2;
  const parts = [];
  let x = G;
  for (const [i, st] of strips.entries()) {
    parts.push({ input: await sharp(st.file).toBuffer(), left: x, top: G });
    parts.push({
      input: Buffer.from(`<svg width="${metas[i].width}" height="${LABH}"><rect width="100%" height="100%" fill="#1b1d1a"/>`
        + `<text x="${metas[i].width / 2}" y="18" font-family="monospace" font-size="15" fill="#cfe3c0" text-anchor="middle">${st.name}</text></svg>`),
      left: x, top: G + metas[i].height,
    });
    x += metas[i].width + G;
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#0d0f0c' } })
    .composite(parts).png().toFile(`${OUT}/_${s.id}-${s.w}x${s.h}-COMPARE.png`);

  report.subjects.push(row);
}

await writeFile(`${OUT}/_at-game-size-compare.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`\nwrote ${OUT}/  — the *-COMPARE.png strips are the ones to look at by eye`);
