/**
 * tools/mapgen/nodes.ts — the two facts about a node the seeder needs and `data/nodes/*.json` does
 * not state outright: WHICH WAY IS ONWARD, and IS THIS A SETTLEMENT.
 *
 * Both are DERIVED from shipped data. Neither is a table in this file, because a second table of
 * "which node is a town" is exactly the kind of thing G3 exists to stop.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. THE CHAIN — which edge a declared adjacency comes out on
 * ─────────────────────────────────────────────────────────────────────────────
 * `adjacency` is an unordered string list. The brief fixes the convention: BOTTOM is back toward
 * Hearthollow, TOP is onward to the Sanctum. To apply it we need to know which end of the graph is
 * which, and the node files do not say.
 *
 * `data/gyms.json` does. Its leaders carry an `act`, and `core/schemas.ts` already enforces that the
 * act gates are consecutive and ascending — so sorting the leaders by act gives the region in play
 * order, and `gyms[0].town` is the first town and `gyms[last].town` is the last. The region graph is
 * then walked from the first town; `buildChain` refuses anything that is not a simple path over
 * every node, so a data change that makes it a tree or a ring fails here instead of quietly
 * producing a map with three exits.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. SETTLEMENT — which nodes get building footprints
 * ─────────────────────────────────────────────────────────────────────────────
 * A node has buildings iff `data/gyms.json` names it as a leader's `town` AND its biome is not the
 * Sanctum's. The second clause is not a special case dressed up: the Sanctum Fallow is the only node
 * whose biome no settlement shares, it is the terminus of the chain, and the shipped art brief calls
 * it a site rather than a town. A route has no leader, so it falls out of the first clause on its
 * own; `sanctum-approach` likewise.
 */

import type { Content, NodeFile } from '../../core/types.ts';

export class NodeGraphError extends Error {}

/** A node's place in the region, and what the seeder does with it. */
export interface NodePlacement {
  node: NodeFile;
  /** 0-based position along the chain from the first town. */
  index: number;
  /** The adjacency that leads BACK toward the first town — drawn on the BOTTOM edge. Null at the head. */
  back: string | null;
  /** The adjacency that leads ONWARD toward the terminus — drawn on the TOP edge. Null at the tail. */
  onward: string | null;
  /** True ⇒ the seeder places building footprints. See the header. */
  settlement: boolean;
}

function leaderTownsInActOrder(content: Content): string[] {
  const towns = [...content.gyms].sort((a, b) => a.act - b.act).map((g) => g.town);
  if (towns.length === 0) throw new NodeGraphError('data/gyms.json ships no leaders, so the region has no play order');
  return towns;
}

/**
 * The region as a single path, head first. Throws unless the adjacency graph really is one — a
 * degree-3 node, a disconnected node, or a ring would each make "bottom is back, top is onward"
 * meaningless, and silently drawing two exits on a three-way junction is worse than stopping.
 */
export function buildChain(content: Content): NodeFile[] {
  const byId = new Map(content.nodes.map((n) => [n.id, n]));
  const towns = leaderTownsInActOrder(content);
  const headId = towns[0];
  const tailId = towns[towns.length - 1];
  if (headId === undefined || tailId === undefined) throw new NodeGraphError('gyms.json has no first/last town');

  const problems: string[] = [];
  for (const n of content.nodes) {
    const degree = n.adjacency.length;
    if (degree < 1 || degree > 2) problems.push(`node "${n.id}" has ${degree} adjacencies; a path allows 1 or 2`);
    for (const a of n.adjacency) {
      const other = byId.get(a);
      if (!other) problems.push(`node "${n.id}" is adjacent to "${a}", which is not a node`);
      else if (!other.adjacency.includes(n.id)) problems.push(`node "${n.id}" → "${a}" is not symmetric`);
    }
  }
  const head = byId.get(headId);
  if (!head) problems.push(`gyms.json names "${headId}" as the first town, but it is not a node`);
  else if (head.adjacency.length !== 1) {
    problems.push(`"${headId}" is the first town but has ${head.adjacency.length} adjacencies; the head of a path has 1`);
  }
  if (problems.length > 0) {
    throw new NodeGraphError(`the region graph is not a simple path:\n  · ${problems.join('\n  · ')}`);
  }

  const chain: NodeFile[] = [];
  const visited = new Set<string>();
  let current: NodeFile | undefined = head;
  let previousId: string | null = null;
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    const nextId: string | undefined = current.adjacency.find((a) => a !== previousId);
    previousId = current.id;
    current = nextId === undefined ? undefined : byId.get(nextId);
  }
  if (chain.length !== content.nodes.length) {
    const missed = content.nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
    throw new NodeGraphError(
      `walking adjacency from "${headId}" reached ${chain.length} of ${content.nodes.length} nodes; ` +
        `unreached: ${missed.join(', ')}`,
    );
  }
  const last = chain[chain.length - 1];
  if (last === undefined || last.id !== tailId) {
    throw new NodeGraphError(
      `the chain from "${headId}" ends at "${last?.id ?? '(none)'}", but gyms.json's last leader stands at "${tailId}"`,
    );
  }
  return chain;
}

/** The biome of the terminus — the one biome no settlement shares. See the header, clause 2. */
export function terminusBiome(content: Content): string {
  const chain = buildChain(content);
  const last = chain[chain.length - 1];
  if (!last) throw new NodeGraphError('the chain is empty');
  return last.biome;
}

/** Chain position, edge assignment and settlement status for every node, in chain order. */
export function placements(content: Content): NodePlacement[] {
  const chain = buildChain(content);
  const leaderTowns = new Set(content.gyms.map((g) => g.town));
  const terminus = terminusBiome(content);
  return chain.map((node, index) => ({
    node,
    index,
    back: index === 0 ? null : (chain[index - 1]?.id ?? null),
    onward: index === chain.length - 1 ? null : (chain[index + 1]?.id ?? null),
    settlement: leaderTowns.has(node.id) && node.biome !== terminus,
  }));
}

export function placementOf(content: Content, nodeId: string): NodePlacement {
  const found = placements(content).find((p) => p.node.id === nodeId);
  if (!found) throw new NodeGraphError(`"${nodeId}" is not a node in data/nodes/`);
  return found;
}
