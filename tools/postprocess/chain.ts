/**
 * tools/postprocess/chain.ts — build-doc §9.3's chain, assembled per asset class.
 *
 *   Per sprite: trim (LB-M3) → nearest-neighbour downscale to target → quantize to palette.json
 *               → background removal → (atlas, run once per class in `run.ts`)
 *   Maps:       downscale to 1024² retained, quantize, NO background removal.
 *   Painted dex: retained as generated — §9.3 prescribes no chain for a watercolour, and the
 *               32-colour pixel palette would eat it.
 *
 * The per-class recipe is DATA: it lives on `classes.<name>.postprocess` in tools/comfy/manifest.json,
 * beside the prompt skeleton and the target size that produced the asset. That is deliberate — the
 * alternative is a `switch (class)` here, which is a second place the class list has to be kept in
 * step with the manifest, and it would drift the first time someone adds a class.
 *
 * WHAT "IDEMPOTENT AND RE-RUNNABLE FROM raw/" MEANS HERE — stated precisely, because the loose
 * reading is wrong and would be reassuring:
 *
 *   ✓ every STEP is idempotent: step(step(x)) === step(x), byte for byte (see steps.ts, and
 *     tests/unit/postprocess.test.ts asserts it for each one);
 *   ✓ the CHAIN re-run from `assets/raw/` is byte-identical, however many times it is run — it is
 *     a pure function of the raw file, and `processRow` reads nothing else;
 *   ✗ the chain is NOT a fixed point over its own OUTPUT, and must not be pointed at
 *     `assets/final/`. A finished sprite has a transparent border; feeding it back in would trim
 *     that border away and re-fit the subject to fill the frame, zooming a little further on every
 *     pass. `processRow` refuses when source and destination are the same path, and the source is
 *     always the row's raw file.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Raster } from './raster.ts';
import { readRaster, writeRaster } from './raster.ts';
import type { Rgb } from './steps.ts';
import { nearestResample, fitResample, quantize, removeFlatBackground, trimBackground } from './steps.ts';
import { loadPalette, parseHex, REPO_ROOT, type PaletteRgb } from './palette.ts';
import type { ClassSpec, ManifestFile, ManifestRow } from '../comfy/comfy-batch.ts';

export class ChainError extends Error {}

export interface ChainRecipe {
  trim: boolean;
  fit: boolean;
  quantize: boolean;
  removeBackground: boolean;
  atlas: string | null;
  backgroundTolerance: number;
  backgroundKey: Rgb;
  targetW: number;
  targetH: number;
}

export function recipeFor(spec: ClassSpec, row?: ManifestRow): ChainRecipe {
  const size = row?.targetSize ?? `${spec.targetW}x${spec.targetH}`;
  const [w, h] = size.split('x').map(Number);
  if (!Number.isInteger(w) || !Number.isInteger(h) || !w || !h) {
    throw new ChainError(`bad targetSize "${size}"${row ? ` on row ${row.id}` : ''}`);
  }
  return {
    trim: spec.postprocess.trim,
    fit: spec.postprocess.fit,
    quantize: spec.postprocess.quantize,
    removeBackground: spec.postprocess.removeBackground,
    atlas: spec.postprocess.atlas,
    backgroundTolerance: spec.postprocess.backgroundTolerance,
    backgroundKey: parseHex(spec.postprocess.backgroundKey),
    targetW: w,
    targetH: h,
  };
}

/** The whole chain as one pure function of the raw raster. */
export function processRaster(src: Raster, recipe: ChainRecipe, palette: readonly PaletteRgb[]): Raster {
  const bg = { key: recipe.backgroundKey, tolerance: recipe.backgroundTolerance };
  let out = src;
  if (recipe.trim) out = trimBackground(out, bg);
  out = recipe.fit
    ? fitResample(out, recipe.targetW, recipe.targetH)
    : nearestResample(out, recipe.targetW, recipe.targetH);
  if (recipe.quantize) out = quantize(out, palette);
  if (recipe.removeBackground) out = removeFlatBackground(out, bg);
  return out;
}

export interface ProcessOptions {
  palette?: readonly PaletteRgb[];
  /** Absolute-path override, so the tests never write into assets/. */
  root?: string;
}

export interface ProcessResult {
  row: ManifestRow;
  from: string;
  to: string;
  skipped?: 'no-raw-file';
}

export function classOf(m: ManifestFile, name: string): ClassSpec {
  const c = m.classes[name];
  if (!c) throw new ChainError(`manifest.classes has no "${name}"`);
  return c;
}

export function rawPathOf(m: ManifestFile, row: ManifestRow, root = REPO_ROOT): string {
  return resolve(root, row.file ?? `${classOf(m, row.class).rawDir}/${row.id}.png`);
}

export function finalPathOf(row: ManifestRow, root = REPO_ROOT): string {
  return resolve(root, row.finalFile);
}

/** Post-process one manifest row from assets/raw/ to assets/final/. */
export async function processRow(m: ManifestFile, row: ManifestRow, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const root = opts.root ?? REPO_ROOT;
  const from = rawPathOf(m, row, root);
  const to = finalPathOf(row, root);
  if (from === to) {
    throw new ChainError(
      `${row.id}: raw and final resolve to the same path (${from}). The chain is not a fixed point ` +
        `over its own output — see this file's header — so it must never be pointed at assets/final/.`,
    );
  }
  if (!existsSync(from)) return { row, from, to, skipped: 'no-raw-file' };
  const palette = opts.palette ?? loadPalette();
  const recipe = recipeFor(classOf(m, row.class), row);
  const out = processRaster(await readRaster(from), recipe, palette);
  await writeRaster(to, out);
  return { row, from, to };
}

/** Rows whose raw file exists, in manifest order. */
export function processableRows(
  m: ManifestFile,
  filter: (r: ManifestRow) => boolean = () => true,
  root = REPO_ROOT,
): ManifestRow[] {
  return m.rows.filter((r) => filter(r) && existsSync(rawPathOf(m, r, root)));
}
