/**
 * tests/gates/act-checkpoint-honesty.test.ts — the permanent gate that makes act checkpoints worth
 * having: a committed tape that the rules can no longer produce must turn RED, never drift.
 *
 * WHY A GATE AND NOT A UNIT TEST. `fixtures/act-checkpoints/*.json` are recordings of a run, and a
 * recording ages. Retune `balance.clock`, rename a leader in `data/gyms.json`, move a rung of
 * `balance.acts.gates`, add a `case` to `core/save.ts` `replay` — and a tape recorded before the
 * change either still rebuilds the state it claims or it does not. If it does not, every test and
 * every agent that spawns from it is standing on a state the game cannot reach, and NOTHING ELSE IN
 * THE SUITE WOULD SAY SO: `core/save.ts` `replay` has no production caller, so the running game
 * never notices a tape it cannot rebuild. This file is the notice.
 *
 * ⚠ EVERY CHECK HERE PROVES IT CAN GO RED, in the style `tests/gates/guardrails.test.ts` sets: the
 * check runs against the shipped content, and then again against a deliberately corrupted copy of
 * the same inputs, asserting that it reports the violation. A gate that has never been shown to
 * fail is decoration. Nothing below edits a committed file to do it — the corruption is built in
 * memory, so proving the gate never leaves the repository dirty.
 *
 * WHAT THIS GATE DOES NOT CLAIM. It does not say the checkpoints are FRESH. A tape that still
 * replays after a retune is still honest — it is a run the rules can produce — it is simply an
 * older run. What it may not be is a tape that no longer rebuilds, or one that rebuilds to a
 * different act than the name on its file.
 */

import { describe, expect, it } from "vitest";

import { actOf, lastAct, runIsComplete } from "@core/acts";
import { validateContent } from "@core/schemas";
import { serialize } from "@core/save";
import type { ActionLogEntry, Balance, Content } from "@core/types";

import {
  CheckpointError,
  RUN_COMPLETE_ID,
  applyPrologue,
  canonicalTape,
  checkpointIds,
  checkpointInitialSave,
  checkpointPath,
  claimOf,
  loadAllCheckpoints,
  loadCheckpoint,
  replayTape,
  tapeDigest,
} from "@tools/checkpoints/checkpoints";

import { readFileSync } from "node:fs";

const content: Content = validateContent();
const balance: Balance = content.balance;
const ids = checkpointIds(balance);

/** A content bundle nothing else shares, so a corruption below cannot leak into another test. */
function cloneContent(): Content {
  return structuredClone(content) as Content;
}

/** One checkpoint's committed bytes, parsed. Read from disk on purpose: this gate is about the FILE. */
function rawFile(id: string): { tape: ActionLogEntry[]; tapeDigest: string; seed: number; prologue: boolean } {
  return JSON.parse(readFileSync(checkpointPath(id), "utf8")) as ReturnType<typeof rawFile>;
}

/** The last id in the ladder that has a tape worth corrupting. */
const RICH_ID = RUN_COMPLETE_ID;

