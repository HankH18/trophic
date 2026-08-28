/**
 * tests/unit/audio-card-music.test.ts — THE TWO CARDS TAKE THE MUSIC, AND GIVE IT BACK.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `game/scenes/RetirementScene.ts` and `game/scenes/YearTurnScene.ts` are the never-cut Legacy and
 * Cascade beats (build-doc §1). Both are LAUNCHED OVER a paused overworld and then stopped, and a
 * resumed scene's `create()` does not run again — so nothing on the overworld side would ever
 * re-ask for its theme. Without a restore, the first year turn's festival cue plays over the town
 * for the rest of the run. That is the same structural defect `tests/unit/audio-battle-music.test.ts`
 * binds for the battle, and `takeOverMusic` exists so the three of them cannot drift into three
 * answers; this file is the other two thirds of the evidence.
 *
 * AND THE RETIREMENT CUE IS THE ONE THAT MATTERS MOST. Bible §12a's catalogue calls
 * `retirement-legacy` the cue that "carries the game's emotional beat" — it plays over the single
 * screen the demo is cut around, where the starter the player has held for years hands its numbers
 * to an heir. A location theme that fails to change is a blemish; this cue failing to play is the
 * beat arriving in silence. So §6 also asserts that the cue has a real audio file behind it in this
 * tree, because a perfectly wired scene asking for a cue nobody curated is still a silent card.
 *
 * NEITHER CARD CUE LOOPS, and that is authored rather than accidental: §12a writes
 * `retirement-legacy` as "tender, short, resolves upward" and `festival` as a "celebratory jingle
 * into a quiet outro" — two tracks meant to END, over two cards that end. `MUSIC_CUES` carries
 * `loop: false` for both, and §2 reads the flag back out of the catalogue instead of stating one.
 *
 * ⚠ WHAT WOULD MAKE THIS FILE VACUOUS, AND THE ONE THING THAT ALMOST DID.
 * These two scenes are NOT classes — they are factories taking the Phaser namespace as an argument
 * (`import "phaser"` throws under vitest's node environment), so there is no `vi.mock` here and the
 * engine double below is this file's own. The double it is modelled on — `stubEngine()` in
 * `tests/unit/year-turn-ux.test.ts` — has NO `events` property at all and no Proxy, so `this.events`
 * on a scene built against it is plain `undefined` and the whole shutdown hook is skipped. Asserting
 * "the music is restored on shutdown" against THAT double would be asserting nothing whatsoever.
 * A real `once`/`emit` emitter is therefore added here, and §1 proves it fires before anything else
 * trusts it. Everything else asserted is read off the SOUND HOST's log, a plain recorder this file
 * owns — never off a drawn object.
 *
 * G2/G11: no cue id, no volume, no species and no file path is typed in. Cue ids come from
 * `musicCueFor`, the mix from `balance.audio.volume`, the fixture's species from
 * `content.species`, and the curated file list from `indexCueFiles(globbedCueFiles())`.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { subsystemRng } from "@core/rng";
import { newOwnedCreature } from "@core/lifecycle";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Balance, Content, OwnedCreature, SpeciesLine, Trait } from "@core/types";
import {
  audio,
  createAudioDirector,
  cueDefinition,
  effectiveVolume,
  globbedCueFiles,
  indexCueFiles,
  installAudio,
  musicCueFor,
  resetAudio,
  type AudioConfig,
  type SoundHandle,
  type SoundHost,
} from "@game/audio";
import {
  createRetirementScene,
  defaultRetirementStyle,
  RETIREMENT_SCENE_KEY,
} from "@game/scenes/RetirementScene";
import {
  createYearTurnScene,
  defaultYearTurnStyle,
  driveYearTurn,
} from "@game/scenes/YearTurnScene";

const content: Content = validateContent();
const balance: Balance = content.balance;

/* ════════════════════════════════════════════════════════════════════════════
 * The cues, and the mix — every one of them derived
 * ════════════════════════════════════════════════════════════════════════════ */

