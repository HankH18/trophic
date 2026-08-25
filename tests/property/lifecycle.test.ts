/**
 * tests/property/lifecycle.test.ts — build-doc §10.2 property suite for the aging lane.
 *
 * The unit suite pins specific years and specific creatures. These are the LAWS: they must hold for
 * every line in data/species.json, every catch age, every stream and every decision script. In
 * particular `det_replay` (build-doc §8.1) and G10 (boxed creatures age identically) are stated
 * here as properties rather than as examples, because an implementation that skips box aging for
 * one shape of save is exactly the failure an example test misses.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateContent } from "../../core/schemas";
import type {
  ActionLogEntry,
  AgeClass,
  Balance,
  NodeFile,
  OwnedCreature,
  RetirementChoice,
  SaveFile,
  SpeciesLine,
  StatKey,
} from "../../core/types";
import { AGE_CLASSES, STAT_KEYS } from "../../core/types";
import {
  advanceYear,
  boonMaxStacksPerStat,
  boonMultiplier,
  heirLevelMin,
  LifecycleError,
  indexSpecies,
  isNever,
  newOwnedCreature,
  projectedRetirementYearOf,
  resolveRetirement,
  rollHeirChoice,
  runYearTurn,
  yearTurnActions,
  type RandomFn,
} from "../../core/lifecycle";
import { appendYearTurn, newSave, replay, serialize, type SaveEnvelope } from "../../core/save";

const content = validateContent();
const balance: Balance = content.balance;
const species: SpeciesLine[] = content.species;
const nodes: NodeFile[] = content.nodes;
const index = indexSpecies(species);

const mortalLines = species.filter((s) => !s.ancient);
const ancientLines = species.filter((s) => s.ancient);
const traitPool = balance.traits.pool;

/** A stand-in for core/rng.ts's stream: replays a generated list of uniforms. No ambient randomness. */
function stream(values: readonly number[]): RandomFn {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v ?? 0;
  };
}

const arbUniforms = fc.array(fc.double({ min: 0, max: 0.999999, noNaN: true }), {
  minLength: 1,
  maxLength: 24,
});
const arbLineId = fc.constantFrom(...mortalLines.map((s) => s.id));
const arbAge = fc.constantFrom<AgeClass>(...AGE_CLASSES);
const arbLevel = fc.integer({ min: 1, max: balance.xp.levelCap });
const arbTraitIds = fc.uniqueArray(
  fc.constantFrom(...traitPool.map((t) => t.id)),
  { minLength: 0, maxLength: balance.traits.maxSlots },
);

function traitsFrom(ids: readonly string[]) {
  return ids.map((id) => traitPool.find((t) => t.id === id)).filter((t) => t !== undefined);
}

function base(party: OwnedCreature[], box: OwnedCreature[] = []): SaveEnvelope {
  const save = newSave({ seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes }, balance);
  return { ...save, party, box };
}

const deps = { species, balance, nodes };

