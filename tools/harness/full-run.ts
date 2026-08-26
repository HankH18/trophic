/**
 * tools/harness/full-run.ts — §10.5 mode (c).
 *
 * "full-run sim — 6 years of scripted catching against the sim, assert no unintended extinction
 * under normal play and guaranteed cascade under over-catch script."
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WHY THIS MODE DOES NOT SIMULATE THE FIGHTS
 * ════════════════════════════════════════════════════════════════════════════
 * Hard Req 8 / bible §13.14: KO is a FAINT. There is no battle death anywhere in TROPHIC — lifespan
 * is the mortality system. So a wild battle cannot move a population by one individual; the ONLY
 * channel from play into the ecology is the catch (build-doc §7.3: "Player catch/release directly
 * increments/decrements `count` at action time"). Mode (c) therefore resolves each encounter's catch
 * with the shipped §7.4 formula against a real `Battler` built by `core/battle.ts`'s own
 * `makeBattler` — the same `catchChance` the reducer calls — and skips a fight that provably cannot
 * change a number. Mode (a) is where the fights are measured.
 *
 * One draw per attempt instead of the reducer's three shakes: `performSnare` runs `shakes`
 * independent checks at `p^(1/shakes)`, whose product is exactly `p`, so a single draw at `p` is the
 * same event with a shorter stream.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * THE PLAY PROFILES (clause 8 of the reasonable-player model)
 * ════════════════════════════════════════════════════════════════════════════
 * Both are real play, and both are bounded by shipped constants rather than by a made-up rate:
 *   · DEX       — catches one of every line it meets and then leaves that line alone. At most 27
 *                 catches over six years: a player completing the dex.
 *   · COLLECTOR — catches everything it can until the party and the box are full
 *                 (`balance.party.maxPartySize + maxBoxSize` = 66 individuals). The heaviest catch
 *                 load the shipped rules permit without releasing anything.
 * A BASELINE with no player at all runs alongside. It is the control: a line that dies out in the
 * baseline was never the player's doing, and calling that an over-catch would be a lie.
 *
 * Where the player goes: the act's nodes (tools/harness/player.ts clause 1), one foray per tick,
 * cycling. `balance.encounter.stepsPerForay` rolls per foray at `encounterChancePerStep` each.
 *
 * The season boundaries come from `core/clock.ts` and the year turn from `core/lifecycle.ts`, so the
 * 24-season-steps-per-game invariant holds here exactly as it does in the game (18 clock boundaries
 * + 6 year turns), and the shipped Cullbrand raid fires through the real code path (G6: a raid only
 * decrements what it harvests; anything above it in the web has to starve on its own).
 */

import { advanceAction, createClock, seasonOf } from "../../core/clock";
import {
  applyCatch,
  fromNodeState,
  step as ecosimStep,
  stepRegionStates,
  toNodeState,
  withPresence,
} from "../../core/ecosim";
import {
  cloneEcoNode,
  deriveFoodWeb,
  encounterWeights,
  isMesopredator,
  limitingPrey,
  predatorsOf,
  preyOf,
  primaryPrey,
  rollEncounter,
  toEcoNode,
  type EcoNode,
} from "../../core/foodweb";
import { enterPendingActs, runYearTurn } from "../../core/lifecycle";
import { actGates, awardBadge, badgeCount } from "../../core/acts";
import { catchChance, makeBattler } from "../../core/battle";
import { createRng, subsystemRng, type Rng } from "../../core/rng";
import { newSave } from "../../core/save";
import { AGE_CLASSES } from "../../core/types";
import type { AgeClass, NodeFile, NodeState, SaveFile, Season } from "../../core/types";
import { seedFor, subsystemTags, type LoadedContent } from "./content";
import { actNodeIds } from "./player";

/* ════════════════════════════════════════════════════════════════════════════
 * Shared: the survey the mode reports
 * ════════════════════════════════════════════════════════════════════════════ */

export interface PopulationTrack {
  nodeId: string;
  lineId: string;
  formName: string;
  start: number;
  min: number;
  end: number;
  /** Season index (1-based over the whole run) at which the count first hit zero, or null. */
  extinctAtSeason: number | null;
}

export interface RunSurvey {
  tracks: PopulationTrack[];
  extinctions: PopulationTrack[];
  catches: number;
  catchesByLine: Array<{ lineId: string; formName: string; caught: number }>;
  seasonSteps: number;
}

class Survey {
  private readonly track = new Map<string, PopulationTrack>();
  private season = 0;

