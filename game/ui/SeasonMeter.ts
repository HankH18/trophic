/**
 * game/ui/SeasonMeter.ts — the always-visible season meter (locked decision L8).
 *
 * L8, verbatim: "16-tick season meter; travel 1 / foray 1 / inn 2; year = gym victory or full
 * meter." bible §12 lists "map + season meter" as a screen, and build-doc §4 makes the meter the
 * thing the player reads the ecology's clock off — so it is HUD, not a menu: it is on screen while
 * the overworld is.
 *
 * THIS MODULE COUNTS NOTHING. Every number below is read from core/clock.ts:
 *   - the tick cost of an action           → `ticksForAction`  (never `1` or `2` written here)
 *   - which season a tick belongs to       → `seasonAt`
 *   - the meter readout                    → `meter`
 *   - what an action would do to the meter → `advanceAction` (the real transition, run on a copy)
 * A HUD that re-derives "a foray is one tick" is a second home for L8, and the day the harness
 * retunes `balance.clock.forayTicks` (INV-3) the HUD and the world would disagree about what the
 * player just spent.
 *
 * Engine-free at runtime: `import type` only, so vitest can reach the model in node (importing
 * phaser there throws `ReferenceError: window is not defined` from phaser/src/device/OS.js).
 */

import type { ClockActionKind, ClockEvent, ClockState } from "@core/clock";
import { advanceAction, meter, seasonAt, ticksForAction } from "@core/clock";
import type { Balance, Season } from "@core/types";

/* ────────────────────────────────────────────────────────────────────────────
 * Model — pure, testable, engine-free
 * ──────────────────────────────────────────────────────────────────────────── */

/** One pip of the meter. There are `balance.clock.ticksPerYear` of them (16 at ship). */
export interface SeasonMeterCell {
  /** 0-based tick index this pip stands for. */
  index: number;
  season: Season;
  /** True once the meter has passed this tick. */
  filled: boolean;
  /** True for the first pip of each season — where the sim steps (build-doc §4). */
  seasonStart: boolean;
  /** True for the pip the meter is standing on right now. */
  current: boolean;
}

export interface SeasonMeterModel {
  year: number;
  /** balance.clock.yearsTotal — build-doc §1's six in-game years. */
  yearsTotal: number;
  finalYear: number;
  isFinalYear: boolean;
  tick: number;
  ticksPerYear: number;
  ticksPerSeason: number;
  season: Season;
  seasonIndex: number;
  seasonsPerYear: number;
  ticksIntoSeason: number;
  ticksLeftInSeason: number;
  ticksLeftInYear: number;
  cells: SeasonMeterCell[];
  /**
   * L8's "year = … full meter" — every pip filled, no pip current, `16/16`.
   *
   * A live clock never HOLDS this: `advance` fills the meter and resets the tick to 0 in the same
   * call, so `save.tick` only ever reads 0..15 and the one state the meter is named after was the
   * one it could not draw. {@link fullMeter} builds it, and the year-turn scene shows it — that is
   * the moment it is true.
   */
  full: boolean;
  /** "Y2/6 · summer · 7/16" — identifiers and numbers only (G7). */
  label: string;
  yearLabel: string;
  seasonLabel: string;
  tickLabel: string;
}

/**
 * Build the HUD's view model from the clock. `clock` is the save's `{year, tick}` (build-doc §7.8),
 * so the meter is a pure read of saved state and survives a reload without its own bookkeeping.
 */
