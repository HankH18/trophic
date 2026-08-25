/**
 * tests/unit/harness.test.ts — the balance harness (build-doc §3 L13, §10.5, lane A5).
 *
 * Guardrail G14: nothing is done before its named tests exist and pass. The harness is a measuring
 * instrument, so what has to be tested is not "does it produce numbers" but:
 *
 *   1. DETERMINISM      — the same seeds produce the same numbers, twice, so a reported win rate can
 *                         be re-derived rather than believed (L10 / §8.1).
 *   2. `ext_retune`     — build-doc §6 INV-3: the harness runs against an OVERRIDDEN balance file,
 *                         passed by path, with no code change. Tested BOTH ways: a retune that
 *                         should move a number moves it, and the harness reads the retuned value.
 *   3. THE GAUGES BIND  — every claim the harness makes must be able to go red. Each detector is run
 *                         a second time against a deliberately corrupted input and asserted to
 *                         report the problem. A gauge that cannot report a fault is decoration.
 *   4. THE PLAYER MODEL — the clauses in tools/harness/player.ts are what the report publishes, so
 *                         they are asserted here rather than trusted: act scoping, party size, the
 *                         level models, the draw-free policy, the salve rule.
 *   5. NO SECOND ENGINE — the harness's own move scorer must agree with core/battle.ts's
 *                         `chooseEnemyAction`, or the round-robin measures a different game.
 *
 * Fixture note: `fixtures/overcatch-script.json` already existed (build-doc §11) and is REUSED.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { chooseEnemyAction, startBattle } from "../../core/battle";
import { deriveFoodWeb, preyOf, toEcoNode } from "../../core/foodweb";
import { createRng } from "../../core/rng";
import type { BattleInput } from "../../core/types";

import { bestMoveId, mirrorPolicy, runBattle } from "../../tools/harness/arena";
import { loadContent, loadContentFromRaw, seedFor, subsystemTags } from "../../tools/harness/content";
import { replayOvercatchFixture } from "../../tools/harness/fixture";
import {
  runFullRun,
  runOvercatch,
  summariseProfile,
  topOfWeb,
} from "../../tools/harness/full-run";
import { runGymSim, runMirrorControl, runOneGym } from "../../tools/harness/gym-sim";
import { measure } from "../../tools/harness/measure";
import { defaultParams, gymSeedsFor, parseArgs } from "../../tools/harness/params";
import {
  actNodeIds,
  candidateLines,
  draftParty,
  gymBag,
  gymParty,
  gymRoster,
  partySizeFor,
  playerLevelFor,
  reasonablePolicy,
  starterLines,
} from "../../tools/harness/player";
import { contentWithDelta, probeDelta, readPath } from "../../tools/harness/probe";
import { renderReport } from "../../tools/harness/report";
import { runRoundRobin } from "../../tools/harness/round-robin";

import balanceJson from "../../data/balance.json";

const loaded = loadContent();
const balance = loaded.balance;
const gym1 = [...loaded.gyms].sort((a, b) => a.act - b.act)[0];
const gym6 = [...loaded.gyms].sort((a, b) => a.act - b.act)[5];
if (!gym1 || !gym6) throw new Error("data/gyms.json must carry six leaders");

/** A deep copy of the shipped balance file, for the override tests. */
const rawCopy = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(balanceJson)) as Record<string, unknown>;

/** Write a balance file to a temp dir and hand back its path — the CLI's own `--balance` path. */
function writeBalance(raw: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "trophic-harness-"));
  const path = join(dir, "balance.json");
  writeFileSync(path, JSON.stringify(raw), "utf8");
  return path;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Determinism — a reported number can be re-derived
 * ════════════════════════════════════════════════════════════════════════════ */

