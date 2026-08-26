/**
 * game/year-events.ts — the scripted ACT events, and the year turn's festival beat.
 *
 * build-doc §7.5 step 5: "node sims run their 4th season step + year events (Cullbrand raid scripts
 * decrement scripted node populations)". bible §9 regional events: "Annual Festival (diegetic gym
 * gate, closes the year); … Cullbrand Harvest raids (scripted per act, populations visibly drop at a
 * named node)".
 *
 * ⚠ "YEAR" IN THE NAME IS HISTORY, NOT THE MODEL. The raids fire on ACT ENTRY — bible §9
 * always said "scripted per act", and it was content-bible §6's "six acts = six years" equation
 * that made the two look like one axis. The module and the balance group keep the name
 * `yearEvents` because build-doc §7.5 step 5 names them that; nothing here reads the calendar.
 *
 * WHAT THIS FILE IS ALLOWED TO BE. A Cullbrand raid is a SCRIPTED WORLD EVENT and scripting it is
 * explicitly sanctioned — it is the antagonist's industrial harvest, "the scripted, large-scale
 * version of the player's own over-catching" (bible §8). What it is NOT is the cascade: G6 forbids
 * scripting that, and the predator collapse that makes Cindershelf's arrival read as "mid-collapse"
 * must EMERGE from the build-doc §7.3 rules once the harvested prey are gone. So:
 *
 *   - the raid list is DATA (`balance.yearEvents.raids`), read through core/lifecycle.ts
 *     `yearEventsOf`; this module never writes one and never invents one;
 *   - the raid is APPLIED by core/lifecycle.ts `enterPendingActs`, on entry to the raid's act,
 *     which owns the population floor and the `recentDeaths` credit; this module never decrements
 *     a population;
 *   - nothing here touches core/ecosim.ts or its rules.
 *
 * This module is the READ side: which raids fire this year, at which named node, and the real
 * numbers to put on screen (Hard Req 2 — "the in-game survey shows real numbers, never proxies").
 *
 * Engine-free at runtime (`import type` only): vitest's node environment cannot import phaser.
 */

import { actGates } from "@core/acts";
import type { ActEntryEvent, RaidScript, YearTurnEvent } from "@core/lifecycle";
import {
  indexSpecies,
  raidRemovalAt,
  raidsForAct as coreRaidsForAct,
  yearEventsOf,
} from "@core/lifecycle";
import type { Balance, NodeFile, NodeState, SpeciesLine } from "@core/types";

/* ────────────────────────────────────────────────────────────────────────────
 * Naming things without naming content (G2 / G3)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The identity a survey line shows for a species line.
 *
 * The age class comes from `balance.ecosim.webRoleAgeClass` — bible §5: "the population sim tracks
 * the line as one age-structured species", and that key is the class the sim reads the line at. A
 * literal age class here would be a second opinion about what a population IS; a hard-coded form
 * name would be content in code (G2, and the repo-wide species-name sweep in
 * tests/property/foodweb.test.ts would fail on it).
 */
export function surveyNameOf(line: SpeciesLine, balance: Balance): string {
  return line.formNames[balance.ecosim.webRoleAgeClass];
}

/* ────────────────────────────────────────────────────────────────────────────
 * How long the game is — IT ISN'T
 * ──────────────────────────────────────────────────────────────────────────── */

/*
 * `finalYearOf` AND `yearTurnEndsRun` USED TO LIVE HERE, and they are gone with the cap they
 * enforced. There is no final year: the calendar is unbounded (`core/clock.ts`), it never ends and
 * it never waits, and a save in year 20 with one badge is legal. The run ends on an ACT condition
 * — `core/acts.ts` `runIsComplete` — whenever the player earns it, and on nothing else. No fail
 * state, no time limit, no year cap.
 *
 * `balance.clock.yearsTotal` survives as the EXPECTED year count under normal pacing, which is what
 * {@link festivalBeat} quotes and what the balance harness drives by default. It is a correlation,
 * not a rule, and nothing may read it to decide whether the run is over.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Which raids fire — on ACT, never on a year (bible §9 "scripted per act")
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The raids scripted for `act`, straight out of balance.json.
 *
 * `override` exists for the harness and for tests, exactly as `ActEntryDeps.yearEvents` does — pass
 * the same list to both or the screen and the world disagree.
 */
