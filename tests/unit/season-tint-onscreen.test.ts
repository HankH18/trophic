/**
 * tests/unit/season-tint-onscreen.test.ts — THE SEASON TINT, ON THE SCREEN, AS THE CLOCK CROSSES.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Hard Req 6 says season variation is a runtime tint. Two suites already cover parts of that and
 * NEITHER of them drives the game:
 *
 *   • `tests/unit/year-turn-ux.test.ts` unit-tests `seasonTint` / `seasonTintsForYear` /
 *     `yearDarkening`. It proves the MATHS — that the four readings come out of `balance.seasonTint`
 *     with the brightness and year-darkening terms applied once each.
 *   • `tests/unit/balance-inv3.test.ts` calls `applySeasonTint(fakeTarget, …)`. It proves the
 *     FUNCTION honours balance — that what it hands a target is the colour balance.json implies.
 *
 * Measured before this file: `game/mapview.ts` `MapView.setSeason` had NO covering test at all. So
 * every green above was green for a game in which the clock could roll from spring to winter with
 * the map image never repainted — the maths would still be right, `applySeasonTint` would still be
 * right, and the player would still be looking at spring in December. Nothing asserted that walking
 * the clock forward changes the image on screen. That is the gap, and this file is only about it.
 *
 * WHAT IS ACTUALLY DRIVEN
 * ──────────────────────
 * The shipping chain, end to end, through the real `OverworldScene`:
 *
 *   `restAtInn(town)` → `spendTicks("inn", …)` → `core/clock.ts` `advanceAction` emits a
 *   `seasonBoundary` → `handleClockEvents` → `this.mapView.setSeason(this.currentSeason())` →
 *   `MapView.setSeason` recomputes `seasonTint(balance, season, year)` → `applySeasonTint(image, …)`
 *   → `image.setTint(tint.color)`.
 *
 * No hook short-circuits it: `handleClockEvents` returns early when `hooks.onClockEvents` answers
 * `true`, so this file mounts with NO such hook and lets the scene do the whole thing itself.
 *
 * ⚠ THE STUB TRAP THIS FILE IS BUILT AROUND — READ BEFORE EDITING THE RECORDER.
 * The repo's Phaser double (`tests/unit/overworld-scene.test.ts`, `tests/unit/overworld-shop.test.ts`)
 * wraps every fake display object in a `Proxy` whose `get` trap answers ANY unknown method with a
 * chainable no-op. `setTint` is not one of the methods those files record — so under that stub the
 * whole chain above would run, swallow its last call, and record NOTHING. A test written against it
 * would pass against a tint that never reached a pixel: exactly the failure mode the suite is
 * supposed to catch. So `setTint` (and `setTexture`, for §4) is recorded EXPLICITLY here, on the
 * object and in a parts-level log, and §5 exists to prove the recorder is not vacuous.
 *
 * G2/G11: no town, season or tick count is typed in. The inn town comes from `core/recovery.ts`
 * `innNodeIds()`, the seasons from `balance.clock.seasonOrder`, the number of rests from
 * `balance.clock.ticksPerSeason` / `innTicks`, and every expected colour from the real
 * `seasonTint(...)`. The only numbers spelled out below belong to the §3 measuring instrument — the
 * 8-bit channel packing (`packRgb`'s own format, sanity-checked against it), the sRGB→Lab constants,
 * the ground the separation is measured over and the ΔE floor. Those are colour science and a test
 * tolerance; none of them is a gameplay constant and no pixel the player sees moves if they change.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════════════════════
 * The stub engine — a RECORDER, not a renderer
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
  displaySize: { w: number; h: number } | null;
  /**
   * ⚠ THE WHOLE POINT OF THIS FILE. Every `setTint` colour, in order.
   *
   * RECORDED RATHER THAN LEFT TO THE PROXY: `applySeasonTint` ends at `target.setTint(tint.color)`
   * and nothing else in the chain is observable. A chainable no-op would absorb it silently and
   * every assertion below would pass against a map that was never repainted.
   */
  tints: number[];
  /**
   * Every `setTexture` key, in order — Hard Req 6's other half (`game/mapview.ts:451`, "season is a
   * runtime multiply, never a different texture"). Recorded for the same reason: §4 asserts the
   * texture did NOT change across a season boundary, and against a no-op that assertion is true of
   * a `MapView` that swaps textures on every season.
   */
  textureSets: string[];
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
  active: boolean;
  sceneStatus: Map<string, "running" | "shutdown">;
  keysByCode: Map<number, FakeKey>;
  cursors: Record<string, FakeKey>;
  maskPixels: Map<string, { width: number; height: number; data: Uint8ClampedArray }>;
  removes: Array<{ key: string; existed: boolean }>;
  scratch: Set<string>;
  registeredScenes: Record<string, unknown>;
  /**
   * Every tint the scene painted, across ALL objects, with the texture it landed on.
   *
   * The per-object `tints` array answers "did THIS image get repainted"; this answers "was anything
   * painted at all, and onto what" — which is the question that catches a recorder wired to the
   * wrong object, and the one §5 uses to prove the rig is not measuring itself.
   */
  tintLog: Array<{ kind: string; textureKey: string; color: number }>;
}

