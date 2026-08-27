/**
 * tests/unit/survey-scene.test.ts — THE SURVEY SCENE, CLOSED.
 *
 * `tests/unit/survey-view.test.ts` binds everything the survey DRAWS, character for character, and
 * it binds it by calling `game/survey-view.ts` and `game/web-view.ts` directly — the scene class
 * itself has never been instantiated by anything in this suite. That left one question unasked, and
 * it is the question this file exists for: **once the screen is up, can the player get off it?**
 *
 * The answer was no for the ending. `game/boot.ts`'s `onRunComplete` built a `SurveySceneData` with
 * no `onClose`, `SurveyScene.close()` was `this.args.onClose?.()` and nothing else, and the launch
 * was `scene.launch` over a RUNNING overworld — the only full-screen hand-off in the repo that did
 * not pause its parent. So ESC on the epilogue was a no-op, the overworld underneath was still
 * taking WASD and its own ESC, and the last thing a finished run showed the player was a screen
 * with no way out. Build-doc §16 names "Vellsire choice + epilogue survey" as never-cut.
 *
 * SO THIS DRIVES THE REAL PATH, END TO END, and asserts on the OVERWORLD's scene plugin rather
 * than on the survey's own state: `enterGameplay` → the real `onRunComplete` `game/boot.ts` supplies
 * → the `SurveySceneData` it really builds → a real `SurveyScene` initialised from it → the ESC
 * handler `create()` really bound. Nothing in the chain is a stand-in except the engine.
 *
 * WHY `vi.mock("phaser")`. `game/scenes/SurveyScene.ts` does `import Phaser from "phaser"` as a
 * VALUE and extends `Phaser.Scene`, and Phaser cannot be imported under vitest's node environment
 * (`ReferenceError: window is not defined`, from phaser/src/device/OS.js — measured, not assumed).
 * The engine-free scenes take the engine as a factory argument for exactly this reason; this one
 * does not, so the module is swapped instead. The stub is a RECORDER, not a renderer: it remembers
 * which keys were bound and answers the handful of `add.*` calls `redraw()` makes. Every integer on
 * the page still comes from the real `game/survey-view.ts` over real content.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Hoisted above the imports by vitest, so the factory can reach nothing outside itself. The scene
 * hands its own recorder out on `stubKeys` (see `pressKey`), which is how a test reads back what
 * `create()` bound without the stub needing a module-level registry.
 */
vi.mock("phaser", () => {
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

  class StubText {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly text: string,
    ) {}
    setOrigin(): StubText {
      return this;
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
    readonly add = {
      container: (): StubContainer => new StubContainer(),
      graphics: (): Chainable => chainable(),
      text: (x: number, y: number, value: string): StubText => new StubText(x, y, value),
    };
    readonly input = {
      keyboard: {
        on: (event: string, fn: () => void): void => {
          const bound = this.stubKeys.get(event) ?? [];
          bound.push(fn);
          this.stubKeys.set(event, bound);
        },
      },
    };
    readonly events = { on: (): void => undefined };
    readonly scene = {
      manager: { keys: {} as Record<string, unknown> },
      stop: (key?: string): void => {
        this.stubScene.push(`stop:${key ?? "self"}`);
      },
    };
    constructor(_config: unknown) {}
  }

  return {
    default: {
      Scene: StubScene,
      Scenes: { Events: { WAKE: "wake", RESUME: "resume" } },
    },
  };
});

import { validateContent } from "../../core/schemas";
import { seasonAt } from "../../core/clock";
import type { Content } from "../../core/types";
import type { SaveEnvelope } from "../../core/save";
import { finaleNodeId } from "../../game/finale";
import { SCREEN_TEXT, columnBudget, renderSurveyHeader } from "../../game/survey-view";
import {
  SCENE_KEYS,
  enterGameplay,
  installStorage,
  resetContentCache,
  startNewGame,
} from "../../game/boot";
import { registry } from "../../game/registry";
import { SurveyScene, type SurveySceneData } from "../../game/scenes/SurveyScene";

const content: Content = validateContent();

afterEach(() => {
  registry.reset();
  resetContentCache();
});

/* ────────────────────────────────────────────────────────────────────────────
 * The rig — the composition root's real output, recorded
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

interface OverworldRig {
  /** Every scene-plugin call the epilogue made, in order — the whole hand-off as one string list. */
  calls: string[];
  launched: Array<{ key: string; data: unknown }>;
  handle: unknown;
}

