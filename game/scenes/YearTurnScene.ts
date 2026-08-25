/**
 * game/scenes/YearTurnScene.ts — the year turn as a played sequence (build-doc §15 C6).
 *
 * build-doc §4, runtime narrative step 5: "At gym victory or tick 16, the **year turn** runs:
 * festival, aging of every owned+boxed creature, retirement flow for expiring creatures, map variant
 * swap, town aging arcs, event scripts (Cullbrand raids)." build-doc §7.5 numbers the same six steps.
 *
 * THIS SCENE DRIVES core/lifecycle.ts — it does not reimplement it. Specifically:
 *   - aging, the J→A→E schedule, the metamorphic latch, the boxed-creature rule and the Ancient
 *     exemption (G10 / Hard Req 4) are `runYearTurn`'s, and this file never touches `yearsRemaining`;
 *   - the scripted raid is applied by `runYearTurn` from `balance.yearEvents.raids`; game/year-events.ts
 *     only reads the result (G6 — the raid is scripted, the cascade above it is not);
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
import type { FestivalBeat, RaidReport } from "@game/year-events";
import { festivalBeat, ledgerNameOf, raidReportsFrom } from "@game/year-events";
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
  | { t: "festival"; festival: FestivalBeat }
  | { t: "aging"; season: Season; entries: AgingEntry[] }
  | { t: "ancients"; entries: AncientEntry[] }
  | { t: "form"; change: FormChangeBeat }
  | { t: "raid"; report: RaidReport }
  | { t: "mapVariant"; nodeId: string; nodeName: string; year: number; mapAsset: string }
  | { t: "retirements"; count: number; uids: string[] }
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

export interface YearTurnDriveDeps {
  content: Content;
  /** The seeded "sim" stream (build-doc §8.1) — drives step 5's season step. */
  simRng: Rng;
  /** The seeded lifecycle stream — drives the heir rolls in the retirement flow. */
  lifecycleRng: RandomFn;
  /**
   * The year the CLOCK says just ended — `ClockEvent {t:"yearEnd", year}`.
   *
   * REQUIRED, and the guard that makes build-doc §4's two triggers safe. `canRunYearTurn` is keyed
   * on the year the turn would BEGIN, and a completed turn has already moved `save.year` on, so it
   * cannot tell "the meter and a gym victory both ended year 3" from "year 4 has now ended too": a
   * second call with the post-turn save passed the check and ran a whole extra year — two festivals,
   * two aging passes, two season steps, two retirement rounds and two raid applications, burning two
   * of the six years on one player action. Naming the ended year makes that structurally impossible,
   * because after the first turn the save is no longer standing in it.
   */
  endedYear: number;
  /**
   * The tick the clock carried INTO the new year (`advanceAction(...).clock.tick`).
   *
   * core/clock.ts: "Ticks beyond the boundary carry into the new year rather than being dropped, so
   * no player action is silently free." `runYearTurn` resets the meter to `balance.clock.startTick`
   * because it has no clock of its own — the caller does, and {@link finishYearTurn} puts the carry
   * back. Omitted ⇒ `balance.clock.startTick`, which is right for a gym victory and for a headless
   * driver that never straddled a boundary.
   */
  carryTick?: number;
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
  /** The tick the clock carried into the new year — restored by {@link finishYearTurn}. */
  carryTick: number;
  /** The season core/lifecycle.ts stepped (build-doc §7.5 step 5). */
  seasonStepped: Season;
  /** The balance the turn ran against — the scene reads its layout from it (G11). */
  balance: Balance;
}

/**
 * The year turn's trigger, read off one player action's clock events — or null if the year did not
 * end.
 *
 * build-doc §4 gives the turn two triggers ("At gym victory or tick 16") and `core/clock.ts` reports
 * both as `{t:"yearEnd"}`. Collapsing them HERE, once, is what stops a shell that watches for both
 * from firing two turns: there is one trigger per action because there is one call to this.
 */
export interface YearTurnTrigger {
  /** The year that ended — hand this to {@link YearTurnDriveDeps.endedYear}. */
  endedYear: number;
  reason: YearEndReason;
  /** Ticks the action carried past the boundary (`advance`'s resulting tick). */
  carryTick: number;
}

export function yearTurnTrigger(advanced: ClockAdvance): YearTurnTrigger | null {
  const end = advanced.events.find(
    (e: ClockEvent): e is Extract<ClockEvent, { t: "yearEnd" }> => e.t === "yearEnd",
  );
  if (!end) return null;
  return { endedYear: end.year, reason: end.reason, carryTick: advanced.clock.tick };
}

/**
 * Run one year turn and build the sequence that plays it.
 *
 * THE SEASON STEP. `YearTurnDeps.ecosimStep` is per-node, but stepping nodes one at a time loses two
 * things core/ecosim.ts guarantees for a region: Ancient presence effects reach across adjacent
 * nodes (`balance.ecosim.presenceRadiusNodes`), and `stepAll` costs the parent stream exactly ONE
 * draw for the whole region — which is what makes adding a node not move every other node's
 * trajectory (INV-2, the defect LANE-A-STATUS I10 records). So the whole region is stepped once,
 * up front, and the per-node hook hands back the precomputed state for its node.
 *
 * The season is read from `core/clock.ts` `seasonsOfYear` and then CHECKED against the season the
 * year turn actually reports stepping; a mismatch throws instead of silently stepping the region for
 * one season and telling the player another.
 */
