/**
 * game/scenes/BootScene.ts — the zod gate, made visible.
 *
 * build-doc §7: "JSON files are validated against these at boot with zod (fail loud on drift)."
 * The loud half is the whole point of the gate. Content drift that boots into a half-populated
 * region and only shows up as a wrong number four screens later is the failure mode the gate was
 * built to prevent, so a failed `validateContent()` stops here and prints every issue on screen,
 * scrollable, with the file each one came from.
 *
 * Everything else this scene does is short on purpose: load whatever real art exists, install
 * storage and settings, and hand off to the title.
 */

import Phaser from "phaser";

import { SCENE_KEYS, contentIssues, installStorage, loadContent } from "../boot";
import { queueRealAssets } from "../placeholder";
import { registry } from "../registry";
import { UI, uiText } from "./MenuScene";

const MARGIN_PX = 8;
const SCROLL_STEP_PX = 24;
const HINT_STRIP_PX = 16;

export class BootScene extends Phaser.Scene {
  #storageWarning: string | null = null;

  constructor() {
    super(SCENE_KEYS.boot);
  }

  preload(): void {
    // Real art wins wherever it exists; where it does not, scenes draw a labelled stand-in via
    // game/placeholder.ts. A file that fails to load is reported and then treated as unbuilt —
    // one missing PNG must not be the difference between a game and a black screen.
    const queued = queueRealAssets(this);
    if (queued.length > 0) {
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

    this.scene.start(SCENE_KEYS.title, { storageWarning: this.#storageWarning });
  }

  /**
   * The fail-loud screen. Readable at 480×320 means 8px text, a hard scroll, and the issue list in
   * full — a truncated list hides the one issue that explains the other twelve.
   */
  #showContentFailure(error: Error): void {
    const issues = contentIssues(error);
    console.error(
      `[trophic] content validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"}):\n` +
        issues.map((i) => `  • ${i}`).join("\n"),
    );

    const BACKDROP = 0x2a1414;
    this.cameras.main.setBackgroundColor("#2a1414");
    const width = this.scale.width;
    const height = this.scale.height;

    const heading = uiText(this, MARGIN_PX, MARGIN_PX, "CONTENT VALIDATION FAILED", UI.danger, 10);
    const sub = uiText(
      this,
      MARGIN_PX,
      MARGIN_PX + 14,
      `data/*.json does not match core/schemas.ts — ${issues.length} issue${issues.length === 1 ? "" : "s"}. ` +
        "Fix the data (or the schema) and reload.",
      UI.text,
    );
    sub.setWordWrapWidth(width - MARGIN_PX * 2);

    const bodyTop = MARGIN_PX + 14 + sub.height + 6;
    const body = uiText(
      this,
      MARGIN_PX,
      bodyTop,
      issues.map((i, n) => `${n + 1}. ${i}`).join("\n\n"),
      UI.text,
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
      uiText(this, width - 60, hintY, "↑↓ scroll", UI.dim).setDepth(2);
    }
  }
}
