/**
 * tests/unit/lifecycle.test.ts — build-doc §7.5 (aging, the year turn, retirement, heirs),
 * Hard Requirement 4 and guardrail G10.
 *
 * Everything here runs against the SHIPPED content (core/schemas.ts `validateContent()`), not
 * against fixtures invented to make the code look right: the aging tables, the metamorphic lines
 * and the Cullbrand raid are all read out of data/.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateContent, zOwnedCreature, zSaveFile } from "../../core/schemas";
import type {
  AgeClass,
  Balance,
  NodeFile,
  OwnedCreature,
  SaveFile,
  Season,
  SpeciesLine,
  StatKey,
  Trait,
} from "../../core/types";
import { AGE_CLASSES, STAT_KEYS } from "../../core/types";
import { effectiveStats } from "../../core/battle";
import {
  advanceYear,
  ageFormMultiplier,
  boonMaxStacksPerStat,
  boonMultiplier,
  boonTargetUids,
  canRunYearTurn,
  enterPendingActs,
  heirLevelMin,
  indexSpecies,
  isNever,
  LifecycleError,
  mapAssetForYear,
  metamorphicStatMultiplier,
  newOwnedCreature,
  projectedRetirementYear,
  projectedRetirementYearOf,
  resolveRetirement,
  retirementPromptFor,
  retiresBeyondFinalYear,
  rollHeirChoice,
  runYearTurn,
  yearEventsOf,
  YEAR_TURN_FLAG,
  type RaidScript,
  type RandomFn,
  type YearRetirementPrompt,
  type YearTurnEvent,
} from "../../core/lifecycle";
import { newSave, type SaveEnvelope } from "../../core/save";
import { actGates, actOf, awardBadge } from "../../core/acts";

const content = validateContent();
const balance: Balance = content.balance;
const species: SpeciesLine[] = content.species;
const nodes: NodeFile[] = content.nodes;
const index = indexSpecies(species);

function line(id: string): SpeciesLine {
  const found = species.find((s) => s.id === id);
  if (!found) throw new Error(`test fixture error: no species line "${id}" in data/species.json`);
  return found;
}

/**
 * A deterministic stand-in for core/rng.ts's seeded stream: it replays a fixed list of values.
 * No ambient randomness (G11), and no second PRNG implementation to drift from the real one — the code
 * under test only ever asks for "the next uniform in [0,1)".
 */
function stream(values: readonly number[]): RandomFn {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v ?? 0;
  };
}

function trait(id: string, stat: Trait["stat"]): Trait {
  const found = balance.traits.pool.find((t) => t.id === id);
  if (!found) throw new Error(`test fixture error: no trait "${id}" in balance.traits.pool`);
  expect(found.stat).toBe(stat);
  return found;
}

function baseSave(party: OwnedCreature[], box: OwnedCreature[] = []): SaveEnvelope {
  const save = newSave(
    { seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes },
    balance,
  );
  return { ...save, party, box };
}

function deps(extra: Partial<Parameters<typeof runYearTurn>[1]> = {}) {
  return { species, balance, nodes, ...extra };
}

const gyms = content.gyms;

/**
 * A save standing in `act`, reached the only way the game reaches one: badges and quest flags.
 *
 * Deliberately builds the state through `core/acts.ts` rather than writing `ACT_ENTERED_FLAG`
 * directly, so a test that says "at act 4" is asserting against the ladder the shipped balance.json
 * actually defines (D-Q3-1). The CALENDAR is untouched — every save it returns is standing in the
 * start year, which is the whole point: the act is not a date.
 */
function saveAtAct(act: number, party: OwnedCreature[] = []): SaveEnvelope {
  let save = baseSave(party);
  for (const gate of actGates(balance)) {
    if (gate.act > act) break;
    for (const flag of gate.flags) {
      save = { ...save, questFlags: { ...save.questFlags, [flag]: true } };
    }
    const ordered = [...gyms].sort((a, b) => a.act - b.act);
    for (const gym of ordered) {
      if (gym.act >= gate.act) break;
      save = { ...save, ...awardBadge(save, gym.id, balance) };
    }
  }
  return save;
}

describe("balance schedule consistency (the table the aging rule is derived from)", () => {
  it("lifespanYears and yearsInClass describe one consistent J->A->E schedule", () => {
    // A creature always ENTERS a class at the start of it, so the lifespan left at the start of the
    // NEXT class must be this class's lifespan minus the years spent in this one. If this ever
    // fails, `ageOneYear`'s derived advancement is reading a table that no longer means what it did.
    const { lifespanYears, yearsInClass } = balance.age;
    expect(lifespanYears.A).toBe(lifespanYears.J - yearsInClass.J);
    expect(lifespanYears.E).toBe(lifespanYears.A - yearsInClass.A);
    expect(yearsInClass.E).toBe(lifespanYears.E);
  });
});

describe("projectedRetirementYear (bible §12 — shown on the creature card)", () => {
  const cases: Array<[AgeClass, number]> = [
    ["J", balance.age.lifespanYears.J],
    ["A", balance.age.lifespanYears.A],
    ["E", balance.age.lifespanYears.E],
  ];

  it.each(cases)("a %s caught in year 1 projects retirement at 1 + lifespan (%i)", (age, span) => {
    const nibbin = line("nibbin-line");
    const c = newOwnedCreature(
      { uid: `u-${age}`, lineId: nibbin.id, age, level: 10, caughtYear: 1 },
      nibbin,
      balance,
    );
    expect(c.yearsRemaining).toBe(span);
    expect(c.projectedRetirementYear).toBe(1 + span);
    // Computable at ANY moment, not only during a year turn.
    expect(projectedRetirementYear(c, 1, nibbin)).toBe(1 + span);
    expect(projectedRetirementYearOf(c, 1, index)).toBe(1 + span);
  });

  it("is computable mid-year and stays put across the year turn that decrements it", () => {
    const nibbin = line("nibbin-line");
    const c = newOwnedCreature(
      { uid: "u1", lineId: nibbin.id, age: "J", level: 10, caughtYear: 1 },
      nibbin,
      balance,
    );
    let save: SaveFile = baseSave([c]);
    const projected = c.projectedRetirementYear;
    for (let i = 0; i < balance.age.lifespanYears.J - 1; i += 1) {
      save = runYearTurn(save, deps()).save;
      const alive = save.party[0];
      expect(alive).toBeDefined();
      expect(alive?.projectedRetirementYear).toBe(projected);
      expect(projectedRetirementYearOf(alive as OwnedCreature, save.year, index)).toBe(projected);
    }
  });
});

describe("build-doc §7.5 step 1 — aging, table-driven across all three catch ages", () => {
  const cases: Array<[AgeClass, AgeClass[]]> = [
    ["J", ["A", "E"]],
    ["A", ["E"]],
    ["E", []],
  ];

  it.each(cases)("a %s caught in year 1 retires exactly in its projected year", (catchAge) => {
    const nibbin = line("nibbin-line");
    const c = newOwnedCreature(
      { uid: "u1", lineId: nibbin.id, age: catchAge, level: 12, caughtYear: 1 },
      nibbin,
      balance,
    );
    const projected = c.projectedRetirementYear;

    let save: SaveFile = baseSave([c]);
    let retiredInYear = -1;
    for (let i = 0; i < balance.clock.yearsTotal + 2; i += 1) {
      const turn = runYearTurn(save, deps());
      save = turn.save;
      if (turn.prompts.length > 0) {
        expect(turn.prompts).toHaveLength(1);
        expect(turn.prompts[0]?.parentUid).toBe("u1");
        retiredInYear = save.year;
        break;
      }
    }
    expect(retiredInYear).toBe(projected);
    expect(save.party).toHaveLength(0);
  });

  it.each(cases)("a %s advances J->A->E on schedule, one class per year turn", (catchAge, path) => {
    const nibbin = line("nibbin-line");
    let save: SaveFile = baseSave([
      newOwnedCreature(
        { uid: "u1", lineId: nibbin.id, age: catchAge, level: 12, caughtYear: 1 },
        nibbin,
        balance,
      ),
    ]);
    const seen: AgeClass[] = [];
    for (const _ of path) {
      save = runYearTurn(save, deps()).save;
      const alive = save.party[0];
      expect(alive).toBeDefined();
      seen.push((alive as OwnedCreature).age);
    }
    expect(seen).toEqual(path);
  });
});

describe("G10 — boxed creatures age at year turns, identically to party creatures", () => {
  it("ages a boxed creature exactly as it ages the same creature in the party", () => {
    const nibbin = line("nibbin-line");
    const mk = (uid: string, boxed: boolean): OwnedCreature =>
      newOwnedCreature(
        {
          uid,
          lineId: nibbin.id,
          age: "J",
          level: 14,
          caughtYear: 1,
          traits: [trait("thick-pelt", "def")],
          boxed,
        },
        nibbin,
        balance,
      );

    let save: SaveFile = baseSave([mk("in-party", false)], [mk("in-box", true)]);

    for (let i = 0; i < balance.age.lifespanYears.J - 1; i += 1) {
      save = runYearTurn(save, deps()).save;
      const p = save.party[0];
      const b = save.box[0];
      expect(p).toBeDefined();
      expect(b).toBeDefined();
      // Every aging-relevant field must match. The uid/boxed flags are the only differences.
      expect({ ...(b as OwnedCreature), uid: "x", boxed: undefined }).toEqual({
        ...(p as OwnedCreature),
        uid: "x",
        boxed: undefined,
      });
    }
  });

  it("retires a boxed creature in the same year it would have retired in the party", () => {
    const nibbin = line("nibbin-line");
    let save: SaveFile = baseSave(
      [
        newOwnedCreature(
          { uid: "party-elder", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1 },
          nibbin,
          balance,
        ),
      ],
      [
        newOwnedCreature(
          { uid: "box-elder", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1, boxed: true },
          nibbin,
          balance,
        ),
      ],
    );
    const turn = runYearTurn(save, deps());
    save = turn.save;
    expect(turn.prompts.map((p) => p.parentUid).sort()).toEqual(["box-elder", "party-elder"]);
    expect(save.party).toHaveLength(0);
    expect(save.box).toHaveLength(0);
    // The `aged` events must name BOTH cohorts — a run that only ages the party would still empty
    // the party, so the cohort tags are what actually prove the box was walked.
    const cohorts = turn.events.filter((e) => e.t === "aged").map((e) => e.where);
    expect(cohorts.sort()).toEqual(["box", "party"]);
  });

  it("ages a box holding more creatures than the party, every one of them", () => {
    const nibbin = line("nibbin-line");
    const box = Array.from({ length: 12 }, (_, i) =>
      newOwnedCreature(
        { uid: `box-${i}`, lineId: nibbin.id, age: "J", level: 5, caughtYear: 1, boxed: true },
        nibbin,
        balance,
      ),
    );
    const turn = runYearTurn(baseSave([], box), deps());
    expect(turn.save.box).toHaveLength(12);
    for (const c of turn.save.box) {
      expect(c.age).toBe("A");
      expect(c.yearsRemaining).toBe(balance.age.lifespanYears.A);
    }
  });
});

