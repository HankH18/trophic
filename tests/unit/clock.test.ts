/**
 * tests/unit/clock.test.ts — locked decision L8 AS AMENDED, tested as stated:
 * "52-tick YEAR meter; travel 1 / foray 1 / inn 2 / battle 0.5; **year = full meter**."
 *
 * Plus build-doc §4: at each season boundary `ecosim.step()` runs the population update (§7.3), and
 * when the meter fills the year turn runs — so the events this module emits are the sim's and the
 * year turn's only cue, and their ORDER is load-bearing.
 *
 * ⚠ NO TICK COUNT IS WRITTEN AS A LITERAL BELOW, AND THAT IS DELIBERATE. This file used to pin
 * `ticksPerYear` to 16 and `ticksPerSeason` to 4, and sampled ticks 3 / 12 / 15 chosen by hand
 * against those. When the meter was retuned to 52/13 every one of those pins broke, and none of
 * them broke for a reason anyone cared about — the numbers were never the claim. The claims are:
 * the year is a whole number of seasons, an action that straddles a boundary emits it once, and an
 * action that overruns the meter carries its overshoot into the new year. Each is now expressed
 * against `balance.clock`, so the retune the owner has already promised after playtesting moves the
 * fixtures with the data instead of reddening this file. The ONE identity still asserted as an
 * equation — `ticksPerYear === ticksPerSeason × seasonOrder.length` — is asserted because
 * core/clock.ts's loop and core/regional-events.ts's windows both depend on it.
 *
 * ⚠ TWO ASSERTIONS IN THIS FILE WERE REWRITTEN BY AN AUTHORISED AMENDMENT, not by a failure:
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
  subTicksForAction,
  type ClockEvent,
  type ClockState,
} from "../../core/clock";
import * as clockModule from "../../core/clock";
import type { Balance } from "../../core/types";
import balanceJson from "../../data/balance.json";

const balance = balanceJson as unknown as Balance;
const { ticksPerSeason, ticksPerYear, seasonOrder, innTicks, forayTicks } = balance.clock;

const boundaries = (events: ClockEvent[]) => events.filter((e) => e.t === "seasonBoundary");
const yearEnds = (events: ClockEvent[]) => events.filter((e) => e.t === "yearEnd");

/** A clock at the very start of `tick`, in `year`. The shape every fixture below starts from. */
const at = (year: number, tick: number, subTick = 0): ClockState => ({ year, tick, subTick });

describe("clock — the year meter (L8)", () => {
  it("charges travel 1 / foray 1 / inn 2 / battle 0.5, from balance.json", () => {
    expect(ticksForAction("travel", balance)).toBe(balance.clock.travelTicks);
    expect(ticksForAction("foray", balance)).toBe(balance.clock.forayTicks);
    expect(ticksForAction("inn", balance)).toBe(balance.clock.innTicks);
    expect(ticksForAction("battle", balance)).toBe(balance.clock.battleTicks);
    // The four costs L8 states in words are the four this module can charge, and nothing else may
    // appear without turning `ticksForAction`'s switch red.
    expect(balance.clock.travelTicks).toBe(1);
    expect(balance.clock.forayTicks).toBe(1);
    expect(balance.clock.innTicks).toBe(2);
    expect(balance.clock.battleTicks).toBe(0.5);
    /*
     * THE IDENTITY, not the values. `advance()` walks to the nearer of the next season boundary and
     * the year fill, and core/regional-events.ts measures a window in whole seasons off
     * `absoluteTick`; both are only coherent if a year is a whole number of seasons. core/schemas.ts
     * refines this at boot (R1) — asserting it here as well is what makes the refine non-vacuous
     * against the SHIPPED balance rather than only against the mutants in clock-subtick.test.ts.
     */
    expect(ticksPerYear).toBe(ticksPerSeason * seasonOrder.length);
    expect(ticksPerSeason).toBeGreaterThan(0);
    // And every cost has to fit inside a season, or a single action could skip a boundary entirely
    // and the sim would never be cued for it (R4).
    for (const kind of ["travel", "foray", "inn", "battle"] as const) {
      expect(ticksForAction(kind, balance)).toBeLessThan(ticksPerSeason);
    }
  });

  it("starts where balance says it starts", () => {
    const clock = createClock(balance);
    expect(clock).toEqual({ year: balance.clock.startYear, tick: balance.clock.startTick, subTick: 0 });
    expect(seasonOf(clock, balance)).toBe(seasonOrder[0]);
  });

  it("splits the year into four equal seasons, in balance order", () => {
    for (let tick = 0; tick < ticksPerYear; tick++) {
      expect(seasonAt(tick, balance)).toBe(seasonOrder[Math.floor(tick / ticksPerSeason)]);
    }
    expect(seasonsOfYear(balance)).toEqual([...seasonOrder]);
  });

  it("reports the meter for the HUD without lying about what is left", () => {
    // Partway through the SECOND season, and on an odd sub-tick — the state a battle leaves behind.
    const into = Math.floor(ticksPerSeason / 2);
    const tick = ticksPerSeason + into;
    const m = meter(at(2, tick, 1), balance);
    expect(m).toMatchObject({
      year: 2,
      tick,
      subTick: 1,
      subTicksPerTick: balance.clock.subTicksPerTick,
      ticksPerYear,
      ticksPerSeason,
      season: seasonOrder[1],
      seasonIndex: 1,
      ticksIntoSeason: into,
      ticksLeftInSeason: ticksPerSeason - into,
      ticksLeftInYear: ticksPerYear - tick,
    });
    // "Without lying about what is left" is the claim, and these two are it: the readout must
    // account for every tick of the season and every tick of the year exactly once.
    expect(m.ticksIntoSeason + m.ticksLeftInSeason).toBe(ticksPerSeason);
    expect(m.tick + m.ticksLeftInYear).toBe(ticksPerYear);
    expect(m.subTick).toBeLessThan(m.subTicksPerTick);
  });
});

