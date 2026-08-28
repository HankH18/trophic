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
 * WHY THE SLOTS ARE SEEDED WITH REAL ART RATHER THAN WAITING FOR IT. `assets/final/` carries no
 * painted plate today, so every one of these slots draws a stand-in that is generated at exactly
 * the box size and could never be oversize. The bug is only reachable once the art exists — which
 * is why it survived: the failing case is unreachable from the shipped tree. The fake texture
 * manager below therefore says the plate EXISTS, at the size the manifest says it is generated at
 * (read from `tools/comfy/manifest.json`, never written down here). That is the whole rig: the
 * scenes, the helper and the boxes are all real.
 *
 * The assertion is deliberately one-sided. It does not demand a particular scale, an integer
 * reciprocal, or that the art fill the box — only that what is drawn FITS INSIDE the box the scene
 * asked for, at the aspect ratio the texture actually has. A slot that overflows its box is the
 * defect; anything inside it is a rendering choice.
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
import { DexScene, type DexSceneData } from "@game/scenes/DexScene";
import { MenuScene } from "@game/scenes/MenuScene";
import { SummaryScene, type SummarySceneData } from "@game/scenes/SummaryScene";
import {
  createRetirementScene,
  defaultRetirementStyle,
  type RetirementOffer,
} from "@game/scenes/RetirementScene";
import { driveYearTurn } from "@game/scenes/YearTurnScene";
import { dexArtId } from "@game/survey-view";

const content: Content = validateContent();
const balance: Balance = content.balance;

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

/**
 * The size the painted dex class is GENERATED at, read from the manifest that generates it. Written
 * down here it would be a second answer to a question `tools/comfy/manifest.json` already answers,
 * and the day the class is re-targeted this rig would go on testing the old number.
 */
function dexPlateSize(): { width: number; height: number } {
  const manifest = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "tools/comfy/manifest.json"), "utf8"),
  ) as { classes: Record<string, { targetW: number; targetH: number }> };
  const cls = manifest.classes["dex-painted"];
  if (!cls) throw new Error("tools/comfy/manifest.json has no dex-painted class");
  return { width: cls.targetW, height: cls.targetH };
}

const PLATE = dexPlateSize();

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
function seedRealArt(scene: object, assetId: string): void {
  rec(scene).stubTextureSizes.set(assetId, { width: PLATE.width, height: PLATE.height });
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

describe("the painted plate is drawn inside the slot that asked for it", () => {
  it("the dex card fits the plate into DEX_ART_BOX", () => {
    const menu = openMenu();
    const data = handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex);

    const scene = new DexScene();
    register(scene);
    scene.init(data);
    const entry = scene.current();
    expect(entry, "the dex opened on no entry at all").not.toBeNull();
    if (!entry) return;
    // The premise, asserted rather than assumed: the id the scene asks for is the id the pipeline
    // produces. `tests/gates/dex-path-contract.test.ts` owns that equality; this only leans on it.
    seedRealArt(scene, entry.artId);
    scene.create();

    const drawn = rec(scene).stubImages.find((i) => i.key === entry.artId);
    expect(
      drawn,
      `the dex drew ${rec(scene).stubImages.map((i) => i.key).join(", ") || "no image"} — not the ` +
        `real plate "${entry.artId}", so this test is not exercising the real-art path`,
    ).toBeDefined();
    expectFits(drawn, DEX_ART_BOX, "dex");
  });

  it("the team card fits the plate into SUMMARY_ART_BOX", () => {
    const menu = openMenu();
    const data = handOff<SummarySceneData>(menu, "TEAM", SCENE_KEYS.summary);

    const scene = new SummaryScene();
    register(scene);
    scene.init(data);
    const card = scene.card();
    expect(card, "the team card opened on nobody").not.toBeNull();
    if (!card) return;
    seedRealArt(scene, card.artId);
    scene.create();

    const drawn = rec(scene).stubImages.find((i) => i.key === card.artId);
    expect(
      drawn,
      `the team card drew ${rec(scene).stubImages.map((i) => i.key).join(", ") || "no image"} — ` +
        `not the real plate "${card.artId}"`,
    ).toBeDefined();
    expectFits(drawn, SUMMARY_ART_BOX, "summary");
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * The retirement well — the Legacy beat, which is never-cut (build-doc §1)
   * ────────────────────────────────────────────────────────────────────────── */

  it("the retirement card fits the plate into the portrait well", () => {
    const style = defaultRetirementStyle(balance);
    const box = { width: style.portrait, height: style.portrait };

    const drive = legacyDrive();
    const offer: RetirementOffer | null = drive.flow.offer();
    expect(offer, "the Legacy drive produced no retirement prompt").not.toBeNull();
    if (!offer) return;

    type SceneCtor = new () => {
      scene: { manager: { keys: Record<string, unknown> } };
      init: (data: never) => void;
      create: () => void;
    };
    const Scene = createRetirementScene(Phaser as never) as unknown as SceneCtor;
    const scene = new Scene();
    register(scene);
    const artId = dexArtId(offer.parent.formName);
    seedRealArt(scene, artId);
    scene.init({ flow: drive.flow, onDone: (): void => undefined } as never);
    scene.create();

    const drawn = rec(scene).stubImages.find((i) => i.key === artId);
    expect(
      drawn,
      `the retirement card drew ${rec(scene).stubImages.map((i) => i.key).join(", ") || "no image"} ` +
        `— not the real portrait "${artId}"`,
    ).toBeDefined();
    expectFits(drawn, box, "retirement");
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * …and the stand-in path is unchanged: it is generated AT the box size, so it
   * is drawn at scale 1 and nothing has to fit it.
   * ────────────────────────────────────────────────────────────────────────── */

  it("a stand-in still fills its slot exactly, untouched", () => {
    const menu = openMenu();
    const data = handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex);
    const scene = new DexScene();
    register(scene);
    scene.init(data);
    const entry = scene.current();
    if (!entry) throw new Error("the dex opened on no entry at all");
    // No `seedRealArt` — this is the shipped state of the tree, where the plate is unbuilt.
    scene.create();

    const drawn = rec(scene).stubImages[0];
    expect(drawn, "the dex drew no stand-in at all").toBeDefined();
    if (!drawn) return;
    expect(drawn.key).toContain(entry.artId);
    expect([drawn.width, drawn.height]).toEqual([DEX_ART_BOX.width, DEX_ART_BOX.height]);
    expect([drawn.displayWidth, drawn.displayHeight]).toEqual([
      DEX_ART_BOX.width,
      DEX_ART_BOX.height,
    ]);
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
