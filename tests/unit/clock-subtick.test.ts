/**
 * tests/unit/clock-subtick.test.ts — what binds the 52-tick clock and its half-tick battles.
 *
 * Two halves, and the second is the point. The first proves the sub-tick arithmetic: a battle
 * costs half a tick, two of them make one, an odd fraction straddles the year turn and CARRIES
 * rather than being dropped, and no tick is ever lost across a mixed action sequence.
 *
 * The second half sabotages the schema on purpose. Before the cadence refine existed, four
 * different retunes passed zod, booted and played while silently breaking the clock — a year that
 * never ended, a regional-event window that opened on zero ticks, a season stepped twice, and a
 * season vocabulary that clamped. None was a code change; all four were one number in a data file.
 * The owner has said he will retune these again after playtesting, so the guard has to be the kind
 * that a data edit runs into. Each case here breaks exactly one rule and asserts the parse FAILS;
 * the last asserts the shipped balance still passes, so the refine cannot be vacuously true.
 *
 * R3 is also the resolution knob demonstrated: a quarter-tick cost is refused at
 * subTicksPerTick 2 and accepted at 4. That is the documented way to make finer costs legal.
 */
import { describe, it, expect } from "vitest";
import { advance, advanceAction, createClock, subTicksForAction, meter, ClockError } from "@core/clock";
import { zBalance } from "@core/schemas";
import raw from "../../data/balance.json";
const balance = zBalance.parse(raw);

describe("the sub-tick clock — half a tick without a float in the save", () => {
  it("a battle is half a tick and two battles make one", () => {
    expect(subTicksForAction("battle", balance)).toBe(1);
    let c = createClock(balance);
    c = advanceAction(c, "battle", balance).clock;
    expect(c).toEqual({ year: 1, tick: 0, subTick: 1 });
    c = advanceAction(c, "battle", balance).clock;
    expect(c).toEqual({ year: 1, tick: 1, subTick: 0 });
  });
  it("season boundaries fall every ticksPerSeason and a year is exactly seasonOrder.length of them", () => {
    let c = createClock(balance);
    const bounds: number[] = []; let years = 0;
    for (let i = 0; i < balance.clock.ticksPerYear; i += 1) {
      const a = advanceAction(c, "foray", balance); c = a.clock;
      for (const e of a.events) { if (e.t === "seasonBoundary") bounds.push(e.tick); if (e.t === "yearEnd") years += 1; }
    }
    // Derived, not [13, 26, 39]: the boundaries are every ticksPerSeason up to but NOT including
    // the year fill, which build-doc §7.5 step 5 gives to the year turn instead.
    const expected = balance.clock.seasonOrder
      .slice(0, -1)
      .map((_, i) => (i + 1) * balance.clock.ticksPerSeason);
    expect(bounds).toEqual(expected);
    expect(bounds).toHaveLength(balance.clock.seasonOrder.length - 1);
    expect(years).toBe(1);
    expect(c).toEqual({ year: 2, tick: 0, subTick: 0 });
  });
  it("an odd sub-tick straddles the year turn and carries, never drops", () => {
    const last = { year: 1, tick: balance.clock.ticksPerYear - 1, subTick: 1 };
    const a = advanceAction(last, "foray", balance);
    expect(a.events.some((e) => e.t === "yearEnd")).toBe(true);
    expect(a.clock).toEqual({ year: 2, tick: 0, subTick: 1 });
  });
  it("no tick is ever lost: absolute sub-ticks equal the sum of what was spent", () => {
    const kinds = ["travel", "foray", "inn", "battle", "battle", "battle", "inn", "foray"] as const;
    let c = createClock(balance); let spent = 0;
    for (const k of kinds) { spent += subTicksForAction(k, balance); c = advanceAction(c, k, balance).clock; }
    const per = balance.clock.subTicksPerTick;
    const abs = (c.year - balance.clock.startYear) * balance.clock.ticksPerYear * per + c.tick * per + c.subTick;
    expect(abs).toBe(spent);
  });
  it("overshooting a whole year carries instead of clamping", () => {
    const a = advance({ year: 1, tick: 0, subTick: 0 }, balance.clock.ticksPerYear + 3, balance);
    expect(a.clock).toEqual({ year: 2, tick: 3, subTick: 0 });
    expect(a.events.filter((e) => e.t === "yearEnd")).toHaveLength(1);
  });
  it("the meter reports the fraction", () => {
    const tick = 5;
    const m = meter({ year: 1, tick, subTick: 1 }, balance);
    expect(m.subTick).toBe(1);
    expect(m.subTicksPerTick).toBe(balance.clock.subTicksPerTick);
    expect(m.ticksLeftInYear).toBe(balance.clock.ticksPerYear - tick);
  });
});