describe("clock — season boundaries every ticksPerSeason (build-doc §4)", () => {
  it("emits a boundary for every season EXCEPT the one the year turn runs", () => {
    let clock = createClock(balance);
    const events: ClockEvent[] = [];
    // One year's worth of forays — derived from the cost, so a foray that stops being one tick
    // still walks exactly one year rather than silently walking a fraction of one.
    for (let i = 0; i < ticksPerYear / forayTicks; i++) {
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
    expect(clock).toEqual({ year: balance.clock.startYear + 1, tick: 0, subTick: 0 });
  });

  it("an inn that crosses a boundary emits it exactly once", () => {
    // Start late enough in the first season that the inn STRADDLES the boundary: it must land
    // past it without either skipping the cue or emitting it twice.
    const start = ticksPerSeason - (innTicks - 1);
    const { clock, events } = advanceAction(at(1, start), "inn", balance);
    expect(clock).toEqual({ year: 1, tick: start + innTicks, subTick: 0 });
    expect(clock.tick).toBeGreaterThan(ticksPerSeason); // it really did straddle, not land on it
    expect(boundaries(events)).toHaveLength(1);
    expect(boundaries(events)[0]).toMatchObject({
      tick: ticksPerSeason,
      seasonEnded: seasonOrder[0],
      seasonBegun: seasonOrder[1],
    });
  });

  it("an inn that lands on a boundary emits it once, not twice", () => {
    const { clock, events } = advanceAction(at(1, ticksPerSeason - innTicks), "inn", balance);
    expect(clock).toEqual({ year: 1, tick: ticksPerSeason, subTick: 0 });
    expect(boundaries(events)).toHaveLength(1);
  });

  it("carries leftover ticks into the new year rather than dropping them", () => {
    // The overshoot is the whole point: `advance()` once cleared it with `tick = 0`, which made the
    // last action of a year free. Starting one tick short of the meter, an inn owes the new year
    // everything past the fill.
    const { clock, events } = advanceAction(at(1, ticksPerYear - 1), "inn", balance);
    expect(yearEnds(events)).toHaveLength(1);
    expect(clock).toEqual({ year: 2, tick: innTicks - 1, subTick: 0 });
  });

  it("carries an ODD sub-tick across the year turn — a battle can straddle it too", () => {
    /*
     * Only the 2-tick inn could straddle the year turn until `battleTicks: 0.5` existed. Now a
     * one-tick action started from a half tick lands half a tick into the new year, and the
     * fraction has to survive the reset in `subTick` — the field exists precisely so this carry is
     * exact rather than a float.
     */
    const { clock, events } = advanceAction(at(1, ticksPerYear - 1, 1), "foray", balance);
    expect(yearEnds(events)).toHaveLength(1);
    expect(clock).toEqual({ year: 2, tick: 0, subTick: 1 });
  });

  it("never mutates the clock it was handed", () => {
    const clock: ClockState = at(1, ticksPerYear - 1, 1);
    advance(clock, ticksPerSeason, balance);
    expect(clock).toEqual(at(1, ticksPerYear - 1, 1));
  });

  it("does nothing for a zero-tick advance", () => {
    const { clock, events } = advance(at(3, ticksPerSeason + 1, 1), 0, balance);
    expect(clock).toEqual(at(3, ticksPerSeason + 1, 1));
    expect(events).toEqual([]);
  });
});

describe("clock — the year ends on a full meter and on NOTHING else (L8 as amended, D-Q2-1)", () => {
  it("ends the year when the meter fills, with yearEnd → yearBegin and NO boundary of its own", () => {
    // Walk the final season of the year in one advance, arriving exactly on the fill.
    const { clock, events } = advance(at(1, ticksPerYear - ticksPerSeason), ticksPerSeason, balance);
    // No `seasonBoundary`: core/lifecycle.ts `runYearTurn` runs seasonOrder[last] itself
    // (build-doc §7.5 step 5). A cue here as well is the season stepped twice.
    expect(events.map((e) => e.t)).toEqual(["yearEnd", "yearBegin"]);
    expect(events[0]).toMatchObject({ year: 1, reason: "meter" });
    expect(clock).toEqual({ year: 2, tick: 0, subTick: 0 });
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
      // `battle` is included because it is the only fractional cost, and a fraction is the one way
      // an action can now reach the fill from a tick that is not the last one.
      for (const kind of ["travel", "foray", "inn", "battle"] as const) {
        for (const subTick of [0, balance.clock.subTicksPerTick - 1]) {
          const { clock, events } = advanceAction(at(2, tick, subTick), kind, balance);
          const ends = yearEnds(events);
          const fills =
            tick + subTick / balance.clock.subTicksPerTick + ticksForAction(kind, balance) >= ticksPerYear;
          expect(ends).toHaveLength(fills ? 1 : 0);
          for (const end of ends) expect(end.reason).toBe("meter");
          expect(clock.year).toBe(fills ? 3 : 2);
        }
      }
    }
  });

  it("THE CALENDAR IS UNBOUNDED — year 12, year 40 and year 999 all advance normally", () => {
    // Nothing runs out. `isOver` used to say the run was over past year 6 and it is gone.
    for (const year of [7, 12, 40, 999]) {
      const { clock, events } = advance(at(year, ticksPerYear - 1), 1, balance);
      expect(clock).toEqual({ year: year + 1, tick: 0, subTick: 0 });
      expect(yearEnds(events)).toHaveLength(1);
      expect(yearEnds(events)[0]).toMatchObject({ year, reason: "meter" });
      // Seasons keep cycling: year 12 has the same four in the same order as year 1.
      expect(seasonsOfYear(balance)).toEqual(seasonOrder);
      expect(seasonAt(0, balance)).toBe(seasonOrder[0]);
    }
    // And walking there tick by tick from the start costs nothing but ticks.
    let clock = createClock(balance);
    while (clock.year < 12) clock = advanceAction(clock, "foray", balance).clock;
    expect(clock).toEqual({ year: 12, tick: 0, subTick: 0 });
  });

  it("absolute ticks round-trip past the old cap, so a season window can straddle any year", () => {
    // Sample one tick in EVERY season — the ticks used to be 0 / 15 / 4 / 11, hand-picked against a
    // 4-tick season, and against a 13-tick season all four of them would land in the first two.
    const sampleTicks = seasonOrder.map((_, i) => i * ticksPerSeason + (i % ticksPerSeason));
    sampleTicks.push(ticksPerYear - 1);
    const years = [1, 6, 9, 137];
    for (const [i, tick] of sampleTicks.entries()) {
      const c = at(years[i % years.length] as number, tick);
      const abs = absoluteTick(c, balance);
      expect(clockAtAbsoluteTick(abs, balance)).toEqual(c);
      expect(seasonStartTick(abs, balance) % ticksPerSeason).toBe(0);
      expect(abs - seasonStartTick(abs, balance)).toBeLessThan(ticksPerSeason);
    }
    // The sample really did cover every season, or the round-trip above proves less than it reads.
    expect(new Set(sampleTicks.map((t) => seasonAt(t, balance))).size).toBe(seasonOrder.length);
  });

  it("six years is 24 season steps: 18 clock boundaries + 6 year turns", () => {
    let clock = createClock(balance);
    const events: ClockEvent[] = [];
    const years = balance.clock.yearsTotal;
    // Bounded by the EXPECTED pacing, not by an end: the loop stops because the test asked for six
    // years, not because the calendar refused a seventh.
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

  it("no SUB-tick is lost either, for any sequence that mixes half-tick battles in", () => {
    /*
     * The property above walks whole ticks only, so it cannot see the arithmetic `battleTicks: 0.5`
     * introduced. This one spends sub-ticks and checks the same conservation law in the finer unit:
     * the clock's position, measured in sub-ticks since the start of the run, is EXACTLY the sum of
     * what was charged. A dropped overshoot at the year turn (the `tick = 0` bug), a float creeping
     * into `subTick`, or a rounding error in `subTicksForAction` all show up here as a mismatch.
     */
    const per = balance.clock.subTicksPerTick;
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom("travel" as const, "foray" as const, "inn" as const, "battle" as const),
          { minLength: 1, maxLength: 200 },
        ),
        (actions) => {
          let clock = createClock(balance);
          let spentSub = 0;
          for (const action of actions) {
            spentSub += subTicksForAction(action, balance);
            clock = advanceAction(clock, action, balance).clock;
          }
          const startSub = balance.clock.startTick * per;
          const absSub =
            (clock.year - balance.clock.startYear) * ticksPerYear * per + clock.tick * per + clock.subTick;
          expect(absSub).toBe(startSub + spentSub);
          expect(Number.isInteger(clock.subTick)).toBe(true);
          expect(clock.subTick).toBeGreaterThanOrEqual(0);
          expect(clock.subTick).toBeLessThan(per);
          expect(Number.isInteger(clock.tick)).toBe(true);
          expect(clock.tick).toBeLessThan(ticksPerYear);
        },
      ),
      { numRuns: 300 },
    );
  });
});
