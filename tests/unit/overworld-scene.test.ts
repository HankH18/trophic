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
      this.load = new Proxy(
        {},
        {
          get(): unknown {
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
        KeyCodes: {
          W: 87, A: 65, S: 83, D: 68, C: 67, G: 71, R: 82,
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
import { startBattle, step as battleStep, caughtIndividual } from "@core/battle";
import { seasonOf } from "@core/clock";
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
import { newSave, openStreams, type SaveEnvelope } from "@core/save";
import { subsystemRng } from "@core/rng";
import type { Balance, Content, NodeFile, NodeState } from "@core/types";
import { OverworldScene, type OverworldSceneData } from "@game/scenes/OverworldScene";
import type { BattleSceneData } from "@game/scenes/BattleScene";
import { SCENE_KEYS } from "@game/scene-keys";
import { finishYearTurn, type YearTurnSceneData } from "@game/scenes/YearTurnScene";
import { PROVISIONAL_STARTER_UID, provisionalStarter } from "@game/wild-battle";
import { maskTextureKey } from "@game/mapview";
import { encounterWeights, indexSpecies } from "@core/foodweb";

const content: Content = validateContent();
const balance: Balance = content.balance;
const species = indexSpecies(content.species);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

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

function mount(over: Partial<OverworldSceneData> = {}): Harness {
  const data: OverworldSceneData = {
    content,
    save: over.save ?? freshSave(),
    msPerTile: MS_PER_TILE,
    ...over,
  };
  const scene = new OverworldScene();
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
function settleYearTurn(h: Harness): void {
  let guard = 0;
  while (h.scene.isHandedOver()) {
    guard += 1;
    if (guard > 100) throw new Error("the year turn never handed the overworld back");
    const launch = h.parts.launches.filter((l) => l.key === SCENE_KEYS.yearTurn).pop();
    if (!launch) throw new Error("the scene is handed over with no year-turn sequence to answer");
    const data = launch.data as YearTurnSceneData;
    const { flow, tickBefore, carryTick } = data.drive;
    while (!flow.done()) flow.chooseHeir();
    h.parts.launches.splice(h.parts.launches.indexOf(launch), 1);
    const result = flow.result();
    data.onDone(finishYearTurn(result, tickBefore, carryTick), result);
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
 * §3 Encounter → battle → ledger (Hard Req 2, build-doc §1 beat 1)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 a wild encounter becomes a battle, and a catch moves a real number", () => {
  /** Walk until the scene has launched a battle, and return the encounter that launched it. */
  function firstEncounter(h: Harness): { lineId: string } {
    walk(h, 900, () => h.parts.launches.some((l) => l.key === "Battle"));
    const met = h.scene.lastEncounterMet();
    if (!met) throw new Error("no encounter in 900 steps — the fixture is wrong");
    return met;
  }

  it("launches the Battle scene with the wild creature the roll produced, and pauses itself", () => {
    const h = mount();
    firstEncounter(h);
    const launch = h.parts.launches.find((l) => l.key === "Battle");
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
    const h = mount({
      // Master snares, so the fight resolves as a catch rather than as a long grind. The bag is the
      // save's own items (build-doc §7.8) — the scene invents nothing.
      save: { ...freshSave(), items: { master: 99 } },
    });
    const met = firstEncounter(h);
    const launch = h.parts.launches.find((l) => l.key === "Battle");
    const data = launch!.data as BattleSceneData;

    const before = h.scene.countOf(met.lineId);
    expect(before).toBeGreaterThan(0);
    const partyBefore = h.scene.save.party.length;
    const logBefore = h.scene.save.actionLog.length;

    // Run the actual reducer, exactly as C3's scene would, and hand back what it produced.
    const rng = subsystemRng(h.scene.save.seed, "battle");
    let state = startBattle(data.input, data.ctx).state;
    for (let turn = 0; state.outcome === null && turn < 200; turn += 1) {
      state = battleStep(state, { kind: "snare", tier: "master" }, rng, data.ctx).state;
    }
    expect(state.outcome).toBe("caught");
    const caught = caughtIndividual(state, data.ctx);
    expect(caught).not.toBeNull();

    data.onFinished?.({ state, caught });

    expect(h.scene.countOf(met.lineId)).toBe(before - 1);
    expect(h.scene.save.party.length + h.scene.save.box.length).toBe(partyBefore + 1);
    // The tape carries the catch, so `core/save.ts` `replay` reproduces this save (L10).
    expect(h.scene.save.actionLog.length).toBe(logBefore + 1);
    const last = h.scene.save.actionLog[h.scene.save.actionLog.length - 1]!;
    expect(last.action).toMatchObject({ t: "catch", nodeId: SLICE_NODE, lineId: met.lineId });
    // …and the scene came back to the player.
    expect(h.parts.stops).toContain("Battle");
    expect(h.parts.resumed).toBeGreaterThan(0);
  });

  it("the derived encounter weight follows the catch — the cascade needs no extinction check", () => {
    const h = mount({ save: { ...freshSave(), items: { master: 99 } } });
    const met = firstEncounter(h);
    const data = (h.parts.launches.find((l) => l.key === "Battle")!.data as BattleSceneData);

    const weightOf = (lineId: string): number => {
      const ctx = h.scene.forayContext();
      return encounterWeights(ctx.node, species, balance, { season: ctx.season }).find((w) => w.lineId === lineId)?.weight ?? -1;
    };
    const weightBefore = weightOf(met.lineId);

    const rng = subsystemRng(h.scene.save.seed, "battle");
    let state = startBattle(data.input, data.ctx).state;
    for (let turn = 0; state.outcome === null && turn < 200; turn += 1) {
      state = battleStep(state, { kind: "snare", tier: "master" }, rng, data.ctx).state;
    }
    data.onFinished?.({ state, caught: caughtIndividual(state, data.ctx) });

    expect(weightOf(met.lineId)).toBeLessThan(weightBefore);
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
 * §10 THE TWO CLOCKS, EXECUTED (docs/DEVIATIONS.md D-Q2-2 / D-Q3-1)
 *
 * Every test here is a defect that a green suite did not see, because the suite called core
 * functions by hand at clocks and states the running game never reached.
 * ════════════════════════════════════════════════════════════════════════════ */

const KEY_G = 71;
const KEY_R = 82;

/** The leaders in act order — data/gyms.json's, never a list typed in here (G2). */
const LADDER = [...content.gyms].sort((a, b) => a.act - b.act);

describe("§10.1 the act ladder can be CLIMBED by playing — the never-cut slice", () => {
  it("a brand-new save is not locked inside the first town", async () => {
    /*
     * THE DEFECT. `travelTo` gained an act gate, and act 1's gate is `story.opening.done` — a flag
     * only data/dialogue.json writes, which nothing in game/ reads (Q7). Measured through this rig
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
    data.onFinished({ state: { outcome: "win" } as never, caught: null });
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
      data.onFinished({ state: { outcome } as never, caught: null });
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

    // Back to town, win the badge, and the second town opens.
    await h.scene.travelTo(first.town);
    h.press(KEY_G);
    h.frame();
    const data = h.parts.launches.find((l) => l.key === "Battle")?.data as BattleSceneData;
    data.onFinished({ state: { outcome: "win" } as never, caught: null });
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
    save = { ...save, questFlags: { ...save.questFlags, [balance.acts.runCompleteFlag]: true } };
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
    expect(h.scene.runIsOver()).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("§10.3 the published event flags follow the clock, including across the year turn", () => {
  it("event.festival.open is open for 4 ticks, NOT 8 — it is retracted at the year turn", () => {
    /*
     * THE DEFECT, and the stub-blindness that hid it. `syncEvents()` was called only inside the
     * `seasonBoundary` arm, and core/clock.ts deliberately emits NO `seasonBoundary` on the
     * year-filling tick (integration defect I4) — so the festival flag survived into the next
     * spring. Measured through this rig: 8 consecutive open ticks against a 4-tick window.
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
    season: seasonOf({ year, tick: save.tick }, balance),
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
    (launch!.data as BattleSceneData).onFinished({ state: { outcome: "win" } as never, caught: null });

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
    // The slow run already latched it (the badge that completed the run was won inside the scene).
    expect(h.scene.runIsOver()).toBe(true);
    expect(calls).toHaveLength(0);
    // A save that has NOT been handed over yet fires once, and reports the year it really happened in.
    const unlatched = { ...run.save, questFlags: { ...run.save.questFlags } };
    delete unlatched.questFlags[RUN_COMPLETE_SHOWN_FLAG];
    const fresh = mount({ save: unlatched, hooks: { onRunComplete: (s) => calls.push(s.year) } });
    expect(fresh.scene.runIsOver()).toBe(true);
    expect(calls).toEqual([FINALE_YEAR]);
  });

  it("the finale, the Vellsire choice and an epilogue all resolve at act 6 in year 11", () => {
    /*
     * THE USER STORY, END TO END, against the SHIPPED corpus. Every lookup goes through
     * `selectEntry` — the function Q7 must call — with the act coming from `scene.act()`.
     */
    const run = playSlowRun();
    const h = mount({ save: run.save });
    expect(h.scene.save.year).toBe(FINALE_YEAR);
    expect(h.scene.act()).toBe(balance.acts.last);

    const walked = walkTheEnding(h);
    expect(walked.ids).toEqual([
      "maren.finale",
      "greaves.finale.pre",
      "greaves.finale.post",
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
     * calendar passed year 6. There is no year 6 and there is no end to the calendar (D-Q3-1).
     */
    const run = playSlowRun();
    const h = mount({ save: run.save });
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
 * The one thing the corpus cannot do for itself is resolve the Vellsire ATTEMPT into an OUTCOME —
 * `sanctum.vellsire.approach`'s choices write `story.vellsire.attempt`, and the epilogues read
 * `story.vellsire.resolved` / `story.vellsire.outcome`, which nothing in `data/dialogue.json` writes.
 * That is a DECLARED seam (docs/DIALOGUE-NOTES.md: "the encounter writes `story.vellsire.outcome`"),
 * because bible §4 makes Ancients very hard catches and a snare may fail. It is the game layer's
 * write and the game layer does not exist yet (Q7/C7), so it is done here explicitly and marked, and
 * nothing else in this walk is stood in for.
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

  // Wick loses on the approach and Maren sends the player through — the beat that sets up the finale.
  flags = { ...flags, ...(DIALOGUE.entries.find((e) => e.id === "wick.act6.win")?.setFlags ?? {}) };
  play("maren", "sanctum-approach", "cutscene");
  play("greaves", "sanctum", "battle-pre");
  play("greaves", "sanctum", "battle-win");
  const approach = play("prop-antler-stone", "sanctum", "cutscene");
  const choiceCount = approach?.choices?.length ?? 0;

  // The player sets the snare (choice 0) …
  const caught = { ...flags, ...(approach?.choices?.[0]?.setFlags ?? {}) };
  // … and THE GAME LAYER resolves the attempt into an outcome. Declared stand-in; see above.
  flags = { ...caught, "story.vellsire.resolved": true, "story.vellsire.outcome": "caught" };
  play("maren", "sanctum", "cutscene");
  const epilogueAgain = selectEntry(DIALOGUE, "maren", "sanctum", "cutscene", at())?.id;

  // The other branch, from the same pre-choice state.
  const released = selectEntry(DIALOGUE, "maren", "sanctum", "cutscene", {
    ...base,
    flags: {
      ...flags,
      "story.epilogue.shown": false,
      ...(approach?.choices?.[1]?.setFlags ?? {}),
      "story.vellsire.resolved": true,
      "story.vellsire.outcome": "released",
    },
  })?.id;

  return { ids, choiceCount, releasedEpilogue: released, epilogueAgain };
}
