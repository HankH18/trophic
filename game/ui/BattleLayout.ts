/**
 * game/ui/BattleLayout.ts — where every box on the battle screen goes, as a pure function.
 *
 * WHY THIS IS ITS OWN FILE
 * ────────────────────────
 * The first cut computed the layout inside `game/scenes/BattleScene.ts`, which value-imports Phaser
 * and therefore cannot be imported by a node test. Nothing checked the arithmetic, and it was
 * wrong: the command menu and the player's combatant card overlapped by 9px, and because the card
 * is rebuilt (and so re-added to the display list) on every swap, the card always won the draw
 * order — the top row of the menu, which is where the cursor starts, was drawn over by the card.
 * A layout nobody can test headlessly is a layout that is checked by looking at it.
 *
 * So the boxes live here, engine-free, and `tests/unit/battle-view.test.ts` asserts they are
 * DISJOINT. The menu's own metrics live here too, because its height is
 * `padding * 2 + rowHeight * visibleRows` — a number the scene has to know to place the card above
 * it, and the one number that was silently duplicated before.
 *
 * CONSTANTS (G11): every number here is a pixel offset inside the §7.6 virtual screen. No gameplay
 * constant is written in this file; `width`/`height` arrive from `balance.map`.
 *
 * ENGINE: no phaser import at all, not even a type one.
 */

import { DEFAULT_CARD_STYLE, type CombatantCardStyle } from "./BattleHud";

/** An axis-aligned box in virtual-screen pixels. `x`/`y` are the top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A sprite's CENTRE, which is what `scene.add.image` takes. */
export interface Point {
  x: number;
  y: number;
}

export interface MenuMetrics {
  rowHeight: number;
  padding: number;
  visibleRows: number;
  fontSize: string;
}

/** The menu panel's metrics. Its drawn height is derived from them, in one place. */
export const BATTLE_MENU_METRICS: MenuMetrics = {
  rowHeight: 12,
  padding: 5,
  visibleRows: 5,
  fontSize: "8px",
};

export function menuPanelHeight(metrics: MenuMetrics): number {
  return metrics.padding * 2 + metrics.rowHeight * metrics.visibleRows;
}

export interface BattleScreenLayout {
  width: number;
  height: number;
  enemySprite: Point;
  playerSprite: Point;
  enemyCard: Rect;
  playerCard: Rect;
  message: Rect;
  menu: Rect;
  menuMetrics: MenuMetrics;
  messageFontSize: string;
  messagePadding: number;
}

/** Gap between two stacked panels, and between a panel and the screen edge. */
const EDGE = 4;
const MESSAGE_H = 46;
const MESSAGE_PADDING = 6;
const MESSAGE_FONT = "8px";
const SPRITE_W = 72;
const SPRITE_H = 72;

/**
 * The whole screen, bottom-up.
 *
 * The message box is pinned to the foot; the menu sits on top of it; the player's card sits on top
 * of the menu. Deriving each from the one below is what makes the disjointness a property of the
 * function rather than of three hand-tuned fractions that happened to collide.
 */
export function battleScreenLayout(
  width: number,
  height: number,
  cardStyle: CombatantCardStyle = DEFAULT_CARD_STYLE,
  menuMetrics: MenuMetrics = BATTLE_MENU_METRICS,
): BattleScreenLayout {
  const message: Rect = { x: 0, y: height - MESSAGE_H, w: width, h: MESSAGE_H };

  const menuW = 142;
  const menuH = menuPanelHeight(menuMetrics);
  const menu: Rect = { x: width - menuW - EDGE, y: message.y - menuH - EDGE, w: menuW, h: menuH };

  const playerCard: Rect = {
    x: width - cardStyle.cardW - EDGE,
    y: menu.y - cardStyle.cardH - EDGE,
    w: cardStyle.cardW,
    h: cardStyle.cardH,
  };
  const enemyCard: Rect = { x: EDGE, y: EDGE, w: cardStyle.cardW, h: cardStyle.cardH };

  return {
    width,
    height,
    enemySprite: { x: Math.round(width * 0.68), y: Math.round(height * 0.28) },
    playerSprite: { x: Math.round(width * 0.28), y: Math.round(height * 0.56) },
    enemyCard,
    playerCard,
    message,
    menu,
    menuMetrics,
    messageFontSize: MESSAGE_FONT,
    messagePadding: MESSAGE_PADDING,
  };
}

/** True when two boxes share at least one pixel. Touching edges do not overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The box a centred sprite occupies — what a disjointness check needs. */
export function spriteRect(at: Point, w: number = SPRITE_W, h: number = SPRITE_H): Rect {
  return { x: at.x - Math.floor(w / 2), y: at.y - Math.floor(h / 2), w, h };
}

/**
 * Every box the screen draws, named, for a disjointness sweep. The two sprites are excluded: they
 * are art and may sit behind a panel by design; the PANELS must never sit on top of each other,
 * because there is no z-order that makes two opaque plates both readable.
 */
export function layoutPanels(layout: BattleScreenLayout): Array<{ name: string; rect: Rect }> {
  return [
    { name: "enemyCard", rect: layout.enemyCard },
    { name: "playerCard", rect: layout.playerCard },
    { name: "menu", rect: layout.menu },
    { name: "message", rect: layout.message },
  ];
}