/**
 * The overworld as `onRunComplete` sees it: a scene plugin that RECORDS instead of running.
 *
 * `pause`/`resume`/`stop` are recorded rather than stubbed away because they are the assertion —
 * "the overworld is not live underneath the ending" is a claim about this list and nothing else.
 */
function fakeOverworld(registered: readonly string[]): OverworldRig {
  const keys: Record<string, unknown> = {};
  for (const key of registered) keys[key] = true;
  const calls: string[] = [];
  const launched: Array<{ key: string; data: unknown }> = [];
  return {
    calls,
    launched,
    handle: {
      events: { on: (): void => undefined },
      input: { keyboard: { on: (): void => undefined } },
      scene: {
        manager: { keys },
        start: (key: string): void => {
          calls.push(`start:${key}`);
        },
        launch: (key: string, data?: unknown): void => {
          calls.push(`launch:${key}`);
          launched.push({ key, data });
        },
        pause: (): void => {
          calls.push("pause");
        },
        resume: (): void => {
          calls.push("resume");
        },
        stop: (key?: string): void => {
          calls.push(`stop:${key ?? "self"}`);
        },
      },
    },
  };
}

type RunCompleteHook = (save: SaveEnvelope, overworld: unknown) => void;

/**
 * Boot a run, route into gameplay, and fire the ending hook `game/boot.ts` really supplies.
 *
 * `finishTick` is WHERE IN THE YEAR THE RUN ENDED, and it is a parameter because it is the one
 * input the ending's numbers provably do not depend on — `game/finale.ts` `epilogueSeasons` steps
 * whole years from `seasonOrder[0]` whatever the save says — while the season the page was BUILT
 * from was being read off it. See "the season the run ended in" below.
 */
function runToEpilogue(
  registered: readonly string[] = [SCENE_KEYS.menu, SCENE_KEYS.overworld, SCENE_KEYS.survey],
  finishTick?: number,
): {
  overworld: OverworldRig;
  data: SurveySceneData | undefined;
} {
  bootWith(new FakeLocalStorage());
  startNewGame({ slot: 0, seed: 4242 });

  const overworld = fakeOverworld(registered);
  const keys: Record<string, unknown> = {};
  for (const key of registered) keys[key] = true;
  const started: Array<{ key: string; data: unknown }> = [];
  const router = {
    scene: {
      manager: { keys },
      start: (key: string, data?: unknown): void => {
        started.push({ key, data });
      },
      get: (key: string): unknown => (key === SCENE_KEYS.overworld ? overworld.handle : undefined),
    },
  };

  enterGameplay(router as unknown as Parameters<typeof enterGameplay>[0]);
  const routed = started.find((s) => s.key === SCENE_KEYS.overworld)?.data as
    | { hooks: { onRunComplete?: RunCompleteHook } }
    | undefined;
  expect(routed?.hooks.onRunComplete, "nothing supplies the ending hook").toBeDefined();
  const save = registry.save();
  routed?.hooks.onRunComplete?.(
    finishTick === undefined ? save : { ...save, tick: finishTick },
    overworld.handle,
  );

  return { overworld, data: overworld.launched[0]?.data as SurveySceneData | undefined };
}

/** Open a real `SurveyScene` on this data, exactly as Phaser would: `init` then `create`. */
function open(data: SurveySceneData): SurveyScene {
  const scene = new SurveyScene();
  scene.init(data);
  scene.create();
  return scene;
}

/** Fire every handler `create()` bound for a key — the real binding, not a direct `close()` call. */
function pressKey(scene: SurveyScene, event: string): number {
  const bound = (scene as unknown as { stubKeys: Map<string, Array<() => void>> }).stubKeys;
  const handlers = bound.get(event) ?? [];
  for (const fn of handlers) fn();
  return handlers.length;
}

/** What the scene did to its OWN scene plugin — the last-resort stop, when no closer arrived. */
function selfCalls(scene: SurveyScene): string[] {
  return (scene as unknown as { stubScene: string[] }).stubScene;
}

/**
 * Every string the scene DREW on the current page, in draw order.
 *
 * This is the point of driving a real scene rather than calling the renderers: `redraw()` decides
 * which of the strings a renderer produced actually reach a text object, and that decision — not the
 * renderers — is where both of this screen's shipped defects have lived. The background and the web
 * diagram come back as the stub's `Graphics` proxy, which answers every property with a function, so
 * `typeof … === "string"` keeps them out without the stub needing to tag anything.
 */
