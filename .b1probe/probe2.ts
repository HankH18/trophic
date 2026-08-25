/** Probe: WHY does a 64px block moved one cell produce a drifted run of only 3 cells? */
import { resolve } from 'node:path';
import type { Raster } from '../tools/postprocess/raster.ts';
import { blankRaster, idx, readRaster } from '../tools/postprocess/raster.ts';
import { REPO_ROOT } from '../tools/postprocess/palette.ts';
import { luminance, edgeMap, walkableMaskFor } from '../tools/overlay-diff/index.ts';
import { collisionGrid, overlayDiffConfig } from '../tools/overlay-diff/config.ts';
import { validateContent } from '../core/schemas.ts';

const content = validateContent();
const CFG = overlayDiffConfig(content.balance);
const GRID = collisionGrid(content.balance);
const CELL = content.balance.map.collisionCellPx;

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

const rel = process.argv[2] ?? 'assets/raw/palette-trials/pt-map-brackwater.png';
const X = Number(process.argv[3] ?? 300), Y = Number(process.argv[4] ?? 300);
const S = Number(process.argv[5] ?? 64), D = Number(process.argv[6] ?? 16);
const map = await readRaster(resolve(REPO_ROOT, rel));
const mask = maskFromLuminance(map);
const moved = moveBlock(map, X, Y, S, D, 20, 900);
const W = map.width, H = map.height;
const eb = edgeMap(map, CFG), ec = edgeMap(moved, CFG);
const walk = walkableMaskFor(mask, GRID, W, H);

// pixel-level disagreement
let diffWalk = 0, diffAll = 0;
for (let i = 0; i < walk.length; i++) { if (eb[i] !== ec[i]) { diffAll++; if (walk[i]) diffWalk++; } }
console.log(`${rel.split('/').pop()} block ${S}px @ (${X},${Y}) moved ${D}px`);
console.log(`edge-map disagreement px: all ${diffAll}, inside walkable ${diffWalk}`);

const c0x = Math.floor(X / CELL) - 1, c0y = Math.floor(Y / CELL) - 1;
const n = Math.ceil((S + D) / CELL) + 2;
console.log(`cell grid around the block (cx ${c0x}..${c0x + n - 1}, cy ${c0y}..${c0y + n - 1}):`);
console.log('  legend: "wk/union/iou"  (wk = walkable px in cell, union = edge-union px inside walkable)');
for (let cy = c0y; cy < c0y + n; cy++) {
  const cells: string[] = [];
  for (let cx = c0x; cx < c0x + n; cx++) {
    let wk = 0, ci = 0, cu = 0;
    for (let y = cy * CELL; y < (cy + 1) * CELL; y++) {
      for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
        const i = y * W + x;
        if (!walk[i]) continue;
        wk++;
        if (eb[i] && ec[i]) ci++;
        if (eb[i] || ec[i]) cu++;
      }
    }
    const iou = cu === 0 ? NaN : ci / cu;
    const flag = cu < 25 ? 'skip' : iou < CFG.iouThreshold ? 'DRIFT' : '  ok ';
    cells.push(`${String(wk).padStart(3)}/${String(cu).padStart(3)}/${cu === 0 ? ' n/a ' : iou.toFixed(2)}${flag}`);
  }
  console.log(`  cy=${String(cy).padStart(2)} ${cells.join(' ')}`);
}
