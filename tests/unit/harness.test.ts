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

import { chooseEnemyAction, makeBattler, movesKnownAt, startBattle, typeMultiplier } from "../../core/battle";
import { deriveFoodWeb, preyOf, toEcoNode, webRole } from "../../core/foodweb";
import { createRng } from "../../core/rng";
import { AGE_CLASSES } from "../../core/types";
import type { AgeClass, BattleInput, GymLeader, GymTeamSlot, SpeciesLine, Trait } from "../../core/types";

import { bestMoveId, mirrorPolicy, runBattle } from "../../tools/harness/arena";
import { loadContent, loadContentFromRaw, seedFor, subsystemTags } from "../../tools/harness/content";
import { replayOvercatchFixture } from "../../tools/harness/fixture";
import {
  CATCH_PROFILES,
  OVERCATCH_SHAPES,
  PLAY_PROFILES,
  PREY_READINGS,
  RAID_POLICIES,
  raidSuppressedContent,
  runFullRun,
  runOvercatch,
  summariseProfile,
  sweepOvercatch,
  topOfWeb,
  type OvercatchRun,
  type OvercatchShape,
  type PreyReading,
  type ProfileSummary,
  type RunSpec,
} from "../../tools/harness/full-run";
import { runGymSim, runMirrorControl, runOneGym } from "../../tools/harness/gym-sim";
import { measure } from "../../tools/harness/measure";
import { defaultParams, gymSeedsFor, parseArgs } from "../../tools/harness/params";
import {
  aceLevelFor,
  actNodeIds,
  candidateLines,
  coverageScore,
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
import { attributeExtinction, renderReport } from "../../tools/harness/report";
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

  it("a six-year full run reproduces its own survey from the same seed", () => {
    const a = runFullRun(loaded, seedFor(balance, 0), "dex");
    const b = runFullRun(loaded, seedFor(balance, 0), "dex");
    expect(JSON.stringify(b.survey)).toBe(JSON.stringify(a.survey));
  });

  it("BINDS — a different seed gives a different six-year survey", () => {
    const a = runFullRun(loaded, seedFor(balance, 0), "collector");
    const b = runFullRun(loaded, seedFor(balance, 1), "collector");
    expect(JSON.stringify(b.survey)).not.toBe(JSON.stringify(a.survey));
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
      // TRAINED is the leader's rank and file — EXCEPT under the ceiling clause, where a leader
      // whose ace stands on `balance.xp.levelCap` is fought AT the cap, because nothing exists
      // above that ceiling for the player to have stopped short of. The assertion is not looser
      // than the one it replaces: it pins BOTH arms of the clause, and the arm that fires is
      // decided by shipped data rather than by a gym id (T-13).
      const rankAndFile = Math.max(...gym.slots.map((s) => s.level));
      const atCeiling = aceLevelFor(gym) >= balance.xp.levelCap;
      expect(trained).toBe(atCeiling ? balance.xp.levelCap : rankAndFile);
      expect(untrained).toBe(balance.encounter.levelByYear[gym.act - 1]);
      expect(trained).toBeGreaterThan(untrained);
      const party = draftParty(gym, loaded, createRng(2), 2, "trained", 99);
      expect(party.level).toBeLessThanOrEqual(balance.xp.levelCap);
    }
    // Shipped data must exercise both arms, or the clause above is only half tested.
    const ceilingGyms = loaded.gyms.filter((g) => aceLevelFor(g) >= balance.xp.levelCap);
    expect(ceilingGyms.length).toBeGreaterThan(0);
    expect(ceilingGyms.length).toBeLessThan(loaded.gyms.length);
  });

  it("clause 4 ceiling: a leader whose ace stands on the level cap is measured AT the cap, not under it", () => {
    // The defect this pins (T-13): the last gym was headlined at the rank-and-file level, two under
    // an ace that already sits on `balance.xp.levelCap`. `makeBattler` clamps BOTH sides to the cap,
    // so no creature above it exists and the fight the shipped ramp produces is cap against cap.
    // The level-sensitivity sweep was already measuring that fight one column over.
    for (const gym of loaded.gyms) {
      if (aceLevelFor(gym) < balance.xp.levelCap) continue;
      expect(playerLevelFor(gym, balance, "trained")).toBe(balance.xp.levelCap);
      // …and the headline row of the gym table carries that level, not the rank and file's.
      const outcome = runOneGym(gym, gym.act - 1, loaded, 6, 2, "trained");
      expect(outcome.playerLevel).toBe(balance.xp.levelCap);
      expect(outcome.playerLevel).toBe(outcome.topLevel);
      expect(outcome.playerLevel).toBeGreaterThan(Math.max(...gym.slots.map((s) => s.level)));
    }
  });

  it("BINDS — the ceiling clause reads `balance.xp.levelCap`, so raising the cap stops it firing", () => {
    // Not a rule about one leader. Lift the cap in an overridden balance file (build-doc §6 INV-3)
    // and every ace is below the ceiling again, so TRAINED falls back to the rank and file
    // everywhere. If this stayed green with a gym id hard-coded in `playerLevelFor`, the clause
    // would be a special case wearing a formula's clothes.
    const highestAce = Math.max(...loaded.gyms.map((g) => aceLevelFor(g)));
    const withCap = (cap: number): ReturnType<typeof loadContentFromRaw> => {
      const raw = rawCopy();
      (raw["xp"] as Record<string, unknown>)["levelCap"] = cap;
      return loadContentFromRaw(raw, "test");
    };

    // Cap ON the highest ace: the clause fires for exactly the leaders standing on it.
    const at = withCap(highestAce);
    for (const gym of at.gyms) {
      const expected =
        aceLevelFor(gym) >= highestAce ? highestAce : Math.max(...gym.slots.map((s) => s.level));
      expect(playerLevelFor(gym, at.balance, "trained")).toBe(expected);
    }
    expect(at.gyms.some((g) => aceLevelFor(g) >= highestAce)).toBe(true);

    // Cap ONE level higher: no ace reaches the ceiling any more, so TRAINED is the rank and file
    // everywhere and the clause is inert. A gym id hard-coded in `playerLevelFor` fails here.
    const lifted = withCap(highestAce + 1);
    expect(lifted.balance.xp.levelCap).toBeGreaterThan(balance.xp.levelCap);
    for (const gym of lifted.gyms) {
      expect(playerLevelFor(gym, lifted.balance, "trained")).toBe(
        Math.max(...gym.slots.map((s) => s.level)),
      );
    }
    // The other direction is not constructible and that is a property of the game, not a gap:
    // core/schemas.ts rejects a balance file whose cap sits under any gym slot's level, so no
    // override can put EVERY leader on the ceiling.
    expect(() => withCap(highestAce - 1)).toThrow();
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

  /* ──────────────────────────────────────────────────────────────────────────
   * Clause 7's coverage key — the draft key that decides which team is FIELDED.
   *
   * It was scoring a creature as covering a matchup when it merely KNEW a super-effective move,
   * never asking whether clause 8's greedy policy would pick that move over a bigger neutral one.
   * Nothing in this suite looked at coverage at all, so the key was free to measure a plan the
   * player does not follow — and, being the FIRST key, it changed which creatures got drafted and
   * therefore every published win rate. These are the tests that would have caught it.
   * ────────────────────────────────────────────────────────────────────────── */

  /** A one-creature gym, so `coverageScore` answers a single yes/no about a single matchup. */
  const oneSlotGym = (slot: GymTeamSlot): GymLeader => ({ ...gym1, slots: [], signature: slot });

  it("clause 7: coverage counts the move the policy would THROW, not one the creature merely knows", () => {
    // The arithmetic that makes the two rules differ, from shipped data only: a super-effective hit
    // is multiplied by `balance.types.superEffective`, so a low-power super move loses the greedy
    // argmax to a higher-power neutral one and is never used.
    let knowsButNeverThrows = 0;
    let throwsIt = 0;

    for (const gym of loaded.gyms) {
      const level = playerLevelFor(gym, balance, "trained");
      for (const slot of gymRoster(gym)) {
        const defender = makeBattler(
          { uid: "d", lineId: slot.lineId, age: slot.age, level: slot.level, traits: [] },
          "enemy",
          loaded.battle,
          { isWild: false, enteredOnTurn: 0 },
        );
        for (const line of loaded.content.species) {
          if (line.ancient) continue;
          const knowsSuper = movesKnownAt(line, level, balance).some((id) => {
            const move = loaded.battle.moves.get(id);
            return (
              move !== undefined &&
              move.power > 0 &&
              typeMultiplier(move.type, defender.types, loaded.battle.typeChart, balance).band ===
                "super"
            );
          });
          if (!knowsSuper) continue;

          const covered = coverageScore([line], ["A"], [[]], level, oneSlotGym(slot), loaded.battle);
          const attacker = makeBattler(
            { uid: "a", lineId: line.id, age: "A", level, traits: [] },
            "player",
            loaded.battle,
            { isWild: false, enteredOnTurn: 0 },
          );
          const thrown = loaded.battle.moves.get(
            bestMoveId(attacker, defender, loaded.battle, { usePredation: true }),
          );
          const throwsSuper =
            thrown !== undefined &&
            thrown.power > 0 &&
            typeMultiplier(thrown.type, defender.types, loaded.battle.typeChart, balance).band ===
              "super";

          // THE ASSERTION. The old rule scored every one of these 1, because every one of them
          // knows a super-effective move. Coverage must follow the move that is actually thrown.
          expect(
            covered,
            `${line.id} vs ${defender.formName}: knows a super-effective move, throws ` +
              `${thrown?.id ?? "nothing"} (${throwsSuper ? "super" : "not super"})`,
          ).toBe(throwsSuper ? 1 : 0);

          if (throwsSuper) throwsIt += 1;
          else knowsButNeverThrows += 1;
        }
      }
    }

    // Both arms must be exercised by shipped content, or the assertion above proves nothing: with
    // no `knowsButNeverThrows` case the naive rule and the honest one are the same function.
    expect(throwsIt).toBeGreaterThan(0);
    expect(
      knowsButNeverThrows,
      "no shipped pairing knows a super-effective move it would not throw — the two coverage rules " +
        "are indistinguishable on this content, so this test no longer binds the defect",
    ).toBeGreaterThan(0);
  });

  it("clause 7: coverage agrees with the action `reasonablePolicy` takes in a real battle", () => {
    // Not a second opinion about move scoring — the round trip. Put the creature on the field
    // through `startBattle` and ask the shipped policy what it does; coverage must have said the
    // same thing about the same pairing. This is what makes the draft key and the fight one model.
    let checked = 0;
    let superSeen = 0;
    let neutralSeen = 0;
    const policy = reasonablePolicy();

    for (const gym of loaded.gyms) {
      const level = playerLevelFor(gym, balance, "trained");
      for (const slot of gymRoster(gym)) {
        for (const line of candidateLines(gym.act, loaded)) {
          const spec = { uid: "p0", lineId: line.id, age: "A" as const, level, traits: [] };
          const enemy = {
            uid: "e0",
            lineId: slot.lineId,
            age: slot.age,
            level: slot.level,
            traits: [],
          };
          const state = startBattle(
            { seed: 7, kind: "gym", playerParty: [spec], enemyParty: [enemy] },
            loaded.battle,
          ).state;
          const action = policy(state, loaded.battle);
          expect(action.kind).toBe("move");
          if (action.kind !== "move") continue;
          const move = loaded.battle.moves.get(action.moveId);
          const target = state.battlers[state.activeEnemyUid];
          if (!move || !target) throw new Error("empty field");
          const superEffective =
            move.power > 0 &&
            typeMultiplier(move.type, target.types, loaded.battle.typeChart, balance).band ===
              "super";

          expect(
            coverageScore([line], ["A"], [[]], level, oneSlotGym(slot), loaded.battle),
          ).toBe(superEffective ? 1 : 0);

          checked += 1;
          if (superEffective) superSeen += 1;
          else neutralSeen += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(superSeen).toBeGreaterThan(0);
    expect(neutralSeen).toBeGreaterThan(0);
  });

  it("clause 7: the key scores the creature that is FIELDED — its own age, not a stand-in", () => {
    /*
     * The first half asserts that the age and the traits `coverageScore` is handed are INERT — that
     * a stand-in Adult with no traits scores every cell identically to the creature actually
     * fielded. It used to assert the exact opposite, and both readings were correct on the day they
     * were written:
     *
     *   `bestMoveId` ranked on the full `((atk × power) / def) × mult × roll`. Attack, defence,
     *   predation and the roll are the same number for every move in one pool, so in exact
     *   arithmetic they cannot reorder it — in floating point they did. `balance.types.superEffective`
     *   is 1.5, so a 40-power super-effective move and a 60-power neutral one tie EXACTLY on paper,
     *   the two orderings of that product do not round to the same double, and the winner was
     *   decided by the ATTACKER'S Attack stat, i.e. by its age and traits. T-27 dropped the common
     *   factor from the ranking key on both sides, and the key is now a function of the move and the
     *   DEFENDER alone.
     *
     * The fact the old half pinned no longer exists, so this pins the fact that replaced it — and it
     * does so with an EXACT EQUALITY where the old one held an inequality (`flips > 0`). That is a
     * strictly stronger claim, not a looser one: it goes red the moment attacker sensitivity returns.
     *
     * WHY THE PARAMETERS STAY, since deleting them is the obvious move and it is the wrong one.
     * Removing `ages` and `traits` from `coverageScore` was MEASURED safe — 1.71M calls over 32,400
     * cells with zero variance, and 6,000 real drafts with zero differences — and was deliberately
     * NOT done. T-13 was a ruling to "fix the instrument", and one of its two fixes was precisely to
     * thread the real ages and traits in here, because the old key asked whether a creature merely
     * KNEW an effective move rather than whether its policy would throw one; that published
     * confident wrong win rates for weeks. The parameters are now a GUARD: the next scorer that
     * starts reading the attacker again — a crit model, an accuracy model, a Soak-aware key — turns
     * this test red instead of moving published win rates in silence.
     *
     * MEASURED, so the exact equality is a gauge and not a decoration: the sweep is 4,050 cells ×
     * 48 loadouts = 194,400 comparisons, and reverting `bestMoveId` to the pre-T-27 full-product
     * argmax makes 274 of them disagree with the stand-in — `pyrelisk-line` L15 as an Elder scoring
     * 0 against `bramblehog-line` where a stand-in Adult scores 1, and 273 more.
     */
    // Every attacker loadout coverage can be handed: each age class, and each single trait the
    // shipped pool can roll (`balance.traits.slotsPerWildCreature` is 1), against the bare baseline.
    const loadouts: { age: AgeClass; traits: Trait[] }[] = [];
    for (const age of AGE_CLASSES) {
      loadouts.push({ age, traits: [] });
      for (const trait of balance.traits.pool) loadouts.push({ age, traits: [{ ...trait }] });
    }
    expect(loadouts.length).toBe(AGE_CLASSES.length * (balance.traits.pool.length + 1));

    // Every level at which the known-move set changes, plus the level clause 4 actually fields —
    // the level is what decides the pool the greedy pick chooses from, so it is swept rather than fixed.
    const unlockLevels = [...new Set(Object.values(balance.moves.slotUnlockLevels))].sort((a, b) => a - b);
    let cells = 0;
    let varying = 0;
    const attackerSensitive: string[] = [];
    for (const gym of loaded.gyms) {
      const levels = [...new Set([...unlockLevels, playerLevelFor(gym, balance, "trained")])];
      for (const slot of gymRoster(gym)) {
        const one = oneSlotGym(slot);
        for (const line of loaded.content.species) {
          for (const level of levels) {
            // The stand-in: an Adult with no traits, which is what dropping the parameters would leave.
            const standIn = coverageScore([line], ["A"], [[]], level, one, loaded.battle);
            for (const loadout of loadouts) {
              const fielded = coverageScore([line], [loadout.age], [loadout.traits], level, one, loaded.battle);
              if (fielded !== standIn) {
                varying += 1;
                if (attackerSensitive.length < 10) {
                  const trait = loadout.traits[0];
                  attackerSensitive.push(
                    `${line.id} L${level} as ${loadout.age}${trait ? ` +${trait.id}` : ""} vs ` +
                      `${slot.lineId}: scores ${fielded}, stand-in Adult scores ${standIn}`,
                  );
                }
              }
            }
            cells += 1;
          }
        }
      }
    }
    // A zero over an empty sweep asserts nothing, so the sweep's own size is pinned first.
    expect(cells).toBe(
      loaded.gyms.reduce(
        (n, gym) =>
          n +
          gymRoster(gym).length *
            loaded.content.species.length *
            new Set([...unlockLevels, playerLevelFor(gym, balance, "trained")]).size,
        0,
      ),
    );
    expect(cells).toBeGreaterThan(0);
    expect(
      varying,
      `coverageScore reads the attacker again: ${varying} of ${cells * loadouts.length} loadouts ` +
        `disagree with a stand-in Adult. This is not a licence to loosen the assertion — a scorer ` +
        `that reads the attacker is a scorer that can reorder a tie by rounding, which is T-27.\n  ` +
        attackerSensitive.join("\n  "),
    ).toBe(0);

    /*
     * The invariant half: what `draftParty` credits is a recomputation from the specs it hands back.
     *
     * MEASURED, and stated so nobody mistakes this green for more than it is: over 1200 shipped
     * drafts (6 gyms × 200 seeds), scoring a stand-in Adult instead of the fielded creature changes
     * the credited number in ZERO of them — coverage is a max over up to six members, so one
     * member's flip is masked by another member covering the same slot. On this content the two
     * agree; this half is what would notice if a future key stopped agreeing.
     */
    for (const gym of loaded.gyms) {
      for (let seed = 0; seed < 8; seed++) {
        const party = draftParty(gym, loaded, createRng(seed), 4, "trained");
        const lines = party.specs.map((s) => {
          const line = loaded.species.byId.get(s.lineId);
          if (!line) throw new Error(`drafted an unknown line "${s.lineId}"`);
          return line;
        });
        const recomputed = coverageScore(
          lines,
          party.specs.map((s) => s.age),
          party.specs.map((s) => s.traits),
          party.level,
          gym,
          loaded.battle,
        );
        expect(recomputed).toBe(party.coverage);
      }
    }
  });

  /*
   * DELETED, deliberately, per its own protocol — not loosened.
   *
   * `clause 7: the greedy pick CAN turn on the attacker's own stats — the finding that forces the
   * above` asserted `stateDependent > 0`: that shipped pairings existed whose greedy pick flipped
   * with the attacker's age. Its docblock wrote the response out in advance — "If this goes
   * green-to-red, the scorer's tie-break became stable. That is an IMPROVEMENT, and the response is
   * to delete this test deliberately … not to make the assertion looser."
   *
   * T-27 made the tie-break stable: `moveRank` (core/battle.ts, and the same key in
   * tools/harness/arena.ts) dropped `atk`, `def`, `predation` and the mid-roll, which are common to
   * every move in one pool and so cannot reorder it in exact arithmetic — they were the whole source
   * of the floating-point noise this test was pinning. 13 of 2160 shipped enemy choices changed; the
   * divergence count went 13 → 0. The FACT the test held is gone, so the test goes with it. What
   * replaced it is the exact-equality sweep in `the key scores the creature that is FIELDED` above,
   * which is strictly stronger: it goes red the moment attacker sensitivity comes back.
   *
   * Its docblock's second clause — "and then `coverageScore` may drop its ages and traits" — is NOT
   * acted on, and the reason is recorded at that test and in `coverageScore`'s own docblock.
   *
   * It was a correct test, not a wrong one: run against the pre-T-27 full-product argmax it still
   * reads GREEN (stable 717, stateDependent 3), and against the shipped key it reads
   * stateDependent 0 over the same 720 pairings. What went away is the fact, not the instrument.
   */

  it("clause 7: coverage is bounded by the roster and is what `draftParty` reports", () => {
    for (const gym of loaded.gyms) {
      const party = draftParty(gym, loaded, createRng(17), 4, "trained");
      expect(party.rosterSize).toBe(gymRoster(gym).length);
      expect(party.coverage).toBeGreaterThanOrEqual(0);
      expect(party.coverage).toBeLessThanOrEqual(party.rosterSize);
    }
    // …and the honest key can never credit MORE than the naive one did: throwing a super-effective
    // move requires knowing one. Somewhere on shipped content it credits strictly fewer, which is
    // the whole reason the published win rates moved.
    let strictlyFewer = 0;
    for (const gym of loaded.gyms) {
      const level = playerLevelFor(gym, balance, "trained");
      for (const line of candidateLines(gym.act, loaded)) {
        for (const slot of gymRoster(gym)) {
          const defender = makeBattler(
            { uid: "d", lineId: slot.lineId, age: slot.age, level: slot.level, traits: [] },
            "enemy",
            loaded.battle,
            { isWild: false, enteredOnTurn: 0 },
          );
          const naive = movesKnownAt(line, level, balance).some((id) => {
            const move = loaded.battle.moves.get(id);
            return (
              move !== undefined &&
              move.power > 0 &&
              typeMultiplier(move.type, defender.types, loaded.battle.typeChart, balance).band ===
                "super"
            );
          })
            ? 1
            : 0;
          const honest = coverageScore([line], ["A"], [[]], level, oneSlotGym(slot), loaded.battle);
          expect(honest).toBeLessThanOrEqual(naive);
          if (honest < naive) strictlyFewer += 1;
        }
      }
    }
    expect(strictlyFewer).toBeGreaterThan(0);
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
  it("its move scorer picks exactly what core/battle.ts's `chooseEnemyAction` picks — over EVERY shipped pairing", () => {
    /*
     * EXHAUSTIVE, and the exhaustiveness IS the test.
     *
     * What this replaced drew 36 samples — six gyms × six seeds — and closed on
     * `expect(checked).toBeGreaterThan(20)`. It was green on the day the two scorers disagreed on 13
     * of 2160 shipped enemy choices (T-27). The divergences were real and reachable; 36 draws simply
     * never landed on one, and a green sample was read as agreement for as long as that lasted. A
     * BIGGER sample is not the fix. The space is small enough to walk, so it is walked, and a
     * failure names the pairings rather than reporting a count.
     *
     * The space is every form the ranking key can see. `moveRank` reads the attacker's known-move
     * set — which changes only at `balance.moves.slotUnlockLevels` — and the defender's types and
     * role. Age and traits feed neither today (see the clause-7 inertness sweep above); they are
     * still swept on both sides, because the day a scorer starts reading them is the day this has to
     * notice. Ancients are included: nothing about the two argmaxes is restricted to the draftable
     * pool, so restricting the sweep would only hide a disagreement.
     *
     * As shipped that is 324 forms a side — 27 lines × 3 ages × 4 unlock levels — and 104,976
     * pairings, in under a second.
     *
     * MEASURED, so that this is a binding gauge and not a reassuring one: reverting `bestMoveId` to
     * the pre-T-27 full-product argmax makes this name 78 divergent pairings — `mirefin-line` J L15
     * against `cindril-line` A L5 throwing `ambush` where core/battle.ts throws `dous`, and 77 more.
     * The 36-sample test this replaced stays GREEN under that same sabotage. That is the whole
     * argument for the change, and it was run rather than assumed.
     */
    const species: readonly SpeciesLine[] = loaded.content.species;
    const unlockLevels = [...new Set(Object.values(balance.moves.slotUnlockLevels))].sort((a, b) => a - b);
    expect(unlockLevels.length).toBeGreaterThan(0);

    interface Form {
      lineId: string;
      age: AgeClass;
      level: number;
    }
    const forms: Form[] = [];
    for (const line of species) {
      for (const age of AGE_CLASSES) {
        for (const level of unlockLevels) forms.push({ lineId: line.id, age, level });
      }
    }
    // Nothing was filtered out of the sweep on its way in.
    expect(forms.length).toBe(species.length * AGE_CLASSES.length * unlockLevels.length);

    const divergent: string[] = [];
    let disagreements = 0;
    let checked = 0;
    for (const attacker of forms) {
      for (const defender of forms) {
        // `chooseEnemyAction` reads the ENEMY seat as the attacker, so the swept attacker sits there.
        const state = startBattle(
          {
            seed: 1,
            kind: "gym",
            playerParty: [
              { uid: "p", lineId: defender.lineId, age: defender.age, level: defender.level, traits: [] },
            ],
            enemyParty: [
              { uid: "e", lineId: attacker.lineId, age: attacker.age, level: attacker.level, traits: [] },
            ],
          },
          loaded.battle,
        ).state;
        const enemy = state.battlers[state.activeEnemyUid];
        const player = state.battlers[state.activePlayerUid];
        if (!enemy || !player) throw new Error("empty field");
        const theirs = chooseEnemyAction(state, loaded.battle);
        if (theirs.kind !== "move") throw new Error(`chooseEnemyAction answered "${theirs.kind}", not a move`);
        const ours = bestMoveId(enemy, player, loaded.battle, { usePredation: true, nodeId: state.nodeId });
        if (ours !== theirs.moveId) {
          disagreements += 1;
          if (divergent.length < 10) {
            divergent.push(
              `${attacker.lineId} ${attacker.age} L${attacker.level} vs ` +
                `${defender.lineId} ${defender.age} L${defender.level}: ` +
                `core/battle.ts throws "${theirs.moveId}", the harness throws "${ours}"`,
            );
          }
        }
        checked += 1;
      }
    }
    // The sweep really was the whole cross product — no early exit, no skipped arm.
    expect(checked).toBe(forms.length * forms.length);
    expect(
      disagreements,
      `the harness and core/battle.ts pick different moves on ${disagreements} of ${checked} ` +
        `pairings — the round-robin is measuring a different game. First divergences:\n  ` +
        divergent.join("\n  "),
    ).toBe(0);
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
    expect(run.survey.seasonSteps).toBe(balance.clock.yearsTotal * balance.clock.seasonOrder.length);
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
    expect(base.survey.catches).toBe(0);
    expect(dex.survey.catches).toBeGreaterThan(0);
    // The dex profile takes at most one of each line, ever.
    expect(dex.survey.catches).toBeLessThanOrEqual(loaded.content.species.length);
    for (const entry of dex.survey.catchesByLine) expect(entry.caught).toBe(1);
    // The collector stops at party + box capacity.
    expect(collector.survey.catches).toBeLessThanOrEqual(
      balance.party.maxPartySize + balance.party.maxBoxSize,
    );
    expect(collector.survey.catches).toBeGreaterThan(dex.survey.catches);
  });

  it("every extinction under normal play stops happening when the raid is suppressed", () => {
    /*
     * This assertion used to read "no extinction outside the raid's own nodes", filtering on
     * `balance.yearEvents.raids` — the raid script vouching for itself. What it asserts now is
     * measured: the same profile over the same seeds, against a balance whose raid list is empty,
     * and every (node, line) the shipped column reports has to be absent from it. The stronger
     * claim — that the control reaches zero NOWHERE — is in "the raid-suppressed control" below.
     */
    const shipped = summariseProfile(loaded, { id: "dex", profile: "dex", raids: "shipped" }, 8);
    const noRaid = summariseProfile(loaded, { id: "dex-no-raid", profile: "dex", raids: "suppressed" }, 8);
    const survives = new Set(noRaid.extinctions.map((e) => `${e.nodeId}/${e.lineId}`));
    const notTheRaids = shipped.extinctions.filter((e) => survives.has(`${e.nodeId}/${e.lineId}`));
    expect(
      notTheRaids.map((e) => `${e.nodeId}/${e.lineId}`),
      "normal play drove these to zero with the raid taken out, so the raid is not what killed them",
    ).toEqual([]);
  });

  it("BINDS — the extinction detector reports a line that really is wiped out, and when", () => {
    // The heaviest profile the shipped rules allow. If nothing here ever reaches zero, the detector
    // could be broken and the test above would be vacuous. The season stamp is asserted too: it is
    // what the report prints next to each cause, and a detector that recorded the fact without the
    // season would leave that column silently reading "season 0".
    const summary = summariseProfile(loaded, { id: "collector", profile: "collector", raids: "shipped" }, 8);
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

/* ════════════════════════════════════════════════════════════════════════════
 * 6a. The raid-suppressed control — build-doc §10's "no UNINTENDED extinction"
 * ════════════════════════════════════════════════════════════════════════════
 * §10 asks for something neither shipped profile could answer. `baseline` means "no player in the
 * region", not "nothing happens to the region": the authored Cullbrand strip-harvest is content on
 * the act clock and fires in the baseline too, so the r4 extinctions the baseline reports are the
 * raid's. A line that reaches zero with NO PLAYER AND NO RAID was caused by neither, and that is
 * the only reading of "unintended" the spec supports.
 *
 * What these tests have to establish, in order, is that the control is real:
 *   1. the control's balance genuinely carries no raids, and the shipped one still does;
 *   2. suppressing for one run does not disarm the raid for another in the same process;
 *   3. the control is the shipped world MINUS the raids and not some other world;
 *   4. it agrees with an actually-edited balance file loaded through `--balance` (INV-3);
 *   5. only then, what it measures — and that it is capable of measuring anything at all.
 * ════════════════════════════════════════════════════════════════════════════ */

const CONTROL: RunSpec = { id: "baseline-no-raid", profile: "baseline", raids: "suppressed" };
const SHIPPED_BASELINE: RunSpec = { id: "baseline", profile: "baseline", raids: "shipped" };
const TARGETS_IN_SCRIPT = balance.yearEvents.raids.reduce((n, r) => n + r.targets.length, 0);

describe("the raid-suppressed control — build-doc §10", () => {
  it("the control's balance carries no raids and the source balance is untouched", () => {
    expect(balance.yearEvents.raids.length, "the shipped file has no raid to suppress").toBeGreaterThan(0);
    const rawRaids = (c: unknown): string =>
      JSON.stringify((c as { yearEvents: { raids: unknown } }).yearEvents.raids);
    const validatedBefore = JSON.stringify(balance.yearEvents.raids);
    const rawBefore = rawRaids(loaded.rawBalance);
    const control = raidSuppressedContent(loaded);
    expect(control.balance.yearEvents.raids).toEqual([]);
    expect(rawRaids(control.rawBalance)).toBe("[]");
    // A deep copy, not the imported module object: mutating that would disarm the raid process-wide
    // — every other profile in this process reads the same `data/balance.json` import.
    expect(control.rawBalance).not.toBe(loaded.rawBalance);
    expect(JSON.stringify(balance.yearEvents.raids)).toBe(validatedBefore);
    expect(rawRaids(loaded.rawBalance), "the shipped raid list was emptied in place").toBe(rawBefore);
  });

  it("BINDS — suppressing for one run does not disarm the raid for another in the same process", () => {
    const suppressedFirst = runFullRun(loaded, seedFor(balance, 0), "baseline", "suppressed");
    const shippedAfter = runFullRun(loaded, seedFor(balance, 0), "baseline", "shipped");
    expect(suppressedFirst.raids).toEqual([]);
    expect(shippedAfter.raids.length, "the second profile lost its raid to the first").toBe(TARGETS_IN_SCRIPT);

    // And the other order, because a leak could go either way.
    const shippedFirst = runFullRun(loaded, seedFor(balance, 1), "baseline", "shipped");
    const suppressedAfter = runFullRun(loaded, seedFor(balance, 1), "baseline", "suppressed");
    expect(shippedFirst.raids.length).toBe(TARGETS_IN_SCRIPT);
    expect(suppressedAfter.raids).toEqual([]);
    expect(balance.yearEvents.raids.length).toBeGreaterThan(0);
  });

  it("the control is the shipped world minus the raids, and differs in nothing else", () => {
    // The control is built by re-loading a JSON copy of the balance file. If that round trip moved
    // ANY number, "nothing went extinct" would be a claim about a different game. So: the identical
    // round trip with the raid list left alone has to reproduce the shipped run byte for byte.
    const identity = loadContentFromRaw(rawCopy(), "identity-round-trip");
    expect(identity.balance.yearEvents.raids.length).toBe(balance.yearEvents.raids.length);
    for (const profile of ["baseline", "dex", "collector"] as const) {
      const a = runFullRun(loaded, seedFor(balance, 0), profile);
      const b = runFullRun(identity, seedFor(balance, 0), profile);
      expect(JSON.stringify(b.survey), `the round trip moved the ${profile} run`).toBe(
        JSON.stringify(a.survey),
      );
      expect(JSON.stringify(b.raids)).toBe(JSON.stringify(a.raids));
    }
  });

  it("suppressing in memory equals running a balance file that really has no raids (INV-3)", () => {
    // An independent route to the same world: write the file out with `raids: []` and load it
    // through the shipped `--balance` path. If the in-memory construction diverged from an honest
    // edit of the file, this is where it would show.
    const raw = rawCopy();
    (raw["yearEvents"] as Record<string, unknown>)["raids"] = [];
    const viaFile = loadContent(writeBalance(raw));
    expect(viaFile.balance.yearEvents.raids).toEqual([]);
    for (const profile of ["baseline", "dex", "collector"] as const) {
      const onDisk = runFullRun(viaFile, seedFor(balance, 0), profile);
      const inMemory = runFullRun(loaded, seedFor(balance, 0), profile, "suppressed");
      expect(onDisk.raids).toEqual([]);
      expect(JSON.stringify(inMemory.survey), `${profile}: in-memory suppression is not the file`).toBe(
        JSON.stringify(onDisk.survey),
      );
    }
  });

  it("no unintended extinction — nothing reaches zero with no player and no raid (§10)", () => {
    const control = summariseProfile(loaded, CONTROL, 16);
    expect(control.raidEvents, "the control fired a raid, so it is not a control").toBe(0);
    expect(control.meanCatches).toBe(0);
    expect(
      control.extinctions.map((e) => `${e.nodeId}/${e.lineId} in ${e.seeds}/${control.seeds} seeds`),
      "these reached zero with neither a player nor the authored raid — an UNINTENDED extinction",
    ).toEqual([]);
  });

  it("BINDS — the same instrument with the raid left in DOES reach zero", () => {
    // Without this, the assertion above is satisfied by any control that cannot see an extinction.
    // Same function, same seeds, same profile; the raid list is the only difference.
    const shipped = summariseProfile(loaded, SHIPPED_BASELINE, 16);
    expect(shipped.raidEvents).toBeGreaterThan(0);
    expect(
      shipped.extinctions.length,
      "with the raid firing and no player, nothing reached zero — the detector is blind",
    ).toBeGreaterThan(0);
  });

  it("BINDS — the suppressed instrument still reports an extinction under the heaviest catch load", () => {
    // The other half of the same worry: `raids: "suppressed"` might be a code path that cannot
    // report anything. It can — the collector drives lines to zero with no raid anywhere near them.
    const heavy = summariseProfile(
      loaded,
      { id: "collector-no-raid", profile: "collector", raids: "suppressed" },
      16,
    );
    expect(heavy.raidEvents).toBe(0);
    expect(heavy.extinctions.length).toBeGreaterThan(0);
    for (const e of heavy.extinctions) expect(e.firstSeason).toBeGreaterThan(0);
  });

  it("is deterministic, and independent of what else ran first", () => {
    const first = summariseProfile(loaded, CONTROL, 4);
    // Interleave a shipped run of a different profile — a shared-state leak would show up here.
    runFullRun(loaded, seedFor(balance, 2), "collector", "shipped");
    const second = summariseProfile(loaded, CONTROL, 4);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("the published matrix crosses every catch profile with every raid policy, once each", () => {
    expect(PLAY_PROFILES.length).toBe(CATCH_PROFILES.length * RAID_POLICIES.length);
    for (const profile of CATCH_PROFILES) {
      for (const raids of RAID_POLICIES) {
        expect(
          PLAY_PROFILES.filter((s) => s.profile === profile && s.raids === raids).length,
          `${profile} × ${raids} is not published exactly once`,
        ).toBe(1);
      }
    }
    expect(new Set(PLAY_PROFILES.map((s) => s.id)).size).toBe(PLAY_PROFILES.length);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6b. The report attributes an extinction by MEASUREMENT, not by the raid's node list
 * ════════════════════════════════════════════════════════════════════════════ */

describe("attributeExtinction — the substitution the control makes possible", () => {
  const raid = balance.yearEvents.raids[0];
  if (!raid) throw new Error("data/balance.json must carry a raid for these tests to mean anything");
  const harvested = raid.targets[0];
  if (!harvested) throw new Error("the shipped raid harvests nothing");

  const summary = (spec: RunSpec, extinct: ReadonlyArray<readonly [string, string]>): ProfileSummary => ({
    spec,
    seeds: 4,
    seasonSteps: 24,
    raidEvents: spec.raids === "shipped" ? 2 : 0,
    meanCatches: 0,
    extinctions: extinct.map(([nodeId, lineId]) => ({
      nodeId,
      lineId,
      formName: lineId,
      start: 5,
      seeds: 4,
      firstSeason: 12,
    })),
    closest: [],
    catchesByLine: [],
  });

  const shippedSpec: RunSpec = { id: "baseline", profile: "baseline", raids: "shipped" };
  const pair = [raid.nodeId, harvested.lineId] as const;

  it("credits the raid when, and only when, removing the raid removes the extinction", () => {
    const profiles = [
      summary(shippedSpec, [pair]),
      summary(CONTROL, []),
    ];
    expect(attributeExtinction(loaded, profiles, shippedSpec, pair[0], pair[1])).toBe("raid-harvested");
  });

  it("BINDS — a harvested line at the raid's own node that STILL dies with the raid suppressed is not the raid's", () => {
    // This is the exact case the old classifier got wrong by construction: it read the node and the
    // target list and answered "raid target" without ever asking whether the raid mattered.
    const profiles = [
      summary(shippedSpec, [pair]),
      summary(CONTROL, []),
      summary({ id: "collector", profile: "collector", raids: "shipped" }, [pair]),
      summary({ id: "collector-no-raid", profile: "collector", raids: "suppressed" }, [pair]),
    ];
    const collectorSpec = profiles[2]?.spec as RunSpec;
    expect(attributeExtinction(loaded, profiles, collectorSpec, pair[0], pair[1])).toBe("player");
  });

  it("calls a line that reaches zero with no player and no raid UNINTENDED", () => {
    const profiles = [summary(shippedSpec, [pair]), summary(CONTROL, [pair])];
    expect(attributeExtinction(loaded, profiles, shippedSpec, pair[0], pair[1])).toBe("unintended");
  });

  it("separates the harvested line from the one that starves above it", () => {
    const above = loaded.nodes
      .find((n) => n.id === raid.nodeId)
      ?.populations;
    const notHarvested = Object.keys(above ?? {}).find(
      (lineId) => !raid.targets.some((t) => t.lineId === lineId),
    );
    expect(notHarvested, `${raid.nodeId} has no line the raid leaves alone`).toBeDefined();
    const profiles = [
      summary(shippedSpec, [[raid.nodeId, notHarvested as string]]),
      summary(CONTROL, []),
    ];
    expect(attributeExtinction(loaded, profiles, shippedSpec, raid.nodeId, notHarvested as string)).toBe(
      "raid-emergent",
    );
  });

  it("says so rather than guessing when no raid-suppressed control was run", () => {
    const profiles = [summary(shippedSpec, [pair])];
    expect(attributeExtinction(loaded, profiles, shippedSpec, pair[0], pair[1])).toBe("unclassified");
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
 * 6b. The release clause is about the MESOPREDATOR — build-doc §10.2
 * ════════════════════════════════════════════════════════════════════════════
 * §10.2's second clause names its animal: "apex count →0 and **mesopredator** count strictly rising
 * within 4 seasons". `runOvercatch` once scored it as a bare existential over every prey line of the
 * collapsed predator, of any role, with a comment that said "the verdict does not depend on which
 * one it is". It does. An apex that carries a large Grazer has it on the menu as well as the
 * mesopredator, so a Grazer rebounding once nothing hunts it was published under the mesopredator's
 * claim — and the published balance report then recommended a demo stage on that number.
 *
 * These tests are deliberately NOT a restatement of the new predicate. The defect existed precisely
 * because the metric restated its own intent, and a test written the same way would have passed
 * against the broken code. Each one is anchored to a fact that is true of the raw population traces
 * independently of any window arithmetic — above all: **the mesopredator never leaves zero at any
 * season of the run.** No honest reading of "mesopredator count strictly rising" can count a seed
 * like that, whatever window it uses, so a metric that does is wrong by inspection.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the §10.2 release clause counts the mesopredator, not whatever rebounded", () => {
  /** Enough seeds to reach the divergence at more than one node; the sweep is cheap. */
  const RELEASE_SEEDS = 32;

  interface DrivenRow {
    nodeId: string;
    topLineId: string;
    reading: PreyReading;
    shape: OvercatchShape;
    /** Prey of the collapsed predator, split by `webRole` — core/foodweb.ts, the only role reader. */
    mesoPrey: string[];
    otherPrey: string[];
    runs: OvercatchRun[];
  }

  const roleOf = (lineId: string): string => {
    const line = loaded.species.byId.get(lineId);
    if (!line) throw new Error(`no species line "${lineId}"`);
    return webRole(line, balance);
  };

  /** Every row §4.3 publishes, driven seed by seed so the raw traces are in hand. */
  const drivenRows: DrivenRow[] = PREY_READINGS.flatMap((reading) =>
    OVERCATCH_SHAPES.flatMap((shape) =>
      loaded.nodes.flatMap((file) =>
        topOfWeb(toEcoNode(file), loaded).map((topLineId) => {
          const prey = preyOf(deriveFoodWeb(toEcoNode(file), loaded.species, balance), topLineId);
          return {
            nodeId: file.id,
            topLineId,
            reading,
            shape,
            mesoPrey: prey.filter((id) => roleOf(id) === "Mesopredator"),
            otherPrey: prey.filter((id) => roleOf(id) !== "Mesopredator"),
            runs: Array.from({ length: RELEASE_SEEDS }, (_, i) =>
              runOvercatch(loaded, file, topLineId, reading, shape, seedFor(balance, i)),
            ),
          };
        }),
      ),
    ),
  );

  it("THE DEFECT — a prey line that is not the mesopredator rebounding does NOT satisfy §10.2", () => {
    // Selection: the harness's own BROADER flag fired, so something the dead predator ate rebounded.
    // Independent fact: the node's Mesopredator-role prey read zero at EVERY season of that run —
    // it is not slow to recover, it is absent. Assertion: §10.2's figure did not count the seed.
    let exercised = 0;
    for (const row of drivenRows) {
      if (row.mesoPrey.length === 0 || row.otherPrey.length === 0) continue;
      for (const run of row.runs) {
        if (!run.anyPreyReleased) continue;
        const mesoNeverLeftZero = row.mesoPrey.every((id) =>
          (run.preyTraces[id] ?? []).every((count) => count === 0),
        );
        if (!mesoNeverLeftZero) continue;
        exercised += 1;
        const where = `${row.nodeId} ${row.reading}/${row.shape} seed ${run.seed}`;
        const credited = run.anyPreyReleasedLineId;
        expect(credited, `${where}: something rebounded but no line was named`).not.toBeNull();
        expect(row.otherPrey, `${where}: ${credited ?? "?"} is not a non-mesopredator prey line`).toContain(credited);
        expect(
          run.mesoReleased,
          `${where}: ${row.mesoPrey.join(", ")} never left zero, yet the §10.2 release counted this seed ` +
            `(credited to ${credited ?? "?"}, a ${credited ? roleOf(credited) : "?"})`,
        ).toBe(false);
        expect(run.mesoReleasedLineId, `${where}: a line was credited with a release that did not happen`).toBeNull();
        expect(run.fullBeat, `${where}: the complete beat was reported without a mesopredator release`).toBe(false);
      }
    }
    expect(
      exercised,
      "no seed rebounded a non-mesopredator after a collapse — this test asserted nothing about the defect",
    ).toBeGreaterThan(0);
  });

  it("BINDS the other way — a real mesopredator release IS counted, and only a Mesopredator is credited", () => {
    // Without this the test above is satisfiable by a metric that always answers false.
    let counted = 0;
    for (const row of drivenRows) {
      for (const run of row.runs) {
        if (!run.mesoReleased) continue;
        counted += 1;
        const where = `${row.nodeId} ${row.reading}/${row.shape} seed ${run.seed}`;
        const id = run.mesoReleasedLineId;
        expect(id, `${where}: a release with no line named`).not.toBeNull();
        const lineId = id as string;
        expect(roleOf(lineId), `${where}: ${lineId} is not a Mesopredator`).toBe("Mesopredator");
        expect(row.mesoPrey, `${where}: ${lineId} is not prey of ${row.topLineId}`).toContain(lineId);
        // Read the rise off the raw trace rather than trusting the flag that reported it.
        const zeroSeason = run.topZeroSeason as number;
        const trace = run.preyTraces[lineId] ?? [];
        const atCollapse = trace[zeroSeason - 1] ?? 0;
        expect(
          Math.max(...trace.slice(zeroSeason)),
          `${where}: ${lineId} never rose above ${atCollapse} after the collapse`,
        ).toBeGreaterThan(atCollapse);
        expect(run.collapsed, `${where}: a release without a collapse`).toBe(true);
        expect(run.fullBeat, `${where}: apex gone and mesopredator rising is the whole beat`).toBe(true);
      }
    }
    expect(
      counted,
      "no seed released a mesopredator — the §10.2 gauge is never green, so the test above proves nothing",
    ).toBeGreaterThan(0);
  });

  it("the sweep publishes the two as SEPARATE numbers, and on the shipped content they differ", () => {
    const rows = PREY_READINGS.flatMap((reading) =>
      OVERCATCH_SHAPES.flatMap((shape) => sweepOvercatch(loaded, RELEASE_SEEDS, reading, shape)),
    );
    for (const row of rows) {
      // `fullBeatRate` is what §4.3's bold column prints. It must BE the mesopredator figure.
      expect(row.fullBeatRate, `${row.nodeId} ${row.reading}/${row.shape}`).toBe(row.mesoReleaseRate);
      expect(row.mesoReleaseRate, `${row.nodeId} ${row.reading}/${row.shape}`).toBeLessThanOrEqual(row.anyReleaseRate);
    }
    const diverging = rows.filter((r) => r.hasMesoPrey && r.anyReleaseRate > r.mesoReleaseRate);
    expect(
      diverging.length,
      "no row diverges — the two columns are the same measurement wearing two names, or the content changed",
    ).toBeGreaterThan(0);
    // The rows that matter most are the ones that diverge COMPLETELY: the broader column fires and
    // §10.2's does not fire at all. Those are the rows a merged column published as the demo beat.
    const wholly = rows.filter((r) => r.hasMesoPrey && r.mesoReleaseRate === 0 && r.anyReleaseRate > 0);
    expect(
      wholly.length,
      "no row rebounds a non-mesopredator while the mesopredator stays down — the defect's own shape is unexercised",
    ).toBeGreaterThan(0);
    for (const row of wholly) {
      const where = `${row.nodeId} ${row.reading}/${row.shape}`;
      expect(row.anyReleasedFormName, `${where}: a rebound with no line named`).not.toBeNull();
      expect(
        row.mesoPreyFormNames,
        `${where}: the mesopredator is credited with a rebound on a row whose §10.2 rate is 0`,
      ).not.toContain(row.anyReleasedFormName);
      expect(row.fullBeatRate, `${where}: the beat is reported without a mesopredator release`).toBe(0);
    }
  });

  it("a node with no Mesopredator-role prey reports the clause UNDEFINED, not 0%", () => {
    // D12: Meadow and Vale have no Apex, so their top of web IS a mesopredator eating Grazers.
    // There is no tier between it and the Grazers for §10.2 to be about, and a 0% printed there
    // would read as evidence about the cascade when it is an artefact of the node's shape.
    const rows = sweepOvercatch(loaded, RELEASE_SEEDS, "limiting", "hold");
    const undefinedRows = rows.filter((r) => !r.hasMesoPrey);
    expect(
      undefinedRows.length,
      "every node has Mesopredator-role prey — this test exercises nothing",
    ).toBeGreaterThan(0);
    for (const row of undefinedRows) {
      expect(row.mesoPreyFormNames, row.nodeId).toEqual([]);
      expect(row.mesoReleaseRate, row.nodeId).toBe(0);
      expect(row.mesoReleasedFormName, row.nodeId).toBeNull();
      // The clause being undefined is a fact about the web, not about the seeds: nothing the
      // collapsed predator eats is a Mesopredator.
      const web = deriveFoodWeb(toEcoNode(loaded.nodes.find((n) => n.id === row.nodeId)!), loaded.species, balance);
      for (const preyId of preyOf(web, row.topLineId)) {
        expect(roleOf(preyId), `${row.nodeId}: ${preyId} is prey of ${row.topLineId}`).not.toBe("Mesopredator");
      }
    }
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

  it("§4.3 says WHICH of its two rising columns is build-doc §10.2's clause", () => {
    // The prose and the table must agree about which column means the demo beat, because a reader
    // skimming §4.3 takes the bold number and the sentence under it and nothing else.
    expect(markdown, "§4.3 does not publish the mesopredator column").toContain("**and rising (meso)**");
    expect(markdown, "§4.3 does not publish the broader rebound under its own name").toContain("any prey rising");
    expect(markdown, "the prose still points at a column that is not §10.2's clause").toContain(
      "The column that means the demo beat is **and rising (meso)**",
    );
    // The bare header is what the broken version printed. It must not survive anywhere, or the two
    // measurements can be confused again by anyone quoting a column name.
    expect(markdown).not.toContain("| **and rising** |");
  });

  it("reports effort in no human units (G12)", () => {
    expect(markdown).not.toMatch(/\b(man|person|engineer(ing)?)[- ]?(hour|day|week|month)s?\b/i);
    expect(markdown).not.toMatch(/\b\d+\s*(hours?|days?|weeks?)\s+of\s+(work|effort)\b/i);
  });

  it("headlines a ceiling leader AT the level cap, and says coverage is what gets thrown (T-13)", () => {
    // The two things the report used to get wrong, asserted on the rendered markdown because the
    // markdown is what anyone tuning this game actually reads.
    const cap = balance.xp.levelCap;
    const ceiling = loaded.gyms.filter((g) => aceLevelFor(g) >= cap);
    expect(ceiling.length).toBeGreaterThan(0);
    const trained = measurements.gym?.find((r) => r.model === "trained");
    for (const gym of ceiling) {
      const row = trained?.gyms.find((g) => g.gymId === gym.id);
      expect(row?.playerLevel).toBe(cap);
      // The gym table's own row, verbatim: "<leader> | <type> | <cap> v <cap>". A headline that
      // slid back to the rank-and-file level fails here.
      expect(markdown).toContain(`| ${gym.name} | ${gym.type} | ${cap} v ${row?.topLevel ?? cap} |`);
      expect(markdown).not.toContain(
        `| ${gym.name} | ${gym.type} | ${Math.max(...gym.slots.map((s) => s.level))} v ${row?.topLevel ?? cap} |`,
      );
    }
    expect(markdown).toContain("The ceiling clause.");
    // The coverage column must say what it counts; the old header just said "coverage" while the
    // number underneath meant "knows a move it would not use".
    expect(markdown).toContain("coverage (thrown)");
    // …and the model section must state the rule rather than leave the reader to assume the old one.
    expect(markdown).toContain("what the team would actually\n   THROW");
  });

  it("says plainly that nothing was applied to data/balance.json", () => {
    expect(markdown).toMatch(/Nothing below has been applied/);
  });

  it("publishes the raid-suppressed control and attributes causes by measurement", () => {
    // The control has to be in the SHIPPED report, not only in this test file: build-doc §10's
    // claim is a thing the report states, and it can only state it from a run that happened.
    expect(markdown).toContain("`baseline-no-raid`");
    expect(markdown).toContain("raid events fired");
    expect(markdown).toContain("attributed — **by measurement**");
    expect(markdown).toContain("never because the node appears");
  });

  it("every measurement it prints came from a run that actually happened", () => {
    expect(measurements.gym?.length).toBe(2);
    expect(measurements.chart?.totalBattles).toBeGreaterThan(0);
    // One summary per published run spec — the three catch profiles crossed with the two raid
    // policies, so the raid-suppressed control is measured by `npm run harness`, not only by tests.
    expect(measurements.profiles?.length).toBe(PLAY_PROFILES.length);
    expect(measurements.profiles?.filter((p) => p.spec.raids === "suppressed").length).toBe(3);
    for (const p of measurements.profiles ?? []) {
      if (p.spec.raids === "suppressed") expect(p.raidEvents).toBe(0);
      else expect(p.raidEvents).toBeGreaterThan(0);
    }
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
    // The report is generated output, so it is written outside `docs/`, which holds only
    // authored documents. Pinned exactly: a silent default drift puts build output back in docs/.
    expect(params.reportPath).toBe("build/BALANCE-REPORT.md");
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
