/**
 * game/scenes/LedgerScene.ts — the ecology ledger (build-doc §15 C4, bible §12
 * "ecology ledger (per-node populations + web view)").
 *
 * This scene is a RENDERER. Every integer it draws comes from `game/ledger-view.ts` and
 * `game/web-view.ts`, which read the `NodeState` objects handed in and derive the web through
 * `core/foodweb.ts` (G3 / §8.3). No arithmetic about populations, diets or encounters happens in
 * this file; if it did, the epilogue and the in-game ledger could disagree, and they are the same
 * screen.
 *
 * **The state arrives as scene data, never from a global.** build-doc §4 step 6: "The epilogue
 * reuses the same renderer over the final state — the ending is a ledger read." So Hard Req 7's
 * epilogue launches THIS scene with `projectRegion`'s output and its own title, and gets the same
 * page it would get mid-game.
 *
 * **How to hand the states over.** See {@link NodeStatesSource}: pass a FUNCTION if your states
 * record is reassigned rather than mutated in place, which is what `stepRegionStates` makes a
 * caller do — it returns a new record every season. A record captured once and reassigned behind
 * the scene's back is the one way this screen can show a stale number.
 *
 * G7 — no copy in this file judges the player. Labels and integers only.
 */

import Phaser from "phaser";
import {
  SCREEN_TEXT,
  buildLedgerPage,
  renderLedgerHeader,
  renderLedgerPage,
  type LedgerHistory,
  type LedgerPage,
} from "../ledger-view";
import {
  buildWebPage,
  collapsedEdgeLabels,
  layoutWebPage,
  renderWebEdge,
  renderWebTotals,
  webDiagramBox,
  webVertexLabels,
  type WebEdge,
  type WebPage,
} from "../web-view";
import { SCENE_KEYS } from "../scene-keys";
import type { Content, NodeState, Season } from "../../core/types";

/**
 * The scene key, READ from the registry rather than spelled again here — `game/scene-keys.ts` is
 * engine-free (`import type` only), so there is no reason for this file to hold a second copy of
 * the string, and two spellings of one key is the exact failure that registry exists to prevent.
 */
export const LEDGER_SCENE_KEY = SCENE_KEYS.ledger;

export type LedgerMode = "numbers" | "web";

/**
 * How the scene gets at the region's states.
 *
 * **Hand over the function unless you know why you are not.** `core/ecosim.ts` `stepRegionStates`
 * returns a NEW record every season (measured: four consecutive calls, four different objects), so
 * a caller that does `save.nodeStates = step(...).states` leaves any scene holding the old record —
 * and Phaser does not re-run `init` on wake, so a slept-and-woken ledger would draw the pre-step
 * numbers with nothing on screen to say so. A function is re-read on every redraw; a record is
 * exactly the record you handed over, which is correct only while you MUTATE it in place.
 */
export type NodeStatesSource =
  | Readonly<Record<string, NodeState>>
  | (() => Readonly<Record<string, NodeState>>);

export interface LedgerSceneData {
  content: Content;
  /** The live sim (build-doc §7.8 `nodeStates`) — or, for the epilogue, the projected one. */
  states: NodeStatesSource;
  year: number;
  season: Season;
  /** Node ids to browse, in order. Defaults to every node the states cover. */
  nodeIds?: readonly string[];
  startNodeId?: string;
  /** Optional per-node season history, for the trend column. Absent = trend shows the live count. */
  histories?: Readonly<Record<string, LedgerHistory>>;
  /** Heading override — the epilogue names itself (Hard Req 7). */
  title?: string;
  mode?: LedgerMode;
  onClose?: () => void;
}

/** UI chrome colours. Not art: `data/palette.json` governs generated assets (build-doc §8.4). */
const INK = "#e8e4d8";
const INK_DIM = "#8a8676";
const INK_COLLAPSED = "#c26a6a";
const LINE_LIVE = 0xe8e4d8;
const LINE_COLLAPSED = 0x8a3b3b;
const VERTEX_LIVE = 0x4f6d4a;
const VERTEX_ZERO = 0x8a3b3b;
const BACKDROP = 0x14140f;

/** Radius of a vertex dot on the diagram. */
const DOT_RADIUS = 3;

/** Index of the totals line in `renderLedgerPage`'s array — the one chrome line drawn in full ink. */
const TOTALS_LINE = 1;

// One declaration of the screen's text metrics, in game/ledger-view.ts, so the width the tests
// check every rendered line against is the width this scene actually draws at.
const FONT = SCREEN_TEXT.fontFamily;
const BODY_PX = SCREEN_TEXT.fontPx;
const LINE_H = SCREEN_TEXT.lineHeight;
const PAD = SCREEN_TEXT.padPx;

