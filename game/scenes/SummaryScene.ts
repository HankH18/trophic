/**
 * game/scenes/SummaryScene.ts — the team / creature summary card (build-doc §15 C4).
 *
 * bible §12 lists "team/creature summary (**shows projected retirement year**)" as a screen, and
 * that parenthesis is a hard requirement: the whole Legacy beat (build-doc §1, never-cut) depends on
 * the player knowing, in advance, the year their starter stops fighting. So the card renders that
 * year for every creature, and it renders `core/lifecycle.ts`'s answer — the projection has one
 * implementation, and a card that recomputed it would be the second one.
 *
 * A renderer only: the card's numbers come from `game/survey-view.ts` `buildSummaryCard`, which
 * composes `core/lifecycle.ts` (projection, aging) and `core/battle.ts` (effective stats, the moves
 * a level knows). Nothing here does stat or lifespan arithmetic.
 *
 * Art: the portrait goes through the same shared art slot the dex uses (`game/placeholder.ts` via
 * `DexScene.drawArtSlot`) and asks for the same thing the dex asks for — the creature's own battle
 * sprite, resolved by `DexScene.creatureArtId`, which carries the reasoning for that ruling. Real
 * texture when it has loaded, labelled stand-in naming the missing asset when it has not.
 * G7 — no copy in this file judges the player.
 */

import Phaser from "phaser";
import {
  SCREEN_COLOR,
  SCREEN_HEX,
  SCREEN_TEXT,
  SUMMARY_ART_BOX,
  buildSummaryCard,
  renderSummaryCard,
  type SummaryCard,
} from "../survey-view";
import { SCENE_KEYS } from "../scene-keys";
import { closeScreen, creatureArtId, drawArtSlot } from "./DexScene";
import type { Content, OwnedCreature } from "../../core/types";

/**
 * The scene key, READ from the registry rather than spelled again here (as `SurveyScene` does).
 * `game/scene-keys.ts` is engine-free — `import type` only — so there is no reason for this file to
 * hold a second copy of the string, and two spellings of one key is the exact failure that registry
 * exists to prevent. It carried its own literal while the registry had no `summary` entry; the
 * registry has one, `game/main.ts` registers this scene, and `game/scenes/MenuScene.ts` routes to it.
 */
export const SUMMARY_SCENE_KEY = SCENE_KEYS.summary;

export interface SummarySceneData {
  content: Content;
  /** Party first, then box — the box ages too (Hard Req 4 / G10), so it belongs on this screen. */
  party: readonly OwnedCreature[];
  box?: readonly OwnedCreature[];
  currentYear: number;
  startUid?: string;
  /**
   * WHERE ESC GOES — required, for the reason spelled out on `DexSceneData.onClose`: an optional
   * closer is how the epilogue survey came to be a finished run the player could not leave, and this
   * card is the same shape. One supplier today (`game/scenes/MenuScene.ts`), which supplies one; the
   * type is what stops a second from omitting it, and `closeScreen` covers the untyped hole Phaser
   * leaves by starting scenes with `unknown` data.
   */
  onClose: () => void;
}

// One home for the screen's colours, in game/survey-view.ts — see DexScene. These four WERE
// `#e8e4d8`, `#8a8676`, `#d8a24a` and `0x14140f`, none of them a frozen swatch (build-doc §8.4).
const INK = SCREEN_HEX.ink;
const INK_DIM = SCREEN_HEX.inkDim;
const INK_FLAG = SCREEN_HEX.inkFlag;
const BACKDROP = SCREEN_COLOR.backdrop;

// The screen's text metrics have one home, in game/survey-view.ts (see SurveyScene).
const FONT = SCREEN_TEXT.fontFamily;
const BODY_PX = SCREEN_TEXT.fontPx;
const LINE_H = SCREEN_TEXT.lineHeight;
const PAD = SCREEN_TEXT.padPx;
// See DexScene: one declaration of the slot, so the width test measures the real left edge.
const ART_BOX = SUMMARY_ART_BOX;

export class SummaryScene extends Phaser.Scene {
  static readonly KEY = SUMMARY_SCENE_KEY;

