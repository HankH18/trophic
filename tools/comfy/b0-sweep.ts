/**
 * Gate B0 (build-doc §15): player-sprite iteration sweep.
 *
 * Style target is assets/approved-trials/player-style-reference.png (Hank's pick) MINUS the cape.
 * L6 requires: green shirt, ranger cap w/ star badge, leather satchel, walking boots, NO cape.
 * Two axes only, so the contact sheet is readable: 3 hat readings x 3 proportion readings.
 * Seed is held at the validated trial seed (42) across all nine so differences are prompt-driven.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { ComfyClient, injectGraph, loadEnv, type Graph } from './client.ts';

const TRIAL_SEED = 42;

// The skeleton VERBATIM from the validated trial graph — this is the empirical style lock.
const skeleton = (subject: string, proportions: string) =>
  `pixel art overworld character sprite, retro 90s handheld RPG style, ${subject}, ` +
  `standing facing forward, full body, ${proportions}, plain white background, ` +
  `crisp clean pixel edges, 2D game asset`;

// Frozen negative (§9.2) + cape/cloak/hood, player-class only: L6 forbids a cape and the style
// reference has one, so the ban has to be enforced on the negative side.
const NEGATIVE =
  'low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs, ' +
  'cape, cloak, hood, mantle';

const HATS = {
  floppy: 'a wide-brimmed floppy green ranger hat with a small yellow star badge',
  bucket: 'a soft green bucket-style ranger hat with a small yellow star badge',
  peaked: 'a peaked green ranger cap with a small yellow star badge',
};
const PROPS = {
  chibi: 'small chibi proportions',
  compact: 'compact youthful proportions, large head, short limbs',
  sturdy: 'sturdy young-adventurer proportions',
};

const body = (hat: string) =>
  `young field warden protagonist wearing a green shirt, brown shorts, ${hat}, ` +
  `a leather satchel on a shoulder strap, and brown walking boots`;

const env = await loadEnv();
const client = new ComfyClient(env);
const base = JSON.parse(await readFile('tools/comfy/pixel-txt2img-api.json', 'utf8')) as Graph;

const rows: any[] = [];
for (const [hk, hv] of Object.entries(HATS)) {
  for (const [pk, pv] of Object.entries(PROPS)) {
    rows.push({
      id: `b0-player-${hk}-${pk}`, class: 'overworld-character', view: 'front',
      seed: TRIAL_SEED, targetSize: '32x48', status: 'pending',
      subject: skeleton(body(hv), pv), negative: NEGATIVE,
    });
  }
}

console.log(`B0 sweep: ${rows.length} generations (< 20, so no --confirm gate per G13)\n`);
for (const [i, row] of rows.entries()) {
  const g = injectGraph(base, { positive: row.subject, negative: row.negative, seed: row.seed });
  const t0 = Date.now();
  try {
    const outputs = await client.run(g, {
      onProgress: (v, m) => process.stdout.write(`\r  [${i + 1}/${rows.length}] ${row.id}  step ${v}/${m}   `),
    });
    const [path] = await client.saveAll(outputs, () => `assets/raw/b0/${row.id}.png`);
    row.status = 'raw'; row.file = path;
    console.log(`\r  [${i + 1}/${rows.length}] ${row.id}  -> ${path}  (${Date.now() - t0}ms)      `);
  } catch (e) {
    row.status = 'failed'; row.error = String(e);
    console.log(`\r  [${i + 1}/${rows.length}] ${row.id}  FAILED: ${e}      `);
  }
}

await writeFile('tools/comfy/manifest-b0.json', JSON.stringify(
  { gate: 'B0', workflowGraph: 'tools/comfy/pixel-txt2img-api.json', rows }, null, 2) + '\n');
console.log(`\nmanifest: tools/comfy/manifest-b0.json  (${rows.filter(r => r.status === 'raw').length}/${rows.length} ok)`);
