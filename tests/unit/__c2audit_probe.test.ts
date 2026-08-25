/** THROWAWAY AUDIT PROBE — delete before finishing. */
import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import { newSave, appendAction, replay, openStreams, type SaveEnvelope } from "../../core/save";
import { applyCatch, fromNodeState, toNodeState, stepRegionStates, defaultContext, step as ecoStep } from "../../core/ecosim";
import { indexSpecies, toEcoNode, encounterWeights } from "../../core/foodweb";
import { createRng } from "../../core/rng";
import {
  encounterTable,
  totalActiveWeight,
  rollForayStep,
  rollEncounterAt,
  nodeIsEmpty,
  absentLines,
  rollLevel,
  rollAge,
  type ForayContext,
} from "../../game/encounters";
import type { NodeFile, NodeState } from "../../core/types";

const content = validateContent();
const balance = content.balance;
const species = indexSpecies(content.species);

function nodeFile(id: string): NodeFile {
  const n = content.nodes.find((x) => x.id === id);
  if (!n) throw new Error("no node " + id);
  return n;
}

/** EXACTLY what game/scenes/OverworldScene.ts forayContext() builds. */
function sceneForayContext(save: SaveEnvelope, id: string, season: any, year: number): ForayContext {
  const file = nodeFile(id);
  const state = save.nodeStates[id];
  return {
    node: state ? fromNodeState(file, state) : toEcoNode(file),
    species,
    balance,
    season,
    year,
  };
}

describe("LENS C: the zero case, exactly", () => {
  it("count 0 gives weight exactly 0 — no floor, no epsilon", () => {
    const file = nodeFile("r4");
    const node = toEcoNode(file);
    node.populations["pyrelisk-line"]!.count = 0;
    const ctx: ForayContext = { node, species, balance, season: "spring", year: 1 };
    const table = encounterTable(ctx);
    const row = table.find((e) => e.lineId === "pyrelisk-line")!;
    console.log("ZERO-CASE ROW:", JSON.stringify(row));
    expect(row.weight).toBe(0);
    expect(Object.is(row.weight, 0) || Object.is(row.weight, -0)).toBe(true);
    expect(row.active).toBe(false);
  });

  it("a zeroed line never rolls, over 200k real rolls", () => {
    const file = nodeFile("r4");
    const node = toEcoNode(file);
    node.populations["pyrelisk-line"]!.count = 0;
    const ctx: ForayContext = { node, species, balance, season: "spring", year: 1 };
    const rng = createRng(1234);
    const seen = new Map<string, number>();
    for (let i = 0; i < 200_000; i++) {
      const e = rollEncounterAt(ctx, rng);
      if (e) seen.set(e.lineId, (seen.get(e.lineId) ?? 0) + 1);
    }
    console.log("200k ROLLS AFTER ZEROING pyrelisk:", JSON.stringify([...seen.entries()]));
    expect(seen.get("pyrelisk-line") ?? 0).toBe(0);
  });

  it("every line zeroed ⇒ total weight 0, nodeIsEmpty, null rolls (no fallback table)", () => {
    const file = nodeFile("r4");
    const node = toEcoNode(file);
    for (const k of Object.keys(node.populations)) node.populations[k]!.count = 0;
    const ctx: ForayContext = { node, species, balance, season: "spring", year: 1 };
    console.log("ALL-ZERO TABLE:", JSON.stringify(encounterTable(ctx)));
    expect(totalActiveWeight(encounterTable(ctx))).toBe(0);
    expect(nodeIsEmpty(ctx)).toBe(true);
    const rng = createRng(9);
    for (let i = 0; i < 20_000; i++) expect(rollEncounterAt(ctx, rng)).toBeNull();
  });

  it("SCAVENGER at count 0 with recentDeaths high is still exactly 0", () => {
    const file = nodeFile("r4");
    const node = toEcoNode(file, 500);
    node.populations["carricrow-line"]!.count = 0;
    const ctx: ForayContext = { node, species, balance, season: "spring", year: 1 };
    const row = encounterTable(ctx).find((e) => e.lineId === "carricrow-line")!;
    console.log("SCAVENGER ZERO ROW (recentDeaths=500):", JSON.stringify(row));
    expect(row.weight).toBe(0);
    expect(row.active).toBe(false);
  });
});

