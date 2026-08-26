/**
 * tools/palette/build-manifest-palette.ts — derive `tools/comfy/manifest-palette.json` from disk.
 *
 * Same discipline as `tools/comfy/build-manifest-b0.ts`: nothing here is hand-typed. Every row is
 * read back out of the run logs the generators wrote, and every sha256 is computed from the bytes
 * that are actually on disk — so a stale row is detectable rather than merely unlikely.
 *
 *   npx tsx tools/palette/build-manifest-palette.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');
const shaJson = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

interface RunRow { id: string; status: string; file?: string; sha256?: string; [k: string]: unknown }
interface Run { rows: RunRow[]; [k: string]: unknown }

const run1 = JSON.parse(await readFile('assets/raw/palette-trials/_run1.json', 'utf8')) as Run;
const run2 = JSON.parse(await readFile('assets/raw/palette-trials/_run2.json', 'utf8')) as Run;

const sources = JSON.parse(await readFile('tools/palette/candidate-sources.json', 'utf8')) as
  Array<{ id: string; file: string; set: string }>;
const inFit = new Map(sources.map((s) => [s.file, s.id]));

const rows: Record<string, unknown>[] = [];
for (const [round, run] of [[1, run1], [2, run2]] as const) {
  for (const r of run.rows) {
    const file = r.file as string | undefined;
    rows.push({
      ...r,
      round,
      sha256: file ? await sha(file) : null,
      inCandidateFit: file ? inFit.has(file) : false,
      candidateSourceId: file ? (inFit.get(file) ?? null) : null,
    });
  }
}

const frozen = JSON.parse(await readFile('data/palette.json', 'utf8'));
const candidate = JSON.parse(await readFile('data/palette.candidate.json', 'utf8'));
const classEq = JSON.parse(await readFile('assets/approved-trials/_palette-candidate/palette.candidate-classequal.json', 'utf8'));

const manifest = {
  purpose: 'Cool-region palette trials + the CANDIDATE re-freeze they support. '
    + 'The frozen palette was fitted over five warm/green trials that carry almost no cyan, blue or '
    + 'magenta; this file is the provenance for the trials asking whether it should be re-fitted.',
  status: 'CANDIDATE — nothing here is approved and nothing is promoted. data/palette.json is FROZEN and UNTOUCHED.',
  _readme: 'Regenerate with `npx tsx tools/palette/build-manifest-palette.ts`. Rows are read back from '
    + 'assets/raw/palette-trials/_run{1,2}.json; every sha256 is computed from the bytes on disk. '
    + 'tools/comfy/manifest.json is a concurrent workflow\'s file — these rows do NOT merge into it, '
    + 'because none of these images is a shipped asset.',
  _seedRule: 'Every row uses seed 42, the validated trial seed — the same seed every gate-B0 trial '
    + 'used. `manifestDerivedSeed` records what tools/comfy/manifest.json would use for the corresponding '
    + 'SHIPPED row, so the two are never confused. G5 is untouched: no approved asset is regenerated here, '
    + 'and no row here is approved.',
  _generationCount: {
    round1: run1.generations, round2: run2.generations,
    total: (run1.generations as number) + (run2.generations as number),
    g13: 'Under the 20-item threshold, so build-doc G13\'s credit estimate + --confirm gate does not apply.',
  },
  _subjectProvenance: 'Round-1 subjects are the `prompt` field of the named `tools/comfy/manifest.json` row, '
    + 'VERBATIM — that file is the G2-gated transcription of bible §4 (species) and §6 (towns), so the trial '
    + 'prompt is the exact string B3/B4 will submit for that asset. Round-2 subjects vary ONLY the anatomy '
    + 'clause and the view clause, for the reasons recorded per row.',
  palettes: {
    frozen: {
      file: 'data/palette.json', frozen: true, colorsSha256: shaJson(frozen.colors),
      sources: '5 approved trials (gate B0)',
    },
    candidate: {
      file: 'data/palette.candidate.json', frozen: false,
      colorsSha256: shaJson(candidate.colors),
      sources: 'tools/palette/candidate-sources.json — the 5 approved trials + 14 cool trials',
      method: 'srgb / equal per-image, k-means++ seeded 42 — the gate-B0 method with a broadened INPUT',
      tool: 'npx tsx tools/palette/fit.mjs --sources=tools/palette/candidate-sources.json --pick=srgb/equal --reason="…" --out=data/palette.candidate.json --outdir=assets/approved-trials/_palette-candidate',
    },
    classEqual: {
      file: 'assets/approved-trials/_palette-candidate/palette.candidate-classequal.json', frozen: false,
      colorsSha256: shaJson(classEq.colors),
      method: 'srgb / class-equal — same source set, each ASSET CLASS given an equal vote',
      why: 'Measured secondary option. Over 19 images "equal per image" no longer '
        + 'delivers the thing it was chosen for at B0 ("every asset class gets an equal vote"), because '
        + 'creature-battle now holds 12 images and overworld-character holds 1.',
      tool: 'npx tsx tools/palette/fit.mjs --sources=tools/palette/candidate-sources.json --with-class-equal --pick=srgb/class-equal --reason="…" --out=assets/approved-trials/_palette-candidate/palette.candidate-classequal.json --outdir=assets/approved-trials/_palette-candidate/classequal',
    },
  },
  evidence: {
    decisionSheet: 'assets/approved-trials/_palette-candidate/_DECISION-SHEET.png',
    numbers: 'assets/approved-trials/_palette-candidate/_compare.json',
    numbersClassEqual: 'assets/approved-trials/_palette-candidate/classequal/_compare.json',
    atGameSize: 'assets/approved-trials/_palette-candidate/at-game-size/_at-game-size-compare.json',
    bakeOff: 'assets/approved-trials/_palette-candidate/_fit-report.json',
    contactSheetOfTrials: 'assets/approved-trials/_palette-candidate/_new-trials-contact-sheet.png',
  },
  workflowGraph: 'tools/comfy/pixel-txt2img-api.json',
  workflowGraphSha256: await sha('tools/comfy/pixel-txt2img-api.json'),
  rows,
};

await writeFile('tools/comfy/manifest-palette.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote tools/comfy/manifest-palette.json — ${rows.length} rows, `
  + `${rows.filter((r) => r.status === 'raw').length} generated ok, `
  + `${rows.filter((r) => r.inCandidateFit).length} in the candidate fit`);
