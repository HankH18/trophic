/**
 * tests/unit/r4-arrival.test.ts — Q6: the gate on ONE SENTENCE OF CONTENT-BIBLE §6.
 *
 * Row 4 of the bible's town table says Cindershelf is reached at *"arrival mid-collapse — Route 4's
 * web already crashed by Cullbrand strip-harvest"*. Two earlier decisions settle HOW that sentence
 * is meant to become true:
 *
 *   • `data/nodes/r4.json` ships HEALTHY. build-doc §7.2 says "sim initial state = the
 *     file as shipped", and baking a crash into the shipped counts would pre-script a collapse the
 *     sim is supposed to produce, which is the exact shape G6 forbids.
 *   • The crash therefore arrives through the scripted act-4 Cullbrand raid, applied
 *     by `core/lifecycle.ts` `enterPendingActs` on ENTRY to act 4, not at a year turn.
 *
 * WHAT THIS FILE IS EVIDENCE OF, AND WHY IT HAD TO EXIST. Act-keying the raid was asserted by
 * driving the identical act entry from two very different calendars and comparing the harvest — and
 * that comparison cannot fail, because both runs start from the SHIPPED node state and the only
 * thing that differs is `save.year`, which the raid never reads. It proves the raid removes the same
 * NUMBER on both calendars. It says nothing about the node ending up in the same STATE, and in play
 * it does not: `core/ecosim.ts` steps EVERY node at EVERY season boundary, including the ones the
 * act ladder has not opened, so a player who earns act 4 in calendar year 7 walks into a Route 4
 * that has been breeding toward `carryCap` for six years. Measured against the shipped absolute
 * body counts, the harvest that gutted the node at an early arrival was a dent at a late one and the
 * predator above it never starved at all — bible §6's sentence held at exactly one arrival.
 *
 * So the assertions below are about the STATE the player arrives into, on four very different
 * calendars, driven through the real `enterPendingActs`. `data/balance.json`
 * `yearEvents.harvestFractionOfStanding` (D-Q6-1) is what makes them pass; setting it to 0 restores
 * the old absolute-only rule and turns this file red everywhere except the shipped-state arrival.
 *
 * NO SPECIES IS NAMED HERE. The harvested lines come from the raid script, the tier above them from
 * `core/foodweb.ts` `predatorsOf`, and the tier above that from `predatorsOf` again — so the file
 * asserts a shape of web, not a cast, and renaming a creature cannot make it vacuous (G2/G6).
 */

import { describe, expect, it } from "vitest";

import { actGates, awardBadge, gateForAct } from "@core/acts";
import {
  derivePresence,
  ecoConstants,
  fromNodeState,
  makeContext,
  step,
  toNodeState,
  type SimContext,
} from "@core/ecosim";
import {
  cloneEcoNode,
  deriveFoodWeb,
  foodRatio,
  indexSpecies,
  predatorsOf,
  toEcoNode,
  type EcoNode,
} from "@core/foodweb";
import { enterPendingActs, raidRemovalAt, yearEventsOf, type RaidScript } from "@core/lifecycle";
import { createRng } from "@core/rng";
import { newSave, type SaveEnvelope } from "@core/save";
import { validateContent } from "@core/schemas";
import type { Content, NodeFile, Season } from "@core/types";
import { raidPreviews } from "@game/year-events";

const content: Content = validateContent();
const { balance, species, nodes, gyms } = content;
const index = indexSpecies(species);
const simCtx: SimContext = makeContext(
  index,
  balance,
  derivePresence(nodes.map(toEcoNode), index, balance, ecoConstants(balance)),
);

/** The one raid content-bible §6 pins to a named node and act. */
const raid: RaidScript = (() => {
  const scripted = yearEventsOf(balance);
  const first = scripted[0];
  if (!first) throw new Error("data/balance.json yearEvents.raids is empty — bible §9 authors one");
  return first;
})();

