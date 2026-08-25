/**
 * tests/unit/game-storage.test.ts — the browser save adapter (build-doc §3 L12, §7.8).
 *
 * `core/save.ts` is already covered by tests/unit/save.test.ts. What is NOT covered there is the
 * thing that only exists in a browser: `localStorage` refusing to behave. Every assertion below is
 * about a way real storage fails and what the game must do instead of dying:
 *
 *   • a save must survive a round trip through the ACTUAL Web Storage interface (a fake that
 *     implements it, since vitest runs in `environment: "node"` and there is no jsdom in the tree);
 *   • an older save version, and a newer one, must be REFUSED with a message that names both
 *     numbers — build-doc §7.8, "refuse older versions with a clear message";
 *   • corrupt JSON in one slot must not take the other two down, and must not throw;
 *   • a quota error must come back as a result, not as an exception thrown through a menu handler —
 *     that is the difference between "could not save" and a black screen;
 *   • storage that throws on access at all (private browsing) must fall back to memory and say so.
 *
 * Everything is exercised against the SHIPPED content: the balance drives the slot count and the
 * save version, and the saves under test are real `newSave` output over the real node files.
 */

import { afterEach, describe, expect, it } from "vitest";

import { validateContent } from "../../core/schemas";
import {
  MemoryStorage,
  SAVE_KEY_PREFIX,
  newSave,
  openStreams,
  serialize,
  slotKey,
  type SaveEnvelope,
} from "../../core/save";
import type { Balance, Content } from "../../core/types";
import {
  SETTINGS_KEY,
  SaveStorage,
  browserStorage,
  isQuotaError,
  loadSettings,
  openBrowserStorage,
  saveSettings,
  slotLabel,
} from "../../game/storage";
import { DEFAULT_SETTINGS } from "../../game/registry";

const content: Content = validateContent();
const balance: Balance = content.balance;

/* ────────────────────────────────────────────────────────────────────────────
 * A fake that implements the real Web Storage interface
 * ──────────────────────────────────────────────────────────────────────────── */

class QuotaExceeded extends Error {
  readonly code = 22;
  constructor() {
    super("The quota has been exceeded.");
    this.name = "QuotaExceededError";
  }
}

/**
 * The `Storage` surface as browsers expose it — `length`, `key()`, `clear()` included, so the
 * adapter is exercised against the shape it will really be handed rather than a three-method stub.
 */
class FakeLocalStorage {
  #map = new Map<string, string>();
  /** Total characters allowed across all values; Infinity = unlimited. */
  quotaChars = Number.POSITIVE_INFINITY;
  /** When true, every operation throws the way a locked-down context does. */
  locked = false;

  get length(): number {
    this.#guard();
    return this.#map.size;
  }

