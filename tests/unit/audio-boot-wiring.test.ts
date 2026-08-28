/**
 * tests/unit/audio-boot-wiring.test.ts — THE CUES REACH THE ENGINE, OR NOTHING DOES.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `game/audio.ts` and `tests/unit/audio.test.ts` were built engine-free on purpose: Phaser cannot be
 * imported under vitest's node environment, so the engine arrives as an argument (`SoundHost`). That
 * is what makes the cue layer testable — and it is also what made the whole layer green while the
 * shipping game was SILENT. Nothing called it. No scene imported it, no loader queued a file, and
 * because `game/main.ts` never reached the module, Vite tree-shook it out of `dist` entirely: eleven
 * curated CC0 tracks sat in `assets/audio/music/` and not one byte was emitted.
 *
 * So the assertions below are deliberately about the SEAM, not about the cue layer:
 *
 *   §2  `BootScene.preload` queues every indexed cue with `load.audio` — and with `load.image` for
 *       NONE of them, which is the trap this lane was warned about (see §2's own comment).
 *   §3  `BootScene.create` installs one director, and its mix is `balance.audio.volume` read off
 *       data/balance.json rather than typed in (G11).
 *   §4  `TitleScene.create` actually starts §12a's Title cue, through the real Phaser adapter.
 *   §5  The continuity rule: re-entering the title does NOT restart the track.
 *   §6  A cue with no decoded file is a no-op — the boot completes and the screen still draws.
 *   §7  A host that throws AFTER `has()` has already passed is caught. This one is called out
 *       because a previous sabotage of this lane "passed" against a host that threw from `has()` —
 *       which never reaches `play()`'s catch, so it proved nothing about the catch it claimed to.
 *
 * ⚠ THE STUB TRAP, AND HOW THE RECORDER IS PROVEN
 * The repo's Phaser doubles wrap fake display objects in a `Proxy` whose `get` trap answers ANY
 * unknown method with a chainable no-op that RECORDS NOTHING. An assertion aimed at such a method
 * is vacuous and stays green through a total regression. Every method this file asserts on —
 * `load.audio`, `load.image`, `cache.audio.exists`, `sound.add`, and the sound handle's `play` /
 * `stop` — is therefore an OWN property of a plain object, never a proxy fallback, and §1 proves
 * that: it asserts `hasOwnProperty` for each of them, drives each one directly, and shows the log
 * grows from empty. If §1 is deleted, the rest of the file is no longer evidence of anything.
 *
 * G2/G11: no cue id, no volume and no file list is typed in. The cue ids come from
 * `musicCueFor(...)` and from `indexCueFiles(globbedCueFiles())`; the mix comes from
 * `validateContent().balance.audio.volume`.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

/* ════════════════════════════════════════════════════════════════════════════
 * The stub engine — a RECORDER for the loader and the sound manager.
 *
 * `game/scenes/BootScene.ts` and `game/scenes/TitleScene.ts` value-import Phaser and extend
 * `Phaser.Scene`; real Phaser throws under `environment: "node"`. The three namespaces the two
 * scenes reach through (`Loader.Events`, `Input.Events`, `Scenes.Events`) are provided with their
 * real string values, because a stub missing one turns a wiring bug into an unrelated TypeError.
 * ════════════════════════════════════════════════════════════════════════════ */

interface QueuedFile {
  key: string;
  url: string;
}

interface PlayedSound {
  key: string;
  loop: boolean;
  volume: number;
}

