/**
 * tests/gates/workflow-lock.test.ts — THE GRAPH IDENTITY GATE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS — two style locks, both unable to fire, for two different reasons
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `assertWorkflowLock` (tools/comfy/comfy-batch.ts) is a correct check. It compares a row's recorded
 * `workflowHash` against the hash of the graph that would be submitted now, and throws
 * `StyleLockError` naming build-doc §9.2 and §8.4. Nothing is wrong with it.
 *
 * It had **no reachable subject.** Exactly one row of the 288 in `tools/comfy/manifest.json` carries
 * both halves of its guard (`recordedSeed` and `workflowHash`): `player-front`, seed 42, hash
 * 661e805f06b0ef35. That row is `status: "approved"`, and `selectRows` filters the batch down to
 * `pending`/`failed` unless `--force`. So on every unattended run the one row the lock could speak
 * about is filtered out before the lock is ever called, and the guard reads as coverage while
 * comparing nothing. Same family as the fully green suite that once certified 39 dialogue entries
 * the player could not reach.
 *
 * The batch runner is deliberately NOT being changed to police approved rows. Enforcing the lock
 * live would mean that the moment the graph moves, a batch refuses to start — blocking 287 pending
 * rows over one approved row nobody is regenerating. `selectRows` excludes approved rows by design;
 * policing a lock over rows the batch is deliberately not touching inverts that design rather than
 * completing it. A hard stop in CI costs nothing where a hard stop in the batch costs everything.
 *
 * **So this file is the only place the refusal lives.** If it passes vacuously, nothing anywhere
 * catches a moved graph. Every assertion below is therefore paired with a refusal to pass empty.
 *
 * The second lock is the mirror image: top-level `workflowGraphSha256` is WRITTEN by three builders
 * (`tools/comfy/build-manifest-b0.ts:314` and `:452`, `tools/palette/build-manifest-palette.ts:463`)
 * and, grepped across `tools core game tests` with the writes filtered out, was read by NOTHING.
 * Two manifests assert a graph hash for a graph nobody checked.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT MOVES THE GRAPH — and why a red here is usually CORRECT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * A LoRA inserts `LoraLoaderModelOnly` between `UNETLoader` and `ModelSamplingAuraFlow`. That is a
 * change to `tools/comfy/pixel-txt2img-api.json`, so it moves the file's sha256 AND the 16-hex
 * `workflowHash` of every injected graph built from it — and every row recorded under the old hash
 * becomes unreproducible. This gate is DESIGNED to fire on that day. A LoRA winning is a correct
 * change, not a defect; see REMEDY below, which is what the failures print.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DISCIPLINE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 1. **The shipped comparison is CALLED, never reimplemented.** Lock 1 imports `assertWorkflowLock`,
 *    `workflowHash`, `injectGraph` and `seedForSubmit` and runs them. A second implementation of a
 *    hash check is a thing that can silently disagree with the first, which is the defect class this
 *    repo keeps paying for. The one piece that cannot be imported — the builders' file-sha helper is
 *    a private `const` inside a top-level-await script that would RUN if imported — is pinned
 *    textually instead: see `BUILDER_SHA_EXPR`.
 * 2. **Nothing may pass vacuously.** Zero rows carrying a `workflowHash`, zero rows the lock can
 *    actually speak about, a manifest with no recorded sha, a graph file that is not on disk — every
 *    one of those is a LOUD failure naming what was absent, never a quiet skip over an empty loop.
 * 3. **The prompt half is asserted separately so it cannot mask the graph half.** `graphForRow`
 *    calls `assertStyleLock` before `assertWorkflowLock`; a prompt-lock break would throw first and
 *    the graph would go unchecked. Lock 1 therefore calls `assertWorkflowLock` directly and checks
 *    the prompt half in its own case.
 * 4. **The root is resolved from this file**, so the whole gate can be re-rooted by copying it
 *    verbatim into a fixture tree at the same depth. That is how the sabotage proof was run: the
 *    gate source was never patched, only the data underneath it.
 */