  private args!: SummarySceneData;
  private roster: OwnedCreature[] = [];
  private cursor = 0;
  private layer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: SUMMARY_SCENE_KEY });
  }

  init(data: SummarySceneData): void {
    this.args = data;
    this.roster = [...data.party, ...(data.box ?? [])];
    const start = data.startUid ? this.roster.findIndex((c) => c.uid === data.startUid) : 0;
    this.cursor = start >= 0 ? start : 0;
  }

  create(): void {
    this.layer = this.add.container(0, 0);
    const keyboard = this.input.keyboard;
    keyboard?.on("keydown-LEFT", () => this.step(-1));
    keyboard?.on("keydown-RIGHT", () => this.step(1));
    keyboard?.on("keydown-UP", () => this.step(-1));
    keyboard?.on("keydown-DOWN", () => this.step(1));
    keyboard?.on("keydown-ESC", () => this.close());
    this.redraw();
  }

  /** ESC. See `DexScene`'s {@link closeScreen} for what happens with no way back supplied. */
  close(): void {
    closeScreen(this, this.args.onClose, "summary");
  }

  current(): OwnedCreature | null {
    return this.roster[this.cursor] ?? null;
  }

  step(delta: number): void {
    if (this.roster.length === 0) return;
    this.cursor = (this.cursor + delta + this.roster.length) % this.roster.length;
    this.redraw();
  }

  /** The card as it renders right now — the same object the text below is drawn from. */
  card(): SummaryCard | null {
    const creature = this.current();
    if (!creature) return null;
    return buildSummaryCard({
      creature,
      species: this.args.content.species,
      moves: this.args.content.moves.moves,
      balance: this.args.content.balance,
      currentYear: this.args.currentYear,
    });
  }

  cardLines(): string[] {
    const card = this.card();
    if (!card) return [];
    return renderSummaryCard(card, this.args.content.balance);
  }

  private redraw(): void {
    this.layer.removeAll(true);
    const map = this.args.content.balance.map;

    const bg = this.add.graphics();
    bg.fillStyle(BACKDROP, 1).fillRect(0, 0, map.virtualWidth, map.virtualHeight);
    this.layer.add(bg);

    const card = this.card();
    if (!card) {
      /*
       * THE EMPTY TEAM IS A SCREEN, NOT AN EARLY RETURN. This branch used to `return` before the
       * footer below was drawn, so a player who opened TEAM with nothing in the party got one grey
       * line and no way off the screen printed anywhere — the only exit is a key nothing named.
       * G7: identifiers and counts, no comment on why the party is empty.
       */
      this.layer.add(
        this.text(
          PAD,
          PAD,
          `party ${String(this.args.party.length)}  box ${String((this.args.box ?? []).length)}`,
          INK_DIM,
        ),
      );
    } else {
      this.layer.add(
        this.text(PAD, PAD, `${this.cursor + 1}/${this.roster.length}${card.boxed ? " · box" : ""}`, INK_DIM),
      );
      /*
       * The card shows the individual AS IT IS RIGHT NOW, so the sprite is `card.age` — the same
       * age the types, the role and the form name on the lines beside it are read at
       * (`buildSummaryCard`). `card.ancient` is passed for one implementation of the slot rule and
       * is redundant here rather than load-bearing: `core/lifecycle.ts` `newOwnedCreature` already
       * forces an owned Ancient to the terminal class, so `card.age` is that class anyway.
       */
      this.layer.add(
        drawArtSlot(this, ART_BOX, creatureArtId(card.lineId, card.age, card.ancient)),
      );

      const x = ART_BOX.x + ART_BOX.width + PAD;
      const lines = this.cardLines();
      lines.forEach((line, i) => {
        // The retirement year is line 3 of the card (renderSummaryCard's order) and is drawn in its
        // own colour: it is the bible §12 hard requirement and the Legacy beat's whole premise.
        const isRetirement = i === 2;
        this.layer.add(this.text(x, ART_BOX.y + LINE_H * i, line, isRetirement ? INK_FLAG : INK));
      });
    }

    this.layer.add(
      this.text(
        PAD,
        map.virtualHeight - LINE_H - PAD,
        this.roster.length > 0 ? "←/→ creature  ESC" : "ESC",
        INK_DIM,
      ),
    );
  }

  private text(x: number, y: number, value: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, { fontFamily: FONT, fontSize: `${BODY_PX}px`, color })
      .setOrigin(0, 0);
  }
}
