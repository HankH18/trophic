/**
 * tests/unit/season-meter.test.ts — the HUD meter must move for every price the game charges.
 *
 * THE DEFECT THIS BINDS. `balance.clock.battleTicks` is a FRACTION of a tick, charged once when a
 * fight launches, and the overworld HUD prints it to the player as a price ("battle 0.5") right
 * beside the verb. The meter read `tick` alone — whole ticks — so the player paid that price and
 * NOTHING on screen moved; two battles then jumped the meter a whole pip with nothing to say what
 * the first one had bought. `core/clock.ts` had carried the fraction in `ClockState.subTick` and
 * published it on `ClockMeter` the whole time; `game/` had no consumer for either.
 *
 * Two levels, because the model being right is not the same as the player seeing it: the first
 * describes are about `seasonMeterModel`, the second drives `SeasonMeterHud` through a fake surface
 * and reads the geometry and the label text that reach the screen.
 *
 * Every number below is derived from `balance.clock` (G11/INV-3). The resolution is exercised at
 * more than one value on purpose — `subTicksPerTick` is a tunable, `core/schemas.ts` accepts a
 * quarter-tick cost at a resolution of four, and a HUD that assumed halves would be a second home
 * for a number that is expected to move again after playtesting.
 */
import { describe, it, expect } from "vitest";
import type { ClockState } from "@core/clock";
import { advanceAction, createClock, subTicksForAction } from "@core/clock";
import { zBalance } from "@core/schemas";
import type { Balance } from "@core/types";
import type { MeterLabel, MeterPip, MeterSurface, SeasonMeterModel } from "@game/ui/SeasonMeter";
import {
  DEFAULT_SEASON_METER_STYLE,
  SeasonMeterHud,
  fullMeter,
  seasonMeterModel,
} from "@game/ui/SeasonMeter";
import raw from "../../data/balance.json";

const balance = zBalance.parse(raw);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The shipped balance retuned to a FINER resolution, parsed through the real schema so the case is
 * a legal retune and not a hand-made object. `core/schemas.ts` refuses a cost that is not an exact
 * multiple of `1 / subTicksPerTick`, so the two keys have to move together — which is exactly the
 * retune `tests/unit/clock-subtick.test.ts` documents as the way to make finer costs legal.
 */
function atResolution(perTick: number, battleTicks: number): Balance {
  const draft = clone(raw) as { clock: Record<string, unknown> };
  draft.clock["subTicksPerTick"] = perTick;
  draft.clock["battleTicks"] = battleTicks;
  return zBalance.parse(draft);
}

const RESOLUTIONS: { name: string; balance: Balance }[] = [
  { name: "shipped", balance },
  { name: "quarter ticks", balance: atResolution(4, 0.25) },
];

/** N battles from a fresh clock, through the REAL transition — nothing here adds ticks itself. */
function afterBattles(n: number, b: Balance): ClockState {
  let clock = createClock(b);
  for (let i = 0; i < n; i += 1) clock = advanceAction(clock, "battle", b).clock;
  return clock;
}

/** The model the HUD would draw after N battles. */
function meterAfter(n: number, b: Balance): SeasonMeterModel {
  return seasonMeterModel(afterBattles(n, b), b);
}

