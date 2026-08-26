/**
 * game/season-tint.ts — season variation as a RUNTIME TINT (Hard Requirement 6).
 *
 * Hard Req 6, verbatim: "Season variation is a runtime tint shader; year variation is art. Never
 * generate seasonal map art." So there are exactly four painted states of a node — the base map and
 * its year variants (build-doc §7.2 `yearVariants`, swapped by core/lifecycle.ts `mapAssetForYear`)
 * — and the SEASON is a colour applied over whichever of them is on screen.
 *
 * Phaser's `setTint` is applied by the WebGL pipeline as a per-vertex shader uniform, so tinting the
 * painted map image IS the runtime tint shader Hard Req 6 asks for. No seasonal art is generated, no
 * second copy of a map exists, and a node that has no year variant yet still gets four readings.
 *
 * ⚠ WHERE THE NUMBERS COME FROM — read this before changing a value.
 *
 *   MAGNITUDES are data. `balance.audio.seasonBrightness` is the per-season preset (bible §12a:
 *   "spring: neutral; summer: +brightness; autumn: lowpass + slight slow; winter: heavier lowpass")
 *   and `balance.audio.yearDarkenPerYear` is the progressive year darkening ("Year aging
 *   progressively darkens town-theme EQ so Hearthollow year 5 sounds like a memory of year 1").
 *   Those four numbers plus the darkening rate have exactly one home, data/balance.json, and this
 *   module reads them (G11). A retune of the season presets moves the picture and the sound
 *   together, which is what "one track, six readings" means.
 *
 *   HUES are data too, as of 2026-08-26: `balance.seasonTint` carries one preset per season and
 *   {@link seasonTintTable} is what every default in this file reads. They used to be literals here
 *   ({@link PROVISIONAL_SEASON_TINTS}) because the group did not exist and adding it is necessarily
 *   a three-file change — `core/schemas.ts` validates balance.json with `z.object`, which STRIPS
 *   undeclared keys, so a `seasonTint` group added to the JSON alone would have reached no reader
 *   at all. So: data/balance.json + `Balance` (core/types.ts) + `zBalance` (core/schemas.ts), in one
 *   change, and then this file's default. A hue retune is now an edit to balance.json alone (INV-3).
 *
 * Pure TypeScript. This module imports no engine code at runtime — Phaser cannot be imported under
 * vitest's node environment (measured: `ReferenceError: window is not defined` from
 * phaser/src/device/OS.js), so anything a test needs to reach has to stay engine-free.
 */

import type { ClockState } from "@core/clock";
import { seasonOf } from "@core/clock";
import type { Balance, Season } from "@core/types";

/* ────────────────────────────────────────────────────────────────────────────
 * Shape
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SeasonTintRgb {
  r: number;
  g: number;
  b: number;
}

/**
 * One season's colour reading. `provisional` says the hue is a placeholder rather than data — false
 * for everything {@link seasonTintTable} produces, true only for a table a caller supplies itself
 * (see {@link PROVISIONAL_SEASON_TINTS}).
 */
export interface SeasonTintPreset {
  rgb: SeasonTintRgb;
  /** Strength of an optional overlay pass a scene may draw on top of the tinted map, 0–1. */
  overlayAlpha: number;
  provisional: boolean;
}

export type SeasonTintTable = Readonly<Record<Season, SeasonTintPreset>>;

/** What a scene applies: a packed tint colour plus the terms it was built from. */
export interface SeasonTint {
  season: Season;
  year: number;
  /** The preset as authored, before anything is done to it. */
  base: SeasonTintRgb;
  /**
   * The preset normalised so its brightest channel is 255 — the season's HUE with no dimming in it.
   *
   * This separation is the whole point of the module: `setTint` MULTIPLIES, so a preset whose
   * channels are all below 255 is itself a brightness reduction, and multiplying brightness and year
   * darkening on top of it stacks three dimming terms where the spec names two. See
   * {@link seasonTint}.
   */
  hue: SeasonTintRgb;
  /** The hue after brightness and year darkening — this is what is handed to `setTint`. */
  rgb: SeasonTintRgb;
  /** 24-bit 0xRRGGBB of {@link rgb}. */
  color: number;
  /** balance.audio.seasonBrightness[season]. */
  brightness: number;
  /** 1 − balance.audio.yearDarkenPerYear × (year − startYear), clamped to [0, 1]. */
  yearDarkening: number;
  /**
   * The reading's actual luminance ceiling: `min(brightness, 1) × yearDarkening`. The brightest
   * channel of {@link rgb} is exactly `round(255 × scale)`, so the picture's brightness is the two
   * numbers balance.json states and nothing else. Brightness above 1 cannot raise this — a multiply
   * cannot brighten past the painted map — and is spent on desaturation instead (see
   * {@link seasonTint}).
   */
  scale: number;
  overlayAlpha: number;
  /** True while any term of this reading is a placeholder rather than data. */
  provisional: boolean;
}

