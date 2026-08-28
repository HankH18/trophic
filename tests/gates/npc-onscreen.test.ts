/**
 * tests/gates/npc-onscreen.test.ts — THE ART SHIPS **AND** SOMETHING DRAWS IT.
 *
 * ══ THE DEFECT THIS EXISTS TO CATCH, AND WHY THE EXISTING GATES COULD NOT ══
 *
 * Twelve `npc-static` sprites were generated, committed, loaded by the boot loader and consumed —
 * by the DIALOGUE BOX's 32×48 portrait slot. `tests/gates/asset-reachability.test.ts` GATE 2a and
 * 2c both went green on that consumer, because their question is "does any screen ask for this
 * key", and one did. Nothing anywhere asked the second question: **is anybody standing in the
 * world?** `game/scenes/OverworldScene.ts` had no NPC entity, no placement and no sprite, and the
 * suite was fully green while the owner played a region with no people in it.
 *
 * So this gate asks the question a key-census structurally cannot, in two halves that must BOTH
 * hold:
 *
 *   GATE N1  Every `npc-static` manifest row is drawn as a VISIBLE object in the overworld, at a
 *            real world position, sized to the balance box — established by driving the real
 *            `NpcLayer` over the real node files and the real collision masks, not by asserting
 *            that a key exists.
 *   GATE N2  `game/scenes/OverworldScene.ts` actually MOUNTS that layer. Without this half, N1 is
 *            a test of a module nothing calls — which is precisely the state the whole project was
 *            in for `game/shop.ts`, "a row model with no caller anywhere in the running game".
 *
 * ══ THE DOUBLE, DECLARED ══
 *
 * One stub scene, and it is narrow on purpose: `textures.exists` over a map seeded from the REAL
 * PNGs on disk (so the fit arithmetic runs against the art's true 32×48 and not an invented size),
 * and an `add.image` that records what was made. Everything else — which speaker, which cell, which
 * texture key, which world position, which depth — is the shipped code's. No dialogue, no mask and
 * no manifest is faked.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type PhaserT from "phaser";
import { describe, expect, it } from "vitest";

import { INTERIORS } from "@core/interiors";
import type { InteriorBlueprint } from "@core/interiors";
import { validateContent } from "@core/schemas";
import type { Balance, CollisionGrid, Content, NodeFile } from "@core/types";
import { loadCollision, type MaskPixels } from "@game/collision";
import { createMovement, movementConfig, spriteWorldPosition } from "@game/movement";
import { NpcLayer, npcCentreX, npcFootY, type NpcPlacement, type PlayerReadout } from "@game/npcs";
import { realAssetIds } from "@game/placeholder";
import { portraitAssetId } from "@game/scenes/DialogueScene";
import { readRaster } from "../../tools/postprocess/raster";

const content: Content = validateContent();
const balance: Balance = content.balance;
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/* ────────────────────────────────────────────────────────────────────────────
 * The manifest's own rows — the DECLARED side of the question
 * ──────────────────────────────────────────────────────────────────────────── */

interface ManifestRow {
  id: string;
  class: string;
  finalFile: string;
}

const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, "tools/comfy/manifest.json"), "utf8")) as {
  rows: ManifestRow[];
};
const NPC_ROWS: ManifestRow[] = MANIFEST.rows.filter((r) => r.class === "npc-static");

/* ────────────────────────────────────────────────────────────────────────────
 * The stub scene
 * ──────────────────────────────────────────────────────────────────────────── */

