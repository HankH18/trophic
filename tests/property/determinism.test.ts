/**
 * tests/property/determinism.test.ts — build-doc §8.1 / locked decision L10.
 *
 * "Deterministic, seeded; pure function of (initial state, action log)" — which is what buys replay,
 * the tests, and the balance harness for free. The named gate here is `det_sim` (build-doc §10.2):
 * the same seed must produce a byte-identical six-year trajectory, run over many seeds.
 *
 * `det_replay` (the full save-level property) belongs to the lane that owns the action log; what is
 * provable here is its load-bearing half: the ecology is a pure function of (state, seed, seasons),
 * and a stream snapshot resumes exactly where it left off.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyCatch,
  defaultContext,
  step,
  stepAll,
  stepRegionStates,
  toNodeState,
  fromNodeState,
} from "../../core/ecosim";
import { cloneEcoNode, toEcoNode, type EcoNode } from "../../core/foodweb";
import { Rng, createRng, deriveStream, subsystemRng } from "../../core/rng";
import { canonicalStringify } from "../../core/save";
import { validateContent } from "../../core/schemas";
import type { NodePopulation, NodeState, Season } from "../../core/types";
import { advanceAction, createClock } from "../../core/clock";

const content = validateContent();
const ctx = defaultContext();
const balance = content.balance;
const seasons = balance.clock.seasonOrder;

/**
 * The whole region, `balance.clock.yearsTotal` years, one season at a time — serialised exactly as
 * the save would hold it. The span is read off balance rather than written as six, because six is a
 * tunable (build-doc §16 G11) and the property is not about that number.
 */
function trajectory(seed: number, years = balance.clock.yearsTotal): string {
  let nodes = content.nodes.map((file) => toEcoNode(file));
  const rng = subsystemRng(seed, "sim");
  const frames: unknown[] = [];
  for (let year = 0; year < years; year++) {
    for (const season of seasons) {
      nodes = stepAll(nodes, season, rng, ctx).nodes;
      frames.push(nodes.map((n) => toNodeState(n)));
    }
  }
  return JSON.stringify(frames);
}

describe("det_sim — build-doc §10.2", () => {
  it("identical seed ⇒ byte-identical six-year trajectory, across many seeds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        expect(trajectory(seed)).toBe(trajectory(seed));
      }),
      { numRuns: 30 },
    );
  });

  it("different seeds genuinely diverge — the sim is not secretly deterministic-by-rounding", () => {
    const distinct = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) distinct.add(trajectory(seed, 2));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("HOLDS ACROSS AN UNBOUNDED CALENDAR — twenty years is as deterministic as six (D-Q3-1)", () => {
    /*
     * `det_sim` used to be stated over "a six-year trajectory" because six years WAS the game. The
     * calendar has no end now, so the property has to hold over a span the old cap forbade — and it
     * has to keep diverging by seed out there, or the sim would be settling into a fixed point that
     * a six-year test could never see.
     */
    const long = balance.clock.yearsTotal * 3 + 2; // 20 years — well past the old cap
    for (const seed of [1, 4919, 2 ** 31 - 1]) {
      expect(trajectory(seed, long)).toBe(trajectory(seed, long));
    }
    const distinct = new Set<string>();
    for (let seed = 1; seed <= 8; seed += 1) distinct.add(trajectory(seed, long));
    expect(distinct.size).toBeGreaterThan(1);
    // The long trajectory extends the short one rather than replacing it: the first six years of a
    // twenty-year run are byte-identical to a six-year run on the same seed.
    const short = trajectory(99);
    expect(trajectory(99, long).startsWith(short.slice(0, -1))).toBe(true);
  });

  it("the trajectory depends on the seed only through the RNG, not on object identity", () => {
    const a = trajectory(7);
    // Same seed, fresh node objects built a different way (via the save round trip).
    let nodes = content.nodes.map((file) => fromNodeState(file, { ...toNodeState(toEcoNode(file)) }));
    const rng = subsystemRng(7, "sim");
    const frames: unknown[] = [];
    for (let year = 0; year < balance.clock.yearsTotal; year++) {
      for (const season of seasons) {
        nodes = stepAll(nodes, season, rng, ctx).nodes;
        frames.push(nodes.map((n) => toNodeState(n)));
      }
    }
    expect(JSON.stringify(frames)).toBe(a);
  });
});

