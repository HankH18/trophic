/**
 * tests/unit/ui-frame-panel.test.ts — THE `ui-frame` RINGS, DRAWN.
 *
 * `tests/gates/asset-reachability.test.ts` landed with five `ui-frame` rows reported as generated,
 * committed, and asked for by nothing: six finished nine-slice PNGs on disk while the scenes drew
 * coloured rectangles. This file is the binding half of closing three of them — it asserts that the
 * MENU, the DEX CARD and the COMBATANT CARD really put those textures on the screen, and that they
 * put them there in the one arrangement that does not destroy the text drawn over them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE HAZARD THIS FILE EXISTS FOR, AND WHY A CONTRAST GATE CANNOT SEE IT
 * ─────────────────────────────────────────────────────────────────────────────
 * Every `ui-frame` PNG's interior is `#faf7eb`. So is `UI.text` (the menus), so is
 * `SCREEN_HEX.ink` (the dex, the survey, the summary), and so is `roleHex("text")` (the battle
 * cards). Painting the art's interior as the panel body — which is what the manifest's
 * `_postprocessNote` intends — draws every authored line in the game at 1 : 1 against its own
 * background, and `tests/gates/ui-contrast-contract.test.ts` STAYS GREEN through it, because that
 * gate measures a role against a SWATCH and has no way to know a PNG is painted underneath.
 *
 * Both halves of that are MEASURED here, off the shipped pixels and the shipped palette tables, and
 * then the drawers are held to painting no interior at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE STUB IS A RECORDER. IT IS NOT A PROXY, AND THAT IS THE POINT.
 * ─────────────────────────────────────────────────────────────────────────────
 * `tests/unit/dex-summary-scene.test.ts` hands `add.image` a `Proxy` that answers any method with a
 * chainable no-op. That shape RECORDS NOTHING: an assertion about a call it swallows is not a weak
 * test, it is a test that cannot fail — which is exactly why `tests/unit/art-slot-fit.test.ts` had
 * to be written after a 1024² plate shipped green into a 128² slot.
 *
 * So {@link StubImage} is a CLASS. `setDisplaySize` really sets `displayWidth`/`displayHeight`,
 * `setOrigin` really records the origin, the frame name really comes back, and any method a drawer
 * calls that the class does not define is a `TypeError` rather than a silent success. §7 sabotages
 * the recorder itself and asserts which of this file's tests go red when it does — because a
 * recorder that quietly swallows a call takes every assertion that reads it down with it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/* ════════════════════════════════════════════════════════════════════════════
 * The stub engine — hoisted above the imports by vitest
 *
 * `MenuScene` and `DexScene` both `import Phaser from "phaser"` as a VALUE and extend
 * `Phaser.Scene`; Phaser cannot be imported under vitest's node environment at all
 * (`ReferenceError: window is not defined`, from phaser/src/device/OS.js). Same mock, same reason,
 * as tests/unit/dex-summary-scene.test.ts — but with recording image objects, which that file's
 * chainable proxy is not.
 * ════════════════════════════════════════════════════════════════════════════ */

