/**
 * tests/unit/postprocess-run.test.ts — the §9.3 CLI refuses a filter that selects nothing.
 *
 * This binds the REAL COMMAND, as a child process, and not the guard function. That distinction is
 * the whole point of the file: `assertFiltersMatch` already existed and was already tested at
 * `tests/unit/manifest.test.ts` ("a filter that matches nothing is a typo, not a finished
 * batch") while `tools/postprocess/run.ts` never called it. Reproduced before the fix:
 *
 *     $ npx tsx tools/postprocess/run.ts --class=creature-batle --no-atlas
 *     0 processed · 0 rows have no raw file yet
 *     EXIT=0
 *
 * — a mistyped filter post-processing zero images and reporting success. An unattended batch reads
 * that exit code and moves on. A test that called the guard directly would have stayed green
 * through the entire life of that defect, so this one runs the command an operator runs and reads
 * the exit code an operator's script reads.
 *
 * Exit 3 is the shared "a guardrail refused" code, the same one `tools/comfy/comfy-batch.ts` uses.
 *
 * ⚠ THAT IS TRUE OF THE BF-6 HALF ONLY. The BF-25 half below compares two PURE FUNCTIONS, which is
 * the right test for "the two conventions agree" and NOT a test of the PNG writer — a verifier
 * reverted `writePlaceholders`'s repair (`placeholderLabel(row.finalFile)` → `row.id`) and all four
 * BF-25 cases stayed green, because nothing called the writer. `writePlaceholders`, run for real
 * into a temp root, is the last case in that block; it is the one that goes red for that sabotage.
 */
import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { loadPalette, loadPaletteFile, REPO_ROOT } from '../../tools/postprocess/palette.ts';
import { loadManifest } from '../../tools/comfy/comfy-batch.ts';
import { writePlaceholders } from '../../tools/postprocess/run.ts';
import { finalPathOf, processRow, rawPathOf } from '../../tools/postprocess/chain.ts';
import { blankRaster, readRaster, writeRaster } from '../../tools/postprocess/raster.ts';
import { placeholderLabel } from '../../tools/postprocess/placeholder.ts';
import { assetId, placeholderHex } from '@game/placeholder';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { hashSeed } from '../../core/rng.ts';

