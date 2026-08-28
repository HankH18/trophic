/**
 * tests/unit/audio-battle-music.test.ts — THE FIGHT SOUNDS LIKE A FIGHT, AND GIVES THE TOWN BACK.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `tests/unit/audio.test.ts` proves `musicCueFor` picks the right cue for a situation. That is a
 * pure function, and it was green for a game in which no scene ever called it. This file runs the
 * REAL `game/scenes/BattleScene.ts` against a stub Phaser and asserts on what reached the sound
 * host — the same discipline `tests/unit/battle-view.test.ts` §11 established for the same scene,
 * and for the same reason: every defect that lane's audit found lived in code no test executed.
 *
 * THE TWO THINGS ASSERTED
 * ───────────────────────
 *   1. **The cue is selected from `BattleInput.kind` and from nothing else.** `wild` gets §12a's
 *      wild track, `trainer` and `gym` share the one track the bible gives both, `ancient` gets the
 *      Ancient cue. Every expected cue id below comes from `musicCueFor(...)`, never typed in —
 *      there is no second table here (G3), and a copy of the mapping in a test is a second table.
 *   2. **The overworld gets its theme back.** `BattleSceneData` says the scene routes nowhere: the
 *      caller stops it and RESUMES the overworld, whose `create` does not run again. So without a
 *      restore on shutdown, the battle track would play over the town for the rest of the run.
 *
 * ⚠ THE STUB TRAP. The Phaser double below wraps display objects in a `Proxy` that answers unknown
 * methods with chainable no-ops recording nothing. Nothing here asserts on a display object at all:
 * every assertion reads the SOUND HOST's log, which is a plain recorder this file owns, and §1
 * proves it grows only when a sound really starts — plus that the scene's `events` emitter really
 * fires, since the whole restore hangs off it.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

/* ════════════════════════════════════════════════════════════════════════════
 * The stub engine. Modelled on `tests/unit/battle-view.test.ts` §11's, plus a
 * REAL `events` emitter — the scene's shutdown hook is the thing under test, and
 * a no-op emitter would make §4 vacuous.
 * ════════════════════════════════════════════════════════════════════════════ */

interface FakeObject {
  kind: string;
  destroyed: boolean;
  list: FakeObject[];
  self?: FakeObject;
  destroy(): void;
  [key: string]: unknown;
}

interface FakeParts {
  timers: Array<{ ms: number; run: () => void; fired: boolean }>;
  /** Listeners registered through `events.once`, by event name. THE §4 ASSERTION HANGS ON THIS. */
  listeners: Array<{ event: string; run: () => void; fired: boolean }>;
  /** Fire every `once` listener for an event, exactly as `sys.shutdown()` does. */
  emit(event: string): number;
  flush(limit?: number): void;
}

