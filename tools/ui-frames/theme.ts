/**
 * tools/ui-frames/theme.ts — which palette ROLE every pixel of a frame is painted with.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ────────────────────────────────────────
 * No hex literal appears anywhere in this lane. Every colour is a {@link UiSwatchRole} resolved
 * through `game/ui/Palette.ts`, which resolves it through `data/palette.json`. That is not
 * ceremony: `game/ui/Palette.ts`'s own header records that the T-15 re-freeze moved all 32 hex
 * values while leaving the ids byte-identical, and turned `text` from a 17.5 : 1 cream into a
 * 2.89 : 1 green without one character of UI code changing. A frame PNG baked from hexes would
 * survive the next re-freeze the same way — silently, and wrong.
 *
 * So `npx tsx tools/ui-frames/render.ts` after a re-freeze regenerates six correct frames. A frame
 * generator that hard-coded #74564e would regenerate six wrong ones and report success.
 *
 * TWO POLARITIES, AND WHY BOTH ARE BUILT
 * ──────────────────────────────────────
 * Gold's text box is a WHITE plate with BLACK ink. This build is dark-plate / light-ink everywhere
 * (`menu-model.ts` `UI_SWATCH_ID.bg = c00`; `Palette.ts` `UI_SWATCH.panel = c06`), and
 * `Palette.ts`'s header states that as a decision, taken when the battle screen was un-inverted.
 * Those two facts are in direct tension and the tension is the central design question of this
 * lane, so it is not resolved by assertion here: both are generated, both are put in front of real
 * text at real size, and `SPEC.md` records the judgement and its cost.
 *
 * {@link DARK} costs the code lane nothing — every role it names is already in `UI_SWATCH` and
 * already measured by `tests/gates/ui-contrast-contract.test.ts`. {@link LIGHT} needs the ink
 * ladder re-picked, which is Hank's call and not this lane's.
 */

import { UI_SWATCH, roleHex, roleContrast, type UiSwatchRole } from "../../game/ui/Palette.ts";
import { swatchHex } from "../../game/ui/Palette.ts";

/**
 * Every element a frame can paint, as a role name. `null` means "leave it the fill colour".
 *
 * THE RINGS ARE NAMED BY POSITION, NOT BY VALUE, and that is the whole reason the two polarities
 * can share one drawing routine. Gold's box is a DARK line around a LIGHT field. On a light plate
 * that is literally what {@link LIGHT} does. On a dark plate it is impossible: the field behind
 * every panel in this build is `void` (c00), so a `void` outer line on it measures 1.00 : 1 and the
 * box has no outer edge at all. {@link DARK} therefore inverts the pair — a light rim, a dark line
 * inside it — which reads perfectly well and does not read as Gold. That is a finding, not a
 * compromise, and it is the strongest single argument in SPEC.md for the light polarity.
 */
export interface FrameTheme {
  readonly id: string;
  /** The ring against the FIELD. Gold's hard keyline (EVAL-STANDARD §2, "keyline: hard"). */
  readonly outerLine: UiSwatchRole;
  /** The ring against the FILL. `null` collapses the frame to a single line. */
  readonly innerLine: UiSwatchRole | null;
  /** The plate the text sits on. Flat — never a gradient, never a dither under type. */
  readonly fill: UiSwatchRole;
  /** A horizontal separator between bands (header rule, footer rule, column-header rule). */
  readonly rule: UiSwatchRole;
  /** The keyline around a sunken well (the portrait recess, the table recess). */
  readonly recessLine: UiSwatchRole;
  /** The well's own fill — darker than the plate under DARK, lighter-but-duller under LIGHT. */
  readonly recessFill: UiSwatchRole;
  /** The lit pixel of the recess's ordered dither, so an empty slot reads as empty. */
  readonly recessDither: UiSwatchRole;
  /** Primary ink, for the contact sheet's real-text overlay. Not baked into the PNG. */
  readonly ink: UiSwatchRole;
  /** Secondary ink (detail column, HP readout, footer hints). */
  readonly inkMuted: UiSwatchRole;
  /** A refused row's ink. Must measure DIMMER than `ink` — the gate's `inactive` tier. */
  readonly inkDim: UiSwatchRole;
  /** The one highlight — the advance marker, the cursor glyph, the wordmark. */
  readonly accent: UiSwatchRole;
}

