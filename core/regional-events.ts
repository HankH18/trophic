/**
 * core/regional-events.ts — bible §9's four regional events, as SEASON-LONG WINDOWS.
 *
 * Hank, 2026-08-25: *"events like that last for a whole season and not
 * just for one in-game day."* So the Annual Festival, the Great Migration, the Cullbrand raids and
 * the Bloom Year are **windows**: each opens on a season boundary, stays open for
 * `balance.clock.ticksPerSeason` ticks, and closes at the next boundary. Before this, only the
 * Migration was season-long and it was so by accident — a side effect of the migrant model, not
 * because anyone built an event. The festival was ONE FRAME of the year
 * turn ("FESTIVAL · Y3/6") and the raid was a single decrement inside it.
 *
 * TWO OF THE FOUR ARE DERIVED; TWO ARE LATCHED. The split is not a style choice — it is what an
 * EVENT is. A window has to be able to CLOSE while the condition that opened it is still true,
 * or it is not an event, it is a state:
 *
 *   • FESTIVAL — DERIVED. The year's final season. bible §9 called it a "diegetic gym gate, closes
 *     the year"; under the amended L8 it closes nothing (a gym victory no longer ends a year). It
 *     is the year's closing celebration: it opens at the boundary into the last season and ends
 *     when the meter fills, which is the year turn. Derived safely because the calendar leaves the
 *     final season every year, all by itself.
 *   • GREAT MIGRATION — DERIVED. A migrant line's own `seasonalWindow` (data/species.json), which
 *     is a season by construction. `core/foodweb.ts` `migrantStatus` already filters encounters by
 *     it; this module names the window so the overworld can show it for its whole duration. Derived
 *     safely for the same reason: the season ends whatever the player does.
 *   • BLOOM YEAR — LATCHED, and it was derived until it was MEASURED. A node clearing
 *     `balance.regionalEvents.bloomFloraFraction` of `balance.ecosim.floraMax` is not an event: it
 *     is a level, and under the shipped ecosim every node's flora climbs to `floraMax` and stays
 *     there. Driven honestly (four `stepRegionStates` a year for ten years, seeded), the derived
 *     reading was open at **12 nodes of 12, every season from year 3 to year 10 and onward** — one
 *     unbroken 150-tick run per node, never the single `clock.ticksPerSeason` window this module
 *     claims. (150 is the measurement; the window's length is that key and is not respelled.) So the
 *     bloom LATCHES on the RISE: a node crossing the threshold upward opens one season-long window,
 *     and no second window opens until its producers have been pushed back under. `syncEventFlags`
 *     is the latcher, exactly as act entry is the raid's.
 *   • CULLBRAND RAID — LATCHED, because its trigger is an ACT and acts are not on the calendar. Act
 *     entry latches the opening tick into `questFlags`; the window is `ticksPerSeason` ticks from
 *     that tick.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO. bible §9's Bloom Year sentence ends "gets bonus
 * spawns", and nothing here weights an encounter. That half is RULED CLOSED — never built, never
 * owed — not merely unbuilt: building it would be a second opinion about encounter weight, which is
 * exactly what G3 forbids, since `core/foodweb.ts` is the only thing that may compute one. The
 * bible was amended to match rather than the code being made to chase it. A second reason it could
 * never have worked as written: flora stock can structurally never FALL, because regrowth exceeds
 * the maximum possible seasonal consumption — so the window latches once per location in years 1-2
 * and can never recur. The window ships; the multiplier does not, and nobody should add one.
 *
 * Pure TypeScript, zero engine imports (L11), zero gameplay literals (G11).
 */

import { absoluteTick, clockAtAbsoluteTick, seasonAt, seasonStartTick, type ClockState } from "./clock";
import type { Balance, NodeState, SaveFile, Season, SpeciesLine } from "./types";

export class RegionalEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegionalEventError";
  }
}

/** bible §9 names exactly these four. Nothing here may add a fifth (G2). */
export const REGIONAL_EVENT_KINDS = ["festival", "migration", "raid", "bloom"] as const;
export type RegionalEventKind = (typeof REGIONAL_EVENT_KINDS)[number];

/**
 * One open window.
 *
 * `openedAt`/`closesAt` are ABSOLUTE ticks (`core/clock.ts` `absoluteTick`), which is what lets a
 * window be expressed without a year wrap-around case and what keeps it correct when the calendar
 * runs past year 6 — which it now may, without limit.
 */
export interface EventWindow {
  id: string;
  kind: RegionalEventKind;
  /** Absolute tick the window opened on. Always a season boundary. */
  openedAt: number;
  /** Absolute tick it closes on, exclusive: `openedAt + ticksPerSeason`. */
  closesAt: number;
  /** Calendar year the window opened in — reporting only; nothing gates on it. */
  year: number;
  season: Season;
  /** The node the event is anchored at, for the kinds that have one. */
  nodeId?: string;
  /** The species line the event is about, for the kinds that have one. */
  lineId?: string;
}

