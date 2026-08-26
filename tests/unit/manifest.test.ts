/**
 * tests/unit/manifest.test.ts — build-doc §10.4's "manifest seed-reuse enforcement", plus the
 * anti-drift gate that makes the §9.7 manifest a derivation of data/ rather than a parallel copy.
 *
 * THE NAMED TEST is the seed one, and it is written to prove a REFUSAL, not a preference: G5 and
 * §8.4 say "any asset regenerated must reuse its manifest seed unless the manifest entry is
 * versioned", so the tests below submit a different seed and require an exception. A gate that only
 * logs a warning is decoration.
 *
 * THE OTHER HALF is G2. `rows[]` is derived from data/species.json, data/gyms.json,
 * data/nodes/*.json and core/types.ts's PROP_KINDS; the committed manifest must equal a fresh
 * derivation, and the comparison is shown to be SENSITIVE (a nudged input changes the derivation)
 * so "they match" is evidence and not a tautology. That is what stops a creature, a gym leader or a
 * node from existing in the art pipeline without existing in the content data — and what makes the
 * reverse true too.
 *
 * One thing this file deliberately does NOT do: touch the network. Every assertion is against local
 * data. Comfy Cloud bills for failed jobs (DEVIATIONS-lane-b B-D8), and a test suite that can spend
 * credits will eventually spend them in CI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE PASSED WHILE BELIEVING (B1 repair wave 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * It was green on 91 tests with five reproduced defects live in the runner, and in three places it
 * had written the defect down as the expectation:
 *
 *   · the G5 tests all exercised `rebuild`. Nothing tested the `run` path's own derivation, and
 *     `main()` never re-derives — so §8.4's versioned reseed was a NO-OP there, submitting the old
 *     seed and wedging the manifest (B-D42).
 *   · "a row whose derivation has MOVED is refused on the live path" asserted `status === 'failed'`
 *     — which is the defect: a G5 refusal downgraded the approved row it was defending, and
 *     `selectRows` (pending|failed) then handed it to the next unattended run (B-D43).
 *   · "a REGENERATION reuses the frozen seed" regenerated an `approved` row with `confirmed: false`
 *     and asserted it went through — the exact command that erases the gate-B0 record (B-D44).
 *   · "no mask" was asserted to leave the row `failed` AFTER a billed generation (B-D43).
 *   · nothing anywhere read `workflowHash`, so prompt drift on an approved row was invisible (B-D45),
 *     and nothing asserted what the G13 estimate would actually bill (B-D46).
 *
 * Each of those assertions is now the corrected one, with the reason it changed written beside it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import {
  BASE_GRAPH_PATH,
  CREDIT_GATE_ROWS,
  CreditGateError,
  MANIFEST_PATH,
  REPO_ROOT,
  SeedReuseError,
  SupervisedGateError,
  artFormsOf,
  assertBatchApproved,
  assertSeedReuse,
  assertSupervised,
  deriveRows,
  deriveSeed,
  encounterableLines,
  graphForRow,
  overlayDiffGate,
  ManifestError,
  StyleLockError,
  TRANSPORT_ATTEMPTS,
  assertFiltersMatch,
  assertRowsDerived,
  assertStyleLock,
  planBatch,
  promptIdentity,
  rebuildRows,
  runBatch,
  seedForSubmit,
  selectRows,
  specOf,
  versionOf,
  workflowHash,
  type ManifestFile,
  type ManifestRow,
} from '../../tools/comfy/comfy-batch.ts';
import {
  buildImg2ImgGraph,
  Img2ImgError,
  SupervisedGateError as SmokeGateError,
  runSmoke,
} from '../../tools/comfy/img2img.ts';
import { positiveInt, type Graph } from '../../tools/comfy/client.ts';
import { blankRaster, idx, writeRaster, type Raster } from '../../tools/postprocess/raster.ts';
import { cellsToRaster, walkableCells } from '../../tools/overlay-diff/mask.ts';
import { collisionGrid } from '../../tools/overlay-diff/config.ts';
import { validateContent } from '../../core/schemas';
import { PROP_KINDS } from '../../core/types';
import { hashSeed } from '../../core/rng';

/* ────────────────────────────────────────────────────────────────────────────
 * A painted-town fixture at the PRODUCTION map size, for the end-to-end layout-gate test.
 * Hard-edged and high-contrast so the verdict is about the gate, not about a fixture that
 * happened to land near a threshold. No Math.random (G11): every value is closed-form.
 * ──────────────────────────────────────────────────────────────────────────── */

function fill(r: Raster, x0: number, y0: number, w: number, h: number, v: number): void {
  for (let y = y0; y < y0 + h; y++) {
    if (y < 0 || y >= r.height) continue;
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || x >= r.width) continue;
      const i = idx(r, x, y);
      r.data[i] = v;
      r.data[i + 1] = v;
      r.data[i + 2] = v;
      r.data[i + 3] = 255;
    }
  }
}

/** Open ground, two crossing paths, four buildings. `shift` moves ONE building and nothing else. */
function townFixture(size: number, shift: number): Raster {
  const r = blankRaster(size, size);
  const u = size / 16;
  fill(r, 0, 0, size, size, 120);
  fill(r, Math.round(7 * u), 0, Math.round(2 * u), size, 225);
  fill(r, 0, Math.round(7 * u), size, Math.round(2 * u), 225);
  fill(r, Math.round(2 * u) + shift, Math.round(2 * u) + shift, Math.round(3 * u), Math.round(2.5 * u), 25);
  fill(r, Math.round(11 * u), Math.round(2 * u), Math.round(3 * u), Math.round(2.5 * u), 25);
  fill(r, Math.round(2 * u), Math.round(11 * u), Math.round(3 * u), Math.round(3 * u), 25);
  fill(r, Math.round(11 * u), Math.round(11 * u), Math.round(3 * u), Math.round(3 * u), 60);
  return r;
}

/** The mask for that layout: the buildings and the pond are blocked, everything else walkable. */
function townMask(size: number): Raster {
  const r = blankRaster(size, size);
  const u = size / 16;
  fill(r, 0, 0, size, size, 255);
  fill(r, Math.round(2 * u), Math.round(2 * u), Math.round(3 * u), Math.round(2.5 * u), 0);
  fill(r, Math.round(11 * u), Math.round(2 * u), Math.round(3 * u), Math.round(2.5 * u), 0);
  fill(r, Math.round(2 * u), Math.round(11 * u), Math.round(3 * u), Math.round(3 * u), 0);
  fill(r, Math.round(11 * u), Math.round(11 * u), Math.round(3 * u), Math.round(3 * u), 0);
  return r;
}

/** A repaint: the layout is untouched, the tone is not. */
function dimmed(src: Raster, factor: number): Raster {
  const out = blankRaster(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    out.data[i] = Math.round(src.data[i]! * factor);
    out.data[i + 1] = Math.round(src.data[i + 1]! * factor);
    out.data[i + 2] = Math.round(src.data[i + 2]! * factor);
    out.data[i + 3] = 255;
  }
  return out;
}

const content = validateContent();
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ManifestFile;
const baseGraph = JSON.parse(readFileSync(BASE_GRAPH_PATH, 'utf8')) as Graph;
const rows = manifest.rows;
const byId = new Map(rows.map((r) => [r.id, r]));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const rowsOfClass = (c: string) => rows.filter((r) => r.class === c);

/* ════════════════════════════════════════════════════════════════════════════
 * manifest seed reuse — the named test (§10.4, G5, §8.4)
 * ════════════════════════════════════════════════════════════════════════════ */

