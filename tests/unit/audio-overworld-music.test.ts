/**
 * tests/unit/audio-overworld-music.test.ts — THE TOWN HAS A THEME, AND WALKING OUT OF IT CHANGES IT.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `tests/unit/audio.test.ts` proves `musicCueFor` picks §12a's cue for a situation, and
 * `tests/unit/audio-boot-wiring.test.ts` proves the cues reach a real engine. Neither of them runs
 * the OVERWORLD, which is the screen the player spends the run on — and the whole cue layer was
 * green once while nothing in the shipping game called it at all. So the REAL
 * `game/scenes/OverworldScene.ts` is executed here against the recorder stub of Phaser that
 * `tests/unit/overworld-scene.test.ts` established, and every assertion below reads what reached
 * the SOUND HOST.
 *
 * THE THREE THINGS ASSERTED
 * ─────────────────────────
 *   1. **The theme belongs to the NODE, not to the boot.** The call lives in `buildNodeView()`,
 *      which has exactly two callers — `create()` and the node change — so §3 drives a REAL travel
 *      and watches the track change. Put the call in `create()` alone and Hearthollow's theme would
 *      follow the player onto the routes for the rest of the run; §3 is what says so.
 *   2. **Re-entering the same node is free.** `playMusic` on the track already playing answers
 *      `already-playing`, so a restart does not restart the music (§4).
 *   3. **The calendar beats the place.** §12a puts the Festival cue on the year's final season,
 *      every year, and `musicCueFor` reads that flag BEFORE it reads the node (§5). That test is
 *      only worth anything because it also asserts the node's own cue differs from the festival's.
 *
 * ⚠ WHAT WOULD MAKE THIS FILE VACUOUS. The Phaser double below wraps display objects in a `Proxy`
 * that answers unknown methods with chainable no-ops recording NOTHING — an assertion aimed at one
 * of those passes forever. Nothing here asserts on a display object: every assertion reads the
 * sound host's log, which is a plain recorder this file owns, and §1 proves it starts empty, grows
 * only on a real play, and that `mount()` really executed the scene. It would also be vacuous if
 * the two nodes §3 walks between shared one theme, or if the festival cue equalled the node's —
 * §1 and §5 assert both discriminators outright.
 *
 * G2/G11: no cue id, no node id, no volume, no season and no tick is typed in. Cue ids come from
 * `musicCueFor`, node ids from `content.nodes`, the mix from `balance.audio.volume`, and the
 * final-season tick is found by asking `core/clock.ts`'s own `seasonOf`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════════════════════
 * The stub engine — copied from `tests/unit/overworld-scene.test.ts`, which is the file that
 * established it, because `OverworldScene` value-imports Phaser (`class OverworldScene extends
 * Phaser.Scene`) and real Phaser throws under vitest's node environment. It is a RECORDER: display
 * objects remember what was written to them, timers and tweens are queued rather than run, and
 * there is no wall clock and no `Math.random` (G11). Every ⚠ in it is the original's, kept because
 * each one marks a defect that was measured through this double.
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

import { seasonOf } from "@core/clock";
import { newSave, openStreams, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Balance, Content, NodeFile, Season } from "@core/types";
import {
  audio,
  createAudioDirector,
  cueDefinition,
  effectiveVolume,
  installAudio,
  musicCueFor,
  resetAudio,
  type AudioConfig,
  type SoundHandle,
  type SoundHost,
} from "@game/audio";
import { OverworldScene, type OverworldSceneData } from "@game/scenes/OverworldScene";
import { provisionalStarter } from "@game/wild-battle";

const content: Content = validateContent();
const balance: Balance = content.balance;

/** The mix, from data — no volume is written in this file (G11). */
const CONFIG: AudioConfig = {
  master: balance.audio.volume.master,
  music: balance.audio.volume.music,
  sfx: balance.audio.volume.sfx,
  muted: false,
};

/**
 * The cue a node names, asked through the SELECTOR. A copy of §12a's node→theme table in a test is
 * a second table (G3), and a second table agrees with itself and with nothing else.
 */
function nodeCue(nodeId: string): string | null {
  return musicCueFor({ screen: "overworld", nodeId });
}