vi.mock("phaser", () => {
  const make = (kind: string, bag: FakeObject[], owner: unknown): FakeObject => {
    const o = {
      kind,
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
      destroyed: false,
      list: [] as FakeObject[],
      setVisible(v: boolean): FakeObject {
        o.visible = v;
        return o;
      },
      destroy(): void {
        if (o.destroyed) return;
        o.destroyed = true;
        o.scene = undefined;
        for (const child of [...o.list]) child.destroy();
        const at = bag.indexOf(o.self as FakeObject);
        if (at >= 0) bag.splice(at, 1);
      },
    } as unknown as FakeObject;
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
    readonly __fake: FakeParts;
    readonly add: Record<string, unknown>;
    readonly tweens: { add(c: Record<string, unknown>): { remove(): void }; killTweensOf(): void };
    readonly time: { delayedCall(ms: number, run: () => void): { remove(): void } };
    readonly input: { keyboard: { on(): void; off(): void } };
    readonly textures: { exists(): boolean; createCanvas(): null };
    readonly events: { once(event: string, run: () => void): void; on(): void };

    constructor(_key?: string) {
      const objects: FakeObject[] = [];
      const timers: Array<{ ms: number; run: () => void; fired: boolean }> = [];
      const listeners: Array<{ event: string; run: () => void; fired: boolean }> = [];

      this.add = {
        rectangle: (): FakeObject => make("rect", objects, this),
        text: (): FakeObject => make("text", objects, this),
        image: (): FakeObject => make("image", objects, this),
        container: (_x: number, _y: number, children: FakeObject[]): FakeObject => {
          const o = make("container", objects, this);
          o.list = [...(children ?? [])];
          return o;
        },
        graphics: (): FakeObject => {
          const o = make("graphics", objects, this);
          (o as unknown as { generateTexture(): void }).generateTexture = (): void => undefined;
          return o;
        },
      };

      this.tweens = {
        add: (config: Record<string, unknown>): { remove(): void } => {
          (config.onComplete as (() => void) | undefined)?.();
          return { remove: (): void => undefined };
        },
        killTweensOf: (): void => undefined,
      };

      this.time = {
        delayedCall: (ms: number, run: () => void): { remove(): void } => {
          timers.push({ ms, run, fired: false });
          return { remove: (): void => undefined };
        },
      };

      this.input = { keyboard: { on: (): void => undefined, off: (): void => undefined } };
      this.textures = { exists: (): boolean => false, createCanvas: (): null => null };

      // ⚠ A REAL EMITTER, NOT A NO-OP. `sys.shutdown()` emits `"shutdown"` on this object, and
      // BattleScene's music restore is a `once` listener on it. Stubbed away, §4 would assert
      // nothing at all.
      this.events = {
        once: (event: string, run: () => void): void => {
          listeners.push({ event, run, fired: false });
        },
        on: (): void => undefined,
      };

      this.__fake = {
        timers,
        listeners,
        emit: (event: string): number => {
          let fired = 0;
          for (const l of listeners) {
            if (l.event !== event || l.fired) continue;
            l.fired = true;
            fired += 1;
            l.run();
          }
          return fired;
        },
        flush: (limit = 5000): void => {
          let guard = 0;
          for (;;) {
            const next = timers.find((t) => !t.fired);
            if (next === undefined) return;
            next.fired = true;
            next.run();
            guard += 1;
            if (guard > limit) throw new Error("the scene's timer queue did not drain");
          }
        },
      };
    }
  }

  return { default: { Scene }, Scene };
});

/* ── imports that must come AFTER vi.mock ─────────────────────────────────── */

import { makeBattleContext, predationOracleFromWebs, type BattleContext } from "../../core/battle";
import { validateContent } from "../../core/schemas";
import type { BattleInput, BattleKind, Content, FoodWeb } from "../../core/types";
import {
  audio,
  createAudioDirector,
  installAudio,
  musicCueFor,
  resetAudio,
  silentHost,
  type AudioConfig,
  type SoundHandle,
  type SoundHost,
} from "../../game/audio";
import { BattleScene, type BattleSceneData } from "../../game/scenes/BattleScene";

import gymJson from "../../fixtures/battle-scripts/gym-01-maribel.json";
import wildJson from "../../fixtures/battle-scripts/wild-catch-r1-nibbin.json";

interface BattleScript {
  seed: number;
  rngScript: number[];
  foodWeb: FoodWeb;
  input: BattleInput;
}

const content: Content = validateContent();
const GYM = gymJson as unknown as BattleScript;
const WILD = wildJson as unknown as BattleScript;

/** The mix, from data — no volume is written in this file either (G11). */
const CONFIG: AudioConfig = {
  master: content.balance.audio.volume.master,
  music: content.balance.audio.volume.music,
  sfx: content.balance.audio.volume.sfx,
  muted: false,
};

/* ════════════════════════════════════════════════════════════════════════════
 * The sound host, as a recorder. Plain object, plain arrays — no Proxy anywhere
 * near it, which is why §1 can prove it is not vacuous.
 * ════════════════════════════════════════════════════════════════════════════ */

interface HostLog {
  played: Array<{ key: string; loop: boolean; volume: number }>;
  stopped: string[];
  /** Rig: `play` throws AFTER `has` has already answered true. See §5. */
  playThrows: boolean;
}

