/**
 * tools/palette/gen-cool-trials.ts — trials for the colour regions the frozen palette cannot reach.
 *
 * WHY THIS EXISTS. `data/palette.json` is frozen from five approved trials — player, fire fox,
 * green crocodilian, farmer trainer, meadow town map. Measured hue share of that set's content
 * pixels: cyan 1.05%, blue 0.05%, magenta 0.66% (DEVIATIONS-lane-b B-D13). The §8.4 method was
 * followed exactly; its INPUT had no cool half. Bible §1 ships a Water type and a Dark type, §4
 * ships a Water starter line and a Water/Dark Ancient, and §6 makes Brackwater — a stilt town on a
 * marsh — the year-2 town of the never-cut vertical slice. None of that is in the source set.
 *
 * WHAT IT GENERATES. One trial per unrepresented colour region, subjects taken VERBATIM from
 * `tools/comfy/manifest.json` — which is itself the G2-gated transcription of bible §4/§6 — so the
 * trial prompt is the string B3/B4 will actually submit for that asset, not a paraphrase of it.
 * Cindershelf is the CONTROL: it is warm, already served, and is here to test whether the existing
 * warm half is genuinely sufficient rather than assumed to be.
 *
 * SEED. 42, the validated trial seed (B-D1), for every row — the same seed every B0 trial used.
 * The manifest's own derived seed for the corresponding row is recorded alongside so the two are
 * never confused; see `tools/comfy/manifest-palette.json` and deviation B-D18. G5 is untouched:
 * no approved asset is being regenerated, and none of these rows is approved.
 *
 * G13: this file's row count is asserted below to stay under 20 so the `--confirm` gate does not
 * apply. Every generation is counted, including correctives.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ComfyClient, injectGraph, loadEnv, type Graph } from '../comfy/client.ts';

const TRIAL_SEED = 42;
const OUT_DIR = 'assets/raw/palette-trials';
const GRAPH = 'tools/comfy/pixel-txt2img-api.json';

interface ManifestRow {
  id: string;
  class: string;
  view?: string;
  seed?: number;
  targetSize?: string;
  prompt: string;
  negative: string;
}

/**
 * The plan is AUTHORED CONTENT and lives in `tools/palette/trials-round1.json`, not here. Each row
 * names a manifest row to take the prompt from, plus the colour region it exists to cover; `region`
 * is the reason the row exists, so a row that did not deliver its region is visible next to the
 * measured hue share rather than quietly averaged in.
 *
 * It is a JSON file because build-doc §8.3 / G3 forbid content literals in code — species and town
 * names in a `.ts` string are exactly what `no_shadow_tables` (tests/property/foodweb.test.ts) is
 * there to catch, and a generator that names species is a shadow content table however small.
 */
interface PlanRow { id: string; from: string; region: string; why: string }
const PLAN = (JSON.parse(await readFile('tools/palette/trials-round1.json', 'utf8')) as
  { rows: PlanRow[] }).rows;

if (PLAN.length >= 20) throw new Error(`G13: ${PLAN.length} rows needs a credit estimate + --confirm`);

const manifest = JSON.parse(await readFile('tools/comfy/manifest.json', 'utf8')) as { rows: ManifestRow[] };
const byId = new Map(manifest.rows.map((r) => [r.id, r]));

const graphText = await readFile(GRAPH, 'utf8');
const base = JSON.parse(graphText) as Graph;
const graphSha = createHash('sha256').update(graphText).digest('hex');

const env = await loadEnv();
const client = new ComfyClient(env);

await mkdir(OUT_DIR, { recursive: true });
console.log(`palette trials: ${PLAN.length} generations at seed ${TRIAL_SEED} (< 20, no --confirm per G13)\n`);

const rows: Record<string, unknown>[] = [];
const t00 = Date.now();
for (const [i, p] of PLAN.entries()) {
  const src = byId.get(p.from);
  if (!src) throw new Error(`manifest.json has no row "${p.from}" — G2: subjects come from the manifest, never invented`);

  const g = injectGraph(base, { positive: src.prompt, negative: src.negative, seed: TRIAL_SEED });
  const t0 = Date.now();
  const row: Record<string, unknown> = {
    id: p.id,
    class: src.class,
    view: src.view ?? null,
    colourRegion: p.region,
    why: p.why,
    manifestRow: p.from,
    manifestDerivedSeed: src.seed ?? null,
    seed: TRIAL_SEED,
    seedNote: 'Trial seed 42 (B-D1), NOT the manifest row\'s derived seed. These are palette trials, '
      + 'not the shipped asset; G5 is untouched because no approved asset is being regenerated.',
    subject: src.prompt,
    negative: src.negative,
    workflowGraph: GRAPH,
    workflowGraphSha256: graphSha,
    status: 'pending',
  };
  try {
    const outputs = await client.run(g, {
      onProgress: (n, m) => process.stdout.write(`\r  [${i + 1}/${PLAN.length}] ${p.id}  step ${n}/${m}   `),
    });
    const [path] = await client.saveAll(outputs, () => `${OUT_DIR}/${p.id}.png`);
    row.status = 'raw';
    row.file = path;
    row.sha256 = createHash('sha256').update(await readFile(path!)).digest('hex');
    row.ms = Date.now() - t0;
    console.log(`\r  [${i + 1}/${PLAN.length}] ${p.id.padEnd(20)} -> ${path}  (${Date.now() - t0}ms)      `);
  } catch (e) {
    row.status = 'failed';
    row.error = String(e);
    console.log(`\r  [${i + 1}/${PLAN.length}] ${p.id.padEnd(20)} FAILED: ${e}      `);
  }
  rows.push(row);
}

await writeFile(`${OUT_DIR}/_run1.json`, JSON.stringify({
  purpose: 'Round 1 of the cool-region palette trials (DEVIATIONS-lane-b B-D13).',
  workflowGraph: GRAPH, workflowGraphSha256: graphSha, seed: TRIAL_SEED,
  generations: PLAN.length, totalMs: Date.now() - t00, rows,
}, null, 2) + '\n');

console.log(`\n${rows.filter((r) => r.status === 'raw').length}/${rows.length} ok in ${Date.now() - t00}ms`);
console.log(`GENERATION COUNT THIS RUN: ${PLAN.length}`);
