/**
 * game/year-events.ts — the scripted act events of the year turn.
 *
 * build-doc §7.5 step 5: "node sims run their 4th season step + year events (Cullbrand raid scripts
 * decrement scripted node populations)". bible §9 regional events: "Annual Festival (diegetic gym
 * gate, closes the year); … Cullbrand Harvest raids (scripted per act, populations visibly drop at a
 * named node)".
 *
 * WHAT THIS FILE IS ALLOWED TO BE. A Cullbrand raid is a SCRIPTED WORLD EVENT and scripting it is
 * explicitly sanctioned — it is the antagonist's industrial harvest, "the scripted, large-scale
 * version of the player's own over-catching" (bible §8). What it is NOT is the cascade: G6 forbids
 * scripting that, and the predator collapse that makes Cindershelf's arrival read as "mid-collapse"
 * must EMERGE from the build-doc §7.3 rules once the harvested prey are gone. So:
 *
 *   - the raid list is DATA (`balance.yearEvents.raids`), read through core/lifecycle.ts
 *     `yearEventsOf`; this module never writes one and never invents one;
 *   - the raid is APPLIED by core/lifecycle.ts `runYearTurn`, which owns the population floor and
 *     the `recentDeaths` credit; this module never decrements a population;
 *   - nothing here touches core/ecosim.ts or its rules.
 *
 * This module is the READ side: which raids fire this year, at which named node, and the real
 * numbers to put on screen (Hard Req 2 — "the in-game ledger shows real numbers, never proxies").
 *
 * Engine-free at runtime (`import type` only): vitest's node environment cannot import phaser.
 */

import type { RaidScript, YearTurnEvent } from "@core/lifecycle";
import { indexSpecies, yearEventsOf } from "@core/lifecycle";
import type { Balance, NodeFile, NodeState, SpeciesLine } from "@core/types";

/* ────────────────────────────────────────────────────────────────────────────
 * Naming things without naming content (G2 / G3)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The identity a ledger line shows for a species line.
 *
 * The age class comes from `balance.ecosim.webRoleAgeClass` — bible §5: "the population sim tracks
 * the line as one age-structured species", and that key is the class the sim reads the line at. A
 * literal age class here would be a second opinion about what a population IS; a hard-coded form
 * name would be content in code (G2, and the repo-wide species-name sweep in
 * tests/property/foodweb.test.ts would fail on it).
 */
export function ledgerNameOf(line: SpeciesLine, balance: Balance): string {
  return line.formNames[balance.ecosim.webRoleAgeClass];
}

/* ────────────────────────────────────────────────────────────────────────────
 * How long the game is (build-doc §1 — six in-game years)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The last year of the game: `startYear + yearsTotal − 1`, 6 on the shipped clock.
 *
 * ONE home for the arithmetic. It was written out three times in this lane (here, in the season
 * meter, in the festival beat) and NOWHERE was it used to stop anything: `core/clock.ts` `isOver`
 * existed and no production code called it, so the shipped game ran a full year turn out of year 6
 * and printed "FESTIVAL · Y7/6", then "Y8/6", then "Y9/6" — a six-year game with no end. The cap is
 * enforced in `game/scenes/YearTurnScene.ts` `driveYearTurn` (the turn refuses to run for a save
 * already past the final year) and in `game/scenes/OverworldScene.ts` (no ticks are spent once
 * `isOver` is true); this function is what both of them ask.
 */
export function finalYearOf(balance: Balance): number {
  return balance.clock.startYear + balance.clock.yearsTotal - 1;
}

/**
 * True for the year turn that ENDS the game: the one out of the final year.
 *
 * `endedYear` is the year the clock says just finished (`ClockEvent {t:"yearEnd", year}`). The turn
 * still runs — it owes the final year its fourth season step (build-doc §7.5 step 5), which is the
 * sixth of the six turns the 24-season-step invariant counts (LANE-A-STATUS §5) — and the run is
 * over when it completes.
 */
