import { validateContent, zNodeFile } from "../core/schemas";
import { newSave } from "../core/save";
import { createRng } from "../core/rng";
import { stepRegionStates } from "../core/ecosim";
import { buildLedgerPage, ledgerPageForSave, renderLedgerPage, renderLedgerRow, renderNumber } from "../game/ledger-view";
import type { Content, NodeFile, NodeState, Season } from "../core/types";
import { readFileSync } from "node:fs";

const content = validateContent();
const balance = content.balance;
const SEASONS = balance.clock.seasonOrder as Season[];
const MINI = zNodeFile.parse(JSON.parse(readFileSync(new URL("../fixtures/mini-node.json", import.meta.url), "utf8")));
const miniContent: Content = { ...content, nodes: [MINI] };
const miniSave = () => newSave({ seed: 1234, currentNode: MINI.id, nodes: [MINI] }, balance);

console.log("=== MINI fixture page ===");
console.log(JSON.stringify(renderLedgerPage(ledgerPageForSave(miniSave(), MINI.id, miniContent)), null, 1));

// mini with skir at 0 + history (the "8 5 2 0" test)
{
  const state = miniSave().nodeStates[MINI.id] as NodeState;
  const history = [8,5,2].map((count,i)=>({year:1, season:(balance.clock.seasonOrder[i] ?? "spring") as Season, counts:{"skir-line":count}, floraStock: state.floraStock}));
  (state.populations["skir-line"] as {count:number}).count = 0;
  const page = buildLedgerPage({nodeId:MINI.id, region:{files:[MINI],states:{[MINI.id]:state}}, species:content.species, balance, year:1, season:"spring", history});
  console.log("SKIR ROW:", JSON.stringify(renderLedgerRow(page.rows.find(r=>r.lineId==="skir-line")!)));
  console.log("NIBBIN ROW:", JSON.stringify(renderLedgerRow(page.rows.find(r=>r.lineId==="nibbin-line")!)));
}

console.log("=== renderNumber ===");
for (const v of [45,0,100,88.87983002626036,1.7724791058738372,0.04,99.95,85.00425531914894,1.2085106382978723,1e-9,-0.04,43.099999999999994]) {
  console.log(` renderNumber(${v}) = ${renderNumber(v)}`);
}

console.log("=== breed column now matches the sim ===");
const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
const region = { files: content.nodes, states: save.nodeStates };
let bad = 0, checked = 0, arrows = 0;
for (const season of SEASONS) {
  const reports = stepRegionStates(content.nodes, save.nodeStates, season, createRng(12)).reports;
  for (const rep of reports) {
    const page = buildLedgerPage({ nodeId: rep.nodeId, region, species: content.species, balance, year: 1, season });
    for (const sp of rep.species) {
      const row = page.rows.find(r => r.lineId === sp.lineId)!;
      checked++;
      if (renderLedgerRow(row).includes("→")) arrows++;
      const expected = sp.births;
      const got = row.count * row.breedRate;
      if (Math.abs(got - expected) > 1e-9 * Math.max(1, Math.abs(expected))) { bad++; if (bad<5) console.log("  MISMATCH", rep.nodeId, sp.lineId, got, expected); }
    }
  }
}
console.log(` count × breedRate === births: ${checked - bad}/${checked} exact; arrows on ${arrows} rows`);

console.log("=== widest row over a 24-season run, all seasons ===");
let states: Record<string, NodeState> = save.nodeStates;
const rng = createRng(12);
const histories: Record<string, any[]> = {};
let widest = "";
const { recordSample, sampleNodeState } = await import("../game/ledger-view");
for (let i = 0; i < 24; i += 1) {
  const season = SEASONS[i % SEASONS.length]!;
  states = stepRegionStates(content.nodes, states, season, rng).states;
  for (const f of content.nodes) { const st = states[f.id]; if (st) histories[f.id] = recordSample(histories[f.id] ?? [], sampleNodeState(st, 1+Math.floor(i/4), season), balance); }
  for (const f of content.nodes) {
    const st = states[f.id]; if (!st) continue;
    const page = buildLedgerPage({nodeId:f.id, region:{files:content.nodes,states}, species:content.species, balance, year:1+Math.floor(i/4), season, history: histories[f.id]});
    for (const row of page.rows) { const s = renderLedgerRow(row); if (s.length > widest.length) widest = s; }
  }
}
console.log(` widest=${widest.length} budget=${Math.floor((balance.map.virtualWidth-16)/6)}  "${widest}"`);
