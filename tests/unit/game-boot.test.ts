/**
 * tests/unit/game-boot.test.ts — boot logic and the typed registry (build-doc §4 step 1, §7.6, §7.8).
 *
 * `game/boot.ts` and `game/registry.ts` shipped with no test of any kind. That was not an oversight
 * about coverage: `boot.ts` imported Phaser as a VALUE, and Phaser cannot be imported under vitest's
 * node environment (`ReferenceError: window is not defined`, from phaser/src/device/OS.js), so every
 * function in the file was unreachable from the suite. The engine is now a parameter — the only three
 * values needed are `AUTO`, `Scale.NONE` and `Scale.NO_CENTER`, and they arrive through
 * `createGameConfig` — which is what makes this file possible at all.
 *
 * The two assertions that matter most, because they pin defects the C1 audit reproduced live:
 *   • `startNewGame` REPORTS a failed write instead of swallowing it, so the menu can say so on
 *     screen rather than in the console;
 *   • `enterGameplay` hands the overworld THIS session — content, save and the very RNG stream
 *     objects. Started with no data, `OverworldScene.init` builds a brand-new save at the default
 *     seed, so a router that forgot them would silently discard the slot it had just loaded.
 */

import { afterEach, describe, expect, it } from "vitest";

import { ContentValidationError, validateContent } from "../../core/schemas";
import { MemoryStorage, newSave, slotKey, type SaveEnvelope } from "../../core/save";
import type { Balance, Content } from "../../core/types";
import {
  GAME_PARENT_ID,
  SCENE_KEYS,
  applySettings,
  contentIssues,
  continueGame,
  createGameConfig,
  enterGameplay,
  installStorage,
  integerZoom,
  loadContent,
  requestedSeed,
  resetContentCache,
  returnToTitle,
  saveSession,
  saveStorage,
  sceneRegistered,
  startNewGame,
  startNodeId,
  viewport,
} from "../../game/boot";
import { registry } from "../../game/registry";
import { SaveStorage } from "../../game/storage";

const content: Content = validateContent();
const balance: Balance = content.balance;

/* ────────────────────────────────────────────────────────────────────────────
 * Ambient globals the browser supplies and node does not
 * ──────────────────────────────────────────────────────────────────────────── */

type Holder = Record<string, unknown>;

function withGlobals<T>(patch: Record<string, unknown>, fn: () => T): T {
  const holder = globalThis as unknown as Holder;
  const had = new Map<string, { present: boolean; value: unknown }>();
  for (const [key, value] of Object.entries(patch)) {
    had.set(key, { present: key in holder, value: holder[key] });
    holder[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, prev] of had) {
      if (prev.present) holder[key] = prev.value;
      else delete holder[key];
    }
  }
}

