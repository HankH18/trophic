/**
 * game/shop.ts — the town shop's ROW MODEL and its one transaction.
 *
 * WHAT THIS IS
 * ────────────
 * The sibling of `game/battle-input.ts`: a pure, engine-free list of selectable rows with a label, a
 * detail column, a `disabled` flag and a `reason`, plus the single mutation that turns a chosen row
 * into a new save. Phaser appears nowhere, so the whole shop is exercised headlessly; the scene that
 * draws it is only a renderer of {@link ShopRow}s, exactly as `BattleScene` is a renderer of
 * `MenuEntry`s.
 *
 * IT GOES ON THE TAPE — BOTH HALVES (locked decision L10, build-doc §8.1)
 * ──────────────────────────────────────────────────────────────────────
 * A purchase moves two things: money out, stock in. `core/save.ts` owns one writer for each —
 * `applyPayout` for `money`, `applyGrant` for `items` — and each has a `replay()` arm. {@link buy}
 * logs `payoutAction(-price)` and `grantAction({id: 1})` and then applies them through those two
 * appliers, so a replayed run reaches the same purse and the same bag as the run it is replaying.
 * A direct write to `save.money` or `save.items` would make L10 SILENTLY false: `replay()` has zero
 * production callers, so nothing in the running game would ever notice the divergence.
 *
 * AFFORDABILITY IS CHECKED BEFORE ANYTHING IS LOGGED
 * ──────────────────────────────────────────────────
 * `applyPayout` REFUSES an overdraw — it throws `SaveCorruptError`, because `core/schemas.ts` types
 * `money` as `z.number().min(0)` and a negative purse is not a debt, it is a save that will not
 * load. Its docblock names the layer that owes the check ("the caller that knows the price must
 * check the balance first"); this file is that layer. So an unaffordable row is reported
 * `disabled` with a reason by {@link shopRows}, and the throw is never reached through the UI.
 *
 * PRICES AND THE ONE NUMBER BEHIND THEM (G11)
 * ───────────────────────────────────────────
 * No price is written here. Every one is read from `balance.economy` — `snarePrice[tier]`,
 * `salvePrice`, `tonicPrice` — so a retune touches data/balance.json alone (INV-4).
 *
 * The derivation lives with the number, in `economy._prices` (data/balance.json), and is not
 * restated here as a figure this file would have to keep in step. What a reader of THIS file needs
 * is the shape of it: the only earner the shipped game has is a won rival fight, priced by
 * `economy.trainerPayoutFlat` + `economy.trainerPayoutPerLevel` × the levels the loser fielded, so
 * income is a step function of the act — the six rival purses run 136 / 208 / 262 / 388 / 460 / 640,
 * and `balance.clock`'s own note calls those "six acts at roughly a year each". (They read
 * 144 / 432 / 648 / 1152 / 1440 / 2160 before the flat fee existed; that 15× spread is what the flat
 * half was added to flatten.) Hank's target is forty purchases in a year;
 * one flat price cannot hit it in every act, because the purses spread fifteen-fold across the run.
 *
 * ⚠ SO "FORTY A YEAR" IS TRUE OF ONE YEAR, NOT OF EVERY YEAR — that was accepted knowingly, and
 * `economy._prices` records which year the shipped price is anchored to. Money is tight early and
 * loose late whatever this file does; nothing here rations it, and nothing here should be written
 * as though the budget were flat.
 *
 * COPY (G2 / G7)
 * ──────────────
 * No player-facing name is coined here. Row labels are `itemLabel` (game/battle-view.ts) typesetting
 * the item's own id, the same fallback the battle menu uses. `reason` is DIAGNOSTIC copy in the
 * register `core/battle.ts` `illegalActionReason` writes in — identifiers and numbers, stating what
 * is true of the purse or the flag — and no line here tells the player anything about catching.
 */

import { SNARE_TIERS } from "../core/types";
import type { Balance, SaveFile, SnareTier } from "../core/types";
import { badgeFlagFor, hasBadge } from "../core/acts";
import { appendAction, applyGrant, applyPayout, grantAction, payoutAction } from "../core/save";
import type { SaveEnvelope } from "../core/save";
import { itemLabel } from "./battle-view";

/* ════════════════════════════════════════════════════════════════════════════
 * 1. Shape.
 * ════════════════════════════════════════════════════════════════════════════ */

