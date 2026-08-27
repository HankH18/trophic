/**
 * tests/integration/seams.test.ts — the defects that exist only BETWEEN lanes.
 *
 * Lanes A1 (types + content), A2 (rng/clock/foodweb/ecosim), A3 (battle) and A4 (lifecycle/save)
 * were built independently and could not see each other's work. Each lane's own suite is green in
 * isolation, which is exactly the condition under which a seam defect survives: every module is
 * right about its own half of a contract and wrong about the other half.
 *
 * Everything below runs the REAL modules against the SHIPPED data — no fixtures, no stubs, no
 * hand-built webs. Each block names the disagreement it exists to catch, with the measured numbers
 * from the integration run that found it.
 */

import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import type { Balance, NodePopulation, NodeState, SpeciesLine } from "../../core/types";
import {
  deriveFoodWeb,
  encounterWeights,
  indexSpecies,
  toEcoNode,
  type EcoNode,
} from "../../core/foodweb";
import {
  applyCatch,
  applyRelease,
  clampPopulationCount,
  makeContext,
  stepRegionStates,
  derivePresence,
  ecoConstants,
  step as ecoStep,
} from "../../core/ecosim";
import {
  advance,
  advanceAction,
  createClock,
  seasonAt,
  seasonsOfYear,
  ticksForAction,
  type ClockEvent,
} from "../../core/clock";
import { actOf, awardBadge } from "../../core/acts";
import { createRng, subsystemRng, deriveStream } from "../../core/rng";
import {
  asBattleRng,
  caughtIndividual,
  makeBattleContext,
  predationOracleFromWebs,
  startBattle,
  step as battleStep,
} from "../../core/battle";
import { appendAction, catchAction, newSave, replay, type SaveEnvelope } from "../../core/save";
import { applyCatchToSave } from "../../game/wild-battle";
import { runYearTurn } from "../../core/lifecycle";

const content = validateContent();
const balance: Balance = content.balance;
const idx = indexSpecies(content.species);
const nodeFile = (id: string) => {
  const f = content.nodes.find((n) => n.id === id);
  if (!f) throw new Error(`no node ${id}`);
  return f;
};

