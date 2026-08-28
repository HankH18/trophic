/**
 * game/scenes/YearTurnScene.ts — the year turn as a played sequence (build-doc §15 C6).
 *
 * build-doc §4, runtime narrative step 5 AS AMENDED: "when the YEAR meter fills — and at nothing
 * else — the **year turn** runs: festival, aging of every owned+boxed creature, retirement flow for
 * expiring creatures, map variant swap, town aging arcs." build-doc §7.5 numbers the same steps.
 * (The amended line used to name a tick. The meter is `balance.clock.ticksPerYear` long, that number
 * has already moved once, and naming it here is how a stale one gets quoted as the rule.)
 *
 * TWO THINGS THAT USED TO BE HERE ARE NOT. A gym victory no longer ends a year, so the turn has ONE
 * trigger; and the **event scripts (Cullbrand raids)** have moved off the calendar to ACT ENTRY —
 * bible §9 says "scripted per act" — so a year turn emits no raid event, ever. {@link actEntryBeats}
 * renders those, through the same beat vocabulary.
 *
 * THIS SCENE DRIVES core/lifecycle.ts — it does not reimplement it. Specifically:
 *   - aging, the J→A→E schedule, the metamorphic latch, the boxed-creature rule and the Ancient
 *     exemption (G10 / Hard Req 4) are `runYearTurn`'s, and this file never touches `yearsRemaining`;
 *   - the scripted raid is applied by `enterPendingActs` from `balance.yearEvents.raids` — on ACT
 *     entry, not at a year turn; game/year-events.ts only reads the result (G6 — the raid is
 *     scripted, the cascade above it is not);
 *   - the year-variant swap is `runYearTurn`'s `mapVariantSwaps`;
 *   - the retirement choice is game/scenes/RetirementScene.ts's `RetirementFlow`, which itself only
 *     calls `rollHeirChoice` / `retirementChoiceProblem` / `resolveRetirement`.
 * What this file owns is the ORDER things are shown in and the words on screen — and per G7 those
 * words are identifiers and numbers.
 *
 * Engine-free at runtime (`import type` only) so the sequence is testable in node, where importing
 * phaser throws `ReferenceError: window is not defined`. {@link createYearTurnScene} takes the engine.
 */

import type { ClockAdvance, ClockEvent, YearEndReason } from "@core/clock";
import { seasonsOfYear } from "@core/clock";
import type { SimContext } from "@core/ecosim";
import { stepRegionStates } from "@core/ecosim";
import type {
  ActEntryResult,
  AdvanceYearResult,
  Cohort,
  EcosimStepFn,
  MapVariantSwap,
  RaidScript,
  RandomFn,
  YearTurnResult,
} from "@core/lifecycle";
import { canRunYearTurn, indexSpecies, lastYearTurnOf, runYearTurn } from "@core/lifecycle";
import type { Rng } from "@core/rng";
import type { SaveEnvelope } from "@core/save";
import { appendYearTurn } from "@core/save";
import type { AgeClass, Balance, Content, OwnedCreature, Role, Season, TypeName } from "@core/types";
import type { FestivalBeat, RaidPreview, RaidReport } from "@game/year-events";
import {
  festivalBeat,
  hasRaids,
  surveyNameOf,
  raidCoverage,
  raidSurveyLines,
  raidPreviews,
  raidReportsFrom,
  raidsForAct,
} from "@game/year-events";
import type { SeasonTint } from "@game/season-tint";
import { applySeasonOverlay, seasonTint, seasonTintsForYear } from "@game/season-tint";
import { RetirementFlow, clampLines, wrapLines } from "@game/scenes/RetirementScene";
import { fullMeter } from "@game/ui/SeasonMeter";

/* ────────────────────────────────────────────────────────────────────────────
 * The beats — one screen each, in build-doc §7.5 order
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AgingEntry {
  uid: string;
  lineId: string;
  where: Cohort;
  fromAge: AgeClass;
  toAge: AgeClass;
  formName: string;
  yearsRemaining: number;
  projectedRetirementYear: number;
  /** True for the creature this turn is retiring — its card is answered in the next scene. */
  retiring: boolean;
}

export interface AncientEntry {
  uid: string;
  lineId: string;
  formName: string;
  where: Cohort;
}

export interface FormChangeBeat {
  uid: string;
  lineId: string;
  where: Cohort;
  fromAge: AgeClass;
  toAge: AgeClass;
  fromFormName: string;
  toFormName: string;
  types: TypeName[];
  role: Role;
  /** True when this transition is also the once-only metamorphic stat jump (build-doc §7.4). */
  metamorphosed: boolean;
  /** balance.age.metamorphicJump, present only on the metamorphic transition. */
  statJump: number | null;
}

export type YearTurnBeat =
  | {
      t: "festival";
      festival: FestivalBeat;
      /**
       * The Cullbrand raids are no longer the year turn's — they fire on ACT ENTRY — so
       * this list is EMPTY on a year-turn festival and carries the previews on an act-entry
       * sequence ({@link actEntryBeats}). The field stays because the two sequences share one
       * renderer, and an empty array is how "no harvest is coming" is expressed, never an absent
       * field.
       */
      harvest: RaidPreview[];
      /** The new year's four season readings — bible §12a's progressive darkening, in numbers. */
      seasons: SeasonTint[];
    }
  /**
   * Entering an act — NOT a festival.
   *
   * `actEntryBeats` used to push a `festival` beat to carry its harvest previews, so an act entry
   * would have rendered under the header `FESTIVAL · Y<year>`: the year's closing celebration
   * announcing a Cullbrand strip-harvest, in whatever calendar year the act happened to be entered.
   * It was never seen because the function had no caller outside a test; it has one now
   * (`game/scenes/OverworldScene.ts` `advanceActs`), so the beat says what it is.
   */
  | { t: "actEntry"; act: number; harvest: RaidPreview[] }
  | { t: "aging"; season: Season; entries: AgingEntry[] }
  | { t: "ancients"; entries: AncientEntry[] }
  | { t: "form"; change: FormChangeBeat }
  | { t: "raid"; report: RaidReport }
  | { t: "mapVariant"; nodeId: string; nodeName: string; year: number; mapAsset: string }
  | {
      t: "retirements";
      count: number;
      uids: string[];
      /**
       * Creatures still owned when the prompts are answered — party + box, the retirees already
       * removed. It is exactly the pool build-doc §7.5 step 3's BOON needs a target from, so a `0`
       * here says, before the card opens, that HEIR is the only side that can be taken.
       */
      owned: number;
    }
  | { t: "partyEmpty"; year: number };

/* ────────────────────────────────────────────────────────────────────────────
 * Driving the turn
 * ──────────────────────────────────────────────────────────────────────────── */

