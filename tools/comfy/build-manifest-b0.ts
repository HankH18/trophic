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
 * WHY IT IS A MERGE AND NOT A REGENERATION — READ BEFORE CHANGING ANYTHING BELOW
 * ─────────────────────────────────────────────────────────────────────────────
 * The first cut of this file rebuilt the manifest from scratch every run, and by the time the art
 * lane had been through a round of review that had become DESTRUCTIVE. Running it would have:
 *
 *   (a) REVERTED TWO OF HANK'S RECORDED DECISIONS. `b0-player-side-b` and `b0-player-back-e` are
 *       "REJECTED by Hank" in the committed file, each with five and three `rejectionReasons`, a
 *       `supersededBy` and a "never promote" `_note`. The `NOTES` table below still carries them as
 *       `[true, 'SELECTED …']` — the state they were in when the table was typed — so a rebuild put
 *       them back to "SELECTED — pending Hank" and DELETED the reasons. Silently. In a JSON diff
 *       nobody reads line by line, next to sixteen other row changes.
 *   (b) DROPPED 16 ROWS whose assets are on disk and whose hashes still verify: the 14 `pv-*`
 *       img2img sweep generations and the two `player-*-derived` rows. That sweep is the EVIDENCE
 *       for `_playerViews.img2imgVerdict` — deleting the rows leaves the verdict unsupported and,
 *       under G13, makes 14 spent generations unaccounted for.
 *   (c) DROPPED the `_playerViews` block entirely, because the rebuilt object simply did not have
 *       the key.
 *   (d) WRITTEN STALE PALETTE PROSE. `_paletteFreeze` was a hardcoded literal describing the 5-trial
 *       B0 freeze — "equal per-image weighting", `--pick=srgb/equal`, five sources — while
 *       `data/palette.json` had been re-frozen to the class-equal fit over 19 sources. Only
 *       `colorsSha256` was computed, so the file's own hash contradicted its own description.
 *
 * A generator cannot regenerate a human's judgement: it was never in the run records. So this file
 * now MERGES onto the committed manifest instead of replacing it, along three rules:
 *
 *   1. **A recorded verdict always beats a generated one.** `VERDICT_FIELDS` are copied forward from
 *      the committed row whenever that row carries a human verdict. `NOTES` cannot overwrite them.
 *   2. **A row is never dropped.** Anything in the committed file that this build does not
 *      regenerate is carried forward, with its sha256 re-checked against the bytes on disk.
 *   3. **Nothing is written until the guards pass.** `assertNothingDestroyed` re-derives the two
 *      properties above from the finished object and THROWS rather than write a file that lost a
 *      row, a top-level block, a verdict or a rejection reason. Refusing loudly beats destroying
 *      quietly; the guards exist so that a future edit to the row assembly cannot reintroduce the
 *      bug even if it forgets rules 1 and 2.
 *
 * `tools/comfy/manifest.json` is owned by a concurrent workflow, so gate-B0 rows land here, in
 * manifest-b0.json, and the two are merged when Lane B integrates.
 *
 *   npx tsx tools/comfy/build-manifest-b0.ts              # merge and write
 *   npx tsx tools/comfy/build-manifest-b0.ts --dry-run    # merge, run the guards, write nothing
 *   npx tsx tools/comfy/build-manifest-b0.ts --self-test  # prove the guards can fail, write nothing
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sha256 = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');
const onDisk = async (p: string) => access(p).then(() => true, () => false);

const MANIFEST = 'tools/comfy/manifest-b0.json';
const PALETTE = 'data/palette.json';
const PALETTE_SOURCES = 'tools/palette/candidate-sources.json';
const GRAPH = 'tools/comfy/pixel-txt2img-api.json';
const APPROVED = 'assets/approved-trials/player-APPROVED.png';

const DRY_RUN = process.argv.includes('--dry-run');
const SELF_TEST = process.argv.includes('--self-test');

interface Row { id: string; [k: string]: unknown }
interface Manifest { rows: Row[]; [k: string]: unknown }

