/**
 * game/scenes/RetirementScene.ts — THE LEGACY BEAT (build-doc §1, never-cut).
 *
 * build-doc §7.5 step 3: "any creature at 0 → retirement flow: player chooses HEIR (new J of same
 * line, level = floor(parent×0.5), inherits 1–2 randomly chosen parent traits + parent's relic slot
 * unlocked) or BOON (chosen teammate gains permanent +10% to one stat, named after the retiree)".
 *
 * This is the scene the demo video is cut around, so it is built as a REAL CHOICE with the
 * consequences stated in numbers on both sides: what the retiree was, what the heir would be, what a
 * teammate would become. Every number is either read off core/ or produced by ASKING core/ what a
 * choice does — see {@link RetirementFlow}. There is no arithmetic in this file that build-doc §7.5
 * describes; a second implementation of the heir's level or the boon's size is exactly the drift
 * that once had the creature card and the battle reading two different keys for one +10%, so
 * retuning either alone made them disagree.
 *
 * G7 — no moralizing copy. Nothing here characterises retirement, catching or loss. The card shows
 * a level, a trait list, five stats and two dates; the arrow between the numbers is the whole of the
 * argument.
 *
 * Determinism: the heir offer is rolled from the injected seeded stream ONCE per prompt, whichever
 * side the player then picks — the same discipline core/lifecycle.ts `advanceYear` keeps, so a run
 * where the player takes BOON and a run where they take HEIR leave the stream in the same place
 * (build-doc §8.1: identical (seed, actionLog) ⇒ byte-identical save).
 *
 * Engine-free at runtime: the flow is pure and `import type` is the only phaser reference, because
 * importing phaser under vitest's node environment throws (`window is not defined`). The Phaser
 * scene is produced by {@link createRetirementScene}, which takes the engine as an argument.
 */

import { effectiveStats } from "@core/battle";
import type {
  AdvanceYearResult,
  Cohort,
  RandomFn,
  RejectedChoice,
  YearRetirementPrompt,
  YearTurnEvent,
  YearTurnResult,
} from "@core/lifecycle";
import {
  boonTargetUids,
  indexSpecies,
  isNever,
  lineOf,
  retirementChoiceProblem,
  retiresBeyondFinalYear,
  resolveRetirement,
  rollHeirChoice,
} from "@core/lifecycle";
import type { SaveEnvelope } from "@core/save";
import type {
  AgeClass,
  Balance,
  Boon,
  Content,
  OwnedCreature,
  RetirementChoice,
  StatKey,
  Stats,
  Trait,
} from "@core/types";
import { AGE_CLASSES, STAT_KEYS } from "@core/types";
// Engine-free (`data/palette.json` and arithmetic, no phaser), so the card's colours can be
// resolved here without pulling the engine into a node test's module graph.
import { swatchColor, swatchHex } from "@game/ui/Palette";

/** The class an heir is born at, taken from core's vocabulary rather than written out here. */
const YOUNGEST_AGE_CLASS: AgeClass = AGE_CLASSES[0];

/* ────────────────────────────────────────────────────────────────────────────
 * What the player is shown
 * ──────────────────────────────────────────────────────────────────────────── */

/** The retiree. "What is being lost", in the numbers it is being lost in. */
export interface ParentCard {
  uid: string;
  lineId: string;
  formName: string;
  age: AgeClass;
  level: number;
  where: Cohort;
  caughtYear: number;
  /** Years the player held it — `year of retirement − caughtYear`. */
  yearsHeld: number;
  traits: Trait[];
  boons: Boon[];
  relicSlot: string | null;
  stats: Stats;
}

/**
 * Who the rolled heir would BE. Known on both paths — core rolls the identity and the inherited
 * traits before anything asks whether there is room for it.
 */
export interface HeirIdentity {
  heirUid: string;
  lineId: string;
  formName: string;
  age: AgeClass;
  inheritedTraitIds: string[];
  inheritedTraits: Trait[];
  relicSlot: string | null;
}

/**
 * What the rolled heir would BE WORTH. These exist only when the heir can actually be built, because
 * every one of them is read off the creature `resolveRetirement` returns — there is no arithmetic
 * here to fall back on.
 */
export interface HeirNumbers {
  level: number;
  /** `parent.level − heir.level`, for the "what is being lost" column. */
  levelDrop: number;
  stats: Stats;
  /** heir stat − parent stat, per stat. Negative is the honest number here. */
  statDelta: Stats;
  projectedRetirementYear: number;
  /** True when the heir's retirement lands past the final year (core/lifecycle.ts). */
  retiresBeyondFinalYear: boolean;
}

/**
 * The HEIR side of the choice, as core/lifecycle.ts would actually build it.
 *
 * A UNION, not one interface with a `problem` field beside the numbers. The unavailable branch used
 * to publish `level: 0`, all-zero stats and `projectedRetirementYear: 0` — values core can never
 * produce (`balance.retirement.heirLevelMin` is 1) and which any consumer reading the field without
 * checking `problem` would print as a real level-0 heir. Now those fields are not there to read:
 * narrowing on `problem === null` is the only way to reach a number, so the check cannot be skipped
 * by accident.
 */
export type HeirOffer =
  | (HeirIdentity & HeirNumbers & { problem: null })
  | (HeirIdentity & { problem: string });

/** One legal BOON target, for one stat. */
export interface BoonTargetOffer {
  targetUid: string;
  formName: string;
  level: number;
  where: Cohort;
  statBefore: number;
  statAfter: number;
  /** statAfter − statBefore. */
  gain: number;
}

/** The BOON side, per stat. */
export interface BoonOffer {
  stat: StatKey;
  /** The name core/lifecycle.ts gives the boon — "<retiree>'s Legacy". Read, never composed here. */
  boonName: string;
  targets: BoonTargetOffer[];
  /** Non-null when no legal target exists for this stat (the whole party retired together). */
  problem: string | null;
}

export interface RetirementOffer {
  prompt: YearRetirementPrompt;
  year: number;
  /** Position in this year turn's queue, 1-based — "2 of 3". */
  ordinal: number;
  total: number;
  parent: ParentCard;
  heir: HeirOffer;
  boons: BoonOffer[];
  /** True when neither side can be applied as offered; the rolled HEIR is the documented fallback. */
  deadlocked: boolean;
}

export interface RetirementFlowDeps {
  content: Content;
  /** The seeded lifecycle stream (build-doc §8.1) — `subsystemRng(save.seed, tag)`. */
  rng: RandomFn;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The flow — pure, and the single driver both the scene and a headless run use
 * ──────────────────────────────────────────────────────────────────────────── */

export class RetirementFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetirementFlowError";
  }
}

/**
 * One year turn's retirement prompts, answered one at a time.
 *
 * `core/lifecycle.ts` `advanceYear` does the same job with a decider function and no UI; this does
 * it with a cursor so a scene can sit between two prompts. Both call the same core functions in the
 * same order, so the save they produce for the same choices is the same save.
 */
export class RetirementFlow {
  private readonly balance: Balance;
  private readonly prompts: YearRetirementPrompt[];
  private readonly retiredByUid = new Map<string, OwnedCreature>();
  private readonly rolled = new Map<string, RetirementChoice>();
  private readonly events: YearTurnEvent[];
  private readonly choices: RetirementChoice[] = [];
  private readonly rejected: RejectedChoice[] = [];
  private cursor = 0;
  private save: SaveEnvelope;

