/**
 * game/scenes/DexScene.ts — the dex (bible §12 "dex (painted art)"; build-doc §15 C4).
 *
 * Two things this scene exists to get right:
 *
 * 1. **Hard Req 10 — legibility.** bible §5: "dex entries and sign cards flag migrants as 'dormant'
 *    or 'migrating' out of season, so seasonal absence is never confusable with a population crash."
 *    The flags come from `core/foodweb.ts` via `game/ledger-view.ts` — `migrantStatus` for the
 *    season, and `encounterWeights` itself, the roll's own call, for the sign-chain gate. Both are
 *    needed: with only the first, this screen read "individuals in region 1" for the three Ancients
 *    while the roll could never produce them. The entry additionally carries the live regional
 *    count when the caller hands over the node states, so every reason a creature is not in front
 *    of the player is on screen at once: `dormant` with a real count beside it, `not in the wild
 *    encounter pool` with a real count beside it, or the integer `0`.
 *
 * 2. **Honest placeholders.** The painted dex class has not been generated (build-doc §9.4 is a
 *    SUPERVISED trial in lane B2), so almost every entry here has no art. Every slot goes through
 *    `game/placeholder.ts` — the ONE shared helper — which draws the real texture when it has
 *    loaded and a labelled stand-in carrying the missing asset's id when it has not. Nothing here
 *    stretches an unrelated image into the slot, and nothing leaves it blank: a blank looks
 *    finished, a labelled box is a work item.
 *
 * G7 — no copy in this file judges the player.
 */

import Phaser from "phaser";
import {
  DEX_ART_BOX,
  SCREEN_TEXT,
  buildDexEntries,
  regionalCount,
  renderDexEntry,
  renderDexFlags,
  type DexEntry,
} from "../ledger-view";
import { placeholderImage } from "../placeholder";
import type { Content, NodeState, Season } from "../../core/types";

/**
 * Scene key, in `game/scene-keys.ts`'s capitalised convention (Boot/Title/Menu/…).
 *
 * ⚠ It is spelled HERE because the registry has no `dex` entry yet — see the blocker in this lane's
 * report. When one is added it must be `dex: "Dex"`, and this line becomes `SCENE_KEYS.dex`;
 * `tests/unit/ledger-view.test.ts` fails the moment the two spellings disagree.
 */
export const DEX_SCENE_KEY = "Dex";

export interface DexSceneData {
  content: Content;
  season: Season;
  /** The live sim, if the caller has it — enables the regional count line (build-doc §7.8). */
  states?: Readonly<Record<string, NodeState>>;
  /** Dex ids the player has recorded. Absent = every entry is shown. */
  seen?: ReadonlySet<string>;
  /** Sign-chains the player has completed — the gate flag reads them (bible §4). */
  unlockedSignChains?: ReadonlySet<string>;
  startDexId?: string;
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
// The slot the text is laid out beside, declared in game/ledger-view.ts so the width its lines are
// asserted against is measured from the same left edge this scene draws them at.
const ART_BOX = DEX_ART_BOX;

export interface ArtBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draw one art slot through the shared helper: the real texture when it has loaded, a labelled
 * stand-in of exactly this size when it has not. Real art is never scaled to fit — `placeholder.ts`
 * draws it at its natural size, because a stretched image is the failure that reads as
 * finished-but-wrong.
 *
 * Top-left anchored, so a caller thinks in boxes rather than in centres.
 */
export function drawArtSlot(scene: Phaser.Scene, box: ArtBox, assetId: string): Phaser.GameObjects.Image {
  return placeholderImage(
    scene,
    box.x + box.width / 2,
    box.y + box.height / 2,
    assetId,
    box.width,
    box.height,
  );
}

export class DexScene extends Phaser.Scene {
  static readonly KEY = DEX_SCENE_KEY;

  private args!: DexSceneData;
  private entries: DexEntry[] = [];
  private cursor = 0;
  private layer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: DEX_SCENE_KEY });
  }

  init(data: DexSceneData): void {
    this.args = data;
    const all = buildDexEntries(data.content.species, data.season, data.content.balance, {
      ...(data.unlockedSignChains ? { unlockedSignChains: data.unlockedSignChains } : {}),
    });
    this.entries = data.seen ? all.filter((e) => data.seen?.has(e.dexId)) : all;
    const start = data.startDexId ? this.entries.findIndex((e) => e.dexId === data.startDexId) : 0;
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

  current(): DexEntry | null {
    return this.entries[this.cursor] ?? null;
  }

  step(delta: number): void {
    if (this.entries.length === 0) return;
    this.cursor = (this.cursor + delta + this.entries.length) % this.entries.length;
    this.redraw();
  }

  /**
   * The lines drawn beside the art. Every one of them is produced by `game/ledger-view.ts`, which
   * is where the test asserts them; this method only prefixes the position in the dex.
   */
  entryLines(entry: DexEntry): string[] {
    const states = this.args.states;
    const lines = renderDexEntry(entry, states ? regionalCount(states, entry.lineId) : null);
    lines[0] = `${this.cursor + 1}/${this.entries.length}  ${entry.dexId}`;
    return lines;
  }

  private redraw(): void {
    this.layer.removeAll(true);
    const map = this.args.content.balance.map;

    const bg = this.add.graphics();
    bg.fillStyle(BACKDROP, 1).fillRect(0, 0, map.virtualWidth, map.virtualHeight);
    this.layer.add(bg);

    const entry = this.current();
    if (!entry) {
      this.layer.add(this.text(PAD, PAD, "dex 0/0", INK_DIM));
      return;
    }

    this.layer.add(drawArtSlot(this, ART_BOX, entry.artId));

    const x = ART_BOX.x + ART_BOX.width + PAD;
    const lines = this.entryLines(entry);
    // Hard Req 10 — the flags are drawn in their own colour so they cannot be skimmed past. There
    // can be TWO of them (out of season AND held back by a chain), so they are matched against the
    // renderer's own list rather than assumed to be the last line: a card that had both used to
    // colour only one, and the one it coloured depended on the order they happened to be pushed in.
    const flags = new Set(renderDexFlags(entry));
    lines.forEach((line, i) => {
      // It is plain text either way, so a test reads exactly what a player reads.
      this.layer.add(this.text(x, ART_BOX.y + LINE_H * i, line, flags.has(line) ? INK_FLAG : INK));
    });

    this.layer.add(
      this.text(PAD, map.virtualHeight - LINE_H - PAD, "←/→ entry  ESC", INK_DIM),
    );
  }

  private text(x: number, y: number, value: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, { fontFamily: FONT, fontSize: `${BODY_PX}px`, color })
      .setOrigin(0, 0);
  }
}
