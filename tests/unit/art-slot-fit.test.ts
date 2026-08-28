/**
 * tests/unit/art-slot-fit.test.ts — WHAT SIZE THE ART IS ACTUALLY DRAWN AT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE DEFECT THIS FILE REPRODUCES, AND WHY IT SHIPPED GREEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `game/placeholder.ts` had a rule written into its header: "Real art is drawn at its NATURAL size —
 * never scaled to fit a slot, because a stretched image is the one failure mode that reads as
 * finished-but-wrong." That rule is right about STRETCHING and wrong about FITTING, and the
 * difference is the whole of this file.
 *
 * The three creature screens ask for boxes on a 480×320 virtual canvas: `DEX_ART_BOX` (128²),
 * `SUMMARY_ART_BOX` (96²) and `RetirementSceneStyle.portrait` (48²). The `dex-painted` manifest
 * class is generated at 1024² with `fit:false` and `quantize:false` — "retained at native size". So
 * on the day the painted plates land, `placeholderImage` calls `scene.add.image` and stops: each
 * plate draws at 1024 across a 480-wide screen — a bit over seven screen widths, twenty-one times
 * the retirement well — covering the dex, the team card and the Legacy card completely.
 *
 * Nothing in the suite noticed, because nothing in the suite had ever asked an art slot how big the
 * thing in it was drawn. `tests/unit/dex-summary-scene.test.ts` stubs `add.image` as a proxy that
 * answers every call with itself, which is exactly the shape that cannot answer this question. So
 * the stub here RECORDS: an image knows the texture it was given, that texture's natural size, and
 * what its display size ended up being.
 *
 * WHY THE SLOTS ARE SEEDED WITH REAL ART RATHER THAN WAITING FOR IT. The fake texture manager
 * below says the texture EXISTS, at the size the manifest says its class is generated at (read from
 * `tools/comfy/manifest.json`, never written down here). Without that, every slot draws a stand-in
 * generated at exactly the box size, which could never be oversize — the failing case would be
 * unreachable from the test. That is the whole rig: the scenes, the helper and the boxes are real.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHAT THE SLOTS ASK FOR NOW, AND THE SECOND PROPERTY THIS FILE HOLDS
 * ─────────────────────────────────────────────────────────────────────────────
 * The painted dex class is CUT — build-doc §15's cut line C-4, taken by the owner and recorded in
 * `docs/STATUS.md`: *"The dex uses the existing creature sprites, so the 35 dex-painted manifest
 * rows are dead."* Every one of those plates was a declared stand-in, so under the old key none of
 * the three slots had real art for any line. They now ask for the 96² `creature-battle` sprite, via
 * `game/scenes/DexScene.ts::creatureArtId` and `game/ui/BattleHud.ts::battleSpriteKey`. The class,
 * its 35 rows and its directory are now GONE, which is why nothing below reads a size out of it.
 *
 * That buys a second property worth binding, and it is NOT the same as fitting. Measured off the
 * real objects, `displayWidth / natural texture width`:
 *
 *     slot                with an oversized 160×320      with the 96² battle sprite
 *     dex          128²   ×0.4     = 1:2.5    NOT         ×1        (16px gutter)  integer
 *     summary       96²   ×0.3     = 1:3.33   NOT         ×1                        integer
 *     portrait well 48²   ×0.15    = 1:6.67   NOT         ×0.5      = 1:2           integer
 *
 * A non-integer nearest-neighbour factor smears the pixel grid — the same class of defect
 * `fitWithin` was written for, one level up. ⚠ `fitWithin` IS CORRECT and must not be "fixed" for
 * it: an oversized texture really does draw down to 48, and what was wrong was the RATIO. So
 * {@link expectIntegerFactor} asserts the factor is an integer or the reciprocal of one, and the
 * test below DEMONSTRATES the assertion can fail by driving the same slots with a texture that is
 * genuinely bigger than every one of them.
 *
 * ⚠ THE OVERSIZED FIXTURE USED TO BE `classTargetSize("dex-painted")` — 1024², read from the class
 * the ruling has now deleted. It is `rowTargetSize("ui-menu-panel")` instead: 160×320, a REAL size
 * the pipeline still generates, and NON-SQUARE, which the 1024² plate was not. That matters here
 * more than anywhere else in the file, because a square texture in a square slot is exactly the case
 * where a fit and a stretch produce the same two numbers — see {@link theNonSquareFixture}. The one
 * thing the old 1024² fixture recorded and this one does not is that an OVERSIZED texture can still
 * land on an integer factor (1024→128 is 1:8), so a ratio test alone never protected the dex; that
 * is kept, as a size constructed from `DEX_ART_BOX` itself rather than borrowed from a dead class.
 *
 * The fit assertion stays deliberately one-sided: it does not demand that the art fill the box, only
 * that what is drawn FITS INSIDE it at the aspect ratio the texture actually has.
 *
 * ⚠ A WEAKNESS OF THIS FILE, FOUND AND CLOSED: every fixture it drove was a SQUARE texture in a
 * SQUARE slot, where `setDisplaySize(naturalW*scale, naturalH*scale)` (a fit) and
 * `setDisplaySize(width, height)` (a stretch) produce identical numbers — so the stretch bug
 * `fitWithin`'s own comment warns about could not be caught here. {@link theNonSquareFixture} is a
 * 2:1 texture in a 1:1 slot, where the two expressions disagree.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Hoisted above the imports by vitest, so this factory can reach nothing outside itself.
 *
 * Every recorder is hung off the scene instance (`stubImages`, `stubTextureSizes`, …) rather than a
 * module-level registry, so two scenes in one test cannot read each other's draws.
 */
