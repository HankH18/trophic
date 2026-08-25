/**
 * tools/postprocess/palette.ts — the live read of data/palette.json (build-doc §8.4).
 *
 * WHY THIS IS A DISK READ AND NOT AN IMPORT. `data/palette.json` ships with
 * `"frozen": false` and 32 placeholder hexes; the real palette is k-means over the approved trial
 * set and is frozen at gate B0 (§8.4, §15). The file's own header states the contract: "The freeze
 * is a VALUE SWAP, not a schema change… Ids c00–c31 are stable across the freeze." So the quantize
 * step reads the file at call time. Freezing the palette is then editing one JSON file and
 * re-running `npm run postprocess` — no code change, no rebuild, nothing to forget.
 *
 * `paletteIsFrozen()` exists so a batch runner can SAY that it is quantizing against placeholders
 * instead of letting a reviewer assume the colours are final. An unfrozen palette is not an error —
 * B1 has to run before B0's freeze — it is a fact the operator must be told.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PaletteFile } from '../../core/types.ts';

/** Repo root, resolved from this file so the tools work from any cwd. */
export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

export const PALETTE_PATH = resolve(REPO_ROOT, 'data/palette.json');

export interface PaletteRgb {
  id: string;
  hex: string;
  r: number;
  g: number;
  b: number;
}

export class PaletteError extends Error {}

const HEX = /^#([0-9a-fA-F]{6})$/;

export function parseHex(hex: string): { r: number; g: number; b: number } {
  const m = HEX.exec(hex);
  if (!m) throw new PaletteError(`palette: "${hex}" is not a #rrggbb colour`);
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Read data/palette.json from disk. No caching — see the header. */
export function loadPaletteFile(path: string = PALETTE_PATH): PaletteFile {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as PaletteFile;
  if (!Array.isArray(raw.colors) || raw.colors.length === 0) {
    throw new PaletteError(`${path}: no colors[]`);
  }
  if (raw.colors.length !== raw.colorCount) {
    throw new PaletteError(`${path}: colorCount ${raw.colorCount} but ${raw.colors.length} colors`);
  }
  return raw;
}

/** The palette as RGB triples, in file order — quantize ties break to the lowest index. */
export function loadPalette(path: string = PALETTE_PATH): PaletteRgb[] {
  return loadPaletteFile(path).colors.map((c) => ({ id: c.id, hex: c.hex, ...parseHex(c.hex) }));
}

export function paletteIsFrozen(path: string = PALETTE_PATH): boolean {
  return loadPaletteFile(path).frozen === true;
}

/** One line for the batch runner's banner, so nobody mistakes placeholders for the frozen set. */
export function paletteBanner(path: string = PALETTE_PATH): string {
  const p = loadPaletteFile(path);
  return p.frozen
    ? `palette: ${p.colorCount} colours, FROZEN ${p.frozenAt ?? '(no date)'} — ${p.source}`
    : `palette: ${p.colorCount} colours, NOT FROZEN (gate B0 pending) — ${p.source}`;
}