describe("aging is a law, not an example", () => {
  it("never lets yearsRemaining go negative, and always drops it by exactly one", () => {
    fc.assert(
      fc.property(arbLineId, arbAge, arbLevel, fc.integer({ min: 1, max: 8 }), (lineId, age, level, turns) => {
        const l = species.find((s) => s.id === lineId) as SpeciesLine;
        let save: SaveFile = base([
          newOwnedCreature({ uid: "u", lineId, age, level, caughtYear: 1 }, l, balance),
        ]);
        for (let i = 0; i < turns; i += 1) {
          const before = save.party[0];
          save = runYearTurn(save, deps).save;
          const after = save.party[0];
          if (!before) {
            expect(after).toBeUndefined();
            continue;
          }
          if (after) {
            expect(after.yearsRemaining).toBe(before.yearsRemaining - 1);
            expect(after.yearsRemaining).toBeGreaterThan(0);
          } else {
            expect(before.yearsRemaining).toBe(1);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("advances the age class monotonically J -> A -> E and never backwards", () => {
    fc.assert(
      fc.property(arbLineId, arbAge, fc.integer({ min: 1, max: 6 }), (lineId, age, turns) => {
        const l = species.find((s) => s.id === lineId) as SpeciesLine;
        let save: SaveFile = base([
          newOwnedCreature({ uid: "u", lineId, age, level: 10, caughtYear: 1 }, l, balance),
        ]);
        let last = AGE_CLASSES.indexOf(age);
        for (let i = 0; i < turns; i += 1) {
          save = runYearTurn(save, deps).save;
          const c = save.party[0];
          if (!c) break;
          const now = AGE_CLASSES.indexOf(c.age);
          expect(now).toBeGreaterThanOrEqual(last);
          expect(now - last).toBeLessThanOrEqual(1);
          last = now;
        }
      }),
      { numRuns: 200 },
    );
  });

  it("keeps projectedRetirementYear fixed from catch until the year it retires in", () => {
    fc.assert(
      fc.property(arbLineId, arbAge, fc.integer({ min: 1, max: 6 }), (lineId, age, caughtYear) => {
        const l = species.find((s) => s.id === lineId) as SpeciesLine;
        const c = newOwnedCreature({ uid: "u", lineId, age, level: 10, caughtYear }, l, balance);
        const projected = c.projectedRetirementYear;
        let save: SaveFile = { ...base([c]), year: caughtYear };
        for (;;) {
          const turn = runYearTurn(save, deps);
          save = turn.save;
          if (turn.prompts.length > 0) {
            expect(save.year).toBe(projected);
            break;
          }
          const alive = save.party[0] as OwnedCreature;
          expect(alive.projectedRetirementYear).toBe(projected);
          expect(projectedRetirementYearOf(alive, save.year, index)).toBe(projected);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("applies the metamorphic stat jump at most once, whatever the catch age", () => {
    fc.assert(
      fc.property(arbLineId, arbAge, (lineId, age) => {
        const l = species.find((s) => s.id === lineId) as SpeciesLine;
        let save: SaveFile = base([
          newOwnedCreature({ uid: "u", lineId, age, level: 10, caughtYear: 1 }, l, balance),
        ]);
        let morphs = 0;
        for (let i = 0; i < balance.age.lifespanYears.J + 1; i += 1) {
          const turn = runYearTurn(save, deps);
          save = turn.save;
          morphs += turn.events.filter((e) => e.t === "metamorphosed").length;
        }
        expect(morphs).toBeLessThanOrEqual(1);
        if (!l.metamorphic) expect(morphs).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});

describe("G10 — a boxed creature ages exactly like the same creature in the party", () => {
  it("holds for every line, every catch age and every number of year turns", () => {
    fc.assert(
      fc.property(
        arbLineId,
        arbAge,
        arbLevel,
        arbTraitIds,
        fc.integer({ min: 1, max: 8 }),
        (lineId, age, level, traitIds, turns) => {
          const l = species.find((s) => s.id === lineId) as SpeciesLine;
          const traits = traitsFrom(traitIds);
          const mk = (uid: string, boxed: boolean) =>
            newOwnedCreature(
              { uid, lineId, age, level, caughtYear: 1, traits, boxed },
              l,
              balance,
            );
          let save: SaveFile = base([mk("p", false)], [mk("b", true)]);
          for (let i = 0; i < turns; i += 1) {
            save = runYearTurn(save, deps).save;
            const p = save.party[0];
            const b = save.box[0];
            expect(p === undefined).toBe(b === undefined);
            if (!p || !b) break;
            expect({ ...b, uid: "", boxed: undefined }).toEqual({ ...p, uid: "", boxed: undefined });
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("loses nobody: party + box + retirees is conserved by every year turn", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbLineId, arbAge), { minLength: 0, maxLength: 5 }),
        fc.array(fc.tuple(arbLineId, arbAge), { minLength: 0, maxLength: 9 }),
        (partySpec, boxSpec) => {
          const mk = (spec: Array<[string, AgeClass]>, prefix: string, boxed: boolean) =>
            spec.map(([lineId, age], i) =>
              newOwnedCreature(
                { uid: `${prefix}${i}`, lineId, age, level: 10, caughtYear: 1, boxed },
                species.find((s) => s.id === lineId) as SpeciesLine,
                balance,
              ),
            );
          const save = base(mk(partySpec, "p", false), mk(boxSpec, "b", true));
          const before = save.party.length + save.box.length;
          const turn = runYearTurn(save, deps);
          expect(turn.save.party.length + turn.save.box.length + turn.retired.length).toBe(before);
          expect(turn.prompts.length).toBe(turn.retired.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Hard Req 4 / G10 — caught Ancients are the sole exception", () => {
  it("never ages an Ancient, in party or box, for any number of year turns", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ancientLines.map((s) => s.id)),
        fc.integer({ min: 1, max: 12 }),
        (lineId, turns) => {
          const l = species.find((s) => s.id === lineId) as SpeciesLine;
          const a = newOwnedCreature({ uid: "a", lineId, age: "E", level: 40, caughtYear: 1 }, l, balance);
          const b = newOwnedCreature(
            { uid: "b", lineId, age: "E", level: 40, caughtYear: 1, boxed: true },
            l,
            balance,
          );
          let save: SaveFile = base([a], [b]);
          for (let i = 0; i < turns; i += 1) {
            const turn = runYearTurn(save, deps);
            save = turn.save;
            expect(turn.prompts).toHaveLength(0);
          }
          expect(save.party[0]).toEqual(a);
          expect(save.box[0]).toEqual(b);
          expect(isNever((save.party[0] as OwnedCreature).yearsRemaining)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("build-doc §7.5 step 3 — the heir is always a legal descendant, never an invention", () => {
  it("inherits only the parent's traits, in the balance-declared count, at the halved level", () => {
    fc.assert(
      fc.property(arbLineId, arbLevel, arbTraitIds, arbUniforms, (lineId, level, traitIds, uniforms) => {
        const l = species.find((s) => s.id === lineId) as SpeciesLine;
        const traits = traitsFrom(traitIds);
        const parent = newOwnedCreature(
          { uid: "parent", lineId, age: "E", level, caughtYear: 1, traits },
          l,
          balance,
        );
        const turn = runYearTurn(base([parent]), deps);
        const prompt = turn.prompts[0];
        if (!prompt) return;

        const choice = rollHeirChoice(prompt, stream(uniforms), balance, turn.save.year);
        expect(choice.kind).toBe("heir");
        if (choice.kind !== "heir") return;

        const cap = Math.min(balance.retirement.heirInheritedTraitsMax, balance.traits.maxSlots);
        const hi = Math.min(cap, traits.length);
        const lo = Math.min(balance.retirement.heirInheritedTraitsMin, hi);
        expect(choice.inheritedTraitIds.length).toBeGreaterThanOrEqual(lo);
        expect(choice.inheritedTraitIds.length).toBeLessThanOrEqual(hi);
        expect(new Set(choice.inheritedTraitIds).size).toBe(choice.inheritedTraitIds.length);

        const heir = resolveRetirement(turn.save, prompt, choice, deps).heir as OwnedCreature;
        const parentIds = new Set(traits.map((t) => t.id));
        for (const t of heir.traits) expect(parentIds.has(t.id)).toBe(true);
        expect(heir.traits.length).toBeLessThanOrEqual(balance.traits.maxSlots);
        expect(heir.age).toBe("J");
        expect(heir.lineId).toBe(l.ancient ? l.id : lineId);
        expect(heir.level).toBe(
          Math.min(
            balance.xp.levelCap,
            Math.max(heirLevelMin(balance), Math.floor(level * balance.retirement.heirLevelFactor)),
          ),
        );
        expect(heir.relicSlot).toBeTruthy();
        expect(heir.yearsRemaining).toBe(balance.age.lifespanYears.J);
      }),
      { numRuns: 300 },
    );
  });

  it("grants a boon of exactly one stat, on exactly one teammate", () => {
    fc.assert(
      fc.property(arbLineId, fc.constantFrom<StatKey>(...STAT_KEYS), (lineId, stat) => {
        const l = species.find((s) => s.id === lineId) as SpeciesLine;
        const parent = newOwnedCreature(
          { uid: "parent", lineId, age: "E", level: 20, caughtYear: 1 },
          l,
          balance,
        );
        const mate = newOwnedCreature(
          { uid: "mate", lineId, age: "J", level: 10, caughtYear: 1 },
          l,
          balance,
        );
        const turn = runYearTurn(base([parent, mate]), deps);
        const prompt = turn.prompts.find((p) => p.parentUid === "parent");
        if (!prompt) return;
        const out = resolveRetirement(
          turn.save,
          prompt,
          { kind: "boon", parentUid: "parent", targetUid: "mate", stat },
          deps,
        );
        const boosted = out.save.party.find((c) => c.uid === "mate");
        if (!boosted) return;
        expect(boosted.boons).toHaveLength(1);
        expect(boosted.boons[0]?.stat).toBe(stat);
        for (const other of out.save.party) {
          if (other.uid === "mate") continue;
          expect(other.boons).toHaveLength(0);
        }
      }),
      { numRuns: 150 },
    );
  });
});

describe("build-doc §8.1 det_replay — identical (seed, actionLog) => byte-identical final save", () => {
  const arbDecisions = fc.array(fc.boolean(), { minLength: 1, maxLength: 12 });

  function timeline(uniforms: readonly number[], preferBoon: readonly boolean[], years: number) {
    const starterLine = species.find((s) => s.id === "cindril-line") as SpeciesLine;
    const other = species.find((s) => s.id === "nibbin-line") as SpeciesLine;
    const initial: SaveEnvelope = base(
      [
        newOwnedCreature(
          {
            uid: "starter",
            lineId: starterLine.id,
            age: "J",
            level: balance.xp.starterLevel,
            caughtYear: 1,
            traits: traitsFrom([traitPool[0]?.id ?? "", traitPool[1]?.id ?? ""]),
          },
          starterLine,
          balance,
        ),
        newOwnedCreature(
          { uid: "mate", lineId: other.id, age: "J", level: 8, caughtYear: 1 },
          other,
          balance,
        ),
      ],
      [
        newOwnedCreature(
          { uid: "boxed", lineId: other.id, age: "A", level: 15, caughtYear: 1, boxed: true },
          other,
          balance,
        ),
      ],
    );

    const rng = stream(uniforms);
    let decisionIdx = 0;
    const decide = (prompt: { parentUid: string }, save: SaveFile): RetirementChoice | null => {
      const wantBoon = preferBoon[decisionIdx % preferBoon.length] === true;
      decisionIdx += 1;
      if (!wantBoon) return null; // null = take the rolled HEIR
      const target = [...save.party, ...save.box][0];
      if (!target) return null;
      return { kind: "boon", parentUid: prompt.parentUid, targetUid: target.uid, stat: "atk" };
    };

    // The tape lives in the save, numbered by `appendYearTurn` and CHECKED by it. Renumbering the
    // entries on the way into a side list (what this used to do) repairs the producer's output
    // before asserting on it, which is how `seq: 0` on every entry stayed invisible.
    let save: SaveEnvelope = initial;
    for (let i = 0; i < years; i += 1) {
      const tickBefore = save.tick;
      save = appendYearTurn(advanceYear(save, { species, balance, nodes, rng, decide }), tickBefore);
    }
    return { initial, live: save, log: save.actionLog, uniforms };
  }

  it("replays any (stream, decision script) timeline to the identical save, twice", () => {
    fc.assert(
      fc.property(arbUniforms, arbDecisions, fc.integer({ min: 1, max: 7 }), (u, d, years) => {
        const { initial, live, log } = timeline(u, d, years);
        const a = replay(initial, log, { gyms: content.gyms, species, balance, nodes, rng: stream(u) });
        const b = replay(initial, log, { gyms: content.gyms, species, balance, nodes, rng: stream(u) });
        expect(serialize(a)).toBe(serialize(b));
        expect(serialize(a)).toBe(serialize(live));
      }),
      { numRuns: 150 },
    );
  });

  it("reproduces the same timeline from the same stream — live play is deterministic", () => {
    fc.assert(
      fc.property(arbUniforms, arbDecisions, fc.integer({ min: 1, max: 7 }), (u, d, years) => {
        const a = timeline(u, d, years);
        const b = timeline(u, d, years);
        expect(serialize(a.live)).toBe(serialize(b.live));
        expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
      }),
      { numRuns: 150 },
    );
  });

  it("is not vacuous: some pair of streams reaches different saves", () => {
    // Determinism tests pass trivially if nothing depends on the stream. This asserts the opposite
    // side of the property — the heir roll really is reading it.
    const years = balance.clock.yearsTotal - 1;
    const seen = new Set<string>();
    for (const u of [[0.01], [0.99], [0.5, 0.1], [0.2, 0.85, 0.33], [0.75, 0.05]]) {
      seen.add(serialize(timeline(u, [false], years).live));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("the year turn completes whatever the caller answers", () => {
  const arbChoiceShape = fc.constantFrom<"heir" | "boonSelf" | "boonGhost" | "boonFirst" | "null">(
    "heir",
    "boonSelf",
    "boonGhost",
    "boonFirst",
    "null",
  );

  it("never throws, and never loses the year, for any decision script", () => {
    /*
     * A retirement answered with an impossible BOON used to throw out of `advanceYear`, discarding
     * the whole turn — the season step, the scripted raid and the map swap along with the bad
     * answer — after the seeded stream had already advanced. The law is that the turn completes.
     */
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbLineId, arbAge), { minLength: 1, maxLength: 6 }),
        fc.array(arbChoiceShape, { minLength: 1, maxLength: 8 }),
        arbUniforms,
        fc.integer({ min: 1, max: 5 }),
        (partySpec, shapes, uniforms, years) => {
          const party = partySpec.map(([lineId, age], i) =>
            newOwnedCreature(
              {
                uid: `p${i}`,
                lineId,
                age,
                level: 20,
                caughtYear: 1,
                traits: traitsFrom([traitPool[i % traitPool.length]?.id ?? ""]),
              },
              species.find((s) => s.id === lineId) as SpeciesLine,
              balance,
            ),
          );
          let save: SaveFile = base(party);
          const rng = stream(uniforms);
          let k = 0;
          const decide = (prompt: { parentUid: string }, s: SaveFile): RetirementChoice | null => {
            const shape = shapes[k % shapes.length];
            k += 1;
            switch (shape) {
              case "heir":
                return {
                  kind: "heir",
                  parentUid: prompt.parentUid,
                  inheritedTraitIds: ["stoneblood"], // deliberately not the parent's
                  heirUid: `${prompt.parentUid}-cheat`,
                };
              case "boonSelf":
                return { kind: "boon", parentUid: prompt.parentUid, targetUid: prompt.parentUid, stat: "atk" };
              case "boonGhost":
                return { kind: "boon", parentUid: prompt.parentUid, targetUid: "nobody", stat: "atk" };
              case "boonFirst": {
                const target = [...s.party, ...s.box][0];
                return target
                  ? { kind: "boon", parentUid: prompt.parentUid, targetUid: target.uid, stat: "atk" }
                  : null;
              }
              default:
                return null;
            }
          };

          for (let y = 0; y < years; y += 1) {
            const before = save.year;
            const result = advanceYear(save, { species, balance, nodes, rng, decide });
            expect(result.save.year).toBe(before + 1);
            // Every prompt was answered with something applicable.
            expect(result.choices).toHaveLength(result.prompts.length);
            // A rejected decision is reported, never swallowed.
            for (const r of result.rejected) {
              expect(r.applied.kind).toBe("heir");
              expect(r.reason.length).toBeGreaterThan(0);
            }
            expect(
              result.events.filter((e) => e.t === "choiceRejected").length,
            ).toBe(result.rejected.length);
            expect(result.partyEmpty).toBe(result.save.party.length === 0);
            save = result.save;
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it("keeps every creature's boon stack inside the balance cap", () => {
    fc.assert(
      fc.property(
        fc.array(arbLineId, { minLength: 2, maxLength: 6 }),
        fc.constantFrom<StatKey>(...STAT_KEYS),
        arbUniforms,
        (lineIds, stat, uniforms) => {
          const elders = lineIds.map((lineId, i) =>
            newOwnedCreature(
              { uid: `e${i}`, lineId, age: "E", level: 20, caughtYear: 1 },
              species.find((s) => s.id === lineId) as SpeciesLine,
              balance,
            ),
          );
          const keeper = newOwnedCreature(
            { uid: "keeper", lineId: lineIds[0] as string, age: "J", level: 5, caughtYear: 1, boxed: true },
            species.find((s) => s.id === lineIds[0]) as SpeciesLine,
            balance,
          );
          const result = advanceYear(base(elders, [keeper]), {
            species,
            balance,
            nodes,
            rng: stream(uniforms),
            decide: (prompt) => ({ kind: "boon", parentUid: prompt.parentUid, targetUid: "keeper", stat }),
          });
          const cap = boonMaxStacksPerStat(balance);
          for (const c of [...result.save.party, ...result.save.box]) {
            const n = c.boons.filter((b) => b.stat === stat).length;
            expect(n).toBeLessThanOrEqual(cap);
            expect(boonMultiplier(c, stat, balance)).toBeLessThanOrEqual(
              1 + cap * balance.stats.boonModPct + 1e-9,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("puts every heir in the cohort its parent retired from", () => {
    fc.assert(
      fc.property(
        fc.array(arbLineId, { minLength: 1, maxLength: 3 }),
        fc.array(arbLineId, { minLength: 1, maxLength: 3 }),
        arbUniforms,
        (partyLines, boxLines, uniforms) => {
          const mk = (lineId: string, uid: string, boxed: boolean) =>
            newOwnedCreature(
              { uid, lineId, age: "E", level: 20, caughtYear: 1, boxed },
              species.find((s) => s.id === lineId) as SpeciesLine,
              balance,
            );
          const save = base(
            partyLines.map((l, i) => mk(l, `p${i}`, false)),
            boxLines.map((l, i) => mk(l, `b${i}`, true)),
          );
          const result = advanceYear(save, { species, balance, nodes, rng: stream(uniforms) });
          for (const ev of result.events) {
            if (ev.t !== "heirBorn") continue;
            // Party and box both have room here (each just lost its retiree), so the parent's
            // cohort decides — no fallback can be masking a wrong answer.
            expect(ev.where).toBe(ev.parentUid.startsWith("b") ? "box" : "party");
          }
          expect(result.save.party).toHaveLength(partyLines.length);
          expect(result.save.box).toHaveLength(boxLines.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("refuses to run a second time for the same year", () => {
    fc.assert(
      fc.property(arbLineId, arbAge, fc.integer({ min: 1, max: 4 }), (lineId, age, turns) => {
        const l = species.find((s) => s.id === lineId) as SpeciesLine;
        let save: SaveFile = base([
          newOwnedCreature({ uid: "u", lineId, age, level: 12, caughtYear: 1 }, l, balance),
        ]);
        for (let i = 0; i < turns; i += 1) {
          const next = runYearTurn(save, deps).save;
          // The same pre-turn save fired a second time (build-doc §4's dual trigger).
          const stale = { ...next, year: save.year, tick: save.tick };
          expect(() => runYearTurn(stale, deps)).toThrow(LifecycleError);
          save = next;
        }
      }),
      { numRuns: 100 },
    );
  });
});
