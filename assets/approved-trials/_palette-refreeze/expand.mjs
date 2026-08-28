/**
 * assets/approved-trials/_palette-refreeze/expand.mjs
 * ────────────────────────────────────────────────────────────────────────────────
 * PROPOSAL GENERATOR for an APPEND-ONLY palette expansion. Writes nothing outside
 * this directory; `data/palette.json` is never opened for writing.
 *
 * WHY THIS IS NOT `tools/palette/fit.mjs`.
 * fit.mjs re-derives all 32 ids from sorted ramp position (`fit.mjs:359-373`) and holds
 * `K = 32` as a module constant with no CLI override. Re-running it with a larger K emits a
 * fully RE-ORDERED c00..cNN in which c00..c31 are not the current values — a value swap, which
 * is exactly what T-15 proved expensive ("a palette id is a SLOT, not a colour": c18 went cream
 * to dark green and 15 of 19 UI_SWATCH roles had to be re-pointed). So the existing generator
 * structurally cannot produce an append, and this script exists instead of a flag on that one.
 *
 * THE METHOD — augmenting k-means, not a re-fit.
 * The frozen 32 are FIXED centres that cannot move. k new centres are fitted to whatever colour
 * mass the frozen 32 serve worst: every point is assigned to the nearest of (frozen ∪ new) by
 * squared euclidean distance in sRGB — exactly `tools/postprocess/steps.ts::quantize` — and only
 * the new centres are updated by Lloyd. A colour a frozen swatch already serves well therefore
 * exerts no pull on any new centre, so no new swatch can land redundantly on top of an old one.
 * That is a structural property of the objective, not a filter applied afterwards.
 *
 * HOW MANY. Not chosen. The count is DERIVED: candidates are added one at a time, each time the
 * one whose MEASURED marginal reduction in weighted mean CIEDE2000 is largest, and the run stops
 * when the best remaining candidate is worth less than MIN_GAIN. MIN_SEPARATION exists only to
 * refuse a near-duplicate; it is deliberately NOT the redundancy test, because measured on this
 * data a ΔE2000 separation threshold MISFIRES IN THE DARK END — #29272e sits 7.8 ΔE from c30
 * #272940 yet is the third most valuable swatch available (c30 is a navy, #29272e is neutral, and
 * ΔE2000 compresses lightness differences down there). Marginal value is measured directly, so
 * the proxy is not needed and is not trusted.
 *
 * DETERMINISM (G11). k-means++ seeding draws from core/rng.ts at seed 42. No Math.random. Map
 * iteration order follows insertion order, which follows the source list, so the run is
 * reproducible byte-for-byte.
 *
 * SOURCES. Raw, pre-quantization art only. `assets/final/maps/*.png` are ALREADY quantized to the
 * frozen palette (17-32 distinct colours, measured) — fitting to those would fit the palette to
 * itself and could not discover a colour it lacks. `assets/reference/**` is NOT used and must
 * never be: those are Pokémon reference images, inspiration-only, and deriving our palette from
 * them would bake someone else's palette into this game.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { createRng } from '../../../core/rng.ts';
import { loadContent, histogram, unpack, rgbToLab, deltaE2000, toHex, hexToRgb } from '../../../tools/palette/color.mjs';

const SEED = 42, MAX_ITERS = 80;
const SWEEP_K = [4, 6, 8, 10, 12, 14, 16, 20, 24];
const MIN_GAIN = 0.05;        // stop when the best remaining swatch buys less than this in mean ΔE
const MIN_SEPARATION = 5;     // anti-duplicate floor only — see the header note
const OUT = 'assets/approved-trials/_palette-refreeze';

const SOURCES = JSON.parse(await readFile(`${OUT}/sources-biome.json`, 'utf8'));
const pal = JSON.parse(await readFile('data/palette.json', 'utf8'));
if (pal.colors.length !== 32) throw new Error(`expected the frozen 32, found ${pal.colors.length}`);
const P = pal.colors.map((c) => { const { r, g, b } = hexToRgb(c.hex); return { id: c.id, hex: c.hex, r, g, b, lab: rgbToLab(r, g, b) }; });

/* ── pool the sources: distinct colours, weighted equally PER IMAGE ─────────── */
const acc = new Map(); const perImage = [];
for (const s of SOURCES) {
  const img = await loadContent(s.file);
  const hist = histogram(img);
  let sum = 0; for (const c of hist.values()) sum += c;
  for (const [key, c] of hist) acc.set(key, (acc.get(key) ?? 0) + c / sum / SOURCES.length);
  perImage.push({ ...s, hist, sum, distinct: hist.size });
  console.log(`  ${s.id.padEnd(22)} ${s.biome.padEnd(9)} distinct ${String(hist.size).padStart(7)}`);
}
const NX = acc.size;
const eR = new Float64Array(NX), eG = new Float64Array(NX), eB = new Float64Array(NX), eW = new Float64Array(NX);
const eLab = new Array(NX); const keys = [...acc.keys()];
for (let i = 0; i < NX; i++) { const { r, g, b } = unpack(keys[i]); eR[i] = r; eG[i] = g; eB[i] = b; eW[i] = acc.get(keys[i]); eLab[i] = rgbToLab(r, g, b); }
let totW = 0; for (let i = 0; i < NX; i++) totW += eW[i];
const key2i = new Map(); for (let i = 0; i < NX; i++) key2i.set(keys[i], i);
console.log(`\n${NX} distinct content colours pooled across ${SOURCES.length} raw sources.\n`);

