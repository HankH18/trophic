/**
 * tests/unit/regional-events.test.ts — bible §9's four regional events as SEASON-LONG WINDOWS.
 *
 * Hank's constraint on Q2 (docs/DEVIATIONS.md D-Q2-2): *"events like that last for a whole season
 * and not just for one in-game day."*
 *
 * Before this, the story review measured: the Annual Festival was ONE FRAME of the year-turn
 * sequence ("FESTIVAL · Y3/6"), the Cullbrand raid was a single decrement inside `runYearTurn`,
 * Bloom Year did not exist as a mechanism at all, and only the Great Migration lasted a season —
 * by accident, as a side effect of the migrant model. So the assertion this file exists for is not
 * "a window opens" but **"it is open for exactly `ticksPerSeason` ticks and then it is not"**, driven
 * tick by tick over a whole year rather than sampled at one moment.
 */

import { describe, expect, it } from "vitest";
import { advance, absoluteTick, createClock, seasonAt, type ClockState } from "../../core/clock";
import { enterPendingActs } from "../../core/lifecycle";
import { awardBadge } from "../../core/acts";
import {
  activeWindows,
  bloomFloraThreshold,
  bloomWindows,
  festivalWindow,
  FESTIVAL_WINDOW_ID,
  latchedRaidWindows,
  migrationWindows,
  openRaidWindow,
  raidWindowId,
  regionalEventFlags,
  RegionalEventError,
  syncEventFlags,
  ticksLeftInWindow,
  windowActive,
  windowFlagFor,
  windowLengthTicks,
  type EventWindow,
} from "../../core/regional-events";
import { newSave, type SaveEnvelope } from "../../core/save";
import { validateContent } from "../../core/schemas";
import type { Balance, NodeState, SaveFile } from "../../core/types";

const content = validateContent();
const balance = content.balance;
const nodes = content.nodes;
const { ticksPerSeason, ticksPerYear, seasonOrder, startYear } = balance.clock;

const fresh = (): SaveEnvelope =>
  newSave({ seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes }, balance);

/** Every tick of `years` years, in order. */
function everyTick(years: number): ClockState[] {
  const out: ClockState[] = [];
  let clock = createClock(balance);
  for (let i = 0; i < ticksPerYear * years; i += 1) {
    out.push(clock);
    clock = advance(clock, 1, balance).clock;
  }
  return out;
}

/**
 * The lengths of the maximal runs of ticks over which `open` is true.
 *
 * This is the shape of the assertion: not "it was open at tick 12" but "the run of open ticks was
 * exactly one season long, and there were no others".
 */
function openRuns(clocks: readonly ClockState[], open: (c: ClockState) => boolean): number[] {
  const runs: number[] = [];
  let current = 0;
  for (const clock of clocks) {
    if (open(clock)) current += 1;
    else if (current > 0) {
      runs.push(current);
      current = 0;
    }
  }
  if (current > 0) runs.push(current);
  return runs;
}

/* ══════════════════════════════════════════════════════════════════════════ */

describe("regional events — the window model", () => {
  it("a window is exactly one season long and always opens on a season boundary", () => {
    expect(windowLengthTicks(balance)).toBe(ticksPerSeason);
    for (const clock of everyTick(2)) {
      const window = festivalWindow(clock, balance) ?? bloomAt(clock);
      if (!window) continue;
      expect(window.closesAt - window.openedAt).toBe(ticksPerSeason);
      expect(window.openedAt % ticksPerSeason).toBe(0);
      expect(windowActive(window, clock, balance)).toBe(true);
    }
  });

  it("fails loudly when balance.regionalEvents is stripped rather than defaulting closed", () => {
    const stripped = { ...balance, regionalEvents: undefined } as unknown as Balance;
    expect(() => bloomFloraThreshold(stripped)).toThrow(RegionalEventError);
    expect(() => windowFlagFor("festival", stripped)).toThrow(/balance\.regionalEvents is missing/u);
  });

  it("windowActive is a half-open interval — it closes AT the next boundary, not after it", () => {
    const window: EventWindow = {
      id: "probe",
      kind: "festival",
      openedAt: 8,
      closesAt: 8 + ticksPerSeason,
      year: startYear,
      season: seasonOrder[0] ?? "spring",
    };
    const at = (abs: number): ClockState => ({ year: startYear, tick: abs });
    expect(windowActive(window, at(7), balance)).toBe(false);
    expect(windowActive(window, at(8), balance)).toBe(true);
    expect(windowActive(window, at(8 + ticksPerSeason - 1), balance)).toBe(true);
    expect(windowActive(window, at(8 + ticksPerSeason), balance)).toBe(false);
    expect(ticksLeftInWindow(window, at(8), balance)).toBe(ticksPerSeason);
    expect(ticksLeftInWindow(window, at(8 + ticksPerSeason), balance)).toBe(0);
  });
});

