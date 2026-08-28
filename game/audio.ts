/**
 * game/audio.ts — the cue layer: ONE name for every sound the game asks for, and one place that
 * decides what happens when the file behind that name does not exist yet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHY THIS MODULE EXISTS, AND WHY IT IS ENGINE-FREE
 * ─────────────────────────────────────────────────────────────────────────────
 * Before this file there was no audio layer at all: `assets/audio/` held a `.gitkeep`, no loader
 * queued a sound, no data file named one, and `balance.audio.seasonLowpassHz` had been declared in
 * data/balance.json, core/types.ts and core/schemas.ts with NO READER anywhere in the project
 * (the other two keys in the group had readers; the lowpass had none). {@link seasonTreatment}
 * below is that key's first reader.
 *
 * The layer is built the way game/season-tint.ts is built, and for the same measured reason: Phaser
 * cannot be imported under vitest's node environment (`ReferenceError: window is not defined` from
 * phaser/src/device/OS.js). So nothing here imports Phaser at runtime — the engine arrives as an
 * argument through {@link SoundHost}, which a scene satisfies with {@link phaserSoundHost} and a
 * test satisfies with {@link silentHost}. That is what makes the whole cue layer reachable from a
 * node test WITHOUT the suite ever attempting real audio playback.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE RULE THAT MATTERS MOST: A MISSING CUE IS A NO-OP, NEVER A THROW
 * ─────────────────────────────────────────────────────────────────────────────
 * Every cue below is authored content (bible §12a) and NONE of the files exist yet. If asking for
 * an absent cue could throw, then the first scene to call `playMusic("title")` takes the boot down,
 * and audio — the most cuttable layer in the game — becomes the thing that decides whether there is
 * a game. So: {@link AudioDirector} catches at every boundary, an unknown cue id is refused with a
 * recorded warning rather than an exception, and a host that throws from `play` is treated as a
 * host that produced no sound. `tests/unit/audio.test.ts` asserts this against a host rigged to
 * throw from every method.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  G11 — NO TUNABLE IS A LITERAL HERE
 * ─────────────────────────────────────────────────────────────────────────────
 * Volumes and mute arrive as {@link AudioConfig}, an argument. They are NOT defaulted in this file,
 * because a default here would be exactly the literal G11 forbids. They belong in data/balance.json
 * under a new `audio.volume` group — which is necessarily a three-file change (data/balance.json +
 * `Balance` in core/types.ts + `zBalance` in core/schemas.ts), because zod's `z.object` STRIPS
 * undeclared keys, so a group added to the JSON alone would reach no reader (core/acts.ts records
 * this as INV-3). Until that group exists, the caller states the config; after it exists, the caller
 * states `balance.audio.volume`. Nothing in this file changes either way.
 *
 * The numbers that ARE already data are read as data: {@link seasonTreatment} reads
 * `balance.audio.seasonLowpassHz` and `balance.audio.seasonBrightness`, and it reuses
 * game/season-tint.ts's {@link yearDarkening} rather than re-deriving the year ramp — one ramp, so
 * a retune moves the picture and the sound together, which is what bible §12a's "one track, six
 * readings" means.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  DETERMINISM
 * ─────────────────────────────────────────────────────────────────────────────
 * `Math.random` is banned repo-wide (G11) and there is none here. {@link musicCueFor} is a pure
 * function of the game state it is handed — same state, same cue, every run — so a seeded replay
 * that asks what should be playing gets one answer.
 */

import type Phaser from "phaser";

import type { Balance, Season } from "@core/types";

import { yearDarkening } from "./season-tint";

/* ────────────────────────────────────────────────────────────────────────────
 * The catalogue — bible §12a, transcribed
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a cue IS. `bibleLabel` is the row's Track (or the jingle/SFX name) copied out of
 * docs/content-bible.md §12a **verbatim**, and it is the field
 * `tests/gates/audio-cue-contract.test.ts` compares against the bible parsed off disk. Renaming a
 * cue in one place and not the other reddens that gate rather than going quietly silent.
 */
export interface CueDefinition {
  /** The stable handle scenes call. Never derived from the label — see the gate for why. */
  readonly id: string;
  readonly kind: CueKind;
  /** docs/content-bible.md §12a, verbatim. */
  readonly bibleLabel: string;
  /**
   * §12a's "Mood spec" column, verbatim. Music only; the bible gives jingles and SFX none.
   *
   * This is the curation brief — the sentence whoever fills the cue actually shops against — so it
   * is worth carrying next to the name. `tests/gates/audio-cue-contract.test.ts` holds it to the
   * bible word for word.
   *
   * ⚠ THE "CONTEXT" COLUMN IS DELIBERATELY NOT HERE, and it is not an oversight. Two reasons, and
   * the second one has teeth:
   *   1. It is redundant. Context says WHERE a cue plays, and {@link musicCueFor} below already
   *      encodes that structurally — as code that answers the question, not prose describing it.
   *   2. §12a's Context cell for "Ancient encounter" is "Vellsire/Kilnback/Undermere", which are
   *      SPECIES NAMES. `tests/property/foodweb.test.ts` ("no shipping source names a species — a
   *      shadow table has to name its rows") scans every string literal under core/, game/ and
   *      tools/ and refuses them, on build-doc §8.3/§10.3 and G2/G3: content belongs in data/, not
   *      in code. Copying that column in here failed that gate, which was correct to fail. The
   *      column stays in the bible, which is where it is authored.
   */
  readonly mood: string | null;
  /** Music loops under the scene it belongs to; a jingle or an SFX fires once. */
  readonly loop: boolean;
}

