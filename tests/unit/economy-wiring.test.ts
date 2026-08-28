/**
 * tests/unit/economy-wiring.test.ts — the WIRING of the two economy primitives, as distinct from
 * the primitives themselves.
 *
 * `tests/unit/economy-primitives.test.ts` proves that `core/save.ts`'s `payoutAction`/`applyPayout`
 * and `grantAction`/`applyGrant` work, and that `replay` has an arm for each. It cannot prove that
 * anything in `game/` ever CALLS them — and until this file's seam landed, nothing did:
 *
 *   • `data/dialogue.json` carries a `grants` block that `core/dialogue-schema.ts` validates,
 *     type-checks and proves cannot fire twice. No module in `game/` or `core/` read it. The stock
 *     it names never reached a bag.
 *   • `balance.economy.trainerPayoutPerLevel` priced a purse that nothing levied. `save.money`
 *     moved for no reason in the whole repo.
 *
 * WHAT THAT COST, and why §6 below is the test nobody had written. `core/battle.ts` `bagHas` reads
 * a key ABSENT from the bag as untracked-and-therefore-UNLIMITED. A fresh save carries `items: {}`,
 * so every snare in the shipped game was free and infinite. Every existing catching test mints its
 * own bag — `{master: 99}`, `{master: 4}`, `{master: 3}` — so every one of them exercised the
 * METERED path and none of them could notice that the path a player walks is the unmetered one.
 * §6 asserts what a FRESH save's bag actually is, and then walks the meter from off to on.
 *
 * ⚠ AND IT ONLY WALKS ON FOR ONE TIER, WHICH THIS FILE NOW SAYS OUT LOUD. The corpus's single
 * granting entry hands over ONE snare tier. `applyGrant` creates only the keys it is given and
 * nothing else in `data/`, `game/` or `core/` ever writes another tier into `save.items`, so after
 * the tutorial the player holds a metered stack of the granted tier and — by `bagHas`'s absent-key
 * reading — an UNLIMITED supply of every other tier, the strongest included. CATCHING AS A WHOLE IS
 * NOT METERED; the weakest tier is. §6 asserts that over ALL of `SNARE_TIERS`, so the claim is the
 * measured one and not the flattering one, and so that metering the rest turns this file red and
 * forces the claim to be restated rather than quietly outgrown.
 *
 * §7 IS THE OTHER THING THIS FILE DID NOT HAVE. §1–§6 all call `applyRunGrants` themselves, so all
 * of them stayed green when the production call in `game/scenes/OverworldScene.ts` was commented
 * out — the function behaved, the game handed the player nothing, and thirty tests agreed. §7
 * mounts the real scene and fails when that line is severed.
 *
 * ⚠ THIS FILE IS WRITTEN AGAINST THE PINNED SEAM, NOT AGAINST AN IMPLEMENTATION. It was authored
 * without reading `game/dialogue-runner.ts`, `game/wild-battle.ts` or `game/scenes/OverworldScene.ts`
 * as they now stand, deliberately: a test written from the code under test can only restate it. If
 * these are red, the wiring is not landed or does not match the seam — do not soften them.
 *
 * CONTENT IS READ, NEVER NAMED (G2): the granting entry, the chain that reaches it, the item ids it
 * grants and the count it grants are all found in `data/dialogue.json` at run time. The purse is
 * `balance.economy.trainerPayoutFlat` plus `.trainerPayoutPerLevel` × the summed levels, taken
 * through `trainerPayout` and never a literal (G11).
 */

import { describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════════════════════
 * THE STUB ENGINE — so §7 below can mount the REAL `OverworldScene`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Copied from `tests/unit/dialogue-grants.test.ts`, which copied it from
 * `tests/unit/overworld-scene.test.ts` — the repo's convention: several test files carry their own
 * `vi.mock("phaser")` and there is no shared one. It is a stub of the ENGINE, never of the code
 * under test. `game/wild-battle.ts`, `game/rival.ts` and `game/dialogue-runner.ts` are engine-free
 * (L11), so §1–§6 are untouched by its presence; only `@game/scenes/OverworldScene` needs it.
 */

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
import {
  illegalActionReason,
  startBattle,
  step as battleStep,
  type BattleContext,
} from "@core/battle";
import { conditionHolds, type DialogueEntry } from "@core/dialogue-schema";
import { subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import {
  canonicalStringify,
  newSave,
  openStreams,
  readGrant,
  readPayout,
  replay,
  serialize,
  trainerPayout,
  type SaveEnvelope,
} from "@core/save";
import { BATTLE_KINDS, SNARE_TIERS } from "@core/types";
import type {
  Balance,
  BattleAction,
  BattleInput,
  BattleOutcome,
  BattleState,
  Content,
  NodeFile,
  OwnedCreature,
} from "@core/types";
import {
  advanceRun,
  applyRunFlags,
  applyRunGrants,
  awaitingChoice,
  beginRun,
  chooseOption,
  dialogueContext,
  DIALOGUE,
  runHeadless,
  type DialogueRunState,
} from "@game/dialogue-runner";
import type { Encounter } from "@game/encounters";
import { buildRivalBattle, rivalAtNode, rivalParty } from "@game/rival";
import { OverworldScene, type OverworldSceneData } from "@game/scenes/OverworldScene";
import {
  applyBattleResult,
  buildWildBattle,
  liveNodeOf,
  provisionalStarter,
} from "@game/wild-battle";

const content: Content = validateContent();
const balance: Balance = content.balance;

/** The route every other persistence file measures at, so a fixture here is the fixture there. */
const NODE = "r1";

/** `replay` with nothing else in the process able to move money or the bag — see §4 and §5. */
const deps = {
  gyms: content.gyms,
  species: content.species,
  balance,
  nodes: content.nodes,
};
const inertDeps = { ...deps, applyOther: (save: SaveEnvelope): SaveEnvelope => save };

function nodeFile(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node "${id}" — the fixture cannot be built`);
  return found;
}

function starter(): OwnedCreature {
  const base = provisionalStarter(content);
  if (!base) throw new Error("data ships no starter line — the fixture cannot be built");
  return base;
}

/**
 * THE REAL BOOT SAVE — `newSave` exactly as `game/` seeds one, with no party and no bag invented
 * by this file. §6 asserts on this one directly; everywhere else it is the base a fixture adds to.
 */
function bootSave(): SaveEnvelope {
  return newSave(
    { seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes: content.nodes },
    balance,
  );
}

/** A save standing on the route with a fieldable party and whatever bag the test is about. */
function saveWith(party: OwnedCreature[], items: Record<string, number> = {}): SaveEnvelope {
  const base = newSave({ seed: 4242, currentNode: NODE, nodes: content.nodes }, balance);
  return { ...base, party: party.map((c) => ({ ...c })), items: { ...items } };
}

/**
 * ⚠ THE SEAM SAYS `applyBattleResult` "needs the battle KIND and OUTCOME to decide" and says to
 * WIDEN THE `Pick` rather than add a parameter, because all four launchers already hand it a whole
 * `BattleState`. It does not say where the `Balance` that `trainerPayout` prices from arrives.
 *
 * This alias is how that one unstated degree of freedom is absorbed without a cast that would hide
 * a real mismatch: a two-parameter implementation is assignable to it (a shorter function always
 * is), a three-parameter one taking `Balance` matches it exactly, and one taking `Balance | undefined`
 * satisfies it too. Every call below passes the SHIPPED balance, so an implementation that sources
 * its own must agree with `trainerPayout(levels, balance)` regardless. If this line fails to
 * compile, the third parameter is something other than a `Balance` and the seam needs restating —
 * it is NOT a licence to loosen the assertions underneath.
 */
type ApplyBattleResultFn = (
  save: SaveEnvelope,
  state: BattleState,
  balance: Balance,
) => SaveEnvelope;
const applyResult: ApplyBattleResultFn = applyBattleResult;

/** Play a battle to a terminal outcome, the player taking its first known move every turn. */
function playOut(input: BattleInput, ctx: BattleContext, cap = 4000): BattleState {
  const rng = subsystemRng(input.seed, "battle");
  let state = startBattle(input, ctx).state;
  for (let turn = 0; state.outcome === null && turn < cap; turn += 1) {
    const active = state.battlers[state.activePlayerUid];
    const moveId = active?.moves[0];
    if (moveId === undefined) throw new Error("the active player battler knows no moves");
    state = battleStep(state, { kind: "move", moveId }, rng, ctx).state;
  }
  return state;
}

/* ════════════════════════════════════════════════════════════════════════════
 * The corpus fixtures — found in `data/dialogue.json`, never typed here (G2)
 * ════════════════════════════════════════════════════════════════════════════ */

/** Every entry the shipped corpus grants stock from. */
const GRANTING: readonly DialogueEntry[] = DIALOGUE.entries.filter((e) => e.grants !== undefined);

/**
 * A granting entry, and an entry that REACHES it through the corpus's own goto/choice graph with at
 * least one entry played first — so a run can be abandoned before the grant and still have started.
 * Found by driving the corpus, not by naming an id.
 */
function findGrantChain(): { start: string; grantEntry: DialogueEntry } {
  for (const grantEntry of GRANTING) {
    for (const candidate of DIALOGUE.entries) {
      const played = runHeadless(DIALOGUE, candidate.id);
      const at = played.visited.indexOf(grantEntry.id);
      if (at > 0) return { start: candidate.id, grantEntry };
    }
  }
  throw new Error(
    "no entry in data/dialogue.json reaches a granting entry through a chain — the grant is " +
      "unreachable and this file's fixture cannot be built",
  );
}

const CHAIN = findGrantChain();
/** What the corpus says this entry hands over. The numbers are the canon's, read from the file. */
const GRANTS: Readonly<Record<string, number>> = { ...(CHAIN.grantEntry.grants ?? {}) };
/** A granted id that is a snare tier, so §6 can spend it through the reducer's own snare action. */
const GRANTED_TIER = SNARE_TIERS.find((t) => GRANTS[t] !== undefined);

/**
 * THE PARTITION §6 IS ABOUT, derived from `SNARE_TIERS` and the corpus — never typed (G2/G11).
 *
 * The tutorial's grant stocks the tiers on the left and says nothing about the tiers on the right,
 * and `core/battle.ts` `bagHas` reads a key the bag does not carry as untracked-and-unlimited. So
 * the right-hand list is the list of snares a post-tutorial player can throw for ever. Asserting
 * over BOTH halves is what stops this section claiming "the player is metered" when what is true is
 * "one tier of three is metered".
 */
type Tier = (typeof SNARE_TIERS)[number];
const GRANTED_TIERS: readonly Tier[] = SNARE_TIERS.filter((t) => GRANTS[t] !== undefined);
const UNGRANTED_TIERS: readonly Tier[] = SNARE_TIERS.filter((t) => GRANTS[t] === undefined);

/** Play `start` to the end, answering every choice with its first option (as `runHeadless` does). */
function fullRun(): DialogueRunState {
  return runHeadless(DIALOGUE, CHAIN.start);
}

/** Drive the same chain and STOP on entering `targetId`, before that entry has been left. */
function stopOnEntering(targetId: string): DialogueRunState {
  let state = beginRun(DIALOGUE, CHAIN.start);
  const budget = DIALOGUE.entries.reduce((n, e) => n + e.lines.length + 1, 0);
  for (let i = 0; i < budget; i += 1) {
    if (state.entryId === targetId) return state;
    if (state.finished) break;
    state = awaitingChoice(DIALOGUE, state)
      ? chooseOption(DIALOGUE, state, 0)
      : advanceRun(DIALOGUE, state);
  }
  throw new Error(`the run from "${CHAIN.start}" never entered "${targetId}"`);
}

/* ════════════════════════════════════════════════════════════════════════════
 * §0 The rig — every figure these tests spend is a real one
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§0 the fixtures are not vacuous", () => {
  it("the corpus really grants something, on a chain with something before it", () => {
    expect(GRANTING.length).toBeGreaterThan(0);
    expect(Object.keys(GRANTS).length).toBeGreaterThan(0);
    for (const id of Object.keys(GRANTS)) {
      expect(GRANTS[id], `the corpus grants "${id}" × 0 — nothing about it can be measured`)
        .toBeGreaterThan(0);
    }
    // The chain must have a step before the grant, or §2's "abandoned before it completes" has
    // nowhere to stand.
    const played = fullRun();
    expect(played.visited.indexOf(CHAIN.grantEntry.id)).toBeGreaterThan(0);
    expect(played.finished).toBe(true);
    expect(played.problem).toBeNull();
  });

  it("one of the granted ids is a snare tier, so §6 can spend it through the reducer", () => {
    expect(
      GRANTED_TIER,
      `the corpus grants [${Object.keys(GRANTS).join(", ")}], none of which is a snare tier ` +
        `[${SNARE_TIERS.join(", ")}] — §6's meter cannot be driven`,
    ).toBeDefined();
    // Not merely defined: it must be a tier the reducer's `snare` action accepts, and it must come
    // with a real stack, or §6's spend-down loop runs zero times and asserts nothing.
    expect(SNARE_TIERS).toContain(GRANTED_TIER);
    expect(GRANTS[GRANTED_TIER!]).toBeGreaterThan(0);
  });

  it("both purse terms are real figures and the shipped rival fields a real roster", () => {
    // A purse is `trainerPayoutFlat + trainerPayoutPerLevel × Σ levels`. Zero either tunable and
    // half of §5's arithmetic collapses to a figure that would pass over nothing, so both are
    // asserted before any expectation is derived from them.
    expect(balance.economy.trainerPayoutPerLevel).toBeGreaterThan(0);
    expect(balance.economy.trainerPayoutFlat).toBeGreaterThan(0);
    const rival = rivalAtNode(content, NODE);
    expect(rival, `no rival stands at ${NODE} — §5's fixture cannot be built`).not.toBeNull();
    const levels = rivalParty(rival!).map((s) => s.level);
    expect(levels.length).toBeGreaterThan(0);
    expect(trainerPayout(levels, balance)).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §1 A completed run carries the grant — exactly what the corpus says, exactly once
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 DialogueRunState.granted — the corpus's `grants` block, summed over the run", () => {
  it("a completed run carries the granted items verbatim", () => {
    const played = fullRun();
    expect(played.granted).toEqual(GRANTS);
  });

  it("it is not DOUBLED — the grant and its latch flag are written in one transition", () => {
    /*
     * The exact defect the seam forbids: a grant accumulated on `leaveEntry` AND again on the run's
     * finish. Both spellings produce a state that "has the grant", and `toEqual` above would pass
     * for neither — but a test that only asserted `granted.base > 0` would pass for both. Asserted
     * key by key against the corpus so the failure names the count.
     */
    const played = fullRun();
    expect(Object.keys(GRANTS).length).toBeGreaterThan(0);
    for (const id of Object.keys(GRANTS)) {
      expect(played.granted[id]).toBe(GRANTS[id]);
    }
    expect(Object.keys(played.granted).sort()).toEqual(Object.keys(GRANTS).sort());
    // …and the entry really was played once, so the count above is not one of two halves.
    expect(played.visited.filter((id) => id === CHAIN.grantEntry.id)).toHaveLength(1);
  });

  it("a run that never touches the granting entry carries nothing", () => {
    // Started AT the entry the grant flows into: the chain continues, the grant is behind it.
    const after = CHAIN.grantEntry.goto;
    if (after === undefined) {
      // The granting entry ends its chain; run a different entry that does not reach it at all.
      const other = DIALOGUE.entries.find(
        (e) => !runHeadless(DIALOGUE, e.id).visited.includes(CHAIN.grantEntry.id),
      );
      expect(other, "every entry in the corpus reaches the grant — this claim cannot be tested")
        .toBeDefined();
      expect(runHeadless(DIALOGUE, other!.id).granted).toEqual({});
      return;
    }
    const played = runHeadless(DIALOGUE, after);
    expect(played.visited).not.toContain(CHAIN.grantEntry.id);
    expect(played.granted).toEqual({});
  });

  it("a fresh run starts empty — `beginRun` grants nothing by beginning", () => {
    expect(beginRun(DIALOGUE, CHAIN.start).granted).toEqual({});
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 ENTERED IS NOT COMPLETED — an abandoned run has not paid out
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 a run abandoned before the granting entry completes grants nothing", () => {
  it("`visited` records the entry, and `granted` is still empty", () => {
    /*
     * `DialogueRunState.visited` records that an entry was ENTERED. A player who walks away from
     * the box mid-entry — or a scene torn down by ESC — must not have been paid. The seam puts the
     * accumulation in `leaveEntry`/`chooseOption` for exactly this reason, beside where `flags` is
     * already accumulated, so the grant and its latch flag are written in the same transition or
     * not at all.
     */
    const abandoned = stopOnEntering(CHAIN.grantEntry.id);
    expect(abandoned.entryId).toBe(CHAIN.grantEntry.id);
    expect(abandoned.finished).toBe(false);
    expect(abandoned.visited).toContain(CHAIN.grantEntry.id);
    expect(abandoned.granted).toEqual({});
  });

  it("…and `applyRunGrants` on that state writes nothing — no bag, no tape entry", () => {
    const abandoned = stopOnEntering(CHAIN.grantEntry.id);
    const save = bootSave();
    const after = applyRunGrants(save, abandoned);
    // Mirrors `applyRunFlags`'s "nothing to do" early return: the same object back.
    expect(after).toBe(save);
    expect(after.items).toEqual({});
    expect(after.actionLog).toHaveLength(0);
  });

  it("finishing from that very state DOES pay — the stopping point was one step short", () => {
    // Without this, the test above would pass on a `granted` field that is never written at all.
    let state = stopOnEntering(CHAIN.grantEntry.id);
    const budget = DIALOGUE.entries.reduce((n, e) => n + e.lines.length + 1, 0);
    for (let i = 0; i < budget && !state.finished; i += 1) {
      state = awaitingChoice(DIALOGUE, state)
        ? chooseOption(DIALOGUE, state, 0)
        : advanceRun(DIALOGUE, state);
    }
    expect(state.finished).toBe(true);
    expect(state.granted).toEqual(GRANTS);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 ONCE — the corpus's latch is what makes a second run pay nothing further
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the grant lands once", () => {
  it("the completed run's flags and grant reach the save together", () => {
    const before = bootSave();
    const played = fullRun();
    const after = applyRunGrants(applyRunFlags(before, played), played);
    expect(after.items).toEqual(GRANTS);
    // The latch the grant rides with — `core/dialogue-schema.ts` refuses a granting entry that does
    // not write one, so this is the corpus's own guarantee reaching the save.
    expect(Object.keys(after.questFlags).length).toBeGreaterThan(0);
  });

  it("a SECOND playthrough is not offered — the corpus will not select the chain again", () => {
    /*
     * "Exactly once" is enforced at SELECTION, not by the runner counting. `conditionHolds` is the
     * single resolution path (`core/dialogue-schema.ts`), so this asks the corpus the same question
     * `game/` asks it. The rig first: the entry must be offerable to a fresh save, or "no longer
     * offerable" is not a change.
     */
    const before = bootSave();
    const played = fullRun();
    const after = applyRunGrants(applyRunFlags(before, played), played);

    expect(conditionHolds(CHAIN.grantEntry.when, dialogueContext(before, content))).toBe(true);
    expect(conditionHolds(CHAIN.grantEntry.when, dialogueContext(after, content))).toBe(false);
  });

  it("the bag is not doubled by the run's flags being written twice", () => {
    // `applyRunFlags` is idempotent by construction; the grant is a DELTA and is not. This pins
    // that the flag write is the repeatable half and the grant is applied by ONE call.
    const before = bootSave();
    const played = fullRun();
    const once = applyRunGrants(applyRunFlags(applyRunFlags(before, played), played), played);
    expect(once.items).toEqual(GRANTS);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 THE GRANT IS ON THE TAPE — `replay` reaches a byte-identical save
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 applyRunGrants goes through the tape, not around it (L10 / build-doc §8.1)", () => {
  it("appends exactly one `grant` entry carrying what the corpus granted", () => {
    const before = bootSave();
    const live = applyRunGrants(before, fullRun());
    const grants = live.actionLog.filter((e) => readGrant(e.action) !== null);
    expect(grants).toHaveLength(1);
    expect(readGrant(grants[0]!.action)).toEqual(GRANTS);
    expect(live.actionLog.map((e) => e.seq)).toEqual([0]);
  });

  it("is ADDITIVE — an id the grant does not name survives, and one it does is added to", () => {
    const carried = Object.keys(GRANTS)[0]!;
    const untouched = SNARE_TIERS.find((t) => GRANTS[t] === undefined);
    expect(untouched, "the corpus grants every snare tier — additivity cannot be shown").toBeDefined();
    const before: SaveEnvelope = {
      ...bootSave(),
      items: { [carried]: 2, [untouched!]: 5 },
    };
    const live = applyRunGrants(before, fullRun());
    expect(live.items[carried]).toBe(2 + (GRANTS[carried] ?? 0));
    expect(live.items[untouched!]).toBe(5);
  });

  it("⚠ REPLAY REACHES A BYTE-IDENTICAL SAVE, with a host that understands nothing", () => {
    /*
     * THE MOST IMPORTANT ASSERTION IN THIS FILE. It is the one `{t:"innRest"}` did not have:
     * `core/recovery.ts` minted an entry `replay` had no arm for, the entry applied nothing, and
     * L10 was silently false for every run that slept — while the suite stayed green, because
     * `replay()` has ZERO production callers and nothing but a test can notice a missing arm.
     *
     * Compared through `serialize`, the repo's own canonical serializer, and not through a shallow
     * structural equality: `serialize` is what L10's "byte-identical" is a claim about, and a
     * `deepEqual` cannot see a key-order or numeric-precision divergence that a reload would.
     *
     * `applyOther` is present and is the IDENTITY, so nothing in this process except `replay`'s own
     * `case "grant"` arm can put the stock in.
     */
    const initial = bootSave();
    const live = applyRunGrants(initial, fullRun());

    // THE RIG FIRST: if the live path moved nothing, an empty replay would agree trivially.
    expect(canonicalStringify(live.items)).not.toBe(canonicalStringify(initial.items));
    expect(live.actionLog.length).toBeGreaterThan(0);

    const replayed = replay({ ...initial, actionLog: [] }, live.actionLog, inertDeps);
    expect(serialize(replayed)).toBe(serialize(live));
    expect(replayed.items).toEqual(GRANTS);
  });

  it("…and it is the ENTRY that carries it: strip it and the replayed bag stays empty", () => {
    // The other half. If the replay reached the same bag with the entry gone, the arm would not be
    // what applied it and the assertion above would be proving something else.
    const initial = bootSave();
    const live = applyRunGrants(initial, fullRun());
    const stripped = live.actionLog
      .filter((e) => readGrant(e.action) === null)
      .map((e, i) => ({ ...e, seq: i }));
    expect(
      stripped.length,
      "the tape had no grant entry to strip — the comparison below proves nothing",
    ).toBe(live.actionLog.length - 1);

    const replayed = replay({ ...initial, actionLog: [] }, stripped, inertDeps);
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(initial.items));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 THE PURSE — a beaten trainer pays, and only a beaten trainer
 * ════════════════════════════════════════════════════════════════════════════ */

/** The rival the shipped content stands at the route — `game/rival.ts` is the only authority. */
function rivalFight(party: OwnedCreature[]): { save: SaveEnvelope; state: BattleState; levels: number[] } {
  const save = saveWith(party);
  const rival = rivalAtNode(content, NODE);
  if (!rival) throw new Error(`no rival at ${NODE} — the fixture cannot be built`);
  const built = buildRivalBattle({
    content,
    save,
    rival,
    node: liveNodeOf(content, save, NODE),
  });
  return {
    save,
    state: playOut(built.input, built.ctx),
    levels: built.input.enemyParty.map((s) => s.level),
  };
}

/** A party the shipped rival roster loses to — levels are a fixture size, not a rule. */
function strongParty(): OwnedCreature[] {
  return [1, 2, 3].map((i) => ({ ...starter(), uid: `champion-${String(i)}`, level: 20, age: "A" as const }));
}

describe("§5 applyBattleResult levies the trainer purse", () => {
  it("a WON rival battle pays exactly `trainerPayout(enemyLevels, balance)`", () => {
    const { save, state, levels } = rivalFight(strongParty());
    expect(state.outcome, "the rival fixture did not resolve in a win — nothing is measured").toBe(
      "win",
    );
    const expected = trainerPayout(levels, balance);
    expect(expected, "the rival's roster prices at nothing — the assertion is vacuous").toBeGreaterThan(0);

    const after = applyResult(save, state, balance);
    expect(after.money - save.money).toBe(expected);
  });

  it("BOTH purse terms come from balance.json — the purse is not a compiled-in number (G11)", () => {
    // `trainerPayout` is the only thing that may price this. If `applyBattleResult` reproduced the
    // arithmetic with its own constants, this is the assertion that catches it: the paid amount
    // must track `balance.economy.trainerPayoutFlat` plus `trainerPayoutPerLevel` × the summed
    // levels, whatever those two figures are.
    const { save, state, levels } = rivalFight(strongParty());
    const flat = balance.economy.trainerPayoutFlat;
    const rate = balance.economy.trainerPayoutPerLevel;
    expect(flat).toBeGreaterThan(0);
    expect(rate).toBeGreaterThan(0);

    const paid = applyResult(save, state, balance).money - save.money;
    const summed = levels.reduce((n, l) => n + l, 0);
    expect(summed).toBeGreaterThan(0);
    expect(paid).toBe(Math.round(flat + rate * summed));
    // And the flat half is really in there, at the wiring rather than only at the primitive: the
    // purse a won fight levies is strictly more than the per-level half alone. `balance.economy.
    // _trainerPayout` records why the flat half exists — a purely per-level purse reproduces the
    // roster's own 15x growth, which is the curve Hank's ruling rejected.
    expect(paid).not.toBe(Math.round(rate * summed));
    expect(paid - Math.round(rate * summed)).toBe(flat);
  });

  it("a LOST rival battle pays nothing — and it really was a loss", () => {
    const { save, state } = rivalFight([starter()]);
    expect(state.outcome, "the losing fixture did not resolve in a loss").toBe("loss");
    const after = applyResult(save, state, balance);
    expect(after.money).toBe(save.money);
    expect(after.actionLog.filter((e) => readPayout(e.action) !== null)).toHaveLength(0);
  });

  it("ONLY the trainer kind earns — wild, gym and ancient pay nothing", () => {
    /*
     * The kind held as the only variable. Everything else — the roster, the outcome, the seed, the
     * damage taken — is the same won fight, so a difference in the purse can only be the kind.
     * `content-bible` §11 names the TRAINER battle as the earner and `game/rival.ts` is what builds
     * one (`kind: "trainer"`); `game/gym-battle.ts` and `game/finale.ts` build the other two.
     */
    const { save, state, levels } = rivalFight(strongParty());
    expect(state.outcome).toBe("win");
    const expected = trainerPayout(levels, balance);
    expect(BATTLE_KINDS.length).toBeGreaterThan(1);

    const paid: Record<string, number> = {};
    for (const kind of BATTLE_KINDS) {
      const after = applyResult(save, { ...state, kind }, balance);
      paid[kind] = after.money - save.money;
    }
    expect(paid[state.kind]).toBe(expected);
    const earners = BATTLE_KINDS.filter((k) => (paid[k] ?? 0) !== 0);
    expect(earners).toEqual([state.kind]);
  });

  it("ONLY a win earns — a fled, caught or escaped trainer fight pays nothing", () => {
    const { save, state, levels } = rivalFight(strongParty());
    const expected = trainerPayout(levels, balance);
    const outcomes: BattleOutcome[] = ["win", "loss", "fled", "caught", "escaped"];
    expect(outcomes).toContain(state.outcome);
    for (const outcome of outcomes) {
      const after = applyResult(save, { ...state, outcome }, balance);
      expect(after.money - save.money, `outcome "${outcome}" paid the wrong purse`).toBe(
        outcome === "win" ? expected : 0,
      );
    }
  });

  it("a won WILD fight through the real launcher pays nothing", () => {
    // The end-to-end for the kind the player meets most often: catching is not earning.
    const save = saveWith(strongParty());
    const lineId = Object.keys(nodeFile(NODE).populations)[0];
    expect(lineId, `node ${NODE} carries no populations — no wild fixture exists`).toBeDefined();
    const encounter: Encounter = { nodeId: NODE, lineId: lineId!, age: "J", level: 1, traits: [] };
    const built = buildWildBattle({
      content,
      save,
      encounter,
      node: liveNodeOf(content, save, NODE),
    });
    const state = playOut(built.input, built.ctx);
    expect(state.kind).toBe("wild");
    expect(state.outcome).not.toBeNull();
    const after = applyResult(save, state, balance);
    expect(after.money).toBe(save.money);
    expect(after.actionLog.filter((e) => readPayout(e.action) !== null)).toHaveLength(0);
  });

  it("⚠ THE PAYOUT IS ON THE TAPE, and replay reaches a byte-identical save", () => {
    /*
     * The same claim §4 makes about the grant, for the same reason: a money mutation made only in
     * the scene is an L10 violation the moment it happens, and `replay()` has no production caller
     * to make it visible. Two entries, not one — the fight's aftermath and then its prize.
     */
    const { save, state, levels } = rivalFight(strongParty());
    const live = applyResult(save, state, balance);

    const payouts = live.actionLog.filter((e) => readPayout(e.action) !== null);
    expect(payouts).toHaveLength(1);
    expect(readPayout(payouts[0]!.action)).toBe(trainerPayout(levels, balance));
    expect(live.actionLog.map((e) => e.seq)).toEqual(live.actionLog.map((_, i) => i));

    // THE RIG FIRST.
    expect(live.money).not.toBe(save.money);

    const replayed = replay({ ...save, actionLog: [] }, live.actionLog, inertDeps);
    expect(serialize(replayed)).toBe(serialize(live));
  });

  it("…and it is the ENTRY that carries it: strip it and the replay stays poor", () => {
    const { save, state } = rivalFight(strongParty());
    const live = applyResult(save, state, balance);
    const stripped = live.actionLog
      .filter((e) => readPayout(e.action) === null)
      .map((e, i) => ({ ...e, seq: i }));
    expect(
      stripped.length,
      "the tape had no payout entry to strip — the comparison below proves nothing",
    ).toBe(live.actionLog.length - 1);

    const replayed = replay({ ...save, actionLog: [] }, stripped, inertDeps);
    expect(replayed.money).toBe(save.money);
  });

  it("is levied EXACTLY ONCE per fight — the tape carries one purse, not two", () => {
    const { save, state, levels } = rivalFight(strongParty());
    const live = applyResult(save, state, balance);
    const total = live.actionLog
      .map((e) => readPayout(e.action))
      .filter((a): a is number => a !== null)
      .reduce((n, a) => n + a, 0);
    expect(total).toBe(trainerPayout(levels, balance));
    expect(live.money - save.money).toBe(total);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 THE META-TEST — what a REAL starting bag is, and the meter it turns on
 * ════════════════════════════════════════════════════════════════════════════ */

/** One wild fight in which the player throws a single snare of `tier`, then takes the aftermath. */
function throwOneSnare(save: SaveEnvelope, tier: (typeof SNARE_TIERS)[number]): {
  after: SaveEnvelope;
  bagInBattle: Record<string, number>;
  thrown: number;
  legalBefore: string | null;
} {
  const lineId = Object.keys(nodeFile(NODE).populations)[0];
  if (lineId === undefined) throw new Error(`node ${NODE} carries no populations`);
  const encounter: Encounter = { nodeId: NODE, lineId, age: "J", level: 1, traits: [] };
  const built = buildWildBattle({
    content,
    save,
    encounter,
    node: liveNodeOf(content, save, NODE),
  });
  const rng = subsystemRng(built.input.seed, "battle");
  const start = startBattle(built.input, built.ctx).state;
  const action: BattleAction = { kind: "snare", tier };
  const legalBefore = illegalActionReason(start, action, built.ctx);
  const stepped = battleStep(start, action, rng, built.ctx);
  return {
    after: applyResult(save, stepped.state, balance),
    bagInBattle: { ...stepped.state.bag },
    thrown: stepped.events.filter((e) => e.t === "snareThrown").length,
    legalBefore,
  };
}

describe("§6 the starting bag, and the meter the grant switches on", () => {
  it("a FRESH save's bag is EMPTY — the real starting inventory, not a test's own", () => {
    /*
     * ⚠ THE ASSERTION NOBODY HAD WRITTEN. Every catching test in this repo mints its own bag, so
     * every one of them measured the metered path while the shipped path was the unmetered one.
     * This is the fact all of §6 turns on, so it is asserted about `newSave` itself.
     */
    const boot = bootSave();
    expect(boot.items).toEqual({});
    expect(Object.keys(boot.items)).toHaveLength(0);
    expect(boot.money).toBe(0);
  });

  it("with that bag EVERY tier in SNARE_TIERS is unmetered — legal, free, and never out", () => {
    // Asserted over the whole tier list rather than the granted one: the empty bag is the state a
    // player boots into, and what it means is that NO snare is counted, not that one is not.
    expect(SNARE_TIERS.length).toBeGreaterThan(0);
    for (const tier of SNARE_TIERS) {
      const save = saveWith([starter()]);
      expect(save.items).toEqual({});

      const first = throwOneSnare(save, tier);
      expect(first.legalBefore, `${tier} was refused before the meter even existed`).toBeNull();
      expect(first.thrown, `no ${tier} snare was actually thrown — nothing is measured`).toBe(1);
      // `core/battle.ts` `bagConsume` returns early on a key the bag does not carry, so the throw
      // costs nothing and `applyBattleAftermath` writes the same empty bag back.
      expect(first.bagInBattle[tier]).toBeUndefined();
      expect(first.after.items).toEqual({});

      // …and it never runs out. Three more fights off the bag the last one left.
      let carried = first.after;
      for (let i = 0; i < 3; i += 1) {
        const next = throwOneSnare({ ...saveWith([starter()]), items: carried.items }, tier);
        expect(next.legalBefore, `${tier} ran out of a stock it never had`).toBeNull();
        expect(next.thrown).toBe(1);
        carried = next.after;
      }
      expect(carried.items).toEqual({});
    }
  });

  it("after the tutorial the GRANTED tier is metered — its stock exists, spends down, and runs out", () => {
    /*
     * The whole point of the wiring, stated as a behavioural difference rather than a field read.
     * `bagHas` reads an ABSENT key as untracked-and-unlimited; the moment the grant creates the key
     * the meter is on, and `applyGrant` never deletes a key, so it stays on.
     *
     * ⚠ THE NAME SAYS "THE GRANTED TIER", NOT "THE PLAYER", AND THAT IS THE WHOLE CORRECTION. Every
     * assertion in this body is scoped to one tier; the sibling test below is what says what the
     * OTHER tiers do, and the two together are the claim this file is allowed to make.
     */
    const tier = GRANTED_TIER!;
    const stock = GRANTS[tier]!;
    expect(stock).toBeGreaterThan(0);

    const played = fullRun();
    const granted = applyRunGrants(applyRunFlags(saveWith([starter()]), played), played);
    expect(granted.items[tier]).toBe(stock);

    // Spend it down through the real launcher and the real writeback, one throw per fight.
    let carried = granted;
    for (let spent = 1; spent <= stock; spent += 1) {
      const fight = throwOneSnare({ ...saveWith([starter()]), items: carried.items }, tier);
      expect(fight.legalBefore, `throw ${String(spent)} was refused while stock remained`).toBeNull();
      expect(fight.thrown).toBe(1);
      expect(fight.bagInBattle[tier]).toBe(stock - spent);
      carried = fight.after;
      expect(carried.items[tier]).toBe(stock - spent);
    }
    expect(carried.items[tier]).toBe(0);

    // THE METER, PROVED: the next throw is refused. Before the grant, this same call was legal.
    const spentOut = { ...saveWith([starter()]), items: carried.items };
    const lineId = Object.keys(nodeFile(NODE).populations)[0]!;
    const built = buildWildBattle({
      content,
      save: spentOut,
      encounter: { nodeId: NODE, lineId, age: "J", level: 1, traits: [] },
      node: liveNodeOf(content, spentOut, NODE),
    });
    const state = startBattle(built.input, built.ctx).state;
    expect(state.outcome).toBeNull();
    expect(illegalActionReason(state, { kind: "snare", tier }, built.ctx)).not.toBeNull();
  });

  it("…but CATCHING IS NOT METERED — the tiers the grant does not stock stay unlimited for ever", () => {
    /*
     * ⚠ THE TRUE SITUATION, MEASURED, AND THE REASON THE TEST ABOVE IS NOT ALLOWED TO SAY "THE
     * PLAYER IS METERED". `applyGrant` creates only the keys it is handed and nothing in `data/`,
     * `game/` or `core/` writes another snare tier into `save.items`, so a post-tutorial bag carries
     * exactly the granted tiers. `bagHas` reads every OTHER tier as untracked-and-therefore-
     * unlimited — including the strongest one — so a player who spends the granted stock does not
     * run out of snares, they change tier and catch for ever.
     *
     * If someone meters the rest, this test goes RED. That is deliberate: the claim above would then
     * have become true and must be restated here rather than quietly outgrown. Fix the test by
     * asserting the new meter, never by deleting this one.
     */
    expect(GRANTED_TIERS.length, "the corpus stocks no snare tier — §6 has nothing to partition")
      .toBeGreaterThan(0);
    expect(
      UNGRANTED_TIERS.length,
      `every tier in [${SNARE_TIERS.join(", ")}] is now stocked by the corpus. Catching may now be ` +
        `metered end to end — restate this section's claim against what is now true.`,
    ).toBeGreaterThan(0);

    // The post-tutorial save, built by the real applier off the real run — no bag written by hand.
    const played = fullRun();
    const granted = applyRunGrants(applyRunFlags(saveWith([starter()]), played), played);
    expect(Object.keys(granted.items).sort()).toEqual([...GRANTED_TIERS].sort());

    // Spend the granted stock out, exactly as the test above does, so the player is at their worst.
    let carried = granted;
    for (const tier of GRANTED_TIERS) {
      for (let i = 0; i < GRANTS[tier]!; i += 1) {
        carried = throwOneSnare({ ...saveWith([starter()]), items: carried.items }, tier).after;
      }
      expect(carried.items[tier], `${tier} did not spend out`).toBe(0);
    }

    // …and every ungranted tier is still legal, still free, and still does not run out.
    for (const tier of UNGRANTED_TIERS) {
      expect(
        Object.prototype.hasOwnProperty.call(carried.items, tier),
        `${tier} has a key in the bag — it is metered and this test's premise is stale`,
      ).toBe(false);
      let bag = carried;
      for (let i = 0; i < GRANTED_TIERS.length + 3; i += 1) {
        const fight = throwOneSnare({ ...saveWith([starter()]), items: bag.items }, tier);
        expect(fight.legalBefore, `${tier} was refused on throw ${String(i + 1)}`).toBeNull();
        expect(fight.thrown, `no ${tier} snare was thrown — nothing is measured`).toBe(1);
        expect(fight.bagInBattle[tier], `${tier} acquired a count mid-fight`).toBeUndefined();
        bag = fight.after;
      }
      expect(bag.items[tier], `${tier} ended the run with a count`).toBeUndefined();
    }
  });

  it("the spent-out key is KEPT, not deleted — a bag that fell back to unlimited would be worse", () => {
    // `bagConsume` decrements to 0 rather than removing the key, and `applyGrant` deletes nothing.
    // If either changed, a player who spent their last snare would silently get infinite ones.
    const tier = GRANTED_TIER!;
    const stock = GRANTS[tier]!;
    expect(stock).toBeGreaterThan(0);
    const played = fullRun();
    let carried = applyRunGrants(applyRunFlags(saveWith([starter()]), played), played);
    for (let i = 0; i < stock; i += 1) {
      carried = throwOneSnare({ ...saveWith([starter()]), items: carried.items }, tier).after;
    }
    expect(Object.prototype.hasOwnProperty.call(carried.items, tier)).toBe(true);
    expect(carried.items[tier]).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §7 THE WIRING ITSELF — the real OverworldScene, not this file calling the applier
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠ WHY THIS SECTION EXISTS, MEASURED. `this.save = applyRunGrants(this.save, state);` in
 * `game/scenes/OverworldScene.ts` was commented out — so in the shipping game Maren hands the
 * player nothing and the bag stays `{}` — and every test in §1–§6 stayed GREEN. All of them call
 * `applyRunGrants` themselves, so their green is evidence that the FUNCTION behaves, not that the
 * GAME calls it. This repo has shipped that exact shape before: `applyBattleResult`, four
 * launchers, none wired, suite green.
 *
 * The rig is the one `tests/unit/dialogue-grants.test.ts` §6 already proved out — a real
 * `new OverworldScene()`, `init()` + `create()` on the stub engine above. No dialogue box is
 * registered on the stub, so the queued beat runs headless through the scene's own
 * `playEntry` → `handBack` → `finishDialogue`, which is the path the box's `onDone` takes.
 */

/** The node the corpus's granting chain plays in — read off the entry, never typed (G2). */
const SCENE_NODE = CHAIN.grantEntry.node;

function sceneSave(): SaveEnvelope {
  return {
    ...newSave({ seed: balance.rng.defaultSeed, currentNode: SCENE_NODE, nodes: content.nodes }, balance),
    party: [starter()],
  };
}

function mount(save: SaveEnvelope): OverworldScene {
  const data: OverworldSceneData = {
    content,
    save,
    streams: openStreams(save, balance),
    msPerTile: 1,
  };
  const scene = new OverworldScene();
  scene.init(data);
  scene.create();
  return scene;
}

describe("§7 the shipping game actually calls applyRunGrants", () => {
  it("the rig is real — the granting entry has a node and a fresh save there starts empty", () => {
    expect(SCENE_NODE, "the granting entry names no node — §7 cannot be mounted anywhere").toBeTruthy();
    expect(content.nodes.some((n) => n.id === SCENE_NODE)).toBe(true);
    expect(sceneSave().items).toEqual({});
    expect(Object.keys(GRANTS).length).toBeGreaterThan(0);
  });

  it("⚠ create() at the start node leaves the corpus's stock on the SCENE'S OWN save", () => {
    /*
     * THE ASSERTION THAT DIES WHEN THE PRODUCTION LINE IS SEVERED. Nothing in this body calls
     * `applyRunGrants`; the only thing that can put an item in this bag is the scene.
     */
    const before = sceneSave();
    expect(before.items).toEqual({});

    const scene = mount(before);

    expect(
      Object.keys(scene.save.items).length,
      "the scene played the beat and handed the player nothing — the applyRunGrants call in " +
        "game/scenes/OverworldScene.ts is not being reached",
    ).toBeGreaterThan(0);
    for (const id of Object.keys(GRANTS)) {
      expect(scene.save.items[id], `the scene's bag is missing the corpus's "${id}"`).toBe(GRANTS[id]);
    }
  });

  it("…and it goes on the TAPE from there — one grant entry, replaying to the same bag", () => {
    // The scene is the only writer in this test, so the tape it produced is the game's own tape.
    const before = sceneSave();
    const after = mount(before).save;
    expect(canonicalStringify(after.items)).not.toBe(canonicalStringify(before.items));

    const grants = after.actionLog.filter((e) => readGrant(e.action) !== null);
    expect(grants, "the scene moved the bag without putting it on the tape (L10)").toHaveLength(1);
    expect(readGrant(grants[0]!.action)).toEqual(GRANTS);

    const replayed = replay({ ...before, actionLog: [] }, after.actionLog, inertDeps);
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(after.items));
  });

  it("EXACTLY ONE call — `applyRunGrants` doubles when applied twice, and the scene's bag is single", () => {
    /*
     * `applyRunGrants` is NOT idempotent: applied twice to one run state it doubles the bag and
     * writes two tape entries. "Exactly once" therefore rests on single-call discipline in
     * `finishDialogue`, not on anything the applier does — so the doubling is demonstrated here
     * first, and then the scene is shown not to have done it.
     */
    const played = fullRun();
    const doubled = applyRunGrants(applyRunGrants(sceneSave(), played), played);
    for (const id of Object.keys(GRANTS)) expect(doubled.items[id]).toBe(GRANTS[id]! * 2);
    expect(doubled.actionLog.filter((e) => readGrant(e.action) !== null)).toHaveLength(2);

    const scene = mount(sceneSave());
    for (const id of Object.keys(GRANTS)) {
      expect(scene.save.items[id], `the scene levied "${id}" twice`).toBe(GRANTS[id]);
    }
    expect(scene.save.actionLog.filter((e) => readGrant(e.action) !== null)).toHaveLength(1);
  });

  it("a SECOND mount on the save the first produced pays nothing more", () => {
    // A reload, a re-entry, a `restart` — the corpus's own latch is what closes the chain, and this
    // is that latch holding across a real scene boundary rather than across a `runHeadless` call.
    const first = mount(sceneSave()).save;
    const second = mount(first).save;
    for (const id of Object.keys(GRANTS)) {
      expect(second.items[id], `the scene paid "${id}" out again on the second mount`).toBe(GRANTS[id]);
    }
    expect(second.actionLog.filter((e) => readGrant(e.action) !== null)).toHaveLength(1);
  });
});
