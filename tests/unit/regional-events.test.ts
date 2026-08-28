/**
 * tests/unit/regional-events.test.ts — bible §9's four regional events as SEASON-LONG WINDOWS.
 *
 * Hank's constraint on Q2: *"events like that last for a whole season
 * and not just for one in-game day."*
 *
 * Before this, the story review measured: the Annual Festival was ONE FRAME of the year-turn
 * sequence ("FESTIVAL · Y3/6"), the Cullbrand raid was a single decrement inside `runYearTurn`,
 * Bloom Year did not exist as a mechanism at all, and only the Great Migration lasted a season —
 * by accident, as a side effect of the migrant model. So the assertion this file exists for is not
 * "a window opens" but **"it is open for exactly `ticksPerSeason` ticks and then it is not"**, driven
 * tick by tick over a whole year rather than sampled at one moment.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { advance, absoluteTick, createClock, seasonAt, type ClockState } from "../../core/clock";
import { enterPendingActs } from "../../core/lifecycle";
import { awardBadge } from "../../core/acts";
import {
  activeWindows,
  bloomFloraThreshold,
  bloomWindowId,
  festivalWindow,
  FESTIVAL_WINDOW_ID,
  latchedBloomWindows,
  latchedRaidWindows,
  migrationWindows,
  openRaidWindow,
  raidWindowId,
  regionalEventFlags,
  RegionalEventError,
  syncBloomLatches,
  syncEventFlags,
  thrivingNodeIds,
  ticksLeftInWindow,
  windowActive,
  windowFlagFor,
  windowLengthTicks,
  windowOpenedAtFlag,
  type EventWindow,
} from "../../core/regional-events";
import { defaultContext, stepRegionStates } from "../../core/ecosim";
import { subsystemRng } from "../../core/rng";
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
    const at = (abs: number): ClockState => ({ year: startYear, tick: abs, subTick: 0 });
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
  it("is open for EXACTLY ticksPerSeason ticks, once a year, and it is the last season", () => {
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
      const window = festivalWindow({ year, tick: ticksPerYear - 1, subTick: 0 }, balance);
      expect(window).not.toBeNull();
      expect(window?.year).toBe(year);
      expect(festivalWindow({ year, tick: 0, subTick: 0 }, balance)).toBeNull();
    }
  });

  it("publishes the flag data/dialogue.json already reads, and retracts it when it closes", () => {
    // `event.festival.open` was in the story review's list of externally-granted flags: read by the
    // dialogue, written by nothing. This is that writer.
    expect(windowFlagFor(FESTIVAL_WINDOW_ID, balance)).toBe("event.festival.open");
    const base = fresh();
    const deps = { species: content.species, nodeStates: base.nodeStates };

    const during = syncEventFlags(
      base,
      { year: startYear, tick: ticksPerYear - 2, subTick: 0 },
      deps,
      balance,
    );
    expect(during.questFlags["event.festival.open"]).toBe(true);

    const after = syncEventFlags(during, { year: startYear + 1, tick: 0, subTick: 0 }, deps, balance);
    expect(after.questFlags["event.festival.open"]).toBeUndefined();
    // Idempotent and total: syncing twice at the same clock is the same save.
    expect(syncEventFlags(after, { year: startYear + 1, tick: 0, subTick: 0 }, deps, balance)).toEqual(
      after,
    );
  });
});

/* ── 2. Great Migration ───────────────────────────────────────────────────── */

describe("bible §9 — the Great Migration is a migrant's own season", () => {
  it("each migrant is open for EXACTLY its own season, once a year", () => {
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
    // bible §9 says "spring"; bible §5 and every shipped row say autumn. The DATA
    // wins here, and this test would move with the data rather than pinning either word.
    const gloomoth = content.species.find((s) => s.id === "gloomoth-line");
    expect(gloomoth?.seasonalWindow).toBeDefined();
    const season = gloomoth?.seasonalWindow;
    const tick = seasonOrder.indexOf(season ?? "spring") * ticksPerSeason;
    const open = migrationWindows({ year: startYear, tick, subTick: 0 }, content.species, balance);
    expect(open.map((w) => w.lineId)).toContain("gloomoth-line");
  });
});

/* ── 3. Cullbrand raids ───────────────────────────────────────────────────── */