/** The mix, from data — no volume is written in this file (G11). */
const CONFIG: AudioConfig = {
  master: balance.audio.volume.master,
  music: balance.audio.volume.music,
  sfx: balance.audio.volume.sfx,
  muted: false,
};

const RETIREMENT_CUE: string = musicCueFor({ screen: "retirement" }) as string;
const YEAR_TURN_CUE: string = musicCueFor({ screen: "year-turn" }) as string;

/** A theme the overworld could be playing when a card opens — a node id, never a name typed here. */
function themedNodeId(): string {
  const node = content.nodes.find(
    (n) => musicCueFor({ screen: "overworld", nodeId: n.id }) !== null,
  );
  if (!node) throw new Error("no shipped node carries a §12a theme — §4 would have nothing to interrupt");
  return node.id;
}
const TOWN_CUE: string = musicCueFor({ screen: "overworld", nodeId: themedNodeId() }) as string;

/** Every cue this file's recording host must "have". */
const EVERY_CUE: string[] = [...new Set([RETIREMENT_CUE, YEAR_TURN_CUE, TOWN_CUE])];

/** What the tree has actually curated, through the module's own index — no path is typed here. */
const ON_DISK: ReadonlyMap<string, string> = indexCueFiles(globbedCueFiles()).urls;

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
  const { host, log } = recordingHost(EVERY_CUE);
  installAudio(
    createAudioDirector({
      host,
      config: CONFIG,
      files: new Map(EVERY_CUE.map((id) => [id, `${id}.ogg`])),
    }),
  );
  return log;
}

/* ════════════════════════════════════════════════════════════════════════════
 * The stub engine — `tests/unit/year-turn-ux.test.ts`'s, PLUS A REAL EMITTER
 *
 * Copied rather than imported because that file is a test module, and modified in exactly one way:
 * a real `events` emitter, because the original has none and the restore hook this file is about
 * hangs off it. See the header for what a no-op emitter would cost.
 * ════════════════════════════════════════════════════════════════════════════ */

interface StubObject {
  setOrigin: (x?: number, y?: number) => StubObject;
  setFillStyle: (color: number, alpha?: number) => StubObject;
  destroy: () => void;
  text: string;
  fill: { color: number; alpha: number } | null;
}

interface KeyEventLike {
  repeat?: boolean;
}

/** A `once` listener the scene registered, and whether it has already fired. */
interface StubListener {
  event: string;
  run: () => void;
  fired: boolean;
}

interface StubScene {
  key: string;
  drawn: string[];
  objects: StubObject[];
  handlers: Map<string, Array<(event?: KeyEventLike) => void>>;
  launches: Array<{ key: string; data: unknown }>;
  lifecycle: string[];
  /** Keys the scene registered with `addKey` — Phaser only suppresses repeats for these. */
  addedKeys: Set<string>;
  /** Keys physically held down, so the stub can model `repeat = key.isDown`. */
  heldKeys: Set<string>;
  press: (key: string, event?: KeyEventLike) => void;
  release: (key: string) => void;
  /** Listeners registered through `events.once`. EVERY RESTORE ASSERTION HANGS ON THIS. */
  listeners: StubListener[];
  /** Fire every unfired `once` listener for an event, exactly as `sys.shutdown()` does. */
  emit: (event: string) => number;
}

/**
 * A stand-in for the slice of Phaser these two scenes touch.
 *
 * ⚠ THE KEYBOARD MODELS PHASER'S OWN REPEAT RULE, because a defect lived in it (see the original in
 * `tests/unit/year-turn-ux.test.ts`): a scene that binds `keydown-SPACE` WITHOUT `addKey` receives
 * every OS auto-repeat, and one that registers the key does not.
 */
