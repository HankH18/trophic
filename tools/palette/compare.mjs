/**
 * tools/palette/compare.mjs — the frozen palette and a candidate, on the SAME broadened evidence.
 *
 * WHAT THIS IS FOR. `data/palette.json` was frozen by a correct method over an inadequate input:
 * five warm/green trials, measured hue share cyan 1.05% / blue 0.05% / magenta 0.66% (B-D13). A
 * candidate re-freeze over a broadened source set necessarily spends swatches on the cool half, and
 * swatches are conserved — so it MUST cost something on the classes the frozen palette already
 * serves. This script's job is to make that cost a number instead of an impression.
 *
 * Everything is scored the way `tools/postprocess/steps.ts::quantize` scores it — nearest palette
 * entry by squared euclidean distance in sRGB — and reported in CIEDE2000, exactly as fit.mjs and
 * validate.mjs do, so the numbers here are commensurable with the gate-B0 evidence.
 *
 * FOUR INSTRUMENTS, because a per-image mean is blind to the things that matter most:
 *
 *   1. per-image mean / p95 / p99 / max        — the headline, comparable to _fit-report.json
 *   2. per-HUE-FAMILY mean, pooled over the whole set — where the swatches actually went, and
 *      therefore what was traded for what
 *   3. named small features                    — the star badge is 1.29% of the player's pixels and
 *      cannot move an image mean by 0.01 (this is the B-D12 lesson; it is measured, not trusted)
 *   4. the B-D13 cool probes                   — the synthetic colours that motivated all of this
 *
 * Held-out images are scored too and flagged: an image in the validation set but not in either
 * palette's fit is the only honest evidence about GENERALISATION, which is the entire question when
 * a 32-colour palette has to serve 150 sprites it has never seen.
 *
 *   node tools/palette/compare.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import {
  loadContent, histogram, unpack, rgbToLab, deltaE2000, toHex, hexToRgb,
} from './color.mjs';

const argOf = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const FROZEN = argOf('frozen') ?? 'data/palette.json';
const CANDIDATE = argOf('candidate') ?? 'data/palette.candidate.json';
const OUT = argOf('out') ?? 'assets/approved-trials/_palette-candidate';
/** `--tables-only` skips the previews — used when scoring a secondary variant, where only the numbers matter. */
const TABLES_ONLY = process.argv.includes('--tables-only');

/* ── the validation set ───────────────────────────────────────────────────────
 * Every trial image that exists, not just the ones either palette was fitted to. `inFit` says
 * whether the CANDIDATE's k-means saw the image; the frozen palette saw only the five B0 trials, so
 * for it all fourteen cool trials are held out.
 */
const fitSources = JSON.parse(await readFile('tools/palette/candidate-sources.json', 'utf8'));
const inCandidateFit = new Set(fitSources.map((s) => s.file));

const EXTRA = [
  { id: 'fenmaw-GENERIC', class: 'creature-battle', file: 'assets/raw/palette-trials/pt-fenmaw.png',
    note: 'round-1 Fenmaw — snout regressed to a generic croc (B-D19); excluded from the fit, kept as held-out evidence' },
  { id: 'fenmaw-3q', class: 'creature-battle', file: 'assets/raw/palette-trials/pt-fenmaw-c.png',
    note: 'three-quarter Fenmaw — long snout reads but the jaw doubled; excluded from the fit, held out' },
];
const IMAGES = [...fitSources, ...EXTRA];

/* ── named small features: the things a mean cannot see ───────────────────────
 * The first five are the gate-B0 identity bands, verbatim from validate.mjs / at-game-size.mjs so
 * the numbers line up with the frozen palette's own evidence. The last five are the regions the
 * broadened source set exists to cover; they are scored on the same footing so "what did we buy"
 * and "what did we pay" are read off one table.
 */
