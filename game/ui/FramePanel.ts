/**
 * game/ui/FramePanel.ts — THE eight-piece `ui-frame` ring, in one place.
 *
 * `tools/comfy/manifest.json` class `ui-frame` ships six finished nine-slice PNGs under
 * `assets/final/ui-frame/`. `game/scenes/DialogueScene.ts` wired the first of them and, because
 * lane scope put a shared UI module out of reach at the time, it hand-rolled the slicer as two
 * private methods. This file is that slicer, extracted, so the menu, the dex and the combatant card
 * do not each grow a fourth copy of it — one drawer, one set of piece names, one fallback.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. WHY NOT `this.add.nineslice`
 * ─────────────────────────────────────────────────────────────────────────────
 * Phaser 3.90 HAS `GameObjects.NineSlice`, and ships it with `NineSliceWebGLRenderer.js` and no
 * canvas sibling. `game/boot.ts` starts the game with `P.AUTO`, which falls back to Canvas wherever
 * WebGL is unavailable, and there a nine-slice renders as NOTHING AT ALL: not a crash, not a
 * warning, just a panel with no edge. A nine-slice is eight images and a rule about which of them
 * stretch, so it is drawn here instead — corners at natural size, edges stretched along their own
 * axis only, no centre. Renderer-independent, and it cannot squash a corner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  2. THE RING IS ALL THERE IS. THE INTERIOR IS NEVER PAINTED, AND THAT IS MEASURED.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every stretching `ui-frame` PNG is a 2px `#040308` outer edge over a 2px `#74564e` inner edge
 * around a flat `#faf7eb` plate. **`#faf7eb` is the body-ink colour of every screen that would use
 * one:**
 *
 *   · `game/menu-model.ts`  `UI.text`        = `#faf7eb`  (MenuScene, TitleScene)
 *   · `game/survey-view.ts` `SCREEN_HEX.ink` = `#faf7eb`  (DexScene, SurveyScene, SummaryScene)
 *   · `game/ui/Palette.ts`  `roleHex("text")`= `#faf7eb`  (the battle cards and menu)
 *
 * So adopting the frame's plate as a panel body — which is what the manifest's own
 * `_postprocessNote` intends ("the 'empty interior' is the panel body, not a hole") — draws every
 * authored line in the game at 1 : 1 against its own background. Invisible, and
 * `tests/gates/ui-contrast-contract.test.ts` STAYS GREEN while it happens, because that gate
 * measures a role against a SWATCH and has no way to know a PNG is painted underneath.
 *
 * Reading the plate as the body is a palette-role change (build-doc §8.4) and is not this file's
 * call to make. Until it is made, the ring is art and the field stays whatever the screen already
 * paints — which keeps every ratio that gate measures true of the pixels.
 * {@link drawFrameRing} therefore has no way to ask for a centre piece.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  3. THE SLICE IS THE CHROME, AND IT IS 4 — NOT `SPEC.md`'s 10
 * ─────────────────────────────────────────────────────────────────────────────
 * `tools/ui-frames/SPEC.md` §3 says `SLICE_PX = 10`, "to cover the 4px of chrome plus the 6px corner
 * bracket". MEASURED off the shipped PNGs, both halves of that are off, and taking the number would
 * paint the plate colour §2 exists to keep off the screen:
 *
 *   · The bracket runs **8px**, not 6 — on `ui-menu-panel` rows 2–3 are `#040308` out to x = 7 and
 *     `#74564e` from x = 8. So a slice of 10 is 2px of margin over a boundary at 8, not 4.
 *   · A corner piece cut at any slice > `FRAME_CHROME_PX` contains PLATE. At 10 each corner carries
 *     a 6×6 block of `#faf7eb`, at 8 a 4×4 block — painted into the four corners of the panel's
 *     interior, on top of whatever the screen drew there, in the one colour §2 forbids.
 *
 * At the chrome width the corner is chrome and nothing else, and the edge strips are 4px deep from
 * the edge, which is also chrome and nothing else. The cost is that the strips are then NOT
 * translation-invariant across the bracket (x 4–7 of a top strip is bracket, x 8+ is inner ring), so
 * a stretched edge resamples the bracket's 4px by the panel's scale factor: the corner tab reads a
 * little shorter on a panel drawn narrower than its texture. That is a 4px mark changing length,
 * against a 6×6 block of invisible-text colour in every corner. The mark loses.
 *
 * `tests/unit/ui-frame-panel.test.ts` re-derives the number from the pixels of all six shipped PNGs
 * and asserts that no piece cut at it contains the plate colour, so this is bound to the art rather
 * than to this paragraph.
 *
 * ENGINE: `import type PhaserNS` only, and every engine surface below is described STRUCTURALLY, so
 * this file is importable under vitest's node environment and the drawer can be driven by a
 * recorder. `import "phaser"` throws `window is not defined` there, which is why `MenuScene` and
 * `DexScene` need `vi.mock("phaser")` and this file does not.
 */

