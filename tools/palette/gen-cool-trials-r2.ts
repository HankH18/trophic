/**
 * tools/palette/gen-cool-trials-r2.ts — round 2. Two Fenmaw correctives, one magenta probe.
 *
 * ROUND-1 FINDING, MEASURED BY EYE: `pt-fenmaw` regressed to a generic
 * crocodilian muzzle — short, broad, blunt — the same failure an earlier trial hit. It did so even though the
 * manifest's derived subject string ALREADY applies §9.2's fidelity rule: "Fenmaw, bulk gharial
 * with a long narrow gharial snout, adult Water creature, bulk gharial with a long narrow gharial
 * snout" front-loads and repeats the anatomy twice. So the rule as currently implemented does not
 * fix this species, and B3 will ship 6 generic crocs unless something else changes.
 *
 * Two hypotheses, one generation each, because guessing which is right is cheaper to test than to
 * argue:
 *
 *   H1 (prompt strength)  — the model needs the snout described by its geometry rather than by the
 *                           adjective "gharial", which it evidently reads as "crocodile".
 *   H2 (view geometry)    — the creature-battle class view is `facing the viewer, battle stance`.
 *                           A gharial's defining feature is its LENGTH along the view axis, which a
 *                           head-on view foreshortens to nothing. If H2 is right the fix is not a
 *                           prompt at all; it is a per-species view exception in §9.2, and that is a
 *                           different and more expensive finding.
 *
 * The third row is a magenta probe. Round 1 left magenta at 1.5% mean share across 13 images, and
 * the magenta probe is the worst cool-probe failure measured in round 1 (ΔE 42.7). Webvern is the roster's
 * pure-Poison line (bible §4 row 15); if a Poison creature does not render magenta either, then the
 * magenta probe has no game content behind it and NOT covering it is the correct answer rather than
 * a gap. That is a measurement, not an assumption, which is why it is worth one generation.
 *
 * G13: round 1 = 13, round 2 = 3, total 16 — under the 20-item `--confirm` threshold.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ComfyClient, injectGraph, loadEnv, type Graph } from '../comfy/client.ts';

const TRIAL_SEED = 42;
const OUT_DIR = 'assets/raw/palette-trials';
const GRAPH = 'tools/comfy/pixel-txt2img-api.json';
const NEGATIVE = 'low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs';

/**
 * The skeleton and the rows are AUTHORED CONTENT and live in `tools/palette/trials-round2.json`.
 * Same reason as round 1: build-doc §8.3 / G3 forbid content literals in code, and a species name in
 * a `.ts` string literal is what `no_shadow_tables` exists to catch.
 */
interface TrialRow { id: string; subject: string; view: string; hypothesis: string; region: string }
const plan = JSON.parse(await readFile('tools/palette/trials-round2.json', 'utf8')) as
  { _skeleton: string; rows: TrialRow[] };
const ROWS = plan.rows;
const render = (subject: string, view: string) =>
  plan._skeleton.replace('{subject}', subject).replace('{view}', view);

const graphText = await readFile(GRAPH, 'utf8');
const base = JSON.parse(graphText) as Graph;
const graphSha = createHash('sha256').update(graphText).digest('hex');

const env = await loadEnv();
const client = new ComfyClient(env);

console.log(`palette trials round 2: ${ROWS.length} generations (13 + ${ROWS.length} = ${13 + ROWS.length}, < 20, no --confirm per G13)\n`);

const rows: Record<string, unknown>[] = [];
const t00 = Date.now();
for (const [i, r] of ROWS.entries()) {
  const positive = render(r.subject, r.view);
  const g = injectGraph(base, { positive, negative: NEGATIVE, seed: TRIAL_SEED });
  const t0 = Date.now();
  const row: Record<string, unknown> = {
    id: r.id, class: 'creature-battle', view: r.view, colourRegion: r.region,
    hypothesis: r.hypothesis, seed: TRIAL_SEED, subject: positive, negative: NEGATIVE,
    workflowGraph: GRAPH, workflowGraphSha256: graphSha, status: 'pending',
  };
  try {
    const outputs = await client.run(g, {
      onProgress: (n, m) => process.stdout.write(`\r  [${i + 1}/${ROWS.length}] ${r.id}  step ${n}/${m}   `),
    });
    const [path] = await client.saveAll(outputs, () => `${OUT_DIR}/${r.id}.png`);
    row.status = 'raw';
    row.file = path;
    row.sha256 = createHash('sha256').update(await readFile(path!)).digest('hex');
    row.ms = Date.now() - t0;
    console.log(`\r  [${i + 1}/${ROWS.length}] ${r.id.padEnd(16)} -> ${path}  (${Date.now() - t0}ms)      `);
  } catch (e) {
    row.status = 'failed';
    row.error = String(e);
    console.log(`\r  [${i + 1}/${ROWS.length}] ${r.id.padEnd(16)} FAILED: ${e}      `);
  }
  rows.push(row);
}

await writeFile(`${OUT_DIR}/_run2.json`, JSON.stringify({
  purpose: 'Round 2: the gharial-snout correctives + a magenta-content probe. '
    + 'Subjects are in tools/palette/trials-round2.json — G3 keeps content names out of code.',
  workflowGraph: GRAPH, workflowGraphSha256: graphSha, seed: TRIAL_SEED,
  generations: ROWS.length, cumulativeGenerations: 13 + ROWS.length, totalMs: Date.now() - t00, rows,
}, null, 2) + '\n');

console.log(`\n${rows.filter((r) => r.status === 'raw').length}/${rows.length} ok`);
console.log(`GENERATION COUNT: round1 13 + round2 ${ROWS.length} = ${13 + ROWS.length}`);
