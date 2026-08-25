/**
 * tests/unit/wild-battle.test.ts — the join, engine-free (build-doc §1 beat 1, Hard Req 2).
 *
 * `tests/integration/seams.test.ts` proves core's pieces compose, and asserts — in a test called
 * "HONEST GAP: nothing in production wires battle's catch to the ledger yet" — that no production
 * code did the join. `game/wild-battle.ts` is now that production code, and this file is the check of
 * the real thing the stand-in asked for.
 *
 * ⚠ THE STAND-IN IS NOW STALE AND CANNOT SEE THAT. Its source list is
 * `core/{battle,ecosim,lifecycle,save,clock,foodweb,rng,schemas,types}.ts` plus `game/main.ts`, so it
 * does not scan `game/wild-battle.ts` and stays green. Replacing it is Lane A's call, not this
 * lane's; it is reported rather than edited from here.
 *
 * What is proved below, each written to be able to fail:
 *   §1 the trait roll obeys bible §2 and is the SAME rule tools/harness/player.ts measured with;
 *   §2 an encounter becomes a legal `BattleInput` with nothing invented;
 *   §3 a catch moves the count by exactly one, through core/ecosim.ts's own writer, and the LIVE
 *      path lands where core/save.ts's `replay` of the same tape lands (L10);
 *   §4 the provisional starter is derived from data, not named in code (G2).
 */

import { describe, expect, it } from "vitest";

