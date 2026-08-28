/**
 * game/props.ts — the things standing on the map that are not the map (build-doc §7.6).
 *
 * > "Props are entries in `props[]` with interaction radius, **not baked into collision** (they
 * > overlay the painted map)." — build-doc §7.6
 *
 * That one sentence is the whole contract, and it has two halves the code has to keep apart:
 *
 *   • A prop is NOT geometry. Nothing here touches the collision grid, and walking over an antler
 *     stone is legal. The mask decides where the player may stand; this file decides only what is
 *     within arm's reach of where they are standing.
 *   • A prop's position is in MAP-NATIVE pixels (`core/types.ts` `PropPlacement`: "Position in
 *     map-native pixels (1024² painted map space)"), while the player's position is in WORLD pixels
 *     — the same map at `balance.map.mapRenderScale`. Comparing the two raw is a factor-of-two bug
 *     that reads as "the prop is unreachable from anywhere on the north half of the map", so the
 *     conversion happens once, here, and both the radius and the distance are converted together.
 *
 * Engine-free (`import type` only where it needs a shape at all), so the reach test is answerable
 * from a node test rather than only from a running scene.
 */

import type { Balance, NodeFile, PropPlacement } from "@core/types";

/** A point in WORLD pixels — what `spriteWorldPosition` (game/movement.ts) returns. */
export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * Anything standing on the painted map at map-native pixels with a reach around it.
 *
 * ⚠ WIDENED FROM `PropPlacement` DELIBERATELY, AND IT IS THE G3 ANSWER TO NPCs. `game/npcs.ts`
 * stands people on the same 1024² painted-map space with the same kind of reach, and "is the player
 * close enough to this thing" is a question that must have ONE implementation or a person and a
 * standing stone will disagree about what "close" means the first time `mapRenderScale` is retuned.
 * So the four functions below take this SHAPE rather than the prop TYPE — `PropPlacement` satisfies
 * it structurally, every prop caller is unchanged, and the NPC layer reuses the arithmetic instead
 * of copying it. Nothing else about props is generalised: `propsOf`, `propById`, `propsInReach`,
 * `propAt` and `propLabel` still speak in props, because those are about a NODE's prop list.
 */
export interface MapReachable {
  /** Position in map-native pixels (1024² painted map space). */
  x: number;
  y: number;
  /** Reach in the same map-native pixels. Non-positive falls back to the balance default. */
  interactionRadius: number;
}

/** Every prop placed in a node, in file order. */
export function propsOf(node: NodeFile): readonly PropPlacement[] {
  return node.props;
}

/** The prop with this id in this node, or undefined. */
export function propById(node: NodeFile, propId: string): PropPlacement | undefined {
  return node.props.find((p) => p.id === propId);
}

/**
 * The prop's anchor in WORLD pixels.
 *
 * `mapRenderScale` is read from balance rather than assumed, so a retune of the render scale moves
 * the prop and the player together (G11/INV-3).
 */
export function propWorldPosition(prop: MapReachable, balance: Balance): WorldPoint {
  const scale = balance.map.mapRenderScale;
  return { x: prop.x * scale, y: prop.y * scale };
}

/**
 * The prop's reach in WORLD pixels.
 *
 * `interactionRadius` is authored beside `x`/`y` and is therefore in the same units they are —
 * map-native — so it scales with them. A placement that ships a non-positive radius falls back to
 * `balance.map.propInteractionRadiusDefault` rather than becoming silently unreadable.
 */
export function propWorldRadius(prop: MapReachable, balance: Balance): number {
  const authored = prop.interactionRadius > 0 ? prop.interactionRadius : balance.map.propInteractionRadiusDefault;
  return authored * balance.map.mapRenderScale;
}