import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertStyleLock,
  assertWorkflowLock,
  graphForRow,
  loadManifest,
  reseeded,
  seedForSubmit,
  StyleLockError,
  workflowHash,
  type ManifestRow,
} from '../../tools/comfy/comfy-batch.ts';
import { injectGraph, type Graph } from '../../tools/comfy/client.ts';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const at = (p: string): string => resolve(ROOT, p);

const MANIFEST = 'tools/comfy/manifest.json';
const B0 = 'tools/comfy/manifest-b0.json';
const PALETTE = 'tools/comfy/manifest-palette.json';

/** Every manifest that names a graph by PATH. All three must name one that is actually there. */
const GRAPH_PATH_MANIFESTS = [MANIFEST, B0, PALETTE] as const;

/**
 * The manifests whose builders WRITE `workflowGraphSha256`, and the command that rewrites each.
 *
 * `tools/comfy/manifest.json` is deliberately NOT in this list: it carries `workflowGraph` (a path)
 * and no `workflowGraphSha256` at all, so `comfy-batch.ts rebuild` cannot repair a red from Lock 2 —
 * the field is not in its file. Naming the wrong command in a failure message is worse than naming
 * none: whoever hits the red runs the rebuild they already know, watches nothing change, and
 * concludes the gate is broken. `manifest.json` has its own case below pinning that absence, so this
 * list and the message stay true.
 */
const SHA_MANIFESTS = [
  { manifest: B0, rebuild: 'npx tsx tools/comfy/build-manifest-b0.ts' },
  { manifest: PALETTE, rebuild: 'npx tsx tools/palette/build-manifest-palette.ts' },
] as const;

const REMEDY =
  '\n  ── what to do ──────────────────────────────────────────────────────────────────────\n' +
  '  This gate fires when what a manifest records about the workflow graph stops matching the graph\n' +
  '  on disk — including when the record goes missing. A moved graph is often a CORRECT change:\n' +
  '  adding a LoRA (LoraLoaderModelOnly between UNETLoader and ModelSamplingAuraFlow) moves it, and\n' +
  '  a LoRA winning is not a defect. Decide which happened:\n' +
  '\n' +
  '  · The graph moved DELIBERATELY -> rebuild the manifests so their recorded hashes match the\n' +
  '    graph now on disk, then re-run this gate:\n' +
  '        npx tsx tools/comfy/build-manifest-b0.ts          (writes manifest-b0.json)\n' +
  '        npx tsx tools/palette/build-manifest-palette.ts   (writes manifest-palette.json)\n' +
  '    Both derive the sha fresh from the bytes on disk, so re-running them self-corrects.\n' +
  '    Each also takes --dry-run to run its own guards and write nothing.\n' +
  '    Rows already generated under the OLD graph are now unreproducible: version them (§8.4) or\n' +
  '    accept that their recorded hash describes a graph that no longer exists.\n' +
  '\n' +
  '  · The graph moved BY ACCIDENT -> restore tools/comfy/pixel-txt2img-api.json instead.\n' +
  '\n' +
  '  NOT `comfy-batch.ts rebuild`. tools/comfy/manifest.json carries no workflowGraphSha256 at\n' +
  '  all, so the runner never writes the field and rebuilding it changes nothing here.\n' +
  '  ────────────────────────────────────────────────────────────────────────────────────\n';

/**
 * The builders' file-sha helper, verbatim, from `build-manifest-b0.ts:57` and
 * `build-manifest-palette.ts:47`. Both are private `const`s inside scripts that execute on import
 * (top-level await, no entrypoint guard), so they cannot be imported and called. Pinning the
 * EXPRESSION is the next best thing: if a builder changes how it hashes, this gate says so in one
 * line instead of producing a mismatch red that reads like a moved graph.
 */
const BUILDER_SHA_EXPR = "createHash('sha256').update(await readFile(p)).digest('hex')";
const BUILDER_SOURCES = [
  'tools/comfy/build-manifest-b0.ts',
  'tools/palette/build-manifest-palette.ts',
] as const;

const sha256OfFile = async (p: string): Promise<string> =>
  createHash('sha256').update(await readFile(p)).digest('hex');

const onDisk = async (p: string): Promise<boolean> => access(p).then(() => true, () => false);

/**
 * One moved graph invalidates every recorded hash at once, and 19 identical stanzas bury the line
 * that says what to do. Show enough to identify the manifests, then count the rest.
 */
