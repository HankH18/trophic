/**
 * Probe: prototype the WINDOW local criterion and measure it against
 *  (a) the false-accept sweep, (b) tint invariance, (c) a weathering pass.
 */
import { existsSync } from 'node:fs';
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
const FOOT = CFG.driftFootprint;

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

interface Cells { ci: Float64Array; cu: Float64Array; }
function cellSums(eb: Uint8Array, ec: Uint8Array, walk: Uint8Array, W: number, H: number): Cells {
  const ci = new Float64Array(GRID.cols * GRID.rows);
  const cu = new Float64Array(GRID.cols * GRID.rows);
  for (let y = 0; y < H; y++) {
    const cy = Math.min(GRID.rows - 1, Math.floor((y * GRID.rows) / H));
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!walk[i]) continue;
      const cx = Math.min(GRID.cols - 1, Math.floor((x * GRID.cols) / W));
      const k = cy * GRID.cols + cx;
      const a = eb[i]!, b = ec[i]!;
      if (a && b) ci[k]!++;
      if (a || b) cu[k]!++;
    }
  }
  return { ci, cu };
}
function prefix(a: Float64Array): Float64Array {
  const P = new Float64Array((GRID.cols + 1) * (GRID.rows + 1));
  for (let y = 0; y < GRID.rows; y++)
    for (let x = 0; x < GRID.cols; x++)
      P[(y + 1) * (GRID.cols + 1) + x + 1] =
        a[y * GRID.cols + x]! + P[y * (GRID.cols + 1) + x + 1]! + P[(y + 1) * (GRID.cols + 1) + x]! - P[y * (GRID.cols + 1) + x]!;
  return P;
}
const box = (P: Float64Array, x0: number, y0: number, w: number, h: number): number =>
  P[(y0 + h) * (GRID.cols + 1) + x0 + w]! - P[y0 * (GRID.cols + 1) + x0 + w]! - P[(y0 + h) * (GRID.cols + 1) + x0]! + P[y0 * (GRID.cols + 1) + x0]!;

function windowWorst(eb: Uint8Array, ec: Uint8Array, walk: Uint8Array, W: number, H: number, floorMul: number) {
  const c = cellSums(eb, ec, walk, W, H);
  const Pi = prefix(c.ci), Pu = prefix(c.cu);
  const blob = (2 * CFG.dilatePx + 1) ** 2;
  const need = blob * floorMul;
  let worst = 1, at = { cx: -1, cy: -1 }, compared = 0, drifted = 0;
  for (let cy = 0; cy + FOOT.rows <= GRID.rows; cy++) {
    for (let cx = 0; cx + FOOT.cols <= GRID.cols; cx++) {
      const u = box(Pu, cx, cy, FOOT.cols, FOOT.rows);
      if (u < need) continue;
      compared++;
      const iou = box(Pi, cx, cy, FOOT.cols, FOOT.rows) / u;
      if (iou < CFG.iouThreshold) drifted++;
      if (iou < worst) { worst = iou; at = { cx, cy }; }
    }
  }
  return { worst, at, compared, drifted };
}

const REAL_MAPS = [
  'assets/approved-trials/town-map.png',
  'assets/raw/palette-trials/pt-map-brackwater.png',
  'assets/raw/palette-trials/pt-map-cindershelf.png',
  'assets/raw/palette-trials/pt-map-duskhollow.png',
  'assets/raw/palette-trials/pt-map-r2.png',
].filter((p) => existsSync(resolve(REPO_ROOT, p)));

const POS = [[300, 300], [500, 200], [200, 500], [400, 400], [600, 600]] as const;

function tint(map: Raster, t: number): Raster {
  const o = blankRaster(map.width, map.height);
  for (let i = 0; i < map.data.length; i += 4) {
    o.data[i] = Math.round(map.data[i]! * t); o.data[i + 1] = Math.round(map.data[i + 1]! * t);
    o.data[i + 2] = Math.round(map.data[i + 2]! * t); o.data[i + 3] = 255;
  }
  return o;
}
/** B-D25's weathering pass: tone + smooth multi-frequency mottling + fine grain. */
function weathered(map: Raster, strength: number): Raster {
  const o = blankRaster(map.width, map.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = idx(map, x, y);
      const m =
        strength * (12 * Math.sin(x / 53) * Math.cos(y / 47) + 7 * Math.sin((x + y) / 23) + 3 * Math.cos(x / 11) * Math.sin(y / 13)) +
        strength * 2 * Math.sin(x * 1.7 + y * 2.3);
      for (let c = 0; c < 3; c++) o.data[i + c] = Math.max(0, Math.min(255, Math.round(map.data[i + c]! * 0.94 + m)));
      o.data[i + 3] = 255;
    }
  }
  return o;
}

for (const rel of REAL_MAPS) {
  const map = await readRaster(resolve(REPO_ROOT, rel));
  const mask = maskFromLuminance(map);
  const W = map.width, H = map.height;
  const walk = walkableMaskFor(mask, GRID, W, H);
  const eb = edgeMap(map, CFG);
  const name = rel.split('/').pop();

  const report = (label: string, cand: Raster) => {
    const ec = edgeMap(cand, CFG);
    const w1 = windowWorst(eb, ec, walk, W, H, 1);
    const w6 = windowWorst(eb, ec, walk, W, H, FOOT.cols * FOOT.rows);
    console.log(
      `${name!.padEnd(24)} ${label.padEnd(26)} floor1: worst ${w1.worst.toFixed(3)} @(${w1.at.cx},${w1.at.cy}) ${w1.drifted}/${w1.compared} ${w1.worst < CFG.iouThreshold ? 'REJECT' : 'accept'}` +
      ` | floor6: worst ${w6.worst.toFixed(3)} ${w6.drifted}/${w6.compared} ${w6.worst < CFG.iouThreshold ? 'REJECT' : 'accept'}`,
    );
  };

  report('identical', { ...map, data: new Uint8ClampedArray(map.data) });
  for (const t of [0.94, 0.9, 0.8]) report(`tint ${t}`, tint(map, t));
  for (const s of [0.5, 1, 2]) report(`weathered x${s}`, weathered(map, s));
  for (const S of [32, 64]) for (const d of [CELL]) {
    for (const [px, py] of POS) report(`move ${S}px@${d} (${px},${py})`, moveBlock(map, px, py, S, d, 20, 900));
  }
}
