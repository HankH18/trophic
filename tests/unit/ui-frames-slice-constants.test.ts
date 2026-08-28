/**
 * tests/unit/ui-frames-slice-constants.test.ts — the two numbers `tools/ui-frames` used to keep
 * under one name, held apart by measurement.
 *
 * WHY THIS FILE EXISTS. `tools/ui-frames/frames.ts` exported one constant, `SLICE_PX = 10`, and two
 * different jobs read it:
 *
 *   · THE SLICER — where chrome ends, the corner a nine-slice cuts. Measured: 4.
 *   · THE VERIFIER — how far in from the edge `render.ts`'s translation-invariance sweep starts, so
 *     that it clears the corner bracket. Measured floor: 8; shipped value 10.
 *
 * One name for both meant one of them was always wrong. At 10 the slicer drags a 6×6 block of plate
 * into every corner; at 4 the verifier sweeps across the bracket and reddens on correct art. Each of
 * the four sections below drives ONE of those numbers through the OTHER's job and requires the
 * failure — so a future edit that merges them back into one constant cannot leave this file green.
 *
 * MEASURED, NOT TRANSCRIBED. §1 reads the six PNGs in `assets/final/ui-frame/` — the shipped art,
 * which is what `game/ui/FramePanel.ts` slices at run time. §4 checks the generator still produces
 * exactly those pixels, so the numbers §1 reads off the raster and the numbers §2/§3 exercise
 * against the built canvases are the same artefact rather than two that agree by luck.
 *
 * SISTER FILE, DELIBERATELY NOT MERGED. `tests/unit/ui-frame-panel.test.ts` re-derives
 * `game/ui/FramePanel.ts`'s own `FRAME_CHROME_PX` from the same PNGs. The two constants CANNOT be
 * one import: `tools/ui-frames/` is node-hosted, so `tests/gates/guardrails.test.ts`
 * `no_phaser_in_node_reachable` walks it, and `FramePanel.ts` opens with
 * `import type PhaserNS from "phaser"` — which that gate counts as an engine import, type-only or
 * not. §1 therefore binds the tools-side number to the pixels, exactly as its sister binds the
 * game-side one, and the shared raster is what keeps them equal.
 */

