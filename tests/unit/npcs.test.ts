/**
 * tests/unit/npcs.test.ts — where a person stands, and that it is the same place every time.
 *
 * `tests/gates/npc-onscreen.test.ts` is the reachability half (art on screen, and the scene that
 * mounts it). THIS file is the arithmetic and the rule:
 *
 *   §1 the four authored cells are transcribed, not derived
 *   §2 the scatter is a pure function — same inputs, same world, every run (G11 / L10)
 *   §3 the exclusions hold: walkable, not the spawn, not a doorway, not inside a prop's reach
 *   §4 the geometry agrees with the player's own (feet on the tile, one reach implementation)
 *   §5 talking to a person plays THAT person's line, and the room-wide fallback is untouched
 *
 * NO MOCK OF THE MASK. Every grid below is `loadCollision` over the shipped mask PNG, decoded by
 * `tools/postprocess/raster.ts` — the same call `OverworldScene.buildNodeView` makes. A hardcoded
 * walkable set is how `~` (shallow water, `blocks: false`) got dropped from a placement pass once
 * already; this asks the engine instead of restating it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DIALOGUE } from "@core/dialogue-schema";
import { INTERIORS, interiorsOf } from "@core/interiors";
import type { InteriorBlueprint } from "@core/interiors";
import { hashSeed } from "@core/rng";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Balance, CollisionGrid, Content, NodeFile } from "@core/types";
import { chooseSpawnTile, loadCollision, tileWalkable, type MaskPixels } from "@game/collision";
import { dialogueContext, talkEntryFor } from "@game/dialogue-runner";
import { createMovement, movementConfig, spriteWorldPosition } from "@game/movement";
import {
  interiorNpcPlacements,
  interiorPlacedSpeakerIds,
  npcCentreX,
  npcFootY,
  npcSpeakers,
  npcSpeakersHomedAt,
  npcTalkEntryFor,
  scatterCandidates,
  scatteredNpcPlacements,
  type NpcPlacement,
} from "@game/npcs";
import { distanceToProp, propInReach, propWorldRadius } from "@game/props";
import { readRaster } from "../../tools/postprocess/raster";

const content: Content = validateContent();
const balance: Balance = content.balance;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The shipped mask PNG as the engine's pixels — RGBA, exactly as a texture read gives them. */
async function shippedPixels(path: string): Promise<MaskPixels> {
  const raster = await readRaster(resolve(ROOT, path));
  return { width: raster.width, height: raster.height, data: raster.data, channels: 4 };
}

interface Loaded {
  node: NodeFile;
  grid: CollisionGrid;
}

/** Every node's REAL grid, loaded once through the shipped call. */
const LOADED: Loaded[] = await Promise.all(
  content.nodes.map(async (node) => {
    const pixels = await shippedPixels(node.collisionMask);
    return { node, grid: loadCollision(node.id, node.collisionMask, pixels, balance).grid };
  }),
);

const gridOf = (nodeId: string): CollisionGrid => {
  const found = LOADED.find((l) => l.node.id === nodeId);
  if (!found) throw new Error(`no grid for ${nodeId}`);
  return found.grid;
};
const nodeOf = (nodeId: string): NodeFile => {
  const found = content.nodes.find((n) => n.id === nodeId);
  if (!found) throw new Error(`no node ${nodeId}`);
  return found;
};

const scatterOf = (nodeId: string): NpcPlacement[] =>
  scatteredNpcPlacements(nodeOf(nodeId), gridOf(nodeId), balance);

/**
 * `game/npcs.ts` with its comments stripped.
 *
 * THE COMMENTS ARE NOT THE CODE, and both source assertions below would be inverted without this:
 * the module's header states the rules it obeys — "NO `Math.random`", the 32×48 art in the 32×32
 * box — so a naive substring search finds every forbidden token in the very prose that forbids it.
 */