/* ────────────────────────────────────────────────────────────────────────────
 * The safety layer. Pure functions over (committed, regenerated) so `--self-test`
 * can drive them with a synthetic manifest and prove they actually bind.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fields that can only have been written by a person looking at an image. None of them appears in
 * `assets/raw/player/_views-run*.json`, so this script has no way to re-derive one and no business
 * overwriting one. `notes` is deliberately NOT here: it is generated prose from `NOTES` below.
 */
const VERDICT_FIELDS = ['approval', 'approvedBy', 'rejectionReasons', 'supersededBy', '_note'] as const;

/**
 * A row carrying a recorded human verdict. Two independent signals, because either alone is
 * spoofable by a generated string: an explicit APPROVED/REJECTED word, or recorded reasons.
 */
function hasHumanVerdict(row: Row | undefined): boolean {
  if (row === undefined) return false;
  const reasons = row.rejectionReasons;
  if (Array.isArray(reasons) && reasons.length > 0) return true;
  return /^\s*(REJECTED|APPROVED)\b/i.test(String(row.approval ?? ''));
}

/**
 * Merge the regenerated rows onto the committed ones.
 *
 * Regenerated rows keep their regenerated shape — prompt, seed, hash, notes — EXCEPT for the verdict
 * fields, which are taken from the committed row whenever that row carries a verdict. Committed rows
 * this build does not regenerate are appended in their committed order, never dropped.
 */
function mergeRows(committed: Row[], regenerated: Row[]): {
  rows: Row[];
  verdictsPreserved: { id: string; approval: string; wouldHaveBecome: string }[];
  carriedForward: string[];
} {
  const byId = new Map(committed.map((r) => [r.id, r]));
  const verdictsPreserved: { id: string; approval: string; wouldHaveBecome: string }[] = [];

  const merged = regenerated.map((row) => {
    const before = byId.get(row.id);
    if (before === undefined || !hasHumanVerdict(before)) return row;
    const out: Row = { ...row };
    for (const field of VERDICT_FIELDS) {
      if (field in before) out[field] = before[field];
    }
    verdictsPreserved.push({
      id: row.id,
      approval: String(before.approval),
      wouldHaveBecome: String(row.approval),
    });
    return out;
  });

  const regeneratedIds = new Set(regenerated.map((r) => r.id));
  const carried = committed.filter((r) => !regeneratedIds.has(r.id));
  return { rows: [...merged, ...carried], verdictsPreserved, carriedForward: carried.map((r) => r.id) };
}

/**
 * The refusal. Re-derives from the FINISHED object what the merge was supposed to guarantee, so the
 * guard survives a future edit that rewrites `mergeRows` or the row assembly and forgets why.
 * Throws — the caller has not written anything yet.
 */
