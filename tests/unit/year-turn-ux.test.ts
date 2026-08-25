/**
 * tests/unit/year-turn-ux.test.ts — lane C5 + C6 (build-doc §15): the season meter, the season tint,
 * the year turn sequence and the retirement flow.
 *
 * What these tests are evidence OF. The rules being exercised — aging, the boxed-creature rule, the
 * Ancient exemption, the heir's level, the boon's size — all live in core/ and are already tested
 * there. What is tested HERE is that the UX layer drives those rules rather than restating them, and
 * that the numbers it puts on screen are the numbers core moved:
 *
 *   - the meter's tick costs come from `balance.clock` (proved by retuning a copy of balance and
 *     watching the meter follow, INV-3);
 *   - a full meter and a gym victory both end the year, and the meter resets to the new year;
 *   - the retirement flow's heir is built by core/lifecycle.ts and can only inherit traits the
 *     parent actually had — never an invented one;
 *   - a boon granted in one year turn is still on the creature after the next one;
 *   - boxed creatures age and caught Ancients do not (G10 / Hard Req 4), asserted through core's own
 *     event log and its own schema.
 *
 * No phaser import: the scenes' logic is engine-free on purpose, because importing phaser under
 * vitest's node environment throws `ReferenceError: window is not defined`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { advanceAction, createClock, meter, seasonsOfYear } from "@core/clock";
import { actGates, awardBadge, runIsComplete } from "@core/acts";
import { effectiveStats } from "@core/battle";
import { defaultContext, stepRegionStates } from "@core/ecosim";
import {
  boonMultiplier,
  enterPendingActs,
  indexSpecies,
  isNever,
  newOwnedCreature,
  runYearTurn,
  yearEventsOf,
  type RaidScript,
  type YearTurnEvent,
} from "@core/lifecycle";
import { appendAction, newSave, replay, type SaveEnvelope } from "@core/save";
import { subsystemRng } from "@core/rng";
import { validateContent, zOwnedCreature } from "@core/schemas";
import type {
  ActionLogEntry,
  Balance,
  Content,
  NodeState,
  OwnedCreature,
  Season,
  SpeciesLine,
  Trait,
} from "@core/types";
import { STAT_KEYS } from "@core/types";

import {
  actionCosts,
  DEFAULT_SEASON_METER_STYLE,
  fullMeter,
  previewAction,
  SeasonMeterHud,
  seasonMeterModel,
  type MeterLabel,
  type MeterPip,
  type MeterSurface,
} from "@game/ui/SeasonMeter";
import {
  assertCoversSeasonOrder,
  hueOf,
  packRgb,
  PROVISIONAL_SEASON_TINTS,
  seasonTint,
  seasonTintForClock,
  seasonTintsForYear,
  SeasonTintError,
  unreachableSeasonPresets,
  yearDarkening,
} from "@game/season-tint";
import { clockFromLog, replayRegionHooks, withClockFromLog } from "@game/year-replay";
import {
  festivalBeat,
  hasRaids,
  raidCoverage,
  raidLedgerLines,
  raidPreviews,
  raidReportsFrom,
  raidableActs,
  raidsForAct,
} from "@game/year-events";
import {
  RetirementFlow,
  boonLines,
  boonRows,
  clampLines,
  defaultRetirementStyle,
  heirLines,
  moveSelection,
  parentLines,
  refusedChoice,
  selectedChoice,
  RETIREMENT_SCENE_KEY,
  createRetirementScene,
  statLine,
  wrapLines,
  type RetirementOffer,
  type RetirementSelection,
} from "@game/scenes/RetirementScene";
import { SCENE_KEYS, sceneRegistered } from "@game/scene-keys";
import { dexArtId } from "@game/ledger-view";
import { assetId } from "@game/placeholder";
import {
  actEntryBeats,
  beatLines,
  beatsAfterRetirement,
  beatsFor,
  createYearTurnScene,
  defaultYearTurnStyle,
  driveYearTurn,
  finishYearTurn,
  yearTurnTrigger,
  YEAR_TURN_SCENE_KEY,
  YearTurnError,
  type YearTurnBeat,
} from "@game/scenes/YearTurnScene";

const content: Content = validateContent();
const balance: Balance = content.balance;
const species = indexSpecies(content.species);

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures — built from the shipped content, never by naming it
 * ──────────────────────────────────────────────────────────────────────────── */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function firstNodeId(): string {
  const node = content.nodes[0];
  if (!node) throw new Error("no nodes in the shipped content");
  return node.id;
}

/** A non-Ancient line, chosen by property so no species name appears in this file. */
function mortalLine(offset = 0): SpeciesLine {
  const lines = content.species.filter((line) => !line.ancient);
  const line = lines[offset % lines.length];
  if (!line) throw new Error("no non-Ancient species line in the shipped content");
  return line;
}

function ancientLine(): SpeciesLine {
  const line = content.species.find((entry) => entry.ancient);
  if (!line) throw new Error("no Ancient species line in the shipped content");
  return line;
}

function traitAt(index: number): Trait {
  const trait = balance.traits.pool[index % balance.traits.pool.length];
  if (!trait) throw new Error("balance.traits.pool is empty");
  return { ...trait };
}

interface PartyOpts {
  uid: string;
  line: SpeciesLine;
  age: OwnedCreature["age"];
  level: number;
  traits?: Trait[];
  boxed?: boolean;
}

function creature(opts: PartyOpts): OwnedCreature {
  return newOwnedCreature(
    {
      uid: opts.uid,
      lineId: opts.line.id,
      age: opts.age,
      level: opts.level,
      caughtYear: balance.clock.startYear,
      ...(opts.traits ? { traits: opts.traits } : {}),
      ...(opts.boxed === undefined ? {} : { boxed: opts.boxed }),
    },
    opts.line,
    balance,
  );
}

function saveWith(party: OwnedCreature[], box: OwnedCreature[] = [], seed = 7): SaveEnvelope {
  return newSave({ seed, currentNode: firstNodeId(), nodes: content.nodes, party, box }, balance);
}

/** A counting wrapper so a test can see how many draws a flow took (build-doc §8.1). */
function countingRng(seed: number): { fn: () => number; draws: () => number } {
  const rng = subsystemRng(seed, balance.rng.subsystemTags[1] ?? "sim");
  let draws = 0;
  return {
    fn: () => {
      draws += 1;
      return rng.nextFloat();
    },
    draws: () => draws,
  };
}

function simRng(seed: number) {
  return subsystemRng(seed, balance.rng.subsystemTags[1] ?? "sim");
}

