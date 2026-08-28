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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadPalette, paletteBanner, REPO_ROOT } from './palette.ts';
import { classOf, finalPathOf, processRow, rawPathOf, recipeFor } from './chain.ts';
import { readRaster, writeRaster } from './raster.ts';
import { atlasDescriptor, packAtlas, type AtlasEntry } from './atlas.ts';
import { isStandInRaster, makePlaceholder, placeholderLabel } from './placeholder.ts';
import type { ManifestFile, ManifestRow } from '../comfy/comfy-batch.ts';
import { assertFiltersMatch, isGuardrail, loadManifest, ManifestError } from '../comfy/comfy-batch.ts';

/**
 * WHERE THE PACKED SHEETS GO — AND WHY IT IS NOT `assets/final/`.
 *
 * This was `assets/final/atlas` and that was the whole defect. `assets/final/` is the COMMITTED
 * home for finished art (build-doc §5), so writing build artefacts into it made four packed sheets
 * (~104KB of PNG plus a descriptor each) tracked files that:
 *
 *   · registered as ordinary art in `game/placeholder.ts`'s glob, so `BootScene.preload` downloaded
 *     and GPU-uploaded every one on every boot ON TOP OF the individual PNGs they pack — drawn by
 *     nothing, because no `textureFor` call in `game/` names an `atlas/*` id;
 *   · survived the fix for that. Subtracting `atlas/` from the glob stopped the BOOT DOWNLOAD and
 *     nothing else: `tools/sync-assets.mjs` copies `assets/final/` wholesale into `public/assets/`
 *     and `vite.config.ts`'s `publicDir` copies that into `dist/`, so the sheets were still
 *     published to Pages, unhashed and unreferenced, on every deploy;
 *   · were invisible to `tests/gates/asset-reachability.test.ts` GATE 2a/2c, which walk manifest
 *     CLASSES and ROWS — a sheet has no row — and so had to be caught by GATE 2d, which walks the
 *     shipping root and asks what claims each file. Nothing claimed them, and that red stood.
 *
 * `build/` is gitignored, is not the shipping root, and is not copied anywhere. A sheet is a build
 * artefact, not art, so it belongs there. The day the packing lane emits a Phaser-format descriptor
 * whose frames are `assetId()` keys and something LOADS it on purpose, the loader decides where its
 * input lives; until then nothing reads these, and nothing should pay to ship them.
 */
export const ATLAS_DIR = 'build/atlas';

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

/* ────────────────────────────────────────────────────────────────────────────
 * The stand-in declaration — written by the thing that writes the placeholders
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHY THIS FUNCTION EXISTS AT ALL, AND WHY THE FILE IS NOT BESIDE THE PNGs
 * ─────────────────────────────────────────────────────────────────────────────
 * A placeholder makes a file EXIST, and existence is what several readouts count — the palette
 * gate's coverage advisory prints `N/M built` off `existsSync`, and `game/placeholder.ts`'s
 * stand-in census goes quiet the moment the loader has a texture. So a placeholder that erases
 * the record of being a placeholder is worse than no placeholder at all, and the record is
 * `stand-ins.json`: `game/placeholder.ts` globs it at BUILD time (a bundle cannot decode pixels to
 * decide) and refuses to register anything it lists as real art.
 *
 * TWO THINGS WERE WRONG WITH THAT RECORD AND BOTH ARE FIXED HERE.
 *
 *   1. NOTHING WROTE IT. `writePlaceholders` created exactly the files that must be declared and
 *      declared none of them; the list was hand-authored and hand-maintained, which is how a
 *      register that has to be exactly right ends up depending on whoever remembered.
 *      `tests/gates/stand-in-declaration.test.ts` caught a wrong list AFTER the fact — good, but
 *      the writer is the only place that can be right by construction.
 *   2. IT LIVED INSIDE AN ASSET CLASS (`assets/final/dex-painted/stand-ins.json`), so deleting
 *      that class — cut line C-4 — took the repository's whole placeholder register with it.
 *      Scope of the question is the shipping tree, so scope of the file is the shipping tree.
 *
 * The `_`-prefixed keys of an existing declaration are AUTHORED and are preserved verbatim; only
 * `standIns` is derived. Derivation is by the same measurement the gate makes — a PNG is a
 * placeholder exactly when its bytes are what `makePlaceholder` produces for its own path, size
 * and the frozen palette — so a re-freeze of the palette drops stale entries rather than leaving
 * them asserted, and the gate is still an INDEPENDENT read of the committed file against the
 * committed pixels rather than a restatement of this function.
 * ──────────────────────────────────────────────────────────────────────────── */