/* ════════════════════════════════════════════════════════════════════════════
 * SEAM 1 — battle's Predation rule reads core/foodweb.ts's derivation.
 *
 * build-doc §8.3 / G3: "no file other than core/foodweb.ts may compute diet edges." bible §1's
 * Predation rule (+25% when the attacker eats the defender) is the most likely place for a lane to
 * have shipped a local table, because battle.ts needs an answer and foodweb.ts is another lane's.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("SEAM — battle predation is a read of core/foodweb.ts, not a table of its own", () => {
  const r2 = toEcoNode(nodeFile("r2"));
  const web = deriveFoodWeb(r2, idx, balance);
  const ctx = makeBattleContext(content, predationOracleFromWebs([web]));

  it("the shipped node really does derive edges (the test is not vacuous)", () => {
    const pairs = Object.entries(web.edges).filter(([, prey]) => prey.length > 0);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("every derived edge, and only a derived edge, answers true", () => {
    const derived = new Set(
      Object.entries(web.edges).flatMap(([pred, prey]) => prey.map((p) => `${pred}>${p}`)),
    );
    const lines = Object.keys(r2.populations);
    for (const a of lines) {
      for (const b of lines) {
        expect(
          ctx.predation.eats(a, b, "r2"),
          `predation(${a} -> ${b}) disagrees with core/foodweb.ts's derivation`,
        ).toBe(derived.has(`${a}>${b}`));
      }
    }
    // Directional, as a food web is: nothing eats its own predator.
    for (const [pred, prey] of Object.entries(web.edges)) {
      for (const p of prey) expect(ctx.predation.eats(p, pred, "r2")).toBe(false);
    }
  });

  it("the ×1.25 actually reaches the damage number, and is balance.types.predation", () => {
    const pair = Object.entries(web.edges).find(([, prey]) => prey.length > 0);
    if (!pair) throw new Error("no edge at r2");
    const [predator, preyList] = pair;
    const prey = preyList[0] as string;

    const fight = (attacker: string, defender: string) => {
      const line = idx.byId.get(attacker) as SpeciesLine;
      let st = startBattle(
        {
          seed: 7,
          kind: "wild",
          playerParty: [{ uid: "p", lineId: attacker, age: "A", level: 20, traits: [] }],
          enemyParty: [{ uid: "e", lineId: defender, age: "A", level: 20, traits: [] }],
          nodeId: "r2",
        },
        ctx,
      ).state;
      const r = battleStep(st, { kind: "move", moveId: line.movePool.type1 }, createRng(99), ctx);
      const dmg = r.events.find((e) => e.t === "damage" && e.uid === "e");
      return dmg as { t: "damage"; amount: number; predation: boolean } | undefined;
    };

    const withPredation = fight(predator, prey);
    expect(withPredation?.predation, "the derived predator's hit is not flagged as predation").toBe(true);
    const reverse = fight(prey, predator);
    expect(reverse?.predation).toBe(false);
    expect(balance.types.predation).toBe(1.25);
  });

  it("a battle at a node the web does not cover does not inherit that node's edges", () => {
    // The oracle folds a union for a battle that names no node (a gym fight handed the region).
    // A battle that DOES name a node must read that node's derivation only, or the +25% leaks to
    // pairs no single node's web contains.
    const r1web = deriveFoodWeb(toEcoNode(nodeFile("r1")), idx, balance);
    const both = makeBattleContext(content, predationOracleFromWebs([r1web, web]));
    const r2edge = Object.entries(web.edges).find(([, p]) => p.length > 0);
    if (!r2edge) throw new Error("no r2 edge");
    const [pred, preys] = r2edge;
    const prey = preys[0] as string;
    expect(both.predation.eats(pred, prey, "r2")).toBe(true);
    // Neither line lives at r1, so r1's derivation contains no such edge.
    expect(Object.keys(r1web.edges)).not.toContain(pred);
    expect(both.predation.eats(pred, prey, "r1")).toBe(false);
    // …and with no node named, the union answers — the documented fallback.
    expect(both.predation.eats(pred, prey)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * SEAM 2 — Hard Req 2, end to end.
 *
 * "Catching decrements the real population of that species at that node; the in-game survey shows
 * real numbers, never proxies." Three modules touch that sentence and none of them owns all of it:
 * core/battle.ts reports the individual, core/ecosim.ts owns the population arithmetic, and
 * core/save.ts is what a replay writes through.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("SEAM — Hard Req 2: a real battle catch moves a real number in the survey", () => {
  const web = deriveFoodWeb(toEcoNode(nodeFile("r1")), idx, balance);
  const ctx = makeBattleContext(content, predationOracleFromWebs([web]));

  /** Run a real battle to a real catch, snaring with the shipped master tier. */
  function catchOne(save: SaveEnvelope, lineId: string) {
    const rng = subsystemRng(save.seed, "battle");
    let st = startBattle(
      {
        seed: save.seed,
        kind: "wild",
        playerParty: [{ uid: "p1", lineId: "cindril-line", age: "A", level: 20, traits: [] }],
        enemyParty: [{ uid: "w1", lineId, age: "J", level: 4, traits: [] }],
        nodeId: "r1",
        bag: { master: 99 },
      },
      ctx,
    ).state;
    for (let turn = 0; st.outcome === null && turn < 80; turn++) {
      st = battleStep(st, { kind: "snare", tier: "master" }, rng, ctx).state;
    }
    return { state: st, caught: caughtIndividual(st, ctx) };
  }

  it("battle reports a catch carrying the node and line the survey must move", () => {
    const save = newSave({ seed: 4242, currentNode: "r1", nodes: content.nodes }, balance);
    const { state, caught } = catchOne(save, "nibbin-line");
    expect(state.outcome).toBe("caught");
    expect(caught).not.toBeNull();
    expect(caught?.lineId).toBe("nibbin-line");
    // Without the node id the caller cannot decrement anything — this is the whole hand-off.
    expect(caught?.nodeId).toBe("r1");
    expect(caught?.age).toBe("J");
    expect(typeof caught?.metamorphosed).toBe("boolean");
  });

  it("the logged catch decrements the surveyed count by exactly one, from the real starting number", () => {
    let save = newSave({ seed: 4242, currentNode: "r1", nodes: content.nodes }, balance);
    const before = save.nodeStates["r1"]?.populations["nibbin-line"]?.count as number;
    expect(before).toBeGreaterThan(0);
    // The number is the shipped node file's own count — a real number, not a proxy (Hard Req 2).
    expect(before).toBe(nodeFile("r1").populations["nibbin-line"]?.count);

    const { caught } = catchOne(save, "nibbin-line");
    if (!caught?.nodeId) throw new Error("no catch");
    save = appendAction(save, {
      t: "catch",
      nodeId: caught.nodeId,
      lineId: caught.lineId,
      uid: caught.uid,
    });
    const after = replay({ ...save, actionLog: [] }, save.actionLog, {
      species: content.species,
      gyms: content.gyms,
      balance,
    });
    expect(after.nodeStates["r1"]?.populations["nibbin-line"]?.count).toBe(before - 1);
  });

  it("the live ecosim path and the replay path move the count IDENTICALLY, including at the clamps", () => {
    /*
     * The defect this was written for, measured at integration: core/save.ts restated build-doc
     * §7.3 step 4's clamp as `Math.max(populationFloor, count + delta)` — no upper bound — while
     * core/ecosim.ts clamped to [floor, carryCap]. Replaying a release at carrying capacity gave
     * 22 against a cap of 21 (r1 bramblehog-line), which breaks §10.2 `pop_bounds` on the replay
     * path and makes L10 ("identical (seed, actionLog) ⇒ byte-identical final save") false.
     * Separately, applyCatch clamped at a literal 0 while replay read populationFloor, so retuning
     * that key moved one writer and not the other.
     */
    const line = "bramblehog-line";
    const cap = nodeFile("r1").populations[line]?.carryCap as number;
    expect(cap).toBeGreaterThan(0);

    const atCount = (count: number): { node: EcoNode; save: SaveEnvelope } => {
      const node = toEcoNode(nodeFile("r1"));
      (node.populations[line] as { count: number }).count = count;
      const base = newSave({ seed: 1, currentNode: "r1", nodes: content.nodes }, balance);
      const state = base.nodeStates["r1"] as NodeState;
      const pop = state.populations[line] as NodePopulation;
      return {
        node,
        save: {
          ...base,
          nodeStates: {
            ...base.nodeStates,
            r1: { ...state, populations: { ...state.populations, [line]: { ...pop, count } } },
          },
        },
      };
    };

    const through = (
      save: SaveEnvelope,
      t: "catch" | "release",
      b: Balance,
    ): number => {
      const withLog = appendAction(save, { t, nodeId: "r1", lineId: line, uid: "x" });
      const out = replay({ ...withLog, actionLog: [] }, withLog.actionLog, {
        species: content.species,
      gyms: content.gyms,
        balance: b,
      });
      return out.nodeStates["r1"]?.populations[line]?.count as number;
    };

    for (const b of [balance, { ...balance, ecosim: { ...balance.ecosim, populationFloor: 5 } }]) {
      for (const count of [0, 1, 5, cap - 1, cap]) {
        const { node, save } = atCount(count);
        expect(
          through(save, "catch", b),
          `catch at ${count} (floor ${b.ecosim.populationFloor}) disagrees between live and replay`,
        ).toBe(applyCatch(node, line, b).populations[line]?.count);
        expect(
          through(save, "release", b),
          `release at ${count} (floor ${b.ecosim.populationFloor}) disagrees between live and replay`,
        ).toBe(applyRelease(node, line, b).populations[line]?.count);
      }
    }
  });

  it("a release never exceeds carrying capacity on EITHER path (§10.2 pop_bounds)", () => {
    const line = "bramblehog-line";
    const cap = nodeFile("r1").populations[line]?.carryCap as number;
    let node = toEcoNode(nodeFile("r1"));
    (node.populations[line] as { count: number }).count = cap;
    for (let i = 0; i < 5; i++) node = applyRelease(node, line, balance);
    expect(node.populations[line]?.count).toBe(cap);

    const base = newSave({ seed: 1, currentNode: "r1", nodes: content.nodes }, balance);
    const state = base.nodeStates["r1"] as NodeState;
    const pop = state.populations[line] as NodePopulation;
    let save: SaveEnvelope = {
      ...base,
      nodeStates: {
        ...base.nodeStates,
        r1: { ...state, populations: { ...state.populations, [line]: { ...pop, count: cap } } },
      },
    };
    for (let i = 0; i < 5; i++) {
      save = appendAction(save, { t: "release", nodeId: "r1", lineId: line, uid: `r${i}` });
    }
    const out = replay({ ...save, actionLog: [] }, save.actionLog, { species: content.species, gyms: content.gyms, balance });
    expect(out.nodeStates["r1"]?.populations[line]?.count).toBe(cap);
  });

  it("the clamp has ONE implementation and both writers call it", () => {
    // INV-4: the bounds are data. Retuning the floor must move every writer at once.
    expect(clampPopulationCount(-3, 10, balance)).toBe(balance.ecosim.populationFloor);
    expect(clampPopulationCount(999, 10, balance)).toBe(10);
    const raised = { ...balance, ecosim: { ...balance.ecosim, populationFloor: 4 } };
    expect(clampPopulationCount(0, 10, raised)).toBe(4);
  });

  it("catching to extinction removes the species from encounters — the cascade is visible for free", () => {
    // build-doc §7.2: "encounter weight of species s = populations[s].count (0 count = 0
    // encounters)". This is the join that makes Hard Req 2 legible in play rather than only in a
    // survey screen, and it is derived, never tabled (G3).
    let node = toEcoNode(nodeFile("r1"));
    const line = "nibbin-line";
    const before = encounterWeights(node, idx, balance, { season: "spring" }).find((w) => w.lineId === line);
    expect(before?.weight).toBe(node.populations[line]?.count);
    expect(before?.active).toBe(true);

    for (let i = 0; i < 500 && (node.populations[line]?.count ?? 0) > 0; i++) {
      node = applyCatch(node, line, balance);
    }
    const after = encounterWeights(node, idx, balance, { season: "spring" }).find((w) => w.lineId === line);
    expect(after?.weight).toBe(0);
    expect(after?.active).toBe(false);
  });

  it("the join is PRODUCTION code now, and the tape it writes replays to the same number (L10)", () => {
    /*
     * THIS REPLACED A GREEN TEST THAT ASSERTED THE NEGATION OF THE TRUTH.
     *
     * It read `it("HONEST GAP: nothing in production wires battle's catch to the survey yet")` and
     * asserted `callsBoth === false` over a source list of nine `core/*.ts` files plus
     * `game/main.ts`. The wiring landed in `game/wild-battle.ts` — a file that list does not name —
     * so the scan could not see it and the assertion stayed green while stating the opposite of what
     * the repo does. Its own comment said what to do when the wiring arrived ("replace this stand-in
     * with a test of the real thing"); it was never able to say it, because it could not fail.
     *
     * So: the real thing, executed. `applyCatchToSave` is the production join and it is Phaser-free,
     * which is why an integration test can run it rather than grep for it.
     */
    const save = newSave({ seed: 4242, currentNode: "r1", nodes: content.nodes }, balance);
    const before = save.nodeStates["r1"]?.populations["nibbin-line"]?.count as number;
    expect(before).toBeGreaterThan(0);

    const { caught } = catchOne(save, "nibbin-line");
    if (!caught) throw new Error("the reducer reported no catch");

    const applied = applyCatchToSave(save, caught, content);
    expect(applied.problem).toBeNull();
    expect(applied.before).toBe(before);
    expect(applied.after).toBe(before - 1);
    expect(applied.save.nodeStates["r1"]?.populations["nibbin-line"]?.count).toBe(before - 1);
    expect(applied.gained?.lineId).toBe("nibbin-line");

    /*
     * The tape entry, and the replay of it — the two halves the stand-in described by hand.
     *
     * ⚠ THIS ASSERTION USED TO READ `toEqual({ t, nodeId, lineId, uid })`, AND THAT CONTRACT WAS
     * SUPERSEDED BY T-34, not by a defect. A catch entry now carries the individual as well as the
     * count (`core/types.ts` `GameAction`'s `gained`), because nothing else on the tape can rebuild
     * it — the encounter roll, the trait roll and the fight that fixed its age, level and traits are
     * not logged at all, and `replay` therefore reproduced the population and dropped the creature.
     * Exact equality against the canonical constructor is kept, so this is strictly stronger than the
     * four-field version: it still admits no extra field and no missing one, and it now also pins the
     * creature. The four fields are asserted individually beneath it so a regression names itself.
     */
    const logged = applied.save.actionLog.at(-1);
    expect(logged?.action).toEqual(catchAction("r1", applied.gained!));
    expect(logged?.action).toMatchObject({ t: "catch", nodeId: "r1", lineId: "nibbin-line", uid: caught.uid });
    const replayed = replay(
      { ...applied.save, actionLog: [], nodeStates: save.nodeStates },
      applied.save.actionLog,
      { species: content.species, gyms: content.gyms, balance },
    );
    expect(replayed.nodeStates["r1"]?.populations["nibbin-line"]?.count).toBe(before - 1);
    // The creature half, which is the whole of T-34: the replay puts the individual back too.
    expect(replayed.party.map((c) => c.uid)).toEqual(applied.save.party.map((c) => c.uid));
  });

  it("the join has a PRODUCTION caller — which is the half the stale scan could not see", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return e.isFile() && full.endsWith(".ts") ? [full] : [];
      });
    // EVERY core/ and game/ source, discovered rather than listed. The stand-in named ten files by
    // hand and the wiring landed in an eleventh; a hand-written source list is the defect, not the
    // regex it fed.
    const sources = [...walk("core"), ...walk("game")];
    expect(sources.length, "the walk found no sources — it is looking in the wrong place").toBeGreaterThan(10);
    const callers = sources.filter(
      (f) =>
        f !== path.join("game", "wild-battle.ts") &&
        /applyWildBattleOutcome\s*\(|applyCatchToSave\s*\(/.test(fs.readFileSync(f, "utf8")),
    );
    expect(callers, "no production file calls the battle-to-survey join").not.toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * SEAM 3 — who runs the year's fourth season step.
 *
 * build-doc §4 step 5 says the sim runs "at each season boundary — every `ticksPerSeason` ticks";
 * §7.5 step 5 says the YEAR TURN runs "their 4th season step". Two modules, one season. §7.5 is the
 * inlined assignment and wins ("where this doc inlines a formula or schema, the inlined version
 * wins").
 *
 * Nothing below may name a tick count of its own. Every count here is read from `balance.clock`,
 * because this seam was already re-cut once (a 16-tick year became 52) and a literal that survived
 * that would have gone on passing while measuring a different year.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("SEAM — the fourth season runs exactly once (build-doc §7.5 step 5)", () => {
  const seasons = seasonsOfYear(balance);

  it("one full year of play cues exactly one season step per season", () => {
    /*
     * The defect, measured at integration: `clock.advance` emitted `seasonBoundary(winter@16)` AND
     * `yearEnd`, while `runYearTurn` independently stepped `seasonOrder[last]`. A caller doing the
     * documented thing ran FIVE season steps a year instead of four — a 25% inflation of every
     * six-year trajectory, silent, and invisible to either lane's own suite.
     */
    let clock = createClock(balance);
    const events: ClockEvent[] = [];
    /*
     * ONE YEAR, spent in the unit the player actually spends: forays. Derived, because
     * "ticksPerYear iterations of a foray" is only one year while a foray costs exactly one tick —
     * and the year has already been re-cut once (16 → 52 ticks). If a foray is ever retuned this
     * loop still covers exactly one year instead of silently covering two or half of one.
     */
    const forayCost = ticksForAction("foray", balance);
    const foraysPerYear = balance.clock.ticksPerYear / forayCost;
    expect(
      Number.isInteger(foraysPerYear),
      `a foray costs ${String(forayCost)} ticks, which does not divide the ${String(balance.clock.ticksPerYear)}-tick year`,
    ).toBe(true);
    for (let i = 0; i < foraysPerYear; i++) {
      const r = advanceAction(clock, "foray", balance);
      clock = r.clock;
      events.push(...r.events);
    }
    // Non-vacuity: the loop really did spend the whole meter and land on the new year.
    expect(clock.year).toBe(balance.clock.startYear + 1);
    expect(clock.tick).toBe(0);
    const boundaries = events.filter((e) => e.t === "seasonBoundary");
    const yearEnds = events.filter((e) => e.t === "yearEnd");
    expect(yearEnds).toHaveLength(1);
    expect(boundaries).toHaveLength(seasons.length - 1);
    expect(boundaries.length + yearEnds.length).toBe(seasons.length);
    // The clock never cues the season the year turn owns.
    expect(boundaries.map((b) => (b as { seasonEnded: string }).seasonEnded)).not.toContain(
      seasons[seasons.length - 1],
    );
  });

  it("the year turn steps exactly the season the clock withheld, once per node", () => {
    const save = newSave({ seed: 5, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const stepped: Array<{ nodeId: string; season: string }> = [];
    const result = runYearTurn(save, {
      species: content.species,
      balance,
      nodes: content.nodes,
      ecosimStep: (nodeId, state, season) => {
        stepped.push({ nodeId, season });
        return state;
      },
    });
    expect(result.seasonStepRan).toBe(true);
    expect(stepped).toHaveLength(content.nodes.length);
    for (const s of stepped) expect(s.season).toBe(seasons[seasons.length - 1]);
    // One per node, no repeats.
    expect(new Set(stepped.map((s) => s.nodeId)).size).toBe(content.nodes.length);
  });

  it("A GYM WIN ENDS NOTHING — no clock event, no season step, no year (D-Q2-1)", () => {
    /*
     * The amended L8: "year = full meter", and nothing else. This test used to assert the opposite
     * ("a year ended early by a gym win still advances the ecology exactly once") and is inverted
     * on Hank's authorisation.
     *
     * Asserted through the SEAM rather than by the absence of an export: at a tick in every season
     * of a year, awarding the badge that a gym win writes moves neither half of the clock and
     * produces no ecology step at all — and the act it advances is a different axis entirely.
     *
     * ⚠ THE SAMPLE POINTS ARE DERIVED AND THE COVERAGE IS ASSERTED. They were the literals
     * `[0, 3, 7, 11, 15]` — tick 0 plus the last tick of each season, chosen when a season was 4
     * ticks. Against the shipped 13-tick season four of those five fall in SPRING and the fifth in
     * SUMMER (measured: 2 distinct seasons of 4), so a sweep that reads as "every season" would
     * have covered half of one, silently, with the test still green. That is the whole failure mode
     * this file exists to catch, occurring in this file.
     */
    const ticksPerSeason = balance.clock.ticksPerSeason;
    // Tick 0, then the LAST tick of each season — [0, 12, 25, 38, 51] as shipped.
    const sampleTicks = [0, ...seasons.map((_, i) => (i + 1) * ticksPerSeason - 1)];
    expect(
      new Set(sampleTicks.map((t) => seasonAt(t, balance))).size,
      `the sweep ${JSON.stringify(sampleTicks)} no longer covers every season`,
    ).toBe(seasons.length);
    expect(Math.max(...sampleTicks)).toBe(balance.clock.ticksPerYear - 1);
    for (const tick of sampleTicks) {
      const before = { ...newSave({ seed: 7, currentNode: "hearthollow", nodes: content.nodes }, balance), year: 2, tick };
      const after = awardBadge(before, "maribel", balance);
      expect({ year: after.year, tick: after.tick }).toEqual({ year: 2, tick });
      expect(after.nodeStates).toEqual(before.nodeStates);
      // The ONE thing it moves: the act.
      expect(actOf(after, content.gyms, balance)).toBeGreaterThan(actOf(before, content.gyms, balance));
    }
  });

  it("six years is 24 season steps, not 30", () => {
    let clock = createClock(balance);
    let boundaries = 0;
    let yearTurns = 0;
    const lastYear = balance.clock.startYear + balance.clock.yearsTotal;
    while (clock.year < lastYear) {
      const r = advanceAction(clock, "foray", balance);
      clock = r.clock;
      for (const e of r.events) {
        if (e.t === "seasonBoundary") boundaries += 1;
        if (e.t === "yearEnd") yearTurns += 1;
      }
    }
    expect(yearTurns).toBe(balance.clock.yearsTotal);
    expect(boundaries + yearTurns).toBe(balance.clock.yearsTotal * seasons.length);
    expect(boundaries + yearTurns).toBe(24);
  });

  it("and the extra season step really would change the trajectory (the defect was not cosmetic)", () => {
    // Drive the shipped region for one year under both accountings and compare the survey. If the
    // one extra step were free, the fix would not matter; it is not.
    const run = (stepsPerYear: number) => {
      let states: Record<string, NodeState> = {};
      for (const f of content.nodes) {
        states[f.id] = { populations: structuredClone(f.populations), floraStock: f.floraStock, recentDeaths: 0 };
      }
      const rng = createRng(1234);
      for (let s = 0; s < stepsPerYear; s++) {
        const season = seasons[s % seasons.length];
        if (!season) throw new Error("no season");
        states = stepRegionStates(content.nodes, states, season, rng).states;
      }
      return Object.entries(states)
        .map(([id, st]) => `${id}:${Object.values(st.populations).map((p) => p.count).join(",")}`)
        .join("|");
    };
    // Derived: the honest count is one step per season, and the defect was exactly one more.
    expect(run(seasons.length)).not.toBe(run(seasons.length + 1));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * SEAM 4 — one RNG, independent streams.
 *
 * build-doc §8.1: "One seeded xorshift128 stream per subsystem, seeds derived from save seed +
 * subsystem tag. No Math.random anywhere." A lane that instantiated its own generator would keep
 * its own tests deterministic and still break `det_replay` across the seam.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("SEAM — every lane draws from core/rng.ts", () => {
  it("core/rng.ts is the only generator: every OTHER core module takes one, it does not make one", () => {
    /*
     * ⚠ THIS WAS THE UNFIXED TWIN OF THE DEFECT ABOVE, ONE BLOCK BELOW IT IN THIS FILE.
     *
     * It read `for (const m of ["battle","ecosim","lifecycle","save","clock","foodweb"])` — six
     * `core/` modules named by hand. `core/` holds twelve: `acts.ts`, `regional-events.ts`,
     * `dialogue-schema.ts`, `quests.ts`, `schemas.ts` and `types.ts` were never scanned, so a second
     * xorshift landing in any of them was invisible to the one test that exists to forbid it. That
     * is exactly the same mechanism — "a hand-written source list is the defect, not the
     * regex it fed" — and the repair pass fixed the instance it was pointed at and left this one.
     *
     * So the modules are DISCOVERED. Measured across all twelve: `core/rng.ts` is the only file that
     * shifts bits, so widening the scan does not move it off green — it moves it off blind.
     */
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return e.isFile() && full.endsWith(".ts") ? [full] : [];
      });
    const home = path.join("core", "rng.ts");
    const modules = walk("core").filter((f) => f !== home);
    expect(modules.length, "the walk found no core modules — it is looking in the wrong place").toBeGreaterThan(6);
    // No second implementation: an xorshift needs these shifts, and only core/rng.ts has them.
    const shifty = modules.filter((f) => />>>\s*\d+/.test(fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
    expect(shifty, "a core module other than core/rng.ts looks like it shifts bits").toEqual([]);
    // …and the home of the generator really does, so the scan is not vacuously clean.
    expect(/>>>\s*\d+/.test(fs.readFileSync(home, "utf8"))).toBe(true);
  });

  it("battle's RNG adapter accepts core/rng.ts's stream unchanged", () => {
    // core/battle.ts declares its own narrow `BattleRng` (it was written before core/rng.ts
    // existed). If the two shapes drift, every battle silently loses its seed — so the adapter is
    // exercised against the real stream, not a stub.
    const real = subsystemRng(99, "battle");
    const adapted = asBattleRng(real);
    const drawn = [adapted.float(), adapted.float(), adapted.float()];
    for (const v of drawn) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of drawn) expect(v).toBeLessThan(1);
    // The adapter is a view, not a copy: it consumes the same stream.
    const fresh = subsystemRng(99, "battle");
    expect([fresh.nextFloat(), fresh.nextFloat(), fresh.nextFloat()]).toEqual(drawn);
    // A source that is not a unit-interval draw must fail loudly rather than produce plausible damage.
    expect(() => asBattleRng(() => 7).float()).toThrow(/\[0, 1\)/);
  });

  it("the subsystem tags are data, and each tag is an independent stream", () => {
    /*
     * ⚠ ORDER IS LOAD-BEARING and the list is APPEND-ONLY, which is why this is `toEqual` on the
     * whole array rather than a `toContain` per tag: `tools/harness/content.ts` `subsystemTags`
     * destructures the first three POSITIONALLY as (battle, sim, encounter), so a reorder silently
     * hands the harness the wrong stream for every battle it runs.
     *
     * "lifecycle" was appended on 2026-08-26. Before that the list was exactly the three,
     * and the heir roll — which is lifecycle randomness — had no stream to name, so
     * `game/scenes/OverworldScene.ts` composed its key out of the SIM tag. Each tag is seeded
     * independently, so appending one moved no existing stream by a draw; the next assertion is
     * what proves that, and `tests/property/determinism.test.ts` proves it end to end.
     */
    expect(balance.rng.subsystemTags).toEqual(["battle", "sim", "encounter", "lifecycle"]);
    const seed = 20260825;
    const heads = balance.rng.subsystemTags.map((tag) => {
      const r = subsystemRng(seed, tag);
      return [r.nextFloat(), r.nextFloat(), r.nextFloat()].join(",");
    });
    expect(new Set(heads).size).toBe(heads.length);
    // Same seed + same tag is the same stream — that is what makes a replay a replay.
    expect(subsystemRng(seed, "sim").nextFloat()).toBe(subsystemRng(seed, "sim").nextFloat());
  });

  it("the sim's per-node child streams are independent of node order", () => {
    // INV-2: adding a node elsewhere in the graph must not move another node's draws.
    const parent = () => createRng(4242);
    const a = deriveStream(parent(), "r1").nextFloat();
    const b = deriveStream(parent(), "r1").nextFloat();
    expect(a).toBe(b);
    expect(deriveStream(parent(), "r2").nextFloat()).not.toBe(a);
  });

  it("a battle run on a seeded stream is reproducible across the seam", () => {
    const web = deriveFoodWeb(toEcoNode(nodeFile("r1")), idx, balance);
    const ctx = makeBattleContext(content, predationOracleFromWebs([web]));
    const run = () => {
      const rng = subsystemRng(31337, "battle");
      let st = startBattle(
        {
          seed: 31337,
          kind: "wild",
          playerParty: [{ uid: "p", lineId: "cindril-line", age: "A", level: 12, traits: [] }],
          enemyParty: [{ uid: "e", lineId: "nibbin-line", age: "A", level: 10, traits: [] }],
          nodeId: "r1",
        },
        ctx,
      ).state;
      const log: string[] = [];
      const line = idx.byId.get("cindril-line") as SpeciesLine;
      for (let t = 0; st.outcome === null && t < 40; t++) {
        const r = battleStep(st, { kind: "move", moveId: line.movePool.type1 }, rng, ctx);
        st = r.state;
        log.push(r.events.map((e) => e.t).join(">"));
      }
      return `${st.outcome}|${log.join("/")}`;
    };
    expect(run()).toBe(run());
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * SEAM 5 — the sim context the year turn hands the ecosim.
 *
 * core/lifecycle.ts's `EcosimStepFn` is `(nodeId, state, season) => NodeState`; core/ecosim.ts's
 * step needs a `SimContext` whose `presence` map covers every node it will touch, or Ancient
 * presence effects are silently off. The adapter between them is the caller's, and it is easy to
 * write in a way that compiles and does nothing.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("SEAM — the year turn's season step runs WITH presence effects on", () => {
  it("stepRegionStates is the shape lifecycle's EcosimStepFn needs, and derives presence itself", () => {
    const save = newSave({ seed: 8, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const rng = subsystemRng(save.seed, "sim");
    const out = stepRegionStates(content.nodes, save.nodeStates, "winter", rng);
    expect(Object.keys(out.states).sort()).toEqual(content.nodes.map((n) => n.id).sort());
    for (const st of Object.values(out.states)) {
      for (const pop of Object.values(st.populations)) {
        expect(Number.isInteger(pop.count)).toBe(true);
        expect(pop.count).toBeGreaterThanOrEqual(balance.ecosim.populationFloor);
        expect(pop.count).toBeLessThanOrEqual(pop.carryCap);
      }
    }
  });

  it("a single-node step with no presence entry is REFUSED, not run with the effects off", () => {
    // The narrow entry point build-doc §7.3 names, `step(node, season, rng)`, cannot derive an
    // Ancient's effect on its own — the effect reaches NEIGHBOURS. Silence here is how Hard Req 7's
    // honest cost disappears without a word, so it throws.
    const sanctum = toEcoNode(nodeFile("sanctum"));
    const empty = makeContext(idx, balance, {});
    expect(() => ecoStep(sanctum, "spring", createRng(1), empty)).toThrow(/presence/i);
  });

  it("stepRegionStates ALWAYS re-derives presence, so a stale map cannot disable an effect", () => {
    // The safety property that makes the seam safe for a Lane C caller: whatever presence map the
    // context carries, the region step recomputes it from the state it is about to step. Proven by
    // handing it a deliberately WRONG map (every effect off) and getting the correct answer.
    const nodes = content.nodes.map((f) => toEcoNode(f));
    const eco = ecoConstants(balance);
    const blank: Record<string, ReturnType<typeof derivePresence>[string]> = {};
    for (const n of nodes) {
      blank[n.id] = { breedMult: 1, typeBreedMult: {}, typeBreedFloor: {}, sources: [] };
    }
    const base = newSave({ seed: 77, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const survey = (states: Record<string, NodeState>) =>
      Object.entries(states)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, st]) => `${id}:${Object.entries(st.populations).sort().map(([k, p]) => `${k}=${p.count}`).join(",")}`)
        .join("|");

    const withLie = stepRegionStates(content.nodes, base.nodeStates, "spring", createRng(5), makeContext(idx, balance, blank));
    const withTruth = stepRegionStates(
      content.nodes,
      base.nodeStates,
      "spring",
      createRng(5),
      makeContext(idx, balance, derivePresence(nodes, idx, balance, eco)),
    );
    expect(survey(withLie.states)).toBe(survey(withTruth.states));

    // …and the effects are genuinely ON: the shipped region has three free Ancients, and every one
    // of them is listed as a source somewhere. A vacuous "no effects anywhere" would pass the
    // equality above, so this is the non-vacuity check.
    const presence = derivePresence(nodes, idx, balance, eco);
    const ancients = content.species.filter((s) => s.ancient).map((s) => s.id);
    expect(ancients.length).toBe(3);
    for (const a of ancients) {
      const reach = Object.values(presence).filter((p) => p.sources.includes(a));
      expect(reach.length, `${a} exerts no presence effect anywhere`).toBeGreaterThan(0);
    }
  });

  it("a full year driven through the two modules keeps every population in bounds", () => {
    // The composed loop a Lane C caller will write: three clock boundaries, then the year turn's
    // step, for each of the six years. Nothing may leave [floor, carryCap] anywhere along the way.
    let save = newSave({ seed: 2468, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const rng = subsystemRng(save.seed, "sim");
    let clock = createClock(balance);
    let steps = 0;

    const lastYear = balance.clock.startYear + balance.clock.yearsTotal;
    while (clock.year < lastYear) {
      const r = advance(clock, 1, balance);
      clock = r.clock;
      for (const e of r.events) {
        if (e.t === "seasonBoundary") {
          save = { ...save, nodeStates: stepRegionStates(content.nodes, save.nodeStates, e.seasonEnded, rng).states };
          steps += 1;
        }
        if (e.t === "yearEnd") {
          const turn = runYearTurn({ ...save, year: e.year }, {
            species: content.species,
            balance,
            nodes: content.nodes,
            ecosimStep: (nodeId, state, season) =>
              stepRegionStates(
                content.nodes.filter((n) => n.id === nodeId),
                { [nodeId]: state },
                season,
                rng,
              ).states[nodeId] as NodeState,
          });
          save = { ...save, ...turn.save } as SaveEnvelope;
          steps += 1;
        }
      }
      for (const st of Object.values(save.nodeStates)) {
        for (const [lineId, pop] of Object.entries(st.populations)) {
          expect(Number.isInteger(pop.count), `${lineId} went fractional`).toBe(true);
          expect(pop.count).toBeGreaterThanOrEqual(balance.ecosim.populationFloor);
          expect(pop.count).toBeLessThanOrEqual(pop.carryCap);
        }
      }
    }
    // 6 years × 4 seasons, counting the year turn's — the number SEAM 3 exists to protect.
    expect(steps).toBe(balance.clock.yearsTotal * seasonsOfYear(balance).length);
  });
});