const raidNode: NodeFile = (() => {
  const file = nodes.find((n) => n.id === raid.nodeId);
  if (!file) throw new Error(`raid names node "${raid.nodeId}", which is not a node`);
  return file;
})();

const seasons: readonly Season[] = balance.clock.seasonOrder;

/**
 * The web the raid sits in, derived — never a list of names.
 *
 * `harvested` is what the script decrements; `eaters` is the tier that eats them; `above` is the
 * tier that eats THOSE. G6: nothing in the raid script names either of the last two, and nothing in
 * `core/ecosim.ts` knows a raid happened — the collapse in them has to emerge from §7.3.
 */
const shippedWeb = deriveFoodWeb(toEcoNode(raidNode), index, balance);
const harvested: string[] = raid.targets.map((t) => t.lineId);
const eaters: string[] = [...new Set(harvested.flatMap((id) => predatorsOf(shippedWeb, id)))];
const above: string[] = [...new Set(eaters.flatMap((id) => predatorsOf(shippedWeb, id)))];

/** The node as the world left it after `preSeasons` untouched season steps — nobody in the region. */
function standingAfter(preSeasons: number, seed: number): EcoNode {
  let node = toEcoNode(raidNode);
  const rng = createRng(seed);
  for (let s = 0; s < preSeasons; s += 1) {
    const season = seasons[s % seasons.length];
    if (season === undefined) throw new Error("balance.clock.seasonOrder is empty");
    node = step(node, season, rng, simCtx).node;
  }
  return node;
}

/** A save standing one rung below the raid's act, holding `node` as the raid node's live state. */
function saveBelowRaidAct(node: EcoNode): SaveEnvelope {
  let save = newSave({ seed: 1, currentNode: raid.nodeId, nodes }, balance);
  const ladder = [...gyms].sort((a, b) => a.act - b.act);
  for (const gate of actGates(balance)) {
    if (gate.act >= raid.act) break;
    for (const flag of gate.flags) {
      save = { ...save, questFlags: { ...save.questFlags, [flag]: true } };
    }
    for (const gym of ladder) {
      if (gym.act >= gate.act) break;
      save = { ...save, ...awardBadge(save, gym.id, balance) };
    }
  }
  return { ...save, nodeStates: { ...save.nodeStates, [raid.nodeId]: toNodeState(node) } };
}

/** The badge that carries the save over the raid's act gate — the act model's only numeric input. */
function earnRaidAct(save: SaveEnvelope): SaveEnvelope {
  const ladder = [...gyms].sort((a, b) => a.act - b.act);
  const gate = gateForAct(raid.act, balance);
  if (!gate) throw new Error(`no acts.gates row for act ${String(raid.act)}`);
  let out = save;
  for (const gym of ladder) {
    if (gym.act >= raid.act) break;
    out = { ...out, ...awardBadge(out, gym.id, balance) };
  }
  return out;
}

/** Arrive at the raid's act with `preSeasons` of world behind you, through the production path. */
function arriveAfter(preSeasons: number, seed: number) {
  const standing = standingAfter(preSeasons, seed);
  const before = saveBelowRaidAct(standing);
  const entry = enterPendingActs(earnRaidAct(before), { balance, gyms });
  const state = entry.save.nodeStates[raid.nodeId];
  if (!state) throw new Error("act entry lost the raid node's state");
  return {
    standing,
    before,
    entry,
    after: fromNodeState(raidNode, state),
    raidEvents: entry.events.filter((e) => e.t === "raid"),
  };
}

/** How hungry a line is, as the §7.3 step-2 check sees it. Null means "no live diet at all". */
function ratioOf(node: EcoNode, lineId: string): number {
  const value = foodRatio(node, deriveFoodWeb(node, index, balance), index, lineId, balance);
  if (value === null) throw new Error(`${lineId} has no live diet — not a starvation candidate`);
  return value;
}

