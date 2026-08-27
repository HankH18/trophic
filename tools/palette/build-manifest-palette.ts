/**
 * tools/palette/build-manifest-palette.ts — derive `tools/comfy/manifest-palette.json` from disk.
 *
 * Same discipline as `tools/comfy/build-manifest-b0.ts`: nothing here is hand-typed. Every row is
 * read back out of the run logs the generators wrote, and every sha256 is computed from the bytes
 * that are actually on disk — so a stale row is detectable rather than merely unlikely.
 *
 * WHY THE PROSE IS DERIVED TOO — READ BEFORE PUTTING A SENTENCE BACK
 * ─────────────────────────────────────────────────────────────────
 * The first cut of this file computed the hashes and then HAND-TYPED the sentences around them:
 * `purpose`, `status` and `palettes.frozen.sources` were string literals asserting that
 * `data/palette.json` was "FROZEN and UNTOUCHED" and fitted over "5 approved trials (gate B0)".
 * When Hank ruled `class-equal` (T-15) and the palette was re-frozen over the broadened source set,
 * every one of the 32 hex values moved — and all three sentences became false while sitting
 * immediately above a `colorsSha256` that was still being computed correctly. The file described one
 * palette and hashed another. Worse, the JSON was then corrected BY HAND, which left this generator
 * as a loaded gun: running it would have silently reverted the correction, exactly the way
 * `tools/comfy/build-manifest-b0.ts` would have silently reverted two of Hank's recorded art
 * rejections.
 *
 * The rule that came out of both: **a claim that can drift is derived, verified, or absent.** So
 *
 *   1. `purpose` and `status` are ASSEMBLED from the live freeze — `frozen`, `frozenAt`,
 *      `colorCount`, the positional id range, `_method` — and from whether the promotion actually
 *      happened. There is no "SETTLED" literal; the word is chosen by a hash comparison.
 *   2. `palettes.frozen.sources` is `data/palette.json`'s own `source` string, VERBATIM. It is the
 *      freeze's own account of what it was fitted over; paraphrasing it here is how the 5-vs-19
 *      drift happened in the first place. Note this is deliberately NOT derived from
 *      `tools/palette/candidate-sources.json`: that file is the CANDIDATE fit's input list, and it
 *      only describes the frozen palette while the class-equal fit is the promoted one.
 *   3. The promotion claim is CHECKED, not asserted. `palettes.frozen.colorsSha256` and
 *      `palettes.classEqual.colorsSha256` are both computed from bytes on disk, and their equality
 *      is what decides the prose. If a future re-freeze moves one, the prose changes by itself.
 *   4. The counts in the candidate/class-equal blocks come from `candidate-sources.json`, and the
 *      class census is cross-checked against the weighting rationale the freeze recorded.
 *   5. It REFUSES to write at all if `data/palette.json` is not `frozen: true`, if a committed row
 *      or top-level block would be dropped, or if the rows no longer share one seed. Refusing
 *      loudly beats emitting a sentence that claims a freeze that is not there.
 *
 *   npx tsx tools/palette/build-manifest-palette.ts             # derive and write
 *   npx tsx tools/palette/build-manifest-palette.ts --dry-run   # derive, run the guards, write nothing
 *   npx tsx tools/palette/build-manifest-palette.ts --self-test # prove the guards can fail, write nothing
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sha = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');
const shaJson = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

const MANIFEST = 'tools/comfy/manifest-palette.json';
const PALETTE = 'data/palette.json';
const PALETTE_SOURCES = 'tools/palette/candidate-sources.json';
const CANDIDATE = 'data/palette.candidate.json';
const CLASS_EQUAL = 'assets/approved-trials/_palette-candidate/palette.candidate-classequal.json';
const GRAPH = 'tools/comfy/pixel-txt2img-api.json';
const RUN1 = 'assets/raw/palette-trials/_run1.json';
const RUN2 = 'assets/raw/palette-trials/_run2.json';

/** build-doc §9.1 / G13: a batch at or over this many items needs the credit estimate + `--confirm`. */
const G13_BATCH_THRESHOLD = 20;

const DRY_RUN = process.argv.includes('--dry-run');
const SELF_TEST = process.argv.includes('--self-test');

