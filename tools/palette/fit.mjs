/**
 * tools/palette/fit.mjs — gate B0: FREEZE data/palette.json (build-doc §8.4, §15 B0).
 *
 * §8.4: "Post-process quantizes to `palette.json` (32 colors, k-means over the approved trial set,
 * frozen at gate B0)." This script is that k-means, and the evidence for the choices inside it.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * DECISION 1 — WHICH SPACE THE k-MEANS RUNS IN.
 *
 * The deployed quantizer (`tools/postprocess/steps.ts::quantize`) picks the palette entry with the
 * smallest SQUARED EUCLIDEAN DISTANCE IN sRGB. That is a fixed constraint on this fit: whatever
 * space the centroids are found in, the partition that actually ships is the sRGB Voronoi
 * partition. Fitting in a space the quantizer does not use means the clusters this script
 * optimises are not the clusters the pipeline will produce.
 *
 * So both spaces are FITTED and both are MEASURED, and every measurement scores the palette the
 * way the pipeline will use it — nearest in sRGB — while reporting the error perceptually
 * (CIEDE2000). The winner is chosen on numbers, not on the argument.
 *
 * DECISION 2 — WEIGHTING, because pooling pixels lets one image buy the palette.
 *
 * The source set spans five asset classes with wildly different colour statistics: measured, the
 * town map holds ~353k distinct RGB values against ~49–60k for the sprites (logged as B-D5). Naive
 * pooling hands k-means a sample whose variance is dominated by the map, and k-means spends
 * centroids where the variance is — so the map would eat slots the player's shirt, the star badge
 * and the creature hues need. The palette has to serve EVERY class, so three weightings compete:
 *
 *   pooled    every content pixel counts once. The naive baseline, kept so the bias it introduces
 *             is a measured quantity rather than an assertion.
 *   equal     each image contributes total weight 1/N regardless of size. Every asset class gets
 *             an equal vote in the objective.
 *   equal+sqrt  each image contributes 1/N, but WITHIN an image a colour's weight is sqrt(count)
 *             rather than count. Large flat regions still dominate, but not absolutely: a small
 *             saturated accent — the yellow star badge is a few hundred pixels out of ~300k — can
 *             still hold a centroid. Compressing frequency is standard practice in palette
 *             extraction for exactly this reason; whether it earns its place here is measured.
 *
 * DECISION 3 — THE WINNER IS PICKED BY MINIMAX, NOT BY AVERAGE.
 *
 * "The palette must serve every asset class" is a statement about the WORST class, not the mean.
 * A palette that is superb on four images and poor on the fifth has failed. The rule, stated
 * before the numbers were seen: minimise the maximum per-image mean ΔE2000; ties (within 0.05)
 * break to the lower overall content-weighted mean.
 *
 * BACKGROUND. The plain white backdrop is excluded from the cluster input — see color.mjs. It is
 * not a content colour and a slot spent on it is a slot stolen from the artwork.
 *
 * DETERMINISM. k-means++ init draws from the project's seeded xorshift128 (core/rng.ts) at seed 42
 * — the validated trial seed (B-D1). No Math.random anywhere (G11). Re-running reproduces the
 * palette byte-identically, which is what makes a "frozen" palette a checkable claim.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createRng } from '../../core/rng.ts';
import {
  loadContent, histogram, unpack, rgbToLab, labToRgb, deltaE2000, toHex,
} from './color.mjs';

const KMEANS_SEED = 42;
const K = 32;
const MAX_ITERS = 200;

/**
 * The DEFAULT source set (build-doc §8.4 "the approved trial set"). One per asset class, so the
 * palette is fitted against every class it has to serve. `superseded/` is excluded entirely, and so
 * is `player-style-reference.png` — that one is a STYLE reference carrying a cape L6 forbids, not an
 * approved asset, and its colours have no claim on the frozen palette.
 */
