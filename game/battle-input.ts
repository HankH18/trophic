/**
 * game/battle-input.ts — the battle command menu. Lane C3 (build-doc §15).
 *
 * WHAT THIS IS
 * ────────────
 * A pure, engine-free state machine over the five things a player may do in a TROPHIC battle
 * (build-doc §7.4 `BattleAction`): use a move, use a bag item, throw a snare, switch, flee. It turns
 * key presses into `BattleAction`s and hands them to the reducer. It draws nothing — Phaser appears
 * nowhere in this file, so the whole menu is exercised headlessly.
 *
 * WHY IT ASKS CORE INSTEAD OF DECIDING
 * ────────────────────────────────────
 * Every "is this greyed out?" question is answered by `illegalActionReason(state, action, ctx)` from
 * `core/battle.ts` — the same function the reducer itself uses to refuse an action. Nothing here
 * restates a rule: a snare is not offered in a gym because CORE says so, a medicine is greyed
 * because CORE says the target needs none, and the reason string shown to the player is core's own.
 * A local copy of any of those checks would be a second rulebook, drifting the day balance.json
 * moves (build-doc §6 INV-3). The one thing this file adds is the AGGREGATE: a submenu is closed
 * when core has refused every action inside it.
 *
 * CONSTANTS (G11)
 * ───────────────
 * No gameplay constant is written here. Snare tiers come from `SNARE_TIERS` (core/types.ts's
 * vocabulary), medicine ids from `balance.medicine`, quantities from `BattleState.bag`, move ids
 * from the battler's own `moves[]`. A bag key is a BAIT when it is a bait TAG — a species line id or
 * one of core's `ROLES` (build-doc §7.2's own definition, see {@link isBaitTag}) — so a new bait is
 * a data change and this file never learns its name, and a bag item that is neither a snare nor a
 * medicine nor a bait is not silently offered as one.
 *
 * COPY (G7): labels are identifiers and numbers. No moralizing copy about catching, anywhere. Item,
 * snare and bait rows are labelled by TYPESETTING their id (`itemLabel`, game/battle-view.ts) — the
 * first cut printed the raw ids — and a real name table overrides that through
 * {@link BattleMenuLabels} the day `data/` has one. Move rows are named from content.
 *
 * `MenuEntry.reason` is core's `illegalActionReason` string. core/types.ts calls that a DIAGNOSTIC,
 * not player-facing copy, so `game/scenes/BattleScene.ts` greys the row and does not print it.
 */

import { ROLES, SNARE_TIERS } from "../core/types";
import type { BattleAction, BattleState, SnareTier } from "../core/types";
import { baitMatchOf, illegalActionReason, type BattleContext } from "../core/battle";
import { itemLabel } from "./battle-view";

/**
 * Display names for the ids this menu offers.
 *
 * The first cut had none, so the bag, snare and bait panes printed RAW IDS as their player-facing
 * labels — the snares pane read `base / weighted / master` and the bag read `salve / tonic`.
 * `itemLabel` (game/battle-view.ts) typesets an id without coining a word, and a caller holding a
 * real name table overrides it here. Move names already came from content and are untouched.
 */
export interface BattleMenuLabels {
  item?(itemId: string): string | undefined;
}