function regionalOf(balance: Balance): Balance["regionalEvents"] {
  const cfg = balance.regionalEvents;
  if (!cfg || typeof cfg.bloomFloraFraction !== "number") {
    throw new RegionalEventError(
      "core/regional-events.ts: balance.regionalEvents is missing. The window model is DATA " +
        "(data/balance.json) and must also be declared in core/types.ts `Balance` and " +
        "core/schemas.ts `zBalance` — z.object strips undeclared keys (INV-3).",
    );
  }
  return cfg;
}

/** Every window is exactly one season long — `balance.clock.ticksPerSeason` ticks. */
export function windowLengthTicks(balance: Balance): number {
  return balance.clock.ticksPerSeason;
}

/**
 * A window of exactly one season starting at absolute tick `openedAt`, wherever that tick falls.
 *
 * ⚠ NO SNAPPING. This is the constructor for the LATCHED kinds, and the reason it exists is a
 * measurement: `seasonWindow` snaps the open DOWN to the season boundary, so a raid whose act was
 * entered at tick 3 of a season was already three ticks into its own window and the player saw it
 * for ONE tick. Measured, entering act 4 at each tick of a year: visible ticks 4,3,2,1,4,3,2,1,…
 * — a whole season in one case of four. Hank's constraint is a DURATION (*"events like that last
 * for a whole season and not just for one in-game day"*), and only the unsnapped form delivers it
 * for a trigger that is not on the calendar.
 */
export function tickWindow(
  openedAt: number,
  balance: Balance,
  spec: { id: string; kind: RegionalEventKind; nodeId?: string; lineId?: string },
): EventWindow {
  const clock = clockAtAbsoluteTick(openedAt, balance);
  return {
    id: spec.id,
    kind: spec.kind,
    openedAt,
    closesAt: openedAt + windowLengthTicks(balance),
    year: clock.year,
    season: seasonAt(clock.tick, balance),
    ...(spec.nodeId === undefined ? {} : { nodeId: spec.nodeId }),
    ...(spec.lineId === undefined ? {} : { lineId: spec.lineId }),
  };
}

/**
 * The window covering the season that absolute tick `at` falls in.
 *
 * The open is snapped DOWN to the season boundary. That is right for the DERIVED kinds and only for
 * them: the state they read (the calendar's season, a migrant's season) genuinely changed at that
 * boundary, so the window they describe genuinely started there. A latched kind must use
 * {@link tickWindow} instead — see its header for what snapping cost the raid.
 */
export function seasonWindow(
  at: number,
  balance: Balance,
  spec: { id: string; kind: RegionalEventKind; nodeId?: string; lineId?: string },
): EventWindow {
  return tickWindow(seasonStartTick(at, balance), balance, spec);
}

/** True while the clock stands inside the window: `[openedAt, closesAt)`. */
export function windowActive(window: EventWindow, clock: ClockState, balance: Balance): boolean {
  const now = absoluteTick(clock, balance);
  return now >= window.openedAt && now < window.closesAt;
}

/** How many ticks of the window are left, 0 once it has closed. */
export function ticksLeftInWindow(window: EventWindow, clock: ClockState, balance: Balance): number {
  return Math.max(0, window.closesAt - absoluteTick(clock, balance));
}

/* ────────────────────────────────────────────────────────────────────────────
 * The four events
 * ──────────────────────────────────────────────────────────────────────────── */

export const FESTIVAL_WINDOW_ID = "festival";

/**
 * The Annual Festival: the year's FINAL season, every year.
 *
 * bible §9 as amended — it no longer closes the year, because nothing but the meter can.
 * It spans the season the meter fills in, so it opens at the boundary into `seasonOrder[last]` and
 * ends with the year turn. Null outside that season.
 */
export function festivalWindow(clock: ClockState, balance: Balance): EventWindow | null {
  const { ticksPerSeason, seasonOrder } = balance.clock;
  const seasonIndex = Math.floor(clock.tick / ticksPerSeason);
  if (seasonIndex !== seasonOrder.length - 1) return null;
  return seasonWindow(absoluteTick(clock, balance), balance, {
    id: FESTIVAL_WINDOW_ID,
    kind: "festival",
  });
}

/**
 * The Great Migration: one window per migrant line that is in its `seasonalWindow` right now.
 *
 * The season comes from data/species.json and nowhere else. bible §9 says "spring — Gloomoth flocks
 * shift spawns region-wide" while bible §5 and every shipped row say AUTUMN; the data wins here,
 * and the discrepancy is not something to fix by inventing a season (G2).
 */