import { describe, expect, it, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import sharp from "sharp";

import {
  FRAME_CHROME_PX,
  INVARIANT_MARGIN_PX,
  RING_PX,
  buildAll,
  type BuiltFrame,
} from "../../tools/ui-frames/frames.ts";
import { checkEdgesRepeat } from "../../tools/ui-frames/render.ts";
import { nineSlice } from "../../tools/ui-frames/raster.ts";
import { LIGHT } from "../../tools/ui-frames/theme.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FINAL_DIR = join(REPO_ROOT, "assets", "final", "ui-frame");

/** The polarity that was shipped — SPEC.md §1, and §4 below proves it against the raster. */
const FRAMES: BuiltFrame[] = buildAll(LIGHT);

const byId = (id: string): BuiltFrame => {
  const f = FRAMES.find((x) => x.size.id === id);
  if (!f) throw new Error(`no built frame "${id}"`);
  return f;
};

/** The three the widget draws at a size it chooses, and therefore the only three that are sliced. */
const SLICED_IDS = ["ui-dialogue-box", "ui-menu-panel", "ui-battle-hud-frame"] as const;

/**
 * The five that carry the 2 + 2 panel border. `ui-sign-card-frame` is deliberately absent: SPEC §4.6
 * builds it from the wood band with a 7px carved bevel, which is a different idiom and a different
 * edge depth. §1 asserts that it disagrees rather than quietly averaging it in.
 */
const PANEL_IDS = [
  "ui-dialogue-box",
  "ui-menu-panel",
  "ui-battle-hud-frame",
  "ui-ledger-panel",
  "ui-dex-card-frame",
] as const;

const SIGN_ID = "ui-sign-card-frame";

interface Pixels {
  readonly width: number;
  readonly height: number;
  at(x: number, y: number): string;
}

const SHIPPED = new Map<string, Pixels>();

beforeAll(async () => {
  for (const id of [...PANEL_IDS, SIGN_ID]) {
    const { data, info } = await sharp(join(FINAL_DIR, `${id}.png`))
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    SHIPPED.set(id, {
      width: info.width,
      height: info.height,
      at(x: number, y: number): string {
        const i = (y * info.width + x) * info.channels;
        return `${String(data[i])},${String(data[i + 1])},${String(data[i + 2])},${String(data[i + 3])}`;
      },
    });
  }
});

const shipped = (id: string): Pixels => {
  const px = SHIPPED.get(id);
  if (!px) throw new Error(`no pixels read for "${id}" — beforeAll did not run`);
  return px;
};

/** `r,g,b,a` → `#rrggbb`, for messages a human can compare against SPEC.md's hexes. */
const asHex = (rgba: string): string =>
  "#" +
  rgba
    .split(",")
    .slice(0, 3)
    .map((v) => Number(v).toString(16).padStart(2, "0"))
    .join("");

/**
 * The two-ring border, counted off the raster: the run of the edge colour, then the run of the
 * colour immediately inside it. Read on a scanline clear of the corner bracket, which is why the
 * default y is 8 and not 0 — at y ≤ 3 the bracket has overpainted the inner ring and the count is a
 * measurement of the MARK rather than of the chrome.
 */
function chromeDepthOf(px: Pixels, y = 8): number {
  const outer = px.at(0, y);
  let x = 0;
  while (x < px.width && px.at(x, y) === outer) x += 1;
  const inner = px.at(x, y);
  if (inner === outer) return x;
  while (x < px.width && px.at(x, y) === inner) x += 1;
  return x;
}

/**
 * The first column of the top edge strip that is settled — i.e. equal to every column to its right,
 * out to the far corner. That is the end of the corner bracket, measured, and it is the number
 * `INVARIANT_MARGIN_PX` has to clear.
 */
function firstInvariantColumn(px: Pixels, depth = 8): number {
  const columnAt = (x: number): string =>
    Array.from({ length: depth }, (_, y) => px.at(x, y)).join("|");
  const settled = columnAt(Math.floor(px.width / 2));
  let x = 0;
  while (x < px.width && columnAt(x) !== settled) x += 1;
  return x;
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 Both numbers come off the shipped raster, and they straddle the bracket
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the two constants are measurements of the shipped PNGs, not choices", () => {
  it("MEASURED — the five panel frames end their chrome at FRAME_CHROME_PX, on the same scanline", () => {
    /*
     * The scanline the split was argued from. On `ui-dialogue-box` at y = 8: `#040308` at x = 0–1,
     * `#74564e` at x = 2–3, plate `#faf7eb` from x = 4. All five panels agree; the sign card does
     * not, and the next test is where that is stated rather than averaged away.
     */
    for (const id of PANEL_IDS) {
      const px = shipped(id);
      expect(chromeDepthOf(px), `${id}'s chrome depth moved off ${String(FRAME_CHROME_PX)}`).toBe(
        FRAME_CHROME_PX,
      );
      expect(asHex(px.at(RING_PX - 1, 8)), `${id}'s outer ring`).toBe("#040308");
      expect(asHex(px.at(RING_PX, 8)), `${id}'s inner ring`).toBe("#74564e");
      expect(asHex(px.at(FRAME_CHROME_PX, 8)), `${id}'s plate does not start at the chrome`).toBe(
        "#faf7eb",
      );
    }
    expect(FRAME_CHROME_PX, "the chrome is two rings and nothing else").toBe(RING_PX * 2);
  });

  it("MEASURED — the sign card is a wood bevel and disagrees, which is the correct answer", () => {
    /*
     * A DIFFERENT IDIOM, not a defect and not an outlier to be averaged in. SPEC §4.6 builds this
     * one from the palette's wood band with a 7px carved bevel over a transparent exterior, because
     * a sign painted in `UI_SWATCH.panel` would be a menu lying in a field. It is drawn 1:1 wherever
     * the prop is and is never nine-sliced, so `FRAME_CHROME_PX` has no claim on it.
     */
    const px = shipped(SIGN_ID);
    expect(
      chromeDepthOf(px),
      "the sign card acquired the panel's 2 + 2 border — check SPEC §4.6 before touching the constants",
    ).not.toBe(FRAME_CHROME_PX);
    expect(byId(SIGN_ID).nineSlice, "the sign card must never be sliced").toBe(false);
  });

  it("MEASURED — the corner bracket ends at x = 8 on every sliced frame, and 8 is not 6", () => {
    /*
     * SPEC.md said 6. Six is what `plate()` runs from the INNER ring's corner (x = 2), so it lands
     * at 8 from the EDGE — and 8 from the edge is the number a sweep that starts at the edge has to
     * clear. The two were quoted from different origins and the outside one is the one that matters
     * here. Measured, not inherited: on the raster, columns 0–7 of the top strip carry the bracket
     * and every column from 8 out is identical.
     */
    for (const id of SLICED_IDS) {
      expect(firstInvariantColumn(shipped(id)), `${id}'s bracket does not end at 8`).toBe(8);
    }
  });

  it("THE WHOLE REASON THERE ARE TWO — the constants straddle the bracket, one each side", () => {
    const bracketEnd = firstInvariantColumn(shipped("ui-menu-panel"));
    expect(FRAME_CHROME_PX, "the slicer's boundary must be INSIDE the bracket").toBeLessThan(
      bracketEnd,
    );
    expect(INVARIANT_MARGIN_PX, "the verifier's margin must be OUTSIDE the bracket").toBeGreaterThanOrEqual(
      bracketEnd,
    );
    expect(
      FRAME_CHROME_PX,
      "the two constants collapsed back into one value — read the comments in frames.ts",
    ).not.toBe(INVARIANT_MARGIN_PX);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 The verifier's job — and what the slicer's number does to it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 checkEdgesRepeat is green at INVARIANT_MARGIN_PX and red at FRAME_CHROME_PX", () => {
  it("every nine-sliced frame's edges are translation-invariant at the shipped margin", () => {
    for (const id of SLICED_IDS) {
      expect(checkEdgesRepeat(byId(id)), `${id} at the default margin`).toBeNull();
      expect(checkEdgesRepeat(byId(id), INVARIANT_MARGIN_PX), `${id} at ${String(INVARIANT_MARGIN_PX)}`).toBeNull();
    }
  });

  it("SABOTAGE, PERMANENT — the same check at FRAME_CHROME_PX goes red, on art that is correct", () => {
    /*
     * This is the half of the split that is easy to lose. Someone who reads only §3 below concludes
     * the slice was simply wrong at 10 and "fixes" the verifier to 4 as well. It would then fail on
     * every frame in the set, and the natural next move is to blame the bracket and file the corner
     * mark down. Requiring the failure here says, in the suite, that the red is the CHECK being
     * asked the wrong question — not the art.
     *
     * AND NOTE WHICH COLUMN IT NAMES — x = 8, measured, which is the exact inversion that makes this
     * failure mode dangerous. The sweep anchors on its first column (x = margin = 4), which is
     * INSIDE the bracket, so every bracket column agrees with the anchor and the first column that
     * disagrees is 8: the first correct, settled column of the real edge. A verifier run at the
     * slicer's number does not merely go red, it reports the sound part of the frame as the defect
     * and the mark as the norm. Anyone who fixed the frame to satisfy it would delete the bracket.
     */
    for (const id of SLICED_IDS) {
      const problem = checkEdgesRepeat(byId(id), FRAME_CHROME_PX);
      expect(problem, `${id} is invariant even across the bracket — the check has stopped working`).not.toBeNull();
      expect(problem, `${id}: the failure names the wrong column`).toBe(
        "top edge is not translation-invariant at x=8",
      );
      // …and 8 is the settled edge, not part of the mark: §1 measured it as the first invariant one.
      expect(firstInvariantColumn(shipped(id))).toBe(8);
    }
  });

  it("BINDS — the check is not vacuous: it skips the fixed frames and returns null for them", () => {
    // Without this, §2 could be green because `checkEdgesRepeat` returns null for everything.
    const fixed = FRAMES.filter((f) => !f.nineSlice);
    expect(fixed.length, "no fixed frames at all — the sliced/fixed split has gone").toBeGreaterThan(0);
    for (const f of fixed) {
      expect(checkEdgesRepeat(f, FRAME_CHROME_PX), `${f.size.id} is fixed and must be skipped`).toBeNull();
    }
    expect(FRAMES.filter((f) => f.nineSlice).map((f) => f.size.id).sort()).toEqual([...SLICED_IDS].sort());
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 The slicer's job — and what the verifier's number does to it
 * ════════════════════════════════════════════════════════════════════════════ */

/** Every pixel a nine-slice at `slice` would leave in a CORNER piece of the drawn panel. */
function cornerColours(frame: BuiltFrame, w: number, h: number, slice: number): Set<string> {
  const out = nineSlice(frame.canvas, w, h, slice);
  const seen = new Set<string>();
  for (const [x0, y0] of [
    [0, 0],
    [w - slice, 0],
    [0, h - slice],
    [w - slice, h - slice],
  ] as const) {
    for (let y = y0; y < y0 + slice; y += 1) {
      for (let x = x0; x < x0 + slice; x += 1) seen.add(out.get(x, y).join(","));
    }
  }
  return seen;
}

describe("§3 a corner cut at FRAME_CHROME_PX is chrome; cut at INVARIANT_MARGIN_PX it is plate", () => {
  /** The size `DialogueScene` actually draws the box at — SPEC §3, `dialogueBoxRect`. */
  const DRAWN_W = 464;
  const DRAWN_H = 68;

  const plateOf = (f: BuiltFrame): string =>
    f.canvas.get(Math.floor(f.canvas.width / 2), Math.floor(f.canvas.height / 2)).join(",");

  it("no corner piece cut at FRAME_CHROME_PX contains one pixel of the plate", () => {
    for (const id of SLICED_IDS) {
      const f = byId(id);
      expect(
        cornerColours(f, DRAWN_W, DRAWN_H, FRAME_CHROME_PX),
        `${id}: a corner cut at the chrome reached the plate`,
      ).not.toContain(plateOf(f));
    }
  });

  it("SABOTAGE, PERMANENT — cut at INVARIANT_MARGIN_PX every corner carries the plate colour", () => {
    /*
     * The other half. `#faf7eb` is not a neutral colour to paint into a corner: it is the hex
     * `game/survey-view.ts` `SCREEN_HEX.ink` and `game/ui/Palette.ts` `roleHex("text")` draw type
     * in, so a block of it in a panel's corner is a block of invisible-text colour laid over
     * whatever the screen had already drawn there. Requiring it to be found is what stops anyone
     * widening the slice back to the verifier's number to make the corner tab crisp.
     */
    for (const id of SLICED_IDS) {
      const f = byId(id);
      expect(
        cornerColours(f, DRAWN_W, DRAWN_H, INVARIANT_MARGIN_PX),
        `${id}: the verifier's margin no longer drags the plate into the corners`,
      ).toContain(plateOf(f));
    }
  });

  it("MEASURED — the block is (margin − chrome)² per corner, which is 6×6 at the shipped numbers", () => {
    // The size of the defect, counted rather than quoted, so the arithmetic in frames.ts's comment
    // is checked by something.
    const f = byId("ui-dialogue-box");
    const plate = plateOf(f);
    const out = nineSlice(f.canvas, DRAWN_W, DRAWN_H, INVARIANT_MARGIN_PX);
    let block = 0;
    for (let y = 0; y < INVARIANT_MARGIN_PX; y += 1) {
      for (let x = 0; x < INVARIANT_MARGIN_PX; x += 1) if (out.get(x, y).join(",") === plate) block += 1;
    }
    const side = INVARIANT_MARGIN_PX - FRAME_CHROME_PX;
    expect(block, "the top-left corner's plate block is not (margin − chrome) squared").toBe(side * side);
    expect(side).toBe(6);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 §1 and §2/§3 are looking at the same art
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 the generator still produces the pixels §1 measured", () => {
  it("BINDS — every sliced frame the generator builds is pixel-identical to the shipped PNG", () => {
    /*
     * Without this, §1 could measure a promoted PNG while §2 and §3 exercise a generator that has
     * drifted away from it, and both halves would stay green while describing different art. Only
     * the three SLICED frames are asserted: they are the ones these two constants govern.
     *
     * ⚠ RECORDED, NOT ASSERTED: `ui-sign-card-frame` is the one row that is NOT pixel-identical.
     * Exactly SIX pixels differ from what `buildAll(LIGHT)` draws — its four outer corners plus two
     * on the bottom edge — and all six are fully transparent in both, carrying `4,3,8,0` in the
     * shipped file against `0,0,0,0` from the generator. Same picture; a re-encode chose to keep the
     * keyline's RGB under alpha 0. It is a fixed 1:1 prop that neither constant touches, so it is
     * out of this file's scope; it is named here so the omission reads as known, not overlooked.
     */
    for (const id of SLICED_IDS) {
      const px = shipped(id);
      const built = byId(id).canvas;
      expect([px.width, px.height], `${id} changed size`).toEqual([built.width, built.height]);
      let diff: string | null = null;
      for (let y = 0; y < built.height && diff === null; y += 1) {
        for (let x = 0; x < built.width; x += 1) {
          if (px.at(x, y) !== built.get(x, y).join(",")) {
            diff = `${id}: shipped ${asHex(px.at(x, y))} vs generated ${asHex(built.get(x, y).join(","))} at (${String(x)}, ${String(y)})`;
            break;
          }
        }
      }
      expect(diff, "the shipped art and the generator have diverged — re-measure both constants").toBeNull();
    }
  });
});