describe('manifest seed-reuse enforcement (G5 / build-doc §8.4)', () => {
  it('a seed is a pure function of (id, version) — re-deriving cannot move it', () => {
    expect(deriveSeed('battle-fenmaw-e-front', 1)).toBe(deriveSeed('battle-fenmaw-e-front', 1));
    expect(deriveSeed('battle-fenmaw-e-front', 1)).toBe(hashSeed(1, 'battle-fenmaw-e-front'));
    expect(deriveSeed('battle-fenmaw-e-front', 1)).not.toBe(deriveSeed('battle-fenmaw-e-back', 1));
  });

  it('BLOCKS a reseed of an asset that has already been generated', () => {
    const row: ManifestRow = { ...byId.get('battle-fenmaw-e-front')!, status: 'raw', recordedSeed: 4069427169 };
    expect(() => assertSeedReuse(row, 999)).toThrow(SeedReuseError);
    expect(() => assertSeedReuse(row, 999)).toThrow(/reuse its manifest seed/);
    // …and permits the seed it was actually generated with.
    expect(() => assertSeedReuse(row, 4069427169)).not.toThrow();
  });

  /*
   * WHY THIS TEST CHANGED (justify-test-edit, recorded at the assertion per that skill).
   *
   * It used to read:
   *     const row = { ...row, status: 'raw', recordedSeed: 12345, seed: 999 };
   *     expect(seedForSubmit(row)).toBe(12345);
   * — i.e. it REQUIRED a silent override when a frozen seed and the row's own derived seed disagree
   * at the same version. That is the exact state G5 exists to detect (a recorded asset whose
   * derivation has moved: an id rename, an "improved" derivation), and the assertion made proceeding
   * through it the contract. It is also what made `assertSeedReuse` structurally incapable of
   * throwing on the submit path — `seedForSubmit` handed it the value it had just chosen, so the
   * guard could only ever compare a value with itself, while the module header claimed "this is a
   * thrown error on the submit path".
   *
   * build-doc §8.4: "Any asset regenerated must reuse its manifest seed unless the manifest entry is
   * versioned." G5: "…(or versioning the row)". That is three branches, and all three are asserted
   * below. Nothing here is weaker than what it replaced: the reuse claim the old test made is the
   * first of them.
   */
  it('the submit path REUSES a recorded seed that still agrees with the derivation', () => {
    const base = byId.get('battle-fenmaw-e-front')!;
    const row: ManifestRow = { ...base, status: 'raw', recordedSeed: base.seed, recordedVersion: base.version };
    expect(seedForSubmit(row)).toBe(base.seed);
  });

  it('…and REFUSES when the derivation has moved under a frozen seed — the refusal is live, not decorative', () => {
    const row: ManifestRow = {
      ...byId.get('battle-fenmaw-e-front')!,
      status: 'raw',
      recordedSeed: 12345,
      recordedVersion: 1,
      seed: 999,
      version: 1,
    };
    expect(() => seedForSubmit(row)).toThrow(SeedReuseError);
    expect(() => seedForSubmit(row)).toThrow(/reuse its manifest seed/);
    // …and the same row goes through graphForRow, which is what the runner actually calls.
    expect(() => graphForRow(row, baseGraph)).toThrow(SeedReuseError);
  });

  it('…and uses the NEW derived seed once the row has been versioned (§8.4\'s licensed escape)', () => {
    const row: ManifestRow = {
      ...byId.get('battle-fenmaw-e-front')!,
      status: 'raw',
      recordedSeed: deriveSeed('battle-fenmaw-e-front', 1),
      recordedVersion: 1,
      version: 2,
      seed: deriveSeed('battle-fenmaw-e-front', 2),
    };
    expect(seedForSubmit(row)).toBe(deriveSeed('battle-fenmaw-e-front', 2));
    expect(seedForSubmit(row)).not.toBe(row.recordedSeed);
    expect(graphForRow(row, baseGraph).seed).toBe(deriveSeed('battle-fenmaw-e-front', 2));
  });

  it('a row recorded before recordedVersion existed is treated as version 1, not as exempt', () => {
    // The live manifest's one generated row (player-front) has no recordedVersion. Defaulting it to
    // "unknown, so skip the check" would be a free pass for every legacy row.
    const legacy: ManifestRow = { ...byId.get('battle-fenmaw-e-front')!, status: 'raw', recordedSeed: 12345, seed: 999 };
    expect(legacy.recordedVersion).toBeUndefined();
    expect(() => seedForSubmit(legacy)).toThrow(SeedReuseError);
  });

  it('a pending row has nothing to reuse yet, so its derived seed is used', () => {
    const row = byId.get('battle-fenmaw-e-front')!;
    expect(row.recordedSeed).toBeUndefined();
    expect(seedForSubmit(row)).toBe(row.seed);
  });

  it('a REBUILD that would move a recorded seed throws instead of writing it', () => {
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    target.status = 'approved';
    target.recordedSeed = target.seed;
    // The usual culprit: something upstream changes the derivation for this row.
    m._concepts['Fenmaw'] = { text: 'a different animal entirely', source: 'sabotage' };
    // (the concept does not feed the seed, so force the collision the way a rename would)
    target.recordedSeed = target.seed + 1;
    expect(() => rebuildRows(m, content)).toThrow(SeedReuseError);
    expect(() => rebuildRows(m, content)).toThrow(/still at version 1/);
  });

  it('BLOCKS the quiet version too — a renamed row would drop a recorded seed on the floor', () => {
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    target.status = 'approved';
    target.recordedSeed = target.seed;
    target.id = 'battle-fenmaw-elder-front'; // the rename a tidy-up would make
    expect(() => rebuildRows(m, content)).toThrow(SeedReuseError);
    expect(() => rebuildRows(m, content)).toThrow(/unreproducible/);
  });

  it('…and a renamed row that has generated NOTHING is free to be renamed', () => {
    const m = clone(manifest);
    m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!.id = 'battle-fenmaw-elder-front';
    expect(() => rebuildRows(m, content)).not.toThrow();
  });

  /*
   * WHY THIS TEST CHANGED (justify-test-edit).
   *
   * It was titled "bumping the row version IS the licensed escape, and it produces a different seed"
   * and then asserted the opposite:
   *     expect(after.seed).toBe(deriveSeed(id, 1));
   *     expect(after.seed).not.toBe(deriveSeed(id, 2));
   * — that after bumping to version 2 the seed stays at the version-1 value. It also called
   * `rebuildRows` on a row with a drifted recordedSeed WITHOUT expecting a throw, which encoded the
   * `old.version === spec.version` bypass as intended behaviour. Both assertions contradict
   * build-doc §8.4 ("unless the manifest entry is versioned") and G5 ("or versioning the row"), and
   * together they are why the inoperative escape survived a green suite.
   *
   * The escape now works, so the test asserts that it works — and asserts what a reseed means for the
   * record, which nothing asserted before.
   */
  it('bumping the row version IS the licensed escape: the bump persists and the seed actually moves', () => {
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    target.status = 'approved';
    target.recordedSeed = target.seed;
    target.recordedVersion = 1;
    target.file = 'assets/raw/creature-battle/battle-fenmaw-e-front.png';
    target.version = 2;

    const notes: string[] = [];
    const rebuilt = rebuildRows(m, content, notes);
    const after = rebuilt.find((r) => r.id === 'battle-fenmaw-e-front')!;

    expect(after.version).toBe(2);
    expect(after.seed).toBe(deriveSeed('battle-fenmaw-e-front', 2));
    expect(after.seed).not.toBe(deriveSeed('battle-fenmaw-e-front', 1));
    // The bump is persisted where a rebuild can see it, so it does not evaporate next time.
    expect(m._versions?.['battle-fenmaw-e-front']).toBe(2);
    // A reseed supersedes the art the old seed made: the row stops claiming a file it no longer asks for.
    expect(after.status).toBe('pending');
    expect(after.recordedSeed).toBeUndefined();
    expect(after.file).toBeUndefined();
    expect(notes.join('\n')).toMatch(/version 1 -> 2/);

    // …and a SECOND rebuild is a no-op, not a repeat reseed.
    const again = rebuildRows(m, content).find((r) => r.id === 'battle-fenmaw-e-front')!;
    expect(again.version).toBe(2);
    expect(again.seed).toBe(after.seed);
  });

  it('versioning a row whose seed is PINNED refuses instead of pretending to reseed it', () => {
    // Reproduced through the real CLI before this guard: bumping `player-front` to version 2 and
    // running `rebuild` returned version=2 with seed STILL 42, because `finish()` prefers `seedPin`
    // over the derived seed. The bump appeared to take effect and the seed never moved — the exact
    // shape of failure the versioned escape is meant to prevent.
    const m = clone(manifest);
    m._versions = { ...(m._versions ?? {}), 'player-front': 2 };
    expect(() => deriveRows(m, content)).toThrow(/PINNED seed/);
    expect(() => deriveRows(m, content)).toThrow(/cannot reseed/);
  });

  it('and the escape DOES move the seed for a derived row — measured, not assumed', () => {
    const m = clone(manifest);
    m._versions = { 'battle-fenmaw-e-front': 3 };
    const row = deriveRows(m, content).find((r) => r.id === 'battle-fenmaw-e-front')!;
    expect(row.version).toBe(3);
    expect(row.seed).toBe(deriveSeed('battle-fenmaw-e-front', 3));
    expect(row.seed).not.toBe(deriveSeed('battle-fenmaw-e-front', 1));
    // …and nothing else in the manifest moved with it.
    const others = deriveRows(m, content).filter((r) => r.id !== 'battle-fenmaw-e-front');
    expect(others).toEqual(rows.filter((r) => r.id !== 'battle-fenmaw-e-front').map(specOf));
  });

  it('a nonsense version is a refusal, not a silent 1', () => {
    const m = clone(manifest);
    m._versions = { 'battle-fenmaw-e-front': 0 };
    expect(() => deriveRows(m, content)).toThrow(/integer/);
    expect(() => versionOf({ ...m, _versions: { x: 2.5 } } as ManifestFile, 'x')).toThrow(/integer/);
    expect(versionOf(manifest, 'battle-fenmaw-e-front')).toBe(1);
  });

  it('a version bump does NOT disarm the drift check for the version it lands on', () => {
    // The old check read `old.version === spec.version`, so any row stored at version != 1 skipped it
    // entirely — and the derivation then reset the version to 1, writing a row whose recordedSeed no
    // longer matched its own seed. Verifier probe: "version bumped to 2, recordedSeed drifts: NO
    // THROW -> version=1 seed=4013440965 recordedSeed=4013440966".
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    target.status = 'approved';
    target.version = 2;
    target.recordedVersion = 2;
    target.recordedSeed = deriveSeed('battle-fenmaw-e-front', 2) + 1; // drift AT version 2
    expect(() => rebuildRows(m, content)).toThrow(SeedReuseError);
    expect(() => rebuildRows(m, content)).toThrow(/still at version 2/);
  });

  it('a rebuild preserves everything a run recorded', () => {
    const m = clone(manifest);
    const target = m.rows.find((r) => r.id === 'trainer-odo')!;
    Object.assign(target, {
      status: 'approved',
      recordedSeed: target.seed,
      recordedPromptHash: promptIdentity(target),
      workflowHash: 'deadbeefdeadbeef',
      timestamp: '2026-08-25T00:00:00.000Z',
      file: 'assets/raw/trainer-battle/trainer-odo.png',
      attempts: 2,
    });
    const after = rebuildRows(m, content).find((r) => r.id === 'trainer-odo')!;
    expect(after).toMatchObject({
      status: 'approved',
      recordedPromptHash: promptIdentity(target),
      workflowHash: 'deadbeefdeadbeef',
      timestamp: '2026-08-25T00:00:00.000Z',
      attempts: 2,
    });
  });

  it('the player rows pin the validated trial seed 42 (DEVIATIONS-lane-b B-D1)', () => {
    for (const r of rowsOfClass('player')) expect(r.seed).toBe(42);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * G13 — the credit gate refuses, it does not warn
 * ════════════════════════════════════════════════════════════════════════════ */

describe('credit gate (G13 / build-doc §9.1)', () => {
  it(`refuses a batch of ${CREDIT_GATE_ROWS}+ rows without --confirm`, () => {
    const plan = planBatch(rows.slice(0, CREDIT_GATE_ROWS), manifest);
    expect(plan.requiresConfirm).toBe(true);
    expect(() => assertBatchApproved(plan, false)).toThrow(CreditGateError);
    expect(() => assertBatchApproved(plan, true)).not.toThrow();
  });

  it('lets a smaller batch through — the gate is on scale, not on generation', () => {
    const plan = planBatch(rows.slice(0, CREDIT_GATE_ROWS - 1), manifest);
    expect(plan.requiresConfirm).toBe(false);
    expect(() => assertBatchApproved(plan, false)).not.toThrow();
  });

  it('says UNKNOWN rather than inventing a number while the per-image cost is unmeasured', () => {
    expect(manifest._credits.perImageCredits).toBeNull();
    const plan = planBatch(rows.slice(0, 30), manifest);
    expect(plan.projectedCredits).toBeNull();
    expect(plan.lines.join('\n')).toMatch(/UNKNOWN/);
    expect(plan.lines.join('\n')).toMatch(/never been measured/);
  });

  it('projects a real figure once someone measures one', () => {
    const m = clone(manifest);
    m._credits.perImageCredits = 1.5;
    m._credits.measuredFrom = 'dashboard 4197 -> 4183 over 9 images';
    const plan = planBatch(rows.slice(0, 30), m);
    expect(plan.projectedCredits).toBe(45);
    expect(plan.lines.join('\n')).toMatch(/~45/);
  });

  it('the whole manifest is far over the gate — nobody runs it by accident', () => {
    expect(planBatch(rows, manifest).requiresConfirm).toBe(true);
    expect(rows.length).toBeGreaterThan(CREDIT_GATE_ROWS);
  });

  it('selectRows skips finished work unless --force, so a resume is not a re-bill', () => {
    const m = clone(manifest);
    m.rows[0]!.status = 'approved';
    expect(selectRows(m, { force: false }).some((r) => r.id === m.rows[0]!.id)).toBe(false);
    expect(selectRows(m, { force: true }).some((r) => r.id === m.rows[0]!.id)).toBe(true);
    expect(selectRows(m, { force: false }).some((r) => r.status === 'failed' || r.status === 'pending')).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * G2 — rows[] is DERIVED from data/, and the check is sensitive
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the manifest cannot drift from data/ (G2)', () => {
  it('the committed rows equal a fresh derivation', () => {
    const derived = deriveRows(manifest, content);
    expect(rows.map(specOf)).toEqual(derived);
  });

  it('BINDS — the comparison notices when the derivation inputs move', () => {
    const m = clone(manifest);
    m._concepts['Fenmaw'] = { text: 'a completely different animal', source: 'sabotage' };
    const derived = deriveRows(m, content);
    expect(rows.map(specOf)).not.toEqual(derived);
  });

  it('BINDS — a species removed from data/ removes its rows', () => {
    const trimmed = { ...content, species: content.species.filter((s) => s.id !== 'fenmaw-line') };
    const derived = deriveRows(manifest, trimmed);
    expect(derived.some((r) => r.origin.includes('fenmaw-line'))).toBe(false);
    expect(derived.length).toBeLessThan(rows.length);
  });

  it('a dex identity with no concept entry is a loud failure, not a blank prompt', () => {
    const m = clone(manifest);
    delete m._concepts['Fenmaw'];
    expect(() => deriveRows(m, content)).toThrow(/no concept for dex identity "Fenmaw"/);
  });

  it('a node with no _nodes entry is a loud failure', () => {
    const m = clone(manifest);
    delete m._nodes['r4'];
    expect(() => deriveRows(m, content)).toThrow(/manifest\._nodes has no entry for node "r4"/);
  });

  it('a gym leader with no _trainers entry is a loud failure', () => {
    const m = clone(manifest);
    delete m._trainers['sable'];
    expect(() => deriveRows(m, content)).toThrow(/no entry for gym leader "sable"/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §9.7 counts and shape
 * ════════════════════════════════════════════════════════════════════════════ */

describe('build-doc §9.7 asset counts', () => {
  it('150 creature battle sprites — 75 forms × front/back (DEVIATIONS D2, not §9.7\'s 154)', () => {
    const forms = content.species.reduce((n, s) => n + artFormsOf(s).length, 0);
    expect(forms).toBe(75);
    expect(rowsOfClass('creature-battle')).toHaveLength(150);
  });

  it('every aging line has 3 forms and every Ancient exactly 1 (bible §4)', () => {
    for (const line of content.species) {
      expect(artFormsOf(line).length, line.id).toBe(line.ancient ? 1 : 3);
    }
    expect(content.species.filter((s) => s.ancient)).toHaveLength(3);
  });

  it('every creature form has a front AND a back sprite, and nothing else does', () => {
    for (const line of content.species) {
      for (const stage of artFormsOf(line)) {
        const stem = `battle-${line.id.replace(/-line$/, '')}-${stage.toLowerCase()}`;
        expect(byId.has(`${stem}-front`), stem).toBe(true);
        expect(byId.has(`${stem}-back`), stem).toBe(true);
      }
    }
    expect(new Set(rowsOfClass('creature-battle').map((r) => r.view))).toEqual(new Set(['front', 'back']));
  });

  it('35 painted dex identities, one per named identity in species.json', () => {
    const dexIds = new Set(content.species.flatMap((s) => s.dexIds));
    expect(dexIds.size).toBe(35);
    expect(rowsOfClass('dex-painted')).toHaveLength(35);
    for (const id of dexIds) expect(byId.has(`dex-${id.toLowerCase()}`), id).toBe(true);
  });

  it('12 base maps, one per node file', () => {
    expect(rowsOfClass('map-town').length + rowsOfClass('map-route').length).toBe(content.nodes.length);
    expect(content.nodes.length).toBe(12);
  });

  it('28 year variants: slice nodes 2–6, everything else year 2 (§9.7 cap 30, cut line C-2)', () => {
    const variants = rowsOfClass('map-variant');
    expect(variants).toHaveLength(28);
    expect(variants.length).toBeLessThanOrEqual(30);
    for (const slice of ['hearthollow', 'r1', 'brackwater', 'r2']) {
      for (const year of [2, 3, 4, 5, 6]) expect(byId.has(`map-${slice}-y${year}`), `${slice}-y${year}`).toBe(true);
    }
    expect(byId.has('map-sanctum-y2')).toBe(true);
    expect(byId.has('map-sanctum-y3')).toBe(false);
  });

  it('one overworld mini per encounterable line — derived from node populations, not a list', () => {
    const lines = encounterableLines(content);
    expect(lines.length).toBe(24);
    expect(rowsOfClass('overworld-mini')).toHaveLength(lines.length);
    for (const l of lines) expect(byId.has(`mini-${l.id.replace(/-line$/, '')}`), l.id).toBe(true);
    // A line that appears in no node's populations gets no mini (the starters come from Maren, D3).
    expect(byId.has('mini-cindril')).toBe(false);
  });

  it('8 trainers: the 6 leaders from data/gyms.json plus Wick and Maren (bible §8)', () => {
    expect(rowsOfClass('trainer-battle')).toHaveLength(8);
    for (const g of content.gyms) expect(byId.has(`trainer-${g.id}`), g.id).toBe(true);
    expect(byId.has('trainer-wick')).toBe(true);
    expect(byId.has('trainer-maren')).toBe(true);
  });

  it('props are derived from core/types.ts PROP_KINDS, so they match the node schema', () => {
    expect(rowsOfClass('prop')).toHaveLength(PROP_KINDS.length);
    for (const kind of PROP_KINDS) expect(byId.has(`prop-${kind}`), kind).toBe(true);
  });

  it('the player ships 3 statics and the §9.6 walk frames', () => {
    expect(rowsOfClass('player')).toHaveLength(9);
    for (const v of ['front', 'back', 'side']) expect(byId.get(`player-${v}`)!.mode).toBe('txt2img');
    for (const v of ['front-step-left', 'side-step-right']) expect(byId.get(`player-${v}`)!.mode).toBe('img2img');
  });

  it('every row carries the §9.7 fields, and every id is unique', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) {
      expect(r.id, JSON.stringify(r)).toBeTruthy();
      expect(manifest.classes[r.class], r.id).toBeTruthy();
      expect(r.subject.length, r.id).toBeGreaterThan(4);
      expect(r.view, r.id).toBeTruthy();
      expect(Number.isInteger(r.seed), r.id).toBe(true);
      expect(r.targetSize, r.id).toMatch(/^\d+x\d+$/);
      expect(['pending', 'raw', 'final', 'approved', 'failed']).toContain(r.status);
      expect(r.origin.length, r.id).toBeGreaterThan(4);
    }
  });

  it('nothing claims to be generated that is not — and the one that does has a file on disk', () => {
    const done = rows.filter((r) => r.status !== 'pending');
    // Gate B0 passed, so exactly one row is real: the approved player front static.
    expect(done.map((r) => r.id)).toEqual(['player-front']);
    for (const r of done) {
      expect(r.recordedSeed, r.id).toBeDefined();
      expect(r.file, r.id).toBeTruthy();
      expect(existsSync(resolve(REPO_ROOT, r.file!)), r.file).toBe(true);
      expect(createHash('sha256').update(readFileSync(resolve(REPO_ROOT, r.file!))).digest('hex')).toBe(r.sha256);
    }
    for (const r of rows) {
      if (r.status === 'pending') expect(r.recordedSeed === undefined && r.file === undefined, r.id).toBe(true);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The seams that bind the manifest to the rest of the repo
 * ════════════════════════════════════════════════════════════════════════════ */

describe('manifest ↔ data/ seams', () => {
  it("a map row's destination IS the node file's own mapAsset — closing the typo hole", () => {
    // LANE-A-STATUS §4: "a typo in a mapAsset path will not be caught by any Lane A test."
    for (const node of content.nodes) {
      expect(byId.get(`map-${node.id}`)!.finalFile, node.id).toBe(node.mapAsset);
    }
  });

  it('a year variant is img2img off the node\'s own base map, at the balance denoise', () => {
    for (const r of rowsOfClass('map-variant')) {
      const node = content.nodes.find((n) => r.id.startsWith(`map-${n.id}-y`));
      expect(node, r.id).toBeTruthy();
      expect(r.mode).toBe('img2img');
      expect(r.initImage).toBe(node!.mapAsset);
      expect(r.denoise).toBe(content.balance.overlayDiff.denoiseStart);
      expect(r.gate, r.id).toMatch(/overlay-diff/);
    }
  });

  it('yearVariants in data/nodes/*.json is still empty — G4 says nothing enters it unmeasured', () => {
    for (const node of content.nodes) expect(Object.keys(node.yearVariants), node.id).toHaveLength(0);
  });

  it('class target sizes that have a balance source match it (deviation LB-M4)', () => {
    const map = content.balance.map;
    for (const cls of ['player', 'npc-static']) {
      expect(manifest.classes[cls]!.targetW, cls).toBe(map.playerSpriteW);
      expect(manifest.classes[cls]!.targetH, cls).toBe(map.playerSpriteH);
    }
    for (const cls of ['map-town', 'map-route', 'map-variant']) {
      expect(manifest.classes[cls]!.targetW, cls).toBe(map.mapNativePx);
      expect(manifest.classes[cls]!.targetH, cls).toBe(map.mapNativePx);
    }
    expect(manifest.classes['prop']!.targetW).toBe(map.propInteractionRadiusDefault);
    // The two §9.3 art-only sizes have no balance home; they are pinned here so a drift is visible.
    expect(manifest.classes['creature-battle']!.targetW).toBe(96);
    expect(manifest.classes['overworld-mini']!.targetW).toBe(32);
  });

  it('the ui frames fit inside the virtual screen (balance.map 480×320)', () => {
    for (const r of rowsOfClass('ui-frame')) {
      const [w, h] = r.targetSize.split('x').map(Number) as [number, number];
      expect(w, r.id).toBeLessThanOrEqual(content.balance.map.virtualWidth);
      expect(h, r.id).toBeLessThanOrEqual(content.balance.map.virtualHeight);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §8.4 style lock — the prompt strings themselves
 * ════════════════════════════════════════════════════════════════════════════ */

describe('style lock (build-doc §8.4 / §9.2 / L6)', () => {
  const FROZEN_NEGATIVE = 'low quality, bad anatomy, extra digits, missing digits, extra limbs, missing limbs';

  it('every row carries the frozen negative prompt verbatim', () => {
    for (const r of rows) expect(r.negative.startsWith(FROZEN_NEGATIVE), r.id).toBe(true);
  });

  it('only the player class extends it, and only with the cape ban (B-D7)', () => {
    for (const r of rows) {
      if (r.class === 'player') expect(r.negative).toBe(`${FROZEN_NEGATIVE}, cape, cloak, hood, mantle`);
      else expect(r.negative, r.id).toBe(FROZEN_NEGATIVE);
    }
  });

  it("player-front's prompt is byte-identical to the gate-B0 approved row (G5 / §8.4)", () => {
    // The protagonist's identity is a prompt + a seed. If this drifts, "regenerating the player"
    // silently produces a different character — which is the exact failure G5 names.
    const b0 = JSON.parse(readFileSync(resolve(REPO_ROOT, 'tools/comfy/manifest-b0.json'), 'utf8')) as {
      rows: Array<{ id: string; subject: string; seed: number; sha256?: string; status: string }>;
    };
    const approved = b0.rows.find((r) => r.id === 'player-front')!;
    expect(approved.status).toBe('approved');
    const mine = byId.get('player-front')!;
    expect(mine.prompt).toBe(approved.subject);
    expect(mine.seed).toBe(approved.seed);
    expect(mine.sha256).toBe(approved.sha256);
  });

  it('every player prompt carries the L6 ELEMENTS and never the words L6 forbids (LB-M8)', () => {
    // L6 asks for its string verbatim; the approved prompt elaborates it (deviation LB-M8), so the
    // binding check is on the elements, plus the byte-equality test above.
    expect(manifest._player.l6Verbatim).toBe('green shirt, ranger cap with star badge, leather satchel, walking boots');
    for (const r of rowsOfClass('player')) {
      for (const element of ['green shirt', 'ranger cap', 'star badge', 'leather satchel', 'walking boots']) {
        expect(r.prompt.includes(element), `${r.id} is missing "${element}"`).toBe(true);
      }
      expect(/\bcape\b|\bcloak\b/i.test(r.prompt), r.id).toBe(false);
    }
  });

  it('every pixel class uses the validated trial skeleton, not §9.2\'s documented one (B-D9)', () => {
    for (const r of rows) {
      if (r.class === 'dex-painted' || r.class === 'map-variant') continue;
      expect(r.prompt.includes('retro 90s handheld RPG style'), r.id).toBe(true);
      expect(r.prompt.includes('monster-taming'), r.id).toBe(false);
    }
  });

  it('every sprite prompt asks for the flat background the post-process assumes', () => {
    for (const r of rows) {
      if (!manifest.classes[r.class]!.postprocess.removeBackground) continue;
      expect(r.prompt.includes('plain white background'), r.id).toBe(true);
    }
  });

  it('the painted dex class uses §9.4\'s prompt direction verbatim', () => {
    for (const r of rowsOfClass('dex-painted')) {
      expect(r.prompt.startsWith('painted storybook illustration, natural-history field-guide style, ')).toBe(true);
      expect(r.prompt.endsWith(', soft watercolor texture, muted palette')).toBe(true);
    }
  });

  it("Fenmaw's prompts repeat the gharial snout — §9.2's named fidelity failure", () => {
    for (const r of rows.filter((x) => x.id.includes('fenmaw'))) {
      expect((r.prompt.match(/gharial/g) ?? []).length, r.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('no prompt mentions the class reference image that regressed that anatomy (B-D6)', () => {
    for (const r of rows) expect(r.initImage ?? '').not.toMatch(/creature-croc/);
  });

  it('every untrialed class is flagged as such so nobody scales it up blind', () => {
    const untrialled = Object.entries(manifest.classes).filter(([, c]) => !c.trialled).map(([n]) => n);
    expect(untrialled.sort()).toEqual(['dex-painted', 'map-route', 'map-variant', 'prop', 'ui-frame']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Graph injection — what actually gets submitted
 * ════════════════════════════════════════════════════════════════════════════ */

describe('graph injection', () => {
  it('a txt2img row injects prompt, negative and seed and nothing else', () => {
    const row = byId.get('battle-cindril-j-front')!;
    const { graph, seed } = graphForRow(row, baseGraph);
    expect(seed).toBe(row.seed);
    const ks = Object.values(graph).find((n) => n!.class_type === 'KSampler')!;
    expect(ks.inputs.seed).toBe(row.seed);
    expect(ks.inputs.steps).toBe(8);
    expect(ks.inputs.cfg).toBe(1);
    expect(ks.inputs.sampler_name).toBe('res_multistep');
    expect(ks.inputs.scheduler).toBe('simple');
    expect(ks.inputs.denoise).toBe(1);
    const texts = Object.values(graph)
      .filter((n) => n!.class_type === 'CLIPTextEncode')
      .map((n) => n!.inputs.text);
    expect(texts).toContain(row.prompt);
    expect(texts).toContain(row.negative);
    // the base graph on disk is untouched
    expect(Object.values(baseGraph).find((n) => n!.class_type === 'KSampler')!.inputs.seed).toBe(42);
  });

  it('the workflow hash is stable and sensitive — it is what §9.1 records per row', () => {
    const row = byId.get('battle-cindril-j-front')!;
    const a = graphForRow(row, baseGraph);
    const b = graphForRow(row, baseGraph);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toHaveLength(16);
    const other = graphForRow(byId.get('battle-cindril-j-back')!, baseGraph);
    expect(other.hash).not.toBe(a.hash);
    expect(workflowHash(a.graph)).toBe(a.hash);
  });

  it('an img2img row refuses to build without an uploaded init image', () => {
    expect(() => graphForRow(byId.get('map-r1-y2')!, baseGraph)).toThrow(/needs an uploaded init image/);
  });

  it('the img2img graph keeps the validated model chain and only swaps the latent source', () => {
    const row = byId.get('map-r1-y2')!;
    const { graph } = graphForRow(row, baseGraph, 'r1.png');
    const classes = Object.values(graph).map((n) => n!.class_type);
    expect(classes).toContain('LoadImage');
    expect(classes).toContain('VAEEncode');
    expect(classes).not.toContain('EmptySD3LatentImage');
    // Everything §9.2 locks is byte-identical to the trial graph.
    for (const cls of ['UNETLoader', 'CLIPLoader', 'VAELoader', 'ModelSamplingAuraFlow']) {
      const before = Object.values(baseGraph).find((n) => n!.class_type === cls)!;
      const after = Object.values(graph).find((n) => n!.class_type === cls)!;
      expect(after.inputs, cls).toEqual(before.inputs);
    }
    const ks = Object.values(graph).find((n) => n!.class_type === 'KSampler')!;
    expect(ks.inputs.denoise).toBe(row.denoise);
    expect(ks.inputs.steps).toBe(8);
    const encode = Object.entries(graph).find(([, n]) => n!.class_type === 'VAEEncode')!;
    expect(ks.inputs.latent_image).toEqual([encode[0], 0]);
    const load = Object.entries(graph).find(([, n]) => n!.class_type === 'LoadImage')!;
    expect(load[1]!.inputs.image).toBe('r1.png');
  });

  it('img2img refuses denoise 1.0 — that is txt2img wearing a costume', () => {
    expect(() => buildImg2ImgGraph(baseGraph, { initImageName: 'x.png', denoise: 1 })).toThrow(Img2ImgError);
    expect(() => buildImg2ImgGraph(baseGraph, { initImageName: 'x.png', denoise: 0 })).toThrow(Img2ImgError);
    expect(() => buildImg2ImgGraph(baseGraph, { initImageName: '', denoise: 0.35 })).toThrow(/init image/);
  });

  it('the untrialed img2img path refuses to be pointed at a batch (SUPERVISED gate)', async () => {
    await expect(
      runSmoke({ initImagePath: 'x.png', outPath: 'y.png', positive: '', negative: '', seed: 1, denoise: 0.35, images: 28 }),
    ).rejects.toThrow(SmokeGateError);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The runner — §9.1's retry/flag/record loop, against a stub client.
 *
 * No network, ever: Comfy Cloud bills for failed jobs (B-D8), so a suite that can reach the API
 * will eventually spend credits in CI. The stub is the whole point — the behaviour under test is
 * the runner's, not the cloud's.
 * ════════════════════════════════════════════════════════════════════════════ */

type StubBehaviour = (id: string, call: number) => 'ok' | Error;

function stubClient(behaviour: StubBehaviour) {
  const calls: string[] = [];
  const perRow = new Map<string, number>();
  return {
    calls,
    client: {
      async run(graph: Graph) {
        // Key on the full positive prompt: front/back rows of the same creature agree for the
        // first couple of hundred characters, so a truncated key silently merges them.
        const id = String(
          Object.values(graph).find((n) => n!.class_type === 'CLIPTextEncode')!.inputs.text ?? '',
        );
        calls.push(id);
        const n = (perRow.get(id) ?? 0) + 1;
        perRow.set(id, n);
        const verdict = behaviour(id, n);
        if (verdict !== 'ok') throw verdict;
        return { '9': { images: [{ filename: 'out.png' }] } };
      },
      async saveAll(_outputs: unknown, destFor: (img: { filename: string }, i: number) => string) {
        // Write a real file: the runner hashes what it saved, and a stub that only returns a path
        // would let a broken download look like a success.
        const dest = destFor({ filename: 'out.png' }, 0);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        return [dest];
      },
    },
  };
}

const ENV = { host: 'https://example.invalid', key: 'test', maxConcurrency: 2 };

describe('the runner (build-doc §9.1)', () => {
  const pick = (n: number): ManifestRow[] => clone(rowsOfClass('creature-battle').slice(0, n));
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'trophic-runner-'));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('records {file, seed, workflowHash, timestamp} back onto the row on success', async () => {
    const { client } = stubClient(() => 'ok');
    const batch = pick(3);
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      log: () => {},
      now: () => '2026-08-25T12:00:00.000Z',
    });
    expect(report).toMatchObject({ attempted: 3, succeeded: 3 });
    for (const row of batch) {
      expect(row.status).toBe('raw');
      expect(row.recordedSeed).toBe(row.seed);
      expect(row.workflowHash).toHaveLength(16);
      expect(row.timestamp).toBe('2026-08-25T12:00:00.000Z');
      expect(row.file).toBe(`assets/raw/creature-battle/${row.id}.png`);
      expect(row.flaggedForReview).toBe(false);
    }
  });

  it('retries twice and then flags for supervised review — it does not retry forever', async () => {
    const { client, calls } = stubClient(() => new Error('cloud said no'));
    const batch = pick(1);
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      concurrency: 1,
      log: () => {},
    });
    expect(calls).toHaveLength(3); // 1 try + 2 retries
    expect(batch[0]!.attempts).toBe(3);
    expect(batch[0]!.status).toBe('failed');
    expect(batch[0]!.flaggedForReview).toBe(true);
    expect(batch[0]!.reviewReason).toMatch(/cloud said no/);
    expect(report.flagged).toHaveLength(1);
  });

  it('a row that fails once and then works is recorded clean, with no lingering flag', async () => {
    const { client } = stubClient((_id, call) => (call === 1 ? new Error('transient') : 'ok'));
    const batch = pick(1);
    await runBatch(manifest, batch, client as never, baseGraph, ENV, { confirmed: false, root, concurrency: 1, log: () => {} });
    expect(batch[0]!.status).toBe('raw');
    expect(batch[0]!.attempts).toBe(2);
    expect(batch[0]!.flaggedForReview).toBe(false);
    expect(batch[0]!.reviewReason).toBeUndefined();
  });

  /*
   * WHY THIS TEST CHANGED (justify-test-edit).
   *
   * It used to manufacture `recordedSeed = seed + 7` on a row still at version 1 — its own comment
   * said "as if this asset had been generated before the row moved" — and then require the runner to
   * submit that seed silently. "The row moved" IS the G5 event: the approved art has become
   * unreproducible from the manifest, and §8.4 says the only way forward is versioning the row. The
   * old assertion made walking past it the contract.
   *
   * Both halves are asserted now: a row whose record still agrees regenerates with its frozen seed
   * (the reuse property, which is what the test was FOR), and a drifted row is refused on the live
   * path instead of silently overridden.
   */
  /*
   * WHY THIS TEST CHANGED (justify-test-edit). It regenerated an `approved` row with
   * `confirmed: false` and asserted the regeneration went through. That is the defect, not the
   * behaviour: `run --force --id=player-front --dry-run` exits 0 today, and the non-dry version
   * moves the one gate-B0 asset from `approved` to `raw`, repoints `file` away from
   * assets/approved-trials/player-APPROVED.png and overwrites the approved sha256 — with no human
   * in the loop, because player-front carries no `gate` and class `player` is `trialled: true`.
   * The seed claim is unchanged and still asserted; what changed is that a human has to say so, and
   * that the record the regeneration replaces is kept.
   */
  it('a REGENERATION reuses the frozen seed — G5 on the live path', async () => {
    const { client } = stubClient(() => 'ok');
    const batch = pick(1);
    const row = batch[0]!;
    const frozen = row.seed; // what this asset was actually generated with
    row.status = 'approved';
    row.recordedSeed = frozen;
    row.recordedVersion = row.version;
    row.recordedPromptHash = promptIdentity(row);
    row.file = 'assets/approved-trials/some-approved.png';
    row.sha256 = 'ba2df07114ffa6d22055fdb0db4238ab0aed8780c68a2c45fe8c821a48f83140';

    // …and it may not happen at all without a human: a sign-off is not overwritten unsupervised.
    await expect(
      runBatch(manifest, batch, client as never, baseGraph, ENV, {
        confirmed: false,
        root,
        concurrency: 1,
        log: () => {},
        layoutGate: null,
      }),
    ).rejects.toThrow(SupervisedGateError);
    expect(row.status).toBe('approved');

    await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: null,
    });
    expect(row.status).toBe('raw');
    expect(row.recordedSeed).toBe(frozen);
    expect(graphForRow(row, baseGraph).seed).toBe(frozen);
    // What the regeneration replaced is still readable — the PNG on disk was never what was at risk.
    expect(row.supersededApproval).toMatchObject({
      status: 'approved',
      file: 'assets/approved-trials/some-approved.png',
      sha256: 'ba2df07114ffa6d22055fdb0db4238ab0aed8780c68a2c45fe8c821a48f83140',
      recordedSeed: frozen,
    });
  });

  it('a row whose derivation has MOVED is refused on the live path, not silently overridden', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const batch = pick(1);
    const row = batch[0]!;
    row.status = 'approved';
    row.recordedSeed = row.seed + 7; // the derivation moved out from under the frozen seed
    row.recordedVersion = row.version;
    row.recordedPromptHash = promptIdentity(row);
    // --confirm, deliberately: a human HAS approved this regeneration, and G5 still refuses it.
    // A guardrail that only holds while nobody is looking is the wrong way round.
    await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: null,
    });
    // A GUARDRAIL REFUSAL LEAVES THE RECORD IT DEFENDS ALONE. This used to assert
    // `status === 'failed'`, which was the defect written down as an expectation: the refusal
    // downgraded the approved row it was protecting, main()'s `finally` persisted that, and
    // `selectRows` (pending|failed) then re-attempted the same row on the next bare `run` — so a
    // guard that refused once handed the row back to the next unattended batch, approval gone.
    expect(row.status).toBe('approved');
    expect(row.flaggedForReview).toBe(true);
    expect(row.reviewReason).toMatch(/reuse its manifest seed/);
    expect(row.reviewReason).toMatch(/REFUSED/);
    // G5 is not transient: it must not be retried, and nothing may be submitted or billed.
    expect(calls).toHaveLength(0);
    expect(row.attempts).toBeUndefined();
    // …and the row is not re-selected by a later bare run, because it never became `failed`.
    expect(selectRows({ ...manifest, rows: [row] }, { force: false })).toHaveLength(0);
  });

  it('G13 refuses BEFORE anything is submitted', async () => {
    const { client, calls } = stubClient(() => 'ok');
    await expect(
      runBatch(manifest, pick(CREDIT_GATE_ROWS), client as never, baseGraph, ENV, { confirmed: false, root, log: () => {} }),
    ).rejects.toThrow(CreditGateError);
    expect(calls).toHaveLength(0);
  });

  it('--dry-run prints the plan and submits nothing', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const lines: string[] = [];
    const batch = pick(4);
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      dryRun: true,
      log: (l) => lines.push(l),
    });
    expect(calls).toHaveLength(0);
    expect(report.attempted).toBe(0);
    expect(batch.every((r) => r.status === 'pending')).toBe(true);
    expect(lines.filter((l) => l.includes('[dry]'))).toHaveLength(4);
  });

  it('runs the whole selection under the configured concurrency', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const batch = pick(7);
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      concurrency: 3,
      log: () => {},
    });
    expect(report.succeeded).toBe(7);
    expect(calls).toHaveLength(7);
    expect(new Set(calls).size).toBe(7);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The SUPERVISED gates — §9.4 / §9.5 / §9.6.
 *
 * `row.gate` and a class's `trialled: false` used to be strings nothing read. Measured before the
 * fix, through the real CLI:
 *   `run --class=map-variant --confirm --dry-run` printed "NOTE: untrialed class(es)…" and then
 *   planned 28 img2img rows through a graph neither of whose two uses had been reviewed;
 *   `run --class=player --dry-run` planned 8 rows including 6 img2img walk frames with NO --confirm
 *   at all, because 8 sits under the 20-row credit gate.
 * Both are refusals now, and these tests are what keeps them refusals.
 * ════════════════════════════════════════════════════════════════════════════ */

describe('supervised gates (build-doc §9.4 / §9.5 / §9.6)', () => {
  const rowsFor = (cls: string) => clone(rowsOfClass(cls));

  it('every map-variant row carries a gate, and the class is marked untrialed — the fields the gate reads', () => {
    for (const r of rowsOfClass('map-variant')) expect(r.gate, r.id).toMatch(/overlay-diff/);
    expect(manifest.classes['map-variant']!.trialled).toBe(false);
    expect(manifest._img2img?.trialled).toBe(false);
  });

  it('REFUSES to point the untrialed img2img graph at a batch, with or without --confirm', () => {
    const variants = rowsFor('map-variant');
    expect(variants.length).toBeGreaterThan(1);
    expect(() => assertSupervised(variants, manifest, true)).toThrow(SupervisedGateError);
    expect(() => assertSupervised(variants, manifest, true)).toThrow(/has been run and reviewed/);
    expect(() => assertSupervised(variants, manifest, false)).toThrow(SupervisedGateError);
  });

  it('…and that refusal covers the player walk frames too, which sit under the credit gate', () => {
    // `run --class=player` is 8 rows: under CREDIT_GATE_ROWS, so G13 never fires. Six of them are
    // §9.6 img2img walk frames on the same untrialed graph.
    const player = rowsFor('player');
    expect(player).toHaveLength(9); // 3 statics + 6 §9.6 walk frames
    expect(player.filter((r) => r.mode === 'img2img').length).toBeGreaterThan(1);
    expect(planBatch(player, manifest).requiresConfirm).toBe(false); // G13 alone would wave it through
    expect(() => assertSupervised(player, manifest, false)).toThrow(SupervisedGateError);
    expect(() => assertSupervised(player, manifest, true)).toThrow(/has been run and reviewed/);
  });

  /*
   * BF-21's SIBLING. The README's "Not yet built" section was retracted (B-D66) — the img2img graph
   * is built and HAS run live — but the refusal a human reads still quoted the retracted sentence
   * verbatim: `tools/comfy/README.md: "does not exist and cannot be retrieved; it was never
   * trialled"`. A shipped error citing a document that contradicts it is worse than one citing
   * nothing, because the operator goes and reads the document.
   *
   * The second half of this is the general form, and it is the part that survives the next
   * rewrite: every sentence any tools/comfy source attributes to the README must still BE in the
   * README. That is what makes retracting a README paragraph a red test rather than a silent lie in
   * an error message.
   */
  it('the refusal states its own condition, and no tools/comfy source quotes a retracted README line', () => {
    const readme = readFileSync(resolve(REPO_ROOT, 'tools/comfy/README.md'), 'utf8');

    let msg = '';
    try {
      assertSupervised(rowsFor('map-variant'), manifest, true);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg, 'the gate did not refuse at all').not.toBe('');
    // Its own condition — the flag it actually reads, and what has actually not happened.
    expect(msg).toMatch(/manifest\._img2img\.trialled is false/);
    expect(msg).toMatch(/§9\.5/);
    expect(msg).toMatch(/§9\.6/);
    // …and NOT the two claims the README now contradicts: the graph exists and has executed.
    expect(msg).not.toMatch(/never been executed|does not exist and cannot be retrieved|never trialled/);

    /*
     * The general form: `README.md … "<sentence>"` anywhere in tools/comfy/*.ts must be quoting
     * something the README still says.
     *
     * The quotations are JOINED FIRST. Both of the stale ones were split across a `+` at the line
     * break (`"does not exist and cannot be ` + `retrieved; it was never trialled"`), so a matcher
     * that stops at a newline finds neither of them — it would have read green through the whole
     * life of the defect.
     */
    const readmeQuotations = (src: string): string[] =>
      [
        ...src
          .replace(/`\s*\+\s*[\r\n\s]*`/g, '')
          .replace(/'\s*\+\s*[\r\n\s]*'/g, '')
          .matchAll(/README\.md[^"]{0,60}"([^"]{10,200})"/g),
      ].map((m) => m[1]!);

    // POSITIVE CONTROL, on the exact shape the defect had — otherwise a sweep that finds nothing
    // (which is what a clean tree looks like) is indistinguishable from a sweep that cannot see.
    const asItWas =
      'tools/comfy/README.md: "does not exist and cannot be ` +\n' +
      '        `retrieved; it was never trialled"';
    expect(readmeQuotations(asItWas)).toEqual(['does not exist and cannot be retrieved; it was never trialled']);
    expect(readme).not.toContain('does not exist and cannot be retrieved; it was never trialled');

    const sources = readdirSync(resolve(REPO_ROOT, 'tools/comfy')).filter((f) => f.endsWith('.ts'));
    expect(sources.length).toBeGreaterThan(2);
    for (const file of sources) {
      for (const quoted of readmeQuotations(readFileSync(resolve(REPO_ROOT, 'tools/comfy', file), 'utf8'))) {
        expect(readme, `tools/comfy/${file} quotes the README on "${quoted}", which it no longer says`).toContain(
          quoted,
        );
      }
    }
  });

  it('lets exactly ONE img2img row through, and only with --confirm — the §9.5/§9.6 smoke', () => {
    const one = [rowsFor('map-variant')[0]!];
    expect(() => assertSupervised(one, manifest, false)).toThrow(SupervisedGateError);
    expect(() => assertSupervised(one, manifest, true)).not.toThrow();
  });

  it('once the img2img graph is trialled, a batch of them needs --confirm but is no longer capped at one', () => {
    const m = clone(manifest);
    m._img2img = { trialled: true };
    const variants = clone(m.rows.filter((r) => r.class === 'map-variant'));
    expect(() => assertSupervised(variants, m, false)).toThrow(SupervisedGateError);
    expect(() => assertSupervised(variants, m, false)).toThrow(/supervised gate/);
    expect(() => assertSupervised(variants, m, true)).not.toThrow();
  });

  it('a gated row refuses without --confirm even when its class is trialled (the dex plates)', () => {
    const dex = rowsFor('dex-painted').slice(0, 3);
    for (const r of dex) expect(r.gate).toMatch(/§9.4/);
    expect(() => assertSupervised(dex, manifest, false)).toThrow(SupervisedGateError);
    expect(() => assertSupervised(dex, manifest, true)).not.toThrow();
  });

  it('an untrialed class with no per-row gate still refuses without --confirm (props, UI, map-route)', () => {
    for (const cls of ['prop', 'ui-frame', 'map-route']) {
      const rs = rowsFor(cls);
      expect(rs.length, cls).toBeGreaterThan(0);
      expect(rs.every((r) => r.gate === undefined), cls).toBe(true);
      expect(() => assertSupervised(rs, manifest, false), cls).toThrow(SupervisedGateError);
      expect(() => assertSupervised(rs, manifest, true), cls).not.toThrow();
    }
  });

  it('a trialled, ungated, txt2img batch is not supervised — the gate is on the risky paths only', () => {
    expect(() => assertSupervised(rowsFor('creature-battle').slice(0, 30), manifest, false)).not.toThrow();
  });

  it('BINDS — flipping a class to trialled changes the verdict, so the field is what is read', () => {
    const m = clone(manifest);
    const props = clone(m.rows.filter((r) => r.class === 'prop'));
    expect(() => assertSupervised(props, m, false)).toThrow(SupervisedGateError);
    m.classes['prop']!.trialled = true;
    expect(() => assertSupervised(props, m, false)).not.toThrow();
  });

  it('runBatch refuses BEFORE anything is submitted, and --dry-run does not slip past it', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const variants = rowsFor('map-variant');
    await expect(
      runBatch(manifest, variants, client as never, baseGraph, ENV, {
        confirmed: true,
        dryRun: true,
        log: () => {},
        layoutGate: null,
      }),
    ).rejects.toThrow(SupervisedGateError);
    expect(calls).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * G4 — the §8.2 layout gate on the live path.
 *
 * Before this, `overlayDiff()` had no caller anywhere in the pipeline: `grep -rn "overlayDiff("`
 * found the definition, its CLI and its own test, and nothing else. A year-variant row could be
 * generated and recorded `raw` without the gate ever running, and
 * `balance.overlayDiff.maxRegenAttempts` was read by a console.log and by an assertion, never
 * enforced.
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the §8.2 layout gate runs on the live path (G4)', () => {
  const variantRow = (): ManifestRow => clone(byId.get('map-r1-y2')!);
  const trialled = (): ManifestFile => {
    const m = clone(manifest);
    m._img2img = { trialled: true };
    return m;
  };
  const LADDER = { denoiseStep: 0.05, denoiseFloor: 0.2, maxRegenAttempts: 3 };
  /** The init upload is the one network call on the img2img path; stub it, never reach the cloud. */
  const fakeUpload = async (): Promise<string> => 'init.png';
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'trophic-gate-'));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** A gate stub that reports a verdict per call, so the ladder is observable without generating art. */
  function gateStub(verdicts: boolean[]) {
    const seen: Array<number | undefined> = [];
    let i = 0;
    const gate = async (_row: ManifestRow, _saved: string, _root: string, denoise?: number) => {
      seen.push(denoise);
      const ok = verdicts[Math.min(i++, verdicts.length - 1)]!;
      return { accepted: ok, iou: ok ? 0.93 : 0.61, threshold: 0.85, largestDrift: ok ? 2 : 41, reason: ok ? 'ACCEPT' : 'REJECT' };
    };
    return { gate, seen };
  }

  it('records the gate verdict on a candidate that passes, and only then calls it raw', async () => {
    const { client } = stubClient(() => 'ok');
    const { gate, seen } = gateStub([true]);
    const batch = [variantRow()];
    const report = await runBatch(trialled(), batch, client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: gate,
      ladder: LADDER,
      uploadInit: fakeUpload,
    });
    expect(report.succeeded).toBe(1);
    expect(batch[0]!.status).toBe('raw');
    expect(batch[0]!.layoutGate).toMatchObject({ iou: 0.93, threshold: 0.85 });
    expect(seen).toEqual([content.balance.overlayDiff.denoiseStart]);
  });

  it('walks the §9.5 denoise ladder on a rejection instead of accepting it', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const { gate, seen } = gateStub([false, false, true]);
    const batch = [variantRow()];
    const report = await runBatch(trialled(), batch, client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: gate,
      ladder: LADDER,
      uploadInit: fakeUpload,
    });
    expect(report.succeeded).toBe(1);
    expect(seen).toEqual([0.35, 0.3, 0.25]); // start, −step, −step (§8.2 / §9.5)
    expect(calls).toHaveLength(3); // one generation per rung, not a blind retry
    // The rung that WORKED is recorded on the verdict…
    expect(batch[0]!.layoutGate!.denoise).toBe(0.25);
    // …and the row's own derived `denoise` is untouched. The ladder used to write its working value
    // here, which left the row permanently disagreeing with its own derivation — and, once the run
    // path re-derives before submitting (assertRowsDerived), that disagreement is a refusal.
    expect(batch[0]!.denoise).toBe(content.balance.overlayDiff.denoiseStart);
    expect(specOf(batch[0]!)).toEqual(deriveRows(trialled(), content).find((r) => r.id === batch[0]!.id));
  });

  it('gives up at maxRegenAttempts and FLAGS — it never accepts a failing variant (G4)', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const { gate, seen } = gateStub([false]);
    const batch = [variantRow()];
    const report = await runBatch(trialled(), batch, client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: gate,
      ladder: LADDER,
      uploadInit: fakeUpload,
    });
    expect(report.succeeded).toBe(0);
    expect(seen).toHaveLength(LADDER.maxRegenAttempts);
    expect(calls).toHaveLength(LADDER.maxRegenAttempts);
    expect(batch[0]!.status).toBe('failed');
    expect(batch[0]!.flaggedForReview).toBe(true);
    expect(batch[0]!.reviewReason).toMatch(/overlay-diff/);
    expect(batch[0]!.reviewReason).toMatch(/nearest\s+passing variant/);
    expect(batch[0]!.layoutGate).toBeUndefined();
    expect(report.flagged).toHaveLength(1);
  });

  it('BINDS — maxRegenAttempts is read, not decorative', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const { gate } = gateStub([false]);
    await runBatch(trialled(), [variantRow()], client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: gate,
      ladder: { ...LADDER, maxRegenAttempts: 1 },
      uploadInit: fakeUpload,
    });
    expect(calls).toHaveLength(1);
  });

  it('a non-gated class is not gated — the gate never fires on a sprite', async () => {
    const { client } = stubClient(() => 'ok');
    let fired = 0;
    const batch = clone(rowsOfClass('creature-battle').slice(0, 2));
    await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: async () => {
        fired++;
        return { accepted: false, iou: 0, threshold: 0.85, largestDrift: 99, reason: 'should not run' };
      },
    });
    expect(fired).toBe(0);
    expect(batch.every((r) => r.status === 'raw')).toBe(true);
  });

  it('THE REAL GATE refuses a variant when the node has no collision mask on disk — "no mask" is not a pass', async () => {
    // The repo's true state today: no node has a base map or a mask on disk, so the honest verdict
    // for every year variant is REFUSE. Falling back to "every pixel is walkable" would compare the
    // whole frame and quietly turn a gate into decoration.
    const node = content.nodes.find((n) => n.id === 'r1')!;
    expect(existsSync(resolve(REPO_ROOT, node.mapAsset))).toBe(false);
    expect(existsSync(resolve(REPO_ROOT, node.collisionMask))).toBe(false);

    const maskless = await mkdtemp(join(tmpdir(), 'trophic-nomask-'));
    try {
      // Give it the base map so the ONLY thing missing is the mask — the claim under test.
      const size = content.balance.map.mapNativePx;
      await mkdir(dirname(resolve(maskless, node.mapAsset)), { recursive: true });
      await writeRaster(resolve(maskless, node.mapAsset), townFixture(size, 0));
      expect(existsSync(resolve(maskless, node.collisionMask))).toBe(false);

      const { client, calls } = stubClient(() => 'ok');
      const batch = [variantRow()];
      const report = await runBatch(trialled(), batch, client as never, baseGraph, ENV, {
        confirmed: true,
        root: maskless,
        concurrency: 1,
        log: () => {},
        layoutGate: overlayDiffGate(content),
        ladder: LADDER,
        uploadInit: fakeUpload,
      });
      expect(report.succeeded).toBe(0);
      // REFUSED, not failed, and refused BEFORE anything is submitted. The gate used to run after a
      // billed generation and then mark the row `failed` — so "no mask authored yet", which is the
      // state of all twelve nodes, cost an image every time and downgraded the row.
      expect(calls, 'a row the gate cannot judge must not be generated at all').toHaveLength(0);
      expect(batch[0]!.status).toBe('pending');
      expect(batch[0]!.attempts).toBeUndefined();
      expect(batch[0]!.flaggedForReview).toBe(true);
      expect(batch[0]!.reviewReason).toMatch(/collision mask/);
      expect(batch[0]!.reviewReason).toMatch(/G4/);
      expect(batch[0]!.reviewReason).toMatch(/nothing was billed/);
      expect(batch[0]!.layoutGate).toBeUndefined();
    } finally {
      await rm(maskless, { recursive: true, force: true });
    }
  }, 30_000);

  /**
   * Once with the mask authored at MAP resolution (1024²) and once at CELL resolution (64×64).
   * tools/overlay-diff/mask.ts promises the collision editor that either is acceptable, and until
   * this ran that promise was a sentence in a comment — while tools/collision-editor/ is empty and
   * not one of the twelve masks data/nodes/*.json names exists on disk (B-D49). These are still
   * SYNTHETIC masks of a SYNTHETIC town; what they pin is the file format and the plumbing, not
   * that a human's mask of a painted map marks the cells this gate assumes.
   */
  it.each([
    ['authored at map resolution (1024²)', 1],
    ['authored at cell resolution (64×64)', 0],
  ])('THE REAL GATE, end to end, %s: a moved building is REJECTED and a repaint is ACCEPTED', async (_label, atMapRes) => {
    // Real overlayDiff, real balance numbers, real runner — only the cloud is a stub. The node's
    // base map and mask are written into a scratch root so the test never touches assets/.
    const node = content.nodes.find((n) => n.id === 'r1')!;
    const gateRoot = await mkdtemp(join(tmpdir(), 'trophic-realgate-'));
    try {
      const size = content.balance.map.mapNativePx;
      const base = townFixture(size, 0);
      await mkdir(dirname(resolve(gateRoot, node.mapAsset)), { recursive: true });
      await writeRaster(resolve(gateRoot, node.mapAsset), base);
      const grid = collisionGrid(content.balance);
      const cells = walkableCells(townMask(size), grid);
      await writeRaster(
        resolve(gateRoot, node.collisionMask),
        atMapRes ? townMask(size) : cellsToRaster(cells, grid),
      );

      for (const [label, candidate, accepted] of [
        ['repaint', dimmed(townFixture(size, 0), 0.88), true],
        ['moved building', townFixture(size, content.balance.map.collisionCellPx * 3), false],
      ] as const) {
        const batch = [variantRow()];
        const { client } = stubClient(() => 'ok');
        // The stub "generates" by writing the candidate where the runner will look for it.
        const writing = {
          async run(g: Graph) {
            return client.run(g);
          },
          async saveAll(_o: unknown, destFor: (img: { filename: string }, i: number) => string) {
            const dest = destFor({ filename: 'out.png' }, 0);
            await mkdir(dirname(dest), { recursive: true });
            await writeRaster(dest, candidate);
            return [dest];
          },
        };
        const report = await runBatch(trialled(), batch, writing as never, baseGraph, ENV, {
          confirmed: true,
          root: gateRoot,
          concurrency: 1,
          log: () => {},
          layoutGate: overlayDiffGate(content),
          ladder: { ...LADDER, maxRegenAttempts: 1 },
          uploadInit: fakeUpload,
        });
        expect(report.succeeded, `${label}: ${batch[0]!.reviewReason ?? batch[0]!.status}`).toBe(accepted ? 1 : 0);
        expect(batch[0]!.status, label).toBe(accepted ? 'raw' : 'failed');
        if (!accepted) expect(batch[0]!.reviewReason, label).toMatch(/overlay-diff/);
      }
    } finally {
      await rm(gateRoot, { recursive: true, force: true });
    }
  }, 30_000);
});

/* ════════════════════════════════════════════════════════════════════════════
 * Failure handling that costs credits if it is wrong
 * ════════════════════════════════════════════════════════════════════════════ */

describe('the runner does not re-bill for post-generation failures (§9.1)', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'trophic-bill-'));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('a download failure retries the DOWNLOAD, not the generation', async () => {
    // Measured before the fix: a stub whose run() always succeeded and whose saveAll() threw
    // "GET /api/view -> 404" produced 3 BILLED generations for one image, because the retry block
    // wrapped generation and download together.
    let generations = 0;
    let downloads = 0;
    const client = {
      async run() {
        generations++;
        return { '9': { images: [{ filename: 'out.png' }] } };
      },
      async saveAll() {
        downloads++;
        throw new Error('GET /api/view -> 404 for out.png');
      },
    };
    const batch = clone(rowsOfClass('creature-battle').slice(0, 1));
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: null,
    });
    expect(generations).toBe(1);
    expect(downloads).toBe(3);
    expect(batch[0]!.status).toBe('failed');
    expect(batch[0]!.reviewReason).toMatch(/NOT re-submitted/);
    expect(report.flagged).toHaveLength(1);
  });

  it('a download that recovers on the second try still costs exactly one generation', async () => {
    let generations = 0;
    let downloads = 0;
    const client = {
      async run() {
        generations++;
        return { '9': { images: [{ filename: 'out.png' }] } };
      },
      async saveAll(_o: unknown, destFor: (img: { filename: string }, i: number) => string) {
        downloads++;
        if (downloads === 1) throw new Error('connection reset');
        const dest = destFor({ filename: 'out.png' }, 0);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        return [dest];
      },
    };
    const batch = clone(rowsOfClass('creature-battle').slice(0, 1));
    await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: null,
    });
    expect(generations).toBe(1);
    expect(downloads).toBe(2);
    expect(batch[0]!.status).toBe('raw');
  });

  it('a malformed --concurrency is a refusal, never a silent no-op batch', () => {
    // Measured before the fix: `Math.max(1, NaN)` is NaN and `Array.from({length: NaN})` is empty,
    // so the batch submitted 0 jobs, reported {"attempted":0,"succeeded":0} and exited 0.
    expect(Math.max(1, Number('abc'))).toBeNaN();
    expect(Array.from({ length: Number('abc') }, () => 1)).toHaveLength(0);
    expect(() => positiveInt('abc', 'COMFY_MAX_CONCURRENCY', 1)).toThrow(/whole number/);
    expect(() => positiveInt('0', 'COMFY_MAX_CONCURRENCY', 1)).toThrow();
    expect(() => positiveInt('2.5', 'COMFY_MAX_CONCURRENCY', 1)).toThrow();
    expect(positiveInt(undefined, 'COMFY_MAX_CONCURRENCY', 1)).toBe(1);
    expect(positiveInt('4', 'COMFY_MAX_CONCURRENCY', 1)).toBe(4);
  });

  it('and a NaN concurrency reaching runBatch still runs every row', async () => {
    const { client, calls } = stubClient(() => 'ok');
    const batch = clone(rowsOfClass('creature-battle').slice(0, 3));
    const report = await runBatch(manifest, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root,
      concurrency: Number('abc'),
      log: () => {},
      layoutGate: null,
    });
    expect(report.attempted).toBe(3);
    expect(report.succeeded).toBe(3);
    expect(calls).toHaveLength(3);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The B1 repair wave — every one of these reproduced against the real tree first.
 * ════════════════════════════════════════════════════════════════════════════ */

describe('§8.4\'s versioned reseed is real on the RUN path, not only on rebuild (B-D42)', () => {
  const root = REPO_ROOT; // nothing here submits; the guards fire before any write

  /** The exact state an operator lands in by doing what `SeedReuseError` tells them to do. */
  function handBumped(): { m: ManifestFile; row: ManifestRow } {
    const m = clone(manifest);
    const row = m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    row.status = 'approved';
    row.recordedSeed = row.seed; // frozen at version 1
    row.recordedVersion = 1;
    row.recordedPromptHash = promptIdentity(row);
    row.file = 'assets/raw/creature-battle/battle-fenmaw-e-front.png';
    row.version = 2; // …bumped by hand, WITHOUT a rebuild. `seed` is still version 1's.
    return { m, row };
  }

  it('REFUSES to submit a bumped row whose seed the bump never reached', () => {
    const { row } = handBumped();
    expect(row.seed).toBe(deriveSeed(row.id, 1));
    expect(row.seed).not.toBe(deriveSeed(row.id, 2));
    // It used to return `row.seed` here — the OLD seed — bill for it, record it as a reseed, and
    // leave the manifest in a state `rebuild` refuses to touch.
    expect(() => seedForSubmit(row)).toThrow(SeedReuseError);
    expect(() => seedForSubmit(row)).toThrow(/rebuild/);
  });

  it('…and runBatch submits NOTHING, bills nothing, and leaves the record untouched', async () => {
    const { m, row } = handBumped();
    const { client, calls } = stubClient(() => 'ok');
    const before = JSON.stringify(row);
    const report = await runBatch(m, [row], client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: null,
    });
    expect(calls, 'a wedge must not be paid for').toHaveLength(0);
    expect(report.succeeded).toBe(0);
    expect(report.flagged).toHaveLength(1);
    expect(row.status).toBe('approved');
    expect(row.recordedSeed).toBe(deriveSeed(row.id, 1));
    expect(row.recordedVersion).toBe(1);
    expect(row.attempts).toBeUndefined();
    // Everything except the review flag is exactly as it was found.
    const after = { ...row };
    delete after.flaggedForReview;
    delete after.reviewReason;
    expect(JSON.stringify(after)).toBe(
      JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(before) as Record<string, unknown>))),
    );
  });

  it('the run path re-derives before it submits — a hand edit never reaches the cloud unexamined', () => {
    const { m, row } = handBumped();
    expect(() => assertRowsDerived(m, [row], content)).toThrow(/version 2 != 1/);
    expect(() => assertRowsDerived(m, [row], content)).toThrow(/rebuild/);
    // And a subject rewritten in a header block is caught the same way, on the same path.
    const m2 = clone(manifest);
    (m2._player as Record<string, unknown>).subject = 'a completely different character';
    const player = m2.rows.find((r) => r.id === 'player-front')!;
    expect(() => assertRowsDerived(m2, [player], content)).toThrow(/prompt/);
    // …while an untouched manifest passes, so the check is not simply always-throwing.
    expect(() => assertRowsDerived(manifest, manifest.rows, content)).not.toThrow();
  });

  it('the escape ITSELF still works: rebuild moves the seed, and then the run path accepts it', () => {
    const { m } = handBumped();
    const rebuilt = rebuildRows(m, content).find((r) => r.id === 'battle-fenmaw-e-front')!;
    expect(rebuilt.seed).toBe(deriveSeed('battle-fenmaw-e-front', 2));
    expect(rebuilt.status).toBe('pending');
    expect(seedForSubmit(rebuilt)).toBe(deriveSeed('battle-fenmaw-e-front', 2));
    expect(() => assertRowsDerived({ ...m, rows: [rebuilt] }, [rebuilt], content)).not.toThrow();
  });
});

describe('a guardrail refusal does not damage the record it defends (B-D43)', () => {
  const root = REPO_ROOT;

  it('a refused row keeps its status, so the next bare run does not pick it up again', async () => {
    const m = clone(manifest);
    const row = m.rows.find((r) => r.id === 'battle-cindril-j-front')!;
    row.status = 'approved';
    row.recordedSeed = row.seed + 7; // drifted derivation: G5
    row.recordedVersion = row.version;
    row.recordedPromptHash = promptIdentity(row);
    row.sha256 = 'deadbeef';
    row.file = 'assets/raw/creature-battle/battle-cindril-j-front.png';

    const { client, calls } = stubClient(() => 'ok');
    await runBatch(m, [row], client as never, baseGraph, ENV, {
      confirmed: true,
      root,
      concurrency: 1,
      log: () => {},
      layoutGate: null,
    });
    expect(calls).toHaveLength(0);
    expect(row.status).toBe('approved');
    expect(row.sha256).toBe('deadbeef');
    expect(row.recordedSeed).toBe(deriveSeed(row.id, row.version) + 7);
    expect(row.flaggedForReview).toBe(true);
    // The failure this replaces: `fail()` set status 'failed', main()'s finally persisted it, and
    // selectRows picks pending|failed — so a G5 refusal handed the approved row straight back to
    // the next unattended `run`, approval and sha256 gone.
    expect(selectRows({ ...m, rows: [row] }, { force: false })).toHaveLength(0);
  });

  it('a REAL failure still downgrades — refuse() has not replaced fail()', async () => {
    const m = clone(manifest);
    const batch = clone(rowsOfClass('creature-battle').slice(0, 1));
    const { client } = stubClient(() => new Error('cloud said no'));
    await runBatch(m, batch, client as never, baseGraph, ENV, {
      confirmed: false,
      root: await mkdtemp(join(tmpdir(), 'trophic-refuse-')),
      concurrency: 1,
      log: () => {},
      layoutGate: null,
    });
    expect(batch[0]!.status).toBe('failed');
    expect(batch[0]!.attempts).toBe(3);
  });
});

describe('§8.4 locks the PROMPT as well as the seed (B-D45)', () => {
  it('the one approved row carries the prompt identity of the art it claims', () => {
    const row = manifest.rows.find((r) => r.id === 'player-front')!;
    expect(row.status).toBe('approved');
    expect(row.recordedPromptHash).toBe(promptIdentity(row));
    // …anchored in the gate-B0 record, not in the current manifest agreeing with itself.
    const b0 = JSON.parse(readFileSync(resolve(REPO_ROOT, 'tools/comfy/manifest-b0.json'), 'utf8')) as {
      rows: Array<Record<string, string>>;
    };
    const approved = b0.rows.find((r) => r.id === 'player-front')!;
    expect(promptIdentity({ prompt: approved.subject!, negative: approved.negative! })).toBe(row.recordedPromptHash);
    expect(row.sha256).toBe(approved.sha256);
  });

  it('a prompt that moves under a frozen seed is REFUSED — on rebuild and on the submit path', () => {
    const m = clone(manifest);
    (m._player as Record<string, unknown>).subject =
      'young field warden protagonist wearing a RED shirt, a top hat and no satchel';
    // Before: rebuild accepted this in silence and left player-front `approved`, still claiming the
    // sha256 of art the OLD prompt produced. workflowHash was written on every row and read by
    // nothing — `grep -rn workflowHash tools tests` found only assignments.
    expect(() => rebuildRows(m, content)).toThrow(StyleLockError);
    expect(() => rebuildRows(m, content)).toThrow(/prompt has changed/);

    const drifted = clone(manifest).rows.find((r) => r.id === 'player-front')!;
    drifted.prompt = `${drifted.prompt} and a top hat`;
    expect(() => assertStyleLock(drifted)).toThrow(StyleLockError);
    expect(() => graphForRow(drifted, baseGraph)).toThrow(StyleLockError);
  });

  it('the NEGATIVE is part of the identity too — B-D7\'s cape ban lives only there', () => {
    const row = clone(manifest).rows.find((r) => r.id === 'player-front')!;
    row.negative = row.negative.replace(', cape, cloak, hood, mantle', '');
    expect(() => assertStyleLock(row)).toThrow(StyleLockError);
  });

  it('versioning the row is the escape, exactly as it is for the seed', () => {
    const row = clone(manifest).rows.find((r) => r.id === 'player-front')!;
    row.prompt = 'something else entirely';
    row.recordedVersion = 1;
    row.version = 2;
    expect(() => assertStyleLock(row)).not.toThrow(); // superseded, not drifted
  });

  it('a recorded row with NO prompt identity is a refusal, not a silent pass', () => {
    const row = clone(manifest).rows.find((r) => r.id === 'player-front')!;
    delete row.recordedPromptHash;
    expect(() => assertStyleLock(row)).toThrow(/recordedPromptHash/);
    // …and a row that has generated nothing has nothing to protect.
    const pending = clone(manifest).rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    expect(pending.recordedSeed).toBeUndefined();
    expect(() => assertStyleLock(pending)).not.toThrow();
  });

  it('a successful run records the prompt identity alongside the seed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trophic-lock-'));
    try {
      const batch = clone(rowsOfClass('creature-battle').slice(0, 1));
      const { client } = stubClient(() => 'ok');
      await runBatch(manifest, batch, client as never, baseGraph, ENV, {
        confirmed: false,
        root: dir,
        concurrency: 1,
        log: () => {},
        layoutGate: null,
      });
      expect(batch[0]!.recordedPromptHash).toBe(promptIdentity(batch[0]!));
      expect(batch[0]!.workflowHash).toHaveLength(16);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('G13 projects what can actually be billed (B-D46)', () => {
  const priced = (): ManifestFile => {
    const m = clone(manifest);
    m._credits.perImageCredits = 1;
    m._credits.measuredFrom = 'a test';
    return m;
  };

  it('a map-variant batch reports the §9.1 retry AND the §9.5 ladder, not one image per row', () => {
    const m = priced();
    const variants = m.rows.filter((r) => r.class === 'map-variant');
    const plan = planBatch(variants, m);
    expect(variants).toHaveLength(28);
    expect(plan.projectedCredits).toBe(28); // the floor — this is all the old estimate reported
    // 3 transport attempts (§9.1 "retry ×2") inside 3 regen attempts (balance.overlayDiff).
    expect(plan.worstCaseImages).toBe(28 * TRANSPORT_ATTEMPTS * content.balance.overlayDiff.maxRegenAttempts);
    expect(plan.worstCaseImages).toBe(252);
    expect(plan.worstCaseCredits).toBe(252);
    expect(plan.lines.join('\n')).toMatch(/up to 252 worst case/);
  });

  it('an ungated class carries the transport budget only — 3×, not 9×', () => {
    const m = priced();
    const sprites = m.rows.filter((r) => r.class === 'creature-battle');
    const plan = planBatch(sprites, m);
    expect(sprites).toHaveLength(150);
    expect(plan.worstCaseImages).toBe(150 * TRANSPORT_ATTEMPTS);
  });

  it('BINDS — the projection tracks the real budgets, so it cannot drift from them', () => {
    const m = priced();
    const variants = m.rows.filter((r) => r.class === 'map-variant').slice(0, 1);
    expect(planBatch(variants, m, { transportAttempts: 1, maxRegenAttempts: 1 }).worstCaseImages).toBe(1);
    expect(planBatch(variants, m, { transportAttempts: 2, maxRegenAttempts: 5 }).worstCaseImages).toBe(10);
  });

  it('the ladder really can spend that budget — measured, not asserted', async () => {
    // One map-variant row, a gate that always rejects, a transport that fails on alternate calls.
    const dir = await mkdtemp(join(tmpdir(), 'trophic-budget-'));
    const LADDER = { denoiseStep: 0.05, denoiseFloor: 0.2, maxRegenAttempts: 3 };
    try {
      const m = clone(manifest);
      m._img2img = { trialled: true };
      const row = m.rows.find((r: ManifestRow) => r.class === 'map-variant')!;
      let n = 0;
      const { client, calls } = stubClient(() => {
        n++;
        return n % 2 === 0 ? new Error('transport') : 'ok';
      });
      await runBatch(m, [row], client as never, baseGraph, ENV, {
        confirmed: true,
        root: dir,
        concurrency: 1,
        log: () => {},
        ladder: LADDER,
        uploadInit: async () => 'init.png',
        layoutGate: async () => ({ accepted: false, iou: 0.5, threshold: 0.85, largestDrift: 40, reason: 'REJECT' }),
      });
      expect(calls.length).toBeGreaterThan(3); // more than one rung's worth of billed generations
      expect(calls.length).toBeLessThanOrEqual(TRANSPORT_ATTEMPTS * LADDER.maxRegenAttempts);
      expect(row.attempts).toBe(calls.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('a filter that matches nothing is a typo, not a finished batch (B-D47)', () => {
  it('an unknown --class is a refusal, with the near miss named', () => {
    expect(() => assertFiltersMatch(manifest, { class: 'creature-batle' })).toThrow(ManifestError);
    expect(() => assertFiltersMatch(manifest, { class: 'creature-batle' })).toThrow(/Did you mean creature-battle/);
  });

  it('an unknown --id is a refusal', () => {
    expect(() => assertFiltersMatch(manifest, { id: 'nonexistent-row' })).toThrow(/is not a row/);
    expect(() => assertFiltersMatch(manifest, { id: 'battle-fenmaw-e-fron' })).toThrow(/Did you mean battle-fenmaw-e-front/);
  });

  it('the real ones pass', () => {
    expect(() => assertFiltersMatch(manifest, { class: 'creature-battle', id: 'battle-fenmaw-e-front' })).not.toThrow();
    expect(() => assertFiltersMatch(manifest, {})).not.toThrow();
  });

  it('…and "nothing to do" is only reachable when rows genuinely matched', () => {
    // The old message asserted "every selected row is already generated", which was false for a
    // typo — the rows it claimed were generated did not exist. selectRows itself cannot tell the
    // difference, which is exactly why the check above has to happen before it.
    const m = clone(manifest);
    m.rows.find((r) => r.id === 'battle-fenmaw-e-front')!.status = 'approved';
    expect(selectRows(m, { id: 'battle-fenmaw-e-front', force: false })).toHaveLength(0);
    expect(selectRows(m, { id: 'battle-fenmaw-e-front', force: true })).toHaveLength(1);
    expect(selectRows(m, { id: 'nonexistent-row', force: true })).toHaveLength(0);
  });
});

describe('§9.2\'s workflow lock is COMPARED, not just recorded (B-D45)', () => {
  it('the approved row records the hash of the graph it was generated with', () => {
    const row = manifest.rows.find((r) => r.id === 'player-front')!;
    // It had NO workflowHash at all before this wave, so "every row records sha256 and workflowHash"
    // was false for the only row that had a record.
    expect(row.workflowHash).toHaveLength(16);
    expect(graphForRow({ ...row, workflowHash: undefined }, baseGraph).hash).toBe(row.workflowHash);
  });

  it('a moved WORKFLOW is refused even when prompt, negative and seed all still match', () => {
    const row = clone(manifest).rows.find((r) => r.id === 'player-front')!;
    // §9.2 locks steps/cfg/sampler/scheduler/resolution and B-D2's ModelSamplingAuraFlow shift.
    // None of them is visible to a seed (hashSeed(version, id)) or to promptIdentity.
    const tampered = JSON.parse(JSON.stringify(baseGraph)) as Graph;
    const sampler = Object.values(tampered).find((n) => n!.class_type === 'KSampler')!;
    sampler.inputs.steps = 12; // was 8
    expect(promptIdentity(row)).toBe(row.recordedPromptHash); // prompt half is untouched…
    expect(() => graphForRow(row, tampered)).toThrow(StyleLockError); // …and it is still refused.
    expect(() => graphForRow(row, tampered)).toThrow(/WORKFLOW itself/);
    // The unmodified graph passes, so the check is not simply always-throwing.
    expect(() => graphForRow(row, baseGraph)).not.toThrow();
  });

  it('versioning the row is the escape here too', () => {
    // A DERIVED-seed row, in the state `rebuild` leaves it after a bump: version 2, seed re-derived.
    // (player-front cannot demonstrate this — its seed is PINNED at the validated trial 42, so a
    // version bump cannot move it and `finish` refuses one; that is B-D27's refusal, still binding.)
    const row = clone(manifest).rows.find((r) => r.id === 'battle-fenmaw-e-front')!;
    row.recordedSeed = deriveSeed(row.id, 1);
    row.recordedVersion = 1;
    row.recordedPromptHash = promptIdentity(row);
    row.workflowHash = 'aaaaaaaaaaaaaaaa';
    row.version = 2;
    row.seed = deriveSeed(row.id, 2);
    const tampered = JSON.parse(JSON.stringify(baseGraph)) as Graph;
    Object.values(tampered).find((n) => n!.class_type === 'KSampler')!.inputs.steps = 12;
    expect(() => graphForRow(row, tampered)).not.toThrow();
  });

  it('an img2img row is NOT hash-locked — §9.5 is supposed to move its denoise', () => {
    const row = clone(manifest).rows.find((r) => r.class === 'map-variant')!;
    row.recordedSeed = row.seed;
    row.recordedVersion = row.version;
    row.recordedPromptHash = promptIdentity(row);
    row.workflowHash = 'aaaaaaaaaaaaaaaa'; // deliberately wrong
    expect(row.mode).toBe('img2img');
    expect(() => graphForRow(row, baseGraph, 'init.png', 0.25)).not.toThrow();
  });
});