describe("LENS A: hammer prey to 0 through the REAL catch path, read through the REAL encounter code", () => {
  it("REPLAY path: catch actions drive pyrelisk to 0 and it stops appearing; apex follows", () => {
    const initial = newSave({ seed: 77, currentNode: "r4", nodes: content.nodes }, balance);
    // 14 catches = the shipped count.
    let logged: SaveEnvelope = initial;
    for (let i = 0; i < 14; i++) {
      logged = appendAction(logged, { t: "catch", nodeId: "r4", lineId: "pyrelisk-line", uid: `u${i}` });
    }
    const replayed = replay(initial, logged.actionLog, {
      balance,
      content,
      ecosimStep: (node, season, rng) => ecoStep(node, season, rng, defaultContext()).node,
    } as any);
    const after = replayed.nodeStates["r4"]!;
    console.log("AFTER 14 REPLAYED CATCHES r4 pyrelisk =", after.populations["pyrelisk-line"]!.count);
    expect(after.populations["pyrelisk-line"]!.count).toBe(0);

    const ctx = sceneForayContext(replayed, "r4", "spring", 1);
    const table = encounterTable(ctx);
    console.log("SCENE-SHAPED TABLE AFTER EXTINCTION:", JSON.stringify(table));
    expect(table.find((e) => e.lineId === "pyrelisk-line")!.weight).toBe(0);

    const rng = createRng(5);
    let met = 0;
    for (let i = 0; i < 100_000; i++) {
      const e = rollForayStep(ctx, rng);
      if (e?.lineId === "pyrelisk-line") met++;
    }
    console.log("pyrelisk encounters in 100k foray steps after extinction:", met);
    expect(met).toBe(0);

    console.log("ABSENT LINES:", JSON.stringify(absentLines(ctx)));
  });

  it("LIVE path (applyCatch): predator encounter weight follows prey extinction across seasons", () => {
    const save0 = newSave({ seed: 77, currentNode: "r4", nodes: content.nodes }, balance);
    let states: Record<string, NodeState> = { ...save0.nodeStates };
    // Hammer pyrelisk (the only Mesopredator at r4) to 0 via the live catch path.
    let live = fromNodeState(nodeFile("r4"), states["r4"]!);
    for (let i = 0; i < 20; i++) live = applyCatch(live, "pyrelisk-line", balance);
    states = { ...states, r4: toNodeState(live) };
    expect(states["r4"]!.populations["pyrelisk-line"]!.count).toBe(0);

    const weightOf = (st: Record<string, NodeState>, line: string) => {
      const node = fromNodeState(nodeFile("r4"), st["r4"]!);
      const t = encounterTable({ node, species, balance, season: "spring", year: 1 });
      return t.find((e) => e.lineId === line)!.weight;
    };

    const trace: Array<Record<string, number>> = [];
    trace.push({
      season: 0,
      pyrelisk: weightOf(states, "pyrelisk-line"),
      stonewing: weightOf(states, "stonewing-line"),
      ashvole: weightOf(states, "ashvole-line"),
    });

    const rng = createRng(4242);
    const order = balance.clock.seasonOrder;
    const simCtx = defaultContext();
    for (let s = 0; s < 12; s++) {
      const season = order[s % order.length]!;
      const res = stepRegionStates(content.nodes, states, season, rng, simCtx);
      states = res.states;
      trace.push({
        season: s + 1,
        pyrelisk: weightOf(states, "pyrelisk-line"),
        stonewing: weightOf(states, "stonewing-line"),
        ashvole: weightOf(states, "ashvole-line"),
      });
    }
    console.log("WEIGHT TRACE (r4, 12 season steps after pyrelisk extinction):");
    for (const row of trace) console.log("   ", JSON.stringify(row));

    // The prey stays extinct (permanent), and the apex must have declined.
    expect(trace[trace.length - 1]!["pyrelisk"]).toBe(0);
    expect(trace[trace.length - 1]!["stonewing"]!).toBeLessThan(trace[0]!["stonewing"]!);
  });

  it("CONTROL: without the catches, the apex does NOT collapse (so the effect is the catches)", () => {
    const save0 = newSave({ seed: 77, currentNode: "r4", nodes: content.nodes }, balance);
    let states = { ...save0.nodeStates };
    const rng = createRng(4242);
    const order = balance.clock.seasonOrder;
    const simCtx = defaultContext();
    for (let s = 0; s < 12; s++) {
      const res = stepRegionStates(content.nodes, states, order[s % order.length]!, rng, simCtx);
      states = res.states;
    }
    console.log(
      "CONTROL after 12 seasons: pyrelisk =",
      states["r4"]!.populations["pyrelisk-line"]!.count,
      " stonewing =",
      states["r4"]!.populations["stonewing-line"]!.count,
    );
    expect(states["r4"]!.populations["stonewing-line"]!.count).toBeGreaterThan(0);
  });

  it("SLICE NODE r1: hammering bramblehog to 0 removes it from the roll (vertical slice)", () => {
    const save0 = newSave({ seed: 3, currentNode: "r1", nodes: content.nodes }, balance);
    let live = fromNodeState(nodeFile("r1"), save0.nodeStates["r1"]!);
    for (let i = 0; i < 7; i++) live = applyCatch(live, "bramblehog-line", balance);
    const states = { ...save0.nodeStates, r1: toNodeState(live) };
    const save = { ...save0, nodeStates: states };
    const ctx = sceneForayContext(save, "r1", "spring", 1);
    const rng = createRng(11);
    const seen = new Map<string, number>();
    for (let i = 0; i < 50_000; i++) {
      const e = rollForayStep(ctx, rng);
      if (e) seen.set(e.lineId, (seen.get(e.lineId) ?? 0) + 1);
    }
    console.log("r1 after bramblehog extinction, 50k foray steps:", JSON.stringify([...seen.entries()]));
    expect(seen.get("bramblehog-line") ?? 0).toBe(0);
  });
});

describe("SANITY: level/age rolls", () => {
  it("level band per year and jitter symmetry", () => {
    const rng = createRng(1);
    for (const year of [1, 2, 3, 4, 5, 6, 7, 12]) {
      const vals = new Set<number>();
      for (let i = 0; i < 5000; i++) vals.add(rollLevel(balance, year, rng));
      console.log("year", year, "levels:", [...vals].sort((a, b) => a - b).join(","));
    }
  });
  it("age distribution", () => {
    const rng = createRng(2);
    const c: Record<string, number> = {};
    for (let i = 0; i < 100_000; i++) {
      const a = rollAge(balance, rng);
      c[a] = (c[a] ?? 0) + 1;
    }
    console.log("AGE DIST:", JSON.stringify(c));
  });
});
