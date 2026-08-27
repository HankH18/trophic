/**
 * tests/unit/harness-fixture.test.ts — bind the role filter in `tools/harness/fixture.ts`.
 *
 * WHY THIS FILE EXISTS, and what it is and is not evidence of.
 *
 * `releasedTierOf` decides which line the demo cascade's collapse is reported as having RELEASED.
 * build-doc §10.2's release clause is mesopredator-role-only — it names `fixture.ts` as one of the
 * four files it binds — so the selection filters the collapsed predator's diet down to that one
 * tier. Without the filter the most abundant prey of a starved apex is usually a Grazer, and
 * `report.ts` would publish a herbivore's rebound as the demo beat: a two-tier collapse printed as
 * its opposite.
 *
 * The filter was shipped undefended. `tools/harness/full-run.ts` carries the same rule and
 * `tests/unit/harness.test.ts` drives it hard, but it can: `runOvercatch` takes the node as an
 * ARGUMENT. `replayOvercatchFixture` does not — it reads its node from
 * `fixtures/overcatch-script.json`'s `nodeId`, which is pinned to `r4`, the one shipped node where
 * the apex's sole prey pool IS its mesopredator. At `r4` the filter drops nothing, so deleting it
 * changed no test. That is not a dead line; it is a live rule at an unreachable call site. Breaking
 * the selection out of `replayOvercatchFixture` is what makes it reachable, and this file is what
 * reaches it.
 *
 * WHAT THIS IS EVIDENCE OF: that the selection obeys §10.2's role clause at every shipped node,
 * including the eight where obeying it requires the filter. WHAT IT IS NOT: it is NOT evidence
 * that the shipped harness run exercises the filter. It does not — `replayOvercatchFixture` still
 * reads `r4`, where the filter is still a no-op. The guard is against the fixture being re-pointed,
 * and that is exactly what is tested here.
 *
 * G2: no species, node or role is invented below. Every line id, node and count is read out of
 * `data/` through `core/foodweb.ts`; the only thing this file chooses is WHICH shipped line a
 * hypothetical over-catch script hammers, and every choice is a line a player can catch at a node
 * the player can stand in.
 */

import { describe, expect, it } from "vitest";

import { deriveFoodWeb, isMesopredator, preyOf, toEcoNode } from "../../core/foodweb";
import { loadContent } from "../../tools/harness/content";
import { releasedTierOf, replayOvercatchFixture } from "../../tools/harness/fixture";
import { topOfWeb } from "../../tools/harness/full-run";
import scriptJson from "../../fixtures/overcatch-script.json";

const loaded = loadContent();
const balance = loaded.balance;

const script = scriptJson as unknown as {
  nodeId: string;
  actions: Array<{ t: string; lineId?: string }>;
};

const isMeso = (id: string): boolean => {
  const line = loaded.species.byId.get(id);
  return line !== undefined && isMesopredator(line, balance);
};

/**
 * Every shipped node that HAS a top of web, with that predator's diet split by the one tier §10.2
 * names. `sanctum` and `sanctum-approach` have no top-of-web predator at all and are absent — the
 * same nodes `replayOvercatchFixture` would throw on.
 */
interface Site {
  nodeId: string;
  topLineId: string;
  /** Prey of the top predator, most abundant first — the order the selection ranks them in. */
  preyByAbundance: string[];
  mesoPrey: string[];
  otherPrey: string[];
  template: ReturnType<typeof toEcoNode>;
}

const sites: Site[] = [];
for (const file of loaded.nodes) {
  const template = toEcoNode(file);
  const topLineId = topOfWeb(template, loaded)[0];
  if (topLineId === undefined) continue;
  const web = deriveFoodWeb(template, loaded.species, balance);
  const countOf = (id: string): number => template.populations[id]?.count ?? 0;
  const preyByAbundance = preyOf(web, topLineId)
    .slice()
    .sort((a, b) => countOf(b) - countOf(a));
  sites.push({
    nodeId: file.id,
    topLineId,
    preyByAbundance,
    mesoPrey: preyByAbundance.filter(isMeso),
    otherPrey: preyByAbundance.filter((id) => !isMeso(id)),
    template,
  });
}