describe("season meter — the fraction of a tick a battle costs", () => {
  for (const { name, balance: b } of RESOLUTIONS) {
    describe(`at ${name} (subTicksPerTick ${String(b.clock.subTicksPerTick)})`, () => {
      /** Battles it takes to fill one whole tick at this resolution — derived, never written. */
      const perTick = b.clock.subTicksPerTick / subTicksForAction("battle", b);

      it("BINDS — every battle moves the meter, and the odd ones are the ones that did not", () => {
        // The precondition the defect lived in: a battle costs less than a whole tick here, so the
        // odd ones leave `tick` exactly where it was. If a retune ever makes a battle whole, this
        // reads as more than one battle to the tick and the loop below still holds.
        expect(perTick).toBeGreaterThan(1);

        // Four whole ticks' worth, plus one — so the sweep covers both the odd battle that only
        // moves the fraction and the even one that completes a tick, several times over.
        const total = Math.round(perTick * 4) + 1;
        let odd = 0;
        for (let n = 1; n <= total; n += 1) {
          const before = meterAfter(n - 1, b);
          const after = meterAfter(n, b);
          expect(after, `battle ${String(n)} drew the same meter as battle ${String(n - 1)}`)
            .not.toEqual(before);
          // …and it moved in the part the player reads, not only in a field nothing renders.
          expect(after.label).not.toBe(before.label);
          if (after.tick === before.tick) {
            odd += 1;
            // The whole tick has NOT moved: this is the exact state the HUD used to draw
            // identically to the one before it.
            expect(after.subTick).toBeGreaterThan(before.subTick);
          }
        }
        // The sweep really contained the broken case, rather than passing by never reaching it.
        expect(odd).toBeGreaterThan(0);
      });

      it("the reading is exact: N battles read as N times the cost, and a whole tick is whole", () => {
        for (let n = 0; n <= Math.round(perTick * 2); n += 1) {
          const model = meterAfter(n, b);
          const spentSubTicks = n * subTicksForAction("battle", b);
          expect(model.tick).toBe(Math.floor(spentSubTicks / b.clock.subTicksPerTick));
          expect(model.subTick).toBe(spentSubTicks % b.clock.subTicksPerTick);
          expect(model.subTicksPerTick).toBe(b.clock.subTicksPerTick);
          // A whole number of ticks prints as a whole number — no "7.0", no trailing fraction.
          if (model.subTick === 0) {
            expect(model.tickLabel).toBe(`${String(model.tick)}/${String(b.clock.ticksPerYear)}`);
          } else {
            expect(model.tickLabel).not.toBe(`${String(model.tick)}/${String(b.clock.ticksPerYear)}`);
          }
        }
      });

      it("the pips carry the fraction: the pip the meter stands on is the only part-spent one", () => {
        const model = meterAfter(1, b);
        for (const cell of model.cells) {
          if (cell.filled) expect(cell.subTicksSpent).toBe(b.clock.subTicksPerTick);
          else if (cell.current) expect(cell.subTicksSpent).toBe(model.subTick);
          else expect(cell.subTicksSpent).toBe(0);
        }
        const part = model.cells.filter(
          (c) => c.subTicksSpent > 0 && c.subTicksSpent < b.clock.subTicksPerTick,
        );
        expect(part).toHaveLength(1);
        expect(part[0]?.current).toBe(true);
      });
    });
  }

  it("half a tick is half a tick at any resolution — the reading is derived, not formatted by hand", () => {
    const quarters = atResolution(4, 0.25);
    const tick = balance.clock.ticksPerSeason; // any tick the clock can stand on
    const halfAtTwo = seasonMeterModel(
      { year: balance.clock.startYear, tick, subTick: balance.clock.subTicksPerTick / 2 },
      balance,
    );
    const halfAtFour = seasonMeterModel(
      { year: quarters.clock.startYear, tick, subTick: quarters.clock.subTicksPerTick / 2 },
      quarters,
    );
    expect(halfAtFour.tickLabel).toBe(halfAtTwo.tickLabel);

    // …and a quarter is NOT a half: the finer resolution says something the coarse one cannot.
    const quarter = seasonMeterModel(
      { year: quarters.clock.startYear, tick, subTick: 1 },
      quarters,
    );
    expect(quarter.tickLabel).not.toBe(halfAtFour.tickLabel);
    expect(quarter.tickLabel).toContain(String(tick));
  });

  it("the full meter still reads ticksPerYear of ticksPerYear, with no fraction on the end", () => {
    // The year-turn card prints this label (`game/scenes/YearTurnScene.ts`), so the fraction may
    // not leak into the one state the meter is named after.
    const filled = fullMeter(balance.clock.startYear, balance);
    expect(filled.tickLabel).toBe(
      `${String(balance.clock.ticksPerYear)}/${String(balance.clock.ticksPerYear)}`,
    );
    expect(filled.subTick).toBe(0);
    expect(filled.cells.every((c) => c.subTicksSpent === balance.clock.subTicksPerTick)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * What the PLAYER sees — the model being right is not the same as it reaching the screen
 * ════════════════════════════════════════════════════════════════════════════ */

interface DrawnPip {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: number;
}

function fakeHud(): {
  hud: SeasonMeterHud;
  pips: Map<number, DrawnPip>;
  labelText: () => string;
  made: () => number;
} {
  const pips = new Map<number, DrawnPip>();
  let label = "";
  let made = 0;
  const surface: MeterSurface = {
    pip(index: number): MeterPip {
      made += 1;
      const drawn: DrawnPip = { x: 0, y: 0, w: 0, h: 0, fill: 0 };
      pips.set(index, drawn);
      return {
        setPosition: (x: number, y: number) => {
          drawn.x = x;
          drawn.y = y;
        },
        setSize: (width: number, height: number) => {
          drawn.w = width;
          drawn.h = height;
        },
        setFillStyle: (color: number) => {
          drawn.fill = color;
        },
      };
    },
    label(): MeterLabel {
      return {
        setText: (value: string) => {
          label = value;
        },
        setPosition: () => undefined,
      };
    },
  };
  return {
    hud: new SeasonMeterHud(surface, DEFAULT_SEASON_METER_STYLE),
    pips,
    labelText: () => label,
    made: () => made,
  };
}

/** The pip geometry as the surface received it — what a screenshot of the HUD would show. */
function drawnAfter(n: number, b: Balance): { pips: Map<number, DrawnPip>; label: string } {
  const view = fakeHud();
  view.hud.render(meterAfter(n, b));
  return { pips: view.pips, label: view.labelText() };
}

describe("season meter HUD — the fraction reaches the pixels", () => {
  const style = DEFAULT_SEASON_METER_STYLE;

  it("BINDS — one battle changes the drawn meter, in the pips and in the label", () => {
    const zero = drawnAfter(0, balance);
    const one = drawnAfter(1, balance);

    expect(one.label).not.toBe(zero.label);

    const changed = [...one.pips.entries()].filter(([index, pip]) => {
      const was = zero.pips.get(index);
      return !was || was.h !== pip.h || was.y !== pip.y || was.fill !== pip.fill;
    });
    expect(changed.length, "one battle redrew no pip differently").toBeGreaterThan(0);
  });

  it("the part-spent pip is drawn short, on the same baseline, and never disappears", () => {
    const model = meterAfter(1, balance);
    const drawn = drawnAfter(1, balance).pips;
    const current = model.cells.find((c) => c.current);
    expect(current).toBeDefined();
    const pip = drawn.get(current?.index ?? -1);
    expect(pip).toBeDefined();
    if (!pip) return;

    expect(pip.h).toBeLessThan(style.cellH); // short by the part of the tick already spent
    expect(pip.h).toBeGreaterThanOrEqual(1); // the position marker never rounds away
    expect(pip.y + pip.h).toBe(style.y + style.cellH); // …and it drains from the top, not the bottom

    // Every OTHER pip is a whole tick and is drawn full height on that same baseline.
    for (const cell of model.cells) {
      if (cell.current) continue;
      const other = drawn.get(cell.index);
      expect(other?.h).toBe(style.cellH);
      expect(other?.y).toBe(style.y);
    }
  });

  it("the pip drains monotonically as the fraction accrues, at any resolution", () => {
    for (const { balance: b } of RESOLUTIONS) {
      const per = b.clock.subTicksPerTick;
      const heights: number[] = [];
      for (let sub = 0; sub < per; sub += 1) {
        const view = fakeHud();
        view.hud.render(
          seasonMeterModel({ year: b.clock.startYear, tick: b.clock.ticksPerSeason, subTick: sub }, b),
        );
        const height = view.pips.get(b.clock.ticksPerSeason)?.h ?? 0;
        heights.push(height);
        expect(height).toBeGreaterThanOrEqual(1);
        expect(height).toBeLessThanOrEqual(style.cellH);
      }
      expect(heights[0]).toBe(style.cellH); // an untouched tick is a whole pip
      expect(heights[per - 1]).toBeLessThan(style.cellH); // the last fraction before it completes
      for (let i = 1; i < heights.length; i += 1) {
        expect(heights[i] ?? 0).toBeLessThanOrEqual(heights[i - 1] ?? 0);
      }
    }
  });

  it("draws no extra pip for the fraction — one pip per tick, restyled, whatever the clock holds", () => {
    const view = fakeHud();
    view.hud.render(meterAfter(0, balance));
    expect(view.made()).toBe(balance.clock.ticksPerYear);
    view.hud.render(meterAfter(1, balance));
    view.hud.render(meterAfter(2, balance));
    expect(view.made()).toBe(balance.clock.ticksPerYear);
  });
});