const cap = (lines: readonly string[], n = 6): string =>
  lines.length <= n ? lines.join('\n') : `${lines.slice(0, n).join('\n')}\n  … and ${String(lines.length - n)} more`;

/** One object in a manifest that names a graph, records its hash, or both. */
interface GraphRef {
  /** Dotted path to the object inside the manifest, for a failure that can be navigated to. */
  where: string;
  graph?: string;
  sha?: string;
}

/**
 * Every `workflowGraph` / `workflowGraphSha256` in a manifest, at ANY depth.
 *
 * Not just the top level: `manifest-b0.json` records a sha on `rows[0]` too, and every row of
 * `manifest-palette.json` records one. A gate that only read the top-level field would leave 17 of
 * 19 recorded hashes unchecked while reporting that it had checked the manifest.
 */
function graphRefs(v: unknown, path: string, out: GraphRef[]): GraphRef[] {
  if (v === null || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    v.forEach((x, i) => graphRefs(x, `${path}[${i}]`, out));
    return out;
  }
  const o = v as Record<string, unknown>;
  const graph = typeof o.workflowGraph === 'string' ? o.workflowGraph : undefined;
  const sha = typeof o.workflowGraphSha256 === 'string' ? o.workflowGraphSha256 : undefined;
  if (graph !== undefined || sha !== undefined) {
    out.push({
      where: path === '' ? '<top level>' : path,
      ...(graph === undefined ? {} : { graph }),
      ...(sha === undefined ? {} : { sha }),
    });
  }
  for (const [k, val] of Object.entries(o)) graphRefs(val, path === '' ? k : `${path}.${k}`, out);
  return out;
}

const readJson = async (p: string): Promise<unknown> => JSON.parse(await readFile(at(p), 'utf8')) as unknown;

const manifest = await loadManifest(at(MANIFEST));

/**
 * The base graph, loaded from the path the MANIFEST names rather than a path repeated here — and
 * loaded so that its absence becomes a reported failure instead of a module-load crash.
 *
 * A throw at module scope makes vitest print "0 test" and a stack: still red, but red in a way that
 * reads as a broken gate and buries the nine cases that did have something to say. If the graph is
 * renamed, what the operator needs to see is Lock 2 naming the manifest that points at nothing.
 */
