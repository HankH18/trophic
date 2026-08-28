/**
 * game/scenes/BootScene.ts — the zod gate, made visible.
 *
 * build-doc §7: "JSON files are validated against these at boot with zod (fail loud on drift)."
 * The loud half is the whole point of the gate. Content drift that boots into a half-populated
 * region and only shows up as a wrong number four screens later is the failure mode the gate was
 * built to prevent, so a failed `validateContent()` stops here and prints every issue on screen,
 * scrollable, with the file each one came from.
 *
 * Everything else this scene does is short on purpose: load whatever real art exists, load the
 * audio cues, install storage and settings, and hand off to the title.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  AUDIO IS LOADED HERE, AND NOT THROUGH `game/placeholder.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * `registerRealAsset` (game/placeholder.ts) says in its own docstring that it takes "an audio pack
 * file". IT DOES NOT WORK FOR AUDIO: everything registered there is queued by `queueRealAssets`
 * with `scene.load.image(id, url)`, so an `.ogg` would go to the TEXTURE loader, fail to decode,
 * and never appear in `scene.cache.audio` — the cache `phaserSoundHost` asks. The cue would read
 * `no-file` forever while the loader logged a texture error. So cues are queued below with
 * `load.audio`, through `game/audio.ts`'s own `CueLoader`, and the two loaders stay separate.
 */

import Phaser from "phaser";

import {
  audioConfigFromBalance,
  createAudioDirector,
  globbedCueFiles,
  indexCueFiles,
  installAudio,
  phaserCueLoader,
  phaserSoundHost,
  queueCues,
} from "../audio";
import { SCENE_KEYS, contentProblems, installStorage, loadContent } from "../boot";
import { queueRealAssets } from "../placeholder";
import { registry } from "../registry";

const MARGIN_PX = 8;
const SCROLL_STEP_PX = 24;
const HINT_STRIP_PX = 16;

/**
 * The failure screen's own colours, deliberately NOT from `data/palette.json` and NOT from
 * `MenuScene`'s `UI`.
 *
 * This is the screen that reports `data/` being broken, so it must not read `data/` to draw itself:
 * `game/ui/Palette.ts` resolves swatches out of `palette.json` at module scope, and a `palette.json`
 * that parses but has lost its `colors` array would throw while this scene's module graph loaded —
 * turning the fail-loud screen into the silent black page it exists to replace. Not importing
 * `MenuScene` also keeps the whole slot/settings graph off the failure path. Every other C1 screen
 * paints from the palette (`MenuScene.UI`); this one is the deliberate exception.
 */
const FAIL = {
  backdropHex: "#2a1414",
  backdrop: 0x2a1414,
  danger: "#e05a4a",
  text: "#d8d8c8",
  dim: "#6d7268",
} as const;

/** Body text at the virtual resolution, without importing the menu's helper (see FAIL above). */
function failText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string = FAIL.text,
  size = 8,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: "monospace", fontSize: `${size}px`, color })
    .setResolution(1);
}

export class BootScene extends Phaser.Scene {
  #storageWarning: string | null = null;
  /**
   * `{cueId: url}` for every audio file the build can see, resolved in `preload` and handed to the
   * director in `create`. The director needs BOTH this and the decoded cache: a file the build
   * emitted that then failed to decode satisfies one and not the other, and playing it is the throw
   * `game/audio.ts` exists to prevent.
   */
  #cueFiles: ReadonlyMap<string, string> = new Map();

  constructor() {
    super(SCENE_KEYS.boot);
  }

