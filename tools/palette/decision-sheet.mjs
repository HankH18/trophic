/**
 * tools/palette/decision-sheet.mjs — one image that answers "should the palette be re-frozen?"
 *
 * The evidence is already on disk in three places (swatch strips, the §9.3 at-game-size strips, the
 * 1024² before/after + heatmap strips). Spread across three directories it is not a decision; it is
 * homework. This assembles them into a single scrollable sheet in the order the decision is actually
 * made:
 *
 *   1. the three palettes as swatches            — what is being swapped
 *   2. AT SHIP SIZE, through the real §9.3 chain — the only view anybody will ever see
 *   3. at 1024², original | frozen | candidate, with both ΔE heatmaps — where the error lands
 *
 * Ship size comes BEFORE the 1024² panels deliberately. A 1024² render is not an asset; judging a
 * palette on one is the same error as judging a sprite on its concept art.
 *
 *   node tools/palette/decision-sheet.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';

const DIR = 'assets/approved-trials/_palette-candidate';
const OUT = `${DIR}/_DECISION-SHEET.png`;
const W = 1400;
const BG = '#0d0f0c';

const cmp = JSON.parse(await readFile(`${DIR}/_compare.json`, 'utf8'));
const byId = Object.fromEntries(cmp.perImage.map((p) => [p.id, p]));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const heading = (text, sub) => Buffer.from(
  `<svg width="${W}" height="${sub ? 74 : 50}">`
  + `<rect width="100%" height="100%" fill="#161a14"/>`
  + `<text x="16" y="32" font-family="monospace" font-size="23" fill="#e8f2dd">${esc(text)}</text>`
  + (sub ? `<text x="16" y="60" font-family="monospace" font-size="15" fill="#8fae7a">${esc(sub)}</text>` : '')
  + '</svg>');

const caption = (text, colour = '#cfe3c0') => Buffer.from(
  `<svg width="${W}" height="30"><rect width="100%" height="100%" fill="#1b1d1a"/>`
  + `<text x="16" y="21" font-family="monospace" font-size="15" fill="${colour}">${esc(text)}</text></svg>`);

const parts = [];
let y = 0;
const add = async (input, height, width = W) => {
  parts.push({ input, left: Math.round((W - width) / 2), top: y });
  y += height;
};
const fit = async (file, maxW = W) => {
  const buf = await sharp(file).resize({ width: maxW, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const m = await sharp(buf).metadata();
  await add(buf, m.height, m.width);
};

/* ── title ─────────────────────────────────────────────────────────────────── */
await add(Buffer.from(
  `<svg width="${W}" height="118"><rect width="100%" height="100%" fill="#0b1a10"/>`
  + `<text x="16" y="42" font-family="monospace" font-size="27" fill="#9fe08a">PALETTE RE-FREEZE — candidate vs the frozen 32</text>`
  + `<text x="16" y="72" font-family="monospace" font-size="15" fill="#8fae7a">data/palette.json is FROZEN and untouched. data/palette.candidate.json is a proposal; nothing has been swapped.</text>`
  + `<text x="16" y="98" font-family="monospace" font-size="15" fill="#8fae7a">CLASS-EQ is a second measured option, same source set, class-balanced weighting. Numbers: ${DIR}/_compare.json</text>`
  + '</svg>'), 118);

/* ── 1. swatches ───────────────────────────────────────────────────────────── */
await add(heading('1 — THE SWAP', 'top: the frozen 32.  bottom: the candidate 32. ids c00–c31 are positional, so this is a value swap.'), 74);
await fit(`${DIR}/_SWATCHES-frozen-vs-candidate.png`);
await add(caption('CLASS-EQ variant swatches: ' + `${DIR}/classequal/_palette-swatches.png`), 30);

/* ── 2. ship size ──────────────────────────────────────────────────────────── */
await add(heading('2 — AT SHIP SIZE, through the real §9.3 chain (trim → downscale → quantize → background removal)',
  'player 32×48 · creatures 96² · nearest-neighbour zoom. This is the only view that exists in the game.'), 74);
const gameFiles = (await readdir(`${DIR}/at-game-size`)).filter((f) => f.startsWith('_') && f.endsWith('-COMPARE.png')).sort();
const ORDER = ['_player-', '_puddlisk-', '_fenmaw-', '_duskstalk-', '_fox-cindril-'];
gameFiles.sort((a, b) => ORDER.findIndex((p) => a.startsWith(p)) - ORDER.findIndex((p) => b.startsWith(p)));
const GAME_NOTE = {
  player: 'THE IDENTITY LOCK (L6). Star badge holds 16 px on a single yellow under all three — it survives the swap.',
  puddlisk: 'THE CASE FOR THE SWAP. Puddlisk is a STARTER (bible §4 row 2). Under the frozen palette it ships GREY.',
  fenmaw: 'Water Apex, Marsh (bible §4 row 12). Frozen loses every cool pixel on this sprite.',
  duskstalk: 'Dark Apex (bible §4 row 17). Frozen loses every cool pixel here too.',
  'fox-cindril': 'THE COST. Cindril is warm and the frozen palette already serves it — this is what broadening spends.',
};
for (const f of gameFiles) {
  const id = f.slice(1, f.indexOf('-', f.indexOf('-') + 1) === -1 ? undefined : f.lastIndexOf('-', f.lastIndexOf('-') - 1));
  const key = Object.keys(GAME_NOTE).find((k) => f.startsWith(`_${k}-`));
  await add(caption(`${key}   —   ${GAME_NOTE[key] ?? ''}`, '#f0e2a0'), 30);
  await fit(`${DIR}/at-game-size/${f}`);
}

/* ── 3. 1024² ──────────────────────────────────────────────────────────────── */
await add(heading('3 — AT 1024², original | frozen | candidate, with both ΔE heatmaps underneath',
  'heatmap: black = 0, red ≈ 5, yellow ≈ 10, white = 15+.  Ordered worst-first by how much the frozen palette misses.'), 74);
const previews = (await readdir(`${DIR}/quantized`)).filter((f) => f.endsWith('-COMPARE.png'));
previews.sort((a, b) => {
  const id = (f) => f.replace('-COMPARE.png', '');
  return (byId[id(b)]?.frozen.mean ?? 0) - (byId[id(a)]?.frozen.mean ?? 0);
});
for (const f of previews) {
  const id = f.replace('-COMPARE.png', '');
  const p = byId[id];
  const d = p ? p.candidate.mean - p.frozen.mean : 0;
  await add(caption(
    `${id.padEnd(16)} frozen mean ΔE ${p ? p.frozen.mean.toFixed(2) : '?'}   →   candidate ${p ? p.candidate.mean.toFixed(2) : '?'}   `
    + `(${d >= 0 ? '+' : ''}${d.toFixed(2)}, ${d < -0.25 ? 'candidate better' : d > 0.25 ? 'frozen better' : 'tie'})`,
    d < -0.25 ? '#9fe08a' : d > 0.25 ? '#e8a08a' : '#cfe3c0'), 30);
  await fit(`${DIR}/quantized/${f}`);
}

await sharp({ create: { width: W, height: y, channels: 3, background: BG } })
  .composite(parts).png().toFile(OUT);
console.log(`${OUT}  (${W}x${y})`);