export class SeasonTintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeasonTintError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The four presets
 * ──────────────────────────────────────────────────────────────────────────── */

const CHANNEL_MAX = 255;

/**
 * The four season hues, from `balance.seasonTint` (Hard Req 6). `provisional` is false on every
 * preset this returns: the hue is data now, so nothing downstream should label it a placeholder.
 *
 * A `Record<Season, …>` is exhaustive by type AND by schema — `zBalance` validates the group as a
 * `z.record` over the `Season` enum, which requires every key — so this cannot hand back a table
 * with a season missing. {@link assertCoversSeasonOrder} still runs on every read, because
 * `balance.clock.seasonOrder` is a tunable and the two could be retuned apart.
 */
export function seasonTintTable(balance: Balance): SeasonTintTable {
  const out: Partial<Record<Season, SeasonTintPreset>> = {};
  for (const [season, preset] of Object.entries(balance.seasonTint)) {
    out[season as Season] = {
      rgb: { r: preset.r, g: preset.g, b: preset.b },
      overlayAlpha: preset.overlayAlpha,
      provisional: false,
    };
  }
  return out as SeasonTintTable;
}

/**
 * ⚠ NOT READ BY ANYTHING BY DEFAULT, AND NOT A SECOND HOME FOR THE HUES.
 *
 * These four were the placeholder art direction while `balance.seasonTint` did not exist: the tint
 * equivalent of the flat labelled rectangles the art lane uses for unbuilt sprites, flagged
 * `provisional: true` so nothing downstream could mistake them for a tuned value. The group exists
 * now (core/types.ts `Balance`, core/schemas.ts `zBalance`, data/balance.json), {@link
 * seasonTintTable} reads it, and every default in this file points there — so the shipped picture
 * comes from balance.json and a retune of a hue is an edit to that file alone (INV-3).
 *
 * The constant survives ONLY as the fixture the season-tint suite passes EXPLICITLY, to exercise
 * the missing-preset and unreachable-extra paths and the `provisional` flag itself. Retuning it
 * changes no pixel the player sees. It should be deleted together with the assertions in
 * `tests/unit/year-turn-ux.test.ts` that construct tables out of it.
 */
export const PROVISIONAL_SEASON_TINTS: SeasonTintTable = {
  spring: { rgb: { r: 198, g: 232, b: 178 }, overlayAlpha: 0.1, provisional: true },
  summer: { rgb: { r: 255, g: 224, b: 160 }, overlayAlpha: 0.12, provisional: true },
  autumn: { rgb: { r: 226, g: 150, b: 76 }, overlayAlpha: 0.18, provisional: true },
  winter: { rgb: { r: 150, g: 186, b: 226 }, overlayAlpha: 0.22, provisional: true },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Reading a tint
 * ──────────────────────────────────────────────────────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Pack 0–255 channels into the 0xRRGGBB integer Phaser's tint takes. */
export function packRgb(rgb: SeasonTintRgb): number {
  const r = clamp(Math.round(rgb.r), 0, CHANNEL_MAX);
  const g = clamp(Math.round(rgb.g), 0, CHANNEL_MAX);
  const b = clamp(Math.round(rgb.b), 0, CHANNEL_MAX);
  return (r << 16) | (g << 8) | b;
}

/**
 * Presets in the table that `balance.clock.seasonOrder` will never ask for, sorted.
 *
 * Harmless by construction — nothing can reach them — so they are REPORTED rather than thrown on.
 * See {@link assertCoversSeasonOrder} for why that distinction is load-bearing.
 */
export function unreachableSeasonPresets(table: SeasonTintTable, balance: Balance): string[] {
  const order = balance.clock.seasonOrder;
  return Object.keys(table)
    .filter((key) => !order.includes(key as Season))
    .sort();
}

/** One warning per distinct (extra presets × season order), so a per-frame caller cannot spam. */
const warnedUnreachable = new Set<string>();

function warnUnreachable(table: SeasonTintTable, balance: Balance): void {
  const extra = unreachableSeasonPresets(table, balance);
  if (extra.length === 0) return;
  const key = `${extra.join(",")}|${balance.clock.seasonOrder.join(",")}`;
  if (warnedUnreachable.has(key)) return;
  warnedUnreachable.add(key);
  console.warn(
    `[season-tint] ${String(extra.length)} preset(s) balance.clock.seasonOrder never asks for: ` +
      `${extra.join(", ")} — the map is tinted correctly for every season it does ask for`,
  );
}

/**
 * The table must cover every season the clock will ask for — `balance.clock.seasonOrder`.
 *
 * ⚠ ONLY A MISSING PRESET THROWS, and the asymmetry is deliberate. A missing season is a season the
 * map renders untinted with no warning, so it is worth failing on. An EXTRA preset is one nothing
 * can ever reach: it changes no pixel. Throwing on it turned a legal balance-only retune into a
 * fatal — measured, shrinking `clock.seasonOrder` from four seasons to three made `seasonTint`
 * throw, and `game/mapview.ts` calls it from `MapView`'s constructor, so the overworld could not be
 * BUILT after a retune the season meter followed correctly. INV-3 says a retune touches
 * data/balance.json only; it must not need this file edited in the same change. The extras are
 * reported by {@link unreachableSeasonPresets} and warned about once.
 */
export function assertCoversSeasonOrder(table: SeasonTintTable, balance: Balance): void {
  for (const season of balance.clock.seasonOrder) {
    if (!table[season]) {
      throw new SeasonTintError(
        `season tint table has no preset for "${season}", which balance.clock.seasonOrder contains`,
      );
    }
  }
  warnUnreachable(table, balance);
}

/** bible §12a season preset, from data/balance.json (G11 — never a literal here). */
export function seasonBrightness(balance: Balance, season: Season): number {
  const value = balance.audio.seasonBrightness[season];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SeasonTintError(
      `balance.audio.seasonBrightness.${season} is ${String(value)}, not a finite number`,
    );
  }
  return value;
}