/* ── 6-bit bucketed working set for the CENTROID SEARCH only ─────────────────
 * Positions are the weighted MEAN inside each bucket, so precision is preserved; only the point
 * COUNT drops. Every number reported below is scored exactly, over all NX distinct colours. */
const bucket = (fixed) => {
  const bk = new Map();
  for (let i = 0; i < NX; i++) {
    const k = ((eR[i] >> 2) << 12) | ((eG[i] >> 2) << 6) | (eB[i] >> 2);
    let e = bk.get(k); if (!e) { e = [0, 0, 0, 0]; bk.set(k, e); }
    e[0] += eR[i] * eW[i]; e[1] += eG[i] * eW[i]; e[2] += eB[i] * eW[i]; e[3] += eW[i];
  }
  const N = bk.size, X = new Float64Array(N), Y = new Float64Array(N), Z = new Float64Array(N), W = new Float64Array(N), D2F = new Float64Array(N);
  let i = 0;
  for (const e of bk.values()) {
    X[i] = e[0] / e[3]; Y[i] = e[1] / e[3]; Z[i] = e[2] / e[3]; W[i] = e[3];
    let bd = Infinity; for (const p of fixed) { const dr = X[i] - p.r, dg = Y[i] - p.g, db = Z[i] - p.b; const d = dr * dr + dg * dg + db * db; if (d < bd) bd = d; }
    D2F[i] = bd; i++;
  }
  return { N, X, Y, Z, W, D2F };
};

function augment(fixed, k) {
  const { N, X, Y, Z, W, D2F } = bucket(fixed);
  const rng = createRng(SEED);
  const cx = new Float64Array(k), cy = new Float64Array(k), cz = new Float64Array(k);
  const d2 = new Float64Array(N); for (let i = 0; i < N; i++) d2[i] = D2F[i];
  const draw = (score) => { let t = 0; for (let i = 0; i < N; i++) t += score(i); let r = rng.range(0, 1) * t; for (let i = 0; i < N; i++) { r -= score(i); if (r <= 0) return i; } return N - 1; };
  let pick = draw((i) => W[i] * d2[i]);
  for (let c = 0; c < k; c++) {
    cx[c] = X[pick]; cy[c] = Y[pick]; cz[c] = Z[pick];
    for (let i = 0; i < N; i++) { const dx = X[i] - cx[c], dy = Y[i] - cy[c], dz = Z[i] - cz[c]; const d = dx * dx + dy * dy + dz * dz; if (d < d2[i]) d2[i] = d; }
    if (c + 1 < k) pick = draw((i) => W[i] * d2[i]);
  }
  const asg = new Int32Array(N).fill(-2);
  const sx = new Float64Array(k), sy = new Float64Array(k), sz = new Float64Array(k), sw = new Float64Array(k);
  for (let it = 0; it < MAX_ITERS; it++) {
    let moved = 0; sx.fill(0); sy.fill(0); sz.fill(0); sw.fill(0);
    for (let i = 0; i < N; i++) {
      let best = -1, bd = D2F[i];   // -1 == a FROZEN swatch already wins this point
      for (let c = 0; c < k; c++) { const dx = X[i] - cx[c], dy = Y[i] - cy[c], dz = Z[i] - cz[c]; const d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = c; } }
      if (asg[i] !== best) { asg[i] = best; moved++; }
      if (best >= 0) { const w = W[i]; sx[best] += X[i] * w; sy[best] += Y[i] * w; sz[best] += Z[i] * w; sw[best] += w; }
      d2[i] = bd;
    }
    for (let c = 0; c < k; c++) {
      if (sw[c] > 0) { cx[c] = sx[c] / sw[c]; cy[c] = sy[c] / sw[c]; cz[c] = sz[c] / sw[c]; continue; }
      let worst = 0, ws = -1; for (let i = 0; i < N; i++) { const s = W[i] * d2[i]; if (s > ws) { ws = s; worst = i; } }
      cx[c] = X[worst]; cy[c] = Y[worst]; cz[c] = Z[worst]; d2[worst] = 0;
    }
    if (moved === 0) break;
  }
  return Array.from({ length: k }, (_, c) => {
    const r = Math.max(0, Math.min(255, Math.round(cx[c]))), g = Math.max(0, Math.min(255, Math.round(cy[c]))), b = Math.max(0, Math.min(255, Math.round(cz[c])));
    return { r, g, b, hex: toHex({ r, g, b }), lab: rgbToLab(r, g, b) };
  });
}

