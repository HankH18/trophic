/**
 * tests/unit/battle-launch-guards.test.ts — the one clause all four fight launchers share.
 *
 * ══ WHY THIS FILE EXISTS ══
 * `wildBattleProblem`, `gymBattleProblem`, `rivalBattleProblem` and `vellsireBattleProblem` each
 * refuse a fight the player cannot start, and each is tested in its own module's file. What NO
 * per-module file could see is that all four asked the same wrong question: `partySpecs(save)
 * .length === 0` counts party MEMBERS, so a party made only of FAINTED creatures passed every one
 * of them and `core/battle.ts` `startBattle` then threw
 *
 *     "startBattle: every battler in the player party is already fainted — there is nothing to
 *      field."
 *
 * — an exception out of the pure reducer where a sentence to the player was owed, and, since
 * `game/scenes/OverworldScene.ts` `handOffToBattle` charges `clock.battleTicks` at launch, a crash
 * with the tick already spent. Four copies of one clause is how the first half came to be right in
 * four places and the second half missing from all four, so the clause now lives ONCE
 * (`game/wild-battle.ts` `partyProblem`) and this file is the check that all four reach it.
 *
 * ══ WHAT IS PROVED, EACH WRITTEN TO BE ABLE TO FAIL ══
 *   §1 the standing condition is `core/battle.ts`'s own, not a second reading of it — asserted by
 *      running `startBattle` on the very parties the guards accept and refuse;
 *   §2 all four refuse an all-fainted party, and SAY why;
 *   §3 all four still accept a party that merely CARRIES a fainted member, because `startBattle`
 *      does — a guard that refused that would shorten every fight after the first faint;
 *   §4 the refusals read like the other refusals in this game (G7: plain, no lesson).
 *
 * No engine import: all four modules are engine-free on purpose.
 */

import { describe, expect, it } from "vitest";

import { actGates, actOf } from "@core/acts";
import { makeBattleContext, predationOracleFromWebs, startBattle } from "@core/battle";
import { deriveFoodWeb, indexSpecies, toEcoNode } from "@core/foodweb";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { BattleInput, Content, OwnedCreature } from "@core/types";

import { gymAtNode, gymBattleProblem } from "@game/gym-battle";
import { rivalAtNode, rivalBattleProblem } from "@game/rival";
import { finaleNodeId, vellsireBattleProblem } from "@game/finale";
import {
  isStanding,
  partyProblem,
  partySpecs,
  provisionalStarter,
  standingSpecs,
  wildBattleProblem,
} from "@game/wild-battle";

const content: Content = validateContent();
const balance = content.balance;

/** The earliest fight of a kind the region actually has — read from data, never named here (G2). */
function lowestAct<T extends { act: number }>(rows: readonly T[], what: string): T {
  const first = [...rows].sort((a, b) => a.act - b.act)[0];
  if (!first) throw new Error(`data/gyms.json ships no ${what} — the fixture cannot be built`);
  return first;
}

const GYM = lowestAct(content.gyms, "leader");
const RIVAL = lowestAct(content.rival, "rival encounter");

/**
 * The quest flags that open the act ladder as far as those two, read out of `balance.acts.gates`
 * rather than named here (G2/G11 — `story.opening.done` is the DATA's spelling, not this file's).
 *
 * The point of opening the ladder is that the act clause of `gymBattleProblem` and
 * `rivalBattleProblem` must not be the thing firing: this file is about the PARTY clause, and a
 * fixture that is refused for the wrong reason proves nothing about the right one.
 */
const LADDER_FLAGS: Record<string, boolean> = {};
for (const gate of actGates(balance)) {
  if (gate.act > Math.max(GYM.act, RIVAL.act)) continue;
  for (const flag of gate.flags) LADDER_FLAGS[flag] = true;
}

/** A save standing where the finale is, act ladder open, carrying `party`. */
function saveWithParty(party: OwnedCreature[]): SaveEnvelope {
  const save = newSave(
    { seed: balance.rng.defaultSeed, currentNode: finaleNodeId(balance), nodes: content.nodes },
    balance,
  );
  return { ...save, party, questFlags: { ...save.questFlags, ...LADDER_FLAGS } };
}

