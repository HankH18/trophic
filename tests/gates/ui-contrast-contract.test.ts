/**
 * tests/gates/ui-contrast-contract.test.ts — the UI stays LEGIBLE across a palette re-freeze.
 *
 * WHY THIS GATE EXISTS
 * ────────────────────
 * `data/palette.json` is 32 POSITIONAL swatches, `c00`–`c31`, and build-doc §8.4 makes the IDS the
 * stable contract: a freeze swaps the 32 hex VALUES in place and nothing about the file's shape
 * changes. Every UI table in the build therefore names a swatch by id — and an id is a SLOT, not a
 * colour. At T-15 the palette was re-frozen over a broadened source set: all 32 values moved, every
 * id stayed put, and `c18` went from `#f7ebd3` (cream, 17.5 : 1 on the void) to `#37630f` (a
 * mid-dark green). Measured on the shipped file, a `text` role still pointing at `c18` reads
 * **1.078 : 1** on the battle plate `c06` and 2.891 : 1 on the `c00` void. That is invisible text on
 * the never-cut Legacy card, the menu, the survey and the battle HUD at once.
 *
 * Fourteen of nineteen `UI_SWATCH` roles had to be re-pointed by hand, taking `game/menu-model.ts`
 * and `game/survey-view.ts` with them. **Nothing went red.** The break was found by a person looking
 * at the screen. The unit tests were green throughout because they asserted that a role NAMES a
 * swatch and that the resolved hex MATCHES the file — both of which stay true through a value swap.
 *
 * A re-freeze over a corrected source set is expected again. This gate is what should go red on the
 * day it lands, before anyone opens the game.
 *
 * WHAT IS DERIVED, AND WHY BOTH SIDES HAVE TO BE
 * ──────────────────────────────────────────────
 * 1. The HEXES are read from `data/palette.json` on disk at test time. No hex from the shipped
 *    palette is written down here. A fossilised hex inside the gate meant to catch fossils is
 *    self-defeating, and this repo has already shipped exactly that: `tests/unit/battle-view.test.ts`
 *    once pinned its contrast helper to `5.29`, a ratio measured under an older freeze, inside a
 *    test named for a published standard. It broke at the re-freeze for a reason that had nothing to
 *    do with contrast maths.
 * 2. The PAIRINGS are enumerated from the real exported role tables — `UI_SWATCH`, `UI_SWATCH_ID`,
 *    `SCREEN_SWATCH_ID`, `RETIREMENT_SWATCH_ID`, `SEASON_METER_SWATCH_ID` — not from a list typed
 *    out here. Every role in every table is either declared GROUND (something is drawn ON it) or
 *    gets at least one pairing, and a role added later with no entry in {@link TableSpec.surfaces}
 *    falls through to that table's `fallback`, which is the STRICTEST tier. A new role can therefore
 *    be wrong, but it cannot be silently uncovered. "covers a role added later…" asserts that
 *    property rather than assuming it.
 * 3. The contrast MATHS is `game/ui/Palette.ts`'s `contrastRatio`, imported, not re-implemented.
 *    Two implementations of a colour metric that can silently disagree is the class of defect this
 *    repo keeps paying for. (There is a third, hand-rolled one inline in
 *    `tests/unit/game-menu-model.test.ts`; it is outside this file's scope and is recorded as a
 *    finding rather than edited here.)
 *
 * THE FLOORS, AND HOW THEY WERE PICKED
 * ────────────────────────────────────
 * Not "4.5 everywhere because WCAG says so". This is a 480 × 320 pixel-art game: some pairings are
 * body text, some are 1-pixel pips, some are region fills that carry no information at all. A gate
 * that is too strict is one somebody deletes; a gate that is too loose passes the cream-to-dark-green
 * swap that motivated it. So the whole distribution was measured against the shipped freeze first
 * and the floors were set under it — 44 pairings, the numbers in each tier's comment below.
 *
 * The two numbers that justify the choice, both measured, neither asserted:
 *   · **Passes today.** The tightest TEXT pairing in the build is `accent` (`c16`) on the battle
 *     plate `panel` (`c06`) at **4.655 : 1**. Every other text pairing is above it, up to 19.153 : 1.
 *   · **Fails T-15.** A `text` role left pointing at `c18` after the swap reads **1.078 : 1** on
 *     `c06` and 2.891 : 1 on `c00`. Both are a factor of four under the floor, and "BINDS — the T-15
 *     re-freeze, replayed" runs exactly that palette through this gate every time the suite does.
 *
 * When this gate goes red, the question it is asking is "which is wrong, the palette or the role?" —
 * and the answer is almost always the role: re-point it at a swatch that clears the floor on the
 * surface it is actually drawn on, the way T-15 was repaired by hand. Lowering a floor to get green
 * is the one repair that is never correct, because the floor is the only thing here that is not
 * derived from the very file that changed.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_SWATCH, contrastRatio } from "../../game/ui/Palette";
import { UI_SWATCH_ID } from "../../game/menu-model";
import { SCREEN_SWATCH_ID } from "../../game/survey-view";
import { RETIREMENT_SWATCH_ID } from "../../game/scenes/RetirementScene";
import { SEASON_METER_SWATCH_ID } from "../../game/ui/SeasonMeter";

/* ────────────────────────────────────────────────────────────────────────────
 * The palette, read from disk
 *
 * Read as a FILE rather than through `swatchHex`, so the shipped bytes are what is measured and so
 * the rehearsals below can hand the same checker a different palette without touching `data/`.
 *
 * `TROPHIC_PALETTE_PATH` exists only for that rehearsal — pointing this gate at a mutated copy in a
 * scratch directory to confirm it goes red. It is unset in every normal run, including CI. A GREEN
 * run with it set proves nothing at all; the rehearsals that ship in this file need no env var and
 * cannot be switched off.
 * ──────────────────────────────────────────────────────────────────────────── */

