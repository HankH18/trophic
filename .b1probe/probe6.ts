/** Probe: which component of a drifted region's disagreement separates texture from layout? */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Raster } from '../tools/postprocess/raster.ts';
import { blankRaster, idx, readRaster } from '../tools/postprocess/raster.ts';
import { REPO_ROOT } from '../tools/postprocess/palette.ts';
import { luminance, contrastRange, contrastNormalise, sobelMagnitude, thresholdEdges, dilate, edgeMap, walkableMaskFor } from '../tools/overlay-diff/index.ts';
import { collisionGrid, overlayDiffConfig } from '../tools/overlay-diff/config.ts';
import { validateContent } from '../core/schemas.ts';

const content = validateContent();
const CFG = overlayDiffConfig(content.balance);
const GRID = collisionGrid(content.balance);
const CELL = content.balance.map.collisionCellPx;
const SIZE = content.balance.map.mapNativePx;
const FOOT = CFG.driftFootprint;
const LIMIT = FOOT.cols * FOOT.rows;

function rawEdges(src: Raster, walk?: Uint8Array): Uint8Array {
  const lum = luminance(src);
  const cr = contrastRange(lum, 0.01, walk);
  if (cr.flat) return new Uint8Array(src.width * src.height);
  return thresholdEdges(sobelMagnitude(contrastNormalise(lum, cr), src.width, src.height), CFG.sobelThreshold);
}

function analyse(base: Raster, cand: Raster, mask?: Raster) {
  const W = base.width, H = base.height;
  const walk = mask ? walkableMaskFor(mask, GRID, W, H) : new Uint8Array(W * H).fill(1);
  const eb = edgeMap(base, CFG, walk), ec = edgeMap(cand, CFG, walk);
  const rb = rawEdges(base, walk), rc = rawEdges(cand, walk);
  const N = GRID.cols * GRID.rows;
  const ci = new Int32Array(N), cu = new Int32Array(N), lost = new Int32Array(N), gain = new Int32Array(N);
  const rawDis = new Int32Array(N); const wk = new Int32Array(N);
  for (let y = 0; y < H; y++) { const cy = Math.min(GRID.rows-1, Math.floor((y*GRID.rows)/H));
    for (let x = 0; x < W; x++) { const i = y*W+x; if (!walk[i]) continue;
      const cx = Math.min(GRID.cols-1, Math.floor((x*GRID.cols)/W)); const k = cy*GRID.cols+cx;
      wk[k]!++; const a = eb[i]!, b = ec[i]!;
      if (a&&b) ci[k]!++; if (a||b) cu[k]!++;
      if (a&&!b) lost[k]!++; if (!a&&b) gain[k]!++;
      if (rb[i] !== rc[i]) rawDis[k]!++;
    } }
  const drift = new Uint8Array(N);
  for (let k=0;k<N;k++) if (wk[k]! > 0 && cu[k]! > 0 && ci[k]!/cu[k]! < CFG.iouThreshold) drift[k]=1;
  const seen = new Uint8Array(N);
  let best = { cells:0, dis:0, lost:0, gain:0, raw:0 };
  let bestKey = -1;
  for (let s=0;s<N;s++){
    if(!drift[s]||seen[s]) continue;
    const st=[s]; seen[s]=1; let cells=0,dis=0,lo=0,ga=0,rw=0;
    while(st.length){ const p=st.pop()!; cells++; dis+=cu[p]!-ci[p]!; lo+=lost[p]!; ga+=gain[p]!; rw+=rawDis[p]!;
      const cx=p%GRID.cols, cy=(p-cx)/GRID.cols;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue;
        const nx=cx+dx, ny=cy+dy; if(nx<0||ny<0||nx>=GRID.cols||ny>=GRID.rows) continue;
        const q=ny*GRID.cols+nx; if(drift[q]&&!seen[q]){seen[q]=1;st.push(q);} } }
    const key = Math.max(cells/LIMIT, dis/150);
    if (key > bestKey) { bestKey = key; best = { cells, dis, lost: lo, gain: ga, raw: rw }; }
  }
  return best;
}