// `sha256` is `null`, not absent, for a row whose generation produced no file — the manifest records
// "there is nothing to hash here", which a missing key would leave indistinguishable from "not checked".
interface RunRow { id: string; status?: string; file?: string; sha256?: string | null; seed?: number; [k: string]: unknown }
interface Run { rows: RunRow[]; [k: string]: unknown }
interface Manifest { rows: RunRow[]; [k: string]: unknown }

interface PaletteFile {
  frozen: boolean;
  frozenAt?: string;
  source?: string;
  colorCount?: number;
  _comment?: string;
  colors: { id: string; hex: string }[];
  _method: { algorithm: string; fitSpace: string; weighting: string; weightingRationale?: string };
}

interface Source { id: string; file: string; set: string; class?: string }

/* ────────────────────────────────────────────────────────────────────────────
 * The derivation + safety layer. Pure functions over plain data, so `--self-test`
 * can drive them with synthetic inputs and prove they actually bind.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The refusal the whole file exists for. `status` and `purpose` below both describe a freeze; if
 * there is no freeze, the honest output is no output. Emitting the prose anyway is how a generated
 * file comes to certify something nobody did.
 */
export function assertFrozen(palette: Pick<PaletteFile, 'frozen'>, path = PALETTE): void {
  if (palette.frozen !== true) {
    throw new Error(
      `${MANIFEST} REFUSED — ${path} is not \`frozen: true\`, so this manifest cannot claim a freeze.\n`
      + 'Freeze the palette (or fix the flag) before rebuilding; a generated file does not get to\n'
      + 'assert a decision that has not been made.',
    );
  }
}

/**
 * Normalised class key. MIRRORS `tools/palette/fit.mjs`'s `classOf` — the source list uses both
 * `town-map` and `map-town` for the same class, and fit.mjs folds them before it weights. Without
 * the same fold the census here reports six classes where the fit used five, and the manifest would
 * quietly disagree with the palette it is describing.
 */
export const classOf = (s: Pick<Source, 'class'>) => (s.class ?? 'unclassified').replace(/^town-map$/, 'map-town');

/** Insertion-ordered `class×n` census, in the same order fit.mjs builds it, so the two strings compare. */
export function classCensus(sources: readonly Pick<Source, 'class'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sources) counts.set(classOf(s), (counts.get(classOf(s)) ?? 0) + 1);
  return counts;
}

export const censusText = (counts: Map<string, number>) =>
  [...counts].map(([c, n]) => `${c}×${String(n)}`).join(', ');

/** Insertion-ordered `set×n` census — which named source sets fed the candidate fit, and how many each. */
export function setCensus(sources: readonly Pick<Source, 'set'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sources) counts.set(s.set, (counts.get(s.set) ?? 0) + 1);
  return counts;
}

/**
 * The one seed `_seedRule` is allowed to name. Every trial row is supposed to carry the validated
 * trial seed; if that stops being true the sentence stops being true, so the number is read back
 * from the rows rather than typed, and a split refuses.
 */
export function soleSeed(rows: readonly RunRow[]): number {
  const seeds = [...new Set(rows.map((r) => r.seed))];
  if (seeds.length !== 1 || typeof seeds[0] !== 'number') {
    throw new Error(
      `${MANIFEST} REFUSED — the rows do not share ONE seed (saw ${JSON.stringify(seeds)}), so \`_seedRule\`\n`
      + 'cannot name it. Either the run logs are mixed or the rule has changed; say which, in the logs.',
    );
  }
  return seeds[0];
}

/**
 * `purpose` and `status`, assembled. `promoted` is a measured hash comparison, never a belief, and it
 * is the only thing that decides whether this file says the question is SETTLED or still open.
 */