  constructor(
    private readonly turn: YearTurnResult,
    private readonly deps: RetirementFlowDeps,
  ) {
    this.balance = deps.content.balance;
    this.prompts = [...turn.prompts];
    this.save = turn.save as SaveEnvelope;
    this.events = [...turn.events];
    for (const creature of turn.retired) this.retiredByUid.set(creature.uid, creature);
  }

  /** Prompts still unanswered, including the current one. */
  remaining(): number {
    return Math.max(0, this.prompts.length - this.cursor);
  }

  done(): boolean {
    return this.cursor >= this.prompts.length;
  }

  currentPrompt(): YearRetirementPrompt | null {
    return this.prompts[this.cursor] ?? null;
  }

  /**
   * The heir core would roll for this prompt — drawn from the seeded stream exactly once, cached, and
   * drawn whether or not the player ends up taking it. Taking the draw only on the HEIR path would
   * make the RNG position depend on a player decision, which breaks replay (build-doc §8.1).
   */
  private rolledHeir(prompt: YearRetirementPrompt): RetirementChoice {
    const cached = this.rolled.get(prompt.parentUid);
    if (cached) return cached;
    const choice = rollHeirChoice(prompt, this.deps.rng, this.balance, this.save.year);
    this.rolled.set(prompt.parentUid, choice);
    return choice;
  }

  /** The full offer for the current prompt, with both sides priced. */
  offer(): RetirementOffer | null {
    const prompt = this.currentPrompt();
    if (!prompt) return null;
    return this.offerFor(prompt);
  }

  private offerFor(prompt: YearRetirementPrompt): RetirementOffer {
    const { content } = this.deps;
    const index = indexSpecies(content.species);
    const line = lineOf(index, prompt.lineId);
    const retiree = this.retiredByUid.get(prompt.parentUid);
    if (!retiree) {
      throw new RetirementFlowError(
        `no retired creature for prompt "${prompt.parentUid}" — the flow was handed prompts ` +
          "without the matching `retired` list from the same year turn",
      );
    }

    const parentStats = effectiveStats({
      line,
      age: retiree.age,
      level: retiree.level,
      balance: this.balance,
      traits: retiree.traits,
      boons: retiree.boons,
      ...(retiree.metamorphosed === undefined ? {} : { metamorphosed: retiree.metamorphosed }),
    });

    const parent: ParentCard = {
      uid: retiree.uid,
      lineId: retiree.lineId,
      formName: prompt.formName,
      age: retiree.age,
      level: retiree.level,
      where: prompt.where,
      caughtYear: retiree.caughtYear,
      yearsHeld: Math.max(0, this.save.year - retiree.caughtYear),
      traits: retiree.traits.map((t) => ({ ...t })),
      boons: retiree.boons.map((b) => ({ ...b })),
      relicSlot: retiree.relicSlot ?? null,
      stats: parentStats,
    };

    // Priced in this order on purpose: whether the prompt is answerable at all decides whether the
    // heir is ROLLED, and a roll spends a draw from the seeded stream (see {@link apply}).
    const boons = STAT_KEYS.map((stat) => this.priceBoon(prompt, stat));
    const deadlocked = this.deadlockedFor(prompt);
    const heir = this.priceHeir(prompt, parent, deadlocked);

    return {
      prompt,
      year: this.save.year,
      ordinal: this.cursor + 1,
      total: this.prompts.length,
      parent,
      heir,
      boons,
      deadlocked,
    };
  }

  /**
   * Whether an heir could be PLACED at all, asked without rolling one.
   *
   * `retirementChoiceProblem` answers two questions for a HEIR choice: are the inherited traits the
   * parent's (a roll can never fail this — the pool IS the parent's trait ids), and is there room in
   * the party or the box. Handing it a heir choice that inherits nothing isolates the second, which
   * is the only one that can make a prompt unanswerable. Core keeps the rule; this asks it.
   */
  private heirRoomProblem(prompt: YearRetirementPrompt): string | null {
    return retirementChoiceProblem(
      this.save,
      prompt,
      { kind: "heir", parentUid: prompt.parentUid, inheritedTraitIds: [], heirUid: prompt.parentUid },
      this.balance,
    );
  }

  /**
   * True when NEITHER side of this prompt can be applied: no room for an heir, and no legal target
   * for any of the five boon stats.
   *
   * Asked from `boonTargetUids` (core's own list) rather than from the priced offer, so it is cheap
   * enough to ask before deciding whether to spend a draw.
   */
  private deadlockedFor(prompt: YearRetirementPrompt): boolean {
    if (this.heirRoomProblem(prompt) === null) return false;
    return STAT_KEYS.every((stat) => boonTargetUids(this.save, this.balance, stat).length === 0);
  }

  /**
   * Price the HEIR by ASKING core/lifecycle.ts to build it, on a copy of the save that is then
   * thrown away. `resolveRetirement` is pure, so this costs one object graph and no state — and it
   * is the only way to show the heir's level and traits before the choice without restating
   * build-doc §7.5 step 3's `floor(parent × heirLevelFactor)` in a second place.
   *
   * `deadlocked` means the prompt cannot be answered on either side; then NOTHING IS ROLLED, because
   * a roll is a draw from the seeded stream and this prompt will never reach the action log for a
   * replay to draw against (see {@link apply}). What is shown is core's own reason and the identity
   * the line gives — no inherited traits, because none were rolled.
   */
  private priceHeir(
    prompt: YearRetirementPrompt,
    parent: ParentCard,
    deadlocked: boolean,
  ): HeirOffer {
    const { content } = this.deps;
    const index = indexSpecies(content.species);
    const line = lineOf(index, prompt.lineId);

    const roomProblem = this.heirRoomProblem(prompt);
    if (deadlocked && roomProblem !== null) {
      return {
        heirUid: prompt.parentUid,
        lineId: prompt.lineId,
        formName: line.formNames[YOUNGEST_AGE_CLASS],
        age: YOUNGEST_AGE_CLASS,
        inheritedTraitIds: [],
        inheritedTraits: [],
        relicSlot: prompt.relicSlot ?? null,
        problem: roomProblem,
      };
    }

    const choice = this.rolledHeir(prompt);
    const problem = retirementChoiceProblem(this.save, prompt, choice, this.balance);

    const inheritedTraitIds = choice.kind === "heir" ? [...choice.inheritedTraitIds] : [];
    const heirUid = choice.kind === "heir" ? choice.heirUid : prompt.parentUid;

    if (problem !== null) {
      // The heir cannot be built on this save, so there is nothing honest to price — and the type
      // says so: the numbers are ABSENT rather than zeroed. Everything the UI still needs to show —
      // which traits were rolled, and why the button is greyed — is here.
      const byId = new Map(prompt.traits.map((t) => [t.id, t] as const));
      const inheritedTraits = inheritedTraitIds
        .map((id) => byId.get(id))
        .filter((t): t is Trait => t !== undefined)
        .map((t) => ({ ...t }));
      return {
        heirUid,
        lineId: prompt.lineId,
        formName: line.formNames[YOUNGEST_AGE_CLASS],
        age: YOUNGEST_AGE_CLASS,
        inheritedTraitIds,
        inheritedTraits,
        relicSlot: prompt.relicSlot ?? null,
        problem,
      };
    }

    const preview = resolveRetirement(this.save, prompt, choice, {
      species: content.species,
      balance: this.balance,
    });
    const heir = preview.heir;
    if (!heir) {
      throw new RetirementFlowError(
        `core/lifecycle.ts resolved a HEIR choice for "${prompt.parentUid}" without returning an heir`,
      );
    }

    const stats = effectiveStats({
      line,
      age: heir.age,
      level: heir.level,
      balance: this.balance,
      traits: heir.traits,
      boons: heir.boons,
      ...(heir.metamorphosed === undefined ? {} : { metamorphosed: heir.metamorphosed }),
    });

    const statDelta: Stats = { hp: 0, atk: 0, def: 0, spd: 0, ins: 0 };
    for (const key of STAT_KEYS) statDelta[key] = stats[key] - parent.stats[key];

    return {
      heirUid: heir.uid,
      lineId: heir.lineId,
      formName: line.formNames[heir.age],
      age: heir.age,
      level: heir.level,
      levelDrop: parent.level - heir.level,
      inheritedTraitIds,
      inheritedTraits: heir.traits.map((t) => ({ ...t })),
      relicSlot: heir.relicSlot ?? null,
      stats,
      statDelta,
      projectedRetirementYear: heir.projectedRetirementYear,
      retiresBeyondFinalYear: retiresBeyondFinalYear(heir, this.balance),
      problem: null,
    };
  }

