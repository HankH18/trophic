/**
 * tests/unit/battle-dialogue.test.ts — the third selector, and the invariants that make it honest.
 *
 * ⚠ WHAT THIS FILE IS EVIDENCE OF. `core/dialogue-schema.ts` declares three battle kinds and, until
 * `battleEntryFor` existed, NOTHING IN `game/` ever asked for one: 35 entries and 70 lines had no
 * path to the screen, and the three strings appeared outside `data/dialogue.json` exactly once — in
 * the kind enum itself. The dialogue suite was 87 tests green throughout, because it only ever asked
 * `selectEntry` directly. Selecting an entry in a TEST is not a selector in the GAME, so the
 * end-to-end half of this repair lives in `tests/unit/overworld-scene.test.ts` §10.6, which drives
 * the real scene. What is proven HERE is the seam itself and the corpus-shaped invariants around it.
 */

import { describe, expect, it } from "vitest";

import {
  DIALOGUE,
  DIALOGUE_KINDS,
  FIRST_YEAR,
  type DialogueContext,
  type DialogueEntry,
  type FlagValue,
} from "@core/dialogue-schema";
import { seasonOf } from "@core/clock";
import { validateContent } from "@core/schemas";
import { BATTLE_KINDS, battleEntryFor, battleOutcomeKind, TALK_KINDS, AUTOPLAY_KINDS } from "@game/dialogue-runner";

const content = validateContent();
const balance = content.balance;

const ctxAt = (act: number, flags: Record<string, FlagValue> = {}): DialogueContext => ({
  act,
  year: FIRST_YEAR,
  season: seasonOf({ year: FIRST_YEAR, tick: balance.clock.startTick, subTick: 0 }, balance),
  flags,
  populations: {},
  floraStock: {},
});

const battleEntries = DIALOGUE.entries.filter((e) => BATTLE_KINDS.includes(e.kind));

describe("BATTLE_KINDS is the third selector surface, and it is disjoint from the other two", () => {
  it("covers every battle kind the schema declares, and nothing else", () => {
    expect([...BATTLE_KINDS].sort()).toEqual(DIALOGUE_KINDS.filter((k) => k.startsWith("battle-")).sort());
  });

  it("does not overlap the interact key or the autoplay list", () => {
    /*
     * A `battle-pre` reachable from [E] is a pre-fight speech with no fight after it, and a
     * `battle-win` in the autoplay list would congratulate the player on walking into a room. The
     * three lists partition the kinds a speaker can carry.
     */
    for (const kind of BATTLE_KINDS) {
      expect(TALK_KINDS, `${kind} is walked by the interact key`).not.toContain(kind);
      expect(AUTOPLAY_KINDS, `${kind} plays itself on arrival`).not.toContain(kind);
    }
  });

  it("refuses a kind that is not a battle kind, rather than quietly answering it", () => {
    expect(() => battleEntryFor(DIALOGUE, "maren", "hearthollow", "greeting", ctxAt(1))).toThrow(/battle kind/);
  });

  it("names the kind a finished fight asks for, in both directions", () => {
    expect(battleOutcomeKind(true)).toBe("battle-win");
    expect(battleOutcomeKind(false)).toBe("battle-loss");
  });
});