vi.mock("phaser", async () => {
  const balance = (await import("../../data/balance.json")).default;

  interface Chainable {
    [method: string]: (...args: unknown[]) => Chainable;
  }

  /** A `Graphics` that answers every call it is sent and returns itself, as Phaser's does. */
  const chainable = (): Chainable => {
    const self = new Proxy({} as Chainable, {
      get: () => (): Chainable => self,
    });
    return self;
  };

  /**
   * The 2D context `drawPlaceholder` draws a stand-in through. It records nothing: this file is
   * about the size an image is drawn at, and the stand-in's own pixels are bound by
   * tests/unit/game-placeholder.test.ts.
   */
  const stubContext = (): unknown =>
    new Proxy(
      {},
      {
        get: () => (): void => undefined,
        set: () => true,
      },
    );

  /**
   * An `Image` that remembers its texture's NATURAL size and its DISPLAY size — the two numbers
   * Phaser's own `Image` keeps (`width`/`height` off the frame, `displayWidth`/`displayHeight` after
   * scale) and the two numbers no stub in this suite had ever kept.
   */
  class StubImage {
    scaleX = 1;
    scaleY = 1;
    originX = 0.5;
    originY = 0.5;
    constructor(
      readonly x: number,
      readonly y: number,
      readonly key: string,
      readonly width: number,
      readonly height: number,
    ) {}
    get displayWidth(): number {
      return this.width * this.scaleX;
    }
    get displayHeight(): number {
      return this.height * this.scaleY;
    }
    setDisplaySize(width: number, height: number): this {
      this.scaleX = this.width === 0 ? 1 : width / this.width;
      this.scaleY = this.height === 0 ? 1 : height / this.height;
      return this;
    }
    setScale(x: number, y?: number): this {
      this.scaleX = x;
      this.scaleY = y ?? x;
      return this;
    }
    setOrigin(x = 0.5, y?: number): this {
      this.originX = x;
      this.originY = y ?? x;
      return this;
    }
    setDepth(): this {
      return this;
    }
    setTint(): this {
      return this;
    }
    destroy(): void {
      /* nothing to release */
    }
  }

  class StubText {
    text: string;
    color: string;
    destroyed = false;
    readonly height = 8;
    readonly handlers = new Map<string, Array<() => void>>();
    constructor(
      readonly x: number,
      readonly y: number,
      value: string | string[],
      color: string,
    ) {
      this.text = Array.isArray(value) ? value.join("\n") : value;
      this.color = color;
    }
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

  class StubContainer {
    readonly children: unknown[] = [];
    add(child: unknown): void {
      this.children.push(child);
    }
    removeAll(): void {
      this.children.length = 0;
    }
    destroy(): void {
      this.children.length = 0;
    }
  }

  class StubScene {
    readonly stubKeys = new Map<string, Array<(event?: unknown) => void>>();
    readonly stubScene: string[] = [];
    readonly stubObjects: StubText[] = [];
    readonly stubImages: StubImage[] = [];
    /** Texture key -> the natural size of that texture, which is what `add.image` reports. */
    readonly stubTextureSizes = new Map<string, { width: number; height: number }>();

    readonly textures = {
      exists: (key: string): boolean => this.stubTextureSizes.has(key),
      // `placeholderTexture` builds a stand-in at exactly the requested size; recording that here is
      // what lets the stand-in path be asserted on the same footing as the real-art path.
      createCanvas: (key: string, width: number, height: number): unknown => {
        this.stubTextureSizes.set(key, { width, height });
        return { getContext: (): unknown => stubContext(), refresh: (): void => undefined };
      },
    };

    readonly add = {
      container: (): StubContainer => new StubContainer(),
      graphics: (): Chainable => chainable(),
      rectangle: (): Chainable => chainable(),
      image: (x: number, y: number, key: string): StubImage => {
        const size = this.stubTextureSizes.get(key) ?? { width: 0, height: 0 };
        const image = new StubImage(x, y, key, size.width, size.height);
        this.stubImages.push(image);
        return image;
      },
      text: (
        x: number,
        y: number,
        value: string | string[],
        style?: { color?: string },
      ): StubText => {
        const obj = new StubText(x, y, value, style?.color ?? "");
        this.stubObjects.push(obj);
        return obj;
      },
    };

    readonly input = {
      keyboard: {
        on: (event: string, fn: (event?: unknown) => void): void => {
          const bound = this.stubKeys.get(event) ?? [];
          bound.push(fn);
          this.stubKeys.set(event, bound);
        },
        off: (): void => undefined,
        addKey: (): unknown => ({ isDown: false }),
      },
    };

    readonly events = { on: (): void => undefined, once: (): void => undefined };
    readonly cameras = { main: { setBackgroundColor: (): void => undefined } };
    readonly scale = { width: balance.map.virtualWidth, height: balance.map.virtualHeight };
    readonly stubStarted: Array<{ key: string; data: unknown }> = [];
    readonly scene = {
      manager: { keys: {} as Record<string, unknown> },
      start: (key: string, data?: unknown): void => {
        this.stubScene.push(`start:${key}`);
        this.stubStarted.push({ key, data });
      },
      stop: (key?: string): void => {
        this.stubScene.push(`stop:${key ?? "self"}`);
      },
      launch: (key: string, data?: unknown): void => {
        this.stubScene.push(`launch:${key}`);
        this.stubStarted.push({ key, data });
      },
      pause: (): void => undefined,
      resume: (): void => undefined,
    };
    constructor(_config: unknown) {}
  }

  return {
    default: {
      Scene: StubScene,
      Scenes: { Events: { SHUTDOWN: "shutdown", WAKE: "wake", RESUME: "resume" } },
    },
  };
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Phaser from "phaser";

import { indexSpecies, newOwnedCreature } from "@core/lifecycle";
import { subsystemRng } from "@core/rng";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Balance, Content, OwnedCreature, SpeciesLine, Trait } from "@core/types";

import { installStorage, resetContentCache, startNewGame } from "@game/boot";
import { registry } from "@game/registry";
import { SCENE_KEYS } from "@game/scene-keys";
import { DEX_ART_BOX, SUMMARY_ART_BOX } from "@game/survey-view";
import { DexScene, creatureArtId, type DexSceneData } from "@game/scenes/DexScene";
import { MenuScene } from "@game/scenes/MenuScene";
import { SummaryScene, type SummarySceneData } from "@game/scenes/SummaryScene";
import {
  createRetirementScene,
  defaultRetirementStyle,
  type RetirementOffer,
} from "@game/scenes/RetirementScene";
import { driveYearTurn } from "@game/scenes/YearTurnScene";
import { battleSpriteKey } from "@game/ui/BattleHud";

const content: Content = validateContent();
const balance: Balance = content.balance;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

/**
 * The size an asset class is GENERATED at, read from the manifest that generates it. Written down
 * here it would be a second answer to a question `tools/comfy/manifest.json` already answers, and
 * the day a class is re-targeted this rig would go on testing the old number.
 */
function readArtManifest(): {
  classes: Record<string, { targetW: number; targetH: number } | undefined>;
  rows: Array<{ id: string; targetSize: string }>;
} {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, "tools/comfy/manifest.json"), "utf8")) as {
    classes: Record<string, { targetW: number; targetH: number } | undefined>;
    rows: Array<{ id: string; targetSize: string }>;
  };
}

