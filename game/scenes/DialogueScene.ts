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

import { DIALOGUE, type DialogueFile, type DialogueSpeaker } from "@core/dialogue-schema";
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
import { placeholderImage, realAssetIds } from "@game/placeholder";
import { SCENE_KEYS } from "@game/scene-keys";
import { TEXT_SPEED_CPS, registry, type TextSpeed } from "@game/registry";
import { swatchColor, swatchHex } from "@game/ui/Palette";

/** From the ONE registry (game/scene-keys.ts) — never a second spelling declared here. */
export const DIALOGUE_SCENE_KEY = SCENE_KEYS.dialogue;

/* ────────────────────────────────────────────────────────────────────────────
 * The speaker's face
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  `DialogueSpeaker.portrait` WAS AUTHORED ON ALL 63 SPEAKERS AND READ BY NOTHING
 * ─────────────────────────────────────────────────────────────────────────────
 * `core/dialogue-schema.ts` has carried `portrait` — "Asset manifest row id
 * (tools/comfy/manifest.json) that draws this speaker" — as a REQUIRED field since the corpus was
 * written, and until this slot existed the only thing this scene did with a speaker was print
 * `speaker.name` on the plate. Twelve finished `npc-static` sprites sat in `assets/final/` with no
 * consumer anywhere in `game/`.
 *
 * A PORTRAIT ID IS A MANIFEST ROW ID, NOT A TEXTURE KEY, and the two are never the same string:
 * `npc-bram` is the row, `assets/final/npc-static/npc-bram.png` is its `finalFile`, and
 * `game/placeholder.ts::assetId` turns that into the texture key `npc-static/npc-bram`. That gap is
 * the defect `game/ui/BattleHud.ts` documents at length — 162 invented keys against 150 manifest
 * ids, intersection zero, every sprite silently drawing a stand-in the day the art landed. So the
 * key is NOT spelled here from a prefix convention. {@link portraitAssetId} resolves it against
 * `realAssetIds()`, the build-time census of what is actually under `assets/final/`, which is the
 * pipeline's own output and therefore cannot drift from the manifest that produced it.
 *
 * The 25 distinct portrait ids the corpus uses span THREE manifest classes — `npc-static` (12 rows,
 * shipped), `trainer-battle` (8 rows, unbuilt) and `prop` (4 rows, unbuilt) — which is why a single
 * `finalDir` constant of the `BATTLE_SPRITE_DIR` kind cannot answer this and a census lookup can.
 * An id the census does not know resolves to ITSELF, so `textureFor` draws the labelled stand-in
 * named for the row the art lane still owes, and the real plate takes over the moment it lands with
 * no code change here.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The texture key for a speaker's `portrait`, or the portrait id itself when no such asset is built.
 *
 * Basename-matched against the real-art census rather than assembled from a class prefix: the census
 * IS `<finalDir minus assets/final/>/<row id>` for every file the pipeline has produced, so the row
 * id is exactly its last path segment. `realAssetIds()` is sorted and first-wins, so a future
 * collision between two directories carrying the same file name resolves the same way on every run
 * instead of by glob order — and `tests/unit/dialogue-scene.test.ts` fails if one ever appears.
 */
export function portraitAssetId(portrait: string): string {
  return portraitIndex().get(portrait) ?? portrait;
}

let portraitRows: Map<string, string> | null = null;
let portraitRowsFrom = -1;

function portraitIndex(): Map<string, string> {
  const ids = realAssetIds();
  // Rebuilt when the census grows — `registerRealAsset` can add to it after this module loaded.
  if (portraitRows === null || portraitRowsFrom !== ids.length) {
    const rows = new Map<string, string>();
    for (const id of ids) {
      const at = id.lastIndexOf("/");
      const row = at >= 0 ? id.slice(at + 1) : id;
      if (!rows.has(row)) rows.set(row, id);
    }
    portraitRows = rows;
    portraitRowsFrom = ids.length;
  }
  return portraitRows;
}