/* ── exact scoring over every distinct colour ────────────────────────────────── */
const curD2 = new Float64Array(NX), curDE = new Float64Array(NX), curNear = new Int32Array(NX);
function rebase(extra) {
  const all = [...P, ...extra];
  let m = 0;
  for (let i = 0; i < NX; i++) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < all.length; k++) { const dr = eR[i] - all[k].r, dg = eG[i] - all[k].g, db = eB[i] - all[k].b; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = k; } }
    curD2[i] = bd; curNear[i] = best; curDE[i] = deltaE2000(eLab[i], all[best].lab); m += curDE[i] * eW[i] / totW;
  }
  return m;
}
const gainOf = (c) => { let m = 0; for (let i = 0; i < NX; i++) { const dr = eR[i] - c.r, dg = eG[i] - c.g, db = eB[i] - c.b; const d = dr * dr + dg * dg + db * db; m += (d < curD2[i] ? deltaE2000(eLab[i], c.lab) : curDE[i]) * eW[i] / totW; } return m; };
const sepFrozen = (c) => { let b = Infinity, id = ''; for (const p of P) { const d = deltaE2000(c.lab, p.lab); if (d < b) { b = d; id = p.id; } } return { d: b, id }; };

/* ── candidate pool: the k-sweep, then a second round re-fitted against the
 *    provisional winners so a swatch only visible AFTER the first picks land is
 *    still reachable (that is how the L*16 stone got in). ───────────────────── */
const poolOf = (list) => { const seen = new Set(), out = []; for (const c of list) { if (seen.has(c.hex)) continue; seen.add(c.hex); out.push(c); } return out; };
let CAND = poolOf(SWEEP_K.flatMap((k) => augment(P, k)));
const baseline = rebase([]);
const select = () => {
  const chosen = [], log = []; let mean = rebase([]);
  for (let step = 1; step <= 32; step++) {
    let best = null;
    for (const c of CAND) {
      if (chosen.some((x) => x.hex === c.hex)) continue;
      const sep = Math.min(sepFrozen(c).d, ...chosen.map((x) => deltaE2000(c.lab, x.lab)));
      if (sep < MIN_SEPARATION) continue;
      const m = gainOf(c); if (!best || m < best.m) best = { c, m };
    }
    if (!best || mean - best.m < MIN_GAIN) break;
    const gain = mean - best.m; chosen.push(best.c); mean = rebase(chosen);
    const sf = sepFrozen(best.c);
    log.push({ step, hex: best.c.hex, gain: +gain.toFixed(4), meanAfter: +mean.toFixed(4), nearestFrozen: sf.id, dEToFrozen: +sf.d.toFixed(2) });
  }
  return { chosen, log, mean };
};
let r = select();
CAND = poolOf([...CAND, ...augment([...P, ...r.chosen], 8)]);
r = select();
const NEW = r.chosen;

