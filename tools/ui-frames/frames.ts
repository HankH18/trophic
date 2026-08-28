/**
 * tools/ui-frames/frames.ts — the seven frames, as pure functions of a {@link FrameTheme}.
 *
 * SIZES ARE READ, NOT TYPED. Six of the seven are pinned in `tools/comfy/manifest.json` under class
 * `ui-frame`, and {@link frameSizes} parses that file rather than restating the numbers, so a frame
 * cannot quietly disagree with the row it is supposed to satisfy. (The manifest is READ ONLY from
 * this lane — another process owns writes to it.) The seventh, `ui-title-banner`, has NO manifest
 * row at all; its size comes from the code that already reserves the slot —
 * `game/scenes/TitleScene.ts` `BANNER_W = 208`, `BANNER_H = 48`, drawn today as a labelled
 * placeholder whose own note reads "unbuilt — no manifest row exists". See {@link TITLE_BANNER}.
 *
 * WHAT NINE-SLICES AND WHAT DOES NOT
 * ──────────────────────────────────
 * Three of the seven are drawn at a size the widget chooses and therefore MUST stretch:
 *   ui-dialogue-box     — the real box is 464×68 (`dialogueBoxRect`), not the pinned 480×96
 *   ui-menu-panel       — height follows the row count
 *   ui-battle-hud-frame — the real card is 150×46 (`BattleHud` `CARD_GEOMETRY`), not 240×64
 * Four are drawn at exactly their own size and never stretch: the ledger IS the 480×320 virtual
 * screen, the dex card and the sign card are fixed plates, and the title banner is a fixed 208×48
 * slot. That split is what lets the fixed four carry interior structure — a recess, a rule, a
 * wordmark — which a stretching middle band cannot hold without tearing.
 *
 * THE THREE STRETCHY FRAMES ARE THE SAME TEXTURE AT THREE SIZES, AND THAT IS THE DESIGN.
 * A dialogue box, a menu panel and a combatant card that used three different borders would read as
 * three games. Gold uses one box everywhere. The manifest enumerates three rows, so three files are
 * written; `SPEC.md` says plainly that the code lane needs to load only one of them.
 *
 * CONSTANTS (G11, the same narrowing `game/ui/BattleLayout.ts` states): every number below is a
 * pixel offset inside the build-doc §7.6 virtual screen, or a slice boundary. Nothing here is a
 * gameplay tunable, nothing in `core/` reads any of it, and a balance retune must not move a
 * keyline. The two numbers that ARE data — the virtual screen's width and height — arrive from
 * `data/balance.json` via {@link virtualScreen}.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import balanceJson from "../../data/balance.json" with { type: "json" };

import { Canvas, CLEAR, ditherRect, drawGlyph, rgba, type Rgba } from "./raster.ts";
import { DARK, signHex, themeHex, type FrameTheme } from "./theme.ts";

/** See {@link titleBanner}: the wordmark plate does not follow the polarity. */
const DARK_BANNER: FrameTheme = DARK;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

/* ────────────────────────────────────────────────────────────────────────────
 * Sizes
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FrameSize {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** Where the size came from, printed by `render.ts` so a wrong number is traceable. */
  readonly source: string;
}

/** build-doc §7.6's 480×320, read from `balance.map` — never a literal (the rule `game/boot.ts` states). */
export function virtualScreen(): { width: number; height: number } {
  return { width: balanceJson.map.virtualWidth, height: balanceJson.map.virtualHeight };
}

/**
 * The `ui-frame` rows of `tools/comfy/manifest.json`, in file order, with their pinned `targetSize`.
 *
 * Parsed rather than transcribed. The brief that commissioned this lane listed the six as
 * dialogue-box / menu-panel / battle-hud-frame / ledger-panel / dex-card-frame / **title-banner**.
 * The manifest's sixth row is `ui-sign-card-frame` at 240×160 and there is no `ui-title-banner` row
 * anywhere in the file — so the brief's list is wrong by one, and reading the file is what catches
 * that instead of inheriting it.
 */
