/**
 * game/menu-model.ts — the parts of the title/menu screens that are arithmetic, not drawing.
 *
 * Why this file exists: `game/scenes/*.ts` extend `Phaser.Scene`, and `import "phaser"` throws
 * `window is not defined` under vitest's node environment (measured — the loader dies in
 * `phaser/src/device/OS.js`). So every line that lives in a scene is a line no test in this repo can
 * reach, and G14 says nothing is done before its tests pass. The rule this file establishes for Lane
 * C1: **a scene may draw, route and listen; anything it DECIDES lives here, engine-free.**
 *
 * That is not a style preference. Both title-screen defects found by the C1 audit — a warning note
 * overprinting the byline, and slot messages that named no slot — were geometry and string
 * composition sitting inside a scene where no assertion could see them. They are functions here now,
 * and tests/unit/game-menu-model.test.ts pins both.
 *
 * G7 applies to every string below: state what happened, with numbers where there are numbers.
 */

import type { SlotStatus } from "./storage";
import { slotLabel } from "./storage";
import { swatchHex } from "./ui/Palette";

/* ────────────────────────────────────────────────────────────────────────────
 * The C1 screens' colours (build-doc §8.4)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The swatch each C1 screen role paints with, as palette IDS.
 *
 * WAS six hexes inlined in `game/scenes/MenuScene.ts` (`#0d0f0c`, `#d8d8c8`, …), none of which is
 * one of the 32 frozen swatches — exactly what `game/ui/Palette.ts`'s header warns about: "a widget
 * that inlines `0xe8e4c9` silently survives the freeze and then disagrees with every generated asset
 * around it". `data/palette.json` is now `frozen: true`, so a menu painted outside it is a menu that
 * will not match the art it sits next to.
 *
 * They live HERE rather than in the scene for the reason this whole file exists: a scene cannot be
 * imported by a node test, so a palette rule inside one is a palette rule nothing can check.
 *
 * Chosen by measured contrast against the background swatch rather than by eye — a menu whose text
 * the player cannot read is not palette compliance, it is a different defect. Against `c00`
 * (#030202) these are 17.5 : 1 (text), 6.6 : 1 (dim), 12.3 : 1 (accent), 5.4 : 1 (danger) and
 * 11.0 : 1 (ok). `game/ui/Palette.ts`'s `UI_SWATCH` is deliberately NOT reused — but NOT because its
 * ink differs. Where the two tables share a role name they name the SAME swatch: `text` is `c18` in
 * both, `accent` is `c15` in both. They are separate because they are tuned against different
 * GROUND. `UI_SWATCH` paints the battle HUD, whose plate is `panel: c05` (#6e3620) and whose
 * selection bar is `cursor: c02`, so its `cursorInk` (c03), `cursorInkMuted` (c07) and `cursorInkDim`
 * (c08) are DARK ink meant to be read ON a light bar: against the `c00` void THIS table paints on
 * they are 1.2 : 1, 3.3 : 1 and 3.4 : 1 — unreadable here. `UI_SWATCH` also carries no `bg`, `dim`,
 * `danger` or `ok` role at all, which is four of the six roles below.
 *
 * `tests/unit/game-menu-model.test.ts` READS both tables out of `game/ui/Palette.ts` and pins every
 * clause of that paragraph, rather than restating a swatch id. It has to: the sentence this replaces
 * claimed `UI_SWATCH.text` was `c07` (#765b4e, 3.3 : 1 on black), which stopped being true when the
 * battle HUD was un-inverted and `c07` was repurposed to `cursorInkMuted`, and nothing caught it.
 */
export const UI_SWATCH_ID = {
  bg: "c00",
  text: "c18",
  dim: "c12",
  accent: "c15",
  danger: "c09",
  ok: "c20",
} as const;