/**
 * The polarity the build already is. Every role below is in the shipped `UI_SWATCH`, already
 * carries a measured ratio in `Palette.ts`'s ladder, and is already enumerated by
 * `tests/gates/ui-contrast-contract.test.ts`. Implementing against this costs zero palette work.
 */
export const DARK: FrameTheme = {
  id: "dark",
  // INVERTED, and it has to be. `void` on the `void` field is 1.00 : 1 — a black keyline on a black
  // screen is not an edge. `border` reads 10.95 : 1 there, so the light ring goes outside and the
  // dark one inside. The cost is that the box stops being a Gold box and becomes a raised bevel.
  outerLine: "border",
  innerLine: "void",
  fill: "panel",
  rule: "border",
  recessLine: "void",
  recessFill: "void",
  recessDither: "border",
  ink: "text",
  inkMuted: "textMuted",
  inkDim: "textDisabled",
  accent: "accent",
};

/**
 * The polarity Gold actually is: a near-white plate with near-black ink.
 *
 * Every role named here ALSO already exists — `cursor` is the light selection bar and
 * `cursorInk`/`cursorInkMuted`/`cursorInkDim` are the ink ladder already measured against it
 * (15.74 : 1, 5.82 : 1, 5.68 : 1). So this is not a new palette; it is the existing light-surface
 * ladder used as a plate instead of as a one-row bar.
 *
 * WHAT IT COSTS, stated plainly because SPEC.md has to carry it: if the plate becomes `cursor`,
 * then `text` (c03) on the plate is 1 : 1 and the whole `text`/`textMuted`/`textDisabled`/`status`
 * group has to be re-picked dark, and the menu's selection bar can no longer be a light bar — it
 * becomes the ▶ glyph Gold actually uses, which `MenuScene.ListMenu` already draws.
 */
export const LIGHT: FrameTheme = {
  id: "light",
  outerLine: "void",
  innerLine: "panel",
  fill: "cursor",
  // `border` (c12) is the natural hairline but reads 1.75 : 1 on a near-white plate — a rule nobody
  // can see is a rule that is not there. `panel` at 6.15 : 1 is the palette's mid step.
  rule: "panel",
  recessLine: "void",
  recessFill: "border",
  recessDither: "panel",
  ink: "cursorInk",
  inkMuted: "cursorInkMuted",
  inkDim: "cursorInkDim",
  // THE GOLD ACCENT DOES NOT SURVIVE A LIGHT PLATE. `accent` (c16 #f8d80f) measures 1.32 : 1 on
  // `cursor`, and the palette holds no other saturated swatch above the 4.5 : 1 a marker glyph
  // needs there. Gold does not need one either: its box cursor is a black ▶ and its advance mark a
  // black ▼. So on a light plate the highlight is WEIGHT and POSITION, not hue — and the gold stays
  // where it already earns its 14.51 : 1, over the dark field (the crit flash, the catch burst, the
  // title wordmark). This is `Palette.ts`'s own "one role must not do two jobs", one surface later.
  accent: "cursorInk",
};

export const THEMES: readonly FrameTheme[] = [DARK, LIGHT];

/** `"#rrggbb"` for a frame role, straight out of the shipped palette. */
export function themeHex(theme: FrameTheme, key: keyof FrameTheme): string {
  const role = theme[key];
  if (role === null) return themeHex(theme, "fill");
  if (typeof role !== "string") throw new Error(`tools/ui-frames: ${String(key)} is not a role`);
  if (key === "id") throw new Error("tools/ui-frames: `id` is a name, not a role");
  return roleHex(role as UiSwatchRole);
}

