/**
 * tests/gates/balance-binding.test.ts — the tunables the build doc STATES, held to what it states.
 *
 * Why this file exists, precisely. Every other test in the repo reads its numbers back out of
 * `balance.json` — which is correct INV-3 hygiene and is the reason a retune touches one file. But
 * it means those tests assert "the code uses the configured value" and NOTHING about whether the
 * configured value is the one the build doc transcribed. Those are two different claims and both
 * are needed: an adversarial sweep changed `stats.boonModPct` 0.1 → anything, `party.saveSlots`
 * 3 → anything, `retirement.heirInheritedTraitsMin/Max`, `ecosim.keystoneBreedMult`, the whole
 * `overlayDiff` denoise ladder and all eleven `balance.map` keys, and the suite stayed green.
 *
 * So: a transcribed spec value is pinned here as a LITERAL, deliberately. G11 forbids a gameplay
 * constant as a literal in CODE — `core/` — because a second home makes a retune a no-op. A test
 * that exists to catch drift from the document is the one place the literal belongs, and the
 * guardrail's own `no_magic_numbers` gate scans `core/` only, for exactly that reason.
 *
 * Every pin carries the doc sentence it came from, verbatim. Where the doc does NOT state a number
 * that is said so in the citation rather than papered over — a pin against no source is still worth
 * having (it catches silent drift) but it must not pretend to authority it has not got.
 *
 * The pins prove themselves: `BINDS` below mutates a copy of `balance.json` one pin at a time and
 * asserts the checker reports that exact path. A pin nobody watched fail is not a pin.
 *
 * The last two describes are the other half of finding: a budget with no measurement is decoration.
 * `perf.battleActionBudgetMs` and `perf.bootBudgetMs` were numbers with no consumer anywhere in the
 * repo (their sibling `perf.ecosimStepBudgetMs` has had one in tests/property/ecosim.test.ts all
 * along), so both are measured here as well as pinned.
 */

import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import { createRng } from "../../core/rng";
import { deriveFoodWeb, indexSpecies, toEcoNode } from "../../core/foodweb";
import { makeBattleContext, predationOracleFromWebs, startBattle, step } from "../../core/battle";
import type { Balance, BattleAction, BattleState, Content, FoodWeb } from "../../core/types";

const content: Content = validateContent();
const balance: Balance = content.balance;

/* ════════════════════════════════════════════════════════════════════════════
 * The pin table.
 * ════════════════════════════════════════════════════════════════════════════ */

interface Pin {
  /** Dotted path into `balance.json`. */
  path: string;
  /** The value the citation states. */
  expected: number;
  /** The document sentence it is transcribed from — verbatim, or an explicit "not stated". */
  cite: string;
}

