/**
 * tests/unit/postprocess-run.test.ts — the §9.3 CLI refuses a filter that selects nothing.
 *
 * This binds the REAL COMMAND, as a child process, and not the guard function. That distinction is
 * the whole point of the file: `assertFiltersMatch` already existed and was already tested at
 * `tests/unit/manifest.test.ts` ("a filter that matches nothing is a typo, not a finished batch",
 * B-D47) while `tools/postprocess/run.ts` never called it. Reproduced before the fix:
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
import { finalPathOf } from '../../tools/postprocess/chain.ts';
import { readRaster } from '../../tools/postprocess/raster.ts';
import { placeholderLabel } from '../../tools/postprocess/placeholder.ts';
import { assetId, placeholderHex } from '@game/placeholder';
import { readdirSync, readFileSync } from 'node:fs';
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
const REAL_ID = 'battle-fenmaw-e-back';

describe('tools/postprocess/run.ts refuses a filter that selects no rows (BF-6)', () => {
  it('the fixture filters are real — this test is measuring a refusal, not a typo of its own', () => {
    expect(Object.keys(manifest.classes)).toContain(REAL_CLASS);
    expect(manifest.rows.some((r) => r.id === REAL_ID)).toBe(true);
    // …and the row used for the "both real, no overlap" case is genuinely NOT in the class used.
    expect(manifest.rows.find((r) => r.id === REAL_ID)!.class).not.toBe('player');
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
    const r = await cli(`--id=${REAL_ID}`, '--no-atlas');
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
    expect(manifest.rows.length).toBeGreaterThan(200); // the sweep is over the whole manifest
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
   * the asset-id colour out of a row-id label. All 288 rows hash to different swatches under the two
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