  /** Price the BOON for one stat, the same way: apply it on a throwaway copy and read the numbers. */
  private priceBoon(prompt: YearRetirementPrompt, stat: StatKey): BoonOffer {
    const { content } = this.deps;
    const index = indexSpecies(content.species);
    const legal = boonTargetUids(this.save, this.balance, stat);
    const owned = [...this.save.party, ...this.save.box];
    const targets: BoonTargetOffer[] = [];
    let boonName = "";

    for (const creature of owned) {
      if (!legal.includes(creature.uid)) continue;
      const choice: RetirementChoice = {
        kind: "boon",
        parentUid: prompt.parentUid,
        targetUid: creature.uid,
        stat,
      };
      if (retirementChoiceProblem(this.save, prompt, choice, this.balance) !== null) continue;

      const preview = resolveRetirement(this.save, prompt, choice, {
        species: content.species,
        balance: this.balance,
      });
      if (preview.boon) boonName = preview.boon.name;
      const after = [...preview.save.party, ...preview.save.box].find((c) => c.uid === creature.uid);
      if (!after) continue;

      const line = lineOf(index, creature.lineId);
      const common = {
        line,
        age: creature.age,
        level: creature.level,
        balance: this.balance,
        traits: creature.traits,
        ...(creature.metamorphosed === undefined ? {} : { metamorphosed: creature.metamorphosed }),
      };
      const before = effectiveStats({ ...common, boons: creature.boons });
      const boosted = effectiveStats({ ...common, boons: after.boons });

      targets.push({
        targetUid: creature.uid,
        formName: line.formNames[creature.age],
        level: creature.level,
        where: creature.boxed === true ? "box" : "party",
        statBefore: before[stat],
        statAfter: boosted[stat],
        gain: boosted[stat] - before[stat],
      });
    }

    return {
      stat,
      boonName,
      targets,
      // Short on purpose: this is drawn inside a half-width column on a 480px canvas, and a
      // sentence-length reason is a line that leaves the panel. Identifiers and numbers (G7).
      problem: targets.length === 0 ? `no ${stat} target · owned ${String(owned.length)}` : null,
    };
  }

  /**
   * Take the rolled HEIR for the current prompt.
   *
   * `null` rather than `this.rolledHeir(prompt)`: the roll is taken inside {@link apply}, AFTER the
   * deadlock check, so a prompt that can be answered on neither side spends no draw.
   */
  chooseHeir(): void {
    const prompt = this.requirePrompt();
    this.apply(prompt, null);
  }

  /** Take the BOON: `targetUid` gains `stat`. */
  chooseBoon(targetUid: string, stat: StatKey): void {
    const prompt = this.requirePrompt();
    this.apply(prompt, { kind: "boon", parentUid: prompt.parentUid, targetUid, stat });
  }

  /** Answer with an arbitrary choice — what a headless driver or a replayed log hands in. */
  choose(choice: RetirementChoice): void {
    const prompt = this.requirePrompt();
    this.apply(prompt, choice);
  }

  private requirePrompt(): YearRetirementPrompt {
    const prompt = this.currentPrompt();
    if (!prompt) throw new RetirementFlowError("no retirement prompt is pending");
    return prompt;
  }

  /**
   * Apply one answer. An answer that cannot be applied falls back to the rolled HEIR and SAYS SO,
   * exactly as `advanceYear` does — throwing here would discard a year turn that has already run its
   * season step, its scripted raid and its map swap.
   *
   * ⚠ AND WHEN THE FALLBACK ITSELF CANNOT BE APPLIED. `advanceYear` substitutes the rolled HEIR
   * without re-checking it, so a prompt where BOTH sides are illegal (heir: party and box both full;
   * every boon: no target under `balance.retirement.boonMaxStacksPerStat`) reached
   * `resolveRetirement`, which threw — killing the year turn mid-flow with the retiree already
   * removed and the seeded stream already advanced. That is exactly the state this method exists to
   * avoid. So a doubly-refused prompt is recorded twice and PASSED OVER: the retiree is gone and
   * nothing replaced it, which is the true outcome and the only one that does not lose the turn.
   *
   * ⚠ AND IT IS CHECKED BEFORE THE HEIR IS ROLLED, which is a determinism question, not a
   * performance one. A skipped prompt reaches no `retirement` entry in the action log, and
   * `core/save.ts` `replay` draws `rollHeirChoice` only inside its `retirement` case — so a live run
   * that rolled for a prompt it then skipped left the lifecycle stream one draw ahead of its own
   * replay, and every later heir roll in the run differed (build-doc §8.1 / L10). Rolling only for
   * prompts that can be answered makes live and replay draw the same number of times. The roll is
   * still taken for BOTH sides of an answerable prompt — HEIR and BOON leave the stream in the same
   * place, which is the other half of the same invariant.
   */
  private apply(prompt: YearRetirementPrompt, offered: RetirementChoice | null): void {
    /*
     * Both sides refused, decided BEFORE the roll. `offered === null` means "the rolled HEIR", and
     * the fallback for anything else is that same rolled heir — whose only possible problem is room
     * (a roll's inherited traits are the parent's own, so the other clause of
     * `retirementChoiceProblem` cannot fail). So "the fallback will be refused" is exactly
     * `heirRoomProblem !== null`, and it is answerable without drawing.
     */
    const offeredProblem =
      offered === null
        ? this.heirRoomProblem(prompt)
        : retirementChoiceProblem(this.save, prompt, offered, this.balance);
    const fallbackProblemAhead = this.heirRoomProblem(prompt);
    if (offeredProblem !== null && fallbackProblemAhead !== null) {
      this.skipRefused(prompt, offered, offeredProblem, fallbackProblemAhead);
      return;
    }

    const rolled = this.rolledHeir(prompt);
    let choice = offered ?? rolled;
    if (offeredProblem !== null) {
      this.events.push({
        t: "choiceRejected",
        parentUid: prompt.parentUid,
        kind: choice.kind,
        reason: offeredProblem,
      });
      this.rejected.push({
        parentUid: prompt.parentUid,
        offered: choice,
        applied: rolled,
        reason: offeredProblem,
      });
      choice = rolled;

      /*
       * The fallback was checked BEFORE the roll (`fallbackProblemAhead` above) and this re-asks the
       * same question of the choice that was actually rolled, so a rolled heir that somehow could
       * not be applied still lands on the one skip path rather than reaching `resolveRetirement`,
       * which throws. Unreachable by construction today: a roll inherits only the parent's own
       * traits, so room is the only clause left, and room was already null to get here.
       */
      const fallbackProblem = retirementChoiceProblem(this.save, prompt, choice, this.balance);
      if (fallbackProblem !== null) {
        this.skipRefused(prompt, choice, fallbackProblem, fallbackProblem, false);
        return;
      }
    }

    const result = resolveRetirement(this.save, prompt, choice, {
      species: this.deps.content.species,
      balance: this.balance,
    });
    this.save = result.save as SaveEnvelope;
    this.events.push(...result.events);
    this.choices.push(choice);
    this.cursor += 1;
  }