describe("determinism — a run resumes exactly where it was saved (build-doc §7.8)", () => {
  it("snapshotting the node states and the RNG state reproduces the tail byte-for-byte", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), fc.integer({ min: 1, max: 12 }), (seed, cut) => {
        let nodes = content.nodes.map((file) => toEcoNode(file));
        const rng = subsystemRng(seed, "sim");

        const total = 24;
        let saveNodes: EcoNode[] = [];
        let saveRng = rng.save();
        const wholeRun: unknown[] = [];

        for (let s = 0; s < total; s++) {
          nodes = stepAll(nodes, seasons[s % seasons.length] as Season, rng, ctx).nodes;
          wholeRun.push(nodes.map((n) => toNodeState(n)));
          if (s === cut - 1) {
            saveNodes = nodes.map((n) => cloneEcoNode(n));
            saveRng = rng.save();
          }
        }

        // Reload from the "save" and replay only the tail.
        const restored = new Rng(JSON.parse(JSON.stringify(saveRng)) as ReturnType<Rng["save"]>);
        let resumed = saveNodes.map((n) =>
          fromNodeState(
            content.nodes.find((f) => f.id === n.id) as (typeof content.nodes)[number],
            toNodeState(n),
          ),
        );
        const tail: unknown[] = [];
        for (let s = cut; s < total; s++) {
          resumed = stepAll(resumed, seasons[s % seasons.length] as Season, restored, ctx).nodes;
          tail.push(resumed.map((n) => toNodeState(n)));
        }
        expect(JSON.stringify(tail)).toBe(JSON.stringify(wholeRun.slice(cut)));
      }),
      { numRuns: 20 },
    );
  });

  it("is a pure function of (initial state, action log) — L10", () => {
    // A tiny action log: catch one individual of a named line every foray, advance the clock, and
    // step the sim at each season boundary. Replaying the log from the same seed must land on the
    // same numbers, and the log alone must be enough to reproduce them.
    const script = ["nibbin-line", "nibbin-line", "skir-line", "nibbin-line", "bramblehog-line"];

    const play = (seed: number): string => {
      const file = content.nodes.find((n) => n.id === "hearthollow");
      if (!file) throw new Error("hearthollow missing");
      let node = toEcoNode(file);
      const rng = subsystemRng(seed, "sim");
      let clock = createClock(balance);
      let i = 0;
      const frames: unknown[] = [];
      /*
       * D-Q3-1: `isOver` is gone with the six-year cap it enforced, so the loop bound is now stated
       * by the TEST rather than taken from the clock. The number is deliberately PAST the old cap:
       * det_replay must hold over an unbounded calendar, and a run that stopped at year 6 could not
       * have shown that.
       */
      const lastYear = balance.clock.startYear + balance.clock.yearsTotal * 2;
      while (clock.year < lastYear) {
        const target = script[i % script.length] as string;
        i++;
        node = applyCatch(node, target, balance);
        const { clock: next, events } = advanceAction(clock, "foray", balance);
        clock = next;
        for (const event of events) {
          if (event.t !== "seasonBoundary") continue;
          node = step(node, event.seasonEnded, rng, ctx).node;
          frames.push(toNodeState(node));
        }
      }
      return JSON.stringify(frames);
    };

    expect(play(99)).toBe(play(99));
    expect(play(99)).not.toBe(play(100));
  });

  it("never mutates the state it is given", () => {
    const file = content.nodes.find((n) => n.id === "r2");
    if (!file) throw new Error("r2 missing");
    const node = toEcoNode(file);
    const before = JSON.stringify(node);
    const rng = createRng(3);
    // One full cycle of the year's seasons — read off `balance.clock.seasonOrder`, not the 4 that
    // order happens to hold today, so a retune of the calendar keeps stepping every season exactly once.
    for (let s = 0; s < seasons.length; s++) step(node, seasons[s] as Season, rng, ctx);
    expect(JSON.stringify(node)).toBe(before);
  });

  it("consumes the same number of draws for the same state, whatever the season", () => {
    // Seasonality lives in the §7.2 encounter derivation, not in the population step; if a seasonal
    // term is ever added to ecosim, this is the test that will notice.
    const file = content.nodes.find((n) => n.id === "r1");
    if (!file) throw new Error("r1 missing");
    const results = seasons.map((season) => {
      const rng = createRng(11);
      const node = step(toEcoNode(file), season, rng, ctx).node;
      return { draws: rng.draws, state: JSON.stringify(toNodeState(node)) };
    });
    const first = results[0];
    if (!first) throw new Error("no seasons");
    for (const result of results) {
      expect(result.draws).toBe(first.draws);
      expect(result.state).toBe(first.state);
    }
  });

  it("survives the project's OWN save serializer: sorted keys must not move a single number", () => {
    // core/save.ts sorts every object key at every depth (`canonicalStringify`), and the shipped
    // node JSON does not — so a save → load → continue used to hand the sim its populations in a
    // DIFFERENT key order from an uninterrupted run. Anything that consumed entropy per line in
    // `Object.keys` order then bound each species to a position in the RNG stream, and the two runs
    // diverged with the stream restored perfectly. §8.1's "identical (seed, actionLog) ⇒
    // byte-identical final save" is exactly what that broke.
    const total = 12;
    const cut = 4;
    const seed = 20260824;

    const run = (roundTripAt: number | null): string => {
      let nodes = content.nodes.map((file) => toEcoNode(file));
      const rng = subsystemRng(seed, "sim");
      const frames: string[] = [];
      for (let s = 0; s < total; s++) {
        nodes = stepAll(nodes, seasons[s % seasons.length] as Season, rng, ctx).nodes;
        if (s === roundTripAt) {
          // Exactly what writeSlot → readSlot does to the live sim state.
          const states = JSON.parse(
            canonicalStringify(Object.fromEntries(nodes.map((n) => [n.id, toNodeState(n)]))),
          ) as Record<string, NodeState>;
          nodes = content.nodes.map((file) => fromNodeState(file, states[file.id] as NodeState));
        }
        frames.push(canonicalStringify(nodes.map((n) => toNodeState(n))));
      }
      return frames.join("|");
    };

    expect(run(cut), "the save round trip changed the trajectory").toBe(run(null));

    // The same statement without the serializer: the populations map's key order is not an input.
    const file = content.nodes.find((n) => n.id === "r2");
    if (!file) throw new Error("r2 missing");
    const forward = toEcoNode(file);
    const reversed: EcoNode = { ...forward, populations: {} };
    for (const id of Object.keys(forward.populations).reverse()) {
      reversed.populations[id] = { ...(forward.populations[id] as NodePopulation) };
    }
    expect(Object.keys(reversed.populations)).not.toEqual(Object.keys(forward.populations));
    let a = forward;
    let b = reversed;
    for (let s = 0; s < 8; s++) {
      const season = seasons[s % seasons.length] as Season;
      a = step(a, season, createRng(31), ctx).node;
      b = step(b, season, createRng(31), ctx).node;
      expect(canonicalStringify(toNodeState(b))).toBe(canonicalStringify(toNodeState(a)));
    }
  });

  it("a node's numbers do not depend on where it sits in the region array", () => {
    // One shared stream through twelve nodes meant the number of fractional values one node
    // happened to round phase-shifted every node after it — so a change at one end of the graph
    // moved the numbers at the other end, with no causal path between them. The survey has to be
    // readable as cause and effect (Hard Req 2, and Hard Req 7's epilogue survey is a diff).
    const forward = content.nodes.map((file) => toEcoNode(file));
    const backward = [...forward].map(cloneEcoNode).reverse();
    let a = forward;
    let b = backward;
    const rngA = subsystemRng(5, "sim");
    const rngB = subsystemRng(5, "sim");
    for (let s = 0; s < 8; s++) {
      const season = seasons[s % seasons.length] as Season;
      a = stepAll(a, season, rngA, ctx).nodes;
      b = stepAll(b, season, rngB, ctx).nodes;
      for (const node of a) {
        const mirror = b.find((n) => n.id === node.id);
        expect(canonicalStringify(toNodeState(mirror as EcoNode)), `${node.id} moved with the array order`).toBe(
          canonicalStringify(toNodeState(node)),
        );
      }
    }
  });

  it("changing one node cannot move a node it has no causal path to", () => {
    const target = content.nodes.find((n) => n.id === "cindershelf");
    const witness = content.nodes.find((n) => n.id === "hearthollow");
    if (!target || !witness) throw new Error("shipped graph changed");
    expect(witness.adjacency).not.toContain(target.id);

    const play = (mutate: boolean): string => {
      let nodes = content.nodes.map((file) => {
        const node = toEcoNode(file);
        if (mutate && file.id === target.id) {
          for (const pop of Object.values(node.populations)) pop.count = Math.max(0, pop.count - 1);
        }
        return node;
      });
      const rng = subsystemRng(77, "sim");
      for (let s = 0; s < 12; s++) nodes = stepAll(nodes, seasons[s % seasons.length] as Season, rng, ctx).nodes;
      const seen = nodes.find((n) => n.id === witness.id) as EcoNode;
      return canonicalStringify(toNodeState(seen));
    };
    expect(play(true)).toBe(play(false));
  });

  it("stepRegionStates and stepAll are the same sim (the year turn and replay use the former)", () => {
    const nodes = content.nodes.map((file) => toEcoNode(file));
    const states: Record<string, NodeState> = Object.fromEntries(nodes.map((n) => [n.id, toNodeState(n)]));
    const viaNodes = stepAll(nodes.map(cloneEcoNode), "autumn", subsystemRng(3, "sim"), ctx).nodes;
    const viaStates = stepRegionStates(content.nodes, states, "autumn", subsystemRng(3, "sim"), ctx).states;
    for (const node of viaNodes) {
      expect(canonicalStringify(viaStates[node.id])).toBe(canonicalStringify(toNodeState(node)));
    }
  });

  it("deriveStream costs the parent exactly one draw, whatever the child does", () => {
    const parent = createRng(4);
    const child = deriveStream(parent, "node-a");
    expect(parent.draws).toBe(1);
    for (let i = 0; i < 50; i++) child.nextUint32();
    expect(parent.draws).toBe(1);
    // Same parent state + same tag ⇒ same child; different tag ⇒ different child.
    const again = deriveStream(createRng(4), "node-a");
    const other = deriveStream(createRng(4), "node-b");
    expect(again.nextUint32()).toBe(deriveStream(createRng(4), "node-a").nextUint32());
    expect(other.nextUint32()).not.toBe(again.save().w);
  });

  it("keeps subsystem streams independent: burning sim draws never moves a battle roll", () => {
    const battleFirst = subsystemRng(4242, "battle");
    const firstFive = [0, 0, 0, 0, 0].map(() => battleFirst.nextUint32());

    // …now run a whole year of ecology on the sim stream, then take the battle draws again.
    const sim = subsystemRng(4242, "sim");
    let nodes = content.nodes.map((file) => toEcoNode(file));
    for (const season of seasons) nodes = stepAll(nodes, season, sim, ctx).nodes;

    const battleAgain = subsystemRng(4242, "battle");
    expect([0, 0, 0, 0, 0].map(() => battleAgain.nextUint32())).toEqual(firstFive);
  });
});
