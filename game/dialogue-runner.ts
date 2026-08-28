/**
 * game/dialogue-runner.ts — the layer that was missing: `data/dialogue.json`, PLAYED.
 *
 * 499 lines, 211 entries, 62 speakers and 87 green tests shipped in this repo without a single one
 * of them reaching a player, because **nothing in `game/` read the file** (build-order C7). The
 * tests proved the corpus was well-formed, self-consistent and truthful about the game's rules;
 * none of them could prove a line was ever spoken. This module is the half that makes them
 * evidence about the game.
 *
 * WHAT IT DOES NOT DO, on purpose:
 *
 *   • **It does not resolve conditions.** `core/dialogue-schema.ts` `conditionHolds` / `selectEntry`
 *     / `selectEntryWhere` are the single resolution path and every question below is asked through
 *     them. A second resolver here would be the same defect a second act model was: `actFromFlags`
 *     used to derive `1 + badgesBeaten`, agreed with `core/acts.ts` at every rung except the
 *     prologue, and made the entire opening chain unreachable while every dialogue test passed.
 *   • **It does not know the act.** `core/acts.ts` `actOf` is the repo's only act authority and
 *     {@link dialogueContext} calls it.
 *   • **It draws nothing.** A run is a pure state machine over the corpus; `game/scenes/
 *     DialogueScene.ts` is a replayer of it, exactly as the battle scene is a replayer of
 *     `core/battle.ts`'s event log (L11's discipline, one level up).
 *   • **It writes no copy** (G2) and it moralises about nothing (G7): every string that reaches a
 *     player through here came out of `data/dialogue.json`.
 */

import { actOf } from "@core/acts";
import { seasonOf } from "@core/clock";
import {
  DIALOGUE,
  selectEntry,
  selectEntryWhere,
  type DialogueContext,
  type DialogueEntry,
  type DialogueFile,
  type DialogueKind,
  type DialogueSpeaker,
  type FlagValue,
} from "@core/dialogue-schema";
import { entryById, speakerById } from "@core/dialogue-schema";
import { appendAction, applyGrant, grantAction } from "@core/save";
import type { SaveEnvelope } from "@core/save";
import type { Balance, Content } from "@core/types";
import { liveNodeOf } from "./wild-battle";

/** The shipped, validated corpus. Import THIS, never `data/dialogue.json`. */
export { DIALOGUE };

/* ────────────────────────────────────────────────────────────────────────────
 * The context — the two clocks and the live world, from the save
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Build the `DialogueContext` the corpus is resolved against.
 *
 * Both clocks come from their own authority and neither is derived here: the ACT from
 * `core/acts.ts` `actOf` (badges + quest flags), the YEAR straight off the save, the season from
 * `core/clock.ts` `seasonOf`. `DialogueContext.act` is required and out-of-range is an exception
 * rather than `false` precisely so a caller that guessed is caught at the first lookup.
 *
 * The populations come through `liveNodeOf` — the SAME resolver the encounter roll, the HUD and the
 * catch use — so a population clause in a line and the number on the survey cannot disagree
 * (build-doc §8.3; this is the "two answers to one number" defect, on the numbers Hard Req 2 is
 * about).
 */