/**
 * True when `lineId` is under the §7.3 step-2 starvation check right now — or is already gone.
 *
 * `foodRatio` answers null at a count of 0 (demand is zero, so there is nothing to divide), and a
 * line that has been starved out of the node is the strongest possible form of "went hungry", not a
 * missing measurement. Reading the null as "healthy" would have made this whole file green on a
 * dead node.
 */
function isStarvingOrGone(node: EcoNode, lineId: string): boolean {
  if ((node.populations[lineId]?.count ?? 0) === 0) return true;
  return ratioOf(node, lineId) < balance.ecosim.starveThreshold;
}

/**
 * The four arrivals. Not "year 4" — the calendar is unbounded and decoupled, so the only
 * honest statement of "when the player gets there" is how many seasons the world ran first.
 */
const ARRIVALS = [
  { label: "the shipped state (a player who is somehow already here)", preSeasons: 0 },
  { label: "three years of world behind them (the harness's normal pacing)", preSeasons: 12 },
  { label: "six years of world behind them", preSeasons: 24 },
  { label: "ten years of world behind them", preSeasons: 40 },
] as const;

const SEEDS = 32;
const POST_SEASONS = 12;

describe("bible §6 act 4 — the beat, transcribed", () => {
  it("pins the strip-harvest to the act that opens the town and its route", () => {
    // bible §6 row 4: Cindershelf, act 4, "arrival mid-collapse — Route 4's web already crashed by
    // Cullbrand strip-harvest". The raid must fire on the act that OPENS that route, or the player
    // arrives before or after the only beat the bible names.
    const gate = gateForAct(raid.act, balance);
    expect(gate, `acts.gates has no row for act ${String(raid.act)}`).not.toBeNull();
    expect(gate?.nodes).toContain(raid.nodeId);
    // …and only that act's entry fires it.
    expect(raid.act).toBeGreaterThan(balance.acts.first);
  });

  it("harvests only the tier below the predators, so the collapse above it is not scripted (G6)", () => {
    // The script may decrement what it harvests and nothing else. If it ever named a predator, the
    // "mid-collapse" would be authored rather than emergent — which is what G6 forbids.
    expect(harvested.length).toBeGreaterThan(0);
    expect(eaters.length).toBeGreaterThan(0);
    expect(above.length).toBeGreaterThan(0);
    for (const predator of [...eaters, ...above]) expect(harvested).not.toContain(predator);
  });
});

describe("r4 does NOT ship pre-crashed (D11) — the file is a healthy node", () => {
  it("feeds every line at the shipped state", () => {
    const node = toEcoNode(raidNode);
    const web = deriveFoodWeb(node, index, balance);
    for (const lineId of Object.keys(node.populations)) {
      const value = foodRatio(node, web, index, lineId, balance);
      if (value === null) continue; // Producers, Scavengers and Ancients have no live diet.
      expect(value, `${raid.nodeId}/${lineId} is starving before anything has happened`)
        .toBeGreaterThanOrEqual(balance.ecosim.starveThreshold);
    }
  });

  it("left alone by everyone, no line ever dips under its shipped count", () => {
    /*
     * The sharp form of "not pre-crashed", and the one nothing else asserts. A node authored into a
     * crash would sag under its own numbers here; this one holds or climbs at every seed, for three
     * years. It is also the fact that breaks an absolute-body-count raid: what the player arrives
     * into is NOT the file.
     *
     * The name used to read "only GROWS" and this comment used to say "climbs, at every seed". Both
     * outran the assertion below, which is `>=`. Measured over the shipped 12 seasons at all 32
     * seeds: `ashvole-line` 14 → 17 at worst and `pyrelisk-line` 14 → 16 at worst, neither ever
     * flat; but `cragmar-line` (10), `stonewing-line` (3) and `carricrow-line` (3) finish sitting at
     * exactly their shipped count in 7, 11 and 5 seeds — 23 of the 160 line × seed cases grow by
     * nothing at all over the three years.
     *
     * So `>=` is deliberate and `>` would be red. "Never dips" is the property that holds and the
     * one worth asserting: a node authored into a crash sags, and none of these do. What the old
     * name claimed — that every line visibly climbs — is false for three of the five, and a name
     * that outruns its assertion is how a reader comes to trust a check nobody made.
     */
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const grown = standingAfter(12, seed);
      for (const lineId of Object.keys(raidNode.populations)) {
        const shipped = raidNode.populations[lineId]?.count ?? 0;
        expect(grown.populations[lineId]?.count ?? -1, `${lineId} @ seed ${String(seed)}`)
          .toBeGreaterThanOrEqual(shipped);
      }
    }
  });
});

