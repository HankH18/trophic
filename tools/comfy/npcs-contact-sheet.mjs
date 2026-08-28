// Contact sheet for the Hearthollow NPC overworld pass.
//
// Every row is one NPC and carries the APPROVED PLAYER FRONT in its first cell, because the stated
// bar for this pass is "does it belong in the same game as that sprite", and that judgement is only
// possible side by side. The bottom strip is every candidate at TRUE 32x48 on a mid-tone ground —
// the size the player actually sees — because a sprite that reads at x12 and dissolves at 1:1 is a
// reject and the blow-up cannot show you that.
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const DERIVED = process.argv[2];
const ANCHOR = process.argv[3];
const OUT = process.argv[4];

const GROUND = { r: 122, g: 138, b: 106, alpha: 1 }; // mid grass tone: neither white nor black favours a sprite
const SCALE = 10;
const CW = 32 * SCALE, CH = 48 * SCALE;
const LABEL = 24, PAD = 10;

const files = (await readdir(DERIVED)).filter((f) => f.endsWith('.png')).sort();
// group by npc, preserving NPCS order
const ORDER = ['tibb', 'judd', 'rask', 'mott', 'tamsin'];
const groups = ORDER.map((id) => [id, files.filter((f) => f.startsWith(id + '-'))]).filter(([, fs]) => fs.length);

const COLS = 1 + Math.max(...groups.map(([, fs]) => fs.length));
const ROWS = groups.length;
const STRIP_SCALE = 4;
const STRIP_H = 48 * STRIP_SCALE + LABEL + PAD * 2;
const W = COLS * (CW + PAD) + PAD;
const H = ROWS * (CH + LABEL + PAD) + PAD + STRIP_H;

const svgLabel = (text, w, fill = '#cfe3c0', bg = '#1b1d1a') =>
  Buffer.from(
    `<svg width="${w}" height="${LABEL}"><rect width="100%" height="100%" fill="${bg}"/>` +
      `<text x="${w / 2}" y="17" font-family="monospace" font-size="14" fill="${fill}" text-anchor="middle">${text}</text></svg>`,
  );

const cell = async (path, scale) =>
  sharp(await sharp(path).resize(32 * scale, 48 * scale, { kernel: 'nearest' }).toBuffer())
    .flatten({ background: GROUND })
    .toBuffer();

const comp = [];
for (const [ri, [id, fs]] of groups.entries()) {
  const cy = PAD + ri * (CH + LABEL + PAD);
  comp.push({ input: await cell(ANCHOR, SCALE), left: PAD, top: cy });
  comp.push({ input: svgLabel('ANCHOR player-front (approved)', CW, '#ffd85c'), left: PAD, top: cy + CH });
  for (const [ci, f] of fs.entries()) {
    const cx = PAD + (ci + 1) * (CW + PAD);
    comp.push({ input: await cell(resolve(DERIVED, f), SCALE), left: cx, top: cy });
    comp.push({ input: svgLabel(f.replace('-32x48.png', ''), CW), left: cx, top: cy + CH });
  }
}

// true-size strip: every candidate at 32x48, drawn at 4x so a screen can show it, plus 1x beside it
const stripY = PAD + ROWS * (CH + LABEL + PAD);
comp.push({
  input: svgLabel(`TRUE SIZE — 32x48 (shown 4x, and 1x at the far right of each pair)`, W - PAD * 2, '#ffd85c'),
  left: PAD,
  top: stripY,
});
let sx = PAD;
for (const f of [ANCHOR, ...files.map((f) => resolve(DERIVED, f))]) {
  comp.push({ input: await cell(f, STRIP_SCALE), left: sx, top: stripY + LABEL + PAD });
  sx += 32 * STRIP_SCALE + 4;
  comp.push({ input: await cell(f, 1), left: sx, top: stripY + LABEL + PAD });
  sx += 32 + 14;
}

await sharp({ create: { width: W, height: H, channels: 3, background: '#0d0f0c' } })
  .composite(comp)
  .png()
  .toFile(OUT);
console.log(`${OUT}  (${files.length} candidates + anchor, ${W}x${H})`);
