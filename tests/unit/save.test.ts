/**
 * tests/unit/save.test.ts — build-doc §7.8 (save shape), L11 (engine-agnostic core),
 * L12 (versioned JSON, 3 slots) and §8.1 `det_replay`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACT_ENTERED_FLAG, actOf, awardBadge, hasBadge } from "../../core/acts";
import { enterPendingActs } from "../../core/lifecycle";
import { validateContent } from "../../core/schemas";
import type {
  ActionLogEntry,
  Balance,
  GymLeader,
  NodeFile,
  OwnedCreature,
  SaveFile,
  SpeciesLine,
} from "../../core/types";
import {
  advanceYear,
  indexSpecies,
  newOwnedCreature,
  yearTurnActions,
  type RandomFn,
} from "../../core/lifecycle";
import {
  appendAction,
  appendEntries,
  appendYearTurn,
  canonicalStringify,
  captureStreams,
  withStreamState,
  deserialize,
  deleteSlot,
  listSlots,
  MemoryStorage,
  newSave,
  nodeStateFrom,
  openStreams,
  readSlot,
  replay,
  SaveCorruptError,
  SaveVersionError,
  saveVersionOf,
  serialize,
  slotKey,
  writeSlot,
  type SaveEnvelope,
} from "../../core/save";

const content = validateContent();
const balance: Balance = content.balance;
const species: SpeciesLine[] = content.species;
const nodes: NodeFile[] = content.nodes;
const index = indexSpecies(species);

function line(id: string): SpeciesLine {
  const found = species.find((s) => s.id === id);
  if (!found) throw new Error(`test fixture error: no species line "${id}"`);
  return found;
}

function stream(values: readonly number[]): RandomFn {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v ?? 0;
  };
}

function fresh(): SaveEnvelope {
  return newSave({ seed: balance.rng.defaultSeed, currentNode: "hearthollow", nodes }, balance);
}

function populatedSave(): SaveEnvelope {
  const cindril = line("cindril-line");
  const nibbin = line("nibbin-line");
  const vellsire = line("vellsire-line");
  const base = fresh();
  return {
    ...base,
    year: 3,
    tick: 7,
    money: 1240,
    items: { salve: 4, tonic: 1, "snare-weighted": 9 },
    questFlags: { firstSigns: true, silkDelivered: 3, ferryman: "wagered" },
    party: [
      newOwnedCreature(
        {
          uid: "p1",
          lineId: cindril.id,
          age: "A",
          level: 22,
          caughtYear: 1,
          traits: [balance.traits.pool[0] as never],
          nickname: "Ember",
          xp: 431.5,
          curHp: 58,
          relicSlot: "relic-antler",
        },
        cindril,
        balance,
      ),
      newOwnedCreature(
        { uid: "p2", lineId: vellsire.id, age: "E", level: 40, caughtYear: 3 },
        vellsire,
        balance,
      ),
    ],
    box: [
      newOwnedCreature(
        { uid: "b1", lineId: nibbin.id, age: "J", level: 6, caughtYear: 2, boxed: true },
        nibbin,
        balance,
      ),
    ],
    actionLog: [
      { seq: 0, year: 1, tick: 0, action: { t: "travel", to: "r1" } },
      { seq: 1, year: 1, tick: 1, action: { t: "foray", nodeId: "r1" } },
      { seq: 2, year: 1, tick: 2, action: { t: "catch", nodeId: "r1", lineId: "nibbin-line", uid: "b1" } },
    ],
    rngState: { battle: [1, 2, 3, 4], sim: [98765, 43210, 11, 0], encounter: [7] },
  };
}

describe("build-doc §7.8 — the save shape", () => {
  it("seeds a new game with a live copy of every node JSON", () => {
    const save = fresh();
    // The version has ONE home (INV-3 / D-A4-18): `balance.party.saveVersion`. Pinning the literal
    // here is what made a bump look like a test failure instead of a decision.
    expect(save.version).toBe(balance.party.saveVersion);
    expect(save.year).toBe(balance.clock.startYear);
    expect(save.tick).toBe(balance.clock.startTick);
    expect(Object.keys(save.nodeStates).sort()).toEqual(nodes.map((n) => n.id).sort());
    for (const node of nodes) {
      const state = save.nodeStates[node.id];
      expect(state).toBeDefined();
      expect(state?.floraStock).toBe(node.floraStock);
      expect(state?.recentDeaths).toBe(0);
      for (const [lineId, pop] of Object.entries(node.populations)) {
        expect(state?.populations[lineId]).toEqual(pop);
      }
    }
  });

  it("does not alias the shipped node JSON — catching cannot edit the content files", () => {
    const node = nodes.find((n) => Object.keys(n.populations).length > 0) as NodeFile;
    const lineId = Object.keys(node.populations)[0] as string;
    const before = node.populations[lineId]?.count as number;

    const save = fresh();
    const state = save.nodeStates[node.id];
    const pop = state?.populations[lineId];
    if (pop) pop.count = 0;

    expect(node.populations[lineId]?.count).toBe(before);
    expect(nodeStateFrom(node).populations[lineId]?.count).toBe(before);
  });

  it("numbers appended actions in order", () => {
    let save: SaveEnvelope = fresh();
    save = appendAction(save, { t: "travel", to: "r1" });
    save = appendAction(save, { t: "foray", nodeId: "r1" });
    expect(save.actionLog.map((e) => e.seq)).toEqual([0, 1]);
    expect(save.actionLog[0]?.year).toBe(balance.clock.startYear);
  });
});

describe("serialize / deserialize round-trip", () => {
  it("is lossless, including mid-run RNG stream state", () => {
    const save = populatedSave();
    const round = deserialize(serialize(save), balance);
    expect(round).toEqual(save);
    expect(round.rngState).toEqual(save.rngState);
    expect(round.rngState).not.toBe(save.rngState);
    // Re-serializing must reproduce the same bytes — no field lost, none invented.
    expect(serialize(round)).toBe(serialize(save));
  });

  it("round-trips a caught Ancient's never-retires sentinel", () => {
    const save = populatedSave();
    const ancient = save.party.find((c) => c.uid === "p2") as OwnedCreature;
    expect(ancient.yearsRemaining).toBe(Number.MAX_SAFE_INTEGER);
    expect(ancient.projectedRetirementYear).toBe(Number.MAX_SAFE_INTEGER);
    const round = deserialize(serialize(save), balance);
    const back = round.party.find((c) => c.uid === "p2") as OwnedCreature;
    expect(back.yearsRemaining).toBe(Number.MAX_SAFE_INTEGER);
    expect(back.projectedRetirementYear).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("is canonical: two equal saves built in different key orders serialize identically", () => {
    const a = populatedSave();
    const b: SaveEnvelope = {
      // deliberately different property insertion order
      actionLog: a.actionLog,
      nodeStates: a.nodeStates,
      questFlags: a.questFlags,
      items: a.items,
      money: a.money,
      box: a.box,
      party: a.party,
      currentNode: a.currentNode,
      tick: a.tick,
      year: a.year,
      seed: a.seed,
      version: a.version,
      rngState: a.rngState,
    };
    expect(serialize(b)).toBe(serialize(a));
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }));
  });

  it("drops undefined optionals rather than emitting nulls", () => {
    const json = serialize(fresh());
    expect(json).not.toContain("undefined");
    expect(JSON.parse(json)).not.toHaveProperty("rngState");
  });

  it("serializes a full save well inside the build-doc §12 budget", () => {
    const nibbin = line("nibbin-line");
    const heavy: SaveEnvelope = {
      ...populatedSave(),
      box: Array.from({ length: balance.party.maxBoxSize }, (_, i) =>
        newOwnedCreature(
          { uid: `b${i}`, lineId: nibbin.id, age: "A", level: 20, caughtYear: 2, boxed: true },
          nibbin,
          balance,
        ),
      ),
      actionLog: Array.from({ length: 500 }, (_, i) => ({
        seq: i,
        year: 1,
        tick: i % balance.clock.ticksPerYear,
        action: { t: "foray" as const, nodeId: "r1" },
      })),
    };
    const started = performance.now();
    const json = serialize(heavy);
    const elapsed = performance.now() - started;
    expect(json.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(balance.perf.saveSerializeBudgetMs);
  });
});

describe("build-doc §7.8 — version refusal", () => {
  it("refuses an older save with a message that says what to do", () => {
    const old = { ...populatedSave(), version: 0 } as unknown as SaveEnvelope;
    let thrown: unknown;
    try {
      deserialize(serialize(old), balance);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(SaveVersionError);
    const err = thrown as SaveVersionError;
    expect(err.found).toBe(0);
    expect(err.expected).toBe(balance.party.saveVersion);
    expect(err.message).toMatch(/v0/);
    expect(err.message).toContain(`v${String(balance.party.saveVersion)}`);
    expect(err.message.toLowerCase()).toMatch(/new game/);
  });

  /*
   * THE DEFECT THIS PINS. `story.actEntered` (core/acts.ts `ACT_ENTERED_FLAG`) is the latch that
   * says which acts a save has already entered. A save written before it existed has no latch, so
   * `lastActEntered` reads `first - 1` and the game re-enters acts 0..N on the first frame —
   * re-applying the act-4 Cullbrand raid on top of the harvest the old build already applied.
   * Measured on a v1-shaped mid-run save: r4 ashvole 3 → 0, cragmar 2 → 0, recentDeaths 19 → 24.
   * A new save and an old one are INDISTINGUISHABLE by questFlags (neither has the latch), so the
   * version is the only thing that can refuse one, and `party.saveVersion` had not been bumped.
   */
  it("BINDS — a save from before the act latch existed is refused, not silently re-entered", () => {
    expect(balance.party.saveVersion).toBeGreaterThan(1);
    const preActs = { ...populatedSave(), version: 1 } as unknown as SaveEnvelope;
    expect(preActs.questFlags[ACT_ENTERED_FLAG]).toBeUndefined();
    expect(() => deserialize(serialize(preActs), balance)).toThrow(SaveVersionError);
  });

  it("refuses a newer save too, instead of loading a shape it does not know", () => {
    const future = { ...populatedSave(), version: 99 } as unknown as SaveEnvelope;
    expect(() => deserialize(serialize(future), balance)).toThrow(SaveVersionError);
  });

  it("refuses data that is not a save", () => {
    expect(() => deserialize("not json", balance)).toThrow(SaveCorruptError);
    expect(() => deserialize("[]", balance)).toThrow(SaveCorruptError);
    expect(() => deserialize(JSON.stringify({ hello: 1 }), balance)).toThrow(SaveCorruptError);
  });

  it("refuses a save whose body fails the §7.8 schema", () => {
    const bad = JSON.parse(serialize(populatedSave())) as Record<string, unknown>;
    bad.party = [{ uid: "x" }];
    expect(() => deserialize(JSON.stringify(bad), balance)).toThrow(SaveCorruptError);
  });

  it("refuses a malformed rngState rather than silently dropping the stream", () => {
    const bad = JSON.parse(serialize(populatedSave())) as Record<string, unknown>;
    bad.rngState = { sim: ["not-a-number"] };
    expect(() => deserialize(JSON.stringify(bad), balance)).toThrow(SaveCorruptError);
  });
});

