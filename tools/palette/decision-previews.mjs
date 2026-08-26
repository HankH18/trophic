/**
 * tools/palette/decision-previews.mjs — the 1024² panel for a THREE-way palette decision.
 *
 * `compare.mjs` scores a frozen palette against ONE candidate and writes a three-column strip
 * (original | frozen | candidate). That shape is right for a bake-off and wrong for the decision
 * Hank actually has, which is a choice among three: keep the frozen 32, adopt the broadened
 * candidate, or adopt the class-equal variant. Read from two separate three-column strips, the
 * third option is a second scroll and a mental join, and the ORIGINAL and FROZEN columns are drawn
 * twice — which is exactly how a viewer ends up comparing two different renders of the same thing.
 *
 * So this writes ONE strip per image:
 *
 *     ORIGINAL │ FROZEN │ CANDIDATE │ CLASS-EQ         ← what each palette makes of the image
 *              │ ΔE map │  ΔE map   │  ΔE map          ← where the error lands, same scale
 *
 * Every column carries its own label, because the previous decision sheet's failure was that a
 * viewer could not tell a palette problem from a pipeline problem: under the old
 * background tolerance the candidate sprites were solid rectangles, and an unlabelled panel gives a
 * tired reader no way to know which of the two they are looking at.
 *
 * Scoring is identical to `compare.mjs` and to `tools/postprocess/steps.ts::quantize`: nearest
 * palette entry by squared euclidean distance in sRGB, error reported in CIEDE2000. The background
 * is the border-connected white flood fill from `color.mjs::loadContent`, so the heat maps show
 * error on CONTENT pixels only and the backdrop reads white.
 *
 *   node tools/palette/decision-previews.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { loadContent, rgbToLab, deltaE2000, hexToRgb } from './color.mjs';

const OUT = 'assets/approved-trials/_palette-candidate/decision-previews';

/** The three options, in the order the decision is made: keep · broaden · broaden class-balanced. */
const PALETTES = [
  { name: 'FROZEN', path: 'data/palette.json' },
  { name: 'CANDIDATE', path: 'data/palette.candidate.json' },
  { name: 'CLASS-EQ', path: 'assets/approved-trials/_palette-candidate/palette.candidate-classequal.json' },
];

/* ── the validation set: identical to compare.mjs, so the panels and the tables agree ─────────── */
const fitSources = JSON.parse(await readFile('tools/palette/candidate-sources.json', 'utf8'));
const EXTRA = [
  { id: 'fenmaw-GENERIC', class: 'creature-battle', file: 'assets/raw/palette-trials/pt-fenmaw.png',
    note: 'round-1 Fenmaw — snout regressed to a generic croc; held out of both fits' },
  { id: 'fenmaw-3q', class: 'creature-battle', file: 'assets/raw/palette-trials/pt-fenmaw-c.png',
    note: 'three-quarter Fenmaw — jaw doubled; held out of both fits' },
];
const IMAGES = [...fitSources, ...EXTRA];

async function loadPal(p) {
  const f = JSON.parse(await readFile(p.path, 'utf8'));
  const rgb = f.colors.map((c) => hexToRgb(c.hex));
  return { ...p, rgb, lab: rgb.map((c) => rgbToLab(c.r, c.g, c.b)) };
}
const pals = await Promise.all(PALETTES.map(loadPal));