function classTargetSize(className: string): { width: number; height: number } {
  const cls = readArtManifest().classes[className];
  if (!cls) throw new Error(`tools/comfy/manifest.json has no ${className} class`);
  return { width: cls.targetW, height: cls.targetH };
}

/**
 * The size ONE ROW is generated at. `ui-frame` overrides its class default per row, so the only
 * place a non-square generated size can be read from is the row itself.
 */
function rowTargetSize(rowId: string): { width: number; height: number } {
  const row = readArtManifest().rows.find((r) => r.id === rowId);
  if (!row) throw new Error(`tools/comfy/manifest.json has no ${rowId} row`);
  const [w, h] = row.targetSize.split("x").map(Number);
  if (w === undefined || h === undefined || !Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error(`${rowId}.targetSize is "${row.targetSize}", which is not WxH`);
  }
  return { width: w, height: h };
}

/** What the three slots ask for now: the shipped creature battle sprite. */
const SPRITE = classTargetSize("creature-battle");

/**
 * A real generated size that is BIGGER THAN EVERY SLOT ON BOTH AXES and is NOT SQUARE. Used only to
 * prove the integer-factor assertion is capable of failing: 160×320 makes the dex 1:2.5, the team
 * card 1:3.33 and the portrait well 1:6.67. Read from the shipped `ui-menu-panel` row rather than
 * written down, so a re-target of that row moves this fixture with it — and asserted to still have
 * both properties before it is used, since a row that shrank would make the whole test vacuous.
 */
const OVERSIZED = rowTargetSize("ui-menu-panel");

/* ────────────────────────────────────────────────────────────────────────────
 * Recorders off a stub scene
 * ──────────────────────────────────────────────────────────────────────────── */

interface RecordedImage {
  key: string;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
}

interface StubTextLike {
  text: string;
  handlers: Map<string, Array<() => void>>;
}

interface Recorder {
  stubImages: RecordedImage[];
  stubObjects: StubTextLike[];
  stubStarted: Array<{ key: string; data: unknown }>;
  stubTextureSizes: Map<string, { width: number; height: number }>;
  scene: { manager: { keys: Record<string, unknown> } };
}

function rec(scene: object): Recorder {
  return scene as unknown as Recorder;
}

/** Tell a stub scene which keys `game/main.ts` has registered — `sceneRegistered` reads this. */
function register(scene: object): void {
  const map = rec(scene).scene.manager.keys;
  for (const key of Object.values(SCENE_KEYS)) map[key] = true;
}