describe("G10 / Hard Req 4 — caught Ancients never age, in party or box", () => {
  const ancientIds = species.filter((s) => s.ancient).map((s) => s.id);

  it("has the three Ancients the bible declares", () => {
    expect(ancientIds).toHaveLength(3);
  });

  it.each(ancientIds)("%s does not age across six year turns, in party AND box", (lineId) => {
    const anc = line(lineId);
    const mkA = newOwnedCreature(
      { uid: "anc-party", lineId, age: "E", level: 40, caughtYear: 1 },
      anc,
      balance,
    );
    const mkB = newOwnedCreature(
      { uid: "anc-box", lineId, age: "E", level: 40, caughtYear: 1, boxed: true },
      anc,
      balance,
    );
    expect(isNever(mkA.yearsRemaining)).toBe(true);
    expect(isNever(mkA.projectedRetirementYear)).toBe(true);

    let save: SaveFile = baseSave([mkA], [mkB]);
    for (let i = 0; i < balance.clock.yearsTotal; i += 1) {
      const turn = runYearTurn(save, deps());
      save = turn.save;
      expect(turn.prompts).toHaveLength(0);
      const skipped = turn.events.filter((e) => e.t === "ancientSkipped").map((e) => e.where);
      expect(skipped.sort()).toEqual(["box", "party"]);
      expect(turn.events.some((e) => e.t === "aged")).toBe(false);
    }
    const p = save.party[0];
    const b = save.box[0];
    expect(p).toEqual(mkA);
    expect(b).toEqual(mkB);
    expect(projectedRetirementYearOf(p as OwnedCreature, save.year, index)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("forces a caught Ancient to Elder regardless of the age it was caught at", () => {
    const anc = line("vellsire-line");
    for (const age of ["J", "A", "E"] as AgeClass[]) {
      const c = newOwnedCreature(
        { uid: `v-${age}`, lineId: anc.id, age, level: 40, caughtYear: 6 },
        anc,
        balance,
      );
      expect(c.age).toBe("E");
    }
  });
});

describe("build-doc §7.5 step 2 — metamorphic transitions", () => {
  const metamorphicIds = species.filter((s) => s.metamorphic).map((s) => s.id);

  it("has the five metamorphic lines the bible declares", () => {
    expect(metamorphicIds).toHaveLength(5);
  });

  it("mirefin-line changes name, types and role at J->A and jumps stats exactly once", () => {
    const mirefin = line("mirefin-line");
    let save: SaveFile = baseSave([
      newOwnedCreature(
        { uid: "m1", lineId: mirefin.id, age: "J", level: 10, caughtYear: 1 },
        mirefin,
        balance,
      ),
    ]);

    const turn1 = runYearTurn(save, deps());
    save = turn1.save;
    const morphs = turn1.events.filter((e) => e.t === "metamorphosed");
    expect(morphs).toHaveLength(1);
    const morph = morphs[0] as Extract<YearTurnEvent, { t: "metamorphosed" }>;
    expect(morph.fromFormName).toBe("Bogling");
    expect(morph.toFormName).toBe("Mirefin");
    expect(morph.types).toEqual(["Water", "Poison"]);
    expect(morph.role).toBe("Mesopredator");
    expect(morph.statJump).toBe(balance.age.metamorphicJump);

    const adult = save.party[0] as OwnedCreature;
    expect(adult.age).toBe("A");
    expect(adult.metamorphosed).toBe(true);
    expect(metamorphicStatMultiplier(adult, mirefin, balance)).toBe(balance.age.metamorphicJump);
    // build-doc §7.4: base × ageMult, plus the metamorphic ×1.15 once.
    expect(ageFormMultiplier(adult, mirefin, balance)).toBeCloseTo(
      balance.age.multiplier.A * balance.age.metamorphicJump,
      10,
    );

    // A->E must NOT re-apply the jump.
    const turn2 = runYearTurn(save, deps());
    save = turn2.save;
    expect(turn2.events.filter((e) => e.t === "metamorphosed")).toHaveLength(0);
    const elder = save.party[0] as OwnedCreature;
    expect(elder.age).toBe("E");
    expect(elder.metamorphosed).toBe(true);
    expect(metamorphicStatMultiplier(elder, mirefin, balance)).toBe(balance.age.metamorphicJump);
    expect(metamorphicStatMultiplier(elder, mirefin, balance)).not.toBeCloseTo(
      balance.age.metamorphicJump ** 2,
      6,
    );
    expect(ageFormMultiplier(elder, mirefin, balance)).toBeCloseTo(
      balance.age.multiplier.E * balance.age.metamorphicJump,
      10,
    );
  });

  /*
   * bible §4: "Wild adults of a line only appear in evolved form." A metamorphic Adult or Elder is
   * therefore ALWAYS evolved, however it was acquired — the year turn's latch is one way to get
   * there, being caught that way (or being a gym roster slot: data/gyms.json fields Mirefin (A) and
   * Gloomoth (A)) is another. This block exists because the whole previous suite built metamorphic
   * creatures at age "J" only, which let core/lifecycle.ts and core/battle.ts disagree by 15% on
   * every wild-caught adult without a single test noticing.
   */
  describe("a wild-caught Adult/Elder of a metamorphic line is already evolved (bible §4)", () => {
    const wildAges: AgeClass[] = ["A", "E"];

    it.each(metamorphicIds.flatMap((id) => wildAges.map((a) => [id, a] as const)))(
      "%s caught at %s carries the latch and the ×1.15",
      (lineId, age) => {
        const l = line(lineId);
        const wild = newOwnedCreature(
          { uid: "wild", lineId, age, level: 20, caughtYear: 1 },
          l,
          balance,
        );
        expect(wild.age).toBe(age);
        expect(wild.metamorphosed).toBe(true);
        expect(metamorphicStatMultiplier(wild, l, balance)).toBe(balance.age.metamorphicJump);
        expect(ageFormMultiplier(wild, l, balance)).toBeCloseTo(
          balance.age.multiplier[age] * balance.age.metamorphicJump,
          10,
        );
      },
    );

    it.each(metamorphicIds.flatMap((id) => wildAges.map((a) => [id, a] as const)))(
      "%s at %s with NO stored latch is still evolved",
      (lineId, age) => {
        /*
         * The latch is an optional field, and plenty of legitimate creatures arrive without it: a
         * gym roster slot (data/gyms.json fields Mirefin (A) and Gloomoth (A); `GymTeamSlot` has no
         * such field), and any save written before the latch was stamped at catch. Reading ONLY the
         * latch answers 1 for all of them — 15% under an identical raised creature. The age has to
         * be able to answer on its own.
         */
        const l = line(lineId);
        const noLatch: OwnedCreature = {
          ...newOwnedCreature({ uid: "gym", lineId, age, level: 20, caughtYear: 1 }, l, balance),
        };
        delete noLatch.metamorphosed;
        expect(noLatch.metamorphosed).toBeUndefined();
        expect(metamorphicStatMultiplier(noLatch, l, balance)).toBe(balance.age.metamorphicJump);
        expect(ageFormMultiplier(noLatch, l, balance)).toBeCloseTo(
          balance.age.multiplier[age] * balance.age.metamorphicJump,
          10,
        );
        // core/battle.ts, which owns the rule, says the same about the same object.
        expect(
          effectiveStats({ line: l, age, level: 20, balance }),
        ).toEqual(
          effectiveStats({
            line: l,
            age,
            level: 20,
            balance,
            metamorphosed: metamorphicStatMultiplier(noLatch, l, balance) > 1,
          }),
        );
      },
    );

    it.each(metamorphicIds)(
      "%s: a raised adult and a wild-caught adult of the same level are worth the same",
      (lineId) => {
        const l = line(lineId);
        // Raised: caught J in year 1, aged once.
        let save: SaveFile = baseSave([
          newOwnedCreature({ uid: "raised", lineId, age: "J", level: 20, caughtYear: 1 }, l, balance),
        ]);
        save = runYearTurn(save, deps()).save;
        const raised = save.party[0] as OwnedCreature;
        expect(raised.age).toBe("A");

        const wild = newOwnedCreature(
          { uid: "wild", lineId, age: "A", level: raised.level, caughtYear: 1 },
          l,
          balance,
        );
        expect(ageFormMultiplier(wild, l, balance)).toBe(ageFormMultiplier(raised, l, balance));

        // …and core/battle.ts, which owns the rule, agrees with both.
        const statsRaised = effectiveStats({ line: l, age: "A", level: raised.level, balance, metamorphosed: raised.metamorphosed });
        const statsWild = effectiveStats({ line: l, age: "A", level: raised.level, balance, metamorphosed: wild.metamorphosed });
        expect(statsWild).toEqual(statsRaised);
      },
    );

    it("agrees with core/battle.ts effectiveStats for every line, age and acquisition route", () => {
      // The two modules used to each compute the metamorphic jump their own way. This is the
      // cross-module law: lifecycle's exported form multiplier is exactly the factor battle applies.
      for (const l of species) {
        for (const age of AGE_CLASSES) {
          for (const explicit of [undefined, true] as const) {
            const c = newOwnedCreature(
              {
                uid: "c",
                lineId: l.id,
                age,
                level: 15,
                caughtYear: 1,
                ...(explicit === undefined ? {} : { metamorphosed: explicit }),
              },
              l,
              balance,
            );
            // What battle computes for this creature as stored…
            const asStored = effectiveStats({
              line: l,
              age: c.age,
              level: c.level,
              balance,
              ...(c.metamorphosed === undefined ? {} : { metamorphosed: c.metamorphosed }),
            });
            // …and what it computes when told, in so many words, what LIFECYCLE thinks the jump is.
            const asLifecycleSays = effectiveStats({
              line: l,
              age: c.age,
              level: c.level,
              balance,
              metamorphosed: metamorphicStatMultiplier(c, l, balance) > 1,
            });
            expect(asLifecycleSays).toEqual(asStored);
          }
        }
      }
    });
  });

  it.each(metamorphicIds)("%s fires its transition exactly once across a full life", (lineId) => {
    const l = line(lineId);
    let save: SaveFile = baseSave([
      newOwnedCreature({ uid: "x", lineId, age: "J", level: 8, caughtYear: 1 }, l, balance),
    ]);
    let morphCount = 0;
    for (let i = 0; i < balance.age.lifespanYears.J; i += 1) {
      const turn = runYearTurn(save, deps());
      save = turn.save;
      morphCount += turn.events.filter((e) => e.t === "metamorphosed").length;
    }
    expect(morphCount).toBe(1);
  });

  it("never sets the metamorphic latch on a non-metamorphic line", () => {
    const nibbin = line("nibbin-line");
    expect(nibbin.metamorphic).toBe(false);
    let save: SaveFile = baseSave([
      newOwnedCreature(
        { uid: "n", lineId: nibbin.id, age: "J", level: 8, caughtYear: 1 },
        nibbin,
        balance,
      ),
    ]);
    for (let i = 0; i < balance.age.lifespanYears.J - 1; i += 1) {
      const turn = runYearTurn(save, deps());
      save = turn.save;
      expect(turn.events.filter((e) => e.t === "metamorphosed")).toHaveLength(0);
    }
    const c = save.party[0] as OwnedCreature;
    expect(c.metamorphosed).toBeUndefined();
    expect(metamorphicStatMultiplier(c, nibbin, balance)).toBe(1);
    // …at every age, and however it was acquired: a non-metamorphic line never jumps.
    for (const age of AGE_CLASSES) {
      const wild = newOwnedCreature(
        { uid: `n-${age}`, lineId: nibbin.id, age, level: 12, caughtYear: 1 },
        nibbin,
        balance,
      );
      expect(wild.metamorphosed).toBeUndefined();
      expect(metamorphicStatMultiplier(wild, nibbin, balance)).toBe(1);
      expect(ageFormMultiplier(wild, nibbin, balance)).toBe(balance.age.multiplier[age]);
    }
  });

  it("announces EVERY identity change, not just the metamorphosis (bible §4 starters)", () => {
    // data/species.json cindril-line: {J:"Cindril", A:"Vulkindle", E:"Pyrevane"} — three names, so
    // TWO identity changes across a life. build-doc §4 makes the scene "a renderer of its event
    // log", so a change with no event is a change the demo cannot show.
    const cindril = line("cindril-line");
    expect(new Set(Object.values(cindril.formNames)).size).toBe(3);

    let save: SaveFile = baseSave([
      newOwnedCreature(
        { uid: "s", lineId: cindril.id, age: "J", level: 5, caughtYear: 1 },
        cindril,
        balance,
      ),
    ]);
    const changes: Array<[string, string]> = [];
    for (let i = 0; i < balance.age.lifespanYears.J - 1; i += 1) {
      const turn = runYearTurn(save, deps());
      save = turn.save;
      for (const ev of turn.events) {
        if (ev.t !== "formChanged") continue;
        changes.push([ev.fromFormName, ev.toFormName]);
        expect(ev.uid).toBe("s");
        expect(ev.where).toBe("party");
        expect(ev.types).toEqual(cindril.types[ev.toAge]);
        expect(ev.role).toBe(cindril.role[ev.toAge]);
      }
    }
    expect(changes).toEqual([
      ["Cindril", "Vulkindle"],
      ["Vulkindle", "Pyrevane"],
    ]);
  });

  it("stays quiet for a line that keeps one identity all its life", () => {
    const nibbin = line("nibbin-line");
    expect(new Set(Object.values(nibbin.formNames)).size).toBe(1);
    let save: SaveFile = baseSave([
      newOwnedCreature(
        { uid: "n", lineId: nibbin.id, age: "J", level: 5, caughtYear: 1 },
        nibbin,
        balance,
      ),
    ]);
    for (let i = 0; i < balance.age.lifespanYears.J - 1; i += 1) {
      const turn = runYearTurn(save, deps());
      save = turn.save;
      expect(turn.events.filter((e) => e.t === "formChanged")).toHaveLength(0);
    }
  });
});

describe("build-doc §7.5 step 3 — retirement: HEIR", () => {
  const nibbin = line("nibbin-line");
  const parentTraits = [trait("thick-pelt", "def"), trait("keen-eye", "ins")];

  function retireOne(level: number, traits: Trait[], relicSlot?: string) {
    const parent = newOwnedCreature(
      {
        uid: "parent",
        lineId: nibbin.id,
        age: "E",
        level,
        caughtYear: 1,
        traits,
        ...(relicSlot === undefined ? {} : { relicSlot }),
      },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave([parent]), deps());
    const prompt = turn.prompts[0];
    expect(prompt).toBeDefined();
    return { turn, prompt: prompt as YearRetirementPrompt };
  }

  it("gives the heir level floor(parentLevel × heirLevelFactor)", () => {
    for (const level of [40, 21, 7, 3, 1]) {
      const { turn, prompt } = retireOne(level, parentTraits);
      const choice = rollHeirChoice(prompt, stream([0.0]), balance, turn.save.year);
      const result = resolveRetirement(turn.save, prompt, choice, { species, balance });
      const heir = result.heir as OwnedCreature;
      const expected = Math.max(1, Math.floor(level * balance.retirement.heirLevelFactor));
      expect(heir.level).toBe(expected);
      expect(heir.level).toBeGreaterThanOrEqual(1);
      expect(heir.level).toBeLessThanOrEqual(balance.xp.levelCap);
    }
  });

  it("makes the heir a Juvenile of the same line with a fresh lifespan", () => {
    const { turn, prompt } = retireOne(20, parentTraits);
    const choice = rollHeirChoice(prompt, stream([0.5, 0.25, 0.75]), balance, turn.save.year);
    const result = resolveRetirement(turn.save, prompt, choice, { species, balance });
    const heir = result.heir as OwnedCreature;
    expect(heir.lineId).toBe(nibbin.id);
    expect(heir.age).toBe("J");
    expect(heir.caughtYear).toBe(turn.save.year);
    expect(heir.yearsRemaining).toBe(balance.age.lifespanYears.J);
    expect(heir.projectedRetirementYear).toBe(turn.save.year + balance.age.lifespanYears.J);
    expect(result.save.party.map((c) => c.uid)).toContain(heir.uid);
  });

  it("inherits 1-2 of the PARENT's traits and never invents one", () => {
    const parentIds = parentTraits.map((t) => t.id);
    // Sweep the roll so both the count draw and the shuffle take every branch.
    for (let a = 0; a < 10; a += 1) {
      for (let b = 0; b < 10; b += 1) {
        const { turn, prompt } = retireOne(20, parentTraits);
        const choice = rollHeirChoice(prompt, stream([a / 10, b / 10]), balance, turn.save.year);
        expect(choice.kind).toBe("heir");
        if (choice.kind !== "heir") continue;
        expect(choice.inheritedTraitIds.length).toBeGreaterThanOrEqual(
          balance.retirement.heirInheritedTraitsMin,
        );
        expect(choice.inheritedTraitIds.length).toBeLessThanOrEqual(
          Math.min(balance.retirement.heirInheritedTraitsMax, balance.traits.maxSlots),
        );
        const result = resolveRetirement(turn.save, prompt, choice, { species, balance });
        const heir = result.heir as OwnedCreature;
        expect(new Set(heir.traits.map((t) => t.id)).size).toBe(heir.traits.length);
        for (const t of heir.traits) expect(parentIds).toContain(t.id);
      }
    }
  });

  it("refuses a choice naming a trait the parent never had", () => {
    const { turn, prompt } = retireOne(20, parentTraits);
    expect(() =>
      resolveRetirement(
        turn.save,
        prompt,
        { kind: "heir", parentUid: "parent", inheritedTraitIds: ["stoneblood"], heirUid: "h" },
        { species, balance },
      ),
    ).toThrow(LifecycleError);
  });

  it("unlocks the parent's relic slot on the heir", () => {
    const withRelic = retireOne(20, parentTraits, "relic-antler-charm");
    const c1 = rollHeirChoice(withRelic.prompt, stream([0.4]), balance, withRelic.turn.save.year);
    const r1 = resolveRetirement(withRelic.turn.save, withRelic.prompt, c1, { species, balance });
    expect((r1.heir as OwnedCreature).relicSlot).toBe("relic-antler-charm");

    // bible §11: relics come FROM retirement, so an heir always ends up with a slot to fill.
    const noRelic = retireOne(20, parentTraits);
    const c2 = rollHeirChoice(noRelic.prompt, stream([0.4]), balance, noRelic.turn.save.year);
    const r2 = resolveRetirement(noRelic.turn.save, noRelic.prompt, c2, { species, balance });
    expect((r2.heir as OwnedCreature).relicSlot).toBeTruthy();
  });

  it("puts the heir in the box when the party is full", () => {
    const filler = Array.from({ length: balance.party.maxPartySize }, (_, i) =>
      newOwnedCreature(
        { uid: `f${i}`, lineId: nibbin.id, age: "J", level: 5, caughtYear: 1 },
        nibbin,
        balance,
      ),
    );
    const parent = newOwnedCreature(
      { uid: "parent", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1, traits: parentTraits },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave([...filler, parent]), deps());
    expect(turn.save.party).toHaveLength(balance.party.maxPartySize);
    const prompt = turn.prompts[0] as YearRetirementPrompt;
    const choice = rollHeirChoice(prompt, stream([0.2]), balance, turn.save.year);
    const result = resolveRetirement(turn.save, prompt, choice, { species, balance });
    expect(result.save.box.map((c) => c.uid)).toContain((result.heir as OwnedCreature).uid);
    expect((result.heir as OwnedCreature).boxed).toBe(true);
  });
});

describe("build-doc §7.5 step 3 — retirement: BOON", () => {
  const nibbin = line("nibbin-line");

  function setup() {
    const parent = newOwnedCreature(
      { uid: "parent", lineId: nibbin.id, age: "E", level: 24, caughtYear: 1 },
      nibbin,
      balance,
    );
    const mate = newOwnedCreature(
      { uid: "mate", lineId: nibbin.id, age: "J", level: 10, caughtYear: 1 },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave([parent, mate]), deps());
    return { turn, prompt: turn.prompts[0] as YearRetirementPrompt };
  }

  it("grants exactly +10% to exactly one chosen stat, named after the retiree", () => {
    const { turn, prompt } = setup();
    const result = resolveRetirement(
      turn.save,
      prompt,
      { kind: "boon", parentUid: "parent", targetUid: "mate", stat: "atk" },
      { species, balance },
    );
    const mate = result.save.party.find((c) => c.uid === "mate") as OwnedCreature;
    expect(mate.boons).toHaveLength(1);
    expect(mate.boons[0]?.stat).toBe("atk");
    expect(mate.boons[0]?.sourceUid).toBe("parent");
    expect(mate.boons[0]?.name).toContain(prompt.formName);
    expect(boonMultiplier(mate, "atk", balance)).toBeCloseTo(1 + balance.stats.boonModPct, 10);
    for (const other of ["hp", "def", "spd", "ins"] as const) {
      expect(boonMultiplier(mate, other, balance)).toBe(1);
    }
  });

  it("keeps the boon permanently across later year turns", () => {
    const { turn, prompt } = setup();
    let save: SaveFile = resolveRetirement(
      turn.save,
      prompt,
      { kind: "boon", parentUid: "parent", targetUid: "mate", stat: "spd" },
      { species, balance },
    ).save;

    // The aging path rebuilds every surviving creature, so the boon has to be carried forward by
    // it. Walk the target's whole remaining life rather than a fixed count.
    let survivedTurns = 0;
    for (;;) {
      save = runYearTurn(save, deps()).save;
      const mate = save.party.find((c) => c.uid === "mate");
      if (!mate) break;
      survivedTurns += 1;
      expect(mate.boons).toHaveLength(1);
      expect(mate.boons[0]?.stat).toBe("spd");
      expect(boonMultiplier(mate, "spd", balance)).toBeCloseTo(
        1 + balance.stats.boonModPct,
        10,
      );
    }
    expect(survivedTurns).toBeGreaterThanOrEqual(1);
  });

  it("keeps a boon on a caught Ancient across every year turn of the game", () => {
    const kilnback = line("kilnback-line");
    const parent = newOwnedCreature(
      { uid: "parent", lineId: nibbin.id, age: "E", level: 24, caughtYear: 1 },
      nibbin,
      balance,
    );
    const ancient = newOwnedCreature(
      { uid: "ancient", lineId: kilnback.id, age: "E", level: 40, caughtYear: 1 },
      kilnback,
      balance,
    );
    const turn = runYearTurn(baseSave([parent, ancient]), deps());
    let save: SaveFile = resolveRetirement(
      turn.save,
      turn.prompts[0] as YearRetirementPrompt,
      { kind: "boon", parentUid: "parent", targetUid: "ancient", stat: "hp" },
      { species, balance },
    ).save;

    for (let i = 0; i < balance.clock.yearsTotal; i += 1) {
      save = runYearTurn(save, deps()).save;
      const held = save.party.find((c) => c.uid === "ancient") as OwnedCreature;
      expect(held.boons).toHaveLength(1);
      expect(boonMultiplier(held, "hp", balance)).toBeCloseTo(1 + balance.stats.boonModPct, 10);
    }
  });

  it("stacks two boons on the same stat additively", () => {
    const parentA = newOwnedCreature(
      { uid: "pa", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1 },
      nibbin,
      balance,
    );
    const parentB = newOwnedCreature(
      { uid: "pb", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1 },
      nibbin,
      balance,
    );
    const mate = newOwnedCreature(
      { uid: "mate", lineId: nibbin.id, age: "J", level: 10, caughtYear: 1 },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave([parentA, parentB, mate]), deps());
    let save: SaveFile = turn.save;
    for (const prompt of turn.prompts) {
      save = resolveRetirement(
        save,
        prompt,
        { kind: "boon", parentUid: prompt.parentUid, targetUid: "mate", stat: "atk" },
        { species, balance },
      ).save;
    }
    const boosted = save.party.find((c) => c.uid === "mate") as OwnedCreature;
    expect(boosted.boons).toHaveLength(2);
    expect(boonMultiplier(boosted, "atk", balance)).toBeCloseTo(
      1 + 2 * balance.stats.boonModPct,
      10,
    );
  });

  it("refuses a boon aimed at a creature that is not owned", () => {
    const { turn, prompt } = setup();
    expect(() =>
      resolveRetirement(
        turn.save,
        prompt,
        { kind: "boon", parentUid: "parent", targetUid: "ghost", stat: "atk" },
        { species, balance },
      ),
    ).toThrow(LifecycleError);
  });

  it("can boon a BOXED teammate too", () => {
    const parent = newOwnedCreature(
      { uid: "parent", lineId: nibbin.id, age: "E", level: 24, caughtYear: 1 },
      nibbin,
      balance,
    );
    const boxed = newOwnedCreature(
      { uid: "boxed", lineId: nibbin.id, age: "J", level: 9, caughtYear: 1, boxed: true },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave([parent], [boxed]), deps());
    const result = resolveRetirement(
      turn.save,
      turn.prompts[0] as YearRetirementPrompt,
      { kind: "boon", parentUid: "parent", targetUid: "boxed", stat: "def" },
      { species, balance },
    );
    expect(result.save.box[0]?.boons).toHaveLength(1);
  });
});

describe("THE LEGACY BEAT (build-doc §1, never-cut) — starter retires before the league, heir fights the finale", () => {
  it("runs a six-year timeline and lands a legal heir at the year-6 finale", () => {
    /*
     * bible §6 puts The Sanctum Fallow in year 6 — but under D-Q3-1 that is NOMINAL PACING, not a
     * gate: the finale is an ACT condition and the calendar has no last year. This test measures the
     * Legacy beat on a normally paced timeline; the same beat on the ACT axis (act 6 reached in
     * calendar year 11) is measured by playing, in `tests/unit/overworld-scene.test.ts` §10.5.
     */
    const leagueYear = balance.clock.yearsTotal;
    const starterLine = line("cindril-line");
    const starter = newOwnedCreature(
      {
        uid: "starter",
        lineId: starterLine.id,
        age: "J",
        level: balance.xp.starterLevel,
        caughtYear: balance.clock.startYear,
        traits: [trait("strong-jaw", "atk"), trait("fleet-step", "spd")],
        nickname: "Ember",
      },
      starterLine,
      balance,
    );

    let save: SaveFile = baseSave([starter]);
    const rng = stream([0.31, 0.62, 0.17, 0.88, 0.45, 0.09, 0.73, 0.51]);

    let starterRetiredInYear = -1;
    let heirUid: string | null = null;

    // Years 1 -> 6: five year turns bring the player to the league year.
    while (save.year < leagueYear) {
      const before = save.year;
      const result = advanceYear(save, { species, balance, nodes, rng });
      save = result.save;
      for (const prompt of result.prompts) {
        if (prompt.parentUid === "starter") starterRetiredInYear = save.year;
      }
      for (const ev of result.events) {
        if (ev.t === "heirBorn" && ev.parentUid === "starter") heirUid = ev.heirUid;
      }
      expect(save.year).toBe(before + 1);
    }
    expect(save.year).toBe(leagueYear);

    // 1. The starter retired, and it retired BEFORE the league.
    expect(starterRetiredInYear).toBeGreaterThan(0);
    expect(starterRetiredInYear).toBeLessThan(leagueYear);
    expect(save.party.some((c) => c.uid === "starter")).toBe(false);
    expect(save.box.some((c) => c.uid === "starter")).toBe(false);

    // 2. Its heir exists, is in the party, and is a LEGAL creature.
    expect(heirUid).not.toBeNull();
    const heir = save.party.find((c) => c.uid === heirUid);
    expect(heir).toBeDefined();
    const legal = zOwnedCreature.safeParse(heir);
    expect(legal.success).toBe(true);

    const h = heir as OwnedCreature;
    expect(h.lineId).toBe(starterLine.id);
    expect(h.level).toBeGreaterThanOrEqual(1);
    expect(h.level).toBeLessThanOrEqual(balance.xp.levelCap);
    expect(save.party.length).toBeLessThanOrEqual(balance.party.maxPartySize);

    // 3. It is FIELDABLE at the finale: still alive, and not retiring before the league is over.
    expect(h.yearsRemaining).toBeGreaterThan(0);
    expect(projectedRetirementYearOf(h, save.year, index)).toBeGreaterThan(leagueYear);

    // 4. It is the starter's heir, not a stranger: every trait it carries came from the starter.
    const parentTraitIds = starter.traits.map((t) => t.id);
    for (const t of h.traits) expect(parentTraitIds).toContain(t.id);
    expect(h.relicSlot).toBeTruthy();
  });
});

describe("build-doc §7.5 step 5 — node sims run their 4th season step, then year events fire", () => {
  it("steps every node once, with the last season of the clock order", () => {
    const seen: Array<{ nodeId: string; season: Season }> = [];
    const turn = runYearTurn(
      baseSave([]),
      deps({
        ecosimStep: (nodeId, state, season) => {
          seen.push({ nodeId, season });
          return state;
        },
      }),
    );
    const lastSeason = balance.clock.seasonOrder[balance.clock.seasonOrder.length - 1];
    expect(turn.seasonStepRan).toBe(true);
    expect(seen).toHaveLength(nodes.length);
    expect(new Set(seen.map((s) => s.nodeId))).toEqual(new Set(nodes.map((n) => n.id)));
    for (const s of seen) expect(s.season).toBe(lastSeason);
  });

  it("reports a skipped season step rather than pretending the sim ran", () => {
    const turn = runYearTurn(baseSave([]), deps());
    expect(turn.seasonStepRan).toBe(false);
    expect(turn.events.some((e) => e.t === "seasonStep")).toBe(false);
  });

  it("fires the Cullbrand raid only on entry to its scripted ACT, at its named node", () => {
    const raids = yearEventsOf(balance);
    expect(raids.length).toBeGreaterThan(0);
    const raid = raids[0];
    expect(raid).toBeDefined();
    const script = raid as NonNullable<typeof raid>;

    let save: SaveFile = baseSave([]);
    const before = save.nodeStates[script.nodeId];
    expect(before).toBeDefined();
    const beforeCounts = Object.fromEntries(
      Object.entries((before as NonNullable<typeof before>).populations).map(([k, v]) => [k, v.count]),
    );

    /*
     * D-Q3-1: the trigger is ACT ENTRY, not a year turn. Climbing the ladder one act at a time, the
     * raid fires on exactly one rung — and the CALENDAR never moves, which is the assertion that
     * makes this a decoupling test rather than a rename: `save.year` is the start year throughout.
     */
    for (let act = balance.acts.first; act <= script.act; act += 1) {
      const at = saveAtAct(act, []);
      const entry = enterPendingActs({ ...at, nodeStates: save.nodeStates }, { balance, gyms });
      save = entry.save;
      const fired = entry.events.filter((e) => e.t === "raid");
      expect(actOf(save, gyms, balance)).toBe(act);
      expect(save.year).toBe(balance.clock.startYear);
      expect(fired).toHaveLength(act === script.act ? script.targets.length : 0);
    }

    const after = save.nodeStates[script.nodeId] as NonNullable<typeof before>;
    let totalRemoved = 0;
    for (const target of script.targets) {
      const wasCount = beforeCounts[target.lineId];
      expect(wasCount).toBeDefined();
      const removed = Math.min(wasCount as number, target.remove);
      totalRemoved += removed;
      expect(after.populations[target.lineId]?.count).toBe((wasCount as number) - removed);
    }
    expect(after.recentDeaths).toBe(totalRemoved);

    // The raid removes ONLY what its own script names — nothing else at the node moves.
    const targeted = new Set(script.targets.map((t) => t.lineId));
    for (const [lineId, pop] of Object.entries(after.populations)) {
      if (targeted.has(lineId)) continue;
      expect(pop.count).toBe(beforeCounts[lineId]);
    }
  });

  it("G6 — no scripted raid may decrement a predator directly", () => {
    /*
     * This is the guardrail, and it binds the DATA, not the loop that applies it. build-doc §7.5
     * step 5 lets a year event "decrement scripted node populations"; G6 forbids scripting the
     * cascade itself. A raid that harvests Grazers is a harvest — the Mesopredator and Apex crash
     * above it then has to EMERGE from the §7.3 rules. A raid that also reaches up and deletes the
     * Mesopredator is the demo cascade written into the script, which is precisely what G6 exists
     * to stop, and it would still look correct to the "only what it names" assertion above.
     */
    const webRole = balance.ecosim.webRoleAgeClass;
    const predatorRoles = new Set(["Mesopredator", "Apex", "AncientApex"]);
    for (const raid of yearEventsOf(balance)) {
      const node = nodes.find((n) => n.id === raid.nodeId);
      expect(node, `raid "${raid.id}" names node "${raid.nodeId}", which is not in data/nodes/`).toBeDefined();
      expect(raid.act).toBeGreaterThanOrEqual(balance.acts.first);
      expect(raid.act).toBeLessThanOrEqual(balance.acts.last);
      for (const target of raid.targets) {
        const l = line(target.lineId);
        expect(
          predatorRoles.has(l.role[webRole]),
          `raid "${raid.id}" harvests ${target.lineId}, a ${l.role[webRole]} — a raid may only ` +
            `remove what is harvested; the collapse above it must emerge (G6)`,
        ).toBe(false);
        expect(target.remove).toBeGreaterThan(0);
        expect((node as NodeFile).populations[target.lineId]).toBeDefined();
      }
    }
  });

  it("leaves every other node untouched by a raid", () => {
    const script = yearEventsOf(balance)[0];
    expect(script).toBeDefined();
    const target = script as NonNullable<typeof script>;
    const at = saveAtAct(target.act);
    const before = JSON.parse(JSON.stringify(at.nodeStates)) as typeof at.nodeStates;
    const save = enterPendingActs(at, { balance, gyms }).save;
    for (const nodeId of Object.keys(save.nodeStates)) {
      if (nodeId === target.nodeId) continue;
      expect(save.nodeStates[nodeId]).toEqual(before[nodeId]);
    }
  });

  it("never mutates the save it was handed", () => {
    const script = yearEventsOf(balance)[0] as NonNullable<ReturnType<typeof yearEventsOf>[number]>;
    const at = saveAtAct(script.act);
    const snapshot = JSON.stringify(at);
    enterPendingActs(at, { balance, gyms });
    expect(JSON.stringify(at)).toBe(snapshot);
    // …and the year turn, which no longer applies raids at all, moves no population by itself.
    const before = JSON.stringify(baseSave([]).nodeStates);
    runYearTurn(baseSave([]), deps());
    expect(JSON.stringify(baseSave([]).nodeStates)).toBe(before);
  });
});

describe("build-doc §7.5 step 6 — map year-variant swap", () => {
  const base = nodes[0] as NodeFile;

  it("reports a swap only for nodes carrying a variant for the new year", () => {
    const withVariant: NodeFile = {
      ...base,
      id: "fixture-node",
      yearVariants: { 2: "assets/final/maps/fixture-y2.png" },
    };
    const turn = runYearTurn(baseSave([]), deps({ nodes: [withVariant] }));
    expect(turn.save.year).toBe(2);
    expect(turn.mapVariantSwaps).toEqual([
      { nodeId: "fixture-node", year: 2, mapAsset: "assets/final/maps/fixture-y2.png" },
    ]);
    expect(turn.events.filter((e) => e.t === "mapVariant")).toHaveLength(1);
  });

  it("reports no swap when the node has no variant for that year", () => {
    const withVariant: NodeFile = { ...base, id: "fixture-node", yearVariants: { 3: "y3.png" } };
    const turn = runYearTurn(baseSave([]), deps({ nodes: [withVariant] }));
    expect(turn.save.year).toBe(2);
    expect(turn.mapVariantSwaps).toEqual([]);
  });

  it("reuses the nearest passing variant for a year that has none (build-doc §9.5)", () => {
    const node: NodeFile = { ...base, yearVariants: { 2: "y2.png", 4: "y4.png" } };
    expect(mapAssetForYear(node, 1, balance)).toBe(node.mapAsset);
    expect(mapAssetForYear(node, 2, balance)).toBe("y2.png");
    expect(mapAssetForYear(node, 3, balance)).toBe("y2.png");
    expect(mapAssetForYear(node, 4, balance)).toBe("y4.png");
    expect(mapAssetForYear(node, 6, balance)).toBe("y4.png");
  });

  it("A YEAR-9 NODE RENDERS AS ITS YEAR-6 SELF — the clamp holds past the old cap (D-Q3-1)", () => {
    /*
     * `yearVariants` only ever holds keys 2–6 (build-doc §7.2) and the calendar is now unbounded, so
     * every year past 6 asks for a key that cannot exist. build-doc §9.5 already settles it — "that
     * year reuses the nearest passing variant" — and the failure this pins is the OTHER answer: a
     * year-9 Hearthollow falling back to the BASE map, i.e. rendering younger than the year-6 art
     * the player was already looking at, which is the aged-world thesis running backwards.
     */
    const full: NodeFile = {
      ...base,
      yearVariants: { 2: "y2.png", 3: "y3.png", 4: "y4.png", 5: "y5.png", 6: "y6.png" },
    };
    for (const year of [6, 7, 9, 12, 40, 999]) {
      expect(mapAssetForYear(full, year, balance), `year ${String(year)}`).toBe("y6.png");
      expect(mapAssetForYear(full, year, balance)).not.toBe(full.mapAsset);
    }
    // A sparse list clamps to its own highest, not to 6.
    const sparse: NodeFile = { ...base, yearVariants: { 2: "y2.png", 4: "y4.png" } };
    for (const year of [7, 9, 40]) expect(mapAssetForYear(sparse, year, balance)).toBe("y4.png");
    // A node with no variants at all still answers with its base map rather than undefined.
    const bare: NodeFile = { ...base, yearVariants: {} };
    expect(mapAssetForYear(bare, 9, balance)).toBe(bare.mapAsset);
  });

  /*
   * HONESTY, PUBLISHED. The §9.5 clamp above is correct code over EMPTY
   * DATA: every one of the shipped node files ships `yearVariants: {}`, so `mapAssetForYear` returns
   * the base map at every year and the year-turn map swap can never fire in the running game. The
   * clamp is proven against synthetic fixtures only, and this test exists so the green above is not
   * read as evidence about shipped behaviour. When the art lane ships a variant, this fails and
   * whoever ships it decides what the claim becomes.
   */
  it("PUBLISHES that no shipped node has a year variant, so the clamp is untested by real data", () => {
    const withVariants = content.nodes.filter((n) => Object.keys(n.yearVariants).length > 0);
    expect(withVariants.map((n) => n.id)).toEqual([]);
    for (const node of content.nodes) {
      for (const year of [1, 2, 6, 9, 25]) {
        expect(mapAssetForYear(node, year, balance), `${node.id} y${String(year)}`).toBe(node.mapAsset);
      }
    }
  });

  it("emits a swap when the RESOLVED asset changes, and none while it is being reused", () => {
    /*
     * Step 6 used to ask "is there a variant for exactly this year", which under an unbounded
     * calendar answers null forever after year 6. It asks whether the §9.5 fallback resolves to a
     * different asset than last year's — so year 3 over a {2,4} list reports nothing (it is still
     * looking at the year-2 art, correctly) and so does year 9 over a {..6} list.
     */
    const node: NodeFile = { ...base, id: "fixture-node", yearVariants: { 2: "y2.png", 4: "y4.png" } };
    const swapAt = (endedYear: number): string[] =>
      runYearTurn({ ...baseSave([]), year: endedYear }, deps({ nodes: [node] })).mapVariantSwaps.map(
        (s) => s.mapAsset,
      );
    expect(swapAt(1)).toEqual(["y2.png"]); // base → y2
    expect(swapAt(2)).toEqual([]); // y2 → y2 (year 3 reuses it)
    expect(swapAt(3)).toEqual(["y4.png"]); // y2 → y4
    expect(swapAt(4)).toEqual([]); // y4 → y4
    for (const endedYear of [6, 8, 11, 39]) expect(swapAt(endedYear)).toEqual([]);
  });

  it("ships every node with the Hard Req 5 single collision mask, unchanged by the year turn", () => {
    // Hard Req 5: "one collision mask per map survives all six years" — nothing in the year turn
    // may ever emit a mask change, only a mapAsset change.
    const swaps = runYearTurn(baseSave([]), deps()).mapVariantSwaps;
    for (const swap of swaps) expect(Object.keys(swap)).toEqual(["nodeId", "year", "mapAsset"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * Regression suite — every block below pins a defect a green suite used to miss.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("the BOON's +10% has exactly one home (G11 / balance.json _singleSource)", () => {
  const nibbin = line("nibbin-line");

  it("reads the same balance key core/battle.ts reads", () => {
    /*
     * balance.json carries the same rule twice — `stats.boonModPct` and `retirement.boonStatPct`.
     * core/battle.ts `effectiveStats` applies the first. Retuning either one alone used to make the
     * creature card and the battle disagree, silently. This retunes ONE key and asserts both
     * modules move together; whichever key lifecycle stops reading, this goes red.
     */
    const retuned: Balance = {
      ...balance,
      stats: { ...balance.stats, boonModPct: 0.25 },
    };
    const target = newOwnedCreature(
      { uid: "t", lineId: nibbin.id, age: "A", level: 20, caughtYear: 1 },
      nibbin,
      balance,
    );
    const boosted: OwnedCreature = {
      ...target,
      boons: [
        {
          id: "b",
          name: "x",
          stat: "atk",
          sourceUid: "p",
          sourceFormName: "Nibbin",
          grantedYear: 1,
        },
      ],
    };

    const plain = effectiveStats({ line: nibbin, age: "A", level: 20, balance: retuned });
    const withBoon = effectiveStats({
      line: nibbin,
      age: "A",
      level: 20,
      balance: retuned,
      boons: boosted.boons,
    });
    expect(withBoon.atk / plain.atk).toBeCloseTo(boonMultiplier(boosted, "atk", retuned), 2);
    expect(boonMultiplier(boosted, "atk", retuned)).toBeCloseTo(1.25, 10);
  });

  it("has no second home: retirement.boonStatPct was deleted at integration", () => {
    // balance.json used to state the boon percentage twice
    // (`stats.boonModPct` and `retirement.boonStatPct`); core/battle.ts read the first and
    // core/lifecycle.ts the second, so retuning either alone made the creature card and the
    // battle disagree silently. The duplicate is gone and must not come back — a re-added key
    // would be stripped by zBalance (making it a decoy) or, if also schema'd, a live drift.
    const rawBalance = JSON.parse(readFileSync("data/balance.json", "utf8")) as {
      retirement: Record<string, unknown>;
    };
    expect(
      Object.keys(rawBalance.retirement).filter((k) => !k.startsWith("_")),
      "the BOON's magnitude has exactly one home: balance.stats.boonModPct (balance.json " +
        "_singleSource). Do not re-add retirement.boonStatPct.",
    ).not.toContain("boonStatPct");
    expect((balance.retirement as unknown as Record<string, unknown>)["boonStatPct"]).toBeUndefined();
  });
});

describe("boons are bounded (build-doc §7.5 step 3 sizes them but does not count them)", () => {
  const nibbin = line("nibbin-line");

  function elders(n: number): OwnedCreature[] {
    return Array.from({ length: n }, (_, i) =>
      newOwnedCreature(
        { uid: `p${i}`, lineId: nibbin.id, age: "E", level: 20, caughtYear: 1 },
        nibbin,
        balance,
      ),
    );
  }

  it("caps the stack at the ceiling the additions file derives it from", () => {
    // data/balance.additions.A4.json states the derivation: the boon's unit is the bible §2 ±10%
    // trait modifier, so its ceiling is the trait system's own — balance.traits.maxSlots. Pinning
    // the relationship means a retune has to change the stated rule too, not slip past it.
    expect(
      boonMaxStacksPerStat(balance),
      "balance.additions.A4.json derives boonMaxStacksPerStat from balance.traits.maxSlots; " +
        "change the stated rationale in the same edit as the number.",
    ).toBe(balance.traits.maxSlots);
    expect(boonMaxStacksPerStat(balance)).toBeLessThan(balance.party.maxPartySize);
  });

  it("caps the stack on one stat at balance's boonMaxStacksPerStat", () => {
    const cap = boonMaxStacksPerStat(balance);
    expect(cap).toBeGreaterThanOrEqual(1);

    const target = newOwnedCreature(
      { uid: "target", lineId: nibbin.id, age: "J", level: 10, caughtYear: 1, boxed: true },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave(elders(balance.party.maxPartySize), [target]), deps());
    expect(turn.prompts).toHaveLength(balance.party.maxPartySize);

    let save: SaveFile = turn.save;
    let refused = 0;
    for (const prompt of turn.prompts) {
      const choice = {
        kind: "boon" as const,
        parentUid: prompt.parentUid,
        targetUid: "target",
        stat: "atk" as StatKey,
      };
      try {
        save = resolveRetirement(save, prompt, choice, { species, balance }).save;
      } catch (err) {
        expect(err).toBeInstanceOf(LifecycleError);
        refused += 1;
      }
    }
    const boosted = save.box.find((c) => c.uid === "target") as OwnedCreature;
    expect(boosted.boons).toHaveLength(cap);
    expect(refused).toBe(balance.party.maxPartySize - cap);
    expect(boonMultiplier(boosted, "atk", balance)).toBeCloseTo(1 + cap * balance.stats.boonModPct, 10);
  });

  it("never lets a stored over-stack read past the cap", () => {
    // A save written before the cap existed must not keep its +60%.
    const cap = boonMaxStacksPerStat(balance);
    const c = newOwnedCreature(
      { uid: "legacy", lineId: nibbin.id, age: "A", level: 20, caughtYear: 1 },
      nibbin,
      balance,
    );
    const over: OwnedCreature = {
      ...c,
      boons: Array.from({ length: cap + 4 }, (_, i) => ({
        id: `b${i}`,
        name: "x",
        stat: "atk" as StatKey,
        sourceUid: `p${i}`,
        sourceFormName: "Nibbin",
        grantedYear: 1,
      })),
    };
    expect(boonMultiplier(over, "atk", balance)).toBeCloseTo(1 + cap * balance.stats.boonModPct, 10);
  });

  it("reports which teammates a boon may legally target", () => {
    const cap = boonMaxStacksPerStat(balance);
    const a = newOwnedCreature(
      { uid: "a", lineId: nibbin.id, age: "A", level: 10, caughtYear: 1 },
      nibbin,
      balance,
    );
    const b = newOwnedCreature(
      { uid: "b", lineId: nibbin.id, age: "A", level: 10, caughtYear: 1, boxed: true },
      nibbin,
      balance,
    );
    const capped: OwnedCreature = {
      ...a,
      boons: Array.from({ length: cap }, (_, i) => ({
        id: `b${i}`,
        name: "x",
        stat: "atk" as StatKey,
        sourceUid: "p",
        sourceFormName: "Nibbin",
        grantedYear: 1,
      })),
    };
    const save = baseSave([capped], [b]);
    expect(boonTargetUids(save, balance).sort()).toEqual(["a", "b"]);
    expect(boonTargetUids(save, balance, "atk")).toEqual(["b"]);
    expect(boonTargetUids(save, balance, "def").sort()).toEqual(["a", "b"]);
    expect(boonTargetUids(baseSave([], []), balance)).toEqual([]);
  });
});

describe("a year turn is never lost to an unanswerable choice", () => {
  const nibbin = line("nibbin-line");

  function soloElder(uid = "only"): OwnedCreature {
    return newOwnedCreature(
      { uid, lineId: nibbin.id, age: "E", level: 20, caughtYear: 1 },
      nibbin,
      balance,
    );
  }

  it("degrades a BOON with no surviving target to the rolled HEIR and says so", () => {
    /*
     * The player's only creature retires; the only uid the UI could offer is the retiree's own.
     * This used to throw out of `advanceYear`, discarding the season step, the scripted raid and
     * the map-variant swap along with the bad choice.
     */
    const rng = stream([0.5, 0.25]);
    const result = advanceYear(baseSave([soloElder()]), {
      species,
      balance,
      nodes,
      rng,
      decide: (prompt) => ({
        kind: "boon",
        parentUid: prompt.parentUid,
        targetUid: prompt.parentUid,
        stat: "atk",
      }),
    });

    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toMatch(/no legal target|not in the party or the box/);
    expect(result.rejected[0]?.applied.kind).toBe("heir");
    expect(result.events.some((e) => e.t === "choiceRejected")).toBe(true);
    expect(result.choices[0]?.kind).toBe("heir");
    // The turn completed: the year advanced and an heir carries the line on.
    expect(result.save.year).toBe(balance.clock.startYear + 1);
    expect(result.save.party).toHaveLength(1);
    expect(result.save.party[0]?.lineId).toBe(nibbin.id);
  });

  it("degrades a BOON aimed at another retiree of the same turn", () => {
    const rng = stream([0.5, 0.25, 0.75]);
    const result = advanceYear(baseSave([soloElder("a"), soloElder("b")]), {
      species,
      balance,
      nodes,
      rng,
      decide: (prompt) => ({
        kind: "boon",
        parentUid: prompt.parentUid,
        targetUid: prompt.parentUid === "a" ? "b" : "a",
        stat: "atk",
      }),
    });
    expect(result.rejected).toHaveLength(2);
    expect(result.save.party).toHaveLength(2);
    for (const c of result.save.party) expect(c.age).toBe("J");
  });

  it("degrades an HEIR naming a trait the parent never had", () => {
    const rng = stream([0.5, 0.25]);
    const result = advanceYear(baseSave([soloElder()]), {
      species,
      balance,
      nodes,
      rng,
      decide: (prompt) => ({
        kind: "heir",
        parentUid: prompt.parentUid,
        inheritedTraitIds: ["stoneblood"],
        heirUid: "cheat",
      }),
    });
    expect(result.rejected).toHaveLength(1);
    expect(result.save.party[0]?.uid).not.toBe("cheat");
  });

  it("consumes the same number of stream draws whether the choice is legal or not", () => {
    // build-doc §8.1: the log accounts for the draws. A path that throws after drawing (and a retry
    // after it) desynchronises live play from replay, so no path may throw after drawing.
    const count = (fn: (rng: RandomFn) => void): number => {
      let n = 0;
      const values = [0.31, 0.62, 0.17, 0.88];
      fn(() => {
        const v = values[n % values.length] ?? 0;
        n += 1;
        return v;
      });
      return n;
    };
    const party = [soloElder("a"), soloElder("b"), soloElder("c")];
    const clean = count((rng) => {
      advanceYear(baseSave(party), { species, balance, nodes, rng });
    });
    const dirty = count((rng) => {
      advanceYear(baseSave(party), {
        species,
        balance,
        nodes,
        rng,
        decide: (prompt) => ({
          kind: "boon",
          parentUid: prompt.parentUid,
          targetUid: "ghost",
          stat: "atk",
        }),
      });
    });
    expect(dirty).toBe(clean);
    expect(clean).toBeGreaterThan(0);
  });

  it("tells the caller when the party came out empty", () => {
    // The overworld and battle scenes cannot be handed a save with zero creatures in silence.
    const boxed = newOwnedCreature(
      { uid: "kept", lineId: nibbin.id, age: "J", level: 8, caughtYear: 1, boxed: true },
      nibbin,
      balance,
    );
    const result = advanceYear(baseSave([soloElder()], [boxed]), {
      species,
      balance,
      nodes,
      rng: stream([0.5]),
      decide: (prompt) => ({
        kind: "boon",
        parentUid: prompt.parentUid,
        targetUid: "kept",
        stat: "atk",
      }),
    });
    expect(result.rejected).toHaveLength(0);
    expect(result.save.party).toHaveLength(0);
    expect(result.partyEmpty).toBe(true);
    expect(result.events.some((e) => e.t === "partyEmpty")).toBe(true);
    // …and stays quiet when it is not empty.
    const ok = advanceYear(baseSave([soloElder()]), { species, balance, nodes, rng: stream([0.5]) });
    expect(ok.partyEmpty).toBe(false);
    expect(ok.events.some((e) => e.t === "partyEmpty")).toBe(false);
  });
});

describe("an heir takes its parent's place, not the player's bench", () => {
  const nibbin = line("nibbin-line");

  it("puts a BOXED parent's heir in the box, even with room in the party", () => {
    const active = newOwnedCreature(
      { uid: "active", lineId: nibbin.id, age: "J", level: 8, caughtYear: 1 },
      nibbin,
      balance,
    );
    const hoarded = newOwnedCreature(
      { uid: "hoarded", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1, boxed: true },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave([active], [hoarded]), deps());
    const prompt = turn.prompts[0] as YearRetirementPrompt;
    expect(prompt.parentUid).toBe("hoarded");
    expect(prompt.where).toBe("box");
    expect(turn.save.party.length).toBeLessThan(balance.party.maxPartySize);

    const choice = rollHeirChoice(prompt, stream([0.3]), balance, turn.save.year);
    const result = resolveRetirement(turn.save, prompt, choice, { species, balance });
    const heir = result.heir as OwnedCreature;
    expect(result.save.box.map((c) => c.uid)).toContain(heir.uid);
    expect(result.save.party.map((c) => c.uid)).toEqual(["active"]);
    expect(heir.boxed).toBe(true);
    const born = result.events.find((e) => e.t === "heirBorn");
    expect(born && born.t === "heirBorn" ? born.where : null).toBe("box");
  });

  it("still puts a PARTY parent's heir in the party", () => {
    const parent = newOwnedCreature(
      { uid: "parent", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1 },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave([parent]), deps());
    const prompt = turn.prompts[0] as YearRetirementPrompt;
    expect(prompt.where).toBe("party");
    const choice = rollHeirChoice(prompt, stream([0.3]), balance, turn.save.year);
    const result = resolveRetirement(turn.save, prompt, choice, { species, balance });
    expect(result.save.party.map((c) => c.uid)).toContain((result.heir as OwnedCreature).uid);
    expect(result.save.box).toHaveLength(0);
  });

  it("falls back to the party when a boxed parent's box is full", () => {
    // A year turn always frees a box slot by removing the retiree, so the full-box case has to be
    // built directly. It is still reachable — a caller may box a catch before answering the prompt.
    const box = Array.from({ length: balance.party.maxBoxSize }, (_, i) =>
      newOwnedCreature(
        { uid: `b${i}`, lineId: nibbin.id, age: "J", level: 5, caughtYear: 1, boxed: true },
        nibbin,
        balance,
      ),
    );
    const parent = newOwnedCreature(
      { uid: "parent", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1, boxed: true },
      nibbin,
      balance,
    );
    const save = baseSave([], box);
    const prompt = { ...retirementPromptFor(parent, nibbin, "box") };
    const choice = rollHeirChoice(prompt, stream([0.3]), balance, save.year);
    const result = resolveRetirement(save, prompt, choice, { species, balance });
    expect(result.save.box).toHaveLength(balance.party.maxBoxSize);
    expect(result.save.party.map((c) => c.uid)).toContain((result.heir as OwnedCreature).uid);

    // …and refuses when there is genuinely nowhere to put it.
    const fullParty = Array.from({ length: balance.party.maxPartySize }, (_, i) =>
      newOwnedCreature(
        { uid: `p${i}`, lineId: nibbin.id, age: "J", level: 5, caughtYear: 1 },
        nibbin,
        balance,
      ),
    );
    expect(() =>
      resolveRetirement(baseSave(fullParty, box), prompt, choice, { species, balance }),
    ).toThrow(LifecycleError);
  });
});

describe("aging keeps the HP fraction it was handed", () => {
  it.each(["nibbin-line", "mirefin-line"])("%s: full HP stays full across a transition", (lineId) => {
    /*
     * Max HP grows at every age transition (0.75 → 1.0 → 1.15, plus the metamorphic ×1.15), so a
     * curHp carried through unchanged silently drops the creature's HP fraction every year.
     */
    const l = line(lineId);
    const maxOf = (c: OwnedCreature) =>
      effectiveStats({
        line: l,
        age: c.age,
        level: c.level,
        balance,
        ...(c.metamorphosed === undefined ? {} : { metamorphosed: c.metamorphosed }),
      }).hp;

    const juvenile = newOwnedCreature(
      { uid: "u", lineId, age: "J", level: 20, caughtYear: 1 },
      l,
      balance,
    );
    const full = { ...juvenile, curHp: maxOf(juvenile) };
    let save: SaveFile = baseSave([full]);
    let previousFraction = 1;
    for (let i = 0; i < balance.age.lifespanYears.J - 1; i += 1) {
      save = runYearTurn(save, deps()).save;
      const after = save.party[0] as OwnedCreature;
      const fraction = (after.curHp as number) / maxOf(after);
      expect(fraction).toBeCloseTo(previousFraction, 1);
      expect(after.curHp).toBeGreaterThan(full.curHp - 1);
      previousFraction = fraction;
    }
  });

  it("keeps a half-HP creature at half, and a fainted one fainted", () => {
    const l = line("nibbin-line");
    const c = newOwnedCreature({ uid: "u", lineId: l.id, age: "J", level: 20, caughtYear: 1 }, l, balance);
    const max = effectiveStats({ line: l, age: "J", level: 20, balance }).hp;
    const half = runYearTurn(baseSave([{ ...c, curHp: Math.round(max / 2) }]), deps()).save
      .party[0] as OwnedCreature;
    const maxA = effectiveStats({ line: l, age: "A", level: 20, balance }).hp;
    expect((half.curHp as number) / maxA).toBeCloseTo(0.5, 1);

    const fainted = runYearTurn(baseSave([{ ...c, curHp: 0 }]), deps()).save.party[0] as OwnedCreature;
    expect(fainted.curHp).toBe(0);
  });

  it("leaves a creature that never had a curHp without one", () => {
    const l = line("nibbin-line");
    const c = newOwnedCreature({ uid: "u", lineId: l.id, age: "J", level: 20, caughtYear: 1 }, l, balance);
    expect(c.curHp).toBeUndefined();
    const after = runYearTurn(baseSave([c]), deps()).save.party[0] as OwnedCreature;
    expect(after.curHp).toBeUndefined();
  });
});

describe("a scripted act event that names something absent fails loudly", () => {
  const enter = (act: number, yearEvents: RaidScript[]) =>
    enterPendingActs(saveAtAct(act), { balance, gyms, yearEvents });

  it("refuses a raid whose node this save has no state for", () => {
    const bad = [{ id: "typo-node", act: 2, nodeId: "r44", targets: [{ lineId: "ashvole-line", remove: 3 }] }];
    expect(() => enter(2, bad)).toThrow(LifecycleError);
    expect(() => enter(2, bad)).toThrow(/r44/);
  });

  it("refuses a raid whose target is not a population at that node", () => {
    // One letter dropped from a real line id — the shape that used to no-op in silence.
    const bad = [{ id: "typo-line", act: 2, nodeId: "r1", targets: [{ lineId: "nibin-line", remove: 3 }] }];
    expect(() => enter(2, bad)).toThrow(/nibin-line/);
  });

  it("reports the number that actually died, not the number it asked for", () => {
    // With a population floor the harvest is truncated; `removed` and `recentDeaths` must follow the
    // truncation, because recentDeaths IS the Scavenger encounter weight (build-doc §7.2).
    const nodeId = "r1";
    const save = saveAtAct(2);
    const state = save.nodeStates[nodeId] as NonNullable<(typeof save.nodeStates)[string]>;
    const lineId = Object.keys(state.populations)[0] as string;
    const count = state.populations[lineId]?.count as number;
    const floor = Math.max(1, Math.floor(count / 2));
    const floored: Balance = {
      ...balance,
      ecosim: { ...balance.ecosim, populationFloor: floor },
    };
    const entry = enterPendingActs(save, {
      balance: floored,
      gyms,
      yearEvents: [{ id: "floored", act: 2, nodeId, targets: [{ lineId, remove: count }] }],
    });
    const raid = entry.events.find((e) => e.t === "raid");
    expect(raid && raid.t === "raid" ? raid.remaining : -1).toBe(floor);
    expect(raid && raid.t === "raid" ? raid.removed : -1).toBe(count - floor);
    expect(entry.save.nodeStates[nodeId]?.recentDeaths).toBe(count - floor);
  });

  it("applies the shipped Cullbrand raid exactly once, however many times act entry is called", () => {
    const script = yearEventsOf(balance)[0] as NonNullable<ReturnType<typeof yearEventsOf>[number]>;
    const target = script.targets[0] as NonNullable<(typeof script.targets)[number]>;
    let save: SaveFile = saveAtAct(script.act);
    const first = enterPendingActs(save, { balance, gyms });
    save = first.save;
    const after = save.nodeStates[script.nodeId]?.populations[target.lineId]?.count;
    expect(first.events.filter((e) => e.t === "raid")).toHaveLength(script.targets.length);

    // Called again on the post-entry save — a reload, a double call, a replay. The latch holds.
    for (let i = 0; i < 3; i += 1) {
      const again = enterPendingActs(save, { balance, gyms });
      expect(again.actsEntered).toEqual([]);
      expect(again.events).toEqual([]);
      save = again.save;
      expect(save.nodeStates[script.nodeId]?.populations[target.lineId]?.count).toBe(after);
    }
  });

  it("A YEAR TURN NEVER FIRES A RAID — however many years pass (D-Q3-1)", () => {
    /*
     * The decoupling, asserted from the other side. Twelve year turns is twice the old six-year
     * game and past the year the shipped raid used to fire in; not one raid event is emitted,
     * because the calendar has no opinion about the plot any more.
     */
    let save: SaveFile = baseSave([]);
    let raidEvents = 0;
    for (let i = 0; i < 12; i += 1) {
      const turn = runYearTurn(save, deps());
      save = turn.save;
      raidEvents += turn.events.filter((e) => e.t === "raid").length;
    }
    expect(save.year).toBe(balance.clock.startYear + 12);
    expect(raidEvents).toBe(0);
  });
});

describe("the year turn refuses to run twice for the same year (build-doc §4's dual trigger)", () => {
  const nibbin = line("nibbin-line");

  it("stamps the year it completed and refuses a repeat of it", () => {
    const save = baseSave([
      newOwnedCreature({ uid: "u", lineId: nibbin.id, age: "J", level: 8, caughtYear: 1 }, nibbin, balance),
    ]);
    expect(canRunYearTurn(save)).toBe(true);
    const first = runYearTurn(save, deps());
    expect(first.save.questFlags[YEAR_TURN_FLAG]).toBe(first.save.year);
    expect(canRunYearTurn(first.save)).toBe(true); // …for the NEXT year.

    // The dangerous shape: gym victory and tick 16 both firing off the same pre-turn save.
    const stale = { ...first.save, year: save.year, tick: save.tick };
    expect(canRunYearTurn(stale)).toBe(false);
    expect(() => runYearTurn(stale, deps())).toThrow(LifecycleError);
  });

  it("keeps a second turn for the same year from re-aging the party", () => {
    /*
     * This test used to be "keeps the scripted raid from firing twice" and drove it through the
     * year turn. The raid is act entry's now (D-Q3-1) and its own idempotence is asserted above;
     * what remains here is the year turn's, which is aging — the other thing running the turn twice
     * for one year would double.
     */
    const nib = line("nibbin-line");
    const save = baseSave([
      newOwnedCreature({ uid: "u", lineId: nib.id, age: "J", level: 8, caughtYear: 1 }, nib, balance),
    ]);
    const first = runYearTurn(save, deps());
    const aged = first.save.party[0] as OwnedCreature;
    const stale = { ...first.save, year: save.year, tick: save.tick };
    expect(() => runYearTurn(stale, deps())).toThrow(LifecycleError);
    expect((first.save.party[0] as OwnedCreature).yearsRemaining).toBe(aged.yearsRemaining);
  });

  it("survives the save round-trip that carries the flag", () => {
    const save = runYearTurn(baseSave([]), deps()).save;
    const parsed = zSaveFile.safeParse(save);
    expect(parsed.success).toBe(true);
    expect(lastYearTurnFlagOf(save)).toBe(save.year);
  });
});

function lastYearTurnFlagOf(save: SaveFile): number | null {
  const raw = save.questFlags[YEAR_TURN_FLAG];
  return typeof raw === "number" ? raw : null;
}

describe("the creature card cannot promise a year the game does not have", () => {
  it("flags an heir whose projected retirement is past the final year", () => {
    const nibbin = line("nibbin-line");
    const finalYear = balance.clock.startYear + balance.clock.yearsTotal - 1;
    const lateHeir = newOwnedCreature(
      { uid: "late", lineId: nibbin.id, age: "J", level: 10, caughtYear: finalYear - 1 },
      nibbin,
      balance,
    );
    expect(lateHeir.projectedRetirementYear).toBeGreaterThan(finalYear);
    expect(retiresBeyondFinalYear(lateHeir, balance)).toBe(true);

    const early = newOwnedCreature(
      { uid: "early", lineId: nibbin.id, age: "E", level: 10, caughtYear: balance.clock.startYear },
      nibbin,
      balance,
    );
    expect(retiresBeyondFinalYear(early, balance)).toBe(false);
  });

  it("does not flag a caught Ancient, which has no retirement year at all", () => {
    const anc = line("vellsire-line");
    const c = newOwnedCreature({ uid: "v", lineId: anc.id, age: "E", level: 40, caughtYear: 1 }, anc, balance);
    expect(isNever(c.projectedRetirementYear)).toBe(true);
    expect(retiresBeyondFinalYear(c, balance)).toBe(false);
  });
});

describe("the year-turn tunables live in balance.json and cannot silently no-op (INV-3)", () => {
  /*
   * Lane A4 wrote these three into data/balance.additions.A4.json because balance.json belonged to
   * another lane; the integrator merged them and deleted that file. The failure mode this guards
   * has NOT gone away: core/schemas.ts validates balance.json with a plain zod `z.object`, which
   * STRIPS unknown keys, so a key present in the file but absent from `zBalance` never reaches
   * these accessors and every retune of it is silently ignored.
   *
   * The repo-wide version of this gate (every leaf of balance.json, not just A4's three) is
   * `balance_keys_survive_validation` in tests/gates/guardrails.test.ts.
   */
  const MERGED_FROM_A4 = [
    ["retirement", "heirLevelMin"],
    ["retirement", "boonMaxStacksPerStat"],
    ["yearEvents", "raids"],
  ] as const;

  const rawBalance = JSON.parse(
    readFileSync("data/balance.json", "utf8"),
  ) as Record<string, unknown>;

  function at(obj: unknown, path: readonly string[]): unknown {
    let cur: unknown = obj;
    for (const key of path) {
      if (cur === null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return cur;
  }

  it.each(MERGED_FROM_A4.map((p) => [p.join("."), p] as const))(
    "%s is in data/balance.json AND survives validation",
    (label, path) => {
      expect(at(rawBalance, path), `data/balance.json must carry ${label}`).not.toBeUndefined();
      expect(
        at(balance, path),
        `data/balance.json carries ${label} but core/schemas.ts zBalance strips it, so ` +
          `core/lifecycle.ts never sees it. Extend Balance (core/types.ts) and zBalance ` +
          `(core/schemas.ts) in the same commit as any merge.`,
      ).not.toBeUndefined();
    },
  );

  it("reads the value the accessors are documented to read", () => {
    expect(heirLevelMin(balance)).toBe(at(rawBalance, ["retirement", "heirLevelMin"]));
    expect(boonMaxStacksPerStat(balance)).toBe(
      at(rawBalance, ["retirement", "boonMaxStacksPerStat"]),
    );
    // A retune of balance.json really does win — INV-3.
    const retuned = {
      ...balance,
      retirement: { ...balance.retirement, heirLevelMin: 7, boonMaxStacksPerStat: 9 },
    } as unknown as Balance;
    expect(heirLevelMin(retuned)).toBe(7);
    expect(boonMaxStacksPerStat(retuned)).toBe(9);
  });

  it("fails LOUD rather than defaulting when a tunable is stripped away", () => {
    // The old accessors fell back to the additions file. There is no fallback now: a stripped key
    // must throw, because a silent default is exactly "the retune looks applied and is not".
    const stripped = {
      ...balance,
      retirement: { ...balance.retirement, heirLevelMin: undefined },
    } as unknown as Balance;
    expect(() => heirLevelMin(stripped)).toThrow(/heirLevelMin/);

    const noEvents = { ...balance, yearEvents: undefined } as unknown as Balance;
    expect(() => yearEventsOf(noEvents)).toThrow(/yearEvents\.raids/);
  });
});

describe("STAT_KEYS coverage — a boon on any stat behaves the same", () => {
  it.each(STAT_KEYS)("%s", (stat) => {
    const nibbin = line("nibbin-line");
    const parent = newOwnedCreature(
      { uid: "parent", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1 },
      nibbin,
      balance,
    );
    const mate = newOwnedCreature(
      { uid: "mate", lineId: nibbin.id, age: "J", level: 10, caughtYear: 1 },
      nibbin,
      balance,
    );
    const turn = runYearTurn(baseSave([parent, mate]), deps());
    const prompt = turn.prompts[0] as YearRetirementPrompt;
    const out = resolveRetirement(
      turn.save,
      prompt,
      { kind: "boon", parentUid: "parent", targetUid: "mate", stat },
      { species, balance },
    );
    const boosted = out.save.party.find((c) => c.uid === "mate") as OwnedCreature;
    expect(boonMultiplier(boosted, stat, balance)).toBeCloseTo(1 + balance.stats.boonModPct, 10);
  });
});