describe("the harvest is priced against the STANDING stock (D-Q6-1)", () => {
  it("reproduces the authored body count exactly at the shipped state", () => {
    // The fraction is read out of the authored script, so it may not move the beat bible §9 pins to
    // this node. A retune of `harvestFractionOfStanding` that changes the authored harvest is a
    // content change wearing a tuning knob, and it fails here.
    const arrival = arriveAfter(0, 1);
    expect(arrival.raidEvents).toHaveLength(raid.targets.length);
    for (const target of raid.targets) {
      const event = arrival.raidEvents.find((e) => e.t === "raid" && e.lineId === target.lineId);
      expect(event, `no raid event for ${target.lineId}`).toBeDefined();
      if (event && event.t === "raid") expect(event.removed).toBe(target.remove);
    }
  });

  it("never takes LESS than the authored body count, at any standing stock", () => {
    for (const target of raid.targets) {
      for (const count of [0, 1, target.remove, target.remove * 2, target.remove * 10]) {
        expect(raidRemovalAt(count, target, balance)).toBeGreaterThanOrEqual(target.remove);
      }
    }
  });

  it("takes strictly more than the authored total once the node has grown", () => {
    const authoredTotal = raid.targets.reduce((n, t) => n + t.remove, 0);
    for (const { preSeasons } of ARRIVALS.filter((a) => a.preSeasons > 0)) {
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const standing = standingAfter(preSeasons, seed);
        const total = raid.targets.reduce(
          (n, t) => n + raidRemovalAt(standing.populations[t.lineId]?.count ?? 0, t, balance),
          0,
        );
        expect(total, `${String(preSeasons)} seasons, seed ${String(seed)}`).toBeGreaterThan(authoredTotal);
      }
    }
  });

  it("shows the player the number it is about to take, not the number in the file", () => {
    /*
     * The read side, which used to copy `target.remove` straight onto the screen. At the shipped
     * state that was right by coincidence; at every other standing stock the preview promised one
     * harvest and the survey reported another. Preview and entry are compared through their own
     * public surfaces, at a grown node, so a drift between them cannot hide.
     */
    for (const { preSeasons } of ARRIVALS) {
      const arrival = arriveAfter(preSeasons, 7);
      const previews = raidPreviews(
        arrival.before.nodeStates,
        nodes,
        species,
        balance,
        raid.act,
      );
      expect(previews.map((p) => p.eventId)).toEqual([raid.id]);
      for (const target of previews[0]?.targets ?? []) {
        const event = arrival.raidEvents.find((e) => e.t === "raid" && e.lineId === target.lineId);
        expect(event, `no raid event for ${target.lineId}`).toBeDefined();
        if (event && event.t === "raid") {
          expect(target.before, `${target.lineId} @ ${String(preSeasons)}`).toBe(event.remaining + event.removed);
          expect(target.requested, `${target.lineId} @ ${String(preSeasons)}`).toBe(event.removed);
        }
      }
    }
  });
});