describe("every fighter the corpus writes for is answerable through the selector", () => {
  /** Every (speaker, node) pair that carries a battle entry — read off the corpus, not typed in. */
  const fighters = [...new Set(battleEntries.map((e) => `${e.speaker}|${e.node}`))].map((k) => {
    const [speaker, node] = k.split("|") as [string, string];
    return { speaker, node };
  });

  /**
   * Every fighter a battle selector can be CALLED with — `data/gyms.json` `gyms[]` ∪ `rival[]`.
   *
   * Read off content rather than off the corpus, because the corpus is the thing under test: a
   * fighter the game asks about and the corpus has nothing for is invisible to any census that
   * starts from `DIALOGUE.entries`, and that is precisely what shipped.
   */
  const askable = [
    ...content.gyms.map((g) => ({ speaker: g.id, node: g.town })),
    ...content.rival.map((r) => ({ speaker: r.id, node: r.node })),
  ];

  it("finds the fighters it is guarding", () => {
    // Six leaders + six rival encounters. If this ever shrinks, the corpus lost a fight.
    expect(fighters.length).toBeGreaterThanOrEqual(11);
    /*
     * ⚠ WAS `toBe(35)`, A SNAPSHOT OF A CORPUS WITH A HOLE IN IT.
     *
     * 35 is 12 fighters × 3 battle kinds MINUS the `greaves|sanctum battle-loss` that did not
     * exist — so the count froze the defect as the contract. Worse, a bare total fires identically
     * for "a fight was lost" and "a fighter is missing a kind", and the cheapest way to answer it
     * is to bump the number, which is how the Greaves hole survived. The count is now DERIVED from
     * the selector domain, so it is the coverage invariant and not a tally: adding a fighter moves
     * it on its own, and removing one line of any fighter's three still fails.
     */
    expect(battleEntries.length).toBe(askable.length * 3);
  });

  it("every battle-pre resolves at the act it belongs to, with nothing set", () => {
    for (const e of battleEntries.filter((x) => x.kind === "battle-pre")) {
      const act = e.when?.actMin ?? balance.acts.first;
      expect(battleEntryFor(DIALOGUE, e.speaker, e.node, "battle-pre", ctxAt(act)), e.id).toBeDefined();
    }
  });

  it("every fighter with a pre has a win, and the selector returns it", () => {
    for (const { speaker, node } of fighters) {
      const pre = battleEntryFor(DIALOGUE, speaker, node, "battle-pre", ctxAt(balance.acts.last));
      if (!pre) continue;
      const win = battleEntryFor(DIALOGUE, speaker, node, "battle-win", ctxAt(balance.acts.last));
      expect(win, `${speaker} at ${node} can be beaten and says nothing`).toBeDefined();
    }
  });

  /**
   * THE SIBLING THAT DID NOT EXIST, AND THE HOLE WAS EXACTLY ITS SHAPE.
   *
   * The win-coverage check above shipped without a loss-coverage twin and with no comment saying
   * why, so `greaves|sanctum` — the run's final fight, on the never-cut finale — carried a
   * `battle-pre` and a `battle-win` and no `battle-loss` while the suite stayed green. Losing there
   * reached `playBattleOutcome` → `battleEntryFor(…, "battle-loss", …)` → `undefined` →
   * `flashBanner("greaves — no battle-loss at sanctum")`, the same channel as "dialogue refused: …".
   *
   * A loss is not an edge case at a gym: `greaves.finale.pre` carries
   * `flagsUnset: ["story.greaves.beaten"]`, i.e. the fight is deliberately retryable, which means
   * losing it is a DESIGNED outcome that has to have a line.
   *
   * Driven through the real selector, not by reading the corpus — `battleEntryFor` is a strict
   * (speaker, node, kind) match with no fallback, so only a call proves the answer exists.
   */
  it("every fighter with a pre has a LOSS too, and the selector returns it", () => {
    const silent: string[] = [];
    for (const { speaker, node } of fighters) {
      const pre = battleEntryFor(DIALOGUE, speaker, node, "battle-pre", ctxAt(balance.acts.last));
      if (!pre) continue;
      const loss = battleEntryFor(DIALOGUE, speaker, node, "battle-loss", ctxAt(balance.acts.last));
      if (!loss) silent.push(`${speaker} at ${node}`);
    }
    expect(
      silent,
      `these fighters can BEAT the player and say nothing — the player gets OverworldScene's ` +
        `"<speaker> — no battle-loss at <node>" banner instead: ${silent.join(", ")}`,
    ).toEqual([]);
  });

  /**
   * …and the same question asked from the SELECTOR's side rather than the corpus's.
   *
   * `fighters` is derived from entries that exist, so it can only ever check fighters the corpus
   * already knows about. A fighter in `gyms[]`/`rival[]` with NO battle entries at all would be
   * absent from that list and every assertion above would pass over it in silence.
   */
  it("every fighter the GAME can ask about answers all three battle kinds", () => {
    const holes: string[] = [];
    for (const { speaker, node } of askable) {
      for (const kind of BATTLE_KINDS) {
        const found = battleEntryFor(DIALOGUE, speaker, node, kind, ctxAt(balance.acts.last));
        if (!found) holes.push(`${speaker}@${node} ${kind}`);
      }
    }
    expect(holes, holes.join(", ")).toEqual([]);
  });
});

