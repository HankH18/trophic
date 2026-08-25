/**
 * tools/comfy/build-manifest-b0.ts — rebuild `tools/comfy/manifest-b0.json` from the run records.
 *
 * WHY THIS IS GENERATED AND NOT HAND-EDITED. G5 says an approved asset is never regenerated with a
 * different seed unless its row is explicitly versioned, and §8.4 makes the manifest the thing that
 * enforces it. A manifest whose hashes were typed by hand cannot enforce anything — it records what
 * someone believed, and the B1 gate ("one asset per pixel class reproduced from the manifest
 * byte-identically") then compares a fresh render against a belief. Every hash below is computed
 * from the bytes on disk at write time, so a row that disagrees with its file is a detectable fact
 * rather than a silent drift.
 *
 * `tools/comfy/manifest.json` is owned by a concurrent workflow, so gate-B0 rows land here, in
 * manifest-b0.json, and the two are merged when Lane B integrates.
 *
 *   npx tsx tools/comfy/build-manifest-b0.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sha256 = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');

const GRAPH = 'tools/comfy/pixel-txt2img-api.json';
const APPROVED = 'assets/approved-trials/player-APPROVED.png';

interface Row { id: string; [k: string]: unknown }

const prev = JSON.parse(await readFile('tools/comfy/manifest-b0.json', 'utf8')) as { rows: Row[] };
const run1 = JSON.parse(await readFile('assets/raw/player/_views-run.json', 'utf8')) as { rows: Row[] };
const run2 = JSON.parse(await readFile('assets/raw/player/_views-run2.json', 'utf8')) as { rows: Row[] };

/** The sweep rows already in the manifest, minus the one promoted to the approved row below. */
const sweep = prev.rows.filter((r) => r.id.startsWith('b0-player-') && !r.id.startsWith('b0-player-back')
  && !r.id.startsWith('b0-player-side'));

const approvedSweepRow = sweep.find((r) => r.id === 'b0-player-peaked-compact');
if (!approvedSweepRow) throw new Error('the approved sweep row b0-player-peaked-compact is missing');

/**
 * The canonical player identity. `seed` here is the G5 lock: any future regeneration of the player
 * FRONT static reuses 42 with this exact prompt string, or versions this row.
 */
const approvedRow: Row = {
  id: 'player-front',
  class: 'overworld-character',
  subject: approvedSweepRow.subject,
  negative: approvedSweepRow.negative,
  view: 'front',
  viewClause: 'standing facing forward',
  seed: 42,
  targetSize: '32x48',
  status: 'approved',
  approvedBy: 'Hank (gate B0, SUPERVISED, build-doc §15)',
  file: APPROVED,
  sha256: await sha256(APPROVED),
  derivedFrom: {
    sweepRow: 'b0-player-peaked-compact',
    file: 'assets/raw/b0/b0-player-peaked-compact.png',
    sha256: await sha256('assets/raw/b0/b0-player-peaked-compact.png'),
    note: 'byte-identical to the approved file — the approval was a promotion, not a re-render',
  },
  workflowGraph: GRAPH,
  workflowGraphSha256: await sha256(GRAPH),
  generation: {
    model: 'Comfy-Org/z_image_turbo (+ CLIP lumina2, Comfy-Org VAE)',
    steps: 8, cfg: 1.0, sampler: 'res_multistep', scheduler: 'simple', resolution: '1024x1024',
    modelSamplingAuraFlowShift: 3,
    _note: 'shift:3 is in the graph but absent from build-doc §9.2 — logged as B-D2',
  },
  _lock: 'build-doc L6 + §8.4. This prompt string and seed 42 ARE the player identity. Vary ONLY the '
    + 'view/pose clause for other views (see the player-back / player-side rows). G5: never regenerate '
    + 'with a different seed unless this row is versioned.',
};

/** The extra statics. NOT approved — generated after B0 lifted the multi-version block (§15). */
async function viewRow(r: Row, selected: boolean, notes: string): Promise<Row> {
  const file = r.file as string | undefined;
  return {
    id: r.id,
    class: 'overworld-character',
    subject: r.subject,
    negative: r.negative,
    view: r.view,
    viewClause: r.viewClause,
    seed: r.seed,
    targetSize: '32x48',
    status: r.status,
    approval: selected ? 'SELECTED — pending Hank' : 'candidate — not selected',
    ...(file ? { file, sha256: await sha256(file) } : {}),
    workflowGraph: GRAPH,
    notes,
  };
}