const BANDS = {
  'star yellow':      (c) => c.L >= 70 && c.L <= 96 && c.a >= -15 && c.a <= 28 && c.b > 55,
  'shirt/cap green':  (c) => c.a < -18 && c.b > 8 && c.L >= 25 && c.L <= 75,
  'skin':             (c) => c.L >= 62 && c.L <= 92 && c.a >= 8 && c.a <= 30 && c.b >= 16 && c.b <= 48,
  'leather brown':    (c) => c.L >= 18 && c.L <= 58 && c.a >= 5 && c.a <= 32 && c.b >= 12 && c.b <= 48,
  'dark outline':     (c) => c.L < 22,
  'deep water':       (c) => c.L >= 15 && c.L <= 50 && c.b < -12 && c.a >= -25 && c.a <= 12,
  'marsh teal':       (c) => c.L >= 30 && c.L <= 75 && c.a < -8 && c.b >= -30 && c.b <= 4,
  'ice / pale cyan':  (c) => c.L > 72 && c.a < -4 && c.b >= -30 && c.b <= 6,
  'dusk blue/violet': (c) => c.L < 45 && c.b < -8 && c.a > 4,
  'magenta':          (c) => c.a > 20 && c.b < 4 && c.L >= 25 && c.L <= 80,
};

const HUE_FAMILIES = [
  ['red', 345, 15], ['orange', 15, 55], ['yellow', 55, 95], ['yellow-green', 95, 135],
  ['green', 135, 175], ['cyan', 175, 215], ['blue', 215, 265], ['violet', 265, 305], ['magenta', 305, 345],
];
const NEUTRAL_CHROMA = 10;

/** The B-D13 probes, verbatim, so the candidate is answerable to the same table. */
const PROBES = [
  ['deep water', '#1b4f7a'], ['sky blue', '#7ec8f0'], ['marsh teal', '#2f7f7a'],
  ['ice cyan', '#a8e8ea'], ['purple', '#7a4fa3'], ['magenta', '#c04a9a'],
];

/* ── palette plumbing — exactly steps.ts::quantize ────────────────────────────── */

async function loadPal(path, name) {
  const f = JSON.parse(await readFile(path, 'utf8'));
  const rgb = f.colors.map((c) => hexToRgb(c.hex));
  return { name, path, hexes: f.colors.map((c) => c.hex), rgb, lab: rgb.map((c) => rgbToLab(c.r, c.g, c.b)) };
}

/** Nearest by squared euclidean distance in sRGB, ties to the lowest index. */
function nearest(pal, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let k = 0; k < pal.rgb.length; k++) {
    const dr = r - pal.rgb[k].r, dg = g - pal.rgb[k].g, db = b - pal.rgb[k].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

const frozen = await loadPal(FROZEN, 'FROZEN');
const candidate = await loadPal(CANDIDATE, 'CANDIDATE');
const PALS = [frozen, candidate];

/* ── load once, score twice ───────────────────────────────────────────────────── */

console.log(`loading ${IMAGES.length} validation images…`);
const loaded = [];
for (const s of IMAGES) {
  const img = await loadContent(s.file);
  loaded.push({ ...s, img, hist: histogram(img), heldOutForCandidate: !inCandidateFit.has(s.file) });
}

/** Per-image error distribution for one palette, weighted by pixel count. */
function scoreImage(pal, im) {
  const errs = [];
  let total = 0;
  for (const [key, count] of im.hist) {
    const { r, g, b } = unpack(key);
    const k = nearest(pal, r, g, b);
    errs.push({ de: deltaE2000(rgbToLab(r, g, b), pal.lab[k]), count, key });
    total += count;
  }
  errs.sort((x, y) => x.de - y.de);
  let mean = 0;
  for (const e of errs) mean += (e.de * e.count) / total;
  let cum = 0, p95 = 0, p99 = 0;
  for (const e of errs) {
    cum += e.count;
    if (!p95 && cum / total >= 0.95) p95 = e.de;
    if (!p99 && cum / total >= 0.99) p99 = e.de;
  }
  let maxSig = 0, maxSigKey = 0;
  for (const e of errs) if (e.count / total >= 0.001 && e.de > maxSig) { maxSig = e.de; maxSigKey = e.key; }
  return { mean, p95, p99, max: errs[errs.length - 1].de, maxSig, maxSigKey, total };
}

const perImage = {};
for (const pal of PALS) perImage[pal.name] = loaded.map((im) => ({ id: im.id, ...scoreImage(pal, im) }));

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 8, d = 2) => v.toFixed(d).padStart(n);

