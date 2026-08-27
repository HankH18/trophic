/**
 * core/save.ts — the build-doc §7.8 save file: shape, storage, and deterministic replay.
 *
 * `{version:1, seed, year, tick, currentNode, party[], box[], money, items, questFlags, nodeStates,
 * actionLog[]}` — locked decision L12 puts it in localStorage across 3 slots, but this module is
 * ENGINE-AGNOSTIC (L11): it never touches `window`, `localStorage` or `document`. It takes a
 * `StorageLike` instead, so the Phaser boot scene hands it `window.localStorage`, the balance
 * harness hands it `MemoryStorage`, and the tests hand it whichever they need.
 *
 * Determinism (build-doc §8.1, test `det_replay`): identical (seed, actionLog) ⇒ byte-identical
 * final save. `serialize` is CANONICAL — object keys are sorted at every depth — so "byte-identical"
 * is a statement about values and never an accident of key insertion order.
 */

import { zOwnedCreature, zSaveFile } from "./schemas";
import type {
  ActionLogEntry,
  Balance,
  BattleAftermath,
  BattleAftermathMember,
  BlackoutRecovery,
  GameAction,
  GymLeader,
  NodeFile,
  NodeState,
  OwnedCreature,
  SaveFile,
} from "./types";
import type { AdvanceYearResult, RandomFn, YearRetirementPrompt, YearTurnDeps } from "./lifecycle";
import {
  cloneNodeState,
  enterPendingActs,
  LifecycleError,
  resolveRetirement,
  rollHeirChoice,
  runYearTurn,
  yearTurnActions,
} from "./lifecycle";
// L10 — the ACT half of the tape. A gym victory is the act model's only numeric input, so replay
// must award the badge and enter the acts it earned exactly as `OverworldScene.winGym` does, or a
// replayed run has no badges, no acts and no Cullbrand raid.
import { awardBadge } from "./acts";
import type { Rng, RngState } from "./rng";
import { subsystemRng } from "./rng";
// build-doc §7.3 step 4's clamp, and G3's single source of truth for a population write: replay
// must move a count exactly the way live play moves it, so it calls the same function.
// (core/ecosim.ts imports nothing from this module, so there is no cycle.)
import { clampPopulationCount } from "./ecosim";

/* ────────────────────────────────────────────────────────────────────────────
 * Storage seam (L11)
 * ──────────────────────────────────────────────────────────────────────────── */

/** The three `localStorage` members this module uses, and nothing else. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory `StorageLike` for tests, the harness, and headless replay. */
export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  /** Test/harness affordance: the raw keys currently held. */
  keys(): string[] {
    return [...this.map.keys()];
  }
}

export class SaveVersionError extends Error {
  readonly found: number;
  readonly expected: number;
  constructor(message: string, found: number, expected: number) {
    super(message);
    this.name = "SaveVersionError";
    this.found = found;
    this.expected = expected;
  }
}

export class SaveCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveCorruptError";
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The stored shape
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Per-subsystem RNG stream state, keyed by the subsystem tag (build-doc §8.1 / balance.rng
 * subsystemTags). The value is opaque to this module — an xorshift128 stream is four uint32s, but
 * core/save.ts only promises to round-trip whatever numbers core/rng.ts hands it, so the two can be
 * retuned independently.
 */
export type RngStreamStates = Record<string, number[]>;

/**
 * The save as written to storage: build-doc §7.8 verbatim, plus one OPTIONAL additive field.
 *
 * `rngState` exists because §7.8's own determinism promise is about (seed, actionLog), which
 * reconstructs a stream only by replaying the whole log. A save taken mid-run has to come back with
 * its streams where it left them, so the stream state rides along. A save written without it is a
 * plain §7.8 save and still loads — but it resumes at the TOP of every stream, so a run continued
 * from it diverges from the run that wrote it. `openStreams` + `writeSlot(..., streams)` are how a
 * caller keeps that from happening; see `openStreams` for the whole loop.
 */
export interface SaveEnvelope extends SaveFile {
  rngState?: RngStreamStates;
}

/* ────────────────────────────────────────────────────────────────────────────
 * RNG streams across a save/load (build-doc §8.1)
 * ──────────────────────────────────────────────────────────────────────────── */

/** The seeded streams a running game holds, keyed by `balance.rng.subsystemTags`. */
export type RngStreams = Record<string, Rng>;

/** [x, y, z, w] — the four uint32 words of an xorshift128 state (core/rng.ts `RngState`). */
const RNG_STATE_WORDS = ["x", "y", "z", "w"] as const;

function encodeRngState(state: RngState): number[] {
  return RNG_STATE_WORDS.map((k) => state[k]);
}

function decodeRngState(words: readonly number[], tag: string): RngState {
  if (words.length !== RNG_STATE_WORDS.length) {
    throw new SaveCorruptError(
      `save.rngState["${tag}"] has ${words.length} words, not ${RNG_STATE_WORDS.length}`,
    );
  }
  const [x, y, z, w] = words as [number, number, number, number];
  return { x, y, z, w };
}

/**
 * Open every subsystem stream for a save, positioned where the save left it.
 *
 * This is the load half of the mid-run save. Without it a "continue" rebuilds each stream from
 * `(seed, tag)` alone — i.e. at draw zero — so the continued run redraws numbers the interrupted run
 * had already spent and lands on a different save than an uninterrupted play of the same actions.
 *
 *   load:  const streams = openStreams(readSlot(...), balance);
 *   play:  advanceYear(save, { …, rng: () => streams.sim.nextFloat() })
 *   save:  writeSlot(storage, slot, save, balance, streams)
 */
export function openStreams(save: SaveEnvelope, balance: Balance): RngStreams {
  const streams: RngStreams = {};
  for (const tag of balance.rng.subsystemTags) {
    const stream = subsystemRng(save.seed, tag);
    const stored = save.rngState?.[tag];
    if (stored) stream.restore(decodeRngState(stored, tag));
    streams[tag] = stream;
  }
  return streams;
}

/** Snapshot every stream's position for storage. */
export function captureStreams(streams: RngStreams): RngStreamStates {
  const out: RngStreamStates = {};
  for (const tag of Object.keys(streams)) {
    const stream = streams[tag];
    if (stream) out[tag] = encodeRngState(stream.save());
  }
  return out;
}

/** The save plus the current stream positions. Pure. */
export function withStreamState(save: SaveEnvelope, streams: RngStreams): SaveEnvelope {
  return { ...save, rngState: captureStreams(streams) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Canonical serialization
 * ──────────────────────────────────────────────────────────────────────────── */

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      const child = src[key];
      if (child === undefined) continue;
      out[key] = canonicalize(child);
    }
    return out;
  }
  return value;
}

/**
 * JSON with object keys sorted at every depth. build-doc §8.1's property is "byte-identical final
 * save"; without canonical ordering that property would also be asserting the order in which two
 * code paths happened to assign fields, which is not what determinism means.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function serialize(save: SaveEnvelope): string {
  return canonicalStringify(save);
}

function readRngState(raw: unknown): RngStreamStates | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const candidate = (raw as { rngState?: unknown }).rngState;
  if (candidate === null || candidate === undefined) return undefined;
  if (typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new SaveCorruptError("save.rngState must be an object keyed by subsystem tag");
  }
  const out: RngStreamStates = {};
  const src = candidate as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    const stream = src[key];
    if (!Array.isArray(stream) || stream.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      throw new SaveCorruptError(`save.rngState["${key}"] must be an array of finite numbers`);
    }
    out[key] = stream.slice() as number[];
  }
  return out;
}

export function saveVersionOf(balance: Balance): number {
  return balance.party.saveVersion;
}

/**
 * The version literal `core/schemas.ts` `zSaveFile` accepts. NOT the game's save version — that is
 * `saveVersionOf(balance)` and lives in balance.json. This exists only so `deserialize` can satisfy
 * a schema that hard-pins the number while the real check runs against balance.
 */