function stubEngine(): { P: unknown; scenes: StubScene[] } {
  const scenes: StubScene[] = [];

  class StubBase {
    readonly stub: StubScene;
    add: {
      rectangle: (...a: unknown[]) => StubObject;
      text: (x: number, y: number, value: string | string[]) => StubObject;
    };
    input: {
      keyboard: {
        on: (event: string, fn: (event?: KeyEventLike) => void) => void;
        addKey: (key: string) => unknown;
      };
    };
    scene: {
      manager: { keys: Record<string, unknown> };
      launch: (key: string, data: unknown) => void;
      pause: () => void;
      resume: () => void;
      stop: () => void;
    };
    /**
     * ⚠ A REAL EMITTER, NOT A NO-OP, AND NOT ABSENT — WHICH IS WHAT THE ORIGINAL DOUBLE HAS.
     * `sys.shutdown()` emits `"shutdown"` on this object, and both cards' music restore is a `once`
     * listener on it. Left off, `this.events?.once?.(…)` short-circuits, the hook is never
     * registered, and §4's "the town theme comes back" would pass against a scene that restores
     * nothing at all. §1 drives this emitter before anything else trusts it.
     */
    events: { once: (event: string, run: () => void) => void; on: () => void };

    constructor(config: { key: string }) {
      const listeners: StubListener[] = [];
      const state: StubScene = {
        key: config.key,
        drawn: [],
        objects: [],
        handlers: new Map(),
        launches: [],
        lifecycle: [],
        addedKeys: new Set<string>(),
        heldKeys: new Set<string>(),
        press: (key: string, event?: KeyEventLike) => {
          const code = key.replace(/^keydown-/u, "");
          const wasDown = state.heldKeys.has(code);
          state.heldKeys.add(code);
          // Phaser: a registered key that is already down emits nothing (`!key || !repeat`).
          if (wasDown && state.addedKeys.has(code)) return;
          for (const fn of state.handlers.get(key) ?? []) fn(event);
        },
        release: (key: string) => {
          state.heldKeys.delete(key.replace(/^keydown-/u, ""));
        },
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
      };
      this.stub = state;
      scenes.push(state);

      const object = (label: string): StubObject => {
        const obj: StubObject = {
          text: label,
          fill: null,
          setOrigin: () => obj,
          setFillStyle: (color: number, alpha = 1) => {
            obj.fill = { color, alpha };
            return obj;
          },
          destroy: () => {
            const at = state.drawn.indexOf(label);
            if (at >= 0) state.drawn.splice(at, 1);
          },
        };
        state.drawn.push(label);
        state.objects.push(obj);
        return obj;
      };

      this.add = {
        rectangle: () => object("[rect]"),
        text: (_x, _y, value) => object(Array.isArray(value) ? value.join("\n") : value),
      };
      this.input = {
        keyboard: {
          on: (event, fn) => {
            const list = state.handlers.get(event) ?? [];
            list.push(fn);
            state.handlers.set(event, list);
          },
          addKey: (key: string) => {
            state.addedKeys.add(key);
            return { isDown: false };
          },
        },
      };
      this.scene = {
        // Populated by the drivers below; `sceneRegistered` reads it.
        manager: { keys: {} as Record<string, unknown> },
        launch: (key, data) => {
          state.launches.push({ key, data });
        },
        pause: () => state.lifecycle.push("pause"),
        resume: () => state.lifecycle.push("resume"),
        stop: () => state.lifecycle.push("stop"),
      };
      this.events = {
        once: (event: string, run: () => void): void => {
          listeners.push({ event, run, fired: false });
        },
        on: (): void => undefined,
      };
    }
  }

  return { P: { Scene: StubBase }, scenes };
}

type SceneCtor = new () => {
  stub: StubScene;
  scene: { manager: { keys: Record<string, unknown> } };
  events?: { once(event: string, run: () => void): void; on(): void };
  init: (data: never) => void;
  create: () => void;
  update: () => void;
};

