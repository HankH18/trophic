/**
 * tools/checkpoints/generate.ts — drive the real game forward and record one tape per act boundary.
 *
 *   npx tsx tools/checkpoints/generate.ts            # regenerate fixtures/act-checkpoints/
 *   npx tsx tools/checkpoints/generate.ts --check    # drive, verify, write nothing (CI / a quick read)
 *   npx tsx tools/checkpoints/generate.ts --seed 41  # a different run
 *
 * Plain `tsx`, the same way `npm run harness` runs — see the note on scenes below for why that is a
 * property worth keeping rather than an accident.
 *
 * ⚠ NOTHING HERE HAND-WRITES A SAVE. Every state change below goes through the production function
 * the shipped shell calls, in the shipped order, and the recording is `save.actionLog` — the tape
 * `core/save.ts` `replay` was built to rebuild a run from (L10). Before a checkpoint is emitted it is
 * REPLAYED and compared to the live save byte for byte (`serialize`); a mismatch aborts the run
 * rather than writing a fixture that would then be the thing every test measured.
 *
 * WHAT "THE REAL GAME" MEANS HERE, precisely, so nobody has to guess what the tape is evidence of:
 *   • the initial save is the one `game/boot.ts` `startNewGame` produces — built by
 *     `tools/checkpoints/checkpoints.ts` `checkpointInitialSave` from `core/save.ts` `newSave` and
 *     `game/wild-battle.ts` `provisionalStarter`, and BOUND to the real `startNewGame` byte for byte
 *     by §1 of `tests/unit/act-checkpoints.test.ts`;
 *   • the opening beat is `core/acts.ts` `setQuestFlags(prologueExitFlags(...))` + `enterPendingActs`
 *     — the pair `game/scenes/OverworldScene.ts` `openPrologue` + `advanceActs` run. OFF the tape,
 *     because `GameAction` has no member that can carry a quest flag;
 *   • time is `core/clock.ts` `advanceAction`, charged per action out of `balance.clock` (G11);
 *   • a season boundary steps the whole REGION once with `core/ecosim.ts` `stepRegionStates` — the
 *     single call `OverworldScene.runSeasonStep` makes;
 *   • a year end is `core/lifecycle.ts` `advanceYear` + `core/save.ts` `appendYearTurn` — "the entry
 *     point the year-turn scene (C6) and the balance harness (A5) share, so both drive identical
 *     state transitions", in that function's own words — with the region stepped once per season by
 *     `game/year-replay.ts` `replayRegionHooks`;
 *   • a gym victory is `appendAction({t:"gymVictory"})` + `core/acts.ts` `awardBadge` +
 *     `core/lifecycle.ts` `enterPendingActs` — the three calls `OverworldScene.winGym` makes.
 *
 * ⚠ NO SCENE IS IMPORTED, AND THAT IS A CORRECTNESS RULE BEFORE IT IS A LAYERING ONE.
 * This file drove `game/scenes/YearTurnScene.ts` `driveYearTurn`/`finishYearTurn` first, and that
 * broke `tests/gates/guardrails.test.ts` `no_phaser_in_node_reachable`: the scene reaches Phaser, a
 * node-side tool may not. The deeper objection is the one that decided the rewrite — a checkpoint
 * produced by booting scenes is a product of the presentation layer, and its reproducibility would
 * depend on the engine behaving identically, which is precisely the coupling the tape exists to
 * avoid. MEASURED: the switch to `advanceYear` reproduced all eight checkpoints BYTE FOR BYTE
 * (sha-256 identical), so nothing about the recorded run turned out to live in a scene. That is the
 * evidence for the claim, not an assumption behind it.
 *
 * WHAT IT IS NOT. Two absences, recorded in every checkpoint's `notOnTape` so a reader is told
 * rather than left to infer:
 *   • THE GYM FIGHT ITSELF. The badge is written the way `tools/harness/full-run.ts` writes it —
 *     "so that core/acts.ts is the thing under test" — so the tape carries no `battleAftermath` and
 *     no `payout` from a leader. A party able to beat six leaders is a play-skill question this
 *     lane does not answer, and inventing one would be the scripted state this file exists to avoid.
 *   • `OverworldScene.winGym`'s master-snare grant, which is a private method of a scene this lane
 *     may not edit. It appends its own `{t:"grant"}` entry, so a checkpoint's bag is a snare tier
 *     short of a real run's. Exporting it would close this; see the report accompanying this file.
 *
 * G11: no gameplay constant appears here. Ticks, seasons, the act ladder, the badge flags, the seed
 * and the year count are all read from `data/balance.json` and `data/gyms.json`. No `Math.random` —
 * every stream is `core/rng.ts` `subsystemRng` off the save's seed.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { actOf, awardBadge, firstAct, gymForAct, lastAct, unlockedNodeIds } from "@core/acts";
import { advanceAction, type ClockActionKind, type ClockAdvance } from "@core/clock";
import { defaultContext, stepRegionStates } from "@core/ecosim";
import { advanceYear, enterPendingActs, heirStreamKey } from "@core/lifecycle";
import { subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import { appendAction, appendYearTurn, serialize, type SaveEnvelope } from "@core/save";
import type { Content, GameAction } from "@core/types";

import { replayRegionHooks, type ReplayRegionHooks } from "@game/year-replay";

import {
  CHECKPOINT_DIR,
  CheckpointError,
  RUN_COMPLETE_ID,
  applyPrologue,
  checkpointInitialSave,
  checkpointPath,
  claimOf,
  replayTape,
  tapeDigest,
  type CheckpointFile,
} from "./checkpoints";

/** Prose carried into every checkpoint file. The absences above, stated where a reader will meet them. */
const NOT_ON_TAPE: string[] = [
  "the gym fight — the badge is written the way tools/harness/full-run.ts writes it, so no " +
    "battleAftermath and no payout from a leader reach the tape",
  "OverworldScene.winGym's master-snare grant — a private scene method this lane cannot call, so " +
    "the bag is short the tiers a real run is handed at a victory",
  "wild encounters, catches and shop purchases — this run forages for the time, not for the animals",
];