  /**
   * Record a prompt neither side could answer, and pass over it.
   *
   * Two `choiceRejected` events and two `rejected` rows — the offered choice and the fallback — then
   * the cursor moves on. The retiree is gone and nothing replaced it: that is the true outcome, and
   * the only one that does not discard a year turn which has already run its season step, its
   * scripted raid and its map swap.
   *
   * `offered === null` means the caller asked for the rolled HEIR, and no heir was rolled (see
   * {@link apply}); the choice named in the log is then the heir that WOULD have been placed, with
   * no inherited traits, because none were drawn.
   */
  private skipRefused(
    prompt: YearRetirementPrompt,
    offered: RetirementChoice | null,
    offeredReason: string,
    fallbackReason: string,
    recordFallback = true,
  ): void {
    const unrolledHeir: RetirementChoice = {
      kind: "heir",
      parentUid: prompt.parentUid,
      inheritedTraitIds: [],
      heirUid: prompt.parentUid,
    };
    const offeredChoice = offered ?? unrolledHeir;
    this.events.push({
      t: "choiceRejected",
      parentUid: prompt.parentUid,
      kind: offeredChoice.kind,
      reason: offeredReason,
    });
    this.rejected.push({
      parentUid: prompt.parentUid,
      offered: offeredChoice,
      applied: unrolledHeir,
      reason: offeredReason,
    });
    if (recordFallback) {
      this.events.push({
        t: "choiceRejected",
        parentUid: prompt.parentUid,
        kind: unrolledHeir.kind,
        reason: fallbackReason,
      });
      this.rejected.push({
        parentUid: prompt.parentUid,
        offered: unrolledHeir,
        applied: unrolledHeir,
        reason: fallbackReason,
      });
    }
    this.cursor += 1;
  }

  /**
   * The finished turn, in the shape core/save.ts `appendYearTurn` takes — so the retirement choices
   * reach the action log and the run stays replayable (build-doc §8.1).
   */
  result(): AdvanceYearResult {
    if (!this.done()) {
      throw new RetirementFlowError(
        `${String(this.remaining())} retirement prompt(s) are still unanswered`,
      );
    }
    const partyEmpty = this.save.party.length === 0;
    const events = [...this.events];
    if (partyEmpty && !events.some((e) => e.t === "partyEmpty")) {
      events.push({ t: "partyEmpty", year: this.save.year });
    }
    return {
      ...this.turn,
      save: this.save,
      events,
      choices: [...this.choices],
      rejected: [...this.rejected],
      partyEmpty,
    };
  }

  /** The save as it stands mid-flow — the scene reads it to redraw the party strip. */
  currentSave(): SaveEnvelope {
    return this.save;
  }

  /**
   * The balance this flow was built against — the scene reads its layout from it (G11: build-doc
   * §7.6's 480×320 is `map.virtualWidth`/`map.virtualHeight`, never a literal in a style block).
   */
  balanceOf(): Balance {
    return this.balance;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Copy — identifiers and numbers only (G7)
 * ──────────────────────────────────────────────────────────────────────────── */

/** The retiree's card, one line per fact. */
export function parentLines(offer: RetirementOffer): string[] {
  const { parent } = offer;
  const lines = [
    `${parent.formName} · ${parent.age}${String(parent.level)}`,
    `caught Y${parent.caughtYear} · held ${String(parent.yearsHeld)}y`,
    statLine(parent.stats),
  ];
  if (parent.traits.length > 0) lines.push(`traits: ${parent.traits.map((t) => t.name).join(", ")}`);
  if (parent.boons.length > 0) lines.push(`boons: ${parent.boons.map((b) => b.name).join(", ")}`);
  if (parent.relicSlot !== null) lines.push(`relic: ${parent.relicSlot}`);
  return lines;
}

/** The HEIR column. The level drop is stated, not softened. */
export function heirLines(offer: RetirementOffer): string[] {
  const { heir, parent } = offer;
  // The union makes this narrowing load-bearing rather than polite: there are no numbers on the
  // other branch to print by mistake.
  if (heir.problem !== null) return [`HEIR unavailable`, heir.problem];
  const lines = [
    `${heir.formName} · ${heir.age}${String(heir.level)}`,
    `level ${String(parent.level)} → ${String(heir.level)} (−${String(heir.levelDrop)})`,
    statLine(heir.stats),
    statDeltaLine(heir.statDelta),
  ];
  lines.push(
    heir.inheritedTraits.length > 0
      ? `inherits: ${heir.inheritedTraits.map((t) => t.name).join(", ")}`
      : "inherits: —",
  );
  if (heir.relicSlot !== null) lines.push(`relic slot: ${heir.relicSlot}`);
  lines.push(
    heir.retiresBeyondFinalYear || isNever(heir.projectedRetirementYear)
      ? "retires: beyond the league"
      : `retires: Y${String(heir.projectedRetirementYear)}`,
  );
  return lines;
}

/** The BOON column for one stat. */
export function boonLines(offer: BoonOffer): string[] {
  if (offer.problem !== null) return [offer.problem];
  return offer.targets.map(
    (t) =>
      `${t.formName} L${String(t.level)} · ${offer.stat} ${String(t.statBefore)} → ${String(
        t.statAfter,
      )} (+${String(t.gain)})`,
  );
}

export function statLine(stats: Stats): string {
  return STAT_KEYS.map((key) => `${key} ${String(stats[key])}`).join("  ");
}

export function statDeltaLine(delta: Stats): string {
  return STAT_KEYS.map((key) => {
    const value = delta[key];
    return `${key} ${value >= 0 ? "+" : ""}${String(value)}`;
  }).join("  ");
}

/* ────────────────────────────────────────────────────────────────────────────
 * Fitting the copy to the card
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Break `lines` so no line exceeds `maxChars`.
 *
 * The card is two columns on a 480×320 canvas and the copy is not all short: five stats and their
 * five deltas run past forty characters, and `retirementChoiceProblem` (core/lifecycle.ts) returns
 * sentence-length reasons this module does not get to shorten. Un-wrapped, the HEIR column's stat
 * line ran across the divider and drew ON TOP of the BOON panel, and the BOON column's reason ran
 * off the canvas — on the one screen the demo video is cut around.
 *
 * Word-aware, and a single word longer than the column is cut rather than allowed to overhang: a
 * clipped identifier is legible as a clipped identifier, an overhanging one looks like a layout that
 * was never checked.
 */
export function wrapLines(lines: readonly string[], maxChars: number): string[] {
  const width = Math.max(1, Math.floor(maxChars));
  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= width) {
      out.push(line);
      continue;
    }
    let rest = line;
    while (rest.length > width) {
      const window = rest.slice(0, width + 1);
      const cut = window.lastIndexOf(" ");
      const at = cut > 0 ? cut : width;
      out.push(rest.slice(0, at).trimEnd());
      rest = rest.slice(at).trimStart();
    }
    if (rest.length > 0) out.push(rest);
  }
  return out;
}

