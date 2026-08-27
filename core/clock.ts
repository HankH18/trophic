/**
 * core/clock.ts — the YEAR meter (locked decision L8, AMENDED — see below).
 *
 * ⚠ THE METER IS THE YEAR'S, NOT THE SEASON'S. L8 was written as a "16-tick season meter" and both
 * halves of that phrase have since done damage. The number moved; the misnomer stayed, and reading
 * "season meter" as "the ticks in a season" is what carried a wrong tick count out of the doc and
 * into a work ticket. The meter measures a WHOLE YEAR and the seasons are its subdivisions —
 * `ticksPerSeason` of them per season, `seasonOrder.length` seasons, `ticksPerYear` in total.
 *
 * L8 as amended reads: "`ticksPerYear` YEAR meter; travel / foray / inn / battle cost
 * `travelTicks` / `forayTicks` / `innTicks` / `battleTicks`; **year = full meter**." The SHIPPED
 * values today are 52 ticks a year, 13 to a season, four seasons, and travel 1 / foray 1 / inn 2 /
 * battle 0.5 — quoted so a reader can picture the cadence, and quoted as a value and not as the
 * rule, because the owner has said they will be retuned again after playtesting. Nothing in this
 * file may reach for one of those numbers; every one of them is read from `balance.clock` (G11).
 *
 * build-doc §4 runtime narrative: "Ticks accrue (travel / foray / inn / battle). At each season
 * boundary — every `ticksPerSeason` ticks — `ecosim.step()` runs the population update (§7.3). When
 * the meter fills, the year turn runs …".
 *
 * ⚠ THE CALENDAR IS ONE OF TWO CLOCKS, AND IT DRIVES NEITHER THE OTHER NOR THE STORY.
 * L8's "year = gym victory or full meter" was amended by Hank on 2026-08-25: *"I don't want the
 * passage of time to be forced based on gyms or stages. I want it to move forward based on ticks
 * or actions exclusively."* So:
 *
 *   • a gym victory no longer ends a year — `YearEndReason` has one member and there is no
 *     `gymVictory()` here any more. Under the old rule winning a gym COST the player the rest of
 *     that year's ticks, which is a perverse incentive in a game whose thesis is that the world ages
 *     whether or not you succeed;
 *   • the calendar is UNBOUNDED. There is no final year, no year cap and no fail state; `year` may
 *     be 9 or 40. Nothing in this module may assume a maximum, and `isOver()` — which used to say
 *     the run was past `startYear + yearsTotal - 1` — is gone with the cap it enforced. Story
 *     progression is `core/acts.ts`'s, and it is driven by badges and quest flags, never by time.
 *
 * `balance.clock.yearsTotal` survives as the EXPECTED year count under normal pacing (six acts at
 * roughly a year each) — a correlation the HUD and the harness may quote, never a rule anything
 * enforces.
 *
 * Pure TypeScript, zero engine imports (L11). Every number is read from `balance.clock` (G11):
 * this file contains no tick counts, no season names and no year totals of its own — the season
 * vocabulary comes from core/types.ts and the ORDER comes from `balance.clock.seasonOrder`.
 */

import type { Balance, Season } from "./types";

export class ClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClockError";
  }
}

/**
 * The save carries exactly these three numbers (build-doc §7.8 `{… year, tick, subTick …}`).
 *
 * `tick` is whole ticks into the year, as it always was — every consumer that reads it, from the
 * HUD meter to the regional-event windows, keeps its meaning. `subTick` is the remainder that is
 * owed but has not yet added up to a whole tick, an integer in `[0, subTicksPerTick)`.
 *
 * It exists because a battle costs half a tick and `tick` must stay an integer: floats accumulate
 * error, and L10 requires that identical `(seed, actionLog)` replay byte-identically. Splitting the
 * fraction into its own integer field keeps every comparison, modulo and boundary test exact.
 */
