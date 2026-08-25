/**
 * tests/unit/clock.test.ts — locked decision L8, tested as stated:
 * "16-tick season meter; travel 1 / foray 1 / inn 2; year = gym victory or full meter."
 *
 * Plus build-doc §4: "At each season boundary (every 4 ticks) `ecosim.step()` runs the population
 * update (§7.3). At gym victory or tick 16, the year turn runs …" — so the events this module emits
 * are the sim's and the year turn's only cue, and their ORDER is load-bearing.
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
  createClock,
  gymVictory,
  isOver,
  meter,
  seasonAt,
  seasonOf,
  seasonsOfYear,
  ticksForAction,
  type ClockEvent,
  type ClockState,
} from "../../core/clock";
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

describe("clock — the year ends at gym victory OR a full meter (L8)", () => {
  it("ends the year at tick 16 with yearEnd → yearBegin and NO boundary of its own", () => {
    const { clock, events } = advance({ year: 1, tick: 12 }, ticksPerSeason, balance);
    // No `seasonBoundary`: core/lifecycle.ts `runYearTurn` runs seasonOrder[last] itself
    // (build-doc §7.5 step 5). A cue here as well is the season stepped twice.
    expect(events.map((e) => e.t)).toEqual(["yearEnd", "yearBegin"]);
    expect(events[0]).toMatchObject({ year: 1, reason: "meter" });
    expect(clock).toEqual({ year: 2, tick: 0 });
  });

  it("a gym win ends the year wherever the meter stands, and cues no season step of its own", () => {
    for (const tick of [0, 1, 5, 9, 15]) {
      const { clock, events } = gymVictory({ year: 2, tick }, balance);
      expect(events.map((e) => e.t)).toEqual(["yearEnd", "yearBegin"]);
      expect(events[0]).toMatchObject({ year: 2, reason: "gymVictory" });
      expect(clock).toEqual({ year: 3, tick: 0 });
      // The ecology still advances exactly once for the year — through the year turn, which steps
      // `seasonOrder[last]` regardless of where the meter stood. This module used to report the
      // season the player was standing in, which disagreed with what actually got stepped.
      expect(seasonAt(tick, balance)).toBe(seasonOrder[Math.floor(tick / ticksPerSeason)]);
    }
  });

  it("runs out after balance.clock.yearsTotal years", () => {
    expect(isOver({ year: balance.clock.yearsTotal, tick: 0 }, balance)).toBe(false);
    expect(isOver({ year: balance.clock.yearsTotal + 1, tick: 0 }, balance)).toBe(true);
  });

  it("a six-year game is 24 season steps: 18 clock boundaries + 6 year turns", () => {
    let clock = createClock(balance);
    const events: ClockEvent[] = [];
    while (!isOver(clock, balance)) {
      const result = advanceAction(clock, "foray", balance);
      clock = result.clock;
      events.push(...result.events);
    }
    const years = balance.clock.yearsTotal;
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
