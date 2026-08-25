/** Probe: connectivity + evidence-floor variants for criterion (2). */
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
const LIMIT = FOOT.cols * FOOT.rows;
const BLOB = (2 * CFG.dilatePx + 1) ** 2;

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
function tint(map: Raster, t: number): Raster {
  const o = blankRaster(map.width, map.height);
  for (let i = 0; i < map.data.length; i += 4) {
    o.data[i] = Math.round(map.data[i]! * t); o.data[i + 1] = Math.round(map.data[i + 1]! * t);
    o.data[i + 2] = Math.round(map.data[i + 2]! * t); o.data[i + 3] = 255;
  }
  return o;
}
function weathered(map: Raster, strength: number): Raster {
  const o = blankRaster(map.width, map.height);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const i = idx(map, x, y);
    const m = strength * (12 * Math.sin(x / 53) * Math.cos(y / 47) + 7 * Math.sin((x + y) / 23) + 3 * Math.cos(x / 11) * Math.sin(y / 13)) + strength * 2 * Math.sin(x * 1.7 + y * 2.3);
    for (let c = 0; c < 3; c++) o.data[i + c] = Math.max(0, Math.min(255, Math.round(map.data[i + c]! * 0.94 + m)));
    o.data[i + 3] = 255;
  }
  return o;
}

/** per-cell (ci, cu, anyWalkable) */
function cellStats(eb: Uint8Array, ec: Uint8Array, walk: Uint8Array, W: number, H: number) {
  const ci = new Int32Array(GRID.cols * GRID.rows);
  const cu = new Int32Array(GRID.cols * GRID.rows);
  const wk = new Int32Array(GRID.cols * GRID.rows);
  for (let y = 0; y < H; y++) {
    const cy = Math.min(GRID.rows - 1, Math.floor((y * GRID.rows) / H));
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!walk[i]) continue;
      const cx = Math.min(GRID.cols - 1, Math.floor((x * GRID.cols) / W));
      const k = cy * GRID.cols + cx;
      wk[k]!++;
      const a = eb[i]!, b = ec[i]!;
      if (a && b) ci[k]!++;
      if (a || b) cu[k]!++;
    }
  }
  return { ci, cu, wk };
}

type Conn = 4 | 8;
function largestRun(drifted: Uint8Array, conn: Conn, bridge?: Uint8Array): { size: number } {
  // bridge[k] = 1 means the cell may be traversed but not counted.
  const seen = new Uint8Array(drifted.length);
  let best = 0;
  const nbrs = (cx: number, cy: number): number[] => {
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (conn === 4 && dx !== 0 && dy !== 0) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID.cols || ny >= GRID.rows) continue;
      out.push(ny * GRID.cols + nx);
    }
    return out;
  };
  for (let s = 0; s < drifted.length; s++) {
    if (!drifted[s] || seen[s]) continue;
    let size = 0;
    const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      if (drifted[p]) size++;
      const cx = p % GRID.cols, cy = (p - cx) / GRID.cols;
      for (const q of nbrs(cx, cy)) {
        if (seen[q]) continue;
        if (drifted[q] || (bridge && bridge[q])) { seen[q] = 1; stack.push(q); }
      }
    }
    if (size > best) best = size;
  }
  return { size: best };
}

function variants(eb: Uint8Array, ec: Uint8Array, walk: Uint8Array, W: number, H: number) {
  const { ci, cu, wk } = cellStats(eb, ec, walk, W, H);
  const mk = (floor: number) => {
    const d = new Uint8Array(ci.length);
    const unjudged = new Uint8Array(ci.length);
    for (let k = 0; k < ci.length; k++) {
      if (wk[k] === 0) { unjudged[k] = 1; continue; }
      if (cu[k]! < floor) { unjudged[k] = 1; continue; }
      if (ci[k]! / cu[k]! < CFG.iouThreshold) d[k] = 1;
    }
    return { d, unjudged };
  };
  const f25 = mk(BLOB), f1 = mk(1);
  return {
    V0: largestRun(f25.d, 4).size,
    V1: largestRun(f25.d, 8).size,
    V2: largestRun(f1.d, 4).size,
    V3: largestRun(f1.d, 8).size,
    V4: largestRun(f25.d, 8, f25.unjudged).size,
    V5: largestRun(f25.d, 4, f25.unjudged).size,
  };
}

const REAL_MAPS = [
  'assets/approved-trials/town-map.png',
  'assets/raw/palette-trials/pt-map-brackwater.png',
  'assets/raw/palette-trials/pt-map-cindershelf.png',
  'assets/raw/palette-trials/pt-map-duskhollow.png',
  'assets/raw/palette-trials/pt-map-r2.png',
].filter((p) => existsSync(resolve(REPO_ROOT, p)));
const POS = [[300, 300], [500, 200], [200, 500], [400, 400], [600, 600]] as const;

console.log(`limit = ${LIMIT} cells; V0=4conn/floor25 (current)  V1=8conn/floor25  V2=4conn/nofloor  V3=8conn/nofloor  V4=8conn/floor25/bridge  V5=4conn/floor25/bridge`);
console.log('MUST ACCEPT: identical, tints.  MUST REJECT: 64px moves.  (numbers are largest run; >= 6 rejects)');
for (const rel of REAL_MAPS) {
  const map = await readRaster(resolve(REPO_ROOT, rel));
  const mask = maskFromLuminance(map);
  const W = map.width, H = map.height;
  const walk = walkableMaskFor(mask, GRID, W, H);
  const eb = edgeMap(map, CFG);
  const name = rel.split('/').pop()!;
  const row = (label: string, cand: Raster) => {
    const v = variants(eb, edgeMap(cand, CFG), walk, W, H);
    console.log(`${name.padEnd(24)} ${label.padEnd(24)} V0 ${String(v.V0).padStart(3)}  V1 ${String(v.V1).padStart(3)}  V2 ${String(v.V2).padStart(3)}  V3 ${String(v.V3).padStart(3)}  V4 ${String(v.V4).padStart(3)}  V5 ${String(v.V5).padStart(3)}`);
  };
  row('identical', { ...map, data: new Uint8ClampedArray(map.data) });
  for (const t of [0.94, 0.9, 0.8]) row(`tint ${t}`, tint(map, t));
  for (const s of [0.5, 1]) row(`weathered x${s}`, weathered(map, s));
  for (const S of [32, 64]) for (const [px, py] of POS) row(`move ${S}px@16 (${px},${py})`, moveBlock(map, px, py, S, CELL, 20, 900));
}
