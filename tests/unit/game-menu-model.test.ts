/**
 * tests/unit/game-menu-model.test.ts — the title/menu decisions, checked without an engine.
 *
 * Three C1 audit defects lived in scene files that no test in this repo can import (`import "phaser"`
 * throws `window is not defined` under vitest's node environment, measured). Each one is now a
 * function in `game/menu-model.ts` and each has an assertion here:
 *
 *   • the title screen's warning note overprinting the "TROPHIC · FALLOWMERE" byline — the two were
 *     positioned by unrelated constants, so any note past two wrapped lines drew through it;
 *   • unreadable-slot messages that named no slot, so three bad saves read as three identical
 *     sentences identifying nothing;
 *   • the CONTINUE list disabling every non-`ok` slot, which made the delete-confirmation branch
 *     behind it unreachable code — a player with a corrupt save had no prompt and no way out.
 *
 * The slot statuses below are real: they come from `SaveStorage` over a fake `localStorage` carrying
 * deliberately broken saves, not from hand-written objects, so the messages under test are the
 * messages the title screen will actually print.
 */

import { describe, expect, it } from "vitest";

import { validateContent } from "../../core/schemas";
import { newSave, slotKey, type SaveEnvelope } from "../../core/save";
import type { Balance, Content } from "../../core/types";
import {
  DEFAULT_MENU_REQUEST,
  UI,
  UI_SWATCH_ID,
  isMenuRequest,
  slotHeadline,
  slotSelectable,
  stackFromBottom,
  stackProblem,
  titleNotes,
} from "../../game/menu-model";
import { SaveStorage, slotLabel, type SlotStatus } from "../../game/storage";
import { UI_SWATCH, contrastRatio, roleHex } from "../../game/ui/Palette";

const content: Content = validateContent();
const balance: Balance = content.balance;

/** The Web Storage surface, enough of it for `core/save.ts`. */
class FakeLocalStorage {
  #map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#map.has(key) ? (this.#map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }
  removeItem(key: string): void {
    this.#map.delete(key);
  }
}

function freshSave(): SaveEnvelope {
  const first = content.nodes[0];
  if (!first) throw new Error("shipped content has no nodes");
  return newSave({ seed: balance.rng.defaultSeed, currentNode: first.id, nodes: content.nodes }, balance);
}

/** Every slot broken in a different way, read back through the real adapter. */
function brokenSlots(): SlotStatus[] {
  const fake = new FakeLocalStorage();
  fake.setItem(slotKey(0), "{ not json at all");
  fake.setItem(slotKey(1), JSON.stringify({ ...freshSave(), version: balance.party.saveVersion + 98 }));
  fake.setItem(slotKey(2), JSON.stringify({ version: balance.party.saveVersion, seed: "not a number" }));
  return new SaveStorage(fake, balance).slots().filter((s) => s.state === "unreadable");
}

/* ────────────────────────────────────────────────────────────────────────────
 * The warning block
 * ──────────────────────────────────────────────────────────────────────────── */