export interface ClockState {
  year: number;
  tick: number;
  /**
   * Required here even though `SaveFile.subTick` is optional, and deliberately so: every shell
   * reader spells `save.subTick ?? 0` at the point it builds a clock, and widening this to optional
   * would quietly retire those. A clock this module hands back always has all three. See
   * {@link subTickOf} for what happens when one nevertheless arrives without it.
   */
  subTick: number;
}

/**
 * The four things that cost time.
 *
 * travel / foray / inn are build-doc §3 L8's original three. `battle` is charged once when a fight
 * LAUNCHES — not per turn taken inside it — and is the only one that costs a fraction of a tick.
 * Adding a member here is deliberately noisy: `ticksForAction`'s switch and
 * `game/ui/SeasonMeter.ts`'s exhaustive `actionCosts` Record both go red until it is handled.
 */
export type ClockActionKind = "travel" | "foray" | "inn" | "battle";

/**
 * Boundary events the sim and the year turn hook onto.
 *
 * `seasonBoundary` is the ecosim's cue (§7.3 runs "at every season boundary"); `yearEnd` is the
 * year turn's (§7.5).
 *
 * ⚠ WHO RUNS THE YEAR'S LAST SEASON STEP — resolved at integration in favour of build-doc §7.5.
 * §7.5 step 5 inlines it: the YEAR TURN runs "their 4th season step", and `core/lifecycle.ts`
 * `runYearTurn` does exactly that (it steps every node for `balance.clock.seasonOrder[last]` and
 * emits one `{t:"seasonStep"}` event per node). So this module must NOT also emit a cue for it.
 * It used to: `advance()` emitted a `seasonBoundary` for the year-filling tick immediately before
 * `yearEnd`, and the since-removed `gymVictory()` emitted a boundary of its own — so a caller doing
 * the documented thing (step the sim on every `seasonBoundary`, run the year turn on `yearEnd`) ran
 * one MORE season step per year than the year has seasons, silently inflating every six-year
 * trajectory by that fraction (25% under the four-season year, which is every year the region has).
 *
 * The contract now: `seasonBoundary` fires only for a season the year turn will NOT run — at every
 * multiple of `ticksPerSeason` up to but NOT including the one that fills the meter, so
 * `seasonOrder.length - 1` of them a year. `yearEnd` means "the year turn owes this year its last
 * season step", and the year turn reports which season that was.
 */
export type ClockEvent =
  | {
      t: "seasonBoundary";
      year: number;
      /**
       * Tick the boundary fell on, before any year reset — always a multiple of `ticksPerSeason`,
       * never `ticksPerYear` itself (that boundary is the year turn's and emits no cue).
       */
      tick: number;
      /** The season that just finished — this is the season `ecosim.step()` is run for. */
      seasonEnded: Season;
      /** The season now beginning. */
      seasonBegun: Season;
    }
  | { t: "yearEnd"; year: number; reason: YearEndReason }
  | { t: "yearBegin"; year: number };

/**
 * Why a year ended. There is exactly ONE reason and there is meant to be exactly one.
 *
 * It stays a union rather than collapsing to a bare string because `{t:"yearEnd"}` consumers read
 * `reason` and a future trigger (were one ever authorised) must add a member here — where every
 * `switch` over it goes red — rather than appear as an untyped string. The member that was removed
 * was `"gymVictory"`; see this file's header.
 */
export type YearEndReason = "meter";

export interface ClockAdvance {
  clock: ClockState;
  events: ClockEvent[];
}

/** Readout for the HUD meter and for tests. */
export interface ClockMeter {
  year: number;
  tick: number;
  /** Fraction of a tick owed but not yet whole — an integer in `[0, subTicksPerTick)`. */
  subTick: number;
  subTicksPerTick: number;
  ticksPerYear: number;
  ticksPerSeason: number;
  season: Season;
  seasonIndex: number;
  ticksIntoSeason: number;
  ticksLeftInSeason: number;
  ticksLeftInYear: number;
}

/** build-doc §3 L8 / §7.8 — a fresh clock reads its start point from balance. */
export function createClock(balance: Balance): ClockState {
  return { year: balance.clock.startYear, tick: balance.clock.startTick, subTick: 0 };
}