export function seasonMeterModel(clock: ClockState, balance: Balance): SeasonMeterModel {
  const read = meter(clock, balance);
  const seasonsPerYear = balance.clock.seasonOrder.length;
  const finalYear = balance.clock.startYear + balance.clock.yearsTotal - 1;

  const cells: SeasonMeterCell[] = [];
  for (let index = 0; index < read.ticksPerYear; index += 1) {
    cells.push({
      index,
      season: seasonAt(index, balance),
      filled: index < read.tick,
      seasonStart: index % read.ticksPerSeason === 0,
      current: index === read.tick,
    });
  }

  const yearLabel = `Y${read.year}/${balance.clock.yearsTotal}`;
  const seasonLabel = read.season;
  const tickLabel = `${read.tick}/${read.ticksPerYear}`;

  return {
    year: read.year,
    yearsTotal: balance.clock.yearsTotal,
    finalYear,
    isFinalYear: read.year >= finalYear,
    tick: read.tick,
    ticksPerYear: read.ticksPerYear,
    ticksPerSeason: read.ticksPerSeason,
    season: read.season,
    seasonIndex: read.seasonIndex,
    seasonsPerYear,
    ticksIntoSeason: read.ticksIntoSeason,
    ticksLeftInSeason: read.ticksLeftInSeason,
    ticksLeftInYear: read.ticksLeftInYear,
    cells,
    full: read.tick >= read.ticksPerYear,
    label: `${yearLabel} · ${seasonLabel} · ${tickLabel}`,
    yearLabel,
    seasonLabel,
    tickLabel,
  };
}

/**
 * The meter at the instant L8's "year = … full meter" is true: `ticksPerYear` of `ticksPerYear`,
 * every pip filled.
 *
 * `advance` (core/clock.ts) fills the meter and resets the tick in one call, so no saved clock ever
 * carries this position and `seasonMeterModel(save)` can only ever show 15/16. This builds the
 * position rather than storing it, so the year-turn scene can draw the meter it just filled without
 * a second set of tick arithmetic — the model below is the ordinary one, asked about tick 16.
 */
export function fullMeter(year: number, balance: Balance): SeasonMeterModel {
  return seasonMeterModel({ year, tick: balance.clock.ticksPerYear }, balance);
}

/** What one action would cost and cross — for a confirm prompt, not for applying anything. */
export interface SeasonMeterPreview {
  kind: ClockActionKind;
  /** From `ticksForAction` — L8's travel 1 / foray 1 / inn 2, read from balance. */
  cost: number;
  before: SeasonMeterModel;
  after: SeasonMeterModel;
  /** Seasons this action would finish, in order — each one is an `ecosim.step` (build-doc §4). */
  seasonsCrossed: Season[];
  /** True when the action fills the meter: L8's "year = … full meter". */
  endsYear: boolean;
  events: ClockEvent[];
}

/**
 * Run the REAL transition on a copy and report it. Nothing here adds ticks itself, so a preview can
 * never disagree with what actually happens when the player commits.
 */
export function previewAction(
  clock: ClockState,
  kind: ClockActionKind,
  balance: Balance,
): SeasonMeterPreview {
  const result = advanceAction(clock, kind, balance);
  const seasonsCrossed: Season[] = [];
  for (const event of result.events) {
    if (event.t === "seasonBoundary") seasonsCrossed.push(event.seasonEnded);
  }
  return {
    kind,
    cost: ticksForAction(kind, balance),
    before: seasonMeterModel(clock, balance),
    after: seasonMeterModel(result.clock, balance),
    seasonsCrossed,
    endsYear: result.events.some((e) => e.t === "yearEnd"),
    events: result.events,
  };
}