const DEFAULT_SOURCES = [
  { id: 'player',  class: 'overworld-character', file: 'assets/approved-trials/player-APPROVED.png' },
  { id: 'fox',     class: 'creature-battle',     file: 'assets/approved-trials/creature-fox.png' },
  { id: 'croc',    class: 'creature-battle',     file: 'assets/approved-trials/creature-croc.png' },
  { id: 'trainer', class: 'trainer-battle',      file: 'assets/approved-trials/trainer-battle.png' },
  { id: 'map',     class: 'town-map',            file: 'assets/approved-trials/town-map.png' },
];

/**
 * ── CLI, added for the cool-region re-freeze candidate (DEVIATIONS-lane-b B-D13/B-D20) ──────────
 *
 * With no flags this script is EXACTLY what it was at gate B0: the five approved trials, written to
 * `data/palette.json` and `assets/approved-trials/_palette-freeze/`. That matters — the frozen
 * palette's reproducibility claim ("re-running yields a byte-identical colors[]") is only checkable
 * if the default invocation is unchanged.
 *
 *   --sources=<file.json>   a JSON array of {id, class, file}, replacing the default set
 *   --out=<file.json>       where the palette is written        (default data/palette.json)
 *   --outdir=<dir>          where the report + swatches go      (default the _palette-freeze dir)
 *   --label=<text>          free text stamped into the written file's `_comment`
 *
 * `--sources` REQUIRES `--out`. A different input producing a file at the frozen path would be a
 * silent re-freeze, and the whole point of a frozen palette is that it cannot happen by accident.
 */
const argOf = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const sourcesArg = argOf('sources');
const OUT_FILE = argOf('out') ?? 'data/palette.json';
const OUT_DIR = argOf('outdir') ?? 'assets/approved-trials/_palette-freeze';
const LABEL = argOf('label');
if (sourcesArg && OUT_FILE === 'data/palette.json') {
  throw new Error('--sources changes the k-means input, so it requires --out=<path> other than '
    + 'data/palette.json. data/palette.json is FROZEN (build-doc §8.4, gate B0); re-freezing it is '
    + "Hank's call, not a side effect of running this script with different arguments.");
}
const SOURCES = sourcesArg
  ? JSON.parse(await readFile(sourcesArg, 'utf8'))
  : DEFAULT_SOURCES;

/* ── load + histogram ─────────────────────────────────────────────────────── */

console.log('loading the approved trial set…\n');
const images = [];
for (const s of SOURCES) {
  const img = await loadContent(s.file);
  const hist = histogram(img);
  images.push({ ...s, img, hist });
  const bgShare = (1 - img.contentPixels / (img.width * img.height)) * 100;
  console.log(`  ${s.id.padEnd(8)} ${String(img.width)}x${img.height}  content ${String(img.contentPixels).padStart(9)}px `
    + `(backdrop ${bgShare.toFixed(1)}%)  distinct content colours ${hist.size}`);
}

/* ── the point set: distinct colours, with one weight column per strategy ──── */

/**
 * `class-equal` is OPT-IN via `--with-class-equal`, so the default bake-off — and therefore the
 * gate-B0 freeze it produced — is untouched.
 *
 * It exists because of a measured property of the BROADENED source set, not because `equal` was
 * wrong at B0. `equal` was chosen (DECISION 2 above) so that "every asset class gets an equal vote".
 * Over the five B0 trials, per-image and per-class were nearly the same thing: five images, four
 * classes. Over a source set with 12 creature-battle images and one overworld-character image, they
 * are not: the player — the asset gate B0 was actually about — falls from 20% of the objective to
 * 5.3%, and the creature class rises to 63%. So `equal` no longer does the thing it was picked to
 * do. `class-equal` gives each CLASS weight 1/C and splits it evenly among that class's images,
 * which is the ORIGINAL intent applied to the new input rather than a new rule.
 */
const WITH_CLASS_EQUAL = process.argv.includes('--with-class-equal');
const STRATEGIES = WITH_CLASS_EQUAL
  ? ['pooled', 'equal', 'equal+sqrt', 'class-equal']
  : ['pooled', 'equal', 'equal+sqrt'];
const NW = STRATEGIES.length;