export class LedgerScene extends Phaser.Scene {
  static readonly KEY = LEDGER_SCENE_KEY;

  private args!: LedgerSceneData;
  private nodeIds: string[] = [];
  private cursor = 0;
  private mode: LedgerMode = "numbers";
  private layer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: LEDGER_SCENE_KEY });
  }

  init(data: LedgerSceneData): void {
    this.args = data;
    this.mode = data.mode ?? "numbers";
    const states = this.statesNow();
    const ids = data.nodeIds ?? data.content.nodes.filter((n) => states[n.id]).map((n) => n.id);
    this.nodeIds = [...ids];
    const start = data.startNodeId ? this.nodeIds.indexOf(data.startNodeId) : 0;
    this.cursor = start >= 0 ? start : 0;
  }

  create(): void {
    this.layer = this.add.container(0, 0);
    const keyboard = this.input.keyboard;
    keyboard?.on("keydown-LEFT", () => this.step(-1));
    keyboard?.on("keydown-RIGHT", () => this.step(1));
    keyboard?.on("keydown-TAB", () => this.toggleMode());
    keyboard?.on("keydown-ESC", () => this.close());
    // Phaser runs `init` once and never again on sleep/wake or pause/resume, so a scene that only
    // drew in `create` would show the numbers as they were when it was first opened. Everything on
    // this screen is re-read from the states on every redraw, so waking is a redraw.
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.redraw());
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.redraw());
    this.redraw();
  }

  /**
   * The region's states as they are RIGHT NOW — see {@link NodeStatesSource} for why this is a
   * method and not a field read once in `init`.
   */
  private statesNow(): Readonly<Record<string, NodeState>> {
    const source = this.args.states;
    return typeof source === "function" ? source() : source;
  }

  /**
   * Point the scene at a different states record — for a caller that reassigns rather than mutates
   * and would rather not pass a function. Redraws, so the screen is never behind the call.
   */
  setStates(states: NodeStatesSource): void {
    this.args = { ...this.args, states };
    if (this.layer) this.redraw();
  }

  /** The node currently being browsed. Public so a test harness or the epilogue can drive it. */
  currentNodeId(): string {
    return this.nodeIds[this.cursor] ?? "";
  }

  step(delta: number): void {
    if (this.nodeIds.length === 0) return;
    this.cursor = (this.cursor + delta + this.nodeIds.length) % this.nodeIds.length;
    this.redraw();
  }

  toggleMode(): void {
    this.mode = this.mode === "numbers" ? "web" : "numbers";
    this.redraw();
  }

  close(): void {
    this.args.onClose?.();
  }

  /** The page as it would render right now — the same object the text is drawn from. */
  page(): LedgerPage | null {
    const nodeId = this.currentNodeId();
    const states = this.statesNow();
    if (!this.args.content.nodes.some((n) => n.id === nodeId) || !states[nodeId]) return null;
    const history = this.args.histories?.[nodeId];
    return buildLedgerPage({
      nodeId,
      // The WHOLE region, not just this node: build-doc §7.3 step 1's Ancient presence effects reach
      // across the node graph, so the breed rates here are a fact about the region (see
      // `effectiveRates` in game/ledger-view.ts).
      region: { files: this.args.content.nodes, states },
      species: this.args.content.species,
      balance: this.args.content.balance,
      year: this.args.year,
      season: this.args.season,
      ...(history ? { history } : {}),
    });
  }

  webPage(): WebPage | null {
    const nodeId = this.currentNodeId();
    const file = this.args.content.nodes.find((n) => n.id === nodeId);
    const state = this.statesNow()[nodeId];
    if (!file || !state) return null;
    return buildWebPage({
      file,
      state,
      species: this.args.content.species,
      balance: this.args.content.balance,
      year: this.args.year,
    });
  }

  private redraw(): void {
    this.layer.removeAll(true);
    const map = this.args.content.balance.map;
    const width = map.virtualWidth;
    const height = map.virtualHeight;

    const bg = this.add.graphics();
    bg.fillStyle(BACKDROP, 1).fillRect(0, 0, width, height);
    this.layer.add(bg);

    const page = this.page();
    if (!page) {
      this.layer.add(this.text(PAD, PAD, `no state for node ${this.currentNodeId()}`, INK_DIM));
      return;
    }

    const heading = this.args.title ?? renderLedgerHeader(page);
    this.layer.add(this.text(PAD, PAD, heading, INK));

    if (this.mode === "numbers") {
      // Drawn from `renderLedgerPage` line for line, in its order, so what a player sees is exactly
      // what tests/unit/ledger-view.test.ts asserts character for character. Only the COLOUR is
      // decided here: the rows are always the tail of the array, so everything before them is
      // chrome, and of the chrome only the totals line carries numbers worth full ink.
      const lines = renderLedgerPage(page);
      const firstRow = lines.length - page.rows.length;
      lines.forEach((line, i) => {
        if (i === 0) return; // the heading, already drawn (and overridable by the epilogue)
        const dim = i < firstRow && i !== TOTALS_LINE;
        this.layer.add(this.text(PAD, PAD + LINE_H * i, line, dim ? INK_DIM : INK));
      });
    } else {
      this.drawWeb();
    }

    const footer = `${this.cursor + 1}/${this.nodeIds.length}  ←/→ node  TAB ${this.mode === "numbers" ? "web" : "numbers"}  ESC`;
    this.layer.add(this.text(PAD, height - LINE_H - PAD, footer, INK_DIM));
  }

  private drawWeb(): void {
    const web = this.webPage();
    if (!web) return;

    const balance = this.args.content.balance;
    // The box, the label positions and the label text are all computed in game/web-view.ts, so the
    // test lays the diagram out exactly where this scene does and can tell when a label runs off.
    const layout = layoutWebPage(web, webDiagramBox(balance));

    // The same string game/web-view.ts renders for the text page — one renderer, so the diagram and
    // the ledger cannot report different flora for the same node.
    this.layer.add(this.text(PAD, PAD + LINE_H, renderWebTotals(web), INK_DIM));

    const edgeGfx = this.add.graphics();
    for (const edge of web.edges) this.drawEdge(edgeGfx, layout.positions, edge);
    this.layer.add(edgeGfx);

    // …and the words for the broken ones. A dashed dark-red line is a picture of "something is
    // wrong here"; `collapsed (prey)` is which end emptied, which is the thing the player did.
    // The origin comes off the label because game/web-view.ts placed the label so that its BOX
    // touches nothing else on the diagram, and the box is only the box it drew if the scene anchors
    // the text the same way it assumed.
    for (const label of collapsedEdgeLabels(web, layout, balance)) {
      const text = this.text(label.x, label.y, label.text, INK_COLLAPSED);
      text.setOrigin(0.5, label.originY);
      this.layer.add(text);
    }

    for (const vertex of web.vertices) {
      const at = layout.positions.get(vertex.id);
      if (!at) continue;
      const dot = this.add.graphics();
      dot
        .fillStyle(vertex.extinct ? VERTEX_ZERO : VERTEX_LIVE, 1)
        .fillCircle(at.x, at.y, DOT_RADIUS)
        .lineStyle(1, LINE_LIVE, 1)
        .strokeCircle(at.x, at.y, DOT_RADIUS);
      this.layer.add(dot);
    }

    // Hard Req 2 — every vertex carries its integer. A dot with no number is a proxy.
    for (const label of webVertexLabels(web, layout, balance)) {
      const extinct = web.vertices.find((v) => v.id === label.id)?.extinct === true;
      const text = this.text(label.x, label.y, label.text, extinct ? INK_DIM : INK);
      text.setOrigin(0.5, label.originY);
      this.layer.add(text);
    }
  }

  private drawEdge(
    gfx: Phaser.GameObjects.Graphics,
    positions: Map<string, { x: number; y: number }>,
    edge: WebEdge,
  ): void {
    const from = positions.get(edge.prey);
    const to = positions.get(edge.predator);
    if (!from || !to) return;
    gfx.lineStyle(1, edge.collapsed ? LINE_COLLAPSED : LINE_LIVE, edge.collapsed ? 0.9 : 0.6);
    if (edge.collapsed) {
      // Drawn broken; `collapsedEdgeLabels` puts the reason in words at the midpoint of this line.
      const steps = 8;
      for (let i = 0; i < steps; i += 2) {
        const a = i / steps;
        const b = (i + 1) / steps;
        gfx.lineBetween(
          from.x + (to.x - from.x) * a,
          from.y + (to.y - from.y) * a,
          from.x + (to.x - from.x) * b,
          from.y + (to.y - from.y) * b,
        );
      }
    } else {
      gfx.lineBetween(from.x, from.y, to.x, to.y);
    }
  }

  /** Every edge of the current node as text — what the diagram says, in a form a test can assert. */
  webLines(): string[] {
    const web = this.webPage();
    if (!web) return [];
    return web.edges.map((e) => renderWebEdge(web, e));
  }

  private text(x: number, y: number, value: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, { fontFamily: FONT, fontSize: `${BODY_PX}px`, color })
      .setOrigin(0, 0);
  }
}
