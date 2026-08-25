/**
 * tools/harness/measure.ts — run the §10.5 modes and hand back the measurements.
 *
 * Split from the renderer on purpose: `tests/unit/harness.test.ts` asserts against these numbers,
 * and a test that had to read markdown to find out what the harness measured would be asserting
 * against prose.
 */

import { replayOvercatchFixture, type FixtureReplay } from "./fixture";
import {
  OVERCATCH_SHAPES,
  PLAY_PROFILES,
  PREY_READINGS,
  sweepOvercatch,
  summariseProfile,
  type OvercatchNodeSummary,
  type OvercatchShape,
  type PreyReading,
  type ProfileSummary,
} from "./full-run";
import {
  runAgeControl,
  runGymSim,
  runPartySizeControl,
  runLevelSweep,
  runMirrorControl,
  type AgeControlCell,
  type GymSimResult,
  type LevelSweepCell,
  type MirrorControl,
  type PartySizeControlCell,
} from "./gym-sim";
import { LEVEL_MODELS } from "./player";
import { runRoundRobin, type RoundRobinResult } from "./round-robin";
import { gymSeedsFor, type HarnessParams } from "./params";
import { probeDelta, type DeltaProbeResult, type DeltaProposal } from "./probe";
import type { LoadedContent } from "./content";
import type { AgeClass } from "../../core/types";

export interface HarnessMeasurements {
  params: HarnessParams;
  balancePath: string | null;
  /** Wall-clock milliseconds each mode took — a property of this machine, not of the game. */
  timingsMs: Record<string, number>;
  gym: GymSimResult[] | null;
  mirror: MirrorControl[] | null;
  levelSweep: { gap: number; cells: LevelSweepCell[] } | null;
  ageControl: AgeControlCell[] | null;
  partySizeControl: PartySizeControlCell[] | null;
  chart: RoundRobinResult | null;
  profiles: ProfileSummary[] | null;
  fixture: FixtureReplay | null;
  /** One entry per (prey reading × protocol shape); see tools/harness/full-run.ts. */
  overcatch: Array<{ reading: PreyReading; shape: OvercatchShape; nodes: OvercatchNodeSummary[] }> | null;
  /** Each suggested delta, applied to a copy of the balance file and re-measured (build-doc §10.5). */
  probes: DeltaProbeResult[];
}

/**
 * Build the candidate retunes from what was measured. Each magnitude is derived from the SHIPPED
 * value — a redistribution, a multiple, a bump of the acts that actually missed — so no new
 * gameplay constant is written anywhere (G11), and none of them is applied to data/balance.json.
 */
function buildProposals(loaded: LoadedContent, m: Omit<HarnessMeasurements, "probes">): DeltaProposal[] {
  const b = loaded.balance;
  const out: DeltaProposal[] = [];
  const trained = m.gym?.find((g) => g.model === "trained");
  const tooHard = trained?.gyms.filter((g) => g.bandMiss < 0) ?? [];

  if (tooHard.length > 0) {
    const w = b.encounter.ageWeights;
    const shift = w.J / 2;
    const proposed: Record<AgeClass, number> = {
      J: Number((w.J - shift).toFixed(2)),
      A: Number((w.A + shift * 0.75).toFixed(2)),
      E: Number((w.E + shift * 0.25).toFixed(2)),
    };
    out.push({ path: "encounter.ageWeights", from: { ...w }, to: proposed, probe: "gym", model: "trained" });

    const byYear = [...b.encounter.levelByYear];
    const gap = Math.max(
      1,
      (trained?.gyms[0]?.playerLevel ?? 0) - (m.gym?.find((g) => g.model === "untrained")?.gyms[0]?.playerLevel ?? 0),
    );
    const bumped = byYear.map((v, i) => (tooHard.some((g) => g.act === i + 1) ? v + Math.ceil(gap / 2) : v));
    if (bumped.some((v, i) => v !== byYear[i])) {
      out.push({ path: "encounter.levelByYear", from: byYear, to: bumped, probe: "gym", model: "untrained" });
    }
  }

  const ins = m.chart?.perStatCorrelation.find((c) => c.stat === "ins");
  if (ins && ins.r < 0) {
    // Instinct's only battle effect is crit chance (core/battle.ts `computeDamage`), so if buying it
    // costs win rate, the price of a point is the lever. Two multiples of the shipped value, because
    // one point on a curve is not a curve.
    for (const factor of [2, 5]) {
      out.push({
        path: "damage.critChancePerInstinct",
        from: b.damage.critChancePerInstinct,
        to: Number((b.damage.critChancePerInstinct * factor).toPrecision(3)),
        probe: "chart",
      });
    }
  }
  return out;
}