/** The node a fresh save stands in AND that §12a gives a theme to. Derived, never named (G2). */
function themedStartNode(): NodeFile {
  const node = content.nodes.find((n) => n.walkable && nodeCue(n.id) !== null);
  if (!node) throw new Error("no walkable node in the shipped content carries a §12a theme");
  return node;
}

/** A node one step away whose theme is a DIFFERENT one — what §3 walks to. */
function themedNeighbourOf(node: NodeFile): NodeFile {
  for (const id of node.adjacency) {
    const next = content.nodes.find((n) => n.id === id);
    if (!next || !next.walkable) continue;
    const cue = nodeCue(next.id);
    if (cue !== null && cue !== nodeCue(node.id)) return next;
  }
  throw new Error(`no node adjacent to ${node.id} carries a different §12a theme`);
}

const START: NodeFile = themedStartNode();
const START_CUE: string = nodeCue(START.id) as string;
const NEIGHBOUR: NodeFile = themedNeighbourOf(START);
const NEIGHBOUR_CUE: string = nodeCue(NEIGHBOUR.id) as string;

/** The year's final season, from data (G11) — never a season name written here. */
const FINAL_SEASON: Season | undefined = balance.clock.seasonOrder.at(-1);

/** What §12a's calendar rule answers while standing in START. Derived through the same selector. */
const FESTIVAL_CUE: string = musicCueFor({
  screen: "overworld",
  nodeId: START.id,
  finalSeasonOfYear: true,
}) as string;

/** Every cue the overworld can ask for, walked from the shipped nodes rather than listed here. */
const EVERY_OVERWORLD_CUE: string[] = [
  ...new Set(
    content.nodes
      .map((n) => nodeCue(n.id))
      .concat(FESTIVAL_CUE)
      .filter((id): id is string => id !== null),
  ),
];

/**
 * The first tick of the year that READS as the final season.
 *
 * Found by asking `core/clock.ts`'s own `seasonOf`, never by multiplying `ticksPerSeason` here: a
 * second copy of that arithmetic in a test is exactly the drift INV-3 exists to stop, and a typed
 * tick would be the literal G11 forbids.
 */
function firstTickOfFinalSeason(): number {
  for (let tick = 0; tick < balance.clock.ticksPerYear; tick += 1) {
    if (seasonOf({ year: balance.clock.startYear, tick, subTick: 0 }, balance) === FINAL_SEASON) {
      return tick;
    }
  }
  throw new Error("no tick in the year reads as balance.clock.seasonOrder.at(-1)");
}

/* ════════════════════════════════════════════════════════════════════════════
 * The sound host, as a recorder. Plain object, plain arrays — no Proxy anywhere
 * near it, which is why §1 can prove it is not vacuous.
 * ════════════════════════════════════════════════════════════════════════════ */

interface HostLog {
  played: Array<{ key: string; loop: boolean; volume: number }>;
  stopped: string[];
}

function recordingHost(available: readonly string[]): { host: SoundHost; log: HostLog } {
  const log: HostLog = { played: [], stopped: [] };
  const have = new Set(available);
  const host: SoundHost = {
    has: (key: string): boolean => have.has(key),
    play: (key, options): SoundHandle | null => {
      log.played.push({ key, loop: options.loop, volume: options.volume });
      return {
        stop: (): void => {
          log.stopped.push(key);
        },
        setVolume: (): void => undefined,
      };
    },
  };
  return { host, log };
}

function installRecording(): HostLog {
  const { host, log } = recordingHost(EVERY_OVERWORLD_CUE);
  installAudio(
    createAudioDirector({
      host,
      config: CONFIG,
      files: new Map(EVERY_OVERWORLD_CUE.map((id) => [id, `${id}.ogg`])),
    }),
  );
  return log;
}

/* ════════════════════════════════════════════════════════════════════════════
 * Mounting the real scene — the same two calls Phaser makes, `init` then `create`
 * ════════════════════════════════════════════════════════════════════════════ */

/** One millisecond per tile, so one frame is one whole step. Presentation only. */
const MS_PER_TILE = 1;

interface Harness {
  scene: OverworldScene;
  parts: FakeParts;
  data: OverworldSceneData;
  /** Restart the scene the way `scene.start(Overworld, data)` does — same instance, new create. */
  restart(next?: Partial<OverworldSceneData>): void;
}

