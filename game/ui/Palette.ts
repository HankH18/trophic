/**
 * game/ui/Palette.ts — swatch lookup for every UI surface.
 *
 * build-doc §8.4: `data/palette.json` carries 32 swatches with ids `c00`–`c31`,
 * and **the ids are the stable contract**. Gate B0 freezes the palette by swapping the 32 hex VALUES
 * in place; nothing about the file's shape changes. So UI code names a swatch by id and resolves the
 * hex here — a widget that inlines `0xe8e4c9` silently survives the freeze and then disagrees with
 * every generated asset around it.
 *
 * THE DEFECT THIS FILE SHIPPED, AND WHY THE ID CONTRACT WAS NOT ENOUGH
 * ───────────────────────────────────────────────────────────────────
 * Naming a swatch by id survives the freeze. Naming the RIGHT swatch does not: {@link UI_SWATCH} was
 * chosen against the pre-B0 stand-in hexes, where `c01` was near-black and `c07` near-white, and
 * gate B0 swapped `c01` to a mid grey (#a4a3ad) and `c07` to a dark taupe (#765b4e). Every ratio
 * inverted. Measured on the shipped frozen file, the table this replaces painted a DISABLED menu row
 * at 5.29 : 1 and a SELECTABLE one at 2.49 : 1 — the greyed-out rows were the bold ones — and put a
 * combatant card's own name at 2.49 : 1 while its "muted" HP readout shouted at 3.81 : 1. The lane's
 * tests were green throughout because they asserted role NAMES (`"border"`, `"accent"`) and that
 * `PALETTE_FROZEN` matched the file; nothing bound a role to the contrast its hex actually produces.
 *
 * So this file now (a) states its roles as a LEGIBILITY LADDER with the measured ratio written
 * beside each one, (b) exports {@link contrastRatio} / {@link roleContrast} so the ladder is
 * computable, and (c) is bound by `tests/unit/battle-view.test.ts`, which recomputes every ratio
 * from `data/palette.json` and fails if the ladder ever inverts again — including on the REAL menu
 * model, so the check is about what gets painted and not about a hand-picked pair.
 *
 * ONE ROLE MUST NOT DO TWO JOBS
 * ─────────────────────────────
 * The other half of the same defect: `panelInner` was both the HP bar's TRACK (which wants to be
 * dark, so a coloured fill reads against it) and the menu's CURSOR BAR (which wants to be light, so
 * it reads against the plate). One swatch cannot satisfy both, and the frozen value that satisfied
 * the cursor left a half-health bar at 1.64 : 1. `accent` was likewise the focused row's INK and the
 * crit/catch FX colour — one is read on the near-white cursor bar, the other over the near-black
 * field. Both are split below; a role here names exactly one surface.
 *
 * Engine-free: no phaser import, so this is importable from a node test.
 */

import paletteFile from "../../data/palette.json";

interface Swatch {
  id: string;
  hex: string;
}

const SWATCHES: readonly Swatch[] = paletteFile.colors as readonly Swatch[];

const BY_ID = new Map<string, string>(SWATCHES.map((swatch) => [swatch.id, swatch.hex]));

/**
 * True once `data/palette.json` HAS been frozen — i.e. gate B0 has swapped the 32 stand-in hexes
 * for the final ones (build-doc §15 / core/types.ts `PaletteFile.frozen`: "false until gate B0
 * freezes it"). It is `paletteFile.frozen`, verbatim.
 *
 * The doc comment used to say the inverse ("true while the palette still holds the pre-B0 stand-in
 * values"), which is exactly backwards and is the kind of error that survives review: the shipped
 * file now says `"frozen": true`, so any lane trusting the comment read "still a stand-in" off a
 * frozen palette. `tests/unit/battle-view.test.ts` asserts the constant against the shipped file.
 */
export const PALETTE_FROZEN: boolean = paletteFile.frozen === true;

/** `"#rrggbb"` for a swatch id. Throws on an unknown id — a silent black is a lie about the art. */
export function swatchHex(id: string): string {
  const hex = BY_ID.get(id);
  if (hex === undefined) {
    throw new Error(
      `game/ui/Palette.ts: no swatch "${id}" in data/palette.json (ids are c00–c31 and are the ` +
        "stable contract across the gate-B0 value swap — build-doc §8.4).",
    );
  }
  return hex;
}

