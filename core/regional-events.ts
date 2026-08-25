/**
 * core/regional-events.ts — bible §9's four regional events, as SEASON-LONG WINDOWS.
 *
 * Hank, 2026-08-25 (docs/DEVIATIONS.md D-Q2-2): *"events like that last for a whole season and not
 * just for one in-game day."* So the Annual Festival, the Great Migration, the Cullbrand raids and
 * the Bloom Year are **windows**: each opens on a season boundary, stays open for
 * `balance.clock.ticksPerSeason` ticks, and closes at the next boundary. Before this, only the
 * Migration was season-long and it was so by accident — a side effect of the migrant model, not
 * because anyone built an event (docs/STORY-REVIEW.md §5.2). The festival was ONE FRAME of the year
 * turn ("FESTIVAL · Y3/6") and the raid was a single decrement inside it.
 *
 * THE WINDOW IS DERIVED, NOT STORED. Three of the four are pure functions of state that only moves
 * at a season boundary anyway, which is what makes "active for exactly one season" a property of
 * the model rather than a promise:
 *
 *   • FESTIVAL — the year's final season. bible §9 called it a "diegetic gym gate, closes the
 *     year"; under the amended L8 it closes nothing (a gym victory no longer ends a year). It is
 *     the year's closing celebration: it opens at the boundary into the last season and ends when
 *     the meter fills, which is the year turn.
 *   • GREAT MIGRATION — a migrant line's own `seasonalWindow` (data/species.json), which is a
 *     season by construction. `core/foodweb.ts` `migrantStatus` already filters encounters by it;
 *     this module names the window so the overworld can show it for its whole duration.
 *   • BLOOM YEAR — a node whose flora clears `balance.regionalEvents.bloomFloraFraction` of
 *     `balance.ecosim.floraMax`. Flora only moves in `ecosim.step()`, which runs at season
 *     boundaries, so the reading is constant across the season it is taken in.
 *   • CULLBRAND RAID — the one that is not derivable, because its trigger is an ACT and acts are
 *     not on the calendar. Act entry latches the opening tick into `questFlags`; the window is the
 *     season that tick fell in.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO. bible §9's Bloom Year sentence ends "gets bonus
 * spawns", and nothing here weights an encounter. That half is story-review decision D10 and is
 * unruled; building it would be a second opinion about encounter weight, which is exactly what G3
 * forbids — `core/foodweb.ts` is the only thing that may compute one. The window ships; the
 * multiplier does not, and `docs/DEVIATIONS.md` says so out loud rather than letting the beat
 * quietly not happen.
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
 * The window covering the season that absolute tick `at` falls in.
 *
 * The open is snapped DOWN to the season boundary, so a window opened part-way through a season
 * (only a raid can be) still opens on a boundary, is exactly one season long, and closes at the
 * next boundary — which is the shape Hank asked for.
 */
export function seasonWindow(
  at: number,
  balance: Balance,
  spec: { id: string; kind: RegionalEventKind; nodeId?: string; lineId?: string },
): EventWindow {
  const openedAt = seasonStartTick(at, balance);
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
 * bible §9 as amended (D-Q2-2) — it no longer closes the year, because nothing but the meter can.
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
 * shift spawns region-wide" while bible §5 and every shipped row say AUTUMN; the data wins here and
 * the discrepancy is docs/STORY-REVIEW.md D7, not something to fix by inventing a season (G2).
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

/**
 * The Bloom Year: one window per node whose producers are thriving.
 *
 * Reads the LIVE flora stock (`save.nodeStates`), which only moves inside `ecosim.step()` and so is
 * constant across the season the reading is taken in — which is what makes the window exactly one
 * season long without latching anything.
 */
export function bloomWindows(
  clock: ClockState,
  nodeStates: Readonly<Record<string, NodeState>>,
  balance: Balance,
): EventWindow[] {
  const threshold = bloomFloraThreshold(balance);
  const at = absoluteTick(clock, balance);
  const out: EventWindow[] = [];
  for (const nodeId of Object.keys(nodeStates).sort()) {
    const state = nodeStates[nodeId];
    if (!state || state.floraStock < threshold) continue;
    out.push(seasonWindow(at, balance, { id: `bloom.${nodeId}`, kind: "bloom", nodeId }));
  }
  return out;
}

/* ── Cullbrand raids — the one window an ACT opens ─────────────────────────── */

export function raidWindowId(raidId: string): string {
  return `raid.${raidId}`;
}

/** questFlags key holding the absolute tick a latched window opened on. */
export function windowOpenedAtFlag(windowId: string, balance: Balance): string {
  return `${regionalOf(balance).windowFlagPrefix}${windowId}.openedAt`;
}

/**
 * Latch a raid's window open at the clock's current season.
 *
 * The ONLY stored half of this module, and it is stored because its trigger is not on the calendar:
 * act entry can happen at any tick, and nothing derivable remembers when. Pure — the input save is
 * never mutated.
 */
export function openRaidWindow<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  raidId: string,
  clock: ClockState,
  balance: Balance,
): S {
  const id = raidWindowId(raidId);
  const openedAt = seasonStartTick(absoluteTick(clock, balance), balance);
  return {
    ...save,
    questFlags: { ...save.questFlags, [windowOpenedAtFlag(id, balance)]: openedAt },
  };
}

/** Every latched raid window on this save, whether or not it is still open. */
export function latchedRaidWindows(
  save: Pick<SaveFile, "questFlags">,
  balance: Balance,
): EventWindow[] {
  const cfg = regionalOf(balance);
  const prefix = `${cfg.windowFlagPrefix}raid.`;
  const suffix = ".openedAt";
  const out: EventWindow[] = [];
  for (const key of Object.keys(save.questFlags).sort()) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const openedAt = save.questFlags[key];
    if (typeof openedAt !== "number") continue;
    const raidId = key.slice(prefix.length, key.length - suffix.length);
    out.push(seasonWindow(openedAt, balance, { id: raidWindowId(raidId), kind: "raid" }));
  }
  return out;
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
  out.push(...bloomWindows(clock, deps.nodeStates, balance));
  for (const window of latchedRaidWindows(save, balance)) {
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
 * Publish the open windows into the save's quest flags, and retract the closed ones.
 *
 * `data/dialogue.json` gates on `event.festival.open` and nothing has ever written it
 * (docs/STORY-REVIEW.md §5.1 lists it among the externally-granted flags). This is that writer.
 * Total and idempotent: every flag this module owns is removed first and re-added if still open, so
 * a window that closed while the game was not looking cannot linger. Pure.
 */
export function syncEventFlags<S extends Pick<SaveFile, "questFlags">>(
  save: S,
  clock: ClockState,
  deps: RegionalEventDeps,
  balance: Balance,
): S {
  const cfg = regionalOf(balance);
  const open = regionalEventFlags(activeWindows(save, clock, deps, balance), balance);
  const questFlags: SaveFile["questFlags"] = {};
  for (const [key, value] of Object.entries(save.questFlags)) {
    // Drop this module's published booleans; keep its `.openedAt` latches and everything else.
    if (key.startsWith(cfg.windowFlagPrefix) && key.endsWith(cfg.windowFlagSuffix)) continue;
    questFlags[key] = value;
  }
  return { ...save, questFlags: { ...questFlags, ...open } };
}
