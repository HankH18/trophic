/**
 * tests/unit/gym-battle.test.ts — the join between standing in a town and earning a badge.
 *
 * WHY THIS FILE EXISTS. `core/acts.ts` has exactly one numeric input — badges — and
 * `OverworldScene.winGym`, the only writer of a badge flag, had NO CALLER ANYWHERE. Measured
 * through the real scene on a brand-new save: act 0, one unlocked node, and no reachable route to a
 * badge. `balance.acts.gates` opens Brackwater at one badge, so build-doc §16's never-cut vertical
 * slice (Hearthollow → R1 → Brackwater → R2) was unreachable by playing.
 *
 * The fight itself is `core/battle.ts`'s and is driven here through the REAL reducer, not a mock:
 * the point of the module is that nothing about a gym fight is decided in `game/`.
 */

import { describe, expect, it } from "vitest";
import { startBattle, step as battleStep } from "@core/battle";
import { actOf, awardBadge } from "@core/acts";
import { validateContent } from "@core/schemas";
import { newSave, type SaveEnvelope } from "@core/save";
import { subsystemRng } from "@core/rng";
import type { BattleAction, Content, GymLeader } from "@core/types";
import {
  buildGymBattle,
  gymAtNode,
  gymBattleProblem,
  gymBattleWon,
  gymParty,
  gymRoster,
} from "@game/gym-battle";
import { liveNodeOf, provisionalStarter } from "@game/wild-battle";

const content: Content = validateContent();
const balance = content.balance;
const LADDER: GymLeader[] = [...content.gyms].sort((a, b) => a.act - b.act);
const FIRST = LADDER[0] as GymLeader;

function saveAt(nodeId: string): SaveEnvelope {
  const save = newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);
  const starter = provisionalStarter(content);
  const withParty = starter ? { ...save, party: [starter] } : save;
  // The opening chain's exit condition, so the save is in act 1 rather than the prologue.
  return { ...withParty, questFlags: { ...withParty.questFlags, "story.opening.done": true } };
}

describe("gym-battle — which leader is standing where", () => {
  it("finds a leader by their bible §7 town, and reports a route as having none", () => {
    expect(gymAtNode(content, FIRST.town)?.id).toBe(FIRST.id);
    const route = content.nodes.find((n) => !content.gyms.some((g) => g.town === n.id));
    expect(route, "every node has a gym — the fixture assumes some do not").toBeDefined();
    expect(gymAtNode(content, route?.id ?? "")).toBeNull();
    expect(gymAtNode(content, "no-such-node")).toBeNull();
  });

  it("every leader's town is a real node, and no two leaders share one", () => {
    const towns = content.gyms.map((g) => g.town);
    expect(new Set(towns).size).toBe(towns.length);
    for (const town of towns) expect(content.nodes.some((n) => n.id === town)).toBe(true);
  });
});

describe("gym-battle — the refusals, each of which is SAID rather than silent", () => {
  it("an empty party cannot send anything out", () => {
    const empty = { ...saveAt(FIRST.town), party: [] };
    expect(gymBattleProblem(empty, FIRST, content)).toMatch(/no creature/u);
  });

  it("a badge already won is not fought again", () => {
    const done = { ...saveAt(FIRST.town), ...awardBadge(saveAt(FIRST.town), FIRST.id, balance) };
    expect(gymBattleProblem(done, FIRST, content)).toContain("already won");
  });

  it("a leader whose ACT the player has not reached is refused, and the act is named", () => {
    // Standing in the town is not permission to fight: the ladder is the permission.
    const later = LADDER.find((g) => g.act > 1) as GymLeader;
    const save = saveAt(later.town);
    expect(actOf(save, content.gyms, balance)).toBeLessThan(later.act);
    expect(gymBattleProblem(save, later, content)).toContain(`act ${String(later.act)}`);
  });

  it("…and nothing refuses the act's own leader", () => {
    expect(gymBattleProblem(saveAt(FIRST.town), FIRST, content)).toBeNull();
  });
});

describe("gym-battle — the input is data/gyms.json, mapped and not invented (G2)", () => {
  it("the enemy party IS the roster: slots then signature, in order", () => {
    const roster = gymRoster(FIRST);
    expect(roster).toHaveLength(FIRST.slots.length + 1);
    expect(roster[roster.length - 1]).toEqual(FIRST.signature);

    const party = gymParty(FIRST);
    expect(party.map((b) => b.lineId)).toEqual(roster.map((s) => s.lineId));
    expect(party.map((b) => b.level)).toEqual(roster.map((s) => s.level));
    expect(party.map((b) => b.age)).toEqual(roster.map((s) => s.age));
    // Unique uids — two battlers at one uid lose one of themselves inside the reducer.
    expect(new Set(party.map((b) => b.uid)).size).toBe(party.length);
    // Traits are COPIED, never aliased: a battle must not be able to edit data/gyms.json.
    const withTraits = LADDER.find((g) => (g.signature.traits ?? []).length > 0);
    if (withTraits) {
      const spec = gymParty(withTraits)[gymRoster(withTraits).length - 1];
      expect(spec?.traits).toEqual(withTraits.signature.traits);
      expect(spec?.traits).not.toBe(withTraits.signature.traits);
    }
  });

  it("builds a `gym` battle whose bag is the SAVE's items and whose node is unset", () => {
    const save = saveAt(FIRST.town);
    const build = buildGymBattle({
      content,
      save,
      gym: FIRST,
      node: liveNodeOf(content, save, FIRST.town),
    });
    expect(build.input.kind).toBe("gym");
    expect(build.input.seed).toBe(save.seed);
    expect(build.input.bag).toEqual(save.items);
    expect(build.input.bag).not.toBe(save.items);
    // A gym fight decrements no population, so it names no node.
    expect(build.input.nodeId).toBeUndefined();
    expect(build.input.playerParty.map((b) => b.uid)).toEqual(save.party.map((c) => c.uid));
  });
});

describe("gym-battle — it runs through the REAL reducer", () => {
  it("a fight built here starts, steps and reaches an outcome", () => {
    const save = saveAt(FIRST.town);
    const build = buildGymBattle({
      content,
      save,
      gym: FIRST,
      node: liveNodeOf(content, save, FIRST.town),
    });
    const rng = subsystemRng(save.seed, "battle");
    let { state } = startBattle(build.input, build.ctx);
    let guard = 0;
    while (state.outcome === null && guard < 400) {
      guard += 1;
      const active = state.battlers[state.activePlayerUid];
      if (!active) break;
      const action: BattleAction = active.fainted
        ? {
            kind: "switch",
            uid: state.playerOrder.find((uid) => state.battlers[uid]?.fainted === false) ?? "",
          }
        : { kind: "move", moveId: active.moves[0] ?? "" };
      if (action.kind === "switch" && action.uid === "") break;
      state = battleStep(state, action, rng, build.ctx).state;
    }
    expect(state.outcome).not.toBeNull();
    // Whatever happened, the badge question has exactly one answer and it enumerates the outcome.
    expect(gymBattleWon(state)).toBe(state.outcome === "win");
  });

  it("only a WIN is a badge — a flee, a loss and a catch are not", () => {
    for (const outcome of ["loss", "fled", "caught", "escaped"] as const) {
      expect(gymBattleWon({ outcome }), outcome).toBe(false);
    }
    expect(gymBattleWon({ outcome: "win" })).toBe(true);
    expect(gymBattleWon({ outcome: null })).toBe(false);
  });
});