/* ── synthetic town, exactly as the test builds it ── */
function setPx(r: Raster, x: number, y: number, v: number): void {
  if (x<0||y<0||x>=r.width||y>=r.height) return; const i=idx(r,x,y);
  r.data[i]=v; r.data[i+1]=v; r.data[i+2]=v; r.data[i+3]=255;
}
function getPx(r: Raster, x: number, y: number): number {
  return r.data[idx(r, Math.max(0,Math.min(r.width-1,x)), Math.max(0,Math.min(r.height-1,y)))]!;
}
function rect(r: Raster, x0:number,y0:number,w:number,h:number,v:number){ for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++) setPx(r,x,y,v); }
function repaint(src: Raster, f:(v:number,x:number,y:number)=>number): Raster {
  const r=blankRaster(src.width,src.height);
  for(let y=0;y<src.height;y++) for(let x=0;x<src.width;x++) setPx(r,x,y,Math.max(0,Math.min(255,Math.round(f(getPx(src,x,y),x,y)))));
  return r;
}
const HUTS=[{x:6,y:6,w:8,h:7},{x:44,y:7,w:9,h:7},{x:7,y:43,w:8,h:8},{x:45,y:45,w:9,h:8}] as const;
function baseMap(move=0): Raster {
  const r=blankRaster(SIZE,SIZE); rect(r,0,0,SIZE,SIZE,120);
  rect(r,28*CELL,0,7*CELL,SIZE,230); rect(r,0,28*CELL,SIZE,7*CELL,230);
  HUTS.forEach((h,i)=>{ const d=i===0?move*CELL:0; rect(r,h.x*CELL+d,h.y*CELL+d,h.w*CELL,h.h*CELL,20); });
  rect(r,38*CELL,37*CELL,8*CELL,6*CELL,60); return r;
}
function collisionMask(): Raster {
  const r=blankRaster(SIZE,SIZE); rect(r,0,0,SIZE,SIZE,255);
  for(const h of HUTS) rect(r,h.x*CELL,h.y*CELL,h.w*CELL,h.h*CELL,0);
  rect(r,38*CELL,37*CELL,8*CELL,6*CELL,0); return r;
}
function texturedVariant(base: Raster, tint=0.94, blotches=24): Raster {
  const r=repaint(base,(v,x,y)=>v*tint+4*Math.sin(x/7.5)*Math.cos(y/9.5));
  for(let i=0;i<blotches;i++){ const bx=8+((i*149)%(SIZE-24)); const by=8+((i*251)%(SIZE-24)); rect(r,bx,by,5,5,40); }
  return r;
}
function erasedHut(base: Raster): Raster {
  const r=blankRaster(SIZE,SIZE); r.data.set(base.data); const h=HUTS[0]!;
  rect(r,h.x*CELL,h.y*CELL,h.w*CELL,h.h*CELL,120); return r;
}

const B = baseMap(), M = collisionMask();
const show=(k:string,l:string,b:Raster,c:Raster,m?:Raster)=>{ const r=analyse(b,c,m);
  console.log(`${k} | ${l.padEnd(30)} cells ${String(r.cells).padStart(3)}  dilatedDis ${String(r.dis).padStart(6)}  lost ${String(r.lost).padStart(6)}  gained ${String(r.gain).padStart(6)}  rawDis ${String(r.raw).padStart(6)}`); };
console.log('== synthetic town ==');
show('OK  ','texture-only (24 blotches)',B,texturedVariant(B),M);
show('OK  ','tint 0.9 only',B,repaint(B,(v)=>v*0.9),M);
show('BAD ','hut moved 1 cell',B,baseMap(1),M);
show('BAD ','hut erased',B,erasedHut(B),M);
show('BAD ','texture over hut moved 2',B,texturedVariant(baseMap(2)),M);