/** Say that finished art for `assetId` has loaded, at the size the pipeline generates it. */
function seedRealArt(
  scene: object,
  assetId: string,
  size: { width: number; height: number } = SPRITE,
): void {
  rec(scene).stubTextureSizes.set(assetId, { width: size.width, height: size.height });
}

/**
 * The second property, and the one the ruling bought: the art lands on an INTEGER scale factor.
 *
 * Nearest-neighbour pixel art at a fractional factor drops and doubles rows unevenly — the grid
 * stops being a grid. Both directions count: ×2 is integer, ×0.5 is the reciprocal of one, ×0.09375
 * is neither. Both axes are checked separately, so a stretch cannot satisfy this by accident.
 *
 * ⚠ NOT a re-statement of "fits": the 1024² plate fitted the 128² dex box at exactly 1:8 and still
 * softened the 96² and 48² slots. And NOT a statement about `fitWithin`, which is correct — this is
 * about the RATIO between the class's generated size and the slot's.
 */
function expectIntegerFactor(image: RecordedImage | undefined, where: string): void {
  expect(image, `${where}: nothing was drawn into the art slot`).toBeDefined();
  if (!image) return;
  const isIntegerRatio = (drawn: number, natural: number): boolean => {
    if (!(natural > 0) || !(drawn > 0)) return false;
    const factor = drawn / natural;
    const whole = factor >= 1 ? factor : 1 / factor;
    return Math.abs(whole - Math.round(whole)) < 1e-9;
  };
  expect(
    isIntegerRatio(image.displayWidth, image.width),
    `${where}: drawn ${image.displayWidth}px wide from a ${image.width}px texture — ` +
      `×${String(image.displayWidth / image.width)}, which is neither an integer nor 1/n, so ` +
      "nearest-neighbour will soften the pixel grid",
  ).toBe(true);
  expect(
    isIntegerRatio(image.displayHeight, image.height),
    `${where}: drawn ${image.displayHeight}px tall from a ${image.height}px texture — ` +
      `×${String(image.displayHeight / image.height)}, which is neither an integer nor 1/n`,
  ).toBe(true);
}

/**
 * The one assertion this file exists to make: whatever is in the slot is drawn INSIDE the slot.
 *
 * Both dimensions, plus a floor — an image scaled to nothing would satisfy "fits" and show the
 * player an empty box — plus the aspect ratio, because "fits" is also satisfied by squashing a
 * square plate into a letterbox, which is the stretch the helper's header is right to forbid.
 */
function expectFits(image: RecordedImage | undefined, box: { width: number; height: number }, where: string): void {
  expect(image, `${where}: nothing was drawn into the art slot`).toBeDefined();
  if (!image) return;
  expect(
    image.displayWidth,
    `${where}: the art is drawn ${image.displayWidth}px wide in a ${box.width}px slot ` +
      `(texture is ${image.width}×${image.height})`,
  ).toBeLessThanOrEqual(box.width);
  expect(
    image.displayHeight,
    `${where}: the art is drawn ${image.displayHeight}px tall in a ${box.height}px slot ` +
      `(texture is ${image.width}×${image.height})`,
  ).toBeGreaterThan(0);
  expect(
    image.displayHeight,
    `${where}: the art is drawn ${image.displayHeight}px tall in a ${box.height}px slot ` +
      `(texture is ${image.width}×${image.height})`,
  ).toBeLessThanOrEqual(box.height);
  expect(image.displayWidth, `${where}: the art is scaled away to nothing`).toBeGreaterThan(0);
  const sourceAspect = image.width / image.height;
  const drawnAspect = image.displayWidth / image.displayHeight;
  expect(
    Math.abs(drawnAspect - sourceAspect),
    `${where}: the art is squashed — ${image.width}×${image.height} drawn as ` +
      `${image.displayWidth}×${image.displayHeight}`,
  ).toBeLessThan(0.001);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The rig — the real in-run menu, which is what supplies both cards their data
 * ──────────────────────────────────────────────────────────────────────────── */

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

function bootWith(fake: FakeLocalStorage): void {
  registry.setContent(content);
  const holder = globalThis as unknown as Record<string, unknown>;
  const had = "localStorage" in holder;
  const prev = holder["localStorage"];
  holder["localStorage"] = fake;
  try {
    installStorage();
  } finally {
    if (had) holder["localStorage"] = prev;
    else delete holder["localStorage"];
  }
}

function openMenu(): MenuScene {
  bootWith(new FakeLocalStorage());
  startNewGame({ slot: 0, seed: 4242 });
  const menu = new MenuScene();
  register(menu);
  menu.init({ mode: "session" });
  menu.create();
  return menu;
}

/** The data the real menu really handed to a scene when its row was clicked. */
function handOff<T>(menu: MenuScene, label: string, key: string): T {
  const row = rec(menu).stubObjects.find((o) => o.text.trim() === label);
  expect(row, `no row labelled ${label} on the in-run menu`).toBeDefined();
  for (const fn of row?.handlers.get("pointerdown") ?? []) fn();
  const started = rec(menu).stubStarted.filter((s) => s.key === key);
  expect(started.length, `${label} did not start "${key}"`).toBe(1);
  return started[0]?.data as T;
}

afterEach(() => {
  registry.reset();
  resetContentCache();
  vi.restoreAllMocks();
});

/* ────────────────────────────────────────────────────────────────────────────
 * The dex — DEX_ART_BOX
 * ──────────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────────
 * Driving the three real scenes, each to the key it really asks for
 * ──────────────────────────────────────────────────────────────────────────── */

/** The dex, opened through the real in-run menu, with `key`'s texture seeded at `size`. */
function driveDex(size: { width: number; height: number } = SPRITE) {
  const menu = openMenu();
  const data = handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex);
  const scene = new DexScene();
  register(scene);
  scene.init(data);
  const entry = scene.current();
  expect(entry, "the dex opened on no entry at all").not.toBeNull();
  if (!entry) throw new Error("the dex opened on no entry at all");
  const key = creatureArtId(entry.lineId, entry.ageClass, entry.ancient);
  seedRealArt(scene, key, size);
  scene.create();
  return { scene, entry, key };
}