/** `0xRRGGBB` for a swatch id — the form every Phaser tint/fill argument takes. */
export function swatchColor(id: string): number {
  return Number.parseInt(swatchHex(id).slice(1), 16);
}

/** Every swatch id in file order, for pickers and for the placeholder's deterministic tint. */
export const SWATCH_IDS: readonly string[] = SWATCHES.map((swatch) => swatch.id);

/* ────────────────────────────────────────────────────────────────────────────
 * Contrast — WCAG 2.x relative luminance.
 *
 * CONSTANTS (G11, deliberately narrowed): the coefficients below are the W3C's published
 * sRGB luminance formula, not gameplay tunables. A balance retune must not be able
 * to change what "legible" means, and nothing in `core/` reads any of them.
 * ──────────────────────────────────────────────────────────────────────────── */

const SRGB_MAX = 255;
const SRGB_KNEE = 0.03928;
const SRGB_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;
/** WCAG's flare term — the +0.05 in `(L1 + 0.05) / (L2 + 0.05)`. */
const FLARE = 0.05;

function channel(value: number): number {
  const c = value / SRGB_MAX;
  return c <= SRGB_KNEE ? c / SRGB_SLOPE : ((c + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

/** WCAG relative luminance of a `"#rrggbb"` string, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return LUMA_R * channel(r) + LUMA_G * channel(g) + LUMA_B * channel(b);
}

/** WCAG contrast ratio between two `"#rrggbb"` strings, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + FLARE) / (Math.min(la, lb) + FLARE);
}

/**
 * Semantic roles the battle UI paints with. Values are palette IDS, never hexes, so the B0 freeze
 * reaches the HUD the same way it reaches the sprites.
 *
 * RE-PICKED AT T-15, AND WHY A SECOND RE-PICK WAS EVER NEEDED
 * ───────────────────────────────────────────────────────────
 * The header above says the ids are the stable contract. They are — but an id is a SLOT, not a
 * colour, and `data/palette.json` was re-frozen at T-15 to the class-equal fit, moving all 32 hex
 * values while leaving the ids and their order byte-identical. `c18` went from a cream (#f7ebd3,
 * 17.5 : 1 on the void) to a mid-dark green (#37630f, 2.89 : 1), so `text` — every combatant name
 * and every narration line — became unreadable on its own plate without one character of this file
 * changing. That is the standing hazard of a positional palette: a re-freeze silently re-points
 * every table like this one, and only the contrast tests below catch it.
 *
 * So the ids below moved and the ROLES did not. Each was re-picked by MEASURED contrast against the
 * surface it is actually drawn on, preserving that role's LEVEL rather than its hue where the two
 * disagreed, with the pre-swap number in brackets so the ladder is visibly the same ladder.
 *
 * THE LADDER (ratios measured against the SHIPPED frozen palette; the test recomputes them)
 * ────────────────────────────────────────────────────────────────────────────────────────
 * On the plate (`panel` c06 #74564e, 3.12 : 1 on the void [2.18]):
 *   `text`          #faf7eb   6.15 : 1 [8.04]  primary — the card's own name, the narration line
 *   `textMuted`     #f9dab4   4.94 : 1 [5.69]  secondary — HP readout, mods footer, row detail
 *   `textDisabled`  #c8bca5   3.52 : 1 [3.04]  a row core refused. DIMMEST, by construction.
 *   `status`        #d2e0e2   4.87 : 1 [7.80]  the status chip
 *   `accent`        #f8d80f   4.66 : 1 [5.61]  the crit/catch highlight, and the Lure chip
 *   `border`        #c8bca5   3.52 : 1 [3.04]  the plate's stroke
 * On the cursor bar (`cursor` c03 #faf7eb, 6.15 : 1 on the plate [9.32]), where the FOCUSED row is:
 *   `cursorInk`     #321410  15.74 : 1 [17.27] the focused row's label — boldest text on the screen
 *   `cursorInkMuted`#8c5230   5.82 : 1 [6.11]  the focused row's detail column
 *   `cursorInkDim`  #2d6f38   5.68 : 1 [6.03]  a focused row core refused
 * On the HP track (`hpTrack` #040308):
 *   `hpHigh` #89b935 8.86 : 1 [8.81] · `hpMid` #f3a262 9.94 : 1 [8.87] · `hpLow` #c72a1b 3.70 : 1
 *   [5.41]. The three must be tellable APART, not merely each above the floor: green / warm orange
 *   / red, separated 1.12 : 1, 2.69 : 1 and 2.40 : 1 from one another (was 1.01, 1.64, 1.63 — the
 *   old high and mid were within 1 % of the same luminance and carried the reading on hue alone).
 * On the field (`void` #040308), where the FX numbers float:
 *   `accent` #f8d80f 14.51 : 1 [12.25] · `hot` #c72a1b 3.70 : 1 [5.41] · `good` #9ecd42 11.03 : 1
 *   [10.97] · `cool` #2178bb 4.37 : 1 [3.77] (the palette still holds exactly one usable blue, and
 *   "resisted" must not read as "healed"; 4.37 clears WCAG 1.4.11's 3 : 1 for a non-text graphical
 *   mark, which is what a floating combat number over the field is).
 *
 * WHERE THE FIT FORCED A HUE TO MOVE. `panel` could not stay a saturated brown: the class-equal fit
 * left NO swatch between L 0.046 (`c05`) and L 0.109 (`c06`), and `c05` reads 1.87 : 1 on the void,
 * under the 2 : 1 a plate must clear to be a plate. `c06` is the darkest swatch that clears it,
 * which in turn caps `text : panel` at 6.15 : 1 — every lighter plate breaks the 1.2× primary-over-
 * muted separation, because only `c03` is bright enough to sit 1.2× above a role that is itself
 * above 4.5. `hpLow`/`hot` take `c08`, the fit's only true red, at 3.70 : 1 rather than a
 * level-faithful tan that would stop reading as critical.
 *
 * The battle screen is dark-plate / light-ink, which is what every other scene in the game already
 * is (`game/menu-model.ts` `UI_SWATCH_ID`: bg `c00`, text `c03`, dim `c01`, accent `c16`). Before
 * this fix it was the only light-plate / dark-ink screen in the build, and its dim roles were darker
 * rather than dimmer — which is how the inversion hid.
 */
export const UI_SWATCH = {
  /** Deepest shade — screen letterbox, the field behind the combatants, and text shadow. */
  void: "c00",
  /** Panel fill: the combatant cards, the menu, the message box. The DARKEST plate ≥ 2 : 1 on void. */
  panel: "c06",
  /** The HP bar's TRACK. Dark, so every band reads against it. Not the cursor — see `cursor`. */
  hpTrack: "c00",
  /** The menu's selection bar. Light, so it reads against the plate. */
  cursor: "c03",
  /** Panel border / stroke. Deliberately the same swatch as `textDisabled` — one muted neutral. */
  border: "c12",
  /** Muted body text on the plate. */
  textMuted: "c15",
  /** Primary text on the plate. */
  text: "c03",
  /** A row core refused, drawn on the plate. Dimmest label there is. */
  textDisabled: "c12",
  /** The focused row's label, drawn ON the cursor bar. */
  cursorInk: "c04",
  /** The focused row's detail column, drawn ON the cursor bar. */
  cursorInkMuted: "c07",
  /** A focused row core refused, drawn ON the cursor bar. Dimmer than `cursorInkMuted`, not redder. */
  cursorInkDim: "c19",
  /** HP healthy. */
  hpHigh: "c22",
  /** HP warning. */
  hpMid: "c11",
  /** HP critical. */
  hpLow: "c08",
  /** Highlight — the crit flash and the catch burst, over the field. */
  accent: "c16",
  /** Damage number, super-effective flash. */
  hot: "c08",
  /** Resisted flash, cool feedback. */
  cool: "c28",
  /** Heal / positive delta. */
  good: "c24",
  /** Status chip. */
  status: "c02",
} as const;

export type UiSwatchRole = keyof typeof UI_SWATCH;

/** `0xRRGGBB` for a semantic role. */
export function roleColor(role: UiSwatchRole): number {
  return swatchColor(UI_SWATCH[role]);
}

/** `"#rrggbb"` for a semantic role — Phaser text styles take CSS strings, not numbers. */
export function roleHex(role: UiSwatchRole): string {
  return swatchHex(UI_SWATCH[role]);
}

/** The WCAG contrast between two roles, resolved through the shipped palette. */
export function roleContrast(foreground: UiSwatchRole, background: UiSwatchRole): number {
  return contrastRatio(roleHex(foreground), roleHex(background));
}