/**
 * Keep at most `maxLines`, replacing the overflow with a count.
 *
 * A column that silently stops drawing at the panel's edge is indistinguishable from a column with
 * nothing more to say — and with a full party every BOON stat has six target rows.
 */
export function clampLines(lines: readonly string[], maxLines: number): string[] {
  const limit = Math.max(1, Math.floor(maxLines));
  if (lines.length <= limit) return [...lines];
  const kept = lines.slice(0, limit - 1);
  return [...kept, `+${String(lines.length - kept.length)} more`];
}

/* ────────────────────────────────────────────────────────────────────────────
 * The Phaser scene
 * ──────────────────────────────────────────────────────────────────────────── */

import type PhaserNS from "phaser";
import { audio, takeOverMusic, type MusicTakeover } from "@game/audio";
import { battleSpriteKey } from "@game/ui/BattleHud";
import { placeholderImage } from "@game/placeholder";
import { SCENE_KEYS } from "@game/scene-keys";

/**
 * How a portrait is drawn while the art is unbuilt.
 *
 * assets/ carries real art only for the B0 player sweep and the five style trials, so every creature
 * portrait in this scene is a PLACEHOLDER: a flat rectangle with its id written on it. The default
 * below is deliberately unmistakable. When the game shell lands its shared placeholder helper
 * (Lane C1's file, not this one), inject it here and delete nothing else.
 */
export type PlaceholderPainter = (
  scene: PhaserNS.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  assetId: string,
) => void;

/**
 * The one field these two scenes read off a keydown event.
 *
 * `repeat` is the browser's "this keydown is the OS repeating a key that is still held". Phaser
 * forwards the native event to the handler, and a test double may forward nothing at all — hence
 * both the optional event and the optional field.
 */
export interface KeyLike {
  repeat?: boolean;
}

/**
 * From `game/scene-keys.ts`, the ONE registry (`game/boot.ts` re-exports it) — not a second spelling
 * declared here. The registry lives in an engine-free module precisely so this file, which must stay
 * importable from a node test, can read it.
 */
export const RETIREMENT_SCENE_KEY = SCENE_KEYS.retirement;

export interface RetirementSceneData {
  flow: RetirementFlow;
  /** Called once the last prompt is answered — the year-turn scene resumes on this. */
  onDone: (result: AdvanceYearResult) => void;
  placeholder?: PlaceholderPainter;
}

/**
 * Layout only. No gameplay number appears in this block — and the canvas size is not one of this
 * block's numbers either: build-doc §7.6's 480×320 is `map.virtualWidth`/`map.virtualHeight` in
 * data/balance.json, so it is read (G11), never written here. See {@link defaultRetirementStyle}.
 */
export interface RetirementSceneStyle {
  width: number;
  height: number;
  pad: number;
  lineHeight: number;
  portrait: number;
  /**
   * Advance width of one character at `fontSize`, in px. Presentation, and the term that decides how
   * many characters fit in a column — see {@link wrapLines}.
   */
  charWidth: number;
  /**
   * Frames the card must have been on screen before it will accept a confirm.
   *
   * ⚠ THIS IS NOT A TIMING FUDGE — it is the guard on the demo's one destructive keypress. The
   * year-turn sequence advances on the same SPACE this card confirms with, and Phaser delivers a
   * keydown to every active scene, so a HELD key ran the sequence to the retirement beat, launched
   * the card, and committed the default HEIR on the very next frame: measured, the never-cut Legacy
   * card was on screen for exactly ONE frame and answered itself. Auto-repeat is refused outright
   * (see `create`); this is what stops the rest — a queued burst, a second press the player has
   * already begun, a key repeat a fake keyboard does not flag. Presentation, not gameplay: no rule
   * in build-doc depends on it.
   */
  confirmArmFrames: number;
  bgColor: number;
  panelColor: number;
  selectedColor: number;
  textColor: string;
  dimColor: string;
  fontFamily: string;
  fontSize: string;
  titleSize: string;
}

/**
 * The five colours the Legacy card paints with, as PALETTE IDS.
 *
 * THE DEFECT THIS REPLACES: {@link defaultRetirementStyle} wrote out `0x14171a`, `0x23282c`,
 * `0xffd76a`, `#e8e4c9` and `#7d8478`, and **not one of them is one of the 32 swatches**
 * `data/palette.json` froze at gate B0. The freeze is a value swap over stable ids (build-doc
 * §8.4), so a hex typed into a style block survives it and then disagrees with every generated
 * asset on the same screen — and this screen is build-doc §1's never-cut Legacy beat, the one the
 * demo video ends on. `game/ui/Palette.ts` is engine-free, so the resolution happens here rather
 * than in the Phaser class and `tests/unit/survey-view.test.ts` can check it on the real style
 * object the scene draws from.
 *
 * RE-PICKED AT T-15, when `data/palette.json` was re-frozen to the class-equal fit. Every id below
 * moved and not one role did. The swap kept the ids positional and moved all 32 hex VALUES, so an id
 * is a SLOT, not a colour — and this table held the two slots that inverted hardest: `c03` went from
 * a near-black plate (#2a1212) to a near-white (#faf7eb), and `c18` from a cream text (#f7ebd3) to a
 * mid-dark green (#37630f). Left alone, the never-cut Legacy card would have painted dark-green text
 * on a white plate the code still called a "shade off the background".
 *
 * Roles follow the house table in `game/menu-model.ts` (`UI_SWATCH_ID`), so the card and the menu
 * are one palette: `text` is `c03` in both, `dim` is `c01` in both, and `selected` takes that
 * table's `accent` (`c16`) exactly as it took the pre-swap `c15`. Measured against the shipped
 * frozen file, with the pre-swap number in brackets: `text` reads 15.7 : 1 [14.9] on the panel and
 * 19.15 : 1 [17.5] on the background, `dim` 5.70 : 1 [5.6] on the panel and 6.93 : 1 [6.6] on the
 * background, `selected` 11.9 : 1 [10.4] on the panel. The panel is a PLATE, not text — it sits a
 * shade off the background (1.22 : 1, was 1.18 : 1) exactly as the hexes it replaces did — and the
 * test recomputes every one of those ratios from `data/palette.json`.
 */
export const RETIREMENT_SWATCH_ID = {
  /** The letterbox behind the card. */
  bg: "c00",
  /** The plate the choice is drawn on — a shade off the background, never a text colour. */
  panel: "c04",
  /** The row the cursor is on. */
  selected: "c16",
  /** Primary text: the retiree's numbers, the heir's, the boon rows. */
  text: "c03",
  /** Secondary text: the footer, a row core refused, the mods line. */
  dim: "c01",
} as const;

/**
 * The card's layout at the virtual resolution balance.json states.
 *
 * A function rather than a constant because the two numbers that size it are DATA: every other scene
 * in the repo reads `balance.map.virtualWidth`/`virtualHeight` (BattleScene, DexScene, SurveyScene,
 * SummaryScene all do), and `game/boot.ts` states the rule verbatim. A retune of the virtual
 * resolution (INV-3) has to move this card with it or the demo's one full-screen choice is drawn to
 * a canvas that is no longer that size.
 */
