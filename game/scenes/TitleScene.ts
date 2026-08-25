/**
 * game/scenes/TitleScene.ts — the front door.
 *
 * Three ways in (new game, continue, settings) and one honest banner: the title art does not exist
 * yet, so the shared placeholder helper draws a labelled stand-in rather than something borrowed
 * from the style trials. A reviewer looking at a screenshot can tell instantly which pixels are
 * real, which is the entire reason `game/placeholder.ts` exists.
 */

import Phaser from "phaser";

import { SCENE_KEYS } from "../boot";
import { stackFromBottom, titleNotes } from "../menu-model";
import { placeholderImage } from "../placeholder";
import { registry } from "../registry";
import { SaveStorage } from "../storage";
import { UI, ListMenu, uiText, type MenuItem } from "./MenuScene";

const BANNER_W = 208;
const BANNER_H = 48;
const MARGIN_PX = 12;
/** Gap between the byline and the warning block above it. */
const NOTE_GAP_PX = 4;

interface TitleData {
  storageWarning?: string | null;
}

export class TitleScene extends Phaser.Scene {
  #storageWarning: string | null = null;

  constructor() {
    super(SCENE_KEYS.title);
  }

  init(data: unknown): void {
    const warning = (data as TitleData | undefined)?.storageWarning;
    this.#storageWarning = typeof warning === "string" ? warning : null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(UI.bg);
    const width = this.scale.width;
    const height = this.scale.height;

    placeholderImage(this, width / 2, 46, "ui/title-banner", BANNER_W, BANNER_H, {
      note: "unbuilt",
    });

    const byline = uiText(this, MARGIN_PX, 0, "TROPHIC · FALLOWMERE", UI.dim);

    const storage = new SaveStorage(registry.storage(), registry.balance());
    const slots = storage.slots();
    const readable = slots.filter((s) => s.state === "ok").length;
    const unreadable = slots.filter((s) => s.state === "unreadable");

    const items: MenuItem[] = [
      {
        label: "NEW GAME",
        onSelect: () => this.scene.start(SCENE_KEYS.menu, { mode: "slots", intent: "new" }),
      },
      {
        label: "CONTINUE",
        detail:
          readable > 0
            ? `${readable} of ${storage.slotCount} slots in use.`
            : `No readable save in ${storage.slotCount} slots.`,
        enabled: readable > 0,
        onSelect: () => this.scene.start(SCENE_KEYS.menu, { mode: "slots", intent: "continue" }),
      },
      {
        label: "SETTINGS",
        onSelect: () => this.scene.start(SCENE_KEYS.menu, { mode: "settings", from: "title" }),
      },
    ];

    new ListMenu(this, items, {
      x: MARGIN_PX,
      y: 88,
      width: width - MARGIN_PX * 2,
    });

    // Anything that would otherwise be silent gets a line: a run that cannot be saved, and a slot
    // this build refuses to load, are both things a player needs told BEFORE they play for an hour.
    //
    // ONE LINE EACH, and each already names its slot (game/storage.ts `problemOf`). Joined with two
    // spaces, two unreadable slots rendered as one paragraph of identical sentences identifying
    // nothing.
    const lines = titleNotes({ storageWarning: this.#storageWarning, unreadable });
    const note =
      lines.length > 0 ? uiText(this, MARGIN_PX, 0, lines.join("\n"), UI.danger) : null;
    note?.setWordWrapWidth(width - MARGIN_PX * 2);

    // Both blocks are laid out RELATIVE TO EACH OTHER, bottom-up. The byline used to be pinned at a
    // fixed `height - 34` while the note anchored itself to the bottom margin and grew upward, so
    // the moment the note passed two wrapped lines it drew straight through the byline — on the one
    // screen whose job is to tell you a save is unreadable.
    const bands = stackFromBottom(
      [byline.height, note?.height ?? 0],
      height,
      MARGIN_PX,
      NOTE_GAP_PX,
    );
    byline.setY(bands[0]?.top ?? height - MARGIN_PX - byline.height);
    if (note && bands[1]) note.setY(bands[1].top);
  }
}