/** Normalised class key — the source lists use both `town-map` and `map-town` for the same class. */
const classOf = (s) => (s.class ?? 'unclassified').replace(/^town-map$/, 'map-town');
const classCounts = new Map();
for (const im of images) classCounts.set(classOf(im), (classCounts.get(classOf(im)) ?? 0) + 1);
if (WITH_CLASS_EQUAL) {
  console.log('class-equal weighting is ON. classes: '
    + [...classCounts].map(([c, n]) => `${c}×${n}`).join(', ') + `  (${classCounts.size} classes)\n`);
}

const acc = new Map(); // packed -> Float64Array(NW) of weights

for (const im of images) {
  let sumCount = 0, sumSqrt = 0;
  for (const c of im.hist.values()) { sumCount += c; sumSqrt += Math.sqrt(c); }
  const classShare = 1 / classCounts.size / classCounts.get(classOf(im));
  for (const [key, c] of im.hist) {
    let w = acc.get(key);
    if (!w) { w = new Float64Array(NW); acc.set(key, w); }
    w[0] += c;                                       // pooled
    w[1] += c / sumCount / images.length;            // equal per image
    w[2] += Math.sqrt(c) / sumSqrt / images.length;   // equal per image, sqrt-compressed within
    if (NW > 3) w[3] += (c / sumCount) * classShare;  // equal per CLASS, split within the class
  }
}

const N = acc.size;
const pr = new Float64Array(N), pg = new Float64Array(N), pb = new Float64Array(N);
const pL = new Float64Array(N), pA = new Float64Array(N), pB = new Float64Array(N);
const W = Array.from({ length: NW }, () => new Float64Array(N));
{
  let i = 0;
  for (const [key, w] of acc) {
    const { r, g, b } = unpack(key);
    pr[i] = r; pg[i] = g; pb[i] = b;
    const lab = rgbToLab(r, g, b);
    pL[i] = lab.L; pA[i] = lab.a; pB[i] = lab.b;
    for (let s = 0; s < NW; s++) W[s][i] = w[s];
    i++;
  }
}
console.log(`\n${N} distinct content colours across the set — the k-means point cloud.\n`);

/* ── weighted k-means (k-means++ init, Lloyd) ─────────────────────────────── */

function kmeans(space, weights) {
  const [X, Y, Z] = space === 'srgb' ? [pr, pg, pb] : [pL, pA, pB];
  const rng = createRng(KMEANS_SEED);
  const cx = new Float64Array(K), cy = new Float64Array(K), cz = new Float64Array(K);

  // k-means++ : first centre proportional to weight, each next proportional to weight x D^2.
  const d2 = new Float64Array(N).fill(Infinity);
  const drawProportional = (score) => {
    let total = 0;
    for (let i = 0; i < N; i++) total += score(i);
    let roll = rng.range(0, 1) * total;
    for (let i = 0; i < N; i++) { roll -= score(i); if (roll <= 0) return i; }
    return N - 1;
  };
  let pick = drawProportional((i) => weights[i]);
  for (let k = 0; k < K; k++) {
    cx[k] = X[pick]; cy[k] = Y[pick]; cz[k] = Z[pick];
    for (let i = 0; i < N; i++) {
      const dx = X[i] - cx[k], dy = Y[i] - cy[k], dz = Z[i] - cz[k];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < d2[i]) d2[i] = d;
    }
    if (k + 1 < K) pick = drawProportional((i) => weights[i] * d2[i]);
  }

  const assign = new Int32Array(N).fill(-1);
  const sx = new Float64Array(K), sy = new Float64Array(K), sz = new Float64Array(K), sw = new Float64Array(K);
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let moved = 0;
    sx.fill(0); sy.fill(0); sz.fill(0); sw.fill(0);
    for (let i = 0; i < N; i++) {
      let best = 0, bestD = Infinity;
      for (let k = 0; k < K; k++) {
        const dx = X[i] - cx[k], dy = Y[i] - cy[k], dz = Z[i] - cz[k];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (assign[i] !== best) { assign[i] = best; moved++; }
      const w = weights[i];
      sx[best] += X[i] * w; sy[best] += Y[i] * w; sz[best] += Z[i] * w; sw[best] += w;
      d2[i] = bestD;
    }
    for (let k = 0; k < K; k++) {
      if (sw[k] > 0) { cx[k] = sx[k] / sw[k]; cy[k] = sy[k] / sw[k]; cz[k] = sz[k] / sw[k]; continue; }
      // Empty cluster: reseed onto the worst-served point rather than dropping a slot.
      let worst = 0, worstScore = -1;
      for (let i = 0; i < N; i++) { const s = weights[i] * d2[i]; if (s > worstScore) { worstScore = s; worst = i; } }
      cx[k] = X[worst]; cy[k] = Y[worst]; cz[k] = Z[worst]; d2[worst] = 0;
    }
    if (moved === 0) return { centroids: { cx, cy, cz }, iters: iter + 1 };
  }
  return { centroids: { cx, cy, cz }, iters: MAX_ITERS };
}

