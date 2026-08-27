/**
 * tools/mapgen/paths.ts — where the artefacts live.
 *
 * The `.txt` layouts are SOURCE and sit under `tools/mapgen/layouts/`. The PNGs are OUTPUT and sit
 * under `assets/raw/_layouts/`, which `.gitignore` excludes — they are regenerable from the source
 * by definition, and a 1024² PNG per node per run is not a thing to keep in history.
 *
 * NOTHING HERE WRITES TO `assets/final/maps/`. That path is where `data/nodes/*.json`
 * `collisionMask` points, and two shipped tests currently assert that not one of those twelve files
 * exists (tests/unit/overlay-diff.test.ts, tests/unit/manifest.test.ts) — deliberately, so that the
 * day a real mask is authored someone has to re-measure the Hard Req 5 gate against it. Promoting a
 * mask into `assets/final/` is that decision being taken, and it is not this tool's to take.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAPGEN_DIR = fileURLToPath(new URL('.', import.meta.url));
export const REPO_ROOT = resolve(MAPGEN_DIR, '../..');

/** The authored `.txt` layouts — one per node, hand-editable, committed. */
export const LAYOUT_DIR = resolve(MAPGEN_DIR, 'layouts');

/** Rendered output. Git-ignored; regenerate with `npx tsx tools/mapgen/run.ts render`. */
export const OUTPUT_DIR = resolve(REPO_ROOT, 'assets/raw/_layouts');
export const MASK_DIR = resolve(OUTPUT_DIR, 'masks');
export const CONTACT_SHEET = resolve(OUTPUT_DIR, '_CONTACT-SHEET.png');

export const layoutPath = (nodeId: string): string => resolve(LAYOUT_DIR, `${nodeId}.txt`);
export const controlPath = (nodeId: string): string => resolve(OUTPUT_DIR, `control-${nodeId}.png`);
export const maskPath = (nodeId: string): string => resolve(MASK_DIR, `mask-${nodeId}.png`);