export function frameSizes(): FrameSize[] {
  const raw = readFileSync(join(REPO, "tools", "comfy", "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as { rows: Array<Record<string, unknown>> };
  const out: FrameSize[] = [];
  for (const row of manifest.rows) {
    if (row["class"] !== "ui-frame") continue;
    const id = String(row["id"]);
    const target = String(row["targetSize"] ?? "");
    const match = /^(\d+)x(\d+)$/u.exec(target);
    if (!match?.[1] || !match[2]) {
      throw new Error(`tools/ui-frames: manifest row ${id} has no parsable targetSize ("${target}")`);
    }
    out.push({
      id,
      width: Number(match[1]),
      height: Number(match[2]),
      source: `tools/comfy/manifest.json rows[] ${id}.targetSize`,
    });
  }
  if (out.length === 0) throw new Error("tools/ui-frames: no ui-frame rows in tools/comfy/manifest.json");
  return out;
}

/**
 * The title banner, which the manifest does not carry.
 *
 * `game/scenes/TitleScene.ts` already draws this slot — `placeholderImage(this, width / 2, 46,
 * "ui/title-banner", BANNER_W, BANNER_H, { note: "unbuilt — no manifest row exists (see comment)" })`
 * — so the size is not invented here, it is the size the running game already reserves. It is
 * generated because the title screen is the first thing a player sees and it is currently a hatched
 * placeholder box; it is listed separately because shipping it needs a manifest row Hank has not
 * authorised, and this lane must not write that file.
 */
export const TITLE_BANNER: FrameSize = {
  id: "ui-title-banner",
  width: 208,
  height: 48,
  source: "game/scenes/TitleScene.ts BANNER_W / BANNER_H — NO manifest row exists",
};

/* ────────────────────────────────────────────────────────────────────────────
 * The border idiom — one function, every frame
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The thickness of ONE ring. Two rings, so {@link FRAME_CHROME_PX} of chrome, and text is never
 * drawn inside it.
 *
 * 2, not 1, and the reason is measured rather than aesthetic. Gold's text box carries a 1px border
 * on a 160×144 screen. build-doc §9 records that this project's art pixel is "1 native px, tile 16
 * native px — **2× a GBC's density**", and the virtual screen is 480×320 against Gold's 160×144. A
 * 1px keyline here is therefore proportionally between a half and a third of Gold's, and the first
 * cut of these frames showed it: at 1× the box read as a hairline CSS div, not as a hard-bordered
 * handheld box. Doubling the ring restores the weight the density note predicts.
 */
export const RING_PX = 2;

/* ────────────────────────────────────────────────────────────────────────────
 * TWO NUMBERS, TWO JOBS. They were one constant called `SLICE_PX = 10` and the collapse cost real
 * pixels: read both comments below before touching either, and never re-merge them.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * WHERE CHROME ENDS. The slicer's boundary: the nine-slice corner for the three stretching frames,
 * and the inset every rule and recess band starts at. Text is never drawn inside it.
 *
 * MEASURED, not chosen. On all five PANEL frames in `assets/final/ui-frame/`, a scanline at y = 8
 * reads `#040308` at x = 0–1 (outer ring), `#74564e` at x = 2–3 (inner ring), plate `#faf7eb` from
 * x = 4. Two rings of {@link RING_PX} and nothing else, so the boundary is `RING_PX * 2`. (The sixth
 * row, `ui-sign-card-frame`, is a 7px wood bevel and is never sliced — see {@link signCardFrame}.)
 *
 * IT IS NOT the verifier's sweep margin. See {@link INVARIANT_MARGIN_PX}.
 *
 * WHAT BREAKS IF THEY ARE UNIFIED AGAIN, at this value: `render.ts`'s `checkEdgesRepeat` would sweep
 * x = 4 … width − 4, which contains the corner bracket. A bracket is a corner MARK and is
 * deliberately not translation-invariant, so the check would go red on correct art.
 *
 * THE TRADE THIS NUMBER BUYS — both halves, so nobody widens it back to make the bracket crisp:
 *   · COST: the bracket runs to x = 8, so a 4px cut leaves its outer 4px inside the STRETCHED edge
 *     strip rather than the fixed corner. A stretched strip is resampled by the panel's scale
 *     factor, so the corner tab does not hold its natural size the way the chrome does — a panel
 *     drawn narrower than its texture wears a slightly short tab.
 *   · WHY IT IS ACCEPTED ANYWAY: a corner piece cut at any slice WIDER than the chrome contains
 *     PLATE. At 10 each of the four corners carries a 6×6 block of `#faf7eb`, at 8 a 4×4 block —
 *     painted into the panel's corners over whatever the screen already drew there, in the exact hex
 *     `game/survey-view.ts` `SCREEN_HEX.ink` and `game/ui/Palette.ts` `roleHex("text")` draw type
 *     in. A 4px mark changing length loses to a block of invisible-text colour in every corner.
 *
 * DUPLICATED, NOT IMPORTED, and that is checked rather than assumed. `game/ui/FramePanel.ts` exports
 * `FRAME_CHROME_PX = 4` under this same name and slices at it, but importing it here is forbidden:
 * `tools/ui-frames/` is node-hosted (no `index.html`, no `vite.config.ts`), so
 * `tests/gates/guardrails.test.ts` `no_phaser_in_node_reachable` walks it, and `FramePanel.ts` opens
 * with `import type PhaserNS from "phaser"` — which that gate's parser counts as an engine import,
 * type-only or not. Verified by adding the import and watching the gate go red. The two sites are
 * bound by MEASUREMENT instead of by a symbol: `tests/unit/ui-frame-panel.test.ts` re-derives the
 * game-side number from the shipped PNGs, `tests/unit/ui-frames-slice-constants.test.ts` this one.
 */
export const FRAME_CHROME_PX = RING_PX * 2;

/**
 * OUTSIDE THE CORNER MARK. The verifier's sweep margin, and nothing else — `render.ts`'s
 * `checkEdgesRepeat` is its only consumer. It sets how far in from each edge the
 * translation-invariance sweep starts AND how deep the strip it compares is.
 *
 * MEASURED floor is 8. {@link plate} lays the outer ring's colour over the inner ring for
 * {@link BRACKET_LEN} from the inner ring's corner — from `RING_PX` = 2, so x = 2…7 — and on every
 * shipped frame rows 2–3 read `#040308` out to x = 7 with `#74564e` resuming at x = 8. So x = 8 is
 * the first column of a settled edge and this is that floor plus 2px of slack. (`SPEC.md` said the
 * bracket was 6px from the edge. That was the number the generator was ASKED for, written down as
 * though it were the number that came back off the raster. It is 8.)
 *
 * IT IS NOT a slice boundary. Never pass it to `nineSlice()` or to `game/ui/FramePanel.ts`'s drawer.
 * See {@link FRAME_CHROME_PX}.
 *
 * WHAT BREAKS IF THEY ARE UNIFIED AGAIN, at this value: every corner piece is cut 10px wide and
 * carries a 6×6 block of plate colour into the panel's corners — the exact defect
 * {@link FRAME_CHROME_PX} exists to prevent, in the one colour the panels draw text in.
 *
 * A LITERAL, deliberately, rather than `RING_PX + BRACKET_LEN`: a verifier that recomputes its own
 * tolerance from the thing it is verifying verifies nothing. If the bracket ever grows past 10 the
 * check goes red and names the column — which is the correct outcome, not a maintenance chore.
 */
export const INVARIANT_MARGIN_PX = 10;

/**
 * The corner bracket: how far the OUTER ring's colour runs along the INNER ring from each corner.
 *
 * This is the one mark in the whole set that is ours rather than Gold's. Hold content distance, not
 * visual distance (EVAL-STANDARD §2): the idiom stays Gold's hard-keyline box, and the corner is
 * where this game signs it — every corner reads as a reinforced tab, the way a field register's
 * corners are. Six pixels along each axis at 1× is the shortest run that is unmistakably deliberate
 * rather than an artefact of the two rings meeting.
 *
 * SIX FROM THE INNER RING'S CORNER IS EIGHT FROM THE EDGE, and the two numbers get confused because
 * they are quoted from different origins. {@link plate} starts the run at `x = RING_PX`, so it
 * covers x = 2…7 and the settled edge resumes at x = 8. `SPEC.md` §2's "8px along each axis" and
 * this 6 are the same mark measured from the outside and from the inside. {@link INVARIANT_MARGIN_PX}
 * is sized against the 8.
 */
const BRACKET_LEN = 6;

/**
 * The shared plate: chamfered keyline, inner line, flat fill.
 *
 * Reading outward from the middle: a flat fill, a 1px inner line, a 1px hard keyline, and four
 * absent corner pixels. That is the whole of it, and it is what `assets/reference/gen2/
 * violet-city-gs.png` does on every building at native resolution — a dark keyline, a pale line
 * inside it, then a flat field. No gradient, no anti-aliasing, no soft shadow.
 *
 * The corner pixels are CLEAR rather than keyline-coloured: a square corner reads as a CSS box, and
 * one absent pixel is the whole difference between "drawn" and "specified".
 */
export function plate(c: Canvas, x: number, y: number, w: number, h: number, theme: FrameTheme): void {
  const outer = rgba(themeHex(theme, "outerLine"));
  const fill = rgba(themeHex(theme, "fill"));
  const inner = theme.innerLine === null ? fill : rgba(themeHex(theme, "innerLine"));

  c.fillRect(x, y, w, h, fill);
  for (let i = 0; i < RING_PX; i += 1) {
    c.strokeRect(x + RING_PX + i, y + RING_PX + i, w - (RING_PX + i) * 2, h - (RING_PX + i) * 2, inner);
  }
  for (let i = 0; i < RING_PX; i += 1) {
    c.strokeRect(x + i, y + i, w - i * 2, h - i * 2, outer);
  }

  // SQUARE CORNERS, deliberately, after looking. The first cut chamfered them — one absent pixel at
  // each corner — on the assumption that Gold's boxes are pixel-rounded. They are not:
  // `assets/reference/gen2/violet-city-gs.png` at native resolution shows every building's keyline
  // turning a hard square corner, and the pale line inside it doing the same. A chamfer is a Gen 3
  // habit. It also read as a chipped corner at 1× rather than as a rounding.
  //
  // The bracket is what the corner gets instead: the outer ring's colour, laid over the inner ring
  // for BRACKET_LEN along each axis, so the corner thickens to the full FRAME_CHROME_PX for a short run.
  const corners = [
    [x + RING_PX, y + RING_PX, 1, 1],
    [x + w - RING_PX - 1, y + RING_PX, -1, 1],
    [x + RING_PX, y + h - RING_PX - 1, 1, -1],
    [x + w - RING_PX - 1, y + h - RING_PX - 1, -1, -1],
  ] as const;
  for (const [cx, cy, sx, sy] of corners) {
    for (let i = 0; i < BRACKET_LEN; i += 1) {
      for (let t = 0; t < RING_PX; t += 1) {
        c.set(cx + sx * i, cy + sy * t, outer);
        c.set(cx + sx * t, cy + sy * i, outer);
      }
    }
  }
}

/** A 1px horizontal separator spanning the plate's interior. */
function rule(c: Canvas, y: number, theme: FrameTheme, left = FRAME_CHROME_PX, right = c.width - FRAME_CHROME_PX): void {
  c.hline(left, y, right - left, rgba(themeHex(theme, "rule")));
}

/**
 * A sunken band: a full-interior-width recess closed top and bottom by the recess keyline.
 *
 * Full width rather than inset, and this is load-bearing. The survey draws its rows at x = 8 with a
 * 10px font; a well inset far enough to look like a well would put its own keyline 3px from the
 * first glyph, and `EVAL-STANDARD` §1 is explicit that the border must not crowd the type. Closing
 * the band on the horizontal only gives the recess its read without ever approaching a glyph.
 */
function recessBand(c: Canvas, y: number, h: number, theme: FrameTheme): void {
  const left = FRAME_CHROME_PX;
  const w = c.width - FRAME_CHROME_PX * 2;
  const line = rgba(themeHex(theme, "recessLine"));
  c.fillRect(left, y, w, h, rgba(themeHex(theme, "recessFill")));
  c.hline(left, y, w, line);
  c.hline(left, y + h - 1, w, line);
}

/** A square well with its keyline OUTSIDE the stated box, so the box itself stays exactly `size`. */
function recessBox(c: Canvas, x: number, y: number, w: number, h: number, theme: FrameTheme): void {
  c.strokeRect(x - 1, y - 1, w + 2, h + 2, rgba(themeHex(theme, "recessLine")));
  ditherRect(c, x, y, w, h, rgba(themeHex(theme, "recessDither")), rgba(themeHex(theme, "recessFill")), 1);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The three stretching frames
 * ──────────────────────────────────────────────────────────────────────────── */

/** Plate and nothing else. Every pixel of the edges is translation-invariant — see `SPEC.md`. */
function stretchy(size: FrameSize, theme: FrameTheme): Canvas {
  const c = new Canvas(size.width, size.height);
  plate(c, 0, 0, size.width, size.height, theme);
  return c;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ui-ledger-panel — the survey screen, 480×320, drawn 1:1 and never stretched
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The band layout the ledger frame imposes, in virtual pixels.
 *
 * WHY THIS IS A LAYOUT AND NOT JUST A BORDER. `game/scenes/SurveyScene.ts` draws every line at
 * `y = 8 + 12 * i` with a 10px font — a 12px pitch under a glyph box of about the same height, so
 * consecutive lines touch and there is NO gap anywhere on the screen for a rule to sit in. Measured
 * on the shipped layout: heading 8, totals 20, presence 32, column header 44, first row 56. A rule
 * at any of 19, 31, 43 or 55 lands inside a descender.
 *
 * So the frame carries the rhythm the screen does not have: three bands with real gaps between
 * them. The code lane changes `SurveyScene`'s line origins to {@link LEDGER} and the rules land in
 * air. Seventeen ledger rows survive the change; the largest shipped node has seven populations
 * (`data/nodes/bowerdeep.json`), so nothing is lost, and the screen gains the 20-row cliff it does
 * not currently clamp.
 */
export const LEDGER = {
  /** Heading — `<node> — year <y> · <season>`. */
  headingY: 6,
  /** Totals — `flora X/Y · recent deaths Z · …`. */
  totalsY: 18,
  /** Presence — `presence: <names>`. */
  presenceY: 30,
  ruleAfterHeaderY: 45,
  /** The column header: `line          count  cap  breed  seasons`. */
  columnsY: 49,
  /** Top edge of the sunken register. */
  wellY: 62,
  wellHeight: 228,
  /** First ledger row; rows step by `rowPitch`. */
  firstRowY: 66,
  /**
   * 14, not the shipped 12, and the two extra pixels are what make the register a register.
   *
   * At a 12px pitch a 10px glyph box leaves nothing between rows, so the rows cannot be RULED — and
   * an unruled 228px register holding six live rows is 170 pixels of flat colour, which is the large
   * dead zone EVAL-STANDARD §1.5 names. Measured on the first cut of this frame: six rows of
   * Hearthollow filled the top quarter of the well and the rest read as a stain on the plate.
   *
   * Ruling it costs one row of capacity (15 instead of 16) and turns the empty part of the screen
   * into the thing the screen is *about* — a field register with lines left to fill in. The largest
   * shipped node carries seven populations (`data/nodes/bowerdeep.json`, `r3.json`), so 15 is eight
   * rows of headroom, and the screen gains the clamp `SurveyScene` does not currently have.
   */
  rowPitch: 14,
  /** Baseline-to-rule offset inside a row's pitch. 13 of 14 — the rule sits under the descenders. */
  rowRuleOffset: 13,
  rows: 15,
  ruleBeforeFooterY: 292,
  footerY: 296,
  /** Left edge of every line of text — the same 8px `survey-view.ts` `SCREEN_TEXT.padPx` already uses. */
  textLeft: 8,
} as const;

function ledgerPanel(size: FrameSize, theme: FrameTheme): Canvas {
  const c = new Canvas(size.width, size.height);
  plate(c, 0, 0, size.width, size.height, theme);
  rule(c, LEDGER.ruleAfterHeaderY, theme);
  recessBand(c, LEDGER.wellY, LEDGER.wellHeight, theme);
  // The ruled rows. They are drawn on the RECESS, not on the plate, so they take the recess's own
  // separator weight; the last one is dropped when it would land on the well's bottom keyline.
  const ruleColour = rgba(themeHex(theme, "rule"));
  for (let i = 0; i < LEDGER.rows; i += 1) {
    const y = LEDGER.firstRowY + i * LEDGER.rowPitch + LEDGER.rowRuleOffset;
    if (y >= LEDGER.wellY + LEDGER.wellHeight - 1) break;
    c.hline(FRAME_CHROME_PX, y, size.width - FRAME_CHROME_PX * 2, ruleColour);
  }
  rule(c, LEDGER.ruleBeforeFooterY, theme);
  return c;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ui-dex-card-frame — one species, 320×320, drawn 1:1
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The dex card's own geometry.
 *
 * The portrait well is 128×128 because that is `survey-view.ts` `DEX_ART_BOX.width/height` exactly
 * — the size the dex ALREADY asks `placeholderImage` for. Only its origin moves.
 *
 * ⚠ THE CARD DOES NOT FIT THE SHIPPED DEX SCREEN, and the mismatch is the manifest's, not this
 * lane's. `DexScene` draws full-screen: a 480×320 backdrop, the art box at (8, 32), text from
 * x = 144. A 320×320 card has no place in that layout at all. The manifest pins 320×320, so that is
 * what is generated; `SPEC.md` carries the two ways out and the one that is recommended (draw the
 * card centred at x = 80, move `DEX_ART_BOX` to the card's well).
 */
export const DEX_CARD = {
  /** The identity line, full width across the top of the card. */
  nameY: 14,
  ruleUnderNameY: 32,
  /** The portrait well — 128², `survey-view.ts` `DEX_ART_BOX.width/height` exactly. */
  wellSize: 128,
  wellX: 16,
  wellY: 40,
  /** The short lines that sit BESIDE the portrait: types · role, habitat. 24 characters at 6px. */
  sideX: 156,
  sideY: 46,
  sidePitch: 14,
  /**
   * TWO, not four. `renderDexEntry`'s third line is `individuals in region N · all forms` — 36
   * characters, where the column beside a 128px portrait on a 320px card is 24. The first cut let
   * four lines run there and that line drew straight off the card's right edge onto the field.
   * Lines 1–2 (`types · role`, `habitat …`) are the short ones; everything after goes full width.
   */
  sideLines: 2,
  ruleUnderWellY: 176,
  /** The full-width lines below the portrait: the regional count and the seasonal flags. */
  bodyY: 184,
  bodyPitch: 14,
  /** Baseline-to-rule offset inside a body line, matching `LEDGER.rowRuleOffset`. */
  bodyRuleOffset: 13,
  bodyLines: 7,
  ruleBeforeFooterY: 284,
  footerY: 290,
  textLeft: 16,
} as const;

/**
 * PORTRAIT LEFT, NOT CENTRED — decided by looking at the first cut.
 *
 * Centring a 128² well in a 320-wide card and stacking the text under it left the whole lower half
 * of the card empty on a real entry (`renderDexEntry` returns four to six lines) and put a 148px
 * dead column either side of the portrait. Moving the well to the left and running the two short
 * identity lines beside it uses that column, and drops the body to the two lines that actually need
 * the full width — the regional count and the seasonal flags.
 */
function dexCardFrame(size: FrameSize, theme: FrameTheme): Canvas {
  const c = new Canvas(size.width, size.height);
  plate(c, 0, 0, size.width, size.height, theme);
  rule(c, DEX_CARD.ruleUnderNameY, theme);
  recessBox(c, DEX_CARD.wellX, DEX_CARD.wellY, DEX_CARD.wellSize, DEX_CARD.wellSize, theme);
  rule(c, DEX_CARD.ruleUnderWellY, theme);
  // The body area is RULED, for the same reason the ledger's register is: `renderDexEntry` returns
  // four to six lines and the card is 320 tall, so an unruled body is ~90px of flat plate under the
  // last line. Ruled, the unfilled part of a dex card reads as what it is — a field record with
  // lines not yet written on. Same rhythm as LEDGER, so the two screens agree.
  const ruleColour = rgba(themeHex(theme, "rule"));
  for (let i = 0; i < DEX_CARD.bodyLines; i += 1) {
    const y = DEX_CARD.bodyY + i * DEX_CARD.bodyPitch + DEX_CARD.bodyRuleOffset;
    if (y >= DEX_CARD.ruleBeforeFooterY) break;
    c.hline(FRAME_CHROME_PX, y, size.width - FRAME_CHROME_PX * 2, ruleColour);
  }
  rule(c, DEX_CARD.ruleBeforeFooterY, theme);
  return c;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ui-sign-card-frame — a world prop, 240×160, drawn 1:1
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A carved plank, not a panel.
 *
 * `core/types.ts` `PROP_KINDS[sign-card]` puts this IN the world — bible §5's legibility
 * requirement, the card that flags a migrant dormant or migrating — so it is painted from the
 * palette's wood band ({@link SIGN_SWATCH_ID}) rather than from the UI plate roles. A sign that
 * used `UI_SWATCH.panel` would be a menu lying in a field.
 *
 * The bevel is HARD: two pixels of the lit side along the top and left, two of the shadowed side
 * along the bottom and right, no interpolation between them. `EVAL-STANDARD` §1.6 draws the line
 * exactly here — a soft offset gradient is a fail, a hard dark base edge is the correct Gold
 * convention — so the plank also gets a 2px `keyline` base edge, which is what every Gold building
 * and tree sits on.
 */
function signCardFrame(size: FrameSize): Canvas {
  const c = new Canvas(size.width, size.height);
  const keyline = rgba(signHex("keyline"));
  const wood = rgba(signHex("wood"));
  const light = rgba(signHex("woodLight"));
  const dark = rgba(signHex("woodDark"));
  const face = rgba(signHex("face"));

  const BASE = 2; // the hard dark edge the plank sits on
  const bodyH = size.height - BASE;
  const BEVEL = 7;

  c.fillRect(0, 0, size.width, bodyH, wood);
  // Lit side, then shadowed side, then the keyline last so nothing paints over it.
  const EDGE = 3;
  c.fillRect(0, 0, size.width, EDGE, light);
  c.fillRect(0, 0, EDGE, bodyH, light);
  c.fillRect(0, bodyH - EDGE, size.width, EDGE, dark);
  c.fillRect(size.width - EDGE, 0, EDGE, bodyH, dark);

  // FOUR PEGS, NOT A GRAIN PATTERN. The first cut ran single dark pixels on a 6px column pitch
  // through the top and bottom bevel as plank grain; at 3× it read as a ruler scale, which is the
  // sort of unexplained mark EVAL-STANDARD §1.3 counts as a defect. A sign is nailed up, so it gets
  // four peg heads at the corners of the bevel and nothing else. Reads instantly, costs no colour.
  const PEG = 2;
  for (const [px, py] of [
    [3, 3],
    [size.width - 3 - PEG, 3],
    [3, bodyH - 3 - PEG],
    [size.width - 3 - PEG, bodyH - 3 - PEG],
  ] as const) {
    c.fillRect(px, py, PEG, PEG, keyline);
  }

  // The recessed face the words are cut into.
  c.strokeRect(BEVEL - 1, BEVEL - 1, size.width - (BEVEL - 1) * 2, bodyH - (BEVEL - 1) * 2, keyline);
  c.fillRect(BEVEL, BEVEL, size.width - BEVEL * 2, bodyH - BEVEL * 2, face);

  c.strokeRect(0, 0, size.width, bodyH, keyline);
  c.fillRect(1, bodyH, size.width - 2, BASE, keyline);
  for (const [cx, cy] of [
    [0, 0],
    [size.width - 1, 0],
  ] as const) {
    c.set(cx, cy, CLEAR);
  }
  return c;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ui-title-banner — the wordmark, 208×48, drawn 1:1
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * TROPHIC, as seven hand-set 8×11 glyphs at 2×.
 *
 * A wordmark is the one place in this lane where letterforms are drawn rather than typed, and it is
 * legitimate here for the reason `EVAL-STANDARD` §1.2 gives: the rule against lettering is a
 * TOOL limitation — `z_image_turbo` cannot render legible text — "not a style law", and Gold itself
 * renders "MART", "GYM" and "POKÉ" legibly on its buildings. Nothing diffuses these; they are set
 * pixel by pixel, so they are legible by construction.
 *
 * 2× rather than an 16×22 hand-set face: a chunky logo is what Gold's own wordmark is, and doubling
 * an 8×11 grid keeps every edge on the same lattice as the rest of the frame.
 */
const WORDMARK: Record<string, readonly string[]> = {
  T: ["########", "########", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##..."],
  R: ["######..", "#######.", "##...##.", "##...##.", "##...##.", "#######.", "######..", "##.##...", "##..##..", "##...##.", "##...##."],
  O: [".######.", "########", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "##....##", "########", ".######."],
  P: ["######..", "#######.", "##...##.", "##...##.", "##...##.", "#######.", "######..", "##......", "##......", "##......", "##......"],
  H: ["##....##", "##....##", "##....##", "##....##", "########", "########", "##....##", "##....##", "##....##", "##....##", "##....##"],
  I: ["########", "########", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "...##...", "########", "########"],
  C: [".######.", "########", "##....##", "##......", "##......", "##......", "##......", "##......", "##....##", "########", ".######."],
};

const WORD = "TROPHIC";
const GLYPH_SCALE = 2;
const GLYPH_W = 8 * GLYPH_SCALE;
const GLYPH_H = 11 * GLYPH_SCALE;
const GLYPH_GAP = 2;

/**
 * The banner is DARK in both polarities, and the file is byte-identical between them.
 *
 * It is the one frame with no text on it — the wordmark IS its content — so the ink ladder that
 * separates the two polarities has nothing to decide here. And it is the one place the gold
 * (`accent`, c16) earns its keep: 14.51 : 1 over the void, 4.66 : 1 over the dark plate, and
 * 1.32 : 1 over a near-white one. A gold wordmark on a cream plate is the one thing a title screen
 * cannot be. `TitleScene` already paints its background `UI_SWATCH_ID.bg` (c00), so a dark banner
 * is what belongs there whatever the panels do.
 */
function titleBanner(size: FrameSize, _theme: FrameTheme): Canvas {
  const theme = DARK_BANNER;
  const c = new Canvas(size.width, size.height);

  const outline = rgba(themeHex(theme, "innerLine"));
  const rim = rgba(themeHex(theme, "rule"));
  const gold = rgba(themeHex(theme, "accent"));
  const wordW = WORD.length * GLYPH_W + (WORD.length - 1) * GLYPH_GAP;
  const x0 = Math.round((size.width - wordW) / 2);
  const y0 = Math.round((size.height - GLYPH_H) / 2);

  const draw = (colour: Rgba, dx: number, dy: number): void => {
    WORD.split("").forEach((letter, i) => {
      const rows = WORDMARK[letter];
      if (!rows) throw new Error(`tools/ui-frames: no wordmark glyph for "${letter}"`);
      drawGlyph(c, rows, x0 + i * (GLYPH_W + GLYPH_GAP) + dx, y0 + dy, colour, GLYPH_SCALE);
    });
  };

  /**
   * Grow the word by `r` pixels in every direction — a real dilation, not a ring of eight offsets.
   *
   * The first cut used eight offsets at radius 4 and the result was a BROKEN halo: at radius 4 the
   * eight samples no longer overlap, so the tan rim appeared in fragments around the letters instead
   * of enclosing them. A Chebyshev-disc dilation is the same idea done properly, and it is cheap —
   * seven glyphs, 81 offsets.
   */
  const grow = (colour: Rgba, r: number): void => {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) draw(colour, dx, dy);
    }
  };

  // Outermost first: a 2px light rim so the word holds its shape over a dark field OR a painted one,
  // then a 2px hard black outline, then the gold. Hard edges throughout — the blurred version is the
  // modern-renderer failure EVAL-STANDARD §1.6 names.
  grow(rim, 4);
  grow(outline, 2);
  draw(gold, 0, 0);
  return c;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The set
 * ──────────────────────────────────────────────────────────────────────────── */

export interface BuiltFrame {
  readonly size: FrameSize;
  readonly canvas: Canvas;
  /** True when the widget draws it at a size it chooses, so the corners must stay fixed. */
  readonly nineSlice: boolean;
  readonly note: string;
}

/** Every frame, for one theme. Sizes come from the manifest; the seventh from `TitleScene`. */
export function buildAll(theme: FrameTheme): BuiltFrame[] {
  const sizes = new Map(frameSizes().map((s) => [s.id, s]));
  const need = (id: string): FrameSize => {
    const s = sizes.get(id);
    if (!s) throw new Error(`tools/ui-frames: no manifest ui-frame row "${id}"`);
    return s;
  };

  const dialogue = need("ui-dialogue-box");
  const menu = need("ui-menu-panel");
  const hud = need("ui-battle-hud-frame");
  const ledger = need("ui-ledger-panel");
  const dex = need("ui-dex-card-frame");
  const sign = need("ui-sign-card-frame");

  const screen = virtualScreen();
  if (ledger.width !== screen.width || ledger.height !== screen.height) {
    throw new Error(
      `tools/ui-frames: ui-ledger-panel is ${ledger.width}×${ledger.height} but balance.map is ` +
        `${screen.width}×${screen.height}; the ledger IS the screen and the two must agree.`,
    );
  }

  return [
    {
      size: dialogue,
      canvas: stretchy(dialogue, theme),
      nineSlice: true,
      note: "drawn at 464×68 by DialogueScene.dialogueBoxRect — stretches",
    },
    {
      size: menu,
      canvas: stretchy(menu, theme),
      nineSlice: true,
      note: "height follows the row count — stretches",
    },
    {
      size: hud,
      canvas: stretchy(hud, theme),
      nineSlice: true,
      note: "drawn at 150×46 by BattleHud.CARD_GEOMETRY — stretches",
    },
    { size: ledger, canvas: ledgerPanel(ledger, theme), nineSlice: false, note: "IS the virtual screen — 1:1" },
    { size: dex, canvas: dexCardFrame(dex, theme), nineSlice: false, note: "fixed card — 1:1" },
    { size: sign, canvas: signCardFrame(sign), nineSlice: false, note: "world prop, wood roles — 1:1" },
    {
      size: TITLE_BANNER,
      canvas: titleBanner(TITLE_BANNER, theme),
      nineSlice: false,
      note: "NO manifest row — size from TitleScene.BANNER_W/H; transparent, no plate",
    },
  ];
}