/* ════════════════════════════════════════════════════════════════════════════
 * The fixture — `tests/unit/year-turn-ux.test.ts`'s Legacy drive, built from
 * the shipped content rather than by naming any of it (G2)
 * ════════════════════════════════════════════════════════════════════════════ */

/** Frames the slower of the two cards makes a player wait before it will act on a key. */
const ARM_FRAMES = Math.max(
  defaultYearTurnStyle(balance).advanceArmFrames,
  defaultRetirementStyle(balance).confirmArmFrames,
);

type Driveable = { stub: StubScene; update: () => void };

/** Run the scene's frame loop, the way Phaser's would. */
function frames(scene: Driveable, count = ARM_FRAMES): void {
  for (let i = 0; i < count; i += 1) scene.update();
}

/**
 * One deliberate keypress: the screen has been readable for its arming window, the key goes down,
 * and the player lets go. Everything a real player does; nothing a held key does.
 */
function tap(scene: Driveable, key: string): void {
  frames(scene);
  scene.stub.press(key);
  scene.stub.release(key);
}

function firstNodeId(): string {
  const node = content.nodes[0];
  if (!node) throw new Error("no nodes in the shipped content");
  return node.id;
}

/** A non-Ancient line, chosen by property so no species name appears in this file. */
function mortalLine(offset = 0): SpeciesLine {
  const lines = content.species.filter((line) => !line.ancient);
  const line = lines[offset % lines.length];
  if (!line) throw new Error("no non-Ancient species line in the shipped content");
  return line;
}

function traitAt(index: number): Trait {
  const trait = balance.traits.pool[index % balance.traits.pool.length];
  if (!trait) throw new Error("balance.traits.pool is empty");
  return { ...trait };
}

interface PartyOpts {
  uid: string;
  line: SpeciesLine;
  age: OwnedCreature["age"];
  level: number;
  traits?: Trait[];
}

function creature(opts: PartyOpts): OwnedCreature {
  return newOwnedCreature(
    {
      uid: opts.uid,
      lineId: opts.line.id,
      age: opts.age,
      level: opts.level,
      caughtYear: balance.clock.startYear,
      ...(opts.traits ? { traits: opts.traits } : {}),
    },
    opts.line,
    balance,
  );
}

function saveWith(party: OwnedCreature[], seed = 7): SaveEnvelope {
  return newSave({ seed, currentNode: firstNodeId(), nodes: content.nodes, party, box: [] }, balance);
}

function simRng(seed: number) {
  return subsystemRng(seed, balance.rng.subsystemTags[1] ?? "sim");
}

/** A counting stream, so nothing here draws from `Math.random` (G11). */
function countingRng(seed: number): () => number {
  const rng = subsystemRng(seed, balance.rng.subsystemTags[1] ?? "sim");
  return () => rng.nextFloat();
}

/** The Legacy beat as the demo cuts it: an Elder retiring with `survivors` teammates alive. */
function legacyDrive(survivors = 3, seed = 17) {
  const party = [
    creature({
      uid: "elder",
      line: mortalLine(),
      age: "E",
      level: 22,
      traits: [traitAt(0), traitAt(1)],
    }),
  ];
  for (let i = 0; i < survivors; i += 1) {
    party.push(creature({ uid: `mate${String(i)}`, line: mortalLine(i + 1), age: "J", level: 10 + i }));
  }
  const save = saveWith(party, seed);
  return driveYearTurn(save, {
    content,
    simRng: simRng(seed),
    lifecycleRng: countingRng(seed),
    endedYear: save.year,
  });
}

/* ════════════════════════════════════════════════════════════════════════════
 * Opening the two cards, exactly as Phaser opens them: `init` then `create`
 * ════════════════════════════════════════════════════════════════════════════ */

interface Card {
  scene: InstanceType<SceneCtor>;
  stub: StubScene;
}

