/**
 * tools/harness/ttk-probe.ts — the time-to-kill / catchability instrument.
 *
 * §10.5 measures WIN RATE. This measures how many EXCHANGES a fight lasts, whether a level-
 * appropriate encounter can one-shot a healthy player creature, and whether the player can
 * weaken-and-catch anything — three quantities a win rate cannot express. A fight the player wins
 * 90% of the time in ONE exchange is still broken, because catching needs a window between "full"
 * and "dead", and that was the owner's 2026-08-28 report ("I keep getting one-shot before I can
 * catch anything").
 *
 * It drives the REAL reducer through the REAL loader (`loadContentFromRaw` — build-doc §6 INV-3's
 * injection point), so a figure here is comparable with a figure from `npm run harness`. The
 * `--verify` cell reproduces the previous pass's six gym rates exactly; run it before believing
 * anything else this file prints.
 *
 * NAMES NO CONTENT (G2/G3, tests/property/foodweb.test.ts `no_shadow_tables`). The starters come
 * from `starterLines()`, the foray route from `actNodeIds(1)`. An earlier revision of this file
 * hardcoded species ids and the gate caught it, correctly.
 *
 *   npx tsx tools/harness/ttk-probe.ts --verify
 *   npx tsx tools/harness/ttk-probe.ts --sweep     [--seeds N] [--gym-seeds N]
 *   npx tsx tools/harness/ttk-probe.ts --offsets   [--gym-seeds N]
 */

import { readFileSync } from "node:fs";
import { createRng, subsystemRng } from "../../core/rng";
import { startBattle, step } from "../../core/battle";
import { bestMoveId } from "./arena";
import { loadContentFromRaw, seedFor, subsystemTags, type LoadedContent } from "./content";
import { runOneGym } from "./gym-sim";
import { actNodeIds, starterLines } from "./player";
import type { AgeClass, BattleAction, BattleInput, BattlerSpec, SnareTier } from "../../core/types";

const BALANCE_PATH = new URL("../../data/balance.json", import.meta.url).pathname;

/**
 * The arrival offsets: how far over each leader the xp curve actually lands the player.
 * balance.json `xp._curveOutranTheLadder` states the arrival levels and the leader levels; these
 * are their differences, and they are the instrument that reproduces that note's six win rates.
 * NOT a game constant — a property of the measurement, so it is not a G11 literal.
 */
const ARRIVAL_OFFSET = [9, 7, 6, 5, 4, 0];

function shipped(): unknown {
  return JSON.parse(readFileSync(BALANCE_PATH, "utf8")) as unknown;
}

function patch(raw: unknown, edits: Record<string, number>): unknown {
  const out = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  for (const [path, value] of Object.entries(edits)) {
    const parts = path.split(".");
    let cur = out as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
    cur[parts[parts.length - 1]!] = value;
  }
  return out;
}

/** The act-1 foray route: the act-1 node that carries a population (the town does not). */
function forayRoute(loaded: LoadedContent): string {
  for (const id of actNodeIds(1, loaded)) {
    const node = loaded.nodes.find((n) => n.id === id);
    if (node && Object.keys(node.populations).length > 0) return id;
  }
  throw new Error("ttk-probe: act 1 opens no node with a population");
}

interface Roll { lineId: string; age: AgeClass; level: number }

/** One encounter, exactly as game/encounters.ts rolls it: weight = live count (G3). */
function rollWild(loaded: LoadedContent, routeId: string, act: number, rng: { nextFloat(): number; int(a: number, b: number): number }): Roll {
  const b = loaded.balance;
  const node = loaded.nodes.find((n) => n.id === routeId)!;
  const entries = Object.entries(node.populations);
  const total = entries.reduce((s, [, p]) => s + p.count, 0);
  let x = rng.nextFloat() * total;
  let lineId = entries[0]![0];
  for (const [id, p] of entries) { x -= p.count; if (x <= 0) { lineId = id; break; } }
  const aw = b.encounter.ageWeights;
  let y = rng.nextFloat() * (aw.J + aw.A + aw.E);
  let age: AgeClass = "J";
  for (const a of ["J", "A", "E"] as AgeClass[]) { y -= aw[a]; if (y <= 0) { age = a; break; } }
  const base = b.encounter.levelByYear[act - 1] ?? b.encounter.levelByYear[0]!;
  const j = b.encounter.levelJitter;
  return { lineId, age, level: Math.max(b.encounter.minLevel, base + rng.int(-j, j + 1)) };
}

interface Ttk { kill: number[]; die: number[]; oneShots: number; battles: number }

