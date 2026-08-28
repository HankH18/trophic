/**
 * tests/unit/encounter-mask.test.ts — WHERE a wild encounter can happen, over the shipped maps.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE IS THE ANSWER TO
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Encounters used to roll UNIFORMLY EVERYWHERE on a node. `balance.encounter.encounterTileFraction`
 * was a SCALAR, folded into one draw by `core/foodweb.ts` `stepEncounterChance`, so a player standing
 * on a road, in a town square, or on a building's doorstep met wild animals at exactly the rate of a
 * player standing in tall grass. The number was a stand-in for a mask nobody had yet.
 *
 * The mask exists now, and it is a DIRECT READ of the hand-authored layout the art lane already
 * composes each map from — `tools/mapgen/layouts/<id>.txt`, one character per 16px collision cell,
 * `,` (the legend's `scrub` row) being the encounter terrain. So the long grass a player SEES is the
 * long grass that ROLLS, by construction rather than by anyone keeping two files in step.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WOULD MAKE THIS FILE WORTHLESS, AND WHAT IS DONE ABOUT IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * A test that hands `rollForayStep` a HAND-MADE mask proves nothing about the twelve shipped nodes:
 * it proves the roller can read a boolean. Three things are done about that, and they are the reason
 * to trust anything below.
 *
 *   1. **The entry point is the real one.** Every encounter assertion below goes through
 *      `game/encounters.ts` `rollForayStep` — the exact function `game/scenes/OverworldScene.ts`
 *      calls on every completed movement step — with a real `ForayContext` built from real node
 *      populations and a real seeded `core/rng.ts` stream. Nothing is stubbed.
 *
 *   2. **The masks are the shipped ones, and that is PROVEN rather than assumed.** `encounterMaskFor`
 *      serves masks derived from layouts that are STATICALLY IMPORTED into the bundle, so a test
 *      could be reading a stale copy baked in at build time and never know. Every node's bundled mask
 *      is therefore re-derived here from the file ON DISK, read with `node:fs` at run time, and the
 *      two are asserted cell-for-cell identical. If they ever differ, the game is playing a map the
 *      repository does not contain.
 *
 *   3. **The cells are FOUND in the shipped grids, never typed in.** A hard-coded `(12, 34)` is a
 *      fixture wearing a real map's name: it rots the first time an author edits the layout, and it
 *      rots silently in the direction of passing. Every cell used below is located by scanning the
 *      real grid for a character of the kind wanted, and the scan asserts it found one.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS PINNED, AND WHY THESE NUMBERS
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * The per-node encounter-terrain counts are pinned exactly and the shares to two decimals. That is
 * not decoration: the whole feature is "a step meets something only where the author drew grass", so
 * a layout edit that guts the grass is a change to how much of the game is reachable and must be a
 * visible event rather than a quiet retune. Measured on the committed tree, `,` cells over cells the
 * player can stand on (blockedness from `tools/mapgen/legend.ts`):
 *
 *     hearthollow  89 / 1629 =  5.46%      r1   597 / 2477 = 24.10%
 *     brackwater   53 /  809 =  6.55%      r2   408 / 1654 = 24.67%
 *     bowerdeep   157 / 1779 =  8.83%      r3   423 / 1674 = 25.27%
 *     cindershelf 180 / 2236 =  8.05%      r4   575 / 2285 = 25.16%
 *     duskhollow  265 / 2608 = 10.16%      r5   406 / 1562 = 25.99%
 *     sanctum     528 / 1702 = 31.02%      sanctum-approach 583 / 2478 = 23.53%
 *
 * The shape of that table is the argument for the whole change: the ROUTES carry roughly a quarter
 * grass and the TOWNS a twentieth to a tenth. Under the old scalar every one of them rolled at 0.25,
 * so a town square was as dense with wildlife as Route 1.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  cellRollsEncounters,
  encounterCellShare,
  encounterMaskFromLayout,
  EncounterMaskError,
  indexSpecies,
  toEcoNode,
  type EcoNode,
} from "../../core/foodweb";
import { createRng } from "../../core/rng";
import { validateContent } from "../../core/schemas";
import type { Balance, EncounterMask, NodeFile } from "../../core/types";
import {
  effectiveEncounterChance,
  encounterChancePerStep,
  encounterMaskFor,
  maskedNodeIds,
  rollForayStep,
  standingOnEncounterTerrain,
  stepChanceFor,
  type ForayContext,
} from "../../game/encounters";
import { DEFAULT_LEGEND } from "../../tools/mapgen/legend.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const content = validateContent();
const balance: Balance = content.balance;
const species = indexSpecies(content.species);

/** Blockedness is the art lane's fact — the same source `game/encounters.ts` hands the derivation. */
const BLOCKING_CHARS: ReadonlySet<string> = new Set(
  DEFAULT_LEGEND.filter((e) => e.blocks).map((e) => e.char),
);