/* ── 1. Annual Festival ────────────────────────────────────────────────────── */

describe("bible §9 — the Annual Festival is the year's final season (D-Q2-2)", () => {
  it("is open for EXACTLY 4 ticks, once a year, and it is the last season", () => {
    const clocks = everyTick(3);
    const runs = openRuns(clocks, (c) => festivalWindow(c, balance) !== null);
    expect(runs).toEqual([ticksPerSeason, ticksPerSeason, ticksPerSeason]);

    for (const clock of clocks) {
      const window = festivalWindow(clock, balance);
      const inLastSeason = Math.floor(clock.tick / ticksPerSeason) === seasonOrder.length - 1;
      expect(window !== null).toBe(inLastSeason);
      if (!window) continue;
      expect(window.id).toBe(FESTIVAL_WINDOW_ID);
      expect(window.kind).toBe("festival");
      expect(window.season).toBe(seasonOrder[seasonOrder.length - 1]);
      // It opens at the boundary INTO the final season and closes when the meter fills.
      expect(window.openedAt % ticksPerYear).toBe(ticksPerYear - ticksPerSeason);
      expect(window.closesAt % ticksPerYear).toBe(0);
    }
  });

  it("still opens in years the old six-year cap did not have", () => {
    for (const year of [7, 9, 40]) {
      const window = festivalWindow({ year, tick: ticksPerYear - 1 }, balance);
      expect(window).not.toBeNull();
      expect(window?.year).toBe(year);
      expect(festivalWindow({ year, tick: 0 }, balance)).toBeNull();
    }
  });

  it("publishes the flag data/dialogue.json already reads, and retracts it when it closes", () => {
    // `event.festival.open` was in the story review's list of externally-granted flags: read by the
    // dialogue, written by nothing. This is that writer.
    expect(windowFlagFor(FESTIVAL_WINDOW_ID, balance)).toBe("event.festival.open");
    const base = fresh();
    const deps = { species: content.species, nodeStates: base.nodeStates };

    const during = syncEventFlags(base, { year: startYear, tick: ticksPerYear - 2 }, deps, balance);
    expect(during.questFlags["event.festival.open"]).toBe(true);

    const after = syncEventFlags(during, { year: startYear + 1, tick: 0 }, deps, balance);
    expect(after.questFlags["event.festival.open"]).toBeUndefined();
    // Idempotent and total: syncing twice at the same clock is the same save.
    expect(syncEventFlags(after, { year: startYear + 1, tick: 0 }, deps, balance)).toEqual(after);
  });
});

/* ── 2. Great Migration ───────────────────────────────────────────────────── */

describe("bible §9 — the Great Migration is a migrant's own season", () => {
  it("each migrant is open for EXACTLY its 4-tick season, once a year", () => {
    const migrants = content.species.filter((s) => s.seasonalWindow !== undefined);
    // Hard Req 10 — exactly four migrants; the window model must not invent a fifth.
    expect(migrants).toHaveLength(4);

    const clocks = everyTick(2);
    for (const line of migrants) {
      const runs = openRuns(clocks, (c) =>
        migrationWindows(c, content.species, balance).some((w) => w.lineId === line.id),
      );
      expect(runs, line.id).toEqual([ticksPerSeason, ticksPerSeason]);
      for (const clock of clocks) {
        const open = migrationWindows(clock, content.species, balance).find((w) => w.lineId === line.id);
        expect(Boolean(open), `${line.id} @${String(clock.tick)}`).toBe(
          seasonAt(clock.tick, balance) === line.seasonalWindow,
        );
        if (open) {
          expect(open.season).toBe(line.seasonalWindow);
          expect(open.closesAt - open.openedAt).toBe(ticksPerSeason);
        }
      }
    }
  });

  it("takes the season from data/species.json and never from a literal", () => {
    // bible §9 says "spring"; bible §5 and every shipped row say autumn (STORY-REVIEW D7). The DATA
    // wins here, and this test would move with the data rather than pinning either word.
    const gloomoth = content.species.find((s) => s.id === "gloomoth-line");
    expect(gloomoth?.seasonalWindow).toBeDefined();
    const season = gloomoth?.seasonalWindow;
    const tick = seasonOrder.indexOf(season ?? "spring") * ticksPerSeason;
    const open = migrationWindows({ year: startYear, tick }, content.species, balance);
    expect(open.map((w) => w.lineId)).toContain("gloomoth-line");
  });
});