/**
 * build-doc §7.8 — "Migration: refuse older versions with a clear message (demo scope)."
 * A newer version is refused just as loudly: silently loading a shape this build does not know is
 * how a save gets corrupted rather than rejected.
 */
export function deserialize(json: string, balance: Balance): SaveEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch (err) {
    throw new SaveCorruptError(`save data is not valid JSON: ${(err as Error).message}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SaveCorruptError("save data is not a save object");
  }

  const expected = saveVersionOf(balance);
  const found = (raw as { version?: unknown }).version;
  if (typeof found !== "number" || !Number.isInteger(found)) {
    throw new SaveCorruptError("save data has no integer `version` field — refusing to load it");
  }
  if (found < expected) {
    throw new SaveVersionError(
      `This save was written by TROPHIC save format v${found}, and this build reads v${expected}. ` +
        `Saves are not migrated (demo scope) — start a new game to play this build.`,
      found,
      expected,
    );
  }
  if (found > expected) {
    throw new SaveVersionError(
      `This save was written by TROPHIC save format v${found}, which is newer than the v${expected} ` +
        `this build reads. Update the game, or start a new game.`,
      found,
      expected,
    );
  }

  /*
   * The version has now been checked against `balance.party.saveVersion`, which is the ONE home for
   * that number (INV-3: retuning balance touches balance.json only). The raw object goes to zod
   * unaltered: at integration the second and third pins were removed (`zSaveFile` validated
   * `z.literal(1)` and `SaveFile.version` was the literal TYPE `1`), so this no longer has to
   * normalise the value and restore it afterwards.
   */
  const parsed = zSaveFile.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new SaveCorruptError(`save data failed validation:\n${issues}`);
  }

  const body: SaveEnvelope = { ...parsed.data, version: found };
  const rngState = readRngState(raw);
  return rngState ? { ...body, rngState } : body;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Slots (L12 — 3 slots)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Storage-key namespace. Not a gameplay constant — it names a bucket, it does not tune anything. */
export const SAVE_KEY_PREFIX = "trophic.save";

export function slotKey(slot: number): string {
  return `${SAVE_KEY_PREFIX}.${slot}`;
}

function assertSlot(slot: number, balance: Balance): void {
  const slots = balance.party.saveSlots;
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots) {
    throw new SaveCorruptError(`save slot ${slot} is out of range — this build has ${slots} slots`);
  }
}

/**
 * Write a save to a slot. Pass the live `streams` for a MID-RUN save: without them the stored save
 * has no stream position, and continuing from it replays numbers the interrupted run already spent
 * (build-doc §8.1). A brand-new game has nothing to capture and may omit them.
 */
export function writeSlot(
  storage: StorageLike,
  slot: number,
  save: SaveEnvelope,
  balance: Balance,
  streams?: RngStreams,
): void {
  assertSlot(slot, balance);
  storage.setItem(slotKey(slot), serialize(streams ? withStreamState(save, streams) : save));
}

export function readSlot(storage: StorageLike, slot: number, balance: Balance): SaveEnvelope | null {
  assertSlot(slot, balance);
  const json = storage.getItem(slotKey(slot));
  if (json === null) return null;
  return deserialize(json, balance);
}

export function deleteSlot(storage: StorageLike, slot: number, balance: Balance): void {
  assertSlot(slot, balance);
  storage.removeItem(slotKey(slot));
}

export interface SlotSummary {
  slot: number;
  /** null = empty slot; an Error = a slot this build refuses to load (version or corruption). */
  save: SaveEnvelope | null;
  error: Error | null;
}

/** Slot list for the title screen: never throws, so one bad slot cannot hide the other two. */
export function listSlots(storage: StorageLike, balance: Balance): SlotSummary[] {
  const out: SlotSummary[] = [];
  for (let slot = 0; slot < balance.party.saveSlots; slot += 1) {
    try {
      out.push({ slot, save: readSlot(storage, slot, balance), error: null });
    } catch (err) {
      out.push({ slot, save: null, error: err as Error });
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * New game
 * ──────────────────────────────────────────────────────────────────────────── */

export interface NewSaveOpts {
  seed: number;
  currentNode: string;
  /** build-doc §4 step 1 — "copies of every node JSON as live sim state". */
  nodes: readonly NodeFile[];
  party?: OwnedCreature[];
  box?: OwnedCreature[];
  money?: number;
  items?: Record<string, number>;
  questFlags?: Record<string, boolean | number | string>;
  rngState?: RngStreamStates;
}

/** Node file → live sim state. A deep copy: the shipped JSON is never aliased by a running game. */
export function nodeStateFrom(node: NodeFile): NodeState {
  const populations: Record<string, NodeState["populations"][string]> = {};
  for (const key of Object.keys(node.populations)) {
    const pop = node.populations[key];
    if (pop) populations[key] = { ...pop };
  }
  return { populations, floraStock: node.floraStock, recentDeaths: 0 };
}

/**
 * build-doc §4, runtime narrative step 1: "Boot loads balance.json, all content JSON, and the save
 * (or seeds a new one: RNG seed + copies of every node JSON as live sim state)."
 */
export function newSave(opts: NewSaveOpts, balance: Balance): SaveEnvelope {
  const nodeStates: Record<string, NodeState> = {};
  for (const node of opts.nodes) nodeStates[node.id] = nodeStateFrom(node);

  const save: SaveEnvelope = {
    // G11 / INV-4: the save version is a balance.json value, never a literal here. A build that
    // bumps `party.saveVersion` must be able to load the save its own new game just wrote.
    version: saveVersionOf(balance) as SaveFile["version"],
    seed: opts.seed,
    year: balance.clock.startYear,
    tick: balance.clock.startTick,
    subTick: 0,
    forayStepsSinceTick: 0,
    currentNode: opts.currentNode,
    party: opts.party ? opts.party.map((c) => ({ ...c })) : [],
    box: opts.box ? opts.box.map((c) => ({ ...c })) : [],
    money: opts.money ?? 0,
    items: { ...(opts.items ?? {}) },
    questFlags: { ...(opts.questFlags ?? {}) },
    nodeStates,
    actionLog: [],
  };
  if (opts.rngState) save.rngState = { ...opts.rngState };
  return save;
}

/** The seq the next log entry must carry. */
export function nextSeq(save: SaveEnvelope): number {
  const last = save.actionLog[save.actionLog.length - 1];
  return last ? last.seq + 1 : 0;
}

/** Append one action to the log, numbering it. Pure. */
export function appendAction(save: SaveEnvelope, action: GameAction): SaveEnvelope {
  const entry: ActionLogEntry = {
    seq: nextSeq(save),
    year: save.year,
    tick: save.tick,
    subTick: save.subTick ?? 0,
    action,
  };
  return { ...save, actionLog: [...save.actionLog, entry] };
}

/**
 * Append already-built entries (the year turn's tape) to a save's log.
 *
 * The numbering is CHECKED rather than repaired: `replay` renumbers its output from 0 upward, so a
 * log with a gap or a repeat can never equal its own replay, and build-doc §8.1's byte-identity
 * property would fail for a reason nothing points at. Failing here names the producer instead.
 */
export function appendEntries(
  save: SaveEnvelope,
  entries: readonly ActionLogEntry[],
): SaveEnvelope {
  let expected = nextSeq(save);
  for (const entry of entries) {
    if (entry.seq !== expected) {
      throw new SaveCorruptError(
        `action log entry is numbered ${entry.seq} where the log is at ${expected} — ` +
          `the log must be a gapless sequence from 0`,
      );
    }
    expected += 1;
  }
  return { ...save, actionLog: [...save.actionLog, ...entries] };
}

/**
 * The whole year-turn bookkeeping: take `advanceYear`'s result and the tick the turn started at,
 * and hand back the post-turn save with the turn's entries appended and correctly numbered.
 */
export function appendYearTurn(
  result: AdvanceYearResult,
  tickBefore: number,
): SaveEnvelope {
  const save = result.save as SaveEnvelope;
  return appendEntries(save, yearTurnActions(result, tickBefore));
}

/* ────────────────────────────────────────────────────────────────────────────
 * The battle aftermath — what a finished fight leaves on the save (§7.4 → §7.8)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The aftermath record itself lives in `core/types.ts`, because `GameAction` names it and that file
 * may not import from a sibling (see the note on `BattleAftermathMember` there). Re-exported here so
 * every caller that already reads it off this module keeps working.
 *
 * XP CARRY-IN IS THE OTHER HALF OF THIS RECORD AND IT HAS LANDED: `core/types.ts` `BattlerSpec`
 * carries `xp`, and `core/battle.ts` `makeBattler` reads it back in as `xp: spec.xp ?? 0`. So the
 * `xp` written OUT here is the same number the next fight starts from, and levelling no longer needs
 * ONE fight to cover a whole `xpToNext(level)` — which it could not, on shipped balance: `xpGain`
 * against a level-5 enemy is 32 against an `xpToNext(5)` of ~143. Nothing in this module moved for
 * it, which is what the record being ABSOLUTE bought.
 */
export type { BattleAftermath, BattleAftermathMember } from "./types";

/**
 * The `t` discriminant the aftermath rides on the tape under. A real `core/types.ts` `GameAction`
 * member since T-33, which is why {@link battleAftermathAction} returns one with no cast and
 * {@link replay} dispatches it from a named `case` instead of its `default` arm.
 *
 * `core/schemas.ts` NEEDED NO CHANGE FOR IT AND MUST NOT GET ONE. `zSaveFileFor` validates
 * `actionLog[].action` as `z.looseObject({ t: z.string().min(1) })` — "permissive BY DESIGN …
 * pinning the GameAction union here would make every lane that adds an action edit this file" — and
 * `looseObject` hands the payload back INTACT (measured: a `battleAftermath` entry survives
 * `serialize` → `deserialize` with its party and items whole, where a `z.object` would have returned
 * `{t}` alone). {@link readBattleAftermath} still re-checks the SHAPE at replay time rather than
 * trusting the discriminant, so a hand-edited tape cannot smuggle a half-record past it.
 */
export const BATTLE_AFTERMATH_ACTION = "battleAftermath";

/** The tape entry for one finished fight. */
export function battleAftermathAction(aftermath: BattleAftermath): GameAction {
  return {
    t: BATTLE_AFTERMATH_ACTION,
    aftermath: {
      party: aftermath.party.map((m) => ({ ...m })),
      items: { ...aftermath.items },
    },
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The aftermath carried by a tape entry, or null when the entry is not one.
 *
 * Takes `unknown` on purpose: the tape reaches `replay` through a permissive schema, so this is the
 * only place the record's shape is actually checked. A malformed one is null — it then falls
 * through `replay`'s `default` arm and changes nothing, which is the same thing an unknown action
 * has always done — rather than throwing on load and making a corrupt tape unreadable.
 */
export function readBattleAftermath(action: unknown): BattleAftermath | null {
  if (action === null || typeof action !== "object") return null;
  const raw = action as { t?: unknown; aftermath?: unknown };
  if (raw.t !== BATTLE_AFTERMATH_ACTION) return null;
  const body = raw.aftermath;
  if (body === null || typeof body !== "object") return null;
  const { party, items } = body as { party?: unknown; items?: unknown };
  if (!Array.isArray(party)) return null;
  const members: BattleAftermathMember[] = [];
  for (const entry of party) {
    if (entry === null || typeof entry !== "object") return null;
    const m = entry as { uid?: unknown; curHp?: unknown; level?: unknown; xp?: unknown };
    if (typeof m.uid !== "string" || m.uid.length === 0) return null;
    if (!isFiniteNumber(m.curHp) || !isFiniteNumber(m.level) || !isFiniteNumber(m.xp)) return null;
    members.push({ uid: m.uid, curHp: m.curHp, level: m.level, xp: m.xp });
  }
  if (items === null || typeof items !== "object" || Array.isArray(items)) return null;
  const bag: Record<string, number> = {};
  for (const key of Object.keys(items as Record<string, unknown>)) {
    const qty = (items as Record<string, unknown>)[key];
    if (!isFiniteNumber(qty)) return null;
    bag[key] = qty;
  }
  return { party: members, items: bag };
}

/**
 * Apply one fight's aftermath to a save. Pure, idempotent, and the ONLY writer of `curHp` outside
 * `core/lifecycle.ts` — the live path and `replay` both come through here, so a replayed run cannot
 * disagree with the run it is replaying about how hurt the party is (L10 / build-doc §8.1).
 *
 * `items` is REPLACED, not merged: `BattleState.bag` was seeded from the whole of `save.items` and
 * is the bag as the fight left it, so a merge would resurrect a stack the player just spent.
 *
 * A member the save does not have is a loud `SaveCorruptError`, on exactly the terms
 * {@link adjustPopulation} refuses a catch at a node the save has no state for: the tape does not
 * belong to this save, and silently skipping it replays a party that is quietly healthier than the
 * one that fought.
 */
export function applyBattleAftermath(
  save: SaveEnvelope,
  aftermath: BattleAftermath,
): SaveEnvelope {
  const byUid = new Map(aftermath.party.map((m) => [m.uid, m]));
  const seen = new Set<string>();
  const party = save.party.map((creature) => {
    const member = byUid.get(creature.uid);
    if (!member) return creature;
    seen.add(creature.uid);
    return { ...creature, curHp: member.curHp, level: member.level, xp: member.xp };
  });
  for (const member of aftermath.party) {
    if (seen.has(member.uid)) continue;
    throw new SaveCorruptError(
      `a battle aftermath names party member "${member.uid}", which this save does not have — ` +
        `the log does not belong to this save`,
    );
  }
  return { ...save, party, items: { ...aftermath.items } };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The blackout — what a WIPED party leaves on the save (core/recovery.ts → §7.8)
 *
 * ⚠ THE SECTION ABOVE IS WHY THIS ONE EXISTS. While `curHp` had no writer outside
 * `core/lifecycle.ts`, damage evaporated between fights and a wipe was not a state the game could
 * reach. It is now: `applyBattleAftermath` writes zeroes back, `core/lifecycle.ts` keeps a zero at
 * zero through the year turn (`creature.curHp <= 0 ? creature.curHp : …`), and the inn charges
 * ticks and heals nothing — so a save whose party is entirely fainted could not act again, for ever.
 *
 * WHAT LIVES HERE AND WHAT LIVES IN core/recovery.ts. This module owns the TAPE: the entry, its
 * shape check, and the one applier the live path and `replay` both come through. `core/recovery.ts`
 * owns the DECISIONS — is the party down, where do they wake, what does it cost — because those
 * read content (the inn nodes, the node graph) and this module reads none.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The recovery record itself lives in `core/types.ts`, because `GameAction` names it and that file
 * may not import from a sibling (see the note on `BattleAftermathMember` there). Re-exported here so
 * every caller that already reads it off this module keeps working — `core/recovery.ts` and
 * `tests/unit/recovery.test.ts` both import it from here, and neither moved for this.
 */
export type { BlackoutRecovery } from "./types";

/**
 * The `t` discriminant the blackout rides on the tape under.
 *
 * ⚠ IT IS A `GameAction` MEMBER NOW, and the cast that used to stand below it is gone — the one line
 * this docblock used to ask for landed in `core/types.ts` as
 * `| { t: "blackout"; recovery: BlackoutRecovery }`. Nothing else needed to move with it:
 * `core/schemas.ts` `zSaveFileFor` validates `actionLog[].action` as
 * `z.looseObject({ t: z.string().min(1) })`, so a save carrying this entry always loaded,
 * round-tripped and replayed with no schema change, and {@link readBlackout} still re-checks the
 * SHAPE at replay time rather than trusting the discriminant — a tape reaches `replay` through that
 * permissive schema, not through this constructor.
 *
 * ⚠ AND IT IS NOT A `ClockActionKind`. This entry is the CONSEQUENCE and carries no price: the
 * price is levied as the priced entries `core/recovery.ts` `BLACKOUT_COST` names — two `inn`s and a
 * `travel`, which `game/year-replay.ts` `clockFromLog` already prices out of `balance.clock`. An
 * entry is a price or a consequence and never both, so a `blackout` entry that also moved the clock
 * would be two answers to "what did the blackout cost".
 */
export const BLACKOUT_ACTION = "blackout";

/** The tape entry for one blackout. */
export function blackoutAction(recovery: BlackoutRecovery): GameAction {
  return {
    t: BLACKOUT_ACTION,
    recovery: { wakeNode: recovery.wakeNode, restored: [...recovery.restored] },
  };
}

/**
 * The recovery carried by a tape entry, or null when the entry is not one.
 *
 * Takes `unknown` for the reason {@link readBattleAftermath} does: the tape reaches `replay`
 * through a permissive schema, so this is the only place the record's shape is checked, and a
 * malformed one falls through `replay`'s `default` arm changing nothing rather than making a
 * corrupt tape unreadable.
 */
export function readBlackout(action: unknown): BlackoutRecovery | null {
  if (action === null || typeof action !== "object") return null;
  const raw = action as { t?: unknown; recovery?: unknown };
  if (raw.t !== BLACKOUT_ACTION) return null;
  const body = raw.recovery;
  if (body === null || typeof body !== "object") return null;
  const { wakeNode, restored } = body as { wakeNode?: unknown; restored?: unknown };
  if (typeof wakeNode !== "string" || wakeNode.length === 0) return null;
  if (!Array.isArray(restored)) return null;
  const uids: string[] = [];
  for (const uid of restored) {
    if (typeof uid !== "string" || uid.length === 0) return null;
    uids.push(uid);
  }
  return { wakeNode, restored: uids };
}

/**
 * Apply one blackout to a save. Pure, idempotent, and the ONE writer both the live path and
 * `replay` come through, so a replayed run cannot disagree with the run it is replaying about
 * where the player woke up or how hurt the party still is (L10 / build-doc §8.1).
 *
 * THREE WRITES, and each of them is why a wiped save can act again:
 *   • every uid in `restored` loses its `curHp`, which is "at full" (see {@link BlackoutRecovery});
 *   • `currentNode` becomes the wake node — a node with an inn, which a route is not;
 *   • `interiorId` is REMOVED. `core/types.ts` `SaveFile.interiorId` names a room in a town, and a
 *     save whose `currentNode` has moved while `interiorId` still names the room it left is the
 *     broken state `game/scenes/OverworldScene.ts` `travelTo` refuses travel to avoid. Absent is
 *     the outdoor state and there is no other spelling of it — a key holding `undefined` is not the
 *     same bytes through `canonicalize`.
 *
 * A uid the save does not have is a loud `SaveCorruptError`, on exactly the terms
 * {@link applyBattleAftermath} refuses one: the tape does not belong to this save, and silently
 * skipping it replays a party that is quietly more (or less) upright than the one that went down.
 *
 * It does NOT write `core/recovery.ts` `BLACKOUT_CUE_FLAG`. That is a corpus cue, and no corpus
 * flag is on the tape — see `applyBlackoutRecovery` there for why the split is deliberate.
 */
export function applyBlackout(save: SaveEnvelope, recovery: BlackoutRecovery): SaveEnvelope {
  const wanted = new Set(recovery.restored);
  const seen = new Set<string>();
  const party = save.party.map((creature) => {
    if (!wanted.has(creature.uid)) return creature;
    seen.add(creature.uid);
    if (creature.curHp === undefined) return creature;
    const full: OwnedCreature = { ...creature };
    delete full.curHp;
    return full;
  });
  for (const uid of recovery.restored) {
    if (seen.has(uid)) continue;
    throw new SaveCorruptError(
      `a blackout names party member "${uid}", which this save does not have — ` +
        `the log does not belong to this save`,
    );
  }
  const next: SaveEnvelope = { ...save, party, currentNode: recovery.wakeNode };
  if (next.interiorId !== undefined) delete next.interiorId;
  return next;
}

/* ────────────────────────────────────────────────────────────────────────────
 * The inn rest — the same restore, with no move (core/recovery.ts §5 → §7.8)
 *
 * ⚠ WHY THE TAPE HALF LIVES HERE AND NOT BESIDE THE DECISION THAT MINTS IT. It was written in
 * `core/recovery.ts`, and the consequence was a defect of exactly the shape the section above
 * exists to prevent: that module minted `{t:"innRest"}` onto the log while `replay`'s switch had no
 * arm for it and this file never imported its reader, so an inn rest fell through `default` and
 * applied NOTHING. Live the party came back at full; replayed it stayed hurt. L10 —
 * "identical (seed, actionLog) ⇒ byte-identical final save" — was false for any run that slept.
 *
 * The header of `core/recovery.ts` already stated the rule the code did not follow: *"`core/save.ts`
 * owns the TAPE — `BlackoutRecovery`, `blackoutAction`, `readBlackout`, `applyBlackout` — because
 * that module owns the log and its appliers. This module owns the DECISIONS."* The four names below
 * are the inn rest's tape half and they are here for that reason. What stayed over there is what
 * needs CONTENT: `innRestFor` reads `balance.medicine.innRestFullHeal` and takes the `isStanding`
 * predicate, and `applyInnRest` is the live composition. `core/recovery.ts` re-exports all four, so
 * every existing importer — `game/scenes/OverworldScene.ts` and two test files — is untouched.
 *
 * ⚠ AND THE DIRECTION OF THE IMPORT IS THE POINT, NOT AN ACCIDENT OF STYLE. `core/recovery.ts`
 * already imports this module; teaching this module to import IT instead would close a cycle, and
 * would drag `core/dialogue-schema.ts` and the whole shipped corpus behind `core/save.ts` — which
 * the balance harness, every test and `core/lifecycle.ts` load. Moving four content-free functions
 * the other way costs nothing and closes it.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The `t` discriminant an inn rest rides on the tape under.
 *
 * ⚠ IT IS A CONSEQUENCE AND IT NEEDS ITS OWN ENTRY. `{t:"inn", townId}` is a PRICE — `replay`
 * applies no state for it and `game/year-replay.ts` `clockFromLog` charges `balance.clock.innTicks`
 * for it — and this module's contract is that an entry is a price or an absolute consequence and
 * never both. Two concrete failures follow from breaking it here rather than one doctrinal one:
 *   • `core/recovery.ts` `BLACKOUT_COST` levies TWO `{t:"inn"}` entries of its own. A heal derived
 *     from the price entry would fire on those as well, so the blackout would be restored three
 *     times by two different rules — and `applyBlackout` and a price-derived heal disagree the
 *     moment `balance.medicine.innRestFullHeal` is retuned to false.
 *   • the false branch of `core/recovery.ts` `restoredUids` needs `isStanding`, which `replay` does
 *     not have and must not acquire: the one spelling lives in `game/wild-battle.ts` and `core/`
 *     may not import `game/` (L11). An absolute uid list needs no predicate at replay time, which
 *     is the same reason `BlackoutRecovery` carries uids instead of HP numbers.
 *
 * ⚠ IT IS A `GameAction` MEMBER NOW, and the `as unknown as GameAction` cast that used to stand
 * below it is gone — the one line its docblock asked for landed in `core/types.ts` as
 * `| { t: "innRest"; restored: readonly string[] }`. `core/schemas.ts` needed no change and must not
 * get one: `zSaveFileFor` validates `actionLog[].action` as `z.looseObject({ t: z.string().min(1) })`,
 * which hands the payload back intact, and {@link readInnRest} re-checks the SHAPE at replay time
 * rather than trusting the discriminant.
 */
export const INN_REST_ACTION = "innRest";

/** The tape entry for one inn rest. Absolute: the uids it puts at full. */
export function innRestAction(restored: readonly string[]): GameAction {
  return { t: INN_REST_ACTION, restored: [...restored] };
}

/**
 * The uid list carried by a tape entry, or null when the entry is not an inn rest.
 *
 * Takes `unknown` for the reason {@link readBlackout} does: the tape reaches `replay` through a
 * permissive schema, so this is the only place the record's shape is checked, and a malformed one
 * is null — it then changes nothing — rather than making a corrupt tape unreadable.
 */
export function readInnRest(action: unknown): string[] | null {
  if (action === null || typeof action !== "object") return null;
  const raw = action as { t?: unknown; restored?: unknown };
  if (raw.t !== INN_REST_ACTION) return null;
  if (!Array.isArray(raw.restored)) return null;
  const uids: string[] = [];
  for (const uid of raw.restored) {
    if (typeof uid !== "string" || uid.length === 0) return null;
    uids.push(uid);
  }
  return uids;
}

/**
 * PUT THE NAMED MEMBERS AT FULL, and change nothing else. The ONE writer the live path
 * (`core/recovery.ts` `applyInnRest`) and `replay`'s `case "innRest"` both come through.
 *
 * ⚠ IT IS {@link applyBlackout}, DELIBERATELY, AND THE TWO ARGUMENTS IT IS GIVEN ARE WHAT NARROW IT
 * TO THE PARTY. That function does three writes — the party, `currentNode`, and clearing
 * `interiorId` — and only the first belongs to an inn rest:
 *   • `wakeNode: save.currentNode` makes the move an IDENTITY. A rest does not relocate anybody; the
 *     player is already standing in the town whose inn they are using.
 *   • `interiorId` is PUT BACK. `applyBlackout` clears it because it MOVES the player, and a save
 *     whose `currentNode` has changed while `interiorId` still names the room it left is the broken
 *     state `game/scenes/OverworldScene.ts` `travelTo` refuses travel to avoid. Nothing moves here,
 *     and [R] is live inside a room — `data/interiors/hearthollow-inn.json` is a room the player can
 *     be standing in when they press it — so clearing it would put the save outdoors while the
 *     scene still drew the inn floor.
 *
 * Routing through the shared writer is the point: it is the one place "restored" is spelled, and it
 * is where the loud `SaveCorruptError` for a uid the save does not have already lives. A private
 * copy of that four-line map is the defect class this repo has spent its night removing. STANDING
 * HANDOFF: split `applyBlackout` into a party half and a relocation half, and this function becomes
 * a call to the party half with no correction after it.
 */
export function restoreParty(save: SaveEnvelope, restored: readonly string[]): SaveEnvelope {
  const healed = applyBlackout(save, { wakeNode: save.currentNode, restored });
  if (save.interiorId === undefined) return healed;
  return { ...healed, interiorId: save.interiorId };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The catch — the CREATURE half, which the tape used to drop (§7.3 → §7.8)
 *
 * ⚠ WHY THIS SECTION EXISTS. A `catch` entry carried `{nodeId, lineId, uid}` and nothing else, so
 * `replay` applied the population decrement and delegated the party/box side to the optional
 * `ReplayDeps.applyOther` — whose only implementor, `game/year-replay.ts` `replayRegionHooks`,
 * refreshes an ecology mirror and adds no creature. Measured on a real fight driven to a real catch:
 * live party `["provisional-starter","wild-r1-nibbin-line-0"]`, replayed party
 * `["provisional-starter"]`, with the population correct at 10 on both sides — with no `applyOther`
 * AND through the production hooks. Locked decision L10 ("identical (seed, actionLog) ⇒
 * byte-identical final save") was therefore FALSE for any run containing a catch.
 *
 * The information was not merely unapplied, it was ABSENT: age, level, traits, `caughtYear`,
 * `metamorphosed` and which cohort the newcomer landed in are decided by the encounter roll, the
 * trait roll and the fight, and none of those are on the tape. So the entry has to carry the
 * creature, and it carries the WHOLE creature — the same absolute-consequence rule
 * `core/types.ts` `BattleAftermathMember` states: applied twice it must still say the same thing.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The tape entry for one catch: the population write and the creature, in one entry.
 *
 * Both halves belong to the same act, which is why they are not two entries — and neither half is a
 * PRICE. The tick a catch cost was already levied by the `foray` or `battle` entry beside it, so
 * this entry is a consequence only, exactly as this module's contract requires (an entry is a price
 * or a consequence and never both).
 *
 * `lineId` and `uid` are taken FROM the creature rather than passed alongside it, so the entry
 * cannot be built disagreeing with itself; {@link caughtFromCatchAction} refuses one that does,
 * because a hand-edited tape can still say two things.
 */
export function catchAction(nodeId: string, creature: OwnedCreature): GameAction {
  return {
    t: "catch",
    nodeId,
    lineId: creature.lineId,
    uid: creature.uid,
    gained: cloneCreature(creature),
  };
}

/** A defensive copy deep enough for what `OwnedCreature` actually holds: two arrays of records. */
function cloneCreature(creature: OwnedCreature): OwnedCreature {
  return {
    ...creature,
    traits: creature.traits.map((t) => ({ ...t })),
    boons: creature.boons.map((b) => ({ ...b })),
  };
}

/**
 * The creature a `catch` entry carries — null when it carries none, and a LOUD throw when it carries
 * a broken one.
 *
 * THREE OUTCOMES, NOT TWO, AND THAT IS THE DIFFERENCE FROM {@link readBattleAftermath}. That reader
 * answers "is this entry an aftermath at all?", so a malformed record is indistinguishable from an
 * unknown action and returning null is right. Here the discriminant has ALREADY said this is a
 * catch: a `gained` that will not parse is a corrupt record on an entry we are certainly applying,
 * and swallowing it would silently reproduce the exact defect this section exists to close — a
 * replayed party quietly one creature short.
 *
 * `core/schemas.ts` `zOwnedCreature` does the parsing, so "what a valid OwnedCreature is" keeps ONE
 * home; it is a `strictObject`, so it neither invents a field nor drops one, which is what
 * byte-identity needs. The uid/lineId cross-check catches the other corruption a permissive tape
 * allows: an entry whose two halves name different creatures.
 */
export function caughtFromCatchAction(action: unknown): OwnedCreature | null {
  if (action === null || typeof action !== "object") return null;
  const raw = action as { t?: unknown; uid?: unknown; lineId?: unknown; gained?: unknown };
  if (raw.t !== "catch") return null;
  if (raw.gained === undefined) return null;
  const parsed = zOwnedCreature.safeParse(raw.gained);
  if (!parsed.success) {
    throw new SaveCorruptError(
      `a catch entry carries a creature that is not a valid OwnedCreature: ${parsed.error.message}`,
    );
  }
  const creature = parsed.data;
  if (creature.uid !== raw.uid) {
    throw new SaveCorruptError(
      `a catch entry logs uid "${String(raw.uid)}" but carries the creature "${creature.uid}" — ` +
        `the entry disagrees with itself`,
    );
  }
  if (creature.lineId !== raw.lineId) {
    throw new SaveCorruptError(
      `a catch entry logs line "${String(raw.lineId)}" but carries a "${creature.lineId}" — ` +
        `the entry disagrees with itself`,
    );
  }
  return creature;
}

/**
 * Put a caught creature where the tape says it went. Pure, idempotent, and the ONE applier the live
 * path's replay comes through.
 *
 * `boxed` decides the cohort and nothing else does: `game/wild-battle.ts` `applyCatchToSave` already
 * answered "party or box" against `balance.party.maxPartySize` when the catch happened, and
 * re-deciding it here would be a second answer to a question the record already carries. That is
 * also why no capacity check lives here — the tape records what DID happen, not what the current
 * balance would allow.
 *
 * IDEMPOTENT BY REPLACEMENT, NOT BY APPEND. A uid already present is overwritten in place (and moved
 * if the record names the other cohort), so applying the same entry twice lands exactly where
 * applying it once did — the property an absolute consequence has to have, and the reason a
 * duplicated tape entry cannot grow the party.
 */
export function applyCaught(save: SaveEnvelope, creature: OwnedCreature): SaveEnvelope {
  const record = cloneCreature(creature);
  const toBox = record.boxed === true;
  const target = toBox ? save.box : save.party;
  const other = toBox ? save.party : save.box;
  const replaced = target.some((c) => c.uid === record.uid);
  const nextTarget = replaced
    ? target.map((c) => (c.uid === record.uid ? record : c))
    : [...target, record];
  const nextOther = other.filter((c) => c.uid !== record.uid);
  return toBox
    ? { ...save, box: nextTarget, party: nextOther }
    : { ...save, party: nextTarget, box: nextOther };
}

/**
 * Take a released creature back off the save. Pure, idempotent, and the mirror of
 * {@link applyCaught} — `game/quests.ts` `releaseIntoNode` filters the same uid out of both cohorts.
 *
 * A uid the save does not have is a NO-OP, deliberately, and it is the one place this module does
 * NOT refuse loudly. {@link applyBattleAftermath} and {@link applyBlackout} refuse an unknown uid
 * because they WRITE to a member that must exist; a removal that threw on an absent uid could not be
 * applied twice, and idempotence is what makes an absolute consequence safe to replay at all.
 */
export function applyReleased(save: SaveEnvelope, uid: string): SaveEnvelope {
  return {
    ...save,
    party: save.party.filter((c) => c.uid !== uid),
    box: save.box.filter((c) => c.uid !== uid),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Deterministic replay (build-doc §8.1 / L10, test `det_replay`)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReplayDeps extends YearTurnDeps {
  /**
   * data/gyms.json — the badge ladder `core/acts.ts` counts.
   *
   * REQUIRED, and deliberately not optional. A `gymVictory` in the tape awards a badge, which can
   * enter one or more acts, and act entry is what applies the Cullbrand raid. Without the
   * gym list replay cannot derive the act, and an optional field would have made that a SILENT
   * half-replay: badges present, acts absent, raid never applied, survey quietly wrong. L10 says
   * the same (seed, actionLog) gives a byte-identical save; a missing dep must be a compile error,
   * not a different ending.
   */
  gyms: readonly GymLeader[];
  /**
   * The lifecycle stream, rebuilt from `save.seed` with core/rng.ts. Supplying it makes replay draw
   * the SAME number of values in the SAME order as live play did (the heir roll happens either way,
   * even though the log already fixes which choice was taken), so a replayed run leaves the stream
   * exactly where the live run left it.
   */
  rng?: RandomFn;
  /**
   * Handler for the actions other lanes own (travel, foray, battle, inn). Replay applies the
   * lifecycle and act actions itself and hands everything else here; without a handler those
   * entries are carried into the log unchanged and alter nothing.
   */
  applyOther?: (save: SaveEnvelope, entry: ActionLogEntry) => SaveEnvelope;
}

/**
 * build-doc §7.3 — "Player catch/release directly increments/decrements count at action time."
 *
 * A catch or release naming a node or a line the save does not have is a log that does not belong to
 * this save, and it fails the same way a stray retirement does: loudly. Silently ignoring it
 * replayed a mismatched tape to a wrong-but-plausible survey, and Hard Req 2 is that the survey
 * shows real numbers. The floor is `balance.ecosim.populationFloor` — the same floor the year turn's
 * raid respects; a second hard-coded 0 here was one quantity governed by two numbers (G11).
 */
function adjustPopulation(
  save: SaveEnvelope,
  balance: Balance,
  nodeId: string,
  lineId: string,
  delta: number,
): SaveEnvelope {
  const state = save.nodeStates[nodeId];
  if (!state) {
    throw new SaveCorruptError(
      `action log names node "${nodeId}", which this save has no state for — ` +
        `the log does not belong to this save`,
    );
  }
  const pop = state.populations[lineId];
  if (!pop) {
    throw new SaveCorruptError(
      `action log names species line "${lineId}" at node "${nodeId}", which has no such ` +
        `population — the log does not belong to this save`,
    );
  }
  const nodeStates: Record<string, NodeState> = { ...save.nodeStates };
  nodeStates[nodeId] = {
    ...state,
    populations: {
      ...state.populations,
      // build-doc §7.3 step 4's clamp has ONE implementation, in core/ecosim.ts. This module used
      // to restate it as `Math.max(populationFloor, count + delta)` — no upper bound — so replaying
      // a release at carrying capacity produced carryCap + 1 while the live path clamped, and
      // locked decision L10 ("identical (seed, actionLog) ⇒ byte-identical final save") was false
      // for any save whose log contained a release at a full node.
      [lineId]: { ...pop, count: clampPopulationCount(pop.count + delta, pop.carryCap, balance) },
    },
  };
  return { ...save, nodeStates };
}

/**
 * Replay an action log onto an initial save. Pure, and the whole point of L10: the same
 * (initial save, action log, deps) always produces the same final save, byte for byte.
 *
 * Actions this module applies itself:
 *   yearTurn   — core/lifecycle.ts `runYearTurn` (build-doc §7.5)
 *   retirement — core/lifecycle.ts `resolveRetirement` (build-doc §7.5 step 3)
 *   seasonStep — the injected `ecosimStep` (build-doc §7.3)
 *   gymVictory — core/acts.ts `awardBadge` + core/lifecycle.ts `enterPendingActs`. The badge is the
 *                act model's only numeric input and act entry applies the Cullbrand raid,
 *                so a tape without this case replays a run with no badges and an unharvested r4.
 *   battleAftermath — `applyBattleAftermath`: the curHp / level / xp a fight left on the party, and
 *                the bag it left behind. A named `case` since T-33 put it in the `GameAction` union.
 *   blackout   — `applyBlackout`: the party back on its feet and the node the player woke in, after
 *                a fight left nothing standing. Dispatched from `default` for the same reason;
 *                see BLACKOUT_ACTION. Its PRICE is not here — it rides as the ordinary `inn` /
 *                `travel` entries beside it, which cost this module nothing and cost
 *                `game/year-replay.ts` `clockFromLog` exactly what `balance.clock` says.
 *   innRest    — `restoreParty`: the party back at full after a night at an inn, with no move. Its
 *                price is the `inn` entry beside it, on exactly the terms the blackout's is. This
 *                arm was MISSING while `core/recovery.ts` minted the entry, which made L10 false
 *                for every run that slept; see INN_REST_ACTION and the arm itself.
 *   catch/release — BOTH halves. The node-population delta build-doc §7.3 attributes to the action
 *                   itself ("Player catch/release directly increments/decrements count at action
 *                   time"), AND the creature: `applyCaught` puts back the individual the `catch`
 *                   entry carries, `applyReleased` takes back off the one the `release` entry names.
 *                   The party/box side used to be delegated to `applyOther` because the entry did
 *                   not carry the individual's age, level and traits — see the section above
 *                   `catchAction` for what that cost. `applyOther` is still called for both, after.
 */
export function replay(
  initial: SaveEnvelope,
  log: readonly ActionLogEntry[],
  deps: ReplayDeps,
): SaveEnvelope {
  /*
   * `initial` means initial. Replaying a MID-RUN save's own log onto itself — the obvious shape for
   * "reload and continue" — re-applies every catch, release and year turn the save already contains,
   * and the wrong survey it produces is silent unless the log happens to hold a retirement. Reload
   * is `readSlot` + `openStreams`; replay is for a run rebuilt from its beginning.
   */
  if (initial.actionLog.length > 0) {
    throw new SaveCorruptError(
      `replay() takes the INITIAL save of a run, but this one already carries ` +
        `${initial.actionLog.length} logged actions — replaying its own log onto it would apply ` +
        `every action twice. To resume a saved run, use readSlot() + openStreams().`,
    );
  }

  let save: SaveEnvelope = { ...initial, actionLog: [] };
  let pending: YearRetirementPrompt[] = [];
  const applied: ActionLogEntry[] = [];

  const seasonOrder = deps.balance.clock.seasonOrder;

  for (const entry of log) {
    // The tape's own numbering is part of the save (build-doc §7.8). A gap or a repeat means the
    // log was assembled wrong, and renumbering it here would hide that forever.
    if (entry.seq !== applied.length) {
      throw new SaveCorruptError(
        `action log entry ${applied.length} is numbered ${entry.seq} — the log must be a gapless ` +
          `sequence from 0`,
      );
    }
    const action = entry.action;
    switch (action.t) {
      case "yearTurn": {
        // The entry says which year it ends in. A log from another save replays to a silently
        // different year unless that is checked — the sibling `retirement` branch checks its own.
        if (action.year !== save.year + 1) {
          throw new SaveCorruptError(
            `action log replays the year turn into year ${action.year} but the save is in year ` +
              `${save.year} — the log does not belong to this save`,
          );
        }
        const turn = runYearTurn(save, deps);
        save = { ...save, ...turn.save };
        pending = turn.prompts;
        break;
      }
      case "retirement": {
        const choice = action.choice;
        const idx = pending.findIndex((p) => p.parentUid === choice.parentUid);
        const prompt = pending[idx];
        if (!prompt) {
          throw new SaveCorruptError(
            `action log replays a retirement for "${choice.parentUid}" with no pending prompt — ` +
              `the log does not belong to this save`,
          );
        }
        pending = [...pending.slice(0, idx), ...pending.slice(idx + 1)];
        if (deps.rng) rollHeirChoice(prompt, deps.rng, deps.balance, save.year);
        try {
          const result = resolveRetirement(save, prompt, choice, deps);
          save = { ...save, ...result.save };
        } catch (err) {
          if (!(err instanceof LifecycleError)) throw err;
          // Live play never logs a choice it could not apply (`advanceYear` substitutes and reports
          // instead), so one in a log is a log that does not belong to this save.
          throw new SaveCorruptError(
            `action log replays an unapplicable retirement for "${choice.parentUid}": ` +
              `${err.message} — the log does not belong to this save`,
          );
        }
        break;
      }
      case "seasonStep": {
        if (deps.ecosimStep && seasonOrder.includes(action.season)) {
          const nodeStates: Record<string, NodeState> = {};
          for (const nodeId of Object.keys(save.nodeStates)) {
            const state = save.nodeStates[nodeId];
            if (!state) continue;
            // Cloned exactly as `runYearTurn` clones: `EcosimStepFn` is free to mutate and return
            // its argument, and replay's purity must not depend on which one core/ecosim.ts does.
            nodeStates[nodeId] = deps.ecosimStep(nodeId, cloneNodeState(state), action.season);
          }
          save = { ...save, nodeStates };
        }
        break;
      }
      case "gymVictory": {
        /*
         * THE ACT HALF OF L10. Before the raids moved off the calendar they rode on the `yearTurn`
         * entry, which this switch has always handled; keyed on the act they ride on this
         * entry instead, and this case did not exist. Measured on a three-victory tape: live r4
         * ashvole 3 / cragmar 2 / recentDeaths 19 against replayed 14 / 10 / 0, with no badges and
         * act 0 — a replay that silently disagreed with the run it was replaying.
         *
         * It is `awardBadge` + `enterPendingActs`, the same two calls in the same order the live
         * path makes (`OverworldScene.winGym`), so there is no second answer to "what does a badge
         * do" here. `enterPendingActs` is idempotent through `ACT_ENTERED_FLAG`, exactly as the
         * live path relies on.
         */
        save = { ...save, ...awardBadge(save, action.gymId, deps.balance) };
        const entered = enterPendingActs(save, {
          balance: deps.balance,
          gyms: deps.gyms,
          ...(deps.yearEvents === undefined ? {} : { yearEvents: deps.yearEvents }),
        });
        save = { ...save, ...entered.save };
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      case "catch": {
        save = adjustPopulation(save, deps.balance, action.nodeId, action.lineId, -1);
        /*
         * THE CREATURE. `caughtFromCatchAction` returns null for a tape written before the entry
         * carried one, which replays exactly as it always did — the population moves and the party
         * does not — and throws for one that carries a BROKEN record. Both are deliberate; the
         * section above `catchAction` says why, and says what the silent-null case costs.
         */
        const caught = caughtFromCatchAction(action);
        if (caught) save = applyCaught(save, caught);
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      case "release": {
        save = adjustPopulation(save, deps.balance, action.nodeId, action.lineId, +1);
        // The release's creature half needs NOTHING new on the tape: `uid` is the whole of a
        // removal, and the entry has always carried it. `applyOther` never did this either.
        save = applyReleased(save, action.uid);
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      case "battleAftermath": {
        /*
         * WHAT THE FIGHT COST THE PARTY AND THE BAG — curHp, level, xp and the items spent. A named
         * `case` since `battleAftermath` joined `core/types.ts` `GameAction`; it used to be
         * dispatched from `default` through `readBattleAftermath`, which is now what checks the
         * shape of an entry that reached us through the permissive schema rather than through
         * `battleAftermathAction`.
         *
         * ⚠ WITHOUT THIS ARM, L10 IS FALSE THE MOMENT HP PERSISTS. The sibling `case "battle"`
         * deliberately re-applies nothing (it is the half-tick charge, not the fight), and that was
         * correct only while a fight left no mark on the save. It now leaves three — curHp, level
         * and xp on the party, and the bag — and none of them can be re-derived from the tape,
         * because neither the encounter roll nor the player's in-battle actions are logged at all.
         */
        const aftermath = readBattleAftermath(action);
        if (aftermath) save = applyBattleAftermath(save, aftermath);
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      case "battle": {
        /*
         * NAMED, NOT LEFT TO `default`, AND THE STATE SIDE REALLY IS EMPTY. A `battle` entry is the
         * half-tick CHARGE levied at launch (`core/types.ts` `GameAction`), not the fight: every
         * consequence of the fight reaches the tape as its own entry — the population write as a
         * `catch`/`release`, the badge as a `gymVictory`, and what the fight cost the party and the
         * bag as the `battleAftermath` the `default` arm applies — so there is nothing here for
         * replay to re-apply, and `applyOther` is called exactly as `default` would have called it.
         *
         * ⚠ AND YET IT MUST NOT BE SILENT, because the CLOCK is a different question and this
         * module deliberately does not answer it. `replay` models no clock at all — travel, foray
         * and inn move no tick here either — so the tick a battle cost is rebuilt from the tape by
         * `game/year-replay.ts` `clockFromLog`, which is where the price is read out of
         * `balance.clock.battleTicks`. That function priced a battle at zero when this arm was
         * added, and a run with an odd number of battles rebuilt into the WRONG YEAR (measured:
         * live year 2 tick 0 subTick 1, from the log year 1 tick 51 subTick 0) — an L10 / §8.1
         * determinism failure. This case exists so the next reader of the tape finds the pointer
         * instead of a fall-through that looks like the whole answer.
         */
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      case "blackout": {
        /*
         * THE BLACKOUT. A named `case` since `blackout` joined `core/types.ts` `GameAction`; it used
         * to be dispatched from `default` through `readBlackout`, which is now what checks the shape
         * of an entry that reached us through the permissive schema rather than through
         * `blackoutAction`. That is the same split its sibling `case "battleAftermath"` makes, and
         * for the same reason — the discriminant is a claim, not a proof.
         *
         * ⚠ WITHOUT THIS ARM A REPLAYED RUN WAKES UP SOMEWHERE ELSE. The blackout is the only
         * action that moves `currentNode` without a `travel` of its own reaching a handler here —
         * the priced `travel` entry beside it is a CHARGE, and `replay` deliberately applies no
         * state for it (see `case "battle"`). So a tape replayed without this leaves the player
         * standing on the route they went down on, with a party still at zero, which is the exact
         * unactable save the recovery exists to prevent.
         */
        const blackout = readBlackout(action);
        if (blackout) save = applyBlackout(save, blackout);
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      case "innRest": {
        /*
         * ONE NIGHT AT AN INN — the party back at full, and nothing else. `readInnRest` for the
         * reason its siblings `case "blackout"` and `case "battleAftermath"` use theirs: this entry
         * reaches us through `core/schemas.ts`'s permissive `looseObject`, so the discriminant is a
         * claim and not a proof, and a malformed one changes nothing rather than throwing.
         *
         * ⚠ THIS ARM WAS MISSING AND L10 WAS FALSE FOR ANY RUN THAT SLEPT. `core/recovery.ts`
         * `applyInnRest` has minted `{t:"innRest"}` since the inn began healing what it charges
         * for; this switch had no arm for it and this module never imported its reader, so the
         * entry fell through `default` and applied NOTHING. Live, the rest deletes `curHp` across
         * the fieldable party; replayed, the party stayed exactly as hurt as the fight left it —
         * on the tape build-doc §8.1 and L10 promise replays byte-identically. The single shipped
         * `applyOther` (`game/year-replay.ts` `replayRegionHooks`) does not read it either, so
         * there was no host quietly covering for the gap.
         *
         * ⚠ NO CLOCK HERE, AND THAT IS NOT AN OMISSION. The rest's PRICE is the `{t:"inn", townId}`
         * entry `game/scenes/OverworldScene.ts` `restAtInn` writes beside this one, which
         * `game/year-replay.ts` `clockFromLog` charges out of `balance.clock.innTicks` — an entry
         * is a price or a consequence and never both. `replay` models no clock at all (see
         * `case "battle"`).
         *
         * ⚠ AND NO MOVE. `restoreParty` is `applyBlackout` narrowed to the party: the wake node is
         * this save's own `currentNode` and `interiorId` is put back, because the player is asleep
         * in a room in the town they are already standing in.
         */
        const restored = readInnRest(action);
        if (restored) save = restoreParty(save, restored);
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
      default: {
        /*
         * AN ENTRY THIS BUILD DOES NOT KNOW — and it changes state deliberately not at all. INV-2:
         * a save written by a later build, or by a lane whose action has since been renamed, still
         * loads and still replays; it simply cannot say what that entry meant. `applyOther` is
         * called exactly as every named arm calls it, so a host that DOES understand the entry can
         * still act on it.
         */
        if (deps.applyOther) save = deps.applyOther(save, entry);
        break;
      }
    }
    // `subTick` is carried, not recomputed. `appendAction` always writes it, so dropping it here
    // made `replay(save.actionLog)` produce a log that differed from the one it was replaying —
    // L10 / §8.1 require identical (seed, actionLog) to yield a byte-identical save, and a run
    // containing an odd number of half-tick battles failed that by exactly one sub-tick.
    applied.push({
      seq: applied.length,
      year: entry.year,
      tick: entry.tick,
      subTick: entry.subTick ?? 0,
      action: entry.action,
    });
  }

  return { ...save, actionLog: applied };
}
