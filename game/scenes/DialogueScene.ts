/**
 * game/scenes/DialogueScene.ts — the Gold text box (build-doc §15 lane C7).
 *
 * The corpus's replayer, and nothing else. `game/dialogue-runner.ts` owns the state machine and
 * `core/dialogue-schema.ts` owns condition resolution; this file owns where the box sits, how fast
 * the letters arrive, and which key moves the run on — exactly the split `game/scenes/BattleScene`
 * has against `core/battle.ts` (L11's discipline, one level up).
 *
 * G7 IS ABSOLUTE HERE, because this is the first screen in the game that puts WORDS on it. Every
 * string a player reads through this scene comes out of `data/dialogue.json`. The only strings this
 * file authors are three glyphs of chrome — the advance marker, the choice cursor and the blank it
 * is replaced by — and a name plate that prints a speaker's own `name`. Nothing here comments on
 * catching, and nothing here may.
 *
 * Engine-free at runtime (`import type` only): `import "phaser"` throws `window is not defined`
 * under vitest's node environment, so {@link createDialogueScene} takes the engine as an argument
 * and the whole scene — box geometry, crawl, choice cursor, key handling — stays drivable from a
 * node test. That is the same factory shape `createYearTurnScene` uses, for the same reason: the
 * defects that matter live in the class, not in the model.
 */

import type PhaserNS from "phaser";

import { DIALOGUE, type DialogueFile } from "@core/dialogue-schema";
import type { Balance } from "@core/types";
import {
  advanceRun,
  awaitingChoice,
  beginRun,
  chooseOption,
  currentChoices,
  currentEntry,
  currentLine,
  currentSpeaker,
  type DialogueRunState,
} from "@game/dialogue-runner";
import { SCENE_KEYS } from "@game/scene-keys";
import { TEXT_SPEED_CPS, registry, type TextSpeed } from "@game/registry";

/** From the ONE registry (game/scene-keys.ts) — never a second spelling declared here. */
export const DIALOGUE_SCENE_KEY = SCENE_KEYS.dialogue;

/* ────────────────────────────────────────────────────────────────────────────
 * Layout — presentation only. Not gameplay tunables (G11).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DialogueStyle {
  width: number;
  height: number;
  /** Margin between the box and the edge of the virtual screen. */
  margin: number;
  /** Padding inside the box. */
  pad: number;
  lineHeight: number;
  /** Advance width of one character at `fontSize`, in px — what decides how many fit on a line. */
  charWidth: number;
  /** Body lines the box shows at once. Gold shows two; three fits the 480×320 box comfortably. */
  bodyLines: number;
  /**
   * Frames a line must have been on screen before a keypress advances it — the sibling of
   * `YearTurnSceneStyle.advanceArmFrames`, and the same measured defect: a held key walks a whole
   * chain in four frames and the beat is gone before it was readable.
   */
  advanceArmFrames: number;
  boxColor: number;
  borderColor: number;
  textColor: string;
  dimColor: string;
  fontFamily: string;
  fontSize: string;
  nameSize: string;
  /** Chrome, not copy: the only glyphs this file authors. */
  advanceMarker: string;
  choiceCursor: string;
  choiceBlank: string;
}

/**
 * The box at the virtual resolution `data/balance.json` states.
 *
 * A function rather than a constant because the two numbers that size it are DATA — `game/boot.ts`
 * states the rule verbatim ("build-doc §7.6's 480×320 is `map.virtualWidth`/`map.virtualHeight`,
 * never a literal here") and every other scene in the repo reads it.
 */
export function defaultDialogueStyle(balance: Balance): DialogueStyle {
  return {
    width: balance.map.virtualWidth,
    height: balance.map.virtualHeight,
    margin: 8,
    pad: 8,
    lineHeight: 13,
    charWidth: 6,
    bodyLines: 3,
    advanceArmFrames: 4,
    boxColor: 0x101317,
    borderColor: 0xe8e4c9,
    textColor: "#e8e4c9",
    dimColor: "#7d8478",
    fontFamily: "monospace",
    fontSize: "10px",
    nameSize: "10px",
    advanceMarker: "▼",
    choiceCursor: "▶",
    choiceBlank: " ",
  };
}

export interface DialogueBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the box sits: full width less the margin, anchored to the BOTTOM of the screen, tall enough
 * for its body lines plus the name plate row.
 */
export function dialogueBoxRect(style: DialogueStyle): DialogueBoxRect {
  const width = style.width - style.margin * 2;
  const height = style.pad * 2 + style.lineHeight * (style.bodyLines + 1);
  return { x: style.margin, y: style.height - style.margin - height, width, height };
}

