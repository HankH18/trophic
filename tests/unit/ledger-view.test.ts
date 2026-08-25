/**
 * tests/unit/ledger-view.test.ts — the C4 screens: the ecology ledger, the food-web view, the dex
 * and the creature summary card.
 *
 * What these tests are FOR. Three of the project's hard requirements are claims about text on a
 * screen, and a claim about text is only checkable if something can call the renderer:
 *
 *   Hard Req 2  "the in-game ledger shows real numbers, never proxies" — so the exact rendered
 *               characters are asserted against a fixture save, and every row is bound to the live
 *               `nodeStates` object it was read from (build-doc §8.3).
 *   Hard Req 10 "dex + sign cards flag migrants dormant/migrating out of season, so seasonal
 *               absence is never confusable with a population crash" — asserted for every migrant
 *               in every season, both halves (the flag out of season AND the count that is not 0).
 *   bible §12   "team/creature summary (shows projected retirement year)" — asserted to equal
 *               `core/lifecycle.ts`'s own computation, never a second one.
 *
 * Plus G7: no string any of these renderers emits judges the player for catching.
 *
 * The modules under test are pure (no Phaser), which is the point — the scenes draw these strings
 * and nothing else, so the screen is testable headlessly.
 */

import { describe, expect, it } from "vitest";
import { validateContent, zNodeFile } from "../../core/schemas";
import { newSave, openStreams } from "../../core/save";
import { seasonAt } from "../../core/clock";
import { createRng } from "../../core/rng";
import { derivePresence, ecoConstants, fromNodeState, stepRegionStates } from "../../core/ecosim";
import {
  NEVER,
  newOwnedCreature,
  projectedRetirementYear,
  retiresBeyondFinalYear,
} from "../../core/lifecycle";
import { encounterWeights, indexSpecies, migrantStatus } from "../../core/foodweb";
import type { Content, NodeFile, NodeState, OwnedCreature, Season, SpeciesLine } from "../../core/types";
import {
  ALL_FORMS,
  DEX_ART_BOX,
  NOT_IN_ENCOUNTER_POOL,
  NO_PRESENCE,
  NO_VALUE,
  SCREEN_TEXT,
  SUMMARY_ART_BOX,
  buildDexEntries,
  buildLedgerPage,
  buildSummaryCard,
  columnBudget,
  dexArtId,
  effectiveRates,
  ledgerPageForSave,
  recordSample,
  regionalCount,
  renderDexEntry,
  renderDexFlags,
  renderDexSeasonStatus,
  renderLedgerPage,
  renderLedgerPresence,
  renderLedgerRow,
  renderNumber,
  renderRate,
  renderSeasonalNote,
  renderRetirementYear,
  renderSummaryCard,
  sampleNodeState,
  seasonsPerYear,
  textLeftOf,
  type LedgerRegion,
  type LedgerSample,
} from "../../game/ledger-view";
import { ledgerHistory } from "../../game/ledger-history";
import { registry } from "../../game/registry";
import { SCENE_KEYS } from "../../game/scene-keys";
import {
  buildWebPage,
  collapsedEdgeLabels,
  labelBounds,
  labelOverlap,
  layoutWebPage,
  renderWebEdge,
  renderWebPage,
  renderWebTotals,
  renderWebVertex,
  webDiagramBox,
  webVertexLabels,
  FLORA_VERTEX,
} from "../../game/web-view";

const content = validateContent();
const balance = content.balance;
const SEASONS = balance.clock.seasonOrder;

/* ────────────────────────────────────────────────────────────────────────────
 * The fixture save. build-doc §11's mini-node: 3 real species, tiny hand-checkable counts.
 * ──────────────────────────────────────────────────────────────────────────── */

function miniNodeFile(): NodeFile {
  const raw = JSON.parse(
    require("node:fs").readFileSync(
      new URL("../../fixtures/mini-node.json", import.meta.url),
      "utf8",
    ) as string,
  ) as unknown;
  return zNodeFile.parse(raw);
}

const MINI = miniNodeFile();

/** A content bundle whose only node is the fixture, so `ledgerPageForSave` can resolve it. */
const miniContent: Content = { ...content, nodes: [MINI] };

function miniSave() {
  return newSave({ seed: 1234, currentNode: MINI.id, nodes: [MINI] }, balance);
}

/** The fixture as a one-node region — the shape `buildLedgerPage` needs (see `LedgerRegion`). */
function miniRegion(state: NodeState): LedgerRegion {
  return { files: [MINI], states: { [MINI.id]: state } };
}

/** The shipped region out of a save. */
function regionOf(save: { nodeStates: Record<string, NodeState> }): LedgerRegion {
  return { files: content.nodes, states: save.nodeStates };
}

function lineOf(id: string): SpeciesLine {
  const line = content.species.find((s) => s.id === id);
  if (!line) throw new Error(`fixture references a line the content does not have: ${id}`);
  return line;
}

/** Every line the ledger, the web view, the dex and the summary card can print, for one save. */
function everyLedgerLine(
  states: Record<string, NodeState>,
  year: number,
  season: Season,
  histories?: Record<string, LedgerSample[]>,
): string[] {
  const out: string[] = [];
  const region: LedgerRegion = { files: content.nodes, states };
  for (const file of content.nodes) {
    if (!states[file.id]) continue;
    const history = histories?.[file.id];
    out.push(
      ...renderLedgerPage(
        buildLedgerPage({
          nodeId: file.id,
          region,
          species: content.species,
          balance,
          year,
          season,
          ...(history ? { history } : {}),
        }),
      ),
    );
    out.push(
      ...renderWebPage(
        buildWebPage({ file, state: states[file.id] as NodeState, species: content.species, balance, year }),
      ),
    );
  }
  return out;
}