export function migrationWindows(
  clock: ClockState,
  species: readonly SpeciesLine[],
  balance: Balance,
): EventWindow[] {
  const season = seasonAt(clock.tick, balance);
  const at = absoluteTick(clock, balance);
  const out: EventWindow[] = [];
  for (const line of species) {
    if (line.seasonalWindow !== season) continue;
    out.push(seasonWindow(at, balance, { id: `migration.${line.id}`, kind: "migration", lineId: line.id }));
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The flora a node must reach to be in a Bloom Year window — a fraction of the sim's own ceiling. */
export function bloomFloraThreshold(balance: Balance): number {
  return regionalOf(balance).bloomFloraFraction * balance.ecosim.floraMax;
}

export function bloomWindowId(nodeId: string): string {
  return `bloom.${nodeId}`;
}

/**
 * The nodes whose producers are thriving RIGHT NOW — a level, not an event.
 *
 * This is the predicate the bloom latch is driven from, and it is deliberately not a window: under
 * the shipped ecosim it is true of all twelve nodes from year 3 onward and stays true forever, so
 * publishing it directly is how "the Bloom Year" became a permanent condition at every node. One
 * answer to "is this node thriving", one answer to "is a bloom window open", and they are different
 * questions.
 */
export function thrivingNodeIds(
  nodeStates: Readonly<Record<string, NodeState>>,
  balance: Balance,
): string[] {
  const threshold = bloomFloraThreshold(balance);
  return Object.keys(nodeStates)
    .filter((nodeId) => (nodeStates[nodeId]?.floraStock ?? -1) >= threshold)
    .sort();
}

/* ── Latched windows — the two whose trigger is not the calendar ───────────── */

export function raidWindowId(raidId: string): string {
  return `raid.${raidId}`;
}

/** questFlags key holding the absolute tick a latched window opened on. */
export function windowOpenedAtFlag(windowId: string, balance: Balance): string {
  return `${regionalOf(balance).windowFlagPrefix}${windowId}.openedAt`;
}

/** Latch `windowId` open at absolute tick `openedAt`. Pure. */
function latchWindow<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  windowId: string,
  openedAt: number,
  balance: Balance,
): S {
  return {
    ...save,
    questFlags: { ...save.questFlags, [windowOpenedAtFlag(windowId, balance)]: openedAt },
  };
}

/** Drop `windowId`'s latch, so a later rise can open a fresh window. Pure. */
function unlatchWindow<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  windowId: string,
  balance: Balance,
): S {
  const key = windowOpenedAtFlag(windowId, balance);
  if (!(key in save.questFlags)) return save;
  const questFlags: SaveFile["questFlags"] = {};
  for (const [k, v] of Object.entries(save.questFlags)) if (k !== key) questFlags[k] = v;
  return { ...save, questFlags };
}

/**
 * Latch a raid's window open at the tick the act was entered on.
 *
 * ⚠ IT DOES NOT SNAP TO THE SEASON BOUNDARY, and that is the fix rather than an oversight: see
 * {@link tickWindow}. A raid entered at tick 3 of a season used to be visible for one tick.
 * Pure — the input save is never mutated.
 */
export function openRaidWindow<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  raidId: string,
  clock: ClockState,
  balance: Balance,
): S {
  return latchWindow(save, raidWindowId(raidId), absoluteTick(clock, balance), balance);
}

/** Every latched window of one kind on this save, whether or not it is still open. */
function latchedWindows(
  save: Pick<SaveFile, "questFlags">,
  balance: Balance,
  kind: RegionalEventKind,
  idOf: (tail: string) => string,
  fields: (tail: string) => { nodeId?: string; lineId?: string },
): EventWindow[] {
  const cfg = regionalOf(balance);
  const prefix = `${cfg.windowFlagPrefix}${kind}.`;
  const suffix = ".openedAt";
  const out: EventWindow[] = [];
  for (const key of Object.keys(save.questFlags).sort()) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const openedAt = save.questFlags[key];
    if (typeof openedAt !== "number") continue;
    const tail = key.slice(prefix.length, key.length - suffix.length);
    out.push(tickWindow(openedAt, balance, { id: idOf(tail), kind, ...fields(tail) }));
  }
  return out;
}

/** Every latched raid window on this save, whether or not it is still open. */
export function latchedRaidWindows(
  save: Pick<SaveFile, "questFlags">,
  balance: Balance,
): EventWindow[] {
  return latchedWindows(save, balance, "raid", raidWindowId, () => ({}));
}

/** Every latched bloom window on this save, whether or not it is still open. */
export function latchedBloomWindows(
  save: Pick<SaveFile, "questFlags">,
  balance: Balance,
): EventWindow[] {
  return latchedWindows(save, balance, "bloom", bloomWindowId, (nodeId) => ({ nodeId }));
}