  constructor(
    private readonly loaded: LoadedContent,
    states: Readonly<Record<string, NodeState>>,
  ) {
    for (const [nodeId, state] of Object.entries(states)) {
      for (const [lineId, pop] of Object.entries(state.populations)) {
        this.track.set(`${nodeId}|${lineId}`, {
          nodeId,
          lineId,
          formName: this.nameOf(lineId),
          start: pop.count,
          min: pop.count,
          end: pop.count,
          extinctAtSeason: pop.count === 0 ? 0 : null,
        });
      }
    }
  }

  private nameOf(lineId: string): string {
    const line = this.loaded.species.byId.get(lineId);
    return line ? line.formNames[line.ancient ? "E" : "A"] : lineId;
  }

  markSeason(): void {
    this.season += 1;
  }

  observe(states: Readonly<Record<string, NodeState>>): void {
    for (const [nodeId, state] of Object.entries(states)) {
      for (const [lineId, pop] of Object.entries(state.populations)) {
        const entry = this.track.get(`${nodeId}|${lineId}`);
        if (!entry) continue;
        entry.end = pop.count;
        if (pop.count < entry.min) entry.min = pop.count;
        if (pop.count === 0 && entry.extinctAtSeason === null && entry.start > 0) {
          entry.extinctAtSeason = this.season;
        }
      }
    }
  }