function freshSave(nodeId: string): SaveEnvelope {
  const save = newSave(
    { seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes },
    balance,
  );
  // The scene needs a party to be a playable overworld; `provisionalStarter` is the same stand-in
  // `tests/unit/overworld-scene.test.ts` mounts with, and it names no species here (G2).
  const starter = provisionalStarter(content);
  return starter ? { ...save, party: [starter] } : save;
}

function mount(over: Partial<OverworldSceneData> = {}): Harness {
  const data: OverworldSceneData = {
    content,
    save: over.save ?? freshSave(START.id),
    msPerTile: MS_PER_TILE,
    ...over,
  };
  const scene = new OverworldScene();
  const streams = data.streams ?? openStreams(data.save as SaveEnvelope, balance);
  const full: OverworldSceneData = { ...data, streams };
  scene.init(full);
  scene.create();
  const parts = STUB.parts as FakeParts;
  return {
    scene,
    parts,
    data: full,
    restart(next = {}) {
      // Phaser reuses the scene INSTANCE across a restart but tears its display list down; the stub
      // has to reproduce both halves or a later visit would read the previous one's objects.
      parts.objects.length = 0;
      parts.active = true;
      scene.init({ ...full, save: scene.save, ...next });
      scene.create();
    },
  };
}

beforeEach(() => {
  resetAudio();
});