export type CueKind = "music" | "jingle" | "sfx";

/** The three kinds, in the order §12a introduces them. */
export const CUE_KINDS = ["music", "jingle", "sfx"] as const;

/**
 * §12a's **eleven** music tracks, in table order.
 *
 * "Eleven rows, not sixteen" is stated in the section's own Rules, and the section names the reason
 * a twelfth does not exist: "A twelfth row waits on a node becoming walkable." So this list is
 * closed. Adding a row here without adding it to the bible — or the reverse — is a gate failure
 * (G2: never invent authored content).
 *
 * The bible's own priority call, verbatim, is carried on `retirement-legacy`: "this cue carries the
 * game's emotional beat; pick it first". It is the first cue any curation pass should fill.
 */
export const MUSIC_CUES: readonly CueDefinition[] = [
  {
    id: "title",
    kind: "music",
    bibleLabel: "Title",
    mood: "wistful, pastoral, mid-tempo",
    loop: true,
  },
  {
    id: "hearthollow",
    kind: "music",
    bibleLabel: "Hearthollow",
    mood: "warm, homely, major key",
    loop: true,
  },
  {
    id: "brackwater",
    kind: "music",
    bibleLabel: "Brackwater",
    mood: "damp, swaying, woodblock/marimba feel",
    loop: true,
  },
  {
    id: "route",
    kind: "music",
    bibleLabel: "Route (meadow/marsh)",
    mood: "bright walking tempo",
    loop: true,
  },
  {
    id: "wild-battle",
    kind: "music",
    bibleLabel: "Wild battle",
    mood: "driving, loopable under 45s",
    loop: true,
  },
  {
    id: "trainer-battle",
    kind: "music",
    bibleLabel: "Trainer/gym battle",
    mood: "urgent, stronger percussion",
    loop: true,
  },
  {
    id: "finale",
    kind: "music",
    bibleLabel: "Greaves / finale",
    mood: "heavy, mechanical, relentless",
    loop: true,
  },
  {
    id: "ancient",
    kind: "music",
    bibleLabel: "Ancient encounter",
    mood: "vast, slow, awe before threat",
    loop: true,
  },
  {
    id: "retirement-legacy",
    kind: "music",
    bibleLabel: "Retirement / legacy",
    mood: "tender, short, resolves upward — this cue carries the game's emotional beat; pick it first",
    loop: false,
  },
  {
    id: "festival",
    kind: "music",
    bibleLabel: "Festival / year-turn",
    mood: "celebratory jingle into a quiet outro",
    loop: false,
  },
  {
    id: "ending-credits",
    kind: "music",
    bibleLabel: "Ending / credits",
    mood: "title theme reprise, thinned",
    loop: true,
  },
] as const;

/**
 * §12a, verbatim: "Jingles (short stingers): catch success, gym victory, level-up, item get, dex
 * entry." A clean comma list of five, so the gate splits the bible's sentence and compares.
 */
export const JINGLE_CUES: readonly CueDefinition[] = [
  { id: "catch-success", kind: "jingle", bibleLabel: "catch success", mood: null, loop: false },
  { id: "gym-victory", kind: "jingle", bibleLabel: "gym victory", mood: null, loop: false },
  { id: "level-up", kind: "jingle", bibleLabel: "level-up", mood: null, loop: false },
  { id: "item-get", kind: "jingle", bibleLabel: "item get", mood: null, loop: false },
  { id: "dex-entry", kind: "jingle", bibleLabel: "dex entry", mood: null, loop: false },
] as const;

/**
 * §12a's SFX set, verbatim: "menu move/confirm/cancel, battle hit, super-effective hit (brighter),
 * status apply, snare throw / shake ×3 / catch success, flee, footsteps (grass, wood, stone), door,
 * sign-card reveal, survey open."
 *
 * ⚠ TWO READINGS ARE TAKEN HERE AND THEY ARE THE ONLY INTERPRETATION IN THIS FILE. The music table
 * and the jingle list are mechanical; this sentence is not, so both readings are written down where
 * whoever disagrees will see them, and both are re-derived by the gate rather than trusted:
 *
 *   1. **"shake ×3" is ONE sound played three times, not three sounds.** A snare shakes three times
 *      before it settles, which is a caller repeating a cue, not three authored files. `×3` is
 *      therefore carried as {@link SNARE_SHAKE_REPEATS} — a count, exported so the caller does not
 *      re-type it — and the cue is a single `snare-shake`.
 *   2. **"catch success" in this sentence is the SAME cue as the jingle of that name**, not a second
 *      one. §12a names it in both lists; one sound answers to it. It appears once, as the jingle.
 *
 * Slash-separated names ("menu move/confirm/cancel", "footsteps (grass, wood, stone)") ARE separate
 * cues — those are lists of distinct sounds, where "shake ×3" is a repetition count. Recorded as
 * open for Hank in the report that shipped this module; if he rules otherwise, this list and the
 * gate's expansion move together.
 */