const SPEC_PINS: readonly Pin[] = [
  /* ── build-doc §7.6, verbatim ────────────────────────────────────────────
   * "Virtual resolution 480×320, integer-scaled. Painted maps 1024×1024 native rendered 2× (2048²
   *  world). Collision mask: 1-bit PNG at map native res, sampled on a 16px grid (64×64 cells) into
   *  a packed bitfield at build time. Player logical sprite 32×48, tile step 32px, grid movement
   *  Gold-style. Props are entries in `props[]` with interaction radius, not baked into collision."
   *
   * All eleven keys of `balance.map` are here. It was the one group in the file with no readers and
   * no tests: every key survived arbitrary mutation, and Lane C builds game/collision.ts against it.
   */
  { path: "map.virtualWidth", expected: 480, cite: "§7.6 'Virtual resolution 480×320, integer-scaled.'" },
  { path: "map.virtualHeight", expected: 320, cite: "§7.6 'Virtual resolution 480×320, integer-scaled.'" },
  { path: "map.mapNativePx", expected: 1024, cite: "§7.6 'Painted maps 1024×1024 native rendered 2× (2048² world).'" },
  { path: "map.mapRenderScale", expected: 2, cite: "§7.6 'Painted maps 1024×1024 native rendered 2× (2048² world).'" },
  { path: "map.collisionCellPx", expected: 16, cite: "§7.6 'sampled on a 16px grid (64×64 cells)'" },
  { path: "map.collisionCols", expected: 64, cite: "§7.6 'sampled on a 16px grid (64×64 cells)'" },
  { path: "map.collisionRows", expected: 64, cite: "§7.6 'sampled on a 16px grid (64×64 cells)'" },
  { path: "map.playerSpriteW", expected: 32, cite: "§7.6 'Player logical sprite 32×48'" },
  { path: "map.playerSpriteH", expected: 48, cite: "§7.6 'Player logical sprite 32×48'" },
  { path: "map.tileStepPx", expected: 32, cite: "§7.6 'tile step 32px, grid movement Gold-style.'" },
  {
    path: "map.propInteractionRadiusDefault",
    expected: 48,
    cite:
      "§7.6 states only 'Props are entries in props[] with interaction radius' — NO number. 48 is the " +
      "shipped default; the cross-check below is what actually binds it (every shipped prop uses it)",
  },

  /* ── build-doc §7.5, verbatim ────────────────────────────────────────────
   * "(3) any creature at 0 → retirement flow: player chooses HEIR (new J of same line, level =
   *  floor(parent×0.5), inherits 1–2 randomly chosen parent traits + parent's relic slot unlocked)
   *  or BOON (chosen teammate gains permanent +10% to one stat, named after the retiree)"
   */
  { path: "retirement.heirInheritedTraitsMin", expected: 1, cite: "§7.5 'inherits 1–2 randomly chosen parent traits'" },
  { path: "retirement.heirInheritedTraitsMax", expected: 2, cite: "§7.5 'inherits 1–2 randomly chosen parent traits'" },
  { path: "retirement.heirLevelFactor", expected: 0.5, cite: "§7.5 'level = floor(parent×0.5)'" },
  {
    path: "stats.boonModPct",
    expected: 0.1,
    cite:
      "§7.5 'BOON (chosen teammate gains permanent +10% to one stat…)'. Every other test reads this " +
      "back out of balance (correct INV-3 hygiene), which left the TRANSCRIBED +10% pinned nowhere",
  },
  { path: "stats.traitModPct", expected: 0.1, cite: "bible §2 'Traits: flat ±10% modifiers'" },

  /* ── build-doc §7.8 / L12, verbatim ──────────────────────────────────────
   * §7.8: "— localStorage, 3 slots."   L12: "| L12 | Save | Versioned JSON in localStorage, 3 slots |"
   */
  { path: "party.saveSlots", expected: 3, cite: "§7.8 '— localStorage, 3 slots.' / L12 'Versioned JSON in localStorage, 3 slots'" },
  {
    path: "party.maxPartySize",
    expected: 6,
    cite:
      "NOT STATED — neither build-doc.md nor content-bible.md gives a party cap (§7.8's save shape " +
      "declares `party[]` with no bound). 6 is the shipped value; pinned so it cannot drift silently, " +
      "and it is the bound core/schemas.ts zSaveFile now enforces on a loaded save",
  },

  /* ── build-doc §7.3, verbatim ────────────────────────────────────────────
   * "presenceMult per Ancient effects (Vellsire adjacent-node breeding ×1.5 while free; Kilnback:
   *  Fire spawns active; Undermere: Water breedRate floor)."
   * Plus the two §7.3 constants the doc names with their defaults.
   */
  { path: "ecosim.keystoneBreedMult", expected: 1.5, cite: "§7.3 'Vellsire adjacent-node breeding ×1.5 while free'" },
  { path: "ecosim.starveThreshold", expected: 0.4, cite: "§7.3 step 2 'if availablePrey/demand < balance.starveThreshold (default 0.4)'" },
  { path: "ecosim.starveRate", expected: 0.3, cite: "§7.3 step 2 'deaths = count × starveRate (default 0.3)'" },
  { path: "ecosim.foodFactorClampMin", expected: 0.25, cite: "§7.3 step 1 'foodFactor = clamp(availablePrey / demand, 0.25, 1.25)'" },
  { path: "ecosim.foodFactorClampMax", expected: 1.25, cite: "§7.3 step 1 'foodFactor = clamp(availablePrey / demand, 0.25, 1.25)'" },
  { path: "ecosim.predationDraw", expected: 0.1, cite: "§7.3 step 3 'each predator consumes predationDraw (default 0.1 × predatorCount)'" },

  /* ── build-doc §8.2, verbatim ────────────────────────────────────────────
   * "dilate 2px, compute IoU of edge maps restricted to the walkable cells of the collision mask.
   *  Accept iff IoU ≥ 0.85 (tunable). A failing variant is regenerated at lower denoise (start 0.35,
   *  step −0.05, floor 0.2)". §9.5: "Budget: ≤ 3 regen attempts per variant".
   */
  { path: "overlayDiff.iouThreshold", expected: 0.85, cite: "§8.2 'Accept iff IoU ≥ 0.85 (tunable).'" },
  { path: "overlayDiff.denoiseStart", expected: 0.35, cite: "§8.2 'regenerated at lower denoise (start 0.35, step −0.05, floor 0.2)'" },
  {
    path: "overlayDiff.denoiseStep",
    expected: 0.05,
    cite: "§8.2 'step −0.05' — the doc writes the DECREMENT; the tunable is its magnitude, applied downward",
  },
  { path: "overlayDiff.denoiseFloor", expected: 0.2, cite: "§8.2 'regenerated at lower denoise (start 0.35, step −0.05, floor 0.2)'" },
  { path: "overlayDiff.dilatePx", expected: 2, cite: "§8.2 'threshold both … to walkability-relevant edges (Sobel on luminance), dilate 2px'" },
  { path: "overlayDiff.maxRegenAttempts", expected: 3, cite: "§9.5 'Budget: ≤ 3 regen attempts per variant'" },

  /* ── build-doc §12, verbatim ─────────────────────────────────────────────
   * "`ecosim.step` all 12 nodes < 5ms (benchmark test `perf_sim` with margin ×4 on mega-node);
   *  battle reducer < 1ms/action; boot < 3s on broadband (…). Save serialize < 50ms."
   */
  { path: "perf.ecosimStepBudgetMs", expected: 5, cite: "§12 '`ecosim.step` all 12 nodes < 5ms'" },
  { path: "perf.megaNodeMarginMultiplier", expected: 4, cite: "§12 'with margin ×4 on mega-node'" },
  { path: "perf.battleActionBudgetMs", expected: 1, cite: "§12 'battle reducer < 1ms/action'" },
  { path: "perf.saveSerializeBudgetMs", expected: 50, cite: "§12 'Save serialize < 50ms.'" },
  { path: "perf.bootBudgetMs", expected: 3000, cite: "§12 'boot < 3s on broadband'" },

  /* ── build-doc §7.4 / §7.1, verbatim ─────────────────────────────────────
   * "Effective stat = base × ageMult × (1 + 0.02 × level) + traitMods"; "Cap level 40";
   * "baseStats: {…}; // 30–100".
   */
  { path: "stats.levelCoefficient", expected: 0.02, cite: "§7.4 'base × ageMult × (1 + 0.02 × level) + traitMods'" },
  { path: "stats.baseStatMin", expected: 30, cite: "§7.1 'baseStats: {hp,atk,def,spd,ins}; // 30–100'" },
  { path: "stats.baseStatMax", expected: 100, cite: "§7.1 'baseStats: {hp,atk,def,spd,ins}; // 30–100'" },
  { path: "xp.levelCap", expected: 40, cite: "§7.4 'Cap level 40.' / HR8 'levels 1–40'" },
  // §1's "six in-game years" is the EXPECTED count under normal pacing, not a cap (D-Q3-1): the
  // calendar is unbounded, and this number is quoted by the HUD and driven by the harness. HR5's
  // "one collision mask survives all six years" is unaffected — the mask is per node, for every year.
  { path: "clock.yearsTotal", expected: 6, cite: "§1 'six in-game years' (expected pacing) / HR5 'survives all six years'" },

  /* ── §3 L8 as amended + the act model (D-Q2-1 / D-Q3-1) ────────────────── */
  { path: "acts.first", expected: 0, cite: "D-Q3-1 acts 0–6; act 0 is the prologue" },
  { path: "acts.last", expected: 6, cite: "bible §6 'Six acts' / §7 six leaders" },
  // The flag NAMES that bind the act model to data/dialogue.json are strings and this table pins
  // numbers, so they are pinned in tests/unit/acts.test.ts instead ("the badge flag is the one
  // data/dialogue.json already reads") rather than left unpinned.
];