describe("B15 — a battle-win never records a player LOSS, and a battle-loss never records a win", () => {
  /*
   * THE BUG THIS IS FOR. `wick.act1.win` — kind `battle-win`, which everywhere else in the corpus
   * means the PLAYER won (`maribel.post.win` writes `gym.maribel.beaten`) — used to write
   * `rival.act1.result: "loss"`, and `wick.act1.loss` wrote `"win"`. All six acts were inverted.
   * It was invisible because every one of those keys was in the write-only set: nothing read them.
   * The rename to `playerResult` is what makes the field's subject unambiguous, and this is the
   * check that keeps it that way while H3 wires a reader.
   */
  const valuesOf = (e: DialogueEntry): string[] =>
    [e.setFlags ?? {}, ...(e.choices ?? []).map((c) => c.setFlags ?? {})]
      .flatMap((bag) => Object.values(bag))
      .filter((v): v is string => typeof v === "string");

  it("finds the entries it is guarding", () => {
    expect(battleEntries.filter((e) => valuesOf(e).length > 0).length).toBeGreaterThanOrEqual(12);
  });

  it("no battle-win entry writes the string \"loss\", and no battle-loss writes \"win\"", () => {
    const wrong: string[] = [];
    for (const e of battleEntries) {
      if (e.kind === "battle-win" && valuesOf(e).includes("loss")) wrong.push(`${e.id} records "loss"`);
      if (e.kind === "battle-loss" && valuesOf(e).includes("win")) wrong.push(`${e.id} records "win"`);
    }
    expect(wrong, wrong.join("; ")).toEqual([]);
  });

  it("BINDS — the inverted corpus this repair removed is still caught", () => {
    const inverted: DialogueEntry = {
      id: "sabotage.win",
      speaker: "wick",
      node: "r1",
      kind: "battle-win",
      lines: [{ text: "x" }],
      setFlags: { "rival.act1.playerResult": "loss" },
    };
    expect(valuesOf(inverted)).toContain("loss");
  });

  it("the rival's record is written on BOTH branches, so a reader can trust its absence", () => {
    for (let act = 1; act <= balance.acts.last; act += 1) {
      const win = DIALOGUE.entries.find((e) => e.id === `wick.act${String(act)}.win`);
      const loss = DIALOGUE.entries.find((e) => e.id === `wick.act${String(act)}.loss`);
      expect(win?.setFlags?.[`rival.act${String(act)}.playerResult`], `act ${String(act)} win`).toBe("win");
      expect(loss?.setFlags?.[`rival.act${String(act)}.playerResult`], `act ${String(act)} loss`).toBe("loss");
    }
  });

  it("B6 — only the WIN closes the encounter, so the rematch the loss line promises exists", () => {
    for (let act = 1; act <= balance.acts.last; act += 1) {
      const key = `rival.act${String(act)}.fought`;
      const win = DIALOGUE.entries.find((e) => e.id === `wick.act${String(act)}.win`);
      const loss = DIALOGUE.entries.find((e) => e.id === `wick.act${String(act)}.loss`);
      expect(win?.setFlags?.[key], `act ${String(act)} win must close the encounter`).toBe(true);
      expect(loss?.setFlags?.[key], `act ${String(act)} loss must NOT close the encounter`).toBeUndefined();
      // …and the pre-battle entry really is gated on that key, or "closes it" means nothing.
      const pre = DIALOGUE.entries.find((e) => e.id === `wick.act${String(act)}.pre`);
      expect(pre?.when?.flagsUnset).toContain(key);
    }
  });
});

describe("H3 — the condition surface a population-gated rival line needs already resolves", () => {
  /*
   * H3 wants one population-gated `battle-pre` VARIANT per act at priority 81, over the
   * unconditional base at 80, plus an act-6 branch keyed on the player's own record. The LINES are
   * the prose lane's; what has to be true before they are written is that `battleEntryFor` picks a
   * higher-priority variant when its clause holds and falls back to the base when it does not, and
   * that a `flagEquals` on `rival.act<N>.playerResult` resolves at all. Both are proven here against
   * a corpus assembled from the shipped one, so the prose lane can write into a surface that works
   * rather than discover it does not.
   */
  const base = DIALOGUE.entries.find((e) => e.id === "wick.act1.pre")!;
  const withEntries = (extra: DialogueEntry[]): typeof DIALOGUE => ({
    speakers: DIALOGUE.speakers,
    entries: [...DIALOGUE.entries, ...extra],
  });

  it("a population-gated variant at 81 wins when the count is down, and yields when it is not", () => {
    const variant: DialogueEntry = {
      ...base,
      id: "probe.wick.act1.pre.thin",
      priority: 81,
      when: {
        ...base.when,
        population: [{ node: "r1", lineId: "nibbin-line", op: "lte", value: 4 }],
      },
    };
    const file = withEntries([variant]);
    const thin: DialogueContext = { ...ctxAt(1), populations: { r1: { "nibbin-line": 3 } } };
    const full: DialogueContext = { ...ctxAt(1), populations: { r1: { "nibbin-line": 30 } } };
    expect(battleEntryFor(file, "wick", "r1", "battle-pre", thin)?.id).toBe("probe.wick.act1.pre.thin");
    expect(battleEntryFor(file, "wick", "r1", "battle-pre", full)?.id).toBe("wick.act1.pre");
    // …and the base is still reachable when the world is not being read at all.
    expect(battleEntryFor(file, "wick", "r1", "battle-pre", ctxAt(1))?.id).toBe("wick.act1.pre");
  });

  it("a variant keyed on the player's own record resolves — 'five for five' can be made true", () => {
    const boast: DialogueEntry = {
      ...base,
      id: "probe.wick.act5.pre.fivefive",
      node: "r5",
      priority: 81,
      when: {
        actMin: 5,
        flagsUnset: ["rival.act5.fought"],
        flagEquals: [{ key: "rival.act4.playerResult", value: "loss" }],
      },
    };
    const file = withEntries([boast]);
    const beaten = ctxAt(5, { "rival.act4.playerResult": "loss" });
    const notBeaten = ctxAt(5, { "rival.act4.playerResult": "win" });
    expect(battleEntryFor(file, "wick", "r5", "battle-pre", beaten)?.id).toBe("probe.wick.act5.pre.fivefive");
    expect(battleEntryFor(file, "wick", "r5", "battle-pre", notBeaten)?.id).toBe("wick.act5.pre");
  });
});