function npcModuleCode(): string {
  const src = readFileSync(resolve(ROOT, "game/npcs.ts"), "utf8");
  return src
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
    .join("\n");
}

/* ════════════════════════════════════════════════════════════════════════════
 * §1 The four authored cells — transcribed, never derived
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 an authored cell always wins", () => {
  /**
   * The whole authored set, written out because it is FOUR values and a test that recomputed them
   * from the blueprints would assert nothing. If a plan moves someone, this fails and the mover
   * confirms they meant to.
   */
  const AUTHORED: Array<{ interior: string; speaker: string; col: number; row: number }> = [
    { interior: "hearthollow-inn", speaker: "innkeeper-hearthollow", col: 1, row: 2 },
    { interior: "hearthollow-supply", speaker: "vendor-hearthollow", col: 5, row: 1 },
    { interior: "brackwater-inn", speaker: "innkeeper-brackwater", col: 10, row: 3 },
    { interior: "brackwater-supply", speaker: "vendor-brackwater", col: 4, row: 2 },
  ];

  it.each(AUTHORED)("$interior stands $speaker on its own @ cell", ({ interior, speaker, col, row }) => {
    const bp = INTERIORS.find((b) => b.id === interior) as InteriorBlueprint;
    const placed = interiorNpcPlacements(bp, balance);
    const found = placed.find((p) => p.speakerId === speaker);
    expect(found, `${interior} places ${speaker}`).toBeDefined();
    expect({ col: found?.col, row: found?.row }).toEqual({ col, row });
    expect(found?.source).toBe("interior-anchor");
    expect(found?.interiorId).toBe(interior);
  });

  it("a speaker an interior already places is NOT scattered outdoors as well", () => {
    for (const bp of INTERIORS) {
      const indoors = interiorPlacedSpeakerIds(bp.parentNode);
      const outdoors = scatterOf(bp.parentNode).map((p) => p.speakerId);
      for (const id of indoors) expect(outdoors, `${id} placed twice`).not.toContain(id);
    }
  });

  it("the town's outdoor cast is not carried into its rooms", () => {
    // A room is drawn at world origin, so a town coordinate compared against it answers from the
    // wrong map — the same reason `interactIndoors` refuses the town's props.
    for (const bp of INTERIORS) {
      const inside = interiorNpcPlacements(bp, balance).map((p) => p.speakerId);
      expect(inside.length).toBeGreaterThan(0);
      for (const p of scatterOf(bp.parentNode)) expect(inside).not.toContain(p.speakerId);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 The scatter is a function, not a roll
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the same inputs give the same world (G11, L10)", () => {
  it("game/npcs.ts never reaches for Math.random", () => {
    expect(npcModuleCode()).not.toContain("Math.random");
  });

  it("building the placements twice gives byte-identical placements", () => {
    for (const { node } of LOADED) {
      const a = scatterOf(node.id);
      const b = scatterOf(node.id);
      expect(JSON.stringify(b), node.id).toBe(JSON.stringify(a));
    }
  });

  it("the cell is keyed on the SPEAKER ID, through core/rng.ts's own hash", () => {
    // Not "a hash was used" — that the chosen cell IS the one the documented rule names. Re-derives
    // step 1 and step 2 of the rule from outside the module and demands the same answer.
    const node = nodeOf("duskhollow");
    const grid = gridOf("duskhollow");
    const candidates = scatterCandidates(node, grid, balance);
    const people = npcSpeakersHomedAt("duskhollow").filter(
      (s) => !interiorPlacedSpeakerIds("duskhollow").has(s.id),
    );
    const band = Math.floor(candidates.length / people.length);
    expect(band).toBeGreaterThan(1);

    const placed = scatterOf("duskhollow");
    // The FIRST speaker's band is untouched by crowding repair — nobody is placed before them — so
    // its cell is exactly `band start + hash % band` with no forward walk.
    const first = people[0];
    const expected = candidates[0 * band + (hashSeed(0, first?.id ?? "") % band)];
    expect({ col: placed[0]?.col, row: placed[0]?.row }).toEqual({
      col: expected?.col,
      row: expected?.row,
    });
  });

  it("each speaker's cell comes out of its OWN band, so the cast is spread down the map", () => {
    // Row-major candidates ⇒ consecutive bands are consecutive horizontal strips. Asserting the
    // band membership is asserting the spread, without pinning a coordinate that art may move.
    for (const { node, grid } of LOADED) {
      const placed = scatteredNpcPlacements(node, grid, balance);
      if (placed.length < 2) continue;
      const candidates = scatterCandidates(node, grid, balance);
      const band = Math.floor(candidates.length / placed.length);
      placed.forEach((p, k) => {
        const at = candidates.findIndex((c) => c.col === p.col && c.row === p.row);
        expect(at, `${p.speakerId} is on a candidate cell`).toBeGreaterThanOrEqual(0);
        expect(at, `${p.speakerId} band lower`).toBeGreaterThanOrEqual(k * band);
        expect(at, `${p.speakerId} band upper`).toBeLessThan((k + 1) * band);
      });
    }
  });

  it("nobody stands on top of, or shoulder to shoulder with, anybody else", () => {
    for (const { node, grid } of LOADED) {
      const placed = scatteredNpcPlacements(node, grid, balance);
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          const a = placed[i] as NpcPlacement;
          const b = placed[j] as NpcPlacement;
          const gap = Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
          expect(gap, `${node.id}: ${a.speakerId} and ${b.speakerId}`).toBeGreaterThan(1);
        }
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 The exclusions — every one is something that currently works
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 nobody is standing anywhere that breaks something", () => {
  it("every scattered cell is walkable in the node's REAL mask", () => {
    for (const { node, grid } of LOADED) {
      for (const p of scatteredNpcPlacements(node, grid, balance)) {
        expect(tileWalkable(grid, p.col, p.row, balance), `${node.id} ${p.speakerId}`).toBe(true);
      }
    }
  });

  it("nobody is standing on the tile a player with no position is put down on", () => {
    for (const { node, grid } of LOADED) {
      const spawn = chooseSpawnTile(grid, balance, { props: node.props }).tile;
      for (const p of scatteredNpcPlacements(node, grid, balance)) {
        expect({ col: p.col, row: p.row }, `${node.id} ${p.speakerId}`).not.toEqual(spawn);
      }
    }
  });

  it("nobody is standing in a doorway", () => {
    const scale = balance.map.mapRenderScale;
    const step = balance.map.tileStepPx;
    for (const { node, grid } of LOADED) {
      const doors = interiorsOf(node.id).map((bp) => ({
        col: Math.floor((bp.door.x * scale) / step),
        row: Math.floor((bp.door.y * scale) / step),
      }));
      if (doors.length === 0) continue;
      for (const p of scatteredNpcPlacements(node, grid, balance)) {
        for (const d of doors) {
          expect({ col: p.col, row: p.row }, `${node.id} ${p.speakerId}`).not.toEqual(d);
        }
      }
    }
  });

  it("nobody is standing inside a legendary prop's reach, where [E] could never answer for them", () => {
    /*
     * `OverworldScene.interact()` gives a prop ABSOLUTE priority over a person ("a prop wins over a
     * person"), so an NPC inside a prop's radius is an NPC the interact key can never reach. Asked
     * through the shared `propInReach` from the tile's own standing point — the same two calls the
     * scene makes.
     */
    for (const { node, grid } of LOADED) {
      for (const p of scatteredNpcPlacements(node, grid, balance)) {
        const at = spriteWorldPosition(createMovement({ col: p.col, row: p.row }), movementConfig(balance));
        for (const prop of node.props) {
          expect(propInReach(prop, at, balance), `${node.id} ${p.speakerId} in ${prop.id}`).toBe(false);
        }
      }
    }
  });

  it("the candidate list is not a rounding error — every node has room to spare", () => {
    for (const { node, grid } of LOADED) {
      const people = scatteredNpcPlacements(node, grid, balance).length;
      if (people === 0) continue;
      expect(scatterCandidates(node, grid, balance).length, node.id).toBeGreaterThan(people * 10);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 The geometry is the player's, and the reach is the prop's
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 one convention for where a character stands", () => {
  it("an NPC's feet sit exactly where the player's would on the same tile", () => {
    const cfg = movementConfig(balance);
    for (const { node, grid } of LOADED) {
      for (const p of scatteredNpcPlacements(node, grid, balance)) {
        const player = spriteWorldPosition(createMovement({ col: p.col, row: p.row }), cfg);
        // `spriteWorldPosition` is a CENTRE for a `spriteH`-tall sprite; the foot line is half a
        // sprite below it, and that is the line the layer positions against.
        expect(npcCentreX(p, balance)).toBe(player.x);
        expect(npcFootY(p, balance)).toBe(player.y + cfg.spriteH / 2);
      }
    }
  });

  it("a person's reach is a prop's reach, computed by the prop's own code", () => {
    const cfg = movementConfig(balance);
    for (const p of scatterOf("hearthollow")) {
      expect(propWorldRadius(p, balance)).toBe(
        balance.map.propInteractionRadiusDefault * balance.map.mapRenderScale,
      );
      // Standing on the person's own tile is inside their reach…
      const here = spriteWorldPosition(createMovement({ col: p.col, row: p.row }), cfg);
      expect(propInReach(p, here, balance), p.speakerId).toBe(true);
      // …and a point a full radius plus a tile away is not.
      const far = { x: here.x + propWorldRadius(p, balance) + cfg.tileStepPx, y: here.y };
      expect(propInReach(p, far, balance), p.speakerId).toBe(false);
      expect(distanceToProp(p, far, balance)).toBeGreaterThan(propWorldRadius(p, balance));
    }
  });

  it("no character size is written down in game/npcs.ts — the box is balance's", () => {
    /*
     * The player sprite is moving from 32×48 to 32×32. A literal here would be a person who is
     * suddenly a head taller than everyone else and nothing would say so.
     */
    const code = npcModuleCode();
    expect(code).toContain("playerSpriteW");
    expect(code).toContain("playerSpriteH");
    expect(code, "a sprite dimension is written down here").not.toMatch(/\b(32|48)\b/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §5 Talking to a person, without breaking talking to the room
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§5 [E] on a person plays THEIR line", () => {
  const fresh = (nodeId: string): SaveEnvelope =>
    newSave({ seed: balance.rng.defaultSeed, currentNode: nodeId, nodes: content.nodes }, balance);

  it("every placed speaker with an eligible line answers with an entry of their own", () => {
    // Not every speaker is eligible at act 1 — many are gated on year or population — so the
    // assertion is on the DIRECTION: whatever comes back is spoken by the person asked.
    let answered = 0;
    for (const { node, grid } of LOADED) {
      const ctx = dialogueContext(fresh(node.id), content);
      for (const p of scatteredNpcPlacements(node, grid, balance)) {
        const entry = npcTalkEntryFor(DIALOGUE, p.speakerId, node.id, ctx);
        if (!entry) continue;
        answered += 1;
        expect(entry.speaker, `${node.id} ${p.speakerId}`).toBe(p.speakerId);
        expect(entry.node).toBe(node.id);
      }
    }
    expect(answered, "no placed person had anything to say at act 1").toBeGreaterThan(5);
  });

  it("a person's own line is not the room's line, which is the whole point", () => {
    // Hearthollow at act 1: the room's winner is whatever ranks highest across every speaker there.
    // Asking Tolm must be able to get Tolm rather than that winner, or placing people changed
    // nothing about what [E] says.
    const ctx = dialogueContext(fresh("hearthollow"), content);
    const room = talkEntryFor(DIALOGUE, "hearthollow", ctx);
    const tolm = npcTalkEntryFor(DIALOGUE, "tolm", "hearthollow", ctx);
    expect(tolm?.speaker).toBe("tolm");
    if (room && room.speaker !== "tolm") expect(tolm?.id).not.toBe(room.id);
  });

  it("`said` advances a person through their own lines instead of repeating one", () => {
    const ctx = dialogueContext(fresh("brackwater"), content);
    const said = new Set<string>();
    const first = npcTalkEntryFor(DIALOGUE, "sel", "brackwater", ctx, said);
    expect(first).toBeDefined();
    said.add(first?.id ?? "");
    const second = npcTalkEntryFor(DIALOGUE, "sel", "brackwater", ctx, said);
    expect(second).toBeDefined();
    expect(second?.id).not.toBe(first?.id);
    expect(second?.speaker).toBe("sel");
  });

  it("when everything eligible has been heard the person repeats rather than falling silent", () => {
    const ctx = dialogueContext(fresh("brackwater"), content);
    const said = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const next = npcTalkEntryFor(DIALOGUE, "sel", "brackwater", ctx, said);
      if (!next) break;
      if (said.has(next.id)) {
        // The fallback pass fired: everything eligible is spent and the winner repeats.
        expect(next.speaker).toBe("sel");
        return;
      }
      said.add(next.id);
    }
    throw new Error("sel never repeated — the exhaustion fallback did not fire");
  });

  it("the room-wide selector is untouched, so no authored line lost its path to the screen", () => {
    // `talkEntryFor` is what `tests/gates/reachability.test.ts` proves the corpus reachable through.
    // If this module had replaced it rather than sat in front of it, that gate would be the thing
    // that broke, and it would have broken quietly.
    const ctx = dialogueContext(fresh("hearthollow"), content);
    expect(talkEntryFor(DIALOGUE, "hearthollow", ctx)).toBeDefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §6 The census — everybody the corpus homes is somewhere
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§6 nobody is left standing nowhere", () => {
  it("every npc-static speaker with a home is placed exactly once, in that home", () => {
    const placed = new Map<string, string>();
    for (const { node, grid } of LOADED) {
      for (const p of scatteredNpcPlacements(node, grid, balance)) {
        expect(placed.has(p.speakerId), `${p.speakerId} placed twice`).toBe(false);
        placed.set(p.speakerId, p.nodeId);
      }
    }
    for (const bp of INTERIORS) {
      for (const p of interiorNpcPlacements(bp, balance)) {
        expect(placed.has(p.speakerId), `${p.speakerId} placed twice`).toBe(false);
        placed.set(p.speakerId, p.nodeId);
      }
    }

    const homed = npcSpeakers().filter((s) => s.home !== undefined);
    const missing = homed.filter((s) => !placed.has(s.id)).map((s) => s.id);
    expect(missing, "npc-static speakers the world does not stand anywhere").toEqual([]);
    for (const s of homed) expect(placed.get(s.id), `${s.id} is in its authored home`).toBe(s.home);
  });

  it("routes get people too, not only towns", () => {
    // Six of the cast live on r1–r5 and sanctum-approach. A pass scoped to the towns would drop
    // them and nothing else in the suite would say so.
    for (const routeId of ["r1", "r2", "r3", "r4", "r5", "sanctum-approach"]) {
      expect(scatterOf(routeId).length, routeId).toBeGreaterThan(0);
    }
  });

  it("nobody is placed in a node the corpus did not home them in (G2)", () => {
    for (const { node, grid } of LOADED) {
      for (const p of scatteredNpcPlacements(node, grid, balance)) {
        const speaker = DIALOGUE.speakers.find((s) => s.id === p.speakerId);
        expect(speaker?.home, p.speakerId).toBe(node.id);
      }
    }
  });
});
