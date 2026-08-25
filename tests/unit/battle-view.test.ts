/**
 * tests/unit/battle-view.test.ts — the named tests for lane C3 (build-doc §15: "battle scene as
 * event-log renderer"). G14: nothing in C3 is done before these exist and pass.
 *
 * WHAT IS ACTUALLY BEING PROVED
 * ─────────────────────────────
 * build-doc §7.4 makes one architectural bet: the battle is a pure reducer and the Phaser scene is
 * only a replayer of its `events[]`. A test that merely calls the view and checks it does not crash
 * proves nothing about that bet. So this file proves it four ways, and every one of them is designed
 * to be able to FAIL:
 *
 *   1. **Ordered playback against a REAL log.** The three recorded fixtures in
 *      `fixtures/battle-scripts/` are replayed headlessly through the real `core/battle.ts`, and the
 *      compiled visual steps are asserted in order, one-to-one, against a declared event→step map.
 *      A dropped, reordered or invented step fails.
 *   2. **The replay identity.** Compiling the whole log from the OPENING snapshot must reproduce the
 *      CLOSING `BattleState`'s HP and faint flags exactly — for a 74-event gym fight with eight
 *      faints and seven switches. This is §7.4's "replaying the log reproduces the state" clause,
 *      checked against the state the reducer actually produced.
 *   3. **Structural incapability.** `game/battle-view.ts`'s own source is read and asserted to import
 *      nothing from `core/` except `core/types.ts`, and only as `import type` — so it cannot call a
 *      rules function, because none is in scope. Phaser is likewise absent.
 *   4. **Behavioural incapability.** Hand-built logs prove the view has no rules of its own: a
 *      `moveUsed` with no `damage` event moves no HP (no damage formula), a failed `snareThrown`
 *      produces no catch (no catch probability), and changing the log's numbers changes the view
 *      while changing nothing else.
 *
 * `game/battle-input.ts` is checked the same way: every row it greys out must agree, entry by entry,
 * with `illegalActionReason` in `core/battle.ts`, and every action it emits must be legal.
 *
 *   5. **The scene, EXECUTED.** §11 below runs the real `game/scenes/BattleScene.ts` against a
 *      stub Phaser (`vi.mock("phaser")`) and replays a whole recorded fixture through it, driving
 *      the scene's own timers and tweens. This exists because the first cut of this file said "the
 *      scene value-imports Phaser, which throws in the node environment; it is checked by reading
 *      its source instead" — and every one of the five MAJOR defects an independent audit later
 *      found lived in that file and in `CombatantPanel`'s Phaser half, in code no test executed. A
 *      regex over a source file cannot see a bar tweening from the wrong start value, a panel
 *      destroyed without its sprite, a 9px z-order collision, or an end-of-turn number painted in
 *      the middle of a turn. The source scans in §5 remain — they catch a different class of thing —
 *      but they are no longer the only witness.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════════════════════
 * A stub Phaser, so the SCENE can be executed rather than merely read.
 *
 * `game/scenes/BattleScene.ts` value-imports Phaser and extends `Phaser.Scene`; real Phaser needs a
 * DOM and throws under `environment: "node"`. Everything else in lane C3 imports Phaser as a TYPE
 * only, so replacing the module affects the scene and nothing else.
 *
 * The stub is a recorder, not a renderer: every display object it hands out goes into a list, is
 * removed from that list when destroyed, and remembers what was last written to it. Timers and
 * tweens are QUEUED rather than run, so a test drives the scene's clock deterministically — no
 * wall-clock, no frame loop, no `Math.random` (G11).
 * ════════════════════════════════════════════════════════════════════════════ */

interface FakeObject {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
  angle: number;
  visible: boolean;
  text: string;
  color: string;
  fill: number;
  texture: string;
  tint: number | null;
  destroyed: boolean;
  scene: unknown;
  /** The proxy handed to callers — what the display list actually holds. */
  self?: FakeObject;
  list: FakeObject[];
  /** How many times `setText` has been called — the message line's write count is a perform count. */
  writes?: number;
  destroy(): void;
  [key: string]: unknown;
}

interface FakeTween {
  config: Record<string, unknown>;
  /** The tweened property's value on the target AT THE MOMENT the tween was created. */
  startValues: Record<string, number>;
  removed: boolean;
  completed: boolean;
}

interface FakeSceneParts {
  objects: FakeObject[];
  tweens: FakeTween[];
  timers: Array<{ ms: number; run: () => void; fired: boolean }>;
  keys: Array<{ event: string; run: () => void }>;
  textures: Set<string>;
  /** Run every pending timer, completing tweens as they are created, until nothing is left. */
  flush(limit?: number): void;
  completeTweens(): void;
  press(event: string): void;
  imagesOnScreen(): FakeObject[];
}

