/**
 * game/registry.ts — the one typed holder for state every scene needs.
 *
 * Phaser hands you `game.registry`, an untyped `DataManager` keyed by string. Used directly it
 * becomes exactly the grab-bag of globals this file exists to prevent: three scenes each inventing
 * a key, two of them spelling it differently, and no compiler anywhere with an opinion. So the
 * shared state lives here, typed, behind accessors that fail with a sentence instead of `undefined`.
 *
 * Two rules this file holds to:
 *
 *   • ZERO Phaser imports. Locked decision L11 protects `core/`, not `game/`, but a state holder
 *     with no engine dependency is testable headlessly and cannot drag a scene's lifetime into the
 *     data model. Nothing here needs Phaser.
 *   • ONE copy of every fact. The clock is DERIVED from the save's `{year, tick}` (build-doc §7.8)
 *     rather than stored beside it — a second copy is a second thing to keep in sync, and
 *     integration defect I4 is what that costs. Same for the balance, which is read off `content`.
 */

import { actOf, nodeUnlockedAt, runIsComplete, unlockedNodeIds } from "@core/acts";
import type { ClockState } from "@core/clock";
import type { EventWindow } from "@core/regional-events";
import { activeWindows } from "@core/regional-events";
import { indexSpecies, type SpeciesIndex } from "@core/lifecycle";
import type { RngStreams, SaveEnvelope, StorageLike } from "@core/save";
import type { Balance, Content, GymLeader, NodeFile, SpeciesLine } from "@core/types";
import { ledgerHistory } from "./ledger-history";

/* ────────────────────────────────────────────────────────────────────────────
 * Settings (bible §12 "Plumbing: save slots …, settings, text-speed")
 * ──────────────────────────────────────────────────────────────────────────── */

export const TEXT_SPEEDS = ["slow", "normal", "fast", "instant"] as const;
export type TextSpeed = (typeof TEXT_SPEEDS)[number];

/**
 * Characters per second for the message crawl. `instant` is 0, meaning "no crawl — print the line".
 *
 * These are NOT gameplay constants and deliberately do not live in `data/balance.json`: guardrail
 * G11 governs tunables that change how the GAME behaves (damage, breed rates, catch odds), and a
 * retune of balance must not be able to change how fast text draws, nor the reverse. Nothing in
 * `core/` reads them. If a later lane wants them player-visible as numbers, they belong in a
 * settings file of their own, not in balance.
 */
export const TEXT_SPEED_CPS: Record<TextSpeed, number> = {
  slow: 15,
  normal: 30,
  fast: 60,
  instant: 0,
};

export interface Settings {
  textSpeed: TextSpeed;
}

export const DEFAULT_SETTINGS: Settings = { textSpeed: "normal" };

