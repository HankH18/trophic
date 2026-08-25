/**
 * tests/unit/clock.test.ts — locked decision L8 AS AMENDED, tested as stated:
 * "16-tick season meter; travel 1 / foray 1 / inn 2; **year = full meter**."
 *
 * Plus build-doc §4: "At each season boundary (every 4 ticks) `ecosim.step()` runs the population
 * update (§7.3). At tick 16 the year turn runs …" — so the events this module emits are the sim's
 * and the year turn's only cue, and their ORDER is load-bearing.
 *
 * ⚠ TWO ASSERTIONS IN THIS FILE WERE REWRITTEN BY AN AUTHORISED AMENDMENT, not by a failure
 * (docs/DEVIATIONS.md D-Q2-1 / D-Q3-1, Hank's words quoted there):
 *   • "a gym win ends the year wherever the meter stands" — the trigger is gone; the assertion is
 *     now that a gym win leaves the meter EXACTLY where it stood, which is the opposite claim and
 *     is checked against the shipped act model in tests/unit/acts.test.ts;
 *   • "runs out after balance.clock.yearsTotal years" — nothing runs out; the calendar is unbounded
 *     and year 12 is asserted to work.
 *
 * ⚠ WHO RUNS THE YEAR'S LAST SEASON STEP. Resolved at integration in favour of build-doc §7.5
 * step 5, which inlines it: the YEAR TURN runs "their 4th season step", and core/lifecycle.ts
 * `runYearTurn` does. This module therefore emits NO `seasonBoundary` for the year-filling tick and
 * none at all for a gym victory. It used to emit both, so a caller doing the documented thing —
 * step the sim on every boundary, run the year turn on `yearEnd` — ran FIVE season steps a year
 * instead of four (and at a gym win the two disagreed about WHICH season it was). The assertions
 * below were rewritten to the resolved contract; the count they now check is
 * `boundaries + one year-turn step per year = seasons per year`, which is the real invariant.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  advance,
  advanceAction,
  absoluteTick,
  clockAtAbsoluteTick,
  createClock,
  meter,
  seasonAt,
  seasonOf,
  seasonStartTick,
  seasonsOfYear,
  ticksForAction,
  type ClockEvent,
  type ClockState,
} from "../../core/clock";
import * as clockModule from "../../core/clock";
import type { Balance } from "../../core/types";
import balanceJson from "../../data/balance.json";

const balance = balanceJson as unknown as Balance;
const { ticksPerSeason, ticksPerYear, seasonOrder } = balance.clock;

const boundaries = (events: ClockEvent[]) => events.filter((e) => e.t === "seasonBoundary");
const yearEnds = (events: ClockEvent[]) => events.filter((e) => e.t === "yearEnd");

describe("clock — the 16-tick season meter (L8)", () => {
  it("charges travel 1 / foray 1 / inn 2, from balance.json", () => {
    expect(ticksForAction("travel", balance)).toBe(balance.clock.travelTicks);
    expect(ticksForAction("foray", balance)).toBe(balance.clock.forayTicks);
    expect(ticksForAction("inn", balance)).toBe(balance.clock.innTicks);
    expect(balance.clock.travelTicks).toBe(1);
    expect(balance.clock.forayTicks).toBe(1);
    expect(balance.clock.innTicks).toBe(2);
    expect(ticksPerYear).toBe(16);
    expect(ticksPerSeason).toBe(4);
  });

  it("starts where balance says it starts", () => {
    const clock = createClock(balance);
    expect(clock).toEqual({ year: balance.clock.startYear, tick: balance.clock.startTick });
    expect(seasonOf(clock, balance)).toBe(seasonOrder[0]);
  });

  it("splits the year into four equal seasons, in balance order", () => {
    for (let tick = 0; tick < ticksPerYear; tick++) {
      expect(seasonAt(tick, balance)).toBe(seasonOrder[Math.floor(tick / ticksPerSeason)]);
    }
    expect(seasonsOfYear(balance)).toEqual([...seasonOrder]);
  });

  it("reports the meter for the HUD without lying about what is left", () => {
    const m = meter({ year: 2, tick: 6 }, balance);
    expect(m).toMatchObject({
      year: 2,
      tick: 6,
      season: seasonOrder[1],
      seasonIndex: 1,
      ticksIntoSeason: 2,
      ticksLeftInSeason: 2,
      ticksLeftInYear: 10,
    });
  });
});

describe("clock — season boundaries every 4 ticks (build-doc §4)", () => {
  it("emits a boundary for every season EXCEPT the one the year turn runs", () => {
    let clock = createClock(balance);
    const events: ClockEvent[] = [];
    for (let i = 0; i < ticksPerYear; i++) {
      const result = advanceAction(clock, "foray", balance);
      clock = result.clock;
      events.push(...result.events);
    }
    // build-doc §7.5 step 5 gives the last season to the year turn, so the clock cues the other
    // three. Together they are the four seasons of the year, each stepped exactly once.
    expect(boundaries(events)).toHaveLength(seasonOrder.length - 1);
    expect(boundaries(events).map((b) => b.seasonEnded)).toEqual(seasonOrder.slice(0, -1));
    expect(yearEnds(events)).toHaveLength(1);
    expect(boundaries(events).length + yearEnds(events).length).toBe(seasonOrder.length);
    expect(clock).toEqual({ year: balance.clock.startYear + 1, tick: 0 });
  });

  it("a 2-tick inn that crosses a boundary emits it exactly once", () => {
    const { clock, events } = advanceAction({ year: 1, tick: 3 }, "inn", balance);
    expect(clock).toEqual({ year: 1, tick: 5 });
    expect(boundaries(events)).toHaveLength(1);
    expect(boundaries(events)[0]).toMatchObject({
      tick: 4,
      seasonEnded: seasonOrder[0],
      seasonBegun: seasonOrder[1],
    });
  });

  it("an inn that lands on a boundary emits it once, not twice", () => {
    const { clock, events } = advanceAction({ year: 1, tick: 2 }, "inn", balance);
    expect(clock).toEqual({ year: 1, tick: 4 });
    expect(boundaries(events)).toHaveLength(1);
  });

  it("carries leftover ticks into the new year rather than dropping them", () => {
    const { clock, events } = advanceAction({ year: 1, tick: 15 }, "inn", balance);
    expect(yearEnds(events)).toHaveLength(1);
    expect(clock).toEqual({ year: 2, tick: 1 });
  });

  it("never mutates the clock it was handed", () => {
    const clock: ClockState = { year: 1, tick: 15 };
    advance(clock, 5, balance);
    expect(clock).toEqual({ year: 1, tick: 15 });
  });

  it("does nothing for a zero-tick advance", () => {
    const { clock, events } = advance({ year: 3, tick: 7 }, 0, balance);
    expect(clock).toEqual({ year: 3, tick: 7 });
    expect(events).toEqual([]);
  });
});

describe("clock — the year ends on a full meter and on NOTHING else (L8 as amended, D-Q2-1)", () => {
  it("ends the year at tick 16 with yearEnd → yearBegin and NO boundary of its own", () => {
    const { clock, events } = advance({ year: 1, tick: 12 }, ticksPerSeason, balance);
    // No `seasonBoundary`: core/lifecycle.ts `runYearTurn` runs seasonOrder[last] itself
    // (build-doc §7.5 step 5). A cue here as well is the season stepped twice.
    expect(events.map((e) => e.t)).toEqual(["yearEnd", "yearBegin"]);
    expect(events[0]).toMatchObject({ year: 1, reason: "meter" });
    expect(clock).toEqual({ year: 2, tick: 0 });
  });

  it("THE YEAR ENDS ON THE METER AND ON NOTHING ELSE — the module has no other year-end path", () => {
    /*
     * D-Q2-1. `gymVictory()` was the second path and it is gone. This asserts the absence
     * structurally rather than by comment: over every tick of a year, and every action, the ONLY
     * `yearEnd` the module can produce carries reason "meter", and it can only be produced by an
     * advance that fills the meter.
     */
    const exported = Object.keys(clockModule);
    expect(exported).not.toContain("gymVictory");
    expect(exported).not.toContain("isOver");

    for (let tick = 0; tick < ticksPerYear; tick += 1) {
      for (const kind of ["travel", "foray", "inn"] as const) {
        const { clock, events } = advanceAction({ year: 2, tick }, kind, balance);
        const ends = yearEnds(events);
        const fills = tick + ticksForAction(kind, balance) >= ticksPerYear;
        expect(ends).toHaveLength(fills ? 1 : 0);
        for (const end of ends) expect(end.reason).toBe("meter");
        expect(clock.year).toBe(fills ? 3 : 2);
      }
    }
  });

  it("THE CALENDAR IS UNBOUNDED — year 12, year 40 and year 999 all advance normally", () => {
    // D-Q3-1: nothing runs out. `isOver` used to say the run was over past year 6 and it is gone.
    for (const year of [7, 12, 40, 999]) {
      const { clock, events } = advance({ year, tick: ticksPerYear - 1 }, 1, balance);
      expect(clock).toEqual({ year: year + 1, tick: 0 });
      expect(yearEnds(events)).toHaveLength(1);
      expect(yearEnds(events)[0]).toMatchObject({ year, reason: "meter" });
      // Seasons keep cycling: year 12 has the same four in the same order as year 1.
      expect(seasonsOfYear(balance)).toEqual(seasonOrder);
      expect(seasonAt(0, balance)).toBe(seasonOrder[0]);
    }
    // And walking there tick by tick from the start costs nothing but ticks.
    let clock = createClock(balance);
    while (clock.year < 12) clock = advanceAction(clock, "foray", balance).clock;
    expect(clock).toEqual({ year: 12, tick: 0 });
  });

  it("absolute ticks round-trip past the old cap, so a season window can straddle any year", () => {
    for (const c of [{ year: 1, tick: 0 }, { year: 6, tick: 15 }, { year: 9, tick: 4 }, { year: 137, tick: 11 }]) {
      const abs = absoluteTick(c, balance);
      expect(clockAtAbsoluteTick(abs, balance)).toEqual(c);
      expect(seasonStartTick(abs, balance) % ticksPerSeason).toBe(0);
      expect(abs - seasonStartTick(abs, balance)).toBeLessThan(ticksPerSeason);
    }
  });

  it("six years is 24 season steps: 18 clock boundaries + 6 year turns", () => {
    let clock = createClock(balance);
    const events: ClockEvent[] = [];
    const years = balance.clock.yearsTotal;
    // Bounded by the EXPECTED pacing, not by an end: the loop stops because the test asked for six
    // years, not because the calendar refused a seventh (D-Q3-1).
    while (clock.year < balance.clock.startYear + years) {
      const result = advanceAction(clock, "foray", balance);
      clock = result.clock;
      events.push(...result.events);
    }
    expect(yearEnds(events)).toHaveLength(years);
    expect(boundaries(events)).toHaveLength(years * (seasonOrder.length - 1));
    // THE number that matters: one season step per season of the game, no more and no less. The
    // year turn supplies one per year; before integration the clock supplied a fourth as well and
    // this came to 30, inflating every six-year trajectory by 25%.
    expect(boundaries(events).length + yearEnds(events).length).toBe(years * seasonOrder.length);
    expect(boundaries(events).length + yearEnds(events).length).toBe(24);
  });
});

