/**
 * tests/unit/overworld-prop-hud.test.ts — [E] PRESSED ON A PROP, AND WHAT THE SCREEN THEN SAYS.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Nothing anywhere pressed [E] while standing on a prop and asserted that a box opened. Measured
 * across the whole suite before it:
 *
 *   • `tests/unit/props.test.ts` calls `propDialogueFor` directly — a helper, not a keypress, and
 *     it would stay green with `OverworldScene.interact` deleted;
 *   • `overworld-scene.test.ts` §15 presses [E] near a prop to prove the ARRIVAL TILE is CLEAR of
 *     props, i.e. it asserts the inverse: that a prop did NOT answer;
 *   • `tests/gates/reachability.test.ts` proves the `prop` KIND has a live selector somewhere in
 *     `game/`, which is a corpus-level fact and not a fact about this key.
 *
 * So the green proved placement, radii and selector resolution. It did not prove that pressing the
 * key on a stone opens the stone's box, and if that path broke nothing would have reddened.
 *
 * Three player-visible defects were then measured by driving the real scene, and every one of them
 * is a claim this file now holds:
 *
 *   §Q1 [E] on a shipped prop hands the box `prop.<id>` — the press, not the helper;
 *   §Q2 the HUD advertises exactly what that press will do. A stone whose entry has latched itself
 *       shut (the latch is deliberate: it is what stops a chain flag being written twice) used to be
 *       advertised as `[E] read <label>` and then answered with "— nothing more to read";
 *   §Q3 a quest whose objective is satisfied but not yet reported is ON the tracker, with the giver
 *       named. Measured before: `quests 0/10 closed · open fallow-field` before the year turned and
 *       `quests 0/10 closed` after it — the readout said LESS once the work was done, because
 *       `questReports` moves that quest to stage `turnedIn` and the HUD drew only `open`/`done`;
 *   §Q4 what a beat WROTE is reported in the corpus's words. Measured before: reading the antler
 *       stone on Meadow Reach flashed `antler stone on the north rise · chain.vellsire.step2
 *       trail.stone.r1` — two dotted flag keys, one event, straight after a hand-written paragraph.
 *
 * NOTHING BELOW SETS A QUEST FLAG, A CHAIN FLAG OR A TRAIL FLAG BY HAND. The offer is taken by
 * pressing [E] on the giver, the year is turned by resting at the inn, the sign cards are earned by
 * real foray steps, and the stone is read by walking onto it and pressing the key. A precondition is
 * only real if something outside the test produces it.
 *
 * The stub is the one `tests/unit/overworld-scene.test.ts` uses, verbatim: a RECORDER, not a
 * renderer. Display objects remember what was written to them, timers and tweens are queued rather
 * than run, and there is no wall clock and no `Math.random` (G11).
 */

import { describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════════════════════
 * The stub engine
 * ════════════════════════════════════════════════════════════════════════════ */

interface FakeObj {
  kind: string;
  x: number;
  y: number;
  visible: boolean;
  alpha: number;
  text: string;
  texture: string;
  wordWrapWidth: number | null;
  /**
   * What `setDisplaySize` was last told, or null.
   *
   * RECORDED RATHER THAN LEFT TO THE PROXY, because the size a real texture is drawn at is a
   * correctness property and not a cosmetic one: a room's painting has to cover exactly the
   * rectangle its ASCII plan describes or the walls stop lining up with what the player can walk
   * through, and `MapView` has the same relationship to the 2048² world. A chainable no-op records
   * nothing, so §16's sizing assertion would have passed against a call that never happened.
   */
  displaySize: { w: number; h: number } | null;
  destroyed: boolean;
  self?: FakeObj;
  destroy(): void;
  [key: string]: unknown;
}

interface FakeKey {
  isDown: boolean;
  justDown: boolean;
}

interface FakeLaunch {
  key: string;
  data: unknown;
}

interface FakeParts {
  objects: FakeObj[];
  launches: FakeLaunch[];
  starts: FakeLaunch[];
  stops: string[];
  paused: number;
  resumed: number;
  /**
   * Whether THIS scene would be running in Phaser — and therefore whether it gets an `update` and
   * a live `InputPlugin` at all.
   *
   * ⚠ A COUNTER CANNOT ANSWER THAT QUESTION, AND FOR A WHILE THIS FILE ONLY HAD THE COUNTER.
   * `Systems.pause`/`Systems.resume` (node_modules/phaser/src/scene/Systems.js) flip a BOOLEAN
   * `settings.active`: the last operation to reach the scene wins, and pausing an already-paused
   * scene is not a second pause, it is a `console.warn('Cannot pause non-running Scene')`. So
   * `paused === resumed` is not evidence that anybody has the screen back — the run that ends
   * `…resume, pause` is balanced by count and DEAD on screen, which is exactly the shape the
   * softlock had. This field is the thing the player experiences; the counters stay for the tests
   * that are about how many times a scene was handed over.
   */
  active: boolean;
  /**
   * `launch`ed / `stop`ped, per scene key — the OTHER half of the same question.
   *
   * Phaser processes `ScenePlugin` calls as an ordered queue (`SceneManager.processQueue`), so a
   * `stop` that arrives after a `launch` on the same key shuts the freshly started scene down. That
   * ordering is not decoration: `DialogueScene.finish()` calls `onDone(state)` and THEN
   * `this.scene.stop()`, so every box closes with a trailing self-stop that lands after whatever
   * the overworld did inside `onDone`. `answerBox` replays both halves.
   */
  sceneStatus: Map<string, "running" | "shutdown">;
  keysByCode: Map<number, FakeKey>;
  cursors: Record<string, FakeKey>;
  /** Pixels `readMaskPixels` will find for a mask texture key. */
  maskPixels: Map<string, { width: number; height: number; data: Uint8ClampedArray }>;
  /** Every `textures.remove` call, with whether the key existed AT THAT MOMENT. */
  removes: Array<{ key: string; existed: boolean }>;
  /** Scratch canvases the code created and has not removed. */
  scratch: Set<string>;
  registeredScenes: Record<string, unknown>;
}

const STUB = { parts: null as FakeParts | null };

vi.mock("phaser", () => {
  const make = (kind: string, bag: FakeObj[]): FakeObj => {
    const o = {
      kind,
      x: 0,
      y: 0,
      visible: true,
      alpha: 1,
      text: "",
      texture: "",
      wordWrapWidth: null as number | null,
      displaySize: null as { w: number; h: number } | null,
      destroyed: false,
      setVisible(v: boolean): FakeObj {
        o.visible = v;
        return o.self as FakeObj;
      },
      setText(t: string | string[]): FakeObj {
        o.text = Array.isArray(t) ? t.join("\n") : t;
        return o.self as FakeObj;
      },
      setAlpha(a: number): FakeObj {
        o.alpha = a;
        return o.self as FakeObj;
      },
      setPosition(x: number, y: number): FakeObj {
        o.x = x;
        o.y = y;
        return o.self as FakeObj;
      },
      setWordWrapWidth(w: number): FakeObj {
        o.wordWrapWidth = w;
        return o.self as FakeObj;
      },
      setDisplaySize(w: number, h: number): FakeObj {
        o.displaySize = { w, h };
        return o.self as FakeObj;
      },
      /*
       * RECORDED, for `displaySize`'s reason a third time, and this one is the sharpest of the
       * three. `add.image(x, y, key)` captures the key an object was BORN with; the key it is
       * CURRENTLY showing is whatever the last `setTexture` said. Left to the chainable-no-op proxy,
       * `setTexture` records nothing at all — so §21's whole claim ("the player never turns: the
       * drawn texture is the forward-facing one whichever way they walk") would have been asserted
       * against the constructor argument, and a directional swap reinstated in `syncPlayerSprite`
       * would have passed it without a murmur. Verified by sabotage: with this method left to the
       * proxy, swapping the view per `movement.facing` keeps §21 green.
       */
      setTexture(key: string): FakeObj {
        o.texture = key;
        return o.self as FakeObj;
      },
      /*
       * RECORDED, for `setTexture`'s reason exactly — and this one is now the sharper of the pair,
       * because the mirror is what the player's six retired walk frames were REPLACED BY. build-doc
       * §9.6 step 4's bob is "y = 2px sine per tile step, 1px lateral sway, horizontal flip
       * alternation", and the third term is the one that makes the motion read as a skip rather than
       * a float. Left to the chainable-no-op proxy, `setFlipX` records nothing, so §21.4's whole
       * claim would be asserted against a call that never happened — and deleting the flip from
       * `syncPlayerSprite` would keep it green. Verified by sabotage: it does.
       */
      flipX: false,
      setFlipX(v: boolean): FakeObj {
        o.flipX = v;
        return o.self as FakeObj;
      },
      /*
       * RECORDED RATHER THAN LEFT TO THE PROXY, for `displaySize`'s reason one layer up: WHERE in
       * the display list an object sits is a correctness property when the object's whole job is
       * to cover what is under it. A blackout curtain drawn below the HUD is a black screen with
       * sixteen lines of diagnostics legible on top of it, which is not a black screen — and a
       * chainable no-op records nothing, so that assertion would pass against a depth never set.
       */
      depth: 0,
      setDepth(d: number): FakeObj {
        o.depth = d;
        return o.self as FakeObj;
      },
      destroy(): void {
        o.destroyed = true;
        const at = bag.indexOf(o.self as FakeObj);
        if (at >= 0) bag.splice(at, 1);
      },
    } as unknown as FakeObj;
    // Unknown methods are chainable no-ops — the same discipline C3's stub uses, so a drawing call
    // added by a shared module (game/placeholder.ts) does not break this file.
    const proxy: FakeObj = new Proxy(o, {
      get(target, prop, receiver): unknown {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === "symbol" || prop === "then") return undefined;
        return (): FakeObj => proxy;
      },
    });
    o.self = proxy;
    bag.push(proxy);
    return proxy;
  };

  class Scene {
    readonly __fake: FakeParts;
    readonly add: Record<string, (...args: never[]) => unknown>;
    readonly cameras: { main: Record<string, (...args: never[]) => unknown> };
    readonly scale: { width: number; height: number };
    readonly input: { keyboard: unknown };
    readonly tweens: { add(c: unknown): unknown; killTweensOf(t: unknown): void };
    readonly time: { delayedCall(ms: number, run: () => void): unknown };
    readonly load: Record<string, (...args: never[]) => unknown>;
    readonly textures: Record<string, (...args: never[]) => unknown>;
    readonly scene: Record<string, unknown>;
    readonly events: { on(): void; once(): void };

    constructor(_key?: string) {
      const parts: FakeParts = {
        objects: [],
        launches: [],
        starts: [],
        stops: [],
        paused: 0,
        resumed: 0,
        active: true,
        sceneStatus: new Map<string, "running" | "shutdown">(),
        keysByCode: new Map(),
        cursors: {
          up: { isDown: false, justDown: false },
          down: { isDown: false, justDown: false },
          left: { isDown: false, justDown: false },
          right: { isDown: false, justDown: false },
        },
        maskPixels: new Map(),
        removes: [],
        scratch: new Set<string>(),
        registeredScenes: { Overworld: {}, Battle: {}, YearTurn: {} },
      };
      // The most recently constructed scene is the one under test.
      STUB.parts = parts;
      this.__fake = parts;

      this.add = {
        image: ((x: number, y: number, key: string): FakeObj => {
          const o = make("image", parts.objects);
          o.x = x;
          o.y = y;
          o.texture = key;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        text: ((x: number, y: number, value: string | string[]): FakeObj => {
          const o = make("text", parts.objects);
          o.x = x;
          o.y = y;
          o.text = Array.isArray(value) ? value.join("\n") : value;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        graphics: ((): FakeObj => make("graphics", parts.objects)) as unknown as (...args: never[]) => unknown,
        /*
         * ⚠ SIZE AND FILL ARE RECORDED, because on THIS screen a rectangle is not one thing.
         * `game/ui/SeasonMeter.ts` builds one small cell per `clock.ticksPerYear` — fifty-two of
         * them — so "a rectangle exists" says nothing at all here. What the blackout curtain is
         * can only be stated as a shape: the whole virtual screen, filled with the palette's
         * `void`. A recorder that dropped the constructor arguments could not tell the two apart.
         */
        rectangle: ((x: number, y: number, w: number, h: number, fill?: number): FakeObj => {
          const o = make("rect", parts.objects);
          o.x = x;
          o.y = y;
          o.rectW = w;
          o.rectH = h;
          o.fillColor = fill ?? null;
          return o;
        }) as unknown as (...args: never[]) => unknown,
      };

      this.cameras = {
        main: new Proxy(
          {},
          {
            get(): unknown {
              return (): void => undefined;
            },
          },
        ) as Record<string, (...args: never[]) => unknown>,
      };

      // build-doc §7.6's virtual resolution, so the HUD-width test measures the real screen.
      this.scale = { width: 480, height: 320 };

      this.input = {
        keyboard: {
          createCursorKeys: (): Record<string, FakeKey> => parts.cursors,
          addKey: (code: number): FakeKey => {
            const existing = parts.keysByCode.get(code);
            if (existing) return existing;
            const key: FakeKey = { isDown: false, justDown: false };
            parts.keysByCode.set(code, key);
            return key;
          },
          on: (): void => undefined,
        },
      };

      this.tweens = { add: (): unknown => ({ remove: (): void => undefined }), killTweensOf: (): void => undefined };
      this.time = { delayedCall: (): unknown => ({ remove: (): void => undefined }) };
      /*
       * ⚠ `start()` MUST EMIT `complete`, AND A BLANKET NO-OP PROXY HERE HANGS EVERY TRAVEL TEST.
       * `game/mapview.ts`'s `ensureNodeArt` — which `travelTo` awaits — resolves its promise from
       * `scene.load.once(Phaser.Loader.Events.COMPLETE, …)` after `scene.load.start()`. When every
       * property of this double was a no-op the listener was never stored and never called, so the
       * awaited promise never settled and seven tests died at the 30s timeout.
       *
       * Emitting synchronously is not a convenience, it is the platform: real `LoaderPlugin.start`
       * calls `loadComplete()` inline when the queue is empty, and `loadComplete` ends by emitting
       * `COMPLETE` — which also fires when files FAILED (they only raise `totalFailed`). So a
       * loader that always answers `start` with `complete` is the honest double, not a lenient one.
       *
       * `textures.exists` deliberately still says NO for anything queued through `load.image`: this
       * stub loads nothing, so the maps stay on game/placeholder.ts's Graphics fallback, which is
       * what every §5/§6 assertion below is written against.
       */
      const loadComplete: Array<() => void> = [];
      this.load = new Proxy(
        {
          once: (event: string, run: () => void): void => {
            if (event === Phaser.Loader.Events.COMPLETE) loadComplete.push(run);
          },
          start: (): void => {
            for (const run of loadComplete.splice(0)) run();
          },
        } as Record<string, unknown>,
        {
          get(target, prop, receiver): unknown {
            if (prop in target) return Reflect.get(target, prop, receiver);
            return (): void => undefined;
          },
        },
      ) as Record<string, (...args: never[]) => unknown>;

      this.textures = {
        exists: ((key: string): boolean =>
          parts.maskPixels.has(key) || parts.scratch.has(key)) as unknown as (...args: never[]) => unknown,
        get: ((key: string): unknown => ({
          getSourceImage: (): unknown => {
            const px = parts.maskPixels.get(key);
            return { width: px?.width ?? 0, height: px?.height ?? 0, __key: key };
          },
        })) as unknown as (...args: never[]) => unknown,
        // Real Phaser logs `warning: No texture found matching key: …` for a key that was never
        // added. Recording the existence AT CALL TIME is what lets a test see that warning happen.
        remove: ((key: string): void => {
          parts.removes.push({ key, existed: parts.maskPixels.has(key) || parts.scratch.has(key) });
          parts.scratch.delete(key);
        }) as unknown as (...args: never[]) => unknown,
        // Only the scratch canvas is real; everything else returns null so game/placeholder.ts
        // takes its Graphics fallback, which is what happens in a browser with no 2D context.
        createCanvas: ((key: string, w: number, h: number): unknown => {
          if (!key.endsWith(":scratch")) return null;
          parts.scratch.add(key);
          let drawn: string | null = null;
          return {
            context: {
              drawImage: (source: { __key?: string }): void => {
                drawn = source.__key ?? null;
              },
              getImageData: (): { width: number; height: number; data: Uint8ClampedArray } => {
                const px = drawn === null ? undefined : parts.maskPixels.get(drawn);
                if (!px) return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
                return px;
              },
            },
          };
        }) as unknown as (...args: never[]) => unknown,
      };

      this.scene = {
        manager: { keys: parts.registeredScenes },
        launch: (key: string, data: unknown): void => {
          parts.launches.push({ key, data });
          parts.sceneStatus.set(key, "running");
        },
        start: (key: string, data: unknown): void => {
          parts.starts.push({ key, data });
        },
        stop: (key: string): void => {
          parts.stops.push(key);
          parts.sceneStatus.set(key, "shutdown");
        },
        pause: (): void => {
          parts.paused += 1;
          parts.active = false;
        },
        resume: (): void => {
          parts.resumed += 1;
          parts.active = true;
        },
        get: (): unknown => undefined,
      };

      this.events = { on: (): void => undefined, once: (): void => undefined };
    }
  }

  const Phaser = {
    Scene,
    Input: {
      Keyboard: {
        /*
         * ⚠ `E` AND `X` WERE MISSING, AND THAT SILENTLY DISARMED TWO KEYS FOR THE WHOLE FILE.
         * `OverworldScene.create` binds them with `keyboard.addKey(codes.E)` / `codes.X`; an absent
         * member makes that `addKey(undefined)`, which registers under the key `undefined` — so
         * `press(69)` found nothing and `interact()` was unreachable from any test here. The talk
         * key is the one the entire quest layer is driven through.
         */
        KeyCodes: {
          W: 87, A: 65, S: 83, D: 68, C: 67, E: 69, G: 71, R: 82, X: 88,
          ONE: 49, TWO: 50, THREE: 51, FOUR: 52, FIVE: 53, SIX: 54,
        },
        JustDown: (key: FakeKey): boolean => {
          if (!key.justDown) return false;
          key.justDown = false;
          return true;
        },
      },
    },
    Loader: { Events: { COMPLETE: "complete" } },
  };
  return { default: Phaser, ...Phaser };
});

/* ── imports that must come AFTER vi.mock ─────────────────────────────────── */

import { startBattle } from "@core/battle";
import { DIALOGUE, speakerById, type DialogueEntry } from "@core/dialogue-schema";
import { cellRollsEncounters } from "@core/foodweb";
import { questDefinitions } from "@core/quests";
import { newSave, openStreams, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Balance, Content, NodeFile, PropPlacement } from "@core/types";
import { propDialogueFor, runHeadless, transcript, type DialogueRunState } from "@game/dialogue-runner";
import { encounterMaskFor } from "@game/encounters";
import { createMovement, movementConfig, placeAt, spriteWorldPosition } from "@game/movement";
import { propAt, propLabel, propsOf, type WorldPoint } from "@game/props";
import { linesMetAt, questReports, writeLabels } from "@game/quests";
import { SCENE_KEYS } from "@game/scene-keys";
import type { BattleSceneData } from "@game/scenes/BattleScene";
import type { DialogueSceneData } from "@game/scenes/DialogueScene";
import { OverworldScene, type OverworldSceneData } from "@game/scenes/OverworldScene";
import { finishYearTurn, type YearTurnSceneData } from "@game/scenes/YearTurnScene";
import { provisionalStarter } from "@game/wild-battle";

const content: Content = validateContent();
const balance: Balance = content.balance;

/** The keys this file presses, by the code `OverworldScene.create` binds them under. */
const KEY_E = 69;
const KEY_R = 82;

/** One millisecond per tile, so one frame is one whole step and a test can count them. */
const MS_PER_TILE = 1;

/** The node the vertical slice starts at (build-doc §1). Derived, never typed in (G2). */
const SLICE_NODE = content.nodes.find((n) => n.walkable)?.id ?? content.nodes[0]!.id;

function freshSave(nodeId = SLICE_NODE): SaveEnvelope {
  const save = newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);
  const starter = provisionalStarter(content);
  return starter ? { ...save, party: [starter] } : save;
}

interface Harness {
  scene: OverworldScene;
  parts: FakeParts;
  /** Run one frame at the configured pace. A paused scene gets none — see `overworld-scene.test.ts`. */
  frame(ms?: number): void;
  hold(dir: "up" | "down" | "left" | "right", down?: boolean): void;
  press(code: number): void;
  hud(): string;
}

function mount(over: Partial<OverworldSceneData> = {}): Harness {
  const data: OverworldSceneData = { content, save: over.save ?? freshSave(), msPerTile: MS_PER_TILE, ...over };
  const scene = new OverworldScene();
  const streams = data.streams ?? openStreams(data.save as SaveEnvelope, balance);
  scene.init({ ...data, streams });
  scene.create();
  const parts = STUB.parts as FakeParts;
  return {
    scene,
    parts,
    frame(ms = MS_PER_TILE) {
      if (!parts.active) return;
      scene.update(0, ms);
    },
    hold(dir, down = true) {
      parts.cursors[dir]!.isDown = down;
    },
    press(code) {
      const key = parts.keysByCode.get(code);
      if (key) key.justDown = true;
    },
    hud() {
      return parts.objects.filter((o) => o.kind === "text").map((o) => o.text).join("\n");
    },
  };
}

/** Register C7's box, so a beat is HANDED TO IT rather than played headlessly. */
function withDialogueBox(h: Harness): void {
  h.parts.registeredScenes[SCENE_KEYS.dialogue] = {};
}

/** Every entry the box has been handed, in order. */
function boxed(h: Harness): string[] {
  return h.parts.launches
    .filter((l) => l.key === SCENE_KEYS.dialogue)
    .map((l) => (l.data as DialogueSceneData).entryId);
}

/** Whether a box is on screen right now — launched, and not stopped since. */
function boxIsUp(h: Harness): boolean {
  return h.parts.sceneStatus.get(SCENE_KEYS.dialogue) === "running";
}

/**
 * Answer the box the way `DialogueScene` answers it: play the run out, hand the state back, and THEN
 * let the box stop itself — the trailing self-stop `DialogueScene.finish()` queues one statement
 * after `onDone` returns.
 */
function answerBox(h: Harness, pick: (s: DialogueRunState, c: readonly string[]) => number = () => 0): string {
  const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.dialogue).pop();
  if (!launch) throw new Error("nothing was handed to the dialogue box");
  if (!boxIsUp(h)) {
    throw new Error(
      `the box was handed "${(launch.data as DialogueSceneData).entryId}" and then shut down before ` +
        `anybody could answer it — in the game that is a beat nobody sees`,
    );
  }
  h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
  const data = launch.data as DialogueSceneData;
  data.onDone(runHeadless(data.file ?? DIALOGUE, data.entryId, pick));
  h.parts.stops.push(SCENE_KEYS.dialogue);
  h.parts.sceneStatus.set(SCENE_KEYS.dialogue, "shutdown");
  if (h.scene.isSpeaking()) h.frame();
  return data.entryId;
}

/**
 * Every text object the action REWROTE — the banner, identified by what changed rather than by
 * creation order.
 *
 * ⚠ `h.hud()` JOINS EVERY TEXT OBJECT, INCLUDING THE BANNER, so a `toContain` there cannot tell the
 * HUD's own advertisement apart from the banner echo of the same sentence — and §Q2 is precisely the
 * assertion that the two agree. Objects created DURING the action are ignored: a fresh object has no
 * "before" to have changed from. Copied from `overworld-scene.test.ts` §18, which needs it for the
 * same reason about `[X]`.
 */
function saidBy(h: Harness, act: () => void): string[] {
  const before = new Map(h.parts.objects.filter((o) => o.kind === "text").map((o) => [o, o.text] as const));
  act();
  return h.parts.objects
    .filter((o) => o.kind === "text" && before.has(o) && before.get(o) !== o.text)
    .map((o) => o.text);
}

/** The HUD's `[E]` line as it reads RIGHT NOW — the advertisement, with no banner mixed into it. */
function interactLine(h: Harness): string {
  const line = h.hud().split("\n").find((l) => l.startsWith("[E] "));
  expect(line, "the HUD has no [E] line at all — the talk key is not advertised").toBeDefined();
  return line as string;
}

/** The HUD's quest-tracker line as it reads right now. */
function questLine(h: Harness): string {
  const line = h.hud().split("\n").find((l) => l.startsWith("quests "));
  expect(line, "the HUD has no quest line at all").toBeDefined();
  return line as string;
}

/* ── settling whatever a frame hands the overworld over to ─────────────────── */

type BattleSceneState = Parameters<BattleSceneData["onFinished"]>[0]["state"];

/**
 * The state `BattleScene` would hand back for a fight that ended this way — the REAL battlers, uids
 * and orders `core/battle.ts` `startBattle` builds from the launcher's own input, carrying the
 * reducer's terminal invariant for that outcome. A fake with no `playerOrder` is not a fight the
 * reducer could have produced; it is a `TypeError` inside `applyBattleResult`.
 */
function settledState(data: BattleSceneData, outcome: "win" | "loss" | "fled" | "caught"): BattleSceneState {
  const started = startBattle(data.input, data.ctx).state;
  const down = outcome === "loss" ? started.playerOrder : outcome === "win" ? started.enemyOrder : [];
  const battlers = { ...started.battlers };
  for (const uid of down) {
    const battler = battlers[uid];
    if (!battler) continue;
    battlers[uid] = { ...battler, curHp: 0, fainted: true };
  }
  return { ...started, battlers, outcome };
}

function settleBattle(h: Harness, outcome: "win" | "loss" | "fled" = "fled"): boolean {
  const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
  if (!launch) return false;
  h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
  const data = launch.data as BattleSceneData;
  data.onFinished({ state: settledState(data, outcome), caught: null });
  return true;
}

/**
 * Answer a launched year-turn sequence, so the overworld is handed BACK.
 *
 * Without it the rig stops at the first year end: nothing here runs `YearTurnScene`, so `onDone` is
 * never called and `isHandedOver()` stays true for ever. What it does is what that scene does when
 * the retirement card is unregistered — take the rolled heir for every prompt and commit through the
 * same `finishYearTurn`. No shortcut around the real turn.
 */
function settleYearTurn(h: Harness): void {
  let guard = 0;
  while (h.scene.isHandedOver()) {
    guard += 1;
    if (guard > 100) throw new Error("the year turn never handed the overworld back");
    const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.yearTurn).pop();
    if (!launch) {
      if (settleBattle(h)) continue;
      throw new Error("the scene is handed over with no year-turn sequence to answer");
    }
    const data = launch.data as YearTurnSceneData;
    const { flow, tickBefore, carry } = data.drive;
    while (!flow.done()) flow.chooseHeir();
    h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
    const result = flow.result();
    data.onDone(finishYearTurn(result, tickBefore, carry), result);
  }
}

/** One frame, and then whatever that frame handed the scene over to. */
function settle(h: Harness): void {
  settleBattle(h);
  settleYearTurn(h);
}

/* ── walking ──────────────────────────────────────────────────────────────── */

const DELTA = {
  up: { dCol: 0, dRow: -1 },
  down: { dCol: 0, dRow: 1 },
  left: { dCol: -1, dRow: 0 },
  right: { dCol: 1, dRow: 0 },
} as const;
type Dir = keyof typeof DELTA;

/** Where the sprite actually stands on a tile — `interact()`'s own point, through its own helpers. */
const standingAt = (tile: { col: number; row: number }): WorldPoint =>
  spriteWorldPosition(createMovement(tile), movementConfig(balance));

/**
 * The first walkable tile from which `propAt` — the very function `interact()` asks — answers with
 * THIS prop, or null when the node's grid puts none within reach.
 *
 * The walkability question is the scene's own (`canEnter`), so the tile a test walks to is a tile the
 * running game would let the player stand on.
 */
function tileInReachOf(h: Harness, node: NodeFile, prop: PropPlacement): { col: number; row: number } | null {
  const { cols, rows } = h.scene.tiles();
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!h.scene.canEnter({ col, row })) continue;
      const at = propAt(node, standingAt({ col, row }), balance);
      if (at && at.id === prop.id) return { col, row };
    }
  }
  return null;
}