vi.mock("phaser", async () => {
  const balance = (await import("../../data/balance.json")).default;

  /** A texture the loader is pretending to have brought in, plus any frames sliced out of it. */
  interface StubTexture {
    width: number;
    height: number;
    frames: Map<string, { x: number; y: number; width: number; height: number }>;
  }

  /**
   * An `add.image` result that REMEMBERS.
   *
   * `width`/`height` are the natural size of the frame that was cut (or of the texture, when no
   * frame was named) and `displayWidth`/`displayHeight` are what `setDisplaySize` left behind.
   * Those four numbers are the entire evidence for "the corners were not stretched", so they are
   * stored rather than swallowed.
   */
  class StubImage {
    kind = "image" as const;
    destroyed = false;
    originX = 0.5;
    originY = 0.5;
    displayWidth: number;
    displayHeight: number;
    constructor(
      public x: number,
      public y: number,
      readonly key: string,
      readonly frame: string | undefined,
      readonly width: number,
      readonly height: number,
    ) {
      this.displayWidth = width;
      this.displayHeight = height;
    }
    setOrigin(x: number, y: number = x): this {
      this.originX = x;
      this.originY = y;
      return this;
    }
    setDisplaySize(width: number, height: number): this {
      this.displayWidth = width;
      this.displayHeight = height;
      return this;
    }
    setPosition(x: number, y: number): this {
      this.x = x;
      this.y = y;
      return this;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }

  class StubText {
    kind = "text" as const;
    destroyed = false;
    readonly height = 8;
    readonly handlers = new Map<string, Array<() => void>>();
    constructor(
      readonly x: number,
      readonly y: number,
      public text: string,
      public color: string,
    ) {}
    setOrigin(): this {
      return this;
    }
    setResolution(): this {
      return this;
    }
    setWordWrapWidth(): this {
      return this;
    }
    setInteractive(): this {
      return this;
    }
    on(event: string, fn: () => void): this {
      const bound = this.handlers.get(event) ?? [];
      bound.push(fn);
      this.handlers.set(event, bound);
      return this;
    }
    setText(value: string): this {
      this.text = value;
      return this;
    }
    setColor(color: string): this {
      this.color = color;
      return this;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }

  class StubRect {
    kind = "rect" as const;
    destroyed = false;
    strokeWidth = 0;
    strokeColor = -1;
    constructor(
      public x: number,
      public y: number,
      public w: number,
      public h: number,
      public fill: number,
    ) {}
    setOrigin(): this {
      return this;
    }
    setStrokeStyle(width: number, color: number): this {
      this.strokeWidth = width;
      this.strokeColor = color;
      return this;
    }
    setSize(): this {
      return this;
    }
    setFillStyle(): this {
      return this;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }

  class StubGraphics {
    kind = "graphics" as const;
    destroyed = false;
    fillStyle(): this {
      return this;
    }
    fillRect(): this {
      return this;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }

  class StubContainer {
    kind = "container" as const;
    destroyed = false;
    readonly children: unknown[] = [];
    constructor(_x = 0, _y = 0, children: unknown[] = []) {
      this.children.push(...children);
    }
    add(child: unknown): this {
      this.children.push(child);
      return this;
    }
    removeAll(destroyChild = false): this {
      if (destroyChild) {
        for (const child of this.children) (child as { destroy?: () => void }).destroy?.();
      }
      this.children.length = 0;
      return this;
    }
    destroy(): void {
      this.destroyed = true;
      for (const child of this.children) (child as { destroy?: () => void }).destroy?.();
    }
  }

  class StubScene {
    /** Every object the scene ever created, in creation order. The whole recording. */
    readonly stubObjects: unknown[] = [];
    readonly stubTextures = new Map<string, StubTexture>();
    readonly stubKeys = new Map<string, Array<() => void>>();
    readonly stubStarted: Array<{ key: string; data: unknown }> = [];

    readonly add = {
      image: (x: number, y: number, key: string, frame?: string): StubImage => {
        const texture = this.stubTextures.get(key);
        const cut = frame === undefined ? undefined : texture?.frames.get(frame);
        const image = new StubImage(
          x,
          y,
          key,
          frame,
          cut?.width ?? texture?.width ?? 0,
          cut?.height ?? texture?.height ?? 0,
        );
        this.stubObjects.push(image);
        return image;
      },
      text: (x: number, y: number, value: string, style?: { color?: string }): StubText => {
        const obj = new StubText(x, y, value, style?.color ?? "");
        this.stubObjects.push(obj);
        return obj;
      },
      rectangle: (x: number, y: number, w: number, h: number, fill: number): StubRect => {
        const obj = new StubRect(x, y, w, h, fill);
        this.stubObjects.push(obj);
        return obj;
      },
      graphics: (): StubGraphics => {
        const obj = new StubGraphics();
        this.stubObjects.push(obj);
        return obj;
      },
      container: (x = 0, y = 0, children: unknown[] = []): StubContainer => {
        const obj = new StubContainer(x, y, children);
        this.stubObjects.push(obj);
        return obj;
      },
    };

    /**
     * `exists` answers TRUE for every key, so `game/placeholder.ts::textureFor` short-circuits to
     * the id instead of building a canvas stand-in — this file is about the frame, not the art slot
     * beside it. `get` answers only for a SEEDED texture, which is what lets a test run the
     * no-frame-art path without also blinding the placeholder helper.
     */
    readonly textures = {
      exists: (_key: string): boolean => true,
      get: (key: string): unknown => {
        const texture = this.stubTextures.get(key);
        if (!texture) return undefined;
        return {
          has: (frame: string): boolean => texture.frames.has(frame),
          add: (frame: string, _source: number, x: number, y: number, w: number, h: number): unknown => {
            texture.frames.set(frame, { x, y, width: w, height: h });
            return {};
          },
          get: (frame?: string): unknown =>
            frame === undefined ? { width: texture.width, height: texture.height } : texture.frames.get(frame),
        };
      },
    };

    readonly input = {
      keyboard: {
        on: (event: string, fn: () => void): void => {
          const bound = this.stubKeys.get(event) ?? [];
          bound.push(fn);
          this.stubKeys.set(event, bound);
        },
        off: (): void => undefined,
      },
    };
    readonly events = { on: (): void => undefined, once: (): void => undefined };
    readonly cameras = { main: { setBackgroundColor: (): void => undefined } };
    readonly scale = { width: balance.map.virtualWidth, height: balance.map.virtualHeight };
    readonly tweens = { killTweensOf: (): void => undefined };
    readonly scene = {
      manager: { keys: {} as Record<string, unknown> },
      start: (key: string, data?: unknown): void => {
        this.stubStarted.push({ key, data });
      },
      stop: (): void => undefined,
      launch: (): void => undefined,
    };
    constructor(_config?: unknown) {}
  }

  return {
    default: {
      Scene: StubScene,
      Scenes: { Events: { SHUTDOWN: "shutdown", WAKE: "wake", RESUME: "resume" } },
    },
  };
});

/* eslint-disable import/first -- everything below must follow the mock above. */
import Phaser from "phaser";

import { DIALOGUE } from "../../core/dialogue-schema";
import { validateContent } from "../../core/schemas";
import type { Content, SpeciesLine } from "../../core/types";
import { SCENE_KEYS, installStorage, resetContentCache, startNewGame } from "../../game/boot";
import { buildDexEntries } from "../../game/survey-view";
import { UI } from "../../game/menu-model";
import { registry } from "../../game/registry";
import { SCREEN_HEX } from "../../game/survey-view";
import { assetId } from "../../game/placeholder";
import {
  FRAME_CHROME_PX,
  FRAME_PIECES,
  UI_FRAME_ASSET_ID,
  UI_FRAME_ASSET_IDS,
  UI_FRAME_DIR,
  drawFrameRing,
  frameTextureOf,
  type FrameImageLike,
  type FrameRect,
  type FrameSceneLike,
} from "../../game/ui/FramePanel";
import { CombatantPanel, DEFAULT_CARD_STYLE } from "../../game/ui/BattleHud";
import { roleHex } from "../../game/ui/Palette";
import { unlockedSignChainsOf } from "../../game/ui/SignChains";
import { DexScene, type DexSceneData } from "../../game/scenes/DexScene";
import { MenuScene, menuPlateRect } from "../../game/scenes/MenuScene";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const content: Content = validateContent();
const balance = content.balance;

/* ════════════════════════════════════════════════════════════════════════════
 * The art, read from the files the pipeline shipped
 * ════════════════════════════════════════════════════════════════════════════ */

interface ManifestRow {
  id: string;
  class: string;
  finalFile: string;
}

const MANIFEST = JSON.parse(readFileSync(resolve(REPO_ROOT, "tools/comfy/manifest.json"), "utf8")) as {
  rows: ManifestRow[];
  classes: Record<string, { finalDir: string }>;
};

/** Every `ui-frame` row's texture key, DERIVED from the manifest by the shipped id rule. */
const MANIFEST_FRAME_KEYS: string[] = MANIFEST.rows
  .filter((row) => row.class === "ui-frame")
  .map((row) => assetId(row.finalFile))
  .sort();

interface Pixels {
  width: number;
  height: number;
  /** `#rrggbb` at (x, y). */
  at: (x: number, y: number) => string;
}

const PIXELS = new Map<string, Pixels>();

beforeAll(async () => {
  for (const key of UI_FRAME_ASSET_IDS) {
    const { data, info } = await sharp(resolve(REPO_ROOT, `assets/final/${key}.png`))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    PIXELS.set(key, {
      width,
      height,
      at: (x, y) => {
        const o = (y * width + x) * channels;
        const hex = (v: number): string => (data[o + v] as number).toString(16).padStart(2, "0");
        return `#${hex(0)}${hex(1)}${hex(2)}`;
      },
    });
  }
});

const pixelsOf = (key: string): Pixels => {
  const px = PIXELS.get(key);
  if (!px) throw new Error(`no pixels read for "${key}" — beforeAll did not run`);
  return px;
};

/**
 * The frame's PLATE: the colour at the middle of the picture, which is what a nine-slice centre
 * would paint. Read, never written down.
 */
const plateOf = (key: string): string =>
  pixelsOf(key).at(Math.floor(pixelsOf(key).width / 2), Math.floor(pixelsOf(key).height / 2));

/**
 * The two-ring idiom, re-derived off the pixels: the run of the OUTER colour from the edge, plus the
 * run of the colour immediately inside it.
 *
 * `tools/ui-frames/SPEC.md` §2 states the border as "a flat fill, a 2px inner ring, a 2px outer
 * ring", and this counts exactly those two runs — so `FRAME_CHROME_PX` is measured from the art
 * rather than checked against a constant beside the one in the code, and a regenerated frame with a
 * different edge reddens here instead of the panels quietly drawing a smeared corner.
 *
 * ⚠ WALKING TO "THE INTERIOR COLOUR" DOES NOT WORK, and it is worth saying why: `ui-ledger-panel`'s
 * centre pixel is its RECESS BAND (`#c8bca5`), not its plate, so a walk that stops at the centre
 * colour reports its chrome as 63. Counting the two rings is a property of the border itself and is
 * blind to whatever the frame draws in its middle.
 *
 * `axis` picks which edge to read, because a frame whose sides carry a different weight from its
 * top is not sliceable at one number.
 */
function ringDepthOf(key: string, axis: "top" | "left" = "top"): number {
  const px = pixelsOf(key);
  const at = (d: number): string =>
    axis === "top" ? px.at(Math.floor(px.width / 2), d) : px.at(d, Math.floor(px.height / 2));
  const limit = axis === "top" ? px.height : px.width;
  const outer = at(0);
  let depth = 0;
  while (depth < limit && at(depth) === outer) depth += 1;
  const inner = at(depth);
  while (depth < limit && at(depth) === inner) depth += 1;
  return depth;
}

/**
 * The five frames that are PANELS — everything but `ui-sign-card-frame`.
 *
 * The sign card is a WORLD PROP and not a panel: `core/types.ts` `PROP_KINDS["sign-card"]` puts it
 * in the world, and `tools/ui-frames/SPEC.md` §4.6 paints it from the palette's wood band with a
 * "7px bevel" rather than from the UI plate roles, "because a sign that used `UI_SWATCH.panel` would
 * be a menu lying in a field". Measured, its edge is `#040308 · #ca9164×2 · #aa7241×3 · #040308`,
 * which is not the two-ring idiom the other five share — so it is held to a different assertion
 * below rather than quietly averaged in with them.
 */
const PANEL_FRAME_IDS: readonly string[] = UI_FRAME_ASSET_IDS.filter(
  (key) => key !== UI_FRAME_ASSET_ID.signCard,
);

/* ════════════════════════════════════════════════════════════════════════════
 * The rig
 * ════════════════════════════════════════════════════════════════════════════ */

interface Recorder {
  stubObjects: Array<{ kind: string }>;
  stubTextures: Map<string, { width: number; height: number; frames: Map<string, unknown> }>;
  stubKeys: Map<string, Array<() => void>>;
}

const rec = (scene: object): Recorder => scene as unknown as Recorder;

interface StubImageLike extends FrameImageLike {
  kind: string;
  x: number;
  y: number;
  key: string;
  frame: string | undefined;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  originX: number;
  destroyed: boolean;
}

const imagesOf = (scene: object, key?: string): StubImageLike[] =>
  rec(scene)
    .stubObjects.filter((o): o is StubImageLike & { kind: "image" } => o.kind === "image")
    .filter((o) => key === undefined || o.key === key);

/** Seed a texture at the size the shipped PNG really is, so a cut cannot be checked against a guess. */
function seedFrame(scene: object, key: string): void {
  const px = pixelsOf(key);
  rec(scene).stubTextures.set(key, { width: px.width, height: px.height, frames: new Map() });
}

/** A bare `FrameSceneLike` with one seeded frame — the drawer on its own, with no scene around it. */
function bareScene(seed: readonly string[] = UI_FRAME_ASSET_IDS): {
  scene: FrameSceneLike;
  drawn: StubImageLike[];
} {
  const drawn: StubImageLike[] = [];
  const textures = new Map<string, { width: number; height: number; frames: Map<string, unknown> }>();
  for (const key of seed) {
    const px = pixelsOf(key);
    textures.set(key, { width: px.width, height: px.height, frames: new Map() });
  }
  const scene: FrameSceneLike = {
    add: {
      image: (x, y, key, frame) => {
        const texture = textures.get(key);
        const cut = frame === undefined ? undefined : (texture?.frames.get(frame) as
          | { width: number; height: number }
          | undefined);
        const image = {
          kind: "image",
          x,
          y,
          key,
          frame,
          width: cut?.width ?? texture?.width ?? 0,
          height: cut?.height ?? texture?.height ?? 0,
          displayWidth: cut?.width ?? texture?.width ?? 0,
          displayHeight: cut?.height ?? texture?.height ?? 0,
          originX: 0.5,
          destroyed: false,
          setOrigin(ox: number): unknown {
            image.originX = ox;
            return image;
          },
          setDisplaySize(w: number, h: number): unknown {
            image.displayWidth = w;
            image.displayHeight = h;
            return image;
          },
          destroy(): void {
            image.destroyed = true;
          },
        } as StubImageLike;
        drawn.push(image);
        return image;
      },
    },
    textures: {
      exists: (key) => textures.has(key),
      get: (key) => {
        const texture = textures.get(key);
        if (!texture) return undefined;
        return {
          has: (frame: string) => texture.frames.has(frame),
          add: (frame: string, _s: number, x: number, y: number, w: number, h: number) => {
            texture.frames.set(frame, { x, y, width: w, height: h });
            return {};
          },
          get: (frame?: string) =>
            frame === undefined
              ? { width: texture.width, height: texture.height }
              : (texture.frames.get(frame) as { width: number; height: number } | undefined),
        };
      },
    },
  };
  return { scene, drawn };
}

const boundsOf = (i: StubImageLike): { left: number; top: number; right: number; bottom: number } => ({
  left: i.x,
  top: i.y,
  right: i.x + i.displayWidth,
  bottom: i.y + i.displayHeight,
});

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The table names the rows the pipeline really ships
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the asset ids are the manifest's own ui-frame rows", () => {
  it("the table is exactly the ui-frame class, derived from tools/comfy/manifest.json", () => {
    // NOT a count and not a hand-typed list on both sides: the expectation is read off the manifest
    // by the shipped `assetId` rule, so a row the pipeline adds, renames or drops reddens here.
    expect(MANIFEST_FRAME_KEYS.length).toBeGreaterThan(0);
    expect([...UI_FRAME_ASSET_IDS].sort()).toEqual(MANIFEST_FRAME_KEYS);
  });

  it("every id lives under the class's own finalDir, and every PNG is really on disk", () => {
    const finalDir = MANIFEST.classes["ui-frame"]?.finalDir;
    expect(finalDir, "manifest.classes has no ui-frame recipe").toBeDefined();
    expect(assetId(`${finalDir as string}/x.png`).split("/")[0]).toBe(UI_FRAME_DIR);
    for (const key of UI_FRAME_ASSET_IDS) {
      expect(key.startsWith(`${UI_FRAME_DIR}/`), key).toBe(true);
      // `pixelsOf` throws when the file was not read; reading it is the existence check.
      expect(pixelsOf(key).width).toBeGreaterThan(0);
    }
  });

  it("the size of each PNG is the size the manifest asked the pipeline for", () => {
    for (const row of MANIFEST.rows.filter((r) => r.class === "ui-frame")) {
      const [w, h] = (row as unknown as { targetSize: string }).targetSize.split("x").map(Number);
      const px = pixelsOf(assetId(row.finalFile));
      expect([px.width, px.height], `${row.id} is not the size its row asked for`).toEqual([w, h]);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 THE HAZARD — the frame's plate IS the body ink, on every screen that uses one
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the frame's interior is the text colour, and nothing paints it", () => {
  it("MEASURED — the plate of every stretching frame is exactly the body ink of its screen", () => {
    /*
     * The whole reason the drawers are ring-only. Both sides are read from what ships: the plate
     * from the PNG's own middle pixel, the ink from the three live palette tables. If a repaint ever
     * makes them differ, this reddens and the ring-only rule can be revisited on evidence.
     */
    const inks = {
      "game/menu-model.ts UI.text (MenuScene, TitleScene)": UI.text,
      "game/survey-view.ts SCREEN_HEX.ink (DexScene, SurveyScene, SummaryScene)": SCREEN_HEX.ink,
      'game/ui/Palette.ts roleHex("text") (the battle cards)': roleHex("text"),
    };
    const plate = plateOf(UI_FRAME_ASSET_ID.menuPanel).toLowerCase();
    for (const [where, ink] of Object.entries(inks)) {
      expect(ink.toLowerCase(), `${where} is no longer the frame's plate colour`).toBe(plate);
    }
    // …and the three frames this change wires all carry that same plate, so the rule is one rule.
    for (const key of [UI_FRAME_ASSET_ID.menuPanel, UI_FRAME_ASSET_ID.battleHud, UI_FRAME_ASSET_ID.dexCard]) {
      expect(plateOf(key).toLowerCase(), `${key} no longer has the shared plate`).toBe(plate);
    }
  });

  it("no piece cut at FRAME_CHROME_PX contains one pixel of the plate — checked on all six", () => {
    /*
     * THE ANTI-HAZARD, as a property of the pixels rather than of the draw order. A slice wider than
     * the chrome puts plate INSIDE the corner pieces — `tools/ui-frames/SPEC.md` §3's SLICE_PX = 10
     * would carry a 6×6 block of it into each corner — and those corners are drawn over whatever the
     * screen already painted there. At the chrome width there is no plate in any piece at all.
     */
    for (const key of UI_FRAME_ASSET_IDS) {
      const px = pixelsOf(key);
      const plate = plateOf(key);
      const s = FRAME_CHROME_PX;
      const inPiece = (x: number, y: number): boolean =>
        (x < s || x >= px.width - s) || (y < s || y >= px.height - s);
      let found: string | null = null;
      for (let y = 0; y < px.height && found === null; y += 1) {
        for (let x = 0; x < px.width; x += 1) {
          if (inPiece(x, y) && px.at(x, y) === plate) {
            found = `${key}: plate ${plate} at (${String(x)}, ${String(y)}), inside a ring piece`;
            break;
          }
        }
      }
      expect(found).toBeNull();
    }
  });

  it("BINDS — one pixel wider and the plate IS inside a piece, so the check above discriminates", () => {
    // Non-vacuity for the sweep: the same predicate at chrome + 1 must find the plate, or the green
    // above is a loop that could never fail.
    const key = UI_FRAME_ASSET_ID.menuPanel;
    const px = pixelsOf(key);
    const plate = plateOf(key);
    const s = FRAME_CHROME_PX + 1;
    const inPiece = (x: number, y: number): boolean =>
      (x < s || x >= px.width - s) || (y < s || y >= px.height - s);
    let found = false;
    for (let y = 0; y < px.height && !found; y += 1) {
      for (let x = 0; x < px.width; x += 1) {
        if (inPiece(x, y) && px.at(x, y) === plate) {
          found = true;
          break;
        }
      }
    }
    expect(found, "a slice one pixel past the chrome no longer reaches the plate").toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 The slice is the chrome, and the chrome is measured
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 FRAME_CHROME_PX is re-derived from the pixels of every shipped frame", () => {
  it("the five PANEL frames all carry the same two-ring border, and it is FRAME_CHROME_PX deep", () => {
    expect(PANEL_FRAME_IDS.length).toBe(UI_FRAME_ASSET_IDS.length - 1);
    for (const key of PANEL_FRAME_IDS) {
      expect(ringDepthOf(key, "top"), `${key}'s top ring depth moved`).toBe(FRAME_CHROME_PX);
      expect(ringDepthOf(key, "left"), `${key}'s left edge is a different weight from its top`).toBe(
        FRAME_CHROME_PX,
      );
    }
  });

  it("MEASURED — the sign card is a wood bevel, not a panel border, and the drawer is told so", () => {
    /*
     * The one `ui-frame` row that must NOT be sliced at the panel chrome. Its edge is a 7px carved
     * bevel (SPEC §4.6) rather than 2px + 2px, so a cut at 4 lands INSIDE the bevel and the piece
     * carries half a plank. It is drawn 1:1 wherever the prop is, and nothing in `game/` draws the
     * `sign-card` prop's face yet — which is why `UI_FRAME_ASSET_ID.signCard` is declared and
     * unwired, and why this test exists instead of a call site.
     */
    const key = UI_FRAME_ASSET_ID.signCard;
    expect(ringDepthOf(key, "top"), "the sign card acquired the panel's two-ring border").not.toBe(
      FRAME_CHROME_PX,
    );
    const px = pixelsOf(key);
    const mid = Math.floor(px.width / 2);
    const face = px.at(mid, Math.floor(px.height / 2));
    // At the panel chrome the sign card is still bevel, not face: the edge is deeper than 4.
    expect(px.at(mid, FRAME_CHROME_PX), "a 4px cut already reaches the sign's face").not.toBe(face);
    // …and the five panels ARE face/plate at that depth, so the line above discriminates.
    for (const panel of PANEL_FRAME_IDS) {
      const p = pixelsOf(panel);
      expect(p.at(Math.floor(p.width / 2), FRAME_CHROME_PX), panel).not.toBe(
        p.at(Math.floor(p.width / 2), 0),
      );
    }
  });

  it("MEASURED — the corner bracket runs 8px, so a stretched strip is invariant only past 8", () => {
    /*
     * `tools/ui-frames/SPEC.md` §3 says the bracket is 6px and picks SLICE_PX = 10 to clear it. The
     * pixels say 8. This is recorded as a measurement rather than as an opinion because it is the
     * only cost of slicing at the chrome: an edge strip cut at 4 carries the bracket and therefore
     * resamples it, where a strip cut at 8 or more would not. §2 is why the chrome wins anyway.
     */
    const key = UI_FRAME_ASSET_ID.menuPanel;
    const px = pixelsOf(key);
    const columnAt = (x: number): string => Array.from({ length: 8 }, (_, y) => px.at(x, y)).join("|");
    // Columns 0..7 are the bracket and differ from the settled edge; from 8 on every column agrees.
    expect(columnAt(7)).not.toBe(columnAt(8));
    for (const x of [9, 20, 80, px.width - 9]) {
      expect(columnAt(x), `column ${String(x)} of the top strip is not translation-invariant`).toBe(
        columnAt(8),
      );
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 The drawer
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 drawFrameRing cuts eight pieces and stretches each on one axis only", () => {
  const RECT: FrameRect = { x: 12, y: 20, width: 200, height: 90 };

  it("eight pieces, corner-anchored, and no ninth", () => {
    const { scene, drawn } = bareScene();
    const pieces = drawFrameRing(scene, UI_FRAME_ASSET_ID.menuPanel, RECT);
    expect(pieces, "the drawer refused a seeded texture").not.toBeNull();
    expect(drawn).toHaveLength(8);
    expect(new Set(drawn.map((i) => i.frame)).size).toBe(8);
    expect([...FRAME_PIECES].map((p) => p.name).sort()).toEqual(drawn.map((i) => i.frame).sort());
    for (const piece of drawn) expect(piece.originX, "a piece is centred, not corner-anchored").toBe(0);
  });

  it("corners keep their natural size; edges stretch on their own axis and keep their thickness", () => {
    const { scene, drawn } = bareScene();
    drawFrameRing(scene, UI_FRAME_ASSET_ID.menuPanel, RECT);
    const s = FRAME_CHROME_PX;
    const at = (name: string): StubImageLike => {
      const piece = drawn.find((i) => i.frame === name);
      expect(piece, `no "${name}" piece`).toBeDefined();
      return piece as StubImageLike;
    };
    for (const name of ["slice-tl", "slice-tr", "slice-bl", "slice-br"]) {
      expect([at(name).displayWidth, at(name).displayHeight], name).toEqual([s, s]);
      expect([at(name).width, at(name).height], `${name} was cut at the wrong size`).toEqual([s, s]);
    }
    // `toBeCloseTo` at nine places: a display size is `natural * (requested / natural)` in Phaser and
    // in the stub alike, so a stretched edge returns off a float round-trip. Far tighter than a pixel.
    for (const name of ["slice-t", "slice-b"]) {
      expect(at(name).displayWidth, name).toBeCloseTo(RECT.width - s * 2, 9);
      expect(at(name).displayHeight, name).toBeCloseTo(s, 9);
    }
    for (const name of ["slice-l", "slice-r"]) {
      expect(at(name).displayWidth, name).toBeCloseTo(s, 9);
      expect(at(name).displayHeight, name).toBeCloseTo(RECT.height - s * 2, 9);
    }
  });

  it("the ring bounds the rect exactly — no gap, no overhang", () => {
    const { scene, drawn } = bareScene();
    drawFrameRing(scene, UI_FRAME_ASSET_ID.menuPanel, RECT);
    const bounds = drawn.map(boundsOf);
    expect(Math.min(...bounds.map((b) => b.left))).toBe(RECT.x);
    expect(Math.min(...bounds.map((b) => b.top))).toBe(RECT.y);
    expect(Math.max(...bounds.map((b) => b.right))).toBeCloseTo(RECT.x + RECT.width, 9);
    expect(Math.max(...bounds.map((b) => b.bottom))).toBeCloseTo(RECT.y + RECT.height, 9);
  });

  it("no piece covers the interior of the source texture — there is no centre to ask for", () => {
    const { scene, drawn } = bareScene();
    drawFrameRing(scene, UI_FRAME_ASSET_ID.menuPanel, RECT);
    for (const piece of drawn) {
      const coversInterior = piece.width > FRAME_CHROME_PX && piece.height > FRAME_CHROME_PX;
      expect(coversInterior, `piece "${String(piece.frame)}" cuts into the plate`).toBe(false);
    }
  });

  it("every one of the six shipped frames slices, at its own size and at a stretched one", () => {
    for (const key of UI_FRAME_ASSET_IDS) {
      const px = pixelsOf(key);
      for (const rect of [
        { x: 0, y: 0, width: px.width, height: px.height },
        { x: 4, y: 6, width: balance.map.virtualWidth, height: balance.map.virtualHeight },
      ]) {
        const { scene, drawn } = bareScene([key]);
        expect(drawFrameRing(scene, key, rect), `${key} refused ${JSON.stringify(rect)}`).not.toBeNull();
        expect(drawn, key).toHaveLength(8);
      }
    }
  });

  it("falls back rather than throwing: no texture, no manager, a panel smaller than two corners", () => {
    // The path a broken or absent download leaves behind, and the path a node test takes.
    const unseeded = bareScene([]);
    expect(drawFrameRing(unseeded.scene, UI_FRAME_ASSET_ID.menuPanel, RECT)).toBeNull();
    expect(unseeded.drawn).toHaveLength(0);

    const noManager: FrameSceneLike = { add: { image: () => ({}) as FrameImageLike } };
    expect(drawFrameRing(noManager, UI_FRAME_ASSET_ID.menuPanel, RECT)).toBeNull();
    expect(frameTextureOf(noManager, UI_FRAME_ASSET_ID.menuPanel)).toBeNull();

    const tiny = bareScene();
    const s = FRAME_CHROME_PX;
    expect(drawFrameRing(tiny.scene, UI_FRAME_ASSET_ID.menuPanel, { x: 0, y: 0, width: s * 2, height: 40 })).toBeNull();
    expect(drawFrameRing(tiny.scene, UI_FRAME_ASSET_ID.menuPanel, { x: 0, y: 0, width: 40, height: s * 2 })).toBeNull();
    expect(tiny.drawn, "a refused panel still drew something").toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 The three screens, executed
 * ════════════════════════════════════════════════════════════════════════════ */

/** The slot list reads real storage (`SaveStorage`), so the menu needs one installed to build. */
class FakeLocalStorage {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function bootRegistry(): void {
  resetContentCache();
  registry.setContent(content);
  const holder = globalThis as unknown as Record<string, unknown>;
  const had = "localStorage" in holder;
  const prev = holder["localStorage"];
  holder["localStorage"] = new FakeLocalStorage();
  try {
    installStorage();
  } finally {
    if (had) holder["localStorage"] = prev;
    else delete holder["localStorage"];
  }
}

function mountMenu(mode: unknown, seed = true, register: readonly string[] = []): MenuScene {
  bootRegistry();
  const scene = new MenuScene();
  if (seed) seedFrame(scene, UI_FRAME_ASSET_ID.menuPanel);
  // `MenuScene.screen()` asks `sceneRegistered` EVERY time rather than trusting a list, and answers
  // a missing key with a disabled row carrying no `onSelect` — so a rig that registers nothing can
  // never drive the hand-off it means to test.
  const keys = (scene as unknown as { scene: { manager: { keys: Record<string, unknown> } } }).scene
    .manager.keys;
  for (const key of register) keys[key] = {};
  scene.init(mode);
  scene.create();
  return scene;
}

function mountDex(): DexScene {
  const scene = new DexScene();
  seedFrame(scene, UI_FRAME_ASSET_ID.dexCard);
  const data: DexSceneData = {
    content,
    season: "spring",
    onClose: () => undefined,
  };
  scene.init(data);
  scene.create();
  return scene;
}

describe("§5 MenuScene draws the ui-menu-panel plate", () => {
  it("the plate is the manifest's row, sliced into eight pieces", () => {
    const scene = mountMenu({ mode: "slots", intent: "new" });
    const ring = imagesOf(scene, UI_FRAME_ASSET_ID.menuPanel);
    expect(ring, "the menu drew no painted plate").toHaveLength(8);
    expect(new Set(ring.map((i) => i.frame)).size).toBe(8);
  });

  it("it encloses the row block, and it does NOT cover the heading or the footer", () => {
    const scene = mountMenu({ mode: "slots", intent: "new" });
    const rect = menuPlateRect(balance.map.virtualWidth, balance.map.virtualHeight);
    const bounds = imagesOf(scene, UI_FRAME_ASSET_ID.menuPanel).map(boundsOf);
    expect(Math.min(...bounds.map((b) => b.left))).toBe(rect.x);
    expect(Math.min(...bounds.map((b) => b.top))).toBe(rect.y);
    expect(Math.max(...bounds.map((b) => b.right))).toBeCloseTo(rect.x + rect.width, 9);
    expect(Math.max(...bounds.map((b) => b.bottom))).toBeCloseTo(rect.y + rect.height, 9);

    // The rows really are inside it, and the two lines drawn on the FIELD really are outside — read
    // off the recorded text objects, not off the constants the layout was built from.
    const texts = rec(scene).stubObjects.filter(
      (o): o is { kind: "text"; x: number; y: number } => o.kind === "text",
    );
    expect(texts.length).toBeGreaterThan(2);
    const rows = texts.filter((t) => t.y >= rect.y && t.y <= rect.y + rect.height);
    expect(rows.length, "no menu row landed on the plate").toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.x, "a row starts under the plate's chrome").toBeGreaterThanOrEqual(rect.x + FRAME_CHROME_PX);
    }
    expect(texts.some((t) => t.y < rect.y), "the heading is not above the plate").toBe(true);
    expect(texts.some((t) => t.y > rect.y + rect.height), "the footer is not below the plate").toBe(true);
  });

  it("paints no fill inside the ring — the field stays the camera's own background", () => {
    // §2's rule at the call site: a rectangle covering the plate's interior would be the frame's
    // cream body by another route, and `UI.text` is that cream.
    const scene = mountMenu({ mode: "settings", from: "title" });
    // The floor: a screen that drew no plate at all would satisfy "nothing painted its interior".
    expect(imagesOf(scene, UI_FRAME_ASSET_ID.menuPanel)).toHaveLength(8);
    const rect = menuPlateRect(balance.map.virtualWidth, balance.map.virtualHeight);
    const fills = rec(scene).stubObjects.filter(
      (o): o is { kind: "rect"; x: number; y: number; w: number; h: number } => o.kind === "rect",
    );
    for (const fill of fills) {
      const coversField =
        fill.x <= rect.x + FRAME_CHROME_PX && fill.w >= rect.width - FRAME_CHROME_PX * 2;
      expect(coversField, "something painted the plate's interior").toBe(false);
    }
  });

  it("without the texture the menu still builds, and draws no ring", () => {
    const scene = mountMenu({ mode: "slots", intent: "new" }, false);
    expect(imagesOf(scene, UI_FRAME_ASSET_ID.menuPanel)).toHaveLength(0);
    expect(
      rec(scene).stubObjects.filter((o) => o.kind === "text").length,
      "the rows did not survive the missing frame",
    ).toBeGreaterThan(1);
  });
});

describe("§5 DexScene draws the ui-dex-card-frame ring", () => {
  it("the card's edge is the manifest's row, around the whole screen", () => {
    const scene = mountDex();
    const ring = imagesOf(scene, UI_FRAME_ASSET_ID.dexCard);
    expect(ring, "the dex drew no painted card frame").toHaveLength(8);
    const bounds = ring.map(boundsOf);
    expect(Math.min(...bounds.map((b) => b.left))).toBe(0);
    expect(Math.min(...bounds.map((b) => b.top))).toBe(0);
    expect(Math.max(...bounds.map((b) => b.right))).toBeCloseTo(balance.map.virtualWidth, 9);
    expect(Math.max(...bounds.map((b) => b.bottom))).toBeCloseTo(balance.map.virtualHeight, 9);
  });

  it("the ring is REPLACED on every entry, never accumulated", () => {
    // `layer.removeAll(true)` is what has to take the pieces; a ring added to the scene instead of
    // the layer would stack up for as long as the player holds ←/→.
    const scene = mountDex();
    for (let i = 0; i < 5; i += 1) scene.step(1);
    const live = imagesOf(scene, UI_FRAME_ASSET_ID.dexCard).filter((i) => !i.destroyed);
    expect(live).toHaveLength(8);
  });

  it("the dex's own lines are drawn clear of the chrome, and inside the ring", () => {
    const scene = mountDex();
    const texts = rec(scene).stubObjects.filter(
      (o): o is { kind: "text"; x: number; y: number } => o.kind === "text",
    );
    expect(texts.length).toBeGreaterThan(1);
    for (const t of texts) {
      expect(t.x, "a dex line starts under the chrome").toBeGreaterThanOrEqual(FRAME_CHROME_PX);
      expect(t.y, "a dex line starts under the chrome").toBeGreaterThanOrEqual(FRAME_CHROME_PX);
      expect(t.y, "a dex line is under the bottom chrome").toBeLessThan(
        balance.map.virtualHeight - FRAME_CHROME_PX,
      );
    }
  });

  it("without the texture the dex still draws its entry", () => {
    const scene = new DexScene();
    scene.init({ content, season: "spring", onClose: () => undefined } satisfies DexSceneData);
    scene.create();
    expect(imagesOf(scene, UI_FRAME_ASSET_ID.dexCard)).toHaveLength(0);
    expect(rec(scene).stubObjects.filter((o) => o.kind === "text").length).toBeGreaterThan(0);
  });
});

describe("§5 CombatantPanel draws the ui-battle-hud-frame ring", () => {
  /** A `BattlerView` built from the shipped roster — no species name is written here (G2). */
  const line = content.species[0];
  const view = {
    uid: "p1",
    side: "player" as const,
    lineId: line?.id ?? "",
    formName: line?.formNames.J ?? "",
    displayName: line?.formNames.J ?? "",
    age: "J",
    level: 5,
    types: line?.types ?? [],
    curHp: 10,
    maxHp: 20,
    status: null,
    statMods: {},
    statArrows: {},
    fainted: false,
    isWild: false,
  };

  function mountCard(seed: boolean): { scene: object; panel: CombatantPanel } {
    // The stub `Phaser.Scene` straight from the mock — a scene with nothing on it but the recorders,
    // so the only images this rig can produce are the ones `CombatantPanel` itself asked for.
    const scene = new Phaser.Scene({}) as unknown as object;
    if (seed) seedFrame(scene, UI_FRAME_ASSET_ID.battleHud);
    const panel = new CombatantPanel(scene as never, {
      x: 0,
      y: 0,
      cardX: 40,
      cardY: 60,
      view: view as never,
    });
    return { scene, panel };
  }

  it("eight pieces at the card's own size, and they go INTO the container", () => {
    const { scene, panel } = mountCard(true);
    const ring = imagesOf(scene, UI_FRAME_ASSET_ID.battleHud);
    expect(ring, "the card drew no painted frame").toHaveLength(8);
    const bounds = ring.map(boundsOf);
    // Container-local: the card is placed by the container at (cardX, cardY), so the ring is at 0,0.
    expect(Math.min(...bounds.map((b) => b.left))).toBe(0);
    expect(Math.max(...bounds.map((b) => b.right))).toBeCloseTo(DEFAULT_CARD_STYLE.cardW, 9);
    expect(Math.max(...bounds.map((b) => b.bottom))).toBeCloseTo(DEFAULT_CARD_STYLE.cardH, 9);
    const container = (panel.root as unknown as { children: unknown[] }).children;
    for (const piece of ring) {
      expect(container, "a ring piece was left on the display list, outside the card").toContain(piece);
    }
  });

  it("destroy() takes the ring with the card — nothing outlives the panel it framed", () => {
    const { scene, panel } = mountCard(true);
    const ring = imagesOf(scene, UI_FRAME_ASSET_ID.battleHud);
    // The floor first. Without it this test passes over an EMPTY list the moment the card stops
    // drawing a ring at all — which is exactly what the sabotage run produced, and a leak check that
    // goes green because there is nothing to leak is not a leak check.
    expect(ring, "no ring was drawn, so this proves nothing about destroying one").toHaveLength(8);
    panel.destroy();
    for (const piece of ring) expect(piece.destroyed, "a ring piece survived the card").toBe(true);
  });

  it("the plate keeps its hairline ONLY when there is no frame to draw", () => {
    const withArt = mountCard(true);
    const withoutArt = mountCard(false);
    const strokeOf = (scene: object): number => {
      const plate = rec(scene).stubObjects.find(
        (o): o is { kind: "rect"; strokeWidth: number } => o.kind === "rect",
      );
      return (plate as unknown as { strokeWidth: number } | undefined)?.strokeWidth ?? -1;
    };
    expect(imagesOf(withoutArt.scene, UI_FRAME_ASSET_ID.battleHud)).toHaveLength(0);
    expect(strokeOf(withoutArt.scene), "the fallback hairline is gone").toBe(1);
    expect(strokeOf(withArt.scene), "the card drew both a painted ring AND a hairline").toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 The recorder is a recorder — the sabotage this file's green depends on
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 an assertion the stub cannot observe is worse than no assertion", () => {
  it("setDisplaySize really writes, and a chainable no-op in its place would be caught", () => {
    /*
     * THE STUB SABOTAGE, run in-file. `tests/unit/dex-summary-scene.test.ts` gives `add.image` a
     * Proxy that answers every method with a chainable no-op; under that shape every size assertion
     * in §4 and §5 passes over numbers nothing wrote. So the recorder is re-checked here against a
     * deliberately blind twin: the same eight pieces, drawn through an image that swallows
     * `setDisplaySize`, must NOT satisfy the edge-stretch assertion.
     */
    const RECT: FrameRect = { x: 0, y: 0, width: 200, height: 90 };

    const blind: FrameImageLike[] = [];
    const px = pixelsOf(UI_FRAME_ASSET_ID.menuPanel);
    const frames = new Map<string, { width: number; height: number }>();
    const swallowing: FrameSceneLike = {
      add: {
        image: (_x, _y, _key, frame) => {
          const cut = frame === undefined ? undefined : frames.get(frame);
          const image = {
            displayWidth: cut?.width ?? px.width,
            displayHeight: cut?.height ?? px.height,
            setOrigin: () => image,
            // The no-op. Everything else about this stub is honest, so the ONLY difference between
            // it and `bareScene` is whether this call is remembered.
            setDisplaySize: () => image,
            destroy: () => undefined,
          };
          blind.push(image as unknown as FrameImageLike);
          return image as unknown as FrameImageLike;
        },
      },
      textures: {
        exists: () => true,
        get: () => ({
          has: (frame: string) => frames.has(frame),
          add: (frame: string, _s: number, _x: number, _y: number, w: number, h: number) => {
            frames.set(frame, { width: w, height: h });
            return {};
          },
          get: (frame?: string) =>
            frame === undefined ? { width: px.width, height: px.height } : frames.get(frame),
        }),
      },
    };

    const drawn = drawFrameRing(swallowing, UI_FRAME_ASSET_ID.menuPanel, RECT);
    expect(drawn, "the blind twin refused to draw at all — it is not the same path").not.toBeNull();
    expect(blind).toHaveLength(8);
    const blindTop = blind[1] as unknown as { displayWidth: number };
    // Under the swallowing stub the top edge reports the TEXTURE's width, not the panel's, so the
    // assertion §4 makes about it is unsatisfiable — which is what "the recorder is load-bearing"
    // means, stated as a check rather than as a comment.
    expect(blindTop.displayWidth).not.toBeCloseTo(RECT.width - FRAME_CHROME_PX * 2, 9);

    // …and the real recorder does satisfy it, over the identical call sequence.
    const honest = bareScene();
    drawFrameRing(honest.scene, UI_FRAME_ASSET_ID.menuPanel, RECT);
    const top = honest.drawn.find((i) => i.frame === "slice-t");
    expect(top?.displayWidth).toBeCloseTo(RECT.width - FRAME_CHROME_PX * 2, 9);
  });

  it("the mocked scene's image objects record too — key, frame, origin and destroyed", () => {
    // The same question asked of the `vi.mock("phaser")` stub §5 runs through, since a proxy there
    // would make every §5 assertion vacuous instead.
    const scene = mountDex();
    const ring = imagesOf(scene, UI_FRAME_ASSET_ID.dexCard);
    expect(ring).toHaveLength(8);
    for (const piece of ring) {
      expect(piece.key).toBe(UI_FRAME_ASSET_ID.dexCard);
      expect(typeof piece.frame).toBe("string");
      expect(piece.originX).toBe(0);
      expect(piece.destroyed).toBe(false);
      expect(Number.isFinite(piece.displayWidth)).toBe(true);
    }
    // A piece that is 0×0 would satisfy every "is it there" check and draw nothing.
    expect(Math.min(...ring.map((i) => i.displayWidth))).toBeGreaterThan(0);
    expect(Math.min(...ring.map((i) => i.displayHeight))).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §7 The DEX hand-off — the field the menu did not fill in
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The sign-chain-gated lines and the flags that unlock them, both DERIVED.
 *
 * No species id and no chain id is written here: the gated lines come from
 * `balance.encounter.signChainGatedHabitatTag` against `data/species.json`, and the flags come from
 * the corpus that writes them. A test that typed either would go on passing after a rename, over a
 * save the shipped game can no longer produce.
 */
const GATED_LINES: readonly SpeciesLine[] = content.species.filter((s) =>
  s.habitat.includes(balance.encounter.signChainGatedHabitatTag),
);

/** Every `chain.*.complete` flag `data/dialogue.json` actually sets. */
const CHAIN_COMPLETE_FLAGS: readonly string[] = [
  ...new Set(
    DIALOGUE.entries.flatMap((entry) =>
      Object.entries(entry.setFlags ?? {})
        .filter(([flag, value]) => value === true && flag.startsWith("chain.") && flag.endsWith(".complete"))
        .map(([flag]) => flag),
    ),
  ),
].sort();

/** The gated line a given completion flag unlocks, by the shipped join (the flag's middle segment). */
function lineUnlockedBy(flag: string): SpeciesLine | undefined {
  const stem = flag.slice("chain.".length, flag.length - ".complete".length);
  return GATED_LINES.find((line) => line.id.startsWith(stem));
}

describe("§7 the menu hands the dex the sign chains the save has closed", () => {
  it("the corpus really writes chain completions, and each one names a gated line", () => {
    // Non-vacuity for the whole section: with no flags, or no gated lines, everything below passes
    // over an empty domain — which is how the missing field survived in the first place.
    expect(GATED_LINES.length, "no species is sign-chain gated").toBeGreaterThan(0);
    expect(CHAIN_COMPLETE_FLAGS.length, "data/dialogue.json writes no chain completion").toBeGreaterThan(0);
    for (const flag of CHAIN_COMPLETE_FLAGS) {
      expect(lineUnlockedBy(flag), `nothing gated is unlocked by "${flag}"`).toBeDefined();
    }
  });

  it("DRIVEN — selecting DEX on the real menu passes the closed chain through", () => {
    const flag = CHAIN_COMPLETE_FLAGS[0] as string;
    const line = lineUnlockedBy(flag) as SpeciesLine;

    bootRegistry();
    expect(startNewGame({ slot: 0 }).ok, "the rig could not start a run").toBe(true);
    // The save the RUNNING GAME would have after the chain's last line played.
    registry.save().questFlags[flag] = true;

    const scene = mountMenu({ mode: "session" }, true, [SCENE_KEYS.dex, SCENE_KEYS.overworld]);
    const rows = rec(scene).stubObjects.filter(
      (o): o is { kind: "text"; text: string; handlers: Map<string, Array<() => void>> } =>
        o.kind === "text",
    );
    const dexRow = rows.find((r) => r.text.includes("DEX"));
    expect(dexRow, "the session menu has no DEX row").toBeDefined();
    const click = (dexRow as { handlers: Map<string, Array<() => void>> }).handlers.get("pointerdown");
    expect(click?.length, "the DEX row is disabled — it carries no way to select it").toBeGreaterThan(0);
    for (const fn of click ?? []) fn();

    const started = (scene as unknown as { stubStarted: Array<{ key: string; data: unknown }> }).stubStarted;
    const handOff = started.find((s) => s.key === SCENE_KEYS.dex);
    expect(handOff, "selecting DEX started nothing").toBeDefined();
    const data = (handOff as { data: DexSceneData }).data;
    expect(
      data.unlockedSignChains,
      "the menu handed the dex no unlockedSignChains — the field the defect was",
    ).toBeDefined();
    expect([...(data.unlockedSignChains as ReadonlySet<string>)]).toContain(line.id);
  });

  it("DRIVEN — and the dex it opens no longer flags that line as out of the pool", () => {
    const flag = CHAIN_COMPLETE_FLAGS[0] as string;
    const line = lineUnlockedBy(flag) as SpeciesLine;
    const season = "spring" as const;

    // The two entries the model produces for that line, with the chain closed and with it open.
    const withChain = buildDexEntries(content.species, season, balance, {
      unlockedSignChains: new Set([line.id]),
    }).find((e) => e.lineId === line.id);
    const withoutChain = buildDexEntries(content.species, season, balance).find(
      (e) => e.lineId === line.id,
    );
    expect(withChain, "the gated line has no dex entry").toBeDefined();
    // THE DISCRIMINATOR, derived rather than typed: if closing the chain did not change what the
    // card says, this whole test proves nothing and the field it is about would not matter.
    expect(
      withChain?.encounterGated,
      "closing the chain did not change the entry — the flag is not the one this is about",
    ).not.toBe(withoutChain?.encounterGated);

    const scene = new DexScene();
    seedFrame(scene, UI_FRAME_ASSET_ID.dexCard);
    scene.init({
      content,
      season,
      unlockedSignChains: unlockedSignChainsOf(
        { questFlags: { [flag]: true } } as never,
        content,
      ),
      startDexId: withChain?.dexId,
      onClose: () => undefined,
    } satisfies DexSceneData);
    scene.create();

    const shown = scene.current();
    expect(shown?.lineId, "the dex did not land on the gated line").toBe(line.id);
    expect(shown?.encounterGated, "the dex still reports the unlocked line as out of the pool").toBe(
      withChain?.encounterGated,
    );
    // …and the words on the screen really changed, read off the drawn text rather than the model.
    const drawn = rec(scene)
      .stubObjects.filter((o): o is { kind: "text"; text: string } => o.kind === "text")
      .map((t) => t.text)
      .join("\n");
    const gatedFlagLine = scene
      .entryLines(withoutChain as never)
      .find((l) => !scene.entryLines(withChain as never).includes(l));
    expect(gatedFlagLine, "the two renderings differ by no line at all").toBeDefined();
    expect(drawn, "the dex drew the gated-out line for a chain the save has closed").not.toContain(
      gatedFlagLine as string,
    );
  });

  it("BINDS — the same derivation agrees with the flags the overworld's rule reads", () => {
    // The two spellings of the sign-chain rule must not drift while they are two (see the note on
    // `unlockedSignChainLines`). Every completion flag the corpus writes must unlock exactly the
    // line the join names, and a flag the corpus does NOT write must unlock nothing.
    for (const flag of CHAIN_COMPLETE_FLAGS) {
      const unlocked = unlockedSignChainsOf({ questFlags: { [flag]: true } } as never, content);
      expect([...unlocked]).toEqual([(lineUnlockedBy(flag) as SpeciesLine).id]);
    }
    expect([...unlockedSignChainsOf({ questFlags: {} } as never, content)]).toEqual([]);
    // A flag set to something other than `true` is not a completion.
    const flag = CHAIN_COMPLETE_FLAGS[0] as string;
    expect([...unlockedSignChainsOf({ questFlags: { [flag]: 1 } } as never, content)]).toEqual([]);
    // …and a step flag from the same chain is not its completion.
    expect([
      ...unlockedSignChainsOf({ questFlags: { [flag.replace(".complete", ".step1")]: true } } as never, content),
    ]).toEqual([]);
  });
});