export const SFX_CUES: readonly CueDefinition[] = [
  { id: "menu-move", kind: "sfx", bibleLabel: "menu move", mood: null, loop: false },
  { id: "menu-confirm", kind: "sfx", bibleLabel: "menu confirm", mood: null, loop: false },
  { id: "menu-cancel", kind: "sfx", bibleLabel: "menu cancel", mood: null, loop: false },
  { id: "battle-hit", kind: "sfx", bibleLabel: "battle hit", mood: null, loop: false },
  {
    id: "super-effective-hit",
    kind: "sfx",
    bibleLabel: "super-effective hit (brighter)",
    mood: null,
    loop: false,
  },
  { id: "status-apply", kind: "sfx", bibleLabel: "status apply", mood: null, loop: false },
  { id: "snare-throw", kind: "sfx", bibleLabel: "snare throw", mood: null, loop: false },
  { id: "snare-shake", kind: "sfx", bibleLabel: "shake ×3", mood: null, loop: false },
  { id: "flee", kind: "sfx", bibleLabel: "flee", mood: null, loop: false },
  { id: "footstep-grass", kind: "sfx", bibleLabel: "footsteps (grass)", mood: null, loop: false },
  { id: "footstep-wood", kind: "sfx", bibleLabel: "footsteps (wood)", mood: null, loop: false },
  { id: "footstep-stone", kind: "sfx", bibleLabel: "footsteps (stone)", mood: null, loop: false },
  { id: "door", kind: "sfx", bibleLabel: "door", mood: null, loop: false },
  { id: "sign-card-reveal", kind: "sfx", bibleLabel: "sign-card reveal", mood: null, loop: false },
  { id: "survey-open", kind: "sfx", bibleLabel: "survey open", mood: null, loop: false },
] as const;

/**
 * §12a's "shake ×3", as a count rather than as three cue names. A caller plays `snare-shake` this
 * many times; see the SFX reading note above for why this is a repetition and not three files.
 */
export const SNARE_SHAKE_REPEATS = 3;

/** Every cue the game may ask for, in catalogue order: eleven music, five jingles, then the SFX. */
export const ALL_CUES: readonly CueDefinition[] = [...MUSIC_CUES, ...JINGLE_CUES, ...SFX_CUES];

const CUE_BY_ID: ReadonlyMap<string, CueDefinition> = new Map(ALL_CUES.map((c) => [c.id, c]));

/** Every cue id, sorted. */
export function cueIds(): string[] {
  return [...CUE_BY_ID.keys()].sort();
}

/** Every cue id of one kind, sorted. */
export function cueIdsOfKind(kind: CueKind): string[] {
  return ALL_CUES.filter((c) => c.kind === kind)
    .map((c) => c.id)
    .sort();
}