/**
 * Put the player on a walkable neighbour of `tile` and WALK them onto it with a held arrow key.
 *
 * A real step, not a teleport: it is what sets `hudDirty`, so the HUD under assertion is the one the
 * player would be looking at from that tile. The `placeAt` on arrival is the player LETTING GO —
 * `game/movement.ts` starts the next step the instant one lands while a key is held, so without it
 * the next frame walks straight off the prop again (the same reason `paceRun` does it in
 * `overworld-scene.test.ts` §20).
 */
function stepOnto(h: Harness, tile: { col: number; row: number }): void {
  for (const dir of Object.keys(DELTA) as Dir[]) {
    const from = { col: tile.col - DELTA[dir].dCol, row: tile.row - DELTA[dir].dRow };
    if (!h.scene.canEnter(from)) continue;
    h.scene.movement = placeAt(h.scene.movement, from);
    h.hold(dir, true);
    h.frame();
    h.hold(dir, false);
    settle(h);
    const now = h.scene.movement.tile;
    if (now.col === tile.col && now.row === tile.row) {
      h.scene.movement = placeAt(h.scene.movement, now);
      return;
    }
  }
  throw new Error(`no walkable neighbour of ${String(tile.col)},${String(tile.row)} to step in from`);
}

/**
 * Walk like a player LOOKING for animals: to the nearest cell of the node's encounter terrain, and
 * then across it. The steering is a breadth-first search over the scene's OWN walkability question
 * to the nearest cell the SHIPPED mask calls encounter terrain — never a second grid, and nothing
 * random (G11). Copied from `overworld-scene.test.ts`, which explains at length why `walk` cannot do
 * this job on the placeholder collision.
 */
