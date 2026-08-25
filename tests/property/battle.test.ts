/**
 * tests/property/battle.test.ts — build-doc §10.2 property surface for core/battle.ts (lane A3).
 *
 * The two laws the build doc puts on the reducer:
 *   · build-doc §7.4 — "Battle is a pure reducer: (BattleState, Action, rng) => {state, events[]}".
 *     Pure means the same inputs give the same outputs AND the inputs come back untouched. The
 *     no-mutation half is enforced by handing the reducer a DEEP-FROZEN state: a stray write
 *     throws TypeError in strict mode (ES modules are always strict), so the property cannot pass
 *     by accident.
 *   · build-doc §8.1 / L10 — determinism. Identical (state, action, draw sequence) ⇒ byte-identical
 *     result, which is what makes the fixture replays and the balance harness meaningful.
 *
 * Plus the invariants a long random fight must never break: HP inside [0, maxHp], KO = faint only
 * (Hard Req 8 — a knocked-out battler is never removed), one status at a time, level ≤ cap, and
 * damage never under balance.damage.minDamage.
 *
 * fast-check drives the float stream, so there is no Math.random here either (G11).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import {
  catchChance,
  catchInstinctMultiplier,
  makeBattleContext,
  makeBattler,
  predationOracleFromWebs,
  startBattle,
  step,
  type BattleContext,
} from "../../core/battle";
import type { BattleAction, BattleEvent, BattleInput, BattleState, Content, FoodWeb, Trait } from "../../core/types";

const content: Content = validateContent();
const B = content.balance;

/** TEST DOUBLE for core/foodweb.ts (lane A2) — see tests/unit/catch.test.ts. */
const WEB: FoodWeb = {
  nodeId: "prop",
  edges: {
    "fenmaw-line": ["mirefin-line", "reedrick-line"],
    "mirefin-line": ["reedrick-line"],
    "skir-line": ["nibbin-line", "pollywisp-line"],
    "duskstalk-line": ["webvern-line", "barkhide-line"],
  },
  floraFeeders: ["reedrick-line", "nibbin-line"],
};
const CTX: BattleContext = makeBattleContext(content, predationOracleFromWebs([WEB]));

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

const scripted = (values: readonly number[]) => {
  let i = 0;
  return { float: (): number => values[i++ % values.length] ?? 0 };
};

/** fast-check's own seed, pinned so a property failure reproduces (build-doc §8.1 determinism). */
const FC = (numRuns: number) => ({ numRuns, seed: B.rng.defaultSeed });

const floats = fc.array(fc.double({ min: 0, max: 0.999_999, noNaN: true }), { minLength: 8, maxLength: 64 });

/** Lines with a full spread of roles, types and move kinds. */
const LINES = [
  "cindril-line",
  "mirefin-line",
  "fenmaw-line",
  "skir-line",
  "nibbin-line",
  "loamunder-line",
  "carricrow-line",
  "barkhide-line",
  "webvern-line",
  "sporantle-line",
] as const;

const battlerArb = (uid: string) =>
  fc.record({
    uid: fc.constant(uid),
    lineId: fc.constantFrom(...LINES),
    age: fc.constantFrom("J" as const, "A" as const, "E" as const),
    level: fc.integer({ min: 1, max: B.xp.levelCap }),
    traits: fc.constant([] as Trait[]),
  });

const inputArb = fc
  .record({
    seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    kind: fc.constantFrom("wild" as const, "trainer" as const, "gym" as const),
    playerParty: fc.tuple(battlerArb("p1"), battlerArb("p2")),
    enemyParty: fc.tuple(battlerArb("e1"), battlerArb("e2")),
  })
  .map(
    (r): BattleInput => ({
      seed: r.seed,
      kind: r.kind,
      nodeId: "prop",
      playerParty: [...r.playerParty],
      enemyParty: [...r.enemyParty],
      bag: { base: 4, salve: 2, tonic: 2, "reedrick-line": 2 },
    }),
  );

