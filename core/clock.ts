/**
 * core/clock.ts — the season meter (locked decision L8, AMENDED — see below).
 *
 * L8 now reads: "16-tick season meter; travel 1 / foray 1 / inn 2; **year = full meter**."
 * build-doc §4 runtime narrative: "Ticks accrue (travel/foray/inn). At each season boundary (every
 * 4 ticks) `ecosim.step()` runs the population update (§7.3). At tick 16 the year turn runs …".
 *
 * ⚠ THE CALENDAR IS ONE OF TWO CLOCKS, AND IT DRIVES NEITHER THE OTHER NOR THE STORY.
 * L8's "year = gym victory or full meter" was amended by Hank on 2026-08-25 (docs/DEVIATIONS.md
 * D-Q2-1, quoted there): *"I don't want the passage of time to be forced based on gyms or stages. I
 * want it to move forward based on ticks or actions exclusively."* So:
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

/** The save carries exactly these two numbers (build-doc §7.8 `{… year, tick …}`). */
export interface ClockState {
  year: number;
  tick: number;
}

/** build-doc §3 L8 — the three things that cost ticks. */
export type ClockActionKind = "travel" | "foray" | "inn";

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
 * It used to: `advance()` emitted `seasonBoundary(winter@16)` immediately before `yearEnd`, and the
 * since-removed `gymVictory()` emitted a boundary of its own — so a caller doing the documented
 * thing (step the sim on every `seasonBoundary`, run the year turn on `yearEnd`) ran FIVE season
 * steps per year instead of four, silently inflating every six-year trajectory by 25%.
 *
 * The contract now: `seasonBoundary` fires only for a season the year turn will NOT run — ticks 4,
 * 8 and 12 of a 16-tick year. `yearEnd` means "the year turn owes this year its last season step",
 * and the year turn reports which season that was.
 */
export type ClockEvent =
  | {
      t: "seasonBoundary";
      year: number;
      /** Tick the boundary fell on, before any year reset (4, 8, 12, 16). */
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
  return { year: balance.clock.startYear, tick: balance.clock.startTick };
}

/** Tick cost of one player action (travel 1 / foray 1 / inn 2), from balance. */
export function ticksForAction(kind: ClockActionKind, balance: Balance): number {
  switch (kind) {
    case "travel":
      return balance.clock.travelTicks;
    case "foray":
      return balance.clock.forayTicks;
    case "inn":
      return balance.clock.innTicks;
  }
}

/**
 * The season a tick falls in. Ticks 0–3 are `seasonOrder[0]`, 4–7 `seasonOrder[1]`, … A tick at or
 * past the full meter reads as the last season of the year (it is the boundary tick itself).
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
  const { ticksPerSeason, ticksPerYear } = balance.clock;
  const ticksIntoSeason = clock.tick % ticksPerSeason;
  return {
    year: clock.year,
    tick: clock.tick,
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
  const { ticksPerSeason, ticksPerYear } = balance.clock;
  const events: ClockEvent[] = [];
  let { year, tick } = clock;
  let remaining = Math.max(0, Math.floor(ticks));

  while (remaining > 0) {
    const toBoundary = ticksPerSeason - (tick % ticksPerSeason);
    const consume = Math.min(remaining, toBoundary);
    tick += consume;
    remaining -= consume;

    if (tick % ticksPerSeason !== 0) continue;

    if (tick >= ticksPerYear) {
      // build-doc §7.5 step 5 — the year turn runs this season, so no cue is emitted for it.
      events.push({ t: "yearEnd", year, reason: "meter" });
      year += 1;
      tick = 0;
      events.push({ t: "yearBegin", year });
      continue;
    }

    events.push({
      t: "seasonBoundary",
      year,
      tick,
      seasonEnded: seasonAt(tick - 1, balance),
      seasonBegun: seasonAt(tick % ticksPerYear, balance),
    });
  }

  return { clock: { year, tick }, events };
}

/** Advance by one player action of the given kind (travel / foray / inn). */
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
  return { year: startYear + Math.floor(t / ticksPerYear), tick: t % ticksPerYear };
}

/** Every season boundary of one full year, in order — what a headless run of the sim iterates. */
export function seasonsOfYear(balance: Balance): Season[] {
  return [...balance.clock.seasonOrder];
}