export function describeFreeze(f: {
  frozenAt: string; colorCount: number; idFirst: string; idLast: string;
  fitSpace: string; weighting: string; ticket: string | null;
  b0Count: number; coolCount: number; promoted: boolean;
}): { purpose: string; status: string } {
  const at = f.ticket === null ? `on ${f.frozenAt}` : `on ${f.frozenAt} at ${f.ticket}`;
  const ids = `${f.idFirst}-${f.idLast}`;
  const fit = `${f.fitSpace} / ${f.weighting}`;

  if (!f.promoted) {
    return {
      purpose: 'Cool-region palette trials + the CANDIDATE re-freeze they support. '
        + `data/palette.json is fitted over the ${String(f.b0Count)} gate-B0 sources, which are warm/green and `
        + `carry almost no cyan, blue or magenta; the ${String(f.coolCount)} cool trials below ask whether it should `
        + 'be re-fitted over a broadened source set, and this file is their provenance.',
      status: 'CANDIDATE — nothing here is approved and nothing is promoted. data/palette.json is frozen '
        + `${at} with ${String(f.colorCount)} positional ids ${ids}, and \`palettes.frozen.colorsSha256\` does NOT `
        + 'equal `palettes.classEqual.colorsSha256` — that inequality, checked from the bytes on disk at write '
        + 'time, is what says the class-equal fit has not been promoted.',
    };
  }
  return {
    purpose: 'Cool-region palette trials + the re-freeze they produced. data/palette.json HAD been fitted '
      + `over the ${String(f.b0Count)} gate-B0 sources, which are warm/green and carry almost no cyan, blue or `
      + `magenta; the ${String(f.coolCount)} cool trials below asked whether it should be re-fitted over a broadened `
      + 'source set, and this file is the provenance both for the asking and for the answer they got.',
    status: 'SETTLED — the images below are still trials (none is an approved or shipped asset, so G5 is '
      + 'untouched), but the question they were run to answer has been decided. data/palette.json was RE-FROZEN '
      + `${at} to the ${fit} fit: still \`frozen: true\`, still colorCount ${String(f.colorCount)}, still the same `
      + `positional ids ${ids} in the same order — a VALUE SWAP, not a schema change. It is therefore no longer `
      + 'UNTOUCHED. `palettes.frozen.colorsSha256` EQUALS `palettes.classEqual.colorsSha256`, and that equality is '
      + 'CHECKED here from the bytes on disk rather than asserted — the match IS the record of the promotion. '
      + 'See `palettes.frozen.sources` for what it was fitted over, quoted verbatim from the freeze itself.',
  };
}

/**
 * The refusal, re-derived from the FINISHED object so it survives a future edit that rewrites the
 * assembly above and forgets why. Throws — the caller has not written anything yet.
 */