function drawnText(scene: SurveyScene): string[] {
  const layer = (scene as unknown as { layer: { children: Array<{ text?: unknown }> } }).layer;
  return layer.children.flatMap((child) => (typeof child.text === "string" ? [child.text] : []));
}

/** The top line of the page as a player reads it. */
function heading(scene: SurveyScene): string {
  const first = drawnText(scene)[0];
  expect(first, "the survey drew no text at all").toBeDefined();
  return first ?? "";
}

/**
 * EVERY line of EVERY page the scene browses, in order — the whole ending as the player reads it.
 *
 * `headingsByNode` takes the top line only, which is all the heading defect needed. The season a
 * page is built from never appears on a titled heading at all (`renderSurveyHeading` drops the
 * calendar); it reaches the player further down, in the `breed` column and in the `dormant` /
 * `migrating` / `window <season>` note at the end of a row. So an assertion about the season has to
 * read the rows.
 */
function allDrawnText(scene: SurveyScene): string {
  const start = scene.currentNodeId();
  const out: string[] = [];
  for (let guard = 0; guard <= content.nodes.length; guard += 1) {
    out.push(`── ${scene.currentNodeId()}`, ...drawnText(scene));
    scene.step(1);
    if (scene.currentNodeId() === start) break;
  }
  return out.join("\n");
}

