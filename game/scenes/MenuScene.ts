/**
 * game/scenes/MenuScene.ts — slot select, settings, and the in-run menu.
 *
 * One scene, three modes, because they are the same widget with different rows:
 *   `slots`    — pick a save slot to start a new game in, or to resume (build-doc §3 L12).
 *   `settings` — bible §12's "settings, text-speed" plumbing.
 *   `session`  — the menu inside a run: save, settings, and an honest list of the screens that
 *                other Lane C steps still owe.
 *
 * Guardrail G7 governs every string in this file: they state what is true, with numbers where there
 * are numbers. Nothing here has an opinion about catching.
 *
 * `ListMenu` lives here rather than in a `game/ui/` module because Lane C1's file scope is
 * boot/menus and a shared UI module is not yet earned; TitleScene imports it from here. The UI
 * COLOURS moved out to `game/menu-model.ts`: they are now palette swatch ids resolved through
 * `game/ui/Palette.ts`, and a rule that lives in a scene is a rule no node test can import.
 */

import Phaser from "phaser";

import { seasonOf } from "@core/clock";

import {
  SCENE_KEYS,
  continueGame,
  applySettings,
  enterGameplay,
  returnToTitle,
  saveSession,
  sceneRegistered,
  startNewGame,
} from "../boot";
import {
  DEFAULT_MENU_REQUEST,
  UI,
  isMenuRequest,
  slotHeadline,
  slotSelectable,
  type MenuRequest,
} from "../menu-model";
import { surveyHistory } from "../survey-history";
import { registry, TEXT_SPEEDS, type TextSpeed } from "../registry";
import { SaveStorage, slotLabel, type SlotStatus } from "../storage";
import { UI_FRAME_ASSET_ID, drawFrameRingIn, type FrameRect } from "../ui/FramePanel";
import { unlockedSignChainsOf } from "../ui/SignChains";
import type { DexSceneData } from "./DexScene";
import type { SurveySceneData } from "./SurveyScene";
import type { SummarySceneData } from "./SummaryScene";

/* ────────────────────────────────────────────────────────────────────────────
 * Shared UI bits
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The screen palette, re-exported so every existing importer (`TitleScene`) keeps working.
 *
 * It is DEFINED in `game/menu-model.ts` — the six values used to be hexes inlined here, none of them
 * one of the 32 now-frozen swatches, and a rule that lives in a scene is a rule no node test can
 * import and therefore no test can hold. `tests/unit/game-menu-model.test.ts` asserts every one of
 * them is a real swatch id in `data/palette.json`.
 */
export { UI, UI_SWATCH_ID } from "../menu-model";

/** Body text at the virtual resolution: 8px monospace, no smoothing (build-doc §7.6). */
export function uiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string = UI.text,
  size = 8,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: "monospace",
      fontSize: `${size}px`,
      color,
    })
    .setResolution(1);
}

export interface MenuItem {
  label: string;
  /** Second, dimmer line — the slot summary, the reason a row is disabled, the current value. */
  detail?: string;
  enabled?: boolean;
  onSelect?: () => void;
  /** Left/right on this row, for value rows like TEXT SPEED. */
  onAdjust?: (direction: -1 | 1) => void;
}

export interface ListMenuOpts {
  x: number;
  y: number;
  width: number;
  onCancel?: () => void;
}

const ROW_GAP_PX = 4;
const DETAIL_INDENT_PX = 10;

/**
 * A keyboard-and-pointer list. Deliberately small: it draws rows, moves a cursor, and calls back.
 * It owns no game state.
 */
export class ListMenu {
  readonly #scene: Phaser.Scene;
  readonly #opts: ListMenuOpts;
  #items: MenuItem[] = [];
  #objects: Phaser.GameObjects.Text[] = [];
  #rows: Phaser.GameObjects.Text[] = [];
  #index = 0;

