/**
 * tests/unit/shop.test.ts — the vendor purchase path: `game/shop.ts`'s row model and `buy()`.
 *
 * WRITTEN AGAINST THE PINNED SEAM, NOT AGAINST THE IMPLEMENTATION. Nothing in this file has read
 * `game/shop.ts`; every expectation below is derived from `data/balance.json` at run time through
 * `validateContent()`, from `core/acts.ts`'s own badge-flag derivation, and from `core/save.ts`'s
 * tape primitives. If these are red, the seam is not landed yet — that is the correct state, and
 * the fix is the implementation, never a softened assertion.
 *
 * ⚠ WHY THE REPLAY SECTION IS THE CENTRE OF GRAVITY.
 * `core/recovery.ts` once minted `{t:"innRest"}` onto the action log while `core/save.ts` `replay`
 * had no `case` for it. The entry fell through the default arm, applied nothing, and locked decision
 * L10 — "identical (seed, actionLog) ⇒ byte-identical final save" — was silently false for every run
 * that slept, with the suite fully green. `replay()` has ZERO production callers, so nothing but a
 * test can ever notice a purchase that wrote `save.money` and `save.items` directly instead of
 * putting both halves on the tape. §3 below is that test: it rebuilds the run from its initial save
 * with a host that understands NOTHING (`applyOther` is the identity), and compares with the repo's
 * CANONICAL serializer rather than a shallow structural match.
 *
 * G11: no price, no item id and no quest flag is typed here. Prices come from `balance.economy`,
 * item ids from `SNARE_TIERS` and `balance.medicine`, and the badge flag from
 * `core/acts.ts` `badgeFlagFor` (which builds it out of `balance.acts.badgeFlagPrefix/Suffix`).
 * G7/G2: no player-facing string is asserted by content — only that the reasons EXIST and that a
 * locked row and an unaffordable row do not report the same one.
 */

import { describe, expect, it } from "vitest";
import { badgeFlagFor, awardBadge } from "../../core/acts";
import {
  canonicalStringify,
  newSave,
  replay,
  serialize,
  type SaveEnvelope,
} from "../../core/save";
import { validateContent } from "../../core/schemas";
import { SNARE_TIERS } from "../../core/types";
import type { Balance, GymLeader, SnareTier } from "../../core/types";
import { ShopError, buy, shopRows, type ShopRow } from "../../game/shop";

const content = validateContent();
const balance: Balance = content.balance;

/** The deps `replay` demands. `applyOther` is deliberately absent — see §3. */
const deps = {
  gyms: content.gyms,
  species: content.species,
  balance,
  nodes: content.nodes,
};

const fresh = (): SaveEnvelope =>
  newSave({ seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes: content.nodes }, balance);

/** A save with a stated purse and bag — the two fields a purchase moves. */
function withPurse(money: number, items: Record<string, number> = {}): SaveEnvelope {
  return { ...fresh(), money, items };
}

/* ── The vocabulary, derived ─────────────────────────────────────────────── */

/** The ladder, act 1 first. "The second gym" is its second row, not a typed id. */
const ladder: readonly GymLeader[] = [...content.gyms].sort((a, b) => a.act - b.act);
if (ladder.length < 2) throw new Error("data/gyms.json has fewer than two leaders — there is no second gym");
const FIRST_GYM = ladder[0] as GymLeader;
const SECOND_GYM = ladder[1] as GymLeader;

/** The medicine ids `balance.medicine` declares — the shop's non-snare rows (G11). */
const MEDICINE_IDS: readonly string[] = [balance.medicine.salveItemId, balance.medicine.tonicItemId];

/** The tier the owner grants at gym 5 and did NOT say is sold. Last of core's own vocabulary. */
const MASTER: SnareTier = SNARE_TIERS[SNARE_TIERS.length - 1] as SnareTier;
/** The tier locked behind the second gym. */
const WEIGHTED: SnareTier = SNARE_TIERS[1] as SnareTier;
/** The tier on sale from the start. */
const BASE: SnareTier = SNARE_TIERS[0] as SnareTier;

/** What `balance.economy` says each sellable id costs. The ONLY source of a price in this file. */
function balancePriceOf(id: string): number | undefined {
  if ((SNARE_TIERS as readonly string[]).includes(id)) return balance.economy.snarePrice[id as SnareTier];
  if (id === balance.medicine.salveItemId) return balance.economy.salvePrice;
  if (id === balance.medicine.tonicItemId) return balance.economy.tonicPrice;
  return undefined;
}