const SHIPPED_PALETTE = fileURLToPath(new URL("../../data/palette.json", import.meta.url));
const PALETTE_PATH = process.env.TROPHIC_PALETTE_PATH ?? SHIPPED_PALETTE;

interface PaletteFileShape {
  colors: { id: string; hex: string }[];
}

const PALETTE_FILE = JSON.parse(readFileSync(PALETTE_PATH, "utf8")) as PaletteFileShape;

/** `id → "#rrggbb"`, straight off disk. */
const SHIPPED_HEX: ReadonlyMap<string, string> = new Map(
  PALETTE_FILE.colors.map((swatch) => [swatch.id, swatch.hex.toLowerCase()]),
);

/** A palette lookup. Throws on an unknown id — a silent black would read as perfect contrast. */
type Palette = (id: string) => string;

function lookupIn(palette: ReadonlyMap<string, string>): Palette {
  return (id: string): string => {
    const hex = palette.get(id);
    if (hex === undefined) {
      throw new Error(`no swatch "${id}" in ${PALETTE_PATH} — the id contract (build-doc §8.4) broke`);
    }
    return hex;
  };
}

const shipped: Palette = lookupIn(SHIPPED_HEX);

/* ────────────────────────────────────────────────────────────────────────────
 * The tiers
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What a pairing IS, which decides what it has to clear.
 *
 * `text`     — a sentence, a label, a number the player reads. WCAG 2.x SC 1.4.3, small text.
 * `inactive` — text on a control the game has refused (a move it cannot use, a slot it cannot
 *              open). SC 1.4.3 exempts "inactive user interface components" outright; this gate
 *              does not, because a refused row still NAMES the thing being refused and has to be
 *              readable to say so. It is held to the non-text floor instead of the text one, and
 *              "an inactive role is DIMMER than the live text beside it" stops the tier being used
 *              as a way around 4.5 : 1.
 * `mark`     — a graphical mark that carries meaning and no text: an HP band, a diet edge, a vertex
 *              dot, a season pip, the selection bar, a floating combat number. WCAG SC 1.4.11.
 * `plate`    — a region FILL. It carries no information: it separates a region from its ground, and
 *              the edge itself is drawn by a `mark`-tier border. It only has to not vanish.
 */
