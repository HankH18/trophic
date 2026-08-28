/**
 * tests/unit/economy-primitives.test.ts — the two economy primitives on the action tape:
 * `{t:"payout"}` (T-12 clause 4's missing EARNER) and `{t:"grant"}` (T-60's missing GRANT
 * MACHINERY), against build-doc §7.8 (save shape), §8.1 `det_replay`, L10 ("identical
 * (seed, actionLog) ⇒ byte-identical final save") and G11 (no gameplay constant as a literal).
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL, AND WHY ITS CENTRE OF GRAVITY IS THE REPLAY SECTION.
 * `core/recovery.ts` minted `{t:"innRest"}` onto the log while `core/save.ts` `replay`'s switch had
 * no `case` for it. The entry fell through the default arm, applied nothing, and L10 was silently
 * false for every run that slept — while the suite stayed green, because the one test that could
 * have caught it INJECTED ITS OWN `applyOther` and so supplied the applier whose absence was the
 * defect. `replay()` still has ZERO production callers (T-34's one open gap), so nothing but a test
 * can ever notice a missing arm. Every mutation of `save.money` and `save.items` therefore has to
 * be proved twice here: once down the live path, and once down `replay` with NO host hook helping.
 *
 * The tests are written against the pinned seam, not against an implementation. If they are red,
 * the seam is not landed yet — do not soften them.
 */

import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import type { Balance, GameAction } from "../../core/types";
import {
  appendAction,
  applyGrant,
  applyPayout,
  canonicalStringify,
  deserialize,
  GRANT_ACTION,
  grantAction,
  newSave,
  PAYOUT_ACTION,
  payoutAction,
  readGrant,
  readPayout,
  replay,
  serialize,
  trainerPayout,
  type SaveEnvelope,
} from "../../core/save";

const content = validateContent();
const balance: Balance = content.balance;
const deps = {
  gyms: content.gyms,
  species: content.species,
  balance,
  nodes: content.nodes,
};

function fresh(): SaveEnvelope {
  return newSave({ seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes: content.nodes }, balance);
}

/** A save with a stated purse and bag — the two fields this whole file is about. */
function withPurse(money: number, items: Record<string, number>): SaveEnvelope {
  return { ...fresh(), money, items };
}

/**
 * The figures the tape tests spend. `PAYOUT` is derived from the shipped purse — the flat fee and
 * the per-level rate both — rather than typed as a literal (G11), which also ties the earner to the
 * entry that carries it; `GRANT` is the canon's
 * own number — `maren.tutorial.snare`, "Snares first. Three of them, in the satchel by the door."
 */
const ENEMY_LEVELS = [5, 8] as const;
const PAYOUT = trainerPayout(ENEMY_LEVELS, balance);
const GRANT: Record<string, number> = { base: 3 };

/* ════════════════════════════════════════════════════════════════════════════
 * 1. The mint sites and the tape
 * ════════════════════════════════════════════════════════════════════════════ */