export function assertNothingDestroyed(committed: Manifest, next: Manifest): void {
  const complaints: string[] = [];

  const nextRows = new Map(next.rows.map((r) => [r.id, r]));
  const lost = committed.rows.filter((r) => !nextRows.has(r.id)).map((r) => r.id);
  if (lost.length > 0) {
    complaints.push(`${String(lost.length)} row(s) would be DROPPED: ${lost.join(', ')}`);
  }
  for (const key of Object.keys(committed)) {
    if (!(key in next)) complaints.push(`the top-level block "${key}" would be DROPPED`);
  }

  if (complaints.length > 0) {
    throw new Error(
      `${MANIFEST} REFUSED — this rebuild would destroy recorded data.\n\n  - ${complaints.join('\n  - ')}\n\n`
      + 'Rows come from the run logs and blocks come from this script; losing one means an input moved,\n'
      + 'not that the row stopped being true. Removing either is a deliberate edit, never a side effect.',
    );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * `--self-test`: the guards and the derivation, proved capable of failing.
 *
 * G14 — the safety layer is not "done" because it looks right. Every case below drives the REAL
 * functions. Case 1 is the bug as it stood (prose that outlived the fact it described); the rest are
 * the guards' own failure modes.
 * ──────────────────────────────────────────────────────────────────────────── */

function selfTest(): void {
  const facts = {
    frozenAt: '2026-08-26', colorCount: 32, idFirst: 'c00', idLast: 'c31',
    fitSpace: 'sRGB', weighting: 'class-equal', ticket: 'T-15',
    b0Count: 5, coolCount: 14, promoted: true,
  };
  const committed: Manifest = {
    purpose: 'x',
    _seedRule: 'a top-level block the rebuild is expected to keep producing',
    rows: [{ id: 'pt-a', seed: 42 }, { id: 'pt-b', seed: 42 }],
  };

  const checks: [string, () => void][] = [
    ['a palette that is not frozen is REFUSED, not described', () => {
      expectThrows(() => { assertFrozen({ frozen: false }); },
        'not `frozen: true`', 'an unfrozen palette was allowed to be described as frozen');
      expectThrows(() => { assertFrozen({ frozen: undefined as unknown as boolean }); },
        'not `frozen: true`', 'a missing frozen flag was treated as a freeze');
      assertFrozen({ frozen: true }); // and a real freeze passes, so the guard is not simply always-throw
    }],
    ['the promotion claim follows the HASHES, not the wording', () => {
      const yes = describeFreeze(facts);
      const no = describeFreeze({ ...facts, promoted: false });
      expect(yes.status.startsWith('SETTLED'), 'a matching pair did not report the promotion');
      expect(yes.status.includes('EQUALS'), 'the promoted status did not name the equality it rests on');
      expect(no.status.startsWith('CANDIDATE'), 'a NON-matching pair still claimed the question was settled');
      expect(no.status.includes('does NOT'), 'the unpromoted status did not say the hashes disagree');
      expect(!no.status.includes('RE-FROZEN'), 'the unpromoted status still claimed a re-freeze');
      expect(!yes.status.includes('UNTOUCHED.') || yes.status.includes('no longer'),
        'the promoted status still called the palette UNTOUCHED');
    }],
    ['the live freeze, not a literal, supplies the numbers', () => {
      const moved = describeFreeze({ ...facts, frozenAt: '2027-01-01', colorCount: 48, idLast: 'c47', ticket: 'T-99' });
      expect(moved.status.includes('2027-01-01') && !moved.status.includes('2026-08-26'), 'frozenAt was hardcoded');
      expect(moved.status.includes('colorCount 48'), 'colorCount was hardcoded');
      expect(moved.status.includes('c00-c47'), 'the id range was hardcoded');
      expect(moved.status.includes('T-99'), 'the ticket was hardcoded');
      const noTicket = describeFreeze({ ...facts, ticket: null });
      expect(!noTicket.status.includes(' at T-'), 'a ticket was invented when the freeze recorded none');
    }],
    ['the class census folds town-map the way fit.mjs does', () => {
      const census = classCensus([{ class: 'town-map' }, { class: 'map-town' }, { class: 'creature-battle' }]);
      expect(census.size === 2, `town-map/map-town were counted as separate classes (${censusText(census)})`);
      expect(census.get('map-town') === 2, `map-town census is wrong: ${censusText(census)}`);
    }],
    ['a split seed is REFUSED, so `_seedRule` cannot name a seed the rows do not share', () => {
      expect(soleSeed([{ id: 'a', seed: 42 }, { id: 'b', seed: 42 }]) === 42, 'a shared seed was not read back');
      expectThrows(() => soleSeed([{ id: 'a', seed: 42 }, { id: 'b', seed: 7 }]),
        'do not share ONE seed', 'a mixed-seed run was allowed to claim one seed');
      expectThrows(() => soleSeed([{ id: 'a' }]),
        'do not share ONE seed', 'a row with no seed was allowed to claim one seed');
    }],
    ['a dropped row is REFUSED, not written', () => {
      assertNothingDestroyed(committed, committed); // the untouched case passes
      expectThrows(() => { assertNothingDestroyed(committed, { ...committed, rows: [{ id: 'pt-a', seed: 42 }] }); },
        'DROPPED', 'dropping pt-b was allowed through');
    }],
    ['a dropped top-level block is REFUSED', () => {
      const { _seedRule: _dropped, ...rest } = committed;
      expectThrows(() => { assertNothingDestroyed(committed, rest as Manifest); },
        '_seedRule', 'dropping _seedRule was allowed through');
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

function expectThrows(fn: () => unknown, mustMention: string, message: string): void {
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

const run1 = JSON.parse(await readFile(RUN1, 'utf8')) as Run;
const run2 = JSON.parse(await readFile(RUN2, 'utf8')) as Run;

const sources = JSON.parse(await readFile(PALETTE_SOURCES, 'utf8')) as Source[];
const inFit = new Map(sources.map((s) => [s.file, s.id]));

const warnings: string[] = [];
const prevRows = new Map(prev.rows.map((r) => [r.id, r]));

const rows: RunRow[] = [];
for (const [round, run] of [[1, run1], [2, run2]] as const) {
  for (const r of run.rows) {
    const file = r.file as string | undefined;
    const sha256 = file ? await sha(file) : null;
    // A hash that moved is a fact about the bytes, not a licence to update quietly: the manifest is
    // the record those bytes are checked against, so say so on the way past.
    const before = prevRows.get(r.id)?.sha256;
    if (typeof before === 'string' && sha256 !== null && before !== sha256) {
      warnings.push(`${r.id}: ${String(file)} changed on disk — sha256 ${before.slice(0, 12)}… → ${sha256.slice(0, 12)}…`);
    }
    rows.push({
      ...r,
      round,
      sha256,
      inCandidateFit: file ? inFit.has(file) : false,
      candidateSourceId: file ? (inFit.get(file) ?? null) : null,
    });
  }
}

const palette = JSON.parse(await readFile(PALETTE, 'utf8')) as PaletteFile;
assertFrozen(palette);

const candidate = JSON.parse(await readFile(CANDIDATE, 'utf8')) as { colors: unknown };
const classEq = JSON.parse(await readFile(CLASS_EQUAL, 'utf8')) as { colors: unknown };

const frozenSha = shaJson(palette.colors);
const classEqualSha = shaJson(classEq.colors);
/** The promotion claim, MEASURED. Both sides are hashes of bytes on disk; nothing here is believed. */
const promoted = frozenSha === classEqualSha;

const classes = classCensus(sources);
const sets = setCensus(sources);
const b0Count = [...sets].filter(([s]) => /^B0/i.test(s)).reduce((n, [, c]) => n + c, 0);
const coolCount = sources.length - b0Count;

// The freeze recorded which classes it weighted. If candidate-sources.json has moved since, the
// blocks below would be describing a different source set than the palette was actually fitted over.
const census = censusText(classes);
if (palette._method.weightingRationale !== undefined && !palette._method.weightingRationale.includes(census)) {
  warnings.push(
    `${PALETTE_SOURCES} now censuses as (${census}), which does not appear in ${PALETTE}\n`
    + '    _method.weightingRationale — the source list has moved since the freeze, so the candidate\n'
    + '    blocks below and the frozen palette are no longer describing the same set.',
  );
}

const seed = soleSeed(rows);
const totalGenerations = (run1.generations as number) + (run2.generations as number);
const ticket = /\bT-\d+\b/.exec(palette._comment ?? '')?.[0] ?? null;
const ids = palette.colors.map((c) => c.id);
const { purpose, status } = describeFreeze({
  frozenAt: palette.frozenAt ?? '(no frozenAt recorded)',
  colorCount: palette.colorCount ?? palette.colors.length,
  idFirst: ids[0] ?? '(none)',
  idLast: ids[ids.length - 1] ?? '(none)',
  fitSpace: palette._method.fitSpace,
  weighting: palette._method.weighting,
  ticket, b0Count, coolCount, promoted,
});

const manifest: Manifest = {
  // Spread the committed file FIRST so a top-level block this script does not know about survives the
  // rebuild instead of vanishing because the new object literal happened not to mention it. Key order
  // is therefore the committed order; the literal below re-states each key in that same order.
  ...prev,
  purpose,
  status,
  _readme: `Regenerate with \`npx tsx ${'tools/palette/build-manifest-palette.ts'}\`. Rows are read back from `
    + 'assets/raw/palette-trials/_run{1,2}.json; every sha256 is computed from the bytes on disk. '
    + '`purpose`, `status`, `_seedRule`, `_generationCount` and the `palettes` block are DERIVED at write '
    + `time from ${PALETTE} and ${PALETTE_SOURCES} — do not hand-edit them, because a re-freeze must move `
    + 'them and a literal here would not (it did not, once, which is why they are derived). The build '
    + `refuses outright if ${PALETTE} is not \`frozen: true\`, if the rows stop sharing one seed, or if a `
    + 'row or top-level block would be dropped. tools/comfy/manifest.json is a concurrent workflow\'s file '
    + '— these rows do NOT merge into it, because none of these images is a shipped asset.',
  _seedRule: `Every row uses seed ${String(seed)}, read back from the rows rather than asserted — a split would `
    + 'refuse the build. `manifestDerivedSeed` records what tools/comfy/manifest.json would use for the '
    + 'corresponding SHIPPED row, so the two are never confused. G5 is untouched: no approved asset is '
    + 'regenerated here, and no row here is approved.',
  _generationCount: {
    round1: run1.generations, round2: run2.generations,
    total: totalGenerations,
    g13: totalGenerations < G13_BATCH_THRESHOLD
      ? `Under the ${String(G13_BATCH_THRESHOLD)}-item threshold, so build-doc G13's credit estimate + --confirm gate does not apply.`
      : `At or over the ${String(G13_BATCH_THRESHOLD)}-item threshold — build-doc G13's credit estimate + --confirm gate APPLIES to a batch this size.`,
  },
  _subjectProvenance: 'Round-1 subjects are the `prompt` field of the named `tools/comfy/manifest.json` row, '
    + 'VERBATIM — that file is the G2-gated transcription of bible §4 (species) and §6 (towns), so the trial '
    + 'prompt is the exact string B3/B4 will submit for that asset. Round-2 subjects vary ONLY the anatomy '
    + 'clause and the view clause, for the reasons recorded per row.',
  palettes: {
    frozen: {
      file: PALETTE, frozen: palette.frozen, frozenAt: palette.frozenAt,
      colorCount: palette.colorCount, colorsSha256: frozenSha,
      // VERBATIM from the freeze's own `source`. Paraphrasing this is what produced the "5 approved
      // trials (gate B0)" line that outlived the 19-source re-freeze.
      sources: palette.source,
      method: `${palette._method.algorithm}; fit space ${palette._method.fitSpace}; `
        + `${palette._method.weighting} weighting`,
      isClassEqualFit: promoted,
      _derived: `Every field here is read from ${PALETTE} at write time; \`colorsSha256\` is hashed from its `
        + `\`colors\`, and \`isClassEqualFit\` is that hash COMPARED against ${CLASS_EQUAL} — it is a `
        + 'measurement, not a claim. Do not hand-edit: a re-freeze must move all of it.',
    },
    candidate: {
      file: CANDIDATE, frozen: false,
      colorsSha256: shaJson(candidate.colors),
      sources: `${PALETTE_SOURCES} — ${String(sources.length)} images (${censusText(sets)})`,
      method: 'srgb / equal per-image, k-means++ seeded 42 — the gate-B0 method with a broadened INPUT',
      tool: `npx tsx tools/palette/fit.mjs --sources=${PALETTE_SOURCES} --pick=srgb/equal --reason="…" --out=${CANDIDATE} --outdir=assets/approved-trials/_palette-candidate`,
    },
    classEqual: {
      file: CLASS_EQUAL, frozen: false,
      colorsSha256: classEqualSha,
      method: 'srgb / class-equal — same source set, each ASSET CLASS given an equal vote',
      why: `Measured secondary option. Over ${String(sources.length)} images "equal per image" no longer `
        + 'delivers the thing it was chosen for at B0 ("every asset class gets an equal vote"), because the '
        + `class census is now ${census} — counted from ${PALETTE_SOURCES}, folding town-map into map-town the `
        + 'way fit.mjs does.',
      tool: `npx tsx tools/palette/fit.mjs --sources=${PALETTE_SOURCES} --with-class-equal --pick=srgb/class-equal --reason="…" --out=${CLASS_EQUAL} --outdir=assets/approved-trials/_palette-candidate/classequal`,
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
  workflowGraph: GRAPH,
  workflowGraphSha256: await sha(GRAPH),
  rows,
};

// The refusal, on the finished object, before a single byte is written.
assertNothingDestroyed(prev, manifest);

if (!DRY_RUN) await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${MANIFEST} — ${String(rows.length)} rows, `
  + `${String(rows.filter((r) => r.status === 'raw').length)} generated ok, `
  + `${String(rows.filter((r) => r.inCandidateFit).length)} in the candidate fit`
  + `${DRY_RUN ? '  (--dry-run: nothing written)' : ''}`);
console.log(`  ${PALETTE}: frozen ${String(palette.frozenAt)}, ${String(palette.colorCount)} colours, `
  + `${palette._method.fitSpace} / ${palette._method.weighting}, colorsSha256 ${frozenSha.slice(0, 12)}…`);
console.log(`  class-equal promoted to the freeze: ${promoted ? 'YES — the two colorsSha256 match' : 'NO — the two colorsSha256 differ'}`);
for (const w of warnings) console.warn(`  warning: ${w}`);