const BASE_GRAPH_REL = typeof manifest.workflowGraph === 'string' ? manifest.workflowGraph : '';
let loadedGraph: Graph | undefined;
let graphLoadError = `${MANIFEST} names no \`workflowGraph\`, so there is no graph to hash`;
if (BASE_GRAPH_REL !== '') {
  try {
    loadedGraph = JSON.parse(await readFile(at(BASE_GRAPH_REL), 'utf8')) as Graph;
  } catch (e) {
    graphLoadError =
      `${MANIFEST} names \`workflowGraph: "${BASE_GRAPH_REL}"\` but it could not be read: ` +
      `${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Red, never skipped: with no graph there is nothing to compare, and that is a finding. */
function requireBaseGraph(): Graph {
  if (loadedGraph === undefined) {
    expect.fail(
      `${graphLoadError}.\n` +
        '  Every recorded workflowHash describes a graph that is not there, so no row in the manifest is\n' +
        '  reproducible. Restore the file, or correct the manifest that names it.',
    );
  }
  return loadedGraph;
}

/** Rows carrying a recorded `workflowHash` — the whole population Lock 1 is about, any status. */
const withHash: ManifestRow[] = manifest.rows.filter((r) => r.workflowHash !== undefined);

/**
 * The rows `assertWorkflowLock` will actually COMPARE, mirroring its three early returns
 * (comfy-batch.ts:404-406) rather than restating its comparison. A row outside this set is one the
 * shipped function declines to speak about, and counting it as coverage is the original defect.
 */
const effective: ManifestRow[] = withHash.filter(
  (r) => r.recordedSeed !== undefined && !reseeded(r) && r.mode === 'txt2img',
);

/** The named pin. If `player-front` stops being a subject, that is a decision, not a drift. */
const PINNED_SUBJECT = 'player-front';

const describeRow = (r: ManifestRow): string =>
  `${r.id} (status ${r.status}, mode ${r.mode}, version ${r.version}, ` +
  `recordedSeed ${String(r.recordedSeed)}, recordedVersion ${String(r.recordedVersion)}, ` +
  `workflowHash ${String(r.workflowHash)})`;

/** The graph the runner would submit for a txt2img row — the shipped injection, not a copy of it. */
const submittedHash = (row: ManifestRow, base: Graph): string =>
  workflowHash(injectGraph(base, { positive: row.prompt, negative: row.negative, seed: seedForSubmit(row) }));

describe('Lock 1 — assertWorkflowLock, over every row that carries a workflowHash', () => {
  it('has a non-empty subject set, so the lock is not being run over nothing', () => {
    expect(manifest.rows.length, `${MANIFEST} has no rows[] — nothing to lock`).toBeGreaterThan(0);

    if (withHash.length === 0) {
      expect.fail(
        `${MANIFEST} has ${String(manifest.rows.length)} rows and NOT ONE carries a workflowHash.\n` +
          '  assertWorkflowLock returns immediately on such a row, so this gate would loop over an empty\n' +
          '  set and report success — which is the exact failure that produced this file. Either the\n' +
          '  manifest was reset and the recorded generations were lost, or `workflowHash` stopped being\n' +
          '  written by runBatch (comfy-batch.ts, `row.workflowHash = o.hash`). Neither is a green.',
      );
    }
  });

  it('has at least one row the lock will actually compare, and it still includes the pinned subject', () => {
    if (effective.length === 0) {
      const why = withHash.map((r) => {
        const reasons: string[] = [];
        if (r.recordedSeed === undefined) reasons.push('no recordedSeed');
        if (reseeded(r)) reasons.push(`reseeded (recordedVersion ${String(r.recordedVersion)} != version ${String(r.version)})`);
        if (r.mode !== 'txt2img') reasons.push(`mode ${r.mode} — the lock is txt2img-only by design`);
        return `    ${r.id}: ${reasons.join('; ')}`;
      });
      expect.fail(
        (withHash.length === 0
          ? 'No row carries a workflowHash at all, so assertWorkflowLock has nothing to compare (see the\n  case above for what that means).'
          : `${String(withHash.length)} row(s) carry a workflowHash, but assertWorkflowLock returns early on\n` +
            '  EVERY one of them, so it compares nothing. A guard with no subject is not coverage:\n' +
            `${cap(why)}`) +
          '\n  If a subject was versioned deliberately (§8.4 licenses that), a NEW generation under the new\n' +
          '  graph has to take its place before this gate means anything again.',
      );
    }

    const ids = effective.map((r) => r.id);
    expect(
      ids,
      `${PINNED_SUBJECT} is the row this gate was pinned to and it is no longer a subject the lock\n` +
        `  compares. Subjects now: ${ids.join(', ') || '(none)'}.\n` +
        `  If ${PINNED_SUBJECT} was versioned on purpose, add the row that replaced it to PINNED_SUBJECT\n` +
        '  in this file FIRST — do not simply delete the pin, or the gate goes back to proving nothing.',
    ).toContain(PINNED_SUBJECT);
  });

  it('passes the shipped assertWorkflowLock for every subject — the graph has not moved', () => {
    const base = requireBaseGraph();
    const failures: string[] = [];
    for (const row of effective) {
      try {
        // The shipped function, called for real. Nothing here re-implements its comparison.
        assertWorkflowLock(row, submittedHash(row, base));
      } catch (e) {
        // The shipped message already opens with the row id; a second prefix here reads as a bug.
        failures.push(`  ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    expect(effective.length, 'no subject was submitted to assertWorkflowLock').toBeGreaterThan(0);
    if (failures.length > 0) {
      expect.fail(
        `The workflow graph no longer hashes to what these rows were generated with:\n${cap(failures)}\n` +
          REMEDY,
      );
    }
  });

  it('holds the prompt half too, so a prompt break cannot mask the graph break', () => {
    // graphForRow calls assertStyleLock BEFORE assertWorkflowLock. If the prompt lock were broken it
    // would throw first and the graph would silently go unchecked on the live path — so the prompt
    // half is asserted here in its own right rather than being allowed to shadow the case above.
    const failures: string[] = [];
    for (const row of effective) {
      try {
        assertStyleLock(row);
      } catch (e) {
        failures.push(`  ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (failures.length > 0) {
      expect.fail(
        `build-doc §8.4's prompt half has moved on ${String(failures.length)} locked row(s). Until this is\n` +
          '  resolved, graphForRow throws on the PROMPT before it ever reaches the workflow comparison:\n' +
          `${failures.join('\n')}`,
      );
    }
  });

  it('agrees with graphForRow, the path the runner actually takes', () => {
    // The one place this file assembles anything: `injectGraph(base, {prompt, negative, seed})`. If
    // that ever drifts from graphForRow's txt2img branch, this gate would be hashing a graph nobody
    // submits and its green would mean nothing. Compared against the shipped builder, per row.
    const base = requireBaseGraph();
    let compared = 0;
    const deferred: string[] = [];
    for (const row of effective) {
      let built;
      try {
        built = graphForRow(row, base);
      } catch (e) {
        // graphForRow runs the locks itself, so when a lock is already broken it throws before
        // returning a hash. That is reported by the cases above; repeating the same throw here as a
        // raw stack would make one defect read as three unrelated ones.
        if (e instanceof StyleLockError) {
          deferred.push(`  ${row.id}: ${e.message.split('.')[0] ?? e.message}`);
          continue;
        }
        throw e;
      }
      expect(built.hash, `${row.id}: this gate's injected graph differs from graphForRow's`).toBe(
        submittedHash(row, base),
      );
      expect(built.seed, `${row.id}: seedForSubmit disagrees with graphForRow`).toBe(seedForSubmit(row));
      compared++;
    }
    if (compared === 0) {
      expect.fail(
        deferred.length > 0
          ? 'graphForRow threw a style-lock refusal for EVERY subject, so this agreement pin could not\n' +
              '  run. Read the assertWorkflowLock / prompt-lock case above — that is the real finding; this\n' +
              `  one only reports that it is now unverified:\n${cap(deferred)}`
          : 'graphForRow was never exercised — the agreement check ran over nothing.',
      );
    }
  });

  it('accounts for every row it did not compare, so none is silently dropped', () => {
    const exempt = withHash.filter((r) => !effective.includes(r));
    for (const row of exempt) {
      // Not a skip: the shipped function is called and MUST decline, which is what makes the
      // exemption a documented behaviour (comfy-batch.ts:396-402 — an img2img row's graph carries the
      // §9.5 denoise, which the ladder is supposed to move) rather than a hole.
      expect(
        () => assertWorkflowLock(row, 'x'.repeat(16)),
        `${describeRow(row)} was excluded from the comparison but assertWorkflowLock does NOT decline it — ` +
          'the exclusion filter in this gate is out of step with the shipped early returns',
      ).not.toThrow();
    }
    expect(
      effective.length + exempt.length,
      'the compared set plus the exempt set does not account for every row carrying a workflowHash',
    ).toBe(withHash.length);
  });
});