describe("bible §9 — a Cullbrand raid's window is the season its ACT was entered in", () => {
  const raid = balance.yearEvents.raids[0];

  /*
   * THE DEFECT THIS PINS. `openRaidWindow` used to snap the open DOWN to the season boundary, so a
   * raid whose act was entered part-way through a season was already most of the way through its own
   * window when it fired. Measured under the then-shipped 16-tick year (four ticks to a season),
   * entering act 4 at each of its 16 ticks: the raid stayed visible for 4, 3, 2, 1, 4, 3, 2, 1 …
   * ticks — a whole season in ONE case of four, against Hank's "events like that last for a whole
   * season and not just for one in-game day". The year is 52 ticks now; the shape of the defect is
   * the same and the sweep below is over `ticksPerYear`, so it is measured rather than quoted.
   *
   * The old test could not see it: it measured the window over the window's OWN interval and never
   * from the tick the raid actually fired.
   */
  it("is open for EXACTLY one season FROM THE TICK THE ACT WAS ENTERED, whichever tick that is", () => {
    expect(raid).toBeDefined();
    if (!raid) return;
    for (let openTick = 0; openTick < ticksPerYear; openTick += 1) {
      const enteredAt: ClockState = { year: startYear + 3, tick: openTick, subTick: 0 };
      const latched = openRaidWindow(fresh(), raid.id, enteredAt, balance);
      const windows = latchedRaidWindows(latched, balance);
      expect(windows).toHaveLength(1);
      const window = windows[0] as EventWindow;
      expect(window.id).toBe(raidWindowId(raid.id));
      expect(window.kind).toBe("raid");
      // It opens where it fired — not at the boundary before it.
      expect(window.openedAt).toBe(absoluteTick(enteredAt, balance));
      expect(window.closesAt - window.openedAt).toBe(ticksPerSeason);
      expect(windowActive(window, enteredAt, balance)).toBe(true);

      // Counted FORWARD from the entry tick, which is the reading the player experiences.
      let visible = 0;
      for (let i = 0; i < ticksPerYear * 2; i += 1) {
        const abs = window.openedAt + i;
        const clock = { year: startYear, tick: 0, subTick: 0 };
        if (!windowActive(window, { ...clock, tick: abs }, balance)) break;
        visible += 1;
      }
      expect(visible, `entered at tick ${String(openTick)}`).toBe(ticksPerSeason);

      const open = openRuns(everyTick(6), (c) => windowActive(window, c, balance));
      expect(open).toEqual([ticksPerSeason]);
    }
  });

  it("act entry latches the window itself — the raid is visible for its whole season", () => {
    expect(raid).toBeDefined();
    if (!raid) return;
    /*
     * The entry tick is DERIVED and deliberately mid-season. It was the literal 6, picked against a
     * 4-tick season where 6 was two ticks into season 1; against the shipped 13-tick season 6 is
     * still mid-season by luck, and the ticks this test then probed (9 and 10) were flatly wrong.
     * Half a season in keeps the case the test exists for — the window opens where the act was
     * ENTERED, not at the boundary before it — true through any retune of ticksPerSeason.
     */
    const entryTick = Math.floor(ticksPerSeason / 2);
    expect(entryTick % ticksPerSeason, "the entry tick landed on a season boundary — the test would " +
      "no longer distinguish 'opens where it fired' from 'snaps to the boundary'").not.toBe(0);
    const entryYear = startYear + 7;
    const at = (tick: number): ClockState => ({ year: entryYear, tick, subTick: 0 });

    let save: SaveFile = { ...fresh(), year: entryYear, tick: entryTick };
    save = { ...save, questFlags: { ...save.questFlags, "story.opening.done": true } };
    for (const gym of [...content.gyms].sort((a, b) => a.act - b.act)) {
      if (gym.act >= raid.act) break;
      save = { ...save, ...awardBadge(save, gym.id, balance) };
    }
    const entry = enterPendingActs(save, { balance, gyms: content.gyms });
    const windows = latchedRaidWindows(entry.save, balance);
    expect(windows.map((w) => w.id)).toContain(raidWindowId(raid.id));
    const window = windows.find((w) => w.id === raidWindowId(raid.id)) as EventWindow;
    // Opened AT the tick the act was entered on — of calendar year 8, which the old cap forbade.
    expect(window.year).toBe(entryYear);
    expect(window.openedAt).toBe(absoluteTick(at(entryTick), balance));
    expect(windowActive(window, at(entryTick), balance)).toBe(true);
    // A whole season from the entry, not until the next boundary: the last tick inside the window
    // is `entryTick + ticksPerSeason - 1`, and the one after it is out.
    expect(windowActive(window, at(entryTick + ticksPerSeason - 1), balance)).toBe(true);
    expect(windowActive(window, at(entryTick + ticksPerSeason), balance)).toBe(false);
    // And the flag is published for the season.
    const flags = regionalEventFlags(
      activeWindows(entry.save, at(entryTick), {
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

  /*
   * ⚠ THIS TEST IS THE DEFECT, INVERTED. It used to be titled "is open for EXACTLY 4 ticks per
   * season it qualifies in" and it ASSERTED `[ticksPerYear]` — the whole year, not one season —
   * because the bloom was DERIVED from a level and a level does not end. (The year was 16 ticks
   * when that was measured; it is 52 now, which is why the assertion below names `ticksPerSeason`
   * and never a number.) Driven honestly against the shipped ecosim (one `stepRegionStates` per
   * season, seeded, ten years) the derived reading was open at 12 nodes of 12 from year 3 onward
   * and never closed again: one unbroken run of every tick of the run, per node. An event that is
   * always on at every node is not an event, and the season-window rule's "stays open
   * ticksPerSeason ticks and closes at the next" was simply false of it.
   *
   * The bloom LATCHES on the rise now, so this asserts the shape the title always claimed.
   */
  it("opens ONE one-season window on the rise and does NOT re-open while the flora stays high", () => {
    const nodeId = "r1";
    const above = statesWithFlora(nodeId, balance.ecosim.floraMax);
    expect(thrivingNodeIds(above, balance)).toEqual([nodeId]);

    // The rise: latch it at tick 0 of the start year, then hold the flora there all year.
    let save: SaveFile = { ...fresh(), nodeStates: above };
    const runs = openRuns(everyTick(2), (clock) => {
      save = syncBloomLatches(save, clock, above, balance);
      return latchedBloomWindows(save, balance).some(
        (w) => w.nodeId === nodeId && windowActive(w, clock, balance),
      );
    });
    expect(runs).toEqual([ticksPerSeason]);

    const window = latchedBloomWindows(save, balance).find((w) => w.nodeId === nodeId) as EventWindow;
    expect(window.kind).toBe("bloom");
    expect(window.id).toBe(bloomWindowId(nodeId));
    expect(window.closesAt - window.openedAt).toBe(ticksPerSeason);
    // Snapped to the boundary: flora only moves inside ecosim.step(), which runs at boundaries.
    expect(window.openedAt % ticksPerSeason).toBe(0);
  });

  it("a fall clears the latch, and the next rise opens a FRESH window", () => {
    const nodeId = "r1";
    const above = statesWithFlora(nodeId, balance.ecosim.floraMax);
    const below = statesWithFlora(nodeId, 0);
    const flag = windowOpenedAtFlag(bloomWindowId(nodeId), balance);

    /*
     * ⚠ THESE THREE TICKS MUST BE SEASON BOUNDARIES AND THEY ARE NOW DERIVED. `syncBloomLatches`
     * snaps its open to `seasonStartTick`, so a sample tick that is NOT a boundary latches at the
     * boundary before it and the flag reads back a number the test did not write. They were the
     * literals 0 / 4 / 8, which were the first three boundaries of a 4-tick season and are all
     * inside the FIRST season of the shipped 13-tick one.
     */
    const rise = 0;
    const fall = ticksPerSeason;
    const reRise = 2 * ticksPerSeason;
    // The fresh window has to fit inside the year it opens in, or the last probe wraps.
    expect(reRise + ticksPerSeason, "three seasons no longer fit in a year").toBeLessThanOrEqual(ticksPerYear);
    const at = (tick: number): ClockState => ({ year: startYear, tick, subTick: 0 });

    let save: SaveFile = fresh();
    save = syncBloomLatches(save, at(rise), above, balance);
    expect(save.questFlags[flag]).toBe(rise);

    // Producers pushed under the threshold: the latch goes, so the node can bloom again later.
    save = syncBloomLatches(save, at(fall), below, balance);
    expect(save.questFlags[flag]).toBeUndefined();
    expect(latchedBloomWindows(save, balance)).toEqual([]);

    // …and it does, at the new boundary, as its own window.
    save = syncBloomLatches(save, at(reRise), above, balance);
    expect(save.questFlags[flag]).toBe(reRise);
    const again = latchedBloomWindows(save, balance)[0] as EventWindow;
    expect(windowActive(again, at(reRise + ticksPerSeason - 1), balance)).toBe(true);
    expect(windowActive(again, at(reRise + ticksPerSeason), balance)).toBe(false);
  });

  /*
   * THE MEASUREMENT, run rather than quoted: the shipped ecosim saturates flora at `floraMax`, so
   * the level the Bloom Year reads is permanently true. This drives the REAL region sim — four
   * season steps a year, the seeded "sim" stream, `defaultContext()` — and asserts the published
   * flag behaves like an event anyway. If the bloom ever goes back to being derived from the level,
   * this is the test that fails.
   */
  it("BINDS — under the shipped ecosim the flag is NOT permanently open at every node", () => {
    const years = 6;
    let save: SaveFile = fresh();
    const rng = subsystemRng(save.seed, "sim");
    const context = defaultContext();
    const openTicks = new Map<string, number>();
    let saturatedSeasons = 0;
    const seasons = years * seasonOrder.length;

    for (let i = 0; i < seasons; i += 1) {
      const season = seasonOrder[i % seasonOrder.length]!;
      const stepped = stepRegionStates(nodes, save.nodeStates, season, rng, context);
      save = { ...save, nodeStates: stepped.states };
      const year = startYear + Math.floor(i / seasonOrder.length);
      const tick = (i % seasonOrder.length) * ticksPerSeason;
      const clock: ClockState = { year, tick, subTick: 0 };
      save = syncEventFlags(save, clock, { species: content.species, nodeStates: save.nodeStates }, balance);

      // The LEVEL saturates — that is the fact the derived model tripped over, measured here.
      if (thrivingNodeIds(save.nodeStates, balance).length === nodes.length) saturatedSeasons += 1;

      for (let t = 0; t < ticksPerSeason; t += 1) {
        const at: ClockState = { year, tick: tick + t, subTick: 0 };
        for (const window of latchedBloomWindows(save, balance)) {
          if (!windowActive(window, at, balance)) continue;
          openTicks.set(window.id, (openTicks.get(window.id) ?? 0) + 1);
        }
      }
    }

    // Precondition of the whole test: the region really does saturate, so this is not a vacuous pass.
    expect(saturatedSeasons).toBeGreaterThan(0);
    // Every node bloomed at some point…
    expect(openTicks.size).toBeGreaterThan(0);
    // …and NO node was open for the whole run. Under the derived model every one of them was.
    for (const [id, ticks] of openTicks) {
      expect(ticks, id).toBeLessThan(seasons * ticksPerSeason);
      expect(ticks % ticksPerSeason, id).toBe(0);
    }
  });

  it("does NOT weight an encounter — bible §9's bonus-spawn half is unbuilt and unclaimed (D10)", () => {
    /*
     * G2/G3: the window ships, the multiplier does not, and no key for one exists in balance.json.
     *
     * ⚠ THE KEY CHECK ALONE WAS TOO NARROW TO BE THE GAP GUARD IT CLAIMS TO BE. It forbids two
     * SPELLINGS — `regionalEvents.bloomSpawnMultiplier` and `encounter.bloomMultiplier` — so the
     * bonus-spawn half could be built under any third name and this would have gone on reporting it
     * unbuilt. The structural half below closes that: the encounter roll's whole input surface is
     * `ForayContext`, and while that carries no event, window or flag field, a bloom CANNOT reach a
     * spawn weight by any spelling. Widening `ForayContext` — which is what building this feature
     * must do — turns this red, which is the point.
     */
    expect(Object.keys(balance.regionalEvents)).toEqual(
      expect.arrayContaining(["bloomFloraFraction", "windowFlagPrefix", "windowFlagSuffix"]),
    );
    expect(Object.keys(balance.regionalEvents)).not.toContain("bloomSpawnMultiplier");
    expect(Object.keys(balance.encounter)).not.toContain("bloomMultiplier");

    const encounters = readFileSync(new URL("../../game/encounters.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const surface = /export interface ForayContext \{[\s\S]*?\n\}/u.exec(encounters)?.[0];
    expect(surface, "ForayContext is gone — the encounter roll's input surface moved").toBeDefined();
    const fields = [...(surface as string).matchAll(/^\s{2}([A-Za-z_$][\w$]*)\??:/gmu)].map((m) => m[1]);
    expect(fields, "ForayContext declares no fields — the scan is looking in the wrong place").not.toHaveLength(0);
    /*
     * ⚠ `footing` WAS ADDED DELIBERATELY, AND IT IS NOT THE THING THIS LIST GUARDS AGAINST.
     *
     * The enumeration is a whitelist, so every widening of `ForayContext` has to come past this
     * assertion and be argued — which is exactly what it is for, and exactly what happened here. The
     * field carries the CELL the player is standing on and that node's encounter mask, so the roll
     * can stop firing on roads and town squares. It is spatial, derived from the hand-authored
     * layout, and carries no event, no window, no flag and no multiplier: what it can do is silence a
     * cell, and what it cannot do is change which animal a cell hands over or how heavily it is
     * weighted. bible §9's bonus-spawn half is exactly as unbuilt after it as before, which is why
     * the balance-key assertions above and the event-vocabulary sweep below are untouched — those two
     * are where this test's teeth actually are, and neither was loosened to let this through.
     */
    expect(
      fields.sort(),
      "ForayContext grew a field. If it carries a regional event, a window or an event flag, the " +
        "bonus-spawn half is being built — bible §9 D10 is no longer unclaimed and this test must " +
        "become an assertion of what the multiplier DOES.",
    ).toEqual(["act", "balance", "footing", "node", "season", "species", "unlockedSignChains"]);
    // …and no event vocabulary has appeared in the module either, under any key name.
    expect(encounters, "game/encounters.ts now names a regional event").not.toMatch(
      /\b(bloom|regionalEvent|activeWindow|windowFlag|festival|migrationWindow)\w*/iu,
    );
  });
});

/* ── all four together ────────────────────────────────────────────────────── */

describe("all four events, over a whole year", () => {
  it("every window that opens is open for exactly one season, and the flags follow", () => {
    const nodeId = "r1";
    const base: SaveFile = { ...fresh(), nodeStates: statesWithFlora(nodeId, balance.ecosim.floraMax) };
    const raid = balance.yearEvents.raids[0];
    // Mid-first-season, derived: the raid must open OFF a boundary (that is what makes it a
    // different case from the bloom below) and must close inside the same year for `spans` to see
    // its whole run. It was the literal 5, which was mid-season only for a 4-tick season.
    const raidTick = Math.floor(ticksPerSeason / 2);
    const withRaid = raid
      ? openRaidWindow(base, raid.id, { year: startYear, tick: raidTick, subTick: 0 }, balance)
      : base;
    // The bloom is LATCHED, so it has to be opened by a sync — exactly as the running game opens it.
    const latched = syncBloomLatches(
      withRaid,
      { year: startYear, tick: 0, subTick: 0 },
      withRaid.nodeStates,
      balance,
    );
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
    // EVERY window — bloom included — was open for exactly one season of that year. Bloom used to
    // be the exception ("it held all year because the flora it reads never fell"), which is the
    // sentence that described an event that was not one.
    expect(spans.get(FESTIVAL_WINDOW_ID)).toBe(ticksPerSeason);
    if (raid) expect(spans.get(raidWindowId(raid.id))).toBe(ticksPerSeason);
    for (const [id, span] of spans) expect(span, id).toBe(ticksPerSeason);
  });

  /*
   * bible §9's "Great Migration" as a KIND is open EVERY tick of every year, because
   * data/species.json ships exactly one migrant line per season and the seasons tile the year with
   * no gap. Each per-LINE window is a correct one season and the published flags are per line, so
   * nothing that gates on `event.migration.<lineId>.open` is wrong — but any copy that says "the
   * Great Migration is on" would be permanently true. Published here so the fact is a decision
   * rather than a surprise.
   *
   * `ticksOpen.migration === ticksPerYear` is also this file's standing tripwire on the divisibility
   * identity: it can only hold while `ticksPerSeason × seasonOrder.length === ticksPerYear`, so a
   * retune that breaks that identity fails HERE rather than somewhere downstream.
   */
  it("PUBLISHES the per-kind coverage, so a HUD claim about a KIND cannot be made by accident", () => {
    const nodeId = "r1";
    const raw: SaveFile = { ...fresh(), nodeStates: statesWithFlora(nodeId, balance.ecosim.floraMax) };
    const base = syncBloomLatches(raw, { year: startYear, tick: 0, subTick: 0 }, raw.nodeStates, balance);
    const deps = { species: content.species, nodeStates: base.nodeStates };
    const ticksOpen: Record<string, number> = { festival: 0, migration: 0, bloom: 0, raid: 0 };
    for (const clock of everyTick(1)) {
      const kinds = new Set(activeWindows(base, clock, deps, balance).map((w) => w.kind));
      for (const kind of kinds) ticksOpen[kind] = (ticksOpen[kind] ?? 0) + 1;
    }
    expect(ticksOpen.festival).toBe(ticksPerSeason);
    expect(ticksOpen.migration).toBe(ticksPerYear);
    expect(ticksOpen.bloom).toBe(ticksPerSeason);
    expect(content.species.filter((line) => line.seasonalWindow !== undefined)).toHaveLength(
      seasonOrder.length,
    );
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
  const latched = syncBloomLatches(fresh(), clock, states, balance);
  return latchedBloomWindows(latched, balance)[0] ?? null;
}