describe("L12 — slots, through an injected storage (L11)", () => {
  it("writes, reads back and deletes a slot", () => {
    const storage = new MemoryStorage();
    const save = populatedSave();
    writeSlot(storage, 1, save, balance);
    expect(storage.keys()).toEqual([slotKey(1)]);
    expect(readSlot(storage, 1, balance)).toEqual(save);
    expect(readSlot(storage, 0, balance)).toBeNull();
    deleteSlot(storage, 1, balance);
    expect(readSlot(storage, 1, balance)).toBeNull();
  });

  it("ships exactly the number of slots balance.json declares", () => {
    const storage = new MemoryStorage();
    const summaries = listSlots(storage, balance);
    expect(summaries).toHaveLength(balance.party.saveSlots);
    expect(() => writeSlot(storage, balance.party.saveSlots, populatedSave(), balance)).toThrow(
      SaveCorruptError,
    );
    expect(() => writeSlot(storage, -1, populatedSave(), balance)).toThrow(SaveCorruptError);
  });

  it("reports one unreadable slot without hiding the others", () => {
    const storage = new MemoryStorage();
    writeSlot(storage, 0, populatedSave(), balance);
    storage.setItem(slotKey(1), JSON.stringify({ ...populatedSave(), version: 0 }));
    const summaries = listSlots(storage, balance);
    expect(summaries[0]?.save).not.toBeNull();
    expect(summaries[0]?.error).toBeNull();
    expect(summaries[1]?.save).toBeNull();
    expect(summaries[1]?.error).toBeInstanceOf(SaveVersionError);
    expect(summaries[2]?.save).toBeNull();
    expect(summaries[2]?.error).toBeNull();
  });
});

