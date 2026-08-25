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
 * **Placeholders must look like placeholders, and there is exactly one of them.** Real generated art
 * exists only for the B0 player sweep and five style trials; `assets/final/` is empty, so every map
 * in the game today draws through `game/placeholder.ts` — the ONE shared helper, whose flat colour +
 * hatch + printed asset id is the same everywhere in the game. No unrelated trial image is ever
 * stretched to stand in for a map: `textureFor` returns real art at its own key or a placeholder,
 * and only the placeholder is drawn to a requested size.
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
import { debugOverlayRects, worldSizePx, type MaskPixels } from "./collision";
import { assetId, hasRealAsset, realAssetUrl, textureFor } from "./placeholder";
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
 * variant, falling back to the nearest listed one and finally to the base — and today every node
 * ships `yearVariants: {}`, so it always returns the base map. That is correct, not a bug: a variant
 * only enters the node JSON once it has passed overlay-diff (build-doc §8.2 / G4), and
 * `tools/overlay-diff/` is empty.
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
  scene.textures.remove(scratchKey);
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
    scene.textures.remove(scratchKey);
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
 * A 32×48 stand-in for the player (build-doc §7.6's logical sprite size), through the same shared
 * helper. The B0 sweep produced real player art (`assets/raw/b0/`), but it is not post-processed
 * into `assets/final/` yet, so this draws the honest labelled rectangle until it is.
 */
export function playerPlaceholderKey(scene: Phaser.Scene, balance: Balance): string {
  return textureFor(scene, "sprites/player", balance.map.playerSpriteW, balance.map.playerSpriteH, {
    note: "B0 sweep not post-processed",
  });
}