/**
 * Tick cost of one action, from balance — in TICKS, which is how they are written and read.
 *
 * May be fractional (`battle` ships at 0.5). Every caller that does arithmetic on the result should
 * use {@link subTicksForAction} instead: this one is for display and for the retune harness.
 */
export function ticksForAction(kind: ClockActionKind, balance: Balance): number {
  switch (kind) {
    case "travel":
      return balance.clock.travelTicks;
    case "foray":
      return balance.clock.forayTicks;
    case "inn":
      return balance.clock.innTicks;
    case "battle":
      return balance.clock.battleTicks;
  }
}

/**
 * The same cost as an exact integer count of sub-ticks — the only form the clock does arithmetic in.
 *
 * `Math.round` is safe rather than lossy: `core/schemas.ts` refuses to boot a balance whose costs
 * are not exact multiples of `1 / subTicksPerTick`, so the product is an integer up to the float
 * representation of the decimal in JSON, and rounding recovers it exactly. A cost the resolution
 * cannot express is a startup failure, never a silently truncated charge.
 */
export function subTicksForAction(kind: ClockActionKind, balance: Balance): number {
  return Math.round(ticksForAction(kind, balance) * balance.clock.subTicksPerTick);
}

/**
 * The clock's fraction, with an ABSENT one read as zero and a nonsensical one refused.
 *
 * ⚠ A MISSING FRACTION IS A STATE. A NON-INTEGER ONE IS A DEFECT. THEY GET DIFFERENT ANSWERS.
 *
 * Absent — `undefined` or `null` — reads as 0, because `SaveFile.subTick` is optional by design:
 * a save written before a battle cost time has no fraction, and zero is exactly what that means.
 * The field is typed `number` here and is still reached as `undefined`, which is why the read below
 * goes through a widening cast rather than trusting the type: every shell that builds a clock spells
 * `save.subTick ?? 0`, and this is what answers the one that forgets. That coercion is a migration
 * with one right answer, so it is made here, once, instead of at each of the six call sites.
 *
 * NaN, Infinity and any non-integer are REFUSED rather than coerced. Nothing that legally reaches
 * this can produce one: `core/schemas.ts` parses `subTick` as a non-negative integer, and every
 * clock this module returns comes out of {@link fromSubTicks} as integers. So a value like that is
 * arithmetic that has already gone wrong one or more frames up, and the caller — not this line — is
 * where it has to be fixed.
 *
 * MEASURED, before this guard existed: a caller built a clock with no `subTick`, the packing below
 * produced `NaN`, `advance`'s `remaining` went `NaN` with it, `while (remaining > 0)` fell straight
 * out and the call returned a clock of `NaN`s having emitted NO events. Four hundred actions later
 * the run had spent zero ticks, turned zero years, and raised nothing anywhere. Coercing a `NaN` to
 * 0 would hide that just as completely — it hands back a plausible clock standing on a number nobody
 * computed, and L10's "identical (seed, actionLog) ⇒ byte-identical save" is then false for a run
 * that looks fine from the outside. A refusal names the caller in a stack trace; a repair names no
 * one, and this module's whole reason for splitting the fraction into its own integer field is that
 * time here is exact.
 */
function subTickOf(clock: ClockState): number {
  const raw = (clock as { subTick?: number | null }).subTick;
  if (raw === undefined || raw === null) return 0;
  if (!Number.isInteger(raw)) {
    throw new ClockError(
      `clock.subTick is ${String(raw)} — the fraction must be an integer count of sub-ticks. An ` +
        "absent fraction reads as 0; a value that is not a whole number of sub-ticks means the " +
        "arithmetic that produced this clock is already wrong, and is not repaired here.",
    );
  }
  return raw;
}