/* ── SAFETY CONSTRAINTS the surrounding code imposes on any appended swatch ────
 * (1) tests/unit/postprocess.test.ts:468 — every removing class flood-fills white at
 *     backgroundTolerance 24 and asserts EXACTLY ONE swatch is inside it. Max per-channel
 *     deviation from #ffffff must therefore be > 24, or the fill eats light content.
 * (2) tests/unit/game-menu-model.test.ts:252 and tests/unit/survey-view.test.ts:2393 assert that
 *     a list of retired hexes is NOT a swatch. An appended swatch may not collide with one. */
/**
 * What each appended swatch is FOR. Authored, not derived — the fit finds the colour, a human
 * says what it serves, and the pairing is what makes the append reviewable. Keyed by hex so a
 * re-run that moves an id keeps the annotation attached to the colour it describes.
 */
const ROLE = {
  '#111521': 'deepest shadow under stone and canopy — sits between c00 and the slate ramp',
  '#28282d': 'basalt shadow (Cindershelf, Sanctum) — the mass that used to land on the c30 navy',
  '#403d42': 'dark slate — wall shadow, wet rock',
  '#5a595a': 'mid-dark stone — the single largest hole in the frozen palette',
  '#7e7c7f': 'mid stone / ash — dry path, cut block',
  '#abaaa9': 'light stone / dry dirt path in sun',
  '#c58b42': 'mid ochre — timber, thatch in shade',
  '#e1ab4e': 'lit ochre — thatch and dry grass in sun',
  '#e9e2bf': 'pale sand / bleached stone — warm high-key ground',
  '#275126': 'deep canopy shadow',
  '#508323': 'mid canopy green',
  '#21415c': 'deep still water',
  '#385577': 'dusk water / distant ridge haze',
  '#13194d': 'night depth — Vale sky at its darkest',
  '#3a54b2': 'deep dusk blue',
  '#4c72e9': 'dusk water and Vale sky — the single largest error source in the frozen palette',
};
const RETIRED = ['#0d0f0c','#d8d8c8','#6d7268','#f2c14e','#e05a4a','#8fbf6f','#e8e4d8','#8a8676','#d8a24a','#14140f','#c26a6a','#8a3b3b','#4f6d4a','#14171a','#23282c','#ffd76a','#e8e4c9','#7d8478','#3a4038','#8fb08a'];
const violations = [];
for (const c of NEW) {
  const dev = Math.max(Math.abs(255 - c.r), Math.abs(255 - c.g), Math.abs(255 - c.b));
  if (dev <= 24) violations.push(`${c.hex}: max-channel deviation from #ffffff is ${dev}, must exceed the backgroundTolerance of 24`);
  if (RETIRED.includes(c.hex.toLowerCase())) violations.push(`${c.hex}: collides with a retired hex asserted absent`);
  if (P.some((p) => p.hex.toLowerCase() === c.hex.toLowerCase())) violations.push(`${c.hex}: duplicates a frozen swatch`);
}
if (violations.length) throw new Error('appended swatch violates a downstream invariant:\n  ' + violations.join('\n  '));

/* ── order the NEW BLOCK ONLY by fit.mjs's ramp rule, then append ───────────── */
const NEUTRAL_CHROMA = 10;
const ordered = NEW.map((s) => ({ ...s, chroma: Math.hypot(s.lab.a, s.lab.b), hue: (Math.atan2(s.lab.b, s.lab.a) * 180 / Math.PI + 360) % 360 }))
  .sort((x, y) => { const nx = x.chroma < NEUTRAL_CHROMA, ny = y.chroma < NEUTRAL_CHROMA;
    if (nx !== ny) return nx ? -1 : 1; if (nx) return x.lab.L - y.lab.L;
    const hb = (h) => Math.floor(h / 30); if (hb(x.hue) !== hb(y.hue)) return hb(x.hue) - hb(y.hue); return x.lab.L - y.lab.L; });
const appended = ordered.map((s, i) => ({ id: `c${String(32 + i).padStart(2, '0')}`, hex: s.hex }));
const colors = [...pal.colors, ...appended];
if (JSON.stringify(colors.slice(0, 32)) !== JSON.stringify(pal.colors)) throw new Error('the frozen 32 moved — this script may only append');

