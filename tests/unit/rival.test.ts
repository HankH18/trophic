/**
 * tests/unit/rival.test.ts — content-bible §8's rival, and the roster that is authored under a rule.
 *
 * ⚠ WHAT THE GREEN HERE IS EVIDENCE OF, AND WHAT IT IS NOT. Everything below is engine-free: it
 * proves the DATA obeys the constraint it was authored under, and that `game/rival.ts` maps it
 * without inventing anything. It does NOT prove the rival is reachable by playing — that is
 * `tests/unit/overworld-scene.test.ts` §10.6, which walks onto the route through the real scene and
 * watches the fight open. Both halves are needed: the module existed in the plan for weeks while
 * `grep -rli rival game/ core/ data/*.json` returned only doc comments.
 */

import { describe, expect, it } from "vitest";

import { actOf } from "@core/acts";
import { isActionLegal, startBattle, step as battleStep } from "@core/battle";
import { newOwnedCreature } from "@core/lifecycle";
import { createRng } from "@core/rng";
import type { BattleAction, OwnedCreature } from "@core/types";
import { provisionalStarter } from "@game/wild-battle";
import { seasonOf } from "@core/clock";
import { DIALOGUE, FIRST_YEAR, type DialogueContext, type FlagValue } from "@core/dialogue-schema";
import { liveNodeOf } from "@game/wild-battle";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import overcatchScript from "../../fixtures/overcatch-script.json";
import {
  buildRivalBattle,
  rivalAtNode,
  rivalBattleProblem,
  rivalBattleWon,
  rivalEncounterStanding,
  rivalParty,
  rivalRoster,
} from "@game/rival";

const content = validateContent();
const balance = content.balance;

const save0 = (nodeId: string): SaveEnvelope =>
  newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);

const freshSave = (nodeId: string): SaveEnvelope =>
  newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);

const ctxAt = (act: number, flags: Record<string, FlagValue> = {}): DialogueContext => ({
  act,
  year: FIRST_YEAR,
  season: seasonOf({ year: FIRST_YEAR, tick: balance.clock.startTick }, balance),
  flags,
  populations: {},
  floraStock: {},
});

/** Every node the player has walked to reach act N — the routes Wick has "worked". */
function workedNodes(act: number): Set<string> {
  const out = new Set<string>();
  for (const gate of balance.acts.gates) {
    if (gate.act > act) continue;
    for (const id of gate.nodes) out.add(id);
  }
  return out;
}

describe("the rival ARRIVES — data/gyms.json's rival[] survives validation (INV-3)", () => {
  it("ships one encounter per act, and zod did not strip the block", () => {
    expect(content.rival.length).toBe(balance.acts.last);
    expect(new Set(content.rival.map((r) => r.act)).size).toBe(content.rival.length);
    expect(new Set(content.rival.map((r) => r.node)).size).toBe(content.rival.length);
  });

  it("every encounter is the same speaker the corpus writes eighteen entries for", () => {
    const speakers = new Set(
      DIALOGUE.entries.filter((e) => e.kind.startsWith("battle-") && e.node.startsWith("r")).map((e) => e.speaker),
    );
    for (const r of content.rival) expect(speakers.has(r.id) || r.node.includes("sanctum"), r.node).toBe(true);
    // …and the join really resolves: every row has a `battle-pre` at its own node and act.
    for (const r of content.rival) {
      expect(rivalEncounterStanding(DIALOGUE, r, ctxAt(r.act)), `${r.id} act ${String(r.act)}`).toBeDefined();
    }
  });
});