function nodeFile(id: string): NodeFile {
  const node = content.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node;
}

/** The layout AS COMMITTED, read at run time — the control on the statically imported copy. */
function layoutOnDisk(nodeId: string): string {
  return readFileSync(`${ROOT}tools/mapgen/layouts/${nodeId}.txt`, "utf8");
}

function maskOf(nodeId: string): EncounterMask {
  const mask = encounterMaskFor(nodeId, balance);
  expect(mask, `game/encounters.ts serves no mask for ${nodeId}`).not.toBeNull();
  return mask as EncounterMask;
}

/**
 * A real `ForayContext` at a real node, optionally standing on a real cell.
 *
 * Season and act are the same values `tests/unit/encounters.test.ts` uses, so a reader comparing the
 * two files is comparing like with like.
 */
function ctxAt(nodeId: string, cell?: { col: number; row: number }): ForayContext {
  const node: EcoNode = toEcoNode(nodeFile(nodeId));
  const ctx: ForayContext = { node, species, balance, season: "spring", act: 1 };
  if (cell) ctx.footing = { mask: maskOf(nodeId), col: cell.col, row: cell.row };
  return ctx;
}

/**
 * The first cell of the shipped grid carrying one of `chars`, scanned in row-major order.
 *
 * Never a typed-in coordinate: see point 3 of the header. Throws rather than returning null, because
 * "the map has no road" is a fact about the map that a caller must not be allowed to skip past.
 */
function findCell(nodeId: string, chars: string): { col: number; row: number } {
  const mask = maskOf(nodeId);
  const rows = gridRows(nodeId);
  for (let row = 0; row < mask.rows; row += 1) {
    const line = rows[row] as string;
    for (let col = 0; col < mask.cols; col += 1) {
      if (chars.includes(line[col] as string)) return { col, row };
    }
  }
  throw new Error(`${nodeId}'s layout contains none of "${chars}"`);
}

/** The shipped grid rows for a node, isolated by the one parser the gate and the game both use. */
function gridRows(nodeId: string): string[] {
  const text = layoutOnDisk(nodeId);
  const lines = text.split("\n");
  const width = balance.map.collisionCols;
  // The same longest-run rule core/foodweb.ts applies, restated here ONLY to fetch characters for
  // the cell search — every assertion about the parse itself goes through the real function.
  let best: { first: number; len: number } = { first: 0, len: 0 };
  let start = -1;
  for (let i = 0; i <= lines.length; i += 1) {
    const isWidth = i < lines.length && (lines[i] as string).length === width;
    if (isWidth) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      if (i - start > best.len) best = { first: start, len: i - start };
      start = -1;
    }
  }
  return lines.slice(best.first, best.first + best.len);
}

