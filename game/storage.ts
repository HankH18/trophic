/**
 * game/storage.ts — the browser half of the save (locked decision L12, build-doc §7.8).
 *
 * `core/save.ts` is engine-agnostic by design (L11): it knows the save SHAPE, the version rule and
 * the slot keys, and it takes a `StorageLike` rather than reaching for `window`. This module is the
 * other half — the only file in the project that touches `localStorage` — and its whole job is to
 * make the three ways browser storage fails survivable:
 *
 *   • **It is not there.** Safari's private mode throws on the mere ACCESS of `localStorage`, and an
 *     embedded webview may not expose it at all. Reading it inside a `try` and falling back to
 *     `MemoryStorage` means the game boots and plays; it simply cannot persist, and it says so.
 *   • **It is full.** `setItem` throws `QuotaExceededError`. A save that throws out of a menu
 *     handler unwinds into Phaser's event emitter and takes the scene with it — the black screen.
 *     So writes return a result object; they do not throw.
 *   • **It is garbage.** Another tab, an older build, a hand-edited value. `core/save.ts` already
 *     refuses a bad version (`SaveVersionError`) and a bad shape (`SaveCorruptError`); this module
 *     turns each into a sentence a player can read, per slot, so ONE bad slot cannot hide the other
 *     two or stop the title screen from drawing.
 *
 * Guardrail G7 applies to every string below: they report what happened, in numbers where there are
 * numbers. None of them lecture.
 */

import {
  MemoryStorage,
  SAVE_KEY_PREFIX,
  SaveCorruptError,
  SaveVersionError,
  deleteSlot,
  listSlots,
  writeSlot,
  type RngStreams,
  type SaveEnvelope,
  type StorageLike,
} from "@core/save";
import type { Balance } from "@core/types";

import { DEFAULT_SETTINGS, isTextSpeed, type Settings } from "./registry";

/* ────────────────────────────────────────────────────────────────────────────
 * Getting at localStorage without letting it take the boot down
 * ──────────────────────────────────────────────────────────────────────────── */

/** Keys this module owns, all under the same namespace `core/save.ts` already established. */
export const SETTINGS_KEY = `${SAVE_KEY_PREFIX.split(".")[0] ?? "trophic"}.settings`;

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function ambientLocalStorage(): WebStorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: WebStorageLike | null }).localStorage;
    if (!ls) return null;
    // The ACCESS is what throws in a locked-down context, and a read is enough to find out. A probe
    // WRITE is deliberately not used: it fails when storage is merely full, and falling back to
    // memory then would hide save files that are perfectly readable.
    ls.getItem(`${SAVE_KEY_PREFIX}.probe`);
    return ls;
  } catch {
    return null;
  }
}

/**
 * A `StorageLike` whose reads and deletes cannot throw. Writes are left to throw so the caller can
 * tell a full disk from a successful save — `SaveStorage.write` is the one that catches.
 */
class GuardedStorage implements StorageLike {
  readonly #inner: WebStorageLike;

  constructor(inner: WebStorageLike) {
    this.#inner = inner;
  }

  getItem(key: string): string | null {
    try {
      return this.#inner.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    this.#inner.setItem(key, value);
  }

  removeItem(key: string): void {
    try {
      this.#inner.removeItem(key);
    } catch {
      /* a delete that cannot happen is not worth a crash */
    }
  }
}

export interface BrowserStorage {
  storage: StorageLike;
  /** false when `localStorage` was unavailable and this run is memory-only. */
  persistent: boolean;
  /** Player-facing explanation when `persistent` is false; null otherwise. */
  message: string | null;
}

/**
 * The storage the game should use. Never throws, always returns something usable.
 */
export function openBrowserStorage(): BrowserStorage {
  const ls = ambientLocalStorage();
  if (!ls) {
    return {
      storage: new MemoryStorage(),
      persistent: false,
      message:
        "Browser storage is unavailable, so this session cannot be saved. " +
        "Private browsing usually causes this.",
    };
  }
  return { storage: new GuardedStorage(ls), persistent: true, message: null };
}

/** Convenience for callers that only want the adapter. */
export function browserStorage(): StorageLike {
  return openBrowserStorage().storage;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Failure classification
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * DOM quota signatures. `22` and `1014` are `DOMException` codes (the legacy numeric form Safari and
 * Firefox still report), not gameplay constants — they name an error, they tune nothing.
 */
const QUOTA_NAMES = new Set(["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"]);
const QUOTA_CODES = new Set([22, 1014]);

export function isQuotaError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; code?: unknown };
  if (typeof e.name === "string" && QUOTA_NAMES.has(e.name)) return true;
  return typeof e.code === "number" && QUOTA_CODES.has(e.code);
}

export type WriteFailure = "quota" | "unknown";

export interface WriteResult {
  ok: boolean;
  reason: WriteFailure | null;
  /** Player-facing sentence on failure; null on success. */
  message: string | null;
}

const WRITE_OK: WriteResult = { ok: true, reason: null, message: null };