  constructor(scene: Phaser.Scene, items: MenuItem[], opts: ListMenuOpts) {
    this.#scene = scene;
    this.#opts = opts;
    scene.input.keyboard?.on("keydown", this.#onKey);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.setItems(items);
  }

  get index(): number {
    return this.#index;
  }

  /** Put the cursor on a row — used to land destructive confirmations on "NO". */
  select(index: number): void {
    this.#moveTo(index);
  }

  setItems(items: MenuItem[]): void {
    this.#items = items;
    this.#index = Math.min(this.#index, Math.max(0, items.length - 1));
    this.#redraw();
  }

  destroy(): void {
    this.#scene.input.keyboard?.off("keydown", this.#onKey);
    for (const o of this.#objects) o.destroy();
    this.#objects = [];
    this.#rows = [];
  }

  #redraw(): void {
    for (const o of this.#objects) o.destroy();
    this.#objects = [];
    this.#rows = [];

    let y = this.#opts.y;
    this.#items.forEach((item, i) => {
      const row = uiText(this.#scene, this.#opts.x, y, "", UI.text);
      row.setInteractive({ useHandCursor: true });
      row.on("pointerover", () => this.#moveTo(i));
      row.on("pointerdown", () => {
        this.#moveTo(i);
        this.#select();
      });
      this.#objects.push(row);
      this.#rows.push(row);
      y += row.height;

      if (item.detail) {
        const detail = uiText(
          this.#scene,
          this.#opts.x + DETAIL_INDENT_PX,
          y,
          item.detail,
          UI.dim,
        );
        detail.setWordWrapWidth(Math.max(1, this.#opts.width - DETAIL_INDENT_PX));
        this.#objects.push(detail);
        y += detail.height;
      }
      y += ROW_GAP_PX;
    });

    this.#paint();
  }

  #paint(): void {
    this.#rows.forEach((row, i) => {
      const item = this.#items[i];
      if (!item) return;
      const selected = i === this.#index;
      const enabled = item.enabled !== false;
      row.setText(`${selected ? "▶ " : "  "}${item.label}`);
      row.setColor(!enabled ? UI.dim : selected ? UI.accent : UI.text);
    });
  }

  #moveTo(index: number): void {
    if (this.#items.length === 0) return;
    const n = this.#items.length;
    this.#index = ((index % n) + n) % n;
    this.#paint();
  }

  #select(): void {
    const item = this.#items[this.#index];
    if (!item || item.enabled === false) return;
    item.onSelect?.();
  }

  #adjust(direction: -1 | 1): void {
    const item = this.#items[this.#index];
    if (!item || item.enabled === false) return;
    item.onAdjust?.(direction);
  }

  readonly #onKey = (event: KeyboardEvent): void => {
    switch (event.code) {
      case "ArrowUp":
      case "KeyW":
        this.#moveTo(this.#index - 1);
        break;
      case "ArrowDown":
      case "KeyS":
        this.#moveTo(this.#index + 1);
        break;
      case "ArrowLeft":
        this.#adjust(-1);
        break;
      case "ArrowRight":
        this.#adjust(1);
        break;
      case "Enter":
      case "NumpadEnter":
      case "Space":
      case "KeyZ":
        this.#select();
        break;
      case "Escape":
      case "Backspace":
      case "KeyX":
        this.#opts.onCancel?.();
        break;
      default:
        break;
    }
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The scene
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The request shape and its guard now live in `game/menu-model.ts`, engine-free, so a test can reach
 * them — this file cannot be imported under vitest at all (Phaser throws `window is not defined` in
 * a node environment). Re-exported so existing importers are unaffected.
 */
export type { MenuRequest } from "../menu-model";

/** The one spelling of "open the in-run menu". */
const SESSION_REQUEST: MenuRequest = { mode: "session" };

const MARGIN_PX = 12;
const HEADER_Y = 10;
const BODY_Y = 30;
/** Where the footer sits, measured up from the bottom edge. Named so the plate can stop above it. */
const FOOTER_UP_PX = 22;

/**
 * Clear space between a glyph and the plate's outer edge: the frame's 4px of chrome, plus 2.
 *
 * `game/ui/FramePanel.ts` draws the ring 4px deep from the rect it is given, so 4 alone would put
 * the first glyph of every row directly against the inner keyline. `tools/ui-frames/SPEC.md` §4.1
 * makes the same allowance for the dialogue box ("pad 8 leaves 4px of clear plate before the first
 * glyph — the border never touches the type").
 */
const PLATE_CLEAR_PX = 6;

/**
 * The plate behind the rows: everything between the heading and the footer, both of which are drawn
 * ON the field rather than on the plate (Gold puts its headings outside the box).
 *
 * Exported and pure so `tests/unit/ui-frame-panel.test.ts` can assert it encloses the list without
 * mounting the scene — this file value-imports Phaser and cannot be loaded under vitest unmocked.
 */
export function menuPlateRect(width: number, height: number): FrameRect {
  const x = MARGIN_PX - PLATE_CLEAR_PX;
  const bottom = height - FOOTER_UP_PX - PLATE_CLEAR_PX;
  const y = BODY_Y - PLATE_CLEAR_PX;
  return { x, y, width: width - x * 2, height: bottom - y };
}