const exec = promisify(execFile);
const TSX = resolve(REPO_ROOT, 'node_modules/.bin/tsx');
const CLI = resolve(REPO_ROOT, 'tools/postprocess/run.ts');

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function cli(...args: string[]): Promise<Run> {
  try {
    const { stdout, stderr } = await exec(TSX, [CLI, ...args], { cwd: REPO_ROOT, maxBuffer: 8 << 20 });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: err.code ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

/** A row that really exists and a class that really exists — the manifest is the source of both. */
const manifest = await loadManifest();
const REAL_CLASS = 'creature-battle';
/*
 * Was `battle-fenmaw-e-back`. The back view is cut (game/ui/BattleHud.ts::Facing) so that row no
 * longer exists. Nothing in this file depends on the facing; the row only has to be real and to not
 * be in the `player` class, which is the class the "two real filters, no shared row" case uses.
 */
const REAL_ID = 'battle-cindril-j-front';

/*
 * A row with NO RAW FILE, CHOSEN AT RUNTIME — never a hard-coded id.
 *
 * "BINDS THE OTHER SIDE" needs a filter that selects a row the post-process then does no work on,
 * so it can read back `0 processed · 1 rows have no raw file yet`. That requires a row with nothing
 * at its `rawPathOf`, and which rows those are is LOCAL, UNCOMMITTED STATE: `assets/raw/**` is
 * gitignored, generation writes into it, and this test cannot see when that happens.
 *
 * It used to be spelled as a constant, and it was only ever right by accident — the old id was a
 * BACK sprite, and backs were never generated. Both substitutions available at the time were
 * already wrong: `battle-fenmaw-e-front` had a 4-byte scratch file another test in this suite
 * writes, and `battle-cindril-j-front` acquired a real 443 KB raw mid-run when the front batch
 * landed. Either one makes the CLI actually post-process, and the failure surfaces as an
 * unexplained crash inside sharp ("Input file contains unsupported image format") rather than as
 * anything about this test's fixture. So the row is SELECTED by the property the test needs, and
 * the selection is asserted to have found something.
 */
const NO_RAW_ROW = manifest.rows.find((r) => r.class !== 'player' && !existsSync(rawPathOf(manifest, r)));

/**
 * …AND THE OTHER HALF OF THAT PROPERTY, because a selection is only a selection when both answers
 * are available to it. `assets/raw/**` is gitignored (.gitignore:8), so A CLONE HAS NONE OF IT:
 * every non-player row qualifies, `find` returns the first one, and the fixture is picked by
 * position rather than by the property it names. The suite stayed green through that and said
 * nothing — the same silent degeneracy in CI that this file's `NO_RAW_ROW` comment was written to
 * prevent locally.
 *
 * THE SEPARATION IS BOUND TO SOMETHING TRACKED. Exactly one manifest row — `player-front` — points
 * its `file` at `assets/approved-trials/player-APPROVED.png`, which is committed. So there is a row
 * whose raw file exists in EVERY tree, clone included, and `existsSync ∘ rawPathOf` can be shown to
 * return both answers here rather than being assumed to. That is why `NO_RAW_ROW` excludes the
 * `player` class: it is the one class that would never satisfy the search.
 */
const TRACKED_RAW_ROW = manifest.rows.find((r) => r.file !== undefined && existsSync(rawPathOf(manifest, r)));

/** The rows `NO_RAW_ROW` actually searches, and the ones among them the generator has produced. */
const CANDIDATES_WITH_RAW = manifest.rows.filter((r) => r.class !== 'player' && existsSync(rawPathOf(manifest, r)));

/**
 * Every PNG sitting in a searched class's declared rawDir, whatever it happens to be named.
 *
 * The disambiguator for the clone case: "this tree has no generated art" and "`rawPathOf` names
 * something other than what the generator writes" produce the identical green above, and only one
 * of them is a working test.
 */
function rawArtOnDisk(): string[] {
  const out: string[] = [];
  for (const [name, spec] of Object.entries(manifest.classes)) {
    if (name === 'player') continue;
    const dir = resolve(REPO_ROOT, spec.rawDir);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (f.endsWith('.png')) out.push(`${spec.rawDir}/${f}`);
  }
  return out.sort();
}

describe('tools/postprocess/run.ts refuses a filter that selects no rows (BF-6)', () => {
  it('the fixture filters are real — this test is measuring a refusal, not a typo of its own', () => {
    expect(Object.keys(manifest.classes)).toContain(REAL_CLASS);
    expect(manifest.rows.some((r) => r.id === REAL_ID)).toBe(true);
    // …and the row used for the "both real, no overlap" case is genuinely NOT in the class used.
    expect(manifest.rows.find((r) => r.id === REAL_ID)!.class).not.toBe('player');
    // …and the run-path fixture really did find a row with no raw file. If every row has one, the
    // "does no work" case below is unrunnable and must say so, not quietly measure something else.
    expect(
      NO_RAW_ROW,
      'every non-player manifest row has a raw file on disk, so nothing can exercise the ' +
        '"filter matched, no work to do" path. Clear assets/raw/ or add a row.',
    ).toBeDefined();
    expect(existsSync(rawPathOf(manifest, NO_RAW_ROW!))).toBe(false);

    // …AND THE FIXTURE IS NOT DEGENERATE, whichever tree this is. See TRACKED_RAW_ROW.
    // First: the property really does have two answers here. In a clone every non-player row lacks
    // a raw, so `find` returns row 0 and discriminates nothing; without this, "no raw file" could be
    // a constant rather than a measurement and the whole file would still be green.
    expect(
      TRACKED_RAW_ROW,
      'no manifest row has a raw file that a clone carries. `player-front` is supposed to point its ' +
        '`file` at assets/approved-trials/player-APPROVED.png, which is committed — without it there ' +
        'is no tree in which `existsSync ∘ rawPathOf` is shown to answer BOTH ways, and every ' +
        '"no raw file yet" assertion below is unfalsifiable.',
    ).toBeDefined();
    expect(existsSync(rawPathOf(manifest, TRACKED_RAW_ROW!)), TRACKED_RAW_ROW!.id).toBe(true);

    // Second: if not one SEARCHED row has a raw, that must be because no generated art is on disk —
    // not because `rawPathOf` and the generator's naming have come apart. Those two states produce
    // the identical pass above, and only one of them leaves this file testing anything.
    if (CANDIDATES_WITH_RAW.length === 0) {
      expect(
        rawArtOnDisk(),
        'not one searched manifest row resolves to a file on disk, yet the classes’ own rawDirs hold ' +
          'PNGs. That is `rawPathOf` naming something other than what the generator writes — not an ' +
          'empty tree — and the fixture below is measuring nothing.',
      ).toEqual([]);
    }
  });

  it('“N rows have no raw file yet” is a FILESYSTEM answer — bound in a tree with no assets/raw at all', async () => {
    // WHY THIS EXISTS. In a clone every row is a no-raw row, so the case above and the case below
    // are the only ones this file can reach, and `processRow` could have stopped looking at the
    // disk entirely — returning `skipped` unconditionally — with the whole file still green. The
    // control produces BOTH answers for the SAME row, in a temp root the test owns, with nothing
    // changing between them but a file appearing. It runs identically in both trees because it
    // depends on no generator output at all.
    //
    // It calls the function rather than the CLI on purpose: `run.ts` takes no --root, so a
    // command-level control would have to write into the repo's own assets/raw and assets/final.
    const row = NO_RAW_ROW!;
    const root = await mkdtemp(join(tmpdir(), 'trophic-rawroot-'));
    try {
      const before = await processRow(manifest, row, { root });
      expect(before.skipped, `${row.id}: an empty root must report the row as having no raw file`).toBe('no-raw-file');
      expect(existsSync(finalPathOf(row, root)), 'a skipped row must not write a final asset').toBe(false);

      // The source is a real palette swatch — the one furthest from the white background key — so
      // quantize maps it to itself and no colour is invented here. Opaque and flat, so trim and the
      // background flood both have nothing to take.
      const [w, h] = row.targetSize.split('x').map(Number);
      const darkest = [...loadPalette()].sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b))[0]!;
      const src = blankRaster(w!, h!);
      for (let i = 0; i < src.data.length; i += 4) {
        src.data[i] = darkest.r;
        src.data[i + 1] = darkest.g;
        src.data[i + 2] = darkest.b;
        src.data[i + 3] = 255;
      }
      await writeRaster(rawPathOf(manifest, row, root), src);

      const after = await processRow(manifest, row, { root });
      expect(after.skipped, `${row.id}: a raw file is sitting at ${after.from} and the row was skipped anyway`).toBe(
        undefined,
      );
      expect(existsSync(finalPathOf(row, root)), 'a processed row must write its final asset').toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('a mistyped --class exits non-zero and names the near miss, instead of "0 processed" at exit 0', async () => {
    const r = await cli('--class=creature-batle', '--no-atlas');
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(3);
    expect(r.stderr).toMatch(/--class=creature-batle is not a class/);
    expect(r.stderr).toMatch(/Did you mean creature-battle/);
    // The exact shape of the old lie: a success line describing work that never happened.
    expect(r.stdout).not.toMatch(/processed/);
  });

  it('a mistyped --id exits non-zero and names the near miss', async () => {
    const r = await cli('--id=battle-fenmaw-e-fron', '--no-atlas');
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(3);
    expect(r.stderr).toMatch(/is not a row in tools\/comfy\/manifest\.json/);
    expect(r.stderr).toMatch(/Did you mean battle-fenmaw-e-front/);
    expect(r.stdout).not.toMatch(/processed/);
  });

  it('a COMBINATION of two real filters that share no row is refused too', async () => {
    // assertFiltersMatch checks each filter alone, so this pair walks past it: both names exist,
    // no row carries both. It is the same silent zero-row success by another route.
    const r = await cli('--class=player', `--id=${REAL_ID}`, '--no-atlas');
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(3);
    expect(r.stderr).toMatch(/no manifest row matches/);
    expect(r.stdout).not.toMatch(/processed/);
  });

  it('the `placeholders` subcommand is guarded on the same line, before it writes anything', async () => {
    // It shares the filter, so it shared the defect: `placeholders --class=<typo>` reported
    // "0 written, 0 skipped" and exited 0.
    const r = await cli('placeholders', '--class=creature-batle');
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(3);
    expect(r.stderr).toMatch(/Did you mean creature-battle/);
    expect(r.stdout).not.toMatch(/written/);
  });

  it('BINDS THE OTHER SIDE: a filter that DOES select a row still runs and still exits 0', async () => {
    // Without this the guard could be an unconditional refusal and every assertion above would
    // still pass. The row chosen has no raw file, so the run does no work and writes nothing —
    // and "0 processed" is the honest answer here precisely because a row matched.
    if (NO_RAW_ROW === undefined) throw new Error('no manifest row lacks a raw file — see the fixture test above');
    const r = await cli(`--id=${NO_RAW_ROW.id}`, '--no-atlas');
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toMatch(/0 processed · 1 rows have no raw file yet/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * BF-25 — the two placeholder helpers must agree on the NAME of a missing asset.
 *
 * `tools/postprocess/placeholder.ts` writes a PNG with the asset's name printed on it, in a colour
 * hashed from that name. `game/placeholder.ts` draws a canvas stand-in with the asset's name on it,
 * in a colour hashed from that name. If the two names differ, one missing asset has two identities
 * and two colours, and "which asset is missing?" gets a different answer off a screenshot than off
 * the built file. They DID differ: the offline side labelled by the manifest row id
 * (`battle-fenmaw-e-front`), the runtime side by the asset id (`creature-battle/battle-fenmaw-e-front`).
 *
 * This runs the two REAL functions over the whole manifest and over every node asset, rather than
 * restating the convention a third time here.
 * ════════════════════════════════════════════════════════════════════════════ */
describe('the offline and runtime placeholders name an asset the same way (BF-25)', () => {
  /** Every `assets/final/` path the SHIPPED DATA names — the route the game reaches an id by. */
  const nodeAssets = readdirSync(resolve(REPO_ROOT, 'data/nodes'))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const n = JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/nodes', f), 'utf8')) as {
        mapAsset: string;
        collisionMask: string;
      };
      return [n.mapAsset, n.collisionMask];
    });

  it('placeholder(finalFile) === assetId(finalFile) for every one of the manifest rows', () => {
    // The sweep is over the whole manifest. The floor was 200 and the manifest carried 205 rows;
    // cut line C-4 removed the 35 `dex-painted` rows, so a floor calibrated to the old count is now
    // unreachable. 150 is the same floor `tests/gates/asset-reachability.test.ts` uses for the same
    // purpose — proof the sweep is over a real corpus and not an empty array — and the sweep itself
    // is unchanged: it still covers EVERY row, whatever the count is.
    expect(manifest.rows.length).toBeGreaterThan(150);
    const disagree = manifest.rows
      .map((r) => ({ id: r.id, ours: placeholderLabel(r.finalFile), theirs: assetId(r.finalFile) }))
      .filter((x) => x.ours !== x.theirs);
    expect(disagree, `${disagree.length} rows name their own asset two ways`).toEqual([]);
  });

  it('…and the label is NOT simply the row id — the divergence being closed was real', () => {
    const row = manifest.rows.find((r) => r.id === REAL_ID)!;
    expect(placeholderLabel(row.finalFile)).toBe(assetId(row.finalFile));
    expect(placeholderLabel(row.finalFile)).not.toBe(row.id);
    expect(placeholderLabel(row.finalFile)).toContain('/');
  });

  it('agreeing on the string means agreeing on the SWATCH, because both hash it the same way', () => {
    // The offline side picks `palette[hashSeed(0, label) % n]` (core/rng.ts's FNV-1a). The runtime
    // side runs its own `hash32`, which is that function at save seed 0. Measured through both.
    const rgb = loadPalette();
    const file = loadPaletteFile();
    for (const r of manifest.rows.slice(0, 40)) {
      const label = placeholderLabel(r.finalFile);
      const ours = rgb[hashSeed(0, label) % rgb.length]!.hex.toLowerCase();
      expect(placeholderHex(assetId(r.finalFile), file).toLowerCase(), `${r.id}`).toBe(ours);
    }
  });

  it('neither header claims to be the only placeholder helper any more', () => {
    // Both files opened with a sentence saying it was "the one"/"the ONE" such helper while the
    // other sat beside it unmentioned. Asserted on the source, because the defect WAS the prose.
    const tools = readFileSync(resolve(REPO_ROOT, 'tools/postprocess/placeholder.ts'), 'utf8').slice(0, 3000);
    const game = readFileSync(resolve(REPO_ROOT, 'game/placeholder.ts'), 'utf8').slice(0, 3000);
    expect(tools).toMatch(/THERE ARE TWO PLACEHOLDER HELPERS/);
    expect(game).toMatch(/THERE ARE TWO PLACEHOLDER HELPERS/);
    expect(tools).toContain('game/placeholder.ts');
    expect(game).toContain('tools/postprocess/placeholder.ts');
  });

  it('…and they agree on the OTHER route into an id: the paths data/nodes/*.json name', () => {
    expect(nodeAssets.length).toBeGreaterThanOrEqual(24); // 12 nodes × mapAsset + collisionMask
    for (const p of nodeAssets) expect(placeholderLabel(p), p).toBe(assetId(p));
  });

  /*
   * BINDS THE WRITER, which is the only thing above that the PRODUCTION fix touched.
   *
   * Everything before this compares `placeholderLabel` with `assetId`. `writePlaceholders` is under
   * no obligation to call either: it used to pass `row.id` straight into `makePlaceholder`, and
   * reverting it to `row.id` leaves every assertion above green (measured). So this runs the real
   * writer into a temp root and reads the PNG back.
   *
   * The observable is the BLOCK COLOUR. `makePlaceholder` fills with `palette[hashSeed(0, label)]`,
   * so the pixel is a one-way function of the exact string the writer used — there is no way to get
   * the asset-id colour out of a row-id label. Every row hashes to a different swatch under the two
   * conventions, so the negative half of this can never pass by collision.
   */
  it('BINDS THE WRITER: writePlaceholders colours the PNG by the ASSET ID, not by the row id', async () => {
    const row = manifest.rows.find((r) => r.id === REAL_ID)!;
    const file = loadPaletteFile();
    const byAssetId = placeholderHex(assetId(row.finalFile), file).toLowerCase();
    const byRowId = placeholderHex(row.id, file).toLowerCase();
    expect(byAssetId, 'this row cannot tell the two conventions apart — pick another').not.toBe(byRowId);

    const tmp = await mkdtemp(join(tmpdir(), 'trophic-placeholders-'));
    try {
      const report = await writePlaceholders(manifest, (r) => r.id === REAL_ID, { force: true, root: tmp });
      expect(report.written).toEqual([finalPathOf(row, tmp)]);

      const raster = await readRaster(finalPathOf(row, tmp));
      // The fill is every pixel that is not the border or a glyph — i.e. the commonest colour.
      const tally = new Map<string, number>();
      for (let i = 0; i < raster.data.length; i += 4) {
        const hex = `#${[0, 1, 2].map((k) => raster.data[i + k]!.toString(16).padStart(2, '0')).join('')}`;
        tally.set(hex, (tally.get(hex) ?? 0) + 1);
      }
      const fill = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0];

      expect(fill, `the writer laid down ${fill}; the asset-id colour is ${byAssetId}`).toBe(byAssetId);
      expect(fill).not.toBe(byRowId);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