function stepTowardEncounterTerrain(h: Harness): Dir | null {
  const mask = encounterMaskFor(h.scene.node.id, balance);
  if (mask === null) return null;
  const start = h.scene.movement.tile;
  const key = (col: number, row: number): string => `${String(col)},${String(row)}`;
  const firstStep = new Map<string, Dir>();
  const seen = new Set<string>([key(start.col, start.row)]);
  let frontier: Array<{ col: number; row: number }> = [start];
  while (frontier.length > 0) {
    const next: Array<{ col: number; row: number }> = [];
    for (const cell of frontier) {
      const came = firstStep.get(key(cell.col, cell.row));
      for (const dir of Object.keys(DELTA) as Dir[]) {
        const to = { col: cell.col + DELTA[dir].dCol, row: cell.row + DELTA[dir].dRow };
        const k = key(to.col, to.row);
        if (seen.has(k) || !h.scene.canEnter(to)) continue;
        seen.add(k);
        const step = came ?? dir;
        if (cellRollsEncounters(mask, to.col, to.row)) return step;
        firstStep.set(k, step);
        next.push(to);
      }
    }
    frontier = next;
  }
  return null;
}

function forage(h: Harness, steps: number): number {
  const order = ["right", "down", "left", "up"] as const;
  let taken = 0;
  let guard = 0;
  while (taken < steps && guard < steps * 40 + 200) {
    guard += 1;
    const before = h.scene.movement.tile;
    for (const dir of order) h.hold(dir, false);
    const toward = h.scene.currentInterior() === null ? stepTowardEncounterTerrain(h) : null;
    const open =
      toward ??
      order.find((d) => h.scene.canEnter({ col: before.col + DELTA[d].dCol, row: before.row + DELTA[d].dRow }));
    if (!open) break;
    h.hold(open, true);
    h.frame();
    if (h.scene.movement.tile.col !== before.col || h.scene.movement.tile.row !== before.row) taken += 1;
  }
  for (const dir of order) h.hold(dir, false);
  return taken;
}

