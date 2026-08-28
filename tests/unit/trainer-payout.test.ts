/**
 * tests/unit/trainer-payout.test.ts — beating the rival pays a purse, on the tape, exactly once.
 *
 * ══ WHAT WAS TRUE BEFORE, MEASURED ══
 * `core/save.ts` shipped the whole purse mechanism — `trainerPayout`, `payoutAction`, `readPayout`,
 * `applyPayout` and `replay`'s `case "payout"` arm — and NOTHING in `game/` called any of it. A
 * grep of `game/` for `trainerPayout|payoutAction|applyPayout` returned zero hits, so
 * `save.money` had exactly one value for the whole run: the `0` `newSave` seeds. content-bible §11
 * says "Currency from quests + trainer battles"; trainer battles paid nothing, because no line of
 * code joined the fight to the purse.
 *
 * `game/wild-battle.ts` `applyBattleResult` is where the four launchers converge — wild, gym, rival
 * and finale all call it and nothing else writes a finished fight to the save — so it is the only
 * place a purse can be levied ONCE per fight rather than once per call site. That join is what is
 * under test here.
 *
 * ══ WHAT IS PROVED BELOW, EACH WRITTEN TO BE ABLE TO FAIL ══
 *   §1 a WON rival fight — the real `data/gyms.json` encounter, played through the real reducer —
 *      moves `save.money` by exactly `trainerPayout(the levels he fielded)`, and the arithmetic is
 *      re-derived here from `balance.economy.trainerPayoutFlat` and `.trainerPayoutPerLevel` rather
 *      than taken on trust — including that the flat half is levied at all;
 *   §2 a LOST rival fight pays nothing and puts nothing on the tape;
 *   §3 wild, gym and ancient pay nothing even when WON — the predicate is bound to the `kind` the
 *      real builders stamp, so a launcher that changed kind would go red here;
 *   §4 L10 — the purse is on the tape and `replay` reproduces it byte-for-byte, and a tape with the
 *      payout entry stripped replays to a poorer save (so the entry, not luck, is the mechanism);
 *   §5 EXACTLY ONCE — one call appends one payout entry, and the four call sites in
 *      `game/scenes/OverworldScene.ts` are one call per fight, each supplying the `balance` without
 *      which the purse is silently zero.
 *
 * ══ WHY NO PURSE, LEVEL OR SPECIES IS TYPED AS A LITERAL HERE ══
 * G2 and G11. The rival's roster is read out of `content.rival`, the purse's two terms out of
 * `balance.economy.trainerPayoutFlat` and `.trainerPayoutPerLevel`, and every expected amount is
 * arithmetic over those.
 * A retune of `data/balance.json` moves the expectations with it; it does not turn this file red.
 *
 * No engine import — every module under test is engine-free (L11), so §5's check of the Phaser
 * scene reads it as TEXT rather than importing it.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  makeBattleContext,
  predationOracleFromWebs,
  startBattle,
  step as battleStep,
  type BattleContext,
} from "@core/battle";
import { deriveFoodWeb, indexSpecies, toEcoNode } from "@core/foodweb";
import { newOwnedCreature } from "@core/lifecycle";
import { subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import {
  canonicalStringify,
  newSave,
  PAYOUT_ACTION,
  readPayout,
  replay,
  serialize,
  trainerPayout,
  type SaveEnvelope,
} from "@core/save";
import type {
  BattleInput,
  BattlerSpec,
  BattleState,
  Content,
  NodeFile,
  OwnedCreature,
  RivalEncounter,
} from "@core/types";
import { buildGymBattle } from "@game/gym-battle";
import { buildVellsireBattle } from "@game/finale";
import { buildRivalBattle, rivalBattleWon, rivalParty } from "@game/rival";
import {
  applyBattleResult,
  buildWildBattle,
  liveNodeOf,
  partySpecs,
  starterLines,
  trainerPurse,
} from "@game/wild-battle";
import type { Encounter } from "@game/encounters";

const content: Content = validateContent();
const balance = content.balance;

/** The act-1 rival as `data/gyms.json` ships him — read, never named (G2). */
const RIVAL: RivalEncounter = (() => {
  const first = content.rival[0];
  if (!first) throw new Error("data/gyms.json ships no rival[] rows — §1 has no fight to run");
  return first;
})();

