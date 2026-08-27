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
import {
  deriveFoodWeb,
  isMesopredator,
  predatorsOf,
  preyOf,
  toEcoNode,
  type EcoNode,
} from "../../core/foodweb";
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

/**
 * The released tier at one node: the top predator's most abundant prey that the script did NOT
 * hammer; where the script hammered the only prey there is, it is that prey's own recovery.
 *
 * ⚠ ROLE-FILTERED, AND IT HAS TO BE. build-doc §10.2 names ONE tier — the mesopredator — and this
 * selection used to be a bare `preyOf` over the collapsed predator's diet of ANY role, ranked by
 * abundance. That is the same mis-measurement `full-run.ts` was carrying: at four of the six apex
 * sites the apex also eats a Grazer, and the most abundant prey of a
 * collapsed apex is usually that Grazer — so the fixture would name a herbivore as "the tier
 * below", `releasedRose` would score its rebound, and `report.ts` would publish it as the demo
 * beat. It never did, only because `fixtures/overcatch-script.json` pins `r4`, the one shipped
 * node where the apex's sole prey pool IS its mesopredator (the fixture's `_why` says so). That
 * is correctness held up by a prose comment in a JSON file; re-pointing `nodeId` was all it took
 * to break it.
 *
 * ⚠ THE ROLE FILTER IS A NO-OP AT THE SHIPPED FIXTURE NODE, AND THAT IS THE POINT. At `r4` the
 * only prey is the mesopredator and the script hammers it, so the candidate list is empty here as
 * it was before the filter and the fall-through still names it. Every role at `r4` is the same in
 * all three age classes, so no `balance.ecosim.webRoleAgeClass` retune moves it either — nothing a
 * caller of `replayOvercatchFixture` can pass makes the filter bite, because that entry point
 * reads its node from `script.nodeId` and takes no node argument. MEASURED over `data/nodes/*.json`:
 * the filter changes the answer at EIGHT of the twelve shipped nodes — `hearthollow`, `r1`,
 * `duskhollow` and `r5` (a non-mesopredator would be named where the correct answer is "no line"),
 * and `brackwater`, `r2`, `bowerdeep` and `r3` (a Grazer would outrank the mesopredator on
 * abundance). It is a no-op only at `r4` and `cindershelf`. THAT is why the selection is broken out
 * of `replayOvercatchFixture` as its own exported function: hard-wired to `script.nodeId` it is
 * unreachable at any node where it bites, and an unreachable guard is one nobody can bind.
 * `tests/unit/harness-fixture.test.ts` drives it over every shipped node, including the eight.
 *
 * The role is read through `core/foodweb.ts`, the repo's one home for it (§8.3, G3); no role name
 * is written in this file, which `tests/property/foodweb.test.ts` requires of everything in
 * `tools/`.
 */
export function releasedTierOf(
  loaded: LoadedContent,
  template: EcoNode,
  topLineId: string,
  hammeredLineId: string,
): string | null {
  const balance = loaded.balance;
  const openingWeb = deriveFoodWeb(template, loaded.species, balance);
  const isMesoLine = (id: string): boolean => {
    const line = loaded.species.byId.get(id);
    return line !== undefined && isMesopredator(line, balance);
  };
  const preyCandidates = preyOf(openingWeb, topLineId)
    .filter((id) => id !== hammeredLineId && isMesoLine(id))
    .sort((a, b) => (template.populations[b]?.count ?? 0) - (template.populations[a]?.count ?? 0));
  return preyCandidates[0] ?? (isMesoLine(hammeredLineId) ? hammeredLineId : null);
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
  // The released tier, role-filtered — see `releasedTierOf` above for why the filter is there and
  // why it is a no-op at this node. At `r4` the fall-through names the hammered mesopredator; at
  // any other node the fall-through is `null` — no line — rather than the wrong line, which
  // surfaces as a false `fullBeat` instead of a fabricated one.
  const releasedLineId = releasedTierOf(loaded, template, topLineId, hammeredLineId);
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