export function driveYearTurn(save: SaveEnvelope, deps: YearTurnDriveDeps): YearTurnDrive {
  const { content } = deps;
  const { balance } = content;

  /*
   * ONE TURN PER YEAR, keyed on the year that ENDED.
   *
   * `canRunYearTurn` guards the year the turn will BEGIN, which is the right question for core and
   * the wrong one for a shell with two triggers: after a turn, `save.year` is already the begun
   * year, so the flag (N+1) is below `save.year + 1` (N+2) and a second fire for the SAME player
   * action sails through and runs the next year's turn. Checking that the save is still standing in
   * the year the clock says ended makes that impossible — measured: the second call now throws where
   * it used to return "year 3".
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

  const flow = new RetirementFlow(turn, { content, rng: deps.lifecycleRng });

  return {
    turn,
    beats: beatsFor(save, turn, content),
    flow,
    mapVariantSwaps: turn.mapVariantSwaps,
    tickBefore,
    carryTick: deps.carryTick ?? balance.clock.startTick,
    seasonStepped: lastSeason,
    balance,
  };
}

/**
 * Turn the year turn's event log into the sequence of screens.
 *
 * build-doc §4: "the Phaser scene is a renderer of its event log". Every beat below is a projection
 * of an event core emitted — nothing is inferred, and nothing that did not happen is shown.
 *
 * ORDER IS SPEC, NOT TASTE. build-doc §7.5 numbers the turn's steps: (2) aging and the form changes,
 * (3) "any creature at 0 → retirement flow", (5) the season step + the year events, (6) the map
 * year-variant swap. So the retirement beat sits between the form changes and the raid ledger — and
 * the scene ANSWERS its prompts there, not after every other beat has played, which is where they
 * used to be answered. build-doc §4 step 5 lists the same six items with the map swap ahead of the
 * raid scripts; §7.5 is the one that numbers them and it wins. Logged as C56-D1.
 */
export function beatsFor(
  before: SaveEnvelope,
  turn: YearTurnResult,
  content: Content,
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
  beats.push({ t: "festival", festival: festivalBeat(year, balance) });

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
          formName: line ? ledgerNameOf(line, balance) : event.lineId,
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
 */
export function finishYearTurn(
  result: AdvanceYearResult,
  tickBefore: number,
  carryTick?: number,
): SaveEnvelope {
  const save = appendYearTurn(result, tickBefore);
  return carryTick === undefined ? save : { ...save, tick: carryTick };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Copy — identifiers and numbers only (G7)
 * ──────────────────────────────────────────────────────────────────────────── */

/** One line per beat, for the caption strip and for a headless dry-run of the sequence. */
export function beatLines(beat: YearTurnBeat): string[] {
  switch (beat.t) {
    case "festival":
      return [`FESTIVAL · ${beat.festival.label}`];
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
      return [
        `${beat.report.nodeName} · −${String(beat.report.totalRemoved)}`,
        ...beat.report.targets.map(
          (t) => `${t.ledgerName} ${String(t.before)} → ${String(t.remaining)} (−${String(t.removed)})`,
        ),
      ];
    case "mapVariant":
      return [`${beat.nodeName} · Y${String(beat.year)} · ${beat.mapAsset}`];
    case "retirements":
      return [`RETIREMENT · ${String(beat.count)}`];
    case "partyEmpty":
      return [`PARTY 0 · Y${String(beat.year)}`];
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The Phaser scene
 * ──────────────────────────────────────────────────────────────────────────── */

import type PhaserNS from "phaser";
import type { PlaceholderPainter, RetirementSceneData } from "@game/scenes/RetirementScene";
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
      this.drawn = [];
    }

    create(): void {
      const style = this.style;
      this.add.rectangle(0, 0, style.width, style.height, style.bgColor).setOrigin(0, 0);
      const keyboard = this.input.keyboard;
      if (keyboard) {
        keyboard.on("keydown-SPACE", () => this.next());
        keyboard.on("keydown-ENTER", () => this.next());
      }
      this.redraw();
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

    private finish(): void {
      if (this.finished || this.awaitingFlow) return;
      const { flow, tickBefore, carryTick } = this.drive;
      if (!flow.done()) {
        this.enterRetirement();
        return;
      }
      this.finished = true;
      const result = this.result ?? flow.result();
      this.onDone(finishYearTurn(result, tickBefore, carryTick), result);
      this.scene.stop();
    }

    private redraw(): void {
      const style = this.style;
      for (const item of this.drawn) item.destroy();
      this.drawn = [];
      const beat = this.beats[this.cursor];
      if (!beat) return;

      // L8's "year = … full meter" is true exactly here, and nowhere a saved clock can hold — see
      // `fullMeter` (game/ui/SeasonMeter.ts). The header shows the meter the turn just filled.
      const filled = fullMeter(this.drive.turn.save.year - 1, this.drive.balance);
      const title = this.add.text(
        style.pad,
        style.pad,
        `Y${String(this.drive.turn.save.year)} · ${filled.tickLabel}`,
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