/* ── real maps ── */
function maskFromLuminance(src: Raster): Raster {
  const m=blankRaster(src.width,src.height); const lum=luminance(src);
  for(let i=0;i<lum.length;i++){ const v=lum[i]!>=0.45?255:0; m.data[i*4]=v;m.data[i*4+1]=v;m.data[i*4+2]=v;m.data[i*4+3]=255; }
  return m;
}
function moveBlock(src: Raster,x0:number,y0:number,S:number,d:number,gx:number,gy:number): Raster {
  const o=blankRaster(src.width,src.height); o.data.set(src.data);
  const copy=(sx:number,sy:number,dx:number,dy:number)=>{ if(dx<0||dy<0||dx>=o.width||dy>=o.height) return;
    const si=idx(src,Math.min(src.width-1,sx),Math.min(src.height-1,sy)); const di=idx(o,dx,dy);
    o.data[di]=src.data[si]!;o.data[di+1]=src.data[si+1]!;o.data[di+2]=src.data[si+2]!;o.data[di+3]=255; };
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) copy(gx+x,gy+y,x0+x,y0+y);
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) copy(x0+x,y0+y,x0+x+d,y0+y+d);
  return o;
}
function tintR(map: Raster,t:number): Raster { const o=blankRaster(map.width,map.height);
  for(let i=0;i<map.data.length;i+=4){o.data[i]=Math.round(map.data[i]!*t);o.data[i+1]=Math.round(map.data[i+1]!*t);o.data[i+2]=Math.round(map.data[i+2]!*t);o.data[i+3]=255;} return o; }
function weathered(map: Raster,s:number): Raster { const o=blankRaster(map.width,map.height);
  for(let y=0;y<map.height;y++) for(let x=0;x<map.width;x++){ const i=idx(map,x,y);
    const m=s*(12*Math.sin(x/53)*Math.cos(y/47)+7*Math.sin((x+y)/23)+3*Math.cos(x/11)*Math.sin(y/13))+s*2*Math.sin(x*1.7+y*2.3);
    for(let c=0;c<3;c++) o.data[i+c]=Math.max(0,Math.min(255,Math.round(map.data[i+c]!*0.94+m))); o.data[i+3]=255; }
  return o; }
/** rot blotches on real art: 24 hard 5x5 marks, same as the synthetic fixture */
function blotched(map: Raster): Raster {
  const o=blankRaster(map.width,map.height); o.data.set(map.data);
  for(let i=0;i<24;i++){ const bx=8+((i*149)%(map.width-24)); const by=8+((i*251)%(map.height-24));
    for(let y=by;y<by+5;y++) for(let x=bx;x<bx+5;x++){ const k=idx(o,x,y); o.data[k]=40;o.data[k+1]=36;o.data[k+2]=30;o.data[k+3]=255; } }
  return o; }

const REAL=['assets/approved-trials/town-map.png','assets/raw/palette-trials/pt-map-brackwater.png',
 'assets/raw/palette-trials/pt-map-cindershelf.png','assets/raw/palette-trials/pt-map-duskhollow.png',
 'assets/raw/palette-trials/pt-map-r2.png'].filter(p=>existsSync(resolve(REPO_ROOT,p)));
console.log('== real maps ==');
for (const rel of REAL){
  const map=await readRaster(resolve(REPO_ROOT,rel)); const mk=maskFromLuminance(map); const n=rel.split('/').pop()!.replace('.png','');
  show('OK  ',`${n} tint 0.9`,map,tintR(map,0.9),mk);
  show('OK  ',`${n} weathered x0.5`,map,weathered(map,0.5),mk);
  show('OK  ',`${n} rot blotches`,map,blotched(map),mk);
  show('BAD ',`${n} move 64@16 (500,200)`,map,moveBlock(map,500,200,64,CELL,20,900),mk);
  show('BAD ',`${n} move 64@16 (400,400)`,map,moveBlock(map,400,400,64,CELL,20,900),mk);
}