/** Centroids → 32 sRGB swatches, de-duplicated (a duplicate hex is a wasted slot). */
function toSwatches(space, { cx, cy, cz }) {
  const out = [];
  const seen = new Set();
  for (let k = 0; k < K; k++) {
    let rgb = space === 'srgb'
      ? { r: Math.max(0, Math.min(255, Math.round(cx[k]))), g: Math.max(0, Math.min(255, Math.round(cy[k]))), b: Math.max(0, Math.min(255, Math.round(cz[k]))) }
      : labToRgb(cx[k], cy[k], cz[k]);
    const hex = toHex(rgb);
    out.push({ ...rgb, hex, duplicate: seen.has(hex) });
    seen.add(hex);
  }
  return out;
}

/* ── scoring: assign the way the SHIPPING quantizer does (nearest in sRGB) ─── */

function score(swatches) {
  const swLab = swatches.map((s) => rgbToLab(s.r, s.g, s.b));
  const perImage = [];
  for (const im of images) {
    const errs = [];
    let total = 0;
    for (const [key, count] of im.hist) {
      const { r, g, b } = unpack(key);
      let best = 0, bestD = Infinity;
      for (let k = 0; k < swatches.length; k++) {   // exactly steps.ts::quantize
        const dr = r - swatches[k].r, dg = g - swatches[k].g, db = b - swatches[k].b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = k; }
      }
      const de = deltaE2000(rgbToLab(r, g, b), swLab[best]);
      errs.push({ de, count, key, best });
      total += count;
    }
    errs.sort((x, y) => x.de - y.de);
    let cum = 0, mean = 0, p95 = 0, p99 = 0;
    for (const e of errs) mean += (e.de * e.count) / total;
    for (const e of errs) {
      cum += e.count;
      if (!p95 && cum / total >= 0.95) p95 = e.de;
      if (!p99 && cum / total >= 0.99) p99 = e.de;
    }
    const max = errs[errs.length - 1].de;
    // A single stray pixel with a huge ΔE is not visible degradation; a colour holding ≥0.1% of
    // the image is. Report both so the distinction is the reader's to make, not this script's.
    let maxSig = 0, maxSigKey = 0;
    for (const e of errs) if (e.count / total >= 0.001 && e.de > maxSig) { maxSig = e.de; maxSigKey = e.key; }
    perImage.push({ id: im.id, mean, p95, p99, max, maxSig, maxSigKey, total });
  }
  const worstMean = Math.max(...perImage.map((p) => p.mean));
  const overall = perImage.reduce((a, p) => a + p.mean, 0) / perImage.length;
  return { perImage, worstMean, overall };
}

/* ── run the bake-off ─────────────────────────────────────────────────────── */