describe("ARRIVAL MID-COLLAPSE — true on ANY calendar, which is the whole of Q6", () => {
  it.each(ARRIVALS)("leaves the tier above the harvest starving — $label", ({ preSeasons }) => {
    /*
     * The invariant, stated where it can be checked the instant the player walks in: the lines that
     * eat the harvested ones are below `ecosim.starveThreshold` the moment act entry returns. This
     * is what "the web already crashed" MEANS in the sim's own terms, and it is scale-free because
     * the harvest is proportional — which is exactly why an absolute body count could not hold it.
     * Measured under the pre-D-Q6-1 rule: the ratio reached 0.658 / 0.870 / 0.733 at the three later
     * arrivals against a threshold of 0.4, i.e. no starvation at all.
     */
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const arrival = arriveAfter(preSeasons, seed);
      for (const lineId of eaters) {
        expect(ratioOf(arrival.after, lineId), `${lineId} @ ${String(preSeasons)}s seed ${String(seed)}`)
          .toBeLessThan(balance.ecosim.starveThreshold);
      }
    }
  });

  it.each(ARRIVALS)("starves the APEX, which nothing harvested — $label", ({ preSeasons }) => {
    /*
     * G6, asserted rather than asserted-about. The raid never names these lines; they go hungry
     * because the tier they eat went hungry first, through the build-doc §7.3 rules, with nothing in
     * `core/ecosim.ts` aware that an act was entered. Under the pre-D-Q6-1 rule this held in 33/64,
     * 14/64 and 5/64 seeds at the three later arrivals; it now holds in all of them.
     */
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const arrival = arriveAfter(preSeasons, seed);
      let node = cloneEcoNode(arrival.after);
      const rng = createRng(1000 + seed);
      let starved = false;
      let mesoLow = false;
      const mesoAtArrival = eaters.map((id) => node.populations[id]?.count ?? 0);
      for (let s = 0; s < POST_SEASONS; s += 1) {
        for (const lineId of above) {
          if (isStarvingOrGone(node, lineId)) starved = true;
        }
        const season = seasons[(preSeasons + s) % seasons.length];
        if (season === undefined) throw new Error("balance.clock.seasonOrder is empty");
        node = step(node, season, rng, simCtx).node;
        eaters.forEach((id, i) => {
          const start = mesoAtArrival[i] ?? 0;
          if ((node.populations[id]?.count ?? 0) * 2 <= start) mesoLow = true;
        });
      }
      expect(starved, `apex never starved @ ${String(preSeasons)}s seed ${String(seed)}`).toBe(true);
      expect(mesoLow, `mesopredator never halved @ ${String(preSeasons)}s seed ${String(seed)}`).toBe(true);
    }
  });

  it("touches nothing but the lines it harvests, on any calendar (G6)", () => {
    for (const { preSeasons } of ARRIVALS) {
      const arrival = arriveAfter(preSeasons, 3);
      const before = arrival.before.nodeStates[raid.nodeId];
      const after = arrival.entry.save.nodeStates[raid.nodeId];
      for (const lineId of Object.keys(before?.populations ?? {})) {
        if (harvested.includes(lineId)) continue;
        expect(after?.populations[lineId], `${lineId} moved @ ${String(preSeasons)}s`)
          .toEqual(before?.populations[lineId]);
      }
      // …and no other node in the region moved at all.
      for (const node of nodes) {
        if (node.id === raid.nodeId) continue;
        expect(arrival.entry.save.nodeStates[node.id], `${node.id} moved`)
          .toEqual(arrival.before.nodeStates[node.id]);
      }
    }
  });

  it("credits the deaths it caused, so the scavenger weight is a real number (Hard Req 2)", () => {
    for (const { preSeasons } of ARRIVALS) {
      const arrival = arriveAfter(preSeasons, 5);
      const before = arrival.before.nodeStates[raid.nodeId];
      const after = arrival.entry.save.nodeStates[raid.nodeId];
      const removed = arrival.raidEvents.reduce((n, e) => n + (e.t === "raid" ? e.removed : 0), 0);
      expect((after?.recentDeaths ?? 0) - (before?.recentDeaths ?? 0)).toBe(removed);
      expect(removed).toBeGreaterThan(0);
    }
  });
});
