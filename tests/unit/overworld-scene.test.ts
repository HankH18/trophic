/**
 * tests/unit/overworld-scene.test.ts — the OVERWORLD, EXECUTED (build-doc §15 lane C2).
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Before it, no test exercised a single behaviour of `game/scenes/OverworldScene.ts`. An independent
 * audit proved that by sabotage: it replaced the one line that makes encounters read the LIVE save
 *
 *     return state ? fromNodeState(file, state) : toEcoNode(file);   →   return toEcoNode(file);
 *
 * — so a species caught to extinction would keep spawning forever and the cascade would be invisible
 * — and the whole gate + integration suite stayed green, 611 tests passing, `tsc` silent. The only
 * file that mentioned the scene did `readFileSync(...)` and `expect(source).toContain("driveYearTurn")`.
 * A grep over a source file is not a witness (G14).
 *
 * So the scene is RUN here, against a recorder stub of Phaser, and every test below is written to be
 * able to fail:
 *
 *   §1  the encounter roll reads the save, not the shipped JSON — the sabotage above turns this red;
 *   §2  the HUD's counts and the encounter weights are ONE number, including for a node with no
 *       `nodeStates` entry (INV-2), which is where they used to be 0 and non-zero at the same time;
 *   §3  a wild encounter becomes a real battle and a real catch moves a real number (Hard Req 2,
 *       build-doc §1 beat 1) — driven through the REAL `core/battle.ts` reducer;
 *   §4  a trip to the in-run menu and back leaves the player where they were standing;
 *   §5  the collision overlay's flag and its Graphics agree after a restart;
 *   §6  a mask that decodes but cannot be played is refused, out loud, and the player still stands
 *       somewhere legal;
 *   §7  the HUD fits on the 480px virtual screen;
 *   §8  the scene holds no rules — structural, so it cannot acquire one.
 *
 * The stub is a RECORDER, not a renderer: display objects remember what was written to them, timers
 * and tweens are queued rather than run, and there is no wall clock and no `Math.random` (G11).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
        rectangle: ((): FakeObj => make("rect", parts.objects)) as unknown as (...args: never[]) => unknown,
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
        },
        start: (key: string, data: unknown): void => {
          parts.starts.push({ key, data });
        },
        stop: (key: string): void => {
          parts.stops.push(key);
        },
        pause: (): void => {
          parts.paused += 1;
        },
        resume: (): void => {
          parts.resumed += 1;
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

import { RUN_COMPLETE_SHOWN_FLAG, actOf, nodeUnlockedAt, runIsComplete } from "@core/acts";
import { BLACKOUT_ENTRY_ID, blackoutTicks, restBeatAt, wakeNodeFor } from "@core/recovery";
import { startBattle, step as battleStep, caughtIndividual } from "@core/battle";
import { seasonOf, subTicksForAction, ticksForAction } from "@core/clock";
import {
  DIALOGUE,
  actFromFlags,
  selectEntry,
  type DialogueContext,
  type DialogueEntry,
  type DialogueKind,
  type FlagValue,
} from "@core/dialogue-schema";
import { validateContent } from "@core/schemas";
import { EPILOGUE_SHOWN_FLAG, recordVellsireOutcome } from "@game/finale";
import { linesMetAt } from "@game/quests";
import { isNever } from "@core/lifecycle";
import { propDialogueFor, runHeadless, talkEntryFor, transcript, type DialogueRunState } from "@game/dialogue-runner";
import type { DialogueSceneData } from "@game/scenes/DialogueScene";
import { encounterTable, stepsPerForay } from "@game/encounters";
/*
 * §14's inputs. The blueprints are read through `core/interiors.ts`'s own loader and its own
 * solidity predicate, never re-parsed here: the whole point of §14.2 is that the SCENE agrees with
 * that predicate cell for cell, and a second parser in the test would only ever agree with itself.
 */
import {
  INTERIORS,
  PLAN_DOOR,
  planCellIsSolid,
  planCellsWith,
  planCharAt,
  planSize,
  type InteriorBlueprint,
} from "@core/interiors";
import { chooseSpawnTile, loadCollision } from "@game/collision";
import { createMovement, movementConfig, placeAt, spriteWorldPosition } from "@game/movement";
// §15's reach question is asked through the SAME helpers `interact()` asks it through, so the
// fixture and the scene cannot disagree about where a player standing on a tile actually is.
import { propAt, propLabel, propsOf, type WorldPoint } from "@game/props";
import { deserialize, newSave, openStreams, readBlackout, serialize, type SaveEnvelope } from "@core/save";
/*
 * `subsystemRng` is deliberately NOT imported. §3 used to open its own battle stream with it; the
 * stream a battle must run off is the RUN's, which the scene hands over as `BattleSceneData.rng` —
 * see `fightWithSnares`. A fresh stream per fight is the exact thing `beginWildBattle` warns about.
 */
import type { Balance, Content, NodeFile, NodeState, PropPlacement } from "@core/types";
import { OverworldScene, type OverworldSceneData } from "@game/scenes/OverworldScene";
import type { BattleSceneData } from "@game/scenes/BattleScene";
import { SCENE_KEYS } from "@game/scene-keys";
import { finishYearTurn, type YearTurnSceneData } from "@game/scenes/YearTurnScene";
import { buildGymBattle } from "@game/gym-battle";
import { PROVISIONAL_STARTER_UID, liveNodeOf, provisionalStarter, wildBattleProblem } from "@game/wild-battle";
import { interiorAssetPath, interiorTextureKey, maskTextureKey } from "@game/mapview";
import { assetId, hasRealAsset, registerRealAsset } from "@game/placeholder";
import { encounterWeights, indexSpecies } from "@core/foodweb";

const content: Content = validateContent();
const balance: Balance = content.balance;
const species = indexSpecies(content.species);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** What the stub hands `readMaskPixels` — the decoded shape `game/collision.ts` samples. */
interface MaskPixelsForTest {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** The node the vertical slice starts at (build-doc §1). Derived, never typed in (G2). */
const SLICE_NODE = content.nodes.find((n) => n.walkable)?.id ?? content.nodes[0]!.id;

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

/** Rewrite one node's live counts. This is the SAVE, which is what the encounter roll must read. */
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
  data: OverworldSceneData;
  /** Run one frame at the configured pace. */
  frame(ms?: number): void;
  /** Restart the scene the way `scene.start(Overworld, data)` does — same instance, new create. */
  restart(next?: Partial<OverworldSceneData>): void;
  hold(dir: "up" | "down" | "left" | "right", down?: boolean): void;
  press(code: number): void;
  hud(): string;
}

/** One millisecond per tile, so one frame is one whole step and a test can count them. */
const MS_PER_TILE = 1;

function mount(over: Partial<OverworldSceneData> = {}, prepare?: (parts: FakeParts) => void): Harness {
  const data: OverworldSceneData = {
    content,
    save: over.save ?? freshSave(),
    msPerTile: MS_PER_TILE,
    ...over,
  };
  const scene = new OverworldScene();
  /*
   * The stub's `parts` exist as soon as the scene is CONSTRUCTED, and `create()` is where the
   * overworld plays whatever the corpus has queued for the node it is standing in — so a test that
   * needs C7's box registered for an ARRIVAL beat has to register it here, between the two. Doing it
   * after `mount` returns is too late: the beat has already been played headlessly.
   */
  if (prepare && STUB.parts) prepare(STUB.parts);
  const streams = data.streams ?? openStreams(data.save as SaveEnvelope, balance);
  const full: OverworldSceneData = { ...data, streams };
  scene.init(full);
  scene.create();
  const parts = STUB.parts as FakeParts;
  const harness: Harness = {
    scene,
    parts,
    data: full,
    frame(ms = MS_PER_TILE) {
      scene.update(0, ms);
    },
    restart(next = {}) {
      // Phaser reuses the scene INSTANCE across a restart but tears its DISPLAY LIST down
      // (`shutdown` → `displayList.removeAll(true)`), which is the exact asymmetry §5 is about: the
      // fields survive, the objects do not. The stub has to reproduce both halves or §5 would read
      // the previous visit's Graphics and pass for the wrong reason.
      parts.objects.length = 0;
      scene.init({ ...full, save: scene.save, ...next });
      scene.create();
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
  return harness;
}

/**
 * Walk until `steps` tile steps have completed (or `stop` says so), in whichever direction is open.
 *
 * Returns the number of steps actually taken. `stop` is checked after every step, which is how §3
 * catches the encounter that STARTED the battle rather than a later one: once a battle is launched
 * the scene latches and refuses further encounters, so the two would otherwise not be the same
 * animal.
 */
function walk(h: Harness, steps: number, stop?: () => boolean): number {
  const order = ["right", "down", "left", "up"] as const;
  let taken = 0;
  let guard = 0;
  while (taken < steps && guard < steps * 40 + 200) {
    guard += 1;
    if (stop?.() === true) break;
    const before = h.scene.movement.tile;
    for (const dir of order) h.hold(dir, false);
    // Pick a direction that is actually open from here, so a walk never stalls against the border.
    const deltas: Record<(typeof order)[number], { dCol: number; dRow: number }> = {
      up: { dCol: 0, dRow: -1 },
      down: { dCol: 0, dRow: 1 },
      left: { dCol: -1, dRow: 0 },
      right: { dCol: 1, dRow: 0 },
    };
    const open = order.find((d) =>
      h.scene.canEnter({ col: before.col + deltas[d].dCol, row: before.row + deltas[d].dRow }),
    );
    if (!open) break;
    h.hold(open, true);
    h.frame();
    if (h.scene.movement.tile.col !== before.col || h.scene.movement.tile.row !== before.row) taken += 1;
  }
  for (const dir of order) h.hold(dir, false);
  return taken;
}

/**
 * Answer a launched year-turn sequence, so the overworld is handed BACK.
 *
 * ⚠ WITHOUT THIS THE RIG STOPS AT THE FIRST YEAR END. The stub registers `YearTurn`, so
 * `beginYearTurn` takes the real branch: it launches the sequence, pauses the overworld and sets
 * `yearTurnRunning`. Nothing in the stub ever runs YearTurnScene, so `onDone` is never called,
 * `isHandedOver()` stays true for ever and `restAtInn` / `challengeGym` / `spendTicks` all return
 * early. Measured: pressing [R] 5000 times from a fresh save left the save at Y2 tick 0 — one year
 * of play out of ~600 attempted. Every claim this file made about behaviour "across the year turn"
 * was therefore evidence about the tick BEFORE the turn, and the turn's own commit — the aging, the
 * fourth season step and the `syncEvents` in `finish` — had never run here at all.
 *
 * What it does is what YearTurnScene itself does when the retirement card is not registered: take
 * the rolled heir for every prompt (core's documented default for an unanswered prompt) and commit
 * through the same `finishYearTurn` the scene commits through. No shortcut around the real turn.
 */
/**
 * Answer the BATTLE the scene is holding, the way `BattleScene` answers one, and report whether
 * there was one.
 *
 * ⚠ NEEDED SINCE THE RIVAL AND THE FINALE EXIST. `OverworldScene.travelTo` now triggers
 * content-bible §8's rival on arrival, and `finishDialogue` opens the Vellsire fight when the
 * player has just set the snare — so a frame that used to hand over only a year turn can now hand
 * over a fight, and `isHandedOver()` stays true until something answers it.
 *
 * `"loss"` is the DELIBERATE default: it is the outcome that changes the least (no badge, no catch,
 * and — since the rival's loss entry no longer closes his encounter — no progress the test did not
 * ask for). A test that cares which way a fight went answers that fight itself.
 */
type SettledOutcome = "win" | "loss" | "fled" | "caught";

/**
 * The state `BattleScene` would hand back for a fight that ended this way: the REAL battlers, uids,
 * orders and bag `core/battle.ts` `startBattle` builds from the launcher's own input, carrying the
 * reducer's terminal invariant for that outcome.
 *
 * ⚠ IT USED TO BE `{ outcome } as never`, AND THAT LIE HELD A DEFECT OPEN FOR THE WHOLE FILE.
 * `game/wild-battle.ts` `applyBattleResult` — the one writer of `curHp`, `level`, `xp` and the bag
 * off a finished fight — had NO production caller, and every fake here was shaped so that wiring it
 * in would have changed nothing: a state with no `playerOrder` cannot be read for an aftermath. The
 * four launchers call it now, so a fake that omits the party is not a fight the reducer could have
 * produced; it is a `TypeError`. Rebuilding the state through `startBattle` is what makes these
 * tests able to see the write.
 *
 * THE INVARIANTS ARE THE REDUCER'S OWN, not this rig's choice:
 *   • `"loss"` — `core/battle.ts` `finish(…, "loss")` is reached from exactly one condition,
 *     `firstStanding(state, state.playerOrder) === undefined`, so a loss IS a wiped player side.
 *     That is what makes a loss here reach `recoverFromBlackout`, which is the point.
 *   • `"win"` — `fieldNextEnemy` finishes the fight when the enemy order has nobody left standing.
 *   • `"fled"` / `"caught"` — neither side is required to be down.
 *
 * The bag is `startBattle`'s, i.e. the save's: a fake cannot spend a snare it never threw, and a
 * test that wants to see a snare leave the bag has to throw one through the real reducer (§3 does).
 */
function settledState(data: BattleSceneData, outcome: SettledOutcome): BattleSceneState {
  const started = startBattle(data.input, data.ctx).state;
  const down =
    outcome === "loss" ? started.playerOrder : outcome === "win" ? started.enemyOrder : [];
  const battlers = { ...started.battlers };
  for (const uid of down) {
    const battler = battlers[uid];
    if (!battler) continue;
    battlers[uid] = { ...battler, curHp: 0, fainted: true };
  }
  return { ...started, battlers, outcome };
}

/** `BattleScene`'s own `onFinished` state type, without re-spelling it. */
type BattleSceneState = Parameters<BattleSceneData["onFinished"]>[0]["state"];

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
    // `drive.carry` — the WHOLE position across the turn, tick AND sub-tick, and the only spelling
    // of it `YearTurnDrive` still carries. Both places the game commits a turn through go through
    // this one field: `game/scenes/YearTurnScene.ts` `finish()` for the watched turn, and
    // `beginYearTurn`'s headless branch for an unregistered sequence. A harness that read the tick
    // alone would stop mirroring them the moment a cost is fractional — and a battle costs half.
    const { flow, tickBefore, carry } = data.drive;
    while (!flow.done()) flow.chooseHeir();
    h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
    const result = flow.result();
    data.onDone(finishYearTurn(result, tickBefore, carry), result);
  }
}

/** One frame, and then whatever year turn that frame started is played out. */
function frameAndSettle(h: Harness): void {
  h.frame();
  settleYearTurn(h);
}