/** How many characters fit on one line inside the box. */
export function dialogueColumns(style: DialogueStyle): number {
  const rect = dialogueBoxRect(style);
  return Math.max(1, Math.floor((rect.width - style.pad * 2) / style.charWidth));
}

/**
 * Word-wrap to `columns`, breaking a word longer than the line rather than letting it run off the
 * right edge.
 *
 * The corpus caps a line body at 400 characters and a choice prompt at 120 — `core/dialogue-schema`
 * enforces both, on the stated grounds that they "must fit the 480×320 dialogue box". 400 characters
 * is roughly six wrapped rows at these columns, so a long entry PAGES rather than overflowing; the
 * scene shows `bodyLines` rows at a time and the advance key turns the page.
 */
export function wrapDialogue(text: string, columns: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter((w) => w.length > 0)) {
    let piece = word;
    while (piece.length > columns) {
      if (line.length > 0) {
        out.push(line);
        line = "";
      }
      out.push(piece.slice(0, columns));
      piece = piece.slice(columns);
    }
    const candidate = line.length === 0 ? piece : `${line} ${piece}`;
    if (candidate.length > columns) {
      out.push(line);
      line = piece;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) out.push(line);
  return out.length > 0 ? out : [""];
}

/** The rows of the current page of a wrapped line. */
export function pageOf(rows: readonly string[], page: number, bodyLines: number): string[] {
  return rows.slice(page * bodyLines, page * bodyLines + bodyLines);
}

/** How many pages a wrapped line takes. */
export function pageCount(rows: readonly string[], bodyLines: number): number {
  return Math.max(1, Math.ceil(rows.length / bodyLines));
}

/**
 * The crawl, as characters: how much of `rows` is visible after `shown` characters have arrived.
 *
 * Counted across the whole page rather than per row, so the crawl reads as one sentence arriving
 * and not as three rows racing. `shown` at or past the total returns every row intact.
 */
export function crawl(rows: readonly string[], shown: number): string[] {
  let left = Math.max(0, Math.floor(shown));
  return rows.map((row) => {
    if (left >= row.length) {
      left -= row.length;
      return row;
    }
    const cut = row.slice(0, left);
    left = 0;
    return cut;
  });
}