export function defaultRetirementStyle(balance: Balance): RetirementSceneStyle {
  return {
    width: balance.map.virtualWidth,
    height: balance.map.virtualHeight,
    pad: 10,
    lineHeight: 12,
    portrait: 48,
    charWidth: 6,
    confirmArmFrames: 6,
    bgColor: swatchColor(RETIREMENT_SWATCH_ID.bg),
    panelColor: swatchColor(RETIREMENT_SWATCH_ID.panel),
    selectedColor: swatchColor(RETIREMENT_SWATCH_ID.selected),
    textColor: swatchHex(RETIREMENT_SWATCH_ID.text),
    dimColor: swatchHex(RETIREMENT_SWATCH_ID.dim),
    fontFamily: "monospace",
    fontSize: "10px",
    titleSize: "12px",
  };
}

/** Which side of the choice the cursor is on, and where inside it. */
export interface RetirementSelection {
  side: "heir" | "boon";
  statIndex: number;
  targetIndex: number;
}

/** One selectable BOON row: a stat and one of its legal targets. */
export interface BoonRow {
  statIndex: number;
  targetIndex: number;
}

/**
 * Every BOON the player can actually take, in card order: stat 0's targets, then stat 1's, and so on.
 *
 * This flattening is what makes build-doc §7.5 step 3's "+10% to ONE STAT" a real choice. The card
 * has four direction keys; LEFT/RIGHT own the side, which leaves one axis for two dimensions, and
 * the version that tried to give UP/DOWN to targets ALONE left `statIndex` unreachable whenever a
 * stat had more than one target — i.e. always, with a party of two or more. Walking the pairs
 * reaches every stat and every target on one axis, and a stat with no legal target is skipped
 * because it cannot be chosen anyway.
 */
export function boonRows(offer: RetirementOffer): BoonRow[] {
  const rows: BoonRow[] = [];
  offer.boons.forEach((boon, statIndex) => {
    if (boon.problem !== null) return;
    boon.targets.forEach((_target, targetIndex) => rows.push({ statIndex, targetIndex }));
  });
  return rows;
}

/** Index of the row the selection is on, or the nearest row at or after it. */
function rowIndexFor(rows: readonly BoonRow[], selection: RetirementSelection): number {
  const exact = rows.findIndex(
    (row) => row.statIndex === selection.statIndex && row.targetIndex === selection.targetIndex,
  );
  if (exact >= 0) return exact;
  const after = rows.findIndex((row) => row.statIndex >= selection.statIndex);
  return after >= 0 ? after : 0;
}

/**
 * Move the cursor. Pure, so the whole interaction is testable without a canvas: the scene's key
 * handlers are one call each into this, and the scene has NO navigation logic of its own — the
 * version that did is how four of the five stats became unreachable.
 */
export function moveSelection(
  selection: RetirementSelection,
  offer: RetirementOffer,
  direction: "left" | "right" | "up" | "down",
): RetirementSelection {
  const next: RetirementSelection = { ...selection };
  if (direction === "left") next.side = "heir";
  if (direction === "right") next.side = "boon";
  if (direction !== "up" && direction !== "down") {
    if (next.side === "boon") return clampToBoon(next, offer);
    return next;
  }
  if (next.side !== "boon") return next;

  const step = direction === "down" ? 1 : -1;
  const rows = boonRows(offer);
  if (rows.length === 0) {
    // Nothing is takeable. The stats still cycle so the player can read each one's reason instead of
    // being pinned to the first stat's — which is the state a whole party retiring together lands in.
    const stats = offer.boons.length;
    if (stats === 0) return next;
    next.statIndex = (next.statIndex + step + stats) % stats;
    next.targetIndex = 0;
    return next;
  }
  const at = (rowIndexFor(rows, next) + step + rows.length) % rows.length;
  const row = rows[at];
  if (!row) return next;
  next.statIndex = row.statIndex;
  next.targetIndex = row.targetIndex;
  return next;
}

/** Land a selection that has just moved onto the BOON side on a row that exists. */
function clampToBoon(selection: RetirementSelection, offer: RetirementOffer): RetirementSelection {
  const rows = boonRows(offer);
  if (rows.length === 0) {
    const stats = offer.boons.length;
    return {
      ...selection,
      statIndex: stats === 0 ? 0 : Math.min(selection.statIndex, stats - 1),
      targetIndex: 0,
    };
  }
  const row = rows[rowIndexFor(rows, selection)];
  return row ? { ...selection, statIndex: row.statIndex, targetIndex: row.targetIndex } : selection;
}

/** The choice the current selection stands for, or null when it cannot be taken. */
export function selectedChoice(
  selection: RetirementSelection,
  offer: RetirementOffer,
): RetirementChoice | null {
  if (selection.side === "heir") {
    if (offer.heir.problem !== null) return null;
    return {
      kind: "heir",
      parentUid: offer.prompt.parentUid,
      inheritedTraitIds: [...offer.heir.inheritedTraitIds],
      heirUid: offer.heir.heirUid,
    };
  }
  const stat = offer.boons[selection.statIndex];
  if (!stat || stat.problem !== null) return null;
  const target = stat.targets[selection.targetIndex];
  if (!target) return null;
  return {
    kind: "boon",
    parentUid: offer.prompt.parentUid,
    targetUid: target.targetUid,
    stat: stat.stat,
  };
}

/**
 * The choice the selection STANDS FOR even when it cannot be taken — always a choice, never null.
 *
 * `confirm()` used to swallow the keypress whenever {@link selectedChoice} came back null, so a
 * player sitting on a blocked BOON side could press SPACE forever and answer nothing, and the
 * documented "an unanswerable choice falls back to the rolled HEIR and emits `choiceRejected`" path
 * (build-doc §7.5 / `RetirementFlow.apply`) was unreachable from the scene. Handing the refused
 * choice to the flow is what makes that path real: the flow rejects it BY NAME, records why, and
 * applies the rolled heir.
 */
export function refusedChoice(
  selection: RetirementSelection,
  offer: RetirementOffer,
): RetirementChoice {
  if (selection.side === "heir") {
    return {
      kind: "heir",
      parentUid: offer.prompt.parentUid,
      inheritedTraitIds: [...offer.heir.inheritedTraitIds],
      heirUid: offer.heir.heirUid,
    };
  }
  const stat = offer.boons[selection.statIndex] ?? offer.boons[0];
  const target = stat?.targets[selection.targetIndex] ?? stat?.targets[0];
  return {
    kind: "boon",
    parentUid: offer.prompt.parentUid,
    // With no legal target there is no uid to name, so the retiree's own is used: it is not in the
    // party or the box any more, which is precisely the reason the flow will give for refusing it.
    targetUid: target?.targetUid ?? offer.prompt.parentUid,
    stat: stat?.stat ?? STAT_KEYS[0],
  };
}

/**
 * Build the scene class against a Phaser namespace supplied by the caller.
 *
 * The engine is a parameter rather than an import because this module has to stay reachable from a
 * node test (`import "phaser"` there throws `window is not defined`), and because L11's discipline —
 * logic that does not need the engine does not import it — is worth keeping one level above core/.
 * Boot does: `game.scene.add(RETIREMENT_SCENE_KEY, createRetirementScene(Phaser))`.
 */