/** Whole ticks and the sub-tick remainder, packed into one integer count of sub-ticks. */
function toSubTicks(clock: ClockState, balance: Balance): number {
  if (!Number.isInteger(clock.tick)) {
    // Same rule as the fraction, and for the same reason: a non-integer `tick` poisons every modulo
    // and boundary comparison below it, and does so silently — `sub % seasonSub !== 0` is simply
    // never true again, so the clock stops emitting season boundaries instead of failing.
    throw new ClockError(
      `clock.tick is ${String(clock.tick)} — whole ticks into the year must be an integer; the ` +
        "fraction belongs in clock.subTick.",
    );
  }
  return clock.tick * balance.clock.subTicksPerTick + subTickOf(clock);
}

/** The inverse of {@link toSubTicks}, for a count already reduced into the current year. */
function fromSubTicks(year: number, sub: number, balance: Balance): ClockState {
  const per = balance.clock.subTicksPerTick;
  return { year, tick: Math.floor(sub / per), subTick: sub % per };
}

/**
 * The season a tick falls in: the first `ticksPerSeason` ticks of the year are `seasonOrder[0]`, the
 * next `ticksPerSeason` are `seasonOrder[1]`, and so on. A tick at or past the full meter reads as
 * the last season of the year (it is the boundary tick itself).
 */
export function seasonAt(tick: number, balance: Balance): Season {
  const order = balance.clock.seasonOrder;
  const last = order.length - 1;
  const raw = Math.floor(Math.max(0, tick) / balance.clock.ticksPerSeason);
  const index = Math.min(Math.max(raw, 0), last);
  const season = order[index];
  // seasonOrder is schema-guaranteed non-empty; this keeps noUncheckedIndexedAccess honest.
  return season ?? (order[0] as Season);
}

/** The season the clock is currently in. */
export function seasonOf(clock: ClockState, balance: Balance): Season {
  return seasonAt(clock.tick, balance);
}

/** Full meter readout. */
export function meter(clock: ClockState, balance: Balance): ClockMeter {
  const { ticksPerSeason, ticksPerYear, subTicksPerTick } = balance.clock;
  const ticksIntoSeason = clock.tick % ticksPerSeason;
  return {
    year: clock.year,
    tick: clock.tick,
    // Through the same normaliser `advance` packs with, so the HUD and the arithmetic can never
    // disagree about the fraction — and so a clock built without one reads 0 on screen rather than
    // printing `NaN` at the player.
    subTick: subTickOf(clock),
    subTicksPerTick,
    ticksPerYear,
    ticksPerSeason,
    season: seasonOf(clock, balance),
    seasonIndex: Math.floor(clock.tick / ticksPerSeason),
    ticksIntoSeason,
    ticksLeftInSeason: ticksPerSeason - ticksIntoSeason,
    ticksLeftInYear: ticksPerYear - clock.tick,
  };
}

/**
 * Advance the meter by `ticks`, emitting one `seasonBoundary` per crossed multiple of
 * `ticksPerSeason` and a `yearEnd`/`yearBegin` pair when the meter fills (L8: "year = … full
 * meter"). Ticks beyond the boundary carry into the new year rather than being dropped, so no
 * player action is silently free.
 *
 * The year-filling boundary emits NO `seasonBoundary`: build-doc §7.5 step 5 gives that season step
 * to the year turn, and emitting a cue for it here made the sim run it twice (see `ClockEvent`).
 *
 * Pure: the input clock is never mutated.
 */