import type PhaserNS from "phaser";

/* ────────────────────────────────────────────────────────────────────────────
 * The rows this file can draw
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `tools/comfy/manifest.json` `classes["ui-frame"].finalDir` minus `assets/final/` — which is what
 * `game/placeholder.ts::assetId` turns a `finalFile` into, and therefore the texture key's prefix.
 */
export const UI_FRAME_DIR = "ui-frame";

/**
 * The six `ui-frame` rows, by the id the manifest gives them.
 *
 * Written out rather than read from the manifest because `tools/comfy/manifest.json` is a BUILD
 * input — the game does not ship it — and because a key that is spelled in shipping code is a key
 * `tests/gates/asset-reachability.test.ts` can check against the manifest from the outside.
 * `tests/unit/ui-frame-panel.test.ts` asserts this table is exactly the manifest's `ui-frame` rows,
 * so a row added, renamed or removed by the pipeline reddens here instead of drifting.
 */
export const UI_FRAME_ASSET_ID = {
  /** 480×96 — the dialogue box. Wired by `game/scenes/DialogueScene.ts`. */
  dialogueBox: `${UI_FRAME_DIR}/ui-dialogue-box`,
  /** 160×320 — a menu plate. Wired by `game/scenes/MenuScene.ts`. */
  menuPanel: `${UI_FRAME_DIR}/ui-menu-panel`,
  /** 240×64 — the combatant card. Wired by `game/ui/BattleHud.ts`. */
  battleHud: `${UI_FRAME_DIR}/ui-battle-hud-frame`,
  /** 480×320 — the ecology ledger. Wired by `game/scenes/SurveyScene.ts`. */
  ledgerPanel: `${UI_FRAME_DIR}/ui-ledger-panel`,
  /** 320×320 — the dex card. Wired by `game/scenes/DexScene.ts`. */
  dexCard: `${UI_FRAME_DIR}/ui-dex-card-frame`,
  /** 240×160 — a world prop, not a panel. UNWIRED: nothing draws the `sign-card` prop's face. */
  signCard: `${UI_FRAME_DIR}/ui-sign-card-frame`,
} as const;

/**
 * Every `ui-frame` texture key this file knows how to draw.
 *
 * ⚠ THIS IS THE DECLARED SET, NOT THE CONSUMED SET, and it must never be handed to
 * `tests/gates/asset-reachability.test.ts` as a key builder. `signCard` still has no call site —
 * and a census built from this list would report it as asked for on the strength of the other five
 * being drawn. That is precisely the "the class exists, therefore the row is reachable" reasoning
 * that gate was written to refuse. A builder there must name the ids its call sites actually pass,
 * one per wired screen.
 *
 * ⚠ AND `signCard` IS NOT A PANEL, so it is not merely "the next one to wire". `tools/ui-frames/
 * SPEC.md` §4.6 paints it from the palette's WOOD band with a 7px bevel — 3px lit along the top and
 * left, 3px shadowed along the bottom and right, over a 2px keyline base edge on the bottom only —
 * so its edge is `#040308 · #ca9164×2 · #aa7241×3 · #040308` and not the symmetric two-ring idiom
 * the other five share. {@link drawFrameRing} at {@link FRAME_CHROME_PX} would cut straight through
 * that bevel, and the same SPEC row calls the frame "fixed 1:1" and places it "wherever the prop
 * is". `tests/unit/ui-frame-panel.test.ts` holds it out of the panel assertions for this reason.
 */
export const UI_FRAME_ASSET_IDS: readonly string[] = Object.values(UI_FRAME_ASSET_ID);

/**
 * The ring's thickness in the source art, and therefore the slice. See the header, §3: it is the
 * CHROME, measured, and not `SPEC.md`'s 10 — a wider cut drags the plate colour into the corners.
 */
export const FRAME_CHROME_PX = 4;