function labelFor(labels: BattleMenuLabels, id: string): string {
  const named = labels.item?.(id);
  return named === undefined || named === "" ? itemLabel(id) : named;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Shape.
 * ════════════════════════════════════════════════════════════════════════════ */

export const BATTLE_PANES = ["root", "moves", "bag", "snares", "baits", "team"] as const;
export type BattlePane = (typeof BATTLE_PANES)[number];

export interface MenuEntry {
  /** Stable identity for this row — a move id, an item id, a snare tier, a uid, or a pane name. */
  id: string;
  label: string;
  /** Right-hand column: a quantity, a level, a move's type. Never a rule's output. */
  detail: string;
  /** Committed to the reducer when this row is chosen. Absent on rows that only open a pane. */
  action?: BattleAction;
  /** Pane this row opens instead of committing. */
  opens?: BattlePane;
  disabled: boolean;
  /** `illegalActionReason`'s string, verbatim, when core refused it. Diagnostic copy, not flavour. */
  reason: string | null;
}

/** What `select()` did. Exactly one of `action` / `pane` / `blocked` is meaningful. */
export interface SelectResult {
  /** Commit this to `step(state, action, rng, ctx)`. */
  action?: BattleAction;
  /** The pane the cursor moved to. */
  pane: BattlePane;
  /** Core's reason, when the chosen row was refused. */
  blocked?: string;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2. Row builders. Each one asks core whether its action is legal.
 * ════════════════════════════════════════════════════════════════════════════ */

const ROOT_LABEL: Record<"moves" | "bag" | "snares" | "team" | "flee", string> = {
  moves: "Fight",
  bag: "Bag",
  snares: "Snare",
  team: "Team",
  flee: "Flee",
};

const NO_BAIT_ID = "";
const NO_BAIT_LABEL = "No bait";

function refusal(state: BattleState, action: BattleAction, ctx: BattleContext): string | null {
  return illegalActionReason(state, action, ctx);
}

function entry(state: BattleState, action: BattleAction, ctx: BattleContext, id: string, label: string, detail: string): MenuEntry {
  const reason = refusal(state, action, ctx);
  return { id, label, detail, action, disabled: reason !== null, reason };
}

/** Bag quantity, or an em dash when the bag does not track this key (the harness carries no bag). */
function stock(state: BattleState, key: string): string {
  const held = state.bag[key];
  return held === undefined ? "—" : `×${String(held)}`;
}

/** The medicines `balance.medicine` declares — ids from data, never literals here (G11). */
function medicineIds(ctx: BattleContext): string[] {
  const med = ctx.balance.medicine;
  return [med.salveItemId, med.tonicItemId];
}

/**
 * Is this bag key a BAIT TAG?
 *
 * build-doc §7.2 defines one: "bait matches target if bait's tag ∈ target's derived diet (§7.3)",
 * and core/foodweb.ts `baitMatchFor` reads a tag as either a SPECIES LINE ID (bible §11's
 * species-specific bait) or a ROLE NAME (its role-generic bait). So the question is answerable from
 * core's own vocabulary — `ROLES` (core/types.ts) and the species index the battle context already
 * carries — with no table anywhere (G3).
 *
 * WHY THIS IS A POSITIVE TEST AND NOT AN EXCLUSION
 * ───────────────────────────────────────────────
 * It used to be "every bag key that is not a snare tier and not one of `balance.medicine`'s two
 * ids". That is a bait table's opposite and has a bait table's problem: every FUTURE bag item — a
 * relic, a key item, a repel — became a live, un-greyed bait row. Reproduced against the real
 * reducer with one `relic-antler-shard` in the bag: the row offered itself with `disabled:false`,
 * `reason:null`, the throw consumed the item, and the catch chance with it (0.35736940298507464)
 * was IDENTICAL to the chance with no bait at all. `core/battle.ts` cannot catch this for us —
 * `illegalActionReason` only asks whether the bag HOLDS the id, and `performSnare` consumes
 * whatever it is handed. `core/types.ts` already declares `OwnedCreature.relicSlot`, so items that
 * are neither snares nor medicines nor baits are a designed part of this game, not a hypothetical.
 */
export function isBaitTag(id: string, ctx: BattleContext): boolean {
  if (id === NO_BAIT_ID) return false;
  return ctx.speciesIndex.byId.has(id) || (ROLES as readonly string[]).includes(id);
}

/**
 * The bait ids in the bag, in sorted order.
 *
 * Snare tiers and medicines are still skipped — they are bag keys with their own panes — but the
 * filter that decides a row is a BAIT is {@link isBaitTag}, not the absence of those two.
 */
export function baitIdsIn(state: BattleState, ctx: BattleContext): string[] {
  const otherPanes = new Set<string>([...SNARE_TIERS, ...medicineIds(ctx)]);
  return Object.keys(state.bag)
    .filter((key) => !otherPanes.has(key) && isBaitTag(key, ctx))
    .filter((key) => (state.bag[key] ?? 0) > 0)
    .sort();
}

/**
 * What a bait buys against THIS target, in core's own word: `"species"`, `"role"` or `"none"`.
 *
 * `baitMatchOf` (core/battle.ts) is the same lookup `catchChance` runs, so the row cannot claim a
 * multiplier the reducer will not apply — and a bait the player holds that happens not to match the
 * creature in front of them says so instead of looking like every other row. No rule is restated
 * here: this file asks and prints the answer.
 */
export function baitMatchDetail(state: BattleState, ctx: BattleContext, baitId: string): string {
  const target = state.battlers[state.activeEnemyUid];
  if (target === undefined) return "";
  return baitMatchOf(baitId, target.lineId, ctx, state.nodeId);
}

export function moveEntries(state: BattleState, ctx: BattleContext): MenuEntry[] {
  const active = state.battlers[state.activePlayerUid];
  if (active === undefined) return [];
  return active.moves.map((moveId) => {
    const move = ctx.moves.get(moveId);
    return entry(
      state,
      { kind: "move", moveId },
      ctx,
      moveId,
      move?.name ?? moveId,
      move === undefined ? "" : `${move.type ?? move.kind}${move.power > 0 ? ` ${String(move.power)}` : ""}`,
    );
  });
}

export function bagEntries(state: BattleState, ctx: BattleContext, labels: BattleMenuLabels = {}): MenuEntry[] {
  return medicineIds(ctx).map((itemId) =>
    entry(state, { kind: "item", itemId }, ctx, itemId, labelFor(labels, itemId), stock(state, itemId)),
  );
}

export function snareEntries(state: BattleState, ctx: BattleContext, labels: BattleMenuLabels = {}): MenuEntry[] {
  return SNARE_TIERS.map((tier) =>
    entry(state, { kind: "snare", tier }, ctx, tier, labelFor(labels, tier), stock(state, tier)),
  );
}

export function baitEntries(
  state: BattleState,
  ctx: BattleContext,
  tier: SnareTier,
  labels: BattleMenuLabels = {},
): MenuEntry[] {
  const none = entry(state, { kind: "snare", tier }, ctx, NO_BAIT_ID, NO_BAIT_LABEL, "");
  const baits = baitIdsIn(state, ctx).map((baitId) =>
    entry(
      state,
      { kind: "snare", tier, baitId },
      ctx,
      baitId,
      labelFor(labels, baitId),
      // The stock AND what core says this bait is worth against the creature in front of the
      // player — build-doc §7.2's own `BaitMatch` word, not a number this file computed.
      `${stock(state, baitId)} · ${baitMatchDetail(state, ctx, baitId)}`,
    ),
  );
  return [none, ...baits];
}

export function teamEntries(state: BattleState, ctx: BattleContext): MenuEntry[] {
  return state.playerOrder.map((uid) => {
    const battler = state.battlers[uid];
    const label = battler === undefined ? uid : battler.nickname ?? battler.formName;
    const detail =
      battler === undefined ? "" : `Lv ${String(battler.level)} · ${String(battler.curHp)}/${String(battler.maxHp)}`;
    return entry(state, { kind: "switch", uid }, ctx, uid, label, detail);
  });
}

/**
 * A pane row is open exactly when core has left at least one action inside it legal.
 *
 * Its `reason` is core's string only when every child was refused for the SAME reason. The first cut
 * took `children[0].reason`, which reported one of several unrelated refusals as if it were the
 * whole story: a bag holding a salve and a tonic, at full HP with no status, greyed the Bag row
 * with "that battler is already at full HP" — true of the salve, and not why the tonic was refused.
 * A closed pane with children that disagree has no single reason, so it reports none rather than
 * picking one.
 */
function paneRow(id: BattlePane, label: string, children: MenuEntry[]): MenuEntry {
  const open = children.find((child) => !child.disabled);
  if (open !== undefined) return { id, label, detail: "", opens: id, disabled: false, reason: null };
  const reasons = new Set(children.map((child) => child.reason));
  const only = reasons.size === 1 ? children[0]?.reason ?? null : null;
  return { id, label, detail: "", opens: id, disabled: true, reason: only };
}

export function rootEntries(state: BattleState, ctx: BattleContext, labels: BattleMenuLabels = {}): MenuEntry[] {
  const flee = entry(state, { kind: "flee" }, ctx, "flee", ROOT_LABEL.flee, "");
  return [
    paneRow("moves", ROOT_LABEL.moves, moveEntries(state, ctx)),
    paneRow("bag", ROOT_LABEL.bag, bagEntries(state, ctx, labels)),
    paneRow("snares", ROOT_LABEL.snares, snareEntries(state, ctx, labels)),
    paneRow("team", ROOT_LABEL.team, teamEntries(state, ctx)),
    flee,
  ];
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3. The machine.
 * ════════════════════════════════════════════════════════════════════════════ */

export class BattleInput {
  private pane: BattlePane = "root";
  private cursorByPane: Record<BattlePane, number> = { root: 0, moves: 0, bag: 0, snares: 0, baits: 0, team: 0 };
  /** The tier chosen in the `snares` pane, carried into the `baits` pane. */
  private armedTier: SnareTier | null = null;
  private readonly labels: BattleMenuLabels;

  constructor(labels: BattleMenuLabels = {}) {
    this.labels = labels;
  }

  get currentPane(): BattlePane {
    return this.pane;
  }

  get cursor(): number {
    return this.cursorByPane[this.pane];
  }

  get armed(): SnareTier | null {
    return this.armedTier;
  }

  /** Rows of the pane the cursor is in, recomputed from `state` every call — never cached. */
  entries(state: BattleState, ctx: BattleContext): MenuEntry[] {
    switch (this.pane) {
      case "root":
        return rootEntries(state, ctx, this.labels);
      case "moves":
        return moveEntries(state, ctx);
      case "bag":
        return bagEntries(state, ctx, this.labels);
      case "snares":
        return snareEntries(state, ctx, this.labels);
      case "baits":
        return this.armedTier === null ? [] : baitEntries(state, ctx, this.armedTier, this.labels);
      case "team":
        return teamEntries(state, ctx);
    }
  }

  /** The row under the cursor, clamped to the pane's current length. */
  focused(state: BattleState, ctx: BattleContext): MenuEntry | undefined {
    const rows = this.entries(state, ctx);
    if (rows.length === 0) return undefined;
    return rows[this.clamp(rows.length)];
  }

  private clamp(length: number): number {
    if (length === 0) return 0;
    const raw = this.cursorByPane[this.pane];
    const wrapped = ((raw % length) + length) % length;
    this.cursorByPane[this.pane] = wrapped;
    return wrapped;
  }

  /** Wrapping cursor movement. `delta` is −1 (up) or +1 (down); any integer works. */
  moveCursor(delta: number, state: BattleState, ctx: BattleContext): number {
    const length = this.entries(state, ctx).length;
    if (length === 0) return 0;
    this.cursorByPane[this.pane] = this.clamp(length) + delta;
    return this.clamp(length);
  }

  /** Jump the cursor to a row by its id — what a mouse click or a touch does. */
  focusById(id: string, state: BattleState, ctx: BattleContext): boolean {
    const index = this.entries(state, ctx).findIndex((row) => row.id === id);
    if (index < 0) return false;
    this.cursorByPane[this.pane] = index;
    return true;
  }

  /** Back out one level. From `root` it is a no-op — there is nowhere above the command menu. */
  back(): BattlePane {
    if (this.pane === "baits") {
      this.pane = "snares";
      return this.pane;
    }
    this.armedTier = null;
    this.pane = "root";
    return this.pane;
  }

  /** Reset to the top of the menu — what the scene does when a new turn opens. */
  reset(): void {
    this.pane = "root";
    this.armedTier = null;
    for (const pane of BATTLE_PANES) this.cursorByPane[pane] = 0;
  }

  /**
   * Commit the focused row.
   *
   * Returns an `action` for the caller to hand to `step()`, or the pane it navigated to, or
   * `blocked` carrying core's own refusal string. It never returns an action core would refuse.
   */
  select(state: BattleState, ctx: BattleContext): SelectResult {
    const row = this.focused(state, ctx);
    if (row === undefined) return { pane: this.pane };
    if (row.disabled) return { pane: this.pane, ...(row.reason === null ? {} : { blocked: row.reason }) };

    if (row.opens !== undefined) {
      this.pane = row.opens;
      return { pane: this.pane };
    }

    // A snare row in the `snares` pane arms a tier and asks for bait, rather than throwing bare —
    // build-doc §7.2's bait multiplier is the single largest lever the player has on catch odds.
    if (this.pane === "snares" && row.action?.kind === "snare") {
      this.armedTier = row.action.tier;
      if (baitIdsIn(state, ctx).length === 0) {
        this.reset();
        return { pane: this.pane, action: row.action };
      }
      this.pane = "baits";
      this.cursorByPane.baits = 0;
      return { pane: this.pane };
    }

    const action = row.action;
    this.reset();
    return action === undefined ? { pane: this.pane } : { pane: this.pane, action };
  }
}

/**
 * What the narration line should read while the command menu is up.
 *
 * WAS NOTHING — and that is the defect. `openMenu()` made the panel visible and never touched the
 * message box, so the player chose their action under the PREVIOUS turn's damage line ("Ember −29
 * HP" was still on screen through root → Snare → Weighted → baits). Worse, once the snares pane
 * closed, NOTHING on screen said which tier had been armed: `BattleInput.armedTier` was private and
 * no widget drew it, in the one pane this file's own header calls "the single largest lever the
 * player has on catch odds".
 *
 * The line is identifiers only (G7): the armed tier, typeset by `itemLabel`, plus core's own word
 * for the thing being thrown. Every other pane clears the line rather than leaving last turn's
 * arithmetic under a menu it no longer describes.
 */
export function menuContextLine(input: BattleInput): string {
  const armed = input.armed;
  if (input.currentPane !== "baits" || armed === null) return "";
  return `${itemLabel(armed)} ${SNARE_NOUN}`;
}

/** The word the menu's own root row already uses for the snare pane, so no second noun is coined. */
const SNARE_NOUN = ROOT_LABEL.snares.toLowerCase();

/* ════════════════════════════════════════════════════════════════════════════
 * 4. Key bindings. The scene owns the keyboard; this names the mapping so the
 *    menu can be driven identically from a test, a gamepad or a click.
 * ════════════════════════════════════════════════════════════════════════════ */

export type BattleKey = "up" | "down" | "confirm" | "cancel";

export function applyKey(input: BattleInput, key: BattleKey, state: BattleState, ctx: BattleContext): SelectResult {
  switch (key) {
    case "up":
      input.moveCursor(-1, state, ctx);
      return { pane: input.currentPane };
    case "down":
      input.moveCursor(1, state, ctx);
      return { pane: input.currentPane };
    case "confirm":
      return input.select(state, ctx);
    case "cancel":
      return { pane: input.back() };
  }
}