export function advance(clock: ClockState, ticks: number, balance: Balance): ClockAdvance {
  const { ticksPerSeason, ticksPerYear, subTicksPerTick } = balance.clock;
  /*
   * The OTHER way this function used to become a silent no-op. `remaining` below is
   * `Math.max(0, …)`, and `Math.max(0, NaN)` is `NaN`, so a non-finite cost made `while (remaining >
   * 0)` false on the first test: no ticks spent, no boundaries, no year end, no error. Negative and
   * zero costs stay legal and clamp to a no-op — a free action is a real thing to ask for — but a
   * cost that is not a number is a balance or a call site that is already broken, and it says so.
   */
  if (!Number.isFinite(ticks)) {
    throw new ClockError(
      `advance was asked to spend ${String(ticks)} ticks — a tick cost must be a finite number. ` +
        "A cost of 0 is the way to spend nothing; this is a cost nobody computed.",
    );
  }
  const events: ClockEvent[] = [];
  const seasonSub = ticksPerSeason * subTicksPerTick;
  const yearSub = ticksPerYear * subTicksPerTick;
  let year = clock.year;
  let sub = toSubTicks(clock, balance);
  // Integer sub-ticks from here down: the only float in this function is the caller's `ticks`, and
  // it is gone by the end of this line. Rounding is exact — see `subTicksForAction`.
  let remaining = Math.max(0, Math.round(ticks * subTicksPerTick));

  while (remaining > 0) {
    /*
     * Stop at whichever comes first, the season boundary or the year fill. Checking BOTH — rather
     * than the season boundary alone and asking afterwards whether the year is full — is what makes
     * this loop correct when `ticksPerYear` is not a whole number of seasons. The schema refuses
     * such a balance (see core/schemas.ts), so today the two can only coincide; the loop is written
     * this way so that relaxing the refine degrades into a slower year rather than a dropped one.
     * The bug this replaces silently discarded the overshoot with `tick = 0`.
     */
    const toSeason = seasonSub - (sub % seasonSub);
    const toYear = yearSub - sub;
    const consume = Math.min(remaining, toSeason, toYear);
    sub += consume;
    remaining -= consume;

    if (sub >= yearSub) {
      // build-doc §7.5 step 5 — the year turn runs this season, so no cue is emitted for it.
      events.push({ t: "yearEnd", year, reason: "meter" });
      year += 1;
      // Carry, never clamp: ticks past the meter belong to the new year, so no action is ever free.
      sub -= yearSub;
      events.push({ t: "yearBegin", year });
      continue;
    }

    if (sub % seasonSub !== 0) continue;

    const tickNow = sub / subTicksPerTick;
    events.push({
      t: "seasonBoundary",
      year,
      tick: tickNow,
      seasonEnded: seasonAt(tickNow - 1, balance),
      seasonBegun: seasonAt(tickNow % ticksPerYear, balance),
    });
  }

  return { clock: fromSubTicks(year, sub, balance), events };
}

/** Advance by one player action of the given kind (travel / foray / inn / battle). */
export function advanceAction(clock: ClockState, kind: ClockActionKind, balance: Balance): ClockAdvance {
  return advance(clock, ticksForAction(kind, balance), balance);
}

/**
 * Absolute tick since the start of the run: `(year - startYear) * ticksPerYear + tick`.
 *
 * The one place a season window can be expressed without a year wrap-around special case
 * (core/regional-events.ts), and the one arithmetic that stays correct when `year` exceeds
 * `yearsTotal` — which it now may, without limit.
 */
export function absoluteTick(clock: ClockState, balance: Balance): number {
  return (clock.year - balance.clock.startYear) * balance.clock.ticksPerYear + clock.tick;
}

/** The absolute tick of the season boundary that OPENED the season `absTick` falls in. */
export function seasonStartTick(absTick: number, balance: Balance): number {
  const per = balance.clock.ticksPerSeason;
  return Math.floor(absTick / per) * per;
}

/**
 * The clock `absTick` ticks after the start of the run — the inverse of {@link absoluteTick}.
 *
 * Unbounded on purpose: absolute tick 1_000_000 is year 62_501 and that is a legal clock. Nothing
 * here clamps, because the calendar has no end to clamp to.
 */
export function clockAtAbsoluteTick(absTick: number, balance: Balance): ClockState {
  const { ticksPerYear, startYear } = balance.clock;
  const t = Math.max(0, Math.floor(absTick));
  // subTick 0: this is the inverse of `absoluteTick`, which is denominated in WHOLE ticks because
  // that is the unit regional-event windows are measured in. A round trip through the pair is
  // lossy in the fraction by construction, and no caller may use it to reconstruct a live clock.
  return { year: startYear + Math.floor(t / ticksPerYear), tick: t % ticksPerYear, subTick: 0 };
}

/** Every season boundary of one full year, in order — what a headless run of the sim iterates. */
export function seasonsOfYear(balance: Balance): Season[] {
  return [...balance.clock.seasonOrder];
}