const candidates = [];
for (const space of ['srgb', 'lab']) {
  for (let s = 0; s < STRATEGIES.length; s++) {
    const t0 = Date.now();
    const { centroids, iters } = kmeans(space, W[s]);
    const swatches = toSwatches(space, centroids);
    const sc = score(swatches);
    const dupes = swatches.filter((x) => x.duplicate).length;
    candidates.push({ space, weighting: STRATEGIES[s], swatches, ...sc, iters, dupes, ms: Date.now() - t0 });
    console.log(`fit ${space}/${STRATEGIES[s]}  ${iters} iters  ${Date.now() - t0}ms  dupes ${dupes}`);
  }
}

console.log('\n' + '═'.repeat(96));
console.log('PER-IMAGE MEAN ΔE2000 (assignment = nearest in sRGB, i.e. what steps.ts::quantize does)');
console.log('═'.repeat(96));
const hdr = 'space/weighting'.padEnd(20) + images.map((i) => i.id.padStart(9)).join('')
  + '  |' + 'WORST'.padStart(8) + 'MEAN'.padStart(8);
console.log(hdr);
console.log('─'.repeat(96));
for (const c of candidates) {
  const row = `${c.space}/${c.weighting}`.padEnd(20)
    + c.perImage.map((p) => p.mean.toFixed(2).padStart(9)).join('')
    + '  |' + c.worstMean.toFixed(2).padStart(8) + c.overall.toFixed(2).padStart(8);
  console.log(row);
}

// Stated before the numbers: minimise the worst class; ties within 0.05 break on overall mean.
const sorted = [...candidates].sort((a, b) =>
  Math.abs(a.worstMean - b.worstMean) < 0.05 ? a.overall - b.overall : a.worstMean - b.worstMean);

/**
 * `--pick=<space>/<weighting>` overrides the rule. It exists so that overriding is an EXPLICIT,
 * recorded act rather than a quiet edit to the selection rule after the numbers came in — the
 * failure mode that makes a "frozen" palette untrustworthy. The override and its reason are
 * written into palette.json's `_method.selectionRule`, so the file always says how it was chosen.
 */
const pickArg = process.argv.find((a) => a.startsWith('--pick='))?.slice('--pick='.length);
const overrideReason = process.argv.find((a) => a.startsWith('--reason='))?.slice('--reason='.length);
const winner = pickArg
  ? candidates.find((c) => `${c.space}/${c.weighting}` === pickArg)
  : sorted[0];
if (!winner) throw new Error(`--pick=${pickArg} matches no candidate`);
if (pickArg) {
  if (!overrideReason) throw new Error('--pick requires --reason="…" so the override is recorded in palette.json');
  console.log(`\nRULE WINNER: ${sorted[0].space}/${sorted[0].weighting}  —  OVERRIDDEN to ${pickArg}`);
  console.log(`reason: ${overrideReason}`);
}
console.log('\n' + '═'.repeat(96));
console.log(`WINNER (minimax on worst per-image mean): ${winner.space}/${winner.weighting}`
  + `   worst ${winner.worstMean.toFixed(3)}   overall ${winner.overall.toFixed(3)}`);
console.log('═'.repeat(96));
console.log('\nper-image detail for the winner:');
console.log('image'.padEnd(10) + 'meanΔE'.padStart(9) + 'p95'.padStart(9) + 'p99'.padStart(9)
  + 'max'.padStart(9) + 'max@≥0.1%'.padStart(11) + '  worst-significant colour');
for (const p of winner.perImage) {
  const { r, g, b } = unpack(p.maxSigKey);
  console.log(p.id.padEnd(10) + p.mean.toFixed(2).padStart(9) + p.p95.toFixed(2).padStart(9)
    + p.p99.toFixed(2).padStart(9) + p.max.toFixed(2).padStart(9) + p.maxSig.toFixed(2).padStart(11)
    + '  ' + toHex({ r, g, b }));
}

/* ── order the frozen 32 into a readable ramp, then write ──────────────────── */

