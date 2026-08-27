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

import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import type { CaughtIndividual } from "../../core/battle";
import { subsystemRng } from "../../core/rng";
import { ContentValidationError, validateContent } from "../../core/schemas";
import { MemoryStorage, newSave, slotKey, type SaveEnvelope } from "../../core/save";
import type { Balance, Content, NodeState, Season } from "../../core/types";
import { advance, createClock, seasonOf } from "../../core/clock";
import {
  ancientAgeClass,
  buildVellsireBattle,
  epilogueSeasons,
  finaleAncientLine,
  finaleNodeId,
  resolveVellsireCatch,
} from "../../game/finale";
import {
  GAME_PARENT_ID,
  SCENE_KEYS,
  applySettings,
  canvasZoom,
  contentIssues,
  contentProblems,
  continueGame,
  createGameConfig,
  enterGameplay,
  installStorage,
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

describe("contentProblems — the count on screen is the count of PROBLEMS", () => {
  /**
   * The shape `core/schemas.ts` `parseOrCollect` actually pushes: one string per FILE, carrying
   * zod's prettified output, whose newlines it indents by six spaces. Reproduced verbatim from the
   * live failure the C1 verifier photographed (species.json with five bad `metamorphic` values).
   */
  const FIVE_IN_ONE_FILE = new ContentValidationError([
    "species.json: ✖ Invalid input: expected boolean, received string\n" +
      "        → at species[0].metamorphic\n" +
      "      ✖ Invalid input: expected boolean, received string\n" +
      "        → at species[1].metamorphic\n" +
      "      ✖ Invalid input: expected boolean, received string\n" +
      "        → at species[2].metamorphic\n" +
      "      ✖ Invalid input: expected boolean, received string\n" +
      "        → at species[8].metamorphic\n" +
      "      ✖ Invalid input: expected boolean, received string\n" +
      "        → at species[14].metamorphic",
  ]);

  it("splits one file's five zod problems into five entries", () => {
    // THE DEFECT: `contentIssues` returns 1 here, and BootScene printed "1 issue" above a list of
    // five ✖ lines. On the one screen whose entire job is readability, the headline disagreed with
    // what was under it.
    expect(contentIssues(FIVE_IN_ONE_FILE)).toHaveLength(1);
    const problems = contentProblems(FIVE_IN_ONE_FILE);
    expect(problems).toHaveLength(5);
  });

  it("every entry still names its file and keeps its path, on one line", () => {
    for (const problem of contentProblems(FIVE_IN_ONE_FILE)) {
      expect(problem.startsWith("species.json: ✖ ")).toBe(true);
      expect(problem).toContain("→ at species[");
      expect(problem).not.toContain("\n");
    }
    // The five are distinguishable — each names the index it came from.
    expect(new Set(contentProblems(FIVE_IN_ONE_FILE)).size).toBe(5);
  });

  it("leaves an issue with no zod marker exactly as core wrote it", () => {
    // `core/schemas.ts` writes the cross-file invariants itself (G3 sweeps, adjacency, the type
    // chart). Those are one problem each already and must not be reshaped.
    const err = new ContentValidationError([
      'nodes/r1.json: key "rollTable" — encounter weights are DERIVED from populations, never tabled (G3)',
      "gyms.json: gym 2 roster references an unknown line",
    ]);
    expect(contentProblems(err)).toEqual(contentIssues(err));
    expect(contentProblems(new Error("data/ is missing"))).toEqual(["data/ is missing"]);
  });

  it("counts a multi-file failure across every file", () => {
    const err = new ContentValidationError([
      "species.json: ✖ one\n      ✖ two",
      "moves.json: ✖ three",
    ]);
    expect(contentProblems(err)).toEqual([
      "species.json: ✖ one",
      "species.json: ✖ two",
      "moves.json: ✖ three",
    ]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The viewport (build-doc §7.6)
 * ──────────────────────────────────────────────────────────────────────────── */

describe("viewport and canvasZoom", () => {
  const view = { width: balance.map.virtualWidth, height: balance.map.virtualHeight };

  it("the viewport is balance.map's, never a literal", () => {
    expect(viewport()).toEqual({
      width: balance.map.virtualWidth,
      height: balance.map.virtualHeight,
    });
  });

  /**
   * WAS: `expect(zoom).toBeGreaterThanOrEqual(1)` with the fit check wrapped in
   * `if (w >= view.width && h >= view.height)`. That exemption IS the defect: it says, in the test,
   * that a window smaller than the virtual screen may be drawn over. `index.html` sets
   * `overflow:hidden` on html/body, so the overhang is not scrolled to — it is cut off, and on a
   * 375px phone viewport the right 105px of every screen is unreachable. Verified by the C1
   * verifier: window 420×300 → zoom 1 → canvas 480×320 css.
   *
   * The contract now asserted: the canvas ALWAYS fits the window on both axes, and the zoom is a
   * whole number wherever a whole number that fits exists (build-doc §7.6 "integer-scaled").
   */
  it("the canvas fits the window at every size, and is an integer wherever one fits", () => {
    for (const [w, h] of [
      [view.width, view.height],
      [view.width * 3, view.height * 2],
      [view.width * 2 - 1, view.height * 5],
      // The sizes the old exemption waved through.
      [479, 319],
      [420, 300],
      [375, 667],
      [320, 240],
      [100, 100],
      [1, 1],
    ] as const) {
      const zoom = withGlobals({ innerWidth: w, innerHeight: h }, () => canvasZoom(view));
      const at = `${w}x${h}`;
      expect(zoom, at).toBeGreaterThan(0);
      expect(zoom * view.width, `${at} overflows horizontally`).toBeLessThanOrEqual(w);
      expect(zoom * view.height, `${at} overflows vertically`).toBeLessThanOrEqual(h);
      if (w >= view.width && h >= view.height) {
        expect(Number.isInteger(zoom), `${at} is not an integer scale`).toBe(true);
        expect(zoom, at).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("with no window at all it assumes the virtual screen and zooms 1:1", () => {
    // The node/headless case: `innerWidth`/`innerHeight` are absent, so there is nothing to fit to.
    const zoom = withGlobals({ innerWidth: undefined, innerHeight: undefined }, () =>
      canvasZoom(view),
    );
    expect(zoom).toBe(1);
  });

  it("a window exactly 2x the virtual screen zooms to 2, not 2.something", () => {
    const zoom = withGlobals({ innerWidth: view.width * 2, innerHeight: view.height * 2 + 37 }, () =>
      canvasZoom(view),
    );
    expect(zoom).toBe(2);
  });

  it("BINDS — the old clamp would fail the fit law it was exempted from", () => {
    // `Math.max(1, Math.floor(Math.min(w / vw, h / vh)))`, the shipped formula, at 420×300.
    const old = Math.max(1, Math.floor(Math.min(420 / view.width, 300 / view.height)));
    expect(old).toBe(1);
    expect(old * view.width).toBeGreaterThan(420);
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

  it("scales by canvasZoom's answer with Phaser's own centring off", () => {
    const view = { width: balance.map.virtualWidth, height: balance.map.virtualHeight };
    const config = createGameConfig(P, []);
    const scale = config?.scale as { mode: string; autoCenter: string; zoom: number } | undefined;
    expect(scale?.mode).toBe("NONE");
    expect(scale?.autoCenter).toBe("NO_CENTER");
    // The config must not restate the rule — it must be the same answer, at whatever window size
    // the caller happens to be at.
    expect(scale?.zoom).toBe(canvasZoom(view));
    for (const [w, h] of [
      [1512, 771],
      [420, 300],
    ] as const) {
      const zoom = withGlobals({ innerWidth: w, innerHeight: h }, () => {
        const c = createGameConfig(P, []);
        return (c?.scale as { zoom: number }).zoom;
      });
      expect(zoom * view.width, `${w}x${h}`).toBeLessThanOrEqual(w);
      expect(zoom * view.height, `${w}x${h}`).toBeLessThanOrEqual(h);
    }
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
  launched: Started[];
  overworld: unknown;
  /**
   * Every scene-plugin call the overworld received, in order — `launch:Key`, `pause`, `stop:Key`,
   * `resume`.
   *
   * ⚠ ADDED BECAUSE THE RIG COULD NOT SEE THE DEFECT IT WAS SITTING ON. `launched` records WHAT was
   * opened and says nothing about the hand-off around it, so this rig was green while the epilogue
   * survey was launched over a RUNNING overworld — the only full-screen hand-off in the repo that
   * did not pause its parent — and while it was launched with no `onClose` at all, i.e. a screen the
   * player could not leave at the end of the run. A list of calls in order is what makes
   * "`launch` → `pause`, and `stop` → `resume` on the way back" assertable at all.
   */
  sceneCalls: string[];
  fireCreate: () => void;
  pressEscape: () => void;
} {
  const started: Started[] = [];
  const keys: Record<string, unknown> = {};
  for (const key of registered) keys[key] = true;

  const createHandlers: Array<() => void> = [];
  const escHandlers: Array<() => void> = [];
  const launched: Started[] = [];
  const sceneCalls: string[] = [];
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
        sceneCalls.push(`start:${key}`);
      },
      // The epilogue survey is LAUNCHED over the overworld, not started in place of it.
      launch(key: string, data?: unknown): void {
        launched.push({ key, data });
        sceneCalls.push(`launch:${key}`);
      },
      /*
       * The other three quarters of the hand-off protocol. They are RECORDED rather than stubbed
       * away to nothing, because "the overworld is not still live underneath the ending" is a claim
       * about this list and about nothing else the rig can see.
       */
      pause(): void {
        sceneCalls.push("pause");
      },
      resume(): void {
        sceneCalls.push("resume");
      },
      stop(key?: string): void {
        sceneCalls.push(`stop:${key ?? "self"}`);
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
    launched,
    overworld,
    sceneCalls,
    fireCreate: () => createHandlers.forEach((fn) => fn()),
    pressEscape: () => escHandlers.forEach((fn) => fn()),
  };
}

type RouterScene = Parameters<typeof enterGameplay>[0];

/**
 * Route into gameplay, fire the REAL `onRunComplete`, and hand back the states the epilogue survey
 * was actually launched with.
 *
 * Nothing here stands in for the projection: `game/boot.ts` builds the RNG stream, calls
 * `game/finale.ts` `projectEpilogueRegion` and puts the answer on the scene data. The caller supplies
 * the save, which is the input the tests below vary — and the input that could be dropped entirely
 * without a single test noticing.
 */
interface EpilogueData {
  states: Record<string, NodeState>;
  year: number;
  season: Season;
  title?: string;
}

function epilogueDataFor(save: SaveEnvelope): EpilogueData {
  const rig = fakeScene([SCENE_KEYS.menu, SCENE_KEYS.overworld, SCENE_KEYS.survey]);
  enterGameplay(rig.scene as RouterScene);
  const routed = rig.started[0]?.data as {
    hooks: { onRunComplete?: (s: SaveEnvelope, o: unknown) => void };
  };
  expect(routed.hooks.onRunComplete, "nothing supplies the ending hook").toBeDefined();
  routed.hooks.onRunComplete?.(save, rig.overworld);
  const launched = rig.launched[0]?.data as EpilogueData | undefined;
  expect(launched, "the ending launched nothing").toBeDefined();
  return launched as EpilogueData;
}

function epilogueStatesFor(save: SaveEnvelope): Record<string, NodeState> {
  return epilogueDataFor(save).states;
}

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

    // …and the save the scene hands back is adopted, which is what keeps the menu, the survey and
    // the epilogue reading one set of numbers.
    const moved: SaveEnvelope = { ...session.save, tick: session.save.tick + 3 };
    data.hooks.onSaveChanged?.(moved);
    expect(registry.save().tick).toBe(moved.tick);
  });

  /**
   * HARD REQ 7'S ENDING, WIRED — and the reason it had to be tested here rather than in the scene.
   *
   * `OverworldScene.onRunComplete` is the seam the epilogue hangs off. It was DECLARED, fired from
   * one place, and supplied by nobody: every supplier in the repo was a test file, so a player who
   * beat Greaves got `flashBanner("run complete · …")` and no ending at all. `core/ecosim.ts`
   * `projectRegion` — written for this, and saying so in its own header — had zero callers outside
   * a property test, and the only `scene.launch(SCENE_KEYS.survey, …)` anywhere was the in-run
   * menu handing over LIVE state.
   *
   * A scene test cannot catch that: the scene is the thing that DECLARES the hook. Only the
   * composition root can be asked whether anything supplies it.
   */
  it("supplies onRunComplete, and it launches the epilogue survey over a PROJECTED region", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0, seed: 4242 });
    const rig = fakeScene([SCENE_KEYS.menu, SCENE_KEYS.overworld, SCENE_KEYS.survey]);
    enterGameplay(rig.scene as RouterScene);

    const data = rig.started[0]?.data as {
      hooks: { onRunComplete?: (s: SaveEnvelope, o: unknown) => void };
    };
    expect(data.hooks.onRunComplete, "nothing supplies the ending hook").toBeDefined();

    const save = registry.save();
    data.hooks.onRunComplete?.(save, rig.overworld);

    expect(rig.launched.map((l) => l.key)).toEqual([SCENE_KEYS.survey]);
    const survey = rig.launched[0]?.data as {
      content: Content;
      states: Record<string, NodeState>;
      year: number;
      title?: string;
    };
    expect(survey.content).toBe(content);
    expect(survey.year).toBe(save.year);
    /*
     * ⚠ THIS ASSERTION COVERS THE FIELD AND NOT THE SCREEN, AND IT WAS READ AS COVERING BOTH.
     *
     * Its old message was "the epilogue survey does not name itself", which is true of what it
     * checks and was taken for more. `SurveyScene.redraw` drew `this.args.title ?? renderSurveyHeader
     * (page)`, and that renderer is the only string on the screen carrying a NODE's name — so this
     * green certified the presence of the field that erased every one of them: twelve pages reading
     * `EPILOGUE SURVEY`, the Sanctum among them. The scene composes the two now
     * (`game/survey-view.ts` `renderSurveyHeading`), and what the player reads on each of the twelve
     * pages is asserted where the page can actually be rendered —
     * `tests/unit/survey-scene.test.ts`, "every page of the ending names the node it is reading".
     * This one is left at its own strength, saying only what it is evidence of.
     */
    expect(survey.title, "the epilogue survey is launched with no name of its own").toBeTruthy();
    // Every node the region carries is reported, not a subset.
    expect(Object.keys(survey.states).sort()).toEqual(content.nodes.map((n) => n.id).sort());

    /*
     * …AND IT IS A PROJECTION, NOT THE LIVE STATE. This is the half that would have been satisfied
     * by handing over `save.nodeStates` — which is exactly what the in-run menu does and what an
     * ending must not do, because the difference the Vellsire choice makes only exists in the
     * seasons that follow it. Something must have MOVED.
     */
    const live = save.nodeStates;
    const moved = Object.keys(survey.states).some(
      (id) => JSON.stringify(survey.states[id]) !== JSON.stringify(live[id]),
    );
    expect(moved, "the epilogue reported the live region rather than a projected one").toBe(true);
  });

  /**
   * …AND THE PLAYER CAN GET OFF IT. The half the test above does not reach.
   *
   * Everything asserted up there was true of an ending that could not be dismissed: the hook was
   * supplied, the survey was launched, the numbers were a projection — and the `SurveySceneData` it
   * was launched with carried NO `onClose`, over an overworld that was never paused. `SurveyScene`'s
   * `close()` is `onClose` and nothing else, so ESC on the last screen of a finished run did
   * nothing, while the overworld underneath kept its own keys (a paused scene answers
   * `Phaser.Input.Keyboard.KeyboardPlugin.isActive()` false; a running one does not — so the same
   * ESC also reached `bindSessionMenuKey`, which `scene.start(Menu)`s the overworld out from under
   * the survey). Build-doc §16 lists "Vellsire choice + epilogue survey" among the never-cut.
   *
   * `tests/unit/survey-scene.test.ts` drives the real `SurveyScene` over the data this hook builds
   * and presses the real ESC binding. What only THIS file can ask is whether the composition root
   * follows the protocol — and that is a claim about the order of calls on the parent.
   */
  it("the epilogue is a hand-off, not a takeover: launch → pause, and closing it stops and resumes", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0, seed: 4242 });
    const rig = fakeScene([SCENE_KEYS.menu, SCENE_KEYS.overworld, SCENE_KEYS.survey]);
    enterGameplay(rig.scene as RouterScene);
    const data = rig.started[0]?.data as {
      hooks: { onRunComplete?: (s: SaveEnvelope, o: unknown) => void };
    };
    data.hooks.onRunComplete?.(registry.save(), rig.overworld);

    // The overworld is not live under the ending — the protocol every other full-screen hand-off in
    // `game/scenes/OverworldScene.ts` follows (`handOffToBattle`, `playEntry`, `beginYearTurn`).
    expect(rig.sceneCalls, "the epilogue survey was launched over a RUNNING overworld").toEqual([
      `launch:${SCENE_KEYS.survey}`,
      "pause",
    ]);

    const survey = rig.launched[0]?.data as { onClose?: () => void };
    expect(typeof survey.onClose, "the epilogue survey is launched with no way to close it").toBe(
      "function",
    );

    survey.onClose?.();
    expect(rig.sceneCalls.slice(-2), "closing the ending did not give the region back").toEqual([
      `stop:${SCENE_KEYS.survey}`,
      "resume",
    ]);
  });

  it("the ending refuses to pause the overworld behind a survey that is not registered", () => {
    /*
     * `ScenePlugin.launch` on an unregistered key is a `console.warn` and a silent no-op; `pause()`
     * is not. Doing the second after the first fails would leave the player in a frozen overworld
     * with nothing drawn over it and no key that does anything — a hard lock, strictly worse than
     * the dead ESC being repaired. So the guard is asserted, not assumed.
     */
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0, seed: 4242 });
    const rig = fakeScene([SCENE_KEYS.menu, SCENE_KEYS.overworld]);
    expect(sceneRegistered(rig.overworld as RouterScene, SCENE_KEYS.survey)).toBe(false);
    enterGameplay(rig.scene as RouterScene);
    const data = rig.started[0]?.data as {
      hooks: { onRunComplete?: (s: SaveEnvelope, o: unknown) => void };
    };
    data.hooks.onRunComplete?.(registry.save(), rig.overworld);

    expect(rig.launched).toEqual([]);
    expect(rig.sceneCalls, "the overworld was paused with nothing over it").toEqual([]);
  });

  it("the epilogue projection is deterministic — same save, same numbers (L10)", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0, seed: 77 });
    const save = registry.save();
    const run = (): unknown => {
      const rig = fakeScene([SCENE_KEYS.menu, SCENE_KEYS.overworld, SCENE_KEYS.survey]);
      enterGameplay(rig.scene as RouterScene);
      const data = rig.started[0]?.data as {
        hooks: { onRunComplete?: (s: SaveEnvelope, o: unknown) => void };
      };
      data.hooks.onRunComplete?.(save, rig.overworld);
      return (rig.launched[0]?.data as { states: unknown }).states;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  /**
   * …AND THE SEED IS WHAT IT REPLAYS FROM. The half the test above cannot reach.
   *
   * "Same save, same numbers" is true of every deterministic function of the save, including one
   * that ignores the generator entirely: replace `subsystemRng(save.seed, "epilogue")` with a
   * hard-coded stream and it stays green. What it DOES bind is worth keeping — the ending cannot
   * depend on a wall clock, and it cannot depend on call order through a shared generator, both of
   * which turn it red — so it stays, and this states the other half beside it.
   *
   * Two fresh runs at different seeds carry byte-identical `nodeStates` (asserted below, not
   * assumed — a new save's states are the shipped node files), so the SEED is the only input that
   * differs. Measured on the shipped balance: the two projections differ across ten of the twelve
   * nodes.
   */
  it("…and it is drawn from the SAVE's seed — two runs differing only in the seed do not match (L10)", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0, seed: 77 });
    const a = registry.save();
    startNewGame({ slot: 0, seed: 4242 });
    const b = registry.save();

    expect(a.seed).not.toBe(b.seed);
    expect(
      JSON.stringify(a.nodeStates),
      "the two saves differ by more than the seed — this test would not be about the seed",
    ).toBe(JSON.stringify(b.nodeStates));

    expect(
      JSON.stringify(epilogueStatesFor(a)),
      "the ending's numbers do not depend on the save's seed — it is not replaying anything",
    ).not.toBe(JSON.stringify(epilogueStatesFor(b)));
  });

  /**
   * THE CALENDAR THE ENDING REPORTS — and the assertion above is exactly why one was needed here.
   *
   * ⚠ THE DEFECT. `onRunComplete` passed `season: seasonOf({ year: save.year, tick: save.tick, … })`
   * on scene data whose every count came from `projectEpilogueRegion`. That projection steps
   * `epilogueSeasons(balance)` — `yearsTotal × seasonOrder`, a whole number of years — so it lands
   * in the same place from every save: four saves differing ONLY in `tick` produce one projection
   * (measured byte-identical, sha `e92439aeee1d`) under four different labels. The season is not a
   * caption; `game/survey-view.ts` `buildSurveyPage` builds the `breed` column and every
   * `dormant` / `migrating` note FROM it, so those four labels drew four different pages over the
   * one set of numbers (`tests/unit/survey-scene.test.ts` reads them off a rendered scene).
   *
   * The tests already here could not see it. "Same save, same numbers" and "different seed,
   * different numbers" are both claims about `states`, and every one of them stayed green while the
   * label beside those states was wrong for three finishing seasons out of four.
   */
  it("the ending's season does not come off the save — four finishing seasons, one label", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0, seed: 4242 });
    const save = registry.save();
    const { seasonOrder, ticksPerSeason } = balance.clock;
    const ticks = seasonOrder.map((_, i) => i * ticksPerSeason);

    // The fixture discriminates, asserted rather than assumed: these four ticks really are the four
    // different seasons the old code would have read off them.
    expect(
      new Set(ticks.map((tick) => seasonOf({ year: save.year, tick, subTick: 0 }, balance))).size,
      "the four ticks are not four different seasons — this test cannot see the defect",
    ).toBe(seasonOrder.length);

    const endings = ticks.map((tick) => epilogueDataFor({ ...save, tick }));
    expect(
      new Set(endings.map((e) => JSON.stringify(e.states))).size,
      "the projections differ, so a differing label would be honest and this test is wrong",
    ).toBe(1);
    expect(
      new Set(endings.map((e) => e.season)).size,
      "the ending reports the season the player happened to stop in, over numbers taken years later",
    ).toBe(1);
  });

  it("…and the one label is the season the region stands in when the projection stops", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0, seed: 4242 });
    const season = epilogueDataFor(registry.save()).season;

    /*
     * Derived through `core/clock.ts` and not through `game/boot.ts`'s own arithmetic, so this is a
     * second route to the answer rather than a restatement of the first: run the calendar forward
     * over the span the projection actually steps, and ask the clock what season it then reads.
     */
    const span = epilogueSeasons(balance).length * balance.clock.ticksPerSeason;
    expect(span, "the projection steps nothing — there is no span to advance over").toBeGreaterThan(0);
    const landed = advance(createClock(balance), span, balance).clock;
    expect(
      season,
      "the ending's season is not the one the calendar reads after the projection's own span",
    ).toBe(seasonOf(landed, balance));

    /*
     * …and specifically NOT the last season the projection applied, which is the other plausible
     * wrong answer and the one the assertion above is here to exclude. Every survey in this game
     * names the season the sim has NOT stepped yet — `game/scenes/OverworldScene.ts`
     * `handleClockEvents` steps `event.seasonEnded` and the clock then reads the season that has
     * begun — so a page shows the counts as they stand at the START of the season it names. Those
     * counts already have winter in them.
     */
    expect(
      season,
      "the ending names a season its own numbers have already been through",
    ).not.toBe(epilogueSeasons(balance).at(-1));
  });

  /**
   * HARD REQ 7'S ACTUAL SUBJECT: THE DIFFERENCE THE PLAYER'S CHOICE MADE.
   *
   * ⚠ NOTHING BOUND THIS. Replacing `projectEpilogueRegion({ content, save, … })` with
   * `save: { nodeStates: {} }` left all 95 tests in this suite green — and that is not a cosmetic
   * hole. With no states the projection falls back to the shipped node files, `data/nodes/sanctum
   * .json` ships the stag with a count of 1, and the resulting projection is byte-identical to the
   * RELEASED ending (measured). So a player who caught the Vellsire would have read the released
   * region's numbers under `maren.epilogue.caught`'s words, with the suite fully green. The tests
   * that existed asked whether the states had MOVED from the live save — which the shipped-file
   * fallback also satisfies, because six years of seasons move it.
   *
   * So the claim is made about two runs rather than one: same content, same seed, same everything
   * except what happened at the ring. Both saves come out of `game/finale.ts`
   * `resolveVellsireCatch` — the function the finale really resolves through — so the difference
   * between them is the difference the game produces, not one typed in here.
   */
  it("the ending reports THIS run's region: the two Vellsire branches project different numbers", () => {
    bootWith(new FakeLocalStorage());
    startNewGame({ slot: 0, seed: 4242 });
    const base = registry.save();

    const ring = finaleNodeId(balance);
    const stagLine = finaleAncientLine(content, ring);
    expect(stagLine, `no Ancient stands at "${ring}" — there is no choice to make`).not.toBeNull();
    if (!stagLine) return;

    // The individual the SCRIPTED fight really fields (G2 — no species id typed in here).
    const built = buildVellsireBattle({
      content,
      save: base,
      act: balance.acts.last,
      rng: subsystemRng(base.seed, "encounter"),
    });
    const stag: CaughtIndividual = {
      uid: built.enemy.uid,
      lineId: built.enemy.lineId,
      formName: stagLine.formNames[ancientAgeClass()],
      age: ancientAgeClass(),
      level: built.enemy.level,
      traits: built.enemy.traits,
      nodeId: built.nodeId,
      ancient: true,
      metamorphosed: false,
    };
    const caught = resolveVellsireCatch({
      save: base,
      content,
      state: { outcome: "caught" },
      caught: stag,
    });
    const released = resolveVellsireCatch({
      save: base,
      content,
      state: { outcome: "loss" },
      caught: null,
    });
    expect(caught.outcome).toBe("caught");
    expect(caught.problem, "the snare did not move the count it was supposed to").toBeNull();
    expect(released.outcome).toBe("released");

    const endingIfCaught = epilogueStatesFor(caught.save);
    const endingIfReleased = epilogueStatesFor(released.save);

    // 1. TWO ENDINGS, NOT ONE. This is the assertion `save: { nodeStates: {} }` fails: with the
    //    save dropped, both branches project the shipped files and these are the same object twice.
    expect(
      JSON.stringify(endingIfCaught),
      "the ending is the same whichever way the finale went — it is not reading the player's save",
    ).not.toBe(JSON.stringify(endingIfReleased));

    // 2. …AND EACH IS ITS OWN BRANCH'S. "They differ" alone would pass if the two were swapped, or
    //    if the difference came from anywhere but the ring.
    const countAt = (states: Record<string, NodeState>, lineId: string): number => {
      const seen = states[ring]?.populations[lineId]?.count;
      expect(seen, `the projection carries no "${lineId}" at "${ring}"`).toBeTypeOf("number");
      return seen ?? -1;
    };
    expect(
      countAt(endingIfCaught, stagLine.id),
      "the caught ending still has the animal the player took",
    ).toBe(0);
    expect(
      countAt(endingIfReleased, stagLine.id),
      "the released ending lost the animal the player let go",
    ).toBeGreaterThan(0);

    /*
     * 3. …AND THE CHOICE REACHED PAST THE ONE ANIMAL.
     *
     * An Ancient lifts what breeds around it, out to `balance.ecosim.presenceRadiusNodes` hops
     * (build-doc §7.3 step 1), so taking one out of the region shows up on lines the player never
     * touched. That is what makes the ending a report on a region rather than a receipt for a catch,
     * and it is asserted over the WHOLE projection rather than the ring alone because which node the
     * radius reaches is the sim's business, not this test's — measured at the seed pinned above, the
     * moved line is the ring's other one (3 against 6), and at other seeds it is the approach's.
     */
    const downstream: string[] = [];
    for (const nodeId of Object.keys(endingIfReleased)) {
      for (const lineId of Object.keys(endingIfReleased[nodeId]?.populations ?? {})) {
        if (lineId === stagLine.id) continue;
        const withCatch = endingIfCaught[nodeId]?.populations[lineId]?.count ?? -1;
        const without = endingIfReleased[nodeId]?.populations[lineId]?.count ?? -1;
        if (withCatch !== without) downstream.push(`${nodeId}/${lineId} ${withCatch} vs ${without}`);
      }
    }
    expect(
      downstream.length,
      "the only difference the finale made is the missing animal — nothing downstream of it moved",
    ).toBeGreaterThan(0);
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

  it("the clock IS the save's {year, tick, subTick} — derived, never stored twice (defect I4's shape)", () => {
    registry.setContent(content);
    const first = content.nodes[0];
    expect(first).toBeDefined();
    const save = newSave(
      { seed: 1, currentNode: first?.id ?? "", nodes: content.nodes },
      balance,
    );
    registry.setStorage(new MemoryStorage());
    registry.startSession({ slot: 0, save, streams: {} });

    // EVERY field of ClockState, not just the two it had when I4 was found. `subTick` joined the
    // clock when a battle started costing a fraction of a tick, and it is the field a second copy
    // would desync on FIRST — it moves on every fight, where `tick` moves once per two of them.
    expect(registry.clock()).toEqual({
      year: save.year,
      tick: save.tick,
      subTick: save.subTick ?? 0,
    });

    /*
     * Moving the save must move all three. The sub-tick is deliberately set OFF its default: a
     * registry that answered `subTick: 0` from a copy of its own would pass an assertion pinned to
     * the fresh value and fail only in play, which is the exact failure mode I4 was.
     */
    const offBeat = balance.clock.subTicksPerTick - 1;
    expect(offBeat, "subTicksPerTick must exceed 1 for this assertion to bind").toBeGreaterThan(0);
    const moved = { ...save, year: save.year + 2, tick: 9, subTick: offBeat };
    registry.setSave(moved);
    expect(registry.clock()).toEqual({ year: moved.year, tick: moved.tick, subTick: offBeat });
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

/* ────────────────────────────────────────────────────────────────────────────
 * index.html — the pre-module watchdog
 *
 * The one boot failure nothing in `game/` can report: a SYNTAX error in a data/*.json file breaks
 * the module graph before `game/main.ts` runs, so the zod gate never fires and `renderFatalError`
 * is unreachable. Reproduced live — an entirely blank page, no overlay, no console line, because
 * Vite 8's own error overlay crashed while rendering the error too.
 *
 * The guard therefore lives OUTSIDE the module graph, in index.html. That puts it out of reach of a
 * normal import, so these tests read the shipped file, extract the shipped script, and run it — no
 * copy of the logic lives here, and a change to index.html that breaks it turns this red.
 * ──────────────────────────────────────────────────────────────────────────── */

const INDEX_HTML = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

function watchdogSource(): string {
  const m = /<script id="boot-watchdog">([\s\S]*?)<\/script>/.exec(INDEX_HTML);
  if (!m || m[1] === undefined) throw new Error("index.html has no <script id=\"boot-watchdog\">");
  return m[1];
}

class FakeEl {
  id = "";
  #text = "";
  readonly children: FakeEl[] = [];
  constructor(readonly tagName: string) {}
  get textContent(): string {
    return this.#text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(value: string) {
    this.#text = value;
    this.children.length = 0;
  }
  appendChild(node: FakeEl): FakeEl {
    this.children.push(node);
    return node;
  }
}

interface Harness {
  win: Record<string, unknown> & { __trophicBooted?: boolean };
  host: FakeEl;
  errors: string[];
  /** Run the timer that is currently scheduled, if any. */
  tick(): void;
  pending(): number | null;
  dispatch(type: string, event: Record<string, unknown>): void;
}

function runWatchdog(): Harness {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextTimer = 1;
  const errors: string[] = [];
  const host = new FakeEl("div");
  host.id = "game";
  const body = new FakeEl("body");

  const win: Harness["win"] = {
    addEventListener(type: string, fn: (e: unknown) => void): void {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
  };
  const document = {
    getElementById: (id: string): FakeEl | null => (id === "game" ? host : null),
    createElement: (tag: string): FakeEl => new FakeEl(tag),
    createTextNode: (text: string): FakeEl => {
      const n = new FakeEl("#text");
      n.textContent = text;
      return n;
    },
    body,
  };
  const setTimeoutStub = (fn: () => void, ms: number): number => {
    const id = nextTimer;
    nextTimer += 1;
    timers.set(id, { fn, ms });
    return id;
  };
  const clearTimeoutStub = (id: number): void => {
    timers.delete(id);
  };
  const consoleStub = {
    error: (msg: string): void => {
      errors.push(msg);
    },
    warn: (): void => {},
    log: (): void => {},
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function("window", "document", "setTimeout", "clearTimeout", "console", watchdogSource()) as (
    w: unknown,
    d: unknown,
    s: unknown,
    c: unknown,
    con: unknown,
  ) => void;
  run(win, document, setTimeoutStub, clearTimeoutStub, consoleStub);

  return {
    win,
    host,
    errors,
    pending(): number | null {
      const soonest = [...timers.values()].sort((a, b) => a.ms - b.ms)[0];
      return soonest ? soonest.ms : null;
    },
    tick(): void {
      const entries = [...timers.entries()].sort((a, b) => a[1].ms - b[1].ms);
      const first = entries[0];
      if (!first) return;
      timers.delete(first[0]);
      first[1].fn();
    },
    dispatch(type: string, event: Record<string, unknown>): void {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

describe("index.html's pre-module watchdog", () => {
  it("says something on the page when game/main.ts never runs", () => {
    const h = runWatchdog();
    expect(h.host.children).toHaveLength(0); // silent until it fires
    h.tick();

    const shown = h.host.textContent;
    expect(shown).toContain("TROPHIC failed to start");
    expect(shown).toContain("game/main.ts never ran");
    // It names the most likely cause and where to look — the thing the blank page could not say.
    expect(shown).toContain("data/*.json");
    expect(shown).toContain("vite");
    // And the console gets the loud half, tagged like every other project line.
    expect(h.errors.join("\n")).toContain("[trophic]");
  });

  it("stays silent once game/main.ts has set the flag", () => {
    const h = runWatchdog();
    h.win.__trophicBooted = true;
    h.tick();
    expect(h.host.children).toHaveLength(0);
    expect(h.errors).toHaveLength(0);
  });

  it("a script error brings the check forward and is quoted on the page", () => {
    const h = runWatchdog();
    const slow = h.pending();
    h.dispatch("error", { message: "Failed to fetch dynamically imported module: /game/main.ts" });
    const fast = h.pending();
    expect(fast).not.toBeNull();
    expect(fast as number).toBeLessThan(slow as number);
    h.tick();
    expect(h.host.textContent).toContain("Failed to fetch dynamically imported module");
  });

  it("a failed IMAGE does not bring it forward — that is not a dead boot", () => {
    // Resource errors bubble to window in the capture phase. Shortening the wait on a missing PNG
    // would put this panel over a game that was about to start perfectly well.
    const h = runWatchdog();
    const slow = h.pending();
    h.dispatch("error", { target: { tagName: "IMG", src: "/assets/final/maps/r1.png" } });
    expect(h.pending()).toBe(slow);
  });

  it("fires once, not once per error", () => {
    const h = runWatchdog();
    h.dispatch("error", { message: "one" });
    h.dispatch("error", { message: "two" });
    h.tick();
    const first = h.host.textContent;
    h.tick();
    expect(h.host.textContent).toBe(first);
    expect(h.errors).toHaveLength(1);
    expect(first).toContain("one");
    expect(first).toContain("two");
  });

  it("game/main.ts sets the flag the watchdog reads, at module top level", () => {
    // A rename on either side silently disarms the guard, and the failure it guards is invisible by
    // definition — so the two spellings are asserted against each other rather than trusted.
    const main = readFileSync(new URL("../../game/main.ts", import.meta.url), "utf8");
    expect(main).toContain("__trophicBooted");
    expect(watchdogSource()).toContain("window.__trophicBooted");
    // Above `start()`: it is a claim about the graph having loaded, not about the game starting.
    expect(main.indexOf("__trophicBooted")).toBeLessThan(main.indexOf("function start("));
  });

  it("the page background is palette swatch c00, not a colour of its own", () => {
    // Static HTML cannot read data/palette.json, so the hand-copy is checked here instead of
    // trusted — a palette re-freeze that moves c00 turns this red rather than leaving the letterbox
    // a different colour from every asset in front of it.
    const c00 = content.palette.colors.find((c) => c.id === "c00");
    expect(c00).toBeDefined();
    const css = /html, body \{[^}]*background: (#[0-9a-f]{6})/i.exec(INDEX_HTML);
    expect(css?.[1]?.toLowerCase()).toBe(c00?.hex.toLowerCase());
  });
});