describe("L11 — core/ is engine-agnostic", () => {
  const files = ["core/lifecycle.ts", "core/save.ts"];

  function code(path: string): string {
    return readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  }

  it.each(files)("%s touches no browser global and no ambient randomness", (path) => {
    const src = code(path);
    expect(src).not.toMatch(/\bwindow\b/);
    expect(src).not.toMatch(/\blocalStorage\b/);
    expect(src).not.toMatch(/\bdocument\b/);
    expect(src).not.toMatch(/\bnavigator\b/);
    // G11 — the seeded stream is the only source of randomness in the project.
    expect(src).not.toMatch(/Math\s*\.\s*random/);
  });

  it.each(files)("%s imports no engine", (path) => {
    expect(code(path)).not.toMatch(/from\s+["']phaser["']/);
  });
});

describe("build-doc §8.1 det_replay — (seed, actionLog) => the same final save", () => {
  function timeline(rng: RandomFn) {
    const cindril = line("cindril-line");
    const nibbin = line("nibbin-line");
    const initial: SaveEnvelope = {
      ...fresh(),
      party: [
        newOwnedCreature(
          {
            uid: "starter",
            lineId: cindril.id,
            age: "J",
            level: balance.xp.starterLevel,
            caughtYear: 1,
            traits: [balance.traits.pool[0] as never, balance.traits.pool[1] as never],
          },
          cindril,
          balance,
        ),
      ],
      box: [
        newOwnedCreature(
          {
            uid: "boxed",
            lineId: nibbin.id,
            age: "A",
            level: 12,
            caughtYear: 1,
            boxed: true,
            traits: [balance.traits.pool[2] as never],
          },
          nibbin,
          balance,
        ),
      ],
    };

    /*
     * The tape is kept IN the save, exactly as a running game keeps it. The previous version of
     * this helper renumbered every entry (`{ ...entry, seq: log.length }`) on its way into the log,
     * which repaired `yearTurnActions`'s output before asserting on it — and so hid that the
     * producer stamped `seq: 0` on every entry it made. `appendYearTurn` numbers and checks.
     */
    let save: SaveEnvelope = initial;
    while (save.year < balance.clock.yearsTotal) {
      const tickBefore = save.tick;
      const result = advanceYear(save, { species, balance, nodes, rng });
      save = appendYearTurn(result, tickBefore);
    }
    return { initial, live: save, log: save.actionLog };
  }

  const values = [0.31, 0.62, 0.17, 0.88, 0.45, 0.09, 0.73, 0.51];

  it("replays a log onto the initial save and reproduces it byte for byte", () => {
    const { initial, live, log } = timeline(stream(values));
    const a = replay(initial, log, { gyms: content.gyms, species, balance, nodes, rng: stream(values) });
    const b = replay(initial, log, { gyms: content.gyms, species, balance, nodes, rng: stream(values) });
    expect(serialize(a)).toBe(serialize(b));
    expect(serialize(a)).toBe(serialize(live));
  });

  it("numbers the live log the same way replay numbers it", () => {
    // build-doc §8.1's byte-identity is a claim about the actionLog too. A producer that stamps 0
    // on every entry makes a live save that can never equal its own replay.
    const { initial, live, log } = timeline(stream(values));
    expect(log.length).toBeGreaterThan(1);
    expect(log.map((e) => e.seq)).toEqual(log.map((_, i) => i));
    const replayed = replay(initial, log, { gyms: content.gyms, species, balance, nodes, rng: stream(values) });
    expect(replayed.actionLog.map((e) => e.seq)).toEqual(log.map((e) => e.seq));
  });

  it("interleaves with appendAction without colliding", () => {
    // A C6 caller appends travel/foray entries around the year turn's; both must number off the
    // same log.
    const { initial } = timeline(stream(values));
    let save: SaveEnvelope = appendAction(initial, { t: "travel", to: "r1" });
    save = appendAction(save, { t: "foray", nodeId: "r1" });
    const tickBefore = save.tick;
    const result = advanceYear(save, { species, balance, nodes, rng: stream(values) });
    save = appendYearTurn(result, tickBefore);
    save = appendAction(save, { t: "travel", to: "hearthollow" });
    expect(save.actionLog.map((e) => e.seq)).toEqual(save.actionLog.map((_, i) => i));
  });
});

describe("build-doc §8.1 — a mid-run save/load/continue matches an uninterrupted run", () => {
  /*
   * THE property the `rngState` field exists for. The save's determinism promise is about
   * (seed, actionLog), which only reconstructs a stream by replaying the whole log; a run continued
   * from a mid-run save has to pick its streams up where they were. The old test for this wrote the
   * year-1 INITIAL save to the slot and replayed the whole log onto it, which proves something
   * else entirely — so nothing noticed that `rngState` had no writer at all.
   */
  /*
   * Three creatures with two traits each, staggered so a retirement — and therefore an heir roll,
   * and therefore stream draws — happens in EVERY year, before and after the interruption. Without
   * draws on both sides of the save point the property below is vacuous: a stream that was never
   * advanced restores to the same place whether the state was stored or not.
   */
  function party() {
    const cindril = line("cindril-line");
    const nibbin = line("nibbin-line");
    const two = [balance.traits.pool[0] as never, balance.traits.pool[1] as never];
    return [
      newOwnedCreature(
        { uid: "elder", lineId: nibbin.id, age: "E", level: 20, caughtYear: 1, traits: two },
        nibbin,
        balance,
      ),
      newOwnedCreature(
        { uid: "adult", lineId: nibbin.id, age: "A", level: 16, caughtYear: 1, traits: two },
        nibbin,
        balance,
      ),
      newOwnedCreature(
        {
          uid: "starter",
          lineId: cindril.id,
          age: "J",
          level: balance.xp.starterLevel,
          caughtYear: 1,
          traits: two,
        },
        cindril,
        balance,
      ),
    ];
  }

  function start(): SaveEnvelope {
    return { ...fresh(), party: party() };
  }

  /** Wraps a stream so the test can see exactly which numbers a run consumed. */
  function recorder(stream: { nextFloat(): number }) {
    const seen: number[] = [];
    return {
      seen,
      fn: (): number => {
        const v = stream.nextFloat();
        seen.push(v);
        return v;
      },
    };
  }

  function runYears(save: SaveEnvelope, rng: RandomFn, years: number): SaveEnvelope {
    let current = save;
    for (let i = 0; i < years; i += 1) {
      const tickBefore = current.tick;
      current = appendYearTurn(advanceYear(current, { species, balance, nodes, rng }), tickBefore);
    }
    return current;
  }

  const totalYears = balance.clock.yearsTotal - 1;
  const beforeSave = 2;

  it("continues from a reloaded mid-run save to the same final save", () => {
    const uninterruptedStart = start();
    const uStreams = openStreams(uninterruptedStart, balance);
    const uRec = recorder(uStreams.sim as { nextFloat(): number });
    const uninterrupted = runYears(uninterruptedStart, uRec.fn, totalYears);

    const interruptedStart = start();
    const streams = openStreams(interruptedStart, balance);
    const rec1 = recorder(streams.sim as { nextFloat(): number });
    const mid = runYears(interruptedStart, rec1.fn, beforeSave);

    const storage = new MemoryStorage();
    writeSlot(storage, 0, mid, balance, streams);
    const reloaded = readSlot(storage, 0, balance) as SaveEnvelope;
    expect(reloaded.rngState).toBeDefined();

    const resumed = openStreams(reloaded, balance);
    const rec2 = recorder(resumed.sim as { nextFloat(): number });
    const continued = runYears(reloaded, rec2.fn, totalYears - beforeSave);

    // The interruption is real: both halves of the run consumed entropy.
    expect(rec1.seen.length).toBeGreaterThan(0);
    expect(rec2.seen.length).toBeGreaterThan(0);
    // The stream came back exactly where it left off — no number redrawn, none skipped.
    expect([...rec1.seen, ...rec2.seen]).toEqual(uRec.seen);
    // …and the state matches, with the stream snapshot itself included in the comparison.
    expect(serialize(withStreamState(continued, resumed))).toBe(
      serialize(withStreamState(uninterrupted, uStreams)),
    );
  });

  it("is not vacuous: without the stored stream state the continuation redraws", () => {
    const s = start();
    const streams = openStreams(s, balance);
    const rec1 = recorder(streams.sim as { nextFloat(): number });
    const mid = runYears(s, rec1.fn, beforeSave);
    expect(rec1.seen.length).toBeGreaterThan(0);

    const withState = openStreams({ ...mid, rngState: captureStreams(streams) }, balance);
    const recWith = recorder(withState.sim as { nextFloat(): number });
    runYears(mid, recWith.fn, totalYears - beforeSave);

    const withoutState = openStreams({ ...mid, rngState: undefined }, balance);
    const recWithout = recorder(withoutState.sim as { nextFloat(): number });
    runYears(mid, recWithout.fn, totalYears - beforeSave);

    expect(recWith.seen.length).toBeGreaterThan(0);
    expect(recWithout.seen).not.toEqual(recWith.seen);
    // A save with no stream state restarts at the top of the stream, replaying spent numbers.
    expect(recWithout.seen[0]).toBe(rec1.seen[0]);
    expect(recWith.seen[0]).not.toBe(rec1.seen[0]);
  });

  it("round-trips every subsystem stream position, not just the one that was used", () => {
    const s = start();
    const streams = openStreams(s, balance);
    for (const tag of balance.rng.subsystemTags) {
      const stream = streams[tag] as { nextFloat(): number } | undefined;
      expect(stream).toBeDefined();
      (stream as { nextFloat(): number }).nextFloat();
    }
    const storage = new MemoryStorage();
    writeSlot(storage, 0, s, balance, streams);
    const back = readSlot(storage, 0, balance) as SaveEnvelope;
    expect(Object.keys(back.rngState ?? {}).sort()).toEqual([...balance.rng.subsystemTags].sort());

    const reopened = openStreams(back, balance);
    for (const tag of balance.rng.subsystemTags) {
      const a = streams[tag] as { nextFloat(): number };
      const b = reopened[tag] as { nextFloat(): number };
      expect(b.nextFloat()).toBe(a.nextFloat());
    }
  });

  it("refuses replaying a mid-run save's own log onto itself", () => {
    // The obvious-looking "reload" that silently double-applied every catch in the log.
    const s = start();
    const streams = openStreams(s, balance);
    const mid = runYears(s, () => (streams.sim as { nextFloat(): number }).nextFloat(), 2);
    expect(mid.actionLog.length).toBeGreaterThan(0);
    expect(() => replay(mid, mid.actionLog, { gyms: content.gyms, species, balance, nodes })).toThrow(SaveCorruptError);
  });

  it("refuses it for a catch-only log too — the case that failed in silence", () => {
    /*
     * A log holding a retirement fails loudly whatever guards exist, and a log holding a year turn
     * now fails on its year. A log of nothing but catches used to replay clean and DOUBLE the
     * survey's population deltas — Hard Req 2 is that the survey shows real numbers.
     */
    let save: SaveEnvelope = fresh();
    const nodeId = "r1";
    const lineId = Object.keys(save.nodeStates[nodeId]?.populations ?? {})[0] as string;
    const before = save.nodeStates[nodeId]?.populations[lineId]?.count as number;

    // Catches applied at action time (build-doc §7.3) and logged, exactly as live play does it.
    for (let i = 0; i < 3; i += 1) {
      const state = save.nodeStates[nodeId] as NonNullable<(typeof save.nodeStates)[string]>;
      const pop = state.populations[lineId] as NonNullable<(typeof state.populations)[string]>;
      save = {
        ...appendAction(save, { t: "catch", nodeId, lineId, uid: `c${i}` }),
        nodeStates: {
          ...save.nodeStates,
          [nodeId]: {
            ...state,
            populations: { ...state.populations, [lineId]: { ...pop, count: pop.count - 1 } },
          },
        },
      };
    }
    expect(save.nodeStates[nodeId]?.populations[lineId]?.count).toBe(before - 3);
    expect(save.actionLog.every((e) => e.action.t === "catch")).toBe(true);
    expect(() => replay(save, save.actionLog, { gyms: content.gyms, species, balance, nodes })).toThrow(SaveCorruptError);
  });
});

describe("build-doc §8.1 det_replay — refusals", () => {
  function timeline(rng: RandomFn) {
    const cindril = line("cindril-line");
    const initial: SaveEnvelope = {
      ...fresh(),
      party: [
        newOwnedCreature(
          { uid: "starter", lineId: cindril.id, age: "J", level: balance.xp.starterLevel, caughtYear: 1 },
          cindril,
          balance,
        ),
      ],
    };
    let save: SaveEnvelope = initial;
    while (save.year < balance.clock.yearsTotal) {
      const tickBefore = save.tick;
      save = appendYearTurn(advanceYear(save, { species, balance, nodes, rng }), tickBefore);
    }
    return { initial, log: save.actionLog };
  }

  const values = [0.31, 0.62, 0.17, 0.88, 0.45, 0.09, 0.73, 0.51];

  it("refuses a year-turn entry that belongs to a different year", () => {
    // The sibling `retirement` branch already failed loud on a log that does not belong to the
    // save; the year turn used to derive the year itself and ignore what the log said.
    const initial = fresh();
    const log: ActionLogEntry[] = [
      { seq: 0, year: 1, tick: 0, action: { t: "yearTurn", year: 5 } },
    ];
    expect(() => replay(initial, log, { gyms: content.gyms, species, balance, nodes })).toThrow(SaveCorruptError);
    const good: ActionLogEntry[] = [
      { seq: 0, year: 1, tick: 0, action: { t: "yearTurn", year: initial.year + 1 } },
    ];
    expect(replay(initial, good, { gyms: content.gyms, species, balance, nodes }).year).toBe(initial.year + 1);
  });

  /*
   * L10, THE ACT HALF. `replay` had no `gymVictory` case, so the tape reproduced no badge, no act
   * and — since the Cullbrand raid moved off the calendar onto act entry (D-Q3-1) — no raid either.
   * Measured on a three-victory tape before the fix: live r4 ashvole 3 / cragmar 2 / recentDeaths 19
   * against replayed 14 / 10 / 0, with no badges and act 0. Before the raid moved it rode on the
   * `yearTurn` entry, which replay has always handled, so this was a REGRESSION in the one scripted
   * world event the game has.
   */
  it("BINDS — a gymVictory tape reproduces the badges, the acts AND the Cullbrand raid", () => {
    const ladder = [...content.gyms].sort((a, b) => a.act - b.act);
    const raid = balance.yearEvents.raids[0];
    expect(raid).toBeDefined();
    if (!raid) return;
    // Enough victories to enter the raid's act, exactly as the live path does it.
    const wins = ladder.filter((gym) => gym.act < raid.act);
    expect(wins.length).toBeGreaterThan(0);

    // LIVE: appendAction + awardBadge + enterPendingActs, the three calls OverworldScene.winGym makes.
    let live: SaveEnvelope = {
      ...fresh(),
      questFlags: { ...fresh().questFlags, "story.opening.done": true },
    };
    const initial: SaveEnvelope = { ...live, actionLog: [] };
    for (const gym of wins) {
      live = appendAction(live, { t: "gymVictory", gymId: gym.id });
      live = { ...live, ...awardBadge(live, gym.id, balance) };
      live = { ...live, ...enterPendingActs(live, { balance, gyms: content.gyms }).save };
    }
    const target = raid.targets[0];
    expect(target).toBeDefined();
    if (!target) return;
    const liveCount = live.nodeStates[raid.nodeId]?.populations[target.lineId]?.count;
    expect(liveCount).toBeLessThan(
      initial.nodeStates[raid.nodeId]?.populations[target.lineId]?.count ?? 0,
    );

    const replayed = replay(initial, live.actionLog, { gyms: content.gyms, species, balance, nodes });
    expect(replayed.nodeStates[raid.nodeId]?.populations[target.lineId]?.count).toBe(liveCount);
    expect(replayed.nodeStates[raid.nodeId]?.recentDeaths).toBe(live.nodeStates[raid.nodeId]?.recentDeaths);
    for (const gym of wins) expect(hasBadge(replayed, gym.id, balance)).toBe(true);
    expect(actOf(replayed, content.gyms, balance)).toBe(actOf(live, content.gyms, balance));
    // L10 in full: byte-identical, survey included.
    expect(serialize({ ...replayed, actionLog: [] })).toBe(serialize({ ...live, actionLog: [] }));
  });

  it("does not re-apply the raid when the same victory is replayed twice", () => {
    // `ACT_ENTERED_FLAG` is the latch on both paths; replay must lean on the same one live play does.
    const ladder = [...content.gyms].sort((a, b) => a.act - b.act);
    const raid = balance.yearEvents.raids[0];
    if (!raid) return;
    const wins = ladder.filter((gym) => gym.act < raid.act);
    const initial: SaveEnvelope = {
      ...fresh(),
      questFlags: { ...fresh().questFlags, "story.opening.done": true },
    };
    const log: ActionLogEntry[] = [
      ...wins.map((gym, i) => ({
        seq: i,
        year: 1,
        tick: 0,
        action: { t: "gymVictory" as const, gymId: gym.id },
      })),
      // The last victory logged a second time — a duplicated tape entry must not double-harvest.
      {
        seq: wins.length,
        year: 1,
        tick: 0,
        action: { t: "gymVictory" as const, gymId: (wins[wins.length - 1] as GymLeader).id },
      },
    ];
    const once = replay(initial, log.slice(0, wins.length), { gyms: content.gyms, species, balance, nodes });
    const twice = replay(initial, log, { gyms: content.gyms, species, balance, nodes });
    const target = raid.targets[0];
    if (!target) return;
    expect(twice.nodeStates[raid.nodeId]?.populations[target.lineId]?.count).toBe(
      once.nodeStates[raid.nodeId]?.populations[target.lineId]?.count,
    );
  });

  it("refuses a log whose numbering has a gap or a repeat", () => {
    const { initial, log } = timeline(stream(values));
    const gapped = log.map((e, i) => (i === 1 ? { ...e, seq: e.seq + 5 } : e));
    expect(() => replay(initial, gapped, { gyms: content.gyms, species, balance, nodes })).toThrow(SaveCorruptError);
  });

  it("refuses a catch or release naming a node or a line this save does not have", () => {
    const initial = fresh();
    const nodeId = "r1";
    const lineId = Object.keys(initial.nodeStates[nodeId]?.populations ?? {})[0] as string;
    expect(() =>
      replay(initial, [{ seq: 0, year: 1, tick: 0, action: { t: "catch", nodeId: "r99", lineId, uid: "x" } }], { gyms: content.gyms,
        species,
        balance,
        nodes,
      }),
    ).toThrow(SaveCorruptError);
    expect(() =>
      replay(
        initial,
        [{ seq: 0, year: 1, tick: 0, action: { t: "release", nodeId, lineId: "nibin-line", uid: "x" } }],
        { gyms: content.gyms, species, balance, nodes },
      ),
    ).toThrow(SaveCorruptError);
  });

  it("clamps catch at the same population floor the year turn's raid respects", () => {
    // Two floors for one quantity is a gameplay constant living in code (G11).
    const initial = fresh();
    const nodeId = "r1";
    const lineId = Object.keys(initial.nodeStates[nodeId]?.populations ?? {})[0] as string;
    const count = initial.nodeStates[nodeId]?.populations[lineId]?.count as number;
    const floor = Math.max(1, Math.floor(count / 2));
    const floored: Balance = { ...balance, ecosim: { ...balance.ecosim, populationFloor: floor } };
    const log: ActionLogEntry[] = Array.from({ length: count + 3 }, (_, i) => ({
      seq: i,
      year: 1,
      tick: 0,
      action: { t: "catch" as const, nodeId, lineId, uid: `c${i}` },
    }));
    const out = replay(initial, log, { gyms: content.gyms, species, balance: floored, nodes });
    expect(out.nodeStates[nodeId]?.populations[lineId]?.count).toBe(floor);
  });

  it("never hands the caller's live node state to the injected ecosim step", () => {
    // `EcosimStepFn` is free to mutate and return its argument; replay's purity must not depend on
    // which core/ecosim.ts does. `runYearTurn` already clones.
    const initial = fresh();
    const nodeId = "r1";
    const lineId = Object.keys(initial.nodeStates[nodeId]?.populations ?? {})[0] as string;
    const before = initial.nodeStates[nodeId]?.populations[lineId]?.count as number;
    const log: ActionLogEntry[] = [
      { seq: 0, year: 1, tick: 0, action: { t: "seasonStep", season: balance.clock.seasonOrder[0] as never } },
    ];
    const out = replay(initial, log, { gyms: content.gyms,
      species,
      balance,
      nodes,
      ecosimStep: (_id, state) => {
        for (const key of Object.keys(state.populations)) {
          const pop = state.populations[key];
          if (pop) pop.count = 0; // in place, then returns its argument — legal under the type
        }
        return state;
      },
    });
    expect(out.nodeStates[nodeId]?.populations[lineId]?.count).toBe(0);
    expect(initial.nodeStates[nodeId]?.populations[lineId]?.count).toBe(before);
  });
});

describe("build-doc §8.1 det_replay — the rest", () => {
  function timeline(rng: RandomFn) {
    const cindril = line("cindril-line");
    const nibbin = line("nibbin-line");
    const initial: SaveEnvelope = {
      ...fresh(),
      party: [
        newOwnedCreature(
          {
            uid: "starter",
            lineId: cindril.id,
            age: "J",
            level: balance.xp.starterLevel,
            caughtYear: 1,
            traits: [balance.traits.pool[0] as never, balance.traits.pool[1] as never],
          },
          cindril,
          balance,
        ),
      ],
      box: [
        newOwnedCreature(
          { uid: "boxed", lineId: nibbin.id, age: "A", level: 12, caughtYear: 1, boxed: true, traits: [balance.traits.pool[2] as never] },
          nibbin,
          balance,
        ),
      ],
    };
    let save: SaveEnvelope = initial;
    while (save.year < balance.clock.yearsTotal) {
      const tickBefore = save.tick;
      save = appendYearTurn(advanceYear(save, { species, balance, nodes, rng }), tickBefore);
    }
    return { initial, live: save, log: save.actionLog };
  }

  const values = [0.31, 0.62, 0.17, 0.88, 0.45, 0.09, 0.73, 0.51];

  it("reaches the logged save whatever the stream says — the log fixes every choice", () => {
    const { initial, live, log } = timeline(stream(values));
    const b = replay(initial, log, { gyms: content.gyms,
      species,
      balance,
      nodes,
      rng: stream([0.99, 0.01, 0.5, 0.02, 0.97]),
    });
    // A replay is a replay: the logged choices decide, not the stream. (Feeding the stream anyway
    // is what keeps its POSITION aligned with the live run — see ReplayDeps.rng.)
    expect(serialize(b)).toBe(serialize(live));
  });

  it("is not vacuous: LIVE play does depend on the stream", () => {
    // If the heir roll ignored its stream, det_replay would pass for the wrong reason. Two live
    // runs down different streams must be able to reach different saves.
    const a = timeline(stream(values));
    const b = timeline(stream([0.99, 0.02, 0.97, 0.04]));
    expect(serialize(a.live)).not.toBe(serialize(b.live));
  });

  it("refuses a log whose retirement does not belong to this save", () => {
    const { initial } = timeline(stream(values));
    const bogus: ActionLogEntry[] = [
      {
        seq: 0,
        year: 1,
        tick: 0,
        action: {
          t: "retirement",
          choice: { kind: "boon", parentUid: "nobody", targetUid: "starter", stat: "atk" },
        },
      },
    ];
    expect(() => replay(initial, bogus, { gyms: content.gyms, species, balance, nodes })).toThrow(SaveCorruptError);
  });

  it("applies the catch/release population delta build-doc §7.3 attributes to the action", () => {
    const initial = fresh();
    const nodeId = "r1";
    const lineId = Object.keys(initial.nodeStates[nodeId]?.populations ?? {})[0] as string;
    const before = initial.nodeStates[nodeId]?.populations[lineId]?.count as number;
    const log: ActionLogEntry[] = [
      { seq: 0, year: 1, tick: 0, action: { t: "catch", nodeId, lineId, uid: "c1" } },
      { seq: 1, year: 1, tick: 1, action: { t: "catch", nodeId, lineId, uid: "c2" } },
      { seq: 2, year: 1, tick: 2, action: { t: "release", nodeId, lineId, uid: "c1" } },
    ];
    const out = replay(initial, log, { gyms: content.gyms, species, balance, nodes });
    expect(out.nodeStates[nodeId]?.populations[lineId]?.count).toBe(before - 1);
    expect(out.actionLog).toHaveLength(3);
    // The initial save is never mutated.
    expect(initial.nodeStates[nodeId]?.populations[lineId]?.count).toBe(before);
  });

  it("hands actions it does not own to the injected reducer", () => {
    const initial = fresh();
    const seen: string[] = [];
    const log: ActionLogEntry[] = [
      { seq: 0, year: 1, tick: 0, action: { t: "travel", to: "r1" } },
      { seq: 1, year: 1, tick: 1, action: { t: "inn", townId: "hearthollow" } },
    ];
    const out = replay(initial, log, { gyms: content.gyms,
      species,
      balance,
      nodes,
      applyOther: (save, entry) => {
        seen.push(entry.action.t);
        return save;
      },
    });
    expect(seen).toEqual(["travel", "inn"]);
    expect(out.actionLog).toHaveLength(2);
  });
});

describe("the legacy beat survives a save/load", () => {
  it("keeps the heir, its inherited traits and its relic slot across a round-trip", () => {
    const cindril = line("cindril-line");
    let save: SaveFile = {
      ...fresh(),
      party: [
        newOwnedCreature(
          {
            uid: "starter",
            lineId: cindril.id,
            age: "J",
            level: balance.xp.starterLevel,
            caughtYear: 1,
            traits: [balance.traits.pool[0] as never, balance.traits.pool[1] as never],
          },
          cindril,
          balance,
        ),
      ],
    };
    const rng = stream([0.4, 0.8, 0.2, 0.6]);
    while (save.year < balance.clock.yearsTotal) {
      save = advanceYear(save, { species, balance, nodes, rng }).save;
    }
    const heir = save.party[0] as OwnedCreature;
    expect(heir.uid).not.toBe("starter");

    const storage = new MemoryStorage();
    writeSlot(storage, 2, save as SaveEnvelope, balance);
    const back = readSlot(storage, 2, balance) as SaveEnvelope;
    expect(back.party[0]).toEqual(heir);
    expect(indexSpecies(species).has((back.party[0] as OwnedCreature).lineId)).toBe(true);
    expect(index.has(heir.lineId)).toBe(true);
  });
});

describe("the save version has exactly one home (G11 / INV-3)", () => {
  it("stamps a new save with the version balance.json declares", () => {
    expect(newSave({ seed: 1, currentNode: "hearthollow", nodes }, balance).version).toBe(
      saveVersionOf(balance),
    );
  });

  it("can load the save its own new game wrote after a version bump", () => {
    /*
     * `newSave` used to hard-code `version: 1` while `deserialize` compared against
     * `balance.party.saveVersion`, so bumping the balance value made every new save immediately
     * unloadable — a balance.json edit bricking the game, which is exactly what INV-3 forbids.
     */
    const bumped: Balance = {
      ...balance,
      party: { ...balance.party, saveVersion: balance.party.saveVersion + 1 },
    };
    const save = newSave({ seed: 7, currentNode: "hearthollow", nodes }, bumped);
    expect(save.version).toBe(bumped.party.saveVersion);
    const round = deserialize(serialize(save), bumped);
    expect(round.version).toBe(bumped.party.saveVersion);
    expect(serialize(round)).toBe(serialize(save));

    // …and the older build still refuses it, loudly.
    expect(() => deserialize(serialize(save), balance)).toThrow(SaveVersionError);
  });
});

describe("the action log is a gapless sequence from 0", () => {
  it("refuses to append entries that do not continue the log", () => {
    const save = fresh();
    const bad: ActionLogEntry[] = [{ seq: 3, year: 1, tick: 0, action: { t: "travel", to: "r1" } }];
    expect(() => appendEntries(save, bad)).toThrow(SaveCorruptError);
    const good: ActionLogEntry[] = [{ seq: 0, year: 1, tick: 0, action: { t: "travel", to: "r1" } }];
    expect(appendEntries(save, good).actionLog.map((e) => e.seq)).toEqual([0]);
  });

  it("numbers a year turn's own tape off the save it came from", () => {
    let save: SaveEnvelope = { ...fresh(), party: [] };
    save = appendAction(save, { t: "travel", to: "r1" });
    const tickBefore = save.tick;
    const result = advanceYear(save, { species, balance, nodes, rng: stream([0.5]) });
    const entries = yearTurnActions(result, tickBefore);
    expect(entries[0]?.seq).toBe(1);
    expect(entries.map((e) => e.seq)).toEqual(entries.map((_, i) => i + 1));
  });
});