function writeFailure(err: unknown, what: string): WriteResult {
  if (isQuotaError(err)) {
    return {
      ok: false,
      reason: "quota",
      message: `${what} failed: browser storage is full. Delete a save slot and try again.`,
    };
  }
  const detail = err instanceof Error ? err.message : String(err);
  return { ok: false, reason: "unknown", message: `${what} failed: ${detail}` };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Slots (L12 — 3 of them, and the count comes from balance.json)
 * ──────────────────────────────────────────────────────────────────────────── */

export type SlotState = "empty" | "ok" | "unreadable";

/** Why a slot is unreadable — the menu greys "continue" on any of these, and says which. */
export type SlotProblem = "version" | "corrupt" | "unknown";

export interface SlotStatus {
  slot: number;
  state: SlotState;
  save: SaveEnvelope | null;
  problem: SlotProblem | null;
  /** One readable line: the summary when readable, the reason when not. */
  message: string;
}

/** Human slot number for UI (slot 0 reads as "SLOT 1"). */
export function slotLabel(slot: number): string {
  return `SLOT ${slot + 1}`;
}

function describe(save: SaveEnvelope): string {
  const party = save.party.length;
  const box = save.box.length;
  return `Year ${save.year} · tick ${save.tick} · ${save.currentNode} · party ${party} · box ${box}`;
}

/**
 * Why a slot could not be read, as a sentence that NAMES THE SLOT.
 *
 * The label is not decoration. The title screen lists every unreadable slot at once, and this build
 * has three of them; without the label a player with two bad slots reads two sentences that identify
 * nothing and cannot tell which save is which. Write and delete failures have always carried
 * `slotLabel(slot)` (see {@link writeFailure}'s callers) — read failures now match, from the same
 * helper, so the two cannot drift apart.
 */
function problemOf(slot: number, err: Error): { problem: SlotProblem; message: string } {
  const label = slotLabel(slot);
  if (err instanceof SaveVersionError) {
    // core/save.ts already writes a complete sentence carrying both version numbers.
    return { problem: "version", message: `${label}: ${err.message}` };
  }
  if (err instanceof SaveCorruptError) {
    return {
      problem: "corrupt",
      message: `${label} could not be read (${err.message.split("\n")[0] ?? "unreadable"}).`,
    };
  }
  return { problem: "unknown", message: `${label} could not be read: ${err.message}` };
}

/**
 * The save slots, as the menus see them.
 *
 * Every method is total: nothing here throws for a reason a player can cause. A slot that cannot be
 * read comes back as a `SlotStatus` describing why.
 */
export class SaveStorage {
  readonly storage: StorageLike;
  readonly #balance: Balance;

  constructor(storage: StorageLike, balance: Balance) {
    this.storage = storage;
    this.#balance = balance;
  }

  /** build-doc §3 L12 — 3 slots, read from `balance.party.saveSlots`, never a literal. */
  get slotCount(): number {
    return this.#balance.party.saveSlots;
  }

  slots(): SlotStatus[] {
    return listSlots(this.storage, this.#balance).map((summary): SlotStatus => {
      if (summary.error) {
        const { problem, message } = problemOf(summary.slot, summary.error);
        return { slot: summary.slot, state: "unreadable", save: null, problem, message };
      }
      if (!summary.save) {
        return { slot: summary.slot, state: "empty", save: null, problem: null, message: "EMPTY" };
      }
      return {
        slot: summary.slot,
        state: "ok",
        save: summary.save,
        problem: null,
        message: describe(summary.save),
      };
    });
  }

  read(slot: number): SlotStatus {
    const found = this.slots().find((s) => s.slot === slot);
    if (found) return found;
    return {
      slot,
      state: "unreadable",
      save: null,
      problem: "unknown",
      message: `${slotLabel(slot)} is outside this build's ${this.slotCount} slots.`,
    };
  }

  hasAnyReadable(): boolean {
    return this.slots().some((s) => s.state === "ok");
  }

  /**
   * Persist a save. Pass the live `streams` for any mid-run save: without them a continued run
   * resumes at draw zero of every RNG stream and diverges from the run that wrote the file
   * (build-doc §8.1).
   */
  write(slot: number, save: SaveEnvelope, streams?: RngStreams): WriteResult {
    try {
      writeSlot(this.storage, slot, save, this.#balance, streams);
      return WRITE_OK;
    } catch (err) {
      return writeFailure(err, `Saving to ${slotLabel(slot)}`);
    }
  }

  remove(slot: number): WriteResult {
    try {
      deleteSlot(this.storage, slot, this.#balance);
      return WRITE_OK;
    } catch (err) {
      return writeFailure(err, `Deleting ${slotLabel(slot)}`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Settings (bible §12 plumbing)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Settings live in their own key, NOT in the save file: build-doc §7.8 fixes the save's fields, they
 * are per-device rather than per-run, and a corrupt settings blob must not be able to make a slot
 * unreadable. Anything unrecognised falls back to the default rather than failing.
 */
export function loadSettings(storage: StorageLike): Settings {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (raw === null) return { ...DEFAULT_SETTINGS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_SETTINGS };
  }
  const speed = (parsed as { textSpeed?: unknown }).textSpeed;
  return { textSpeed: isTextSpeed(speed) ? speed : DEFAULT_SETTINGS.textSpeed };
}

export function saveSettings(storage: StorageLike, settings: Settings): WriteResult {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return WRITE_OK;
  } catch (err) {
    return writeFailure(err, "Saving settings");
  }
}