/** Cost of each action kind, straight from balance — what the action menu prints next to a verb. */
export function actionCosts(balance: Balance): Record<ClockActionKind, number> {
  return {
    travel: ticksForAction("travel", balance),
    foray: ticksForAction("foray", balance),
    inn: ticksForAction("inn", balance),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * View — a Phaser HUD, wired through a structural port so the model stays testable
 * ──────────────────────────────────────────────────────────────────────────── */

/** Colours and geometry of the meter. Presentation only — no gameplay number lives here. */
export interface SeasonMeterStyle {
  x: number;
  y: number;
  cellW: number;
  cellH: number;
  cellGap: number;
  seasonGap: number;
  filledColor: number;
  emptyColor: number;
  currentColor: number;
  seasonStartColor: number;
  textColor: string;
  fontSize: string;
  fontFamily: string;
}

export const DEFAULT_SEASON_METER_STYLE: SeasonMeterStyle = {
  x: 8,
  y: 8,
  cellW: 6,
  cellH: 10,
  cellGap: 2,
  seasonGap: 5,
  filledColor: 0xe8e4c9,
  emptyColor: 0x3a4038,
  currentColor: 0xffd76a,
  seasonStartColor: 0x8fb08a,
  textColor: "#e8e4c9",
  fontSize: "10px",
  fontFamily: "monospace",
};

/** A drawn pip. Structural, so the HUD can be driven by a fake in tests. */
export interface MeterPip {
  setPosition(x: number, y: number): unknown;
  setFillStyle(color: number, alpha?: number): unknown;
  setSize(width: number, height: number): unknown;
}

export interface MeterLabel {
  setText(value: string): unknown;
  setPosition(x: number, y: number): unknown;
}

/** The surface the HUD draws on — one factory per primitive it needs. */
export interface MeterSurface {
  pip(index: number): MeterPip;
  label(): MeterLabel;
}

/**
 * The HUD itself. `render` is idempotent: it recreates nothing, it only restyles the pips it made
 * on the first call, so it is safe to call on every clock change.
 */
export class SeasonMeterHud {
  private readonly pips: MeterPip[] = [];
  private readonly text: MeterLabel;
  private lastLabel = "";

  constructor(
    private readonly surface: MeterSurface,
    private readonly style: SeasonMeterStyle = DEFAULT_SEASON_METER_STYLE,
  ) {
    this.text = surface.label();
  }

  /** X of pip `index`, with a wider gap between seasons so the four quarters read at a glance. */
  pipX(index: number, ticksPerSeason: number): number {
    const seasonIndex = Math.floor(index / ticksPerSeason);
    return (
      this.style.x +
      index * (this.style.cellW + this.style.cellGap) +
      seasonIndex * this.style.seasonGap
    );
  }

  colorFor(cell: SeasonMeterCell): number {
    if (cell.current) return this.style.currentColor;
    if (cell.filled) return this.style.filledColor;
    if (cell.seasonStart) return this.style.seasonStartColor;
    return this.style.emptyColor;
  }

  render(model: SeasonMeterModel): void {
    for (const cell of model.cells) {
      let pip = this.pips[cell.index];
      if (!pip) {
        pip = this.surface.pip(cell.index);
        this.pips[cell.index] = pip;
      }
      pip.setSize(this.style.cellW, this.style.cellH);
      pip.setPosition(this.pipX(cell.index, model.ticksPerSeason), this.style.y);
      pip.setFillStyle(this.colorFor(cell));
    }
    if (model.label !== this.lastLabel) {
      this.text.setText(model.label);
      this.lastLabel = model.label;
    }
    this.text.setPosition(
      this.style.x,
      this.style.y + this.style.cellH + this.style.cellGap,
    );
  }

  /** The label currently on screen — what a screenshot test or the demo capture reads. */
  labelText(): string {
    return this.lastLabel;
  }
}

/*
 * Phaser adapter. `import type` only: this file must not pull the engine into the module graph, or
 * every test that reaches the model would need a browser. The scene hands its own `add` factory in.
 */
import type PhaserNS from "phaser";

/** Build a {@link MeterSurface} from a live scene. Called from the overworld's `create`. */
export function phaserMeterSurface(
  scene: PhaserNS.Scene,
  style: SeasonMeterStyle = DEFAULT_SEASON_METER_STYLE,
): MeterSurface {
  return {
    pip(): MeterPip {
      const rect = scene.add.rectangle(0, 0, style.cellW, style.cellH, style.emptyColor);
      rect.setOrigin(0, 0);
      rect.setScrollFactor(0);
      return rect;
    },
    label(): MeterLabel {
      const text = scene.add.text(0, 0, "", {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        color: style.textColor,
      });
      text.setOrigin(0, 0);
      text.setScrollFactor(0);
      return text;
    },
  };
}
