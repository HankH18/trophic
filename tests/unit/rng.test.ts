/**
 * tests/unit/rng.test.ts — build-doc §8.1 determinism, at the source.
 *
 * "One seeded xorshift128 stream per subsystem (battle, sim, encounters), seeds derived from save
 * seed + subsystem tag … No `Math.random` anywhere (lint gate)."
 *
 * The last clause is checked here as a grep over lane A2's own modules, so the guarantee is a test
 * and not an intention.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Rng, createRng, hashSeed, seedState, stochasticRound, subsystemRng } from "../../core/rng";
import balanceJson from "../../data/balance.json";

const balance = balanceJson;
const A2_MODULES = ["rng.ts", "clock.ts", "foodweb.ts", "ecosim.ts"];

function draws(rng: Rng, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.nextUint32());
  return out;
}

describe("rng — seeded xorshift128 (build-doc §8.1)", () => {
  it("is a pure function of the seed", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        expect(draws(createRng(seed), 32)).toEqual(draws(createRng(seed), 32));
      }),
      { numRuns: 200 },
    );
  });

  it("different seeds produce different streams", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.integer({ min: 1, max: 2 ** 20 }),
        (seed, delta) => {
          const a = draws(createRng(seed), 8).join(",");
          const b = draws(createRng(seed + delta), 8).join(",");
          expect(a).not.toEqual(b);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never returns the all-zero fixed point, even from seed 0", () => {
    const state = seedState(0);
    expect(state.x | state.y | state.z | state.w).not.toBe(0);
    const rng = createRng(0);
    expect(draws(rng, 64).some((v) => v !== 0)).toBe(true);
  });

  it("emits uint32s and floats inside their ranges", () => {
    const rng = createRng(balance.rng.defaultSeed);
    for (let i = 0; i < 5000; i++) {
      const u = rng.nextUint32();
      expect(Number.isInteger(u)).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(2 ** 32);
    }
    const f = createRng(7);
    for (let i = 0; i < 5000; i++) {
      const v = f.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is roughly uniform across octants (sanity, not a statistics course)", () => {
    const rng = createRng(20260824);
    const buckets = new Array(8).fill(0) as number[];
    const n = 80_000;
    for (let i = 0; i < n; i++) {
      const b = Math.floor(rng.nextFloat() * 8);
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 8 - n / 80);
      expect(count).toBeLessThan(n / 8 + n / 80);
    }
  });
});

describe("rng — explicit, serialisable, restorable state (build-doc §7.8 save)", () => {
  it("restores mid-stream and reproduces the tail exactly", () => {
    const rng = createRng(99);
    draws(rng, 17);
    const snapshot = rng.save();
    const tail = draws(rng, 25);

    const resumed = new Rng(snapshot);
    expect(draws(resumed, 25)).toEqual(tail);

    // …and the snapshot survives a JSON round trip, because that is how the save stores it.
    const roundTripped = new Rng(JSON.parse(JSON.stringify(snapshot)) as ReturnType<Rng["save"]>);
    expect(draws(roundTripped, 25)).toEqual(tail);
  });

  it("clones without entangling the two streams", () => {
    const rng = createRng(4242);
    draws(rng, 5);
    const copy = rng.clone();
    const a = draws(rng, 10);
    const b = draws(copy, 10);
    expect(b).toEqual(a);
  });
});

describe("rng — one stream per subsystem (build-doc §8.1)", () => {
  const tags = balance.rng.subsystemTags;

  it("ships a tag for every subsystem the build doc names", () => {
    expect(tags).toEqual(expect.arrayContaining(["battle", "sim", "encounter"]));
  });

  it("gives every subsystem a stream of its own, so one cannot desynchronise another", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 - 1 }), (seed) => {
        const seen = new Map<string, string>();
        for (const tag of tags) {
          const sequence = draws(subsystemRng(seed, tag), 8).join(",");
          for (const [otherTag, otherSequence] of seen) {
            expect(`${tag}:${sequence}`).not.toEqual(`${tag}:${otherSequence}`);
            expect(otherTag).not.toEqual(tag);
          }
          seen.set(tag, sequence);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("is reproducible per (saveSeed, tag) pair", () => {
    for (const tag of tags) {
      expect(draws(subsystemRng(1337, tag), 12)).toEqual(draws(subsystemRng(1337, tag), 12));
      expect(hashSeed(1337, tag)).toBe(hashSeed(1337, tag));
    }
  });

  it("separates streams for seeds that differ by one bit", () => {
    for (const tag of tags) {
      expect(draws(subsystemRng(2, tag), 6)).not.toEqual(draws(subsystemRng(3, tag), 6));
    }
  });
});

describe("rng — stochastic rounding (build-doc §7.3 step 4)", () => {
  it("only ever returns floor(v) or floor(v)+1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.double({ min: -50, max: 500, noNaN: true }),
        (seed, value) => {
          const rounded = createRng(seed).stochasticRound(value);
          expect(Number.isInteger(rounded)).toBe(true);
          expect(rounded).toBeGreaterThanOrEqual(Math.floor(value));
          expect(rounded).toBeLessThanOrEqual(Math.floor(value) + 1);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("leaves integers alone and spends no entropy on them", () => {
    const rng = createRng(11);
    for (const v of [0, 1, 7, 42, -3]) {
      expect(rng.stochasticRound(v)).toBe(v);
    }
    expect(rng.draws).toBe(0);
  });

  it("is unbiased: E[round(v)] = v, so a fractional birth is not silently lost", () => {
    for (const value of [0.25, 0.5, 1.7, 20.25, 10.8]) {
      const rng = createRng(Math.round(value * 1000));
      const n = 40_000;
      let total = 0;
      for (let i = 0; i < n; i++) total += stochasticRound(value, rng);
      expect(total / n).toBeCloseTo(value, 1);
    }
  });

  it("lets a small population genuinely die out or hold on", () => {
    // 0.6 rounds down 40% of the time — the property build-doc §7.3 step 4 asks for.
    const rng = createRng(5);
    let zeros = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) if (rng.stochasticRound(0.6) === 0) zeros++;
    expect(zeros / n).toBeGreaterThan(0.35);
    expect(zeros / n).toBeLessThan(0.45);
  });
});

describe("rng — weighted choice", () => {
  it("returns null-ish when every weight is zero (an emptied node has no encounters)", () => {
    const rng = createRng(1);
    expect(rng.pickWeighted([{ w: 0 }, { w: 0 }], (i) => i.w)).toBeUndefined();
    expect(rng.pickWeighted([], () => 1)).toBeUndefined();
  });

  it("never returns a zero-weighted item", () => {
    const items = [
      { id: "a", w: 0 },
      { id: "b", w: 3 },
      { id: "c", w: 0 },
      { id: "d", w: 1 },
    ];
    const rng = createRng(77);
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(rng.pickWeighted(items, (i2) => i2.w)?.id ?? "none");
    expect([...seen].sort()).toEqual(["b", "d"]);
  });

  it("follows the weights", () => {
    const items = [
      { id: "a", w: 1 },
      { id: "b", w: 3 },
    ];
    const rng = createRng(9001);
    let b = 0;
    const n = 40_000;
    for (let i = 0; i < n; i++) if (rng.pickWeighted(items, (i2) => i2.w)?.id === "b") b++;
    expect(b / n).toBeCloseTo(0.75, 1);
  });
});

/**
 * Blank out comments (keeping line numbers) so the gate below reads CODE. The two modules that
 * discuss the ban in prose must not trip it, and a comment is not an execution path.
 */
function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return withoutBlocks
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("G11 — no Math.random in lane A2", () => {
  it("core/{rng,clock,foodweb,ecosim}.ts never touch Math.random", () => {
    for (const file of A2_MODULES) {
      const path = fileURLToPath(new URL(`../../core/${file}`, import.meta.url));
      const source = stripComments(readFileSync(path, "utf8"));
      const offenders = source
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /Math\s*\.\s*random/.test(line));
      expect(offenders.map((o) => `core/${file}:${o.n}`)).toEqual([]);
    }
  });

  it("the gate binds — it catches a Math.random smuggled into a copy of the source", () => {
    const path = fileURLToPath(new URL("../../core/ecosim.ts", import.meta.url));
    const sabotaged = stripComments(
      readFileSync(path, "utf8").replace("const rounded = rng.stochasticRound(real);", "const rounded = Math.random();"),
    );
    expect(/Math\s*\.\s*random/.test(sabotaged)).toBe(true);
  });
});
