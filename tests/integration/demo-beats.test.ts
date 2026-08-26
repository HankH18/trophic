/**
 * tests/integration/demo-beats.test.ts — build-doc §15's integration gates I2 and I3, driven
 * through the SHIPPED game modules instead of by calling the sim.
 *
 * WHY THIS FILE EXISTS. `tests/property/ecosim.test.ts` proves the cascade emerges from §7.3's
 * rules, and `tests/property/lifecycle.test.ts` proves the heir is produced. Neither says anything
 * about the game: both call `core/` directly, and every population write in them is `applyCatch`
 * called by the test. The two never-cut beats (build-doc §1) are claims about PLAY, so this file
 * drives the production functions in the production order and reports what actually happens.
 *
 * WHAT "THE REAL GAME PATH" MEANS HERE, precisely, so nobody has to guess what the green is
 * evidence of:
 *
 *   • the encounter is `game/encounters.ts` `rollForay` — the same roll `OverworldScene` makes per
 *     movement step, off the same seeded `encounter` stream;
 *   • the fight is `game/wild-battle.ts` `buildWildBattle` + `core/battle.ts` `startBattle`/`step`,
 *     the same pair `OverworldScene.beginWildBattle` builds and `BattleScene` steps;
 *   • the catch is `game/wild-battle.ts` `applyWildBattleOutcome` — the production population write,
 *     the one `OverworldScene.finishWildBattle` calls. Nothing below touches `applyCatch`;
 *   • the season boundary steps the whole region with `core/ecosim.ts` `stepRegionStates`, which is
 *     the single call `OverworldScene.runSeasonStep` makes;
 *   • the year turn is `game/scenes/YearTurnScene.ts` `driveYearTurn` + `finishYearTurn`, the same
 *     pair `OverworldScene.beginYearTurn` drives, with the retirement prompts answered by that
 *     scene's own headless branch (`while (!flow.done()) flow.chooseHeir()`).
 *
 * WHAT IT IS NOT EVIDENCE OF: no Phaser scene is constructed, so nothing here proves a pixel, an
 * input binding or a scene transition. The live drive of Title → Overworld → Battle → catch →
 * Survey → year turn is recorded in docs/LANE-BC-STATUS.md, not here.
 *
 * G6: nothing below scripts a population, a predator or an heir. The catches are the ones the
 * recorded demo script (`fixtures/overcatch-script.json`) names; everything after them is the sim.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { actOf } from "@core/acts";
import { startBattle, step as battleStep } from "@core/battle";
import { advanceAction, seasonOf } from "@core/clock";
import { defaultContext, stepRegionStates } from "@core/ecosim";
import { indexSpecies, isMesopredator } from "@core/foodweb";
import { heirStreamKey } from "@core/lifecycle";
import { subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import { appendAction, newSave, openStreams, type RngStreams, type SaveEnvelope } from "@core/save";
import type { BattleState, Content, Season } from "@core/types";

import { rollForay, type Encounter, type ForayContext } from "@game/encounters";
import {
  applyWildBattleOutcome,
  buildWildBattle,
  liveNodeOf,
  provisionalStarter,
} from "@game/wild-battle";
import { driveYearTurn, finishYearTurn } from "@game/scenes/YearTurnScene";

const content: Content = validateContent();
const balance = content.balance;
const species = indexSpecies(content.species);

const SIM = "sim";
const ENCOUNTER = "encounter";
const BATTLE = "battle";

interface Script {
  seed: number;
  nodeId: string;
  year: number;
  actions: Array<{ t: string; nodeId?: string; lineId?: string; season?: Season }>;
}

const script = JSON.parse(
  readFileSync(new URL("../../fixtures/overcatch-script.json", import.meta.url), "utf8"),
) as Script;

/**
 * The two lines the beat is about, read OUT of the script and the derived web rather than typed in
 * (G2/G3): the script names the line it over-catches, and the apex is the line that eats it.
 *
 * ⚠ `PREY` IS THE OVER-CAUGHT TARGET, NOT "the mesopredator" BY CONSTRUCTION. It is the same animal
 * here only because of which node `fixtures/overcatch-script.json` names: at `r4` the apex's ONLY
 * prey pool is its mesopredator (the fixture's own `_why` says that is why it picked the node, and
 * docs/CASCADE-RELEASE.md §2.1 shows it is the only shipped site where the two coincide). At the
 * other four apex sites the apex also eats a Grazer, so the over-caught line is a Grazer and this
 * constant would be one — which is exactly the mis-measurement that `tools/harness/full-run.ts` was
 * carrying (docs/CASCADE-RELEASE.md §3). The release test below asserts the role before it measures
 * the clause, so re-pointing the fixture at another node turns it red instead of silently scoring a
 * herbivore rebound as the beat.
 */