function timed<T>(timings: Record<string, number>, label: string, fn: () => T): T {
  const start = Date.now();
  const out = fn();
  timings[label] = Date.now() - start;
  return out;
}

export function measure(loaded: LoadedContent, params: HarnessParams): HarnessMeasurements {
  const timings: Record<string, number> = {};
  const wants = (mode: string): boolean => params.mode === "all" || params.mode === mode;

  const gym = wants("gym")
    ? timed(timings, "gym", () =>
        LEVEL_MODELS.map((model) =>
          runGymSim(loaded, gymSeedsFor(params, loaded.balance.harness.seeds), params.partyDrafts, model),
        ),
      )
    : null;

  const mirror = wants("gym")
    ? timed(timings, "gym.mirror", () =>
        runMirrorControl(loaded, gymSeedsFor(params, loaded.balance.harness.seeds)),
      )
    : null;

  const levelSweep = wants("gym")
    ? timed(timings, "gym.levelSweep", () =>
        runLevelSweep(loaded, gymSeedsFor(params, loaded.balance.harness.seeds), params.partyDrafts),
      )
    : null;

  const ageControl = wants("gym")
    ? timed(timings, "gym.ageControl", () =>
        runAgeControl(loaded, gymSeedsFor(params, loaded.balance.harness.seeds), params.partyDrafts),
      )
    : null;

  const partySizeControl = wants("gym")
    ? timed(timings, "gym.partySizeControl", () =>
        runPartySizeControl(loaded, gymSeedsFor(params, loaded.balance.harness.seeds), params.partyDrafts),
      )
    : null;

  const chart = wants("chart")
    ? timed(timings, "chart", () => runRoundRobin(loaded, params.chartSeeds))
    : null;

  let profiles: ProfileSummary[] | null = null;
  let fixture: FixtureReplay | null = null;
  let overcatch: HarnessMeasurements["overcatch"] = null;

  if (wants("run")) {
    profiles = timed(timings, "run.profiles", () =>
      PLAY_PROFILES.map((profile) => summariseProfile(loaded, profile, params.runSeeds)),
    );
    fixture = timed(timings, "run.fixture", () => replayOvercatchFixture(loaded));
    overcatch = timed(timings, "run.overcatch", () =>
      PREY_READINGS.flatMap((reading) =>
        OVERCATCH_SHAPES.map((shape) => ({
          reading,
          shape,
          nodes: sweepOvercatch(loaded, params.overcatchSeeds, reading, shape),
        })),
      ),
    );
  }

  const partial: Omit<HarnessMeasurements, "probes"> = {
    params,
    balancePath: loaded.balancePath,
    timingsMs: timings,
    gym,
    mirror,
    levelSweep,
    ageControl,
    partySizeControl,
    chart,
    profiles,
    fixture,
    overcatch,
  };

  const probes = timed(timings, "probes", () => {
    const budget = {
      gymSeeds: Math.max(8, Math.floor(gymSeedsFor(params, loaded.balance.harness.seeds) / 8)),
      chartSeeds: Math.max(4, Math.floor(params.chartSeeds / 4)),
      drafts: params.partyDrafts,
    };
    return buildProposals(loaded, partial).map((proposal) => probeDelta(loaded, proposal, budget));
  });

  return { ...partial, probes };
}
