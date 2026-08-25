/**
 * game/web-view.ts — the food-web half of the ecology ledger (bible §12: "ecology ledger (per-node
 * populations + web view)"), as a pure diagram model.
 *
 * **Guardrail G3 / build-doc §8.3.** Nothing in this file decides who eats whom. Every edge on the
 * diagram comes from `core/foodweb.ts` `deriveFoodWeb`, derived live from the node's populations,
 * roles and habitat at the moment the page is built — there is no stored graph, no adjacency table,
 * and no species or role name written down here. Catch a line to 0 and its edges change on the next
 * open, because the derivation ran again over the state that changed.
 *
 * **What "collapsed" means, exactly.** A link is collapsed when one of its endpoints stands at 0:
 * the prey is gone, so the link delivers nothing, or the predator is gone, so nothing draws on it.
 * The structural edge is still drawn — `deriveFoodWeb` keeps the edges of a line at 0 on purpose
 * ("an extinct predator still tells the ledger what it used to eat") — because a link that vanished
 * and a link that emptied look identical once the line is off the page, and only one of them is
 * something the player did.
 *
 * Pure TypeScript, zero Phaser imports: `LedgerScene` draws these positions, and the test asserts
 * them. G7 — no copy here judges anything; the diagram is counts and arrows.
 */

import { fromNodeState } from "../core/ecosim";
import {
  deriveFoodWeb,
  feedsOnFlora,
  indexSpecies,
  preyOf,
  webAgeClass,
  webRole,
  type EcoNode,
  type SpeciesIndex,
} from "../core/foodweb";
import type { Balance, FoodWeb, NodeFile, NodeState, Role, SpeciesLine } from "../core/types";
import { SCREEN_TEXT, renderNumber } from "./ledger-view";

/**
 * The node's abstract flora stock as a diagram vertex. build-doc §7.2 gives it no species id
 * because it is not a creature ("abstract producer stock, 0–100"), but bible §5 makes it a real
 * food source, so leaving it off the diagram would show grazers eating nothing.
 */
export const FLORA_VERTEX = "flora";

export interface WebVertex {
  /** Line id, or {@link FLORA_VERTEX}. */
  id: string;
  label: string;
  /** null for the flora vertex. */
  role: Role | null;
  /** Trophic depth derived from the drawn edges: 0 = eats nothing at this node. */
  depth: number;
  /** Live count. The flora vertex carries the flora stock instead. */
  count: number;
  /** Carrying capacity; null for the flora vertex (its ceiling is `balance.ecosim.floraMax`). */
  carryCap: number | null;
  isFlora: boolean;
  /** count === 0 — the vertex is drawn, and it reads 0. */
  extinct: boolean;
}

export type CollapseReason = "prey" | "predator" | "both";

export interface WebEdge {
  /** The eater. */
  predator: string;
  /** The eaten — a line id or {@link FLORA_VERTEX}. */
  prey: string;
  predatorCount: number;
  preyCount: number;
  collapsed: boolean;
  /** Which end emptied. Absent when the link is live. */
  reason?: CollapseReason;
}

export interface WebPage {
  nodeId: string;
  nodeName: string;
  biome: string;
  year: number;
  floraStock: number;
  floraMax: number;
  vertices: WebVertex[];
  edges: WebEdge[];
  maxDepth: number;
  collapsedEdges: number;
}

export interface WebArgs {
  file: NodeFile;
  state: NodeState;
  species: readonly SpeciesLine[];
  balance: Balance;
  year: number;
}

/**
 * Trophic depth of each vertex, from the derived edges alone: 0 for a line that eats nothing here,
 * otherwise one more than the deepest thing it eats. It is STRUCTURAL — a predator does not drop a
 * tier because its prey hit 0, or the diagram would rearrange itself the moment the ledger got
 * interesting. Cycles (which the role rules do not produce, but a `dietExceptions` pair could)
 * terminate at the back-edge rather than recursing.
 */