export interface ShopRow {
  /** The bag key this row buys: a SnareTier, or a medicine id from balance.medicine. */
  readonly id: string;
  readonly label: string;
  readonly price: number;
  /** Stock and price, for the detail column — the shape battle-input.ts's stock() produces. */
  readonly detail: string;
  readonly disabled: boolean;
  /** Why it cannot be bought right now: locked, or not affordable. Null when it can. */
  readonly reason: string | null;
}

/** Thrown by {@link buy} when it is handed a row the shop is not currently offering. */
export class ShopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopError";
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2. What is on the shelf, and what gates it.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The snare tier the shop does NOT sell.
 *
 * Hank's ruling grants three master snares at the fifth gym; he did not say they are purchasable, so
 * no master row exists. Naming the tier is reading core's own vocabulary (`SNARE_TIERS`,
 * core/types.ts:292), not coining one — the same move `battle-input.ts` makes with `ROLES`.
 */
const UNSOLD_TIER: SnareTier = "master";

/** The snare tier that waits on a badge — Hank's ruling names the weighted snare and only it. */
const GATED_TIER: SnareTier = "weighted";

/**
 * The leader whose badge unlocks the weighted snare row — Hank's ruling: *"Weighted Snares unlocked
 * in the shop after the second gym is completed."* `odo` is the second leader (data/gyms.json,
 * `act: 2`), read out of content rather than invented (G2).
 *
 * ⚠ BLOCKER: THIS IS A CONTENT ID IN CODE, and the balance key that would replace it does not exist.
 * The natural home is `balance.economy.weightedUnlockGym` (a gym id string), but a key added to
 * data/balance.json ALONE never arrives: `core/schemas.ts` validates balance with a plain `z.object`
 * that STRIPS unknown keys, so the tunable must also be declared in `core/types.ts` `Balance` and
 * `core/schemas.ts` `zBalance` (core/acts.ts `actsOf` states this invariant, INV-3). All three files
 * are outside this file's grant, so the id stands here and the flag is DERIVED — see below.
 *
 * What is NOT written here is the flag string. `badgeFlagFor` (core/acts.ts:95) builds it from
 * `balance.acts.badgeFlagPrefix` + the gym id + `balance.acts.badgeFlagSuffix`, which is the one
 * grammar the whole game reads badges through, so a retune of the prefix moves this gate with it.
 */
// MOVED TO DATA. This was a literal here because zod strips undeclared balance keys, so the move
// needed data/balance.json, core/types.ts and core/schemas.ts together — see `economy._gates`.
export const weightedUnlockGym = (balance: Balance): string => balance.economy.weightedUnlockGym;

/** What each row buys, in the order the shelf lists it: snares first, then the two medicines. */
interface Shelf {
  readonly id: string;
  /** Gym whose badge this row waits on, or null when nothing gates it. */
  readonly gate: string | null;
}

function shelf(balance: Balance): Shelf[] {
  const snares: Shelf[] = SNARE_TIERS.filter((tier) => tier !== UNSOLD_TIER).map((tier) => ({
    id: tier,
    gate: tier === GATED_TIER ? weightedUnlockGym(balance) : null,
  }));
  // Medicine ids come from `balance.medicine`, never as literals — the same read `battle-input.ts`
  // `medicineIds` makes, so the bag key the shop sells is the bag key the battle menu spends.
  const medicine = balance.medicine;
  return [...snares, { id: medicine.salveItemId, gate: null }, { id: medicine.tonicItemId, gate: null }];
}

/**
 * The price of one unit, from `balance.economy` and nowhere else (G11).
 *
 * Returns null for an id the economy does not price, which is how {@link shopRows} refuses to put a
 * row on the shelf it cannot charge for rather than silently pricing it at zero.
 *
 * ⚠ `economy.baitPrice` is NOT consulted, and cannot be: it is keyed by `BaitMatch`
 * (`BAIT_MATCHES` — `none` / `role` / `species`, core/types.ts:294) — the words core uses for how
 * well a bait matches a target — not by any bag key. There is no id it could price, so no bait row
 * exists here.
 */
function priceOf(id: string, balance: Balance): number | null {
  const economy = balance.economy;
  if ((SNARE_TIERS as readonly string[]).includes(id)) return economy.snarePrice[id as SnareTier];
  if (id === balance.medicine.salveItemId) return economy.salvePrice;
  if (id === balance.medicine.tonicItemId) return economy.tonicPrice;
  return null;
}