export function raidsForAct(
  balance: Balance,
  act: number,
  override?: readonly RaidScript[],
): RaidScript[] {
  return coreRaidsForAct(balance, act, override);
}

/** True when entering `act` will fire at least one scripted raid. */
export function hasRaids(balance: Balance, act: number, override?: readonly RaidScript[]): boolean {
  return raidsForAct(balance, act, override).length > 0;
}

/**
 * The acts a raid can actually fire in, in order — every act the region has.
 *
 * ⚠ THIS USED TO BE `raidableYears`, AND IT EXCLUDED THE FIRST ONE. The raid was applied by the
 * year turn that BEGAN its year, and no turn ever begins the start year, so a raid authored for
 * year 1 could never fire. Act entry has no such hole: `core/lifecycle.ts` `enterPendingActs` fires
 * every act the save reaches INCLUDING the first, so bible §9's act-1 raid is now authorable — it
 * is simply unwritten (see {@link raidCoverage}).
 */
export function raidableActs(balance: Balance): number[] {
  return actGates(balance).map((gate) => gate.act);
}

/**
 * Honest coverage of bible §9's "scripted per act".
 *
 * Only ONE raid is authored — the act-4 Route 4 strip-harvest the bible pins to a named node and
 * act (bible §6, Cindershelf: "arrival mid-collapse — Route 4's web already crashed by Cullbrand
 * strip-harvest"). The other acts' raids are unwritten CONTENT; inventing them here would be G2, so
 * this reports the gap instead of filling it. A UI can use it to avoid promising a beat that has no
 * data behind it.
 *
 * A raid authored for an act the region does not have comes back in `unreachableScriptedActs` — a
 * one-character typo in the raid list otherwise buys a beat that silently does not happen, which is
 * the same class of defect `enterPendingActs` throws on for a misspelled node id.
 */
