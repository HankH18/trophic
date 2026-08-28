/**
 * game/scenes/DexScene.ts — the dex (bible §12; build-doc §15 C4, and C-4 has been TAKEN).
 *
 * Two things this scene exists to get right:
 *
 * 1. **Hard Req 10 — legibility.** bible §5: "dex entries and sign cards flag migrants as 'dormant'
 *    or 'migrating' out of season, so seasonal absence is never confusable with a population crash."
 *    The flags come from `core/foodweb.ts` via `game/survey-view.ts` — `migrantStatus` for the
 *    season, and `encounterWeights` itself, the roll's own call, for the sign-chain gate. Both are
 *    needed: with only the first, this screen read "individuals in region 1" for the three Ancients
 *    while the roll could never produce them. The entry additionally carries the live regional
 *    count when the caller hands over the node states, so every reason a creature is not in front
 *    of the player is on screen at once: `dormant` with a real count beside it, `not in the wild
 *    encounter pool` with a real count beside it, or the integer `0`.
 *
 * 2. **Honest placeholders.** The painted dex class (build-doc §9.4) is CUT — cut line C-4, taken by
 *    the owner: the dex draws the existing creature sprites, which is what {@link creatureArtId}
 *    resolves. Every slot still goes through `game/placeholder.ts` — the ONE shared helper — which
 *    draws the real texture when it has loaded and a labelled stand-in carrying the missing asset's
 *    id when it has not. Nothing here stretches an unrelated image into the slot, and nothing
 *    leaves it blank: a blank looks finished, a labelled box is a work item.
 *
 * G7 — no copy in this file judges the player.
 */

import Phaser from "phaser";
import {
  DEX_ART_BOX,
  SCREEN_COLOR,
  SCREEN_HEX,
  SCREEN_TEXT,
  buildDexEntries,
  regionalCount,
  renderDexEntry,
  renderDexFlags,
  type DexEntry,
} from "../survey-view";
import { placeholderImage } from "../placeholder";
import { battleSpriteKey } from "../ui/BattleHud";
import { UI_FRAME_ASSET_ID, drawFrameRingIn } from "../ui/FramePanel";
import { ancientAgeClass } from "../finale";
import { SCENE_KEYS, sceneRegistered } from "../scene-keys";
import type { MenuRequest } from "../menu-model";
import type { AgeClass, Content, NodeState, Season } from "../../core/types";

/**
 * The scene key, READ from the registry rather than spelled again here (as `SurveyScene` does).
 * `game/scene-keys.ts` is engine-free — `import type` only — so there is no reason for this file to
 * hold a second copy of the string, and two spellings of one key is the exact failure that registry
 * exists to prevent. It carried its own literal while the registry had no `dex` entry; the registry
 * has one, `game/main.ts` registers this scene, and `game/scenes/MenuScene.ts` routes to it.
 */
export const DEX_SCENE_KEY = SCENE_KEYS.dex;

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
  /**
   * WHERE ESC GOES. Required, like `BattleSceneData.onFinished`, `DialogueSceneData.onDone`,
   * `YearTurnSceneData.onDone`, `RetirementSceneData.onDone` and — since the epilogue defect —
   * `SurveySceneData.onClose`. Optional was how that one happened: nothing in the type system asked
   * the caller where the way back was, so one caller never answered and a full-screen card had no
   * exit. This scene has one supplier today (`game/scenes/MenuScene.ts`) and it supplies one; the
   * type is what stops a second supplier from repeating it. {@link closeScreen} keeps a last resort
   * anyway, because Phaser starts scenes with `unknown` data and a required field is erased at run
   * time.
   */
  onClose: () => void;
}


/**
 * The in-run menu, respelled here ONLY because there is nowhere shared to read it from: the
 * constant lives privately in `game/scenes/MenuScene.ts` and again in `game/boot.ts`, and this file
 * cannot import either (both pull the engine in at module scope). Typed against `MenuRequest` so a
 * third spelling cannot drift into a shape `isMenuRequest` rejects.
 */