describe("tools/harness/fixture.ts releasedTierOf — build-doc §10.2's release clause is one tier", () => {
  it("the shipped fixture is unmoved by the extraction, and at its node the filter drops nothing", () => {
    const hammered = script.actions.find((a) => a.t === "catch")?.lineId;
    expect(hammered, "fixtures/overcatch-script.json records no catch").toBeDefined();

    const site = sites.find((s) => s.nodeId === script.nodeId);
    expect(site, `fixtures/overcatch-script.json targets ${script.nodeId}, which has no top of web`).toBeDefined();

    // The answer the shipped harness publishes, through the shipped entry point.
    const replay = replayOvercatchFixture(loaded);
    expect(replay.nodeId).toBe(script.nodeId);
    expect(replay.hammeredLineId).toBe(hammered);
    expect(
      releasedTierOf(loaded, site!.template, site!.topLineId, replay.hammeredLineId),
      "the extracted selection disagrees with the one replayOvercatchFixture published",
    ).toBe(replay.releasedLineId);

    // WHY THE FILTER NEEDED BINDING SOMEWHERE ELSE: at this node it has nothing to drop. The apex's
    // whole diet is the mesopredator the script hammers, so the candidate list is empty before the
    // role test ever runs and the fall-through names it. Delete the filter and this stays green.
    expect(site!.otherPrey, `${script.nodeId}: the fixture node's apex eats a non-mesopredator`).toEqual([]);
    expect(site!.mesoPrey).toEqual([hammered]);
    expect(replay.releasedLineId).toBe(hammered);
  });

  it("at EVERY shipped node and EVERY over-catch target, the released tier is a mesopredator or nothing", () => {
    // The invariant §10.2 states. Driven over the whole region rather than the fixture's node,
    // because the fixture's node is the one place it holds for free.
    let pairs = 0;
    let pairsWhereTheDietCarriesAnother = 0;
    for (const site of sites) {
      for (const hammeredLineId of site.preyByAbundance) {
        const picked = releasedTierOf(loaded, site.template, site.topLineId, hammeredLineId);
        pairs += 1;
        if (site.otherPrey.length > 0) pairsWhereTheDietCarriesAnother += 1;
        const where = `${site.nodeId}: ${site.topLineId} collapsed, ${hammeredLineId} hammered`;
        if (picked === null) continue;
        expect(
          site.preyByAbundance,
          `${where}: ${picked} was named as the released tier but ${site.topLineId} does not eat it`,
        ).toContain(picked);
        expect(
          isMeso(picked),
          `${where}: ${picked} was named as the released tier and it is not a mesopredator — ` +
            `report.ts would publish its rebound as the demo beat`,
        ).toBe(true);
      }
    }
    expect(pairs, "no node exercised the selection — this test asserted nothing").toBeGreaterThan(0);
    expect(
      pairsWhereTheDietCarriesAnother,
      "no exercised diet contained a non-mesopredator, so the filter had nothing to drop anywhere " +
        "and the invariant above held for free",
    ).toBeGreaterThan(0);
  });

  it("BINDS — where a Grazer outranks the mesopredator on abundance, the mesopredator is still the answer", () => {
    /*
     * The case the filter exists for, and the one that goes red if it is deleted. A node whose apex
     * eats BOTH tiers, where the non-mesopredator is the more abundant: hammer the mesopredator and
     * the highest-ranked remaining candidate is the Grazer. The role filter empties the list instead
     * and the fall-through names the hammered mesopredator — its own recovery, which is what §10.2's
     * clause is about. Without the filter this returns the Grazer.
     *
     * On the shipped content: r2 (Fenmaw over Reedrick 24 / Mirefin 8), brackwater (18 / 6) and r3
     * (Duskstalk over Barkhide 10 / Webvern 8).
     */
    const cases = sites.filter(
      (s) =>
        s.mesoPrey.length > 0 &&
        s.otherPrey.length > 0 &&
        // The top-ranked prey once the mesopredator is hammered is a non-mesopredator.
        !isMeso(s.preyByAbundance.filter((id) => id !== s.mesoPrey[0])[0] ?? ""),
    );
    expect(
      cases.map((s) => s.nodeId),
      "no shipped node ranks a non-mesopredator above the mesopredator in a collapsed apex's diet " +
        "— the filter's whole failure mode is unexercised, so re-read the note on releasedTierOf",
    ).not.toEqual([]);

    for (const site of cases) {
      const meso = site.mesoPrey[0] as string;
      const wouldOutrank = site.preyByAbundance.filter((id) => id !== meso)[0] as string;
      const where = `${site.nodeId}: ${site.topLineId} collapsed, ${meso} hammered`;
      expect(isMeso(wouldOutrank), `${where}: ${wouldOutrank} is a mesopredator, so this is not the case`).toBe(false);
      const picked = releasedTierOf(loaded, site.template, site.topLineId, meso);
      expect(
        picked,
        `${where}: ${String(picked)} was named the released tier. ${wouldOutrank} is the most ` +
          `abundant remaining prey and a ${isMeso(wouldOutrank) ? "mesopredator" : "non-mesopredator"}; ` +
          `naming it publishes a herbivore's rebound as §10.2's release`,
      ).toBe(meso);
      expect(picked).not.toBe(wouldOutrank);
    }
  });

  it("BINDS — where the collapsed predator eats no mesopredator at all, the answer is NO LINE", () => {
    /*
     * The other half of the same guard. A node whose top predator's diet carries no mesopredator has
     * no tier for §10.2's clause to be about, and the honest answer is `null` — which surfaces as a
     * false `fullBeat` rather than a fabricated one. Without the filter the selection would name
     * whichever prey is most abundant and `releasedRose` would score its rebound.
     *
     * On the shipped content: hearthollow and r1 (Skir over three Grazers), duskhollow and r5
     * (Wispurr over Umbrat).
     */
    const cases = sites.filter((s) => s.mesoPrey.length === 0 && s.otherPrey.length > 0);
    expect(
      cases.map((s) => s.nodeId),
      "every shipped top-of-web predator eats a mesopredator — this half of the guard is unexercised",
    ).not.toEqual([]);

    for (const site of cases) {
      for (const hammeredLineId of site.preyByAbundance) {
        const remaining = site.preyByAbundance.filter((id) => id !== hammeredLineId);
        const where = `${site.nodeId}: ${site.topLineId} collapsed, ${hammeredLineId} hammered`;
        expect(
          releasedTierOf(loaded, site.template, site.topLineId, hammeredLineId),
          `${where}: a line was named as the released tier where ${site.topLineId} eats no ` +
            `mesopredator at all (the unfiltered ranking would have named ` +
            `${remaining[0] ?? hammeredLineId})`,
        ).toBeNull();
      }
    }
  });

  it("the eight nodes where the filter can bite are the eight the note on releasedTierOf names", () => {
    // The measurement in that comment, checked rather than asserted in prose. A node where the
    // collapsed predator's diet carries a non-mesopredator is a node where the filter has work to
    // do; everywhere else it is the no-op it is at r4. If this list moves, a diet or a node moved
    // with it (G2 — a content ruling), and the comment is now wrong.
    const bites = sites.filter((s) => s.otherPrey.length > 0).map((s) => s.nodeId).sort();
    expect(bites).toEqual(
      ["bowerdeep", "brackwater", "duskhollow", "hearthollow", "r1", "r2", "r3", "r5"],
    );
    const noOp = sites.filter((s) => s.otherPrey.length === 0).map((s) => s.nodeId).sort();
    expect(noOp).toEqual(["cindershelf", "r4"]);
    expect(noOp, "the fixture's own node is no longer one where the filter is a no-op").toContain(script.nodeId);
  });
});