export function raidCoverage(
  balance: Balance,
  override?: readonly RaidScript[],
): { scriptedActs: number[]; unauthoredActs: number[]; unreachableScriptedActs: number[] } {
  const scripted = new Set(yearEventsOf(balance, override).map((raid) => raid.act));
  const reachable = raidableActs(balance);
  const unauthored = reachable.filter((act) => !scripted.has(act));
  const unreachable = [...scripted].filter((act) => !reachable.includes(act));
  return {
    scriptedActs: [...scripted].sort((a, b) => a - b),
    unauthoredActs: unauthored,
    unreachableScriptedActs: unreachable.sort((a, b) => a - b),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Before the turn — what is about to be harvested
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RaidTargetPreview {
  lineId: string;
  surveyName: string;
  /** The live count right now, from `save.nodeStates` (build-doc §8.3: the survey reads these). */
  before: number;
  /**
   * How many the harvest reaches for, priced against {@link RaidTargetPreview.before}.
   *
   * ⚠ NOT `target.remove`. A strip-harvest takes the standing stock, so the number the
   * script asks for depends on what is standing — `core/lifecycle.ts` `raidRemovalAt` is the one
   * home of that rule and this reads it rather than restating it. It used to be the raw authored
   * body count, which was the same number at the shipped state and a different one at every other.
   * What actually dies is still core's call — see the note below.
   */
  requested: number;
}

export interface RaidPreview {
  eventId: string;
  /** The ACT the raid fires on entry to — never a calendar year. */
  act: number;
  nodeId: string;
  nodeName: string;
  targets: RaidTargetPreview[];
}

/**
 * What the scripted raids will reach for, with the current numbers beside them.
 *
 * Deliberately does NOT predict the surviving count. `enterPendingActs` applies
 * `max(balance.ecosim.populationFloor, count − raidRemovalAt(count, target, balance))` and credits
 * `recentDeaths` with what actually died; restating that arithmetic here would be a second
 * implementation of a rule core owns, and the two would drift the first time the floor is retuned
 * (INV-3). The post-raid numbers come back in act entry's own events — see {@link raidReportsFrom}.
 *
 * The one piece of it this DOES call is `raidRemovalAt`, because "how many the script asks for" is
 * no longer a field to copy: the harvest is priced against the standing stock, and a
 * preview that showed the authored body count would under-report every late arrival — the screen
 * promising −11 and the survey then reporting −32.
 */
export function raidPreviews(
  states: Readonly<Record<string, NodeState>>,
  nodes: readonly NodeFile[],
  species: readonly SpeciesLine[],
  balance: Balance,
  act: number,
  override?: readonly RaidScript[],
): RaidPreview[] {
  const index = indexSpecies(species);
  const nodeNames = new Map(nodes.map((node) => [node.id, node.name] as const));
  return raidsForAct(balance, act, override).map((raid) => {
    const state = states[raid.nodeId];
    const targets: RaidTargetPreview[] = raid.targets.map((target) => {
      const line = index.get(target.lineId);
      const before = state?.populations[target.lineId]?.count ?? 0;
      return {
        lineId: target.lineId,
        surveyName: line ? surveyNameOf(line, balance) : target.lineId,
        before,
        requested: raidRemovalAt(before, target, balance),
      };
    });
    return {
      eventId: raid.id,
      act: raid.act,
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
  surveyName: string;
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
 * Turn act entry's `raid` events into survey rows.
 *
 * build-doc §4 makes the scene "a renderer of its event log", and this is that read: the numbers on
 * screen are the numbers the sim moved, not a recomputation of them. Typed over the union of the
 * two producers' events so a caller can hand it either log — the `raid` member is byte-identical in
 * both, because `core/lifecycle.ts` emits exactly one shape for it.
 */
export function raidReportsFrom(
  events: readonly (YearTurnEvent | ActEntryEvent)[],
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
      surveyName: line ? surveyNameOf(line, balance) : event.lineId,
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
 * G7 — no sentence here characterises the harvest. The identity, the arrow and the three numbers are
 * the whole line.
 */
export function raidSurveyLines(reports: readonly RaidReport[]): string[] {
  const lines: string[] = [];
  for (const report of reports) {
    for (const target of report.targets) {
      lines.push(
        `${report.nodeName} · ${target.surveyName} ${target.before} → ${target.remaining} (−${target.removed})`,
      );
    }
  }
  return lines;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The festival — bible §9 calls it the thing that closes the year; it no longer does
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FestivalBeat {
  /** The year that is BEGINNING — the turn ends year N and begins N+1 (core/lifecycle.ts). */
  year: number;
  /**
   * `balance.clock.yearsTotal` — the EXPECTED year count under normal pacing, NOT a cap.
   *
   * Quoted so a player can see roughly where they are against six acts at a year each. Nothing
   * enforces it and the label never claims a denominator (see below).
   */
  yearsTotal: number;
  /** How many years are behind the player. Unbounded. */
  yearsElapsed: number;
  /**
   * True when the calendar has run past the expected pacing — year 7 and beyond.
   *
   * ⚠ NOT AN ERROR, AND NOT AN ENDING. It used to be `beyondFinalYear` and it used to mean the
   * game was over; there is no final year any more. This is a pacing readout: the player
   * is taking longer than six years, which is a legal, supported and interesting way to play.
   */
  pastExpectedPace: boolean;
  /** "Y3" — the whole festival's copy. G7: a number, not a verdict. */
  label: string;
}

/**
 * The year-turn beat that closes the festival window.
 *
 * ⚠ THE LABEL LOST ITS DENOMINATOR, deliberately. It used to read "Y3/6", and past year 6 it read
 * "Y7/6" and then "Y8/6" — a fraction of a total the calendar no longer has. `yearsTotal` is still
 * carried on the struct for a HUD that wants to show expected pacing beside the count, but the copy
 * states the year and stops, because that is the only number that is true without qualification.
 *
 * THE FESTIVAL IS A SEASON, NOT THIS FRAME. bible §9 called it a "diegetic gym gate, closes the
 * year"; under the amended L8 a gym victory closes nothing, and per Hank's constraint the event
 * lasts a whole season rather than one in-game day. `core/regional-events.ts` `festivalWindow` is
 * the event — the year's final season, open for `ticksPerSeason` ticks. This beat is the moment it
 * ends, which is the meter filling.
 */
export function festivalBeat(year: number, balance: Balance): FestivalBeat {
  const yearsTotal = balance.clock.yearsTotal;
  const yearsElapsed = Math.max(0, year - balance.clock.startYear);
  return {
    year,
    yearsTotal,
    yearsElapsed,
    pastExpectedPace: yearsElapsed >= yearsTotal,
    label: `Y${String(year)}`,
  };
}
