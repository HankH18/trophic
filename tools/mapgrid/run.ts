/**
 * mapgrid — overlay the engine's own collision grid on a painted map so a map-native
 * coordinate can be READ rather than estimated. See README.md for why three separate
 * consumers need this number.
 *
 * The grid drawn is `collisionCols × collisionRows` at `collisionCellPx` — the grid
 * `maskRasterFrom` actually samples. Drawing a prettier grid would hide the thing worth
 * seeing: whether a door sits cleanly inside one cell or straddles two.
 */
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { zBalance } from '../../core/schemas';
import { gridConsistencyProblem } from '../../game/collision';
import type { Balance } from '../../core/types';

/**
 * Parse balance.json through the ENGINE'S OWN schema and consistency check, not a hand-rolled read.
 *
 * `mapNativePx`, `collisionCols`, `collisionRows` and `collisionCellPx` are not four independent
 * numbers — they are three statements of one fact, and `gridConsistencyProblem` is the check that
 * they agree (game/collision.ts). A raw JSON.parse bypasses it, and then this tool would keep
 * cheerfully drawing a 64x64 grid while the engine refused to boot on the same file: an instrument
 * whose entire job is to be trusted over the eye, drawing a grid nobody samples. So it borrows the
 * engine's check rather than restating it, because a restated check is one that can drift.
 */
async function mapConstants(): Promise<Balance['map']> {
  const raw: unknown = JSON.parse(await readFile('data/balance.json', 'utf8'));
  const parsed = zBalance.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`data/balance.json failed the engine schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const problem = gridConsistencyProblem(parsed.data);
  if (problem) throw new Error(`REFUSED — the engine would not accept this balance.json: ${problem}`);
  return parsed.data.map;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  const pre = process.argv.find((a) => a.startsWith(`--${name}=`));
  return pre?.slice(name.length + 3);
}

/**
 * Labels every `labelEvery` cells rather than every cell: 64 labels per axis at 1024px is
 * unreadable, which would make the overlay worse than no overlay.
 */
function gridSvg(c: Balance['map'], zoom: number, mark?: { x: number; y: number }): string {
  const S = c.mapNativePx * zoom;
  const cell = c.collisionCellPx * zoom;
  const labelEvery = 4;
  const parts: string[] = [];

  for (let col = 0; col <= c.collisionCols; col++) {
    const x = col * cell;
    const major = col % labelEvery === 0;
    const centre = col === c.collisionCols / 2;
    const stroke = centre ? '#ff3b30' : major ? '#ffffff' : '#ffffff';
    const w = centre ? 2 * zoom : major ? 1 * zoom : 0.5 * zoom;
    const op = centre ? 0.9 : major ? 0.45 : 0.18;
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${S}" stroke="${stroke}" stroke-width="${w}" opacity="${op}"/>`);
    if (major && col < c.collisionCols) {
      parts.push(
        `<text x="${x + 2 * zoom}" y="${12 * zoom}" font-family="monospace" font-size="${9 * zoom}" fill="#ffff00" opacity="0.95">${col * c.collisionCellPx}</text>`,
      );
    }
  }
  for (let row = 0; row <= c.collisionRows; row++) {
    const y = row * cell;
    const major = row % labelEvery === 0;
    const centre = row === c.collisionRows / 2;
    const stroke = centre ? '#ff3b30' : '#ffffff';
    const w = centre ? 2 * zoom : major ? 1 * zoom : 0.5 * zoom;
    const op = centre ? 0.9 : major ? 0.45 : 0.18;
    parts.push(`<line x1="0" y1="${y}" x2="${S}" y2="${y}" stroke="${stroke}" stroke-width="${w}" opacity="${op}"/>`);
    if (major && row < c.collisionRows) {
      parts.push(
        `<text x="${2 * zoom}" y="${y + 11 * zoom}" font-family="monospace" font-size="${9 * zoom}" fill="#ffff00" opacity="0.95">${row * c.collisionCellPx}</text>`,
      );
    }
  }

  // The spawn tile: the one composition mistake with a direct mechanical consequence.
  const mid = (c.mapNativePx / 2) * zoom;
  parts.push(`<circle cx="${mid}" cy="${mid}" r="${10 * zoom}" fill="none" stroke="#ff3b30" stroke-width="${2 * zoom}"/>`);
  parts.push(
    `<text x="${mid + 14 * zoom}" y="${mid - 6 * zoom}" font-family="monospace" font-size="${11 * zoom}" fill="#ff3b30">512,512 SPAWN</text>`,
  );

  if (mark) {
    const mx = mark.x * zoom;
    const my = mark.y * zoom;
    parts.push(`<line x1="${mx - 16 * zoom}" y1="${my}" x2="${mx + 16 * zoom}" y2="${my}" stroke="#00e5ff" stroke-width="${2 * zoom}"/>`);
    parts.push(`<line x1="${mx}" y1="${my - 16 * zoom}" x2="${mx}" y2="${my + 16 * zoom}" stroke="#00e5ff" stroke-width="${2 * zoom}"/>`);
    parts.push(
      `<text x="${mx + 18 * zoom}" y="${my + 4 * zoom}" font-family="monospace" font-size="${11 * zoom}" fill="#00e5ff">${mark.x},${mark.y}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${parts.join('')}</svg>`;
}

const src = process.argv[2];
if (!src || src.startsWith('--')) {
  console.error('usage: npx tsx tools/mapgrid/run.ts <image.png> [--out out.png] [--mark X,Y] [--zoom N]');
  process.exit(2);
}

const c = await mapConstants();
const zoom = Number(arg('zoom') ?? 2);
const out = arg('out') ?? src.replace(/\.png$/, '') + '-grid.png';

const markRaw = arg('mark');
let mark: { x: number; y: number } | undefined;
if (markRaw) {
  const [mx, my] = markRaw.split(',').map(Number);
  if (!Number.isFinite(mx) || !Number.isFinite(my)) throw new Error(`--mark wants X,Y in map-native px, got "${markRaw}"`);
  mark = { x: mx as number, y: my as number };
}

const meta = await sharp(src).metadata();
if (meta.width !== c.mapNativePx || meta.height !== c.mapNativePx) {
  // Loud, not silent: a map that is not 1024² makes every coordinate read off it wrong.
  console.error(`REFUSED: ${src} is ${meta.width}×${meta.height}, but balance.map.mapNativePx is ${c.mapNativePx}.`);
  process.exit(1);
}

const base = await sharp(src).resize(c.mapNativePx * zoom, c.mapNativePx * zoom, { kernel: 'nearest' }).toBuffer();
await sharp(base)
  .composite([{ input: Buffer.from(gridSvg(c, zoom, mark)), top: 0, left: 0 }])
  .png()
  .toFile(out);

console.log(`  ${out}`);
console.log(`  grid ${c.collisionCols}×${c.collisionRows} @ ${c.collisionCellPx}px native, drawn at ${zoom}×`);
if (mark) console.log(`  marked ${mark.x},${mark.y}`);
