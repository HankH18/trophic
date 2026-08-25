/** TEMPORARY reproduction probe for the C56 repair. Deleted before the lane reports. */
import { describe, expect, it } from "vitest";
import { advance, advanceAction, createClock } from "@core/clock";
import { indexSpecies, newOwnedCreature, runYearTurn, type YearTurnEvent } from "@core/lifecycle";
import { newSave, type SaveEnvelope } from "@core/save";
import { subsystemRng } from "@core/rng";
import { validateContent } from "@core/schemas";
import type { Content, OwnedCreature, SpeciesLine } from "@core/types";
import { previewAction, seasonMeterModel } from "@game/ui/SeasonMeter";
import { seasonTint } from "@game/season-tint";
import { raidCoverage } from "@game/year-events";
import { driveYearTurn, finishYearTurn, beatsFor } from "@game/scenes/YearTurnScene";
import { moveSelection, selectedChoice } from "@game/scenes/RetirementScene";

const content: Content = validateContent();
const balance = content.balance;
void indexSpecies(content.species);

function mortalLine(offset = 0): SpeciesLine {
  const lines = content.species.filter((l) => !l.ancient);
  return lines[offset % lines.length] as SpeciesLine;
}
function creature(uid: string, line: SpeciesLine, age: OwnedCreature["age"], level: number): OwnedCreature {
  return newOwnedCreature({ uid, lineId: line.id, age, level, caughtYear: balance.clock.startYear }, line, balance);
}
function saveWith(party: OwnedCreature[], seed = 7): SaveEnvelope {
  return newSave({ seed, currentNode: content.nodes[0]!.id, nodes: content.nodes, party }, balance);
}
function rng(seed: number) {
  return subsystemRng(seed, balance.rng.subsystemTags[1] ?? "sim");
}

describe("C56 reproduction", () => {
  it("A: the carry tick is dropped by the year turn", () => {
    const clock = { year: balance.clock.startYear, tick: balance.clock.ticksPerYear - 1 };
    const advanced = advanceAction(clock, "inn", balance);
    const preview = previewAction(clock, "inn", balance);
    const save = { ...saveWith([creature("p1", mortalLine(), "A", 10)]), ...clock };
    const drive = driveYearTurn(save, { content, simRng: rng(1), lifecycleRng: () => 0.5 });
    console.log("A clock after inn at 15:", JSON.stringify(advanced.clock),
      "preview.after:", JSON.stringify({ year: preview.after.year, tick: preview.after.tick }),
      "runYearTurn tick:", drive.turn.save.tick, "year:", drive.turn.save.year);
    expect(advanced.clock.tick).toBe(1);
  });

  it("B: a completed turn's save is accepted straight back in", () => {
    const save = saveWith([creature("p1", mortalLine(), "A", 10)]);
    const first = driveYearTurn(save, { content, simRng: rng(1), lifecycleRng: () => 0.5 });
    let second = "threw";
    try {
      const d = driveYearTurn(first.turn.save as SaveEnvelope, { content, simRng: rng(1), lifecycleRng: () => 0.5 });
      second = `ran, year ${d.turn.save.year}`;
    } catch { /* good */ }
    console.log("B after turn 1 year:", first.turn.save.year, "| second turn:", second);
  });

  it("C: ghost node in the save gets a fake season step", () => {
    const save = saveWith([creature("p1", mortalLine(), "A", 10)]);
    const ghost = { ...save, nodeStates: { ...save.nodeStates, __ghost: { populations: {}, floraStock: 1, recentDeaths: 0 } } };
    const drive = driveYearTurn(ghost, { content, simRng: rng(1), lifecycleRng: () => 0.5 });
    const steps = drive.turn.events.filter((e: YearTurnEvent) => e.t === "seasonStep" && e.nodeId === "__ghost");
    console.log("C ghost seasonStep events:", steps.length, "seasonStepRan:", drive.turn.seasonStepRan,
      "unchanged:", JSON.stringify(drive.turn.save.nodeStates.__ghost) === JSON.stringify(ghost.nodeStates.__ghost));
  });

  it("D: boon stat navigation is locked to the first stat", () => {
    const line = mortalLine();
    const save = saveWith([
      creature("elder", line, "E", 22),
      creature("m1", mortalLine(1), "J", 12),
      creature("m2", mortalLine(2), "J", 12),
    ]);
    const drive = driveYearTurn(save, { content, simRng: rng(1), lifecycleRng: () => 0.5 });
    const offer = drive.flow.offer()!;
    let sel = { side: "boon" as const, statIndex: 0, targetIndex: 0 };
    // this mirrors the scene's move(): the short-circuit never reaches moveSelection
    const reached = new Set<number>([sel.statIndex]);
    for (let i = 0; i < 12; i += 1) {
      const stat = offer.boons[sel.statIndex];
      const count = stat ? stat.targets.length : 0;
      if (count > 1) { sel = { ...sel, targetIndex: (sel.targetIndex + 1) % count }; }
      else { sel = moveSelection(sel, offer, "down") as typeof sel; }
      reached.add(sel.statIndex);
    }
    console.log("D targets per stat:", offer.boons.map((b) => b.targets.length).join(","),
      "| statIndexes reachable:", [...reached].join(","));
    console.log("D selectedChoice on a blocked stat:", selectedChoice({ side: "boon", statIndex: 0, targetIndex: 0 }, offer) !== null);
  });

  it("E: season tint brightness and darkening", () => {
    for (const season of balance.clock.seasonOrder) {
      const y1 = seasonTint(balance, season, balance.clock.startYear);
      const y6 = seasonTint(balance, season, balance.clock.startYear + balance.clock.yearsTotal - 1);
      console.log(`E ${season} y1 ${JSON.stringify(y1.rgb)} (base ${JSON.stringify(y1.base)}) y6 ${JSON.stringify(y6.rgb)}`);
    }
  });

  it("F: raid coverage over-reports year 1", () => {
    console.log("F coverage:", JSON.stringify(raidCoverage(balance)));
    const c = createClock(balance);
    console.log("F meter at last tick:", JSON.stringify(seasonMeterModel({ ...c, tick: balance.clock.ticksPerYear - 1 }, balance).tickLabel));
    console.log("F full-year advance events:", advance(c, balance.clock.ticksPerYear, balance).events.map((e) => e.t).join(","));
  });

  it("G: partyEmpty beat is unreachable from runYearTurn", () => {
    const line = mortalLine();
    const save = saveWith([creature("e1", line, "E", 20), creature("e2", line, "E", 18)]);
    const turn = runYearTurn(save, { species: content.species, balance, nodes: content.nodes });
    const beats = beatsFor(save, turn, content);
    console.log("G post-turn party:", turn.save.party.length, "beats:", beats.map((b) => b.t).join(" → "),
      "partyEmpty event:", turn.events.some((e) => e.t === "partyEmpty"));
  });

  it("H: beat order vs build-doc §7.5", () => {
    const line = mortalLine();
    const save = { ...saveWith([creature("e1", line, "E", 20)]), year: 3 };
    const drive = driveYearTurn(save, { content, simRng: rng(1), lifecycleRng: () => 0.5 });
    console.log("H beats:", drive.beats.map((b) => b.t).join(" → "));
    void finishYearTurn;
  });
});