/* ── 3. Cullbrand raids ───────────────────────────────────────────────────── */

describe("bible §9 — a Cullbrand raid's window is the season its ACT was entered in", () => {
  const raid = balance.yearEvents.raids[0];

  it("opens on act entry, is open for EXACTLY 4 ticks, and closes at the next boundary", () => {
    expect(raid).toBeDefined();
    if (!raid) return;
    // Entered part-way through a season: the window still opens ON the boundary and lasts a season.
    for (const openTick of [0, 2, 5, 11, 15]) {
      const latched = openRaidWindow(fresh(), raid.id, { year: startYear + 3, tick: openTick }, balance);
      const windows = latchedRaidWindows(latched, balance);
      expect(windows).toHaveLength(1);
      const window = windows[0] as EventWindow;
      expect(window.id).toBe(raidWindowId(raid.id));
      expect(window.kind).toBe("raid");
      expect(window.openedAt % ticksPerSeason).toBe(0);
      expect(window.closesAt - window.openedAt).toBe(ticksPerSeason);

      const open = openRuns(
        everyTick(6).map((c) => c),
        (c) => windowActive(window, c, balance),
      );
      expect(open).toEqual([ticksPerSeason]);
    }
  });

  it("act entry latches the window itself — the raid is visible for its whole season", () => {
    expect(raid).toBeDefined();
    if (!raid) return;
    let save: SaveFile = { ...fresh(), year: startYear + 7, tick: 6 };
    save = { ...save, questFlags: { ...save.questFlags, "story.opening.done": true } };
    for (const gym of [...content.gyms].sort((a, b) => a.act - b.act)) {
      if (gym.act >= raid.act) break;
      save = { ...save, ...awardBadge(save, gym.id, balance) };
    }
    const entry = enterPendingActs(save, { balance, gyms: content.gyms });
    const windows = latchedRaidWindows(entry.save, balance);
    expect(windows.map((w) => w.id)).toContain(raidWindowId(raid.id));
    const window = windows.find((w) => w.id === raidWindowId(raid.id)) as EventWindow;
    // Opened in the season the act was entered in — of calendar year 8, which the old cap forbade.
    expect(window.year).toBe(startYear + 7);
    expect(windowActive(window, { year: startYear + 7, tick: 6 }, balance)).toBe(true);
    expect(windowActive(window, { year: startYear + 7, tick: 8 }, balance)).toBe(false);
    // And the flag is published for the season.
    const flags = regionalEventFlags(
      activeWindows(entry.save, { year: startYear + 7, tick: 6 }, {
        species: content.species,
        nodeStates: entry.save.nodeStates,
      }, balance),
      balance,
    );
    expect(flags[`event.raid.${raid.id}.open`]).toBe(true);
  });
});

/* ── 4. Bloom Year ────────────────────────────────────────────────────────── */

