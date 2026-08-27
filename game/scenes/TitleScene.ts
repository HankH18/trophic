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

    // T-19's defect class, AND THE ONE INSTANCE THAT CANNOT BE FIXED FROM THE SCREEN SIDE.
    //
    // `game/mapview.ts`'s `"sprites/player"` and `game/survey-view.ts`'s `dex/<name>` were both
    // fixed by moving the SCREEN to the manifest's shape, because a row already existed to move to.
    // Here no row exists in any class: `tools/comfy/manifest.json` carries zero rows matching
    // title / banner / logo / splash, its authored `_ui` block declares six FRAMES and nothing else,
    // and there is no `ui/` directory in the manifest at all (the ui-frame class writes into
    // `assets/final/ui-frame/`). So this key names nothing, and no spelling of it would.
    //
    // It is NOT fixed by renaming the key, and it is NOT fixed here. Emitting a row means adding a
    // `_ui` entry with a new subject string, and `_ui` is authored content transcribed from
    // docs/content-bible.md with a per-entry `source` — the bible names no title banner, so writing
    // one would be inventing content to make the generator happy, which is exactly what G2 forbids.
    // A wordmark is also not a nine-slice frame: `ui-frame`'s skeleton says "empty interior,
    // nine-slice border, no text" and its post-process is `trim: true, fit: false`, so a correct row
    // would need a NEW CLASS as well as new copy. Both are Hank's calls, not this file's.
    //
    // Until then the behaviour below is the right behaviour: the shared helper draws a labelled,
    // unmistakably unfinished stand-in that prints the key it is standing in for.
    // `tests/gates/dex-path-contract.test.ts` names it as the one screen its SCREENS table
    // deliberately does not bind, because there is no manifest row to bind it to. This comment is
    // the record; it still needs an entry in docs/STATUS.md and a ticket, which the lane that owns
    // docs/ must add — the finding was handed off rather than filed here.
    placeholderImage(this, width / 2, 46, "ui/title-banner", BANNER_W, BANNER_H, {
      note: "unbuilt — no manifest row exists (see comment)",
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
        // Enabled when there is a readable save OR a broken one, because the slot list is the ONLY
        // place a broken slot can be cleared. Gated on `readable > 0` alone, a player whose three
        // slots were all unreadable could see the red lines below and never reach the screen that
        // acts on them.
        label: "CONTINUE",
        detail:
          readable > 0
            ? `${readable} of ${storage.slotCount} slots in use.`
            : unreadable.length > 0
              ? `No readable save. ${unreadable.length} of ${storage.slotCount} slots can be cleared here.`
              : `No readable save in ${storage.slotCount} slots.`,
        enabled: readable > 0 || unreadable.length > 0,
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