const SESSION_MENU_REQUEST: MenuRequest = { mode: "session" };

/**
 * Leave a full-screen card, with a last resort for the caller that did not say where to go.
 *
 * NOT `this.scene.stop()`, which is what `game/scenes/SurveyScene.ts` does — and the difference is
 * the launch pattern, checked rather than assumed. The survey's broken caller used
 * `scene.launch`, so it was always drawn OVER a scene that was still there and stopping it uncovered
 * one. These two are opened by `MenuScene`'s `screen()` helper with `scene.start`, and
 * `Phaser.Scenes.ScenePlugin.start` queues `stop` on the CALLING scene before it starts the new one
 * — so by the time this card is on screen the menu is shut down, and the overworld before it was
 * shut down the same way. Nothing is underneath. Stopping here would take the last live scene down
 * and leave a black screen taking no input, which is worse than the defect being prevented.
 *
 * So the last resort reopens the one door these cards have. It is said out loud because a hand-off
 * that arrived without its way back is a wiring defect, not a mode; and the menu is ASKED FOR first
 * (`sceneRegistered`), because `scene.start` on an unregistered key is a console warning and a
 * silent no-op — which would strand the player exactly the way this is here to prevent. If even the
 * menu is not registered there is genuinely nowhere to go, and taking the card down at least stops
 * it eating input.
 */
export function closeScreen(scene: Phaser.Scene, onClose: unknown, label: string): void {
  // Named rather than inlined, because it is TWO exits and which one is right is a fact about what
  // `game/main.ts` registered — so the choice between them is worth reading on its own.
  const lastResort = (): void => {
    if (sceneRegistered(scene, SCENE_KEYS.menu)) {
      console.warn(`[${label}] closed with no onClose — reopening "${SCENE_KEYS.menu}" instead`);
      scene.scene.start(SCENE_KEYS.menu, SESSION_MENU_REQUEST);
      return;
    }
    console.warn(`[${label}] closed with no onClose and no "${SCENE_KEYS.menu}" to return to`);
    scene.scene.stop();
  };
  const closer = typeof onClose === "function" ? (onClose as () => void) : lastResort;
  return closer();
}

// The screen's colours have one home, in game/survey-view.ts, for the reason its text metrics do:
// a scene cannot be imported by a node test, so a palette rule inside one is a palette rule nothing
// can check. These four WERE `#e8e4d8`, `#8a8676`, `#d8a24a` and `0x14140f` — not one of which is
// one of the 32 swatches `data/palette.json` froze at gate B0 (build-doc §8.4).
const INK = SCREEN_HEX.ink;
const INK_DIM = SCREEN_HEX.inkDim;
const INK_FLAG = SCREEN_HEX.inkFlag;
const BACKDROP = SCREEN_COLOR.backdrop;

// The screen's text metrics have one home, in game/survey-view.ts (see SurveyScene).
const FONT = SCREEN_TEXT.fontFamily;
const BODY_PX = SCREEN_TEXT.fontPx;
const LINE_H = SCREEN_TEXT.lineHeight;
const PAD = SCREEN_TEXT.padPx;
// The slot the text is laid out beside, declared in game/survey-view.ts so the width its lines are
// asserted against is measured from the same left edge this scene draws them at.
const ART_BOX = DEX_ART_BOX;