interface FakeParts {
  /** Every `load.audio(key, url)`, in order. THE ASSERTION TARGET OF §2. */
  audioQueued: QueuedFile[];
  /** Every `load.image(key, url)`, in order — §2 proves no `.ogg` ever goes down this path. */
  imageQueued: QueuedFile[];
  /** Every sound that actually started, with the loop flag and volume it started at. */
  soundsPlayed: PlayedSound[];
  /** Every `stop()` on a handle that had started. */
  soundsStopped: string[];
  /** Keys the audio cache reports decoded. A successful `load.audio` adds one — see `decodeFails`. */
  decoded: Set<string>;
  /**
   * Rig: the loader accepts the file and NOTHING decodes. This is "the .ogg is missing or corrupt"
   * as the engine actually reports it — `load.audio` succeeds, `cache.audio.exists` stays false.
   */
  decodeFails: boolean;
  /**
   * Rig: `sound.add` throws. Set AFTER a successful `load.audio`, so `has()` passes first and the
   * throw lands where `phaserSoundHost.play`'s catch has to catch it. See §7.
   */
  soundAddThrows: boolean;
  /** Every scene key started, so §3 can see the boot hand off. */
  started: string[];
  /** Every text drawn, so §6 can show the screen was still painted after a silent cue. */
  texts: string[];
}

vi.mock("phaser", () => {
  const make = (kind: string, parts: FakeParts): Record<string, unknown> => {
    const o: Record<string, unknown> = {
      kind,
      x: 0,
      y: 0,
      text: "",
      height: 8,
      width: 8,
      texture: "",
      destroy: (): void => undefined,
      setText: (value: string): unknown => {
        o.text = value;
        parts.texts.push(value);
        return o.self;
      },
    };
    // Unknown methods stay chainable no-ops — the same discipline the other scene suites use, so a
    // drawing call added by a shared module does not break this file. NOTHING THIS FILE ASSERTS ON
    // IS IN THAT SET; see the header and §1.
    const proxy = new Proxy(o, {
      get(target, prop, receiver): unknown {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === "symbol" || prop === "then") return undefined;
        return (): unknown => proxy;
      },
    });
    o.self = proxy;
    return proxy;
  };

  class Scene {
    readonly __fake: FakeParts;
    readonly load: Record<string, unknown>;
    readonly cache: { audio: { exists(key: string): boolean } };
    readonly sound: { add(key: string, opts: { loop: boolean; volume: number }): unknown };
    readonly textures: { exists(key: string): boolean; createCanvas(): null };
    readonly add: Record<string, unknown>;
    readonly cameras: { main: { setBackgroundColor(c: unknown): void } };
    readonly scale: { width: number; height: number };
    readonly input: { keyboard: unknown; on(event: string, run: unknown): void };
    readonly events: { once(event: string, run: () => void): void; on(): void };
    readonly scene: { start(key: string, data?: unknown): void };

    constructor(_key?: string) {
      const parts: FakeParts = {
        audioQueued: [],
        imageQueued: [],
        soundsPlayed: [],
        soundsStopped: [],
        decoded: new Set<string>(),
        decodeFails: false,
        soundAddThrows: false,
        started: [],
        texts: [],
      };
      this.__fake = parts;

      // ⚠ OWN PROPERTIES, NOT PROXY FALLBACKS. §1 asserts exactly this.
      this.load = {
        audio: (key: string, url: string): void => {
          parts.audioQueued.push({ key, url });
          // A queued file that decodes is what the running loader produces; `decodeFails` is the
          // rig for the file that does not.
          if (!parts.decodeFails) parts.decoded.add(key);
        },
        image: (key: string, url: string): void => {
          parts.imageQueued.push({ key, url });
        },
        on: (): void => undefined,
      };

      this.cache = {
        audio: {
          exists: (key: string): boolean => parts.decoded.has(key),
        },
      };

      this.sound = {
        add: (key: string, opts: { loop: boolean; volume: number }): unknown => {
          if (parts.soundAddThrows) throw new Error("no audio context");
          let started = false;
          return {
            play: (): boolean => {
              started = true;
              parts.soundsPlayed.push({ key, loop: opts.loop, volume: opts.volume });
              return true;
            },
            stop: (): void => {
              if (started) parts.soundsStopped.push(key);
            },
            destroy: (): void => undefined,
            setVolume: (): void => undefined,
          };
        },
      };

      this.textures = {
        exists: (): boolean => false,
        // Null forces game/placeholder.ts's graphics fallback — no canvas in node.
        createCanvas: (): null => null,
      };

      this.add = {
        text: (x: number, y: number, value: string): unknown => {
          const o = make("text", parts) as Record<string, unknown>;
          o.x = x;
          o.y = y;
          o.text = value;
          parts.texts.push(value);
          return o;
        },
        image: (x: number, y: number, key: string): unknown => {
          const o = make("image", parts) as Record<string, unknown>;
          o.x = x;
          o.y = y;
          o.texture = key;
          return o;
        },
        rectangle: (): unknown => make("rect", parts),
        graphics: (): unknown => {
          const o = make("graphics", parts) as Record<string, unknown>;
          o.generateTexture = (): void => undefined;
          return o;
        },
        container: (): unknown => make("container", parts),
      };

      this.cameras = { main: { setBackgroundColor: (): void => undefined } };
      this.scale = { width: 480, height: 320 };
      this.input = { keyboard: { on: (): void => undefined, off: (): void => undefined }, on: (): void => undefined };
      this.events = { once: (): void => undefined, on: (): void => undefined };
      this.scene = {
        start: (key: string): void => {
          parts.started.push(key);
        },
      };
    }
  }

  return {
    default: {
      Scene,
      // Real values, from phaser/src/loader/events, /input/events and /scene/events.
      Loader: { Events: { FILE_LOAD_ERROR: "loaderror" } },
      Input: { Events: { POINTER_WHEEL: "wheel" } },
      Scenes: { Events: { SHUTDOWN: "shutdown" } },
    },
    Scene,
  };
});