const NOTES: Record<string, [boolean, string]> = {
  'b0-player-back-a': [false, 'nape below the cap renders near-black; the approved front has brown hair'],
  'b0-player-back-b': [false, 'same near-black nape as back-a; best proportion match of round 1 (aspect -5.3% vs front)'],
  'b0-player-back-c': [false, 'cap BRIM renders dark navy instead of green (L6 locks the cap green) + a stray yellow square on the brim'],
  'b0-player-back-d': [false, 'nape fixed to brown, but the cap crown reads oversized/floppy and the star is pushed to the left edge'],
  'b0-player-back-e': [true, 'SELECTED BACK. Peaked green cap from behind, brown nape hair, star on the crown, satchel strap over the shoulder AND the bag at the hip, no ground shadow. Shorts drift toward taupe (#765b4e, 6.6% of the 32x48 sprite) where the front reads warmer brown — the one open defect.'],
  'b0-player-back-f': [false, 'came out as a mid-stride three-quarter-rear WALK pose, not a static; walk frames are gate B5 (§9.6), out of scope here'],
  'b0-player-side-a': [false, 'not actually a side view — the face is near-frontal; worst de-duplicated max ΔE of round 1 (8.57)'],
  'b0-player-side-b': [true, 'SELECTED SIDE. The most colour-stable image in the set (mean ΔE 0.69 against the front identity colours, max 1.77) and the best proportion match (aspect -3.6%). Carries a grey ground shadow the front lacks (5,996px, 1.9% of content) — separable: chroma<6, L 78-94, bottom 12% of the bbox.'],
  'b0-player-side-c': [false, 'worst proportion drift of the set (aspect -19.6%) and the largest ground shadow (10,766px)'],
  'b0-player-side-d': [false, 'the "no cast shadow" clause did NOT remove the shadow and the shorts drifted to olive-green; strictly worse than side-b'],
};

const viewRows: Row[] = [];
for (const r of [...run1.rows, ...run2.rows]) {
  const [selected, notes] = NOTES[r.id] ?? [false, ''];
  viewRows.push(await viewRow(r, selected, notes));
}

const manifest = {
  gate: 'B0',
  gateStatus: 'PASSED — player sprite approved by Hank; data/palette.json frozen',
  workflowGraph: GRAPH,
  workflowGraphSha256: await sha256(GRAPH),
  _readme: 'Gate-B0 rows. tools/comfy/manifest.json is owned by a concurrent workflow; these merge into '
    + 'it at Lane B integration. Regenerate this file with `npx tsx tools/comfy/build-manifest-b0.ts` — '
    + 'every sha256 is computed from the bytes on disk, so a stale row is detectable.',
  _paletteFreeze: {
    file: 'data/palette.json',
    frozen: true,
    method: 'weighted k-means k=32, sRGB, equal per-image weighting, k-means++ seeded at 42 (core/rng.ts)',
    tool: 'npx tsx tools/palette/fit.mjs --pick=srgb/equal --reason="…"',
    sources: [APPROVED, 'assets/approved-trials/creature-fox.png', 'assets/approved-trials/creature-croc.png',
      'assets/approved-trials/trainer-battle.png', 'assets/approved-trials/town-map.png'],
    excluded: ['assets/approved-trials/superseded/**', 'assets/approved-trials/player-style-reference.png'],
    colorsSha256: createHash('sha256')
      .update(JSON.stringify(JSON.parse(await readFile('data/palette.json', 'utf8')).colors)).digest('hex'),
    evidence: 'assets/approved-trials/_palette-freeze/',
  },
  rows: [approvedRow, ...sweep, ...viewRows],
};

await writeFile('tools/comfy/manifest-b0.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`tools/comfy/manifest-b0.json — ${manifest.rows.length} rows`);
console.log(`  approved: ${approvedRow.id} seed ${approvedRow.seed} sha256 ${String(approvedRow.sha256).slice(0, 16)}…`);
console.log(`  selected: ${viewRows.filter((r) => String(r.approval).startsWith('SELECTED')).map((r) => r.id).join(', ')}`);
console.log(`  palette colors sha256: ${manifest._paletteFreeze.colorsSha256.slice(0, 16)}…`);