/** Walk every page the scene is browsing, collecting node id → the heading it drew. */
function headingsByNode(scene: SurveyScene): Map<string, string> {
  const start = scene.currentNodeId();
  const seen = new Map<string, string>();
  for (let guard = 0; guard <= content.nodes.length; guard += 1) {
    seen.set(scene.currentNodeId(), heading(scene));
    scene.step(1);
    if (scene.currentNodeId() === start) break;
  }
  return seen;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The ending says which node each page is
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the epilogue survey — twelve pages, and the heading says which node each one is", () => {
  /**
   * ⚠ THE DEFECT. `redraw()` drew `this.args.title ?? renderSurveyHeader(page)`, and that renderer
   * is the ONLY place a node's name appears on this screen. `game/boot.ts` `onRunComplete` passes
   * `title: "EPILOGUE SURVEY"`, so the title REPLACED the name: all twelve pages of the last screen
   * of the run read the same two words, with `3/12  ←/→ node` in the footer as the entire difference
   * between one node and the next — the Sanctum, which the finale is about, among them.
   *
   * It survived every gate because no test in this repo had ever rendered the epilogue's page text.
   * `tests/unit/survey-view.test.ts` asserts what the RENDERERS produce, and the renderers were
   * never wrong; `tests/unit/game-boot.test.ts` asserted `expect(survey.title).toBeTruthy()`, which
   * is the presence of the field that did the erasing. So this drives the real scene over the real
   * ending data and reads the strings back off the text objects.
   */
  it("every page of the ending names the node it is reading", () => {
    const { data } = runToEpilogue();
    expect(data).toBeDefined();
    if (!data) return;
    expect(data.title, "the ending no longer names itself").toBeTruthy();

    const scene = open(data);
    const headings = headingsByNode(scene);

    // The ending browses the whole region — every node the projection covers, none skipped.
    expect(headings.size).toBe(content.nodes.length);
    for (const node of content.nodes) {
      const line = headings.get(node.id);
      expect(line, `the ending has no page for "${node.id}"`).toBeDefined();
      expect(line, `page "${node.id}" does not name the node`).toContain(node.name);
      // The defect stated at its source: the heading was the title and nothing else.
      expect(line, `page "${node.id}" is the title alone`).not.toBe(data.title);
      // …and the screen still says what it is, on every page rather than only the first.
      expect(line?.startsWith(data.title ?? ""), `page "${node.id}" drops the screen's name`).toBe(
        true,
      );
      // Drawn, not merely returned: a line past the budget runs off a 480px canvas unwrapped.
      expect(line?.length, `page "${node.id}" runs off the canvas`).toBeLessThanOrEqual(
        columnBudget(content.balance, SCREEN_TEXT.padPx),
      );
    }

    // Twelve pages that read the same thing are one page shown twelve times.
    expect(new Set(headings.values()).size).toBe(headings.size);

    // Named on its own, because it is the node the never-cut beat is about and it was one of the
    // twelve that read `EPILOGUE SURVEY`.
    const ring = finaleNodeId(content.balance);
    const ringName = content.nodes.find((n) => n.id === ring)?.name ?? "";
    expect(ringName).not.toBe("");
    expect(headings.get(ring), "the ending does not name the Sanctum").toContain(ringName);
  });

  /**
   * THE OTHER HALF: the in-run survey must not have moved.
   *
   * `game/scenes/MenuScene.ts` builds its `SurveySceneData` with no `title`, so this is the branch
   * the survey a player opens mid-run takes, driven through the same real scene. The heading it
   * draws has to be `renderSurveyHeader(page)` character for character — the string
   * `tests/unit/survey-view.test.ts` already asserts everywhere else.
   */
  it("with NO title — the branch the in-run survey takes — the heading is the node header, verbatim", () => {
    const { data } = runToEpilogue();
    expect(data).toBeDefined();
    if (!data) return;
    const untitled = { ...data } as SurveySceneData;
    delete untitled.title;

    const scene = open(untitled);
    for (let i = 0; i < content.nodes.length; i += 1) {
      const page = scene.page();
      expect(page, `no page for "${scene.currentNodeId()}"`).not.toBeNull();
      if (page) expect(heading(scene)).toBe(renderSurveyHeader(page));
      scene.step(1);
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The ending reports the season its own numbers were taken in
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠ THE DEFECT. `game/boot.ts` `onRunComplete` passed
 * `season: seasonOf({ year: save.year, tick: save.tick, … })` — the season the PLAYER stopped in —
 * on scene data whose every count came from `game/finale.ts` `projectEpilogueRegion`, which steps
 * `epilogueSeasons(balance)` = `yearsTotal × seasonOrder` forward: a whole number of years, so the
 * projection lands in the same place from every save. Measured on the shipped balance, four saves
 * differing only in `tick`: one projection (sha `e92439aeee1d`, 1217 individuals) under four
 * different labels.
 *
 * The label is not decoration. `buildSurveyPage` builds the page FROM it — `effectiveRates` runs
 * `core/ecosim.ts` `step` in that season for the `breed` column, and `migrantStatus` decides which
 * rows read `dormant` / `migrating`. The four saves drew four different twelve-node pages over one
 * set of counts: `Reedrick … migrating` for a spring finish, `Reedrick … dormant` for a winter one,
 * off the same number.
 *
 * WHY THE SCENE AND NOT THE SEAM. `tests/unit/game-boot.test.ts` can ask what `onRunComplete` put on
 * the scene data; only a rendered page can say whether the difference reached the player, and that
 * is the claim — the heading drops the calendar for a titled page, so a reader of the data alone
 * would reasonably conclude the season never got to the screen.
 */
describe("the epilogue survey — the season the run ended in is not the season the numbers are from", () => {
  const order = content.balance.clock.seasonOrder;
  const ticksPerSeason = content.balance.clock.ticksPerSeason;

  it("four runs ending in four different seasons draw the SAME twelve pages", () => {
    const runs = order.map((_, i) => {
      const tick = i * ticksPerSeason;
      const { data } = runToEpilogue(undefined, tick);
      expect(data, `the ending launched nothing for tick ${tick}`).toBeDefined();
      return {
        finishedIn: seasonAt(tick, content.balance),
        states: JSON.stringify((data as SurveySceneData).states),
        drawn: allDrawnText(open(data as SurveySceneData)),
      };
    });

    /*
     * THE FIXTURE HAS TO DISCRIMINATE, OR THE REST OF THIS PROVES NOTHING. Both halves are asserted
     * rather than assumed: four ticks that are four different seasons on the player's own clock —
     * the exact value the old code read — over one and only one set of projected numbers.
     */
    expect(
      new Set(runs.map((r) => r.finishedIn)).size,
      "the four ticks are not four different seasons — the test cannot see the defect",
    ).toBe(order.length);
    expect(
      new Set(runs.map((r) => r.states)).size,
      "the projections differ, so a differing page would be honest and this test is wrong",
    ).toBe(1);

    // …so every line the player reads, on all twelve pages, is the same line.
    expect(
      new Set(runs.map((r) => r.drawn)).size,
      "the ending reads differently depending on when the player happened to finish",
    ).toBe(1);
  });

  it("…and the season IS reaching the page — the same numbers under another season read differently", () => {
    /*
     * The other half, and without it the test above passes for the wrong reason: a `SurveyScene`
     * that had stopped consulting the season at all would draw one page from every save too. So the
     * SAME projected states are opened under a season the ending does not report, and the drawn
     * text has to move.
     */
    const { data } = runToEpilogue();
    expect(data).toBeDefined();
    if (!data) return;
    const other = order.find((s) => s !== data.season);
    expect(other, "there is only one season — nothing here can be measured").toBeDefined();
    if (!other) return;

    expect(
      allDrawnText(open({ ...data, season: other })),
      "the season does not change what the survey draws — the ending's label is decoration",
    ).not.toBe(allDrawnText(open(data)));
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The ending is leavable
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the epilogue survey — a run does not end on a screen with no way out", () => {
  it("ESC on the epilogue closes it and puts the player back in the overworld", () => {
    const { overworld, data } = runToEpilogue();
    expect(data, "the epilogue launched nothing").toBeDefined();
    if (!data) return;

    // The defect stated at its source: the ending was built with no closer at all.
    expect(typeof data.onClose, "the epilogue survey is launched with no onClose").toBe("function");

    const scene = open(data);
    expect(pressKey(scene, "keydown-ESC"), "ESC is not bound on the survey").toBe(1);

    /*
     * THE WHOLE HAND-OFF AS ONE LIST. `launch` → `pause` is the protocol every other full-screen
     * hand-off in `game/scenes/OverworldScene.ts` follows (`handOffToBattle`, `playEntry`,
     * `beginYearTurn`); `stop` → `resume` is how each of them comes back. The epilogue did the
     * first half of the first line and nothing else.
     */
    expect(overworld.calls).toEqual([
      `launch:${SCENE_KEYS.survey}`,
      "pause",
      `stop:${SCENE_KEYS.survey}`,
      "resume",
    ]);
  });

  it("the overworld is PAUSED under the ending, before the player can press anything", () => {
    /*
     * Not a restatement of the list above. `Phaser.Input.Keyboard.KeyboardPlugin.isActive()` is
     * `enabled && scene.sys.canInput()`, and a paused scene answers `canInput()` false — so the
     * pause is the only thing that stops the overworld's OWN `keydown-ESC` (bound in
     * `game/boot.ts` `bindSessionMenuKey`, and it calls `scene.start(Menu)`, which SHUTS THE
     * OVERWORLD DOWN) from firing on the same keypress that closes the survey. Asserting it
     * separately says the pause is load-bearing rather than decorative.
     */
    const { overworld } = runToEpilogue();
    expect(overworld.calls).toEqual([`launch:${SCENE_KEYS.survey}`, "pause"]);
  });

  it("the ending never pauses the overworld behind a survey that was not registered", () => {
    /*
     * `scene.launch` on an unregistered key is a console warning and a silent no-op
     * (`game/scene-keys.ts` `sceneRegistered` exists to be asked first). Pausing after one would
     * freeze the player in an overworld with NOTHING drawn over it — strictly worse than the defect
     * being repaired here, so the guard is asserted rather than assumed.
     */
    const { overworld, data } = runToEpilogue([SCENE_KEYS.menu, SCENE_KEYS.overworld]);
    expect(data).toBeUndefined();
    expect(overworld.calls).toEqual([]);
  });

  it("a survey opened with NO closer still leaves the screen when ESC is pressed", () => {
    /*
     * The structural half. `SurveySceneData.onClose` is required, so no typed caller can repeat
     * `game/boot.ts`'s omission — but Phaser starts scenes with `unknown` data and the type is
     * erased at runtime, so `close()` keeps a last resort: take this screen down even when nobody
     * said where to go. A survey that cannot be dismissed is the defect; a survey that dismisses
     * itself to whatever was underneath is not.
     */
    const { data } = runToEpilogue();
    expect(data).toBeDefined();
    if (!data) return;
    const stripped = { ...data } as Partial<SurveySceneData>;
    delete stripped.onClose;

    const scene = open(stripped as SurveySceneData);
    expect(pressKey(scene, "keydown-ESC")).toBe(1);
    expect(selfCalls(scene)).toEqual(["stop:self"]);
  });

  it("closing is the ONLY thing ESC does — the page itself is untouched", () => {
    // Guards the repair against the lazy version of itself: a `close()` that also stepped the
    // cursor, or stopped the scene twice, would pass the list assertions above.
    const { data } = runToEpilogue();
    expect(data).toBeDefined();
    if (!data) return;
    const scene = open(data);
    const before = scene.currentNodeId();
    pressKey(scene, "keydown-ESC");
    expect(scene.currentNodeId()).toBe(before);
    expect(selfCalls(scene), "the scene stopped itself as well as calling the closer").toEqual([]);
  });
});