console.log('\n' + '═'.repeat(112));
console.log('PER-IMAGE ΔE2000 — SAME broadened validation set, both palettes (assignment: nearest in sRGB)');
console.log('  held? = the image was NOT in that palette\'s k-means input, so its numbers are generalisation');
console.log('═'.repeat(112));
console.log(pad('image', 16) + pad('set', 13)
  + '│' + 'F.mean'.padStart(8) + 'F.p95'.padStart(8) + 'F.p99'.padStart(8) + 'F.max'.padStart(8)
  + ' │' + 'C.mean'.padStart(8) + 'C.p95'.padStart(8) + 'C.p99'.padStart(8) + 'C.max'.padStart(8)
  + ' │' + 'Δmean'.padStart(8) + '  verdict');
console.log('─'.repeat(112));
for (const [i, im] of loaded.entries()) {
  const f = perImage.FROZEN[i], c = perImage.CANDIDATE[i];
  const d = c.mean - f.mean;
  console.log(pad(im.id, 16) + pad(im.set ?? 'held-out', 13)
    + '│' + num(f.mean) + num(f.p95) + num(f.p99) + num(f.max)
    + ' │' + num(c.mean) + num(c.p95) + num(c.p99) + num(c.max)
    + ' │' + num(d) + '  ' + (d < -0.25 ? 'CANDIDATE better' : d > 0.25 ? 'frozen better' : 'tie'));
}
const agg = (rows, key) => rows.reduce((a, r) => a + r[key], 0) / rows.length;
console.log('─'.repeat(112));
console.log(pad('MEAN of means', 29)
  + '│' + num(agg(perImage.FROZEN, 'mean'), 8) + ' '.repeat(24)
  + ' │' + num(agg(perImage.CANDIDATE, 'mean'), 8) + ' '.repeat(24)
  + ' │' + num(agg(perImage.CANDIDATE, 'mean') - agg(perImage.FROZEN, 'mean')));
console.log(pad('WORST per-image mean', 29)
  + '│' + num(Math.max(...perImage.FROZEN.map((p) => p.mean)), 8) + ' '.repeat(24)
  + ' │' + num(Math.max(...perImage.CANDIDATE.map((p) => p.mean)), 8));

/* ── 2. per-hue-family error, pooled over the whole validation set ───────────── */