export class YearTurnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YearTurnError";
  }
}

/**
 * The clock position an action carried past the year boundary — BOTH halves of it.
 *
 * ⚠ THIS EXISTS BECAUSE THE CARRY USED TO BE ONE NUMBER. The seam was a bare `carryTick`, so the
 * fraction never entered it: `runYearTurn` resets the meter to `balance.clock.startTick` and
 * {@link finishYearTurn} put back only the whole ticks, leaving the committed save standing on
 * whichever fraction the save it ran on happened to hold. Every whole-tick cost hides that — a whole
 * tick and a whole year are both whole numbers of sub-ticks, so the fraction is invariant across
 * the boundary — and a fractional cost cannot: crossing the year on an odd number of sub-ticks
 * flips it. Measured, before the fix, with `battleTicks` at half a tick: a battle taken half a tick
 * short of the full meter committed `{year: 2, tick: 0, subTick: 1}` where the clock said
 * `{year: 2, tick: 0, subTick: 0}` — half a tick charged twice.
 *
 * It is `{tick, subTick}` and not a `ClockState` because a carry has no year of its own: the year is
 * the turn's to decide, and handing this a `year` field would give the caller a second place to
 * disagree with `runYearTurn` about which year the save came out in.
 *
 * ⚠ AND IT IS NOW THE ONLY SPELLING OF A CARRY IN THIS MODULE. The bare `carryTick` survived
 * alongside it for a while as a deprecated half — on `YearTurnDriveDeps`, on `YearTurnDrive`, on
 * `YearTurnTrigger` and as `finishYearTurn`'s `number` overload — and while it survived, the year
 * turn had two commits that read different halves: the scene's own `finish()` took the count and
 * the overworld's headless fallback took the position. Deprecating it was not enough; deleting it
 * is what makes "both halves travel" structural. Do not reintroduce a ticks-only form.
 */
export interface YearCarry {
  /** Whole ticks into the new year — `advanceAction(...).clock.tick`. */
  tick: number;
  /** The fraction owed but not yet whole — `advanceAction(...).clock.subTick`. */
  subTick: number;
}

export interface YearTurnDriveDeps {
  content: Content;
  /** The seeded "sim" stream (build-doc §8.1) — drives step 5's season step. */
  simRng: Rng;
  /** The seeded lifecycle stream — drives the heir rolls in the retirement flow. */
  lifecycleRng: RandomFn;
  /**
   * The year the CLOCK says just ended — `ClockEvent {t:"yearEnd", year}`.
   *
   * REQUIRED, and the guard that makes a re-entered turn safe. `canRunYearTurn` is keyed on the
   * year the turn would BEGIN, and a completed turn has already moved `save.year` on, so it cannot
   * tell "year 3 has ended" from "year 4 has now ended too": a second call with the post-turn save
   * passed the check and ran a whole extra year — two festivals, two aging passes, two season
   * steps, two retirement rounds and two raid applications, on one player action. Naming the ended
   * year stops that, because after the first turn the save is no longer standing in the year the
   * meter ended.
   *
   * It used to be documented as insufficient on its own, because build-doc §4's OTHER trigger — a
   * gym victory — reported the year that had just begun as ended and sailed through. That trigger
   * is gone: the meter is the only way a year ends, filling it costs `ticksPerYear` ticks by
   * construction, and the state is now unreachable rather than refused.
   */
  endedYear: number;
  /**
   * Why the year ended — `yearTurnTrigger(...).reason`.
   *
   * Omitted ⇒ `"meter"`, which is also the only member `YearEndReason` still has: build-doc §4 gave
   * the turn two triggers and the amended L8 leaves ONE ("when the meter fills — and at nothing
   * else — the year turn runs"). It is CARRIED, never branched on — it reaches the banner and the beats
   * and nothing reads it to decide anything. The guard it used to be read for is gone with the
   * trigger it guarded; see the note in `driveYearTurn` about the third guard.
   */
  reason?: YearEndReason;
  /**
   * The WHOLE clock position the action carried into the new year — `advanceAction(...).clock`.
   *
   * core/clock.ts: "Ticks beyond the boundary carry into the new year rather than being dropped, so
   * no player action is silently free." `runYearTurn` resets the meter to `balance.clock.startTick`
   * because it has no clock of its own — the caller does, and {@link finishYearTurn} puts the carry
   * back.
   *
   * ⚠ THERE IS NO TICKS-ONLY SPELLING OF THIS ANY MORE. A `carryTick?: number` sat beside it and
   * dropped the fraction; both halves travel or neither does. Omitted ⇒ `balance.clock.startTick`
   * with the save's own fraction, which is right for a headless driver that never straddled a
   * boundary — see {@link resolveCarry}.
   */
  carry?: YearCarry;
  /**
   * The region's sim context (core/ecosim.ts). Omitted ⇒ `defaultContext()`, which is memoised and
   * derives from the SHIPPED node files — so a caller holding a live context (the overworld does,
   * and passes it for its own three clock-boundary steps) must pass it here too or the year's fourth
   * season step is taken against a different context from the other three.
   */
  context?: SimContext;
  /** Overrides `balance.yearEvents.raids`; pass the same list to the previews or they disagree. */
  yearEvents?: readonly RaidScript[];
}

export interface YearTurnDrive {
  turn: YearTurnResult;
  beats: YearTurnBeat[];
  /** Answers the retirement prompts; empty when nothing retired. */
  flow: RetirementFlow;
  mapVariantSwaps: MapVariantSwap[];
  /** The tick the turn started on — `appendYearTurn` needs it for the action log. */
  tickBefore: number;
  /**
   * The WHOLE clock position the action carried into the new year — restored by
   * {@link finishYearTurn}, which is the only thing that should read it.
   *
   * ⚠ THIS IS THE ONLY SPELLING, and it is the only spelling BECAUSE a second one is what let the
   * two commits in this codebase disagree. A `carryTick: number` sat here — `carry.tick` with the
   * fraction sawn off — and the scene's own `finish()` read it while
   * `game/scenes/OverworldScene.ts`'s headless fallback read `carry`. There is nothing left to pick
   * the wrong half of.
   */
  carry: YearCarry;
  /** The season core/lifecycle.ts stepped (build-doc §7.5 step 5). */
  seasonStepped: Season;
  /** The balance the turn ran against — the scene reads its layout from it (G11). */
  balance: Balance;
}

/**
 * The year turn's trigger, read off one player action's clock events — or null if the year did not
 * end.
 *
 * build-doc §4 gave the turn two triggers ("At gym victory or tick 16") and `core/clock.ts` reported
 * both as `{t:"yearEnd"}`. Collapsing them HERE, once, is what stopped a shell that watched for both
 * from firing two turns. One trigger survives and the collapse survives with it: there is one
 * trigger per action because there is one call to this.
 */
