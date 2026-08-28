/**
 * tests/unit/audio.test.ts — the cue layer's behaviour, and above all the one rule it exists for:
 * **audio failing must not be able to break the game.**
 *
 * `tests/gates/audio-cue-contract.test.ts` pins the cue NAMES to docs/content-bible.md §12a. This
 * file pins what happens when you ask for one. The distinction matters: the names can be perfect
 * while the first `playMusic("title")` on the title screen takes the boot down, and audio is the
 * most cuttable layer in the project — it must never be the thing that decides whether there is a
 * game at all.
 *
 * The hostile rig below (`throwingHost`) throws from every method it has, including from the handle
 * it returns. Every public entry point is driven through it and none is allowed to propagate.
 *
 * THE SUITE NEVER PLAYS AUDIO. `game/audio.ts` takes the engine as an argument (`SoundHost`), and
 * every test here supplies its own — `silentHost()`, a recording fake, or the throwing rig. Phaser
 * is never imported (it cannot be, under vitest's node environment), no decoder runs, and no audio
 * context is created. That is a property of the design, not of a mock: there is no code path from
 * this file to a real device.
 */

import { describe, expect, it } from "vitest";

import {
  ALL_CUES,
  JINGLE_CUES,
  MUSIC_CUES,
  SFX_CUES,
  type AudioConfig,
  type SoundHandle,
  type SoundHost,
  AudioTreatmentError,
  createAudioDirector,
  cueDefinition,
  cueIdForFile,
  cueIds,
  cueIdsOfKind,
  effectiveVolume,
  indexCueFiles,
  musicCueFor,
  seasonTreatment,
  silentHost,
} from "../../game/audio";
import balance from "../../data/balance.json";
import type { Balance, Season } from "../../core/types";
import { SEASONS } from "../../core/types";

const BALANCE = balance as unknown as Balance;

/**
 * A config for tests. Stated at the call site rather than defaulted in `game/audio.ts` — see that
 * file's header on G11: a default volume living in code is exactly the literal the guardrail bans,
 * and these numbers are a test fixture, not a tuning.
 */
const AUDIBLE: AudioConfig = { master: 1, music: 1, sfx: 1, muted: false };
const MUTED: AudioConfig = { ...AUDIBLE, muted: true };

/** Records what it was asked to play, and claims to have everything it was given. */
function recordingHost(available: readonly string[]): SoundHost & {
  readonly played: Array<{ key: string; loop: boolean; volume: number }>;
  readonly stopped: string[];
  readonly volumes: Array<{ key: string; volume: number }>;
} {
  const played: Array<{ key: string; loop: boolean; volume: number }> = [];
  const stopped: string[] = [];
  const volumes: Array<{ key: string; volume: number }> = [];
  return {
    played,
    stopped,
    volumes,
    has: (key) => available.includes(key),
    play(key, options): SoundHandle {
      played.push({ key, loop: options.loop, volume: options.volume });
      return {
        stop: () => stopped.push(key),
        setVolume: (volume) => volumes.push({ key, volume }),
      };
    },
  };
}

/** Throws from everything, including from the handle it hands back. */
function throwingHost(): SoundHost {
  return {
    has() {
      throw new Error("cache exploded");
    },
    play(): SoundHandle {
      throw new Error("engine exploded");
    },
  };
}

/**
 * Claims to have the file, then throws from `play`.
 *
 * This rig exists because a SABOTAGE found the hole it fills: with `throwingHost` alone, deleting
 * the try/catch around `host.play` in game/audio.ts changed nothing, because that host throws from
 * `has()` first and the cue is refused as "no-file" before `play` is ever reached. A host that
 * passes the has() check and then explodes is the only thing that reaches that catch.
 */
function throwOnPlayHost(): SoundHost {
  return {
    has: () => true,
    play() {
      throw new Error("play exploded");
    },
  };
}

/** Claims to have the file, hands back a handle whose every method throws. */
function rottenHandleHost(): SoundHost {
  return {
    has: () => true,
    play: () => ({
      stop() {
        throw new Error("stop exploded");
      },
      setVolume() {
        throw new Error("setVolume exploded");
      },
    }),
  };
}