function starter(uid: string, curHp?: number): OwnedCreature {
  const base = provisionalStarter(content);
  if (!base) throw new Error("no starter line — the fixture cannot be built");
  const made: OwnedCreature = { ...base, uid };
  if (curHp !== undefined) made.curHp = curHp;
  return made;
}

/**
 * The four guards, called the way the overworld calls them, with everything but the party made
 * permissive. Each returns the refusal string or null.
 *
 * The gym and the rival also refuse on the ACT ladder and on an already-won badge; those clauses
 * are their own modules' tests' business. Here the fixtures are chosen so the party clause is the
 * only one that can fire — which is exactly what makes a change in the party clause visible.
 */
function allFourProblems(save: SaveEnvelope): Record<string, string | null> {
  return {
    wild: wildBattleProblem(save),
    gym: gymBattleProblem(save, GYM, content),
    rival: rivalBattleProblem(save, RIVAL, content),
    vellsire: vellsireBattleProblem(save),
  };
}

/** `startBattle` fielding this save's party against one healthy enemy — the throw, or null. */
function reducerThrow(save: SaveEnvelope): string | null {
  const nodeId = finaleNodeId(balance);
  const file = content.nodes.find((n) => n.id === nodeId);
  if (!file) throw new Error(`no node ${nodeId}`);
  const web = deriveFoodWeb(toEcoNode(file), indexSpecies(content.species), balance);
  const ctx = makeBattleContext(content, predationOracleFromWebs([web]));
  const enemy = { ...partySpecs(saveWithParty([starter("enemy")]))[0]!, uid: "enemy" };
  const input: BattleInput = {
    seed: save.seed,
    kind: "wild",
    playerParty: partySpecs(save),
    enemyParty: [enemy],
    nodeId,
    bag: {},
  };
  try {
    startBattle(input, ctx);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

describe("§1 the standing condition is core/battle.ts's own, asked one step earlier", () => {
  it("the fixture's act ladder is open, so the PARTY clause is the only one that can fire", () => {
    /*
     * The control on every "expect(problem).toBeNull()" below. Without it, a data change that put
     * the earliest gym behind a badge would make those assertions pass for the act clause's
     * reason and this file would quietly stop testing what it claims to test.
     */
    const act = actOf(saveWithParty([starter("a")]), content.gyms, balance);
    expect(act).toBeGreaterThanOrEqual(GYM.act);
    expect(act).toBeGreaterThanOrEqual(RIVAL.act);
  });

  it("`isStanding` reads an absent curHp as FULL, not as zero", () => {
    // `BattlerSpec.curHp` is an optional carry-in: a creature that has never been hurt has none.
    // A guard written as `curHp > 0` alone would refuse a brand-new party — the opposite defect.
    expect(isStanding({})).toBe(true);
    expect(isStanding({ curHp: 1 })).toBe(true);
    expect(isStanding({ curHp: 0 })).toBe(false);
  });

  it("BINDS — the parties the guards refuse are exactly the parties startBattle cannot field", () => {
    /*
     * ⚠ THE MEASUREMENT THIS FILE EXISTS FOR. Before the repair, `allFourProblems` returned four
     * nulls for the all-fainted party below — every launcher said "go ahead" — and `startBattle`
     * threw. The two columns are asserted TOGETHER so neither can drift alone: a guard that starts
     * refusing something the reducer can field, or fielding something it cannot, is red here.
     */
    const cases: Array<{ what: string; save: SaveEnvelope }> = [
      { what: "empty", save: saveWithParty([]) },
      { what: "all fainted", save: saveWithParty([starter("a", 0), starter("b", 0)]) },
      { what: "one fainted, one standing", save: saveWithParty([starter("a", 0), starter("b")]) },
      { what: "healthy", save: saveWithParty([starter("a")]) },
      { what: "hurt but standing", save: saveWithParty([starter("a", 1)]) },
    ];
    const disagreements: string[] = [];
    for (const { what, save } of cases) {
      const guardsRefuse = Object.values(allFourProblems(save)).some((p) => p !== null);
      const reducerRefuses = reducerThrow(save) !== null;
      if (guardsRefuse !== reducerRefuses) {
        disagreements.push(
          `${what}: guards ${guardsRefuse ? "refuse" : "accept"} but startBattle ` +
            `${reducerRefuses ? "throws" : "fields it"}`,
        );
      }
    }
    // Named, not counted — the list tells the next reader which party the two disagree about.
    expect(disagreements, "a party the guards and the reducer disagree about").toEqual([]);
  });
});

describe("§2 an all-fainted party is refused by all four, out loud", () => {
  const fainted = saveWithParty([starter("a", 0), starter("b", 0)]);

  it("the party is not empty — this is a MEMBER count passing and a STANDING count failing", () => {
    // Without this the test below could pass for the old reason (an empty party) and prove nothing.
    expect(partySpecs(fainted)).toHaveLength(2);
    expect(standingSpecs(fainted)).toHaveLength(0);
  });

  it("BINDS — every one of the four refuses, and none of them reaches the reducer's throw", () => {
    const problems = allFourProblems(fainted);
    const silent = Object.entries(problems)
      .filter(([, p]) => p === null)
      .map(([name]) => name);
    expect(silent, "a launcher that would hand an all-fainted party to startBattle").toEqual([]);
    for (const [name, problem] of Object.entries(problems)) {
      // The wording is `game/scenes/OverworldScene.ts` `unfieldableProblem`'s, on purpose — one
      // condition, one sentence. Asserted here so a reworded refusal is a decision, not a drift.
      expect(problem, name).toBe("nothing in the party is standing — nothing can be sent out");
    }
    // …and the reducer really would have thrown, so the refusals above are not theatre.
    expect(reducerThrow(fainted)).toMatch(/already fainted/);
  });

  it("an EMPTY party keeps its own refusal — the two facts are not collapsed into one string", () => {
    const empty = saveWithParty([]);
    for (const [name, problem] of Object.entries(allFourProblems(empty))) {
      expect(problem, name).toMatch(/no creature in the party/);
    }
  });
});

describe("§3 a party that merely CARRIES a fainted member is still fightable", () => {
  it("BINDS — the fainted member is neither refused nor dropped from the fight", () => {
    /*
     * `core/battle.ts` fields the first STANDING member and keeps the rest available to switch in,
     * so the fainted one must survive into `playerParty`. A guard that filtered `partySpecs` instead
     * of counting a separate `standingSpecs` would have silently shortened every party after its
     * first faint — the same class of defect as the one repaired, pointing the other way.
     */
    const mixed = saveWithParty([starter("down", 0), starter("up")]);
    for (const [name, problem] of Object.entries(allFourProblems(mixed))) {
      expect(problem, name).toBeNull();
    }
    expect(partySpecs(mixed).map((s) => s.uid)).toEqual(["down", "up"]);
    expect(standingSpecs(mixed).map((s) => s.uid)).toEqual(["up"]);
    expect(reducerThrow(mixed)).toBeNull();
  });

  it("boxed members are still not party members, fainted or standing", () => {
    const boxed = saveWithParty([{ ...starter("boxed"), boxed: true }, starter("up")]);
    expect(partySpecs(boxed).map((s) => s.uid)).toEqual(["up"]);
    expect(partyProblem(boxed)).toBeNull();
    expect(partyProblem(saveWithParty([{ ...starter("boxed", 0), boxed: true }]))).toMatch(
      /no creature in the party/,
    );
  });
});

describe("§4 the refusal reads like the others (G7 — plainly, with no lesson in it)", () => {
  it("is one lower-case clause joined by an em dash, and says nothing about the player", () => {
    const problem = partyProblem(saveWithParty([starter("a", 0)]));
    expect(problem).not.toBeNull();
    const said = problem ?? "";
    // The shape the sibling refusals already have: "<the fact> — <what follows from it>".
    expect(said).toContain(" — ");
    expect(said[0]).toBe(said[0]?.toLowerCase());
    expect(said).not.toMatch(/[.!?]$/);
    // G7: no second person, no verdict on what the player did.
    expect(said).not.toMatch(/\byou\b|\byour\b|should|shouldn't|too many|careless/i);
  });

  it("all four say the SAME thing, because there is one clause and not four", () => {
    const problems = Object.values(allFourProblems(saveWithParty([starter("a", 0)])));
    expect(new Set(problems).size).toBe(1);
    expect(problems[0]).toBe(partyProblem(saveWithParty([starter("a", 0)])));
  });
});
