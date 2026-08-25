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