/** How many of `steps` seeded foray steps met something, at one context. */
function metOver(ctx: ForayContext, seeds: number, stepsPerSeed: number): { met: number; steps: number } {
  let met = 0;
  let steps = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const rng = createRng(seed);
    for (let i = 0; i < stepsPerSeed; i += 1) {
      steps += 1;
      if (rollForayStep(ctx, rng)) met += 1;
    }
  }
  return { met, steps };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 0. The instrument — the masks under test are the ones on disk
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the masks under test are the shipped layouts", () => {
  /**
   * THE ANTI-FAIL-OPEN ASSERTION. Every loop below iterates the nodes; if that list were ever empty
   * this file would report success over an absence — the failure mode
   * `tests/gates/reachability.test.ts` exists for. The scope is taken from the validated content
   * bundle, which cannot silently shrink (`core/schemas.ts` imports every node JSON by name).
   */
  it("covers every shipped node, and the scope is not empty", () => {
    const ids = content.nodes.map((n) => n.id).sort();
    expect(ids.length).toBeGreaterThan(0);
    expect(
      maskedNodeIds(),
      "game/encounters.ts serves masks for a different set of nodes than data/nodes/ declares — a " +
        "node with no layout would roll no encounters anywhere and say nothing about it",
    ).toEqual(ids);
  });

  /**
   * The statically imported layout IS the committed file. Without this, every measurement below
   * could be describing a copy baked into the bundle at some earlier moment, and the pinned counts
   * would go on passing over a map the repository no longer contains.
   */
  it.each(content.nodes.map((n) => n.id))(
    "%s — the bundled mask is cell-for-cell the mask derived from the file on disk",
    (nodeId) => {
      const bundled = maskOf(nodeId);
      const fromDisk = encounterMaskFromLayout(nodeId, layoutOnDisk(nodeId), balance, BLOCKING_CHARS);
      expect(bundled.cols).toBe(fromDisk.cols);
      expect(bundled.rows).toBe(fromDisk.rows);
      expect(bundled.encounterCells).toBe(fromDisk.encounterCells);
      expect(bundled.walkableCells).toBe(fromDisk.walkableCells);
      expect(
        [...bundled.cells],
        `${nodeId}: the layout game/encounters.ts imported and the one in tools/mapgen/layouts/ ` +
          "disagree about where the grass is",
      ).toEqual([...fromDisk.cells]);
    },
  );

  it("a layout that is not the declared grid is a loud failure, never an empty mask", () => {
    // A mask with nothing set is indistinguishable from a node that honestly draws no grass, so a
    // bad parse must not be allowed to produce one — it would silence a node instead of saying so.
    expect(() => encounterMaskFromLayout("truncated", "....\n....\n", balance, BLOCKING_CHARS)).toThrow(
      EncounterMaskError,
    );
    const doubled = `${layoutOnDisk("r1")}\n${gridRows("r1").join("\n")}\n`;
    // …and it is refused as AMBIGUOUS specifically, not as a wrong row count — the two failures want
    // different repairs, and a test that cannot tell them apart would pass on either.
    expect(
      () => encounterMaskFromLayout("ambiguous", doubled, balance, BLOCKING_CHARS),
      "two grids of equal length in one file must be refused, not guessed between",
    ).toThrow(/which one is the map is a guess/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The measured shares — pinned, so a layout edit that guts the grass reddens
 * ════════════════════════════════════════════════════════════════════════════ */

/** `,` cells and walkable cells, measured on the committed tree. See this file's header. */
const SHIPPED_SHARES: ReadonlyArray<readonly [string, number, number]> = [
  ["bowerdeep", 157, 1779],
  ["brackwater", 53, 809],
  ["cindershelf", 180, 2236],
  ["duskhollow", 265, 2608],
  ["hearthollow", 89, 1629],
  ["r1", 597, 2477],
  ["r2", 408, 1654],
  ["r3", 423, 1674],
  ["r4", 575, 2285],
  ["r5", 406, 1562],
  ["sanctum-approach", 583, 2478],
  ["sanctum", 528, 1702],
];

describe("the shipped encounter terrain, pinned", () => {
  it("pins every node, and the pin list is the whole region", () => {
    expect(SHIPPED_SHARES.map(([id]) => id).sort()).toEqual(content.nodes.map((n) => n.id).sort());
  });

  it.each(SHIPPED_SHARES)("%s draws %i encounter cells in %i walkable cells", (id, cells, walkable) => {
    const mask = maskOf(id);
    expect(mask.encounterCells, `${id}'s encounter terrain moved`).toBe(cells);
    expect(mask.walkableCells, `${id}'s walkable area moved`).toBe(walkable);
    expect(encounterCellShare(mask)).toBeCloseTo(cells / walkable, 10);
  });

  /**
   * THE SHAPE OF THE REGION, asserted rather than described. This is the fact the old scalar erased:
   * a route is roughly a quarter grass and a town a twentieth to a tenth, so rolling both at 0.25
   * made a town square as dense with wildlife as Route 1.
   */
  it("routes carry far more encounter terrain than towns", () => {
    const share = (id: string): number => encounterCellShare(maskOf(id));
    const routes = ["r1", "r2", "r3", "r4", "r5"].map(share);
    const towns = ["hearthollow", "brackwater", "bowerdeep", "cindershelf", "duskhollow"].map(share);
    expect(Math.min(...routes)).toBeGreaterThan(Math.max(...towns) * 2);
  });

  /**
   * `encounterTileFraction` SURVIVED THIS CHANGE, and this is the assertion that keeps it honest.
   *
   * It is no longer the spatial gate — the mask is — but it is still the position-blind average the
   * year's encounter budget and `tools/harness/full-run.ts` roll against, because neither can be
   * asked cell by cell. A stand-in is only legitimate while it stands in for something real, so it is
   * pinned INSIDE the measured route band. If the layouts are redrawn thinner or thicker and this
   * value is not moved with them, the budget starts describing a region nobody walks — which is
   * exactly the class of defect that made the old scalar worth removing from the roll.
   */
  it("encounterTileFraction sits inside the band of route shares it stands in for", () => {
    const routes = ["r1", "r2", "r3", "r4", "r5"].map((id) => encounterCellShare(maskOf(id)));
    const scalar = balance.encounter.encounterTileFraction;
    expect(scalar, "the blind average is below every route's real grass share").toBeGreaterThanOrEqual(
      Math.min(...routes),
    );
    expect(scalar, "the blind average is above every route's real grass share").toBeLessThanOrEqual(
      Math.max(...routes),
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. THE CLAIM — a step meets something on grass and nowhere else
 *
 * Driven through `rollForayStep`, the function the overworld calls per movement step, on cells found
 * in the shipped grids. One TOWN and one ROUTE, because the two differ in exactly the way the old
 * scalar could not express.
 * ════════════════════════════════════════════════════════════════════════════ */

const SEEDS = 300;
const STEPS_PER_SEED = 40;

describe.each([
  ["r1", "a route"],
  ["hearthollow", "a town"],
])("%s (%s) — encounters fire on encounter terrain and nowhere else", (nodeId) => {
  it("standing on grass, a step meets something at encounterChancePerStep", () => {
    const cell = findCell(nodeId, ",");
    const ctx = ctxAt(nodeId, cell);
    expect(standingOnEncounterTerrain(ctx)).toBe(true);
    expect(stepChanceFor(ctx)).toBe(encounterChancePerStep(balance));

    const { met, steps } = metOver(ctx, SEEDS, STEPS_PER_SEED);
    const expected = encounterChancePerStep(balance);
    // Four binomial standard errors of this exact sample — the same derived-tolerance rule
    // tests/unit/encounters.test.ts uses, so it stays tight if the rate is ever retuned.
    const tolerance = 4 * Math.sqrt((expected * (1 - expected)) / steps);
    expect(Math.abs(met / steps - expected)).toBeLessThan(tolerance);
    // …and it is the FULL rate, not the old gated product. That difference is far outside the band,
    // so this measurement can tell the new contract from the one it replaced.
    expect(Math.abs(met / steps - effectiveEncounterChance(balance))).toBeGreaterThan(tolerance);
  });

  it.each([
    ["open ground", "."],
    ["the worn track", ":"],
  ])("standing on %s, a step meets NOTHING — over every seed", (_what, chars) => {
    const cell = findCell(nodeId, chars);
    const ctx = ctxAt(nodeId, cell);
    expect(standingOnEncounterTerrain(ctx)).toBe(false);
    expect(stepChanceFor(ctx)).toBe(0);
    const { met, steps } = metOver(ctx, SEEDS, STEPS_PER_SEED);
    expect(steps).toBe(SEEDS * STEPS_PER_SEED);
    expect(met, `${nodeId}: a wild creature was met off the grass`).toBe(0);
  });
});

describe("hearthollow — a building footprint is not a place animals are", () => {
  /**
   * The town case the old scalar got most wrong: a `B` cell is a house the player walks AROUND, and
   * under the uniform roll it carried the same encounter rate as Route 1's grass. The player cannot
   * stand here at all — the collision grid blocks it — so this is belt and braces: the mask refuses
   * the cell independently of collision, which is what stops a future spawn, doorway or fast-travel
   * arrival from putting the player somewhere the roll would fire.
   */
  it("a building cell refuses, and it is blocked terrain", () => {
    const cell = findCell("hearthollow", "B");
    expect(BLOCKING_CHARS.has("B")).toBe(true);
    const ctx = ctxAt("hearthollow", cell);
    expect(cellRollsEncounters(maskOf("hearthollow"), cell.col, cell.row)).toBe(false);
    expect(metOver(ctx, 200, 20).met).toBe(0);
  });

  /**
   * Off the map is not a place either. A cell outside the grid reads `false` rather than throwing out
   * of a movement step or wrapping — a wrap would make the north edge roll the south edge's grass.
   */
  it("a cell outside the grid rolls nothing, and does not throw", () => {
    const mask = maskOf("hearthollow");
    expect(cellRollsEncounters(mask, -1, 0)).toBe(false);
    expect(cellRollsEncounters(mask, 0, -1)).toBe(false);
    expect(cellRollsEncounters(mask, mask.cols, 0)).toBe(false);
    expect(cellRollsEncounters(mask, 0, mask.rows)).toBe(false);
    const ctx = ctxAt("hearthollow", { col: mask.cols, row: mask.rows });
    expect(metOver(ctx, 100, 10).met).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. G3 — the mask says WHERE. The node file still says WHAT.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("G3 — the mask cannot change which animal is met", () => {
  /**
   * The species a seed hands over on grass is the SAME species that seed handed over before the mask
   * existed. If it were not, the mask would be a second opinion about the encounter table rather than
   * a statement about geography — which is the thing G3 forbids.
   *
   * Measured against the position-blind path with the gate forced open on both sides, so the
   * comparison isolates the species draw from the chance draw.
   */
  it("the animal a seed meets on grass is the animal the blind roll meets", () => {
    const cell = findCell("r1", ",");
    const positioned = ctxAt("r1", cell);
    const blind = ctxAt("r1");
    let compared = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const a = rollForayStep(positioned, createRng(seed));
      const b = rollForayStep(blind, createRng(seed));
      // Both consume exactly one gate draw, so a seed that clears the LOWER blind threshold clears
      // the higher positioned one too; where both fired, the animal must be identical.
      if (a !== null && b !== null) {
        expect(a).toEqual(b);
        compared += 1;
      }
    }
    expect(compared, "no seed produced an encounter on both paths — the comparison is vacuous").toBeGreaterThan(
      0,
    );
  });

  /**
   * An emptied node meets nothing ON THE GRASS. The cascade is visible because the weight IS the
   * count (build-doc §7.2), and the mask must not paper over that: grass with nothing living in it
   * hands over nothing, exactly as an emptied node did before there was a mask.
   */
  it("grass at an emptied node still meets nothing", () => {
    const cell = findCell("r1", ",");
    const ctx = ctxAt("r1", cell);
    for (const pop of Object.values(ctx.node.populations)) pop.count = 0;
    expect(metOver(ctx, 200, 20).met).toBe(0);
  });

  /**
   * A node that draws NO encounter terrain is silent everywhere, and the roll says so honestly rather
   * than falling back to anything. Built from r1's REAL layout with its grass painted out, so the
   * input is a shape an author could actually produce; `tests/gates/layout-encounter-contract.test.ts`
   * holds such a node to declaring no populations either, which is why the case does not arise on the
   * shipped twelve.
   */
  it("a node whose layout draws no grass rolls nothing, at any cell", () => {
    const grassless = gridRows("r1")
      .map((row) => row.split(",").join("."))
      .join("\n");
    const mask = encounterMaskFromLayout("r1-mown", grassless, balance, BLOCKING_CHARS);
    expect(mask.encounterCells).toBe(0);
    expect(encounterCellShare(mask)).toBe(0);
    const node: EcoNode = toEcoNode(nodeFile("r1"));
    for (let row = 0; row < mask.rows; row += 1) {
      for (let col = 0; col < mask.cols; col += 1) {
        expect(cellRollsEncounters(mask, col, row)).toBe(false);
      }
    }
    const ctx: ForayContext = {
      node,
      species,
      balance,
      season: "spring",
      act: 1,
      footing: { mask, col: 0, row: 0 },
    };
    expect(metOver(ctx, 200, 20).met).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. Determinism — L10 / build-doc §8.1
 *
 * The mask must not have moved the stream. Two separate properties, and both matter:
 *   • the same seed at the same cell meets the same creature;
 *   • a step costs exactly ONE draw whatever the terrain, so a walk's stream position does not
 *     depend on the ground the player happened to cross.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("determinism survives the mask", () => {
  it("the same seed at the same cell meets the same creature", () => {
    const cell = findCell("r1", ",");
    const ctx = ctxAt("r1", cell);
    for (let seed = 1; seed <= 100; seed += 1) {
      expect(rollForayStep(ctx, createRng(seed))).toEqual(rollForayStep(ctx, createRng(seed)));
    }
  });

  it("a whole seeded walk replays identically", () => {
    const cell = findCell("r1", ",");
    const ctx = ctxAt("r1", cell);
    const walk = (): Array<unknown> => {
      const rng = createRng(4242);
      return Array.from({ length: 200 }, () => rollForayStep(ctx, rng));
    };
    expect(walk()).toEqual(walk());
  });

  /**
   * ONE DRAW PER STEP, WHATEVER THE GROUND. `core/rng.ts` `chance` returns false for `p <= 0` WITHOUT
   * consuming a draw, so expressing "no animals here" as `chance(0)` would have made the number of
   * draws a walk costs depend on the terrain crossed. `rollForayStep` therefore draws against the
   * full per-step chance and lets the terrain refuse the result afterwards.
   *
   * Asserted at the STREAM, not at the outcome: a step that meets nothing leaves the generator in
   * exactly the state one bare `chance` call would.
   */
  it("a step off the grass still costs exactly one draw", () => {
    const road = ctxAt("r1", findCell("r1", ":"));
    const stream = createRng(7);
    const control = createRng(7);
    for (let i = 0; i < 50; i += 1) {
      expect(rollForayStep(road, stream)).toBeNull();
      control.chance(encounterChancePerStep(balance));
      expect(
        stream.save(),
        "a step off the grass consumed a different number of draws than a step on it would",
      ).toEqual(control.save());
    }
  });

  /**
   * AND THE POSITION-BLIND PATH IS UNTOUCHED, draw for draw. Every existing fixture, the balance
   * harness and `tests/unit/encounters.test.ts` roll without a footing; if the mask had renumbered
   * that path, the whole project's seeded expectations would have moved under it.
   */
  it("a context with no footing rolls exactly as it did before the mask", () => {
    const blind = ctxAt("r1");
    expect(stepChanceFor(blind)).toBe(effectiveEncounterChance(balance));
    expect(standingOnEncounterTerrain(blind)).toBe(false);
    const { met, steps } = metOver(blind, SEEDS, STEPS_PER_SEED);
    const expected = effectiveEncounterChance(balance);
    const tolerance = 4 * Math.sqrt((expected * (1 - expected)) / steps);
    expect(Math.abs(met / steps - expected)).toBeLessThan(tolerance);
  });
});