/**
 * A ROLE THE LIGHT POLARITY NEEDS AND `UI_SWATCH` DOES NOT HAVE.
 *
 * {@link LIGHT} takes its refused-row ink from `cursorInkDim` (`c19`, #2d6f38) because that is the
 * role already measured against a `cursor` surface — 5.68 : 1, comfortably legible. Legible is not
 * the test. `c19` is a GREEN, and on a cream plate a green row reads as *marked*, not as *shut*:
 * on the contact sheet BAG and QUESTS are the two most eye-catching rows in the session menu, which
 * is the exact inversion `game/ui/Palette.ts`'s header was written about, one hue later.
 *
 * Measured, every swatch that sits in the band a dim role must occupy on a `c03` plate — at or above
 * the gate's `inactive` floor of 3 : 1, and below `cursorInkMuted`'s 5.82 : 1 so the ladder does not
 * invert:
 *
 *   c20 #6a9827  3.19   green      c25 #399985  3.22   teal
 *   c09 #aa7241  3.77   WARM MID   c28 #2178bb  4.38   blue
 *   c08 #c72a1b  5.18   red        c19 #2d6f38  5.68   green (the current pick)
 *
 * One of the seven is not a hue. `c09` is the only neutral in the band, and a greyed row wants to be
 * a neutral — that is what "greyed" means. So this lane recommends it and says what it costs:
 * `c09` is ALREADY `danger` in `game/menu-model.ts` and `inkCollapsed` in `game/survey-view.ts`, so
 * one swatch would carry "this failed", "this line collapsed" and "this row is shut". Those are
 * three different sentences and `Palette.ts`'s header is explicit that one role must not do two
 * jobs. It is therefore a QUESTION for Hank, not a change this lane may make — the alternative being
 * that the class-equal fit has no second neutral in the band and the palette would need one.
 */
export const PROPOSED_PLATE_INK_DIM = {
  swatchId: "c09",
  ratioOnPlate: 3.77,
  collidesWith: ["game/menu-model.ts UI_SWATCH_ID.danger", "game/survey-view.ts SCREEN_SWATCH_ID.inkCollapsed"],
} as const;

/** `"#rrggbb"` for {@link PROPOSED_PLATE_INK_DIM}. */
export function proposedInkDimHex(): string {
  return swatchHex(PROPOSED_PLATE_INK_DIM.swatchId);
}

/**
 * The SIGN CARD's wood, which the UI role table has no name for — and should not.
 *
 * `ui-sign-card-frame` is the odd row of the six: it is a WORLD prop (`core/types.ts`
 * `PROP_KINDS[sign-card]`, bible §5 — sign cards flag a migrant dormant or migrating), composited
 * into a painted map, not a screen the player opens. Painting it from `UI_SWATCH.panel` would make
 * it read as a menu that had fallen over in a field, which is the one thing a diegetic prop must
 * not do.
 *
 * These are therefore PROPOSED roles, named here and nowhere else, with the swatch ids written
 * down so the code lane can lift them into a table if Hank wants them. They are the palette's own
 * wood band — `c05`/`c09`/`c10` are the three browns the class-equal fit produced — plus `c15` for
 * the pale carved face, which is the same swatch `UI_SWATCH.textMuted` names.
 */
export const SIGN_SWATCH_ID = {
  /** The hard keyline. Same swatch as `UI_SWATCH.void`; a prop's outline is the game's outline. */
  keyline: "c00",
  /** The shadowed side of the carve — bottom and right. */
  woodDark: "c05",
  /** The plank body. */
  wood: "c09",
  /** The lit side of the carve — top and left. */
  woodLight: "c10",
  /** The recessed face the sign's words are cut into. */
  face: "c15",
} as const;

export type SignSwatchRole = keyof typeof SIGN_SWATCH_ID;

export function signHex(role: SignSwatchRole): string {
  return swatchHex(SIGN_SWATCH_ID[role]);
}