/**
 * bible §12a — "Year aging progressively darkens … so Hearthollow year 5 sounds like a memory of
 * year 1". Linear in the years elapsed since `balance.clock.startYear`, at
 * `balance.audio.yearDarkenPerYear` a year.
 *
 * Year 1 is 1.0 by construction: the first year is the reference the later ones are read against.
 *
 * ⚠ IT SATURATES, AND IT HAS TO. The ramp was written against a six-year game and only ever
 * needed to reach year 6 (1 − 0.08×5 = 0.60). The calendar is unbounded now, and a linear ramp
 * clamped only at 0 reaches **pure black at year 13.5** — the painted maps would go out entirely for
 * a player who takes their time, which is a supported way to play. So the ELAPSED term saturates at
 * the expected pacing (`balance.clock.yearsTotal`), exactly as the year-variant art does under
 * build-doc §9.5: a year-20 Hearthollow is lit like a year-6 Hearthollow, because year 6 is the
 * oldest reading the ramp was ever given. Years 1–6 are byte-identical to before.
 */
export function yearDarkening(balance: Balance, year: number): number {
  const elapsed = Math.max(0, year - balance.clock.startYear);
  const deepest = Math.max(0, balance.clock.yearsTotal - 1);
  return clamp(1 - balance.audio.yearDarkenPerYear * Math.min(elapsed, deepest), 0, 1);
}

/**
 * The season's HUE: the preset scaled so its brightest channel is exactly 255.
 *
 * `setTint` is a MULTIPLY against the painted map, so 255 means "leave this channel alone" and any
 * channel below it darkens. An authored preset like winter's (150, 186, 226) therefore carries two
 * things at once — a blue cast AND a 26% dimming nobody asked for. Splitting them out is what makes
 * `brightness` and `yearDarkening` mean what balance.json says they mean: after this, a reading's
 * brightest channel is `255 × scale` and nothing else touches it.
 *
 * A preset of all zeroes has no hue to normalise and is returned unchanged (it is black at every
 * brightness), rather than dividing by zero.
 */
export function hueOf(rgb: SeasonTintRgb): SeasonTintRgb {
  const peak = Math.max(rgb.r, rgb.g, rgb.b);
  if (peak <= 0) return { r: 0, g: 0, b: 0 };
  const k = CHANNEL_MAX / peak;
  return { r: rgb.r * k, g: rgb.g * k, b: rgb.b * k };
}

