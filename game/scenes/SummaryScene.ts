/**
 * game/scenes/SummaryScene.ts — the team / creature summary card (build-doc §15 C4).
 *
 * bible §12 lists "team/creature summary (**shows projected retirement year**)" as a screen, and
 * that parenthesis is a hard requirement: the whole Legacy beat (build-doc §1, never-cut) depends on
 * the player knowing, in advance, the year their starter stops fighting. So the card renders that
 * year for every creature, and it renders `core/lifecycle.ts`'s answer — the projection has one
 * implementation, and a card that recomputed it would be the second one.
 *
 * A renderer only: the card's numbers come from `game/ledger-view.ts` `buildSummaryCard`, which
 * composes `core/lifecycle.ts` (projection, aging) and `core/battle.ts` (effective stats, the moves
 * a level knows). Nothing here does stat or lifespan arithmetic.
 *
 * Art: battle sprites are unbuilt (lane B3), so the portrait goes through the same shared art slot
 * the dex uses (`game/placeholder.ts` via `DexScene.drawArtSlot`) — the real texture when it has
 * loaded, a labelled stand-in naming the missing asset when it has not.
 * G7 — no copy in this file judges the player.
 */

import Phaser from "phaser";
import {
  SCREEN_TEXT,
  SUMMARY_ART_BOX,
  buildSummaryCard,
  renderSummaryCard,
  type SummaryCard,
} from "../ledger-view";
import { drawArtSlot } from "./DexScene";
import type { Content, OwnedCreature } from "../../core/types";

/**
 * Scene key, in `game/scene-keys.ts`'s capitalised convention (Boot/Title/Menu/…).
 *
 * ⚠ It is spelled HERE because the registry has no `summary` entry yet — see the blocker in this
 * lane's report. When one is added it must be `summary: "Summary"`, and this line becomes
 * `SCENE_KEYS.summary`; `tests/unit/ledger-view.test.ts` fails the moment the two disagree.
 */
export const SUMMARY_SCENE_KEY = "Summary";

export interface SummarySceneData {
  content: Content;
  /** Party first, then box — the box ages too (Hard Req 4 / G10), so it belongs on this screen. */
  party: readonly OwnedCreature[];
  box?: readonly OwnedCreature[];
  currentYear: number;
  startUid?: string;
  onClose?: () => void;
}

const INK = "#e8e4d8";
const INK_DIM = "#8a8676";
const INK_FLAG = "#d8a24a";
const BACKDROP = 0x14140f;

// The screen's text metrics have one home, in game/ledger-view.ts (see LedgerScene).
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
    keyboard?.on("keydown-ESC", () => this.args.onClose?.());
    this.redraw();
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
      this.layer.add(this.text(PAD, PAD, "party 0", INK_DIM));
      return;
    }

    this.layer.add(
      this.text(PAD, PAD, `${this.cursor + 1}/${this.roster.length}${card.boxed ? " · box" : ""}`, INK_DIM),
    );
    this.layer.add(drawArtSlot(this, ART_BOX, card.artId));

    const x = ART_BOX.x + ART_BOX.width + PAD;
    const lines = this.cardLines();
    lines.forEach((line, i) => {
      // The retirement year is line 3 of the card (renderSummaryCard's order) and is drawn in its
      // own colour: it is the bible §12 hard requirement and the Legacy beat's whole premise.
      const isRetirement = i === 2;
      this.layer.add(this.text(x, ART_BOX.y + LINE_H * i, line, isRetirement ? INK_FLAG : INK));
    });

    this.layer.add(this.text(PAD, map.virtualHeight - LINE_H - PAD, "←/→ creature  ESC", INK_DIM));
  }

  private text(x: number, y: number, value: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, { fontFamily: FONT, fontSize: `${BODY_PX}px`, color })
      .setOrigin(0, 0);
  }
}