  key(index: number): string | null {
    this.#guard();
    return [...this.#map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    this.#guard();
    return this.#map.has(key) ? (this.#map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.#guard();
    const next = new Map(this.#map);
    next.set(key, value);
    let used = 0;
    for (const v of next.values()) used += v.length;
    if (used > this.quotaChars) throw new QuotaExceeded();
    this.#map = next;
  }

  removeItem(key: string): void {
    this.#guard();
    this.#map.delete(key);
  }

  clear(): void {
    this.#guard();
    this.#map.clear();
  }

  /** Test affordance: plant a raw string without going through the adapter. */
  plant(key: string, value: string): void {
    this.#map.set(key, value);
  }

  #guard(): void {
    if (this.locked) throw new Error("SecurityError: access to storage is not allowed");
  }
}

function withAmbientLocalStorage<T>(fake: FakeLocalStorage | null, fn: () => T): T {
  const holder = globalThis as { localStorage?: unknown };
  const had = "localStorage" in holder;
  const previous = holder.localStorage;
  if (fake) holder.localStorage = fake;
  else delete holder.localStorage;
  try {
    return fn();
  } finally {
    if (had) holder.localStorage = previous;
    else delete holder.localStorage;
  }
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

function freshSave(seed = balance.rng.defaultSeed): SaveEnvelope {
  const first = content.nodes[0];
  if (!first) throw new Error("shipped content has no nodes");
  return newSave({ seed, currentNode: first.id, nodes: content.nodes }, balance);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Round trip
 * ──────────────────────────────────────────────────────────────────────────── */

describe("SaveStorage round-trips through the real localStorage interface", () => {
  it("writes and reads a save back byte-identically", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      const save = freshSave();

      expect(store.write(0, save)).toMatchObject({ ok: true, reason: null });

      // It really went through the Web Storage API, under core/save.ts's own key.
      expect(fake.length).toBe(1);
      expect(fake.key(0)).toBe(slotKey(0));

      const status = store.read(0);
      expect(status.state).toBe("ok");
      expect(status.problem).toBeNull();
      expect(serialize(status.save as SaveEnvelope)).toBe(serialize(save));
    });
  });

  it("carries the RNG stream positions of a mid-run save (build-doc §8.1)", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      const save = freshSave();
      const streams = openStreams(save, balance);

      // Spend some draws, the way a played run would.
      const tag = balance.rng.subsystemTags[0] as string;
      const stream = streams[tag];
      expect(stream).toBeDefined();
      for (let i = 0; i < 5; i += 1) stream?.nextFloat();
      const expected = stream?.save();

      expect(store.write(1, save, streams).ok).toBe(true);
      const back = store.read(1).save as SaveEnvelope;
      expect(back.rngState?.[tag]).toEqual([expected?.x, expected?.y, expected?.z, expected?.w]);

      // …and reopening from the stored save resumes at exactly that position.
      const reopened = openStreams(back, balance);
      expect(reopened[tag]?.save()).toEqual(expected);
    });
  });

  it("reports every slot the build has, from balance.party.saveSlots", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      expect(store.slotCount).toBe(balance.party.saveSlots);
      expect(store.slots().map((s) => s.slot)).toEqual(
        Array.from({ length: balance.party.saveSlots }, (_, i) => i),
      );
      expect(store.slots().every((s) => s.state === "empty")).toBe(true);
      expect(store.hasAnyReadable()).toBe(false);
    });
  });

  /**
   * G11 / INV-3, bound rather than asserted.
   *
   * Comparing `store.slotCount` to `balance.party.saveSlots` proves nothing on its own: on the
   * shipped balance both are 3, so `return 3;` passes it (measured — the C1 audit's sabotage sweep
   * did exactly that and the file stayed green). The repo's `no_magic_numbers` gate does not reach
   * here either; it walks `core/` only. RETUNING the number is the test that can tell the difference.
   */
  it("a retune of balance.party.saveSlots moves the slot list — the number is not a literal", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      for (const saveSlots of [1, 2, 5]) {
        const retuned: Balance = { ...balance, party: { ...balance.party, saveSlots } };
        const store = new SaveStorage(browserStorage(), retuned);
        expect(store.slotCount, `saveSlots ${saveSlots}`).toBe(saveSlots);
        expect(store.slots()).toHaveLength(saveSlots);
        expect(store.slots().map((s) => s.slot)).toEqual(
          Array.from({ length: saveSlots }, (_, i) => i),
        );
        // …and the range check moves with it, rather than staying pinned to three.
        expect(store.read(saveSlots).state).toBe("unreadable");
        expect(store.read(saveSlots).message).toContain(String(saveSlots));
      }
    });
  });

  it("a retune of balance.party.saveVersion is what the version refusal reads", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const bumped: Balance = {
        ...balance,
        party: { ...balance.party, saveVersion: balance.party.saveVersion + 7 },
      };
      // Written by a build whose balance says v(n+7) — `newSave` stamps the version from the same
      // balance the store was handed, which is the ONE home for it (integration defect I6).
      const future = freshSave();
      expect(newSave({ seed: 1, currentNode: future.currentNode, nodes: content.nodes }, bumped).version)
        .toBe(balance.party.saveVersion + 7);
      expect(
        new SaveStorage(browserStorage(), bumped).write(
          0,
          newSave({ seed: 1, currentNode: future.currentNode, nodes: content.nodes }, bumped),
        ).ok,
      ).toBe(true);
      // …and refused by this one, naming both numbers.
      const status = new SaveStorage(browserStorage(), balance).read(0);
      expect(status.problem).toBe("version");
      expect(status.message).toContain(`v${balance.party.saveVersion + 7}`);
      expect(status.message).toContain(`v${balance.party.saveVersion}`);
    });
  });

  it("the settings key is derived from core/save.ts's namespace, not spelled out again", () => {
    expect(SETTINGS_KEY.startsWith(`${SAVE_KEY_PREFIX.split(".")[0] ?? ""}.`)).toBe(true);
    expect(SETTINGS_KEY).not.toBe(SAVE_KEY_PREFIX);
    for (let slot = 0; slot < balance.party.saveSlots; slot += 1) {
      expect(SETTINGS_KEY).not.toBe(slotKey(slot));
    }
  });

  it("deletes a slot without touching its neighbours", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      expect(store.write(0, freshSave()).ok).toBe(true);
      expect(store.write(2, freshSave()).ok).toBe(true);

      expect(store.remove(0).ok).toBe(true);
      const states = store.slots().map((s) => s.state);
      expect(states[0]).toBe("empty");
      expect(states[2]).toBe("ok");
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Refusing a save this build cannot read (build-doc §7.8)
 * ──────────────────────────────────────────────────────────────────────────── */

describe("version refusal", () => {
  it("refuses an OLDER save with a message naming both versions", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const expected = balance.party.saveVersion;
      const older = { ...freshSave(), version: expected - 1 };
      fake.plant(slotKey(0), JSON.stringify(older));

      const status = new SaveStorage(browserStorage(), balance).read(0);
      expect(status.state).toBe("unreadable");
      expect(status.problem).toBe("version");
      expect(status.save).toBeNull();
      expect(status.message).toContain(`v${expected - 1}`);
      expect(status.message).toContain(`v${expected}`);
    });
  });

  it("refuses a NEWER save just as loudly", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const expected = balance.party.saveVersion;
      fake.plant(slotKey(1), JSON.stringify({ ...freshSave(), version: expected + 1 }));

      const status = new SaveStorage(browserStorage(), balance).read(1);
      expect(status.problem).toBe("version");
      expect(status.message).toContain(`v${expected + 1}`);
    });
  });

  it("a refused slot never counts as continuable", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      fake.plant(
        slotKey(0),
        JSON.stringify({ ...freshSave(), version: balance.party.saveVersion - 1 }),
      );
      expect(new SaveStorage(browserStorage(), balance).hasAnyReadable()).toBe(false);
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Corruption
 * ──────────────────────────────────────────────────────────────────────────── */

describe("corrupt data does not take the game down", () => {
  it.each([
    ["truncated JSON", "{\"version\":1,\"seed\":"],
    ["not an object", "\"just a string\""],
    ["an array", "[1,2,3]"],
    ["empty", ""],
    ["a save with no version", JSON.stringify({ seed: 1, year: 1 })],
    ["a save with the wrong shape", JSON.stringify({ version: 1, seed: "not a number" })],
  ])("%s reads as unreadable rather than throwing", (_label, raw) => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      fake.plant(slotKey(0), raw);
      const store = new SaveStorage(browserStorage(), balance);
      expect(() => store.slots()).not.toThrow();
      const status = store.read(0);
      expect(status.state).toBe("unreadable");
      expect(status.save).toBeNull();
      expect(status.message.length).toBeGreaterThan(0);
    });
  });

  /**
   * The title screen prints every unreadable slot at once. A message that does not name its slot
   * makes two bad saves read as two identical sentences identifying nothing — reproduced by the C1
   * audit with three corrupt slots — while every WRITE and DELETE failure in this same file has
   * always carried `slotLabel()`. One rule, applied to both.
   */
  it("every unreadable-slot message names its slot, whatever went wrong", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      fake.plant(slotKey(0), "{ not json at all");
      fake.plant(slotKey(1), JSON.stringify({ ...freshSave(), version: balance.party.saveVersion + 98 }));
      fake.plant(slotKey(2), JSON.stringify({ version: balance.party.saveVersion, seed: "nope" }));

      const store = new SaveStorage(browserStorage(), balance);
      const unreadable = store.slots().filter((s) => s.state === "unreadable");
      expect(unreadable).toHaveLength(3);

      const messages = unreadable.map((s) => s.message);
      for (const status of unreadable) {
        expect(status.message, `slot ${status.slot}`).toContain(slotLabel(status.slot));
        // …and it names ONLY its own slot, so a reader cannot mistake which save is meant.
        for (const other of unreadable) {
          if (other.slot === status.slot) continue;
          expect(status.message).not.toContain(slotLabel(other.slot));
        }
      }
      // No two of them are the same sentence.
      expect(new Set(messages).size).toBe(messages.length);

      // The out-of-range answer uses the same label, not a second spelling of "slot n".
      expect(store.read(balance.party.saveSlots).message).toContain(
        slotLabel(balance.party.saveSlots),
      );
    });
  });

  it("one corrupt slot cannot hide the other two", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      expect(store.write(1, freshSave()).ok).toBe(true);
      fake.plant(slotKey(0), "{ this is not json");

      const slots = store.slots();
      expect(slots[0]?.state).toBe("unreadable");
      expect(slots[1]?.state).toBe("ok");
      expect(slots[2]?.state).toBe("empty");
      expect(store.hasAnyReadable()).toBe(true);
    });
  });

  it("a corrupt slot can be cleared and rewritten", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      fake.plant(slotKey(2), "{ nope");
      expect(store.remove(2).ok).toBe(true);
      expect(store.read(2).state).toBe("empty");
      expect(store.write(2, freshSave()).ok).toBe(true);
      expect(store.read(2).state).toBe("ok");
    });
  });

  it("a slot outside the build's range answers instead of throwing", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      const status = store.read(balance.party.saveSlots + 4);
      expect(status.state).toBe("unreadable");
      expect(status.message).toContain(String(balance.party.saveSlots));
      expect(store.write(balance.party.saveSlots + 4, freshSave()).ok).toBe(false);
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Quota
 * ──────────────────────────────────────────────────────────────────────────── */

describe("quota", () => {
  it("recognises the shapes browsers actually throw", () => {
    expect(isQuotaError(new QuotaExceeded())).toBe(true);
    expect(isQuotaError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaError({ code: 1014 })).toBe(true);
    expect(isQuotaError(new Error("disk on fire"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });

  it("a full store returns a failure result instead of throwing", () => {
    const fake = new FakeLocalStorage();
    fake.quotaChars = 32; // far smaller than any real save
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      let result: ReturnType<SaveStorage["write"]> | null = null;
      expect(() => {
        result = store.write(0, freshSave());
      }).not.toThrow();

      expect(result).not.toBeNull();
      const written = result as unknown as { ok: boolean; reason: string | null; message: string };
      expect(written.ok).toBe(false);
      expect(written.reason).toBe("quota");
      expect(written.message).toContain(slotLabel(0));
      // Nothing was half-written.
      expect(store.read(0).state).toBe("empty");
    });
  });

  it("a quota failure leaves an existing save readable", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      expect(store.write(0, freshSave()).ok).toBe(true);
      const before = serialize(store.read(0).save as SaveEnvelope);

      fake.quotaChars = before.length; // room for what is there, none for a second slot
      expect(store.write(1, freshSave()).ok).toBe(false);
      expect(serialize(store.read(0).save as SaveEnvelope)).toBe(before);
    });
  });

  it("settings hitting the quota fail as a result, not an exception", () => {
    const fake = new FakeLocalStorage();
    fake.quotaChars = 1;
    withAmbientLocalStorage(fake, () => {
      const result = saveSettings(browserStorage(), { textSpeed: "fast" });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("quota");
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Storage that is not there at all
 * ──────────────────────────────────────────────────────────────────────────── */

describe("unavailable storage", () => {
  it("falls back to memory, says so, and still plays", () => {
    withAmbientLocalStorage(null, () => {
      const opened = openBrowserStorage();
      expect(opened.persistent).toBe(false);
      expect(opened.message).toBeTruthy();
      expect(opened.storage).toBeInstanceOf(MemoryStorage);

      // The fallback is a working store — the run is playable, just not persistent.
      const store = new SaveStorage(opened.storage, balance);
      expect(store.write(0, freshSave()).ok).toBe(true);
      expect(store.read(0).state).toBe("ok");
    });
  });

  it("storage that throws on access falls back rather than propagating", () => {
    const fake = new FakeLocalStorage();
    fake.locked = true;
    withAmbientLocalStorage(fake, () => {
      const opened = openBrowserStorage();
      expect(opened.persistent).toBe(false);
      expect(opened.storage).toBeInstanceOf(MemoryStorage);
    });
  });

  it("storage that starts throwing mid-run degrades to empty reads, not a crash", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const store = new SaveStorage(browserStorage(), balance);
      expect(store.write(0, freshSave()).ok).toBe(true);
      fake.locked = true;
      expect(() => store.slots()).not.toThrow();
      expect(store.slots().every((s) => s.state === "empty")).toBe(true);
      // …and a write that cannot happen is reported, not thrown.
      expect(store.write(0, freshSave()).ok).toBe(false);
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Settings (bible §12 plumbing)
 * ──────────────────────────────────────────────────────────────────────────── */

describe("settings", () => {
  it("round-trip", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const storage = browserStorage();
      expect(saveSettings(storage, { textSpeed: "fast" }).ok).toBe(true);
      expect(fake.getItem(SETTINGS_KEY)).toBeTruthy();
      expect(loadSettings(storage)).toEqual({ textSpeed: "fast" });
    });
  });

  it("defaults when absent, corrupt, or carrying a value this build does not know", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const storage = browserStorage();
      expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);

      for (const raw of ["{ not json", "[]", "null", JSON.stringify({ textSpeed: "warp" })]) {
        fake.plant(SETTINGS_KEY, raw);
        expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
      }
    });
  });

  it("settings live outside the save slots, so neither can corrupt the other", () => {
    const fake = new FakeLocalStorage();
    withAmbientLocalStorage(fake, () => {
      const storage = browserStorage();
      const store = new SaveStorage(storage, balance);
      expect(store.write(0, freshSave()).ok).toBe(true);
      expect(saveSettings(storage, { textSpeed: "slow" }).ok).toBe(true);

      expect(SETTINGS_KEY).not.toBe(slotKey(0));
      expect(store.read(0).state).toBe("ok");

      fake.plant(SETTINGS_KEY, "{ corrupt");
      expect(store.read(0).state).toBe("ok");
      expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    });
  });
});