export function yearTurnEndsRun(endedYear: number, balance: Balance): boolean {
  return endedYear >= finalYearOf(balance);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Which raids fire
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The raids scripted for `year`, straight out of balance.json.
 *
 * `override` exists for the harness and for tests, exactly as `YearTurnDeps.yearEvents` does — pass
 * the same list to both or the screen and the world disagree.
 */
export function raidsForYear(
  balance: Balance,
  year: number,
  override?: readonly RaidScript[],
): RaidScript[] {
  return yearEventsOf(balance, override).filter((raid) => raid.year === year);
}

/** True when the year turn into `year` will fire at least one scripted raid. */
export function hasRaids(balance: Balance, year: number, override?: readonly RaidScript[]): boolean {
  return raidsForYear(balance, year, override).length > 0;
}

/**
 * The years a raid can actually fire in, in order.
 *
 * NOT the six years of the game. `core/lifecycle.ts` `runYearTurn` computes `newYear = save.year + 1`
 * and applies only the raids whose `year` equals it, so a raid is applied by the turn that BEGINS
 * its year — and no turn ever begins `balance.clock.startYear`, because the game starts there. The
 * last reachable year is the final year (`startYear + yearsTotal − 1`): the turn after that one ends
 * the six-year game, and `core/clock.ts` `isOver` says so.
 *
 * So over the shipped 1..6 clock the reachable set is 2..6, and a raid authored for year 1 or year 7
 * would never fire — see {@link raidCoverage}, which reports exactly that rather than letting the
 * beat quietly not happen.
 */
export function raidableYears(balance: Balance): number[] {
  const years: number[] = [];
  for (let year = balance.clock.startYear + 1; year <= finalYearOf(balance); year += 1) {
    years.push(year);
  }
  return years;
}

/**
 * Honest coverage of bible §9's "scripted per act".
 *
 * Only ONE raid is authored — the year-4 Route 4 strip-harvest the bible pins to a named node and
 * year (bible §6, Cindershelf: "arrival mid-collapse — Route 4's web already crashed by Cullbrand
 * strip-harvest"). The other acts' raids are unwritten CONTENT; inventing them here would be G2, so
 * this reports the gap instead of filling it. A UI can use it to avoid promising a beat that has no
 * data behind it.
 *
 * The gap is reported over {@link raidableYears}, not over the six years of the game. Reporting
 * `startYear` as an unauthored act was a promise the engine could never keep: the year turn always
 * ends year N and begins N+1, so nothing can fire a raid in the year the player starts in. A raid
 * authored for an unreachable year is the mirror-image failure and comes back in
 * `unreachableScriptedYears` — a one-character typo in the raid list otherwise buys a beat that
 * silently does not happen, which is the same class of defect `runYearTurn` throws on for a
 * misspelled node id.
 */
export function raidCoverage(
  balance: Balance,
  override?: readonly RaidScript[],
): { scriptedYears: number[]; unauthoredYears: number[]; unreachableScriptedYears: number[] } {
  const scripted = new Set(yearEventsOf(balance, override).map((raid) => raid.year));
  const reachable = raidableYears(balance);
  const unauthored = reachable.filter((year) => !scripted.has(year));
  const unreachable = [...scripted].filter((year) => !reachable.includes(year));
  return {
    scriptedYears: [...scripted].sort((a, b) => a - b),
    unauthoredYears: unauthored,
    unreachableScriptedYears: unreachable.sort((a, b) => a - b),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Before the turn — what is about to be harvested
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RaidTargetPreview {
  lineId: string;
  ledgerName: string;
  /** The live count right now, from `save.nodeStates` (build-doc §8.3: the ledger reads these). */
  before: number;
  /** How many the script asks for. What actually dies is core's call — see the note below. */
  requested: number;
}

export interface RaidPreview {
  eventId: string;
  year: number;
  nodeId: string;
  nodeName: string;
  targets: RaidTargetPreview[];
}

/**
 * What the scripted raids will reach for, with the current numbers beside them.
 *
 * Deliberately does NOT predict the surviving count. `runYearTurn` applies
 * `max(balance.ecosim.populationFloor, count − remove)` and credits `recentDeaths` with what
 * actually died; restating that arithmetic here would be a second implementation of a rule core
 * owns, and the two would drift the first time the floor is retuned (INV-3). The post-raid numbers
 * come back in the year turn's own events — see {@link raidReportsFrom}.
 */
export function raidPreviews(
  states: Readonly<Record<string, NodeState>>,
  nodes: readonly NodeFile[],
  species: readonly SpeciesLine[],
  balance: Balance,
  year: number,
  override?: readonly RaidScript[],
): RaidPreview[] {
  const index = indexSpecies(species);
  const nodeNames = new Map(nodes.map((node) => [node.id, node.name] as const));
  return raidsForYear(balance, year, override).map((raid) => {
    const state = states[raid.nodeId];
    const targets: RaidTargetPreview[] = raid.targets.map((target) => {
      const line = index.get(target.lineId);
      return {
        lineId: target.lineId,
        ledgerName: line ? ledgerNameOf(line, balance) : target.lineId,
        before: state?.populations[target.lineId]?.count ?? 0,
        requested: target.remove,
      };
    });
    return {
      eventId: raid.id,
      year: raid.year,
      nodeId: raid.nodeId,
      nodeName: nodeNames.get(raid.nodeId) ?? raid.nodeId,
      targets,
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * After the turn — what actually happened
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RaidTargetReport {
  lineId: string;
  ledgerName: string;
  /** Reconstructed from the event: `remaining + removed`. No second arithmetic. */
  before: number;
  removed: number;
  remaining: number;
}

export interface RaidReport {
  eventId: string;
  nodeId: string;
  nodeName: string;
  targets: RaidTargetReport[];
  totalRemoved: number;
}

/**
 * Turn the year turn's `raid` events into ledger rows.
 *
 * build-doc §4 makes the scene "a renderer of its event log", and this is that read for step 5: the
 * numbers on screen are the numbers the sim moved, not a recomputation of them.
 */
export function raidReportsFrom(
  events: readonly YearTurnEvent[],
  nodes: readonly NodeFile[],
  species: readonly SpeciesLine[],
  balance: Balance,
): RaidReport[] {
  const index = indexSpecies(species);
  const nodeNames = new Map(nodes.map((node) => [node.id, node.name] as const));
  const byEvent = new Map<string, RaidReport>();

  for (const event of events) {
    if (event.t !== "raid") continue;
    const key = `${event.eventId}@${event.nodeId}`;
    let report = byEvent.get(key);
    if (!report) {
      report = {
        eventId: event.eventId,
        nodeId: event.nodeId,
        nodeName: nodeNames.get(event.nodeId) ?? event.nodeId,
        targets: [],
        totalRemoved: 0,
      };
      byEvent.set(key, report);
    }
    const line = index.get(event.lineId);
    report.targets.push({
      lineId: event.lineId,
      ledgerName: line ? ledgerNameOf(line, balance) : event.lineId,
      before: event.remaining + event.removed,
      removed: event.removed,
      remaining: event.remaining,
    });
    report.totalRemoved += event.removed;
  }

  return [...byEvent.values()];
}

/**
 * One line per harvested population: identity and three numbers.
 *
 * G7 — the ledger is the moral. No sentence here characterises the harvest; the arrow does the work.
 */
export function raidLedgerLines(reports: readonly RaidReport[]): string[] {
  const lines: string[] = [];
  for (const report of reports) {
    for (const target of report.targets) {
      lines.push(
        `${report.nodeName} · ${target.ledgerName} ${target.before} → ${target.remaining} (−${target.removed})`,
      );
    }
  }
  return lines;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The festival — bible §9: "Annual Festival (diegetic gym gate, closes the year)"
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FestivalBeat {
  /** The year that is BEGINNING — the turn ends year N and begins N+1 (core/lifecycle.ts). */
  year: number;
  yearsTotal: number;
  /** How many years of the six are now behind the player. */
  yearsElapsed: number;
  isFinalYear: boolean;
  /**
   * True for the turn out of the FINAL year, whose beginning year is past the game.
   *
   * `runYearTurn` always begins `save.year + 1`, so the sixth of the six turns begins year 7 — a
   * year `core/clock.ts` `isOver` calls past the game and the player never gets to play. The label
   * used to announce it as `Y7/6`, and the season meter agreed, and nothing stopped the next turn
   * from announcing `Y8/6`. See {@link finalYearOf}.
   */
  beyondFinalYear: boolean;
  /** "Y3/6", or "Y6/6 · complete" for the turn that ends the game — the whole festival's copy. */
  label: string;
}

export function festivalBeat(year: number, balance: Balance): FestivalBeat {
  const finalYear = finalYearOf(balance);
  const beyondFinalYear = year > finalYear;
  const yearsTotal = balance.clock.yearsTotal;
  return {
    year,
    yearsTotal,
    yearsElapsed: Math.max(0, year - balance.clock.startYear),
    isFinalYear: year === finalYear,
    beyondFinalYear,
    // Past the final year the six years are what there is to report; naming a seventh states a year
    // the game does not have.
    label: beyondFinalYear
      ? `Y${String(finalYear)}/${String(yearsTotal)} · complete`
      : `Y${String(year)}/${String(yearsTotal)}`,
  };
}