/**
 * The retirement card.
 *
 * The portrait painter is injected because the real one reaches `scene.textures`, which this stub
 * deliberately does not have — and a labelled placeholder is what it draws anyway while the art is
 * unbuilt. Nothing about the music depends on it.
 */
function openRetirement(dropEvents = false): Card {
  const { P } = stubEngine();
  const drive = legacyDrive(2);
  const Scene = createRetirementScene(P as never) as unknown as SceneCtor;
  const scene = new Scene();
  scene.init({
    flow: drive.flow,
    onDone: () => undefined,
    placeholder: () => undefined,
  } as never);
  if (dropEvents) delete scene.events;
  scene.create();
  return { scene, stub: scene.stub };
}

/**
 * The year-turn card. `RETIREMENT_SCENE_KEY` is registered first because the sequence refuses to
 * hand off to a scene key nothing has registered, and this file is not testing that refusal.
 */
function openYearTurn(dropEvents = false): Card {
  const { P } = stubEngine();
  const drive = legacyDrive(2);
  const Scene = createYearTurnScene(P as never) as unknown as SceneCtor;
  const scene = new Scene();
  scene.init({ drive, onDone: () => undefined, placeholder: () => undefined } as never);
  scene.scene.manager.keys[RETIREMENT_SCENE_KEY] = {};
  if (dropEvents) delete scene.events;
  scene.create();
  return { scene, stub: scene.stub };
}

/** The two cards, as one table, so neither can be tested and the other quietly forgotten. */
const CARDS = [
  { name: "retirement", cue: RETIREMENT_CUE, open: openRetirement },
  { name: "year-turn", cue: YEAR_TURN_CUE, open: openYearTurn },
] as const;

beforeEach(() => {
  resetAudio();
});

