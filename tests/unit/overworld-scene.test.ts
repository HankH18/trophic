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
  /**
   * Every `cameras.main.setBounds` call, in order.
   *
   * ⚠ RECORDED RATHER THAN LEFT TO THE NO-OP PROXY, and the reason is the same one `depth` and
   * `setTexture` are recorded for: the camera bound is a CORRECTNESS property here, not a cosmetic
   * one. The side panel is painted over a full-width camera, so the bound is the only thing that
   * stops the followed sprite being pushed under the panel at the world's right edge — where the
   * player is invisible and the game reads as frozen. Left to the proxy, §24's whole claim would be
   * asserted against a call that never happened, and deleting the padding would keep it green.
   */
  cameraBounds: Array<{ x: number; y: number; width: number; height: number }>;
  /** Every `cameras.main.startFollow` call — the offset is what centres the sprite in the map. */
  cameraFollows: Array<{ offsetX: number; offsetY: number }>;
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
        cameraBounds: [],
        cameraFollows: [],
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

      /*
       * Two methods are RECORDED and the rest are chainable no-ops — see {@link FakeParts.cameraBounds}
       * for why these two and not the others.
       */
      this.cameras = {
        main: new Proxy(
          {
            setBounds: (x: number, y: number, width: number, height: number): void => {
              parts.cameraBounds.push({ x, y, width, height });
            },
            startFollow: (
              _target: unknown,
              _round?: boolean,
              _lerpX?: number,
              _lerpY?: number,
              offsetX = 0,
              offsetY = 0,
            ): void => {
              parts.cameraFollows.push({ offsetX, offsetY });
            },
          } as Record<string, unknown>,
          {
            get(target, prop, receiver): unknown {
              if (prop in target) return Reflect.get(target, prop, receiver);
              return (): void => undefined;
            },
          },
        ) as unknown as Record<string, (...args: never[]) => unknown>,
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

import { RUN_COMPLETE_SHOWN_FLAG, actOf, nodeUnlockedAt, runIsComplete } from "@core/acts";
import {
  BLACKOUT_CUE_FLAG,
  BLACKOUT_ENTRY_ID,
  blackoutTicks,
  innNodeIds,
  innkeeperAt,
  readInnRest,
  restBeatAt,
  wakeNodeFor,
} from "@core/recovery";
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
import { EPILOGUE_SHOWN_FLAG, finaleNodeId, finaleUnlocked, recordVellsireOutcome } from "@game/finale";
import { linesMetAt } from "@game/quests";
import { unlockedSignChainLines } from "@game/ui/SignChains";
import { isNever, newOwnedCreature } from "@core/lifecycle";
import { propDialogueFor, runHeadless, talkEntryFor, transcript, type DialogueRunState } from "@game/dialogue-runner";
import type { DialogueSceneData } from "@game/scenes/DialogueScene";
import { encounterMaskFor, encounterTable, stepsPerForay } from "@game/encounters";
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
import {
  DIRECTIONS,
  createMovement,
  delta,
  movementConfig,
  placeAt,
  skipConfig,
  skipFlipped,
  skipHopIndex,
  skipOffsetPx,
  skipSwayOffsetPx,
  spriteWorldPosition,
  type Direction,
  type SkipConfig,
  type TilePosition,
} from "@game/movement";
// §15's reach question is asked through the SAME helpers `interact()` asks it through, so the
// fixture and the scene cannot disagree about where a player standing on a tile actually is.
import { propAt, propLabel, propsOf, type WorldPoint } from "@game/props";
import {
  captureStreams,
  deserialize,
  newSave,
  openStreams,
  readBlackout,
  readPayout,
  serialize,
  trainerPayout,
  type SaveEnvelope,
} from "@core/save";
/*
 * `subsystemRng` is deliberately NOT imported. §3 used to open its own battle stream with it; the
 * stream a battle must run off is the RUN's, which the scene hands over as `BattleSceneData.rng` —
 * see `fightWithSnares`. A fresh stream per fight is the exact thing `beginWildBattle` warns about.
 */
import type { Balance, Content, NodeFile, NodeState, OwnedCreature, PropPlacement, SpeciesLine } from "@core/types";
import { OverworldScene, panelColumnHeight, type OverworldSceneData } from "@game/scenes/OverworldScene";
import type { BattleSceneData } from "@game/scenes/BattleScene";
import { SCENE_KEYS } from "@game/scene-keys";
import { finishYearTurn, type YearTurnSceneData } from "@game/scenes/YearTurnScene";
import { buildGymBattle } from "@game/gym-battle";
import {
  PROVISIONAL_STARTER_UID,
  liveNodeOf,
  provisionalStarter,
  starterLines,
  wildBattleProblem,
} from "@game/wild-battle";
import {
  PLAYER_FORWARD_VIEW,
  PLAYER_VIEWS,
  interiorAssetPath,
  interiorTextureKey,
  maskTextureKey,
  paintedInteriorKey,
  playerArtId,
  playerArtIds,
} from "@game/mapview";
// `registerRealAsset` used to be imported here so §16 could manufacture a census entry for a room
// nothing had painted. Every room is painted now, so manufacturing one would overwrite a real
// emitted URL with a fake for the rest of the run and prove nothing. See §16's block header.
import { assetId, hasRealAsset, placeholderKey } from "@game/placeholder";
// §17.6's curtain colour, resolved through the SAME role the scene paints it with — a hex typed
// here would agree with itself and with nothing else after a palette re-freeze.
import { roleColor } from "@game/ui/Palette";
import { cellRollsEncounters, encounterWeights, findLayoutGrid, indexSpecies } from "@core/foodweb";

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
      /*
       * ⚠ A PAUSED SCENE GETS NO FRAME, AND THAT IS THE WHOLE INSTRUMENT.
       * Phaser's `SceneManager.update` skips any scene whose `settings.active` is false, and its
       * `InputPlugin` disarms itself on the PAUSE event — so a paused overworld neither runs
       * `update()` nor sees a keypress. This rig used to call `update()` unconditionally, which
       * made every key it pressed work whether or not the scene had the screen: the ONE symptom a
       * softlock has (the map draws, the loop runs, nothing answers a key) was the one thing the
       * rig could not express. Calling straight through is not a convenience, it is a lie about
       * the platform.
       */
      if (!parts.active) return;
      scene.update(0, ms);
    },
    restart(next = {}) {
      // Phaser reuses the scene INSTANCE across a restart but tears its DISPLAY LIST down
      // (`shutdown` → `displayList.removeAll(true)`), which is the exact asymmetry §5 is about: the
      // fields survive, the objects do not. The stub has to reproduce both halves or §5 would read
      // the previous visit's Graphics and pass for the wrong reason.
      parts.objects.length = 0;
      // `scene.start` boots the scene RUNNING — a restart is how a paused scene comes back.
      parts.active = true;
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
 * Walk like a player LOOKING for animals: to the nearest cell of the node's encounter terrain, and
 * then across it. Same signature and same return as {@link walk} — the steps actually taken.
 *
 * ⚠ WHY {@link walk} STOPPED BEING ABLE TO DO THIS JOB, MEASURED RATHER THAN GUESSED.
 * The stub hands `loadCollision` no mask pixels, so every node in this file is played on
 * `synthesiseBorderCollision`'s placeholder — "walkable except the one-cell border". `walk` takes
 * the first open direction in right/down/left/up order, and on an open rectangle that is not a
 * roam: from the spawn at (32,32) it runs east along row 32 to col 62, then south down column 62 to
 * row 62, and then oscillates between two cells for the rest of its budget. Instrumented at
 * `SLICE_NODE`: 400 steps, 62 distinct cells, every one of them on the map's outer edge — and in
 * hearthollow's committed layout that edge is `R` and `T`, rock and treeline, cells the shipped
 * collision mask would never let a player stand on at all.
 *
 * While the encounter roll was position-blind, walking through a wall for 400 steps met creatures at
 * exactly the rate walking through a meadow did, and none of that mattered. It matters now:
 * `OverworldScene.forayContext` hands the roll the cell the step landed on, the layout says those
 * cells are not encounter terrain, and a rig that never leaves them meets nothing — which is the
 * right answer to the question it was accidentally asking, and the wrong question.
 *
 * So the tests that need an encounter walk where the animals are. The steering is a breadth-first
 * search over `canEnter` — the scene's OWN walkability question, never a second grid — to the
 * nearest cell the SHIPPED mask calls encounter terrain, one step along that path per frame. Once
 * the player is in the grass the nearest other grass cell is a neighbour, so they pace it, which is
 * what foraging looks like. Nothing here is random (G11) and nothing here is a node id: the search
 * order is `DELTA`'s, so the path is a function of the map and the same every run.
 *
 * INDOORS IT IS {@link walk}, deliberately. A room's cells are the blueprint's coordinates and the
 * mask is the TOWN's, so steering by one inside the other would be steering by a coincidence — and
 * §14.3's claim is that indoors nothing rolls at all, which needs a walk that is not hunting.
 */
function forage(h: Harness, steps: number, stop?: () => boolean): number {
  const order = ["right", "down", "left", "up"] as const;
  let taken = 0;
  let guard = 0;
  while (taken < steps && guard < steps * 40 + 200) {
    guard += 1;
    if (stop?.() === true) break;
    const before = h.scene.movement.tile;
    for (const dir of order) h.hold(dir, false);
    const toward = h.scene.currentInterior() === null ? stepTowardEncounterTerrain(h) : null;
    const open =
      toward ??
      order.find((d) =>
        h.scene.canEnter({ col: before.col + DELTA[d].dCol, row: before.row + DELTA[d].dRow }),
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
 * The first step of the shortest walkable path from where the player is standing to the nearest cell
 * that rolls encounters — or null when this node has no layout, or no reachable grass at all.
 *
 * The mask is `encounterMaskFor`, i.e. the very object `OverworldScene.forayContext` hands the roll,
 * so the rig cannot be hunting for grass the game does not believe in.
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

    forage(h, 400);
    expect(h.scene.encountersMetCount()).toBe(0);
  });

  it("the same walk on the same seed DOES meet creatures when the save carries the shipped counts", () => {
    // The control. Without it the test above would also pass on a scene that never rolls at all.
    const h = mount();
    forage(h, 400);
    expect(h.scene.encountersMetCount()).toBeGreaterThan(0);
  });

  it("catching a line down to 0 in the save stops that line appearing, with no extinction check", () => {
    const shipped = nodeFile(SLICE_NODE);
    const lineId = Object.entries(shipped.populations).sort((a, b) => b[1].count - a[1].count)[0]![0];
    const others: Record<string, number> = {};
    for (const id of Object.keys(shipped.populations)) others[id] = id === lineId ? shipped.populations[id]!.count : 0;

    const alive = mount({ save: withCounts(freshSave(), SLICE_NODE, others) });
    forage(alive, 400);
    const metAlive = alive.scene.encountersMetCount();
    expect(metAlive).toBeGreaterThan(0);

    const wiped: Record<string, number> = {};
    for (const id of Object.keys(shipped.populations)) wiped[id] = 0;
    const dead = mount({ save: withCounts(freshSave(), SLICE_NODE, wiped) });
    forage(dead, 400);
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
    forage(h, WALK_BUDGET, () => h.parts.launches.some((l) => l.key === SCENE_KEYS.battle));
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
      // A fight lost on the way is a wipe, and a wipe wakes the party in the inn — see
      // `stepOutside`. The walk carries on outdoors, which is where the encounters are.
      if (stepOutside(h)) seen.push(`— woke in the inn and stepped back outside`);
      forage(h, WALK_BUDGET, () => h.parts.launches.length > consumed);
      const launch = h.parts.launches[consumed];
      if (!launch) {
        seen.push(
          `— walked ${String(WALK_BUDGET)} steps and the scene launched nothing` +
            ` (handed over: ${String(h.scene.isHandedOver())}, indoors: ` +
            `${h.scene.currentInterior()?.id ?? "no"})`,
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
      // See `stepOutside`: a fight lost on the way wakes the party in the inn, and there are no
      // wild encounters on an inn's floor.
      if (stepOutside(h)) seen.push(`— woke in the inn and stepped back outside`);
      forage(h, WALK_BUDGET, () => h.parts.launches.length > consumed);
      const launch = h.parts.launches[consumed];
      if (!launch) {
        seen.push(
          `— walked ${String(WALK_BUDGET)} steps and the scene launched nothing (indoors: ` +
            `${h.scene.currentInterior()?.id ?? "no"})`,
        );
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
      forage(h, WALK_BUDGET, () => h.parts.launches.length > consumed);
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
    forage(h, 600);
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
/** The release verb's key. Never pressed anywhere in this file before §18 — see its header. */
const KEY_X = 88;

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
    /*
     * …AND LOSING IT IS A WIPE, WHICH CARRIES THEM TO THE INN AND PUTS THEM INSIDE IT (T-29). That
     * is the whole of `recoverFromBlackout`'s move: the route is behind them, the wake town is the
     * one the leader stands in, and the door is the next thing a player touches. Without this step
     * the badge below is challenged from an inn's floor, which the scene refuses out loud.
     */
    expect(h.scene.save.currentNode, "the wipe did not carry the player to the wake town").toBe(
      wakeNodeFor(r1 as string, content),
    );
    stepOutside(h);

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

/**
 * Answer the box the way `DialogueScene` answers it: play the run out, hand the state back — and
 * THEN let the box stop itself, which is the half this rig used to leave out.
 *
 * ⚠ `game/scenes/DialogueScene.ts` `finish()` IS TWO STATEMENTS, `this.onDone(this.state)` and then
 * `this.scene.stop()`, and the order between them is load-bearing. Everything the overworld does
 * inside `onDone` — including launching the NEXT box — happens before that trailing stop, and
 * Phaser's operation queue applies them in exactly that order. A rig that replayed only `onDone`
 * could not see a chained beat being shut down by the beat it was chained to, which is precisely
 * the softlock every party wipe ended a run with.
 */
function answerBox(h: Harness, pick: (state: DialogueRunState, choices: readonly string[]) => number = () => 0): string {
  const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.dialogue).pop();
  if (!launch) throw new Error("nothing was handed to the dialogue box");
  /*
   * ⚠ A BOX THAT IS NOT RUNNING HAS NO `onDone` TO CALL, and answering one anyway is how this rig
   * used to walk straight past a softlock. `launches` records what was HANDED to the box; it does
   * not record whether the box survived being handed it. A `scene.stop` queued after the `launch`
   * — which is precisely what `DialogueScene.finish()` does one statement after `onDone` returns —
   * shuts the new box down before it ever draws, and nothing will ever call back. Reading the
   * launch out of the list regardless made that indistinguishable from a beat the player answered.
   */
  if (!boxIsUp(h)) {
    throw new Error(
      `the box was handed "${(launch.data as DialogueSceneData).entryId}" and then shut down before ` +
        `anybody could answer it — in the game that is a beat nobody sees and a screen nobody gets back`,
    );
  }
  h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
  const data = launch.data as DialogueSceneData;
  data.onDone(runHeadless(data.file ?? DIALOGUE, data.entryId, pick));
  h.parts.stops.push(SCENE_KEYS.dialogue);
  h.parts.sceneStatus.set(SCENE_KEYS.dialogue, "shutdown");
  /*
   * A CHAINED BEAT OPENS ON THE NEXT FRAME, and the rig has to give it one or it is asserting
   * against a game that never ran. `OverworldScene.playEntry` cannot launch from inside this
   * callback — the stop two lines above is exactly what would undo it — so it queues, and
   * `update()` opens it. `isSpeaking()` is the scene's own answer to "is a beat still owed": it
   * stays true across the gap, and it is false when this box was the end of the chain, so no test
   * is handed a frame of real play it did not ask for.
   */
  if (h.scene.isSpeaking()) h.frame();
  return data.entryId;
}

/** Whether a box is on screen right now — launched, and not stopped since. */
function boxIsUp(h: Harness): boolean {
  return h.parts.sceneStatus.get(SCENE_KEYS.dialogue) === "running";
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
    // …and they are standing IN her inn, because that is what T-29's wake is. Travel refuses from
    // indoors, out loud, so the rematch below starts where a player would start it: on the step.
    expect(lost.scene.currentInterior()?.parentNode, "the wake left the player outdoors").toBe(
      lost.scene.save.currentNode,
    );
    stepOutside(lost);
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
      forage(h, 1);
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
      /*
       * ⚠ AND THE PREVIOUS LOSS PUT THEM IN THE INN. T-29's wake is into the room, and the leader
       * is not in it — `challengeGym` refuses indoors, out loud, so the second fight would never
       * start. The step out is a step and not a teleport, and it is deliberately taken BEFORE the
       * assertions below: it happens indoors, where `onStepCompleted` charges no foray tick (§14),
       * so it cannot move the arithmetic this test is about.
       */
      stepOutside(h);
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
      forage(h, 40);
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

/**
 * Walk back out of whatever room the player is standing in, and say so if there was none.
 *
 * ⚠ A WIPE PUTS THEM IN ONE NOW. T-29 is "you wake up at the inn", and `recoverFromBlackout` wakes
 * the party INSIDE the wake town's inn where one is shipped — so a rig that loses a fight and then
 * carries on walking is walking a floor plan: the overworld refuses travel, the gym and the wild
 * encounter roll while it is indoors, out loud and by design. Every caller below is a place a
 * PLAYER would step outside, and the step is the plan's own `D` cell rather than a teleport.
 *
 * Returns whether there was a room to leave, so a caller can tell "walked out" from "was never in".
 */
function stepOutside(h: Harness): boolean {
  const bp = h.scene.currentInterior();
  if (bp === null) return false;
  stepOnto(h, planDoor(bp), "down");
  expect(h.scene.currentInterior(), `the rig could not walk out of ${bp.id}`).toBeNull();
  return true;
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
 * WHICH HALF MATTERS TODAY — AND IT IS NO LONGER THE ONE THIS BLOCK WAS WRITTEN FOR.
 * This header used to open "No room is painted", and that was measured and true when it was
 * written (commit 1932275). It is now false: `assets/final/interiors/` carries a painting for every
 * blueprint in `data/interiors/`, none of them declared in `assets/final/stand-ins.json`, so
 * `hasRealAsset` answers TRUE for all four and the PAINTED branch is the path a booted game takes.
 *
 * The footprint branch has not lost its subject, but the subject changed. `paintedInteriorKey`
 * needs the census AND a loaded texture; the census half is now always satisfied, so the footprint
 * is what a room draws when its painting DID NOT LOAD — a real runtime state (`queueRealAssets`
 * queues every real asset, and a queue is not a guarantee), and the state every harness in this
 * file is in, because the loader stub loads nothing unless a test puts the key in `parts.scratch`.
 * That is the state the `it.each` below drives, and it is named for it rather than for "unpainted".
 *
 * Both halves of `paintedInteriorKey` are still shown to be load-bearing one at a time. The texture
 * half is driven through the scene as before. The census half no longer CAN be — no shipped room
 * has an absent census entry any more, and `game/placeholder.ts` has no un-register — so it is
 * driven on a room id no manifest row and no art lane can ever emit, which is the same
 * `__unbuilt-probe__` discipline `tests/unit/game-placeholder.test.ts` uses and for the reason
 * `game/placeholder.ts` states in its census docstring: "unbuilt" has to be established by
 * CONSTRUCTION, never by reaching for whatever happens not to have shipped yet.
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
    // Named "the painting did not load" rather than "unpainted": every room is painted on disk now
    // (see the block header), and what this rig withholds is the LOADED TEXTURE, not the census.
    // The assertions are unchanged — only the name and the messages, which described a world that
    // stopped being true when the art landed.
    "%s — the painting did not load: the footprint is on screen and no interior image was ever made",
    (_id, bp) => {
      const h = mountAt(bp);
      goInside(h, bp);
      expect(h.scene.currentInterior()?.id, "the player is not inside the room").toBe(bp.id);

      expect(
        images(h).map((o) => o.texture),
        `${bp.id} put an image on screen for a painting the loader never delivered`,
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

    /*
     * ⚠ THIS PRECONDITION WAS THE OPPOSITE ONE, AND IT WAS RIGHT WHEN IT WAS WRITTEN.
     *
     * It read `expect(hasRealAsset(interiorAssetPath(bp.id))).toBe(false)`, message
     * "<id> is already painted — this test is stale", and it was introduced by commit 1932275
     * ("fix(spawn): wire the prop-aware arrival, and give a painted room a key") at a time when
     * `assets/final/interiors/` was empty. Nothing being painted was what let this test MANUFACTURE
     * both halves of `paintedInteriorKey` — the census half with `registerRealAsset`, the texture
     * half with `parts.scratch` — and therefore withhold each half in turn.
     *
     * Commit 4334ea3, a descendant, landed a painting for every one of the four blueprints in
     * `data/interiors/`, and `assets/final/stand-ins.json` declares none of them, so the build-time
     * glob in `game/placeholder.ts` registers all four and `hasRealAsset` answers true for every
     * room. The message the old assertion carried predicted exactly this and named it correctly:
     * the world changed, the code did not. Selecting a different room would not help — there is no
     * unpainted one left — so the census half of the proof moved to the block below, where it is
     * driven on a constructed id instead of borrowed from whatever had not shipped yet.
     *
     * What is asserted here now is the precondition the REST of this test actually needs, at the
     * same strength and on the same expression: the room really is painted, so everything below is
     * the shipped path rather than a synthetic one. If the painting is ever withdrawn this goes red
     * and says so, which is the same tripwire the old direction provided, pointing the other way.
     */
    expect(
      hasRealAsset(interiorAssetPath(bp.id)),
      `${bp.id} has no painting in the census — the painted branch has no subject`,
    ).toBe(true);

    /*
     * BOTH halves of `paintedInteriorKey`, withheld one at a time so each is shown to be
     * load-bearing. A texture with no census entry is a key some other lane happened to create; a
     * census entry with no texture is a build-time truth about a runtime failure.
     *
     * THE CENSUS HALF cannot be withheld from a shipped room any more (see the block header), so it
     * is asked of a room id that no manifest row, no blueprint and no art lane can emit. The scene
     * cannot be walked into a room that has no blueprint, so this drives `paintedInteriorKey`
     * directly — with the harness's own scene, whose texture cache really does hold the probe key.
     */
    const UNSHIPPABLE_ROOM = "__unpainted-probe__";
    expect(
      hasRealAsset(interiorAssetPath(UNSHIPPABLE_ROOM)),
      "the probe id is in the census — it is not a constructed unbuilt path any more",
    ).toBe(false);
    const withTexture = mount({ save: saveAtTown(bp), startNode: bp.parentNode }, (parts) => {
      parts.scratch.add(key);
      parts.scratch.add(interiorTextureKey(UNSHIPPABLE_ROOM));
    });
    goInside(withTexture, bp);
    // Non-vacuity for the drive below: the probe's texture really is in the cache, so a null answer
    // can only come from the census. Without this the next assertion passes for a rig that quietly
    // never loaded the probe at all.
    expect(
      withTexture.scene.textures.exists(interiorTextureKey(UNSHIPPABLE_ROOM)),
      "the probe texture is not loaded — the census drive below would pass for the wrong reason",
    ).toBe(true);
    expect(
      paintedInteriorKey(withTexture.scene, UNSHIPPABLE_ROOM),
      "a loaded texture alone painted the room — the census is not being asked",
    ).toBeNull();
    // The control: same scene, same loaded-texture state, census entry the only difference. Without
    // this the assertion above would also pass against a helper that never returns a key at all.
    expect(
      paintedInteriorKey(withTexture.scene, bp.id),
      "the census-and-texture control did not paint either — the drive above proves nothing",
    ).toBe(key);

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
     * every other test in this file, and every player whose loader drops the file.
     */
    const unpainted = mountAt(bp);
    goInside(unpainted, bp);
    expect(
      images(unpainted).map((o) => o.texture),
      "the census entry alone put the painting on screen in a harness that loaded no texture",
    ).not.toContain(key);
    expect(unpainted.hud(), "the footprint stopped being drawn for a room whose painting did not load").toContain(
      `FOOTPRINT interior ${bp.id}`,
    );
  });

  /*
   * ADDED, not edited: the test above drives ROOMS[0] only, which was the whole coverage the
   * painted branch had while the branch was hypothetical. Four paintings have landed and each one
   * is a file a player now sees, so each one is walked into here. Same claims, stated once per
   * room: one image, at the plan's own rectangle, visible, and the provenance line naming the
   * picture rather than the footprint.
   */
  it.each(ROOMS.map((bp) => [bp.id, bp] as const))(
    "%s — painted: its shipped painting draws as ONE image at the plan's own size",
    (_id, bp) => {
      const key = interiorTextureKey(bp.id);
      expect(hasRealAsset(interiorAssetPath(bp.id)), `${bp.id} has no painting in the census`).toBe(true);

      const h = mount({ save: saveAtTown(bp), startNode: bp.parentNode }, (parts) => {
        parts.scratch.add(key);
      });
      goInside(h, bp);

      const drawn = images(h).filter((o) => o.texture === key);
      expect(drawn.length, `${bp.id} did not draw its painting as exactly one image`).toBe(1);
      expect(drawn[0]!.visible, `${bp.id}'s painting was made and then hidden`).toBe(true);

      const cell = balance.map.collisionCellPx * balance.map.mapRenderScale;
      const plan = planSize(bp.plan);
      expect(drawn[0]!.displaySize, `${bp.id}'s painting is not sized to its plan`).toEqual({
        w: plan.cols * cell,
        h: plan.rows * cell,
      });
      expect(h.hud(), `${bp.id}'s HUD still calls a painted room a footprint`).not.toContain(
        `FOOTPRINT interior ${bp.id}`,
      );
      expect(h.hud(), `${bp.id}'s HUD does not name the painting that is on screen`).toContain(
        interiorAssetPath(bp.id),
      );
    },
  );
});

/* ════════════════════════════════════════════════════════════════════════════
 * §17 THE INN HEALS WHAT IT CHARGES FOR — and the blackout still MOVES the player
 *
 * ⚠ WHAT WAS TRUE BEFORE, HALF ONE. `restAtInn` was `spendTicks("inn", …)` and a banner. It took
 * `clock.innTicks` and touched the party not at all — harmless only while damage evaporated between
 * fights, which it stopped doing when `applyBattleResult` began writing `curHp` back. The
 * consequence: a damaged-but-not-wiped party's only route to full was to LOSE a fight on purpose.
 *
 * ⚠ WHAT WAS TRUE BEFORE, HALF TWO, AND IT IS THE MORE DANGEROUS ONE. `recoverFromBlackout`'s
 * step 2 — `this.enterNode(target)`, the on-screen move — was DELETABLE with the whole suite
 * unchanged. The only assertion comparing `scene.node.id` to `save.currentNode` after a blackout
 * runs at the vertical slice's first walkable node, and `wakeNodeFor` is the IDENTITY there: the
 * assertion compared two values that are the same value at its fixture. An end-to-end assertion
 * placed at the one node where its two sides cannot differ cannot fail. §17.2 drives the wipe at
 * EVERY shipped node and counts how many actually move, the way `tests/unit/recovery.test.ts`
 * already loops rather than picking.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Walk until a battle is launched, and hand back its data. The encounter is real; the walk is §3's. */
function walkIntoABattle(h: Harness): BattleSceneData {
  const before = h.parts.launches.length;
  const found = (): boolean => h.parts.launches.slice(before).some((l) => l.key === SCENE_KEYS.battle);
  forage(h, 4000, found);
  const launch = h.parts.launches.slice(before).find((l) => l.key === SCENE_KEYS.battle);
  if (!launch) throw new Error("walked 4000 steps and no wild encounter became a battle");
  return launch.data as BattleSceneData;
}

/**
 * Finish the fight as a WIN that left the player standing on one hit point, and hand back the uids.
 *
 * ⚠ THE DAMAGE IS FABRICATED THE WAY {@link settledState} FABRICATES A FAINT — one point above the
 * `curHp: 0` it writes — and for the same reason: what is under test here is the SCENE. That a real
 * shipped matchup can leave a party hurt AND standing is `tests/unit/recovery.test.ts` §8.1's, and
 * it is played there through the real reducer. What is NOT fabricated is the write: the number below
 * reaches the save through production's own `game/wild-battle.ts` `applyBattleResult`, off the
 * finish handler this launch was given.
 */
function settleWinLeavingThePartyHurt(h: Harness, data: BattleSceneData): string[] {
  const started = startBattle(data.input, data.ctx).state;
  const battlers = { ...started.battlers };
  for (const uid of started.enemyOrder) {
    const enemy = battlers[uid];
    if (enemy) battlers[uid] = { ...enemy, curHp: 0, fainted: true };
  }
  const hurt: string[] = [];
  for (const uid of started.playerOrder) {
    const player = battlers[uid];
    if (!player || player.maxHp <= 1) continue;
    battlers[uid] = { ...player, curHp: 1 };
    hurt.push(uid);
  }
  const launch = h.parts.launches.find((l) => l.data === data);
  if (launch) h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
  data.onFinished({ state: { ...started, battlers, outcome: "win" }, caught: null });
  return hurt;
}

describe("§17.1 [R] restores the party it charges for", () => {
  it("a damaged party comes back at full, for exactly clock.innTicks, and says so", () => {
    const h = mount();
    const hurt = settleWinLeavingThePartyHurt(h, walkIntoABattle(h));
    expect(hurt.length, "the fight left nobody to heal — the rest below would prove nothing").toBeGreaterThan(0);
    // THE RIG FIRST: the damage is really on the SAVE, through production's own write.
    for (const uid of hurt) {
      expect(h.scene.save.party.find((c) => c.uid === uid)?.curHp, uid).toBe(1);
    }

    /*
     * ⚠ A CREATURE THAT DID NOT FIGHT IS ADDED BEFORE THE REST, AND IT IS WHAT MAKES THE BANNER
     * ASSERTION ABLE TO FAIL. `applyBattleResult` writes an explicit `curHp` for EVERY battler,
     * hurt or not, so after a fight the tape's `restored` (the whole fieldable party) and the
     * banner's `healed` (what the rest rewrites) are the same list — and a banner printing the
     * wrong one would read identically. A creature caught after the fight has never carried a
     * number, which is the ordinary save state that tells the two apart. Added through `restart`,
     * the way §4 changes a save, rather than by writing over the scene's own field.
     */
    const spare = provisionalStarter(content);
    if (!spare) throw new Error("data ships no starter line — the fixture cannot be built");
    h.restart({
      save: {
        ...h.scene.save,
        party: [...h.scene.save.party, { ...spare, uid: `${spare.uid}-spare` }],
      },
    });
    expect(h.scene.save.party).toHaveLength(hurt.length + 1);
    expect(
      h.scene.save.party.filter((c) => c.curHp !== undefined),
      "every party member carries a number — the two counts cannot differ",
    ).toHaveLength(hurt.length);

    const spentBefore = subTicksSpent(h.scene.save);
    const logBefore = h.scene.save.actionLog.length;
    h.press(KEY_R);
    frameAndSettle(h);

    // 1. THE HEAL — absent `curHp`, which is the one spelling of full (`isStanding`).
    for (const creature of h.scene.save.party) {
      expect(creature.curHp, `${creature.uid} came out of the inn still carrying an HP number`).toBeUndefined();
    }
    // 2. THE PRICE — the inn's, unchanged. A heal that made the rest free would pass every other
    //    assertion here.
    expect(subTicksSpent(h.scene.save) - spentBefore, "the rest did not cost clock.innTicks").toBe(COST.inn);
    // 3. THE TAPE — TWO entries, because a price and a consequence are never the same entry. Without
    //    the consequence entry `core/save.ts` `replay` reproduces a party that is still hurt (L10).
    const added = h.scene.save.actionLog.slice(logBefore).map((e) => e.action);
    expect(added.filter((a) => readInnRest(a) !== null), "no inn-rest entry reached the tape").toHaveLength(1);
    expect(added.filter((a) => (a as { t: string }).t === "inn"), "no inn PRICE reached the tape").toHaveLength(1);
    const taped = readInnRest(added.find((a) => readInnRest(a) !== null));
    expect(taped).toContain(hurt[0]);
    /*
     * …and the tape's list is the WHOLE fieldable party, not just the one that was hurt. That is the
     * absolute form: applied to any save it names the same creatures and leaves them in the same
     * state, which is what lets `replay` re-apply it without asking who was standing at the time.
     */
    expect(taped, "the tape recorded only what changed, which is not an absolute record").toHaveLength(
      h.scene.save.party.length,
    );
    /*
     * 4. THE BANNER — identifiers and arithmetic (G7), and the count is what CHANGED. `restored` is
     *    the whole party here and `healed` is one of it, so a banner printing the wrong list reads
     *    "2 restored" and fails.
     */
    expect(hurt.length, "the rig hurt everybody — the two counts cannot differ").toBeLessThan(
      h.scene.save.party.length,
    );
    expect(h.hud()).toContain(`${String(hurt.length)} restored`);
    expect(h.hud(), "the banner counted the tape's list instead of what changed").not.toContain(
      `${String(h.scene.save.party.length)} restored`,
    );
  });

  it("a party already at full may rest: charged, not refused, and nothing written", () => {
    /*
     * The decision, stated as a test: a rest the party did not need is a NO-OP with a price, not an
     * error and not a refusal. A cost that depended on how hurt the party was would be a second
     * pricing rule beside `core/clock.ts`'s — and a refusal would make [R] silently do nothing in
     * the state the player is in for most of a run.
     */
    const h = mount();
    expect(h.scene.save.party.every((c) => c.curHp === undefined), "the rig is not at full").toBe(true);
    const partyBefore = JSON.stringify(h.scene.save.party);
    const spentBefore = subTicksSpent(h.scene.save);
    const logBefore = h.scene.save.actionLog.length;

    expect(() => {
      h.press(KEY_R);
      frameAndSettle(h);
    }).not.toThrow();

    expect(subTicksSpent(h.scene.save) - spentBefore).toBe(COST.inn);
    expect(JSON.stringify(h.scene.save.party)).toBe(partyBefore);
    const added = h.scene.save.actionLog.slice(logBefore).map((e) => e.action);
    expect(added.filter((a) => readInnRest(a) !== null), "an empty consequence reached the tape").toHaveLength(0);
    expect(added, "the price stopped being levied").toHaveLength(1);
    expect(h.hud(), "the banner reported a restore that did not happen").not.toContain("restored");
  });
});

describe("§17.2 a wipe moves the SCENE, not only the save", () => {
  it("at every shipped node, and the wake rule really moves at some of them", () => {
    /*
     * ⚠ THE LOOP IS THE TEST. `wakeNodeFor` is the identity at five of the twelve nodes — every town
     * wakes in itself — so a single-node version of this assertion is `x === x` unless the fixture
     * happens to be a route. The count below is what makes the loop mean something: if a data change
     * ever made every node wake where it fell, this fails loudly instead of passing vacuously.
     *
     * ⚠ THE PARTY IS PUT AT ZERO DIRECTLY, and that is deliberate here rather than sloppy: this
     * asserts the SCENE's half of the recovery — that step 2 exists — and building twelve real
     * wipes by walking twelve maps into twelve losses would test the encounter tables. That a
     * shipped matchup produces this state at every one of the twelve is
     * `tests/unit/recovery.test.ts` §6, played through the real reducer; §3 above drives one
     * end-to-end through this very scene.
     */
    let moved = 0;
    const seen: string[] = [];
    for (const node of content.nodes) {
      const wake = wakeNodeFor(node.id, content);
      const base = freshSave(node.id);
      const h = mount({ save: { ...base, party: base.party.map((c) => ({ ...c, curHp: 0 })) } });
      expect(h.scene.node.id, `${node.id}: the harness did not start where it was asked to`).toBe(node.id);

      h.scene.recoverFromBlackout();

      // The consequence fired at all — without this the comparison below is two unmoved values.
      expect(h.scene.save.currentNode, `${node.id}: the blackout did not fire`).toBe(wake);
      expect(
        h.scene.save.party.every((c) => c.curHp === undefined),
        `${node.id}: the wake left the party on the floor`,
      ).toBe(true);
      // …AND THE VIEW FOLLOWED IT. `forayContext`, `liveNode`, the encounter roll and the collision
      // grid all read `this.node`; a save that moved without it leaves the player walking one map
      // while the game rolls encounters for another.
      expect(h.scene.node.id, `${node.id} → ${wake}: the save moved and the scene did not`).toBe(
        h.scene.save.currentNode,
      );

      if (wake !== node.id) moved += 1;
      seen.push(`${node.id} → ${wake}`);
    }
    expect(
      moved,
      `every shipped node wakes where it fell, so this loop compared a value with itself ` +
        `twelve times:\n${seen.join("\n")}`,
    ).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §17.3 [R] ASKS WHERE THE PLAYER IS STANDING
 *
 * ⚠ WHAT WAS TRUE BEFORE. `restAtInn` guarded on `isHandedOver() || travelling` and nothing else,
 * while `innKey` is bound unconditionally and polled every frame. Traced: [R] on Route 4 with the
 * party at 1 HP healed it whole for `clock.innTicks` and printed `inn at r4 · 2 ticks · 1 restored`,
 * and [R] at a shop counter did the same — `save.currentNode` keeps naming the TOWN while the
 * player is indoors. The inn was therefore a cheaper cure for a wipe than the wipe cure, which is
 * the premise `core/recovery.ts` prices the blackout's extra `innTicks + travelTicks` against.
 *
 * ⚠ WHY NOTHING CAUGHT IT, WHICH IS WHAT THESE TESTS ARE SHAPED AGAINST. [R] is pressed at nine
 * sites above and again in §17.1, and EVERY one of them mounts a save from `freshSave()`, whose
 * default node is `SLICE_NODE` — a town with an inn. The blind spot was structural: the key had
 * never been pressed anywhere else. So the loop below presses it at every shipped node and in every
 * shipped room, and its vacuity guards go red if either group ever empties.
 * ════════════════════════════════════════════════════════════════════════════ */

/** The nodes the CORPUS says have an inn — `core/recovery.ts`'s derivation, never a list here. */
const INN_NODES = innNodeIds();

/** True where the town's own innkeeper is the speaker standing in this room. */
function isTheInn(bp: InteriorBlueprint): boolean {
  const keeper = innkeeperAt(bp.parentNode);
  return keeper !== null && bp.anchors.some((a) => a.kind === "speaker" && a.target === keeper);
}

/**
 * A save standing at `nodeId` whose whole party carries an explicit, non-zero HP number.
 *
 * Written directly rather than fought for, and for §17.2's reason: this section is about WHERE the
 * key works, and walking twelve nodes into twelve real fights would be testing the encounter tables.
 * That a shipped matchup leaves the party in exactly this state is §17.1's, played through the real
 * reducer. Non-zero, so the party is HURT and not WIPED — `isStanding` is `curHp > 0`, and a wiped
 * party would be answered by the blackout instead of by the inn.
 */
function hurtAt(nodeId: string): SaveEnvelope {
  const base = freshSave(nodeId);
  return { ...base, party: base.party.map((c) => ({ ...c, curHp: 1 })) };
}

describe("§17.3 [R] rests where the corpus puts an inn, and refuses where it does not", () => {
  it("at every shipped node — and the refusal costs nothing, writes nothing and is SAID", () => {
    const rested: string[] = [];
    const refused: string[] = [];

    for (const node of content.nodes) {
      const h = mount({ save: hurtAt(node.id) });
      expect(h.scene.node.id, `${node.id}: the harness did not start where it was asked to`).toBe(node.id);
      // Without this a refusal could be `isHandedOver()`'s rather than the one under test, and the
      // whole loop would pass for a scene that had stopped accepting [R] anywhere at all.
      expect(h.scene.isHandedOver(), `${node.id}: something else had the screen before [R]`).toBe(false);

      // The HUD as it reads with no banner yet fired — this is the READOUT, not the refusal.
      const readout = h.hud();
      const spentBefore = subTicksSpent(h.scene.save);
      const logBefore = h.scene.save.actionLog.length;

      h.press(KEY_R);
      frameAndSettle(h);

      const healed = h.scene.save.party.every((c) => c.curHp === undefined);
      const charged = subTicksSpent(h.scene.save) - spentBefore;
      const taped = h.scene.save.actionLog.length - logBefore;

      if (INN_NODES.includes(node.id)) {
        expect(healed, `${node.id} has an inn and [R] left the party carrying a number`).toBe(true);
        expect(charged, `${node.id}: the rest was not charged clock.innTicks`).toBe(COST.inn);
        expect(readout, `${node.id} has an inn and the HUD does not offer it`).toContain("[R] inn");
        rested.push(node.id);
      } else {
        /*
         * THE FOUR OBSERVABLES OF A REFUSAL. A fix that only stopped the heal would still charge the
         * clock and still write the tape; one that only hid the banner would still do all three. The
         * tape matters most of the four: an entry written for a rest that did not happen is a save
         * `core/save.ts` `replay` reproduces differently from the run that wrote it (L10).
         */
        expect(healed, `${node.id} has no inn and [R] healed the party anyway`).toBe(false);
        expect(charged, `${node.id}: ticks were spent on a rest that cannot happen`).toBe(0);
        expect(taped, `${node.id}: an entry reached the tape for a refused rest`).toBe(0);
        expect(h.hud(), `${node.id}: the refusal was silent`).toContain(`no inn at ${node.id}`);
        expect(readout, `${node.id} has no inn and the HUD advertises one`).not.toContain("[R] inn");
        expect(readout, `${node.id}: the HUD does not say why [R] would refuse`).toContain(
          `[R] no inn at ${node.id}`,
        );
        refused.push(node.id);
      }
    }

    // The vacuity guards. Either list going empty turns this loop into an assertion about nothing.
    expect(rested, "no shipped node has an inn — the rest half of this loop asserted nothing").not.toHaveLength(0);
    expect(
      refused,
      "every shipped node has an inn — the defect this section pins would be unreachable",
    ).not.toHaveLength(0);
  });

  it.each(ROOMS.map((bp) => [bp.id, bp] as const))(
    "%s — [R] works in the room the town's innkeeper stands in, and nowhere else indoors",
    (_id, bp) => {
      /*
       * WALKED IN THROUGH THE DOOR, not placed: `save.currentNode` naming the town while the player
       * is inside is the state the defect rode on, and it is only real once the player has actually
       * crossed the threshold.
       */
      const base = saveAtTown(bp);
      const h = mount(
        { save: { ...base, party: base.party.map((c) => ({ ...c, curHp: 1 })) }, startNode: bp.parentNode },
      );
      goInside(h, bp);
      expect(h.scene.save.currentNode, "the save stopped naming the town while indoors").toBe(bp.parentNode);

      const readout = h.hud();
      const spentBefore = subTicksSpent(h.scene.save);
      const logBefore = h.scene.save.actionLog.length;

      h.press(KEY_R);
      frameAndSettle(h);

      const healed = h.scene.save.party.every((c) => c.curHp === undefined);
      const charged = subTicksSpent(h.scene.save) - spentBefore;
      const taped = h.scene.save.actionLog.length - logBefore;

      if (isTheInn(bp)) {
        /*
         * ⚠ THE ONE ROOM [R] IS LIVE IN, and it is deliberate rather than an oversight in the guard.
         * `core/recovery.ts` `restoreParty` puts `interiorId` BACK after the write and says why in
         * its own words — "[R] is live inside a room" — so a blanket indoor refusal would make that
         * branch dead code; and this room ships a `service` anchor whose `_purpose` calls it "the
         * tile the player stands on to trigger the rest service — the full heal that costs inn
         * ticks". Refusing here would contradict both.
         */
        expect(healed, `${bp.id} is the town's inn and [R] did not restore the party`).toBe(true);
        expect(charged, `${bp.id}: the rest was not charged clock.innTicks`).toBe(COST.inn);
        expect(h.scene.save.interiorId, `${bp.id}: the rest put the save outdoors`).toBe(bp.id);
        expect(h.scene.currentInterior()?.id, `${bp.id}: the rest moved the player out of the room`).toBe(bp.id);
        expect(readout, `${bp.id} is the town's inn and the HUD does not offer [R]`).toContain("[R] inn");
      } else {
        expect(healed, `${bp.id} is not an inn and [R] healed the party at its counter`).toBe(false);
        expect(charged, `${bp.id}: ticks were spent resting in a room with no beds`).toBe(0);
        expect(taped, `${bp.id}: an entry reached the tape for a refused rest`).toBe(0);
        expect(h.hud(), `${bp.id}: the refusal was silent`).toContain(`${bp.name} — step outside to rest`);
        expect(readout, `${bp.id} is not an inn and the HUD advertises one`).not.toContain("[R] inn");
      }
    },
  );

  it("the rooms really are of both kinds — the case split above is not one-sided", () => {
    // `it.each` over a list that is all one kind asserts half of what it reads as asserting.
    expect(ROOMS.filter(isTheInn).map((bp) => bp.id), "no shipped room is an inn").not.toHaveLength(0);
    expect(
      ROOMS.filter((bp) => !isTheInn(bp)).map((bp) => bp.id),
      "every shipped room is an inn — the indoor refusal is never exercised",
    ).not.toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §17.4 THE BLACKOUT DOES NOT LAUNCH A BEAT ON TOP OF THE YEAR TURN
 *
 * ⚠ WHAT WAS TRUE BEFORE. `recoverFromBlackout` charges three ticks through `spendTicks`, which can
 * reach `beginYearTurn` — a synchronous `scene.launch` + `scene.pause` — and then went straight on
 * to `playEntry`, which reads `dialogueRunning` and knew nothing about the year turn. A wipe on the
 * last ticks of a year therefore put TWO full-screen scenes up for one lost fight and paused the
 * overworld twice, against a `scene.resume` that is not ref-counted.
 *
 * ⚠ WHY NOTHING CAUGHT IT. §11 pins this hazard for the BATTLE hand-off and only for that one
 * (`handOffToBattle` re-reads the flag and says "the year turned first"); and
 * `tests/unit/recovery.test.ts` §4's "charged once" case measures a loop written inside the test,
 * which does not model `spendTicks`'s refusal at all. Nothing drove the real path with the clock
 * against the boundary. These two do, in both directions.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§17.4 a wipe on the year boundary turns the year OR plays the beat, never both", () => {
  /** A node the wake rule really moves the player off, so the whole of the recovery is exercised. */
  const AWAY = content.nodes.find((n) => wakeNodeFor(n.id, content) !== n.id);

  /**
   * A wiped save `ticks` whole ticks into the year, with everything else the shipped default.
   *
   * The position is composed from `balance.clock` (G11): `ticksPerYear - innTicks` is the last
   * position at which the FIRST of the blackout's three charges fills the meter.
   */
  function wipedAt(nodeId: string, tick: number): SaveEnvelope {
    const base = freshSave(nodeId);
    return { ...base, tick, party: base.party.map((c) => ({ ...c, curHp: 0 })) };
  }

  it("on the boundary: the year turn takes the screen, and nothing is launched on top of it", () => {
    const node = AWAY;
    expect(node, "no shipped node wakes anywhere but itself — this section cannot be set up").toBeDefined();
    const h = mount({ save: wipedAt(node!.id, balance.clock.ticksPerYear - balance.clock.innTicks) });
    /*
     * THE BOX IS REGISTERED AFTER `create`, DELIBERATELY. Registered at construction it would take
     * the node's arrival beat and pause the overworld before the test began; registered here, the
     * arrival played headlessly and the only launch that can follow is the one under test. And it
     * MUST be registered: with no box `playEntry` plays headlessly and pauses nothing, so the
     * hazard cannot happen and this test would pass against the defect.
     */
    withDialogueBox(h);
    expect(h.parts.paused, "something had already paused the overworld").toBe(0);
    const spentBefore = subTicksSpent(h.scene.save);

    h.scene.recoverFromBlackout();

    // The rig really did reach the boundary — without this the assertions below are about a wipe
    // that turned no year, which is the ordinary case §17.4's second test covers.
    expect(
      h.parts.launches.filter((l) => l.key === SCENE_KEYS.yearTurn),
      "the charge did not fill the year meter — the rig is not on the boundary",
    ).toHaveLength(1);

    expect(boxed(h), "the blackout beat was launched on top of the year turn").toEqual([]);
    expect(h.parts.paused, "the overworld was paused twice for one wipe").toBe(1);
    expect(h.scene.isSpeaking(), "the scene thinks a box is open behind the year turn").toBe(false);
    expect(h.hud(), "the beat was dropped silently").toContain("the year turned first");

    // THE CONSEQUENCE AND THE PRICE BOTH STAND — this is a refusal to SPEAK, not a refusal to
    // recover. A blackout that gave the party back for free would pass every assertion above.
    expect(h.scene.save.currentNode, "the wake did not happen").toBe(wakeNodeFor(node!.id, content));
    expect(h.scene.save.party.every((c) => c.curHp === undefined), "the party is still down").toBe(true);
    expect(subTicksSpent(h.scene.save) - spentBefore, "nothing was charged").toBeGreaterThan(0);
    /*
     * …and the beat is still OWED rather than lost: `BLACKOUT_CUE_FLAG` is a latch that only the
     * beat lowers, so the corpus still holds it eligible and the HUD's own `flags owed` count says
     * so. This is the assertion that would go red if the fix ever became "lower the cue and move on".
     */
    expect(h.scene.save.questFlags[BLACKOUT_CUE_FLAG], "the wake cue was spent on a beat nobody saw").toBe(true);

    // The year turn itself is untouched by any of this: it still runs, and it still commits.
    settleYearTurn(h);
    expect(h.scene.save.year, "the year turn did not commit").toBe(balance.clock.startYear + 1);
  });

  it("away from the boundary: the very same wipe DOES hand the beat to the box", () => {
    /*
     * THE OTHER DIRECTION, and the test above is worth nothing without it: "no dialogue was
     * launched" passes trivially against a scene that never plays the blackout beat at all.
     */
    const node = AWAY;
    const h = mount({ save: wipedAt(node!.id, 0) });
    withDialogueBox(h);

    h.scene.recoverFromBlackout();

    expect(
      h.parts.launches.filter((l) => l.key === SCENE_KEYS.yearTurn),
      "the rig turned a year it was not supposed to reach",
    ).toHaveLength(0);
    expect(boxed(h), "the blackout beat was not played").toEqual([BLACKOUT_ENTRY_ID]);
    expect(h.parts.paused, "the beat did not take the screen").toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §17.5 A YEAR THAT TURNS INDOORS LEAVES THE ROOM'S NOTE ON SCREEN
 *
 * `handleClockEvents` wrote the TOWN's map note over `lastNote` on every `yearBegin`, spelled out
 * a second time rather than asked of `viewNote()` — the one reader that knows about rooms. Outdoors
 * the two are the same string, which is why it went unseen; indoors the provenance line started
 * describing a map that is not on screen. It is reachable because the inn's own [R] is the one
 * action a room affords, which is the same key §17.3 is about.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§17.5 the year turn does not overwrite the room's provenance line with the town's", () => {
  it("resting in the inn across the year boundary leaves the HUD describing the ROOM", () => {
    const inn = ROOMS.find(isTheInn);
    expect(inn, "no shipped room is an inn — this section cannot be set up").toBeDefined();
    const bp = inn!;
    /*
     * MOUNTED INSIDE, through `save.interiorId` — `init` → `adoptInterior` is the shipped reload
     * path into a room, and it is used here rather than `goInside` because the walk to the door
     * spends foray ticks and this test needs the clock parked exactly on the boundary.
     */
    const base = saveAtTown(bp);
    const h = mount({
      save: {
        ...base,
        interiorId: bp.id,
        tick: balance.clock.ticksPerYear - balance.clock.innTicks,
      },
      startNode: bp.parentNode,
    });
    expect(h.scene.currentInterior()?.id, "the save did not put the player inside the room").toBe(bp.id);

    // The room's note, as it reads before anything has happened. Both branches of `viewNote` —
    // painted and footprint — carry this, so a painting landing tomorrow does not break the test.
    const roomNote = `interior ${bp.id} —`;
    expect(h.hud(), "the HUD is not describing the room to begin with").toContain(roomNote);

    const yearBefore = h.scene.save.year;
    h.press(KEY_R);
    frameAndSettle(h);

    expect(h.scene.save.year, "the rest did not turn the year — the rig missed the boundary").toBe(yearBefore + 1);
    expect(h.scene.currentInterior()?.id, "the year turn walked the player out of the room").toBe(bp.id);
    expect(h.hud(), "the year turn overwrote the room's note with the town's map").toContain(roomNote);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §17.6 THE OVERWORLD IS STILL PLAYABLE ON THE OTHER SIDE OF A WIPE
 *
 * ⚠ WHAT WAS TRUE BEFORE, AND IT ENDED EVERY RUN A PARTY WIPE HAPPENED IN. `playEntry` launched
 * the chained beat from INSIDE the closing box's `onDone`, and `game/scenes/DialogueScene.ts`
 * `finish()` runs `this.onDone(state)` and THEN `this.scene.stop()`. Phaser applies `ScenePlugin`
 * calls as an ordered queue, so the ops for one wipe came out:
 *
 *     resume(Overworld) · stop(Dialogue) · start(Dialogue, the innkeeper) · pause(Overworld)
 *                                                                       · stop(Dialogue)
 *
 * — the innkeeper's box shut down the frame it opened, and the overworld left PAUSED with nothing
 * alive to resume it. Measured in a browser on all three routes into a wipe (wild, rival, gym):
 * the map still drew, the loop still stepped at ~110fps, and the arrows, [C], [E] and ESC were all
 * dead. No exception, no Phaser warning — `Systems.pause` only warns when it is asked to pause an
 * already-paused scene, and it never was: the pause was the LAST operation, not a second one.
 *
 * ⚠ WHY 2,900 GREEN TESTS DID NOT SEE IT, WHICH IS WHAT THESE ARE SHAPED AGAINST. The rig called
 * `scene.update()` whether or not the scene had been paused, and counted pauses and resumes rather
 * than tracking which came last — so the one symptom a softlock has could not be expressed here,
 * and a run ending `…resume, pause` read as balanced. Both halves are fixed in the stub (see
 * `FakeParts.active` and `answerBox`), and every assertion below is placed on the PLAYER's
 * observables: a key pressed after the beat, and the tile the player is standing on.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§17.6 the keys still work after a wipe", () => {
  /** The wake town of a wipe suffered where the player is standing. */
  function wakeOf(nodeId: string): string {
    return wakeNodeFor(nodeId, content);
  }

  /** A save standing at `nodeId` with nothing on its feet — the state a lost fight leaves. */
  function wipedAt(nodeId: string): SaveEnvelope {
    const base = freshSave(nodeId);
    return { ...base, party: base.party.map((c) => ({ ...c, curHp: 0 })) };
  }

  /**
   * Play the whole wipe out through the BOX — every beat answered the way `DialogueScene` answers
   * one — and report the entries the player read, in order.
   *
   * Bounded, and the bound is what makes a chain that never ends a red rather than a hang.
   */
  function playTheWipeOut(h: Harness): string[] {
    const read: string[] = [];
    for (let guard = 0; guard < 8 && h.scene.isSpeaking(); guard += 1) read.push(answerBox(h));
    expect(h.scene.isSpeaking(), `the beat chain never closed: ${read.join(" → ")}`).toBe(false);
    return read;
  }

  /** The one rectangle that covers the whole virtual screen — the blackout curtain, or none. */
  function curtain(h: Harness): FakeObj | undefined {
    return h.parts.objects.find(
      (o) =>
        o.kind === "rect" &&
        o.rectW === balance.map.virtualWidth &&
        o.rectH === balance.map.virtualHeight,
    );
  }

  it("the arrow keys move the player again once the last beat closes", () => {
    /*
     * THE SOFTLOCK TEST. Not "is some flag false" — the flag was fine. The scene was PAUSED, which
     * in Phaser means `update()` is never called and the InputPlugin is disarmed, so the only
     * question that could have caught this is the one the player asked: does a key still do
     * anything. `Harness.frame` refuses to step a paused scene for exactly that reason.
     */
    const h = mount({ save: wipedAt(SLICE_NODE) });
    withDialogueBox(h);

    h.scene.recoverFromBlackout();
    const read = playTheWipeOut(h);
    // The beat really happened — without this the assertions below pass against a wipe that said
    // nothing at all, which is the OTHER way this could go wrong.
    expect(read[0], `the blackout beat was not played: ${read.join(" → ")}`).toBe(BLACKOUT_ENTRY_ID);

    expect(h.parts.active, "the overworld was left paused with nothing able to resume it").toBe(true);
    const before = { ...h.scene.movement.tile };
    const stepped = walk(h, 1);
    expect(stepped, "the arrow keys did nothing after the wipe").toBe(1);
    expect(h.scene.movement.tile, "the player did not move").not.toEqual(before);
  });

  it("…and so does a key that is not a direction: [C] still draws the collision overlay", () => {
    /*
     * A SECOND KEY, ON A DIFFERENT PATH. Movement is polled through `cursors`; [C] is an `addKey`
     * handle read with `JustDown` at the top of `update`. Both were dead in the browser, and a
     * fix that resumed the scene without giving it a frame would revive neither.
     */
    const h = mount({ save: wipedAt(SLICE_NODE) });
    withDialogueBox(h);
    const overlay = (): FakeObj | undefined => h.parts.objects.find((o) => o.kind === "graphics");
    expect(overlay()?.visible, "the overlay was already on before the wipe").toBe(false);

    h.scene.recoverFromBlackout();
    playTheWipeOut(h);

    h.press(67);
    h.frame();
    expect(overlay()?.visible, "[C] was dead after the wipe").toBe(true);
  });

  it("the innkeeper's beat reaches the box — the chain is not shut down by the beat before it", () => {
    /*
     * THE MECHANISM, NAMED. `boxed` is every entry HANDED to the box; `sceneStatus` is whether the
     * box is still running. Before the fix the innkeeper's entry appeared in the first list and the
     * second said "shutdown" in the same instant: the launch was undone by the closing box's own
     * `scene.stop()`, so the player read the narration and then nothing, ever again.
     */
    const h = mount({ save: wipedAt(SLICE_NODE) });
    withDialogueBox(h);
    const rest = restBeatAt(wakeOf(SLICE_NODE), h.scene.dialogueCtx());
    expect(rest, `no innkeeper speaks at ${wakeOf(SLICE_NODE)} — this test cannot be set up`).toBeDefined();

    h.scene.recoverFromBlackout();
    expect(boxed(h).at(-1)).toBe(BLACKOUT_ENTRY_ID);
    expect(boxIsUp(h), "the blackout beat was launched and shut down in the same breath").toBe(true);

    answerBox(h);
    expect(boxed(h).at(-1), "the innkeeper's beat never reached the box").toBe(rest!.id);
    expect(boxIsUp(h), "the innkeeper's box was shut down the frame it opened").toBe(true);
    expect(h.scene.isSpeaking(), "the scene does not think anybody is speaking").toBe(true);
  });

  it("the blackout beat is read against a BLACK SCREEN, and the map comes back with the keys", () => {
    /*
     * T-29, verbatim: "a dialogue shows up with a black background saying you passed out". What
     * shipped was the ordinary box over the LIVE MAP — the town, its props and sixteen lines of
     * debug HUD all still legible behind the narration. The curtain is asserted as a SHAPE and a
     * DEPTH rather than as an object count, because `game/ui/SeasonMeter.ts` builds one rectangle
     * per tick of the year on this very screen.
     */
    const h = mount({ save: wipedAt(SLICE_NODE) });
    withDialogueBox(h);
    expect(curtain(h), "something blacked the screen out before the wipe").toBeUndefined();

    h.scene.recoverFromBlackout();
    const drawn = curtain(h);
    expect(drawn, "the blackout beat drew no black screen").toBeDefined();
    expect(drawn?.fillColor, "the curtain is not the palette's `void`").toBe(roleColor("void"));
    expect(
      Number(drawn?.depth),
      "the curtain is drawn under the HUD, which leaves the diagnostics legible on a black screen",
    ).toBeGreaterThan(100);

    // IT STAYS UP FOR THE WHOLE CHAIN. The narration hands straight on to the innkeeper, and a
    // screen that flashed the map back between the two would drop the black mid-sentence.
    answerBox(h);
    expect(curtain(h), "the black screen went out between the two halves of the beat").toBeDefined();

    playTheWipeOut(h);
    expect(curtain(h), "the black screen outlived the beat it was raised for").toBeUndefined();
  });

  it("the wake is INTO the inn, not onto the tile they fell on", () => {
    /*
     * THE OTHER HALF OF T-29 — "and then you wake up at the inn". `wakeNodeFor` answers the TOWN,
     * and at a wipe suffered in a town that keeps an inn that town is the one they were already
     * standing in, so step 2 was the identity: traced in a browser at tile 18,29 before the fight
     * and 18,29 after the whole recovery, with the inn door at 18,24 and its interior never
     * entered, while the prose described a ceiling with a beam across it.
     */
    const room = INTERIORS.find(isTheInn);
    expect(room, "no shipped room is an inn — this test cannot be set up").toBeDefined();
    const town = room!.parentNode;
    // The premise: a wipe HERE wakes HERE, so nothing but the room can account for the move.
    expect(wakeOf(town), "this town is not its own wake node — the test would prove the node move").toBe(town);

    const h = mount({ save: wipedAt(town) });
    withDialogueBox(h);
    expect(h.scene.currentInterior(), "the rig started indoors").toBeNull();

    h.scene.recoverFromBlackout();
    playTheWipeOut(h);

    expect(h.scene.currentInterior()?.id, "the wipe left the player standing where they fell").toBe(room!.id);
    expect(h.scene.save.interiorId, "the save does not agree with the scene about the room").toBe(room!.id);
    // …and they can walk out of it, which is the only thing that makes waking inside one legal.
    stepOutside(h);
    expect(h.scene.save.currentNode, "walking out did not put them back in the town").toBe(town);
  });

  it("a wake town that ships no interior leaves the player outdoors rather than nowhere", () => {
    /*
     * THE DEGRADATION, ASSERTED. `data/interiors/` ships two towns' rooms and `core/recovery.ts`
     * names five inn towns, so three of the five have no inn to wake into. That is a content gap
     * and not this scene's to close by inventing a room (G2) — but a silent one would be a wipe
     * that put the player in a room that does not exist. It degrades to the node, exactly as it
     * behaved before the room was entered at all.
     */
    const roomless = innNodeIds().filter((id) => !INTERIORS.some((bp) => bp.parentNode === id));
    expect(roomless, "every inn town ships a room now — delete this test, it asserts nothing").not.toHaveLength(0);
    const town = roomless[0]!;
    expect(wakeOf(town)).toBe(town);

    const h = mount({ save: wipedAt(town) });
    withDialogueBox(h);
    h.scene.recoverFromBlackout();
    playTheWipeOut(h);

    expect(h.scene.currentInterior(), `${town} ships no room and the wake claimed one anyway`).toBeNull();
    expect(h.scene.save.currentNode).toBe(town);
    expect(h.parts.active, "the overworld was left paused at a town with no inn room").toBe(true);
    expect(walk(h, 1), "the arrow keys did nothing after a wipe at a town with no inn room").toBe(1);
  });

  it("a wipe LOST TO THE LEADER ends the same way — the whole path, fought", () => {
    /*
     * ⚠ THE END-TO-END ONE, and it is a different path into the same recovery: the gym's answer is
     * a `battle-loss` beat, so `recoverFromBlackout` runs as ITS continuation — a chained
     * `playEntry` from inside a chained `playEntry`, which is where the ordering hazard is worst.
     * The browser trace lost this fight for real and found the overworld dead afterwards.
     */
    const first = LADDER[0]!;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    withDialogueBox(h);

    h.press(KEY_G);
    h.frame();
    expect(answerBox(h), "the leader did not speak").toBe(`${first.id}.pre`);
    const battle = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
    expect(battle, "the leader spoke and no fight started").toBeDefined();
    const data = battle!.data as BattleSceneData;
    data.onFinished({ state: settledState(data, "loss"), caught: null });

    expect(answerBox(h), "the leader did not answer the loss").toBe(`${first.id}.post.loss`);
    const read = playTheWipeOut(h);
    expect(read, "the black screen never followed her line").toContain(BLACKOUT_ENTRY_ID);

    expect(h.parts.active, "the overworld was left paused after a lost gym battle").toBe(true);
    expect(curtain(h), "the black screen outlived the beat").toBeUndefined();
    expect(walk(h, 1), "the arrow keys did nothing after a lost gym battle").toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §18 [X] READS ITS REASON, AND THE HUD LINE READS THE SAME ONE
 *
 * ⚠ WHAT WAS TRUE BEFORE. Both halves of the release verb — the banner the key prints when it
 * refuses, and the HUD line that advertises the key — spelled ONE sentence out by hand, and it was
 * the wrong sentence for the state the never-cut Legacy beat produces. `core/lifecycle.ts` puts a
 * starter-line heir at the BOX TAIL when its parent retired out of the box; the starter lines carry
 * the `"starter"` habitat sentinel, so they appear in NO node's populations; and `applyRelease`
 * throws for a line the node has no count for (Hard Req 2 makes it a real move of a real number).
 * So after the retirement, [X] at the marsh offered back a creature the ecosim refused — at
 * *Restock the Shallows*, the quest that INTRODUCES the verb. `game/quests.ts` `releaseRefusal`
 * answers that question now, and BOTH sites read it rather than restating it.
 *
 * ⚠ WHY NOTHING CAUGHT IT, WHICH IS WHAT THIS SECTION IS SHAPED AGAINST. [X] had never been pressed
 * in this file at all — measured by sabotage rather than assumed: the key's banner was replaced with
 * a literal `SABOTAGE-WRONG-REASON` and every test here still passed. `releaseRefusal` has its own
 * unit tests (`tests/unit/quests.test.ts` §14) and they are not the gap; what had no witness of any
 * kind was the SCENE reaching them. That is the whole subject below, so every assertion here is
 * placed on an OBSERVABLE of the running scene — the banner it wrote and the HUD line it rendered —
 * and never on a second call to the function under test.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The starter line the run is handed, read from the data (G2).
 *
 * It is what makes the second refusal reachable: bible §4 rows 1–3 are "not wild-spawning", spelled
 * in the data as the `"starter"` habitat sentinel, so a starter-line creature has a count at no
 * shipped node — and the Legacy beat puts exactly one of them in the box.
 */
function starterLine(): SpeciesLine {
  const line = starterLines(content)[0];
  if (!line) throw new Error("data ships no starter line — §18's Legacy fixture cannot be built");
  return line;
}

/** An owned creature of a shipped line, built by `core/lifecycle.ts`'s own constructor (G2/G11). */
function boxedCreature(uid: string, lineId: string): OwnedCreature {
  const line = content.species.find((s) => s.id === lineId);
  if (!line) throw new Error(`no species line "${lineId}"`);
  return newOwnedCreature(
    {
      uid,
      lineId,
      age: "J",
      level: balance.xp.starterLevel,
      caughtYear: balance.clock.startYear,
      boxed: true,
    },
    line,
    balance,
  );
}

/**
 * The save the never-cut Legacy beat leaves behind, standing at `nodeId`: a starter-line heir in the
 * BOX, and the party the run started with.
 *
 * Built with the constructor `core/lifecycle.ts` `applyRetirementChoice` builds it with — same
 * `newOwnedCreature`, same `boxed: true`, same push onto `save.box` — rather than fought for over
 * three year turns. That the year turn really produces this shape is `core/lifecycle.ts`'s own
 * tests' to prove; what is under test HERE is what the overworld does when handed it.
 */
function withBoxedHeir(nodeId: string): SaveEnvelope {
  const base = freshSave(nodeId);
  return { ...base, box: [boxedCreature("legacy-heir", starterLine().id)] };
}

/**
 * Every text object the action REWROTE — the banner, identified by what changed rather than by
 * creation order.
 *
 * ⚠ `h.hud()` JOINS EVERY TEXT OBJECT, INCLUDING THE BANNER, so a `toContain` there cannot tell the
 * HUD's own advertisement from the banner echo of the same sentence. §18.3 is precisely the
 * assertion that those two agree, and it would be worth nothing if it could not tell them apart.
 * Objects created DURING the action are ignored: a fresh object has no "before" to have changed from.
 */
function saidBy(h: Harness, act: () => void): string[] {
  const before = new Map(h.parts.objects.filter((o) => o.kind === "text").map((o) => [o, o.text] as const));
  act();
  return h.parts.objects
    .filter((o) => o.kind === "text" && before.has(o) && before.get(o) !== o.text)
    .map((o) => o.text);
}

/** The HUD's `[X]` line as it reads RIGHT NOW — the advertisement, with no banner mixed into it. */
function releaseLine(h: Harness): string {
  const line = h.hud().split("\n").find((l) => l.startsWith("[X] "));
  expect(line, "the HUD has no [X] line at all — the release verb is not advertised").toBeDefined();
  return line as string;
}

/** The node's live count for a line, off the SAVE — which is the number the verb moves. */
function countAt(h: Harness, nodeId: string, lineId: string): number {
  const pop = h.scene.save.nodeStates[nodeId]?.populations[lineId];
  if (!pop) throw new Error(`the save carries no count for "${lineId}" at "${nodeId}"`);
  return pop.count;
}

/**
 * A line one shipped node carries and another does not, with both node ids — the pair that makes
 * "which node did [X] ask about" a question with two different answers. Derived, never typed in.
 */
function twoNodesThatDisagree(): { lineId: string; here: string; elsewhere: string } {
  const here = SLICE_NODE;
  const state = freshSave(here).nodeStates[here];
  if (!state) throw new Error(`a fresh save carries no state for ${here}`);
  const lineId = Object.keys(state.populations)[0];
  if (lineId === undefined) throw new Error(`${here} ships no populations`);
  const away = content.nodes.find((n) => n.id !== here && n.populations[lineId] === undefined);
  if (!away) throw new Error(`every shipped node carries "${lineId}" — the two readings cannot differ`);
  return { lineId, here, elsewhere: away.id };
}

describe("§18 [X] reads game/quests.ts releaseRefusal — the key and the line that advertises it", () => {
  it("the Legacy beat's refusal reaches the banner at every shipped node, and nothing moves", () => {
    /*
     * THE LOOP IS THE TEST, on §17.3's terms: the sentence NAMES the node, so driving one fixture
     * would leave "the node is interpolated at all" unwitnessed. Every shipped node, because the
     * boxed heir is a state the player carries with them and the verb is refused at all twelve.
     */
    const seen: string[] = [];
    for (const node of content.nodes) {
      const h = mount({ save: withBoxedHeir(node.id) });
      expect(h.scene.node.id, `${node.id}: the harness did not start where it was asked to`).toBe(node.id);
      // Without this a refusal could be `isHandedOver()`'s rather than the one under test.
      expect(h.scene.isHandedOver(), `${node.id}: something else had the screen before [X]`).toBe(false);

      // THE RIG FIRST — the held stock really is stock this node has no count for, and it really is
      // in the box, which is the half that tells this refusal from the empty-party one.
      const populations = h.scene.save.nodeStates[node.id]?.populations;
      expect(populations, `${node.id}: the save carries no state, so the verb cannot be asked`).toBeDefined();
      expect(
        populations?.[starterLine().id],
        `${node.id} spawns the starter line, so the Legacy refusal is not reachable there`,
      ).toBeUndefined();
      expect(h.scene.save.box, `${node.id}: the heir is not in the box`).toHaveLength(1);

      const sentence = `no release: nothing in the party or the box has a count at "${node.id}"`;
      // 1. THE ADVERTISEMENT, read before anything has fired a banner.
      expect(releaseLine(h), `${node.id}: the HUD does not say why [X] would refuse`).toBe(`[X] ${sentence}`);

      const heldBefore = JSON.stringify([h.scene.save.party, h.scene.save.box]);
      const statesBefore = JSON.stringify(h.scene.save.nodeStates);
      const logBefore = h.scene.save.actionLog.length;

      const said = saidBy(h, () => {
        h.press(KEY_X);
        frameAndSettle(h);
      });

      /*
       * 2. THE BANNER, AND THE THREE THINGS THAT MUST NOT HAVE HAPPENED. A fix that only reworded
       *    the banner would still hand the creature over; one that only stopped the hand-over would
       *    still write the tape, and an entry written for a release that did not happen is a save
       *    `core/save.ts` `replay` reproduces differently from the run that wrote it (L10).
       */
      expect(said, `${node.id}: [X] refused silently`).toContain(sentence);
      expect(said, `${node.id}: [X] wrote something besides the refusal`).toHaveLength(1);
      expect(
        JSON.stringify([h.scene.save.party, h.scene.save.box]),
        `${node.id}: a refused release still took the creature`,
      ).toBe(heldBefore);
      expect(
        JSON.stringify(h.scene.save.nodeStates),
        `${node.id}: a refused release still moved a count`,
      ).toBe(statesBefore);
      expect(
        h.scene.save.actionLog.length - logBefore,
        `${node.id}: an entry reached the tape for a refused release`,
      ).toBe(0);
      seen.push(node.id);
    }
    expect(seen, "the corpus ships no nodes — this loop asserted nothing").not.toHaveLength(0);
  });

  it("the OTHER refusal still reaches the banner — one sentence for both cases cannot pass here", () => {
    /*
     * The empty-party branch, and it is the reason this is a separate case: `releaseRefusal`
     * distinguishes two states that the scene used to conflate, so a "fix" that always emitted the
     * node sentence would pass §18.1 above and fail here. A brand-new save IS this state — one
     * creature in the party, nothing in the box — so nothing is fabricated for it.
     */
    const h = mount();
    expect(h.scene.save.box, "the fixture boxed something, so this is the wrong branch").toHaveLength(0);
    expect(h.scene.save.party, "the empty-party branch needs a party of exactly one").toHaveLength(1);

    const sentence = `no release: the party would be empty`;
    const other = `no release: nothing in the party or the box has a count at "${h.scene.node.id}"`;
    expect(releaseLine(h), "the HUD does not say why [X] would refuse").toBe(`[X] ${sentence}`);

    const said = saidBy(h, () => {
      h.press(KEY_X);
      frameAndSettle(h);
    });

    expect(said, "[X] refused silently").toContain(sentence);
    expect(said, "both refusals collapsed back into one sentence").not.toContain(other);
    expect(h.scene.save.party, "the refusal emptied the party it exists to protect").toHaveLength(1);
  });

  it("the HUD advertises the SAME sentence the key prints, with no literal standing between them", () => {
    /*
     * ⚠ THE ASSERTION THAT PINS THE TWO READERS TOGETHER, and the only one here with no sentence
     * written into it: the HUD line is read BEFORE anything fires a banner, the banner is read as
     * the text the press REWROTE, and the two are compared to each other. It survives a rewording
     * of either sentence and fails the moment the two sites stop coming from one reader.
     *
     * Both refusing shapes, so this is not one state asserted twice.
     */
    const cases: Array<{ what: string; make: () => Harness }> = [
      { what: "an empty box and a party of one", make: () => mount() },
      {
        what: "the Legacy beat's boxed heir",
        make: () => mount({ save: withBoxedHeir(SLICE_NODE) }),
      },
    ];
    for (const { what, make } of cases) {
      const h = make();
      const advertised = releaseLine(h);
      expect(advertised, `${what}: the HUD is not refusing to begin with`).toContain("no release");

      const said = saidBy(h, () => {
        h.press(KEY_X);
        frameAndSettle(h);
      });

      expect(said, `${what}: the key wrote nothing, or wrote more than the banner`).toHaveLength(1);
      expect(`[X] ${String(said[0])}`, `${what}: the HUD and the key have drifted apart`).toBe(advertised);
    }
  });

  it("THE CONTROL — where release IS available the HUD offers it by name and [X] moves a real count", () => {
    /*
     * ⚠ WITHOUT THIS THE THREE CASES ABOVE PASS ON A SCENE WHERE [X] NEVER WORKS. Every one of them
     * asserts a refusal; a `releaseCandidate` hard-wired to `null` satisfies all three. This is the
     * state the other three are the complement of — a boxed creature of a line that DOES live where
     * the player is standing — and it is asserted all the way to the number, because the release is
     * the only thing that proves the verb was live rather than merely quiet.
     */
    const { lineId, here } = twoNodesThatDisagree();
    const base = freshSave(here);
    const h = mount({ save: { ...base, box: [boxedCreature("boxed-local", lineId)] } });
    const pop = h.scene.save.nodeStates[here]?.populations[lineId];
    expect(pop, `the save carries no count for "${lineId}" at ${here}`).toBeDefined();
    expect(
      pop?.count,
      `${lineId} is already at carrying capacity at ${here} — a release cannot move it`,
    ).toBeLessThan(pop?.carryCap ?? 0);

    // 1. THE ADVERTISEMENT names the creature, and carries no refusal at all.
    expect(releaseLine(h), "the HUD does not offer the release that is available").toBe(
      `[X] release ${lineId} here`,
    );
    expect(releaseLine(h), "the HUD refuses in a state where the verb is live").not.toContain("no release");

    const before = countAt(h, here, lineId);
    const said = saidBy(h, () => {
      h.press(KEY_X);
      frameAndSettle(h);
    });

    // 2. …AND THE KEY DID IT: a real count moved, the creature left the box, and the banner is
    //    identifiers and two integers (G7).
    const after = countAt(h, here, lineId);
    expect(after, "the release did not move the node's real count").toBe(before + 1);
    expect(h.scene.save.box, "the released creature is still held").toHaveLength(0);
    expect(said, "the release was silent").toContain(
      `released ${lineId} at ${here} — ${String(before)} → ${String(after)}`,
    );
  });

  it("BINDS — both sites ask about the node the player is STANDING IN, not the one the save names", () => {
    /*
     * ⚠ THE DIVERGENCE IS FABRICATED, AND IT HAS TO BE — SAY SO RATHER THAN IMPLY OTHERWISE.
     * `enterNode` writes `this.node` and `save.currentNode` in the same breath, and its own comment
     * calls the half-swapped state a hazard the scene exists to prevent; `init` rewrites
     * `save.currentNode` to `startNode` when a mount asks for one. So the game cannot produce two
     * different answers here, and with the two fields equal an argument that was dropped reads
     * IDENTICALLY at every node in the corpus.
     *
     * What this pins is therefore not a reachable behaviour but WHICH field the two call sites read
     * — `releaseCandidate(this.save, this.node.id)` and `releaseRefusal(this.save, this.node.id)`,
     * where both functions default to `save.currentNode` when the argument is omitted. The save is
     * written directly, the way §13 writes one, and the frame after the write is what re-renders the
     * HUD (`hudDirty` is still set from `create`).
     *
     * Both directions, because they fail differently: dropping the argument turns direction 1 into a
     * refusal at a node the player is not in, and direction 2 into a population WRITE at one.
     */
    const { lineId, here, elsewhere } = twoNodesThatDisagree();

    // Direction 1 — standing where the line lives, save naming where it does not.
    const a = mount({ save: { ...freshSave(here), box: [boxedCreature("boxed-local", lineId)] } });
    a.scene.save = { ...a.scene.save, currentNode: elsewhere };
    a.frame();
    expect(a.scene.node.id, "the rig moved the player instead of only the save").toBe(here);
    expect(releaseLine(a), "the HUD answered for the node the SAVE names").toBe(`[X] release ${lineId} here`);

    const beforeA = countAt(a, here, lineId);
    const saidA = saidBy(a, () => {
      a.press(KEY_X);
      frameAndSettle(a);
    });
    expect(countAt(a, here, lineId), "the release did not land in the node the player is standing in").toBe(
      beforeA + 1,
    );
    expect(saidA, "the key answered for the node the SAVE names").toContain(
      `released ${lineId} at ${here} — ${String(beforeA)} → ${String(beforeA + 1)}`,
    );

    // Direction 2 — the mirror: standing where the line does NOT live, save naming where it does.
    const b = mount({ save: { ...freshSave(elsewhere), box: [boxedCreature("boxed-local", lineId)] } });
    b.scene.save = { ...b.scene.save, currentNode: here };
    b.frame();
    expect(b.scene.node.id, "the rig moved the player instead of only the save").toBe(elsewhere);

    const sentence = `no release: nothing in the party or the box has a count at "${elsewhere}"`;
    expect(releaseLine(b), "the HUD offered a release at a node the player is not standing in").toBe(
      `[X] ${sentence}`,
    );

    const beforeB = countAt(b, here, lineId);
    const saidB = saidBy(b, () => {
      b.press(KEY_X);
      frameAndSettle(b);
    });
    expect(saidB, "the key answered for the node the SAVE names").toContain(sentence);
    expect(countAt(b, here, lineId), "a count moved at a node the player is not standing in").toBe(beforeB);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §19 the trainer's purse is levied EXACTLY ONCE — counted by EXECUTION, not by source text
 * ════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS SECTION EXISTS, AND WHAT IT IS NOT A SECOND COPY OF.
 *
 * `game/wild-battle.ts` `applyBattleResult` is the one place a beaten trainer's purse is levied,
 * and it is deliberately NOT idempotent — `tests/unit/trainer-payout.test.ts` §5 says so in its own
 * title: "calling it twice pays twice — so 'once' is a property of the WIRING". Two gates already
 * guard that wiring, and BOTH OF THEM READ CHARACTERS:
 *
 *   • trainer-payout §5 brace-matches `game/scenes/OverworldScene.ts` and counts four
 *     `applyBattleResult(` calls, each supplying the balance — so a FIFTH written call is red;
 *   • trainer-payout §5 and economy-wiring §5 count the payout entries ONE call appends — so a
 *     second levy written inside `applyBattleResult` itself is red.
 *
 * Neither can see a call site written once and EXECUTED twice: a finish handler bound to two
 * events, a retry, a second levy hung off the post-battle beat. A parse of a file's characters has
 * no execution count in it. So every test below RUNS the shipping scene, hands the launcher's own
 * `onFinished` a fight the real reducer could have produced, and then reads `save.money` and the
 * tape the scene wrote.
 *
 * WHAT MAKES THE READING TRUSTWORTHY. `core/save.ts` `applyPayout` is the only writer of `money` in
 * the repo, and `game/scenes/OverworldScene.ts` does not contain the word `money` at all — so a
 * purse that moved here moved through production's own levy, and a purse that moved twice is two
 * levies. Every expected amount is derived from `data/balance.json` and the levels the fight
 * actually fielded (G11); no test below types a number.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Every purse on the tape, in order. `readPayout` is the reader `core/save.ts` `replay` uses. */
function pursesOn(save: SaveEnvelope): number[] {
  const paid: number[] = [];
  for (const entry of save.actionLog) {
    const amount = readPayout(entry.action);
    if (amount !== null) paid.push(amount);
  }
  return paid;
}

/**
 * The levels the LOSING side actually fielded.
 *
 * `enemyOrder` and not a filter of `battlers` on side, for `trainerPurse`'s own reason: a creature
 * caught during a fight is in `battlers` too, and the roster the loser fielded is what is priced.
 */
function enemyLevelsOf(state: BattleSceneState): number[] {
  const levels: number[] = [];
  for (const uid of state.enemyOrder) {
    const battler = state.battlers[uid];
    if (battler) levels.push(battler.level);
  }
  return levels;
}

/** What one beaten roster is worth — the balance's rate against the levels, never a literal (G11). */
function purseFor(state: BattleSceneState): number {
  return trainerPayout(enemyLevelsOf(state), balance);
}

/** A fight the scene has opened and nobody has answered yet, with a sentence naming it. */
interface OpenedFight {
  h: Harness;
  data: BattleSceneData;
  where: string;
}

/**
 * Walk onto the route bible §8's rival stands on and close his pre-battle box — §10.6's own route
 * to a trainer fight, so what is measured afterwards is the shipping launcher and not a rig.
 */
async function openTheRivalsFight(): Promise<OpenedFight> {
  const first = LADDER[0]!;
  const row = content.rival.find((r) => r.act === first.act);
  expect(row, `data/gyms.json ships no rival for act ${String(first.act)} — §19 has no trainer to beat`).toBeDefined();
  const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
  withDialogueBox(h);
  await h.scene.travelTo(row!.node);
  expect(boxIsUp(h), `arriving at ${row!.node} opened no beat, so no rival fight can follow`).toBe(true);
  answerBox(h);
  const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
  expect(launch, `closing ${row!.id}'s pre-battle box at ${row!.node} started no fight`).toBeDefined();
  const data = launch!.data as BattleSceneData;
  expect(data.input.kind, "the rival's fight is not the trainer kind the purse is priced for").toBe("trainer");
  return { h, data, where: `${row!.id}, fought on ${row!.node}` };
}

/** Open a fight of a kind that owes NOTHING, so the four kinds can be checked side by side. */
function unpaidFight(kind: "wild" | "gym" | "ancient"): OpenedFight {
  if (kind === "wild") {
    const h = mount();
    const data = walkIntoABattle(h);
    return { h, data, where: `a wild encounter at ${data.input.nodeId}` };
  }
  if (kind === "gym") {
    const first = LADDER[0]!;
    const h = mount({ save: { ...freshSave(first.town), currentNode: first.town } });
    withDialogueBox(h);
    h.press(KEY_G);
    h.frame();
    answerBox(h); // the leader's pre-battle line; the fight starts when the box closes
    const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
    expect(launch, `[G] at ${first.town} started no gym fight`).toBeDefined();
    return { h, data: launch!.data as BattleSceneData, where: `${first.id} at ${first.town}` };
  }
  const run = playSlowRun();
  const h = mount({ save: { ...run.save, questFlags: { ...run.save.questFlags } } }, registerBox);
  answerBox(h, () => 0); // "Set the snare." — the ring's own first choice
  const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.battle).pop();
  expect(launch, "setting the snare at the ring opened no fight").toBeDefined();
  return {
    h,
    data: launch!.data as BattleSceneData,
    where: `the Ancient at ${balance.encounter.finaleGatedNode}`,
  };
}

describe("§19 the trainer's purse is levied exactly once, by the running game", () => {
  it("THE RIG'S OWN PRICE is the balance's price — trainerPayoutFlat + Σ enemy levels × trainerPayoutPerLevel", async () => {
    /*
     * Asserted before anything is spent, because every test below compares against `purseFor`. If
     * that helper and `data/balance.json` ever disagreed, a doubled levy could still land on the
     * "expected" number and the whole section would pass while the game paid twice.
     */
    const { data, where } = await openTheRivalsFight();
    const state = settledState(data, "win");
    const levels = enemyLevelsOf(state);
    expect(levels.length, `${where} fielded nobody — there is no roster to price`).toBeGreaterThan(0);

    // Both halves of the purse, neither taken on trust: zero either and the arithmetic below would
    // hold over nothing. `balance.economy._trainerPayout` records why the flat half exists.
    const flat = balance.economy.trainerPayoutFlat;
    const rate = balance.economy.trainerPayoutPerLevel;
    expect(flat, "the flat per-fight fee is zero — the purse's flat half proves nothing").toBeGreaterThan(0);
    expect(rate, "the per-level rate is zero — the purse's per-level half proves nothing").toBeGreaterThan(0);

    const summed = levels.reduce((a, b) => a + b, 0);
    expect(purseFor(state), `${where}: the price and the balance's own arithmetic disagree`).toBe(
      Math.round(flat + rate * summed),
    );
    // The flat half really is levied by what the scene will pay from, not only by the primitive's
    // own tests: a purse reverted to `rate × Σ` lands short by exactly the fee and fails here.
    expect(
      purseFor(state),
      `${where}: the price is the per-level half alone — the flat per-fight fee is missing`,
    ).not.toBe(Math.round(rate * summed));
    expect(
      purseFor(state),
      `${where} prices at nothing — every "the purse moved" assertion in §19 would be vacuous`,
    ).toBeGreaterThan(0);
  });

  it("⚠ A RIVAL BEATEN pays ONE purse — on the save and on the tape, for one finished fight", async () => {
    /*
     * THE ASSERTION THE SOURCE-TEXT GATES CANNOT MAKE. One fight is handed back exactly once; what
     * is counted is what the SCENE then did. A launcher whose levy runs twice — a duplicated line,
     * a re-entrant handler, a retry — moves `money` by twice the roster's price and puts two
     * entries on the tape, and both halves of that are read below.
     */
    const { h, data, where } = await openTheRivalsFight();
    const state = settledState(data, "win");
    const owed = purseFor(state);
    const moneyBefore = h.scene.save.money;
    const pursesBefore = pursesOn(h.scene.save).length;

    data.onFinished({ state, caught: null });

    const paid = h.scene.save.money - moneyBefore;
    expect(
      paid,
      `${where}: ONE finished fight moved the purse by ${String(paid)}, and the roster it fielded ` +
        `(levels ${enemyLevelsOf(state).join(", ")}) prices at ${String(owed)}. ` +
        `${String(owed * 2)} means the levy ran twice for one fight; 0 means it did not run at all.`,
    ).toBe(owed);

    const written = pursesOn(h.scene.save).slice(pursesBefore);
    expect(
      written,
      `${where}: one finished fight wrote ${String(written.length)} payout entries on the tape ` +
        `(${written.join(", ") || "none"}). L10 wants exactly one, of ${String(owed)} — a second ` +
        `entry is a second levy, and a missing one is money the replay cannot reproduce.`,
    ).toEqual([owed]);

    // The two halves are one fact: what the tape says was paid IS what the save is holding.
    expect(
      written.reduce((a, b) => a + b, 0),
      `${where}: the save moved by ${String(paid)} and its own tape accounts for something else`,
    ).toBe(paid);
  });

  it("⚠ …and the BEAT THAT FOLLOWS the fight pays nothing more — the levy is bound to one event", async () => {
    /*
     * THE OTHER SHAPE OF "EXECUTED TWICE", and it is not the same test as the one above: a second
     * levy hung off the rival's post-battle line, or off the frame that reopens the overworld,
     * fires AFTER `onFinished` has returned and after the assertions above have already passed.
     * So the fight is finished, the win beat is answered the way a player answers it, the scene is
     * given frames to act on, and the purse is read again.
     */
    const { h, data, where } = await openTheRivalsFight();
    const state = settledState(data, "win");
    const owed = purseFor(state);
    const moneyBefore = h.scene.save.money;

    data.onFinished({ state, caught: null });
    const settled = h.scene.save.money;
    expect(
      settled - moneyBefore,
      `${where}: the fight itself paid ${String(settled - moneyBefore)} where its roster prices at ` +
        `${String(owed)} — the levy is already wrong at the finish handler, before the beat this ` +
        `test is about has played at all.`,
    ).toBe(owed);

    // The rival's own answer to a win — this is what writes `rival.act<N>.fought`.
    expect(boxIsUp(h), `${where}: winning opened no post-battle beat, so nothing follows to test`).toBe(true);
    answerBox(h);
    for (let i = 0; i < 3; i += 1) h.frame();

    expect(
      h.scene.save.money,
      `${where}: the purse moved again AFTER the fight was over — from ${String(settled)} to ` +
        `${String(h.scene.save.money)} while the post-battle beat played. The levy belongs to the ` +
        `finish handler and to nothing else.`,
    ).toBe(settled);
    expect(
      pursesOn(h.scene.save),
      `${where}: the tape grew a payout entry after the fight had already been paid for`,
    ).toEqual([owed]);
  });

  it("⚠ A RIVAL FIGHT LOST pays NOTHING — a purse follows a win and only a win", async () => {
    /*
     * `trainerPurse` gates on `outcome === "win"`, and a build that dropped that clause would pay
     * the player for being wiped. The loss is driven all the way through: the rival's loss line,
     * the blackout, and the innkeeper of the town the party woke in — all of which run inside the
     * same finish handler, and any of which could be where a stray levy lives.
     */
    const { h, data, where } = await openTheRivalsFight();
    const state = settledState(data, "loss");
    const moneyBefore = h.scene.save.money;

    data.onFinished({ state, caught: null });
    answerBox(h); // the rival's loss line
    expect(answerBox(h), `${where}: a wiped party did not black out`).toBe(BLACKOUT_ENTRY_ID);
    answerBox(h); // the innkeeper of the town the party woke in

    expect(
      h.scene.save.money,
      `${where}: losing paid the player ${String(h.scene.save.money - moneyBefore)}. A beaten ` +
        `trainer pays; a beaten PLAYER is paid by nobody.`,
    ).toBe(moneyBefore);
    expect(pursesOn(h.scene.save), `${where}: a lost fight put a payout entry on the tape`).toEqual([]);
  });

  it.each(["wild", "gym", "ancient"] as const)(
    "a %s fight pays NOTHING — bible §11's currency comes from trainer battles, and that is one kind",
    (kind) => {
      /*
       * The three kinds that are NOT the trainer, each driven to a WIN through its own shipping
       * launcher. A win rather than a loss on purpose: `trainerPurse` refuses on two conditions and
       * a fight the player lost would be refused by the outcome clause even if the kind clause were
       * gone, so only a WON non-trainer fight can see the kind check on its own.
       */
      const { h, data, where } = unpaidFight(kind);
      const state = settledState(data, "win");
      expect(state.kind, `${where} is not the ${kind} kind the launcher was asked for`).toBe(kind);
      const moneyBefore = h.scene.save.money;
      const pursesBefore = pursesOn(h.scene.save).length;

      data.onFinished({ state, caught: null });

      expect(
        h.scene.save.money - moneyBefore,
        `winning ${where} minted ${String(h.scene.save.money - moneyBefore)} — a ${kind} fight owes ` +
          `nothing, so this is currency the region has no source for.`,
      ).toBe(0);
      expect(
        pursesOn(h.scene.save).length - pursesBefore,
        `winning ${where} wrote a payout entry; a fight that owes nothing appends nothing`,
      ).toBe(0);
    },
  );

  it("A WHOLE PLAYED RUN of gym wins is worth nothing — five real fights, five real finish handlers", () => {
    /*
     * The execution count across a SESSION rather than across one fight. `playSlowRun` climbs the
     * whole ladder through `challengeGym` and answers every fight through the launcher's own
     * `onFinished`, so a levy that fired on the wrong kind — or fired twice — would have had five
     * separate chances to leave a mark on this save.
     */
    const run = playSlowRun();
    expect(LADDER.length, "the ladder is empty — this run fought nobody").toBeGreaterThan(0);
    expect(
      pursesOn(run.save),
      `a run of ${String(LADDER.length)} gym wins left ${String(pursesOn(run.save).length)} purses ` +
        `on the tape (${pursesOn(run.save).join(", ") || "none"}) — no gym owes one`,
    ).toEqual([]);
    expect(
      run.save.money,
      `a run of ${String(LADDER.length)} gym wins ended holding ${String(run.save.money)}`,
    ).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §20 THE ENCOUNTER MASK REACHES THE PLAYER
 *
 * Commit 3700b1d derived an encounter mask off the twelve committed layouts and taught
 * `game/encounters.ts` `rollForayStep` to honour a `ForayContext.footing`. NOTHING SUPPLIED ONE. In
 * the running game every step of every map still rolled the position-blind average — on the lane,
 * across the town square, through a building's footprint — while `tests/unit/encounter-mask.test.ts`
 * was green about the derivation. A green model is not a wired game (the reason
 * `tests/gates/reachability.test.ts` exists), so these tests are asked of the SCENE: they mount it,
 * stand the player on cells taken out of a shipped layout, and drive real frames.
 *
 * WHERE THE CELLS COME FROM. `tools/mapgen/layouts/<node>.txt`, read through core/foodweb.ts's own
 * `findLayoutGrid` — the parser `encounterMaskFromLayout` uses, never a second one — and picked as
 * the longest horizontal run of one authored character, two cells clear of the synthesised border so
 * the turn at each end stays on the map. Every cell of a chosen run is then checked against
 * `encounterMaskFor`, the very mask `OverworldScene.forayContext` hands the roll, so a fixture that
 * has drifted from the game's own answer fails as a fixture instead of passing as a test. On the
 * shipped tree the runs are:
 *
 *     hearthollow  ','  scrub               row 39, cols 21–26
 *     hearthollow  '.'  open-ground         row 47, cols 10–20
 *     hearthollow  ':'  path-corridor       row 30, cols 33–47
 *     hearthollow  'o'  centre-clearing     row 17, cols  7–25
 *     hearthollow  'B'  building-footprint  row 18, cols  9–16
 *     r1           ','  scrub               row 45, cols  5–22
 *     r1           '.'  open-ground         row 38, cols  4–30
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§20 a foray step rolls where the layout draws grass, and nowhere else", () => {
  /** One horizontal run of a single authored character, in collision-cell / movement-tile space. */
  interface TerrainRun {
    col: number;
    row: number;
    len: number;
    char: string;
    nodeId: string;
  }

  /**
   * The committed layout as a grid, parsed by `core/foodweb.ts` `findLayoutGrid`.
   *
   * The REAL parser on the REAL file. A regex of my own here would agree with itself and with
   * nothing the game reads, and the whole point of §20 is that the grass the player walks on is the
   * grass the art lane authored.
   */
  function layoutRows(nodeId: string): string[] {
    const text = readFileSync(`${ROOT}tools/mapgen/layouts/${nodeId}.txt`, "utf8");
    const parse = findLayoutGrid(text, balance.map.collisionCols);
    expect(parse.ambiguous, `${nodeId}'s layout has two candidate grids`).toBe(false);
    expect(parse.rows.length, `${nodeId}'s layout is not the balance.map grid`).toBe(balance.map.collisionRows);
    return parse.rows;
  }

  /**
   * The longest horizontal run of `char`, kept two cells clear of the grid edge.
   *
   * TWO, not one: the stub plays every node on `synthesiseBorderCollision`'s placeholder — walkable
   * except the outermost cell — and a run that touched the border would put the turn-around into a
   * wall and silently shorten the walk.
   */
  function longestRunOf(nodeId: string, char: string): TerrainRun {
    const rows = layoutRows(nodeId);
    const lo = 2;
    const hi = balance.map.collisionCols - 3;
    let best: TerrainRun | null = null;
    for (let row = lo; row <= balance.map.collisionRows - 3; row += 1) {
      const line = rows[row] as string;
      let col = lo;
      while (col <= hi) {
        if (line[col] !== char) {
          col += 1;
          continue;
        }
        const start = col;
        while (col <= hi && line[col] === char) col += 1;
        if (best === null || col - start > best.len) best = { col: start, row, len: col - start, char, nodeId };
      }
    }
    expect(best, `${nodeId}'s layout draws no run of "${char}" at all`).not.toBeNull();
    const run = best as TerrainRun;
    // A one-cell run cannot be paced, so a fixture that shrank to one is a fixture that stopped
    // measuring a WALK.
    expect(run.len, `${nodeId}'s longest run of "${char}" is a single cell`).toBeGreaterThanOrEqual(2);
    return run;
  }

  /**
   * Every cell of the run, judged by the mask the SCENE uses — the binding between the layout this
   * fixture read and the answer `forayContext` hands `rollForayStep`.
   */
  function expectRunRolls(run: TerrainRun, rolls: boolean): void {
    const mask = encounterMaskFor(run.nodeId, balance);
    expect(mask, `${run.nodeId} has no encounter mask`).not.toBeNull();
    for (let i = 0; i < run.len; i += 1) {
      expect(
        cellRollsEncounters(mask as NonNullable<typeof mask>, run.col + i, run.row),
        `${run.nodeId} ${String(run.col + i)},${String(run.row)} is "${run.char}" in the layout but the mask disagrees`,
      ).toBe(rolls);
    }
  }

  /**
   * Walk the run end to end and back, `steps` completed steps, EVERY ONE OF THEM LANDING ON IT.
   *
   * ⚠ EACH STEP BEGINS FROM A STANDSTILL, and that is not tidiness. `game/movement.ts` starts the
   * next step the instant one lands while a key is held, so a frame ends with a step already in
   * flight — and the turn at the end of the run would then carry the player one cell PAST it, onto
   * ground the fixture has not vouched for. `placeAt` on the tile the player is already standing on
   * drops that in-flight step and moves nobody: it is the player letting go of the key.
   *
   * Returns the steps actually taken, so a caller can refuse to draw a conclusion from a walk that
   * did not happen.
   */
  function paceRun(h: Harness, run: TerrainRun, steps: number): number {
    h.scene.movement = placeAt(h.scene.movement, { col: run.col, row: run.row });
    let dir: Dir = "right";
    let taken = 0;
    let guard = 0;
    while (taken < steps && guard < steps * 4 + 64) {
      guard += 1;
      const at = h.scene.movement.tile;
      if (dir === "right" && at.col >= run.col + run.len - 1) dir = "left";
      else if (dir === "left" && at.col <= run.col) dir = "right";
      h.scene.movement = placeAt(h.scene.movement, at);
      h.hold(dir, true);
      h.frame();
      h.hold(dir, false);
      const now = h.scene.movement.tile;
      if (now.col === at.col && now.row === at.row) break;
      taken += 1;
    }
    const end = h.scene.movement.tile;
    expect(
      end.row === run.row && end.col >= run.col && end.col < run.col + run.len,
      `the pace wandered off the run to ${String(end.col)},${String(end.row)}`,
    ).toBe(true);
    expect(h.scene.currentInterior(), "the pace walked indoors").toBeNull();
    return taken;
  }

  /**
   * A scene that keeps walking when it meets something.
   *
   * `OverworldHooks.onEncounter` is the production seam a lane uses to take the fight over, and the
   * scene counts the encounter and records the sign card BEFORE calling it — so nothing about the
   * roll is stood in for here. Without it the first animal pauses the overworld and a 400-step
   * measurement becomes a 6-step one.
   */
  function mountForaging(over: Partial<OverworldSceneData> = {}): Harness {
    return mount({ ...over, hooks: { onEncounter: () => undefined } });
  }

  const R1 = "r1";

  /* ── 20.1 the grass rolls ──────────────────────────────────────────────── */

  it.each([
    [SLICE_NODE, "the town's scrub"],
    [R1, "Meadow Reach's scrub"],
  ])("%s — a run of steps that stays on the layout's ',' cells DOES meet creatures (%s)", (nodeId, _what) => {
    const run = longestRunOf(nodeId, ",");
    expectRunRolls(run, true);

    const h = mountForaging({ save: freshSave(nodeId), startNode: nodeId });
    /*
     * 200 steps at `encounterChancePerStep` (shipped 0.18) — the rate a positioned step rolls at ON
     * encounter terrain, with no tile fraction in it. P(nothing in 200) = 0.82^200 ≈ 5e-18.
     */
    const STEPS = 200;
    const paced = paceRun(h, run, STEPS);
    expect(paced, "the rig could not walk the scrub").toBe(STEPS);
    expect(
      h.scene.encountersMetCount(),
      `${String(STEPS)} steps on ${nodeId} ${String(run.col)}..${String(run.col + run.len - 1)},${String(run.row)} met nothing`,
    ).toBeGreaterThan(0);
    expect(h.scene.lastEncounterMet()?.nodeId, "the encounter came from another node").toBe(nodeId);
  });

  /* ── 20.2 …and nothing else does ───────────────────────────────────────── */

  /*
   * The four kinds of ground a player crosses that are not grass, named by `tools/mapgen/legend.ts`:
   * the lane, the worn track through the middle of the map, the open clearing a town square is drawn
   * on, and the inside of a building's footprint.
   *
   * ⚠ THE FOOTPRINT IS WALKABLE HERE AND THAT IS NOT A MISTAKE. `B` blocks in the shipped legend, so
   * a player with a real collision mask never stands in one; the stub's synthesised placeholder is
   * open everywhere but its border, so the rig can. Collision and the encounter mask are two
   * mechanisms, and the claim under test is the mask's alone: a cell that is not `,` hands over
   * nothing, whoever managed to stand on it.
   */
  it.each([
    [SLICE_NODE, ".", "the lane"],
    [SLICE_NODE, ":", "the worn track"],
    [SLICE_NODE, "o", "the town's open ground"],
    [SLICE_NODE, "B", "inside a building's footprint"],
    [R1, ".", "Meadow Reach's open ground"],
  ])("%s — a run of steps on '%s' meets NOTHING (%s)", (nodeId, char, _what) => {
    const run = longestRunOf(nodeId, char);
    expectRunRolls(run, false);

    const h = mountForaging({ save: freshSave(nodeId), startNode: nodeId });
    /*
     * ⚠ THE SAMPLE SIZE IS THE OLD BEHAVIOUR'S, NOT A ROUND NUMBER. Before the scene handed the roll
     * a footing, EVERY cell of every map rolled at `stepEncounterChance` =
     * `encounterTileFraction × encounterChancePerStep` = 0.25 × 0.18 = 0.045 — so the probability
     * that 400 such steps met nothing is 0.955^400 ≈ 1.1e-8. A zero here is therefore evidence
     * about the terrain and not about a quiet seed: one run in ninety million would have looked
     * like this by luck.
     */
    const STEPS = 400;
    const drawsBefore = h.scene.streamFor("encounter").draws;
    const streamBefore = h.scene.streamFor("encounter").save();
    const paced = paceRun(h, run, STEPS);
    expect(paced, `the rig could not walk ${nodeId}'s "${char}" run`).toBe(STEPS);

    expect(
      h.scene.encountersMetCount(),
      `${String(STEPS)} steps on "${char}" at ${nodeId} ` +
        `${String(run.col)}..${String(run.col + run.len - 1)},${String(run.row)} met something`,
    ).toBe(0);
    /*
     * …AND THE ROLL REALLY HAPPENED. Zero encounters is also what a scene that stopped rolling
     * altogether produces, so the stream is the witness: `rollForayStep` takes exactly ONE draw per
     * step whatever the ground is (its header explains why `rng.chance(0)` off the grass would have
     * been wrong — `core/rng.ts` skips the draw for p ≤ 0, and the cost of a walk would start
     * depending on the terrain crossed). 400 steps, 400 draws, nothing met.
     */
    expect(
      h.scene.streamFor("encounter").draws - drawsBefore,
      "a step off the grass did not draw at all — the walk's cost now depends on the ground",
    ).toBe(STEPS);
    expect(
      h.scene.streamFor("encounter").save(),
      "the encounter stream never moved — §14.3's outdoor control rests on this",
    ).not.toEqual(streamBefore);
  });

  /* ── 20.3 determinism (L10 / build-doc §8.1) ───────────────────────────── */

  it("the same seed and the same walk on the grass meet the same creatures", () => {
    const run = longestRunOf(SLICE_NODE, ",");
    const STEPS = 120;
    const play = (): { met: number; last: string; stream: unknown } => {
      const h = mountForaging();
      expect(paceRun(h, run, STEPS)).toBe(STEPS);
      const last = h.scene.lastEncounterMet();
      return {
        met: h.scene.encountersMetCount(),
        last: last ? `${last.lineId} ${last.age} L${String(last.level)}` : "none",
        stream: h.scene.streamFor("encounter").save(),
      };
    };
    const a = play();
    const b = play();
    expect(a.met, "the walk met nothing, so nothing here is being replayed").toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it("the stream advances identically whether or not the ground was grass", () => {
    /*
     * ⚠ THE LOAD-BEARING ONE, and the reason `rollForayStep` is written the way it is: the number of
     * draws a walk costs must not depend on the terrain it crossed, or two replays of the same
     * action log over a redrawn map diverge and §14.3's indoor guard — whose control is "the same
     * walk OUTDOORS does move the encounter stream" — starts failing on a walk that stayed off the
     * grass.
     *
     * MEASURED AS AN EXACT EQUALITY, by emptying the node first. With every count at 0 the table has
     * no weight, and `core/rng.ts` `pickWeighted` returns undefined WITHOUT consuming a draw — so a
     * step whose gate passes on the grass costs exactly what a step refused by the terrain costs:
     * the one gate draw. Same seed, same number of steps, one walk in the scrub and one on the
     * paving, and the two streams have to be byte-identical.
     */
    const grass = longestRunOf(SLICE_NODE, ",");
    const paving = longestRunOf(SLICE_NODE, ":");
    expectRunRolls(grass, true);
    expectRunRolls(paving, false);

    const zeros: Record<string, number> = {};
    for (const lineId of Object.keys(nodeFile(SLICE_NODE).populations)) zeros[lineId] = 0;
    const STEPS = 200;
    const after = (run: TerrainRun): { drawn: number; state: unknown; met: number } => {
      const h = mountForaging({ save: withCounts(freshSave(), SLICE_NODE, zeros) });
      const drawsBefore = h.scene.streamFor("encounter").draws;
      expect(paceRun(h, run, STEPS)).toBe(STEPS);
      return {
        drawn: h.scene.streamFor("encounter").draws - drawsBefore,
        state: h.scene.streamFor("encounter").save(),
        met: h.scene.encountersMetCount(),
      };
    };
    const onGrass = after(grass);
    const onPaving = after(paving);
    expect(onGrass.drawn, "a step on the grass did not cost exactly one draw").toBe(STEPS);
    expect(onPaving.drawn, "a step on the paving did not cost exactly one draw").toBe(STEPS);
    expect(onGrass.met).toBe(0);
    expect(onPaving.met).toBe(0);
    expect(onPaving.state, "the ground the player crossed changed the stream's position").toEqual(onGrass.state);
  });

  /* ── 20.3.1 the HUD is not told a different number ─────────────────────── */

  it("the HUD's context carries NO footing, and a cell cannot move what the HUD reports", () => {
    /*
     * THE DECISION, WRITTEN DOWN. `refreshHud` asks for `forayContext()` with no cell, so what the
     * player is TOLD about this node is the position-blind table it has always been. That is
     * deliberate: the HUD prints counts and derived weights, not a per-step rate, and a footing on
     * its context would be a claim about the tile the player happens to be on — and indoors it would
     * be the interior room's coordinate read against the TOWN's mask, which is not a number at all.
     *
     * Both halves are asserted because they fail differently: the first catches a `forayContext`
     * that started defaulting the cell, the second catches `encounterTable` learning to read one.
     * Changing either is a change to what the player is told, and it should have to come through
     * here.
     */
    const h = mount();
    expect(h.scene.forayContext().footing, "the HUD's context acquired a footing").toBeUndefined();

    const run = longestRunOf(SLICE_NODE, ",");
    const positioned = h.scene.forayContext(SLICE_NODE, { col: run.col, row: run.row });
    expect(positioned.footing, "a supplied cell did not reach the context").toBeDefined();
    expect(
      encounterTable(positioned),
      "the encounter TABLE changed with the cell — the mask is deciding WHAT lives here, not just where",
    ).toEqual(encounterTable(h.scene.forayContext()));
  });

  /* ── 20.4 two steps in one frame are two different cells ───────────────── */

  it("a frame that lands TWO steps rolls each on the cell it landed on, not both on the last", () => {
    /*
     * ⚠ REACHABLE IN THE RUNNING GAME, not a contrivance. `game/movement.ts` `update` resolves up to
     * `MAX_STEPS_PER_UPDATE` steps out of one long frame — any frame longer than
     * `balance.map.walkMsPerTile` — and `OverworldScene.update` assigns `result.state` BEFORE it
     * drains the events, so `this.movement.tile` is the LAST tile of the frame. A scene that read
     * that field would roll both of a frame's steps on the second one's ground. Here the rig hands
     * `update` twice its own pace, which is the same long frame a dropped frame produces.
     *
     * THE FIXTURE IS A BOUNDARY, taken from the layout: the first cell of the scrub run, and the
     * cell immediately west of it, which by construction of "the longest run" is not scrub. The
     * player is placed one cell east and walks west, so step 1 lands ON the grass and step 2 lands
     * OFF it.
     *
     *   correct  — step 1 rolls at `encounterChancePerStep`; P(nothing in 250 frames) = 0.82^250 ≈ 5e-22
     *   wrong    — both steps roll on the cell west of the run, which never rolls: EXACTLY zero, always
     */
    const run = longestRunOf(SLICE_NODE, ",");
    expectRunRolls(run, true);
    const mask = encounterMaskFor(SLICE_NODE, balance);
    expect(mask, `${SLICE_NODE} has no encounter mask`).not.toBeNull();
    const onGrass = { col: run.col, row: run.row };
    const offGrass = { col: run.col - 1, row: run.row };
    expect(
      cellRollsEncounters(mask as NonNullable<typeof mask>, offGrass.col, offGrass.row),
      "the cell west of the run is grass too — the fixture has no boundary in it",
    ).toBe(false);

    const h = mountForaging();
    expect(h.scene.canEnter(offGrass), "the rig cannot stand west of the run").toBe(true);

    const FRAMES = 250;
    let doubles = 0;
    for (let i = 0; i < FRAMES; i += 1) {
      h.scene.movement = placeAt(h.scene.movement, { col: run.col + 1, row: run.row });
      const before = h.scene.movement.stepsTaken;
      h.hold("left", true);
      // TWICE the pace in one call — two whole tiles of movement, one `update`.
      h.frame(MS_PER_TILE * 2);
      h.hold("left", false);
      if (h.scene.movement.stepsTaken - before === 2) doubles += 1;
    }

    // The rig has to have produced the situation, or the assertion below is about nothing.
    expect(doubles, "no frame landed two steps — the long-frame case was never constructed").toBe(FRAMES);
    expect(
      h.scene.movement.tile,
      "the frame did not end on the cell a `this.movement.tile` read would have used",
    ).toEqual(offGrass);
    expect(
      h.scene.encountersMetCount(),
      `${String(FRAMES)} two-step frames whose FIRST step landed on ${String(onGrass.col)},${String(onGrass.row)} ` +
        `(scrub) met nothing — the roll used the frame's last tile, not the step's`,
    ).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §21 THE PLAYER FACES FORWARD AND SKIPS — driven through the real scene
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DECISION THIS SECTION BINDS. Hank, verbatim:
 *
 *     "we're switching to the player character always being facing forward and doing the skipping
 *      movement as it moves around."
 *
 * and build-doc §9.6 step 4, the motion it switched to, also verbatim:
 *
 *     "y = 2px sine per tile step, 1px lateral sway, horizontal flip alternation."
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS ALONGSIDE `tests/unit/skip-walk.test.ts`. That file pins the arithmetic of
 * `skipOffsetPx` / `skipSwayOffsetPx` / `skipFlipped` exactly. A pure function nothing calls is not
 * a skip, so this section drives the REAL `OverworldScene` — its own `update`, its own display
 * object — and asks what actually reached the picture. The stub records `setTexture`, `setPosition`
 * and `setFlipX` for precisely this reason; see the recorder's comment in the stub above.
 *
 * THE PROPERTY EVERY TEST BELOW SHARES: the bob is PRESENTATION. It may not move the logical tile,
 * may not change a collision answer, and may not move the point `propUnderPlayer` measures a prop's
 * interaction radius from. The SWAY is the more dangerous of the two offsets to leak, because it is
 * horizontal — a leaked hop makes a sign talkable at the bottom of a bounce and not the top, but a
 * leaked sway slides the player sideways into a NEIGHBOURING prop's radius.
 */
describe("§21 the player never turns, and the skip stays in the picture", () => {
  /** The player's display object — found by the key it draws, never by a position in the list. */
  function playerObj(h: Harness): FakeObj {
    const forward = playerArtId(PLAYER_FORWARD_VIEW);
    const found = h.parts.objects.find((o) => o.kind === "image" && String(o.texture).includes(forward));
    if (!found) throw new Error(`no player sprite on the display list drawing "${forward}"`);
    return found;
  }

  /** A direction the player can actually walk from where they are standing. */
  function openDir(h: Harness): Direction {
    const from = h.scene.movement.tile;
    for (const dir of DIRECTIONS) {
      const d = delta(dir);
      if (h.scene.canEnter({ col: from.col + d.dCol, row: from.row + d.dRow })) return dir;
    }
    throw new Error("the player is walled in on all four sides — §21 has nothing to drive");
  }

  /** Half a tile step, so every sample below is genuinely mid-hop rather than on a landing. */
  const HALF = MS_PER_TILE / 2;

  /* ── 21.1 the drawn texture never turns ───────────────────────────────── */

  it("the drawn texture is the forward key whichever way the player walks", () => {
    /*
     * ⚠ ASSERTED AGAINST WHAT THE OBJECT IS SHOWING, not against what it was constructed with.
     * `add.image(x, y, key)` captures the birth key; the current one is whatever the last
     * `setTexture` said. The stub records both, so a directional swap reinstated in
     * `syncPlayerSprite` shows up here — which it does not, when the recorder is removed.
     */
    const h = mount();
    const player = playerObj(h);
    const drawn = new Set<string>();
    let stepped = 0;

    for (const dir of DIRECTIONS) {
      h.hold(dir, true);
      for (let i = 0; i < 8; i += 1) {
        h.frame(HALF);
        drawn.add(String(player.texture));
        // `facing` is a live MOVEMENT fact and must keep moving — otherwise "the texture ignores
        // the facing" is true because the facing never changed.
        expect(playerArtIds(), "the sprite drew a key outside the manifest's grammar").toContain(
          playerArtId(PLAYER_FORWARD_VIEW),
        );
      }
      h.hold(dir, false);
      stepped = h.scene.movement.stepsTaken;
    }

    expect(stepped, "the player never moved, so nothing was measured").toBeGreaterThan(0);
    expect(new Set(DIRECTIONS.map(String)).size, "the fixture walked one direction").toBeGreaterThan(1);
    expect(drawn.size, `the drawn texture changed while walking: ${[...drawn].join(" ")}`).toBe(1);
    expect([...drawn][0], "the sprite is not drawing the forward key").toContain(
      playerArtId(PLAYER_FORWARD_VIEW),
    );
    // …and no retired view or step frame reached the screen under any heading.
    for (const retired of ["back", "side", "step-left", "step-right"]) {
      expect(String(player.texture).includes(retired), `the sprite drew a "${retired}" key`).toBe(false);
    }
  });

  /* ── 21.2 the hop reaches the draw position and nothing else ───────────── */

  it("the hop is subtracted at the sprite — the reach point never leaves the ground", () => {
    const h = mount();
    const player = playerObj(h);
    h.hold(openDir(h), true);
    h.frame(HALF);

    const reach = spriteWorldPosition(h.scene.movement, h.scene.movementCfg);
    const hop = skipOffsetPx(h.scene.movement, h.scene.skipCfg);
    expect(hop, "the sample is not mid-hop, so the separation below measures nothing").toBeGreaterThan(0);
    expect(player.y, "the hop did not reach the drawn position").toBeCloseTo(reach.y - hop);
    expect(reach.y - player.y).toBeCloseTo(balance.map.skipHopPx);
  });

  /* ── 21.3 the sway reaches the draw position and nothing else ──────────── */

  it("the sway is added at the sprite — the reach point never leans", () => {
    /*
     * THE SEPARATION, FOR THE HORIZONTAL TERM. `propUnderPlayer()` asks
     * `propAt(node, spriteWorldPosition(movement, cfg), balance)`. A sway folded into that function
     * would move the measured point SIDEWAYS on alternate hops — a sign one tile over becoming
     * talkable on the half of every hop the character leans toward it.
     */
    const h = mount();
    const player = playerObj(h);
    h.hold(openDir(h), true);
    h.frame(HALF);

    const reach = spriteWorldPosition(h.scene.movement, h.scene.movementCfg);
    const lean = skipSwayOffsetPx(h.scene.movement, h.scene.skipCfg);
    expect(Math.abs(lean), "the sample is not mid-hop, so the separation below measures nothing").toBeGreaterThan(0);
    expect(player.x, "the sway did not reach the drawn position").toBeCloseTo(reach.x + lean);
    expect(player.x, "the sprite is drawn exactly where the reach is measured — the sway is not real").not.toBe(
      reach.x,
    );
    expect(Math.abs(player.x - reach.x)).toBeCloseTo(Math.abs(lean));

    /*
     * ⚠ AND THE REACH POINT IS WHAT THE TILE GRID SAYS, computed from `tileStepPx` and the two tiles.
     * Every assertion above survives a sway BAKED INTO `spriteWorldPosition` — the drawn x would
     * merely lean twice and still differ from the reach x, and §21.5's two-config run would still
     * agree with itself because that function does not read a `SkipConfig` at all. This is the line
     * that dies. Measured by sabotage: folding the sway into `spriteWorldPosition` leaves every
     * other assertion in §21 green.
     */
    const step = h.scene.movement.step;
    expect(step, "the sample is not mid-step").not.toBeNull();
    if (!step) return;
    const t = balance.map.tileStepPx;
    expect(reach.x, "the reach point leans — something lateral is baked into spriteWorldPosition").toBeCloseTo(
      ((step.from.col + step.to.col) / 2) * t + t / 2,
    );
    expect(reach.y, "the reach point hops — something vertical is baked into spriteWorldPosition").toBeCloseTo(
      ((step.from.row + step.to.row) / 2) * t + t - balance.map.playerSpriteH / 2,
    );
  });

  /* ── 21.4 the mirror alternates, on the real display object ────────────── */

  it("the sprite MIRRORS on alternate hops — the term that makes it read as a skip", () => {
    /*
     * ⚠ THIS IS THE TERM THAT REPLACED THE SIX WALK FRAMES, and it is the one an optimiser deletes
     * first. A pure vertical sine on a static sprite reads as a FLOAT: the character hangs and sinks
     * with nothing about it changing. Mirroring on alternate hops changes which side the silhouette
     * leads with, so the eye reads a change of weight from one foot to the other.
     */
    const h = mount();
    const player = playerObj(h);
    const dir = openDir(h);
    h.hold(dir, true);

    const seen = new Set<boolean>();
    let sampled = 0;
    for (let i = 0; i < 16; i += 1) {
      h.frame(HALF);
      if (!h.scene.movement.step) continue;
      sampled += 1;
      // The object agrees with the pure function at every single sample — not merely "it flips
      // sometimes", which a stuck `true` after one hop would also satisfy.
      expect(player.flipX, `the drawn mirror disagrees with skipFlipped at sample ${String(i)}`).toBe(
        skipFlipped(h.scene.movement, h.scene.skipCfg),
      );
      seen.add(Boolean(player.flipX));
    }
    h.hold(dir, false);

    expect(sampled, "no sample was taken mid-step — the walk never started").toBeGreaterThan(4);
    expect(h.scene.movement.stepsTaken, "the walk covered no tiles, so no hop ever ended").toBeGreaterThan(1);
    expect(seen, "the sprite drew one mirror for the whole walk — it does not alternate").toEqual(
      new Set([false, true]),
    );
  });

  /* ── 21.5 neither term can perturb the simulation ──────────────────────── */

  it("an absurd bob moves the picture and leaves the tile, the reach and the prop answer untouched", () => {
    /*
     * The strongest form of "presentation only" this rig can express: run the SAME scripted walk
     * through the SAME scene twice — once at the shipped bob and once at one three tiles wide in
     * both axes — and compare everything the simulation can see. `skipCfg` is a public field
     * precisely so a test can do this; `movementCfg` is a separate object, so nothing about the pace
     * changes between the two runs.
     *
     * `propUnderPlayer()` is in the comparison rather than assumed to follow from the reach point,
     * because it is the CALLER the defect would be felt through, and a caller that quietly measured
     * from somewhere else would satisfy an assertion about `spriteWorldPosition` alone.
     */
    const huge: SkipConfig = {
      hopPx: balance.map.tileStepPx * 3,
      swayPx: balance.map.tileStepPx * 3,
      hopsPerTile: balance.map.skipHopsPerTile,
    };

    const run = (cfg: SkipConfig): { tiles: string[]; reach: string[]; props: string[]; drawn: string[] } => {
      const h = mount();
      h.scene.skipCfg = cfg;
      const player = playerObj(h);
      const tiles: string[] = [];
      const reach: string[] = [];
      const props: string[] = [];
      const drawn: string[] = [];
      for (const dir of DIRECTIONS) {
        h.hold(dir, true);
        for (let i = 0; i < 8; i += 1) {
          h.frame(HALF);
          const p = spriteWorldPosition(h.scene.movement, h.scene.movementCfg);
          tiles.push(`${String(h.scene.movement.tile.col)},${String(h.scene.movement.tile.row)}`);
          reach.push(`${p.x.toFixed(4)},${p.y.toFixed(4)}`);
          props.push(JSON.stringify(h.scene.propUnderPlayer()));
          drawn.push(`${player.x.toFixed(4)},${player.y.toFixed(4)}`);
        }
        h.hold(dir, false);
      }
      return { tiles, reach, props, drawn };
    };

    const shipped = run(skipConfig(balance));
    const absurd = run(huge);

    // The rig has to have produced a walk, or every equality below is over one standing sample.
    expect(shipped.tiles.length, "the scripted walk took no samples").toBeGreaterThan(16);
    expect(new Set(shipped.tiles).size, "the player never moved, so identical tiles prove nothing").toBeGreaterThan(1);

    expect(absurd.tiles, "a bigger bob walked a different path").toEqual(shipped.tiles);
    expect(absurd.reach, "a bigger bob moved the point props and spawns are measured from").toEqual(shipped.reach);
    expect(absurd.props, "a bigger bob changed which prop the player is standing at").toEqual(shipped.props);
    // …and it really did draw differently, so the three equalities above are not comparing nothing.
    expect(absurd.drawn, "the bob is not reaching the picture at all — the comparisons above are vacuous").not.toEqual(
      shipped.drawn,
    );
  });

  /* ── 21.6 the hop counter is what drives it, and it survives a long frame ─ */

  it("a frame that lands several steps draws the hop the short frames would have drawn", () => {
    /*
     * `game/movement.ts::update` resolves up to MAX_STEPS_PER_UPDATE tiles out of one long frame —
     * any frame longer than `walkMsPerTile`, which a dropped frame produces. A mirror kept as a
     * counter ticked once per `stepCompleted` would fall out of phase there; `skipHopIndex` is
     * COUNTED from `stepsTaken`, so there is nothing to fall out of phase with. This is the scene's
     * half of that claim: two rigs, same walk, one long frame against many short ones.
     */
    const dir = "right" as const;
    const long = mount();
    const short = mount();
    if (!long.scene.canEnter({ col: long.scene.movement.tile.col + 1, row: long.scene.movement.tile.row })) {
      throw new Error("§21.6 needs an open tile to the east of the start");
    }

    long.hold(dir, true);
    short.hold(dir, true);
    long.frame(MS_PER_TILE * 2 + HALF);
    for (const ms of [MS_PER_TILE, MS_PER_TILE, HALF]) short.frame(ms);
    long.hold(dir, false);
    short.hold(dir, false);

    expect(long.scene.movement.step, "the long frame landed clean — nothing here is about phase").not.toBeNull();
    expect(long.scene.movement.stepsTaken, "the long frame was clipped").toBe(short.scene.movement.stepsTaken);
    expect(long.scene.movement.stepsTaken, "no multi-step frame was constructed").toBeGreaterThan(1);
    expect(skipHopIndex(long.scene.movement, long.scene.skipCfg)).toBe(
      skipHopIndex(short.scene.movement, short.scene.skipCfg),
    );
    expect(playerObj(long).x).toBeCloseTo(playerObj(short).x);
    expect(playerObj(long).y).toBeCloseTo(playerObj(short).y);
    expect(playerObj(long).flipX).toBe(playerObj(short).flipX);
  });

  /* ── 21.7 the grammar the scene can reach is the one the manifest ships ── */

  it("the scene has exactly one player key to draw, and PLAYER_VIEWS has exactly one member", () => {
    // The screen-side half of `tests/gates/dex-path-contract.test.ts`'s set identity, asked of the
    // running scene rather than of the helper: whatever the walk does, this is the only key.
    expect(PLAYER_VIEWS).toEqual([PLAYER_FORWARD_VIEW]);
    expect(playerArtIds()).toEqual([playerArtId(PLAYER_FORWARD_VIEW)]);
    const h = mount();
    expect(String(playerObj(h).texture)).toContain(playerArtId(PLAYER_FORWARD_VIEW));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §22 The sign-chain rule has ONE derivation, and one clause on top of it
 *
 * THE DEFECT THIS BINDS. The flag→line join was written out TWICE: once in
 * `game/ui/SignChains.ts::unlockedSignChainLines`, which `MenuScene` reads to fill
 * `DexSceneData.unlockedSignChains`, and once inside this scene's private `unlockedSignChains()`
 * for the ENCOUNTER ROLL. Two spellings of one rule is how the shipped dex came to print "not in
 * the wild encounter pool" for all three Ancients on every save forever while the overworld was
 * rolling them correctly — the dex half was simply never filled in, and nothing compared them.
 *
 * ⚠ WHY THIS SECTION EXISTS RATHER THAN `tests/unit/ui-frame-panel.test.ts` §7. That section calls
 * `unlockedSignChainsOf` twice, under two names, and never touches this scene — so it agrees with
 * itself and would stay green if the overworld grew a third answer tomorrow. Both spellings have to
 * be DRIVEN, and only one of them is a Phaser scene, so the comparison lives where the scene can be
 * mounted. `forayContext()` is the public road: it is what `update()` hands `game/encounters.ts` on
 * every step, so what is asserted here is the set the running game actually rolls against.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§22 the encounter roll and the dex derive sign chains from the same rule", () => {
  /** Every `chain.*.complete` flag `data/dialogue.json` really sets. Derived, never typed (G2). */
  const CHAIN_COMPLETE_FLAGS: readonly string[] = [
    ...new Set(
      DIALOGUE.entries.flatMap((entry) =>
        Object.entries(entry.setFlags ?? {})
          .filter(([flag, value]) => value === true && flag.startsWith("chain.") && flag.endsWith(".complete"))
          .map(([flag]) => flag),
      ),
    ),
  ].sort();

  /** A walkable node that is NOT the finale's — so the one clause the scene keeps stays out of it. */
  const PLAIN_NODE: string = ((): string => {
    const finale = finaleNodeId(balance);
    const node = content.nodes.find((n) => n.walkable && n.id !== finale) ?? content.nodes[0]!;
    return node.id;
  })();

  it("the corpus writes chain completions, and they unlock something — the premise", () => {
    // Non-vacuity, asserted rather than assumed: with no completion flag in the corpus, or none of
    // them naming a gated line, every comparison below would hold over two empty sets.
    expect(CHAIN_COMPLETE_FLAGS.length, "data/dialogue.json writes no chain completion").toBeGreaterThan(0);
    const everything: Record<string, boolean> = {};
    for (const flag of CHAIN_COMPLETE_FLAGS) everything[flag] = true;
    expect(
      [...unlockedSignChainLines(everything, content.species, balance)].length,
      "no shipped completion flag unlocks any line — the join names nothing",
    ).toBeGreaterThan(0);
    expect(PLAIN_NODE, "no walkable node outside the finale's").not.toBe(finaleNodeId(balance));
  });

  it("DRIVEN — for every completion flag the corpus writes, the two agree exactly", () => {
    for (const flag of CHAIN_COMPLETE_FLAGS) {
      const base = freshSave(PLAIN_NODE);
      const save: SaveEnvelope = { ...base, questFlags: { ...base.questFlags, [flag]: true } };
      const h = mount({ save, startNode: PLAIN_NODE });

      // The dex's spelling, over the same save the scene is standing in.
      const dexSide = [...unlockedSignChainLines(save.questFlags, content.species, balance)].sort();
      // The DISCRIMINATOR: if this flag unlocks nothing, the comparison below is `[] === []` and
      // proves nothing about either side.
      expect(dexSide.length, `${flag} unlocks no line — this iteration is vacuous`).toBeGreaterThan(0);

      // The scene's spelling, read where the running game reads it: what `update()` hands the roll.
      const rollSide = [...(h.scene.forayContext(PLAIN_NODE).unlockedSignChains ?? [])].sort();
      expect(rollSide, `${flag}: the encounter roll and the dex disagree about what it unlocks`).toEqual(dexSide);
    }
  });

  it("…and a save with no completion unlocks nothing on either side", () => {
    const save = freshSave(PLAIN_NODE);
    const h = mount({ save, startNode: PLAIN_NODE });
    expect([...unlockedSignChainLines(save.questFlags, content.species, balance)]).toEqual([]);
    expect(h.scene.forayContext(PLAIN_NODE).unlockedSignChains).toBeUndefined();
  });

  it("the ONE clause the dex must never have is still the scene's: the finale node", () => {
    /*
     * `maren.keystone.6` writes `chain.vellsire.complete` with no Greaves requirement, and the
     * finale node ships the stag at a real count — so without this clause a player could close the
     * chain, walk in, forage and snare an animal the scripted meeting was still owed. It is a
     * question about a NODE, and a dex entry is not per-node, which is exactly why it stays here
     * and not in `game/ui/SignChains.ts`.
     */
    const finale = finaleNodeId(balance);
    const base = freshSave(PLAIN_NODE);
    const everything: Record<string, boolean> = {};
    for (const flag of CHAIN_COMPLETE_FLAGS) everything[flag] = true;
    const save: SaveEnvelope = { ...base, questFlags: { ...base.questFlags, ...everything } };
    const h = mount({ save, startNode: PLAIN_NODE });

    // The premise: the chains ARE closed, and the finale is NOT unlocked.
    expect(finaleUnlocked(save, balance), "the fixture already unlocked the finale").toBe(false);
    const closed = [...unlockedSignChainLines(save.questFlags, content.species, balance)].sort();
    expect(closed.length, "the fixture closed no chain").toBeGreaterThan(0);

    // Anywhere else the roll sees them…
    expect([...(h.scene.forayContext(PLAIN_NODE).unlockedSignChains ?? [])].sort()).toEqual(closed);
    // …and at the finale's node it sees none of them, while the dex still would.
    expect(
      h.scene.forayContext(finale).unlockedSignChains,
      "the finale node's weight table honoured the chain alone",
    ).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §23 The diagnostic readout is OPT-IN, and hiding it does not hide the game
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ WHAT THIS IS ABOUT, OBSERVED ON THE DEPLOYED BUILD. `refreshHud` printed ~25 lines at depth 100
 * over a 480×320 screen, unconditionally: opening the overworld showed tile coordinates, the
 * per-line population table, asset paths and tick prices — and, somewhere underneath all of that, a
 * town. The readout is not deleted; it moved behind `?debug=1` and comes back IN FULL.
 *
 * ⚠ AND WHY EVERY ASSERTION BELOW READS `visible`, NOT {@link Harness.hud}. `hud()` joins EVERY text
 * object whether or not it is painted, and the scene deliberately keeps filling the hidden one — so
 * a `toContain` there would be green for a line no player can see. That is the exact confusion this
 * section exists to prevent: {@link visibleHud} is what a player would read, `hud()` is what the
 * scene computed, and the two are different claims. Both are asserted, and neither alone would do.
 */

/** Only what is actually painted: the text objects Phaser would draw this frame. */
function visibleHud(h: Harness): string {
  return h.parts.objects
    .filter((o) => o.kind === "text" && o.visible)
    .map((o) => o.text)
    .join("\n");
}

/**
 * Run `body` with a `location.search` the scene will read through `game/boot.ts`.
 *
 * The flag is read ONCE, in `create()`, so it has to be in place before `mount` — which is why this
 * takes a thunk rather than a mounted harness. `location` is undefined under vitest's node
 * environment, which is also why the default in every other test in this file is "not asked for".
 */
function withSearch<T>(search: string, body: () => T): T {
  const g = globalThis as { location?: { search?: string } };
  const had = Object.prototype.hasOwnProperty.call(g, "location");
  const before = g.location;
  g.location = { search };
  try {
    return body();
  } finally {
    if (had) g.location = before;
    else delete g.location;
  }
}

describe("§23 the diagnostics are behind ?debug=1, and the player-facing lines are not", () => {
  /**
   * Substrings only the DIAGNOSTIC half of the readout emits, one from each branch of `refreshHud`
   * that the split touches — so a single surviving push cannot hide behind another line's absence.
   */
  const diagnosticMarks = (h: Harness): Array<{ what: string; mark: string }> => {
    const first = encounterTable(h.scene.forayContext())[0];
    expect(first, "the node offers no encounter line — the population-table mark would be vacuous").toBeDefined();
    return [
      { what: "the foray step counter", mark: "steps · encounters" },
      { what: "the tile/facing readout", mark: `facing ${h.scene.movement.facing}` },
      { what: "the party/box counts", mark: " · box " },
      { what: "the derived encounter weight", mark: "weight " },
      { what: "the population table", mark: `  ${first!.lineId}: ` },
      { what: "the season-tint provenance", mark: "tint " },
      { what: "the map/mask provenance", mark: "assets/final/maps/" },
      { what: "the tick price table", mark: "ticks travel " },
      { what: "the corpus bookkeeping", mark: "flags owed " },
    ];
  };

  it("⚠ DEFAULT: not one diagnostic line is painted — and the scene still computed every one of them", () => {
    const h = mount();
    const painted = visibleHud(h);
    const computed = h.hud();

    for (const { what, mark } of diagnosticMarks(h)) {
      expect(painted, `${what} is still painted over the map with no flag asked for`).not.toContain(mark);
      /*
       * THE DISCRIMINATOR. Without this half the assertion above would also pass if the line had
       * simply stopped being BUILT — a different change, and one that would take the `?debug=1`
       * readout down with it without a single test going red.
       */
      expect(computed, `${what} stopped being computed instead of being hidden`).toContain(mark);
    }
  });

  it("⚠ DEFAULT: what the player needs is still on screen — where they are, and every control prompt", () => {
    const h = mount();
    const painted = visibleHud(h);
    const node = nodeFile(h.scene.save.currentNode);

    expect(painted, "the player cannot see where they are standing").toContain(`${node.name} (${node.id})`);
    expect(painted, "[E] is not advertised, so nothing on screen says the talk key exists").toContain("[E] ");
    expect(painted, "[X] is not advertised").toContain("[X] ");
    expect(painted, "[C]/[R] are not advertised").toContain("[C] collision overlay · [R] ");
    expect(painted, "the quest readout is gone, so nothing on screen says what to do next").toContain("quests ");
    expect(painted, "the act the travel refusals quote is not on screen").toMatch(/(^|\n)act \d/);
    for (const neighbour of node.adjacency) {
      expect(painted, `there is no way off ${node.id} toward ${neighbour} on screen`).toContain(
        `travel → ${neighbour}`,
      );
    }
  });

  it("⚠ DEFAULT: a town's doors are still pointed at — the art paints no threshold", () => {
    /*
     * The door lines carry tile coordinates, which is the very shape of the noise this section
     * hides — and they STAY, because `game/mapview.ts` draws no painted doorway and a collision mask
     * cannot mark one: a threshold is walkable floor, indistinguishable from the grass beside it.
     * Hiding them hides the shop and the inn.
     */
    const withDoors = content.nodes.filter((n) => INTERIORS.some((bp) => bp.parentNode === n.id));
    expect(withDoors.map((n) => n.id), "no shipped node has an interior — this assertion is vacuous").not.toEqual([]);
    for (const town of withDoors) {
      const painted = visibleHud(mount({ save: freshSave(town.id), startNode: town.id }));
      for (const bp of INTERIORS.filter((each) => each.parentNode === town.id)) {
        expect(painted, `${bp.id}'s door is no longer pointed at from anywhere on screen`).toContain(
          `door ${bp.id} at`,
        );
      }
    }
  });

  it("⚠ DEFAULT: a fault stays painted — a player who can read one beats a player stuck in silence", () => {
    /*
     * DRIVEN, not stubbed, and by §15's own rig: a mask with exactly one walkable cell, which
     * `readMask` accepts, so the scene really does put the player down inside a shipped prop and
     * really does raise its own advisory. The claim under test is only WHERE that advisory lands —
     * on the painted surface, with no flag asked for.
     */
    const standingAt = (tile: { col: number; row: number }): WorldPoint =>
      spriteWorldPosition(createMovement(tile), movementConfig(balance));
    const blindSpawn = (node: NodeFile): { col: number; row: number } =>
      chooseSpawnTile(loadCollision(node.id, node.collisionMask, null, balance).grid, balance).tile;
    const node = content.nodes.find(
      (each) => propsOf(each).length > 0 && propAt(each, standingAt(blindSpawn(each)), balance) !== null,
    );
    expect(node?.id, "no shipped node spawns inside a prop — the fault fixture cannot be built").toBeDefined();
    const tile = blindSpawn(node as NodeFile);
    const prop = propAt(node as NodeFile, standingAt(tile), balance) as PropPlacement;

    const side = balance.map.mapNativePx / balance.map.collisionCellPx;
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i += 1) data[i * 4 + 3] = 255; // black, opaque ⇒ blocked
    const lit = (tile.row * side + tile.col) * 4;
    data[lit] = 255;
    data[lit + 1] = 255;
    data[lit + 2] = 255;

    const h = mount({ save: freshSave((node as NodeFile).id), startNode: (node as NodeFile).id }, (parts) => {
      parts.maskPixels.set(maskTextureKey((node as NodeFile).collisionMask), { width: side, height: side, data });
    });
    // The premise, from the real loader rather than a claim about it.
    expect(h.scene.collision.source, "the one-cell mask was refused instead of loaded").toBe("authored");
    expect(h.scene.movement.tile, "the player did not land on the only walkable tile").toEqual(tile);

    expect(
      visibleHud(h),
      "the player was put down inside a prop and nothing PAINTED says so — a silently broken game",
    ).toContain(`is inside prop ${prop.id}`);
  });

  it("⚠ ?debug=1 restores the readout IN FULL, in one panel, and it is strictly more than the default", () => {
    const plainPainted = visibleHud(mount());
    const debugged = withSearch("?debug=1", () => mount());
    const painted = visibleHud(debugged);

    for (const { what, mark } of diagnosticMarks(debugged)) {
      expect(painted, `?debug=1 did not bring back ${what}`).toContain(mark);
    }
    // The player-facing half is not lost to the flag either: the debug view is the WHOLE list.
    const node = nodeFile(debugged.scene.save.currentNode);
    expect(painted, "?debug=1 dropped the line that says where the player is").toContain(`${node.name} (${node.id})`);
    expect(painted, "?debug=1 dropped the control prompts").toContain("[C] collision overlay · [R] ");
    // …and it is ONE panel, not two stacked: exactly one painted object carries the list.
    const carriers = debugged.parts.objects.filter(
      (o) => o.kind === "text" && o.visible && o.text.includes("[C] collision overlay"),
    );
    expect(carriers.length, "the debug readout is split across more than one painted object").toBe(1);

    // THE COMPARISON THAT MAKES THE PAIR MEAN ANYTHING: the default really is the smaller screen.
    expect(
      painted.split("\n").length,
      "?debug=1 paints no more lines than the default does — the flag changed nothing",
    ).toBeGreaterThan(plainPainted.split("\n").length);
  });

  it("the flag is off for anything that is not ?debug — a seeded run included", () => {
    expect(
      visibleHud(withSearch("?seed=7", () => mount())),
      "a run asked only for a seed turned the diagnostics on",
    ).not.toContain("ticks travel ");
    expect(
      visibleHud(withSearch("?debug=0", () => mount())),
      "?debug=0 turned the diagnostics on",
    ).not.toContain("ticks travel ");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §24 The readout is OFF THE MAP — it is in a panel at the side of the screen
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ WHAT THIS IS ABOUT, AND WHY §23 WAS NOT ENOUGH. §23 moved the diagnostic half behind `?debug=1`
 * and twenty-five painted lines became eleven. Hank, looking at the same deployment:
 * *"The demo overlay is still showing."* Eleven lines of monospace at depth 100 still covered the
 * town — the classification was right and the LOCATION was wrong. Then the ruling that decided the
 * shape: *"I do see that the overlay includes some control instructions. Maybe you just have that in
 * a modal to the side of the screen."*
 *
 * So the claim under test is a GEOMETRIC one, and it is the one he can see: **no painted text object
 * begins inside the map viewport.** The text objects are left-anchored and grow rightward, so a left
 * edge at or beyond the viewport's right edge is the whole property — a line drawn over the map has
 * to start over the map.
 *
 * ⚠ AND WHY EVERY ASSERTION READS PAINTED OBJECTS. {@link Harness.hud} joins every text object
 * whether or not Phaser would draw it, and the scene deliberately keeps filling the hidden
 * diagnostic one — so a bounds check that included hidden objects would red on an object no player
 * can see, and a content check that included them would go green for a line that is not there.
 * {@link paintedTexts} is what a player would look at.
 *
 * ⚠ AND WHY THE BOUNDS ARE `x` AND `wordWrapWidth` RATHER THAN A RENDERED WIDTH. The stub is a
 * recorder, not a renderer: it has no glyph metrics and no font. Both numbers below are ones the
 * SCENE chose and the recorder captured verbatim, and together they bracket the object — a wrapped
 * Phaser text is never wider than its wrap width plus its padding. Nothing here is inferred from a
 * measurement the stub cannot make.
 */

/** Every text object Phaser would actually draw this frame. */
function paintedTexts(h: Harness): FakeObj[] {
  return h.parts.objects.filter((o) => o.kind === "text" && o.visible);
}

describe("§24 the player-facing readout is in a side panel, and the map is clear of text", () => {
  it("⚠ THE MEASUREMENT: not one painted text object begins inside the map viewport", () => {
    const h = mount();
    const map = h.scene.mapViewport();
    const panel = h.scene.panelRect();
    expect(panel, "no panel was built — the assertion below would be vacuous").not.toBeNull();
    expect(map.width, "the map viewport is the whole screen — nothing was moved").toBeLessThan(
      balance.map.virtualWidth,
    );

    const painted = paintedTexts(h);
    expect(painted.length, "nothing is painted at all — this asserts nothing").toBeGreaterThan(0);
    for (const t of painted) {
      expect(
        t.x,
        `a painted line begins at x=${String(t.x)}, inside the map viewport (0…${String(map.width)}): ` +
          `"${t.text.split("\n")[0] ?? ""}"`,
      ).toBeGreaterThanOrEqual(map.width);
    }
  });

  it("every painted line is INSIDE the panel — moved off the map, not off the screen", () => {
    const h = mount();
    const panel = h.scene.panelRect()!;
    for (const t of paintedTexts(h)) {
      expect(t.x, `"${t.text.split("\n")[0] ?? ""}" starts left of the panel`).toBeGreaterThanOrEqual(panel.x);
      expect(typeof t.wordWrapWidth, `"${t.text.split("\n")[0] ?? ""}" sets no wrap width`).toBe("number");
      expect(
        t.x + (t.wordWrapWidth as number),
        `"${t.text.split("\n")[0] ?? ""}" wraps wider than the panel it is drawn in`,
      ).toBeLessThanOrEqual(panel.x + panel.width);
      expect(t.y, "a painted line is off the top of the screen").toBeGreaterThanOrEqual(0);
      expect(t.y, "a painted line is off the bottom of the screen").toBeLessThanOrEqual(balance.map.virtualHeight);
    }
  });

  it("the panel is an OPAQUE plate over the map, above the player and below the blackout", () => {
    const h = mount();
    const panel = h.scene.panelRect()!;
    /*
     * The plate, not the ring: `drawFrameRingIn` answers null when the `ui-frame` texture has not
     * loaded (this stub loads nothing), which is a supported answer — but the readout still has to
     * be legible against SOMETHING, or the panel is a column of text over a painted town, which is
     * the defect it exists to fix. The plate is drawn either way.
     */
    const plate = h.parts.objects.find(
      (o) => o.kind === "rect" && o.rectW === panel.width && o.rectH === panel.height && o.x === panel.x,
    );
    expect(plate, "the panel has no opaque plate — the map shows through the readout").toBeDefined();
    expect(plate!.visible, "the plate was made and then hidden").toBe(true);
    // Above the player (20) so it hides the map under it; below the blackout curtain (200), because
    // a black screen with a lit panel on it is not a black screen.
    expect(plate!.depth, "the plate is below the player — the sprite draws over the readout").toBeGreaterThan(20);
    expect(plate!.depth, "the plate is at or above the blackout curtain").toBeLessThan(200);
    for (const t of paintedTexts(h)) {
      expect(t.depth as number, "a panel line is drawn under the plate it stands on").toBeGreaterThan(
        plate!.depth as number,
      );
    }
  });

  it("the column fits inside the panel at EVERY shipped node, not only the one this file starts at", () => {
    /*
     * ⚠ A COLUMN THAT OVERRUNS THE FRAME LOSES ITS LAST LINE, AND THE LAST LINE IS A CONTROL PROMPT.
     * The readout is one text object flowing down a 320px panel; nothing clips it and nothing scrolls
     * it, so a node whose lines wrap one row further than the frame allows simply prints `[C]
     * collision overlay · [R] …` off the bottom of the screen. Which node that is depends on the
     * NAMES in the corpus — a longer town name, one more open event, a second door — so it is asked
     * at every node rather than at the one `mount()` happens to open on.
     *
     * Measured through the scene's own {@link panelColumnHeight}: the stub is a recorder with no
     * glyph metrics, so a rendered height is not available to either side, and a second copy of the
     * arithmetic here is a second copy that can drift from the layout it describes.
     */
    for (const node of content.nodes) {
      const h = mount({ save: freshSave(node.id), startNode: node.id });
      const panel = h.scene.panelRect()!;
      const readout = paintedTexts(h).find((o) => o.text.includes("[C] collision overlay"));
      expect(readout, `${node.id}: the readout is not painted at all`).toBeDefined();
      const bottom = readout!.y + panelColumnHeight(readout!.text.split("\n"), readout!.wordWrapWidth as number);
      expect(bottom, `${node.id}: the column runs past the bottom of the panel, to y=${String(bottom)}`).toBeLessThanOrEqual(
        panel.y + panel.height,
      );
    }
  });

  it("⚠ the camera is bounded so the world's right edge stops AT the panel, never under it", () => {
    /*
     * THE ONE WAY THIS PANEL COULD HAVE SILENTLY BROKEN THE GAME. The camera's viewport is the whole
     * 480 and the panel is painted on top of it, so a camera clamped at `worldWidth` pushes the
     * followed sprite as far as screen x = 480 at the world's right edge — under the panel, where
     * the player is invisible and the game looks frozen. The bound has to carry the panel's width.
     */
    const h = mount();
    const panel = h.scene.panelRect()!;
    const bounds = h.parts.cameraBounds.at(-1);
    expect(bounds, "the scene set no camera bounds").toBeDefined();
    expect(
      bounds!.width - h.scene.mapView.worldWidth,
      "the camera bound does not carry the panel — the player can walk under it at the world's edge",
    ).toBe(panel.width);

    // The follow offset puts the sprite in the middle of what the player can SEE, not of the canvas.
    const follow = h.parts.cameraFollows.at(-1);
    expect(follow, "the camera follows nothing").toBeDefined();
    expect(follow!.offsetX, "the sprite is centred on the canvas, not on the map").toBe(-panel.width / 2);
  });

  it("⚠ THE SHELF AND EVERY CONTROL PROMPT ARE IN THE PANEL, with no flag asked for", () => {
    const h = mount();
    const map = h.scene.mapViewport();
    const painted = paintedTexts(h);
    const node = nodeFile(h.scene.save.currentNode);
    const joined = painted.map((o) => o.text).join("\n");

    // The same list §23 checks, re-checked here for WHERE it landed rather than THAT it exists.
    const wanted = [
      `${node.name} (${node.id})`,
      "[E] ",
      "[X] ",
      "[C] collision overlay · [R] ",
      "quests ",
      ...node.adjacency.map((id) => `travel → ${id}`),
    ];
    for (const mark of wanted) {
      const carrier = painted.find((o) => o.text.includes(mark));
      expect(carrier, `"${mark}" is on no painted surface at all\n${joined}`).toBeDefined();
      expect(carrier!.x, `"${mark}" is painted over the map`).toBeGreaterThanOrEqual(map.width);
    }
    expect(joined, "the act the travel refusals quote is not on screen").toMatch(/(^|\n)act \d/);
  });

  it("⚠ a fault gets its own painted strip, in a colour nothing else on the panel wears", () => {
    /*
     * DRIVEN by §23's own fixture — a mask with exactly one walkable cell, which `readMask` accepts,
     * so the scene really does put the player down inside a shipped prop and really does raise its
     * own advisory. The claim here is only WHERE it lands and WHAT it is drawn in.
     */
    const standingAt = (tile: { col: number; row: number }): WorldPoint =>
      spriteWorldPosition(createMovement(tile), movementConfig(balance));
    const blindSpawn = (node: NodeFile): { col: number; row: number } =>
      chooseSpawnTile(loadCollision(node.id, node.collisionMask, null, balance).grid, balance).tile;
    const node = content.nodes.find(
      (each) => propsOf(each).length > 0 && propAt(each, standingAt(blindSpawn(each)), balance) !== null,
    );
    expect(node?.id, "no shipped node spawns inside a prop — the fault fixture cannot be built").toBeDefined();
    const tile = blindSpawn(node as NodeFile);
    const prop = propAt(node as NodeFile, standingAt(tile), balance) as PropPlacement;

    const side = balance.map.mapNativePx / balance.map.collisionCellPx;
    const data = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i += 1) data[i * 4 + 3] = 255;
    const lit = (tile.row * side + tile.col) * 4;
    data[lit] = 255;
    data[lit + 1] = 255;
    data[lit + 2] = 255;

    const h = mount({ save: freshSave((node as NodeFile).id), startNode: (node as NodeFile).id }, (parts) => {
      parts.maskPixels.set(maskTextureKey((node as NodeFile).collisionMask), { width: side, height: side, data });
    });
    expect(h.scene.collision.source, "the one-cell mask was refused instead of loaded").toBe("authored");

    const painted = paintedTexts(h);
    const strip = painted.find((o) => o.text.includes(`is inside prop ${prop.id}`));
    expect(strip, "the fault is on no painted surface").toBeDefined();
    // ITS OWN OBJECT: the fault is not one of twenty grey lines in the readout's column.
    const readout = painted.find((o) => o.text.includes("[C] collision overlay"));
    expect(readout, "the readout is not painted at all").toBeDefined();
    expect(strip, "the fault is buried in the readout instead of having a strip of its own").not.toBe(readout);
    // FIRST in the column, so it is read before anything else on the panel.
    expect(strip!.y, "the fault sits below the readout it is supposed to lead").toBeLessThan(readout!.y);
    expect(strip!.x, "the fault is painted over the map").toBeGreaterThanOrEqual(h.scene.mapViewport().width);
  });

  it("⚠ ?debug=1 is the OLD screen: no panel, full width, the whole readout at the old anchor", () => {
    // The panel the DEFAULT screen builds, so the negative below names a real rectangle rather than
    // a literal this file would have to keep in step with the scene.
    const panel = mount().scene.panelRect()!;
    const debugged = withSearch("?debug=1", () => mount());
    expect(debugged.scene.panelRect(), "?debug=1 still draws the panel over the diagnostics").toBeNull();
    expect(
      debugged.scene.mapViewport().width,
      "?debug=1 narrowed the map — the developers' screen is not the player's",
    ).toBe(balance.map.virtualWidth);

    const painted = paintedTexts(debugged);
    const readout = painted.filter((o) => o.text.includes("[C] collision overlay"));
    expect(readout.length, "the debug readout is split across more than one painted object").toBe(1);
    // The anchor it has always had: top-left, over the map, at the full screen's wrap width.
    expect(readout[0]!.x, "the debug readout moved off its anchor").toBeLessThan(balance.map.virtualWidth / 2);
    expect(readout[0]!.wordWrapWidth as number).toBeGreaterThan(balance.map.virtualWidth / 2);
    // …and no plate is painted over it.
    expect(
      debugged.parts.objects.some(
        (o) => o.kind === "rect" && o.rectW === panel.width && o.rectH === panel.height && o.visible,
      ),
      "?debug=1 still paints the panel plate over the readout",
    ).toBe(false);
  });

  it("⚠ ?debug=1 restores EVERY line of the readout, faults in their old place included", () => {
    const plain = mount();
    const debugged = withSearch("?debug=1", () => mount());
    const painted = visibleHud(debugged);
    // Every line the DEFAULT screen computes — player, fault and diagnostic alike — is painted.
    for (const line of plain.hud().split("\n")) {
      if (line.trim().length === 0) continue;
      expect(painted, `?debug=1 dropped "${line}"`).toContain(line);
    }
    expect(
      painted.split("\n").length,
      "?debug=1 paints no more lines than the default does — the flag changed nothing",
    ).toBeGreaterThan(visibleHud(plain).split("\n").length);
  });
});
