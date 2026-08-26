/**
 * tools/postprocess/run.ts — CLI for build-doc §9.3 (`npm run postprocess`).
 *
 *   npx tsx tools/postprocess/run.ts [--class=C] [--id=I] [--no-atlas]
 *       Post-process every manifest row whose raw file exists, then pack the class atlases.
 *
 *   npx tsx tools/postprocess/run.ts placeholders [--class=C] [--force]
 *       Write an honest placeholder (flat block + asset id) to every row's finalFile that has no
 *       real art yet, so Lane C has a file at every path the data already references. Never
 *       overwrites a real asset: a row whose raw file exists is skipped unless --force.
 *
 * Re-running is always safe and always starts from assets/raw/ — see chain.ts's header for the
 * precise statement of what "idempotent" does and does not mean here.
 *
 * `--class` / `--id` are checked against the manifest before anything runs: a filter that matches
 * no class and no row is refused (exit 3, with the near miss named), never reported as a run of
 * zero images that succeeded.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadPalette, paletteBanner, REPO_ROOT } from './palette.ts';
import { classOf, finalPathOf, processRow, rawPathOf, recipeFor } from './chain.ts';
import { readRaster, writeRaster } from './raster.ts';
import { atlasDescriptor, packAtlas, type AtlasEntry } from './atlas.ts';
import { makePlaceholder, placeholderLabel } from './placeholder.ts';
import type { ManifestFile, ManifestRow } from '../comfy/comfy-batch.ts';
import { assertFiltersMatch, isGuardrail, loadManifest, ManifestError } from '../comfy/comfy-batch.ts';

const ATLAS_DIR = 'assets/final/atlas';

export interface AtlasReport {
  group: string;
  count: number;
  image: string;
  json: string;
}

/** Pack every class group that declares an atlas and has at least one finished asset. */
export async function packAtlases(m: ManifestFile, root = REPO_ROOT): Promise<AtlasReport[]> {
  const groups = new Map<string, ManifestRow[]>();
  for (const row of m.rows) {
    const group = classOf(m, row.class).postprocess.atlas;
    if (!group) continue;
    if (!existsSync(finalPathOf(row, root))) continue;
    const bucket = groups.get(group) ?? [];
    bucket.push(row);
    groups.set(group, bucket);
  }
  const reports: AtlasReport[] = [];
  for (const group of [...groups.keys()].sort()) {
    const rows = groups.get(group)!;
    const entries: AtlasEntry[] = [];
    for (const row of rows) entries.push({ id: row.id, raster: await readRaster(finalPathOf(row, root)) });
    // 1024 is the generator's own frame size (balance.map.mapNativePx) — a natural, already-used bound.
    const atlas = packAtlas(entries, { maxWidth: 1024, padding: 1 });
    const image = resolve(root, `${ATLAS_DIR}/${group}.png`);
    const json = resolve(root, `${ATLAS_DIR}/${group}.json`);
    await writeRaster(image, atlas.image);
    await mkdir(dirname(json), { recursive: true });
    await writeFile(json, atlasDescriptor(atlas, `${ATLAS_DIR}/${group}.png`), 'utf8');
    reports.push({ group, count: entries.length, image, json });
  }
  return reports;
}

export interface PlaceholderReport {
  written: string[];
  skipped: string[];
}

export async function writePlaceholders(
  m: ManifestFile,
  filter: (r: ManifestRow) => boolean,
  opts: { force: boolean; root?: string } = { force: false },
): Promise<PlaceholderReport> {
  const root = opts.root ?? REPO_ROOT;
  const palette = loadPalette();
  const report: PlaceholderReport = { written: [], skipped: [] };
  for (const row of m.rows) {
    if (!filter(row)) continue;
    const dest = finalPathOf(row, root);
    if (!opts.force && existsSync(rawPathOf(m, row, root))) {
      report.skipped.push(row.id);
      continue;
    }
    const recipe = recipeFor(classOf(m, row.class), row);
    // The label is derived from `finalFile`, NOT from `row.id`: the game's stand-in for a missing
    // asset names it by the same convention (game/placeholder.ts `assetId`), and a reviewer must
    // read one name for one asset whether they are looking at a built file or a screenshot.
    const label = placeholderLabel(row.finalFile);
    await writeRaster(dest, makePlaceholder(label, recipe.targetW, recipe.targetH, { palette }));
    report.written.push(dest);
  }
  return report;
}

function isEntrypoint(): boolean {
  const argv1 = process.argv[1];
  return argv1 !== undefined && resolve(argv1) === resolve(fileURLToPath(import.meta.url));
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flag = (k: string): boolean => argv.includes(`--${k}`);
  const opt = (k: string): string | undefined => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const m = await loadManifest();
  const cls = opt('class');
  const id = opt('id');
  // A filter that matches NOTHING is a typo, not a finished run. `--class=creature-batle` used to
  // print "0 processed · 0 rows have no raw file yet" and exit 0 — success, with zero images
  // post-processed and no way for an unattended run to tell. Same guard, same message, same
  // "did you mean" as the generator side (comfy-batch.ts's `run`), because it is the same mistake.
  assertFiltersMatch(m, { ...(cls === undefined ? {} : { class: cls }), ...(id === undefined ? {} : { id }) });
  const matches = (r: ManifestRow) => (!cls || r.class === cls) && (!id || r.id === id);
  // …and `assertFiltersMatch` checks each filter on its own, so a COMBINATION that selects nothing
  // (`--class=player --id=battle-fenmaw-e-front` — both real, never the same row) still walks
  // straight past it into the same silent zero-row success. The row count is the thing that has to
  // be non-zero, so that is what is asserted.
  const selected = m.rows.filter(matches);
  if (selected.length === 0) {
    throw new ManifestError(
      `no manifest row matches ${[cls === undefined ? '' : `--class=${cls}`, id === undefined ? '' : `--id=${id}`]
        .filter(Boolean)
        .join(' ')} — every filter names something real, but no single row satisfies all of them.\n` +
        '  Drop one of them, or run `npx tsx tools/comfy/comfy-batch.ts status` to see what exists by class.',
    );
  }

  console.log(paletteBanner());

  if (argv[0] === 'placeholders') {
    const rep = await writePlaceholders(m, matches, { force: flag('force') });
    console.log(`placeholders: ${rep.written.length} written, ${rep.skipped.length} skipped (real raw art present)`);
    return 0;
  }

  let done = 0;
  let missing = 0;
  for (const row of selected) {
    const res = await processRow(m, row);
    if (res.skipped) {
      missing++;
      continue;
    }
    done++;
    console.log(`  ${row.id.padEnd(34)} ${row.targetSize.padEnd(9)} -> ${row.finalFile}`);
  }
  console.log(`\n${done} processed · ${missing} rows have no raw file yet`);

  if (!flag('no-atlas')) {
    for (const a of await packAtlases(m)) console.log(`atlas ${a.group.padEnd(10)} ${a.count} frames -> ${a.image}`);
  }
  return 0;
}

if (isEntrypoint()) {
  try {
    process.exitCode = await main();
  } catch (e) {
    // A refusal is an expected outcome, not a crash — print what the operator needs to fix the
    // command and stop. Exit 3 matches comfy-batch.ts so a script wrapping either tool reads the
    // same code for the same class of answer. A stack trace here would read as a bug in the tool.
    if (e instanceof Error && isGuardrail(e)) {
      console.error(`\n${e.message}\n`);
      process.exitCode = 3;
    } else {
      throw e;
    }
  }
}