function hueOf(lab) {
  if (Math.hypot(lab.a, lab.b) < NEUTRAL_CHROMA) return 'neutral';
  const h = (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360;
  return HUE_FAMILIES.find(([, lo, hi]) => (lo > hi ? h >= lo || h < hi : h >= lo && h < hi))[0];
}

const famStats = {};
for (const n of ['neutral', ...HUE_FAMILIES.map((f) => f[0])]) {
  famStats[n] = { px: 0, FROZEN: 0, CANDIDATE: 0 };
}
let grandPx = 0;
for (const im of loaded) {
  for (const [key, count] of im.hist) {
    const { r, g, b } = unpack(key);
    const lab = rgbToLab(r, g, b);
    const f = famStats[hueOf(lab)];
    f.px += count;
    grandPx += count;
    for (const pal of PALS) f[pal.name] += deltaE2000(lab, pal.lab[nearest(pal, r, g, b)]) * count;
  }
}

/** How many swatches each palette spends on each family — the conserved resource. */
function slots(pal) {
  const out = { neutral: 0 };
  for (const [n] of HUE_FAMILIES) out[n] = 0;
  for (const lab of pal.lab) out[hueOf(lab)]++;
  return out;
}
const slotF = slots(frozen), slotC = slots(candidate);

console.log('\n' + '═'.repeat(112));
console.log('WHERE THE 32 SWATCHES WENT — pooled mean ΔE2000 per hue family over the whole validation set');
console.log('  swatches are CONSERVED: every slot the candidate moves into the cool half is a slot the warm half lost');
console.log('═'.repeat(112));
console.log(pad('family', 16) + 'share'.padStart(9) + '│' + 'F.slots'.padStart(9) + 'F.mean'.padStart(9)
  + ' │' + 'C.slots'.padStart(9) + 'C.mean'.padStart(9) + ' │' + 'Δmean'.padStart(9) + 'Δslots'.padStart(9));
console.log('─'.repeat(112));
for (const n of ['neutral', ...HUE_FAMILIES.map((f) => f[0])]) {
  const s = famStats[n];
  if (!s.px) { console.log(pad(n, 16) + '0.00%'.padStart(9) + '  (absent from the validation set)'); continue; }
  const fM = s.FROZEN / s.px, cM = s.CANDIDATE / s.px;
  console.log(pad(n, 16) + `${(100 * s.px / grandPx).toFixed(2)}%`.padStart(9)
    + '│' + String(slotF[n]).padStart(9) + num(fM, 9) + ' │' + String(slotC[n]).padStart(9) + num(cM, 9)
    + ' │' + num(cM - fM, 9) + (slotC[n] - slotF[n] > 0 ? `+${slotC[n] - slotF[n]}` : String(slotC[n] - slotF[n])).padStart(9));
}

/* ── 3. named small features ─────────────────────────────────────────────────── */

function bandScore(pal, im) {
  const rows = {};
  for (const n of Object.keys(BANDS)) rows[n] = { px: 0, sum: 0, max: 0, worst: null, hit: new Set() };
  let total = 0;
  for (const [key, count] of im.hist) {
    const { r, g, b } = unpack(key);
    const lab = rgbToLab(r, g, b);
    total += count;
    for (const [n, test] of Object.entries(BANDS)) {
      if (!test(lab)) continue;
      const k = nearest(pal, r, g, b);
      const de = deltaE2000(lab, pal.lab[k]);
      const row = rows[n];
      row.px += count; row.sum += de * count; row.hit.add(k);
      if (de > row.max) { row.max = de; row.worst = { src: toHex({ r, g, b }), dst: pal.hexes[k], de }; }
    }
  }
  for (const r of Object.values(rows)) { r.mean = r.px ? r.sum / r.px : 0; r.share = r.px / total; r.slots = r.hit.size; }
  return rows;
}

/**
 * Which image each named feature is measured ON. Pinning the feature to its image is the point:
 * "star yellow" pooled across 21 images is dominated by the fox's ember and says nothing about the
 * badge, which is the one thing gate B0 turned on.
 */
const FEATURE_ON = {
  'star yellow': 'player', 'shirt/cap green': 'player', 'skin': 'player',
  'leather brown': 'player', 'dark outline': 'player',
  'deep water': 'brackwater', 'marsh teal': 'r2-marsh', 'ice / pale cyan': 'puddlisk',
  'dusk blue/violet': 'duskhollow', 'magenta': 'duskhollow',
};

const bandsBy = {};
for (const pal of PALS) {
  bandsBy[pal.name] = {};
  for (const im of loaded) bandsBy[pal.name][im.id] = bandScore(pal, im);
}

console.log('\n' + '═'.repeat(112));
console.log('IDENTITY-CRITICAL SMALL FEATURES — measured on the image that owns them, never pooled');
console.log('  a per-image MEAN cannot see the star badge (1.29% of the player); that is the B-D12 lesson, re-applied');
console.log('═'.repeat(112));
console.log(pad('feature', 18) + pad('on', 12) + 'share'.padStart(8)
  + '│' + 'F.mean'.padStart(8) + 'F.max'.padStart(8) + 'F.sl'.padStart(6)
  + ' │' + 'C.mean'.padStart(8) + 'C.max'.padStart(8) + 'C.sl'.padStart(6) + ' │' + 'Δmean'.padStart(8));
console.log('─'.repeat(112));
const featureRows = {};
for (const [feat, imgId] of Object.entries(FEATURE_ON)) {
  const f = bandsBy.FROZEN[imgId][feat], c = bandsBy.CANDIDATE[imgId][feat];
  if (!f.px) { console.log(pad(feat, 18) + pad(imgId, 12) + '  — absent'); continue; }
  console.log(pad(feat, 18) + pad(imgId, 12) + `${(100 * f.share).toFixed(2)}%`.padStart(8)
    + '│' + num(f.mean) + num(f.max) + String(f.slots).padStart(6)
    + ' │' + num(c.mean) + num(c.max) + String(c.slots).padStart(6) + ' │' + num(c.mean - f.mean));
  featureRows[feat] = {
    on: imgId, pixels: f.px, share: Number(f.share.toFixed(5)),
    frozen: { mean: +f.mean.toFixed(3), max: +f.max.toFixed(3), slots: f.slots, worst: f.worst },
    candidate: { mean: +c.mean.toFixed(3), max: +c.max.toFixed(3), slots: c.slots, worst: c.worst },
  };
}
console.log('\nworst single colour inside each feature:');
for (const [feat, r] of Object.entries(featureRows)) {
  console.log('  ' + pad(feat, 18)
    + `F ${r.frozen.worst.src} → ${r.frozen.worst.dst} ΔE ${r.frozen.worst.de.toFixed(1)}`.padEnd(42)
    + `C ${r.candidate.worst.src} → ${r.candidate.worst.dst} ΔE ${r.candidate.worst.de.toFixed(1)}`);
}

/* ── 4. the B-D13 cool probes ────────────────────────────────────────────────── */

console.log('\n' + '═'.repeat(112));
console.log('B-D13 COOL PROBES — the synthetic colours that motivated the re-freeze, both palettes');
console.log('═'.repeat(112));
console.log(pad('probe', 14) + pad('hex', 10)
  + '│' + pad('  frozen →', 12) + 'ΔE'.padStart(7) + ' │' + pad('  candidate →', 13) + 'ΔE'.padStart(7));
console.log('─'.repeat(112));
const probeRows = [];
for (const [name, hex] of PROBES) {
  const { r, g, b } = hexToRgb(hex);
  const lab = rgbToLab(r, g, b);
  const out = { probe: name, hex };
  const cells = PALS.map((pal) => {
    const k = nearest(pal, r, g, b);
    const de = deltaE2000(lab, pal.lab[k]);
    out[pal.name.toLowerCase()] = { to: pal.hexes[k], deltaE: +de.toFixed(2) };
    return { hex: pal.hexes[k], de };
  });
  probeRows.push(out);
  console.log(pad(name, 14) + pad(hex, 10)
    + '│' + pad('  ' + cells[0].hex, 12) + num(cells[0].de, 7) + ' │' + pad('  ' + cells[1].hex, 13) + num(cells[1].de, 7));
}

/* ── previews ─────────────────────────────────────────────────────────────────── */

await mkdir(`${OUT}/quantized`, { recursive: true });
if (!TABLES_ONLY) console.log('\nwriting BEFORE / frozen / candidate previews + ΔE heatmaps…');

const heatOf = (de) => {                                   // black → red → yellow → white, 0 → 15+
  const t = Math.min(1, de / 15);
  return [Math.round(255 * Math.min(1, t * 3)),
    Math.round(255 * Math.max(0, Math.min(1, t * 3 - 1))),
    Math.round(255 * Math.max(0, Math.min(1, t * 3 - 2)))];
};
/**
 * The un-scored backdrop is drawn in a blue that cannot occur on the ramp above (every ramp colour
 * has r ≥ b) — it used to be filled white, which is also the TOP of the ramp. That collision
 * inverts the panel's meaning on exactly the images the decision turns on: the frozen palette
 * misses Puddlisk's whole body by ΔE 15+, which painted a big white region a tired eye reads as
 * CLEAN, beside a candidate heat map that is red and orange and reads as hot. See B-D51.
 */
const BACKDROP_HEAT = [0x33, 0x50, 0x6e];

const previewFiles = [];
for (const im of (TABLES_ONLY ? [] : loaded)) {
  const { width: w, height: h, rgb, isBackground } = im.img;
  const outs = {}, heats = {};
  for (const pal of PALS) { outs[pal.name] = Buffer.alloc(w * h * 3); heats[pal.name] = Buffer.alloc(w * h * 3); }
  const lut = new Map();
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const key = (r << 16) | (g << 8) | b;
    let e = lut.get(key);
    if (e === undefined) {
      const lab = rgbToLab(r, g, b);
      e = PALS.map((pal) => { const k = nearest(pal, r, g, b); return { k, de: deltaE2000(lab, pal.lab[k]) }; });
      lut.set(key, e);
    }
    for (const [pi, pal] of PALS.entries()) {
      const c = pal.rgb[e[pi].k];
      outs[pal.name][i * 3] = c.r; outs[pal.name][i * 3 + 1] = c.g; outs[pal.name][i * 3 + 2] = c.b;
      if (isBackground[i]) {
        heats[pal.name][i * 3] = BACKDROP_HEAT[0];
        heats[pal.name][i * 3 + 1] = BACKDROP_HEAT[1];
        heats[pal.name][i * 3 + 2] = BACKDROP_HEAT[2];
        continue;
      }
      const [hr, hg, hb] = heatOf(e[pi].de);
      heats[pal.name][i * 3] = hr; heats[pal.name][i * 3 + 1] = hg; heats[pal.name][i * 3 + 2] = hb;
    }
  }
  const png = (buf) => sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const label = (text, wpx) => Buffer.from(
    `<svg width="${wpx}" height="30"><rect width="100%" height="100%" fill="#12140f"/>`
    + `<text x="${wpx / 2}" y="21" font-family="monospace" font-size="17" fill="#cfe3c0" text-anchor="middle">${text}</text></svg>`);

  // one strip per image: original | frozen | candidate, then the two heat maps under them
  const G = 8;
  const stripW = w * 3 + G * 4, stripH = (h + 30) * 2 + G * 3;
  const orig = await sharp(im.file).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer();
  const file = `${OUT}/quantized/${im.id}-COMPARE.png`;
  await sharp({ create: { width: stripW, height: stripH, channels: 3, background: '#0d0f0c' } })
    .composite([
      { input: orig, left: G, top: G },
      { input: await png(outs.FROZEN), left: G * 2 + w, top: G },
      { input: await png(outs.CANDIDATE), left: G * 3 + w * 2, top: G },
      { input: label('ORIGINAL', w), left: G, top: G + h },
      // The candidate's PATH, never the literal string `data/palette.candidate.json` — this script
      // also scores the class-equal variant via `--candidate=`, and a panel that names the wrong
      // file is the same defect as a panel that shows the wrong pipeline (B-D51).
      { input: label(`FROZEN  ${FROZEN}`, w), left: G * 2 + w, top: G + h },
      { input: label(`CANDIDATE  ${CANDIDATE}`, w), left: G * 3 + w * 2, top: G + h },
      { input: await png(heats.FROZEN), left: G * 2 + w, top: G * 2 + h + 30 },
      { input: await png(heats.CANDIDATE), left: G * 3 + w * 2, top: G * 2 + h + 30 },
      { input: label('FROZEN ΔE heatmap  (black 0 → WHITE-HOT 15+ · blue = backdrop)', w), left: G * 2 + w, top: G * 2 + h * 2 + 30 },
      { input: label('CANDIDATE ΔE heatmap  (black 0 → WHITE-HOT 15+ · blue = backdrop)', w), left: G * 3 + w * 2, top: G * 2 + h * 2 + 30 },
    ]).png().toFile(file);
  previewFiles.push(file);
  process.stdout.write(`\r  ${im.id.padEnd(20)}`);
}
console.log('\r' + ' '.repeat(30));