describe("bible §9 — a Bloom Year is a node whose producers are thriving", () => {
  it("the threshold is a fraction of the sim's own flora ceiling, never a second copy of it", () => {
    expect(bloomFloraThreshold(balance)).toBe(
      balance.regionalEvents.bloomFloraFraction * balance.ecosim.floraMax,
    );
    expect(bloomFloraThreshold(balance)).toBeLessThan(balance.ecosim.floraMax);
    expect(bloomFloraThreshold(balance)).toBeGreaterThan(balance.ecosim.floraMin);
  });

  it("is open for EXACTLY 4 ticks per season it qualifies in, and closes when flora falls", () => {
    const nodeId = "r1";
    const above = statesWithFlora(nodeId, balance.ecosim.floraMax);
    const below = statesWithFlora(nodeId, 0);

    for (const clock of everyTick(1)) {
      const open = bloomWindows(clock, above, balance);
      expect(open.map((w) => w.nodeId)).toContain(nodeId);
      const window = open.find((w) => w.nodeId === nodeId) as EventWindow;
      expect(window.kind).toBe("bloom");
      expect(window.closesAt - window.openedAt).toBe(ticksPerSeason);
      expect(window.openedAt).toBe(
        Math.floor(absoluteTick(clock, balance) / ticksPerSeason) * ticksPerSeason,
      );
      expect(bloomWindows(clock, below, balance)).toEqual([]);
    }

    // The whole point of the season window: flora only moves at a season boundary, so a node that
    // qualifies at the boundary is in bloom for the WHOLE season and not for one in-game day.
    const runs = openRuns(everyTick(1), (c) =>
      bloomWindows(c, above, balance).some((w) => w.nodeId === nodeId),
    );
    expect(runs).toEqual([ticksPerYear]);
  });

  it("does NOT weight an encounter — bible §9's bonus-spawn half is unbuilt and unclaimed (D10)", () => {
    // G2/G3: the window ships, the multiplier does not, and no key for one exists in balance.json.
    expect(Object.keys(balance.regionalEvents)).toEqual(
      expect.arrayContaining(["bloomFloraFraction", "windowFlagPrefix", "windowFlagSuffix"]),
    );
    expect(Object.keys(balance.regionalEvents)).not.toContain("bloomSpawnMultiplier");
    expect(Object.keys(balance.encounter)).not.toContain("bloomMultiplier");
  });
});

/* ── all four together ────────────────────────────────────────────────────── */

describe("all four events, over a whole year", () => {
  it("every window that opens is open for exactly one season, and the flags follow", () => {
    const nodeId = "r1";
    const base: SaveFile = { ...fresh(), nodeStates: statesWithFlora(nodeId, balance.ecosim.floraMax) };
    const raid = balance.yearEvents.raids[0];
    const latched = raid ? openRaidWindow(base, raid.id, { year: startYear, tick: 5 }, balance) : base;
    const deps = { species: content.species, nodeStates: latched.nodeStates };

    const kinds = new Set<string>();
    const spans = new Map<string, number>();
    for (const clock of everyTick(1)) {
      const open = activeWindows(latched, clock, deps, balance);
      const flags = regionalEventFlags(open, balance);
      for (const window of open) {
        kinds.add(window.kind);
        spans.set(window.id, (spans.get(window.id) ?? 0) + 1);
        expect(window.closesAt - window.openedAt).toBe(ticksPerSeason);
        expect(flags[windowFlagFor(window.id, balance)]).toBe(true);
      }
      // The published flags are exactly the open windows — no more, no fewer.
      expect(Object.keys(flags).sort()).toEqual(open.map((w) => windowFlagFor(w.id, balance)).sort());
    }

    // All four kinds were reachable in one year.
    expect([...kinds].sort()).toEqual(["bloom", "festival", "migration", "raid"]);
    // Each non-bloom window was open for exactly one season of that year; bloom held all year
    // because the flora it reads never fell (it is a node state, not a schedule).
    expect(spans.get(FESTIVAL_WINDOW_ID)).toBe(ticksPerSeason);
    if (raid) expect(spans.get(raidWindowId(raid.id))).toBe(ticksPerSeason);
    for (const [id, span] of spans) {
      if (id.startsWith("migration.")) expect(span, id).toBe(ticksPerSeason);
    }
  });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

function statesWithFlora(nodeId: string, flora: number): Record<string, NodeState> {
  const base = fresh().nodeStates;
  const out: Record<string, NodeState> = {};
  for (const id of Object.keys(base)) {
    const state = base[id];
    if (!state) continue;
    out[id] = id === nodeId ? { ...state, floraStock: flora } : { ...state, floraStock: 0 };
  }
  return out;
}

function bloomAt(clock: ClockState): EventWindow | null {
  const states = statesWithFlora("r1", balance.ecosim.floraMax);
  return bloomWindows(clock, states, balance)[0] ?? null;
}