export interface ArtBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The creature picture a card slot draws — the dex plate, the team card portrait and (via the same
 * grammar) the Legacy card's portrait well.
 *
 * ⚠ THIS IS A BATTLE SPRITE, AND THAT IS THE RULING, NOT A SHORTCUT. build-doc §9.4's painted dex
 * class is cut line C-4, and C-4 has been taken: *"the dex uses the existing creature sprites"*
 * (docs/STATUS.md, relayed from the art-lane session and vouched for). Under the old
 * `dex-painted/dex-<name>` key all 35 plates were declared stand-ins, so none of these three slots
 * had real art for ANY line — including the one picture on the never-cut Legacy beat. All 75
 * `creature-battle` sprites are real files and none of them is declared a stand-in.
 *
 * ⚠ THE CLASS IS DELETED (`ef9982f`), SO DO NOT GO LOOKING FOR EITHER PATH. `assets/final/dex-painted/`
 * and its 35 plates are gone, and the declaration that listed them moved from
 * `assets/final/dex-painted/stand-ins.json` to `assets/final/stand-ins.json` — a register of which
 * SHIPPED files are placeholders has repository scope, and it was the only one in the tree, so
 * deleting the class would have taken it. `game/placeholder.ts` still globs
 * `assets/final/**\/stand-ins.json`, so per-directory declarations resolve; that file is the home.
 *
 * THE KEY IS NOT BUILT HERE. `game/ui/BattleHud.ts::battleSpriteKey` is the ONE producer of the
 * `creature-battle/battle-<stem>-<age>-<facing>` grammar and is bound to the committed manifest
 * rows by `tests/unit/battle-view.test.ts`. Spelling a second one here is precisely the T-19 defect
 * (`dex/<name>` against a manifest that said `dex-painted/dex-<name>`) and the BattleHud defect
 * before it (`battle/<line>/<AGE>/<facing>`), both measured at intersection ZERO with the manifest.
 *
 * FACING is `"front"` and cannot be anything else: `Facing` is a one-member union since the owner
 * cut the back view ("we're not going to have the backs of any of the creatures"), so a back key is
 * a compile error rather than a silently unbuilt asset. `tools/comfy/manifest.json` carries zero
 * back rows and `assets/final/creature-battle/` zero back files.
 *
 * THE AGE IS THE CARD'S OWN, EXCEPT FOR AN ANCIENT. `ageClassOfDexId` resolves a dex identity to
 * the FIRST age class whose form name matches, and an Ancient's three form names are identical, so
 * its entry reports the juvenile class — while `tools/comfy/comfy-batch.ts::artFormsOf` ships an
 * Ancient ONE form and `core/lifecycle.ts` `newOwnedCreature` forces every owned Ancient to the
 * terminal class (G10, "Caught Ancients never age"). Without the clamp the three Ancients would ask
 * for `battle-{vellsire,kilnback,undermere}-{j,a}-front` — six keys with no manifest row and no
 * file, i.e. a stand-in on a creature whose sprite exists. `ancientAgeClass()` is the shipped
 * statement of which class that is, and `tests/gates/asset-reachability.test.ts` already uses the
 * same call to bound the battle census for the same reason.
 */
export function creatureArtId(lineId: string, age: AgeClass, ancient: boolean): string {
  return battleSpriteKey(lineId, ancient ? ancientAgeClass() : age, "front");
}