const NEUTRAL_CHROMA = 10;
const ordered = [...winner.swatches].map((s) => ({ ...s, lab: rgbToLab(s.r, s.g, s.b) }))
  .map((s) => ({ ...s, chroma: Math.hypot(s.lab.a, s.lab.b), hue: (Math.atan2(s.lab.b, s.lab.a) * 180 / Math.PI + 360) % 360 }))
  .sort((x, y) => {
    const nx = x.chroma < NEUTRAL_CHROMA, ny = y.chroma < NEUTRAL_CHROMA;
    if (nx !== ny) return nx ? -1 : 1;         // neutral ramp first
    if (nx) return x.lab.L - y.lab.L;          // then by lightness
    const hb = (h) => Math.floor(h / 30);      // chromatics grouped into 30° hue families
    if (hb(x.hue) !== hb(y.hue)) return hb(x.hue) - hb(y.hue);
    return x.lab.L - y.lab.L;
  });

const colors = ordered.map((s, i) => ({ id: `c${String(i).padStart(2, '0')}`, hex: s.hex }));
console.log('\nfrozen palette:');
for (let i = 0; i < colors.length; i += 8) {
  console.log('  ' + colors.slice(i, i + 8).map((c) => `${c.id} ${c.hex}`).join('   '));
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(`${OUT_DIR}/_fit-report.json`, JSON.stringify({
  kmeansSeed: KMEANS_SEED, k: K, sources: SOURCES,
  quantizerMetric: 'squared euclidean sRGB (tools/postprocess/steps.ts::quantize)',
  errorMetric: 'CIEDE2000',
  selectionRule: 'minimise max per-image mean ΔE2000; ties within 0.05 break on overall mean',
  candidates: candidates.map((c) => ({
    space: c.space, weighting: c.weighting, worstMean: c.worstMean, overall: c.overall,
    dupes: c.dupes, iters: c.iters,
    // Every candidate's full swatch set is kept so the runner-up can be examined — and adopted —
    // without re-deriving it, and so the bake-off is auditable after the fact.
    hexes: c.swatches.map((s) => s.hex),
    perImage: c.perImage.map((p) => ({ id: p.id, mean: p.mean, p95: p.p95, p99: p.p99, max: p.max, maxSignificant: p.maxSig })),
  })),
  winner: { space: winner.space, weighting: winner.weighting },
  colors,
}, null, 2) + '\n');

// swatch strip so the frozen set is inspectable by eye
const SW = 96;
await sharp({ create: { width: SW * 8, height: SW * 4, channels: 3, background: '#000000' } })
  .composite(colors.map((c, i) => ({
    input: { create: { width: SW, height: SW, channels: 3, background: c.hex } },
    left: (i % 8) * SW, top: Math.floor(i / 8) * SW,
  }))).png().toFile(`${OUT_DIR}/_palette-swatches.png`);

/**
 * `frozen` is a CLAIM about `data/palette.json`, the file the pipeline actually reads
 * (`tools/postprocess/palette.ts::paletteIsFrozen` is what a batch runner banners off). A palette
 * written anywhere else is by definition a proposal, so it says so — otherwise a candidate file
 * pointed at by a stray `--palette` flag would tell the runner it was the frozen set.
 */
const IS_FROZEN_TARGET = OUT_FILE === 'data/palette.json';

const palette = {
  _comment: (LABEL ? `${LABEL} ` : '')
    + (IS_FROZEN_TARGET
      ? 'FROZEN at gate B0 (build-doc §8.4, §15). '
      : `NOT FROZEN — a candidate written to ${OUT_FILE}. data/palette.json is the frozen palette and is untouched. `)
    + '32 colours, weighted k-means over the source set. '
    + 'Ids c00-c31 are positional and stable; a swap is a VALUE SWAP, not a schema change. '
    + 'Regenerate/verify with `npx tsx tools/palette/fit.mjs` (deterministic, k-means++ seeded at 42). '
    + `Method and per-image error live in _method / _validation below and in ${OUT_DIR}/_fit-report.json.`,
  _method: {
    algorithm: `weighted k-means, k=${K}, k-means++ init seeded at ${KMEANS_SEED} via core/rng.ts (no Math.random, G11)`,
    fitSpace: winner.space === 'srgb' ? 'sRGB' : 'CIELAB (D65)',
    weighting: winner.weighting,
    weightingRationale: winner.weighting === 'pooled'
      ? 'Pooled: every content pixel counts once. Chosen only because it measured best; see the bake-off table.'
      : winner.weighting === 'class-equal'
      ? `Each ASSET CLASS contributes equal total weight (1/${classCounts.size}), split evenly among that class's `
        + `images (${[...classCounts].map(([c, n]) => `${c}×${n}`).join(', ')}). This is what "equal" was chosen to `
        + 'achieve at gate B0 — "every asset class gets an equal vote" — restated for a source set where per-image '
        + 'and per-class are no longer the same thing.'
      : 'Each source image contributes equal total weight (1/N) regardless of pixel count, because the town map '
        + 'holds ~353k distinct colours against ~49-60k for the sprites (B-D5) and naive pixel-pooling lets it '
        + 'buy the palette and starve the sprite classes of hue.'
        + (winner.weighting === 'equal+sqrt'
          ? ' Within an image, weight is sqrt(pixel count) rather than pixel count, so small saturated accents '
            + '(the cap\'s yellow star badge is a few hundred pixels) can still hold a centroid against large flat regions.'
          : ''),
    backgroundExcluded: 'The plain white backdrop (§9.2 prompt skeleton) is flood-filled from the border and '
      + 'excluded from the cluster input, along with a 2px dilation that drops the anti-aliased rim. It is not a '
      + 'content colour and a slot spent on it is stolen from the artwork.',
    quantizerMetric: 'Scoring assigns each source colour the way tools/postprocess/steps.ts::quantize does — '
      + 'nearest palette entry by squared euclidean distance in sRGB — so the reported error is the error the '
      + 'pipeline will actually produce, not the error of an idealised quantizer.',
    errorMetric: 'CIEDE2000',
    selectionRule: 'Six candidates (2 fit spaces x 3 weightings). Rule stated before the numbers were seen: '
      + 'minimise the MAXIMUM per-image mean ΔE2000 — "serves every asset class" is a claim about the worst '
      + 'class, not the mean. Ties within 0.05 break on the overall mean.'
      + (pickArg
        ? ` OVERRIDDEN: the rule selected ${sorted[0].space}/${sorted[0].weighting}; ${pickArg} was frozen instead. Reason: ${overrideReason}`
        : ' Not overridden — this is the rule\'s own winner.'),
    excluded: ['assets/approved-trials/superseded/** (entirely)',
      'assets/approved-trials/player-style-reference.png (style reference carrying an L6-forbidden cape; not an approved asset)'],
  },
  _validation: Object.fromEntries(winner.perImage.map((p) => [p.id, {
    meanDeltaE2000: Number(p.mean.toFixed(3)),
    p95: Number(p.p95.toFixed(3)),
    p99: Number(p.p99.toFixed(3)),
    max: Number(p.max.toFixed(3)),
    maxOverColoursHolding0p1pct: Number(p.maxSig.toFixed(3)),
  }])),
  frozen: IS_FROZEN_TARGET,
  frozenAt: IS_FROZEN_TARGET ? new Date().toISOString().slice(0, 10) : null,
  source: `${IS_FROZEN_TARGET ? '' : 'CANDIDATE — '}k-means over ${SOURCES.length} trials (${SOURCES.map((s) => s.id).join(', ')}), `
    + `${winner.space === 'srgb' ? 'sRGB' : 'CIELAB'} / ${winner.weighting} weighting, seed ${KMEANS_SEED}`
    + (IS_FROZEN_TARGET ? ' — gate B0' : ' — proposal, nothing is swapped'),
  colorCount: colors.length,
  colors,
};
await writeFile(OUT_FILE, JSON.stringify(palette, null, 2) + '\n');

// The reproducibility claim is only checkable if the file states what it should hash to.
const colorsSha = createHash('sha256').update(JSON.stringify(colors)).digest('hex');
console.log(`\ncolors[] sha256 ${colorsSha}`);
console.log(`wrote ${OUT_FILE}, ${OUT_DIR}/_fit-report.json, ${OUT_DIR}/_palette-swatches.png`);