type Kind = "text" | "inactive" | "mark" | "plate";

/**
 * The floor each tier must clear, and the measurement each number was set under.
 *
 * `text` 4.5 — WCAG 1.4.3 AA for small text, taken as published. The body face is 8–10px. Measured:
 *   20 text pairings, tightest 4.655 (`accent` on `panel`), loosest 19.153. It fits with 0.155 to
 *   spare, which is deliberate — this is the tier that has to fail a re-freeze, not accommodate one.
 * `mark` 3 — WCAG 1.4.11 non-text contrast, taken as published. Measured: 17 pairings, tightest
 *   3.516 (`border` on `panel`), loosest 19.153. The floating combat numbers sit in this tier and
 *   not in `text`: `cool` reads 4.374 over the void and `hot` 3.695, and `game/ui/Palette.ts` had
 *   already ruled a number that floats over the field for a few frames a graphical mark. This gate
 *   follows that ruling rather than inventing a stricter one that would red a shipped, readable UI.
 * `inactive` 3 — the same floor as a mark, for the reason in {@link Kind}. Measured: 2 pairings,
 *   3.516 (`textDisabled` on `panel`) and 5.685 (`cursorInkDim` on `cursor`).
 * `plate` 1.1 — a fill is not a mark. Measured: 5 pairings, tightest 1.217 (the Legacy card's
 *   `panel` `c04` on its `bg` `c00`), loosest 14.506. 1.1 sits under that with room, and still fails
 *   the case that matters — a re-freeze landing a plate on the same value as its ground reads
 *   exactly 1.000. NOTE the direction of the error here: `game/scenes/RetirementScene.ts` composites
 *   both of its plates at 0.15 / 0.25 alpha over `bg`, so what is PAINTED is closer to the ground
 *   than the solid swatches this gate measures. For a plate the gate is therefore optimistic; for
 *   the ink drawn on it, measuring the solid swatch is the stricter reading, which is the direction
 *   that matters. Those alphas are literals inside the scene's `redraw()` and are not exported, so
 *   modelling the blend would mean copying two numbers out of a file this gate cannot see change.
 */
const FLOOR: Readonly<Record<Kind, number>> = {
  text: 4.5,
  inactive: 3,
  mark: 3,
  plate: 1.1,
};

/* ────────────────────────────────────────────────────────────────────────────
 * The tables, and the surface each role is read against
 * ──────────────────────────────────────────────────────────────────────────── */

/** One surface a role is drawn on, named by another ROLE in the same table. */
interface Surface {
  /** The role whose swatch is the background. */
  on: string;
  kind: Kind;
  /** Why this pairing is what it is — required, so no tier is assigned without a reason. */
  why: string;
}

interface TableSpec {
  /** Where the table lives, so a failure names a file somebody can open. */
  name: string;
  /** The exported role → swatch-id table itself. Enumerated, never transcribed. */
  table: Readonly<Record<string, string>>;
  /** Roles that are only ever a BACKGROUND. They get no pairing of their own. */
  ground: readonly string[];
  /** What a role gets when `surfaces` says nothing about it. Strictest tier, by design. */
  fallback: readonly Surface[];
  /** Per-role overrides. A key that is not a role in `table` fails the spec-integrity test. */
  surfaces: Readonly<Record<string, readonly Surface[]>>;
}

const ON_PLATE = "the battle card / menu plate every HUD widget is drawn on";
const FLOATING = "a floating combat number over the field — a graphical mark (1.4.11)";
const HP_BAND = "an HP band is a bar, not a numeral";