/* ── one contact sheet Hank can open and judge in a single look ───────────────── */

const CELL = 300, LAB = 24, PADP = 6;
const cells = [];
for (const [i, im] of (TABLES_ONLY ? [] : loaded).entries()) {
  const f = perImage.FROZEN[i], c = perImage.CANDIDATE[i];
  const strip = await sharp(previewFiles[i]).resize(CELL * 3, null, { fit: 'inside' }).toBuffer();
  cells.push({ img: strip, meta: await sharp(strip).metadata(), label: `${im.id}   frozen ΔE ${f.mean.toFixed(2)}  →  candidate ΔE ${c.mean.toFixed(2)}  (${(c.mean - f.mean >= 0 ? '+' : '') + (c.mean - f.mean).toFixed(2)})` });
}
const sheetW = CELL * 3 + PADP * 2;
let y = PADP;
const sheetParts = [];
for (const c of cells) {
  sheetParts.push({ input: c.img, left: PADP, top: y });
  sheetParts.push({
    input: Buffer.from(`<svg width="${CELL * 3}" height="${LAB}"><rect width="100%" height="100%" fill="#1b1d1a"/>`
      + `<text x="8" y="17" font-family="monospace" font-size="14" fill="#cfe3c0">${c.label}</text></svg>`),
    left: PADP, top: y + c.meta.height,
  });
  y += c.meta.height + LAB + PADP;
}
if (!TABLES_ONLY) {
  await sharp({ create: { width: sheetW, height: y, channels: 3, background: '#0d0f0c' } })
    .composite(sheetParts).png().toFile(`${OUT}/_CONTACT-SHEET.png`);
}