/**
 * The season reading for (season, year).
 *
 * ⚠ WHY THIS IS NOT `preset × brightness × yearDarkening`. Three things went wrong with that, all of
 * them measured against the shipped balance.json before this was written:
 *
 *  1. **The preset is itself a multiplier**, so the authored dimming stacked on top of the two the
 *     spec names. Winter at year 6 came out at rgb(68, 84, 102) — 27% of the painted map's own
 *     brightness — where the two stated terms (0.75 × 0.60) ask for 45%. Fixed by splitting the
 *     preset into a hue ({@link hueOf}) and letting `scale` carry all of the luminance.
 *  2. **`brightness > 1` cannot brighten a multiply.** `seasonBrightness.summer = 1.15` pushed r
 *     255→293 and g 224→258; both clamped, turning a 255:224 red:green ratio into 1:1 — a hue
 *     change dressed up as a brightening. There is no colour that makes `setTint` draw the map
 *     brighter than it was painted, so the surplus is spent the only way it can be: moving the hue
 *     TOWARD white, i.e. taking the season's cast off the picture. bible §12a's "summer:
 *     +brightness" reads on screen as "summer is the season the map is least tinted".
 *  3. Nothing checked the table covered `balance.clock.seasonOrder` on this path — only the preview
 *     path did — so retuning seasonOrder could leave a season with no preset and no warning. The
 *     check throws for a MISSING preset only; an extra one is warned about (see
 *     {@link assertCoversSeasonOrder}, and the fatal-on-a-legal-retune defect it records).
 *
 * `table` defaults to {@link seasonTintTable}`(balance)` — i.e. `balance.seasonTint`, the group
 * this file's header used to say did not exist. It stays a PARAMETER rather than a lookup so a
 * caller (a preview screen, a test exercising the missing-preset path) can ask about a table that
 * is not the shipped one without the shipped path growing a branch.
 */
export function seasonTint(
  balance: Balance,
  season: Season,
  year: number,
  table: SeasonTintTable = seasonTintTable(balance),
): SeasonTint {
  // (3) — the live path is checked exactly as the preview path is. seasonOrder is a tunable (INV-3)
  // and a retune of it must not silently degrade the picture at the frame that needed it.
  assertCoversSeasonOrder(table, balance);
  const preset = table[season];
  if (!preset) {
    throw new SeasonTintError(`season tint table has no preset for "${season}"`);
  }
  const brightness = seasonBrightness(balance, season);
  const darkening = yearDarkening(balance, year);
  const hue = hueOf(preset.rgb);

  // (2) — above 1.0 the surplus desaturates toward white; at or below 1.0 it dims, which a multiply
  // can do. `scale` is the honest luminance either way, and it is what `rgb`'s peak channel equals.
  const toWhite = clamp(brightness - 1, 0, 1);
  const scale = Math.min(brightness, 1) * darkening;
  const lit = (channel: number): number =>
    clamp(Math.round((channel + (CHANNEL_MAX - channel) * toWhite) * scale), 0, CHANNEL_MAX);

  const rgb: SeasonTintRgb = { r: lit(hue.r), g: lit(hue.g), b: lit(hue.b) };
  return {
    season,
    year,
    base: { ...preset.rgb },
    hue: { r: Math.round(hue.r), g: Math.round(hue.g), b: Math.round(hue.b) },
    rgb,
    color: packRgb(rgb),
    brightness,
    yearDarkening: darkening,
    scale,
    overlayAlpha: preset.overlayAlpha,
    provisional: preset.provisional,
  };
}

/** The reading for the clock's current position — the overworld's one call per season change. */
export function seasonTintForClock(
  clock: ClockState,
  balance: Balance,
  table: SeasonTintTable = seasonTintTable(balance),
): SeasonTint {
  return seasonTint(balance, seasonOf(clock, balance), clock.year, table);
}

/** All four readings for one year, in `balance.clock.seasonOrder` — what a preview screen shows. */
export function seasonTintsForYear(
  balance: Balance,
  year: number,
  table: SeasonTintTable = seasonTintTable(balance),
): SeasonTint[] {
  assertCoversSeasonOrder(table, balance);
  return balance.clock.seasonOrder.map((season) => seasonTint(balance, season, year, table));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Applying it
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The slice of a Phaser game object this module touches. Structural on purpose: the module stays
 * engine-free (so tests can reach it in node), and a caller can hand it the painted-map `Image`, a
 * container, or a fake.
 */
export interface TintTarget {
  setTint(color: number): unknown;
}

/** The optional overlay pass — a full-screen rectangle above the map, below the HUD. */
export interface OverlayTarget {
  setFillStyle(color: number, alpha?: number): unknown;
}

/** Tint the painted map. One call per season change, not per frame. */
export function applySeasonTint(target: TintTarget, tint: SeasonTint): void {
  target.setTint(tint.color);
}

/** Colour the optional overlay rectangle at the preset's strength. */
export function applySeasonOverlay(target: OverlayTarget, tint: SeasonTint): void {
  target.setFillStyle(packRgb(tint.base), tint.overlayAlpha);
}

/**
 * A short readout for the HUD and for screenshots of the demo: season, year, and the two magnitudes
 * the reading was built from. Numbers only (G7).
 */
export function seasonTintLabel(tint: SeasonTint): string {
  const brightness = tint.brightness.toFixed(2);
  const darkening = tint.yearDarkening.toFixed(2);
  const scale = tint.scale.toFixed(2);
  return `${tint.season} y${tint.year} · brightness ${brightness} · year ${darkening} · ${scale}`;
}