/**
 * How many the player is carrying, or an em dash when the bag does not track this key.
 *
 * The same convention — and the same string — as `battle-input.ts` `stock()`, deliberately: an
 * ABSENT key is not zero anywhere in this game. `core/battle.ts:1226` `bagHas` reads a missing key
 * as UNLIMITED, so printing "×0" for one would be a claim the battle menu contradicts.
 *
 * ⚠ WHICH KEYS REACH THE DASH CHANGED, AND THE SHELF VISIBLY CHANGED WITH IT. `core/save.ts`
 * `emptyMeteredBag` seeds every `SNARE_TIERS` tier and both `balance.medicine` ids at 0, and
 * {@link shelf} sells nothing else — so from a save `newSave` produced this pane prints "×0" on a
 * brand-new game where it used to print "—", and the battle menu's own `stock()` turned over in the
 * same breath for the same keys. The two panes still agree with each other, which is what this
 * convention is for; no test had pinned the em dash for those keys, so nothing went red saying so.
 * The dash is not dead code: `battle-input.ts` shares it and DOES still render an unseeded family
 * (baits, whose rows come from the bag's own keys), and it is what keeps an absent key off the
 * screen as "×undefined" if a shelf ever offers an id nothing seeds.
 */
function stock(save: Pick<SaveFile, "items">, id: string): string {
  const held = save.items[id];
  return held === undefined ? "—" : `×${String(held)}`;
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3. The rows.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Every row the shop offers, in shelf order, each already knowing whether it can be bought right now
 * and why not.
 *
 * The two refusals are ordered: a LOCKED row says so even when the player also cannot afford it,
 * because the badge is the thing standing between them and the purchase and the purse is not.
 */
export function shopRows(save: SaveEnvelope, balance: Balance): ShopRow[] {
  const rows: ShopRow[] = [];
  for (const row of shelf(balance)) {
    const price = priceOf(row.id, balance);
    if (price === null) continue;
    const detail = `${stock(save, row.id)} · ${String(price)}`;
    const gate = row.gate;
    // The affordability check `applyPayout`'s docblock says this layer owes. Reported as a greyed
    // row so the throw is never reached through the UI.
    const affordable = save.money >= price;
    const reason =
      gate !== null && !hasBadge(save, gate, balance)
        ? `locked until ${badgeFlagFor(gate, balance)}`
        : affordable
          ? null
          : `costs ${String(price)}, purse holds ${String(save.money)}`;
    rows.push({ id: row.id, label: itemLabel(row.id), price, detail, disabled: reason !== null, reason });
  }
  return rows;
}

/** The row for one id, or undefined when the shop is not offering it. */
export function shopRowFor(save: SaveEnvelope, itemId: string, balance: Balance): ShopRow | undefined {
  return shopRows(save, balance).find((row) => row.id === itemId);
}

/* ════════════════════════════════════════════════════════════════════════════
 * 4. The transaction.
 * ════════════════════════════════════════════════════════════════════════════ */

/** One purchase buys one unit. The unit of the transaction, not a tunable — there is no bulk row. */
const UNITS_PER_PURCHASE = 1;

/**
 * Buy one unit of `itemId`, returning the new save. Pure: the input save is never mutated.
 *
 * Refuses anything {@link shopRows} has already greyed — an id that is not on the shelf, a row still
 * locked behind its badge, a price the purse cannot cover — by throwing, rather than returning the
 * save unchanged. A silent no-op is the shape of a purchase that looks like it happened.
 *
 * TWO ENTRIES, NOT ONE, and in this order: the price, then the consequence. `core/save.ts`'s
 * contract is that a tape entry is a price or an absolute consequence and never both, and its
 * `replay()` walks them in `seq` order through the same two appliers called here.
 */
export function buy(save: SaveEnvelope, itemId: string, balance: Balance): SaveEnvelope {
  const row = shopRowFor(save, itemId, balance);
  if (row === undefined) throw new ShopError(`"${itemId}" is not sold here`);
  if (row.disabled) throw new ShopError(`"${itemId}" cannot be bought — ${row.reason ?? "no reason given"}`);

  // `-0` is a real JavaScript value and `payoutAction(-0)` would carry one on the tape. JSON writes
  // it as `0`, so a save and its reload would still agree about the purse — but the entry in memory
  // and the entry that comes back would not be the same object, and build-doc §8.1's byte-identity
  // is a statement about values. Normalised so the tape only ever carries a plain integer.
  const amount = row.price === 0 ? row.price : -row.price;
  const grant = { [itemId]: UNITS_PER_PURCHASE };

  let next = appendAction(save, payoutAction(amount));
  next = applyPayout(next, amount);
  next = appendAction(next, grantAction(grant));
  next = applyGrant(next, grant);
  return next;
}