/* ════════════════════════════════════════════════════════════════════════════
 * 1. THE MEASURING INSTRUMENTS. Everything below is worthless without these.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the recorders record — without this the rest is worthless", () => {
  it("the fixture is not empty and the three cues are three DIFFERENT tracks", () => {
    // A card whose cue equalled the town's would pass §4 while taking nothing over at all.
    expect(EVERY_CUE).toHaveLength(3);
    expect(RETIREMENT_CUE).not.toBe(YEAR_TURN_CUE);
    expect(RETIREMENT_CUE).not.toBe(TOWN_CUE);
    expect(YEAR_TURN_CUE).not.toBe(TOWN_CUE);
  });

  it("THE LOOP DISCRIMINATOR: §12a authors the two card cues as ONE-SHOTS and the town theme as a loop", () => {
    /*
     * ⚠ THIS IS NOT WHAT THIS LANE WAS BRIEFED TO EXPECT, AND THE CATALOGUE IS RIGHT.
     * The brief for this file said both card cues play "looping". They do not, and they should not:
     * §12a's own Mood column authors `retirement-legacy` as "tender, SHORT, resolves upward" and
     * `festival` as a "celebratory jingle INTO A QUIET OUTRO" — two tracks written to end, over two
     * cards that themselves end. `MUSIC_CUES` carries `loop: false` for both. §2 therefore asserts
     * that the host was told exactly what the catalogue says, and this test is what stops that from
     * being vacuous: if the director ignored the catalogue and passed one constant for everything,
     * these three would not disagree.
     */
    expect(cueDefinition(RETIREMENT_CUE)?.loop).toBe(false);
    expect(cueDefinition(YEAR_TURN_CUE)?.loop).toBe(false);
    expect(cueDefinition(TOWN_CUE)?.loop).toBe(true);
  });

  it("the host log starts EMPTY and grows only on a real play", () => {
    const log = installRecording();
    expect(log.played).toEqual([]);
    expect(audio().playMusic(TOWN_CUE).outcome).toBe("played");
    expect(log.played.map((p) => p.key)).toEqual([TOWN_CUE]);
    audio().stopMusic();
    expect(log.stopped).toEqual([TOWN_CUE]);
  });

  for (const card of CARDS) {
    it(`the ${card.name} scene's \`events\` emitter is REAL — a registered \`once\` listener actually fires`, () => {
      /*
       * THE WHOLE OF §4 AND §5 HANGS ON THIS. The double these are modelled on has no `events`
       * property at all, so `this.events?.once?.(…)` would short-circuit and every restore
       * assertion would pass against a scene that restores nothing. This registers a listener on a
       * freshly constructed scene and drives the emitter directly.
       */
      const { P } = stubEngine();
      const Scene = (card.name === "retirement"
        ? createRetirementScene(P as never)
        : createYearTurnScene(P as never)) as unknown as SceneCtor;
      const scene = new Scene();
      let ran = 0;
      scene.events?.once("shutdown", () => {
        ran += 1;
      });
      expect(scene.stub.emit("shutdown")).toBe(1);
      expect(ran).toBe(1);
      // `once` means once.
      expect(scene.stub.emit("shutdown")).toBe(0);
      expect(ran).toBe(1);
    });
  }

  it("opening a card really RUNS it — both cards draw, so a silent log means silence", () => {
    installRecording();
    for (const card of CARDS) {
      const opened = card.open();
      expect(opened.stub.drawn.length, `${card.name} drew nothing`).toBeGreaterThan(0);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. THE CUE. Each card plays §12a's own track for it.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 each card plays its own §12a cue on create()", () => {
  for (const card of CARDS) {
    it(`the ${card.name} card plays its cue, at §12a's own loop setting and the music volume`, () => {
      const log = installRecording();
      card.open();
      expect(log.played.map((p) => p.key)).toEqual([card.cue]);
      const first = log.played[0];
      // The loop flag is the CATALOGUE's, read back through it rather than written here — see §1's
      // loop discriminator for why a constant would have been wrong for both of these cards.
      const authored = cueDefinition(card.cue);
      expect(authored, `"${card.cue}" is not in the §12a catalogue at all`).not.toBeNull();
      expect(first?.loop).toBe(authored?.loop);
      // The mix is `balance.audio.volume` through `effectiveVolume`, never a number written here.
      expect(first?.volume).toBe(effectiveVolume(audio().config(), "music"));
      expect(audio().currentMusic()).toBe(card.cue);
    });
  }

  it("the year-turn card asks ONCE, on entry — walking its beats does not restart the track", () => {
    // `applyMusicSituation` is called from `create`, never per beat or per frame; a per-beat call
    // would answer `already-playing` today and become a stutter the moment a beat changed the cue.
    const log = installRecording();
    const opened = openYearTurn();
    for (let i = 0; i < 4; i += 1) tap(opened.scene, "keydown-SPACE");
    expect(log.played.map((p) => p.key)).toEqual([YEAR_TURN_CUE]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3 + 4. IT IS A TAKEOVER, AND THE TOWN GETS ITS THEME BACK.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 a card interrupts the overworld and hands it back on shutdown", () => {
  for (const card of CARDS) {
    it(`the ${card.name} card takes the town theme over and returns it`, () => {
      const log = installRecording();
      audio().playMusic(TOWN_CUE);
      expect(audio().currentMusic()).toBe(TOWN_CUE);

      const opened = card.open();
      expect(audio().currentMusic(), "the card did not interrupt anything").not.toBe(TOWN_CUE);
      expect(audio().currentMusic()).toBe(card.cue);

      // Exactly what `scene.stop(<key>)` does: `sys.shutdown()` emits "shutdown" on the scene.
      expect(opened.stub.emit("shutdown")).toBeGreaterThan(0);
      expect(audio().currentMusic(), "the town fell silent for the rest of the run").toBe(TOWN_CUE);
      expect(log.played.map((p) => p.key)).toEqual([TOWN_CUE, card.cue, TOWN_CUE]);
    });

    it(`a ${card.name} card that interrupted SILENCE leaves silence, not a track nobody asked for`, () => {
      const log = installRecording();
      const opened = card.open();
      expect(opened.stub.emit("shutdown")).toBeGreaterThan(0);
      expect(audio().currentMusic()).toBeNull();
      expect(log.stopped).toEqual([card.cue]);
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. THE RESTORE IS IDEMPOTENT.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 restoring twice restores once", () => {
  for (const card of CARDS) {
    it(`the ${card.name} card's restore runs once however many times it is asked`, () => {
      const log = installRecording();
      audio().playMusic(TOWN_CUE);
      const opened = card.open();
      expect(opened.stub.emit("shutdown")).toBeGreaterThan(0);
      const after = log.played.map((p) => p.key);
      expect(after).toEqual([TOWN_CUE, card.cue, TOWN_CUE]);

      // Half one: `once` means once, so a second shutdown fires no listener.
      expect(opened.stub.emit("shutdown")).toBe(0);
      // Half two — THE ONE THAT BINDS `MusicTakeover.restore`'s OWN GUARD. The listener is invoked
      // by hand a second time, which is a scene restored by its hook AND by a caller. Without the
      // guard the town cue would be asked for twice more.
      const hook = opened.stub.listeners.find((l) => l.event === "shutdown");
      expect(hook, "the card registered no shutdown hook at all").toBeDefined();
      hook?.run();
      hook?.run();
      expect(log.played.map((p) => p.key)).toEqual(after);
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6. AUDIO CANNOT BE THE REASON A NEVER-CUT BEAT FAILS TO OPEN.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 the cards open with no director, and with no emitter", () => {
  for (const card of CARDS) {
    it(`no director installed at all — the ${card.name} card opens on the silent stand-in`, () => {
      // This is the state every OTHER suite in the repo runs these scenes in, so it is also the
      // assertion that keeps this lane from breaking `tests/unit/year-turn-ux.test.ts`.
      expect(() => card.open()).not.toThrow();
      expect(audio().currentMusic()).toBeNull();
    });

    it(`a stub with NO \`events\` still CREATES the ${card.name} card — it loses the restore, not the card`, () => {
      /*
       * THE ASSERTION THAT BINDS BOTH `?.` GUARDS in the two `create()` bodies. Every other headless
       * driver of these scenes in this repo — `tests/unit/year-turn-ux.test.ts`'s included — hands
       * them an engine double with no `events` at all. Reaching through it unguarded would throw
       * inside `create()` and take the never-cut Legacy beat down in every one of those tests.
       */
      const log = installRecording();
      let opened: Card | null = null;
      expect(() => {
        opened = card.open(true);
      }).not.toThrow();
      const stub = (opened as unknown as Card).stub;
      expect(stub.drawn.length, "the card did not draw").toBeGreaterThan(0);
      // The card still PLAYED — only the hand-back is gone.
      expect(log.played.map((p) => p.key)).toEqual([card.cue]);
      expect(stub.listeners).toEqual([]);
      expect(stub.emit("shutdown")).toBe(0);
    });
  }

  it("§12a's emotional beat has a real file behind it — a wired card asking for an uncurated cue is still silent", () => {
    // Derived from `indexCueFiles(globbedCueFiles())`, which is the same index `BootScene` queues
    // from, so no path is typed here and a renamed file fails this rather than shipping quietly.
    expect(ON_DISK.size, "no audio has been curated at all").toBeGreaterThan(0);
    expect(
      ON_DISK.has(RETIREMENT_CUE),
      `no audio file in the tree for the Retirement cue "${RETIREMENT_CUE}"`,
    ).toBe(true);
    expect(ON_DISK.has(YEAR_TURN_CUE), `no audio file for the Festival cue "${YEAR_TURN_CUE}"`).toBe(true);
  });
});