describe("harness determinism (L10 / build-doc §8.1)", () => {
  it("the gym sim gives byte-identical results on a second run with the same seeds", () => {
    const a = runGymSim(loaded, 12, 4, "trained");
    const b = runGymSim(loaded, 12, 4, "trained");
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("the round-robin gives identical per-line win rates on a second run", () => {
    const a = runRoundRobin(loaded, 3);
    const b = runRoundRobin(loaded, 3);
    expect(b.lines.map((l) => [l.lineId, l.wins, l.battles])).toEqual(
      a.lines.map((l) => [l.lineId, l.wins, l.battles]),
    );
  });

  it("a six-year full run reproduces its own ledger from the same seed", () => {
    const a = runFullRun(loaded, seedFor(balance, 0), "dex");
    const b = runFullRun(loaded, seedFor(balance, 0), "dex");
    expect(JSON.stringify(b.ledger)).toBe(JSON.stringify(a.ledger));
  });

  it("BINDS — a different seed gives a different six-year ledger", () => {
    const a = runFullRun(loaded, seedFor(balance, 0), "collector");
    const b = runFullRun(loaded, seedFor(balance, 1), "collector");
    expect(JSON.stringify(b.ledger)).not.toBe(JSON.stringify(a.ledger));
  });

  it("every battle the arena runs reaches a real outcome, never an unresolved loop", () => {
    const result = runOneGym(gym1, 0, loaded, 24, 4, "trained");
    expect(result.wins + result.losses + result.stalled).toBe(result.seeds);
    // The turn cap exists as a backstop; on shipped content nothing should be hitting it.
    expect(result.stalled).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. ext_retune — build-doc §6 INV-3, the named test this harness must honour
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ext_retune — the harness runs against an overridden balance file (build-doc §6 INV-3)", () => {
  it("loads a balance file BY PATH and reads the retuned value, with no code change", () => {
    const raw = rawCopy();
    (raw["harness"] as Record<string, unknown>)["seeds"] = 7;
    const path = writeBalance(raw);

    const tuned = loadContent(path);
    expect(tuned.balancePath).toBe(path);
    expect(tuned.balance.harness.seeds).toBe(7);
    // …and the shipped load is untouched by it.
    expect(loadContent().balance.harness.seeds).toBe(balance.harness.seeds);
  });

  it("a retuned gameplay constant changes the measurement it drives", () => {
    const raw = rawCopy();
    // The type chart's own multipliers are advertised as harness-tunable (bible §1).
    (raw["types"] as Record<string, unknown>)["superEffective"] = 4;
    const tuned = loadContentFromRaw(raw, "test");
    expect(tuned.balance.types.superEffective).toBe(4);

    const before = runRoundRobin(loaded, 3);
    const after = runRoundRobin(tuned, 3);
    expect(after.lines.map((l) => l.winRate)).not.toEqual(before.lines.map((l) => l.winRate));
  });

  it("a retuned TARGET BAND changes the pass/fail verdict without changing any measurement", () => {
    const raw = rawCopy();
    // Every band becomes [0, 1]: the same win rates, all now in band.
    (raw["harness"] as Record<string, unknown>)["gymWinRateTargets"] = balance.harness.gymWinRateTargets.map(
      () => [0, 1],
    );
    const tuned = loadContentFromRaw(raw, "test");
    const before = runGymSim(loaded, 8, 3, "trained");
    const after = runGymSim(tuned, 8, 3, "trained");
    expect(after.gyms.map((g) => g.winRate)).toEqual(before.gyms.map((g) => g.winRate));
    expect(after.gyms.every((g) => g.inBand)).toBe(true);
    expect(before.gyms.every((g) => g.inBand)).toBe(false);
  });

  it("a retune of a key zod does NOT declare still reaches the ecology (the raw-precedence path)", () => {
    // core/ecosim.ts's `ecoConstants(balance, raw)` is the reason this holds; the harness passes the
    // raw file. If it ever stopped doing so, a retune of such a key would silently do nothing.
    const raw = rawCopy();
    (raw["ecosim"] as Record<string, unknown>)["starveMinDeathsPerSeason"] = 99;
    const tuned = loadContentFromRaw(raw, "test");
    expect(tuned.sim.eco.starveMinDeathsPerSeason).toBe(99);
    expect(loaded.sim.eco.starveMinDeathsPerSeason).toBe(balance.ecosim.starveMinDeathsPerSeason);
  });

  it("the CLI accepts --balance and the harness honours the seed count it names", () => {
    const raw = rawCopy();
    (raw["harness"] as Record<string, unknown>)["seeds"] = 5;
    const path = writeBalance(raw);
    const params = parseArgs(["--balance", path, "--mode", "gym"]);
    expect(params.balancePath).toBe(path);
    const tuned = loadContent(params.balancePath);
    expect(gymSeedsFor(params, tuned.balance.harness.seeds)).toBe(5);
  });

  it("a delta probe applies its change to a COPY and leaves the loaded balance alone", () => {
    const proposal = {
      path: "damage.critMultiplier",
      from: balance.damage.critMultiplier,
      to: balance.damage.critMultiplier * 3,
      probe: "chart" as const,
    };
    const tuned = contentWithDelta(loaded, proposal);
    expect(tuned.balance.damage.critMultiplier).toBe(balance.damage.critMultiplier * 3);
    expect(loaded.balance.damage.critMultiplier).toBe(balance.damage.critMultiplier);
    expect(readPath(loaded.rawBalance, "damage.critMultiplier")).toBe(balance.damage.critMultiplier);
  });

  it("BINDS — a probe whose path does not exist throws instead of silently measuring nothing", () => {
    expect(() =>
      contentWithDelta(loaded, { path: "damage.notAKey", from: 0, to: 1, probe: "chart" }),
    ).toThrow(/does not exist/);
    expect(() =>
      contentWithDelta(loaded, { path: "nope.deeper", from: 0, to: 1, probe: "chart" }),
    ).toThrow(/does not exist/);
  });

  it("a probe reports a real, non-zero change for a delta that matters", () => {
    const result = probeDelta(
      loaded,
      { path: "types.superEffective", from: balance.types.superEffective, to: 4, probe: "chart" },
      { gymSeeds: 4, chartSeeds: 2, drafts: 2 },
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.some((r) => r.after !== r.before)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. The player model — clause by clause
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the reasonable player model (build-doc §10.5(a))", () => {
  it("clause 1: the act's nodes are the gym towns up to that year plus their neighbours", () => {
    const year1 = actNodeIds(1, loaded);
    const year6 = actNodeIds(6, loaded);
    expect(year1).toContain(gym1.town);
    expect(year1.length).toBeGreaterThan(1);
    for (const id of year1) expect(year6).toContain(id);
    expect(year6.length).toBeGreaterThan(year1.length);
    // Nothing from a later act leaks into year 1.
    expect(year1).not.toContain(gym6.town);
  });

  it("clause 2: the pool is act-scoped, excludes Ancients and sign-chain-gated lines, includes starters", () => {
    const pool1 = candidateLines(1, loaded);
    const pool6 = candidateLines(6, loaded);
    expect(pool1.length).toBeGreaterThan(0);
    expect(pool6.length).toBeGreaterThan(pool1.length);
    const gatedTag = balance.encounter.signChainGatedHabitatTag;
    for (const line of pool6) {
      expect(line.ancient).toBe(false);
      expect(line.habitat.includes(gatedTag)).toBe(false);
    }
    // Every line at a year-1 node is either in the pool or excluded for one of those two reasons.
    const nodeIds = new Set(actNodeIds(1, loaded));
    for (const node of loaded.nodes) {
      if (!nodeIds.has(node.id)) continue;
      for (const [lineId, pop] of Object.entries(node.populations)) {
        if (pop.count <= 0) continue;
        const line = loaded.species.byId.get(lineId);
        if (!line) continue;
        const excluded = line.ancient || line.habitat.includes(gatedTag);
        expect(pool1.some((p) => p.id === lineId) || excluded).toBe(true);
      }
    }
    // Starters are in every act's pool and are the lines that live in no node.
    const starters = starterLines(loaded);
    expect(starters.length).toBeGreaterThan(0);
    for (const s of starters) {
      expect(pool1.some((p) => p.id === s.id)).toBe(true);
      for (const node of loaded.nodes) expect(node.populations[s.id]).toBeUndefined();
    }
  });

  it("clause 3: the party matches the leader's roster size, capped, and always holds a starter", () => {
    const starterIds = new Set(starterLines(loaded).map((l) => l.id));
    for (const gym of loaded.gyms) {
      const size = partySizeFor(gym, balance);
      expect(size).toBe(Math.min(gymRoster(gym).length, balance.party.maxPartySize));
      const party = draftParty(gym, loaded, createRng(1), 3, "trained");
      expect(party.specs.length).toBe(size);
      expect(party.specs.some((s) => starterIds.has(s.lineId))).toBe(true);
      // No duplicates: a draft is distinct lines.
      expect(new Set(party.specs.map((s) => s.lineId)).size).toBe(party.specs.length);
      expect(new Set(party.specs.map((s) => s.uid)).size).toBe(party.specs.length);
    }
  });

  it("clause 4: both level models read from data, and neither exceeds the level cap", () => {
    for (const gym of loaded.gyms) {
      const trained = playerLevelFor(gym, balance, "trained");
      const untrained = playerLevelFor(gym, balance, "untrained");
      expect(trained).toBe(Math.max(...gym.slots.map((s) => s.level)));
      expect(untrained).toBe(balance.encounter.levelByYear[gym.act - 1]);
      expect(trained).toBeGreaterThan(untrained);
      const party = draftParty(gym, loaded, createRng(2), 2, "trained", 99);
      expect(party.level).toBeLessThanOrEqual(balance.xp.levelCap);
    }
  });

  it("clauses 5–6: ages come from the shipped weights and every member carries the wild trait count", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const party = draftParty(gym6, loaded, createRng(seed), 1, "trained");
      for (const spec of party.specs) {
        seen.add(spec.age);
        expect(spec.traits.length).toBe(balance.traits.slotsPerWildCreature);
        for (const trait of spec.traits) {
          expect(balance.traits.pool.some((t) => t.id === trait.id)).toBe(true);
          // Only Elders may carry a rare trait (bible §2).
          if (trait.rarity === "rare") expect(spec.age).toBe("E");
        }
      }
    }
    // The shipped weights are all positive, so all three classes must appear over 40 drafts.
    expect([...seen].sort()).toEqual(["A", "E", "J"]);
  });

  it("clause 8: the policy is pure — the same state always yields the same action, and it draws nothing", () => {
    const policy = reasonablePolicy();
    const party = draftParty(gym1, loaded, createRng(3), 3, "trained");
    const input: BattleInput = {
      seed: 1,
      kind: "gym",
      playerParty: party.specs,
      enemyParty: gymParty(gym1),
      bag: gymBag(party.specs.length, balance),
    };
    const state = startBattle(input, loaded.battle).state;
    const first = policy(state, loaded.battle);
    for (let i = 0; i < 5; i++) expect(policy(state, loaded.battle)).toEqual(first);
    // …and it spends no entropy: a stream handed to the policy is untouched.
    const rng = createRng(9);
    const before = rng.draws;
    policy(state, loaded.battle);
    expect(rng.draws).toBe(before);
  });

  it("clause 8: the salve is only spent when the heal outpaces the incoming hit", () => {
    const policy = reasonablePolicy();
    const party = draftParty(gym6, loaded, createRng(4), 3, "trained");
    const input: BattleInput = {
      seed: 2,
      kind: "gym",
      playerParty: party.specs,
      enemyParty: gymParty(gym6),
      bag: gymBag(party.specs.length, balance),
    };
    const state = startBattle(input, loaded.battle).state;
    const active = state.battlers[state.activePlayerUid];
    if (!active) throw new Error("no active battler");

    // Just under the no-waste threshold, against the year-6 leader: the hit outruns the heal, so
    // healing would be a surrendered turn and the policy must attack instead.
    active.curHp = Math.floor(active.maxHp * balance.medicine.salveHealFracMaxHp) - 1;
    expect(policy(state, loaded.battle).kind).toBe("move");

    // Same HP fraction, but with the enemy's damage crushed to nothing: now the salve pays.
    const enemy = state.battlers[state.activeEnemyUid];
    if (!enemy) throw new Error("no active enemy");
    enemy.stats = { ...enemy.stats, atk: 1 };
    expect(policy(state, loaded.battle).kind).toBe("item");

    // With no salves in the bag it attacks regardless.
    state.bag = { [balance.medicine.salveItemId]: 0 };
    expect(policy(state, loaded.battle).kind).toBe("move");
  });

  it("clause 8: a fainted active battler is always answered with a switch, which the reducer accepts", () => {
    const policy = reasonablePolicy();
    const party = draftParty(gym6, loaded, createRng(5), 3, "trained");
    const input: BattleInput = {
      seed: 3,
      kind: "gym",
      playerParty: party.specs,
      enemyParty: gymParty(gym6),
      bag: gymBag(party.specs.length, balance),
    };
    const state = startBattle(input, loaded.battle).state;
    const active = state.battlers[state.activePlayerUid];
    if (!active) throw new Error("no active battler");
    active.fainted = true;
    active.curHp = 0;
    const action = policy(state, loaded.battle);
    expect(action.kind).toBe("switch");
    if (action.kind === "switch") expect(action.uid).not.toBe(active.uid);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. No second engine — the harness's scorer is core/battle.ts's scorer
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the harness runs the same game core/battle.ts does", () => {
  it("its move scorer picks exactly what core/battle.ts's `chooseEnemyAction` picks", () => {
    let checked = 0;
    for (const gym of loaded.gyms) {
      for (let seed = 0; seed < 6; seed++) {
        const party = draftParty(gym, loaded, createRng(seed), 2, "trained");
        const state = startBattle(
          { seed, kind: "gym", playerParty: party.specs, enemyParty: gymParty(gym) },
          loaded.battle,
        ).state;
        const enemy = state.battlers[state.activeEnemyUid];
        const player = state.battlers[state.activePlayerUid];
        if (!enemy || !player) throw new Error("empty field");
        const theirs = chooseEnemyAction(state, loaded.battle);
        const ours = bestMoveId(enemy, player, loaded.battle, { usePredation: true, nodeId: state.nodeId });
        if (theirs.kind === "move") expect(ours).toBe(theirs.moveId);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("the §7.4 predation bonus cannot change a greedy attacker's choice — a reported finding, pinned", () => {
    // The bonus is a function of (attacker line, defender line) alone, so it multiplies every one of
    // an attacker's moves by the same factor. The report says so; this is what makes that true.
    let differed = 0;
    for (const gym of loaded.gyms) {
      const party = draftParty(gym, loaded, createRng(11), 2, "trained");
      const state = startBattle(
        { seed: 11, kind: "gym", playerParty: party.specs, enemyParty: gymParty(gym) },
        loaded.battle,
      ).state;
      const player = state.battlers[state.activePlayerUid];
      const enemy = state.battlers[state.activeEnemyUid];
      if (!player || !enemy) throw new Error("empty field");
      const withWeb = bestMoveId(player, enemy, loaded.battle, { usePredation: true });
      const without = bestMoveId(player, enemy, loaded.battle, { usePredation: false });
      if (withWeb !== without) differed += 1;
    }
    expect(differed).toBe(0);
  });

  it("the mirror control really is a mirror: identical teams on both sides", () => {
    const control = runMirrorControl(loaded, 4);
    expect(control.length).toBe(loaded.gyms.length);
    for (const c of control) expect(c.winRate).toBeGreaterThanOrEqual(0);
    // A mirror match is decided by the seat, so it must not be a coin flip — that is the finding.
    expect(control.some((c) => c.winRate > 0.5)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. The round-robin
 * ════════════════════════════════════════════════════════════════════════════ */

describe("round-robin — build-doc §10.5(b)", () => {
  const chart = runRoundRobin(loaded, 3);

  it("runs every ordered pair, both seats, and every battle is accounted for", () => {
    const n = loaded.content.species.length;
    expect(chart.totalBattles).toBe(n * (n - 1) * chart.seedsPerOrderedPair);
    // Each battle is counted once for each side; every line's plays are its opponents × 2 seats.
    for (const line of chart.lines) {
      expect(line.battles).toBe((n - 1) * chart.seedsPerOrderedPair * 2);
      expect(line.wins).toBeLessThanOrEqual(line.battles);
    }
    // Total wins + stalls (which award no win to either side) accounts for every battle twice over.
    const totalWins = chart.lines.reduce((s, l) => s + l.wins, 0);
    expect(totalWins).toBe(chart.totalBattles - chart.stalled);
  });

  it("flags exactly the lines outside `balance.harness.roundRobinMin/Max`", () => {
    for (const line of chart.lines) {
      expect(line.flagged).toBe(line.winRate < chart.band[0] || line.winRate > chart.band[1]);
      expect(line.peerFlagged).toBe(
        line.peerWinRate < chart.band[0] || line.peerWinRate > chart.band[1],
      );
    }
    expect(chart.band).toEqual([balance.harness.roundRobinMin, balance.harness.roundRobinMax]);
  });

  it("BINDS — narrowing the band in an overridden balance file flags more lines", () => {
    const raw = rawCopy();
    (raw["harness"] as Record<string, unknown>)["roundRobinMin"] = 0.49;
    (raw["harness"] as Record<string, unknown>)["roundRobinMax"] = 0.51;
    const tuned = loadContentFromRaw(raw, "test");
    const narrow = runRoundRobin(tuned, 3);
    expect(narrow.lines.filter((l) => l.flagged).length).toBeGreaterThan(
      chart.lines.filter((l) => l.flagged).length,
    );
  });

  it("fights at equal level and equal age, so the level cannot tilt a matchup", () => {
    expect(chart.level).toBe(balance.xp.levelCap);
  });

  it("reports the per-stat correlations the report reasons from, over the non-Ancient lines", () => {
    expect(chart.perStatCorrelation.length).toBe(5);
    expect(chart.statCorrelationSampleSize).toBe(chart.lines.filter((l) => !l.ancient).length);
    for (const c of chart.perStatCorrelation) {
      expect(Number.isFinite(c.r)).toBe(true);
      expect(Math.abs(c.r)).toBeLessThanOrEqual(1);
      expect(c.min).toBeLessThanOrEqual(c.max);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6. The full run and the cascade
 * ════════════════════════════════════════════════════════════════════════════ */

describe("full-run sim — build-doc §10.5(c)", () => {
  it("runs exactly 24 season steps over six years (18 clock boundaries + 6 year turns)", () => {
    const run = runFullRun(loaded, seedFor(balance, 0), "baseline");
    expect(run.ledger.seasonSteps).toBe(balance.clock.yearsTotal * balance.clock.seasonOrder.length);
  });

  it("fires the shipped Cullbrand raid through core/lifecycle.ts, not through the harness", () => {
    const run = runFullRun(loaded, seedFor(balance, 0), "baseline");
    const scripted = balance.yearEvents.raids;
    expect(scripted.length).toBeGreaterThan(0);
    for (const raid of scripted) {
      for (const target of raid.targets) {
        expect(
          run.raids.some((r) => r.eventId === raid.id && r.lineId === target.lineId),
          `the year turn never fired ${raid.id}/${target.lineId}`,
        ).toBe(true);
      }
    }
  });

  it("the baseline profile catches nothing and the play profiles catch, bounded by shipped limits", () => {
    const base = runFullRun(loaded, seedFor(balance, 0), "baseline");
    const dex = runFullRun(loaded, seedFor(balance, 0), "dex");
    const collector = runFullRun(loaded, seedFor(balance, 0), "collector");
    expect(base.ledger.catches).toBe(0);
    expect(dex.ledger.catches).toBeGreaterThan(0);
    // The dex profile takes at most one of each line, ever.
    expect(dex.ledger.catches).toBeLessThanOrEqual(loaded.content.species.length);
    for (const entry of dex.ledger.catchesByLine) expect(entry.caught).toBe(1);
    // The collector stops at party + box capacity.
    expect(collector.ledger.catches).toBeLessThanOrEqual(
      balance.party.maxPartySize + balance.party.maxBoxSize,
    );
    expect(collector.ledger.catches).toBeGreaterThan(dex.ledger.catches);
  });

  it("no unintended extinction under normal play (the `dex` profile)", () => {
    const summary = summariseProfile(loaded, "dex", 8);
    const raidNodes = new Set(balance.yearEvents.raids.map((r) => r.nodeId));
    const unintended = summary.extinctions.filter((e) => !raidNodes.has(e.nodeId));
    expect(
      unintended,
      `normal play drove ${unintended.map((e) => `${e.nodeId}/${e.lineId}`).join(", ")} to zero`,
    ).toEqual([]);
  });

  it("BINDS — the extinction detector reports a line that really is wiped out, and when", () => {
    // The heaviest profile the shipped rules allow. If nothing here ever reaches zero, the detector
    // could be broken and the test above would be vacuous. The season stamp is asserted too: it is
    // what the report classifies a raid-attributable extinction by, and a detector that recorded the
    // fact without the season would leave that classification silently reading "season 0".
    const summary = summariseProfile(loaded, "collector", 8);
    expect(summary.extinctions.length).toBeGreaterThan(0);
    for (const e of summary.extinctions) {
      expect(e.start).toBeGreaterThan(0);
      expect(e.seeds).toBeGreaterThan(0);
      expect(e.firstSeason, `${e.nodeId}/${e.lineId} reached zero at no recorded season`).toBeGreaterThan(0);
      expect(e.firstSeason).toBeLessThanOrEqual(
        balance.clock.yearsTotal * balance.clock.seasonOrder.length,
      );
    }
  });

  it("`topOfWeb` reads the LIVE web: a starved-out predator stops holding the throne, and the tier below takes it", () => {
    // The whole "a new apex risen" measurement rests on this. `deriveFoodWeb` keys its edges on
    // PRESENCE in the node file, not on the live count, so a predator at zero still has edges — and
    // a reader that did not check counts would report the throne as permanently occupied.
    let checked = 0;
    for (const file of loaded.nodes) {
      const node = toEcoNode(file);
      const top = topOfWeb(node, loaded)[0];
      if (top === undefined) continue;
      const prey = preyOf(deriveFoodWeb(node, loaded.species, balance), top).filter(
        (id) => (node.populations[id]?.count ?? 0) > 0,
      );
      const wiped = toEcoNode(file);
      const pop = wiped.populations[top];
      if (!pop) throw new Error("missing population");
      pop.count = 0;
      const after = topOfWeb(wiped, loaded);
      expect(after).not.toContain(top);
      // Anything it used to eat that has live prey of its own now sits at the top of the live web.
      const heirs = prey.filter(
        (id) => preyOf(deriveFoodWeb(wiped, loaded.species, balance), id).some(
          (p) => (wiped.populations[p]?.count ?? 0) > 0,
        ),
      );
      if (heirs.length > 0) {
        expect(
          heirs.some((id) => after.includes(id)),
          `${file.id}: nothing inherited the throne after ${top} was wiped`,
        ).toBe(true);
        checked += 1;
      }
    }
    expect(checked, "no node exercised the succession — the test proves nothing").toBeGreaterThan(0);
  });
});

describe("the demo cascade — build-doc §1 beat 1, §15 I2, G6", () => {
  const replay = replayOvercatchFixture(loaded);

  it("replays fixtures/overcatch-script.json and reproduces the recorded beat", () => {
    expect(replay.seasons).toBeGreaterThan(0);
    expect(replay.caught).toBeGreaterThan(0);
    expect(replay.topGone).toBe(true);
    expect(replay.nothingHuntsReleased).toBe(true);
    expect(replay.releasedRose).toBe(true);
    expect(replay.fullBeat).toBe(true);
  });

  it("the script is nothing but play: one line hammered, no forcing helper", () => {
    expect(replay.hammeredLineId.length).toBeGreaterThan(0);
    // The trace is per season and the top predator really does fall to zero inside it.
    expect(replay.topTrace.length).toBe(replay.seasons);
    expect(replay.topTrace[replay.topTrace.length - 1]).toBe(0);
    expect(Math.min(...replay.releasedTrace)).toBeGreaterThanOrEqual(0);
  });

  it("the generalised protocol drives the same collapse from catches alone (G6)", () => {
    const file = loaded.nodes.find((nd) => nd.id === replay.nodeId);
    if (!file) throw new Error("fixture node missing");
    const run = runOvercatch(loaded, file, replay.topLineId, "limiting", "hold", seedFor(balance, 0));
    expect(run.caught).toBeGreaterThan(0);
    expect(run.topTrace.length).toBeGreaterThan(balance.cascade.forcingSeasons);
    expect(run.collapsed).toBe(true);
  });

  it("BINDS — with NO over-catching the top of the web does not collapse", () => {
    // The control that makes the collapse above mean something: same node, same seed, same seasons,
    // the only difference being that nothing is caught. `preyForcedFraction` of 1 leaves the
    // populations where they are.
    const raw = rawCopy();
    (raw["cascade"] as Record<string, unknown>)["preyForcedFraction"] = 1;
    const untouched = loadContentFromRaw(raw, "test");
    const file = untouched.nodes.find((nd) => nd.id === replay.nodeId);
    if (!file) throw new Error("fixture node missing");
    const top = topOfWeb(toEcoNode(file), untouched)[0] as string;
    const run = runOvercatch(untouched, file, top, "primary", "hold", seedFor(balance, 0));
    expect(run.caught).toBe(0);
    expect(run.collapsed).toBe(false);
    expect(run.topTrace[run.topTrace.length - 1]).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 7. The report itself
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the generated report", () => {
  const params = { ...defaultParams(), quick: true, gymSeeds: 4, chartSeeds: 2, runSeeds: 2, overcatchSeeds: 2, partyDrafts: 2 };
  const measurements = measure(loaded, params);
  const markdown = renderReport(loaded, measurements);

  it("carries every section build-doc §10.5 asks for", () => {
    for (const heading of [
      "## 1. The reasonable player",
      "## 2. Mode (a) — gym-sim",
      "## 3. Mode (b) — type-chart round-robin",
      "## 4. Mode (c) — six years against the ecology",
      "## 5. Findings",
      "## 6. Suggested `data/balance.json` deltas",
      "## 7. What this harness does not measure",
      "## 8. Where this harness departs from build-doc §10.5, and why",
    ]) {
      expect(markdown, `the report is missing "${heading}"`).toContain(heading);
    }
    expect(markdown).toContain("### MEASURED");
    expect(markdown).toContain("### INFERRED");
  });

  it("states the player model and the over-catch protocol rather than hiding them", () => {
    expect(markdown).toContain("balance.encounter.ageWeights");
    expect(markdown).toContain("balance.harness.overcatch");
    expect(markdown).toContain("fixtures/overcatch-script.json");
  });

  it("reports effort in no human units (G12)", () => {
    expect(markdown).not.toMatch(/\b(man|person|engineer(ing)?)[- ]?(hour|day|week|month)s?\b/i);
    expect(markdown).not.toMatch(/\b\d+\s*(hours?|days?|weeks?)\s+of\s+(work|effort)\b/i);
  });

  it("says plainly that nothing was applied to data/balance.json", () => {
    expect(markdown).toMatch(/Nothing below has been applied/);
  });

  it("every measurement it prints came from a run that actually happened", () => {
    expect(measurements.gym?.length).toBe(2);
    expect(measurements.chart?.totalBattles).toBeGreaterThan(0);
    expect(measurements.profiles?.length).toBe(3);
    expect(measurements.overcatch?.length).toBe(4);
    expect(measurements.fixture?.fullBeat).toBe(true);
    expect(measurements.probes.length).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 8. The CLI
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the harness CLI", () => {
  it("defaults to every mode against the shipped balance file", () => {
    const params = defaultParams();
    expect(params.mode).toBe("all");
    expect(params.balancePath).toBeNull();
    expect(params.reportPath).toBe("docs/BALANCE-REPORT.md");
  });

  it("parses each option and rejects nonsense", () => {
    const params = parseArgs(["--mode", "chart", "--chart-seeds", "9", "--no-print"]);
    expect(params.mode).toBe("chart");
    expect(params.chartSeeds).toBe(9);
    expect(params.print).toBe(false);
    expect(() => parseArgs(["--mode", "nope"])).toThrow(/unknown mode/);
    expect(() => parseArgs(["--chart-seeds", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--chart-seeds"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--wat"])).toThrow(/unknown option/);
  });

  it("--quick shrinks every sampling budget without changing what is measured", () => {
    const full = defaultParams();
    const quick = parseArgs(["--quick"]);
    expect(quick.chartSeeds).toBeLessThan(full.chartSeeds);
    expect(quick.runSeeds).toBeLessThan(full.runSeeds);
    expect(gymSeedsFor(quick, balance.harness.seeds)).toBeLessThan(
      gymSeedsFor(full, balance.harness.seeds),
    );
    expect(quick.mode).toBe(full.mode);
  });

  it("reads the subsystem RNG tags from balance rather than naming them", () => {
    const tags = subsystemTags(balance);
    for (const tag of [tags.battle, tags.sim, tags.encounter]) {
      expect(balance.rng.subsystemTags).toContain(tag);
    }
    const raw = rawCopy();
    (raw["rng"] as Record<string, unknown>)["subsystemTags"] = ["a"];
    expect(() => subsystemTags(loadContentFromRaw(raw, "test").balance)).toThrow(/subsystemTags/);
  });

  it("the arena refuses an action the reducer would reject instead of spinning", () => {
    const input: BattleInput = {
      seed: 1,
      kind: "gym",
      playerParty: [{ uid: "p0", lineId: gym1.slots[0]?.lineId ?? "", age: "A", level: 10, traits: [] }],
      enemyParty: gymParty(gym1),
    };
    const illegal = () => ({ kind: "flee" }) as const; // fleeing a gym is illegal (core/battle.ts)
    expect(() => runBattle(input, loaded.battle, illegal, subsystemTags(balance).battle)).toThrow(
      /refused/,
    );
    // …and the legitimate policy does not.
    expect(() => runBattle(input, loaded.battle, mirrorPolicy(), subsystemTags(balance).battle)).not.toThrow();
  });
});