export interface YearTurnTrigger {
  /** The year that ended — hand this to {@link YearTurnDriveDeps.endedYear}. */
  endedYear: number;
  reason: YearEndReason;
  /**
   * The whole position the action carried past the boundary (`advance`'s resulting clock, less its
   * year) — hand this to {@link YearTurnDriveDeps.carry}.
   */
  carry: YearCarry;
}

/** One warning per distinct set of unreachable raid years, so a per-turn caller cannot spam. */
const warnedUnreachableRaids = new Set<string>();

/**
 * A raid authored for an act the region does not have never fires, and says nothing when it doesn't.
 *
 * `raidCoverage` has always been able to report it and nothing in the running game asked. A
 * one-character typo in the raid's act otherwise buys a beat that silently does not happen, which
 * is the same class of defect `enterPendingActs` throws on for a misspelled node id — but the raid
 * list is authored data, so this is a warning and not a refusal: the runtime is not the place to
 * decide the content is wrong.
 */
function warnUnreachableRaids(balance: Balance, override?: readonly RaidScript[]): void {
  const unreachable = raidCoverage(balance, override).unreachableScriptedActs;
  if (unreachable.length === 0) return;
  const key = unreachable.join(",");
  if (warnedUnreachableRaids.has(key)) return;
  warnedUnreachableRaids.add(key);
  console.warn(
    `[act-entry] scripted raid(s) authored for act(s) ${key}, which balance.acts.gates does not ` +
      "have — nothing will ever apply them (game/year-events.ts raidCoverage)",
  );
}

export function yearTurnTrigger(advanced: ClockAdvance): YearTurnTrigger | null {
  const end = advanced.events.find(
    (e: ClockEvent): e is Extract<ClockEvent, { t: "yearEnd" }> => e.t === "yearEnd",
  );
  if (!end) return null;
  // BOTH halves, off the one clock `advance` produced. A `carryTick: carry.tick` used to ride along
  // beside this, and a projection of the carry is a second thing a caller can pick up by mistake.
  const carry: YearCarry = { tick: advanced.clock.tick, subTick: advanced.clock.subTick };
  return { endedYear: end.year, reason: end.reason, carry };
}

/**
 * Run one year turn and build the sequence that plays it.
 *
 * THE SEASON STEP. `YearTurnDeps.ecosimStep` is per-node, but stepping nodes one at a time loses two
 * things core/ecosim.ts guarantees for a region: Ancient presence effects reach across adjacent
 * nodes (`balance.ecosim.presenceRadiusNodes`), and `stepAll` costs the parent stream exactly ONE
 * draw for the whole region — which is what makes adding a node not move every other node's
 * trajectory (INV-2). So the whole region is stepped once, up front, and the per-node hook hands
 * back the precomputed state for its node.
 *
 * The season is read from `core/clock.ts` `seasonsOfYear` and then CHECKED against the season the
 * year turn actually reports stepping; a mismatch throws instead of silently stepping the region for
 * one season and telling the player another.
 */
export function driveYearTurn(save: SaveEnvelope, deps: YearTurnDriveDeps): YearTurnDrive {
  const { content } = deps;
  const { balance } = content;

  /*
   * THE GAME IS NOT SIX YEARS LONG, AND THIS IS WHERE THAT STOPPED BEING TRUE.
   *
   * A refusal lived here: `save.year > finalYearOf(balance)` threw, because build-doc §1's "six
   * in-game years" was read as a hard end. It is not one. The calendar is unbounded, has no final
   * year and never ends, so the year turn out of year 11 is exactly as legal as the one out of
   * year 2 and runs identically — the same aging, the same retirement round, the same fourth season
   * step. The run ends on `core/acts.ts` `runIsComplete`, an ACT condition, and a player who never
   * earns it plays on.
   *
   * The guards that DO remain below are all about running one turn once, which is still a real
   * defect class; none of them is about how far the calendar has got.
   */

  /*
   * ONE TURN PER YEAR, keyed on the year that ENDED.
   *
   * `canRunYearTurn` guards the year the turn will BEGIN, which is the right question for core and
   * the wrong one for a shell with two triggers: after a turn, `save.year` is already the begun
   * year, so the flag (N+1) is below `save.year + 1` (N+2) and a second fire for the SAME player
   * action sails through and runs the next year's turn. Checking that the save is still standing in
   * the year the clock says ended stops the SAME year end firing twice — measured: the second call
   * now throws where it used to return "year 3". A LATER year end reported by a gym victory is a
   * different question, and the guard below it is the one that answers that.
   */
  if (save.year !== deps.endedYear) {
    throw new YearTurnError(
      `the clock says year ${String(deps.endedYear)} ended, but the save is in year ` +
        `${String(save.year)} (last year turn: ${String(lastYearTurnOf(save))}) — build-doc §4 gives ` +
        "the turn two triggers (full meter and gym victory) and running it once per trigger would " +
        "re-age, re-retire and re-apply the scripted raid",
    );
  }
  if (!canRunYearTurn(save)) {
    throw new YearTurnError(
      `a year turn has already run for year ${String(save.year + 1)} — build-doc §4 gives the turn ` +
        "two triggers (full meter and gym victory) and firing both would re-age, re-retire and " +
        "re-apply the scripted raid",
    );
  }

  /*
   * A YEAR NOBODY HAS PLAYED A TICK OF CANNOT END — AND NOW IT STRUCTURALLY CANNOT.
   *
   * A THIRD GUARD USED TO STAND HERE and it is gone with the trigger it guarded. The two checks
   * above are keyed on the ENDED year and on the BEGUN year, and a gym victory slipped between
   * them: `core/clock.ts` `gymVictory` read the year off the clock it was handed, so a victory taken
   * immediately after a year turn reported the year that had just BEGUN as ended — which equalled
   * `save.year`, so guard 1 passed, and the flag (N+1) was below `save.year + 1` (N+2), so
   * `canRunYearTurn` passed too. Reproduced against the shipped content: a meter-triggered turn out
   * of year 1 followed by a gym victory ran a SECOND full turn and left the save in year 3, burning
   * a year with zero ticks played in it. It needed a guard on the REASON.
   *
   * Under the amended L8 a gym victory does not end a year at all, so the state is unreachable
   * rather than refused: the meter is the only trigger, and filling it costs `ticksPerYear` ticks,
   * which is the definition of a year that has been played. `YearEndReason` has one member and the
   * compiler will not let a second appear without every reader going red.
   */

  const seasons = seasonsOfYear(balance);
  const lastSeason = seasons[seasons.length - 1];
  if (!lastSeason) {
    throw new YearTurnError("balance.clock.seasonOrder is empty — there is no season to step");
  }

  const regional = stepRegionStates(
    content.nodes,
    save.nodeStates,
    lastSeason,
    deps.simRng,
    deps.context,
  );
  const seen: Season[] = [];
  const ecosimStep: EcosimStepFn = (nodeId, state, season) => {
    seen.push(season);
    const stepped = regional.states[nodeId];
    /*
     * `stepRegionStates` iterates `content.nodes`; `runYearTurn` iterates `save.nodeStates`. A node
     * in the save but not in the content used to fall back to `?? state` — returning the node
     * BYTE-IDENTICAL while the turn still emitted its `seasonStep` event and still reported
     * `seasonStepRan: true`. That is the exact failure this hook was written to avoid: an ecology
     * that silently stands still while the turn says it moved.
     */
    if (!stepped) {
      throw new YearTurnError(
        `the save carries node "${nodeId}", which data/nodes/ does not — its season step could not ` +
          "run, and reporting one that did not happen would leave the ecology standing still",
      );
    }
    return stepped;
  };

  const tickBefore = save.tick;
  // Resolved BEFORE the turn runs, off the save the caller handed over — `turn.save` has already had
  // its meter reset by then and cannot answer what the action carried.
  const carry = resolveCarry(save, deps, balance);
  const turn = runYearTurn(save, {
    species: content.species,
    balance,
    nodes: content.nodes,
    ecosimStep,
    ...(deps.yearEvents ? { yearEvents: deps.yearEvents } : {}),
  });

  for (const season of seen) {
    if (season !== lastSeason) {
      throw new YearTurnError(
        `core/lifecycle.ts stepped "${season}" but the region was stepped for "${lastSeason}" — ` +
          "the year turn's season and core/clock.ts's last season have diverged",
      );
    }
  }

  /*
   * THE RAID GUARD MOVED WITH THE RAID — see {@link actEntryBeats}.
   *
   * A check stood here that the year turn had actually emitted the raid events its year's script
   * called for, because bible §9 promises "populations visibly drop at a named node" and a silent
   * miss is a beat that did not happen. The raids are keyed on the ACT now, so a year turn emits
   * none by construction and the guard belongs where the raid does. `warnUnreachableRaids` stays
   * here as well as there: it is about the raid LIST, not about any one firing, and the year turn
   * is a place a player reliably passes through.
   */
  warnUnreachableRaids(balance, deps.yearEvents);

  const flow = new RetirementFlow(turn, { content, rng: deps.lifecycleRng });

  return {
    turn,
    beats: beatsFor(save, turn, content, deps.yearEvents),
    flow,
    mapVariantSwaps: turn.mapVariantSwaps,
    tickBefore,
    carry,
    seasonStepped: lastSeason,
    balance,
  };
}