describe('Lock 2 — the recorded workflowGraphSha256, finally read by something', () => {
  it('names a graph file that exists, in every manifest that names one', async () => {
    const missing: string[] = [];
    let checked = 0;
    for (const m of GRAPH_PATH_MANIFESTS) {
      const refs = graphRefs(await readJson(m), '', []);
      const top = refs.find((r) => r.where === '<top level>');
      if (top?.graph === undefined) {
        expect.fail(
          `${m} carries no top-level \`workflowGraph\`. Every manifest names the graph its rows were\n` +
            '  generated with; without it there is nothing to check a recorded hash against, and a run\n' +
            '  fails at submit time with a file-not-found instead of a message about the manifest.',
        );
      }
      for (const r of refs) {
        if (r.graph === undefined) continue;
        checked++;
        if (!(await onDisk(at(r.graph)))) missing.push(`  ${m} at ${r.where}: ${r.graph} is NOT on disk`);
      }
    }
    if (missing.length > 0) {
      expect.fail(
        `A manifest points at a workflow graph that does not exist:\n${cap(missing)}\n` +
          '  The path is recorded but nothing resolved it, so a rename would surface as a file-not-found\n' +
          '  at submit time rather than as a manifest that is wrong. Restore the file or correct the\n' +
          '  manifest that names it.',
      );
    }
    expect(checked, 'no workflowGraph path was resolved — the walk found nothing to check').toBeGreaterThanOrEqual(
      GRAPH_PATH_MANIFESTS.length,
    );
  });

  it('matches the bytes of the graph on disk, everywhere it is recorded', async () => {
    const mismatches: string[] = [];
    let compared = 0;

    for (const { manifest: m } of SHA_MANIFESTS) {
      const refs = graphRefs(await readJson(m), '', []);
      const top = refs.find((r) => r.where === '<top level>');
      if (top?.sha === undefined) {
        expect.fail(
          `${m} carries no top-level \`workflowGraphSha256\`. Its builder writes that field on every\n` +
            '  rebuild, so its absence means the manifest was hand-edited or written by something else —\n' +
            '  and a gate that shrugged at a missing hash would pass while asserting nothing.\n' +
            REMEDY,
        );
      }
      for (const r of refs) {
        if (r.sha === undefined) continue;
        if (r.graph === undefined) {
          mismatches.push(`  ${m} at ${r.where}: records a workflowGraphSha256 but names no workflowGraph`);
          continue;
        }
        if (!(await onDisk(at(r.graph)))) {
          mismatches.push(`  ${m} at ${r.where}: ${r.graph} is NOT on disk, so its recorded sha proves nothing`);
          continue;
        }
        compared++;
        const actual = await sha256OfFile(at(r.graph));
        if (actual !== r.sha) {
          mismatches.push(
            `  ${m} at ${r.where}: ${r.graph}\n` +
              `      recorded ${r.sha}\n` +
              `      on disk  ${actual}`,
          );
        }
      }
    }

    if (compared === 0) {
      expect.fail(
        `Not one recorded workflowGraphSha256 was compared across ${SHA_MANIFESTS.map((s) => s.manifest).join(', ')}.\n` +
          '  This gate exists because that field was written by three builders and read by nothing; a run\n' +
          '  that finds nothing to compare and reports success has restored exactly that state.\n' +
          REMEDY,
      );
    }
    if (mismatches.length > 0) {
      expect.fail(
        `${String(mismatches.length)} recorded graph hash(es) disagree with the graph on disk ` +
          `(${String(compared)} compared):\n${cap(mismatches)}\n` +
          REMEDY,
      );
    }
    expect(compared, 'fewer recorded hashes were compared than there are manifests carrying one').toBeGreaterThanOrEqual(
      SHA_MANIFESTS.length,
    );
  });

  it('still hashes the graph the way the builders do', async () => {
    for (const src of BUILDER_SOURCES) {
      const text = await readFile(at(src), 'utf8');
      expect(
        text.includes(BUILDER_SHA_EXPR),
        `${src} no longer hashes the graph with \`${BUILDER_SHA_EXPR}\`.\n` +
          '  This gate recomputes the sha with that expression because the builders\' helper is a private\n' +
          '  const inside a script that executes on import. If the builder changed how it hashes, the\n' +
          '  mismatch above would read as a moved graph and send someone hunting a defect that does not\n' +
          '  exist. Update BUILDER_SHA_EXPR and this gate\'s `sha256OfFile` together.',
      ).toBe(true);
    }
  });

  it('keeps the remediation message true: manifest.json records no graph sha of its own', async () => {
    // The message above tells the operator NOT to reach for `comfy-batch.ts rebuild`, because the
    // field it would have to write is not in manifest.json. If that ever stops being true, the
    // message becomes wrong — and a failure message with the wrong command in it reads as a bug in
    // the gate no matter how carefully the rest is worded.
    const refs = graphRefs(await readJson(MANIFEST), '', []);
    const recorded = refs.filter((r) => r.sha !== undefined).map((r) => r.where);
    expect(
      recorded,
      `${MANIFEST} now records a workflowGraphSha256 (at ${recorded.join(', ')}). Add it to SHA_MANIFESTS\n` +
        '  and name the tool that writes it in REMEDY, so the remediation stays true.',
    ).toEqual([]);
  });
});