const SPECS: readonly TableSpec[] = [
  {
    name: "game/ui/Palette.ts UI_SWATCH",
    table: UI_SWATCH,
    // `void` is the field behind everything; nothing is drawn behind IT.
    ground: ["void"],
    fallback: [{ on: "panel", kind: "text", why: ON_PLATE }],
    surfaces: {
      panel: [{ on: "void", kind: "plate", why: "the plate is a region fill; its edge is `border`" }],
      hpTrack: [{ on: "panel", kind: "plate", why: "the HP bar's trough — a fill inside the card" }],
      cursor: [{ on: "panel", kind: "mark", why: "the selection bar is a mark, not a label" }],
      border: [
        { on: "panel", kind: "mark", why: "the plate's stroke, read from inside" },
        { on: "void", kind: "mark", why: "…and from outside; it is the card's edge on both sides" },
      ],
      textDisabled: [{ on: "panel", kind: "inactive", why: "a row core refused — still has to name it" }],
      cursorInk: [{ on: "cursor", kind: "text", why: "the focused row's label sits ON the bar" }],
      cursorInkMuted: [{ on: "cursor", kind: "text", why: "the focused row's detail column" }],
      cursorInkDim: [{ on: "cursor", kind: "inactive", why: "a focused row core refused" }],
      hpHigh: [{ on: "hpTrack", kind: "mark", why: HP_BAND }],
      hpMid: [{ on: "hpTrack", kind: "mark", why: HP_BAND }],
      hpLow: [{ on: "hpTrack", kind: "mark", why: HP_BAND }],
      accent: [
        { on: "panel", kind: "text", why: `${ON_PLATE} — accent is also the Lure chip's label` },
        { on: "void", kind: "mark", why: "the crit flash and the catch burst, over the field" },
      ],
      hot: [{ on: "void", kind: "mark", why: FLOATING }],
      cool: [{ on: "void", kind: "mark", why: FLOATING }],
      good: [{ on: "void", kind: "mark", why: FLOATING }],
    },
  },
  {
    name: "game/menu-model.ts UI_SWATCH_ID",
    table: UI_SWATCH_ID,
    ground: ["bg"],
    // Every C1 screen paints straight onto the void, and all five roles are SENTENCES — including
    // `danger`, which is a footer line ("This slot could not be opened."), not a warning glyph.
    fallback: [{ on: "bg", kind: "text", why: "the C1 screens are text on the void" }],
    surfaces: {},
  },
  {
    name: "game/survey-view.ts SCREEN_SWATCH_ID",
    table: SCREEN_SWATCH_ID,
    ground: ["backdrop"],
    fallback: [{ on: "backdrop", kind: "text", why: "survey / dex / summary body copy" }],
    surfaces: {
      lineLive: [{ on: "backdrop", kind: "mark", why: "a diet edge in the web diagram — no text" }],
      lineCollapsed: [{ on: "backdrop", kind: "mark", why: "a broken diet edge — no text" }],
      vertexLive: [{ on: "backdrop", kind: "mark", why: "a vertex dot — no text" }],
      vertexZero: [{ on: "backdrop", kind: "mark", why: "a vertex dot at zero — no text" }],
    },
  },
  {
    name: "game/scenes/RetirementScene.ts RETIREMENT_SWATCH_ID",
    table: RETIREMENT_SWATCH_ID,
    ground: ["bg"],
    // The card draws each line either on the letterbox or on a column plate, so its ink is measured
    // against BOTH. See the `plate` note in FLOOR for what the scene's alpha does to this.
    fallback: [
      { on: "bg", kind: "text", why: "the Legacy card's copy, on the letterbox" },
      { on: "panel", kind: "text", why: "…and the same copy, on a column plate" },
    ],
    surfaces: {
      panel: [{ on: "bg", kind: "plate", why: "a column fill, a shade off the letterbox" }],
      /*
       * `selected` is a rectangle FILL — `RetirementScene.redraw` passes it where `panelColor`
       * otherwise goes, on whichever column the cursor is on — and never a text colour. So it is a
       * plate, and the card's own `text` / `dim` are what gets read on top of it.
       *
       * That ink-on-`selected` pairing is deliberately NOT measured here. The selected plate is
       * composited at 0.25 alpha over `bg`, so the solid swatch is not what is painted: solid `text`
       * (`c03`) on solid `selected` (`c16`) is 1.320 : 1, while the blend actually drawn is a dark
       * olive that the same text clears comfortably. Asserting the solid pair would red a card that
       * is legible in the running game — a false red is how a gate gets deleted. The alphas live as
       * literals inside the Phaser class and are not exported, so this gate cannot see them move.
       */
      selected: [
        { on: "bg", kind: "plate", why: "the chosen column's fill, against the letterbox" },
        { on: "panel", kind: "plate", why: "…and against the column it replaces — the cursor cue" },
      ],
    },
  },
  {
    name: "game/ui/SeasonMeter.ts SEASON_METER_SWATCH_ID",
    table: SEASON_METER_SWATCH_ID,
    // The meter is HUD over generated map art, so there is no palette ground behind it. `empty` is
    // the fixed ground the other pips are read against: an empty pip is the absence of a mark, which
    // is what it is for, and it is deliberately the dimmest of the four.
    ground: ["empty"],
    // The fallback is the TEXT tier here as in every other table, even though most of this one's
    // roles are pips: a role added to the meter later must land on the strictest floor until
    // somebody decides otherwise, not on the loosest one because of the company it keeps.
    fallback: [{ on: "empty", kind: "text", why: "the readout under the pips" }],
    surfaces: {
      filled: [{ on: "empty", kind: "mark", why: "a pip is a 6×10 block, not a glyph" }],
      current: [{ on: "empty", kind: "mark", why: "a pip is a 6×10 block, not a glyph" }],
      seasonStart: [{ on: "empty", kind: "mark", why: "a pip is a 6×10 block, not a glyph" }],
    },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Enumeration
 * ──────────────────────────────────────────────────────────────────────────── */

interface Pairing {
  table: string;
  fgRole: string;
  fgId: string;
  bgRole: string;
  bgId: string;
  kind: Kind;
  why: string;
}

/** Every ink-on-ground pairing a table declares. Throws rather than returning nothing. */
function pairingsFor(spec: TableSpec): Pairing[] {
  const roles = Object.keys(spec.table);
  if (roles.length === 0) {
    throw new Error(
      `${spec.name}: the role table is EMPTY, so this gate would check nothing and pass. A vacuous ` +
        "green is the failure this file exists to make impossible — see the anti-vacuity test.",
    );
  }
  const out: Pairing[] = [];
  for (const role of roles) {
    if (spec.ground.includes(role)) continue;
    const id = spec.table[role];
    if (id === undefined) throw new Error(`${spec.name}.${role} has no swatch id`);
    for (const surface of spec.surfaces[role] ?? spec.fallback) {
      const bgId = spec.table[surface.on];
      if (bgId === undefined) {
        throw new Error(`${spec.name}.${role} is drawn on "${surface.on}", which is not a role here`);
      }
      out.push({
        table: spec.name,
        fgRole: role,
        fgId: id,
        bgRole: surface.on,
        bgId,
        kind: surface.kind,
        why: surface.why,
      });
    }
  }
  if (out.length === 0) {
    throw new Error(`${spec.name}: every role is declared GROUND, so nothing is checked. Vacuous.`);
  }
  return out;
}

const PAIRINGS: readonly Pairing[] = SPECS.flatMap(pairingsFor);

function describePairing(pairing: Pairing, ratio: number): string {
  return (
    `${pairing.table} — ${pairing.fgRole}(${pairing.fgId}) on ${pairing.bgRole}(${pairing.bgId}): ` +
    `${ratio.toFixed(3)} : 1, under the ${pairing.kind} floor of ${String(FLOOR[pairing.kind])} : 1 ` +
    `[${pairing.why}]`
  );
}

/**
 * Every pairing that fails its floor under `palette`, as sentences naming the role, the surface,
 * both swatch ids and the measured ratio — so a re-freeze failure says WHICH role to re-point rather
 * than only that something, somewhere, is wrong.
 */
function violations(palette: Palette, pairings: readonly Pairing[] = PAIRINGS): string[] {
  const failed: { line: string; ratio: number }[] = [];
  for (const pairing of pairings) {
    const ratio = contrastRatio(palette(pairing.fgId), palette(pairing.bgId));
    if (ratio < FLOOR[pairing.kind]) failed.push({ line: describePairing(pairing, ratio), ratio });
  }
  return failed.sort((a, b) => a.ratio - b.ratio).map((entry) => entry.line);
}

/** The shipped palette with some ids re-pointed — a rehearsal of a re-freeze, in memory. */
function reFrozen(changes: Readonly<Record<string, string>>): Palette {
  const mutated = new Map(SHIPPED_HEX);
  for (const [id, hex] of Object.entries(changes)) {
    if (!mutated.has(id)) throw new Error(`rehearsal names "${id}", which is not a swatch`);
    mutated.set(id, hex);
  }
  return lookupIn(mutated);
}

/* ════════════════════════════════════════════════════════════════════════════
 * The gate
 * ════════════════════════════════════════════════════════════════════════════ */

describe("gate: the UI is legible against the palette that shipped", () => {
  it("THE GATE — every declared role pairing clears the floor for what it is", () => {
    // Computed live, from `data/palette.json` and the real role tables. Nothing on either side of
    // this comparison is written down in this file.
    const failures = violations(shipped);
    expect(
      failures,
      `${String(failures.length)} of ${String(PAIRINGS.length)} UI pairings are below their ` +
        `legibility floor against ${PALETTE_PATH}:\n  ${failures.join("\n  ")}\n` +
        "Re-point the ROLE at a swatch that clears the floor on the surface it is drawn on — that " +
        "is how the T-15 re-freeze was repaired. Do not lower the floor.",
    ).toEqual([]);
  });

  it("an inactive role is DIMMER than the live text beside it, so the tier cannot be a loophole", () => {
    // `inactive` is the one tier held below 4.5 : 1. It is only defensible while the role really is
    // the dimmest thing on that surface — which is also the exact shape of the defect that put the
    // contrast tests in this repo to begin with: at gate B0 the battle menu painted DISABLED rows at
    // 5.29 : 1 and selectable ones at 2.49 : 1. The greyed-out rows were the bold ones.
    let compared = 0;
    for (const spec of SPECS) {
      const pairings = pairingsFor(spec);
      for (const inactive of pairings.filter((pairing) => pairing.kind === "inactive")) {
        const live = pairings.filter(
          (pairing) => pairing.kind === "text" && pairing.bgRole === inactive.bgRole,
        );
        expect(
          live.length,
          `${spec.name}.${inactive.fgRole} claims the inactive tier on "${inactive.bgRole}", but no ` +
            "live text role is drawn on that surface — there is nothing for it to be dimmer THAN.",
        ).toBeGreaterThan(0);
        const dim = contrastRatio(shipped(inactive.fgId), shipped(inactive.bgId));
        for (const active of live) {
          const bright = contrastRatio(shipped(active.fgId), shipped(active.bgId));
          expect(
            dim,
            `${spec.name}: ${inactive.fgRole} (${dim.toFixed(2)}) out-shouts ${active.fgRole} ` +
              `(${bright.toFixed(2)}) on ${inactive.bgRole} — the ladder is inverted`,
          ).toBeLessThan(bright);
          compared += 1;
        }
      }
    }
    expect(compared, "no inactive role was compared to anything — the loop found nothing").toBeGreaterThan(0);
  });

  it("the contrast maths is WCAG's, checked against WCAG's own anchors and not against a freeze", () => {
    // Anchors, not measurements: 21 : 1 and 1 : 1 are definitional, so they cannot rot when the
    // palette moves. `tests/unit/battle-view.test.ts` brackets the same imported helper more fully;
    // this is here so the gate does not silently depend on a helper it never checks.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#000000"), 12);
  });
});

describe("gate: the enumeration is real, and cannot quietly become empty", () => {
  it("every role in every table is either a declared ground or has at least one pairing", () => {
    for (const spec of SPECS) {
      const pairings = pairingsFor(spec);
      const covered = new Set(pairings.map((pairing) => pairing.fgRole));
      for (const role of Object.keys(spec.table)) {
        const isGround = spec.ground.includes(role);
        expect(
          isGround || covered.has(role),
          `${spec.name}.${role} is measured against nothing. Give it a surface, or declare it ground.`,
        ).toBe(true);
      }
      // …and a "ground" nothing is drawn on is a role hiding from the gate, not a background.
      for (const ground of spec.ground) {
        expect(ground in spec.table, `${spec.name}: ground "${ground}" is not a role here`).toBe(true);
        expect(
          pairings.some((pairing) => pairing.bgRole === ground),
          `${spec.name}: "${ground}" is declared ground but nothing is drawn on it`,
        ).toBe(true);
      }
    }
  });

  it("no override names a role that no longer exists — a stale entry checks nothing", () => {
    for (const spec of SPECS) {
      for (const [role, surfaces] of Object.entries(spec.surfaces)) {
        expect(role in spec.table, `${spec.name}: override for "${role}", which is not a role`).toBe(true);
        for (const surface of surfaces) {
          expect(
            surface.on in spec.table,
            `${spec.name}.${role} is drawn on "${surface.on}", which is not a role here`,
          ).toBe(true);
          expect(surface.why.length, `${spec.name}.${role} has no reason recorded`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("covers a role added later, at the strictest tier, with nobody touching this file", () => {
    // The claim in the header, asserted rather than assumed. A role that appears in a table after
    // this gate was written falls through to `fallback` — the text tier — so it can be WRONG but it
    // cannot be uncovered. This is the property that makes the gate survive the next re-freeze.
    for (const spec of SPECS) {
      // The invariant that makes "strictest tier" true, stated where it can fail: every table's
      // fallback IS the text tier, whatever the rest of that table happens to be.
      for (const surface of spec.fallback) expect(surface.kind, `${spec.name} fallback`).toBe("text");

      const grown: TableSpec = { ...spec, table: { ...spec.table, freshlyAddedRole: "c31" } };
      const added = pairingsFor(grown).filter((pairing) => pairing.fgRole === "freshlyAddedRole");
      expect(added.length, `${spec.name}: a new role produced no pairing`).toBeGreaterThan(0);
      for (const pairing of added) expect(pairing.kind, spec.name).toBe("text");
    }
  });

  it("ANTI-VACUITY — an empty role table throws instead of passing", () => {
    // This repo has shipped a vacuous green before: a fully green suite once certified 39 dialogue
    // entries the player could not reach. A contrast gate over zero pairings would look identical to
    // a legible UI, so the enumerator refuses to return nothing — an empty table, and a table where
    // every role has been declared GROUND, are both hard errors rather than an empty loop.
    const spec = SPECS[0] as TableSpec;
    expect(() => pairingsFor({ ...spec, table: {} })).toThrow(/EMPTY/);
    expect(() => pairingsFor({ ...spec, ground: Object.keys(spec.table) })).toThrow(/Vacuous/);
    expect(violations(shipped, []), "an empty pairing list must not be mistaken for a pass").toEqual([]);
    expect(PAIRINGS.length, "the live enumeration produced nothing").toBeGreaterThan(0);
    for (const each of SPECS) {
      expect(
        PAIRINGS.some((pairing) => pairing.table === each.name),
        `${each.name} contributed no pairing to the live gate`,
      ).toBe(true);
    }
  });

  it("the palette actually loaded, and every swatch it holds is a hex", () => {
    // If `data/palette.json` were unreadable or empty, `violations` would compare nothing and THE
    // GATE would pass. It reads the shipped file by default, and every id it holds is a real colour.
    expect(SHIPPED_HEX.size, `no swatches read from ${PALETTE_PATH}`).toBeGreaterThan(0);
    expect(SHIPPED_HEX.size).toBe(PALETTE_FILE.colors.length);
    for (const [id, hex] of SHIPPED_HEX) {
      expect(hex, `swatch ${id}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Every id the tables name resolves — the id contract itself, checked before the ratios.
    for (const pairing of PAIRINGS) {
      expect(() => shipped(pairing.fgId), `${pairing.table}.${pairing.fgRole}`).not.toThrow();
      expect(() => shipped(pairing.bgId), `${pairing.table}.${pairing.bgRole}`).not.toThrow();
    }
  });
});

describe("gate: BINDS — the failures it is meant to catch, replayed against it", () => {
  it("BINDS — the T-15 re-freeze, replayed: a text role left on the value c18 took", () => {
    /*
     * The real event, as a palette rather than as a story. At T-15 `c18` moved from `#f7ebd3` to
     * `#37630f` while every table kept pointing at the ids it always had, and `text` became
     * unreadable everywhere at once. `#37630f` below is the value that swap produced — an INPUT to
     * this rehearsal, never an expectation about the shipped file, which is why it can sit here
     * without being the fossil the header warns about.
     */
    const textId = UI_SWATCH.text;
    const panelId = UI_SWATCH.panel;
    const afterSwap = reFrozen({ [textId]: "#37630f" });

    // The pairing itself, measured: this is T-15's 1.078 : 1 on the battle plate.
    const measured = contrastRatio(afterSwap(textId), afterSwap(panelId));
    expect(measured).toBeLessThan(FLOOR.text);
    expect(measured).toBeLessThan(1.2); // not marginal — invisible

    const failures = violations(afterSwap);
    expect(failures.length, "the T-15 palette passed the gate").toBeGreaterThan(0);
    // Named, not merely counted: a red that does not say WHICH role is a red somebody re-runs.
    const report = failures.join("\n");
    expect(report).toContain(`text(${textId}) on panel(${panelId})`);
    expect(report).toContain("game/ui/Palette.ts UI_SWATCH");
    expect(report).toMatch(/1\.07\d : 1/);
  });

  it("BINDS — a single swatch dragged next to its own background is caught, by role and by pairing", () => {
    // The other half of the same hazard: not a whole re-freeze, just one slot landing near the
    // ground it is read against. `danger` is a footer SENTENCE on the C1 screens, so it is text.
    const dangerId = UI_SWATCH_ID.danger;
    const bgId = UI_SWATCH_ID.bg;
    const nearlyInvisible = reFrozen({ [dangerId]: "#0a0810" });

    const failures = violations(nearlyInvisible);
    expect(failures.length).toBeGreaterThan(0);
    const report = failures.join("\n");
    expect(report).toContain(`danger(${dangerId}) on bg(${bgId})`);
    expect(report).toContain("game/menu-model.ts UI_SWATCH_ID");
    // That slot is also `game/survey-view.ts`'s `inkCollapsed`, so one value moving takes two
    // screens with it — the positional-palette hazard in one line.
    expect(report).toContain("game/survey-view.ts SCREEN_SWATCH_ID");
  });

  it("CONTROL — the unmodified palette produces no violation, so the reds above are the sabotage", () => {
    // Without this, both rehearsals could be passing because the rig is broken rather than because
    // the sabotage worked.
    expect(violations(shipped)).toEqual([]);
  });
});