/* ════════════════════════════════════════════════════════════════════════════
 * §Q1 [E] on a prop opens the prop's box
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Every shipped prop the corpus has a line ready for at a fresh save, DERIVED (G2): no prop id and no
 * node id is typed in, so a prop that gains an entry, loses one, or moves node joins or leaves this
 * section by itself. The selector is the one `interact()` asks — a second, test-local idea of which
 * entry is eligible would only ever agree with itself.
 */
const READABLE: Array<{ node: NodeFile; prop: PropPlacement; entry: DialogueEntry }> = content.nodes.flatMap(
  (node) =>
    propsOf(node).flatMap((prop) => {
      const h = mount({ save: freshSave(node.id), startNode: node.id });
      const entry = propDialogueFor(DIALOGUE, prop.id, node.id, h.scene.dialogueCtx());
      return entry ? [{ node, prop, entry }] : [];
    }),
);

describe("§Q1 [E] on a shipped prop hands its entry to the box", () => {
  it("at least one shipped prop has a line ready — without that the block below is empty", () => {
    /*
     * The vacuity guard. `it.each([])` registers no tests and reports success, which is exactly the
     * shape of a green suite certifying an absence.
     */
    expect(
      READABLE.map((r) => `${r.node.id}/${r.prop.id}`),
      "no shipped prop has an eligible entry at a fresh save — the presses below would be vacuous",
    ).not.toEqual([]);
  });

  it.each(READABLE.map((r) => [`${r.node.id} · ${r.prop.id}`, r] as const))(
    "%s — the key opens the box, and the box is handed the prop's own entry",
    (_name, { node, prop, entry }) => {
      const h = mount({ save: freshSave(node.id), startNode: node.id });
      withDialogueBox(h);
      const tile = tileInReachOf(h, node, prop);
      expect(tile, `no walkable tile of ${node.id} is inside "${propLabel(prop)}"'s reach`).not.toBeNull();
      stepOnto(h, tile as { col: number; row: number });

      // The advertisement, BEFORE the press — §Q2's claim, asserted here too because a press that
      // works from a tile the HUD does not point at is a feature no player finds.
      expect(interactLine(h), `${node.id} does not advertise the prop the player is standing on`).toContain(
        `read ${propLabel(prop)}`,
      );

      const opened = boxed(h).length;
      h.press(KEY_E);
      h.frame();

      expect(boxed(h).length, `[E] on "${propLabel(prop)}" opened no box at all`).toBe(opened + 1);
      expect(boxed(h)[opened], `[E] on "${propLabel(prop)}" opened somebody else's beat`).toBe(entry.id);
      expect(boxIsUp(h), "the box was shut down in the same frame it was opened").toBe(true);

      // …and the beat really plays. The expected words come from the corpus through the runner, so
      // this is the prop's OWN copy reaching the screen and not a string typed into a test.
      answerBox(h);
      const spoken = transcript(DIALOGUE, runHeadless(DIALOGUE, entry.id));
      expect(h.scene.lastLineSpoken(), `"${propLabel(prop)}" was opened and said nothing`).toBe(
        spoken[spoken.length - 1],
      );
      expect(h.hud(), `the HUD does not carry what "${propLabel(prop)}" said`).toContain(
        h.scene.lastLineSpoken(),
      );
    },
  );
});

