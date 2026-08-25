/**
 * core/acts.ts — the ACT model: the second of TROPHIC's two clocks.
 *
 * ⚠ READ THIS BEFORE TOUCHING ANYTHING THAT SAYS "year".
 *
 * TROPHIC has two clocks and neither drives the other (docs/DEVIATIONS.md D-Q3-1, authorised by
 * Hank: *"the game should progress based on the player going through the gyms and side events, not
 * based on year progression. Simply switch out the time check points for event check points."*).
 *
 *   • The CALENDAR — `core/clock.ts`. Ticks → seasons → years. Never waits, never ends, has no
 *     maximum. It drives creature aging and retirement, boxed-creature aging (G10), the ecosim's
 *     season steps, map year-variant art and the season tint. It is indifferent to the player.
 *   • ACTS — this file. Driven by BADGES and QUEST FLAGS, never by time. They drive town/route
 *     unlocks, story beats, the Cullbrand raid scripts, rival encounters and the finale.
 *
 * A fast player reaches the Sanctum with young creatures; a slow player reaches the same content
 * having buried two generations. Both see the whole story. There is **no fail state, no time limit
 * and no year cap**: a player may sit in act 1 at calendar year 20, and a player may reach the
 * Sanctum in year 20 with five badges. Neither is an error and nothing here reports one.
 *
 * Where "year 6" came from: content-bible §6 opened "Six acts = six years" and the whole document
 * inherited the equation — towns listed by year, leaders by year, map variants indexed 2–6. Years
 * and acts were never two things; they were one axis wearing two names. Nobody designed a year-6
 * gate. This module is the axis that was hiding.
 *
 * Pure TypeScript, ZERO engine imports (L11) and zero gameplay literals (G11): every threshold, flag
 * name and unlock row is read from `balance.acts` (data/balance.json). The act is DERIVED from the
 * save's `questFlags` and never stored beside them — a second copy is a second thing to keep in
 * sync, which is what `game/registry.ts` says about the clock for exactly the same reason.
 */

import type { Balance, GymLeader, SaveFile } from "./types";

export class ActError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActError";
  }
}

/** One row of `balance.acts.gates`, as read. */
export interface ActGate {
  act: number;
  badges: number;
  flags: string[];
  nodes: string[];
}

/**
 * INV-3/INV-4 — a group that is absent because zod stripped it must fail loud, never default.
 *
 * `core/schemas.ts` validates balance.json with a plain `z.object`, which STRIPS unknown keys: a key
 * present in the file but missing from `zBalance` never reaches a reader, and every retune of it is
 * silently ignored. An act model that quietly defaulted to "everything unlocked" would be exactly
 * that failure wearing a playable disguise.
 */
function actsOf(balance: Balance): Balance["acts"] {
  const acts = balance.acts;
  if (!acts || !Array.isArray(acts.gates) || acts.gates.length === 0) {
    throw new ActError(
      "core/acts.ts: balance.acts is missing or has no gates. The act model is DATA " +
        "(data/balance.json) and must also be declared in core/types.ts `Balance` and " +
        "core/schemas.ts `zBalance` — z.object strips undeclared keys, so a key in the file the " +
        "schema does not know about never reaches this reader (INV-3).",
    );
  }
  return acts;
}

/** The gate rows, ascending by act. */
export function actGates(balance: Balance): ActGate[] {
  return [...actsOf(balance).gates].sort((a, b) => a.act - b.act);
}

/** The prologue act — what a save satisfying no other gate is in. */
export function firstAct(balance: Balance): number {
  return actsOf(balance).first;
}

/**
 * The last act the region HAS.
 *
 * Not a deadline and not a cap: nothing expires when the calendar passes it, and `core/clock.ts`
 * has no opinion about it at all.
 */