/**
 * Open a bloom window for every node that has just RISEN over the threshold, and drop the latch of
 * every node that has fallen back under it.
 *
 * THE LATCH IS THE MEMORY. A node above the threshold with a latch already on it is a node that was
 * already thriving when we last looked, so no new window opens — which is what makes a Bloom Year
 * an event that ends rather than a level that is permanently true. A node that drops back under
 * loses its latch, and its next rise opens a fresh window.
 *
 * The open is snapped to the season boundary because flora only moves inside `ecosim.step()`, which
 * runs at boundaries: the rise really did happen there, even if the sync noticed it mid-season
 * (loading a save is exactly that case). Pure.
 */
export function syncBloomLatches<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  clock: ClockState,
  nodeStates: Readonly<Record<string, NodeState>>,
  balance: Balance,
): S {
  const thriving = new Set(thrivingNodeIds(nodeStates, balance));
  const openedAt = seasonStartTick(absoluteTick(clock, balance), balance);
  let next: S = save;
  for (const nodeId of Object.keys(nodeStates).sort()) {
    const windowId = bloomWindowId(nodeId);
    const latched = typeof next.questFlags[windowOpenedAtFlag(windowId, balance)] === "number";
    if (thriving.has(nodeId) && !latched) next = latchWindow(next, windowId, openedAt, balance);
    else if (!thriving.has(nodeId) && latched) next = unlatchWindow(next, windowId, balance);
  }
  return next;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Everything open right now
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RegionalEventDeps {
  species: readonly SpeciesLine[];
  nodeStates: Readonly<Record<string, NodeState>>;
}

/**
 * Every window open at this moment, in a stable order.
 *
 * This is the authoritative read. The published quest flags (see {@link regionalEventFlags}) are a
 * projection of it and are rewritten whole every sync, so they can go stale but can never disagree
 * for longer than one sync.
 */
export function activeWindows(
  save: Pick<SaveFile, "questFlags">,
  clock: ClockState,
  deps: RegionalEventDeps,
  balance: Balance,
): EventWindow[] {
  const out: EventWindow[] = [];
  const festival = festivalWindow(clock, balance);
  if (festival) out.push(festival);
  out.push(...migrationWindows(clock, deps.species, balance));
  for (const window of [...latchedRaidWindows(save, balance), ...latchedBloomWindows(save, balance)]) {
    if (windowActive(window, clock, balance)) out.push(window);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The public flag a window publishes: `event.festival.open` on the shipped names. */
export function windowFlagFor(windowId: string, balance: Balance): string {
  const cfg = regionalOf(balance);
  return `${cfg.windowFlagPrefix}${windowId}${cfg.windowFlagSuffix}`;
}

/** The flags the given windows publish, all true. */
export function regionalEventFlags(
  windows: readonly EventWindow[],
  balance: Balance,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const window of windows) out[windowFlagFor(window.id, balance)] = true;
  return out;
}

/**
 * Move the latches, then publish the open windows into the save's quest flags and retract the
 * closed ones.
 *
 * `data/dialogue.json` gates on `event.festival.open` and nothing has ever written it — it is one
 * of the corpus's externally-granted flags. This is that writer.
 * Total and idempotent: every flag this module owns is removed first and re-added if still open, so
 * a window that closed while the game was not looking cannot linger. Pure.
 *
 * ⚠ CALL IT AFTER ANY WRITE THAT MOVES THE CLOCK OR THE FLORA, not only at a season boundary. The
 * clock deliberately emits NO `seasonBoundary` on the year-filling tick (integration defect I4), so
 * a caller that synced only on that cue left `event.festival.open` true through the whole first
 * season of the NEXT year — two consecutive windows open as one, with dialogue reading the flag.
 * THE READING IS HISTORY, NOT THE RULE: it was 8 consecutive open ticks, taken under the
 * then-shipped 16-tick year where a season was four ticks. A window is `clock.ticksPerSeason` ticks
 * long, whatever that key holds today, and this line will not respell it. The retraction this
 * function performs is only as current as its last call site.
 */
export function syncEventFlags<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  clock: ClockState,
  deps: RegionalEventDeps,
  balance: Balance,
): S {
  const cfg = regionalOf(balance);
  const latched = syncBloomLatches(save, clock, deps.nodeStates, balance);
  const open = regionalEventFlags(activeWindows(latched, clock, deps, balance), balance);
  const questFlags: SaveFile["questFlags"] = {};
  for (const [key, value] of Object.entries(latched.questFlags)) {
    // Drop this module's published booleans; keep its `.openedAt` latches and everything else.
    if (key.startsWith(cfg.windowFlagPrefix) && key.endsWith(cfg.windowFlagSuffix)) continue;
    questFlags[key] = value;
  }
  return { ...latched, questFlags: { ...questFlags, ...open } };
}
