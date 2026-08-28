/**
 * Two supporting panels for the batch-2 review that the main contact sheet cannot carry.
 *
 * `dark`  — the accepted sprites at 4x on a dark ground. The pale-halo defect measured on every one
 *           of them is INVISIBLE on white, which is what the main sheet uses and what the generator
 *           drew them on. On a dark ground it is the first thing you see. A defect that only shows
 *           on one background still ships on both.
 * `strip` — an arbitrary list of files in a labelled row, for showing rejects beside accepts.
 */
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';

const mode = process.argv[2];
const OUT = process.argv[3];

const PAD = 12;
const LABEL = 22;

async function panel(entries, cols, cell, bg, labelBg, labelFg) {
  const rows = Math.ceil(entries.length / cols);
  const W = cols * (cell + PAD) + PAD;
  const H = rows * (cell + LABEL + PAD) + PAD;
  const comps = [];
  for (const [i, e] of entries.entries()) {
    const cx = PAD + (i % cols) * (cell + PAD);
    const cy = PAD + Math.floor(i / cols) * (cell + LABEL + PAD);
    comps.push({
      input: await sharp(e.file).resize(cell, cell, { kernel: 'nearest', fit: 'contain', background: '#00000000' }).toBuffer(),
      left: cx,
      top: cy,
    });
    comps.push({
      input: Buffer.from(
        `<svg width="${cell}" height="${LABEL}"><rect width="100%" height="100%" fill="${labelBg}"/>` +
          `<text x="6" y="16" font-family="monospace" font-size="13" fill="${labelFg}">${e.label}</text></svg>`,
      ),
      left: cx,
      top: cy + cell,
    });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: bg } }).composite(comps).png().toFile(OUT);
  console.log(`${entries.length} -> ${OUT} (${W}x${H})`);
}

if (mode === 'dark') {
  const dir = process.argv[4];
  const order = ['skir-j', 'skir-a', 'skir-e', 'loamunder-j', 'loamunder-a', 'loamunder-e', 'mirefin-j', 'mirefin-a', 'mirefin-e'];
  const entries = order.map((n) => ({ file: `${dir}/battle-${n}-front-96.png`, label: n }));
  await panel(entries, 3, 384, '#1b2027', '#0d1014', '#9fb0c0');
} else if (mode === 'strip') {
  const files = process.argv.slice(4);
  const entries = files.map((f) => ({ file: f, label: basename(f, '.png') }));
  await panel(entries, Number(process.env.COLS ?? 4), 300, '#f2f0e8', '#1b1d1a', '#cfe3c0');
} else {
  throw new Error('usage: sheet-b2-evidence.mjs dark <out> <acceptedDir> | strip <out> <file...>');
}
