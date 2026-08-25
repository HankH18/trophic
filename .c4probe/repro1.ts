import { validateContent } from "../core/schemas";
import { newSave } from "../core/save";
import { createRng } from "../core/rng";
import { stepRegionStates } from "../core/ecosim";
import { buildLedgerPage, renderLedgerRow, renderNumber } from "../game/ledger-view";
import type { NodeState, Season } from "../core/types";

const content = validateContent();
const balance = content.balance;
const SEASONS = balance.clock.seasonOrder as Season[];

// ── Finding 1: breed column drops foodFactor ──────────────────────────────
const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
const region = { files: content.nodes, states: save.nodeStates };
const reports = stepRegionStates(content.nodes, save.nodeStates, "spring", createRng(12)).reports;
let mismatches = 0;
const nodesSeen = new Set<string>();
for (const rep of reports) {
  const page = buildLedgerPage({ nodeId: rep.nodeId, region, species: content.species, balance, year: 1, season: "spring" });
  for (const sp of rep.species) {
    const row = page.rows.find((r) => r.lineId === sp.lineId)!;
    const realized = sp.breedRate * sp.presenceMult * sp.foodFactor;
    if (Math.abs(row.breedRate - realized) > 1e-12) {
      mismatches += 1; nodesSeen.add(rep.nodeId);
      if (mismatches <= 6) console.log(`F1 ${rep.nodeId.padEnd(12)} ${sp.lineId.padEnd(16)} shown=${row.breedRate.toFixed(4)} realized=${realized.toFixed(4)} foodFactor=${sp.foodFactor.toFixed(3)} starving=${sp.starving} births=${sp.births.toFixed(3)}`);
    }
  }
}
console.log(`F1 TOTAL mismatched rows (spring, shipped year-1): ${mismatches} across ${nodesSeen.size} nodes`);

// ── Finding 3: renderNumber edge behaviour ────────────────────────────────
console.log(`F3 renderNumber(0.04)=${renderNumber(0.04)}  renderNumber(99.95)=${renderNumber(99.95)}  renderNumber(85.00425531914894)=${renderNumber(85.00425531914894)}`);

// how small does recentDeaths get in a 24-season run?
let states: Record<string, NodeState> = save.nodeStates;
const rng = createRng(12);
let minRD = Infinity, minFlora = Infinity;
for (let i = 0; i < 24; i += 1) {
  states = stepRegionStates(content.nodes, states, SEASONS[i % SEASONS.length]!, rng).states;
  for (const id of Object.keys(states)) {
    const st = states[id]!;
    if (st.recentDeaths > 0) minRD = Math.min(minRD, st.recentDeaths);
    if (!Number.isInteger(st.floraStock)) minFlora = Math.min(minFlora, st.floraStock);
  }
}
console.log(`F3 min nonzero recentDeaths over 24 seasons = ${minRD}; min non-integer flora = ${minFlora}`);

// ── row width headroom ────────────────────────────────────────────────────
let widest = "";
for (const id of Object.keys(states)) {
  const page = buildLedgerPage({ nodeId: id, region: { files: content.nodes, states }, species: content.species, balance, year: 6, season: "winter" });
  for (const row of page.rows) {
    const withHist = { ...row, trend: [row.count, row.count, row.count, row.count], delta: 0 };
    const s = renderLedgerRow(withHist as never);
    if (s.length > widest.length) widest = s;
  }
}
console.log(`WIDTH widest synthetic row (4-season trend) = ${widest.length} cols: "${widest}"`);
console.log(`WIDTH budget = ${Math.floor((balance.map.virtualWidth - 16) / 6)}`);

// migrant lines + their max carryCap/count
for (const line of content.species) {
  if (!line.seasonalWindow) continue;
  let maxCount = 0, maxCap = 0;
  for (const f of content.nodes) {
    const p = save.nodeStates[f.id]?.populations[line.id];
    if (p) { maxCount = Math.max(maxCount, p.count); maxCap = Math.max(maxCap, p.carryCap); }
  }
  console.log(`MIGRANT ${line.id} name=${line.formNames["A"]} window=${line.seasonalWindow} maxCount=${maxCount} maxCap=${maxCap}`);
}
