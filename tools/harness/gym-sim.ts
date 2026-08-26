/**
 * tools/harness/gym-sim.ts — §10.5 mode (a).
 *
 * "gym-sim — a scripted 'reasonable player' party per year vs each gym roster, 500 seeds, report
 * win rate (targets: gyms 1–2 ∈ [80,95]%, 3–4 ∈ [60,80]%, 5–6 ∈ [45,65]%)."
 *
 * The seed count and the six target bands are read from `balance.harness` — they are claims about
 * the game and live in data (G11 / INV-3). The player model is tools/harness/player.ts, stated in
 * full there and reprinted in the report.
 *
 * A seed decides the whole run: the party draft, the ages, the traits AND the battle stream. Two
 * harness runs at the same seed therefore produce the same battle, and a reported win rate can be
 * re-derived rather than believed.
 */

import { createRng } from "../../core/rng";
import { AGE_CLASSES } from "../../core/types";
import type { AgeClass, BattleInput, GymLeader } from "../../core/types";
import { runBattle, STALLED } from "./arena";
import { seedFor, subsystemTags, type LoadedContent } from "./content";
import {
  draftParty,
  gymBag,
  gymParty,
  gymRoster,
  playerLevelFor,
  reasonablePolicy,
  type LevelModel,
} from "./player";

export interface GymOutcome {
  gymId: string;
  gymName: string;
  /** The leader's ACT (data/gyms.json `act`) — a story rung, never a calendar year. */
  act: number;
  town: string;
  /** The leader's declared type, or "mixed" (bible §7). */
  type: string;
  rosterSize: number;
  /** Highest level on the leader's team (the signature). */
  topLevel: number;
  playerLevel: number;
  partySize: number;
  seeds: number;
  wins: number;
  losses: number;
  stalled: number;
  winRate: number;
  /** `balance.harness.gymWinRateTargets[gym index]`. */
  band: [number, number];
  inBand: boolean;
  /** Signed distance to the nearest edge of the band; 0 when inside it. */
  bandMiss: number;
  meanTurns: number;
  /** Mean number of the leader's creatures the drafted party could hit super-effectively. */
  meanCoverage: number;
  /** How often each line was fielded across the seeds — what a "reasonable party" actually was. */
  lineUsage: Array<{ lineId: string; formName: string; drafted: number }>;
}

export interface GymSimResult {
  model: LevelModel;
  seeds: number;
  gyms: GymOutcome[];
}

function bandFor(balance: LoadedContent["balance"], index: number): [number, number] {
  const targets = balance.harness.gymWinRateTargets;
  const band = targets[index] ?? targets[targets.length - 1];
  if (!band) {
    throw new Error(
      "tools/harness: balance.harness.gymWinRateTargets is empty — build-doc §10.5's win-rate " +
        "bands are a claim about the game and live in data/balance.json",
    );
  }
  return band;
}

function missBy(rate: number, band: [number, number]): number {
  if (rate < band[0]) return rate - band[0];
  if (rate > band[1]) return rate - band[1];
  return 0;
}

/** One gym, `seeds` times. */
export function runOneGym(
  gym: GymLeader,
  index: number,
  loaded: LoadedContent,
  seeds: number,
  drafts: number,
  model: LevelModel,
  levelOffset = 0,
  forcedAge?: AgeClass,
  forcedSize?: number,
): GymOutcome {
  const balance = loaded.balance;
  const tags = subsystemTags(balance);
  const enemy = gymParty(gym);
  const roster = gymRoster(gym);
  const topLevel = roster.reduce((best, slot) => Math.max(best, slot.level), 1);
  const policy = reasonablePolicy();

  let wins = 0;
  let losses = 0;
  let stalled = 0;
  let turns = 0;
  let coverage = 0;
  let playerLevel = 0;
  let partySize = 0;
  const usage = new Map<string, number>();

  for (let i = 0; i < seeds; i++) {
    const seed = seedFor(balance, i);
    // The party is drafted on its OWN stream so that changing the number of battle draws (a longer
    // fight, a different move) cannot move which party the next seed fields.
    const party = draftParty(gym, loaded, createRng(seed), drafts, model, levelOffset, forcedAge, forcedSize);
    playerLevel = party.level;
    partySize = party.specs.length;
    coverage += party.coverage;
    for (const lineId of party.lineIds) usage.set(lineId, (usage.get(lineId) ?? 0) + 1);

    const input: BattleInput = {
      seed,
      kind: "gym",
      playerParty: party.specs,
      enemyParty: enemy,
      bag: gymBag(party.specs.length, balance),
    };
    const result = runBattle(input, loaded.battle, policy, tags.battle);
    turns += result.turns;
    if (result.outcome === "win") wins += 1;
    else if (result.outcome === STALLED) stalled += 1;
    else losses += 1;
  }

  const winRate = seeds === 0 ? 0 : wins / seeds;
  const band = bandFor(balance, index);
  return {
    gymId: gym.id,
    gymName: gym.name,
    act: gym.act,
    town: gym.town,
    type: gym.type,
    rosterSize: roster.length,
    topLevel,
    playerLevel,
    partySize,
    seeds,
    wins,
    losses,
    stalled,
    winRate,
    band,
    inBand: winRate >= band[0] && winRate <= band[1],
    bandMiss: missBy(winRate, band),
    meanTurns: seeds === 0 ? 0 : turns / seeds,
    meanCoverage: seeds === 0 ? 0 : coverage / seeds,
    lineUsage: [...usage.entries()]
      .map(([lineId, drafted]) => ({
        lineId,
        formName: loaded.species.byId.get(lineId)?.formNames.A ?? lineId,
        drafted,
      }))
      .sort((a, b) => b.drafted - a.drafted || a.lineId.localeCompare(b.lineId)),
  };
}