/**
 * The carry the turn will hand back: the caller's whole position, or the standing start.
 *
 * `deps.carry` is the whole answer and nothing here has to guess. It USED TO BE ABLE TO GUESS, and
 * that is the thing this function no longer does: beside `carry` there was a lossy `carryTick`, and
 * when a caller spelled that one the fraction had to come from somewhere — `save.subTick`, which is
 * right only for a caller shaped like `game/scenes/OverworldScene.ts` `beginYearTurn` (it hands over
 * a save it has ALREADY moved to the post-action clock and only retags its year and tick) and wrong
 * for one that hands over the save as it stood BEFORE the action, where it is the pre-action half of
 * a fractional cost. That guess was correct by accident for the shipped shell and by nothing at all
 * for anyone else, so the lossy spelling is gone rather than better documented.
 *
 * With no carry given there is no clock in play at all: a headless turn starts the new year on
 * `startTick` with nothing owed, which is what `save.subTick` is for a save that never straddled —
 * it is also exactly what `core/lifecycle.ts` `runYearTurn`'s meter reset already wrote, so this
 * branch changes no value and only makes the position explicit.
 */
function resolveCarry(save: SaveEnvelope, deps: YearTurnDriveDeps, balance: Balance): YearCarry {
  if (deps.carry) return { tick: deps.carry.tick, subTick: deps.carry.subTick };
  return { tick: balance.clock.startTick, subTick: save.subTick ?? 0 };
}

/**
 * Turn the year turn's event log into the sequence of screens.
 *
 * build-doc §4: "the Phaser scene is a renderer of its event log". Every beat below is a projection
 * of an event core emitted — nothing is inferred, and nothing that did not happen is shown.
 *
 * ORDER IS SPEC, NOT TASTE. build-doc §7.5 numbers the turn's steps: (2) aging and the form changes,
 * (3) "any creature at 0 → retirement flow", (5) the season step + the year events, (6) the map
 * year-variant swap. So the retirement beat sits between the form changes and the raid survey — and
 * the scene ANSWERS its prompts there, not after every other beat has played, which is where they
 * used to be answered. build-doc §4 step 5 lists the same six items with the map swap ahead of the
 * raid scripts; §7.5 is the one that numbers them and it wins.
 */