/** The ids the seam permits a row to carry: a snare tier, or a medicine id. */
const SELLABLE_VOCABULARY: readonly string[] = [...SNARE_TIERS, ...MEDICINE_IDS];

/** Every id the shop must offer: the owner's "the other prices can all be the same", minus master. */
const MUST_OFFER: readonly string[] = [BASE, WEIGHTED, ...MEDICINE_IDS];

/** The single price the owner asked for — read off the shipped base snare, never typed. */
const PRICE = balance.economy.snarePrice[BASE];

/** A purse that can afford anything on the shelf several times over. */
const RICH = PRICE * 10;

/** Both badges a player holds when the second gym is behind them. */
function afterSecondGym(save: SaveEnvelope): SaveEnvelope {
  return awardBadge(awardBadge(save, FIRST_GYM.id, balance), SECOND_GYM.id, balance);
}

function rowById(rows: readonly ShopRow[], id: string): ShopRow | undefined {
  return rows.find((row) => row.id === id);
}

/**
 * `buy()` on a row the UI would never offer. The seam does not pin WHICH refusal (throw, or return
 * the save untouched), so this accepts either and the assertions are made about the STATE, which is
 * the thing that must not move. What it must never do is reach `applyPayout`'s overdraw throw with
 * a half-written save, or put a `payout` on the tape it cannot pay.
 *
 * ⚠ THIS TOLERANCE IS A STALE HEDGE, AND ON ITS OWN IT IS A HOLE. This file was written test-first
 * against the seam, deliberately without reading `game/shop.ts`, so at authoring time it genuinely
 * could not know which refusal shape would be chosen. The implementation landed and chose: it
 * THROWS `ShopError` (game/shop.ts:229-230). While the hedge stood alone, rewriting both refusals
 * as `return save` — a silent no-op — left 111 tests across shop, overworld-shop, economy-wiring
 * and economy-primitives GREEN. Measured, by doing it. That is precisely the failure
 * `game/shop.ts`'s own docblock names: "a silent no-op is the shape of a purchase that looks like
 * it happened", and under it `OverworldScene.buySelected` falls past its `catch`, re-renders, fires
 * `onSaveChanged` and banners "bought base · 3 · purse 0" against an unmoved purse, bag and tape.
 *
 * The refusal shape is now pinned explicitly in §6, so this helper is no longer the only thing
 * standing there. It is KEPT rather than deleted because the two readings catch DIFFERENT damage,
 * measured by mutating `game/shop.ts` five ways and running all four shop files each time:
 *
 *   • Rewrite a refusal as `return save` (a no-op). The save does not move, so every
 *     `if (!attempt.threw)` branch here passes and §6 is the ONLY thing that reddens — for the
 *     `row === undefined` arm, the only thing in the repo that reddens at all.
 *   • DELETE a refusal outright, so `buy` runs on. Now the save DOES move: the locked weighted
 *     snare is sold to an unbadged player, and these branches redden alongside §6.
 *
 * So neither reading subsumes the other. Two readings of one refusal is reasonable. One reading
 * that accepts either answer is not.
 */