export function runGymSim(
  loaded: LoadedContent,
  seeds: number,
  drafts: number,
  model: LevelModel,
): GymSimResult {
  const gyms = [...loaded.gyms].sort((a, b) => a.act - b.act);
  return {
    model,
    seeds,
    gyms: gyms.map((gym, i) => runOneGym(gym, i, loaded, seeds, drafts, model)),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The age control
 *
 * `balance.encounter.ageWeights` (J 0.5 / A 0.4 / E 0.1) is a balance.json key, so what it is worth
 * in win rate is an INV-3-legal delta. This runs the same drafts with every member forced to one age
 * class, which prices the term exactly.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AgeControlCell {
  gymId: string;
  age: AgeClass;
  winRate: number;
}

export function runAgeControl(loaded: LoadedContent, seeds: number, drafts: number): AgeControlCell[] {
  const gyms = [...loaded.gyms].sort((a, b) => a.act - b.act);
  const out: AgeControlCell[] = [];
  gyms.forEach((gym, i) => {
    for (const age of AGE_CLASSES) {
      out.push({
        gymId: gym.id,
        age,
        winRate: runOneGym(gym, i, loaded, seeds, drafts, "trained", 0, age).winRate,
      });
    }
  });
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The party-size control
 *
 * Clause 3 fields as many creatures as the leader does — a fair-fight convention, and an
 * understatement for the early gyms, where the real game lets the player bring six against four.
 * This prices that: same drafts, same levels, party forced to `balance.party.maxPartySize`.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PartySizeControlCell {
  gymId: string;
  partySize: number;
  winRate: number;
}

export function runPartySizeControl(
  loaded: LoadedContent,
  seeds: number,
  drafts: number,
): PartySizeControlCell[] {
  const full = loaded.balance.party.maxPartySize;
  return [...loaded.gyms]
    .sort((a, b) => a.act - b.act)
    .map((gym, i) => {
      const outcome = runOneGym(gym, i, loaded, seeds, drafts, "trained", 0, undefined, full);
      return { gymId: gym.id, partySize: outcome.partySize, winRate: outcome.winRate };
    });
}

/* ────────────────────────────────────────────────────────────────────────────
 * The seat control
 *
 * Field the LEADER'S OWN TEAM on the player's side against the leader. Identical creatures,
 * identical levels, identical ages, identical traits, and the same move policy on both sides — so
 * anything other than a coin flip is worth exactly what the PLAYER'S SEAT is worth. Without this
 * control every win rate above is uninterpretable: a 50% result could be a fair fight or a badly
 * outmatched player rescued by a structural advantage.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface MirrorControl {
  gymId: string;
  gymName: string;
  seeds: number;
  winRate: number;
}

export function runMirrorControl(loaded: LoadedContent, seeds: number): MirrorControl[] {
  const tags = subsystemTags(loaded.balance);
  const policy = reasonablePolicy();
  return [...loaded.gyms]
    .sort((a, b) => a.act - b.act)
    .map((gym) => {
      const enemy = gymParty(gym);
      const player = enemy.map((spec, i) => ({ ...spec, uid: `p${i}` }));
      let wins = 0;
      for (let i = 0; i < seeds; i++) {
        const seed = seedFor(loaded.balance, i);
        const result = runBattle(
          { seed, kind: "gym", playerParty: player, enemyParty: enemy, bag: gymBag(player.length, loaded.balance) },
          loaded.battle,
          policy,
          tags.battle,
        );
        if (result.outcome === "win") wins += 1;
      }
      return { gymId: gym.id, gymName: gym.name, seeds, winRate: seeds === 0 ? 0 : wins / seeds };
    });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Level sensitivity
 *
 * The one lever inside data/balance.json that moves how strong a player is at act N is
 * `encounter.levelByYear` — the level the region's wild population sits at, which is where a
 * caught team starts. The gym's own levels are CONTENT (data/gyms.json `_levels`), so a "make gym 3
 * easier" delta that stays inside INV-3 has to come from the player's side.
 *
 * The sweep is expressed in units of the SHIPPED GAP between the two level models
 * (trained − untrained, which is 4 on shipped data), so it stays meaningful if either is retuned.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface LevelSweepCell {
  gymId: string;
  offsetSteps: number;
  levels: number;
  playerLevel: number;
  winRate: number;
  inBand: boolean;
}

export const SWEEP_STEPS = [-1, 0, 1, 2] as const;

export function runLevelSweep(
  loaded: LoadedContent,
  seeds: number,
  drafts: number,
): { gap: number; cells: LevelSweepCell[] } {
  const balance = loaded.balance;
  const gyms = [...loaded.gyms].sort((a, b) => a.act - b.act);
  const first = gyms[0];
  const gap =
    first === undefined
      ? 1
      : Math.max(1, playerLevelFor(first, balance, "trained") - playerLevelFor(first, balance, "untrained"));
  const cells: LevelSweepCell[] = [];
  gyms.forEach((gym, i) => {
    for (const steps of SWEEP_STEPS) {
      const outcome = runOneGym(gym, i, loaded, seeds, drafts, "trained", steps * gap);
      cells.push({
        gymId: gym.id,
        offsetSteps: steps,
        levels: steps * gap,
        playerLevel: outcome.playerLevel,
        winRate: outcome.winRate,
        inBand: outcome.inBand,
      });
    }
  });
  return { gap, cells };
}