/* ── measure: before / after, exactly ───────────────────────────────────────── */
const assign = (all) => { const near = new Int32Array(NX), de = new Float64Array(NX);
  for (let i = 0; i < NX; i++) { let best = 0, bd = Infinity;
    for (let k = 0; k < all.length; k++) { const dr = eR[i] - all[k].r, dg = eG[i] - all[k].g, db = eB[i] - all[k].b; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = k; } }
    near[i] = best; de[i] = deltaE2000(eLab[i], all[best].lab); } return { near, de }; };
const A0 = assign(P), A1 = assign([...P, ...NEW]);
const meanOf = (A) => { let m = 0; for (let i = 0; i < NX; i++) m += A.de[i] * eW[i] / totW; return m; };
const images = [], biomes = new Map();
for (const im of perImage) {
  let b = 0, a = 0; for (const [k, c] of im.hist) { const i = key2i.get(k); b += A0.de[i] * c / im.sum; a += A1.de[i] * c / im.sum; }
  images.push({ id: im.id, biome: im.biome, file: im.file, distinct: im.distinct, before: +b.toFixed(3), after: +a.toFixed(3), reductionPct: +(100 * (b - a) / b).toFixed(1) });
  let e = biomes.get(im.biome); if (!e) { e = { b: 0, a: 0, n: 0 }; biomes.set(im.biome, e); } e.b += b; e.a += a; e.n++;
}
const axis = []; for (let L = 5; L <= 95; L += 5) { const t = { L, a: 0, b: 0 };
  const nb = (set) => { let bd = Infinity, bi = null; for (const s of set) { const d = deltaE2000(t, s.lab); if (d < bd) { bd = d; bi = s; } } return { bd, bi }; };
  const r0 = nb(P), r1 = nb([...P, ...NEW]); axis.push({ L, before: +r0.bd.toFixed(1), after: +r1.bd.toFixed(1), winner: r1.bi.hex, winnerIsNew: !r1.bi.id }); }
const tan = []; const th = 65 * Math.PI / 180; for (let L = 30; L <= 85; L += 5) { const t = { L, a: 25 * Math.cos(th), b: 25 * Math.sin(th) };
  const nb = (set) => { let bd = Infinity, bi = null; for (const s of set) { const d = deltaE2000(t, s.lab); if (d < bd) { bd = d; bi = s; } } return { bd, bi }; };
  const r0 = nb(P), r1 = nb([...P, ...NEW]); tan.push({ L, before: +r0.bd.toFixed(1), after: +r1.bd.toFixed(1), winner: r1.bi.hex, winnerIsNew: !r1.bi.id }); }
let movedMass = 0; for (let i = 0; i < NX; i++) if (A1.near[i] >= P.length) movedMass += eW[i];