beforeEach(() => {
  STUB.parts = null;
});

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The encounter roll reads the LIVE save (build-doc §1 beat 1 / §7.2)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 encounters come off save.nodeStates, not off the shipped node JSON", () => {
  it("a node whose SAVED counts are all 0 produces no encounters, while its shipped file is full", () => {
    /*
     * THE SABOTAGE TEST. `liveNode()` reverted to `toEcoNode(file)` — reading the shipped counts —
     * passes every other test in the repo and fails this one, because the shipped file for this node
     * is NOT empty and would keep spawning.
     */
    const shipped = nodeFile(SLICE_NODE);
    const shippedTotal = Object.values(shipped.populations).reduce((a, p) => a + p.count, 0);
    expect(shippedTotal, "the fixture depends on this node shipping a live population").toBeGreaterThan(0);

    const zeros: Record<string, number> = {};
    for (const lineId of Object.keys(shipped.populations)) zeros[lineId] = 0;
    const h = mount({ save: withCounts(freshSave(), SLICE_NODE, zeros) });

    walk(h, 400);
    expect(h.scene.encountersMetCount()).toBe(0);
  });

  it("the same walk on the same seed DOES meet creatures when the save carries the shipped counts", () => {
    // The control. Without it the test above would also pass on a scene that never rolls at all.
    const h = mount();
    walk(h, 400);
    expect(h.scene.encountersMetCount()).toBeGreaterThan(0);
  });

  it("catching a line down to 0 in the save stops that line appearing, with no extinction check", () => {
    const shipped = nodeFile(SLICE_NODE);
    const lineId = Object.entries(shipped.populations).sort((a, b) => b[1].count - a[1].count)[0]![0];
    const others: Record<string, number> = {};
    for (const id of Object.keys(shipped.populations)) others[id] = id === lineId ? shipped.populations[id]!.count : 0;

    const alive = mount({ save: withCounts(freshSave(), SLICE_NODE, others) });
    walk(alive, 400);
    const metAlive = alive.scene.encountersMetCount();
    expect(metAlive).toBeGreaterThan(0);

    const wiped: Record<string, number> = {};
    for (const id of Object.keys(shipped.populations)) wiped[id] = 0;
    const dead = mount({ save: withCounts(freshSave(), SLICE_NODE, wiped) });
    walk(dead, 400);
    expect(dead.scene.encountersMetCount()).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 One number (build-doc §8.3 / Hard Req 2)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the HUD's count and the encounter weight are the same number", () => {
  it("agree for every line at a node with a normal save", () => {
    const h = mount();
    const ctx = h.scene.forayContext();
    for (const entry of encounterWeights(ctx.node, species, balance, { season: ctx.season })) {
      const line = species.byId.get(entry.lineId);
      if (!line || !entry.active) continue;
      // §7.2: an in-season non-Scavenger weight IS the count. The HUD reads the same object.
      expect(h.scene.countOf(entry.lineId)).toBe(ctx.node.populations[entry.lineId]?.count ?? 0);
    }
  });

  it("agree for a node with NO nodeStates entry — the INV-2 'save predates this node' case", () => {
    /*
     * THE MEASURED DEFECT: `liveNode()` fell back to the shipped file while `countOf()` fell back to
     * 0, so the HUD printed every line as 0 while creatures kept spawning at the shipped weights and
     * an encounter banner read `… — count 0`.
     */
    const save = freshSave();
    const nodeStates = { ...save.nodeStates };
    delete nodeStates[SLICE_NODE];
    const h = mount({ save: { ...save, nodeStates } });

    const table = h.scene.forayContext();
    let sawWeight = false;
    for (const entry of encounterWeights(table.node, species, balance, { season: table.season })) {
      if (!entry.active || entry.weight <= 0) continue;
      sawWeight = true;
      expect(
        h.scene.countOf(entry.lineId),
        `${entry.lineId} has weight ${String(entry.weight)} but the HUD would print 0`,
      ).toBeGreaterThan(0);
    }
    expect(sawWeight, "the fixture depends on this node having weighted lines").toBe(true);

    // …and the same number is what is actually on screen.
    const printed = h.hud();
    for (const [lineId, pop] of Object.entries(nodeFile(SLICE_NODE).populations)) {
      if (pop.count <= 0) continue;
      expect(printed).toContain(`${lineId}: ${String(pop.count)}`);
    }
  });

  it("prints WHY a line is absent, and a gated Ancient is not the same word as a wiped line", () => {
    /*
     * Measured on `r2`, on the never-cut vertical slice, before the fix:
     *     reedrick-line: 24 (migrating)
     *     undermere-line: 1 (absent)
     * — where "absent" was the same word the HUD used for a species the player had wiped out, on a
     * line held back by a sign chain and sitting at a real count of 1 (Hard Req 10 / bible §5).
     */
    const gatedLine = content.species.find((sp) => sp.habitat.includes(balance.encounter.signChainGatedHabitatTag));
    expect(gatedLine, "no shipped line carries the sign-chain gate tag").toBeDefined();
    const host = content.nodes.find((n) => (n.populations[gatedLine!.id]?.count ?? 0) > 0);
    expect(host, "no shipped node carries a gated line at a real count").toBeDefined();

    const h = mount({ save: freshSave(host!.id), startNode: host!.id });
    const printed = h.hud();
    const count = host!.populations[gatedLine!.id]!.count;
    expect(printed).toContain(`${gatedLine!.id}: ${String(count)} (gated)`);
    expect(printed).not.toContain(`${gatedLine!.id}: ${String(count)} (absent)`);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 Encounter → battle → survey (Hard Req 2, build-doc §1 beat 1)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 a wild encounter becomes a battle, and a catch moves a real number", () => {
  /*
   * ⚠ WHY THIS SECTION NO LONGER WALKS TO ONE ENCOUNTER AND THROWS ONE SNARE AT IT.
   *
   * It used to. `firstEncounter` walked until the scene launched a battle, and the two catch tests
   * then ASSUMED whatever the roll had handed over was catchable before the starter fell. Nothing
   * checked. That made the section a fixture of the DRAW ORDER rather than a test of the catch, and
   * it broke the first time the draw order moved: the per-step gate now rolls on the grass share
   * only — `stepEncounterChance = encounterTileFraction × encounterChancePerStep`, game/encounters.ts
   * — and the gate is the FIRST draw in the fixed per-step sequence (chance → species → age → level
   * → traits), so renumbering it renumbers every draw after it. The first encounter at the slice
   * node went from a Juvenile to an ELDER of another line: `catch.baseCatch` 0.15 instead of 0.50,
   * on a foe that knocks the level-`xp.starterLevel` starter out on turn one. Both tests went red
   * for a reason that had nothing to do with what they assert.
   *
   * Measured over the first twelve encounters of the shipped seed at this node, the roll hands over
   * ALL of: an Elder that wins on turn 1, an Adult that wins on turn 1, and Juveniles that are
   * caught on the first throw. "The first animal met is catchable" is therefore an accident of a
   * seed, never a property of the game — so this section stops assuming it. It walks REAL
   * encounters and fights REAL battles until a catch actually lands, and when none does it prints
   * every animal it met and how each fight ended. No gate, age table or draw order can quietly turn
   * it into a test of a different animal, because it never depended on a particular one.
   */

  type SnareThrow = Extract<Parameters<typeof battleStep>[1], { kind: "snare" }>;
  type WildBattleState = ReturnType<typeof startBattle>["state"];
  type Met = NonNullable<ReturnType<OverworldScene["lastEncounterMet"]>>;

  /** The strongest snare `data/balance.json` declares. G11 — read from balance, never typed in. */
  const STRONGEST_SNARE: SnareThrow["tier"] = ((): SnareThrow["tier"] => {
    const tiers = balance.catch.snareTier;
    const best = (Object.keys(tiers) as Array<SnareThrow["tier"]>).reduce<SnareThrow["tier"] | null>(
      (acc, tier) => (acc === null || tiers[tier] > tiers[acc] ? tier : acc),
      null,
    );
    if (best === null) throw new Error("balance.catch.snareTier declares no tier to throw");
    return best;
  })();

  /*
   * Rig bounds — how far the walk and the fight may run before the test gives up and says what it
   * saw. None is a gameplay number (G11): nothing outside this file reads them, and moving one
   * changes how long the rig is willing to look, never what it accepts.
   *
   * `ENCOUNTERS_TO_TRY` is 24 because that is roughly 2.5× the worst case actually measured. Swept
   * over 200 SEPARATE save seeds — i.e. 200 independent re-rolls of which animals this node hands
   * over, in what order, at what ages — every one of them landed a catch, and the deepest search
   * took 9 encounters. That sweep is the evidence for the claim above: the section does not depend
   * on the draw order, and no future renumbering of it can quietly change what these tests test.
   */
  const ENCOUNTERS_TO_TRY = 24;
  const THROWS_PER_ENCOUNTER = 64;
  const WALK_BUDGET = 900;

  /** Walk until the scene has launched a battle, and return the encounter that launched it. */
  function firstEncounter(h: Harness): { lineId: string } {
    walk(h, WALK_BUDGET, () => h.parts.launches.some((l) => l.key === SCENE_KEYS.battle));
    const met = h.scene.lastEncounterMet();
    if (!met) throw new Error(`no encounter in ${String(WALK_BUDGET)} steps — the fixture is wrong`);
    return met;
  }

  /**
   * A save carrying enough of the strongest snare that no fight below is lost to an empty bag.
   *
   * The bag is the save's OWN items (build-doc §7.8) — the scene invents nothing, and the test tops
   * up only the tier it is going to throw rather than replacing the bag the save shipped with.
   */
  function saveWithSnares(): SaveEnvelope {
    const save = freshSave();
    return {
      ...save,
      items: { ...save.items, [STRONGEST_SNARE]: ENCOUNTERS_TO_TRY * THROWS_PER_ENCOUNTER },
    };
  }

  /**
   * Fight one launched wild battle through the REAL reducer, the way a player holding snares does:
   * throw until core/battle.ts resolves the fight, or refuses the throw.
   *
   * ⚠ THE STREAM IS `data.rng`, THE ONE THE SCENE HANDED OVER — never a fresh `subsystemRng(seed,
   * "battle")`. `beginWildBattle` positions the run's battle stream where the save left it and says
   * why: "a new stream at draw zero would make every battle of a run replay the same numbers", and
   * `BattleScene` steps off exactly this object. This rig used to open its own, which was harmless
   * while it fought one battle and is not harmless now. MEASURED, walking twelve encounters: a fresh
   * stream hands every fight the same first three floats, so `shakes` is decided by one fixed
   * threshold for the whole run and "was it caught" collapses into "is this line's `baseCatch` above
   * that threshold" — 4 of 12 save seeds then caught NOTHING in twelve encounters, against ~1-in-800
   * for independent throws. That is the rig's own stream generating the correlation, not the game.
   *
   * ⚠ STOPPING ON THE REFUSAL IS ALSO THE POINT. `step()` returns the state UNCHANGED with an
   * `actionRejected` event when the action cannot happen — an empty bag, a fainted active that has
   * no replacement. A loop that ignores that spins for its whole bound against a battle that can no
   * longer move and reports `outcome === null`, which is indistinguishable from a fight that is
   * still going. Measured on the shipped seed: three of the first twelve encounters ended that way
   * under the old 200-turn loop, all of them an exhausted bag wearing a stalemate's face.
   */
  function fightWithSnares(data: BattleSceneData): WildBattleState {
    let state = startBattle(data.input, data.ctx).state;
    for (let throws = 0; state.outcome === null && throws < THROWS_PER_ENCOUNTER; throws += 1) {
      const stepped = battleStep(state, { kind: "snare", tier: STRONGEST_SNARE }, data.rng, data.ctx);
      state = stepped.state;
      if (stepped.events.some((e) => e.t === "actionRejected")) break;
    }
    return state;
  }

  interface StagedCatch {
    /** The encounter the scene's OWN roll produced, and that its hand-off was built from. */
    met: Met;
    data: BattleSceneData;
    state: WildBattleState;
    caught: NonNullable<ReturnType<typeof caughtIndividual>>;
    /** Every encounter met on the way here and how each fight ended. Goes in every message. */
    transcript: string;
    /** Hand the result back, exactly as `BattleScene` does. NOT called by the walk. */
    commit(): void;
  }

  /**
   * Walk the scene through REAL encounters, fighting each, until a catch actually lands — and hand
   * the caller the catch UNAPPLIED, so it can read the node's numbers either side of `onFinished`.
   *
   * A fight that is not won is handed back too, which is what un-latches `battleRunning` and lets
   * the walk meet the next animal; that is also exactly what `BattleScene` does with a lost fight.
   */
  function walkUntilACatchLands(h: Harness): StagedCatch {
    const seen: string[] = [];
    // Launches the scene made during `create()` are not ours to fight.
    let consumed = h.parts.launches.length;
    for (let attempt = 0; attempt < ENCOUNTERS_TO_TRY; attempt += 1) {
      walk(h, WALK_BUDGET, () => h.parts.launches.length > consumed);
      const launch = h.parts.launches[consumed];
      if (!launch) {
        seen.push(
          `— walked ${String(WALK_BUDGET)} steps and the scene launched nothing` +
            ` (handed over: ${String(h.scene.isHandedOver())})`,
        );
        break;
      }
      consumed += 1;
      if (launch.key !== SCENE_KEYS.battle) {
        seen.push(`— the scene launched "${launch.key}", which is not a battle`);
        continue;
      }
      const met = h.scene.lastEncounterMet();
      if (!met) throw new Error(`a battle launched with no encounter behind it\n${seen.join("\n")}`);
      const data = launch.data as BattleSceneData;
      const state = fightWithSnares(data);
      const caught = caughtIndividual(state, data.ctx);
      seen.push(`— ${met.lineId} ${met.age} L${String(met.level)} → ${state.outcome ?? "unresolved"}`);
      if (state.outcome === "caught" && caught !== null) {
        return {
          met,
          data,
          state,
          caught,
          transcript: seen.join("\n"),
          commit: () => data.onFinished?.({ state, caught }),
        };
      }
      data.onFinished?.({ state, caught });
    }
    throw new Error(
      `§3 walked ${String(ENCOUNTERS_TO_TRY)} encounters at ${SLICE_NODE} and caught nothing.\n` +
        `Every wild creature met, and how its fight ended:\n${seen.join("\n")}\n` +
        `This section does not depend on WHICH animal it meets — only that one of them can be ` +
        `caught with a "${STRONGEST_SNARE}" snare. If nothing here can be, the node's roster, the ` +
        `encounter gate, the catch formula or the starter is what changed.`,
    );
  }

  /** What was met and what was caught, on every assertion, so a red never has to be re-derived. */
  function report(staged: StagedCatch): string {
    return (
      `caught ${staged.caught.lineId} ${staged.caught.age} L${String(staged.caught.level)}` +
      ` at ${SLICE_NODE}\nencounters met on the way:\n${staged.transcript}`
    );
  }

  it("launches the Battle scene with the wild creature the roll produced, and pauses itself", () => {
    const h = mount();
    firstEncounter(h);
    const launch = h.parts.launches.find((l) => l.key === SCENE_KEYS.battle);
    expect(launch, "the overworld never started a battle").toBeDefined();

    const data = launch!.data as BattleSceneData;
    expect(data.input.kind).toBe("wild");
    expect(data.input.nodeId).toBe(SLICE_NODE);
    expect(data.input.playerParty.length).toBeGreaterThan(0);
    expect(data.input.enemyParty.length).toBe(1);
    // bible §2 — one trait per wild creature, and BattlerSpec.traits is not optional.
    expect(data.input.enemyParty[0]!.traits.length).toBe(balance.traits.slotsPerWildCreature);
    for (const trait of data.input.enemyParty[0]!.traits) {
      expect(balance.traits.pool.some((t) => t.id === trait.id)).toBe(true);
    }
    expect(h.parts.paused).toBeGreaterThan(0);
  });

  it("a REAL catch through core/battle.ts decrements the node by exactly one and keeps the creature", () => {
    const h = mount({ save: saveWithSnares() });
    const staged = walkUntilACatchLands(h);
    const where = report(staged);

    // The animal that was caught is the animal the scene's OWN roll produced and built the hand-off
    // from. A catch applied to any other line would move the wrong number, and every count
    // assertion below would still pass — so this is asserted before them, not after.
    expect(staged.state.outcome, where).toBe("caught");
    expect(staged.data.input.enemyParty[0]!.lineId, where).toBe(staged.met.lineId);
    expect(staged.caught.lineId, where).toBe(staged.met.lineId);
    expect(staged.caught.nodeId, where).toBe(SLICE_NODE);

    const before = h.scene.countOf(staged.met.lineId);
    expect(before, where).toBeGreaterThan(0);
    const keptBefore = h.scene.save.party.length + h.scene.save.box.length;
    const logBefore = h.scene.save.actionLog.length;

    staged.commit();

    expect(h.scene.countOf(staged.met.lineId), where).toBe(before - 1);
    expect(h.scene.save.party.length + h.scene.save.box.length, where).toBe(keptBefore + 1);
    /*
     * The tape carries THE FIGHT AND THEN ITS PRIZE, so `core/save.ts` `replay` reproduces this
     * save (L10). Two entries, not one: `applyBattleResult` appends the `battleAftermath` — the
     * HP, the levels, the XP and the bag the fight actually left — and the catch writer appends
     * the catch. The aftermath entry used to be absent because nothing in `game/` called that
     * writer, which is why the order is pinned here and not merely the catch.
     */
    expect(h.scene.save.actionLog.length, where).toBe(logBefore + 2);
    const [aftermath, last] = h.scene.save.actionLog.slice(-2);
    expect(aftermath!.action, where).toMatchObject({ t: "battleAftermath" });
    expect(last!.action, where).toMatchObject({ t: "catch", nodeId: SLICE_NODE, lineId: staged.met.lineId });
    // …and the scene came back to the player.
    expect(h.parts.stops).toContain(SCENE_KEYS.battle);
    expect(h.parts.resumed).toBeGreaterThan(0);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * §3.1 THE FIGHT ITSELF IS WRITTEN BACK — and it used not to be.
   *
   * `game/wild-battle.ts` `applyBattleResult` is the ONE writer of `curHp`, `level`, `xp` and the
   * bag off a finished fight, and it had NO caller in `game/` at all. Three docstrings —
   * `gym-battle.ts`, `rival.ts`, `finale.ts` — described it as "the ONE writer all four launchers
   * share" while zero launchers shared it. `tests/unit/battle-persistence.test.ts` is 620 lines
   * about that function and passed identically with the wiring absent, because it calls the writer
   * itself: it binds the FUNCTION and not the WIRING, which is this repo's signature defect.
   *
   * Measured before the wiring, driving this rig through real `core/battle.ts` fights: a snare was
   * spent in the reducer and was still in the bag afterwards, and four battles produced zero
   * `battleAftermath` entries on the tape. So these two tests assert EFFECTS on the save — never
   * that the writer was called — and they are the only place in the repo where the four launchers'
   * calls to it can go red.
   * ────────────────────────────────────────────────────────────────────────── */

  /** True when this state has anybody on the player side below full HP. */
  function playerIsHurt(state: WildBattleState): boolean {
    return state.playerOrder.some((uid) => {
      const battler = state.battlers[uid];
      return battler !== undefined && battler.curHp < battler.maxHp;
    });
  }

  /**
   * Walk REAL encounters until one ends with the player HURT and STILL STANDING, one snare thrown.
   *
   * Fled rather than won or lost on purpose, and each is a different thing to assert: a WIN can
   * leave the starter untouched, and a LOSS is a wiped party, which `recoverFromBlackout` heals on
   * the way to the inn — so neither could witness damage surviving a fight. A flee can, and
   * `core/battle.ts` `illegalActionReason` allows one against a wild enemy.
   *
   * Handed back UNAPPLIED, so the caller reads the save on both sides of `onFinished`.
   */
  function walkUntilASurvivedFight(h: Harness): {
    data: BattleSceneData;
    state: WildBattleState;
    transcript: string;
  } {
    const seen: string[] = [];
    let consumed = h.parts.launches.length;
    for (let attempt = 0; attempt < ENCOUNTERS_TO_TRY; attempt += 1) {
      walk(h, WALK_BUDGET, () => h.parts.launches.length > consumed);
      const launch = h.parts.launches[consumed];
      if (!launch) {
        seen.push(`— walked ${String(WALK_BUDGET)} steps and the scene launched nothing`);
        break;
      }
      consumed += 1;
      if (launch.key !== SCENE_KEYS.battle) {
        seen.push(`— the scene launched "${launch.key}", which is not a battle`);
        continue;
      }
      const met = h.scene.lastEncounterMet();
      const data = launch.data as BattleSceneData;
      // ONE snare, so the bag has to move, and then out — on the scene's OWN stream (`data.rng`),
      // for the reason `fightWithSnares` gives.
      let state = battleStep(
        startBattle(data.input, data.ctx).state,
        { kind: "snare", tier: STRONGEST_SNARE },
        data.rng,
        data.ctx,
      ).state;
      for (let turn = 0; state.outcome === null && turn < THROWS_PER_ENCOUNTER; turn += 1) {
        const stepped = battleStep(state, { kind: "flee" }, data.rng, data.ctx);
        state = stepped.state;
        if (stepped.events.some((e) => e.t === "actionRejected")) break;
      }
      const hurt = playerIsHurt(state);
      seen.push(
        `— ${met?.lineId ?? "?"} ${met?.age ?? "?"} L${String(met?.level ?? 0)} → ` +
          `${state.outcome ?? "unresolved"}${hurt ? " (player hurt)" : " (player untouched)"}`,
      );
      if (state.outcome === "fled" && hurt) return { data, state, transcript: seen.join("\n") };
      data.onFinished({ state, caught: caughtIndividual(state, data.ctx) });
    }
    throw new Error(
      `§3.1 walked ${String(ENCOUNTERS_TO_TRY)} encounters at ${SLICE_NODE} and never fled a fight ` +
        `having taken a hit.\nEvery wild creature met, and how its fight ended:\n${seen.join("\n")}`,
    );
  }

  it("the damage taken, the snare thrown and the aftermath entry all survive the fight", () => {
    const h = mount({ save: saveWithSnares() });
    const fought = walkUntilASurvivedFight(h);
    const where = `the fight that was handed back:\n${fought.transcript}`;

    const snaresBefore = h.scene.save.items[STRONGEST_SNARE] ?? 0;
    const logBefore = h.scene.save.actionLog.length;
    expect(snaresBefore, where).toBeGreaterThan(0);
    // The reducer really did spend one, so the save has something to be wrong about.
    expect(fought.state.bag[STRONGEST_SNARE] ?? 0, where).toBe(snaresBefore - 1);

    fought.data.onFinished({ state: fought.state, caught: null });

    // 1. THE BAG. The snare the reducer spent is gone from the save.
    expect(h.scene.save.items[STRONGEST_SNARE] ?? 0, where).toBe(snaresBefore - 1);

    // 2. THE PARTY. Every battler's HP is on its owned creature, and somebody is below full.
    for (const uid of fought.state.playerOrder) {
      const battler = fought.state.battlers[uid];
      if (!battler) continue;
      const owned = h.scene.save.party.find((c) => c.uid === uid);
      expect(owned, `${where}\nbattler ${uid} is not in the party`).toBeDefined();
      expect(owned!.curHp, where).toBe(battler.curHp);
      expect(owned!.level, where).toBe(battler.level);
    }
    const hurt = h.scene.save.party.filter((c) => c.curHp !== undefined && c.curHp > 0);
    expect(hurt.length, `${where}\nthe fight left nobody hurt on the save`).toBeGreaterThan(0);

    // 3. THE TAPE, so `core/save.ts` `replay` reproduces it (L10). One new entry, and it is the
    //    aftermath: a fled fight catches nothing and moves no population.
    expect(h.scene.save.actionLog.length, where).toBe(logBefore + 1);
    expect(h.scene.save.actionLog[h.scene.save.actionLog.length - 1]!.action, where).toMatchObject({
      t: "battleAftermath",
    });
  });

  it("A WIPE IS NOT A DEAD END — the party is carried to an inn, put back on its feet, and charged", () => {
    /*
     * THE OTHER HALF OF THE SAME CHANGE, AND IT DOES NOT SHIP WITHOUT IT. With `curHp` persisting
     * and nothing that heals, a wiped save has no action left that can change its state: all four
     * `*BattleProblem` launchers refuse a party with nothing standing, `restAtInn` charges ticks and
     * heals nothing, and `core/lifecycle.ts` keeps a zero at zero through the year turn. Hank's
     * closed ruling is that a forced choice exists precisely so the game cannot block.
     */
    const h = mount({ save: saveWithSnares() });
    const seen: string[] = [];
    let consumed = h.parts.launches.length;
    let lost: { tickBefore: number; subTickBefore: number } | null = null;

    for (let attempt = 0; attempt < ENCOUNTERS_TO_TRY && lost === null; attempt += 1) {
      walk(h, WALK_BUDGET, () => h.parts.launches.length > consumed);
      const launch = h.parts.launches[consumed];
      if (!launch) break;
      consumed += 1;
      if (launch.key !== SCENE_KEYS.battle) continue;
      const data = launch.data as BattleSceneData;
      const state = fightWithSnares(data);
      seen.push(`— ${h.scene.lastEncounterMet()?.lineId ?? "?"} → ${state.outcome ?? "unresolved"}`);
      const before = { tickBefore: h.scene.save.tick, subTickBefore: h.scene.save.subTick ?? 0 };
      data.onFinished({ state, caught: caughtIndividual(state, data.ctx) });
      if (state.outcome === "loss") lost = before;
    }

    const where = `encounters met on the way:\n${seen.join("\n")}`;
    expect(lost, `§3.1 walked ${String(ENCOUNTERS_TO_TRY)} encounters and never lost one.\n${where}`).not.toBeNull();

    // 1. SOMETHING IS STANDING AGAIN — the only property the ruling actually fixes.
    expect(h.scene.save.party.some((c) => c.curHp === undefined || c.curHp > 0), where).toBe(true);
    // 2. …AT AN INN, which is `core/recovery.ts`'s destination rule and not this rig's guess.
    expect(h.scene.save.currentNode, where).toBe(wakeNodeFor(SLICE_NODE, content));
    expect(h.scene.node.id, `${where}\nthe save moved and the scene did not`).toBe(h.scene.save.currentNode);
    // 3. …AND IT WAS PAID FOR, in whole ticks, off `BLACKOUT_COST`.
    const spent =
      (h.scene.save.tick - lost!.tickBefore) +
      ((h.scene.save.subTick ?? 0) - lost!.subTickBefore) / balance.clock.subTicksPerTick;
    expect(spent, `${where}\nthe blackout was free`).toBe(blackoutTicks(balance));
    /*
     * 4. …and the tape carries it, so `replay` reproduces the wake node and the restored party.
     *    Read through `readBlackout` rather than by comparing `action.t`: `core/types.ts`
     *    `GameAction` deliberately has no `blackout` member (see `core/save.ts` `blackoutAction`),
     *    so a string comparison here does not even typecheck.
     */
    expect(h.scene.save.actionLog.some((e) => readBlackout(e.action) !== null), where).toBe(true);
    // 5. THE RUN IS NOT BLOCKED: the next fight can actually be launched.
    expect(wildBattleProblem(h.scene.save), where).toBeNull();
  });

  it("the derived encounter weight follows the catch — the cascade needs no extinction check", () => {
    const h = mount({ save: saveWithSnares() });
    const staged = walkUntilACatchLands(h);
    const where = report(staged);

    const weightOf = (lineId: string): number => {
      const ctx = h.scene.forayContext();
      return encounterWeights(ctx.node, species, balance, { season: ctx.season }).find((w) => w.lineId === lineId)?.weight ?? -1;
    };
    const weightBefore = weightOf(staged.met.lineId);
    // A line the roll produced HAS a weight; without this the comparison below could be a pair of
    // sentinels or a pair of zeroes agreeing about a line that is not in the table at all.
    expect(weightBefore, `${where}\nthe line just met carries no encounter weight to move`).toBeGreaterThan(0);

    staged.commit();

    expect(weightOf(staged.met.lineId), where).toBeLessThan(weightBefore);
  });

  it("says so instead of silently doing nothing when there is nothing to send out", () => {
    const h = mount({ save: { ...freshSave(), party: [] } });
    walk(h, 600);
    expect(h.parts.launches.some((l) => l.key === "Battle")).toBe(false);
    expect(h.hud().length).toBeGreaterThan(0);
    // The banner is a text object; the refusal has to be ON it, not swallowed.
    const banners = h.parts.objects.filter((o) => o.kind === "text").map((o) => o.text);
    expect(banners.some((t) => t.includes("no battle"))).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 The in-run menu round trip
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 a trip to the in-run menu leaves the player where they were standing", () => {
  it("keeps the tile and the partial foray across a restart of the same node", () => {
    const h = mount();
    walk(h, 7);
    const tile = { ...h.scene.movement.tile };
    const steps = h.scene.forayStepsSinceTick();
    expect(steps).toBeGreaterThan(0);

    h.restart();

    expect(h.scene.movement.tile).toEqual(tile);
    expect(h.scene.forayStepsSinceTick()).toBe(steps);
  });

  it("still respawns when the node actually changed", () => {
    const h = mount();
    walk(h, 5);
    const tile = { ...h.scene.movement.tile };
    const other = content.nodes.find((n) => n.id !== SLICE_NODE);
    expect(other).toBeDefined();
    h.restart({ save: { ...h.scene.save, currentNode: other!.id }, startNode: other!.id });
    expect(h.scene.movement.tile).not.toEqual(tile);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 The collision overlay across a restart
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 the overlay flag and the Graphics it describes agree", () => {
  const C = 67;

  function overlay(h: Harness): FakeObj | undefined {
    return h.parts.objects.find((o) => o.kind === "graphics");
  }

  it("one [C] press turns it on", () => {
    const h = mount();
    expect(overlay(h)?.visible).toBe(false);
    h.press(C);
    h.frame();
    expect(overlay(h)?.visible).toBe(true);
  });

  it("comes back VISIBLE after a restart, and the next press turns it off", () => {
    const h = mount();
    h.press(C);
    h.frame();
    expect(overlay(h)?.visible).toBe(true);

    h.restart();
    expect(overlay(h)?.visible, "the flag survived the restart; the Graphics did not").toBe(true);

    h.press(C);
    h.frame();
    expect(overlay(h)?.visible).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 A mask that decodes but cannot be played
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 an unusable mask is refused out loud, and the player still stands somewhere legal", () => {
  /** A raster of one flat opaque colour at the shipped native resolution. */
  function flat(value: number, alpha = 255): { width: number; height: number; data: Uint8ClampedArray } {
    const side = 64;
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i += 1) {
      data[i * 4] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = alpha;
    }
    return { width: side, height: side, data };
  }

  function mountWithMask(pixels: { width: number; height: number; data: Uint8ClampedArray }): Harness {
    // The scene's constructor creates the stub, so the mask has to be installed between `new` and
    // `create`. `mount` does both, so the texture is registered on the parts of a probe scene first.
    const probe = new OverworldScene();
    const parts = STUB.parts as FakeParts;
    const maskKey = maskTextureKey(nodeFile(SLICE_NODE).collisionMask);
    parts.maskPixels.set(maskKey, pixels);
    const save = freshSave();
    const streams = openStreams(save, balance);
    probe.init({ content, save, streams, msPerTile: MS_PER_TILE });
    probe.create();
    return {
      scene: probe,
      parts,
      data: { content, save, streams },
      frame: (ms = MS_PER_TILE) => probe.update(0, ms),
      restart: () => undefined,
      hold: () => undefined,
      press: () => undefined,
      hud: () => parts.objects.filter((o) => o.kind === "text").map((o) => o.text).join("\n"),
    };
  }

  it("an all-black mask is REFUSED rather than loaded as authored geometry", () => {
    const h = mountWithMask(flat(0));
    expect(h.scene.collision.source).toBe("synthesised");
    expect(h.scene.collision.note).toContain("REFUSED");
    expect(h.scene.collision.health?.usable).toBe(false);
    // …and the player is not standing inside a wall.
    expect(h.scene.canEnter(h.scene.movement.tile)).toBe(true);
    expect(h.hud()).toContain("REFUSED");
  });

  it("a fully TRANSPARENT mask is refused for the reason the Hard Req 5 gate would refuse it", () => {
    const h = mountWithMask(flat(0, 0));
    expect(h.scene.collision.source).toBe("synthesised");
    expect(h.scene.collision.health?.usable).toBe(false);
    expect(h.scene.collision.health?.problems.join(" ")).toMatch(/opaque/);
  });

  it("a real mask with real geometry loads as authored", () => {
    const pixels = flat(255);
    // A 10×10-cell block of wall in the corner, at cell resolution.
    for (let y = 4; y < 14; y += 1) {
      for (let x = 4; x < 14; x += 1) {
        const at = (y * 64 + x) * 4;
        pixels.data[at] = 0;
        pixels.data[at + 1] = 0;
        pixels.data[at + 2] = 0;
      }
    }
    const h = mountWithMask(pixels);
    expect(h.scene.collision.source).toBe("authored");
    expect(h.scene.collision.synthetic).toBe(false);
    expect(h.scene.collision.health?.usable).toBe(true);
    expect(h.scene.collision.health?.blockedCells).toBe(100);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §7 The HUD fits the screen
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§7 the HUD fits build-doc §7.6's 480×320 virtual screen", () => {
  it("wraps at the screen width, so the provenance line is not cut off mid-sentence", () => {
    const h = mount();
    const texts = h.parts.objects.filter((o) => o.kind === "text");
    expect(texts.length).toBeGreaterThan(0);

    /*
     * The HUD is the object that carries the 165-character provenance line — measured at 1044px wide
     * on a 480px screen, so it ran off the right edge at "… SYNTHESISED co". Naming it by its own
     * content rather than counting wrapped objects is what makes this bind: the banner sets a wrap
     * width too, so "at least one text object wraps" stayed true with the HUD unwrapped.
     */
    const hud = texts.find((t) => t.text.includes("PLACEHOLDER map") || t.text.includes("authored mask"));
    expect(hud, "no text object is carrying the provenance line").toBeDefined();
    expect(typeof hud!.wordWrapWidth, "the HUD sets no wrap width").toBe("number");
    expect(hud!.wordWrapWidth as number).toBeLessThanOrEqual(480);
    expect(hud!.wordWrapWidth as number).toBeGreaterThan(0);

    // Every text object the scene owns has to fit; a second unwrapped one is the same defect again.
    for (const t of texts) {
      if (typeof t.wordWrapWidth !== "number") continue;
      expect(t.wordWrapWidth).toBeLessThanOrEqual(480);
    }
    const unwrapped = texts.filter((t) => typeof t.wordWrapWidth !== "number" && t.text.length > 60);
    expect(unwrapped.map((t) => t.text), "a long text object is unwrapped").toEqual([]);
  });

  it("the provenance line is on screen in full — it is what says the art is a placeholder", () => {
    const h = mount();
    expect(h.hud()).toContain("PLACEHOLDER map");
    expect(h.hud()).toContain("NOT an authored mask");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §8 Structural — the scene holds no rules (L11)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§8 the overworld cannot acquire a rule of its own", () => {
  const source = readFileSync(`${ROOT}game/scenes/OverworldScene.ts`, "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("imports no rules module from core/ — only the seams", () => {
    // core/battle.ts is the whole point: the scene must not be able to call the damage or catch
    // maths, because neither is in scope.
    expect(code).not.toMatch(/from\s+["'][^"']*core\/battle["']/);
    expect(code).not.toMatch(/\bMath\.random\b/);
  });

  it("names no species and no trophic role (G2 / G6)", () => {
    for (const line of content.species) expect(code).not.toContain(line.id);
    for (const role of ["Producer", "Grazer", "Mesopredator", "Apex", "Scavenger", "AncientApex"]) {
      expect(code).not.toContain(`"${role}"`);
    }
  });

  it("writes no moralising copy about catching (G7)", () => {
    for (const word of ["cruel", "greedy", "guilt", "should not", "shouldn't", "too many", "sorry"]) {
      expect(code.toLowerCase()).not.toContain(word);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §9 The mask read leaves the console alone
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§9 reading the mask does not warn about a texture that was never created", () => {
  it("never removes a texture key that does not exist", () => {
    /*
     * `readMaskPixels` used to do `textures.remove(scratchKey)` BEFORE `createCanvas(scratchKey)`,
     * so every mask read printed `warning: No texture found matching key: maps/<node>-mask:scratch`
     * to the console — once per read, on the one operation the art lane is watching. Harmless, and
     * exactly the kind of noise that teaches people to ignore the console.
     */
    const probe = new OverworldScene();
    const parts = STUB.parts as FakeParts;
    const side = 64;
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i += 1) {
      const ink = i % 7 === 0 ? 0 : 255;
      data[i * 4] = ink;
      data[i * 4 + 1] = ink;
      data[i * 4 + 2] = ink;
      data[i * 4 + 3] = 255;
    }
    parts.maskPixels.set(maskTextureKey(nodeFile(SLICE_NODE).collisionMask), { width: side, height: side, data });

    const save = freshSave();
    probe.init({ content, save, streams: openStreams(save, balance), msPerTile: MS_PER_TILE });
    probe.create();

    expect(parts.removes.length, "the mask was never read at all").toBeGreaterThan(0);
    const phantom = parts.removes.filter((r) => !r.existed);
    expect(phantom.map((r) => r.key), "removed a texture key that had not been created").toEqual([]);
    // …and the read still worked.
    expect(probe.collision.source).toBe("authored");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §10 THE TWO CLOCKS, EXECUTED
 *
 * Every test here is a defect that a green suite did not see, because the suite called core
 * functions by hand at clocks and states the running game never reached.
 * ════════════════════════════════════════════════════════════════════════════ */

const KEY_E = 69;
const KEY_G = 71;
const KEY_R = 82;

/** The leaders in act order — data/gyms.json's, never a list typed in here (G2). */
const LADDER = [...content.gyms].sort((a, b) => a.act - b.act);

describe("§10.1 the act ladder can be CLIMBED by playing — the never-cut slice", () => {
  it("a brand-new save is not locked inside the first town", async () => {
    /*
     * THE DEFECT. `travelTo` gained an act gate, and act 1's gate is `story.opening.done` — a flag
     * only data/dialogue.json writes, which nothing in game/ reads. Measured through this rig
     * before the fix: act 0, unlocked = ["hearthollow"], travelTo("r1") REFUSED. build-doc §16's
     * never-cut vertical slice is Hearthollow → R1 → Brackwater → R2, and it stopped at the first
     * step. A gate whose key does not exist is not a gate, it is a wall.
     */
    const h = mount();
    expect(h.scene.save.currentNode).toBe(SLICE_NODE);
    expect(h.scene.act()).toBeGreaterThanOrEqual(1);

    const next = h.scene.node.adjacency[0];
    expect(next, "the slice's first node has an exit").toBeDefined();
    await h.scene.travelTo(next as string);
    expect(h.scene.save.currentNode).toBe(next);
  });

  it("the prologue stand-in only fires when nothing else owns the opening beat", () => {
    // C7 takes the hook and the scene writes NO story flag — the stand-in switches itself off.
    let asked = 0;
    const h = mount({
      hooks: {
        onOpeningBeat: () => {
          asked += 1;
          return true;
        },
      },
    });
    expect(asked).toBeGreaterThan(0);
    expect(h.scene.act()).toBe(balance.acts.first);
    for (const flag of balance.acts.gates.find((g) => g.act === balance.acts.first + 1)?.flags ?? []) {
      expect(h.scene.save.questFlags[flag]).toBeUndefined();
    }
  });

  it("[G] fights the town's leader and a WIN is the badge that opens the next act", () => {
    /*
     * THE OTHER HALF OF THE SAME DEFECT: `winGym` — the only writer of a badge flag — had no caller
     * anywhere in the repo, so acts 2..6 were unreachable however long anyone played.
     */
    const first = LADDER[0];
    expect(first).toBeDefined();
    if (!first) return;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    expect(h.scene.act()).toBe(1);
    expect(h.hud()).toContain("[G] challenge");

    h.press(KEY_G);
    h.frame();
    const launch = h.parts.launches.find((l) => l.key === "Battle");
    expect(launch, "pressing [G] launched no battle").toBeDefined();
    const data = launch?.data as BattleSceneData;
    expect(data.input.kind).toBe("gym");
    expect(data.input.enemyParty.length).toBe(first.slots.length + 1);
    expect(data.input.playerParty.length).toBeGreaterThan(0);

    // The reducer's own outcome, handed back the way BattleScene hands it back.
    data.onFinished({ state: settledState(data, "win"), caught: null });
    expect(h.scene.act()).toBe(2);
    // …and the act the badge opened is now travelable.
    expect(balance.acts.gates.find((g) => g.act === 2)?.nodes ?? []).not.toHaveLength(0);
  });

  it("a LOSS is not a badge, and neither is a flee", () => {
    const first = LADDER[0];
    if (!first) return;
    for (const outcome of ["loss", "fled"] as const) {
      const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
      h.press(KEY_G);
      h.frame();
      const data = h.parts.launches.find((l) => l.key === "Battle")?.data as BattleSceneData;
      data.onFinished({ state: settledState(data, outcome), caught: null });
      expect(h.scene.act(), outcome).toBe(1);
    }
  });

  it("the whole never-cut slice is walkable: Hearthollow → R1 → Brackwater → R2", async () => {
    const first = LADDER[0];
    if (!first) return;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    const visited: string[] = [h.scene.save.currentNode];

    // Act 1 opens the first route.
    const r1 = h.scene.node.adjacency.find((id) => !id.startsWith(first.town));
    await h.scene.travelTo(r1 as string);
    visited.push(h.scene.save.currentNode);
    expect(visited[1]).toBe(r1);

    /*
     * …AND THE RIVAL IS STANDING ON IT. bible §8's Wick is triggered by ARRIVAL, so walking the
     * slice now walks THROUGH a fight, and the slice is only walkable if losing it does not close
     * the route. The fight is answered with a loss on purpose: the never-cut claim is that the
     * player reaches Brackwater, not that they beat Wick to get there.
     */
    const rivalLaunch = h.parts.launches.filter((l) => l.key === "Battle").pop();
    expect(rivalLaunch, "arriving on the first route launched no rival battle").toBeDefined();
    expect((rivalLaunch?.data as BattleSceneData).input.kind).toBe("trainer");
    expect(settleBattle(h, "loss")).toBe(true);

    // Back to town, win the badge, and the second town opens.
    await h.scene.travelTo(first.town);
    h.press(KEY_G);
    h.frame();
    const data = h.parts.launches.filter((l) => l.key === "Battle").pop()?.data as BattleSceneData;
    data.onFinished({ state: settledState(data, "win"), caught: null });
    expect(h.scene.act()).toBe(2);

    await h.scene.travelTo(r1 as string);
    const townTwo = balance.acts.gates.find((g) => g.act === 2)?.nodes.find((id) => id !== r1);
    expect(townTwo).toBeDefined();
    await h.scene.travelTo(townTwo as string);
    expect(h.scene.save.currentNode).toBe(townTwo);
  });
});

describe("§10.2 create() builds before it reports", () => {
  it("a save with a pending act entry does not crash the scene at construction", () => {
    /*
     * THE DEFECT. `create()` called `advanceActs()` thirty lines above `this.banner = this.add...`,
     * and `advanceActs` flashes a banner per raid event — so loading a save with three badges (the
     * shipped act-4 Cullbrand raid) threw `TypeError: Cannot read properties of undefined (reading
     * 'setText')` and the overworld never built.
     */
    const raid = balance.yearEvents.raids[0];
    expect(raid).toBeDefined();
    if (!raid) return;
    let save = freshSave();
    save = { ...save, questFlags: { ...save.questFlags, "story.opening.done": true } };
    for (const gym of LADDER.filter((g) => g.act < raid.act)) {
      save = {
        ...save,
        questFlags: { ...save.questFlags, [`gym.${gym.id}.beaten`]: true },
      };
    }
    const before = save.nodeStates[raid.nodeId]?.populations[raid.targets[0]!.lineId]?.count ?? 0;

    const h = mount({ save });
    expect(h.scene.act()).toBe(raid.act);
    // The raid actually fired, and it was REPORTED rather than thrown.
    const after = h.scene.save.nodeStates[raid.nodeId]?.populations[raid.targets[0]!.lineId]?.count ?? 0;
    expect(after).toBeLessThan(before);
    expect(h.hud()).toContain(raid.nodeId);
  });

  it("a finished run does not crash the scene, and the ending is handed over exactly once", () => {
    /*
     * TWO DEFECTS AT ONE SITE. (a) the same construction-order crash, through `completeRun`;
     * (b) `onRunComplete` was re-tested on every year turn with no latch, so a finished run replayed
     * the epilogue annually — measured at 3 calls across 3 year turns.
     */
    let save = freshSave();
    /*
     * ⚠ THIS USED TO SET ONLY `balance.acts.runCompleteFlag` AND EXPECT THE HOOK TO FIRE, because
     * `maybeCompleteRun` gated on `runIsOver()`. That is the premature trigger: `runIsComplete` is
     * also true on a full badge ladder, and `winGym` reaches `maybeCompleteRun` BEFORE
     * `playBattleOutcome` plays `greaves.finale.post` — so the ending latched on the sixth badge,
     * before the Vellsire choice existed, and (being one-shot) could never fire again afterwards.
     * The ending is now `story.epilogue.shown`, i.e. the run's last cutscene has PLAYED. This
     * test's own subject — the latch, and no annual replay — is unchanged and asserted below.
     */
    save = {
      ...save,
      questFlags: {
        ...save.questFlags,
        [balance.acts.runCompleteFlag]: true,
        [EPILOGUE_SHOWN_FLAG]: true,
      },
    };
    const calls: number[] = [];
    const h = mount({ save, hooks: { onRunComplete: (s) => calls.push(s.year) } });
    expect(calls).toHaveLength(1);

    /*
     * Spend three whole years through the inn — every year turn re-asks, and the latch answers.
     *
     * ⚠ `frameAndSettle`, not `frame`: without it the rig stalled at the FIRST year turn (the stub
     * registers `YearTurn` and nothing ever answered it), so this loop's 48 presses bought ONE year
     * and `toBeGreaterThan(startYear)` passed for the wrong reason. Three year turns are the point —
     * "once a year for ever" cannot be ruled out by a run that only ever turns one year.
     */
    const rests = balance.clock.ticksPerYear * 3;
    for (let i = 0; i < rests; i += 1) {
      h.press(KEY_R);
      frameAndSettle(h);
    }
    // Derived, so retuning the meter or the price of an inn moves the expectation with it (G11).
    const yearsBought = (rests * balance.clock.innTicks) / balance.clock.ticksPerYear;
    expect(yearsBought, "the loop must turn more than one year or it cannot see an annual replay").toBeGreaterThan(1);
    expect(h.scene.save.year).toBe(balance.clock.startYear + yearsBought);
    expect(calls).toHaveLength(1);

    // …and a reload of the finished save does not replay it either: the latch is IN the save.
    const reloaded = mount({ save: h.scene.save, hooks: { onRunComplete: () => calls.push(-1) } });
    expect(reloaded.scene.runIsOver()).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("beating every leader completes the run, with no dialogue flag anywhere", () => {
    // The shipped `runCompleteFlag` is `story.greaves.beaten`, which only data/dialogue.json writes.
    // Without this the ending was unreachable in the shipped build — "the player reaches the ending
    // and sees nothing".
    let save = freshSave();
    save = { ...save, questFlags: { ...save.questFlags, "story.opening.done": true } };
    for (const gym of LADDER) {
      save = { ...save, questFlags: { ...save.questFlags, [`gym.${gym.id}.beaten`]: true } };
    }
    expect(save.questFlags[balance.acts.runCompleteFlag]).toBeUndefined();
    const calls: number[] = [];
    const h = mount({ save, hooks: { onRunComplete: (s) => calls.push(s.year) } });
    // THE CLAIM THIS TEST IS NAMED FOR, and it is untouched: the run is over on badges alone, with
    // no dialogue flag anywhere. `runIsOver()` still reads `core/acts.ts` `runIsComplete`.
    expect(h.scene.runIsOver()).toBe(true);
    /*
     * …but the ENDING has not happened yet, and that is the separation this asserts. The badge that
     * completed the ladder is won inside `winGym`, which reaches `maybeCompleteRun` BEFORE
     * `greaves.finale.post` is played — so a hook fired here reports a run whose finale, whose
     * Vellsire choice and whose epilogue have none of them occurred. Hard Req 7's epilogue survey
     * hangs off this hook; firing it now would show the region BEFORE the choice it exists to
     * report, and the latch would stop it ever firing again.
     */
    expect(calls, "the ending was handed over before the finale had been played").toHaveLength(0);

    // Play the epilogue — the run's last cutscene — and it fires, once.
    const ended = mount({
      save: { ...h.scene.save, questFlags: { ...h.scene.save.questFlags, [EPILOGUE_SHOWN_FLAG]: true } },
      hooks: { onRunComplete: (s) => calls.push(s.year) },
    });
    expect(ended.scene.runIsOver()).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("§10.3 the published event flags follow the clock, including across the year turn", () => {
  it("event.festival.open is open for ONE season window, not two — it is retracted at the year turn", () => {
    /*
     * THE DEFECT, and the stub-blindness that hid it. `syncEvents()` was called only inside the
     * `seasonBoundary` arm, and core/clock.ts deliberately emits NO `seasonBoundary` on the
     * year-filling tick — so the festival flag survived into the next spring. Measured through this
     * rig: two consecutive windows open as one.
     *
     * THE READING IS HISTORY, NOT THE RULE: it was 8 consecutive open ticks, taken under the
     * then-shipped 16-tick year where a season was four ticks. A window is `clock.ticksPerSeason`
     * ticks long, whatever that key holds today — which is what the assertions below read, and why
     * the title no longer names a number the balance file can move.
     *
     * The suite that certified the retraction called `syncEventFlags` BY HAND at {year+1, tick:0},
     * a call the game never made.
     */
    const h = mount();
    const runs: number[] = [];
    let current = 0;
    const seen: Array<{ year: number; tick: number; open: boolean }> = [];
    for (let i = 0; i < balance.clock.ticksPerYear * 2; i += 1) {
      const open = h.scene.save.questFlags["event.festival.open"] === true;
      seen.push({ year: h.scene.save.year, tick: h.scene.save.tick, open });
      if (open) current += 1;
      else if (current > 0) {
        runs.push(current);
        current = 0;
      }
      h.press(KEY_R);
      // The year turn's own `finish` republishes the windows; without settling it, this loop stalled
      // one tick BEFORE the turn and the retraction it claims to measure never ran.
      frameAndSettle(h);
    }
    if (current > 0) runs.push(current);

    expect(runs.length, "the festival never opened at all").toBeGreaterThan(0);
    for (const run of runs) expect(run).toBeLessThanOrEqual(balance.clock.ticksPerSeason);
    // And it is never open in the first season of a year — which is where the 8-tick run spilled to.
    for (const row of seen) {
      if (row.tick < balance.clock.ticksPerSeason) expect(row.open, `Y${row.year}t${row.tick}`).toBe(false);
    }
  });

  it("the published flags always agree with the authoritative read", () => {
    const h = mount();
    for (let i = 0; i < balance.clock.ticksPerYear + 4; i += 1) {
      const published = Object.keys(h.scene.save.questFlags)
        .filter((k) => k.startsWith("event.") && k.endsWith(".open"))
        .sort();
      const derived = h.scene
        .openEvents()
        .map((w) => `event.${w.id}.open`)
        .sort();
      expect(published, `Y${h.scene.save.year}t${h.scene.save.tick}`).toEqual(derived);
      h.press(KEY_R);
      frameAndSettle(h);
    }
  });
});

describe("§10.4 the wild level band follows the ACT, not the calendar", () => {
  it("a player still in act 1 in year 12 meets act-1 creatures", () => {
    const late = { ...freshSave(), year: 12, tick: 3 };
    const h = mount({ save: late });
    expect(h.scene.act()).toBe(1);
    const band = balance.encounter.levelByYear;
    const ceiling = (band[0] ?? 0) + balance.encounter.levelJitter;
    for (let i = 0; i < 200; i += 1) {
      walk(h, 1);
      const met = h.scene.lastEncounterMet();
      if (met) expect(met.level, `year ${h.scene.save.year}`).toBeLessThanOrEqual(ceiling);
    }
    expect(h.scene.save.year).toBeGreaterThanOrEqual(12);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §10.5 THE CROSS-STREAM SEAM — the act the SCENE produces is the act the
 *       DIALOGUE reads, and the ending fires on it at any calendar year.
 *
 * WHY THIS SECTION EXISTS. Q3's two halves were built by lanes that could not see each other. The
 * clock/act lane made `core/acts.ts` `actOf` the only act authority and wired `game/` to it; the
 * dialogue lane re-gated 44 entries onto an act axis of its own and then made `actFromFlags` a
 * delegation to `actOf`. BOTH suites were green, and neither of them ever asked the question that
 * decides whether the change worked: **is the number the scene publishes the number the corpus
 * reads?** A mismatch there is silent — every `actMin: 6` clause simply evaluates false and the
 * player reaches the Sanctum to be told nothing — which is exactly the failure the earlier
 * `1 + badgesBeaten` derivation caused at the OTHER end of the ladder, where it cost the prologue.
 *
 * So this section plays a SLOW run through the real scene — real inn ticks, real [G] gym wins, real
 * act entries and real year turns — reaches act 6 in **calendar year 11**, five years past the year
 * the whole design used to end at, and then resolves the finale, the Vellsire choice and an epilogue
 * out of the shipped `data/dialogue.json` against the act the SCENE reports.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The scenario: act 6 reached in calendar year 11.
 *
 * Not a gameplay constant (G11) — a test fixture, and deliberately past `clock.yearsTotal`, which is
 * asserted below rather than assumed so that retuning nominal pacing upward cannot quietly turn this
 * back into an ordinary in-pace run.
 */
const FINALE_YEAR = 11;

/** Rest at the inn (`clock.innTicks`, through the scene's own [R]) until the calendar reaches `year`. */
function restUntilYear(h: Harness, year: number): void {
  let guard = 0;
  while (h.scene.save.year < year) {
    guard += 1;
    if (guard > 5000)
      throw new Error(
        `the inn never reached year ${String(year)} — stuck at Y${String(h.scene.save.year)}` +
          `t${String(h.scene.save.tick)}, handedOver=${String(h.scene.isHandedOver())}`,
      );
    h.press(KEY_R);
    frameAndSettle(h);
  }
}

/**
 * The live context `core/dialogue-schema.ts` requires, built from the SAVE and — the point of the
 * whole section — from `scene.act()`, the production act read. No act number is typed in here.
 */
function ctxOf(h: Harness, overrideYear?: number): DialogueContext {
  const save = h.scene.save;
  const populations: Record<string, Record<string, number>> = {};
  const floraStock: Record<string, number> = {};
  for (const [nodeId, state] of Object.entries(save.nodeStates)) {
    const counts: Record<string, number> = {};
    for (const [lineId, pop] of Object.entries(state.populations)) counts[lineId] = pop.count;
    populations[nodeId] = counts;
    floraStock[nodeId] = state.floraStock;
  }
  const year = overrideYear ?? save.year;
  return {
    act: h.scene.act(),
    year,
    season: seasonOf({ year, tick: save.tick, subTick: save.subTick ?? 0 }, balance),
    flags: save.questFlags,
    populations,
    floraStock,
  };
}

interface SlowRun {
  save: SaveEnvelope;
  /** The act the SCENE reported after each badge, in ladder order. */
  actsSeen: number[];
  /** The act `core/dialogue-schema.ts` derived from the same flags, after each badge. */
  actsDerived: number[];
  /** The calendar year each badge landed in. */
  badgeYears: number[];
  /** The calendar year the LAST act opened in. */
  lastActYear: number;
}

let SLOW_RUN: SlowRun | null = null;

/**
 * Play a deliberately slow run through the real scene and return where it ended up.
 *
 * Two calendar years between badges, so the fifth badge — the one `balance.acts.gates` says opens
 * the last act — lands in year 11 rather than in the year the old "six acts = six years" equation
 * expected. Every tick is spent by `restAtInn`, every badge is written by `challengeGym` → `winGym`,
 * and the only thing set by hand is where the player is STANDING, which is legitimate exactly when
 * the act model has already opened that node — asserted per leader below. (Walking there is §10.1's
 * job and it is proven there, through the same act gate.)
 */
function playSlowRun(): SlowRun {
  if (SLOW_RUN) return SLOW_RUN;
  const actsSeen: number[] = [];
  const actsDerived: number[] = [];
  const badgeYears: number[] = [];
  let save: SaveEnvelope = freshSave(LADDER[0]!.town);
  let lastActYear = -1;

  for (const [i, leader] of LADDER.entries()) {
    const target = Math.min(balance.clock.startYear + 2 * (i + 1), FINALE_YEAR);
    const h = mount({ save: { ...save, currentNode: leader.town } });
    // The placement is only legitimate because the act model has already opened this town.
    expect(nodeUnlockedAt(leader.town, h.scene.act(), balance), `${leader.town} at act ${String(h.scene.act())}`).toBe(true);
    restUntilYear(h, target);

    h.press(KEY_G);
    h.frame();
    const launch = h.parts.launches.filter((l) => l.key === "Battle").pop();
    expect(launch, `[G] launched no battle at ${leader.town}`).toBeDefined();
    const slowData = launch!.data as BattleSceneData;
    slowData.onFinished({ state: settledState(slowData, "win"), caught: null });

    save = h.scene.save;
    actsSeen.push(h.scene.act());
    actsDerived.push(actFromFlags(save.questFlags));
    badgeYears.push(save.year);
    if (h.scene.act() === balance.acts.last && lastActYear < 0) lastActYear = save.year;
  }

  SLOW_RUN = { save, actsSeen, actsDerived, badgeYears, lastActYear };
  return SLOW_RUN;
}

describe("§10.5 the two clocks meet only through the player", () => {
  it("the scenario is genuinely past the pacing the design used to END at", () => {
    // If this ever fails the section below has stopped testing what it says it tests.
    expect(FINALE_YEAR).toBeGreaterThan(balance.clock.startYear + balance.clock.yearsTotal - 1);
  });

  it("a slow player reaches the LAST act in calendar year 11, by playing", () => {
    const run = playSlowRun();
    expect(run.badgeYears).toEqual([3, 5, 7, 9, 11, 11]);
    expect(run.lastActYear).toBe(FINALE_YEAR);
    expect(run.save.year).toBe(FINALE_YEAR);
    expect(actOf(run.save, content.gyms, balance)).toBe(balance.acts.last);
    // …and the calendar did not stop, wrap, or refuse to move past nominal pacing.
    expect(run.save.year).toBeGreaterThan(balance.clock.startYear + balance.clock.yearsTotal - 1);
  });

  it("the act the SCENE publishes is the act the DIALOGUE derives, at every rung", () => {
    /*
     * THE SEAM. `actFromFlags` is a delegation to `actOf` today; when it was a derivation of its own
     * (`1 + badgesBeaten`) the two agreed at every rung EXCEPT the prologue, and nothing in either
     * lane's suite compared them on a save the game had actually produced.
     */
    const run = playSlowRun();
    expect(run.actsDerived).toEqual(run.actsSeen);
    expect(run.actsSeen).toEqual([2, 3, 4, 5, 6, 6]);
    // The prologue rung too — the one the old derivation got wrong — on a save the scene has not touched.
    const brandNew = freshSave();
    expect(actFromFlags(brandNew.questFlags)).toBe(balance.acts.first);
    expect(actOf(brandNew, content.gyms, balance)).toBe(balance.acts.first);
  });

  it("the run is complete, and the ending was handed over exactly once — in year 11", () => {
    const run = playSlowRun();
    expect(runIsComplete(run.save, content.gyms, balance)).toBe(true);
    const calls: number[] = [];
    const h = mount({ save: { ...run.save, questFlags: { ...run.save.questFlags } }, hooks: { onRunComplete: (s) => calls.push(s.year) } });
    /*
     * The slow run has the whole ladder but has NOT played an epilogue — it never stood at the ring
     * with a dialogue box. So the run is over as an ACT question and the ENDING has not been handed
     * over, which is exactly the separation the premature latch used to collapse.
     */
    expect(h.scene.runIsOver()).toBe(true);
    expect(calls).toHaveLength(0);
    // A save whose epilogue HAS played fires once, and reports the year it really happened in.
    const endedFlags: Record<string, FlagValue> = {
      ...run.save.questFlags,
      [EPILOGUE_SHOWN_FLAG]: true,
    };
    delete endedFlags[RUN_COMPLETE_SHOWN_FLAG];
    const ended = { ...run.save, questFlags: endedFlags };
    const fresh = mount({ save: ended, hooks: { onRunComplete: (s) => calls.push(s.year) } });
    expect(fresh.scene.runIsOver()).toBe(true);
    expect(calls).toEqual([FINALE_YEAR]);
  });

  it("the finale, the Vellsire choice and an epilogue all resolve at act 6 in year 11", () => {
    /*
     * THE USER STORY, END TO END, against the SHIPPED corpus. Every lookup goes through
     * `selectEntry` — the resolver the game layer must call — with the act coming from `scene.act()`.
     */
    const run = playSlowRun();
    const h = mount({ save: run.save });
    expect(h.scene.save.year).toBe(FINALE_YEAR);
    expect(h.scene.act()).toBe(balance.acts.last);

    const walked = walkTheEnding(h);
    expect(walked.ids).toEqual([
      "wick.act6.pre",
      "wick.act6.win",
      "maren.finale",
      "sanctum.vellsire.approach",
      "maren.epilogue.caught",
    ]);
    // The choice really is a choice: two options, and the epilogue keys off which one was taken.
    expect(walked.choiceCount).toBe(2);
    expect(walked.releasedEpilogue).toBe("maren.epilogue.released");
    // …and the epilogue does not replay for ever.
    expect(walked.epilogueAgain).toBeUndefined();
  });

  it("the same ending resolves identically in year 6 and in year 30 — the calendar is not an input", () => {
    const run = playSlowRun();
    const h = mount({ save: run.save });
    const at11 = walkTheEnding(h).ids;
    for (const year of [balance.clock.startYear + balance.clock.yearsTotal - 1, 30]) {
      expect(walkTheEnding(h, year).ids, `year ${String(year)}`).toEqual(at11);
    }
  });

  it("nothing stops when the run completes — the calendar keeps running and ticks are still spent", () => {
    /*
     * The other half of "no fail state, no time limit, no year cap". `spendTicks` used to refuse
     * once `core/clock.ts` `isOver` was true, so the game stopped accepting player actions when the
     * calendar passed year 6. There is no year 6 and there is no end to the calendar.
     */
    const run = playSlowRun();
    const h = mount({ save: run.save });
    /*
     * The run ends STANDING IN THE RING, and `create()` therefore plays bible §8's finale straight
     * away — the approach cutscene, headlessly, which opens the snare fight. Answer it before
     * counting ticks: this test is about the calendar not stopping, and a scene holding an
     * unanswered battle refuses every action, which would look exactly like the defect it guards.
     */
    settleYearTurn(h);
    expect(h.scene.runIsOver()).toBe(true);
    const before = h.scene.save.year;
    const rests = balance.clock.ticksPerYear;
    for (let i = 0; i < rests; i += 1) {
      h.press(KEY_R);
      frameAndSettle(h);
    }
    expect(h.scene.save.year).toBe(before + (rests * balance.clock.innTicks) / balance.clock.ticksPerYear);
    // …and the act did not move with it, in either direction.
    expect(h.scene.act()).toBe(balance.acts.last);
  });

  it("THE LEGACY BEAT survives the slow pace — the starter is long retired and an heir fights the finale", () => {
    /*
     * build-doc §1 beat 2, on the never-cut list: "the starter retires before the league; its heir
     * fights the finale." The suite proved that on a SIX-year timeline (tests/unit/lifecycle.test.ts
     * calls year 6 "the league year"), which under the old equation was the same thing as "at the
     * finale". It is not the same thing any more — the finale is an ACT — so the beat needs proving
     * on the axis that now decides it.
     *
     * Measured on this run: the creature standing in the Sanctum in year 11 is
     * `provisional-starter-heir-y4-heir-y7-heir-y10` — the starter's great-grandchild, born in
     * year 10. Three generations buried, against Hank's "having buried two".
     */
    const run = playSlowRun();
    const retirements = run.save.actionLog.filter((e) => e.action.t === "retirement");
    expect(retirements.length, "nobody retired across ten years of play").toBeGreaterThanOrEqual(2);
    expect(run.save.party.length, "nobody is standing at the finale").toBeGreaterThan(0);
    for (const creature of run.save.party) {
      expect(creature.uid, "the STARTER is still in the party at the finale").not.toBe(PROVISIONAL_STARTER_UID);
      expect(creature.caughtYear).toBeGreaterThan(balance.clock.startYear);
    }
  });

  it("the act does not move when only the calendar does — asked of the SCENE, not of core", () => {
    /*
     * `core/acts.ts` `actOf` takes no year and there must never be one, and
     * `tests/unit/dialogue.test.ts` binds that from the corpus side. This is the same claim asked of
     * the thing the player actually talks to. Mid-session during this change, `actOf` was briefly
     * seen on disk with `Math.max(act, Math.min(lastAct, save.year))` spliced into it — the calendar
     * feeding the act model — and the act lane's own suite stayed green through it.
     */
    const run = playSlowRun();
    const finished = new Set<number>();
    for (const year of [balance.clock.startYear, 2, 6, FINALE_YEAR, 30]) {
      finished.add(mount({ save: { ...run.save, year, tick: 0 } }).scene.act());
    }
    expect([...finished]).toEqual([balance.acts.last]);

    const bare = new Set<number>();
    for (const year of [balance.clock.startYear, 6, 30]) {
      bare.add(mount({ save: { ...freshSave(), year, tick: 0 } }).scene.act());
    }
    expect(bare.size, "a badgeless save changed act because the calendar moved").toBe(1);
    // Positive control: one badge DOES move it, so the assertion above is not vacuous.
    const withBadge = mount({
      save: {
        ...freshSave(),
        questFlags: { "story.opening.done": true, [`gym.${LADDER[0]!.id}.beaten`]: true },
      },
    });
    expect(withBadge.scene.act()).toBeGreaterThan([...bare][0] as number);
  });

  it("no entry the ending walks carries a calendar clause", () => {
    /*
     * Structural, so the ending cannot be re-coupled to the calendar by a later author without this
     * going red. `years` / `yearMin` / `yearMax` on any of these is the Q3a defect returning.
     */
    const ids = [
      "maren.finale",
      "greaves.finale.pre",
      "greaves.finale.post",
      "sanctum.vellsire.approach",
      "maren.epilogue.caught",
      "maren.epilogue.released",
    ];
    for (const id of ids) {
      const entry = DIALOGUE.entries.find((e) => e.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.when?.years, id).toBeUndefined();
      expect(entry?.when?.yearMin, id).toBeUndefined();
      expect(entry?.when?.yearMax, id).toBeUndefined();
    }
  });
});

/**
 * Walk the shipped ending with the real resolver, from the state the scene is actually in.
 *
 * ⚠ THE STAND-IN IS GONE. This function used to type `"story.vellsire.resolved": true` and
 * `"story.vellsire.outcome": "caught"` into a flag bag and call it "the game layer's write", with a
 * comment saying the game layer did not exist yet. That is exactly the shape of defect this file's
 * header is about: the test supplied the precondition the game never supplied, both epilogues fired,
 * and the never-cut Vellsire beat was dead in the shipped build with the suite green. The write now
 * goes through `game/finale.ts` `recordVellsireOutcome` — the same function
 * `OverworldScene.maybeBeginFinale` reaches through `resolveVellsireCatch` — so nothing in this walk
 * is stood in for, and the walk cannot pass on a build where that writer is missing.
 *
 * The other half — that the GAME calls it, off a real battle outcome, without a test hand-feeding
 * the attempt — is §10.6, which drives the scene rather than the corpus.
 */
function walkTheEnding(
  h: Harness,
  year?: number,
): { ids: string[]; choiceCount: number; releasedEpilogue: string | undefined; epilogueAgain: string | undefined } {
  const base = ctxOf(h, year);
  let flags: Record<string, FlagValue> = { ...base.flags };
  const ids: string[] = [];
  const at = (): DialogueContext => ({ ...base, flags });
  const play = (speaker: string, node: string, kind: DialogueKind): DialogueEntry | undefined => {
    const entry = selectEntry(DIALOGUE, speaker, node, kind, at());
    if (entry) {
      ids.push(entry.id);
      flags = { ...flags, ...(entry.setFlags ?? {}) };
    }
    return entry;
  };
  /** The same step for a PROP, through `propDialogueFor` — the selector `OverworldScene` calls. */
  const playProp = (propId: string, node: string): DialogueEntry | undefined => {
    const entry = propDialogueFor(DIALOGUE, propId, node, at());
    if (entry) {
      ids.push(entry.id);
      flags = { ...flags, ...(entry.setFlags ?? {}) };
    }
    return entry;
  };

  /*
   * Wick is met on the approach and Maren sends the player through. The flag that opens her
   * send-off, `story.greaves.entered`, hangs off his PRE-battle entry and not off beating him
   * (B5) — his own first line there is "He's gone in for the stag" — so the send-off survives a
   * player who loses to him, which nothing else in the act ladder makes conditional.
   */
  play("wick", "sanctum-approach", "battle-pre");
  /*
   * …AND THE FIGHT HE JUST CHALLENGED THE PLAYER TO. This walk used to step straight from Wick's
   * "Beat me and go make him hear it." to Maren's "Go on. I'll hold the page." — modelling, and so
   * certifying, an order in which the send-off is delivered BEFORE the fight it sends the player
   * off from. `maren.finale` now additionally requires `rival.act6.playerResult`, which BOTH
   * `wick.act6.win` and `wick.act6.loss` write, so the send-off waits for the fight to have
   * happened without requiring it to have gone the player's way.
   */
  play("wick", "sanctum-approach", "battle-win");
  play("maren", "sanctum-approach", "cutscene");
  /*
   * Greaves is ALREADY BEATEN here, by the real `challengeGym` in `playSlowRun` — which is what
   * writes `story.greaves.beaten`, through `greaves.finale.post`. So his `battle-pre` is correctly
   * no longer eligible and this asserts the flag rather than replaying the fight.
   */
  expect(flags["story.greaves.beaten"], "playSlowRun's sixth badge did not play greaves.finale.post").toBe(true);
  /*
   * THE RING IS A PROP, so it is asked the way the scene asks it. This walk used `play(...)` —
   * `selectEntry` on (speaker, node, kind) — which made the step depend on the entry's SPEAKER;
   * `OverworldScene:931` reaches every prop through `propDialogueFor`, which discriminates on
   * `propId` and never reads the speaker. The prose pass moved this beat onto the `narration`
   * speaker (it is a description of the stag, not the stone speaking) and only the hand-written
   * lookup noticed. The id asserted in the walk is unchanged, and so is everything downstream of
   * it: the choice count, both branches, and the epilogue that keys off which one was taken.
   */
  const approach = playProp("sanctum-antler-ring", "sanctum");
  const choiceCount = approach?.choices?.length ?? 0;

  // The player sets the snare (choice 0) …
  const attempted = { ...flags, ...(approach?.choices?.[0]?.setFlags ?? {}) };
  // … and the snare HOLDS, resolved by the shipped writer rather than by two keys typed in here.
  flags = recordVellsireOutcome({ questFlags: attempted }, "caught").questFlags;
  play("maren", "sanctum", "cutscene");
  const epilogueAgain = selectEntry(DIALOGUE, "maren", "sanctum", "cutscene", at())?.id;

  // The other branch, from the same pre-choice state. STAND ASIDE RESOLVES ITSELF: the choice's own
  // `setFlags` carry the whole outcome, because nothing is rolled and nothing can fail (B3).
  const released = selectEntry(DIALOGUE, "maren", "sanctum", "cutscene", {
    ...base,
    flags: {
      ...flags,
      "story.epilogue.shown": false,
      ...(approach?.choices?.[1]?.setFlags ?? {}),
    },
  })?.id;

  return { ids, choiceCount, releasedEpilogue: released, epilogueAgain };
}

/* ════════════════════════════════════════════════════════════════════════════
 * §10.6 THE BATTLE CORPUS, PLAYED — and the finale, resolved by the game
 *
 * WHAT WAS MISSING. `core/dialogue-schema.ts` declares three battle kinds and NOTHING IN `game/`
 * ever selected one: 35 entries and 70 lines — every leader's pre- and post-battle speech, both
 * Greaves finale entries, all eighteen Wick entries — had no path to the screen. Two never-cut
 * beats stood behind that:
 *
 *   • `story.greaves.beaten` has exactly one writer in the whole repo, `greaves.finale.post`, and it
 *     is a `battle-win`. `sanctum.vellsire.approach` gates on it.
 *   • `story.vellsire.resolved` / `story.vellsire.outcome` had NO writer anywhere. The only places
 *     either key was ever set were tests, which set it by hand and then asserted the epilogue fires.
 *
 * So every test below is written to fail on a build where the selector, the rival module or the
 * finale resolver is missing, and none of them sets a story flag by hand.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Register C7's box, so a beat is HANDED TO IT rather than played headlessly. */
function withDialogueBox(h: Harness): void {
  h.parts.registeredScenes[SCENE_KEYS.dialogue] = {};
}

/** The same, at CONSTRUCTION time — for a beat that fires out of `create()`. See `mount`. */
const registerBox = (parts: FakeParts): void => {
  parts.registeredScenes[SCENE_KEYS.dialogue] = {};
};

/** Every entry the box has been handed, in order. */
function boxed(h: Harness): string[] {
  return h.parts.launches
    .filter((l) => l.key === SCENE_KEYS.dialogue)
    .map((l) => (l.data as DialogueSceneData).entryId);
}

/** Answer the box the way `DialogueScene` answers it: play the run out, then hand the state back. */
function answerBox(h: Harness, pick: (state: DialogueRunState, choices: readonly string[]) => number = () => 0): string {
  const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.dialogue).pop();
  if (!launch) throw new Error("nothing was handed to the dialogue box");
  h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
  const data = launch.data as DialogueSceneData;
  data.onDone(runHeadless(data.file ?? DIALOGUE, data.entryId, pick));
  return data.entryId;
}

describe("§10.6 the battle corpus is selected, and the finale is resolved by the game", () => {
  it("a leader speaks BEFORE the fight, and the fight does not start until the box closes", () => {
    const first = LADDER[0]!;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    withDialogueBox(h);

    h.press(KEY_G);
    h.frame();
    // The speech is on screen and the reducer has not been handed anything.
    expect(boxed(h).at(-1)).toBe(`${first.id}.pre`);
    expect(h.parts.launches.some((l) => l.key === SCENE_KEYS.battle)).toBe(false);

    answerBox(h);
    const battle = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
    expect(battle, "closing the pre-battle box did not start the fight").toBeDefined();
    expect((battle!.data as BattleSceneData).input.kind).toBe("gym");
  });

  it("the badge is written BEFORE the leader answers, and the answer is the WIN entry", () => {
    /*
     * ORDER, not just presence. `maribel.post.win` and its four siblings write `gym.<id>.beaten`
     * themselves — so a build that played the speech before `awardBadge` would advance the act in
     * the middle of the scene announcing it.
     */
    const first = LADDER[0]!;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    withDialogueBox(h);
    h.press(KEY_G);
    h.frame();
    answerBox(h);
    const battle = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop()!;

    const winData = battle.data as BattleSceneData;
    winData.onFinished({ state: settledState(winData, "win"), caught: null });
    // The act moved on the BADGE, before the box was handed the leader's answer …
    expect(h.scene.act()).toBe(first.act + 1);
    expect(boxed(h).at(-1)).toBe(`${first.id}.post.win`);
  });

  it("a LOSS is answered with the loss entry, and no badge", () => {
    const first = LADDER[0]!;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    withDialogueBox(h);
    h.press(KEY_G);
    h.frame();
    answerBox(h);
    const battle = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop()!;
    const lossData = battle.data as BattleSceneData;
    lossData.onFinished({ state: settledState(lossData, "loss"), caught: null });
    expect(h.scene.act()).toBe(first.act);
    expect(boxed(h).at(-1)).toBe(`${first.id}.post.loss`);
    /*
     * …AND THEN THE BLACKOUT, WHICH IS NEW AND IS NOT A DETOUR AROUND THE ASSERTION ABOVE. A gym
     * loss is a wiped party — `core/battle.ts` finishes on "loss" only when nothing on the player
     * side is standing — so `OverworldScene.recoverFromBlackout` runs as the CONTINUATION of the
     * leader's answer: her line, then the black screen, then the innkeeper of the town the player
     * woke in. Asserted here rather than left to `tests/unit/recovery.test.ts`, because that file
     * tests the decision and this one is the only place the WIRING is exercised.
     */
    expect(answerBox(h)).toBe(`${first.id}.post.loss`);
    const wake = h.scene.save.currentNode;
    expect(wake, "a wiped party did not wake at an inn").toBe(wakeNodeFor(first.town, content));
    const rest = restBeatAt(wake, h.scene.dialogueCtx());
    expect(rest, `no innkeeper speaks at ${wake}`).toBeDefined();
    expect(answerBox(h)).toBe(BLACKOUT_ENTRY_ID);
    expect(boxed(h).at(-1)).toBe(rest!.id);
  });

  it("BEATING GREAVES BY PLAYING writes story.greaves.beaten — the flag no code writes", () => {
    /*
     * B2, and it is the whole reason the battle selector exists. `awardBadge` writes
     * `gym.greaves.beaten`; `story.greaves.beaten` is a DIFFERENT key, written only by
     * `greaves.finale.post`, which is a `battle-win`. `playSlowRun` climbs the whole ladder through
     * the real `challengeGym` and sets nothing by hand.
     */
    const run = playSlowRun();
    expect(run.save.questFlags["gym.greaves.beaten"]).toBe(true);
    expect(
      run.save.questFlags["story.greaves.beaten"],
      "the sixth badge did not play greaves.finale.post — the battle-win selector is missing",
    ).toBe(true);
  });

  it("…and the ring answers a player who beat him, from the state the scene is really in", () => {
    const run = playSlowRun();
    const h = mount({ save: run.save });
    settleYearTurn(h); // create() opens the finale; answer it before asking a question about it
    const ring = content.nodes
      .find((n) => n.id === balance.encounter.finaleGatedNode)
      ?.props.find((p) => p.id.includes("ring"));
    expect(ring, "the finale node ships no ring prop").toBeDefined();
    // The approach has already resolved by the time this runs, so the ring falls back to its own
    // reading — which is the correct answer, and proves the cutscene closed itself.
    expect(propDialogueFor(DIALOGUE, ring!.id, balance.encounter.finaleGatedNode, ctxOf(h))?.id).toBe(
      "prop.sanctum-antler-ring",
    );
  });

  it("STANDING ASIDE resolves the finale and plays the released epilogue — no flag set by hand", () => {
    const run = playSlowRun();
    const h = mount({ save: { ...run.save, questFlags: { ...run.save.questFlags } } }, registerBox);
    // `create()` hands the ring cutscene to the box, because Greaves is beaten and the stag is there.
    expect(boxed(h).at(-1)).toBe("sanctum.vellsire.approach");
    // Choice 1 is "stand aside".
    answerBox(h, () => 1);

    expect(h.scene.save.questFlags["story.vellsire.resolved"]).toBe(true);
    expect(h.scene.save.questFlags["story.vellsire.outcome"]).toBe("released");
    // No fight was opened, and the epilogue is on screen.
    expect(h.parts.launches.some((l) => l.key === SCENE_KEYS.battle)).toBe(false);
    expect(boxed(h).at(-1)).toBe("maren.epilogue.released");
  });

  it("SETTING THE SNARE opens a scripted Ancient fight against the stag that is really there", () => {
    const run = playSlowRun();
    const h = mount({ save: { ...run.save, questFlags: { ...run.save.questFlags } } }, registerBox);
    expect(boxed(h).at(-1)).toBe("sanctum.vellsire.approach");
    answerBox(h, () => 0); // "Set the snare."

    const battle = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
    expect(battle, "setting the snare opened no fight").toBeDefined();
    const data = battle!.data as BattleSceneData;
    // Scripted, not rolled: `kind: "ancient"`, one enemy, and it is the Ancient line the finale node
    // actually carries — read out of the content, never named here (G2).
    const ancient = content.species.find(
      (s) => s.ancient && content.nodes.find((n) => n.id === balance.encounter.finaleGatedNode)?.populations[s.id],
    );
    expect(data.input.kind).toBe("ancient");
    expect(data.input.nodeId).toBe(balance.encounter.finaleGatedNode);
    expect(data.input.enemyParty).toHaveLength(1);
    expect(data.input.enemyParty[0]!.lineId).toBe(ancient!.id);
    expect(data.input.enemyParty[0]!.age).toBe("E");
  });

  it("A FAILED SNARE resolves as released, and the released epilogue plays", () => {
    const run = playSlowRun();
    const h = mount({ save: { ...run.save, questFlags: { ...run.save.questFlags } } }, registerBox);
    answerBox(h, () => 0);
    const data = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop()!.data as BattleSceneData;
    // The reducer reports no catch — bible §4 makes this the common outcome.
    data.onFinished({ state: settledState(data, "loss"), caught: null });

    expect(h.scene.save.questFlags["story.vellsire.resolved"]).toBe(true);
    expect(h.scene.save.questFlags["story.vellsire.outcome"]).toBe("released");
    expect(boxed(h).at(-1)).toBe("maren.epilogue.released");
    /*
     * ⚠ AND THE EPILOGUE COMES BEFORE THE BLACKOUT, WHICH IS THE WHOLE REASON THE ORDER IS WHAT IT
     * IS. A lost Ancient fight is a wiped party, and `recoverFromBlackout` carries the player two
     * nodes off the ring — while both epilogues are `cutscene`s AT `sanctum`, keyed on the node
     * `playPendingCutscene` reads. Taken first, the blackout left the released epilogue unplayed.
     * So it runs as the ending's continuation, and this asserts that it still runs at all.
     */
    expect(answerBox(h)).toBe("maren.epilogue.released");
    expect(answerBox(h)).toBe(BLACKOUT_ENTRY_ID);
    expect(h.scene.save.currentNode).toBe(wakeNodeFor(balance.encounter.finaleGatedNode, content));
  });

  it("A SNARE THAT HOLDS records `caught`, moves the Sanctum's real number, and never ages", () => {
    const run = playSlowRun();
    const h = mount({ save: { ...run.save, questFlags: { ...run.save.questFlags } } }, registerBox);
    answerBox(h, () => 0);
    const data = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop()!.data as BattleSceneData;

    const nodeId = balance.encounter.finaleGatedNode;
    const spec = data.input.enemyParty[0]!;
    const before = h.scene.save.nodeStates[nodeId]!.populations[spec.lineId]!.count;
    expect(before).toBeGreaterThan(0);
    // `caughtIndividual`'s own shape, taken from the fight the SCENE built — the reducer's report,
    // which is the one thing `BattleScene` supplies and this rig cannot.
    const line = content.species.find((s) => s.id === spec.lineId)!;
    data.onFinished({
      state: settledState(data, "caught"),
      caught: {
        uid: spec.uid,
        lineId: spec.lineId,
        formName: line.formNames.E,
        age: "E",
        level: spec.level,
        traits: spec.traits,
        nodeId,
        ancient: true,
        metamorphosed: false,
      },
    });

    expect(h.scene.save.questFlags["story.vellsire.outcome"]).toBe("caught");
    expect(h.scene.save.nodeStates[nodeId]!.populations[spec.lineId]!.count).toBe(before - 1);
    const held = [...h.scene.save.party, ...h.scene.save.box].find((c) => c.lineId === spec.lineId);
    expect(held, "the count moved and the creature did not").toBeDefined();
    // G10 / Hard Req 4 — a caught Ancient never ages.
    expect(held!.age).toBe("E");
    expect(isNever(held!.projectedRetirementYear), "a caught Ancient was given a retirement year").toBe(true);
    expect(boxed(h).at(-1)).toBe("maren.epilogue.caught");
  });

  it("the stag CANNOT be snared in an ordinary foray before Greaves is beaten (B12)", () => {
    const run = playSlowRun();
    const chained = {
      ...run.save,
      currentNode: balance.encounter.finaleGatedNode,
      questFlags: { ...run.save.questFlags, "chain.vellsire.complete": true } as Record<string, FlagValue>,
    };
    const ancient = content.species.find(
      (s) => s.ancient && content.nodes.find((n) => n.id === balance.encounter.finaleGatedNode)?.populations[s.id],
    )!;

    // Greaves beaten (the slow run really beat him): the ring is open, so the line is huntable.
    const open = mount({ save: chained });
    settleYearTurn(open);
    const openRow = encounterTable(open.scene.forayContext(balance.encounter.finaleGatedNode)).find(
      (e) => e.lineId === ancient.id,
    );
    expect(openRow?.weight).toBeGreaterThan(0);

    // The same save WITHOUT the finale flag: the chain alone must not open the ring.
    const flags = { ...chained.questFlags };
    delete flags[balance.acts.runCompleteFlag];
    const shut = mount({ save: { ...chained, questFlags: flags } });
    const shutRow = encounterTable(shut.scene.forayContext(balance.encounter.finaleGatedNode)).find(
      (e) => e.lineId === ancient.id,
    );
    expect(shutRow?.weight, "the Vellsire was huntable before the finale existed").toBe(0);
  });

  it("THE RIVAL is standing on the route when the player walks onto it (bible §8)", async () => {
    const first = LADDER[0]!;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    withDialogueBox(h);
    const route = h.scene.node.adjacency.find((id) => id !== first.town)!;
    await h.scene.travelTo(route);

    expect(boxed(h).at(-1), "arriving on the route said nothing").toBe("wick.act1.pre");
    answerBox(h);
    const battle = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
    expect(battle).toBeDefined();
    const data = battle!.data as BattleSceneData;
    expect(data.input.kind).toBe("trainer");
    // The roster is data/gyms.json's `rival[]`, mapped and not invented (G2).
    const row = content.rival.find((r) => r.node === route)!;
    expect(data.input.enemyParty.map((b) => b.lineId)).toEqual(
      [...row.slots, row.signature].map((s) => s.lineId),
    );
  });

  it("LOSING to the rival leaves the encounter standing; WINNING closes it (B6)", async () => {
    const first = LADDER[0]!;
    const route = content.rival.find((r) => r.act === first.act)!.node;

    const lost = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    withDialogueBox(lost);
    await lost.scene.travelTo(route);
    answerBox(lost);
    const a = lost.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop()!;
    const aData = a.data as BattleSceneData;
    aData.onFinished({ state: settledState(aData, "loss"), caught: null });
    answerBox(lost); // wick.act1.loss — "Come back when your team has slept."
    // Losing to Wick is a wiped party, so his line is followed by the black screen and by the
    // innkeeper of the town the player woke in — see `recoverFromBlackout`.
    expect(answerBox(lost)).toBe(BLACKOUT_ENTRY_ID);
    answerBox(lost); // the innkeeper's shipped rest beat
    expect(lost.scene.save.questFlags["rival.act1.fought"]).toBeUndefined();
    // …so walking away and coming back really does offer the rematch the copy promises.
    await lost.scene.travelTo(first.town);
    await lost.scene.travelTo(route);
    expect(boxed(lost).at(-1)).toBe("wick.act1.pre");

    const won = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    withDialogueBox(won);
    await won.scene.travelTo(route);
    answerBox(won);
    const b = won.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop()!;
    const bData = b.data as BattleSceneData;
    bData.onFinished({ state: settledState(bData, "win"), caught: null });
    answerBox(won); // wick.act1.win, which is what writes `rival.act1.fought`
    expect(won.scene.save.questFlags["rival.act1.fought"]).toBe(true);
    // B15: the entry records the PLAYER's result, and the kind name is the value.
    expect(won.scene.save.questFlags["rival.act1.playerResult"]).toBe("win");
    const boxesBefore = boxed(won).length;
    await won.scene.travelTo(first.town);
    await won.scene.travelTo(route);
    expect(boxed(won).length, "a beaten rival was offered again").toBe(boxesBefore);
  });

  it("[G] on a route finds the rival, so an encounter declined on arrival is not lost", async () => {
    /*
     * The arrival trigger is the primary one, but it fires exactly once per arrival and it refuses
     * an empty party out loud. Without a way back, a player who walked in with nothing standing had
     * to leave the route and re-enter to find him again.
     */
    const first = LADDER[0]!;
    const route = content.rival.find((r) => r.act === first.act)!.node;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town, party: [] } });
    withDialogueBox(h);
    await h.scene.travelTo(route);
    // No party: the arrival said why, and opened nothing.
    expect(boxed(h)).toHaveLength(0);
    expect(h.parts.launches.some((l) => l.key === SCENE_KEYS.battle)).toBe(false);

    // Give the player something to send out, and press the challenge key on the route.
    const starter = provisionalStarter(content)!;
    h.restart({ save: { ...h.scene.save, party: [starter] } });
    withDialogueBox(h);
    h.press(KEY_G);
    h.frame();
    expect(boxed(h).at(-1)).toBe("wick.act1.pre");
  });

  it("MEETING WICK AT THE APPROACH is what opens Maren's send-off — not beating him (B5)", async () => {
    /*
     * `maren.finale` gates on `story.greaves.entered`, which was written ONLY by `wick.act6.win` —
     * so the send-off required beating a rival who could not be fought, and after the rival existed
     * it still excluded every player who lost to him. Nothing else in the act ladder is conditional
     * on the rival, so the flag hangs off his `battle-pre`, whose own first line states the fact
     * ("He's gone in for the stag").
     */
    const run = playSlowRun();
    const approach = content.rival.find((r) => r.act === balance.acts.last)!.node;
    const h = mount({
      save: { ...run.save, currentNode: approach, questFlags: { ...run.save.questFlags } },
    });
    withDialogueBox(h);
    expect(h.scene.save.questFlags["story.greaves.entered"]).toBeUndefined();
    // Standing here already; drive the arrival the way travel does.
    h.scene.challengeRival();
    expect(boxed(h).at(-1)).toBe("wick.act6.pre");
    answerBox(h);
    expect(h.scene.save.questFlags["story.greaves.entered"]).toBe(true);

    /*
     * ⚠ THIS USED TO ASSERT `boxed(h).at(-1) === "maren.finale"` RIGHT HERE, under the comment
     * "the send-off is what the approach says next, WITHOUT THE FIGHT HAVING BEEN RESOLVED" — i.e.
     * it froze an ordering bug as the contract. Wick's last line is "Beat me and go make him hear
     * it."; Maren's send-off is "Greaves went through an hour ago… Go on. I'll hold the page."
     * Both were delivered BEFORE the fight, because `finishDialogue` runs `playPendingCutscene()`
     * (OverworldScene.ts) ahead of the `afterDialogue` continuation that opens the battle, so the
     * newly-eligible cutscene wins the frame. `story.finale.spoken` is written and read by
     * `maren.finale` alone — a pure latch — so the send-off could NEVER be delivered afterwards.
     *
     * The requirement this test is named for is untouched and still asserted below: MEETING Wick
     * opens the send-off, beating him is not required. What is added is that the send-off comes
     * after the fight it sends the player off from.
     */
    expect(boxed(h), "Maren's send-off interposed before the fight").toEqual([]);
    expect(h.parts.launches.some((l) => l.key === SCENE_KEYS.battle), "the fight never opened").toBe(true);
  });

  /**
   * …and the B5 requirement itself, on the branch that motivated it: a player who LOSES to Wick at
   * the approach still gets the send-off. Both `wick.act6.win` and `wick.act6.loss` write
   * `rival.act6.playerResult`, which is what makes "the fight has happened" answerable without
   * requiring it to have gone the player's way.
   */
  for (const outcome of ["win", "loss"] as const) {
    it(`the send-off is delivered AFTER the act-6 fight, on a ${outcome}`, async () => {
      const run = playSlowRun();
      const approach = content.rival.find((r) => r.act === balance.acts.last)!.node;
      /*
       * `playSlowRun` wins the sixth badge at the SANCTUM, and closing `greaves.finale.post` there
       * queues `sanctum.vellsire.approach`, which the slow run has no dialogue box for and so plays
       * HEADLESSLY — taking choice 0, "Set the snare." So `run.save` arrives carrying an
       * unresolved `story.vellsire.attempt`, and `finishDialogue`'s `maybeBeginFinale()` would open
       * the Vellsire fight ahead of the rival's and take the battle slot (`battleRunning`). That is
       * a property of the FIXTURE, not of the beat under test, so the attempt is cleared here.
       * Nothing about the rival, the send-off or their ordering is set by hand.
       */
      const questFlags = { ...run.save.questFlags };
      delete questFlags["story.vellsire.attempt"];
      const h = mount({ save: { ...run.save, currentNode: approach, questFlags } });
      withDialogueBox(h);
      h.scene.challengeRival();
      expect(boxed(h).at(-1)).toBe("wick.act6.pre");
      answerBox(h);
      expect(settleBattle(h, outcome), "closing the pre-fight box did not start the fight").toBe(true);
      expect(boxed(h).at(-1)).toBe(`wick.act6.${outcome}`);
      answerBox(h);
      /*
       * ⚠ THE SEND-OFF IS A `cutscene` AT `sanctum-approach`, so it only arrives while the player
       * is standing there — which on a LOSS is only true because the blackout runs after Wick's
       * line rather than before it. Taken first, the wipe would have carried the player to
       * Duskhollow's inn and `playPendingCutscene` would have found nothing owed here.
       */
      expect(boxed(h).at(-1), "the send-off never arrived after the fight").toBe("maren.finale");
      if (outcome === "loss") {
        // …and the black screen is what closes the sequence: his line, the send-off, the wipe.
        answerBox(h);
        expect(boxed(h).at(-1)).toBe(BLACKOUT_ENTRY_ID);
        expect(h.scene.save.currentNode).toBe(wakeNodeFor(approach, content));
      }
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
 * §10.7 the quest layer is wired to the SCENE, not merely to the tracker
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * THE SIGNATURE DEFECT OF THIS PROJECT, REPRODUCED AT THE QUEST LAYER — and this is the test that
 * was missing.
 *
 * `syncQuestFlags` has exactly one call site in the whole game: `OverworldScene.syncQuests()`. It is
 * also the ONLY writer of any `quest.*.turnin` flag — walking every `setFlags` in the corpus, no
 * entry writes one. Measured before this existed: commenting that single line out — disconnecting
 * all ten quests from the shipped build — left the suite byte-identical, `npx tsc --noEmit` clean,
 * and the HUD after a full six-act run reading `quests 0/10 closed`. Sabotaging the tracker's
 * INTERNALS instead produced sixteen failures, none of them in this file. The suite bound the
 * FUNCTION and not the WIRING, because `tests/unit/quests.test.ts` reimplements the scene's
 * sequence (`talkEntryFor` → `runHeadless` → `applyRunFlags` → `syncQuestFlags`) in parallel to
 * `finishDialogue` rather than driving the scene.
 *
 * So this test never touches `syncQuestFlags`, `questFlags` or a quest id by hand. It presses [E],
 * walks, and travels, and asserts the flags arrived.
 */
describe("§10.7 a quest is offered, worked and closed BY PLAYING", () => {
  it("First Signs is taken, worked on Meadow Reach and turned in — no flag set by hand", async () => {
    const town = LADDER[0]!.town;
    const h = mount({ save: { ...freshSave(town), currentNode: town } });

    /*
     * ── 1. THE OFFER, played by the scene's own arrival cutscenes at `create()`.
     * `quest.first-signs.offered` is written by `maren.tutorial.survey`. Nothing here writes it.
     */
    expect(h.scene.save.questFlags["quest.first-signs.offered"]).toBe(true);
    // …and nothing is owed yet, because the player has walked nowhere.
    expect(h.scene.save.questFlags["quest.first-signs.turnin"]).toBeUndefined();

    // ── 2. THE WORK. Three distinct lines met on Meadow Reach, through real foray steps.
    const r1 = h.scene.node.adjacency.find((id) => id !== town);
    expect(r1, "Hearthollow has no route out").toBeDefined();
    await h.scene.travelTo(r1 as string);
    /*
     * Arrival opens the rival, and he is BEATEN here rather than lost to. A loss is a wiped party
     * — `core/battle.ts` finishes a trainer fight on "loss" only when nothing on the player side is
     * standing — and a wiped party is carried back to Hearthollow's inn, which would end the foray
     * this test exists to walk before it starts. Winning writes `rival.act1.fought`, so he is not
     * standing on the route again on every re-entry either. Which way the fight went is not what
     * this measures; §10.6 owns that claim, on both outcomes.
     */
    settleBattle(h, "win");

    const distinct = (): number => new Set(linesMetAt(h.scene.save, r1 as string)).size;
    for (let i = 0; i < 3000 && distinct() < 3; i += 1) {
      walk(h, 1);
      // A foray step can hand the scene over to a battle; FLED, so the party stays on its feet and
      // the walk continues from where it is. `core/battle.ts` `illegalActionReason` allows a flee
      // against a wild enemy and refuses one in a trainer battle, and a foray meets the former.
      settleBattle(h, "fled");
    }
    expect(distinct(), "three distinct lines were never met on Meadow Reach").toBeGreaterThanOrEqual(3);

    // ── 3. THE TURN-IN. Walk back to Maren and press [E].
    await h.scene.travelTo(town);
    for (let i = 0; i < 30 && h.scene.save.questFlags["quest.first-signs.done"] !== true; i += 1) {
      h.press(KEY_E);
      h.frame();
    }

    /*
     * THE TWO FLAGS THAT PROVE THE WIRING, and they prove different halves.
     *
     * `quest.first-signs.turnin` can ONLY have been written by `syncQuestFlags` — walking every
     * `setFlags` in the corpus, no dialogue entry writes any `*.turnin` — so its presence is proof
     * the SCENE called the tracker. `quest.first-signs.done` is the corpus's own, written by the
     * entry that `turnin` made eligible, so the pair proves the round trip in both directions:
     * scene → tracker → corpus → scene.
     */
    expect(
      h.scene.save.questFlags["quest.first-signs.turnin"],
      "no turn-in was written — OverworldScene is not calling syncQuestFlags",
    ).toBe(true);
    expect(
      h.scene.save.questFlags["quest.first-signs.done"],
      "the turn-in landed but the giver never closed the quest",
    ).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §9 The heir stream is the DECLARED lifecycle stream, and the scene reads the tag
 *
 * `beginYearTurn` opens the heir's stream with `core/lifecycle.ts` `heirStreamKey(balance, year)`.
 * Everything about that claim used to be checkable only by reading the line: the key was composed
 * in the scene, and the two harnesses that replicate the year turn — `tests/integration/demo-beats.ts`
 * §I3 (the Legacy never-cut beat) and `year-turn-ux`'s `liveRun` — carried their own copies of the
 * OLD `sim:heir:y<N>` and stayed green while replaying a stream the game had stopped opening.
 *
 * The key now has one spelling and `tests/unit/balance-inv3.test.ts` forbids a second. What is left
 * to prove is that THIS SCENE goes through it, and the observable for that is the refusal:
 * `heirStreamKey` checks the tag against `balance.rng.subsystemTags` at call time, so a balance
 * without the tag can only produce a refused year turn IF the scene really asks.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§9 the year turn's heir roll goes through heirStreamKey", () => {
  /** Enough inn rests to end at least one year, whatever the clock is retuned to. */
  const REST_PRESSES = balance.clock.ticksPerYear;

  function balanceWithout(tag: string): Content {
    return {
      ...content,
      balance: {
        ...balance,
        rng: { ...balance.rng, subsystemTags: balance.rng.subsystemTags.filter((t) => t !== tag) },
      },
    };
  }

  /** Rest at the inn `presses` times, playing out any year turn that starts. */
  function rest(h: Harness, presses: number, settle: boolean): void {
    for (let i = 0; i < presses; i += 1) {
      h.press(KEY_R);
      if (settle) frameAndSettle(h);
      else h.frame();
    }
  }

  /** The turns the SAVE records — `finishYearTurn` → `appendYearTurn` is the only writer. */
  const turnsRun = (h: Harness): number =>
    h.scene.save.actionLog.filter((e) => e.action.t === "yearTurn").length;

  it('BINDS — drop "lifecycle" from balance.rng.subsystemTags and the scene runs no year turn', () => {
    const h = mount({ content: balanceWithout("lifecycle") });
    rest(h, REST_PRESSES, false);

    // The CLOCK still moves — the refusal is the turn, not the calendar — so the run really did
    // reach the thing under test rather than stopping short of it.
    expect(h.scene.save.year, "no year ever ended, so nothing was refused").toBeGreaterThan(balance.clock.startYear);
    expect(turnsRun(h), "the year turn ran without the declared tag — the scene is not asking").toBe(0);
    // Refused, not half-run: nothing was handed to the year-turn sequence either.
    expect(h.parts.launches.some((l) => l.key === SCENE_KEYS.yearTurn)).toBe(false);
    expect(h.scene.isHandedOver()).toBe(false);
  });

  it("BINDS THE OTHER SIDE — with the shipped balance the very same run turns the year", () => {
    // Without this the case above would pass for a scene that refuses every year turn, or one that
    // never reaches a year end at all.
    const h = mount();
    rest(h, REST_PRESSES, true);
    expect(h.scene.save.year).toBeGreaterThan(balance.clock.startYear);
    expect(turnsRun(h), "the shipped balance turns no year either — the rig is measuring nothing").toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §11 THE FOURTH PRICE — a fight costs `clock.battleTicks`, levied once at launch
 *
 * L8 priced three actions and the shell spent three. A battle was free: a player could meet, fight,
 * flee and meet again all day and the meter never moved, so the encounter budget the balance
 * harness tunes (`encounter._throughput`) was a fiction — the honest form of it prices every fight.
 * `clock.battleTicks` is 0.5, which is why `ClockState` gained `subTick`: the price is a FRACTION,
 * and two fights are one tick.
 *
 * Nothing below types a tick count in. Every expectation is `core/clock.ts`'s own reading of
 * `data/balance.json` (G11), so a retune of the price moves the assertions with the world.
 * ════════════════════════════════════════════════════════════════════════════ */

/** The clock as ONE integer count of sub-ticks — the only unit a half tick can be counted in. */
function subTicksSpent(save: SaveEnvelope): number {
  const { startYear, ticksPerYear, subTicksPerTick } = balance.clock;
  return ((save.year - startYear) * ticksPerYear + save.tick) * subTicksPerTick + (save.subTick ?? 0);
}

/** What one action of each kind costs, in sub-ticks, straight from balance. */
const COST: Record<"travel" | "foray" | "inn" | "battle", number> = {
  travel: subTicksForAction("travel", balance),
  foray: subTicksForAction("foray", balance),
  inn: subTicksForAction("inn", balance),
  battle: subTicksForAction("battle", balance),
};

describe("§11 a fight costs clock.battleTicks, and it is charged at LAUNCH", () => {
  const first = LADDER[0]!;

  /** A save standing in the first leader's town, with the whole ladder still to climb. */
  function atTheGym(over: Partial<SaveEnvelope> = {}): SaveEnvelope {
    return { ...freshSave(first.town), currentNode: first.town, ...over };
  }

  it("charges exactly clock.battleTicks, once, and puts the launch on the tape", () => {
    const h = mount({ save: atTheGym() });
    const before = subTicksSpent(h.scene.save);

    h.press(KEY_G);
    h.frame();

    expect(h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle), "[G] launched no fight").toHaveLength(1);
    expect(subTicksSpent(h.scene.save) - before).toBe(COST.battle);
    // Derived from balance, never a literal 0.5: `subTicksForAction` IS `ticksForAction × resolution`.
    expect(COST.battle).toBe(Math.round(ticksForAction("battle", balance) * balance.clock.subTicksPerTick));
    /*
     * …and the tape carries it, so `core/save.ts` `replay` pays the same price the live run did
     * (L10). A charge that moved the clock without an entry would be a replay that finishes the run
     * in a different year than the run it is replaying.
     */
    const last = h.scene.save.actionLog[h.scene.save.actionLog.length - 1]!;
    expect(last.action).toMatchObject({ t: "battle", kind: "gym", nodeId: first.town });
  });

  it("two fights are exactly one whole tick — the sub-tick carries rather than rounding away", () => {
    const per = balance.clock.subTicksPerTick;
    // The premise, asserted rather than assumed: the price is a FRACTION of a tick and it divides
    // one. `core/schemas.ts` refuses to boot a balance where it does not, so this cannot silently
    // become a test of nothing.
    expect(COST.battle).toBeGreaterThan(0);
    expect(COST.battle).toBeLessThan(per);
    expect(per % COST.battle, "clock.battleTicks does not divide a whole tick").toBe(0);
    const fightsPerTick = per / COST.battle;

    /*
     * ⚠ EVERY LOSS IS ALSO A BLACKOUT, AND THE PRICE IS CARRIED EXPLICITLY RATHER THAN AVOIDED.
     * A LOSS is charged (the fight happened) and leaves the leader challengeable — `gymBattleProblem`
     * refuses a gym whose badge is already won, so a WIN cannot be fought twice and a loss is the
     * only way this file can reach a second fight at one gym. But `core/battle.ts` finishes on
     * "loss" only when nothing on the player side is standing, so each loss is a wiped party, and
     * `OverworldScene.recoverFromBlackout` charges `core/recovery.ts` `BLACKOUT_COST` for it.
     *
     * That price is WHOLE ticks (`["inn","inn","travel"]`), which is exactly why it does not
     * disturb what this test is about: the fraction the FIGHT costs still has to carry in the
     * sub-tick. The premise is asserted rather than assumed, so a retune that made an inn or a
     * travel fractional fails here instead of quietly turning the arithmetic below into fiction.
     */
    const perLoss = blackoutTicks(balance);
    expect(Number.isInteger(perLoss), "a blackout costs a fraction of a tick, so the carry below is wrong").toBe(true);

    const h = mount({ save: atTheGym() });
    const openingTick = h.scene.save.tick;
    expect(h.scene.save.subTick ?? 0).toBe(0);

    let blackedOut = 0;
    for (let fight = 0; fight < fightsPerTick; fight += 1) {
      h.press(KEY_G);
      h.frame();
      expect(settleBattle(h, "loss"), `fight ${String(fight)} never started`).toBe(true);
      blackedOut += perLoss;
      if (fight + 1 < fightsPerTick) {
        // Mid-way: the whole-tick counter has moved by the BLACKOUTS and by nothing else, because
        // the fight's own charge is a fraction that is owed and not yet due.
        expect(h.scene.save.tick, "a fractional charge rounded up to a whole tick").toBe(openingTick + blackedOut);
        expect(h.scene.save.subTick).toBe(COST.battle * (fight + 1));
      }
    }

    expect(h.scene.save.tick).toBe(openingTick + blackedOut + 1);
    expect(h.scene.save.subTick ?? 0).toBe(0);
  });

  it("THE YEAR-TURN HAZARD — a charge that fills the meter is not eaten, and no fight rides on top of the turn", () => {
    /*
     * `spendTicks` RETURNS WITHOUT CHARGING while `yearTurnRunning`, and `handOffToBattle` charges
     * before it hands the screen over — so the one clock position where the two meet has to be
     * pinned. This is it: the meter exactly `clock.battleTicks` short of full. The charge fills it,
     * `handleClockEvents` hands the screen to the year turn, and a build that then launched the
     * fight anyway would have two full-screen scenes up for one keypress; a build that charged
     * AFTER the hand-off would give the fight away free, once a year, for ever.
     */
    const per = balance.clock.subTicksPerTick;
    const at = balance.clock.ticksPerYear * per - COST.battle;
    const h = mount({
      save: atTheGym({ tick: Math.floor(at / per), subTick: at % per }),
    });
    const before = subTicksSpent(h.scene.save);
    expect(balance.clock.ticksPerYear * per - before, "the fixture is not one fight short of the year").toBe(
      COST.battle,
    );

    h.press(KEY_G);
    h.frame();

    // The year turned …
    expect(h.parts.launches.some((l) => l.key === SCENE_KEYS.yearTurn), "the charge did not end the year").toBe(true);
    // … and the fight was refused rather than launched underneath it. ONE hand-off, not two.
    expect(h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle)).toHaveLength(0);
    // The refusal is SAID, like every other refusal in this scene.
    const said = h.parts.objects.filter((o) => o.kind === "text").map((o) => o.text);
    expect(said.some((t) => t.includes("the year turned first"))).toBe(true);

    settleYearTurn(h);

    // THE CHARGE STANDS, and it is exactly one fight's worth — not zero, and not two.
    expect(subTicksSpent(h.scene.save) - before).toBe(COST.battle);
    expect(h.scene.save.year).toBe(balance.clock.startYear + 1);
    expect(h.scene.save.actionLog.filter((e) => e.action.t === "battle")).toHaveLength(1);
  });

  it("an all-fainted party is refused BEFORE the tick is spent, instead of throwing inside the reducer", () => {
    /*
     * `game/wild-battle.ts` `partySpecs` counts party MEMBERS, so every `no creature in the party`
     * refusal in the game layer passes a party of nothing but fainted creatures straight through —
     * and `core/battle.ts` `startBattle` then throws. That was already a crash where a refusal
     * belonged; with the price above it would be a crash with the tick already spent and the
     * overworld already paused, i.e. an unrecoverable screen that had also charged for itself.
     */
    const base = freshSave(first.town);
    expect(base.party.length, "the fixture depends on a party to knock down").toBeGreaterThan(0);
    const down = { ...base, currentNode: first.town, party: base.party.map((c) => ({ ...c, curHp: 0 })) };

    // The throw this refusal stands in front of is real: the reducer's own answer to that party.
    const build = buildGymBattle({
      content,
      save: down,
      gym: first,
      node: liveNodeOf(content, down, first.town),
    });
    expect(() => startBattle(build.input, build.ctx)).toThrow(/fainted/);

    const h = mount({ save: down });
    const before = subTicksSpent(h.scene.save);
    h.press(KEY_G);
    h.frame();

    expect(h.parts.launches.some((l) => l.key === SCENE_KEYS.battle)).toBe(false);
    expect(subTicksSpent(h.scene.save), "a refused fight was charged for").toBe(before);
    expect(h.scene.save.actionLog.some((e) => e.action.t === "battle")).toBe(false);
    const said = h.parts.objects.filter((o) => o.kind === "text").map((o) => o.text);
    expect(said.some((t) => t.includes("nothing in the party is standing"))).toBe(true);

    // The positive control: the same save with the same party STANDING does fight, and is charged.
    const up = mount({ save: { ...down, party: base.party.map((c) => ({ ...c })) } });
    const upBefore = subTicksSpent(up.scene.save);
    up.press(KEY_G);
    up.frame();
    expect(up.parts.launches.some((l) => l.key === SCENE_KEYS.battle)).toBe(true);
    expect(subTicksSpent(up.scene.save) - upBefore).toBe(COST.battle);
  });

  it("NOTHING IS FREE — the clock's total is exactly the tape's, over a played run", () => {
    /*
     * The accounting invariant, and the one assertion that binds all four launch sites at once
     * (wild, gym, rival, the ring) without naming any of them: every sub-tick the clock has moved is
     * an action on the tape, and every action on the tape moved the clock by its balance price. A
     * fight launched without a charge — the defect the year-turn guard exists to stop — breaks this
     * whichever site it happens at, and so does a charge levied twice.
     */
    const h = mount({ save: { ...freshSave(), items: { master: 4 } } });
    const opening = subTicksSpent(h.data.save as SaveEnvelope);

    for (let round = 0; round < 12; round += 1) {
      walk(h, 40);
      settleBattle(h, "loss");
      settleYearTurn(h);
      h.press(KEY_R);
      frameAndSettle(h);
    }

    const owed = h.scene.save.actionLog.reduce((sum, entry) => {
      const kind = entry.action.t;
      return sum + (kind === "travel" || kind === "foray" || kind === "inn" || kind === "battle" ? COST[kind] : 0);
    }, 0);

    expect(owed, "the run spent no ticks at all").toBeGreaterThan(0);
    expect(subTicksSpent(h.scene.save) - opening).toBe(owed);
    // …and the run really did contain fights, or the battle price is not being measured here.
    expect(
      h.scene.save.actionLog.filter((e) => e.action.t === "battle").length,
      "no fight happened, so nothing above measures the fourth price",
    ).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §12 THE FORAY ODOMETER IS THE SAVE'S — travel does not refund the walk, and
 *     neither does quitting
 *
 * `stepsSinceTick` was scene state that `buildNodeView` reset whenever the node changed. Both
 * halves gave the walk back: travelling with 47 of 48 steps banked started the next excursion at
 * zero, and so did saving and reloading. Hank: *"I see no reason why stepsSinceTick should reset
 * after a fast travel. We should get rid of that reset."*
 *
 * The counter measures WALKING, not a place. Nothing below types a step count in: the fixture is
 * `stepsPerForay(balance)` (G11), so a retune of the foray price moves these with the world.
 *
 * THE THIRD CASE IS THE MIGRATION. `SaveFile.forayStepsSinceTick` is optional so a save written
 * before the field existed still loads (INV-2), and that fallback was the one part of the ruling
 * nothing here witnessed — an `init` made to throw on the absent field left this whole file green.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§12 the foray odometer is banked in the save and survives travel and reload", () => {
  const first = LADDER[0]!;

  it("travel does not refund the walk — the odometer crosses the node boundary intact", async () => {
    const per = stepsPerForay(balance);
    // The premise: a foray tick is charged after MANY steps, so there is a part-walk to lose. With
    // `stepsPerForay` of 1 nothing could ever be banked and the case below would test nothing.
    expect(per, "a foray tick costs one step, so no part-walk can be banked").toBeGreaterThan(1);
    const banked = per - 1;

    /*
     * The fixture is the SAVE's field, not a walk, because that is the whole claim of this section:
     * the odometer is save state (`SaveFile.forayStepsSinceTick`) and the scene reads it in `init`.
     * A walk would measure the same thing through a step loop that §11 already exercises.
     */
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town, forayStepsSinceTick: banked } });
    expect(h.scene.forayStepsSinceTick(), "the scene did not open on the save's odometer").toBe(banked);

    const route = h.scene.node.adjacency.find((id) => id !== first.town);
    expect(route, `${first.town} is adjacent to nothing, so there is no travel to test`).toBeDefined();
    await h.scene.travelTo(route as string);
    /*
     * bible §8's rival is triggered by ARRIVAL on the first route, so the travel hands a fight over.
     * Answered with a WIN, and the change from a loss is not cosmetic: a lost trainer fight is a
     * wiped party (`core/battle.ts` finishes on "loss" only when nothing is standing), and a wiped
     * party is carried to an inn — which would move `currentNode` off the route and make the line
     * below a test of the blackout rather than of travel. Which way the fight went is still not
     * what this measures.
     */
    settleBattle(h, "win");

    expect(h.scene.save.currentNode, "the travel was refused, so nothing below is about travel").toBe(route);
    expect(h.scene.forayStepsSinceTick(), "travel gave the banked walk back").toBe(banked);
    expect(h.scene.save.forayStepsSinceTick, "the save disagrees with the scene about the odometer").toBe(banked);
  });

  it("…and neither does quitting — a restart resumes on the banked walk, not on zero", () => {
    const per = stepsPerForay(balance);
    const h = mount({ save: freshSave() });

    // Walk short of the rollover so a real part-walk is standing when the scene is torn down. A
    // step that meets something hands the screen over and the rest of the walk would be a no-op.
    const walked = walk(h, per - 1, () => h.scene.isHandedOver());
    settleBattle(h, "loss");
    expect(walked, "the rig walked nowhere, so nothing here is measuring the odometer").toBeGreaterThan(0);
    const banked = h.scene.forayStepsSinceTick();
    expect(banked, "the walk rolled over instead of banking").toBeGreaterThan(0);
    /*
     * AND IT IS THE RIGHT NUMBER, not merely a number the scene is willing to repeat. `banked` is
     * read off the scene under test, so on its own it would carry any miscount straight into the
     * expectation and still agree with itself afterwards. `walk` counts tile moves independently —
     * off `movement.tile` changing, never off the odometer — so this is the one line here that can
     * tell a counter that banks every step from one that banks every other one.
     */
    expect(banked, "the odometer disagrees with the number of steps actually walked").toBe(walked);
    /*
     * THE ODOMETER IS WRITTEN ON EVERY STEP, not only when it rolls over — whoever persists the save
     * persists whatever `this.save` says at that moment, so a step that did not update it is a step
     * the player gets back for free by reloading.
     */
    expect(h.scene.save.forayStepsSinceTick, "the banked walk was never written to the save").toBe(banked);

    // `restart` is what `scene.start(Overworld, data)` does — the reload path, `init` and all.
    h.restart({ save: h.scene.save });
    expect(h.scene.forayStepsSinceTick(), "quitting gave the banked walk back").toBe(banked);

    /*
     * …AND THEN A COLD ONE, WHICH IS THE HALF THAT ACTUALLY BINDS `init`'s READ-BACK.
     *
     * ⚠ THE RESTART ABOVE PROVES LESS THAN IT LOOKS. Phaser reuses the scene INSTANCE across
     * `scene.start` and the harness reproduces that faithfully, so `this.stepsSinceTick` survives as
     * a FIELD whether or not `init` ever consults the save. Measured, by deleting
     * `this.stepsSinceTick = this.save.forayStepsSinceTick ?? 0` from `init` outright: the assertion
     * above stayed GREEN. It was passing for the old scene-only counter — the exact thing the ruling
     * replaced — and so it bound nothing about persistence at all.
     *
     * Quitting the GAME reuses no instance. It writes bytes and builds a new scene out of them, so
     * that is what is done here: the save goes through the real `serialize`/`deserialize` and a
     * brand-new `OverworldScene` is mounted on what came back. This is the whole chain the ruling
     * names — the field is written, it survives canonical JSON, the schema keeps it, and `init`
     * reads it — and it fails if any single link drops the walk.
     */
    const reloaded = deserialize(serialize(h.scene.save), balance);
    expect(reloaded.forayStepsSinceTick, "the odometer did not survive the save's own round trip").toBe(banked);
    const cold = mount({ save: reloaded });
    expect(cold.scene.forayStepsSinceTick(), "a cold reload opened the excursion on zero").toBe(banked);
  });

  it("A SAVE WRITTEN BEFORE THE FIELD EXISTED still loads, and opens on a fresh excursion (INV-2)", () => {
    /*
     * `SaveFile.forayStepsSinceTick` is optional exactly so a save written before it existed opens
     * rather than failing to load, and `init` spells that `?? 0`.
     *
     * NOTHING EXERCISED THE ABSENT CASE. Measured, by making `init` THROW on a save that lacks the
     * field: every test in this file stayed green apart from the two §3 failures already standing.
     * The fallback was load-bearing for INV-2 and unwitnessed, so it is witnessed here.
     */
    const preField: SaveEnvelope = { ...freshSave() };
    delete preField.forayStepsSinceTick;
    expect("forayStepsSinceTick" in preField, "the fixture still carries the field it is missing").toBe(false);

    const h = mount({ save: preField });
    expect(h.scene.forayStepsSinceTick(), "an older save did not open on a fresh excursion").toBe(0);

    /*
     * …and it is a WORKING zero, not an `undefined` that merely prints like one. `undefined + 1` is
     * `NaN`, `NaN >= stepsPerForay` is false for ever, and the odometer would then never charge a
     * foray tick again for the rest of that run — a silent refund of every excursion, from one
     * missing `?? 0`. So the next step is taken, and counted.
     */
    const walked = walk(h, 1, () => h.scene.isHandedOver());
    expect(walked, "the rig could not take the one step this needs").toBe(1);
    expect(h.scene.forayStepsSinceTick(), "the odometer did not count on from zero").toBe(1);
    expect(h.scene.save.forayStepsSinceTick).toBe(1);
  });

  it("BINDS THE OTHER SIDE — the odometer still rolls over and still charges the foray tick", () => {
    /*
     * Without this, both cases above would pass for a counter that is frozen: never reset, never
     * charged, and never a price. The walk is only kept because it is on its way to a tick.
     */
    const per = stepsPerForay(balance);
    const h = mount({ save: { ...freshSave(), forayStepsSinceTick: per - 1 } });
    const forays = (): number => h.scene.save.actionLog.filter((e) => e.action.t === "foray").length;
    const before = forays();

    const walked = walk(h, 1, () => h.scene.isHandedOver());
    expect(walked, "the rig could not take the one step this needs").toBe(1);

    expect(forays() - before, "the step that filled the odometer charged no foray tick").toBe(1);
    expect(h.scene.forayStepsSinceTick(), "the odometer did not reset when it was charged").toBe(0);
    expect(h.scene.save.forayStepsSinceTick).toBe(0);
  });

  it("A STEP THAT LANDS WHILE THE YEAR IS TURNING BANKS ITS FORAY — it is not zeroed and not lost", () => {
    /*
     * ⚠ THE ONE CASE THE FOUR ABOVE CANNOT REACH. Every one of them stops on `isHandedOver()`, so
     * `yearTurnRunning` is false on every step they take and the second half of the guard —
     * `&& !this.yearTurnRunning` — decides nothing for them. Measured: dropping that term from
     * `onStepCompleted` leaves all four green.
     *
     * THE DEFECT IT STANDS IN FRONT OF. {@link OverworldScene.spendTicks} RETURNS WITHOUT CHARGING
     * while `yearTurnRunning`, silently, which is safe only for a caller that has already decided
     * there is nothing to do. `onStepCompleted` had not: it zeroed the odometer and wrote the zero
     * into the save BEFORE asking, so the tick vanished and the whole excursion that earned it went
     * with it — a foray the player walked and was not billed for, once per year turn, and no
     * `onSaveChanged` for the reset either, because the notification sits in the other branch.
     *
     * IT IS A SAME-FRAME ROUTE, NOT A SAME-KEY ONE, and that is why an audit called it unreachable.
     * `ScenePlugin.pause` pauses nothing on the spot — it is `this.manager.queueOp('pause', …)`
     * (node_modules/phaser/src/scene/ScenePlugin.js), drained by `SceneManager.update`'s
     * `processQueue()` at the top of the NEXT frame — and {@link OverworldScene.update} handles the
     * inn key BEFORE it drains the movement events. So [R] pressed on the frame a tile step lands
     * runs `restAtInn` → `spendTicks("inn")` → `beginYearTurn`, and then the same `update()` walks
     * the completed step into `onStepCompleted` with the flag already up. One `h.frame()` below
     * does both, through the shipped `update` in the shipped order.
     */
    const per = stepsPerForay(balance);
    // The premise: a foray tick is charged after MANY steps, so there is a walk to bank at all.
    expect(per, "a foray tick costs one step, so no part-walk can be banked").toBeGreaterThan(1);

    /*
     * ONE INN SHORT OF THE FULL METER, in sub-ticks off balance (G11) — the same arithmetic §11
     * pins its year-turn hazard with, so a retune of `clock.innTicks` moves the fixture with the
     * world. The odometer opens one step short of the rollover: this frame owes a foray tick AND
     * ends the year, which is the whole collision.
     */
    const subPer = balance.clock.subTicksPerTick;
    const at = balance.clock.ticksPerYear * subPer - COST.inn;
    const h = mount({
      save: {
        ...freshSave(),
        tick: Math.floor(at / subPer),
        subTick: at % subPer,
        forayStepsSinceTick: per - 1,
      },
    });
    expect(
      balance.clock.ticksPerYear * subPer - subTicksSpent(h.scene.save),
      "the fixture is not one inn short of the year",
    ).toBe(COST.inn);
    expect(h.scene.forayStepsSinceTick(), "the scene did not open on the save's odometer").toBe(per - 1);

    const forays = (): number => h.scene.save.actionLog.filter((e) => e.action.t === "foray").length;
    expect(forays(), "the fixture starts with a foray already on the tape").toBe(0);

    // Hold a direction with an open tile in front of it, so the step really lands on this frame
    // rather than bumping a wall — a bump emits `blocked`, never `stepCompleted`, and would leave
    // everything below measuring a frame in which nothing was walked.
    const DELTAS = {
      right: { dCol: 1, dRow: 0 },
      down: { dCol: 0, dRow: 1 },
      left: { dCol: -1, dRow: 0 },
      up: { dCol: 0, dRow: -1 },
    } as const;
    const from = h.scene.movement.tile;
    const open = (Object.keys(DELTAS) as Array<keyof typeof DELTAS>).find((dir) =>
      h.scene.canEnter({ col: from.col + DELTAS[dir].dCol, row: from.row + DELTAS[dir].dRow }),
    );
    expect(open, "the player is walled in, so no step can land on the frame under test").toBeDefined();
    h.hold(open as keyof typeof DELTAS, true);

    // ONE FRAME. The inn is read first, the movement events after — see the header.
    h.press(KEY_R);
    h.frame();
    h.hold(open as keyof typeof DELTAS, false);

    // The frame really did both, or nothing below is about the collision it claims to be about.
    expect(h.scene.movement.stepsTaken, "no tile step landed on the frame the inn ended the year").toBe(1);
    expect(
      h.parts.launches.some((l) => l.key === SCENE_KEYS.yearTurn),
      "the inn did not end the year, so the flag was never up when the step landed",
    ).toBe(true);
    expect(h.scene.isHandedOver(), "the year turn is not holding the screen").toBe(true);

    /*
     * THE STEP IS BANKED, IN THE SCENE AND IN THE SAVE. `spendTicks` would refuse the charge, so the
     * odometer must not be spent: it counts the step it just took and keeps the debt. `0` here is
     * the defect — a walked foray billed to nobody.
     */
    expect(h.scene.forayStepsSinceTick(), "the odometer was zeroed for a tick that was never charged").toBe(per);
    expect(h.scene.save.forayStepsSinceTick, "the save disagrees with the scene about the banked walk").toBe(per);
    // …and nothing WAS charged for it, which is the half `spendTicks` was already doing on its own.
    expect(forays(), "a foray tick was charged while the year turn held the screen").toBe(0);

    settleYearTurn(h);
    /*
     * THE SCENE'S HALF OF THE DEBT SURVIVES THE TURN — and only the scene's. `beginYearTurn`
     * snapshots `atEndedYear` from `this.save` while it is still inside `spendTicks("inn")`, i.e.
     * BEFORE `onStepCompleted` writes the banked step, so the turn's own commit hands back a save
     * carrying `per - 1`. Measured through this rig: the save reads one step short of the scene.
     * That is a seam of its own and not the guard under test — the charge below still lands,
     * because the scene's field is what `onStepCompleted` counts — so it is asserted neither way
     * here rather than being written down as if it were correct.
     */
    expect(h.scene.forayStepsSinceTick(), "the year turn spent the banked walk on its way past").toBe(per);

    /*
     * …AND THE DEBT IS PAID ON THE OTHER SIDE, which is what makes this a test of the fix rather
     * than of the symptom. Everything above says only that the odometer was not SPENT; none of it
     * says the banked walk is ever billed. A build that kept the number and then never charged it,
     * or charged it twice on the way past, reads identically up to this line. So one more step is
     * taken — the first one past `stepsPerForay` — and it must charge exactly one foray tick.
     */
    const owedFrom = subTicksSpent(h.scene.save);
    const walked = walk(h, 1, () => h.scene.isHandedOver());
    expect(walked, "the rig could not take the one step this needs").toBe(1);

    expect(forays(), "the banked foray was never charged — the walk was lost, not banked").toBe(1);
    expect(subTicksSpent(h.scene.save) - owedFrom, "the step past the turn charged the wrong number of ticks").toBe(
      COST.foray,
    );
    expect(h.scene.forayStepsSinceTick(), "the odometer did not reset when it was finally charged").toBe(0);
    expect(h.scene.save.forayStepsSinceTick).toBe(0);
    // The charge is on the TAPE too, so `core/save.ts` `replay` pays what the live run paid (L10).
    expect(h.scene.save.actionLog.filter((e) => e.action.t === "foray")).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §13 THE YEAR TURN DOES NOT DISCARD SAVE WRITES MADE WHILE IT HOLDS THE SCREEN
 *
 * `beginYearTurn` forks the save: it snapshots `atEndedYear` from `this.save` while it is still
 * inside the `spendTicks` that ended the year, hands the fork to the sequence, and — frames later —
 * `finish(save)` assigns the fork's descendant back over `this.save`. Every write the LIVE branch
 * made in between was therefore overwritten, silently, whatever it was.
 *
 * ⚠ THIS IS A CLASS, NOT A FIELD. `forayStepsSinceTick` is the instance that was measured (the
 * scene read 48 and the save read 47, so a player who quit between the turn and their next step
 * lost the banked step) but nothing about the mechanism is about the odometer: `syncEvents` and
 * `syncQuests` run in that window on EVERY year turn, `recordLineMet` runs there on a step that
 * met a line, and a fight or a dialogue still on screen when the turn began answers into it. So the
 * cases below assert the RULE — an arbitrary write survives — and the odometer is one of them.
 *
 * The other half of the rule is asserted too: where the TURN wrote a field, the turn wins. A merge
 * that let a stale live value beat the turn's own commit would lose the aging and the fourth season
 * step, which is a worse defect than the one being fixed.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§13 a save write made while the year turn holds the screen survives it", () => {
  /**
   * Mount one inn short of the year, press [R], and return with the sequence launched and unanswered
   * — i.e. standing inside the window between the fork and `finish`.
   *
   * The clock is arithmetic off balance (G11), the same fixture §12's banked-step case uses.
   */
  function openYearTurn(over: Partial<SaveEnvelope> = {}): Harness {
    const subPer = balance.clock.subTicksPerTick;
    const at = balance.clock.ticksPerYear * subPer - COST.inn;
    const h = mount({
      save: { ...freshSave(), tick: Math.floor(at / subPer), subTick: at % subPer, ...over },
    });
    expect(
      balance.clock.ticksPerYear * subPer - subTicksSpent(h.scene.save),
      "the fixture is not one inn short of the year",
    ).toBe(COST.inn);
    h.press(KEY_R);
    h.frame();
    expect(
      h.parts.launches.some((l) => l.key === SCENE_KEYS.yearTurn),
      "the inn did not end the year, so there is no window to write into",
    ).toBe(true);
    expect(h.scene.isHandedOver(), "the year turn is not holding the screen").toBe(true);
    return h;
  }

  it("an arbitrary write to the save is not thrown away by the turn's commit", () => {
    const h = openYearTurn();

    /*
     * THREE STRUCTURALLY DIFFERENT FIELDS — a number, a flag map and a count map — written the way
     * every writer in the scene writes: a fresh top-level object over `this.save`. Three, because a
     * fix that names the fields it rescues has to guess all of them, and the next writer to land in
     * this window will be a field nobody guessed. None of the three is touched by `core/lifecycle.ts`
     * `advanceYear`, so the turn has no claim on any of them and the live value must stand.
     */
    const MARK = "test.mid.turn.marker";
    const ITEM = "test-mid-turn-item";
    h.scene.save = {
      ...h.scene.save,
      money: h.scene.save.money + 777,
      questFlags: { ...h.scene.save.questFlags, [MARK]: true },
      items: { ...h.scene.save.items, [ITEM]: 3 },
    };
    const money = h.scene.save.money;

    settleYearTurn(h);

    expect(h.scene.save.money, "the turn's commit reverted a write made while it held the screen").toBe(money);
    expect(h.scene.save.questFlags[MARK], "a quest flag written during the turn was discarded").toBe(true);
    expect(h.scene.save.items[ITEM], "a bag change made during the turn was discarded").toBe(3);
  });

  it("where the TURN wrote the field, the turn's value wins — the merge does not resurrect stale state", () => {
    const h = openYearTurn();

    /*
     * The mirror case, and the one a careless merge breaks. `nodeStates` IS the sim (build-doc §7.8)
     * and the turn rewrites it — the fourth season step plus §7.3's cascade — so a live write made
     * in the window has no standing against it. A sentinel far outside any population the sim can
     * produce, so "the turn won" cannot be confused with "the sim happened to land here".
     */
    const SENTINEL = 987654321;
    const nodeId = h.scene.node.id;
    const state = h.scene.save.nodeStates[nodeId];
    expect(state, "the fixture has no state for the node the player is standing in").toBeDefined();
    const lineId = Object.keys((state as NodeState).populations)[0];
    expect(lineId, "the node has no populations, so there is nothing for the turn to own").toBeDefined();
    h.scene.save = {
      ...h.scene.save,
      nodeStates: {
        ...h.scene.save.nodeStates,
        [nodeId]: {
          ...(state as NodeState),
          populations: {
            ...(state as NodeState).populations,
            [lineId as string]: { ...(state as NodeState).populations[lineId as string]!, count: SENTINEL },
          },
        },
      },
    };

    settleYearTurn(h);

    expect(
      h.scene.save.nodeStates[nodeId]?.populations[lineId as string]?.count,
      "a stale live write beat the year turn's own sim commit",
    ).not.toBe(SENTINEL);
  });

  it("the odometer is one case of the rule — the banked step reaches the save, not just the scene", () => {
    /*
     * THE REACHABLE INSTANCE, through the shipped `update` in the shipped order — the same same-frame
     * route §12's banked-step case documents: [R] on the frame a tile step lands runs `restAtInn` →
     * `spendTicks("inn")` → `beginYearTurn` (which forks the save) and THEN walks the completed step
     * into `onStepCompleted`, whose `this.save = { ...this.save, forayStepsSinceTick }` lands in the
     * window. §12 asserts the scene's half survives and says outright that the save's half does not;
     * this is that half.
     */
    const per = stepsPerForay(balance);
    expect(per, "a foray tick costs one step, so no part-walk can be banked").toBeGreaterThan(1);

    const subPer = balance.clock.subTicksPerTick;
    const at = balance.clock.ticksPerYear * subPer - COST.inn;
    const h = mount({
      save: {
        ...freshSave(),
        tick: Math.floor(at / subPer),
        subTick: at % subPer,
        forayStepsSinceTick: per - 1,
      },
    });

    const DELTAS = {
      right: { dCol: 1, dRow: 0 },
      down: { dCol: 0, dRow: 1 },
      left: { dCol: -1, dRow: 0 },
      up: { dCol: 0, dRow: -1 },
    } as const;
    const from = h.scene.movement.tile;
    const open = (Object.keys(DELTAS) as Array<keyof typeof DELTAS>).find((dir) =>
      h.scene.canEnter({ col: from.col + DELTAS[dir].dCol, row: from.row + DELTAS[dir].dRow }),
    );
    expect(open, "the player is walled in, so no step can land on the frame under test").toBeDefined();
    h.hold(open as keyof typeof DELTAS, true);
    h.press(KEY_R);
    h.frame();
    h.hold(open as keyof typeof DELTAS, false);

    expect(h.scene.movement.stepsTaken, "no tile step landed on the frame the inn ended the year").toBe(1);
    expect(h.scene.isHandedOver(), "the year turn is not holding the screen").toBe(true);
    expect(h.scene.save.forayStepsSinceTick, "the step was never written into the save at all").toBe(per);

    settleYearTurn(h);

    // The claim: the scene and the save agree on the other side. The scene's half was already true;
    // `per` on BOTH is what stops a quit between the turn and the next step refunding the walk.
    expect(h.scene.forayStepsSinceTick(), "the year turn spent the banked walk on its way past").toBe(per);
    expect(
      h.scene.save.forayStepsSinceTick,
      "the turn's commit reverted the banked step — the save is one walk behind the scene",
    ).toBe(per);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §14 INTERIORS — the player goes inside, and the foray does not follow them in
 *
 * `core/interiors.ts` and four `data/interiors/*.json` shipped a model, a schema and 48 tests, and
 * nothing in `game/` imported any of it: no shipped path put the player inside a building. This is
 * the other half, and every claim below is about the SCENE executing, not about the model.
 *
 * Four things are being bound here, in the order they can break:
 *
 *   1. THE THRESHOLD BOTH WAYS. Stepping onto a town's door tile goes in and lands the player on
 *      `InteriorBlueprint.arrival`; stepping onto the plan's `D` comes back out onto THE DOOR THEY
 *      USED. `chooseSpawnTile` — which is what every other placement in this scene goes through —
 *      spirals from the centre of the fixed 64×64 tile lattice, so it cannot find either one: on a
 *      room thirteen cells wide every tile it tries is outside the room.
 *   2. THE ROOM'S GEOMETRY IS THE PLAN'S. Cell for cell, over every shipped plan, against
 *      `core/interiors.ts`'s own solidity predicate. This is where a wrong `cellPx` shows up:
 *      `gridFromAscii` is handed `balance.map.collisionCellPx` and `gridDimensions()` would derive
 *      one from the map's native width instead, which is meaningless for a room.
 *   3. THE TWO GUARDS. `onStepCompleted` rolled an encounter on EVERY completed step and priced
 *      every step as a foray step. Indoors it must do neither — and "neither" is measured at the
 *      RNG stream and at the clock, not at the outcome, because an outcome-level check passes for a
 *      scene that rolls and happens to meet nothing.
 *   4. THE SAVE FIELD. `zSaveFileFor` deletes what it does not declare, so `interiorId` is followed
 *      through the real `serialize`/`deserialize` and back into a COLD scene — the same chain §12
 *      had to walk before it believed the odometer persisted.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 * Interiors — the rig §14 and §16 SHARE.
 *
 * At module scope rather than inside §14 because §16 walks the player through the same
 * front door to ask a different question, and a second copy of "which tile is the door and
 * how do you step onto it" is a rig that can disagree with itself about where the player is.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Every shipped blueprint, so a fifth room added tomorrow is covered without editing this file. */
const ROOMS = [...INTERIORS];

/**
 * The door's tile in the parent town, restated from the blueprint and `balance.map` INDEPENDENTLY
 * of the scene's own conversion.
 *
 * ⚠ IT IS DELIBERATELY NOT `scene.doorTileOf`. `InteriorDoor.x/y` are map-NATIVE pixels; a world
 * pixel is `mapRenderScale` of one and a tile is `tileStepPx` world pixels. Calling the scene's
 * helper here would make every assertion below agree with whatever the scene does, including
 * dropping the render scale — which is exactly the mistake this restatement can catch.
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

/** Which single step takes you from `from` to the adjacent `to`. */
function dirFromTo(from: { col: number; row: number }, to: { col: number; row: number }): Dir {
  const found = (Object.keys(DELTA) as Dir[]).find(
    (d) => from.col + DELTA[d].dCol === to.col && from.row + DELTA[d].dRow === to.row,
  );
  expect(found, `${from.col},${from.row} and ${to.col},${to.row} are not neighbours`).toBeDefined();
  return found as Dir;
}

/**
 * Stand one tile back and take the ONE step that lands on `tile`.
 *
 * A step, not a teleport: the whole mechanism under test is `onStepCompleted`, and placing the
 * player on the tile directly would prove nothing about it.
 */
function stepOnto(h: Harness, tile: { col: number; row: number }, dir: Dir): void {
  const back = DELTA[dir];
  h.scene.movement = placeAt(h.scene.movement, { col: tile.col - back.dCol, row: tile.row - back.dRow });
  h.hold(dir, true);
  h.frame();
  h.hold(dir, false);
}

/**
 * Walk the player in through the front door, answering whatever the walk ran into on the way.
 *
 * The step onto a threshold is an ordinary outdoor foray step — it rolls, and at the shipped rates
 * one step in twenty or so meets something — so a fight or a year turn can land on the very frame
 * the player would have gone inside, and the scene deliberately lets the creature have that step.
 * This retries rather than pretending it is rare.
 */
function goInside(h: Harness, bp: InteriorBlueprint): void {
  const door = doorTile(bp);
  // Approach from the north so the step is a plain one; which side does not matter to the scene,
  // and the synthesised town grid is open everywhere but its border.
  for (let attempt = 0; attempt < 8 && h.scene.currentInterior() === null; attempt += 1) {
    settleBattle(h, "fled");
    settleYearTurn(h);
    stepOnto(h, door, "down");
  }
  expect(h.scene.currentInterior()?.id, `the rig never got the player into ${bp.id}`).toBe(bp.id);
}

/** A save standing in a room's parent town, with that town's populations wiped to zero. */
function saveAtTown(bp: InteriorBlueprint, quiet = true): SaveEnvelope {
  const save = freshSave(bp.parentNode);
  if (!quiet) return save;
  /*
   * ZEROED ON PURPOSE, and only where determinism is the point: with no weight in the table the
   * encounter roll cannot return anything, so the step onto the threshold is guaranteed clean and
   * the assertions below are about the door rather than about a seed. The guard tests further
   * down do NOT rely on this — they measure the RNG stream, which advances whether or not the
   * table has weight in it.
   */
  const zeros: Record<string, number> = {};
  for (const lineId of Object.keys(nodeFile(bp.parentNode).populations)) zeros[lineId] = 0;
  return withCounts(save, bp.parentNode, zeros);
}

function mountAt(bp: InteriorBlueprint, quiet = true): Harness {
  return mount({ save: saveAtTown(bp, quiet), startNode: bp.parentNode });
}


describe("§14 interiors: entering, leaving, and the foray that does not come inside", () => {
  /* ── 14.1 the threshold, both ways ─────────────────────────────────────── */

  it.each(ROOMS.map((bp) => [bp.id, bp] as const))(
    "%s — a step onto its town door tile puts the player on the blueprint's ARRIVAL cell",
    (_id, bp) => {
      const h = mountAt(bp);
      expect(h.scene.currentInterior(), "the player did not start outdoors").toBeNull();
      expect(h.scene.save.interiorId, "a fresh save already names an interior").toBeUndefined();

      const door = doorTile(bp);
      expect(h.scene.canEnter(door), `${bp.id}'s door tile is not walkable in ${bp.parentNode}`).toBe(true);
      stepOnto(h, door, "down");

      expect(h.scene.currentInterior()?.id, "the step onto the doorway did not go inside").toBe(bp.id);
      expect(h.scene.save.interiorId, "the save does not say which room the player is in").toBe(bp.id);
      // `currentNode` KEEPS NAMING THE TOWN — the single decision the whole model rests on. An
      // interior id here throws inside `Scene.init` on the next reload (nine call sites).
      expect(h.scene.save.currentNode, "an interior id reached save.currentNode").toBe(bp.parentNode);

      expect(
        h.scene.movement.tile,
        "the player did not land on the blueprint's arrival cell",
      ).toEqual({ col: bp.arrival.col, row: bp.arrival.row });
      // …and facing the way they walked in, which is the step from the doorway to the arrival.
      expect(h.scene.movement.facing, "the player came in facing the wrong way").toBe(
        dirFromTo(planDoor(bp), bp.arrival),
      );
    },
  );

  it.each(ROOMS.map((bp) => [bp.id, bp] as const))(
    "%s — a step onto the plan's D comes back out ON THE DOOR TILE, not on the town's spawn",
    (_id, bp) => {
      const h = mountAt(bp);
      goInside(h, bp);

      const out = planDoor(bp);
      stepOnto(h, out, dirFromTo(bp.arrival, out));

      expect(h.scene.currentInterior(), "the step onto D did not leave the room").toBeNull();
      expect("interiorId" in h.scene.save, "the save still carries an interiorId outdoors").toBe(false);
      expect(h.scene.movement.tile, "the player did not come out at the door they used").toEqual(doorTile(bp));

      /*
       * AND IT IS NOT THE SPAWN TILE. Without this, placing the player through `chooseSpawnTile`
       * would satisfy "they are outdoors and standing somewhere legal" and read as correct — which
       * is exactly what `buildNodeView` does for every OTHER placement in this scene.
       */
      // WITH THE PROPS, because `buildNodeView` passes them (§15) — a props-less recomputation here
      // is a different tile from the one the scene would actually have respawned them on, so the
      // degeneracy guard below would be checking the door against a spawn nothing produces.
      const spawn = chooseSpawnTile(h.scene.collision.grid, balance, { props: propsOf(h.scene.node) }).tile;
      expect(
        doorTile(bp),
        `the fixture is degenerate: ${bp.id}'s door tile IS the town spawn, so this proves nothing`,
      ).not.toEqual(spawn);
      expect(h.scene.movement.tile, "the player was respawned at the town's spawn tile").not.toEqual(spawn);
    },
  );

  it("leaving and re-entering is a step each way — the doorway does not bounce the player back in", () => {
    const bp = ROOMS[0]!;
    const h = mountAt(bp);
    goInside(h, bp);

    const out = planDoor(bp);
    stepOnto(h, out, dirFromTo(bp.arrival, out));
    expect(h.scene.currentInterior(), "the player is still inside").toBeNull();

    /*
     * THE PLAYER IS NOW STANDING ON THE TOWN'S DOOR TILE. If entering were triggered by STANDING on
     * a doorway rather than by a STEP onto one, this frame would put them straight back inside and
     * the door would be a trap. One frame with nothing held: nothing moves, nothing happens.
     */
    h.frame();
    expect(h.scene.currentInterior(), "standing on the doorway re-entered the building").toBeNull();
  });

  /* ── 14.2 the room's geometry is the plan's ────────────────────────────── */

  /**
   * The room the scene is standing in agrees with the plan, cell for cell.
   *
   * ⚠ SHARED BY THE TWO PATHS THAT BUILD A ROOM'S GRID, and it exists as a helper because they are
   * two: `enterInterior` parses the plan when the player walks in, and `adoptInterior` parses it
   * again on every `init` — the cold load and the trip to the in-run menu. A sabotage of the SECOND
   * `gridFromAscii` call (its `cellPx` doubled to `tileStepPx`) came back GREEN with only the
   * walk-in path checked here and a single `canEnter({0,0})` corner check on the cold one, because
   * (0,0) is a wall under either cell size. One spelling, asked of both.
   */
  function expectRoomMatchesPlan(h: Harness, bp: InteriorBlueprint, where: string): void {
    const size = planSize(bp.plan);
    let solid = 0;
    let open = 0;
    for (let row = 0; row < size.rows; row += 1) {
      for (let col = 0; col < size.cols; col += 1) {
        const blocked = planCellIsSolid(bp.plan, col, row);
        expect(
          h.scene.canEnter({ col, row }),
          `${where}: ${bp.id} cell ${col},${row} is "${String(planCharAt(bp.plan, col, row))}" — the scene disagrees`,
        ).toBe(!blocked);
        if (blocked) solid += 1;
        else open += 1;
      }
    }
    // The fixture has to contain both, or the loop above passes by asserting one thing many times.
    expect(solid, `${where}: ${bp.id} draws no walls at all`).toBeGreaterThan(0);
    expect(open, `${where}: ${bp.id} draws no floor at all`).toBeGreaterThan(0);
    // …and the world does not continue past the plan. Out of bounds reads as blocked, which is what
    // stops the player walking out of a room through a wall the plan never drew.
    expect(h.scene.canEnter({ col: size.cols, row: 1 }), `${where}: the room leaks east`).toBe(false);
    expect(h.scene.canEnter({ col: 1, row: size.rows }), `${where}: the room leaks south`).toBe(false);
  }

  it.each(ROOMS.map((bp) => [bp.id, bp] as const))(
    "%s — every cell of the plan answers `canEnter` exactly as core/interiors.ts calls it solid",
    (_id, bp) => {
      const h = mountAt(bp);
      goInside(h, bp);
      expectRoomMatchesPlan(h, bp, "walked in");

      // …and again after a restart, which re-parses the plan through `adoptInterior` rather than
      // through `enterInterior`. Two call sites, two chances to be handed the wrong cell size.
      h.restart({ save: h.scene.save });
      expectRoomMatchesPlan(h, bp, "after a restart");
    },
  );

  /* ── 14.3 the two guards ───────────────────────────────────────────────── */

  it("NO ENCOUNTER IS ROLLED INDOORS — the encounter stream does not move, and outdoors it does", () => {
    const bp = ROOMS[0]!;
    const h = mountAt(bp);
    goInside(h, bp);

    /*
     * MEASURED AT THE STREAM, NOT AT THE OUTCOME. `rollForayStep` opens with
     * `rng.chance(effectiveEncounterChance(...))` — one draw on EVERY step, whatever the table holds
     * — so the stream's position is the direct witness to "was the roll made at all". An
     * `encountersMetCount() === 0` check would pass just as happily for a scene that rolled forty
     * times and met nothing, which at the shipped 4.5% effective rate is most walks.
     */
    const STEPS = 40;
    const before = h.scene.streamFor("encounter").save();
    const inside = walk(h, STEPS, () => h.scene.currentInterior() === null || h.scene.isHandedOver());
    expect(inside, "the rig could not walk inside the room").toBe(STEPS);
    expect(h.scene.currentInterior()?.id, "the walk wandered out of the room").toBe(bp.id);
    expect(h.scene.streamFor("encounter").save(), "a step indoors drew from the encounter stream").toEqual(before);
    expect(h.scene.encountersMetCount(), "a wild creature was met indoors").toBe(0);

    /*
     * THE CONTROL, and it is the half that makes the assertion above mean anything: the same rig,
     * the same seed, the same number of steps, taken outdoors. Without it, a scene that had stopped
     * rolling everywhere would pass.
     */
    const out = planDoor(bp);
    stepOnto(h, out, dirFromTo(bp.arrival, out));
    expect(h.scene.currentInterior(), "the control did not get back outdoors").toBeNull();
    const outdoorsBefore = h.scene.streamFor("encounter").save();
    walk(h, STEPS, () => h.scene.isHandedOver());
    expect(
      h.scene.streamFor("encounter").save(),
      "the same walk outdoors drew nothing either — the control proves the rig, not the guard",
    ).not.toEqual(outdoorsBefore);
  });

  it("NO FORAY TICK IS CHARGED INDOORS — the clock, the tape and the odometer all stand still", () => {
    const bp = ROOMS[0]!;
    const h = mountAt(bp);
    goInside(h, bp);

    const forays = (): number => h.scene.save.actionLog.filter((e) => e.action.t === "foray").length;
    const clockOf = (): string =>
      `${String(h.scene.save.year)}/${String(h.scene.save.tick)}/${String(h.scene.save.subTick ?? 0)}`;

    // MORE THAN A WHOLE FORAY'S WORTH. Fewer steps than `stepsPerForay` could not charge a tick even
    // outdoors, so the walk has to be long enough that a missing guard really would bill the player.
    const STEPS = stepsPerForay(balance) + 4;
    const bankedBefore = h.scene.forayStepsSinceTick();
    const forayBefore = forays();
    const clockBefore = clockOf();
    const logBefore = h.scene.save.actionLog.length;

    const inside = walk(h, STEPS, () => h.scene.currentInterior() === null || h.scene.isHandedOver());
    expect(inside, "the rig could not walk a full foray's worth inside the room").toBe(STEPS);
    expect(h.scene.currentInterior()?.id, "the walk wandered out of the room").toBe(bp.id);

    expect(forays() - forayBefore, "a foray tick was charged for walking indoors").toBe(0);
    expect(clockOf(), "the clock moved while the player walked indoors").toBe(clockBefore);
    expect(h.scene.save.actionLog.length - logBefore, "an indoor walk wrote to the replay tape").toBe(0);
    /*
     * AND THE ODOMETER DID NOT ADVANCE EITHER — a separate decision from not charging, and the one
     * that decides WHEN the next outdoor tick lands. Banking indoor steps would suppress the roll
     * and keep the price: a tick charged for a walk that could not have met anything.
     */
    expect(h.scene.forayStepsSinceTick(), "walking indoors banked steps toward a foray tick").toBe(bankedBefore);
    expect(h.scene.save.forayStepsSinceTick, "the save banked what the scene did not").toBe(bankedBefore);

    // THE CONTROL. The same walk outdoors charges the foray it is supposed to charge.
    const out = planDoor(bp);
    stepOnto(h, out, dirFromTo(bp.arrival, out));
    const outdoorsForays = forays();
    walk(h, STEPS, () => h.scene.isHandedOver());
    settleBattle(h, "fled");
    settleYearTurn(h);
    expect(
      forays(),
      "the same walk outdoors charged nothing either — the control proves the rig, not the guard",
    ).toBeGreaterThan(outdoorsForays);
  });

  it("…and the banked walk is KEPT across a visit indoors, not reset — free, not refunded", () => {
    /*
     * The other side of the odometer decision, and the one a "reset it on entry" implementation
     * would fail. Hank's ruling on travel — *"I see no reason why stepsSinceTick should reset after
     * a fast travel"* — is the same ruling: the counter measures walking, and a door is not a
     * refund. A player who ducks inside one step short of a foray still owes that step outside.
     */
    const bp = ROOMS[0]!;
    const per = stepsPerForay(balance);
    /*
     * SHORT OF THE ROLLOVER BY MORE THAN ONE, so the step through the door does not itself charge a
     * foray and the number below is a plain `banked + 1`. With `per - 1` the entering step would
     * roll the odometer over and land it on 0 — and 0 is the value a reset produces too, so the
     * fixture would agree with the defect it is here to catch.
     */
    const banked = per - 3;
    const h = mount({
      save: { ...saveAtTown(bp), forayStepsSinceTick: banked },
      startNode: bp.parentNode,
    });
    expect(h.scene.forayStepsSinceTick(), "the scene did not open on the save's odometer").toBe(banked);

    // The step onto the threshold is an ordinary outdoor step and counts as one: the door is not a
    // discount on walking. The town's counts are zeroed, so it is exactly one step and no more.
    goInside(h, bp);
    const afterEntry = h.scene.forayStepsSinceTick();
    expect(afterEntry, "going through the door reset the banked walk, or failed to count the step").toBe(banked + 1);

    walk(h, 6, () => h.scene.currentInterior() === null || h.scene.isHandedOver());
    expect(h.scene.forayStepsSinceTick(), "walking indoors moved the odometer").toBe(afterEntry);

    const out = planDoor(bp);
    stepOnto(h, out, dirFromTo(bp.arrival, out));
    expect(h.scene.forayStepsSinceTick(), "leaving the building reset the banked walk").toBe(afterEntry);
    expect(h.scene.save.forayStepsSinceTick, "the save's odometer disagrees with the scene's").toBe(afterEntry);
  });

  /* ── 14.4 entering is free ─────────────────────────────────────────────── */

  it("ENTERING COSTS NOTHING — no tick, no sub-tick, and nothing on the replay tape", () => {
    const bp = ROOMS[0]!;
    const h = mountAt(bp);

    const door = doorTile(bp);
    // Placed a tile back BEFORE the readings are taken, so the only thing that happens between them
    // is the one step through the door.
    h.scene.movement = placeAt(h.scene.movement, { col: door.col, row: door.row - 1 });
    const logBefore = h.scene.save.actionLog.length;
    const yearBefore = h.scene.save.year;
    const tickBefore = h.scene.save.tick;
    const subBefore = h.scene.save.subTick ?? 0;

    h.hold("down", true);
    h.frame();
    h.hold("down", false);

    expect(h.scene.currentInterior()?.id, "the step did not go inside, so nothing below is about entering").toBe(bp.id);
    expect(h.scene.save.actionLog.length - logBefore, "entering a building wrote to the replay tape").toBe(0);
    expect(h.scene.save.year, "entering a building moved the year").toBe(yearBefore);
    expect(h.scene.save.tick, "entering a building spent a tick").toBe(tickBefore);
    expect(h.scene.save.subTick ?? 0, "entering a building spent a sub-tick").toBe(subBefore);
    // Named explicitly: a `{t:"travel", to:"hearthollow-inn"}` would satisfy a length check that
    // happened to be taken across a step that also charged a foray.
    expect(
      h.scene.save.actionLog.some((e) => JSON.stringify(e.action).includes(bp.id)),
      "the interior's id reached the action log",
    ).toBe(false);
  });

  /* ── 14.5 the save field ───────────────────────────────────────────────── */

  it("interiorId SURVIVES A COLD SAVE/LOAD — serialize, deserialize, and a brand-new scene", () => {
    const bp = ROOMS[0]!;
    const h = mountAt(bp);
    goInside(h, bp);
    // Walk off the arrival cell, so "the reload put me back inside" and "the reload restarted the
    // room" are distinguishable below.
    walk(h, 3, () => h.scene.currentInterior() === null || h.scene.isHandedOver());
    const standing = { ...h.scene.movement.tile };
    expect(standing, "the walk never left the arrival cell").not.toEqual({ col: bp.arrival.col, row: bp.arrival.row });

    /*
     * ⚠ THROUGH THE REAL SCHEMA. `zSaveFileFor` is a `z.object`, which DELETES keys it does not
     * declare — its own comment says so — and `deserialize` runs every load through it. An
     * undeclared `interiorId` round-trips to `undefined` and the bug reads as "reloading puts me
     * outside", which is indistinguishable from the feature simply not existing.
     */
    const reloaded = deserialize(serialize(h.scene.save), balance);
    expect(reloaded.interiorId, "the schema deleted interiorId on the way through").toBe(bp.id);
    expect(reloaded.currentNode, "the town was lost on the round trip").toBe(bp.parentNode);

    const cold = mount({ save: reloaded });
    expect(cold.scene.currentInterior()?.id, "a cold reload opened outside the building").toBe(bp.id);
    // A cold scene has no standing position, so it lands on the arrival cell — the blueprint's
    // answer to "where does someone who is in this room with no position stand".
    expect(cold.scene.movement.tile, "a cold reload did not land on the arrival cell").toEqual({
      col: bp.arrival.col,
      row: bp.arrival.row,
    });
    /*
     * AND IT IS WALKING THE ROOM'S GRID, CELL FOR CELL. A single `canEnter({0,0}) === false` used to
     * stand here and it proved nothing: (0,0) is a wall in every plan AND blocked on the town's own
     * bordered grid, so it agreed with a cold scene that had never parsed the plan at all — and it
     * agreed with one that parsed it at the wrong cell size, which is what a sabotage of
     * `adoptInterior`'s `gridFromAscii` demonstrated by staying green.
     */
    expectRoomMatchesPlan(cold, bp, "cold reload");
  });

  it("a trip to the in-run menu and back leaves the player standing where they were INSIDE", () => {
    // §4's claim, asked of the other view mode: `create()` runs `buildNodeView` on every restart,
    // and a comparison that only looked at the NODE id would call a room and its town the same view.
    const bp = ROOMS[0]!;
    const h = mountAt(bp);
    goInside(h, bp);
    walk(h, 3, () => h.scene.currentInterior() === null || h.scene.isHandedOver());
    const standing = { ...h.scene.movement.tile };

    h.restart({ save: h.scene.save });

    expect(h.scene.currentInterior()?.id, "the restart put the player outdoors").toBe(bp.id);
    expect(h.scene.movement.tile, "the restart teleported the player").toEqual(standing);
  });

  it("A SAVE NAMING A ROOM THIS BUILD DOES NOT SHIP opens outdoors, and says so", () => {
    /*
     * The `interiorId` counterpart of §12's INV-2 case. A blueprint can be removed, and a save is a
     * supported hand-editable input (`core/save.ts`). The one thing that must not happen is a scene
     * that boots into a room with no geometry and no door.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const bp = ROOMS[0]!;
      const h = mount({
        save: { ...saveAtTown(bp), interiorId: "no-such-building" },
        startNode: bp.parentNode,
      });
      expect(h.scene.currentInterior(), "the scene claims to be inside a room that does not exist").toBeNull();
      expect("interiorId" in h.scene.save, "the save kept an interiorId nothing can resolve").toBe(false);
      expect(h.scene.canEnter(h.scene.movement.tile), "the player is standing in geometry").toBe(true);
      expect(
        warn.mock.calls.some((c) => String(c[0]).includes("no-such-building")),
        "the scene put the player outdoors silently",
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  /* ── 14.6 the rest of the overworld stands down indoors ────────────────── */

  it("travel is REFUSED from inside a building — the two halves of the save cannot disagree", async () => {
    /*
     * Not a nicety. `travelTo` rebuilds the TOWN's geometry through `buildNodeView`; taken from
     * inside, `save.currentNode` would name the new node while `save.interiorId` still named a room
     * in the old one, and the player would be walking an inn's floor plan over a route's map.
     */
    const bp = ROOMS[0]!;
    const h = mountAt(bp);
    goInside(h, bp);

    const route = h.scene.node.adjacency[0];
    expect(route, `${bp.parentNode} is adjacent to nothing, so there is no travel to refuse`).toBeDefined();
    await h.scene.travelTo(route as string);

    expect(h.scene.save.currentNode, "travel was allowed from inside a building").toBe(bp.parentNode);
    expect(h.scene.currentInterior()?.id, "the refused travel still changed the view").toBe(bp.id);
  });

  it("[E] indoors reads the room's ANCHORS, and the town's props are out of reach", () => {
    const bp = ROOMS.find((each) => each.anchors.some((a) => a.kind === "service"));
    expect(bp, "no shipped blueprint carries a service anchor").toBeDefined();
    const room = bp as InteriorBlueprint;
    const anchor = room.anchors.find((a) => a.kind === "service")!;

    const h = mountAt(room);
    goInside(h, room);
    h.scene.movement = placeAt(h.scene.movement, { col: anchor.col, row: anchor.row });

    h.press(KEY_E);
    h.frame();
    /*
     * The dialogue box is not registered in this rig, so `playEntry` runs the entry HEADLESSLY and
     * `finishDialogue` records what was said — which is the witness that the corpus entry the anchor
     * names actually reached the player. The anchor's target is validated by `core/interiors.ts` to
     * be one of the eleven shipped `kind:"service"` entries, so this is a real line, not a stub.
     */
    const said = h.scene.lastLineSpoken();
    expect(said.length, `${room.id}.${anchor.id} said nothing`).toBeGreaterThan(0);
    /*
     * AND IT IS THE ANCHOR'S OWN ENTRY, not merely a line. Without this the check passes for an
     * `interact` that fell through to `talkEntryFor` and answered with whatever the TOWN happens to
     * be saying — which is the exact failure mode indoors: the room's anchors ignored and the town's
     * conversation played at a player standing in a shop. The expected transcript is produced by the
     * same headless runner the scene used, off the id `core/interiors.ts` validated.
     */
    const expected = transcript(DIALOGUE, runHeadless(DIALOGUE, (anchor as { target: string }).target));
    expect(said, `${room.id}.${anchor.id} played some other entry`).toBe(expected[expected.length - 1]);

    // …and a cell with no anchor on it says so rather than answering with a town prop.
    const empty = { col: room.arrival.col, row: room.arrival.row };
    expect(
      room.anchors.some((a) => a.col === empty.col && a.row === empty.row),
      "the arrival cell carries an anchor, so it is not the empty case",
    ).toBe(false);
    h.scene.movement = placeAt(h.scene.movement, empty);
    h.press(KEY_E);
    h.frame();
    expect(h.hud(), "an empty cell indoors did not report itself").toContain("nothing here");
  });

  it("the HUD names the way out from inside, and the ways in from outside", () => {
    // A door is walkable floor in a collision mask and there is no painted door yet, so without a
    // readout a shipped building is a tile the player has no way to find.
    const bp = ROOMS[0]!;
    const h = mountAt(bp);
    const door = doorTile(bp);
    expect(h.hud(), "the town's HUD does not say where its doors are").toContain(
      `door ${bp.id} at tile ${String(door.col)},${String(door.row)}`,
    );

    goInside(h, bp);
    const printed = h.hud();
    expect(printed, "the room's HUD does not name the room").toContain(`inside ${bp.name} (${bp.id})`);
    const out = planDoor(bp);
    expect(printed, "the room's HUD does not say where the way out is").toContain(
      `out at ${String(out.col)},${String(out.row)}`,
    );
    /*
     * …AND IT IS STILL LEGIBLE, on §7's terms rather than on a line-length rule this file would be
     * inventing: the HUD's own provenance line is 165 characters and is fine BECAUSE it is wrapped
     * to the virtual screen. So the question asked here is the same one — the text object now
     * carrying the interior's `FOOTPRINT …` provenance line must be a wrapped one. A room whose
     * note landed on an unwrapped object would run off the right edge exactly as the map's did.
     */
    const hudObject = h.parts.objects.find((o) => o.kind === "text" && o.text.includes("FOOTPRINT interior"));
    expect(hudObject, "no text object carries the interior's provenance line").toBeDefined();
    expect(typeof hudObject!.wordWrapWidth, "the interior HUD sets no wrap width").toBe("number");
    expect(hudObject!.wordWrapWidth as number).toBeLessThanOrEqual(balance.map.virtualWidth);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §15 the arrival tile is chosen clear of the props [E] reads
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * WHAT THIS SECTION IS ABOUT, AND WHAT IT IS NOT.
 *
 * `interact()` asks `propUnderPlayer()` FIRST and returns on a hit — deliberately, because a player
 * standing at a signpost pressed [E] at the signpost. The consequence is that a spawn tile which
 * happens to sit inside some prop's `interactionRadius` makes that prop the ONLY thing [E] can
 * reach from where the player is put down: every talk entry the node ships — quest offers, the
 * innkeeper, the vendor, every chain step — moves a tile away, behind a walk nothing on screen asks
 * for. That is not a prop bug and not a dialogue bug; it is the arrival tile.
 *
 * `game/collision.ts` `chooseSpawnTile` can already avoid it: `SpawnOptions.props` spirals once
 * accepting only tiles no prop covers, then falls back to the original spiral unchanged. That
 * function is proven in tests/unit/spawn-props.test.ts and is NOT what this section re-tests. What
 * is tested here is the only thing those tests structurally cannot see — that the SCENE asks it.
 * `chooseSpawnTile(grid, balance)` with the props left off typechecks, keeps every collision test
 * green, and puts the player straight back under the sign.
 *
 * ONE GEOMETRY, NOT TWO. The stub loads no textures, so `buildNodeView` reads a null mask and the
 * grid the scene walks is `synthesiseBorderCollision`'s. `AMBUSHED` below is built from the same
 * public loader with the same null mask, so the fixture and the scene are looking at one grid — a
 * node listed here is a node the scene really does spawn under a prop.
 */
describe("§15 the arrival tile is chosen clear of the props [E] reads", () => {
  /** Where the sprite actually stands on a tile — `interact()`'s own point, through its own helpers. */
  const standingAt = (tile: { col: number; row: number }): WorldPoint =>
    spriteWorldPosition(createMovement(tile), movementConfig(balance));

  /** The prop-blind spawn: what the scene chose before it was told the node had props. */
  const blindSpawn = (node: NodeFile): { col: number; row: number } =>
    chooseSpawnTile(loadCollision(node.id, node.collisionMask, null, balance).grid, balance).tile;

  /**
   * Every shipped node whose prop-blind spawn lands inside a prop's reach. DERIVED (G2): no node id
   * is typed in, so a node that gains a prop, moves one, or has its mask repainted joins or leaves
   * this section by itself rather than by somebody remembering to edit a list.
   */
  const AMBUSHED = content.nodes.filter(
    (node) => propsOf(node).length > 0 && propAt(node, standingAt(blindSpawn(node)), balance) !== null,
  );

  it("at least one shipped node spawns under a prop — without that this section proves nothing", () => {
    /*
     * The vacuity guard. `it.each([])` registers no tests and reports success, which is exactly the
     * shape of a green suite certifying an absence — so the fixture asserts its own non-emptiness
     * before anything is asked of the scene.
     */
    expect(
      AMBUSHED.map((n) => n.id),
      "no shipped node's prop-blind spawn is inside a prop, so the it.each blocks below are empty",
    ).not.toEqual([]);
  });

  it.each(AMBUSHED.map((n) => [n.id, n] as const))(
    "%s — the player is not put down inside the prop, and [E] is not answered by it",
    (_id, node) => {
      const h = mount({ save: freshSave(node.id), startNode: node.id });

      // The fixture, restated against the LIVE scene: this node is one where it matters.
      const blind = blindSpawn(node);
      const wouldRead = propAt(node, standingAt(blind), balance);
      expect(wouldRead, `${node.id}'s blind spawn is not under a prop after all`).not.toBeNull();
      const prop = wouldRead as PropPlacement;

      // The wiring, seen from the scene's own field rather than from a second call to the function.
      expect(
        propAt(node, standingAt(h.scene.movement.tile), balance),
        `the player was put down inside "${propLabel(prop)}" — [E] reads it instead of the node`,
      ).toBeNull();

      /*
       * AND THE PRESS PROVES IT. The check above is geometry; this is the behaviour it is geometry
       * FOR. A prop can answer [E] in two shapes and both are refusals of the room: it plays the
       * entry authored for it, or — when nothing is authored — it swallows the press and flashes
       * "nothing more to read". Neither may happen from the tile the player arrives on.
       */
      const propSaid = propDialogueFor(DIALOGUE, prop.id, node.id, h.scene.dialogueCtx());
      h.press(KEY_E);
      h.frame();

      expect(h.hud(), `[E] at ${node.id}'s arrival tile was swallowed by a prop`).not.toContain(
        "nothing more to read",
      );
      if (propSaid) {
        const itsLines = transcript(DIALOGUE, runHeadless(DIALOGUE, propSaid.id));
        expect(h.scene.lastLineSpoken(), `[E] at ${node.id}'s arrival tile read "${propLabel(prop)}"`).not.toBe(
          itsLines[itsLines.length - 1],
        );
      }
    },
  );

  /**
   * The positive half, where the corpus has something for the press to REACH.
   *
   * Kept separate because it is act-gated content and not every ambushed node ships a talk entry
   * eligible at the context a fresh save mounts in — `sanctum` is late-act and answers "nobody has
   * anything to say" at act 1, which is correct and is not evidence about the spawn tile. Asserting
   * a reached entry there would be asserting against the act ladder.
   */
  const SPEAKING = AMBUSHED.filter((node) => {
    const h = mount({ save: freshSave(node.id), startNode: node.id });
    return talkEntryFor(DIALOGUE, node.id, h.scene.dialogueCtx()) !== undefined;
  });

  it("…and at least one of them has something to say, so the press below reaches a real line", () => {
    expect(
      SPEAKING.map((n) => n.id),
      "no ambushed node ships a talk entry eligible on arrival — the press witness is vacuous",
    ).not.toEqual([]);
  });

  /**
   * The other half of the wiring: what happens when the preference CANNOT be honoured.
   *
   * `SpawnOptions.props` is a preference and not collision, so a node on which every walkable tile
   * is inside some prop's reach still spawns the player under a prop — correctly, because the
   * alternative is refusing to place them at all. `chooseSpawnTile` reports that as
   * `SpawnChoice.insideProp` and reporting is all it can do; the scene has to SAY it, or a mask the
   * loader calls perfectly healthy silently hands [E] to a signpost from wherever the player lands.
   *
   * Driven by a mask with exactly one walkable cell, which `readMask` accepts (it refuses zero, not
   * one) — so this is the real loader, the real grid and the real shipped prop, not a stubbed
   * verdict.
   */
  it("says so on the HUD when NO walkable tile is clear of a prop", () => {
    const node = AMBUSHED[0] as NodeFile;
    const tile = blindSpawn(node);
    const prop = propAt(node, standingAt(tile), balance) as PropPlacement;

    /** 64×64, fully opaque, every cell blocked but one — one mask pixel per collision cell. */
    const onlyWalkable = (at: { col: number; row: number }): MaskPixelsForTest => {
      const side = balance.map.mapNativePx / balance.map.collisionCellPx;
      const data = new Uint8ClampedArray(side * side * 4);
      for (let i = 0; i < side * side; i += 1) data[i * 4 + 3] = 255; // black, opaque ⇒ blocked
      const lit = (at.row * side + at.col) * 4;
      data[lit] = 255;
      data[lit + 1] = 255;
      data[lit + 2] = 255;
      return { width: side, height: side, data };
    };

    const h = mount({ save: freshSave(node.id), startNode: node.id }, (parts) => {
      parts.maskPixels.set(maskTextureKey(node.collisionMask), onlyWalkable(tile));
    });

    // The rig is the real loader's answer, not a claim about it.
    expect(h.scene.collision.source, "the one-cell mask was refused instead of loaded").toBe("authored");
    expect(h.scene.collision.health?.usable, "a mask with one walkable cell must be usable").toBe(true);
    expect(h.scene.movement.tile, "the player did not land on the only walkable tile").toEqual(tile);

    expect(h.hud(), "the HUD does not name the prop the player was put down inside").toContain(
      `is inside prop ${prop.id}`,
    );
  });

  it.each(SPEAKING.map((n) => [n.id, n] as const))(
    "%s — [E] on arrival reaches what the node is SAYING",
    (_id, node) => {
      const h = mount({ save: freshSave(node.id), startNode: node.id });
      /*
       * The box is unregistered in this rig, so `playEntry` runs the entry headlessly and
       * `finishDialogue` records its last line — the same witness §14.6 reads the anchors through.
       */
      const expected = talkEntryFor(DIALOGUE, node.id, h.scene.dialogueCtx());
      const wanted = transcript(DIALOGUE, runHeadless(DIALOGUE, (expected as DialogueEntry).id));

      h.press(KEY_E);
      h.frame();

      const said = h.scene.lastLineSpoken();
      expect(said, `[E] at ${node.id}'s arrival tile said nothing`).not.toBe("");
      expect(said, `[E] at ${node.id}'s arrival tile did not reach "${(expected as DialogueEntry).id}"`).toBe(
        wanted[wanted.length - 1],
      );
    },
  );
});

/* ════════════════════════════════════════════════════════════════════════════
 * §16 a room draws its painting when there is one, and its footprint when there is not
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The interior half of what `MapView` already does for a node: `assets/final/interiors/<id>.png` if
 * the art lane has shipped it, `drawInteriorFootprint` if it has not.
 *
 * WHICH HALF MATTERS TODAY. No room is painted, so the FOOTPRINT is the path every shipped room
 * takes and the one that must not regress; the painted branch is what stops being dead the day a
 * picture lands. Both are tested, and the painted one is driven by making its two preconditions
 * true in the rig rather than by asserting the helper against itself.
 *
 * ⚠ THE PAINTED TEST REGISTERS A SYNTHETIC ASSET and `game/placeholder.ts` has no un-register. The
 * pollution is deliberately harmless: `paintedInteriorKey` needs the census AND a loaded texture,
 * and the texture half lives on the scene stub, which dies with the harness — so every other test
 * in this file goes on taking the footprint path whatever order it runs in. That is asserted below
 * rather than assumed.
 */
describe("§16 an interior draws its painting when one exists, and its footprint when it does not", () => {
  /** The image objects the display list is holding. */
  function images(h: Harness): FakeObj[] {
    return h.parts.objects.filter((o) => o.kind === "image");
  }

  it("the key grammar is the manifest's own, not a second one — `interiors/<id>`", () => {
    for (const bp of ROOMS) {
      /*
       * T-19's shape, asked of the room: the key the SCREEN asks for must be the key
       * `game/placeholder.ts` would derive from the file the art lane writes. `assetId` is a pure
       * prefix strip, so a key that does not survive the round trip is a key nothing can ever
       * satisfy — which is the defect `tests/gates/dex-path-contract.test.ts` exists for.
       */
      expect(interiorTextureKey(bp.id), `${bp.id}'s key is not what its path reduces to`).toBe(
        assetId(interiorAssetPath(bp.id)),
      );
      expect(interiorAssetPath(bp.id), `${bp.id}'s painting is not under assets/final/`).toBe(
        `assets/final/interiors/${bp.id}.png`,
      );
    }
    // …and the ids really are distinct, so the loop above is not comparing one room to itself.
    expect(new Set(ROOMS.map((bp) => interiorTextureKey(bp.id))).size).toBe(ROOMS.length);
  });

  it.each(ROOMS.map((bp) => [bp.id, bp] as const))(
    "%s — unpainted: the footprint is on screen and no interior image was ever made",
    (_id, bp) => {
      const h = mountAt(bp);
      goInside(h, bp);
      expect(h.scene.currentInterior()?.id, "the player is not inside the room").toBe(bp.id);

      expect(
        images(h).map((o) => o.texture),
        `${bp.id} put an image on screen for a room nothing has painted`,
      ).not.toContain(interiorTextureKey(bp.id));
      // The provenance line is the readout that tells the two apart, so it is the witness.
      expect(h.hud(), `${bp.id}'s HUD does not say the footprint is what is drawn`).toContain(
        `FOOTPRINT interior ${bp.id}`,
      );
    },
  );

  it("painted: the room draws ONE image at the plan's own size, and the footprint stands down", () => {
    const bp = ROOMS[0]!;
    const key = interiorTextureKey(bp.id);

    // Precondition, asserted rather than assumed: nothing has painted this room yet.
    expect(hasRealAsset(interiorAssetPath(bp.id)), `${bp.id} is already painted — this test is stale`).toBe(false);

    /*
     * BOTH halves of `paintedInteriorKey`, made true one at a time so each is shown to be
     * load-bearing. A texture with no census entry is a key some other lane happened to create; a
     * census entry with no texture is a build-time truth about a runtime failure.
     */
    const withTexture = mount({ save: saveAtTown(bp), startNode: bp.parentNode }, (parts) => {
      parts.scratch.add(key);
    });
    goInside(withTexture, bp);
    expect(
      images(withTexture).map((o) => o.texture),
      "a loaded texture alone painted the room — the census is not being asked",
    ).not.toContain(key);

    registerRealAsset(interiorAssetPath(bp.id), `/${bp.id}.png`);

    const censusOnly = mountAt(bp);
    goInside(censusOnly, bp);
    expect(
      images(censusOnly).map((o) => o.texture),
      "the census alone painted the room — the loaded texture is not being asked",
    ).not.toContain(key);

    // Now both.
    const h = mount({ save: saveAtTown(bp), startNode: bp.parentNode }, (parts) => {
      parts.scratch.add(key);
    });
    goInside(h, bp);

    // G1: ONE image for the whole room. Not a tileset, not an atlas, not a slice per plan cell —
    // which is what a count of exactly one, over a room of `plan cols x rows` cells, says.
    const drawn = images(h).filter((o) => o.texture === key);
    expect(planSize(bp.plan).cols * planSize(bp.plan).rows, "the room is one cell, so ONE image proves nothing about G1")
      .toBeGreaterThan(1);
    expect(drawn.length, `${bp.id} did not draw its painting as exactly one image`).toBe(1);
    expect(drawn[0]!.visible, `${bp.id}'s painting was made and then hidden`).toBe(true);
    /*
     * …AT THE PLAN'S OWN SIZE, in WORLD pixels: `cols x rows` cells of
     * `collisionCellPx * mapRenderScale` each, which is the same rectangle `drawInteriorFootprint`
     * fills. Restated from `balance.map` here rather than read back from `worldCellPx`, so a change
     * that drops the render scale — the exact mistake §14's `doorTile` is restated against — moves
     * the picture off the geometry and this goes red.
     */
    const cell = balance.map.collisionCellPx * balance.map.mapRenderScale;
    const plan = planSize(bp.plan);
    expect(drawn[0]!.displaySize, `${bp.id}'s painting is not sized to its plan`).toEqual({
      w: plan.cols * cell,
      h: plan.rows * cell,
    });
    // …and the town's map is not also up.
    const mapKey = nodeFile(bp.parentNode).mapAsset;
    expect(
      images(h).some((o) => o.texture === assetId(mapKey) && o.visible),
      "the town's map is still visible under the room",
    ).toBe(false);
    // The provenance line names the picture instead of the footprint.
    expect(h.hud(), "the HUD still calls a painted room a footprint").not.toContain(`FOOTPRINT interior ${bp.id}`);
    expect(h.hud(), "the HUD does not name the painting that is on screen").toContain(interiorAssetPath(bp.id));

    /*
     * AND THE STAND-IN PATH IS UNHARMED. Same room, a harness whose loader got nothing — which is
     * every other test in this file, and every player until the art lands.
     */
    const unpainted = mountAt(bp);
    goInside(unpainted, bp);
    expect(
      images(unpainted).map((o) => o.texture),
      "the registered census entry leaked into a harness that loaded no texture",
    ).not.toContain(key);
    expect(unpainted.hud(), "the footprint stopped being drawn for an unpainted room").toContain(
      `FOOTPRINT interior ${bp.id}`,
    );
  });
});