/* ── imports that must come AFTER vi.mock ─────────────────────────────────── */

import { validateContent } from "../../core/schemas";
import {
  audio,
  audioInstalled,
  createAudioDirector,
  effectiveVolume,
  globbedCueFiles,
  indexCueFiles,
  musicCueFor,
  phaserSoundHost,
  resetAudio,
} from "../../game/audio";
import { realAssetIds, realAssetUrl } from "../../game/placeholder";
import { BootScene } from "../../game/scenes/BootScene";
import { TitleScene } from "../../game/scenes/TitleScene";

const balance = validateContent().balance;

/** The cue ids that actually have a file in this tree — derived, never listed. */
const ON_DISK = indexCueFiles(globbedCueFiles()).urls;

function fakeOf(scene: object): FakeParts {
  return (scene as { __fake: FakeParts }).__fake;
}

/**
 * The Title cue, with its PRECONDITION stated: it has a file in this tree.
 *
 * Asserted rather than assumed, because "the title screen starts a track" and "assets/audio/music/
 * carries a title track" are two different claims and only one of them is about wiring. Removing
 * the file used to make §4/§5/§7 fail on the consequence ("nothing played") instead of on the cause;
 * now they name it. `tests/gates/audio-cue-contract.test.ts` is what holds the file itself.
 */
function titleCueWithFile(): string {
  const cueId = musicCueFor({ screen: "title" });
  expect(cueId).not.toBeNull();
  expect(ON_DISK.has(cueId as string), `no audio file in the tree for cue "${cueId as string}"`).toBe(true);
  return cueId as string;
}

/** Boot exactly as Phaser does: construct, `preload`, `create`. */
function boot(rig: (parts: FakeParts) => void = () => undefined): {
  scene: BootScene;
  parts: FakeParts;
} {
  const scene = new BootScene();
  const parts = fakeOf(scene);
  rig(parts);
  scene.preload();
  scene.create();
  return { scene, parts };
}

/**
 * Enter the title exactly as Phaser does. It returns its OWN recorder as well as the scene: the
 * title's drawing goes to its own stub, while its SOUND goes through the director boot installed —
 * whose host is the boot scene's manager. Two logs, one for each half, and mixing them up is how a
 * "nothing was drawn" assertion could pass against a screen that drew fine.
 */
function title(): { scene: TitleScene; parts: FakeParts } {
  const scene = new TitleScene();
  const parts = fakeOf(scene);
  scene.init({});
  scene.create();
  return { scene, parts };
}