const STUB = { parts: null as FakeParts | null };

vi.mock("phaser", () => {
  const make = (kind: string, parts: FakeParts): FakeObj => {
    const bag = parts.objects;
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
      tints: [] as number[],
      textureSets: [] as string[],
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
      depth: 0,
      setDepth(d: number): FakeObj {
        o.depth = d;
        return o.self as FakeObj;
      },
      // ⚠ SEE `FakeObj.tints`. This method is the entire observable end of the chain under test.
      setTint(color: number): FakeObj {
        o.tints.push(color);
        parts.tintLog.push({ kind: o.kind, textureKey: o.texture, color });
        return o.self as FakeObj;
      },
      // ⚠ SEE `FakeObj.textureSets`. §4 asserts this never fires for a season change.
      setTexture(key: string): FakeObj {
        o.texture = key;
        o.textureSets.push(key);
        return o.self as FakeObj;
      },
      destroy(): void {
        o.destroyed = true;
        const at = bag.indexOf(o.self as FakeObj);
        if (at >= 0) bag.splice(at, 1);
      },
    } as unknown as FakeObj;
    // Unknown methods stay chainable no-ops — the same discipline the other overworld suites use,
    // so a drawing call added by a shared module (game/placeholder.ts) does not break this file.
    // `setTint` and `setTexture` are lifted OUT of that set on purpose; see their comments.
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
        tintLog: [],
      };
      // The most recently constructed scene is the one under test.
      STUB.parts = parts;
      this.__fake = parts;

      this.add = {
        image: ((x: number, y: number, key: string): FakeObj => {
          const o = make("image", parts);
          o.x = x;
          o.y = y;
          o.texture = key;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        text: ((x: number, y: number, value: string | string[]): FakeObj => {
          const o = make("text", parts);
          o.x = x;
          o.y = y;
          o.text = Array.isArray(value) ? value.join("\n") : value;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        graphics: ((): FakeObj => make("graphics", parts)) as unknown as (...args: never[]) => unknown,
        rectangle: ((x: number, y: number, w: number, h: number, fill?: number): FakeObj => {
          const o = make("rect", parts);
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

      // build-doc §7.6's virtual resolution.
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
       * `start()` MUST EMIT `complete` — `game/mapview.ts` `ensureNodeArt` resolves its promise from
       * `scene.load.once(Phaser.Loader.Events.COMPLETE, …)` after `scene.load.start()`, and a
       * blanket no-op here hangs every awaited path at the 30s timeout. Real `LoaderPlugin.start`
       * calls `loadComplete()` inline on an empty queue, so this is the honest double.
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
        remove: ((key: string): void => {
          parts.removes.push({ key, existed: parts.maskPixels.has(key) || parts.scratch.has(key) });
          parts.scratch.delete(key);
        }) as unknown as (...args: never[]) => unknown,
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
import { innNodeIds } from "@core/recovery";
import { newSave, openStreams, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Balance, Content, Season } from "@core/types";
import { packRgb, seasonTint } from "@game/season-tint";
import { provisionalStarter } from "@game/wild-battle";
import { OverworldScene, type OverworldSceneData } from "@game/scenes/OverworldScene";

const content: Content = validateContent();
const balance: Balance = content.balance;

/* ════════════════════════════════════════════════════════════════════════════
 * Everything derived — no town, season or tick count is typed in (G2 / G11)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A town with an inn, taken from `core/recovery.ts` `innNodeIds()` — which derives it from the
 * shipped corpus (a speaker tagged `role: "innkeeper"` whose `home` names a node, intersected with
 * that speaker having a `kind: "service"` beat there). Never a name typed into a test.
 *
 * Preferring a WALKABLE one because `restAtInn` is being used as a clock driver here and a node the
 * vertical slice actually visits is the honest place to stand; the fallback keeps this file working
 * if the walkable flags move.
 */
const INN_TOWN: string = (() => {
  const inns = innNodeIds();
  const walkable = inns.find((id) => content.nodes.some((n) => n.id === id && n.walkable));
  const chosen = walkable ?? inns[0];
  if (chosen === undefined) throw new Error("the shipped corpus declares no inn town to rest at");
  return chosen;
})();

/**
 * How many rests it takes to cross EVERY season boundary in a year.
 *
 * `core/clock.ts` emits a `seasonBoundary` on the first `seasonOrder.length - 1` multiples of
 * `ticksPerSeason` — the last one belongs to the year turn (build-doc §7.5 step 5) — so reaching
 * `ticksPerSeason * (seasonOrder.length - 1)` ticks is exactly "all of them, and no year turn".
 * `advance` stops the loop AT each boundary, so an `innTicks` charge that straddles one still emits
 * it; that is why a cost that does not divide `ticksPerSeason` is fine here.
 */
const TICKS_TO_LAST_BOUNDARY = balance.clock.ticksPerSeason * (balance.clock.seasonOrder.length - 1);
const RESTS_ACROSS_THE_YEAR = Math.ceil(TICKS_TO_LAST_BOUNDARY / balance.clock.innTicks);
/** Just past the FIRST boundary — the smallest walk that proves one season change. */
const RESTS_TO_FIRST_BOUNDARY = Math.ceil(balance.clock.ticksPerSeason / balance.clock.innTicks);

/* ════════════════════════════════════════════════════════════════════════════
 * The rig
 * ════════════════════════════════════════════════════════════════════════════ */

interface Harness {
  scene: OverworldScene;
  parts: FakeParts;
}

function freshSave(nodeId: string): SaveEnvelope {
  const save = newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);
  const starter = provisionalStarter(content);
  return starter ? { ...save, party: [starter] } : save;
}

/**
 * Mount the REAL scene, OUTDOORS in the inn town.
 *
 * ⚠ NO `hooks.onClockEvents`. `handleClockEvents` opens with
 * `if (this.hooks.onClockEvents?.(events, this) === true) return;` — a hook that answers `true`
 * takes the whole boundary away from the scene, `setSeason` included, and every assertion in this
 * file would then be about the rig rather than about the game.
 */
function mount(over: Partial<OverworldSceneData> = {}): Harness {
  const data: OverworldSceneData = {
    content,
    save: over.save ?? freshSave(INN_TOWN),
    ...over,
  };
  const scene = new OverworldScene();
  const streams = data.streams ?? openStreams(data.save as SaveEnvelope, balance);
  scene.init({ ...data, streams });
  scene.create();
  return { scene, parts: STUB.parts as FakeParts };
}

/** The painted map's display object — taken from `MapView.image` itself, never guessed out of the bag. */
function mapImage(h: Harness): FakeObj {
  return h.scene.mapView.image as unknown as FakeObj;
}

/** One tint that actually reached the screen, and the clock reading it was painted for. */
interface Applied {
  season: Season;
  year: number;
  color: number;
  /** How many `setTint` calls the map image had received by then — §5's growth check. */
  count: number;
}

/**
 * Rest `rests` times and record every tint that reached the map, with the season the SCENE says it
 * is standing in at that moment.
 *
 * The expected season is `OverworldScene.currentSeason()` — i.e. the production
 * `seasonOf(this.clock(), balance)` — and never an index this file maintains, so a retune of
 * `ticksPerSeason` or `seasonOrder` moves the expectation with the game instead of reddening here.
 *
 * Every rest asserts its own charge. `restAtInn` refuses silently through `flashBanner` when the
 * screen is handed over or the town has no inn, and a refused rest spends nothing — so without this
 * the whole walk could stand still and the sequence assertion would simply see one season.
 */
function restAndRecord(h: Harness, rests: number): Applied[] {
  const img = mapImage(h);
  const out: Applied[] = [];
  const record = (): void => {
    const color = img.tints.at(-1);
    if (color === undefined) return;
    out.push({ season: h.scene.currentSeason(), year: h.scene.save.year, color, count: img.tints.length });
  };
  // What `create()` left on screen, before the clock has moved at all.
  record();
  let seen = img.tints.length;
  for (let i = 0; i < rests; i += 1) {
    const tickBefore = h.scene.save.tick;
    h.scene.restAtInn(INN_TOWN);
    expect(
      h.scene.save.tick,
      `rest ${String(i + 1)} at ${INN_TOWN} was refused — the clock did not move`,
    ).toBe(tickBefore + balance.clock.innTicks);
    if (img.tints.length > seen) {
      seen = img.tints.length;
      record();
    }
  }
  return out;
}

/** Consecutive duplicates collapsed — a boundary that repaints the same season is not a new season. */
function runs<T>(values: readonly T[]): T[] {
  const out: T[] = [];
  for (const v of values) if (out.at(-1) !== v) out.push(v);
  return out;
}

/* ── colour, for the separation assertions ────────────────────────────────── */

const CHANNEL_BITS = 8;
const CHANNEL_MASK = 0xff;

/** The inverse of `game/season-tint.ts` `packRgb`. §3 checks it round-trips rather than trusting it. */
function unpack(color: number): { r: number; g: number; b: number } {
  return {
    r: (color >> (CHANNEL_BITS * 2)) & CHANNEL_MASK,
    g: (color >> CHANNEL_BITS) & CHANNEL_MASK,
    b: color & CHANNEL_MASK,
  };
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * ⚠ THE INSTRUMENT TRAVELS WITH THE FIGURE — that is why the whole conversion is spelled out here
 * rather than quoted as a number in a comment.
 *
 * OPERATOR, stated in full so a second lane can reproduce it:
 *   1. Phaser's tint is a MULTIPLY in the fragment shader: `out = src * tint / 255`, per channel,
 *      in float. No 8-bit rounding of the product — the GPU stores 8-bit at the end, but rounding
 *      first was measured not to move the answer meaningfully either way.
 *   2. sRGB → linear: `c/255`, then `c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`.
 *   3. linear RGB → XYZ with the sRGB matrix, then XYZ → CIE Lab at the **D65** white point
 *      (Xn 0.95047, Yn 1.0, Zn 1.08883) with the CIE ε = 216/24389, κ = 24389/27 form.
 *   4. CIE76 ΔE — plain euclidean distance in Lab.
 */
const D65: Rgb = { r: 0.95047, g: 1.0, b: 1.08883 };

function srgbToLinear(channel: number): number {
  const c = channel / CHANNEL_MASK;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function labOf(rgb: Rgb): { L: number; a: number; b: number } {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / D65.r;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / D65.g;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / D65.b;
  const eps = 216 / 24389;
  const kappa = 24389 / 27;
  const f = (t: number): number => (t > eps ? Math.cbrt(t) : (kappa * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** The tinted pixel: `src` seen through `tint`, Phaser's multiply. */
function tinted(ground: Rgb, color: number): Rgb {
  const t = unpack(color);
  return {
    r: (ground.r * t.r) / CHANNEL_MASK,
    g: (ground.g * t.g) / CHANNEL_MASK,
    b: (ground.b * t.b) / CHANNEL_MASK,
  };
}

/** CIE76 ΔE between the SAME ground seen through two different season tints. */
function deltaE76(ground: Rgb, a: number, b: number): number {
  const p = labOf(tinted(ground, a));
  const q = labOf(tinted(ground, b));
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

/** Every unordered pair of the values, with its reading under `measure`. */
function pairwise<T>(
  values: readonly T[],
  label: (v: T) => string,
  measure: (a: T, b: T) => number,
): Array<{ pair: string; value: number }> {
  const out: Array<{ pair: string; value: number }> = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i] as T;
      const b = values[j] as T;
      out.push({ pair: `${label(a)}/${label(b)}`, value: measure(a, b) });
    }
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 — the tint reaches the screen at all
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the season tint reaches the map image", () => {
  let h: Harness;
  beforeEach(() => {
    h = mount();
  });

  it("`create()` leaves the map image tinted for the clock's own season", () => {
    const img = mapImage(h);
    expect(img.tints.length, "the map image was never tinted — nothing painted the season").toBeGreaterThan(0);

    const expected = seasonTint(balance, seasonOf(h.scene.clock(), balance), h.scene.save.year).color;
    expect(img.tints.at(-1), "the map is showing a colour the clock does not imply").toBe(expected);
  });

  it("the scene's own season read and the map view's agree at mount", () => {
    // `MapView.currentSeason()` is what was last handed to `setSeason`; `OverworldScene
    // .currentSeason()` is `seasonOf(clock)`. A drift between them is a map painted for a season the
    // clock is not in — invisible to every existing test, because neither of them reads both.
    expect(h.scene.mapView.currentSeason()).toBe(h.scene.currentSeason());
    expect(h.scene.mapView.tint.color).toBe(mapImage(h).tints.at(-1));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 — it CHANGES, driven through the real clock
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 crossing a season boundary repaints the map", () => {
  it("one boundary is enough to repaint it, with a different colour", () => {
    const h = mount();
    const img = mapImage(h);
    const before = img.tints.length;
    const colourBefore = img.tints.at(-1);
    const seasonBefore = h.scene.currentSeason();

    restAndRecord(h, RESTS_TO_FIRST_BOUNDARY);

    expect(h.scene.currentSeason(), "the walk never left the opening season").not.toBe(seasonBefore);
    expect(img.tints.length, "the season changed and the map was never repainted").toBeGreaterThan(before);
    expect(img.tints.at(-1)).not.toBe(colourBefore);
    expect(img.tints.at(-1)).toBe(seasonTint(balance, h.scene.currentSeason(), h.scene.save.year).color);
  });

  it("a year of rests paints every season in `balance.clock.seasonOrder`, in order", () => {
    const h = mount();
    const applied = restAndRecord(h, RESTS_ACROSS_THE_YEAR);

    expect(runs(applied.map((a) => a.season)), "the seasons did not reach the screen in calendar order").toEqual([
      ...balance.clock.seasonOrder,
    ]);

    // Every painted colour is the one `seasonTint` computes for the season and YEAR it was painted
    // at — the real function, not a table restated here.
    for (const a of applied) {
      expect(a.color, `${a.season} y${String(a.year)} was painted a colour seasonTint does not produce`).toBe(
        seasonTint(balance, a.season, a.year).color,
      );
    }
  });

  it("the walk stays inside one year — this is a season test, not a year-turn test", () => {
    const h = mount();
    restAndRecord(h, RESTS_ACROSS_THE_YEAR);
    // `ticksPerYear` is not reached, so `yearDarkening` is constant across the four readings and the
    // separation asserted in §3 is the SEASON's doing and nothing else's.
    expect(h.scene.save.year).toBe(balance.clock.startYear);
    expect(h.scene.save.tick).toBeLessThan(balance.clock.ticksPerYear);
    expect(h.scene.save.tick).toBeGreaterThanOrEqual(TICKS_TO_LAST_BOUNDARY);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 — the four readings are actually different
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ WHY THE MEASURE IS CIE76 ΔE ON A NAMED GROUND, AND WHY TWO OBVIOUS MEASURES ARE REFUSED.
 *
 * The primary assertion is on the packed `0xRRGGBB` value — the literal integer handed to
 * `setTint`. That is the thing the game applies and it cannot be argued with. The perceptual
 * assertion below exists because "four distinct integers" is compatible with four tints nobody could
 * tell apart, and it is deliberately NOT either of these two:
 *
 *   ✗ LUMINANCE. Spring and summer are all but the same brightness. Over the ground below their ΔL
 *     lands in the low single digits (measurements from two lanes disagree on the exact figure but
 *     agree on the magnitude), so a luminance assertion would sit just above zero on that pair and
 *     pass forever while the two collapsed into one picture.
 *   ✗ THE SIGN OF (r − g). Looks like a clean hue test and is not one: on today's presets spring is
 *     negative, summer positive, autumn positive, **winter negative** — so it splits the four into
 *     {spring, winter} and {summer, autumn} and would pass with spring and winter IDENTICAL.
 *
 * Both are the same mistake: a measure chosen because it separates the pair you are worried about,
 * without checking that it separates the pairs you are not. So the assertion below is over ALL SIX
 * pairs, never the one at risk.
 *
 * THE GROUND IS PART OF THE MEASURE, SO IT IS NAMED. A tint is a multiply: how far apart two seasons
 * look depends on what is underneath them, and on a near-black ground nothing separates at all.
 * {@link MEADOW_GROUND} is a mid-toned route green — the worst of the grounds tried, giving roughly
 * HALF the separation the same four tints get over a neutral grey. Stated because a reader who
 * retunes the presets against a neutral swatch will believe they have twice the headroom they have.
 *
 * ⚠ NO ΔE FIGURE IS QUOTED HERE AS A FACT, ON PURPOSE. Two lanes computed these six values from the
 * same `data/balance.json` through the same stated operator and got different numbers — the
 * spring/summer minimum came out ≈10.9 for one and ≈12.7 for the other, and 8-bit rounding of the
 * tinted pixel did not account for the gap. Neither reading has been reconciled, so neither is
 * written down here as truth. Instead the six readings are computed LIVE on every run by the
 * instrument spelled out at {@link labOf}, they are reported in the assertion's own message, and
 * only the FLOOR is asserted.
 */
const MEADOW_GROUND: Rgb = { r: 104, g: 152, b: 88 };

/**
 * The floor, in CIE76 ΔE. A TEST TOLERANCE, not a gameplay constant — nothing under `game/` or
 * `core/` reads it and no pixel moves if it changes. Chosen below the lowest reading either lane
 * produced (≈10.9) so the disagreement above cannot decide the outcome, and far above the ~2 ΔE at
 * which two colours stop being reliably tellable apart — so it still reds on a retune that collapses
 * spring against summer.
 */
const DELTA_E_FLOOR = 8;

describe("§3 the seasons are distinguishable on screen", () => {
  it("all four applied tints are pairwise distinct as VALUES", () => {
    const h = mount();
    const applied = restAndRecord(h, RESTS_ACROSS_THE_YEAR);
    const colours = applied.map((a) => a.color);

    expect(
      new Set(colours).size,
      `two seasons painted the same colour: ${applied.map((a) => `${a.season}=${a.color.toString(16)}`).join(" ")}`,
    ).toBe(balance.clock.seasonOrder.length);
  });

  it("the unpacker this file measures with round-trips through `packRgb`", () => {
    // Non-vacuity for §3's own instrument: a broken `unpack` would make every separation figure
    // below meaningless, and it would do so quietly.
    for (const season of balance.clock.seasonOrder) {
      const colour = seasonTint(balance, season, balance.clock.startYear).color;
      expect(packRgb(unpack(colour))).toBe(colour);
    }
  });

  it("every pair of seasons is perceptibly apart over the route green (CIE76 ΔE)", () => {
    const h = mount();
    const applied = restAndRecord(h, RESTS_ACROSS_THE_YEAR);
    expect(applied.length).toBe(balance.clock.seasonOrder.length);

    // All six pairs, computed live from what actually reached the screen — never a stored table.
    const readings = pairwise(
      applied,
      (a) => a.season,
      (a, b) => deltaE76(MEADOW_GROUND, a.color, b.color),
    );
    const report =
      `ground rgb(${String(MEADOW_GROUND.r)},${String(MEADOW_GROUND.g)},${String(MEADOW_GROUND.b)}) · ` +
      "Phaser multiply src*tint/255, then CIE76 ΔE in CIE Lab (D65, sRGB linearisation) · " +
      readings.map((p) => `${p.pair} ${p.value.toFixed(2)}`).join(" · ");

    for (const { pair, value } of readings) {
      expect(
        value,
        `${pair} is ΔE ${value.toFixed(2)} — under the floor of ${String(DELTA_E_FLOOR)}, those two ` +
          `seasons look the same on screen. All six readings this run: ${report}`,
      ).toBeGreaterThan(DELTA_E_FLOOR);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 — Hard Req 6: a multiply, never a texture or a mask swap
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 a season change touches the colour and nothing else", () => {
  it("the map keeps its texture, and the collision grid is untouched", () => {
    const h = mount();
    const img = mapImage(h);

    const textureBefore = img.texture;
    const textureSetsBefore = img.textureSets.length;
    const tintsBefore = img.tints.length;
    const gridBefore = h.scene.collision.grid;
    const bitsBefore = Array.from(gridBefore.bits);

    restAndRecord(h, RESTS_TO_FIRST_BOUNDARY);

    // The season DID change — otherwise everything below is trivially true.
    expect(img.tints.length, "no repaint happened, so this proves nothing").toBeGreaterThan(tintsBefore);

    expect(img.texture, "the season swapped the map's texture — Hard Req 6 forbids seasonal art").toBe(textureBefore);
    expect(img.textureSets.length, "`setTexture` was called for a season change").toBe(textureSetsBefore);

    // Identity first: `buildNodeView` is what makes a new grid, and a season must never reach it.
    expect(h.scene.collision.grid, "the collision was rebuilt for a season change").toBe(gridBefore);
    expect(Array.from(h.scene.collision.grid.bits), "the collision bits moved with the season").toEqual(bitsBefore);
    expect(h.scene.collision.grid.cols).toBe(gridBefore.cols);
    expect(h.scene.collision.grid.rows).toBe(gridBefore.rows);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 — the recorder is not vacuous
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 the rig would notice if the tint stopped reaching the screen", () => {
  it("the recorder sees a tint at construction, on the map's own texture", () => {
    const h = mount();
    const img = mapImage(h);
    expect(img.tints.length).toBeGreaterThan(0);
    expect(
      h.parts.tintLog.some((e) => e.kind === "image" && e.textureKey === img.texture),
      "no `setTint` was recorded against the map image's texture — the recorder is wired to nothing",
    ).toBe(true);
  });

  it("the count of recorded tints GROWS as the year is walked", () => {
    const h = mount();
    const applied = restAndRecord(h, RESTS_ACROSS_THE_YEAR);
    const first = applied[0];
    const last = applied.at(-1);
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(
      (last as Applied).count,
      "the map image was tinted once and never again — `setSeason` is not reaching it",
    ).toBeGreaterThan((first as Applied).count);
  });

  it("exactly `seasonOrder.length` distinct colours were painted — not one", () => {
    // The assertion that fails if `handleClockEvents` stops calling `setSeason`: with the call gone
    // the walk paints the opening season once and the set has ONE member.
    const h = mount();
    const colours = new Set(restAndRecord(h, RESTS_ACROSS_THE_YEAR).map((a) => a.color));
    expect(colours.size).toBe(balance.clock.seasonOrder.length);
    expect(colours.size).toBeGreaterThan(1);
  });
});
