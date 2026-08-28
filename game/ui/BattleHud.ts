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
import { validateContent } from "../../core/schemas";
import type { Balance } from "../../core/types";
import { roleColor, roleHex, type UiSwatchRole } from "./Palette";
import { UI_FRAME_ASSET_ID, drawFrameRingIn } from "./FramePanel";
import { placeholderImage } from "../placeholder";

/* ────────────────────────────────────────────────────────────────────────────
 * Asset keys — the rows Lane B's battle-sprite batch actually ships.
 *
 * ⚠ build-doc §9.7 says 154 battle sprites (77 forms) and the shipped roster does not give that:
 * the count is 75 — one FRONT sprite per form, where a form is one (line, age class), which is also
 * what `tools/comfy/manifest.json` ships. The key is that tuple, built from data at runtime — no
 * species name is ever written in this file (build-doc §8.3 / G2).
 *
 * It was 150 (75 forms × front/back) until the back view was cut — see {@link Facing}.
 *
 * WHAT WAS WRONG WITH THE FIRST CUT
 * ─────────────────────────────────
 * It ASSUMED a key shape (`battle/<lineId>/<age>/<facing>`) and logged "lane B must adopt this key"
 * as an open question. The manifest was already committed and disagreed:
 * `tools/comfy/manifest.json`'s `creature-battle` rows are `battle-cindril-j-front` at
 * `assets/final/creature-battle/`, and `game/placeholder.ts::assetId` turns that finalFile into the
 * texture key `creature-battle/battle-cindril-j-front`. Measured intersection of the 162 keys this
 * function used to produce with the manifest's 150 ids (its count at the time): **zero**. So when
 * the art lands, every
 * battle sprite would have gone on silently drawing a placeholder — `textureFor` falls back without
 * a warning. The key below is the manifest's own id, derived by the manifest's own rule
 * (`tools/comfy/comfy-batch.ts::deriveRows`, `shortId = lineId.replace(/-line$/, '')`), and
 * `tests/unit/battle-view.test.ts` asserts SET EQUALITY against the committed rows rather than
 * restating this function.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * There is ONE view of a creature in battle, and it is the front.
 *
 * This is a one-member union ON PURPOSE. Hank's ruling — "we're not going to have the backs of any
 * of the creatures. Both creatures are going to be facing forward in battle." — kills the back view
 * as a CONCEPT, not just as art that was never drawn, so {@link battleSpriteKey} must be
 * structurally unable to spell a `-back` key rather than merely never asked for one. Widening this
 * union is the deliberate act that reintroduces the back view; a reviewer sees it in the diff, and
 * `tests/unit/manifest.test.ts` reds on the manifest half the same moment
 * (`§9.7 asset counts` asserts NO `-back` row exists and that the view set is exactly {front}).
 *
 * `tools/comfy/manifest.json` `classes["creature-battle"].views` carries the same single view, and
 * `tools/comfy/comfy-batch.ts::deriveRows` reads that map rather than a literal — so the generator
 * cannot re-derive a back row either.
 */
export type Facing = "front";

/** `tools/comfy/manifest.json` `classes["creature-battle"].finalDir`, minus `assets/final/`. */
const BATTLE_SPRITE_DIR = "creature-battle";
/** `comfy-batch.ts::shortId` — every id in `data/species.json` ends in this. */
const LINE_ID_SUFFIX = "-line";

/**
 * BOTH combatants are seen from the front — the player's own creature no less than the enemy's.
 *
 * The side is deliberately ignored rather than the parameter removed: this function is the named
 * seam the ruling lives at, and if the two sides are ever drawn differently again this is where
 * that decision goes. It used to read `side === "player" ? "back" : "front"`, which is exactly the
 * line a future reader would restore from a comment that still said "seen from behind".
 */
export function facingFor(_side: "player" | "enemy"): Facing {
  return "front";
}

/**
 * The texture key for one battle sprite — identical to the manifest row's asset id.
 *
 * NOT tolerant of an unknown age: `age` is `Battler.age`, one of core/types.ts's `AGE_CLASSES`, and
 * lower-casing it is the manifest's own `stage.toLowerCase()`.
 */
