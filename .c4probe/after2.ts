import { validateContent } from "../core/schemas";
import { newSave } from "../core/save";
import { createRng } from "../core/rng";
import { stepRegionStates } from "../core/ecosim";
import { buildLedgerPage, buildDexEntries, renderDexFlags, renderLedgerRow } from "../game/ledger-view";
import { buildWebPage, collapsedEdgeLabels, labelBounds, labelOverlap, layoutWebPage, webDiagramBox, webVertexLabels } from "../game/web-view";
import type { NodeState, Season, SpeciesLine } from "../core/types";

const content = validateContent();
const balance = content.balance;
const SEASONS = balance.clock.seasonOrder as Season[];

/* ── 1. the r4 cascade beat: a starving apex ─────────────────────────── */
{
  const save = newSave({ seed: 12, currentNode: "r4", nodes: content.nodes }, balance);
  // caught the prey line to 0 (the never-cut cascade beat)
  const st = save.nodeStates["r4"] as NodeState;
  console.log("r4 lines:", Object.keys(st.populations).join(", "));
  const prey = Object.keys(st.populations).find(id => id.startsWith("ashvole"))!;
  (st.populations[prey] as {count:number}).count = 0;
  const reports = stepRegionStates(content.nodes, save.nodeStates, "spring", createRng(4)).reports;
  const rep = reports.find(r=>r.nodeId==="r4")!;
  const page = buildLedgerPage({nodeId:"r4", region:{files:content.nodes,states:save.nodeStates}, species:content.species, balance, year:1, season:"spring"});
  for (const row of page.rows) {
    const sp = rep.species.find(s=>s.lineId===row.lineId)!;
    console.log(` ${renderLedgerRow(row).padEnd(52)} | sim: births=${sp.births.toFixed(3)} foodFactor=${sp.foodFactor.toFixed(3)} starving=${sp.starving} starveDeaths=${sp.starvationDeaths.toFixed(2)}`);
  }
}

/* ── 2. an extinct migrant vs a dormant one ──────────────────────────── */
{
  const save = newSave({ seed: 12, currentNode: "r2", nodes: content.nodes }, balance);
  const region = {files: content.nodes, states: save.nodeStates};
  for (const season of ["summer","spring","winter"] as Season[]) {
    const p = buildLedgerPage({nodeId:"r2", region, species:content.species, balance, year:1, season});
    const r = p.rows.find(r=>r.lineId==="reedrick-line");
    if (r) console.log(` ${season.padEnd(7)} count>0 : ${renderLedgerRow(r)}`);
  }
  (save.nodeStates["r2"]!.populations["reedrick-line"] as {count:number}).count = 0;
  for (const season of ["summer","spring","winter"] as Season[]) {
    const p = buildLedgerPage({nodeId:"r2", region, species:content.species, balance, year:1, season});
    const r = p.rows.find(r=>r.lineId==="reedrick-line");
    if (r) console.log(` ${season.padEnd(7)} count=0 : ${renderLedgerRow(r)}`);
  }
}

/* ── 3. finding 8: a line that is BOTH gated and seasonal ────────────── */
{
  const vell = content.species.find(s=>s.id==="vellsire-line") as SpeciesLine;
  const synthetic: SpeciesLine = { ...vell, seasonalWindow: "spring" };
  for (const season of SEASONS) {
    const e = buildDexEntries([synthetic], season, balance)[0]!;
    console.log(` ${season.padEnd(7)} gated=${String(e.encounterGated).padEnd(5)} flags=${JSON.stringify(renderDexFlags(e))}`);
  }
}

/* ── 4. label collision sweep: 12 nodes × {shipped, each single 0, each pair 0} ── */
{
  const save = newSave({ seed: 12, currentNode: "hearthollow", nodes: content.nodes }, balance);
  const box = webDiagramBox(balance);
  let scenarios = 0, withCollision = 0, collisions = 0, worst = 0, offCanvas = 0, offBand = 0;
  for (const file of content.nodes) {
    const base = save.nodeStates[file.id]; if (!base) continue;
    const ids = Object.keys(base.populations);
    const zeroSets: string[][] = [[]];
    for (const a of ids) zeroSets.push([a]);
    for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++) zeroSets.push([ids[i]!, ids[j]!]);
    for (const zero of zeroSets) {
      scenarios++;
      const state: NodeState = JSON.parse(JSON.stringify(base));
      for (const z of zero) (state.populations[z] as {count:number}).count = 0;
      const page = buildWebPage({file, state, species: content.species, balance, year: 1});
      const layout = layoutWebPage(page, box);
      const labels = [...webVertexLabels(page, layout, balance), ...collapsedEdgeLabels(page, layout, balance)];
      const boxes = labels.map(labelBounds);
      let hit = 0;
      for (let i=0;i<boxes.length;i++) {
        const b = boxes[i]!;
        if (b.left < -1e-9 || b.right > balance.map.virtualWidth + 1e-9) offCanvas++;
        if (b.top < box.y - 1e-9 || b.bottom > box.y + box.height + 1e-9) offBand++;
        for (let j=i+1;j<boxes.length;j++) {
          const a = labelOverlap(b, boxes[j]!);
          if (a > 0) { hit++; collisions++; worst = Math.max(worst, a); }
        }
      }
      if (hit>0) { withCollision++; if (withCollision<=3) console.log(`  COLLIDE ${file.id} zero=[${zero.join(",")}] ${hit}`); }
    }
  }
  console.log(` sweep: ${scenarios} scenarios, ${withCollision} with a collision, ${collisions} collisions, worst ${worst}px², off-canvas ${offCanvas}, outside diagram band ${offBand}`);
}
