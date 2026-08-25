import sharp from 'sharp';
import { readdir } from 'node:fs/promises';

const DIR = 'assets/approved-trials';
const OUT = `${DIR}/_downscale-check`;

// §9.3 post-process targets
const TARGETS = {
  'player-overworld.png': [{ w: 32, h: 48, tag: 'ow32x48' }, { w: 64, h: 96, tag: 'ow64x96' }],
  'trainer-battle.png':   [{ w: 96, h: 96, tag: 'battle96' }],
  'creature-croc.png':    [{ w: 96, h: 96, tag: 'battle96' }, { w: 32, h: 32, tag: 'mini32' }],
  'creature-fox.png':     [{ w: 96, h: 96, tag: 'battle96' }, { w: 32, h: 32, tag: 'mini32' }],
};

for (const [file, targets] of Object.entries(TARGETS)) {
  const src = `${DIR}/${file}`;
  // trim the plain-white background to the subject bbox first, then nearest-neighbour downscale
  const trimmed = await sharp(src).flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 }).toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  console.log(`${file}: 1024x1024 -> trimmed ${width}x${height}`);
  for (const t of targets) {
    const out = `${OUT}/${file.replace('.png','')}-${t.tag}.png`;
    await sharp(trimmed.data).resize(t.w, t.h, { kernel: 'nearest', fit: 'contain',
      background: { r:0, g:0, b:0, alpha:0 } }).png().toFile(out);
    // also a 8x upscale so the result is actually inspectable by eye
    await sharp(out).resize(t.w*8, t.h*8, { kernel: 'nearest' }).png()
      .toFile(out.replace('.png','-x8.png'));
  }
}

// colour census across the approved set (palette planning; NOT the freeze)
const files = (await readdir(DIR)).filter(f => f.endsWith('.png'));
for (const f of files) {
  const { data, info } = await sharp(`${DIR}/${f}`).raw().toBuffer({ resolveWithObject: true });
  const set = new Set();
  for (let i = 0; i < data.length; i += info.channels) {
    set.add((data[i]<<16) | (data[i+1]<<8) | data[i+2]);
  }
  console.log(`colours  ${f.padEnd(24)} ${set.size}`);
}