describe("titleNotes — which slot is broken, and one line each", () => {
  const unreadable = brokenSlots();

  it("the fixture really is three unreadable slots", () => {
    expect(unreadable).toHaveLength(balance.party.saveSlots);
    expect(unreadable.map((s) => s.problem)).toContain("version");
    expect(unreadable.map((s) => s.problem)).toContain("corrupt");
  });

  it("every line names its slot — the defect was three sentences identifying nothing", () => {
    const lines = titleNotes({ unreadable, maxLines: unreadable.length });
    expect(lines).toHaveLength(unreadable.length);
    for (const slot of unreadable) {
      const mine = lines.filter((l) => l.includes(slotLabel(slot.slot)));
      expect(mine, `no line names ${slotLabel(slot.slot)}`).toHaveLength(1);
    }
    // …and no two lines are the same sentence.
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("the storage warning leads, and never displaces a slot problem", () => {
    const lines = titleNotes({
      storageWarning: "Browser storage is unavailable.",
      unreadable,
      maxLines: 4,
    });
    expect(lines[0]).toBe("Browser storage is unavailable.");
    expect(lines).toHaveLength(4);
  });

  it("past the line budget the slots collapse to ONE line that still names them all", () => {
    const lines = titleNotes({ storageWarning: "Storage is unavailable.", unreadable, maxLines: 2 });
    expect(lines).toHaveLength(2);
    for (const slot of unreadable) {
      expect(lines[1]).toContain(slotLabel(slot.slot));
    }
    expect(lines[1]).toContain(String(unreadable.length));
  });

  it("nothing wrong ⇒ nothing said", () => {
    expect(titleNotes({ unreadable: [] })).toEqual([]);
    expect(titleNotes({ storageWarning: null, unreadable: [] })).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The layout
 * ──────────────────────────────────────────────────────────────────────────── */

describe("stackFromBottom — the byline and the note cannot overprint", () => {
  const height = balance.map.virtualHeight;
  const margin = 12;

  it("stacks upward from the bottom margin, first entry lowest", () => {
    const bands = stackFromBottom([9, 27], height, margin, 4);
    expect(bands[0]?.top).toBe(height - margin - 9);
    expect(bands[1]?.top).toBe(height - margin - 9 - 4 - 27);
    expect(stackProblem(bands, height)).toBeNull();
  });

  it("no note height overlaps the byline — the reported defect, swept over every case", () => {
    const bylineHeight = 9;
    for (let noteHeight = 0; noteHeight <= 120; noteHeight += 1) {
      const bands = stackFromBottom([bylineHeight, noteHeight], height, margin, 4);
      expect(stackProblem(bands, height), `note height ${noteHeight}`).toBeNull();
      const byline = bands[0];
      const note = bands[1];
      expect(byline).toBeDefined();
      expect(note).toBeDefined();
      if (!byline || !note) continue;
      expect(note.top + note.height).toBeLessThanOrEqual(byline.top);
      expect(byline.top + byline.height).toBeLessThanOrEqual(height);
    }
  });

  it("reports a stack that leaves the screen rather than drawing it anyway", () => {
    const bands = stackFromBottom([9, height], height, margin, 4);
    expect(stackProblem(bands, height)).toMatch(/above the screen/);
  });

  it("the worst real case — a storage warning plus every slot unreadable — clears the menu", () => {
    // Eight wrapped lines at the 8px body size is more than titleNotes can produce with this
    // build's slot count; the block still has to sit below the menu, which starts at y=88.
    const MENU_BOTTOM_Y = 88;
    const bands = stackFromBottom([9, 8 * 9], height, margin, 4);
    expect(stackProblem(bands, height)).toBeNull();
    expect(bands[1]?.top).toBeGreaterThan(MENU_BOTTOM_Y);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Slot rows
 * ──────────────────────────────────────────────────────────────────────────── */

describe("slot rows", () => {
  const unreadable = brokenSlots();

  it("an unreadable slot is SELECTABLE on continue, or the delete branch is dead code", () => {
    for (const status of unreadable) {
      expect(slotSelectable("continue", status).enabled, slotLabel(status.slot)).toBe(true);
      expect(slotSelectable("new", status).enabled).toBe(true);
      expect(slotHeadline(status)).toBe("UNREADABLE");
    }
  });

  it("an empty slot cannot be continued, and says why", () => {
    const empty: SlotStatus = { slot: 0, state: "empty", save: null, problem: null, message: "EMPTY" };
    const answer = slotSelectable("continue", empty);
    expect(answer.enabled).toBe(false);
    expect(answer.reason).toBeTruthy();
    expect(slotSelectable("new", empty).enabled).toBe(true);
    expect(slotHeadline(empty)).toBe("EMPTY");
  });

  it("a readable slot heads with its year", () => {
    const fake = new FakeLocalStorage();
    const store = new SaveStorage(fake, balance);
    expect(store.write(0, freshSave()).ok).toBe(true);
    const status = store.read(0);
    expect(slotHeadline(status)).toBe(`YEAR ${status.save?.year}`);
    expect(slotSelectable("continue", status).enabled).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Scene data
 * ──────────────────────────────────────────────────────────────────────────── */

describe("isMenuRequest — Phaser hands `init` whatever the caller passed", () => {
  it("accepts exactly the three shapes", () => {
    expect(isMenuRequest({ mode: "slots", intent: "new" })).toBe(true);
    expect(isMenuRequest({ mode: "slots", intent: "continue" })).toBe(true);
    expect(isMenuRequest({ mode: "settings", from: "title" })).toBe(true);
    expect(isMenuRequest({ mode: "settings", from: "session" })).toBe(true);
    expect(isMenuRequest({ mode: "session" })).toBe(true);
  });

  it("rejects everything else, including the near-misses", () => {
    for (const bad of [
      undefined,
      null,
      "session",
      42,
      [],
      {},
      { mode: "slots" },
      { mode: "slots", intent: "resume" },
      { mode: "settings" },
      { mode: "settings", from: "overworld" },
      { mode: "sessions" },
    ]) {
      expect(isMenuRequest(bad), JSON.stringify(bad ?? null)).toBe(false);
    }
  });

  it("the default request is itself valid", () => {
    expect(isMenuRequest(DEFAULT_MENU_REQUEST)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The screen palette (build-doc §8.4 / G-freeze)
 * ──────────────────────────────────────────────────────────────────────────── */

describe("UI colours come from data/palette.json, not from hexes typed into a scene", () => {
  const byId = new Map(content.palette.colors.map((c) => [c.id, c.hex.toLowerCase()]));

  it("every role names a real swatch, and resolves to that swatch's hex", () => {
    // WAS: six hexes inlined in game/scenes/MenuScene.ts (#0d0f0c, #d8d8c8, #6d7268, #f2c14e,
    // #e05a4a, #8fbf6f). NONE of them is one of the 32 swatches, and the palette is now
    // `frozen: true` — so every C1 screen was painted in colours no generated asset will ever use.
    for (const [role, id] of Object.entries(UI_SWATCH_ID)) {
      expect(byId.has(id), `${role} names swatch "${id}"`).toBe(true);
      expect(UI[role as keyof typeof UI].toLowerCase(), role).toBe(byId.get(id));
    }
  });

  it("BINDS — none of the hexes it replaced is a swatch", () => {
    const hexes = new Set([...byId.values()]);
    for (const gone of ["#0d0f0c", "#d8d8c8", "#6d7268", "#f2c14e", "#e05a4a", "#8fbf6f"]) {
      expect(hexes.has(gone), gone).toBe(false);
    }
  });

  it("text, dim, accent, danger and ok are all legible on the bg swatch", () => {
    // Palette compliance that made the menu unreadable would be a different defect, not a fix.
    // (Why the battle HUD's UI_SWATCH is not reused instead is the next test, which reads that
    // table out of the palette rather than restating a swatch id.)
    const rgb = (hex: string): [number, number, number] => [
      Number.parseInt(hex.slice(1, 3), 16) / 255,
      Number.parseInt(hex.slice(3, 5), 16) / 255,
      Number.parseInt(hex.slice(5, 7), 16) / 255,
    ];
    const lum = (hex: string): number => {
      const f = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const [r, g, b] = rgb(hex);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bg = lum(UI.bg);
    for (const role of ["text", "dim", "accent", "danger", "ok"] as const) {
      const l = lum(UI[role]);
      const ratio = (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05);
      expect(ratio, `${role} contrast on bg`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("BINDS — UI_SWATCH is not reusable here, and the reason is GROUND, not ink", () => {
    // The comment this replaces (here, and at game/menu-model.ts:41) restated a swatch id:
    // "the battle HUD's UI_SWATCH.text (c07, #765b4e) is 3.3 : 1 on c00, which is why that table is
    // not reused". Both clauses were false — the HUD was un-inverted, UI_SWATCH.text became c18 and
    // c07 was repurposed to cursorInkMuted — and nothing went red, because both sites were prose.
    // Every clause below is now READ out of game/ui/Palette.ts at run time.
    const voidHex = roleHex("void");
    expect(voidHex.toLowerCase(), "the menu's bg IS the HUD's void swatch").toBe(UI.bg.toLowerCase());

    // 1. Where the two tables share a role name they name the SAME swatch, so "different ink" is
    //    not the reason they are separate. If this ever stops holding, the prose must be re-read.
    expect(UI_SWATCH.text, "UI_SWATCH.text vs UI_SWATCH_ID.text").toBe(UI_SWATCH_ID.text);
    expect(UI_SWATCH.accent, "UI_SWATCH.accent vs UI_SWATCH_ID.accent").toBe(UI_SWATCH_ID.accent);

    // 2. The real reason: UI_SWATCH's cursor-bar roles are DARK ink for the light `cursor` bar they
    //    are drawn on. The menu has no such bar — it paints straight onto the c00 void, where all
    //    three fall under 4.5 : 1. Both halves are asserted, so "it is dark ink" is not assumed.
    for (const role of ["cursorInk", "cursorInkMuted", "cursorInkDim"] as const) {
      const onBar = contrastRatio(roleHex(role), roleHex("cursor"));
      expect(onBar, `${role} on the cursor bar`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(roleHex(role), voidHex), `${role} on the void`).toBeLessThan(4.5);
    }

    // 3. And four of the six roles this screen needs have no counterpart in UI_SWATCH at all.
    for (const role of ["bg", "dim", "danger", "ok"] as const) {
      expect(role in UI_SWATCH, `UI_SWATCH must not carry "${role}"`).toBe(false);
      expect(role in UI_SWATCH_ID, `UI_SWATCH_ID carries "${role}"`).toBe(true);
    }
  });
});
