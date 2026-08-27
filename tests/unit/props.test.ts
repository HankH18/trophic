/**
 * tests/unit/props.test.ts — build-doc §7.6's props, and the two halves of its one sentence.
 *
 * > "Props are entries in `props[]` with interaction radius, **not baked into collision** (they
 * > overlay the painted map)."
 *
 * Both halves are asserted: the reach test is a RADIUS and not a tile, and it is answered without
 * the collision grid ever being consulted. The third thing tested here is the unit conversion,
 * which is where the only real trap is: a prop's `x`/`y` are map-native pixels and the player's are
 * world pixels — the same map at `balance.map.mapRenderScale` — so comparing them raw makes every
 * prop unreachable from everywhere except a point twice as far up and left as it should be.
 *
 * The whole sign-chain layer stands on this: `chain.*.complete` is only reachable if the antler
 * stones, the shell-kiln shrines and the sunken idols can actually be READ.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DIALOGUE } from "@core/dialogue-schema";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Balance, Content, NodeFile, PropPlacement } from "@core/types";
import { dialogueContext, propDialogueFor } from "@game/dialogue-runner";
import {
  distanceToProp,
  propAt,
  propById,
  propInReach,
  propLabel,
  propWorldPosition,
  propWorldRadius,
  propsInReach,
  propsOf,
} from "@game/props";
import { worldSizePx } from "@game/collision";

const content: Content = validateContent();
const balance: Balance = content.balance;

function node(id: string): NodeFile {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

const ALL_PROPS: Array<{ node: NodeFile; prop: PropPlacement }> = content.nodes.flatMap((n) =>
  n.props.map((prop) => ({ node: n, prop })),
);

function fresh(nodeId: string): SaveEnvelope {
  return newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The unit conversion — the only real trap
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 map-native props in a world-pixel world", () => {
  it("the corpus ships props at all, and this test is looking at them", () => {
    expect(ALL_PROPS.length).toBeGreaterThan(10);
    expect(ALL_PROPS.some(({ prop }) => prop.signChain !== undefined)).toBe(true);
  });

  it("a prop's world anchor is its native position scaled — and it lands inside the world", () => {
    const world = worldSizePx(balance);
    for (const { prop } of ALL_PROPS) {
      const at = propWorldPosition(prop, balance);
      expect(at.x).toBe(prop.x * balance.map.mapRenderScale);
      expect(at.y).toBe(prop.y * balance.map.mapRenderScale);
      expect(at.x, prop.id).toBeLessThanOrEqual(world.width);
      expect(at.y, prop.id).toBeLessThanOrEqual(world.height);
    }
  });

  it("standing at the prop's RAW coordinates is not standing at the prop", () => {
    /*
     * THE FACTOR-OF-TWO BUG, asserted in the direction that binds. `core/types.ts` says the
     * placement is "in map-native pixels (1024² painted map space)" and `game/movement.ts` reports
     * the player in world pixels (2048² at the shipped render scale). Comparing them raw makes
     * every prop reachable only from a point at half its real position — which reads as "the antler
     * stone cannot be read from anywhere" and takes the whole Vellsire chain with it.
     *
     * Skipped for a prop whose radius is wide enough to cover its own halving; on the shipped data
     * every one is far outside it.
     */
    let checked = 0;
    for (const { prop } of ALL_PROPS) {
      const raw = { x: prop.x, y: prop.y };
      const halfDistance = distanceToProp(prop, raw, balance);
      if (halfDistance <= propWorldRadius(prop, balance)) continue;
      checked += 1;
      expect(propInReach(prop, raw, balance), `${prop.id} is reachable from its raw coordinates`).toBe(false);
      expect(propInReach(prop, propWorldPosition(prop, balance), balance)).toBe(true);
    }
    expect(checked, "no prop is far enough from the origin to catch the conversion").toBeGreaterThan(5);
  });

  it("the radius scales with the position, so a retune of the render scale moves both", () => {
    const prop = propById(node("r1"), "r1-antler-north") as PropPlacement;
    expect(propWorldRadius(prop, balance)).toBe(prop.interactionRadius * balance.map.mapRenderScale);
    const doubled: Balance = { ...balance, map: { ...balance.map, mapRenderScale: balance.map.mapRenderScale * 2 } };
    expect(propWorldRadius(prop, doubled)).toBe(propWorldRadius(prop, balance) * 2);
    // …and the point that was exactly on it still is.
    expect(propInReach(prop, propWorldPosition(prop, doubled), doubled)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 In reach and out of it
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the interaction radius", () => {
  it.each(ALL_PROPS.map(({ node: n, prop }) => [`${n.id}/${prop.id}`, n, prop] as const))(
    "%s is readable at its anchor, on its boundary, and nowhere past it",
    (_label, _n, prop) => {
      const at = propWorldPosition(prop, balance);
      const r = propWorldRadius(prop, balance);
      expect(r).toBeGreaterThan(0);
      expect(propInReach(prop, at, balance)).toBe(true);
      // The boundary counts as inside — a player standing exactly on the edge reads the stone.
      expect(propInReach(prop, { x: at.x + r, y: at.y }, balance)).toBe(true);
      // …and one pixel past it does not.
      expect(propInReach(prop, { x: at.x + r + 1, y: at.y }, balance)).toBe(false);
      expect(propInReach(prop, { x: at.x, y: at.y + r + 1 }, balance)).toBe(false);
      // Diagonals are a CIRCLE, not a box: (r, r) is 1.41r away and out of reach.
      expect(propInReach(prop, { x: at.x + r, y: at.y + r }, balance)).toBe(false);
    },
  );

  it("propAt answers with the NEAREST prop, not the first in the file", () => {
    /*
     * Route 1 carries two antler stones and a forage sign; Cindershelf carries two shrines. "The
     * first placement whose radius contains me" reads the wrong stone wherever two radii overlap,
     * and for a sign chain the wrong stone is the wrong STEP.
     */
    const r1 = node("r1");
    expect(propsOf(r1).length).toBeGreaterThan(2);
    for (const prop of propsOf(r1)) {
      expect(propAt(r1, propWorldPosition(prop, balance), balance)?.id).toBe(prop.id);
    }
  });

  it("standing between two props still resolves to exactly one, and the closer one", () => {
    const cindershelf = node("cindershelf");
    const [a, b] = propsOf(cindershelf);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    const pa = propWorldPosition(a!, balance);
    const pb = propWorldPosition(b!, balance);
    const nearA = { x: pa.x + (pb.x - pa.x) * 0.1, y: pa.y + (pb.y - pa.y) * 0.1 };
    const inReach = propsInReach(cindershelf, nearA, balance);
    if (inReach.length > 0) expect(inReach[0]?.id).toBe(a!.id);
    expect(propAt(cindershelf, pa, balance)?.id).toBe(a!.id);
    expect(propAt(cindershelf, pb, balance)?.id).toBe(b!.id);
  });

  it("standing nowhere near anything is standing at no prop", () => {
    for (const n of content.nodes) {
      expect(propAt(n, { x: -1000, y: -1000 }, balance)).toBeNull();
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 In reach it is READABLE — the join to the corpus
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 a prop in reach reads out, a prop out of reach does not", () => {
  it("every sign-chain trailhead has a line to give at the moment its chain opens", () => {
    /*
     * bible §4 gates the three Ancients behind "rare sign-card chains" and build-doc §7.6 makes the
     * antler stones, shell-kiln shrines and sunken idols their trailheads. A trailhead with a radius
     * and no eligible entry is a chain with no way in.
     */
    const trailheads = ALL_PROPS.filter(({ prop }) => prop.signChain !== undefined);
    expect(trailheads.length).toBeGreaterThan(5);
    for (const { node: n, prop } of trailheads) {
      const authored = DIALOGUE.entries.filter((e) => e.propId === prop.id);
      /*
       * This was `toBeGreaterThanOrEqual(0)` carrying the same message, followed by
       * `if (authored.length === 0) continue;`. An array length is never negative, so the assertion
       * could not fail for any corpus: it ran, it compared, and it resolved nothing, while its
       * message promised exactly the check the docblock above asks for — and the `continue` under it
       * then waved through the one state that docblock calls broken, "a chain with no way in". A
       * trailhead with no reading was a silent pass twice over.
       *
       * The commit that introduced both said so at the time (1ecc234: "3 false-gap test files still
       * certifying an absence"), so this is a known-unfinished instrument being finished, not a
       * contract being changed.
       *
       * Measured on the shipped corpus before the matcher moved: 13 trailheads, every one authored —
       * twelve with a single entry and `sanctum-antler-ring` with two. The strict form is what the
       * content already satisfies, so this goes red only when a trailhead actually loses its last
       * line. `> 0` is the whole claim here: the quantity is a count of authored entries and one is
       * the smallest number of them that is a way in, so there is no margin to set above it.
       */
      expect(authored.length, `${prop.id} has no authored reading`).toBeGreaterThan(0);
      expect(authored.every((e) => e.node === n.id)).toBe(true);
    }
  });

  it("the read is gated by the RADIUS, not by the corpus alone", () => {
    // The two halves joined: the corpus says the r1 north stone has a step-2 reading, and standing
    // away from the stone must not produce it however eligible the entry is.
    const r1 = node("r1");
    const stone = propById(r1, "r1-antler-north") as PropPlacement;
    const save: SaveEnvelope = {
      ...fresh("r1"),
      questFlags: { "story.opening.done": true, "chain.vellsire.unlocked": true, "chain.vellsire.step1": true },
    };
    const ctx = dialogueContext(save, content);

    const at = propWorldPosition(stone, balance);
    const far = { x: at.x + propWorldRadius(stone, balance) * 4, y: at.y };

    // In reach: the prop resolves, and the corpus has its step for it.
    expect(propAt(r1, at, balance)?.id).toBe(stone.id);
    expect(propDialogueFor(DIALOGUE, stone.id, r1.id, ctx)?.id).toBe("prop.r1-antler-north");

    // Out of reach: the entry is just as eligible, and there is nothing to read, because there is
    // nothing here to read it off.
    const nothing = propAt(r1, far, balance);
    expect(nothing === null || nothing.id !== stone.id).toBe(true);
  });

  it("a prop whose chain has not opened is in reach and still silent", () => {
    const r1 = node("r1");
    const stone = propById(r1, "r1-antler-north") as PropPlacement;
    const save: SaveEnvelope = { ...fresh("r1"), questFlags: { "story.opening.done": true } };
    const ctx = dialogueContext(save, content);
    expect(propInReach(stone, propWorldPosition(stone, balance), balance)).toBe(true);
    expect(propDialogueFor(DIALOGUE, stone.id, r1.id, ctx)).toBeUndefined();
  });

  it("a label is what the placement carries, never a sentence this code wrote (G2/G7)", () => {
    for (const { prop } of ALL_PROPS) {
      expect(propLabel(prop)).toBe(prop.label ?? prop.id);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 NOT baked into collision
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 props overlay the map — build-doc §7.6", () => {
  it("game/props.ts never reaches for the collision grid", () => {
    const src = readFileSync("game/props.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/u, ""))
      .join("\n");
    expect(src).not.toMatch(/from\s+["'][^"']*collision["']/u);
    for (const name of ["loadCollision", "tileWalkable", "CollisionGrid", "cellAtWorld"]) {
      expect(src, `game/props.ts uses ${name}`).not.toContain(name);
    }
  });

  it("the reach question is answered from the placement and the balance alone", () => {
    // Structural in the strongest available sense: the whole answer is a pure function of two
    // arguments, so there is nowhere for a grid lookup to hide.
    const stone = propById(node("r1"), "r1-antler-north") as PropPlacement;
    const at = propWorldPosition(stone, balance);
    expect(propInReach(stone, at, balance)).toBe(true);
    expect(propInReach({ ...stone, x: stone.x + 999 }, at, balance)).toBe(false);
  });
});
