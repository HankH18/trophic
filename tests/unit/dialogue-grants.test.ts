/**
 * tests/unit/dialogue-grants.test.ts — MAREN'S SATCHEL ACTUALLY OPENS.
 *
 * ══ WHAT WAS TRUE BEFORE, MEASURED ══
 * `DialogueEntry.grants` was authored (`data/dialogue.json` `maren.tutorial.snare`: `"grants":
 * {"base": 3}`), typed (`core/dialogue-schema.ts`), and validated twice over — the key must be a
 * real bag id, and a must-write path analysis over the goto graph proves a granting entry cannot
 * fire twice. And NOTHING READ IT. Searched across `game/` and `core/`: the only occurrences of the
 * identifier outside the schema module were the schema's own tests. So Maren said "Snares first.
 * Three of them, in the satchel by the door." and the player's bag stayed empty.
 *
 * That absence had a second face, and it is the one a player feels. `core/battle.ts` `bagHas`
 * treats a key the bag does not carry as untracked-and-therefore-UNLIMITED, and a fresh save was
 * `items: {}` — so before this wiring every snare in the game was free and infinite. The moment the
 * grant lands `items.base` exists and the meter is ON for that tier. §5 below is that transition,
 * measured through `core/battle.ts` itself rather than reasoned about.
 *
 * ⚠ AND FOR A WHILE IT WAS ON FOR THAT TIER ALONE, WHICH WAS WORSE THAN IT SOUNDS. `core/types.ts`
 * `SNARE_TIERS` has three, the corpus stocks one, and nothing else in `data/`, `game/` or `core/`
 * wrote another into `save.items` — so the other two kept no key, `bagHas` kept answering
 * "unlimited" for them, and `game/battle-input.ts` `snareEntries` offers all three from a FIXED
 * LIST rather than from the bag. The master snare, the one the shop deliberately does not sell,
 * therefore sat un-greyed on the menu of a brand-new save: a player who spent Maren's three could
 * select the best tier in the game and catch for ever. THE TIERS THE GAME GRANTED WERE THE ONLY
 * METERED ONES.
 *
 * `core/save.ts` `newSave` now seeds `emptyMeteredBag` — every snare tier and both medicines at
 * ZERO — so the meter is on from boot for all of them and a grant only puts stock in. That is what
 * §5 asserts now, on saves the game produced rather than on bags a test wrote.
 *
 * ══ WHAT IS PROVED HERE, EACH WRITTEN TO BE ABLE TO FAIL ══
 *   §1 the run ACCUMULATES the grant — and only when the entry COMPLETES, never on entry;
 *   §2 `applyRunGrants` moves it into the bag: a zeroed bag → that bag with `base` at 3;
 *   §3 twice is still three — the corpus's own latch closes the entry, and the wiring respects it;
 *   §4 L10: the grant is ON THE TAPE, and `replay` of that tape reaches a byte-identical save —
 *      including the negative half, that a tape with the grant entry stripped replays to a bag
 *      holding no stock, so the arm is what carries it and not a coincidence;
 *   §5 the meter: the reducer's absent-key reading is still what it was, and no real save presents
 *      it any more. On saves the game produced — fresh, granted, spent out — the tier the corpus
 *      stocks is the only one that ever becomes throwable, and every tier it does not stock is
 *      refused at all three. Asserted over all of `SNARE_TIERS`, because the granted one alone
 *      cannot tell the difference;
 *   §6 THE WIRING, through the real `OverworldScene`: a fresh scene mounted at the slice's start
 *      node plays the opening chain and the save it hands back carries the three snares. This is
 *      the section the other five cannot stand in for — every one of them calls `applyRunGrants`
 *      itself, and this repo has already shipped a seam whose function was green while zero
 *      callers called it (`applyBattleResult`, four launchers, none wired).
 *
 * ══ WHAT THIS FILE DOES NOT COVER, SAID OUT LOUD ══
 * `game/wild-battle.ts` `applyBattleResult`'s trainer payout is a sibling change owned by another
 * lane; nothing here asserts on `money`.
 *
 * The Phaser stub below §0 is copied from `tests/unit/overworld-scene.test.ts`, which is the
 * repo's convention — six test files carry their own `vi.mock("phaser")` and there is no shared
 * one. It is a stub of the ENGINE, never of the code under test.
 */

import { describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════════════════════
 * §0 The stub engine — copied verbatim from tests/unit/overworld-scene.test.ts
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

import { illegalActionReason, makeBattleContext, predationOracleFromWebs, startBattle } from "@core/battle";
import { conditionHolds, type DialogueEntry } from "@core/dialogue-schema";
import { deriveFoodWeb, indexSpecies, toEcoNode } from "@core/foodweb";
import {
  GRANT_ACTION,
  canonicalStringify,
  deserialize,
  newSave,
  openStreams,
  readGrant,
  replay,
  serialize,
  type SaveEnvelope,
} from "@core/save";
import { validateContent } from "@core/schemas";
import { SNARE_TIERS } from "@core/types";
import type { Balance, Content, NodeFile, OwnedCreature, SnareTier } from "@core/types";
import {
  DIALOGUE,
  advanceRun,
  applyRunFlags,
  applyRunGrants,
  autoplayEntryFor,
  beginRun,
  currentEntry,
  dialogueContext,
  runHeadless,
  type DialogueRunState,
} from "@game/dialogue-runner";
import type { Encounter } from "@game/encounters";
import { OverworldScene, type OverworldSceneData } from "@game/scenes/OverworldScene";
import { buildWildBattle, provisionalStarter } from "@game/wild-battle";

const content: Content = validateContent();
const balance: Balance = content.balance;

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures — every one of them DERIVED from the shipped data (G2). No entry id, item id, count
 * or node name is typed into this file.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The corpus's granting entries, found rather than named.
 *
 * ⚠ THE WHOLE FILE HANGS OFF THIS BEING NON-EMPTY, so it is asserted and not assumed: if
 * `data/dialogue.json` ever stops granting anything, every section below would pass vacuously
 * against a bag that was empty for the boring reason. The rig check is §0's first `it`.
 */
const GRANTING: readonly DialogueEntry[] = DIALOGUE.entries.filter((e) => e.grants !== undefined);

/** The node the opening chain plays in — the granting entry's own, read off the corpus. */
const START_NODE = GRANTING[0]?.node ?? "";

function nodeFile(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

function fresh(nodeId = START_NODE): SaveEnvelope {
  return newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);
}

function starter(): OwnedCreature {
  const base = provisionalStarter(content);
  if (!base) throw new Error("data ships no starter line — the fixture cannot be built");
  return base;
}

/** What the granting entries hand over, summed — the number every section below compares against. */
function expectedGrant(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of GRANTING) {
    for (const [itemId, qty] of Object.entries(entry.grants ?? {})) out[itemId] = (out[itemId] ?? 0) + qty;
  }
  return out;
}

/**
 * THE KEYS A NEW SAVE'S BAG TRACKS AT ZERO — every snare tier and both medicines, which is every
 * bag key `game/battle-input.ts` offers from a FIXED LIST rather than from the bag's own contents.
 *
 * Assembled here out of `core/types.ts` `SNARE_TIERS` and `balance.medicine`, deliberately NOT by
 * calling `core/save.ts` `emptyMeteredBag`: a test that asks the code under test what the answer is
 * cannot notice the answer changing. Nothing here is a coined id (G2/G11).
 */
const METERED_KEYS: readonly string[] = [
  ...SNARE_TIERS,
  balance.medicine.salveItemId,
  balance.medicine.tonicItemId,
];
const ZEROED_BAG: Record<string, number> = Object.fromEntries(METERED_KEYS.map((k) => [k, 0]));

/** `stock` laid over the bag a new save starts holding — what `save.items` reads after a grant. */
function bagWith(stock: Record<string, number>): Record<string, number> {
  return { ...ZEROED_BAG, ...stock };
}