  finish(catches: number, byLine: Map<string, number>): RunSurvey {
    const tracks = [...this.track.values()].sort(
      (a, b) => a.nodeId.localeCompare(b.nodeId) || a.lineId.localeCompare(b.lineId),
    );
    return {
      tracks,
      extinctions: tracks.filter((t) => t.start > 0 && t.min === 0),
      catches,
      catchesByLine: [...byLine.entries()]
        .map(([lineId, caught]) => ({ lineId, formName: this.nameOf(lineId), caught }))
        .sort((a, b) => b.caught - a.caught || a.lineId.localeCompare(b.lineId)),
      seasonSteps: this.season,
    };
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * The catch, resolved with the shipped §7.4 formula
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The bait the reference over-catching player carries (`balance.harness.overcatch.baitMatch`).
 *
 * build-doc §7.2: "bait matches target if bait's tag ∈ target's derived diet". A species-specific
 * bait for a target is therefore a bait tagged with something that target eats — read off the
 * DERIVED web (G3), never a table. A target with no live diet (a Producer, a Scavenger, an Ancient)
 * cannot be species-baited at all, and the reference player goes without.
 */
function baitTagFor(node: EcoNode, lineId: string, loaded: LoadedContent): string | undefined {
  const web = deriveFoodWeb(node, loaded.species, loaded.balance);
  const diet = preyOf(web, lineId);
  return diet.length > 0 ? diet[0] : undefined;
}

/** The wild level of an encounter in `year` (build-doc §7.2 derivations, all tunables). */
function wildLevel(year: number, loaded: LoadedContent, rng: Rng): number {
  const cfg = loaded.balance.encounter;
  const base = cfg.levelByYear[year - 1] ?? cfg.levelByYear[cfg.levelByYear.length - 1] ?? cfg.minLevel;
  const jitter = rng.int(-cfg.levelJitter, cfg.levelJitter + 1);
  return Math.max(cfg.minLevel, base + jitter);
}

function rollWildAge(loaded: LoadedContent, rng: Rng): AgeClass {
  return rng.pickWeighted([...AGE_CLASSES], (age) => loaded.balance.encounter.ageWeights[age]) ?? "A";
}

/**
 * The §7.4 catch probability for one encounter, using the reference player stated in
 * `balance.harness.overcatch` (snare tier, bait, and the HP fraction they throw at).
 */
export function encounterCatchChance(
  node: EcoNode,
  lineId: string,
  year: number,
  loaded: LoadedContent,
  rng: Rng,
): number {
  const balance = loaded.balance;
  const ref = balance.harness.overcatch;
  const line = loaded.species.byId.get(lineId);
  if (!line) return 0;
  const age = line.ancient ? "E" : rollWildAge(loaded, rng);
  const battler = makeBattler(
    { uid: "wild", lineId, age, level: wildLevel(year, loaded, rng), traits: [] },
    "enemy",
    loaded.battle,
    { isWild: true, enteredOnTurn: 1 },
  );
  battler.curHp = Math.max(balance.damage.minDamage, Math.round(battler.maxHp * ref.referenceHpFrac));
  return catchChance(battler, ref.snareTier, baitTagFor(node, lineId, loaded), false, loaded.battle, node.id);
}

/* ════════════════════════════════════════════════════════════════════════════
 * The six-year run
 * ════════════════════════════════════════════════════════════════════════════ */

export const PLAY_PROFILES = ["baseline", "dex", "collector"] as const;
export type PlayProfile = (typeof PLAY_PROFILES)[number];

export interface FullRunResult {
  profile: PlayProfile;
  seed: number;
  survey: RunSurvey;
  /** Cullbrand raid events the year turns fired (data, from `balance.yearEvents.raids`). */
  raids: Array<{ eventId: string; nodeId: string; lineId: string; removed: number; remaining: number }>;
}

interface ProfileRule {
  /** Whether the player attempts a catch on this encounter. */
  wants(lineId: string, caughtTotal: number, seenLines: ReadonlySet<string>): boolean;
}

function ruleFor(profile: PlayProfile, loaded: LoadedContent): ProfileRule {
  const capacity = loaded.balance.party.maxPartySize + loaded.balance.party.maxBoxSize;
  switch (profile) {
    case "baseline":
      return { wants: () => false };
    case "dex":
      return { wants: (lineId, _total, seen) => !seen.has(lineId) };
    case "collector":
      return { wants: (_lineId, total) => total < capacity };
  }
}

export function runFullRun(loaded: LoadedContent, seed: number, profile: PlayProfile): FullRunResult {
  const balance = loaded.balance;
  const tags = subsystemTags(balance);
  const simRng = subsystemRng(seed, tags.sim);
  const encRng = subsystemRng(seed, tags.encounter);
  const rule = ruleFor(profile, loaded);
  const files = loaded.nodes;
  const fileById = new Map(files.map((f) => [f.id, f]));

  const firstNode = files[0];
  if (!firstNode) throw new Error("tools/harness: the region has no nodes");
  let save: SaveFile = newSave({ seed, currentNode: firstNode.id, nodes: files }, balance);
  const survey = new Survey(loaded, save.nodeStates);

  const seenLines = new Set<string>();
  const caughtByLine = new Map<string, number>();
  let caughtTotal = 0;
  const raids: FullRunResult["raids"] = [];

  const forayAt = (nodeId: string, season: Season, year: number): void => {
    const file = fileById.get(nodeId);
    const state = save.nodeStates[nodeId];
    if (!file || !state) return;
    let node = fromNodeState(file, state);
    const cfg = balance.encounter;
    for (let s = 0; s < cfg.stepsPerForay; s++) {
      if (!encRng.chance(cfg.encounterChancePerStep)) continue;
      const lineId = rollEncounter(encounterWeights(node, loaded.species, balance, { season }), encRng);
      if (lineId === null) break; // nothing left alive here — §7.2, not a fallback table (G3)
      if (!rule.wants(lineId, caughtTotal, seenLines)) continue;
      const p = encounterCatchChance(node, lineId, year, loaded, encRng);
      if (!encRng.chance(p)) continue;
      node = applyCatch(node, lineId, balance);
      seenLines.add(lineId);
      caughtByLine.set(lineId, (caughtByLine.get(lineId) ?? 0) + 1);
      caughtTotal += 1;
    }
    save = { ...save, nodeStates: { ...save.nodeStates, [nodeId]: toNodeState(node) } };
  };

  const regionStep = (season: Season): void => {
    const result = stepRegionStates(files, save.nodeStates, season, simRng, loaded.sim);
    save = { ...save, nodeStates: result.states };
    survey.markSeason();
    survey.observe(save.nodeStates);
  };

  /*
   * ⚠ TWO CLOCKS, AND THE HARNESS DRIVES BOTH.
   *
   * The calendar is `clock` and it is unbounded; the ACT is `act` and it is driven by badges. They
   * are independent in the game, so the harness has to CHOOSE a pacing model rather than inherit
   * one, and this is that choice stated out loud: **one act per simulated year**, which is the
   * "normal pacing" `balance.clock.yearsTotal` describes. The whole balance report is measured
   * against that model; a slower player would see the same acts against older creatures, and
   * `--years` is the lever that measures it.
   *
   * The badges are written rather than inferred so that `core/acts.ts` is the thing under test:
   * entering act N fires act N's scripted Cullbrand raid through the same `enterPendingActs` the
   * game calls, instead of the harness re-implementing the decrement.
   */
  const gatesByAct = new Map(actGates(balance).map((g) => [g.act, g] as const));
  const gymsByAct = [...loaded.gyms].sort((a, b) => a.act - b.act);
  const enterAct = (act: number): void => {
    const gate = gatesByAct.get(act);
    if (gate) {
      const flags: SaveFile["questFlags"] = { ...save.questFlags };
      for (const flag of gate.flags) flags[flag] = true;
      save = { ...save, questFlags: flags };
      // Badges up to the gate's requirement, taken from the leaders below this act in order.
      for (const gym of gymsByAct) {
        if (badgeCount(save, loaded.gyms, balance) >= gate.badges) break;
        if (gym.act >= act) break;
        save = awardBadge(save, gym.id, balance);
      }
    }
    const entry = enterPendingActs(save, { balance, gyms: loaded.gyms });
    save = entry.save;
    for (const event of entry.events) {
      if (event.t !== "raid") continue;
      raids.push({
        eventId: event.eventId,
        nodeId: event.nodeId,
        lineId: event.lineId,
        removed: event.removed,
        remaining: event.remaining,
      });
    }
    survey.observe(save.nodeStates);
  };

  let clock = createClock(balance);
  for (let y = 0; y < balance.clock.yearsTotal; y++) {
    const year = clock.year;
    const act = balance.acts.first + 1 + y;
    enterAct(act);
    const nodeIds = actNodeIds(act, loaded);
    let forayIndex = 0;
    let yearEnded = false;
    while (!yearEnded) {
      const season = seasonOf(clock, balance);
      const nodeId = nodeIds[forayIndex % Math.max(1, nodeIds.length)];
      forayIndex += 1;
      if (nodeId !== undefined) forayAt(nodeId, season, year);
      survey.observe(save.nodeStates);

      const advanced = advanceAction(clock, "foray", balance);
      clock = advanced.clock;
      for (const event of advanced.events) {
        if (event.t === "seasonBoundary") regionStep(event.seasonEnded);
        else if (event.t === "yearEnd") yearEnded = true;
      }
    }

    // build-doc §7.5 step 5 — the year's FOURTH season step, plus the scripted year events. Run the
    // region step ONCE (so presence and the per-node streams are region-wide, as in play) and hand
    // `runYearTurn` the result, rather than restating either half here.
    const order = balance.clock.seasonOrder;
    const lastSeason = order[order.length - 1];
    if (lastSeason === undefined) throw new Error("tools/harness: balance.clock.seasonOrder is empty");
    const stepped = stepRegionStates(files, save.nodeStates, lastSeason, simRng, loaded.sim).states;
    const turn = runYearTurn(save, {
      species: loaded.content.species,
      balance,
      nodes: files,
      ecosimStep: (nodeId, state) => stepped[nodeId] ?? state,
    });
    save = turn.save;
    survey.markSeason();
    survey.observe(save.nodeStates);
    // The raids are no longer the year turn's — they fire on ACT ENTRY, at the top of the loop.
  }

  return { profile, seed, survey: survey.finish(caughtTotal, caughtByLine), raids };
}

export interface ProfileSummary {
  profile: PlayProfile;
  seeds: number;
  seasonSteps: number;
  meanCatches: number;
  /** Every (node, line) that reached zero having started above it, in ANY seed, with its seed count. */
  extinctions: Array<{
    nodeId: string;
    lineId: string;
    formName: string;
    start: number;
    seeds: number;
    firstSeason: number;
  }>;
  /** The tightest squeeze that did NOT go to zero — how close normal play came. */
  closest: Array<{ nodeId: string; lineId: string; formName: string; start: number; min: number }>;
  catchesByLine: Array<{ lineId: string; formName: string; caught: number }>;
}

const CLOSEST_LISTED = 8;

export function summariseProfile(
  loaded: LoadedContent,
  profile: PlayProfile,
  seeds: number,
): ProfileSummary {
  const extinct = new Map<string, { nodeId: string; lineId: string; formName: string; start: number; seeds: number; firstSeason: number }>();
  const minima = new Map<string, { nodeId: string; lineId: string; formName: string; start: number; min: number }>();
  const catches = new Map<string, { lineId: string; formName: string; caught: number }>();
  let totalCatches = 0;
  let seasonSteps = 0;

  for (let i = 0; i < seeds; i++) {
    const run = runFullRun(loaded, seedFor(loaded.balance, i), profile);
    totalCatches += run.survey.catches;
    seasonSteps = run.survey.seasonSteps;
    for (const entry of run.survey.catchesByLine) {
      const found = catches.get(entry.lineId);
      if (found) found.caught += entry.caught;
      else catches.set(entry.lineId, { ...entry });
    }
    for (const track of run.survey.tracks) {
      if (track.start <= 0) continue;
      const key = `${track.nodeId}|${track.lineId}`;
      const seen = minima.get(key);
      if (!seen || track.min < seen.min) {
        minima.set(key, {
          nodeId: track.nodeId,
          lineId: track.lineId,
          formName: track.formName,
          start: track.start,
          min: track.min,
        });
      }
      if (track.min > 0) continue;
      const entry = extinct.get(key);
      if (entry) {
        entry.seeds += 1;
        entry.firstSeason = Math.min(entry.firstSeason, track.extinctAtSeason ?? entry.firstSeason);
      } else {
        extinct.set(key, {
          nodeId: track.nodeId,
          lineId: track.lineId,
          formName: track.formName,
          start: track.start,
          seeds: 1,
          firstSeason: track.extinctAtSeason ?? 0,
        });
      }
    }
  }

  return {
    profile,
    seeds,
    seasonSteps,
    meanCatches: seeds === 0 ? 0 : totalCatches / seeds,
    extinctions: [...extinct.values()].sort((a, b) => b.seeds - a.seeds || a.nodeId.localeCompare(b.nodeId)),
    closest: [...minima.values()]
      .filter((m) => m.min > 0)
      .sort((a, b) => a.min / a.start - b.min / b.start)
      .slice(0, CLOSEST_LISTED),
    catchesByLine: [...catches.values()].sort((a, b) => b.caught - a.caught || a.lineId.localeCompare(b.lineId)),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * The over-catch half — the demo beat as a measurement
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The top of a node's derived web: a line that eats something here and that nothing here eats.
 *
 * Structural, so no role name and no species name appears in this file (G6 / §8.3). It is also the
 * only definition that stays true when a node has no Apex at all — the Meadow's top predator is a
 * Mesopredator, and build-doc §10.2's claim is about the tier structure, not about a label.
 */
export function topOfWeb(node: EcoNode, loaded: LoadedContent): string[] {
  const web = deriveFoodWeb(node, loaded.species, loaded.balance);
  const live = (id: string): boolean => (node.populations[id]?.count ?? 0) > 0;
  const out: string[] = [];
  for (const lineId of Object.keys(node.populations)) {
    if (!live(lineId)) continue;
    // `deriveFoodWeb` keys its edges on PRESENCE in the node file, not on the live count (a line
    // that has been wiped out is still listed, at zero). The top of the LIVE web therefore has to
    // ask about counts on both sides — otherwise a predator that has just starved out still
    // "hunts" the tier below it and the throne never looks empty, which is exactly the beat
    // build-doc §1 is about.
    if (!preyOf(web, lineId).some(live)) continue;
    if (predatorsOf(web, lineId).some(live)) continue;
    out.push(lineId);
  }
  return out.sort();
}

export const PREY_READINGS = ["primary", "limiting"] as const;
/**
 * build-doc §10.2 says "its primary prey", singular — but a predator that can substitute one pool
 * for another is only starved by the SET reading (`limitingPrey`, the minimal set of catchable
 * pools whose loss starves it), so the literal reading measures nothing at those nodes. Both are
 * measured, because reporting only the flattering one is how a harness lies.
 */
export type PreyReading = (typeof PREY_READINGS)[number];

export const OVERCATCH_SHAPES = ["hold", "effort"] as const;
/**
 * The two shapes the over-catching can take, and they do NOT give the same answer:
 *
 *   · HOLD   — build-doc §10.2 read literally: drive the target under
 *              `cascade.preyForcedFraction` at the start of EVERY one of `cascade.forcingSeasons`
 *              seasons and keep it there. The strongest possible forcing.
 *   · EFFORT — the shape `fixtures/overcatch-script.json` actually records, generalised with no new
 *              constant: the player removes `opening / forcingSeasons` individuals per forcing
 *              season and then stops. On the shipped fixture that is 7 + 7 out of 14, which
 *              reproduces the recorded trace exactly.
 *
 * The difference matters for the demo: holding a population at 10% for two straight seasons very
 * often kills it outright, which takes the "a new apex risen" half of the beat with it.
 */
export type OvercatchShape = (typeof OVERCATCH_SHAPES)[number];

export interface OvercatchRun {
  nodeId: string;
  topLineId: string;
  topFormName: string;
  reading: PreyReading;
  shape: OvercatchShape;
  targets: string[];
  seed: number;
  /** Individuals the script caught. */
  caught: number;
  /** 1-based season index at which the top line first read zero, or null. */
  topZeroSeason: number | null;
  collapsed: boolean;
  /**
   * build-doc §10.2's own clause: a **Mesopredator-role** prey line of the collapsed predator is
   * above its collapse-season count, and alive, inside the release window. This is the release.
   */
  mesoReleased: boolean;
  /** Which Mesopredator-role line that was, if any. */
  mesoReleasedLineId: string | null;
  /**
   * The BROADER signal, and NOT §10.2's clause: did anything the collapsed predator used to eat —
   * of any role — end the window alive and above where it stood at the collapse? High here with
   * `mesoReleased` false is the signature of a two-tier collapse in which a Grazer rebounded into
   * the empty throne. Reported under its own name so it can never be read as the beat.
   */
  anyPreyReleased: boolean;
  /** Which line that was, if any. */
  anyPreyReleasedLineId: string | null;
  /**
   * The Mesopredator-role prey of the collapsed predator, per `webRole`. EMPTY means §10.2's clause
   * is undefined at this node — there is no tier between the top of its web and the Grazers — and
   * `mesoReleased` is then false by construction rather than by measurement.
   */
  mesoPreyIds: string[];
  /** The whole beat: the top gone AND the MESOPREDATOR rising afterwards (§10.2, both clauses). */
  fullBeat: boolean;
  /** Every over-caught target also reached zero — a two-tier collapse, not a release. */
  targetsCoExtinct: boolean;
  /** Per-season counts of the top line. */
  topTrace: number[];
  /** Per-season counts of every line the top used to eat, keyed by line id. */
  preyTraces: Record<string, number[]>;
  /** Who sits at the top of the node's web once the run is over. */
  newTopOfWeb: string[];
}

/**
 * Drive the over-catch PROTOCOL at one node with one seed.
 *
 * G6, restated: this function only issues CATCHES — `applyCatch`, the same call the game makes when
 * a snare lands — and then lets `core/ecosim.ts` run. It does not touch a rule, a rate or a species,
 * and it never names one. Whether a cascade follows is the sim's answer, not the harness's.
 */
export function runOvercatch(
  loaded: LoadedContent,
  file: NodeFile,
  topLineId: string,
  reading: PreyReading,
  shape: OvercatchShape,
  seed: number,
): OvercatchRun {
  const balance = loaded.balance;
  const cascade = balance.cascade;
  const template = toEcoNode(file);
  const web = deriveFoodWeb(template, loaded.species, balance);
  const seasons = balance.clock.seasonOrder;

  const targets =
    reading === "limiting"
      ? limitingPrey(template, web, loaded.species, topLineId, balance, cascade.preyForcedFraction)
      : [primaryPrey(template, web, topLineId, balance)].filter((id): id is string => id !== null);

  const floors = new Map<string, number>();
  const quota = new Map<string, number>();
  for (const id of targets) {
    const opening = template.populations[id]?.count ?? 0;
    floors.set(id, Math.floor(opening * cascade.preyForcedFraction));
    quota.set(id, Math.ceil(opening / Math.max(1, cascade.forcingSeasons)));
  }

  let node = cloneEcoNode(template);
  const rng = createRng(seed);
  const ctx = withPresence(loaded.sim, [node]);
  const observeSeasons = cascade.forcingSeasons + cascade.apexCollapseSeasons + cascade.mesoReleaseSeasons;

  // Every line the collapsed predator ate at the OPENING state — the tier the beat is about.
  const preyIds = preyOf(web, topLineId);
  const preyTraces: Record<string, number[]> = {};
  for (const id of preyIds) preyTraces[id] = [];

  let caught = 0;
  const topTrace: number[] = [];
  let topZeroSeason: number | null = null;

  for (let s = 0; s < observeSeasons; s++) {
    if (s < cascade.forcingSeasons) {
      for (const id of targets) {
        if (shape === "hold") {
          const floor = floors.get(id) ?? 0;
          while ((node.populations[id]?.count ?? 0) > floor) {
            node = applyCatch(node, id, balance);
            caught += 1;
          }
        } else {
          let left = quota.get(id) ?? 0;
          while (left > 0 && (node.populations[id]?.count ?? 0) > balance.ecosim.populationFloor) {
            node = applyCatch(node, id, balance);
            caught += 1;
            left -= 1;
          }
        }
      }
    }
    const season = seasons[s % seasons.length] as Season;
    node = ecosimStep(node, season, rng, ctx).node;
    const topCount = node.populations[topLineId]?.count ?? 0;
    topTrace.push(topCount);
    for (const id of preyIds) preyTraces[id]?.push(node.populations[id]?.count ?? 0);
    if (topCount === 0 && topZeroSeason === null) topZeroSeason = s + 1;
  }

  const collapsed =
    topZeroSeason !== null && topZeroSeason <= cascade.forcingSeasons + cascade.apexCollapseSeasons;

  /*
   * ════════════════════════════════════════════════════════════════════════════
   * THE RELEASE — and why it is measured TWICE, under two different names
   * ════════════════════════════════════════════════════════════════════════════
   * build-doc §10.2's second clause is specific about the animal: "apex count →0 and
   * **mesopredator** count strictly rising within 4 seasons". An earlier version of this function
   * scored the clause as a bare existential over every prey line of any role, with a comment saying
   * "the verdict does not depend on which one it is" — and the verdict does. At four of the six
   * apex sites the apex also eats a Grazer (bible §5's large-Grazer rule at `bowerdeep`/`r3`, its
   * authored diet exception at `brackwater`/`r2`), so an over-caught Grazer rebounding once nothing
   * hunts it scored as a mesopredator release. That is the two-tier collapse §4.3's own prose warns
   * about, counted as its opposite.
   *
   * So both are computed, and they are kept apart:
   *
   *   `mesoReleased`    — §10.2's clause. ONLY prey whose `webRole` is `Mesopredator` can satisfy
   *                       it. This is what `fullBeat` is built from and what the report publishes
   *                       as the demo beat.
   *   `anyPreyReleased` — the broader existential, kept because it is genuinely informative: a row
   *                       high here and zero on `mesoReleased` says the herbivores are in charge.
   *                       It is a diagnostic, never the beat.
   *
   * Roles come from `core/foodweb.ts`'s `isMesopredator` — a thin reading of `webRole`, and the
   * repo's only role reader. Nothing here re-derives a role, no role NAME appears in this file
   * (§8.3 gives them one home, and `tests/property/foodweb.test.ts` enforces it), and no species is
   * named (G3, G6).
   */
  const preyIsMesopredator = (lineId: string): boolean => {
    const line = loaded.species.byId.get(lineId);
    return line !== undefined && isMesopredator(line, balance);
  };
  const mesoPreyIds = preyIds.filter(preyIsMesopredator);

  let anyPreyReleased = false;
  let anyPreyReleasedLineId: string | null = null;
  let anyBestGain = 0;
  let mesoReleased = false;
  let mesoReleasedLineId: string | null = null;
  let mesoBestGain = 0;
  if (collapsed && topZeroSeason !== null) {
    const windowEnd = Math.min(observeSeasons, topZeroSeason + cascade.mesoReleaseSeasons);
    for (const id of preyIds) {
      const trace = preyTraces[id] ?? [];
      const atCollapse = trace[topZeroSeason - 1] ?? 0;
      // The best gain this line reaches anywhere inside the window — strictly above where it stood
      // when the predator hit zero, and alive. Identical arithmetic for both readings; the ONLY
      // difference between them is which lines are eligible to be counted.
      let gain = 0;
      for (let s = topZeroSeason; s < windowEnd; s++) {
        const value = trace[s] ?? 0;
        if (value > atCollapse && value > 0 && value - atCollapse > gain) gain = value - atCollapse;
      }
      if (gain <= 0) continue;
      if (gain >= anyBestGain) {
        anyPreyReleased = true;
        anyPreyReleasedLineId = id;
        anyBestGain = gain;
      }
      if (preyIsMesopredator(id) && gain >= mesoBestGain) {
        mesoReleased = true;
        mesoReleasedLineId = id;
        mesoBestGain = gain;
      }
    }
  }

  const targetsCoExtinct = targets.length > 0 && targets.every((id) => (node.populations[id]?.count ?? 0) === 0);
  const topLine = loaded.species.byId.get(topLineId);

  return {
    nodeId: file.id,
    topLineId,
    topFormName: topLine ? topLine.formNames[topLine.ancient ? "E" : "A"] : topLineId,
    reading,
    shape,
    targets,
    seed,
    caught,
    topZeroSeason,
    collapsed,
    mesoReleased,
    mesoReleasedLineId,
    anyPreyReleased,
    anyPreyReleasedLineId,
    mesoPreyIds,
    fullBeat: collapsed && mesoReleased,
    targetsCoExtinct,
    topTrace,
    preyTraces,
    newTopOfWeb: topOfWeb(node, loaded).filter((id) => id !== topLineId),
  };
}

export interface OvercatchNodeSummary {
  nodeId: string;
  biome: string;
  walkable: boolean;
  topLineId: string;
  topFormName: string;
  reading: PreyReading;
  shape: OvercatchShape;
  targets: string[];
  targetFormNames: string[];
  seeds: number;
  collapseRate: number;
  /**
   * build-doc §10.2's release clause, restricted to Mesopredator-role prey. Identical to
   * `fullBeatRate` by construction — a mesopredator cannot be released by a predator that is still
   * alive — and named separately because the two claims are read separately.
   */
  mesoReleaseRate: number;
  /**
   * The broader diagnostic: any prey line of any role rebounded. NOT §10.2's clause. A row where
   * this is high and `mesoReleaseRate` is 0 is a two-tier collapse with a Grazer on the throne.
   */
  anyReleaseRate: number;
  fullBeatRate: number;
  coExtinctRate: number;
  meanCollapseSeason: number | null;
  meanCaught: number;
  /** The Mesopredator-role line most often credited with the §10.2 release. */
  mesoReleasedFormName: string | null;
  /** The line of ANY role most often credited with the broader rebound. */
  anyReleasedFormName: string | null;
  /**
   * False when the top of this node's web has no Mesopredator-role prey at all — §10.2's two-tier
   * clause is then UNDEFINED here, and `mesoReleaseRate` is 0 by construction, not by measurement.
   */
  hasMesoPrey: boolean;
  /** The Mesopredator-role prey the clause is about, if any. */
  mesoPreyFormNames: string[];
  /** Fraction of seeds where SOMETHING still sits at the top of the node's web at the end. */
  newApexRate: number;
  /** The most common occupant of that empty throne. */
  newApexFormNames: string[];
  /** One representative run's traces, for the report. */
  sampleTopTrace: number[];
  samplePreyTraces: Array<{ formName: string; trace: number[] }>;
}

export function sweepOvercatch(
  loaded: LoadedContent,
  seeds: number,
  reading: PreyReading,
  shape: OvercatchShape,
): OvercatchNodeSummary[] {
  const out: OvercatchNodeSummary[] = [];
  const nameOf = (id: string): string => {
    const line = loaded.species.byId.get(id);
    return line ? line.formNames[line.ancient ? "E" : "A"] : id;
  };
  for (const file of loaded.nodes) {
    const node = toEcoNode(file);
    for (const topLineId of topOfWeb(node, loaded)) {
      let collapsed = 0;
      let mesoReleased = 0;
      let anyReleased = 0;
      let fullBeat = 0;
      let coExtinct = 0;
      let collapseSeasonSum = 0;
      let collapseSeasonCount = 0;
      let caught = 0;
      let targets: string[] = [];
      let mesoPreyIds: string[] = [];
      let sampleTopTrace: number[] = [];
      let samplePreyTraces: Array<{ formName: string; trace: number[] }> = [];
      const mesoReleasedCounts = new Map<string, number>();
      const anyReleasedCounts = new Map<string, number>();
      const newApexCounts = new Map<string, number>();
      let newApexSeeds = 0;
      for (let i = 0; i < seeds; i++) {
        const run = runOvercatch(loaded, file, topLineId, reading, shape, seedFor(loaded.balance, i));
        targets = run.targets;
        mesoPreyIds = run.mesoPreyIds;
        caught += run.caught;
        if (i === 0) {
          sampleTopTrace = run.topTrace;
          samplePreyTraces = Object.entries(run.preyTraces).map(([id, trace]) => ({
            formName: nameOf(id),
            trace,
          }));
        }
        if (run.collapsed) collapsed += 1;
        if (run.mesoReleased) mesoReleased += 1;
        if (run.anyPreyReleased) anyReleased += 1;
        if (run.fullBeat) fullBeat += 1;
        if (run.targetsCoExtinct) coExtinct += 1;
        if (run.mesoReleasedLineId) {
          const id = run.mesoReleasedLineId;
          mesoReleasedCounts.set(id, (mesoReleasedCounts.get(id) ?? 0) + 1);
        }
        if (run.anyPreyReleasedLineId) {
          const id = run.anyPreyReleasedLineId;
          anyReleasedCounts.set(id, (anyReleasedCounts.get(id) ?? 0) + 1);
        }
        if (run.newTopOfWeb.length > 0) newApexSeeds += 1;
        for (const id of run.newTopOfWeb) newApexCounts.set(id, (newApexCounts.get(id) ?? 0) + 1);
        if (run.topZeroSeason !== null) {
          collapseSeasonSum += run.topZeroSeason;
          collapseSeasonCount += 1;
        }
      }
      const topMesoReleased = [...mesoReleasedCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const topAnyReleased = [...anyReleasedCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      out.push({
        nodeId: file.id,
        biome: file.biome,
        walkable: file.walkable,
        topLineId,
        topFormName: nameOf(topLineId),
        reading,
        shape,
        targets,
        targetFormNames: targets.map(nameOf),
        seeds,
        collapseRate: seeds === 0 ? 0 : collapsed / seeds,
        mesoReleaseRate: seeds === 0 ? 0 : mesoReleased / seeds,
        anyReleaseRate: seeds === 0 ? 0 : anyReleased / seeds,
        fullBeatRate: seeds === 0 ? 0 : fullBeat / seeds,
        coExtinctRate: seeds === 0 ? 0 : coExtinct / seeds,
        meanCollapseSeason: collapseSeasonCount === 0 ? null : collapseSeasonSum / collapseSeasonCount,
        meanCaught: seeds === 0 ? 0 : caught / seeds,
        mesoReleasedFormName: topMesoReleased ? nameOf(topMesoReleased[0]) : null,
        anyReleasedFormName: topAnyReleased ? nameOf(topAnyReleased[0]) : null,
        hasMesoPrey: mesoPreyIds.length > 0,
        mesoPreyFormNames: mesoPreyIds.map(nameOf),
        newApexRate: seeds === 0 ? 0 : newApexSeeds / seeds,
        newApexFormNames: [...newApexCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([id]) => nameOf(id)),
        sampleTopTrace,
        samplePreyTraces,
      });
    }
  }
  return out;
}