/** Time to kill, 1v1, player on argmax every turn. `turns` is exchanges: one step = one round. */
function measureTtk(loaded: LoadedContent, route: string, lineId: string, level: number, act: number, seeds: number): Ttk {
  const tags = subsystemTags(loaded.balance);
  const row: Ttk = { kill: [], die: [], oneShots: 0, battles: 0 };
  for (let i = 0; i < seeds; i++) {
    const seed = seedFor(loaded.balance, i);
    const w = rollWild(loaded, route, act, createRng(seed));
    const input: BattleInput = {
      seed, kind: "wild", nodeId: route,
      playerParty: [{ uid: "p1", lineId, age: "J", level, traits: [] } as BattlerSpec],
      enemyParty: [{ uid: "w1", lineId: w.lineId, age: w.age, level: w.level, traits: [] }],
      bag: {},
    };
    const rng = subsystemRng(seed, tags.battle);
    let state = startBattle(input, loaded.battle).state;
    let turns = 0;
    let oneShot = false;
    while (state.outcome === null && turns < loaded.balance.harness.maxBattleTurns) {
      const me = state.battlers[state.activePlayerUid]!;
      const full = me.curHp === me.maxHp;
      const res = step(state, { kind: "move", moveId: bestMoveId(me, state.battlers[state.activeEnemyUid]!, loaded.battle, { usePredation: true, nodeId: route }) }, rng, loaded.battle);
      if (res.state === state) break;
      state = res.state;
      turns += 1;
      if (full && state.battlers[state.activePlayerUid]!.fainted) oneShot = true;
    }
    row.battles += 1;
    if (oneShot) row.oneShots += 1;
    if (state.outcome === "win") row.kill.push(turns);
    else if (state.outcome === "loss") row.die.push(turns);
  }
  return row;
}

type CatchOut = "caught" | "killedIt" | "playerDown" | "outOfSnares" | "stalled";

/**
 * The catcher policy: attack until the target is at or below `throwAt` of max HP, then throw.
 * This is the most favourable HONEST policy — it never throws at full HP (the §7.4 hp term punishes
 * that) and never keeps attacking a target already in the window.
 */
function measureCatch(loaded: LoadedContent, route: string, lineId: string, level: number, seeds: number, snares: number, tier: SnareTier, throwAt: number): Record<CatchOut, number> {
  const b = loaded.balance;
  const tags = subsystemTags(b);
  const tally: Record<CatchOut, number> = { caught: 0, killedIt: 0, playerDown: 0, outOfSnares: 0, stalled: 0 };
  for (let i = 0; i < seeds; i++) {
    const seed = seedFor(b, i);
    const w = rollWild(loaded, route, 1, createRng(seed));
    const input: BattleInput = {
      seed, kind: "wild", nodeId: route,
      playerParty: [{ uid: "p1", lineId, age: "J", level, traits: [] } as BattlerSpec],
      enemyParty: [{ uid: "w1", lineId: w.lineId, age: w.age, level: w.level, traits: [] }],
      bag: { [tier]: snares },
    };
    const rng = subsystemRng(seed, tags.battle);
    let state = startBattle(input, loaded.battle).state;
    let turns = 0;
    let out: CatchOut | null = null;
    while (state.outcome === null && turns < b.harness.maxBattleTurns) {
      const it = state.battlers[state.activeEnemyUid]!;
      const frac = it.maxHp === 0 ? 0 : it.curHp / it.maxHp;
      const left = state.bag[tier] ?? 0;
      let action: BattleAction;
      if (frac <= throwAt) {
        if (left === 0) { out = "outOfSnares"; break; }
        action = { kind: "snare", tier };
      } else {
        action = { kind: "move", moveId: bestMoveId(state.battlers[state.activePlayerUid]!, it, loaded.battle, { usePredation: true, nodeId: route }) };
      }
      const res = step(state, action, rng, loaded.battle);
      if (res.state === state) { out = "stalled"; break; }
      state = res.state;
      turns += 1;
    }
    if (out === null) {
      out = state.outcome === "caught" ? "caught" : state.outcome === "win" ? "killedIt" : state.outcome === "loss" ? "playerDown" : "stalled";
    }
    tally[out] += 1;
  }
  return tally;
}

function gymRow(loaded: LoadedContent, seeds: number, offsets: readonly number[]): { rates: number[]; turns: number[] } {
  const gyms = [...loaded.gyms].sort((a, c) => a.act - c.act);
  const rates: number[] = [];
  const turns: number[] = [];
  gyms.forEach((g, i) => {
    const o = runOneGym(g, i, loaded, seeds, 8, "trained", offsets[i] ?? 0);
    rates.push(o.winRate * 100);
    turns.push(o.meanTurns);
  });
  return { rates, turns };
}

