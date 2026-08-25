/**
 * tools/postprocess/placeholder.ts — the one honest-placeholder helper.
 *
 * Real generated art exists for exactly two things right now: the gate-B0 player sweep
 * (assets/raw/b0/) and the five approved style trials. Everything else in the 288-row manifest is
 * UNBUILT. Lane C still needs a file at the right path and the right size for every one of them, so
 * this generates one — and it generates something that could never be mistaken for finished art:
 * a flat block of colour, a hard border, and the asset id written across it in a 3×5 bitmap font.
 *
 * Two rules this file exists to enforce:
 *   · NEVER fake art by stretching an unrelated trial image. A stretched trial looks plausible in a
 *     screenshot, which means it survives review and then ships.
 *   · NEVER let a placeholder look finished. If it is not obviously a placeholder at a glance in the
 *     running game, it will be counted as done.
 *
 * The font is built in rather than drawn through sharp's SVG/text path on purpose: SVG text renders
 * through the host's font stack, so the same command on two machines produces different bytes, and
 * a placeholder that changes under `git status` is noise forever.
 */
import type { Raster } from './raster.ts';
import { blankRaster, idx } from './raster.ts';
import { hashSeed } from '../../core/rng.ts';
import type { PaletteRgb } from './palette.ts';

/** 3×5 glyphs, five rows of three bits each. Unknown characters fall back to `?`. */
const GLYPHS: Record<string, string> = {
  A: '111101111101101', B: '110101110101110', C: '111100100100111', D: '110101101101110',
  E: '111100111100111', F: '111100111100100', G: '111100101101111', H: '101101111101101',
  I: '111010010010111', J: '001001001101111', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '111101101101111', P: '111101111100100',
  Q: '111101101111001', R: '111101110101101', S: '111100111001111', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001',
  '8': '111101111101111', '9': '111101111001111',
  '-': '000000111000000', '.': '000000000000010', '/': '001001010100100', ' ': '000000000000000',
  '?': '111001010000010',
};

const GLYPH_W = 3;
const GLYPH_H = 5;
const GLYPH_GAP = 1;

/** Largest integer font scale (1–4) at which the WHOLE label still fits in the block. */
export function fontScale(label: string, width: number, height: number): number {
  for (let scale = 4; scale > 1; scale--) {
    const lines = wrapLabel(label, width, scale).length;
    if (lines * (GLYPH_H + GLYPH_GAP) * scale <= height - 2) return scale;
  }
  return 1;
}

export interface PlaceholderOptions {
  /** Palette to draw from, so placeholders sit inside the project's colour world while still reading as blocks. */
  palette: readonly PaletteRgb[];
  /** Text drawn on the block. Defaults to the id. */
  label?: string;
}

function put(r: Raster, x: number, y: number, c: PaletteRgb): void {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
  const i = idx(r, x, y);
  r.data[i] = c.r;
  r.data[i + 1] = c.g;
  r.data[i + 2] = c.b;
  r.data[i + 3] = 255;
}

function drawGlyph(r: Raster, ch: string, x: number, y: number, c: PaletteRgb, scale: number): void {
  const bits = GLYPHS[ch] ?? GLYPHS['?']!;
  for (let gy = 0; gy < GLYPH_H; gy++) {
    for (let gx = 0; gx < GLYPH_W; gx++) {
      if (bits[gy * GLYPH_W + gx] !== '1') continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) put(r, x + gx * scale + sx, y + gy * scale + sy, c);
      }
    }
  }
}

/** Greedy wrap on the character grid — no hyphenation, no measuring, nothing to get subtly wrong. */
export function wrapLabel(label: string, width: number, scale = 1): string[] {
  const cell = (GLYPH_W + GLYPH_GAP) * scale;
  const perLine = Math.max(1, Math.floor((width - 2 + GLYPH_GAP * scale) / cell));
  const out: string[] = [];
  for (let i = 0; i < label.length; i += perLine) out.push(label.slice(i, i + perLine));
  return out;
}

/**
 * A placeholder for one asset. Deterministic in (id, width, height, palette): the same id always
 * gets the same block colour, so a screenshot is stable and a diff means something changed.
 *
 * The label is drawn at the largest integer scale (up to 4×) at which the whole id still fits. A
 * 5px-tall id on a 96² battle frame is technically present and practically unreadable, and a
 * placeholder nobody can read is just a coloured square — which is exactly the thing that gets
 * mistaken for art direction and shipped.
 */
export function makePlaceholder(id: string, width: number, height: number, opts: PlaceholderOptions): Raster {
  const { palette } = opts;
  if (palette.length === 0) throw new Error('makePlaceholder: empty palette');
  const r = blankRaster(width, height);
  // hashSeed is core/rng.ts's FNV-1a — the repo's one hash. No second generator (G11), no Math.random.
  const pick = hashSeed(0, id) % palette.length;
  const fill = palette[pick]!;
  // Ink and border are the palette's extremes, chosen by luminance against the fill so the label
  // is legible whatever block colour the id hashed to.
  const lum = (c: PaletteRgb) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const sorted = [...palette].sort((a, b) => lum(a) - lum(b));
  const ink = lum(fill) > 127 ? sorted[0]! : sorted[sorted.length - 1]!;

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(r, x, y, fill);
  for (let x = 0; x < width; x++) {
    put(r, x, 0, ink);
    put(r, x, height - 1, ink);
  }
  for (let y = 0; y < height; y++) {
    put(r, 0, y, ink);
    put(r, width - 1, y, ink);
  }

  const label = (opts.label ?? id).toUpperCase();
  const scale = fontScale(label, width, height);
  const lines = wrapLabel(label, width, scale);
  const lineH = (GLYPH_H + GLYPH_GAP) * scale;
  const maxLines = Math.max(1, Math.floor((height - 2) / lineH));
  const shown = lines.slice(0, maxLines);
  const top = Math.max(1, Math.floor((height - shown.length * lineH + GLYPH_GAP * scale) / 2));
  for (const [li, line] of shown.entries()) {
    const textW = line.length * (GLYPH_W + GLYPH_GAP) * scale - GLYPH_GAP * scale;
    const left = Math.max(1, Math.floor((width - textW) / 2));
    for (let ci = 0; ci < line.length; ci++) {
      drawGlyph(r, line[ci]!, left + ci * (GLYPH_W + GLYPH_GAP) * scale, top + li * lineH, ink, scale);
    }
  }
  return r;
}
