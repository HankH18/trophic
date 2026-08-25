/**
 * tools/palette/decision-sheet.mjs — ONE image that answers "which palette should I ship?"
 *
 * There are three options, not two: keep the frozen 32, adopt the broadened candidate, or adopt the
 * class-equal variant. The evidence for them is already on disk in five places — swatch strips, the
 * §9.3 at-game-size strips, the cross-view statics, the 1024² three-way panels, and two `_compare.json`
 * tables. Spread across five directories that is not a decision; it is homework. This assembles them
 * in the order the decision is actually made:
 *
 *   0. the verdict, in numbers        — the three options side by side, before any picture
 *   0b. the pipeline-integrity strip  — proof that what follows is a palette difference
 *   1. the three palettes as swatches — what is being swapped
 *   2. AT SHIP SIZE, real §9.3 chain  — the only view anybody will ever see
 *   3. at 1024², worst-first          — ORIGINAL | FROZEN | CANDIDATE | CLASS-EQ + ΔE heat maps
 *
 * Ship size comes BEFORE the 1024² panels deliberately. A 1024² render is not an asset; judging a
 * palette on one is the same error as judging a sprite on its concept art.
 *
 * SECTION 0b EXISTS BECAUSE THIS SHEET WAS WRONG ONCE. Its previous version was assembled from
 * strips written at a hardcoded background tolerance of 12, which cleared exactly zero pixels under
 * both candidate palettes: every CANDIDATE and CLASS-EQ sprite on it was a solid opaque rectangle
 * beside a correctly cut-out FROZEN one (B-D22 → B-D33 → B-D50). A viewer judging by eye would have
 * rejected both candidates for a reason that had nothing to do with their colours, and nothing on
 * the sheet let them tell a palette problem from a pipeline problem. So every panel now names its
 * palette, and the opaque-pixel count that proves step 3 fired is printed before any picture.
 *
 *   node tools/palette/decision-sheet.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';

const DIR = 'assets/approved-trials/_palette-candidate';
const FREEZE = 'assets/approved-trials/_palette-freeze';
const OUT = `${DIR}/_DECISION-SHEET.png`;
const W = 1600;
const BG = '#0d0f0c';

const cmpCand = JSON.parse(await readFile(`${DIR}/_compare.json`, 'utf8'));
const cmpCeq = JSON.parse(await readFile(`${DIR}/classequal/_compare.json`, 'utf8'));
const ship = JSON.parse(await readFile(`${DIR}/at-game-size/_at-game-size-compare.json`, 'utf8'));
const previews = JSON.parse(await readFile(`${DIR}/decision-previews/_index.json`, 'utf8'));

/** The three options, in decision order. `key` indexes the two `_compare.json` files. */
const OPTIONS = [
  { name: 'FROZEN', path: cmpCand.frozen, src: cmpCand, key: 'frozen', blurb: 'keep what is frozen' },
  { name: 'CANDIDATE', path: cmpCand.candidate, src: cmpCand, key: 'candidate', blurb: 'broaden, per-image weighting' },
  { name: 'CLASS-EQ', path: cmpCeq.candidate, src: cmpCeq, key: 'candidate', blurb: 'broaden, class-balanced weighting' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const heading = (text, sub) => Buffer.from(
  `<svg width="${W}" height="${sub ? 78 : 52}">`
  + '<rect width="100%" height="100%" fill="#161a14"/>'
  + `<text x="18" y="34" font-family="monospace" font-size="24" fill="#e8f2dd">${esc(text)}</text>`
  + (sub ? `<text x="18" y="63" font-family="monospace" font-size="15" fill="#8fae7a">${esc(sub)}</text>` : '')
  + '</svg>');

const caption = (text, colour = '#cfe3c0', bg = '#1b1d1a') => Buffer.from(
  `<svg width="${W}" height="32"><rect width="100%" height="100%" fill="${bg}"/>`
  + `<text x="18" y="22" font-family="monospace" font-size="15" fill="${colour}">${esc(text)}</text></svg>`);

const parts = [];
let y = 0;
const add = (input, height, width = W) => {
  parts.push({ input, left: Math.round((W - width) / 2), top: y });
  y += height;
};
const fit = async (file, maxW = W) => {
  const buf = await sharp(file).resize({ width: maxW, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const m = await sharp(buf).metadata();
  add(buf, m.height, m.width);
};

/* ── title ─────────────────────────────────────────────────────────────────── */
add(Buffer.from(
  `<svg width="${W}" height="150"><rect width="100%" height="100%" fill="#0b1a10"/>`
  + `<text x="18" y="46" font-family="monospace" font-size="30" fill="#9fe08a">PALETTE DECISION — which of three do we ship?</text>`
  + `<text x="18" y="80" font-family="monospace" font-size="16" fill="#8fae7a">${esc(`data/palette.json is FROZEN and untouched. Nothing has been swapped — this sheet prepares the call, it does not take it.`)}</text>`
  + `<text x="18" y="106" font-family="monospace" font-size="16" fill="#8fae7a">${esc(`Read section 0 and section 2 and you have the answer. Sections 1 and 3 are the working.`)}</text>`
  + `<text x="18" y="134" font-family="monospace" font-size="16" fill="#e8c07a">${esc(`REGENERATED after B-D50. The previous edition of this sheet showed every CANDIDATE and CLASS-EQ sprite as a solid rectangle — see section 0b.`)}</text>`
  + '</svg>'), 150);

/* ── 0. the verdict, in numbers, before any picture ────────────────────────── */
add(heading('0 — THE VERDICT, IN NUMBERS', 'Every figure below is measured over the same 21-image validation set, scored the way steps.ts::quantize scores it, reported in CIEDE2000.'), 78);

const COL = Math.floor((W - 40) / 3);
const bestOf = (vals) => Math.min(...vals);
// The `_compare.json` figures are stored to 3 dp, and `22.275.toFixed(2)` is "22.27" in JS because
// 22.275 is really 22.274999…. The console tables round the full-precision value and print 22.28.
// Nudge before rounding so the sheet and the tables never disagree by a hundredth — a decision
// document that contradicts its own source is a document nobody trusts twice.
const fmt = (v) => (typeof v === 'number' ? (Math.round(v * 100 + 1e-6) / 100).toFixed(2) : String(v));

/** Rows of the verdict card: label, then a value per option, then whether low is good. */
const meanOfMeans = OPTIONS.map((o) => o.src.perImage.reduce((a, p) => a + p[o.key].mean, 0) / o.src.perImage.length);
const worstImage = OPTIONS.map((o) => Math.max(...o.src.perImage.map((p) => p[o.key].mean)));
const feature = (name, i) => OPTIONS[i].src.namedFeatures[name][OPTIONS[i].key].mean;
const probe = (name, i) => OPTIONS[i].src.coolProbes.find((p) => p.probe === name)[OPTIONS[i].key].deltaE;

const VERDICT_ROWS = [
  ['— OVERALL —', null],
  ['mean of per-image means', [0, 1, 2].map((i) => meanOfMeans[i])],
  ['worst per-image mean', [0, 1, 2].map((i) => worstImage[i])],
  ['— THE PLAYER (L6 identity) —', null],
  ['star yellow', [0, 1, 2].map((i) => feature('star yellow', i))],
  ['shirt/cap green', [0, 1, 2].map((i) => feature('shirt/cap green', i))],
  ['skin', [0, 1, 2].map((i) => feature('skin', i))],
  ['leather brown', [0, 1, 2].map((i) => feature('leather brown', i))],
  ['dark outline', [0, 1, 2].map((i) => feature('dark outline', i))],
  ['— THE COOL HALF (B-D13 probes) —', null],
  ['deep water  #1b4f7a', [0, 1, 2].map((i) => probe('deep water', i))],
  ['sky blue  #7ec8f0', [0, 1, 2].map((i) => probe('sky blue', i))],
  ['marsh teal  #2f7f7a', [0, 1, 2].map((i) => probe('marsh teal', i))],
  ['ice cyan  #a8e8ea', [0, 1, 2].map((i) => probe('ice cyan', i))],
  ['purple  #7a4fa3', [0, 1, 2].map((i) => probe('purple', i))],
  ['magenta  #c04a9a', [0, 1, 2].map((i) => probe('magenta', i))],
];

const RH = 26, HDR = 96;
const cardH = HDR + VERDICT_ROWS.length * RH + 128;
{
  const LBLW = 300;
  const colX = (i) => LBLW + i * Math.floor((W - LBLW - 24) / 3);
  const colW = Math.floor((W - LBLW - 24) / 3);
  let svg = `<svg width="${W}" height="${cardH}"><rect width="100%" height="100%" fill="#12140f"/>`;
  for (const [i, o] of OPTIONS.entries()) {
    svg += `<rect x="${colX(i)}" y="8" width="${colW - 8}" height="${HDR - 16}" fill="${i === 2 ? '#16281a' : '#181c16'}"/>`
      + `<text x="${colX(i) + 14}" y="38" font-family="monospace" font-size="21" fill="${i === 2 ? '#9fe08a' : '#e8f2dd'}">${esc(o.name)}${i === 2 ? '   ← recommended' : ''}</text>`
      + `<text x="${colX(i) + 14}" y="60" font-family="monospace" font-size="13" fill="#8fae7a">${esc(o.blurb)}</text>`
      // the path, elided from the LEFT so the filename — the part that identifies the palette —
      // is always the part that survives the column width
      + `<text x="${colX(i) + 14}" y="78" font-family="monospace" font-size="12" fill="#6f8a5f">${
        esc(o.path.length > 40 ? `…/${o.path.split('/').pop()}` : o.path)}</text>`;
  }
  for (const [r, [label, vals]] of VERDICT_ROWS.entries()) {
    const ty = HDR + r * RH + 18;
    if (!vals) {
      svg += `<rect x="0" y="${HDR + r * RH}" width="${W}" height="${RH}" fill="#1b2018"/>`
        + `<text x="18" y="${ty}" font-family="monospace" font-size="15" fill="#8fae7a">${esc(label)}</text>`;
      continue;
    }
    if (r % 2) svg += `<rect x="0" y="${HDR + r * RH}" width="${W}" height="${RH}" fill="#15180f"/>`;
    svg += `<text x="18" y="${ty}" font-family="monospace" font-size="15" fill="#cfe3c0">${esc(label)}</text>`;
    const best = bestOf(vals);
    for (const [i, v] of vals.entries()) {
      const isBest = Math.abs(v - best) < 0.005;
      svg += `<text x="${colX(i) + 14}" y="${ty}" font-family="monospace" font-size="16" fill="${isBest ? '#9fe08a' : v > best * 2 ? '#e8907a' : '#d9d2b4'}">`
        + `${esc(fmt(v))}${isBest ? '  ◀ best' : ''}</text>`;
    }
  }
  const foot = HDR + VERDICT_ROWS.length * RH;
  svg += `<rect x="0" y="${foot}" width="${W}" height="128" fill="#0f1a12"/>`
    + `<text x="18" y="${foot + 26}" font-family="monospace" font-size="15" fill="#e8f2dd">WHAT EACH OPTION COSTS — lower is better everywhere above; no column wins every row.</text>`
    + `<text x="18" y="${foot + 50}" font-family="monospace" font-size="14" fill="#e8907a">FROZEN     serves the warm half and has no cool half at all: every cool probe is 16–43, and Puddlisk — a starter — ships grey.</text>`
    + `<text x="18" y="${foot + 72}" font-family="monospace" font-size="14" fill="#d9d2b4">CANDIDATE  best overall and best on the cool half, but it spends the player: dark outline 3.78 → 11.07, skin 4.02 → 7.95.</text>`
    + `<text x="18" y="${foot + 94}" font-family="monospace" font-size="14" fill="#9fe08a">CLASS-EQ   keeps almost all the cool gain AND the player's identity bands (shirt/cap green even improves); pays on the creature class.</text>`
    + `<text x="18" y="${foot + 116}" font-family="monospace" font-size="14" fill="#8fae7a">Section 2 is where that trade is visible rather than tabulated. Look at puddlisk and at fox-cindril.</text>`;
  add(Buffer.from(svg + '</svg>'), cardH);
}

/* ── 0b. pipeline integrity ────────────────────────────────────────────────── */
add(heading('0b — IS THIS A PALETTE DIFFERENCE OR A PIPELINE DIFFERENCE?',
  'Background removal (§9.3 step 3) runs AFTER quantize, so it must match whatever the palette maps white to. Its tolerance is read from the manifest, never hardcoded (B-D50).'), 78);
{
  const rows = ship.subjects;
  const h = 66 + rows.length * 26 + 96;
  let svg = `<svg width="${W}" height="${h}"><rect width="100%" height="100%" fill="#12140f"/>`
    + `<text x="18" y="28" font-family="monospace" font-size="16" fill="#e8f2dd">opaque pixels remaining after background removal, per subject per palette</text>`
    + `<text x="18" y="52" font-family="monospace" font-size="14" fill="#8fae7a">A count EQUAL to the frame means step 3 cleared nothing and the sprite is a solid rectangle. That is a pipeline failure, not a palette one.</text>`;
  svg += `<text x="18" y="${66 + 18}" font-family="monospace" font-size="15" fill="#8fae7a">subject</text>`
    + `<text x="300" y="${66 + 18}" font-family="monospace" font-size="15" fill="#8fae7a">frame</text>`
    + OPTIONS.map((o, i) => `<text x="${430 + i * 240}" y="${66 + 18}" font-family="monospace" font-size="15" fill="#8fae7a">${esc(o.name)}</text>`).join('')
    + `<text x="${430 + 3 * 240}" y="${66 + 18}" font-family="monospace" font-size="15" fill="#8fae7a">verdict</text>`;
  let bad = 0;
  for (const [r, s] of rows.entries()) {
    const ty = 66 + (r + 1) * 26 + 18;
    if (r % 2) svg += `<rect x="0" y="${66 + (r + 1) * 26}" width="${W}" height="26" fill="#15180f"/>`;
    const frame = s.palettes.FROZEN.framePixels;
    const solid = OPTIONS.some((o) => s.palettes[o.name].opaqueAfterBackgroundRemoval === frame);
    if (solid) bad++;
    svg += `<text x="18" y="${ty}" font-family="monospace" font-size="15" fill="#cfe3c0">${esc(`${s.id}  ${s.size}`)}</text>`
      + `<text x="300" y="${ty}" font-family="monospace" font-size="15" fill="#8fae7a">${frame}</text>`
      + OPTIONS.map((o, i) => {
        const v = s.palettes[o.name].opaqueAfterBackgroundRemoval;
        return `<text x="${430 + i * 240}" y="${ty}" font-family="monospace" font-size="15" fill="${v === frame ? '#ff8a6a' : '#d9d2b4'}">${v}</text>`;
      }).join('')
      + `<text x="${430 + 3 * 240}" y="${ty}" font-family="monospace" font-size="15" fill="${solid ? '#ff8a6a' : '#9fe08a'}">${
        solid ? 'SOLID RECTANGLE — DO NOT JUDGE' : 'all three cut, and they converge'}</text>`;
  }
  const foot = 66 + (rows.length + 1) * 26 + 12;
  svg += bad
    ? `<text x="18" y="${foot + 24}" font-family="monospace" font-size="17" fill="#ff8a6a">${esc(`${bad} subject(s) are still solid rectangles. The sprites below are NOT comparable — fix the pipeline before judging the palette.`)}</text>`
    : `<text x="18" y="${foot + 24}" font-family="monospace" font-size="17" fill="#9fe08a">All three palettes cut out on all ${rows.length} subjects, within a few pixels of each other. Every difference you see below is a COLOUR difference.</text>`;
  svg += `<text x="18" y="${foot + 50}" font-family="monospace" font-size="14" fill="#8fae7a">${esc('For contrast, at the pre-B-D50 hardcoded tolerance of 12 these same candidate strips measured 1536/1536 and 9216/9216 — every one a filled box.')}</text>`;
  add(Buffer.from(svg + '</svg>'), h);
}

/* ── 1. swatches ───────────────────────────────────────────────────────────── */
add(heading('1 — THE SWAP', 'All three palettes, 32 swatches each, ids c00–c31 in the same positions — so any swap is a value swap and nothing downstream re-indexes.'), 78);
{
  const SW = 46, COLS = 16, LABH = 26, PAD = 12;
  const rows = Math.ceil(32 / COLS);
  const blockH = LABH + rows * SW + PAD;
  const h = OPTIONS.length * blockH + PAD;
  const swatchParts = [];
  let sy = PAD;
  for (const o of OPTIONS) {
    const f = JSON.parse(await readFile(o.path, 'utf8'));
    swatchParts.push({
      input: Buffer.from(`<svg width="${W}" height="${LABH}"><rect width="100%" height="100%" fill="#12140f"/>`
        + `<text x="18" y="19" font-family="monospace" font-size="16" fill="#cfe3c0">${esc(`${o.name}   ${o.path}`)}</text></svg>`),
      left: 0, top: sy,
    });
    for (const [i, c] of f.colors.entries()) {
      swatchParts.push({
        input: { create: { width: SW, height: SW, channels: 3, background: c.hex } },
        left: 18 + (i % COLS) * SW, top: sy + LABH + Math.floor(i / COLS) * SW,
      });
    }
    sy += blockH;
  }
  const buf = await sharp({ create: { width: W, height: h, channels: 3, background: '#0d0f0c' } })
    .composite(swatchParts).png().toBuffer();
  add(buf, h);
}

/* ── 2. ship size ──────────────────────────────────────────────────────────── */
add(heading('2 — AT SHIP SIZE, through the real §9.3 chain (trim → downscale → quantize → background removal)',
  'player 32×48 · creatures 96² · nearest-neighbour zoom, on a dark ground so the cut-out edge is visible. This is the only view that exists in the game.'), 78);
const GAME_NOTE = {
  player: 'THE IDENTITY LOCK (L6). The star badge holds 16 px on a single yellow under all three — it survives either swap.',
  puddlisk: 'THE CASE FOR A SWAP. Puddlisk is a STARTER (bible §4 row 2). Under the frozen palette it ships GREY.',
  fenmaw: 'Water Apex, Marsh (bible §4 row 12). Frozen loses every cool pixel on this sprite.',
  duskstalk: 'Dark Apex (bible §4 row 17). Frozen loses every cool pixel here too.',
  'fox-cindril': 'THE COST. Cindril is warm and the frozen palette already serves it — this is what broadening spends.',
};
const ORDER = ['player', 'puddlisk', 'fenmaw', 'duskstalk', 'fox-cindril'];
const gameFiles = (await readdir(`${DIR}/at-game-size`)).filter((f) => f.startsWith('_') && f.endsWith('-COMPARE.png'));
const keyOf = (f) => ORDER.find((k) => f.startsWith(`_${k}-`));
gameFiles.sort((a, b) => ORDER.indexOf(keyOf(a)) - ORDER.indexOf(keyOf(b)));
for (const f of gameFiles) {
  const key = keyOf(f);
  const s = ship.subjects.find((x) => x.id === key);
  add(caption(`${key}   —   ${GAME_NOTE[key] ?? ''}`, '#f0e2a0'), 32);
  if (s) {
    add(caption('   quantize ΔE mean/max · '
      + OPTIONS.map((o) => `${o.name} ${fmt(s.palettes[o.name].quantizeMeanDeltaE)}/${s.palettes[o.name].quantizeMaxDeltaE.toFixed(1)}`).join('   ')
      + `   ·   opaque ${OPTIONS.map((o) => s.palettes[o.name].opaqueAfterBackgroundRemoval).join('/')} of ${s.palettes.FROZEN.framePixels}`,
    '#8fae7a', '#12140f'), 32);
  }
  await fit(`${DIR}/at-game-size/${f}`);
}
add(caption('the player across all three views, per palette — does he still read as ONE character after the swap? (§9.6 asks this of the walk cycle)', '#f0e2a0'), 32);
for (const [i, o] of OPTIONS.entries()) {
  const dir = i === 0 ? `${FREEZE}/cross-view` : `${DIR}/cross-view-${o.name}`;
  const cv = JSON.parse(await readFile(`${dir}/_cross-view.json`, 'utf8'));
  const diverge = Object.entries(cv.bands).filter(([, b]) => !b.dominantAgrees).map(([n]) => n);
  add(caption(`   ${o.name}   front/back/side 32×48   ·   opaque ${cv.views.map((v) => v.opaquePixels).join('/')} of 1536`
    + `   ·   dominant swatch AGREES on ${5 - diverge.length}/5 identity bands${diverge.length ? `; diverges on ${diverge.join(', ')}` : ''}`,
  diverge.length > 2 ? '#e8a08a' : '#9fe08a', '#12140f'), 32);
  await fit(`${dir}/_three-statics-32x48.png`, 1180);
}

/* ── 3. 1024² ──────────────────────────────────────────────────────────────── */
add(heading('3 — AT 1024²: ORIGINAL | FROZEN | CANDIDATE | CLASS-EQ, each with its own ΔE heat map',
  'Ordered worst-first by how much the FROZEN palette misses. Heat map: black 0 → red ≈5 → yellow ≈10 → WHITE-HOT 15+; the blue field is the un-scored backdrop.'), 78);
for (const im of previews.images) {
  const best = Math.min(...OPTIONS.map((o) => im.mean[o.name]));
  add(caption(`${im.id.padEnd(16)} mean ΔE  `
    + OPTIONS.map((o) => `${o.name} ${fmt(im.mean[o.name])}${im.mean[o.name] === best ? '◀' : ' '}`).join('   ')
    + `   ·   visibly wrong (ΔE≥10) `
    + OPTIONS.map((o) => `${o.name} ${im.pctContentAtOrAboveDeltaE10[o.name].toFixed(1)}%`).join('  ')
    + `   ·   ${im.set}`,
  im.mean.FROZEN === best ? '#cfe3c0' : '#9fe08a'), 32);
  await fit(im.file);
}

add(caption(`numbers: ${DIR}/_compare.json · ${DIR}/classequal/_compare.json · ${DIR}/at-game-size/_at-game-size-compare.json · ${DIR}/decision-previews/_index.json`, '#6f8a5f'), 32);

await sharp({ create: { width: W, height: y, channels: 3, background: BG } })
  .composite(parts).png().toFile(OUT);
console.log(`${OUT}  (${W}x${y})`);