type Attempt = { readonly threw: true } | { readonly threw: false; readonly save: SaveEnvelope };
function attemptBuy(save: SaveEnvelope, id: string): Attempt {
  try {
    return { threw: false, save: buy(save, id, balance) };
  } catch {
    return { threw: true };
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 * 0. NON-VACUITY — every figure the rest of the file spends is a real one.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the fixtures this file spends are real", () => {
  it("the ladder is long enough to have a second gym, and the gyms are distinct", () => {
    expect(content.gyms.length).toBeGreaterThanOrEqual(2);
    expect(FIRST_GYM).toBeTruthy();
    expect(SECOND_GYM).toBeTruthy();
    expect(SECOND_GYM.id).not.toBe(FIRST_GYM.id);
  });

  it("the badge flag is DERIVED and non-empty — nothing below types a quest flag", () => {
    const flag = badgeFlagFor(SECOND_GYM.id, balance);
    expect(flag.length).toBeGreaterThan(0);
    // It is built out of balance's own affixes, which is what makes it a derivation rather than a
    // second copy of the rule: retune the affixes and this test follows.
    expect(flag).toBe(`${balance.acts.badgeFlagPrefix}${SECOND_GYM.id}${balance.acts.badgeFlagSuffix}`);
    // And awarding it is what actually writes it — the precondition is produced outside this test.
    expect(awardBadge(fresh(), SECOND_GYM.id, balance).questFlags[flag]).toBe(true);
  });

  it("the price is a real, spendable, WHOLE amount — a zero or a fraction would make §2/§3 vacuous", () => {
    expect(PRICE).toBeGreaterThan(0);
    // `applyPayout` refuses a non-integer amount outright, so a fractional price is not a rounding
    // question — it is a purchase that throws `SaveCorruptError` at the first customer.
    expect(Number.isInteger(PRICE)).toBe(true);
    expect(RICH).toBeGreaterThan(PRICE);
  });

  it("the medicine ids are two distinct named items, and master is a distinct tier", () => {
    expect(MEDICINE_IDS.length).toBe(2);
    for (const id of MEDICINE_IDS) expect(id.length).toBeGreaterThan(0);
    expect(MEDICINE_IDS[0]).not.toBe(MEDICINE_IDS[1]);
    expect(MASTER).not.toBe(BASE);
    expect(MASTER).not.toBe(WEIGHTED);
  });

  it("the shelf is not empty — every loop below would pass on an empty array", () => {
    const rows = shopRows(withPurse(RICH), balance);
    expect(rows.length).toBeGreaterThan(0);
    expect(MUST_OFFER.length).toBe(4);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 1. ONE PRICE, AND IT IS BALANCE'S — "the other prices can all be the same".
 * ════════════════════════════════════════════════════════════════════════════ */

describe("every purchasable price is balance.economy's, and they are all the same", () => {
  const rows = shopRows(afterSecondGym(withPurse(RICH)), balance);

  it("offers exactly the shelf the seam names: both sold snares and both medicines", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const id of MUST_OFFER) {
      expect(rowById(rows, id), `the shop must offer "${id}"`).toBeTruthy();
    }
    // And nothing outside the seam's vocabulary. A bait row here would be the seam's other half —
    // `baitPrice.none` is 0, and a zero-priced row is not a price, it is a free item.
    for (const row of rows) {
      expect(SELLABLE_VOCABULARY, `"${row.id}" is neither a snare tier nor a medicine id`).toContain(row.id);
    }
  });

  it("each row's price is the balance.economy field for ITS id — derived, never typed", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const expected = balancePriceOf(row.id);
      expect(expected, `balance.economy has no price for "${row.id}"`).toBeDefined();
      expect(row.price, `price of "${row.id}"`).toBe(expected);
    }
  });

  it("all of them are the SAME number, and that number is not zero", () => {
    const prices = rows.map((row) => row.price);
    expect(prices.length).toBeGreaterThan(0);
    const distinct = new Set(prices);
    expect(
      distinct.size,
      `the owner asked for one price; the shelf quotes ${[...distinct].join(", ")}`,
    ).toBe(1);
    const only = prices[0] as number;
    expect(only).toBe(PRICE);
    expect(only).toBeGreaterThan(0);
  });

  it("no row is free — a zero price would let `baitPrice.none` leak in as an item", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.price, `"${row.id}" is free`).toBeGreaterThan(0);
      expect(Number.isInteger(row.price), `"${row.id}" costs a fraction`).toBe(true);
    }
    // The measured fact this guards: `balance.economy.baitPrice.none` is 0, and it is a real zero
    // rather than a price. Nothing may quote it at the counter.
    expect(balance.economy.baitPrice.none).toBe(0);
  });

  it("every row is labelled and detailed — the stock and the price, per the seam", () => {
    const held = 7;
    const stocked = shopRows(afterSecondGym(withPurse(RICH, { [BASE]: held })), balance);
    const base = rowById(stocked, BASE);
    expect(base).toBeTruthy();
    const row = base as ShopRow;
    expect(row.label.length).toBeGreaterThan(0);
    expect(row.detail).toContain(String(held));
    expect(row.detail).toContain(String(row.price));
    for (const other of stocked) expect(other.label.length).toBeGreaterThan(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. AFFORDABILITY IS CHECKED IN THE ROW, SO THE OVERDRAW THROW IS UNREACHABLE.
 *
 * `applyPayout` REFUSES an overdraw — `core/schemas.ts` types money as `z.number().min(0)`, so a
 * negative purse is not a debt, it is an unloadable save. The row model is what keeps the player
 * away from that throw: a row it marks buyable must BUY.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a row the player cannot afford is disabled with a reason", () => {
  it("one coin short of the price, every row is disabled and says why", () => {
    const rows = shopRows(afterSecondGym(withPurse(PRICE - 1)), balance);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.disabled, `"${row.id}" offered itself at ${String(PRICE - 1)}`).toBe(true);
      expect(row.reason, `"${row.id}" is disabled with no reason`).not.toBeNull();
      expect((row.reason ?? "").length).toBeGreaterThan(0);
    }
  });

  it("an empty purse disables everything, including the tiers that are unlocked", () => {
    const rows = shopRows(afterSecondGym(withPurse(0)), balance);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.disabled, `"${row.id}" offered itself at 0`).toBe(true);
      expect(row.reason).not.toBeNull();
    }
  });

  it("at exactly the price the row opens — the boundary is <, not <=", () => {
    const rows = shopRows(afterSecondGym(withPurse(PRICE)), balance);
    const base = rowById(rows, BASE);
    expect(base).toBeTruthy();
    expect((base as ShopRow).disabled).toBe(false);
    expect((base as ShopRow).reason).toBeNull();
  });

  it("LOCKED and UNAFFORDABLE are not the same reason", () => {
    // Not an assertion about the words — G2/G7 — but about the shop being able to tell the player
    // WHICH of the two walls they hit. One string for both is a shop that says "no".
    const poor = rowById(shopRows(afterSecondGym(withPurse(0)), balance), BASE);
    const locked = rowById(shopRows(withPurse(RICH), balance), WEIGHTED);
    expect(poor).toBeTruthy();
    expect(locked).toBeTruthy();
    const poorReason = (poor as ShopRow).reason;
    const lockedReason = (locked as ShopRow).reason;
    expect(poorReason).not.toBeNull();
    expect(lockedReason).not.toBeNull();
    expect(lockedReason).not.toBe(poorReason);
  });

  it("EVERY enabled row buys without throwing, at every purse — the throw is unreachable via the UI", () => {
    const purses = [0, 1, PRICE - 1, PRICE, PRICE + 1, RICH];
    let enabledSeen = 0;
    let disabledSeen = 0;
    for (const money of purses) {
      for (const badged of [false, true]) {
        const save = badged ? afterSecondGym(withPurse(money)) : withPurse(money);
        const rows = shopRows(save, balance);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          if (row.disabled) {
            disabledSeen += 1;
            // A refusal must leave the save exactly as it was, or throw before writing anything.
            const attempt = attemptBuy(save, row.id);
            if (!attempt.threw) expect(serialize(attempt.save)).toBe(serialize(save));
            continue;
          }
          enabledSeen += 1;
          const after = buy(save, row.id, balance);
          expect(after.money).toBe(money - row.price);
          expect(after.money).toBeGreaterThanOrEqual(0);
        }
      }
    }
    // Non-vacuity: the sweep must have exercised both arms, or it proved nothing.
    expect(enabledSeen).toBeGreaterThan(0);
    expect(disabledSeen).toBeGreaterThan(0);
  });

  it("a disabled row cannot overdraw the purse even if something calls buy() behind the UI's back", () => {
    const save = afterSecondGym(withPurse(PRICE - 1));
    const attempt = attemptBuy(save, BASE);
    if (!attempt.threw) {
      expect(attempt.save.money).toBeGreaterThanOrEqual(0);
      expect(serialize(attempt.save)).toBe(serialize(save));
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. THE TAPE. The most important section in the file — the one `{t:"innRest"}` lacked.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("buy() moves the purse down and the bag up, and BOTH halves ride the tape", () => {
  it("money down by exactly the price, bag up by exactly one", () => {
    const initial = afterSecondGym(withPurse(RICH, { [BASE]: 2 }));
    const after = buy(initial, BASE, balance);
    expect(after.money).toBe(RICH - PRICE);
    expect(after.items[BASE]).toBe(3);
    // Nothing else in the bag moved.
    expect(Object.keys(after.items).sort()).toEqual(Object.keys(initial.items).sort());
  });

  it("a first purchase of an untracked key creates the stack at one, not at two", () => {
    const initial = afterSecondGym(withPurse(RICH));
    const after = buy(initial, WEIGHTED, balance);
    expect(initial.items[WEIGHTED]).toBeUndefined();
    expect(after.items[WEIGHTED]).toBe(1);
  });

  it("both halves are LOGGED — the tape grows by two entries, gaplessly numbered", () => {
    const initial = afterSecondGym(withPurse(RICH));
    const after = buy(initial, BASE, balance);
    expect(after.actionLog.length).toBe(initial.actionLog.length + 2);
    after.actionLog.forEach((entry, index) => {
      expect(entry.seq).toBe(index);
    });
  });

  it("REPLAY reaches a BYTE-IDENTICAL save, with a host that understands nothing", () => {
    /*
     * THE anti-regression. `applyOther` is absent from `deps`, so if either half of the purchase is
     * a direct write to `save.money` / `save.items` instead of a `{t:"payout"}` / `{t:"grant"}` on
     * the log, there is nothing in this process that can move them during replay — the rebuilt save
     * diverges and this fails. A shallow `toEqual` would compare object identity-ish structure;
     * `serialize` is the repo's CANONICAL serializer (keys sorted at every depth), which is what
     * build-doc §8.1 and L10 mean by "byte-identical".
     */
    const initial = afterSecondGym(withPurse(RICH));
    let live = initial;
    live = buy(live, BASE, balance);
    live = buy(live, WEIGHTED, balance);
    live = buy(live, MEDICINE_IDS[0] as string, balance);

    // Non-vacuity: the run being replayed actually did something.
    expect(live.actionLog.length).toBeGreaterThanOrEqual(6);
    expect(live.money).toBe(RICH - PRICE * 3);

    const replayed = replay({ ...initial, actionLog: [] }, live.actionLog, deps);
    expect(serialize(replayed)).toBe(serialize(live));
    // Said again about the two fields, so a failure names which half went missing.
    expect(replayed.money).toBe(live.money);
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(live.items));
  });

  it("a purchase the tape does NOT carry cannot be rebuilt — the inverse of the test above", () => {
    /*
     * Proves the previous test is capable of failing: strip the purchase's entries off the log and
     * the replayed save must NOT match. If this passes trivially — if replay reaches the same save
     * from an empty log — then the assertion above was never watching the tape at all.
     */
    const initial = afterSecondGym(withPurse(RICH));
    const live = buy(initial, BASE, balance);
    expect(live.actionLog.length).toBeGreaterThan(initial.actionLog.length);
    const stripped = replay({ ...initial, actionLog: [] }, initial.actionLog, deps);
    expect(serialize(stripped)).not.toBe(serialize(live));
    expect(stripped.money).toBe(RICH);
  });

  it("buy() is PURE — the save handed in is not mutated", () => {
    const initial = afterSecondGym(withPurse(RICH, { [BASE]: 1 }));
    const before = serialize(initial);
    buy(initial, BASE, balance);
    expect(serialize(initial)).toBe(before);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. THE WEIGHTED LOCK — "unlocked in the shop after the second gym is completed".
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the weighted snare is locked until the second gym is beaten", () => {
  it("with no badges at all it is present but disabled, with a reason", () => {
    const rows = shopRows(withPurse(RICH), balance);
    const row = rowById(rows, WEIGHTED);
    expect(row).toBeTruthy();
    expect((row as ShopRow).disabled, "weighted was buyable with no badges").toBe(true);
    expect((row as ShopRow).reason).not.toBeNull();
    expect(((row as ShopRow).reason ?? "").length).toBeGreaterThan(0);
  });

  it("the FIRST gym's badge does not open it — it is the second gym that does", () => {
    const save = awardBadge(withPurse(RICH), FIRST_GYM.id, balance);
    // The precondition is produced outside the assertion: the flag really is written.
    expect(save.questFlags[badgeFlagFor(FIRST_GYM.id, balance)]).toBe(true);
    expect(save.questFlags[badgeFlagFor(SECOND_GYM.id, balance)]).toBeUndefined();
    const row = rowById(shopRows(save, balance), WEIGHTED);
    expect(row).toBeTruthy();
    expect((row as ShopRow).disabled, "one badge opened the weighted snare").toBe(true);
  });

  it("with the second gym's badge it opens, and it BUYS", () => {
    const save = afterSecondGym(withPurse(RICH));
    expect(save.questFlags[badgeFlagFor(SECOND_GYM.id, balance)]).toBe(true);
    const row = rowById(shopRows(save, balance), WEIGHTED);
    expect(row).toBeTruthy();
    expect((row as ShopRow).disabled).toBe(false);
    expect((row as ShopRow).reason).toBeNull();
    const after = buy(save, WEIGHTED, balance);
    expect(after.items[WEIGHTED]).toBe(1);
    expect(after.money).toBe(RICH - PRICE);
  });

  it("the lock is on the FLAG, not on the purse — a rich unbadged player still cannot buy it", () => {
    const save = withPurse(RICH);
    const base = rowById(shopRows(save, balance), BASE);
    expect(base).toBeTruthy();
    // The discriminator: same purse, same shop, one row open and one shut. If the weighted row were
    // merely unaffordable this would not distinguish the lock from the price.
    expect((base as ShopRow).disabled).toBe(false);
    const attempt = attemptBuy(save, WEIGHTED);
    if (!attempt.threw) {
      expect(attempt.save.items[WEIGHTED]).toBeUndefined();
      expect(serialize(attempt.save)).toBe(serialize(save));
    }
  });

  it("the lock reads the DERIVED flag — a save carrying it by any route is unlocked", () => {
    // Written directly rather than through `awardBadge`, so the shop is proved to read the flag the
    // affixes build and not some private side-channel of the acts module.
    const save: SaveEnvelope = {
      ...withPurse(RICH),
      questFlags: { [badgeFlagFor(SECOND_GYM.id, balance)]: true },
    };
    const row = rowById(shopRows(save, balance), WEIGHTED);
    expect(row).toBeTruthy();
    expect((row as ShopRow).disabled).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. MASTER IS NOT SOLD. The owner GRANTS three at the fifth gym; he never said it is sold.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the master snare is not on the shelf", () => {
  it("appears in no row, at any purse, with or without badges", () => {
    let rowsSeen = 0;
    for (const money of [0, PRICE, RICH]) {
      for (const badged of [false, true]) {
        const save = badged ? afterSecondGym(withPurse(money)) : withPurse(money);
        const rows = shopRows(save, balance);
        expect(rows.length).toBeGreaterThan(0);
        rowsSeen += rows.length;
        expect(rowById(rows, MASTER), `master was on the shelf at ${String(money)}`).toBeUndefined();
      }
    }
    expect(rowsSeen).toBeGreaterThan(0);
  });

  it("cannot be bought behind the UI's back either — no purse buys it", () => {
    const save = afterSecondGym(withPurse(RICH));
    const attempt = attemptBuy(save, MASTER);
    if (!attempt.threw) {
      expect(attempt.save.items[MASTER], "master was sold").toBeUndefined();
      expect(attempt.save.money).toBe(RICH);
      expect(serialize(attempt.save)).toBe(serialize(save));
    }
  });

  it("an id that is not on the shelf at all changes nothing", () => {
    // Guards the general case the master row is one instance of: `buy` must not mint a bag key for
    // anything the shop does not sell.
    const save = afterSecondGym(withPurse(RICH));
    const bogus = "not-a-shop-item";
    expect(SELLABLE_VOCABULARY).not.toContain(bogus);
    const attempt = attemptBuy(save, bogus);
    if (!attempt.threw) {
      expect(attempt.save.items[bogus]).toBeUndefined();
      expect(serialize(attempt.save)).toBe(serialize(save));
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 6. THE REFUSAL SHAPE ITSELF. Every section above asks what a refused purchase leaves BEHIND;
 * this one asks whether the refusal happens at all.
 *
 * Measured, by doing it: rewriting both refusals in `buy()` as `return save` — a silent no-op —
 * left 111 tests across shop, overworld-shop, economy-wiring and economy-primitives GREEN, because
 * "the save did not move" is exactly what a no-op produces. Not one `toThrow` existed in the two
 * shop files. That is the failure `game/shop.ts`'s own docblock names: "a silent no-op is the shape
 * of a purchase that looks like it happened."
 *
 * It reaches the screen because the caller is written against a throw. `OverworldScene.buySelected`
 * (game/scenes/OverworldScene.ts:1400-1417) wraps `buy` in `catch (err) { … err instanceof ShopError
 * … return; }`; a no-op never trips it, so control falls through to `refreshHud()`,
 * `hooks.onSaveChanged` and the banner `bought <id> · <price> · purse <n>` — announced over an
 * unmoved purse, bag and tape.
 *
 * The three refusal CLASSES, read off game/shop.ts:227-230 and enumerated here so a fourth cannot be
 * added without this list going stale:
 *   A. `row === undefined` — the shelf is not offering this id at all. Two routes in: an id
 *      `shelf()` never lists, and a tier `UNSOLD_TIER` filters off it. (A third — `priceOf`
 *      returning null so `shopRows` skips the row — has no subject today: every id `shelf()` yields
 *      is priced by `balance.economy`, which §1 proves by checking each row's price is defined.)
 *   B. `row.disabled` because the row is LOCKED — a gate whose badge the save lacks.
 *   C. `row.disabled` because the row is UNAFFORDABLE — the purse is short of the price.
 * B and C are one branch in `buy` but two different walls in `shopRows`, and §2 already proves they
 * report different reasons; both are exercised because a mutation can reach one and not the other.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("a refused purchase THROWS — it does not return the save untouched", () => {
  it("REFUSES BY THROWING — the shape the scene's catch is written against", () => {
    const bogus = "not-a-shop-item";

    /* ── A(i): an id the shelf has never carried ───────────────────────────── */
    const rich = afterSecondGym(withPurse(RICH));
    expect(SELLABLE_VOCABULARY).not.toContain(bogus);
    expect(rowById(shopRows(rich, balance), bogus)).toBeUndefined();
    expect(() => buy(rich, bogus, balance), "class A(i): an unknown id was not refused").toThrow(
      ShopError,
    );

    /* ── A(ii): a tier core's vocabulary names that the shop filters off the shelf ─ */
    // NOT the disabled class: `shopRows` emits no master row at all, so this takes the SAME branch
    // as A(i) by a different route — a tier the rest of the game knows about. Asserted, so the case
    // cannot quietly become a duplicate of B or C if master were ever shelved-and-greyed instead.
    expect(rowById(shopRows(rich, balance), MASTER), "master is on the shelf").toBeUndefined();
    expect(() => buy(rich, MASTER, balance), "class A(ii): master was not refused").toThrow(ShopError);

    /* ── B: a row that IS on the shelf, disabled because it is locked ──────── */
    // A rich unbadged purse, so the only wall is the badge. If `buy` stopped checking `disabled`
    // this purchase would SUCCEED — the purse covers it — which is why the case is not redundant
    // with C, where an unchecked `disabled` merely reaches `applyPayout`'s overdraw throw instead.
    const unbadged = withPurse(RICH);
    const lockedRow = rowById(shopRows(unbadged, balance), WEIGHTED);
    expect(lockedRow, "the weighted row is absent — class B has no subject").toBeDefined();
    expect((lockedRow as ShopRow).disabled, "weighted is not locked on an unbadged save").toBe(true);
    expect(() => buy(unbadged, WEIGHTED, balance), "class B: a locked row was not refused").toThrow(
      ShopError,
    );

    /* ── C: a row that is on the shelf and unlocked, disabled only by the purse ─ */
    // Both badges held, so nothing is locked and the ONLY reason left is the money. Pinned to a
    // named row rather than `rows.find(disabled)`, which would silently re-test class B whenever the
    // locked row happens to sort first.
    const broke = afterSecondGym(withPurse(0));
    const brokeRow = rowById(shopRows(broke, balance), BASE);
    expect(brokeRow, "the base row is absent — class C has no subject").toBeDefined();
    expect((brokeRow as ShopRow).disabled, "base is buyable at a zero purse").toBe(true);
    // The discriminator that makes this class C and not class B: the same row on the same save with
    // money is open, so the badge is not what shut it.
    const solvent = rowById(shopRows(afterSecondGym(withPurse(RICH)), balance), BASE);
    expect((solvent as ShopRow).disabled, "base is shut even when affordable — this is not class C").toBe(
      false,
    );
    expect(() => buy(broke, BASE, balance), "class C: an unaffordable row was not refused").toThrow(
      ShopError,
    );
  });

  it("the refusal is a ShopError carrying a message, not a bare throw", () => {
    // `OverworldScene.buySelected` prints `err.message` into the banner when `err instanceof
    // ShopError`, and falls back to a generic `describe(err)` otherwise. An empty message is a
    // banner that says the item id and then nothing.
    let caught: unknown = null;
    try {
      buy(afterSecondGym(withPurse(RICH)), "not-a-shop-item", balance);
    } catch (err) {
      caught = err;
    }
    expect(caught, "buy() returned instead of throwing").toBeInstanceOf(ShopError);
    expect((caught as ShopError).message.length).toBeGreaterThan(0);
    expect((caught as ShopError).name).toBe("ShopError");
  });
});
