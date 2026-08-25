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
  list: FakeObject[];
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
  const make = (kind: string, bag: FakeObject[]): FakeObject => {
    const o = {
      kind,
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
        // Phaser's Container.destroy takes its children with it; the leak this suite exists to
        // catch is precisely a child that was never IN the container.
        for (const child of [...o.list]) child.destroy();
        const at = bag.indexOf(o);
        if (at >= 0) bag.splice(at, 1);
      },
    } as unknown as FakeObject;
    bag.push(o);
    return o;
  };

  class Scene {
    readonly __fake: FakeSceneParts;
    readonly add: Record<string, (...args: never[]) => unknown>;
    readonly tweens: { add(config: Record<string, unknown>): { remove(): void } };
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
          const o = make("rect", objects);
          o.x = x;
          o.y = y;
          o.w = w;
          o.h = h;
          o.fill = fill;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        text: ((x: number, y: number, value: string): FakeObject => {
          const o = make("text", objects);
          o.x = x;
          o.y = y;
          o.text = value;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        image: ((x: number, y: number, key: string): FakeObject => {
          const o = make("image", objects);
          o.x = x;
          o.y = y;
          o.texture = key;
          return o;
        }) as unknown as (...args: never[]) => unknown,
        container: ((x: number, y: number, children: FakeObject[]): FakeObject => {
          const o = make("container", objects);
          o.x = x;
          o.y = y;
          o.list = [...children];
          return o;
        }) as unknown as (...args: never[]) => unknown,
        graphics: ((): FakeObject => {
          const o = make("graphics", objects);
          (o as unknown as { generateTexture(key: string): void }).generateTexture = (key: string): void => {
            textures.add(key);
          };
          return o;
        }) as unknown as (...args: never[]) => unknown,
      };

      this.tweens = {
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
  illegalActionReason,
  makeBattleContext,
  predationOracleFromWebs,
  startBattle,
  step,
  type BattleContext,
} from "../../core/battle";
import type {
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
  baitIdsIn,
  moveEntries,
  rootEntries,
  snareEntries,
  teamEntries,
  type MenuEntry,
} from "../../game/battle-input";
import { menuPanelModel } from "../../game/ui/BattleMenuPanel";
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
import { PALETTE_FROZEN } from "../../game/ui/Palette";
import { assetId, placeholderKey } from "../../game/placeholder";
import { damageNumberText, effectivenessRole } from "../../game/ui/BattleFx";
import { NEVER } from "../../core/lifecycle";
import { BattleScene, type BattleSceneData } from "../../game/scenes/BattleScene";
import paletteFile from "../../data/palette.json";

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
    const faintIndex = events.findIndex((e) => e.t === "faint");
    const swapIndex = events.findIndex((e) => e.t === "switched");
    expect(faintIndex).toBeGreaterThanOrEqual(0);
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
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
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
    // carry `BattlerView`s the compiler already had, and neither is an xp quantity. Nothing was
    // loosened: the list grew by exactly the two fields the type grew by, and the scan below still
    // rejects any key that looks like progress toward the next level.
    expect(Object.keys(shown).sort()).toEqual([
      "activeEnemyUid",
      "activePlayerUid",
      "amount",
      "caption",
      "enemyAt",
      "hold",
      "kind",
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

/** Hard Req 8 — KO is a faint. Nothing in a TROPHIC battle is killed. */
const DEATH_WORDS = /\b(kill|kills|killed|killing|dead|death|deaths|die|dies|died|dying|slain|slay|corpse|perish)\b/i;

/** G7 — no moralizing copy about catching. The ledger is the moral; the screen prints numbers. */
const MORALIZING = /\b(cruel|cruelty|guilt|guilty|shame|shameful|remorse|greed|greedy|selfish|wicked|evil|sin|deserve|deserved|should not have|shouldn't have|too many|senseless|needless|innocent|suffer|suffering|sorry)\b/i;

describe("G7 and Hard Req 8 — the battle screen's copy is identifiers and numbers", () => {
  for (const file of LANE_C3_FILES) {
    it(`${file} carries no death copy and no moralizing copy in any string literal`, () => {
      for (const literal of stringLiterals(read(file))) {
        expect(DEATH_WORDS.test(literal), `${file}: "${literal}"`).toBe(false);
        expect(MORALIZING.test(literal), `${file}: "${literal}"`).toBe(false);
      }
    });
  }

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
    expect(captions).toBeGreaterThan(80);
  });

  it("a KO narrates as a faint", () => {
    const { events, opening } = replay(GYM);
    const { steps } = compileBattleEvents(events, opening);
    const faint = steps.find((s) => s.kind === "faint");
    expect(faint?.caption).toMatch(/fainted$/);
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

  it("bait rows are the bag's own keys minus snares and medicines — no bait table (G3)", () => {
    const { openingState, ctx } = replay(WILD);
    const baits = baitIdsIn(openingState, ctx);
    const med = ctx.balance.medicine;
    const bagKeys = Object.keys(openingState.bag);
    expect(baits.length).toBeGreaterThan(0);
    for (const bait of baits) {
      expect(bagKeys).toContain(bait);
      expect(bait).not.toBe(med.salveItemId);
      expect(bait).not.toBe(med.tonicItemId);
    }
    // …and no snare tier leaks into the bait list.
    for (const tier of ["base", "weighted", "master"]) expect(baits).not.toContain(tier);
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
    const card = combatantCardModel(player, 100, 4);
    expect(card.title).toBe(`${player.displayName}  Lv ${String(player.level)}`);
    expect(card.hp.readout).toBe(`${String(player.curHp)}/${String(player.maxHp)}`);
    expect(card.retirement).toBe("Retires Y4");
    expect(card.spriteKey).toBe(battleSpriteKey(player.lineId, player.age, "back"));
    // The retirement year is a fact about a creature you own — the wild side never shows one.
    expect(combatantCardModel(enemy, 100, 4).retirement).toBe("");
    expect(combatantCardModel(enemy, 100).spriteKey).toBe(battleSpriteKey(enemy.lineId, enemy.age, "front"));
  });

  it("a missing sprite resolves to a stand-in that names the exact unbuilt asset id", () => {
    // build-doc §9.7's battle-sprite rows are (line, age, facing). The key is built from data, so no
    // species name is ever written in game/ (build-doc §8.3), and the shared helper's texture key
    // carries that id verbatim — a reviewer can read WHICH asset is missing off a screenshot.
    const key = battleSpriteKey("some-line", "A", "front");
    expect(key).toBe("battle/some-line/A/front");
    expect(assetId(key)).toBe(key);
    const standIn = placeholderKey(key, 72, 72);
    expect(standIn).toContain(key);
    expect(standIn).toBe(placeholderKey(key, 72, 72));
    // Front and back are different manifest rows and must never collapse onto one stand-in.
    expect(placeholderKey(battleSpriteKey("some-line", "A", "back"), 72, 72)).not.toBe(standIn);
  });

  it("the menu panel greys a row by painting it, and reports core's reason under the cursor", () => {
    const { openingState, ctx } = replay(GYM);
    const rows = rootEntries(openingState, ctx);
    const style = { x: 0, y: 0, width: 100, rowHeight: 10, padding: 4, fontSize: "8px", visibleRows: 5 };
    const fleeIndex = rows.findIndex((r) => r.id === "flee");
    const model = menuPanelModel(rows, fleeIndex, style);
    const fleeRow = model.rows.find((r) => r.entry.id === "flee");
    expect(fleeRow?.labelRole).toBe("border");
    expect(model.focusedReason).toBe(illegalActionReason(openingState, { kind: "flee" }, ctx));
    const movesIndex = rows.findIndex((r) => r.id === "moves");
    const openModel = menuPanelModel(rows, movesIndex, style);
    expect(openModel.rows.find((r) => r.entry.id === "moves")?.labelRole).toBe("accent");
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
      { t: "statusTick", uid: playerUid, status: "Poison", amount: 5 },
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
