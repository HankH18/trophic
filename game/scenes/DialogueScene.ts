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
import { realAssetIds } from "@game/placeholder";
import { SCENE_KEYS } from "@game/scene-keys";
import { TEXT_SPEED_CPS, registry, type TextSpeed } from "@game/registry";
import { FRAME_CHROME_PX, drawFrameRing, type FrameSceneLike } from "../ui/FramePanel";
import { swatchColor, swatchHex } from "@game/ui/Palette";

/** From the ONE registry (game/scene-keys.ts) — never a second spelling declared here. */
export const DIALOGUE_SCENE_KEY = SCENE_KEYS.dialogue;

/* ────────────────────────────────────────────────────────────────────────────
 * Resolving a portrait id to a texture key
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE BOX DRAWS NO FACE. THE RESOLVER STAYS, BECAUSE THE OVERWORLD STILL DRAWS ONE.
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner's instruction, verbatim: "get rid of the portraits from the message boxes. Most of them are
 * broken, and so I'd rather just do away with them entirely." So the slot, the fit and the draw are
 * gone from this file, and the body column runs the full width of the box — see
 * {@link dialogueTextLeft} and {@link dialogueBoxRect} for what that did and did not move.
 *
 * WHAT DID NOT GO WITH IT, AND WHY IT LIVES HERE. {@link portraitAssetId} stays: `game/npcs.ts`
 * draws the fifty overworld NPCs through `placeholderImage(scene, x, y,
 * portraitAssetId(placement.portrait), …)`, and `tests/gates/asset-reachability.test.ts` still
 * resolves that surface's keys with it. It stays at THIS path rather than moving beside `game/npcs.ts`
 * — where it now belongs — because the move buys nothing but edits to two permanent gates; if this
 * file is ever split, take it there. {@link speakerHasFace} is a different case; read its own note.
 *
 * ⚠ WHAT THE REMOVAL COST, MEASURED AND RECORDED RATHER THAN LEFT TO BE REDISCOVERED. The 25
 * distinct portrait ids the corpus uses span THREE manifest classes — `npc-static` (12 rows,
 * shipped), `trainer-battle` (8 rows) and `prop` (4 rows). `npc-static` keeps its consumer, the
 * overworld cast. **`trainer-battle` and `prop` had ONLY this box**, so nothing in the game asks for
 * either class now, and three gates say so out loud: GATE 2a names both classes, and GATE 2b names
 * the twelve `speakers[].portrait` values that no longer have a path to the screen.
 *
 * That is the report, not damage. `assets/final/trainer-battle/` and `assets/final/prop/` do not
 * exist and never have, so no generated art was orphaned and nothing paid for stopped being drawn —
 * what this box was really doing for those twelve was drawing a hatched PLACEHOLDER block labelled
 * with a row the art lane still owed, which is what "most of them are broken" describes. The
 * standing red is written up at GATE 2b in `tests/gates/asset-reachability.test.ts` and the decision
 * it needs is in `docs/STATUS.md` under "Waiting on the owner". Do not silence it here.
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
 * Those ids span three manifest classes with three different `finalDir`s, which is why a single
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
 * Does this speaker name art that anything could draw?
 *
 * READ OFF THE CORPUS, NOT OFF A LIST OF IDS. `data/dialogue.json` gives exactly one speaker a blank
 * `name` — `narration`, whose name is a single space so the plate prints nothing — and that blank is
 * the corpus's own way of writing "nobody is on screen for this line". Its `portrait` names no row
 * in `tools/comfy/manifest.json` and never will.
 *
 * ⚠ NOTHING IN THE SHIPPING GAME CALLS THIS ANY MORE, AND THAT IS SAID PLAINLY RATHER THAN DRESSED
 * UP. The box draws no face, so nothing in the class below gates on it (the plate still prints
 * `speaker.name`, the faceless voice's single space included, exactly as before); and
 * `tests/gates/asset-reachability.test.ts` dropped it with the portrait key builder it used to
 * filter. `game/npcs.ts` never called it — `npcSpeakers()` selects its cast by the `npc-` portrait
 * PREFIX. Its only remaining caller is `tests/unit/dialogue-scene.test.ts`.
 *
 * It is kept, not deleted, for one reason: it is the CORPUS's own definition of "nobody is on screen
 * for this line", and the alternative is that test typing the id `narration` into an assertion —
 * which is the shape this repository has been bitten by (a test supplying its own precondition).
 * Its future is tied to a decision the owner has not made yet: see `docs/STATUS.md` on the twelve
 * `trainer-battle`/`prop` portrait rows. If those are cut, revisit this with them.
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
 * WHY THE SLICER IS NOT HERE. It was: this file hand-rolled the eight-piece ring as two private
 * methods, because lane scope put a shared UI module out of reach when the frame first reached a
 * screen. `game/ui/FramePanel.ts` is that slicer, extracted, and it is now THE one — the menu, the
 * dex and the combatant card draw through it too, and a second copy living here would be a second
 * answer to "where does a corner stop" for the same six PNGs. {@link drawFrameRing} carries the
 * rest of the reasoning, including why `this.add.nineslice` is not used (Phaser 3.90 ships
 * `NineSliceWebGLRenderer.js` with no canvas sibling, and `game/boot.ts` starts with `P.AUTO`, so
 * under a Canvas fallback the whole frame would render as nothing at all).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `tools/comfy/manifest.json` row `ui-dialogue-box` at `classes["ui-frame"].finalDir`.
 *
 * Kept as this file's own export rather than read off `UI_FRAME_ASSET_ID.dialogueBox`: this is the
 * id the scene's CALL SITE passes, and `tests/gates/asset-reachability.test.ts` counts a row as
 * consumed from the ids call sites really pass — never from the declared table, which names two
 * rows nothing draws.
 */
