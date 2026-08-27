/**
 * tools/ui-frames/render.ts — write the frames to `assets/raw/_ui-frames/`, and report on them.
 *
 *   npx tsx tools/ui-frames/render.ts            # both polarities
 *   npx tsx tools/ui-frames/render.ts --theme=dark
 *
 * RAW, NOT FINAL. `assets/raw/` is where a candidate lives until Hank approves it; the manifest's
 * own `finalDir` for this class is `assets/final/ui-frame`, and nothing in this lane may promote a
 * file there. The directory is `_ui-frames` with a leading underscore — the same convention
 * `assets/approved-trials/_player-views` uses for a lane's own working set, so it sorts away from
 * the generated classes and is obviously not a `tools/comfy` output.
 *
 * WHAT IT PRINTS, AND WHY THE NUMBERS COME LAST
 * ─────────────────────────────────────────────
 * A colour count, a pairing table, and a nine-slice summary. All three are necessary and none of
 * them is sufficient — EVAL-STANDARD's rule zero is that a metric that improves while the artefact
 * gets worse is measuring the wrong thing, and every number below is exactly the kind that can.
 * The output ends by saying so, and by naming the contact sheet, because the contact sheet is the
 * artefact this lane is actually judged on.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import sharp from "sharp";

import { Canvas, scale } from "./raster.ts";
import { buildAll, SLICE_PX, type BuiltFrame } from "./frames.ts";
import { DARK, LIGHT, framePairings, measure, THEMES, type FrameTheme } from "./theme.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
export const OUT_DIR = join(REPO, "assets", "raw", "_ui-frames");

/**
 * Gold carries 12–18 distinct colours per MAP (build-doc §9, restated in EVAL-STANDARD §2). A UI
 * frame is not a map and must use far fewer: the brief's own line is "if your frame needs eight
 * colours, it is wrong". Four is the working budget — keyline, inner line, fill, and one more for a
 * rule or a recess — plus transparency, which is not a colour.
 */
export const COLOUR_BUDGET = 5;

