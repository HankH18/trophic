/**
 * tests/unit/finale.test.ts — the Vellsire resolution, which had no writer at all.
 *
 * ⚠ READ THIS BEFORE TRUSTING THE GREEN. Every assertion below is about `game/finale.ts` in
 * isolation. That is deliberately only half the proof, and the missing half is exactly the one the
 * project got burned on: `story.vellsire.resolved` was set by hand in three test files, the epilogue
 * fired every time, and nothing in the shipped game ever set it. So this file NEVER writes a story
 * flag itself and never asserts on one it wrote — it drives the shipped writers — and the other
 * half, that `OverworldScene` reaches them off a real battle outcome with nothing hand-fed, lives in
 * `tests/unit/overworld-scene.test.ts` §10.6.
 */

import { describe, expect, it } from "vitest";

import type { CaughtIndividual } from "@core/battle";
import { DIALOGUE } from "@core/dialogue-schema";
import { isNever } from "@core/lifecycle";
import { subsystemRng } from "@core/rng";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import { liveNodeOf, provisionalStarter } from "@game/wild-battle";
import {
  VELLSIRE_ATTEMPT_FLAG,
  VELLSIRE_OUTCOME_FLAG,
  VELLSIRE_RESOLVED_FLAG,
  ancientAgeClass,
  buildVellsireBattle,
  finaleAncientLine,
  finaleNodeId,
  finaleUnlocked,
  recordVellsireOutcome,
  resolveVellsireCatch,
  resolveVellsireWithoutBattle,
  vellsireAttempt,
  vellsireBattleProblem,
  vellsireOutcome,
  vellsireResolved,
} from "@game/finale";

const content = validateContent();
const balance = content.balance;
const NODE = finaleNodeId(balance);
const LINE = finaleAncientLine(content, NODE);

function saveAtRing(): SaveEnvelope {
  const save = newSave({ seed: balance.rng.defaultSeed, currentNode: NODE, nodes: content.nodes }, balance);
  const starter = provisionalStarter(content);
  return starter ? { ...save, party: [starter] } : save;
}

/** `caughtIndividual`'s own shape, for the individual the SCRIPTED fight actually fielded. */
function reportFor(spec: { uid: string; lineId: string; level: number }): CaughtIndividual {
  const line = content.species.find((s) => s.id === spec.lineId);
  if (!line) throw new Error(`no species ${spec.lineId}`);
  return {
    uid: spec.uid,
    lineId: spec.lineId,
    formName: line.formNames[ancientAgeClass()],
    age: ancientAgeClass(),
    level: spec.level,
    traits: [],
    nodeId: NODE,
    ancient: true,
    metamorphosed: false,
  };
}

describe("the ring is found in the data, never named in code (G2/G11)", () => {
  it("the finale node is balance's, and it really ships an Ancient", () => {
    expect(NODE).toBe(balance.encounter.finaleGatedNode);
    expect(content.nodes.some((n) => n.id === NODE)).toBe(true);
    expect(LINE, `no ancient line has a population at ${NODE}`).not.toBeNull();
    expect(LINE!.ancient).toBe(true);
  });

  it("exactly one Ancient stands there — the other two stay wild", () => {
    const node = content.nodes.find((n) => n.id === NODE)!;
    const here = content.species.filter((s) => s.ancient && node.populations[s.id] !== undefined);
    expect(here).toHaveLength(1);
    const elsewhere = content.species.filter((s) => s.ancient && node.populations[s.id] === undefined);
    expect(elsewhere.length).toBe(2);
  });

  it("the age is the vocabulary's terminal class, so it cannot disagree with core/lifecycle.ts", () => {
    expect(ancientAgeClass()).toBe("E");
  });

  it("the finale gate reads acts.runCompleteFlag, and is not a second spelling of it", () => {
    const save = saveAtRing();
    expect(finaleUnlocked(save, balance)).toBe(false);
    const beaten = { ...save, questFlags: { ...save.questFlags, [balance.acts.runCompleteFlag]: true } };
    expect(finaleUnlocked(beaten, balance)).toBe(true);
  });
});

describe("the scripted encounter is built, not rolled (G3)", () => {
  const build = (): ReturnType<typeof buildVellsireBattle> => {
    const save = saveAtRing();
    return buildVellsireBattle({
      content,
      save,
      act: balance.acts.last,
      rng: subsystemRng(save.seed, "encounter"),
      node: liveNodeOf(content, save, NODE),
    });
  };

  it("fields one Elder of the line that lives in the ring, at the region's own band", () => {
    const b = build();
    expect(b.input.kind).toBe("ancient");
    expect(b.input.enemyParty).toHaveLength(1);
    expect(b.enemy.lineId).toBe(LINE!.id);
    expect(b.enemy.age).toBe("E");
    const band = balance.encounter.levelByYear[balance.acts.last - 1]!;
    expect(b.enemy.level).toBeGreaterThanOrEqual(band - balance.encounter.levelJitter);
    expect(b.enemy.level).toBeLessThanOrEqual(band + balance.encounter.levelJitter);
  });

  it("carries the node, because a snare here moves the Sanctum's real number (Hard Req 2)", () => {
    expect(build().input.nodeId).toBe(NODE);
  });

  it("is DETERMINISTIC — the same seed builds the same stag (L10)", () => {
    const a = build();
    const b = build();
    expect(b.enemy).toEqual(a.enemy);
  });

  it("refuses an empty party out loud rather than opening an unfightable ring", () => {
    const save = saveAtRing();
    expect(vellsireBattleProblem(save)).toBeNull();
    expect(vellsireBattleProblem({ ...save, party: [] })).toMatch(/no creature/);
  });

  it("refuses a content set with nothing in the ring, rather than inventing one", () => {
    const empty = {
      ...content,
      nodes: content.nodes.map((n) => (n.id === NODE ? { ...n, populations: {} } : n)),
    };
    const save = saveAtRing();
    expect(() =>
      buildVellsireBattle({ content: empty, save, act: balance.acts.last, rng: subsystemRng(save.seed, "encounter") }),
    ).toThrow(/ancient line/);
  });
});

