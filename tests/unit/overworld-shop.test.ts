/**
 * tests/unit/overworld-shop.test.ts — THE SHOP, OPENED AND BOUGHT FROM (content-bible §11).
 *
 * WHY THIS FILE EXISTS, AND WHAT IT IS NOT A SECOND COPY OF
 * ────────────────────────────────────────────────────────
 * `game/shop.ts` is a Phaser-free row model with its own unit tests, and a row model is a pure
 * function: every one of those tests would stay green for a shop that no key in the running game
 * can open. Measured before this file: `game/scenes/OverworldScene.ts` `interactIndoors` ended its
 * `service` branch at `playEntry` and returned, so standing on the tile
 * `data/interiors/hearthollow-supply.json` calls "the tile the player stands on to trigger the shop
 * service" played Kett's three lines about her stock and sold nothing at all. `shopRows` and `buy`
 * had no caller anywhere under `game/`.
 *
 * So every test here RUNS the shipping scene against the recorder stub of Phaser, walks the player
 * in through the shop's front door, and presses the keys a player presses:
 *
 *   §S1 a VENDOR's service anchor opens the shelf — and an innkeeper's does not, which is the
 *       discriminator that matters, because `kind: "service"` is what the inns and the blackout
 *       carry too;
 *   §S2 a purchase moves the purse and the bag THROUGH THE TAPE (L10) — one payout entry and one
 *       grant entry, and the save's own tape accounts for every coin that moved;
 *   §S3 the weighted snare is greyed until the second gym's badge is written, and the reason names
 *       the flag `balance.acts` builds rather than a string typed into a test;
 *   §S4 the fifth gym hands over master snares ONCE, on the tape, keyed on the badge flag — driven
 *       through five real gym fights and their real finish handlers.
 *
 * The stub is the one `tests/unit/overworld-scene.test.ts` uses, verbatim: a RECORDER, not a
 * renderer. Display objects remember what was written to them, timers and tweens are queued rather
 * than run, and there is no wall clock and no `Math.random` (G11).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { badgeFlagFor, hasBadge, nodeUnlockedAt } from "@core/acts";
import { startBattle } from "@core/battle";
import { DIALOGUE } from "@core/dialogue-schema";
import {
  INTERIORS,
  PLAN_DOOR,
  planCellsWith,
  type InteriorBlueprint,
} from "@core/interiors";
import {
  appendAction,
  applyPayout,
  newSave,
  openStreams,
  payoutAction,
  readGrant,
  readPayout,
  serialize,
  type SaveEnvelope,
} from "@core/save";
import { validateContent } from "@core/schemas";
import { SNARE_TIERS } from "@core/types";
import type { Balance, Content, GymLeader, NodeFile, NodeState } from "@core/types";
import { runHeadless, transcript } from "@game/dialogue-runner";
import { placeAt } from "@game/movement";
import { SCENE_KEYS } from "@game/scene-keys";
import { weightedUnlockGym, shopRows } from "@game/shop";
import { provisionalStarter } from "@game/wild-battle";
import { OverworldScene, type OverworldSceneData } from "@game/scenes/OverworldScene";
import type { BattleSceneData } from "@game/scenes/BattleScene";
import type { DialogueSceneData } from "@game/scenes/DialogueScene";
import { finishYearTurn, type YearTurnSceneData } from "@game/scenes/YearTurnScene";

const content: Content = validateContent();
const balance: Balance = content.balance;

/** The node the vertical slice starts at (build-doc §1). Derived, never typed in (G2). */
const SLICE_NODE = content.nodes.find((n) => n.walkable)?.id ?? content.nodes[0]!.id;

/** The leaders in ladder order — `data/gyms.json`'s own `act`, never a hand-written list (G2). */
const LADDER: GymLeader[] = [...content.gyms].sort((a, b) => a.act - b.act);

/**
 * The `balance.economy` key `game/scenes/OverworldScene.ts` reads the master-snare count out of.
 *
 * ⚠ IT IS NOT IN `data/balance.json`, and this file may not put it there. That is the BLOCKER the
 * scene reports on screen, and §S4's first test pins the reported behaviour; the rest of §S4 mounts
 * a balance that HAS the key, which is what the running game will be handed the moment it lands.
 */
const MASTER_GRANT_KEY = "masterSnareGrant";

/** The keys this file presses, spelled the way the stub's `KeyCodes` spells them. */
const KEY_E = 69;
const KEY_G = 71;
const KEY_X = 88;

function nodeFile(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

function freshSave(nodeId = SLICE_NODE): SaveEnvelope {
  const save = newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);
  const starter = provisionalStarter(content);
  return starter ? { ...save, party: [starter] } : save;
}

/**
 * Put coins in the purse THROUGH `core/save.ts`'s own writer, tape and all.
 *
 * ⚠ NOT `{ ...save, money }`. `applyPayout` is the only writer of `money` in the repo, and §S2
 * reads the purse against the tape that explains it — a rig that minted coins beside the tape would
 * make that comparison compare a lie to itself.
 */
function withPurse(save: SaveEnvelope, amount: number): SaveEnvelope {
  return applyPayout(appendAction(save, payoutAction(amount)), amount);
}

/** Rewrite one node's live counts, so a walk to a door cannot meet anything. */
function withCounts(save: SaveEnvelope, nodeId: string, counts: Record<string, number>): SaveEnvelope {
  const state = save.nodeStates[nodeId];
  if (!state) throw new Error(`save has no state for ${nodeId}`);
  const populations: NodeState["populations"] = {};
  for (const [lineId, pop] of Object.entries(state.populations)) {
    populations[lineId] = { ...pop, count: counts[lineId] ?? pop.count };
  }
  return { ...save, nodeStates: { ...save.nodeStates, [nodeId]: { ...state, populations } } };
}

interface Harness {
  scene: OverworldScene;
  parts: FakeParts;
  frame(ms?: number): void;
  hold(dir: "up" | "down" | "left" | "right", down?: boolean): void;
  press(code: number): void;
  hud(): string;
}

/** One millisecond per tile, so one frame is one whole step and a test can count them. */
const MS_PER_TILE = 1;