function at(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function withOverride(base: Balance, path: string, value: number): Balance {
  const copy = structuredClone(base) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  const last = keys.pop() as string;
  let cur: Record<string, unknown> = copy;
  for (const key of keys) cur = cur[key] as Record<string, unknown>;
  cur[last] = value;
  return copy as unknown as Balance;
}

/** One message per pin that does not hold. Empty means the file agrees with the document. */
function pinViolations(b: Balance, pins: readonly Pin[]): string[] {
  const out: string[] = [];
  for (const pin of pins) {
    const found = at(b, pin.path);
    if (found !== pin.expected) {
      out.push(`balance.${pin.path} = ${JSON.stringify(found)}, but ${pin.cite} says ${pin.expected}`);
    }
  }
  return out;
}

describe("transcribed tunables agree with the document that states them", () => {
  it("pins something real: every path in the table exists in balance.json", () => {
    for (const pin of SPEC_PINS) {
      expect(at(balance, pin.path), `balance.${pin.path} is missing — a pin against nothing is not a pin`).toBeTypeOf(
        "number",
      );
      expect(pin.cite.length, `balance.${pin.path} has no citation`).toBeGreaterThan(20);
    }
    expect(new Set(SPEC_PINS.map((p) => p.path)).size, "duplicate pin path").toBe(SPEC_PINS.length);
  });

  it.each(SPEC_PINS.map((p) => [p.path, p] as const))("balance.%s", (_path, pin) => {
    expect(pinViolations(balance, [pin]), pin.cite).toEqual([]);
  });

  it("BINDS — every pin catches a drift in a copy of the file", () => {
    // The honest form of the proof: mutate the thing, watch it go red, one pin at a time. Without
    // this, a pin whose path was mistyped would sit green forever against `undefined !== undefined`.
    for (const pin of SPEC_PINS) {
      const drifted = withOverride(balance, pin.path, pin.expected + 1);
      const violations = pinViolations(drifted, SPEC_PINS);
      expect(violations.join("\n"), `balance.${pin.path} drifted and the pin did not notice`).toMatch(
        new RegExp(`balance\\.${pin.path.replace(/\./g, "\\.")} = `),
      );
      // …and reverting leaves the file clean, so the checker is not simply always red.
      expect(pinViolations(balance, SPEC_PINS)).toEqual([]);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * build-doc §7.6's derived identities — the reason `balance.map` was dangerous.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("build-doc §7.6 map identities hold in the shipped file", () => {
  it("the collision grid covers exactly the painting it is sampled from", () => {
    const m = balance.map;
    expect(m.collisionCols * m.collisionCellPx).toBe(m.mapNativePx);
    expect(m.collisionRows * m.collisionCellPx).toBe(m.mapNativePx);
  });

  it("one collision cell at render scale is exactly one tile step", () => {
    const m = balance.map;
    expect(m.collisionCellPx * m.mapRenderScale).toBe(m.tileStepPx);
  });

  it("the world the doc calls 2048² is what the two keys multiply to", () => {
    // §7.6 verbatim: "Painted maps 1024×1024 native rendered 2× (2048² world)."
    expect(balance.map.mapNativePx * balance.map.mapRenderScale).toBe(2048);
  });

  it("the virtual viewport is a whole number of tiles", () => {
    // §7.6 "integer-scaled" + "grid movement Gold-style": a viewport that ends mid-tile has no
    // Gold-style camera. 480/32 = 15, 320/32 = 10.
    expect(balance.map.virtualWidth % balance.map.tileStepPx).toBe(0);
    expect(balance.map.virtualHeight % balance.map.tileStepPx).toBe(0);
  });

  it("propInteractionRadiusDefault is the radius the props actually use", () => {
    // The doc gives no number, so the binding has to be a cross-check rather than a transcription:
    // a "default" that no prop uses is not a default, and `48 → 4` used to survive everything.
    // If a lane ever needs a non-default radius on a prop, THIS is the review event for it.
    const radii = new Set(content.nodes.flatMap((n) => n.props.map((p) => p.interactionRadius)));
    expect(radii.size, "props carry more than one radius").toBe(1);
    expect([...radii]).toEqual([balance.map.propInteractionRadiusDefault]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * build-doc §12 — the two budgets that had no consumer.
 * ════════════════════════════════════════════════════════════════════════════ */

const NODE = content.nodes.find((n) => n.id === "r2") ?? content.nodes[0]!;
const WEB: FoodWeb = deriveFoodWeb(toEcoNode(NODE), indexSpecies(content.species), balance);
const CTX = makeBattleContext(content, predationOracleFromWebs([WEB]));

/** A real fight on real content, driven by the reducer the same way the game drives it. */
function runBattle(seed: number, maxActions: number): { actions: number; ms: number } {
  const started = startBattle(
    {
      seed,
      kind: "wild",
      nodeId: NODE.id,
      playerParty: [
        { uid: "p1", lineId: "mirefin-line", age: "A", level: 20, traits: [] },
        { uid: "p2", lineId: "fenmaw-line", age: "E", level: 24, traits: [] },
      ],
      enemyParty: [{ uid: "e1", lineId: "reedrick-line", age: "A", level: 22, traits: [] }],
      bag: { base: 4, salve: 2, tonic: 2 },
    },
    CTX,
  );
  let state: BattleState = started.state;
  let actions = 0;
  const t0 = performance.now();
  for (let i = 0; i < maxActions; i += 1) {
    if (state.outcome !== null) break;
    const active = state.battlers[state.activePlayerUid];
    if (!active) break;
    const moveId = active.moves[i % active.moves.length];
    const action: BattleAction = moveId === undefined ? { kind: "flee" } : { kind: "move", moveId };
    state = step(state, action, createRng(seed + i), CTX).state;
    actions += 1;
  }
  return { actions, ms: performance.now() - t0 };
}

describe("perf_battle — build-doc §12 'battle reducer < 1ms/action'", () => {
  it("the budget has a real measurement behind it, not just a number in a file", () => {
    // Warm the JIT on a throwaway fight, then measure. Fights end, so several are chained to get a
    // meaningful action count; the budget is per ACTION, so the divisor is actions actually taken.
    runBattle(balance.rng.defaultSeed, 40);

    let actions = 0;
    let ms = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const run = runBattle(balance.rng.defaultSeed + seed, 40);
      actions += run.actions;
      ms += run.ms;
    }
    expect(actions, "the benchmark did not actually step the reducer").toBeGreaterThan(100);
    const perAction = ms / actions;
    expect(perAction, `battle reducer took ${perAction.toFixed(4)}ms/action over ${actions} actions`).toBeLessThan(
      balance.perf.battleActionBudgetMs,
    );
  });

  it("the reducer really is what is being timed (the fight reaches an outcome)", () => {
    // Guard against the benchmark going vacuous: if startBattle returned an already-finished state
    // the loop would take zero actions and pass on an empty measurement.
    const run = runBattle(balance.rng.defaultSeed, 40);
    expect(run.actions).toBeGreaterThan(0);
  });
});

describe("perf_boot — build-doc §12 'boot < 3s on broadband'", () => {
  it("content validation — the part of boot core/ owns — fits inside the boot budget", () => {
    /*
     * Honest scope: `bootBudgetMs` covers the whole shell (atlas packing + lazy-loaded painted dex
     * art), and none of that is reachable from a headless core test — see build-doc §12's own
     * parenthetical. What IS reachable is the piece boot cannot start without: parsing and
     * cross-validating every data/*.json. Measuring it against the same budget is a real
     * consumer for the number, and it is labelled as the core half rather than sold as the whole.
     */
    validateContent(); // warm the module-level JSON imports
    const t0 = performance.now();
    for (let i = 0; i < 5; i += 1) validateContent();
    const ms = (performance.now() - t0) / 5;
    expect(ms, `validateContent() took ${ms.toFixed(2)}ms`).toBeLessThan(balance.perf.bootBudgetMs);
  });
});
