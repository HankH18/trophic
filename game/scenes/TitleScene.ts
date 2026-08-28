/**
 * game/scenes/TitleScene.ts — the front door.
 *
 * Three ways in (new game, continue, settings) and one honest banner: the title art does not exist
 * yet, so the shared placeholder helper draws a labelled stand-in rather than something borrowed
 * from the style trials. A reviewer looking at a screenshot can tell instantly which pixels are
 * real, which is the entire reason `game/placeholder.ts` exists.
 */

import Phaser from "phaser";

import { applyMusicSituation, audio } from "../audio";
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
    // §12a's Title cue. Asked for on ENTRY, and asked for again every time the player backs out of
    // the slot list or the settings screen — `playMusic` answers `already-playing` and leaves the
    // track alone, which is the whole reason the director outlives the scene (game/audio.ts).
    // Before boot has installed one this is the silent stand-in, so it is never a reason not to draw.
    applyMusicSituation(audio(), { screen: "title" });

    this.cameras.main.setBackgroundColor(UI.bg);
    const width = this.scale.width;
    const height = this.scale.height;

    // BUILT. The art is at `assets/final/ui/title-banner.png` and this key resolves to it.
    //
    // ⚠ THIS COMMENT PREVIOUSLY CONCLUDED THE OPPOSITE, AT LENGTH AND WITH CONFIDENCE: that no row
    // exists in any class, that `tools/comfy/manifest.json` has no `ui/` directory, and therefore
    // "this key names nothing, and no spelling of it would". Every fact in that reasoning was true.
    // The conclusion did not follow from them, because THE LOADER DOES NOT CONSULT THE MANIFEST.
    // `game/placeholder.ts` globs `../assets/final/**/*.png` class-agnostically, and `assetId`
    // strips `FINAL_DIR` and the extension — so `assets/final/ui/title-banner.png` reduces to the id
    // `ui/title-banner`, which is exactly the literal below. The key was always right; the file was
    // simply never put where it points. The manifest was never the binding constraint, and no new
    // class, no new `_ui` subject and no invented bible copy was needed to land it (so G2 was never
    // in tension here either). Same shape as the interiors: art addressed by a hardcoded path with
    // no manifest row, working fine.
    //
    // The record is kept because the error is instructive: a chain of verified facts about one
    // subsystem produced a confident claim about a DIFFERENT subsystem that nobody re-derived.
    // `textureFor` returns the real texture whenever `scene.textures.exists(id)`, so the call below
    // needs no change to draw art — it draws the stand-in only while nothing sits at the id.
    //
    // `tests/gates/asset-reachability.test.ts` GATE 2d flags this file as claimed by nothing. That
    // is the GATE's gap, not this screen's: it recognises a PATH literal (how it resolves the
    // interiors) but not an ASSET-ID literal, which is the form every `textureFor` /
    // `placeholderImage` call site actually uses. It fails safe — live art read as unclaimed — and
    // the fix is to reduce candidate literals through `assetId()` and match on the reduced id.
    placeholderImage(this, width / 2, 46, "ui/title-banner", BANNER_W, BANNER_H, {
      note: "no texture at this id — the file belongs at assets/final/ui/title-banner.png",
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