/** Nearest by squared euclidean distance in sRGB, ties to the lowest index — steps.ts::quantize. */
function nearest(pal, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let k = 0; k < pal.rgb.length; k++) {
    const dr = r - pal.rgb[k].r, dg = g - pal.rgb[k].g, db = b - pal.rgb[k].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

/**
 * Black 0 → red ≈5 → yellow ≈10 → white 15+.
 *
 * THE BACKDROP IS NOT WHITE HERE, and that is a correction rather than a style choice. The ramp
 * tops out at white, so painting the un-scored backdrop white too makes the two most different
 * things on the panel — "no error to report" and "the error is off the top of the scale" — the same
 * pixel value. On `puddlisk` that inverts the reading: the frozen palette misses the whole body by
 * ΔE 15+, which renders as a large white region that a tired eye reads as CLEAN, next to a
 * candidate heat map that is red and orange and reads as hot. The worse palette looked better.
 * So the backdrop is drawn in a blue that cannot occur on the ramp (every ramp colour has r ≥ b).
 */
const BACKDROP = [0x33, 0x50, 0x6e];
const heatOf = (de) => {
  const t = Math.min(1, de / 15);
  return [Math.round(255 * Math.min(1, t * 3)),
    Math.round(255 * Math.max(0, Math.min(1, t * 3 - 1))),
    Math.round(255 * Math.max(0, Math.min(1, t * 3 - 2)))];
};
/** Share of CONTENT pixels a human would call visibly wrong. ΔE 10 is "different colour" territory. */
const VISIBLE_DE = 10;

await mkdir(OUT, { recursive: true });
const index = [];

for (const im of IMAGES) {
  const { width: w, height: h, rgb, isBackground } = await loadContent(im.file);
  const outs = {}, heats = {}, sums = {}, maxes = {}, visible = {};
  for (const p of pals) { outs[p.name] = Buffer.alloc(w * h * 3); heats[p.name] = Buffer.alloc(w * h * 3); sums[p.name] = 0; maxes[p.name] = 0; visible[p.name] = 0; }

  const lut = new Map();
  let content = 0;
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const key = (r << 16) | (g << 8) | b;
    let e = lut.get(key);
    if (e === undefined) {
      const lab = rgbToLab(r, g, b);
      e = pals.map((p) => { const k = nearest(p, r, g, b); return { k, de: deltaE2000(lab, p.lab[k]) }; });
      lut.set(key, e);
    }
    if (!isBackground[i]) content++;
    for (const [pi, p] of pals.entries()) {
      const c = p.rgb[e[pi].k];
      outs[p.name][i * 3] = c.r; outs[p.name][i * 3 + 1] = c.g; outs[p.name][i * 3 + 2] = c.b;
      if (isBackground[i]) {
        heats[p.name][i * 3] = BACKDROP[0]; heats[p.name][i * 3 + 1] = BACKDROP[1]; heats[p.name][i * 3 + 2] = BACKDROP[2];
        continue;
      }
      const [hr, hg, hb] = heatOf(e[pi].de);
      heats[p.name][i * 3] = hr; heats[p.name][i * 3 + 1] = hg; heats[p.name][i * 3 + 2] = hb;
      sums[p.name] += e[pi].de;
      if (e[pi].de >= VISIBLE_DE) visible[p.name]++;
      if (e[pi].de > maxes[p.name]) maxes[p.name] = e[pi].de;
    }
  }

  const png = (buf) => sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const label = (text, wpx, fill = '#cfe3c0', bg = '#12140f') => Buffer.from(
    `<svg width="${wpx}" height="34"><rect width="100%" height="100%" fill="${bg}"/>`
    + `<text x="${wpx / 2}" y="23" font-family="monospace" font-size="18" fill="${fill}" text-anchor="middle">${text}</text></svg>`);

  const G = 8, LAB = 34;
  const cols = 1 + pals.length;
  const stripW = w * cols + G * (cols + 1);
  const stripH = (h + LAB) * 2 + G * 3;
  const at = (i) => G * (i + 1) + w * i;

  const parts = [
    { input: await sharp(im.file).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer(), left: at(0), top: G },
    { input: label('ORIGINAL  (1024² render, un-quantized)', w, '#e8f2dd', '#0b1a10'), left: at(0), top: G + h },
    // the ORIGINAL column has no heat map — nothing to compare it to — so a legend goes there instead
    { input: Buffer.from(
      `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#0d0f0c"/>`
      + `<text x="24" y="54" font-family="monospace" font-size="32" fill="#e8f2dd">${im.id}</text>`
      + `<text x="24" y="98" font-family="monospace" font-size="20" fill="#8fae7a">mean ΔE2000  ·  share of content pixels ≥ ΔE ${VISIBLE_DE}</text>`
      + pals.map((p, i) => {
        const best = Math.min(...pals.map((q) => sums[q.name]));
        return `<rect x="24" y="${118 + i * 50}" width="${w - 48}" height="42" fill="#161a14"/>`
          + `<text x="38" y="${147 + i * 50}" font-family="monospace" font-size="22" fill="#cfe3c0">${p.name}</text>`
          + `<text x="${w - 190}" y="${147 + i * 50}" font-family="monospace" font-size="22" text-anchor="end" fill="${
            sums[p.name] === best ? '#9fe08a' : '#e8a08a'}">${(sums[p.name] / content).toFixed(2)}</text>`
          + `<text x="${w - 44}" y="${147 + i * 50}" font-family="monospace" font-size="22" text-anchor="end" fill="#8fae7a">${
            ((100 * visible[p.name]) / content).toFixed(1)}%</text>`;
      }).join('')
      + `<text x="24" y="${148 + pals.length * 50}" font-family="monospace" font-size="19" fill="#8fae7a">heat map — where that error lands</text>`
      + Array.from({ length: 32 }, (_, i) => {
        const [r, g, b] = heatOf((i / 31) * 15);
        return `<rect x="${24 + i * 14}" y="${162 + pals.length * 50}" width="14" height="28" fill="rgb(${r},${g},${b})"/>`;
      }).join('')
      + `<rect x="${24 + 33 * 14}" y="${162 + pals.length * 50}" width="28" height="28" fill="rgb(${BACKDROP.join(',')})"/>`
      + `<text x="24" y="${212 + pals.length * 50}" font-family="monospace" font-size="18" fill="#8fae7a">ΔE 0 ——— 7.5 ——— 15+   ▪ blue = backdrop</text>`
      + `<text x="24" y="${242 + pals.length * 50}" font-family="monospace" font-size="18" fill="#8fae7a">A WHITE-HOT sprite is the WORST case,</text>`
      + `<text x="24" y="${268 + pals.length * 50}" font-family="monospace" font-size="18" fill="#8fae7a">not a clean one. Only the blue is un-scored.</text>`
      + `<text x="24" y="${312 + pals.length * 50}" font-family="monospace" font-size="17" fill="#6f8a5f">${
        (im.note ?? im.set ?? '').slice(0, Math.floor(w / 11))}</text>`
      + '</svg>'), left: at(0), top: G * 2 + h + LAB },
    { input: label('HOW TO READ THE ROW BELOW', w, '#8fae7a'), left: at(0), top: G * 2 + h * 2 + LAB },
  ];

  for (const [i, p] of pals.entries()) {
    const c = i + 1;
    parts.push({ input: await png(outs[p.name]), left: at(c), top: G });
    parts.push({ input: label(`${p.name}   mean ΔE ${(sums[p.name] / content).toFixed(2)}   max ${maxes[p.name].toFixed(1)}`, w), left: at(c), top: G + h });
    parts.push({ input: await png(heats[p.name]), left: at(c), top: G * 2 + h + LAB });
    parts.push({ input: label(`${p.name} — ${((100 * visible[p.name]) / content).toFixed(1)}% of the sprite is visibly wrong (ΔE ≥ ${VISIBLE_DE})`, w), left: at(c), top: G * 2 + h * 2 + LAB });
  }

  const file = `${OUT}/${im.id}-3WAY.png`;
  await sharp({ create: { width: stripW, height: stripH, channels: 3, background: '#0d0f0c' } })
    .composite(parts).png().toFile(file);

  index.push({
    id: im.id, file, source: im.file, set: im.set ?? 'held-out', contentPixels: content,
    mean: Object.fromEntries(pals.map((p) => [p.name, +(sums[p.name] / content).toFixed(3)])),
    max: Object.fromEntries(pals.map((p) => [p.name, +maxes[p.name].toFixed(3)])),
    [`pctContentAtOrAboveDeltaE${VISIBLE_DE}`]: Object.fromEntries(pals.map((p) => [p.name, +((100 * visible[p.name]) / content).toFixed(2)])),
  });
  process.stdout.write(`\r  ${im.id.padEnd(22)}`);
}

// worst-first by how badly the FROZEN palette misses — that is the ordering the decision needs
index.sort((a, b) => b.mean.FROZEN - a.mean.FROZEN);
await writeFile(`${OUT}/_index.json`, JSON.stringify({
  assignment: 'nearest in sRGB (tools/postprocess/steps.ts::quantize)',
  errorMetric: 'CIEDE2000, content pixels only (border-connected white backdrop excluded)',
  palettes: PALETTES, images: index,
}, null, 2) + '\n');
console.log(`\nwrote ${OUT}/  — ${index.length} strips, ORIGINAL | ${pals.map((p) => p.name).join(' | ')}`);