describe("the resolution — and the two keys that had no writer anywhere", () => {
  it("reads the attempt the CORPUS writes, and nothing else", () => {
    const save = saveAtRing();
    expect(vellsireAttempt(save)).toBeNull();
    expect(vellsireAttempt({ ...save, questFlags: { [VELLSIRE_ATTEMPT_FLAG]: "catch" } })).toBe("catch");
    expect(vellsireAttempt({ ...save, questFlags: { [VELLSIRE_ATTEMPT_FLAG]: "release" } })).toBe("release");
    // A value the corpus does not spell is not silently accepted as one that it does.
    expect(vellsireAttempt({ ...save, questFlags: { [VELLSIRE_ATTEMPT_FLAG]: "caught" } })).toBeNull();
  });

  it("the shipped corpus writes the attempt — the values this module reads really exist", () => {
    /*
     * Without this, every assertion above is about a key nothing produces, which is precisely the
     * defect that made both epilogues dead while the suite stayed green.
     */
    const approach = DIALOGUE.entries.find((e) => e.id === "sanctum.vellsire.approach");
    expect(approach, "the corpus no longer offers the ring").toBeDefined();
    const written = (approach?.choices ?? []).map((c) => (c.setFlags ?? {})[VELLSIRE_ATTEMPT_FLAG]);
    expect(written.sort()).toEqual(["catch", "release"]);
    // …and the branch that cannot fail resolves itself, so this module only owns the snare (B3).
    const standAside = (approach?.choices ?? []).find(
      (c) => (c.setFlags ?? {})[VELLSIRE_ATTEMPT_FLAG] === "release",
    );
    expect(standAside?.setFlags?.[VELLSIRE_RESOLVED_FLAG]).toBe(true);
    expect(standAside?.setFlags?.[VELLSIRE_OUTCOME_FLAG]).toBe("released");
    const snare = (approach?.choices ?? []).find((c) => (c.setFlags ?? {})[VELLSIRE_ATTEMPT_FLAG] === "catch");
    expect(snare?.setFlags?.[VELLSIRE_RESOLVED_FLAG], "the snare cannot resolve itself").toBeUndefined();
  });

  it("A SNARE THAT HOLDS records caught, decrements the node, and keeps an ageless creature", () => {
    const save = saveAtRing();
    const b = buildVellsireBattle({
      content,
      save,
      act: balance.acts.last,
      rng: subsystemRng(save.seed, "encounter"),
    });
    const before = save.nodeStates[NODE]!.populations[LINE!.id]!.count;
    const out = resolveVellsireCatch({
      save,
      content,
      state: { outcome: "caught" },
      caught: reportFor(b.enemy),
    });
    expect(out.outcome).toBe("caught");
    expect(out.problem).toBeNull();
    expect(vellsireResolved(out.save)).toBe(true);
    expect(vellsireOutcome(out.save)).toBe("caught");
    expect(out.save.nodeStates[NODE]!.populations[LINE!.id]!.count).toBe(before - 1);
    // The tape carries it, so `core/save.ts` replay reproduces this save (L10).
    expect(out.save.actionLog.at(-1)?.action).toMatchObject({ t: "catch", nodeId: NODE, lineId: LINE!.id });
    // G10 / Hard Req 4 — caught Ancients never age.
    const held = [...out.save.party, ...out.save.box].find((c) => c.lineId === LINE!.id);
    expect(held?.age).toBe("E");
    expect(isNever(held!.yearsRemaining)).toBe(true);
    expect(isNever(held!.projectedRetirementYear)).toBe(true);
  });

  it("A FAILED SNARE resolves as released, and moves NO number", () => {
    const save = saveAtRing();
    const before = save.nodeStates[NODE]!.populations[LINE!.id]!.count;
    for (const outcome of ["loss", "fled", "win", "escaped"] as const) {
      const out = resolveVellsireCatch({ save, content, state: { outcome } as never, caught: null });
      expect(out.outcome, outcome).toBe("released");
      expect(vellsireOutcome(out.save)).toBe("released");
      expect(out.save.nodeStates[NODE]!.populations[LINE!.id]!.count, outcome).toBe(before);
      expect(out.save.actionLog.length, outcome).toBe(save.actionLog.length);
    }
  });

  it("the degraded answer resolves rather than leaving the beat unwritten — and only once", () => {
    const save = saveAtRing();
    expect(resolveVellsireWithoutBattle(save), "nothing to resolve without an attempt").toBeNull();
    const attempted = { ...save, questFlags: { ...save.questFlags, [VELLSIRE_ATTEMPT_FLAG]: "catch" } };
    const out = resolveVellsireWithoutBattle(attempted);
    expect(out?.outcome).toBe("released");
    // …and it is a latch: a resolved finale is not re-resolved on the next pass.
    expect(resolveVellsireWithoutBattle(out!.save)).toBeNull();
  });

  it("recordVellsireOutcome writes both keys, and is pure", () => {
    const save = saveAtRing();
    const out = recordVellsireOutcome(save, "released");
    expect(out).not.toBe(save);
    expect(save.questFlags[VELLSIRE_RESOLVED_FLAG]).toBeUndefined();
    expect(out.questFlags[VELLSIRE_RESOLVED_FLAG]).toBe(true);
    expect(out.questFlags[VELLSIRE_OUTCOME_FLAG]).toBe("released");
  });
});
