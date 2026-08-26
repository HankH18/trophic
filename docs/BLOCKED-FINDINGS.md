# BLOCKED FINDINGS — recovered from the Lanes B+C workflow (wf_a47ab7a4-32c)

**Written 2026-08-25, after the 25-agent Lanes B+C workflow completed.**
Every entry below was **reproduced by an agent that could not fix it**, because the file belonged to
another agent's scope and was being written at that moment. The agents are gone; the defects were
not. This file is the durable record so they can be dispatched.

**Every entry has been re-verified against the tree as it stands now** — after the repair passes
landed. Entries are marked `STILL PRESENT` or `ALREADY FIXED`, and the already-fixed ones are in
§7 at the end so nobody re-investigates them.

Provenance: 102 `blockers` entries from 16 build/repair agents, plus 209 findings from 24 auditor
agents (66 of them confirmed critical/major or silent-failure minors) were extracted from the
workflow journal and checked one by one. **36 distinct findings are still present. 68 are already
fixed.**

---

## 1. Read this first

**Three of these are critical, and two of them are the same shape: a defect that the test suite
actively certifies as absent.** The game cannot be walked past its first node — a new save sits at
Hearthollow in act 0, and the act-1 gate needs a quest flag that only `data/dialogue.json` writes
while nothing in `game/` plays dialogue at all (**BF-1**). Nothing past that is reachable either,
because acts 2–6 open on badges and **no code path awards a badge** — `awardBadge` and `winGym` are
both written and tested, and `winGym` has no caller anywhere in the repo (**BF-2**). That includes
Cindershelf/`r4`, the only node where the cascade beat occurs. The suite is green through both
because the two tests that would catch them assert *source text* — that the method exists — rather
than that anything calls it.

The same failure mode has a third instance that is worse, because it is a test whose green means the
**negation** of what it says: `tests/integration/seams.test.ts:327` is named *"HONEST GAP: nothing in
production wires battle's catch to the survey yet"*, and it is green **because the wiring it greps
for landed in a file that is not on its source list** (**BF-3**). Its own comment instructs whoever
finds it to replace it with a real test.
**BF-3 is RESOLVED (2026-08-25)** — and the sweep its last paragraph asked for turned out to be the
larger half: **nine** test files in this class, including an identical hand-written-source-list twin
one block below the named test, and the discovery that **G7 has no repo-wide gate at all**. See the
resolution block on that entry. And a fourth, **BF-4**: a wild Ancient can be rolled at age
J or A, which is 12 sprite keys with no manifest row — while
`tests/unit/battle-view.test.ts:1706-1716` asserts the manifest matches "the keys the running game
can ask for" by *computing that set from the invariant the encounter roll violates*.

One pipeline defect would ship visibly broken art: **BF-5** (B-D35), the `backgroundTolerance: 12`
literal that survived the repo-wide `12 → 24` fix, on the live command that produces the player's
back and side sprites — they would ship in an opaque white box.
**BF-5 is RESOLVED (2026-08-25)** — reproduced, fixed at all four sites by deleting the number's
other homes, and the invariant extended to fail any call site that hardcodes its own tolerance. See
the resolution block on that entry; closed as B-D50.

**Nothing here is fixed by this document. It records only.**

---

## 2. Live state at the time of writing

- `npx vitest run` → **37 files, 1917/1917 passing** (06:41).
- `npx tsc --noEmit` → **NOT clean.** `core/dialogue-schema.ts` (`Cannot find name 'ACT_BALANCE'`,
  `'ACT_GYMS'`) and `tests/unit/dialogue.test.ts` (`no exported member 'ACTS_TOTAL'`). This is the
  concurrent time-model workflow mid-edit — `core/dialogue-schema.ts` was written at 06:42 while
  this was being checked. Not a finding; transient.
  *(Re-checked twice during the BF-5 repair, and it moves: at **07:19** `npx tsc --noEmit` was
  **clean** and `npx vitest run` was 37 files / **1946 passing**. By **07:26** the time-model
  workflow had landed another in-flight edit — `ReplayDeps` now requires `gyms`, `ForayContext` lost
  `year`, `core/regional-events.ts` renamed `bloomWindows` — and the tree is red again: ~40 tsc
  errors and 28 failures across `tests/unit/{acts,overworld-scene,regional-events,year-turn-ux}`.
  **All of it is in that workflow's files.** Nothing in the BF-5 change touches `core/` or `game/`;
  `tests/unit/postprocess.test.ts` + `tests/gates` run 488/488 green throughout. Treat the numbers in
  this section as a timestamp, not a baseline, until that workflow lands.)*
- **A concurrent workflow currently owns** `core/clock.ts`, `core/lifecycle.ts`,
  `core/dialogue-schema.ts`, `core/acts.ts`, `game/scenes/YearTurnScene.ts`, `game/year-events.ts`,
  `game/scenes/OverworldScene.ts`, `game/registry.ts`, `data/gyms.json`, `data/balance.json`,
  `data/dialogue.json`, `tools/harness/**`. Findings landing in those files are tagged
  **⚠ CONCURRENT** and **cannot be dispatched until that workflow finishes.**
- **`core/acts.ts` should be treated as concurrently owned even though it was not on the declared
  list.** At 06:44:34 a transient edit added to `actOf`:
  ```ts
  const y = (save as { year?: number }).year;
  return typeof y === "number" ? Math.max(act, Math.min(lastAct(balance), y)) : act;
  ```
  directly beneath that function's own comment *"THE CLOCK IS NOT AN INPUT. There is no `year`
  parameter here and there must never be one."* It was reverted within ~90 s. **Had it landed it
  would silently re-couple acts to the calendar and make BF-1 and BF-2 *look* fixed** without a
  badge or a quest flag ever existing.
- Line numbers below are as of ~06:50. Re-check before editing anything tagged ⚠ CONCURRENT.

---

## 3. CRITICAL — ships visibly broken, or a test certifies a falsehood