/**
 * Maps a small integer to an action against the CURRENT state. Some of these are deliberately
 * ILLEGAL — a medicine aimed at a benched or fainted teammate, a salve at full HP — because that is
 * where the reducer's invariants get tested. (An earlier version of this generator only ever
 * emitted an untargeted salve, which always healed the live active battler; the fainted-teammate
 * salve that broke `fainted === (curHp === 0)` was unreachable from it.)
 */
const PICKS = 10;

function planned(state: BattleState, pick: number): BattleAction {
  const active = state.battlers[state.activePlayerUid];
  if (!active) throw new Error("no active battler");
  if (active.fainted) {
    const next = state.playerOrder.find((uid) => !state.battlers[uid]?.fainted);
    return next === undefined ? { kind: "flee" } : { kind: "switch", uid: next };
  }
  const anyTeammate = (i: number): string =>
    state.playerOrder[i % state.playerOrder.length] ?? state.activePlayerUid;
  switch (pick) {
    case 4: {
      const next = state.playerOrder.find((uid) => uid !== state.activePlayerUid && !state.battlers[uid]?.fainted);
      return next === undefined ? { kind: "move", moveId: active.moves[0] ?? "" } : { kind: "switch", uid: next };
    }
    case 5:
      return { kind: "snare", tier: "base", baitId: "reedrick-line" };
    case 6:
      return { kind: "flee" };
    case 7:
      return { kind: "item", itemId: B.medicine.salveItemId };
    case 8:
      // Any party member, fainted or not, benched or not — the reducer must refuse the ones it
      // cannot honour rather than half-applying them.
      return { kind: "item", itemId: B.medicine.salveItemId, targetUid: anyTeammate(state.turn) };
    case 9:
      return { kind: "item", itemId: B.medicine.tonicItemId, targetUid: anyTeammate(state.turn + 1) };
    default: {
      const moveId = active.moves[pick % active.moves.length];
      if (moveId === undefined) throw new Error("battler with no moves");
      return { kind: "move", moveId };
    }
  }
}

function play(input: BattleInput, draws: readonly number[], picks: readonly number[]) {
  const rng = scripted(draws);
  const started = startBattle(input, CTX);
  let state = started.state;
  const events: BattleEvent[] = [...started.events];
  for (const pick of picks) {
    if (state.outcome !== null) break;
    const out = step(state, planned(state, pick), rng, CTX);
    state = out.state;
    events.push(...out.events);
  }
  return { state, events };
}

describe("the battle reducer is pure (build-doc §7.4)", () => {
  it("never mutates the state it is given", () => {
    fc.assert(
      fc.property(inputArb, floats, fc.integer({ min: 0, max: PICKS - 1 }), (input, draws, pick) => {
        const started = startBattle(input, CTX);
        const frozen = deepFreeze(structuredClone(started.state)) as BattleState;
        const before = JSON.stringify(frozen);
        const action = planned(frozen, pick);
        const out = step(frozen, action, scripted(draws), CTX);
        // A write to the input would have thrown before we got here; this catches a swapped
        // reference too (a returned state that IS the input, silently aliased).
        expect(JSON.stringify(frozen)).toBe(before);
        /*
         * Returning the input BY REFERENCE is how the reducer says "nothing happened", and a
         * caller may `===` it to detect a no-op. So the invariant is: if the same object comes
         * back, no event may claim the state moved. `actionRejected` (added to the union at
         * integration) is the one event that is compatible with an unchanged state — it exists
         * precisely to explain a no-op that used to be reported as an empty list.
         *
         * This replaces the old proxy `events.length > 0 ⇒ new object`, which was equivalent to
         * the real invariant only while a refusal logged nothing.
         */
        if (out.state === frozen) {
          for (const e of out.events) expect(e.t).toBe("actionRejected");
        } else {
          expect(out.events.length + Number(out.state.turn !== frozen.turn)).toBeGreaterThan(0);
        }
      }),
      FC(200),
    );
  });

  it("never mutates the action it is given", () => {
    fc.assert(
      fc.property(inputArb, floats, fc.integer({ min: 0, max: PICKS - 1 }), (input, draws, pick) => {
        const started = startBattle(input, CTX);
        const action = deepFreeze(planned(started.state, pick));
        const before = JSON.stringify(action);
        step(started.state, action, scripted(draws), CTX);
        expect(JSON.stringify(action)).toBe(before);
      }),
      FC(100),
    );
  });

  it("returns identical results for identical (state, action, draws)", () => {
    fc.assert(
      fc.property(inputArb, floats, fc.array(fc.integer({ min: 0, max: PICKS - 1 }), { maxLength: 24 }), (input, draws, picks) => {
        const a = play(input, draws, picks);
        const b = play(input, draws, picks);
        expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
        expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
      }),
      FC(150),
    );
  });

  it("gives a different draw stream a chance to diverge but never crashes on one", () => {
    fc.assert(
      fc.property(inputArb, floats, floats, fc.array(fc.integer({ min: 0, max: PICKS - 1 }), { maxLength: 16 }), (input, d1, d2, picks) => {
        expect(() => play(input, d1, picks)).not.toThrow();
        expect(() => play(input, d2, picks)).not.toThrow();
      }),
      FC(100),
    );
  });
});