export function isTextSpeed(value: unknown): value is TextSpeed {
  return typeof value === "string" && (TEXT_SPEEDS as readonly string[]).includes(value);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The running game
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One run in progress: which slot it is bound to, the live save, and the RNG streams positioned
 * where that save left them (core/save.ts `openStreams`).
 *
 * `streams` rides with the save on purpose. A run that reloads without them resumes at draw zero of
 * every stream and diverges from the run that wrote the save — build-doc §8.1, and the reason
 * `writeSlot` takes them.
 */
export interface Session {
  slot: number;
  save: SaveEnvelope;
  streams: RngStreams;
}

class RegistryUnsetError extends Error {
  constructor(what: string, fix: string) {
    super(`game registry: ${what} has not been set yet — ${fix}`);
    this.name = "RegistryUnsetError";
  }
}

class GameRegistry {
  #content: Content | null = null;
  #storage: StorageLike | null = null;
  #settings: Settings = { ...DEFAULT_SETTINGS };
  #session: Session | null = null;
  #speciesIndex: SpeciesIndex | null = null;
  #nodesById: Map<string, NodeFile> | null = null;
  #gymsById: Map<string, GymLeader> | null = null;

  /* ── content (set once, by the boot scene, after validateContent()) ────── */

  setContent(content: Content): void {
    this.#content = content;
    this.#speciesIndex = null;
    this.#nodesById = null;
    this.#gymsById = null;
  }

  contentOrNull(): Content | null {
    return this.#content;
  }

  content(): Content {
    if (!this.#content) {
      throw new RegistryUnsetError("content", "BootScene must run validateContent() first");
    }
    return this.#content;
  }

  /** The tunables. Read off `content` so there is one Balance object in the process, not two. */
  balance(): Balance {
    return this.content().balance;
  }

  speciesIndex(): SpeciesIndex {
    if (!this.#speciesIndex) this.#speciesIndex = indexSpecies(this.content().species);
    return this.#speciesIndex;
  }

  speciesById(lineId: string): SpeciesLine | undefined {
    return this.speciesIndex().get(lineId);
  }

  nodeById(nodeId: string): NodeFile | undefined {
    if (!this.#nodesById) {
      this.#nodesById = new Map(this.content().nodes.map((n) => [n.id, n]));
    }
    return this.#nodesById.get(nodeId);
  }

  gymById(gymId: string): GymLeader | undefined {
    if (!this.#gymsById) {
      this.#gymsById = new Map(this.content().gyms.map((g) => [g.id, g]));
    }
    return this.#gymsById.get(gymId);
  }

  /* ── storage + settings ───────────────────────────────────────────────── */

  setStorage(storage: StorageLike): void {
    this.#storage = storage;
  }

  storage(): StorageLike {
    if (!this.#storage) {
      throw new RegistryUnsetError("storage", "BootScene must install browserStorage() first");
    }
    return this.#storage;
  }

  settings(): Settings {
    return this.#settings;
  }

  setSettings(settings: Settings): void {
    this.#settings = { ...settings };
  }

  /* ── the run ──────────────────────────────────────────────────────────── */

  startSession(session: Session): void {
    this.#session = { ...session };
    // A different slot is a different ecology, so the ledger's readings start over with this run's
    // opening season as its first one (game/ledger-history.ts).
    ledgerHistory.clear();
    this.#observeForLedger(session.save);
  }

  endSession(): void {
    this.#session = null;
    ledgerHistory.clear();
  }

  sessionOrNull(): Session | null {
    return this.#session;
  }

  hasSession(): boolean {
    return this.#session !== null;
  }

  session(): Session {
    if (!this.#session) {
      throw new RegistryUnsetError("session", "start a new game or continue a slot first");
    }
    return this.#session;
  }

  save(): SaveEnvelope {
    return this.session().save;
  }

  /**
   * Replace the live save. Every mutation in `core/` is pure — it hands back a NEW save — so this is
   * the single place the running game adopts one, and the only place to look when a number on
   * screen disagrees with the ledger.
   */
  setSave(save: SaveEnvelope): void {
    this.#session = { ...this.session(), save };
    this.#observeForLedger(save);
  }

  /**
   * Take the ledger's reading of this save, if its season is one no reading has been taken in.
   *
   * It hangs off `setSave` because `setSave` is the single place the running game adopts a save —
   * which makes it the single place a season change can be noticed, whichever scene caused it (the
   * overworld's season boundary and the year turn's fourth season step are two different callers,
   * build-doc §7.5 step 5). Idempotent within a season, so ordinary saves cost nothing. The store
   * holds no gameplay state: it is a record of readings the ledger's trend column draws, and a run
   * with no readings yet draws one number and `net —` rather than a fabricated slope.
   */
  #observeForLedger(save: SaveEnvelope): void {
    // `balance()` throws before BootScene has validated content; a reading is not worth a crash.
    const balance = this.#content?.balance;
    if (balance) ledgerHistory.observe(save, balance);
  }

  streams(): RngStreams {
    return this.session().streams;
  }

  /** build-doc §7.8 — the clock IS the save's `{year, tick}`. Derived, never stored twice. */
  clock(): ClockState {
    const save = this.save();
    return { year: save.year, tick: save.tick };
  }

  /**
   * THE OTHER CLOCK (D-Q3-1) — the act, derived from the save's badges and quest flags.
   *
   * Derived for exactly the reason {@link clock} is: a second copy is a second thing to keep in
   * sync, and integration defect I4 is what that costs. Scenes READ this; none of them computes an
   * act, and none of them may reach for `save.year` to answer a story question. The two clocks meet
   * nowhere — this method takes no year and `clock()` takes no act.
   */
  act(): number {
    return actOf(this.save(), this.content().gyms, this.balance());
  }

  /** The nodes the act model has opened. Cumulative — reaching act 4 does not close act 1's. */
  unlockedNodes(): string[] {
    return unlockedNodeIds(this.act(), this.balance());
  }

  /** True when `nodeId` is open at the save's current act. */
  nodeUnlocked(nodeId: string): boolean {
    return nodeUnlockedAt(nodeId, this.act(), this.balance());
  }

  /**
   * The run's final beat is behind the player — an ACT condition, never a date.
   *
   * There is no calendar equivalent to ask: the year is unbounded and a save in year 20 with one
   * badge is a legal, supported game in progress.
   */
  runComplete(): boolean {
    return runIsComplete(this.save(), this.balance());
  }

  /** bible §9's regional events open right now, each a `ticksPerSeason` window (D-Q2-2). */
  openEvents(): EventWindow[] {
    const save = this.save();
    const content = this.content();
    return activeWindows(
      save,
      this.clock(),
      { species: content.species, nodeStates: save.nodeStates },
      content.balance,
    );
  }

  /** Drop everything. Tests and "back to title" both need it; nothing else should call it. */
  reset(): void {
    ledgerHistory.clear();
    this.#content = null;
    this.#storage = null;
    this.#settings = { ...DEFAULT_SETTINGS };
    this.#session = null;
    this.#speciesIndex = null;
    this.#nodesById = null;
    this.#gymsById = null;
  }
}

/** The one holder. Import this; do not build another. */
export const registry = new GameRegistry();