/* ════════════════════════════════════════════════════════════════════════════
 * 1. THE MEASURING INSTRUMENT, AND THE FIXTURE'S OWN DISCRIMINATORS.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the recorder records and the fixture is not empty — without this the rest is worthless", () => {
  it("the shipped slice really has two adjacent nodes whose themes DIFFER", () => {
    // §3 asserts "the track changed". Against two nodes that share one theme, or against a node
    // list that produced no cue at all, that assertion would be about nothing.
    expect(EVERY_OVERWORLD_CUE.length).toBeGreaterThan(0);
    expect(START.adjacency).toContain(NEIGHBOUR.id);
    expect(START_CUE).not.toBe(NEIGHBOUR_CUE);
  });

  it("THE LOOP DISCRIMINATOR: §12a authors the location themes as loops and the festival as a one-shot", () => {
    // §2 reads the loop flag back out of the catalogue rather than stating one, and this is what
    // stops that from being vacuous: a director that ignored `MUSIC_CUES` and passed one constant
    // for everything could not satisfy both rows below. (§12a's festival is a "celebratory jingle
    // into a quiet outro" — a track written to end, over a screen that ends.)
    expect(cueDefinition(START_CUE)?.loop).toBe(true);
    expect(cueDefinition(NEIGHBOUR_CUE)?.loop).toBe(true);
    expect(cueDefinition(FESTIVAL_CUE)?.loop).toBe(false);
  });

  it("the host log starts EMPTY and grows only on a real play", () => {
    const log = installRecording();
    expect(log.played).toEqual([]);
    expect(audio().playMusic(START_CUE).outcome).toBe("played");
    expect(log.played.map((p) => p.key)).toEqual([START_CUE]);
    audio().stopMusic();
    expect(log.stopped).toEqual([START_CUE]);
  });

  it("mount() really RUNS the scene — so a silent log below means silence, not a scene that never built", () => {
    installRecording();
    const h = mount();
    expect(h.scene.save.currentNode).toBe(START.id);
    expect(h.scene.node.id).toBe(START.id);
    expect(h.parts.objects.length, "the overworld drew nothing — the mount is not a witness").toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. ARRIVAL. The node's own theme, at the mix data states.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 opening the overworld plays the node's §12a theme", () => {
  it("create() plays that node's cue, at §12a's own loop setting and the music volume", () => {
    const log = installRecording();
    mount();
    expect(log.played.map((p) => p.key)).toEqual([START_CUE]);
    const first = log.played[0];
    // The loop flag is the CATALOGUE's, read back through it rather than written here — see §1's
    // loop discriminator. A location theme that did not loop would stop mid-town.
    const authored = cueDefinition(START_CUE);
    expect(authored, `"${START_CUE}" is not in the §12a catalogue at all`).not.toBeNull();
    expect(first?.loop).toBe(authored?.loop);
    // The mix is `balance.audio.volume` through `effectiveVolume`, never a number written here.
    expect(first?.volume).toBe(effectiveVolume(audio().config(), "music"));
    expect(audio().currentMusic()).toBe(START_CUE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. THE NODE CHANGE. THE WHOLE REASON THE CALL IS IN `buildNodeView()`.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 walking to another node changes the track", () => {
  /*
   * A REAL NODE CHANGE, not a re-init. `travelTo` is the game's own move — it checks adjacency and
   * the act gate, awaits the destination's art, calls `enterNode` → `buildNodeView`, and spends the
   * travel tick — and this harness can drive it, so it does rather than faking the arrival with a
   * restart. Every assertion is guarded by a check that the travel was NOT refused: a refused
   * travel leaves the music where it was, which is the same log a broken call site produces.
   */
  it("travel plays the destination's theme and stops the one it left", async () => {
    const log = installRecording();
    const h = mount();
    await h.scene.travelTo(NEIGHBOUR.id);
    expect(
      h.scene.save.currentNode,
      "travel was refused — every assertion after this would be vacuous",
    ).toBe(NEIGHBOUR.id);

    expect(log.played.map((p) => p.key)).toEqual([START_CUE, NEIGHBOUR_CUE]);
    expect(log.stopped).toEqual([START_CUE]);
    expect(audio().currentMusic()).toBe(NEIGHBOUR_CUE);
  });

  it("and walking back brings the first theme back", async () => {
    const log = installRecording();
    const h = mount();
    await h.scene.travelTo(NEIGHBOUR.id);
    expect(h.scene.save.currentNode).toBe(NEIGHBOUR.id);
    await h.scene.travelTo(START.id);
    expect(h.scene.save.currentNode, "the walk back was refused").toBe(START.id);

    expect(log.played.map((p) => p.key)).toEqual([START_CUE, NEIGHBOUR_CUE, START_CUE]);
    expect(audio().currentMusic()).toBe(START_CUE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. CONTINUITY. Re-entering the SAME node is free.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 re-entering the node the player is already standing in does not restart the track", () => {
  it("a restart plays nothing new and stops nothing", () => {
    const log = installRecording();
    const h = mount();
    h.restart();
    expect(log.played.map((p) => p.key)).toEqual([START_CUE]);
    expect(log.stopped).toEqual([]);
    expect(audio().currentMusic()).toBe(START_CUE);
  });

  it("the director's own answer for that second ask is `already-playing`", () => {
    installRecording();
    mount();
    expect(audio().playMusic(START_CUE).outcome).toBe("already-playing");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. THE CALENDAR BEATS THE PLACE (§12a's Rules).
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 in the year's final season the festival cue outranks the node's own theme", () => {
  it("THE DISCRIMINATOR: the node's theme and the festival cue are not the same track", () => {
    // Without this, the test below would pass against a `musicCueFor` that had never heard of the
    // calendar at all.
    expect(FESTIVAL_CUE).not.toBe(START_CUE);
    expect(FINAL_SEASON).toBeDefined();
    expect(seasonOf({ year: balance.clock.startYear, tick: firstTickOfFinalSeason(), subTick: 0 }, balance)).toBe(
      FINAL_SEASON,
    );
  });

  it("a save standing in the final season opens on the festival cue, not the town's", () => {
    const log = installRecording();
    const save: SaveEnvelope = { ...freshSave(START.id), tick: firstTickOfFinalSeason() };
    const h = mount({ save });
    expect(h.scene.currentSeason()).toBe(FINAL_SEASON);
    expect(log.played.map((p) => p.key)).toEqual([FESTIVAL_CUE]);
    expect(audio().currentMusic()).toBe(FESTIVAL_CUE);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6. AUDIO CANNOT BE THE REASON THE OVERWORLD FAILS TO OPEN.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 the overworld builds with no director installed at all", () => {
  it("the map still draws and nothing is playing", () => {
    // This is the state every OTHER suite in the repo runs the scene in — including the 6,800-line
    // `tests/unit/overworld-scene.test.ts` — so it is also the assertion that keeps this lane from
    // breaking them.
    let h: Harness | null = null;
    expect(() => {
      h = mount();
    }).not.toThrow();
    expect(audio().currentMusic()).toBeNull();
    expect((h as unknown as Harness).parts.objects.length).toBeGreaterThan(0);
  });
});