/* ────────────────────────────────────────────────────────────────────────────
 * Walking the region under the act ladder
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The shortest hop-by-hop route from `from` to `to` across nodes that are OPEN at `act`.
 *
 * Breadth-first over `NodeFile.adjacency`, restricted to `core/acts.ts` `unlockedNodeIds` — so this
 * cannot walk the player through a town the act ladder has not opened, and a region whose gym towns
 * are not reachable at the act that unlocks them makes the generator throw rather than quietly
 * teleport. Returns the hops AFTER `from`; empty when already there.
 */
function routeAcross(content: Content, act: number, from: string, to: string): string[] {
  const open = new Set(unlockedNodeIds(act, content.balance));
  if (from === to) return [];
  if (!open.has(to)) {
    throw new CheckpointError(
      `act ${String(act)} does not open "${to}" — the act ladder in data/balance.json and the gym ` +
        `towns in data/gyms.json disagree about where this leader can be fought`,
    );
  }
  const adjacency = new Map(content.nodes.map((n) => [n.id, n.adjacency]));
  const cameFrom = new Map<string, string>();
  const queue: string[] = [from];
  const seen = new Set<string>([from]);
  while (queue.length > 0) {
    const at = queue.shift() as string;
    if (at === to) break;
    for (const next of adjacency.get(at) ?? []) {
      if (seen.has(next) || !open.has(next)) continue;
      seen.add(next);
      cameFrom.set(next, at);
      queue.push(next);
    }
  }
  if (!seen.has(to)) {
    throw new CheckpointError(
      `no route from "${from}" to "${to}" across the nodes act ${String(act)} opens ` +
        `(${[...open].sort().join(", ")}) — data/nodes/*.json adjacency and balance.acts.gates disagree`,
    );
  }
  const hops: string[] = [];
  for (let at = to; at !== from; at = cameFrom.get(at) as string) hops.unshift(at);
  return hops;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The drive — one shipped action at a time
 * ──────────────────────────────────────────────────────────────────────────── */

interface Driver {
  save: SaveEnvelope;
  yearTurns: number;
  retirements: number;
  /**
   * The region mirror the year turn's season step is served from. `core/lifecycle.ts` `runYearTurn`
   * asks for a PER-NODE step while the region must be stepped as a whole — one draw off the sim
   * stream for the whole region, and Ancient presence effects reaching across adjacent nodes — so
   * this is `game/year-replay.ts` `replayRegionHooks`, the adapter `tests/unit/year-turn-ux.test.ts`
   * already proves reproduces the shipped year turn's numbers node for node.
   */
  hooks: ReplayRegionHooks;
}

/**
 * The year the clock says just ended, and the position the action carried into the new one.
 *
 * `game/scenes/YearTurnScene.ts` `yearTurnTrigger` is the shipped spelling of this and it cannot be
 * imported — that module reaches Phaser and this one runs under node (see the header). The two
 * clauses are `advanced.events`' own `yearEnd` and `advanced.clock`; nothing is computed here that
 * `core/clock.ts` did not already report.
 */
function yearEndOf(advanced: ClockAdvance): { endedYear: number; carry: { tick: number; subTick: number } } | null {
  const end = advanced.events.find((e) => e.t === "yearEnd");
  if (!end || end.t !== "yearEnd") return null;
  return { endedYear: end.year, carry: { tick: advanced.clock.tick, subTick: advanced.clock.subTick } };
}

/**
 * Spend one priced action, exactly as `OverworldScene.spendTicks` → `handleClockEvents` →
 * `beginYearTurn` does: log it, advance the real clock, step the REGION on every `seasonBoundary`
 * (never on `yearEnd` — that season is the year turn's, `core/clock.ts` says so), and run the year
 * turn with the save still standing in the ending year.
 */
function spend(
  driver: Driver,
  content: Content,
  kind: ClockActionKind,
  action: GameAction,
  simRng: ReturnType<typeof subsystemRng>,
  context: ReturnType<typeof defaultContext>,
): void {
  const balance = content.balance;
  let save = appendAction(driver.save, action);
  const tickBefore = save.tick;
  const advanced = advanceAction(
    { year: save.year, tick: save.tick, subTick: save.subTick ?? 0 },
    kind,
    balance,
  );
  save = {
    ...save,
    year: advanced.clock.year,
    tick: advanced.clock.tick,
    subTick: advanced.clock.subTick,
  };

  for (const event of advanced.events) {
    if (event.t !== "seasonBoundary") continue;
    save = appendAction(save, { t: "seasonStep", season: event.seasonEnded });
    const stepped = stepRegionStates(content.nodes, save.nodeStates, event.seasonEnded, simRng, context);
    save = { ...save, nodeStates: stepped.states };
  }

  const ended = yearEndOf(advanced);
  if (ended) {
    // The heir stream is PER YEAR — `core/lifecycle.ts` `heirStreamKey` — and re-spelling the key
    // here would be a second answer to which stream the retirement rolls come off.
    const heir = subsystemRng(save.seed, heirStreamKey(balance, ended.endedYear));
    // The mirror has to see the counts the boundary steps above just wrote, or the year turn's own
    // season step runs off a stale region. `sync` is what `ReplayRegionHooks` exposes it for.
    driver.hooks.sync(save.nodeStates);
    /*
     * `advanceYear` — "the entry point the year-turn scene (C6) and the balance harness (A5) share,
     * so both drive identical state transitions". It runs the turn AND resolves every retirement
     * prompt it raised; with no `decide` it applies the ROLLED HEIR, which is the same choice the
     * scene's headless branch (`while (!flow.done()) flow.chooseHeir()`) makes. Measured: the
     * checkpoints this produces are sha-256 identical to the ones the scene produced.
     */
    const result = advanceYear(
      { ...save, year: ended.endedYear, tick: tickBefore },
      {
        species: content.species,
        balance,
        nodes: content.nodes,
        ecosimStep: driver.hooks.ecosimStep,
        rng: () => heir.nextFloat(),
      },
    );
    driver.retirements += result.choices.length;
    // `appendYearTurn` mints the `{t:"yearTurn"}` entry and one `{t:"retirement"}` per resolved
    // prompt; the carry is put back the way `finishYearTurn` puts it back — the fraction a
    // half-tick action spent into the new year is the new year's, not a refund.
    const turned = appendYearTurn(result, tickBefore);
    save = { ...turned, tick: ended.carry.tick, subTick: ended.carry.subTick };
    driver.hooks.sync(save.nodeStates);
    driver.yearTurns += 1;
  }

  driver.save = save;
}

/** Walk to `to`, one logged hop at a time. `currentNode` moves after the charge, as `enterNode` does. */
function travelTo(
  driver: Driver,
  content: Content,
  act: number,
  to: string,
  simRng: ReturnType<typeof subsystemRng>,
  context: ReturnType<typeof defaultContext>,
): void {
  for (const hop of routeAcross(content, act, driver.save.currentNode, to)) {
    spend(driver, content, "travel", { t: "travel", to: hop }, simRng, context);
    driver.save = { ...driver.save, currentNode: hop };
  }
}

/** Forage where the player is standing until the meter fills and the year turns over. */
function forageThroughTheYear(
  driver: Driver,
  content: Content,
  simRng: ReturnType<typeof subsystemRng>,
  context: ReturnType<typeof defaultContext>,
): void {
  const balance = content.balance;
  const before = driver.yearTurns;
  // The bound is the meter itself: a year cannot need more forays than it has ticks, and a `while`
  // with no bound would hang rather than report if `advanceAction` ever stopped ending years.
  const bound = Math.ceil(balance.clock.ticksPerYear / balance.clock.forayTicks) + 1;
  for (let i = 0; i < bound && driver.yearTurns === before; i += 1) {
    spend(driver, content, "foray", { t: "foray", nodeId: driver.save.currentNode }, simRng, context);
  }
  if (driver.yearTurns === before) {
    throw new CheckpointError(
      `${String(bound)} forays did not fill the year meter (balance.clock.ticksPerYear=` +
        `${String(balance.clock.ticksPerYear)}, forayTicks=${String(balance.clock.forayTicks)}) — ` +
        `core/clock.ts stopped ending years`,
    );
  }
}

/** The three calls `game/scenes/OverworldScene.ts` `winGym` makes, minus the grant it cannot share. */
function winGym(driver: Driver, content: Content, gymId: string): void {
  const balance = content.balance;
  let save = appendAction(driver.save, { t: "gymVictory", gymId });
  save = { ...save, ...awardBadge(save, gymId, balance) };
  save = { ...save, ...enterPendingActs(save, { balance, gyms: content.gyms }).save };
  driver.save = save;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Emitting — and refusing to emit
 * ──────────────────────────────────────────────────────────────────────────── */

export interface GeneratedCheckpoint {
  file: CheckpointFile;
  /** The live save the drive produced — what the tape must replay to, byte for byte. */
  live: SaveEnvelope;
}

/**
 * Build one checkpoint and PROVE it before handing it back.
 *
 * The proof is the whole reason a checkpoint is a tape: replay it onto the same initial save the
 * loader will build, restore the clock off the log, and require `serialize` equality with the run
 * that was actually driven. A tape that does not reproduce its own run is not a checkpoint, and a
 * throw here is strictly better than a fixture nobody would ever question again.
 */
function capture(id: string, live: SaveEnvelope, content: Content, prologue: boolean): GeneratedCheckpoint {
  const tape = live.actionLog;
  const initial = checkpointInitialSave(content, live.seed);
  const based = prologue ? applyPrologue(initial, content.gyms, content.balance) : initial;
  const replayed = replayTape(based, tape, content);
  if (serialize(replayed) !== serialize(live)) {
    throw new CheckpointError(
      `checkpoint "${id}" does not replay to the run that produced it. The tape is ` +
        `${String(tape.length)} actions; the two saves differ. Nothing is written — a checkpoint ` +
        `that cannot be rebuilt from its own tape is a hand-made state wearing a recording's name. ` +
        `First divergence: ${firstDiff(serialize(live), serialize(replayed))}`,
    );
  }
  const claim = claimOf(id, content.balance);
  const act = actOf(live, content.gyms, content.balance);
  if (act !== claim.act) {
    throw new CheckpointError(
      `the drive reached act ${String(act)} where checkpoint "${id}" claims ${String(claim.act)}`,
    );
  }
  return {
    live,
    file: {
      id,
      seed: live.seed,
      prologue,
      tape: tape.map((e) => ({ ...e, subTick: e.subTick ?? 0 })),
      tapeDigest: tapeDigest(tape),
      notOnTape: NOT_ON_TAPE,
    },
  };
}

/** Where two canonical JSON strings first part company — enough to start reading, not a diff tool. */
function firstDiff(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return `byte ${String(i)}: live …${a.slice(Math.max(0, i - 60), i + 60)}… vs replayed …${b.slice(Math.max(0, i - 60), i + 60)}…`;
    }
  }
  return `one save is ${String(Math.abs(a.length - b.length))} bytes longer than the other`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The run
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Drive one run from a new game to a finished one, capturing a checkpoint at every act boundary.
 *
 * The shape of the run, and why:
 *   act 0        — the new save, before the opening beat. Zero actions; the honest floor.
 *   act 1        — the opening beat applied. Standing in the start node, no badges: BEFORE THE FIRST
 *                  GYM, which is the checkpoint an audit of the tutorial and the first fight wants.
 *   act A (≥2)   — the leader of act A-1 beaten, after a full year of forays. So act 2 is the first
 *                  YEAR TURN (the cascade's year 1 → year 2), and each later act is a year older —
 *                  the pacing `balance.clock.yearsTotal` describes as "six acts at roughly a year
 *                  each". This is what puts an AGED party in the late checkpoints, which is the only
 *                  way the retirement beat is reachable from one.
 *   run-complete — every leader beaten, so `core/acts.ts` `runIsComplete` is true: the finale and
 *                  both epilogues are the content this one exists for.
 *
 * The player is walked to the town of the gym they are about to fight, so each checkpoint stands
 * where its act's business is.
 */
export function generateCheckpoints(seed: number, content: Content): GeneratedCheckpoint[] {
  const balance = content.balance;
  const simTag = balance.rng.subsystemTags[1];
  if (simTag === undefined) throw new CheckpointError("balance.rng.subsystemTags has no sim stream");

  const simRng = subsystemRng(seed, simTag);
  const context = defaultContext();
  const out: GeneratedCheckpoint[] = [];

  const initial = checkpointInitialSave(content, seed);
  out.push(capture(`act-${String(firstAct(balance))}`, initial, content, false));

  const driver: Driver = {
    save: applyPrologue(initial, content.gyms, balance),
    yearTurns: 0,
    retirements: 0,
    // The SAME `simRng` object the boundary steps draw from, so the year turn's step lands where it
    // landed in the live shell: the region's draw order is one stream, not two.
    hooks: replayRegionHooks({
      content,
      simRng,
      initialStates: initial.nodeStates,
      context,
    }),
  };
  const opened = actOf(driver.save, content.gyms, balance);
  if (opened !== firstAct(balance) + 1) {
    throw new CheckpointError(
      `the opening beat left the run at act ${String(opened)}, not ${String(firstAct(balance) + 1)} — ` +
        `core/acts.ts prologueExitFlags no longer opens the rung above the prologue`,
    );
  }
  out.push(capture(`act-${String(opened)}`, driver.save, content, true));

  for (let act = firstAct(balance) + 1; act <= lastAct(balance); act += 1) {
    const gym = gymForAct(act, content.gyms);
    if (!gym) {
      throw new CheckpointError(
        `act ${String(act)} has no leader in data/gyms.json — the act ladder cannot be climbed ` +
          `by playing, so no checkpoint above it is reachable`,
      );
    }
    travelTo(driver, content, act, gym.town, simRng, context);
    forageThroughTheYear(driver, content, simRng, context);
    winGym(driver, content, gym.id);

    const reached = actOf(driver.save, content.gyms, balance);
    const id = act === lastAct(balance) ? RUN_COMPLETE_ID : `act-${String(reached)}`;
    if (act < lastAct(balance) && reached !== act + 1) {
      throw new CheckpointError(
        `beating "${gym.id}" left the run at act ${String(reached)}, not ${String(act + 1)} — ` +
          `data/balance.json's gates and data/gyms.json's acts disagree about the ladder`,
      );
    }
    out.push(capture(id, driver.save, content, true));
  }

  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * CLI
 * ──────────────────────────────────────────────────────────────────────────── */

/** The CLI body. Exported so a test can drive it without the process exiting under it. */
export function main(argv: readonly string[]): number {
  const check = argv.includes("--check");
  const seedAt = argv.indexOf("--seed");
  const content = validateContent();
  const balance = content.balance;
  const seedArg = seedAt >= 0 ? argv[seedAt + 1] : undefined;
  const seed = seedArg === undefined ? balance.rng.defaultSeed : Number.parseInt(seedArg, 10);
  if (!Number.isSafeInteger(seed)) {
    process.stderr.write(`--seed must be an integer, got ${String(seedArg)}\n`);
    return 2;
  }

  let generated: GeneratedCheckpoint[];
  try {
    generated = generateCheckpoints(seed, content);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  if (!check) mkdirSync(CHECKPOINT_DIR, { recursive: true });
  process.stdout.write(`seed ${String(seed)} — ${String(generated.length)} checkpoints\n`);
  for (const { file, live } of generated) {
    const json = renderCheckpoint(file);
    if (!check) writeFileSync(checkpointPath(file.id), json, "utf8");
    const retirements = live.actionLog.filter((e) => e.action.t === "retirement").length;
    process.stdout.write(
      `  ${file.id.padEnd(12)} act ${String(actOf(live, content.gyms, balance))} · ` +
        `year ${String(live.year)} tick ${String(live.tick)} · ` +
        `${String(file.tape.length)} actions · at ${live.currentNode} · ` +
        `party [${live.party.map((c) => `${c.uid}:${c.lineId}:${c.age}:L${String(c.level)}`).join(" ")}] · ` +
        `box ${String(live.box.length)} · retirements ${String(retirements)} · ` +
        `${String(json.length)} bytes\n`,
    );
  }
  if (check) process.stdout.write("--check: nothing written; every tape replayed to its own run.\n");
  return 0;
}

/**
 * A checkpoint as bytes: the frame indented, and ONE TAPE ENTRY PER LINE, compact.
 *
 * `JSON.stringify(file, null, 2)` spreads each action across six lines, which triples the file and
 * makes a regenerated tape an unreadable diff. One line per recorded action means a diff reads as
 * the run's own difference — this foray moved, that gym victory landed a year later — which is the
 * only form in which a committed recording can be reviewed at all.
 */
function renderCheckpoint(file: CheckpointFile): string {
  const head = {
    id: file.id,
    seed: file.seed,
    prologue: file.prologue,
    tapeDigest: file.tapeDigest,
    notOnTape: file.notOnTape,
  };
  const frame = JSON.stringify(head, null, 2);
  const rows = file.tape.map((e) => `    ${JSON.stringify(e)}`).join(",\n");
  const body = file.tape.length === 0 ? "[]" : `[\n${rows}\n  ]`;
  return `${frame.slice(0, -2)},\n  "tape": ${body}\n}\n`;
}

// Run only when this file IS the entry point — a test that imports `generateCheckpoints` or `main`
// must not find itself writing fixtures. `pathToFileURL` rather than a string compare so both sides
// are the same kind of thing on every platform.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