export function battleSpriteKey(lineId: string, age: string, facing: Facing): string {
  const stem = lineId.endsWith(LINE_ID_SUFFIX) ? lineId.slice(0, -LINE_ID_SUFFIX.length) : lineId;
  return `${BATTLE_SPRITE_DIR}/battle-${stem}-${age.toLowerCase()}-${facing}`;
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

/**
 * Everything about a card that is not read off the battler itself. The caller owns all of it: the
 * retirement year comes from core/lifecycle.ts, and the lure LABEL comes from `data/moves.json`
 * through the scene (no move name is written in this file — build-doc §8.3 / G2).
 */
export interface CardExtras {
  /** `OwnedCreature.projectedRetirementYear`. Absent for a creature the player does not own. */
  projectedRetirementYear?: number;
  /** `BattleState.lureActive`, carried per step by `ViewStep.lureActive`. */
  lureActive?: boolean;
  /** The lure move's `name` from content. Absent ⇒ no chip, rather than a coined word. */
  lureLabel?: string;
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
  /**
   * The persistent Lure chip, or "".
   *
   * `BattleState.lureActive` is per-target and per-battle (bible §3) and multiplies catch odds for
   * the rest of the fight (build-doc §7.2 `lureMult`). Its entire on-screen life used to be a 260ms
   * caption, so by the time the snare was thrown nothing said why the percentage was what it was.
   * It is drawn on the ENEMY card because that is what the flag is about — core clears it on any
   * enemy replacement.
   */
  lure: string;
  spriteKey: string;
  fainted: boolean;
}

export function combatantCardModel(
  view: BattlerView,
  hpBarWidth: number,
  extras: CardExtras = {},
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
    retirement: view.side === "player" ? retirementLabel(extras.projectedRetirementYear) : "",
    lure:
      view.side === "enemy" && extras.lureActive === true && extras.lureLabel !== undefined
        ? extras.lureLabel
        : "",
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
const CARD_GEOMETRY = {
  cardW: 150,
  cardH: 46,
  hpBarW: 92,
  hpBarH: 5,
  fontSize: "8px",
} as const;

/**
 * build-doc §9.3 — "nearest-neighbor downscale to target (battle 96², overworld chars 32×48, minis
 * 32²)". The battle slot is the size the ART PIPELINE hands it, so it is read from
 * `balance.map.battleSpritePx` and is not a literal here (G11/INV-3).
 *
 * ⚠ THIS IS THE NUMBER THE BATTLE SCREEN ACTUALLY DRAWS WITH, and for a while it was the decoy of
 * the pair. `game/ui/BattleLayout.ts` was moved off its `SPRITE_W = 96` onto the balance key while
 * `DEFAULT_CARD_STYLE` here kept `spriteW: 96` — and `spriteW` is what reaches
 * {@link CombatantPanel}'s `placeholderImage` call, the only place a combatant sprite is sized. So
 * retuning `map.battleSpritePx` moved a helper with no production callers and left every drawn
 * sprite at 96. The layout's `spriteRect` and this style now read the same accessor, and
 * `game/scenes/BattleScene.ts` passes the style it built from ITS OWN `ctx.balance` rather than
 * taking a module-level default.
 */
export function defaultCardStyle(balance?: Balance): CombatantCardStyle {
  const px = battleSpritePx(balance);
  return { ...CARD_GEOMETRY, spriteW: px, spriteH: px };
}

/**
 * The card style for the SHIPPED balance. A convenience for callers that have no `Balance` to hand
 * (layout maths, tests about the plate); anything that draws a sprite should build its own from the
 * balance it is running against — see {@link defaultCardStyle}.
 */
export const DEFAULT_CARD_STYLE: CombatantCardStyle = defaultCardStyle();

/**
 * build-doc §9.3's battle target, read from `data/balance.json` (`map.battleSpritePx`).
 *
 * It WAS a literal in `game/ui/BattleLayout.ts` (`SPRITE_W = SPRITE_H = 96`) because `balance.map`
 * declared `playerSpriteW/H` for the overworld and had no battle-sprite key at all — a gap the art
 * lane had reported from the other side (tools/comfy/manifest.json deviation LB-M4).
 *
 * It lives in THIS file, not in the layout, because this is the file that draws the sprite;
 * `BattleLayout.ts` re-exports it for its own `spriteRect`, and the two therefore cannot disagree.
 *
 * HEADROOM, measured at the shipped 480×320: the 96² rects are player y131..227 and enemy y42..138
 * against `message.y = 274`, so neither sprite reaches the message box.
 */
export function battleSpritePx(balance?: Balance): number {
  return (balance ?? validateContent().balance).map.battleSpritePx;
}

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
  /** The persistent Lure chip. Right-aligned on the status row, so it never collides with it. */
  private readonly lureText: PhaserNS.GameObjects.Text;
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
      style?: CombatantCardStyle;
    } & CardExtras,
  ) {
    const style = opts.style ?? DEFAULT_CARD_STYLE;
    this.style = style;
    this.scene = scene;
    const model = combatantCardModel(opts.view, style.hpBarW, opts);

    // The ONE shared stand-in helper (game/placeholder.ts). Real art is drawn at its natural size
    // and only a MISSING asset becomes a labelled, hatched box naming this exact manifest row — no
    // unrelated trial image is ever stretched into a slot it was not generated for.
    this.sprite = placeholderImage(scene, opts.x, opts.y, model.spriteKey, style.spriteW, style.spriteH, {
      note: `lane B · ${opts.view.side}`,
    });

    const plate = scene.add.rectangle(0, 0, style.cardW, style.cardH, roleColor("panel"));
    plate.setOrigin(0, 0);
    /*
     * The card's EDGE is `tools/comfy/manifest.json` row `ui-battle-hud-frame` — "a battle status
     * frame with a health bar recess", `_ui#battle-hud-frame`, generated at 240×64 and drawn here at
     * `cardW`×`cardH` (150×46), which is the size `tools/ui-frames/SPEC.md` §4.3 pins it to.
     *
     * THE PLATE UNDER IT STAYS `panel`, and the ring is drawn ON it rather than instead of it. Two
     * measured reasons, and the second is the one that matters:
     *   · `roleColor("panel")` is `#74564e`, which is EXACTLY the frame's inner-ring colour, so the
     *     art and the plate already agree and the card gains a hard `#040308` keyline and nothing
     *     else — which is what a Gold status box is.
     *   · The frame's own interior is `#faf7eb`, and `roleHex("text")` — this card's title, its
     *     level, its footer — is `#faf7eb` too. Painting the art's interior as the card body would
     *     draw every one of those lines at 1 : 1 against its own background while
     *     `tests/gates/ui-contrast-contract.test.ts` stayed green, because that gate measures the
     *     ROLE against the `panel` swatch and cannot see a PNG painted over it.
     *
     * `CARD_PADDING` is 4 and the ring is 4 deep, so no glyph on the card is under the chrome.
     * Without the texture the card keeps the hairline it has always drawn.
     */
    const ring = drawFrameRingIn(scene, UI_FRAME_ASSET_ID.battleHud, {
      x: 0,
      y: 0,
      width: style.cardW,
      height: style.cardH,
    });
    if (ring === null) plate.setStrokeStyle(1, roleColor("border"));

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
    // `hpTrack`, not `panelInner`. The track and the menu's cursor bar used to share one role, and
    // one swatch cannot be both dark enough for a bar to read against and light enough for a cursor
    // to read on the plate: the frozen value that suited the cursor left a half-health bar at
    // 1.64 : 1. See game/ui/Palette.ts.
    const track = scene.add.rectangle(CARD_PADDING, 18, style.hpBarW, style.hpBarH, roleColor("hpTrack"));
    track.setOrigin(0, 0);
    this.hpFill = scene.add.rectangle(CARD_PADDING, 18, model.hp.fillPx, style.hpBarH, roleColor(model.hp.swatchRole));
    this.hpFill.setOrigin(0, 0);
    // Right-aligned: a three- or four-digit readout grows leftwards into its own column instead of
    // spilling over the plate's border.
    this.hpText = text(hpReadoutRightX(style), 15, model.hp.readout, "textMuted");
    this.hpText.setOrigin(1, 0);
    this.statusText = text(CARD_PADDING, 26, model.status, "status");
    this.lureText = text(hpReadoutRightX(style), 26, model.lure, "accent");
    this.lureText.setOrigin(1, 0);
    this.footer = text(
      CARD_PADDING,
      35,
      model.retirement === "" ? model.mods : `${model.retirement}  ${model.mods}`,
      "textMuted",
    );

    // The ring goes into the container with everything else, so `root.destroy()` still takes the
    // whole card: a piece left on the scene's display list would outlive the panel it framed and
    // stack up on every switch, which is the leak the header's OWNERSHIP note records for the sprite.
    this.root = scene.add.container(opts.cardX, opts.cardY, [
      plate,
      ...(ring ?? []),
      this.title,
      track,
      this.hpFill,
      this.hpText,
      this.statusText,
      this.lureText,
      this.footer,
    ]);
  }

  /** Re-read every absolute. Called with the display state the STEP being played carries. */
  update(view: BattlerView, extras: CardExtras = {}): void {
    if (this.dead) return;
    const model = combatantCardModel(view, this.style.hpBarW, extras);
    this.title.setText(model.title);
    this.paintHp(model.hp);
    this.statusText.setText(model.status);
    this.lureText.setText(model.lure);
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
