/**
 * game/ledger-history.ts — the readings behind the ledger's `seasons` column.
 *
 * **The defect this closes.** `game/ledger-view.ts` has carried `sampleNodeState` / `recordSample`
 * and a documented caller contract ("whoever runs the season step records a sample") since it was
 * written, and nothing in the running game ever called either. The only launcher opened
 * `LedgerScene` with no `histories`, so every row on every screen rendered one number and `net —`
 * forever: the ledger showed a population's instantaneous count and never showed it MOVING, which
 * is the one thing the cascade beat is about.
 *
 * **Why the readings are observed here and not taken by the scene that steps the season.**
 * `core/ecosim.ts` steps the region in two different places (the overworld's season boundary and
 * the year turn's fourth season, build-doc §7.5 step 5), and a screen that depends on both of them
 * remembering to call something is a screen that goes blank the day a third caller appears. Every
 * one of those paths ends at the same statement — `registry.setSave`, "the single place the running
 * game adopts one" — so that is where a reading is taken. Nothing else has to know this file exists.
 *
 * **What a reading is, and what it is not.** It is a copy of the counts in `save.nodeStates` at the
 * moment the save's `{year, season}` changed. It is NOT a re-simulation: this module never steps
 * anything, never projects, and never fills a gap it did not observe. A run loaded from a slot
 * starts with one reading and grows a trend as its seasons pass, which is why `LedgerRow.delta` is
 * `null` — rendered `net —` — until there is an earlier reading to subtract. A fabricated slope
 * would be a second sim disagreeing with the first one.
 *
 * Zero Phaser imports: the store is plain state, and `tests/unit/ledger-view.test.ts` drives it
 * headlessly with the same calls the registry makes.
 */

import { seasonAt } from "../core/clock";
import type { Balance, NodeState, Season } from "../core/types";
import { recordSample, sampleNodeState, type LedgerHistory } from "./ledger-view";

/** The slice of a save a reading needs. Structural, so a test can drive it without a whole save. */
export interface ObservableSave {
  year: number;
  tick: number;
  nodeStates: Readonly<Record<string, NodeState>>;
}

/** `{year, season}` as one comparable value — what decides whether a reading is a NEW one. */
function stampOf(year: number, season: Season): string {
  return `${year}/${season}`;
}

class LedgerHistoryStore {
  /**
   * ONE record object for the lifetime of the store, with the per-node arrays replaced inside it.
   * `LedgerScene` is handed this object once and re-reads it on every redraw, so replacing the
   * object here would freeze the scene's trend at whatever it held when the menu was opened.
   */
  readonly #histories: Record<string, LedgerHistory> = {};
  #stamp: string | null = null;

  /** The live record, for `LedgerSceneData.histories`. Never copied — see above. */
  histories(): Readonly<Record<string, LedgerHistory>> {
    return this.#histories;
  }

  /** One node's readings, oldest first. Empty until a season has been observed. */
  historyFor(nodeId: string): LedgerHistory {
    return this.#histories[nodeId] ?? [];
  }

  /** The `{year, season}` the newest reading was taken at, or null before the first one. */
  stamp(): string | null {
    return this.#stamp;
  }

  /**
   * Take a reading if this save stands in a season no reading has been taken in yet.
   *
   * Idempotent within a season, which is what makes it safe to call from `setSave`: a catch, a
   * travel and a battle all adopt a new save without advancing the calendar, and none of them adds
   * a reading. `buildLedgerPage` then REPLACES the newest reading with the live count whenever the
   * two carry the same stamp — so a catch shows up in the trend's last number immediately, and the
   * season's opening number is not overwritten by it. Returns whether a reading was taken.
   */
  observe(save: ObservableSave, balance: Balance): boolean {
    const season = seasonAt(save.tick, balance);
    const stamp = stampOf(save.year, season);
    if (stamp === this.#stamp) return false;
    for (const nodeId of Object.keys(save.nodeStates)) {
      const state = save.nodeStates[nodeId];
      if (!state) continue;
      this.#histories[nodeId] = recordSample(
        this.#histories[nodeId] ?? [],
        sampleNodeState(state, save.year, season),
        balance,
      );
    }
    this.#stamp = stamp;
    return true;
  }

  /**
   * Forget everything. A different slot is a different run, and carrying one run's readings into
   * another would draw a trend out of two unrelated ecologies.
   */
  clear(): void {
    for (const nodeId of Object.keys(this.#histories)) delete this.#histories[nodeId];
    this.#stamp = null;
  }
}

/** The one store. Import this; do not build another. */
export const ledgerHistory = new LedgerHistoryStore();
