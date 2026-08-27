/**
 * tests/unit/mapview.test.ts — T-31. The loader deadline in `game/mapview.ts::ensureNodeArt`, and
 * the HUD line that says when it fired.
 *
 * ══ THE DEFECT ══
 *
 * `ensureNodeArt` had no deadline and no error branch, and `game/scenes/OverworldScene.ts::travelTo`
 * awaits it INSIDE the `try` of a `try/finally` that clears the `travelling` re-entry latch, whose
 * own guard is `if (this.travelling) return;` (OverworldScene.ts:2950). A promise that never settles
 * therefore never lets the `finally` run, the latch stays set, and every later travel is refused for
 * the rest of the session — no throw, no banner, nothing on screen. §2 below is that whole causal
 * chain, run.
 *
 * ══ WHY NONE OF THIS SHOWED UP IN PLAY, AND WHY IT IS STILL REAL ══
 *
 * A 404 settles normally: `Phaser.Loader.File.onLoad` (node_modules/phaser/src/loader/File.js:349-355)
 * turns a 4xx/5xx into `nextFile(file, false)`, which reaches `loadComplete` and emits `COMPLETE`
 * exactly as a success does. So a missing asset was never the hazard. What does not settle, read off
 * the pinned 3.90 and cited line-by-line on `ART_LOAD_TIMEOUT_MS` in `game/mapview.ts`: an XHR whose
 * `timeout` is the default `0` and whose socket hangs (XHRSettings.js:28 → XHRLoader.js:56); a
 * `load.start()` that early-returns because the loader is not `isReady()` and is past
 * `LOADER_SHUTDOWN` (LoaderPlugin.js:915-919, 1261); and a teardown that trips `nextFile`'s
 * `if (!this.inflight) return` or `fileProcessComplete`'s scene check (LoaderPlugin.js:1035, 1081).
 *
 * ══ WHAT THIS FILE DOES NOT TEST, SAID PLAINLY ══
 *
 * It does not run Phaser. The three stall paths above are properties of the ENGINE and were verified
 * by reading it, not by executing it; what is tested here is the only thing this repo can change —
 * that a loader which never emits `COMPLETE`, for whatever reason, no longer ends travel. The fake
 * loader below therefore models exactly one observable: whether `start()` emits. That is the
 * narrowest honest double, and it is deliberately not a Phaser emulator.
 *
 * ══ THE DOUBLES, DECLARED ══
 *
 *  • `phaser` — the same one-constant stub `tests/gates/dex-path-contract.test.ts` uses. `import
 *    "phaser"` throws `window is not defined` under vitest's node environment, and `ensureNodeArt`
 *    reaches the engine for exactly one value, `Phaser.Loader.Events.COMPLETE`.
 *  • `game/placeholder.ts` — a PARTIAL mock. `assetId` and everything else are the real module; only
 *    `hasRealAsset` / `realAssetUrl` (the build-time census of `assets/final/`) are substituted, and
 *    `textureFor` (the placeholder DRAWING path). The census is substituted because
 *    `game/mapview.ts`'s own header forbids recording which nodes are painted — that set moves every
 *    time the art lane ships, and a test keyed to it would go red for someone else's commit.
 *    `textureFor` is substituted because its return value never reaches `MapArtStatus`: §6's note is
 *    computed from `hasRealAsset` and `scene.textures.exists` alone, so the stub cannot make that
 *    assertion vacuous — it only spares this file the canvas/Graphics rig that
 *    `tests/unit/game-placeholder.test.ts` already owns.
 *
 * ══ NO TEST HERE WAITS ON A CLOCK ══
 *
 * Six agents share this machine and contention already produces spurious 30s timeouts. Every
 * assertion either passes `timeoutMs: 0` (the watchdog fires on the next macrotask — scheduled
 * before the probe's own turn, so the ordering is FIFO-deterministic, not a race) or drives fake
 * timers. `settlesSoon` bounds a NON-settling promise to a handful of macrotask turns, so a
 * regression here reports in milliseconds instead of parking the suite for 30 seconds.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type PhaserT from "phaser";

import { validateContent } from "../../core/schemas";
import type { Balance, NodeFile } from "../../core/types";

/**
 * The census the partial mock answers from. `vi.hoisted` because `vi.mock`'s factory is hoisted
 * above every import and would otherwise close over a temporal-dead-zone binding.
 */
const { census } = vi.hoisted(() => ({ census: new Set<string>() }));

vi.mock("phaser", () => ({ default: { Loader: { Events: { COMPLETE: "complete" } } } }));

