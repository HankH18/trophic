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
import { makePlaceholder } from './placeholder.ts';
import type { ManifestFile, ManifestRow } from '../comfy/comfy-batch.ts';
import { loadManifest } from '../comfy/comfy-batch.ts';

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
    await writeRaster(dest, makePlaceholder(row.id, recipe.targetW, recipe.targetH, { palette }));
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
  const matches = (r: ManifestRow) => (!cls || r.class === cls) && (!id || r.id === id);

  console.log(paletteBanner());

  if (argv[0] === 'placeholders') {
    const rep = await writePlaceholders(m, matches, { force: flag('force') });
    console.log(`placeholders: ${rep.written.length} written, ${rep.skipped.length} skipped (real raw art present)`);
    return 0;
  }

  let done = 0;
  let missing = 0;
  for (const row of m.rows) {
    if (!matches(row)) continue;
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
  process.exitCode = await main();
}