function driveSummary(size: { width: number; height: number } = SPRITE) {
  const menu = openMenu();
  const data = handOff<SummarySceneData>(menu, "TEAM", SCENE_KEYS.summary);
  const scene = new SummaryScene();
  register(scene);
  scene.init(data);
  const card = scene.card();
  expect(card, "the team card opened on nobody").not.toBeNull();
  if (!card) throw new Error("the team card opened on nobody");
  const key = creatureArtId(card.lineId, card.age, card.ancient);
  seedRealArt(scene, key, size);
  scene.create();
  return { scene, card, key };
}

function driveRetirement(size: { width: number; height: number } = SPRITE) {
  const drive = legacyDrive();
  const offer: RetirementOffer | null = drive.flow.offer();
  expect(offer, "the Legacy drive produced no retirement prompt").not.toBeNull();
  if (!offer) throw new Error("the Legacy drive produced no retirement prompt");

  type SceneCtor = new () => {
    scene: { manager: { keys: Record<string, unknown> } };
    init: (data: never) => void;
    create: () => void;
  };
  const Scene = createRetirementScene(Phaser as never) as unknown as SceneCtor;
  const scene = new Scene();
  register(scene);
  const key = battleSpriteKey(offer.parent.lineId, offer.parent.age, "front");
  seedRealArt(scene, key, size);
  scene.init({ flow: drive.flow, onDone: (): void => undefined } as never);
  scene.create();
  return { scene, offer, key };
}

/** The image a driven scene actually put in its art slot, or a message naming what it drew instead. */
function slotImage(scene: object, key: string, where: string): RecordedImage {
  const drawn = rec(scene).stubImages.find((i) => i.key === key);
  expect(
    drawn,
    `${where} drew ${rec(scene).stubImages.map((i) => i.key).join(", ") || "no image"} — not the ` +
      `real sprite "${key}", so this test is not exercising the real-art path`,
  ).toBeDefined();
  if (!drawn) throw new Error(`${where}: no image for ${key}`);
  return drawn;
}