describe("T-12 clause 4 / T-60 — `payout` and `grant` are typed members, not casts", () => {
  it("is not vacuous: the figures these tests spend are real ones", () => {
    // Every assertion below about money moving is worth nothing if the payout is 0, and the
    // additivity assertions are worth nothing if the grant is empty.
    expect(PAYOUT).toBeGreaterThan(0);
    expect(Object.keys(GRANT).length).toBeGreaterThan(0);
  });

  it("payoutAction returns a GameAction the union NARROWS, and readPayout reads the amount back", () => {
    /*
     * The binding here is the annotation and the narrowing, not the `expect`s — T-33's idiom. If
     * `GameAction` loses the member, `payoutAction` goes back to ending in a cast and `action.amount`
     * becomes unreachable from a narrowed `GameAction`, which turns this file red at COMPILE time.
     */
    const action: GameAction = payoutAction(PAYOUT);
    expect(action.t).toBe(PAYOUT_ACTION);
    if (action.t !== "payout") throw new Error("GameAction no longer narrows to the payout member");
    expect(action.amount).toBe(PAYOUT);
    expect(readPayout(action)).toBe(PAYOUT);
  });

  it("grantAction likewise, and readGrant hands back the whole record", () => {
    const action: GameAction = grantAction(GRANT);
    expect(action.t).toBe(GRANT_ACTION);
    if (action.t !== "grant") throw new Error("GameAction no longer narrows to the grant member");
    expect(action.items).toEqual(GRANT);
    expect(readGrant(action)).toEqual(GRANT);
  });

  it("the grant copies the record it is handed rather than aliasing it", () => {
    /*
     * A tape entry is a written fact. If the mint site aliases the caller's object, a later mutation
     * of that object rewrites history and L10's "identical actionLog" stops meaning anything —
     * the same rule `battleAftermathAction` is held to (T-33).
     */
    const source: Record<string, number> = { base: 3 };
    const action = grantAction(source);
    source.base = 99;
    source.master = 1;
    expect(readGrant(action)).toEqual({ base: 3 });
  });

  it("the discriminants are wire format, and are pinned as such", () => {
    // These two strings land on disk the moment a run pays out or is given anything, so renaming
    // one is a save-format break (INV-2 — a save this build writes must still load next build),
    // not a refactor.
    expect(PAYOUT_ACTION).toBe("payout");
    expect(GRANT_ACTION).toBe("grant");
  });

  it("both entries survive the tape's own serializer with their payloads intact", () => {
    // `zSaveFileFor` validates `actionLog[].action` as `z.looseObject({ t })` — deliberately, so a
    // lane adding an action need not edit core/schemas.ts. A `z.object` there would hand back `{t}`
    // alone, and the amount and the item counts would vanish on load with nothing thrown.
    const save = appendAction(appendAction(fresh(), payoutAction(PAYOUT)), grantAction(GRANT));
    expect(save.actionLog.map((e) => e.seq)).toEqual([0, 1]);
    const round = deserialize(serialize(save), balance);
    expect(readPayout(round.actionLog[0]?.action)).toBe(PAYOUT);
    expect(readGrant(round.actionLog[1]?.action)).toEqual(GRANT);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The two appliers
 * ════════════════════════════════════════════════════════════════════════════ */

describe("applyPayout / applyGrant — additive, isolated, and never in place", () => {
  it("applyPayout adds the amount to the purse and touches nothing else", () => {
    const before = withPurse(100, { base: 1 });
    const after = applyPayout(before, PAYOUT);
    expect(after.money).toBe(100 + PAYOUT);
    expect(Number.isInteger(after.money)).toBe(true);
    expect(after.items).toEqual({ base: 1 });
  });

  it("applyGrant adds the items and touches nothing else — the purse is a separate entry", () => {
    // A grant that also moved money would make the two entries impossible to reason about on the
    // tape: replaying one would imply the other. They are separate actions because they are
    // separate facts.
    const before = withPurse(100, {});
    const after = applyGrant(before, GRANT);
    expect(after.items).toEqual(GRANT);
    expect(after.money).toBe(100);
  });

  it("applyGrant is ADDITIVE — the same grant twice is worth twice as much", () => {
    /*
     * T-60 item 3, measured: EVERY production write to `save.items` today is a wholesale REPLACE
     * from the battle bag as the reducer left it (`core/save.ts:523`, `:598`). That shape is
     * structurally unable to increase a stack, which is why "give the player three snares" had no
     * door to come through at all.
     */
    const start = withPurse(0, {});
    const once = applyGrant(start, { base: 3 });
    const twice = applyGrant(once, { base: 3 });
    expect(once.items.base).toBe(3);
    expect(twice.items.base).toBe(6);
  });

  it("adds a key without disturbing the keys already there, and grants several at once", () => {
    const held = withPurse(0, { base: 3, salve: 1 });
    const after = applyGrant(held, { weighted: 1 });
    expect(after.items).toEqual({ base: 3, salve: 1, weighted: 1 });

    const more = applyGrant(after, { base: 1, master: 2 });
    expect(more.items).toEqual({ base: 4, salve: 1, weighted: 1, master: 2 });
  });

  it("⚠ never DROPS a key, and a ZERO count is a key — the defect this file exists to catch", () => {
    /*
     * THE LOAD-BEARING PROPERTY, and it is not obvious from the applier alone. `core/battle.ts:1226`
     * `bagHas` returns TRUE for a key ABSENT from the bag — "untracked", the affordance the balance
     * harness runs on — and `bagConsume` (`:1231`) returns early on an absent key. The meter is ON
     * for a key that EXISTS, and it STAYS on at zero, because the save schema admits 0 (`zNonNegInt`)
     * and `bagConsume` decrements rather than deletes.
     *
     * ⚠ THIS COMMENT USED TO ADD "`newSave` writes `items: {}`, so in the shipped game the snare
     * meter is OFF and catching is UNLIMITED", AND THAT IS NO LONGER TRUE. `core/save.ts` `newSave`
     * seeds `emptyMeteredBag` — every snare tier and both medicines at zero — so the meter is on
     * from boot and a grant only puts stock in. What is unchanged, and is what this test is about,
     * is that dropping a key would switch it back off.
     *
     * So a grant that replaced the map, or that tidied a spent key away, would switch the economy
     * silently back off — a player with 0 base snares would go back to having infinite ones, and
     * nothing else in the suite would go red.
     *
     * THE ASSERTION IS ON PRESENCE, NOT VALUE. A deleted key reads back `undefined`, and every
     * reader in the repo reaches it through `?? 0`, so a value-only assertion passes for the
     * deleted key too and proves the opposite of what it looks like.
     */
    const spent = withPurse(0, { base: 0, weighted: 2 });
    const after = applyGrant(spent, { weighted: 1 });
    expect("base" in after.items).toBe(true);
    expect(Object.keys(after.items).sort()).toEqual(["base", "weighted"]);
    expect(after.items.base).toBe(0);
    expect(after.items.weighted).toBe(3);

    // …and a zeroed key is topped up rather than re-created from nothing.
    const refilled = applyGrant(spent, { base: 3 });
    expect(refilled.items.base).toBe(3);
    expect(refilled.items.weighted).toBe(2);
  });

  it("both return a NEW save and leave the one they were handed alone", () => {
    // The whole `core/` layer is pure (L11) and every applier in `core/save.ts` returns a new
    // envelope; an in-place mutation here would make `replay` and the live path share state.
    const before = withPurse(100, { base: 1 });
    const paid = applyPayout(before, 50);
    const granted = applyGrant(before, { base: 2 });
    expect(paid).not.toBe(before);
    expect(granted).not.toBe(before);
    expect(granted.items).not.toBe(before.items);
    expect(before.money).toBe(100);
    expect(before.items).toEqual({ base: 1 });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. L10 — the replay arms, with no host to help them
 * ════════════════════════════════════════════════════════════════════════════ */

describe("§8.1 L10 — `replay` applies BOTH entries with the same appliers the live path used", () => {
  /*
   * ⚠ NOTHING IN THIS SECTION MAY INJECT AN `applyOther` THAT UNDERSTANDS THESE ENTRIES. That is
   * exactly how the inn rest's missing arm stayed green for a whole build: the test supplied the
   * applier and then asserted the replay matched. The only hook injected below is the deliberately
   * INERT one, whose entire job is to prove that a host contributing nothing cannot be what makes
   * the payout and the grant land.
   */

  /** The live path: append the entry, then apply it — the two calls a caller makes, in that order. */
  function livePath(initial: SaveEnvelope): SaveEnvelope {
    let save = applyPayout(appendAction(initial, payoutAction(PAYOUT)), PAYOUT);
    save = applyGrant(appendAction(save, grantAction(GRANT)), GRANT);
    return save;
  }

  it("THE WHOLE live save replays byte-identically — purse, bag, tape and all", () => {
    /*
     * L10 verbatim, and the single most important assertion in this file: it is the one the inn
     * rest did not have. `serialize` is the byte-exact comparison the repo already uses for this
     * claim (it sorts every object key at every depth, so key ORDER cannot make two equal saves
     * look different, nor two different saves look equal).
     */
    const initial = withPurse(0, {});
    const live = livePath(initial);

    // THE RIG FIRST: if neither applier moved anything, an empty replay would agree trivially.
    expect(live.money).not.toBe(initial.money);
    expect(canonicalStringify(live.items)).not.toBe(canonicalStringify(initial.items));
    expect(live.actionLog.map((e) => e.seq)).toEqual([0, 1]);

    const replayed = replay({ ...initial, actionLog: [] }, live.actionLog, deps);
    expect(serialize(replayed)).toBe(serialize(live));
  });

  it("a host that understands NOTHING still gets both — the rig cannot be what applies them", () => {
    /*
     * The direct anti-regression on the false instrument described above. `applyOther` is present
     * and is the identity, so if either `case` arm in `core/save.ts` `replay` is removed or made a
     * no-op, there is nothing else in the process that can move the money or the bag.
     */
    const initial = withPurse(0, {});
    const live = livePath(initial);
    const inert = { ...deps, applyOther: (save: SaveEnvelope): SaveEnvelope => save };
    const replayed = replay({ ...initial, actionLog: [] }, live.actionLog, inert);
    expect(replayed.money).toBe(live.money);
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(live.items));
    expect(replayed.money).toBe(PAYOUT);
    expect(replayed.items).toEqual(GRANT);
  });

  it("…and it is the ENTRIES that carry it: strip them and the replay stays poor", () => {
    // The other half of the same claim. If the replay reached the same purse with the entries gone,
    // the arms would not be what applied them and the test above would be proving something else.
    const initial = withPurse(0, {});
    const live = livePath(initial);
    const stripped = live.actionLog
      .filter((e) => readPayout(e.action) === null && readGrant(e.action) === null)
      .map((e, i) => ({ ...e, seq: i }));
    expect(
      stripped.length,
      "the rig's tape had no economy entries to strip — the comparison below proves nothing",
    ).toBe(live.actionLog.length - 2);

    const replayed = replay({ ...initial, actionLog: [] }, stripped, deps);
    expect(replayed.money).toBe(initial.money);
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(initial.items));
  });

  it("MALFORMED entries change nothing rather than half-applying — the shape is re-checked", () => {
    /*
     * The tape reaches `replay` through `core/schemas.ts`'s permissive `looseObject`, so `t` is a
     * claim and not a proof: a hand-edited save, or one written by a later build, can carry a
     * `{t:"grant"}` whose payload is anything at all. This is why the arms dispatch through
     * `readGrant`/`readPayout` instead of reading the field off the narrowed union — and it is not
     * academic for the grant, since `(items[k] ?? 0) + n` with a STRING `n` yields "03" and writes a
     * save the schema will refuse on the next load (INV-2, `zNonNegInt`).
     */
    const initial = withPurse(0, {});
    const live = livePath(initial);
    const corrupted = live.actionLog.map((e) => {
      if (readPayout(e.action) !== null) {
        return { ...e, action: { t: PAYOUT_ACTION } as unknown as GameAction };
      }
      if (readGrant(e.action) !== null) {
        return { ...e, action: { t: GRANT_ACTION, items: { base: "3" } } as unknown as GameAction };
      }
      return e;
    });
    const replayed = replay({ ...initial, actionLog: [] }, corrupted, deps);
    expect(replayed.money).toBe(initial.money);
    expect(canonicalStringify(replayed.items)).toBe(canonicalStringify(initial.items));
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. The readers re-check the shape
 * ════════════════════════════════════════════════════════════════════════════ */

describe("readPayout / readGrant re-check the shape rather than trusting the discriminant", () => {
  it("readPayout answers the amount for a real payout — including a payout of nothing", () => {
    // Zero is WELL-FORMED, not malformed, and it is the case a `return a.amount || null` gets
    // wrong: a defeated trainer with a level-0 roster is a payout of 0, not a corrupt entry.
    expect(readPayout(payoutAction(PAYOUT))).toBe(PAYOUT);
    expect(readPayout(payoutAction(0))).toBe(0);
  });

  it("readPayout is null for a wrong `t`, a missing field, a wrong type and the near-miss", () => {
    expect(readPayout(null)).toBeNull();
    expect(readPayout(undefined)).toBeNull();
    expect(readPayout("payout")).toBeNull();
    expect(readPayout(42)).toBeNull();
    expect(readPayout({})).toBeNull();
    expect(readPayout({ t: "travel", to: "r1" })).toBeNull();
    expect(readPayout({ t: PAYOUT_ACTION })).toBeNull();
    expect(readPayout({ t: PAYOUT_ACTION, amount: "240" })).toBeNull();
    expect(readPayout({ t: PAYOUT_ACTION, amount: null })).toBeNull();
    // THE NEAR-MISS THAT MATTERS — the discriminant is right and the payload is the OTHER entry's.
    // A reader that trusted `t` would hand `undefined` to `applyPayout` and make the purse NaN.
    expect(readPayout({ t: PAYOUT_ACTION, items: { base: 3 } })).toBeNull();
    expect(readPayout(grantAction(GRANT))).toBeNull();
  });

  it("readGrant answers the record for a real grant", () => {
    expect(readGrant(grantAction(GRANT))).toEqual(GRANT);
    expect(readGrant(grantAction({ base: 0 }))).toEqual({ base: 0 });
  });

  it("readGrant is null for a wrong `t`, a missing field, a wrong type and the near-miss", () => {
    expect(readGrant(null)).toBeNull();
    expect(readGrant(undefined)).toBeNull();
    expect(readGrant("grant")).toBeNull();
    expect(readGrant({})).toBeNull();
    expect(readGrant({ t: "travel", to: "r1" })).toBeNull();
    expect(readGrant({ t: GRANT_ACTION })).toBeNull();
    expect(readGrant({ t: GRANT_ACTION, items: null })).toBeNull();
    expect(readGrant({ t: GRANT_ACTION, items: 3 })).toBeNull();
    expect(readGrant({ t: GRANT_ACTION, items: ["base"] })).toBeNull();
    // A count that is not a number is the one that corrupts rather than merely mis-reads: the
    // applier's `+` would concatenate it into the save.
    expect(readGrant({ t: GRANT_ACTION, items: { base: "3" } })).toBeNull();
    // THE NEAR-MISS — right discriminant, the payout's payload.
    expect(readGrant({ t: GRANT_ACTION, amount: 240 })).toBeNull();
    expect(readGrant(payoutAction(PAYOUT))).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 5. T-12 clause 4 — the earner, and where its rate lives
 * ════════════════════════════════════════════════════════════════════════════ */

describe("T-12 clause 4 — trainerPayout is the earner, and BOTH its terms come from balance.json (G11)", () => {
  const rate = balance.economy.trainerPayoutPerLevel;
  const flat = balance.economy.trainerPayoutFlat;

  it("is not vacuous: the shipped flat fee and rate are both real figures", () => {
    // `flat + sum × 0` collapses to a constant and `0 + sum × rate` collapses to the old purely
    // per-level purse — either would make assertions below pass for free, and the second is the
    // exact shape this section exists to forbid. T-12 clause 4 recorded `trainerPayoutPerLevel` as
    // having zero readers for two passes; this file is the first place either figure is spent, so
    // both are worth asserting on before anything is derived from them.
    expect(rate).toBeGreaterThan(0);
    expect(flat).toBeGreaterThan(0);
  });

  it("pays the flat per-fight fee PLUS the summed enemy levels at the balance rate", () => {
    // `Math.round` for the same reason the function carries it: `core/schemas.ts` types both
    // tunables as `z.number().min(0)`, so a fractional retune is expressible and the expectation
    // must survive it. For every value the game ships it is the identity.
    expect(trainerPayout([5, 8], balance)).toBe(Math.round(flat + rate * 13));
    expect(trainerPayout([9], balance)).toBe(Math.round(flat + rate * 9));
    expect(Number.isInteger(trainerPayout([5, 8], balance))).toBe(true);
  });

  it("⚠ THE FLAT HALF IS REALLY LEVIED — a purse is not `rate × Σ levels` alone", () => {
    /*
     * THE REGRESSION THIS SECTION EXISTS TO CATCH, and the one nothing caught before it was
     * written. Hank's ruling: "Make it so that earnings don't scale quite as much... that point
     * shouldn't be until probably Act 5." A purely per-level purse cannot obey it — the rival's
     * summed levels grow 15x across the six acts, so ANY flat rate reproduces that same 15x spread
     * and money is abundant by act 2. `balance.economy._trainerPayout` records the whole ruling.
     *
     * Dropping `trainerPayoutFlat` back out of the formula passes every "sums the roster" and
     * "reads the rate" assertion in this file. It fails here.
     */
    expect(trainerPayout([5, 8], balance)).not.toBe(Math.round(rate * 13));
    expect(trainerPayout([5, 8], balance)).toBe(Math.round(rate * 13 + flat));

    /*
     * And the ruling's own consequence, stated as arithmetic rather than as prose: the purse must
     * grow MORE SLOWLY than the roster that earns it. Under `rate × Σ` the two ratios are equal —
     * ten times the levels, ten times the money — which is precisely the curve that was rejected.
     */
    const lean = trainerPayout([10], balance);
    const fat = trainerPayout([100], balance);
    expect(lean).toBeGreaterThan(0);
    expect(fat / lean).toBeLessThan(100 / 10);
  });

  it("SUMS the roster — not the first level, nor the largest, nor the mean — and charges the fee ONCE", () => {
    expect(trainerPayout([3, 9], balance)).toBe(trainerPayout([9, 3], balance));
    expect(trainerPayout([3, 9], balance)).toBe(trainerPayout([12], balance));
    expect(trainerPayout([3, 9], balance)).not.toBe(trainerPayout([9], balance));

    /*
     * THE FEE IS PER FIGHT, NOT PER CREATURE. Three level-4s and one level-12 field the same summed
     * levels, so they must price identically; a flat half levied per member of the roster pays the
     * three-creature trainer two extra fees and goes red on the first line below. The per-level
     * half is then read on its own, with the one fee subtracted off either side, so "it sums" is
     * still asserted rather than being absorbed into the constant.
     */
    expect(trainerPayout([4, 4, 4], balance)).toBe(trainerPayout([12], balance));
    expect(trainerPayout([4, 4, 4], balance)).toBe(Math.round(flat + rate * 12));
    expect(trainerPayout([4], balance)).toBe(Math.round(flat + rate * 4));
  });

  it("reads BOTH terms from the Balance it is handed — retune either and the payout moves (G11)", () => {
    /*
     * The direct test that no purse figure is compiled in. G11: "no gameplay constant as a literal
     * in code — all from data/balance.json". A `100` or a `3` in the function body passes every
     * assertion above and fails only this one.
     */
    const doubledRate: Balance = {
      ...balance,
      economy: { ...balance.economy, trainerPayoutPerLevel: rate * 2 },
    };
    expect(trainerPayout([5, 8], doubledRate)).toBe(Math.round(flat + rate * 2 * 13));

    const doubledFlat: Balance = {
      ...balance,
      economy: { ...balance.economy, trainerPayoutFlat: flat * 2 },
    };
    expect(trainerPayout([5, 8], doubledFlat)).toBe(Math.round(flat * 2 + rate * 13));

    // Each half zeroed on its own, which pins the other half's contribution exactly. `rate: 0`
    // leaving `flat` behind is the same assertion as the section above, made from the data side:
    // a function that ignored `trainerPayoutFlat` would pay 0 here.
    const noRate: Balance = {
      ...balance,
      economy: { ...balance.economy, trainerPayoutPerLevel: 0 },
    };
    expect(trainerPayout([5, 8], noRate)).toBe(Math.round(flat));

    const noFlat: Balance = {
      ...balance,
      economy: { ...balance.economy, trainerPayoutFlat: 0 },
    };
    expect(trainerPayout([5, 8], noFlat)).toBe(Math.round(rate * 13));

    const free: Balance = {
      ...balance,
      economy: { ...balance.economy, trainerPayoutFlat: 0, trainerPayoutPerLevel: 0 },
    };
    expect(trainerPayout([5, 8], free)).toBe(0);
  });

  it("an empty roster pays nothing rather than NaN — or the flat fee for a fight against nobody", () => {
    /*
     * The gym leaders and the rival all field rosters this function will be handed; a trainer whose
     * party failed to resolve must cost the player's purse nothing, and must not poison it with a
     * NaN that then serializes and fails the schema on the next load.
     *
     * ⚠ THIS IS NOW A GUARD RATHER THAN ARITHMETIC. Under the old purely multiplicative purse it
     * fell out of the empty sum for free; with a flat per-fight fee it does not, and `trainerPayout`
     * carries an explicit `enemyLevels.length === 0` early return because of it. Delete that line
     * and a fight against no one pays `trainerPayoutFlat` — which the second assertion names.
     */
    expect(trainerPayout([], balance)).toBe(0);
    expect(trainerPayout([], balance)).not.toBe(flat);
  });

  it("what it earns is what the tape carries — the earner and the entry agree", () => {
    // The two halves of the loop closing: `trainerPayout` decides the figure, `payoutAction` writes
    // it down, `applyPayout` adds it. If any of the three disagreed, the purse a run ends with would
    // not be the purse its tape describes.
    const earned = trainerPayout([5, 8], balance);
    const initial = withPurse(0, {});
    const live = applyPayout(appendAction(initial, payoutAction(earned)), earned);
    expect(live.money).toBe(earned);
    expect(readPayout(live.actionLog[0]?.action)).toBe(earned);
    const replayed = replay({ ...initial, actionLog: [] }, live.actionLog, deps);
    expect(replayed.money).toBe(earned);
  });
});