beforeEach(() => {
  resetAudio();
});

/* ════════════════════════════════════════════════════════════════════════════
 * 1. THE MEASURING INSTRUMENT. Everything below is worthless if the stub
 *    absorbs the calls this file asserts on.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the recorder records — the stub cannot make these assertions vacuous", () => {
  it("every asserted method is an OWN property, not the Proxy's chainable no-op", () => {
    // THE POINT. A `Proxy` `get` trap that answers any unknown name with `() => proxy` makes an
    // assertion on that name pass forever. These five names are the whole surface this file reads,
    // so each one is proven to be really implemented before it is trusted.
    const scene = new BootScene() as unknown as {
      load: object;
      cache: { audio: object };
      sound: object;
    };
    expect(Object.prototype.hasOwnProperty.call(scene.load, "audio")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(scene.load, "image")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(scene.cache.audio, "exists")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(scene.sound, "add")).toBe(true);
  });

  it("the logs start EMPTY and grow only when the method is actually called", () => {
    const scene = new BootScene();
    const parts = fakeOf(scene);
    expect(parts.audioQueued).toEqual([]);
    expect(parts.imageQueued).toEqual([]);
    expect(parts.soundsPlayed).toEqual([]);

    const loader = (scene as unknown as { load: { audio(k: string, u: string): void } }).load;
    loader.audio("probe-cue", "probe-url");
    expect(parts.audioQueued).toEqual([{ key: "probe-cue", url: "probe-url" }]);
    // …and the queued file is what the cache then reports decoded, which is the second half of the
    // instrument: `phaserSoundHost.has` asks that cache and nothing else.
    expect((scene as unknown as { cache: { audio: { exists(k: string): boolean } } }).cache.audio.exists("probe-cue")).toBe(true);
  });

  it("the sound manager is driven end to end, so a recorded play means a play", () => {
    // The instrument is validated through the REAL adapter (`phaserSoundHost`) and the REAL
    // director, on a cue id taken from the catalogue — not through a hand-made fake — so §4's
    // assertion is about a path this test has already seen work.
    const scene = new BootScene();
    const parts = fakeOf(scene);
    const cueId = musicCueFor({ screen: "title" });
    expect(cueId).not.toBeNull();
    (scene as unknown as { load: { audio(k: string, u: string): void } }).load.audio(cueId as string, "probe");

    const config = { master: 1, music: 1, sfx: 1, muted: false };
    const director = createAudioDirector({
      host: phaserSoundHost(scene as unknown as Parameters<typeof phaserSoundHost>[0]),
      config,
      files: new Map([[cueId as string, "probe"]]),
    });
    expect(director.playMusic(cueId as string).outcome).toBe("played");
    expect(parts.soundsPlayed.map((s) => s.key)).toEqual([cueId]);

    director.stopMusic();
    expect(parts.soundsStopped).toEqual([cueId]);
  });

  it("an unrecorded method really is a silent no-op — the trap, demonstrated", () => {
    // Kept as a WARNING, not as coverage: this is what an assertion aimed at any method NOT listed
    // in §1's first test would be worth.
    const scene = new BootScene();
    const parts = fakeOf(scene);
    const drawn = (scene as unknown as { add: { rectangle(): { setFlipX(): unknown } } }).add.rectangle();
    expect(drawn.setFlipX()).toBe(drawn);
    expect(parts.texts).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. THE LOAD. The cues are queued as AUDIO, by boot, and never as images.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 BootScene.preload queues every cue with load.audio", () => {
  it("the tree really does hold cue files — this file is not asserting over an empty set", () => {
    expect(ON_DISK.size).toBeGreaterThan(0);
  });

  it("queues exactly the indexed cue ids, under their cue id, from the emitted URL", () => {
    const { parts } = boot();
    expect(parts.audioQueued.map((f) => f.key).sort()).toEqual([...ON_DISK.keys()].sort());
    for (const { key, url } of parts.audioQueued) {
      expect(url, `cue "${key}" was queued from a URL the index does not carry`).toBe(ON_DISK.get(key));
    }
  });

  it(
    "THE TRAP: not one audio file goes through the image loader — `registerRealAsset` says it takes " +
      "'an audio pack file' and `queueRealAssets` loads everything with `scene.load.image`",
    () => {
      // If a cue were registered through game/placeholder.ts, the .ogg would be handed to the
      // TEXTURE loader: it would never reach `scene.cache.audio`, so `phaserSoundHost.has` would be
      // false forever and every cue would read `no-file` while the loader logged a texture error.
      // Both halves are asserted — nothing audio-shaped in the image queue, and no audio URL known
      // to the placeholder registry at all.
      const { parts } = boot();
      const audioUrls = new Set(parts.audioQueued.map((f) => f.url));
      for (const queued of parts.imageQueued) {
        expect(audioUrls.has(queued.url), `${queued.key} was queued as an IMAGE from an audio URL`).toBe(false);
        expect(/\.(ogg|mp3|m4a|wav)$/i.test(queued.url), `${queued.key} is an image-queued audio file`).toBe(false);
      }
      for (const id of realAssetIds()) {
        const url = realAssetUrl(id) ?? "";
        expect(/\.(ogg|mp3|m4a|wav)$/i.test(url), `placeholder.ts registered audio "${id}"`).toBe(false);
      }
    },
  );

  it("queueing is idempotent — a boot over an already-decoded cache queues nothing twice", () => {
    const scene = new BootScene();
    const parts = fakeOf(scene);
    scene.preload();
    const first = parts.audioQueued.length;
    expect(first).toBeGreaterThan(0);
    scene.preload();
    expect(parts.audioQueued).toHaveLength(first);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. THE DIRECTOR. Installed once, mixed from data.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 BootScene.create installs the run's one director", () => {
  it("nothing is installed before boot, and one director is after", () => {
    expect(audioInstalled()).toBe(false);
    boot();
    expect(audioInstalled()).toBe(true);
  });

  it("the mix is balance.audio.volume, read off data — no volume is written in code (G11)", () => {
    boot();
    const config = audio().config();
    expect(config.master).toBe(balance.audio.volume.master);
    expect(config.music).toBe(balance.audio.volume.music);
    expect(config.sfx).toBe(balance.audio.volume.sfx);
    // `muted` is a player setting, not a tunable — balance.json says so in its own note — so it is
    // NOT read from balance, and a run with no expressed preference is unmuted.
    expect(config.muted).toBe(false);
  });

  it("every cue on disk is available to the director, and it still hands off to the title", () => {
    const { parts } = boot();
    expect(audio().availableCueIds()).toEqual([...ON_DISK.keys()].sort());
    expect(parts.started).toContain("Title");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. THE TITLE CUE, ON THE ENGINE.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 TitleScene plays §12a's Title cue", () => {
  it("the cue starts, looping, at the volume the mix implies", () => {
    const cueId = titleCueWithFile();

    const { parts } = boot();
    expect(parts.soundsPlayed).toEqual([]); // boot itself plays nothing
    title();

    expect(parts.soundsPlayed.map((s) => s.key)).toEqual([cueId]);
    const played = parts.soundsPlayed[0];
    expect(played?.loop).toBe(true);
    expect(played?.volume).toBe(effectiveVolume(audio().config(), "music"));
    expect(audio().currentMusic()).toBe(cueId);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. CONTINUITY. Same cue keeps playing; it is never restarted.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 the continuity rule — a re-entered scene does not restart its track", () => {
  it("three title entries produce ONE play and zero stops", () => {
    // The player backing out of the slot list and out of settings re-enters this scene twice. A
    // per-scene director would restart the theme each time; the shared one answers `already-playing`.
    const { parts } = boot();
    titleCueWithFile();
    title();
    title();
    title();
    expect(parts.soundsPlayed).toHaveLength(1);
    expect(parts.soundsStopped).toEqual([]);
  });

  it("a DIFFERENT cue stops the first and starts the second — a cut, not two tracks at once", () => {
    const { parts } = boot();
    const titleCue = titleCueWithFile();
    title();
    const other = musicCueFor({ screen: "battle", battle: "wild" });
    expect(other).not.toBe(titleCue);

    expect(audio().playMusic(other as string).outcome).toBe("played");
    expect(parts.soundsStopped).toEqual([titleCue]);
    expect(parts.soundsPlayed.map((s) => s.key)).toEqual([titleCue, other]);
    expect(audio().currentMusic()).toBe(other);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6. A MISSING CUE IS A NO-OP. The rule the whole layer is built around.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 a cue with no decoded file cannot take the game down", () => {
  it("boot completes, the title draws, and nothing plays", () => {
    // `decodeFails` is the engine's own shape of "the .ogg is missing or corrupt": the loader
    // accepts the file and the audio cache never gets it.
    const { parts } = boot((p) => {
      p.decodeFails = true;
    });
    expect(parts.audioQueued.length).toBeGreaterThan(0);
    expect(parts.started).toContain("Title");

    const shown = title();
    expect(shown.scene).toBeInstanceOf(TitleScene);
    expect(parts.soundsPlayed).toEqual([]);
    expect(audio().currentMusic()).toBeNull();
    // The screen was still painted — a silent cue must cost nothing but the sound.
    expect(shown.parts.texts.length).toBeGreaterThan(0);
    // And it is not a warning: an uncurated cue is a state, not a fault.
    expect(audio().warnings()).toEqual([]);
  });

  it("the outcome is named `no-file`, so the silence is diagnosable rather than mysterious", () => {
    boot((p) => {
      p.decodeFails = true;
    });
    const cueId = musicCueFor({ screen: "title" }) as string;
    expect(audio().playMusic(cueId).outcome).toBe("no-file");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 7. THE HOST THAT THROWS. Specifically: AFTER `has()` has passed.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§7 an engine that throws is a host that produced no sound", () => {
  it("`has()` passes first, THEN `play` throws — and the catch that matters is reached", () => {
    // ⚠ THIS ORDERING IS THE POINT. A rig that throws from `has()` short-circuits in `playable()`
    // and never reaches `phaserSoundHost.play`'s try/catch, so it proves nothing about the catch it
    // claims to test. Here the file decodes (so `has()` is genuinely true), and only then does the
    // sound manager fail.
    const { parts } = boot();
    const cueId = titleCueWithFile();
    expect(parts.decoded.has(cueId)).toBe(true);
    expect(phaserSoundHost(new BootScene() as never).has(cueId)).toBe(false); // a different scene's cache

    parts.soundAddThrows = true;
    let thrown: unknown = null;
    let outcome = "";
    try {
      outcome = audio().playMusic(cueId).outcome;
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeNull();
    expect(outcome).toBe("host-refused");
    expect(parts.soundsPlayed).toEqual([]);
    // Refused is a real fault, unlike an uncurated cue, so it IS recorded.
    expect(audio().warnings().join("\n")).toContain(cueId);
  });

  it("the scene still boots and still draws over a throwing sound manager", () => {
    const { parts } = boot((p) => {
      p.soundAddThrows = true;
    });
    expect(parts.started).toContain("Title");
    let shown: { parts: FakeParts } | null = null;
    expect(() => {
      shown = title();
    }).not.toThrow();
    expect((shown as unknown as { parts: FakeParts } | null)?.parts.texts.length ?? 0).toBeGreaterThan(0);
  });

  it("a host that throws from `has()` is survived too — the other half of the boundary", () => {
    boot();
    const cueId = musicCueFor({ screen: "title" }) as string;
    const throwing = createAudioDirector({
      host: {
        has(): boolean {
          throw new Error("no cache");
        },
        play(): null {
          throw new Error("unreachable");
        },
      },
      config: audio().config(),
      files: new Map([[cueId, "x"]]),
    });
    expect(throwing.playMusic(cueId).outcome).toBe("no-file");
  });
});