export function beatsFor(
  before: SaveEnvelope,
  turn: YearTurnResult,
  content: Content,
  yearEvents?: readonly RaidScript[],
): YearTurnBeat[] {
  const { balance } = content;
  const index = indexSpecies(content.species);
  const nodeNames = new Map(content.nodes.map((node) => [node.id, node.name] as const));

  // Identities are read off the creatures the turn started with, plus the ones it retired.
  const byUid = new Map<string, OwnedCreature>();
  for (const creature of [...before.party, ...before.box]) byUid.set(creature.uid, creature);
  for (const creature of turn.retired) byUid.set(creature.uid, creature);

  const retiringUids = new Set(turn.retired.map((c) => c.uid));
  const beats: YearTurnBeat[] = [];

  const year = turn.save.year;
  beats.push({
    t: "festival",
    festival: festivalBeat(year, balance),
    // Empty, and it must stay empty: a raid fires on entry to its ACT, which the calendar does not
    // schedule. Previewing one here would promise a harvest at a year turn that will not deliver it.
    harvest: [],
    seasons: seasonTintsForYear(balance, year),
  });

  const aging: AgingEntry[] = [];
  const ancients: AncientEntry[] = [];
  const seasonSteps: Season[] = [];
  const metamorphosedUids = new Set<string>();

  for (const event of turn.events) {
    if (event.t === "metamorphosed") metamorphosedUids.add(event.uid);
    if (event.t === "seasonStep") seasonSteps.push(event.season);
  }

  for (const event of turn.events) {
    switch (event.t) {
      case "aged": {
        const creature = byUid.get(event.uid);
        const line = creature ? index.get(creature.lineId) : undefined;
        aging.push({
          uid: event.uid,
          lineId: creature?.lineId ?? event.uid,
          where: event.where,
          fromAge: event.fromAge,
          toAge: event.toAge,
          formName: line ? line.formNames[event.toAge] : (creature?.lineId ?? event.uid),
          yearsRemaining: event.yearsRemaining,
          projectedRetirementYear: event.projectedRetirementYear,
          retiring: retiringUids.has(event.uid),
        });
        break;
      }
      case "ancientSkipped": {
        const line = index.get(event.lineId);
        ancients.push({
          uid: event.uid,
          lineId: event.lineId,
          formName: line ? surveyNameOf(line, balance) : event.lineId,
          where: event.where,
        });
        break;
      }
      default:
        break;
    }
  }

  const season = seasonSteps[0] ?? (balance.clock.seasonOrder[balance.clock.seasonOrder.length - 1] as Season);
  if (aging.length > 0) beats.push({ t: "aging", season, entries: aging });
  if (ancients.length > 0) beats.push({ t: "ancients", entries: ancients });

  // build-doc §7.5 step 2 — every identity change is announced, and the one that is also the
  // metamorphic stat jump says so with its multiplier.
  for (const event of turn.events) {
    if (event.t !== "formChanged") continue;
    const metamorphosed = metamorphosedUids.has(event.uid);
    beats.push({
      t: "form",
      change: {
        uid: event.uid,
        lineId: event.lineId,
        where: event.where,
        fromAge: event.fromAge,
        toAge: event.toAge,
        fromFormName: event.fromFormName,
        toFormName: event.toFormName,
        types: [...event.types],
        role: event.role,
        metamorphosed,
        statJump: metamorphosed ? balance.age.metamorphicJump : null,
      },
    });
  }

  // §7.5 step 3 — the retirement flow, before the year events and the map swap.
  if (turn.prompts.length > 0) {
    beats.push({
      t: "retirements",
      count: turn.prompts.length,
      uids: turn.prompts.map((p) => p.parentUid),
      // The retirees are already out of `turn.save`, so this is the pool a BOON can be spent on —
      // and on build-doc §1's own shape (one starter, the Legacy beat) it is 0, which is why the
      // card's five BOON stats all read "no target". Saying the number before the card opens is the
      // difference between a one-sided choice and a one-sided choice the player was told about.
      owned: turn.save.party.length + turn.save.box.length,
    });
  }

  // §7.5 step 5, second half.
  for (const report of raidReportsFrom(turn.events, content.nodes, content.species, balance)) {
    beats.push({ t: "raid", report });
  }

  // §7.5 step 6.
  for (const swap of turn.mapVariantSwaps) {
    beats.push({
      t: "mapVariant",
      nodeId: swap.nodeId,
      nodeName: nodeNames.get(swap.nodeId) ?? swap.nodeId,
      year: swap.year,
      mapAsset: swap.mapAsset,
    });
  }

  void year;
  return beats;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Act entry — where the Cullbrand raid lives now
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Render an act entry: the harvest it is reaching for, then what actually died.
 *
 * bible §9's raids are "scripted per act, populations visibly drop at a named node", and they fire
 * on entry to their act rather than at a year turn — so Cindershelf is entered mid-collapse whether
 * the player arrives in calendar year 2 or year 11, and a player who arrives early WATCHES it
 * happen instead of finding the node already crashed.
 *
 * THE SCRIPTED BEAT EITHER HAPPENS OR IT IS SAID OUT LOUD. `enterPendingActs` emits one `raid` event
 * per harvested line, so an act whose script has targets and whose event log has none is a beat that
 * quietly did not happen — the exact failure `raidCoverage` reports and which nothing in the running
 * game used to ask. The most likely cause is the footgun the deps document: a different `yearEvents`
 * list handed to the previews and to the entry.
 *
 * `before` is the save the entry ran ON, so the preview prices the numbers the act opened with and
 * the `raid` beat reports the numbers after — a before and an after, not one number with nothing to
 * compare it to.
 */
export function actEntryBeats(
  before: SaveEnvelope,
  entry: ActEntryResult,
  content: Content,
  yearEvents?: readonly RaidScript[],
): YearTurnBeat[] {
  const { balance } = content;
  const beats: YearTurnBeat[] = [];

  for (const act of entry.actsEntered) {
    if (!hasRaids(balance, act, yearEvents)) continue;
    const scheduled = raidsForAct(balance, act, yearEvents).reduce(
      (n: number, raid: RaidScript) => n + raid.targets.length,
      0,
    );
    const emitted = entry.events.filter((e) => e.t === "raid").length;
    if (scheduled > 0 && emitted === 0) {
      throw new YearTurnError(
        `act ${String(act)} has ${String(scheduled)} scripted harvest target(s) and act entry ` +
          "emitted no raid event — the drop bible §9 promises at a named node did not happen",
      );
    }
    if (emitted !== scheduled) {
      console.warn(
        `[act-entry] act ${String(act)}: ${String(scheduled)} scripted harvest target(s), ` +
          `${String(emitted)} raid event(s) — the previews and the entry were given different lists`,
      );
    }
    beats.push({
      t: "actEntry",
      act,
      harvest: raidPreviews(before.nodeStates, content.nodes, content.species, balance, act, yearEvents),
    });
  }

  for (const report of raidReportsFrom(entry.events, content.nodes, content.species, balance)) {
    beats.push({ t: "raid", report });
  }
  warnUnreachableRaids(balance, yearEvents);
  return beats;
}

/**
 * The beats that can only be known AFTER the retirement prompts are answered.
 *
 * `partyEmpty` is the whole of it, and it used to be looked for in `runYearTurn`'s event log — where
 * it never appears. Only `advanceYear` and `RetirementFlow.result()` emit it, because until every
 * prompt is answered the question is not settled: a party wiped out by retirement is refilled by the
 * heirs that replace it. Reproduced: a turn in which BOTH party members retired produced the
 * festival, aging and retirement beats and no `partyEmpty`, and the scene's `case "partyEmpty"` arm
 * was unreachable code. It is reachable now because it is asked at the moment it has an answer.
 */
export function beatsAfterRetirement(result: AdvanceYearResult): YearTurnBeat[] {
  return result.partyEmpty ? [{ t: "partyEmpty", year: result.save.year }] : [];
}

/**
 * The whole turn's bookkeeping once the retirement prompts are answered: the post-turn save with the
 * year turn and every retirement choice appended to the action log (build-doc §8.1 / L10), standing
 * on the tick the clock carried into the new year.
 *
 * THE CARRY. `runYearTurn` resets the meter to `balance.clock.startTick` — correct for a caller with
 * no clock, wrong for one that has one. core/clock.ts is explicit: "Ticks beyond the boundary carry
 * into the new year rather than being dropped, so no player action is silently free." Measured
 * before the fix: an inn taken on tick 15 of a 16-tick year left the committed save on Y2 tick 0
 * while `previewAction` — this lane's own HUD preview, built by running the REAL transition —
 * promised Y2 tick 1. One seam, two halves, both in C56; they agree now.
 *
 * THE CARRY IS A POSITION, NOT A COUNT — and a `number` OVERLOAD USED TO SAY OTHERWISE. It took
 * `number | YearCarry`; the number arm wrote `tick` and left whatever fraction `runYearTurn` carried
 * through, which was measurably wrong the moment a cost became fractional: a battle (half a tick)
 * taken half a tick short of the full meter committed `subTick: 1` against a clock that said
 * `subTick: 0`. It was kept while call sites still spelled it, and while it was kept the two commits
 * in this codebase disagreed — `game/scenes/OverworldScene.ts` `beginYearTurn`'s headless fallback
 * passed the whole position and the scene's own `finish()`, the commit the player watches, passed
 * the count. Both pass `drive.carry` now and there is no second arm to fall into.
 */
export function finishYearTurn(
  result: AdvanceYearResult,
  tickBefore: number,
  carry?: YearCarry,
): SaveEnvelope {
  const save = appendYearTurn(result, tickBefore);
  if (carry === undefined) return save;
  return { ...save, tick: carry.tick, subTick: carry.subTick };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Copy — identifiers and numbers only (G7)
 * ──────────────────────────────────────────────────────────────────────────── */

/** One line per beat, for the caption strip and for a headless dry-run of the sequence. */
export function beatLines(beat: YearTurnBeat): string[] {
  switch (beat.t) {
    case "festival":
      return [
        `FESTIVAL · ${beat.festival.label}`,
        /*
         * ALWAYS EMPTY ON A YEAR-TURN FESTIVAL, and kept so the two sequences share one renderer.
         * The Cullbrand raids are not the year turn's any more — they fire on ACT ENTRY and
         * render under the `actEntry` beat, which is where this preview copy lives now. An empty
         * array is how "no harvest is coming" is expressed, never an absent field.
         */
        ...beat.harvest.flatMap((preview) =>
          preview.targets.map(
            (t) => `HARVEST · ${preview.nodeName} · ${t.surveyName} (−${String(t.requested)})`,
          ),
        ),
        // bible §12a — "year aging progressively darkens". The scale IS the darkening, per season.
        `tint · ${beat.seasons.map((t) => `${t.season} ${t.scale.toFixed(2)}`).join(" · ")}`,
      ];
    case "actEntry":
      return [
        `ACT ${String(beat.act)}`,
        /*
         * What this act's scripted harvest is reaching for, at which named node. G7: the minus does
         * the work; nothing here characterises the harvest. The COUNT is deliberately not printed —
         * `raidPreviews` prices the save the act was entered ON, and the `raid` beat below owns the
         * numbers that actually moved.
         */
        ...beat.harvest.flatMap((preview) =>
          preview.targets.map(
            (t) => `HARVEST · ${preview.nodeName} · ${t.surveyName} (−${String(t.requested)})`,
          ),
        ),
      ];
    case "aging":
      return [
        `AGING · ${beat.season} · ${String(beat.entries.length)}`,
        ...beat.entries.map(
          (e) =>
            `${e.formName} ${e.fromAge}→${e.toAge} · ${e.where} · ${String(e.yearsRemaining)}y left` +
            (e.retiring ? " · retiring" : ""),
        ),
      ];
    case "ancients":
      return [
        `UNAGED · ${String(beat.entries.length)}`,
        ...beat.entries.map((e) => `${e.formName} · ${e.where}`),
      ];
    case "form": {
      const c = beat.change;
      const head = `${c.fromFormName} → ${c.toFormName} · ${c.types.join("/")}`;
      return c.metamorphosed && c.statJump !== null
        ? [head, `metamorphosis · stats ×${String(c.statJump)}`]
        : [head];
    }
    case "raid":
      // The rows come from game/year-events.ts `raidSurveyLines`, which is where this lane's raid
      // copy lives. Formatting them a second time here was two homes for one survey row, and the two
      // had already drifted — this one dropped the node name from every row.
      return [`${beat.report.nodeName} · −${String(beat.report.totalRemoved)}`, ...raidSurveyLines([beat.report])];
    case "mapVariant":
      return [`${beat.nodeName} · Y${String(beat.year)} · ${beat.mapAsset}`];
    case "retirements":
      // `owned` is the BOON pool the card is about to offer from — 0 means HEIR is the only side
      // that can be taken, said here rather than discovered five stats into the card.
      return [`RETIREMENT · ${String(beat.count)} · owned ${String(beat.owned)}`];
    case "partyEmpty":
      return [`PARTY 0 · Y${String(beat.year)}`];
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The Phaser scene
 * ──────────────────────────────────────────────────────────────────────────── */

import type PhaserNS from "phaser";
import { audio, takeOverMusic, type MusicTakeover } from "@game/audio";
import type { KeyLike, PlaceholderPainter, RetirementSceneData } from "@game/scenes/RetirementScene";
import { RETIREMENT_SCENE_KEY } from "@game/scenes/RetirementScene";
import { SCENE_KEYS, sceneRegistered } from "@game/scene-keys";

/**
 * From `game/scene-keys.ts`, the ONE registry (`game/boot.ts` re-exports it) — not a second spelling
 * declared here, and in the registry's own PascalCase convention rather than a private kebab-case
 * one that `sceneRegistered(scene, SCENE_KEYS.*)` could never reach.
 */
export const YEAR_TURN_SCENE_KEY = SCENE_KEYS.yearTurn;

export interface YearTurnSceneData {
  drive: YearTurnDrive;
  /** Called with the finished save once every beat has played and every prompt is answered. */
  onDone: (save: SaveEnvelope, result: AdvanceYearResult) => void;
  placeholder?: PlaceholderPainter;
}

export interface YearTurnSceneStyle {
  width: number;
  height: number;
  pad: number;
  lineHeight: number;
  /** Advance width of one character at `fontSize`, in px — what decides how many fit on a line. */
  charWidth: number;
  /**
   * Frames a beat must have been on screen before the next keypress advances it.
   *
   * Sibling of `RetirementSceneStyle.confirmArmFrames`, and the same measured defect: a HELD SPACE
   * put the sequence on the retirement beat by frame 2 and past it by frame 4 — the whole never-cut
   * Legacy beat, festival and aging and the card, gone in four frames of one press. Auto-repeat is
   * refused outright in `create`; this is what stops a queued burst. Presentation only.
   */
  advanceArmFrames: number;
  bgColor: number;
  textColor: string;
  dimColor: string;
  fontFamily: string;
  fontSize: string;
  titleSize: string;
}

/**
 * The sequence's layout at the virtual resolution balance.json states.
 *
 * A function rather than a constant because the two numbers that size it are DATA: `game/boot.ts`
 * states the rule verbatim — "build-doc §7.6's 480×320 is `map.virtualWidth`/`map.virtualHeight`,
 * never a literal here" — and every other scene in the repo reads it. A pair of literals here is one
 * gameplay-adjacent constant with two homes (G11 / INV-3).
 */
export function defaultYearTurnStyle(balance: Balance): YearTurnSceneStyle {
  return {
    width: balance.map.virtualWidth,
    height: balance.map.virtualHeight,
    pad: 12,
    lineHeight: 13,
    charWidth: 6,
    advanceArmFrames: 6,
    bgColor: 0x101317,
    textColor: "#e8e4c9",
    dimColor: "#7d8478",
    fontFamily: "monospace",
    fontSize: "10px",
    titleSize: "14px",
  };
}

/**
 * Build the year-turn scene against a caller-supplied Phaser namespace (see the note in
 * RetirementScene.ts — the module must stay importable from a node test).
 *
 * Boot does:
 *   game.scene.add(YEAR_TURN_SCENE_KEY, createYearTurnScene(Phaser));
 *   game.scene.add(RETIREMENT_SCENE_KEY, createRetirementScene(Phaser));
 */
export function createYearTurnScene(
  P: typeof PhaserNS,
  styleOverride?: YearTurnSceneStyle,
): typeof PhaserNS.Scene {
  return class YearTurnScene extends P.Scene {
    private drive!: YearTurnDrive;
    private onDone!: (save: SaveEnvelope, result: AdvanceYearResult) => void;
    private placeholder: PlaceholderPainter | undefined;
    private cursor = 0;
    private drawn: Array<{ destroy: () => void }> = [];
    /** Resolved in `init` from the turn's own balance (G11) unless the caller supplied one. */
    private style!: YearTurnSceneStyle;
    /** The sequence being played — `drive.beats` plus whatever the retirement flow adds to it. */
    private beats: YearTurnBeat[] = [];
    /** True while the retirement card is up: this scene owns neither the keyboard nor the cursor. */
    private awaitingFlow = false;
    /** Set once every prompt is answered. */
    private result: AdvanceYearResult | null = null;
    /** True once `onDone` has fired — it fires exactly once per turn. */
    private finished = false;
    /** Frames the CURRENT beat has been on screen. Reset on every advance — see `next`. */
    private framesShown = 0;
    /** The card's takeover of the music, and the way to give back what it interrupted. */
    private music: MusicTakeover | null = null;

    constructor() {
      super({ key: YEAR_TURN_SCENE_KEY });
    }

    init(data: YearTurnSceneData): void {
      this.drive = data.drive;
      this.onDone = data.onDone;
      this.placeholder = data.placeholder;
      this.cursor = 0;
      this.beats = [...data.drive.beats];
      this.style = styleOverride ?? defaultYearTurnStyle(data.drive.balance);
      this.awaitingFlow = false;
      this.result = null;
      this.finished = false;
      this.framesShown = 0;
      this.drawn = [];
    }

    create(): void {
      /*
       * §12a's Festival cue. A TAKEOVER rather than a plain play: this card is launched OVER a
       * paused overworld, so whatever the town was playing has to come back when the card closes.
       * The restore also covers the hand-off to the retirement card, which takes the music over
       * again from here and gives THIS back on its own shutdown.
       *
       * ⚠ THE LITERAL `"shutdown"`, AND BOTH OPTIONAL CHAINS — same reason as
       * `game/scenes/RetirementScene.ts`: this class is built against a caller-supplied Phaser
       * namespace and is driven headlessly by an engine stub that exports `Scene` and nothing else,
       * with no `events` emitter on the scene. A stub with no emitter must lose the RESTORE, never
       * the year turn.
       */
      this.music = takeOverMusic(audio(), { screen: "year-turn" });
      this.events?.once?.("shutdown", () => this.music?.restore());
      const style = this.style;
      this.add.rectangle(0, 0, style.width, style.height, style.bgColor).setOrigin(0, 0);
      /*
       * Hard Req 6 — season variation is a runtime tint, and the year turn is the moment the year's
       * reading changes. A SEPARATE pass over the opaque backdrop, never the backdrop itself:
       * `applySeasonOverlay` sets a fill AND an alpha (0.1–0.22), so colouring the backdrop with it
       * would leave the paused overworld showing through the card. The rows are added after this, so
       * the wash sits under the copy. The season is the one the turn stepped, at the NEW year's
       * darkening (bible §12a) — the six years are visibly not the same six years.
       */
      const overlay = this.add
        .rectangle(0, 0, style.width, style.height, style.bgColor)
        .setOrigin(0, 0);
      applySeasonOverlay(
        overlay,
        seasonTint(this.drive.balance, this.drive.seasonStepped, this.drive.turn.save.year),
      );
      const keyboard = this.input.keyboard;
      if (keyboard) {
        // Registered so Phaser suppresses OS key repeat for them; see the note in RetirementScene.ts.
        const register = (keyboard as { addKey?: (key: string) => unknown }).addKey;
        if (typeof register === "function") {
          for (const key of ["SPACE", "ENTER"]) register.call(keyboard, key);
        }
        keyboard.on("keydown-SPACE", (e?: KeyLike) => this.onKey(e));
        keyboard.on("keydown-ENTER", (e?: KeyLike) => this.onKey(e));
      }
      this.redraw();
    }

    /** Phaser calls this every frame; it is what arms the next advance. */
    override update(): void {
      this.framesShown += 1;
    }

    /**
     * One keydown. An OS auto-repeat advances nothing, and neither does a press that arrives before
     * the beat has been readable for `style.advanceArmFrames` frames.
     */
    private onKey(event: KeyLike | undefined): void {
      if (event?.repeat === true) return;
      if (this.framesShown < this.style.advanceArmFrames) return;
      this.next();
    }

    /**
     * Advance one beat.
     *
     * ⚠ THE GUARD ON THE FIRST LINE IS LOAD-BEARING. Phaser delivers a keydown to every ACTIVE
     * scene, and the retirement card binds SPACE too — so while the card is up, one press used to
     * both answer the card AND re-enter this method, which re-launched the retirement scene (Phaser
     * shuts a RUNNING scene down and re-creates it), resetting the player's selection under their
     * hands. Measured: six `onDone` calls for one turn under a burst of buffered keys. Two things fix
     * it and both are kept: this scene is PAUSED while the card is up (a paused scene fails
     * `Systems.canInput`, so its keyboard plugin drops the event), and `awaitingFlow`/`finished` make
     * re-entry a no-op even if a handler somehow still fires.
     */
    private next(): void {
      if (this.awaitingFlow || this.finished) return;
      // build-doc §7.5 step 3 — the prompts are answered AT the retirement beat, in the turn's order,
      // not after every other beat has played.
      const beat = this.beats[this.cursor];
      if (beat?.t === "retirements" && !this.drive.flow.done()) {
        this.enterRetirement();
        return;
      }
      if (this.cursor < this.beats.length - 1) {
        this.cursor += 1;
        this.redraw();
        return;
      }
      this.finish();
    }

    /** Hand the prompts to the retirement card — or, if it is not registered, answer them honestly. */
    private enterRetirement(): void {
      if (this.awaitingFlow || this.finished) return;
      const { flow } = this.drive;

      /*
       * ASK BEFORE LAUNCHING. `scene.launch` on an unregistered key is `console.warn('Scene key not
       * found')` and nothing else — mid-turn that strands the player on the last beat with the
       * retiree already removed and the seeded stream already advanced. `sceneRegistered` exists for
       * exactly this question. The fallback is core's own documented default for an unanswered
       * prompt (`advanceYear` takes the rolled HEIR), so the turn still completes and the run stays
       * replayable; it is a degraded beat, never a lost year.
       */
      if (!sceneRegistered(this, RETIREMENT_SCENE_KEY)) {
        console.warn(
          `[year-turn] scene "${RETIREMENT_SCENE_KEY}" is not registered — answering ` +
            `${String(flow.remaining())} retirement prompt(s) with the rolled HEIR`,
        );
        while (!flow.done()) flow.chooseHeir();
        this.resumeAfterFlow(flow.result());
        return;
      }

      this.awaitingFlow = true;
      const data: RetirementSceneData = {
        flow,
        onDone: (result) => {
          this.scene.resume();
          this.resumeAfterFlow(result);
        },
        ...(this.placeholder ? { placeholder: this.placeholder } : {}),
      };
      this.scene.launch(RETIREMENT_SCENE_KEY, data);
      // After the launch, so the card is up before this scene stops updating.
      this.scene.pause();
    }

    /** Back from the retirement card: the epilogue beats are known now, so play what is left. */
    private resumeAfterFlow(result: AdvanceYearResult): void {
      this.awaitingFlow = false;
      this.result = result;
      this.beats = [...this.beats, ...beatsAfterRetirement(result)];
      if (this.cursor < this.beats.length - 1) {
        this.cursor += 1;
        this.redraw();
        return;
      }
      this.finish();
    }

    /**
     * The commit the PLAYER watches — and it goes through the same seam the headless one does.
     *
     * ⚠ `carry`, BOTH NUMBERS. This destructured `carryTick` and handed {@link finishYearTurn} the
     * bare tick count, so the two commits in this codebase disagreed: `game/scenes/OverworldScene.ts`
     * `beginYearTurn` had already moved its unregistered-scene fallback to the whole position and
     * this, the live one, was still on the lossy half. It survived only because the shipped shell
     * hands the turn a save already standing on the post-action clock, so the fraction
     * `core/lifecycle.ts` `runYearTurn` leaks through the meter reset happened to be the carry's —
     * and `resolveCarry`'s note says what that is worth. Measured against a caller that hands over
     * the save as it stood BEFORE the action (the shape `YearTurnDriveDeps.endedYear` documents),
     * with a battle taken half a tick short of the full meter: committed `{tick: 0, subTick: 1}`
     * against a clock that said `{tick: 0, subTick: 0}` — the half tick charged twice.
     */
    private finish(): void {
      if (this.finished || this.awaitingFlow) return;
      const { flow, tickBefore, carry } = this.drive;
      if (!flow.done()) {
        this.enterRetirement();
        return;
      }
      this.finished = true;
      const result = this.result ?? flow.result();
      this.onDone(finishYearTurn(result, tickBefore, carry), result);
      this.scene.stop();
    }

    private redraw(): void {
      const style = this.style;
      // A new beat is on screen: it has been readable for zero frames (see `onKey`).
      this.framesShown = 0;
      for (const item of this.drawn) item.destroy();
      this.drawn = [];
      const beat = this.beats[this.cursor];
      if (!beat) return;

      /*
       * L8's "year = … full meter" is true exactly here, and nowhere a saved clock can hold — see
       * `fullMeter` (game/ui/SeasonMeter.ts). The header shows the meter the turn just filled, for
       * the year that just ENDED: it used to print the year the turn BEGINS, which on the last turn
       * of a six-year game read "Y7" — a year the game does not have.
       */
      const filled = fullMeter(this.drive.turn.save.year - 1, this.drive.balance);
      const title = this.add.text(
        style.pad,
        style.pad,
        `${filled.yearLabel} · ${filled.tickLabel}`,
        { fontFamily: style.fontFamily, fontSize: style.titleSize, color: style.textColor },
      );
      title.setOrigin(0, 0);
      this.drawn.push(title);

      /*
       * SAME DISCIPLINE AS THE RETIREMENT CARD, for the same reason. An aging beat lists one row per
       * owned creature — `balance.party.maxPartySize` + `maxBoxSize` of them, 66 on the shipped
       * numbers — and a raid beat one per harvested line. Un-bounded, the rows run off the bottom of
       * the canvas and the overflow is indistinguishable from "there was nothing more to say".
       */
      const top = style.pad + style.lineHeight * 2;
      const room = Math.floor((style.height - top - style.pad * 2 - style.lineHeight) / style.lineHeight);
      const width = Math.max(1, Math.floor((style.width - style.pad * 2) / style.charWidth));
      let y = top;
      for (const value of clampLines(wrapLines(beatLines(beat), width), room)) {
        const text = this.add.text(style.pad, y, value, {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          color: style.textColor,
        });
        text.setOrigin(0, 0);
        this.drawn.push(text);
        y += style.lineHeight;
      }

      const footer = this.add.text(
        style.pad,
        style.height - style.pad - style.lineHeight,
        `${String(this.cursor + 1)}/${String(this.beats.length)}`,
        { fontFamily: style.fontFamily, fontSize: style.fontSize, color: style.dimColor },
      );
      footer.setOrigin(0, 0);
      this.drawn.push(footer);
    }
  };
}