/** The definition behind a cue id, or null when nothing answers to that name. */
export function cueDefinition(id: string): CueDefinition | null {
  return CUE_BY_ID.get(id) ?? null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Files — cue id ↔ basename, so a dropped file lights its cue with no manifest edit
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The directory under `assets/audio/` each kind's files live in. Not a tunable — it is a path
 * convention, and the gate asserts every shipped file sits under the one its cue names.
 */
export const CUE_DIRECTORY: Readonly<Record<CueKind, string>> = {
  music: "music",
  jingle: "jingle",
  sfx: "sfx",
};

/**
 * The cue a file under `assets/audio/` belongs to, by BASENAME — `music/title.ogg` → `title`.
 *
 * Matching on the basename rather than on a hand-written manifest is deliberate: curating audio
 * then means dropping `assets/audio/music/retirement-legacy.ogg` into the tree and nothing else. A
 * file whose basename answers to no cue returns null, and the gate fails on it rather than letting
 * an unreferenced file ship — an audio file nobody plays is still an audio file whose licence has
 * to be defensible.
 */
export function cueIdForFile(path: string): string | null {
  const base = path.split("/").pop();
  if (base === undefined || base === "") return null;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return CUE_BY_ID.has(stem) ? stem : null;
}

/**
 * Resolve a `{path: url}` map — an `import.meta.glob` result, or a literal map in a test — into
 * `{cueId: url}`. Unrecognised paths are dropped and reported, never thrown on.
 */
export interface CueFileIndex {
  readonly urls: ReadonlyMap<string, string>;
  /** Paths under assets/audio/ that answer to no cue id. */
  readonly unclaimed: readonly string[];
}

export function indexCueFiles(files: Readonly<Record<string, string>>): CueFileIndex {
  const urls = new Map<string, string>();
  const unclaimed: string[] = [];
  for (const path of Object.keys(files).sort()) {
    const url = files[path];
    if (typeof url !== "string" || url === "") continue;
    const id = cueIdForFile(path);
    if (id === null) {
      unclaimed.push(path);
      continue;
    }
    // First path wins, deterministically, because the keys were sorted. Two files for one cue is a
    // curation mistake the gate reports; it is not a reason to pick unpredictably at runtime.
    if (!urls.has(id)) urls.set(id, url);
  }
  return { urls, unclaimed };
}

/**
 * Every audio file the build can see, as `{path: url}`.
 *
 * `assets/audio/` currently holds a `.gitkeep` and nothing else, so this is empty and every cue is
 * a no-op — which is the point: the layer works, silently, until files arrive. Vite resolves the
 * glob at build time; under vitest it resolves the same way, which is why the tests can hand
 * {@link indexCueFiles} a literal map and exercise the identical code path.
 */
export function globbedCueFiles(): Record<string, string> {
  return import.meta.glob("../assets/audio/**/*.{ogg,mp3,m4a,wav}", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Loading — the queue side of the same engine-as-an-argument boundary
 *
 * ⚠ AUDIO MUST NOT GO THROUGH `game/placeholder.ts`. `registerRealAsset` there advertises itself as
 * the place to register "an audio pack file", and it is not: EVERY id it registers is loaded by
 * `queueRealAssets` with `scene.load.image(id, url)`. An `.ogg` queued through that path is handed
 * to the texture loader, fails to decode as an image, and lands in `scene.textures` — never in
 * `scene.cache.audio`, which is the cache {@link phaserSoundHost} asks. The cue would then be
 * permanently `no-file` while the loader logged a texture error, which is the quietest possible way
 * for audio to be broken. So cues are queued HERE, with `load.audio`, under their cue id.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What the cue layer needs from a LOADER, and nothing more — the mirror of {@link SoundHost}, and
 * engine-free for the same reason (see the header: Phaser cannot be imported under vitest's node
 * environment, so the engine arrives as an argument).
 */
export interface CueLoader {
  /** Is this key already queued or already decoded? Asked so a re-entered scene does not re-queue. */
  has(key: string): boolean;
  /** Queue the file at `url` to be decoded under `key`. */
  audio(key: string, url: string): void;
}

/**
 * The Phaser adapter for the loader half. `import type` only, like {@link phaserSoundHost}.
 *
 * `scene.cache.audio.exists(key)` is the same honest question the host asks, and asking it here is
 * what makes queueing idempotent across a scene restart.
 */
export function phaserCueLoader(scene: Phaser.Scene): CueLoader {
  return {
    has(key: string): boolean {
      try {
        return scene.cache.audio.exists(key);
      } catch {
        return false;
      }
    },
    audio(key: string, url: string): void {
      try {
        scene.load.audio(key, url);
      } catch {
        /* a cue that cannot be queued is a cue with no file — the director already handles that */
      }
    },
  };
}

/**
 * Queue every indexed cue under its own cue id, and return the ids actually queued.
 *
 * Nothing here throws, for the reason the header gives: a loader that refuses one file must not be
 * the difference between a game and a black screen. A key already in the cache is skipped rather
 * than queued twice.
 */
export function queueCues(loader: CueLoader, files: ReadonlyMap<string, string>): string[] {
  const queued: string[] = [];
  for (const cueId of [...files.keys()].sort()) {
    const url = files.get(cueId);
    if (url === undefined || url === "") continue;
    if (!CUE_BY_ID.has(cueId)) continue;
    let already = false;
    try {
      already = loader.has(cueId);
    } catch {
      /* a cache that cannot answer is a cache with nothing in it; queue anyway */
    }
    if (already) continue;
    try {
      loader.audio(cueId, url);
    } catch {
      // A loader that refuses one file must not stop the rest, and must never reach the caller:
      // this runs inside `preload`, where a throw is a boot that never happens.
      continue;
    }
    queued.push(cueId);
  }
  return queued;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Config — arguments, never literals (G11)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Volumes and mute. Every field is 0–1 except `muted`.
 *
 * There is deliberately NO default in this module. See the header: these belong in
 * data/balance.json under `audio.volume`, which is an INV-3 three-file change, and a default here
 * would be the literal G11 forbids. A caller that has no balance group yet states the numbers at
 * the call site, where they are visible, rather than inheriting an invisible one from here.
 */
export interface AudioConfig {
  /** Scales every cue of every kind. */
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly muted: boolean;
}

/**
 * Clamp to the bounds of the concept. 0 and 1 are the ends of "a volume", not tunings — a value
 * outside them is not a quieter or louder sound, it is not a volume at all. A non-finite value is
 * taken as silence rather than propagated into the engine, because `NaN` reaching a Web Audio gain
 * node is a broken audio context and not a quiet one.
 */
function asVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * The volume a cue of this kind actually plays at: master × its kind's level, or exactly zero when
 * muted. Jingles and SFX share the `sfx` level — both are stingers, and §12a budgets them as one
 * set; music is the only thing that ducks independently.
 */
export function effectiveVolume(config: AudioConfig, kind: CueKind): number {
  if (config.muted) return 0;
  const kindLevel = kind === "music" ? config.music : config.sfx;
  return asVolume(asVolume(config.master) * asVolume(kindLevel));
}

/* ────────────────────────────────────────────────────────────────────────────
 * The host — the engine, as an argument
 * ──────────────────────────────────────────────────────────────────────────── */

/** A sound that is playing. Everything on it must tolerate being called after it has stopped. */
export interface SoundHandle {
  stop(): void;
  setVolume(volume: number): void;
}

/**
 * What the cue layer needs from an audio engine, and nothing more. A scene satisfies this with
 * {@link phaserSoundHost}; a test satisfies it with {@link silentHost} or with a rig.
 */
export interface SoundHost {
  /** Has a decoded sound been loaded under this key? */
  has(key: string): boolean;
  /** Start it. Returning null means "nothing is playing" and is not an error. */
  play(key: string, options: { loop: boolean; volume: number }): SoundHandle | null;
}

/**
 * A host that has nothing and plays nothing.
 *
 * **This is what the test suite uses**, and it is why running the suite never touches an audio
 * device, a decoder, or a Web Audio context: there is no engine behind it to touch. The game uses
 * it too, for a run with sound off at the source rather than at volume zero.
 */
export function silentHost(): SoundHost {
  return {
    has: () => false,
    play: () => null,
  };
}

/**
 * The Phaser adapter. `import type` only — see the header for why this file must not import the
 * engine at runtime.
 *
 * `scene.cache.audio.exists(key)` is the honest question: Phaser's loader can have FAILED on a file
 * and the sound manager will still hand back an object for it, so asking the manager is not the
 * same as asking whether there is anything decoded to play.
 */
export function phaserSoundHost(scene: Phaser.Scene): SoundHost {
  return {
    has(key: string): boolean {
      try {
        return scene.cache.audio.exists(key);
      } catch {
        return false;
      }
    },
    play(key, options): SoundHandle | null {
      try {
        const sound = scene.sound.add(key, { loop: options.loop, volume: options.volume });
        if (!sound.play()) return null;
        return {
          stop: () => {
            try {
              sound.stop();
              sound.destroy();
            } catch {
              /* a sound that is already gone is already stopped */
            }
          },
          setVolume: (volume: number) => {
            try {
              // `setVolume` is on WebAudioSound/HTML5AudioSound but not on the BaseSound type.
              (sound as unknown as { setVolume?: (v: number) => void }).setVolume?.(volume);
            } catch {
              /* volume on a dead sound is not worth a crash */
            }
          },
        };
      } catch {
        return null;
      }
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The director — what scenes call
 * ──────────────────────────────────────────────────────────────────────────── */

/** Why a cue produced no sound. `played` is the only outcome that made noise. */
export type CueOutcome =
  | "played"
  /** The id answers to no cue in the catalogue — a typo at a call site. */
  | "unknown-cue"
  /** The cue is real; its file has not been curated yet. This is the expected outcome today. */
  | "no-file"
  /** Muted, or a volume that multiplied out to zero. */
  | "silent"
  /** The engine refused or threw. Recorded, never propagated. */
  | "host-refused"
  /** Music only: this track is already the one playing, so it was left alone rather than restarted. */
  | "already-playing";

export interface CueResult {
  readonly cueId: string;
  readonly outcome: CueOutcome;
  readonly volume: number;
}

export interface AudioDirectorOptions {
  readonly host: SoundHost;
  readonly config: AudioConfig;
  /** `{cueId: url}`. Defaults to empty — a director with no files is a working, silent director. */
  readonly files?: ReadonlyMap<string, string>;
  /** Called with every warning instead of `console`, so a test can assert on them. */
  readonly onWarning?: (message: string) => void;
}

/**
 * The API the scenes call.
 *
 * NOTHING on this interface throws. That is asserted in `tests/unit/audio.test.ts` against a host
 * rigged to throw from `has`, from `play`, and from every method of the handle it returns. See the
 * header for why that rule is the load-bearing one.
 */
export interface AudioDirector {
  /** Start a music cue, or leave it alone if it is already the one playing. */
  playMusic(cueId: string): CueResult;
  /** Fire a jingle or an SFX. Never interrupts music. */
  playCue(cueId: string): CueResult;
  stopMusic(): void;
  /** The music cue currently playing, or null. */
  currentMusic(): string | null;
  /** Replace volumes/mute. Applies to the music already playing without restarting it. */
  setConfig(config: AudioConfig): void;
  config(): AudioConfig;
  /** Cue ids that have a file behind them, sorted. Empty until audio is curated. */
  availableCueIds(): string[];
  /** Everything that went wrong, in order. Never thrown, always readable. */
  warnings(): string[];
}

export function createAudioDirector(options: AudioDirectorOptions): AudioDirector {
  const { host } = options;
  const files = options.files ?? new Map<string, string>();
  const warningLog: string[] = [];
  let config = options.config;
  let music: { cueId: string; handle: SoundHandle } | null = null;

  const warn = (message: string): void => {
    warningLog.push(message);
    try {
      options.onWarning?.(message);
    } catch {
      /* a warning sink that throws must not become the failure it was reporting */
    }
  };

  /**
   * Does the engine actually have something decoded for this cue?
   *
   * Both halves are required. `files` says a file was found at build time; `host.has` says the
   * loader got it decoded. A file that 404s or fails to decode satisfies the first and not the
   * second, and playing it would be the throw this module exists to prevent.
   */
  const playable = (cueId: string): boolean => {
    if (!files.has(cueId)) return false;
    try {
      return host.has(cueId);
    } catch {
      return false;
    }
  };

  const start = (cue: CueDefinition, volume: number): SoundHandle | null => {
    try {
      return host.play(cue.id, { loop: cue.loop, volume });
    } catch {
      return null;
    }
  };

  const stopMusic = (): void => {
    if (music === null) return;
    const handle = music.handle;
    music = null;
    try {
      handle.stop();
    } catch {
      /* the track is being abandoned either way */
    }
  };

  const fire = (cueId: string, expected: CueKind | "stinger"): CueResult => {
    const cue = cueDefinition(cueId);
    if (cue === null) {
      warn(`unknown cue "${cueId}" — no such entry in the §12a catalogue`);
      return { cueId, outcome: "unknown-cue", volume: 0 };
    }
    const wantsMusic = expected === "music";
    if (wantsMusic !== (cue.kind === "music")) {
      warn(
        `cue "${cueId}" is a ${cue.kind} cue and was asked for as ${wantsMusic ? "music" : "a stinger"}`,
      );
      return { cueId, outcome: "unknown-cue", volume: 0 };
    }

    if (wantsMusic && music !== null && music.cueId === cueId) {
      return { cueId, outcome: "already-playing", volume: effectiveVolume(config, cue.kind) };
    }

    const volume = effectiveVolume(config, cue.kind);
    if (volume <= 0) {
      // Muted still STOPS whatever is playing — leaving a loop running at gain zero keeps a decoder
      // and a timer alive for a sound nobody can hear.
      if (wantsMusic) stopMusic();
      return { cueId, outcome: "silent", volume: 0 };
    }
    if (!playable(cueId)) {
      // The expected outcome for every cue today. Not a warning: an uncurated cue is the state the
      // project is in, and warning on it would drown the log the moment a scene walks anywhere.
      return { cueId, outcome: "no-file", volume };
    }

    if (wantsMusic) stopMusic();
    const handle = start(cue, volume);
    if (handle === null) {
      warn(`cue "${cueId}" has a file but the engine produced no sound`);
      return { cueId, outcome: "host-refused", volume };
    }
    if (wantsMusic) music = { cueId, handle };
    return { cueId, outcome: "played", volume };
  };

  return {
    playMusic: (cueId) => fire(cueId, "music"),
    playCue: (cueId) => fire(cueId, "stinger"),
    stopMusic,
    currentMusic: () => music?.cueId ?? null,
    setConfig(next) {
      config = next;
      if (music === null) return;
      const volume = effectiveVolume(config, "music");
      if (volume <= 0) {
        stopMusic();
        return;
      }
      try {
        music.handle.setVolume(volume);
      } catch {
        /* a retune that cannot be applied is not a reason to lose the track */
      }
    },
    config: () => config,
    availableCueIds: () => [...files.keys()].filter((id) => CUE_BY_ID.has(id)).sort(),
    warnings: () => [...warningLog],
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The mix, from data (G11)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The three mix levels, read off `balance.audio.volume` — the group the header said this module
 * would NOT default, and which now exists (data/balance.json + `Balance` in core/types.ts +
 * `zBalance` in core/schemas.ts, the INV-3 three-file change). No volume is written in this file.
 *
 * `muted` is NOT in that group and deliberately so: balance.json's own note calls a preference in
 * the tuning table a category error. It is a player setting, so it arrives as an argument. The
 * settings holder (`game/registry.ts` `Settings`) carries only `textSpeed` today, so the boot call
 * site passes "not muted" — the state of a preference nobody has expressed — and moves to the
 * stored setting the day one exists.
 */
export function audioConfigFromBalance(balance: Balance, muted: boolean): AudioConfig {
  const volume = balance.audio.volume;
  return { master: volume.master, music: volume.music, sfx: volume.sfx, muted };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The one director the scenes share
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHY A MODULE-LEVEL HOLDER, AND WHY THE CONTINUITY RULE NEEDS ONE
 * ─────────────────────────────────────────────────────────────────────────────
 * Music continuity is a fact about the RUN, not about a scene: "the town theme keeps playing while
 * the player opens a menu, and stops when a battle starts" is only expressible if the thing that
 * knows what is playing outlives every scene that asks. A director built per-scene would restart
 * the same track on every `create()` — the exact defect {@link AudioDirector}'s `already-playing`
 * outcome exists to prevent — because a fresh director believes nothing is playing.
 *
 * It is here and not in `game/registry.ts` because the registry is the holder for CONTENT and SAVE
 * state, and because everything the director needs is already in this file. It is a holder, not a
 * cache: nothing is memoised, and {@link resetAudio} exists so a test starts from silence.
 *
 * THE FALLBACK IS NOT AN ERROR PATH. Before boot installs one — and in every test that never
 * installs one — {@link audio} answers with a director over {@link silentHost}, so a scene may call
 * `audio().playMusic(...)` unconditionally and get a no-op instead of a crash. That is the same
 * rule the header states for a missing file, applied one level up.
 * ──────────────────────────────────────────────────────────────────────────── */

let installedDirector: AudioDirector | null = null;
let fallbackDirector: AudioDirector | null = null;

/**
 * The silent stand-in. Its config is all zeros and muted — not a tuning (nothing here is a level
 * anyone would retune), but the statement "there is no engine behind this", which is why it does
 * not read balance.
 */
function silentDirector(): AudioDirector {
  fallbackDirector ??= createAudioDirector({
    host: silentHost(),
    config: { master: 0, music: 0, sfx: 0, muted: true },
  });
  return fallbackDirector;
}

/** Install the run's director. Returns it, so a caller can keep the reference it just made. */
export function installAudio(director: AudioDirector): AudioDirector {
  installedDirector = director;
  return director;
}

/** The run's director, or the permanently-silent stand-in. Never null, never throws. */
export function audio(): AudioDirector {
  return installedDirector ?? silentDirector();
}

/** True once boot has installed a real director. */
export function audioInstalled(): boolean {
  return installedDirector !== null;
}

/** Forget the installed director and stop whatever it was playing. For tests and for a teardown. */
export function resetAudio(): void {
  const previous = installedDirector;
  installedDirector = null;
  fallbackDirector = null;
  if (previous === null) return;
  try {
    previous.stopMusic();
  } catch {
    /* a director being discarded is not worth a throw */
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Selection — a pure function of game state, never of a clock or an RNG
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Everything {@link musicCueFor} is allowed to consult. Deliberately a small explicit record rather
 * than the save: a selector that takes the whole save can quietly start depending on anything, and
 * this one has to stay checkable by inspection.
 */
export interface MusicSituation {
  /** The scene the player is in. */
  readonly screen: "title" | "overworld" | "battle" | "retirement" | "year-turn" | "epilogue";
  /** The walkable node id, when on the overworld. `data/nodes/*.json` ids. */
  readonly nodeId?: string | null;
  /** Battle flavour, when in a battle. */
  readonly battle?: "wild" | "trainer" | "gym" | "finale" | "ancient" | null;
  /** True in the year's final season — §12a puts the festival cue on the CALENDAR, not on an act. */
  readonly finalSeasonOfYear?: boolean;
}

/**
 * Which music cue belongs to a situation, or null when the situation names none.
 *
 * Pure: same input, same answer, forever. No clock is read, no RNG is drawn (G11 bans `Math.random`
 * repo-wide), and nothing here is memoised — so a seeded replay asking "what should be playing at
 * this step" gets the one answer the run had.
 *
 * The node→theme mapping is the walkable slice §12a describes and no more: "The walkable slice
 * carries three location themes — Hearthollow, Brackwater, and one route theme across R1–R2 — and
 * the other eight cues are scene cues, not places." A node outside that slice returns null rather
 * than borrowing a theme it was not given (G2).
 */
export function musicCueFor(situation: MusicSituation): string | null {
  switch (situation.screen) {
    case "title":
      return "title";
    case "epilogue":
      return "ending-credits";
    case "retirement":
      return "retirement-legacy";
    case "year-turn":
      return "festival";
    case "battle": {
      switch (situation.battle) {
        case "wild":
          return "wild-battle";
        case "trainer":
        case "gym":
          // §12a's row is one track for both: "Trainer/gym battle | trainers".
          return "trainer-battle";
        case "finale":
          return "finale";
        case "ancient":
          return "ancient";
        default:
          return null;
      }
    }
    case "overworld": {
      // The calendar beats the place: §12a's Rules say "the Festival cue is on the calendar (the
      // year's final season, every year), and the two can be arbitrarily far apart."
      if (situation.finalSeasonOfYear === true) return "festival";
      switch (situation.nodeId) {
        case "hearthollow":
          return "hearthollow";
        case "brackwater":
          return "brackwater";
        case "r1":
        case "r2":
          return "route";
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

/**
 * Ask for whatever cue this situation names. THE ONE CALL A SCENE MAKES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE CONTINUITY RULE, WRITTEN WHERE IT IS ENFORCED
 * ─────────────────────────────────────────────────────────────────────────────
 * A scene calls this on ENTRY (`create`), never per frame, and the two halves of the rule are:
 *
 *   • **Same cue → it keeps playing.** {@link AudioDirector.playMusic} answers `already-playing`
 *     and touches nothing, so walking Hearthollow → its shop → back does not restart the theme, and
 *     re-entering a scene is free. This is why the director is shared (see the holder above): a
 *     per-scene director would restart the track every time.
 *   • **Different cue → the old one stops and the new one starts.** A hard change, not a fade:
 *     §12a specifies mood per cue and no crossfade, and a fade would need a per-frame ramp this
 *     layer deliberately does not have (nothing here reads a clock — see the header's determinism
 *     note). Gold-era hardware cut, and so does this.
 *
 * **A situation that names NO cue leaves the music alone**, and returns null rather than silence.
 * That is the honest answer for a node outside §12a's walkable slice: the bible gives it no theme,
 * and stopping the music would be inventing "silence" as its theme (G2). A caller that means
 * silence says `stopMusic()`, which is a different sentence.
 */
export function applyMusicSituation(
  director: AudioDirector,
  situation: MusicSituation,
): CueResult | null {
  const cueId = musicCueFor(situation);
  if (cueId === null) return null;
  return director.playMusic(cueId);
}

/**
 * A cue that INTERRUPTS what is playing, plus the way to put the old one back.
 *
 * Every scene the game LAUNCHES OVER a paused overworld needs this and needs it identically — the
 * battle, the retirement card, the year-turn card. The reason is structural rather than stylistic:
 * those scenes are stopped and the overworld is RESUMED, and a resumed scene's `create` does not run
 * again, so nothing on the overworld side would ever re-ask for its theme. Without a restore, the
 * first battle's music plays over the town for the rest of the run.
 *
 * It lives here rather than in each scene so the three of them cannot drift into three answers, and
 * so a scene's whole audio wiring is two lines: take over on `create`, restore on `"shutdown"`.
 */
export interface MusicTakeover {
  /** What was playing when the takeover happened, or null. */
  readonly previous: string | null;
  /** The cue that took over, or null when the situation named none. */
  readonly cueId: string | null;
  /**
   * Put `previous` back — or stop, when there was nothing to put back. Idempotent: a scene that is
   * shut down twice, or restored by hand and then by its own hook, restores once.
   */
  restore(): void;
}

export function takeOverMusic(director: AudioDirector, situation: MusicSituation): MusicTakeover {
  const previous = director.currentMusic();
  const result = applyMusicSituation(director, situation);
  let restored = false;
  return {
    previous,
    cueId: result?.cueId ?? null,
    restore(): void {
      if (restored) return;
      restored = true;
      // Both arms are already safe when nothing took over: `playMusic` on the track still playing
      // answers `already-playing`, and `stopMusic` with no music is a no-op.
      if (previous === null) director.stopMusic();
      else director.playMusic(previous);
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Procedural treatment — the first reader balance.audio.seasonLowpassHz has ever had
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * §12a's procedural treatment, verbatim: "seasons apply DSP presets to whatever's playing (spring:
 * neutral; summer: +brightness; autumn: lowpass + slight slow; winter: heavier lowpass, sparse EQ).
 * Year aging progressively darkens town-theme EQ so Hearthollow year 5 sounds like a memory of year
 * 1. One track, six readings."
 */
export interface AudioTreatment {
  readonly season: Season;
  readonly year: number;
  /** balance.audio.seasonLowpassHz[season] — the filter cutoff, in Hz. */
  readonly lowpassHz: number;
  /**
   * balance.audio.seasonBrightness[season] — §12a's "summer: +brightness".
   *
   * This is the SOUND's brightness only. It drove the painted map as well until 2026-08-28, when
   * the picture's was split into `balance.season.brightness`; the two are now retuned
   * independently. Unlike the picture's, this one may exceed 1.0 — a filter can be brighter than
   * neutral, a `setTint` multiply cannot.
   */
  readonly brightness: number;
  /** game/season-tint.ts `yearDarkening` — ONE ramp for the picture and the sound. */
  readonly yearDarkening: number;
  /**
   * The cutoff after the year ramp: `lowpassHz × yearDarkening`. This is the "progressively darkens
   * town-theme EQ" half — a later year is heard through a lower cutoff, which is what makes year 5
   * "a memory of year 1".
   */
  readonly effectiveLowpassHz: number;
}

export class AudioTreatmentError extends Error {
  override readonly name = "AudioTreatmentError";
}

/**
 * The DSP reading for a season and a year, from data alone.
 *
 * This function is why `balance.audio.seasonLowpassHz` stopped being a key with no reader. It was
 * declared across data/balance.json, core/types.ts and core/schemas.ts and consulted by nothing —
 * the group's other keys had readers; the lowpass had no one.
 *
 * A non-finite or negative cutoff is refused LOUDLY rather than clamped, because unlike a missing
 * cue this is a data error the player cannot route around: it means balance.json says something
 * that is not a frequency, and every reading built on it would be wrong in a way nothing surfaces.
 * The refusal is at the data boundary; it is never on a cue's playback path.
 */
export function seasonTreatment(balance: Balance, season: Season, year: number): AudioTreatment {
  const lowpassHz = balance.audio.seasonLowpassHz[season];
  const brightness = balance.audio.seasonBrightness[season];
  if (!Number.isFinite(lowpassHz) || lowpassHz < 0) {
    throw new AudioTreatmentError(
      `balance.audio.seasonLowpassHz.${season} is ${String(lowpassHz)}, not a cutoff frequency`,
    );
  }
  if (!Number.isFinite(brightness)) {
    throw new AudioTreatmentError(
      `balance.audio.seasonBrightness.${season} is ${String(brightness)}, not a finite number`,
    );
  }
  const darkening = yearDarkening(balance, year);
  return {
    season,
    year,
    lowpassHz,
    brightness,
    yearDarkening: darkening,
    effectiveLowpassHz: lowpassHz * darkening,
  };
}