/** A `Canvas` straight to a PNG. No resize, no quantisation, no filtering — the bytes as drawn. */
export async function writePng(canvas: Canvas, path: string): Promise<void> {
  await sharp(Buffer.from(canvas.px), {
    raw: { width: canvas.width, height: canvas.height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: true })
    .toFile(path);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padStart(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

export function frameFileName(theme: FrameTheme, frame: BuiltFrame): string {
  return `${frame.size.id}--${theme.id}.png`;
}

async function renderTheme(theme: FrameTheme): Promise<BuiltFrame[]> {
  const frames = buildAll(theme);
  await mkdir(OUT_DIR, { recursive: true });
  for (const frame of frames) {
    await writePng(frame.canvas, join(OUT_DIR, frameFileName(theme, frame)));
    // A 3× nearest-neighbour copy, because the game runs at an INTEGER zoom
    // (`game/boot.ts` canvasZoom floors the fit) with `pixelArt: true`, so a 1080p window shows
    // every one of these at exactly 3×. Judging a frame only at 1× judges it at a size no player
    // ever sees; judging it only zoomed is the error EVAL-STANDARD's rule zero warns about. Both.
    await writePng(scale(frame.canvas, 3), join(OUT_DIR, frameFileName(theme, frame).replace(/\.png$/u, "--x3.png")));
  }
  return frames;
}

function reportFrames(theme: FrameTheme, frames: readonly BuiltFrame[]): boolean {
  let ok = true;
  console.log(`\n── ${theme.id} ──────────────────────────────────────────────────────`);
  console.log(`${pad("frame", 22)} ${pad("size", 9)} ${pad("colours", 8)} ${pad("slice", 16)} note`);
  for (const frame of frames) {
    const colours = frame.canvas.colours();
    // Transparency is not a colour; it is the absence of one. Only two frames carry any — the sign
    // card, whose exterior is the map behind it, and the title banner, which has no plate at all.
    const opaque = [...colours].filter((k) => !k.endsWith(",0")).length;
    const over = opaque > COLOUR_BUDGET;
    if (over) ok = false;
    const slice = frame.nineSlice
      ? `x ${SLICE_PX}/${frame.size.width - SLICE_PX}  y ${SLICE_PX}/${frame.size.height - SLICE_PX}`
      : "fixed 1:1";
    console.log(
      `${pad(frame.size.id, 22)} ${pad(`${frame.size.width}x${frame.size.height}`, 9)} ` +
        `${pad(`${opaque}${over ? " ⚠" : ""}`, 8)} ${pad(slice, 16)} ${frame.note}`,
    );
  }
  return ok;
}

/**
 * The edges must be translation-invariant, or a nine-slice that TILES and one that STRETCHES draw
 * different pixels and the frame is only correct in whichever mode the implementer happened to
 * pick.
 *
 * Checked, not asserted in prose: every column of the top and bottom edge strips between the slice
 * boundaries must equal every other, and likewise every row of the left and right strips. It is the
 * one mechanical property of this lane that a reader cannot verify by looking at the picture.
 */
function checkEdgesRepeat(frame: BuiltFrame): string | null {
  if (!frame.nineSlice) return null;
  const c = frame.canvas;
  const colOf = (x: number, y0: number, y1: number): string => {
    let s = "";
    for (let y = y0; y < y1; y += 1) s += c.get(x, y).join(",") + ";";
    return s;
  };
  const rowOf = (y: number, x0: number, x1: number): string => {
    let s = "";
    for (let x = x0; x < x1; x += 1) s += c.get(x, y).join(",") + ";";
    return s;
  };
  const first = colOf(SLICE_PX, 0, SLICE_PX);
  for (let x = SLICE_PX + 1; x < c.width - SLICE_PX; x += 1) {
    if (colOf(x, 0, SLICE_PX) !== first) return `top edge is not translation-invariant at x=${x}`;
  }
  const firstBottom = colOf(SLICE_PX, c.height - SLICE_PX, c.height);
  for (let x = SLICE_PX + 1; x < c.width - SLICE_PX; x += 1) {
    if (colOf(x, c.height - SLICE_PX, c.height) !== firstBottom) return `bottom edge varies at x=${x}`;
  }
  const firstLeft = rowOf(SLICE_PX, 0, SLICE_PX);
  for (let y = SLICE_PX + 1; y < c.height - SLICE_PX; y += 1) {
    if (rowOf(y, 0, SLICE_PX) !== firstLeft) return `left edge varies at y=${y}`;
  }
  const firstRight = rowOf(SLICE_PX, c.width - SLICE_PX, c.width);
  for (let y = SLICE_PX + 1; y < c.height - SLICE_PX; y += 1) {
    if (rowOf(y, c.width - SLICE_PX, c.width) !== firstRight) return `right edge varies at y=${y}`;
  }
  return null;
}

function reportPairings(theme: FrameTheme): boolean {
  let ok = true;
  console.log(`\n   pairings this polarity introduces — every one is a Surface entry`);
  console.log(`   tests/gates/ui-contrast-contract.test.ts does NOT currently carry:`);
  console.log(
    `   ${pad("what", 30)} ${pad("fg", 18)} ${pad("bg", 18)} ${pad("kind", 9)} ${padStart("ratio", 7)} ${padStart("floor", 6)}`,
  );
  for (const p of framePairings(theme).map(measure)) {
    if (!p.clears) ok = false;
    console.log(
      `   ${pad(p.what, 30)} ${pad(`${p.foreground}(${p.foregroundId})`, 18)} ` +
        `${pad(`${p.background}(${p.backgroundId})`, 18)} ${pad(p.kind, 9)} ` +
        `${padStart(p.ratio.toFixed(2), 7)} ${padStart(p.floor.toFixed(1), 6)} ${p.clears ? "" : "  ✗ FAILS"}`,
    );
  }
  return ok;
}

async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith("--theme="));
  const wanted = arg ? arg.slice("--theme=".length) : null;
  const themes = wanted ? THEMES.filter((t) => t.id === wanted) : THEMES;
  if (themes.length === 0) throw new Error(`tools/ui-frames: no theme "${wanted}" (dark | light)`);

  let allOk = true;
  for (const theme of themes) {
    const frames = await renderTheme(theme);
    allOk = reportFrames(theme, frames) && allOk;
    for (const frame of frames) {
      const problem = checkEdgesRepeat(frame);
      if (problem) {
        allOk = false;
        console.log(`   ✗ ${frame.size.id}: ${problem}`);
      }
    }
    allOk = reportPairings(theme) && allOk;
  }

  await writeFile(
    join(OUT_DIR, "README.txt"),
    [
      "Generated by tools/ui-frames/render.ts. Do not hand-edit; regenerate.",
      "",
      "NOT IN GIT. .gitignore:8 excludes assets/raw/**, so nothing in this directory is committed",
      "and a fresh clone will not have it. That is correct rather than a problem: the generator IS",
      "committed and is deterministic (no RNG anywhere — tools/ui-frames/raster.ts uses an ordered",
      "dither), so `npx tsx tools/ui-frames/render.ts` reproduces every byte. If Hank wants the",
      "candidates tracked, assets/approved-trials/_ui-frames/ is the tracked home the",
      "_player-views convention already establishes.",
      "",
      "CANDIDATES. Nothing here is approved. The manifest's finalDir for class ui-frame is",
      "assets/final/ui-frame; promoting a file there is Hank's call, not this lane's.",
      "",
      "--dark  : the polarity the build already is (UI_SWATCH.panel c06 plate, light ink).",
      "--light : Gold's polarity (UI_SWATCH.cursor c03 plate, dark ink). Costs an ink re-pick.",
      "--x3    : the same frame at 3x nearest-neighbour, which is what a 1080p window shows.",
      "",
      "Nine-slice boundaries, padding, per-element roles and the widget contract: tools/ui-frames/SPEC.md",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(`\nwrote ${OUT_DIR}`);
  console.log(
    allOk
      ? "\nevery mechanical check passed — which proves nothing about whether they look like Gold."
      : "\n⚠ a mechanical check failed (see ⚠ / ✗ above).",
  );
  console.log("Judge them on tools/ui-frames/_CONTACT-SHEET-*.png, with real text in them, not on this table.");
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith("render.ts");
if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}

export { DARK, LIGHT };
