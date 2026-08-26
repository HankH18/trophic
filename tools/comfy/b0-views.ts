/**
 * Gate B0 follow-on (build-doc §15): the player's remaining STATIC views.
 *
 * Precondition: B0 passed — Hank approved `assets/approved-trials/player-APPROVED.png`
 * (= assets/raw/b0/b0-player-peaked-compact.png, sha256 ba2df071…). §15 says "Nothing
 * multi-version starts before B0", so this may run only now.
 *
 * IDENTITY LOCK. The positive prompt below is the APPROVED string, verbatim, with exactly ONE
 * segment substituted: the view/pose clause `standing facing forward`. Nothing else moves —
 * not the subject, not the proportions clause, not the style skeleton, not the negative.
 * That is what makes the back/side reads the *same character* rather than a near-miss.
 *
 * SEED. Held at 42 — the validated trial seed and the approved front's seed. Same latent
 * noise + same prompt minus one clause is the strongest available lever for cross-view coherence.
 * G5 is not in play: these are NEW manifest rows for views that have no approved asset yet, not a
 * regeneration of the approved front.
 *
 * NOT the walk cycle. §9.6 is a separate SUPERVISED gate (B5) and is explicitly out of scope here.
 *
 * G13: 6 generations, well under the 20-item `--confirm` threshold.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { ComfyClient, injectGraph, loadEnv, type Graph } from './client.ts';

const TRIAL_SEED = 42;

/** The approved prompt, split at the view/pose clause. Only `view` varies below. */
const APPROVED_PREFIX =
  'pixel art overworld character sprite, retro 90s handheld RPG style, ' +
  'young field warden protagonist wearing a green shirt, brown shorts, ' +
  'a peaked green ranger cap with a small yellow star badge, ' +
  'a leather satchel on a shoulder strap, and brown walking boots';
const APPROVED_SUFFIX =
  'full body, compact youthful proportions, large head, short limbs, ' +
  'plain white background, crisp clean pixel edges, 2D game asset';

/** The approved front's own view clause — kept here so the substitution is auditable. */
export const APPROVED_VIEW_CLAUSE = 'standing facing forward';

const prompt = (view: string) => `${APPROVED_PREFIX}, ${view}, ${APPROVED_SUFFIX}`;

/** Frozen negative + the player-class cape lock. Unchanged from the approved row. */
const NEGATIVE =
  'low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs, ' +
  'cape, cloak, hood, mantle';

/** Three phrasings per view. All three stay inside the view/pose clause. */
const VIEWS: Array<{ id: string; view: 'back' | 'side'; clause: string }> = [
  { id: 'b0-player-back-a',  view: 'back', clause: 'seen from behind, facing away' },
  { id: 'b0-player-back-b',  view: 'back', clause: 'back view, seen from behind, facing away from the viewer, the back of the cap and the satchel strap visible' },
  { id: 'b0-player-back-c',  view: 'back', clause: 'rear view, standing with the back turned to the viewer, face not visible' },
  { id: 'b0-player-side-a',  view: 'side', clause: 'side profile view, facing right' },
  { id: 'b0-player-side-b',  view: 'side', clause: 'side view standing, facing right, full side profile, the satchel on the near shoulder' },
  { id: 'b0-player-side-c',  view: 'side', clause: 'strict side profile facing right, one eye visible, the cap peak pointing right' },
];

const env = await loadEnv();
const client = new ComfyClient(env);
const base = JSON.parse(await readFile('tools/comfy/pixel-txt2img-api.json', 'utf8')) as Graph;

const creditsBefore = await client.credits();
console.log(`credits endpoint: ${creditsBefore === null ? 'none' : creditsBefore}`);
console.log(`B0 views: ${VIEWS.length} generations (< 20, so no --confirm gate per G13)\n`);

const rows: Record<string, unknown>[] = [];
const t00 = Date.now();
for (const [i, v] of VIEWS.entries()) {
  const positive = prompt(v.clause);
  const g = injectGraph(base, { positive, negative: NEGATIVE, seed: TRIAL_SEED });
  const t0 = Date.now();
  const row: Record<string, unknown> = {
    id: v.id, class: 'overworld-character', view: v.view, seed: TRIAL_SEED,
    targetSize: '32x48', status: 'pending', viewClause: v.clause,
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

await writeFile('assets/raw/player/_views-run.json', JSON.stringify({
  gate: 'B0-followon', workflowGraph: 'tools/comfy/pixel-txt2img-api.json',
  approvedViewClause: APPROVED_VIEW_CLAUSE, totalMs: Date.now() - t00, rows,
}, null, 2) + '\n');
console.log(`\n${rows.filter((r) => r.status === 'raw').length}/${rows.length} ok in ${Date.now() - t00}ms`);
console.log('run record: assets/raw/player/_views-run.json');