export function createRetirementScene(
  P: typeof PhaserNS,
  styleOverride?: RetirementSceneStyle,
): typeof PhaserNS.Scene {
  return class RetirementScene extends P.Scene {
    private flow!: RetirementFlow;
    private onDone!: (result: AdvanceYearResult) => void;
    private placeholder: PlaceholderPainter = defaultPlaceholder;
    private selection: RetirementSelection = { side: "heir", statIndex: 0, targetIndex: 0 };
    private drawn: Array<{ destroy: () => void }> = [];
    /** Resolved in `init` from the flow's own balance (G11) unless the caller supplied one. */
    private style!: RetirementSceneStyle;
    /** True once the last prompt is answered — `onDone`/`stop` happen exactly once. */
    private finished = false;
    /**
     * Frames this card has been on screen since it opened, or since the last prompt was answered.
     * Reset per prompt: a card with three prompts must not answer all three from one held key.
     */
    private framesShown = 0;
    /** The card's takeover of the music, and the way to give back what it interrupted. */
    private music: MusicTakeover | null = null;

    constructor() {
      super({ key: RETIREMENT_SCENE_KEY });
    }

    init(data: RetirementSceneData): void {
      this.flow = data.flow;
      this.onDone = data.onDone;
      if (data.placeholder) this.placeholder = data.placeholder;
      this.selection = { side: "heir", statIndex: 0, targetIndex: 0 };
      this.style = styleOverride ?? defaultRetirementStyle(data.flow.balanceOf());
      this.finished = false;
      this.framesShown = 0;
      this.drawn = [];
    }

    create(): void {
      /*
       * §12a's Retirement cue — the one the audio catalogue says "carries the game's emotional
       * beat", on the never-cut Legacy screen. A TAKEOVER rather than a plain play, because this
       * card is launched OVER a paused overworld (or over the year-turn card, which is itself over
       * the overworld): what it interrupts has to come back when it closes, or the town falls
       * silent for the rest of the run.
       *
       * ⚠ THE LITERAL `"shutdown"`, AND BOTH OPTIONAL CHAINS. This class is built against a caller
       * -supplied Phaser namespace and is driven headlessly by an engine stub that exports `Scene`
       * and NOTHING ELSE — no `Phaser.Scenes.Events` to reach through, and no `events` emitter on
       * the scene at all. Reaching through either without a guard throws inside `create()`, which
       * would take the whole Legacy beat down in every headless test that opens this card. A stub
       * with no emitter must lose the RESTORE, never the card.
       */
      this.music = takeOverMusic(audio(), { screen: "retirement" });
      this.events?.once?.("shutdown", () => this.music?.restore());
      const style = this.style;
      this.add.rectangle(0, 0, style.width, style.height, style.bgColor).setOrigin(0, 0);
      const keyboard = this.input.keyboard;
      if (keyboard) {
        /*
         * REGISTERED, not merely listened for. Phaser's KeyboardPlugin only suppresses OS key repeat
         * for keys it holds a `Key` object for — `repeat = key.isDown; … if (!event.cancelled &&
         * (!key || !repeat))` — so a scene that binds `keydown-SPACE` without `addKey` receives
         * EVERY queued repeat. `addKey` is a no-op for a keyboard plugin that does not have it (a
         * test double), which is why the handlers below still check the event themselves.
         */
        const register = (keyboard as { addKey?: (key: string) => unknown }).addKey;
        if (typeof register === "function") {
          for (const key of ["SPACE", "ENTER", "LEFT", "RIGHT", "UP", "DOWN"]) {
            register.call(keyboard, key);
          }
        }
        keyboard.on("keydown-LEFT", (e?: KeyLike) => this.onKey(e, () => this.move("left")));
        keyboard.on("keydown-RIGHT", (e?: KeyLike) => this.onKey(e, () => this.move("right")));
        keyboard.on("keydown-UP", (e?: KeyLike) => this.onKey(e, () => this.move("up")));
        keyboard.on("keydown-DOWN", (e?: KeyLike) => this.onKey(e, () => this.move("down")));
        keyboard.on("keydown-SPACE", (e?: KeyLike) => this.onKey(e, () => this.confirm()));
        keyboard.on("keydown-ENTER", (e?: KeyLike) => this.onKey(e, () => this.confirm()));
      }
      this.redraw();
    }

    /** Phaser calls this every frame; it is what arms {@link confirm}. */
    override update(): void {
      this.framesShown += 1;
    }

    /**
     * One gate for every key: an OS auto-repeat answers nothing.
     *
     * `event.repeat` is the browser's own "this keydown is a repeat of a key that is still down",
     * and it is the exact discriminator for the defect: the player pressed once, at the year-turn
     * beat, and the repeats of that one press were dismissing the card behind it.
     */
    private onKey(event: KeyLike | undefined, run: () => void): void {
      if (event?.repeat === true) return;
      run();
    }

    /**
     * One call into the pure {@link moveSelection}. There is deliberately no cursor arithmetic here:
     * the version that had some short-circuited UP/DOWN into target cycling and never reached the
     * stat axis at all, so four of build-doc §7.5's five BOON stats could not be selected — or even
     * drawn — with a party of two or more.
     */
    private move(direction: "left" | "right" | "up" | "down"): void {
      if (this.finished) return;
      const offer = this.flow.offer();
      if (!offer) return;
      this.selection = moveSelection(this.selection, offer, direction);
      this.redraw();
    }

    private confirm(): void {
      if (this.finished) return;
      /*
       * ⚠ THE ARMING GUARD. This card is the one screen in the demo where a keypress cannot be taken
       * back, and the key that opens it is the key that confirms it. Measured before the fix, with a
       * held SPACE in the running game: the card was created on one frame and committed the default
       * HEIR on the next, so the never-cut Legacy beat was on screen for a single frame and the
       * player never saw the choice they had made. `style.confirmArmFrames` is the number of frames
       * it must have been readable for; `update()` counts them and every answered prompt resets it.
       */
      if (this.framesShown < this.style.confirmArmFrames) return;
      const offer = this.flow.offer();
      if (!offer) return;
      // An unselectable side answers with the choice it STANDS FOR: `RetirementFlow.apply` refuses it
      // by name, records `choiceRejected`, and applies the rolled HEIR. Returning early instead left
      // the player pressing SPACE at a card that could not be answered.
      this.flow.choose(selectedChoice(this.selection, offer) ?? refusedChoice(this.selection, offer));
      this.selection = { side: "heir", statIndex: 0, targetIndex: 0 };
      this.framesShown = 0;
      if (this.flow.done()) {
        this.finished = true;
        this.clear();
        this.onDone(this.flow.result());
        this.scene.stop();
        return;
      }
      this.redraw();
    }

    private clear(): void {
      for (const item of this.drawn) item.destroy();
      this.drawn = [];
    }

    /** Characters that fit in `px` of column at the style's monospace size. */
    private fit(px: number): number {
      return Math.max(1, Math.floor(px / this.style.charWidth));
    }

    /** Characters a COLUMN's copy may use — {@link fit} less the one-character cursor gutter. */
    private columnChars(px: number): number {
      return Math.max(1, this.fit(px) - 1);
    }

    private line(x: number, y: number, value: string, dim = false): void {
      const style = this.style;
      const text = this.add.text(x, y, value, {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        color: dim ? style.dimColor : style.textColor,
      });
      text.setOrigin(0, 0);
      this.drawn.push(text);
    }

    /**
     * Draw one column's copy, clamped to the rows that fit. Every row carries a one-character
     * cursor gutter, so the caller wraps to {@link columnChars}, which already subtracts it.
     */
    private column(
      x: number,
      top: number,
      heightPx: number,
      lines: readonly string[],
      dim: boolean,
      markRow: number | null,
    ): string[] {
      const style = this.style;
      const rows = clampLines(lines, Math.max(1, Math.floor(heightPx / style.lineHeight)));
      rows.forEach((row, i) => {
        const marked = markRow !== null && i === markRow;
        this.line(x, top + i * style.lineHeight, `${marked ? "▸" : " "}${row}`, dim);
      });
      return rows;
    }

    private redraw(): void {
      this.clear();
      const offer = this.flow.offer();
      if (!offer) return;
      const style = this.style;

      const half = Math.floor(style.width / 2);
      const title = this.add.text(
        style.pad,
        style.pad,
        `Y${String(offer.year)} · retirement ${String(offer.ordinal)}/${String(offer.total)}`,
        { fontFamily: style.fontFamily, fontSize: style.titleSize, color: style.textColor },
      );
      title.setOrigin(0, 0);
      this.drawn.push(title);

      /*
       * The retiree, portrait first.
       *
       * The label is an ASSET ID, not the creature's save-local uid. game/placeholder.ts resolves
       * the id against `assets/final/` and writes it on the stand-in so "a reviewer can say WHICH
       * asset is missing" — and a uid like "starter" names no file, so it could never resolve to
       * real art, and told the reviewer nothing in the meantime.
       *
       * ⚠ IT ASKS FOR THE CREATURE'S BATTLE SPRITE, and it is the only picture on the never-cut
       * Legacy beat. It asked for `dex-painted/dex-<name>` until the owner took cut line C-4 — "the
       * dex uses the existing creature sprites" — and every one of those 35 plates is a declared
       * stand-in, so this well had NO real art for any line at all. `game/scenes/DexScene.ts`
       * `creatureArtId` is the shared resolver and carries the full reasoning; this file calls
       * `battleSpriteKey` (the same ONE key builder underneath it) directly rather than importing
       * it, because `DexScene` takes the engine at module scope and this module must stay loadable
       * from a node test and from `tools/checkpoints` — the split
       * `tests/gates/guardrails.test.ts::no_phaser_in_node_reachable` enforces.
       *
       * NO ANCIENT CLAMP HERE, and that is derived rather than assumed: `core/lifecycle.ts`
       * `projectedRetirementYear` returns NEVER for an Ancient (G10), so an Ancient never produces
       * a retirement prompt — and `newOwnedCreature` pins an owned Ancient to the terminal age
       * class anyway, so `parent.age` would already be the class its one sprite is shipped at.
       */
      const top = style.pad + style.lineHeight * 2;
      this.placeholder(
        this,
        style.pad,
        top,
        style.portrait,
        style.portrait,
        battleSpriteKey(offer.parent.lineId, offer.parent.age, "front"),
      );
      const parentX = style.pad + style.portrait + style.pad;
      const parentWidth = style.width - parentX - style.pad;
      let y = top;
      for (const text of wrapLines(parentLines(offer), this.fit(parentWidth))) {
        this.line(parentX, y, text);
        y += style.lineHeight;
      }

      const columnTop = y + style.lineHeight;
      const columnHeight = style.height - columnTop - style.pad * 2;
      const heirSelected = this.selection.side === "heir";
      const heirPanel = this.add.rectangle(
        style.pad,
        columnTop,
        half - style.pad * 2,
        style.height - columnTop - style.pad,
        heirSelected ? style.selectedColor : style.panelColor,
        heirSelected ? 0.25 : 0.15,
      );
      heirPanel.setOrigin(0, 0);
      this.drawn.push(heirPanel);

      const boonSelected = this.selection.side === "boon";
      const boonPanel = this.add.rectangle(
        half,
        columnTop,
        half - style.pad,
        style.height - columnTop - style.pad,
        boonSelected ? style.selectedColor : style.panelColor,
        boonSelected ? 0.25 : 0.15,
      );
      boonPanel.setOrigin(0, 0);
      this.drawn.push(boonPanel);

      // Each column's text starts inside its own panel and is wrapped to the panel's inner width, so
      // nothing crosses the divider at `half` and nothing runs off the canvas.
      const heirX = style.pad * 2;
      const heirWidth = half - style.pad - heirX;
      const boonX = half + style.pad;
      const boonWidth = style.width - style.pad - boonX;
      const bodyTop = columnTop + style.pad + style.lineHeight;

      /*
       * ⚠ THE CURSOR IS ON THE SIDE SPACE WILL TAKE. Both column headers carry the marker gutter and
       * exactly one of them is ever marked, because the marker and {@link selectedChoice} read the
       * same `selection.side`.
       *
       * Before this, the ONLY ▸ on the card sat on a BOON row — drawn whenever that row was
       * available, never gated on the selected side — while the HEIR column was drawn with no marker
       * at all. Measured in the running game: with the default selection (HEIR) the card showed
       * "▸Maelstrisk L14 · hp 110 → 121 (+11)" and SPACE took the HEIR; pressing RIGHT to the BOON
       * side drew the IDENTICAL marker. The cursor and the committed action disagreed on the demo's
       * one interactive screen, and the only thing that distinguished the sides was a panel alpha of
       * 0.25 against 0.15.
       */
      this.line(heirX, columnTop + style.pad, `${heirSelected ? "▸" : " "}HEIR`);
      this.column(
        heirX,
        bodyTop,
        columnHeight - style.lineHeight,
        wrapLines(heirLines(offer), this.columnChars(heirWidth)),
        offer.heir.problem !== null,
        // The HEIR side is one choice, so the marker belongs on its first row — there is no second
        // row to move it to, and an unmarked column while SPACE takes it is the defect above.
        heirSelected ? 0 : null,
      );

      const stat = offer.boons[this.selection.statIndex];
      this.line(boonX, columnTop + style.pad, `${heirSelected ? " " : "▸"}BOON  ${stat ? stat.stat : ""}`);
      if (stat) {
        // The marker tracks the SOURCE row, so wrapping a long row cannot move it onto a continuation.
        const raw = boonLines(stat);
        const rows: string[] = [];
        let markRow: number | null = null;
        raw.forEach((row, i) => {
          const wrapped = wrapLines([row], this.columnChars(boonWidth));
          if (!heirSelected && stat.problem === null && i === this.selection.targetIndex) {
            markRow = rows.length;
          }
          rows.push(...wrapped);
        });
        this.column(boonX, bodyTop, columnHeight - style.lineHeight, rows, stat.problem !== null, markRow);
      }

      if (offer.deadlocked) {
        // No heir is rolled for a prompt neither side can answer — the draw would leave the seeded
        // stream one ahead of its own replay (see `RetirementFlow.apply`). The prompt is passed over.
        this.line(
          style.pad,
          style.height - style.pad - style.lineHeight,
          "no choice applies · passed over",
          true,
        );
      }
    }
  };
}

/**
 * The fallback portrait goes through game/placeholder.ts — the ONE placeholder helper in the game
 * shell. It draws the real texture when Lane B has landed one and a flat, hatched, id-labelled
 * stand-in when it has not, and it never stretches an unrelated image to fill the slot. A second
 * stand-in painted here would be exactly the divergence that helper exists to prevent.
 */
const defaultPlaceholder: PlaceholderPainter = (scene, x, y, width, height, assetId) => {
  placeholderImage(scene, x, y, assetId, width, height).setOrigin(0, 0);
};