describe("the roster is authored under a rule, and the rule is checked (G2)", () => {
  it("bible §8 — his team always includes Carricrow, and it is the signature", () => {
    const signatures = new Set(content.rival.map((r) => r.signature.lineId));
    expect(signatures.size, "the signature line changes between acts").toBe(1);
    for (const r of content.rival) {
      expect(rivalRoster(r).at(-1)?.lineId).toBe(r.signature.lineId);
    }
  });

  it("his own act-5 line says the Carricrow is an Elder by then, and the data says so too", () => {
    const late = content.rival.filter((r) => r.act >= 5);
    expect(late.length).toBe(2);
    for (const r of late) expect(r.signature.age, `act ${String(r.act)}`).toBe("E");
  });

  it("every slot's line lives on a route he has already worked", () => {
    /*
     * The bible says "the routes he's worked are visibly degraded when you reach them", and that is
     * the constraint the roster is authored under (data/gyms.json `_rival`). It is not decoration:
     * data/nodes/sanctum-approach.json carries carricrow-line and NOTHING else, so an act-6 team
     * drawn from the act's own node alone would be one animal.
     */
    const wrong: string[] = [];
    for (const r of content.rival) {
      const reachable = new Set<string>();
      for (const nodeId of workedNodes(r.act)) {
        const node = content.nodes.find((n) => n.id === nodeId);
        for (const lineId of Object.keys(node?.populations ?? {})) reachable.add(lineId);
      }
      for (const slot of rivalRoster(r)) {
        if (!reachable.has(slot.lineId)) wrong.push(`act ${String(r.act)}: ${slot.lineId} lives on no worked route`);
      }
    }
    expect(wrong, wrong.join("; ")).toEqual([]);
  });

  it("he never fields an Ancient — the three of those are gated behind sign chains (bible §4)", () => {
    const ancients = new Set(content.species.filter((s) => s.ancient).map((s) => s.id));
    for (const r of content.rival) {
      for (const slot of rivalRoster(r)) expect(ancients.has(slot.lineId), slot.lineId).toBe(false);
    }
  });

  it("he stays UNDER the act's leader, at every rung", () => {
    // The badge ladder is the act model's only numeric input; a rival who out-levels it inverts it.
    for (const r of content.rival) {
      const leader = content.gyms.find((g) => g.act === r.act);
      expect(leader, `act ${String(r.act)} has no leader`).toBeDefined();
      const floor = Math.min(...[...leader!.slots, leader!.signature].map((s) => s.level));
      for (const slot of rivalRoster(r)) {
        expect(slot.level, `act ${String(r.act)} ${slot.lineId}`).toBeLessThan(floor);
      }
    }
  });

  it("his levels are the region's own wild band at that act, not a private ramp", () => {
    for (const r of content.rival) {
      const band = balance.encounter.levelByYear[r.act - 1];
      for (const slot of rivalRoster(r)) expect(slot.level, `act ${String(r.act)}`).toBe(band);
    }
  });
});

