/**
 * game/ui/BattleHud.ts — the two combatant cards: sprite, name, level, HP bar, status, and (for the
 * player's own creature) the projected retirement year.
 *
 * Reads only what `game/battle-view.ts` already read off `BattleState`. It computes no rule: the HP
 * numbers arrive as absolutes, the status is a name, the retirement year is handed in by the scene
 * from `core/lifecycle.ts`. The only arithmetic here is turning a fraction into a pixel width.
 *
 * ENGINE: `import type PhaserNS` only, so the pure model half is importable in a node test.
 */

import type PhaserNS from "phaser";
import type { BattlerView } from "../battle-view";
import { isNever } from "../../core/lifecycle";
import { roleColor, roleHex, type UiSwatchRole } from "./Palette";
import { placeholderImage } from "../placeholder";

/* ────────────────────────────────────────────────────────────────────────────
 * Asset keys — the convention Lane B's battle-sprite batch fills in.
 *
 * build-doc §9.7 (corrected by DEVIATIONS D2) counts 150 battle sprites: 75 forms × front/back,
 * where a form is one (line, age class). The key is therefore exactly that tuple, built from data at
 * runtime — no species name is ever written in this file (build-doc §8.3 / G2).
 * ──────────────────────────────────────────────────────────────────────────── */

export type Facing = "front" | "back";

/** The enemy is seen from the front; the player's own creature is seen from behind. */
export function facingFor(side: "player" | "enemy"): Facing {
  return side === "player" ? "back" : "front";
}