class StubImage {
  scaleX = 1;
  scaleY = 1;
  depth = 0;
  visible = true;
  flippedX = false;
  destroyed = false;
  x = 0;
  y = 0;
  constructor(
    x: number,
    y: number,
    readonly key: string,
    readonly width: number,
    readonly height: number,
  ) {
    this.x = x;
    this.y = y;
  }
  get displayWidth(): number {
    return this.width * this.scaleX;
  }
  get displayHeight(): number {
    return this.height * this.scaleY;
  }
  setDisplaySize(width: number, height: number): this {
    this.scaleX = this.width === 0 ? 1 : width / this.width;
    this.scaleY = this.height === 0 ? 1 : height / this.height;
    return this;
  }
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }
  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }
  setFlipX(flipped: boolean): this {
    this.flippedX = flipped;
    return this;
  }
  setOrigin(): this {
    return this;
  }
  setTint(): this {
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/** Natural size of every REAL npc sprite, read off the committed PNGs. */
const NATURAL: Map<string, { width: number; height: number }> = new Map(
  await Promise.all(
    NPC_ROWS.map(async (row): Promise<[string, { width: number; height: number }]> => {
      const raster = await readRaster(resolve(ROOT, row.finalFile));
      return [portraitAssetId(row.id), { width: raster.width, height: raster.height }];
    }),
  ),
);

class StubScene {
  readonly made: StubImage[] = [];
  readonly sizes = new Map<string, { width: number; height: number }>(NATURAL);
  readonly textures = {
    exists: (key: string): boolean => this.sizes.has(key),
    createCanvas: (key: string, width: number, height: number): unknown => {
      this.sizes.set(key, { width, height });
      return {
        getContext: (): unknown =>
          new Proxy({}, { get: () => (): void => undefined, set: () => true }),
        refresh: (): void => undefined,
      };
    },
  };
  readonly add = {
    image: (x: number, y: number, key: string): StubImage => {
      const size = this.sizes.get(key) ?? { width: 0, height: 0 };
      const image = new StubImage(x, y, key, size.width, size.height);
      this.made.push(image);
      return image;
    },
  };
}

/** A stand-in for the player's own image — the three numbers the layer sorts against. */
function player(y: number, depth = 20): PlayerReadout {
  return { y, displayHeight: balance.map.playerSpriteH, depth };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The real grids
 * ──────────────────────────────────────────────────────────────────────────── */

async function shippedPixels(path: string): Promise<MaskPixels> {
  const raster = await readRaster(resolve(ROOT, path));
  return { width: raster.width, height: raster.height, data: raster.data, channels: 4 };
}

const GRIDS: Map<string, CollisionGrid> = new Map(
  await Promise.all(
    content.nodes.map(async (node): Promise<[string, CollisionGrid]> => {
      const pixels = await shippedPixels(node.collisionMask);
      return [node.id, loadCollision(node.id, node.collisionMask, pixels, balance).grid];
    }),
  ),
);

const gridOf = (nodeId: string): CollisionGrid => {
  const found = GRIDS.get(nodeId);
  if (!found) throw new Error(`no grid for ${nodeId}`);
  return found;
};

interface Drawn {
  scene: StubScene;
  layer: NpcLayer;
  placements: readonly NpcPlacement[];
}

/** Build the layer for one view and let it draw. The real code path, start to finish. */
function draw(node: NodeFile, interior: InteriorBlueprint | null, playerAt = player(0)): Drawn {
  const scene = new StubScene();
  // The layer's parameter is a `Phaser.Scene`; the stub is the two members it actually touches
  // (`textures.exists` and `add.image`). Narrowed at the seam rather than by widening the module.
  const layer = new NpcLayer(scene as never, balance);
  layer.sync({ node, interior, grid: gridOf(node.id), player: playerAt });
  return { scene, layer, placements: layer.onScreen() };
}

const nodeOf = (id: string): NodeFile => {
  const found = content.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
};

/** Every view the game can put on screen: twelve nodes outdoors, four rooms indoors. */
const VIEWS: Array<{ label: string; node: NodeFile; interior: InteriorBlueprint | null }> = [
  ...content.nodes.map((node) => ({ label: node.id, node, interior: null })),
  ...INTERIORS.map((bp) => ({ label: bp.id, node: nodeOf(bp.parentNode), interior: bp })),
];

/* ════════════════════════════════════════════════════════════════════════════
 * GATE N1 — the art is on the screen
 * ════════════════════════════════════════════════════════════════════════════ */

describe("GATE N1 — every npc-static row is drawn in the world", () => {
  it("the census this gate is built on is real: twelve rows, twelve committed files", () => {
    // Non-vacuity. If the manifest ever stopped carrying npc rows, every assertion below would pass
    // over an empty set and say nothing.
    expect(NPC_ROWS.length).toBeGreaterThan(0);
    const built = realAssetIds();
    for (const row of NPC_ROWS) {
      expect(built, `${row.id} is not in the build census`).toContain(portraitAssetId(row.id));
    }
  });

  it("names every manifest row that no placement in the whole world ever asks for", () => {
    const asked = new Set<string>();
    for (const view of VIEWS) {
      for (const image of draw(view.node, view.interior).scene.made) asked.add(image.key);
    }

    const unasked = NPC_ROWS.filter((row) => !asked.has(portraitAssetId(row.id)));
    const message = [
      `${String(unasked.length)} npc-static row(s) are generated, committed and drawn by NOTHING in`,
      "the overworld. The dialogue box's portrait slot does NOT count: a face in a text box is not a",
      "person standing in a town, and asset-reachability's key census cannot tell the two apart —",
      "which is exactly how twelve finished sprites shipped with nobody in the world.",
      ...unasked.map((row) => `  • ${row.id} — ${row.finalFile}`),
      "",
      "Either a speaker in data/dialogue.json carries this portrait and is placed by game/npcs.ts,",
      "or the row does not belong in tools/comfy/manifest.json. Do not silence it here.",
    ].join("\n");
    expect(unasked.length === 0 || message).toBe(true);
  });

  it("every placement is a VISIBLE object, at its own cell, in the balance box", () => {
    /*
     * THE NPC'S OWN BOX. This read `playerSpriteW/H`, which was the same defect this gate exists to
     * catch, sitting in the gate. It was invisible while the two keys agreed at 32x48; the owner
     * ruled the player one block tall, they diverged, and this gate then asserted that fifty
     * portraits must fit a box 16px shorter than the art — passing only because `placeholderImage`
     * had squeezed every one of them to 21x32.
     *
     * REVERT CHECK: yes — measuring an NPC against the player's size is wrong independently of any
     * change of mine. The gate was holding the squeeze in place rather than reporting it.
     * NOT WEAKENED: the same two exact bounds, against the right subject.
     */
    const box = { w: balance.map.npcSpriteW, h: balance.map.npcSpriteH };
    let drawnCount = 0;
    for (const view of VIEWS) {
      const { scene, layer, placements } = draw(view.node, view.interior);
      expect(scene.made.length, `${view.label} drew a sprite per placement`).toBe(placements.length);
      for (const placement of placements) {
        drawnCount += 1;
        const sprite = layer.spriteOf(placement.speakerId) as unknown as StubImage;
        expect(sprite, `${view.label}: ${placement.speakerId} has no image`).toBeDefined();
        // PAINTED, not merely constructed — `Harness.hud()` joins hidden objects too, so "an object
        // exists" is not the question. This one is on screen.
        expect(sprite.visible, `${view.label}: ${placement.speakerId} is hidden`).toBe(true);
        expect(sprite.destroyed).toBe(false);
        // The texture is the census's key for the speaker's portrait — never a spelled-out prefix.
        expect(sprite.key).toBe(portraitAssetId(placement.portrait));
        // Inside the box on both axes, never blown up past it.
        expect(sprite.displayWidth, `${placement.speakerId} width`).toBeLessThanOrEqual(box.w);
        expect(sprite.displayHeight, `${placement.speakerId} height`).toBeLessThanOrEqual(box.h);
        expect(sprite.displayWidth).toBeGreaterThan(0);
        // Aspect preserved — a squashed person is the failure that reads as finished-but-wrong.
        expect(sprite.scaleX).toBeCloseTo(sprite.scaleY, 10);
        // FEET on the tile the placement names, centre x mid-tile.
        expect(sprite.x, `${placement.speakerId} x`).toBe(npcCentreX(placement, balance));
        expect(sprite.y + sprite.displayHeight / 2, `${placement.speakerId} feet`).toBe(
          npcFootY(placement, balance),
        );
        // Forward-facing, always: there is no back or side view to flip into.
        expect(sprite.flippedX).toBe(false);
      }
    }
    expect(drawnCount, "nobody was drawn anywhere").toBe(50);
  });

  it("the four rooms stand their authored speaker on the plan's own @ cell", () => {
    for (const bp of INTERIORS) {
      const { layer, placements } = draw(nodeOf(bp.parentNode), bp);
      const anchors = bp.anchors.filter((a) => a.kind === "speaker");
      expect(placements.length, bp.id).toBe(anchors.length);
      for (const anchor of anchors) {
        const placement = placements.find((p) => p.speakerId === anchor.target) as NpcPlacement;
        expect(placement, `${bp.id} ${anchor.target}`).toBeDefined();
        expect({ col: placement.col, row: placement.row }).toEqual({ col: anchor.col, row: anchor.row });
        expect((layer.spriteOf(anchor.target) as unknown as StubImage).visible).toBe(true);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * GATE N1b — depth, reach, and switching views
 * ════════════════════════════════════════════════════════════════════════════ */

describe("GATE N1b — the layer behaves on screen", () => {
  const town = () => nodeOf("bowerdeep");

  it("a person the player is standing below is drawn behind them, and above them in front", () => {
    const node = town();
    const { layer, placements } = draw(node, null);
    const subject = placements[0] as NpcPlacement;
    const foot = npcFootY(subject, balance);
    /*
     * The PLAYER's half-height, deliberately — `half` converts the player stub's CENTRE y into its
     * feet, and the stub's `displayHeight` is `playerSpriteH`. It is not measuring the NPC.
     *
     * I changed this to `npcSpriteH` while repointing the NPC geometry above and the gate caught it:
     * at 48 the player stub landed 8px high, its feet above the NPC's, so "standing ON a person"
     * became "standing behind them" and the depth assertion read 20.003 where it wanted < 20. Two
     * subjects in one file, and only one of them moved.
     */
    const half = balance.map.playerSpriteH / 2;

    // Player one tile FURTHER DOWN the map than the NPC ⇒ the NPC is behind.
    layer.sync({
      node,
      interior: null,
      grid: gridOf(node.id),
      player: player(foot + balance.map.tileStepPx - half),
    });
    expect((layer.spriteOf(subject.speakerId) as unknown as StubImage).depth).toBeLessThan(20);

    // Player one tile FURTHER UP ⇒ the NPC is in front.
    layer.sync({
      node,
      interior: null,
      grid: gridOf(node.id),
      player: player(foot - balance.map.tileStepPx - half),
    });
    expect((layer.spriteOf(subject.speakerId) as unknown as StubImage).depth).toBeGreaterThan(20);
  });

  it("a player standing ON a person is drawn in front of them, not swallowed by them", () => {
    // The four interior @ cells are walkable by their plans' own ruling and `interactIndoors` reads
    // an anchor from the player's exact tile, so this is the ordinary case indoors, not an edge.
    const bp = INTERIORS[0] as InteriorBlueprint;
    const { layer, placements } = draw(nodeOf(bp.parentNode), bp);
    const subject = placements[0] as NpcPlacement;
    /*
     * The PLAYER's half-height, deliberately — `half` converts the player stub's CENTRE y into its
     * feet, and the stub's `displayHeight` is `playerSpriteH`. It is not measuring the NPC.
     *
     * I changed this to `npcSpriteH` while repointing the NPC geometry above and the gate caught it:
     * at 48 the player stub landed 8px high, its feet above the NPC's, so "standing ON a person"
     * became "standing behind them" and the depth assertion read 20.003 where it wanted < 20. Two
     * subjects in one file, and only one of them moved.
     */
    const half = balance.map.playerSpriteH / 2;
    layer.sync({
      node: nodeOf(bp.parentNode),
      interior: bp,
      grid: gridOf(bp.parentNode),
      player: player(npcFootY(subject, balance) - half),
    });
    expect((layer.spriteOf(subject.speakerId) as unknown as StubImage).depth).toBeLessThan(20);
  });

  it("depth never leaves the band around the player, so nobody covers the HUD", () => {
    for (const view of VIEWS) {
      const { layer, placements } = draw(view.node, view.interior, player(0));
      for (const placement of placements) {
        const depth = (layer.spriteOf(placement.speakerId) as unknown as StubImage).depth;
        expect(depth, `${view.label} ${placement.speakerId}`).toBeGreaterThan(19);
        expect(depth).toBeLessThan(21);
      }
    }
  });

  it("[E] from a person's own tile finds THAT person, through the prop reach", () => {
    const node = town();
    const { layer, placements } = draw(node, null);
    const cfg = movementConfig(balance);
    for (const placement of placements) {
      const at = spriteWorldPosition(createMovement({ col: placement.col, row: placement.row }), cfg);
      expect(layer.npcAt(at)?.speakerId, placement.speakerId).toBe(placement.speakerId);
    }
  });

  it("walking into a building swaps the cast, and walking out swaps it back", () => {
    const bp = INTERIORS.find((b) => b.parentNode === "hearthollow") as InteriorBlueprint;
    const node = nodeOf("hearthollow");
    const scene = new StubScene();
    const layer = new NpcLayer(scene as never, balance);
    const view = { node, grid: gridOf(node.id), player: player(0) };

    layer.sync({ ...view, interior: null });
    const outdoors = layer.onScreen().map((p) => p.speakerId);
    expect(outdoors.length).toBeGreaterThan(0);

    layer.sync({ ...view, interior: bp });
    const indoors = layer.onScreen().map((p) => p.speakerId);
    expect(indoors).toEqual(bp.anchors.filter((a) => a.kind === "speaker").map((a) => a.target));
    // The town's people are not in the room, and their sprites are gone rather than left floating.
    for (const id of outdoors) expect(layer.spriteOf(id)).toBeUndefined();

    layer.sync({ ...view, interior: null });
    expect(layer.onScreen().map((p) => p.speakerId)).toEqual(outdoors);
    for (const id of outdoors) expect(layer.spriteOf(id)?.visible).toBe(true);
  });

  it("syncing again without a view change does not build a second set of sprites", () => {
    const node = town();
    const scene = new StubScene();
    const layer = new NpcLayer(scene as never, balance);
    const view = { node, interior: null, grid: gridOf(node.id), player: player(0) };
    layer.sync(view);
    const after = scene.made.length;
    for (let i = 0; i < 5; i += 1) layer.sync(view);
    expect(scene.made.length, "the layer rebuilt on a frame that changed nothing").toBe(after);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * GATE N2 — the scene mounts the layer
 * ════════════════════════════════════════════════════════════════════════════ */

describe("GATE N2 — the overworld actually mounts the NPC layer", () => {
  /**
   * ⚠ THE HALF THAT MAKES N1 MEAN ANYTHING.
   *
   * N1 drives `NpcLayer` directly. A module that draws perfectly and is constructed by nobody is
   * exactly the state the whole defect lived in — twelve finished sprites, a green suite, an empty
   * world — so this asserts the wiring in the ONE file that owns the overworld display list.
   *
   * A SOURCE READ, deliberately: `OverworldScene` needs a Phaser runtime and a canvas to
   * instantiate, and this gate must be answerable in the node environment the rest of the suite
   * runs in. It is a weaker instrument than driving the scene, and it is the strongest one that is
   * available here; `tests/unit/overworld-scene.test.ts` is where a driven assertion belongs once
   * that lane's rig can carry it.
   */
  const SCENE = readFileSync(resolve(ROOT, "game/scenes/OverworldScene.ts"), "utf8");

  it("the player's own Image is what `sync` will be handed, and it fits", () => {
    /*
     * A COMPILE-LEVEL PROOF OF THE CALL SITE, so the hook cannot be written against a shape the
     * scene cannot supply. `OverworldScene` passes `this.player` — a `Phaser.GameObjects.Image` — and
     * the layer sorts on three numbers off it. If Phaser ever stops carrying one, this stops
     * compiling HERE, in a node-environment gate, rather than in a scene that needs a canvas to
     * instantiate.
     */
    type Fits = PhaserT.GameObjects.Image extends PlayerReadout ? true : false;
    const fits: Fits = true;
    expect(fits).toBe(true);
  });

  it("constructs an NpcLayer and keeps it in step with the player", () => {
    const missing: string[] = [];
    if (!/from\s+"\.\.\/npcs"/.test(SCENE)) missing.push('an import from "../npcs"');
    if (!/new NpcLayer\(/.test(SCENE)) missing.push("a `new NpcLayer(...)` in create()");
    if (!/\.sync\(\{/.test(SCENE) || !/npcs\b/.test(SCENE)) {
      missing.push("a `this.npcs.sync({ … })` beside the player sprite");
    }

    const message = [
      "game/scenes/OverworldScene.ts does not mount game/npcs.ts, so nobody is standing in the",
      "world however well the layer draws. Missing:",
      ...missing.map((m) => `  • ${m}`),
      "",
      "The hook is three lines. In create(), immediately after `this.player = this.add.image(...)`:",
      "    this.npcs = new NpcLayer(this, this.balance);",
      "and at the top of syncPlayerSprite(), after `this.player.setPosition(...)`:",
      "    this.npcs.sync({",
      "      node: this.node,",
      "      interior: this.interior,",
      "      grid: this.activeGrid(),",
      "      player: this.player,",
      "    });",
      "",
      "Do not silence this by deleting the assertion: an unmounted layer is the defect, not the test.",
    ].join("\n");
    expect(missing.length === 0 || message).toBe(true);
  });
});