/** The eight pieces of the ring, in draw order. There is no ninth: the centre is never drawn. */
export const FRAME_PIECES = [
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
 * The engine, described structurally
 * ──────────────────────────────────────────────────────────────────────────── */

/** An axis-aligned panel, top-left anchored — the same shape `game/ui/BattleLayout.ts` uses. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An `add.image` result, as much of it as a ring piece uses. */
export interface FrameImageLike {
  setOrigin: (x: number, y: number) => unknown;
  setDisplaySize: (width: number, height: number) => unknown;
  destroy: () => void;
}

export interface FrameTextureLike {
  has?: (frame: string) => boolean;
  add?: (frame: string, source: number, x: number, y: number, width: number, height: number) => unknown;
  get?: (frame?: string) => { width?: number; height?: number } | undefined;
}

export interface FrameTextureManagerLike {
  exists?: (key: string) => boolean;
  get?: (key: string) => FrameTextureLike | undefined;
}

/**
 * The slice of a scene this file touches.
 *
 * Absent members are a SUPPORTED answer, not a crash: {@link frameTextureOf} returns null and
 * {@link drawFrameRing} returns null with it, which is the caller's signal to draw whatever chrome
 * it drew before the art existed. A panel with a hairline is a panel; a panel that threw is a
 * black screen.
 */
export interface FrameSceneLike {
  add: {
    image: (x: number, y: number, key: string, frame?: string) => FrameImageLike;
  };
  textures?: FrameTextureManagerLike;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The drawer
 * ──────────────────────────────────────────────────────────────────────────── */

/** The frame texture and its source size, or null when it has not loaded. */
export function frameTextureOf(
  scene: FrameSceneLike,
  assetId: string,
  slice: number = FRAME_CHROME_PX,
): { texture: FrameTextureLike; width: number; height: number } | null {
  const manager = scene.textures;
  if (typeof manager?.exists !== "function" || typeof manager.get !== "function") return null;
  if (!manager.exists(assetId)) return null;
  const texture = manager.get(assetId);
  if (!texture || typeof texture.add !== "function") return null;
  const base = texture.get?.();
  const width = base?.width ?? 0;
  const height = base?.height ?? 0;
  // A "frame" narrower than two corners is not a frame. Refusing it here is what keeps a mis-sized
  // or half-loaded texture from drawing eight overlapping smears over the panel.
  if (width <= slice * 2 || height <= slice * 2) return null;
  return { texture, width, height };
}

/**
 * Draw the eight-piece ring of `assetId` around `rect`, and hand back the pieces — or null when
 * there is no frame texture to slice, which is the caller's signal to fall back.
 *
 * The pieces are returned rather than tracked here because who owns them differs: `MenuScene` keeps
 * them for the life of the scene, `CombatantPanel` re-parents them into its container, and
 * `DexScene` destroys them on every redraw. A drawer that kept its own list would be a second
 * lifetime for objects the caller already has to destroy.
 *
 * Corners keep their natural size; the top and bottom edges stretch on X only and the sides on Y
 * only. That asymmetry is the whole point of slicing, and it is why this is not one image scaled to
 * the panel: at 480×96 into a 464×68 box a single stretched image thins the border to 3.87px across
 * and 2.83px down — a frame whose weight changes with the shape of the panel it is on.
 */
export function drawFrameRing(
  scene: FrameSceneLike,
  assetId: string,
  rect: FrameRect,
  slice: number = FRAME_CHROME_PX,
): FrameImageLike[] | null {
  const source = frameTextureOf(scene, assetId, slice);
  if (source === null) return null;
  const { texture, width: srcW, height: srcH } = source;
  const s = slice;
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

  const pieces: FrameImageLike[] = [];
  for (const piece of FRAME_PIECES) {
    const cutX = srcAt[piece.col] ?? 0;
    const cutY = srcTop[piece.row] ?? 0;
    const cutW = srcSpan[piece.col] ?? s;
    const cutH = srcDown[piece.row] ?? s;
    if (typeof texture.has === "function" && !texture.has(piece.name)) {
      texture.add?.(piece.name, 0, cutX, cutY, cutW, cutH);
    }
    const image = scene.add.image(
      dstAt[piece.col] ?? rect.x,
      dstTop[piece.row] ?? rect.y,
      assetId,
      piece.name,
    );
    image.setOrigin(0, 0);
    image.setDisplaySize(dstSpan[piece.col] ?? s, dstDown[piece.row] ?? s);
    pieces.push(image);
  }
  return pieces;
}

/**
 * `drawFrameRing` for a caller that holds a real `Phaser.Scene` and wants real game objects back.
 *
 * The structural {@link FrameSceneLike} is what makes this file testable, but a scene that has to
 * put the pieces into a `Container` needs `Phaser.GameObjects.Image`, not the four methods this file
 * uses. Both views describe the same objects; the cast is here, once, rather than at each call site.
 */
export function drawFrameRingIn(
  scene: PhaserNS.Scene,
  assetId: string,
  rect: FrameRect,
  slice: number = FRAME_CHROME_PX,
): PhaserNS.GameObjects.Image[] | null {
  const pieces = drawFrameRing(scene as unknown as FrameSceneLike, assetId, rect, slice);
  return pieces === null ? null : (pieces as unknown as PhaserNS.GameObjects.Image[]);
}