const filesFor = (...ids: string[]): Map<string, string> =>
  new Map(ids.map((id) => [id, `/fake/${id}.ogg`]));

/* ────────────────────────────────────────────────────────────────────────────
 * The catalogue is reachable
 * ──────────────────────────────────────────────────────────────────────────── */

describe("every bible-specified cue has a defined entry", () => {
  it("all eleven music cues, five jingles and the SFX set resolve by id", () => {
    expect(MUSIC_CUES).toHaveLength(11);
    expect(JINGLE_CUES).toHaveLength(5);
    expect(SFX_CUES.length).toBeGreaterThan(0);
    for (const cue of ALL_CUES) {
      const found = cueDefinition(cue.id);
      expect(found, `cueDefinition("${cue.id}")`).not.toBeNull();
      expect(found?.bibleLabel.length, cue.id).toBeGreaterThan(0);
    }
  });

  it("cueIds() and cueIdsOfKind() partition the catalogue with nothing lost", () => {
    const byKind = [...cueIdsOfKind("music"), ...cueIdsOfKind("jingle"), ...cueIdsOfKind("sfx")].sort();
    expect(byKind).toEqual(cueIds());
    expect(cueIdsOfKind("music")).toHaveLength(11);
  });

  it("an id nothing answers to resolves to null rather than throwing", () => {
    expect(cueDefinition("no-such-cue")).toBeNull();
    expect(cueDefinition("")).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE RULE: a missing cue is a no-op, never a throw
 * ──────────────────────────────────────────────────────────────────────────── */

describe("a cue with no file is a no-op, not a throw", () => {
  it("EVERY cue in the catalogue can be asked for with no files at all", () => {
    // This is the state the project is actually in: assets/audio/ holds no audio. Every cue in the
    // bible is driven here, so "audio is uncurated" cannot be a crash on any one of them.
    const director = createAudioDirector({ host: silentHost(), config: AUDIBLE });
    for (const cue of ALL_CUES) {
      const result = cue.kind === "music" ? director.playMusic(cue.id) : director.playCue(cue.id);
      expect(result.outcome, cue.id).toBe("no-file");
    }
    expect(director.currentMusic()).toBeNull();
    // An uncurated cue is the expected state, so it must not spam the warning log either — a log
    // full of "no file" is a log nobody reads when a real fault appears.
    expect(director.warnings()).toEqual([]);
  });

  it("an unknown cue id is refused with a warning, not an exception", () => {
    const director = createAudioDirector({ host: silentHost(), config: AUDIBLE });
    expect(director.playMusic("not-a-cue").outcome).toBe("unknown-cue");
    expect(director.playCue("also-not-a-cue").outcome).toBe("unknown-cue");
    expect(director.warnings()).toHaveLength(2);
    expect(director.warnings()[0]).toContain("not-a-cue");
  });

  it("asking for a cue of the wrong kind is refused rather than mis-played", () => {
    // playMusic("door") would otherwise start a door thud as the area's music bed and leave it
    // registered as the current track.
    const director = createAudioDirector({
      host: recordingHost(cueIds()),
      config: AUDIBLE,
      files: filesFor(...cueIds()),
    });
    expect(director.playMusic("door").outcome).toBe("unknown-cue");
    expect(director.playCue("title").outcome).toBe("unknown-cue");
    expect(director.currentMusic()).toBeNull();
  });

  it("A HOST THAT THROWS FROM EVERYTHING cannot take any entry point down", () => {
    const warnings: string[] = [];
    const director = createAudioDirector({
      host: throwingHost(),
      config: AUDIBLE,
      files: filesFor(...cueIds()),
      onWarning: (m) => warnings.push(m),
    });
    // Every public method, against a host that throws from has() and from play().
    for (const cue of ALL_CUES) {
      expect(() => (cue.kind === "music" ? director.playMusic(cue.id) : director.playCue(cue.id))).not.toThrow();
    }
    expect(() => director.stopMusic()).not.toThrow();
    expect(() => director.currentMusic()).not.toThrow();
    expect(() => director.availableCueIds()).not.toThrow();
    expect(() => director.warnings()).not.toThrow();
    // has() throwing reads as "nothing decoded", which is the same as an uncurated cue.
    expect(director.playMusic("title").outcome).toBe("no-file");
    // setConfig last: it is the one call that changes what the outcomes above mean.
    expect(() => director.setConfig(MUTED)).not.toThrow();
    expect(director.playMusic("title").outcome).toBe("silent");
  });

  it("AN ENGINE THAT THROWS FROM play() is recorded as a refusal, not propagated", () => {
    // The case throwingHost cannot reach: has() succeeds, play() explodes. Without this, deleting
    // the try/catch around host.play in game/audio.ts is invisible to the whole suite.
    const director = createAudioDirector({
      host: throwOnPlayHost(),
      config: AUDIBLE,
      files: filesFor(...cueIds()),
    });
    for (const cue of ALL_CUES) {
      const call = (): unknown => (cue.kind === "music" ? director.playMusic(cue.id) : director.playCue(cue.id));
      expect(call, cue.id).not.toThrow();
      const result = cue.kind === "music" ? director.playMusic(cue.id) : director.playCue(cue.id);
      expect(result.outcome, cue.id).toBe("host-refused");
    }
    expect(director.currentMusic()).toBeNull();
    expect(director.warnings().length).toBeGreaterThan(0);
  });

  it("a handle whose stop() and setVolume() throw cannot take a scene transition down", () => {
    // The scene-transition case, exactly: something is playing, the scene changes, the track is
    // stopped and the next one started. A rotten handle must not make that the end of the run.
    const director = createAudioDirector({
      host: rottenHandleHost(),
      config: AUDIBLE,
      files: filesFor("title", "hearthollow"),
    });
    expect(director.playMusic("title").outcome).toBe("played");
    expect(() => director.setConfig({ ...AUDIBLE, music: 0.5 })).not.toThrow();
    expect(() => director.playMusic("hearthollow")).not.toThrow();
    expect(director.currentMusic()).toBe("hearthollow");
    expect(() => director.stopMusic()).not.toThrow();
    expect(director.currentMusic()).toBeNull();
  });

  it("a warning sink that throws does not become the failure it was reporting", () => {
    const director = createAudioDirector({
      host: silentHost(),
      config: AUDIBLE,
      onWarning: () => {
        throw new Error("logger exploded");
      },
    });
    expect(() => director.playMusic("nope")).not.toThrow();
    expect(director.warnings()).toHaveLength(1);
  });

  it("a file that the build found but the engine failed to decode is refused, not played", () => {
    // The 404 / bad-decode case: indexCueFiles saw a path, the loader never produced a sound.
    const host: SoundHost = { has: () => false, play: () => ({ stop: () => {}, setVolume: () => {} }) };
    const director = createAudioDirector({ host, config: AUDIBLE, files: filesFor("title") });
    expect(director.playMusic("title").outcome).toBe("no-file");
    expect(director.currentMusic()).toBeNull();
  });

  it("a host that returns null from play() is recorded, not treated as playing", () => {
    const host: SoundHost = { has: () => true, play: () => null };
    const director = createAudioDirector({ host, config: AUDIBLE, files: filesFor("title") });
    expect(director.playMusic("title").outcome).toBe("host-refused");
    expect(director.currentMusic()).toBeNull();
    expect(director.warnings()[0]).toContain("no sound");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Silence is reachable, and it is what the suite runs in
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the layer can run fully silent", () => {
  it("silentHost() has nothing and plays nothing", () => {
    const host = silentHost();
    expect(host.has("title")).toBe(false);
    expect(host.play("title", { loop: true, volume: 1 })).toBeNull();
  });

  it("muted stops the music that is playing rather than leaving a loop at gain zero", () => {
    const host = recordingHost(["title"]);
    const director = createAudioDirector({ host, config: AUDIBLE, files: filesFor("title") });
    expect(director.playMusic("title").outcome).toBe("played");
    director.setConfig(MUTED);
    expect(director.currentMusic()).toBeNull();
    expect(host.stopped).toEqual(["title"]);
  });

  it("muted refuses every cue, of every kind, without touching the host", () => {
    const host = recordingHost(cueIds());
    const director = createAudioDirector({ host, config: MUTED, files: filesFor(...cueIds()) });
    for (const cue of ALL_CUES) {
      const result = cue.kind === "music" ? director.playMusic(cue.id) : director.playCue(cue.id);
      expect(result.outcome, cue.id).toBe("silent");
      expect(result.volume, cue.id).toBe(0);
    }
    expect(host.played).toEqual([]);
  });

  it("a master volume of zero is silence too, without needing the mute flag", () => {
    const host = recordingHost(["title"]);
    const director = createAudioDirector({
      host,
      config: { master: 0, music: 1, sfx: 1, muted: false },
      files: filesFor("title"),
    });
    expect(director.playMusic("title").outcome).toBe("silent");
    expect(host.played).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Volume is configuration, never a literal
 * ──────────────────────────────────────────────────────────────────────────── */

describe("volume and mute come from the config argument", () => {
  it("music and stingers scale on their own level, both under master", () => {
    const config: AudioConfig = { master: 0.5, music: 0.4, sfx: 0.8, muted: false };
    expect(effectiveVolume(config, "music")).toBeCloseTo(0.2, 12);
    expect(effectiveVolume(config, "jingle")).toBeCloseTo(0.4, 12);
    expect(effectiveVolume(config, "sfx")).toBeCloseTo(0.4, 12);
  });

  it("BINDS — retuning the config changes the volume the host is handed", () => {
    // The G11 assertion in behavioural form: nothing downstream carries its own number, so moving
    // the config moves what actually reaches the engine.
    const host = recordingHost(["door"]);
    const director = createAudioDirector({
      host,
      config: { master: 1, music: 1, sfx: 0.25, muted: false },
      files: filesFor("door"),
    });
    director.playCue("door");
    director.setConfig({ master: 1, music: 1, sfx: 0.75, muted: false });
    director.playCue("door");
    expect(host.played.map((p) => p.volume)).toEqual([0.25, 0.75]);
  });

  it("a live music track is retuned in place, not restarted", () => {
    const host = recordingHost(["title"]);
    const director = createAudioDirector({ host, config: AUDIBLE, files: filesFor("title") });
    director.playMusic("title");
    director.setConfig({ ...AUDIBLE, music: 0.3 });
    expect(host.played).toHaveLength(1);
    expect(host.volumes).toEqual([{ key: "title", volume: 0.3 }]);
    expect(director.currentMusic()).toBe("title");
  });

  it("a non-finite or out-of-range volume becomes silence, never NaN into the engine", () => {
    // NaN reaching a Web Audio gain node is a broken context, not a quiet one.
    expect(effectiveVolume({ master: Number.NaN, music: 1, sfx: 1, muted: false }, "music")).toBe(0);
    // Infinity is NOT clamped up to full volume. It is not a volume at all, and reading "broken
    // config" as "loudest possible" is the worse of the two failures to hand a player.
    expect(effectiveVolume({ master: 1, music: Number.POSITIVE_INFINITY, sfx: 1, muted: false }, "music")).toBe(0);
    expect(effectiveVolume({ master: -3, music: 1, sfx: 1, muted: false }, "sfx")).toBe(0);
    // A finite value outside 0–1 IS clamped — that is a value with an intent this module can read.
    expect(effectiveVolume({ master: 2, music: 2, sfx: 2, muted: false }, "music")).toBe(1);
  });

  it("config() reads back what was set", () => {
    const director = createAudioDirector({ host: silentHost(), config: AUDIBLE });
    expect(director.config()).toEqual(AUDIBLE);
    director.setConfig(MUTED);
    expect(director.config()).toEqual(MUTED);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Music behaviour
 * ──────────────────────────────────────────────────────────────────────────── */

describe("music is a bed: one at a time, and not restarted on itself", () => {
  it("asking for the track already playing leaves it alone", () => {
    const host = recordingHost(["hearthollow"]);
    const director = createAudioDirector({ host, config: AUDIBLE, files: filesFor("hearthollow") });
    expect(director.playMusic("hearthollow").outcome).toBe("played");
    expect(director.playMusic("hearthollow").outcome).toBe("already-playing");
    expect(host.played).toHaveLength(1);
    expect(host.stopped).toEqual([]);
  });

  it("a different track stops the first", () => {
    const host = recordingHost(["hearthollow", "brackwater"]);
    const director = createAudioDirector({
      host,
      config: AUDIBLE,
      files: filesFor("hearthollow", "brackwater"),
    });
    director.playMusic("hearthollow");
    director.playMusic("brackwater");
    expect(host.stopped).toEqual(["hearthollow"]);
    expect(director.currentMusic()).toBe("brackwater");
  });

  it("a stinger never interrupts the music bed", () => {
    const host = recordingHost(["hearthollow", "catch-success"]);
    const director = createAudioDirector({
      host,
      config: AUDIBLE,
      files: filesFor("hearthollow", "catch-success"),
    });
    director.playMusic("hearthollow");
    director.playCue("catch-success");
    expect(director.currentMusic()).toBe("hearthollow");
    expect(host.stopped).toEqual([]);
  });

  it("loops are declared by the cue, not by the caller", () => {
    const host = recordingHost(["hearthollow", "retirement-legacy", "door"]);
    const director = createAudioDirector({
      host,
      config: AUDIBLE,
      files: filesFor("hearthollow", "retirement-legacy", "door"),
    });
    director.playMusic("hearthollow");
    director.playMusic("retirement-legacy");
    director.playCue("door");
    expect(host.played.map((p) => [p.key, p.loop])).toEqual([
      ["hearthollow", true],
      ["retirement-legacy", false],
      ["door", false],
    ]);
  });

  it("stopMusic() on nothing is safe and idempotent", () => {
    const director = createAudioDirector({ host: silentHost(), config: AUDIBLE });
    expect(() => {
      director.stopMusic();
      director.stopMusic();
    }).not.toThrow();
    expect(director.currentMusic()).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Files — basename matching
 * ──────────────────────────────────────────────────────────────────────────── */

describe("a dropped file lights its cue by basename", () => {
  it("matches every cue id, in every supported container", () => {
    for (const cue of ALL_CUES) {
      expect(cueIdForFile(`../assets/audio/music/${cue.id}.ogg`), cue.id).toBe(cue.id);
      expect(cueIdForFile(`${cue.id}.mp3`), cue.id).toBe(cue.id);
    }
  });

  it("a file matching no cue is reported rather than silently ignored", () => {
    const index = indexCueFiles({
      "../assets/audio/music/title.ogg": "/u/title.ogg",
      "../assets/audio/music/mystery-track.ogg": "/u/mystery.ogg",
      "../assets/audio/PROVENANCE.md": "/u/prov.md",
    });
    expect(index.urls.get("title")).toBe("/u/title.ogg");
    // Sorted by full path, so "PROVENANCE.md" precedes "music/..." on byte order.
    expect(index.unclaimed).toEqual([
      "../assets/audio/PROVENANCE.md",
      "../assets/audio/music/mystery-track.ogg",
    ]);
  });

  it("two files for one cue resolve DETERMINISTICALLY — sorted path, first wins", () => {
    // Not a scenario the gate permits, but the runtime must not pick differently between runs while
    // someone is mid-curation. Insertion order is deliberately varied here.
    const a = indexCueFiles({
      "../assets/audio/music/title.ogg": "/ogg",
      "../assets/audio/music/title.mp3": "/mp3",
    });
    const b = indexCueFiles({
      "../assets/audio/music/title.mp3": "/mp3",
      "../assets/audio/music/title.ogg": "/ogg",
    });
    expect(a.urls.get("title")).toBe(b.urls.get("title"));
    expect(a.urls.get("title")).toBe("/mp3");
  });

  it("an empty tree — today's state — indexes to nothing without complaint", () => {
    const index = indexCueFiles({});
    expect(index.urls.size).toBe(0);
    expect(index.unclaimed).toEqual([]);
    expect(createAudioDirector({ host: silentHost(), config: AUDIBLE }).availableCueIds()).toEqual([]);
  });

  it("availableCueIds() reports only cues with a file behind them", () => {
    const director = createAudioDirector({
      host: silentHost(),
      config: AUDIBLE,
      files: filesFor("title", "door"),
    });
    expect(director.availableCueIds()).toEqual(["door", "title"]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Determinism
 * ──────────────────────────────────────────────────────────────────────────── */

describe("cue selection is a pure function of game state (G11 — no clock, no RNG)", () => {
  it("the same situation gives the same cue, every time", () => {
    const situations = [
      { screen: "title" } as const,
      { screen: "overworld", nodeId: "hearthollow" } as const,
      { screen: "overworld", nodeId: "brackwater" } as const,
      { screen: "overworld", nodeId: "r1" } as const,
      { screen: "overworld", nodeId: "r2" } as const,
      { screen: "battle", battle: "wild" } as const,
      { screen: "battle", battle: "trainer" } as const,
      { screen: "battle", battle: "gym" } as const,
      { screen: "battle", battle: "finale" } as const,
      { screen: "battle", battle: "ancient" } as const,
      { screen: "retirement" } as const,
      { screen: "year-turn" } as const,
      { screen: "epilogue" } as const,
    ];
    for (const s of situations) {
      const first = musicCueFor(s);
      for (let i = 0; i < 50; i += 1) expect(musicCueFor(s)).toBe(first);
    }
  });

  it("every cue it can return is a real music cue", () => {
    const musicIds = new Set(cueIdsOfKind("music"));
    for (const screen of ["title", "overworld", "battle", "retirement", "year-turn", "epilogue"] as const) {
      for (const battle of ["wild", "trainer", "gym", "finale", "ancient", null] as const) {
        for (const nodeId of ["hearthollow", "brackwater", "r1", "r2", "bowerdeep", null] as const) {
          for (const finalSeasonOfYear of [true, false]) {
            const cue = musicCueFor({ screen, battle, nodeId, finalSeasonOfYear });
            if (cue !== null) expect(musicIds, `${screen}/${battle}/${nodeId}`).toContain(cue);
          }
        }
      }
    }
  });

  it("the walkable slice's three location themes, and nothing borrowed for the rest", () => {
    // §12a: "The walkable slice carries three location themes — Hearthollow, Brackwater, and one
    // route theme across R1–R2 — and the other eight cues are scene cues, not places." A node with
    // no theme returns null rather than inventing one (G2).
    expect(musicCueFor({ screen: "overworld", nodeId: "hearthollow" })).toBe("hearthollow");
    expect(musicCueFor({ screen: "overworld", nodeId: "brackwater" })).toBe("brackwater");
    expect(musicCueFor({ screen: "overworld", nodeId: "r1" })).toBe("route");
    expect(musicCueFor({ screen: "overworld", nodeId: "r2" })).toBe("route");
    for (const node of ["bowerdeep", "cindershelf", "duskhollow", "r3", "r4", "r5", "sanctum"]) {
      expect(musicCueFor({ screen: "overworld", nodeId: node }), node).toBeNull();
    }
    expect(musicCueFor({ screen: "overworld", nodeId: null })).toBeNull();
  });

  it("the festival cue is on the CALENDAR and outranks the place", () => {
    // §12a's Rules: "the Festival cue is on the calendar (the year's final season, every year), and
    // the two can be arbitrarily far apart."
    expect(musicCueFor({ screen: "overworld", nodeId: "hearthollow", finalSeasonOfYear: true })).toBe("festival");
    expect(musicCueFor({ screen: "overworld", nodeId: "hearthollow", finalSeasonOfYear: false })).toBe("hearthollow");
  });

  it("trainer and gym share one track, because §12a gives them one row", () => {
    expect(musicCueFor({ screen: "battle", battle: "trainer" })).toBe("trainer-battle");
    expect(musicCueFor({ screen: "battle", battle: "gym" })).toBe("trainer-battle");
  });

  it("a battle with no flavour named returns null rather than guessing", () => {
    expect(musicCueFor({ screen: "battle" })).toBeNull();
    expect(musicCueFor({ screen: "battle", battle: null })).toBeNull();
  });

  it("game/audio.ts draws no randomness and reads no clock", async () => {
    // The mechanical half of the determinism claim, over the shipped source. Comments are stripped
    // first — this file's own header EXPLAINS that `Math.random` is banned (G11), and a scan that
    // cannot tell an explanation from a call would fail on the sentence forbidding the thing.
    const { readFileSync } = await import("node:fs");
    const code = readFileSync(new URL("../../game/audio.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/Date\.now|performance\.now|new Date\(/);
    // …and the stripper actually stripped something, so the scan is not passing on an empty string.
    expect(code).toContain("export function musicCueFor");
    expect(code.length).toBeGreaterThan(1000);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The DSP treatment — balance.audio.seasonLowpassHz's first reader
 * ──────────────────────────────────────────────────────────────────────────── */

describe("seasonTreatment — the reader balance.audio.seasonLowpassHz never had", () => {
  it("reads the shipped cutoff for every season, from data", () => {
    for (const season of SEASONS) {
      const t = seasonTreatment(BALANCE, season, BALANCE.clock.startYear);
      expect(t.lowpassHz).toBe(BALANCE.audio.seasonLowpassHz[season]);
      expect(t.brightness).toBe(BALANCE.audio.seasonBrightness[season]);
    }
  });

  it("BINDS — retuning the cutoff in balance moves the reading", () => {
    // The G11 assertion: the number has one home, and this function is a reader of it, not a copy.
    const retuned = JSON.parse(JSON.stringify(BALANCE)) as Balance;
    const season = SEASONS[0] as Season;
    retuned.audio.seasonLowpassHz[season] = BALANCE.audio.seasonLowpassHz[season] / 2;
    expect(seasonTreatment(retuned, season, retuned.clock.startYear).lowpassHz).toBe(
      BALANCE.audio.seasonLowpassHz[season] / 2,
    );
  });

  it("§12a's shape holds in the shipped numbers: autumn lowpasses, winter lowpasses harder", () => {
    // "spring: neutral; summer: +brightness; autumn: lowpass + slight slow; winter: heavier lowpass".
    const hz = BALANCE.audio.seasonLowpassHz;
    expect(hz.autumn).toBeLessThan(hz.spring);
    expect(hz.winter).toBeLessThan(hz.autumn);
    expect(hz.summer).toBe(hz.spring);
    expect(BALANCE.audio.seasonBrightness.summer).toBeGreaterThan(BALANCE.audio.seasonBrightness.spring);
  });

  it("the year ramp darkens the cutoff, and it is season-tint's ramp — not a second one", () => {
    // "Year aging progressively darkens town-theme EQ so Hearthollow year 5 sounds like a memory of
    // year 1." One ramp for the picture and the sound.
    const season = "winter" as const;
    const y1 = seasonTreatment(BALANCE, season, BALANCE.clock.startYear);
    const y5 = seasonTreatment(BALANCE, season, BALANCE.clock.startYear + 4);
    expect(y1.yearDarkening).toBe(1);
    expect(y5.yearDarkening).toBeLessThan(y1.yearDarkening);
    expect(y5.effectiveLowpassHz).toBeLessThan(y1.effectiveLowpassHz);
    expect(y5.effectiveLowpassHz).toBeCloseTo(y5.lowpassHz * y5.yearDarkening, 9);
  });

  it("a cutoff that is not a frequency is refused loudly at the data boundary", () => {
    // Unlike a missing cue, this is a data error the player cannot route around, so it is not
    // swallowed. It is also never on a cue's playback path.
    const broken = JSON.parse(JSON.stringify(BALANCE)) as Balance;
    broken.audio.seasonLowpassHz.spring = Number.NaN;
    expect(() => seasonTreatment(broken, "spring", broken.clock.startYear)).toThrow(AudioTreatmentError);
    const negative = JSON.parse(JSON.stringify(BALANCE)) as Balance;
    negative.audio.seasonLowpassHz.spring = -1;
    expect(() => seasonTreatment(negative, "spring", negative.clock.startYear)).toThrow(AudioTreatmentError);
  });
});
