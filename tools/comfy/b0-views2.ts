/**
 * Gate B0 follow-on, ITERATION 2 — targeted fixes for defects found by inspecting round 1.
 *
 * Round 1 (tools/comfy/b0-views.ts) produced six usable candidates, but every BACK candidate has a
 * defect that only shows at zoom, and that the aggregate ΔE tables cannot see because each defect
 * costs a few hundred pixels:
 *
 *   back-a, back-b — the nape below the cap renders NEAR-BLACK. The approved front's hair is
 *                    medium brown. A band metric scores this as "dark outline drift" and shrugs;
 *                    by eye it is a different character's hair.
 *   back-c         — the cap BRIM renders dark navy instead of green, and a stray yellow square
 *                    appears on the brim's left. L6 locks the cap green.
 *
 * The side candidates are healthy on colour (side-b is the most colour-stable image in the set,
 * mean ΔE 0.69 against the front's identity colours) but side-b and side-c carry a grey ground
 * shadow the front does not have — ~1.9% and ~2.7% of content pixels respectively.
 *
 * IDENTITY LOCK IS UNCHANGED. Same approved prefix/suffix, same negative, same seed 42. The only
 * substituted segment is still the view/pose clause. Naming the hair colour and the cap's back
 * inside that clause describes the SAME character seen from a different angle — the approved front
 * already has brown hair and a green cap — rather than adding an attribute; it is the §9.2 fidelity
 * rule ("front-load and repeat distinctive anatomy") applied to the view that keeps losing them.
 *
 * G13: 4 generations. Round 1 + round 2 = 10 total, still under the 20-item `--confirm` threshold.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { ComfyClient, injectGraph, loadEnv, type Graph } from './client.ts';

const TRIAL_SEED = 42;

const APPROVED_PREFIX =
  'pixel art overworld character sprite, retro 90s handheld RPG style, ' +
  'young field warden protagonist wearing a green shirt, brown shorts, ' +
  'a peaked green ranger cap with a small yellow star badge, ' +
  'a leather satchel on a shoulder strap, and brown walking boots';
const APPROVED_SUFFIX =
  'full body, compact youthful proportions, large head, short limbs, ' +
  'plain white background, crisp clean pixel edges, 2D game asset';

const prompt = (view: string) => `${APPROVED_PREFIX}, ${view}, ${APPROVED_SUFFIX}`;

const NEGATIVE =
  'low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs, ' +
  'cape, cloak, hood, mantle';

const VIEWS: Array<{ id: string; view: 'back' | 'side'; clause: string; fixes: string }> = [
  {
    id: 'b0-player-back-d', view: 'back',
    clause: 'seen from directly behind facing away, the all-green cap seen from the back with its peak '
      + 'pointing away from the viewer, short brown hair at the nape below the cap',
    fixes: 'back-a/b near-black nape; back-c navy brim',
  },
  {
    id: 'b0-player-back-e', view: 'back',
    clause: 'back view facing away from the viewer, the back of the head with short brown hair below '
      + 'the green cap, both arms hanging at the sides',
    fixes: 'back-a/b near-black nape; back-a raised arm',
  },
  {
    id: 'b0-player-back-f', view: 'back',
    clause: 'seen from behind walking away, short brown hair under the green cap, the satchel strap '
      + 'crossing the back and the satchel at the hip',
    fixes: 'near-black nape; also probes whether the satchel reads from behind',
  },
  {
    id: 'b0-player-side-d', view: 'side',
    clause: 'side view standing, facing right, full side profile, the satchel on the near shoulder, '
      + 'standing on a plain white background with no cast shadow',
    fixes: 'side-b ground shadow (1.9% of content pixels)',
  },
];

const env = await loadEnv();
const client = new ComfyClient(env);
const base = JSON.parse(await readFile('tools/comfy/pixel-txt2img-api.json', 'utf8')) as Graph;

console.log(`B0 views round 2: ${VIEWS.length} generations (round1 6 + round2 4 = 10, < 20, no --confirm per G13)\n`);
const rows: Record<string, unknown>[] = [];
const t00 = Date.now();
for (const [i, v] of VIEWS.entries()) {
  const positive = prompt(v.clause);
  const g = injectGraph(base, { positive, negative: NEGATIVE, seed: TRIAL_SEED });
  const t0 = Date.now();
  const row: Record<string, unknown> = {
    id: v.id, class: 'overworld-character', view: v.view, seed: TRIAL_SEED,
    targetSize: '32x48', status: 'pending', viewClause: v.clause, fixesAttempted: v.fixes,
    subject: positive, negative: NEGATIVE,
  };
  try {
    const outputs = await client.run(g, {
      onProgress: (n, m) => process.stdout.write(`\r  [${i + 1}/${VIEWS.length}] ${v.id}  step ${n}/${m}   `),
    });
    const [path] = await client.saveAll(outputs, () => `assets/raw/player/${v.id}.png`);
    row.status = 'raw'; row.file = path; row.ms = Date.now() - t0;
    console.log(`\r  [${i + 1}/${VIEWS.length}] ${v.id}  -> ${path}  (${Date.now() - t0}ms)      `);
  } catch (e) {
    row.status = 'failed'; row.error = String(e);
    console.log(`\r  [${i + 1}/${VIEWS.length}] ${v.id}  FAILED: ${e}      `);
  }
  rows.push(row);
}

await writeFile('assets/raw/player/_views-run2.json', JSON.stringify({
  gate: 'B0-followon-round2', workflowGraph: 'tools/comfy/pixel-txt2img-api.json',
  totalMs: Date.now() - t00, rows,
}, null, 2) + '\n');
console.log(`\n${rows.filter((r) => r.status === 'raw').length}/${rows.length} ok in ${Date.now() - t00}ms`);