describe("battle invariants over random play", () => {
  it("keeps every battler inside [0, maxHp], fainted-not-deleted, one status, level ≤ cap", () => {
    fc.assert(
      fc.property(inputArb, floats, fc.array(fc.integer({ min: 0, max: PICKS - 1 }), { minLength: 4, maxLength: 40 }), (input, draws, picks) => {
        const { state, events } = play(input, draws, picks);
        const uids = [...input.playerParty, ...input.enemyParty].map((s) => s.uid);
        for (const uid of uids) {
          const b = state.battlers[uid];
          // Hard Req 8 / bible §13.14 — KO is a faint: the battler is still on the books.
          expect(b).toBeDefined();
          if (!b) continue;
          expect(b.curHp).toBeGreaterThanOrEqual(0);
          expect(b.curHp).toBeLessThanOrEqual(b.maxHp);
          expect(b.fainted).toBe(b.curHp === 0);
          expect(b.level).toBeLessThanOrEqual(B.xp.levelCap);
          expect(b.level).toBeGreaterThanOrEqual(1);
          // build-doc §7.4 — one status at a time (the field cannot hold two by construction, so
          // what this pins is that a live one is always one of the four the bible names).
          if (b.status) expect(["Burn", "Toxin", "Soak", "Daze"]).toContain(b.status.name);
          for (const mod of Object.values(b.statMods)) expect(mod).toBeGreaterThan(0);
        }
        for (const e of events) {
          if (e.t === "damage") expect(e.amount).toBeGreaterThanOrEqual(B.damage.minDamage);
          if (e.t === "statusTick") expect(e.amount).toBeGreaterThanOrEqual(B.damage.minDamage);
          if (e.t === "snareThrown") {
            expect(e.chance).toBeGreaterThanOrEqual(B.catch.clampMin);
            expect(e.chance).toBeLessThanOrEqual(B.catch.clampMax);
            expect(e.shakes).toBeLessThanOrEqual(B.catch.shakes);
          }
          if (e.t === "fleeAttempt") {
            expect(e.chance).toBeGreaterThanOrEqual(B.flee.clampMin);
            expect(e.chance).toBeLessThanOrEqual(B.flee.clampMax);
          }
        }
      }),
      FC(200),
    );
  });

  it("stops emitting once the battle is over, and ends exactly once", () => {
    fc.assert(
      fc.property(inputArb, floats, fc.array(fc.integer({ min: 0, max: PICKS - 1 }), { minLength: 8, maxLength: 40 }), (input, draws, picks) => {
        const { state, events } = play(input, draws, picks);
        const ends = events.filter((e) => e.t === "battleEnd");
        expect(ends.length).toBeLessThanOrEqual(1);
        if (state.outcome === null) {
          expect(ends).toHaveLength(0);
        } else {
          expect(ends).toHaveLength(1);
          // Nothing may follow the end of the battle.
          expect(events.at(-1)?.t).toBe("battleEnd");
          // …and a further step is a no-op that returns the very same object.
          const after = step(state, { kind: "move", moveId: "singe" }, scripted(draws), CTX);
          expect(after.state).toBe(state);
          expect(after.events).toEqual([]);
        }
      }),
      FC(150),
    );
  });

  it("ticks every battler's stat-mod durations down on every turn, bench included", () => {
    // bible §3 states durations in TURNS ("Terrify: enemy −Attack 2 turns"). They used to tick only
    // for the two battlers on the field, so a buff could be applied, switched out, and brought back
    // at full strength any number of turns later — free for the player, and a distortion the
    // balance harness would have measured as a real win rate.
    fc.assert(
      fc.property(
        inputArb,
        floats,
        fc.array(fc.integer({ min: 0, max: PICKS - 1 }), { minLength: 6, maxLength: 40 }),
        (input, draws, picks) => {
          const rng = scripted(draws);
          let state = startBattle(input, CTX).state;
          for (const pick of picks) {
            if (state.outcome !== null) break;
            const before = new Map<string, Record<string, number>>();
            for (const [uid, b] of Object.entries(state.battlers)) before.set(uid, { ...b.statModTurns });
            const out = step(state, planned(state, pick), rng, CTX);
            const spentATurn = out.events.some((e) => e.t === "turnStart");
            state = out.state;
            if (!spentATurn) continue; // a rejected action or the free post-faint switch
            if (state.outcome !== null) break; // the end short-circuits end-of-turn processing
            for (const [uid, b] of Object.entries(state.battlers)) {
              const reapplied = new Set(
                out.events.flatMap((e) => (e.t === "statChanged" && e.uid === uid && e.turns > 0 ? [e.stat] : [])),
              );
              for (const [moveId, was] of Object.entries(before.get(uid) ?? {})) {
                const now = b.statModTurns[moveId];
                if (reapplied.size > 0 && now !== undefined && now >= was) continue; // refreshed
                if (now === undefined) {
                  expect(was).toBeLessThanOrEqual(1);
                } else {
                  expect(now).toBe(was - 1);
                }
              }
              // Nothing may sit at or below zero: an expired mod is deleted, never parked.
              for (const turns of Object.values(b.statModTurns)) expect(turns).toBeGreaterThan(0);
            }
          }
        },
      ),
      FC(120),
    );
  });

  it("never spends a medicine without an effect, and never revives with one", () => {
    // The `itemUsed` event means the bag lost an item, so it must be paired with the effect that
    // bought it (a heal or a status cure). The salve that healed a FAINTED teammate — consuming the
    // item, leaving curHp>0 && fainted, and still refusing to switch it in — passed neither half.
    fc.assert(
      fc.property(
        inputArb,
        floats,
        fc.array(fc.integer({ min: 0, max: PICKS - 1 }), { minLength: 8, maxLength: 40 }),
        (input, draws, picks) => {
          const rng = scripted(draws);
          let state = startBattle(input, CTX).state;
          for (const pick of picks) {
            if (state.outcome !== null) break;
            const bagBefore = { ...state.bag };
            const out = step(state, planned(state, pick), rng, CTX);
            const used = out.events.filter((e) => e.t === "itemUsed");
            for (const item of used) {
              const effects = out.events.filter(
                (e) => (e.t === "heal" || e.t === "statusCleared") && e.uid === item.uid,
              );
              expect(effects.length).toBeGreaterThan(0);
              expect((bagBefore[item.itemId] ?? 0) - (out.state.bag[item.itemId] ?? 0)).toBe(1);
              // A medicine is never used on a battler that is down. (Measured on the state the
              // action was taken against — the enemy may still knock the target out later in the
              // same turn, which is an honest KO and not a wasted item.)
              expect(state.battlers[item.uid]?.fainted).toBe(false);
            }
            if (used.length === 0) {
              for (const [key, count] of Object.entries(out.state.bag)) {
                if (key === "base" || key === "reedrick-line") continue; // snare/bait have their own event
                expect(count).toBe(bagBefore[key] ?? 0);
              }
            }
            for (const count of Object.values(out.state.bag)) expect(count).toBeGreaterThanOrEqual(0);
            state = out.state;
          }
        },
      ),
      FC(120),
    );
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * build-doc §7.4 as AMENDED 2026-08-25 (DEVIATIONS D-A5-1): the bait term now scales with the
   * CATCHING creature's Instinct. The unit cases live in tests/unit/catch.test.ts; these are the
   * two laws that must hold for EVERY catcher the roster can produce, not just the tabled ones.
   * ────────────────────────────────────────────────────────────────────────── */

  it("the Instinct term is continuous, strictly increasing and positive for every catcher", () => {
    const statsArb = fc.record({
      hp: fc.integer({ min: 1, max: 400 }),
      atk: fc.integer({ min: 1, max: 400 }),
      def: fc.integer({ min: 1, max: 400 }),
      spd: fc.integer({ min: 1, max: 400 }),
      ins: fc.integer({ min: 1, max: 400 }),
    });
    fc.assert(
      fc.property(battlerArb("c"), statsArb, fc.integer({ min: 1, max: 200 }), (spec, stats, bump) => {
        const base = makeBattler(spec, "player", CTX, { isWild: false, enteredOnTurn: 1 });
        const at = (s: typeof stats): number => catchInstinctMultiplier({ ...base, stats: { ...s } }, B);
        // Positive everywhere: the shipped slope cannot drive the factor to or below zero, so it
        // can never flip the sign of a probability. (The §7.4 clamp is still the only clamp.)
        expect(at(stats)).toBeGreaterThan(0);
        // Strictly increasing in Instinct with the other four stats held: more Instinct is never
        // worth less, which is the whole point of the amendment.
        expect(at({ ...stats, ins: stats.ins + bump })).toBeGreaterThan(at(stats));
        // …and scale-free: multiplying all five stats by the same factor — which is exactly what an
        // age class, a level, a metamorphic jump and the Beast bonus each do — leaves it alone.
        const scaled = { hp: stats.hp * 3, atk: stats.atk * 3, def: stats.def * 3, spd: stats.spd * 3, ins: stats.ins * 3 };
        expect(at(scaled)).toBeCloseTo(at(stats), 10);
      }),
      FC(300),
    );
  });

  it("keeps every catch inside the §7.4 clamp whichever creature throws the snare", () => {
    fc.assert(
      fc.property(battlerArb("c"), battlerArb("t"), fc.constantFrom("base" as const, "weighted" as const, "master" as const), fc.boolean(), (who, what, tier, lure) => {
        const thrower = makeBattler(who, "player", CTX, { isWild: false, enteredOnTurn: 1 });
        const prey = makeBattler(what, "enemy", CTX, { isWild: true, enteredOnTurn: 1 });
        for (const bait of [undefined, "Grazer", "reedrick-line"]) {
          const p = catchChance(prey, tier, bait, lure, CTX, "prop", thrower);
          expect(p).toBeGreaterThanOrEqual(B.catch.clampMin);
          expect(p).toBeLessThanOrEqual(B.catch.clampMax);
          expect(Number.isNaN(p)).toBe(false);
        }
      }),
      FC(300),
    );
  });

  it("only ever reports outcome 'caught' with a caughtUid that is the wild enemy", () => {
    fc.assert(
      fc.property(inputArb, floats, fc.array(fc.integer({ min: 0, max: PICKS - 1 }), { minLength: 4, maxLength: 30 }), (input, draws, picks) => {
        const { state } = play(input, draws, picks);
        if (state.outcome !== "caught") return;
        expect(input.kind).toBe("wild");
        expect(state.caughtUid).toBeDefined();
        const caught = state.battlers[state.caughtUid ?? ""];
        expect(caught?.side).toBe("enemy");
        expect(caught?.isWild).toBe(true);
      }),
      FC(150),
    );
  });
});