export function dialogueContext(save: SaveEnvelope, content: Content): DialogueContext {
  const balance: Balance = content.balance;
  const populations: Record<string, Record<string, number>> = {};
  const floraStock: Record<string, number> = {};
  for (const file of content.nodes) {
    const live = liveNodeOf(content, save, file.id);
    const counts: Record<string, number> = {};
    for (const [lineId, pop] of Object.entries(live.populations)) counts[lineId] = pop.count;
    populations[file.id] = counts;
    floraStock[file.id] = live.floraStock;
  }
  return {
    act: actOf(save, content.gyms, balance),
    year: save.year,
    season: seasonOf({ year: save.year, tick: save.tick, subTick: save.subTick ?? 0 }, balance),
    flags: save.questFlags,
    populations,
    floraStock,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * What this node has to say
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Kinds that play THEMSELVES the moment the player is standing in the node — the opening beat, the
 * act arrivals, the two Greaves cutscenes. A cutscene the player has to guess to press a key at is
 * a cutscene that does not fire.
 */
export const AUTOPLAY_KINDS: readonly DialogueKind[] = ["cutscene"];

/**
 * Kinds the interact key walks, in the order it walks them.
 *
 * QUEST BEFORE GREETING, and that ordering is load-bearing: a greeting with no `when` is eligible
 * for ever, so any order that reached it first would make every quest offer and every turn-in in
 * the game unreachable while the corpus stayed green. Ambient last for the same reason.
 *
 * `prop` is absent: a prop entry is read off its placement, not off a speaker (see
 * {@link propDialogueFor}). `battle-*` are absent because a battle SELECTS them — see
 * {@link BATTLE_KINDS} / {@link battleEntryFor}, and note that they must not be walked here: a
 * `battle-pre` reachable from the interact key is a pre-fight speech with no fight after it.
 */
export const TALK_KINDS: readonly DialogueKind[] = ["quest", "lore", "service", "greeting", "ambient"];

/**
 * The kinds a BATTLE asks for, and the third selector surface in this module.
 *
 * ⚠ NOTHING IN `game/` EVER ASKED FOR ONE OF THESE. Measured before this existed: 35 entries and 70
 * lines — every gym leader's pre- and post-battle speech, both Greaves finale entries and all
 * eighteen Wick entries — had no code path to the screen, and the three strings appeared outside
 * `data/dialogue.json` exactly once, in `core/dialogue-schema.ts`'s own kind enum. The corpus's
 * comment on {@link TALK_KINDS} said "`battle-*` are absent because a battle scene selects them",
 * and no battle scene did. That is also why `story.greaves.beaten` had no writer: `greaves.finale
 * .post` is the only entry in the repo that writes it, and it is a `battle-win`.
 *
 * The ORDER of a battle's beats is the caller's, not this list's, and it is load-bearing: the badge
 * is written FIRST and the `battle-win` played second, because `maribel.post.win` and its five
 * siblings write `gym.<id>.beaten` themselves — playing before `awardBadge` would advance the act
 * in the middle of the scene that is announcing it.
 */
export const BATTLE_KINDS: readonly DialogueKind[] = ["battle-pre", "battle-win", "battle-loss"];

/** The kind a finished fight asks for. Enumerated, so a new outcome is a decision and not a default. */
export function battleOutcomeKind(won: boolean): DialogueKind {
  return won ? "battle-win" : "battle-loss";
}

/**
 * What this fighter says at this moment of this fight.
 *
 * A THIN DELEGATION TO `selectEntry`, exactly as {@link talkEntryFor} is to `selectEntryWhere` —
 * there is no second resolver here and there must not be one. The entry's own `when` is what
 * decides whether the encounter is still standing: `wick.act3.pre` carries
 * `flagsUnset: ["rival.act3.fought"]`, so "has the player already fought him on Route 3" is a
 * question the CORPUS answers and not a second model in `game/rival.ts`.
 *
 * Refuses a non-battle kind rather than quietly answering it: this is the seam a caller reaches for
 * inside a battle callback, and a `greeting` returned there would play a townsperson's line over a
 * fight.
 */
export function battleEntryFor(
  file: DialogueFile,
  speaker: string,
  node: string,
  kind: DialogueKind,
  ctx: DialogueContext,
): DialogueEntry | undefined {
  if (!BATTLE_KINDS.includes(kind)) {
    throw new Error(`dialogue: "${kind}" is not a battle kind — ${BATTLE_KINDS.join(", ")}`);
  }
  return selectEntry(file, speaker, node, kind, ctx);
}

/** The cutscene that should be playing right now at this node, if any. */
export function autoplayEntryFor(
  file: DialogueFile,
  node: string,
  ctx: DialogueContext,
): DialogueEntry | undefined {
  for (const kind of AUTOPLAY_KINDS) {
    const found = selectEntryWhere(file, ctx, (e) => e.node === node && e.kind === kind);
    if (found) return found;
  }
  return undefined;
}

/**
 * What the interact key says next at this node.
 *
 * ⚠ A DECLARED DEVIATION, not an oversight: `data/nodes/*.json` places PROPS with an `x`/`y` and
 * places no NPC at all — `speakers[].home` names a node and nothing finer — so there is nowhere in
 * the data that says where Maren is standing. Talking is therefore "address the room": the
 * highest-priority eligible thing anyone in this node has to say. A `npcs[]` placement array would
 * change this and that is a content decision, not one to invent here (G2).
 *
 * ⚠⚠ `said` IS NOT AN OPTIMISATION — IT IS WHAT STOPS ONE LINE STARVING A CHAIN. A room's winner is
 * the highest-priority ELIGIBLE entry, and the corpus ships entries that are eligible for ever and
 * write no flag to close themselves. `maren.crash-survey` is one: `kind: "lore"`, node
 * `cindershelf`, **priority 52**, `when` = act ≥ 4 and Route 4's apex at or under one individual,
 * `setFlags` absent. The act-4 Cullbrand raid is what drives that apex down, so in ordinary play it
 * latches ON and never closes — and `maren.keystone.4`, Vellsire chain step 6, sits at **priority
 * 50** in the same room. Without this parameter, [E] at Cindershelf returns the survey line every
 * press for ever, step 6 is unreachable, and with it `chain.vellsire.complete` and the entire
 * Ancient hunt. Excluding what has already been said this visit makes every eligible entry
 * reachable in a bounded number of presses; when everything eligible has been said the exclusion is
 * dropped, so the last line repeats rather than the room falling silent (which is also how a Gold
 * townsperson behaves). The copy is untouched — this is a wiring fix, not a content edit (G2).
 */
export function talkEntryFor(
  file: DialogueFile,
  node: string,
  ctx: DialogueContext,
  said: ReadonlySet<string> = EMPTY_IDS,
): DialogueEntry | undefined {
  for (const kind of TALK_KINDS) {
    const fresh = selectEntryWhere(file, ctx, (e) => e.node === node && e.kind === kind && !said.has(e.id));
    if (fresh) return fresh;
  }
  // Everything eligible has been heard: repeat the room's winner rather than answering silence.
  for (const kind of TALK_KINDS) {
    const found = selectEntryWhere(file, ctx, (e) => e.node === node && e.kind === kind);
    if (found) return found;
  }
  return undefined;
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

/**
 * What a PROP reads out right now.
 *
 * Delegates to `core/dialogue-schema.ts` `selectPropEntry`, which discriminates on `propId` —
 * the question `selectEntry`'s (speaker, node, kind) key structurally cannot answer, because
 * Cindershelf's two shell-kiln shrines share all three.
 */
export { selectPropEntry as propDialogueFor } from "@core/dialogue-schema";

/* ────────────────────────────────────────────────────────────────────────────
 * A run
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DialogueChoiceTaken {
  entryId: string;
  index: number;
  text: string;
}

/**
 * A dialogue in progress. Immutable — every transition returns a new state, so a scene can redraw
 * from it, a test can assert on it, and neither can move it by accident.
 */
export interface DialogueRunState {
  /** The entry currently on screen. */
  readonly entryId: string;
  /** Which of that entry's lines is showing, 0-based. */
  readonly lineIndex: number;
  /** True once the whole chain has played out. */
  readonly finished: boolean;
  /** Flags the run has written so far — applied to the save with {@link applyRunFlags}. */
  readonly flags: Readonly<Record<string, FlagValue>>;
  /**
   * Items the run's COMPLETED entries granted, summed. Applied with {@link applyRunGrants}.
   *
   * ⚠ COMPLETED, NOT ENTERED — and that is the whole difference between this and {@link visited}.
   * `visited` records that an entry came ON SCREEN; a run abandoned in the middle of one must not
   * have paid out for it, or closing the box on the first line of Maren's snare tutorial would hand
   * over three snares that her `tutorial.snare.done` latch then refuses to hand over again. So this
   * is accumulated in exactly the two transitions that LEAVE an entry — {@link leaveEntry} and
   * {@link chooseOption} — beside the `setFlags` those same transitions write, so a grant and the
   * flag that latches it are written in the same step or not at all. The two are mutually exclusive
   * by construction (`advanceRun` refuses to move while a choice is on screen and `chooseOption`
   * refuses to act while one is not), so a single entry contributes exactly once.
   */
  readonly granted: Readonly<Record<string, number>>;
  /** Every entry the run has entered, in order. The loop guard reads it; the HUD reports it. */
  readonly visited: readonly string[];
  readonly choicesTaken: readonly DialogueChoiceTaken[];
  /**
   * Set when the run stopped for a reason that is not "it ended" — a `goto` that revisits an entry,
   * an id the corpus does not carry. Said out loud rather than swallowed: a chain that silently
   * stops halfway is a beat that does not happen.
   */
  readonly problem: string | null;
}

function entryOrThrow(file: DialogueFile, id: string): DialogueEntry {
  const entry = entryById(file, id);
  if (!entry) throw new Error(`dialogue: no entry "${id}" — goto targets are validated at load`);
  return entry;
}

/** The entry a state is sitting on. */
export function currentEntry(file: DialogueFile, state: DialogueRunState): DialogueEntry {
  return entryOrThrow(file, state.entryId);
}

/** The line currently on screen, with the speaker override the corpus may put on it. */
export function currentLine(
  file: DialogueFile,
  state: DialogueRunState,
): { text: string; speaker: string } {
  const entry = currentEntry(file, state);
  const line = entry.lines[state.lineIndex];
  if (!line) throw new Error(`dialogue: entry "${entry.id}" has no line ${String(state.lineIndex)}`);
  return { text: line.text, speaker: line.speaker ?? entry.speaker };
}

/** The name plate for the line on screen. Falls back to the speaker id when the table has no row. */
export function currentSpeaker(file: DialogueFile, state: DialogueRunState): DialogueSpeaker | undefined {
  return speakerById(file, currentLine(file, state).speaker);
}

/**
 * True when the box is showing the last line of an entry that offers choices — the player must pick
 * one and {@link advanceRun} deliberately will not move past it.
 */
export function awaitingChoice(file: DialogueFile, state: DialogueRunState): boolean {
  if (state.finished) return false;
  const entry = currentEntry(file, state);
  const choices = entry.choices ?? [];
  return choices.length > 0 && state.lineIndex >= entry.lines.length - 1;
}

/** The choices on screen, or an empty list. */
export function currentChoices(file: DialogueFile, state: DialogueRunState): readonly string[] {
  if (!awaitingChoice(file, state)) return [];
  return (currentEntry(file, state).choices ?? []).map((c) => c.text);
}

/** Start a run at an entry. The entry's own `when` was already checked by whoever selected it. */
export function beginRun(file: DialogueFile, entryId: string): DialogueRunState {
  entryOrThrow(file, entryId);
  return {
    entryId,
    lineIndex: 0,
    finished: false,
    flags: {},
    granted: {},
    visited: [entryId],
    choicesTaken: [],
    problem: null,
  };
}

function withFlags(
  state: DialogueRunState,
  added: Readonly<Record<string, FlagValue>> | undefined,
): Readonly<Record<string, FlagValue>> {
  return added === undefined ? state.flags : { ...state.flags, ...added };
}

/**
 * The grants side of {@link withFlags} — and it SUMS where that one overwrites.
 *
 * A flag is a value and the last writer wins; a count is stock, and two entries in one chain that
 * each hand over a snare have handed over two. `core/save.ts` `applyGrant` is additive for the same
 * reason, so this keeps the run's own tally and the tape entry it becomes on the same arithmetic.
 */
function withGrants(
  state: DialogueRunState,
  added: Readonly<Record<string, number>> | undefined,
): Readonly<Record<string, number>> {
  if (added === undefined) return state.granted;
  const out: Record<string, number> = { ...state.granted };
  for (const [itemId, qty] of Object.entries(added)) out[itemId] = (out[itemId] ?? 0) + qty;
  return out;
}

/**
 * Move into `nextId`, carrying the flags written so far.
 *
 * ⚠ THE LOOP GUARD IS NOT DECORATION. `goto` is unconditional by design ("Unconditional
 * continuation after the last line"), so a corpus edit that pointed two entries at each other would
 * hang the game inside a scene that owns the keyboard. Re-entering an entry the run has already
 * played ends the run and SAYS SO.
 */
function enter(file: DialogueFile, state: DialogueRunState, nextId: string): DialogueRunState {
  if (state.visited.includes(nextId)) {
    return {
      ...state,
      finished: true,
      problem: `dialogue: "${state.entryId}" goes to "${nextId}", which this run has already played`,
    };
  }
  entryOrThrow(file, nextId);
  return { ...state, entryId: nextId, lineIndex: 0, visited: [...state.visited, nextId] };
}

/**
 * Leave the current entry: its `setFlags` and its `grants` are written, then its `goto` is followed
 * or the run ends.
 *
 * ⚠ THE TWO ARE WRITTEN IN ONE STEP ON PURPOSE. `core/dialogue-schema.ts` refuses a granting entry
 * that is not self-latching, so the flag in `setFlags` is what stops the grant firing a second
 * time on a later run; splitting them across two transitions would put a window between the payout
 * and the latch that closes it. They ride the same object literal so there is no such window — and
 * that holds on the loop-guard path below too, which carries `carried` forward rather than `state`.
 */
function leaveEntry(file: DialogueFile, state: DialogueRunState): DialogueRunState {
  const entry = currentEntry(file, state);
  const carried: DialogueRunState = {
    ...state,
    flags: withFlags(state, entry.setFlags),
    granted: withGrants(state, entry.grants),
  };
  if (entry.goto === undefined) return { ...carried, finished: true };
  return enter(file, carried, entry.goto);
}

/**
 * One press of the advance key.
 *
 * Refuses to move while a choice is on screen — the player answers it with {@link chooseOption}.
 */
export function advanceRun(file: DialogueFile, state: DialogueRunState): DialogueRunState {
  if (state.finished) return state;
  if (awaitingChoice(file, state)) return state;
  const entry = currentEntry(file, state);
  if (state.lineIndex < entry.lines.length - 1) {
    return { ...state, lineIndex: state.lineIndex + 1 };
  }
  return leaveEntry(file, state);
}

/**
 * Take choice `index`.
 *
 * The ENTRY's flags are written first and the CHOICE's second, so a choice that restates a key wins
 * — which is the reading that lets a branch correct its own entry rather than the entry silently
 * overriding the branch the player picked.
 */
export function chooseOption(
  file: DialogueFile,
  state: DialogueRunState,
  index: number,
): DialogueRunState {
  if (state.finished) return state;
  if (!awaitingChoice(file, state)) return state;
  const entry = currentEntry(file, state);
  const choice = (entry.choices ?? [])[index];
  if (!choice) return state;

  const taken: DialogueChoiceTaken = { entryId: entry.id, index, text: choice.text };
  let next: DialogueRunState = {
    ...state,
    flags: { ...withFlags(state, entry.setFlags), ...(choice.setFlags ?? {}) },
    // The ENTRY's grants, and there is no choice-level equivalent to merge: `DialogueChoice` carries
    // `text`, `goto` and `setFlags` and `zDialogueChoice` is a `strictObject`, so a branch that
    // handed over stock would fail validation at boot rather than be silently dropped here. This is
    // the other half of {@link leaveEntry} — an entry left through a choice is an entry completed.
    granted: withGrants(state, entry.grants),
    choicesTaken: [...state.choicesTaken, taken],
  };
  if (choice.goto === undefined) return { ...next, finished: true };
  next = enter(file, next, choice.goto);
  return next;
}

/**
 * Play a whole chain with nobody watching, answering every choice with `pick`.
 *
 * THE SAME DISCIPLINE THE YEAR TURN USES for an unregistered retirement card: the beat is still
 * COMMITTED (with a documented default) and the miss is said out loud, because a beat that silently
 * does not happen is worse than a degraded one. It is also how a headless test drives the corpus
 * without standing up a renderer.
 *
 * `pick` defaults to the first option. That is a real decision, not a neutral one — on the opening
 * chain it chooses the player's starter — so every caller that reaches for it reports it.
 */
export function runHeadless(
  file: DialogueFile,
  entryId: string,
  pick: (state: DialogueRunState, choices: readonly string[]) => number = () => 0,
): DialogueRunState {
  let state = beginRun(file, entryId);
  // One step per line of the corpus is a bound nothing legitimate can reach; the loop guard in
  // `enter` is the real terminator and this only stops a pathological state machine spinning.
  const budget = file.entries.reduce((n, e) => n + e.lines.length + 1, 0);
  for (let i = 0; i < budget && !state.finished; i += 1) {
    state = awaitingChoice(file, state)
      ? chooseOption(file, state, pick(state, currentChoices(file, state)))
      : advanceRun(file, state);
  }
  return state;
}

/** Write a run's flags onto a save. Pure — the caller adopts the result. */
export function applyRunFlags<S extends { questFlags: Record<string, FlagValue> }>(
  save: S,
  state: DialogueRunState,
): S {
  if (Object.keys(state.flags).length === 0) return save;
  return { ...save, questFlags: { ...save.questFlags, ...state.flags } };
}

/**
 * Put a run's grants in the player's bag — ON THE TAPE, then applied.
 *
 * ⚠ IT GOES THROUGH `appendAction` + `applyGrant` AND NOT THROUGH `save.items`, and the difference
 * is L10 rather than style. `core/save.ts` `replay` has ZERO production callers, so a write that
 * skipped the tape would leave the replayed save short exactly the stock the live save holds, and
 * nothing in the running game would ever say so — which is precisely how `{t:"innRest"}` shipped
 * without a replay arm. `applyGrant` is the same applier `replay`'s `case "grant"` calls, so the
 * live path and the replay path cannot disagree about what is in the bag: they are one function.
 *
 * ⚠ AND IT IS THE ONLY STOCK A NEW PLAYER HAS. It used to be what switched the bag's METER on:
 * `core/battle.ts` `bagHas` reads an ABSENT key as untracked-and-therefore-unlimited, so a save
 * whose `items` had never carried `base` had infinite base snares. `core/save.ts` `emptyMeteredBag`
 * seeds every tier at 0 from boot now, so what wiring the corpus's one `grants` entry up changes is
 * the COUNT — a `base` that is refused at 0 becomes a `base` that throws three times and runs out.
 *
 * `Object.keys(...).length === 0` early-returns for the reason {@link applyRunFlags}'s does, with
 * one more consequence here: without it every dialogue in the game — 215 entries of which exactly
 * one grants anything (measured, `data/dialogue.json`) — would append an empty `{t:"grant",items:{}}` to the tape, and the log L10
 * compares byte for byte would be mostly no-ops.
 */
export function applyRunGrants(save: SaveEnvelope, state: DialogueRunState): SaveEnvelope {
  if (Object.keys(state.granted).length === 0) return save;
  const logged = appendAction(save, grantAction({ ...state.granted }));
  return applyGrant(logged, { ...state.granted });
}

/** Every line a run actually put on screen, in order — what a test asserts a player saw. */
export function transcript(file: DialogueFile, state: DialogueRunState): string[] {
  const out: string[] = [];
  for (const id of state.visited) {
    const entry = entryById(file, id);
    if (!entry) continue;
    const upTo = id === state.entryId && !state.finished ? state.lineIndex + 1 : entry.lines.length;
    for (const line of entry.lines.slice(0, upTo)) out.push(line.text);
  }
  return out;
}
