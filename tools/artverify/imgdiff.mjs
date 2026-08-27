// Raw pixel distance between two images. Used to answer "did that prompt change actually change
// anything", which the eye cannot settle when two candidates look the same but hash differently.
import sharp from 'sharp';
const [, , A, B] = process.argv;
if (!A || !B) { console.error('usage: node tools/artverify/imgdiff.mjs <a.png> <b.png>'); process.exit(2); }
const a = await sharp(A).raw().toBuffer({ resolveWithObject: true });
const b = await sharp(B).raw().toBuffer({ resolveWithObject: true });
if (a.data.length !== b.data.length) { console.error('different dimensions'); process.exit(1); }
let diff = 0, maxd = 0, sum = 0;
const n = a.data.length;
for (let i = 0; i < n; i++) { const d = Math.abs(a.data[i] - b.data[i]); if (d) { diff++; sum += d; if (d > maxd) maxd = d; } }
console.log(`${A.split('/').pop()} vs ${B.split('/').pop()}: differing bytes ${diff}/${n} = ${(100 * diff / n).toFixed(4)}%  maxdelta ${maxd}  meandelta ${(sum / n).toFixed(3)}`);