export function lastAct(balance: Balance): number {
  return actsOf(balance).last;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Badges — the act model's only numeric input
 * ──────────────────────────────────────────────────────────────────────────── */

/** The quest flag a beaten leader writes: `gym.<id>.beaten` on the shipped names. */
export function badgeFlagFor(gymId: string, balance: Balance): string {
  const acts = actsOf(balance);
  return `${acts.badgeFlagPrefix}${gymId}${acts.badgeFlagSuffix}`;
}

/** True when this leader's badge flag is set on the save. */
export function hasBadge(save: Pick<SaveFile, "questFlags">, gymId: string, balance: Balance): boolean {
  return save.questFlags[badgeFlagFor(gymId, balance)] === true;
}

/**
 * How many of the region's leaders this save has beaten.
 *
 * Counted over `gyms` rather than over every `gym.*.beaten`-shaped key in the save, so a stray flag
 * cannot buy an act. The gym list is content (data/gyms.json) and this module never invents one.
 */
export function badgeCount(
  save: Pick<SaveFile, "questFlags">,
  gyms: readonly GymLeader[],
  balance: Balance,
): number {
  let n = 0;
  for (const gym of gyms) if (hasBadge(save, gym.id, balance)) n += 1;
  return n;
}

/** Set a leader's badge flag. Pure: the input save is never mutated. */
export function awardBadge<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  gymId: string,
  balance: Balance,
): S {
  return { ...save, questFlags: { ...save.questFlags, [badgeFlagFor(gymId, balance)]: true } };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Which act a save is in
 * ──────────────────────────────────────────────────────────────────────────── */

/** True when every clause of `gate` holds. Badges are a count; flags are all-of. */
export function gateSatisfied(
  gate: ActGate,
  save: Pick<SaveFile, "questFlags">,
  gyms: readonly GymLeader[],
  balance: Balance,
): boolean {
  if (badgeCount(save, gyms, balance) < gate.badges) return false;
  for (const flag of gate.flags) if (!save.questFlags[flag]) return false;
  return true;
}

/**
 * The act this save is in: the HIGHEST gate it satisfies.
 *
 * Highest-satisfied rather than "first unsatisfied" because the gates are a ladder whose badge
 * counts are non-decreasing (`core/schemas.ts` checks that at boot), and because a flag-only gate
 * must not be able to strand a player who has run past it.
 *
 * ⚠ THE CLOCK IS NOT AN INPUT. There is no `year` parameter here and there must never be one. If a
 * future caller wants "act at year N", the answer is that the question is malformed.
 */
export function actOf(
  save: Pick<SaveFile, "questFlags">,
  gyms: readonly GymLeader[],
  balance: Balance,
): number {
  let act = firstAct(balance);
  for (const gate of actGates(balance)) {
    if (gateSatisfied(gate, save, gyms, balance)) act = Math.max(act, gate.act);
  }
  return act;
}

/** The gate row for `act`, or null when the region has no such act. */
export function gateForAct(act: number, balance: Balance): ActGate | null {
  return actGates(balance).find((g) => g.act === act) ?? null;
}

/** The leader whose gym belongs to `act`, or null. */
export function gymForAct(act: number, gyms: readonly GymLeader[]): GymLeader | null {
  return gyms.find((g) => g.act === act) ?? null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * What an act opens
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Every node open at `act` — the union of its gate row and every row below it.
 *
 * Cumulative on purpose: reaching act 4 does not close Hearthollow. Sorted so the set has a stable
 * order for the harness and for tests.
 */
export function unlockedNodeIds(act: number, balance: Balance): string[] {
  const out = new Set<string>();
  for (const gate of actGates(balance)) {
    if (gate.act > act) continue;
    for (const nodeId of gate.nodes) out.add(nodeId);
  }
  return [...out].sort();
}

/** True when `nodeId` is open at `act`. */
export function nodeUnlockedAt(nodeId: string, act: number, balance: Balance): boolean {
  for (const gate of actGates(balance)) {
    if (gate.act > act) continue;
    if (gate.nodes.includes(nodeId)) return true;
  }
  return false;
}

/** The lowest act that opens `nodeId`, or null when no act does. */
export function unlockActOf(nodeId: string, balance: Balance): number | null {
  for (const gate of actGates(balance)) {
    if (gate.nodes.includes(nodeId)) return gate.act;
  }
  return null;
}

/**
 * Honest coverage: nodes no act opens.
 *
 * Reported rather than defaulted. A node the act ladder never unlocks is unreachable content, and
 * silently treating it as "always open" would hide exactly that — the same reasoning as
 * `game/year-events.ts` `raidCoverage`, which reports the unauthored acts rather than inventing
 * raids for them (G2).
 */
export function ungatedNodeIds(nodeIds: readonly string[], balance: Balance): string[] {
  return nodeIds.filter((id) => unlockActOf(id, balance) === null).slice().sort();
}

/* ────────────────────────────────────────────────────────────────────────────
 * The end of the run — an act condition, never a date
 * ──────────────────────────────────────────────────────────────────────────── */

/** The flag whose truth means the run's final beat is behind the player. */
export function runCompleteFlag(balance: Balance): string {
  return actsOf(balance).runCompleteFlag;
}

/**
 * True once the finale has been earned.
 *
 * The ONLY end condition in the game. It has no calendar clause: the finale fires whenever the
 * player earns it, in year 6 or year 20, and a player who never earns it plays forever. `isOver`
 * — which used to answer "has the calendar passed year 6" and gated ticks, encounter rolls and the
 * year turn on it — is gone, along with the six-year cap it enforced.
 *
 * ⚠ IT READS TWO THINGS, AND IT HAD TO. `balance.acts.runCompleteFlag` is `story.greaves.beaten`,
 * which `data/dialogue.json` writes at the end of the Sanctum chain — and NOTHING IN `game/` READS
 * `data/dialogue.json` yet (docs/QUEUED-CHANGES.md Q7). Measured: awarding all six badges to a
 * fresh save left `runIsComplete` FALSE, so `onRunComplete` — "the seam the ending hangs off", and
 * on build-doc §16's never-cut list — was unreachable in the shipped build, where the calendar
 * condition it replaced did fire. Beating every leader in `gyms` is the same claim stated in the
 * thing the shipped build CAN observe; the flag is the story lane's marker and stays authoritative
 * for the moment the finale cutscene has actually played. Neither is derived from the other, and a
 * content set with no leaders completes on the flag alone rather than vacuously.
 */
export function runIsComplete(
  save: Pick<SaveFile, "questFlags">,
  gyms: readonly GymLeader[],
  balance: Balance,
): boolean {
  if (save.questFlags[runCompleteFlag(balance)] === true) return true;
  return gyms.length > 0 && badgeCount(save, gyms, balance) >= gyms.length;
}

/**
 * Where the act model records that the run's ending has already been handed over.
 *
 * The sibling of {@link ACT_ENTERED_FLAG}, and it exists for the same reason: `runIsComplete` is a
 * standing condition, not an edge. Nothing ever clears `story.greaves.beaten` and nothing takes a
 * badge back, so a caller that re-tested the condition on every year turn fired the ending once a
 * year, for ever — measured at three `onRunComplete` calls across three year turns of one finished
 * run, which for C7/C9 is the epilogue ledger replaying annually. The latch lives in the SAVE, so a
 * reload of a finished run does not replay the ending either.
 */
export const RUN_COMPLETE_SHOWN_FLAG = "story.runCompleteShown";

/** True when the run's ending has already been handed to whoever owns it. */
export function runCompleteShown(save: Pick<SaveFile, "questFlags">): boolean {
  return save.questFlags[RUN_COMPLETE_SHOWN_FLAG] === true;
}

/** Mark the ending handed over. Pure. */
export function markRunCompleteShown<S extends Pick<SaveFile, "questFlags">>(save: S): S {
  return { ...save, questFlags: { ...save.questFlags, [RUN_COMPLETE_SHOWN_FLAG]: true } };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Act transitions
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Where the act model records the last act whose entry beats have been applied.
 *
 * Mirrors `core/lifecycle.ts` `YEAR_TURN_FLAG` and exists for the same reason: an act's entry
 * scripts (the Cullbrand raid) may only be applied once, and "which act is the save in" cannot
 * answer that on its own — a reload, a second call in the same frame, or a replay would each
 * re-apply the decrement.
 */
export const ACT_ENTERED_FLAG = "story.actEntered";

/** The highest act whose entry has been applied, or `firstAct - 1` if none has. */
export function lastActEntered(save: Pick<SaveFile, "questFlags">, balance: Balance): number {
  const value = save.questFlags[ACT_ENTERED_FLAG];
  return typeof value === "number" ? value : firstAct(balance) - 1;
}

/**
 * The acts this save has reached but not yet entered, ascending.
 *
 * Usually zero or one row. It can be several: a player who satisfies two gates from one flag write
 * enters both, in order, and each act's scripts fire — a skipped act would be a skipped beat.
 */
export function pendingActEntries(
  save: Pick<SaveFile, "questFlags">,
  gyms: readonly GymLeader[],
  balance: Balance,
): number[] {
  const current = actOf(save, gyms, balance);
  const out: number[] = [];
  for (let act = lastActEntered(save, balance) + 1; act <= current; act += 1) out.push(act);
  return out;
}

/** Mark `act` entered. Pure. */
export function markActEntered<S extends Pick<SaveFile, "questFlags">>(save: S, act: number): S {
  return { ...save, questFlags: { ...save.questFlags, [ACT_ENTERED_FLAG]: act } };
}

/**
 * The flags the rung ABOVE the prologue requires — the opening chain's exit condition, read out of
 * `balance.acts.gates` rather than spelled anywhere in code (G11: `story.opening.done` is a name in
 * data/balance.json and data/dialogue.json, and appears in neither `core/` nor `game/` as a
 * literal).
 *
 * Exported because the act ladder's FIRST rung is the one nothing in the shipped build can climb:
 * the flags are written by `data/dialogue.json`'s opening chain, and nothing in `game/` reads that
 * file yet (docs/QUEUED-CHANGES.md Q7). `game/scenes/OverworldScene.ts` uses this to say exactly
 * which flags are missing, and — while no lane owns the opening beat — to stand in for it.
 */
export function prologueExitFlags(balance: Balance): string[] {
  return gateForAct(firstAct(balance) + 1, balance)?.flags.slice() ?? [];
}

/** Set every flag in `flags` true. Pure; an empty list returns the same save. */
export function setQuestFlags<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  flags: readonly string[],
): S {
  if (flags.length === 0) return save;
  const questFlags = { ...save.questFlags };
  for (const flag of flags) questFlags[flag] = true;
  return { ...save, questFlags };
}