const SHIPPING_ROOT = 'assets/final';
/** The declaration's basename, matched by `game/placeholder.ts`'s glob. Named once. */
const DECLARATION_FILE = 'stand-ins.json';

function pngsUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...pngsUnder(abs));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) found.push(abs);
  }
  return found;
}

export interface DeclarationReport {
  /** Repo-relative path of the declaration written. */
  file: string;
  /** Every asset id measured to be a generated placeholder, sorted. */
  standIns: string[];
}

/** Re-derive `assets/final/stand-ins.json` from the pixels that are actually on disk. */
export async function writeStandInDeclaration(root = REPO_ROOT): Promise<DeclarationReport> {
  const palette = loadPalette();
  const shipped = resolve(root, SHIPPING_ROOT);
  const ids: string[] = [];
  for (const abs of pngsUnder(shipped)) {
    const path = relative(root, abs).split('\\').join('/');
    const label = placeholderLabel(path);
    if (isStandInRaster(await readRaster(abs), label, palette)) ids.push(label);
  }
  ids.sort();

  const dest = resolve(shipped, DECLARATION_FILE);
  // Keep whatever prose the committed declaration carries: this function owns the LIST, not the
  // record of why the file exists. A fresh tree gets a pointer rather than an unexplained array.
  let doc: Record<string, unknown> = {
    _what: `Generated placeholders under ${SHIPPING_ROOT}/ — NOT art. Written by ` +
      'tools/postprocess/run.ts `placeholders`; verified against the pixels by ' +
      'tests/gates/stand-in-declaration.test.ts; read at build time by game/placeholder.ts, which ' +
      'refuses to register anything listed here as real art.',
  };
  if (existsSync(dest)) {
    const parsed = JSON.parse(readFileSync(dest, 'utf8')) as Record<string, unknown>;
    doc = Object.fromEntries(Object.entries(parsed).filter(([k]) => k.startsWith('_')));
  }
  await mkdir(shipped, { recursive: true });
  await writeFile(dest, `${JSON.stringify({ ...doc, standIns: ids }, null, 2)}\n`, 'utf8');
  return { file: `${SHIPPING_ROOT}/${DECLARATION_FILE}`, standIns: ids };
}

export interface PlaceholderReport {
  written: string[];
  skipped: string[];
  /** The declaration reconciled after the write — see {@link writeStandInDeclaration}. */
  declared: DeclarationReport;
}

export async function writePlaceholders(
  m: ManifestFile,
  filter: (r: ManifestRow) => boolean,
  opts: { force: boolean; root?: string } = { force: false },
): Promise<PlaceholderReport> {
  const root = opts.root ?? REPO_ROOT;
  const palette = loadPalette();
  const written: string[] = [];
  const skipped: string[] = [];
  for (const row of m.rows) {
    if (!filter(row)) continue;
    const dest = finalPathOf(row, root);
    if (!opts.force && existsSync(rawPathOf(m, row, root))) {
      skipped.push(row.id);
      continue;
    }
    const recipe = recipeFor(classOf(m, row.class), row);
    // The label is derived from `finalFile`, NOT from `row.id`: the game's stand-in for a missing
    // asset names it by the same convention (game/placeholder.ts `assetId`), and a reviewer must
    // read one name for one asset whether they are looking at a built file or a screenshot.
    const label = placeholderLabel(row.finalFile);
    await writeRaster(dest, makePlaceholder(label, recipe.targetW, recipe.targetH, { palette }));
    written.push(dest);
  }
  // Declared in the SAME ACT that writes them. A run filtered by --class still reconciles the whole
  // tree, because a per-class refresh would silently drop every other class's entries.
  return { written, skipped, declared: await writeStandInDeclaration(root) };
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
    console.log(
      `${rep.declared.file}: ${rep.declared.standIns.length} id(s) declared — every PNG under ` +
        `${SHIPPING_ROOT}/ whose bytes are what makePlaceholder produces for its own path`,
    );
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