/**
 * Does this speaker have a face to draw?
 *
 * READ OFF THE CORPUS, NOT OFF A LIST OF IDS. `data/dialogue.json` gives exactly one speaker a blank
 * `name` — `narration`, whose name is a single space so the plate prints nothing — and that blank is
 * the corpus's own way of writing "nobody is on screen for this line". Its `portrait` names no row
 * in `tools/comfy/manifest.json` and never will, so drawing the honest stand-in for it would put a
 * hatched PLACEHOLDER block beside six lines of prose (the blackout narration among them) claiming
 * an asset the art lane does not owe.
 *
 * The SLOT is still reserved — see {@link dialoguePortraitRect}. The box's geometry must not move
 * between a line spoken by a person and a line spoken by nobody, because a text column that changed
 * width mid-chain is a worse artefact than an empty corner.
 */
export function speakerHasFace(speaker: DialogueSpeaker | undefined): speaker is DialogueSpeaker {
  return speaker !== undefined && speaker.name.trim().length > 0 && speaker.portrait.trim().length > 0;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The painted frame
 *
 * `tools/comfy/manifest.json` row `ui-dialogue-box`, class `ui-frame`, whose `finalDir` is
 * `assets/final/ui-frame` — so the texture key is that path minus `assets/final/`, exactly as
 * `game/ui/BattleHud.ts::BATTLE_SPRITE_DIR` derives its own. Six finished `ui-frame` assets shipped
 * with no consumer; this is the first of them to reach a screen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE FRAME IS A RING. ITS INTERIOR IS NEVER DRAWN, AND THAT IS NOT A SHORTCUT.
 * ─────────────────────────────────────────────────────────────────────────────
 * MEASURED off the shipped PNG (480×96): a 2px `#040308` outer edge over a 2px `#74564e` inner edge,
 * around a flat `#faf7eb` interior. **`#faf7eb` is `swatchHex(DIALOGUE_SWATCH_ID.text)` — the body
 * copy's own colour.** Adopt the frame's interior as the panel body, the way the manifest's
 * `ui-frame` `_postprocessNote` intends ("the 'empty interior' is the panel body, not a hole"), and
 * every authored line in the game is drawn at 1 : 1 contrast against its own background — invisible,
 * while `tests/gates/ui-contrast-contract.test.ts` stays green, because that gate measures `text` on
 * the `box` SWATCH and has no way to know a PNG is being painted there instead.
 *
 * So the ring is drawn from the art and the field inside it stays `boxColor` (`c00`), which keeps
 * every ratio that gate measures true of the pixels. Reading the frame's interior as the body is a
 * palette-role change (build-doc §8.4) and is not this file's call to make.
 *
 * WHY NOT `this.add.nineslice`. Phaser 3.90 HAS `GameObjects.NineSlice` — and ships it with
 * `NineSliceWebGLRenderer.js` and NO canvas sibling. `game/boot.ts` starts the game with `P.AUTO`,
 * which falls back to Canvas wherever WebGL is unavailable, and there the whole frame would render
 * as nothing at all: not a crash, not a warning, just a box with no edge. A nine-slice is eight
 * images and a rule about which of them stretch, so it is drawn here instead — corners at natural
 * size, edges stretched along their own axis only, no centre. Renderer-independent, and it cannot
 * squash a corner.
 * ──────────────────────────────────────────────────────────────────────────── */

/** `tools/comfy/manifest.json` row `ui-dialogue-box` at `classes["ui-frame"].finalDir`. */
export const DIALOGUE_FRAME_ASSET_ID = "ui-frame/ui-dialogue-box";

/** The eight pieces of the ring, in draw order. `stretchX`/`stretchY` say which axis may scale. */
const FRAME_PIECES = [
  { name: "slice-tl", col: 0, row: 0 },
  { name: "slice-t", col: 1, row: 0 },
  { name: "slice-tr", col: 2, row: 0 },
  { name: "slice-l", col: 0, row: 1 },
  { name: "slice-r", col: 2, row: 1 },
  { name: "slice-bl", col: 0, row: 2 },
  { name: "slice-b", col: 1, row: 2 },
  { name: "slice-br", col: 2, row: 2 },
] as const;

/* ────────────────────────────────────────────────────────────────────────────
 * The box's colours (build-doc §8.4)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The four colours the text box paints with, as PALETTE IDS.
 *
 * THE DEFECT THIS REPLACES: {@link defaultDialogueStyle} wrote out `0x101317`, `0xe8e4c9`,
 * `#e8e4c9` and `#7d8478`, and **not one of them is one of the 32 swatches** `data/palette.json`
 * holds. Three of the four are not new: `0xe8e4c9`/`#e8e4c9` is named verbatim in BOTH
 * `game/scenes/RetirementScene.ts` `RETIREMENT_SWATCH_ID` and `game/ui/SeasonMeter.ts`
 * `SEASON_METER_SWATCH_ID` as the defect each of them replaced, and `#7d8478` in the first of those
 * — re-typed here into a third style block while a raw-hex ceiling sized to exactly four sat over
 * this file and stayed green. (`0x101317` is still live in `game/scenes/YearTurnScene.ts`, with
 * `#e8e4c9` and `#7d8478` beside it: same three, a fourth style block, another lane's scope.)
 * `data/palette.json` is `"frozen": true` and the freeze is a VALUE SWAP over
 * stable ids (build-doc §8.4), so a hex typed into a style block survives it untouched and then
 * disagrees with every generated asset drawn beside it — and this box is the widget that puts
 * `data/dialogue.json` on the screen, over the painted town and route art, so it is one of the two
 * places (with the season meter) where UI pixels sit directly against generated pixels.
 *
 * They live here, above the Phaser class, for the reason `game/menu-model.ts` states: a palette
 * rule inside a scene is a rule no node test can import. This scene is engine-free at runtime
 * (`import type PhaserNS` only), so this table AND the style object it feeds are both reachable
 * from `tests/gates/ui-contrast-contract.test.ts`, which recomputes every ratio below.
 *
 * ROLES FOLLOW THE HOUSE TABLE in `game/menu-model.ts` (`UI_SWATCH_ID`), the same way
 * `RETIREMENT_SWATCH_ID` does, so the box, the menu and the Legacy card are one palette: `box` is
 * that table's `bg` (`c00`), `text` its `text` (`c03`), `dim` its `dim` (`c01`). `border` has no
 * counterpart there — the C1 screens have no plate and therefore no stroke — so it takes
 * `game/ui/Palette.ts`'s `UI_SWATCH.border` (`c12`), the build's one muted neutral hairline.
 *
 * MEASURED against the shipped frozen file, with the hex each id replaces in brackets:
 *   `text` (#faf7eb) on the box  19.15 : 1  [#e8e4c9 on #101317 was 14.52 : 1]
 *   `dim`  (#8898a5) on the box   6.93 : 1  [#7d8478 on #101317 was  4.83 : 1]
 *   `border` (#c8bca5) on the box 10.95 : 1 — a MARK (WCAG 1.4.11's 3 : 1), not a label
 *     [the hexes made the border and the body copy the SAME colour, #e8e4c9: the frame competed
 *      with the sentence inside it. A role names one surface, so the stroke is its own swatch now.]
 * `dim` is held to the 4.5 : 1 TEXT floor rather than to a dimmer one because it is not a greyed
 * role: it paints the speaker's name plate, the ▼ advance marker, and every choice row the cursor
 * is not on — and an unselected choice is a row the player is about to take, not one refused.
 *
 * The box is chosen darkest-first (`c00`) because it is drawn OVER generated map art rather than
 * over a palette ground: `#101317` was already near-black, `c00` is 5.1 ΔE from it and is the
 * nearest swatch in the file, and the light `border` — not the plate — is what gives the box its
 * edge against whatever the map happens to be behind it.
 */
export const DIALOGUE_SWATCH_ID = {
  /** The box's fill, and the choice panel's. Drawn over the map, so: the darkest plate there is. */
  box: "c00",
  /** The 1px frame around both boxes. A stroke, never a label. */
  border: "c12",
  /** Body copy, and the choice row the cursor is on. */
  text: "c03",
  /** The speaker's name plate, the advance marker, and a choice row the cursor is not on. */
  dim: "c01",
} as const;

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
  /**
   * The speaker portrait's slot, in virtual px. `balance.map.playerSpriteW`/`playerSpriteH` — the
   * size the `npc-static` class is generated at, which `tools/comfy/manifest.json` states in so many
   * words (`_targetSource`: "balance.map.playerSpriteW × balance.map.playerSpriteH"). Read from
   * balance rather than typed here for the reason `width`/`height` are: it is the same number two
   * lanes have to agree on.
   */
  portraitW: number;
  portraitH: number;
  /**
   * The painted frame's border, in SOURCE pixels — the width of one corner of
   * {@link DIALOGUE_FRAME_ASSET_ID}, and therefore how much of it never stretches.
   *
   * MEASURED off the shipped PNG, not chosen: 2px `#040308` over 2px `#74564e`.
   * `tests/unit/dialogue-scene.test.ts` re-derives it from that file's pixels and fails if the art
   * lane regenerates the frame with a different edge, because a slice wider than the border smears
   * interior into the corners and a slice narrower than it leaves a seam.
   */
  frameSlice: number;
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
    portraitW: balance.map.playerSpriteW,
    portraitH: balance.map.playerSpriteH,
    frameSlice: 4,
    // Resolved through `game/ui/Palette.ts`, never typed — see {@link DIALOGUE_SWATCH_ID}. Two
    // forms because Phaser takes `0xRRGGBB` for a fill and a CSS string for text, and a style block
    // that resolved one correctly and the other by hand is precisely how this file got here.
    boxColor: swatchColor(DIALOGUE_SWATCH_ID.box),
    borderColor: swatchColor(DIALOGUE_SWATCH_ID.border),
    textColor: swatchHex(DIALOGUE_SWATCH_ID.text),
    dimColor: swatchHex(DIALOGUE_SWATCH_ID.dim),
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
 * for its body lines plus the name plate row — and never shorter than the portrait it now carries.
 *
 * The `max` is not defensive padding. At the shipped numbers the text column is the taller of the
 * two (52px of rows against a 48px sprite) and the box does not move one pixel for the portrait;
 * the day `bodyLines` drops to two, the arithmetic that used to size this box would crop the face
 * instead of growing the box, and a slot the frame does not enclose is the defect.
 */
export function dialogueBoxRect(style: DialogueStyle): DialogueBoxRect {
  const width = style.width - style.margin * 2;
  const content = Math.max(style.lineHeight * (style.bodyLines + 1), style.portraitH);
  const height = style.pad * 2 + content;
  return { x: style.margin, y: style.height - style.margin - height, width, height };
}

/**
 * The speaker's portrait slot: inside the box, at the left, top-aligned with the name plate.
 *
 * Always reserved, whether or not the line's speaker has a face to put in it
 * ({@link speakerHasFace}) — the text column must not change width between one line and the next.
 */
export function dialoguePortraitRect(style: DialogueStyle): DialogueBoxRect {
  const rect = dialogueBoxRect(style);
  return {
    x: rect.x + style.pad,
    y: rect.y + style.pad,
    width: style.portraitW,
    height: style.portraitH,
  };
}

/** Where the name plate and every body row start: clear of the portrait, by one pad. */
export function dialogueTextLeft(style: DialogueStyle): number {
  const slot = dialoguePortraitRect(style);
  return slot.x + slot.width + style.pad;
}

/**
 * How many characters fit on one BODY line — the width beside the portrait, not the width of the
 * box. Everything the player reads in the box wraps to this, so it is the one number
 * {@link wrapDialogue} is ever handed for a line of prose.
 */
export function dialogueColumns(style: DialogueStyle): number {
  const rect = dialogueBoxRect(style);
  const right = rect.x + rect.width - style.pad;
  return Math.max(1, Math.floor((right - dialogueTextLeft(style)) / style.charWidth));
}

/**
 * How many characters fit on one row of the CHOICE panel, which has no portrait in it.
 *
 * A separate number on purpose. `drawChoices` truncates each row to the width it has, and the choice
 * panel is drawn above the box at full width — so charging it for a portrait slot it does not carry
 * would cut six characters off every authored prompt to pay for a face that is not there.
 */
export function dialogueChoiceColumns(style: DialogueStyle): number {
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
 * The slice of Phaser's texture manager the frame needs, described structurally.
 *
 * Structural rather than `Phaser.Textures.TextureManager` because this scene is engine-free at
 * runtime and every one of these calls has to be answerable — or absent — in a node test. Absent is
 * a supported answer: {@link DialogueScene.frameTexture} returns null and the box falls back to the
 * rectangles it has always drawn, which is a box, not a claim about art.
 */
interface TextureManagerLike {
  exists?: (key: string) => boolean;
  get?: (key: string) => TextureLike | undefined;
}

interface TextureLike {
  has?: (frame: string) => boolean;
  add?: (frame: string, source: number, x: number, y: number, width: number, height: number) => unknown;
  get?: (frame?: string) => { width?: number; height?: number } | undefined;
}

/** An `add.image` result, as much of it as the frame and the portrait use. */
interface ImageLike extends DrawnObject {
  setOrigin: (x: number, y: number) => unknown;
  setDisplaySize: (width: number, height: number) => unknown;
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

      this.drawPanel(rect);

      const left = dialogueTextLeft(style);
      let y = rect.y + style.pad;

      // The name plate is the speaker's own `name` from the corpus's speaker table — never a
      // description, never an epithet this file invents (G2).
      const speaker = currentSpeaker(this.file, this.state);
      this.drawPortrait(speaker);
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
      const columns = dialogueChoiceColumns(style);
      const rows = choices.map((text, i) => {
        const cursor = i === this.choiceIndex ? style.choiceCursor : style.choiceBlank;
        return `${cursor} ${text}`.slice(0, columns);
      });
      const height = style.pad * 2 + style.lineHeight * rows.length;
      const y = rect.y - style.margin - height;

      this.drawPanel({ x: rect.x, y, width: rect.width, height });

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

    /* ── the frame, the field and the face ──────────────────────────────── */

    /**
     * One panel: the painted ring from {@link DIALOGUE_FRAME_ASSET_ID}, and the box's own dark field
     * inside it.
     *
     * The field is drawn WHICHEVER path runs, and it is `boxColor` in both — see the frame block at
     * the top of this file for why the art's own cream interior must not become the panel body.
     */
    private drawPanel(rect: DialogueBoxRect): void {
      const style = this.style;
      const slice = this.drawFrame(rect);
      if (slice === null) {
        // No frame art loaded (and no crash on the way to finding out): the Gold box this file has
        // always drawn — a light hairline around a dark field. Honest chrome, not a stand-in: a
        // labelled placeholder stretched across the box would sit under every authored line in the
        // game and is the one stand-in that would cost more than the missing art does.
        const border = this.add.rectangle(rect.x, rect.y, rect.width, rect.height, style.borderColor);
        border.setOrigin(0, 0);
        this.drawn.push(border);
      }
      const inset = slice ?? BORDER_PX;
      const fill = this.add.rectangle(
        rect.x + inset,
        rect.y + inset,
        rect.width - inset * 2,
        rect.height - inset * 2,
        style.boxColor,
      );
      fill.setOrigin(0, 0);
      this.drawn.push(fill);
    }

    /**
     * Draw the eight-piece ring, and return the border width it drew at — or null when there is no
     * frame texture to slice, which is the caller's signal to fall back.
     *
     * Corners keep their natural size; the top and bottom edges stretch on X only and the sides on Y
     * only. That asymmetry is the whole point of slicing, and it is why the frame is not one image
     * scaled to the box: at 480×96 into a 464×68 box a single stretched image would thin the border
     * to 3.87px across and 2.83px down — a frame whose weight changes with the shape of the panel.
     */
    private drawFrame(rect: DialogueBoxRect): number | null {
      const source = this.frameTexture();
      if (source === null) return null;
      const { texture, width: srcW, height: srcH } = source;
      const s = this.style.frameSlice;
      // A panel too small to hold two corners and a seam would draw its edges inside out.
      if (rect.width <= s * 2 || rect.height <= s * 2) return null;

      const srcSpan = [s, srcW - s * 2, s];
      const srcAt = [0, s, srcW - s];
      const srcDown = [s, srcH - s * 2, s];
      const srcTop = [0, s, srcH - s];
      const dstSpan = [s, rect.width - s * 2, s];
      const dstAt = [rect.x, rect.x + s, rect.x + rect.width - s];
      const dstDown = [s, rect.height - s * 2, s];
      const dstTop = [rect.y, rect.y + s, rect.y + rect.height - s];

      for (const piece of FRAME_PIECES) {
        const cutX = srcAt[piece.col] ?? 0;
        const cutY = srcTop[piece.row] ?? 0;
        const cutW = srcSpan[piece.col] ?? s;
        const cutH = srcDown[piece.row] ?? s;
        if (typeof texture.has === "function" && !texture.has(piece.name)) {
          texture.add?.(piece.name, 0, cutX, cutY, cutW, cutH);
        }
        const image = (this.add as unknown as {
          image: (x: number, y: number, key: string, frame?: string) => ImageLike;
        }).image(dstAt[piece.col] ?? rect.x, dstTop[piece.row] ?? rect.y, DIALOGUE_FRAME_ASSET_ID, piece.name);
        image.setOrigin(0, 0);
        image.setDisplaySize(dstSpan[piece.col] ?? s, dstDown[piece.row] ?? s);
        this.drawn.push(image);
      }
      return s;
    }

    /** The frame texture and its source size, or null when it has not loaded. */
    private frameTexture(): { texture: TextureLike; width: number; height: number } | null {
      const manager = (this as unknown as { textures?: TextureManagerLike }).textures;
      if (typeof manager?.exists !== "function" || typeof manager.get !== "function") return null;
      if (!manager.exists(DIALOGUE_FRAME_ASSET_ID)) return null;
      const texture = manager.get(DIALOGUE_FRAME_ASSET_ID);
      if (!texture || typeof texture.add !== "function") return null;
      const base = texture.get?.();
      const width = base?.width ?? 0;
      const height = base?.height ?? 0;
      const s = this.style.frameSlice;
      // A "frame" narrower than two corners is not a frame. Refusing it here is what keeps a
      // mis-sized or half-loaded texture from drawing eight overlapping smears over the box.
      if (width <= s * 2 || height <= s * 2) return null;
      return { texture, width, height };
    }

    /**
     * The speaker's face, in the slot the box reserves for it.
     *
     * Through `placeholderImage` — the ONE call every art slot in the game goes through — so a
     * portrait whose plate has not been generated draws the labelled stand-in that names the
     * manifest row still owed, and so real art is FITTED into the slot rather than drawn at its
     * natural size. The fit is load-bearing here and not in theory: `trainer-battle` generates at
     * 96×96 and this slot is 32×48, so the eight gym-leader portraits are three canvas widths of
     * sprite the day that class runs — the same defect `game/placeholder.ts::fitWithin` was written
     * for, in the widget the game spends most of its time in.
     */
    private drawPortrait(speaker: DialogueSpeaker | undefined): void {
      if (!speakerHasFace(speaker)) return;
      const slot = dialoguePortraitRect(this.style);
      const factory = (this.add as unknown as { image?: unknown }).image;
      if (typeof factory !== "function") return;
      this.drawn.push(
        placeholderImage(
          this as unknown as PhaserNS.Scene,
          slot.x + slot.width / 2,
          slot.y + slot.height / 2,
          portraitAssetId(speaker.portrait),
          slot.width,
          slot.height,
        ),
      );
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
      const columns = dialogueChoiceColumns(this.style);
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

    /**
     * The texture key of the portrait the current line asks for, or null when the line is spoken by
     * nobody ({@link speakerHasFace}).
     *
     * A read of the REQUEST, never evidence that anything was drawn — a test that believes this
     * instead of looking at what `add.image` received is the vacuous test this slot was built to
     * avoid. `tests/unit/dialogue-scene.test.ts` asserts against the recorded draw and uses this
     * only to say which key that draw should have carried.
     */
    portraitOnScreen(): string | null {
      const speaker = currentSpeaker(this.file, this.state);
      return speakerHasFace(speaker) ? portraitAssetId(speaker.portrait) : null;
    }
  };
}

/** Milliseconds per second — the crawl's unit conversion, not a tunable. */
const MS_PER_SECOND = 1000;
/** The Gold box's frame, in virtual pixels. Presentation. */
const BORDER_PX = 1;

export default createDialogueScene;