vi.mock("../../game/placeholder", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../game/placeholder")>();
  return {
    ...real,
    hasRealAsset: (idOrPath: string): boolean => census.has(real.assetId(idOrPath)),
    realAssetUrl: (idOrPath: string): string | null =>
      census.has(real.assetId(idOrPath)) ? `/${real.assetId(idOrPath)}.png` : null,
    // Mirrors the real contract at the one level MapView depends on — real key when the texture is
    // there, a distinct stand-in key when it is not — without the drawing path.
    textureFor: (scene: PhaserT.Scene, idOrPath: string): string => {
      const id = real.assetId(idOrPath);
      return scene.textures.exists(id) ? id : `stand-in:${id}`;
    },
  };
});

// eslint-disable-next-line import/first -- must follow the mocks above.
import { assetId } from "../../game/placeholder";
// eslint-disable-next-line import/first -- must follow the mocks above.
import { MapView, ensureNodeArt, nodeArtKeys } from "../../game/mapview";

const content = validateContent();
const balance: Balance = content.balance;
const node: NodeFile = content.nodes[0] as NodeFile;
const KEYS = nodeArtKeys(node, 1, balance);

/* ════════════════════════════════════════════════════════════════════════════
 * The rig
 * ════════════════════════════════════════════════════════════════════════════ */

interface Rig {
  scene: PhaserT.Scene;
  /** Keys the loader was asked for, in order, with the URL the census handed back. */
  queued: { key: string; url: string }[];
  /** `COMPLETE` subscribers still attached. A stalled travel must not leave one behind. */
  listeners: (() => void)[];
  starts: number;
  /** Pretend the load landed: publish the key so `textures.exists` says yes. */
  land(key: string): void;
}

/**
 * A loader with ONE knob: does `start()` emit `COMPLETE`.
 *
 * Emitting synchronously is the platform, not a convenience — real `LoaderPlugin.start` calls
 * `loadComplete()` inline when the queue came out empty (LoaderPlugin.js:930-933) and `loadComplete`
 * ends by emitting `COMPLETE`. `emitOnStart: false` is every one of the three stall paths, since
 * they differ only in WHY the emit never happens.
 */
function makeRig(opts: { emitOnStart: boolean; textures?: Iterable<string> }): Rig {
  const present = new Set<string>(opts.textures ?? []);
  const listeners: (() => void)[] = [];
  const queued: { key: string; url: string }[] = [];
  const rig = {
    queued,
    listeners,
    starts: 0,
    land: (key: string): void => void present.add(key),
  } as Rig;

  const load = {
    image: (key: string, url: string): void => void queued.push({ key, url }),
    once: (event: string, fn: () => void): void => {
      if (event === "complete") listeners.push(fn);
    },
    off: (event: string, fn: () => void): void => {
      if (event !== "complete") return;
      const at = listeners.indexOf(fn);
      if (at >= 0) listeners.splice(at, 1);
    },
    start: (): void => {
      rig.starts += 1;
      if (!opts.emitOnStart) return;
      for (const fn of listeners.splice(0)) fn();
    },
  };

  rig.scene = {
    load,
    textures: { exists: (key: string): boolean => present.has(key) },
    add: {
      image: (): unknown => {
        const img = {
          setOrigin: (): unknown => img,
          setDisplaySize: (): unknown => img,
          setDepth: (): unknown => img,
          setTint: (): unknown => img,
          setTexture: (): unknown => img,
          setVisible: (): unknown => img,
          destroy: (): void => undefined,
        };
        return img;
      },
    },
  } as unknown as PhaserT.Scene;

  return rig;
}

/**
 * Did `p` settle within a bounded number of macrotask turns?
 *
 * The point is the NEGATIVE answer: a promise that never settles must report in milliseconds, not by
 * parking the suite until vitest's 30s timeout. Each turn is a real `setTimeout(…, 0)`, and a
 * watchdog armed at `timeoutMs: 0` was scheduled before this probe's first turn, so FIFO timer
 * ordering makes the positive answer deterministic rather than a race.
 */
async function settlesSoon(p: Promise<void>, turns = 8): Promise<boolean> {
  let done = false;
  void p.then(() => {
    done = true;
  });
  for (let i = 0; i < turns && !done; i++) await new Promise((r) => setTimeout(r, 0));
  return done;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  census.clear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  warn.mockRestore();
});