describe("clock — property: no tick is lost or double-counted", () => {
  it("boundaries and year ends follow from the total ticks spent, for any action sequence", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("travel" as const, "foray" as const, "inn" as const), {
          minLength: 1,
          maxLength: 120,
        }),
        (actions) => {
          let clock = createClock(balance);
          const events: ClockEvent[] = [];
          let spent = 0;
          for (const action of actions) {
            spent += ticksForAction(action, balance);
            const result = advanceAction(clock, action, balance);
            clock = result.clock;
            events.push(...result.events);
          }
          // One boundary per completed season, MINUS the one each completed year hands to the
          // year turn (build-doc §7.5 step 5). Boundaries + year ends is still one cue per season.
          const seasonsDone = Math.floor(spent / ticksPerSeason);
          const yearsDone = Math.floor(spent / ticksPerYear);
          expect(boundaries(events)).toHaveLength(seasonsDone - yearsDone);
          expect(yearEnds(events)).toHaveLength(yearsDone);
          expect(boundaries(events).length + yearEnds(events).length).toBe(seasonsDone);
          expect(clock.year).toBe(balance.clock.startYear + Math.floor(spent / ticksPerYear));
          expect(clock.tick).toBe(spent % ticksPerYear);
          // Every boundary reports the season that just ended, so the sim can never step the wrong one.
          for (const b of boundaries(events)) {
            expect(seasonOrder).toContain(b.seasonEnded);
            expect(b.seasonBegun).toBe(seasonOrder[(seasonOrder.indexOf(b.seasonEnded) + 1) % seasonOrder.length]);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
