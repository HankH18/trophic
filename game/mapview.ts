/**
 * game/mapview.ts — the painted map on screen, and the honest stand-in when there is no painting.
 *
 * build-doc §4 runtime narrative, step 2, verbatim: "Overworld renders the node's painted map image,
 * plus its year variant if `year > 1` and the variant passed overlay-diff. Movement queries the
 * collision mask grid (§7.6). Season tint shader applies from `clock.season`."
 *
 * Three rules this file exists to keep:
 *
 * **G1 — no tilesets.** The map is ONE image. There is no slicing, no tilemap, no atlas of terrain.
 * `Phaser.GameObjects.Image`, one draw call, `setDisplaySize` to the 2048² world.
 *
 * **Hard Req 6 — season is a runtime tint, year is art.** The tint is `game/season-tint.ts`, applied
 * over whatever texture is on screen; nothing here ever loads a "winter map", and no code path
 * could, because season never reaches a texture key. Year variation is the opposite: it swaps the
 * texture, and only to a variant the node JSON lists — which per build-doc §8.2 means only to one
 * that passed overlay-diff (G4). `core/lifecycle.ts` `mapAssetForYear` makes that choice; this file
 * renders its answer.
 *
 * **Placeholders must look like placeholders, and there is exactly one of them.** Whether a node
 * draws its painting or a stand-in is decided PER ASSET, not once for the project: `textureFor`
 * returns the real texture when `assets/final/` holds that node's map and the labelled stand-in when
 * it does not. The two states coexist, and the mix shifts every time the art lane ships — so never
 * record here which nodes are which, or how many are painted. `game/placeholder.ts`'s build-time
 * census is the only answer that stays current. The stand-in is always the ONE shared helper, whose
 * flat colour + hatch + printed asset id is the same everywhere in the game. No unrelated trial image
 * is ever stretched to stand in for a map: `textureFor` returns real art at its own key or a
 * placeholder, and only the placeholder is drawn to a requested size.
 *
 * WHY THIS FILE OWNS SO LITTLE OF THAT. The placeholder helper and the season-tint reading are two
 * other lanes' modules. This file used to carry a private copy of each — which is how a game ends up
 * with two placeholder styles and two winters. Both are now delegated; what is left here is the part
 * that is genuinely the map view's: which texture a node shows at a given year, how the mask's pixels
 * are read, and the collision overlay draw.
 *
 * This is the only lane-C2 module that imports Phaser (with game/scenes/OverworldScene.ts).
 * game/collision.ts, game/movement.ts and game/encounters.ts stay engine-free so they can be tested
 * headlessly and reused by the collision editor.
 */

import Phaser from "phaser";
import { mapAssetForYear } from "../core/lifecycle";
import type { Balance, CollisionGrid, NodeFile, Season } from "../core/types";
import { debugOverlayRects, worldCellPx, worldSizePx, type MaskPixels } from "./collision";
import { assetId, hasRealAsset, realAssetUrl, textureFor } from "./placeholder";
// Every colour this file paints resolves through `data/palette.json` — see `drawInteriorFootprint`.
import { roleColor } from "./ui/Palette";
import { applySeasonTint, seasonTint, type SeasonTint } from "./season-tint";

/* ────────────────────────────────────────────────────────────────────────────
 * Texture keys
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The map's texture key at this year.
 *
 * Keyed on the ASSET PATH, not on `${node}:${year}` — because the year's only job is to choose which
 * path (`mapAssetForYear`), and two years that resolve to the same painting must share one texture
 * rather than loading it twice under different names. `game/placeholder.ts` `assetId` turns
 * `assets/final/maps/r1.png` into `maps/r1`, which is the id the whole game addresses art by.
 */
export function mapTextureKey(mapPath: string): string {
  return assetId(mapPath);
}

/** ONE key, no year (Hard Req 5): one mask serves all six years, so a per-year mask is unaddressable. */
export function maskTextureKey(maskPath: string): string {
  return assetId(maskPath);
}

export interface NodeArtKeys {
  mapKey: string;
  maskKey: string;
  /** The repo path the map texture was asked for — printed when it turns out to be missing. */
  mapPath: string;
  maskPath: string;
}