export function battleSpriteKey(lineId: string, age: string, facing: Facing): string {
  return `battle/${lineId}/${age}/${facing}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pure model
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * HP-bar bands. PRESENTATION thresholds — they change a colour and nothing else, so they are not
 * gameplay constants and do not belong in data/balance.json (G11 governs values the SIM reads).
 */
const HP_BAND_WARN = 0.5;
const HP_BAND_CRITICAL = 0.2;

export interface HpBarModel {
  frac: number;
  fillPx: number;
  totalPx: number;
  swatchRole: UiSwatchRole;
  /** "17/34" — the real numbers, always shown (G7: numbers, not adjectives). */
  readout: string;
}

/**
 * Monospace advance width as a fraction of the font's pixel size.
 *
 * Presentation only, and only used to prove a string FITS its plate — the browser does the real
 * measuring. Measured against the shipped 8px monospace face: "102/102" (7 glyphs) renders 34px,
 * i.e. 0.607 per glyph. 0.6 is the conventional monospace ratio and is the conservative side of
 * that measurement for the widths this card deals in.
 */
const MONO_ADVANCE_RATIO = 0.6;

/** Rendered width of a monospace string, in pixels. `fontSize` is a CSS length like "8px". */
export function monoTextWidth(text: string, fontSize: string): number {
  const px = Number.parseFloat(fontSize);
  if (!Number.isFinite(px)) return 0;
  return Math.ceil(text.length * px * MONO_ADVANCE_RATIO);
}

export function hpBarModel(curHp: number, maxHp: number, widthPx: number): HpBarModel {
  const frac = maxHp <= 0 ? 0 : Math.max(0, Math.min(1, curHp / maxHp));
  const swatchRole: UiSwatchRole = frac <= HP_BAND_CRITICAL ? "hpLow" : frac <= HP_BAND_WARN ? "hpMid" : "hpHigh";
  return {
    frac,
    fillPx: Math.round(widthPx * frac),
    totalPx: widthPx,
    swatchRole,
    readout: `${String(Math.max(0, curHp))}/${String(Math.max(0, maxHp))}`,
  };
}

/**
 * The retirement line on the player's card (bible §4 / build-doc §7.5 — the projected retirement
 * year is a Hard Requirement on every creature card, and the battle card is where the player looks
 * at it most). `NEVER` is the Ancients' sentinel and prints as a dash, never as a huge number.
 */
export function retirementLabel(projectedRetirementYear: number | undefined): string {
  if (projectedRetirementYear === undefined) return "";
  if (isNever(projectedRetirementYear)) return "Retires —";
  return `Retires Y${String(projectedRetirementYear)}`;
}

export interface CombatantCardModel {
  /** "Ember  Lv 18" — nickname or form name, then the level. */
  title: string;
  hp: HpBarModel;
  /** The status chip's text, or "" when the battler is clear. */
  status: string;
  /** Active in-battle stat modifiers as arrows: "atk↑ spd↓". Read off `statMods`, never computed. */
  mods: string;
  /** "" for the enemy — the projected retirement year is a fact about a creature you own. */
  retirement: string;
  spriteKey: string;
  fainted: boolean;
}

export function combatantCardModel(
  view: BattlerView,
  hpBarWidth: number,
  projectedRetirementYear?: number,
): CombatantCardModel {
  // `statArrows` is the view's own log-tracked record (game/battle-view.ts). Reading `statMods`
  // here instead would show the modifiers as of the last SYNC, which mid-turn is the end of the
  // whole reducer step — the same premature read that emptied the player's HP bar on their own buff.
  const mods: string[] = [];
  for (const [stat, direction] of Object.entries(view.statArrows)) {
    mods.push(`${stat}${direction === "up" ? "↑" : "↓"}`);
  }
  return {
    title: `${view.displayName}  Lv ${String(view.level)}`,
    hp: hpBarModel(view.curHp, view.maxHp, hpBarWidth),
    status: view.status ?? "",
    mods: mods.join(" "),
    retirement: view.side === "player" ? retirementLabel(projectedRetirementYear) : "",
    spriteKey: battleSpriteKey(view.lineId, view.age, facingFor(view.side)),
    fainted: view.fainted,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Phaser view
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CombatantCardStyle {
  cardW: number;
  cardH: number;
  hpBarW: number;
  hpBarH: number;
  spriteW: number;
  spriteH: number;
  fontSize: string;
}

/** Inset from the plate's edge to anything drawn on it. */
export const CARD_PADDING = 4;

/**
 * `hpBarW` is 92, not the plate width minus the padding.
 *
 * The HP readout is drawn to the RIGHT of the bar, and at 108 it started at local x 116 on a 150px
 * plate: "102/102" is 34px wide and ended exactly on the border, and anything wider spilled off the
 * card. Three-digit HP is the normal case here (the shipped gym enemy is 102, the player 114), so
 * the overrun was the default rendering, not an edge case. The bar is narrowed to leave the readout
 * a column wide enough for four digits either side of the slash, and {@link hpReadoutFits} is
 * asserted against every battler in the recorded fixtures.
 */
export const DEFAULT_CARD_STYLE: CombatantCardStyle = {
  cardW: 150,
  cardH: 46,
  hpBarW: 92,
  hpBarH: 5,
  spriteW: 72,
  spriteH: 72,
  fontSize: "8px",
};

/** Local x of the HP readout's RIGHT edge. Right-aligned, so a long value grows away from the border. */
export function hpReadoutRightX(style: CombatantCardStyle): number {
  return style.cardW - CARD_PADDING;
}

/**
 * Does this readout fit the column between the bar and the plate's right border?
 *
 * The readout is right-aligned at `cardW - CARD_PADDING`, so it can only ever collide with the BAR,
 * never with the border. This is the check that says it does not.
 */
export function hpReadoutFits(style: CombatantCardStyle, readout: string): boolean {
  const left = hpReadoutRightX(style) - monoTextWidth(readout, style.fontSize);
  return left >= CARD_PADDING + style.hpBarW + CARD_PADDING;
}

/**
 * Anything that can be cancelled. `Phaser.Tweens.Tween` satisfies it structurally; the narrow shape
 * keeps this file's only engine dependency a type import.
 */
export interface Cancellable {
  remove(): unknown;
}

/**
 * One combatant: a sprite (or a labelled placeholder naming the unbuilt asset) plus its card.
 *
 * `sprite` is exposed because the scene tweens it — the lunge, the shake, the faint fade all belong
 * to `BattleScene`, which is the only file in lane C3 that owns timing.
 *
 * OWNERSHIP (a reproduced leak)
 * ─────────────────────────────
 * The sprite is added to the SCENE, not to `root`: `placeholderImage` calls `scene.add.image`, and
 * a container child is positioned relative to the container, which is the card, which is nowhere
 * near the creature. That is correct — but it means `root.destroy()` does NOT take the sprite with
 * it, and the scene destroyed only `root` on every rebuild. Two combatants are ever on the field
 * and the shipped gym fight ended with TWENTY combatant images stacked at the two sprite positions:
 * a fainted creature stayed on screen at full opacity beside a 0-HP card, and every switch leaked
 * another. So the panel owns everything it created and {@link destroy} is the only way to let go of
 * it — the caller cannot forget the half it cannot see.
 */
export class CombatantPanel {
  readonly root: PhaserNS.GameObjects.Container;
  readonly sprite: PhaserNS.GameObjects.GameObject;
  private readonly title: PhaserNS.GameObjects.Text;
  private readonly hpFill: PhaserNS.GameObjects.Rectangle;
  private readonly hpText: PhaserNS.GameObjects.Text;
  private readonly statusText: PhaserNS.GameObjects.Text;
  private readonly footer: PhaserNS.GameObjects.Text;
  private readonly style: CombatantCardStyle;
  /** Kept so {@link destroy} can cancel every tween still pointed at this panel's objects. */
  private readonly scene: PhaserNS.Scene;
  /** The in-flight HP tween, so it can be cancelled before the objects it writes to are destroyed. */
  private hpTween: Cancellable | null = null;
  private dead = false;

  constructor(
    scene: PhaserNS.Scene,
    opts: {
      x: number;
      y: number;
      cardX: number;
      cardY: number;
      view: BattlerView;
      projectedRetirementYear?: number;
      style?: CombatantCardStyle;
    },
  ) {
    const style = opts.style ?? DEFAULT_CARD_STYLE;
    this.style = style;
    this.scene = scene;
    const model = combatantCardModel(opts.view, style.hpBarW, opts.projectedRetirementYear);

    // The ONE shared stand-in helper (game/placeholder.ts). Real art is drawn at its natural size
    // and only a MISSING asset becomes a labelled, hatched box naming this exact manifest row — no
    // unrelated trial image is ever stretched into a slot it was not generated for.
    this.sprite = placeholderImage(scene, opts.x, opts.y, model.spriteKey, style.spriteW, style.spriteH, {
      note: `lane B · ${opts.view.side}`,
    });

    const plate = scene.add.rectangle(0, 0, style.cardW, style.cardH, roleColor("panel"));
    plate.setOrigin(0, 0);
    plate.setStrokeStyle(1, roleColor("border"));

    const text = (x: number, y: number, value: string, role: UiSwatchRole): PhaserNS.GameObjects.Text => {
      const t = scene.add.text(x, y, value, {
        fontFamily: "monospace",
        fontSize: style.fontSize,
        color: roleHex(role),
      });
      t.setOrigin(0, 0);
      return t;
    };

    this.title = text(CARD_PADDING, 4, model.title, "text");
    const track = scene.add.rectangle(CARD_PADDING, 18, style.hpBarW, style.hpBarH, roleColor("panelInner"));
    track.setOrigin(0, 0);
    this.hpFill = scene.add.rectangle(CARD_PADDING, 18, model.hp.fillPx, style.hpBarH, roleColor(model.hp.swatchRole));
    this.hpFill.setOrigin(0, 0);
    // Right-aligned: a three- or four-digit readout grows leftwards into its own column instead of
    // spilling over the plate's border.
    this.hpText = text(hpReadoutRightX(style), 15, model.hp.readout, "textMuted");
    this.hpText.setOrigin(1, 0);
    this.statusText = text(CARD_PADDING, 26, model.status, "status");
    this.footer = text(
      CARD_PADDING,
      35,
      model.retirement === "" ? model.mods : `${model.retirement}  ${model.mods}`,
      "textMuted",
    );

    this.root = scene.add.container(opts.cardX, opts.cardY, [
      plate,
      this.title,
      track,
      this.hpFill,
      this.hpText,
      this.statusText,
      this.footer,
    ]);
  }

  /** Re-read every absolute. Called with the display state the STEP being played carries. */
  update(view: BattlerView, projectedRetirementYear?: number): void {
    if (this.dead) return;
    const model = combatantCardModel(view, this.style.hpBarW, projectedRetirementYear);
    this.title.setText(model.title);
    this.paintHp(model.hp);
    this.statusText.setText(model.status);
    this.footer.setText(model.retirement === "" ? model.mods : `${model.retirement}  ${model.mods}`);
  }

  /**
   * Show one HP value — bar AND number, together.
   *
   * There is exactly ONE writer of the HP display, and it writes both halves. The first cut had two
   * (`setHpFillPx` resized the rectangle, `update` set the text), and the tween only called the
   * first: the bar drained from full to empty while the card went on printing the pre-turn number,
   * then jumped to the post-turn one. A caller that can move the bar without moving the number will
   * eventually do exactly that, so there is no such caller any more.
   */
  setHp(curHp: number, maxHp: number): void {
    if (this.dead) return;
    this.paintHp(hpBarModel(curHp, maxHp, this.style.hpBarW));
  }

  private paintHp(hp: HpBarModel): void {
    this.hpFill.setSize(Math.max(0, hp.fillPx), this.style.hpBarH);
    this.hpFill.setFillStyle(roleColor(hp.swatchRole));
    this.hpText.setText(hp.readout);
  }

  /** Hand the panel the tween that is driving its HP, so {@link destroy} can cancel it. */
  ownHpTween(tween: Cancellable | null): void {
    this.hpTween?.remove();
    this.hpTween = tween;
  }

  /** True once {@link destroy} has run — a tween's `onUpdate` closure outlives its target. */
  get destroyed(): boolean {
    return this.dead;
  }

  /**
   * Let go of everything this panel created: the in-flight HP tween first (its `onUpdate` writes to
   * the rectangle that is about to be destroyed, and Phaser's tween loop throws on a null
   * `geom` — an observed `TypeError` in the running game), then the card, then the sprite the
   * container never held.
   */
  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.hpTween?.remove();
    this.hpTween = null;
    // SIBLING SWEEP. The HP tween is not the only one pointed at this panel: `game/ui/BattleFx.ts`
    // aims the lunge, the hit shake, the faint fade, the flee dash and the snare shakes at
    // `this.sprite`. Every one of them writes to the object about to be destroyed, so all of them
    // go, not just the one that was observed throwing.
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.hpFill);
    this.root.destroy();
    this.sprite.destroy();
  }
}
