/**
 * tools/ui-frames/text.ts — put REAL game strings inside a frame, at the size the game draws them.
 *
 * WHY THE CONTACT SHEET'S TEXT IS RENDERED AND NOT DRAWN
 * ─────────────────────────────────────────────────────
 * The wordmark in `frames.ts` is hand-set pixels. Body text here deliberately is not. The game
 * draws every string through Phaser's `add.text` with `fontFamily: "monospace"` and a CSS pixel
 * size — `game/scenes/MenuScene.ts` `uiText` at 8px with `setResolution(1)`,
 * `game/survey-view.ts` `SCREEN_TEXT.fontPx` at 10 — which is the browser's monospace face,
 * anti-aliased, and then blown up by an integer `canvasZoom` under `pixelArt: true`. A contact
 * sheet that set the type in a crisp hand-made bitmap face would be a picture of a UI nobody can
 * build, and would hide the single biggest legibility question in this lane behind prettier
 * lettering. So the sheet renders monospace through librsvg — near enough the same shape, the same
 * anti-aliasing — and the answer it gives about crowding, padding and column fit is an answer about
 * the real screen.
 *
 * THE ADVANCE IS FORCED, and that matters more than the face. Every layout in the repo computes
 * columns as `chars × 6` at 10px (`survey-view.ts` `SCREEN_TEXT.advancePx`, `DialogueScene`
 * `charWidth`), i.e. a 0.6em monospace advance. `textLength` + `lengthAdjust="spacing"` pins each
 * run to exactly that, so a column that lines up here lines up in the game and one that overflows
 * here overflows there. Without it the sheet would be measuring librsvg's metrics, not the game's.
 */

import sharp from "sharp";

/** 0.6em — the monospace advance every layout in `game/` already assumes. */
export const ADVANCE_EM = 0.6;

/**
 * Top-of-box to baseline, as a fraction of the font size.
 *
 * Phaser positions a `Text` by the TOP of its box; SVG positions by the BASELINE. 0.85 is the
 * offset measured against a librsvg render at 8px and 10px, and it is the only fudge in this file —
 * it moves type by at most one pixel and cannot change whether a line fits.
 */
const BASELINE_FRACTION = 0.85;

export interface TextRun {
  x: number;
  /** TOP of the text box, exactly as a Phaser `add.text` y — not the baseline. */
  y: number;
  text: string;
  /** `"#rrggbb"`, always resolved from a role by the caller. Never a literal in this lane. */
  hex: string;
  sizePx: number;
  /** `"right"` measures back from `x`, which is what `BattleMenuPanel`'s detail column does. */
  align?: "left" | "right";
}

export function advanceOf(sizePx: number): number {
  return sizePx * ADVANCE_EM;
}

/** How wide a run will draw, in pixels. What "does it fit?" is answered with. */
export function runWidth(run: TextRun): number {
  return run.text.length * advanceOf(run.sizePx);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function runSvg(run: TextRun): string {
  if (run.text.length === 0) return "";
  const width = runWidth(run);
  const x = run.align === "right" ? run.x - width : run.x;
  const baseline = run.y + Math.round(run.sizePx * BASELINE_FRACTION);
  return (
    `<text x="${x}" y="${baseline}" font-family="monospace" font-size="${run.sizePx}" ` +
    `fill="${run.hex}" xml:space="preserve" textLength="${width}" lengthAdjust="spacing">` +
    `${escapeXml(run.text)}</text>`
  );
}

/** An SVG layer of text runs, transparent everywhere else. */
export function textLayer(width: number, height: number, runs: readonly TextRun[]): Buffer {
  const body = runs.map(runSvg).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}">${body}</svg>`,
  );
}

/** Composite text over an existing RGBA image buffer. */
export async function withText(
  base: Buffer,
  width: number,
  height: number,
  runs: readonly TextRun[],
): Promise<Buffer> {
  if (runs.length === 0) return base;
  return sharp(base)
    .composite([{ input: await sharp(textLayer(width, height, runs)).png().toBuffer(), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