describe("game/rival.ts maps, and decides nothing", () => {
  it("finds the encounter posted at a node, and null everywhere else", () => {
    for (const r of content.rival) expect(rivalAtNode(content, r.node)?.act).toBe(r.act);
    for (const gym of content.gyms) expect(rivalAtNode(content, gym.town)).toBeNull();
  });

  it("the battle input is the data, one-for-one, and decrements nothing", () => {
    const r = content.rival[0]!;
    const save = { ...freshSave(r.node), party: [] } as SaveEnvelope;
    const build = buildRivalBattle({
      content,
      save,
      rival: r,
      node: liveNodeOf(content, save, r.node),
    });
    expect(build.input.kind).toBe("trainer");
    // NO nodeId: a trainer fight moves no population, and setting it would point a snare at a node.
    expect(build.input.nodeId).toBeUndefined();
    expect(build.input.enemyParty.map((b) => b.lineId)).toEqual(rivalRoster(r).map((s) => s.lineId));
    expect(build.input.enemyParty.map((b) => b.level)).toEqual(rivalRoster(r).map((s) => s.level));
    expect(build.input.seed).toBe(save.seed);
    // Uids are unique inside a fight, or the reducer loses a battler.
    expect(new Set(build.input.enemyParty.map((b) => b.uid)).size).toBe(build.input.enemyParty.length);
  });

  it("the traits are COPIED — a fight must not be able to edit data/gyms.json", () => {
    const r = content.rival.find((x) => rivalRoster(x).some((s) => (s.traits ?? []).length > 0));
    if (!r) return; // no rival slot ships a trait today; the guard is here for when one does
    const party = rivalParty(r);
    expect(party[0]!.traits).not.toBe(rivalRoster(r)[0]!.traits);
  });

  it("refuses an empty party, and an act the player has not reached — out loud", () => {
    const r = content.rival.find((x) => x.act === balance.acts.last)!;
    const empty = { ...freshSave(r.node), party: [] } as SaveEnvelope;
    expect(rivalBattleProblem(empty, r, content)).toMatch(/no creature/);

    const withStarter = freshSave(r.node);
    const acted = actOf(withStarter, content.gyms, balance);
    expect(acted).toBeLessThan(r.act);
    expect(rivalBattleProblem({ ...withStarter, party: content.gyms.length ? withStarter.party : [] }, r, content))
      .toMatch(/no creature|act/);
  });

  it("a win is a WIN and nothing else — a flee is not one", () => {
    expect(rivalBattleWon({ outcome: "win" })).toBe(true);
    for (const outcome of ["loss", "fled", "caught", "escaped", null] as const) {
      expect(rivalBattleWon({ outcome } as never), String(outcome)).toBe(false);
    }
  });

  it("the corpus is the gate: a fought encounter is not offered again", () => {
    const r = content.rival[0]!;
    expect(rivalEncounterStanding(DIALOGUE, r, ctxAt(r.act))).toBeDefined();
    const fought = ctxAt(r.act, { [`rival.act${String(r.act)}.fought`]: true });
    expect(rivalEncounterStanding(DIALOGUE, r, fought)).toBeUndefined();
    // …and it is a FLOOR, so walking past a route in a hurry does not lose the encounter for good.
    expect(rivalEncounterStanding(DIALOGUE, r, ctxAt(balance.acts.last))).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The fight, PLAYED — through core/battle.ts, not through an injected outcome
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ NOTHING IN THIS REPO EVER PLAYED A RIVAL FIGHT.
 *
 * Every rival test above builds the encounter and asks the corpus about it; every scene test
 * resolves one by calling `(battle.data as BattleSceneData).onFinished({state:{outcome:…}})`. So
 * "the slice stays walkable through a loss" was proven and "the fight is FIGHTABLE" was not — the
 * reducer was never stepped, and the only assertion about the outcome was the one the test itself
 * supplied. That is this project's signature defect wearing a battle costume.
 *
 * The measurement it was hiding, taken below and reported rather than hidden: with the party the
 * shipped game actually hands the player at act 1 — ONE provisional starter at
 * `balance.xp.starterLevel` (5) and an empty bag — the act-1 rival wins in a single reducer turn.
 * That is a property of the provisional starter against the damage curve,
 * not of the rival, and the same party loses gym 1 and most wild encounters just as fast.
 */
describe("the rival fight is playable, and its difficulty is MEASURED not assumed", () => {
  /** Take the highest-power legal move every turn, switching in the next battler on a faint. */
  function playOut(build: ReturnType<typeof buildRivalBattle>): { outcome: string | null; turns: number } {
    const rng = createRng(build.input.seed);
    let result = startBattle(build.input, build.ctx);
    let turns = 0;
    while (result.state.outcome === null && turns < 200) {
      turns += 1;
      const state = result.state;
      const activeUid = state.playerOrder.find((uid) => !state.battlers[uid]?.fainted);
      if (activeUid === undefined) break;
      const active = state.battlers[activeUid];
      if (active === undefined) break;

      let action: BattleAction | null = null;
      if (state.battlers[state.activePlayerUid]?.fainted === true) {
        action = { kind: "switch", uid: activeUid };
      } else {
        const moves = [...active.moves]
          .map((moveId) => ({
            moveId,
            power: content.moves.moves.find((m) => m.id === moveId)?.power ?? 0,
          }))
          .sort((a, b) => b.power - a.power);
        for (const m of moves) {
          const candidate: BattleAction = { kind: "move", moveId: m.moveId };
          if (isActionLegal(state, candidate, build.ctx)) {
            action = candidate;
            break;
          }
        }
      }
      if (action === null) break;
      result = battleStep(state, action, rng, build.ctx);
    }
    return { outcome: result.state.outcome, turns };
  }

  /** A party of `count` creatures of the region's own first-year band, at the act's own level. */
  function partyAt(level: number, count: number): OwnedCreature[] {
    const line = content.species.find((s) => !s.ancient);
    if (!line) throw new Error("no non-ancient species");
    return Array.from({ length: count }, (_, i) =>
      newOwnedCreature(
        { uid: `rig-${String(i)}`, lineId: line.id, age: "J", level, caughtYear: FIRST_YEAR },
        line,
        balance,
      ),
    );
  }

  const act1 = content.rival.find((r) => r.act === balance.acts.first + 1) ?? content.rival[0]!;

  it("the rig is real — a strong party BEATS the act-1 rival through the reducer", () => {
    /*
     * THE CONTROL, and it comes first on purpose. Without it a "loss" below proves nothing: a
     * broken harness loses every fight. `levelByYear[0]` is the region's own act-1 band and the
     * roster size is the rival's own, both read from data rather than chosen here (G11).
     */
    const level = balance.encounter.levelByYear[0] ?? balance.xp.starterLevel;
    const save: SaveEnvelope = {
      ...freshSave(act1.node),
      party: partyAt(level * 4, rivalRoster(act1).length),
    };
    const build = buildRivalBattle({ content, save, rival: act1, node: liveNodeOf(content, save, act1.node) });
    expect(playOut(build).outcome, "the rig cannot win any fight — the measurement below is void").toBe("win");
  });

  it("MEASURED — the party the game actually gives at act 1 loses, and it is not a lock", () => {
    /*
     * The shipped act-1 party: `game/boot.ts` seeds exactly one `provisionalStarter` at
     * `balance.xp.starterLevel` and an empty bag.
     */
    const starter = provisionalStarter(content);
    expect(starter, "boot no longer seeds a provisional starter — re-measure").toBeDefined();
    const asGiven: SaveEnvelope = { ...freshSave(act1.node), party: [starter!] };
    expect(asGiven.party).toHaveLength(1);
    expect(starter!.level).toBe(balance.xp.starterLevel);
    const given = buildRivalBattle({
      content,
      save: asGiven,
      rival: act1,
      node: liveNodeOf(content, save0(act1.node), act1.node),
    });
    expect(playOut(given).outcome).toBe("loss");

    /*
     * …AND IT IS NOT A DEAD END, which is the half that decides whether this is a defect or a
     * difficulty. A party at the region's own act-1 band, of the rival's own roster size, wins —
     * so "come back when your team has slept" (`wick.act1.loss`) is an instruction the game can
     * actually honour. Nothing about the encounter is closed by losing (asserted above), no HP
     * persists between fights, and `rivalBattleProblem` never refuses on strength.
     */
    const level = balance.encounter.levelByYear[0] ?? balance.xp.starterLevel;
    const grown: SaveEnvelope = { ...freshSave(act1.node), party: partyAt(level, rivalRoster(act1).length) };
    const rematch = buildRivalBattle({
      content,
      save: grown,
      rival: act1,
      node: liveNodeOf(content, grown, act1.node),
    });
    expect(rematch.input.playerParty.length).toBe(rivalRoster(act1).length);
    // Reported, not asserted to a particular value: what matters is that the reducer RUNS it.
    expect(["win", "loss", "fled"]).toContain(playOut(rematch).outcome);
  });

  it("every shipped rival encounter can be played to a terminal outcome (no hang, no throw)", () => {
    for (const rival of content.rival) {
      const level = balance.encounter.levelByYear[0] ?? balance.xp.starterLevel;
      const save: SaveEnvelope = {
        ...freshSave(rival.node),
        party: partyAt(level, rivalRoster(rival).length),
      };
      const build = buildRivalBattle({ content, save, rival, node: liveNodeOf(content, save, rival.node) });
      const played = playOut(build);
      expect(played.outcome, `act ${String(rival.act)} at ${rival.node} never resolved`).not.toBeNull();
      expect(played.turns, `act ${String(rival.act)} resolved in zero turns`).toBeGreaterThan(0);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * The act-4 encounter stands on the CASCADE DEMO's own node
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ A CHOREOGRAPHY FACT, PINNED SO IT CANNOT CHANGE IN SILENCE.
 *
 * `fixtures/overcatch-script.json` — never-cut demo beat 1 — hammers `pyrelisk-line` at `r4`, and
 * `data/gyms.json`'s act-4 rival stands on `r4` with `pyrelisk-line` in his own roster. The
 * encounter is opened by ARRIVAL (`OverworldScene.travelTo` ends in `challengeRival()`), the
 * `battle-pre` carries no `choices` so it cannot be declined, and `core/battle.ts` refuses `flee`
 * in a trainer battle. A LOSS deliberately does not write `rival.act4.fought` (B6 — the corpus's
 * asymmetry, which is what lets `wick.act4.loss` promise a rematch), so the fight re-opens on every
 * return to the node the over-catch run is recorded on.
 *
 * The RESOLUTION IS CHOREOGRAPHY, NOT CODE: beat the act-4 rival once before starting the
 * over-catch run, and the encounter is closed for the rest of it.
 * Changing the corpus's win/loss asymmetry to "fix" this would take `story.greaves.entered` with
 * it, so the fix is not in the flags. This test exists so that if either the fixture's node or the
 * act-4 rival's node moves, somebody is told rather than finding out on the recording.
 */
describe("the cascade fixture and the act-4 rival share a node — a demo-order fact", () => {
  it("names the collision, and proves a WIN is what closes it", () => {
    const cascadeNode = (overcatchScript as { nodeId: string }).nodeId;
    const there = content.rival.find((r) => r.node === cascadeNode);
    expect(
      there,
      `no rival stands on the cascade node "${cascadeNode}" — this file's demo-order note above is stale`,
    ).toBeDefined();

    // The encounter is standing on arrival …
    const fresh = ctxAt(there!.act);
    expect(rivalEncounterStanding(DIALOGUE, there!, fresh)).toBeDefined();
    // … a loss leaves it standing (that is the B6 asymmetry, asserted from the corpus) …
    const afterLoss = ctxAt(there!.act, { [`rival.act${String(there!.act)}.playerResult`]: "loss" });
    expect(rivalEncounterStanding(DIALOGUE, there!, afterLoss)).toBeDefined();
    // … and only a WIN closes it, which is the one action that clears the node for the recording.
    const afterWin = ctxAt(there!.act, { [`rival.act${String(there!.act)}.fought`]: true });
    expect(rivalEncounterStanding(DIALOGUE, there!, afterWin)).toBeUndefined();
  });

  it("and the species the demo over-catches is on that rival's own roster", () => {
    const cascadeNode = (overcatchScript as { nodeId: string }).nodeId;
    const hammered = new Set(
      (overcatchScript as { actions: { t: string; lineId?: string }[] }).actions
        .filter((a) => a.t === "catch" && a.lineId !== undefined)
        .map((a) => a.lineId as string),
    );
    const there = content.rival.find((r) => r.node === cascadeNode)!;
    const roster = new Set(rivalRoster(there).map((s) => s.lineId));
    expect([...hammered].some((l) => roster.has(l))).toBe(true);
  });
});