/* ════════════════════════════════════════════════════════════════════════════
 * §1 Every committed tape still rebuilds, under TODAY's rules
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§1 the committed checkpoints replay under the rules as they stand now", () => {
  it("every one of them loads, and reaches the act its name claims", () => {
    /*
     * `loadCheckpoint` does the verifying — digest, `replay`, `withClockFromLog`, then `actOf` and
     * `runIsComplete` recomputed from `core/acts.ts`. This asserts it does not throw for any of
     * them, which is the whole standing claim of the fixture directory.
     */
    const all = loadAllCheckpoints({ content });
    expect(all.map((c) => c.file.id)).toEqual(ids);
    for (const c of all) {
      expect(actOf(c.save, content.gyms, balance)).toBe(claimOf(c.file.id, balance).act);
      expect(runIsComplete(c.save, content.gyms, balance)).toBe(claimOf(c.file.id, balance).runComplete);
    }
  });

  it("the act ladder is covered — a new act cannot be added without a checkpoint for it", () => {
    // Derived from `balance.acts.gates` rather than listed. This is what makes the gate keep up: a
    // seventh act would leave `checkpointIds` naming a file that does not exist, and `loadCheckpoint`
    // says so by name.
    for (const id of ids) expect(() => loadCheckpoint(id, { content })).not.toThrow();
    expect(ids).toContain(`act-${String(lastAct(balance))}`);
    expect(ids).toContain(RUN_COMPLETE_ID);
  });

  it("BINDS — a missing checkpoint is reported, not skipped", () => {
    // The negative control for the coverage check above: if `loadCheckpoint` returned something for
    // a file that is not there, "every id loads" would be worth nothing.
    expect(() => loadCheckpoint("act-999", { content })).toThrow(CheckpointError);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §2 A RULE CHANGE that makes a tape unreplayable must RED — proven, not asserted
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§2 the gate goes red when the rules move out from under a recorded tape", () => {
  it("BINDS — retuning the year meter makes an old tape refuse to load", () => {
    /*
     * THE CENTRAL PROPERTY OF THIS WHOLE LANE, driven rather than described.
     *
     * `balance.clock.ticksPerYear` decides when a year ends. Every tape here contains `yearTurn`
     * entries recorded against the shipped meter, and `game/year-replay.ts` `clockFromLog` rebuilds
     * the calendar from the entries' own `{year, tick}` and `balance.clock`'s prices. Move the
     * meter and the two answers part company — `withClockFromLog` throws "the log does not belong
     * to this save" — which is precisely the drift a stale checkpoint would otherwise hide.
     *
     * The retune is `+ 1` off the shipped value, so no number is written down here (G11).
     */
    const retuned = cloneContent();
    retuned.balance.clock.ticksPerYear = balance.clock.ticksPerYear + 1;
    expect(() => loadCheckpoint(RICH_ID, { content: retuned })).toThrow(CheckpointError);
    // …and it fails for the stated reason, not by accident somewhere else.
    expect(() => loadCheckpoint(RICH_ID, { content: retuned })).toThrow(/no longer replays/);
    // The same tape, unretuned, still loads — so the throw above is about the change, not the file.
    expect(() => loadCheckpoint(RICH_ID, { content })).not.toThrow();
  });

  it("BINDS — renaming a leader makes the tape reach a lower act, and that is refused", () => {
    /*
     * A `{t:"gymVictory", gymId}` entry writes `gym.<id>.beaten`, and `core/acts.ts` `badgeCount`
     * counts over the leaders `data/gyms.json` actually carries — deliberately, so a stray flag
     * cannot buy an act. Rename one and the recorded victory stops counting: the tape still
     * replays, but it reaches an act below the one on the file, which `loadCheckpoint` refuses.
     * This is the drift a digest alone would never catch, because the FILE did not change.
     */
    const renamed = cloneContent();
    const victim = renamed.gyms[0];
    expect(victim).toBeDefined();
    if (!victim) return;
    victim.id = `${victim.id}-renamed`;
    expect(() => loadCheckpoint(RICH_ID, { content: renamed })).toThrow(/replays to act|runIsComplete/);
  });

  it("BINDS — moving a rung of the act ladder is caught too", () => {
    /*
     * The third shape of rule change: the badges stay, the ladder moves. Requiring one more badge
     * for the top rung leaves the recorded run short of the act its file is named for.
     */
    const moved = cloneContent();
    const gates = moved.balance.acts.gates;
    const top = gates[gates.length - 1];
    expect(top).toBeDefined();
    if (!top) return;
    top.badges = content.gyms.length + 1;
    expect(() => loadCheckpoint(`act-${String(lastAct(balance))}`, { content: moved })).toThrow(
      CheckpointError,
    );
  });

  it("BINDS — a replay arm that stopped applying its entry is caught", () => {
    /*
     * A rule change INSIDE `core/save.ts` `replay` rather than in data. Modelled by deleting the
     * scripted act event the `gymVictory` arm applies through `enterPendingActs`: the tape replays,
     * and the state it reaches is quietly different from the run that was recorded. The act itself
     * survives that, so this asserts against the SAVE rather than against a throw — which is the
     * honest strength of the check and the reason §3 keeps a digest as well.
     */
    const noRaids = cloneContent();
    expect(noRaids.balance.yearEvents.raids.length).toBeGreaterThan(0);
    noRaids.balance.yearEvents.raids = [];

    const file = rawFile(RICH_ID);
    const shipped = replayTape(
      applyPrologue(checkpointInitialSave(content, file.seed), content.gyms, balance),
      file.tape,
      content,
    );
    const without = replayTape(
      applyPrologue(checkpointInitialSave(noRaids, file.seed), noRaids.gyms, noRaids.balance),
      file.tape,
      noRaids,
    );
    expect(serialize(without)).not.toBe(serialize(shipped));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §3 An EDITED tape is refused — a checkpoint is a recording, not a state to type
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§3 the loader refuses a tape that has been edited, rather than replaying it", () => {
  it("the committed digest is the digest of the committed tape", () => {
    for (const id of ids) {
      const file = rawFile(id);
      expect(tapeDigest(file.tape), `${id}: the file's tape does not hash to its own digest`).toBe(
        file.tapeDigest,
      );
    }
  });

  it("BINDS — deleting one recorded action is caught", () => {
    const file = rawFile(RICH_ID);
    const shortened = file.tape.filter((e) => e.action.t !== "gymVictory");
    expect(shortened.length).toBeLessThan(file.tape.length);
    expect(tapeDigest(shortened)).not.toBe(file.tapeDigest);
  });

  it("BINDS — a semantically neutral edit is caught too, which is what a digest is FOR", () => {
    /*
     * Changing a foray's node changes nothing `replay` applies — `{t:"foray"}` is a tick charge and
     * `replay` deliberately holds no state for it — so a verification that only re-derived the act
     * would wave this through. The digest is the reason a checkpoint is the artefact the generator
     * produced and not merely one that happens to reach the same act.
     */
    const file = rawFile(RICH_ID);
    const tampered = file.tape.map((e) =>
      e.action.t === "foray" ? { ...e, action: { ...e.action, nodeId: "somewhere-else" } } : e,
    );
    expect(canonicalTape(tampered)).not.toBe(canonicalTape(file.tape));
    expect(tapeDigest(tampered)).not.toBe(file.tapeDigest);
  });

  it("BINDS — renumbering the tape is refused by replay itself, digest or no digest", () => {
    /*
     * The digest is integrity; THIS is the substantive refusal. `replay` requires a gapless `seq`
     * from 0 and says so, so a tape assembled by hand — the exact thing this design exists to
     * prevent anybody doing — cannot be replayed at all.
     */
    const file = rawFile(RICH_ID);
    const renumbered = file.tape.map((e, i) => ({ ...e, seq: i + 1 }));
    const initial = applyPrologue(checkpointInitialSave(content, file.seed), content.gyms, balance);
    expect(() => replayTape(initial, renumbered, content)).toThrow(/gapless/);
  });

  it("BINDS — an entry with no discriminant cannot be smuggled in", () => {
    const file = rawFile(RICH_ID);
    const initial = applyPrologue(checkpointInitialSave(content, file.seed), content.gyms, balance);
    const broken = [
      ...file.tape.slice(0, 1),
      { seq: 1, year: balance.clock.startYear, tick: 0, subTick: 0, action: {} as never },
      ...file.tape.slice(2).map((e) => ({ ...e })),
    ];
    // It either dies in `replay` or reaches a different state; what it must not do is load clean.
    const before = serialize(replayTape(initial, file.tape, content));
    let after: string | null = null;
    try {
      after = serialize(replayTape(initial, broken, content));
    } catch {
      after = null;
    }
    expect(after).not.toBe(before);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * §4 The off-tape prelude cannot grow
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§4 nothing outside the recording may creep into a checkpoint", () => {
  it("only the prologue flags are applied off the tape, and only where the file says so", () => {
    /*
     * `CheckpointFile.prologue` is a BOOLEAN, so the file cannot name a flag: the names come from
     * `core/acts.ts` `prologueExitFlags`, read out of `balance.acts.gates` by code the generator and
     * the loader share. This drives that the boolean is load-bearing — replaying a tape whose file
     * says `prologue: true` onto a save that has NOT had the prelude reaches a different state.
     */
    for (const id of ids) {
      const file = rawFile(id);
      if (!file.prologue) continue;
      const initial = checkpointInitialSave(content, file.seed);
      const withPrelude = replayTape(applyPrologue(initial, content.gyms, balance), file.tape, content);
      const without = replayTape(initial, file.tape, content);
      expect(serialize(without), `${id}: the prelude changes nothing, so it is not real`).not.toBe(
        serialize(withPrelude),
      );
    }
  });

  it("every checkpoint declares what its recording left out", () => {
    for (const c of loadAllCheckpoints({ content })) {
      expect(c.file.notOnTape.length).toBeGreaterThan(0);
      expect(c.provenance.some((p) => p.startsWith("NOT on the tape"))).toBe(true);
    }
  });
});