/**
 * Which textures this node needs at this year. `mapAssetForYear` (core/lifecycle.ts) picks the year
 * variant, falling back to the nearest listed one and finally to the base.
 *
 * A node whose `yearVariants` is empty therefore renders its base map at every year, and that is
 * correct rather than a bug: build-doc §8.2 / G4 makes the node JSON the single gate — a variant
 * enters it once, and only once, it has passed the layout freeze in `tools/overlay-diff/`
 * (`overlayDiff` in diff.ts, driven by run.ts). An empty `yearVariants` means the freeze has not
 * passed for that node, never that the check is missing. This file renders exactly what the JSON
 * lists and never second-guesses it.
 *
 * How many nodes currently list a variant is a property of data/nodes/*.json and is not restated
 * here — a count in this comment would be a claim that expires the first time a variant passes.
 */
export function nodeArtKeys(node: NodeFile, year: number, balance: Balance): NodeArtKeys {
  const mapPath = mapAssetForYear(node, year, balance);
  return {
    mapKey: mapTextureKey(mapPath),
    maskKey: maskTextureKey(node.collisionMask),
    mapPath,
    maskPath: node.collisionMask,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Loading
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Queue this node's map and mask, if they exist at all.
 *
 * `hasRealAsset` is a BUILD-time census of `assets/final/` (game/placeholder.ts), so an unbuilt asset
 * is never requested and the console is not filled with 404s for art nobody has drawn yet. The
 * absence is then rendered — a labelled placeholder for the map, a synthesised grid for the mask —
 * rather than logged.
 */
export function queueNodeArt(scene: Phaser.Scene, keys: NodeArtKeys): void {
  for (const [key, path] of [
    [keys.mapKey, keys.mapPath],
    [keys.maskKey, keys.maskPath],
  ] as const) {
    if (scene.textures.exists(key)) continue;
    const url = realAssetUrl(path);
    if (url === null) continue;
    scene.load.image(key, url);
  }
}

/**
 * Queue and run the loader, resolving when it settles. Used for node transitions, which happen long
 * after `preload()`. Resolves immediately when there is nothing real to fetch — "the art is missing"
 * is a state the overworld renders, not an error it stops on.
 */
export function ensureNodeArt(scene: Phaser.Scene, keys: NodeArtKeys): Promise<void> {
  const wanted = [
    [keys.mapKey, keys.mapPath],
    [keys.maskKey, keys.maskPath],
  ] as const;
  const pending = wanted.filter(([key, path]) => !scene.textures.exists(key) && hasRealAsset(path));
  if (pending.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    queueNodeArt(scene, keys);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.start();
  });
}

/**
 * Decode a loaded mask texture to raw pixels for game/collision.ts, or null when there is no mask.
 *
 * The read happens ONCE per node at load time and produces a packed bitfield (build-doc §7.6); no
 * per-frame pixel read exists anywhere in the overworld.
 */
export function readMaskPixels(scene: Phaser.Scene, maskKey: string): MaskPixels | null {
  if (!scene.textures.exists(maskKey)) return null;
  const source = scene.textures.get(maskKey).getSourceImage();
  const width = Math.floor((source as { width?: number }).width ?? 0);
  const height = Math.floor((source as { height?: number }).height ?? 0);
  if (width <= 0 || height <= 0) return null;

  const scratchKey = `${maskKey}:scratch`;
  // GUARDED, not unconditional: `TextureManager.remove` on a key that was never added logs
  // `warning: No texture found matching key: …` to the console, once per mask read. The art lane is
  // the audience for this console, and a spurious warning on the one operation they are watching is
  // a warning they learn to ignore. The remove is still here for the failure path below, where a
  // previous read threw after creating the canvas.
  if (scene.textures.exists(scratchKey)) scene.textures.remove(scratchKey);
  const scratch = scene.textures.createCanvas(scratchKey, width, height);
  if (!scratch) return null;
  try {
    scratch.context.drawImage(source as CanvasImageSource, 0, 0);
    const image = scratch.context.getImageData(0, 0, width, height);
    return { width: image.width, height: image.height, data: image.data, channels: 4 };
  } catch {
    // A cross-origin or otherwise untainted-canvas failure is a missing mask as far as play is
    // concerned; the caller synthesises one and says so on screen.
    return null;
  } finally {
    if (scene.textures.exists(scratchKey)) scene.textures.remove(scratchKey);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The view
 * ──────────────────────────────────────────────────────────────────────────── */

export interface MapViewOptions {
  node: NodeFile;
  year: number;
  season: Season;
  balance: Balance;
}

export interface MapArtStatus {
  /** false ⇒ the drawn map is a placeholder, not painted art. */
  painted: boolean;
  /** The repo path we wanted. */
  path: string;
  /** One line for the HUD. */
  note: string;
}

function statusFor(scene: Phaser.Scene, keys: NodeArtKeys): MapArtStatus {
  const painted = hasRealAsset(keys.mapPath) && scene.textures.exists(keys.mapKey);
  return {
    painted,
    path: keys.mapPath,
    note: painted ? `map ${keys.mapPath}` : `PLACEHOLDER map — ${keys.mapPath} not built`,
  };
}

/**
 * The node's map as a single image (G1), sized to the world, tinted by season (Hard Req 6), swapped
 * by year (build-doc §4 step 2).
 */
export class MapView {
  readonly image: Phaser.GameObjects.Image;
  readonly status: MapArtStatus;
  readonly worldWidth: number;
  readonly worldHeight: number;
  /** The current season reading — the HUD prints it, and `provisional` says the hues are unbuilt. */
  tint: SeasonTint;

  private readonly scene: Phaser.Scene;
  private readonly balance: Balance;
  private season: Season;
  private year: number;

  constructor(scene: Phaser.Scene, opts: MapViewOptions) {
    this.scene = scene;
    this.balance = opts.balance;
    this.season = opts.season;
    this.year = opts.year;

    const world = worldSizePx(opts.balance);
    this.worldWidth = world.width;
    this.worldHeight = world.height;

    const keys = nodeArtKeys(opts.node, opts.year, opts.balance);
    this.status = statusFor(scene, keys);
    const textureKey = this.resolveTexture(keys, opts.node, opts.year);

    this.image = scene.add
      .image(0, 0, textureKey)
      .setOrigin(0, 0)
      .setDisplaySize(world.width, world.height)
      .setDepth(0);

    this.tint = seasonTint(this.balance, this.season, this.year);
    applySeasonTint(this.image, this.tint);
  }

  /**
   * Real art if it exists, the ONE shared placeholder otherwise. The placeholder is drawn at map
   * NATIVE resolution and displayed at world size, exactly as a painted map would be — so the
   * placeholder never has to be stretched from some other asset's dimensions.
   */
  private resolveTexture(keys: NodeArtKeys, node: NodeFile, year: number): string {
    const native = this.balance.map.mapNativePx;
    return textureFor(this.scene, keys.mapPath, native, native, {
      note: `${node.name} · ${node.biome} · year ${year}`,
    });
  }

  /** Hard Req 6 — season is a runtime multiply, never a different texture. */
  setSeason(season: Season): void {
    this.season = season;
    this.tint = seasonTint(this.balance, season, this.year);
    applySeasonTint(this.image, this.tint);
  }

  currentSeason(): Season {
    return this.season;
  }

  /**
   * Year turn (build-doc §7.5 step 6, "map year-variant swap if present"). Swaps the TEXTURE only —
   * the collision grid is untouched, because one mask serves all six years (Hard Req 5).
   */
  setYear(node: NodeFile, year: number): MapArtStatus {
    this.year = year;
    const keys = nodeArtKeys(node, year, this.balance);
    const next = statusFor(this.scene, keys);
    this.image.setTexture(this.resolveTexture(keys, node, year));
    this.image.setDisplaySize(this.worldWidth, this.worldHeight);
    this.tint = seasonTint(this.balance, this.season, this.year);
    applySeasonTint(this.image, this.tint);
    this.status.painted = next.painted;
    this.status.path = next.path;
    this.status.note = next.note;
    return next;
  }

  /**
   * Show or hide the painted map.
   *
   * An INTERIOR is a second view mode inside the same scene (`game/scenes/OverworldScene.ts`), not
   * a second scene: the player who steps onto a doorway keeps their movement, their collision query,
   * their HUD and their save, and only the picture under them changes. So the town's painting is
   * hidden rather than destroyed — it is the same node, the same `MapView`, and the player is coming
   * back out of that door in a moment.
   *
   * A method rather than reaching for `.image` at the call site, so the one thing a caller may do to
   * this object's Phaser image from outside is this.
   */
  setVisible(visible: boolean): void {
    this.image.setVisible(visible);
  }

  destroy(): void {
    this.image.destroy();
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Collision debug overlay — the Phaser half of game/collision.ts's geometry
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Draw the blocked cells. The RECTANGLES come from `debugOverlayRects` in game/collision.ts, so this
 * overlay and the runtime walkability query cannot disagree — and the collision editor, which is a
 * separate Vite target, draws the same shapes from the same function rather than a second
 * implementation that would let you paint a mask that is wrong in a way you cannot see.
 */
export function drawCollisionOverlay(
  graphics: Phaser.GameObjects.Graphics,
  grid: CollisionGrid,
  balance: Balance,
  colour = 0xff3b3b,
  alpha = 0.35,
): void {
  graphics.clear();
  graphics.fillStyle(colour, alpha);
  for (const rect of debugOverlayRects(grid, balance)) {
    graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}

/**
 * An interior's FOOTPRINT, drawn from its collision grid — the honest stand-in until a room is
 * painted.
 *
 * G1 IS NOT BENT HERE AND MUST NOT BE. This is not a tileset and there is no slicing: it is two
 * `fillRect` families on one Graphics object — the room's extent, then the solid cells — and the
 * solid cells come from `debugOverlayRects`, the SAME geometry `tileWalkable` answers from. So what
 * is drawn and what the player can walk through cannot disagree, which is the property
 * {@link drawCollisionOverlay} exists to keep and the reason this reuses its source rather than
 * walking the grid a second time.
 *
 * WHAT REPLACES IT. When the art lane paints a room it paints ONE image, exactly as a town map is
 * one image (this file's header), sized to `grid.cols × grid.rows` cells at
 * `map.collisionCellPx × map.mapRenderScale` world pixels each, with its top-left at world (0,0).
 * At that point this function stops being called for that room; nothing else about the interior
 * changes, because the geometry the player walks is the ASCII plan and not the picture.
 *
 * ══ THE TWO COLOURS COME OUT OF `data/palette.json`, AND NOT FROM A LITERAL ══
 *
 * `game/ui/Palette.ts`'s `panel` and `border` roles, resolved through `roleColor`. A hex typed here
 * would be a colour that stops existing: the palette was re-frozen at T-15 with all 32 hexes
 * changed and every id and its order byte-identical, and the owner is appending `c32`+ over the
 * coming hours — an id survives both, a literal survives neither. `tools/comfy/player-views.ts`
 * held 21 of them and wrote 420 off-palette pixels into a committed sprite before anyone noticed.
 *
 * THE ROLES ARE BORROWED DELIBERATELY, not for want of a better name. `panel` is defined there as
 * "the DARKEST plate ≥ 2 : 1 on void" — which is exactly what a footprint is, a flat surface
 * standing in for art on the black field (3.12 : 1) — and `border` is that plate's stroke, sitting
 * a measured 3.52 : 1 above it, clear of WCAG 1.4.11's 3 : 1 for a non-text graphical mark, which
 * is the threshold this project already applies to a mark on the field. Naming a second table of
 * ids here would duplicate a pick that `tests/unit/battle-view.test.ts` already recomputes from the
 * shipped palette on every change — and a duplicate is precisely what a re-freeze re-points
 * silently.
 */
export function drawInteriorFootprint(
  graphics: Phaser.GameObjects.Graphics,
  grid: CollisionGrid,
  balance: Balance,
  floorColour = roleColor("panel"),
  wallColour = roleColor("border"),
): void {
  graphics.clear();
  const cell = worldCellPx(grid, balance);
  graphics.fillStyle(floorColour, 1);
  graphics.fillRect(0, 0, grid.cols * cell, grid.rows * cell);
  graphics.fillStyle(wallColour, 1);
  for (const rect of debugOverlayRects(grid, balance)) {
    graphics.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The player's own texture keys
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The three views the pipeline paints the player in, and the three step phases of each.
 *
 * These are the SHAPE of the manifest's `player` class, not a second list of content: the nine rows
 * (`player-front`, `player-back`, `player-side`, and each of those `-step-left` / `-step-right`) are
 * derived in `tools/comfy/comfy-batch.ts` from `manifest._player` and are gate-locked, so this file
 * spells out the key grammar and `tests/gates/dex-path-contract.test.ts` asserts SET IDENTITY
 * between what {@link playerArtIds} produces and what the manifest carries. Either side moving turns
 * that gate red, which is the whole point — the literal this replaces answered to nothing.
 */
export const PLAYER_VIEWS = ["front", "back", "side"] as const;
export const PLAYER_STEPS = ["stand", "step-left", "step-right"] as const;

export type PlayerView = (typeof PLAYER_VIEWS)[number];
export type PlayerStep = (typeof PLAYER_STEPS)[number];

/** The manifest's `player` class writes into `assets/final/player/`, so every key sits under this. */
const PLAYER_ART_DIR = "player";
/** Every row id in that class is `player-…`; `assetId` strips the directory, never the prefix. */
const PLAYER_ROW_ID_PREFIX = "player-";

/**
 * The texture key for one player view and step.
 *
 * T-19, THIRD INSTANCE. This module asked for `"sprites/player"`. The pipeline can only ever produce
 * `assets/final/player/player-<view>[-<step>].png`, which `game/placeholder.ts::assetId` reduces to
 * `player/player-<view>[-<step>]`, and NO `sprites/` directory exists in the manifest in any class.
 * Measured intersection of the key this file asked for with the 9 committed `player` rows: ZERO. The
 * player would have gone on drawing a stand-in forever once the art landed, and nothing would have
 * said so — `textureFor` falls back silently and `assetId` is a pure string strip that accepts a
 * wrong key without complaint.
 *
 * Same defect and same resolution as `game/survey-view.ts::dexArtId` (dex plates) and
 * `game/ui/BattleHud.ts` (battle sprites): move the SCREEN to the manifest's shape, because the
 * manifest's path is derived from data and gate-locked while a hand-written literal here is not.
 */
export function playerArtId(view: PlayerView, step: PlayerStep = "stand"): string {
  const suffix = step === "stand" ? "" : `-${step}`;
  return `${PLAYER_ART_DIR}/${PLAYER_ROW_ID_PREFIX}${view}${suffix}`;
}

/** Every key this module can ask the loader for — the nine the manifest can produce, and no more. */
export function playerArtIds(): string[] {
  return PLAYER_VIEWS.flatMap((view) => PLAYER_STEPS.map((step) => playerArtId(view, step)));
}

/**
 * A 32×48 stand-in for the player (build-doc §7.6's logical sprite size), through the same shared
 * helper. `textureFor` decides which it is: the moment post-processing writes
 * `assets/final/player/player-<view>[-<step>].png`, this returns that real texture instead, with no
 * change here; until then it draws the honest labelled rectangle. Which of the nine keys are real at
 * any given moment is `game/placeholder.ts`'s census to answer and is deliberately not restated in
 * this comment. Note that raw output — `assets/raw/player/`, including the views `player-views.ts
 * derive` builds — is UPSTREAM of that census and never satisfies it on its own; only a file under
 * `assets/final/` counts as real.
 *
 * `view`/`step` default to the standing front because that is what `game/scenes/OverworldScene.ts`
 * asks for today — it draws one static image and has no walk cycle. The other eight keys are
 * reachable through this function rather than merely declared, so when build-doc §9.6's walk cycle
 * lands the caller changes and the key grammar does not.
 */
export function playerPlaceholderKey(
  scene: Phaser.Scene,
  balance: Balance,
  view: PlayerView = "front",
  step: PlayerStep = "stand",
): string {
  return textureFor(
    scene,
    playerArtId(view, step),
    balance.map.playerSpriteW,
    balance.map.playerSpriteH,
    { note: "not post-processed into assets/final/" },
  );
}
