/** Probe: find a statistic that separates tone/texture passes from displaced layout. */
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
  const m = blankRaster(src.width, src.height); const lum = luminance(src);
  for (let i = 0; i < lum.length; i++) { const v = lum[i]! >= 0.45 ? 255 : 0;
    m.data[i*4]=v; m.data[i*4+1]=v; m.data[i*4+2]=v; m.data[i*4+3]=255; }
  return m;
}
function moveBlock(src: Raster, x0: number, y0: number, S: number, d: number, gx: number, gy: number): Raster {
  const o = blankRaster(src.width, src.height); o.data.set(src.data);
  const copy = (sx: number, sy: number, dx: number, dy: number) => {
    if (dx < 0 || dy < 0 || dx >= o.width || dy >= o.height) return;
    const si = idx(src, Math.min(src.width-1, sx), Math.min(src.height-1, sy)); const di = idx(o, dx, dy);
    o.data[di]=src.data[si]!; o.data[di+1]=src.data[si+1]!; o.data[di+2]=src.data[si+2]!; o.data[di+3]=255;
  };
  for (let y=0;y<S;y++) for (let x=0;x<S;x++) copy(gx+x, gy+y, x0+x, y0+y);
  for (let y=0;y<S;y++) for (let x=0;x<S;x++) copy(x0+x, y0+y, x0+x+d, y0+y+d);
  return o;
}
function tint(map: Raster, t: number): Raster {
  const o = blankRaster(map.width, map.height);
  for (let i=0;i<map.data.length;i+=4){ o.data[i]=Math.round(map.data[i]!*t); o.data[i+1]=Math.round(map.data[i+1]!*t);
    o.data[i+2]=Math.round(map.data[i+2]!*t); o.data[i+3]=255; }
  return o;
}
function weathered(map: Raster, s: number): Raster {
  const o = blankRaster(map.width, map.height);
  for (let y=0;y<map.height;y++) for (let x=0;x<map.width;x++){
    const i = idx(map,x,y);
    const m = s*(12*Math.sin(x/53)*Math.cos(y/47)+7*Math.sin((x+y)/23)+3*Math.cos(x/11)*Math.sin(y/13)) + s*2*Math.sin(x*1.7+y*2.3);
    for (let c=0;c<3;c++) o.data[i+c]=Math.max(0,Math.min(255,Math.round(map.data[i+c]!*0.94+m)));
    o.data[i+3]=255;
  }
  return o;
}

function stats(eb: Uint8Array, ec: Uint8Array, walk: Uint8Array, W: number, H: number) {
  const N = GRID.cols * GRID.rows;
  const ci = new Int32Array(N), cu = new Int32Array(N), wk = new Int32Array(N);
  for (let y=0;y<H;y++){ const cy = Math.min(GRID.rows-1, Math.floor((y*GRID.rows)/H));
    for (let x=0;x<W;x++){ const i=y*W+x; if(!walk[i]) continue;
      const cx = Math.min(GRID.cols-1, Math.floor((x*GRID.cols)/W)); const k=cy*GRID.cols+cx;
      wk[k]!++; const a=eb[i]!,b=ec[i]!; if(a&&b) ci[k]!++; if(a||b) cu[k]!++; } }
  const drift = new Uint8Array(N);
  for (let k=0;k<N;k++){ if (wk[k]===0||cu[k]===0) continue; if (ci[k]!/cu[k]! < CFG.iouThreshold) drift[k]=1; }
  // 8-connected components
  const seen = new Uint8Array(N);
  let bestCells=0,bestCd=0,bestBox=0,bestSpan=0;
  for (let s=0;s<N;s++){
    if(!drift[s]||seen[s]) continue;
    const stack=[s]; seen[s]=1; let cells=0, cd=0, x0=1e9,x1=-1,y0=1e9,y1=-1;
    while(stack.length){ const p=stack.pop()!; cells++; cd += cu[p]!-ci[p]!;
      const cx=p%GRID.cols, cy=(p-cx)/GRID.cols;
      if(cx<x0)x0=cx; if(cx>x1)x1=cx; if(cy<y0)y0=cy; if(cy>y1)y1=cy;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy) continue; const nx=cx+dx, ny=cy+dy;
        if(nx<0||ny<0||nx>=GRID.cols||ny>=GRID.rows) continue;
        const q=ny*GRID.cols+nx; if(drift[q]&&!seen[q]){seen[q]=1;stack.push(q);} } }
    const bw=x1-x0+1, bh=y1-y0+1;
    if(cells>bestCells)bestCells=cells;
    if(cd>bestCd)bestCd=cd;
    if(bw*bh>bestBox)bestBox=bw*bh;
    if(Math.max(bw,bh)>bestSpan)bestSpan=Math.max(bw,bh);
  }
  let totalCd=0; for(let k=0;k<N;k++) totalCd += cu[k]!-ci[k]!;
  return { bestCells, bestCd, bestBox, bestSpan, totalCd };
}

const REAL_MAPS = ['assets/approved-trials/town-map.png','assets/raw/palette-trials/pt-map-brackwater.png',
  'assets/raw/palette-trials/pt-map-cindershelf.png','assets/raw/palette-trials/pt-map-duskhollow.png',
  'assets/raw/palette-trials/pt-map-r2.png'].filter((p)=>existsSync(resolve(REPO_ROOT,p)));
const POS = [[300,300],[500,200],[200,500],[400,400],[600,600]] as const;

console.log('kind | map | label | cells | cd(disagreeing px in region) | boxCells | span | totalCd');
for (const rel of REAL_MAPS) {
  const map = await readRaster(resolve(REPO_ROOT, rel));
  const walk = walkableMaskFor(maskFromLuminance(map), GRID, map.width, map.height);
  const eb = edgeMap(map, CFG); const name = rel.split('/').pop()!;
  const row = (kind: string, label: string, cand: Raster) => {
    const s = stats(eb, edgeMap(cand, CFG), walk, map.width, map.height);
    console.log(`${kind} | ${name.padEnd(22)} | ${label.padEnd(22)} | ${String(s.bestCells).padStart(4)} | ${String(s.bestCd).padStart(6)} | ${String(s.bestBox).padStart(4)} | ${String(s.bestSpan).padStart(3)} | ${s.totalCd}`);
  };
  row('OK  ', 'identical', { ...map, data: new Uint8ClampedArray(map.data) });
  for (const t of [0.94,0.9,0.8]) row('OK  ', `tint ${t}`, tint(map,t));
  for (const s of [0.5,1]) row('~   ', `weathered x${s}`, weathered(map,s));
  for (const S of [32,64]) for (const [px,py] of POS) row(S>=64?'BAD ':'bad?', `move ${S}px@16 (${px},${py})`, moveBlock(map,px,py,S,CELL,20,900));
}