function depths(web: FoodWeb): Map<string, number> {
  const out = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    const cached = out.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    // The flora vertex is the basement of the diagram, so anything grazing it is already a tier up.
    // Without this a grazer at a node with no creature Producer (DEVIATIONS D12: Steppe and Vale)
    // would share a column with the stock it eats, and the arrow would run sideways.
    let best = feedsOnFlora(web, id) ? 1 : 0;
    for (const prey of preyOf(web, id)) {
      if (!(prey in web.edges)) continue;
      best = Math.max(best, depthOf(prey) + 1);
    }
    visiting.delete(id);
    out.set(id, best);
    return best;
  };

  for (const id of Object.keys(web.edges)) depthOf(id);
  return out;
}

/**
 * Build the diagram for one node from the live state.
 *
 * `fromNodeState` rehydrates the sim node the save is carrying (build-doc §7.8: `nodeStates` IS the
 * live sim) and `deriveFoodWeb` runs over it — the same two calls `core/ecosim.ts` makes on a season
 * boundary, so the picture is of the state the sim is actually stepping.
 */
export function buildWebPage(args: WebArgs): WebPage {
  const { file, state, balance, year } = args;
  const idx: SpeciesIndex = indexSpecies([...args.species]);
  const node: EcoNode = fromNodeState(file, state);
  const web = deriveFoodWeb(node, idx, balance);
  const ageClass = webAgeClass(balance);
  const depth = depths(web);

  const countOf = (id: string): number =>
    id === FLORA_VERTEX ? state.floraStock : (state.populations[id]?.count ?? 0);

  const vertices: WebVertex[] = [];
  let maxDepth = 0;
  for (const lineId of Object.keys(web.edges)) {
    const line = idx.byId.get(lineId);
    const pop = state.populations[lineId];
    if (!line || !pop) continue;
    const d = depth.get(lineId) ?? 0;
    maxDepth = Math.max(maxDepth, d);
    vertices.push({
      id: lineId,
      label: line.formNames[ageClass],
      role: webRole(line, balance),
      depth: d,
      count: pop.count,
      carryCap: pop.carryCap,
      isFlora: false,
      extinct: pop.count === 0,
    });
  }

  if (web.floraFeeders.length > 0) {
    vertices.push({
      id: FLORA_VERTEX,
      label: FLORA_VERTEX,
      role: null,
      depth: 0,
      count: state.floraStock,
      carryCap: null,
      isFlora: true,
      extinct: state.floraStock === 0,
    });
  }

  const edges: WebEdge[] = [];
  let collapsedEdges = 0;
  for (const predator of Object.keys(web.edges)) {
    const predatorCount = countOf(predator);
    const targets = [...preyOf(web, predator)];
    if (feedsOnFlora(web, predator)) targets.push(FLORA_VERTEX);
    for (const prey of targets) {
      const preyCount = countOf(prey);
      const preyGone = preyCount === 0;
      const predatorGone = predatorCount === 0;
      const edge: WebEdge = {
        predator,
        prey,
        predatorCount,
        preyCount,
        collapsed: preyGone || predatorGone,
      };
      if (preyGone && predatorGone) edge.reason = "both";
      else if (preyGone) edge.reason = "prey";
      else if (predatorGone) edge.reason = "predator";
      if (edge.collapsed) collapsedEdges += 1;
      edges.push(edge);
    }
  }

  return {
    nodeId: file.id,
    nodeName: file.name,
    biome: file.biome,
    year,
    floraStock: state.floraStock,
    floraMax: balance.ecosim.floraMax,
    vertices,
    edges,
    maxDepth,
    collapsedEdges,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Layout — pure geometry, so the scene draws and the test checks the same numbers.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface WebLayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebLayout {
  /** Vertex id → centre point in the box handed in. */
  positions: Map<string, { x: number; y: number }>;
  /** Vertex ids per trophic depth, index 0 = the basal tier (drawn at the bottom). */
  tiers: string[][];
}

/**
 * One ROW per trophic depth, the basal tier at the bottom and every predator above what it eats, so
 * the diagram reads as a pyramid and an arrow always points downward into its prey.
 *
 * The legibility rule that matters: a line at 0 keeps its place in its tier. The picture of a
 * collapsed web is a hole where a tier used to have numbers in it, never a redrawn graph — if the
 * survivors slid up to fill the gap, the before and after would be hard to tell apart, which is the
 * one comparison the whole screen exists to make.
 */
export function layoutWebPage(page: WebPage, box: WebLayoutBox): WebLayout {
  const tiers: string[][] = [];
  for (let d = 0; d <= page.maxDepth; d += 1) tiers.push([]);
  for (const vertex of page.vertices) {
    const tier = tiers[vertex.depth];
    if (tier) tier.push(vertex.id);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const tierCount = tiers.length;
  for (let d = 0; d < tierCount; d += 1) {
    const tier = tiers[d] ?? [];
    // Depth 0 sits at the bottom of the box; each tier up climbs one share of the height.
    const y = box.y + box.height - (box.height * (d + 0.5)) / tierCount;
    for (let i = 0; i < tier.length; i += 1) {
      const id = tier[i];
      if (id === undefined) continue;
      const x = box.x + (box.width * (i + 0.5)) / tier.length;
      positions.set(id, { x, y });
    }
  }
  return { positions, tiers };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Text rendering — the same page as lines, which is what the tests assert.
 * ──────────────────────────────────────────────────────────────────────────── */

export function labelOf(page: WebPage, id: string): string {
  return page.vertices.find((v) => v.id === id)?.label ?? id;
}

/**
 * Every count on this diagram goes through `renderNumber`, including the ones that look like they
 * cannot need it. Creature counts are integers and pass through untouched — but the FLORA vertex
 * carries `state.floraStock`, which is a real number the moment a season steps, and its label sat
 * on the same tier row as its neighbours: unbounded it ran 8px past the right edge of the canvas
 * and collided with them.
 */
export function renderWebVertex(page: WebPage, vertex: WebVertex): string {
  const cap = vertex.carryCap === null ? `/${renderNumber(page.floraMax)}` : `/${vertex.carryCap}`;
  return `[${vertex.depth}] ${vertex.label} ${renderNumber(vertex.count)}${cap}`;
}

/** `Skir 0 → Nibbin 11  collapsed (predator)` — the counts are on the arrow, both ends. */
export function renderWebEdge(page: WebPage, edge: WebEdge): string {
  // Either end may BE the flora vertex, so both counts are bounded (see renderWebVertex).
  const head =
    `${labelOf(page, edge.predator)} ${renderNumber(edge.predatorCount)} → ` +
    `${labelOf(page, edge.prey)} ${renderNumber(edge.preyCount)}`;
  return edge.collapsed ? `${head}  ${renderWebCollapse(edge)}` : head;
}

/**
 * The words beside a broken link: `collapsed (prey)`.
 *
 * Its own function because the diagram needs it WITHOUT the two labels — the dashed line already
 * joins two vertices that carry their own counts, so the midpoint has room for the reason and
 * nothing else. Before this existed the reason word reached the tests and never reached the screen:
 * a collapsed link was a dark-red dashed line and no explanation at all.
 */
export function renderWebCollapse(edge: WebEdge): string {
  return `collapsed (${edge.reason ?? "prey"})`;
}

/** The node-level line of the diagram — shared with `LedgerScene`, which draws it above the box. */
export function renderWebTotals(page: WebPage): string {
  return (
    `flora ${renderNumber(page.floraStock)}/${renderNumber(page.floraMax)} · ` +
    `links ${page.edges.length} · collapsed ${page.collapsedEdges}`
  );
}

export function renderWebPage(page: WebPage): string[] {
  return [
    `${page.nodeName} — food web · year ${page.year}`,
    renderWebTotals(page),
    ...page.vertices.map((v) => renderWebVertex(page, v)),
    ...page.edges.map((e) => renderWebEdge(page, e)),
  ];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Drawn labels — text, position, and the guarantee that they stay on the canvas.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface WebLabel {
  /** Vertex id, or `predator→prey` for a link label. */
  id: string;
  text: string;
  /** CENTRE of the text — the scene draws these with origin x 0.5. */
  x: number;
  y: number;
}

/** Gap between a vertex dot and the number under it. */
const VERTEX_LABEL_OFFSET_PX = 5;
/** How far apart consecutive collapsed labels are nudged so two short links do not overprint. */
const LABEL_STAGGER_PX = 6;

/**
 * The box the diagram is laid out in: the canvas less the two header lines above it and the footer
 * below. Here rather than in `LedgerScene` so a test lays the diagram out exactly where the scene
 * does — which is the only way a test can tell whether a label leaves the screen.
 */
export function webDiagramBox(balance: Balance): WebLayoutBox {
  const pad = SCREEN_TEXT.padPx;
  const line = SCREEN_TEXT.lineHeight;
  const top = pad + line * 2;
  return {
    x: pad,
    y: top,
    width: balance.map.virtualWidth - pad * 2,
    height: balance.map.virtualHeight - top - line * 3,
  };
}

/**
 * Centre a label of this text so that it stays inside the canvas.
 *
 * A centred label at the far end of a crowded tier hangs off the edge — measured on the live scene,
 * the flora vertex's label ran from x 301 to x 488 on a 480px canvas and its right-hand characters
 * were simply not drawn. Shortening the number was half the fix (see `renderNumber`); this is the
 * other half, because a long enough species name would do it again with no float in sight.
 */
function clampToCanvas(x: number, text: string, balance: Balance): number {
  const half = (text.length * SCREEN_TEXT.advancePx) / 2;
  const width = balance.map.virtualWidth;
  if (half * 2 >= width) return width / 2;
  return Math.min(Math.max(x, half), width - half);
}

/** One label per vertex — its count, under its dot, never off the edge of the screen. */
export function webVertexLabels(page: WebPage, layout: WebLayout, balance: Balance): WebLabel[] {
  const out: WebLabel[] = [];
  for (const vertex of page.vertices) {
    const at = layout.positions.get(vertex.id);
    if (!at) continue;
    const text = renderWebVertex(page, vertex);
    out.push({ id: vertex.id, text, x: clampToCanvas(at.x, text, balance), y: at.y + VERTEX_LABEL_OFFSET_PX });
  }
  return out;
}

/**
 * One label per COLLAPSED link, at the midpoint of the line the scene draws for it.
 *
 * Live links get none: the diagram already says everything true about a working link with an arrow
 * between two numbers, and a word on every edge would bury the two or three that matter. Labels are
 * staggered by index because collapsed links often share an endpoint — a wiped prey line collapses
 * every arrow into it — and three labels at nearly the same midpoint would be one smear.
 *
 * Pure geometry, so the scene draws exactly the positions the test asserts. Before this existed the
 * reason word reached the tests and never reached the screen: `LedgerScene` imported `renderWebEdge`
 * only for a method `redraw` never called, so a collapsed link was a dashed dark-red line and no
 * explanation, while the comment beside the dashes claimed the words were there.
 */
export function collapsedEdgeLabels(page: WebPage, layout: WebLayout, balance: Balance): WebLabel[] {
  const out: WebLabel[] = [];
  for (const edge of page.edges) {
    if (!edge.collapsed) continue;
    const from = layout.positions.get(edge.prey);
    const to = layout.positions.get(edge.predator);
    if (!from || !to) continue;
    const nudge = (out.length % 2 === 0 ? -1 : 1) * LABEL_STAGGER_PX * Math.ceil((out.length + 1) / 2);
    const text = renderWebCollapse(edge);
    out.push({
      id: `${edge.predator}→${edge.prey}`,
      text,
      x: clampToCanvas((from.x + to.x) / 2, text, balance),
      y: (from.y + to.y) / 2 + nudge,
    });
  }
  return out;
}
