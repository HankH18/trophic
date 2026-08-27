/**
 * tests/unit/dex-summary-scene.test.ts — THE DEX AND THE TEAM CARD, CLOSED.
 *
 * `tests/unit/survey-view.test.ts` binds everything these two screens DRAW, and it binds it by
 * calling `game/survey-view.ts` directly — neither scene class had ever been instantiated by
 * anything in this suite. That left the same question unasked here that
 * `tests/unit/survey-scene.test.ts` was written to ask of the survey: **once the card is up, can the
 * player get off it?**
 *
 * For the epilogue survey the answer was no — an optional `onClose`, a caller that supplied none,
 * and `close()` a no-op. `DexSceneData.onClose` and `SummarySceneData.onClose` were the same shape.
 * They were not broken: each has exactly one supplier, `game/scenes/MenuScene.ts`'s `screen()`
 * helper, and it supplies one. So this file drives THAT supplier rather than a hand-built object —
 * the real `MenuScene`, in session mode, over a real save, selected by a real pointer event on the
 * real row — and then opens the real card on the data the menu really handed over.
 *
 * ONE DIFFERENCE FROM THE SURVEY, AND IT DECIDES WHAT "CLOSED" MEANS. The survey's broken caller
 * used `scene.launch`, so the survey was drawn OVER a scene that was still there and its last-resort
 * `this.scene.stop()` uncovered one. These two are opened with `scene.start`, and
 * `Phaser.Scenes.ScenePlugin.start` queues `stop` on the CALLING scene first — so the menu is shut
 * down behind the card, and the overworld was shut down behind the menu. Nothing is underneath.
 * `closeScreen`'s last resort therefore REOPENS THE MENU, and the two tests at the bottom are what
 * hold it to that instead of to a stop that would leave a black screen taking no input.
 *
 * WHY `vi.mock("phaser")`. `MenuScene`, `DexScene` and `SummaryScene` all do `import Phaser from
 * "phaser"` as a VALUE and extend `Phaser.Scene`, and Phaser cannot be imported under vitest's node
 * environment (`ReferenceError: window is not defined`, from phaser/src/device/OS.js). The stub is a
 * RECORDER, not a renderer: text objects remember what was written to them and which pointer
 * handlers were bound, and the scene plugin remembers every `start`/`stop`. Every string on the menu
 * still comes from the real `MenuScene` over real content, and every number on the card still comes
 * from the real `game/survey-view.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Hoisted above the imports by vitest, so the factory can reach nothing outside itself. Each scene
 * hands its own recorders out on `stubScene` / `stubObjects` / `stubKeys`, which is how a test reads
 * back what `create()` did without the stub needing a module-level registry.
 *
 * The factory is async so the virtual screen can be read from `data/balance.json` rather than
 * spelled here (G11) — `#footer` and `ListMenu` both lay out against `this.scale`.
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
   * A `Text` that records. `height` is fixed because `ListMenu` advances its layout by it; nothing
   * in this file asserts a coordinate, only which row carries which label.
   */
  class StubText {
    text: string;
    color: string;
    destroyed = false;
    readonly height = 8;
    readonly handlers = new Map<string, Array<() => void>>();
    constructor(
      readonly x: number,
      readonly y: number,
      value: string,
      color: string,
    ) {
      this.text = value;
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
  }

  class StubScene {
    readonly stubKeys = new Map<string, Array<() => void>>();
    readonly stubScene: string[] = [];
    readonly stubObjects: StubText[] = [];
    readonly add = {
      container: (): StubContainer => new StubContainer(),
      graphics: (): Chainable => chainable(),
      image: (): Chainable => chainable(),
      text: (x: number, y: number, value: string, style?: { color?: string }): StubText => {
        const obj = new StubText(x, y, value, style?.color ?? "");
        this.stubObjects.push(obj);
        return obj;
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
    // `textures.exists` answers true so `game/placeholder.ts` short-circuits to the id instead of
    // building a canvas stand-in. This file is about leaving the screen, not about the art on it.
    readonly textures = { exists: (): boolean => true };
    readonly scene = {
      manager: { keys: {} as Record<string, unknown> },
      start: (key: string, data?: unknown): void => {
        this.stubScene.push(`start:${key}`);
        this.stubStarted.push({ key, data });
      },
      stop: (key?: string): void => {
        this.stubScene.push(`stop:${key ?? "self"}`);
      },
      launch: (key: string): void => {
        this.stubScene.push(`launch:${key}`);
      },
    };
    readonly stubStarted: Array<{ key: string; data: unknown }> = [];
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

import { validateContent } from "../../core/schemas";
import type { Content } from "../../core/types";
import { SCENE_KEYS, installStorage, resetContentCache, startNewGame } from "../../game/boot";
import { registry } from "../../game/registry";
import { DexScene, type DexSceneData } from "../../game/scenes/DexScene";
import { MenuScene } from "../../game/scenes/MenuScene";
import { SummaryScene, type SummarySceneData } from "../../game/scenes/SummaryScene";

const content: Content = validateContent();

afterEach(() => {
  registry.reset();
  resetContentCache();
  vi.restoreAllMocks();
});

/* ────────────────────────────────────────────────────────────────────────────
 * The rig — the real menu, recorded
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

interface StubText {
  text: string;
  handlers: Map<string, Array<() => void>>;
}

interface Recorder {
  stubKeys: Map<string, Array<() => void>>;
  stubScene: string[];
  stubObjects: StubText[];
  stubStarted: Array<{ key: string; data: unknown }>;
  scene: { manager: { keys: Record<string, unknown> } };
}

/** The stub's recorders, off any scene the stub built. */
function rec(scene: object): Recorder {
  return scene as unknown as Recorder;
}

/** Tell a stub scene which keys `game/main.ts` has registered — `sceneRegistered` reads this. */
function register(scene: object, keys: readonly string[]): void {
  const map = rec(scene).scene.manager.keys;
  for (const key of keys) map[key] = true;
}

const ALL_KEYS: readonly string[] = [
  SCENE_KEYS.menu,
  SCENE_KEYS.overworld,
  SCENE_KEYS.survey,
  SCENE_KEYS.dex,
  SCENE_KEYS.summary,
];

/**
 * Boot a run and open the REAL in-run menu on it, exactly as Phaser would: `init` then `create`.
 * `game/boot.ts` reaches it with `scene.start(SCENE_KEYS.menu, { mode: "session" })`.
 */
function openMenu(registered: readonly string[] = ALL_KEYS): MenuScene {
  bootWith(new FakeLocalStorage());
  startNewGame({ slot: 0, seed: 4242 });
  const menu = new MenuScene();
  register(menu, registered);
  menu.init({ mode: "session" });
  menu.create();
  return menu;
}

/**
 * Select a row by its label, through the pointer handler `ListMenu` really bound to it. Rows are
 * drawn with a cursor prefix (`"▶ DEX"` / `"  DEX"`), so the match is on the trimmed label.
 */
function selectRow(menu: MenuScene, label: string): void {
  const row = rec(menu).stubObjects.find((o) => o.text.trim() === label);
  expect(row, `no row labelled ${label} on the in-run menu`).toBeDefined();
  const handlers = row?.handlers.get("pointerdown") ?? [];
  expect(handlers.length, `row ${label} is not clickable`).toBe(1);
  for (const fn of handlers) fn();
}

/** The data the menu really handed to a scene when its row was chosen. */
function handOff<T>(menu: MenuScene, label: string, key: string): T {
  selectRow(menu, label);
  const started = rec(menu).stubStarted.filter((s) => s.key === key);
  expect(started.length, `${label} did not start "${key}"`).toBe(1);
  return started[0]?.data as T;
}

/** Fire every handler `create()` bound for a key — the real binding, not a direct `close()` call. */
function pressKey(scene: object, event: string): number {
  const handlers = rec(scene).stubKeys.get(event) ?? [];
  for (const fn of handlers) fn();
  return handlers.length;
}

function openDex(data: DexSceneData, registered: readonly string[] = ALL_KEYS): DexScene {
  const scene = new DexScene();
  register(scene, registered);
  scene.init(data);
  scene.create();
  return scene;
}

function openSummary(
  data: SummarySceneData,
  registered: readonly string[] = ALL_KEYS,
): SummaryScene {
  const scene = new SummaryScene();
  register(scene, registered);
  scene.init(data);
  scene.create();
  return scene;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The supplier really supplies one
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the in-run menu hands both cards a way back", () => {
  it("DEX is started with an onClose", () => {
    const menu = openMenu();
    const data = handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex);
    expect(typeof data.onClose, "the dex is opened with no onClose").toBe("function");
  });

  it("TEAM is started with an onClose", () => {
    const menu = openMenu();
    const data = handOff<SummarySceneData>(menu, "TEAM", SCENE_KEYS.summary);
    expect(typeof data.onClose, "the team card is opened with no onClose").toBe("function");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * ESC reaches that supplier
 * ──────────────────────────────────────────────────────────────────────────── */

describe("ESC on a card reaches the menu's own closer", () => {
  it("the dex is stopped and the menu is reopened", () => {
    const menu = openMenu();
    const data = handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex);
    const dex = openDex(data);
    expect(pressKey(dex, "keydown-ESC"), "ESC is not bound on the dex").toBe(1);

    /*
     * THE WHOLE TAKEOVER AS ONE LIST, asserted on the MENU's plugin — which is the claim: the
     * closer that ran is the one `MenuScene.screen()` built, not something the card decided.
     * `stop:Dex` before `start:Menu` is load-bearing and was measured live once already: `start`
     * shuts down the scene it is called ON, so a closer that only restarted the menu left the card
     * it came from running and drawn on top of it.
     */
    expect(rec(menu).stubScene).toEqual([
      `start:${SCENE_KEYS.dex}`,
      `stop:${SCENE_KEYS.dex}`,
      `start:${SCENE_KEYS.menu}`,
    ]);
    // And the card did nothing to its own plugin — the closer did all of it.
    expect(rec(dex).stubScene, "the dex routed on its own as well as calling the closer").toEqual(
      [],
    );
  });

  it("the team card is stopped and the menu is reopened", () => {
    const menu = openMenu();
    const data = handOff<SummarySceneData>(menu, "TEAM", SCENE_KEYS.summary);
    const summary = openSummary(data);
    expect(pressKey(summary, "keydown-ESC"), "ESC is not bound on the team card").toBe(1);
    expect(rec(menu).stubScene).toEqual([
      `start:${SCENE_KEYS.summary}`,
      `stop:${SCENE_KEYS.summary}`,
      `start:${SCENE_KEYS.menu}`,
    ]);
    expect(rec(summary).stubScene).toEqual([]);
  });

  it("closing is the ONLY thing ESC does — the card itself is untouched", () => {
    // Guards the repair against the lazy version of itself: a `close()` that also stepped the
    // cursor, or routed twice, would pass the list assertions above.
    const menu = openMenu();
    const dex = openDex(handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex));
    const before = dex.current();
    pressKey(dex, "keydown-ESC");
    expect(dex.current()).toBe(before);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The untyped hole — Phaser starts scenes with `unknown`
 * ──────────────────────────────────────────────────────────────────────────── */

describe("a card opened with NO closer still leaves the screen", () => {
  it("the dex reopens the menu rather than stopping into nothing", () => {
    /*
     * The structural half. `DexSceneData.onClose` is required, so no typed caller can repeat the
     * epilogue's omission — but `ScenePlugin.start`/`launch` take `unknown` data and the interface is
     * gone at run time, so `closeScreen` keeps a last resort.
     *
     * It REOPENS THE MENU rather than stopping this scene, and that is the whole difference from
     * `game/scenes/SurveyScene.ts`: the survey was launched over a live scene, these are started
     * over a dead one. `stop:self` here would take the last running scene down and leave a black
     * screen — the defect, not the repair.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const menu = openMenu();
    const data = handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex);
    const stripped = { ...data } as Partial<DexSceneData>;
    delete stripped.onClose;

    const dex = openDex(stripped as DexSceneData);
    expect(pressKey(dex, "keydown-ESC")).toBe(1);
    expect(rec(dex).stubScene).toEqual([`start:${SCENE_KEYS.menu}`]);
    expect(rec(dex).stubStarted[0]?.data, "the menu is reopened in the wrong mode").toEqual({
      mode: "session",
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("the team card reopens the menu rather than stopping into nothing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const menu = openMenu();
    const data = handOff<SummarySceneData>(menu, "TEAM", SCENE_KEYS.summary);
    const stripped = { ...data } as Partial<SummarySceneData>;
    delete stripped.onClose;

    const summary = openSummary(stripped as SummarySceneData);
    expect(pressKey(summary, "keydown-ESC")).toBe(1);
    expect(rec(summary).stubScene).toEqual([`start:${SCENE_KEYS.menu}`]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("with no menu registered either, the card takes itself down instead of eating input", () => {
    /*
     * `scene.start` on an unregistered key is a `console.warn` and a silent no-op, so routing at a
     * key `game/main.ts` never registered would strand the player exactly the way this last resort
     * exists to prevent. With nowhere to go, stopping is the honest end.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const menu = openMenu();
    const data = handOff<DexSceneData>(menu, "DEX", SCENE_KEYS.dex);
    const stripped = { ...data } as Partial<DexSceneData>;
    delete stripped.onClose;

    const dex = openDex(stripped as DexSceneData, [SCENE_KEYS.dex]);
    expect(pressKey(dex, "keydown-ESC")).toBe(1);
    expect(rec(dex).stubScene).toEqual(["stop:self"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The type is the half that has no run-time footprint
 * ──────────────────────────────────────────────────────────────────────────── */

describe("both hand-off contracts declare onClose REQUIRED", () => {
  /*
   * `onClose?: () => void` compiles and runs identically to `onClose: () => void` — the optional
   * marker is erased, so nothing above can see it. It is nevertheless the T-40 repair: it is what
   * makes a second launcher that forgets the closer a compile error instead of a screen with no way
   * out. `tests/unit/battle-view.test.ts` reads source for the same kind of claim.
   */
  it.each([
    ["game/scenes/DexScene.ts", "DexSceneData"],
    ["game/scenes/SummaryScene.ts", "SummarySceneData"],
  ])("%s declares a required onClose", (file, iface) => {
    const src = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    const body = src.slice(src.indexOf(`export interface ${iface} {`));
    const decl = body.slice(0, body.indexOf("\n}"));
    expect(decl, `${iface} has no onClose at all`).toContain("onClose");
    expect(decl, `${iface}.onClose is still optional — the epilogue's shape`).not.toContain(
      "onClose?",
    );
  });
});