/*
 * A CLOCK WITH NO FRACTION MUST NOT STOP TIME — and a clock with a nonsensical one must not be
 * repaired into a plausible one. `SaveFile.subTick` is optional (a save written before battles cost
 * time has none), so `undefined` reaching the clock is a real state and not merely a test bug.
 *
 * What went wrong before the guard: a caller built a clock without `subTick`, the packing arithmetic
 * produced NaN, `advance`'s `while (remaining > 0)` was false on the first test, and the call
 * returned having emitted NO events. Four hundred actions later: zero ticks spent, zero year turns,
 * and no error anywhere. Every assertion below is against that silence — the absent case must SPEND
 * TIME (a no-throw is not enough; it was not throwing before either), and the bad case must throw.
 */
describe("a missing fraction reads as zero; a nonsensical one is refused", () => {
  const noFraction = { year: 1, tick: 0 } as unknown as Parameters<typeof advance>[0];

  it("an absent subTick reads as 0 and the clock still moves", () => {
    const a = advance(noFraction, balance.clock.ticksPerYear, balance);
    // The whole point: events, not merely the absence of a throw.
    expect(a.events.filter((e) => e.t === "yearEnd")).toHaveLength(1);
    expect(a.events.filter((e) => e.t === "seasonBoundary")).toHaveLength(
      balance.clock.seasonOrder.length - 1,
    );
    expect(a.clock).toEqual({ year: 2, tick: 0, subTick: 0 });
    // …and it is the SAME answer an explicit zero gives, which is what "reads as 0" has to mean.
    expect(a.clock).toEqual(advance({ year: 1, tick: 0, subTick: 0 }, balance.clock.ticksPerYear, balance).clock);
  });

  it("an absent subTick reads as 0 on the meter too, rather than printing NaN at the player", () => {
    expect(meter(noFraction, balance).subTick).toBe(0);
  });

  it("a NaN or non-integer fraction is REFUSED, not coerced", () => {
    // Coercing these to 0 would hand back a plausible clock standing on a number nobody computed,
    // and L10's byte-identical replay would be false for a run that looked fine. See core/clock.ts.
    for (const bad of [Number.NaN, Infinity, 0.5]) {
      const clock = { year: 1, tick: 0, subTick: bad };
      expect(() => advance(clock, 1, balance)).toThrow(ClockError);
      expect(() => meter(clock, balance)).toThrow(ClockError);
    }
  });

  it("a NaN tick is refused for the same reason", () => {
    expect(() => advance({ year: 1, tick: Number.NaN, subTick: 0 }, 1, balance)).toThrow(ClockError);
  });

  it("a non-finite COST is refused, but a free action is still legal", () => {
    const clock = createClock(balance);
    expect(() => advance(clock, Number.NaN, balance)).toThrow(ClockError);
    expect(() => advance(clock, Infinity, balance)).toThrow(ClockError);
    // 0 and negative stay a clamped no-op — a free action is a real thing to ask for.
    expect(advance(clock, 0, balance)).toEqual({ clock, events: [] });
    expect(advance(clock, -1, balance)).toEqual({ clock, events: [] });
  });
});

describe("the cadence refine refuses a retune that would silently break the clock", () => {
  const mutate = (fn: (c: Record<string, unknown>) => void) => {
    const b = JSON.parse(JSON.stringify(raw)) as { clock: Record<string, unknown> };
    fn(b.clock); return zBalance.safeParse(b).success;
  };
  it("R1 refuses a year that is not a whole number of seasons", () => {
    expect(mutate((c) => { c["ticksPerYear"] = 50; })).toBe(false);
  });
  it("R2 refuses a startTick outside the year", () => {
    expect(mutate((c) => { c["startTick"] = 52; })).toBe(false);
  });
  it("R3 refuses a cost the resolution cannot express", () => {
    expect(mutate((c) => { c["battleTicks"] = 0.25; })).toBe(false);
    expect(mutate((c) => { c["battleTicks"] = 0.25; c["subTicksPerTick"] = 4; })).toBe(true);
  });
  it("R4 refuses an action costing a whole season", () => {
    expect(mutate((c) => { c["innTicks"] = 13; })).toBe(false);
  });
  it("the shipped balance still parses", () => {
    expect(zBalance.safeParse(raw).success).toBe(true);
  });
});