/* ── swatch strips, side by side ─────────────────────────────────────────────── */

const SW = 88;
const swatchParts = [];
for (const [pi, pal] of PALS.entries()) {
  const top = pi * (SW * 4 + 34) + 30;
  swatchParts.push({
    input: Buffer.from(`<svg width="${SW * 8}" height="28"><rect width="100%" height="100%" fill="#12140f"/>`
      + `<text x="8" y="20" font-family="monospace" font-size="16" fill="#cfe3c0">${pal.name}  ${pal.path}</text></svg>`),
    left: 0, top: top - 30,
  });
  for (const [i, hex] of pal.hexes.entries()) {
    swatchParts.push({
      input: { create: { width: SW, height: SW, channels: 3, background: hex } },
      left: (i % 8) * SW, top: top + Math.floor(i / 8) * SW,
    });
  }
}
await sharp({ create: { width: SW * 8, height: (SW * 4 + 34) * 2 + 30, channels: 3, background: '#0d0f0c' } })
  .composite(swatchParts).png().toFile(`${OUT}/_SWATCHES-frozen-vs-candidate.png`);


/* ── machine-readable ─────────────────────────────────────────────────────────── */

await writeFile(`${OUT}/_compare.json`, JSON.stringify({
  frozen: FROZEN, candidate: CANDIDATE,
  assignment: 'nearest in sRGB (tools/postprocess/steps.ts::quantize)',
  errorMetric: 'CIEDE2000',
  validationSet: loaded.map((im) => ({ id: im.id, file: im.file, set: im.set ?? 'held-out', heldOutForCandidate: im.heldOutForCandidate, note: im.note })),
  perImage: loaded.map((im, i) => ({
    id: im.id,
    frozen: { mean: +perImage.FROZEN[i].mean.toFixed(3), p95: +perImage.FROZEN[i].p95.toFixed(3), p99: +perImage.FROZEN[i].p99.toFixed(3), max: +perImage.FROZEN[i].max.toFixed(3), maxOverColoursHolding0p1pct: +perImage.FROZEN[i].maxSig.toFixed(3) },
    candidate: { mean: +perImage.CANDIDATE[i].mean.toFixed(3), p95: +perImage.CANDIDATE[i].p95.toFixed(3), p99: +perImage.CANDIDATE[i].p99.toFixed(3), max: +perImage.CANDIDATE[i].max.toFixed(3), maxOverColoursHolding0p1pct: +perImage.CANDIDATE[i].maxSig.toFixed(3) },
  })),
  hueFamilies: Object.fromEntries(Object.entries(famStats).map(([n, s]) => [n, {
    shareOfValidationPixels: +(s.px / grandPx).toFixed(5),
    frozen: { slots: slotF[n], meanDeltaE: s.px ? +(s.FROZEN / s.px).toFixed(3) : null },
    candidate: { slots: slotC[n], meanDeltaE: s.px ? +(s.CANDIDATE / s.px).toFixed(3) : null },
  }])),
  namedFeatures: featureRows,
  coolProbes: probeRows,
}, null, 2) + '\n');

console.log(`wrote ${OUT}/_compare.json`);
if (!TABLES_ONLY) console.log(`      ${OUT}/_CONTACT-SHEET.png        ← open this one`);
console.log(`      ${OUT}/_SWATCHES-frozen-vs-candidate.png`);
console.log(`      ${OUT}/quantized/*-COMPARE.png   (original | frozen | candidate, + both heatmaps)`);