/** Total characters on a page — when `shown` reaches this the crawl is finished. */
export function crawlLength(rows: readonly string[]): number {
  return rows.reduce((n, row) => n + row.length, 0);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The scene
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DialogueSceneData {
  /** Which entry to play. Its `when` was already resolved by whoever selected it. */
  entryId: string;
  /** The corpus. Omitted ⇒ the shipped, validated one. */
  file?: DialogueFile;
  /** bible §12's text-speed setting. Omitted ⇒ the live setting from `game/registry.ts`. */
  textSpeed?: TextSpeed;
  /** Called once, with the finished run — the caller writes its flags to the save. */
  onDone: (state: DialogueRunState) => void;
  style?: DialogueStyle;
}

interface KeyLike {
  repeat?: boolean;
}

interface DrawnObject {
  destroy: () => void;
}

/**
 * Build the dialogue scene against a caller-supplied Phaser namespace.
 *
 * Boot does:  game.scene.add(DIALOGUE_SCENE_KEY, createDialogueScene(Phaser));
 */
export function createDialogueScene(
  P: typeof PhaserNS,
  styleOverride?: DialogueStyle,
): typeof PhaserNS.Scene {
  return class DialogueScene extends P.Scene {
    private file!: DialogueFile;
    private state!: DialogueRunState;
    private onDone!: (state: DialogueRunState) => void;
    private style!: DialogueStyle;
    private cps = 0;
    /** Characters of the current page that have arrived. */
    private shown = 0;
    /** Which page of the current line is on screen (a long line pages; see `wrapDialogue`). */
    private page = 0;
    private choiceIndex = 0;
    private framesShown = 0;
    private finished = false;
    private drawn: DrawnObject[] = [];

    constructor() {
      super({ key: DIALOGUE_SCENE_KEY });
    }

    init(data: DialogueSceneData): void {
      this.file = data.file ?? DIALOGUE;
      this.state = beginRun(this.file, data.entryId);
      this.onDone = data.onDone;
      this.style = styleOverride ?? data.style ?? defaultDialogueStyle(registry.balance());
      const speed = data.textSpeed ?? registry.settings().textSpeed;
      this.cps = TEXT_SPEED_CPS[speed];
      this.shown = this.cps === 0 ? Number.MAX_SAFE_INTEGER : 0;
      this.page = 0;
      this.choiceIndex = 0;
      this.framesShown = 0;
      this.finished = false;
      this.drawn = [];
    }

    create(): void {
      const keyboard = this.input.keyboard;
      if (keyboard) {
        // Registered so Phaser suppresses OS key repeat for them — see the note in RetirementScene.
        const register = (keyboard as { addKey?: (key: string) => unknown }).addKey;
        if (typeof register === "function") {
          for (const key of ["SPACE", "ENTER", "UP", "DOWN"]) register.call(keyboard, key);
        }
        keyboard.on("keydown-SPACE", (e?: KeyLike) => this.onConfirm(e));
        keyboard.on("keydown-ENTER", (e?: KeyLike) => this.onConfirm(e));
        keyboard.on("keydown-UP", () => this.moveCursor(-1));
        keyboard.on("keydown-DOWN", () => this.moveCursor(1));
      }
      this.redraw();
    }

    override update(_time: number, delta: number): void {
      this.framesShown += 1;
      if (this.finished || this.cps === 0) return;
      const before = this.shown;
      this.shown += (this.cps * delta) / MS_PER_SECOND;
      // Redraw only while letters are actually arriving — the crawl is the only per-frame work
      // this scene does, and a finished page must not repaint every frame behind a paused overworld.
      if (Math.floor(before) !== Math.floor(this.shown) && !this.crawlDone()) this.redraw();
      else if (Math.floor(before) !== Math.floor(this.shown)) this.redraw();
    }

    /* ── the run ────────────────────────────────────────────────────────── */

    /** The wrapped rows of the line currently on screen. */
    private rows(): string[] {
      return wrapDialogue(currentLine(this.file, this.state).text, dialogueColumns(this.style));
    }

    private pageRows(): string[] {
      return pageOf(this.rows(), this.page, this.style.bodyLines);
    }

    private crawlDone(): boolean {
      return this.shown >= crawlLength(this.pageRows());
    }

    private onConfirm(event: KeyLike | undefined): void {
      if (event?.repeat === true) return;
      if (this.finished) return;
      if (this.framesShown < this.style.advanceArmFrames) return;
      this.framesShown = 0;

      // Gold's rule: the first press completes the crawl, the second moves on. A player who reads
      // faster than the setting is never made to wait for it.
      if (!this.crawlDone()) {
        this.shown = crawlLength(this.pageRows());
        this.redraw();
        return;
      }

      if (awaitingChoice(this.file, this.state)) {
        this.state = chooseOption(this.file, this.state, this.choiceIndex);
        this.onEntered();
        return;
      }

      // A long line pages before it advances, or the tail of a 400-character body is never read.
      if (this.page < pageCount(this.rows(), this.style.bodyLines) - 1) {
        this.page += 1;
        this.shown = this.cps === 0 ? Number.MAX_SAFE_INTEGER : 0;
        this.redraw();
        return;
      }

      this.state = advanceRun(this.file, this.state);
      this.onEntered();
    }

    /** After any transition: reset the crawl, and finish when the chain has played out. */
    private onEntered(): void {
      this.page = 0;
      this.choiceIndex = 0;
      this.shown = this.cps === 0 ? Number.MAX_SAFE_INTEGER : 0;
      if (this.state.finished) {
        this.finish();
        return;
      }
      this.redraw();
    }

    private moveCursor(delta: number): void {
      if (this.finished || !awaitingChoice(this.file, this.state)) return;
      const options = currentChoices(this.file, this.state);
      if (options.length === 0) return;
      this.choiceIndex = (this.choiceIndex + delta + options.length) % options.length;
      this.redraw();
    }

    private finish(): void {
      if (this.finished) return;
      this.finished = true;
      for (const item of this.drawn) item.destroy();
      this.drawn = [];
      if (this.state.problem !== null) console.warn(`[dialogue] ${this.state.problem}`);
      this.onDone(this.state);
      this.scene.stop();
    }

    /* ── drawing ────────────────────────────────────────────────────────── */

    private redraw(): void {
      for (const item of this.drawn) item.destroy();
      this.drawn = [];
      if (this.state.finished) return;

      const style = this.style;
      const rect = dialogueBoxRect(style);

      // Border, then fill inset by one pixel: a Gold box is a light frame around a dark field, and
      // two rectangles is the whole of it.
      const border = this.add.rectangle(rect.x, rect.y, rect.width, rect.height, style.borderColor);
      border.setOrigin(0, 0);
      this.drawn.push(border);
      const fill = this.add.rectangle(
        rect.x + BORDER_PX,
        rect.y + BORDER_PX,
        rect.width - BORDER_PX * 2,
        rect.height - BORDER_PX * 2,
        style.boxColor,
      );
      fill.setOrigin(0, 0);
      this.drawn.push(fill);

      const left = rect.x + style.pad;
      let y = rect.y + style.pad;

      // The name plate is the speaker's own `name` from the corpus's speaker table — never a
      // description, never an epithet this file invents (G2).
      const speaker = currentSpeaker(this.file, this.state);
      const plate = this.add.text(left, y, speaker?.name ?? currentLine(this.file, this.state).speaker, {
        fontFamily: style.fontFamily,
        fontSize: style.nameSize,
        color: style.dimColor,
      });
      plate.setOrigin(0, 0);
      this.drawn.push(plate);
      y += style.lineHeight;

      const choices = currentChoices(this.file, this.state);
      const body = choices.length > 0 ? this.pageRows() : crawl(this.pageRows(), this.shown);
      for (const row of body) {
        const text = this.add.text(left, y, row, {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          color: style.textColor,
        });
        text.setOrigin(0, 0);
        this.drawn.push(text);
        y += style.lineHeight;
      }

      if (choices.length > 0) {
        // The choice list replaces the advance marker: there is nothing to advance to until one is
        // taken, and a box showing both would be lying about which key does what.
        this.drawChoices(rect, choices);
        return;
      }

      if (this.crawlDone()) {
        const marker = this.add.text(
          rect.x + rect.width - style.pad - style.charWidth,
          rect.y + rect.height - style.pad - style.lineHeight,
          style.advanceMarker,
          { fontFamily: style.fontFamily, fontSize: style.fontSize, color: style.dimColor },
        );
        marker.setOrigin(0, 0);
        this.drawn.push(marker);
      }
    }

    /**
     * The choice list, in its own panel above the box.
     *
     * Above, not inside: the corpus allows four options of up to 120 characters each and the body
     * box holds `bodyLines` rows, so a list drawn inside it would push the question that prompted
     * the choice off the screen.
     */
    private drawChoices(rect: DialogueBoxRect, choices: readonly string[]): void {
      const style = this.style;
      const columns = dialogueColumns(style);
      const rows = choices.map((text, i) => {
        const cursor = i === this.choiceIndex ? style.choiceCursor : style.choiceBlank;
        return `${cursor} ${text}`.slice(0, columns);
      });
      const height = style.pad * 2 + style.lineHeight * rows.length;
      const y = rect.y - style.margin - height;

      const border = this.add.rectangle(rect.x, y, rect.width, height, style.borderColor);
      border.setOrigin(0, 0);
      this.drawn.push(border);
      const fill = this.add.rectangle(
        rect.x + BORDER_PX,
        y + BORDER_PX,
        rect.width - BORDER_PX * 2,
        height - BORDER_PX * 2,
        style.boxColor,
      );
      fill.setOrigin(0, 0);
      this.drawn.push(fill);

      let row = y + style.pad;
      for (const [i, line] of rows.entries()) {
        const text = this.add.text(rect.x + style.pad, row, line, {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          color: i === this.choiceIndex ? style.textColor : style.dimColor,
        });
        text.setOrigin(0, 0);
        this.drawn.push(text);
        row += style.lineHeight;
      }
    }

    /* ── reads, for tests and for the scene that launched this one ──────── */

    /** The run as it stands. A read; nothing may set it from outside. */
    runState(): DialogueRunState {
      return this.state;
    }

    /** Every row currently on screen, in draw order — what a player is actually reading. */
    renderedLines(): string[] {
      const choices = currentChoices(this.file, this.state);
      const body = choices.length > 0 ? this.pageRows() : crawl(this.pageRows(), this.shown);
      const speaker = currentSpeaker(this.file, this.state);
      const plate = speaker?.name ?? currentLine(this.file, this.state).speaker;
      const columns = dialogueColumns(this.style);
      const options = choices.map((text, i) => {
        const cursor = i === this.choiceIndex ? this.style.choiceCursor : this.style.choiceBlank;
        return `${cursor} ${text}`.slice(0, columns);
      });
      return [plate, ...body, ...options];
    }

    /** The entry on screen — how a test says "the run is where I think it is". */
    entryOnScreen(): string {
      return currentEntry(this.file, this.state).id;
    }

    /** Which choice the cursor is on. */
    cursor(): number {
      return this.choiceIndex;
    }
  };
}

/** Milliseconds per second — the crawl's unit conversion, not a tunable. */
const MS_PER_SECOND = 1000;
/** The Gold box's frame, in virtual pixels. Presentation. */
const BORDER_PX = 1;

export default createDialogueScene;