### BF-1 · The vertical slice is not walkable past Hearthollow ⚠ CONCURRENT
**Scope:** `data/balance.json`, `data/dialogue.json`, a new dialogue runtime under `game/` (Lane C7)
**Reported by:** integrator (blocker #0) — *"Highest-priority item for the next wave."*
**Status: STILL PRESENT** — verified by executing the real `core/acts.ts` against the real shipped data.

Every link in the chain was confirmed:

1. `data/balance.json:202` — `{ "act": 1, "badges": 0, "flags": ["story.opening.done"], "nodes": ["hearthollow","r1"] }`
2. `game/boot.ts:406-409` — a new game is `newSave({ currentNode: startNodeId(content) })`;
   `startNodeId` (`:311-313`) returns `content.gyms[0].town` = **hearthollow**. `questFlags` empty.
3. `game/scenes/OverworldScene.ts:1049` refuses:
   ```ts
   const needed = unlockActOf(nodeId, this.balance);
   if (needed !== null && this.act() < needed) {
     this.flashBanner(`${nodeId} opens in act ${String(needed)} · act ${String(this.act())}`);
     return;
   }
   ```
4. `story.opening.done` is written in **exactly one place in the shipped product** —
   `data/dialogue.json:542, :566, :590` (`setFlags`). Every other repo hit is a test constructing it
   by hand or a doc.
5. **Nothing in `game/` plays dialogue.** `core/dialogue-schema.ts` has zero importers outside
   `tests/`. `game/scene-keys.ts` has ten keys and none is a dialogue scene. The only mentions of
   `dialogue.json` under `game/` are two comments.

Executed against shipped data — fresh save: `act 0`, `badgeCount 0`, `unlocked nodes: [ 'hearthollow' ]`.
`unlockActOf`: hearthollow 0, r1 1, brackwater 2, r2 2, bowerdeep 3, r3 3, cindershelf 4, **r4 4**,
duskhollow 5, r5 5, sanctum-approach 6, sanctum 6.

**Consequence:** build-doc §1's never-cut walkability (Hearthollow → R1 → Brackwater → R2) cannot be
played at all. Neither demo beat can be produced by playing.

**Fix:** two independent routes. (i) Build the dialogue runtime and the opening beat — the real fix,
Lane C7. (ii) An interim writer of `story.opening.done` at new-game or on first prop interaction.
**Route (ii) alone still leaves BF-2 blocking everything past r1.**

#### RESOLUTION — route (i) shipped; the diagnosis above is now HISTORICAL

**Status after the wiring wave: RESOLVED 2026-08-25.** The `**Status: STILL PRESENT**` line above is
kept verbatim as the record of what was measured then; it is **no longer true of the tree**, and this
block is the correction. Re-verified by reading the current source, not by trusting a report:

- **Item 5 is dead.** `core/dialogue-schema.ts` now has shipping importers under `game/`, and
  `game/dialogue-runner.ts` is the Lane C7 runtime the "real fix" called for
  (`game/dialogue-runner.ts:39` imports `entryById` / `speakerById`; `game/scene-keys.ts:41` is the
  dialogue scene key `dialogue: "Dialogue"`, described by the build-doc §15 C7 comment at `:36`). `data/dialogue.json` is played, not merely validated.
- **`story.opening.done` is now written by the corpus on the normal path**, as route (i) required.
  ⚠ **Stated precisely, because it is not a deletion:** `OverworldScene.openPrologue` now resolves in
  the order *lane hook → **corpus** → stand-in* (`game/scenes/OverworldScene.ts:1662-1699`). When the
  corpus can deliver the flag from here, the method writes nothing and the opening cutscene plays
  itself, **and the "provisional" banner and console line are gone from that path** — that is the
  visible difference. The `hooks.onOpeningBeat` override still exists and still wins
  (`:237`, `:1682`), and **the stand-in is deliberately kept** as a last resort: without it, a corpus
  that fails to load would lock the player inside Hearthollow for ever, which is a worse failure than
  a declared stand-in.
- **Walkability is not blocked by this finding any more.** BF-2, its stated blocker, is also resolved
  — see the resolution block on that entry.

**What this finding did NOT cover, and what was found once the runtime existed:** wiring the corpus
up revealed that **39 of 211 entries / 83 of 499 lines had no path to the screen at all** — every gym
leader's pre- and post-battle speech, all eighteen rival encounters, and both epilogues. That is a
separate defect class from "nothing plays dialogue", and it is now permanently gated by
`tests/gates/reachability.test.ts` (build-doc §8.5 / §10.7). See `docs/DEVIATIONS.md` D-Q8-1…D-Q8-6,
D-W3-1…D-W3-10 and D-W4-6.

---

### BF-2 · Gyms award no badges; acts 2–6 are unreachable ⚠ CONCURRENT
**Scope:** `game/scenes/OverworldScene.ts` (a caller + key binding), `game/wild-battle.ts` (a
`kind:"gym"` `BattleInput`), `data/gyms.json`
**Reported by:** integrator (blocker #1) — *"Second-highest priority."*
**Status: STILL PRESENT** — the plumbing landed; the caller did not.

What **did** land: `core/acts.ts:122` `awardBadge()`, and `game/scenes/OverworldScene.ts:798`:
```ts
winGym(gymId: string): void {
  const before = this.act();
  this.save = appendAction(this.save, { t: "gymVictory", gymId });
  this.save = { ...this.save, ...awardBadge(this.save, gymId, this.balance) };
  this.advanceActs();
```

What did not: **any caller.** A repo-wide grep for `winGym` returns exactly three hits — the
definition, and two *source-text* test assertions:
`tests/unit/year-turn-ux.test.ts:2923` `expect(overworld).toContain("winGym")` and `:2883`
`["awardBadge","game/scenes/OverworldScene.ts"]`. **That is why this reads green.**
`OverworldScene.ts:451-467` binds W/A/S/D, cursors, C, R and 1–6 — **no gym key.** No scene launches
a gym battle. The only battle `game/` can construct is `game/wild-battle.ts:192` `kind: "wild"`;
every `kind:"gym"` in the repo is in `tools/harness/` (`gym-sim.ts:125,:269`, `round-robin.ts:164`).

Act gates 2–6 (`data/balance.json:203-207`) are **pure badge counts** — no flags, no alternative:

| act | requires | opens |
|---|---|---|
| 2 | 1 badge | brackwater, r2 |
| 3 | 2 badges | bowerdeep, r3 |
| 4 | 3 badges | cindershelf, **r4** |
| 5 | 4 badges | duskhollow, r5 |
| 6 | 5 badges | sanctum-approach, sanctum |

**Consequence:** Brackwater, Bowerdeep, **Cindershelf and r4 — the only node where the cascade beat
occurs** — Duskhollow, the Sanctum and every route past r1 are unreachable in play. The finale flag
`story.greaves.beaten` is act-6 content, so a run can never complete.

**Stub-blindness note that matters:** `tools/harness/full-run.ts:311-321` walks all six acts by
**writing the flags and badges directly** (`for (const flag of gate.flags) flags[flag] = true; …
save = awardBadge(save, gym.id, balance);`). That is defensible for what it tests — but it means
`docs/BALANCE-REPORT.md`, the act-entry raid firing, and every harness green describe a six-act
playthrough **no player can perform.**

**Fix:** smaller than originally scoped. `awardBadge` and `winGym` are written and tested. Missing is
the gym battle path: a way to reach a leader (prop interaction or town action), a `kind:"gym"`
`BattleInput` built from `data/gyms.json` (`gymForAct` at `core/acts.ts:175` already resolves the
leader), and a call to `winGym` on outcome `"win"`. Pair with **BF-10e** so the beat opens with the
leader's name instead of `"Gym battle"`.

#### RESOLUTION — the caller landed; the diagnosis above is now HISTORICAL

**Status after the wiring wave: RESOLVED 2026-08-25.** The `**Status: STILL PRESENT**` line above is
kept verbatim as the record of what was measured then. The missing caller now exists:
`game/scenes/OverworldScene.ts:1392` — `if (won) this.winGym(gym.id);` inside the gym battle's
`onFinished`. The gym battle path this entry specified is `challengeGym` → `playBattlePre` →
`launchGymBattle` → `onFinished`, and `data/gyms.json` supplies the roster.

**The ordering constraint this entry could not have known about, recorded because it is load-bearing:**
`winGym` must be called **before** the leader's `battle-win` line is played, not after. Measured
against the corpus: **five entries write `gym.<id>.beaten` themselves** — `maribel.post.win` and its
**four** siblings `odo.post.win`, `vesper.post.win`, `sable.post.win`, `noct.post.win` — and
`greaves.finale.post` separately writes `story.greaves.beaten`. Playing any of them before
`awardBadge` would advance the act ladder in the middle of the scene announcing it. The order is
documented at `game/scenes/OverworldScene.ts:1345-1351`.

> ⚠ **Source-comment defect found while verifying this, not fixed here (this lane owns docs only).**
> `game/dialogue-runner.ts:122` says *"`maribel.post.win` and its **five** siblings"*. There are
> **four** siblings — five writers in total. `game/scenes/OverworldScene.ts:1347` states it correctly
> as *"and its four siblings"*. The two comments contradict each other; the OverworldScene one
> matches the data. Nothing depends on the number, so this is a comment defect, not a behaviour bug.

**The stub-blindness note above stands and is worth keeping.** `tools/harness/full-run.ts` still walks
the six acts by writing flags and badges directly. That remains defensible for what the harness tests,
but it is exactly the pattern that let this defect hide — and it is the reason
`tests/gates/reachability.test.ts` refuses to accept a precondition the tests themselves supply
(build-doc §8.5).

---

### BF-3 · A green test that asserts the negation of the truth
**Scope:** `tests/integration/seams.test.ts`
**Reported by:** C2 repair (blocker #2) — *"stale test outside my scope"*
**Status: RESOLVED 2026-08-25 — the named test, AND the sweep its last paragraph asked for.**
Nine test files, three categories, four previously unreported defects. See the resolution block at
the end of this entry; the diagnosis below is left verbatim as the record of what was wrong.

```
tests/integration/seams.test.ts
327  it("HONEST GAP: nothing in production wires battle's catch to the survey yet", () => {
336    const sources = [
337      ...["battle","ecosim","lifecycle","save","clock","foodweb","rng","schemas","types"].map(
338        (m) => `core/${m}.ts`,
339      ),
340      "game/main.ts",
341    ];
344    const callsBoth = /caughtIndividual\s*\([^)]*\)[\s\S]{0,800}?(applyCatch|adjustPopulation|t:\s*"catch")/.test(joined);
348    expect(callsBoth, "battle→survey wiring now exists in production code — replace this stand-in with a test of it").toBe(false);
```

The wiring it claims does not exist **is in `game/wild-battle.ts`, which is not on the list**:
`:234` `applyCatchToSave`, `:261` `applyCatch(live, caught.lineId, content.balance)`, `:272`
`appendAction(save, { t: "catch", …`, `:342` `caughtIndividual(opts.state, opts.ctx)`. It is reached
in play from `game/scenes/OverworldScene.ts:665`.

The test's own comment says *"If this assertion ever fails, the wiring arrived and this test should
become a check of the real thing."* The wiring arrived; the assertion did not fail; the search never
looks there. **This is why the catch→survey join could land with its obsolete stand-in left in
place.**

**Fix:** a delete-and-replace, not a widening. Adding `game/wild-battle.ts` to the list turns it red
immediately, which is correct — replace it with a behavioural test of `applyCatchToSave`.

**The same failure mode recurs** at `tests/unit/year-turn-ux.test.ts:2883, :2923` — which is exactly
why **BF-2**'s missing caller reads green. Sweep for source-list-scoped greps used as behavioural
assertions while fixing this.

#### RESOLUTION — the named instance was already fixed; the SWEEP it asked for had not been done

**Status after the sweep (2026-08-25): the class is closed in nine test files, and the sweep found
four defects nobody had reported.** The one test BF-3 names was replaced correctly by an earlier
pass. What that pass did not do is the last paragraph above — *"sweep for source-list-scoped greps
used as behavioural assertions"* — and every finding below came out of doing it. **Test files only;
no `game/`, `core/`, `data/` or `tools/` source was changed.** Every replacement was proved by
sabotaging the thing it now asserts, watching it go red, and restoring the file byte-for-byte
(sha256 checked before and after, in both directions where the assertion is two-sided).

**The taxonomy, as it actually came out.** A test that certifies an absence fails in one of three
ways, and all three are present here:

| category | what it looks like | files |
|---|---|---|
| **A · the gap CLOSED and the test still asserts it is open** | green while stating the negation of the truth | seams `:329` *(already fixed)*, wild-battle header *(already fixed)* |
| **B · the gap is OPEN and nothing will say when it closes** | passes while the hole persists, and passes after it is filled | demo-beats `:367`, collision `:469`, regional-events `:407`, battle-view `:1706` |
| **C · a SOURCE-SUBSTRING assertion standing in for a behaviour** | `expect(source).toContain("winGym")` — satisfied by the declaration | year-turn-ux `:2923`/`:2962`, seams `:516`, battle-view `LANE_C3_FILES`, survey-view §13 |

##### Per file

1. **`tests/integration/seams.test.ts`** — **A (already fixed) + C (NOT fixed, found here).** The
   test BF-3 names is gone and its two replacements run `applyCatchToSave` and walk every `core/` and
   `game/` source. **But its identical twin, one describe block below, was untouched:** `:516`
   *"core/rng.ts is the only generator"* iterated **a hand-written list of six `core/` modules**
   (`battle, ecosim, lifecycle, save, clock, foodweb`). `core/` holds twelve — `acts.ts`,
   `regional-events.ts`, `dialogue-schema.ts`, `quests.ts`, `schemas.ts`, `types.ts` were **never
   scanned**, so a second xorshift landing in any of them was invisible to the only test that forbids
   one. Same file, same mechanism, same page. Now discovers `core/` by walking it, exempts
   `core/rng.ts` by path, and asserts the home of the generator *does* shift bits so the scan cannot
   be vacuously clean. **RED/GREEN:** planting `(s ^ (s >>> 17)) >>> 0` in `core/acts.ts` — a file the
   old list did not name — fails it (`['core/acts.ts']`); reverted, green.

2. **`tests/unit/year-turn-ux.test.ts`** — **C, and this is the live instance BF-2 blames.**
   `:2962` `expect(overworld).toContain("winGym")` is satisfied by `winGym`'s own **declaration** in
   that file, and so are `restAtInn` and `onRunComplete`. The `:2923` block's *"every read-side
   function has a caller in a scene"* used `source.includes(`${name}(`)`, which has the same hole for
   any name declared where it is asserted. Replaced with a `callSites()` helper that strikes the
   declaration out first — a bare `name(` at line start is a call when a statement follows the
   argument list and a declaration when a body does — plus optional-call (`?.(`) support. A new
   `it("BINDS the instrument …")` is the permanent positive control: it feeds the helper the exact
   dead-`winGym` shape and asserts `callSites` returns `[]` *while the old assertion still passes on
   it*. **RED/GREEN:** deleting the single `this.winGym(gym.id)` call site from
   `game/scenes/OverworldScene.ts` now fails with *"no code path awards a badge — acts 2..6 are
   unreachable"*; the old assertion stayed green under the same sabotage (`grep -c winGym` = 5).
   Reverted, sha256 identical.

3. **`tests/integration/demo-beats.test.ts`** — **B.** `:241` (the RELEASE half) was re-checked and
   is **honest** — `0 < released < SEEDS` goes red the day the release becomes a law — and was left
   alone. `:367` was not: the HONEST GAP note says the starter retires *three years early*, but the
   assertion was `firstWithoutStarter.year < leagueYear`, which **the repair also satisfies** (a
   schedule retuned to bible §4's *"peaks right before the league"* retires it in year 5, still
   `< 6`). So the test would have gone on passing through the very change it was written to wait for.
   The MEASURED year is now pinned (`RETIRES_AT = 4`, leagueYear 6, seed 7, through the shipped
   `driveYearTurn`) with a message telling the fixer to rewrite the note.

4. **`tests/unit/encounters.test.ts`** — **B, newly written.** BF-4 had no behavioural witness
   anywhere: the only test of the Ancient-age invariant restates it instead of asking the code. Added
   `"OPEN GAP (BF-4) — an unlocked Ancient still rolls at J and A"`, which drives the real
   `rollEncounterAt` at each Ancient's real host with the sign chain unlocked and asserts a non-Elder
   age IS produced. **MEASURED, 4000 seeds per line:** `undermere-line@r2` J 40 / A 37 / E 10 ·
   `kilnback-line@cindershelf` J 60 / A 54 / E 12 · `vellsire-line@sanctum` J 663 / A 528 / E 130.
   **RED/GREEN:** applying the BF-4 clamp in `game/encounters.ts` fails it with *"BF-4 IS FIXED"*.

5. **`tests/unit/battle-view.test.ts`** — **B + C, and the C half is a guardrail hole.**
   *(B)* `:1706`'s set identity derives "the keys the running game can ask for" from
   `line.ancient ? ["E"] : AGE_CLASSES` — the invariant, not the caller — so it is green whatever the
   encounter roll does. The identity is kept (it is what caught the invented key shape) and now says
   so; the blind spot is measured beside it by a new test that rolls the real encounter path and
   subtracts the manifest: **12 keys with no row**, all matching `-(j|a)-(front|back)`. Red when the
   clamp lands. *(C)* `LANE_C3_FILES` was a hand-written list of nine files used to enforce **G7** and
   Hard Req 8. **G7 has no repo-wide gate at all** (`grep -n "G7" tests/gates/` → nothing), so its
   only enforcement anywhere was three hand-written lists totalling 16 files. Both copy scans now
   walk every `.ts` under `game/` and `core/`. Measured across all of them: **zero** moralizing
   literals, and exactly **one** death-word literal — `game/survey-view.ts`'s `"recent deaths "`,
   the ecosim's own `recentDeaths` field printed as a real number (Hard Req 2), which is exempted **by
   its text, not by its file**, with an assertion that the exemption still matches something.
   `LANE_C3_FILES` survives for the two checks that are genuinely lane-scoped. **RED/GREEN:** pointing
   the walk at `tests/unit` (which holds a deliberately poisoned literal) fails both scans with 18
   offenders each.

6. **`tests/unit/collision.test.ts`** — **B.** The describe was titled *"no authored mask exists
   yet"* and **nothing asserted it**; every test inside hands `loadCollision` a `null` buffer, so all
   of them drive the synthesised branch whatever is on disk. A mask landing would have left the
   heading lying and no one prompted to re-measure. Now opens with the same shape
   `tests/unit/overlay-diff.test.ts:1032` already uses: no shipped node's declared mask is on disk.
   **RED/GREEN:** touching `assets/final/maps/r1-mask.png` fails it *and* fires overlay-diff's
   existing guard; removed, both green.

7. **`tests/unit/regional-events.test.ts`** — **B.** `:407` forbade two **spellings**
   (`regionalEvents.bloomSpawnMultiplier`, `encounter.bloomMultiplier`), so bible §9's bonus-spawn
   half could be built under a third name with the test still reporting it unbuilt. Added the
   structural half: `ForayContext` — the encounter roll's entire input surface — is pinned to its six
   fields, so a bloom cannot reach a spawn weight by any spelling without turning this red, plus an
   event-vocabulary scan of the module. **RED/GREEN:** adding `openEventWindows?: readonly string[]`
   to `ForayContext` fails it.

8. **`tests/unit/survey-view.test.ts`** — **C, defended by a false claim.** §13 justified reading
   source with *"The scenes value-import Phaser, which throws in the node environment, so — exactly as
   tests/unit/battle-view.test.ts does for `BattleScene` — they are checked by reading their source."*
   **Both halves are false:** `battle-view.test.ts` `vi.mock`s Phaser and EXECUTES `BattleScene`, as
   `overworld-scene.test.ts` does for the real `OverworldScene`, and `YearTurnScene` /
   `RetirementScene` run through exported `create*(P)` factories. Four of ten scenes are driven; the
   value-import is not the obstacle (BF-35 is). The comment now says the section is source-reading by
   default rather than by necessity, and the defect class it exists for — *a renderer that imports
   something and never draws it* — is asserted **directly** by a dead-method census instead of by
   re-checking the one instance by name. **RED/GREEN:** a new unreferenced method in `DexScene`
   fails it, and so does wiring one of the two already-dead methods.

9. **`tests/unit/wild-battle.test.ts`** — **A (already fixed) + one gap in the fix.** The header's
   stale note was corrected by the earlier pass and is accurate. But BF-3's replacement tests
   `applyCatchToSave`, the inner writer, while what `OverworldScene.finishWildBattle` calls is
   `applyWildBattleOutcome` — **untested anywhere in this file**, and its whole body is one
   three-state decision where `undefined` ("read it for me") and `null` ("I looked, there was none")
   mean opposite things. Added a test of all four branches. **RED/GREEN:** collapsing
   `opts.caught === undefined ? … : opts.caught` to `opts.caught ?? …` fails it.

##### REAL DEFECTS THE SWEEP UNCOVERED — none is fixed here; all are in source this scope may not touch

- **D-SWEEP-1 · `G7` is not enforced anywhere repo-wide, and was not before this change.** It is a
  fail-the-task guardrail (*"NO moralising copy about catching, anywhere, in any string"*) and
  `tests/gates/guardrails.test.ts` has **no G7 rule at all**. Until now the only enforcement was three
  hand-written file lists covering 16 files. Item 5 widens the scan to all of `game/` + `core/`, but
  **the right home is the gates file**, alongside `no_magic_numbers` and the `Math.random` ban, and it
  should cover `data/*.json` copy too — which item 5 deliberately does not, because dialogue copy is
  Hank's ruling (G2). Owner: whoever next holds `tests/gates/guardrails.test.ts`.
- **D-SWEEP-2 · `SurveyScene.setStates` and `SurveyScene.webLines` are dead public API.**
  `grep -rn "setStates\|webLines" game/ core/ tests/` returns their declarations **and nothing else**.
  `webLines`'s own doc says it exists "in a form a test can assert" and no test asserts it — and it is
  the only other caller of `renderWebEdge`, the symbol whose deadness §13 was written about. Pinned by
  the census in item 8, so a third one fails immediately. Fix is in `game/scenes/SurveyScene.ts`:
  wire them or delete them, then shorten the pinned list.
- **D-SWEEP-3 · BF-4 is confirmed live and now measured through the real roll**, not inferred: ~90 %
  of unlocked-Ancient encounters are J or A. See item 4 for the per-line numbers. Unchanged verdict,
  first hard evidence.
- **D-SWEEP-4 · `game/quests.ts` fails `no_shadow_tables`.** Landing from the concurrent Q7/Q3b
  stream while this sweep ran: `npx vitest run` reports
  `game/quests.ts names "Webvern" — content belongs in data/, not in code (G2/G3)`
  (`tests/property/foodweb.test.ts:584`). **Not this sweep's file and not this sweep's failure** — the
  nine files above are green — but it is the one red in the suite and its owner needs to see it.

##### Notes for whoever reads this next

- **The Q7/Q3b stream is live in the same tree.** `game/dialogue-runner.ts`, `game/props.ts`,
  `game/quests.ts` and `core/quests.ts` appeared while this ran, and `game/scenes/OverworldScene.ts`
  gained the dialogue/quest/prop wiring at 09:40. **BF-1 is closing.** A guard asserting "nothing in
  `game/` plays dialogue" was drafted and then **not written**, because it would have been born false
  — which is the same mistake this sweep exists to remove. Nothing was added touching the Vellsire
  outcome flags or the 12 quest turn-in flags either: `core/dialogue-schema.ts` now exports
  `externallyGrantedFlags` and `core/quests.ts` names D-INT-4 in its header, so that stream owns the
  instrument and a competing guard here would only collide with it.
- **Checked and found HONEST; deliberately left alone:** `demo-beats.test.ts:241`,
  `overlay-diff.test.ts:1032` (the model the collision fix copies), `manifest.test.ts:622`
  (`yearVariants` still empty), `manifest.test.ts:1285` (no map or mask on disk),
  `postprocess.test.ts:300` (`palette.json` still a placeholder — and explicit that freezing it is
  also a pass), `battle-view.test.ts:2969` (the step-kind census is a set identity, red in both
  directions), `overworld-scene.test.ts` §8 (guardrail scans, not gap tests).

---

### BF-4 · A wild Ancient can be fielded below Elder — 12 sprite keys with no manifest row
**Scope:** `game/encounters.ts` (preferred) or `tools/comfy/manifest.json`; plus
`tests/unit/battle-view.test.ts`
**Reported by:** C3 repair (blocker #0, logged C3-G8) and the integrator (blocker #7)
**Status: STILL PRESENT**

```
game/encounters.ts
172  export function rollEncounterAt(ctx: ForayContext, rng: Rng): Encounter | null {
173    const lineId = rollEncounter(encounterTable(ctx), rng);
174    if (lineId === null) return null;
175    const age = rollAge(ctx.balance, rng);
```
`rollAge` (`:140-144`) applies `balance.encounter.ageWeights` unconditionally. `grep -rn "ancient"
game/` → **zero hits** in `encounters.ts` and zero in `wild-battle.ts`;
`game/wild-battle.ts:122-126` passes `encounter.age` straight through with no clamp.

Ancient lines: `data/species.json:1180, :1230, :1280` (`"ancient": true`) — vellsire, kilnback,
undermere. The rest of the system pins them to Elder: `core/lifecycle.ts:361`
`const age: AgeClass = line.ancient ? "E" : opts.age;` and `tools/comfy/comfy-batch.ts:620-622`
`return line.ancient ? ['E'] : [...AGE_CLASSES];`. `tools/comfy/manifest.json` holds exactly 12
ancient rows and every battle one is `-e-`. **No `-j-` / `-a-` rows exist → 12 unmanifested
`(line, age, facing)` keys**, i.e. a permanent placeholder for the large majority of unlocked-Ancient
encounters.

**And the suite hides it.** `tests/unit/battle-view.test.ts:1706-1716` builds "the keys the RUNNING
GAME can ask for" as `line.ancient ? ["E"] : [...AGE_CLASSES]` and asserts set-equality with the
manifest — it **encodes the invariant `rollEncounterAt` violates instead of checking the code that
must uphold it.**

**Fix:** clamp in `rollEncounterAt`. Two constraints the fixer must respect:
1. **Do not change draw order.** `rollAge` must still be *called* (consuming its draw) and the result
   overridden, or the seed-replay contract at `game/encounters.ts:190-193` breaks.
2. The clamp needs the `SpeciesIndex` already on `ForayContext` (`ctx.species`) — **no signature
   change required.**
3. Fixing this without also making `battle-view.test.ts:1706-1716` derive its set from the encounter
   path leaves the same blind spot.

---

### BF-5 · B-D35 — the background-removal fix that one file missed
**Scope:** `tools/comfy/player-views.ts`, `tools/palette/*.mjs`
**Reported by:** Lane B repair (blocker #3) — *"still open from wave 1"*
**Status: RESOLVED 2026-08-25.** Reproduced first, then fixed at all four sites, with the invariant
extended to bind every call site rather than only the manifest classes. Evidence at the end of this
entry; closed in `docs/DEVIATIONS-lane-b.md` as **B-D50**. The diagnosis below is left verbatim
because it is the record of what was wrong.

```
tools/comfy/player-views.ts
411  const BG = { key: WHITE, tolerance: 12 };
417    return removeFlatBackground(quantize(nearestResample(trimBackground(src, BG), W, H), loadPalette()), BG);
```

Q4 / B-D33 moved this value to **24** everywhere else (commit `ab028db`): all 11 classes in
`tools/comfy/manifest.json` carry `"backgroundTolerance": 24` (lines 101, 125, 148, 171, 195, 218,
241, 264, 287, 310, 343) and `tools/postprocess/chain.ts:72` reads it
(`{ key: recipe.backgroundKey, tolerance: recipe.backgroundTolerance }`).
**`player-views.ts` is the only ship-path file still on 12.**

**Reachability — load-bearing, not dead code.** Not an npm script, but
`npx tsx tools/comfy/player-views.ts derive` is the named rebuild command for
`player-back-derived` / `player-side-derived` in `tools/comfy/manifest-b0.json:620, :676`, in
`assets/approved-trials/_player-views/README.md:48`, and in `docs/DEVIATIONS-lane-b.md:100` (B-D20).
`derive` calls `toSprite` at `:658`.

**Two defects in one:** the stale tolerance (the player's walk/back views would ship in an opaque
box under either candidate palette) and a G11 literal.

**Fix — correction to the original one-line proposal.** `manifest.classes.player` exists with
`postprocess.backgroundTolerance: 24`, `backgroundKey: "#ffffff"`, so
`recipeFor(classOf(m,'player'))` resolves cleanly and yields the same white key. But `loadManifest`
is `async` (`comfy-batch.ts:974`), `BG` is a module-level sync `const`, and `player-views.ts` has no
top-level await. **It is 2 imports plus moving the BG resolution inside the async `toSprite`** — ~4
lines. No import cycle: nothing in `comfy-batch.ts` / `chain.ts` imports `player-views.ts`.

**Three previously unreported siblings in the same class**, found during verification — all generate
the at-game-size comparison evidence the palette decision rests on:
`tools/palette/at-game-size.mjs:26` `const TOLERANCE = 12`,
`tools/palette/at-game-size-compare.mjs:32` (same), `tools/palette/cross-view.mjs:23` `TOL = 12`.

#### RESOLUTION — reproduced, fixed at all four sites, invariant extended

**All four sites held 12. None was already correct.** Confirmed by reading them, not assumed.

**Reproduced through the ship path before anything was changed.** A harness reproducing
`player-views.ts:417` verbatim — same imports, same `W`/`H`, same `BG` — was first proved
**byte-identical to the real exported `toSprite`** under the frozen palette, then run per palette
(the frame is the whole 32×48 subject box: `toSprite` uses `nearestResample`, so there is no
transparent letterbox):

| palette | white-image dev | 2nd-lightest dev | tol 12 | tol 24 |
|---|---|---|---|---|
| `data/palette.json` (frozen) | 4 | 44 | 1152/1536 opaque (384 cleared) | 1166/1536 (370) |
| `data/palette.candidate.json` | 13 | 41 | **1536/1536 opaque — 0 cleared** | 1166/1536 (370) |
| class-equal candidate | 20 | 45 | **1536/1536 opaque — 0 cleared** | 1165/1536 (371) |

The committed evidence PNGs prove it independently, without running anything: in
`assets/approved-trials/_palette-candidate/at-game-size/`, **every CANDIDATE and CLASS-EQ strip on
disk is 100 % opaque** (player 1536/1536, fox/puddlisk/fenmaw/duskstalk 9216/9216) while the FROZEN
strips are cut. Those files were written by `at-game-size-compare.mjs` at its local `TOLERANCE = 12`
— i.e. the palette decision's own evidence was five solid rectangles per candidate. Re-running the
fixed script produces cut sprites that converge across palettes (player 1166/1166/1165; puddlisk
6765/6769/6769; fenmaw 4750/4745/4740; fox 6305/6297/6296; duskstalk 3715/3711/3709).

**Fixed by removing the number's other four homes, not by editing four numbers.**
`tools/postprocess/chain.ts` now exports `backgroundOf(recipe)` — the single place the key and the
tolerance are paired, used by `processRaster` — and `backgroundForClass(className)`, which reads
`classes.<c>.postprocess` through the same `loadManifest` → `classOf` → `recipeFor` path `run.ts`
uses. `player-views.ts::toSprite` awaits it (the async/sync mismatch B-D35 called a one-line fix:
2 imports, a moved resolution, and a palette parameter), and the three `tools/palette/*.mjs` scripts
await it at top level — `at-game-size-compare.mjs` per subject, since each SUBJECT now names its
§9.3 class. **G11: no tolerance literal remains anywhere under `tools/`.**

**The invariant now binds every call site, not just the manifest classes.**
`tests/unit/postprocess.test.ts` adds, per palette on disk, a run of the **real** `toSprite` on the
approved player (asserting the border comes away and the subject does not), plus a structural
section: no file under `tools/` may name a background tolerance, and any file calling
`trimBackground`/`removeFlatBackground` must resolve its options through `backgroundForClass`.
Proved it bites — three sabotages, each reverted:

| sabotage | red |
|---|---|
| `tolerance: 12` back in `player-views.ts::toSprite` | 3 — the literal scan + the real-`toSprite` run under **both** candidate palettes (`left all 1536 pixels opaque`) |
| `cross-view.mjs` rebuilds the options from `const BG_MARGIN = 6 * 2` and drops the import | 1 — the literal scan reads straight past it; the resolver rule names the file |
| a brand-new `tools/postprocess/*.mjs` call site with `tolerance: 12` | 2 — both rules |

The test file itself no longer carries a copy: its `BG` is `await backgroundForClass('player')`.

**Verified after:** `npx vitest run` 37 files / 1946 passing, `npx tsc --noEmit` clean.

**Left for an owner — the artifacts are stale, and that is outside this change's file scope.**
Raising the trim tolerance from 12 to 24 also tightens step 0 by one row on the raw 1024² player
(`547x953` → `547x952`), so `npx tsx tools/comfy/player-views.ts derive` now writes **different bytes**
than the three committed sprites in `assets/approved-trials/_player-views/derived/`. Confirmed by
running it: it completes, every identity band still survives, and the acceptance numbers shift
slightly (front opaque 1152 → 1166, swatches 21 → 22, edge density 0.8655 → 0.8362, satchel centroid
0.397 → 0.315). It was **reverted**, so `assets/` is untouched by this change. The same is true of
the `_palette-freeze/` and `_palette-candidate/` evidence: the fixed scripts were run to prove they
still execute, then those directories were restored byte-for-byte.

---

## 4. MAJOR — silent failures and wrong-by-construction paths

### BF-6 · `tools/postprocess/run.ts` exits 0 on a mistyped filter
**Scope:** `tools/postprocess/run.ts` · **Reported by:** Lane B repair (blocker #2), integrator (#7)
**Status: STILL PRESENT** — reproduced live through the real CLI.

```
$ npx tsx tools/postprocess/run.ts --class=creature-batle --no-atlas
0 processed · 0 rows have no raw file yet
EXIT=0
```
```
tools/postprocess/run.ts
101  const m = await loadManifest();
102  const cls = opt('class');
103  const id = opt('id');
104  const matches = (r: ManifestRow) => (!cls || r.class === cls) && (!id || r.id === id);
```
The sibling **does** guard: `comfy-batch.ts:1747` calls `assertFiltersMatch` before `selectRows`, and
`tests/unit/manifest.test.ts:1768-1779` binds it (`creature-batle` → *"Did you mean
creature-battle"*).

**Fix — applies exactly as proposed.** `assertFiltersMatch` is still exported at
`tools/comfy/comfy-batch.ts:1624`:
```ts
export function assertFiltersMatch(m: ManifestFile, filters: { class?: string; id?: string }): void
```
`run.ts:26` already imports from `../comfy/comfy-batch.ts`. Add it to that import and call it after
line 103 with the same optional-spread shape used at `comfy-batch.ts:1747`. One import, one call.

---

### BF-7 · `textureFor` falls back to a stand-in silently
**Scope:** `game/placeholder.ts` (+ a dev-gate in `tests/unit/game-placeholder.test.ts`)
**Reported by:** C3 repair (blocker #1), integrator (#7) · **Status: STILL PRESENT**

```ts
game/placeholder.ts
640  export function textureFor(scene, idOrPath, width, height, opts = {}): string {
647    const id = assetId(idOrPath);
648    if (scene.textures.exists(id)) return id;
649    return placeholderTexture(scene, id, width, height, opts);
650  }
```
No warning, no counter, no boot-time census anywhere (`grep` for `console.warn|census` in
`game/placeholder.ts` and `game/boot.ts` → nothing). Two live comments still describe the silence as
a present hazard: `game/ui/BattleHud.ts:33` and `tests/unit/battle-view.test.ts:1692-1694`.

**Why this one is worth doing first:** *"a wrong key and an unbuilt asset are indistinguishable at
runtime"* is exactly what let the 162-vs-150 key mismatch survive — and it is what makes **BF-4**'s
12 permanently-missing sprites invisible. **Landing this warning surfaces BF-4 automatically, and
likely whatever else is in the same category that nobody has enumerated.**

**Fix:** a dev-time `console.warn`, or a boot-time census of "keys asked for that are in no manifest
row". **Caveat:** `tests/unit/game-placeholder.test.ts:446-453` calls `textureFor` twice with a
deliberately-absent key, so a bare `console.warn` makes that test noisy unless it is dev-gated
(`import.meta.env.DEV`) or the test stubs the console.

---

### BF-8 · A battle loss costs nothing — the type landed, the consequence did not
**Scope:** `game/wild-battle.ts`, `game/scenes/OverworldScene.ts` ⚠ CONCURRENT, `data/balance.json` ⚠ CONCURRENT
**Reported by:** integrator (blocker #4) · **Status: PARTIALLY FIXED — the important half is open**

The field **landed**: `core/types.ts:456` `curHp?: number;`. It is read *into* the battle
(`game/wild-battle.ts:115`) and **never written back out** — zero writes to `save.party` `curHp`
anywhere in `game/`.

```ts
game/wild-battle.ts:334-344   // header: "A fled, won or lost battle changes no population."
export function applyWildBattleOutcome(opts: {…}): CatchApplication | null {
  const caught = opts.caught === undefined ? caughtIndividual(opts.state, opts.ctx) : opts.caught;
  if (!caught) return null;                    // fled, won AND LOST all return null
```
```ts
game/scenes/OverworldScene.ts:675-677
if (!applied) { this.flashBanner(`${encounter.lineId} — ${result.state.outcome ?? "unresolved"}`); return; }
```
A wipe prints `"— loss"`, returns to the overworld, leaves the party at full HP. No blackout, no fee,
no healing — and no HP persistence between fights either.

**Fix:** a loss branch in `applyWildBattleOutcome` plus a `balance.economy` blackout fee. The design
call (blackout to last town / fee / party HP in the save) is not an agent's to make.

---

### BF-9 · `rollWildTraits` duplicated in the harness — and `rollAge` too ⚠ CONCURRENT
**Scope:** `core/` (landing spot), `game/wild-battle.ts`, `game/encounters.ts`, `tools/harness/player.ts`
**Reported by:** C2 repair (blocker #0), integrator (#6) · **Status: STILL PRESENT**

`game/wild-battle.ts:90-99` and `tools/harness/player.ts:202-211` have **line-for-line identical
bodies**. Differences are cosmetic only: the name (`rollWildTraits` vs `rollTraits`), the parameter
order (`(balance, age, rng)` vs `(age, balance, rng)`), and `slot += 1` vs `i++`. Same draw count,
same draw order, same stream consumption. `game/wild-battle.ts:32-37` states the blocker verbatim in
its own header.

**Newly found during verification, not previously reported:** `tools/harness/player.ts:197-199`
`rollAge` **also** duplicates `game/encounters.ts:140-144` — same `pickWeighted` over `AGE_CLASSES`
by `balance.encounter.ageWeights`, differing only in the fallback (`?? "A"` vs `?? AGE_CLASSES[0]`,
which is `"J"`). That is a **behavioural divergence** on the empty-pick path, unreachable with the
shipped weights. If BF-9 is collapsed, this should ride along.

**Fix:** a move-and-delete, not a write. Move `rollWildTraits` to `core/` beside
`core/lifecycle.ts`'s `rollHeirChoice` (which already imports `Rng`, `Balance`, `Trait`, `AgeClass`
— the move is clean), repoint `game/encounters.ts:184`, delete the harness copy, flip that call
site's argument order.

---

### BF-10 · Core event/type gaps — each is one field on an event
**Scope:** `core/types.ts`, `core/battle.ts`, `core/foodweb.ts`
**Reported by:** C3 build (#0,#1,#2), C3 repair (#3), C2 repair (#1), integrator (#6). Already logged
as **C3-G1/G2/G3** in `docs/DEVIATIONS-lane-c3.md`.
**Status: ALL SIX STILL PRESENT.** `game/battle-view.ts:38-59` is a verbatim in-repo confirmation
that these are open gaps with honest view-layer workarounds rather than recomputation.

| id | current declaration | consequence |
|---|---|---|
| **a** | `core/types.ts:410` `\| { t: "levelUp"; uid; level; learnedMoveId? }` | `core/battle.ts:975-1002` raises `maxHp` *and* `curHp`; neither is on the event. The view re-reads `maxHp` off `BattleState` and flags `resyncRequired`; **`curHp`'s rise is unknowable at the moment of the level-up**, so the card shows pre-level `curHp` against post-level `maxHp` for one step. Not animatable from a recorded log alone. |
| **b** | `core/types.ts:388` `\| { t: "moveUsed"; uid; moveId }` | No target. `harden`/`quicken`/`focus` are `"target":"self"`; `regrow` a self-heal, `burrow-roost` a self-evade. `battle-view.ts:51-54`: *"There is no honest inference available, so the field is GONE rather than guessed."* **No projectile or beam animation is implementable.** |
| **c** | `core/types.ts:389-396` `\| { t: "damage"; uid; amount; effectiveness; predation; crit }` | No attacker. `battle-view.ts:516-524, :657-659` infers it from the preceding `moveUsed` and **consumes** the inference, reporting `null` rather than misattributing. Exact today (one `dealDamage` call site); wrong the day recoil/reflect/trap/environmental tick exists. |
| **d** | `core/types.ts:409` `\| { t: "xpGained"; uid; amount }` | No `xpAfter`/`xpToNext`, so no proportional XP bar — computing it would mean the view calling `xpToNext`, a rules function. |
| **e** | `core/types.ts:319-328` `BattleInput` / `:386` `battleStart` | No trainer/gym identity. `battle-view.ts:441` `gym: "Gym battle"` and stops. `BattleViewNames.opponent?()` (`:236`) is an escape hatch **with no caller in `game/`** — `game/scenes/BattleScene.ts:219-221` notes it is absent. Academic until BF-2. |
| **f** | `core/types.ts:191-198` `EncounterWeight` — `dormantReason?: "dormant" \| "migrating"` | Cannot say **gated**. `core/foodweb.ts:509-510` pushes a gated line as `{ lineId, weight: 0, active: false }` with no reason — type-identical to a line at count 0. **Hard Req 10's distinction is derived downstream, not declared**, and re-derived twice: `game/encounters.ts:262` `absenceCauseOf` and `game/survey-view.ts:771`. Fix: extend the union with `"gated"` and emit it at `foodweb.ts:510`. |

---

### BF-11 · No `lifecycle` subsystem RNG tag ⚠ CONCURRENT
**Scope:** `data/balance.json` + `core/types.ts` `Balance` + `core/schemas.ts` `zBalance` (one change)
**Reported by:** C56 repair (#3, C56-D10), C2, integrator (#6) · **Status: STILL PRESENT**

`data/balance.json` → `"subsystemTags": ["battle", "sim", "encounter"]`.
`game/scenes/OverworldScene.ts:966` derives the heir stream instead:
```ts
const heirStream = subsystemRng(this.save.seed, `${SIM_STREAM}:heir:y${String(endedYear)}`);
```
with the note at `:951` *"THERE IS NO 'lifecycle' SUBSYSTEM STREAM."* Interacts with BF-12's replay
rng. **Must be a 3-file INV-3 change** — see the `zBalance` note under §5.

---

### BF-12 · `core/save.ts` `replay` models no clock, and takes one RNG for a whole log
**Scope:** `core/save.ts` · **Reported by:** C56 repair (#1, #2). Logged as blockers 3 and 4 in
`docs/DEVIATIONS-lane-c56.md`. · **Status: BOTH STILL PRESENT** (`core/save.ts` untouched, mtime 00:15)

**(a) No clock — `core/save.ts:551`.** In `replay`'s switch, `travel` / `foray` / `inn` all fall to
`default:` (`:646`) which only calls `applyOther`. `save.tick` is **never written**. The only writes
touching year are the `yearTurn` case and the log-copy at `:650`. `game/year-replay.ts:190` says it
outright: *"`replay` reproduces everything except the meter, and the meter is in the log."*
`withClockFromLog` (`:196`) closes it for callers who ask — **`replay()` on its own still returns a
save whose meter is fiction.**
*Fix:* fold `advanceAction` into replay's default case, or have `replay` call `withClockFromLog`
itself. `tests/unit/year-turn-ux.test.ts:2841-2844` already proves the composition is correct — only
the default is wrong.

**(b) One RNG — `core/save.ts:483`, used at `:612`.**
```ts
476  export interface ReplayDeps extends YearTurnDeps {
483    rng?: RandomFn;
612    if (deps.rng) rollHeirChoice(prompt, deps.rng, deps.balance, save.year);
```
Keyed by `save.year`, not by the prompt it belongs to — while the live path opens a *fresh* stream
per year turn (`OverworldScene.ts:966`).
*Fix:* `rng` becomes a factory keyed on the entry, e.g. `rngFor?(entry): RandomFn`. Interacts with BF-11.

---

## 5. MODERATE — tunables, gates, hygiene

> **A rule that applies to BF-13 through BF-16 and BF-11, proven by execution during verification:**
> `core/schemas.ts:600` is `export const zBalance: z.ZodType<Balance> = z.object(zBalanceShape);`.
> Unknown keys are **stripped**. Adding a key to `data/balance.json` alone is provably a **no-op** —
> it was tested: `map.battleSpritePx after parse: undefined`. Every one of these is necessarily a
> `data/balance.json` + `core/types.ts` + `core/schemas.ts` change **in one commit**, plus the
> consumer.

### BF-13 · No `balance.seasonTint` group — season hues are provisional
**Scope:** `data/balance.json` ⚠ CONCURRENT + `core/types.ts` + `core/schemas.ts`; consumer `game/season-tint.ts`
**Reported by:** C5/C6 build (#0). Logged as blocker 1 in `docs/DEVIATIONS-lane-c56.md`. · **STILL PRESENT**
```ts
game/season-tint.ts:117-121
export const PROVISIONAL_SEASON_TINTS: SeasonTintTable = {
  spring: { rgb: { r: 198, g: 232, b: 178 }, overlayAlpha: 0.1,  provisional: true },
  summer: { rgb: { r: 255, g: 224, b: 160 }, overlayAlpha: 0.12, provisional: true },
  autumn: { rgb: { r: 226, g: 150, b: 76  }, overlayAlpha: 0.18, provisional: true },
  winter: { rgb: { r: 150, g: 186, b: 226 }, overlayAlpha: 0.22, provisional: true },
```
`grep -n "seasonTint" data/balance.json core/schemas.ts core/types.ts` → **no matches in any of the
three.** Default at three call sites (`:270, :310, :319`); `console.warn` at `:162` still fires. The
*magnitudes* (`audio.seasonBrightness`, `audio.yearDarkenPerYear`) already are data and are read.

### BF-14 · No `balance.map.battleSpritePx` / `miniSpritePx`
**Scope:** as above; consumer `game/ui/BattleLayout.ts` · **Reported by:** B1 build (#3) · **STILL PRESENT**
Current `balance.map` keys: `virtualWidth, virtualHeight, mapNativePx, mapRenderScale,
collisionCellPx, collisionCols, collisionRows, playerSpriteW, playerSpriteH, tileStepPx,
propInteractionRadiusDefault`. Repo-wide grep for the two names returns **exactly one hit — the
manifest asking for them** (`tools/comfy/manifest.json:36`). Consequence:
`game/ui/BattleLayout.ts:92-93` `const SPRITE_W = 96; const SPRITE_H = 96;` are code literals with
their reason written beside them.

### BF-15 · No `balance.overlayDiff.driftFootprintCells`
**Scope:** as above; consumer `tools/overlay-diff/config.ts` · **Reported by:** Lane B repair (#0);
predicted by B-D25 · **STILL PRESENT**
Current `balance.overlayDiff` keys: `iouThreshold, sobelThreshold, dilatePx, denoiseStart,
denoiseStep, denoiseFloor, maxRegenAttempts`. The limit is derived, so **INV-3 cannot reach it**:
```ts
tools/overlay-diff/config.ts:36-42
export function driftFootprint(balance?: Balance): CellFootprint {
  const m = (balance ?? validateContent().balance).map;
  return { cols: Math.max(1, Math.ceil(m.playerSpriteW / m.collisionCellPx)),
           rows: Math.max(1, Math.ceil(m.playerSpriteH / m.collisionCellPx)) };
}
```
`driftFootprint()` is the single place to change. If the first supervised §9.5 run shows the
criterion is too tight (see BF-26), this is the blocker on responding.

### BF-16 · No walk-pace key ⚠ CONCURRENT
**Scope:** as above; consumer `game/movement.ts` · **Reported by:** C2 build (#2) · **STILL PRESENT**
`grep -oiE '"[a-z]*(walk|pace|speed|movement|msPerTile)[a-z]*"' data/balance.json` → zero hits.
`game/movement.ts:104` `const DEFAULT_MS_PER_TILE = 160;` (flagged in that file at `:26-29`).

---

### BF-17 · `no_magic_numbers` scans `core/` only — blast radius now MEASURED
**Scope:** `tests/gates/guardrails.test.ts` ⚠ **NOW CONTESTED** · **Reported by four separate agents:**
C1 repair (#5), C56 repair (#4), Lane B repair (#3), integrator (#7) · **STILL PRESENT**

> ⚠ **This file went dirty at 07:00**, after the verification behind this entry. The concurrent
> workflow is rewriting the `MAGIC_NUMBER_ALLOWANCE` row for `core/dialogue-schema.ts` (the Q8 item:
> the year *ceiling* is gone under Q3, `clock.yearsTotal` survives only as `NOMINAL_YEARS`, and the
> act range now comes from `acts.first`/`acts.last`). It does **not** touch `CORE_FILES` or the scan
> scope, so the finding below stands — but **re-read the allowance table before editing it**, and do
> not dispatch this concurrently with that workflow.

```
tests/gates/guardrails.test.ts
222  const CORE_FILES = walk(join(ROOT, "core"), [".ts"]).sort();
349  it.each(CORE_FILES.map((f) => [rel(f), f] as const))("%s carries no gameplay constant", …
386  const RANDOM_SCAN_DIRS = ["core", "game", "tools", "tests", "fixtures", "data"] as const;
```
`MAGIC_NUMBER_ALLOWANCE` (`:288`) has five entries, all `core/*.ts`.

**The C1 agent's warning — *"NOT SAFE FOR ONE AGENT TO DO ALONE… done unilaterally it turns every
other lane red mid-flight"* — is now confirmed by measurement.** The gate's own `lex()` /
`executable()` / `magicNumberViolations()` were ported verbatim into a scratch script and validated
(run against `core/` with the allowance emptied it reproduces exactly the 5 files / 31 values the
allowance lists — byte-equivalent to the live gate). Then:

- `game/` + `tools/`, `.ts` only: **633 literals across 59 files** → 59 newly-red `it.each` cases
  (game/ 302 across 28; tools/ 331 across 31).
- Worst offenders: `tools/comfy/player-views.ts` 160, `game/placeholder.ts` 45,
  `tools/comfy/comfy-batch.ts` 24, `game/battle-view.ts` 21, `game/collision.ts` 21.
- **The fix as literally proposed — reuse `RANDOM_SCAN_DIRS` — yields 6,095 literals across 141 files
  and flags `data/balance.json`, the file INV-4 points *at*.**

**Fix — substance yes, wording no.** Do not reuse `RANDOM_SCAN_DIRS`. Introduce
`MAGIC_NUMBER_SCAN_DIRS = ["core","game","tools"]` with `[".ts"]`, mirroring `no_shadow_tables`'s
existing `shipping` list at `:543`. Two hazards the original proposal missed:
1. The allowance test at `:354-367` asserts each allowed value is **still used**, so the census goes
   red on *removal* too — 59 files of exact value lists is brittle in both directions.
2. The bulk of the 633 are hex colours, alphas, durations and 255/256 channel constants — **not
   gameplay tunables.** Without a category distinction the gate is not the same rule as INV-4.
⚠ `tools/harness/**` contributes 8 files / 33 literals and is concurrently owned; any census there is
stale on arrival.

---

### BF-18 · 33 inlined non-swatch hex literals still ship in 7 files
**Scope:** the seven files below, plus their lanes' engine-free modules
**Reported by:** C1 repair (#4), C3 build (#4), integrator (#7) · **STILL PRESENT**

`data/palette.json` is `"frozen": true, "frozenAt": "2026-08-25"`, 32 swatches `c00`–`c31`. **Every
one of the 33 literals below was checked against those 32 hexes; not one is a swatch.** None of the
seven files imports `swatchHex` / `swatchColor` / `Palette`.

| file | n | current lines |
|---|---|---|
| `game/scenes/DexScene.ts` | 4 | 62 `#e8e4d8`, 63 `#8a8676`, 64 `#d8a24a`, 65 `0x14140f` |
| `game/scenes/SurveyScene.ts` | 8 | 88 `#e8e4d8`, 89 `#8a8676`, 90 `#c26a6a`, 91 `0xe8e4d8`, 92 `0x8a3b3b`, 93 `0x4f6d4a`, 94 `0x8a3b3b`, 95 `0x14140f` |
| `game/scenes/SummaryScene.ts` | 4 | 51 `#e8e4d8`, 52 `#8a8676`, 53 `#d8a24a`, 54 `0x14140f` |
| `game/scenes/YearTurnScene.ts` ⚠ | 3 | 791 `0x101317`, 792 `#e8e4c9`, 793 `#7d8478` |
| `game/scenes/OverworldScene.ts` ⚠ | 4 | 1238 `#e8f0e0`, 1239 `#0d0f0ccc`, 1246 `#ffe9b0`, 1247 `#0d0f0ccc` |
| `game/scenes/RetirementScene.ts` | 5 | 923 `0x14171a`, 924 `0x23282c`, 925 `0xffd76a`, 926 `#e8e4c9`, 927 `#7d8478` |
| `game/ui/SeasonMeter.ts` | 5 | 246 `0xe8e4c9`, 247 `0x3a4038`, 248 `0xffd76a`, 249 `0x8fb08a`, 250 `#e8e4c9` |

**Consequence:** these silently survive the gate-B0 palette freeze and then disagree with every
generated asset around them.

**Fix — the worked example is intact and reusable.** Name palette ids, resolve with
`swatchHex`/`swatchColor` from `game/ui/Palette.ts`, and put the id table in the lane's **engine-free**
module (not the scene) so a node test can assert every id is a real swatch:
`game/menu-model.ts:45-62` (`UI_SWATCH_ID` → `UI` via `swatchHex`) with
`tests/unit/game-menu-model.test.ts:241-256` asserting every id is a real swatch **plus a
measured-contrast check** — palette compliance must not make a screen unreadable. Engine-free homes
already exist per lane: `game/survey-view.ts` serves Dex/Survey/Summary (it already exports
`SCREEN_TEXT`, `DEX_ART_BOX`); `game/season-tint.ts` or `game/year-events.ts` for the year-turn lane.

**Two corrections to the reported scope:**
- `game/scenes/MenuScene.ts`, `TitleScene.ts`, `BattleScene.ts` and all of `game/ui/Battle*.ts` are
  **clean** (0 literals) — the pattern is already applied there.
- **`game/scenes/BootScene.ts:36-40` also inlines 5 non-swatch hexes — LEAVE THEM.** It is a
  documented deliberate exception (**C1-D10**, explained at `:24-33`): it is the screen that reports
  `data/` being broken, and `Palette.ts` resolves `palette.json` at module scope, so making it
  palette-dependent would re-create the silent-black-page failure the watchdog exists to prevent.

---

### BF-19 · A comment and its mirrored test comment now assert something false
**Scope:** `game/menu-model.ts`, `tests/unit/game-menu-model.test.ts`
**Reported by:** C3 repair (#2) — *"caused by my fix"* · **STILL PRESENT, and false on both clauses**
```
game/menu-model.ts:41-43
 * 11.0 : 1 (ok). `game/ui/Palette.ts`'s `UI_SWATCH` is deliberately NOT reused: its roles are tuned
 * for the battle HUD's panel plates, where `text: c07` (#765b4e, 3.3 : 1 on black) is read against a
 * light panel fill rather than against the void.
```
Against the current `game/ui/Palette.ts`: `:156` `panel: "c05"` — `#6e3620`, a **dark** brown, not a
light panel fill; `:166` `text: "c18"` — **not** `c07`; `:172` `cursorInkMuted: "c07"` — c07 has been
repurposed. `UI_SWATCH.text` is `c18`, the *same swatch* `UI_SWATCH_ID.text` uses at
`menu-model.ts:47`. **The stated reason for not reusing the table no longer exists.**
Mirrored verbatim at `tests/unit/game-menu-model.test.ts:260-261`. `game/ui/Palette.ts:148` already
carries the *correct* cross-reference, so the two files now contradict each other.

**Fix — rewrite, do not delete.** Replace both sites with the true current reason the tables are
separate: they differ on `dim`/`accent`/`danger`/`ok` and on **ground** (`UI_SWATCH` roles assume the
`c05` plate, `UI_SWATCH_ID` assumes the `c00` void) — not on `text`. The surrounding contrast figures
are computed live by the test at `:258+`, so they are self-verifying and need no change.

---

### BF-20 · Lane B's deviations are staged in a manifest and never merged
**Scope:** `tools/comfy/manifest.json`, `docs/DEVIATIONS-lane-b.md`, `docs/DEVIATIONS.md`,
`tools/comfy/README.md`
**Reported by:** B1 build (#6), Lane B repair (#4) · **STILL PRESENT — worse than reported**

`tools/comfy/manifest.json:13-68` still carries **nine** (not eight) `_deviations` with `LB-M` ids
(`LB-M1`…`LB-M9`), with `_deviationsNote` at `:69`.

Three corrections to the original blocker:
1. **The renumbering target is `B-D50`…`B-D58`, not `B-D11`…`B-D17`.**
   `docs/DEVIATIONS-lane-b.md` now runs `B-D1`…`B-D49`.
2. **The collision it was staged to avoid already happened inside that file.** It **duplicates
   `B-D18`…`B-D25` twice** — a palette lane at `:62-67` and an overlay-diff/img2img lane at `:98-99,
   :130`. E.g. `B-D18` is both *"palette trials use seed 42"* and *"`POST /api/upload/image` DOES
   exist"*. This must be resolved in the same pass or the merged file carries two rows per id.
3. **The merge into `docs/DEVIATIONS.md` has not happened.** `grep -c "B-D" docs/DEVIATIONS.md` = 1,
   and that one hit is the index row `:47`, not a deviation. Compare siblings that are at least
   range-bounded (A2-D1…A2-D18, C1-D1…C1-D8); Lane B's index entry is open-ended `B-D1 …`.

`tools/comfy/README.md:52` also references `manifest._deviations` **LB-M9** and needs updating with
the renumber.

---

### BF-21 · Stale "not yet built" / "UNVERIFIED" text, one of it in a runtime error message
**Scope:** `tools/comfy/README.md`, `tools/comfy/img2img.ts`
**Reported by:** Lane B repair (#5) · **STILL PRESENT**

```
tools/comfy/README.md:54-61
## Not yet built
- **img2img graph** — does not exist and cannot be retrieved; it was never trialled. …
- **Cloud API client + manifest runner** — build order B1, gated behind B0.
```
Contradicted by the tree: `tools/comfy/{client,comfy-batch,img2img}.ts` and `img2img-graph.json` all
exist; `package.json` ships `"factory": "tsx tools/comfy/comfy-batch.ts"`; 69 files in `assets/raw/`
came from live runs. `manifest.json._img2img._source` even quotes this README as the source of a
claim it then says is outdated.

**And the same staleness survives inside `tools/comfy/img2img.ts`** at `:24-27`, `:121`, and — worst
— `:139`, which is a **runtime error message a human reads**:
```
139  'This endpoint is UNVERIFIED on Comfy Cloud (B-D8 showed /api/history is absent there). '
```
B-D18 verified `POST /api/upload/image` live and B-D19 ran a 7-denoise × 2-view sweep.
`img2img.ts:8-12` already says so — the file contradicts itself.

**Fix:** rewrite README §"Not yet built" as *built, executed, not yet approved for either §9.5/§9.6
use*, and strike the stale UNVERIFIED text at the three `img2img.ts` sites. **Do not** flip
`manifest._img2img.trialled` — it is `false` correctly: B-D19 established a *limit*, not an approval.

---

## 6. EVIDENCE GAPS AND CONTENT DECISIONS — real, but not code fixes

### BF-22 · The B1 gate has never been run
**Reported by:** B1 build (#0,#1,#2) · **PARTIALLY CORRECTED — one third of the original claim was wrong**

- **Still true:** `tools/comfy/manifest.json` holds 288 rows — **287 `pending`, 1 `approved`** — and
  **exactly one row carries a `sha256`** (`player-front`), whose own record at `:317` says it was
  *"promoted **byte-identically**"*, i.e. a promotion, **not a manifest reproduction**. So 1 of 11
  pixel classes has evidence and that evidence is the wrong kind. `tests/gates/` holds
  `balance-binding`, `extensibility`, `guardrails`, `schemas` — **no B1 gate.**
- **Still true:** `manifest.json:9` `"perImageCredits": null, "measuredFrom": null` — G13's estimate
  is uncalibrated. Someone must read the dashboard before/after a known batch and pass
  `--credits-per-image=N`. The refusal itself works regardless.
- **FALSE, and the later repair agent was right:** *"zero live API calls"* and *"img2img has never
  executed"*. 69 files in `assets/raw/` with recorded run logs; byte-identical reproduction across
  two live runs verified on disk by `shasum -a 256` (both `ff9290ee44…`). img2img HAS executed.

### BF-23 · Hard Req 5 is unmeasured against real art
**Reported by:** Lane B repair (#0), integrator (#8), C2 build (#3) · **STILL PRESENT — all three sub-claims**
- `assets/final/` contains **1 file, `.gitkeep`.** No subdirectories.
- All 12 `collisionMask` paths and all 12 `mapAsset` paths named by `data/nodes/*.json` are **absent
  from disk — 0 of 24.** Reproduced: `npx tsx tools/overlay-diff/run.ts --node=r1 --candidate=…` →
  `base image not found: assets/final/maps/r1.png`, **EXIT=2**, before it reaches a mask.
- `yearVariants` is `{}` on **12 of 12** nodes, so build-doc §1's "and the aged map" is a code path
  with no content behind it.

Every separation figure in `docs/DEVIATIONS-lane-b.md` therefore rests on a luminance-derived
stand-in mask over palette trials. **This is the largest remaining risk in Lane B and it cannot be
closed from `tools/`.** ⚠ Note `tests/unit/overlay-diff.test.ts:1032` deliberately asserts **zero**
node masks exist (B-D49) — authoring the first mask turns that test red **by design.**

*Good news verified, not assumed:* the producer half is closed. `tools/collision-editor/` is real
(`index.html`, `main.ts`, `vite.config.ts`), `npm run collision` starts, and its encoding was proven
to agree with `game/collision.ts` — an adversarial 64×64 grid with 818 of 4096 cells blocked round-trips
with **0 of 4096 cells disagreeing**, byte-identical.

### BF-24 · The frozen palette has one cool swatch in 32 — needs Hank's call
**Reported by:** B1 build (#7), raised as **B-D13** · **STILL PRESENT**
`data/palette.json:54-55` still `"frozen": true, "frozenAt": "2026-08-25"`. Hue/saturation computed
over all 32 hexes: **exactly one** in the cool band (H 180–290, S ≥ 15) — `c31 #2865cc` (H218 S67
L48). The only other high-hue entry is `c01 #a4a3ad` at H246 **S6**, i.e. a grey — precisely the
swatch B-D13 says sky blue collapses onto. Both destination hexes B-D13 names are unchanged.
Brackwater is a water town.

**Measured candidates exist and are NOT applied:** `data/palette.candidate.json` (B-D20) and
`assets/approved-trials/_palette-candidate/palette.candidate-classequal.json` (B-D21), with a full
decision sheet. B-D20 closes *"Hank's call, not taken here."*
**The "cheap now, expensive later" framing is confirmed:** ids `c00`–`c31` are stable across both
candidates and the freeze file's own `_comment` says the freeze was *"a VALUE SWAP, not a schema
change"*. The B-D22 blocker on that swap is closed in the manifest (now 24) — and **BF-5, the last four
call sites that were not reading the manifest, was resolved 2026-08-25 (B-D50)**, so the swap is no
longer blocked on it. Note that the at-game-size evidence committed under
`_palette-candidate/` was generated *before* that fix and shows every candidate sprite fully opaque;
re-run `tools/palette/at-game-size-compare.mjs` before reading it as a comparison.

### BF-25 · Two placeholder helpers, each documented as "the one"
**Reported by:** B1 build (#8) · **STILL PRESENT — and recorded in no doc until now**
```
tools/postprocess/placeholder.ts:2  * … the one honest-placeholder helper.
game/placeholder.ts:2               * … the ONE helper the whole game uses for art that does not exist yet.
```
138 lines vs 668. A repo-wide grep for any reconciliation returns **only the header line itself** —
no file imports both, no doc mentions both. **The split has already leaked across the tools/game
boundary:** `tools/postprocess/run.ts:24` imports the tools one while
`tools/collision-editor/main.ts:52` imports `realAssetUrl` from `@game/placeholder`.

**Fix:** a genuine merge is probably wrong — one depends on `sharp`/`Raster`, the other on Phaser and
`data/balance.json` at build time. At minimum each header should name the other and say why two
exist (offline PNG producer vs runtime canvas drawer). **The shared surface worth unifying is the
id/label convention, not the drawing** — so that a screenshot and a built asset agree.

### BF-26 · overlay-diff's residual is declared in a doc, not in the code or a test
**Reported by:** Lane B repair (#2) · **DOCUMENTED LIMIT — with one real gap**
The limit is honestly stated and measured in `docs/DEVIATIONS-lane-b.md:170` (B-D39): a **32px**
feature (2×2 cells) displaced one cell still passes at **8 of 25** (map, position) pairs; a **48px**
feature at **1 of 25**; and the tightest true positive kept has **one pixel of margin** (151 lost
against a 150 limit). B-D25 states the other half: the false-**REJECT** rate on real aged variants is
unmeasured and may be high (largest drift run 7–18 cells against a limit of 6, on 3 of 5 maps) —
because the img2img graph has never been run for §9.5.

*Two corrections to how this was reported:* it is **8 of 25 (map, position) pairs**, not "2 of 5 real
maps"; and the "7–18 cells against 6" figure belongs to B-D25's false-REJECT measurement, a different
thing from the false-ACCEPT residual. An independent re-measurement during verification agrees: a
32×32 block displaced one cell is accepted at 3/5 positions on brackwater and 4/5 on cindershelf.

**The real gap: the code declares the positive result but not the residual.**
`tools/overlay-diff/diff.ts:69-73` states *"a 64px feature displaced by ONE collision cell is
rejected at 25 of 25 pairs"* and never mentions that 32px still passes;
`tests/unit/overlay-diff.test.ts` binds 64px and 128px rejection and **no test pins the 32px
behaviour**. A reader of `tools/overlay-diff/` alone would not learn the limit — and the doc that
carries it is the same unmerged lane-b file from **BF-20**.
**Fix:** restate B-D39's residual in `diff.ts`'s header beside the 25-of-25 claim, and add a
characterisation test pinning the 32px case so a future retune cannot silently move it.

### BF-27 · The starter's schedule contradicts bible §4 ⚠ CONCURRENT
**Reported by:** C56 repair (#0, C56-D11 / D-A4-9) and an auditor · **STILL PRESENT**
```
core/lifecycle.ts:527-528
const yearsSpentInClass = balance.age.lifespanYears[fromAge] - yearsRemaining;
const advances = yearsRemaining > 0 && yearsSpentInClass >= balance.age.yearsInClass[fromAge];
```
over unchanged `data/balance.json` `age.lifespanYears {J:3, A:2, E:1}` + `yearsInClass {J:1, A:1,
E:1}` — J advances after **1** year, not 3. Re-measured on the shipped path: a year-1 starter's
final form arrives in **year 3** and it retires entering **year 4**, where
`docs/content-bible.md:49` says it *"peaks right before the league, then retires"*.
Logged in `docs/DEVIATIONS-lane-a4.md` D-A4-9 and `docs/DEVIATIONS-lane-c56.md` C56-D11, both of
which still call the fix *"a retune … outside this lane's files"*. **It is a `balance.age` retune —
A5's call, not an agent's.** The C56 UX renders whatever schedule core produces and adds no timing.

### BF-28 · The provisional starter is under-levelled for its own first route
**Reported by:** integrator (#5) · **Balance retune — A5's call, not a code fix**
L5 (`balance.xp.starterLevel`) against r1/r4 encounters at L5–L8. Measured: **24 losses in 36
pyrelisk battles at r4**, most resolved in ONE turn; in the live browser run the starter was one-shot
by an L8 pollywisp. The catch loop only becomes reliable once the player has a second creature to
switch to.

### BF-29 · Raid coverage — one authored raid, six unauthored acts ⚠ CONCURRENT
**Reported by:** C5/C6 build (#1) · **STILL PRESENT — and one act wider than reported**
The L8 amendment **did** land: the shape is act-keyed (`core/lifecycle.ts:164-177`, *"RE-KEYED from
`year` (D-Q3-1)"*). `raidCoverage()` executed live against shipped data:
```
raids: 1 → {"id":"cullbrand-strip-harvest-r4","act":4,"nodeId":"r4"}
acts.gates: [0,1,2,3,4,5,6]
raidCoverage: {"scriptedActs":[4],"unauthoredActs":[0,1,2,3,5,6],"unreachableScriptedActs":[]}
```
**Six unauthored acts, not five** — the old `raidableYears` excluded the start year; `raidableActs`
(`game/year-events.ts:97`) includes act 0. bible §9 says Cullbrand raids are *"scripted per act"*.
`raidCoverage()` correctly **reports** the unauthored acts rather than inventing them (inventing
would be G2), and a test asserts the reported set is exactly the ones with no data. **Someone with
content authority has to write those rows.**

### BF-30 · `fixtures/overcatch-script.json` is not reproducible in play
**Reported by:** integrator (#3) · **STILL PRESENT — and the repo has already measured the answer**
`fixtures/overcatch-script.json:8` still carries `"seed": 12`. Its recorded trace comes off
`core/save.ts` `replay`, which drives one RNG for the whole action log (see BF-12b); the game draws
from the per-subsystem streams (§8.1), and at seed 12 on the game path the prey sits at its floor for
all six remaining seasons.

**A test now asserts the disagreement rather than resolving it** —
`tests/integration/demo-beats.test.ts:261` *"the demo has a legible seed for the WHOLE beat, and it
is not the fixture's"*: `expect(fixtureSeed[last]).toBe(FLOOR)` and
`expect(legible[last]).toBeGreaterThan(FLOOR)`. **Seed 24 is verified to show the release on the game
path.**
**Fix:** re-record against the game path or re-seed to 24. Re-seeding requires re-recording
`_expected` (the trace and the `before` line), which is a **justify-test-edit-class change** — four
consumers: `tools/harness/fixture.ts:23`, `tests/property/ecosim.test.ts:62,:992`,
`tests/integration/demo-beats.test.ts:72`, `tests/unit/harness.test.ts:596`.

### BF-31 · The node schema has no exit/portal positions
**Reported by:** C2 build (#0) · **STILL PRESENT — correctly deferred**
`core/schemas.ts:212` `adjacency: z.array(z.string().min(1))`; `core/types.ts:132` `PROP_KINDS` holds
only antler-stone, shell-kiln-shrine, sunken-idol, sign-card. The only `x`/`y` in the node schema
belongs to a prop (`zPropPlacement`, `:192-200`).
`grep -rniE '"(exit|portal|door|warp|gateway|link)"' data/nodes/` → zero hits.
So **nothing in the data says WHERE on a map an edge leads**, and walking off the map edge is
unimplementable without inventing content (G2). Travel is instead an explicit keyed action
(`core/types.ts:536`), listed in the HUD. Either route to a real fix — widening `adjacency` to
objects, or a new prop kind — is a **content decision**, which is why this was deferred rather than
worked around.

### BF-32 · The survey prints real numbers the save does not hold
**Reported by:** an auditor · **STILL PRESENT — mitigated, not removed**
`game/survey-view.ts:146` `return Number.isInteger(value) ? String(value) : shortenReal(value,
REAL_DECIMALS);` with `REAL_DECIMALS = 1`, so `85.00425531914894` renders `"85.0"`. **The two harmful
edges were closed** — `renderNumber(0.04)` is now `"0.04"` (was `"0.0"`, i.e. a live line shown as
gone) and `renderNumber(99.95)` is `"99.9"` (was `"100.0"`). What remains is display rounding.

### BF-33 · The Legacy card is not a choice in the shipped one-starter shape
**Reported by:** an auditor · **STILL PRESENT**
`game/scenes/RetirementScene.ts:489` — `boonTargetUids` is computed from `this.save`, which is
`turn.save` (`:208`), the **post-removal** save. In exactly the shape build-doc §1 describes (one
starter, the Legacy beat), all five BOON stats come back unavailable, so the card presents a choice
with one live side. The deadlock is *narrated* (new copy at `:1387`) but no pre-removal party read
was added. **Fix:** read the pre-removal party for boon targeting, or state that the one-starter
Legacy beat is heir-only by design.

### BF-34 · `docs/LANE-A-STATUS.md` was never swept after the L8 amendment
**Reported by:** integrator (#2) · **PARTIALLY FIXED — the claim overstates it, the residue is real**
Both new modules exist (`core/acts.ts` 287 lines, `core/regional-events.ts` 327 lines). An
`AMENDED 2026-08-25` block **was** committed at `:163-171` and a retraction at `:287` — **but the
patch reached only the two places the amendment directly contradicted (§5, §7); §2, §4, §6.6, §6.7
were never swept.** Still standing:

| line | still says | actual |
|---|---|---|
| `:53` | `core/clock.ts` … *year end by meter **or** gym victory* · Complete | `core/clock.ts:83` `export type YearEndReason = "meter";` |
| `:51` | `core/lifecycle.ts` … *scripted raids* · Complete | raids fire on **act entry** via `raidsForAct`; `docs/build-doc.md:232` *"A year turn fires no raid, ever."* |
| `:252-253` | *"the bible-pinned **year-4** R4 strip-harvest"* | `data/balance.json:249` `"act": 4` |
| `:149-150` | *"an heir's **year-7** projection"* | the calendar is unbounded; year 7 arrives |
| `:42` / `:264` | 7,173 lines, 9 module rows, *"the 9 files in core/"* | 8,956 lines, 12 files |
| `:57` | gym rosters `4/4/5/6/6/6` | `3/4/5/6/6/6` (`core/schemas.ts:716`) |

`core/acts.ts` appears exactly once (inside the amendment block); **`core/regional-events.ts` zero
times.** The `GymLeader.year → .act` rename is unmentioned while `:46` still asserts `core/types.ts`
is Complete and *"No other lane should need to edit it"* — `core/types.ts:519-528` was edited for
exactly that. Plus a stratum of pre-Lane-BC staleness, all four now false: `:79-80` *"overlay_diff
DOES NOT EXIST"*, `:213-215` *"There is no balance harness"*, `:247` *"No scenes exist"*, `:249`
*"dialogue.json does not exist"*.

**Every other doc already records the amendment** (`DEVIATIONS.md` D-Q2-1/2/3 and D-Q3-1 —
authoritative — plus `build-doc.md`, `content-bible.md`, `BALANCE-REPORT.md`, `STORY-REVIEW.md`,
`DIALOGUE-NOTES.md`), and `docs/LANE-BC-STATUS.md:5-7` already names LANE-A-STATUS as the unswept
file in writing.
**Fix:** narrower than "reconcile the file" — a targeted sweep of `:42, :51, :53, :57, :96, :149,
:252, :264`. A "superseded by LANE-BC-STATUS §0 / DEVIATIONS D-Q3-1" banner is a defensible cheaper
option, **but `:53` and `:252` are read as fact by anyone consulting the module table and should be
corrected regardless.**

### BF-35 · Six of ten scenes are executed by no test
**Reported by:** C4 repair (#1) · **PARTIALLY FIXED — better than reported, but the gap is real**
The environment gap is unchanged: `vitest.config.ts:16` `environment: 'node'`, and
`node -e "await import('phaser')"` → `ReferenceError: window is not defined`. **No jsdom, no
happy-dom** in devDependencies, neither installed; `grep -rn "vitest-environment"` → zero hits.

**The rig is real and is not source-reading.** `tests/unit/overworld-scene.test.ts:88`
`vi.mock("phaser", …)` substitutes a ~230-line hand-written stub; `:320` imports the **real**
`OverworldScene`; `:383-384` calls the real `init()`/`create()`; `:378` drives real `update()`
frames. 23 tests, real behaviour (encounter rolls, the `core/battle.ts` reducer end to end, a catch
decrementing a node count, collision-mask refusal). **4 of 10 scenes are executed** — `OverworldScene`
and `BattleScene` via that stub, and `YearTurnScene` / `RetirementScene` via a cleaner mechanism:
`import type PhaserNS` plus exported factories `createYearTurnScene(P)` / `createRetirementScene(P)`
(`game/scenes/YearTurnScene.ts:809`, `RetirementScene.ts:1098`).

**Six scenes are executed by nothing:** `BootScene`, `DexScene`, `SurveyScene`, `MenuScene`,
`SummaryScene`, `TitleScene`. Four of them are checked only by `readFileSync` + `toContain`
(`tests/unit/survey-view.test.ts:2065-2212`); **`TitleScene` and `BootScene` have zero test
references of any kind.**

**What the existing green is evidence OF:** the scene's own logic, against a stub whose `make()`
returns a Proxy where **any unknown method is a chainable no-op** — so a call to a nonexistent Phaser
API, or one with wrong arity, silently succeeds. It is not evidence the game boots.
**Fix:** the cheapest closure for the six stragglers is the DI-factory pattern already proven in
`YearTurnScene`. jsdom/happy-dom remains the only way to validate the stub against the real engine.

### BF-36 · Ten of twenty-two `BattleEvent` kinds are produced by no recorded fixture
**Reported by:** C3 build (#4, C3-G6) and C3 repair (#4) · **STILL PRESENT** — logged as C3-G6 in
`docs/DEVIATIONS-lane-c3.md`
`heal`, `statusApplied`, `statusTick`, `statusSkip`, `statusCleared`, `evade`, `levelUp`,
`actionRejected` and others are covered by hand-built logs only. **This is not cosmetic: the C3
repair agent named it as the reason two MAJOR defects survived** — no recorded fixture produces an
`actionRejected`, so the suite's "scan every caption the fixtures produce" check could never see the
one path that piped an external diagnostic string into the player-facing message box.
**Fix:** record one fixture that heals, statuses, buffs, levels up **and refuses something**. Needs
`fixtures/battle-scripts/`, which is not lane C3's.

---

## 7. ALREADY FIXED — do not re-investigate

Verified fixed against the current tree, with the replacement code as proof. Recorded so nobody spends
another pass on them.

**Reported as blocked by the C1 repair agent, since fixed by the file's owner**
- `game/scenes/SummaryScene.ts:131-170` — empty-party TEAM screen had no exit hint. Applied **exactly
  as proposed**, including the `this.roster.length > 0 ? "←/→ creature  ESC" : "ESC"` footer ternary.
- `game/scenes/RetirementScene.ts:1293-1300` — portrait keyed on the save-local UID. Applied exactly
  as proposed: `dexArtId(offer.parent.formName)`, import at `:820`, rationale written in-file at
  `:1284-1291`.
- `game/ui/BattleLayout.ts:92-93` + `game/ui/BattleHud.ts:222-223` — battle sprite slot 72² → **96²**
  per build-doc §9.3. The headroom measurement from the proposed fix was carried into the source
  comment at `BattleLayout.ts:89`. *(Loose end, not a blocker:
  `tests/unit/battle-view.test.ts:1724-1728` still calls `placeholderKey(one, 72, 72)` — those
  assertions pass but are now stale-by-value.)*

**Stale comments, since corrected**
- `game/main.ts:32-47` — no longer says *"Battle, YearTurn and Retirement are registered and IDLE"*;
  it now separates "registered" from "routed" explicitly.
- `game/scenes/DexScene.ts:40-47` — every claim re-verified true (registry `dex` entry, `main.ts`
  registration, `MenuScene` routing).

**Scratch files, all removed** — `tests/unit/__c2audit_probe.test.ts`, `__c56repro.test.ts`,
`__c3_audit_probe2.test.ts`, `zz-audit-probe.test.ts`, `game/__c2audit_probe_main.ts`,
`c3probe.html`, `probe-c56.html`. A repo-wide sweep leaves only `tools/harness/probe.ts` and
`assets/raw/_repro`, both real.

> ⚠ **New ones arrived while this was being written.** `tests/unit/zz-probe-audit.test.ts` (06:55)
> and `tests/unit/zz-probe-scene.test.ts` (06:59) are untracked and self-describe as
> *"adversarial verifier scratch file. Deleted before the audit report ships."* They post-date every
> verification run behind this document, so they belong to the **concurrent time-model workflow** and
> were deliberately left alone. **Whoever owns that workflow should sweep them at its end** — this is
> the same class of leftover the list above closed, and it recurs every wave.

**`tools/comfy/comfy-batch.ts` — all six, including the critical**
- **The §8.4 versioned reseed is no longer a no-op on the live `run` path** (`:317`): `reseeded()`
  now throws `SeedReuseError` when `row.seed === row.recordedSeed`, so a hand-bumped version that
  never reached the seed is refused instead of billed.
- A G5 refusal no longer downgrades the approved row to `status:'failed'` (`:1592` — new `refuse()`
  sets `flaggedForReview`, leaves status untouched).
- `--force` on an approved row now requires `--confirm` and preserves the record via
  `supersededApproval` (`:544`, `:1543`) — verified live.
- `workflowHash` is now **compared** (`assertWorkflowLock` at `:389`, called from `graphForRow`
  `:1163`), with the prompt half at `assertStyleLock`.
- The credit estimate now reports the worst-case ceiling, not `perImage × rows` (`:454`).
- A mistyped `--class`/`--id` no longer exits 0 (`assertFiltersMatch`, `:1624`) — verified live.
  *(Its twin in `tools/postprocess/run.ts` is still open: **BF-6**.)*

**Overworld / encounters / collision / movement**
- A wild encounter now routes into a battle and a catch writes to `save.nodeStates`
  (`OverworldScene.ts:585` → `:631` `scene.launch` + `scene.pause`, returning through
  `applyWildBattleOutcome` → `applyCatch`), bound by `tests/integration/demo-beats.test.ts`.
- `OverworldScene` gained 917 lines of **behavioural** tests (§1–§9), replacing a source-text grep.
- `countOf` and `liveNode` can no longer answer differently (one fallback, in `game/wild-battle.ts`).
- A sign-chain-gated line is now a distinct absence reason at the *view* layer
  (`game/encounters.ts:265` `AbsenceReason` gained `"gated"`) — *note this is the downstream
  inference; the core-level gap is still **BF-10f***.
- `Encounter` now carries traits (`:184`) — *which created **BF-9***.
- Player tile position survives a scene restart (`:433-441`); the first `[C]` after a restart is no
  longer swallowed (`:331`); an all-blocked mask no longer silently spawns the player inside geometry
  (`:429`); the HUD wraps to the 480px virtual screen (`:354`).
- The collision-mask contradiction between `game/collision.ts` and `tools/overlay-diff/mask.ts` is
  resolved by declaring transparency out of contract and refusing such a mask at load; the two
  readers are proven to agree cell-for-cell over 200 opaque seeds.
- A blocked held direction no longer locks out a second held direction (`game/movement.ts:220`).
- `game/mapview.ts:153` no longer prints a Phaser warning on every mask read.
- `tools/collision-editor/` exists and `npm run collision` starts.

**Boot / shell**
- A syntactically invalid `data/*.json` no longer boots to a silent black page — a dependency-free
  classic-script watchdog in `index.html:41`, disarmed by `__trophicBooted` at `game/main.ts:86`.
- `canvasZoom` replaces `integerZoom`, so a sub-480×320 viewport is no longer clipped
  (`game/boot.ts:197`).
- The content-failure headline counts problems, not files (`BootScene.ts:99`).
- Sprite stand-ins carry a legible, wrapped asset id (`game/placeholder.ts:294`).

**Battle UI**
- The palette role→swatch contrast **inversion** is gone; the ladder is now monotone (recomputed:
  enabled 8.04:1, muted 5.69:1, disabled 3.04:1, focused 17.27:1 — was 2.49 / 3.81 / 5.29 inverted;
  hpMid on hpTrack 8.87:1, was 1.64:1). `tests/unit/battle-view.test.ts:2161` binds the ladder.
- `battleSpriteKey` now matches the manifest exactly — 150 manifest rows, 150 game-askable keys,
  intersection 150, manifest-only 0.
- Bait is enumerated **positively** (`isBaitTag`), so no future bag item is offered as bait.
- `illegalActionReason` no longer reaches the player-facing narration line.
- Disabled no longer beats focused in the menu panel; the Lure has a persistent indicator; a caught
  creature leaves the field; a failed catch is narrated as a failure; the exit callback is required.

**overlay-diff gate** — the FALSE ACCEPT does not reproduce (64px moved 1 cell: 0/5 accepted on all
five maps, was 1/5 and 2/5); the FALSE REJECT is closed (contrast gain read from the walkable
population only); the rejection reason now states only measured quantities.

**Survey / web view** — the breed column no longer drops `foodFactor`; collapsed-edge labels are
placed collision-aware (0 overlaps across 370 scenarios / 4162 labels); a migrant at 0 no longer gets
the seasonal word; the trend/`net` column is live via `game/survey-history.ts`; `encounterGatedFor`
keeps the sign-chain flag for a line that is both gated and out of window.

**Year turn / clock / retirement** — the gym-victory second-year-turn hole, the `Y7/6` label and the
unwired gym-victory trigger were all resolved by **authorised design amendments D-Q2-1 / D-Q3-1**
(the calendar is now deliberately unbounded and a gym victory ends no year), not by patching guards.
**If those amendments are not what you expect, three of these "fixed" verdicts flip back to design
questions.** Also fixed: the inn is wired; a region-mirroring replay hook reproduces `driveYearTurn`
exactly; the ▸ cursor sits on the side SPACE will take; the card is debounced against OS auto-repeat
and a first-frame confirm; the carried tick is recoverable from the action log; `fullMeter` no longer
publishes an out-of-range `seasonIndex`; `assertCoversSeasonOrder` only throws on a *missing* preset.

---

## 8. Dispatch order

**Clear to dispatch now** (no concurrent owner): ~~BF-3~~ *(RESOLVED 2026-08-25 — the sweep is done;
its four new findings are D-SWEEP-1…4 on that entry)*, BF-4, ~~BF-5~~ *(RESOLVED 2026-08-25)*,
BF-6, BF-7, BF-9 *(the `game/`
half)*, BF-10a–f, BF-12, BF-13 *(consumer)*, BF-14, BF-15, BF-18 *(5 of 7 files)*, BF-19,
BF-20, BF-21, BF-22, BF-23, BF-24, BF-25, BF-26, BF-30, BF-32, BF-33, BF-34, BF-35, BF-36.

**Blocked on the concurrent time-model workflow** — needs `data/balance.json`, `data/dialogue.json`,
`data/gyms.json`, `core/clock.ts`, `core/lifecycle.ts`, `core/acts.ts`, `game/scenes/OverworldScene.ts`,
`game/scenes/YearTurnScene.ts`, `game/year-events.ts`, `game/registry.ts` or `tools/harness/**`:
~~BF-1~~ *(RESOLVED 2026-08-25 — the Lane C7 dialogue runtime shipped; see its resolution block)*,
~~BF-2~~ *(RESOLVED 2026-08-25 — `winGym` has its caller at `OverworldScene.ts:1392`)*,
**BF-8, BF-9 *(the harness half)*, BF-11, BF-13 *(the balance half)*, BF-16, BF-17, BF-18
*(YearTurnScene, OverworldScene)*, BF-27, BF-29**.

*(BF-17 moved into this list at 07:00 — `tests/gates/guardrails.test.ts` went dirty under that
workflow after its verification; see the note on that entry.)*

**Suggested grouping for a repair wave**, by disjoint file scope:
1. `tools/comfy/**` + `tools/palette/**` + `tools/postprocess/**` — ~~BF-5~~ *(done)*, BF-6, BF-20, BF-21, (BF-22 evidence)
2. `game/encounters.ts` + `game/placeholder.ts` + `tests/unit/battle-view.test.ts` — **BF-7 then BF-4**
   *(in that order — BF-7's warning surfaces BF-4 and anything else in its class)*
3. ~~`tests/integration/seams.test.ts` + `tests/unit/year-turn-ux.test.ts` — BF-3 and its sibling
   source-list-grep assertions~~ *(DONE 2026-08-25, and it reached nine files, not two)*
4. `core/types.ts` + `core/battle.ts` + `core/foodweb.ts` + `core/save.ts` — BF-10, BF-12
5. the five non-concurrent scene files + `game/ui/SeasonMeter.ts` — BF-18
6. `docs/**` — BF-34, BF-20's merge, BF-26's doc half

**Whoever takes BF-1 or BF-2 should first re-read §2's warning about `core/acts.ts`.** An edit making
`actOf` read the calendar year would make both *look* fixed without a badge or a quest flag ever
existing.