/** World-pixel distance from a point to a prop's anchor. */
export function distanceToProp(prop: MapReachable, at: WorldPoint, balance: Balance): number {
  const anchor = propWorldPosition(prop, balance);
  const dx = at.x - anchor.x;
  const dy = at.y - anchor.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Is this point inside the prop's interaction radius? The boundary counts as inside. */
export function propInReach(prop: MapReachable, at: WorldPoint, balance: Balance): boolean {
  return distanceToProp(prop, at, balance) <= propWorldRadius(prop, balance);
}

/** Every prop of the node whose radius contains the point, nearest first. */
export function propsInReach(node: NodeFile, at: WorldPoint, balance: Balance): PropPlacement[] {
  return node.props
    .filter((p) => propInReach(p, at, balance))
    .sort((a, b) => distanceToProp(a, at, balance) - distanceToProp(b, at, balance));
}

/**
 * The prop the player is standing at, or null.
 *
 * NEAREST, not first-in-file: two shell-kiln shrines stand in Cindershelf and two antler stones in
 * Route 1, so "the first one whose radius contains me" would read the wrong stone wherever two
 * radii overlap. Ties keep file order, which is stable.
 */
export function propAt(node: NodeFile, at: WorldPoint, balance: Balance): PropPlacement | null {
  return propsInReach(node, at, balance)[0] ?? null;
}

/**
 * How a prop should read on the HUD when the player is not close enough to read it — the label the
 * placement carries, or its id when it carries none. G7: it names the thing and stops.
 */
export function propLabel(prop: PropPlacement): string {
  return prop.label ?? prop.id;
}

/* ────────────────────────────────────────────────────────────────────────────
 * A prop is SOLID — where it stands, not how far it can be heard
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The one tile a prop stands on.
 *
 * ══ THE OWNER'S RULING, AND WHY THE ART ALREADY AGREED WITH IT ══
 * Hank, verbatim: **"props should have collisions too."** The header of this file quotes build-doc
 * §7.6 — *"not baked into collision (they overlay the painted map)"* — and that sentence described
 * the MASK, never the PAINTING. `tools/mapgen/compose/props.py` stamps all four prop families onto
 * the twelve painted maps, while `MAP-PROMPT-RULES.md` states the rule the mask was built under:
 * props *"have no sprite… they are invisible interaction hotspots over the painted map."* So a
 * standing stone has been visibly painted on the ground and walkable through it since the first
 * map. The art and the mask have disagreed from the start; this makes them agree, and the disagreed
 * half was the mask.
 *
 * ⚠ ONE CELL, AND NOT THE INTERACTION RADIUS. Reach and occupancy are different quantities and
 * conflating them is the obvious wrong turn: `interactionRadius` defaults to 48 map-native px = 96
 * world px = three tiles, so a footprint derived from it would make a SIGN CARD a 3×3 wall. The
 * authored data states a prop's position and its reach and says nothing whatever about its
 * footprint, so ONE CELL — the cell the authored point falls in — is the honest default, and it is
 * recorded here as a default rather than as a fact about the objects. If `PropPlacement` ever gains
 * a real footprint, this is the function that reads it.
 *
 * ⚠ AND THE PROP MUST STILL BE READABLE. `OverworldScene.interact()` measures reach from the
 * player's standing point, so blocking the prop's own cell is only safe while a walkable cell
 * remains inside the radius. At the shipped numbers that is never close: a neighbouring tile's
 * centre is one `tileStepPx` (32 world px) from the prop against a 96 px reach — but it is measured
 * per prop per node in `tests/unit/npc-prop-collision.test.ts` rather than argued from here, because
 * the standing point has already moved once (`playerSpriteH` 48 → 32) and reach is sensitive to it.
 */
export function propTile(prop: MapReachable, balance: Balance): { col: number; row: number } {
  const scale = balance.map.mapRenderScale;
  const step = balance.map.tileStepPx;
  return { col: Math.floor((prop.x * scale) / step), row: Math.floor((prop.y * scale) / step) };
}

/**
 * Every tile this node's props make impassable, as `"col,row"` keys.
 *
 * An OVERLAY, exactly as `game/npcs.ts` {@link npcOccupiedTiles} is, and for the same two reasons:
 * the collision mask is sampled from the painting and a body is not geometry, and `chooseSpawnTile`
 * reads the mask to decide where props may NOT put the player — a mask that already carried them
 * would be answering a question with its own output.
 */
export function propOccupiedTiles(props: readonly MapReachable[], balance: Balance): Set<string> {
  const out = new Set<string>();
  for (const prop of props) {
    const tile = propTile(prop, balance);
    out.add(`${String(tile.col)},${String(tile.row)}`);
  }
  return out;
}
