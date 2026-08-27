/**
 * tools/comfy/trial.ts — the generic SUPERVISED trial runner.
 *
 * Why this exists rather than another `b0-sweep.ts`: every supervised gate build-doc §15 names
 * (B0 player, B2 painted dex, B4 maps, B5 walk cycle) is the same loop — hold the graph and the
 * seed still, vary ONE authored string, look at the results side by side. `b0-sweep.ts` and
 * `player-views.ts` each rebuilt that loop with their axes hard-coded into the file, so a new
 * gate meant a new script. This one takes its rows from a JSON spec, so a gate is a spec.
 *
 * It is NOT the manifest runner and must never become one. `comfy-batch.ts` owns everything with
 * a manifest row: seed reuse (G5), the credit gate (G13), status writeback. A trial has no
 * manifest row yet — that is what makes it a trial — so nothing here writes to manifest.json.
 * The output of a passing trial is an EDIT to an authored block (`classes[].skeleton`,
 * `_nodes[].feature`, …) followed by `comfy-batch.ts rebuild`.
 *
 * Transport rules are `client.ts`'s (§9.1): the socket opens before the prompt is submitted, and
 * Comfy Cloud bills for failed jobs, so a failure is recorded and never silently retried here.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { ComfyClient, injectGraph, loadEnv, type Graph } from './client.ts';
import { degenerateReason, statsOf } from './output-check.ts';

export interface TrialRow {
  id: string;
  prompt: string;
  negative: string;
  /** Held constant across a sweep so a difference between cells is prompt-driven, never seed-driven. */
  seed: number;
}

export interface TrialSpec {
  name: string;
  /** Why this trial is being run and what would make a cell pass. Reviewed, not parsed. */
  question: string;
  outDir: string;
  rows: TrialRow[];
}

const BASE_GRAPH = 'tools/comfy/pixel-txt2img-api.json';

/**
 * G13's gate applies to trials too: 20+ generations is a batch, whoever launched it.
 * A trial is meant to be small — if a sweep needs 20 cells, the axes are wrong.
 */
const TRIAL_ROW_CAP = 20;

/**
 * Generation attempts per cell when the output comes back degenerate. EACH ONE BILLS.
 *
 * Sized against a measured success rate, not a guess: during the 2026-08-26 fault a health probe
 * every four minutes read BLACK, BLACK, BLACK, BLACK, then a clean image on the fifth, and a
 * 20-second burst in the same window read BLACK, BLACK, timeout. So roughly one job in five landed
 * on a healthy worker. Eight attempts clears a cell with ~83% probability at that rate; three
 * cleared it with ~49%. If the rate is worse than that this is the wrong tool anyway — stop and
 * probe rather than paying for a hundred black frames.
 */
const DEGENERATE_ATTEMPTS = 8;

export async function runTrial(spec: TrialSpec, opts: { dryRun?: boolean } = {}): Promise<void> {
  if (spec.rows.length > TRIAL_ROW_CAP) {
    throw new Error(
      `trial "${spec.name}" has ${spec.rows.length} rows; the cap is ${TRIAL_ROW_CAP} (G13). ` +
        'A sweep that large is not a trial — cut an axis, or plan it as manifest rows.',
    );
  }
  const ids = new Set<string>();
  for (const r of spec.rows) {
    if (ids.has(r.id)) throw new Error(`trial "${spec.name}" repeats row id "${r.id}"`);
    ids.add(r.id);
  }

  console.log(`\n=== trial: ${spec.name} — ${spec.rows.length} generations ===`);
  console.log(`question: ${spec.question}\n`);

  if (opts.dryRun) {
    for (const r of spec.rows) console.log(`  [dry] ${r.id}  seed=${r.seed}\n        ${r.prompt}\n`);
    return;
  }

  const env = await loadEnv();
  const client = new ComfyClient(env);
  const base = JSON.parse(await readFile(BASE_GRAPH, 'utf8')) as Graph;
  await mkdir(spec.outDir, { recursive: true });

  const record: Array<TrialRow & { status: string; file?: string; error?: string; ms?: number; attempts?: number }> = [];
  for (const [i, row] of spec.rows.entries()) {
    const t0 = Date.now();
    let attempts = 0;
    let done = false;
    /**
     * The black-output fault is INTERMITTENT, not a steady outage. Measured 2026-08-26: the same
     * 46-character prompt produced a clean image and, two minutes later at a different seed, a pure
     * black frame — and Comfy's own web UI reproduced both. So the pool has healthy and unhealthy
     * workers in it and which one a job lands on is luck. That makes a black frame a TRANSIENT
     * fault, in the same family as the dropped socket §9.1 already retries, rather than a verdict
     * on the row.
     *
     * The manifest runner does not need this loop: `fail()` leaves the row `failed`, `selectRows`
     * picks up `pending|failed`, so re-running the batch IS its retry, with a human between passes
     * watching what it costs. A trial has no such re-run, so it retries here.
     */
    while (attempts < DEGENERATE_ATTEMPTS && !done) {
      attempts++;
      const g = injectGraph(base, { positive: row.prompt, negative: row.negative, seed: row.seed });
      const tag = `[${i + 1}/${spec.rows.length}] ${row.id}${attempts > 1 ? ` (attempt ${attempts})` : ''}`;
      try {
        const outputs = await client.run(g, {
          onProgress: (v, m) => process.stdout.write(`\r  ${tag}  step ${v}/${m}   `),
        });
        const [file] = await client.saveAll(outputs, () => `${spec.outDir}/${row.id}.png`);
        const degenerate = file === undefined ? 'job returned no image' : degenerateReason(await statsOf(file));
        if (!degenerate) {
          record.push({ ...row, status: 'raw', file, attempts, ms: Date.now() - t0 });
          console.log(`\r  ${tag}  -> ${file}  (${Date.now() - t0}ms)        `);
          done = true;
          break;
        }
        console.log(`\r  ${tag}  NOT AN IMAGE — ${degenerate.split('.')[0]}.        `);
        if (attempts >= DEGENERATE_ATTEMPTS) {
          record.push({ ...row, status: 'failed', error: degenerate, attempts, ms: Date.now() - t0 });
        }
      } catch (e) {
        record.push({ ...row, status: 'failed', error: String(e), attempts, ms: Date.now() - t0 });
        console.log(`\r  ${tag}  FAILED: ${e}        `);
        done = true;
      }
    }
  }

  await writeFile(
    `${spec.outDir}/_trial.json`,
    JSON.stringify({ name: spec.name, question: spec.question, graph: BASE_GRAPH, rows: record }, null, 2) + '\n',
  );
  const ok = record.filter((r) => r.status === 'raw').length;
  console.log(`\n${spec.outDir}/_trial.json   (${ok}/${record.length} ok)`);
}

const invokedDirectly = process.argv[1]?.endsWith('trial.ts');
if (invokedDirectly) {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error('usage: npx tsx tools/comfy/trial.ts <spec.json> [--dry-run]');
    process.exit(2);
  }
  const spec = JSON.parse(await readFile(specPath, 'utf8')) as TrialSpec;
  await runTrial(spec, { dryRun: process.argv.includes('--dry-run') });
}
