/**
 * core/rng.ts — the project's ONLY source of randomness (build-doc §8.1, guardrail G11).
 *
 * "One seeded xorshift128 stream per subsystem (battle, sim, encounters), seeds derived from save
 * seed + subsystem tag. Property: identical (seed, actionLog) ⇒ byte-identical final save. No
 * `Math.random` anywhere (lint gate)."
 *
 * Pure TypeScript, zero engine imports (L11). The state is four uint32s — explicit, serialisable
 * into the save, and restorable, so a replay can resume mid-stream and land on the same numbers.
 *
 * NOTE ON CONSTANTS (G11 / INV-4): the shift amounts below are not gameplay tunables, they are the
 * definition of the xorshift128 generator named by build-doc §8.1. Every gameplay number this file
 * touches (the default seed, the subsystem tags) is read from data/balance.json by the caller.
 */

/** Serialisable generator state — four uint32 words (build-doc §8.1 "xorshift128"). */
export interface RngState {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** 2^32, the divisor that maps a uint32 draw onto [0, 1). */
const UINT32_SPAN = 0x1_0000_0000;

/**
 * splitmix32 — used ONLY to expand a seed into generator words. Not a game random source; its job
 * is to make (seed, tag) pairs that differ by one bit produce unrelated streams, so the battle
 * stream cannot desynchronise the sim stream.
 */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** FNV-1a over the subsystem tag, mixed with the save seed (build-doc §8.1 "save seed + tag"). */
export function hashSeed(saveSeed: number, tag: string): number {
  let h = 0x811c9dc5 ^ (saveSeed >>> 0);
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Expand a 32-bit seed into a non-zero xorshift128 state (all-zero state is a fixed point). */
export function seedState(seed: number): RngState {
  const next = splitmix32(seed);
  const state: RngState = { x: next(), y: next(), z: next(), w: next() };
  if ((state.x | state.y | state.z | state.w) === 0) state.x = 1;
  return state;
}

/**
 * Seeded xorshift128 (Marsaglia 2003). Explicit state, no globals, no `Math.random`.
 *
 * Every method that consumes entropy says so; `stochasticRound` consumes exactly one draw and only
 * when the value it is handed is not already an integer (build-doc §7.3 step 4).
 */
export class Rng {
  private x: number;
  private y: number;
  private z: number;
  private w: number;
  /** Draws consumed since construction — a cheap desync detector for replay tests. */
  private drawn = 0;

  constructor(state: RngState) {
    this.x = state.x >>> 0;
    this.y = state.y >>> 0;
    this.z = state.z >>> 0;
    this.w = state.w >>> 0;
    if ((this.x | this.y | this.z | this.w) === 0) this.x = 1;
  }

  /** One xorshift128 step. */
  nextUint32(): number {
    const t = (this.x ^ (this.x << 11)) >>> 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = ((this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8))) >>> 0;
    this.drawn++;
    return this.w;
  }

  /** Uniform in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / UINT32_SPAN;
  }

  /** Uniform integer in [minIncl, maxExcl). Returns minIncl when the span is empty. */
  int(minIncl: number, maxExcl: number): number {
    const span = Math.floor(maxExcl) - Math.ceil(minIncl);
    if (span <= 0) return Math.ceil(minIncl);
    return Math.ceil(minIncl) + Math.floor(this.nextFloat() * span);
  }

  /** Uniform real in [min, max). */
  range(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  /** True with probability p. p ≤ 0 and p ≥ 1 short-circuit WITHOUT consuming a draw. */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.nextFloat() < p;
  }

  /** Uniform choice; undefined only for an empty array (consumes no draw in that case). */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(0, items.length)];
  }

  /**
   * Weighted choice over non-negative weights. Consumes exactly one draw. Returns undefined when
   * every weight is 0 — which is how a node whose species have all been wiped out reports "nothing
   * here" rather than inventing an encounter (build-doc §7.2).
   */
  pickWeighted<T>(items: readonly T[], weightOf: (item: T) => number): T | undefined {
    let total = 0;
    for (const item of items) {
      const w = weightOf(item);
      if (w > 0) total += w;
    }
    if (total <= 0) return undefined;
    let roll = this.nextFloat() * total;
    for (const item of items) {
      const w = weightOf(item);
      if (w <= 0) continue;
      roll -= w;
      if (roll < 0) return item;
    }
    // Floating-point tail: hand back the last positively-weighted item.
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i] as T;
      if (weightOf(item) > 0) return item;
    }
    return undefined;
  }

  /**
   * build-doc §7.3 step 4 — "round via seeded RNG (stochastic rounding so small populations can die
   * out or recover — determinism preserved by seed)".
   *
   * E[round(v)] = v exactly, so a population with a fractional birth of 0.3 gains an individual in
   * 3 seasons out of 10 instead of silently gaining nothing forever (plain floor) or gaining one
   * every season (plain ceil). An already-integral value consumes NO draw: it has nothing to
   * decide, and burning entropy on it would make the stream depend on arithmetic that did not
   * happen.
   */
  stochasticRound(value: number): number {
    const floor = Math.floor(value);
    const frac = value - floor;
    if (frac === 0) return floor;
    return this.chance(frac) ? floor + 1 : floor;
  }

  /** Snapshot for the save file (build-doc §7.8 / §8.1). */
  save(): RngState {
    return { x: this.x, y: this.y, z: this.z, w: this.w };
  }

  /** Resume a stream mid-flight from a saved snapshot. */
  restore(state: RngState): void {
    this.x = state.x >>> 0;
    this.y = state.y >>> 0;
    this.z = state.z >>> 0;
    this.w = state.w >>> 0;
    if ((this.x | this.y | this.z | this.w) === 0) this.x = 1;
  }

  /** Independent copy positioned at the same point in the stream. */
  clone(): Rng {
    const copy = new Rng(this.save());
    copy.drawn = this.drawn;
    return copy;
  }

  /** Number of draws consumed since construction (diagnostic; not part of the stream). */
  get draws(): number {
    return this.drawn;
  }
}