export class MenuScene extends Phaser.Scene {
  #request: MenuRequest = DEFAULT_MENU_REQUEST;
  #menu: ListMenu | null = null;
  #status: Phaser.GameObjects.Text | null = null;
  #heading: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SCENE_KEYS.menu);
  }

  init(data: unknown): void {
    this.#request = isMenuRequest(data) ? data : DEFAULT_MENU_REQUEST;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(UI.bg);
    this.#plate();

    switch (this.#request.mode) {
      case "slots":
        this.#buildSlots(this.#request.intent);
        break;
      case "settings":
        this.#buildSettings(this.#request.from);
        break;
      case "session":
        this.#buildSession();
        break;
    }
  }

  /* ── shared chrome ─────────────────────────────────────────────────────── */

  /**
   * The painted plate behind the rows — `tools/comfy/manifest.json` row `ui-menu-panel`.
   *
   * Drawn ONCE, first, so it is under every row `#show` adds afterwards; the rows are destroyed and
   * re-added on each redraw, which puts them back on top of it. Nothing is painted INSIDE the ring:
   * the field stays the camera's `UI.bg`, because the frame's own plate is `#faf7eb` and so is
   * `UI.text` — see the block comment in `game/ui/FramePanel.ts`. A missing texture is a supported
   * answer and leaves the screen exactly as it was before the art existed.
   */
  #plate(): void {
    drawFrameRingIn(
      this,
      UI_FRAME_ASSET_ID.menuPanel,
      menuPlateRect(this.scale.width, this.scale.height),
    );
  }

  /**
   * The one heading. It REPLACES rather than adds: a second `uiText` at the same coordinates draws
   * on top of the first and both stay legible only by accident, which is exactly how the title
   * screen's byline and its warning note came to overprint each other.
   */
  #header(text: string): void {
    if (this.#heading) this.#heading.destroy();
    this.#heading = uiText(this, MARGIN_PX, HEADER_Y, text, UI.accent);
    this.#heading.setWordWrapWidth(this.scale.width - MARGIN_PX * 2);
  }

  #footer(text: string, color: string = UI.dim): void {
    if (this.#status) this.#status.destroy();
    this.#status = uiText(this, MARGIN_PX, this.scale.height - FOOTER_UP_PX, text, color);
    this.#status.setWordWrapWidth(this.scale.width - MARGIN_PX * 2);
  }

  #show(items: MenuItem[], onCancel: () => void, startIndex = 0): void {
    if (this.#menu) this.#menu.destroy();
    this.#menu = new ListMenu(this, items, {
      x: MARGIN_PX,
      y: BODY_Y,
      width: this.scale.width - MARGIN_PX * 2,
      onCancel,
    });
    this.#menu.select(startIndex);
  }

  /* ── slot select ───────────────────────────────────────────────────────── */

  #slotStorage(): SaveStorage {
    return new SaveStorage(registry.storage(), registry.balance());
  }

  #buildSlots(intent: "new" | "continue"): void {
    this.#header(intent === "new" ? "NEW GAME — CHOOSE A SLOT" : "CONTINUE — CHOOSE A SLOT");
    this.#renderSlotList(intent);
    this.#footer("↑↓ move   ENTER select   ESC back");
  }

  #renderSlotList(intent: "new" | "continue"): void {
    const statuses = this.#slotStorage().slots();
    const items: MenuItem[] = statuses.map((status) => {
      const { enabled, reason } = slotSelectable(intent, status);
      const detail =
        status.state === "empty" ? (intent === "continue" ? (reason ?? undefined) : undefined)
        : status.state === "unreadable" ? `${status.message} ENTER to delete it.`
        : status.message;
      return {
        label: `${slotLabel(status.slot)}  ${slotHeadline(status)}`,
        ...(detail === undefined ? {} : { detail }),
        enabled,
        onSelect: () => this.#chooseSlot(intent, status),
      };
    });
    items.push({ label: "BACK", onSelect: () => this.scene.start(SCENE_KEYS.title) });
    this.#show(items, () => this.scene.start(SCENE_KEYS.title));
  }

  #chooseSlot(intent: "new" | "continue", status: SlotStatus): void {
    if (intent === "continue") {
      if (status.state !== "ok") {
        // An unreadable slot IS selectable on this list, which is what makes this branch reachable.
        // It used to be disabled, so `#offerDelete` was dead code and a player with a corrupt or
        // wrong-version save got no prompt, no message, and no way to clear it.
        this.#offerDelete(status);
        return;
      }
      const result = continueGame(status.slot);
      if (!result.ok) {
        this.#footer(result.error ?? "This slot could not be opened.", UI.danger);
        return;
      }
      enterGameplay(this);
      return;
    }

    if (status.state === "empty") {
      this.#beginNewGame(status.slot);
      return;
    }
    this.#confirm(
      `Overwrite ${slotLabel(status.slot)}?`,
      status.message,
      () => this.#beginNewGame(status.slot),
      () => this.#renderSlotList(intent),
    );
  }

  #beginNewGame(slot: number): void {
    const result = startNewGame({ slot });
    if (!result.ok) {
      this.#footer(result.error ?? "A new game could not be started.", UI.danger);
      return;
    }
    if (result.warning) {
      // The run is live but NOT on disk (a full store, a locked-down context). This used to go to
      // the console and nowhere else, and then routed straight into the run: the player was handed a
      // session that says "SAVE / Writes SLOT 2" while no such slot exists, and found out an hour
      // later. `#footer` cannot carry it either — `enterGameplay` starts another scene on the next
      // line and takes the footer with it. So it is a stop, with the numbers and both ways out.
      console.warn(`[trophic] ${result.warning}`);
      this.#header(`${slotLabel(slot)} WAS NOT WRITTEN`);
      this.#show(
        [
          { label: "STORAGE PROBLEM", detail: result.warning, enabled: false },
          {
            label: "PLAY UNSAVED",
            detail: "The run continues; nothing is stored.",
            onSelect: () => enterGameplay(this),
          },
          {
            label: "CHOOSE ANOTHER SLOT",
            onSelect: () => {
              registry.endSession();
              this.scene.restart({ mode: "slots", intent: "new" });
            },
          },
        ],
        () => {
          registry.endSession();
          this.scene.restart({ mode: "slots", intent: "new" });
        },
        1,
      );
      this.#footer(result.warning, UI.danger);
      return;
    }
    enterGameplay(this);
  }

  #offerDelete(status: SlotStatus): void {
    this.#confirm(
      `Delete ${slotLabel(status.slot)}?`,
      status.message,
      () => {
        const removed = this.#slotStorage().remove(status.slot);
        this.#renderSlotList("continue");
        this.#footer(
          removed.ok ? `${slotLabel(status.slot)} cleared.` : (removed.message ?? "Delete failed."),
          removed.ok ? UI.ok : UI.danger,
        );
      },
      () => this.#renderSlotList("continue"),
    );
  }

  /** A destructive choice always opens with the cursor on NO, so a stray ENTER cannot take it. */
  #confirm(question: string, detail: string, yes: () => void, no: () => void): void {
    this.#show(
      [
        { label: question, detail, enabled: false },
        { label: "YES", onSelect: yes },
        { label: "NO", onSelect: no },
      ],
      no,
      2,
    );
  }

  /* ── settings ──────────────────────────────────────────────────────────── */

  #buildSettings(from: "title" | "session"): void {
    this.#header("SETTINGS");
    const back = (): void => {
      if (from === "session") this.scene.start(SCENE_KEYS.menu, { mode: "session" });
      else this.scene.start(SCENE_KEYS.title);
    };
    this.#renderSettings(back);
    this.#footer("←→ change   ENTER cycle   ESC back");
  }

  #renderSettings(back: () => void): void {
    const speed = registry.settings().textSpeed;
    const cycle = (direction: -1 | 1): void => {
      const i = TEXT_SPEEDS.indexOf(speed);
      const n = TEXT_SPEEDS.length;
      const next = TEXT_SPEEDS[(((i + direction) % n) + n) % n] as TextSpeed;
      const result = applySettings({ textSpeed: next });
      this.#renderSettings(back);
      if (!result.ok) this.#footer(result.message ?? "Settings could not be saved.", UI.danger);
    };
    this.#show(
      [
        {
          label: `TEXT SPEED   ◀ ${speed.toUpperCase()} ▶`,
          detail: "How fast message text draws.",
          onSelect: () => cycle(1),
          onAdjust: cycle,
        },
        { label: "BACK", onSelect: back },
      ],
      back,
    );
  }

  /* ── in-run menu ───────────────────────────────────────────────────────── */

  #buildSession(): void {
    const session = registry.sessionOrNull();
    if (!session) {
      this.#header("NO RUN IN PROGRESS");
      this.#show([{ label: "BACK TO TITLE", onSelect: () => returnToTitle(this) }], () =>
        returnToTitle(this),
      );
      return;
    }

    const save = session.save;
    const node = registry.nodeById(save.currentNode);
    this.#header(
      `MENU — Year ${save.year} · ${node?.name ?? save.currentNode} · ${slotLabel(session.slot)}`,
    );

    const unbuilt = (label: string, lane: string): MenuItem => ({
      label,
      detail: `Not built yet — ${lane}.`,
      enabled: false,
    });

    /**
     * A row that opens another scene, or says why it cannot. `sceneRegistered` is asked EVERY time
     * rather than trusted from a list, because "the file exists" and "the key is registered" are
     * different facts and only the second one makes `scene.start` do anything (Phaser answers an
     * unknown key with a console warning and a silent no-op).
     */
    const screen = (
      label: string,
      key: string,
      detail: string,
      data: (close: () => void) => object,
    ): MenuItem => {
      if (!sceneRegistered(this, key)) {
        return { label, detail: `${key} is not registered in game/main.ts.`, enabled: false };
      }
      // The closer STOPS the screen before reopening this menu. `ScenePlugin.start` shuts down the
      // scene it belongs to — this one — so a callback that only started the menu left the screen it
      // came from running and drawn (measured live: after ESC the survey and the menu were both
      // active). The menu opened it, so the menu closes it.
      const close = (): void => {
        this.scene.stop(key);
        this.scene.start(SCENE_KEYS.menu, SESSION_REQUEST);
      };
      return { label, detail, onSelect: () => this.scene.start(key, data(close)) };
    };

    const content = registry.content();
    const season = seasonOf(registry.clock(), content.balance);

    this.#show(
      [
        {
          label: "SAVE",
          detail: `Writes ${slotLabel(session.slot)}.`,
          onSelect: () => {
            const result = saveSession();
            this.#footer(
              result.ok
                ? `Saved to ${slotLabel(session.slot)}.`
                : (result.message ?? "Save failed."),
              result.ok ? UI.ok : UI.danger,
            );
          },
        },
        {
          label: "SETTINGS",
          onSelect: () => this.scene.start(SCENE_KEYS.menu, { mode: "settings", from: "session" }),
        },
        screen(
          "SURVEY",
          SCENE_KEYS.survey,
          "Per-node populations and the derived web.",
          (close): SurveySceneData => ({
            content,
            // A FUNCTION, not the record: `stepRegionStates` returns a new object every season, so a
            // record captured here would be the numbers as they were when the menu was opened.
            states: () => registry.save().nodeStates,
            // The `seasons` column's readings (game/survey-history.ts). This is the LIVE record —
            // the store replaces the arrays inside it rather than the object — so a survey left open
            // across a season boundary grows its trend instead of freezing it. Without this the
            // column rendered one number and `net —` on every row of every screen.
            histories: surveyHistory.histories(),
            year: save.year,
            season,
            startNodeId: save.currentNode,
            onClose: close,
          }),
        ),
        screen(
          "DEX",
          SCENE_KEYS.dex,
          "Every line, with its seasonal flags and live count.",
          (close): DexSceneData => ({
            content,
            season,
            states: registry.save().nodeStates,
            /*
             * ⚠ THIS FIELD WAS MISSING, AND ITS ABSENCE WAS ON SCREEN. `DexScene` reads it, threads
             * it through `game/survey-view.ts` into `core/foodweb.ts`, and prints "not in the wild
             * encounter pool" for any gated line it does not name. This is the dex's ONLY supplier,
             * so leaving it out printed that line for all three Ancients on every save forever —
             * including for a player who had closed the sign chain and could catch the animal that
             * afternoon. Read from the LIVE save (`registry.save()`), not from `save` captured when
             * the menu was built, for the same reason the survey's `states` is a function.
             */
            unlockedSignChains: unlockedSignChainsOf(registry.save(), content),
            onClose: close,
          }),
        ),
        screen(
          "TEAM",
          SCENE_KEYS.summary,
          `Party ${save.party.length} · box ${save.box.length}. Shows the projected retirement year.`,
          (close): SummarySceneData => ({
            content,
            party: save.party,
            box: save.box,
            currentYear: save.year,
            onClose: close,
          }),
        ),
        unbuilt("BAG", "build-doc §15 C4"),
        unbuilt("QUESTS", "build-doc §15 C7"),
        { label: "BACK TO TITLE", onSelect: () => returnToTitle(this) },
      ],
      () => enterGameplay(this),
    );

    if (!sceneRegistered(this, SCENE_KEYS.overworld)) {
      this.#footer(
        "OverworldScene is not registered in game/main.ts — there is nowhere to walk yet.",
        UI.danger,
      );
    } else {
      this.#footer("ESC returns to the overworld.");
    }
  }
}