/**
 * Play every autoplay beat this save has queued at its node, adopting what each run wrote, until
 * the node has nothing left to say.
 *
 * THIS IS THE SHAPE `OverworldScene.finishDialogue` HAS, reduced to the two writes it makes —
 * `applyRunFlags` then `applyRunGrants`, off the same run state. Used by §3 to ask the question a
 * single `runHeadless` cannot: what happens when the player is put back at the start node a SECOND
 * time with the flags the first visit wrote already on the save.
 */
function playAllQueued(start: SaveEnvelope): { save: SaveEnvelope; played: string[] } {
  let save = start;
  const played: string[] = [];
  for (let guard = 0; guard < DIALOGUE.entries.length; guard += 1) {
    const entry = autoplayEntryFor(DIALOGUE, save.currentNode, dialogueContext(save, content));
    if (!entry) break;
    const state = runHeadless(DIALOGUE, entry.id);
    played.push(...state.visited);
    save = applyRunGrants(applyRunFlags(save, state), state);
  }
  return { save, played };
}

/* ════════════════════════════════════════════════════════════════════════════
 * §0 The rig
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§0 the rig", () => {
  it("the shipped corpus grants something, and a fresh save's bag is empty", () => {
    expect(GRANTING.length, "no entry in data/dialogue.json grants — every section below is vacuous")
      .toBeGreaterThan(0);
    expect(Object.keys(expectedGrant()).length).toBeGreaterThan(0);
    /*
     * ⚠ THIS ASSERTION WAS CHANGED, AND IT WAS TIGHTENED. It read `expect(fresh().items).toEqual({})`.
     * `core/save.ts` `newSave` now seeds `emptyMeteredBag` — every snare tier and both medicines at
     * ZERO — so a fresh bag is no longer the empty object and the old line failed on a key set, not
     * on a count. What the old line existed to guarantee was that a fresh save holds NO STOCK, or
     * every "the grant put this here" claim below would be trivial. That requirement is asserted
     * directly now and is unchanged; the per-key half beneath it is NEW coverage the old line had
     * none of, and it is the half that fails if the seed is reverted.
     */
    const bag = fresh().items;
    expect(
      Object.entries(bag).filter(([, n]) => n !== 0),
      "newSave seeds STOCK — the {} → {items} claim would be trivial",
    ).toEqual([]);
    for (const key of METERED_KEYS) {
      expect(
        bag[key],
        `a fresh bag does not track "${key}" — core/battle.ts bagHas reads an absent key as UNLIMITED`,
      ).toBe(0);
    }
  });

  it("every granting entry is reachable from an autoplay beat at its own node", () => {
    // Otherwise §6's scene mount would prove nothing about the entry this file is about.
    const { played } = playAllQueued({ ...fresh(), party: [starter()] });
    for (const entry of GRANTING) {
      expect(played, `"${entry.id}" grants but no queued beat at ${entry.node} reaches it`).toContain(
        entry.id,
      );
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The run accumulates on COMPLETION, never on entry
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 DialogueRunState.granted", () => {
  it("a run that has ENTERED the granting entry but not finished it has granted nothing", () => {
    /*
     * `visited` records that an entry came on screen; `granted` must record that it was LEFT. The
     * difference is a player who closes the box on Maren's first line: the corpus's latch flag is
     * written by `setFlags` on the same transition, so a payout that fired on entry would hand over
     * stock the latch then refuses to hand over again — the player keeps the snares and never hears
     * the line, or hears it and keeps nothing, depending on which side of the split ran.
     */
    const entry = GRANTING[0]!;
    let state: DialogueRunState = beginRun(DIALOGUE, entry.id);
    expect(state.visited).toContain(entry.id);
    expect(state.granted).toEqual({});

    // Walk to the LAST line of the entry — still inside it, nothing written.
    for (let i = 0; i < entry.lines.length - 1; i += 1) {
      state = advanceRun(DIALOGUE, state);
      expect(currentEntry(DIALOGUE, state).id, "the walk left the entry early").toBe(entry.id);
      expect(state.granted, `granted after ${String(i + 1)} presses inside the entry`).toEqual({});
      expect(state.flags, "the latch flag moved without the grant — they must move together").toEqual({});
    }

    /*
     * AND A SAVE HANDED THAT ABANDONED RUN GETS NOTHING — the identity check, not merely an empty
     * bag: `applyRunGrants` must not even reach the tape. Today no scene path can deliver a partial
     * run (`game/scenes/DialogueScene.ts` `finish()` fires `onDone` only once the state is
     * `finished`), so this is the guard on the day one can — an ESC-to-close, a scene shutdown
     * mid-chain — rather than a claim about a path that exists.
     */
    const before = fresh();
    expect(applyRunGrants(before, state)).toBe(before);

    // THE PRESS THAT LEAVES IT writes both, in one transition.
    state = advanceRun(DIALOGUE, state);
    expect(state.granted).toEqual(entry.grants);
    for (const [flag, value] of Object.entries(entry.setFlags ?? {})) {
      expect(state.flags[flag], `the grant landed but its latch "${flag}" did not`).toBe(value);
    }
  });

  it("a run of the whole chain carries every grant in it, summed once each", () => {
    const opening = autoplayEntryFor(DIALOGUE, START_NODE, dialogueContext(fresh(), content));
    expect(opening, `no autoplay beat at ${START_NODE}`).toBeDefined();
    const state = runHeadless(DIALOGUE, opening!.id);
    expect(state.finished).toBe(true);
    expect(state.problem).toBeNull();
    expect(state.granted).toEqual(expectedGrant());
  });

  it("a run that never reaches a granting entry grants nothing", () => {
    const notGranting = DIALOGUE.entries.find(
      (e) => e.grants === undefined && e.goto === undefined && (e.choices ?? []).length === 0,
    );
    expect(notGranting, "the corpus has no terminal non-granting entry").toBeDefined();
    expect(runHeadless(DIALOGUE, notGranting!.id).granted).toEqual({});
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 applyRunGrants puts it in the bag
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the bag", () => {
  it("a zeroed bag → the corpus's own counts, through applyRunGrants", () => {
    const before = fresh();
    // ⚠ BOTH ASSERTIONS CHANGED FROM `{}` / `expectedGrant()`, for the reason §0 records: the bag a
    // new save starts with is the METERED one, not the empty one, so the grant raises a key that is
    // already there instead of creating it. The counts compared are the corpus's, exactly as before.
    expect(before.items).toEqual(ZEROED_BAG);
    const state = runHeadless(DIALOGUE, autoplayEntryFor(DIALOGUE, START_NODE, dialogueContext(before, content))!.id);
    const after = applyRunGrants(before, state);
    expect(after.items).toEqual(bagWith(expectedGrant()));
    // And it touched nothing else it was not asked to.
    expect(canonicalStringify({ ...after, items: {}, actionLog: [] })).toBe(
      canonicalStringify({ ...before, items: {}, actionLog: [] }),
    );
  });

  it("a run with no grants is handed back the SAME save, log included", () => {
    // The early return matters for L10: 200-odd entries appending empty grant records would make
    // the tape mostly no-ops, and every one of them would have to replay identically for ever.
    const before = fresh();
    const empty = beginRun(DIALOGUE, DIALOGUE.entries[0]!.id);
    expect(empty.granted).toEqual({});
    expect(applyRunGrants(before, empty)).toBe(before);
  });

  it("it ADDS rather than replaces — a second grant onto a stocked bag sums", () => {
    const state = runHeadless(DIALOGUE, autoplayEntryFor(DIALOGUE, START_NODE, dialogueContext(fresh(), content))!.id);
    const once = applyRunGrants(fresh(), state);
    const twice = applyRunGrants(once, state);
    for (const [itemId, qty] of Object.entries(expectedGrant())) {
      expect(twice.items[itemId], `"${itemId}" did not accumulate`).toBe(qty * 2);
    }
    /*
     * ⚠ THIS IS THE FUNCTION BEING ADDITIVE, NOT THE GAME PAYING TWICE. Nothing in the game can
     * reach this state — §3 is the proof of that, and it is the corpus's latch that does it.
     */
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 Exactly once — the corpus's latch, and the wiring that respects it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the latch", () => {
  it("playing everything queued at the start node twice leaves the same stock, not double", () => {
    const first = playAllQueued({ ...fresh(), party: [starter()] });
    // ⚠ CHANGED FROM `expectedGrant()` — see §0. The corpus's counts are compared unchanged; what
    // is added is the zeroed remainder `newSave` now seeds, which the old form did not know about.
    expect(first.save.items).toEqual(bagWith(expectedGrant()));
    for (const entry of GRANTING) {
      expect(first.played.filter((id) => id === entry.id), `"${entry.id}" played more than once`)
        .toHaveLength(1);
    }

    // Back at the same node with the first visit's flags on the save — the second visit is what a
    // reload, a re-entry or a `restart` looks like.
    const second = playAllQueued(first.save);
    expect(second.save.items, "the second visit paid out again").toEqual(bagWith(expectedGrant()));
    for (const entry of GRANTING) {
      expect(second.played, `"${entry.id}" was reachable a second time`).not.toContain(entry.id);
    }
  });

  it("the mechanism is the entry's OWN `when`, gone false against the save it wrote", () => {
    /*
     * Names the cause rather than observing the effect. `core/dialogue-schema.ts` refuses a
     * granting entry that is not self-latching; this is that refusal being load-bearing at runtime
     * — the flag the entry's `setFlags` wrote is the flag its `when` excludes.
     */
    const after = playAllQueued({ ...fresh(), party: [starter()] }).save;
    const ctx = dialogueContext(after, content);
    for (const entry of GRANTING) {
      expect(entry.when, `"${entry.id}" grants with no condition — nothing can close it`).toBeDefined();
      expect(conditionHolds(entry.when, ctx), `"${entry.id}" is still eligible after it paid out`)
        .toBe(false);
    }
  });

  it("and the tape carries exactly one grant entry, not one per visit", () => {
    const twice = playAllQueued(playAllQueued({ ...fresh(), party: [starter()] }).save).save;
    const grants = twice.actionLog.filter((e) => readGrant(e.action) !== null);
    expect(grants).toHaveLength(1);
    expect(readGrant(grants[0]!.action)).toEqual(expectedGrant());
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 L10 — the grant is on the tape and replay reaches the same save
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 the tape", () => {
  const live = (): SaveEnvelope => playAllQueued({ ...fresh(), party: [starter()] }).save;

  it("the write goes through appendAction, under the grant discriminant", () => {
    const save = live();
    const entries = save.actionLog.filter((e) => (e.action as { t?: unknown }).t === GRANT_ACTION);
    expect(entries, "applyRunGrants wrote the bag without putting it on the tape").toHaveLength(1);
    expect(entries[0]!.seq).toBe(save.actionLog.indexOf(entries[0]!));
    expect(readGrant(entries[0]!.action), "the payload is not one core/save.ts can read back")
      .toEqual(expectedGrant());
  });

  it("replay() of that tape reproduces the live save byte for byte", () => {
    const before: SaveEnvelope = { ...fresh(), party: [starter()] };
    const after = playAllQueued(before).save;

    // THE RIG FIRST: if the run changed nothing, an empty replay would agree with it trivially.
    expect(canonicalStringify(after.items)).not.toBe(canonicalStringify(before.items));

    const replayed = replay({ ...before, actionLog: [] }, after.actionLog, {
      gyms: content.gyms,
      species: content.species,
      balance,
      nodes: content.nodes,
    });
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(after.items));
    /*
     * ⚠ `questFlags` IS DELIBERATELY NOT COMPARED, and the whole save is not serialize-equal here.
     * `applyRunFlags` writes the save DIRECTLY and puts nothing on the tape — that is the shipped
     * design and it is another lane's question, not this one's. Comparing the whole envelope would
     * make this section red for a reason that has nothing to do with grants. The bag is the
     * quantity this change owns, and it is compared in full, canonicalised, key order included.
     */
    expect(serialize({ ...replayed, questFlags: after.questFlags })).toBe(serialize(after));
  });

  it("and it is the GRANT ENTRY that carries it — strip it and the replayed bag holds no stock", () => {
    /*
     * The sibling above would be satisfied by any tape that happened to reproduce the bag. This one
     * names the mechanism, and it is the shape the repo's own `applyBattleAftermath` test uses:
     * a test that stays green when the code it is about is deleted binds nothing.
     */
    const before: SaveEnvelope = { ...fresh(), party: [starter()] };
    const after = playAllQueued(before).save;
    const stripped = after.actionLog
      .filter((e) => readGrant(e.action) === null)
      .map((e, i) => ({ ...e, seq: i }));
    expect(stripped.length).toBeLessThan(after.actionLog.length);

    const deps = { gyms: content.gyms, species: content.species, balance, nodes: content.nodes };
    const without = replay({ ...before, actionLog: [] }, stripped, deps);
    // ⚠ CHANGED FROM `{}` — see §0. And the stripped replay is now WORSE off than it used to be,
    // not better: with the tiers metered from boot the replayed player cannot throw a snare at all,
    // where before the missing key read as an unlimited supply.
    expect(without.items).toEqual(ZEROED_BAG);
    expect(canonicalStringify(without.items)).not.toBe(canonicalStringify(after.items));
  });

  it("the entry survives serialize → deserialize and still replays", () => {
    // `core/schemas.ts` validates `actionLog[].action` as a permissive `looseObject`; a `z.object`
    // there would silently strip the payload and the grant would replay as a no-op.
    const before: SaveEnvelope = { ...fresh(), party: [starter()] };
    const after = playAllQueued(before).save;
    const reloaded = deserialize(serialize(after), balance);
    expect(serialize(reloaded)).toBe(serialize(after));

    const replayed = replay({ ...before, actionLog: [] }, reloaded.actionLog, {
      gyms: content.gyms,
      species: content.species,
      balance,
      nodes: content.nodes,
    });
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(after.items));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 The meter — what the player can and cannot do after this
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 EVERY tier is counted from boot — the grant only puts stock in", () => {
  const NODE = content.nodes.find((n) => n.walkable && Object.keys(n.populations).length > 0)!;

  /**
   * The tiers the corpus's grant stocks, and the ones it leaves alone — derived from `SNARE_TIERS`
   * and the corpus, never typed (G2/G11). `weighted` and `master` do not appear in this file; they
   * appear in `core/types.ts` and are read from there.
   */
  const GRANTED_TIERS: readonly SnareTier[] = SNARE_TIERS.filter(
    (t) => expectedGrant()[t] !== undefined,
  );
  const UNGRANTED_TIERS: readonly SnareTier[] = SNARE_TIERS.filter(
    (t) => expectedGrant()[t] === undefined,
  );

  /** Why the reducer would refuse this tier out of a save that carries exactly `save.items`. */
  function snareLegalOn(save: SaveEnvelope, tier: SnareTier): string | null {
    const lineId = Object.keys(NODE.populations)[0]!;
    const encounter: Encounter = { nodeId: NODE.id, lineId, age: "J", level: 3, traits: [] };
    const built = buildWildBattle({ content, save, encounter, node: toEcoNode(NODE) });
    const { state } = startBattle(built.input, built.ctx);
    return illegalActionReason(state, { kind: "snare", tier }, built.ctx);
  }

  /**
   * The same question against a bag written by hand — `items` REPLACES the save's own.
   *
   * ⚠ USE THIS ONLY TO ASK WHAT THE REDUCER DOES WITH A GIVEN BAG, never to ask what a player
   * holds. `{}` is not a state any real save reaches any more (`core/save.ts` `emptyMeteredBag`),
   * and a test that reaches for it is asking about `bagHas` rather than about the game.
   */
  function snareLegalWith(items: Record<string, number>, tier: SnareTier): string | null {
    return snareLegalOn({ ...fresh(NODE.id), party: [starter()], items }, tier);
  }

  it("the tier list is really a partition — something is stocked and something is not", () => {
    // The rig for both tests below. Without it either could pass over an empty loop.
    expect(SNARE_TIERS.length).toBeGreaterThan(1);
    expect(GRANTED_TIERS.length, "the corpus stocks no snare tier — the meter cannot be shown")
      .toBeGreaterThan(0);
    expect(
      UNGRANTED_TIERS.length,
      `every tier in [${SNARE_TIERS.join(", ")}] is now stocked. Catching may now be metered end ` +
        `to end — restate this section's claim against what is now true, do not delete this test.`,
    ).toBeGreaterThan(0);
  });

  it("in the REDUCER the key is still the switch — absent is unlimited, zero is refused", () => {
    /*
     * `core/battle.ts` `bagHas` reads a key absent from the bag as untracked-and-therefore-
     * unlimited. That reading has not changed and must not be quoted from its comment, so this is
     * it measured on the real reducer — the affordance the balance harness relies on, which carries
     * no bag at all.
     *
     * ⚠ AND IT IS WHY `newSave` HAS TO SEED THE KEYS. The `{}` bag below is a hand-written one; the
     * test beneath this shows that no real save presents one any more, which is the only reason the
     * absent-key reading is no longer something a player can stand in.
     */
    // The same bag once the key EXISTS and is spent out. Built with the same core applier the live
    // path uses, at the count `bagConsume` decrements to, so no bag here is hand-written.
    const spentOut = { ...expectedGrant() };
    for (const key of Object.keys(spentOut)) spentOut[key] = 0;

    for (const tier of GRANTED_TIERS) {
      expect(snareLegalWith({}, tier), `an empty bag already meters ${tier} — the premise is wrong`)
        .toBeNull();
      expect(snareLegalWith(spentOut, tier), `a zeroed ${tier} stack is still throwing for free`)
        .not.toBeNull();
      // And the stock the corpus hands over is legal, which is the state a player is left in.
      expect(snareLegalWith(expectedGrant(), tier)).toBeNull();
    }
  });

  it("⚠ for the UNGRANTED tiers a REAL save is refused — at boot, after the grant, and spent out", () => {
    /*
     * ⚠ THIS TEST REPLACES ONE THAT ASSERTED THE OPPOSITE, ON THAT TEST'S OWN INSTRUCTION. It was
     * named "for the UNGRANTED tiers NOTHING CHANGES — a spent-out player just throws a better
     * snare" and it closed: "If someone meters these tiers, this test goes RED on purpose: the
     * section's claim would have changed and must be rewritten to the new truth, never loosened
     * back to this one." That is what happened, so this is the new truth.
     *
     * WHAT IT DID NOT CATCH, AND WHY THE REWRITE IS A STRENGTHENING. Every one of its assertions
     * ran against a bag written by the test (`{}`, `expectedGrant()`, a zeroed copy) laid over the
     * save, so it was asking what `bagHas` does with a given map — and `bagHas` is unchanged, which
     * is why it stayed GREEN through the very change it was written to go red at. The question it
     * meant to ask is what a PLAYER holds, and only a save nobody overwrote can answer that. So
     * every bag below is the one the game actually produced: `newSave`'s, the corpus's grant on top
     * of it, and that one with the granted tier spent to zero through `applyGrant`'s own convention.
     *
     * `core/save.ts` `emptyMeteredBag` is what makes the answer "refused": the tier the game
     * withholds is now a key at zero rather than no key at all, so the master snare is not sitting
     * un-greyed on the menu of a brand-new save. Revert that seed and all three legs go red.
     */
    const atBoot = { ...fresh(NODE.id), party: [starter()] };
    const granted = playAllQueued(atBoot).save;
    const spentOut: SaveEnvelope = {
      ...granted,
      items: Object.fromEntries(Object.keys(granted.items).map((k) => [k, 0])),
    };

    for (const tier of UNGRANTED_TIERS) {
      expect(
        Object.prototype.hasOwnProperty.call(expectedGrant(), tier),
        `the corpus now grants ${tier} — it belongs in the metered half`,
      ).toBe(false);
      for (const [label, save] of [
        ["a fresh save", atBoot],
        ["the granted save", granted],
        ["the spent-out save", spentOut],
      ] as const) {
        expect(
          snareLegalOn(save, tier),
          `${label} throws ${tier} for free — the tier the game never granted is unmetered`,
        ).not.toBeNull();
      }
    }
  });

  it("and the GRANTED tier is the only one that becomes throwable, on the same real saves", () => {
    // The positive half, so the test above cannot pass by refusing everything: the corpus's own
    // tier IS legal once the grant lands, and refused again once it is spent.
    const atBoot = { ...fresh(NODE.id), party: [starter()] };
    const granted = playAllQueued(atBoot).save;
    const spentOut: SaveEnvelope = {
      ...granted,
      items: Object.fromEntries(Object.keys(granted.items).map((k) => [k, 0])),
    };
    for (const tier of GRANTED_TIERS) {
      expect(snareLegalOn(atBoot, tier), `${tier} is throwable before the grant`).not.toBeNull();
      expect(snareLegalOn(granted, tier), `${tier} is refused with the corpus's stock in the bag`).toBeNull();
      expect(snareLegalOn(spentOut, tier), `a spent-out ${tier} stack still throws`).not.toBeNull();
    }
  });

  it("the granted save is the one the launcher hands the reducer", () => {
    const granted = playAllQueued({ ...fresh(NODE.id), party: [starter()] }).save;
    const lineId = Object.keys(NODE.populations)[0]!;
    const built = buildWildBattle({
      content,
      save: granted,
      encounter: { nodeId: NODE.id, lineId, age: "J", level: 3, traits: [] },
      node: toEcoNode(NODE),
    });
    // ⚠ CHANGED FROM `expectedGrant()` — see §0. The launcher copies the whole of `save.items`, and
    // that is now the metered set with the corpus's counts laid over it.
    expect(built.input.bag).toEqual(bagWith(expectedGrant()));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 THE WIRING — the real OverworldScene, not a re-implementation of it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 the scene hands the player the snares", () => {
  function mount(save: SaveEnvelope): { scene: OverworldScene; data: OverworldSceneData } {
    const data: OverworldSceneData = {
      content,
      save,
      streams: openStreams(save, balance),
      msPerTile: 1,
    };
    const scene = new OverworldScene();
    scene.init(data);
    // `create()` is where the overworld plays whatever the corpus has queued for the node it is
    // standing in. No dialogue box is registered on this stub, so the beat runs HEADLESS through
    // `playEntry` → `handBack` → `finishDialogue` — the exact path the box's `onDone` takes.
    scene.create();
    return { scene, data };
  }

  it("a fresh scene at the start node ends create() with the granted stock on its save", () => {
    const before: SaveEnvelope = { ...fresh(), party: [starter()] };
    // ⚠ BOTH ASSERTIONS CHANGED FROM `{}` / `expectedGrant()` — see §0.
    expect(before.items).toEqual(ZEROED_BAG);
    const { scene } = mount(before);
    expect(scene.save.items, "finishDialogue adopted the run's flags but not its grants")
      .toEqual(bagWith(expectedGrant()));
    expect(scene.save.actionLog.filter((e) => readGrant(e.action) !== null)).toHaveLength(1);
  });

  it("and mounting a SECOND time on that save pays nothing more", () => {
    const first = mount({ ...fresh(), party: [starter()] }).scene.save;
    const second = mount(first).scene.save;
    expect(second.items, "the scene paid out twice").toEqual(bagWith(expectedGrant()));
    expect(second.actionLog.filter((e) => readGrant(e.action) !== null)).toHaveLength(1);
  });

  it("the scene's save still replays to itself", () => {
    const before: SaveEnvelope = { ...fresh(), party: [starter()] };
    const after = mount(before).scene.save;
    // THE RIG FIRST: with the wiring gone both sides are `{}` and the comparison is vacuous —
    // measured, this assertion is what makes the section fail under that sabotage.
    expect(canonicalStringify(after.items)).not.toBe(canonicalStringify(before.items));
    const replayed = replay({ ...before, actionLog: [] }, after.actionLog, {
      gyms: content.gyms,
      species: content.species,
      balance,
      nodes: content.nodes,
    });
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(after.items));
  });
});