/* ════════════════════════════════════════════════════════════════════════════
 * §Q2–§Q4 THE VELLSIRE CHAIN, WALKED — one run, four claims
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The two antler stones on Meadow Reach, resolved out of the shipped data rather than named.
 *
 * `LATCHED` is the stone whose entry gates on the previous chain step and closes itself on its own
 * flag — the one that is unreadable until the chain reaches it and unreadable again the moment it
 * has been read. That double gate is the whole of §Q2: the same prop, the same tile, two different
 * honest answers, and a HUD that has to say which one is true right now.
 */
function antlerStoneEntry(): DialogueEntry {
  const entry = DIALOGUE.entries.find(
    (e) =>
      e.kind === "prop" &&
      e.signChain !== undefined &&
      e.chainStep !== undefined &&
      (e.when?.flagsUnset ?? []).some((f) => Object.prototype.hasOwnProperty.call(e.setFlags ?? {}, f)) &&
      Object.keys(e.setFlags ?? {}).length > 1,
  );
  if (!entry) throw new Error("the corpus ships no self-latching prop entry that writes more than one flag");
  return entry;
}

/**
 * Play the vellsire chain up to the stone, BY PLAYING: take Maren's survey job, walk the Reach until
 * three distinct lines are met, report back, hear the keystone lecture, and go back out to the stone.
 *
 * Every flag on that path is written by the corpus or by `syncQuestFlags`; this function writes none.
 */