/** A stream from a raw 32-bit seed (tests, fixtures, the balance harness). */
export function createRng(seed: number): Rng {
  return new Rng(seedState(seed));
}

/**
 * build-doc §8.1 — the per-subsystem stream. `tag` comes from `balance.rng.subsystemTags`
 * ("battle" | "sim" | "encounter"); it is never a literal in code at the call site.
 */
export function subsystemRng(saveSeed: number, tag: string): Rng {
  return new Rng(seedState(hashSeed(saveSeed, tag)));
}

/** Free-function form of {@link Rng.stochasticRound} for call sites that hold the value first. */
export function stochasticRound(value: number, rng: Rng): number {
  return rng.stochasticRound(value);
}

/**
 * Split a child stream off a parent, consuming EXACTLY ONE draw from the parent whatever the child
 * goes on to do.
 *
 * This is what keeps causally unrelated work causally unrelated. A single shared stream threaded
 * through many independent consumers means the number of draws one consumer happens to make
 * phase-shifts every consumer after it — so a change at one node silently moves the numbers at a
 * node six graph hops away, and the ledger stops being readable as cause and effect (build-doc §2
 * Hard Req 2, Hard Req 7's epilogue ledger). Determinism (L10) is preserved either way; legibility
 * is not.
 *
 * The child is a pure function of (parent draw, tag), so replay from a saved parent state
 * reproduces every child exactly, and a parent's draw count no longer depends on its children.
 */
export function deriveStream(parent: Rng, tag: string): Rng {
  return new Rng(seedState(hashSeed(parent.nextUint32(), tag)));
}

/**
 * Split a whole SET of child streams off a parent, consuming exactly ONE parent draw in total —
 * not one per child.
 *
 * build-doc §6 INV-2: "Adding a node touches data/nodes/ + assets + graph adjacency only." Calling
 * {@link deriveStream} once per node satisfies that within a single step (each child is keyed on
 * its own id, so array order is irrelevant) but NOT across steps: the parent's draw count becomes
 * the number of nodes, so a thirteenth node phase-shifts every node's stream from the next season
 * onward. Measured before the fix: adding one node to the shipped region moved Hearthollow's
 * two-year trajectory (bramblehog 6 → 9, loamunder 42 → 43, pollywisp 6 → 5) with no causal path
 * between them. Drawing once per STEP makes the parent's cost independent of the region's size, so
 * a node added anywhere in the graph moves nothing else, ever.
 *
 * Each child is a pure function of (that one parent draw, tag), so replay from a saved parent state
 * still reproduces every child exactly.
 */
export function deriveStreams(parent: Rng, tags: readonly string[]): Map<string, Rng> {
  const seed = parent.nextUint32();
  const out = new Map<string, Rng>();
  for (const tag of tags) out.set(tag, new Rng(seedState(hashSeed(seed, tag))));
  return out;
}