/**
 * Every pairing this lane introduces, with its measured ratio — printed by `render.ts` and copied
 * into SPEC.md.
 *
 * IT IS NOT A GATE, AND SAYS SO. `tests/gates/ui-contrast-contract.test.ts` derives ROLES from the
 * live tables but hard-codes which SURFACE each role sits on (`SPECS.surfaces`), and
 * `UI_SWATCH_ID` — the menu table — declares no surfaces at all, i.e. every menu role is assumed
 * to be drawn on the void. Putting a plate behind the menus is exactly the case that gate does not
 * cover. So this list is the hand-off: each row is a `Surface` entry the code lane must ADD to the
 * gate when it lands the frames, or the gate stays green over a pairing nothing measured.
 */
export interface Pairing {
  readonly what: string;
  readonly foreground: UiSwatchRole;
  readonly background: UiSwatchRole;
  /**
   * The gate's tier: `text` floors at 4.5, `inactive` at 3, `mark` at 3, `plate` at 1.1.
   *
   * `edge` is this lane's own, and floors at 1.0 — i.e. it never fails, and is reported for the
   * reading only. It exists for exactly one pairing: the outer ring against the field. Under LIGHT
   * that is `void` on `void`, 1.00 : 1, and it is CORRECT — Gold's black keyline over a dark scene
   * merges into it and the near-white plate carries the whole edge at 19.15 : 1. Scoring that as a
   * failure would be a metric getting worse while the picture got better, which is the one thing
   * EVAL-STANDARD's rule zero forbids. The pairing that must clear 3 : 1 is `plate on the field`.
   */
  readonly kind: "text" | "inactive" | "mark" | "plate" | "edge";
}

export function framePairings(theme: FrameTheme): Pairing[] {
  const out: Pairing[] = [
    // THE EDGE AGAINST THE FIELD is the `mark` — the pairing that decides whether the box has an
    // outline at all. Under LIGHT the plate itself carries it (19.15 : 1) and the `void` outer ring
    // merges into the `void` field, which is correct and is what Gold looks like over a dark scene.
    // Under DARK the plate carries only 3.12 : 1 and the light outer ring carries the rest.
    { what: "plate on the field", foreground: theme.fill, background: "void", kind: "mark" },
    { what: "outer line on the field", foreground: theme.outerLine, background: "void", kind: "edge" },
    { what: "outer line on the plate", foreground: theme.outerLine, background: theme.fill, kind: "mark" },
    { what: "primary ink on the plate", foreground: theme.ink, background: theme.fill, kind: "text" },
    { what: "muted ink on the plate", foreground: theme.inkMuted, background: theme.fill, kind: "text" },
    { what: "refused ink on the plate", foreground: theme.inkDim, background: theme.fill, kind: "inactive" },
    { what: "accent on the plate", foreground: theme.accent, background: theme.fill, kind: "text" },
    { what: "rule on the plate", foreground: theme.rule, background: theme.fill, kind: "mark" },
    { what: "recess fill in the plate", foreground: theme.recessFill, background: theme.fill, kind: "plate" },
    { what: "recess dither on the recess", foreground: theme.recessDither, background: theme.recessFill, kind: "mark" },
  ];
  if (theme.innerLine !== null) {
    out.push({ what: "inner line on the plate", foreground: theme.innerLine, background: theme.fill, kind: "mark" });
    out.push({ what: "inner line on the outer line", foreground: theme.innerLine, background: theme.outerLine, kind: "mark" });
  }
  return out;
}

/** The gate's own floors, restated so `render.ts` can report a pass/fail without importing a test. */
export const FLOOR: Record<Pairing["kind"], number> = {
  text: 4.5,
  inactive: 3,
  mark: 3,
  plate: 1.1,
  /** Reported, never enforced — see `Pairing.kind`. */
  edge: 1,
};

export interface PairingReading extends Pairing {
  readonly ratio: number;
  readonly floor: number;
  readonly clears: boolean;
  readonly foregroundId: string;
  readonly backgroundId: string;
}

export function measure(pairing: Pairing): PairingReading {
  const ratio = roleContrast(pairing.foreground, pairing.background);
  const floor = FLOOR[pairing.kind];
  return {
    ...pairing,
    ratio,
    floor,
    clears: ratio >= floor,
    foregroundId: UI_SWATCH[pairing.foreground],
    backgroundId: UI_SWATCH[pairing.background],
  };
}