vi.mock("phaser", () => {
  const make = (kind: string, bag: FakeObject[], owner: unknown): FakeObject => {
    const o = {
      kind,
      // Phaser clears a destroyed object's `scene` back-reference; game/ui/BattleFx.ts's deferred
      // callbacks check exactly that before writing to a target that may already be gone.
      scene: owner,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      alpha: 1,
      angle: 0,
      visible: true,
      text: "",
      color: "",
      fill: 0,
      texture: "",
      tint: null as number | null,
      destroyed: false,
      list: [] as FakeObject[],
      setOrigin(): FakeObject {
        return o;
      },
      setStrokeStyle(): FakeObject {
        return o;
      },
      setDepth(): FakeObject {
        return o;
      },
      setScrollFactor(): FakeObject {
        return o;
      },
      setVisible(v: boolean): FakeObject {
        o.visible = v;
        return o;
      },
      setY(v: number): FakeObject {
        o.y = v;
        return o;
      },
      setPosition(x: number, y: number): FakeObject {
        o.x = x;
        o.y = y;
        return o;
      },
      setSize(w: number, h: number): FakeObject {
        o.w = w;
        o.h = h;
        return o;
      },
      setFillStyle(c: number): FakeObject {
        o.fill = c;
        return o;
      },
      setText(t: string): FakeObject {
        o.text = t;
        o.writes = ((o.writes as number | undefined) ?? 0) + 1;
        return o;
      },
      setColor(c: string): FakeObject {
        o.color = c;
        return o;
      },
      setShadow(): FakeObject {
        return o;
      },
      setTint(c: number): FakeObject {
        o.tint = c;
        return o;
      },
      clearTint(): FakeObject {
        o.tint = null;
        return o;
      },
      // Graphics
      fillStyle(): FakeObject {
        return o;
      },
      fillRect(): FakeObject {
        return o;
      },
      lineStyle(): FakeObject {
        return o;
      },
      strokeRect(): FakeObject {
        return o;
      },
      destroy(): void {
        if (o.destroyed) return;
        o.destroyed = true;
        o.scene = undefined;
        // Phaser's Container.destroy takes its children with it; the leak this suite exists to
        // catch is precisely a child that was never IN the container.
        for (const child of [...o.list]) child.destroy();
        const at = bag.indexOf(o.self as FakeObject);
        if (at >= 0) bag.splice(at, 1);
      },
    } as unknown as FakeObject;
    // Unknown methods are chainable no-ops. `game/placeholder.ts` is a SHARED file that other lanes
    // extend (it grew a `lineBetween` call mid-build), and a stub that has to be chased every time
    // someone adds a drawing call is a stub that will be deleted. What lane C3 asserts is what it
    // RECORDS above; everything else is allowed to be a no-op.
    const proxy: FakeObject = new Proxy(o, {
      get(target, prop, receiver): unknown {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === "symbol" || prop === "then") return undefined;
        return (): FakeObject => proxy;
      },
    });
    o.self = proxy;
    bag.push(proxy);
    return proxy;
  };

  class Scene {
    readonly __fake: FakeSceneParts;
    readonly add: Record<string, (...args: never[]) => unknown>;
    readonly tweens: {
      add(config: Record<string, unknown>): { remove(): void };
      killTweensOf(target: unknown): void;
    };
    readonly time: { delayedCall(ms: number, run: () => void): { remove(): void } };
    readonly input: { keyboard: { on(event: string, run: () => void): void } };
    readonly textures: {
      exists(key: string): boolean;
      createCanvas(): null;
    };

    constructor(_key?: string) {
      const objects: FakeObject[] = [];
      const tweens: FakeTween[] = [];
      const timers: Array<{ ms: number; run: () => void; fired: boolean }> = [];
      const keys: Array<{ event: string; run: () => void }> = [];
      const textures = new Set<string>();

      this.add = {
        rectangle: ((x: number, y: number, w: number, h: number, fill: number): FakeObject => {
          const o = make("rect", objects, this);
          o.x = x;
          o.y = y;
          o.w = w;
          o.h = h;
          o.fill = fill;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        // The STYLE is recorded, not discarded. It used to be, and the colour a widget sets at
        // CONSTRUCTION (which is the only place `CombatantPanel` sets one) was therefore invisible
        // to every test — so the palette inversion the audit read straight off `Text.style.color`
        // in a real browser could not be seen headlessly at all.
        text: ((x: number, y: number, value: string, style?: { color?: string }): FakeObject => {
          const o = make("text", objects, this);
          o.x = x;
          o.y = y;
          o.text = value;
          o.color = style?.color ?? "";
          return o;
        }) as unknown as (...args: never[]) => unknown,
        image: ((x: number, y: number, key: string): FakeObject => {
          const o = make("image", objects, this);
          o.x = x;
          o.y = y;
          o.texture = key;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        container: ((x: number, y: number, children: FakeObject[]): FakeObject => {
          const o = make("container", objects, this);
          o.x = x;
          o.y = y;
          o.list = [...children];
          return o;
        }) as unknown as (...args: never[]) => unknown,
        graphics: ((): FakeObject => {
          const o = make("graphics", objects, this);
          (o as unknown as { generateTexture(key: string): void }).generateTexture = (key: string): void => {
            textures.add(key);
          };
          return o;
        }) as unknown as (...args: never[]) => unknown,
      };

      this.tweens = {
        killTweensOf: (target: unknown): void => {
          for (const t of tweens) if (t.config.targets === target) t.removed = true;
        },
        add: (config: Record<string, unknown>): { remove(): void } => {
          const target = config.targets as Record<string, number> | undefined;
          const startValues: Record<string, number> = {};
          for (const key of Object.keys(config)) {
            if (target !== undefined && typeof target[key] === "number") startValues[key] = target[key];
          }
          const record: FakeTween = { config, startValues, removed: false, completed: false };
          tweens.push(record);
          return {
            remove: (): void => {
              record.removed = true;
            },
          };
        },
      };

      this.time = {
        delayedCall: (ms: number, run: () => void): { remove(): void } => {
          timers.push({ ms, run, fired: false });
          return { remove: (): void => undefined };
        },
      };

      this.input = {
        keyboard: {
          on: (event: string, run: () => void): void => {
            keys.push({ event, run });
          },
        },
      };

      this.textures = {
        exists: (key: string): boolean => textures.has(key),
        // Null forces game/placeholder.ts's graphics fallback — no canvas in node.
        createCanvas: (): null => null,
      };

      const completeTweens = (): void => {
        for (const t of tweens) {
          if (t.completed || t.removed) continue;
          t.completed = true;
          const target = t.config.targets as Record<string, number> | undefined;
          if (target !== undefined) {
            for (const key of Object.keys(t.startValues)) {
              const end = t.config[key];
              if (typeof end === "number") target[key] = end;
            }
          }
          (t.config.onUpdate as (() => void) | undefined)?.();
          (t.config.onComplete as (() => void) | undefined)?.();
        }
      };

      this.__fake = {
        objects,
        tweens,
        timers,
        keys,
        textures,
        completeTweens,
        flush: (limit = 5000): void => {
          let guard = 0;
          for (;;) {
            completeTweens();
            const next = timers.find((t) => !t.fired);
            if (next === undefined) return;
            next.fired = true;
            next.run();
            guard += 1;
            if (guard > limit) throw new Error("the scene's timer queue did not drain");
          }
        },
        press: (event: string): void => {
          for (const k of keys) if (k.event === event) k.run();
        },
        imagesOnScreen: (): FakeObject[] => objects.filter((o) => o.kind === "image" && !o.destroyed),
      };
    }
  }

  return { default: { Scene }, Scene };
});

import { validateContent } from "../../core/schemas";
import {
  baitMatchOf,
  illegalActionReason,
  makeBattleContext,
  predationOracleFromWebs,
  startBattle,
  step,
  type BattleContext,
} from "../../core/battle";
import { AGE_CLASSES, STATUS_NAMES } from "../../core/types";
import type {
  AgeClass,
  BattleAction,
  BattleEvent,
  BattleInput,
  BattleState,
  Content,
  FoodWeb,
} from "../../core/types";

import {
  BattleView,
  VIEW_STEP_KINDS,
  compileBattleEvents,
  snapshotOf,
  type BattleViewSnapshot,
  type ViewStep,
  type ViewStepKind,
} from "../../game/battle-view";
import {
  BattleInput as BattleMenu,
  applyKey,
  bagEntries,
  baitEntries,
  baitIdsIn,
  isBaitTag,
  menuContextLine,
  moveEntries,
  rootEntries,
  snareEntries,
  teamEntries,
  type MenuEntry,
} from "../../game/battle-input";
import { BattleMenuPanel, menuPanelModel, type MenuRowRender } from "../../game/ui/BattleMenuPanel";
import {
  CARD_PADDING,
  DEFAULT_CARD_STYLE,
  battleSpriteKey,
  combatantCardModel,
  hpBarModel,
  hpReadoutFits,
  hpReadoutRightX,
  monoTextWidth,
  retirementLabel,
} from "../../game/ui/BattleHud";
import { battleScreenLayout, layoutPanels, rectsOverlap, spriteRect } from "../../game/ui/BattleLayout";
import {
  PALETTE_FROZEN,
  UI_SWATCH,
  contrastRatio,
  roleContrast,
  roleHex,
  swatchHex,
  type UiSwatchRole,
} from "../../game/ui/Palette";
import { assetId, placeholderKey } from "../../game/placeholder";
import { indexSpecies, toEcoNode } from "../../core/foodweb";
import { createRng } from "../../core/rng";
import { rollEncounterAt, type ForayContext } from "../../game/encounters";
import { damageNumberText, effectivenessRole } from "../../game/ui/BattleFx";
import { NEVER } from "../../core/lifecycle";
import { BattleScene, type BattleSceneData } from "../../game/scenes/BattleScene";
import { CombatantPanel } from "../../game/ui/BattleHud";
import paletteFile from "../../data/palette.json";
import manifest from "../../tools/comfy/manifest.json";

/** The two fields of a manifest row this file reads. `tests/unit/manifest.test.ts` owns the rest. */
interface ManifestRow {
  class: string;
  finalFile: string;
}
/** The STUB (see `vi.mock("phaser")` above) — the widgets take a `Phaser.Scene` and never touch the DOM. */
import PhaserRuntime from "phaser";

import gymJson from "../../fixtures/battle-scripts/gym-01-maribel.json";
import wildJson from "../../fixtures/battle-scripts/wild-catch-r1-nibbin.json";
import fleeJson from "../../fixtures/battle-scripts/flee-r2-fenmaw.json";

const content: Content = validateContent();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ════════════════════════════════════════════════════════════════════════════
 * Fixture replay — the same shape tests/unit/battle.test.ts uses, so the log
 * these assertions see is the log the engine tests lock with an event digest.
 * ════════════════════════════════════════════════════════════════════════════ */

interface BattleScript {
  id: string;
  seed: number;
  rngScript: number[];
  foodWeb: FoodWeb;
  input: BattleInput;
  actions: BattleAction[];
  expect: { outcome: string; turns: number; events: number };
}

/** A cycling float source — the fixture's own recorded stream. No `Math.random` (G11). */
function cyclic(values: readonly number[]): { float(): number } {
  let i = 0;
  return {
    float(): number {
      const v = values[i % values.length];
      i += 1;
      return v ?? 0;
    },
  };
}

interface Replay {
  ctx: BattleContext;
  opening: BattleViewSnapshot;
  openingState: BattleState;
  finalState: BattleState;
  events: BattleEvent[];
  /** Per reducer call: the events it produced and the state it produced them into. */
  turns: Array<{ events: BattleEvent[]; state: BattleState }>;
}

function replay(script: BattleScript): Replay {
  const ctx = makeBattleContext(content, predationOracleFromWebs([script.foodWeb]));
  const rng = cyclic(script.rngScript);
  const started = startBattle(script.input, ctx);
  const openingState = started.state;
  const opening = snapshotOf(openingState);
  let state = started.state;
  const events: BattleEvent[] = [...started.events];
  const turns: Array<{ events: BattleEvent[]; state: BattleState }> = [
    { events: [...started.events], state: openingState },
  ];
  for (const action of script.actions) {
    const out = step(state, action, rng, ctx);
    state = out.state;
    events.push(...out.events);
    turns.push({ events: out.events, state });
  }
  return { ctx, opening, openingState, finalState: state, events, turns };
}

const GYM = gymJson as unknown as BattleScript;
const WILD = wildJson as unknown as BattleScript;
const FLEE = fleeJson as unknown as BattleScript;
const SCRIPTS: readonly BattleScript[] = [GYM, WILD, FLEE];

/* ════════════════════════════════════════════════════════════════════════════
 * The declared event → visual-step map. This table IS the contract: every
 * `BattleEvent` the reducer can emit has exactly one visual step, and the log's
 * order is the visual order.
 * ════════════════════════════════════════════════════════════════════════════ */

const STEP_FOR_EVENT: Record<BattleEvent["t"], ViewStepKind> = {
  battleStart: "battleOpen",
  turnStart: "turnBanner",
  moveUsed: "attack",
  damage: "hit",
  heal: "heal",
  statusApplied: "statusApply",
  statusTick: "statusTick",
  statusSkip: "statusSkip",
  statusCleared: "statusClear",
  statChanged: "statMod",
  faint: "faint",
  switched: "swap",
  itemUsed: "item",
  snareThrown: "snareThrow",
  caught: "caught",
  fleeAttempt: "flee",
  xpGained: "xp",
  levelUp: "levelUp",
  evaded: "evade",
  lureChanged: "lure",
  actionRejected: "rejected",
  battleEnd: "battleClose",
};

const kinds = (steps: readonly ViewStep[]): ViewStepKind[] => steps.map((s) => s.kind);

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Ordered playback of a recorded event log.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("battle-view plays a recorded event log back as ordered visual steps", () => {
  for (const script of SCRIPTS) {
    it(`${script.id}: every event becomes exactly one step, in the log's order`, () => {
      const { events, opening } = replay(script);
      const { steps } = compileBattleEvents(events, opening);
      expect(steps).toHaveLength(events.length);
      expect(kinds(steps)).toEqual(events.map((e) => STEP_FOR_EVENT[e.t]));
    });

    it(`${script.id}: every step carries a caption and a positive dwell`, () => {
      const { events, opening } = replay(script);
      const { steps } = compileBattleEvents(events, opening);
      for (const s of steps) {
        expect(typeof s.caption, `${s.kind} caption`).toBe("string");
        expect(s.hold, `${s.kind} hold`).toBeGreaterThan(0);
      }
    });

    it(`${script.id}: the compile is deterministic — same log in, identical steps out`, () => {
      const { events, opening } = replay(script);
      const a = compileBattleEvents(events, opening);
      const b = compileBattleEvents(events, opening);
      expect(JSON.stringify(a.steps)).toBe(JSON.stringify(b.steps));
    });
  }

  it("the wild catch plays the exact visual sequence the demo beat needs", () => {
    // build-doc §1's never-cut beat is a catch that moves a real number. This is the shape the
    // player sees it in: lure, the wild reply, then the snare with its shake count and the settle.
    const { events, opening } = replay(WILD);
    const { steps } = compileBattleEvents(events, opening);
    expect(kinds(steps)).toEqual([
      "battleOpen",
      "turnBanner",
      "attack",
      "lure",
      "attack",
      "hit",
      "turnBanner",
      "snareThrow",
      "caught",
      "battleClose",
    ]);
  });

  it("the flee fixture plays open → turn → flee → close and nothing else", () => {
    const { events, opening } = replay(FLEE);
    const { steps } = compileBattleEvents(events, opening);
    expect(kinds(steps)).toEqual(["battleOpen", "turnBanner", "flee", "battleClose"]);
  });

  it("the gym fight's faints and switches stay paired and ordered", () => {
    const { events, opening } = replay(GYM);
    const { steps } = compileBattleEvents(events, opening);
    const faints = kinds(steps).filter((k) => k === "faint").length;
    const swaps = kinds(steps).filter((k) => k === "swap").length;
    expect(faints).toBe(events.filter((e) => e.t === "faint").length);
    expect(swaps).toBe(events.filter((e) => e.t === "switched").length);
    // Every swap in this fixture is a reaction to a faint or a commanded switch, so a swap never
    // opens the fight and the close is always last.
    expect(kinds(steps)[0]).toBe("battleOpen");
    expect(kinds(steps).at(-1)).toBe("battleClose");
  });

  it("VIEW_STEP_KINDS covers every kind the fixtures produce, and every event maps into it", () => {
    const produced = new Set<ViewStepKind>();
    for (const script of SCRIPTS) {
      const { events, opening } = replay(script);
      for (const s of compileBattleEvents(events, opening).steps) produced.add(s.kind);
    }
    for (const kind of produced) expect(VIEW_STEP_KINDS).toContain(kind);
    for (const mapped of Object.values(STEP_FOR_EVENT)) expect(VIEW_STEP_KINDS).toContain(mapped);
    // The map is total over the event union: a new BattleEvent kind fails to typecheck above.
    expect(Object.keys(STEP_FOR_EVENT).length).toBe(new Set(Object.keys(STEP_FOR_EVENT)).size);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The §7.4 replay identity — the log's deltas reproduce the reducer's state.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("replaying the log from the opening state reproduces the closing state (build-doc §7.4)", () => {
  for (const script of SCRIPTS) {
    it(`${script.id}: HP and faint flags match the reducer's own final state`, () => {
      const { events, opening, finalState } = replay(script);
      const { snapshot } = compileBattleEvents(events, opening);
      for (const [uid, real] of Object.entries(finalState.battlers)) {
        const shown = snapshot.battlers[uid];
        expect(shown, `no view for ${uid}`).toBeDefined();
        expect(shown?.curHp, `${uid} curHp`).toBe(real.curHp);
        expect(shown?.fainted, `${uid} fainted`).toBe(real.fainted);
        expect(shown?.status ?? null, `${uid} status`).toBe(real.status === null ? null : real.status.name);
        // LEVEL and MAX HP were not compared here before, and that is exactly where the gap was: a
        // `levelUp` moved neither in the ledger, so the identity held only because no shipped
        // fixture levels anyone up. Comparing them makes the identity mean what it says.
        expect(shown?.level, `${uid} level`).toBe(real.level);
        expect(shown?.maxHp, `${uid} maxHp`).toBe(real.maxHp);
      }
      expect(snapshot.outcome).toBe(finalState.outcome);
      expect(snapshot.activePlayerUid).toBe(finalState.activePlayerUid);
      expect(snapshot.activeEnemyUid).toBe(finalState.activeEnemyUid);
      expect(snapshot.lureActive).toBe(finalState.lureActive);
    });

    it(`${script.id}: pushing the log turn by turn through BattleView lands in the same place`, () => {
      const { turns, openingState, finalState } = replay(script);
      const view = new BattleView(openingState);
      let total = 0;
      for (const turn of turns.slice(1)) {
        total += view.push(turn.events, turn.state).length;
      }
      // `push` compiles the turn's own events and then re-reads absolutes off the state core
      // returned, which is what keeps a level-up's new max HP right without computing a stat here.
      expect(total).toBe(finalState === openingState ? 0 : total);
      expect(view.snapshot.outcome).toBe(finalState.outcome);
      for (const [uid, real] of Object.entries(finalState.battlers)) {
        expect(view.snapshot.battlers[uid]?.curHp, uid).toBe(real.curHp);
      }
    });
  }

  it("BINDS — a tampered damage amount moves the view and nothing else does", () => {
    const { events, opening, finalState } = replay(WILD);
    const tampered: BattleEvent[] = events.map((e) => (e.t === "damage" ? { ...e, amount: e.amount + 1 } : e));
    const honest = compileBattleEvents(events, opening).snapshot;
    const lying = compileBattleEvents(tampered, opening).snapshot;
    const uid = finalState.activePlayerUid;
    expect(honest.battlers[uid]?.curHp).toBe(finalState.battlers[uid]?.curHp);
    expect(lying.battlers[uid]?.curHp).toBe((honest.battlers[uid]?.curHp ?? 0) - 1);
  });

  it("BINDS — the view reads absolutes off the state it was given, not off the log", () => {
    const { events, openingState } = replay(WILD);
    const uid = openingState.activePlayerUid;
    const wounded = structuredClone(openingState) as BattleState;
    const target = wounded.battlers[uid];
    if (target === undefined) throw new Error("no active player in the fixture");
    target.curHp -= 5;
    const fromFull = compileBattleEvents(events, snapshotOf(openingState)).snapshot;
    const fromWounded = compileBattleEvents(events, snapshotOf(wounded)).snapshot;
    expect((fromFull.battlers[uid]?.curHp ?? 0) - (fromWounded.battlers[uid]?.curHp ?? 0)).toBe(5);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. Payloads — the numbers the scene draws are the log's numbers, verbatim.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("every visual step carries the log's own numbers", () => {
  it("the snare step carries the reducer's shake count, tier and chance", () => {
    const { events, opening } = replay(WILD);
    const { steps } = compileBattleEvents(events, opening);
    const thrown = events.find((e) => e.t === "snareThrown");
    const shown = steps.find((s) => s.kind === "snareThrow");
    if (thrown?.t !== "snareThrown" || shown?.kind !== "snareThrow") throw new Error("no snare in the wild fixture");
    expect(shown.shakes).toBe(thrown.shakes);
    expect(shown.tier).toBe(thrown.tier);
    expect(shown.chance).toBe(thrown.chance);
    expect(shown.caught).toBe(thrown.caught);
    // The caption states the odds as a number. G7: numbers, never a judgement.
    expect(shown.caption).toContain(String(thrown.shakes));
  });

  it("the catch step carries the caught line and the node the ledger must move", () => {
    const { events, opening } = replay(WILD);
    const { steps } = compileBattleEvents(events, opening);
    const caughtEvent = events.find((e) => e.t === "caught");
    const shown = steps.find((s) => s.kind === "caught");
    if (caughtEvent?.t !== "caught" || shown?.kind !== "caught") throw new Error("no catch in the wild fixture");
    expect(shown.lineId).toBe(caughtEvent.lineId);
    expect(shown.nodeId).toBe(caughtEvent.nodeId ?? null);
  });

  it("hit steps carry effectiveness, crit and predation exactly as the log reported them", () => {
    const { events, opening } = replay(GYM);
    const { steps } = compileBattleEvents(events, opening);
    const logHits = events.filter((e) => e.t === "damage");
    const viewHits = steps.filter((s) => s.kind === "hit");
    expect(viewHits).toHaveLength(logHits.length);
    for (let i = 0; i < logHits.length; i += 1) {
      const from = logHits[i];
      const to = viewHits[i];
      if (from?.t !== "damage" || to?.kind !== "hit") throw new Error("hit pairing broke");
      expect(to.amount).toBe(from.amount);
      expect(to.effectiveness).toBe(from.effectiveness);
      expect(to.crit).toBe(from.crit);
      expect(to.predation).toBe(from.predation);
      expect(to.hpFrom - to.hpTo).toBe(Math.min(from.amount, to.hpFrom));
    }
    // The gym fixture really does exercise the interesting bands, or this test proves little.
    expect(logHits.some((e) => e.t === "damage" && e.predation)).toBe(true);
    expect(logHits.some((e) => e.t === "damage" && e.crit)).toBe(true);
  });

  it("the flee step carries the reducer's chance and result", () => {
    const { events, opening } = replay(FLEE);
    const { steps } = compileBattleEvents(events, opening);
    const attempt = events.find((e) => e.t === "fleeAttempt");
    const shown = steps.find((s) => s.kind === "flee");
    if (attempt?.t !== "fleeAttempt" || shown?.kind !== "flee") throw new Error("no flee in the flee fixture");
    expect(shown.chance).toBe(attempt.chance);
    expect(shown.success).toBe(attempt.success);
  });

  it("every step carries the pair FIELDED when its event was logged, not the post-step pair", () => {
    // The gym fixture swaps seven times, several of them mid-turn after a faint. A renderer that
    // read the post-step state would draw the first half of those turns on the wrong sprites.
    const { events, opening, finalState } = replay(GYM);
    const { steps } = compileBattleEvents(events, opening);
    const pairs = new Set(steps.map((s) => `${s.activePlayerUid}|${s.activeEnemyUid}`));
    expect(pairs.size).toBeGreaterThan(1);

    // The stamp must track the log's own `switched` events, in place.
    let player = opening.activePlayerUid;
    let enemy = opening.activeEnemyUid;
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const shown = steps[i];
      if (event === undefined || shown === undefined) throw new Error("step/event pairing broke");
      if (event.t === "battleStart") {
        player = event.playerUid;
        enemy = event.enemyUid;
      }
      if (event.t === "switched") {
        if (event.side === "player") player = event.toUid;
        else enemy = event.toUid;
      }
      expect(shown.activePlayerUid, `step ${String(i)} (${shown.kind})`).toBe(player);
      expect(shown.activeEnemyUid, `step ${String(i)} (${shown.kind})`).toBe(enemy);
    }
    expect(player).toBe(finalState.activePlayerUid);
    expect(enemy).toBe(finalState.activeEnemyUid);

    // The blow that knocks a battler out is attributed to the pair standing BEFORE the replacement.
    //
    // RE-ANCHORED, not loosened. This used to read `swapIndex = findIndex(switched)` and assert it
    // came after the first faint — true of the fixture as first recorded, and false since lane A5
    // re-recorded it (commit 7d9a322: 74 events → 65, and a COMMANDED switch now lands at index 7,
    // before the first faint at 13). The claim under test was never "the first switch answers a
    // faint"; it is "the faint and the switch that ANSWERS it are drawn on different pairs". So the
    // answering switch is located properly instead of assumed to be the first one. Verified
    // independent of lane C3: the indices come out of `events`, which is core + the fixture only.
    const faintIndex = events.findIndex((e) => e.t === "faint");
    expect(faintIndex).toBeGreaterThanOrEqual(0);
    const swapIndex = events.findIndex((e, i) => i > faintIndex && e.t === "switched");
    expect(swapIndex).toBeGreaterThan(faintIndex);
    const faintStep = steps[faintIndex];
    const swapStep = steps[swapIndex];
    expect(`${faintStep?.activePlayerUid ?? ""}|${faintStep?.activeEnemyUid ?? ""}`).not.toBe(
      `${swapStep?.activePlayerUid ?? ""}|${swapStep?.activeEnemyUid ?? ""}`,
    );
  });

  it("hit steps attribute damage to the battler the log last said acted", () => {
    const { events, opening } = replay(GYM);
    const { steps } = compileBattleEvents(events, opening);
    let lastActor: string | null = null;
    let checked = 0;
    let cursor = 0;
    for (const event of events) {
      if (event.t === "moveUsed") lastActor = event.uid;
      if (event.t === "turnStart" || event.t === "switched") lastActor = null;
      const shown = steps[cursor];
      cursor += 1;
      if (event.t !== "damage" || shown?.kind !== "hit") continue;
      expect(shown.attackerUid).toBe(lastActor);
      // SPENT, not held: the attribution is consumed by the blow it explains.
      lastActor = null;
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
    // On the real fixture every blow still has a named attacker, so consuming it degraded nothing.
    const hits = steps.filter((s) => s.kind === "hit");
    expect(hits.length).toBeGreaterThan(10);
    expect(hits.every((s) => s.kind === "hit" && s.attackerUid !== null)).toBe(true);
  });

  it("BOUND — a second damage with no move in front of it names no attacker", () => {
    // `hit.attackerUid` is the ONE thing the view needs that the log does not carry: it is inferred
    // from the `moveUsed` immediately before the `damage`. That is exact for every event core can
    // emit today — one `dealDamage` call site (core/battle.ts:1071), reached only from `performMove`
    // right after its own `moveUsed` (:1110) — but it was undeclared load-bearing coupling: a future
    // damage with no preceding move (recoil, a reflected hit, an environmental tick) would have been
    // credited to whoever last swung. The inference is now consumed, so the honest answer is `null`.
    const { openingState } = replay(WILD);
    const opening2 = snapshotOf(openingState);
    const p = openingState.activePlayerUid;
    const e = openingState.activeEnemyUid;
    const hit = (uid: string): BattleEvent => ({
      t: "damage",
      uid,
      amount: 3,
      effectiveness: "neutral",
      crit: false,
      predation: false,
    });
    const { steps } = compileBattleEvents(
      [{ t: "turnStart", turn: 1 }, { t: "moveUsed", uid: p, moveId: "gnaw" }, hit(e), hit(p)],
      opening2,
    );
    const hits = steps.filter((s) => s.kind === "hit");
    expect(hits.length).toBe(2);
    expect(hits[0]?.kind === "hit" ? hits[0].attackerUid : "?").toBe(p);
    expect(hits[1]?.kind === "hit" ? hits[1].attackerUid : "?").toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. Behavioural incapability — the view has no rules of its own.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the view cannot produce a battle rule's answer", () => {
  const { openingState } = replay(WILD);
  const opening = snapshotOf(openingState);
  const playerUid = openingState.activePlayerUid;
  const enemyUid = openingState.activeEnemyUid;

  it("a move with no damage event moves no HP — there is no damage formula here", () => {
    const log: BattleEvent[] = [
      { t: "turnStart", turn: 1 },
      { t: "moveUsed", uid: playerUid, moveId: "lure" },
    ];
    const { steps, snapshot } = compileBattleEvents(log, opening);
    expect(kinds(steps)).toEqual(["turnBanner", "attack"]);
    expect(snapshot.battlers[enemyUid]?.curHp).toBe(opening.battlers[enemyUid]?.curHp);
    expect(snapshot.battlers[playerUid]?.curHp).toBe(opening.battlers[playerUid]?.curHp);
  });

  it("a failed snare produces no catch and no close — there is no catch probability here", () => {
    const log: BattleEvent[] = [
      { t: "snareThrown", uid: enemyUid, tier: "weighted", chance: 0.99, shakes: 2, caught: false },
    ];
    const { steps, snapshot } = compileBattleEvents(log, opening);
    expect(kinds(steps)).toEqual(["snareThrow"]);
    expect(snapshot.outcome).toBeNull();
  });

  it("a failed snare is NARRATED as a failure — the two outcomes do not share one caption", () => {
    // WAS: the caption was `${tier} snare · ${pct} · ${shakes} shakes` and never consulted
    // `event.caught`, though the payload carried it. The only difference on screen between a catch
    // and a miss was that a `caught` step followed one of them, so a failed snare read as a throw
    // followed by silence — nothing said the creature was still there. Reproduced live at rng 0.999:
    // `base snare · 24% · 0 shakes` then straight into the enemy's reply.
    const same = { uid: enemyUid, tier: "master", chance: 0.5, shakes: 3 } as const;
    const missed = compileBattleEvents([{ t: "snareThrown", ...same, caught: false }], opening).steps[0];
    const landed = compileBattleEvents([{ t: "snareThrown", ...same, caught: true }], opening).steps[0];
    if (missed?.kind !== "snareThrow" || landed?.kind !== "snareThrow") throw new Error("expected snareThrow steps");
    expect(missed.caption).not.toBe(landed.caption);
    // Both still carry the numbers verbatim — the result is added, nothing is taken away.
    for (const shown of [missed, landed]) {
      expect(shown.caption).toContain(same.tier);
      expect(shown.caption).toContain("50%");
      expect(shown.caption).toContain("3 shakes");
    }
    // The failure's word is the negation of core's own event name, not a coined adjective.
    expect(landed.caption.endsWith("caught")).toBe(true);
    expect(missed.caption.endsWith("not caught")).toBe(true);
  });

  it("`caught` is the log's word, never inferred from the odds or the shake count", () => {
    // Every tell a view might be tempted to reason from — a near-certain chance, a full shake count,
    // the master tier — with `caught:false`. Only the reducer decides, and it said no.
    const tempting: BattleEvent[] = [
      { t: "snareThrown", uid: enemyUid, tier: "master", chance: 0.95, shakes: 3, caught: false },
    ];
    const failed = compileBattleEvents(tempting, opening);
    expect(kinds(failed.steps)).toEqual(["snareThrow"]);
    expect(failed.snapshot.outcome).toBeNull();
    const shown = failed.steps[0];
    if (shown?.kind !== "snareThrow") throw new Error("expected a snareThrow step");
    expect(shown.caught).toBe(false);
    expect(shown.shakes).toBe(3);

    // …and the mirror image: a catch on a hopeless throw still narrates, because the log said so.
    const unlikely: BattleEvent[] = [
      { t: "snareThrown", uid: enemyUid, tier: "base", chance: 0.02, shakes: 3, caught: true },
      { t: "caught", uid: enemyUid, lineId: "x-line" },
    ];
    expect(kinds(compileBattleEvents(unlikely, opening).steps)).toEqual(["snareThrow", "caught"]);
  });

  it("a super-effective flag comes from the log, not from a type chart", () => {
    const one: BattleEvent[] = [
      { t: "damage", uid: enemyUid, amount: 4, effectiveness: "super", predation: false, crit: false },
    ];
    const other: BattleEvent[] = [
      { t: "damage", uid: enemyUid, amount: 4, effectiveness: "resisted", predation: true, crit: true },
    ];
    const a = compileBattleEvents(one, opening).steps[0];
    const b = compileBattleEvents(other, opening).steps[0];
    if (a?.kind !== "hit" || b?.kind !== "hit") throw new Error("expected hit steps");
    expect(a.effectiveness).toBe("super");
    expect(b.effectiveness).toBe("resisted");
    expect(b.predation).toBe(true);
    expect(b.crit).toBe(true);
    // Same amount, opposite bands: the view reported what it was told and computed nothing.
    expect(a.amount).toBe(b.amount);
  });

  it("a level-up asks the scene to resync, because the log carries no post-level max HP", () => {
    const log: BattleEvent[] = [{ t: "levelUp", uid: playerUid, level: 9, learnedMoveId: "lure" }];
    const shown = compileBattleEvents(log, opening).steps[0];
    if (shown?.kind !== "levelUp") throw new Error("expected a levelUp step");
    expect(shown.resyncRequired).toBe(true);
    expect(shown.level).toBe(9);
    expect(shown.learnedMoveId).toBe("lure");
  });

  it("an XP step reports the amount only — a proportional bar would need xpToNext, a rules function", () => {
    const shown = compileBattleEvents([{ t: "xpGained", uid: playerUid, amount: 44 }], opening).steps[0];
    if (shown?.kind !== "xp") throw new Error("expected an xp step");
    expect(shown.amount).toBe(44);
    // The key set stays EXACT — this assertion is the thing stopping an xp bar fraction from being
    // smuggled onto the step. `playerAt`/`enemyAt` were added to `StepBase` deliberately, to fix a
    // reproduced defect (the scene was painting end-of-turn absolutes in the middle of a turn); they
    // carry `BattlerView`s the compiler already had, and neither is an xp quantity. `lureActive` was
    // added for the same class of reason (the card needs the lure state AS OF THIS STEP, not as of
    // the end of the turn) and is a boolean the snapshot already tracked — `BattleState.lureActive`,
    // copied, not derived. Nothing was loosened: the list grew by exactly the fields the type grew
    // by, and the scan below still rejects any key that looks like progress toward the next level.
    expect(Object.keys(shown).sort()).toEqual([
      "activeEnemyUid",
      "activePlayerUid",
      "amount",
      "caption",
      "enemyAt",
      "hold",
      "kind",
      "lureActive",
      "playerAt",
      "uid",
    ]);
    // Nothing resembling a bar fraction: that would require xpToNext(level), a rules function.
    for (const key of Object.keys(shown)) expect(key).not.toMatch(/toNext|frac|total|progress|percent/i);
  });

  it("a stat modifier with turns 0 is the log's 'this ended', not a countdown of the view's own", () => {
    const up = compileBattleEvents(
      [{ t: "statChanged", uid: playerUid, stat: "atk", direction: "up", turns: 2 }],
      opening,
    ).steps[0];
    const done = compileBattleEvents(
      [{ t: "statChanged", uid: playerUid, stat: "atk", direction: "up", turns: 0 }],
      opening,
    ).steps[0];
    if (up?.kind !== "statMod" || done?.kind !== "statMod") throw new Error("expected statMod steps");
    expect(up.ended).toBe(false);
    expect(done.ended).toBe(true);
  });

  it("status chips and ticks move HP by the log's amount and nothing else", () => {
    const before = opening.battlers[playerUid]?.curHp ?? 0;
    const log: BattleEvent[] = [
      { t: "statusApplied", uid: playerUid, status: "Burn", replaced: null },
      { t: "statusTick", uid: playerUid, status: "Burn", amount: 7 },
      { t: "statusCleared", uid: playerUid, status: "Burn" },
    ];
    const { steps, snapshot } = compileBattleEvents(log, opening);
    expect(kinds(steps)).toEqual(["statusApply", "statusTick", "statusClear"]);
    expect(snapshot.battlers[playerUid]?.curHp).toBe(before - 7);
    expect(snapshot.battlers[playerUid]?.status).toBeNull();
  });

  it("a heal moves the ledger by the log's amount and never overfills", () => {
    // The fixture opens at full HP, so a heal against THAT snapshot is a no-op and would let a
    // broken compiler pass. Wound the snapshot first, then check both the delta and the clamp.
    const wounded = structuredClone(openingState) as BattleState;
    const target = wounded.battlers[playerUid];
    if (target === undefined) throw new Error("no active player in the fixture");
    const maxHp = target.maxHp;
    target.curHp = 1;
    const woundedView = snapshotOf(wounded);

    const small = compileBattleEvents([{ t: "heal", uid: playerUid, amount: 5 }], woundedView);
    expect(kinds(small.steps)).toEqual(["heal"]);
    expect(small.snapshot.battlers[playerUid]?.curHp).toBe(6);
    const shown = small.steps[0];
    if (shown?.kind !== "heal") throw new Error("expected a heal step");
    expect(shown.hpFrom).toBe(1);
    expect(shown.hpTo).toBe(6);
    expect(shown.amount).toBe(5);

    const huge = compileBattleEvents([{ t: "heal", uid: playerUid, amount: 9999 }], woundedView);
    expect(huge.snapshot.battlers[playerUid]?.curHp).toBe(maxHp);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4b. Completeness — every event kind in the union produces its declared step.
 *
 * The fixtures do not exercise heals, items, statuses, evades, level-ups or
 * rejections, so without this a whole branch of the compiler could be deleted
 * and every other test here would stay green. (It could: dropping the `heal`
 * case was tried, and nothing went red until this existed.)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("every BattleEvent kind compiles to its declared visual step", () => {
  const { openingState } = replay(WILD);
  const opening = snapshotOf(openingState);
  const p = openingState.activePlayerUid;
  const e = openingState.activeEnemyUid;

  /** One event of every kind in `BattleEvent`, in the order `STEP_FOR_EVENT` declares them. */
  const ONE_OF_EACH: BattleEvent[] = [
    { t: "battleStart", kind: "wild", playerUid: p, enemyUid: e },
    { t: "turnStart", turn: 1 },
    { t: "moveUsed", uid: p, moveId: "lure" },
    { t: "damage", uid: e, amount: 3, effectiveness: "neutral", predation: false, crit: false },
    { t: "heal", uid: p, amount: 0 },
    { t: "statusApplied", uid: e, status: "Burn", replaced: null },
    { t: "statusTick", uid: e, status: "Burn", amount: 1 },
    { t: "statusSkip", uid: e, status: "Daze" },
    { t: "statusCleared", uid: e, status: "Burn" },
    { t: "statChanged", uid: p, stat: "atk", direction: "up", turns: 2 },
    { t: "faint", uid: e },
    { t: "switched", side: "enemy", fromUid: e, toUid: e },
    { t: "itemUsed", itemId: "salve", uid: p },
    { t: "snareThrown", uid: e, tier: "base", chance: 0.5, shakes: 1, caught: false },
    { t: "caught", uid: e, lineId: "x-line", nodeId: "r1" },
    { t: "fleeAttempt", uid: p, chance: 0.5, success: false },
    { t: "xpGained", uid: p, amount: 1 },
    { t: "levelUp", uid: p, level: 2 },
    { t: "evaded", uid: p, reduction: 0.5 },
    { t: "lureChanged", active: true },
    { t: "actionRejected", reason: "no snare left" },
    { t: "battleEnd", outcome: "win" },
  ];

  it("covers the whole union — one sample per declared event kind, none missing", () => {
    expect(ONE_OF_EACH.map((event) => event.t)).toEqual(Object.keys(STEP_FOR_EVENT));
    expect(new Set(ONE_OF_EACH.map((event) => event.t)).size).toBe(ONE_OF_EACH.length);
  });

  it("compiles each one to exactly the step the map declares", () => {
    for (const event of ONE_OF_EACH) {
      const { steps } = compileBattleEvents([event], opening);
      expect(steps, `${event.t} produced no step`).toHaveLength(1);
      expect(steps[0]?.kind, event.t).toBe(STEP_FOR_EVENT[event.t]);
      expect(steps[0]?.hold, event.t).toBeGreaterThan(0);
    }
  });

  it("and compiles all of them together, in order, with nothing dropped", () => {
    const { steps } = compileBattleEvents(ONE_OF_EACH, opening);
    expect(kinds(steps)).toEqual(ONE_OF_EACH.map((event) => STEP_FOR_EVENT[event.t]));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. Structural incapability — read the view's own source.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Strip comments, keeping string literals intact, so an identifier in prose is not a call. */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < src.length) {
        const c = src[i] as string;
        out += c;
        i += 1;
        if (c === "\\") {
          out += src[i] ?? "";
          i += 1;
          continue;
        }
        if (c === quote) break;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Every string/template literal in the source, unquoted. */
function stringLiterals(src: string): string[] {
  const out: string[] = [];
  const code = stripComments(src);
  const re = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/gs;
  for (const raw of code.match(re) ?? []) out.push(raw.slice(1, -1));
  return out;
}

interface ImportRow {
  typeOnly: boolean;
  specifier: string;
  clause: string;
}

function importsOf(src: string): ImportRow[] {
  const code = stripComments(src);
  const rows: ImportRow[] = [];
  const re = /import\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of code.matchAll(re)) {
    rows.push({ typeOnly: m[1] !== undefined, clause: m[2] ?? "", specifier: m[3] ?? "" });
  }
  return rows;
}

const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** The rules `core/battle.ts` owns. None of them may be named in the view's executable source. */
const RULES_FUNCTIONS = [
  "computeDamage",
  "typeMultiplier",
  "catchChance",
  "baitMatchOf",
  "fleeChance",
  "xpGain",
  "xpToNext",
  "effectiveStats",
  "effectiveSpeed",
  "statusChipFraction",
  "chooseEnemyAction",
  "movesKnownAt",
  "hasMetamorphosed",
  "makeBattler",
  "makeBattleContext",
  "predationOracleFromWebs",
  "startBattle",
  "illegalActionReason",
  "deriveFoodWeb",
  "encounterWeights",
] as const;

describe("game/battle-view.ts is structurally incapable of holding a battle rule", () => {
  const src = read("game/battle-view.ts");
  const code = stripComments(src);

  it("imports from core/ exactly one module — core/types.ts — and only as a type import", () => {
    const rows = importsOf(src);
    expect(rows.length).toBeGreaterThan(0);
    const coreRows = rows.filter((r) => r.specifier.includes("core"));
    expect(coreRows.map((r) => r.specifier)).toEqual(["../core/types"]);
    for (const row of coreRows) {
      expect(row.typeOnly, `"${row.specifier}" must be an \`import type\``).toBe(true);
    }
  });

  it("imports no engine — the view compiles the same headless and inside Phaser (L11's shape)", () => {
    for (const row of importsOf(src)) {
      expect(row.specifier.toLowerCase().includes("phaser"), row.specifier).toBe(false);
    }
    expect(code.toLowerCase()).not.toContain("phaser");
  });

  it("names no rules function anywhere in its executable source", () => {
    const named = RULES_FUNCTIONS.filter((fn) => new RegExp(`\\b${fn}\\b`).test(code));
    expect(named, `game/battle-view.ts calls or names ${named.join(", ")}`).toEqual([]);
  });

  it("BINDS — the same scan catches a rules call and a core import that is not a type import", () => {
    const rowsBad = importsOf('import { step } from "../core/battle";');
    expect(rowsBad[0]?.typeOnly).toBe(false);
    expect(rowsBad[0]?.specifier).toBe("../core/battle");
    const rowsGood = importsOf('import type { BattleEvent } from "../core/types";');
    expect(rowsGood[0]?.typeOnly).toBe(true);
    expect(RULES_FUNCTIONS.filter((fn) => new RegExp(`\\b${fn}\\b`).test("const d = computeDamage(a, b);"))).toEqual([
      "computeDamage",
    ]);
    // …and prose mentioning a rule is not a call, or the gate would be unsatisfiable.
    expect(stripComments("// never call computeDamage here\nconst a = 1;")).not.toContain("computeDamage");
  });
});

describe("game/scenes/BattleScene.ts is a renderer, not a rulebook", () => {
  const src = read("game/scenes/BattleScene.ts");
  const code = stripComments(src);

  it("calls only the reducer's entry points and the catch hand-off reporter", () => {
    const allowed = new Set(["startBattle", "step", "caughtIndividual"]);
    const named = RULES_FUNCTIONS.filter((fn) => !allowed.has(fn) && new RegExp(`\\b${fn}\\b`).test(code));
    expect(named, `BattleScene names ${named.join(", ")}`).toEqual([]);
  });

  it("holds no damage, catch or turn-order arithmetic of its own", () => {
    // The three formulas build-doc §7.4 owns, in the shapes a scene would be tempted to inline.
    expect(code).not.toMatch(/movePower|critMultiplier|superEffective|baseCatch|snareTier\s*\[/);
    expect(code).not.toMatch(/balance\.(damage|catch|flee|xp|types)\b/);
    // The only balance group the scene reads is the §7.6 virtual screen.
    const groups = [...code.matchAll(/balance\.([A-Za-z]+)/g)].map((m) => m[1]);
    expect([...new Set(groups)]).toEqual(["map"]);
  });

  it("draws every combatant through the ONE shared placeholder helper, never a substituted image", () => {
    // The scene builds combatants only via CombatantPanel, and CombatantPanel's only image call is
    // `placeholderImage` from game/placeholder.ts — the single stand-in helper the whole game shares.
    // So a missing sprite is always a labelled, hatched box naming that manifest row, and lane C3
    // cannot grow a second placeholder of its own.
    expect(code).toContain("CombatantPanel");
    expect(code).not.toMatch(/\.add\.(image|sprite)\(/);
    const hud = stripComments(read("game/ui/BattleHud.ts"));
    expect(hud).toContain("placeholderImage");
    expect(importsOf(hud).map((r) => r.specifier)).toContain("../placeholder");
    expect(hud).not.toMatch(/\.add\.(image|sprite)\(/);
    for (const file of LANE_C3_FILES) {
      const text = stripComments(read(file));
      expect(text, `${file} must not reach for un-shipped trial art`).not.toMatch(/approved-trials|assets\/raw/);
      expect(text, `${file} must not define a second placeholder`).not.toMatch(/function\s+\w*[Pp]laceholder\w*\s*\(/);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6. G7 / Hard Req 8 — the copy.
 * ════════════════════════════════════════════════════════════════════════════ */

/*
 * ⚠ THIS WAS A HAND-WRITTEN LIST OF NINE FILES, AND THAT IS THE BF-3 DEFECT.
 *
 * `LANE_C3_FILES` named `game/battle-view.ts` … `game/ui/Palette.ts` and scanned exactly those.
 * G7 — "no moralizing copy about catching, anywhere, in any string" — is a guardrail whose whole
 * value is that it holds for code nobody has written yet, and a list cannot see a file it does not
 * name. Measured while sweeping: G7 had NO repo-wide gate at all (`grep -n "G7" tests/gates/` →
 * nothing), so the only enforcement anywhere was three hand-written lists, in this file, in
 * `tests/unit/year-turn-ux.test.ts` and in `tests/unit/overworld-scene.test.ts` — 16 files out of
 * every `.ts` under `game/` and `core/`. That is the same shape as the source list that let the
 * catch→ledger stand-in stay green: right about what it looked at, silent about the rest.
 *
 * So the files are DISCOVERED. Measured across every `.ts` under `game/` and `core/`: zero
 * moralizing literals, and exactly one death-word literal — `game/ledger-view.ts`'s
 * `"recent deaths "`, which is the ecosim's own `recentDeaths` field printed as a real number
 * (Hard Req 2). Hard Req 8 is a claim about BATTLE copy — "KO is a faint" — not a ban on the
 * ecology reporting starvation, so that one literal is exempted BY ITS TEXT, not by its file: any
 * other death word in `game/ledger-view.ts` still fails.
 */
/**
 * The nine files lane C3 owns. Still a list, because the two structural checks that use it below
 * are claims ABOUT THIS LANE — "no C3 file substitutes an image", "every path a C3 comment names
 * exists" — and a list is the right instrument for a claim scoped to a lane. It is the WRONG
 * instrument for a repo-wide guardrail, which is why G7 no longer uses it.
 */
const LANE_C3_FILES = [
  "game/battle-view.ts",
  "game/battle-input.ts",
  "game/scenes/BattleScene.ts",
  "game/ui/BattleHud.ts",
  "game/ui/BattleFx.ts",
  "game/ui/BattleLayout.ts",
  "game/ui/BattleMenuPanel.ts",
  "game/ui/BattleMessageBox.ts",
  "game/ui/Palette.ts",
] as const;

function walkSources(dir: string): string[] {
  const fs = require("node:fs") as typeof import("node:fs");
  return fs
    .readdirSync(join(ROOT, dir), { withFileTypes: true })
    .flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return walkSources(rel);
      return e.isFile() && rel.endsWith(".ts") ? [rel] : [];
    })
    .sort();
}

const SHIPPED_SOURCES = [...walkSources("game"), ...walkSources("core")];

/** Hard Req 8 — KO is a faint. Nothing in a TROPHIC battle is killed. */
const DEATH_WORDS = /\b(kill|kills|killed|killing|dead|death|deaths|die|dies|died|dying|slain|slay|corpse|perish)\b/i;

/**
 * The one death-word literal that is not battle copy: the ledger printing `recentDeaths`, the
 * ecosim's own field, as a real number. Exempted by TEXT so the rest of that file stays scanned.
 */
const ECOLOGY_DEATH_READOUT = /^recent deaths /i;

/** G7 — no moralizing copy about catching. The ledger is the moral; the screen prints numbers. */
const MORALIZING = /\b(cruel|cruelty|guilt|guilty|shame|shameful|remorse|greed|greedy|selfish|wicked|evil|sin|deserve|deserved|should not have|shouldn't have|too many|senseless|needless|innocent|suffer|suffering|sorry)\b/i;

describe("G7 and Hard Req 8 — the copy of every shipped source, discovered not listed", () => {
  it("the walk found the whole of game/ and core/, not a subset", () => {
    // Without this the two scans below could pass by looking at nothing.
    expect(SHIPPED_SOURCES.length, "the source walk is looking in the wrong place").toBeGreaterThan(30);
    for (const named of ["game/battle-view.ts", "game/scenes/BattleScene.ts", "game/ui/Palette.ts", "core/battle.ts"]) {
      expect(SHIPPED_SOURCES, `${named} is not in the walk`).toContain(named);
    }
  });

  it("G7 — not one string literal under game/ or core/ moralises about catching", () => {
    // Positive control first: the instrument fires, so an empty offender list means something.
    const poisoned = 'const line = "you caught too many of them and you should feel guilty";';
    expect(stringLiterals(poisoned).filter((l) => MORALIZING.test(l))).toHaveLength(1);

    const offenders: string[] = [];
    for (const file of SHIPPED_SOURCES) {
      for (const literal of stringLiterals(read(file))) {
        if (MORALIZING.test(literal)) offenders.push(`${file}: ${JSON.stringify(literal)}`);
      }
    }
    expect(offenders, "G7 is a fail-the-task guardrail — the ledger is the moral, not the copy").toEqual([]);
  });

  it("Hard Req 8 — no death copy anywhere but the ecology's own recentDeaths readout", () => {
    const offenders: string[] = [];
    for (const file of SHIPPED_SOURCES) {
      for (const literal of stringLiterals(read(file))) {
        if (!DEATH_WORDS.test(literal)) continue;
        if (ECOLOGY_DEATH_READOUT.test(literal)) continue;
        offenders.push(`${file}: ${JSON.stringify(literal)}`);
      }
    }
    expect(offenders, "a KO is a faint — nothing in a TROPHIC battle is killed").toEqual([]);
    // …and the one exemption is real, so the carve-out is not quietly covering an empty case.
    const ledger = stringLiterals(read("game/ledger-view.ts")).filter((l) => ECOLOGY_DEATH_READOUT.test(l));
    expect(ledger, "the recentDeaths readout is gone — delete the exemption with it").not.toHaveLength(0);
  });

  it("no caption produced by any recorded fixture breaks either rule", () => {
    let captions = 0;
    for (const script of SCRIPTS) {
      const { events, opening } = replay(script);
      for (const s of compileBattleEvents(events, opening).steps) {
        captions += 1;
        expect(DEATH_WORDS.test(s.caption), s.caption).toBe(false);
        expect(MORALIZING.test(s.caption), s.caption).toBe(false);
      }
    }
    // RE-ANCHORED, and stronger than what it replaces. This used to be `> 80`, a magic figure
    // pinned to the fixtures as first recorded; lane A5 re-recorded them (commit 7d9a322, the D-A5-1
    // catch-formula amendment) and the total is now 79, so the bound was measuring another lane's
    // recording rather than this compiler. The claim is now an IDENTITY against the fixtures' own
    // declared event counts — a compiler that silently dropped a caption cannot satisfy it at any
    // fixture size, which the magnitude bound could not say — with the substantiality floor kept
    // beside it so an empty fixture set still fails.
    expect(captions).toBe(SCRIPTS.reduce((total, script) => total + script.expect.events, 0));
    expect(captions).toBeGreaterThan(50);
  });

  it("a KO narrates as a faint", () => {
    const { events, opening } = replay(GYM);
    const { steps } = compileBattleEvents(events, opening);
    const faint = steps.find((s) => s.kind === "faint");
    expect(faint?.caption).toMatch(/fainted$/);
  });

  it("an EXTERNAL string cannot become a caption — the refusal channel is closed at the compiler", () => {
    // THE HOLE THE SCANS ABOVE COULD NOT SEE. They read C3's own string literals and the captions
    // the three fixtures produce, and no fixture contains an `actionRejected` (the gym recording
    // says refusals were deliberately removed because "a fixture that records a refusal is not a
    // recording of play"). So the one path that piped a string from OUTSIDE this lane into the
    // message box was scanned by nothing, and the defect survived two cuts behind that green.
    // core's 18 reasons carry no death or moralizing word today — this asserts that it would not
    // matter if one did, because the caption is not the channel.
    const { openingState } = replay(WILD);
    const poison = "you killed too many of them and you should feel guilty";
    expect(DEATH_WORDS.test(poison) && MORALIZING.test(poison)).toBe(true);
    const { steps } = compileBattleEvents([{ t: "actionRejected", reason: poison }], snapshotOf(openingState));
    const shown = steps[0];
    if (shown?.kind !== "rejected") throw new Error("expected a rejected step");
    expect(shown.reason).toBe(poison);
    expect(shown.caption).toBe("");
    for (const s of steps) {
      expect(DEATH_WORDS.test(s.caption), s.caption).toBe(false);
      expect(MORALIZING.test(s.caption), s.caption).toBe(false);
    }
  });

  it("BINDS — the scanners catch the copy they are meant to catch", () => {
    expect(DEATH_WORDS.test("the creature died")).toBe(true);
    expect(MORALIZING.test("you caught too many of them")).toBe(true);
    expect(DEATH_WORDS.test("Nibbin fainted")).toBe(false);
    expect(MORALIZING.test("weighted snare · 84% · 3 shakes")).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 7. game/battle-input.ts — the menu asks core, it does not decide.
 * ════════════════════════════════════════════════════════════════════════════ */

function assertAgreesWithCore(entries: readonly MenuEntry[], state: BattleState, ctx: BattleContext): void {
  for (const row of entries) {
    if (row.action === undefined) continue;
    const reason = illegalActionReason(state, row.action, ctx);
    expect(row.disabled, `${row.id}: view says ${String(row.disabled)}, core says ${String(reason)}`).toBe(
      reason !== null,
    );
    expect(row.reason).toBe(reason);
  }
}

describe("game/battle-input.ts greys exactly what core/battle.ts refuses", () => {
  it("every row of every pane agrees with illegalActionReason, in a wild fight", () => {
    const { openingState, ctx } = replay(WILD);
    assertAgreesWithCore(moveEntries(openingState, ctx), openingState, ctx);
    assertAgreesWithCore(snareEntries(openingState, ctx), openingState, ctx);
    assertAgreesWithCore(teamEntries(openingState, ctx), openingState, ctx);
    assertAgreesWithCore(rootEntries(openingState, ctx), openingState, ctx);
  });

  it("every row of every pane agrees with illegalActionReason, in a gym fight", () => {
    const { openingState, ctx } = replay(GYM);
    assertAgreesWithCore(moveEntries(openingState, ctx), openingState, ctx);
    assertAgreesWithCore(snareEntries(openingState, ctx), openingState, ctx);
    assertAgreesWithCore(teamEntries(openingState, ctx), openingState, ctx);
    assertAgreesWithCore(rootEntries(openingState, ctx), openingState, ctx);
  });

  it("the gym closes the snare and flee rows, with core's own reason", () => {
    const { openingState, ctx } = replay(GYM);
    const root = rootEntries(openingState, ctx);
    const snare = root.find((r) => r.id === "snares");
    const flee = root.find((r) => r.id === "flee");
    expect(snare?.disabled).toBe(true);
    expect(flee?.disabled).toBe(true);
    expect(flee?.reason).toBe(illegalActionReason(openingState, { kind: "flee" }, ctx));
    expect(snare?.reason).toBe(illegalActionReason(openingState, { kind: "snare", tier: "base" }, ctx));
  });

  it("the wild fight opens Fight, Snare and Flee", () => {
    const { openingState, ctx } = replay(WILD);
    const root = rootEntries(openingState, ctx);
    expect(root.find((r) => r.id === "moves")?.disabled).toBe(false);
    expect(root.find((r) => r.id === "snares")?.disabled).toBe(false);
    expect(root.find((r) => r.id === "flee")?.disabled).toBe(false);
  });

  it("bait rows are the bag's keys that ARE bait tags — a positive test, not an exclusion (G3)", () => {
    const { openingState, ctx } = replay(WILD);
    const baits = baitIdsIn(openingState, ctx);
    const med = ctx.balance.medicine;
    const bagKeys = Object.keys(openingState.bag);
    expect(baits.length).toBeGreaterThan(0);
    for (const bait of baits) {
      expect(bagKeys).toContain(bait);
      expect(bait).not.toBe(med.salveItemId);
      expect(bait).not.toBe(med.tonicItemId);
      // build-doc §7.2: a bait tag is a species line id or a role. Still no table (G3).
      expect(isBaitTag(bait, ctx), bait).toBe(true);
    }
    // …and no snare tier leaks into the bait list.
    for (const tier of ["base", "weighted", "master"]) expect(baits).not.toContain(tier);
  });

  it("a bag item that is NOT a bait is not offered as one, and cannot be spent as one", () => {
    // REPRODUCED, then fixed. `baitIdsIn` enumerated by EXCLUSION — "every bag key that is not a
    // snare tier and not one of balance.medicine's two ids" — so any future bag item became a live,
    // un-greyed bait row. core/battle.ts cannot catch it: `illegalActionReason` only asks whether
    // the bag HOLDS the id (:1485) and `performSnare` consumes whatever it is handed. Measured with
    // one junk id in the bag: the row offered itself `disabled:false, reason:null`, the throw
    // consumed the item, and `snareThrown.chance` was IDENTICAL to the chance with no bait at all.
    // core/types.ts already declares `OwnedCreature.relicSlot`, so non-bait items are designed in.
    const { openingState, ctx } = replay(WILD);
    const JUNK = "relic-antler-shard";
    expect(isBaitTag(JUNK, ctx)).toBe(false);
    const withJunk: BattleState = { ...openingState, bag: { ...openingState.bag, [JUNK]: 1 } };

    expect(baitIdsIn(withJunk, ctx)).not.toContain(JUNK);
    const rows = baitEntries(withJunk, ctx, "weighted");
    expect(rows.map((r) => r.id)).not.toContain(JUNK);
    // The real baits are still there — the filter did not simply empty the pane.
    expect(rows.length).toBeGreaterThan(1);

    // BINDS: the two shapes of bait tag build-doc §7.2 recognises both still answer true, so the
    // positive test is not just "reject everything".
    const someLine = content.species[0];
    if (someLine === undefined) throw new Error("content has species");
    expect(isBaitTag(someLine.id, ctx)).toBe(true);
    expect(isBaitTag("Producer", ctx)).toBe(true);
    expect(isBaitTag("", ctx)).toBe(false);
  });

  it("a bait row says what core will price it at against THIS target", () => {
    const { openingState, ctx } = replay(WILD);
    const target = openingState.battlers[openingState.activeEnemyUid];
    if (target === undefined) throw new Error("fixture has an enemy");
    const rows = baitEntries(openingState, ctx, "weighted").filter((r) => r.id !== "");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const match = baitMatchOf(row.id, target.lineId, ctx, openingState.nodeId);
      expect(row.detail, row.id).toContain(match);
      // The multiplier itself is core's; the row prints core's WORD, never a number of its own.
      expect(row.detail).not.toMatch(/\d+\.\d/);
    }
  });

  it("choosing a snare tier asks for bait, then emits the tier AND the bait core will price", () => {
    const { openingState, ctx } = replay(WILD);
    const menu = new BattleMenu();
    expect(menu.currentPane).toBe("root");
    expect(menu.focusById("snares", openingState, ctx)).toBe(true);
    expect(menu.select(openingState, ctx).pane).toBe("snares");
    expect(menu.focusById("weighted", openingState, ctx)).toBe(true);
    const armed = menu.select(openingState, ctx);
    expect(armed.pane).toBe("baits");
    expect(armed.action).toBeUndefined();
    expect(menu.armed).toBe("weighted");
    const bait = baitIdsIn(openingState, ctx)[0];
    if (bait === undefined) throw new Error("the wild fixture carries bait");
    expect(menu.focusById(bait, openingState, ctx)).toBe(true);
    const thrown = menu.select(openingState, ctx);
    expect(thrown.action).toEqual({ kind: "snare", tier: "weighted", baitId: bait });
    expect(illegalActionReason(openingState, thrown.action as BattleAction, ctx)).toBeNull();
    expect(menu.currentPane).toBe("root");
  });

  it("cancel backs out of the bait pane to the snare pane, then to the root", () => {
    const { openingState, ctx } = replay(WILD);
    const menu = new BattleMenu();
    menu.focusById("snares", openingState, ctx);
    menu.select(openingState, ctx);
    menu.focusById("weighted", openingState, ctx);
    menu.select(openingState, ctx);
    expect(menu.currentPane).toBe("baits");
    expect(applyKey(menu, "cancel", openingState, ctx).pane).toBe("snares");
    expect(applyKey(menu, "cancel", openingState, ctx).pane).toBe("root");
  });

  it("the cursor wraps and never leaves the pane", () => {
    const { openingState, ctx } = replay(GYM);
    const menu = new BattleMenu();
    const rows = rootEntries(openingState, ctx).length;
    expect(rows).toBeGreaterThan(1);
    applyKey(menu, "up", openingState, ctx);
    expect(menu.cursor).toBe(rows - 1);
    applyKey(menu, "down", openingState, ctx);
    expect(menu.cursor).toBe(0);
    for (let i = 0; i < rows * 3; i += 1) applyKey(menu, "down", openingState, ctx);
    expect(menu.cursor).toBeGreaterThanOrEqual(0);
    expect(menu.cursor).toBeLessThan(rows);
  });

  it("selecting a greyed row emits no action and reports core's reason", () => {
    const { openingState, ctx } = replay(GYM);
    const menu = new BattleMenu();
    expect(menu.focusById("flee", openingState, ctx)).toBe(true);
    const result = menu.select(openingState, ctx);
    expect(result.action).toBeUndefined();
    expect(result.blocked).toBe(illegalActionReason(openingState, { kind: "flee" }, ctx));
  });

  it("with the active battler down, only the team pane is open — core's rule, not the menu's", () => {
    // Step the gym fixture until a player battler is knocked out with the menu still live.
    const { ctx } = replay(GYM);
    const rng = cyclic(GYM.rngScript);
    let state = startBattle(GYM.input, ctx).state;
    let downed: BattleState | null = null;
    for (const action of GYM.actions) {
      const out = step(state, action, rng, ctx);
      state = out.state;
      if (state.outcome !== null) break;
      if (state.battlers[state.activePlayerUid]?.fainted === true) {
        downed = state;
        break;
      }
    }
    if (downed === null) throw new Error("the gym fixture never leaves a fainted battler fielded");
    const root = rootEntries(downed, ctx);
    expect(root.find((r) => r.id === "team")?.disabled).toBe(false);
    for (const id of ["moves", "bag", "snares", "flee"]) {
      expect(root.find((r) => r.id === id)?.disabled, `${id} must be closed`).toBe(true);
    }
    assertAgreesWithCore(root, downed, ctx);
    assertAgreesWithCore(teamEntries(downed, ctx), downed, ctx);
  });

  it("a closed pane reports core's reason only when every child agrees on it", () => {
    // WAS: `paneRow` took `children[0]?.reason`, so a Bag closed for two different reasons reported
    // one of them as if it were the whole story — at full HP with no status, the row read "that
    // battler is already at full HP", which is true of the salve and is not why the tonic was
    // refused (core: "that battler has no status to cure").
    const ctx = contextFor(GYM);
    const med = ctx.balance.medicine;
    const stocked: BattleInput = {
      seed: 3,
      kind: "wild",
      nodeId: "hearthollow",
      playerParty: [{ uid: "p1", lineId: "skir-line", age: "A", level: 20, traits: [] }],
      enemyParty: [{ uid: "e1", lineId: "nibbin-line", age: "A", level: 6, traits: [] }],
      bag: { [med.salveItemId]: 2, [med.tonicItemId]: 2 },
    };
    const state = startBattle(stocked, ctx).state;
    const bag = bagEntries(state, ctx);
    expect(bag.length).toBe(2);
    expect(bag.every((row) => row.disabled), "a full-HP, status-free battler refuses both").toBe(true);
    // The premise: core really does give two different reasons here.
    expect(new Set(bag.map((row) => row.reason)).size).toBe(2);
    const closed = rootEntries(state, ctx).find((row) => row.id === "bag");
    expect(closed?.disabled).toBe(true);
    expect(closed?.reason, "a pane with disagreeing children has no single reason").toBeNull();
    assertAgreesWithCore(bag, state, ctx);

    // …and where the children DO agree, core's own reason is still reported verbatim.
    const { openingState: gymState } = replay(GYM);
    const snares = snareEntries(gymState, ctx);
    expect(new Set(snares.map((row) => row.reason)).size).toBe(1);
    const snareRow = rootEntries(gymState, ctx).find((row) => row.id === "snares");
    expect(snareRow?.reason).toBe(illegalActionReason(gymState, { kind: "snare", tier: "base" }, ctx));
  });

  it("bag, snare and bait rows are labelled, not raw ids", () => {
    // WAS: `bagEntries`/`snareEntries`/`baitEntries` used the id as the label, so the snares pane
    // read `base / weighted / master` and the bag read `salve / tonic`.
    const { openingState, ctx } = replay(WILD);
    for (const row of snareEntries(openingState, ctx)) {
      expect(row.label).toBe(row.id.charAt(0).toUpperCase() + row.id.slice(1));
      expect(row.label).not.toBe(row.id);
    }
    const bait = baitEntries(openingState, ctx, "weighted");
    for (const row of bait) expect(row.label.length).toBeGreaterThan(0);
    // A supplied name table always wins over the typeset id.
    const named = snareEntries(openingState, ctx, { item: (id) => `${id} snare` });
    expect(named[0]?.label).toBe("base snare");
  });

  it("every action the menu can emit from the fixtures' opening states is legal", () => {
    for (const script of SCRIPTS) {
      const { openingState, ctx } = replay(script);
      const panes = [
        moveEntries(openingState, ctx),
        snareEntries(openingState, ctx),
        teamEntries(openingState, ctx),
        rootEntries(openingState, ctx),
      ];
      for (const pane of panes) {
        for (const row of pane) {
          if (row.action === undefined || row.disabled) continue;
          expect(illegalActionReason(openingState, row.action, ctx), `${script.id}/${row.id}`).toBeNull();
        }
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 8. The widgets' pure models.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("battle UI widget models", () => {
  it("the HP bar reports the real numbers and bands its colour on the fraction", () => {
    expect(hpBarModel(34, 34, 100)).toMatchObject({ fillPx: 100, readout: "34/34", swatchRole: "hpHigh" });
    expect(hpBarModel(17, 34, 100)).toMatchObject({ fillPx: 50, readout: "17/34", swatchRole: "hpMid" });
    expect(hpBarModel(3, 34, 100).swatchRole).toBe("hpLow");
    expect(hpBarModel(0, 34, 100)).toMatchObject({ fillPx: 0, readout: "0/34", swatchRole: "hpLow" });
    // A degenerate max never divides by zero into NaN pixels.
    expect(hpBarModel(0, 0, 100).fillPx).toBe(0);
  });

  it("the player's card shows the projected retirement year; an Ancient shows a dash", () => {
    expect(retirementLabel(4)).toBe("Retires Y4");
    expect(retirementLabel(NEVER)).toBe("Retires —");
    expect(retirementLabel(undefined)).toBe("");
  });

  it("the card model reads the battler and adds nothing", () => {
    const { openingState } = replay(WILD);
    const opening = snapshotOf(openingState);
    const player = opening.battlers[openingState.activePlayerUid];
    const enemy = opening.battlers[openingState.activeEnemyUid];
    if (player === undefined || enemy === undefined) throw new Error("fixture has both sides");
    const card = combatantCardModel(player, 100, { projectedRetirementYear: 4 });
    expect(card.title).toBe(`${player.displayName}  Lv ${String(player.level)}`);
    expect(card.hp.readout).toBe(`${String(player.curHp)}/${String(player.maxHp)}`);
    expect(card.retirement).toBe("Retires Y4");
    expect(card.spriteKey).toBe(battleSpriteKey(player.lineId, player.age, "back"));
    // The retirement year is a fact about a creature you own — the wild side never shows one.
    expect(combatantCardModel(enemy, 100, { projectedRetirementYear: 4 }).retirement).toBe("");
    expect(combatantCardModel(enemy, 100).spriteKey).toBe(battleSpriteKey(enemy.lineId, enemy.age, "front"));
  });

  it("the Lure chip is a persistent readout on the ENEMY card, and needs a content label", () => {
    // WAS: nothing anywhere read `lureActive`. bible §3 makes a Lure last the whole battle and
    // build-doc §7.2's `lureMult` is the largest single lever the player has on catch odds, and its
    // entire on-screen life was one 260ms caption — by the time the snare was thrown, nothing said
    // why the percentage was what it was. `grep -rn lureActive game/ui` returned nothing.
    const { openingState } = replay(WILD);
    const opening = snapshotOf(openingState);
    const player = opening.battlers[openingState.activePlayerUid];
    const enemy = opening.battlers[openingState.activeEnemyUid];
    if (player === undefined || enemy === undefined) throw new Error("fixture has both sides");
    const label = "Lure";
    expect(combatantCardModel(enemy, 100, { lureActive: true, lureLabel: label }).lure).toBe(label);
    expect(combatantCardModel(enemy, 100, { lureActive: false, lureLabel: label }).lure).toBe("");
    // The flag is about the fielded ENEMY — core clears it on any enemy replacement.
    expect(combatantCardModel(player, 100, { lureActive: true, lureLabel: label }).lure).toBe("");
    // No label from content ⇒ no chip. This file coins no word for a mechanic data does not name.
    expect(combatantCardModel(enemy, 100, { lureActive: true }).lure).toBe("");
  });

  it("EVERY battle-sprite key is a row lane B has actually committed, and vice versa", () => {
    // WAS THE BIGGEST SILENT DEFECT IN THE LANE. `battleSpriteKey` returned
    // `battle/<lineId>/<AGE>/<facing>` — a shape this lane invented and logged as an assumption
    // ("lane B must adopt this key") while tools/comfy/manifest.json was already committed with
    // `battle-cindril-j-front` under `assets/final/creature-battle/`. Measured intersection of the
    // 162 keys this function produced with the manifest's 150 asset ids: ZERO. `textureFor` falls
    // back to a placeholder SILENTLY, so the day the art landed every battle sprite would have gone
    // on drawing a hatched box and nothing would have said so.
    //
    // The old test asserted `battleSpriteKey("some-line","A","front") === "battle/some-line/A/front"`
    // — it restated the function and could never fail on a manifest disagreement. This one is a SET
    // IDENTITY against the committed rows, so either side moving turns it red.
    const manifestIds = new Set(
      (manifest.rows as ManifestRow[])
        .filter((row) => row.class === "creature-battle")
        .map((row) => assetId(row.finalFile)),
    );
    expect(manifestIds.size).toBe(150); // build-doc §9.7 as corrected by DEVIATIONS D2.

    // The keys the manifest OWES: every (line, age) a battler is supposed to be built at, both
    // facings. Ancients are pinned to "E" by core/lifecycle.ts:346 (`line.ancient ? "E" : opts.age`),
    // which is the same rule tools/comfy/comfy-batch.ts::artFormsOf ships them under.
    //
    // ⚠ THIS IS THE INVARIANT, NOT THE CODE THAT UPHOLDS IT (BF-4). The line below RE-STATES
    // `line.ancient ? ["E"] : AGE_CLASSES` rather than asking the encounter roll what it can
    // actually produce — so it is green whatever `game/encounters.ts` does, and it is green today
    // while `rollEncounterAt` fields Ancients at J and A. The set identity is still worth having
    // (it is what caught the invented `battle/<line>/<AGE>/<facing>` key shape), so it stays; the
    // blind spot it leaves is measured by the next test, which goes red when the clamp lands.
    const asked = new Set<string>();
    for (const line of content.species) {
      const ages: AgeClass[] = line.ancient ? ["E"] : [...AGE_CLASSES];
      for (const age of ages) {
        for (const facing of ["front", "back"] as const) asked.add(battleSpriteKey(line.id, age, facing));
      }
    }
    expect([...asked].sort()).toEqual([...manifestIds].sort());

    // The key IS the texture key: game/placeholder.ts strips `assets/final/` and the extension, so
    // the id a reviewer reads off a stand-in is the manifest row that is missing.
    const one = battleSpriteKey("cindril-line", "J", "front");
    expect(one).toBe("creature-battle/battle-cindril-j-front");
    expect(assetId("assets/final/creature-battle/battle-cindril-j-front.png")).toBe(one);
    expect(assetId(one)).toBe(one);
    const standIn = placeholderKey(one, 72, 72);
    expect(standIn).toContain(one);
    expect(standIn).toBe(placeholderKey(one, 72, 72));
    // Front and back are different manifest rows and must never collapse onto one stand-in.
    expect(placeholderKey(battleSpriteKey("cindril-line", "J", "back"), 72, 72)).not.toBe(standIn);
  });

  it("BINDS — the manifest check refuses the key shape this lane used to invent", () => {
    const manifestIds = new Set(
      (manifest.rows as ManifestRow[])
        .filter((row) => row.class === "creature-battle")
        .map((row) => assetId(row.finalFile)),
    );
    const invented = (lineId: string, age: string, facing: string): string => `battle/${lineId}/${age}/${facing}`;
    expect(manifestIds.has(invented("cindril-line", "J", "front"))).toBe(false);
    // …and the shape that IS shipped is in there, so the check is not vacuously false.
    expect(manifestIds.has(battleSpriteKey("cindril-line", "J", "front"))).toBe(true);
  });

  it("OPEN GAP (BF-4) — the ENCOUNTER ROLL asks for 12 keys the manifest has no row for", () => {
    /*
     * ⚠ THIS TEST ASSERTS A DEFECT, AND IT EXISTS TO GO RED WHEN THE DEFECT IS FIXED.
     *
     * The set identity above derives "what the game can ask for" from the invariant, so it cannot
     * see a caller that breaks the invariant. This asks `game/encounters.ts` instead. It rolls the
     * real `rollEncounterAt` at each Ancient's real host node with the sign chain unlocked, turns
     * every (line, age) it actually produced into a battle sprite key, and subtracts the manifest.
     *
     * MEASURED: three Ancient lines × {J, A} × {front, back} = 12 keys with no row. `textureFor`
     * substitutes a hatched box for each, silently (BF-7), so the large majority of unlocked-Ancient
     * encounters would ship as placeholders with nothing reporting it.
     *
     * THE FIX IS IN `game/encounters.ts` (clamp the age, still consuming `rollAge`'s draw), not in
     * the manifest — an Ancient below Elder contradicts core/lifecycle.ts as well as the art. When
     * it lands, `missing` empties, this goes red, and the set identity above becomes the whole
     * truth: delete this and derive `asked` from `rollEncounterAt`. See
     * `tests/unit/encounters.test.ts` "OPEN GAP (BF-4)" for the same measurement on the roll itself.
     */
    const manifestIds = new Set(
      (manifest.rows as ManifestRow[])
        .filter((row) => row.class === "creature-battle")
        .map((row) => assetId(row.finalFile)),
    );
    const speciesIndex = indexSpecies(content.species);
    const missing = new Set<string>();
    let ancientsMet = 0;
    for (const line of content.species.filter((l) => l.ancient)) {
      const host = content.nodes.find((n) => (n.populations[line.id]?.count ?? 0) > 0);
      if (!host) continue;
      const ctx: ForayContext = {
        node: toEcoNode(host),
        species: speciesIndex,
        balance: content.balance,
        season: "spring",
        act: content.balance.acts.first + 1,
        unlockedSignChains: new Set([line.id]),
      };
      for (let seed = 1; seed <= 4000; seed += 1) {
        const met = rollEncounterAt(ctx, createRng(seed));
        if (met?.lineId !== line.id) continue;
        ancientsMet += 1;
        for (const facing of ["front", "back"] as const) {
          const key = battleSpriteKey(met.lineId, met.age, facing);
          if (!manifestIds.has(key)) missing.add(key);
        }
      }
    }
    expect(ancientsMet, "no Ancient was ever met — the fixture is wrong, not the manifest").toBeGreaterThan(0);
    expect(
      [...missing].sort(),
      "the encounter roll now asks only for keys lane B has committed — BF-4 IS FIXED. Delete this " +
        "test and derive `asked` in the set-identity test above from rollEncounterAt.",
    ).toHaveLength(12);
    // Every one of them is an Ancient below Elder, and nothing else has leaked into the gap.
    for (const key of missing) {
      expect(key, `${key} is not an Ancient sprite key`).toMatch(/-(j|a)-(front|back)$/u);
    }
  });

  it("the menu panel greys a row by painting it, and reports core's reason under the cursor", () => {
    const { openingState, ctx } = replay(GYM);
    const rows = rootEntries(openingState, ctx);
    const style = { x: 0, y: 0, width: 100, rowHeight: 10, padding: 4, fontSize: "8px", visibleRows: 5 };
    const fleeIndex = rows.findIndex((r) => r.id === "flee");
    const model = menuPanelModel(rows, fleeIndex, style);
    const fleeRow = model.rows.find((r) => r.entry.id === "flee");
    // Flee is refused in a gym AND the cursor is on it: a focused-but-closed row, which the old
    // nested ternary painted in the plate's greyed colour even though it sits on the cursor bar.
    expect(fleeRow?.labelRole).toBe("cursorInkDim");
    expect(fleeRow?.backgroundRole).toBe("cursor");
    expect(model.focusedReason).toBe(illegalActionReason(openingState, { kind: "flee" }, ctx));

    // An unfocused refused row sits on the plate.
    const closedElsewhere = model.rows.find((r) => r.entry.disabled && !r.focused);
    expect(closedElsewhere?.labelRole).toBe("textDisabled");
    expect(closedElsewhere?.backgroundRole).toBe("panel");

    const movesIndex = rows.findIndex((r) => r.id === "moves");
    const openModel = menuPanelModel(rows, movesIndex, style);
    const focused = openModel.rows.find((r) => r.entry.id === "moves");
    expect(focused?.labelRole).toBe("cursorInk");
    expect(focused?.detailRole).toBe("cursorInkMuted");
    expect(focused?.backgroundRole).toBe("cursor");
    const rest = openModel.rows.find((r) => !r.focused && !r.entry.disabled);
    expect(rest?.labelRole).toBe("text");
    expect(rest?.detailRole).toBe("textMuted");
    expect(rest?.backgroundRole).toBe("panel");
  });

  it("damage numbers and effectiveness colours are display-only reads of the log's fields", () => {
    expect(damageNumberText(14, "down")).toBe("−14");
    expect(damageNumberText(9, "up")).toBe("+9");
    expect(effectivenessRole("super", false)).toBe("hot");
    expect(effectivenessRole("resisted", false)).toBe("cool");
    expect(effectivenessRole("neutral", false)).toBe("text");
    expect(effectivenessRole("resisted", true)).toBe("accent");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 9. Regressions in the compiler — one test per defect an audit reproduced.
 *
 * Each of these fails against the code as it was written, not merely against a
 * hypothetical. The comment on each says what the wrong behaviour WAS.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("battle-view regressions (each reproduces a defect that shipped)", () => {
  const { openingState } = replay(WILD);
  const opening = snapshotOf(openingState);
  const playerUid = openingState.activePlayerUid;
  const enemyUid = openingState.activeEnemyUid;

  it("a levelUp moves the ledger's LEVEL — the compiled snapshot no longer reports the old one", () => {
    // WAS: `case "levelUp"` mutated no ledger at all, so `push(events)` without a `stateAfter` left
    // the card printing the pre-level level for the rest of the fight.
    const before = opening.battlers[playerUid]?.level ?? 0;
    const { snapshot, steps } = compileBattleEvents(
      [{ t: "levelUp", uid: playerUid, level: before + 1 }],
      opening,
    );
    expect(snapshot.battlers[playerUid]?.level).toBe(before + 1);
    expect(steps[0]?.playerAt?.level).toBe(before + 1);
  });

  it("a levelUp re-reads maxHp off the state, and later HP in the same step uses the NEW maximum", () => {
    // WAS: every HP payload after a levelUp was sized against the pre-level maxHp, because the log
    // does not carry the new one and nothing else supplied it. core/battle.ts:944 raises maxHp.
    const oldMax = opening.battlers[playerUid]?.maxHp ?? 0;
    const newMax = oldMax + 20;
    const log: BattleEvent[] = [
      { t: "levelUp", uid: playerUid, level: (opening.battlers[playerUid]?.level ?? 1) + 1 },
      { t: "statusTick", uid: playerUid, status: "Toxin", amount: 5 },
    ];
    const { steps } = compileBattleEvents(log, opening, {}, { maxHp: () => newMax });
    const tick = steps[1];
    if (tick?.kind !== "statusTick") throw new Error("expected a statusTick step");
    expect(tick.maxHp).toBe(newMax);
  });

  it("a heal after a levelUp is not capped at the PRE-level maximum", () => {
    // WAS: `Math.min(ledger.maxHp, hpFrom + amount)` against a maxHp known to be stale. core's own
    // `heal()` (core/battle.ts:1037) clamps the amount it logs, so the log's number is the delta.
    const wounded = structuredClone(openingState) as BattleState;
    const target = wounded.battlers[playerUid];
    if (target === undefined) throw new Error("no active player in the fixture");
    const oldMax = target.maxHp;
    target.curHp = oldMax;
    const woundedView = snapshotOf(wounded);
    const log: BattleEvent[] = [
      { t: "levelUp", uid: playerUid, level: target.level + 1 },
      { t: "heal", uid: playerUid, amount: 12 },
    ];
    // With no state to read the new maximum from, the compiler must NOT clamp to the old one.
    const blind = compileBattleEvents(log, woundedView);
    expect(blind.snapshot.battlers[playerUid]?.curHp).toBe(oldMax + 12);
    // With the state, the new maximum is the clamp.
    const seeing = compileBattleEvents(log, woundedView, {}, { maxHp: () => oldMax + 30 });
    expect(seeing.snapshot.battlers[playerUid]?.curHp).toBe(oldMax + 12);
    const capped = compileBattleEvents(log, woundedView, {}, { maxHp: () => oldMax + 5 });
    expect(capped.snapshot.battlers[playerUid]?.curHp).toBe(oldMax + 5);
  });

  it("no step carries an inferred move TARGET — the log does not have one", () => {
    // WAS: `attack.targetUid` was "whichever active battler is not the actor", which is wrong for
    // every self-targeting move. data/moves.json marks harden/quicken/focus `target:"self"`, regrow
    // is a self-heal and burrow-roost a self-evade. There is no honest inference, so no field.
    const { events, opening: open } = replay(GYM);
    for (const step of compileBattleEvents(events, open).steps) {
      expect(Object.keys(step), `${step.kind}`).not.toContain("targetUid");
    }
    const moves = JSON.parse(readFileSync(join(ROOT, "data/moves.json"), "utf8")) as {
      moves?: Array<{ id: string; effects?: Array<{ target?: string }> }>;
    };
    // The premise is real: shipped moves do target self, so the inference was not merely unproven.
    const selfTargeting = (moves.moves ?? []).filter((m) => (m.effects ?? []).some((e) => e.target === "self"));
    expect(selfTargeting.length).toBeGreaterThan(0);
  });

  it("a gym or trainer battle does not narrate the enemy's first creature as the opponent", () => {
    // WAS: "Gym battle: Nibbin" opened the never-cut gym beat — `battleStart` carries no trainer
    // identity, so the caption named whichever creature the leader happened to field first.
    const gymOpen = compileBattleEvents(
      [{ t: "battleStart", kind: "gym", playerUid, enemyUid }],
      opening,
    ).steps[0];
    const enemyName = opening.battlers[enemyUid]?.displayName ?? "";
    expect(enemyName).not.toBe("");
    expect(gymOpen?.caption).toBe("Gym battle");
    expect(gymOpen?.caption).not.toContain(enemyName);

    // A caller that KNOWS who the opponent is may say so.
    const named = compileBattleEvents([{ t: "battleStart", kind: "gym", playerUid, enemyUid }], opening, {
      opponent: () => "Maribel",
    }).steps[0];
    expect(named?.caption).toBe("Gym battle: Maribel");

    // …and in a wild fight the creature IS the opponent, so it is still named.
    const wildOpen = compileBattleEvents(
      [{ t: "battleStart", kind: "wild", playerUid, enemyUid }],
      opening,
    ).steps[0];
    expect(wildOpen?.caption).toContain(enemyName);
  });

  it("two battlers of the same species are told apart in the narration", () => {
    // WAS: `displayName` is `nickname ?? formName` with no side marker, so the gym fight against a
    // same-species roster narrated six consecutive lines as the same name — "Nibbin used Gnaw /
    // Nibbin −38 HP / Nibbin used Maul / Nibbin −53 HP". This lands on the never-cut gym beat.
    const twinned = structuredClone(openingState) as BattleState;
    const mine = twinned.battlers[playerUid];
    const theirs = twinned.battlers[enemyUid];
    if (mine === undefined || theirs === undefined) throw new Error("fixture has both sides");
    mine.nickname = undefined;
    theirs.nickname = undefined;
    mine.formName = "Nibbin";
    theirs.formName = "Nibbin";
    mine.level = 15;
    theirs.level = 8;
    const view = snapshotOf(twinned);

    const hit = compileBattleEvents(
      [{ t: "damage", uid: enemyUid, amount: 5, effectiveness: "neutral", predation: false, crit: false }],
      view,
    ).steps[0];
    expect(hit?.caption).toContain("Nibbin Lv 8");
    const mineHit = compileBattleEvents(
      [{ t: "damage", uid: playerUid, amount: 5, effectiveness: "neutral", predation: false, crit: false }],
      view,
    ).steps[0];
    expect(mineHit?.caption).toContain("Nibbin Lv 15");
    expect(hit?.caption).not.toBe(mineHit?.caption);

    // Same species AND same level: the level alone no longer separates them, so the side does.
    theirs.level = 15;
    const tied = snapshotOf(twinned);
    const a = compileBattleEvents([{ t: "faint", uid: enemyUid }], tied).steps[0]?.caption ?? "";
    const b = compileBattleEvents([{ t: "faint", uid: playerUid }], tied).steps[0]?.caption ?? "";
    expect(a).not.toBe(b);
    expect(a).toContain("enemy");
    expect(b).toContain("player");
  });

  it("a lone battler is never qualified — the disambiguation is only where it is needed", () => {
    const hit = compileBattleEvents(
      [{ t: "damage", uid: enemyUid, amount: 5, effectiveness: "neutral", predation: false, crit: false }],
      opening,
    ).steps[0];
    const name = opening.battlers[enemyUid]?.displayName ?? "";
    expect(hit?.caption).toBe(`${name} −5 HP`);
  });

  it("every step carries the display state of the fielded pair AS OF that step", () => {
    // WAS: the scene read `BattleView.snapshot` mid-playback, which `push(events, stateAfter)` had
    // already advanced to the end of the whole reducer step. Reproduced live: a self-buff step
    // painted the player at 0 HP, two steps before the blow that emptied them was drawn.
    const { events, opening: open } = replay(GYM);
    const { steps } = compileBattleEvents(events, open);
    let seenMidTurn = 0;
    for (const step of steps) {
      expect(step.playerAt?.uid ?? step.activePlayerUid).toBe(step.activePlayerUid);
      expect(step.enemyAt?.uid ?? step.activeEnemyUid).toBe(step.activeEnemyUid);
      if (step.kind === "hit") {
        // The struck battler's carried HP is the value AFTER this blow and no later one.
        const carried = step.uid === step.activePlayerUid ? step.playerAt : step.enemyAt;
        expect(carried?.curHp, `hit on ${step.uid}`).toBe(step.hpTo);
        seenMidTurn += 1;
      }
    }
    expect(seenMidTurn).toBeGreaterThan(10);
  });

  it("BINDS — the carried state is a frozen copy, not a live view of the ledger", () => {
    // Two hits on the same battler in one log must carry two different numbers. If the steps aliased
    // the ledger, both would read the final value and the whole fix would be invisible.
    const log: BattleEvent[] = [
      { t: "damage", uid: enemyUid, amount: 3, effectiveness: "neutral", predation: false, crit: false },
      { t: "damage", uid: enemyUid, amount: 4, effectiveness: "neutral", predation: false, crit: false },
    ];
    const { steps } = compileBattleEvents(log, opening);
    const first = steps[0]?.enemyAt?.curHp ?? 0;
    const second = steps[1]?.enemyAt?.curHp ?? 0;
    expect(first - second).toBe(4);
  });

  it("stat arrows are tracked from the log's own direction, not read off a stale statMods", () => {
    const up = compileBattleEvents(
      [{ t: "statChanged", uid: playerUid, stat: "spd", direction: "up", turns: 3 }],
      opening,
    );
    expect(up.steps[0]?.playerAt?.statArrows.spd).toBe("up");
    const ended = compileBattleEvents(
      [
        { t: "statChanged", uid: playerUid, stat: "spd", direction: "up", turns: 3 },
        { t: "statChanged", uid: playerUid, stat: "spd", direction: "up", turns: 0 },
      ],
      opening,
    );
    expect(ended.steps[1]?.playerAt?.statArrows.spd).toBeUndefined();
    // …and the card renders the arrow it was given.
    const buffed = ended.steps[0]?.playerAt;
    if (buffed === undefined || buffed === null) throw new Error("expected a carried player view");
    expect(combatantCardModel(buffed, 100).mods).toContain("spd↑");
  });

  it("item labels are typeset ids, not raw ids — and no noun is coined (G2)", () => {
    const shown = compileBattleEvents([{ t: "itemUsed", itemId: "salve", uid: playerUid }], opening).steps[0];
    if (shown?.kind !== "item") throw new Error("expected an item step");
    expect(shown.itemName).toBe("Salve");
    expect(shown.itemName.toLowerCase()).toBe("salve");
    const hyphenated = compileBattleEvents(
      [{ t: "itemUsed", itemId: "burrow-roost", uid: playerUid }],
      opening,
    ).steps[0];
    if (hyphenated?.kind !== "item") throw new Error("expected an item step");
    expect(hyphenated.itemName).toBe("Burrow Roost");
    // A supplied name always wins.
    const named = compileBattleEvents([{ t: "itemUsed", itemId: "salve", uid: playerUid }], opening, {
      item: () => "Field Salve",
    }).steps[0];
    if (named?.kind !== "item") throw new Error("expected an item step");
    expect(named.itemName).toBe("Field Salve");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 10. The widgets' layout — asserted as geometry, not looked at.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the battle screen's boxes are disjoint and its text fits its plates", () => {
  const { ctx } = replay(GYM);
  const map = ctx.balance.map;
  const layout = battleScreenLayout(map.virtualWidth, map.virtualHeight);

  it("no two panels overlap at the shipped virtual resolution", () => {
    // WAS: the command menu and the player's card overlapped by 9px, and the card — re-created on
    // every rebuild, so always added last — drew over the menu's FIRST row, which is where the
    // cursor starts. Three separate screenshots showed "Fight" cut in half.
    const panels = layoutPanels(layout);
    for (let i = 0; i < panels.length; i += 1) {
      for (let j = i + 1; j < panels.length; j += 1) {
        const a = panels[i];
        const b = panels[j];
        if (a === undefined || b === undefined) continue;
        expect(rectsOverlap(a.rect, b.rect), `${a.name} overlaps ${b.name}`).toBe(false);
      }
    }
  });

  it("the card is DERIVED from the menu's position, so the two cannot drift back together", () => {
    // The historical collision was two independently-computed y values that happened to overlap:
    // `menuY = height - messageH - 96` against `playerCardY = round(height * 0.44)`. The fix is
    // structural — the message pins the menu and the menu pins the card — so moving one moves the
    // other. This asserts the ordering that makes that true, at the shipped size and at others.
    for (const [w, h] of [
      [map.virtualWidth, map.virtualHeight],
      [320, 240],
      [512, 384],
      [640, 480],
      [960, 540],
    ]) {
      const l = battleScreenLayout(w ?? 0, h ?? 0);
      expect(l.playerCard.y + l.playerCard.h, `card above menu @${String(w)}x${String(h)}`).toBeLessThanOrEqual(l.menu.y);
      expect(l.menu.y + l.menu.h, `menu above message @${String(w)}x${String(h)}`).toBeLessThanOrEqual(l.message.y);
      const panels = layoutPanels(l);
      for (let i = 0; i < panels.length; i += 1) {
        for (let j = i + 1; j < panels.length; j += 1) {
          const a = panels[i];
          const b = panels[j];
          if (a === undefined || b === undefined) continue;
          expect(rectsOverlap(a.rect, b.rect), `${a.name}/${b.name} @${String(w)}x${String(h)}`).toBe(false);
        }
      }
    }
  });

  it("every panel is inside the screen", () => {
    for (const { name, rect } of layoutPanels(layout)) {
      expect(rect.x, `${name} left`).toBeGreaterThanOrEqual(0);
      expect(rect.y, `${name} top`).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w, `${name} right`).toBeLessThanOrEqual(layout.width);
      expect(rect.y + rect.h, `${name} bottom`).toBeLessThanOrEqual(layout.height);
    }
  });

  it("BINDS — the overlap check catches an overlap", () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 })).toBe(true);
    // Touching edges are not an overlap, or the layout could never pack anything.
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    // And the real layout would fail it if the card were put back where it was.
    const broken = { ...layout.playerCard, y: layout.menu.y - 37 };
    expect(rectsOverlap(broken, layout.menu)).toBe(true);
  });

  it("neither combatant sprite is drawn over the message box", () => {
    for (const at of [layout.playerSprite, layout.enemySprite]) {
      expect(rectsOverlap(spriteRect(at), layout.message)).toBe(false);
    }
  });

  it("the HP readout fits its plate for every battler in every recorded fixture", () => {
    // WAS: the readout was drawn at local x 116 on a 150px plate, and "102/102" is 34px wide — it
    // ended exactly on the border and anything wider spilled off the card. Three-digit HP is the
    // NORMAL case here (the shipped gym enemy is 102, the player 114).
    let checked = 0;
    for (const script of SCRIPTS) {
      const { openingState } = replay(script);
      for (const battler of Object.values(openingState.battlers)) {
        const readout = hpBarModel(battler.curHp, battler.maxHp, DEFAULT_CARD_STYLE.hpBarW).readout;
        expect(readout).toMatch(/^\d+\/\d+$/);
        expect(hpReadoutFits(DEFAULT_CARD_STYLE, readout), `"${readout}" overruns the card`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("the status chip and the Lure chip share a row without colliding", () => {
    // They sit on the same y: the status left-aligned at the padding, the Lure right-aligned at the
    // plate's inner edge. Longest possible pair, measured rather than eyeballed.
    const longestStatus = [...STATUS_NAMES].sort((a, b) => b.length - a.length)[0] ?? "";
    const lure = content.moves.moves.find((m) => m.effects.some((e) => e.kind === "catchOdds"))?.name ?? "";
    expect(longestStatus).not.toBe("");
    expect(lure, "content declares a catch-odds move, or the chip has no label").not.toBe("");
    const left = CARD_PADDING + monoTextWidth(longestStatus, DEFAULT_CARD_STYLE.fontSize);
    const right = hpReadoutRightX(DEFAULT_CARD_STYLE) - monoTextWidth(lure, DEFAULT_CARD_STYLE.fontSize);
    expect(right, `"${longestStatus}" and "${lure}" collide on the card`).toBeGreaterThan(left);
  });

  it("the readout still fits at four digits, and the check binds at five", () => {
    expect(hpReadoutFits(DEFAULT_CARD_STYLE, "9999/9999")).toBe(true);
    // The guard is real: a readout wide enough to reach the bar is refused.
    expect(hpReadoutFits(DEFAULT_CARD_STYLE, "999999/999999")).toBe(false);
    // Right-aligned, so it can never cross the plate's right border whatever it says.
    expect(hpReadoutRightX(DEFAULT_CARD_STYLE)).toBe(DEFAULT_CARD_STYLE.cardW - CARD_PADDING);
    expect(monoTextWidth("102/102", "8px")).toBeGreaterThan(30);
  });

  it("the palette-frozen flag agrees with the shipped file", () => {
    // WAS: the doc comment on PALETTE_FROZEN said the inverse of what the expression computes
    // ("true while the palette still holds the pre-B0 stand-in values"), so a lane trusting it read
    // "still a stand-in" off a frozen palette. This binds the constant to the file's own value.
    expect(PALETTE_FROZEN).toBe(paletteFile.frozen);
    expect(PALETTE_FROZEN).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 10b. THE LEGIBILITY LADDER.
 *
 * The lane's palette tests used to assert role NAMES ("border", "accent") and
 * that `PALETTE_FROZEN` matched the file. Both stayed green through gate B0's
 * value swap, which inverted every ratio the role table had been chosen for: on
 * the SHIPPED frozen palette a DISABLED menu row painted at 5.29 : 1 and a
 * SELECTABLE one at 2.49 : 1, the focused row was the faintest label on its own
 * cursor bar, and a half-health HP bar sat at 1.64 : 1 against its track.
 *
 * Nothing bound a role to the contrast its hex actually produces, so the green
 * was evidence about the table's SHAPE. These tests recompute every ratio from
 * data/palette.json — and the menu ones go through the real `menuPanelModel`,
 * so they are about what gets painted rather than about a hand-picked pair.
 * ════════════════════════════════════════════════════════════════════════════ */

/** WCAG 1.4.3 AA for small text. The battle UI's body face is 8px. */
const AA_TEXT = 4.5;
/** WCAG 1.4.11 for a non-text graphical mark — an HP bar, a floating combat number. */
const AA_GRAPHIC = 3;

describe("the battle UI's palette roles form a legibility ladder on the FROZEN palette", () => {
  it("every role names a real swatch and resolves to that swatch's hex", () => {
    const byId = new Map(paletteFile.colors.map((c) => [c.id, c.hex.toLowerCase()]));
    for (const [role, id] of Object.entries(UI_SWATCH)) {
      expect(byId.has(id), `${role} names swatch "${id}"`).toBe(true);
      expect(roleHex(role as UiSwatchRole).toLowerCase(), role).toBe(byId.get(id));
    }
  });

  it("BINDS — the contrast maths agrees with WCAG's own anchors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // The number the audit measured on the shipped file, recomputed here: c04 on c01.
    expect(contrastRatio(swatchHex("c04"), swatchHex("c01"))).toBeCloseTo(5.29, 1);
  });

  it("text on the plate descends: primary > muted > refused, and the top two clear AA", () => {
    const primary = roleContrast("text", "panel");
    const muted = roleContrast("textMuted", "panel");
    const refused = roleContrast("textDisabled", "panel");
    expect(primary).toBeGreaterThanOrEqual(AA_TEXT);
    expect(muted).toBeGreaterThanOrEqual(AA_TEXT);
    expect(primary).toBeGreaterThan(muted);
    expect(muted).toBeGreaterThan(refused);
    // A greyed row must still be VISIBLE — dimmer is the point, invisible is a different defect.
    expect(refused).toBeGreaterThan(2);
    // The card's own name must out-shout its "muted" readout. It did not: 2.49 vs 3.81.
    expect(primary / muted).toBeGreaterThan(1.2);
  });

  it("the FOCUSED row is the most legible label on the panel, and its detail is legible too", () => {
    const focused = roleContrast("cursorInk", "cursor");
    expect(focused).toBeGreaterThanOrEqual(AA_TEXT);
    expect(focused).toBeGreaterThan(roleContrast("text", "panel"));
    expect(roleContrast("cursorInkMuted", "cursor")).toBeGreaterThanOrEqual(AA_TEXT);
    // A focused row core refused is dimmer than a focused row it allowed — on the same surface.
    expect(roleContrast("cursorInkDim", "cursor")).toBeLessThan(focused);
    // …and the cursor bar itself must read against the plate it sits on.
    expect(roleContrast("cursor", "panel")).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it("every HP band reads against its track, and the plate reads against the field", () => {
    // WAS: `hpMid` (c16 #eec092) on a near-white track (c02) = 1.64 : 1 — a half-health bar was
    // very nearly invisible, which is the one reading the player most needs mid-fight.
    for (const band of ["hpHigh", "hpMid", "hpLow"] as const) {
      expect(roleContrast(band, "hpTrack"), band).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
    expect(roleContrast("panel", "void")).toBeGreaterThanOrEqual(2);
    expect(roleContrast("border", "void")).toBeGreaterThanOrEqual(AA_GRAPHIC);
    // Both chips the card can draw — the status chip and the Lure chip — read on the plate.
    expect(roleContrast("status", "panel")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(roleContrast("accent", "panel")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("every FX colour reads against the field it floats over", () => {
    for (const role of ["accent", "hot", "cool", "good", "status", "text"] as const) {
      expect(roleContrast(role, "void"), role).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
    // The effectiveness bands must be three different colours or the feedback says nothing.
    const bands = new Set([
      roleHex(effectivenessRole("super", false)),
      roleHex(effectivenessRole("resisted", false)),
      roleHex(effectivenessRole("neutral", false)),
      roleHex(effectivenessRole("neutral", true)),
    ]);
    expect(bands.size).toBe(4);
  });

  it("ON THE REAL MENU — no refused row is painted more boldly than a selectable one", () => {
    // THE TEST THAT WOULD HAVE CAUGHT IT. It reads the shipped gym root menu through the real
    // `menuPanelModel`, resolves each row's painted foreground AND background through the frozen
    // palette, and compares the two populations. On the shipped table "Bag" and "Team" (both
    // refused) rendered at 5.29 : 1 while "Snare" and "Flee" (both selectable) rendered at 2.49 : 1.
    const { openingState, ctx } = replay(GYM);
    const style = { x: 0, y: 0, width: 100, rowHeight: 10, padding: 4, fontSize: "8px", visibleRows: 5 };
    const painted = (row: MenuRowRender): number => roleContrast(row.labelRole, row.backgroundRole);

    let compared = 0;
    for (let cursor = 0; cursor < rootEntries(openingState, ctx).length; cursor += 1) {
      const model = menuPanelModel(rootEntries(openingState, ctx), cursor, style);
      const open = model.rows.filter((r) => !r.entry.disabled);
      const closed = model.rows.filter((r) => r.entry.disabled);
      if (open.length === 0 || closed.length === 0) continue;
      const dimmestOpen = Math.min(...open.map(painted));
      const boldestClosed = Math.max(...closed.map(painted));
      expect(dimmestOpen, `cursor ${String(cursor)}: refused rows out-shout selectable ones`).toBeGreaterThan(
        boldestClosed,
      );
      // And the row under the cursor is the boldest thing in the pane, whatever else is in it.
      const focused = model.rows.find((r) => r.focused);
      if (focused !== undefined && !focused.entry.disabled) {
        for (const other of model.rows) {
          if (other === focused) continue;
          expect(painted(focused)).toBeGreaterThan(painted(other));
        }
      }
      compared += 1;
    }
    expect(compared, "the gym root menu has both open and closed rows").toBeGreaterThan(3);
  });

  it("BINDS — the ladder check fails against the role table this lane shipped", () => {
    // The pre-fix assignment, verbatim: panel c01, disabled c04, muted c05, text c07. Feeding the
    // same comparison the old swatches must go the other way, or the check above proves nothing.
    const was = { panel: "c01", disabled: "c04", muted: "c05", text: "c07" };
    const plate = swatchHex(was.panel);
    const enabled = contrastRatio(swatchHex(was.text), plate);
    const disabled = contrastRatio(swatchHex(was.disabled), plate);
    const muted = contrastRatio(swatchHex(was.muted), plate);
    expect(disabled).toBeGreaterThan(enabled); // the inversion, measured
    expect(muted).toBeGreaterThan(enabled); // "muted" out-shouted primary
    expect(enabled).toBeLessThan(AA_TEXT); // and primary was below AA at 8px
  });
});

describe("lane C3's comments name files that exist", () => {
  it("every repo path named in a lane-C3 file actually exists", () => {
    // WAS: BattleScene's docstring told the reader that every combatant draws through
    // `game/ui/Placeholder.ts::imageOrPlaceholder` — a module deleted during the build. A comment
    // naming a file that is not there is a comment nobody has read since it stopped being true.
    const PATH = /\b(?:core|game|tools|tests|fixtures|data|docs)\/[\w./-]*\.(?:ts|json|md)\b/g;
    let checked = 0;
    for (const file of LANE_C3_FILES) {
      for (const named of read(file).match(PATH) ?? []) {
        expect(existsSync(join(ROOT, named)), `${file} names ${named}, which does not exist`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 11. THE SCENE, EXECUTED.
 *
 * Everything above this line proves things about the compiler and the menu
 * machine. Every MAJOR defect an independent audit reproduced lived below it —
 * in `game/scenes/BattleScene.ts` and in `CombatantPanel`'s Phaser half — in
 * code that no test had ever run. These tests run it.
 * ════════════════════════════════════════════════════════════════════════════ */

interface FakeScene {
  __fake: FakeSceneParts;
}

function fakeOf(scene: BattleScene): FakeSceneParts {
  return (scene as unknown as FakeScene).__fake;
}

function contextFor(script: BattleScript): BattleContext {
  return makeBattleContext(content, predationOracleFromWebs([script.foodWeb]));
}

/** Build and open a real BattleScene over a stub Phaser. `init` + `create`, exactly as Phaser calls them. */
function openScene(
  input: BattleInput,
  ctx: BattleContext,
  rng: { float(): number },
  extra: Partial<BattleSceneData> = {},
): { scene: BattleScene; fake: FakeSceneParts } {
  const scene = new BattleScene();
  // `onFinished` is REQUIRED now (it used to be optional, and "the scene routes nowhere" plus "the
  // callback is optional" is a screen a caller can strand the player on). A test that does not care
  // about the hand-off still has to supply one, which is the point.
  const data: BattleSceneData = { ctx, input, rng, onFinished: (): void => undefined, ...extra };
  scene.init(data);
  scene.create();
  return { scene, fake: fakeOf(scene) };
}

/** Run exactly one queued step: finish whatever is animating, then fire the next timer. */
function advance(fake: FakeSceneParts): boolean {
  fake.completeTweens();
  const next = fake.timers.find((t) => !t.fired);
  if (next === undefined) return false;
  next.fired = true;
  next.run();
  return true;
}

/** A panel's card children, through the stub's container. */
function cardChildren(panel: CombatantPanel): FakeObject[] {
  return (panel.root as unknown as FakeObject).list;
}

function readoutOf(panel: CombatantPanel): string {
  const found = cardChildren(panel).find((c) => c.kind === "text" && /^\d+\/\d+$/.test(c.text));
  return found?.text ?? "";
}

function barWidthOf(panel: CombatantPanel): number {
  const bars = cardChildren(panel).filter((c) => c.kind === "rect" && c.h === DEFAULT_CARD_STYLE.hpBarH);
  return bars[1]?.w ?? -1;
}

/** The (start, end) of every HP tween the scene has created, in order. */
function hpTweens(fake: FakeSceneParts): Array<{ start: number; end: number }> {
  return fake.tweens
    .filter((t) => typeof t.config.hp === "number" && typeof t.startValues.hp === "number")
    .map((t) => ({ start: t.startValues.hp as number, end: t.config.hp as number }));
}


/**
 * A cursor over the steps the scene has actually PERFORMED.
 *
 * WAS a heuristic: it counted writes to the message label, on the grounds that `perform` says
 * exactly one caption per step. That was true when every step narrated and nothing else wrote to the
 * line, and both halves have since stopped being true — a refusal narrates nothing (its caption is
 * empty by design, because core calls the string a diagnostic) and the menu writes its own context
 * line. A miscounting cursor does not fail; it silently asserts against the wrong frame. It now
 * reads `scene.performedCount()`, which is the scene's own count.
 *
 * Counting fired timers would be wrong twice over: a flash schedules one that performs nothing, a
 * queue-drain fires one that performs nothing, and `commit()` performs a step synchronously with no
 * timer at all. `next()` returns the instant a step has been performed and before anything else
 * runs, which is the only moment a mid-animation assertion is meaningful.
 */
function stepper(scene: BattleScene, fake: FakeSceneParts): {
  index(): number;
  step(): ViewStep | undefined;
  next(): boolean;
  afterCommit(): void;
} {
  let performed = scene.performedCount();
  let index = 0;
  return {
    index: (): number => index,
    step: (): ViewStep | undefined => scene.playedSteps()[index],
    next: (): boolean => {
      while (advance(fake)) {
        const now = scene.performedCount();
        if (now === performed) continue;
        performed = now;
        index += 1;
        return true;
      }
      return false;
    },
    afterCommit: (): void => {
      performed = scene.performedCount();
      index += 1;
    },
  };
}

describe("BattleScene, executed: it renders the log and holds no rule", () => {
  it("replays the whole recorded gym fight without throwing, and reaches the reducer's outcome", () => {
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    fake.flush();
    for (const action of GYM.actions) {
      if (scene.battleState().outcome !== null) break;
      scene.commit(action);
      fake.flush();
    }
    expect(scene.battleState().outcome).toBe(GYM.expect.outcome);
    expect(scene.playedSteps().length).toBe(GYM.expect.events);
  });

  it("the HP bar starts every animation at the log's OWN hpFrom, never at a full bar", () => {
    // WAS: `tweenHp` seeded the tween with `hpBarModel(...).totalPx` — the bar's whole width — so a
    // wounded creature's bar refilled to 100% at the start of every blow and drained again, and a
    // heal played as the bar collapsing from full. `hpFrom` was on the step and the scene never read
    // it. LIVE: pxTweens = [{start:108,end:16},{start:108,end:0}], both beginning at the full 108px.
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    fake.flush();
    for (const action of GYM.actions) {
      if (scene.battleState().outcome !== null) break;
      scene.commit(action);
      fake.flush();
    }
    const expected = scene
      .playedSteps()
      .filter((s) => s.kind === "hit" || s.kind === "heal" || s.kind === "statusTick")
      .map((s) => ({ start: s.hpFrom, end: s.hpTo }));
    expect(expected.length).toBeGreaterThan(10);
    expect(hpTweens(fake)).toEqual(expected);

    // The test would pass vacuously if every tween happened to start from full, so prove it does not.
    const woundedStarts = expected.filter((t, i) => {
      const step = scene.playedSteps().filter((s) => s.kind === "hit" || s.kind === "heal" || s.kind === "statusTick")[i];
      return step !== undefined && "maxHp" in step && t.start < step.maxHp;
    });
    expect(woundedStarts.length).toBeGreaterThan(0);
  });

  it("the number and the bar move together — one writer, never two", () => {
    // WAS: `setHpFillPx` resized the rectangle only; `hpText` was written by `panel.update()`, which
    // the scene never called on a hit. LIVE: the enemy bar drained 108 -> 0 while the card went on
    // printing "71/71" for the whole step.
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    fake.flush();
    scene.commit(GYM.actions[0] as BattleAction);

    let sawTween = 0;
    for (;;) {
      if (!advance(fake)) break;
      for (const panel of Object.values(scene.panels())) {
        const readout = readoutOf(panel);
        const shownHp = Number.parseInt(readout.split("/")[0] ?? "-1", 10);
        const shownMax = Number.parseInt(readout.split("/")[1] ?? "-1", 10);
        const expectedPx = hpBarModel(shownHp, shownMax, DEFAULT_CARD_STYLE.hpBarW).fillPx;
        expect(barWidthOf(panel), `bar ${String(barWidthOf(panel))} vs readout ${readout}`).toBe(expectedPx);
      }
      sawTween += fake.tweens.filter((t) => typeof t.config.hp === "number").length > 0 ? 1 : 0;
    }
    expect(sawTween).toBeGreaterThan(0);
  });

  it("both cards read the state of the step ON SCREEN, never the end of the turn", () => {
    // WAS: `refreshPanels()` read `this.view.snapshot`, which `push(events, stateAfter)` had already
    // advanced to the end of the whole reducer step. LIVE: `"Dart: spd↑ (3)" -> 0/77` — the player's
    // HP emptied on their own buff, two steps before the blow that emptied it was drawn.
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    const at = stepper(scene, fake);
    const check = (): void => {
      const step = at.step();
      if (step === undefined) throw new Error(`no step at index ${String(at.index())}`);
      const tweening =
        step.kind === "hit" || step.kind === "heal" || step.kind === "statusTick" ? step.uid : null;
      for (const [side, panel] of Object.entries(scene.panels())) {
        const carried = side === "player" ? step.playerAt : step.enemyAt;
        if (carried === null || carried === undefined) continue;
        // The tween's target shows hpFrom until the tween runs; everything else shows the step.
        const hp = tweening === carried.uid && "hpFrom" in step ? step.hpFrom : carried.curHp;
        expect(readoutOf(panel), `${step.kind} @${String(at.index())} ${side}`).toBe(
          `${String(hp)}/${String(carried.maxHp)}`,
        );
      }
    };
    check();
    for (const action of GYM.actions) {
      if (scene.battleState().outcome !== null) break;
      while (at.next()) check();
      scene.commit(action);
      at.afterCommit();
      check();
    }
    while (at.next()) check();
    expect(at.index()).toBe(GYM.expect.events - 1);
    expect(at.index()).toBeGreaterThan(50);
  });

  it("two combatants means two sprites — a rebuild takes the old sprite with it", () => {
    // WAS: `CombatantPanel` adds its sprite to the SCENE (a card-relative child would be nowhere
    // near the creature), and `rebuildPanels()` destroyed only `panel.root`. LIVE: the shipped gym
    // fight ended with TWENTY combatant images for two combatants, the KO'd creature still drawn at
    // full opacity beside its 0-HP card, and the count climbed 4,4,6,8,… with every switch.
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    const census: number[] = [];
    fake.flush();
    census.push(fake.imagesOnScreen().length);
    for (const action of GYM.actions) {
      if (scene.battleState().outcome !== null) break;
      scene.commit(action);
      fake.flush();
      census.push(fake.imagesOnScreen().length);
    }
    expect(scene.battleState().outcome).toBe("win");
    // The fixture swaps seven times; every reading must still be exactly two.
    expect(new Set(census)).toEqual(new Set([2]));
    expect(census.length).toBeGreaterThan(5);
  });

  it("destroying a panel cancels the tween that writes to it", () => {
    // WAS: no handle was kept, so an `onUpdate` closure went on calling `setHpFillPx` on a destroyed
    // Rectangle. OBSERVED: `TypeError: Cannot read properties of null (reading 'setSize')` inside
    // Phaser's tween loop.
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    fake.flush();
    scene.commit(GYM.actions[0] as BattleAction);
    // Play up to the first hit, so a tween is in flight against a live panel.
    let guard = 0;
    while (fake.tweens.every((t) => typeof t.config.hp !== "number") && advance(fake)) {
      guard += 1;
      if (guard > 200) throw new Error("no HP tween appeared");
    }
    const live = fake.tweens.filter((t) => typeof t.config.hp === "number");
    expect(live.length).toBeGreaterThan(0);
    const panel = Object.values(scene.panels())[0];
    if (panel === undefined) throw new Error("expected a panel");
    panel.destroy();
    expect(panel.destroyed).toBe(true);
    // Whatever is still queued must not touch it, and running the loop anyway must not throw.
    expect(() => {
      fake.completeTweens();
    }).not.toThrow();
    // Destroying the panel destroyed its sprite too, not just its card.
    expect((panel.sprite as unknown as FakeObject).destroyed).toBe(true);
  });

  it("SIBLING SWEEP — destroying a panel cancels EVERY tween aimed at it, not just the HP one", () => {
    // The HP tween is the one that was observed throwing, but game/ui/BattleFx.ts aims the lunge,
    // the hit shake, the faint fade, the flee dash and the snare shakes at the same sprite. Fixing
    // only the one that was seen would have left five more of the same defect.
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    fake.flush();
    scene.commit(GYM.actions[0] as BattleAction);
    let guard = 0;
    while (fake.tweens.every((t) => typeof t.config.hp !== "number") && advance(fake)) {
      guard += 1;
      if (guard > 200) throw new Error("no HP tween appeared");
    }
    const panel = Object.values(scene.panels())[0];
    if (panel === undefined) throw new Error("expected a panel");
    const sprite = panel.sprite as unknown as FakeObject;
    const aimed = fake.tweens.filter((t) => t.config.targets === sprite);
    expect(aimed.length, "the fixture aims sprite tweens at this panel").toBeGreaterThan(0);
    panel.destroy();
    expect(aimed.every((t) => t.removed)).toBe(true);
    // …and a deferred FX callback on the destroyed sprite is a no-op rather than a write.
    expect(sprite.scene).toBeUndefined();
    expect(() => {
      fake.flush();
    }).not.toThrow();
  });

  it("a successful flee does not play the KO animation", () => {
    // WAS: `case "flee"` called `faintFade`, the same sink-and-fade Hard Req 8 reserves for a KO, so
    // escaping and being knocked out were the same picture.
    const ctx = contextFor(FLEE);
    const { scene, fake } = openScene(FLEE.input, ctx, cyclic(FLEE.rngScript));
    fake.flush();
    for (const action of FLEE.actions) {
      if (scene.battleState().outcome !== null) break;
      scene.commit(action);
      fake.flush();
    }
    expect(scene.battleState().outcome).toBe("fled");
    const fx = stripComments(read("game/scenes/BattleScene.ts"));
    const fleeCase = fx.slice(fx.indexOf('case "flee"'), fx.indexOf('case "xp"'));
    expect(fleeCase).toContain("fleeDash");
    expect(fleeCase).not.toContain("faintFade");
    // The fleeing sprite travelled sideways as well as fading — a faint only sinks.
    const moved = fake.tweens.filter((t) => typeof t.config.x === "number" && t.config.alpha === 0);
    expect(moved.length).toBeGreaterThan(0);
  });

  it("the wild catch plays through the scene and reports the caught individual once", () => {
    const ctx = contextFor(WILD);
    let finished = 0;
    let caughtLine: string | null = null;
    const { scene, fake } = openScene(WILD.input, ctx, cyclic(WILD.rngScript), {
      onFinished: (result): void => {
        finished += 1;
        caughtLine = result.caught?.lineId ?? null;
      },
    });
    fake.flush();
    for (const action of WILD.actions) {
      if (scene.battleState().outcome !== null) break;
      scene.commit(action);
      fake.flush();
    }
    expect(scene.battleState().outcome).toBe("caught");
    expect(finished).toBe(1);
    expect(caughtLine).not.toBeNull();
    expect(fake.imagesOnScreen().length).toBe(2);
  });

  it("the outcome is reported ONCE, and the scene hands the exit to its caller rather than freezing", () => {
    // The scene deliberately routes nowhere — it cannot know whether it was launched over a paused
    // overworld, from a menu, or by the demo capture. What it must NOT do is leave that to chance:
    // `onFinished` used to be OPTIONAL, so a caller that forgot it stranded the player on a screen
    // where nothing changes, every key returns early, and the scene never stops itself. It is now
    // required (the type refuses a caller that omits it), it fires exactly once however long the
    // clock runs, and every bound key after the outcome is inert.
    const ctx = contextFor(WILD);
    let finished = 0;
    const { scene, fake } = openScene(WILD.input, ctx, cyclic(WILD.rngScript), {
      onFinished: (): void => {
        finished += 1;
      },
    });
    fake.flush();
    for (const action of WILD.actions) {
      if (scene.battleState().outcome !== null) break;
      scene.commit(action);
      fake.flush();
    }
    expect(scene.battleState().outcome).not.toBeNull();
    expect(finished).toBe(1);

    const drawn = scene.performedCount();
    const message = scene.currentMessage();
    for (const key of ["keydown-UP", "keydown-DOWN", "keydown-Z", "keydown-ENTER", "keydown-X", "keydown-ESC"]) {
      fake.press(key);
    }
    fake.flush();
    fake.flush();
    expect(finished, "the hand-off fires once, not once per idle frame").toBe(1);
    expect(scene.performedCount()).toBe(drawn);
    expect(scene.currentMessage()).toBe(message);
    // The caller owns the transition; `BattleSceneData` says so and OverworldScene does it.
    expect(stripComments(read("game/scenes/BattleScene.ts"))).not.toContain("this.scene.start");
  });

  it("a caught creature LEAVES the field — the terminal frame does not leave its subject standing", () => {
    // WAS: `case "caught"` played `catchBurst` and nothing else. Measured live, at the end of the
    // battle: `spriteAlpha {p:1, e:1}`, the enemy card reading "Nibbin Lv 4 | 71/71", and the word
    // "Caught" under a placeholder sprite at full opacity — the ONLY terminal beat that left its
    // subject fielded (faint ended at alpha 0, flee at alpha 0).
    const ctx = contextFor(WILD);
    const { scene, fake } = openScene(WILD.input, ctx, cyclic(WILD.rngScript));
    fake.flush();
    for (const action of WILD.actions) {
      if (scene.battleState().outcome !== null) break;
      scene.commit(action);
      fake.flush();
    }
    expect(scene.battleState().outcome).toBe("caught");
    const enemy = scene.panels().enemy;
    const player = scene.panels().player;
    if (enemy === undefined || player === undefined) throw new Error("expected both panels");
    expect((enemy.sprite as unknown as FakeObject).alpha).toBe(0);
    expect((enemy.root as unknown as FakeObject).alpha).toBe(0);
    // The catcher is untouched — this is not a screen-wide fade.
    expect((player.sprite as unknown as FakeObject).alpha).toBe(1);
    // …and it is NOT the KO's vocabulary (Hard Req 8 keeps the sink-and-fade for a faint).
    const src = stripComments(read("game/scenes/BattleScene.ts"));
    const caughtCase = src.slice(src.indexOf('case "caught"'), src.indexOf('case "flee"'));
    expect(caughtCase).toContain("catchSettle");
    expect(caughtCase).not.toContain("faintFade");
    expect(caughtCase).not.toContain("fleeDash");
  });

  it("an active Lure is a PERSISTENT chip on the enemy card, not a caption that scrolls away", () => {
    // WAS: `lureActive` was tracked in the snapshot and moved by the log, and no widget read it —
    // `grep -rn lureActive game/ui` returned nothing and `case "lure"` was a bare `return`. Observed
    // live: "Ember used Lure" → "Lure active" → "Ember −29 HP" → "Turn 2" → "weighted snare · 80%",
    // by which point nothing on screen said why that percentage was what it was. bible §3 keeps a
    // Lure up for the rest of the battle and build-doc §7.2's `lureMult` is the largest lever there
    // is on catch odds.
    const ctx = contextFor(WILD);
    const { scene, fake } = openScene(WILD.input, ctx, cyclic(WILD.rngScript));
    fake.flush();
    const chip = (): string => {
      const panel = scene.panels().enemy;
      if (panel === undefined) return "<no enemy panel>";
      const label = ctx.moves.get("lure")?.name ?? "";
      return cardChildren(panel).some((c) => c.kind === "text" && c.text === label && label !== "") ? label : "";
    };
    expect(chip()).toBe("");

    // Turn 1 of the recorded fixture IS the lure.
    scene.commit(WILD.actions[0] as BattleAction);
    const at = stepper(scene, fake);
    at.afterCommit();
    let sawLureStep = false;
    for (;;) {
      const shown = at.step();
      if (shown?.kind === "lure") {
        sawLureStep = true;
        expect(shown.active).toBe(true);
        expect(shown.lureActive).toBe(true);
        expect(chip()).toBe(ctx.moves.get("lure")?.name);
      }
      if (!at.next()) break;
    }
    expect(sawLureStep, "the wild fixture's first action is a Lure").toBe(true);

    // …and it is STILL there several steps later, when the snare is thrown.
    fake.flush();
    expect(scene.battleState().lureActive).toBe(true);
    expect(chip()).toBe(ctx.moves.get("lure")?.name);
    const carried = scene.playedSteps().filter((s) => s.lureActive);
    expect(carried.length, "the flag rides every step after the lure, not just the lure's own").toBeGreaterThan(2);
  });

  it("the menu re-purposes the narration line instead of leaving last turn's arithmetic under it", () => {
    // WAS: `openMenu()` made the panel visible and never touched the message box. Reproduced live:
    // root menu open → msg "Ember −29 HP"; snares pane → msg "Ember −29 HP"; baits pane → msg
    // "Ember −29 HP", and NOTHING on screen named the armed tier once the snares pane closed —
    // `armedTier` was private and no widget drew it. `BattleMessageBox.clear()` had no caller.
    const ctx = contextFor(WILD);
    const { scene, fake } = openScene(WILD.input, ctx, cyclic(WILD.rngScript));
    fake.flush();
    // A turn's worth of narration first, so there is something stale to leave behind.
    scene.commit(WILD.actions[0] as BattleAction);
    fake.flush();
    const lastCaption = scene
      .playedSteps()
      .map((s) => s.caption)
      .filter((c) => c !== "")
      .pop();
    expect(lastCaption).not.toBe(undefined);
    // The menu is open again by now, and the line is the MENU's, not the turn's.
    expect(scene.currentMessage()).toBe("");
    expect(scene.currentMessage()).not.toBe(lastCaption);

    // Walk root → Snare → a tier → baits, and the line names the tier that was armed.
    const rows = rootEntries(scene.battleState(), ctx);
    const snareAt = rows.findIndex((r) => r.id === "snares");
    expect(snareAt).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < snareAt; i += 1) fake.press("keydown-DOWN");
    fake.press("keydown-Z");
    expect(scene.currentMessage()).toBe("");
    const tiers = snareEntries(scene.battleState(), ctx);
    const armedAt = tiers.findIndex((r) => !r.disabled);
    expect(armedAt).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < armedAt; i += 1) fake.press("keydown-DOWN");
    fake.press("keydown-Z");

    const armed = tiers[armedAt];
    if (armed === undefined) throw new Error("expected an open snare tier");
    expect(scene.currentMessage()).toBe(`${armed.label} snare`);
    expect(scene.currentMessage()).not.toBe("");

    // Backing out of the bait pane drops the context line with the arming.
    fake.press("keydown-X");
    expect(scene.currentMessage()).toBe("");
  });

  it("core's refusal strings are never printed as the narration line", () => {
    // WAS: `renderMenu()` and `handleKey()` pushed `illegalActionReason`'s string into the message
    // box. core/types.ts calls it "a diagnostic, not player-facing copy". LIVE, on screen:
    // "the active battler has fainted — only a switch is accepted".
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    fake.flush();
    const opening = scene.currentMessage();

    // Flee is refused in a gym. Walk the cursor onto it and confirm.
    const rows = rootEntries(scene.battleState(), ctx);
    const fleeAt = rows.findIndex((r) => r.id === "flee");
    expect(fleeAt).toBeGreaterThan(0);
    for (let i = 0; i < fleeAt; i += 1) fake.press("keydown-DOWN");
    fake.press("keydown-Z");

    const refusal = illegalActionReason(scene.battleState(), { kind: "flee" }, ctx);
    expect(refusal).not.toBeNull();
    expect(scene.lastRefusal()).toBe(refusal);
    expect(scene.currentMessage()).toBe(opening);
    expect(scene.currentMessage()).not.toBe(refusal);

    // …and moving back onto a legal row does not leave a stale refusal on screen either.
    fake.press("keydown-UP");
    expect(scene.currentMessage()).toBe(opening);
  });

  it("NO core string of ANY kind is ever on the narration line, over a whole fight", () => {
    // The scan the old suite did not have. `tests/unit/battle-view.test.ts` scanned C3's own string
    // literals and the captions of the three fixtures — and none of the fixtures contains an
    // `actionRejected` event, so the ONE path that pipes an EXTERNAL string into the message box
    // was scanned by nothing. This drives the menu through every root row of a gym (where snare and
    // flee are both refused) and asserts the message line never becomes any of core's 18 reasons.
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    fake.flush();

    const reasons = new Set<string>();
    const rows = rootEntries(scene.battleState(), ctx);
    for (const row of rows) {
      if (row.reason !== null) reasons.add(row.reason);
      if (row.action === undefined) continue;
      const why = illegalActionReason(scene.battleState(), row.action, ctx);
      if (why !== null) reasons.add(why);
    }
    for (const action of [{ kind: "snare", tier: "base" } as const, { kind: "flee" } as const]) {
      const why = illegalActionReason(scene.battleState(), action, ctx);
      if (why !== null) reasons.add(why);
    }
    expect(reasons.size, "the gym refuses something").toBeGreaterThan(0);

    const seen: string[] = [];
    for (let i = 0; i < rows.length * 2; i += 1) {
      fake.press("keydown-Z");
      seen.push(scene.currentMessage());
      fake.press("keydown-X");
      seen.push(scene.currentMessage());
      fake.press("keydown-DOWN");
      seen.push(scene.currentMessage());
    }
    // …and the reducer's own refusal path, which is the one that reaches `perform`.
    scene.commit({ kind: "snare", tier: "base" });
    fake.flush();
    seen.push(scene.currentMessage());

    const rejected = scene.playedSteps().find((s) => s.kind === "rejected");
    if (rejected?.kind !== "rejected") throw new Error("expected the gym to refuse a snare");
    expect(rejected.reason).not.toBe("");
    expect(rejected.caption).toBe("");
    expect(scene.lastRefusal()).toBe(rejected.reason);
    for (const line of seen) expect([...reasons], `printed "${line}"`).not.toContain(line);
  });

  it("the scene commits only actions core accepts, and a refused one is not committed", () => {
    const ctx = contextFor(GYM);
    const { scene, fake } = openScene(GYM.input, ctx, cyclic(GYM.rngScript));
    fake.flush();
    const turnBefore = scene.battleState().turn;
    const rows = rootEntries(scene.battleState(), ctx);
    const fleeAt = rows.findIndex((r) => r.id === "flee");
    for (let i = 0; i < fleeAt; i += 1) fake.press("keydown-DOWN");
    fake.press("keydown-Z");
    fake.flush();
    expect(scene.battleState().turn).toBe(turnBefore);
    expect(scene.playedSteps().every((s) => s.kind !== "rejected")).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 11b. A hand-built fight for the beats no recorded fixture contains.
 *
 * The three shipped fixtures produce eight of the twenty-two event kinds between
 * them (see docs/DEVIATIONS-lane-c3.md C3-G6). A self-buff, an item, a heal and a
 * refusal are all reachable through the real reducer with a hand-built input, so
 * the scene's branches for them are executed here rather than assumed.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("BattleScene, executed: the beats the fixtures do not contain", () => {
  const buffCtx = contextFor(GYM);
  const SALVE = buffCtx.balance.medicine.salveItemId;

  const buffInput: BattleInput = {
    seed: 1,
    kind: "wild",
    nodeId: "hearthollow",
    playerParty: [
      { uid: "p1", lineId: "skir-line", age: "A", level: 20, traits: [], moves: ["quicken", "gnaw"] },
      { uid: "p2", lineId: "nibbin-line", age: "A", level: 20, traits: [] },
    ],
    enemyParty: [{ uid: "e1", lineId: "nibbin-line", age: "A", level: 6, traits: [] }],
    bag: { [SALVE]: 2 },
  };

  it("a self-buff step paints the card with the HP it has AT THAT MOMENT", () => {
    // This is the auditor's own reproduction, run through the real scene: the player uses a shipped
    // self-buff, and the enemy's reply lands LATER in the same reducer step. Under the defect the
    // buff step painted the post-reply HP.
    const { scene, fake } = openScene(buffInput, buffCtx, cyclic([0.5, 0.5, 0.5, 0.5, 0.5]));
    fake.flush();
    const before = scene.battleState().battlers.p1?.curHp ?? 0;
    scene.commit({ kind: "move", moveId: "quicken" });

    const at = stepper(scene, fake);
    at.afterCommit();
    let sawStatMod = false;
    for (;;) {
      const step = at.step();
      if (step?.kind === "statMod") {
        sawStatMod = true;
        const panel = scene.panels().player;
        if (panel === undefined) throw new Error("expected a player panel");
        expect(step.playerAt?.curHp).toBe(before);
        expect(readoutOf(panel)).toBe(`${String(before)}/${String(step.playerAt?.maxHp ?? 0)}`);
        // …and the buff's arrow is on the card the moment the buff happens.
        expect(step.playerAt?.statArrows.spd).toBe("up");
      }
      if (!at.next()) break;
    }
    expect(sawStatMod, "the fight produced no statChanged event").toBe(true);
    // The point of the test: the turn really did move the player's HP afterwards.
    expect(scene.battleState().battlers.p1?.curHp).toBeLessThan(before);
  });

  it("an item and the heal it causes both render, and the bar climbs from the wounded value", () => {
    const { scene, fake } = openScene(buffInput, buffCtx, cyclic([0.5, 0.5, 0.5, 0.5, 0.5]));
    fake.flush();
    // Take a hit first, or the salve is refused (core: "already at full HP").
    scene.commit({ kind: "move", moveId: "quicken" });
    fake.flush();
    const wounded = scene.battleState().battlers.p1?.curHp ?? 0;
    const max = scene.battleState().battlers.p1?.maxHp ?? 0;
    expect(wounded).toBeLessThan(max);

    const before = fake.tweens.length;
    scene.commit({ kind: "item", itemId: SALVE });
    fake.flush();
    const kinds = scene.playedSteps().map((s) => s.kind);
    expect(kinds).toContain("item");
    expect(kinds).toContain("heal");
    const healTween = hpTweens(fake).slice(0);
    const climbed = healTween.filter((t) => t.end > t.start);
    expect(climbed.length, "a heal must tween upwards").toBeGreaterThan(0);
    expect(fake.tweens.length).toBeGreaterThan(before);
    // The item row's label is typeset, not the raw id.
    const shown = scene.playedSteps().find((s) => s.kind === "item");
    if (shown?.kind !== "item") throw new Error("expected an item step");
    expect(shown.itemName).toBe(shown.itemId.charAt(0).toUpperCase() + shown.itemId.slice(1));
  });

  it("a refused action reaches the scene as a `rejected` step and is RECORDED, never printed", () => {
    // THIS TEST USED TO ASSERT THE DEFECT. It ended `expect(scene.currentMessage()).toBe(
    // rejected.caption)` — which was green precisely because `game/battle-view.ts` had made the
    // caption core's `illegalActionReason` string and `perform` said every caption unconditionally.
    // core/types.ts:425 calls that string "a diagnostic, not player-facing copy (G7)", and
    // BattleScene's own header claimed it was not printed while it was. Reproduced in the browser:
    // committing a snare in a gym put `only a wild creature can be snared` on the narration line and
    // left `lastRefusal()` empty — the design exactly inverted.
    const { scene, fake } = openScene(buffInput, buffCtx, cyclic([0.5, 0.5, 0.5, 0.5, 0.5]));
    fake.flush();
    const before = scene.currentMessage();
    // `commit` is the integration seam: hand the reducer something it refuses and it logs why.
    scene.commit({ kind: "item", itemId: SALVE });
    fake.flush();
    const rejected = scene.playedSteps().find((s) => s.kind === "rejected");
    if (rejected?.kind !== "rejected") throw new Error("expected the reducer to refuse a full-HP salve");
    expect(rejected.diagnostic).toBe(true);
    // The diagnostic is on the step, and it is NOT the caption — the caption is empty.
    expect(rejected.reason).toBe(illegalActionReason(scene.battleState(), { kind: "item", itemId: SALVE }, buffCtx));
    expect(rejected.caption).toBe("");
    // It reaches the debug accessor…
    expect(scene.lastRefusal()).toBe(rejected.reason);
    // …and never the screen. (After the refusal the menu re-opens, so the line is the menu's.)
    expect(scene.currentMessage()).not.toBe(rejected.reason);
    // The menu is back up, so the line is the menu's context line — "" in the root pane.
    expect(scene.currentMessage()).toBe("");
    expect(before).not.toBe(rejected.reason);
  });

  it("the scene has executed every step kind these fights can produce, and the gap is declared", () => {
    // The honest census. A kind that STOPS being covered fails this; a kind that starts being
    // covered fails it too, which is the prompt to move it out of the declared gap.
    const covered = new Set<ViewStepKind>();
    const runs: Array<{ input: BattleInput; ctx: BattleContext; rng: number[]; actions: BattleAction[] }> = [
      { input: GYM.input, ctx: contextFor(GYM), rng: GYM.rngScript, actions: GYM.actions },
      { input: WILD.input, ctx: contextFor(WILD), rng: WILD.rngScript, actions: WILD.actions },
      { input: FLEE.input, ctx: contextFor(FLEE), rng: FLEE.rngScript, actions: FLEE.actions },
      {
        input: buffInput,
        ctx: buffCtx,
        rng: [0.5, 0.5, 0.5, 0.5, 0.5],
        actions: [
          { kind: "move", moveId: "quicken" },
          { kind: "item", itemId: SALVE },
          { kind: "item", itemId: SALVE },
        ],
      },
    ];
    for (const run of runs) {
      const { scene, fake } = openScene(run.input, run.ctx, cyclic(run.rng));
      fake.flush();
      for (const action of run.actions) {
        if (scene.battleState().outcome !== null) break;
        scene.commit(action);
        fake.flush();
      }
      for (const step of scene.playedSteps()) covered.add(step.kind);
    }

    const uncovered = VIEW_STEP_KINDS.filter((kind) => !covered.has(kind));
    // Declared, not silent: these are the branches no reachable fight in this suite reaches.
    // They are covered by `compileBattleEvents` tests only. docs/DEVIATIONS-lane-c3.md C3-G6.
    expect([...uncovered].sort()).toEqual(
      ["evade", "levelUp", "statusApply", "statusClear", "statusSkip", "statusTick"].sort(),
    );
    expect(covered.size).toBeGreaterThan(14);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 11c. The widgets, executed. Same stub Phaser, one object at a time.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("CombatantPanel, executed", () => {
  const { openingState } = replay(WILD);
  const opening = snapshotOf(openingState);
  const someone = opening.battlers[openingState.activePlayerUid];

  function panelScene(): { scene: PhaserRuntime.Scene; fake: FakeSceneParts } {
    const scene = new PhaserRuntime.Scene();
    return { scene, fake: (scene as unknown as FakeScene).__fake };
  }

  it("owns its sprite: destroy() takes the card AND the sprite", () => {
    if (someone === undefined) throw new Error("fixture has a player");
    const { scene, fake } = panelScene();
    const panel = new CombatantPanel(scene, {
      x: 10,
      y: 20,
      cardX: 0,
      cardY: 0,
      view: someone,
    });
    expect(fake.imagesOnScreen().length).toBe(1);
    // The sprite is NOT a child of the card container — that is why destroying only the container
    // leaked it. It must still go away.
    expect(cardChildren(panel)).not.toContain(panel.sprite as unknown as FakeObject);
    panel.destroy();
    expect(fake.imagesOnScreen().length).toBe(0);
    expect((panel.root as unknown as FakeObject).destroyed).toBe(true);
    expect(panel.destroyed).toBe(true);
    // Idempotent — a double destroy must not throw.
    expect(() => {
      panel.destroy();
    }).not.toThrow();
  });

  it("setHp writes the bar and the number together, and refuses to write after destroy", () => {
    if (someone === undefined) throw new Error("fixture has a player");
    const { scene } = panelScene();
    const panel = new CombatantPanel(scene, { x: 0, y: 0, cardX: 0, cardY: 0, view: someone });
    for (const hp of [someone.maxHp, Math.floor(someone.maxHp / 2), 1, 0]) {
      panel.setHp(hp, someone.maxHp);
      expect(readoutOf(panel)).toBe(`${String(hp)}/${String(someone.maxHp)}`);
      expect(barWidthOf(panel)).toBe(hpBarModel(hp, someone.maxHp, DEFAULT_CARD_STYLE.hpBarW).fillPx);
    }
    const last = readoutOf(panel);
    panel.destroy();
    panel.setHp(999, 999);
    expect(readoutOf(panel)).toBe(last);
  });

  it("owning a second HP tween cancels the first", () => {
    if (someone === undefined) throw new Error("fixture has a player");
    const { scene } = panelScene();
    const panel = new CombatantPanel(scene, { x: 0, y: 0, cardX: 0, cardY: 0, view: someone });
    let firstRemoved = 0;
    let secondRemoved = 0;
    panel.ownHpTween({
      remove: (): void => {
        firstRemoved += 1;
      },
    });
    panel.ownHpTween({
      remove: (): void => {
        secondRemoved += 1;
      },
    });
    expect(firstRemoved).toBe(1);
    expect(secondRemoved).toBe(0);
    panel.destroy();
    expect(secondRemoved).toBe(1);
  });

  it("PAINTED — the card's own name is bolder than its muted readout, in the colours actually set", () => {
    // The audit read `Text.style.color` off the live objects in a real browser and found the card's
    // name at 2.49 : 1 under a "muted" HP readout at 3.81 : 1. This is that measurement, headless:
    // it reads the hexes the widget WROTE, not the roles it names, so a role table and a widget that
    // disagree cannot both pass.
    if (someone === undefined) throw new Error("fixture has a player");
    const { scene } = panelScene();
    const panel = new CombatantPanel(scene, {
      x: 0,
      y: 0,
      cardX: 0,
      cardY: 0,
      view: someone,
      projectedRetirementYear: 4,
    });
    const texts = cardChildren(panel).filter((c) => c.kind === "text");
    const title = texts.find((c) => c.text.startsWith(someone.displayName));
    const readout = texts.find((c) => /^\d+\/\d+$/.test(c.text));
    if (title === undefined || readout === undefined) throw new Error("expected a title and a readout");
    const plate = roleHex("panel");
    expect(contrastRatio(title.color, plate)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(title.color, plate)).toBeGreaterThan(contrastRatio(readout.color, plate));
    expect(title.color).toBe(roleHex("text"));
    expect(readout.color).toBe(roleHex("textMuted"));
  });
});

describe("BattleMenuPanel, executed: the colours it actually writes", () => {
  it("PAINTED — no refused row is written in a bolder colour than a selectable one", () => {
    // The audit's own reproduction, headless. In the browser it read, off the live menu:
    //   Fight (focused) #ab8d62 · Bag (DISABLED) #53210c · Snare (enabled) #765b4e ·
    //   Team (DISABLED) #53210c · Flee (enabled) #765b4e
    // — the two darkest, boldest rows were the two the player could not choose. This reads the same
    // property (`setColor`'s argument) off the same widget and compares measured contrast against
    // the surface each row is drawn on.
    const { openingState, ctx } = replay(GYM);
    const scene = new PhaserRuntime.Scene();
    const style = { x: 0, y: 0, width: 142, rowHeight: 12, padding: 5, fontSize: "8px", visibleRows: 5 };
    const menu = new BattleMenuPanel(scene, style);
    const rows = rootEntries(openingState, ctx);
    expect(rows.some((r) => r.disabled) && rows.some((r) => !r.disabled)).toBe(true);

    for (let cursor = 0; cursor < rows.length; cursor += 1) {
      const model = menu.render(rows, cursor);
      const children = (menu.root as unknown as FakeObject).list.filter((c) => c.kind === "text");
      const painted = model.rows.map((row) => {
        const label = children.find((c) => c.text === row.entry.label);
        if (label === undefined) throw new Error(`no drawn label for "${row.entry.label}"`);
        // The hex the widget WROTE, against the surface the model says the row sits on.
        return { row, ratio: contrastRatio(label.color, roleHex(row.backgroundRole)) };
      });
      const open = painted.filter((p) => !p.row.entry.disabled);
      const closed = painted.filter((p) => p.row.entry.disabled);
      expect(open.length + closed.length).toBe(model.rows.length);
      if (open.length === 0 || closed.length === 0) continue;
      expect(
        Math.min(...open.map((p) => p.ratio)),
        `cursor ${String(cursor)}: a refused row is painted more boldly than a selectable one`,
      ).toBeGreaterThan(Math.max(...closed.map((p) => p.ratio)));
    }
  });
});