class FakeLocalStorage {
  readonly map = new Map<string, string>();
  /** Total characters allowed across all values; Infinity = unlimited. */
  quotaChars = Number.POSITIVE_INFINITY;
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    const next = new Map(this.map);
    next.set(key, value);
    let used = 0;
    for (const v of next.values()) used += v.length;
    if (used > this.quotaChars) {
      const err = new Error("The quota has been exceeded.");
      err.name = "QuotaExceededError";
      throw err;
    }
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

afterEach(() => {
  registry.reset();
  resetContentCache();
});

/* ────────────────────────────────────────────────────────────────────────────
 * Content validation
 * ──────────────────────────────────────────────────────────────────────────── */

describe("loadContent / contentIssues", () => {
  it("validates the shipped content and memoises the answer", () => {
    const first = loadContent();
    expect(first.ok).toBe(true);
    expect(loadContent()).toBe(first);
    resetContentCache();
    expect(loadContent()).not.toBe(first);
  });

  it("a ContentValidationError becomes its full issue list, one line each", () => {
    const err = new ContentValidationError(["nodes/r1.json: bad", "species.json: worse"]);
    expect(contentIssues(err)).toEqual(["nodes/r1.json: bad", "species.json: worse"]);
    // Nothing is truncated: the one issue that explains the other twelve must not be hidden.
    expect(contentIssues(err)).toHaveLength(err.issues.length);
  });

  it("any other error still yields a printable line", () => {
    expect(contentIssues(new Error("data/ is missing"))).toEqual(["data/ is missing"]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The viewport (build-doc §7.6)
 * ──────────────────────────────────────────────────────────────────────────── */

describe("viewport and integerZoom", () => {
  it("the viewport is balance.map's, never a literal", () => {
    expect(viewport()).toEqual({
      width: balance.map.virtualWidth,
      height: balance.map.virtualHeight,
    });
  });

  it("zoom is a whole number, at least 1, and fits the window on both axes", () => {
    const view = { width: balance.map.virtualWidth, height: balance.map.virtualHeight };
    for (const [w, h] of [
      [view.width, view.height],
      [view.width * 3, view.height * 2],
      [view.width * 2 - 1, view.height * 5],
      [100, 100],
      [0, 0],
    ] as const) {
      const zoom = withGlobals({ innerWidth: w, innerHeight: h }, () => integerZoom(view));
      expect(Number.isInteger(zoom)).toBe(true);
      expect(zoom).toBeGreaterThanOrEqual(1);
      if (w >= view.width && h >= view.height) {
        expect(zoom * view.width).toBeLessThanOrEqual(w);
        expect(zoom * view.height).toBeLessThanOrEqual(h);
      }
    }
  });

  it("a window exactly 2x the virtual screen zooms to 2, not 2.something", () => {
    const view = { width: balance.map.virtualWidth, height: balance.map.virtualHeight };
    const zoom = withGlobals({ innerWidth: view.width * 2, innerHeight: view.height * 2 + 37 }, () =>
      integerZoom(view),
    );
    expect(zoom).toBe(2);
  });
});

describe("createGameConfig", () => {
  const P = {
    AUTO: "AUTO",
    Scale: { NONE: "NONE", NO_CENTER: "NO_CENTER" },
  } as unknown as Parameters<typeof createGameConfig>[0];

  it("sizes the canvas from balance.map and keeps §7.6's pixel-art flags", () => {
    const config = createGameConfig(P, []);
    expect(config).not.toBeNull();
    expect(config?.width).toBe(balance.map.virtualWidth);
    expect(config?.height).toBe(balance.map.virtualHeight);
    expect(config?.pixelArt).toBe(true);
    expect(config?.antialias).toBe(false);
    expect(config?.roundPixels).toBe(true);
    expect(config?.parent).toBe(GAME_PARENT_ID);
  });

  it("scales by an integer zoom with Phaser's own centring off", () => {
    const config = createGameConfig(P, []);
    const scale = config?.scale as { mode: string; autoCenter: string; zoom: number } | undefined;
    expect(scale?.mode).toBe("NONE");
    expect(scale?.autoCenter).toBe("NO_CENTER");
    expect(Number.isInteger(scale?.zoom)).toBe(true);
  });

  it("copies the scene list rather than aliasing the caller's array", () => {
    const scenes: unknown[] = [];
    const config = createGameConfig(P, scenes as Parameters<typeof createGameConfig>[1]);
    scenes.push("added later");
    expect(config?.scene).toHaveLength(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Where a new game starts, and on what seed
 * ──────────────────────────────────────────────────────────────────────────── */

describe("startNodeId — derived from content, never typed in (INV-2 / G2)", () => {
  it("is the first gym's town on the shipped content", () => {
    const town = content.gyms[0]?.town;
    expect(town).toBeTruthy();
    expect(startNodeId(content)).toBe(town);
    expect(content.nodes.some((n) => n.id === startNodeId(content))).toBe(true);
  });

  it("really READS the gym, rather than coincidentally agreeing with node[0]", () => {
    // On the shipped content the first gym's town IS the first node, so the assertion above passes
    // for an implementation that ignores gyms entirely (verified by sabotage). Reordering the nodes
    // separates the two answers.
    const town = content.gyms[0]?.town;
    const reordered = {
      ...content,
      nodes: [...content.nodes].reverse(),
    } as Content;
    expect(reordered.nodes[0]?.id).not.toBe(town);
    expect(startNodeId(reordered)).toBe(town);
  });

  it("falls back to the first node when no gym names a real town", () => {
    const noGyms = { ...content, gyms: [] } as Content;
    expect(startNodeId(noGyms)).toBe(content.nodes[0]?.id);

    const danglingGym = {
      ...content,
      gyms: [{ ...(content.gyms[0] as object), town: "nowhere" }],
    } as unknown as Content;
    expect(startNodeId(danglingGym)).toBe(content.nodes[0]?.id);
  });

  it("says so rather than guessing when there is nowhere to start", () => {
    expect(() => startNodeId({ ...content, nodes: [], gyms: [] } as Content)).toThrow(/no nodes/);
  });
});

describe("requestedSeed — reproducible by default, overridable for a demo take", () => {
  it("is balance.rng.defaultSeed with no query string", () => {
    expect(withGlobals({ location: undefined }, () => requestedSeed(balance))).toBe(
      balance.rng.defaultSeed,
    );
    expect(withGlobals({ location: { search: "" } }, () => requestedSeed(balance))).toBe(
      balance.rng.defaultSeed,
    );
  });

  it("?seed=N wins", () => {
    expect(withGlobals({ location: { search: "?seed=12" } }, () => requestedSeed(balance))).toBe(12);
    expect(
      withGlobals({ location: { search: "?other=1&seed=-4" } }, () => requestedSeed(balance)),
    ).toBe(-4);
  });

  it("a seed that is not a safe integer falls back rather than poisoning the run", () => {
    for (const search of ["?seed=", "?seed=abc", "?seed=1e999", "?seed=1.5.5", "?seed=NaN"]) {
      const got = withGlobals({ location: { search } }, () => requestedSeed(balance));
      expect(Number.isSafeInteger(got), search).toBe(true);
    }
    expect(withGlobals({ location: { search: "?seed=abc" } }, () => requestedSeed(balance))).toBe(
      balance.rng.defaultSeed,
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Starting, resuming and persisting a run
 * ──────────────────────────────────────────────────────────────────────────── */

function bootWith(fake: FakeLocalStorage | null): string | null {
  registry.setContent(content);
  return withGlobals({ localStorage: fake ?? undefined }, () => installStorage());
}

describe("startNewGame / continueGame / saveSession", () => {
  it("seeds a save, binds the session to the slot, and writes it", () => {
    const fake = new FakeLocalStorage();
    expect(bootWith(fake)).toBeNull();

    const result = startNewGame({ slot: 1 });
    expect(result).toEqual({ ok: true, warning: null, error: null });
    expect(registry.session().slot).toBe(1);
    expect(registry.save().currentNode).toBe(startNodeId(content));
    expect(fake.map.has(slotKey(1))).toBe(true);
    // build-doc §4 step 1 — "copies of every node JSON as live sim state".
    expect(Object.keys(registry.save().nodeStates).sort()).toEqual(
      content.nodes.map((n) => n.id).sort(),
    );
  });

  it("REPORTS a write it could not make instead of swallowing it", () => {
    const fake = new FakeLocalStorage();
    fake.quotaChars = 8;
    bootWith(fake);

    const result = startNewGame({ slot: 2 });
    // The run is live…
    expect(result.ok).toBe(true);
    expect(registry.hasSession()).toBe(true);
    // …and the caller is told, in words it can put on screen, that nothing was stored.
    expect(result.warning).toBeTruthy();
    expect(result.warning).toContain("SLOT 3");
    expect(fake.map.has(slotKey(2))).toBe(false);
  });

  it("continue reopens the stored save, and refuses a slot it cannot read", () => {
    const fake = new FakeLocalStorage();
    bootWith(fake);
    expect(startNewGame({ slot: 0, seed: 4242 }).ok).toBe(true);
    const written = registry.save();
    registry.endSession();

    const ok = continueGame(0);
    expect(ok).toEqual({ ok: true, warning: null, error: null });
    expect(registry.save().seed).toBe(written.seed);
    expect(registry.session().slot).toBe(0);

    fake.map.set(slotKey(1), "{ not json");
    const bad = continueGame(1);
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("SLOT 2");
    // The refused slot did not replace the live session.
    expect(registry.session().slot).toBe(0);
  });

  it("saveSession persists the live save and its RNG positions (build-doc §8.1)", () => {
    const fake = new FakeLocalStorage();
    bootWith(fake);
    expect(startNewGame({ slot: 0 }).ok).toBe(true);

    const tag = balance.rng.subsystemTags[0] as string;
    const stream = registry.streams()[tag];
    expect(stream).toBeDefined();
    for (let i = 0; i < 7; i += 1) stream?.nextFloat();
    const expected = stream?.save();

    const moved: SaveEnvelope = { ...registry.save(), tick: registry.save().tick + 1 };
    registry.setSave(moved);
    expect(saveSession().ok).toBe(true);

    const back = new SaveStorage(registry.storage(), balance).read(0).save;
    expect(back?.tick).toBe(moved.tick);
    expect(back?.rngState?.[tag]).toEqual([expected?.x, expected?.y, expected?.z, expected?.w]);
  });

  it("a store that cannot be reached at all still boots, and says so once", () => {
    const message = bootWith(null);
    expect(message).toBeTruthy();
    expect(registry.storage()).toBeInstanceOf(MemoryStorage);
    // The run is playable, just not persistent.
    expect(startNewGame({ slot: 0 }).ok).toBe(true);
    expect(saveStorage().read(0).state).toBe("ok");
  });

  it("settings are applied to the registry and persisted together", () => {
    const fake = new FakeLocalStorage();
    bootWith(fake);
    expect(registry.settings().textSpeed).not.toBe("instant");
    expect(applySettings({ textSpeed: "instant" }).ok).toBe(true);
    expect(registry.settings().textSpeed).toBe("instant");
    // …and it survives a reboot of the same store.
    registry.reset();
    bootWith(fake);
    expect(registry.settings().textSpeed).toBe("instant");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Routing
 * ──────────────────────────────────────────────────────────────────────────── */

interface Started {
  key: string;
  data: unknown;
}

/** A scene manager with just enough surface for the router, plus a settable key registry. */
function fakeScene(registered: string[]): {
  scene: unknown;
  started: Started[];
  fireCreate: () => void;
  pressEscape: () => void;
} {
  const started: Started[] = [];
  const keys: Record<string, unknown> = {};
  for (const key of registered) keys[key] = true;

  const createHandlers: Array<() => void> = [];
  const escHandlers: Array<() => void> = [];
  const overworld = {
    events: {
      on(event: string, fn: () => void): void {
        if (event === "create") createHandlers.push(fn);
      },
    },
    input: {
      keyboard: {
        on(event: string, fn: () => void): void {
          if (event === "keydown-ESC") escHandlers.push(fn);
        },
      },
    },
    scene: {
      manager: { keys },
      start(key: string, data?: unknown): void {
        started.push({ key, data });
      },
    },
  };

  const scene = {
    scene: {
      manager: { keys },
      start(key: string, data?: unknown): void {
        started.push({ key, data });
      },
      get(key: string): unknown {
        return key === SCENE_KEYS.overworld ? overworld : undefined;
      },
    },
  };

  return {
    scene,
    started,
    fireCreate: () => createHandlers.forEach((fn) => fn()),
    pressEscape: () => escHandlers.forEach((fn) => fn()),
  };
}

type RouterScene = Parameters<typeof enterGameplay>[0];

describe("enterGameplay — the seam that decides whether the game is reachable", () => {
  it("routes to the in-run menu, saying so, while the overworld is unregistered", () => {
    const fake = new FakeLocalStorage();
    bootWith(fake);
    startNewGame({ slot: 0 });

    const rig = fakeScene([SCENE_KEYS.boot, SCENE_KEYS.title, SCENE_KEYS.menu]);
    expect(sceneRegistered(rig.scene as RouterScene, SCENE_KEYS.overworld)).toBe(false);
    enterGameplay(rig.scene as RouterScene);
    expect(rig.started).toEqual([{ key: SCENE_KEYS.menu, data: { mode: "session" } }]);
  });

  it("hands the overworld THIS session — not a fresh save at the default seed", () => {
    const fake = new FakeLocalStorage();
    bootWith(fake);
    startNewGame({ slot: 0, seed: 999 });
    const session = registry.session();

    const rig = fakeScene([SCENE_KEYS.menu, SCENE_KEYS.overworld]);
    enterGameplay(rig.scene as RouterScene);

    expect(rig.started).toHaveLength(1);
    expect(rig.started[0]?.key).toBe(SCENE_KEYS.overworld);
    const data = rig.started[0]?.data as {
      content: Content;
      save: SaveEnvelope;
      streams: unknown;
      startNode: string;
      hooks: { onSaveChanged?: (s: SaveEnvelope) => void };
    };
    expect(data.content).toBe(content);
    expect(data.save).toBe(session.save);
    expect(data.save.seed).toBe(999);
    // The SAME stream objects, so a later saveSession captures the draws the overworld has made.
    expect(data.streams).toBe(session.streams);
    expect(data.startNode).toBe(session.save.currentNode);

    // …and the save the scene hands back is adopted, which is what keeps the menu, the ledger and
    // the epilogue reading one set of numbers.
    const moved: SaveEnvelope = { ...session.save, tick: session.save.tick + 3 };
    data.hooks.onSaveChanged?.(moved);
    expect(registry.save().tick).toBe(moved.tick);
  });

  it("falls back to the menu when there is no session to hand over", () => {
    bootWith(new FakeLocalStorage());
    const rig = fakeScene([SCENE_KEYS.menu, SCENE_KEYS.overworld]);
    expect(registry.hasSession()).toBe(false);
    enterGameplay(rig.scene as RouterScene);
    expect(rig.started[0]?.key).toBe(SCENE_KEYS.menu);
  });

  it("binds ESC in the overworld to the in-run menu — otherwise the region is a one-way street", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0 });
    const rig = fakeScene([SCENE_KEYS.menu, SCENE_KEYS.overworld]);

    enterGameplay(rig.scene as RouterScene);
    rig.fireCreate();
    rig.pressEscape();

    expect(rig.started.map((s) => s.key)).toEqual([SCENE_KEYS.overworld, SCENE_KEYS.menu]);
    expect(rig.started[1]?.data).toEqual({ mode: "session" });
  });

  it("returnToTitle ends the session so the title screen cannot show a stale run", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0 });
    const rig = fakeScene([SCENE_KEYS.title]);
    returnToTitle(rig.scene as RouterScene);
    expect(registry.hasSession()).toBe(false);
    expect(rig.started[0]?.key).toBe(SCENE_KEYS.title);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The registry (game/registry.ts)
 * ──────────────────────────────────────────────────────────────────────────── */

describe("registry — one copy of every fact", () => {
  it("refuses to answer before it has been set, with a sentence rather than undefined", () => {
    expect(() => registry.content()).toThrow(/content has not been set/);
    expect(() => registry.storage()).toThrow(/storage has not been set/);
    expect(() => registry.session()).toThrow(/session has not been set/);
    expect(registry.contentOrNull()).toBeNull();
    expect(registry.sessionOrNull()).toBeNull();
    expect(registry.hasSession()).toBe(false);
  });

  it("balance is READ OFF content, so there is one Balance object in the process", () => {
    registry.setContent(content);
    expect(registry.balance()).toBe(content.balance);
  });

  it("indexes species, nodes and gyms lazily and answers misses with undefined", () => {
    registry.setContent(content);
    const line = content.species[0];
    const node = content.nodes[0];
    const gym = content.gyms[0];
    expect(line && registry.speciesById(line.id)).toBe(line);
    expect(node && registry.nodeById(node.id)).toBe(node);
    expect(gym && registry.gymById(gym.id)).toBe(gym);
    expect(registry.speciesById("not-a-line")).toBeUndefined();
    expect(registry.nodeById("not-a-node")).toBeUndefined();
    expect(registry.gymById("not-a-gym")).toBeUndefined();
    // The index is rebuilt when content is replaced, not cached across it.
    registry.setContent({ ...content, nodes: [] } as Content);
    expect(node && registry.nodeById(node.id)).toBeUndefined();
  });

  it("the clock IS the save's {year, tick} — derived, never stored twice (defect I4's shape)", () => {
    registry.setContent(content);
    const first = content.nodes[0];
    expect(first).toBeDefined();
    const save = newSave(
      { seed: 1, currentNode: first?.id ?? "", nodes: content.nodes },
      balance,
    );
    registry.setStorage(new MemoryStorage());
    registry.startSession({ slot: 0, save, streams: {} });

    expect(registry.clock()).toEqual({ year: save.year, tick: save.tick });
    registry.setSave({ ...save, year: save.year + 2, tick: 9 });
    expect(registry.clock()).toEqual({ year: save.year + 2, tick: 9 });
  });

  it("setSave keeps the slot and the streams the session was opened with", () => {
    registry.setContent(content);
    const first = content.nodes[0];
    const save = newSave({ seed: 1, currentNode: first?.id ?? "", nodes: content.nodes }, balance);
    const streams = {};
    registry.startSession({ slot: 2, save, streams });
    registry.setSave({ ...save, tick: 5 });
    expect(registry.session().slot).toBe(2);
    expect(registry.streams()).toBe(streams);
  });

  it("reset drops everything, including the settings", () => {
    registry.setContent(content);
    registry.setSettings({ textSpeed: "instant" });
    registry.reset();
    expect(registry.contentOrNull()).toBeNull();
    expect(registry.settings().textSpeed).not.toBe("instant");
  });

  it("a session is a copy, so the caller's object cannot be mutated into the registry", () => {
    registry.setContent(content);
    const first = content.nodes[0];
    const save = newSave({ seed: 1, currentNode: first?.id ?? "", nodes: content.nodes }, balance);
    const handed = { slot: 0, save, streams: {} };
    registry.startSession(handed);
    handed.slot = 2;
    expect(registry.session().slot).toBe(0);
  });
});