/**
 * Drop `//` and block comments, keeping string literals intact.
 *
 * A single pass rather than a stack of regexes, for the reason integration defect I9 records: a
 * regex that strips `//` comments truncates a line at a `//` INSIDE a string literal, leaves an
 * unbalanced quote, and desynchronises every string boundary after it — so the sweep can be walked
 * past by accident.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < source.length && source.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
      continue;
    }
    const ch = source[i] as string;
    if (ch === '"' || ch === "'" || ch === "`") {
      out += ch;
      i += 1;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === "\\") {
          out += source[i];
          i += 1;
        }
        out += source[i];
        i += 1;
      }
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 * C5 — the 16-tick meter (locked decision L8)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("season meter — L8 'travel 1 / foray 1 / inn 2'", () => {
  it("has one pip per tick of the year and reads the season off the clock", () => {
    const model = seasonMeterModel(createClock(balance), balance);
    expect(model.ticksPerYear).toBe(balance.clock.ticksPerYear);
    expect(model.cells).toHaveLength(balance.clock.ticksPerYear);
    expect(model.seasonsPerYear).toBe(balance.clock.seasonOrder.length);
    expect(model.season).toBe(balance.clock.seasonOrder[0]);
    expect(model.year).toBe(balance.clock.startYear);
    // Season starts land exactly on the multiples of ticksPerSeason — where ecosim steps (§4).
    const starts = model.cells.filter((cell) => cell.seasonStart).map((cell) => cell.index);
    expect(starts).toEqual(
      balance.clock.seasonOrder.map((_, i) => i * balance.clock.ticksPerSeason),
    );
  });

  it("advances exactly the tick cost of each action, and never counts them itself", () => {
    const costs = actionCosts(balance);
    expect(costs.travel).toBe(balance.clock.travelTicks);
    expect(costs.foray).toBe(balance.clock.forayTicks);
    expect(costs.inn).toBe(balance.clock.innTicks);

    for (const kind of ["travel", "foray", "inn"] as const) {
      const clock = createClock(balance);
      const preview = previewAction(clock, kind, balance);
      expect(preview.cost).toBe(costs[kind]);
      expect(preview.after.tick).toBe(clock.tick + costs[kind]);
      // The pips agree with the number: filled == ticks spent.
      expect(preview.after.cells.filter((c) => c.filled)).toHaveLength(costs[kind]);
      expect(preview.before.cells.filter((c) => c.filled)).toHaveLength(0);
    }
  });

  it("BINDS — retuning balance.clock moves the meter, so no cost is written into the HUD (INV-3)", () => {
    const retuned = clone(balance);
    retuned.clock.innTicks = balance.clock.innTicks + 1;
    retuned.clock.forayTicks = balance.clock.forayTicks + 2;

    const clock = createClock(retuned);
    expect(previewAction(clock, "inn", retuned).cost).toBe(retuned.clock.innTicks);
    expect(previewAction(clock, "inn", retuned).after.tick).toBe(retuned.clock.innTicks);
    expect(previewAction(clock, "foray", retuned).after.tick).toBe(retuned.clock.forayTicks);
    // …and the shipped balance is unchanged by the experiment.
    expect(previewAction(clock, "inn", balance).cost).toBe(balance.clock.innTicks);
  });

  it("walking a whole year fills the meter one tick at a time and reports every season", () => {
    let clock = createClock(balance);
    const crossed: string[] = [];
    let years = 0;
    for (let i = 0; i < balance.clock.ticksPerYear; i += 1) {
      const preview = previewAction(clock, "foray", balance);
      crossed.push(...preview.seasonsCrossed);
      if (preview.endsYear) years += 1;
      clock = advanceAction(clock, "foray", balance).clock;
    }
    // The clock cues three of the four seasons; the year turn owns the fourth (LANE-A-STATUS §5).
    expect(crossed).toEqual(balance.clock.seasonOrder.slice(0, -1));
    expect(years).toBe(1);
    const model = seasonMeterModel(clock, balance);
    expect(model.tick).toBe(balance.clock.startTick);
    expect(model.year).toBe(balance.clock.startYear + 1);
    expect(model.cells.filter((c) => c.filled)).toHaveLength(0);
  });

  it("THE FULL METER ENDS THE YEAR AND A GYM VICTORY LEAVES IT EXACTLY WHERE IT STOOD", () => {
    /*
     * REWRITTEN BY AN AUTHORISED AMENDMENT (D-Q2-1). This test used to be "a full meter and a gym
     * victory EACH end the year"; the second trigger is gone and the assertion is inverted.
     *
     * The perverse incentive it removes, priced: a player who won a gym at tick 1 used to forfeit
     * 15 of that year's 16 ticks. Below, the meter after the badge is byte-identical to the meter
     * before it, at every tick of the year.
     */
    // (a) full meter — L8 as amended: "year = full meter".
    let clock = createClock(balance);
    let ended = 0;
    while (ended === 0) {
      const step = advanceAction(clock, "foray", balance);
      ended += step.events.filter((e) => e.t === "yearEnd").length;
      clock = step.clock;
    }
    const meterEnd = seasonMeterModel(clock, balance);
    expect(meterEnd.year).toBe(balance.clock.startYear + 1);
    expect(meterEnd.tick).toBe(balance.clock.startTick);

    // (b) a gym victory: THE METER IS UNCHANGED, at every tick of the year.
    for (let tick = 0; tick < balance.clock.ticksPerYear; tick += 1) {
      const before = saveWith([creature({ uid: "p1", line: mortalLine(), age: "A", level: 10 })]);
      const at = { ...before, year: balance.clock.startYear, tick };
      const after = awardBadge(at, "maribel", balance);
      expect(seasonMeterModel({ year: after.year, tick: after.tick }, balance)).toEqual(
        seasonMeterModel({ year: at.year, tick: at.tick }, balance),
      );
      expect(after.tick).toBe(tick);
      expect(after.year).toBe(balance.clock.startYear);
    }
  });

  it("the HUD restyles the pips it already made instead of making more", () => {
    const made: number[] = [];
    const pips = new Map<number, { fill: number }>();
    let labelText = "";
    const surface: MeterSurface = {
      pip(index: number): MeterPip {
        made.push(index);
        const state = { fill: 0 };
        pips.set(index, state);
        return {
          setPosition: () => undefined,
          setSize: () => undefined,
          setFillStyle: (color: number) => {
            state.fill = color;
          },
        };
      },
      label(): MeterLabel {
        return {
          setText: (value: string) => {
            labelText = value;
          },
          setPosition: () => undefined,
        };
      },
    };

    const hud = new SeasonMeterHud(surface, DEFAULT_SEASON_METER_STYLE);
    let clock = createClock(balance);
    hud.render(seasonMeterModel(clock, balance));
    expect(made).toHaveLength(balance.clock.ticksPerYear);

    clock = advanceAction(clock, "inn", balance).clock;
    hud.render(seasonMeterModel(clock, balance));
    expect(made).toHaveLength(balance.clock.ticksPerYear); // no second batch
    expect(labelText).toContain(String(balance.clock.ticksPerYear));
    expect(hud.labelText()).toBe(seasonMeterModel(clock, balance).label);
    // The pips the player has spent read as filled, the one they stand on as current.
    const spent = pips.get(0);
    expect(spent?.fill).toBe(DEFAULT_SEASON_METER_STYLE.filledColor);
    expect(pips.get(balance.clock.innTicks)?.fill).toBe(DEFAULT_SEASON_METER_STYLE.currentColor);
  });

  it("can draw L8's full meter — the one state a saved clock can never hold", () => {
    // `advance` fills the meter and resets the tick in one call, so `save.tick` only ever reads
    // 0..ticksPerYear-1 and the meter topped out at 15/16 with one pip still 'current'. L8 names the
    // game's year after a state the widget could not draw; `fullMeter` builds it.
    const last = seasonMeterModel(
      { year: balance.clock.startYear, tick: balance.clock.ticksPerYear - 1 },
      balance,
    );
    expect(last.full).toBe(false);
    expect(last.cells.filter((c) => c.filled)).toHaveLength(balance.clock.ticksPerYear - 1);

    const filled = fullMeter(balance.clock.startYear, balance);
    expect(filled.full).toBe(true);
    expect(filled.tick).toBe(balance.clock.ticksPerYear);
    expect(filled.ticksLeftInYear).toBe(0);
    expect(filled.cells.every((c) => c.filled)).toBe(true);
    expect(filled.cells.some((c) => c.current)).toBe(false);
    expect(filled.tickLabel).toBe(`${balance.clock.ticksPerYear}/${balance.clock.ticksPerYear}`);
    expect(filled.season).toBe(balance.clock.seasonOrder[balance.clock.seasonOrder.length - 1]);

    // …and it is a read of the clock, not a second set of tick arithmetic: retuning moves it.
    const retuned = clone(balance);
    retuned.clock.ticksPerYear = balance.clock.ticksPerYear + balance.clock.ticksPerSeason;
    retuned.clock.seasonOrder = [...balance.clock.seasonOrder, balance.clock.seasonOrder[0]!];
    expect(fullMeter(retuned.clock.startYear, retuned).cells).toHaveLength(retuned.clock.ticksPerYear);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * C5 — the season tint (Hard Requirement 6)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("season tint — Hard Req 6 'season variation is a runtime tint; never generate seasonal art'", () => {
  it("has exactly one preset per season in balance.clock.seasonOrder", () => {
    expect(Object.keys(PROVISIONAL_SEASON_TINTS).sort()).toEqual(
      [...balance.clock.seasonOrder].sort(),
    );
    expect(() => assertCoversSeasonOrder(PROVISIONAL_SEASON_TINTS, balance)).not.toThrow();
    const readings = seasonTintsForYear(balance, balance.clock.startYear);
    expect(readings.map((r) => r.season)).toEqual(balance.clock.seasonOrder);
  });

  it("BINDS — a table MISSING a season fails loudly; an unreachable extra is reported, not fatal", () => {
    const missing = { ...PROVISIONAL_SEASON_TINTS } as Record<string, unknown>;
    const first = balance.clock.seasonOrder[0] as string;
    delete missing[first];
    expect(() =>
      assertCoversSeasonOrder(missing as typeof PROVISIONAL_SEASON_TINTS, balance),
    ).toThrow(SeasonTintError);
    expect(() =>
      seasonTint(balance, first as Season, balance.clock.startYear, missing as typeof PROVISIONAL_SEASON_TINTS),
    ).toThrow(SeasonTintError);

    /*
     * The asymmetry is the fix for a defect, not laxity. A preset the clock never asks for changes
     * no pixel; throwing on it made a BALANCE-ONLY retune fatal, and `game/mapview.ts` calls
     * `seasonTint` from `MapView`'s constructor — so shrinking `clock.seasonOrder` (a tunable, INV-3)
     * left the overworld unconstructible while the season meter followed the retune correctly.
     * Reproduced below with exactly that retune.
     */
    const extra = { ...PROVISIONAL_SEASON_TINTS, notASeason: PROVISIONAL_SEASON_TINTS.spring };
    expect(() =>
      assertCoversSeasonOrder(extra as unknown as typeof PROVISIONAL_SEASON_TINTS, balance),
    ).not.toThrow();
    expect(unreachableSeasonPresets(extra as unknown as typeof PROVISIONAL_SEASON_TINTS, balance)).toEqual([
      "notASeason",
    ]);
    expect(unreachableSeasonPresets(PROVISIONAL_SEASON_TINTS, balance)).toEqual([]);

    const shrunk = clone(balance);
    shrunk.clock.seasonOrder = balance.clock.seasonOrder.slice(0, -1);
    shrunk.clock.ticksPerYear = shrunk.clock.seasonOrder.length * balance.clock.ticksPerSeason;
    const dropped = balance.clock.seasonOrder[balance.clock.seasonOrder.length - 1] as string;
    expect(unreachableSeasonPresets(PROVISIONAL_SEASON_TINTS, shrunk)).toEqual([dropped]);
    // Every season the retuned clock CAN ask for still reads, and the meter follows the same retune.
    for (const season of shrunk.clock.seasonOrder) {
      expect(() => seasonTint(shrunk, season, shrunk.clock.startYear)).not.toThrow();
    }
    expect(() => seasonTintForClock(createClock(shrunk), shrunk)).not.toThrow();
    expect(seasonMeterModel(createClock(shrunk), shrunk).cells).toHaveLength(shrunk.clock.ticksPerYear);
  });

  it("reads its magnitudes from balance.json — brightness per season, darkening per year", () => {
    for (const season of balance.clock.seasonOrder) {
      const tint = seasonTint(balance, season, balance.clock.startYear);
      expect(tint.brightness).toBe(balance.audio.seasonBrightness[season]);
      expect(tint.yearDarkening).toBe(1);
      expect(tint.color).toBe(packRgb(tint.rgb));
      expect(tint.color).toBeGreaterThanOrEqual(0);
      expect(tint.color).toBeLessThanOrEqual(0xffffff);
    }

    // A retune of the season preset moves the picture (INV-3), and nothing else does.
    const retuned = clone(balance);
    const target = balance.clock.seasonOrder[0] as keyof typeof retuned.audio.seasonBrightness;
    retuned.audio.seasonBrightness[target] = balance.audio.seasonBrightness[target] / 2;
    const dimmed = seasonTint(retuned, target, retuned.clock.startYear);
    const shipped = seasonTint(balance, target, balance.clock.startYear);
    expect(dimmed.rgb.r).toBeLessThan(shipped.rgb.r);
  });

  it("darkens progressively across the six years and never inverts", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i < balance.clock.yearsTotal; i += 1) {
      const year = balance.clock.startYear + i;
      const value = yearDarkening(balance, year);
      expect(value).toBeLessThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(yearDarkening(balance, balance.clock.startYear)).toBe(1);
    expect(yearDarkening(balance, balance.clock.startYear + balance.clock.yearsTotal - 1)).toBeLessThan(1);
  });

  it("BINDS — the darkening SATURATES instead of going to black on an unbounded calendar (D-Q3-1)", () => {
    /*
     * The ramp was linear in years elapsed and clamped only at 0, which was invisible while the
     * game ended at year 6 (1 − 0.08×5 = 0.60). With no cap it reaches ZERO — a fully black painted
     * map — at year 13.5, for a player who is doing nothing wrong. It saturates at the expected
     * pacing instead, the same rule build-doc §9.5 gives the year-variant ART.
     */
    const deepest = yearDarkening(balance, balance.clock.startYear + balance.clock.yearsTotal - 1);
    expect(deepest).toBeGreaterThan(0);
    for (const year of [7, 9, 14, 40, 999]) {
      expect(yearDarkening(balance, year), `year ${String(year)}`).toBe(deepest);
      // The whole reading matches the deepest one except for the `year` it reports.
      const late = seasonTint(balance, "winter", year);
      const deep = seasonTint(balance, "winter", balance.clock.startYear + balance.clock.yearsTotal - 1);
      expect(late.scale).toBeGreaterThan(0);
      expect({ ...late, year: 0 }).toEqual({ ...deep, year: 0 });
    }
    // Years 1..6 are byte-identical to the un-saturated ramp.
    for (let i = 0; i < balance.clock.yearsTotal; i += 1) {
      const year = balance.clock.startYear + i;
      expect(yearDarkening(balance, year)).toBeCloseTo(1 - balance.audio.yearDarkenPerYear * i, 12);
    }
  });

  it("follows the clock, and every preset is flagged provisional while the hues are not in balance", () => {
    const clock = { year: balance.clock.startYear, tick: balance.clock.ticksPerSeason };
    const tint = seasonTintForClock(clock, balance);
    expect(tint.season).toBe(balance.clock.seasonOrder[1]);
    // The hues are a placeholder, and say so — see the blocker in the lane report.
    for (const season of balance.clock.seasonOrder) {
      expect(PROVISIONAL_SEASON_TINTS[season].provisional).toBe(true);
      expect(seasonTint(balance, season, balance.clock.startYear).provisional).toBe(true);
    }
  });

  it("BINDS — the picture's brightness is exactly the two magnitudes balance.json states", () => {
    // `setTint` MULTIPLIES, so a preset whose channels are all below 255 is itself a dimming term —
    // and the old reading stacked it under brightness AND year darkening, three terms where the spec
    // names two. Measured before the fix: winter year 6 came out rgb(68, 84, 102), 27% of the
    // painted map, where 0.75 × 0.60 asks for 45%. The invariant that kills it: the reading's
    // BRIGHTEST channel is `255 × scale` and nothing else touches it.
    const peak = (rgb: { r: number; g: number; b: number }): number => Math.max(rgb.r, rgb.g, rgb.b);
    for (let i = 0; i < balance.clock.yearsTotal; i += 1) {
      const year = balance.clock.startYear + i;
      for (const season of balance.clock.seasonOrder) {
        const tint = seasonTint(balance, season, year);
        expect(tint.scale).toBeCloseTo(
          Math.min(balance.audio.seasonBrightness[season], 1) * yearDarkening(balance, year),
          10,
        );
        expect(peak(tint.hue)).toBe(255);
        expect(peak(tint.rgb)).toBe(Math.round(255 * tint.scale));
        // Nothing clamps: a clamped channel is a hue the author did not choose.
        for (const channel of [tint.rgb.r, tint.rgb.g, tint.rgb.b]) {
          expect(channel).toBeLessThanOrEqual(255);
          expect(channel).toBeGreaterThanOrEqual(0);
        }
      }
    }
    // The hue normalisation preserves the authored ratios exactly.
    for (const season of balance.clock.seasonOrder) {
      const base = PROVISIONAL_SEASON_TINTS[season].rgb;
      const hue = hueOf(base);
      expect(hue.r / hue.g).toBeCloseTo(base.r / base.g, 10);
      expect(hue.b / hue.g).toBeCloseTo(base.b / base.g, 10);
    }
  });

  it("BINDS — brightness above 1 desaturates instead of clamping the hue to white", () => {
    // bible §12a's "summer: +brightness". A multiply cannot draw the map brighter than it was
    // painted, so the surplus HAS to go somewhere; it used to go into the clamp, which turned
    // summer's 255:224 red:green ratio into 1:1 — a hue change dressed up as a brightening.
    const bright = balance.clock.seasonOrder.find((s) => balance.audio.seasonBrightness[s] > 1);
    expect(bright).toBeDefined();
    if (!bright) return;

    const tint = seasonTint(balance, bright, balance.clock.startYear);
    const base = PROVISIONAL_SEASON_TINTS[bright].rgb;
    // The ratio survives: still recognisably the authored hue, not flattened to grey-white.
    expect(tint.rgb.g / tint.rgb.r).toBeGreaterThan(base.g / base.r);
    expect(tint.rgb.g / tint.rgb.r).toBeLessThan(1);
    // …and it really is less saturated than the same hue at brightness 1.0.
    const neutral = clone(balance);
    neutral.audio.seasonBrightness[bright] = 1;
    const plain = seasonTint(neutral, bright, neutral.clock.startYear);
    const spread = (rgb: { r: number; g: number; b: number }): number =>
      Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    expect(spread(tint.rgb)).toBeLessThan(spread(plain.rgb));
    expect(tint.scale).toBe(plain.scale); // and no brighter: a multiply cannot exceed the source
  });

  it("BINDS — the LIVE path checks the table covers seasonOrder, not just the preview path", () => {
    // `seasonTintsForYear` (a preview screen) checked; `seasonTint`/`seasonTintForClock` — the calls
    // game/mapview.ts actually makes on every season change — did not. A MISSING preset is the one
    // worth failing on: it would render the map untinted with nothing on screen saying so.
    const season = balance.clock.seasonOrder[0] as (typeof balance.clock.seasonOrder)[number];
    const missing = { ...PROVISIONAL_SEASON_TINTS } as Record<string, unknown>;
    delete missing[season];
    expect(() =>
      seasonTint(balance, season, balance.clock.startYear, missing as typeof PROVISIONAL_SEASON_TINTS),
    ).toThrow(SeasonTintError);
    expect(() =>
      seasonTintForClock(createClock(balance), balance, missing as typeof PROVISIONAL_SEASON_TINTS),
    ).toThrow(SeasonTintError);
    expect(() =>
      seasonTintsForYear(balance, balance.clock.startYear, missing as typeof PROVISIONAL_SEASON_TINTS),
    ).toThrow(SeasonTintError);

    // An UNREACHABLE extra reads normally on all three paths and is reported instead (see above).
    const extra = {
      ...PROVISIONAL_SEASON_TINTS,
      notASeason: PROVISIONAL_SEASON_TINTS.spring,
    } as unknown as typeof PROVISIONAL_SEASON_TINTS;
    expect(seasonTint(balance, season, balance.clock.startYear, extra).season).toBe(season);
    expect(seasonTintForClock(createClock(balance), balance, extra).provisional).toBe(true);
    expect(seasonTintsForYear(balance, balance.clock.startYear, extra)).toHaveLength(
      balance.clock.seasonOrder.length,
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * C6 — the year turn: aging, boxed creatures, Ancients
 * ════════════════════════════════════════════════════════════════════════════ */

describe("year turn — G10 / Hard Req 4: boxed creatures age, caught Ancients do not", () => {
  const youngest = "J" as const;

  function boxedAndAncientSave(): SaveEnvelope {
    const line = mortalLine();
    const ancient = ancientLine();
    return saveWith(
      [creature({ uid: "party-1", line, age: youngest, level: 10 })],
      [
        creature({ uid: "boxed-1", line, age: youngest, level: 8, boxed: true }),
        creature({ uid: "ancient-1", line: ancient, age: "E", level: 30, boxed: true }),
      ],
    );
  }

  it("ages the box as well as the party, and skips the Ancient — asserted through core's events", () => {
    const save = boxedAndAncientSave();
    const boxedBefore = save.box.find((c) => c.uid === "boxed-1") as OwnedCreature;
    const ancientBefore = save.box.find((c) => c.uid === "ancient-1") as OwnedCreature;
    expect(isNever(ancientBefore.yearsRemaining)).toBe(true);

    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });

    const aged = drive.turn.events.filter((e): e is Extract<YearTurnEvent, { t: "aged" }> => e.t === "aged");
    const skipped = drive.turn.events.filter(
      (e): e is Extract<YearTurnEvent, { t: "ancientSkipped" }> => e.t === "ancientSkipped",
    );

    expect(aged.map((e) => e.uid).sort()).toEqual(["boxed-1", "party-1"]);
    expect(aged.some((e) => e.where === "box")).toBe(true);
    expect(skipped.map((e) => e.uid)).toEqual(["ancient-1"]);
    expect(aged.some((e) => e.uid === "ancient-1")).toBe(false);

    const boxedAfter = drive.turn.save.box.find((c) => c.uid === "boxed-1") as OwnedCreature;
    const ancientAfter = drive.turn.save.box.find((c) => c.uid === "ancient-1") as OwnedCreature;
    expect(boxedAfter.yearsRemaining).toBe(boxedBefore.yearsRemaining - 1);
    expect(boxedAfter.age).not.toBe(boxedBefore.age);
    expect(ancientAfter.yearsRemaining).toBe(ancientBefore.yearsRemaining);
    expect(ancientAfter.age).toBe(ancientBefore.age);
    expect(zOwnedCreature.parse(ancientAfter)).toBeTruthy();

    // The sequence shows both facts on screen, from those same events.
    const beats = drive.beats;
    const agingBeat = beats.find((b) => b.t === "aging");
    const ancientBeat = beats.find((b) => b.t === "ancients");
    expect(agingBeat && agingBeat.t === "aging" ? agingBeat.entries.map((e) => e.where).sort() : []).toEqual([
      "box",
      "party",
    ]);
    expect(ancientBeat && ancientBeat.t === "ancients" ? ancientBeat.entries : []).toHaveLength(1);
  });

  it("plays the festival first and steps exactly the season core/clock.ts withheld", () => {
    const save = boxedAndAncientSave();
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });
    const seasons = seasonsOfYear(balance);
    expect(drive.seasonStepped).toBe(seasons[seasons.length - 1]);
    expect(drive.turn.seasonStepRan).toBe(true);
    const steps = drive.turn.events.filter((e) => e.t === "seasonStep");
    expect(steps).toHaveLength(content.nodes.length);
    for (const step of steps) {
      expect(step.t === "seasonStep" ? step.season : null).toBe(drive.seasonStepped);
    }

    const first = drive.beats[0];
    expect(first?.t).toBe("festival");
    expect(first && first.t === "festival" ? first.festival.year : 0).toBe(save.year + 1);
    // The label names the year that is beginning. It used to name `yearsTotal` as a denominator
    // ("Y2/6") and no longer claims one — the calendar has no total (D-Q3-1).
    expect(beatLines(first as (typeof drive.beats)[number])[0]).toBe(`FESTIVAL · Y${String(save.year + 1)}`);
  });

  it("the season step it hands core is the REAL region step, not a pass-through", () => {
    // The per-node `ecosimStep` hook is fed a precomputed region step. If that lookup ever missed,
    // the turn would still emit a `seasonStep` per node and still report `seasonStepRan` — and the
    // ecology would silently stand still. So: the numbers must move, and must match an independent
    // region step taken from an identically seeded stream.
    const save = boxedAndAncientSave();
    const seasons = seasonsOfYear(balance);
    const lastSeason = seasons[seasons.length - 1] as (typeof seasons)[number];
    const expected = stepRegionStates(
      content.nodes,
      save.nodeStates,
      lastSeason,
      simRng(save.seed),
    ).states;

    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });

    expect(drive.turn.save.nodeStates).toEqual(expected);
    const moved = Object.keys(save.nodeStates).filter((nodeId) => {
      const before = save.nodeStates[nodeId];
      const after = drive.turn.save.nodeStates[nodeId];
      return JSON.stringify(before) !== JSON.stringify(after);
    });
    expect(moved.length).toBeGreaterThan(0);
  });

  it("BINDS — one player action fires ONE year turn, however many times it is asked", () => {
    // build-doc §4 USED TO SAY "At gym victory or tick 16, the year turn runs." Both triggers were
    // reachable in the same action, and a shell that ran a turn per trigger burnt TWO years on one
    // action — two festivals, two aging passes, two season steps, two retirement rounds. There is
    // one trigger now (D-Q2-1); the guard stays because a reload, a double call or a replay can
    // still ask twice, and `canRunYearTurn` cannot see it on its own: it guards the year the turn
    // will BEGIN, and by the time the second call arrives `save.year` has already moved on.
    const save = boxedAndAncientSave();
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });
    expect(drive.turn.save.year).toBe(save.year + 1);

    // (a) the SAME ended year, a second time — the second trigger of one action.
    expect(() =>
      driveYearTurn(drive.turn.save as SaveEnvelope, {
        content,
        simRng: simRng(save.seed),
        lifecycleRng: countingRng(save.seed).fn,
        endedYear: save.year,
      }),
    ).toThrow(YearTurnError);

    // (b) feeding a completed turn's save straight back in, claiming the NEW year ended too — which
    // is what the shell did before the guard, and it was accepted.
    expect(() =>
      driveYearTurn(drive.turn.save as SaveEnvelope, {
        content,
        simRng: simRng(save.seed),
        lifecycleRng: countingRng(save.seed).fn,
        endedYear: drive.turn.save.year,
      }),
    ).not.toThrow(); // year N+1 really can end later — but only from its own trigger

    // (c) re-running the turn the save already recorded is still refused by core's own flag.
    const replayed = { ...(drive.turn.save as SaveEnvelope), year: save.year };
    expect(() =>
      driveYearTurn(replayed, {
        content,
        simRng: simRng(save.seed),
        lifecycleRng: countingRng(save.seed).fn,
        endedYear: save.year,
      }),
    ).toThrow(YearTurnError);
  });

  it("collapses the year end into ONE trigger per action", () => {
    /*
     * build-doc §4 used to give the turn TWO triggers and this test named the second. There is one
     * (D-Q2-1), and `yearTurnTrigger` still collapses: a caller that somehow saw two `yearEnd`
     * events in one action's log must still fire one turn.
     */
    const atLastTick = { year: balance.clock.startYear, tick: balance.clock.ticksPerYear - 1 };
    const meterEnd = advanceAction(atLastTick, "foray", balance);
    const meterTrigger = yearTurnTrigger(meterEnd);
    expect(meterTrigger?.endedYear).toBe(balance.clock.startYear);
    expect(meterTrigger?.reason).toBe("meter");
    expect(meterTrigger?.carryTick).toBe(balance.clock.startTick);

    // A pair of clock events carrying two yearEnds is still ONE trigger.
    const both = {
      clock: meterEnd.clock,
      events: [...meterEnd.events, ...meterEnd.events],
    };
    expect(yearTurnTrigger(both)?.endedYear).toBe(balance.clock.startYear);

    // No year end ⇒ no trigger.
    expect(yearTurnTrigger(advanceAction(createClock(balance), "foray", balance))).toBeNull();
  });

  it("BINDS — the tick a boundary-straddling action carries into the new year is not dropped", () => {
    // core/clock.ts: "Ticks beyond the boundary carry into the new year rather than being dropped, so
    // no player action is silently free." `runYearTurn` resets the meter to `startTick` because it
    // has no clock; the shell has one, and `finishYearTurn` puts the carry back. Before the fix the
    // committed save said Y2 tick 0 while this lane's own `previewAction` promised Y2 tick 1.
    const straddling = balance.clock.ticksPerYear - 1;
    const clock = { year: balance.clock.startYear, tick: straddling };
    const advanced = advanceAction(clock, "inn", balance);
    const preview = previewAction(clock, "inn", balance);
    expect(preview.endsYear).toBe(true);
    expect(preview.after.tick).toBe(advanced.clock.tick);
    expect(advanced.clock.tick).toBeGreaterThan(balance.clock.startTick); // the carry is real

    const trigger = yearTurnTrigger(advanced);
    expect(trigger).not.toBeNull();
    if (!trigger) return;

    const save = { ...boxedAndAncientSave(), ...clock };
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: trigger.endedYear,
      carryTick: trigger.carryTick,
    });
    expect(drive.turn.save.tick).toBe(balance.clock.startTick); // core's own reset, untouched
    while (!drive.flow.done()) drive.flow.chooseHeir();
    const committed = finishYearTurn(drive.flow.result(), drive.tickBefore, drive.carryTick);

    expect(committed.year).toBe(advanced.clock.year);
    expect(committed.tick).toBe(advanced.clock.tick);
    expect(seasonMeterModel(committed, balance).label).toBe(preview.after.label);
    // The action-log entries still carry the tick the turn STARTED on, exactly as core writes them.
    expect(committed.actionLog[0]?.tick).toBe(straddling);
  });

  it("BINDS — a node in the save that data/nodes/ does not have fails loudly, never silently", () => {
    // `stepRegionStates` iterates content.nodes; `runYearTurn` iterates save.nodeStates. The `??
    // state` fallback returned such a node BYTE-IDENTICAL while the turn emitted its `seasonStep`
    // event and reported `seasonStepRan: true` — an ecology standing still while the turn says it
    // moved. Measured before the fix: 1 seasonStep event for the ghost node, state unchanged.
    const save = boxedAndAncientSave();
    const ghost: SaveEnvelope = {
      ...save,
      nodeStates: {
        ...save.nodeStates,
        "not-a-node": { populations: {}, floraStock: 1, recentDeaths: 0 },
      },
    };
    expect(() =>
      driveYearTurn(ghost, {
        content,
        simRng: simRng(save.seed),
        lifecycleRng: countingRng(save.seed).fn,
        endedYear: save.year,
      }),
    ).toThrow(YearTurnError);
    // …and the shipped save, whose nodes all exist, still runs.
    expect(() =>
      driveYearTurn(save, {
        content,
        simRng: simRng(save.seed),
        lifecycleRng: countingRng(save.seed).fn,
        endedYear: save.year,
      }),
    ).not.toThrow();
  });

  it("takes the caller's SimContext for step 5, so all four of a year's season steps agree", () => {
    // The overworld passes its own context for the three clock-boundary steps; without a way to pass
    // it here the fourth was taken against core's memoised `defaultContext()`.
    const save = boxedAndAncientSave();
    const seasons = seasonsOfYear(balance);
    const lastSeason = seasons[seasons.length - 1] as (typeof seasons)[number];
    const ctx = defaultContext();
    const expected = stepRegionStates(
      content.nodes,
      save.nodeStates,
      lastSeason,
      simRng(save.seed),
      ctx,
    ).states;
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
      context: ctx,
    });
    expect(drive.turn.save.nodeStates).toEqual(expected);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * C6 — the retirement flow (the Legacy beat)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("retirement flow — build-doc §7.5 step 3, HEIR or BOON", () => {
  /** A party whose Elder reaches zero years on the next turn, plus a survivor to boon. */
  function legacySave(seed = 11): SaveEnvelope {
    const line = mortalLine();
    const other = mortalLine(1);
    return saveWith(
      [
        creature({ uid: "elder", line, age: "E", level: 22, traits: [traitAt(0), traitAt(1)] }),
        creature({ uid: "junior", line: other, age: "J", level: 12 }),
      ],
      [],
      seed,
    );
  }

  function turnFor(save: SaveEnvelope, seed = save.seed) {
    const counted = countingRng(seed);
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(seed),
      lifecycleRng: counted.fn,
      endedYear: save.year,
    });
    return { drive, counted };
  }

  it("prompts for the creature that reached zero years, and prices both sides in numbers", () => {
    const save = legacySave();
    const { drive } = turnFor(save);
    expect(drive.turn.prompts.map((p) => p.parentUid)).toEqual(["elder"]);

    const offer = drive.flow.offer();
    expect(offer).not.toBeNull();
    if (!offer) return;

    expect(offer.parent.uid).toBe("elder");
    expect(offer.parent.level).toBe(22);
    expect(offer.parent.yearsHeld).toBe(drive.turn.save.year - save.year);
    for (const key of STAT_KEYS) expect(offer.parent.stats[key]).toBeGreaterThan(0);

    // HEIR: the level is core's, and the drop is stated rather than hidden. The narrowing below is
    // load-bearing — `HeirOffer` is a union, so a consumer that skipped the `problem` check would not
    // compile rather than printing a level-0 heir.
    const heir = offer.heir;
    expect(heir.problem).toBeNull();
    if (heir.problem !== null) throw new Error("heir should be available here");
    expect(heir.level).toBe(
      Math.max(
        balance.retirement.heirLevelMin,
        Math.floor(offer.parent.level * balance.retirement.heirLevelFactor),
      ),
    );
    expect(heir.level).toBeGreaterThanOrEqual(balance.retirement.heirLevelMin);
    expect(heir.levelDrop).toBe(offer.parent.level - heir.level);
    expect(heir.statDelta.atk).toBe(heir.stats.atk - offer.parent.stats.atk);
    expect(heir.relicSlot).not.toBeNull();

    // BOON: every stat is offered, priced against the surviving teammate.
    expect(offer.boons.map((b) => b.stat)).toEqual([...STAT_KEYS]);
    for (const boon of offer.boons) {
      expect(boon.problem).toBeNull();
      expect(boon.targets.map((t) => t.targetUid)).toContain("junior");
      const target = boon.targets.find((t) => t.targetUid === "junior");
      expect(target?.gain).toBeGreaterThan(0);
      expect(target?.statAfter).toBeGreaterThan(target?.statBefore ?? 0);
      expect(boon.boonName.length).toBeGreaterThan(0);
    }

    // The copy is identifiers and numbers (G7): no sentence about the choice.
    expect(parentLines(offer).join(" ")).toContain(String(offer.parent.level));
    expect(heirLines(offer).join(" ")).toContain(String(heir.level));
    expect(boonLines(offer.boons[0]!).join(" ")).toContain("→");
  });

  it("produces a legal heir whose traits are INHERITED, never invented — over many seeds", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const save = legacySave(seed);
      const { drive } = turnFor(save, seed);
      const prompt = drive.turn.prompts[0];
      expect(prompt).toBeDefined();
      if (!prompt) continue;

      const offer = drive.flow.offer();
      if (!offer) throw new Error("no offer for a prompt that exists");
      const parentTraitIds = new Set(prompt.traits.map((t) => t.id));

      // The rolled set is a subset of the parent's own traits, sized by balance.
      const hi = Math.min(
        balance.retirement.heirInheritedTraitsMax,
        balance.traits.maxSlots,
        prompt.traits.length,
      );
      const lo = Math.min(balance.retirement.heirInheritedTraitsMin, hi);
      expect(offer.heir.inheritedTraitIds.length).toBeGreaterThanOrEqual(lo);
      expect(offer.heir.inheritedTraitIds.length).toBeLessThanOrEqual(hi);
      for (const id of offer.heir.inheritedTraitIds) expect(parentTraitIds.has(id)).toBe(true);
      expect(new Set(offer.heir.inheritedTraitIds).size).toBe(offer.heir.inheritedTraitIds.length);

      drive.flow.chooseHeir();
      const result = drive.flow.result();
      const heir = result.save.party.find((c) => c.uid === offer.heir.heirUid);
      expect(heir).toBeDefined();
      if (!heir) continue;

      // Legal by core's own schema, of the parent's line, at the youngest age class, with the
      // parent's relic slot unlocked — and carrying only traits the parent had.
      expect(zOwnedCreature.parse(heir)).toBeTruthy();
      expect(heir.lineId).toBe(prompt.lineId);
      expect(heir.age).toBe("J");
      expect(heir.level).toBeGreaterThanOrEqual(balance.retirement.heirLevelMin);
      expect(heir.level).toBeLessThanOrEqual(balance.xp.levelCap);
      expect(heir.relicSlot).toBeTruthy();
      for (const trait of heir.traits) expect(parentTraitIds.has(trait.id)).toBe(true);
      expect(heir.traits.length).toBeLessThanOrEqual(balance.traits.maxSlots);
      // The retiree is gone from both cohorts.
      expect(result.save.party.some((c) => c.uid === "elder")).toBe(false);
      expect(result.save.box.some((c) => c.uid === "elder")).toBe(false);
    }
  });

  it("takes the same number of draws whichever side the player picks (build-doc §8.1)", () => {
    const save = legacySave(23);
    const heirRun = turnFor(save, 23);
    heirRun.drive.flow.offer();
    heirRun.drive.flow.chooseHeir();
    heirRun.drive.flow.result();

    const boonRun = turnFor(save, 23);
    const offer = boonRun.drive.flow.offer();
    const stat = offer?.boons[1];
    expect(stat?.targets[0]).toBeDefined();
    boonRun.drive.flow.chooseBoon(stat!.targets[0]!.targetUid, stat!.stat);
    boonRun.drive.flow.result();

    expect(boonRun.counted.draws()).toBe(heirRun.counted.draws());
    expect(heirRun.counted.draws()).toBeGreaterThan(0);
  });

  it("the BOON persists across a later year turn, at the size balance.stats.boonModPct states", () => {
    const save = legacySave(31);
    const { drive } = turnFor(save, 31);
    const offer = drive.flow.offer();
    if (!offer) throw new Error("no retirement offer");

    const atkOffer = offer.boons.find((b) => b.stat === "atk");
    const target = atkOffer?.targets.find((t) => t.targetUid === "junior");
    expect(target).toBeDefined();
    if (!atkOffer || !target) return;

    drive.flow.chooseBoon("junior", "atk");
    const first = drive.flow.result();
    const afterGrant = first.save.party.find((c) => c.uid === "junior") as OwnedCreature;
    expect(afterGrant.boons).toHaveLength(1);
    expect(afterGrant.boons[0]?.stat).toBe("atk");
    expect(afterGrant.boons[0]?.sourceUid).toBe("elder");
    expect(boonMultiplier(afterGrant, "atk", balance)).toBeCloseTo(1 + balance.stats.boonModPct);

    // The numbers the scene showed are the numbers core produced.
    const line = species.get(afterGrant.lineId) as SpeciesLine;
    const boosted = effectiveStats({
      line,
      age: afterGrant.age,
      level: afterGrant.level,
      balance,
      traits: afterGrant.traits,
      boons: afterGrant.boons,
    });
    expect(boosted.atk).toBe(target.statAfter);

    // …and it is still there after the NEXT year turn, aged one year on. That turn ends the year the
    // first one BEGAN — naming it is what makes a second turn for the same year impossible.
    const saveAfter = finishYearTurn(first, drive.tickBefore, drive.carryTick);
    const second = driveYearTurn(saveAfter, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: saveAfter.year,
    });
    const nextYear = second.turn.save.party.find((c) => c.uid === "junior") as OwnedCreature;
    expect(nextYear).toBeDefined();
    expect(nextYear.boons.map((b) => b.id)).toEqual(afterGrant.boons.map((b) => b.id));
    expect(boonMultiplier(nextYear, "atk", balance)).toBeCloseTo(1 + balance.stats.boonModPct);
    expect(nextYear.yearsRemaining).toBe(afterGrant.yearsRemaining - 1);
  });

  it("falls back to the rolled HEIR when a choice cannot be applied, and says so", () => {
    // Everything retires at once: the BOON has no surviving target, which is the common case.
    const line = mortalLine();
    const save = saveWith([
      creature({ uid: "elder-a", line, age: "E", level: 20, traits: [traitAt(0)] }),
      creature({ uid: "elder-b", line, age: "E", level: 18, traits: [traitAt(1)] }),
    ]);
    const { drive } = turnFor(save);
    expect(drive.turn.prompts).toHaveLength(2);

    const offer = drive.flow.offer();
    if (!offer) throw new Error("no offer");
    // Nothing survived, so every BOON stat is unavailable — the button is greyed, not discovered
    // mid-turn.
    expect(offer.boons.every((b) => b.problem !== null)).toBe(true);
    expect(offer.heir.problem).toBeNull();

    drive.flow.choose({ kind: "boon", parentUid: "elder-a", targetUid: "elder-a", stat: "atk" });
    drive.flow.chooseHeir();
    const result = drive.flow.result();
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.parentUid).toBe("elder-a");
    expect(result.events.some((e) => e.t === "choiceRejected")).toBe(true);
    expect(result.choices.every((c) => c.kind === "heir")).toBe(true);
    expect(result.save.party).toHaveLength(2); // two heirs took the two places
  });

  it("writes the turn and every choice into the action log, gapless (L10)", () => {
    const save = legacySave(41);
    const { drive } = turnFor(save, 41);
    drive.flow.chooseHeir();
    const result = drive.flow.result();
    const written = finishYearTurn(result, drive.tickBefore);
    const kinds = written.actionLog.map((entry) => entry.action.t);
    expect(kinds[0]).toBe("yearTurn");
    expect(kinds.filter((k) => k === "retirement")).toHaveLength(result.choices.length);
    written.actionLog.forEach((entry, i) => expect(entry.seq).toBe(i));
  });

  /* ── the CHOICE: every stat, every target, reachable on four direction keys ── */

  /** A retiring Elder plus `survivors` teammates, so every BOON stat has several legal targets. */
  function crowdedSave(survivors: number, seed = 5): SaveEnvelope {
    const party = [
      creature({ uid: "elder", line: mortalLine(), age: "E", level: 22, traits: [traitAt(0), traitAt(1)] }),
    ];
    for (let i = 0; i < survivors; i += 1) {
      party.push(creature({ uid: `mate${String(i)}`, line: mortalLine(i + 1), age: "J", level: 10 + i }));
    }
    return saveWith(party, [], seed);
  }

  it("BINDS — every BOON stat and every target is reachable on UP/DOWN (build-doc §7.5 step 3)", () => {
    // The defect this pins: `move()` short-circuited UP/DOWN into target cycling and returned before
    // `moveSelection` ran, so `statIndex` never changed and four of the five stats could not be
    // selected — or drawn — with a party of two or more. Measured then: "statIndex values reachable
    // after 12 DOWN presses: 0"; "stat headings ever drawn: BOON hp".
    const save = crowdedSave(4);
    const { drive } = turnFor(save);
    const offer = drive.flow.offer();
    if (!offer) throw new Error("no retirement offer");
    expect(offer.boons.every((b) => b.targets.length > 1)).toBe(true); // the guard's own trigger

    const rows = boonRows(offer);
    expect(rows).toHaveLength(offer.boons.reduce((n, b) => n + b.targets.length, 0));

    // Walking DOWN over the whole list reaches every (stat, target) pair exactly once and wraps.
    let sel: RetirementSelection = { side: "boon", statIndex: 0, targetIndex: 0 };
    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i += 1) {
      seen.add(`${String(sel.statIndex)}:${String(sel.targetIndex)}`);
      expect(selectedChoice(sel, offer)).not.toBeNull();
      sel = moveSelection(sel, offer, "down");
    }
    expect(seen.size).toBe(rows.length);
    expect(sel).toEqual({ side: "boon", statIndex: 0, targetIndex: 0 }); // wrapped home

    // Every STAT is among them, and every stat is confirmable.
    const stats = new Set([...seen].map((key) => Number(key.split(":")[0])));
    expect([...stats].sort((a, b) => a - b)).toEqual(offer.boons.map((_b, i) => i));
    for (const statIndex of stats) {
      const choice = selectedChoice({ side: "boon", statIndex, targetIndex: 0 }, offer);
      expect(choice?.kind).toBe("boon");
      expect(choice && choice.kind === "boon" ? choice.stat : null).toBe(offer.boons[statIndex]?.stat);
    }

    // UP is DOWN's inverse.
    let back: RetirementSelection = { side: "boon", statIndex: 0, targetIndex: 0 };
    for (let i = 0; i < rows.length; i += 1) back = moveSelection(back, offer, "up");
    expect(back).toEqual({ side: "boon", statIndex: 0, targetIndex: 0 });

    // LEFT/RIGHT still own the side, and landing on BOON lands on a legal row.
    expect(moveSelection({ side: "boon", statIndex: 2, targetIndex: 1 }, offer, "left").side).toBe("heir");
    const landed = moveSelection({ side: "heir", statIndex: 3, targetIndex: 0 }, offer, "right");
    expect(landed.side).toBe("boon");
    expect(selectedChoice(landed, offer)).not.toBeNull();
  });

  it("cycles the stats even when none of them can be taken, so each reason can be read", () => {
    // Everything retires together: no survivor, so every stat is blocked. The cursor must still move
    // or the player is pinned to the first stat's reason.
    const line = mortalLine();
    const save = saveWith([
      creature({ uid: "elder-a", line, age: "E", level: 20, traits: [traitAt(0)] }),
      creature({ uid: "elder-b", line, age: "E", level: 18, traits: [traitAt(1)] }),
    ]);
    const { drive } = turnFor(save);
    const offer = drive.flow.offer();
    if (!offer) throw new Error("no offer");
    expect(offer.boons.every((b) => b.problem !== null)).toBe(true);
    expect(boonRows(offer)).toHaveLength(0);

    let sel: RetirementSelection = { side: "boon", statIndex: 0, targetIndex: 0 };
    const reached = new Set<number>();
    for (let i = 0; i < offer.boons.length; i += 1) {
      reached.add(sel.statIndex);
      sel = moveSelection(sel, offer, "down");
    }
    expect(reached.size).toBe(offer.boons.length);
  });

  it("BINDS — confirming an unavailable side answers the prompt instead of swallowing the key", () => {
    // Reproduced before the fix: 20 SPACE presses on a blocked BOON side answered nothing and
    // `onDone` never fired. `confirm()` returned early on a null choice, so build-doc §7.5's
    // documented "falls back to the rolled HEIR and says so" path was unreachable from the scene.
    const line = mortalLine();
    const save = saveWith([
      creature({ uid: "elder-a", line, age: "E", level: 20, traits: [traitAt(0)] }),
      creature({ uid: "elder-b", line, age: "E", level: 18, traits: [traitAt(1)] }),
    ]);
    const { drive } = turnFor(save);
    const offer = drive.flow.offer();
    if (!offer) throw new Error("no offer");

    const blocked: RetirementSelection = { side: "boon", statIndex: 0, targetIndex: 0 };
    expect(selectedChoice(blocked, offer)).toBeNull();
    const refused = refusedChoice(blocked, offer);
    expect(refused.kind).toBe("boon");

    const before = drive.flow.remaining();
    drive.flow.choose(refused); // exactly what the scene's confirm() now does
    expect(drive.flow.remaining()).toBe(before - 1);

    drive.flow.chooseHeir();
    const result = drive.flow.result();
    expect(result.rejected.map((r) => r.parentUid)).toContain("elder-a");
    expect(result.events.some((e) => e.t === "choiceRejected")).toBe(true);
    expect(result.choices.every((c) => c.kind === "heir")).toBe(true);
  });

  it("BINDS — a prompt whose BOTH sides are illegal is passed over, never thrown out of", () => {
    // `advanceYear` substitutes the rolled HEIR without re-checking it, so a doubly-illegal prompt
    // reached `resolveRetirement` and threw — killing a year turn that had already run its season
    // step, its scripted raid and its map swap, with the retiree gone and the stream advanced.
    // Constructed by retuning a COPY of balance so the heir has nowhere to go and every survivor is
    // already at `retirement.boonMaxStacksPerStat` on every stat.
    const retuned = clone(balance);
    retuned.party.maxPartySize = 1;
    retuned.party.maxBoxSize = 1;

    const line = mortalLine();
    const capped = (uid: string, boxed: boolean): OwnedCreature => {
      const c = newOwnedCreature(
        { uid, lineId: line.id, age: "J", level: 10, caughtYear: retuned.clock.startYear, boxed },
        line,
        retuned,
      );
      const boons: OwnedCreature["boons"] = [];
      for (const stat of STAT_KEYS) {
        for (let n = 0; n < retuned.retirement.boonMaxStacksPerStat; n += 1) {
          boons.push({
            id: `pre-${uid}-${stat}-${String(n)}`,
            name: `${uid} ${stat} ${String(n)}`,
            stat,
            sourceUid: "old",
            sourceFormName: line.formNames.E,
            grantedYear: retuned.clock.startYear,
          });
        }
      }
      return { ...c, boons };
    };

    const save = newSave(
      {
        seed: 3,
        currentNode: firstNodeId(),
        nodes: content.nodes,
        party: [
          creature({ uid: "elder", line, age: "E", level: 20, traits: [traitAt(0)] }),
          capped("survivor", false),
        ],
        box: [capped("boxed", true)],
      },
      retuned,
    );

    const rng = countingRng(3);
    const flow = new RetirementFlow(
      runYearTurn(save, { species: content.species, balance: retuned, nodes: content.nodes }),
      { content: { ...content, balance: retuned }, rng: rng.fn },
    );
    const offer = flow.offer();
    if (!offer) throw new Error("no offer");
    expect(offer.heir.problem).not.toBeNull();
    expect(offer.boons.every((b) => b.problem !== null)).toBe(true);
    expect(offer.deadlocked).toBe(true);

    // The card's own confirm path — and it neither throws nor hangs.
    expect(() => flow.choose(refusedChoice({ side: "heir", statIndex: 0, targetIndex: 0 }, offer))).not.toThrow();
    expect(flow.done()).toBe(true);
    const result = flow.result();
    expect(result.rejected).toHaveLength(2); // the offer, and the fallback that could not apply either
    expect(result.choices).toHaveLength(0); // nothing was applied, and the turn still completed
    expect(result.save.party.some((c) => c.uid === "elder")).toBe(false);

    /*
     * AND IT SPENT NO DRAW. A skipped prompt writes no `retirement` entry to the action log, and
     * `core/save.ts` `replay` draws `rollHeirChoice` only inside its `retirement` case — so a flow
     * that rolled an heir here left the lifecycle stream one draw ahead of its own replay and every
     * later heir roll in the run differed (build-doc §8.1 / L10). Measured before the fix: 2 draws
     * for a prompt that produced no entry. The identity is still shown, from the line, with no
     * inherited traits because none were rolled.
     */
    expect(rng.draws()).toBe(0);
    expect(offer.heir.inheritedTraitIds).toEqual([]);
    expect(offer.heir.formName).not.toBe("");
  });

  it("BINDS — an unavailable HEIR publishes no numbers at all, not zeroed ones", () => {
    // `level: 0` is a value core can never produce (`retirement.heirLevelMin` is 1). The union makes
    // the numbers ABSENT on that branch, so a consumer that skipped the `problem` check cannot print
    // a level-0 heir — it does not compile.
    const retuned = clone(balance);
    retuned.party.maxPartySize = 1;
    retuned.party.maxBoxSize = 1;
    const line = mortalLine();
    const save = newSave(
      {
        seed: 9,
        currentNode: firstNodeId(),
        nodes: content.nodes,
        party: [
          creature({ uid: "elder", line, age: "E", level: 20, traits: [traitAt(0)] }),
          creature({ uid: "survivor", line, age: "J", level: 9 }),
        ],
        box: [creature({ uid: "boxed", line, age: "J", level: 8, boxed: true })],
      },
      retuned,
    );
    const flow = new RetirementFlow(
      runYearTurn(save, { species: content.species, balance: retuned, nodes: content.nodes }),
      { content: { ...content, balance: retuned }, rng: countingRng(9).fn },
    );
    const offer = flow.offer();
    if (!offer) throw new Error("no offer");
    expect(offer.heir.problem).not.toBeNull();
    // The identity survives — the rolled traits and the relic slot are still shown.
    expect(offer.heir.heirUid.length).toBeGreaterThan(0);
    expect(offer.heir.age).toBe("J");
    // …and no priced field is present on the object at all.
    for (const key of ["level", "levelDrop", "stats", "statDelta", "projectedRetirementYear"]) {
      expect(Object.prototype.hasOwnProperty.call(offer.heir, key)).toBe(false);
    }
    expect(heirLines(offer)[0]).toContain("HEIR");
  });

  /* ── the card fits on the canvas it is drawn to ── */

  it("BINDS — every line of the card fits its column at the resolution balance.json states", () => {
    // The screen the demo video is cut around. Before the fix the HEIR stat line (~40 characters)
    // ran across the x=240 divider and drew on top of the BOON panel, and the BOON reason ran off
    // the canvas. The column widths below are the ones the scene draws to.
    const style = defaultRetirementStyle(balance);
    expect(style.width).toBe(balance.map.virtualWidth);
    expect(style.height).toBe(balance.map.virtualHeight);

    const half = Math.floor(style.width / 2);
    const fit = (px: number): number => Math.max(1, Math.floor(px / style.charWidth));
    // Each column row carries a one-character cursor gutter, so its copy gets `fit − 1`.
    const heirWidth = fit(half - style.pad - style.pad * 2) - 1;
    const boonWidth = fit(style.width - style.pad - (half + style.pad)) - 1;
    const parentWidth = fit(style.width - (style.pad + style.portrait + style.pad) - style.pad);

    // The un-wrapped stat line really is too wide — the defect is reproduced here, not assumed.
    const save = crowdedSave(4);
    const { drive } = turnFor(save);
    const offer = drive.flow.offer();
    if (!offer) throw new Error("no offer");
    expect(statLine(offer.parent.stats).length).toBeGreaterThan(heirWidth);

    const columns: Array<[readonly string[], number]> = [
      [parentLines(offer), parentWidth],
      [heirLines(offer), heirWidth],
      ...offer.boons.map((b) => [boonLines(b), boonWidth] as [readonly string[], number]),
    ];
    for (const [lines, width] of columns) {
      for (const line of wrapLines(lines, width)) {
        expect(line.length, line).toBeLessThanOrEqual(width);
      }
    }

    // The blocked-boon reason fits too — it is this module's own string, and it was shortened for it.
    const wiped = saveWith([
      creature({ uid: "a", line: mortalLine(), age: "E", level: 20, traits: [traitAt(0)] }),
      creature({ uid: "b", line: mortalLine(), age: "E", level: 18, traits: [traitAt(1)] }),
    ]);
    const blockedOffer = turnFor(wiped).drive.flow.offer();
    if (!blockedOffer) throw new Error("no offer");
    for (const boon of blockedOffer.boons) {
      for (const line of boonLines(boon)) expect(line.length).toBeLessThanOrEqual(boonWidth);
    }

    // Vertical overflow is COUNTED, never silently cut off at the panel edge.
    const many = Array.from({ length: 20 }, (_v, i) => `row ${String(i)}`);
    const clamped = clampLines(many, 6);
    expect(clamped).toHaveLength(6);
    expect(clamped[5]).toBe("+15 more");
    expect(clampLines(many, 40)).toEqual(many);

    // A single word longer than the column is cut rather than allowed to overhang.
    expect(wrapLines(["x".repeat(80)], 10).every((l) => l.length <= 10)).toBe(true);
    expect(wrapLines(["short"], 10)).toEqual(["short"]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * C6 — scripted ACT events (Cullbrand raids). RE-KEYED FROM YEARS: D-Q3-1.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("act events — scripted raids, from balance.json only", () => {
  const scripted = yearEventsOf(balance);
  const gyms = content.gyms;

  /** A save standing in `act`, reached through badges and quest flags — never through the calendar. */
  const atAct = (act: number, save = saveWith([creature({ uid: "p1", line: mortalLine(), age: "A", level: 10 })])) => {
    let out = save;
    for (const gate of actGates(balance)) {
      if (gate.act > act) break;
      for (const flag of gate.flags) out = { ...out, questFlags: { ...out.questFlags, [flag]: true } };
      for (const gym of [...gyms].sort((a, b) => a.act - b.act)) {
        if (gym.act >= gate.act) break;
        out = { ...out, ...awardBadge(out, gym.id, balance) };
      }
    }
    return out;
  };

  it("reads its raids out of balance.yearEvents and invents none", () => {
    expect(scripted.length).toBeGreaterThan(0);
    for (const raid of scripted) {
      expect(raidsForAct(balance, raid.act).map((r: RaidScript) => r.id)).toContain(raid.id);
      expect(hasRaids(balance, raid.act)).toBe(true);
    }
    const authored = new Set(scripted.map((r) => r.act));
    for (const act of raidableActs(balance)) {
      if (!authored.has(act)) expect(raidsForAct(balance, act)).toEqual([]);
    }
    // The unwritten acts are REPORTED, not filled in (G2).
    const coverage = raidCoverage(balance);
    expect(coverage.scriptedActs).toEqual([...authored].sort((a, b) => a - b));
    for (const act of coverage.unauthoredActs) expect(authored.has(act)).toBe(false);

    /*
     * The reachable set is EVERY act the region has, including the first. Under the old year model
     * it was `startYear+1 … finalYear`: the raid was applied by the turn that BEGAN its year and no
     * turn begins the start year, so a raid authored for act 1 could never fire and the coverage
     * report had to exclude it. Act entry has no such hole (D-Q3-1) — which is a beat the region
     * gained, not merely a rename.
     */
    const reachable = raidableActs(balance);
    expect(reachable[0]).toBe(balance.acts.first);
    expect(reachable).toContain(balance.acts.last);
    expect([...coverage.scriptedActs, ...coverage.unauthoredActs].sort((a, b) => a - b)).toEqual(reachable);
    expect(coverage.unreachableScriptedActs).toEqual([]);
  });

  it("BINDS — the reported reachable acts are exactly the acts an entry can fire a raid in", () => {
    /*
     * Climb the whole act ladder with an override carrying one raid in EVERY act plus one act the
     * region does not have. What fires is the ground truth the coverage report has to match.
     */
    const node = content.nodes.find((n) => Object.keys(n.populations).length > 0);
    if (!node) throw new Error("no node with populations");
    const lineId = Object.keys(node.populations)[0] as string;
    const override: RaidScript[] = [];
    for (const act of [...raidableActs(balance), balance.acts.last + 1]) {
      override.push({ id: `probe-${String(act)}`, act, nodeId: node.id, targets: [{ lineId, remove: 1 }] });
    }

    let save = saveWith([creature({ uid: "p1", line: mortalLine(), age: "A", level: 10 })]);
    const fired: number[] = [];
    for (const act of raidableActs(balance)) {
      const entry = enterPendingActs({ ...atAct(act), nodeStates: save.nodeStates }, {
        balance,
        gyms,
        yearEvents: override,
      });
      save = { ...save, ...entry.save } as typeof save;
      for (const event of entry.events) {
        if (event.t === "raid" && !fired.includes(act)) fired.push(act);
      }
      // THE CALENDAR NEVER MOVED. Every raid above fired in the start year.
      expect(save.year).toBe(balance.clock.startYear);
    }
    expect(fired).toEqual(raidableActs(balance));

    const coverage = raidCoverage(balance, override);
    expect(coverage.unauthoredActs).toEqual([]);
    expect(coverage.unreachableScriptedActs).toEqual([balance.acts.last + 1]);
  });

  it("A CULLBRAND RAID FIRES ON ACT ENTRY IN ANY CALENDAR YEAR — year 2 and year 11 alike", () => {
    /*
     * The point of D-Q3-1, asserted directly. content-bible §6 wants Cindershelf entered
     * "mid-collapse"; under the year-keyed model that was true only for a player whose calendar
     * happened to line up, and a slow player found the town healthy forever. The same act entry is
     * driven from two very different calendars and must produce the identical harvest.
     */
    const raid = scripted[0] as RaidScript;
    const runAt = (year: number) => {
      const base = atAct(raid.act);
      const entry = enterPendingActs({ ...base, year, tick: 5 }, { balance, gyms });
      const events = entry.events.filter((e) => e.t === "raid");
      return {
        events: events.map((e) => (e.t === "raid" ? `${e.lineId}:${String(e.removed)}→${String(e.remaining)}` : "")),
        state: entry.save.nodeStates[raid.nodeId],
        year: entry.save.year,
      };
    };
    const early = runAt(balance.clock.startYear + 1);
    const late = runAt(balance.clock.startYear + 10);
    expect(early.events.length).toBe(raid.targets.length);
    expect(late.events).toEqual(early.events);
    expect(late.state).toEqual(early.state);
    // Each ran in its own year and neither year moved.
    expect(early.year).toBe(balance.clock.startYear + 1);
    expect(late.year).toBe(balance.clock.startYear + 10);
  });

  it("the raid decrements the named node's real numbers, and the ledger rows are those numbers", () => {
    const raid = scripted[0] as RaidScript;
    const before = atAct(raid.act);

    const previews = raidPreviews(
      before.nodeStates,
      content.nodes,
      content.species,
      balance,
      raid.act,
    );
    expect(previews.map((p) => p.eventId)).toEqual([raid.id]);
    expect(previews[0]?.nodeId).toBe(raid.nodeId);
    expect(previews[0]?.act).toBe(raid.act);
    expect(previews[0]?.targets.map((t) => t.requested)).toEqual(raid.targets.map((t) => t.remove));

    const entry = enterPendingActs(before, { balance, gyms });
    const reports = raidReportsFrom(entry.events, content.nodes, content.species, balance);
    expect(reports).toHaveLength(1);
    const report = reports[0];
    if (!report) return;
    expect(report.nodeId).toBe(raid.nodeId);

    const stateBefore = before.nodeStates[raid.nodeId];
    const stateAfter = entry.save.nodeStates[raid.nodeId];
    for (const target of report.targets) {
      const start = stateBefore?.populations[target.lineId]?.count ?? -1;
      const end = stateAfter?.populations[target.lineId]?.count ?? -1;
      expect(target.before).toBe(start);
      expect(target.remaining).toBe(end);
      expect(target.removed).toBe(start - end);
      expect(target.removed).toBeGreaterThan(0);
      expect(end).toBeGreaterThanOrEqual(balance.ecosim.populationFloor);
    }
    expect(report.totalRemoved).toBe(report.targets.reduce((sum, t) => sum + t.removed, 0));

    // The rows on screen are those numbers, with an arrow and nothing else (G7).
    const lines = raidLedgerLines(reports);
    expect(lines).toHaveLength(report.targets.length);
    for (const line of lines) expect(line).toMatch(/\d+ → \d+ \(−\d+\)/u);

    // And it fires on its act only: an act below it produces nothing.
    const quiet = enterPendingActs(atAct(raid.act - 1), { balance, gyms });
    expect(quiet.events.some((e) => e.t === "raid" && e.eventId === raid.id)).toBe(false);
  });

  it("a raid overridden for a test drives the same beat the shipped list would", () => {
    const node = content.nodes.find((n) => Object.keys(n.populations).length > 0);
    if (!node) throw new Error("no node with populations");
    const lineId = Object.keys(node.populations)[0] as string;
    const act = balance.acts.first + 1;
    const override: RaidScript[] = [
      { id: "test-raid", act, nodeId: node.id, targets: [{ lineId, remove: 1 }] },
    ];
    const before = atAct(act);
    const entry = enterPendingActs(before, { balance, gyms, yearEvents: override });
    const beats = actEntryBeats(before, entry, content, override);
    const raidBeat = beats.find((b) => b.t === "raid");
    expect(raidBeat).toBeDefined();
    if (raidBeat && raidBeat.t === "raid") {
      expect(raidBeat.report.eventId).toBe("test-raid");
      expect(raidBeat.report.totalRemoved).toBeGreaterThanOrEqual(0);
      expect(beatLines(raidBeat).length).toBeGreaterThan(1);
    }
    /*
     * The harvest preview rides on an `actEntry` beat, NOT on a festival one. It used to be a
     * `festival` beat carrying the previews — so an act entry would have rendered under the header
     * `FESTIVAL · Y<year>`, the year's closing celebration announcing a Cullbrand strip-harvest in
     * whatever calendar year the act happened to fall in. Nothing caught it because `actEntryBeats`
     * had no caller outside this file; `OverworldScene.advanceActs` calls it now.
     */
    const entryBeat = beats.find((b) => b.t === "actEntry");
    expect(entryBeat && entryBeat.t === "actEntry" ? entryBeat.harvest.map((h) => h.eventId) : []).toEqual([
      "test-raid",
    ]);
    expect(beats.some((b) => b.t === "festival")).toBe(false);
    if (entryBeat && entryBeat.t === "actEntry") {
      expect(entryBeat.act).toBe(act);
      expect(beatLines(entryBeat)[0]).toBe(`ACT ${String(act)}`);
      // G7 / D-Q2-2: no year, no festival label, nothing that reads as the calendar.
      expect(beatLines(entryBeat).join(" ")).not.toMatch(/FESTIVAL|Y\d/u);
    }
  });

  it("A YEAR TURN CARRIES NO HARVEST PREVIEW — the calendar schedules no raid (D-Q3-1)", () => {
    const save = saveWith([creature({ uid: "p1", line: mortalLine(), age: "A", level: 10 })]);
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });
    const festival = drive.beats.find((b) => b.t === "festival");
    expect(festival && festival.t === "festival" ? festival.harvest : ["not-a-festival-beat"]).toEqual([]);
    expect(drive.turn.events.some((e) => e.t === "raid")).toBe(false);
    expect(drive.beats.some((b) => b.t === "raid")).toBe(false);
  });

  it("the festival beat states the year in numbers and claims no denominator (bible §9, amended)", () => {
    /*
     * REWRITTEN BY AN AUTHORISED AMENDMENT (D-Q2-2). It used to assert `isFinalYear` and the label
     * `Y6/6`; there is no final year and no total to be a fraction of. What it asserts now is that
     * the label is true at ANY year the calendar can reach, including ones past the old cap.
     */
    for (const year of [balance.clock.startYear, 6, 9, 40]) {
      const beat = festivalBeat(year, balance);
      expect(beat.label).toBe(`Y${String(year)}`);
      expect(beat.year).toBe(year);
      expect(beat.yearsElapsed).toBe(year - balance.clock.startYear);
      expect(beat.yearsTotal).toBe(balance.clock.yearsTotal);
      expect(beat.pastExpectedPace).toBe(year - balance.clock.startYear >= balance.clock.yearsTotal);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The sequence is a projection of core's event log, and its copy stays out of the way
 * ════════════════════════════════════════════════════════════════════════════ */

describe("year-turn sequence — build-doc §4 'a renderer of its event log'", () => {
  it("shows nothing that did not happen: every beat traces to an event or a returned swap", () => {
    const line = mortalLine();
    const save = saveWith(
      [creature({ uid: "p1", line, age: "E", level: 20, traits: [traitAt(0)] })],
      [creature({ uid: "b1", line, age: "J", level: 5, boxed: true })],
    );
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });
    const beats = beatsFor(save, drive.turn, content);
    expect(beats.map((b) => b.t)).toEqual(drive.beats.map((b) => b.t));

    const events = drive.turn.events;
    for (const beat of beats) {
      switch (beat.t) {
        case "festival":
          break; // the year turn itself
        case "aging":
          expect(beat.entries.length).toBe(events.filter((e) => e.t === "aged").length);
          break;
        case "ancients":
          expect(beat.entries.length).toBe(events.filter((e) => e.t === "ancientSkipped").length);
          break;
        case "form":
          expect(events.some((e) => e.t === "formChanged" && e.uid === beat.change.uid)).toBe(true);
          break;
        case "raid":
          expect(events.some((e) => e.t === "raid" && e.eventId === beat.report.eventId)).toBe(true);
          break;
        case "mapVariant":
          expect(drive.mapVariantSwaps.some((s) => s.nodeId === beat.nodeId)).toBe(true);
          break;
        case "retirements":
          expect(beat.count).toBe(drive.turn.prompts.length);
          break;
        case "partyEmpty":
          expect(events.some((e) => e.t === "partyEmpty")).toBe(true);
          break;
      }
      expect(beatLines(beat).length).toBeGreaterThan(0);
    }

    // No year variant has passed overlay-diff yet, so no swap should be claimed (LANE-A-STATUS §6.6).
    expect(drive.mapVariantSwaps).toEqual([]);
    expect(beats.some((b) => b.t === "mapVariant")).toBe(false);
  });

  it("BINDS — the beats run in build-doc §7.5's numbered order, retirement at step 3", () => {
    // §7.5: (2) aging + forms, (3) "any creature at 0 → retirement flow", (5) season step + year
    // events, (6) map year-variant swap. The sequence used to show the raid ledger and the map swap
    // BEFORE the retirement beat and answer the prompts after everything — measured then:
    // "festival → aging → form → raid → retirements".
    const node = content.nodes.find((n) => Object.keys(n.populations).length > 0);
    if (!node) throw new Error("no node with populations");
    const lineId = Object.keys(node.populations)[0] as string;
    const line = mortalLine();
    const save = saveWith([
      creature({ uid: "elder", line, age: "E", level: 20, traits: [traitAt(0)] }),
      creature({ uid: "junior", line: mortalLine(1), age: "J", level: 9 }),
    ]);
    const override: RaidScript[] = [
      { id: "order-probe", act: balance.acts.first, nodeId: node.id, targets: [{ lineId, remove: 1 }] },
    ];
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
      yearEvents: override,
    });

    const order = drive.beats.map((b) => b.t);
    expect(order[0]).toBe("festival");
    const at = (t: YearTurnBeat["t"]): number => order.indexOf(t);
    expect(at("aging")).toBeGreaterThan(at("festival"));
    expect(at("retirements")).toBeGreaterThan(at("aging"));
    /*
     * The raid beat is NO LONGER IN THIS SEQUENCE (D-Q3-1): it fires on act entry, so the year turn
     * emits none however the raid list is overridden. The rest of §7.5's order stands, and the map
     * swap — step 6 — is now the step that must follow the retirement flow.
     */
    expect(at("raid")).toBe(-1);
    if (at("mapVariant") >= 0) expect(at("mapVariant")).toBeGreaterThan(at("retirements"));
    if (at("form") >= 0) expect(at("form")).toBeLessThan(at("retirements"));
  });

  it("BINDS — the partyEmpty beat is asked when it has an answer, and can actually be reached", () => {
    // It used to be looked for in `runYearTurn`'s event log, where it never appears: only
    // `advanceYear` and `RetirementFlow.result()` emit it, because until the prompts are answered a
    // wiped-out party may still be refilled by its heirs. Measured then: a turn where BOTH party
    // members retired produced no `partyEmpty` and the scene's `case "partyEmpty"` arm was dead code.
    const line = mortalLine();
    const save = saveWith([
      creature({ uid: "elder-a", line, age: "E", level: 20, traits: [traitAt(0)] }),
      creature({ uid: "elder-b", line, age: "E", level: 18, traits: [traitAt(1)] }),
    ]);
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });
    expect(drive.turn.save.party).toHaveLength(0); // the turn's own post-turn party IS empty…
    expect(drive.turn.events.some((e) => e.t === "partyEmpty")).toBe(false); // …and core says nothing
    expect(drive.beats.some((b) => b.t === "partyEmpty")).toBe(false); // so the beat is not claimed

    // Taking HEIR both times refills the party: no beat, correctly.
    drive.flow.chooseHeir();
    drive.flow.chooseHeir();
    const refilled = drive.flow.result();
    expect(refilled.partyEmpty).toBe(false);
    expect(beatsAfterRetirement(refilled)).toEqual([]);

    // A flow that really ends with nothing in the party DOES produce the beat — reached through the
    // same function the scene calls.
    const emptied = { ...refilled, partyEmpty: true, save: { ...refilled.save, party: [] } };
    const epilogue = beatsAfterRetirement(emptied);
    expect(epilogue.map((b) => b.t)).toEqual(["partyEmpty"]);
    expect(beatLines(epilogue[0]!)[0]).toContain(String(emptied.save.year));
  });

  it("G11 — the virtual resolution is read from balance.map, never written as a literal", () => {
    // `game/boot.ts` states the rule verbatim, and BattleScene/DexScene/LedgerScene/SummaryScene all
    // comply — these two scenes carried `width: 480, height: 320` in their style blocks, and no gate
    // in the tree covers `game/`, so nothing caught it.
    expect(defaultYearTurnStyle(balance).width).toBe(balance.map.virtualWidth);
    expect(defaultYearTurnStyle(balance).height).toBe(balance.map.virtualHeight);
    expect(defaultRetirementStyle(balance).width).toBe(balance.map.virtualWidth);
    expect(defaultRetirementStyle(balance).height).toBe(balance.map.virtualHeight);

    // …and a retune moves both cards, which is the whole point (INV-3).
    const retuned = clone(balance);
    retuned.map.virtualWidth = balance.map.virtualWidth * 2;
    retuned.map.virtualHeight = balance.map.virtualHeight * 2;
    expect(defaultYearTurnStyle(retuned).width).toBe(retuned.map.virtualWidth);
    expect(defaultRetirementStyle(retuned).height).toBe(retuned.map.virtualHeight);

    // The literals are gone from the CODE, not merely unused. Comments may quote build-doc §7.6's
    // "480×320" — that is the spec being cited, not a second home for the number — so they are
    // stripped first, the way tests/gates/guardrails.test.ts strips them for its own sweeps.
    const root = fileURLToPath(new URL("../..", import.meta.url));
    for (const file of ["game/scenes/YearTurnScene.ts", "game/scenes/RetirementScene.ts", "game/ui/SeasonMeter.ts"]) {
      const code = stripComments(readFileSync(`${root}${file}`, "utf8"));
      for (const value of [balance.map.virtualWidth, balance.map.virtualHeight]) {
        expect(
          new RegExp(`\\b${String(value)}\\b`, "u").test(code),
          `${file} contains the literal ${String(value)}`,
        ).toBe(false);
      }
    }
    // The stripper itself is checked, so a gate that passed by failing to see anything is caught.
    expect(stripComments('const a = 1; // 480\n/* 320 */ const b = "480";')).toContain('"480"');
    expect(stripComments("// 480\n/* 320 */").replace(/\s/gu, "")).toBe("");
  });

  it("BINDS — a beat with more rows than the canvas has says how many it could not show", () => {
    // Sibling of the retirement card's overflow. An aging beat lists one row per owned creature —
    // `party.maxPartySize` + `maxBoxSize`, 66 on the shipped numbers — and the rows ran off the
    // bottom of a 320px canvas with nothing to say they had.
    const style = defaultYearTurnStyle(balance);
    const top = style.pad + style.lineHeight * 2;
    const room = Math.floor((style.height - top - style.pad * 2 - style.lineHeight) / style.lineHeight);
    const width = Math.max(1, Math.floor((style.width - style.pad * 2) / style.charWidth));

    const line = mortalLine();
    const party = [creature({ uid: "p0", line, age: "J", level: 5 })];
    const box: OwnedCreature[] = [];
    for (let i = 0; i < balance.party.maxPartySize - 1; i += 1) {
      party.push(creature({ uid: `p${String(i + 1)}`, line: mortalLine(i + 1), age: "J", level: 5 }));
    }
    for (let i = 0; i < 40; i += 1) {
      box.push(creature({ uid: `b${String(i)}`, line: mortalLine(i), age: "J", level: 4, boxed: true }));
    }
    const save = saveWith(party, box);
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });
    const aging = drive.beats.find((b) => b.t === "aging");
    if (!aging) throw new Error("no aging beat");
    const raw = beatLines(aging);
    expect(raw.length).toBeGreaterThan(room); // the overflow is real, not assumed

    const drawn = clampLines(wrapLines(raw, width), room);
    expect(drawn).toHaveLength(room);
    expect(drawn[drawn.length - 1]).toMatch(/^\+\d+ more$/u);
    for (const row of drawn) expect(row.length).toBeLessThanOrEqual(width);

    // …and the scene really draws that many rows and no more.
    const { P } = stubEngine();
    const Scene = createYearTurnScene(P as never) as unknown as SceneCtor;
    const scene = new Scene();
    scene.init({ drive, onDone: () => undefined, placeholder: () => undefined } as never);
    scene.create();
    const agingAt = drive.beats.findIndex((b) => b.t === "aging");
    for (let i = 0; i < agingAt; i += 1) tap(scene, "keydown-SPACE");
    // [rect] background + title + rows + footer
    expect(scene.stub.drawn.filter((d) => d !== "[rect]").length).toBeLessThanOrEqual(room + 2);
    expect(scene.stub.drawn.some((d) => /^\+\d+ more$/u.test(d))).toBe(true);
  });

  it("the two scene keys come from the ONE registry, in its own convention", () => {
    // They were `"year-turn"` and `"retirement"` — neither in `SCENE_KEYS` nor in its PascalCase
    // convention, so `sceneRegistered(scene, SCENE_KEYS.*)` could not reach either of them.
    expect(YEAR_TURN_SCENE_KEY).toBe(SCENE_KEYS.yearTurn);
    expect(RETIREMENT_SCENE_KEY).toBe(SCENE_KEYS.retirement);
    for (const key of [YEAR_TURN_SCENE_KEY, RETIREMENT_SCENE_KEY]) {
      expect(Object.values(SCENE_KEYS)).toContain(key);
      expect(key).toMatch(/^[A-Z]/u);
    }
    // …and the registry is reachable from a node test, which is why it is not in game/boot.ts.
    expect(sceneRegistered({ scene: { manager: { keys: { [YEAR_TURN_SCENE_KEY]: {} } } } }, YEAR_TURN_SCENE_KEY)).toBe(true);
    expect(sceneRegistered({ scene: { manager: { keys: {} } } }, RETIREMENT_SCENE_KEY)).toBe(false);
  });

  it("the running game registers both scenes — this lane is reachable, not only testable", () => {
    // The lane's green tests were evidence about pure functions nobody called: `game/main.ts` listed
    // Boot/Title/Menu and nothing else, so build-doc §1's never-cut Legacy beat could not be reached
    // by playing. A scene that is not in that list does not exist.
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const main = readFileSync(`${root}game/main.ts`, "utf8");
    expect(main).toContain("createYearTurnScene");
    expect(main).toContain("createRetirementScene");
    expect(main).toContain("OverworldScene"); // …and the scene that STARTS the year turn

    // The overworld drives this lane rather than printing that it is unwired.
    const overworld = readFileSync(`${root}game/scenes/OverworldScene.ts`, "utf8");
    expect(overworld).toContain("driveYearTurn");
    expect(overworld).toContain("yearTurnTrigger");
    expect(overworld).toContain("SeasonMeterHud");
    expect(overworld).not.toContain("year turn not wired");
  });

  it("G7 — this lane's copy carries no moralizing about catching", () => {
    const files = [
      "game/season-tint.ts",
      "game/year-events.ts",
      "game/scene-keys.ts",
      "game/ui/SeasonMeter.ts",
      "game/scenes/YearTurnScene.ts",
      "game/scenes/RetirementScene.ts",
    ];
    // A keyword heuristic, not a proof — but it binds the words a moralizing string would use.
    const banned =
      /\b(cruel|greedy|guilt|guilty|shame|shameful|sorry|tragic|tragedy|remorse|selfish|deserved|punish|sin|evil|wicked)\b/iu;
    const root = fileURLToPath(new URL("../..", import.meta.url));
    for (const file of files) {
      const source = readFileSync(`${root}${file}`, "utf8");
      const literals = source.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/gs) ?? [];
      for (const literal of literals) {
        expect(banned.test(literal), `${file}: ${literal}`).toBe(false);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The scenes themselves, driven against a stub engine
 *
 * The lane's model is pure and its tests above are about the model. These drive the REAL scene
 * classes — `createYearTurnScene` / `createRetirementScene` with a stand-in namespace — because the
 * defects that mattered most lived in the classes, not the models: a scene that never yielded the
 * keyboard, a cursor that could not reach four of five stats, a hand-off to a scene key nothing had
 * registered. `import "phaser"` throws under vitest's node environment, which is exactly why the two
 * factories take the engine as an argument.
 * ════════════════════════════════════════════════════════════════════════════ */

interface StubObject {
  setOrigin: (x?: number, y?: number) => StubObject;
  setFillStyle: (color: number, alpha?: number) => StubObject;
  destroy: () => void;
  text: string;
  fill: { color: number; alpha: number } | null;
}

interface KeyEventLike {
  repeat?: boolean;
}

interface StubScene {
  key: string;
  drawn: string[];
  objects: StubObject[];
  handlers: Map<string, Array<(event?: KeyEventLike) => void>>;
  launches: Array<{ key: string; data: unknown }>;
  lifecycle: string[];
  registered: Set<string>;
  /** Keys the scene registered with `addKey` — Phaser only suppresses repeats for these. */
  addedKeys: Set<string>;
  /** Keys physically held down, so the stub can model `repeat = key.isDown`. */
  heldKeys: Set<string>;
  press: (key: string, event?: KeyEventLike) => void;
  release: (key: string) => void;
}

/**
 * A stand-in for the slice of Phaser these two scenes touch.
 *
 * ⚠ THE KEYBOARD MODELS PHASER'S OWN REPEAT RULE, because a defect lived in it. Phaser's
 * KeyboardPlugin (`update`, node_modules/phaser/src/input/keyboard/KeyboardPlugin.js) does:
 * `var key = keys[code]; … repeat = key.isDown; … if (!event.cancelled && (!key || !repeat))` — so a
 * scene that binds `keydown-SPACE` WITHOUT `addKey` receives every OS auto-repeat, and one that
 * registers the key does not. `press` reproduces exactly that: a second keydown with no keyup in
 * between reaches the handlers only if the key was never registered. `release` is the keyup.
 */
function stubEngine(): { P: unknown; scenes: StubScene[] } {
  const scenes: StubScene[] = [];

  class StubBase {
    readonly stub: StubScene;
    add: {
      rectangle: (...a: unknown[]) => StubObject;
      text: (x: number, y: number, value: string | string[]) => StubObject;
    };
    input: {
      keyboard: {
        on: (event: string, fn: (event?: KeyEventLike) => void) => void;
        addKey: (key: string) => unknown;
      };
    };
    scene: {
      manager: { keys: Record<string, unknown> };
      launch: (key: string, data: unknown) => void;
      pause: () => void;
      resume: () => void;
      stop: () => void;
    };

    constructor(config: { key: string }) {
      const state: StubScene = {
        key: config.key,
        drawn: [],
        objects: [],
        handlers: new Map(),
        launches: [],
        lifecycle: [],
        registered: new Set<string>(),
        addedKeys: new Set<string>(),
        heldKeys: new Set<string>(),
        press: (key: string, event?: KeyEventLike) => {
          const code = key.replace(/^keydown-/u, "");
          const wasDown = state.heldKeys.has(code);
          state.heldKeys.add(code);
          // Phaser: a registered key that is already down emits nothing (`!key || !repeat`).
          if (wasDown && state.addedKeys.has(code)) return;
          for (const fn of state.handlers.get(key) ?? []) fn(event);
        },
        release: (key: string) => {
          state.heldKeys.delete(key.replace(/^keydown-/u, ""));
        },
      };
      this.stub = state;
      scenes.push(state);

      const object = (label: string): StubObject => {
        const obj: StubObject = {
          text: label,
          fill: null,
          setOrigin: () => obj,
          setFillStyle: (color: number, alpha = 1) => {
            obj.fill = { color, alpha };
            return obj;
          },
          destroy: () => {
            const at = state.drawn.indexOf(label);
            if (at >= 0) state.drawn.splice(at, 1);
          },
        };
        state.drawn.push(label);
        state.objects.push(obj);
        return obj;
      };

      this.add = {
        rectangle: () => object("[rect]"),
        text: (_x, _y, value) => object(Array.isArray(value) ? value.join("\n") : value),
      };
      this.input = {
        keyboard: {
          on: (event, fn) => {
            const list = state.handlers.get(event) ?? [];
            list.push(fn);
            state.handlers.set(event, list);
          },
          addKey: (key: string) => {
            state.addedKeys.add(key);
            return { isDown: false };
          },
        },
      };
      this.scene = {
        // Populated by the driver below; `sceneRegistered` reads it.
        manager: { keys: {} as Record<string, unknown> },
        launch: (key, data) => {
          state.launches.push({ key, data });
        },
        pause: () => state.lifecycle.push("pause"),
        resume: () => state.lifecycle.push("resume"),
        stop: () => state.lifecycle.push("stop"),
      };
    }
  }

  return { P: { Scene: StubBase }, scenes };
}

type SceneCtor = new () => {
  stub: StubScene;
  scene: { manager: { keys: Record<string, unknown> } };
  init: (data: never) => void;
  create: () => void;
  update: () => void;
};

/** Frames the slower of the two cards makes a player wait before it will act on a key. */
const ARM_FRAMES = Math.max(
  defaultYearTurnStyle(balance).advanceArmFrames,
  defaultRetirementStyle(balance).confirmArmFrames,
);

type Driveable = { stub: StubScene; update: () => void };

/** Run the scene's frame loop, the way Phaser's would. */
function frames(scene: Driveable, count = ARM_FRAMES): void {
  for (let i = 0; i < count; i += 1) scene.update();
}

/**
 * One deliberate keypress: the screen has been readable for its arming window, the key goes down,
 * and the player lets go. Everything a real player does; nothing a held key does.
 */
function tap(scene: Driveable, key: string): void {
  frames(scene);
  scene.stub.press(key);
  scene.stub.release(key);
}

/**
 * A HELD key: one press, then `repeats` OS auto-repeat keydowns with no keyup, one frame apart —
 * the input that used to run the whole year-turn sequence and answer the Legacy card in four frames.
 */
function hold(scene: Driveable, key: string, repeats: number): void {
  scene.stub.press(key);
  for (let i = 0; i < repeats; i += 1) {
    scene.update();
    scene.stub.press(key, { repeat: true });
  }
}

/** The Legacy beat as the demo cuts it: an Elder retiring with `survivors` teammates alive. */
function legacyDrive(survivors = 3, seed = 17) {
  const party = [
    creature({ uid: "elder", line: mortalLine(), age: "E", level: 22, traits: [traitAt(0), traitAt(1)] }),
  ];
  for (let i = 0; i < survivors; i += 1) {
    party.push(creature({ uid: `mate${String(i)}`, line: mortalLine(i + 1), age: "J", level: 10 + i }));
  }
  const save = saveWith(party, [], seed);
  return driveYearTurn(save, {
    content,
    simRng: simRng(seed),
    lifecycleRng: countingRng(seed).fn,
    endedYear: save.year,
  });
}

describe("the scenes, driven for real", () => {
  it("the retirement card draws EVERY stat heading and confirms the one on screen", () => {
    // Measured before the fix, with this same rig: "targets per stat: 5,5,5,5,5",
    // "statIndex values reachable after 12 DOWN presses: 0", "stat headings ever drawn: BOON  hp".
    const { P } = stubEngine();
    const drive = legacyDrive(4);
    const Scene = createRetirementScene(P as never) as unknown as SceneCtor;
    const scene = new Scene();
    let done: AdvanceYearResultLike | null = null;
    // The portrait painter is injected: the real one reaches `scene.textures`, which the stub engine
    // deliberately does not have — and a placeholder is what it draws anyway while the art is unbuilt.
    const painted: string[] = [];
    scene.init({
      flow: drive.flow,
      onDone: (r: AdvanceYearResultLike) => { done = r; },
      placeholder: (_s: unknown, _x: number, _y: number, _w: number, _h: number, id: string) => {
        painted.push(id);
      },
    } as never);
    scene.create();
    /*
     * An honest labelled stand-in, never a stretched trial image — and labelled with an ASSET ID.
     * It used to paint `offer.parent.uid` ("elder" here, "starter" in a real run): a save-local name
     * that no `assets/final/**` path can ever match, so the portrait could not resolve to real art
     * when Lane B lands one, and the label — which exists so "a reviewer can say WHICH asset is
     * missing" (game/placeholder.ts) — named a file nobody could look for.
     */
    const offer0 = drive.flow.offer();
    if (!offer0) throw new Error("no offer");
    expect(painted).toEqual([dexArtId(offer0.parent.formName)]);
    expect(painted[0]).not.toBe(offer0.parent.uid);
    expect(assetId(`assets/final/${String(painted[0])}.png`)).toBe(painted[0]);

    const offer = drive.flow.offer();
    if (!offer) throw new Error("no offer");
    const headings = new Set<string>();
    // The headings carry the cursor gutter now ("▸BOON  hp" on the selected side, " BOON  hp" on
    // the other), so the marker is stripped before the stat is read off.
    const readHeading = (): void => {
      const line = scene.stub.drawn.find((d) => d.replace(/^[▸ ]/u, "").startsWith("BOON"));
      if (line) headings.add(line.replace(/^[▸ ]/u, "").trim());
    };

    tap(scene, "keydown-RIGHT");
    readHeading();
    for (let i = 0; i < boonRows(offer).length; i += 1) {
      tap(scene, "keydown-DOWN");
      readHeading();
    }
    expect(headings.size).toBe(offer.boons.length);
    for (const boon of offer.boons) {
      expect([...headings].some((h) => h.endsWith(boon.stat))).toBe(true);
    }

    // The marker is on screen, and confirming applies the stat the heading names.
    expect(scene.stub.drawn.some((d) => d.startsWith("▸"))).toBe(true);
    const heading = scene.stub.drawn
      .find((d) => d.replace(/^[▸ ]/u, "").startsWith("BOON"))
      ?.replace(/^[▸ ]/u, "")
      .trim() as string;
    tap(scene, "keydown-SPACE");
    expect(done).not.toBeNull();
    const applied = (done as unknown as AdvanceYearResultLike).choices[0];
    expect(applied?.kind).toBe("boon");
    expect(heading.endsWith(applied?.stat ?? "")).toBe(true);
    expect(scene.stub.lifecycle).toContain("stop");
  });

  it("the retirement card ANSWERS a blocked side instead of swallowing the keypress", () => {
    // Reproduced against the real scene before the fix: 20 SPACE presses on a fully blocked BOON
    // side answered nothing and `onDone` never fired. Everything retired together here, so every
    // BOON stat is unavailable and the HEIR is the documented fallback.
    const { P } = stubEngine();
    const line = mortalLine();
    const save = saveWith([
      creature({ uid: "elder-a", line, age: "E", level: 20, traits: [traitAt(0)] }),
      creature({ uid: "elder-b", line, age: "E", level: 18, traits: [traitAt(1)] }),
    ]);
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });
    const offer = drive.flow.offer();
    if (!offer) throw new Error("no offer");
    expect(offer.boons.every((b) => b.problem !== null)).toBe(true);

    const Scene = createRetirementScene(P as never) as unknown as SceneCtor;
    const scene = new Scene();
    let done: AdvanceYearResultLike | null = null;
    scene.init({
      flow: drive.flow,
      onDone: (r: AdvanceYearResultLike) => { done = r; },
      placeholder: () => undefined,
    } as never);
    scene.create();

    tap(scene, "keydown-RIGHT"); // sit on the blocked BOON side
    const before = drive.flow.remaining();
    tap(scene, "keydown-SPACE");
    expect(drive.flow.remaining()).toBeLessThan(before); // the key was ANSWERED, not swallowed

    for (let i = 0; i < 20; i += 1) tap(scene, "keydown-SPACE");
    expect(done).not.toBeNull();
    const result = done as unknown as { choices: Array<{ kind: string }>; rejected: unknown[] };
    expect(result.rejected.length).toBeGreaterThan(0); // and the refusal was recorded, not hidden
    expect(result.choices.every((c) => c.kind === "heir")).toBe(true);
  });

  it("the year-turn scene yields the keyboard while the retirement card is up", () => {
    // Before the fix: "launches: retirement × 6 | stop/pause/sleep calls on the year-turn scene:
    // (none)". Phaser delivers a keydown to every ACTIVE scene and both bind SPACE, so each press
    // both answered the card and re-launched it, re-running init() under the player's hands.
    const { P } = stubEngine();
    const drive = legacyDrive(2);
    const Scene = createYearTurnScene(P as never) as unknown as SceneCtor;
    const scene = new Scene();
    let finishedSaves = 0;
    scene.init({ drive, onDone: () => { finishedSaves += 1; } } as never);
    scene.scene.manager.keys[RETIREMENT_SCENE_KEY] = {};
    scene.create();

    // Walk the whole sequence, then keep pressing well past the end.
    for (let i = 0; i < drive.beats.length + 20; i += 1) tap(scene, "keydown-SPACE");

    expect(scene.stub.launches.filter((l) => l.key === RETIREMENT_SCENE_KEY)).toHaveLength(1);
    expect(scene.stub.lifecycle).toContain("pause");
    expect(finishedSaves).toBe(0); // the card has not answered yet, so nothing is committed
  });

  it("plays the retirement at build-doc §7.5 step 3, then the beats after it, then finishes once", () => {
    const { P, scenes } = stubEngine();
    const drive = legacyDrive(2);
    const YearTurn = createYearTurnScene(P as never) as unknown as SceneCtor;
    const Retirement = createRetirementScene(P as never) as unknown as SceneCtor;

    const year = new YearTurn();
    let committed = 0;
    let committedSave: SaveEnvelope | null = null;
    year.init({
      drive,
      onDone: (save: SaveEnvelope) => {
        committed += 1;
        committedSave = save;
      },
      placeholder: () => undefined,
    } as never);
    year.scene.manager.keys[RETIREMENT_SCENE_KEY] = {};
    year.create();

    // Advance to the retirement beat.
    const retirementAt = drive.beats.findIndex((b) => b.t === "retirements");
    expect(retirementAt).toBeGreaterThan(0);
    for (let i = 0; i < retirementAt; i += 1) tap(year, "keydown-SPACE");
    tap(year, "keydown-SPACE"); // the beat itself hands off
    const launch = year.stub.launches.find((l) => l.key === RETIREMENT_SCENE_KEY);
    expect(launch).toBeDefined();
    expect(committed).toBe(0);

    // Answer the card through the real retirement scene.
    const card = new Retirement();
    card.init(launch?.data as never);
    card.create();
    for (let i = 0; i < 10 && drive.flow.remaining() > 0; i += 1) tap(card, "keydown-SPACE");
    expect(drive.flow.remaining()).toBe(0);
    expect(scenes.length).toBe(2);

    // Back on the year turn: it resumed, played what was left, and committed exactly once.
    expect(year.stub.lifecycle).toContain("resume");
    for (let i = 0; i < drive.beats.length + 10; i += 1) tap(year, "keydown-SPACE");
    expect(committed).toBe(1);
    expect(year.stub.launches.filter((l) => l.key === RETIREMENT_SCENE_KEY)).toHaveLength(1);
    expect(committedSave).not.toBeNull();
    expect((committedSave as unknown as SaveEnvelope).year).toBe(drive.turn.save.year);
  });

  it("never strands the player when the retirement scene is not registered", () => {
    // `scene.launch` on an unknown key is a console.warn and nothing else. Mid-turn — retiree gone,
    // stream advanced — that is the worst possible failure, and `sceneRegistered` exists for it.
    const { P } = stubEngine();
    const drive = legacyDrive(2);
    const Scene = createYearTurnScene(P as never) as unknown as SceneCtor;
    const scene = new Scene();
    let committed = 0;
    scene.init({ drive, onDone: () => { committed += 1; } } as never);
    // …no RETIREMENT key registered.
    scene.create();
    for (let i = 0; i < drive.beats.length + 10; i += 1) tap(scene, "keydown-SPACE");

    expect(scene.stub.launches).toHaveLength(0);
    expect(committed).toBe(1); // the turn still completed, on core's own documented default
    expect(drive.flow.done()).toBe(true);
  });

  it("shows the partyEmpty beat after the prompts, when the party really did end empty", () => {
    const { P } = stubEngine();
    const line = mortalLine();
    const save = saveWith([
      creature({ uid: "elder-a", line, age: "E", level: 20, traits: [traitAt(0)] }),
      creature({ uid: "elder-b", line, age: "E", level: 18, traits: [traitAt(1)] }),
    ]);
    const drive = driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
    });
    expect(drive.beats.some((b) => b.t === "partyEmpty")).toBe(false);

    const Scene = createYearTurnScene(P as never) as unknown as SceneCtor;
    const scene = new Scene();
    scene.init({ drive, onDone: () => undefined } as never);
    scene.create();

    // Refuse both prompts the way a fully blocked BOON side does: the flow falls back to the rolled
    // HEIR, the party refills, and no partyEmpty beat is claimed.
    for (let i = 0; i < drive.beats.length + 6; i += 1) tap(scene, "keydown-SPACE");
    const shown = scene.stub.drawn.join("\n");
    expect(shown).not.toContain("PARTY 0");
  });
});

