// Contact sheet for supervised gate review (build-doc §15 B0/B2/B5).
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';

const SRC = process.argv[2] ?? 'assets/raw/b0';
const OUT = process.argv[3] ?? 'assets/raw/b0/_contact-sheet.png';
const COLS = Number(process.argv[4] ?? 3);
const CELL = 330, LABEL = 26, PAD = 8;

const files = (await readdir(SRC)).filter(f => f.endsWith('.png') && !f.startsWith('_')).sort();
const rows = Math.ceil(files.length / COLS);
const W = COLS * (CELL + PAD) + PAD;
const H = rows * (CELL + LABEL + PAD) + PAD;

const composites = [];
for (const [i, f] of files.entries()) {
  const cx = PAD + (i % COLS) * (CELL + PAD);
  const cy = PAD + Math.floor(i / COLS) * (CELL + LABEL + PAD);
  composites.push({
    input: await sharp(`${SRC}/${f}`).resize(CELL, CELL, { kernel: 'nearest', fit: 'contain',
      background: '#ffffff' }).toBuffer(),
    left: cx, top: cy,
  });
  const name = f.replace(/^b0-player-/, '').replace(/\.png$/, '');
  composites.push({
    input: Buffer.from(
      `<svg width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#1b1d1a"/>` +
      `<text x="${CELL / 2}" y="18" font-family="monospace" font-size="15" fill="#cfe3c0" ` +
      `text-anchor="middle">${name}</text></svg>`),
    left: cx, top: cy + CELL,
  });
}

await sharp({ create: { width: W, height: H, channels: 3, background: '#0d0f0c' } })
  .composite(composites).png().toFile(OUT);
console.log(`${OUT}  (${files.length} cells, ${W}x${H})`);