const PREY = script.actions.find((a) => a.t === "catch")?.lineId ?? "";
const APEX = "stonewing-line";

function countAt(save: SaveEnvelope, nodeId: string, lineId: string): number {
  return save.nodeStates[nodeId]?.populations[lineId]?.count ?? 0;
}

function contextFor(save: SaveEnvelope, nodeId: string): ForayContext {
  return {
    node: liveNodeOf(content, save, nodeId),
    species,
    balance,
    season: seasonOf({ year: save.year, tick: save.tick }, balance),
    // The ACT, never the calendar year (game/encounters.ts `rollLevel`). These beats are act 1's.
    act: actOf(save, content.gyms, balance),
  };
}

/**
 * Play one wild encounter the way a player who wants THIS animal plays it: snare with the best tier
 * every turn, and switch in a standing teammate when the reducer says the active one has fainted.
 *
 * Nothing here decides whether the catch succeeds — `core/battle.ts` does, off the seeded battle
 * stream — and nothing here moves a population; `applyWildBattleOutcome` does that or nothing does.
 */
function fightAndSnare(
  save: SaveEnvelope,
  encounter: Encounter,
  streams: RngStreams,
): { save: SaveEnvelope; outcome: BattleState["outcome"]; before: number; after: number } {
  const build = buildWildBattle({
    content,
    save,
    encounter,
    node: liveNodeOf(content, save, encounter.nodeId),
  });
  const rng = streams[BATTLE];
  if (!rng) throw new Error("no battle stream");

  let state = startBattle(build.input, build.ctx).state;
  let guard = 0;
  while (state.outcome === null && guard < 60) {
    guard += 1;
    const result = battleStep(state, { kind: "snare", tier: "master" }, rng, build.ctx);
    state = result.state;
    if (result.events.some((e) => e.t === "actionRejected")) {
      const standing = state.playerOrder.find((uid) => !state.battlers[uid]?.fainted);
      if (standing === undefined || standing === state.activePlayerUid) break;
      state = battleStep(state, { kind: "switch", uid: standing }, rng, build.ctx).state;
    }
  }

  const applied = applyWildBattleOutcome({ save, content, state, ctx: build.ctx });
  if (!applied) return { save, outcome: state.outcome, before: 0, after: 0 };
  return { save: applied.save, outcome: state.outcome, before: applied.before, after: applied.after };
}

interface CascadeRun {
  opening: { prey: number; apex: number };
  forays: number;
  battles: number;
  catches: string[];
  perSeason: Array<{ season: Season; prey: number; apex: number }>;
}

/**
 * Replay the recorded demo script at one seed, through the production catch.
 *
 * `floor` is what the PLAYER does, not what the sim does: build-doc §10.2 asks for the prey below
 * 10%, and extinction is permanent (core/ecosim.ts), so a catch that takes the last individual
 * removes the animal the release is supposed to happen to. A player watching the survey stops at 1.
 */
function runCascade(seed: number, floor: number): CascadeRun {
  const NODE = script.nodeId;
  let save = newSave({ seed, currentNode: NODE, nodes: content.nodes }, balance);
  save = { ...save, year: script.year };
  const starter = provisionalStarter(content);
  if (starter) save = { ...save, party: [starter] };

  const streams = openStreams(save, balance);
  const simContext = defaultContext();
  const encRng = streams[ENCOUNTER];
  const sim = streams[SIM];
  if (!encRng || !sim) throw new Error("streams missing");

  const opening = { prey: countAt(save, NODE, PREY), apex: countAt(save, NODE, APEX) };
  const catches: string[] = [];
  const perSeason: CascadeRun["perSeason"] = [];
  let forays = 0;
  let battles = 0;

  const meetAndCatch = (lineId: string): void => {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      for (const encounter of rollForay(contextFor(save, NODE), encRng)) {
        if (encounter.lineId !== lineId) continue;
        battles += 1;
        const played = fightAndSnare(save, encounter, streams);
        save = played.save;
        if (played.outcome === "caught") {
          catches.push(`${lineId} ${String(played.before)}→${String(played.after)}`);
          return;
        }
      }
      forays += 1;
      if (countAt(save, NODE, lineId) === 0) return;
    }
  };

  for (const action of script.actions) {
    if (action.t === "catch" && action.lineId !== undefined) {
      if (countAt(save, NODE, action.lineId) <= floor) continue;
      meetAndCatch(action.lineId);
    } else if (action.t === "seasonStep" && action.season !== undefined) {
      const stepped = stepRegionStates(content.nodes, save.nodeStates, action.season, sim, simContext);
      save = { ...save, nodeStates: stepped.states };
      perSeason.push({
        season: action.season,
        prey: countAt(save, NODE, PREY),
        apex: countAt(save, NODE, APEX),
      });
    }
  }

  return { opening, forays, battles, catches, perSeason };
}