import { caughtIndividual, startBattle, step as battleStep } from "@core/battle";
import { applyCatch, fromNodeState, toNodeState } from "@core/ecosim";
import { deriveFoodWeb, indexSpecies, toEcoNode } from "@core/foodweb";
import { createRng, subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import { newSave, replay, type SaveEnvelope } from "@core/save";
import { AGE_CLASSES, type AgeClass, type Balance, type Content, type NodeFile } from "@core/types";
import {
  PROVISIONAL_STARTER_UID,
  applyCatchToSave,
  battlerSpecOf,
  buildWildBattle,
  partySpecs,
  provisionalStarter,
  rollWildTraits,
  starterLines,
  wildBattleProblem,
  wildBattlerSpec,
} from "@game/wild-battle";
import type { Encounter } from "@game/encounters";

const content: Content = validateContent();
const balance: Balance = content.balance;

function nodeFile(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

const NODE = "r1";

function encounterAt(lineId: string, age: AgeClass = "J", level = 4): Encounter {
  return { nodeId: NODE, lineId, age, level, traits: rollWildTraits(balance, age, createRng(1)) };
}

function saveWithStarter(): SaveEnvelope {
  const save = newSave({ seed: 4242, currentNode: NODE, nodes: content.nodes }, balance);
  const starter = provisionalStarter(content);
  if (!starter) throw new Error("data ships no starter line");
  return { ...save, party: [starter], items: { master: 99 } };
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The trait roll
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 rollWildTraits — bible §2, off balance.traits and nothing else", () => {
  it("rolls exactly slotsPerWildCreature traits from the shipped pool", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      for (const age of AGE_CLASSES) {
        const traits = rollWildTraits(balance, age, createRng(seed));
        expect(traits.length).toBe(balance.traits.slotsPerWildCreature);
        for (const t of traits) expect(balance.traits.pool.some((p) => p.id === t.id)).toBe(true);
      }
    }
  });

  it("only Elders reach the rare pool, and only sometimes", () => {
    const rare = new Set(balance.traits.pool.filter((t) => t.rarity === "rare").map((t) => t.id));
    let elderRare = 0;
    for (let seed = 1; seed <= 800; seed += 1) {
      expect(rollWildTraits(balance, "J", createRng(seed)).some((t) => rare.has(t.id))).toBe(false);
      expect(rollWildTraits(balance, "A", createRng(seed)).some((t) => rare.has(t.id))).toBe(false);
      if (rollWildTraits(balance, "E", createRng(seed)).some((t) => rare.has(t.id))) elderRare += 1;
    }
    expect(elderRare).toBeGreaterThan(0);
    expect(elderRare).toBeLessThan(800);
  });

  it("follows a retune of balance.traits rather than a constant (INV-3 / G11)", () => {
    const retuned: Balance = {
      ...balance,
      traits: { ...balance.traits, slotsPerWildCreature: balance.traits.slotsPerWildCreature + 2 },
    };
    expect(rollWildTraits(retuned, "A", createRng(9)).length).toBe(balance.traits.slotsPerWildCreature + 2);
  });

  it("an Elder-only pool of NOTHING falls back to the whole pool rather than rolling nothing", () => {
    const noRare: Balance = {
      ...balance,
      traits: { ...balance.traits, pool: balance.traits.pool.filter((t) => t.rarity === "common") },
    };
    expect(rollWildTraits(noRare, "E", createRng(3)).length).toBe(noRare.traits.slotsPerWildCreature);
  });

  it("hands back COPIES — a caught creature editing its trait cannot edit balance.json's", () => {
    const traits = rollWildTraits(balance, "A", createRng(11));
    const first = traits[0]!;
    const shipped = balance.traits.pool.find((t) => t.id === first.id)!;
    expect(first).not.toBe(shipped);
    first.name = "MUTATED";
    expect(balance.traits.pool.find((t) => t.id === first.id)!.name).not.toBe("MUTATED");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 Encounter → BattleInput
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the battle a wild encounter builds", () => {
  const lineId = Object.keys(nodeFile(NODE).populations)[0]!;

  it("is a wild battle at THIS node, with the player's party and the save's own bag", () => {
    const save = saveWithStarter();
    const built = buildWildBattle({
      content,
      save,
      encounter: encounterAt(lineId),
      node: toEcoNode(nodeFile(NODE)),
    });
    expect(built.input.kind).toBe("wild");
    expect(built.input.nodeId).toBe(NODE);
    expect(built.input.seed).toBe(save.seed);
    expect(built.input.playerParty).toEqual(partySpecs(save));
    expect(built.input.bag).toEqual(save.items);
    expect(built.input.enemyParty.length).toBe(1);
    expect(built.input.enemyParty[0]!.lineId).toBe(lineId);
  });

  it("gives the wild creature a uid nothing else in the run shares", () => {
    const save = saveWithStarter();
    const node = toEcoNode(nodeFile(NODE));
    const a = buildWildBattle({ content, save, encounter: encounterAt(lineId), node, seq: 1 });
    const b = buildWildBattle({ content, save, encounter: encounterAt(lineId), node, seq: 2 });
    expect(a.input.enemyParty[0]!.uid).not.toBe(b.input.enemyParty[0]!.uid);
    expect(a.input.enemyParty[0]!.uid).not.toBe(save.party[0]!.uid);
  });

  it("carries the encounter's traits through unchanged — no second roll at the hand-off", () => {
    const met = encounterAt(lineId, "E");
    expect(wildBattlerSpec(met).traits).toEqual(met.traits);
  });

  it("maps an OwnedCreature to a spec without deriving anything", () => {
    const starter = provisionalStarter(content)!;
    const spec = battlerSpecOf(starter);
    expect(spec.uid).toBe(starter.uid);
    expect(spec.lineId).toBe(starter.lineId);
    expect(spec.level).toBe(starter.level);
    expect(spec.age).toBe(starter.age);
    expect(spec.traits).toEqual(starter.traits);
  });

  it("refuses, in words, when there is nothing to send out", () => {
    const empty = { ...saveWithStarter(), party: [] };
    expect(wildBattleProblem(empty)).toMatch(/party/);
    expect(wildBattleProblem(saveWithStarter())).toBeNull();
  });

  it("the derived food web is per NODE — nothing here decides what eats what (G3/G6)", () => {
    const save = saveWithStarter();
    const built = buildWildBattle({
      content,
      save,
      encounter: encounterAt(lineId),
      node: toEcoNode(nodeFile(NODE)),
    });
    // The oracle answers for the node it was built from; core/foodweb.ts derived every edge in it.
    expect(typeof built.ctx.predation.eats).toBe("function");
    expect(typeof built.ctx.predation.dietOf).toBe("function");
    const derived = deriveFoodWeb(toEcoNode(nodeFile(NODE)), indexSpecies(content.species), balance);
    for (const [predator, prey] of Object.entries(derived.edges)) {
      for (const p of prey) {
        expect(built.ctx.predation.eats(predator, p, NODE), `${predator} → ${p}`).toBe(true);
      }
    }
    expect(built.ctx.balance).toBe(balance);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 A catch moves a real number (Hard Req 2)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 applyCatchToSave moves the ledger the way replay would", () => {
  const lineId = "nibbin-line";

  /** A real fight to a real catch, exactly as the seams test runs one. */
  function catchOne(save: SaveEnvelope) {
    const built = buildWildBattle({
      content,
      save,
      encounter: encounterAt(lineId),
      node: fromNodeState(nodeFile(NODE), save.nodeStates[NODE]!),
    });
    const rng = subsystemRng(save.seed, "battle");
    let state = startBattle(built.input, built.ctx).state;
    for (let turn = 0; state.outcome === null && turn < 200; turn += 1) {
      state = battleStep(state, { kind: "snare", tier: "master" }, rng, built.ctx).state;
    }
    return { state, ctx: built.ctx, caught: caughtIndividual(state, built.ctx) };
  }

  it("decrements by exactly one, from the shipped number", () => {
    const save = saveWithStarter();
    const before = save.nodeStates[NODE]!.populations[lineId]!.count;
    expect(before).toBe(nodeFile(NODE).populations[lineId]!.count);

    const { caught } = catchOne(save);
    expect(caught).not.toBeNull();
    const applied = applyCatchToSave(save, caught!, content);
    expect(applied.problem).toBeNull();
    expect(applied.before).toBe(before);
    expect(applied.after).toBe(before - 1);
    expect(applied.save.nodeStates[NODE]!.populations[lineId]!.count).toBe(before - 1);
  });

  it("lands exactly where core/save.ts's replay of the same tape lands (L10)", () => {
    const save = saveWithStarter();
    const { caught } = catchOne(save);
    const live = applyCatchToSave(save, caught!, content);

    const replayed = replay({ ...save, actionLog: [] }, live.save.actionLog, {
      species: content.species,
      balance,
    });
    for (const nodeId of Object.keys(save.nodeStates)) {
      expect(
        replayed.nodeStates[nodeId]!.populations,
        `${nodeId} differs between the live path and the replay`,
      ).toEqual(live.save.nodeStates[nodeId]!.populations);
    }
  });

  it("keeps the creature: the party grows by one, built by core/lifecycle.ts", () => {
    const save = saveWithStarter();
    const { caught } = catchOne(save);
    const applied = applyCatchToSave(save, caught!, content);
    expect(applied.gained).not.toBeNull();
    expect(applied.save.party.length).toBe(save.party.length + 1);
    expect(applied.gained!.uid).toBe(caught!.uid);
    expect(applied.gained!.lineId).toBe(caught!.lineId);
    expect(applied.gained!.caughtYear).toBe(save.year);
    // core/lifecycle.ts decides the lifespan and the projection; this module does not restate them.
    expect(applied.gained!.yearsRemaining).toBe(balance.age.lifespanYears[caught!.age]);
  });

  it("boxes the newcomer when the party is full (build-doc §7.8), and ages it like any other (G10)", () => {
    const base = saveWithStarter();
    const starter = base.party[0]!;
    const full: SaveEnvelope = {
      ...base,
      party: Array.from({ length: balance.party.maxPartySize }, (_, i) => ({ ...starter, uid: `p${String(i)}` })),
    };
    const { caught } = catchOne(full);
    const applied = applyCatchToSave(full, caught!, content);
    expect(applied.save.party.length).toBe(balance.party.maxPartySize);
    expect(applied.save.box.length).toBe(1);
    expect(applied.save.box[0]!.boxed).toBe(true);
    // The count still moved — the ledger is about the node, not about where the animal is kept.
    expect(applied.after).toBe(applied.before - 1);
  });

  it("catching a line to extinction is possible and permanent — the cascade needs no special case", () => {
    let save = saveWithStarter();
    const start = save.nodeStates[NODE]!.populations[lineId]!.count;
    for (let i = 0; i < start; i += 1) {
      const applied = applyCatchToSave(
        save,
        {
          uid: `w${String(i)}`,
          lineId,
          formName: "x",
          age: "J",
          level: 4,
          traits: [],
          nodeId: NODE,
          ancient: false,
          metamorphosed: false,
        },
        content,
      );
      save = applied.save;
    }
    expect(save.nodeStates[NODE]!.populations[lineId]!.count).toBe(balance.ecosim.populationFloor);

    // core/ecosim.ts's own clamp is what stops it going negative — not a check in game/.
    const node = fromNodeState(nodeFile(NODE), save.nodeStates[NODE]!);
    expect(toNodeState(applyCatch(node, lineId, balance)).populations[lineId]!.count).toBe(
      balance.ecosim.populationFloor,
    );
  });

  it("says so rather than throwing when the catch names a node or line that is not there", () => {
    const save = saveWithStarter();
    const base = { uid: "w", formName: "x", age: "J" as const, level: 4, traits: [], ancient: false, metamorphosed: false };
    expect(applyCatchToSave(save, { ...base, lineId, nodeId: "not-a-node" }, content).problem).toMatch(/no node/);
    expect(applyCatchToSave(save, { ...base, lineId }, content).problem).toMatch(/nodeId/);
    const wrongLine = applyCatchToSave(save, { ...base, lineId: "not-a-line", nodeId: NODE }, content);
    expect(wrongLine.problem).not.toBeNull();
    // Nothing moved on a refusal.
    expect(wrongLine.save).toBe(save);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 The provisional starter (G2 — derived, never named)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 the stand-in starter is read out of data/", () => {
  it("comes from the 'starter' habitat sentinel, at balance.xp.starterLevel", () => {
    const lines = starterLines(content);
    expect(lines.length).toBeGreaterThan(0);
    const starter = provisionalStarter(content);
    expect(starter).not.toBeNull();
    expect(lines.some((l) => l.id === starter!.lineId)).toBe(true);
    expect(starter!.level).toBe(balance.xp.starterLevel);
    expect(starter!.uid).toBe(PROVISIONAL_STARTER_UID);
    expect(starter!.caughtYear).toBe(balance.clock.startYear);
  });

  it("names no species in the module's own source (G2)", () => {
    const source = new URL("../../game/wild-battle.ts", import.meta.url);
    const code = require("node:fs")
      .readFileSync(source, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1") as string;
    for (const line of content.species) expect(code).not.toContain(line.id);
  });

  it("imports no engine and draws no platform random — testable with no DOM (L11 / G11)", () => {
    // Comments stripped: the file's own header SAYS "no Math.random", and a scan of the raw text
    // would be checking the prose rather than the code.
    const raw = require("node:fs").readFileSync(new URL("../../game/wild-battle.ts", import.meta.url), "utf8") as string;
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(raw).not.toMatch(/from\s+["']phaser["']/);
    expect(code).not.toMatch(/\bMath\.random\b/);
  });
});