/** Four real season steps over the shipped region — the state every fixture test never sees. */
function steppedRegion(seed: number, steps: number): { states: Record<string, NodeState>; histories: Record<string, LedgerSample[]> } {
  const save = newSave({ seed, currentNode: "hearthollow", nodes: content.nodes }, balance);
  let states: Record<string, NodeState> = save.nodeStates;
  const histories: Record<string, LedgerSample[]> = {};
  const rng = createRng(seed);
  for (let i = 0; i < steps; i += 1) {
    const season = SEASONS[i % SEASONS.length] as Season;
    states = stepRegionStates(content.nodes, states, season, rng).states;
    // The wiring game/ledger-view.ts documents: whoever steps the season records the sample.
    for (const file of content.nodes) {
      const state = states[file.id];
      if (!state) continue;
      histories[file.id] = recordSample(
        histories[file.id] ?? [],
        sampleNodeState(state, 1 + Math.floor(i / SEASONS.length), season),
        balance,
      );
    }
  }
  return { states, histories };
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Hard Req 2 — the ledger renders the real integers, exactly
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ledger — Hard Req 2: real integers from the save's nodeStates", () => {
  it("renders the fixture save character for character", () => {
    const save = miniSave();
    const page = ledgerPageForSave(save, MINI.id, miniContent);

    // Row order is data/species.json's order (core/foodweb.ts `orderedLineIds`): nibbin, skir,
    // loamunder — NOT the order the JSON happens to list them in, and not alphabetical.
    expect(renderLedgerPage(page)).toEqual([
      "Mini Node — year 1 · spring",
      "flora 45/100 · recent deaths 0 · lines 3 · individuals 40 · at 0: 0",
      // No Ancient is in range of the fixture, so `presence:` is empty — but the `breed` column is
      // the rate the SIM uses (§7.3 step 1's whole product), and food moves it with no Ancient
      // anywhere: Nibbin's foodFactor at the fixture is 1.25, so 0.040 → 0.050. The stored rate is
      // still on the row beside it. Skir and Loamunder sit at foodFactor 1 and print once.
      "presence: none",
      "line          count  cap  breed  seasons",
      "Nibbin           20   60  0.040→0.050  20  net —",
      "Skir             10   30  0.100  10  net —",
      "Loamunder        10   40  0.120  10  net —",
    ]);
  });

  it("every rendered count IS the count in the state object it was handed (§8.3)", () => {
    const save = miniSave();
    for (const nodeId of Object.keys(save.nodeStates)) {
      const state = save.nodeStates[nodeId] as NodeState;
      const page = ledgerPageForSave(save, nodeId, miniContent);
      expect(page.rows.length).toBe(Object.keys(state.populations).length);
      for (const row of page.rows) {
        const live = state.populations[row.lineId];
        expect(row.count).toBe(live?.count);
        expect(row.carryCap).toBe(live?.carryCap);
        // …and the integer is actually in the text a player reads. A row with no number would
        // still satisfy the two assertions above; this is the one that makes it a NUMBER on screen.
        expect(renderLedgerRow(row).split(/\s+/)).toContain(String(row.count));
      }
    }
  });

  it("BINDS — moving a number in the save moves the rendered text", () => {
    const save = miniSave();
    const before = renderLedgerPage(ledgerPageForSave(save, MINI.id, miniContent));
    const pop = save.nodeStates[MINI.id]?.populations["nibbin-line"];
    if (!pop) throw new Error("fixture save lost its nibbin population");
    pop.count -= 1;
    const after = renderLedgerPage(ledgerPageForSave(save, MINI.id, miniContent));
    expect(after).not.toEqual(before);
    expect(after[4]).toBe("Nibbin           19   60  0.040→0.050  19  net —");
    // …and the totals line moved with it, so nothing on the page is a stale copy.
    expect(after[1]).toBe("flora 45/100 · recent deaths 0 · lines 3 · individuals 39 · at 0: 0");
  });

  it("BINDS — building a page moves nothing in the state it was handed", () => {
    // The breed column is answered by running core/ecosim.ts's own `step` (see `effectiveRates`),
    // and a step that leaked into the caller's state would advance the sim every time the player
    // opened the ledger. The projected counts are discarded; this is what says so.
    const save = newSave({ seed: 21, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const snapshot = JSON.stringify(save.nodeStates);
    for (const file of content.nodes) renderLedgerPage(ledgerPageForSave(save, file.id, content));
    expect(JSON.stringify(save.nodeStates)).toBe(snapshot);
  });

  it("never renders a band word where a number belongs", () => {
    // Hard Req 2's other half: "never proxies". A ledger that says a species is "sparse" has
    // replaced the number the whole game is about with an adjective.
    const BANDS =
      /\b(healthy|unhealthy|sparse|abundant|plentiful|scarce|thriving|dwindling|endangered|stable|critical|low|high|many|few)\b/i;
    const save = newSave({ seed: 9, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const lines = everyLedgerLine(save.nodeStates, 1, "spring");
    // …including every line of every dex card, which is where the flag words live.
    for (const season of SEASONS) {
      for (const entry of buildDexEntries(content.species, season, balance)) {
        lines.push(...renderDexEntry(entry, regionalCount(save.nodeStates, entry.lineId)));
      }
    }
    for (const line of lines) {
      expect(BANDS.test(line), `Hard Req 2: band word instead of a number in "${line}"`).toBe(false);
    }
    expect(BANDS.test("Nibbin  healthy")).toBe(true); // the sweep binds
  });

  it("renders every shipped node against its own live state", () => {
    const save = newSave({ seed: 7, currentNode: "hearthollow", nodes: content.nodes }, balance);
    for (const file of content.nodes) {
      const state = save.nodeStates[file.id] as NodeState;
      const page = ledgerPageForSave(save, file.id, content);
      let total = 0;
      for (const row of page.rows) {
        expect(row.count).toBe(state.populations[row.lineId]?.count);
        total += row.count;
      }
      expect(page.totalIndividuals).toBe(total);
      expect(page.floraStock).toBe(state.floraStock);
    }
  });
});

describe("ledger — the trend across recent seasons", () => {
  it("the window is one year of seasons, derived from the clock (INV-3)", () => {
    expect(seasonsPerYear(balance)).toBe(balance.clock.ticksPerYear / balance.clock.ticksPerSeason);
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    let history: readonly LedgerSample[] = [];
    const seasons = balance.clock.seasonOrder;
    for (let i = 0; i < seasonsPerYear(balance) + 2; i += 1) {
      const season = seasons[i % seasons.length] as Season;
      history = recordSample(history, sampleNodeState(state, 1, season), balance);
    }
    expect(history.length).toBe(seasonsPerYear(balance));
  });

  it("renders the actual counts of each retained season, and the signed net", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    const history: LedgerSample[] = [8, 5, 2].map((count, i) => ({
      year: 1,
      season: (balance.clock.seasonOrder[i] ?? "spring") as Season,
      counts: { "skir-line": count },
      floraStock: state.floraStock,
    }));
    (state.populations["skir-line"] as { count: number }).count = 0;

    const page = buildLedgerPage({
      nodeId: MINI.id,
      region: miniRegion(state),
      species: content.species,
      balance,
      year: 1,
      season: "spring",
      history,
    });
    const skir = page.rows.find((r) => r.lineId === "skir-line");
    if (!skir) throw new Error("the ledger dropped a line that is in the state");
    expect(skir.trend).toEqual([8, 5, 2, 0]);
    expect(skir.delta).toBe(-8);
    expect(renderLedgerRow(skir)).toBe("Skir              0   30  0.100  8 5 2 0  net -8");
  });

  it("with no history the net is the no-value mark, never a fabricated slope", () => {
    const page = ledgerPageForSave(miniSave(), MINI.id, miniContent);
    for (const row of page.rows) {
      expect(row.delta).toBeNull();
      expect(row.trend).toEqual([row.count]);
      expect(renderLedgerRow(row)).toContain("net —");
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. A species at 0 — the number is 0, and its links read collapsed
 * ════════════════════════════════════════════════════════════════════════════ */

describe("web view — a population at 0", () => {
  function webFor(state: NodeState) {
    return buildWebPage({ file: MINI, state, species: content.species, balance, year: 1 });
  }

  it("derives the fixture's web live, with the counts on both ends of every link", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    expect(renderWebPage(webFor(state))).toEqual([
      "Mini Node — food web · year 1",
      "flora 45/100 · links 3 · collapsed 0",
      "[1] Nibbin 20/60",
      "[2] Skir 10/30",
      "[0] Loamunder 10/40",
      "[0] flora 45/100",
      "Nibbin 20 → Loamunder 10",
      "Nibbin 20 → flora 45",
      "Skir 10 → Nibbin 20",
    ]);
  });

  it("a predator at 0 renders as 0 and its link renders collapsed", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    (state.populations["skir-line"] as { count: number }).count = 0;

    const ledger = buildLedgerPage({
      nodeId: MINI.id,
      region: miniRegion(state),
      species: content.species,
      balance,
      year: 1,
      season: "spring",
    });
    const row = ledger.rows.find((r) => r.lineId === "skir-line");
    expect(row?.count).toBe(0);
    expect(row?.extinct).toBe(true);
    // The integer 0 — not a dash, not a word, not an empty cell.
    expect(renderLedgerRow(row!)).toBe("Skir              0   30  0.100  0  net —");
    expect(ledger.atZero).toBe(1);

    const page = webFor(state);
    const vertex = page.vertices.find((v) => v.id === "skir-line");
    expect(renderWebVertex(page, vertex!)).toBe("[2] Skir 0/30");
    const edge = page.edges.find((e) => e.predator === "skir-line");
    expect(edge?.collapsed).toBe(true);
    expect(edge?.reason).toBe("predator");
    expect(renderWebEdge(page, edge!)).toBe("Skir 0 → Nibbin 20  collapsed (predator)");
    expect(page.collapsedEdges).toBe(1);
  });

  it("a prey line at 0 collapses every link into AND out of it", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    (state.populations["nibbin-line"] as { count: number }).count = 0;
    const page = webFor(state);

    expect(page.collapsedEdges).toBe(3);
    expect(page.edges.map((e) => renderWebEdge(page, e))).toEqual([
      "Nibbin 0 → Loamunder 10  collapsed (predator)",
      "Nibbin 0 → flora 45  collapsed (predator)",
      "Skir 10 → Nibbin 0  collapsed (prey)",
    ]);
  });

  it("keeps the structural edge when a line is at 0 — the diagram shows what it used to eat", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    const live = webFor(state);
    (state.populations["skir-line"] as { count: number }).count = 0;
    const dead = webFor(state);
    expect(dead.edges.length).toBe(live.edges.length);
    expect(dead.vertices.length).toBe(live.vertices.length);
  });

  it("lays the diagram out as a pyramid: lower tiers lower on screen", () => {
    const page = webFor(miniSave().nodeStates[MINI.id] as NodeState);
    const layout = layoutWebPage(page, { x: 0, y: 0, width: 400, height: 200 });
    const y = (id: string): number => layout.positions.get(id)?.y ?? Number.NaN;
    expect(y("skir-line")).toBeLessThan(y("nibbin-line"));
    expect(y("nibbin-line")).toBeLessThan(y("loamunder-line"));
    expect(layout.tiers.length).toBe(page.maxDepth + 1);
    expect(layout.tiers[0]).toContain(FLORA_VERTEX);
    expect(layout.tiers[0]).toContain("loamunder-line");
  });

  it("a line at 0 keeps its place in its tier — the collapsed web is a hole, not a redraw", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    const box = { x: 0, y: 0, width: 400, height: 200 };
    const live = layoutWebPage(webFor(state), box);
    (state.populations["skir-line"] as { count: number }).count = 0;
    const dead = layoutWebPage(webFor(state), box);
    expect([...dead.positions.entries()]).toEqual([...live.positions.entries()]);
  });

  it("derives the web of every shipped node without inventing a vertex", () => {
    const save = newSave({ seed: 3, currentNode: "hearthollow", nodes: content.nodes }, balance);
    for (const file of content.nodes) {
      const state = save.nodeStates[file.id] as NodeState;
      const page = buildWebPage({ file, state, species: content.species, balance, year: 1 });
      for (const vertex of page.vertices) {
        if (vertex.isFlora) continue;
        expect(state.populations[vertex.id]).toBeDefined();
        expect(vertex.count).toBe(state.populations[vertex.id]?.count);
      }
      for (const edge of page.edges) {
        expect(page.vertices.some((v) => v.id === edge.predator)).toBe(true);
        expect(page.vertices.some((v) => v.id === edge.prey)).toBe(true);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. Hard Req 10 — the dex flags migrants dormant / migrating out of season
 * ════════════════════════════════════════════════════════════════════════════ */

describe("dex — Hard Req 10 seasonal legibility", () => {
  const migrants = content.species.filter((s) => s.seasonalWindow !== undefined);

  it("the content really does carry exactly the four migrants the requirement names", () => {
    expect(migrants.length).toBe(4);
  });

  it("an out-of-season migrant's entry reads dormant or migrating, in every season", () => {
    for (const line of migrants) {
      for (const season of balance.clock.seasonOrder) {
        const entries = buildDexEntries([line], season, balance);
        for (const entry of entries) {
          const text = renderDexSeasonStatus(entry);
          if (season === line.seasonalWindow) {
            expect(entry.active).toBe(true);
            expect(text).toBe(`active · window ${line.seasonalWindow}`);
          } else {
            expect(entry.active).toBe(false);
            expect(text).toMatch(/^(dormant|migrating) · window /);
            // The status the dex prints is the status the encounter roll computed — same call.
            expect(entry.dormantReason).toBe(migrantStatus(line, season, balance).dormantReason);
          }
        }
      }
    }
  });

  it("names the shoulder seasons migrating and the far season dormant", () => {
    const order = balance.clock.seasonOrder;
    for (const line of migrants) {
      const window = order.indexOf(line.seasonalWindow as Season);
      for (let i = 0; i < order.length; i += 1) {
        if (i === window) continue;
        const forward = (window - i + order.length) % order.length;
        const distance = Math.min(forward, order.length - forward);
        const entry = buildDexEntries([line], order[i] as Season, balance)[0];
        expect(renderDexSeasonStatus(entry!)).toContain(distance === 1 ? "migrating" : "dormant");
      }
    }
  });

  it("a non-migrant carries no seasonal flag at all — the flag has to MEAN something", () => {
    for (const line of content.species) {
      if (line.seasonalWindow !== undefined) continue;
      for (const season of balance.clock.seasonOrder) {
        for (const entry of buildDexEntries([line], season, balance)) {
          expect(entry.active).toBe(true);
          expect(renderDexSeasonStatus(entry)).toBe("");
        }
      }
    }
  });

  it("dormancy is never confusable with a crash: the flag is up while the count is not 0", () => {
    // The failure this guards is a player reading "not here in winter" as "I emptied this node".
    const save = newSave({ seed: 11, currentNode: "r1", nodes: content.nodes }, balance);
    const pollywisp = lineOf("pollywisp-line");
    const outOfSeason = balance.clock.seasonOrder.find((s) => s !== pollywisp.seasonalWindow) as Season;
    const entry = buildDexEntries([pollywisp], outOfSeason, balance)[0];
    expect(renderDexSeasonStatus(entry!)).toMatch(/dormant|migrating/);

    const state = save.nodeStates["r1"] as NodeState;
    const count = state.populations["pollywisp-line"]?.count ?? 0;
    expect(count).toBeGreaterThan(0);
    const row = buildLedgerPage({
      nodeId: "r1",
      region: regionOf(save),
      species: content.species,
      balance,
      year: 1,
      season: outOfSeason,
    }).rows.find((r) => r.lineId === "pollywisp-line");
    expect(row?.count).toBe(count);
    expect(row?.dormantReason).toBe(entry?.dormantReason);
    expect(renderLedgerRow(row!)).toContain(entry?.dormantReason as string);
  });

  it("prints the regional count beside the flag, summed live out of nodeStates", () => {
    const save = newSave({ seed: 13, currentNode: "r1", nodes: content.nodes }, balance);
    const pollywisp = lineOf("pollywisp-line");
    const outOfSeason = balance.clock.seasonOrder.find((s) => s !== pollywisp.seasonalWindow) as Season;
    const entry = buildDexEntries([pollywisp], outOfSeason, balance)[0] as ReturnType<
      typeof buildDexEntries
    >[number];

    const expected = content.nodes.reduce(
      (n, file) => n + (save.nodeStates[file.id]?.populations["pollywisp-line"]?.count ?? 0),
      0,
    );
    expect(regionalCount(save.nodeStates, "pollywisp-line")).toBe(expected);
    expect(expected).toBeGreaterThan(0);

    const lines = renderDexEntry(entry, regionalCount(save.nodeStates, "pollywisp-line"));
    expect(lines).toContain(`individuals in region ${expected}`);
    // Both readings are on the card at once: the word says why it is not here, the integer says
    // how many there are. Neither can be mistaken for the other.
    expect(lines[lines.length - 1]).toMatch(/^(dormant|migrating) · window /);

    // …and with no states the count line is simply absent rather than a guessed 0.
    expect(renderDexEntry(entry, null).some((l) => l.startsWith("individuals"))).toBe(false);
  });

  it("regionalCount follows the state it is given, and counts a wiped line as 0", () => {
    const save = newSave({ seed: 13, currentNode: "r1", nodes: content.nodes }, balance);
    for (const file of content.nodes) {
      const pop = save.nodeStates[file.id]?.populations["pollywisp-line"];
      if (pop) pop.count = 0;
    }
    expect(regionalCount(save.nodeStates, "pollywisp-line")).toBe(0);
  });

  it("covers every named dex identity, and asks for an asset id per identity", () => {
    const entries = buildDexEntries(content.species, "spring", balance);
    expect(entries.length).toBe(content.species.reduce((n, s) => n + s.dexIds.length, 0));
    for (const entry of entries) {
      expect(entry.artId).toBe(dexArtId(entry.dexId));
      // Distinct identities never share an art slot, or two entries would render the same picture.
      expect(entries.filter((e) => e.artId === entry.artId).length).toBe(
        entries.filter((e) => e.dexId === entry.dexId).length,
      );
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. bible §12 — the creature card's projected retirement year
 * ════════════════════════════════════════════════════════════════════════════ */

describe("summary card — the projected retirement year is core/lifecycle.ts's answer", () => {
  function cardFor(creature: OwnedCreature, currentYear: number) {
    return buildSummaryCard({
      creature,
      species: content.species,
      moves: content.moves.moves,
      balance,
      currentYear,
    });
  }

  it("matches the core computation for every line, age and year of the game", () => {
    for (const line of content.species) {
      for (const age of ["J", "A", "E"] as const) {
        for (let year = balance.clock.startYear; year < balance.clock.startYear + balance.clock.yearsTotal; year += 1) {
          const creature = newOwnedCreature(
            { uid: `${line.id}-${age}-${year}`, lineId: line.id, age, level: 5, caughtYear: year },
            line,
            balance,
          );
          const card = cardFor(creature, year);
          const expected = projectedRetirementYear(creature, year, line);
          if (expected === NEVER) {
            expect(card.projectedRetirementYear).toBeNull();
            expect(renderRetirementYear(card, balance)).toBe("retires: never");
          } else {
            expect(card.projectedRetirementYear).toBe(expected);
            expect(renderRetirementYear(card, balance)).toContain(`year ${expected}`);
          }
        }
      }
    }
  });

  it("stays right after a year passes — the projection is not the value stamped at catch", () => {
    const line = lineOf("nibbin-line");
    const creature = newOwnedCreature(
      { uid: "aged", lineId: line.id, age: "J", level: 5, caughtYear: 1 },
      line,
      balance,
    );
    // One year turn's worth of change, as core/lifecycle.ts applies it: year up, remainder down.
    const aged: OwnedCreature = { ...creature, yearsRemaining: creature.yearsRemaining - 1 };
    expect(cardFor(aged, 2).projectedRetirementYear).toBe(projectedRetirementYear(aged, 2, line));
    expect(cardFor(aged, 2).projectedRetirementYear).toBe(cardFor(creature, 1).projectedRetirementYear);
  });

  it("an Ancient never retires, and says so rather than printing a year", () => {
    const ancient = content.species.find((s) => s.ancient) as SpeciesLine;
    const creature = newOwnedCreature(
      { uid: "ancient", lineId: ancient.id, age: "E", level: 30, caughtYear: 6 },
      ancient,
      balance,
    );
    const card = cardFor(creature, 6);
    expect(card.ancient).toBe(true);
    expect(card.projectedRetirementYear).toBeNull();
    expect(card.yearsRemaining).toBeNull();
    expect(renderRetirementYear(card, balance)).toBe("retires: never");
  });

  it("a projection past the final year keeps the number and says it is past the end", () => {
    const line = lineOf("nibbin-line");
    const lastYear = balance.clock.startYear + balance.clock.yearsTotal - 1;
    const creature = newOwnedCreature(
      { uid: "heir", lineId: line.id, age: "J", level: 8, caughtYear: lastYear },
      line,
      balance,
    );
    expect(retiresBeyondFinalYear(creature, balance)).toBe(true);
    const card = cardFor(creature, lastYear);
    expect(card.beyondFinalYear).toBe(true);
    const text = renderRetirementYear(card, balance);
    expect(text).toContain(`year ${card.projectedRetirementYear}`);
    expect(text).toContain(`(past year ${lastYear})`);
  });

  it("renders the rest of the card: age class, traits, relic slot and moves", () => {
    const line = lineOf("nibbin-line");
    const trait = balance.traits.pool[0];
    if (!trait) throw new Error("balance.json ships no trait pool");
    const creature: OwnedCreature = {
      ...newOwnedCreature(
        {
          uid: "card",
          lineId: line.id,
          age: "A",
          level: balance.moves.slotUnlockLevels.utility,
          caughtYear: 2,
          traits: [trait],
          relicSlot: "relic-a",
          nickname: "Pip",
        },
        line,
        balance,
      ),
    };
    const card = cardFor(creature, 2);
    expect(card.age).toBe("A");
    expect(card.moves.length).toBe(4); // all four slots unlocked at the utility level
    expect(card.moves.map((m) => m.id)).toEqual([
      line.movePool.type1,
      line.movePool.type2,
      line.movePool.role,
      line.movePool.utility,
    ]);
    for (const move of card.moves) {
      expect(move.name).toBe(content.moves.moves.find((m) => m.id === move.id)?.name);
    }

    const lines = renderSummaryCard(card, balance);
    expect(lines[0]).toBe(`Pip (${line.formNames.A}) — Lv ${creature.level} · A`);
    expect(lines[2]).toBe(renderRetirementYear(card, balance));
    expect(lines).toContain(`traits: ${trait.name} ${trait.direction === "up" ? "+" : "-"}${trait.stat}`);
    expect(lines).toContain("relic: relic-a");
    expect(lines.some((l) => l.startsWith("moves: "))).toBe(true);
    // Every stat is a number on the card, not a bar.
    const stats = lines.find((l) => l.startsWith("hp ")) as string;
    for (const key of ["hp", "atk", "def", "spd", "ins"] as const) {
      expect(stats).toContain(`${key} ${card.stats[key]}`);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. The epilogue reuses this renderer (build-doc §4 step 6 / Hard Req 7)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("epilogue reuse — the same renderer over a different state", () => {
  it("renders a projected region with no special case, and the numbers move", () => {
    const save = newSave({ seed: 42, currentNode: "r1", nodes: content.nodes }, balance);
    const before = renderLedgerPage(ledgerPageForSave(save, "r1", content));

    const projected = stepRegionStates(content.nodes, save.nodeStates, "spring", createRng(42)).states;
    const file = content.nodes.find((n) => n.id === "r1") as NodeFile;
    const after = renderLedgerPage(
      buildLedgerPage({
        nodeId: "r1",
        region: { files: content.nodes, states: projected },
        species: content.species,
        balance,
        year: 2,
        season: "spring",
      }),
    );

    expect(after).not.toEqual(before);
    expect(after[0]).toBe(`${file.name} — year 2 · spring`);
    // Nothing about the epilogue path differs: same rows, same columns, read off a NodeState.
    expect(after.length).toBe(before.length);

    // …and the LINE ITSELF is read, not just the array's shape. This test used to assert only
    // `after !== before`, `after[0]` and the length — which is how a totals line reading
    // "flora 85.00425531914894/100 · recent deaths 1.2085106382978723 · …" passed through it at 99
    // characters on a 480px canvas, with `individuals` and `at 0` clipped off the right edge.
    const totals = after[1] as string;
    expect(totals).toMatch(
      /^flora \d+(\.\d)?\/\d+ · recent deaths \d+(\.\d)? · lines \d+ · individuals \d+ · at 0: \d+$/,
    );
    expect(totals.length).toBeLessThanOrEqual(columnBudget(balance, SCREEN_TEXT.padPx));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6. G7 — no moralizing copy about catching, anywhere these screens can print
 * ════════════════════════════════════════════════════════════════════════════ */

describe("G7 — the ledger is the moral, and it is numbers", () => {
  const JUDGMENT =
    /\b(shame|ashamed|guilt|guilty|cruel|greed|greedy|remorse|regret|sorry|mercy|merciless|wicked|evil|sin|blame|selfish|ruthless|deserve|should have|too many|slaughter|massacre)\b/i;

  function everyRenderedString(): string[] {
    const out: string[] = [];
    const save = newSave({ seed: 5, currentNode: "hearthollow", nodes: content.nodes }, balance);
    for (const file of content.nodes) {
      const state = save.nodeStates[file.id] as NodeState;
      out.push(...renderLedgerPage(ledgerPageForSave(save, file.id, content)));
      out.push(...renderWebPage(buildWebPage({ file, state, species: content.species, balance, year: 1 })));
    }
    for (const season of balance.clock.seasonOrder) {
      for (const entry of buildDexEntries(content.species, season, balance)) {
        // The WHOLE card, not just its seasonal flag — the gate flag and the "all forms" qualifier
        // are copy this sweep exists to police too.
        out.push(...renderDexEntry(entry, regionalCount(save.nodeStates, entry.lineId)));
      }
    }
    for (const line of content.species) {
      const creature = newOwnedCreature(
        { uid: `g7-${line.id}`, lineId: line.id, age: "A", level: 20, caughtYear: 1 },
        line,
        balance,
      );
      out.push(
        ...renderSummaryCard(
          buildSummaryCard({ creature, species: content.species, moves: content.moves.moves, balance, currentYear: 1 }),
          balance,
        ),
      );
    }
    return out;
  }

  it("no rendered line judges the player", () => {
    for (const line of everyRenderedString()) {
      expect(JUDGMENT.test(line), `G7 violation in rendered copy: "${line}"`).toBe(false);
    }
  });

  it("BINDS — the sweep would catch a moralizing line if one were added", () => {
    expect(JUDGMENT.test("you should have left them alone")).toBe(true);
    expect(JUDGMENT.test("flora 45/100 · recent deaths 0 · lines 3 · individuals 40 · at 0: 0")).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 7. The screens under a state the sim has actually stepped
 *
 * Everything above this line renders a `newSave` state or the mini fixture, and both of those carry
 * hand-written integers. That is exactly how the defects below survived a green suite: `floraStock`
 * and `recentDeaths` are `z.number()` in core, and the moment ONE season steps they stop being
 * integers. So this section renders states that have been through `stepRegionStates`, and asserts
 * the things a fixture can never fail: the width of a line, the precision of a number, and the
 * agreement between what the screen prints and what the sim uses.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("stepped states — what a fixture save can never catch", () => {
  /** Text drawn at the left pad has the whole canvas less one pad on the right. */
  const LEDGER_COLS = columnBudget(balance, SCREEN_TEXT.padPx);

  it("the budget is the real canvas, not a number invented here", () => {
    expect(LEDGER_COLS).toBe(
      Math.floor((balance.map.virtualWidth - SCREEN_TEXT.padPx * 2) / SCREEN_TEXT.advancePx),
    );
    expect(balance.map.virtualWidth).toBeGreaterThan(0);
  });

  it("no rendered line overruns the canvas — fresh, stepped, or a full year of history", () => {
    const fresh = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const cases: string[][] = [everyLedgerLine(fresh.nodeStates, 1, "spring")];
    // One season in (the state the totals line first became 99 characters wide at) and a full
    // six-year run (24 season steps), where every populated node overflowed.
    for (const steps of [1, 4, 24]) {
      const run = steppedRegion(12, steps);
      cases.push(everyLedgerLine(run.states, 1 + Math.floor(steps / SEASONS.length), "spring", run.histories));
    }
    const over = cases.flat().filter((line) => line.length > LEDGER_COLS);
    expect(over, `lines wider than the ${LEDGER_COLS}-column canvas:\n${over.join("\n")}`).toEqual([]);
  });

  it("BINDS — the width sweep catches a line one character too long", () => {
    const tooLong = "x".repeat(LEDGER_COLS + 1);
    expect(tooLong.length > LEDGER_COLS).toBe(true);
  });

  it("no rendered line carries a raw float", () => {
    // The failure in one regex: `88.87983002626036`. Nothing these screens print needs more
    // precision than the breed column's, and anything that does is a number that escaped formatting.
    const LONG_FLOAT = /\d+\.\d{4,}/;
    const run = steppedRegion(7, 8);
    const lines = [
      ...everyLedgerLine(run.states, 3, "spring", run.histories),
      ...content.species.flatMap((line) =>
        SEASONS.flatMap((season) =>
          buildDexEntries([line], season, balance).flatMap((e) =>
            renderDexEntry(e, regionalCount(run.states, e.lineId)),
          ),
        ),
      ),
    ];
    const bad = lines.filter((l) => LONG_FLOAT.test(l));
    expect(bad, `raw floats on screen:\n${bad.join("\n")}`).toEqual([]);
    expect(LONG_FLOAT.test("flora 88.87983002626036/100")).toBe(true); // the sweep binds
  });

  it("renderNumber keeps integers whole and bounds the reals", () => {
    expect(renderNumber(45)).toBe("45");
    expect(renderNumber(0)).toBe("0");
    expect(renderNumber(100)).toBe("100");
    expect(renderNumber(88.87983002626036)).toBe("88.9");
    expect(renderNumber(1.7724791058738372)).toBe("1.8");
  });

  it("shortening a real value never invents a zero or a ceiling", () => {
    // Both measured on the shipped path: `renderNumber(99.95)` printed "100.0" —
    // `balance.ecosim.floraMax`, the cap the node had NOT reached — and `renderNumber(0.04)`
    // printed "0.0", which is this screen's word for gone, for a `recentDeaths` that §7.2 makes the
    // live Scavenger encounter multiplier. Neither is a rounding taste; both are a screen asserting
    // a state the save does not hold.
    expect(renderNumber(99.95)).toBe("99.9");
    expect(Number(renderNumber(99.95))).toBeLessThan(balance.ecosim.floraMax);
    expect(renderNumber(0.04)).toBe("0.04");
    expect(renderNumber(-0.04)).toBe("-0.04");

    // …and both hold as LAWS over the range, not just at the two measured points. Accuracy is not
    // sacrificed to get them: shortening still rounds everywhere the carry does not cross an
    // integer, so 43.099999999999994 reads 43.1 rather than 43.0.
    expect(renderNumber(43.099999999999994)).toBe("43.1");
    const samples: number[] = [];
    for (let i = 1; i <= 4000; i += 1) {
      samples.push(i / 41.7, balance.ecosim.floraMax - i / 4001, i / 97531);
    }
    for (const value of samples) {
      const text = renderNumber(value);
      const shown = Number(text);
      expect(shown, `${value} rendered as ${text}`).toBeGreaterThan(0);
      expect(Math.trunc(shown), `${value} rendered as ${text} crossed an integer`).toBe(
        Math.trunc(value),
      );
      // Half a unit of the last place everywhere the carry does not cross an integer, one full
      // unit where it does — that gap IS the trade: a stock 0.00025 below its cap reads 99.9
      // rather than 100.0, because printing the cap is the worse of the two errors by far.
      const crosses = Math.trunc(Number(value.toFixed(1))) !== Math.trunc(value);
      expect(Math.abs(shown - value), `${value} rendered as ${text}`).toBeLessThan(
        crosses ? 0.1 : 0.05,
      );
    }
    // A value too small for any fixed number of decimals is printed as a number, never as 0.
    expect(renderNumber(1e-9)).toBe("1.0e-9");
    expect(Number(renderNumber(1e-9))).toBe(1e-9);
  });

  it("a rate that is small but not zero never borrows the spelling of a suppressed one", () => {
    // `0.000` in the breed column is what a line whose births the sim SUPPRESSED reads, so a rate
    // that merely rounds to it is a breeding line drawn as a dead one. `(0.0004).toFixed(3)` is
    // "0.000". The shipped clamps keep rates above that today, which is exactly why it would have
    // gone unnoticed after a retune.
    expect(renderRate(0)).toBe("0.000");
    expect(renderRate(0.0004)).toBe("0.0004");
    expect(renderRate(0.045)).toBe("0.045");
    expect(renderRate(0.049999999999999996)).toBe("0.050");
    expect(Number(renderRate(1e-9))).toBeGreaterThan(0);
    for (let i = 1; i <= 3000; i += 1) {
      const rate = i / 3_000_000;
      expect(Number(renderRate(rate)), `${rate} rendered as ${renderRate(rate)}`).toBeGreaterThan(0);
    }
  });

  it("the diagram's labels stay on the canvas, at the positions the scene draws them", () => {
    const run = steppedRegion(12, 4);
    const box = webDiagramBox(balance);
    for (const file of content.nodes) {
      const state = run.states[file.id];
      if (!state) continue;
      const page = buildWebPage({ file, state, species: content.species, balance, year: 2 });
      const layout = layoutWebPage(page, box);
      for (const label of webVertexLabels(page, layout, balance)) {
        const half = (label.text.length * SCREEN_TEXT.advancePx) / 2;
        expect(label.x - half, `${file.id} ${label.id} "${label.text}" left`).toBeGreaterThanOrEqual(0);
        expect(label.x + half, `${file.id} ${label.id} "${label.text}" right`).toBeLessThanOrEqual(
          balance.map.virtualWidth,
        );
      }
    }
  });

  it("every populated node still renders every one of its lines after a six-year run", () => {
    const run = steppedRegion(12, 24);
    for (const file of content.nodes) {
      const state = run.states[file.id];
      if (!state) continue;
      const page = buildLedgerPage({
        nodeId: file.id,
        region: { files: content.nodes, states: run.states },
        species: content.species,
        balance,
        year: 6,
        season: "winter",
      });
      expect(page.rows.length).toBe(Object.keys(state.populations).length);
      for (const row of page.rows) expect(row.count).toBe(state.populations[row.lineId]?.count);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 8. The `breed` column is the rate the SIM uses (Hard Req 2: real numbers, never proxies)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("breed rate — the number on the row is the number driving the sim", () => {
  /** The sim's own account of the season it is about to run, per node. */
  function reportsFor(states: Record<string, NodeState>, season: Season, seed: number) {
    return stepRegionStates(content.nodes, states, season, createRng(seed)).reports;
  }

  it("the rate on the row times the count IS the sim's own births, at every node and season", () => {
    /*
     * WHAT THIS ASSERTION USED TO BE, AND WHY IT CHANGED.
     *
     *   // §7.3 step 1: births = count × breedRate × foodFactor × presenceMult. The rate the line
     *   // breeds at is the two factors that are not about food.
     *   expect(row.breedRate).toBeCloseTo(species.breedRate * species.presenceMult, 12);
     *
     * It quoted core/ecosim.ts §7.3 step 1's four-factor product and then asserted a two-factor
     * one, which is the defect it was written to catch, blessed as the contract. Measured against
     * the UNTOUCHED shipped year-1 state: 34 rows across 10 nodes where the ledger's `breed` column
     * was not the number the sim uses, in both directions (hearthollow nibbin 0.060 shown vs 0.075
     * used; cindershelf stonewing 0.030 shown vs 0.020 used). During the cascade beat at r4 it
     * printed a starving apex breeding at its RAISED rate (0.045→0.056) in the season the sim gave
     * it zero births and 4.2 starvation deaths. `LedgerRow.breedRate` is documented as "the rate
     * this line will actually breed at this season", and Hard Req 2 asks for the real number.
     *
     * What replaces it is stronger than the four-factor product, because it does not restate the
     * formula at all: the row's rate times the row's count must BE the births core reports. That
     * catches a dropped factor, a wrong factor, a missed starvation cut-off and a future fifth
     * term, and it cannot be satisfied by copying whatever the renderer happens to compute.
     */
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const region: LedgerRegion = regionOf(save);
    let lifted = 0;
    let starved = 0;
    let foodMoved = 0;
    for (const season of SEASONS) {
      const reports = reportsFor(save.nodeStates, season, 12);
      for (const report of reports) {
        const page = buildLedgerPage({
          nodeId: report.nodeId,
          region,
          species: content.species,
          balance,
          year: 1,
          season,
        });
        for (const species of report.species) {
          const row = page.rows.find((r) => r.lineId === species.lineId);
          if (!row) throw new Error(`the ledger dropped ${species.lineId} at ${report.nodeId}`);
          const where = `${report.nodeId}/${species.lineId} in ${season}`;
          expect(row.count * row.breedRate, `${where}: rate × count is not the sim's births`).toBeCloseTo(
            species.births,
            10,
          );
          // …and the three parts the row carries are core's own, not a re-derivation.
          expect(row.foodFactor, where).toBe(species.foodFactor);
          expect(row.starving, where).toBe(species.starving);
          expect(row.presenceBreedRate, where).toBeCloseTo(
            species.breedRate * species.presenceMult,
            12,
          );
          // A starving line gets NO births, so the rate in force is 0 — not its highest ever.
          if (species.starving && row.count > 0) {
            starved += 1;
            expect(row.breedRate, `${where}: starving line still shows a rate`).toBe(0);
          }
          if (row.presenceBreedRate !== row.baseBreedRate) lifted += 1;
          if (row.breedRate !== row.presenceBreedRate) foodMoved += 1;
        }
      }
    }
    // The shipped state really does exercise all three cases — otherwise this test would pass just
    // as well against the defects it exists to catch.
    expect(lifted).toBe(11 * SEASONS.length); // Ancients in range
    expect(foodMoved).toBeGreaterThan(0); // food moving the rate with no Ancient involved
    expect(starved).toBe(0); // …and the shipped year-1 state starves nothing (see the r4 test below)
  });

  it("BINDS — a starving line's rate is 0 on the row, in the season the sim suppresses its births", () => {
    // The never-cut cascade beat, reproduced: catch r4's prey line to 0 and its predator starves.
    // Before the fix this row read `0.045→0.056` — a RAISED rate — in the same season the sim gave
    // it zero births and 4.2 starvation deaths.
    const save = newSave({ seed: 12, currentNode: "r4", nodes: content.nodes }, balance);
    const state = save.nodeStates["r4"] as NodeState;
    (state.populations["ashvole-line"] as { count: number }).count = 0;

    const report = reportsFor(save.nodeStates, "spring", 4).find((r) => r.nodeId === "r4");
    const apex = report?.species.find((s) => s.lineId === "pyrelisk-line");
    if (!apex) throw new Error("r4 no longer carries the cascade's apex line");
    expect(apex.starving).toBe(true);
    expect(apex.births).toBe(0);

    const page = buildLedgerPage({
      nodeId: "r4",
      region: regionOf(save),
      species: content.species,
      balance,
      year: 1,
      season: "spring",
    });
    const row = page.rows.find((r) => r.lineId === "pyrelisk-line");
    if (!row) throw new Error("the ledger dropped the apex line");
    expect(row.count).toBeGreaterThan(0);
    expect(row.starving).toBe(true);
    expect(row.breedRate).toBe(0);
    // …and it reaches the glyphs a player reads, as a number, falling.
    expect(renderLedgerRow(row)).toContain(`${row.baseBreedRate.toFixed(3)}→0.000`);
  });

  it("the lifted rows are exactly the ones with an Ancient in range, and the row shows both numbers", () => {
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const idx = indexSpecies([...content.species]);
    const nodes = content.nodes.map((f) => fromNodeState(f, save.nodeStates[f.id] as NodeState));
    const presence = derivePresence(nodes, idx, balance, ecoConstants(balance));

    for (const file of content.nodes) {
      const page = buildLedgerPage({
        nodeId: file.id,
        region: regionOf(save),
        species: content.species,
        balance,
        year: 1,
        season: "spring",
      });
      const hasAncientInRange = (presence[file.id]?.sources.length ?? 0) > 0;
      // WAS `r.breedRate !== r.baseBreedRate`. `breedRate` is now the rate the sim USES — food
      // folded in — so it moves with no Ancient anywhere and that predicate no longer means "an
      // Ancient is in range". `presenceBreedRate` is the field that does, and the claim being
      // asserted (only an Ancient lifts the stored rate) is unchanged and still exact.
      const lifted = page.rows.filter((r) => r.presenceBreedRate !== r.baseBreedRate);
      if (!hasAncientInRange) expect(lifted.length).toBe(0);
      for (const row of page.rows) {
        // Both numbers on the row: what it breeds at alone, and what it breeds at now.
        const shown = renderLedgerRow(row);
        if (row.breedRate.toFixed(3) === row.baseBreedRate.toFixed(3)) {
          expect(shown, `${row.lineId} draws an arrow between one number and itself`).not.toContain("→");
        } else {
          expect(shown).toContain(`${row.baseBreedRate.toFixed(3)}→${row.breedRate.toFixed(3)}`);
        }
      }
      // …and the page names who is doing it, from derivePresence's own `sources`.
      expect(page.presenceSources.length).toBe(presence[file.id]?.sources.length ?? 0);
      expect(renderLedgerPresence(page)).toBe(
        page.presenceSources.length > 0 ? `presence: ${page.presenceSources.join(", ")}` : `presence: ${NO_PRESENCE}`,
      );
    }
  });

  it("BINDS — catching the Ancient drops the rates back and empties the presence line (Hard Req 7)", () => {
    const save = newSave({ seed: 12, currentNode: "brackwater", nodes: content.nodes }, balance);
    const region = regionOf(save);
    const args = {
      nodeId: "brackwater",
      region,
      species: content.species,
      balance,
      year: 1,
      season: "spring" as Season,
    };
    const before = buildLedgerPage(args);
    expect(before.presenceSources.length).toBeGreaterThan(0);
    const liftedBefore = before.rows.filter((r) => r.presenceBreedRate !== r.baseBreedRate);
    expect(liftedBefore.length).toBeGreaterThan(0);

    // The Ancient's own count IS the switch (core/ecosim.ts derivePresence: "caught or gone — the
    // buff goes with it"). Nothing else about the region changes.
    for (const nodeId of Object.keys(save.nodeStates)) {
      const pop = save.nodeStates[nodeId]?.populations["undermere-line"];
      if (pop) pop.count = 0;
    }
    const after = buildLedgerPage(args);
    expect(after.presenceSources).toEqual([]);
    expect(renderLedgerPresence(after)).toBe(`presence: ${NO_PRESENCE}`);
    // WAS `expect(row.breedRate).toBe(row.baseBreedRate)` + `not.toContain("→")`. The claim being
    // asserted — the Ancient's lift is gone from every rate — is unchanged and still exact; it now
    // names the field that carries the lift, because `breedRate` also carries the food term and
    // brackwater's is not 1. The second half asserts the thing Hard Req 7 is actually about: the
    // number on screen MOVED, and every row moved down.
    for (const row of after.rows) {
      expect(row.presenceBreedRate).toBe(row.baseBreedRate);
    }
    let moved = 0;
    for (const row of before.rows) {
      const now = after.rows.find((r) => r.lineId === row.lineId);
      if (!now) throw new Error(`the ledger dropped ${row.lineId} when the Ancient was caught`);
      if (now.breedRate !== row.breedRate) {
        moved += 1;
        expect(now.breedRate, `${row.lineId} did not fall when the Ancient was caught`).toBeLessThan(
          row.breedRate,
        );
      }
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("the answer does not depend on the throwaway seed the projection is run with", () => {
    // `effectiveRates` runs core's own `step` to get the rate and discards the projected counts.
    // That is only honest if the two report fields it reads are computed before the generator is
    // touched — so the same call at two unrelated seeds must land on the same rates.
    const save = newSave({ seed: 3, currentNode: "cindershelf", nodes: content.nodes }, balance);
    const region = regionOf(save);
    const base = { region, species: content.species, balance, season: "autumn" as Season };
    for (const file of content.nodes) {
      const a = effectiveRates({ ...base, nodeId: file.id });
      const b = effectiveRates({ ...base, nodeId: file.id });
      expect([...a.rates.entries()]).toEqual([...b.rates.entries()]);
      expect(a.presenceSources).toEqual(b.presenceSources);
    }
    // …and against a different balance seed, which is the value the projection is seeded from.
    const retuned = { ...balance, rng: { ...balance.rng, defaultSeed: balance.rng.defaultSeed + 1 } };
    const shipped = effectiveRates({ ...base, nodeId: "cindershelf" });
    const other = effectiveRates({ ...base, nodeId: "cindershelf", balance: retuned });
    expect([...other.rates.entries()]).toEqual([...shipped.rates.entries()]);
  });

  it("a page cannot be built from a state detached from its region", () => {
    // The defect was structural: a page built from one NodeState cannot know its own breed rates,
    // because §7.3 step 1's presence effects are a fact about the node GRAPH. So there is no way to
    // ask for one.
    const save = newSave({ seed: 5, currentNode: "r2", nodes: content.nodes }, balance);
    expect(() =>
      buildLedgerPage({
        nodeId: "r2",
        region: { files: content.nodes, states: { r2: save.nodeStates["r2"] as NodeState } },
        species: content.species,
        balance,
        year: 1,
        season: "spring",
      }),
    ).not.toThrow();
    expect(() =>
      buildLedgerPage({
        nodeId: "nowhere",
        region: regionOf(save),
        species: content.species,
        balance,
        year: 1,
        season: "spring",
      }),
    ).toThrow(/nowhere/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 9. The trend column renders the window it documents, once
 * ════════════════════════════════════════════════════════════════════════════ */

describe("trend — one reading per season, and the live one only once", () => {
  it("under the documented wiring the live count is not printed twice", () => {
    // "whoever runs the season step records a sample" — so the newest sample IS the current state.
    // Appending the live count beside it rendered 5 readings for a 4-season window and ended every
    // trend with a flat step that no season produced.
    const run = steppedRegion(12, SEASONS.length);
    const season = SEASONS[SEASONS.length - 1] as Season;
    const page = buildLedgerPage({
      nodeId: "hearthollow",
      region: { files: content.nodes, states: run.states },
      species: content.species,
      balance,
      year: 1,
      season,
      history: run.histories["hearthollow"] as LedgerSample[],
    });
    expect((run.histories["hearthollow"] as LedgerSample[]).length).toBe(seasonsPerYear(balance));
    for (const row of page.rows) {
      expect(row.trend.length).toBeLessThanOrEqual(seasonsPerYear(balance));
      expect(row.trend[row.trend.length - 1]).toBe(row.count);
      // The last two readings are the last two SEASONS, so they agree only if the season was flat.
      const sample = (run.histories["hearthollow"] as LedgerSample[]).slice(-2)[0]?.counts[row.lineId];
      if (typeof sample === "number") expect(row.trend[row.trend.length - 2]).toBe(sample);
    }
  });

  it("never renders more numbers than recordSample keeps, however many are fed in", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    let history: readonly LedgerSample[] = [];
    for (let i = 0; i < seasonsPerYear(balance) * 3; i += 1) {
      const season = SEASONS[i % SEASONS.length] as Season;
      history = recordSample(history, sampleNodeState(state, 1, season), balance);
    }
    expect(history.length).toBe(seasonsPerYear(balance));
    const page = buildLedgerPage({
      nodeId: MINI.id,
      region: miniRegion(state),
      species: content.species,
      balance,
      year: 1,
      // The season the newest sample was taken in — the boundary case that used to duplicate.
      season: history[history.length - 1]?.season as Season,
      history,
    });
    for (const row of page.rows) {
      expect(row.trend.length).toBe(seasonsPerYear(balance));
      expect(row.trend[row.trend.length - 1]).toBe(row.count);
    }
  });

  it("a sample from an EARLIER season is kept as its own reading, not overwritten", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    const history: LedgerSample[] = [
      { year: 1, season: SEASONS[0] as Season, counts: { "skir-line": 9 }, floraStock: 45 },
      { year: 1, season: SEASONS[1] as Season, counts: { "skir-line": 7 }, floraStock: 45 },
    ];
    const page = buildLedgerPage({
      nodeId: MINI.id,
      region: miniRegion(state),
      species: content.species,
      balance,
      year: 1,
      season: SEASONS[2] as Season,
      history,
    });
    const skir = page.rows.find((r) => r.lineId === "skir-line");
    expect(skir?.trend).toEqual([9, 7, skir?.count]);
    expect(skir?.delta).toBe((skir?.count ?? 0) - 9);
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * …and the wiring that makes the column exist at all in the running game.
   *
   * The trend was DEAD on every screen: `recordSample` / `sampleNodeState` had no caller outside
   * this file, and the one launcher that opens `LedgerScene` passed no `histories`, so every row in
   * play and in the epilogue rendered one number and `net —` forever. Everything above this point
   * was green throughout, because every test above hands the history in by hand. So these drive the
   * REAL path: the store, the seam it hangs off, and the scene data the menu builds.
   * ────────────────────────────────────────────────────────────────────────── */

  it("adopting a save takes a reading, once per season and not once per catch", () => {
    registry.reset();
    registry.setContent(content);
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    registry.startSession({ slot: 1, save, streams: openStreams(save, balance) });

    // The run's opening season is its first reading, so a trend starts the moment a game does.
    expect(ledgerHistory.stamp()).toBe(`1/${seasonAt(save.tick, balance)}`);
    const opening = ledgerHistory.historyFor("hearthollow");
    expect(opening.length).toBe(1);
    expect(opening[0]?.counts["nibbin-line"]).toBe(
      save.nodeStates["hearthollow"]?.populations["nibbin-line"]?.count,
    );

    // A catch adopts a new save inside the same season. It must NOT add a reading — one reading per
    // season is what the trend column's window means (`recordSample` keeps `seasonsPerYear`).
    const caught = JSON.parse(JSON.stringify(save)) as typeof save;
    (caught.nodeStates["hearthollow"]?.populations["nibbin-line"] as { count: number }).count -= 1;
    registry.setSave(caught);
    expect(ledgerHistory.historyFor("hearthollow").length).toBe(1);

    // A season boundary does.
    const seasons = balance.clock.seasonOrder;
    const stepped = {
      ...caught,
      tick: balance.clock.ticksPerSeason,
      nodeStates: stepRegionStates(content.nodes, caught.nodeStates, seasons[0] as Season, createRng(12))
        .states,
    };
    registry.setSave(stepped);
    const history = ledgerHistory.historyFor("hearthollow");
    expect(history.length).toBe(2);
    expect(history[0]?.season).toBe(seasons[0]);
    expect(history[1]?.season).toBe(seasonAt(stepped.tick, balance));
    // …and the second reading is the state AFTER the step, including the caught animal.
    expect(history[1]?.counts["nibbin-line"]).toBe(
      stepped.nodeStates["hearthollow"]?.populations["nibbin-line"]?.count,
    );

    // Which is a real trend on a real row: two numbers and a signed net, not `net —`.
    const page = buildLedgerPage({
      nodeId: "hearthollow",
      region: { files: content.nodes, states: stepped.nodeStates },
      species: content.species,
      balance,
      year: stepped.year,
      season: seasonAt(stepped.tick, balance),
      history,
    });
    for (const row of page.rows) {
      expect(row.trend.length).toBe(2);
      expect(row.delta).not.toBeNull();
      expect(renderLedgerRow(row)).not.toContain(`net ${NO_VALUE}`);
    }
    registry.reset();
  });

  it("a new run does not inherit the last run's readings", () => {
    registry.reset();
    registry.setContent(content);
    const first = newSave({ seed: 1, currentNode: "hearthollow", nodes: content.nodes }, balance);
    registry.startSession({ slot: 1, save: first, streams: openStreams(first, balance) });
    registry.setSave({ ...first, tick: balance.clock.ticksPerSeason });
    expect(ledgerHistory.historyFor("hearthollow").length).toBe(2);

    const second = newSave({ seed: 2, currentNode: "hearthollow", nodes: content.nodes }, balance);
    registry.startSession({ slot: 2, save: second, streams: openStreams(second, balance) });
    expect(ledgerHistory.historyFor("hearthollow").length).toBe(1);
    registry.reset();
    expect(ledgerHistory.historyFor("hearthollow")).toEqual([]);
  });

  it("the record handed to the scene is the LIVE one, not a copy taken when the menu opened", () => {
    // `LedgerScene` reads `this.args.histories?.[nodeId]` on every redraw and Phaser does not re-run
    // `init` on wake, so a copy would freeze the trend at whatever it held when the menu was opened.
    registry.reset();
    registry.setContent(content);
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    registry.startSession({ slot: 1, save, streams: openStreams(save, balance) });
    const handedOver = ledgerHistory.histories();
    expect(handedOver["hearthollow"]?.length).toBe(1);
    registry.setSave({ ...save, tick: balance.clock.ticksPerSeason });
    expect(handedOver["hearthollow"]?.length).toBe(2);
    registry.reset();
  });

  it("the live count REPLACES the newest sample when it is the same reading", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    const skirPop = state.populations["skir-line"] as { count: number };
    const history: LedgerSample[] = [
      { year: 1, season: SEASONS[0] as Season, counts: { "skir-line": 9 }, floraStock: 45 },
      { year: 1, season: SEASONS[1] as Season, counts: { "skir-line": skirPop.count }, floraStock: 45 },
    ];
    // A catch after the sample was taken: the reading for THIS season is the live number, and the
    // trend must show one reading for this season, not two.
    skirPop.count -= 3;
    const page = buildLedgerPage({
      nodeId: MINI.id,
      region: miniRegion(state),
      species: content.species,
      balance,
      year: 1,
      season: SEASONS[1] as Season,
      history,
    });
    const skir = page.rows.find((r) => r.lineId === "skir-line");
    expect(skir?.trend).toEqual([9, skirPop.count]);
    expect(skir?.delta).toBe(skirPop.count - 9);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 9a. Hard Req 10, BOTH directions
 *
 * bible §5 closes one of them: "seasonal absence is never confusable with a population crash", so a
 * migrant out of its window says `dormant` / `migrating` beside its real count. The reverse was
 * open, and it is the one the demo depends on: a migrant caught to 0 rendered
 * `Reedrick 0 72 0.060 0 net —  migrating`, and the seasonal word sat immediately after the 0 as
 * its explanation. A count never moves for a seasonal reason, so beside a 0 that word can only be a
 * false one — a crash the player caused, reading as the calendar.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ledger — a seasonal word never stands in front of a real 0", () => {
  const region = (states: Record<string, NodeState>): LedgerRegion => ({ files: content.nodes, states });
  function rowFor(states: Record<string, NodeState>, nodeId: string, lineId: string, season: Season) {
    const page = buildLedgerPage({
      nodeId,
      region: region(states),
      species: content.species,
      balance,
      year: 1,
      season,
    });
    const row = page.rows.find((r) => r.lineId === lineId);
    if (!row) throw new Error(`the ledger dropped ${lineId} at ${nodeId}`);
    return row;
  }

  /** Every node that carries one of the four migrants, with the line id. */
  const migrantSites: Array<[string, string]> = [];
  {
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    for (const line of content.species) {
      if (!line.seasonalWindow) continue;
      for (const file of content.nodes) {
        if (save.nodeStates[file.id]?.populations[line.id]) migrantSites.push([file.id, line.id]);
      }
    }
  }

  it("the shipped content really does put migrants where this can happen", () => {
    expect(migrantSites.length).toBeGreaterThan(0);
    expect(new Set(migrantSites.map(([, lineId]) => lineId)).size).toBe(
      content.species.filter((s) => s.seasonalWindow).length,
    );
  });

  it("a migrant with individuals still says dormant/migrating out of its window (Hard Req 10)", () => {
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    let flagged = 0;
    for (const [nodeId, lineId] of migrantSites) {
      for (const season of SEASONS) {
        const row = rowFor(save.nodeStates, nodeId, lineId, season);
        if (row.count === 0) continue;
        const status = migrantStatus(lineOf(lineId), season, balance);
        if (status.active) {
          expect(renderSeasonalNote(row)).toBe("");
          continue;
        }
        flagged += 1;
        expect(renderSeasonalNote(row)).toBe(status.dormantReason);
        // …and the real count is still the integer on the row beside it, never a 0.
        expect(renderLedgerRow(row).split(/\s+/)).toContain(String(row.count));
        expect(row.count).toBeGreaterThan(0);
      }
    }
    expect(flagged).toBeGreaterThan(0);
  });

  it("a migrant caught to 0 is never annotated with the word that would explain it away", () => {
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    let checked = 0;
    for (const [nodeId, lineId] of migrantSites) {
      const states = JSON.parse(JSON.stringify(save.nodeStates)) as Record<string, NodeState>;
      (states[nodeId]?.populations[lineId] as { count: number }).count = 0;
      for (const season of SEASONS) {
        const row = rowFor(states, nodeId, lineId, season);
        expect(row.count).toBe(0);
        const note = renderSeasonalNote(row);
        checked += 1;
        // Not the word that describes where a population is…
        expect(note, `${nodeId}/${lineId} in ${season}`).not.toBe("dormant");
        expect(note, `${nodeId}/${lineId} in ${season}`).not.toBe("migrating");
        expect(renderLedgerRow(row)).not.toMatch(/\b(dormant|migrating)\b/);
        // …but the calendar fact is still on the row, so the card and the ledger agree that this is
        // a migrant and say when it is catchable.
        expect(note).toBe(`window ${row.seasonalWindow as string}`);
        expect(renderLedgerRow(row)).toContain(note);
      }
    }
    expect(checked).toBe(migrantSites.length * SEASONS.length);
  });

  it("a non-migrant at 0 gets no note at all, in any season", () => {
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    for (const file of content.nodes) {
      const base = save.nodeStates[file.id];
      if (!base) continue;
      for (const lineId of Object.keys(base.populations)) {
        if (lineOf(lineId).seasonalWindow) continue;
        const states = JSON.parse(JSON.stringify(save.nodeStates)) as Record<string, NodeState>;
        (states[file.id]?.populations[lineId] as { count: number }).count = 0;
        for (const season of SEASONS) {
          expect(renderSeasonalNote(rowFor(states, file.id, lineId, season))).toBe("");
        }
      }
    }
  });

  it("every row the shipped content can produce still fits the canvas, note and all", () => {
    // The note is the longest thing on a row, so it is the one that can push a line off a 480px
    // screen. Driven over a full six-year run WITH a season of history, which is the widest state.
    const cols = columnBudget(balance, SCREEN_TEXT.padPx);
    const run = steppedRegion(12, 24);
    const over: string[] = [];
    for (const season of SEASONS) {
      for (const file of content.nodes) {
        if (!run.states[file.id]) continue;
        const page = buildLedgerPage({
          nodeId: file.id,
          region: region(run.states),
          species: content.species,
          balance,
          year: 6,
          season,
          history: run.histories[file.id] as LedgerSample[],
        });
        for (const row of page.rows) {
          for (const variant of [row, { ...row, count: 0, extinct: true }]) {
            const text = renderLedgerRow(variant);
            if (text.length > cols) over.push(text);
          }
        }
      }
    }
    expect(over, `rows wider than the ${cols}-column canvas:\n${over.join("\n")}`).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 10. The dex cannot claim something the encounter roll refuses
 * ════════════════════════════════════════════════════════════════════════════ */

describe("dex — agreement with the encounter roll, at every node and season", () => {
  it("`active && !encounterGated && count>0` is exactly what encounterWeights answers", () => {
    // The dex used to consult `migrantStatus` alone while `encounterWeights` applies a further
    // filter (bible §4's sign-chain gate), so three cards claimed "individuals in region 1" for
    // creatures the roll can never produce. This identity is what makes the two agree.
    const save = newSave({ seed: 9, currentNode: "r1", nodes: content.nodes }, balance);
    const idx = indexSpecies([...content.species]);
    let gatedSeen = 0;
    for (const season of SEASONS) {
      const entries = buildDexEntries(content.species, season, balance);
      for (const file of content.nodes) {
        const state = save.nodeStates[file.id] as NodeState;
        const weights = encounterWeights(fromNodeState(file, state), idx, balance, { season });
        for (const weight of weights) {
          const entry = entries.find((e) => e.lineId === weight.lineId);
          if (!entry) throw new Error(`the dex has no entry for ${weight.lineId}`);
          const count = state.populations[weight.lineId]?.count ?? 0;
          expect(
            weight.active,
            `${file.id}/${entry.dexId} in ${season}: dex says ${entry.active}/${entry.encounterGated}, roll says ${weight.active}`,
          ).toBe(entry.active && !entry.encounterGated && count > 0);
          if (entry.encounterGated) gatedSeen += 1;
        }
      }
    }
    // The three sign-chain-gated Ancients really are in the shipped content at their nodes.
    expect(gatedSeen).toBeGreaterThan(0);
  });

  it("names the gated entries and says so on the card", () => {
    const gated = buildDexEntries(content.species, "spring", balance).filter((e) => e.encounterGated);
    expect(gated.map((e) => e.dexId).sort()).toEqual(["Kilnback", "Undermere", "Vellsire"]);
    for (const entry of gated) {
      expect(entry.ancient).toBe(true);
      const lines = renderDexEntry(entry, 1);
      expect(lines).toContain(NOT_IN_ENCOUNTER_POOL);
      expect(renderDexFlags(entry)).toContain(NOT_IN_ENCOUNTER_POOL);
      // …and the real count is still on the card beside it, so "cannot meet it yet" and "there is
      // one of them" are two readable facts rather than one misleading one.
      expect(lines).toContain("individuals in region 1");
    }
  });

  it("the gate lifts when the sign chain is unlocked — the same call the roll makes", () => {
    const opened = buildDexEntries(content.species, "spring", balance, {
      unlockedSignChains: new Set(content.species.filter((s) => s.ancient).map((s) => s.id)),
    });
    for (const entry of opened) {
      expect(entry.encounterGated).toBe(false);
      expect(renderDexEntry(entry, 1)).not.toContain(NOT_IN_ENCOUNTER_POOL);
    }
  });

  it("no ordinary line is ever flagged gated, in any season", () => {
    for (const season of SEASONS) {
      for (const entry of buildDexEntries(content.species, season, balance)) {
        if (entry.ancient) continue;
        expect(entry.encounterGated, `${entry.dexId} in ${season}`).toBe(false);
      }
    }
  });

  it("a line that is BOTH gated and out of season keeps its gate flag", () => {
    /*
     * `encounterWeights` checks the sign-chain gate BEFORE the season and returns a bare
     * `active: false` for either refusal, so the dex used to subtract the seasonal case afterwards
     * — `return migrantStatus(line, season, balance).active` — and lost the gate flag in every
     * season the line was out of its window. The card then said only `migrating`: the reason the
     * player could wait out, instead of the one they cannot.
     *
     * No SHIPPED line is both (the three Ancients carry no `seasonalWindow` and the four migrants
     * carry no gated habitat tag), so a sweep over the content cannot reach this and the guard
     * would be free to rot. It is driven with a synthetic line instead — the shipped gated line
     * with a window added, built here and never written to data/ (G2).
     */
    const vellsire = content.species.find((s) => s.id === "vellsire-line");
    if (!vellsire) throw new Error("data/species.json no longer ships vellsire-line");
    // It is gated as shipped, and it carries no window — which is why the two filters never met.
    expect(vellsire.habitat).toContain(balance.encounter.signChainGatedHabitatTag);
    expect(vellsire.seasonalWindow).toBeUndefined();
    const bothFilters: SpeciesLine = { ...vellsire, seasonalWindow: SEASONS[0] as Season };

    let gatedInEverySeason = 0;
    for (const season of SEASONS) {
      const entry = buildDexEntries([bothFilters], season, balance)[0];
      if (!entry) throw new Error("the dex dropped the synthetic line");
      expect(entry.encounterGated, `synthetic gated migrant in ${season}`).toBe(true);
      const flags = renderDexFlags(entry);
      expect(flags, `${season}: the card dropped the gate`).toContain(NOT_IN_ENCOUNTER_POOL);
      // …and the seasonal flag is still there too. Both reasons, not whichever one was checked last.
      expect(flags.some((f) => f.includes(`window ${SEASONS[0] as string}`))).toBe(true);
      gatedInEverySeason += 1;
    }
    expect(gatedInEverySeason).toBe(SEASONS.length);

    // …and unlocking the chain lifts it in every season, including the ones out of the window.
    for (const season of SEASONS) {
      const opened = buildDexEntries([bothFilters], season, balance, {
        unlockedSignChains: new Set([bothFilters.id]),
      })[0];
      expect(opened?.encounterGated, `unlocked in ${season}`).toBe(false);
    }

    // BINDS — a synthetic line with a window and NO gate must not pick the flag up by accident.
    const migrantOnly: SpeciesLine = {
      ...vellsire,
      seasonalWindow: SEASONS[0] as Season,
      habitat: (content.species.find((s) => !s.ancient) as SpeciesLine).habitat,
    };
    for (const season of SEASONS) {
      expect(buildDexEntries([migrantOnly], season, balance)[0]?.encounterGated).toBe(false);
    }
  });
});

describe("dex — the region count is a LINE total and says so", () => {
  it("a multi-form line's cards qualify the number they share", () => {
    const save = newSave({ seed: 9, currentNode: "r1", nodes: content.nodes }, balance);
    const entries = buildDexEntries(content.species, "spring", balance);
    let multiForm = 0;
    for (const entry of entries) {
      const total = regionalCount(save.nodeStates, entry.lineId);
      const lines = renderDexEntry(entry, total);
      const countLine = lines.find((l) => l.startsWith("individuals in region ")) as string;
      if (entry.lineDexIds.length > 1) {
        multiForm += 1;
        // Three cards each reading a bare "individuals in region 14" read as 42 animals.
        expect(countLine).toBe(`individuals in region ${total} · ${ALL_FORMS}`);
      } else {
        expect(countLine).toBe(`individuals in region ${total}`);
      }
    }
    // data/species.json really does ship lines with two and three named identities.
    expect(multiForm).toBeGreaterThan(0);
    expect(entries.filter((e) => e.lineDexIds.length > 1).map((e) => e.lineId)).toContain("mirefin-line");
  });

  it("cards of the same line print the same integer, and it is the region's sum for that line", () => {
    const save = newSave({ seed: 9, currentNode: "r1", nodes: content.nodes }, balance);
    const byLine = new Map<string, Set<string>>();
    for (const entry of buildDexEntries(content.species, "spring", balance)) {
      const total = regionalCount(save.nodeStates, entry.lineId);
      const expected = content.nodes.reduce(
        (n, file) => n + (save.nodeStates[file.id]?.populations[entry.lineId]?.count ?? 0),
        0,
      );
      expect(total).toBe(expected);
      const seen = byLine.get(entry.lineId) ?? new Set<string>();
      seen.add(renderDexEntry(entry, total).find((l) => l.startsWith("individuals")) as string);
      byLine.set(entry.lineId, seen);
    }
    for (const [lineId, seen] of byLine) expect(seen.size, `${lineId} prints two different counts`).toBe(1);
  });

  it("dex and summary lines fit the width they are drawn at", () => {
    const save = newSave({ seed: 9, currentNode: "r1", nodes: content.nodes }, balance);
    const dexCols = columnBudget(balance, textLeftOf(DEX_ART_BOX));
    for (const season of SEASONS) {
      for (const entry of buildDexEntries(content.species, season, balance)) {
        for (const line of renderDexEntry(entry, regionalCount(save.nodeStates, entry.lineId))) {
          expect(line.length, `dex: "${line}"`).toBeLessThanOrEqual(dexCols);
        }
      }
    }
    const summaryCols = columnBudget(balance, textLeftOf(SUMMARY_ART_BOX));
    const topLevel = balance.encounter.levelByYear[balance.encounter.levelByYear.length - 1] as number;
    for (const line of content.species) {
      for (const age of ["J", "A", "E"] as const) {
        const creature = newOwnedCreature(
          { uid: `w-${line.id}-${age}`, lineId: line.id, age, level: topLevel, caughtYear: 1, nickname: "Longnickname" },
          line,
          balance,
        );
        const card = buildSummaryCard({
          creature,
          species: content.species,
          moves: content.moves.moves,
          balance,
          currentYear: 1,
        });
        for (const text of renderSummaryCard(card, balance)) {
          expect(text.length, `summary: "${text}"`).toBeLessThanOrEqual(summaryCols);
        }
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 11. "collapsed" reaches the diagram, not only the text page
 * ════════════════════════════════════════════════════════════════════════════ */

describe("web diagram — the reason a link broke is drawn, not just modelled", () => {
  function webFor(state: NodeState) {
    return buildWebPage({ file: MINI, state, species: content.species, balance, year: 1 });
  }

  it("every collapsed link gets a label carrying its reason; live links get none", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    (state.populations["nibbin-line"] as { count: number }).count = 0;
    const page = webFor(state);
    const layout = layoutWebPage(page, webDiagramBox(balance));
    const labels = collapsedEdgeLabels(page, layout, balance);

    expect(labels.length).toBe(page.collapsedEdges);
    expect(labels.length).toBe(3);
    for (const edge of page.edges) {
      const label = labels.find((l) => l.id === `${edge.predator}→${edge.prey}`);
      if (!edge.collapsed) {
        expect(label).toBeUndefined();
        continue;
      }
      expect(label?.text).toBe(`collapsed (${edge.reason})`);
    }
    // …and they do not all land on the same pixel, which is what a shared endpoint would do.
    expect(new Set(labels.map((l) => `${l.x},${l.y}`)).size).toBe(labels.length);
  });

  it("a live web draws no collapse labels at all", () => {
    const page = webFor(miniSave().nodeStates[MINI.id] as NodeState);
    expect(page.collapsedEdges).toBe(0);
    expect(collapsedEdgeLabels(page, layoutWebPage(page, webDiagramBox(balance)), balance)).toEqual([]);
  });

  it("the diagram's flora line is the same string the text page prints", () => {
    const run = steppedRegion(12, 4);
    for (const file of content.nodes) {
      const state = run.states[file.id];
      if (!state) continue;
      const page = buildWebPage({ file, state, species: content.species, balance, year: 2 });
      expect(renderWebPage(page)[1]).toBe(renderWebTotals(page));
      expect(renderWebTotals(page).length).toBeLessThanOrEqual(columnBudget(balance, SCREEN_TEXT.padPx));
    }
  });

  it("keeps the collapse reason on the edge text too", () => {
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    (state.populations["skir-line"] as { count: number }).count = 0;
    const page = webFor(state);
    const edge = page.edges.find((e) => e.predator === "skir-line");
    expect(renderWebEdge(page, edge!)).toBe("Skir 0 → Nibbin 20  collapsed (predator)");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 11a. No label on the diagram is drawn on top of another
 *
 * "Does the word reach the screen" was the only question section 11 asked, and the answer was yes
 * while the word was ILLEGIBLE. Measured live at r2 with reedrick-line at 0: `[2] Mirefin 8/24` and
 * `collapsed (prey)` rendered at the same 96×11px, as the smear `[2]lMirefinp8/24`. Both strings
 * were destroyed, and one of them was the only thing on screen naming what the player had done.
 *
 * The cause was structural: `collapsedEdgeLabels` staggered by LIST INDEX and never saw the vertex
 * labels at all, and vertex labels never saw each other (a tier of five 19-character labels does
 * not fit across a 464px box). So the sweep below is over BOXES, not over strings — every label
 * either set produces, in every state a player can make one node reach.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("web diagram — every label is legible, not merely present", () => {
  /** Every label the scene draws for one state, with the box each one occupies. */
  function drawnBoxes(file: NodeFile, state: NodeState) {
    const page = buildWebPage({ file, state, species: content.species, balance, year: 1 });
    const layout = layoutWebPage(page, webDiagramBox(balance));
    const labels = [
      ...webVertexLabels(page, layout, balance),
      ...collapsedEdgeLabels(page, layout, balance),
    ];
    return labels.map((label) => ({ label, box: labelBounds(label) }));
  }

  /** Shipped, then every single line at 0, then every pair — what over-catching actually produces. */
  function zeroSets(ids: string[]): string[][] {
    const out: string[][] = [[]];
    for (const a of ids) out.push([a]);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) out.push([ids[i] as string, ids[j] as string]);
    }
    return out;
  }

  it("no two labels overlap, at any shipped node, with any line or pair of lines at 0", () => {
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const band = webDiagramBox(balance);
    const failures: string[] = [];
    let scenarios = 0;
    let labelsChecked = 0;
    for (const file of content.nodes) {
      const base = save.nodeStates[file.id];
      if (!base) continue;
      for (const zero of zeroSets(Object.keys(base.populations))) {
        scenarios += 1;
        const state = JSON.parse(JSON.stringify(base)) as NodeState;
        for (const id of zero) (state.populations[id] as { count: number }).count = 0;
        const drawn = drawnBoxes(file, state);
        labelsChecked += drawn.length;
        const where = `${file.id} zero=[${zero.join(",")}]`;
        for (let i = 0; i < drawn.length; i += 1) {
          const a = drawn[i] as (typeof drawn)[number];
          // On the canvas horizontally…
          if (a.box.left < -1e-9 || a.box.right > balance.map.virtualWidth + 1e-9) {
            failures.push(`${where}: "${a.label.text}" runs off the canvas`);
          }
          // …and inside the diagram's own band vertically, so nothing lands on the header or footer.
          if (a.box.top < band.y - 1e-9 || a.box.bottom > band.y + band.height + 1e-9) {
            failures.push(`${where}: "${a.label.text}" leaves the diagram box`);
          }
          for (let j = i + 1; j < drawn.length; j += 1) {
            const b = drawn[j] as (typeof drawn)[number];
            const area = labelOverlap(a.box, b.box);
            if (area > 0) {
              failures.push(`${where}: "${a.label.text}" over "${b.label.text}" (${area}px²)`);
            }
          }
        }
      }
    }
    // The sweep really did run over the states the defect was measured in.
    expect(scenarios).toBeGreaterThan(150);
    expect(labelsChecked).toBeGreaterThan(1000);
    expect(failures.slice(0, 10), `${failures.length} label collisions`).toEqual([]);
  });

  it("BINDS — the measured case: r2 with its migrant at 0 puts the reason clear of the count", () => {
    // The exact live reproduction. Before the fix both boxes were x192-288 / y≈133-144.
    const save = newSave({ seed: 12, currentNode: "r2", nodes: content.nodes }, balance);
    const state = save.nodeStates["r2"] as NodeState;
    (state.populations["reedrick-line"] as { count: number }).count = 0;
    const file = content.nodes.find((n) => n.id === "r2") as NodeFile;
    const drawn = drawnBoxes(file, state);

    const mirefin = drawn.find((d) => d.label.id === "mirefin-line");
    const collapsed = drawn.filter((d) => d.label.text.startsWith("collapsed"));
    expect(mirefin, "r2 no longer draws the vertex the reason word landed on").toBeDefined();
    expect(collapsed.length).toBeGreaterThan(0);
    for (const label of collapsed) {
      expect(
        labelOverlap((mirefin as (typeof drawn)[number]).box, label.box),
        `"${label.label.text}" still prints through "${(mirefin as (typeof drawn)[number]).label.text}"`,
      ).toBe(0);
    }
  });

  it("BINDS — the sweep fails when a label is put back on top of another", () => {
    // Without this the sweep could be green because `labelOverlap` never returns a positive number.
    const a = { left: 192, right: 288, top: 132, bottom: 144 };
    const b = { left: 192, right: 288, top: 133, bottom: 145 };
    expect(labelOverlap(a, b)).toBe(96 * 11);
    expect(labelOverlap(a, { left: 192, right: 288, top: 144, bottom: 156 })).toBe(0);
  });

  it("the modelled box is the box the ENGINE draws, to the pixel", () => {
    // Measured off the live scene (LedgerScene in Chrome, `Text.getBounds()` read back): a Phaser
    // Text at this face and size is `characters × advancePx + 1` wide and `lineHeight` tall —
    // 14ch→85, 16ch→97, 17ch→103, 20ch→121, 32ch→193. One pixel does not matter until it is the
    // pixel two labels share, and a model narrower than the engine calls a real overlap clear.
    for (const [text, width] of [
      ["[3] Fenmaw 6/9", 85],
      ["collapsed (prey)", 97],
      ["[2] Mirefin 11/24", 103],
      ["collapsed (predator)", 121],
    ] as const) {
      expect(text.length * SCREEN_TEXT.advancePx + 1).toBe(width);
      const box = labelBounds({ id: "x", text, x: 200, y: 100, originY: 0 });
      expect(box.right - box.left, `"${text}" modelled narrower than the engine draws`).toBe(width);
      expect(box.bottom - box.top).toBe(SCREEN_TEXT.lineHeight);
    }
  });

  it("labels are separated, not merely tangent", () => {
    // Non-overlapping is the requirement; two strings sharing an edge are still one thing to read.
    const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
    let closest = Number.POSITIVE_INFINITY;
    for (const file of content.nodes) {
      const base = save.nodeStates[file.id];
      if (!base) continue;
      for (const lineId of Object.keys(base.populations)) {
        const state = JSON.parse(JSON.stringify(base)) as NodeState;
        (state.populations[lineId] as { count: number }).count = 0;
        const drawn = drawnBoxes(file, state);
        for (let i = 0; i < drawn.length; i += 1) {
          for (let j = i + 1; j < drawn.length; j += 1) {
            const a = (drawn[i] as (typeof drawn)[number]).box;
            const b = (drawn[j] as (typeof drawn)[number]).box;
            const dx = Math.max(a.left - b.right, b.left - a.right);
            const dy = Math.max(a.top - b.bottom, b.top - a.bottom);
            // Only pairs that share a column can be close in the way that matters.
            if (dx < 0) closest = Math.min(closest, dy);
          }
        }
      }
    }
    expect(closest).toBeGreaterThanOrEqual(2);
  });

  it("the box a label occupies is the box the scene anchors it with", () => {
    // The placement above is only true of the drawn screen if the scene uses the origin the label
    // carries. A vertex label hangs below its point (originY 0); a link label sits on it (0.5).
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    (state.populations["nibbin-line"] as { count: number }).count = 0;
    const page = buildWebPage({ file: MINI, state, species: content.species, balance, year: 1 });
    const layout = layoutWebPage(page, webDiagramBox(balance));
    for (const label of webVertexLabels(page, layout, balance)) {
      expect(label.originY).toBe(0);
      expect(labelBounds(label).top).toBe(label.y);
    }
    for (const label of collapsedEdgeLabels(page, layout, balance)) {
      expect(label.originY).toBe(0.5);
      expect(labelBounds(label).top).toBe(label.y - SCREEN_TEXT.lineHeight / 2);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 12. The two guards that a shipped-content sweep cannot exercise
 *
 * A sweep over the shipped data only proves what the shipped data happens to reach. Both defences
 * below are load-bearing for inputs the shipped content does not currently produce, so they are
 * driven directly — otherwise removing either would leave this file green, which is how a guard
 * becomes decoration.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("guards driven directly, not by luck of the shipped data", () => {
  it("the trend window clips a history longer than recordSample would ever keep", () => {
    // `recordSample` keeps `seasonsPerYear`, but nothing stops a caller assembling its own array —
    // and the ledger renders a fixed-width column, so the window has to be enforced where it is
    // DRAWN as well as where it is stored.
    const state = miniSave().nodeStates[MINI.id] as NodeState;
    const overlong: LedgerSample[] = [];
    for (let i = 0; i < seasonsPerYear(balance) + 3; i += 1) {
      overlong.push({
        year: 1,
        season: SEASONS[i % SEASONS.length] as Season,
        counts: { "skir-line": i },
        floraStock: 45,
      });
    }
    const page = buildLedgerPage({
      nodeId: MINI.id,
      region: miniRegion(state),
      species: content.species,
      balance,
      // A season no sample carries, so the live count is appended rather than replacing one.
      year: 2,
      season: SEASONS[0] as Season,
      history: overlong,
    });
    const skir = page.rows.find((r) => r.lineId === "skir-line");
    expect(skir?.trend.length).toBe(seasonsPerYear(balance));
    expect(skir?.trend[skir.trend.length - 1]).toBe(skir?.count);
    // …and the net is measured across the window that is DRAWN, not across samples nobody sees.
    expect(skir?.delta).toBe((skir?.count ?? 0) - (skir?.trend[0] as number));
  });

  it("a label at the edge of the canvas is pulled back inside it", () => {
    // The shipped content no longer produces one (the float that did was the flora stock), but a
    // long enough form name at the end of a crowded tier would do it again with no float in sight.
    const page = buildWebPage({
      file: MINI,
      state: miniSave().nodeStates[MINI.id] as NodeState,
      species: content.species,
      balance,
      year: 1,
    });
    const width = balance.map.virtualWidth;
    const layout = {
      positions: new Map(page.vertices.map((v) => [v.id, { x: width - 1, y: 100 }])),
      tiers: [] as string[][],
    };
    const labels = webVertexLabels(page, layout, balance);
    expect(labels.length).toBe(page.vertices.length);
    for (const label of labels) {
      const half = (label.text.length * SCREEN_TEXT.advancePx) / 2;
      expect(label.x + half).toBeLessThanOrEqual(width);
      expect(label.x - half).toBeGreaterThanOrEqual(0);
      expect(label.x).toBeLessThan(width - 1); // it really moved
    }
    // The same clamp applies to the collapse labels, which sit at link midpoints.
    const zeroed = miniSave().nodeStates[MINI.id] as NodeState;
    (zeroed.populations["nibbin-line"] as { count: number }).count = 0;
    const collapsedPage = buildWebPage({ file: MINI, state: zeroed, species: content.species, balance, year: 1 });
    const edgeLabels = collapsedEdgeLabels(collapsedPage, layout, balance);
    expect(edgeLabels.length).toBeGreaterThan(0);
    for (const label of edgeLabels) {
      const half = (label.text.length * SCREEN_TEXT.advancePx) / 2;
      expect(label.x + half).toBeLessThanOrEqual(width);
    }
  });

  it("the throwaway seed really is a different stream, and the rate still does not move", () => {
    // Without this, "same answer at two seeds" could be true because the seeds were never used.
    const save = newSave({ seed: 3, currentNode: "cindershelf", nodes: content.nodes }, balance);
    const a = stepRegionStates(content.nodes, save.nodeStates, "spring", createRng(1)).states;
    const b = stepRegionStates(content.nodes, save.nodeStates, "spring", createRng(987654321)).states;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b)); // the two streams do diverge…

    const rates = (seed: number) =>
      [
        ...effectiveRates({
          nodeId: "cindershelf",
          region: regionOf(save),
          species: content.species,
          balance: { ...balance, rng: { ...balance.rng, defaultSeed: seed } },
          season: "spring",
        }).rates.entries(),
      ];
    expect(rates(1)).toEqual(rates(987654321)); // …and the rate is not one of the things that move
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 13. The three C4 scenes (build-doc §15 C4 / G14)
 *
 * The scenes value-import Phaser, which throws in the node environment, so — exactly as
 * tests/unit/battle-view.test.ts does for `BattleScene` — they are checked by reading their source.
 * That is a weaker instrument than calling them, and it is aimed at the one class of defect it can
 * actually catch: a renderer that imports something and never draws it. `LedgerScene` did precisely
 * that — it imported `renderWebEdge` for a method `redraw` never called, so the word "collapsed"
 * and its reason existed only for tests while the screen showed an unexplained dashed line.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("C4 scenes — what the source proves", () => {
  const read = (rel: string): string =>
    require("node:fs").readFileSync(new URL(`../../game/scenes/${rel}`, import.meta.url), "utf8") as string;

  const LEDGER = read("LedgerScene.ts");
  const DEX = read("DexScene.ts");
  const SUMMARY = read("SummaryScene.ts");
  const ALL: Array<[string, string]> = [
    ["LedgerScene.ts", LEDGER],
    ["DexScene.ts", DEX],
    ["SummaryScene.ts", SUMMARY],
  ];

  /** The body of a method, by brace matching from its declaration. */
  function methodBody(src: string, name: string): string {
    const start = src.indexOf(`${name}(`);
    expect(start, `${name} is not declared`).toBeGreaterThan(-1);
    const open = src.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) return src.slice(open, i + 1);
      }
    }
    throw new Error(`${name} has no closing brace`);
  }

  it("every drawing helper the ledger imports is CALLED from a method redraw reaches", () => {
    const drawWeb = methodBody(LEDGER, "private drawWeb");
    // Named with their arguments, not merely mentioned: the defect being guarded against is an
    // import that appears in the file and never runs, so "the file contains this word" is exactly
    // the assertion that already passed while the screen showed nothing.
    for (const call of [
      "renderWebTotals(web)",
      "layoutWebPage(web, webDiagramBox(balance))",
      "collapsedEdgeLabels(web, layout, balance)",
      "webVertexLabels(web, layout, balance)",
    ]) {
      expect(drawWeb, `drawWeb does not call ${call}`).toContain(call);
    }
    // …and both label sets reach a text object rather than being computed and dropped.
    expect(drawWeb.match(/this\.text\(label\.x, label\.y, label\.text/g)?.length).toBe(2);
    // …and redraw really does reach drawWeb, so the labels are on a path the player can open.
    expect(methodBody(LEDGER, "private redraw")).toContain("this.drawWeb()");
  });

  it("the ledger anchors each label with the origin the label carries", () => {
    // game/web-view.ts places labels so their BOXES do not touch, and a box is only the box it
    // computed if the scene anchors the text the same way. Two hard-coded `setOrigin(0.5, 0.5)` /
    // `setOrigin(0.5, 0)` calls are a second copy of that assumption, free to drift out of step
    // with the placement — which is exactly how the collapse labels came to print through the
    // counts in the first place.
    const drawWeb = methodBody(LEDGER, "private drawWeb");
    expect(drawWeb.match(/setOrigin\(0\.5, label\.originY\)/g)?.length).toBe(2);
    expect(drawWeb).not.toMatch(/setOrigin\(0\.5, (0|0\.5)\)/);
  });

  it("the menu hands the ledger its histories, so the trend column has something to draw", () => {
    // The defect: nothing outside game/ledger-view.ts ever called `recordSample`, and the only
    // caller that opens LedgerScene passed no `histories` — so every row of every screen, in play
    // and in the epilogue, rendered one number and `net —` forever. The store is driven directly a
    // few sections up; this is the half of the wiring that only the scene data can show.
    const menu = require("node:fs").readFileSync(
      new URL("../../game/scenes/MenuScene.ts", import.meta.url),
      "utf8",
    ) as string;
    expect(menu).toContain("histories: ledgerHistory.histories()");
    // …taken live from the store rather than copied, for the reason the scene re-reads it.
    expect(menu).not.toMatch(/histories:\s*\{/);
    // …and the reading is taken at the one place the running game adopts a save, so no scene has to
    // remember to (game/registry.ts). Both season-stepping callers pass through it.
    const reg = require("node:fs").readFileSync(
      new URL("../../game/registry.ts", import.meta.url),
      "utf8",
    ) as string;
    expect(reg).toContain("#observeForLedger(save)");
    expect(reg).toContain("ledgerHistory.observe(save, balance)");
  });

  it("the ledger draws every line the renderer produces, in order", () => {
    // The page grew a line (`presence:`) during this repair. A scene that sliced a fixed number of
    // lines off the front, or coloured by a hard-coded index, would silently drop or mis-ink one.
    const redraw = methodBody(LEDGER, "private redraw");
    expect(redraw).toContain("renderLedgerPage(page)");
    expect(redraw).not.toContain(".slice(");
    expect(redraw).toContain("lines.length - page.rows.length");
  });

  it("the ledger re-reads the states on every redraw rather than the record it was opened with", () => {
    // `stepRegionStates` returns a NEW record each season, and Phaser does not re-run init on wake.
    expect(LEDGER).toContain("private statesNow()");
    expect(LEDGER).toContain("Phaser.Scenes.Events.WAKE");
    for (const method of ["page", "webPage"]) {
      expect(methodBody(LEDGER, `  ${method}`), `${method} reads a captured record`).toContain("statesNow()");
    }
    // Nothing indexes the raw scene data — that is the read that goes stale.
    expect(LEDGER).not.toContain("this.args.states[");
  });

  it("the ledger hands the whole region to the page, which is what the breed rates need", () => {
    expect(methodBody(LEDGER, "  page")).toContain("files: this.args.content.nodes");
  });

  it("the dex colours every flag the renderer emits, not the last line", () => {
    expect(DEX).toContain("renderDexFlags(entry)");
    expect(DEX).not.toContain("lines.length - 1");
    expect(DEX).toContain("unlockedSignChains");
  });

  it("no C4 scene does population, breed or catch arithmetic of its own", () => {
    // The scenes are renderers (build-doc §15 / L11's shape): every number they draw is a string a
    // pure module already produced. Touching a population field here is the shape of a second sim.
    const FORBIDDEN = [".populations[", "breedRate", "carryCap", "Math.random", "floraStock", "recentDeaths"];
    for (const [name, src] of ALL) {
      for (const token of FORBIDDEN) {
        expect(src, `${name} touches ${token}`).not.toContain(token);
      }
    }
  });

  it("no C4 scene declares its own text metrics", () => {
    for (const [name, src] of ALL) {
      expect(src, `${name} declares a font size of its own`).toContain("SCREEN_TEXT");
      expect(src, `${name} hard-codes a font size`).not.toMatch(/fontSize:\s*"\d/);
    }
  });

  it("the summary card's art slot and the dex's are the ones the width test measures", () => {
    expect(DEX).toContain("const ART_BOX = DEX_ART_BOX;");
    expect(SUMMARY).toContain("const ART_BOX = SUMMARY_ART_BOX;");
    expect(columnBudget(balance, textLeftOf(DEX_ART_BOX))).toBeGreaterThan(0);
    expect(columnBudget(balance, textLeftOf(SUMMARY_ART_BOX))).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 14. Scene keys — one spelling each (game/scene-keys.ts's whole reason to exist)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("C4 scene keys", () => {
  // The scene modules value-import Phaser, so the keys are read out of their source (see §13).
  const keyIn = (src: string, name: string): string => {
    const match = new RegExp(`export const ${name} = (.+);`).exec(src);
    if (!match?.[1]) throw new Error(`${name} is not exported`);
    return match[1];
  };
  const source = (rel: string): string =>
    require("node:fs").readFileSync(new URL(`../../game/scenes/${rel}`, import.meta.url), "utf8") as string;

  it("every C4 scene's key IS the registry's, not a second copy of the string", () => {
    // Read from game/scene-keys.ts rather than spelled again — that registry exists precisely to
    // stop a scene answering to one spelling while a menu routes to another.
    //
    // WHAT THIS ASSERTION USED TO BE, AND WHY IT CHANGED. It read the dex and summary keys as JSON
    // string literals out of their sources and then compared them to the registry only `if
    // (registry[field] !== undefined)`, on the stated grounds that "the registry has no
    // dex/summary entry yet". game/scene-keys.ts:31,34 carries `dex: "Dex"` and
    // `summary: "Summary"`, game/main.ts registers all three scenes and MenuScene routes to them,
    // so that ground was false and the conditional made the check a no-op that could never fail
    // while the literals stayed literals — which is the second spelling scene-keys.ts exists to
    // prevent. The scenes now read the registry, so this asserts what LedgerScene's half always
    // asserted, for all three, with nothing conditional left in it.
    for (const [file, name, field] of [
      ["LedgerScene.ts", "LEDGER_SCENE_KEY", "ledger"],
      ["DexScene.ts", "DEX_SCENE_KEY", "dex"],
      ["SummaryScene.ts", "SUMMARY_SCENE_KEY", "summary"],
    ] as const) {
      expect(keyIn(source(file), name), `${file} spells its own key`).toBe(`SCENE_KEYS.${field}`);
    }
    expect(SCENE_KEYS.ledger).toBe("Ledger");
    expect(SCENE_KEYS.dex).toBe("Dex");
    expect(SCENE_KEYS.summary).toBe("Summary");
  });

  it("the three C4 keys are distinct, and no other scene answers to one of them", () => {
    const registry = SCENE_KEYS as Record<string, string>;
    const keys: string[] = [SCENE_KEYS.ledger, SCENE_KEYS.dex, SCENE_KEYS.summary];
    expect(new Set(keys).size).toBe(keys.length);
    for (const [field, key] of Object.entries(registry)) {
      if (keys.includes(key)) expect(["ledger", "dex", "summary"]).toContain(field);
    }
  });

  it("no C4 scene carries a scene key as a bare string literal", () => {
    // The defect the registry exists to prevent, asserted directly: a literal here and an entry
    // there is two spellings of one name, and the menu routes to the one the scene does not answer
    // to. Every key in these three files must be a read of game/scene-keys.ts.
    for (const file of ["LedgerScene.ts", "DexScene.ts", "SummaryScene.ts"]) {
      const src = source(file);
      for (const key of Object.values(SCENE_KEYS)) {
        expect(src, `${file} spells "${key}" as a literal`).not.toContain(`"${key}"`);
      }
    }
  });
});