/** Both of the node's assets exist in the build, so `pending` is non-empty and the loader is used. */
function censusHasBothAssets(): void {
  census.add(assetId(KEYS.mapPath));
  census.add(assetId(KEYS.maskPath));
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1. A loader that never emits COMPLETE still settles.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ensureNodeArt — the deadline", () => {
  it("BINDS — a loader that never emits COMPLETE still settles", async () => {
    censusHasBothAssets();
    const rig = makeRig({ emitOnStart: false });

    // The premise, asserted rather than assumed: if `pending` were empty this would resolve for a
    // reason that has nothing to do with the deadline, and the test would be a false green.
    expect(rig.starts).toBe(0);
    const p = ensureNodeArt(rig.scene, KEYS, 0);

    expect(rig.starts, "the loader was never started — `pending` was empty, so nothing was proved").toBe(1);
    expect(await settlesSoon(p), "the promise never settled: travel is still permanently latched").toBe(true);
    // Settled already, so this cannot hang — and it is the half `settlesSoon` cannot see: RESOLVE,
    // not reject. A rejection would reach no handler at either call site and say nothing on screen.
    await expect(p).resolves.toBeUndefined();
  });

  it("says so — the paths are named on the console, and the load really was attempted", async () => {
    censusHasBothAssets();
    const rig = makeRig({ emitOnStart: false });

    await settlesSoon(ensureNodeArt(rig.scene, KEYS, 0));

    expect(rig.queued.map((q) => q.key)).toEqual([KEYS.mapKey, KEYS.maskKey]);
    expect(warn).toHaveBeenCalledTimes(1);
    const said = String(warn.mock.calls[0]?.[0] ?? "");
    expect(said).toContain(KEYS.mapPath);
    expect(said).toContain(KEYS.maskPath);
  });

  it("leaves no COMPLETE subscriber behind — a stalled loader must not accrue one per travel", async () => {
    censusHasBothAssets();
    const rig = makeRig({ emitOnStart: false });

    await settlesSoon(ensureNodeArt(rig.scene, KEYS, 0));
    await settlesSoon(ensureNodeArt(rig.scene, KEYS, 0));

    expect(rig.listeners).toHaveLength(0);
  });

  /**
   * The deadline is the ARGUMENT, not zero. Without this, a fix that resolved immediately — which
   * would put every player on a stand-in for every node whose art is still in flight — would pass
   * every other assertion in this file.
   *
   * Fake timers, so the assertion is exact and no 5-second timer outlives the test.
   */
  it("BINDS — it waits for the deadline it was given, and not less", async () => {
    censusHasBothAssets();
    vi.useFakeTimers();
    const rig = makeRig({ emitOnStart: false });

    let done = false;
    const p = ensureNodeArt(rig.scene, KEYS, 5_000).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(done, "settled before its deadline — the duration is being ignored").toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(done, "did not settle on its deadline").toBe(true);
    await p;
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 2. The settled promise lets the caller's `finally` run.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * `travelTo`'s shape, copied from `game/scenes/OverworldScene.ts:2950` and `:2984-2995`.
 *
 * A MODEL, not the scene — this file may not build an OverworldScene, and `tests/unit/overworld-scene.test.ts`
 * owns that rig. The model is only worth something if it still matches the original, so the test
 * below reads `OverworldScene.ts` off disk and asserts the three structural facts it depends on:
 * the guard, the `await` inside the `try`, and the `finally` that clears the latch. Restructure
 * `travelTo` and this file goes red asking to be re-derived, rather than quietly modelling a
 * function that no longer exists.
 */
class Traveller {
  travelling = false;
  arrivals: string[] = [];

  async travelTo(rig: Rig, timeoutMs: number): Promise<void> {
    if (this.travelling) return;
    this.travelling = true;
    try {
      await ensureNodeArt(rig.scene, KEYS, timeoutMs);
      this.arrivals.push(KEYS.mapPath);
    } finally {
      this.travelling = false;
    }
  }
}

describe("the caller's finally — build-doc §16's never-cut vertical slice", () => {
  it("BINDS — a stalled first travel does not refuse the second one", async () => {
    censusHasBothAssets();
    const rig = makeRig({ emitOnStart: false });
    const t = new Traveller();

    const first = t.travelTo(rig, 0);
    expect(t.travelling, "the latch was never set — this test is not exercising the guard").toBe(true);
    expect(await settlesSoon(first), "the first travel never returned").toBe(true);

    expect(t.travelling, "the latch is still set: every later travel is refused for the session").toBe(false);
    expect(await settlesSoon(t.travelTo(rig, 0)), "the second travel never returned").toBe(true);
    expect(t.arrivals, "the player could not leave the node they were standing on").toHaveLength(2);
  });

  it("the model above still matches the real travelTo", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../game/scenes/OverworldScene.ts", import.meta.url)),
      "utf8",
    );
    const travelTo = src.slice(src.indexOf("async travelTo(nodeId: string)"));
    expect(travelTo, "travelTo no longer starts with the re-entry guard").toContain(
      "if (this.travelling) return;",
    );
    const body = travelTo.slice(0, travelTo.indexOf("\n  /* ── streams"));
    const awaitAt = body.indexOf("await ensureNodeArt(");
    const tryAt = body.lastIndexOf("try {", awaitAt);
    const finallyAt = body.indexOf("} finally {", awaitAt);
    expect(awaitAt, "travelTo no longer awaits ensureNodeArt").toBeGreaterThan(0);
    expect(tryAt, "the await is no longer inside a try").toBeGreaterThan(0);
    expect(
      body.slice(finallyAt, finallyAt + 60),
      "the finally no longer clears the travelling latch",
    ).toContain("this.travelling = false;");
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 3. The normal path is unchanged.
 * ════════════════════════════════════════════════════════════════════════════ */

describe("ensureNodeArt — the normal path", () => {
  /**
   * The hostile version of "unchanged": the same `timeoutMs: 0` that fires the watchdog everywhere
   * else. `start()` emits synchronously, the watchdog is a macrotask, so `COMPLETE` wins — and the
   * silent console is what proves WHICH branch settled it.
   */
  it("BINDS — a prompt COMPLETE settles it, and the deadline never runs", async () => {
    censusHasBothAssets();
    const rig = makeRig({ emitOnStart: true });

    const settled = await settlesSoon(ensureNodeArt(rig.scene, KEYS, 0));

    expect(settled).toBe(true);
    expect(rig.starts).toBe(1);
    expect(rig.queued.map((q) => q.key)).toEqual([KEYS.mapKey, KEYS.maskKey]);
    expect(rig.listeners, "the once-listener was not consumed").toHaveLength(0);
    expect(warn, "the deadline fired on a load that completed promptly").not.toHaveBeenCalled();
  });

  /**
   * The watchdog is CANCELLED, not merely out-voted.
   *
   * `console.warn` cannot see this: the timeout callback's own `if (settled) return` would keep the
   * console quiet even with a live timer still pending, which is exactly the shape of an assertion
   * that observes nothing. So the timer itself is counted. Fake timers, because a real one is not
   * introspectable.
   */
  it("BINDS — the watchdog timer is cleared, not left pending", async () => {
    censusHasBothAssets();
    vi.useFakeTimers();
    const rig = makeRig({ emitOnStart: true });

    const before = vi.getTimerCount();
    await ensureNodeArt(rig.scene, KEYS, 5_000);

    expect(vi.getTimerCount() - before, "a watchdog timer outlived the load it was watching").toBe(0);
  });

  it("nothing real to fetch — resolves without touching the loader at all", async () => {
    // census stays empty: both assets are unbuilt, which is most of the region today.
    const rig = makeRig({ emitOnStart: false });

    expect(await settlesSoon(ensureNodeArt(rig.scene, KEYS, 0))).toBe(true);
    expect(rig.starts).toBe(0);
    expect(rig.queued).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("a texture already in the manager is not re-fetched", async () => {
    censusHasBothAssets();
    const rig = makeRig({ emitOnStart: true, textures: [KEYS.mapKey, KEYS.maskKey] });

    expect(await settlesSoon(ensureNodeArt(rig.scene, KEYS, 0))).toBe(true);
    expect(rig.starts).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
 * 4. What the player is told when the deadline fires.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The HUD line is the difference between "resolved early" and "resolved early and silent", and it is
 * the reason this resolves instead of rejecting: the sole caller is `void this.travelTo(target)`
 * (OverworldScene.ts:1141) with no `.catch`, so a rejection would reach an unhandled-rejection log
 * and the screen would say nothing at all.
 *
 * `MapView.status.note` is printed by `OverworldScene.ts:844` and `:2688`, and
 * `tests/unit/overworld-scene.test.ts` reads it off the HUD — so this string has a measured path to
 * the screen and is not a field nobody displays.
 */
describe("MapArtStatus.note — the two ways a map can be a placeholder", () => {
  const view = (rig: Rig): MapView =>
    new MapView(rig.scene, { node, year: 1, season: "spring", balance });

  it("BINDS — built but absent reads 'did not load', not 'not built'", () => {
    censusHasBothAssets();
    const rig = makeRig({ emitOnStart: false });

    const status = view(rig).status;

    expect(status.painted).toBe(false);
    expect(status.note).toContain("PLACEHOLDER map");
    expect(status.note).toContain(KEYS.mapPath);
    expect(status.note, "a network stall is being reported as unshipped art").toContain("did not load");
    expect(status.note).not.toContain("not built");
  });

  it("unbuilt still reads 'not built' — the art lane's readout is unchanged", () => {
    // census empty — the file is genuinely not in assets/final/.
    const rig = makeRig({ emitOnStart: false });

    const status = view(rig).status;

    expect(status.painted).toBe(false);
    expect(status.note).toContain("PLACEHOLDER map");
    expect(status.note).toContain("not built");
    expect(status.note).not.toContain("did not load");
  });

  it("painted art reports the path and no placeholder wording", () => {
    censusHasBothAssets();
    const rig = makeRig({ emitOnStart: false, textures: [KEYS.mapKey] });

    const status = view(rig).status;

    expect(status.painted).toBe(true);
    expect(status.note).toBe(`map ${KEYS.mapPath}`);
  });
});