function mount(over: Partial<OverworldSceneData> = {}, prepare?: (parts: FakeParts) => void): Harness {
  const useContent = over.content ?? content;
  const data: OverworldSceneData = {
    content: useContent,
    save: over.save ?? freshSave(),
    msPerTile: MS_PER_TILE,
    ...over,
  };
  const scene = new OverworldScene();
  if (prepare && STUB.parts) prepare(STUB.parts);
  const streams = data.streams ?? openStreams(data.save as SaveEnvelope, useContent.balance);
  scene.init({ ...data, streams });
  scene.create();
  const parts = STUB.parts as FakeParts;
  return {
    scene,
    parts,
    frame(ms = MS_PER_TILE) {
      // A PAUSED SCENE GETS NO FRAME — Phaser's `SceneManager.update` skips it and its
      // `InputPlugin` disarms on the PAUSE event. Calling straight through is a lie about the
      // platform, and it is the one thing that would make every key here work whether or not the
      // scene had the screen.
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

/* ── the dialogue box, when a test wants one ──────────────────────────────── */

function withDialogueBox(h: Harness): void {
  h.parts.registeredScenes[SCENE_KEYS.dialogue] = {};
}

/** Whether a box is on screen right now — launched, and not stopped since. */
function boxIsUp(h: Harness): boolean {
  return h.parts.sceneStatus.get(SCENE_KEYS.dialogue) === "running";
}

/**
 * Answer the box the way `game/scenes/DialogueScene.ts` `finish()` answers it: play the run out,
 * hand the state back, and THEN let the box stop itself — two statements, in that order, because
 * everything the overworld does inside `onDone` happens before the trailing stop.
 */
function answerBox(h: Harness): string {
  const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.dialogue).pop();
  if (!launch) throw new Error("nothing was handed to the dialogue box");
  if (!boxIsUp(h)) {
    throw new Error(
      `the box was handed "${(launch.data as DialogueSceneData).entryId}" and then shut down before ` +
        "anybody could answer it",
    );
  }
  h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
  const data = launch.data as DialogueSceneData;
  data.onDone(runHeadless(data.file ?? DIALOGUE, data.entryId));
  h.parts.stops.push(SCENE_KEYS.dialogue);
  h.parts.sceneStatus.set(SCENE_KEYS.dialogue, "shutdown");
  if (h.scene.isSpeaking()) h.frame();
  return data.entryId;
}

/* ── fights and year turns, so a rig is never left holding the screen ─────── */

type BattleSceneState = Parameters<BattleSceneData["onFinished"]>[0]["state"];

/**
 * The state `BattleScene` would hand back for a fight that ended this way: the REAL battlers, uids,
 * orders and bag `core/battle.ts` `startBattle` builds from the launcher's own input. A fake that
 * omits the party is not a fight the reducer could have produced — `applyBattleResult` reads it.
 */
function settledState(data: BattleSceneData, outcome: "win" | "loss" | "fled"): BattleSceneState {
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

function settleBattle(h: Harness, outcome: "win" | "loss" | "fled" = "loss"): boolean {
  const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
  if (!launch) return false;
  h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
  const data = launch.data as BattleSceneData;
  data.onFinished({ state: settledState(data, outcome), caught: null });
  return true;
}

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

/* ── the front door (the rig `tests/unit/overworld-scene.test.ts` §14 uses) ── */

/** Every shipped blueprint, so a fifth room added tomorrow is covered without editing this file. */
const ROOMS = [...INTERIORS];

/**
 * The door's tile in the parent town, restated from the blueprint and `balance.map` INDEPENDENTLY
 * of the scene's own conversion — `InteriorDoor.x/y` are map-NATIVE pixels, a world pixel is
 * `mapRenderScale` of one, and a tile is `tileStepPx` world pixels.
 */
function doorTile(bp: InteriorBlueprint): { col: number; row: number } {
  const step = balance.map.tileStepPx;
  return {
    col: Math.floor((bp.door.x * balance.map.mapRenderScale) / step),
    row: Math.floor((bp.door.y * balance.map.mapRenderScale) / step),
  };
}

/** The plan's one `D` cell. `core/interiors.ts` refuses a blueprint that draws any other number. */
function planDoor(bp: InteriorBlueprint): { col: number; row: number } {
  const cells = planCellsWith(bp.plan, PLAN_DOOR);
  expect(cells.length, `${bp.id} does not draw exactly one doorway`).toBe(1);
  return cells[0]!;
}

const DELTA = {
  up: { dCol: 0, dRow: -1 },
  down: { dCol: 0, dRow: 1 },
  left: { dCol: -1, dRow: 0 },
  right: { dCol: 1, dRow: 0 },
} as const;
type Dir = keyof typeof DELTA;

/**
 * Stand one tile back and take the ONE step that lands on `tile`. A step, not a teleport: the
 * mechanism that puts a player inside a building is `onStepCompleted`.
 */
function stepOnto(h: Harness, tile: { col: number; row: number }, dir: Dir): void {
  const back = DELTA[dir];
  h.scene.movement = placeAt(h.scene.movement, { col: tile.col - back.dCol, row: tile.row - back.dRow });
  h.hold(dir, true);
  h.frame();
  h.hold(dir, false);
}

/** Walk the player in through the front door, answering whatever the walk ran into on the way. */
function goInside(h: Harness, bp: InteriorBlueprint): void {
  const door = doorTile(bp);
  for (let attempt = 0; attempt < 8 && h.scene.currentInterior() === null; attempt += 1) {
    settleBattle(h, "fled");
    settleYearTurn(h);
    stepOnto(h, door, "down");
  }
  expect(h.scene.currentInterior()?.id, `the rig never got the player into ${bp.id}`).toBe(bp.id);
}

/** A save standing in a room's parent town, with that town's populations wiped to zero. */
function saveAtTown(bp: InteriorBlueprint): SaveEnvelope {
  const zeros: Record<string, number> = {};
  for (const lineId of Object.keys(nodeFile(bp.parentNode).populations)) zeros[lineId] = 0;
  return withCounts(freshSave(bp.parentNode), bp.parentNode, zeros);
}

/** Walk in and stand on the tile this anchor is triggered from. */
function standAt(h: Harness, bp: InteriorBlueprint, anchor: { col: number; row: number }): void {
  goInside(h, bp);
  h.scene.movement = placeAt(h.scene.movement, { col: anchor.col, row: anchor.row });
}

/* ── who is on the other side of an anchor, read from the corpus ───────────── */

interface ServiceAnchor {
  bp: InteriorBlueprint;
  id: string;
  col: number;
  row: number;
  target: string;
}

/** Every `kind:"service"` anchor the four shipped rooms carry. */
const SERVICE_ANCHORS: ServiceAnchor[] = ROOMS.flatMap((bp) =>
  bp.anchors
    .filter((a) => a.kind === "service")
    .map((a) => {
      const service = a as unknown as { id: string; col: number; row: number; target: string };
      return { bp, id: service.id, col: service.col, row: service.row, target: service.target };
    }),
);

/**
 * The role `data/dialogue.json` tags the speaker of an entry with — restated here from the corpus,
 * because the whole question §S1 asks is whether the SCENE reads the same field. A test that asked
 * the scene would agree with the scene and with nothing else.
 */
function roleOfEntry(entryId: string): string | null {
  const entry = DIALOGUE.entries.find((e) => e.id === entryId);
  if (!entry) return null;
  const speaker = DIALOGUE.speakers.find((s) => s.id === entry.speaker);
  return speaker?.role ?? null;
}

/* ── the shelf, named out of the shipped model rather than typed in ────────── */

/** The badge flag the weighted row waits on — built by `core/acts.ts` from `balance.acts`. */
// The gate id now lives in data (`economy.weightedUnlockGym`), not as a literal in game/shop.ts —
// so this reads it the way the shop does rather than restating it. Derived, never typed.
const WEIGHTED_GYM = weightedUnlockGym(balance);
const WEIGHTED_FLAG = badgeFlagFor(WEIGHTED_GYM, balance);

/**
 * The snare tier the shop does NOT sell — derived as the tier that never appears as a row, which is
 * the master snare. Named this way so that a shelf that started selling it turns this red rather
 * than quietly agreeing with a string typed here.
 */
function unsoldTier(): string {
  const sold = new Set(shopRows(freshSave(), balance).map((row) => row.id));
  const missing = SNARE_TIERS.filter((tier) => !sold.has(tier));
  expect(missing, "the shelf sells every snare tier, so there is no ungranted tier to grant").toHaveLength(1);
  return missing[0]!;
}

const MASTER_TIER = unsoldTier();

/** The row that is gated on a badge — found by the flag `core/acts.ts` builds, not by its id. */
function gatedRowId(): string {
  const row = shopRows(freshSave(), balance).find((r) => (r.reason ?? "").includes(WEIGHTED_FLAG));
  expect(row, `no row on a fresh save is locked behind ${WEIGHTED_FLAG}`).toBeDefined();
  return row!.id;
}

const GATED_ROW = gatedRowId();

/** Every purse on the tape, in order. `readPayout` is the reader `core/save.ts` `replay` uses. */
function pursesOn(save: SaveEnvelope): number[] {
  const paid: number[] = [];
  for (const entry of save.actionLog) {
    const amount = readPayout(entry.action);
    if (amount !== null) paid.push(amount);
  }
  return paid;
}

/** Every grant on the tape, in order. `readGrant` is `replay`'s own reader. */
function grantsOn(save: SaveEnvelope): Array<Record<string, number>> {
  const given: Array<Record<string, number>> = [];
  for (const entry of save.actionLog) {
    const items = readGrant(entry.action);
    if (items !== null) given.push(items);
  }
  return given;
}

beforeEach(() => {
  STUB.parts = null;
});

/* ════════════════════════════════════════════════════════════════════════════
 * §S0 the fixtures are real — without this every section below can pass vacuously
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§S0 the shop this file is about exists in shipped content", () => {
  it("some shipped room has a service anchor whose speaker sells things", () => {
    const vendors = SERVICE_ANCHORS.filter((a) => roleOfEntry(a.target) === "vendor");
    expect(
      vendors.map((a) => `${a.bp.id}.${a.id}`),
      "no shipped interior carries a vendor's service anchor — §S1 would be testing nothing",
    ).not.toHaveLength(0);
  });

  it("…and some shipped room has a service anchor whose speaker does NOT", () => {
    /*
     * THE DISCRIMINATOR. `kind: "service"` is carried by the five inns and by `narration.blackout`
     * as well as by the two shops, so a scene that treated the kind as meaning "shop" would open a
     * price list in the inn and on the black screen a wiped party wakes from. Without a non-vendor
     * service anchor in the corpus, §S1's negative case would be unwritable.
     */
    const others = SERVICE_ANCHORS.filter((a) => roleOfEntry(a.target) !== "vendor");
    expect(
      others.map((a) => `${a.bp.id}.${a.id} → ${String(roleOfEntry(a.target))}`),
      "every shipped service anchor is a vendor's, so 'kind === service' and 'is a shop' agree here",
    ).not.toHaveLength(0);
  });

  it("the shelf prices something, and the fifth gym's tier is not on it", () => {
    const rows = shopRows(freshSave(), balance);
    expect(rows.length, "the shop offers no rows at all — every purchase assertion would be vacuous").toBeGreaterThan(0);
    expect(rows.map((r) => r.id), "the shop sells the tier the fifth gym grants").not.toContain(MASTER_TIER);
    expect(rows.every((r) => r.price >= 0)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §S1 A VENDOR'S ANCHOR OPENS THE SHELF — and an innkeeper's does not
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§S1 [E] on a service anchor opens the shop only where somebody sells something", () => {
  it.each(SERVICE_ANCHORS.map((a) => [`${a.bp.id}.${a.id}`, a] as const))(
    "%s — the shelf opens iff the speaker is tagged vendor, and the line plays either way",
    (label, anchor) => {
      const wantsShop = roleOfEntry(anchor.target) === "vendor";
      const h = mount({ save: saveAtTown(anchor.bp), startNode: anchor.bp.parentNode });
      standAt(h, anchor.bp, anchor);

      h.press(KEY_E);
      h.frame();

      /*
       * THE LINE STILL PLAYS. No box is registered in this rig, so `playEntry` runs the entry
       * headlessly and `finishDialogue` records what was said — the same witness the interiors
       * section reads anchors through. The vendor's own copy is her whole shipped corpus, and a
       * shop that replaced it would take the bait crate and the smith with no iron off the screen.
       */
      const expected = transcript(DIALOGUE, runHeadless(DIALOGUE, anchor.target));
      expect(h.scene.lastLineSpoken(), `${label} did not play its own entry`).toBe(
        expected[expected.length - 1],
      );

      expect(
        h.scene.isShopping(),
        `${label} speaks a ${String(roleOfEntry(anchor.target))} and the shelf ` +
          `${h.scene.isShopping() ? "opened" : "did not open"} — "kind === service" is not the test`,
      ).toBe(wantsShop);

      if (wantsShop) {
        expect(h.scene.shopOnScreen().length, `${label} opened an empty shelf`).toBeGreaterThan(0);
        expect(h.hud(), `${label} opened a shelf the HUD does not draw`).toContain("[E] buy");
      }
    },
  );

  it("the shelf opens only when the player has read the line — the box first, the rows after", () => {
    /*
     * The order a player experiences. With C7's box registered the beat goes on screen and the
     * overworld is PAUSED; the shop must not be up behind it, and it must be up once the box is
     * answered. A continuation dropped on the floor here is a shop nobody can ever open through
     * the box, which is the configuration the shipped game runs in.
     */
    const anchor = SERVICE_ANCHORS.find((a) => roleOfEntry(a.target) === "vendor")!;
    const h = mount({ save: saveAtTown(anchor.bp), startNode: anchor.bp.parentNode });
    standAt(h, anchor.bp, anchor);
    withDialogueBox(h);

    h.press(KEY_E);
    h.frame();
    expect(boxIsUp(h), "the vendor's line did not reach the box").toBe(true);
    expect(h.scene.isShopping(), "the shelf opened over the line the player is still reading").toBe(false);

    expect(answerBox(h)).toBe(anchor.target);
    expect(h.scene.isShopping(), "answering the vendor's box did not open the shelf").toBe(true);
  });

  it("[X] closes the shelf, and the keys the overworld owns are dead while it is open", () => {
    /*
     * MODAL, MEASURED. A shelf drawn over a scene that still answered [G] would let the player
     * start a gym fight with a price list on screen — and the fight's launcher pauses the overworld
     * under it. [G] is pressed at a town that HAS a leader, so a scene that read it would launch.
     */
    const anchor = SERVICE_ANCHORS.find(
      (a) => roleOfEntry(a.target) === "vendor" && content.gyms.some((g) => g.town === a.bp.parentNode),
    );
    expect(anchor, "no vendor's room stands in a town with a leader — the [G] case is unwritable").toBeDefined();
    const at = anchor!;
    const h = mount({ save: saveAtTown(at.bp), startNode: at.bp.parentNode });
    standAt(h, at.bp, at);
    h.press(KEY_E);
    h.frame();
    expect(h.scene.isShopping()).toBe(true);

    h.press(KEY_G);
    h.frame();
    expect(
      h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle),
      "[G] started a fight with the shop open",
    ).toHaveLength(0);
    expect(h.scene.isShopping(), "[G] closed the shop instead of being ignored").toBe(true);

    h.press(KEY_X);
    h.frame();
    expect(h.scene.isShopping(), "[X] did not close the shelf").toBe(false);
    expect(h.scene.shopOnScreen(), "a closed shelf still reports rows").toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §S2 A PURCHASE GOES ON THE TAPE (L10)
 * ════════════════════════════════════════════════════════════════════════════ */

/** Open the shelf at the first vendor's room, with `purse` in hand. */
function openShopWith(purse: number): { h: Harness; label: string } {
  const anchor = SERVICE_ANCHORS.find((a) => roleOfEntry(a.target) === "vendor")!;
  const save = purse === 0 ? saveAtTown(anchor.bp) : withPurse(saveAtTown(anchor.bp), purse);
  const h = mount({ save, startNode: anchor.bp.parentNode });
  standAt(h, anchor.bp, anchor);
  h.press(KEY_E);
  h.frame();
  expect(h.scene.isShopping(), `${anchor.bp.id}.${anchor.id} did not open the shelf`).toBe(true);
  return { h, label: `${anchor.bp.id}.${anchor.id}` };
}

/** Move the cursor onto a row by id, by pressing the keys a player presses. */
function selectRow(h: Harness, id: string): void {
  const rows = h.scene.shopOnScreen();
  const want = rows.findIndex((row) => row.id === id);
  expect(want, `the shelf is not offering "${id}"`).toBeGreaterThanOrEqual(0);
  let guard = 0;
  while (h.scene.shopCursorAt() !== want) {
    guard += 1;
    if (guard > rows.length + 2) throw new Error(`the cursor never reached "${id}"`);
    const dir = h.scene.shopCursorAt() < want ? "down" : "up";
    h.hold(dir, true);
    h.frame();
    h.hold(dir, false);
    h.frame();
  }
}

describe("§S2 buying moves the purse and the bag through core/save.ts, and says so on the tape", () => {
  it("a purse of nothing greys every row, and [E] on one buys nothing", () => {
    /*
     * `applyPayout` REFUSES an overdraw — `core/schemas.ts` types `money` as `z.number().min(0)`, so
     * a negative purse is a save that will not load. The refusal must never be reached through the
     * UI, which means the row has to be greyed BEFORE the key is pressed.
     */
    const { h, label } = openShopWith(0);
    const rows = h.scene.shopOnScreen();
    expect(rows.every((r) => r.disabled), `${label} offered a row to a purse of 0`).toBe(true);
    expect(rows.every((r) => r.reason !== null), "a greyed row does not say why").toBe(true);

    const before = h.scene.save;
    h.press(KEY_E);
    h.frame();
    expect(h.scene.save.money, "an unaffordable press moved the purse").toBe(before.money);
    expect(h.scene.save.items, "an unaffordable press moved the bag").toEqual(before.items);
    expect(
      h.scene.save.actionLog.length,
      "an unaffordable press wrote to the tape",
    ).toBe(before.actionLog.length);
    expect(h.scene.isShopping(), "a refused purchase closed the shop").toBe(true);
  });

  it("⚠ [E] on an affordable row writes ONE payout and ONE grant, and the tape explains the purse", () => {
    const priced = shopRows(withPurse(freshSave(), 1), balance).find((r) => r.price > 0);
    expect(priced, "no row on the shelf costs anything — this test cannot see a purchase").toBeDefined();
    const price = priced!.price;

    const { h, label } = openShopWith(price);
    selectRow(h, priced!.id);
    const before = h.scene.save;
    const pursesBefore = pursesOn(before).length;
    const grantsBefore = grantsOn(before).length;
    const heldBefore = before.items[priced!.id];

    h.press(KEY_E);
    h.frame();

    const after = h.scene.save;
    expect(
      after.money,
      `${label}: buying ${priced!.id} at ${String(price)} left ${String(after.money)} of ` +
        `${String(before.money)} — ${String(before.money)} means nothing was bought and ` +
        `${String(before.money - 2 * price)} means it was bought twice`,
    ).toBe(before.money - price);
    expect(after.items[priced!.id], "the bag did not gain the item that was paid for").toBe(
      (heldBefore ?? 0) + 1,
    );

    // …AND THE TAPE SAYS SO. A direct write to `save.money` / `save.items` would pass both
    // assertions above and make L10 silently false: `replay()` has no production caller.
    expect(pursesOn(after).slice(pursesBefore), "the purchase's price is not on the tape").toEqual([-price]);
    expect(grantsOn(after).slice(grantsBefore), "the purchase's goods are not on the tape").toEqual([
      { [priced!.id]: 1 },
    ]);
    expect(
      after.money - before.money,
      "the save moved by something its own tape does not account for",
    ).toBe(pursesOn(after).slice(pursesBefore).reduce((a, b) => a + b, 0));
  });

  it("the rows are re-priced against the purse the purchase left behind", () => {
    /*
     * A shelf that kept the list it opened with would keep offering a row the player can no longer
     * afford, and the next press would reach `applyPayout`'s throw from inside a room.
     */
    const priced = shopRows(withPurse(freshSave(), 1), balance).find((r) => r.price > 0)!;
    const { h } = openShopWith(priced.price);
    selectRow(h, priced.id);
    expect(h.scene.shopOnScreen().find((r) => r.id === priced.id)?.disabled).toBe(false);

    h.press(KEY_E);
    h.frame();
    const now = h.scene.shopOnScreen().find((r) => r.id === priced.id);
    expect(now?.disabled, "the row is still offered to a purse that has just been emptied").toBe(true);
    expect(now?.reason ?? "", "the emptied row does not say why").toContain(String(h.scene.save.money));

    const spent = h.scene.save;
    h.press(KEY_E);
    h.frame();
    expect(h.scene.save.money, "a second press bought on credit").toBe(spent.money);
    expect(h.scene.save.actionLog.length, "a refused second press wrote to the tape").toBe(
      spent.actionLog.length,
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §S3 THE WEIGHTED SNARE WAITS ON THE SECOND GYM
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§S3 the weighted row is locked until the second leader's badge is written", () => {
  it("locked before the badge — greyed, and the reason names the flag balance.acts builds", () => {
    const { h, label } = openShopWith(1000);
    expect(hasBadge(h.scene.save, WEIGHTED_GYM, balance), "the rig starts with the badge").toBe(false);
    const row = h.scene.shopOnScreen().find((r) => r.id === GATED_ROW);
    expect(row, `${label} does not offer ${GATED_ROW} at all`).toBeDefined();
    expect(row!.disabled, `${GATED_ROW} is buyable before ${WEIGHTED_FLAG} is written`).toBe(true);
    expect(row!.reason ?? "", "the lock does not name the flag it waits on").toContain(WEIGHTED_FLAG);

    selectRow(h, GATED_ROW);
    const before = h.scene.save;
    h.press(KEY_E);
    h.frame();
    expect(h.scene.save.money, "a locked row was sold").toBe(before.money);
    expect(h.scene.save.items[GATED_ROW], "a locked row put stock in the bag").toBe(before.items[GATED_ROW]);
  });

  it("unlocked once the badge is on the save — written by winGym, the game's only badge writer", () => {
    /*
     * The badge is not typed into a fixture: `winGym` is what `launchGymBattle`'s finish handler
     * calls on a win, and it is the only writer of a badge flag in the repo. What this pins is that
     * the shelf reads the flag that victory wrote.
     */
    const anchor = SERVICE_ANCHORS.find((a) => roleOfEntry(a.target) === "vendor")!;
    const h = mount({ save: withPurse(saveAtTown(anchor.bp), 1000), startNode: anchor.bp.parentNode });
    h.scene.winGym(WEIGHTED_GYM);
    expect(h.scene.save.questFlags[WEIGHTED_FLAG], "winGym wrote no badge").toBe(true);

    standAt(h, anchor.bp, anchor);
    h.press(KEY_E);
    h.frame();
    expect(h.scene.isShopping()).toBe(true);

    const row = h.scene.shopOnScreen().find((r) => r.id === GATED_ROW);
    expect(row?.disabled, `${GATED_ROW} is still locked with ${WEIGHTED_FLAG} on the save`).toBe(false);
    expect(row?.reason, "an unlocked row still carries a refusal").toBeNull();

    selectRow(h, GATED_ROW);
    const before = h.scene.save;
    h.press(KEY_E);
    h.frame();
    expect(h.scene.save.items[GATED_ROW], `${GATED_ROW} was not put in the bag`).toBe(
      (before.items[GATED_ROW] ?? 0) + 1,
    );
    expect(h.scene.save.money, `${GATED_ROW} was handed over free`).toBe(before.money - row!.price);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §S4 THE FIFTH GYM HANDS OVER MASTER SNARES — ONCE, ON THE TAPE
 * ════════════════════════════════════════════════════════════════════════════ */

/** The fifth leader in ladder order — `data/gyms.json`'s `act`, never a typed id (G2). */
const FIFTH = LADDER[4];

/** A `Content` whose balance carries the count the scene reads. See {@link MASTER_GRANT_KEY}. */
function contentGranting(count: number): Content {
  return {
    ...content,
    balance: {
      ...balance,
      economy: { ...balance.economy, [MASTER_GRANT_KEY]: count },
    },
  } as unknown as Content;
}

/** How many master snares this save is holding, with an absent key reported as absent. */
function masterHeld(save: SaveEnvelope): number | undefined {
  return save.items[MASTER_TIER];
}

/**
 * Climb the ladder by PLAYING it: at each leader's town, press [G], let the launcher open the real
 * fight, and hand its own `onFinished` a win the reducer could have produced. Stops after `through`.
 */
function playLadder(through: GymLeader, useContent: Content): Harness {
  let save = freshSave(LADDER[0]!.town);
  let h: Harness | null = null;
  for (const leader of LADDER) {
    h = mount({ save: { ...save, currentNode: leader.town }, startNode: leader.town, content: useContent });
    expect(
      nodeUnlockedAt(leader.town, h.scene.act(), useContent.balance),
      `${leader.town} is not open at act ${String(h.scene.act())} — the rig placed the player illegally`,
    ).toBe(true);
    h.press(KEY_G);
    h.frame();
    const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
    expect(launch, `[G] launched no fight at ${leader.town}`).toBeDefined();
    const data = launch!.data as BattleSceneData;
    data.onFinished({ state: settledState(data, "win"), caught: null });
    settleYearTurn(h);
    save = h.scene.save;
    if (leader.id === through.id) break;
  }
  expect(h, "the ladder ran no fights at all").not.toBeNull();
  return h!;
}

describe("§S4 beating the fifth leader hands over master snares, exactly once", () => {
  it("the ladder's fifth leader is the one the ruling names, by data/gyms.json's own act", () => {
    expect(LADDER.length, "the region ships fewer than five leaders").toBeGreaterThanOrEqual(5);
    expect(FIFTH, "there is no fifth leader to beat").toBeDefined();
    expect(FIFTH!.act, "the fifth leader in ladder order is not the act-5 leader").toBe(LADDER[4]!.act);
  });

  // The ⚠ BLOCKER test that stood here is DELETED, on its own author's instruction: it asserted
  // `economy.masterSnareGrant` was ABSENT, and that the scene reported the missing tunable rather
  // than defaulting to three. The key now ships in data/balance.json, so it went red exactly as it
  // predicted it would. What replaced it is STRONGER, not weaker — the tests below now read the
  // count OUT OF THE SHIPPED BALANCE rather than restating 3, so a retune moves them with it and a
  // wrong count cannot pass by agreeing with a literal that was copied from the same ruling.

  it("⚠ with the count in balance, a PLAYED ladder ends holding exactly that many — on the tape", () => {
    const count = balance.economy.masterSnareGrant;
    expect(count, "the shipped tunable is 0 — this test would pass over nothing").toBeGreaterThan(0);
    const granting = contentGranting(count);
    const h = playLadder(FIFTH!, granting);

    expect(h.scene.save.questFlags[badgeFlagFor(FIFTH!.id, balance)], "the fifth badge was not won").toBe(true);
    expect(
      masterHeld(h.scene.save),
      `five played gym fights left ${String(masterHeld(h.scene.save))} ${MASTER_TIER} in the bag; ` +
        `the ruling grants ${String(count)}. undefined means the grant never fired, and ` +
        `${String(count * 2)} means it fired twice.`,
    ).toBe(count);

    // ONE entry, and it is the one that explains the bag — a direct write to `save.items` passes the
    // assertion above and leaves `replay()` rebuilding a different bag (L10).
    expect(
      grantsOn(h.scene.save).filter((g) => MASTER_TIER in g),
      "the grant is not on the tape, or is on it more than once",
    ).toEqual([{ [MASTER_TIER]: count }]);
  });

  it("⚠ …and NO EARLIER leader hands them over — four wins before the fifth grant nothing", () => {
    const granting = contentGranting(balance.economy.masterSnareGrant);
    for (const leader of LADDER.slice(0, 4)) {
      const h = playLadder(leader, granting);
      // WAS `.toBeUndefined()`, AND THE CHANGE IS A STRENGTHENING, NOT A RELAXATION.
      // That assertion used KEY ABSENCE as the proof the fifth-gym grant had not fired early. Snare
      // metering made every tier a present key from boot (core/save.ts `emptyMeteredBag`), so "did
      // not fire" is now `0` rather than a missing key. `undefined` was the weaker claim of the two:
      // it was equally satisfied by the key having VANISHED, which under the old unmetered contract
      // meant the tier had silently become unlimited again. `0` says the meter is on and the bag is
      // empty, which is the thing this test is actually about.
      expect(
        masterHeld(h.scene.save),
        `beating ${leader.id} (act ${String(leader.act)}) handed over ${MASTER_TIER}`,
      ).toBe(0);
    }
  });

  it("⚠ A FINISH HANDLER THAT FIRES TWICE GRANTS ONCE — the badge flag is the latch", () => {
    /*
     * THE ASSERTION A SOURCE READ CANNOT MAKE. `applyGrant` is additive and not idempotent, and
     * there is no re-entrancy latch on the finish handlers (T-64) — so a launcher bound to two
     * events, a retry, or a second call for any reason would hand over six. The badge flag is read
     * BEFORE `awardBadge` writes it, which is the one piece of state that cannot be true before the
     * first victory and cannot be false after it.
     */
    const count = balance.economy.masterSnareGrant;
    expect(count, "the shipped tunable is 0 — this test would pass over nothing").toBeGreaterThan(0);
    const granting = contentGranting(count);
    let save = freshSave(LADDER[0]!.town);
    let h: Harness | null = null;
    for (const leader of LADDER) {
      h = mount({ save: { ...save, currentNode: leader.town }, startNode: leader.town, content: granting });
      h.press(KEY_G);
      h.frame();
      const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
      expect(launch, `[G] launched no fight at ${leader.town}`).toBeDefined();
      const data = launch!.data as BattleSceneData;
      data.onFinished({ state: settledState(data, "win"), caught: null });
      if (leader.id === FIFTH!.id) {
        expect(masterHeld(h.scene.save), "the first finish granted nothing").toBe(count);
        // The same fight, handed back a second time — the shape T-64 says nothing prevents.
        data.onFinished({ state: settledState(data, "win"), caught: null });
        /*
         * ⚠ MEASURED ON THE TAPE, NOT ON THE BAG, AND THE REASON IS A SEPARATE DEFECT.
         * `core/save.ts` `applyBattleAftermath` REPLACES `items` with the fight's own snapshot
         * (`{ ...aftermath.items }`, core/save.ts:598), and that snapshot was taken at
         * `startBattle` — before the grant. So a second `onFinished` on the same fight rewinds the
         * whole bag to the state it was in when the fight started, and `save.items` afterwards
         * reports `undefined` whether the grant ran once, twice or not at all. That rewind is
         * T-64's blast radius and is not this file's to fix; what it means here is that the BAG
         * cannot witness "granted once" and the append-only tape can.
         */
        expect(
          grantsOn(h.scene.save).filter((g) => MASTER_TIER in g),
          `two calls of one fight's finish handler wrote ` +
            `${String(grantsOn(h.scene.save).filter((g) => MASTER_TIER in g).length)} ${MASTER_TIER} ` +
            "grants to the tape — L10 wants exactly one, and two is the grant running twice",
        ).toEqual([{ [MASTER_TIER]: count }]);
        break;
      }
      settleYearTurn(h);
      save = h.scene.save;
    }
    expect(h, "the ladder ran no fights at all").not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §S5 THE REFUSAL THE PLAYER MEETS — asserted at the banner, layer by layer
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS SECTION EXISTS: TWO LAYERS, NEITHER ASSERTED, MUTUALLY MASKING
 * ──────────────────────────────────────────────────────────────────────
 * A refused purchase is refused TWICE in this game, and until this section neither refusal was
 * pinned — so each one hid the other's absence. Measured, not reasoned about:
 *
 *   LAYER 1, the scene. `OverworldScene.buySelected` returns on `if (row.disabled)` BEFORE it calls
 *     `buy`. Deleting that early return while `game/shop.ts` still throws left the whole suite
 *     green: the model's `ShopError` took over silently, the `catch` below it flashed a banner, and
 *     nothing was measuring WHICH banner.
 *   LAYER 2, the model. `game/shop.ts` `buy` throws on a row `shopRows` has greyed. Replacing both
 *     throws with `return save` — a silent no-op — left 111 tests green across four shop files.
 *   BOTH REMOVED. The scene runs `this.shop = shopRows(…)`, `hudDirty = true`, `refreshHud()`,
 *     `hooks.onSaveChanged?.(…)` and flashes `bought basic · 3 · purse 0 · basic 3` against a purse,
 *     a bag and a tape that never moved — a completed transaction SIGNALLED to the host and to the
 *     screen, and the suite still passed.
 *
 * `tests/unit/shop.test.ts` pins layer 2 at the model. THIS section pins layer 1 at the scene, which
 * is the layer a player actually meets: a key press, and what the screen says back.
 *
 * ⚠ WHY THE BANNER IS COMPARED WHOLE AND NOT SEARCHED FOR A SUBSTRING. The two layers produce two
 * DIFFERENT strings for the same refusal, and only their full text tells them apart:
 *
 *   layer 1 →  `weighted — locked until story.badge.odo`
 *   layer 2 →  `weighted — "weighted" cannot be bought — locked until story.badge.odo`
 *
 * Both carry the row's id and the row's `reason`, both leave the purse, the bag and the tape
 * untouched, and both keep the shelf open. A test that asked "does the banner mention the reason"
 * would pass on either — which is exactly how deleting layer 1 stayed green. The equality below is
 * therefore the whole assertion, not a stylistic preference, and `not.toContain(`"${row.id}"`)`
 * names the tell in the other direction: the quoted id is `ShopError`'s own grammar
 * (`"${itemId}" cannot be bought — …`, game/shop.ts) and appears in no banner the scene writes
 * itself. Neither string is typed here — both are built from the row the model handed the scene.
 *
 * The positive control (§S5.2) is what stops all of this passing on a shop where nothing works at
 * all, and it doubles as the proof that {@link bannerObj} names the right object: it is the only
 * test here that requires the banner to say a purchase HAPPENED.
 */

/**
 * THE BANNER OBJECT ITSELF — not "some text somewhere on screen", and the difference is the point.
 *
 * `refreshHud` prints every greyed row's own `reason` into the shelf (`shopLines`), so a test that
 * read {@link Harness.hud} for the refusal would find it there whether or not the key press was
 * answered AT ALL — the shelf says "locked until …" on a frame nobody pressed anything. The banner
 * is the only surface on this screen that says something happened BECAUSE a key was pressed.
 *
 * Found by POSITION, not by copy: the scene builds it as
 * `this.add.text(HUD_PAD, this.scale.height - HUD_PAD, "", BANNER_STYLE)`, so it is the bottom-most
 * text on a 480×320 screen — below the HUD and below `game/ui/SeasonMeter.ts`'s label, both of which
 * sit at `HUD_PAD` from the top. The uniqueness check turns a future third text object at the foot
 * of the screen into a red test rather than a silent misreading, and §S5.2 proves the identification
 * from the other end by requiring this object to carry the success line.
 */
function bannerObj(h: Harness): FakeObj {
  const texts = h.parts.objects.filter((o) => o.kind === "text");
  expect(texts.length, "the overworld drew no text at all — there is no banner to read").toBeGreaterThan(0);
  const lowest = texts.reduce((a, b) => (b.y > a.y ? b : a), texts[0]!);
  expect(
    texts.filter((o) => o.y === lowest.y).length,
    "two text objects share the bottom of the screen, so the bottom-most one is no longer the banner",
  ).toBe(1);
  return lowest;
}

/** What the banner is saying right now. */
function bannerText(h: Harness): string {
  return bannerObj(h).text;
}

/**
 * The whole save, canonically serialised — `core/save.ts` `serialize`, which is build-doc §8.1's own
 * comparison and not a hand-rolled projection of it.
 *
 * Used instead of reading `money`, `items` and `actionLog` one at a time BECAUSE a refused press is
 * a claim about the entire save: with the shelf open `update` spends the frame on `updateShop` and
 * returns, so nothing else in the scene may write anything either. The named fields are asserted
 * beside it anyway, because "the save moved" is not a failure message anyone can act on.
 */
function savedAs(save: SaveEnvelope): string {
  return serialize(save);
}

/** More than the whole shelf costs, summed from the shelf itself so no purse figure is typed (G11). */
const RICH_PURSE = shopRows(freshSave(), balance).reduce((sum, row) => sum + row.price, 0) * 2;

/** The row under the cursor right now — the one the next [E] will actually reach. */
function rowUnderCursor(h: Harness) {
  const rows = h.scene.shopOnScreen();
  const at = h.scene.shopCursorAt();
  const row = rows[at];
  expect(row, `the shop cursor is at ${String(at)} and the shelf has ${String(rows.length)} rows`).toBeDefined();
  return row!;
}

/**
 * Everything that must be true after [E] on a greyed row, in one place because §S5.1 makes the same
 * statement about two DIFFERENT refusals (a purse that cannot pay, and a badge that has not been
 * won) and the statement is the interesting thing, not the number of copies of it.
 */
function expectRefusedAtTheScene(h: Harness, label: string): void {
  const row = rowUnderCursor(h);
  expect(row.disabled, `${label}: the row under the cursor is not greyed — this asserts nothing`).toBe(true);
  expect(row.reason, `${label}: a greyed row carries no reason to surface`).not.toBeNull();
  const reason = row.reason!;
  const before = savedAs(h.scene.save);
  const moneyBefore = h.scene.save.money;
  const itemsBefore = { ...h.scene.save.items };
  const tapeBefore = [...h.scene.save.actionLog];

  h.press(KEY_E);
  h.frame();

  // 1. THE PLAYER IS TOLD, and told by the SCENE. See the section docblock: the equality is what
  //    separates the scene's own refusal from the model's exception being caught behind it.
  expect(
    bannerText(h),
    `${label}: [E] on a greyed row must answer with the shelf's own refusal. A banner reading ` +
      `\`${row.id} — "${row.id}" cannot be bought — …\` means the scene stopped refusing and is ` +
      "reporting game/shop.ts's exception instead; an unchanged banner means the press was swallowed",
  ).toBe(`${row.id} — ${reason}`);
  expect(
    bannerText(h),
    `${label}: the banner is quoting ShopError, so the scene's own guard did not fire`,
  ).not.toContain(`"${row.id}"`);

  // 2. NOTHING ANYWHERE CLAIMS A PURCHASE. `bought ` is the first word of the success banner and of
  //    nothing else the overworld writes, so this covers the HUD and the shelf as well as the banner.
  expect(
    h.hud(),
    `${label}: something on screen reports a purchase that did not happen`,
  ).not.toMatch(/(^|\n)bought /);

  // 3. AND THE SAVE DID NOT MOVE — byte-identical, not "close enough".
  expect(h.scene.save.money, `${label}: a refused press moved the purse`).toBe(moneyBefore);
  expect(h.scene.save.items, `${label}: a refused press moved the bag`).toEqual(itemsBefore);
  expect(h.scene.save.actionLog, `${label}: a refused press wrote to the tape`).toEqual(tapeBefore);
  expect(savedAs(h.scene.save), `${label}: the save is not byte-identical after a refused press`).toBe(before);

  // 4. …and the room is still a shop. A refusal that closed the shelf would strand the player one
  //    press away from a conversation they have already read.
  expect(h.scene.isShopping(), `${label}: a refused purchase closed the shop`).toBe(true);
}

describe("§S5 [E] on a greyed row refuses AT THE SCENE, and says so", () => {
  it("⚠ a purse that cannot pay — the banner is the shelf's refusal, and the save is byte-identical", () => {
    const { h, label } = openShopWith(0);
    expectRefusedAtTheScene(h, `${label} · unaffordable`);
  });

  it("⚠ a badge that has not been won — same statement, a refusal that is not about money", () => {
    /*
     * THE SECOND REFUSAL, AND IT IS NOT THE SAME TEST TWICE. `shopRows` orders the two reasons —
     * a locked row says "locked until <flag>" even when the purse is also short — so this row is
     * greyed with a full purse behind it. A scene that gated the press on affordability alone
     * (`save.money >= row.price`) rather than on the row's own `disabled` would sell it, and the
     * unaffordable case above could not see that.
     */
    const { h, label } = openShopWith(RICH_PURSE);
    selectRow(h, GATED_ROW);
    expect(rowUnderCursor(h).id, "the cursor did not land on the gated row").toBe(GATED_ROW);
    expect(
      h.scene.save.money >= rowUnderCursor(h).price,
      "the rig cannot afford the gated row, so this is the unaffordable test again",
    ).toBe(true);
    expectRefusedAtTheScene(h, `${label} · ${WEIGHTED_FLAG}`);
  });

  it("⚠ THE POSITIVE CONTROL — [E] on an affordable row says `bought`, and it is true when it says it", () => {
    /*
     * WITHOUT THIS, EVERY ASSERTION ABOVE PASSES ON A SHOP THAT CANNOT SELL ANYTHING AT ALL — a
     * `buySelected` that returned on its first line would satisfy all of them. This is also the
     * proof that `bannerObj` names the banner: it is the one test here that requires that object to
     * carry a string only `flashBanner` writes.
     *
     * The expected banner is BUILT from the row and the measured save, never typed: `bought <id> ·
     * <price> · purse <after> · <id> <held>` with every number derived, so a retune of
     * `economy.snarePrice` moves this test with it (G11).
     */
    const priced = shopRows(withPurse(freshSave(), RICH_PURSE), balance).find((r) => !r.disabled && r.price > 0);
    expect(priced, "the shelf offers nothing that both costs something and can be bought").toBeDefined();
    const { h, label } = openShopWith(RICH_PURSE);
    selectRow(h, priced!.id);
    const row = rowUnderCursor(h);
    expect(row.disabled, `${label}: ${row.id} is greyed with a full purse — this is not a positive control`).toBe(
      false,
    );
    const before = h.scene.save;
    const heldBefore = before.items[row.id] ?? 0;
    const tapeBefore = before.actionLog.length;

    h.press(KEY_E);
    h.frame();

    const after = h.scene.save;
    expect(after.money, `${label}: ${row.id} did not cost ${String(row.price)}`).toBe(before.money - row.price);
    expect(after.items[row.id], `${label}: ${row.id} was paid for and not handed over`).toBe(heldBefore + 1);

    // TWO tape entries, not one: `game/shop.ts` `buy` logs the price and the consequence separately,
    // because core/save.ts's contract is that an entry is a price or an absolute consequence and
    // never both. Asserted as the exact delta, so a third entry is as red as a missing one.
    const appended = after.actionLog.slice(tapeBefore).map((entry) => {
      const paid = readPayout(entry.action);
      return paid === null ? readGrant(entry.action) : paid;
    });
    expect(
      appended,
      `${label}: the purchase appended ${String(appended.length)} tape entries; L10 wants the price ` +
        "and then the goods, and an entry core/save.ts cannot read back comes through as null",
    ).toEqual([-row.price, { [row.id]: 1 }]);

    expect(
      bannerText(h),
      `${label}: the purchase did not report itself on the banner the way the scene writes it`,
    ).toBe(`bought ${row.id} · ${String(row.price)} · purse ${String(after.money)} · ${row.id} ${String(heldBefore + 1)}`);
  });

  it("⚠ a shelf that went stale between two frames refuses — the catch is a refusal, not a receipt", () => {
    /*
     * THE `catch` AT THE FOOT OF `buySelected`, DRIVEN RATHER THAN ASSUMED. Its docblock says it is
     * there for "a `ShopError` out of an id the shelf stopped offering between two frames", and this
     * is that state, reached through a shipped seam and not by poking the scene:
     *
     *   `buySelected` rebuilds `this.shop` from the new save, refreshes the HUD, and THEN calls
     *   `hooks.onSaveChanged?.(this.save, this)`. A host that writes a different save back inside
     *   that hook — the seam is documented "the save changed — persist it", and it is handed the
     *   scene precisely so it can act on it — leaves the shelf holding rows priced against a purse
     *   that no longer exists. `game/boot.ts` does not do this (it calls `registry.setSave`), so
     *   this is a reachable configuration rather than the shipped one; it is the only route from
     *   outside the scene to a stale shelf, because the shop is modal and `update` returns on it.
     *
     * What it pins: under a no-op `buy` the `catch` NEVER FIRES, control falls through to the
     * success banner, and the scene reports a transaction to the screen and to the host. Here the
     * refusal must reach the player, and it must be the model's — the row the scene is holding says
     * `disabled: false`, so layer 1 cannot fire and layer 2 is the only thing standing.
     *
     * The purse is drained through `core/save.ts`'s own writers, tape and all, for {@link withPurse}'s
     * reason: a save that minted or destroyed coins beside the tape is not a save the game can hold.
     */
    const priced = shopRows(withPurse(freshSave(), RICH_PURSE), balance).find((r) => !r.disabled && r.price > 0);
    expect(priced, "the shelf offers nothing buyable — the stale-row race is unreachable").toBeDefined();

    let armed = false;
    const hooks: NonNullable<OverworldSceneData["hooks"]> = {
      onSaveChanged: (save, scene) => {
        if (!armed) return;
        armed = false;
        const purse = save.money;
        if (purse <= 0) return;
        scene.save = applyPayout(appendAction(save, payoutAction(-purse)), -purse);
      },
    };

    const anchor = SERVICE_ANCHORS.find((a) => roleOfEntry(a.target) === "vendor")!;
    const h = mount({
      save: withPurse(saveAtTown(anchor.bp), RICH_PURSE),
      startNode: anchor.bp.parentNode,
      hooks,
    });
    standAt(h, anchor.bp, anchor);
    h.press(KEY_E);
    h.frame();
    expect(h.scene.isShopping(), "the vendor's anchor did not open the shelf").toBe(true);

    selectRow(h, priced!.id);
    armed = true;
    h.press(KEY_E);
    h.frame();
    expect(bannerText(h), "the first press did not buy — the race cannot be set up from here").toContain(
      `bought ${priced!.id}`,
    );

    // THE STATE IS PROVED BEFORE IT IS TESTED. If the shelf had re-derived itself after the hook,
    // the row would be greyed and this would be §S5.1 again, testing layer 1 a third time.
    const stale = h.scene.shopOnScreen().find((r) => r.id === priced!.id);
    expect(stale?.disabled, "the shelf re-priced itself after the hook, so no row is stale").toBe(false);
    expect(h.scene.save.money, "the hook did not drain the purse").toBe(0);

    const before = savedAs(h.scene.save);
    const tapeBefore = [...h.scene.save.actionLog];
    h.press(KEY_E);
    h.frame();

    expect(
      bannerText(h),
      "the scene reported a second purchase against a purse of 0 — the ShopError was never raised, " +
        "or it was raised and the success banner ran anyway",
    ).not.toMatch(/^bought /);
    expect(h.hud(), "something on screen reports the stale row as sold").not.toMatch(/(^|\n)bought /);
    expect(
      bannerText(h),
      "the refusal does not name the row the player pressed on",
    ).toContain(priced!.id);
    expect(h.scene.save.actionLog, "a refused stale row wrote to the tape").toEqual(tapeBefore);
    expect(savedAs(h.scene.save), "the save is not byte-identical after a refused stale row").toBe(before);
    expect(h.scene.isShopping(), "the caught refusal closed the shop").toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §S6 The shelf is PAINTED — the diagnostics moving behind ?debug=1 did not take it
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ THIS IS THE REGRESSION THE SPLIT WAS MOST LIKELY TO CAUSE, AND THE ONE THAT WOULD HAVE BEEN
 * INVISIBLE. `shopLines()` is spread into the SAME line list as the tile coordinates and the
 * population table, so "hide the HUD" and "hide the diagnostics" look like the same edit and are
 * not: the overworld's text HUD is the ONLY surface that draws the shelf. Hidden, the shop is a
 * modal screen with nothing on it — the player is holding down keys against an invisible cursor.
 *
 * ⚠ AND `Harness.hud` CANNOT SEE THE DIFFERENCE. It joins every text object whether or not Phaser
 * would paint it, and the scene keeps filling the hidden one on purpose — so §S1's `toContain("[E]
 * buy")` stays green with the shelf hidden. Every assertion here reads the PAINTED objects.
 */

/** Only what is actually painted: the text objects Phaser would draw this frame. */
function paintedText(h: Harness): string {
  return h.parts.objects
    .filter((o) => o.kind === "text" && o.visible)
    .map((o) => o.text)
    .join("\n");
}

describe("§S6 an open shelf is on the screen, not only in the scene", () => {
  it("⚠ every row, the purse, the cursor and the key legend are PAINTED with no ?debug flag", () => {
    const { h, label } = openShopWith(RICH_PURSE);
    const painted = paintedText(h);
    const rows = h.scene.shopOnScreen();
    expect(rows.length, `${label} opened an empty shelf — this asserts nothing`).toBeGreaterThan(0);

    expect(painted, `${label}: the purse is not on screen`).toContain(`purse ${String(h.scene.save.money)}`);
    for (const row of rows) {
      expect(painted, `${label}: row "${row.id}" is not on screen`).toContain(row.label);
      expect(painted, `${label}: row "${row.id}" is priced nowhere on screen`).toContain(row.detail);
    }
    expect(painted, `${label}: the key legend is not on screen`).toContain("[E] buy");
    // The cursor is the only thing that says WHICH row the next [E] reaches.
    const under = h.scene.shopOnScreen()[h.scene.shopCursorAt()]!;
    expect(painted, `${label}: nothing on screen marks the row under the cursor`).toContain(`> ${under.label}`);
  });

  it("⚠ the cursor moves ON SCREEN, so the shelf the player is steering is the one they can see", () => {
    const { h, label } = openShopWith(RICH_PURSE);
    const rows = h.scene.shopOnScreen();
    expect(rows.length, `${label}: a one-row shelf cannot show a cursor moving`).toBeGreaterThan(1);
    const first = rows[0]!;

    expect(paintedText(h), `${label}: the cursor does not start on the first row`).toContain(`> ${first.label}`);
    h.hold("down", true);
    h.frame();
    h.hold("down", false);
    h.frame();

    const moved = h.scene.shopOnScreen()[h.scene.shopCursorAt()]!;
    expect(moved.id, `${label}: [down] did not move the cursor — the fixture proves nothing`).not.toBe(first.id);
    expect(paintedText(h), `${label}: the painted cursor did not follow the press`).toContain(`> ${moved.label}`);
    expect(paintedText(h), `${label}: the painted cursor is still on the row it left`).not.toContain(
      `> ${first.label}`,
    );
  });

  it("a greyed row's reason is PAINTED, so the refusal is legible before the key is pressed", () => {
    const { h, label } = openShopWith(0);
    const painted = paintedText(h);
    const greyed = h.scene.shopOnScreen().filter((r) => r.disabled && r.reason !== null);
    expect(greyed.length, `${label}: a purse of 0 greyed nothing — this asserts nothing`).toBeGreaterThan(0);
    for (const row of greyed) {
      expect(painted, `${label}: "${row.id}" is greyed and its reason is on no painted surface`).toContain(
        row.reason!,
      );
    }
  });
});