const report = {
  method: 'augmenting weighted k-means: the frozen 32 are fixed centres, new centres are fitted only to the colour mass they serve worst; assignment is nearest-in-sRGB, exactly tools/postprocess/steps.ts::quantize',
  determinism: `k-means++ seeded at ${SEED} via core/rng.ts (no Math.random, G11); re-running reproduces colors[] byte-identically`,
  errorMetric: 'CIEDE2000',
  countDerivation: `candidates added one at a time by largest MEASURED marginal reduction in weighted mean ΔE2000; stopped when the best remaining candidate was worth less than ${MIN_GAIN}. The count was not chosen.`,
  separationNote: `MIN_SEPARATION ${MIN_SEPARATION} is an anti-duplicate floor, NOT the redundancy test. A ΔE2000 separation threshold misfires in the dark end: #29272e is 7.8 ΔE from c30 #272940 yet is among the most valuable swatches available, because c30 is a navy and #29272e is neutral. Marginal value is measured directly instead.`,
  sourcesExcluded: {
    'assets/final/maps/**': 'already quantized to the frozen palette (17-32 distinct colours measured) — fitting to these would fit the palette to itself',
    'assets/reference/**': 'FORBIDDEN. Pokemon reference images, inspiration-only per assets/reference/README.md; deriving our palette from them would bake another game\'s palette into this one.',
    'assets/raw/_trials/topdown-examples/control-*.png': 'ControlNet control images — black line art on white, 256 greyscale values, not colour art',
  },
  sources: SOURCES, selection: r.log,
  baselineMeanDeltaE2000: +baseline.toFixed(4),
  expandedMeanDeltaE2000: +meanOf(A1).toFixed(4),
  reductionPct: +(100 * (baseline - meanOf(A1)) / baseline).toFixed(1),
  sourceMassReassignedToNewSwatchPct: +(100 * movedMass / totW).toFixed(1),
  perImage: images,
  perBiome: [...biomes].map(([biome, e]) => ({ biome, before: +(e.b / e.n).toFixed(3), after: +(e.a / e.n).toFixed(3), reductionPct: +(100 * (e.b - e.a) / e.b).toFixed(1) })),
  neutralGreyAxis: axis, midTanOchreAxis: tan,
  appended: appended.map((c, i) => { const s = ordered[i], sf = sepFrozen(s);
    return { id: c.id, hex: c.hex, role: ROLE[c.hex] ?? '(unannotated — a re-run moved this colour; describe it)', L: +s.lab.L.toFixed(1), chroma: +s.chroma.toFixed(1), nearestFrozen: sf.id, dEToNearestFrozen: +sf.d.toFixed(2),
      maxChannelDeviationFromWhite: Math.max(Math.abs(255 - s.r), Math.abs(255 - s.g), Math.abs(255 - s.b)) }; }),
  colorsSha256: createHash('sha256').update(JSON.stringify(colors)).digest('hex'),
  frozenPrefixUnchanged: true,
};

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/_fit-report.json`, JSON.stringify(report, null, 2) + '\n');
await writeFile(`${OUT}/palette.expanded.json`, JSON.stringify({
  _comment: `PROPOSAL — NOT FROZEN. An APPEND-ONLY expansion of data/palette.json: c00-c31 are byte-identical to the frozen palette and only c32+ are new, so no existing slot changes meaning and no UI_SWATCH role needs re-pointing (the T-15 failure mode cannot occur). data/palette.json is untouched. Regenerate with \`npx tsx ${OUT}/expand.mjs\` (deterministic, k-means++ seeded at 42 via core/rng.ts). Evidence in ${OUT}/_fit-report.json.`,
  _method: { algorithm: report.method, determinism: report.determinism, errorMetric: 'CIEDE2000', countDerivation: report.countDerivation, separationNote: report.separationNote, sourcesExcluded: report.sourcesExcluded },
  _validation: Object.fromEntries(images.map((i) => [i.id, { meanDeltaE2000Before: i.before, meanDeltaE2000After: i.after, reductionPct: i.reductionPct }])),
  frozen: false, frozenAt: null,
  source: `PROPOSAL — append-only expansion over ${SOURCES.length} raw biome-representative map sources, augmenting k-means seeded 42; nothing is swapped`,
  colorCount: colors.length, colors,
}, null, 2) + '\n');

const SW = 96, COLS = 8, rows = Math.ceil(colors.length / COLS);
await sharp({ create: { width: SW * COLS, height: SW * rows, channels: 3, background: '#000000' } })
  .composite(colors.map((c, i) => ({ input: { create: { width: SW, height: SW, channels: 3, background: c.hex } }, left: (i % COLS) * SW, top: Math.floor(i / COLS) * SW })))
  .png().toFile(`${OUT}/_palette-swatches.png`);

console.log(`\nDERIVED COUNT: ${NEW.length} new swatches -> ${colors.length} total`);
console.log(`mean ΔE2000 ${baseline.toFixed(4)} -> ${meanOf(A1).toFixed(4)}  (-${report.reductionPct}%)`);
console.log(`neutral axis worst-case ${Math.max(...axis.map(a=>a.before)).toFixed(1)} -> ${Math.max(...axis.map(a=>a.after)).toFixed(1)}`);
console.log(`mid-tan axis worst-case ${Math.max(...tan.map(a=>a.before)).toFixed(1)} -> ${Math.max(...tan.map(a=>a.after)).toFixed(1)}`);
console.log(`colors[] sha256 ${report.colorsSha256}`);
for (const a of report.appended) console.log(`  ${a.id} ${a.hex}  L*${String(a.L).padStart(5)} C${String(a.chroma).padStart(5)}  nearest frozen ${a.nearestFrozen} at ${a.dEToNearestFrozen} ΔE`);