describe("the creature sprite is drawn inside the slot that asked for it", () => {
  it("the dex card fits the sprite into DEX_ART_BOX, on an integer factor", () => {
    const { scene, key } = driveDex();
    const drawn = slotImage(scene, key, "the dex");
    expectFits(drawn, DEX_ART_BOX, "dex");
    expectIntegerFactor(drawn, "dex");
  });

  it("the team card fits the sprite into SUMMARY_ART_BOX, on an integer factor", () => {
    const { scene, key } = driveSummary();
    const drawn = slotImage(scene, key, "the team card");
    expectFits(drawn, SUMMARY_ART_BOX, "summary");
    expectIntegerFactor(drawn, "summary");
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * The retirement well — the Legacy beat, which is never-cut (build-doc §1)
   * ────────────────────────────────────────────────────────────────────────── */

  it("the retirement card fits the sprite into the portrait well, on an integer factor", () => {
    const style = defaultRetirementStyle(balance);
    const box = { width: style.portrait, height: style.portrait };
    const { scene, key } = driveRetirement();
    const drawn = slotImage(scene, key, "the retirement card");
    expectFits(drawn, box, "retirement");
    expectIntegerFactor(drawn, "retirement");
  });

  it("THE MEASUREMENT — the exact size each slot draws the sprite at", () => {
    /*
     * The three factors, on the record, measured off the objects the real scenes produced. Every
     * expected value is DERIVED from the slot's own box and the manifest's own target size, so a
     * retune of either moves this test with it instead of leaving a stale pair of numbers.
     *
     *   dex          128² box, 96² sprite -> 96×96 at ×1, centred in a 32px gutter (16 a side)
     *   summary       96² box, 96² sprite -> 96×96 at ×1, exactly filling the slot
     *   portrait well 48² box, 96² sprite -> 48×48 at ×0.5
     *
     * `fitWithin` never UPSCALES (`if (scale >= 1) return image`), which is why the 128² dex slot
     * shows the sprite at its native size with a gutter rather than blown up to 128 — that would be
     * a ×1.33 non-integer factor, i.e. the softening this whole change is about.
     */
    const style = defaultRetirementStyle(balance);
    const expected: Array<[string, { width: number; height: number }, RecordedImage]> = [
      ["dex", DEX_ART_BOX, (() => { const d = driveDex(); return slotImage(d.scene, d.key, "the dex"); })()],
      ["summary", SUMMARY_ART_BOX, (() => { const d = driveSummary(); return slotImage(d.scene, d.key, "the team card"); })()],
      [
        "retirement",
        { width: style.portrait, height: style.portrait },
        (() => { const d = driveRetirement(); return slotImage(d.scene, d.key, "the retirement card"); })(),
      ],
    ];
    for (const [where, box, drawn] of expected) {
      const scale = Math.min(1, box.width / SPRITE.width, box.height / SPRITE.height);
      expect([drawn.displayWidth, drawn.displayHeight], `${where} drawn size`).toEqual([
        SPRITE.width * scale,
        SPRITE.height * scale,
      ]);
      expect(drawn.displayWidth / drawn.width, `${where} factor`).toBe(scale);
    }
    // The gutter the dex slot leaves, said out loud: the sprite is smaller than its box, on purpose.
    const dexDrawn = expected[0]?.[2];
    expect(dexDrawn).toBeDefined();
    if (dexDrawn) expect(DEX_ART_BOX.width - dexDrawn.displayWidth).toBe(DEX_ART_BOX.width - SPRITE.width);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * The keys themselves — every slot asks the sprite class, and asks it FRONT
   * ────────────────────────────────────────────────────────────────────────── */

  it("all three slots ask the creature-battle class, and none of them can ask a back key", () => {
    /*
     * The defect this closes. All three asked `dex-painted/dex-<name>` — a class whose 35 files are
     * every one of them a declared stand-in — so none of them had real art for any line, Cindril
     * included, on the never-cut Legacy beat. Asserted on the key the DRIVEN scene really passed to
     * `placeholderImage`, recorded off the image object, not on the helper's return value.
     *
     * ⚠ `key.includes("back")` WOULD BE WRONG: a species line is `kilnback-line`, whose shipped
     * FRONT sprite is `battle-kilnback-e-front`. The facing is the last dash-segment.
     */
    const dex = driveDex();
    const summary = driveSummary();
    const retirement = driveRetirement();
    const slots = [
      { where: "the dex", drawn: slotImage(dex.scene, dex.key, "the dex") },
      { where: "the team card", drawn: slotImage(summary.scene, summary.key, "the team card") },
      { where: "the retirement card", drawn: slotImage(retirement.scene, retirement.key, "the retirement card") },
    ];
    for (const { where, drawn } of slots) {
      // OBSERVED, not recomputed. `slotImage` already refused to return unless the scene passed this
      // exact string to `placeholderImage`; asserting on the helper's return value instead would be
      // green no matter what the scene drew, which is the vacuity this whole file was written after.
      const key = drawn.key;
      expect(key.startsWith("creature-battle/"), `${where} asks for "${key}"`).toBe(true);
      expect(key.startsWith("dex-painted/"), `${where} still asks the CUT painted class`).toBe(false);
      expect(key.slice(key.lastIndexOf("-") + 1), `${where} asks for a non-front key`).toBe("front");
    }
    // The trap, asserted so the check above is not "simplified" into a substring match.
    expect("creature-battle/battle-kilnback-e-front".includes("back")).toBe(true);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Non-vacuity — the recorder really sees what these assertions claim
   * ────────────────────────────────────────────────────────────────────────── */

  it("BINDS — the integer-factor assertion fails on an oversized, non-square generated size", () => {
    /*
     * The whole point of the ruling, measured through the real scenes rather than argued. Driving
     * the SAME slots with a texture bigger than all of them must make {@link expectIntegerFactor}
     * throw — otherwise the assertion above is decoration and would stay green if a slot were
     * repointed at something that does not fit on a clean factor.
     *
     * ⚠ THE FIXTURE IS NO LONGER THE CUT 1024² PLATE. It is the shipped `ui-menu-panel` row's
     * 160×320, which is oversized on BOTH axes and NOT SQUARE — so the scale factor is set by the
     * tighter axis and a stretch would produce a different number from a fit, which a square fixture
     * in a square slot can never show. Every property the fixture needs is asserted, not assumed.
     */
    const style = defaultRetirementStyle(balance);
    const boxes = [DEX_ART_BOX, SUMMARY_ART_BOX, { width: style.portrait, height: style.portrait }];
    for (const box of boxes) {
      expect(OVERSIZED.width, "the fixture is not wider than a slot").toBeGreaterThan(box.width);
      expect(OVERSIZED.height, "the fixture is not taller than a slot").toBeGreaterThan(box.height);
    }
    expect(OVERSIZED.width, "the fixture is square — a fit and a stretch agree on it").not.toBe(OVERSIZED.height);

    /** The fit `fitWithin` applies: one factor, set by the tighter axis. Derived, never typed. */
    const fit = (box: { width: number; height: number }): number =>
      Math.min(1, box.width / OVERSIZED.width, box.height / OVERSIZED.height);

    const dex = driveDex(OVERSIZED);
    const plate = slotImage(dex.scene, dex.key, "the dex");
    expect(plate.displayWidth / plate.width).toBeCloseTo(fit(DEX_ART_BOX), 12);
    // The stretch this fixture can see and a square one cannot: filling the box on both axes.
    expect([plate.displayWidth, plate.displayHeight]).not.toEqual([DEX_ART_BOX.width, DEX_ART_BOX.height]);
    expect(() => expectIntegerFactor(plate, "dex")).toThrow();

    const summary = slotImage(driveSummary(OVERSIZED).scene, driveSummary(OVERSIZED).key, "the team card");
    expect(summary.displayWidth / summary.width).toBeCloseTo(fit(SUMMARY_ART_BOX), 12);
    expect(() => expectIntegerFactor(summary, "summary")).toThrow();

    const well = driveRetirement(OVERSIZED);
    const portrait = slotImage(well.scene, well.key, "the retirement card");
    expect(portrait.displayWidth / portrait.width).toBeCloseTo(
      fit({ width: style.portrait, height: style.portrait }),
      12,
    );
    expect(() => expectIntegerFactor(portrait, "retirement")).toThrow();

    /*
     * …and the property the CUT 1024² plate used to record here, kept: an oversized texture can
     * still land on an integer factor, so this ratio check ALONE never protected the dex. 1024→128
     * was exactly 1:8, and the size is rebuilt from `DEX_ART_BOX` rather than borrowed from the
     * deleted class, so the point survives the ruling instead of dying with its fixture. What holds
     * the dex is the key assertion above, not this one.
     */
    const integerOversize = { width: DEX_ART_BOX.width * 8, height: DEX_ART_BOX.height * 8 };
    expect(integerOversize.width).toBeGreaterThan(DEX_ART_BOX.width);
    const clean = driveDex(integerOversize);
    const cleanPlate = slotImage(clean.scene, clean.key, "the dex");
    expect(cleanPlate.displayWidth / cleanPlate.width).toBe(DEX_ART_BOX.width / integerOversize.width);
    expect(() => expectIntegerFactor(cleanPlate, "dex")).not.toThrow();
  });

  it("BINDS — the recorder observes natural size, display size and the key, and they can differ", () => {
    /*
     * The stub this file replaced answered every call with itself and RECORDED NOTHING, which is how
     * a `setFlipX` assertion elsewhere in this suite was silently vacuous for weeks. Every number
     * the assertions above read is checked here to be a real observation: the natural size is the
     * seeded texture's, the display size is what `fitWithin` set, and on a downscaling slot the two
     * are DIFFERENT — so an assertion comparing them cannot be trivially true.
     */
    const style = defaultRetirementStyle(balance);
    const { scene, key } = driveRetirement();
    const drawn = slotImage(scene, key, "the retirement card");
    expect([drawn.width, drawn.height], "natural size is not the seeded texture's").toEqual([
      SPRITE.width,
      SPRITE.height,
    ]);
    expect([drawn.displayWidth, drawn.displayHeight]).toEqual([style.portrait, style.portrait]);
    expect(drawn.displayWidth, "display size equals natural size — nothing was recorded").not.toBe(
      drawn.width,
    );
    // The scene also drew other things; the recorder kept them, so `find` is selecting, not luck.
    expect(rec(scene).stubImages.length).toBeGreaterThan(0);
    expect(rec(scene).stubObjects.length).toBeGreaterThan(0);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * theNonSquareFixture — the case every earlier fixture in this file could not
   * distinguish: a fit and a stretch agree on a square texture in a square slot.
   * ────────────────────────────────────────────────────────────────────────── */

  it("theNonSquareFixture — a 2:1 texture in a 1:1 slot is FITTED, not stretched", () => {
    /*
     * `fitWithin` scales by ONE factor on both axes — the smaller of the two ratios — so a wide
     * texture is left short of the box vertically ON PURPOSE. The tempting shortening,
     * `setDisplaySize(width, height)`, fills the box on both axes and is a squash; `fitWithin`'s own
     * comment records that it has been written that way once already and reverted.
     *
     * Every other fixture in this file is square-in-square, where the correct and the incorrect
     * expression produce the SAME two numbers. This one is the only fixture where they disagree:
     * fitted is 128×64, stretched is 128×128.
     */
    const wide = { width: SPRITE.width * 2, height: SPRITE.height };
    const { scene, key } = driveDex(wide);
    const drawn = slotImage(scene, key, "the dex");

    expect([drawn.width, drawn.height], "the non-square texture was not seeded").toEqual([
      wide.width,
      wide.height,
    ]);
    // Derived from the box and the texture, never typed as a pair of numbers.
    const scale = Math.min(1, DEX_ART_BOX.width / wide.width, DEX_ART_BOX.height / wide.height);
    expect([drawn.displayWidth, drawn.displayHeight]).toEqual([wide.width * scale, wide.height * scale]);
    // The stretch this fixture exists to catch, named so the assertion above cannot be misread.
    expect([drawn.displayWidth, drawn.displayHeight]).not.toEqual([
      DEX_ART_BOX.width,
      DEX_ART_BOX.height,
    ]);
    expectFits(drawn, DEX_ART_BOX, "dex (non-square)");
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * …and the stand-in path is unchanged: it is generated AT the box size, so it
   * is drawn at scale 1 and nothing has to fit it.
   * ────────────────────────────────────────────────────────────────────────── */

  it("a creature with no shipped sprite still falls back to a stand-in, in every slot", () => {
    /*
     * The other half of the contract, and it must not throw: a key with no texture behind it draws a
     * labelled box carrying that key, at exactly the slot's size. Driven with NO `seedRealArt`,
     * which is the state of a tree whose art has not loaded yet.
     */
    const cases: Array<{ where: string; box: { width: number; height: number }; run: () => { scene: object; key: string } }> = [
      { where: "dex", box: DEX_ART_BOX, run: () => {
        const menu = openMenu();
        const data = handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex);
        const scene = new DexScene();
        register(scene);
        scene.init(data);
        const entry = scene.current();
        if (!entry) throw new Error("the dex opened on no entry at all");
        scene.create();
        return { scene, key: creatureArtId(entry.lineId, entry.ageClass, entry.ancient) };
      } },
      { where: "summary", box: SUMMARY_ART_BOX, run: () => {
        const menu = openMenu();
        const data = handOff<SummarySceneData>(menu, "TEAM", SCENE_KEYS.summary);
        const scene = new SummaryScene();
        register(scene);
        scene.init(data);
        const card = scene.card();
        if (!card) throw new Error("the team card opened on nobody");
        scene.create();
        return { scene, key: creatureArtId(card.lineId, card.age, card.ancient) };
      } },
      { where: "retirement", box: { width: defaultRetirementStyle(balance).portrait, height: defaultRetirementStyle(balance).portrait }, run: () => {
        const drive = legacyDrive();
        const offer = drive.flow.offer();
        if (!offer) throw new Error("the Legacy drive produced no retirement prompt");
        type SceneCtor = new () => { scene: { manager: { keys: Record<string, unknown> } }; init: (d: never) => void; create: () => void };
        const Scene = createRetirementScene(Phaser as never) as unknown as SceneCtor;
        const scene = new Scene();
        register(scene);
        scene.init({ flow: drive.flow, onDone: (): void => undefined } as never);
        scene.create();
        return { scene, key: battleSpriteKey(offer.parent.lineId, offer.parent.age, "front") };
      } },
    ];

    for (const { where, box, run } of cases) {
      const { scene, key } = run();
      const drawn = rec(scene).stubImages[0];
      expect(drawn, `${where} drew no stand-in at all`).toBeDefined();
      if (!drawn) continue;
      // The stand-in NAMES the asset it stands in for — that is what makes it a work item.
      expect(drawn.key, `${where}'s stand-in does not name the asset`).toContain(key);
      expect([drawn.width, drawn.height], `${where} stand-in natural size`).toEqual([box.width, box.height]);
      expect([drawn.displayWidth, drawn.displayHeight], `${where} stand-in display size`).toEqual([
        box.width,
        box.height,
      ]);
      expectIntegerFactor(drawn, `${where} stand-in`);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The Legacy fixture — built from shipped content, naming no species
 * ──────────────────────────────────────────────────────────────────────────── */

function mortalLine(offset = 0): SpeciesLine {
  const lines = content.species.filter((line) => !line.ancient);
  const line = lines[offset % lines.length];
  if (!line) throw new Error("no non-Ancient species line in the shipped content");
  return line;
}

function traitAt(index: number): Trait {
  const trait = balance.traits.pool[index % balance.traits.pool.length];
  if (!trait) throw new Error("balance.traits.pool is empty");
  return { ...trait };
}

function creatureOf(uid: string, line: SpeciesLine, age: OwnedCreature["age"], level: number, traits?: Trait[]): OwnedCreature {
  return newOwnedCreature(
    {
      uid,
      lineId: line.id,
      age,
      level,
      caughtYear: balance.clock.startYear,
      ...(traits ? { traits } : {}),
    },
    line,
    balance,
  );
}

function firstNodeId(): string {
  const node = content.nodes[0];
  if (!node) throw new Error("no nodes in the shipped content");
  return node.id;
}

/** The Legacy beat as the demo cuts it: an Elder retiring with teammates alive. */
function legacyDrive(seed = 17) {
  // `indexSpecies` is called for its validation of the shipped roster — a line the fixture builds
  // against that core cannot index would fail here rather than inside the flow.
  indexSpecies(content.species);
  const party = [
    creatureOf("elder", mortalLine(), "E", 22, [traitAt(0), traitAt(1)]),
    creatureOf("mate0", mortalLine(1), "J", 10),
    creatureOf("mate1", mortalLine(2), "J", 11),
    creatureOf("mate2", mortalLine(3), "J", 12),
  ];
  const save: SaveEnvelope = newSave(
    { seed, currentNode: firstNodeId(), nodes: content.nodes, party, box: [] },
    balance,
  );
  const tag = balance.rng.subsystemTags[1] ?? "sim";
  const lifecycle = subsystemRng(seed, tag);
  return driveYearTurn(save, {
    content,
    simRng: subsystemRng(seed, tag),
    lifecycleRng: () => lifecycle.nextFloat(),
    endedYear: save.year,
  });
}