function assertNothingDestroyed(committed: Manifest, next: Manifest): void {
  const complaints: string[] = [];

  const nextRows = new Map(next.rows.map((r) => [r.id, r]));
  const lost = committed.rows.filter((r) => !nextRows.has(r.id)).map((r) => r.id);
  if (lost.length > 0) {
    complaints.push(`${String(lost.length)} row(s) would be DROPPED: ${lost.join(', ')}`);
  }

  for (const before of committed.rows) {
    if (!hasHumanVerdict(before)) continue;
    const after = nextRows.get(before.id);
    if (after === undefined) continue; // already reported as a dropped row
    for (const field of VERDICT_FIELDS) {
      if (!(field in before)) continue;
      const was = JSON.stringify(before[field]);
      const now = JSON.stringify(after[field]);
      if (was !== now) {
        complaints.push(`${before.id}.${field} would change a RECORDED DECISION:\n      was: ${was}\n      now: ${now}`);
      }
    }
  }

  for (const key of Object.keys(committed)) {
    if (!(key in next)) complaints.push(`the top-level block "${key}" would be DROPPED`);
  }

  if (complaints.length > 0) {
    throw new Error(
      `${MANIFEST} REFUSED — this rebuild would destroy recorded data.\n\n  - ${complaints.join('\n  - ')}\n\n`
      + 'A generated file may not overwrite a human decision. If a verdict really has changed, edit\n'
      + `${MANIFEST} directly (it is the record) and, if the change is permanent, update the NOTES\n`
      + 'table in this file to match. Removing a row is likewise a deliberate edit, not a side effect.',
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * `--self-test`: the guards, proved capable of failing.
 *
 * G14 — the safety layer is not "done" because it looks right. These four cases run the real
 * `mergeRows` / `assertNothingDestroyed` over a synthetic committed manifest carrying exactly the
 * shape that was at risk: a REJECTED row with reasons, plus an extra row this build does not
 * regenerate. Case 1 is the bug as it stood; cases 2-4 are the guard's own failure modes.
 * ──────────────────────────────────────────────────────────────────────────── */

function selfTest(): void {
  const committed: Manifest = {
    gate: 'B0',
    _playerViews: { question: 'a top-level block the rebuild does not produce' },
    rows: [
      { id: 'regenerated-plain', approval: 'candidate — not selected' },
      {
        id: 'rejected-by-hank',
        approval: 'REJECTED by Hank',
        rejectionReasons: ['the star is on the back of the cap'],
        supersededBy: 'something-else',
        _note: 'never promote',
      },
      { id: 'evidence-row', approval: 'NOT A CANDIDATE — sweep evidence only', file: 'on/disk.png' },
    ],
  };
  // What a from-scratch rebuild produces: the verdict reverted, the evidence row absent.
  const regenerated: Row[] = [
    { id: 'regenerated-plain', approval: 'candidate — not selected' },
    { id: 'rejected-by-hank', approval: 'SELECTED — pending Hank' },
  ];

  const checks: [string, () => void][] = [
    ['the reverted verdict and its reasons survive the merge', () => {
      const { rows, verdictsPreserved, carriedForward } = mergeRows(committed.rows, regenerated);
      const row = rows.find((r) => r.id === 'rejected-by-hank');
      expect(row?.approval === 'REJECTED by Hank', `approval was reverted to ${String(row?.approval)}`);
      expect(Array.isArray(row?.rejectionReasons), 'rejectionReasons were deleted');
      expect(row?.supersededBy === 'something-else', 'supersededBy was deleted');
      expect(row?._note === 'never promote', '_note was deleted');
      expect(verdictsPreserved.length === 1, 'the preserved verdict was not reported');
      expect(carriedForward.join() === 'evidence-row', 'the un-regenerated row was dropped');
      assertNothingDestroyed(committed, { ...committed, rows });
    }],
    ['a dropped row is REFUSED, not written', () => {
      expectThrows(() => assertNothingDestroyed(committed, { ...committed, rows: regenerated }),
        'DROPPED', 'dropping evidence-row was allowed through');
    }],
    ['a changed verdict is REFUSED even if the row survives', () => {
      const rows = committed.rows.map((r) =>
        r.id === 'rejected-by-hank' ? { ...r, approval: 'SELECTED — pending Hank' } : r);
      expectThrows(() => assertNothingDestroyed(committed, { ...committed, rows }),
        'RECORDED DECISION', 'a reverted approval was allowed through');
    }],
    ['a deleted rejection reason is REFUSED', () => {
      const rows = committed.rows.map((r) => {
        if (r.id !== 'rejected-by-hank') return r;
        const { rejectionReasons: _dropped, ...rest } = r;
        return rest as Row;
      });
      expectThrows(() => assertNothingDestroyed(committed, { ...committed, rows }),
        'rejectionReasons', 'deleting rejectionReasons was allowed through');
    }],
    ['a dropped top-level block is REFUSED', () => {
      const { _playerViews: _dropped, ...rest } = committed;
      expectThrows(() => assertNothingDestroyed(committed, rest as Manifest),
        '_playerViews', 'dropping _playerViews was allowed through');
    }],
  ];

  let failed = 0;
  for (const [name, run] of checks) {
    try {
      run();
      console.log(`  ok    ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL  ${name}\n        ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`${MANIFEST} guards: ${String(checks.length - failed)}/${String(checks.length)} passed`);
  if (failed > 0) process.exit(1);
}

function expect(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}

function expectThrows(fn: () => void, mustMention: string, message: string): void {
  try {
    fn();
  } catch (err) {
    expect(String(err instanceof Error ? err.message : err).includes(mustMention),
      `${message} (threw, but not about "${mustMention}")`);
    return;
  }
  throw new Error(message);
}

if (SELF_TEST) {
  selfTest();
  process.exit(0);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The build.
 * ──────────────────────────────────────────────────────────────────────────── */

const prev = JSON.parse(await readFile(MANIFEST, 'utf8')) as Manifest;
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
    _note: 'shift:3 is in the graph but absent from build-doc §9.2; it materially affects the output, so §9.2\'s parameter list is incomplete rather than wrong',
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
    // Only ever the DEFAULT. `mergeRows` overwrites it from the committed row wherever a person has
    // ruled — b0-player-back-e and b0-player-side-b are both "REJECTED by Hank" in the file below
    // while this table still says SELECTED, which is precisely the revert the merge exists to stop.
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

const { rows: mergedRows, verdictsPreserved, carriedForward } = mergeRows(prev.rows, [approvedRow, ...sweep, ...viewRows]);

/**
 * A carried-forward row was not regenerated, so nothing recomputed its hash — and the file's own
 * promise is that every sha256 is the bytes on disk at write time. Re-check them here so a carried
 * row is held to the same standard as a rebuilt one. A missing file does NOT delete the row (that
 * is the destructive reflex this whole file exists to stop); it is reported and the row is kept
 * with the hash it was recorded with, which is what makes the discrepancy findable.
 */
const carriedIds = new Set(carriedForward);
const assetWarnings: string[] = [];
for (const row of mergedRows) {
  if (!carriedIds.has(row.id)) continue;
  const file = row.file as string | undefined;
  if (file === undefined) continue;
  if (!(await onDisk(file))) {
    assetWarnings.push(`${row.id}: ${file} is NOT on disk — row kept with its recorded sha256`);
    continue;
  }
  const actual = await sha256(file);
  if (row.sha256 !== undefined && row.sha256 !== actual) {
    if (hasHumanVerdict(row)) {
      throw new Error(
        `${MANIFEST} REFUSED — ${row.id} carries a recorded verdict ("${String(row.approval)}") but the\n`
        + `bytes of ${file} have CHANGED since it was recorded (G5: an approved/rejected asset is not\n`
        + 're-rendered without versioning its row). Version the row deliberately, or restore the file.',
      );
    }
    assetWarnings.push(`${row.id}: ${file} changed on disk — sha256 updated from the bytes`);
  }
  row.sha256 = actual;
}

/**
 * `_paletteFreeze` is READ FROM THE LIVE FREEZE, never typed here.
 *
 * WAS: a hardcoded literal describing the 5-trial B0 freeze — "equal per-image weighting",
 * `--pick=srgb/equal`, five sources — left behind when `data/palette.json` was re-frozen at T-15 to
 * the class-equal fit over 19 sources. The block sat next to a `colorsSha256` that WAS computed, so
 * the manifest described one palette and hashed another and nothing noticed. Prose that restates a
 * fact recorded elsewhere goes stale the moment that fact moves; derive it instead.
 */
const paletteRaw = await readFile(PALETTE, 'utf8');
const palette = JSON.parse(paletteRaw) as {
  frozen: boolean; frozenAt?: string; source?: string; _comment?: string; colors: unknown;
  _method: { algorithm: string; fitSpace: string; weighting: string; excluded?: string[] };
};
if (palette.frozen !== true) {
  throw new Error(`${MANIFEST} REFUSED — ${PALETTE} is not frozen, so this manifest cannot claim it is.`);
}
const paletteSources = JSON.parse(await readFile(PALETTE_SOURCES, 'utf8')) as { file: string }[];

/**
 * The fit command is LIFTED from `data/palette.json`'s own `_comment`, not reassembled from
 * `_method`. Reassembling it looked tempting and was wrong three ways: `_method.fitSpace` is human
 * prose ("sRGB", "CIELAB (D65)") while `fit.mjs` matches `--pick=` against the raw token (`srgb`,
 * `lab`) and throws "matches no candidate"; `class-equal` only exists as a candidate under
 * `--with-class-equal`; and `--sources` requires `--out`. A derived command that does not run is
 * the same defect as a stale literal, so this takes the invocation that WAS run, verbatim.
 */
const recordedCommand = /`(npx [^`]+fit\.mjs[^`]*)`/.exec(palette._comment ?? '')?.[1];
const paletteFreeze = {
  file: PALETTE,
  frozen: palette.frozen,
  frozenAt: palette.frozenAt,
  provenance: palette.source,
  method: `${palette._method.algorithm}; fit space ${palette._method.fitSpace}; ${palette._method.weighting} weighting`,
  tool: recordedCommand ?? `(no fit command recorded in ${PALETTE}._comment — see ${PALETTE} _method)`,
  sources: paletteSources.map((s) => s.file),
  excluded: palette._method.excluded ?? [],
  colorsSha256: createHash('sha256').update(JSON.stringify(palette.colors)).digest('hex'),
  evidence: 'assets/approved-trials/_palette-freeze/',
  _derived: `Every field above except "evidence" is read from ${PALETTE} and ${PALETTE_SOURCES} at `
    + 'write time. Do not hand-edit it: a re-freeze must move it, and a literal here would not.',
};

const manifest: Manifest = {
  // Spread the committed file FIRST so a top-level block this script does not know about —
  // `_playerViews` today, whatever the art lane adds tomorrow — survives the rebuild instead of
  // vanishing because the new object literal happened not to mention it.
  ...prev,
  gate: 'B0',
  gateStatus: 'PASSED — player sprite approved by Hank; data/palette.json frozen',
  workflowGraph: GRAPH,
  workflowGraphSha256: await sha256(GRAPH),
  _readme: 'Gate-B0 rows. tools/comfy/manifest.json is owned by a concurrent workflow; these merge into '
    + 'it at Lane B integration. Regenerate this file with `npx tsx tools/comfy/build-manifest-b0.ts` — '
    + 'every sha256 is computed from the bytes on disk, so a stale row is detectable. The rebuild MERGES: '
    + 'recorded verdicts and rejectionReasons are carried forward from this file and cannot be reverted '
    + 'by the generator, and no row is ever dropped. This file is the record of the decisions, so a '
    + 'verdict that has genuinely changed is edited HERE.',
  _paletteFreeze: paletteFreeze,
  rows: mergedRows,
};

// The refusal, on the finished object, before a single byte is written.
assertNothingDestroyed(prev, manifest);

if (!DRY_RUN) await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${MANIFEST} — ${String(manifest.rows.length)} rows${DRY_RUN ? ' (--dry-run: nothing written)' : ''}`);
console.log(`  approved: ${approvedRow.id} seed ${String(approvedRow.seed)} sha256 ${String(approvedRow.sha256).slice(0, 16)}…`);
console.log(`  selected: ${manifest.rows.filter((r) => String(r.approval).startsWith('SELECTED')).map((r) => r.id).join(', ') || '(none)'}`);
for (const v of verdictsPreserved) {
  console.log(`  PRESERVED verdict: ${v.id} — "${v.approval}" (a rebuild would have written "${v.wouldHaveBecome}")`);
}
console.log(`  carried forward, not regenerated: ${String(carriedForward.length)} row(s)`);
for (const w of assetWarnings) console.log(`  WARNING ${w}`);
if (recordedCommand === undefined) {
  console.log(`  WARNING ${PALETTE}._comment no longer records a backticked \`npx … fit.mjs …\` command, `
    + 'so _paletteFreeze.tool is a placeholder. Restore the invocation there rather than typing one here.');
}
console.log(`  palette: ${String(paletteFreeze.method)}`);
console.log(`  palette colors sha256: ${paletteFreeze.colorsSha256.slice(0, 16)}…`);
