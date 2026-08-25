/** Probe: reproduce F1 (false accept on small displaced features) on the five real maps. */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Raster } from '../tools/postprocess/raster.ts';
import { blankRaster, idx, readRaster } from '../tools/postprocess/raster.ts';
import { REPO_ROOT } from '../tools/postprocess/palette.ts';
import { luminance, overlayDiff } from '../tools/overlay-diff/index.ts';
import { collisionGrid, overlayDiffConfig } from '../tools/overlay-diff/config.ts';
import { validateContent } from '../core/schemas.ts';

const content = validateContent();
const CFG = overlayDiffConfig(content.balance);
const GRID = collisionGrid(content.balance);
const CELL = content.balance.map.collisionCellPx;

const REAL_MAPS = [
  'assets/approved-trials/town-map.png',
  'assets/raw/palette-trials/pt-map-brackwater.png',
  'assets/raw/palette-trials/pt-map-cindershelf.png',
  'assets/raw/palette-trials/pt-map-duskhollow.png',
  'assets/raw/palette-trials/pt-map-r2.png',
].filter((p) => existsSync(resolve(REPO_ROOT, p)));

function maskFromLuminance(src: Raster): Raster {
  const m = blankRaster(src.width, src.height);
  const lum = luminance(src);
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i]! >= 0.45 ? 255 : 0;
    m.data[i * 4] = v; m.data[i * 4 + 1] = v; m.data[i * 4 + 2] = v; m.data[i * 4 + 3] = 255;
  }
  return m;
}

function moveBlock(src: Raster, x0: number, y0: number, S: number, d: number, gx: number, gy: number): Raster {
  const o = blankRaster(src.width, src.height);
  o.data.set(src.data);
  const copy = (sx: number, sy: number, dx: number, dy: number) => {
    if (dx < 0 || dy < 0 || dx >= o.width || dy >= o.height) return;
    const si = idx(src, Math.min(src.width - 1, sx), Math.min(src.height - 1, sy));
    const di = idx(o, dx, dy);
    o.data[di] = src.data[si]!; o.data[di + 1] = src.data[si + 1]!;
    o.data[di + 2] = src.data[si + 2]!; o.data[di + 3] = 255;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) copy(gx + x, gy + y, x0 + x, y0 + y);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) copy(x0 + x, y0 + y, x0 + x + d, y0 + y + d);
  return o;
}

const POS = [[300, 300], [500, 200], [200, 500], [400, 400], [600, 600]] as const;

for (const rel of REAL_MAPS) {
  const map = await readRaster(resolve(REPO_ROOT, rel));
  const mask = maskFromLuminance(map);
  for (const S of [32, 64, 128]) {
    for (const d of [CELL, 2 * CELL]) {
      const verdicts: string[] = [];
      let accepted = 0;
      for (const [px, py] of POS) {
        const moved = moveBlock(map, px, py, S, d, 20, 900);
        const r = overlayDiff({ base: map, candidate: moved, mask, grid: GRID, config: CFG });
        if (r.accepted) accepted++;
        verdicts.push(`(${px},${py}) iou ${r.iou.toFixed(4)} run ${r.largestDrift} ${r.accepted ? 'ACCEPT' : 'reject'}`);
      }
      console.log(`${rel.split('/').pop()}  S=${S} d=${d}: ${accepted}/5 ACCEPTED | ${verdicts.join(' | ')}`);
    }
  }
}
