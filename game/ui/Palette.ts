/**
 * game/ui/Palette.ts — swatch lookup for every UI surface.
 *
 * build-doc §8.4 / LANE-A-STATUS §4: `data/palette.json` carries 32 swatches with ids `c00`–`c31`,
 * and **the ids are the stable contract**. Gate B0 freezes the palette by swapping the 32 hex VALUES
 * in place; nothing about the file's shape changes. So UI code names a swatch by id and resolves the
 * hex here — a widget that inlines `0xe8e4c9` silently survives the freeze and then disagrees with
 * every generated asset around it.
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

/**
 * Semantic roles the battle UI paints with. Values are palette IDS, never hexes, so the B0 freeze
 * reaches the HUD the same way it reaches the sprites.
 */
export const UI_SWATCH = {
  /** Deepest shade — screen letterbox and text shadow. */
  void: "c00",
  /** Panel fill. */
  panel: "c01",
  /** Panel inner fill / menu row. */
  panelInner: "c02",
  /** Panel border, disabled text. */
  border: "c04",
  /** Muted body text. */
  textMuted: "c05",
  /** Primary text. */
  text: "c07",
  /** HP healthy. */
  hpHigh: "c19",
  /** HP warning. */
  hpMid: "c16",
  /** HP critical. */
  hpLow: "c14",
  /** Highlight / cursor. */
  accent: "c12",
  /** Damage number, super-effective flash. */
  hot: "c15",
  /** Resisted flash, cool feedback. */
  cool: "c24",
  /** Heal / positive delta. */
  good: "c20",
  /** Status chip. */
  status: "c30",
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
