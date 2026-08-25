/**
 * tools/harness/fixture.ts — replay the shipped demo cascade action log.
 *
 * build-doc §11: "fixtures/overcatch-script.json (the demo cascade as an action log — used by tests
 * AND by the demo-recording flow)". §15 I2: "cascade demo reproducible from overcatch-script.json in
 * real play". The fixture already existed when this harness was written, so it is REUSED, not
 * replaced — this file only reads it.
 *
 * The replay is byte-for-byte the convention tests/property/ecosim.test.ts uses (`createRng(seed)`,
 * the node's own presence map, `applyCatch` then `step`), so the harness's numbers and the property
 * test's numbers are the same numbers.
 *
 * G6: the log contains nothing but catches and season steps. Every one is an action a player can
 * take. What follows is the sim's own arithmetic.
 */

import { applyCatch, step, withPresence } from "../../core/ecosim";
import { deriveFoodWeb, predatorsOf, preyOf, toEcoNode, type EcoNode } from "../../core/foodweb";
import { createRng } from "../../core/rng";
import type { Season } from "../../core/types";
import type { LoadedContent } from "./content";
import { topOfWeb } from "./full-run";
import scriptJson from "../../fixtures/overcatch-script.json";

interface OvercatchScript {
  seed: number;
  nodeId: string;
  seasons: number;
  actions: Array<{ t: string; nodeId?: string; lineId?: string; season?: string }>;
  _expected?: Record<string, string>;
}

const script = scriptJson as unknown as OvercatchScript;

export interface FixtureReplay {
  path: string;
  seed: number;
  nodeId: string;
  walkable: boolean;
  seasons: number;
  caught: number;
  hammeredLineId: string;
  hammeredFormName: string;
  topLineId: string;
  topFormName: string;
  /** Per-season count of the node's top-of-web line. */
  topTrace: number[];
  /** Per-season count of the tier the collapse is supposed to release. */
  releasedLineId: string | null;
  releasedFormName: string | null;
  releasedTrace: number[];
  releasedStart: number;
  /** The two halves of the never-cut beat, measured. */
  topGone: boolean;
  nothingHuntsReleased: boolean;
  releasedRose: boolean;
  fullBeat: boolean;
  /** The fixture's own recorded expectation, for a side-by-side in the report. */
  recorded: Record<string, string>;
}

export function replayOvercatchFixture(loaded: LoadedContent): FixtureReplay {
  const balance = loaded.balance;
  const file = loaded.nodes.find((n) => n.id === script.nodeId);
  if (!file) {
    throw new Error(
      `tools/harness: fixtures/overcatch-script.json targets node "${script.nodeId}", which is not in data/nodes/`,
    );
  }
  const template = toEcoNode(file);
  const openingWeb = deriveFoodWeb(template, loaded.species, balance);
  const topLineId = topOfWeb(template, loaded)[0];
  if (topLineId === undefined) {
    throw new Error(`tools/harness: node "${file.id}" has no top-of-web predator to collapse`);
  }

  const seasons = balance.clock.seasonOrder;
  const ctx = withPresence(loaded.sim, [template]);
  let node: EcoNode = template;
  const rng = createRng(script.seed);
  const hammered = new Set<string>();
  let caught = 0;
  let seasonIndex = 0;
  const topTrace: number[] = [];
  const perSeason: EcoNode[] = [];

  for (const action of script.actions) {
    if (action.t === "catch" && action.lineId !== undefined) {
      node = applyCatch(node, action.lineId, balance);
      hammered.add(action.lineId);
      caught += 1;
      continue;
    }
    if (action.t === "seasonStep") {
      const season = (action.season ?? seasons[seasonIndex % seasons.length]) as Season;
      node = step(node, season, rng, ctx).node;
      seasonIndex += 1;
      topTrace.push(node.populations[topLineId]?.count ?? 0);
      perSeason.push(node);
      continue;
    }
    throw new Error(`tools/harness: overcatch-script action "${action.t}" is not a play action`);
  }

  const hammeredLineId = [...hammered][0] ?? "";
  // The released tier is the top predator's most abundant prey that the script did NOT hammer;
  // where the script hammered the only prey there is, it is that prey's own recovery.
  const preyCandidates = preyOf(openingWeb, topLineId)
    .filter((id) => id !== hammeredLineId)
    .sort((a, b) => (template.populations[b]?.count ?? 0) - (template.populations[a]?.count ?? 0));
  const releasedLineId = preyCandidates[0] ?? hammeredLineId ?? null;
  const releasedTrace = releasedLineId
    ? perSeason.map((n) => n.populations[releasedLineId]?.count ?? 0)
    : [];

  const closingWeb = deriveFoodWeb(node, loaded.species, balance);
  const topGone = (node.populations[topLineId]?.count ?? 0) === 0;
  const nothingHuntsReleased =
    releasedLineId === null ||
    predatorsOf(closingWeb, releasedLineId).every((p) => (node.populations[p]?.count ?? 0) === 0);
  const releasedFloor = Math.floor(
    (template.populations[releasedLineId ?? ""]?.count ?? 0) * balance.cascade.preyForcedFraction,
  );
  const releasedEnd = releasedLineId ? (node.populations[releasedLineId]?.count ?? 0) : 0;
  const releasedRose = releasedEnd > releasedFloor && releasedEnd > 0;

  const nameOf = (id: string): string => {
    const line = loaded.species.byId.get(id);
    return line ? line.formNames[line.ancient ? "E" : "A"] : id;
  };

  return {
    path: "fixtures/overcatch-script.json",
    seed: script.seed,
    nodeId: file.id,
    walkable: file.walkable,
    seasons: seasonIndex,
    caught,
    hammeredLineId,
    hammeredFormName: nameOf(hammeredLineId),
    topLineId,
    topFormName: nameOf(topLineId),
    topTrace,
    releasedLineId,
    releasedFormName: releasedLineId ? nameOf(releasedLineId) : null,
    releasedTrace,
    releasedStart: releasedLineId ? (template.populations[releasedLineId]?.count ?? 0) : 0,
    topGone,
    nothingHuntsReleased,
    releasedRose,
    fullBeat: topGone && nothingHuntsReleased && releasedRose,
    recorded: script._expected ?? {},
  };
}
