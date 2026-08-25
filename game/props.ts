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
export function propWorldPosition(prop: PropPlacement, balance: Balance): WorldPoint {
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
export function propWorldRadius(prop: PropPlacement, balance: Balance): number {
  const authored = prop.interactionRadius > 0 ? prop.interactionRadius : balance.map.propInteractionRadiusDefault;
  return authored * balance.map.mapRenderScale;
}

/** World-pixel distance from a point to a prop's anchor. */
export function distanceToProp(prop: PropPlacement, at: WorldPoint, balance: Balance): number {
  const anchor = propWorldPosition(prop, balance);
  const dx = at.x - anchor.x;
  const dy = at.y - anchor.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Is this point inside the prop's interaction radius? The boundary counts as inside. */
export function propInReach(prop: PropPlacement, at: WorldPoint, balance: Balance): boolean {
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