  preload(): void {
    // Real art wins wherever it exists; where it does not, scenes draw a labelled stand-in via
    // game/placeholder.ts. A file that fails to load is reported and then treated as unbuilt —
    // one missing PNG must not be the difference between a game and a black screen.
    const queued = queueRealAssets(this);

    // The audio cues, through their OWN loader — see the header for why this must not go through
    // `registerRealAsset`. `indexCueFiles` drops nothing silently: a file under assets/audio/ whose
    // basename answers to no §12a cue comes back as `unclaimed` and is said out loud, because an
    // audio file nobody plays is still an audio file whose licence has to be defensible.
    const cues = indexCueFiles(globbedCueFiles());
    this.#cueFiles = cues.urls;
    const queuedCues = queueCues(phaserCueLoader(this), cues.urls);
    for (const path of cues.unclaimed) {
      console.warn(`[trophic] audio file "${path}" answers to no cue in the §12a catalogue`);
    }

    if (queued.length > 0 || queuedCues.length > 0) {
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
        console.warn(`[trophic] asset "${file.key}" failed to load from ${file.url}`);
      });
    }
  }

  create(): void {
    const load = loadContent();
    if (!load.ok) {
      this.#showContentFailure(load.error);
      return;
    }

    registry.setContent(load.content);
    this.#storageWarning = installStorage();
    if (this.#storageWarning) console.warn(`[trophic] ${this.#storageWarning}`);

    // THE RUN'S ONE DIRECTOR, installed before any scene can ask for a cue.
    //
    // It is installed HERE rather than in `main.ts` because the mix comes from
    // `balance.audio.volume` (G11 — no volume is written in code), and the balance does not exist
    // until `loadContent()` has passed the zod gate above. On the failure path it is deliberately
    // never installed: the screen that reports data/ being broken plays nothing, and every
    // `audio()` call in the game answers with the silent stand-in instead of throwing.
    //
    // The host is built from THIS scene on purpose. `Scene.sound` and `Scene.cache` are the GAME's
    // sound manager and cache in Phaser 3 (Systems only nulls them on `destroy`, which is scene
    // REMOVAL, not `stop`), so the boot scene stopping below does not take the audio with it.
    installAudio(
      createAudioDirector({
        host: phaserSoundHost(this),
        // `muted` is a player setting and `game/registry.ts` `Settings` carries none yet, so a run
        // with no expressed preference is unmuted. One argument moves when that setting lands.
        config: audioConfigFromBalance(load.content.balance, false),
        files: this.#cueFiles,
        onWarning: (message: string) => console.warn(`[trophic] audio: ${message}`),
      }),
    );

    this.scene.start(SCENE_KEYS.title, { storageWarning: this.#storageWarning });
  }

  /**
   * The fail-loud screen. Readable at 480×320 means 8px text, a hard scroll, and the issue list in
   * full — a truncated list hides the one issue that explains the other twelve.
   */
  #showContentFailure(error: Error): void {
    // One entry per PROBLEM, not per file. `core/schemas.ts` collects issues per file, so five bad
    // values in species.json arrived here as one string carrying five ✖ lines — and the headline
    // said "1 issue" above a list of five. `contentProblems` (game/boot.ts) splits them, so the
    // number, the numbered list and the console line are the same count of the same things.
    const problems = contentProblems(error);
    const count = `${problems.length} issue${problems.length === 1 ? "" : "s"}`;
    console.error(
      `[trophic] content validation failed (${count}):\n` +
        problems.map((i) => `  • ${i}`).join("\n"),
    );

    const BACKDROP = FAIL.backdrop;
    this.cameras.main.setBackgroundColor(FAIL.backdropHex);
    const width = this.scale.width;
    const height = this.scale.height;

    const heading = failText(this, MARGIN_PX, MARGIN_PX, "CONTENT VALIDATION FAILED", FAIL.danger, 10);
    const sub = failText(
      this,
      MARGIN_PX,
      MARGIN_PX + 14,
      `data/*.json does not match core/schemas.ts — ${count}. Fix the data (or the schema) and reload.`,
      FAIL.text,
    );
    sub.setWordWrapWidth(width - MARGIN_PX * 2);

    const bodyTop = MARGIN_PX + 14 + sub.height + 6;
    const body = failText(
      this,
      MARGIN_PX,
      bodyTop,
      problems.map((i, n) => `${n + 1}. ${i}`).join("\n\n"),
      FAIL.text,
    );
    body.setWordWrapWidth(width - MARGIN_PX * 2);

    // The list scrolls UNDER the heading and the hint, so both need an opaque strip above it.
    // Without one the scrolled text and the heading overlap and neither is readable — which on the
    // one screen whose entire job is to be readable is not a cosmetic problem.
    body.setDepth(0);
    this.add.rectangle(0, 0, width, bodyTop - 4, BACKDROP, 1).setOrigin(0, 0).setDepth(1);
    heading.setDepth(2);
    sub.setDepth(2);

    // The scroll extent reserves the hint strip, so the LAST issue can be scrolled clear of it
    // rather than ending up permanently half-hidden behind it.
    const viewH = height - bodyTop - MARGIN_PX - HINT_STRIP_PX;
    const maxScroll = Math.max(0, body.height - viewH);
    let scroll = 0;
    const move = (delta: number): void => {
      scroll = Math.max(0, Math.min(maxScroll, scroll + delta));
      body.setY(bodyTop - scroll);
    };

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.code === "ArrowDown" || event.code === "KeyS") move(SCROLL_STEP_PX);
      else if (event.code === "ArrowUp" || event.code === "KeyW") move(-SCROLL_STEP_PX);
    });
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_p: unknown, _o: unknown, _dx: number, dy: number) => move(dy),
    );

    if (maxScroll > 0) {
      const hintY = height - 12;
      this.add.rectangle(0, hintY - 2, width, 14, BACKDROP, 1).setOrigin(0, 0).setDepth(1);
      failText(this, width - 60, hintY, "↑↓ scroll", FAIL.dim).setDepth(2);
    }
  }
}