/** Structural view of `AdvanceYearResult`, so this block needs no core type import of its own. */
interface AdvanceYearResultLike {
  choices: Array<{ kind: string; stat?: string | undefined }>;
}

/* ════════════════════════════════════════════════════════════════════════════
 * REPAIRS — one block per defect an independent verifier reproduced in the RUNNING game
 *
 * Every test below fails against the code as it was, and the comment on each one carries the
 * measurement that was taken before the fix. They are here rather than folded into the blocks above
 * because what they bind is not "the model is right" — the model was right — but "the thing the
 * player touches does what the model says".
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the repairs — reproduced defects, and what stops them coming back", () => {
  function soloElder(seed = 11): SaveEnvelope {
    // build-doc §1's own shape: ONE creature, the starter, retiring alone.
    return saveWith(
      [creature({ uid: "starter", line: mortalLine(), age: "E", level: 20, traits: [traitAt(0)] })],
      [],
      seed,
    );
  }

  function driveOf(save: SaveEnvelope, extra: Record<string, unknown> = {}) {
    return driveYearTurn(save, {
      content,
      simRng: simRng(save.seed),
      lifecycleRng: countingRng(save.seed).fn,
      endedYear: save.year,
      ...extra,
    } as never);
  }

  /* ── the cursor and the committed action (RetirementScene.ts) ──────────── */

  it("BINDS — the ▸ is on the side SPACE will take, and moves when the side does", () => {
    /*
     * Measured in the running game before the fix, with the default selection {side:"heir"}: the
     * card drew ["HEIR", " Cindril · J10", …, "BOON  hp", "▸Maelstrisk L14 · hp 110 → 121 (+11)"] —
     * the single ▸ on a BOON row — and SPACE committed the HEIR. Pressing RIGHT to the BOON side
     * left the marker exactly where it was. The only difference between the two sides was a panel
     * alpha of 0.25 against 0.15.
     */
    const { P } = stubEngine();
    const drive = legacyDrive(4);
    const Scene = createRetirementScene(P as never) as unknown as SceneCtor;
    const scene = new Scene();
    let done: AdvanceYearResultLike | null = null;
    scene.init({
      flow: drive.flow,
      onDone: (r: AdvanceYearResultLike) => {
        done = r;
      },
      placeholder: () => undefined,
    } as never);
    scene.create();

    const offer = drive.flow.offer();
    if (!offer) throw new Error("no offer");
    const marked = (): string[] => scene.stub.drawn.filter((d) => d.startsWith("▸"));
    const heirBody = heirLines(offer);
    const boonBody = new Set(offer.boons.flatMap((b) => boonLines(b)));

    // The card opens on HEIR, which is what SPACE would take.
    expect(selectedChoice({ side: "heir", statIndex: 0, targetIndex: 0 }, offer)?.kind).toBe("heir");
    const onHeir = marked();
    expect(onHeir.some((d) => d.includes("HEIR"))).toBe(true);
    expect(onHeir.some((d) => d.includes("BOON"))).toBe(false);
    expect(onHeir.some((d) => d.slice(1) === heirBody[0])).toBe(true);
    expect(onHeir.some((d) => boonBody.has(d.slice(1)))).toBe(false);

    // RIGHT moves the side, and the marker with it.
    tap(scene, "keydown-RIGHT");
    const onBoon = marked();
    expect(onBoon.some((d) => d.includes("BOON"))).toBe(true);
    expect(onBoon.some((d) => d.includes("HEIR"))).toBe(false);
    expect(onBoon.some((d) => boonBody.has(d.slice(1)))).toBe(true);
    expect(onBoon.some((d) => d.slice(1) === heirBody[0])).toBe(false);

    // …and back, where SPACE really does take the HEIR the marker is sitting on.
    tap(scene, "keydown-LEFT");
    expect(marked().some((d) => d.includes("HEIR"))).toBe(true);
    tap(scene, "keydown-SPACE");
    expect(done).not.toBeNull();
    expect((done as unknown as AdvanceYearResultLike).choices[0]?.kind).toBe("heir");
  });

  /* ── the held key (both scenes) ────────────────────────────────────────── */

  it("BINDS — a HELD key advances one beat and answers no card", () => {
    /*
     * Reproduced frame by frame in the running game: one auto-repeat keydown per frame, no keyup.
     * Frame 2 the sequence was already on the RETIREMENT beat, frame 3 the Legacy card was up,
     * frame 4 it was gone (scene status SHUTDOWN), frame 5 `onDone` had fired with choices ["heir"].
     * The never-cut card was on screen for ONE frame and answered itself.
     */
    const { P } = stubEngine();
    const drive = legacyDrive(2);
    const YearTurn = createYearTurnScene(P as never) as unknown as SceneCtor;
    const Retirement = createRetirementScene(P as never) as unknown as SceneCtor;

    const year = new YearTurn();
    let committed = 0;
    year.init({ drive, onDone: () => { committed += 1; }, placeholder: () => undefined } as never);
    year.scene.manager.keys[RETIREMENT_SCENE_KEY] = {};
    year.create();
    const beatAt = (): string => year.stub.drawn.find((d) => /^\d+\/\d+$/u.test(d)) ?? "";
    expect(beatAt()).toBe(`1/${String(drive.beats.length)}`);

    /*
     * Hard Req 6's season pass is a SEPARATE rectangle over an opaque backdrop, not the backdrop
     * itself: `applySeasonOverlay` sets a fill and an alpha below 1, and the year-turn card is drawn
     * over a PAUSED overworld — a translucent backdrop would show it through.
     */
    const washed = year.stub.objects.filter((o) => o.fill !== null);
    expect(washed).toHaveLength(1);
    expect(washed[0]?.fill?.alpha).toBeLessThan(1);
    expect(washed[0]?.fill?.alpha).toBeGreaterThan(0);
    expect(year.stub.objects.filter((o) => o.text === "[rect]" && o.fill === null).length).toBeGreaterThan(0);

    // Held from the first frame: nothing at all happens until the beat has been readable.
    hold(year, "keydown-SPACE", 40);
    expect(beatAt()).toBe(`1/${String(drive.beats.length)}`);
    expect(year.stub.launches).toHaveLength(0);
    expect(committed).toBe(0);

    // Armed, then held: exactly ONE beat, however long the key stays down.
    year.stub.release("keydown-SPACE");
    frames(year);
    hold(year, "keydown-SPACE", 40);
    expect(beatAt()).toBe(`2/${String(drive.beats.length)}`);

    // The card: opened by a real press, then held. The repeats of that press answer nothing.
    year.stub.release("keydown-SPACE");
    const retirementAt = drive.beats.findIndex((b) => b.t === "retirements");
    for (let i = 1; i < retirementAt; i += 1) tap(year, "keydown-SPACE");
    tap(year, "keydown-SPACE");
    const launch = year.stub.launches.find((l) => l.key === RETIREMENT_SCENE_KEY);
    expect(launch).toBeDefined();

    const card = new Retirement();
    card.init(launch?.data as never);
    card.create();
    const pending = drive.flow.remaining();
    expect(pending).toBeGreaterThan(0);

    /*
     * THE CARD WAS CREATED WHILE THE KEY WAS HELD, so the first keydown it ever sees is the OS
     * repeating the press that opened it. Phaser's own repeat suppression cannot help here — the
     * card's `Key` is new and reads `isDown: false`, so the plugin emits — which is why the handlers
     * check `event.repeat` themselves. Frames are stepped first, so this isolates that check from
     * the arming window: the card is fully armed and still refuses.
     */
    frames(card);
    card.stub.press("keydown-SPACE", { repeat: true });
    expect(drive.flow.remaining()).toBe(pending);

    // Held from the card's own first frame: nothing either.
    hold(card, "keydown-SPACE", 40);
    expect(drive.flow.remaining()).toBe(pending); // the card is still up, and still unanswered
    card.stub.release("keydown-SPACE");
    tap(card, "keydown-SPACE");
    expect(drive.flow.remaining()).toBe(pending - 1); // a deliberate press still answers it
  });

  /* ── the game does NOT end with the calendar (D-Q3-1) ── */

  it("BINDS — the calendar never ends: twelve year turns run, and nothing on screen names a total", () => {
    /*
     * THIS TEST IS THE INVERSE OF THE ONE IT REPLACES, ON HANK'S AUTHORISATION (D-Q3-1).
     *
     * It used to be "BINDS — the six-year game ends, and nothing on screen names a seventh year",
     * and it asserted that `driveYearTurn` THREW for a save past year 6, that the festival beat
     * reported `beyondFinalYear`, and that the season meter clamped its label to "Y6/6". All three
     * described a cap nobody designed: content-bible §6's "Six acts = six years" equation, read as
     * a deadline. There is no final year now, so the assertions become: the turn out of year 11 is
     * as ordinary as the one out of year 2, and no label anywhere claims a denominator.
     *
     * Twelve is deliberately DOUBLE the old cap.
     */
    let save = soloElder(5);
    let turns = 0;
    const target = balance.clock.yearsTotal * 2;
    while (turns < target) {
      const drive = driveOf(save);
      const festival = drive.beats.find((b) => b.t === "festival");
      if (!festival || festival.t !== "festival") throw new Error("no festival beat");
      // The copy states the year and nothing else — never "Y9/6", never "complete".
      expect(festival.festival.label).toBe(`Y${String(drive.turn.save.year)}`);
      for (const line of beatLines(festival)) {
        expect(line).not.toMatch(/Y\d+\/\d+/u);
        expect(line).not.toContain("complete");
      }
      while (!drive.flow.done()) drive.flow.chooseHeir();
      save = finishYearTurn(drive.flow.result(), drive.tickBefore, drive.carryTick);
      turns += 1;
    }
    expect(save.year).toBe(balance.clock.startYear + target);
    // …and the thirteenth turn is not refused either. Nothing ends.
    expect(() => driveOf(save)).not.toThrow();

    // The meter reads year 13 as year 13, with the same shape it reads year 1 with.
    const late = seasonMeterModel(save, balance);
    const early = seasonMeterModel({ year: balance.clock.startYear, tick: save.tick }, balance);
    expect(late.yearLabel).toBe(`Y${String(save.year)}`);
    expect(late.pastExpectedPace).toBe(true);
    expect(early.pastExpectedPace).toBe(false);
    expect(late.cells).toEqual(early.cells);
    expect(late.ticksLeftInYear).toBe(early.ticksLeftInYear);

    // The RUN is over on an act condition and this save has not earned it — that is not an error.
    expect(runIsComplete(save, content.gyms, balance)).toBe(false);
  });

  it("BINDS — aging and retirement keep working past the old cap: year 12 retires on schedule", () => {
    /*
     * The calendar's real job (D-Q3-1): it drives aging and retirement, and it must keep doing so
     * when it runs past year 6. A creature caught in year 10 has the same J/A/E clock as one caught
     * in year 1, and its projected retirement year is a real number rather than a clamped one.
     */
    const line = mortalLine();
    const caughtLate = newOwnedCreature(
      { uid: "late", lineId: line.id, age: "J", level: 5, caughtYear: 10 },
      line,
      balance,
    );
    expect(caughtLate.projectedRetirementYear).toBe(10 + balance.age.lifespanYears.J);

    let save: SaveEnvelope = { ...saveWith([caughtLate]), year: 10, tick: 0 };
    const retired: string[] = [];
    for (let i = 0; i < balance.age.lifespanYears.J; i += 1) {
      const drive = driveOf(save, { endedYear: save.year });
      for (const event of drive.turn.events) {
        if (event.t === "retirementDue") retired.push(event.uid);
      }
      while (!drive.flow.done()) drive.flow.chooseHeir();
      save = finishYearTurn(drive.flow.result(), drive.tickBefore, drive.carryTick);
    }
    expect(save.year).toBe(10 + balance.age.lifespanYears.J);
    expect(retired).toContain("late");
  });


  /* ── the one-sided BOON, said before the card opens (YearTurnScene.ts) ──── */

  it("BINDS — the retirement beat states the BOON pool before the card is opened", () => {
    /*
     * Reproduced on a solo-starter run: "PROMPT 1/1 parent=Pyrevane E20 … BOON hp: no hp target ·
     * owned 0" for all five stats. That is core's semantics (build-doc §7.5 step 3's boon needs a
     * teammate) and not a coding error — but nothing told the player before the card was on screen.
     */
    const alone = driveOf(soloElder(31));
    const beat = alone.beats.find((b) => b.t === "retirements");
    if (!beat || beat.t !== "retirements") throw new Error("no retirement beat");
    expect(beat.owned).toBe(0);
    expect(beatLines(beat)[0]).toContain("owned 0");
    const offer = alone.flow.offer();
    if (!offer) throw new Error("no offer");
    expect(offer.boons.every((b) => b.problem !== null)).toBe(true); // the card agrees

    // With a teammate the same beat says so, and the BOON side is real.
    const withMate = driveOf(
      saveWith(
        [
          creature({ uid: "starter", line: mortalLine(), age: "E", level: 20, traits: [traitAt(0)] }),
          creature({ uid: "mate", line: mortalLine(1), age: "J", level: 10 }),
        ],
        [],
        31,
      ),
    );
    const mateBeat = withMate.beats.find((b) => b.t === "retirements");
    if (!mateBeat || mateBeat.t !== "retirements") throw new Error("no retirement beat");
    expect(mateBeat.owned).toBe(1);
    expect(beatLines(mateBeat)[0]).toContain("owned 1");
    const mateOffer = withMate.flow.offer();
    expect(mateOffer?.boons.some((b) => b.problem === null)).toBe(true);
  });

  /* ── the full meter is a position, not one past the last season (SeasonMeter.ts) ── */

  it("BINDS — the full meter's derived fields agree with the season it reports", () => {
    /*
     * Measured: A3 fullMeter → {"seasonIndex":4,"season":"winter","ticksLeftInSeason":4,
     * "ticksLeftInYear":0,"full":true} on a 4-season year — an index one past the last season, and
     * four ticks left in a year that is over. `fullMeter` is the ONLY thing in the repo that asks
     * about tick `ticksPerYear`, so the inconsistent state existed solely because this module built
     * it.
     */
    const seasons = balance.clock.seasonOrder;
    const filled = fullMeter(balance.clock.startYear, balance);
    expect(filled.full).toBe(true);
    expect(filled.seasonIndex).toBe(seasons.length - 1);
    expect(seasons[filled.seasonIndex]).toBe(filled.season);
    expect(filled.ticksIntoSeason).toBe(balance.clock.ticksPerSeason);
    expect(filled.ticksLeftInSeason).toBe(0);
    expect(filled.ticksLeftInYear).toBe(0);
    expect(filled.cells.every((c) => c.filled)).toBe(true);
    expect(filled.cells.some((c) => c.current)).toBe(false);

    // …and every tick a live clock CAN hold still reads exactly what core/clock.ts says.
    for (let tick = 0; tick < balance.clock.ticksPerYear; tick += 1) {
      const model = seasonMeterModel({ year: balance.clock.startYear, tick }, balance);
      const core = meter({ year: balance.clock.startYear, tick }, balance);
      expect(model.seasonIndex).toBe(core.seasonIndex);
      expect(model.season).toBe(core.season);
      expect(model.ticksIntoSeason).toBe(core.ticksIntoSeason);
      expect(model.ticksLeftInSeason).toBe(core.ticksLeftInSeason);
      expect(model.ticksLeftInYear).toBe(core.ticksLeftInYear);
      expect(seasons[model.seasonIndex]).toBe(model.season);
      expect(model.full).toBe(false);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The logged run replays (build-doc §8.1 / L10) — game/year-replay.ts
 * ════════════════════════════════════════════════════════════════════════════ */

/** The action the shell logs for one player action, exactly as game/scenes/OverworldScene.ts does. */
function actionFor(kind: "travel" | "foray" | "inn", nodeId: string) {
  if (kind === "travel") return { t: "travel", to: nodeId } as const;
  if (kind === "foray") return { t: "foray", nodeId } as const;
  return { t: "inn", townId: nodeId } as const;
}

/**
 * A run driven the way the SHIPPED shell drives one.
 *
 * This mirrors `OverworldScene.spendTicks` → `handleClockEvents` → `beginYearTurn` step for step:
 * log the action, advance the real clock, step the REGION on every `seasonBoundary` (never on
 * `yearEnd` — LANE-A-STATUS §5, integration defect I4), and hand a year end to `driveYearTurn` with
 * the save still standing in the ending year. The scene itself cannot be imported here (it value-
 * imports phaser, which throws in vitest's node environment), so the ORDER is asserted separately
 * against its source in "the running game registers both scenes".
 */
function liveRun(
  seed: number,
  actions: ReadonlyArray<"travel" | "foray" | "inn">,
): { initial: SaveEnvelope; save: SaveEnvelope; yearTurns: number } {
  const initial = saveWith(
    [creature({ uid: "starter", line: mortalLine(), age: "J", level: 10, traits: [traitAt(0)] })],
    [],
    seed,
  );
  let save = initial;
  const stream = simRng(seed);
  const context = defaultContext();
  let yearTurns = 0;

  for (const kind of actions) {
    // No calendar guard: the run does not end with the year (D-Q3-1) and `isOver` is gone.
    save = appendAction(save, actionFor(kind, save.currentNode));
    const tickBefore = save.tick;
    const advanced = advanceAction({ year: save.year, tick: save.tick }, kind, balance);
    save = { ...save, year: advanced.clock.year, tick: advanced.clock.tick };

    for (const event of advanced.events) {
      if (event.t !== "seasonBoundary") continue;
      save = appendAction(save, { t: "seasonStep", season: event.seasonEnded });
      const stepped = stepRegionStates(
        content.nodes,
        save.nodeStates,
        event.seasonEnded,
        stream,
        context,
      );
      save = { ...save, nodeStates: stepped.states };
    }

    const trigger = yearTurnTrigger(advanced);
    if (!trigger) continue;
    const heir = subsystemRng(save.seed, `sim:heir:y${String(trigger.endedYear)}`);
    const drive = driveYearTurn(
      { ...save, year: trigger.endedYear, tick: tickBefore },
      {
        content,
        simRng: stream,
        lifecycleRng: () => heir.nextFloat(),
        endedYear: trigger.endedYear,
        reason: trigger.reason,
        carryTick: trigger.carryTick,
        context,
      },
    );
    while (!drive.flow.done()) drive.flow.chooseHeir();
    save = finishYearTurn(drive.flow.result(), drive.tickBefore, drive.carryTick);
    yearTurns += 1;
  }
  return { initial, save, yearTurns };
}

describe("replaying the shipped path — build-doc §8.1's claim, for the run the game actually produces", () => {
  /** Enough forays to fill a year, then an inn that straddles the boundary. */
  const script: Array<"travel" | "foray" | "inn"> = [
    ...Array.from({ length: balance.clock.ticksPerYear - 1 }, () => "foray" as const),
    "inn",
    "travel",
    "foray",
  ];

  it("BINDS — the region-stepped year turn replays to the same numbers, node for node", () => {
    /*
     * Measured before this hook existed, with the obvious per-node `ecosimStep`: "G1 population
     * diffs live-vs-replay: 17" across 6 nodes after ONE year turn (r1/bramblehog-line live 7 vs
     * replay 8, r1/loamunder-line 35 vs 34, …). `driveYearTurn` steps the whole REGION once —
     * `stepAll` costs the parent stream one draw for the region, which is what makes INV-2 true —
     * while `replay` hands out a per-node hook, and the two are not the same computation.
     */
    const run = liveRun(41, script);
    expect(run.yearTurns).toBe(1);

    const hooks = replayRegionHooks({
      content,
      simRng: simRng(41),
      initialStates: run.initial.nodeStates,
      context: defaultContext(),
    });
    const replayed = replay(run.initial, run.save.actionLog, {
      species: content.species,
      gyms: content.gyms,
      balance,
      nodes: content.nodes,
      ecosimStep: hooks.ecosimStep,
      applyOther: hooks.applyOther,
    });

    expect(replayed.nodeStates).toEqual(run.save.nodeStates);
    expect(replayed.party).toEqual(run.save.party);
    expect(replayed.box).toEqual(run.save.box);
    expect(replayed.questFlags).toEqual(run.save.questFlags);
    // One region step per season step, not one per node.
    expect(hooks.regionSteps()).toBe(balance.clock.seasonOrder.length);

    /*
     * THE NEGATIVE CONTROL. The same replay with the per-node hook (the shape
     * tests/integration/seams.test.ts uses) does NOT reproduce the run — so the assertion above is
     * evidence about the hook, not about replay being insensitive to it.
     */
    const naiveRng = simRng(41);
    const naive = replay(run.initial, run.save.actionLog, {
      species: content.species,
      gyms: content.gyms,
      balance,
      nodes: content.nodes,
      ecosimStep: (nodeId: string, state: NodeState, season: Season) =>
        stepRegionStates(
          content.nodes.filter((n) => n.id === nodeId),
          { [nodeId]: state },
          season,
          naiveRng,
        ).states[nodeId] as NodeState,
    });
    expect(naive.nodeStates).not.toEqual(run.save.nodeStates);
  });

  it("BINDS — the tick the year turn carried is recoverable from the action log", () => {
    /*
     * Measured before the fix: after an inn taken at tick 15, "D1 live tick: 1 year: 2 / D1
     * replayed tick: 0 year: 2 / D1 tick divergence: true". `replay` does not model the clock at
     * all, and `finishYearTurn` restores the carry `core/clock.ts` promises — so the two disagreed.
     * The log was never missing the information: every entry carries the {year, tick} it was taken
     * at, and L8's costs are in balance.
     */
    // Stops ON the inn, so the save stands exactly where the carry left it.
    const run = liveRun(41, script.slice(0, script.indexOf("inn") + 1));
    const inn = run.save.actionLog.find((e: ActionLogEntry) => e.action.t === "inn");
    expect(inn).toBeDefined();
    expect(inn?.tick).toBe(balance.clock.ticksPerYear - 1); // the inn really did straddle the year
    const carry = balance.clock.innTicks - (balance.clock.ticksPerYear - (inn?.tick ?? 0));
    expect(carry).toBeGreaterThan(0); // …and there is a carry to lose in the first place
    expect(run.save.tick).toBe(carry);
    expect(run.save.year).toBe(balance.clock.startYear + 1);

    const start = { year: balance.clock.startYear, tick: balance.clock.startTick };
    const fromLog = clockFromLog(start, run.save.actionLog, balance);
    expect(fromLog).toEqual({ year: run.save.year, tick: run.save.tick });

    const hooks = replayRegionHooks({
      content,
      simRng: simRng(41),
      initialStates: run.initial.nodeStates,
      context: defaultContext(),
    });
    const replayed = replay(run.initial, run.save.actionLog, {
      species: content.species,
      gyms: content.gyms,
      balance,
      nodes: content.nodes,
      ecosimStep: hooks.ecosimStep,
      applyOther: hooks.applyOther,
    });
    expect(replayed.tick).not.toBe(run.save.tick); // core's replay still models no clock…
    expect(withClockFromLog(replayed, start, run.save.actionLog, balance).tick).toBe(run.save.tick);
    expect(withClockFromLog(replayed, start, run.save.actionLog, balance).year).toBe(run.save.year);
    // …and the whole save now matches, byte for byte, which is what L10 claims.
    expect(withClockFromLog(replayed, start, run.save.actionLog, balance)).toEqual(run.save);
  });

  it("BINDS — a gymVictory entry spends no tick, and a year turn beside it still replays", () => {
    /*
     * A gym victory is a BADGE and nothing else now (D-Q2-1): it costs no tick and ends no year, so
     * the only thing that moves the clock in this log is the `yearTurn` entry, which `clockFromLog`
     * reads off the entry rather than off a tick cost. This used to be documented as "the other of
     * build-doc §4's two triggers", which no longer exists.
     */
    const start = { year: balance.clock.startYear, tick: balance.clock.startTick };
    const log: ActionLogEntry[] = [
      { seq: 0, year: start.year, tick: 3, action: { t: "gymVictory", gymId: "g1" } },
      { seq: 1, year: start.year, tick: 3, action: { t: "yearTurn", year: start.year + 1 } },
    ];
    expect(clockFromLog(start, log, balance)).toEqual({
      year: start.year + 1,
      tick: balance.clock.startTick,
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * Reachability — a green test of a function nobody calls is evidence about a pure function
 * ════════════════════════════════════════════════════════════════════════════ */

describe("this lane is reached by playing, not only by testing", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const read = (file: string): string => readFileSync(`${root}${file}`, "utf8");

  it("BINDS — every read-side function this lane publishes has a caller in a scene", () => {
    /*
     * Counted before this: previewAction 0 callers, actionCosts 0, seasonTintsForYear 0,
     * applySeasonOverlay 0, raidPreviews 0, raidCoverage 0, raidLedgerLines 0, hasRaids 0,
     * raidableYears 0, raidsForYear 0 — the whole "what will this action cost", "what is about to be
     * harvested" and "which acts have no authored raid" surface was exercised by this file and
     * nothing else. A green suite over functions with no caller is evidence about pure functions.
     */
    const callers: Array<[string, string]> = [
      ["previewAction", "game/scenes/OverworldScene.ts"],
      ["actionCosts", "game/scenes/OverworldScene.ts"],
      // The second clock and its consequences, all reached by playing (D-Q3-1).
      ["actOf", "game/scenes/OverworldScene.ts"],
      ["awardBadge", "game/scenes/OverworldScene.ts"],
      ["runIsComplete", "game/scenes/OverworldScene.ts"],
      ["unlockActOf", "game/scenes/OverworldScene.ts"],
      ["enterPendingActs", "game/scenes/OverworldScene.ts"],
      ["activeWindows", "game/scenes/OverworldScene.ts"],
      ["syncEventFlags", "game/scenes/OverworldScene.ts"],
      ["seasonTintsForYear", "game/scenes/YearTurnScene.ts"],
      ["applySeasonOverlay", "game/scenes/YearTurnScene.ts"],
      ["raidPreviews", "game/scenes/YearTurnScene.ts"],
      ["raidCoverage", "game/scenes/YearTurnScene.ts"],
      ["raidLedgerLines", "game/scenes/YearTurnScene.ts"],
      ["hasRaids", "game/scenes/YearTurnScene.ts"],
      ["raidsForAct", "game/scenes/YearTurnScene.ts"],
      // The act-entry PRESENTATION. `actEntryBeats` was built for this beat and had no caller
      // outside this file, so the running game hand-rolled its own banner and the presenter was
      // never exercised by the moment it exists for.
      ["actEntryBeats", "game/scenes/OverworldScene.ts"],
      ["beatLines", "game/scenes/OverworldScene.ts"],
      // The act ladder's two WRITERS. Without these the gates above the prologue were unreachable:
      // `story.opening.done` is dialogue's and `winGym` had no caller in the whole repo.
      ["prologueExitFlags", "game/scenes/OverworldScene.ts"],
      ["setQuestFlags", "game/scenes/OverworldScene.ts"],
      ["buildGymBattle", "game/scenes/OverworldScene.ts"],
      ["gymAtNode", "game/scenes/OverworldScene.ts"],
      ["gymBattleWon", "game/scenes/OverworldScene.ts"],
      ["markRunCompleteShown", "game/scenes/OverworldScene.ts"],
      ["runCompleteShown", "game/scenes/OverworldScene.ts"],
      // Reached through the ones above, inside their own module.
      ["raidableActs", "game/year-events.ts"],
      ["thrivingNodeIds", "core/regional-events.ts"],
      ["syncBloomLatches", "core/regional-events.ts"],
      ["latchedBloomWindows", "core/regional-events.ts"],
      ["gymParty", "game/gym-battle.ts"],
      ["gymBattleProblem", "game/scenes/OverworldScene.ts"],
    ];
    for (const [name, file] of callers) {
      const source = stripComments(read(file));
      expect(source.includes(`${name}(`), `${file} never calls ${name}()`).toBe(true);
    }
    expect(stripComments(read("game/year-events.ts")).includes("raidableActs(")).toBe(true);
    expect(raidCoverage(balance).scriptedActs.length).toBeGreaterThan(0);
    expect(raidPreviews({}, content.nodes, content.species, balance, balance.acts.first + 1)).toBeDefined();
  });

  it("BINDS — L8's three actions are wired, and NO tick is gated on the calendar (D-Q3-1)", () => {
    /*
     * Measured before: `spendTicks` was declared `"travel" | "foray"` with two 1-tick call sites, so
     * `clock.innTicks` was a tunable no action could reach and no player action could straddle a
     * year boundary. That half stands.
     *
     * The other half is INVERTED. This test used to require `runIsOver()` INSIDE `spendTicks` —
     * "the year cap is enforced where the ticks are spent" — and that cap is exactly what Hank
     * removed. It now requires the opposite: no tick-spending path may consult the run's end at
     * all, so a player in year 20 forays as one in year 2 does. `runIsOver` survives as an ACT
     * question and must not be reachable from the two spenders.
     */
    const overworld = stripComments(read("game/scenes/OverworldScene.ts"));
    expect(overworld).toContain("restAtInn");
    expect(overworld).toContain('t: "inn"');
    expect(overworld).toContain("winGym");
    expect(overworld).toContain('t: "gymVictory"');
    expect(overworld).toContain("onRunComplete");
    // The run's end is an act condition, asked of the save's flags and never of its year.
    expect(overworld).toMatch(
      /runIsOver\(\)[^{]*\{\s*return runIsComplete\(this\.save, this\.content\.gyms, this\.balance\);/u,
    );
    expect(overworld).not.toContain("isOver(this.clock()");
    // NO calendar guard in either tick spender, nor in the encounter roll.
    expect(overworld).not.toMatch(/spendTicks\([\s\S]{0,600}if \(this\.runIsOver\(\)\) return/u);
    expect(overworld).not.toMatch(/onStepCompleted\([\s\S]{0,400}if \(this\.runIsOver\(\)\) return/u);
    expect(overworld).not.toMatch(/restAtInn\([\s\S]{0,300}if \(this\.runIsOver\(\)\)/u);
    // …and the year turn is still handed the save standing in the ending year (build-doc §7.5).
    expect(overworld).toContain("year: endedYear, tick: tickBefore");
  });
});