export const DIALOGUE_FRAME_ASSET_ID = "ui-frame/ui-dialogue-box";

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
  /*
   * ⚠ `portraitW`/`portraitH` WERE HERE, READ FROM `balance.map.npcSpriteW`/`npcSpriteH`, and they
   * are gone with the portrait itself (the owner's instruction is quoted at the head of this file).
   * The balance keys STAY — `game/npcs.ts` sizes the overworld NPC box with them, and that pair's
   * whole history, including why it must never fold back into `playerSpriteW/H`, is recorded on that
   * call site and in `data/balance.json`'s `_npcSprite`. Nothing in this file reads them now.
   */
  /**
   * The painted frame's border, in SOURCE pixels — the width of one corner of
   * {@link DIALOGUE_FRAME_ASSET_ID}, and therefore how much of it never stretches.
   *
   * MEASURED off the shipped PNG, not chosen: 2px `#040308` over 2px `#74564e`.
   * `tests/unit/dialogue-scene.test.ts` re-derives it from that file's pixels and fails if the art
   * lane regenerates the frame with a different edge, because a slice wider than the border smears
   * interior into the corners and a slice narrower than it leaves a seam.
   *
   * Still a style field, and not simply `FRAME_CHROME_PX` at the call site, because the box's
   * FIELD is inset by it: `drawPanel` reads the same number for the rectangle it paints inside the
   * ring, and a style a test overrides has to be able to move both together.
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
    frameSlice: FRAME_CHROME_PX,
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
 * for its body lines plus the name plate row.
 *
 * ⚠ THE HEIGHT DID NOT MOVE WHEN THE PORTRAIT WENT, AND THAT WAS CHECKED RATHER THAN HOPED. The
 * content term was `Math.max(lineHeight * (bodyLines + 1), portraitH)`, and at the shipped numbers
 * the text term was already the larger of the two — 52px of rows against a 32px slot — so dropping
 * the `max` leaves the same 68px box in the same place. It matters because this height is what puts
 * the ▼ advance marker on the box's last row and what {@link DialogueBoxRect}'s consumer stacks the
 * choice panel above: a box that had shrunk would have moved both, and neither was asked to move.
 */
export function dialogueBoxRect(style: DialogueStyle): DialogueBoxRect {
  const width = style.width - style.margin * 2;
  const height = style.pad * 2 + style.lineHeight * (style.bodyLines + 1);
  return { x: style.margin, y: style.height - style.margin - height, width, height };
}

/** Where the name plate and every body row start: the box's own left edge, plus one pad. */
export function dialogueTextLeft(style: DialogueStyle): number {
  return dialogueBoxRect(style).x + style.pad;
}

/**
 * How many characters fit on one BODY line. Everything the player reads in the box wraps to this, so
 * it is the one number {@link wrapDialogue} is ever handed for a line of prose.
 *
 * 74 at the shipped numbers, and 68 while a portrait slot stood at the left of the box. Removing the
 * face handed six characters back to every line, which is a change to WHERE EVERY LINE WRAPS and so
 * to how many pages an entry takes: 43 of the corpus's authored lines lost a page turn (602 pages to
 * read the whole corpus, now 559). No wrap rule changed — the same prose simply fits differently —
 * which is why `tests/unit/dialogue-scene.test.ts` drives its paging tests off whatever the corpus
 * wraps past `bodyLines` at the CURRENT width, never off a named entry that happened to page once.
 */