/** The same roles as `"#rrggbb"`, resolved through `data/palette.json`. */
export const UI = {
  bg: swatchHex(UI_SWATCH_ID.bg),
  text: swatchHex(UI_SWATCH_ID.text),
  dim: swatchHex(UI_SWATCH_ID.dim),
  accent: swatchHex(UI_SWATCH_ID.accent),
  danger: swatchHex(UI_SWATCH_ID.danger),
  ok: swatchHex(UI_SWATCH_ID.ok),
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Bottom-anchored layout
 * ──────────────────────────────────────────────────────────────────────────── */

/** One laid-out band: the top edge it should be drawn at, and the height it occupies. */
export interface StackedBand {
  top: number;
  height: number;
}

/**
 * Stack a run of text blocks upward from the bottom margin, first entry lowest.
 *
 * The title screen used to pin its byline at a fixed `height - 34` and then anchor a variable-height
 * warning note to `height - margin - note.height`. Those two are independent, so the moment the note
 * wrapped past two lines it drew straight through the byline — on the one screen whose job is to say
 * that a save is unreadable. A stack cannot do that: every band's top is the previous band's top
 * minus its own height, so blocks are laid out relative to each other rather than to two unrelated
 * constants.
 */
export function stackFromBottom(
  heights: readonly number[],
  viewportHeight: number,
  marginPx: number,
  gapPx = 0,
): StackedBand[] {
  const out: StackedBand[] = [];
  let bottom = viewportHeight - marginPx;
  for (const raw of heights) {
    const height = Math.max(0, raw);
    const top = bottom - height;
    out.push({ top, height });
    bottom = top - gapPx;
  }
  return out;
}

/** Does this stack collide with anything, or leave the screen? Used by the layout test and by callers. */
export function stackProblem(bands: readonly StackedBand[], viewportHeight: number): string | null {
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i];
    if (!band) continue;
    if (band.top < 0) return `band ${i} starts above the screen (top ${band.top})`;
    if (band.top + band.height > viewportHeight) {
      return `band ${i} ends below the screen (bottom ${band.top + band.height})`;
    }
    const next = bands[i + 1];
    if (next && next.top + next.height > band.top) {
      return `band ${i + 1} overlaps band ${i}`;
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The title screen's warning block
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TitleNoteInput {
  /** From `installStorage()` — set when this run cannot be persisted at all. */
  storageWarning?: string | null;
  /** Every slot that came back `unreadable`, in slot order. */
  unreadable: readonly SlotStatus[];
  /** Above this many lines the slot problems collapse to one summary line. */
  maxLines?: number;
}

const DEFAULT_MAX_NOTE_LINES = 4;

/**
 * The red lines under the title, one per line, ALREADY naming their slot.
 *
 * Two rules:
 *   • one entry per line, never joined into a paragraph — three unreadable slots used to render as
 *     three sentences run together with nothing separating them;
 *   • the slot is named. `SaveStorage` composes the label into the message itself (see
 *     `game/storage.ts` `problemOf`), the same way it always did for write and delete failures, so
 *     this function does not restate it and the two cannot drift apart.
 */
export function titleNotes(input: TitleNoteInput): string[] {
  const max = Math.max(1, input.maxLines ?? DEFAULT_MAX_NOTE_LINES);
  const lines: string[] = [];
  if (input.storageWarning) lines.push(input.storageWarning);

  const problems = input.unreadable.map((s) => s.message);
  if (lines.length + problems.length <= max) {
    lines.push(...problems);
    return lines;
  }
  if (problems.length > 0) {
    const labels = input.unreadable.map((s) => slotLabel(s.slot)).join(", ");
    lines.push(`${problems.length} slots could not be read: ${labels}.`);
  }
  return lines;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Slot rows
 * ──────────────────────────────────────────────────────────────────────────── */

/** The right-hand word on a slot row. */
export function slotHeadline(status: SlotStatus): string {
  switch (status.state) {
    case "empty":
      return "EMPTY";
    case "ok":
      return `YEAR ${status.save?.year ?? "?"}`;
    default:
      return "UNREADABLE";
  }
}

/**
 * May this row be chosen, and if not, why not?
 *
 * The defect this replaces: the CONTINUE list disabled every non-`ok` slot, which made the
 * delete-confirmation branch behind it unreachable code — a player with a corrupt or wrong-version
 * slot got no prompt, no message and no way to clear it. An unreadable slot is now selectable
 * BECAUSE the only useful thing left to do with it (delete it) needs a selection to hang off.
 */
export function slotSelectable(
  intent: "new" | "continue",
  status: SlotStatus,
): { enabled: boolean; reason: string | null } {
  if (intent === "new") return { enabled: true, reason: null };
  if (status.state === "ok") return { enabled: true, reason: null };
  if (status.state === "unreadable") return { enabled: true, reason: null };
  return { enabled: false, reason: "Nothing to continue." };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Scene data
 * ──────────────────────────────────────────────────────────────────────────── */

export type MenuRequest =
  | { mode: "slots"; intent: "new" | "continue" }
  | { mode: "settings"; from: "title" | "session" }
  | { mode: "session" };

export const DEFAULT_MENU_REQUEST: MenuRequest = { mode: "slots", intent: "new" };

/** Phaser hands `init` whatever the caller passed, typed `unknown`. This is the gate. */
export function isMenuRequest(data: unknown): data is MenuRequest {
  if (typeof data !== "object" || data === null) return false;
  const mode = (data as { mode?: unknown }).mode;
  if (mode === "slots") {
    const intent = (data as { intent?: unknown }).intent;
    return intent === "new" || intent === "continue";
  }
  if (mode === "settings") {
    const from = (data as { from?: unknown }).from;
    return from === "title" || from === "session";
  }
  return mode === "session";
}