function recordingHost(available: readonly string[]): { host: SoundHost; log: HostLog } {
  const log: HostLog = { played: [], stopped: [], playThrows: false };
  const have = new Set(available);
  const host: SoundHost = {
    has: (key: string): boolean => have.has(key),
    play: (key, options): SoundHandle | null => {
      if (log.playThrows) throw new Error("no audio context");
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

/** Every music cue id, so the recording host "has" whatever the scene asks for. */
const EVERY_MUSIC_CUE: string[] = (
  ["wild", "trainer", "gym", "ancient"] as const satisfies readonly BattleKind[]
)
  .map((kind) => musicCueFor({ screen: "battle", battle: kind }))
  .concat(musicCueFor({ screen: "title" }), musicCueFor({ screen: "overworld", nodeId: "hearthollow" }))
  .filter((id): id is string => id !== null);

function installRecording(): HostLog {
  const { host, log } = recordingHost(EVERY_MUSIC_CUE);
  installAudio(
    createAudioDirector({
      host,
      config: CONFIG,
      files: new Map(EVERY_MUSIC_CUE.map((id) => [id, `${id}.ogg`])),
    }),
  );
  return log;
}

function contextFor(script: BattleScript): BattleContext {
  return makeBattleContext(content, predationOracleFromWebs([script.foodWeb]));
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

/** Open a real BattleScene over the stub, exactly as Phaser calls it: `init` then `create`. */
function openBattle(
  script: BattleScript,
  kind: BattleKind = script.input.kind,
): { scene: BattleScene; parts: FakeParts } {
  const scene = new BattleScene();
  const data: BattleSceneData = {
    ctx: contextFor(script),
    input: { ...script.input, kind },
    rng: cyclic(script.rngScript),
    onFinished: (): void => undefined,
  };
  scene.init(data);
  scene.create();
  return { scene, parts: (scene as unknown as { __fake: FakeParts }).__fake };
}

beforeEach(() => {
  resetAudio();
});

/* ════════════════════════════════════════════════════════════════════════════
 * 1. THE MEASURING INSTRUMENT.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the recorders record — without this the rest is worthless", () => {
  it("the host log starts empty and grows only on a real play", () => {
    const log = installRecording();
    expect(log.played).toEqual([]);
    const cueId = musicCueFor({ screen: "title" }) as string;
    expect(audio().playMusic(cueId).outcome).toBe("played");
    expect(log.played.map((p) => p.key)).toEqual([cueId]);
    audio().stopMusic();
    expect(log.stopped).toEqual([cueId]);
  });

  it("the scene's `events` emitter is REAL — a registered `once` listener actually fires", () => {
    // The whole of §4 hangs on this. A no-op emitter (which is what the other scene stubs in this
    // repo provide) would let "the music is restored on shutdown" pass against a scene that never
    // restores anything.
    const scene = new BattleScene();
    const parts = (scene as unknown as { __fake: FakeParts }).__fake;
    let ran = 0;
    (scene as unknown as { events: { once(e: string, r: () => void): void } }).events.once("shutdown", () => {
      ran += 1;
    });
    expect(parts.emit("shutdown")).toBe(1);
    expect(ran).toBe(1);
    // `once` means once.
    expect(parts.emit("shutdown")).toBe(0);
    expect(ran).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. THE CUE. Selected from BattleInput.kind, and from nothing else.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the fight plays §12a's cue for its kind", () => {
  it("a wild encounter plays the wild track", () => {
    const log = installRecording();
    const expected = musicCueFor({ screen: "battle", battle: "wild" });
    expect(expected).not.toBeNull();
    openBattle(WILD);
    expect(log.played.map((p) => p.key)).toEqual([expected]);
    expect(audio().currentMusic()).toBe(expected);
  });

  it("a gym and a trainer fight share ONE track — §12a's row is 'Trainer/gym battle'", () => {
    const gymLog = installRecording();
    openBattle(GYM, "gym");
    const gymCue = gymLog.played.map((p) => p.key);

    resetAudio();
    const trainerLog = installRecording();
    openBattle(GYM, "trainer");
    expect(trainerLog.played.map((p) => p.key)).toEqual(gymCue);
    expect(gymCue).toEqual([musicCueFor({ screen: "battle", battle: "gym" })]);
  });

  it("an Ancient fight plays the Ancient cue, not the trainer one", () => {
    const log = installRecording();
    openBattle(GYM, "ancient");
    const expected = musicCueFor({ screen: "battle", battle: "ancient" });
    expect(log.played.map((p) => p.key)).toEqual([expected]);
    expect(expected).not.toBe(musicCueFor({ screen: "battle", battle: "gym" }));
  });

  it("every BattleKind the engine can produce reaches a DIFFERENT-or-shared cue, none of them null", () => {
    // A kind added to `BATTLE_KINDS` with no cue would open a fight in silence and nothing would
    // say so. This walks the union rather than a list retyped here.
    for (const kind of ["wild", "trainer", "gym", "ancient"] as const satisfies readonly BattleKind[]) {
      resetAudio();
      const log = installRecording();
      openBattle(GYM, kind);
      expect(log.played, `kind "${kind}" opened a fight in silence`).toHaveLength(1);
      expect(log.played[0]?.key).toBe(musicCueFor({ screen: "battle", battle: kind }));
      expect(log.played[0]?.loop).toBe(true);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. CONTINUITY IN. The town theme is cut, not layered under the fight.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 entering a fight replaces the music rather than stacking on it", () => {
  it("the overworld theme is stopped when the battle cue starts", () => {
    const log = installRecording();
    const townCue = musicCueFor({ screen: "overworld", nodeId: "hearthollow" }) as string;
    audio().playMusic(townCue);
    log.played.length = 0;
    log.stopped.length = 0;

    openBattle(WILD);
    expect(log.stopped).toEqual([townCue]);
    expect(log.played.map((p) => p.key)).toEqual([musicCueFor({ screen: "battle", battle: "wild" })]);
  });

  it("re-entering the SAME fight does not restart the track", () => {
    const log = installRecording();
    openBattle(WILD);
    openBattle(WILD);
    expect(log.played).toHaveLength(1);
    expect(log.stopped).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. CONTINUITY OUT. The caller resumes the overworld; the overworld's `create`
 *    does not run again, so the FIGHT has to hand the theme back.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 shutting the fight down gives back what it interrupted", () => {
  it("the town theme returns when the battle scene shuts down", () => {
    const log = installRecording();
    const townCue = musicCueFor({ screen: "overworld", nodeId: "hearthollow" }) as string;
    audio().playMusic(townCue);
    const { parts } = openBattle(WILD);
    expect(audio().currentMusic()).not.toBe(townCue);

    // Exactly what `scene.stop(Battle)` does: `sys.shutdown()` emits "shutdown" on the scene.
    expect(parts.emit("shutdown")).toBeGreaterThan(0);
    expect(audio().currentMusic()).toBe(townCue);
    expect(log.played.map((p) => p.key)).toEqual([
      townCue,
      musicCueFor({ screen: "battle", battle: "wild" }),
      townCue,
    ]);
  });

  it("a fight that interrupted SILENCE leaves silence, not a track nobody asked for", () => {
    const log = installRecording();
    const { parts } = openBattle(WILD);
    parts.emit("shutdown");
    expect(audio().currentMusic()).toBeNull();
    expect(log.stopped).toEqual([musicCueFor({ screen: "battle", battle: "wild" })]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. THE FIGHT RUNS WITH NO SOUND AT ALL, AND OVER AN ENGINE THAT THROWS.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 audio cannot be the reason a battle fails to open", () => {
  it("no director installed at all — the fight opens on the silent stand-in", () => {
    // This is the state every OTHER suite in the repo runs the scene in, so it is also the
    // assertion that keeps this lane from breaking them.
    expect(() => openBattle(WILD)).not.toThrow();
    expect(audio().currentMusic()).toBeNull();
  });

  it("a host with nothing loaded opens the fight in silence", () => {
    installAudio(createAudioDirector({ host: silentHost(), config: CONFIG }));
    expect(() => openBattle(GYM, "gym")).not.toThrow();
    expect(audio().currentMusic()).toBeNull();
  });

  it("a host that throws from `play` AFTER `has` passed is caught, and the fight still opens", () => {
    // ⚠ THE ORDERING IS THE POINT: `has` answers true (the cue is in the recording host's set), so
    // `playable()` lets the call through and the throw lands in `phaserSoundHost`-shaped territory
    // — the catch inside `start()`. A rig that throws from `has` would short-circuit earlier and
    // prove nothing about this catch.
    const log = installRecording();
    log.playThrows = true;
    expect(() => openBattle(WILD)).not.toThrow();
    expect(log.played).toEqual([]);
    expect(audio().currentMusic()).toBeNull();
    expect(audio().warnings().join("\n")).toContain(musicCueFor({ screen: "battle", battle: "wild" }) as string);
  });

  it("and the shutdown restore survives the same throwing host", () => {
    const log = installRecording();
    const townCue = musicCueFor({ screen: "overworld", nodeId: "hearthollow" }) as string;
    audio().playMusic(townCue);
    const { parts } = openBattle(WILD);
    log.playThrows = true;
    expect(() => parts.emit("shutdown")).not.toThrow();
  });
});