const p1 = (n: number): string => n.toFixed(1).padStart(5);
const argv = process.argv.slice(2);
const num = (flag: string, dflt: number): number => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : dflt;
};
const seeds = num("--seeds", 300);
const gymSeeds = num("--gym-seeds", 200);
const base = shipped();

if (argv.includes("--verify")) {
  // The reference row: balance.json xp._curveOutranTheLadder's six figures, at the coefficient
  // they were measured at. If this does not print 98.5 94.0 81.0 93.0 90.5 61.5, the instrument
  // has drifted and nothing else in this file may be believed.
  const loaded = loadContentFromRaw(patch(base, { "stats.levelCoefficient": 0.02, "damage.divisor": 1 }), null);
  const { rates } = gymRow(loaded, gymSeeds, ARRIVAL_OFFSET);
  console.log("reference (c=0.02, D=1):", rates.map(p1).join(" "));
  console.log("expected              :  98.5  94.0  81.0  93.0  90.5  61.5");
}

if (argv.includes("--sweep")) {
  const cells: Array<[number, number]> = [
    [0.02, 1], [0.10, 1],
    [0.02, 3], [0.02, 4],
    [0.06, 4], [0.10, 3], [0.10, 4], [0.10, 5],
  ];
  console.log("\nc      D | act-1 exchanges kill/die | one-shot | caught | killed-it | KO'd | gym win rates");
  console.log("─".repeat(118));
  for (const [c, d] of cells) {
    const loaded = loadContentFromRaw(patch(base, { "stats.levelCoefficient": c, "damage.divisor": d }), null);
    const route = forayRoute(loaded);
    const lvl = loaded.balance.xp.starterLevel;
    const k: number[] = [], di: number[] = [], os: number[] = [], ca: number[] = [], ki: number[] = [], pd: number[] = [];
    for (const line of starterLines(loaded)) {
      const t = measureTtk(loaded, route, line.id, lvl, 1, seeds);
      k.push(t.kill.reduce((a, x) => a + x, 0) / Math.max(1, t.kill.length));
      di.push(t.die.reduce((a, x) => a + x, 0) / Math.max(1, t.die.length));
      os.push((100 * t.oneShots) / t.battles);
      const cc = measureCatch(loaded, route, line.id, lvl, seeds, 3, "base", 0.5);
      ca.push((100 * cc.caught) / seeds); ki.push((100 * cc.killedIt) / seeds); pd.push((100 * cc.playerDown) / seeds);
    }
    const rng2 = (a: number[]): string => `${Math.min(...a).toFixed(1)}-${Math.max(...a).toFixed(1)}`;
    const { rates } = gymRow(loaded, gymSeeds, ARRIVAL_OFFSET);
    console.log(`${c.toFixed(2)}  ${d} | ${rng2(k).padStart(9)} / ${rng2(di).padStart(9)} | ${rng2(os).padStart(8)} | ${rng2(ca).padStart(9)} | ${rng2(ki).padStart(8)} | ${rng2(pd).padStart(9)} | ${rates.map(p1).join(" ")}`);
  }
}

if (argv.includes("--offsets")) {
  // What the ladder does as the player arrives NEARER the leaders. The offsets are what the xp
  // curve produces; this prices the ladder against them without modelling the curve itself.
  const loaded = loadContentFromRaw(base, null);
  const sets: Array<[string, number[]]> = [
    ["shipped xp curve   +9/+7/+6/+5/+4/0", [9, 7, 6, 5, 4, 0]],
    ["two thirds of it   +6/+5/+4/+3/+3/0", [6, 5, 4, 3, 3, 0]],
    ["half of it         +4/+3/+3/+2/+2/0", [4, 3, 3, 2, 2, 0]],
    ["a third of it      +3/+2/+2/+1/+1/0", [3, 2, 2, 1, 1, 0]],
    ["parity             +0/+0/+0/+0/+0/0", [0, 0, 0, 0, 0, 0]],
  ];
  console.log("\narrival offsets over each leader        | gym win rates (shipped c=0.10, D=4)   | mean turns");
  console.log("bands                                   |  80-95  80-95  60-80  60-80  45-65  45-65");
  console.log("─".repeat(112));
  for (const [label, offs] of sets) {
    const { rates, turns } = gymRow(loaded, gymSeeds, offs);
    console.log(`${label.padEnd(39)}| ${rates.map(p1).join(" ")} | ${turns.map((t) => t.toFixed(0).padStart(3)).join(" ")}`);
  }
}