export function dialogueColumns(style: DialogueStyle): number {
  const rect = dialogueBoxRect(style);
  const right = rect.x + rect.width - style.pad;
  return Math.max(1, Math.floor((right - dialogueTextLeft(style)) / style.charWidth));
}

/**
 * How many characters fit on one row of the CHOICE panel.
 *
 * A separate number, computed separately, and — since the portrait went — equal to
 * {@link dialogueColumns}: both are now the box's width less one pad on each side. It stays its own
 * function because the panel is its own surface, drawn above the box, and `drawChoices` truncates
 * every row to the width IT has. The two agreeing is a fact about today's geometry that
 * `tests/unit/dialogue-scene.test.ts` asserts, not an identity to fold away — the panel used to be
 * six characters wider than the body, and it can diverge again.
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

/*
 * The structural view of the texture manager, the frame texture and an `add.image` result used to
 * live here, one interface each. They are `FrameTextureManagerLike`, `FrameTextureLike` and
 * `FrameImageLike` in `game/ui/FramePanel.ts` now, and the reason they are structural at all is
 * unchanged: this scene is engine-free at runtime, so every call the ring makes has to be
 * answerable — or ABSENT — in a node test. Absent stays a supported answer, not a crash:
 * `drawFrameRing` returns null and the box falls back to the rectangles it has always drawn.
 */

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

      /*
       * PAGING IS TESTED BEFORE THE CHOICE, AND THE ORDER IS THE WHOLE FIX.
       *
       * These two blocks were the other way round, and the choice branch returned first — so on an
       * entry that BOTH wraps past `bodyLines` AND carries choices, the confirm key selected an
       * option instead of turning the page and the tail was never drawn. The choice panel only
       * appears on an entry's last line, which is exactly the line most likely to be long, so the
       * two conditions coincide rather than being independent.
       *
       * Measured on the shipped corpus: `sel.quest.wager.offer`, the ferryhand's wager, wraps to
       * FOUR rows at 68 columns and the player could never see row 4 — "what I'm putting up", the
       * clause naming the stake the whole wager is about. One entry today, but the defect is in the
       * control flow, not in that line's length: any future entry with choices and a long last line
       * inherits it.
       *
       * Paging first is safe because `pageRows()` already respects `this.page` while a choice is
       * pending, so the panel renders correctly on each page and the option is taken on the last
       * one — the same "read it all, then act" order the crawl-completion branch above uses.
       *
       * `tests/unit/dialogue-scene.test.ts` drives an entry that wraps AND offers choices; the old
       * paging test could not see this because it drove a long line in the opening, which has none.
       */
      if (this.page < pageCount(this.rows(), this.style.bodyLines) - 1) {
        this.page += 1;
        this.shown = this.cps === 0 ? Number.MAX_SAFE_INTEGER : 0;
        this.redraw();
        return;
      }

      if (awaitingChoice(this.file, this.state)) {
        this.state = chooseOption(this.file, this.state, this.choiceIndex);
        this.onEntered();
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

    /* ── the frame and the field ────────────────────────────────────────── */

    /**
     * One panel: the painted ring from {@link DIALOGUE_FRAME_ASSET_ID}, and the box's own dark field
     * inside it.
     *
     * The field is drawn WHICHEVER path runs, and it is `boxColor` in both — see the frame block at
     * the top of this file for why the art's own cream interior must not become the panel body.
     */
    private drawPanel(rect: DialogueBoxRect): void {
      const style = this.style;
      const pieces = drawFrameRing(
        this as unknown as FrameSceneLike,
        DIALOGUE_FRAME_ASSET_ID,
        rect,
        style.frameSlice,
      );
      const slice = pieces === null ? null : style.frameSlice;
      if (pieces !== null) for (const piece of pieces) this.drawn.push(piece);
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

    /*
     * `drawPortrait` WAS HERE — one `placeholderImage` into a 32×32 slot at the box's left edge.
     * Removed on the owner's instruction (quoted at the head of this file). The only images this
     * scene adds now are the eight ring pieces `drawFrameRing` cuts out of the frame PNG, per panel,
     * and `tests/unit/dialogue-scene.test.ts` §7 asserts that by reading the display list rather
     * than by trusting this comment.
     */

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
  };
}

/** Milliseconds per second — the crawl's unit conversion, not a tunable. */
const MS_PER_SECOND = 1000;
/** The Gold box's frame, in virtual pixels. Presentation. */
const BORDER_PX = 1;

export default createDialogueScene;