function walkToTheStone(h: Harness, stone: DialogueEntry): { node: NodeFile; prop: PropPlacement } {
  const node = content.nodes.find((n) => n.id === stone.node);
  if (!node) throw new Error(`the corpus puts ${stone.id} at "${stone.node}", which ships no node file`);
  const prop = propsOf(node).find((p) => p.id === stone.propId);
  if (!prop) throw new Error(`${stone.node} ships no prop "${String(stone.propId)}"`);
  return { node, prop };
}

describe("§Q2/§Q3/§Q4 the chain is walked, and the screen keeps up with it", () => {
  const stone = antlerStoneEntry();
  /** The flag the stone's own entry gates itself shut on — the latch, read off the corpus. */
  const latch = (stone.when?.flagsUnset ?? []).find((f) =>
    Object.prototype.hasOwnProperty.call(stone.setFlags ?? {}, f),
  ) as string;

  it("a fresh run reaches the stone, reads it once, and the screen never promises what [E] will refuse", async () => {
    const h = mount();
    const { node, prop } = walkToTheStone(h, stone);

    /* ── §Q3.a THE OFFER, and the tracker that draws it ─────────────────────
     * Tolm's arrangement is taken by pressing [E] at Hearthollow and choosing the first option, which
     * is the shipped "Twenty-four, and I touch none of them." — the box is unregistered here, so the
     * scene plays the beat headlessly and takes exactly that option. No flag is written by hand.
     */
    const annual = questDefinitions(DIALOGUE).find((d) => d.acceptFlag !== null && d.node === h.scene.node.id);
    expect(annual, "the slice town's giver has no acceptance flag to take").toBeDefined();
    for (let i = 0; i < 40 && h.scene.save.questFlags["quest.fallow-field.taken"] !== true; i += 1) {
      h.press(KEY_E);
      h.frame();
      settle(h);
    }
    expect(
      h.scene.save.questFlags["quest.fallow-field.taken"],
      "forty [E] presses at the slice town never reached the annual arrangement's offer",
    ).toBe(true);
    expect(questLine(h), "an accepted quest is not on the tracker").toContain("open");
    expect(questLine(h), "an accepted quest is drawn as already turned in").not.toContain("turn in");

    /* ── §Q3.b THE WORK: rest until the year turns, which is what that quest asks for. */
    for (let i = 0; i < 400 && h.scene.save.questFlags["quest.fallow-field.turnin"] !== true; i += 1) {
      h.press(KEY_R);
      h.frame();
      settle(h);
    }
    h.frame();
    expect(
      h.scene.save.questFlags["quest.fallow-field.turnin"],
      "the year never turned on the accepted quest — nothing came due",
    ).toBe(true);

    /*
     * ── §Q3.c THE DEFECT. `questStage` calls this `turnedIn`: the work is done and the giver has not
     * been told. The tracker used to draw `open` and `done` and nothing else, so this line went from
     * `quests 0/10 closed · open fallow-field` to `quests 0/10 closed` on the press that earned it.
     */
    const report = questReports(h.scene.save, content).find((r) => r.id === "fallow-field");
    expect(report?.stage, "the fixture is not in the state this section is about").toBe("turnedIn");
    const giver = speakerById(DIALOGUE, "tolm")?.name ?? "tolm";
    expect(questLine(h), "a quest waiting to be reported is not on the tracker at all").toContain(
      "fallow-field",
    );
    expect(questLine(h), "the tracker does not say the quest is waiting to be turned in").toContain(
      "turn in",
    );
    expect(questLine(h), "the tracker does not name the giver the player has to walk back to").toContain(
      giver,
    );
    expect(questLine(h), "the tracker does not say where that giver is standing").toContain(
      report?.node as string,
    );

    /* ── §Q4.a THE SURVEY JOB, worked and reported — this is what unlocks the chain. */
    await h.scene.travelTo(node.id);
    settle(h);
    const distinct = (): number => new Set(linesMetAt(h.scene.save, node.id)).size;
    for (let i = 0; i < 4000 && distinct() < 3; i += 1) {
      forage(h, 1);
      settle(h);
    }
    expect(distinct(), `three distinct lines were never met on ${node.id}`).toBeGreaterThanOrEqual(3);

    await h.scene.travelTo(SLICE_NODE);
    settle(h);
    const step = stone.when?.flagsSet?.[0] as string;
    for (let i = 0; i < 60 && h.scene.save.questFlags[step] !== true; i += 1) {
      h.press(KEY_E);
      h.frame();
      settle(h);
    }
    expect(
      h.scene.save.questFlags[step],
      `the chain step "${step}" the stone gates on was never reached by playing`,
    ).toBe(true);

    /* ── §Q2.a THE ADVERTISEMENT, with the stone READABLE. */
    await h.scene.travelTo(node.id);
    settle(h);
    const tile = tileInReachOf(h, node, prop);
    expect(tile, `no walkable tile of ${node.id} is inside "${propLabel(prop)}"'s reach`).not.toBeNull();
    stepOnto(h, tile as { col: number; row: number });
    expect(interactLine(h), "the HUD does not offer the read the key would give").toContain(
      `read ${propLabel(prop)}`,
    );

    /* ── §Q4.b THE PRESS, and what the screen says about the write. */
    expect(h.scene.save.questFlags[latch], "the stone's latch is already down before it was read").not.toBe(
      true,
    );
    const said = saidBy(h, () => {
      h.press(KEY_E);
      h.frame();
      settle(h);
    });
    expect(h.scene.save.questFlags[latch], "reading the stone wrote nothing").toBe(true);

    const banner = said.find((t) => t.startsWith(propLabel(prop)));
    expect(
      banner,
      `nothing on screen reported what "${propLabel(prop)}" wrote — said: ${JSON.stringify(said)}`,
    ).toBeDefined();
    /*
     * THE KEYS MUST NOT BE ON IT. This is the assertion that binds: the entry writes two flags for
     * one event, and both were printed verbatim beside a hand-written paragraph about a cut stone.
     * Derived from the entry's own `setFlags`, so a corpus edit that renames a flag cannot make this
     * pass by accident.
     */
    for (const key of Object.keys(stone.setFlags ?? {})) {
      expect(banner as string, `the banner prints the flag key "${key}" at the player`).not.toContain(key);
    }
    // …and what it prints instead is the corpus's own name for the thing that moved.
    expect(banner as string, "the banner does not name the chain the stone belongs to").toBe(
      `${propLabel(prop)} · ${writeLabels(Object.keys(stone.setFlags ?? {})).join(" · ")}`,
    );
    expect(writeLabels(Object.keys(stone.setFlags ?? {})), "two keys, one event, two labels").toEqual([
      `${stone.signChain as string} step ${String(stone.chainStep)}`,
    ]);

    /* ── §Q2.b THE SAME TILE, ONE PRESS LATER. The latch is down and the key will now refuse. */
    expect(
      propDialogueFor(DIALOGUE, prop.id, node.id, h.scene.dialogueCtx()),
      "the stone's entry did not latch — §Q2 has no refusal to be honest about",
    ).toBeUndefined();
    expect(interactLine(h), "the HUD still offers a read the key would refuse").not.toContain(
      `read ${propLabel(prop)}`,
    );
    expect(interactLine(h), "the HUD does not say why [E] will not read the stone").toContain(
      `${propLabel(prop)} — nothing more to read`,
    );
    // The advertisement is the sentence the key prints, from the key's own reader — so the two
    // cannot drift. `saidBy` isolates the banner from the HUD line that echoes it.
    const refused = saidBy(h, () => {
      h.press(KEY_E);
      h.frame();
      settle(h);
    });
    expect(
      refused.some((t) => t === `${propLabel(prop)} — nothing more to read`),
      `[E] on the read stone did not print the refusal the HUD advertised — said: ${JSON.stringify(refused)}`,
    ).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §Q2.c the same claim, at every shipped node — the [E] line IS the press
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The two sentences [E] answers with when it has nothing to give. They are the scene's own, and they
 * are spelled here once because the whole claim below is that the HUD and the banner carry the SAME
 * string — a test that derived them from the scene could not tell whether the two agreed or whether
 * it had simply asked the same function twice.
 */
const REFUSALS = ["nothing more to read", "nobody has anything to say"] as const;

describe("§Q2.c the HUD's [E] line is what the key would say, at every shipped node", () => {
  it.each(content.nodes.map((n) => [n.id, n] as const))(
    "%s — the advertisement and the press agree",
    (_id, node) => {
      const h = mount({ save: freshSave(node.id), startNode: node.id });
      const advertised = interactLine(h);
      const refusedByHud = REFUSALS.find((r) => advertised.includes(r)) ?? null;

      const said = saidBy(h, () => {
        h.press(KEY_E);
        h.frame();
        settle(h);
      });
      const refusedByKey = REFUSALS.find((r) => said.some((t) => t.includes(r))) ?? null;

      /*
       * ⚠ THE INTERESTING HALF IS THE `null` ONE. `[E] talk` on a node with nothing eligible — the
       * late-act sanctum at act 1 — was advertised as a conversation and answered with
       * "nobody has anything to say". Measured before this held: eleven nodes read `[E] talk` and
       * the twelfth answered a refusal to it.
       */
      expect(
        refusedByKey,
        `${node.id}: the HUD offered "${advertised}" and the key answered ${JSON.stringify(said)}`,
      ).toBe(refusedByHud);
    },
  );

  it("at least one shipped node refuses [E] on arrival — without that the block above is one-sided", () => {
    const refusing = content.nodes.filter((node) => {
      const h = mount({ save: freshSave(node.id), startNode: node.id });
      return REFUSALS.some((r) => interactLine(h).includes(r));
    });
    expect(
      refusing.map((n) => n.id),
      "every shipped node has something for [E] on arrival — the agreement above is never tested against a refusal",
    ).not.toEqual([]);
  });
});