function nodeFile(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

/**
 * A party member of the starter line at a chosen level, built by `core/lifecycle.ts` so its `maxHp`
 * and stats are the game's own and not a fixture's guess. The LINE is read through
 * `starterLines`, so no species id appears in this file (G2).
 */
function fighter(level: number, uid: string): OwnedCreature {
  const line = starterLines(content)[0];
  if (!line) throw new Error("data ships no starter line — the fixture cannot be built");
  return newOwnedCreature(
    { uid, lineId: line.id, age: "A", level, caughtYear: balance.clock.startYear },
    line,
    balance,
  );
}

/** A save standing where the rival is, carrying `party`. */
function saveWith(party: OwnedCreature[], nodeId: string): SaveEnvelope {
  const save = newSave({ seed: 4242, currentNode: nodeId, nodes: content.nodes }, balance);
  return { ...save, party };
}

function ctxAt(nodeId: string): BattleContext {
  const web = deriveFoodWeb(toEcoNode(nodeFile(nodeId)), indexSpecies(content.species), balance);
  return makeBattleContext(content, predationOracleFromWebs([web]));
}

/**
 * Play a battle to a terminal outcome, the player taking `pick(state)` each turn.
 *
 * The turn cap is a rig guard, not a rule: an action the reducer rejects makes no progress, which
 * without a cap is a hang rather than a failure.
 */
function playOut(
  input: BattleInput,
  ctx: BattleContext,
  pick: (state: BattleState) => Parameters<typeof battleStep>[1],
  cap = 4000,
): BattleState {
  const rng = subsystemRng(input.seed, "battle");
  let state = startBattle(input, ctx).state;
  for (let turn = 0; state.outcome === null && turn < cap; turn += 1) {
    state = battleStep(state, pick(state), rng, ctx).state;
  }
  return state;
}

/** The active player battler's first move — the reducer's own list, never a move id typed here. */
function firstMove(state: BattleState): Parameters<typeof battleStep>[1] {
  const active = state.battlers[state.activePlayerUid];
  const moveId = active?.moves[0];
  if (moveId === undefined) throw new Error("the active player battler knows no moves");
  return { kind: "move", moveId };
}

/** One rival fight through the shipped launcher, played out. */
function rivalFight(save: SaveEnvelope): BattleState {
  const built = buildRivalBattle({
    content,
    save,
    rival: RIVAL,
    node: liveNodeOf(content, save, RIVAL.node),
  });
  return playOut(built.input, built.ctx, firstMove);
}

let wonCache: { before: SaveEnvelope; state: BattleState } | null = null;

/**
 * A rival fight the player WINS — found by levelling the party up until the shipped roster falls,
 * never by naming a level that happens to work today. The party is `maxPartySize` strong because a
 * one-creature team can be worn down by a roster of any length.
 */
function wonRivalFight(): { before: SaveEnvelope; state: BattleState } {
  if (wonCache) return wonCache;
  const tried: string[] = [];
  for (let level = balance.xp.starterLevel; level <= balance.xp.levelCap; level += 1) {
    const party: OwnedCreature[] = [];
    for (let i = 0; i < balance.party.maxPartySize; i += 1) {
      party.push(fighter(level, `p${String(i)}`));
    }
    const before = saveWith(party, RIVAL.node);
    const state = rivalFight(before);
    tried.push(`L${String(level)} → ${String(state.outcome)}`);
    if (rivalBattleWon(state)) {
      wonCache = { before, state };
      return wonCache;
    }
  }
  throw new Error(
    `no party up to the level cap beat ${RIVAL.id} — §1's fixture needs re-finding, not its ` +
      `assertion weakening. Tried: ${tried.join(", ")}`,
  );
}

/** A rival fight the player LOSES — one creature at level 1 against the shipped roster. */
function lostRivalFight(): { before: SaveEnvelope; state: BattleState } {
  const before = saveWith([fighter(1, "doomed")], RIVAL.node);
  const state = rivalFight(before);
  if (state.outcome !== "loss") {
    throw new Error(
      `the loss rig did not lose (outcome ${String(state.outcome)}) — §2 would prove nothing. ` +
        "Re-find the matchup; do not weaken the assertion.",
    );
  }
  return { before, state };
}

/** The levels the loser actually fielded, off the reducer's own enemy order. */
function enemyLevels(state: BattleState): number[] {
  return state.enemyOrder.map((uid) => {
    const battler = state.battlers[uid];
    if (!battler) throw new Error(`enemyOrder names ${uid}, which is not in battlers`);
    return battler.level;
  });
}

/** Every payout entry on a save's tape, as amounts. */
function payoutsOn(save: SaveEnvelope): number[] {
  const out: number[] = [];
  for (const entry of save.actionLog) {
    const amount = readPayout(entry.action);
    if (amount !== null) out.push(amount);
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 A won rival battle pays the purse bible §11 names
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the purse (bible §11 — currency from trainer battles)", () => {
  it("the rival IS a trainer battle — the real builder stamps `kind: \"trainer\"`", () => {
    const save = saveWith([fighter(balance.xp.starterLevel, "p0")], RIVAL.node);
    const built = buildRivalBattle({
      content,
      save,
      rival: RIVAL,
      node: liveNodeOf(content, save, RIVAL.node),
    });
    // `core/types.ts` BATTLE_KINDS has no "rival" member; this is the mapping the purse predicate
    // keys on, so it is bound to the launcher rather than assumed.
    expect(built.input.kind).toBe("trainer");
  });

  it("moves save.money by exactly trainerPayout(the levels he fielded)", () => {
    const { before, state } = wonRivalFight();
    const levels = enemyLevels(state);

    // THE RIG FIRST: a fight against an empty roster would pay zero and prove nothing.
    expect(levels.length, "the rival fielded nobody — this fixture cannot show a purse").toBe(
      rivalParty(RIVAL).length,
    );
    const expected = trainerPayout(levels, balance);
    expect(expected, "the shipped roster prices at zero — §1 would pass vacuously").toBeGreaterThan(0);

    const after = applyBattleResult(before, state, balance);
    expect(after.money - before.money).toBe(expected);
  });

  it("and that amount is `trainerPayoutFlat` + `trainerPayoutPerLevel` × the sum of the levels — arithmetic, re-derived", () => {
    const { before, state } = wonRivalFight();
    const levels = enemyLevels(state);
    // Re-derived from data rather than delegated to `trainerPayout`, so a change to that function
    // that stopped reading balance.json would be visible here.
    let sum = 0;
    for (const level of levels) sum += level;
    const flat = balance.economy.trainerPayoutFlat;
    const rate = balance.economy.trainerPayoutPerLevel;
    // Neither half taken on trust: a zeroed tunable would let the arithmetic below hold over
    // nothing, and the second of the two is the one this ruling is vulnerable to losing.
    expect(flat).toBeGreaterThan(0);
    expect(rate).toBeGreaterThan(0);

    const after = applyBattleResult(before, state, balance);
    expect(after.money - before.money).toBe(Math.round(flat + rate * sum));
    /*
     * ⚠ AND THE FLAT PER-FIGHT FEE IS REALLY IN THERE. Hank's ruling — "Make it so that earnings
     * don't scale quite as much... that point shouldn't be until probably Act 5" — is the reason
     * a purse is not `rate × Σ levels`: the rival's summed levels grow 15x across the six acts, so
     * any purely per-level purse reproduces that spread and money is abundant by act 2.
     * `balance.economy._trainerPayout` carries the whole ruling. Revert the formula and this line
     * is what names the loss, at the seam where the game actually pays rather than at the primitive.
     */
    expect(after.money - before.money).not.toBe(Math.round(rate * sum));
    // And it really is the LEVELS and not the head-count: a roster of N creatures at level L pays
    // flat + N×L×rate, so the two must differ unless every level is 1.
    expect(sum).not.toBe(levels.length);
  });

  it("pays nothing without a balance — the seam a launcher must supply, said out loud", () => {
    /*
     * `applyBattleResult`'s third argument is OPTIONAL because `SaveEnvelope` and `BattleState`
     * carry no `Balance` and making it required would not compile in three test files and in
     * `game/scenes/OverworldScene.ts`, none of which this lane may edit. The consequence is a real
     * hazard and is asserted rather than described: a launcher that forgets the argument pays
     * nothing while looking correct. §5 is the check that the launchers do not forget.
     */
    const { before, state } = wonRivalFight();
    const after = applyBattleResult(before, state);
    expect(after.money).toBe(before.money);
    expect(payoutsOn(after)).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 A lost rival battle pays nothing
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 a loss pays nothing", () => {
  it("leaves money untouched and puts no payout on the tape", () => {
    const { before, state } = lostRivalFight();
    expect(state.kind).toBe("trainer");
    expect(rivalBattleWon(state)).toBe(false);

    const after = applyBattleResult(before, state, balance);
    expect(after.money).toBe(before.money);
    expect(payoutsOn(after)).toEqual([]);
    // The fight still cost something, so this is not a fight that simply did not happen.
    expect(canonicalStringify(after.party)).not.toBe(canonicalStringify(before.party));
  });

  it("trainerPurse answers zero for every non-win outcome of a trainer fight", () => {
    const { state } = wonRivalFight();
    for (const outcome of ["loss", "fled", "caught", "escaped", null] as const) {
      expect(trainerPurse({ ...state, outcome }, balance)).toBe(0);
    }
    // …and the same state with its own outcome is not zero, so the loop above can fail.
    expect(trainerPurse(state, balance)).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 Wild, gym and ancient pay nothing — even when won
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 only trainer battles pay", () => {
  /** A fight of `kind` against one enemy already on its last hit point, so the player wins it. */
  function wonFightOfKind(kind: BattleInput["kind"]): { before: SaveEnvelope; state: BattleState } {
    const before = saveWith([fighter(balance.xp.levelCap, "p0")], RIVAL.node);
    const enemy: BattlerSpec = {
      uid: "one-hit",
      lineId: RIVAL.signature.lineId,
      age: RIVAL.signature.age,
      level: RIVAL.signature.level,
      traits: [],
      curHp: 1,
    };
    const state = playOut(
      { seed: before.seed, kind, playerParty: partySpecs(before), enemyParty: [enemy], bag: {} },
      ctxAt(RIVAL.node),
      firstMove,
    );
    if (state.outcome !== "win") {
      throw new Error(
        `the ${kind} rig did not win (outcome ${String(state.outcome)}) — the assertion below ` +
          "would prove nothing. Re-find the matchup; do not weaken it.",
      );
    }
    return { before, state };
  }

  for (const kind of ["wild", "gym", "ancient"] as const) {
    it(`a WON ${kind} battle pays nothing`, () => {
      const { before, state } = wonFightOfKind(kind);
      const after = applyBattleResult(before, state, balance);
      expect(after.money).toBe(before.money);
      expect(payoutsOn(after)).toEqual([]);
      expect(trainerPurse(state, balance)).toBe(0);
    });
  }

  it("the same rig with kind `trainer` DOES pay — so the three above are not vacuous", () => {
    const { before, state } = wonFightOfKind("wild");
    const asTrainer: BattleState = { ...state, kind: "trainer" };
    const after = applyBattleResult(before, asTrainer, balance);
    expect(after.money - before.money).toBe(trainerPayout(enemyLevels(asTrainer), balance));
    expect(payoutsOn(after)).toHaveLength(1);
  });

  it("the three non-paying launchers really do stamp those kinds", () => {
    const save = saveWith([fighter(balance.xp.starterLevel, "p0")], RIVAL.node);

    const wild = buildWildBattle({
      content,
      save,
      encounter: someEncounter(),
      node: toEcoNode(nodeFile(RIVAL.node)),
    });
    expect(wild.input.kind).toBe("wild");

    const gym = content.gyms[0];
    if (!gym) throw new Error("data/gyms.json ships no gyms — the gym clause cannot be bound");
    const gymBuild = buildGymBattle({
      content,
      save,
      gym,
      node: liveNodeOf(content, save, gym.town),
    });
    expect(gymBuild.input.kind).toBe("gym");

    const finale = buildVellsireBattle({
      content,
      save,
      act: content.rival.length,
      rng: subsystemRng(save.seed, "battle"),
    });
    expect(finale.input.kind).toBe("ancient");
  });
});

/** Some encounter the rival's node offers — read from the node file, never named here (G2). */
function someEncounter(): Encounter {
  const lineId = Object.keys(nodeFile(RIVAL.node).populations)[0];
  if (lineId === undefined) throw new Error(`node ${RIVAL.node} carries no populations`);
  return { nodeId: RIVAL.node, lineId, age: "J", level: 3, traits: [] };
}

/* ════════════════════════════════════════════════════════════════════════════
 * §4 L10 — the purse is on the tape, and the tape replays to it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 determinism (build-doc §8.1 / L10)", () => {
  const deps = {
    gyms: content.gyms,
    species: content.species,
    balance,
    nodes: content.nodes,
  };

  function paid(): { before: SaveEnvelope; live: SaveEnvelope } {
    const { before, state } = wonRivalFight();
    return { before, live: applyBattleResult(before, state, balance) };
  }

  it("core/save.ts's replay of the tape lands exactly where the live path landed", () => {
    const { before, live } = paid();

    // THE RIG FIRST: if the purse were zero, an empty replay would agree with it trivially.
    expect(live.money).toBeGreaterThan(before.money);

    const replayed = replay({ ...before, actionLog: [] }, live.actionLog, deps);
    expect(replayed.money).toBe(live.money);
    expect(serialize(replayed)).toBe(serialize(live));
  });

  it("and it is the PAYOUT ENTRY that carries it — a tape without it replays poorer", () => {
    /*
     * The sibling above would be satisfied by any tape that happened to reproduce the save; this
     * one names the mechanism. Strip the payout entry — renumbering, because `replay` refuses a log
     * with a gap — and the replayed purse is the purse that never fought.
     */
    const { before, live } = paid();
    const stripped = live.actionLog
      .filter((e) => (e.action as { t: string }).t !== PAYOUT_ACTION)
      .map((e, i) => ({ ...e, seq: i }));
    expect(stripped.length).toBeLessThan(live.actionLog.length);

    const without = replay({ ...before, actionLog: [] }, stripped, deps);
    expect(without.money).toBe(before.money);
    expect(without.money).not.toBe(live.money);
  });

  it("a fight that pays nothing writes no payout entry at all", () => {
    // Not an aesthetic point: a `{t:"payout",amount:0}` on every wild fight would change the tape
    // of every existing save's fights, and `applyRunFlags`'s "nothing to do" early return is the
    // shape this mirrors.
    const { before, state } = lostRivalFight();
    const withBalance = applyBattleResult(before, state, balance);
    const without = applyBattleResult(before, state);
    expect(serialize(withBalance)).toBe(serialize(without));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 Exactly once — per fight, not per call site
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 the purse is levied exactly once", () => {
  it("one call appends exactly one payout entry", () => {
    const { before, state } = wonRivalFight();
    const after = applyBattleResult(before, state, balance);
    expect(payoutsOn(after)).toHaveLength(1);
    expect(payoutsOn(after)[0]).toBe(trainerPayout(enemyLevels(state), balance));
  });

  it("calling it twice pays twice — so 'once' is a property of the WIRING, said out loud", () => {
    /*
     * `applyPayout` is ADDITIVE (it must be: two trainers beaten in one session are two purses), so
     * nothing inside this function can make a second call idempotent. "Exactly once" therefore
     * means "each launcher's finish handler calls it once", which is what the source check below
     * measures. This test exists so that fact is written down rather than assumed.
     */
    const { before, state } = wonRivalFight();
    const once = applyBattleResult(before, state, balance);
    const twice = applyBattleResult(once, state, balance);
    expect(twice.money - before.money).toBe(2 * (once.money - before.money));
  });

  const SCENE = fileURLToPath(new URL("../../game/scenes/OverworldScene.ts", import.meta.url));

  /** The argument text of every `applyBattleResult(...)` CALL in a source file. */
  function callArgs(source: string): string[] {
    const calls: string[] = [];
    const needle = "applyBattleResult(";
    for (let i = source.indexOf(needle); i !== -1; i = source.indexOf(needle, i + 1)) {
      let depth = 0;
      let j = i + needle.length - 1;
      for (; j < source.length; j += 1) {
        const ch = source[j];
        if (ch === "(") depth += 1;
        else if (ch === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      calls.push(source.slice(i + needle.length, j));
    }
    return calls;
  }

  /** Top-level (depth-0) commas — `f(a, g(b, c))` is two arguments, not three. */
  function argCount(args: string): number {
    let depth = 0;
    let count = 1;
    for (const ch of args) {
      if (ch === "(" || ch === "[" || ch === "{") depth += 1;
      else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
      else if (ch === "," && depth === 0) count += 1;
    }
    return args.trim().length === 0 ? 0 : count;
  }

  it("the overworld's four launchers call it once each — and every call supplies the balance", () => {
    const source = readFileSync(SCENE, "utf8");
    const calls = callArgs(source);

    // THE RIG FIRST: if the scene stopped calling it at all, an empty list would pass every
    // assertion below. Four launchers — wild, gym, rival, finale — one call each.
    expect(calls, `no applyBattleResult( call found in ${SCENE}`).toHaveLength(4);

    for (const args of calls) {
      // Three arguments: the save, the finished state, and the `Balance` the purse is priced from.
      // Without the third the fight is applied and the purse is silently zero — the hazard §1's
      // fourth case demonstrates.
      expect(argCount(args), `applyBattleResult(${args}) is missing its balance argument`).toBe(3);
    }
  });
});