/* ════════════════════════════════════════════════════════════════════════════
 * I2 — the cascade (build-doc §1 beat 1, §15 I2)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("I2 — over-catching a prey line through the production catch starves its predator", () => {
  const SEEDS = 24;
  const FLOOR = 1;

  it("the apex reaches 0 at EVERY seed — this half of the beat is a law, not a coin flip", () => {
    const gone: number[] = [];
    const missed: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const run = runCascade(seed, FLOOR);
      const last = run.perSeason[run.perSeason.length - 1];
      if (last && last.apex === 0) gone.push(seed);
      else missed.push(`s${String(seed)} apex[${run.perSeason.map((p) => p.apex).join(",")}]`);
    }
    expect(missed, "seeds where the apex survived the over-catch").toEqual([]);
    expect(gone.length).toBe(SEEDS);
  });

  it("the catch moves the real number, every time, and the fixture's node opens where it says", () => {
    const run = runCascade(script.seed, FLOOR);
    expect(run.opening.prey, "fixtures/overcatch-script.json _expected").toBe(14);
    expect(run.opening.apex).toBe(3);
    // Every catch is a decrement of exactly one, in an unbroken chain from the opening count. A
    // catch that failed to move the survey would show as a repeated `n→n` pair.
    let expected = run.opening.prey;
    for (const line of run.catches) {
      expect(line).toBe(`${PREY} ${String(expected)}→${String(expected - 1)}`);
      expected -= 1;
    }
    expect(run.catches.length).toBe(run.opening.prey - FLOOR);
  });

  it("HONEST GAP — the RELEASE half is not a law; it is a minority of seeds", () => {
    /*
     * build-doc §10.2 asks for the mesopredator "strictly rising within 4 seasons". LANE-A-STATUS
     * §6.2 already records that this is not a per-run law on the shipped content (16% of seeds at 4
     * seasons, measured on the SIM path). This is the same measurement on the GAME path, and it
     * agrees: the apex clause holds everywhere, the release clause does not.
     *
     * TWO THINGS THIS TEST HAS TO GET RIGHT BEFORE ITS NUMBER MEANS ANYTHING, and it used to get
     * both wrong in the same direction — crediting more seeds than §10.2 grants:
     *
     *   WHICH LINE. §10.2 names ONE tier. `PREY` is the fixture's over-catch TARGET, which is that
     *   tier at `r4` and a Grazer at four of the six apex sites (see the note on `PREY` above), so
     *   the role is ASSERTED here rather than assumed. Assuming it is the mis-measurement
     *   `tools/harness/full-run.ts` was carrying, where a rebounding Grazer read as a release
     *   (docs/CASCADE-RELEASE.md §3). The role comes from `core/foodweb.ts`, the repo's one home
     *   for it (§8.3, G3); no role name is written in this file.
     *
     *   WHICH SEASONS. "within 4 seasons" is `balance.cascade.mesoReleaseSeasons` (G11 — not a
     *   literal), counted from the season the apex hits 0. That is the arithmetic
     *   `tools/harness/full-run.ts` uses and docs/CASCADE-RELEASE.md §10 publishes, restated here
     *   so this figure is comparable to the sim-path figure it claims to agree with. This test used
     *   to accept a rise ANYWHERE in the six seasons after catching stopped — a window the balance
     *   file does not grant. MEASURED on the shipped content: the old predicate scored 5 of 24
     *   seeds (3, 5, 13, 18, 24); §10.2's window scores 3 (3, 18, 24), because seeds 5 and 13 do
     *   not rise until season 8. The baseline is unchanged by the correction — the apex reaches 0
     *   at season 3 at all 24 seeds, so `atCollapse` is the same count `trace[1]` used to read.
     *
     * The assertion is deliberately on the SHAPE of the answer, not on a threshold: it pins that
     * some seeds release and most do not, so the day a balance retune makes it a law this test goes
     * red and gets rewritten to assert the law. It is not a licence to ship the beat as is.
     *
     * The upper bound is the title's own word — a MINORITY — rather than the weaker "not all" it
     * used to be. That is not a threshold invented here; it is what the test says it measures, and
     * "not all" turned out not to bind the word "rising" at all. Sabotage-checked: relax the strict
     * rise to `value >= atCollapse` — i.e. score a mesopredator that merely HELD as released — and
     * the count goes 3 → 22, which `< SEEDS` waves through and `< SEEDS / 2` catches.
     */
    const preyLine = species.byId.get(PREY);
    expect(preyLine, `the script over-catches ${PREY}, which data/species.json does not carry`).toBeDefined();
    expect(
      isMesopredator(preyLine!, balance),
      `${PREY} is not the tier §10.2's release clause names, so every number below would be some ` +
        `other animal's rebound scored as the beat. See the note on PREY above.`,
    ).toBe(true);

    const releaseWindow = balance.cascade.mesoReleaseSeasons;
    const released: number[] = [];
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const run = runCascade(seed, FLOOR);
      const trace = run.perSeason.map((p) => p.prey);
      // The clause is conditional on the collapse, so a seed whose apex never reaches 0 counts on
      // neither side. That the collapse happens at all is the LAW asserted by the sibling test
      // above; this one only measures what follows it.
      const collapseSeason = run.perSeason.findIndex((p) => p.apex === 0);
      if (collapseSeason < 0) continue;
      const atCollapse = trace[collapseSeason - 1] ?? 0;
      const windowEnd = Math.min(trace.length, collapseSeason + releaseWindow);
      for (let s = collapseSeason; s < windowEnd; s += 1) {
        const value = trace[s] ?? 0;
        if (value > atCollapse && value > 0) {
          released.push(seed);
          break;
        }
      }
    }
    expect(released.length, "no seed releases — the beat is dead, not merely rare").toBeGreaterThan(0);
    expect(
      released.length,
      `the release is no longer a minority (${String(released.length)}/${String(SEEDS)} seeds) — ` +
        `either it has become the law §10.2 asks for, in which case rewrite this test to assert it, ` +
        `or the predicate above stopped requiring a strict rise`,
    ).toBeLessThan(SEEDS / 2);
  });

  it("the demo has a legible seed for the WHOLE beat, and it is not the fixture's", () => {
    /*
     * fixtures/overcatch-script.json records seed 12 with the trace `1 · 1 · 2 · 2 · 3 · 3 · 3`.
     * That trace comes off `core/save.ts` `replay`, which drives one RNG for the whole action log.
     * The GAME draws from the per-subsystem streams (build-doc §8.1), so the same seed produces a
     * different — equally legal — trajectory in play: at 12 the prey sits at its floor for all six
     * remaining seasons. Seed 24 is the one that shows the release on the game path.
     */
    const fixtureSeed = runCascade(script.seed, FLOOR).perSeason.map((p) => p.prey);
    const legible = runCascade(24, FLOOR).perSeason.map((p) => p.prey);
    expect(fixtureSeed[fixtureSeed.length - 1]).toBe(FLOOR);
    expect(legible[legible.length - 1]).toBeGreaterThan(FLOOR);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * I3 — the legacy (build-doc §1 beat 2, §15 I3)
 * ════════════════════════════════════════════════════════════════════════════ */

/** One clock action, with the season boundaries and the year turn the overworld runs on them. */
function spend(
  save: SaveEnvelope,
  kind: "travel" | "foray" | "inn",
  streams: RngStreams,
  simContext: ReturnType<typeof defaultContext>,
): { save: SaveEnvelope; yearTurned: boolean } {
  const advanced = advanceAction({ year: save.year, tick: save.tick }, kind, balance);
  let next: SaveEnvelope = { ...save, year: advanced.clock.year, tick: advanced.clock.tick };
  let yearTurned = false;

  for (const event of advanced.events) {
    if (event.t === "seasonBoundary") {
      next = appendAction(next, { t: "seasonStep", season: event.seasonEnded });
      const sim = streams[SIM];
      if (!sim) throw new Error("no sim stream");
      const stepped = stepRegionStates(content.nodes, next.nodeStates, event.seasonEnded, sim, simContext);
      next = { ...next, nodeStates: stepped.states };
    }
    if (event.t === "yearEnd") {
      const atEnded: SaveEnvelope = { ...save, year: event.year, tick: save.tick };
      const sim = streams[SIM];
      if (!sim) throw new Error("no sim stream");
      // The overworld's own heir stream — the SAME key `game/scenes/OverworldScene.ts`
      // `beginYearTurn` opens, imported rather than re-spelled. This harness carried its own copy of
      // `sim:heir:y<N>` for a while after the scene moved to the lifecycle tag, which meant §I3 —
      // the test that certifies the Legacy never-cut beat — was driving an heir sequence the shipped
      // game does not produce, and was green because it compared itself with itself.
      const heir = subsystemRng(save.seed, heirStreamKey(balance, event.year));
      const drive = driveYearTurn(atEnded, {
        content,
        simRng: sim,
        lifecycleRng: () => heir.nextFloat(),
        endedYear: event.year,
        reason: event.reason,
        carryTick: advanced.clock.tick,
        context: simContext,
      });
      while (!drive.flow.done()) drive.flow.chooseHeir();
      next = finishYearTurn(drive.flow.result(), drive.tickBefore, drive.carryTick);
      yearTurned = true;
    }
  }
  return { save: next, yearTurned };
}

describe("I3 — the starter retires and its heir is in the party at the league", () => {
  it("six years of turns through the shipped driver leave an heir fieldable at the finale", () => {
    let save = newSave({ seed: 7, currentNode: "hearthollow", nodes: content.nodes }, balance);
    const starter = provisionalStarter(content);
    expect(starter, "no line in data/species.json carries the 'starter' habitat sentinel").not.toBeNull();
    save = { ...save, party: [starter!] };
    const streams = openStreams(save, balance);
    const simContext = defaultContext();
    const starterUid = starter!.uid;
    /*
     * ⚠ NOT A GATE, AND NOT "THE LEAGUE YEAR" — there is no such thing (D-Q3-1). The finale is an ACT
     * condition and the calendar never ends, so this is the year NOMINAL pacing reaches, and this
     * test measures the Legacy beat at that pace. The beat on the axis that actually decides the
     * finale is measured by playing, in `tests/unit/overworld-scene.test.ts` §10.5: a run that
     * reaches act 6 in calendar year 11 arrives with the starter's great-grandchild.
     */
    const nominalLastYear = balance.clock.startYear + balance.clock.yearsTotal - 1;
    const leagueYear = nominalLastYear;

    const perYear: Array<{ year: number; party: string[]; starterPresent: boolean }> = [];
    let guard = 0;
    while (save.year <= leagueYear && guard < 400) {
      guard += 1;
      const spent = spend(save, "inn", streams, simContext);
      save = spent.save;
      if (spent.yearTurned) {
        perYear.push({
          year: save.year,
          party: save.party.map((c) => `${c.lineId} ${c.age}L${String(c.level)} ${c.uid}`),
          starterPresent: save.party.some((c) => c.uid === starterUid),
        });
      }
    }

    // The starter is gone before the league…
    const atLeague = perYear.find((row) => row.year === leagueYear);
    expect(atLeague, `no year turn produced year ${String(leagueYear)}`).toBeDefined();
    expect(atLeague!.starterPresent).toBe(false);
    // …and what stands in its place descends from it and can be fielded.
    expect(atLeague!.party.length).toBeGreaterThan(0);
    expect(atLeague!.party.some((row) => row.includes(`${starterUid}-heir`))).toBe(true);

    /*
     * HONEST GAP, and now BOUND rather than merely described: the shipped `balance.age` schedule
     * retires the starter early. bible §4 wants it to "peak right before the league"; measured on
     * this run it is gone at the year-3→4 turn. LANE-A-STATUS §6.4 (D-A4-9) records the same number
     * from the lifecycle side; this is it on the played path. The beat survives — an heir does fight
     * the finale — but the flavour does not, and fixing it is a `balance.age` retune (A5's call).
     *
     * ⚠ THIS USED TO ASSERT `< leagueYear`, WHICH THE FIX WOULD ALSO SATISFY. A schedule retuned so
     * the starter peaks right before the league retires it in year 5 — still "before the league" —
     * so the old assertion would have stayed green through the very change it was written to wait
     * for, and the gap note would have gone on claiming a defect that had been repaired. A test
     * documenting a known hole has to be the thing that says the hole is filled, so the MEASURED
     * year is pinned: closing the gap turns this red, and whoever closes it rewrites the note above.
     */
    const RETIRES_AT = 4; // MEASURED through this driver at seed 7, not derived from balance.age.
    const firstWithoutStarter = perYear.find((row) => !row.starterPresent);
    expect(firstWithoutStarter, "the starter never retires at all").toBeDefined();
    expect(firstWithoutStarter!.year).toBeLessThan(leagueYear);
    expect(
      firstWithoutStarter!.year,
      `the balance.age schedule moved: the starter now retires in year ${String(firstWithoutStarter!.year)} ` +
        `of a ${String(leagueYear)}-year nominal pace. If that is bible §4's "peaks right before the ` +
        `league", the gap above is CLOSED — rewrite this to assert the law instead of the gap.`,
    ).toBe(RETIRES_AT);
  });
});