/**
 * Draw one art slot through the shared helper: the real texture when it has loaded, a labelled
 * stand-in of exactly this size when it has not.
 *
 * This comment used to say "real art is never scaled to fit — `placeholder.ts` draws it at its
 * natural size", and that was the bug, not the contract. The `dex-painted` class was generated at
 * 1024² (`fit:false`), `box` here is 128², and unscaled meant every plate would have covered the
 * whole 480×320 screen the day the art landed. `placeholderImage` now scales real art DOWN into the
 * box with one factor on both axes — a fit, never a stretch — and the stand-in, being generated at
 * the box size already, is untouched. See `fitWithin` in `game/placeholder.ts`;
 * `tests/unit/art-slot-fit.test.ts` holds it.
 *
 * ⚠ THE 1024² PLATE IS NO LONGER IN `tools/comfy/manifest.json` TO LOOK UP — the class went with cut
 * line C-4 (`ef9982f`). The fix it motivated is NOT dead with it: `art-slot-fit` now asserts against
 * a REAL shipped oversize, 160x320, which is oversized on both axes against all three slots and,
 * unlike 1024², is non-square. Do not "simplify" the fit away because the plate that exposed it is
 * gone.
 *
 * ⚠ `fitWithin` IS NOT WHAT MADE THE PIXELS SOFT, and it must not be "fixed" for that. What the
 * slots ask for now is the 96² battle sprite ({@link creatureArtId}), and the RATIO is what
 * changed: 1024→128 was 1:8 but 1024→96 was 1:10.67 and 1024→48 was 1:21.33, and a non-integer
 * nearest-neighbour factor smears the pixel grid. At 96² every slot is an integer factor — 128²
 * draws at ×1 inside a 16px gutter (the helper never upscales), 96² at ×1, and the 48² portrait
 * well at exactly ×0.5. `tests/unit/art-slot-fit.test.ts` asserts that ratio, so shrinking a slot
 * below the sprite by a non-divisor goes red instead of quietly softening.
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
    keyboard?.on("keydown-ESC", () => this.close());
    this.redraw();
  }

  /** ESC. See {@link closeScreen} for what happens when the caller supplied no way back. */
  close(): void {
    closeScreen(this, this.args.onClose, "dex");
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
   * The lines drawn beside the art. Every one of them is produced by `game/survey-view.ts`, which
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
    this.drawCardFrame(map.virtualWidth, map.virtualHeight);

    const entry = this.current();
    if (!entry) {
      this.layer.add(this.text(PAD, PAD, "dex 0/0", INK_DIM));
      return;
    }

    this.layer.add(
      drawArtSlot(this, ART_BOX, creatureArtId(entry.lineId, entry.ageClass, entry.ancient)),
    );

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

  /**
   * The card's edge — `tools/comfy/manifest.json` row `ui-dex-card-frame`, whose `origin` reads
   * "manifest._ui#dex-card-frame — bible §12 screens — dex". This screen is what it was drawn for.
   *
   * TWO THINGS ARE DELIBERATELY NOT DONE WITH IT, AND BOTH ARE MEASURED.
   *
   * 1. **Its interior is not painted.** The PNG's plate is `#faf7eb`, and `SCREEN_HEX.ink` — the
   *    colour every line on this card is drawn in — is `#faf7eb` as well. Adopting the art's plate
   *    as the card body draws the whole dex at 1 : 1 against its own background, and
   *    `tests/gates/ui-contrast-contract.test.ts` cannot see it happen, because that gate measures
   *    the `ink` role against the `backdrop` SWATCH and knows nothing about a PNG drawn over it. So
   *    the ring is art and the field stays `BACKDROP`. See `game/ui/FramePanel.ts`.
   *
   * 2. **It is drawn at the SCREEN's size, not the texture's 320×320.** `tools/ui-frames/SPEC.md`
   *    §4.5 wants the card at its native width with a list pane beside it — and that layout needs
   *    `DEX_ART_BOX` moved to (16, 40) and `renderDexEntry`'s 36-character "individuals in region N
   *    · all forms" line rewrapped for a 28-character column. Both live in `game/survey-view.ts`,
   *    which this change may not touch, and cutting the card to 320 without them would run that line
   *    off the card's right edge onto the field — which is what §4.5 records the first cut doing.
   *    The ring itself is size-independent (the strips beyond the 8px corner bracket are
   *    translation-invariant, verified in `tests/unit/ui-frame-panel.test.ts`), so this is the same
   *    edge, drawn around the whole screen, until the two-pane layout can be built.
   */
  private drawCardFrame(width: number, height: number): void {
    const ring = drawFrameRingIn(this, UI_FRAME_ASSET_ID.dexCard, { x: 0, y: 0, width, height });
    // Into `layer`, so `removeAll(true)` takes the ring with everything else on the next entry —
    // otherwise a piece per redraw stacks up for as long as the player holds ←/→.
    for (const piece of ring ?? []) this.layer.add(piece);
  }

  private text(x: number, y: number, value: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, { fontFamily: FONT, fontSize: `${BODY_PX}px`, color })
      .setOrigin(0, 0);
  }
}
