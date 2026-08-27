# TROPHIC — status

A 2D monster-catching RPG whose region is a living ecosystem: every catch decrements a real per-node
population, the food web is derived from those numbers rather than authored beside them, and the
calendar ages every creature and map underneath the story.

## ⛔ THE GAME WAS PLAYED, AND DEMO BEAT 1 CANNOT BE PLAYED

**On 2026-08-27 somebody drove the built app in a browser with real keys** — title, opening cutscene,
Hearthollow, an interior, a wild fight, a rival fight, a gym, the in-run menu, the survey. **It is the
first evidence on this page that is not a test**, and it is written up as items 45–50. **A great deal
works, the survey most of all** (item 50 — do not read this section as a verdict on the build).

⚠ **THE SENTENCE THAT OPENED THIS FILE UNTIL NOW IS FALSE AND IS CORRECTED, NOT REPHRASED.** It read
*"**A run is playable end to end today** — Hearthollow → R1 → Brackwater → R2 on foot, **catching off
the node's real counts**, quests, gyms and badges…"* **Nothing in the shipped game can be caught.**
Maren's tutorial promises *"Snares first. Three of them, in the satchel by the door"*; a dialogue entry
has no field that can give the player anything; no grant machinery exists; `newSave` starts the bag
empty and no caller passes one; and the supply shop's service tile plays vendor dialogue instead of
opening a store. **So build-doc §1 beat 1 (the cascade — never-cut) and §15's I1 and I2 are all
unplayable, and the vertical slice past R1 is unreachable in practice.** The full chain is item 45 and
the work is **T-60**.

⚠ **And a party wipe ends the run** — 3 of 3, from a wild loss, a rival loss and a gym loss (item 46).
**A lane is repairing that right now and its work has not landed; it is open, not fixed.**

**What is true underneath both:** damage, levels, XP and the bag persist across battles; a rest at an
inn heals what it charges for, **replays**, and asks where the player is standing before it does; a
wiped party is charged, moved and healed correctly in the save. **Ten painted maps are on disk and
everything that moves is a labelled placeholder** — no player sprite, no creature sprite, no dex plate,
no UI frame, no audio, **and no collision**. The ten maps are WIP against T-17's amended top-down
projection. ⚠ **"No collision" is still the largest gap in the *engine***: all twelve nodes run on a
synthesised border ring, so **19.5% to 43.1% of every node is walkable that its layout says is solid**,
no building is solid and no water stops anyone — item 41, and the reason it is not simply fixed is
item 43.

---

## ⚠ THE OPEN DECISION — the year-1 over-catch beat no longer clears its gate

`tests/unit/transcription.test.ts:1264` — *"keeps the year-1 over-catch beat reachable in real play
(build-doc §1 beat 1, §15 I2)"* — is **RED**, failing at `:1365`, and it is red on the shipped numbers,
not on anything in flight. It gates the cascade, a never-cut beat.

    AssertionError: brackwater: 19.2 removals needed to starve fenmaw-line,
    only 11.4/yr available: expected 11.423076923076922 to be greater than or equal to 19.2

⚠ **READ THIS BEFORE THE ARITHMETIC: THE RED GATE AND THE UNREACHABLE CATCHING ARE ONE PROBLEM SEEN
FROM TWO ENDS, AND THE KNOB CANNOT REACH THE OTHER END.** The gate prices a *reference player* named in
`data/balance.json:615-621` `harness.overcatch` — `snareTier: "weighted"`, `baitMatch: "species"`,
`referenceHpFrac 0.5`, `yearsBudget 1` — and `tools/harness/full-run.ts:235` hands `ref.snareTier`
straight to `catchChance` **with no inventory check at all.** A weighted snare costs **60**
(`data/balance.json:528`) and **cannot be obtained by any means in the shipped game** (item 45,
**T-60**). So the budget below is being spent by a player who could not exist:

- **Tuning `battleTicks` or `ticksPerYear` cannot make the beat playable**, because the shortfall it
  closes is not the one that blocks the player.
- **The gate going GREEN would not be evidence of reachability either.** Its own name says *"in real
  play"* and its arithmetic never asks whether a snare can be held. **That is the sharper reading of
  this decision, not a reason to defer it** — the knob question is still real and still the owner's;
  it is simply no longer the whole of what stands between the region and beat 1.

**What changed.** T-1's retune gave battles a tick cost and gated encounters to tall grass. The
year's encounter budget fell from **138.24 to 54.0** — the old figure being `16 ticks × 48 steps ×
0.18`, correct for the old regime (verified against `git show HEAD:data/balance.json`: 16 ticks/year,
no `battleTicks`, no `encounterTileFraction`).

**Both walkable apex sites now fall short.** Re-derived independently of the test, from
`data/balance.json` + `data/nodes/*.json` + `data/species.json`:

| site | removals needed | net removals available/yr | encounters/yr **required** |
|---|---|---|---|
| `brackwater/fenmaw-line` | 19.20 | 11.42 | **78.96** |
| `r2/fenmaw-line` | 24.80 | 9.46 | **103.70** |

Budget available: **54.0**.

**`encounterTileFraction` CANNOT rescue r2, at any value.** This corrects the statement in T-1's own
ruling text that names it as the knob. Charging `battleTicks` puts a hard asymptotic ceiling on the
year at `ticksPerYear / battleTicks` = **104.0** encounters — and grass fraction 1.0 (every tile an
encounter tile) yields only **84.45**, because an excursion costs `forayTicks + e × battleTicks` and
`e` grows with the fraction. r2 needs 103.70. The algebraic solution for r2 is a fraction of ~80,
i.e. past the asymptote. Brackwater alone would clear at fraction **0.730**.

**The binding knob is `battleTicks`** — or `ticksPerYear`. Solved against the shipped rest:

| knob | value that clears brackwater (78.96) | value that clears r2 (103.70) |
|---|---|---|
| `encounter.encounterTileFraction` | 0.730 | **impossible** (ceiling 84.45 at 1.0) |
| `clock.battleTicks` (grass 0.25) | 0.196 | **0.038** — effectively free |
| `clock.ticksPerYear` (shipped tf/bt) | 76 | 100 |

**Nothing was tuned and no gate was weakened.** Under T-1's own ruling this is the owner's call, and
under G14 the gate does not move to accommodate it. G6 also binds: a seed set or a node chosen for
its outcome is not an answer.

**The green next door is not evidence the beat is affordable.**
`tests/integration/demo-beats.test.ts` passes, and separately measures a *different node* — the
fixture pins `r4`, which is `walkable: false`; the feasibility gate above asserts the walkable slice
(`brackwater`, `r2`). Worse, `runCascade` (`tests/integration/demo-beats.test.ts:163`) **never
advances the clock**, and its `forays` / `battles` fields are computed and **never asserted** (grep
for `.forays` / `.battles` in that file returns nothing). Priced at the shipped costs across its own
24 seeds — measured by replaying `runCascade` verbatim outside the suite:

    min 30 · mean 49.21 · max 85.5 ticks   ·   9 of 24 seeds exceed the 52-tick year
    (seeds 2, 5, 7, 9, 10, 17, 19, 20, 21)

So the beat that test certifies costs more than a year at over a third of its seeds, and the test
cannot see it.

---

## Verified state

**Re-measured on 2026-08-27 at 15:58:43Z**, one complete run, on a tree with two lanes live in it.
What landed since the 14:57 readings: **the quest layer's year-turn defect** (age is read off the
tape's `gained`), **the deadline guard made real rather than deleted**, **the release refusal naming
which reason**, and **both quest gates rewritten to observe a driven player**. **No sha and no commit
tally is written here** — `git log` holds both, and each rots inside a single pass.

⚠ **Read the figures below as READINGS AT A TIMESTAMP, not as the tree's health.** The art lane is
editing `tools/comfy/` and a lane is holding `game/scenes/OverworldScene.ts` and
`tests/unit/overworld-scene.test.ts` right now to repair the wipe softlock (item 46), so the totals
moved under this pass and will move again. **The FAILURE SET is the stable part** and is named case by
case.

- `npx tsc --noEmit` — **exit 1** at 15:58:36Z, **two errors, and NEITHER IS THIS TREE'S**:
  `tools/comfy/trials/creature-batch6-view.ts(77,18): error TS2503: Cannot find namespace 'sharp'.`
  and `tools/comfy/trials/creature-batch6.ts(229,19): error TS2551: Property 'poseV3' does not exist
  on type '{ v2?…; v3?…; species?…; poseV2?… }'. Did you mean 'poseV2'?`
  **Both files are UNTRACKED** — `git status --porcelain` returns `??` for each and `git ls-files`
  returns nothing — and **no tracked file produces a type error.** ⚠ **Record it that way and do not
  let it read as a repo-wide regression**: this is art-lane work in flight inside the typecheck's
  scope, not a break in `core/`, `game/`, `data/` or `tests/`. Note also that `cmd | tail; echo $?`
  reports **tail's** status, not the command's — and in **zsh** a `PIPESTATUS` read written for bash
  comes back empty, which is how this run first mis-reported its own exit status.
- `npm run test` — **5 failed of 2,950; 2,945 passing; 4 files failed of 70**, 49.87 s.
  **The passing total rose because tests were ADDED, not because anything regressed**: 2,915 → 2,950
  over the same 70 files, the additions belonging to the two rewritten quest gates and the release
  refusal.
  ⚠ **AND THE FAILURE COUNT ROSE, 3 → 5, WHILE NOTHING IN THE TRACKED TREE BROKE. That is the mirror
  of the trap this section carried last pass** — a lower count was the reading nobody re-checks, and a
  higher one is the reading everybody over-reads. **Attributed one by one, because a count is not a
  diagnosis: three of the five fire on art-lane files that are untracked or uncommitted, one is a
  fossilised precondition, and one is the cascade gate.** Only the last reads shipped data.
  - **`tests/property/foodweb.test.ts` — 1 failure**, *"no shipping source names a species — a shadow
    table has to name its rows"*. It names `tools/comfy/creatures-batch-7-accept.ts`, which is
    **untracked**. The G2/G3 shadow-table gate is doing exactly its job on a file the art lane has not
    committed. **Not a defect in shipped code.**
  - **`tests/unit/postprocess.test.ts` — 1 failure**, *"every caller of the background steps resolves
    its options from the manifest"* (BF-5). It names `tools/comfy/trials/derive-creatures-batch-2.ts`,
    also **untracked**. Same shape.
  - **`tests/unit/manifest.test.ts` — 2 failures, and they are two different things.**
    *"and the escape DOES move the seed for a derived row"* is the art lane mid-flight in the
    **modified, uncommitted** `tools/comfy/manifest.json`: the `map-hearthollow` row's stored seed and
    version disagree with the derivation by exactly one version step. **This section has twice
    published a line number for this failure and it drifted twice, and a previous pass published the
    wrong row as well — so it is named by its TEST TITLE, and the seeds are not quoted.**
    *"THE REAL GATE refuses a variant when the node has no collision mask on disk"* is a fossilised
    PRECONDITION: it asserts `existsSync(r1.mapAsset)` is `false`, under a comment reading *"The
    repo's true state today: no node has a base map or a mask on disk."* Ten maps landed; the premise
    expired. The claim the test exists to make — a maskless node must REFUSE, never fall back to
    "every pixel walkable" — is untouched and worth keeping; only its setup needs to stop asserting
    the repo is empty. Recorded as **T-46**, still open, not edited here.
  - **`tests/unit/transcription.test.ts` — 1 failure**, *"keeps the year-1 over-catch beat reachable
    in real play (build-doc §1 beat 1, §15 I2)"* (`:1264`, failing at `:1365`). The cascade
    feasibility gate, the section at the top of this file. Re-read verbatim off this run and
    **unmoved**: *"brackwater: 19.2 removals needed to starve fenmaw-line, only 11.4/yr available"*,
    11.423076923076922 against 19.2. **The only failure of the five that reads shipped data**, the
    owner's decision, and now known to be **half** of what blocks the beat — see the two-ends note at
    the top of this file and item 45.
  - **`tests/unit/harness.test.ts` and `tests/unit/quests.test.ts` are GREEN**, and the quest lane's
    work has now LANDED rather than being a mid-edit reading (item 51).
- `python3 tools/prose/prose-lint.py data/dialogue.json` — **exit 1**, **215 entries, 63 speakers,
  512 lines**, re-derived independently off `data/dialogue.json` as well as read off the run. 27
  control assertions green over 7 structural checks. **0 corpus structural failures.** 3 per-beat
  advisory flags, all `R1-SUBJECT-SWITCH`, 3 speakers.
  **The non-zero exit is not evidence of a structural failure**: `tools/prose/prose-lint.py:1085`
  exits on `beat_total + fails ≠ 0`, so three advisory flags alone produce exit 1.
- `git` — **`main` is in sync with `origin/main`; everything is pushed.** **No commit hash is quoted
  here any more, deliberately.** This section has named three different HEADs in as many hours and each
  was stale before the paragraph around it was finished — "in sync with origin" is a claim that stays
  true, a hash is a claim that expires. One session owns the index by Hank's instruction; the art lane
  does not commit. **The dirty-path COUNT is no longer quoted either, on the same reasoning, and it
  earned that this pass**: the list this section published at 05:47 named six paths, and within the
  hour three of them had been committed and three different ones had appeared — the count read six
  both times while naming a different tree, and it moved four more times during this pass alone.
  What is stable is the claim, so that is what is written: **every dirty path belongs to a lane that
  is working right now** — the **art lane** in `tools/comfy/`, `tools/artverify/` and
  `assets/approved-trials/`, the **softlock lane** holding `game/scenes/OverworldScene.ts` and
  `tests/unit/overworld-scene.test.ts` (item 46), and `.claude/scheduled_tasks.lock`, which is the
  harness. **The quest lane's paths are no longer dirty — that work landed.** Nothing dirty is
  abandoned work, and **nothing untracked is under `core/`, `game/`, `data/`, `docs/` or `tests/`**.
  Run `git status --porcelain` and read it; do not read it here.

## What is built

| Subsystem | State | Where it lives |
|---|---|---|
| Battle engine | Pure reducer `(state, action, rng) → {state, events[]}`; no Phaser | `core/battle.ts` |
| Ecosystem sim | Per-node integer populations, one clamp, one write path | `core/ecosim.ts` |
| Food web | Diet edges derived from node data; nothing else may compute them | `core/foodweb.ts` |
| Calendar clock | **52 ticks/year, 13/season, `subTicksPerTick` 2**; `ClockState` is `{year, tick, subTick}`; unbounded, no cap, no fail state | `core/clock.ts:64` |
| Tick costs | travel 1 · foray 1 · inn 2 · **battle 0.5, charged at launch** and wired — `spendTicks("battle", …)` inside `handOffToBattle`, which is the single launcher all four fights go through | `data/balance.json` `clock` |
| Cadence validation | A 4-rule `.superRefine` refuses a retune at boot: year = season × seasons; `startTick` in range; every cost an exact multiple of `1/subTicksPerTick`; no cost ≥ a season | `core/schemas.ts:479` |
| Encounter rate | Grass-gated. `stepEncounterChance()` is the **single** definition the game and the harness both roll against — no second one exists | `core/foodweb.ts:223` |
| Catching | ⛔ **BUILT AND UNREACHABLE.** The reducer, the snare tiers, the bait maths, the `{t:"catch"}` action and `applyCaught` all exist and are tested; **the player can never hold a snare**, so the verb cannot be exercised in play and demo beat 1 cannot be performed — item 45, **T-60** | `game/wild-battle.ts:266`/`:396`, `core/save.ts` `applyCaught` |
| Act model | Badges + quest flags gate towns, routes, raids, rival, finale | `core/acts.ts` |
| Lifecycle | Aging, retirement, heirs, boxed aging, Cullbrand raid on act entry | `core/lifecycle.ts` |
| Save + replay | Action log replays byte-identically **for the ten members that have an arm**; `subTick` and `forayStepsSinceTick` survive the SERIALIZER's round trip and the year turn. ⚠ **The citation this row carried was wrong and is corrected**: `forayStepsSinceTick` appears **nowhere** in `tests/property/`, and was covered there only vacuously by a whole-save comparison where both sides read 0. Its real coverage is `tests/unit/save.test.ts:212` (canonical keys) and `tests/unit/overworld-scene.test.ts:3124`/`:3452`. Through `replay()` it does **not** survive — T-54 | `core/save.ts`, `tests/unit/save.test.ts`, `tests/unit/overworld-scene.test.ts` |
| Content + schemas | 27 species lines (3 Ancients), 28 moves, 6 gyms, 12 nodes; zod-validated at boot | `data/`, `core/schemas.ts` |
| Age multipliers | **Halved toward neutral: J 0.875 · A 1.0 · E 1.075** (was 0.75 / 1.0 / 1.15; A is the neutral, so A did not move). `metamorphicJump` 1.15 and `heirLevelFactor` 0.5 deliberately untouched — not an unfinished half of T-10. Lifecycle tests read the key symbolically, so no table needed re-deriving. **The canonical L9 row and §7.4 carried the old curve until now** and are corrected to name `balance.age.multiplier` as the rule. **The four copies of the OLD curve TICKETS T-10 enumerated are now ZERO** — re-grepped 2026-08-27: `docs/content-bible.md:51` reads *"Juvenile penalty · Adult neutral · Elder bonus"*, `core/lifecycle.ts:350` reads the same and says the numbers are *"READ here and never restated"*, and `data/gyms.json:5` now names `balance.age.multiplier.E`, *"×1.075 today"*. `×0.75` no longer appears in `core/`, `game/`, `data/` or `docs/` at all | `data/balance.json` `age`, `docs/build-doc.md:47` |
| Producer template | **Re-spent 85/40/80/35/60 → 85/60/80/35/40** — zero-sum, total still 300, Scavenger untouched, Carricrow untouched. Measured: Loamunder 26.7% → 50.7%, Sporantle 12.9% → 37.9%, both into band; 8 of 24 lines outside the ±15 band. The closed-tournament arithmetic is recorded in `_bandArithmetic` beside the templates, not in a doc | `data/species.json` |
| Dialogue corpus | **215 entries, 512 lines, 63 speakers**; every entry has a path to the screen | `data/dialogue.json`, `game/dialogue-runner.ts` |
| G7 gate | **Now reads `data/dialogue.json`** — every player-facing string plus a joined-body pass, and a prose census over 18 other `data/*.json` files | `tests/gates/guardrails.test.ts` `dialogueCopyViolations`, `:1129` |
| Quests | Objectives, flag writers, sign chains. **Progress survives the year turn** — age is read off the tape's own `gained`, not off the aged individual — the deadline guard fires (it is reachable through Ancients, which never age, G10), and release refuses with a **named reason** both the key and the HUD read from one function | `core/quests.ts:341`, `game/quests.ts:555`/`:770`/`:791` |
| Quest gates | **They OBSERVE a driven player** rather than confirming a row exists: the expander is deleted, turn-in flags come from a maximal player per node put through the real `syncQuestFlags`, GATE 2f checks satisfiability against a **measured** world, GATE 2g requires the objective's node to be one the quest's own copy names | `tests/gates/quest-layer.test.ts:1462`/`:1660`, `tests/gates/reachability.test.ts:402` |
| Overworld | Walk, collision, travel, encounters, inn, gym challenge, talk, release | `game/scenes/OverworldScene.ts` |
| Walkable slice | `hearthollow`, `r1`, `brackwater`, `r2`; the other 8 nodes are travel-only | `data/nodes/*.json` `walkable` |
| Battle scene | A replayer over `BattleEvent[]` — it holds no rules | `game/scenes/BattleScene.ts`, `game/ui/` |
| Year turn + retirement | Meter fills → year turn → prompt → heir in the party | `game/scenes/YearTurnScene.ts`, `RetirementScene.ts` |
| Finale | Vellsire choice, both outcomes written and flagged, epilogue survey. **The epilogue's season is DERIVED from the projection's published horizon, not stamped from `save.tick`** — it is not a caption, the breed column and the dormant/migrating note are computed from it, so a stamped label made the same animal at the same number carry the opposite biological claim depending on when the player stopped | `game/finale.ts` |
| Rival | One encounter per act, each with pre/win/loss copy | `game/rival.ts`, `data/dialogue.json` |
| Survey | Real per-node counts plus run history | `game/survey-view.ts`, `game/survey-history.ts` |
| Balance harness | Gym sim, type round-robin, full-run cascade; now pays travel/foray/battle ticks and rolls the grass-gated rate | `tools/harness/` |
| Harness control run | **`CATCH_PROFILES` × `RAID_POLICIES` = a 3×2 matrix**, raid suppression as an orthogonal flag rather than a fourth profile. Deep-copies `rawBalance` and empties `yearEvents.raids` in memory — `data/balance.json` is never touched. Extinctions attributed by measurement (`attributeExtinction`), not by a node lookup | `tools/harness/full-run.ts:250`/`:265`/`:335`, `report.ts:525` |
| Battle persistence | **WIRED (T-28).** `applyBattleResult` is the first statement of all four finish handlers — wild, gym, rival, finale. **The four line numbers this row used to publish had all drifted by the next pass and are not published any more**; `grep -n 'applyBattleResult' game/scenes/OverworldScene.ts` returns exactly four call sites and that is the claim. `applyBattleAftermath` is the one writer of `curHp`/level/xp/bag outside creation and the year turn. The three docblocks that already called it *"the ONE writer all four launchers share"* **became true rather than needing repair** | `game/wild-battle.ts`, `core/save.ts` |
| XP carry-in | `BattlerSpec.xp` exists, `makeBattler` reads it back as `xp: spec.xp ?? 0`, `battlerSpecOf` copies it verbatim — carried, never derived, so a replay sees the same number (T-30) | `core/types.ts` `BattlerSpec`, `core/battle.ts` |
| Party-wipe recovery | Pure TS, zero engine imports. A wipe plays the fight's own losing beat, THEN blacks out, wakes the party healed at an inn and charges `2 × innTicks + 1 × travelTicks` = **5 ticks**, composed from existing keys — there is no `blackoutTicks` and there must not be one (T-29). The on-screen move is bound at **every shipped node**, and the test counts how many wake nodes actually differ so the fixture cannot go degenerate in silence. **It can no longer stack a dialogue on top of a year turn** — guarded after the charges, so the price and the move still stand and the cue stays owed. ⚠ **The premise `core/recovery.ts` prices the blackout against — a rest available "only for a player STANDING IN A TOWN" — was FALSE until `[R]` gained its location check**, so the owner's 2×inn+travel ruling had been priced against a baseline the code did not implement. It is true now. ⛔ **AND THE ON-SCREEN HALF IS BROKEN — items 46 and 47, open and in flight.** The SAVE is charged, moved and healed correctly; the PLAYER is left standing outdoors on the tile they fell on, there is no black background, and **the overworld then accepts no input at all — 3 of 3.** Read this row as a statement about `core/recovery.ts`, which is sound, and not about what a player sees | `core/recovery.ts`, `game/scenes/OverworldScene.ts` `recoverFromBlackout` |
| Inn rest | **HEALS WHAT IT CHARGES FOR, REPLAYS, AND ASKS WHERE YOU ARE STANDING.** `restAtInn` is `restRefusal` → `innRestFor` → `applyInnRest` → `spendTicks`: refusal, then consequence, then price. The selection is the blackout's own `restoredUids` **reused, not re-spelled**; the heal rides as its own absolute `{t:"innRest"}` tape entry rather than being derived from the `{t:"inn"}` **price** beside it, because the blackout levies two of those itself — and `replay()` now has a named `case "innRest"` arm that calls the same `restoreParty` the live path does. **`[R]` refuses off-town and indoors except in the town's own inn** — the room is identified from CONTENT, not from an id. **The `innCost` charge stays OFF** until money has an earner | `core/recovery.ts` `innRestFor`/`applyInnRest`/`innkeeperAt`, `core/save.ts` `restoreParty`, `game/scenes/OverworldScene.ts` `restAtInn`/`restRefusal` |
| Art-load deadline | `ensureNodeArt` takes a timeout (8000 ms default, a parameter so a test drives it) and **resolves** on it. A hung loader now costs one degraded visit instead of refusing travel for the rest of the session (T-31) | `game/mapview.ts` `ART_LOAD_TIMEOUT_MS`, `:278` |
| Enemy AI tie-break | Ranks on `movePowerVs × typeMultiplier` alone — the dropped factors are common to a pool and cannot reorder it. 13 → 0 divergences; the argmax is still an exact strict `>` | `core/battle.ts:1371` |
| Player art contract | **The first gate here that decodes a PNG** (via `sharp`): palette exactness, star-badge absence, no new swatches, and a freshness check against a live re-derivation. **GREEN — 16 of 16, re-run 2026-08-27.** The derived back and side views were rebuilt against the re-frozen palette; decoded off the previous commit they held **8 off-palette px** (back) and **420 in 11 colours** (side, still carrying the deleted star yellow), and both now decode at **zero** (T-24) | `tests/gates/player-art-contract.test.ts` |
| Asset palette contract | Every PNG the bundle ships out of `assets/final/`, decoded: exact palette membership, no vacuous pass, deletion detected by anchoring the scope to git. The advisory now prints each asset's distinct-colour count **against the measured Gold band 12–18**, and asserts that band against the reference captures it was derived from. The count itself is a reading aid and caps nothing — see item 32 | `tests/gates/asset-palette-contract.test.ts` |
| UI contrast contract | The UI cannot go illegible on a palette change without going red | `tests/gates/ui-contrast-contract.test.ts` |
| Interiors | Blueprints, plans, and a **view mode inside `OverworldScene`** — the player walks in, moves around and walks back out; `save.currentNode` keeps naming the town and `save.interiorId` says which room. Four plans: inn and supply shop in both walkable towns. ⚠ **Every door coordinate is PROVISIONAL and says so in its own `_note`** — the canon gives none, so all four were reasoned from the few positions it does pin, and each must be re-pinned to the door the art lane actually painted (**T-47**). Three towns have no interior at all (**T-48**) | `core/interiors.ts`, `data/interiors/*.json`, `game/scenes/OverworldScene.ts` |
| Art pipeline | Comfy Cloud client, batch runner, postprocess, overlay diff; **plus a supervised trial runner** (`tools/comfy/trial.ts`, `TRIAL_ROW_CAP` 20 for G13) | `tools/comfy/`, `tools/postprocess/` |
| Palette | 32 positional swatches, **re-frozen 2026-08-26 to the class-equal fit** — all 32 hex values changed, ids/count/`frozen` intact | `data/palette.json` |
| Dex art path | `dexArtId()` produces `dex-painted/dex-<name>`; bound by a 9-test set-identity gate | `game/survey-view.ts:868`, `tests/gates/dex-path-contract.test.ts` |
| Placeholders | Every missing asset draws as a labelled, unmistakably unfinished stand-in | `game/placeholder.ts`, `tools/postprocess/placeholder.ts` |
| Prose lint | Structural corpus checks with positive and negative controls | `tools/prose/prose-lint.py` |

## What is open

### Consequences of an honest ruler — deliberately not tuned

1. **Three of six gyms sit outside their bands, and the ruler moved twice in twenty minutes.**
   T-13 repaired the instrument, then T-10's age-multiplier halving and T-11's Producer re-spend
   moved what it measures. Measured with `npx tsx tools/harness/run.ts --mode gym --seeds 500`
   at **21:59**, inputs hash-checked byte-stable across the run, **at the party size the game
   allows**:

   | gym | leader | full party | target | verdict |
   |---|---|---|---|---|
   | 1 | Maribel | **98.6%** | 80–95 | +3.6 pp over |
   | 2 | Odo | 91.6% | 80–95 | in band |
   | 3 | Vesper | 65.0% | 60–80 | in band |
   | 4 | Sable | 75.8% | 60–80 | in band |
   | 5 | Noct | **74.8%** | 45–65 | +9.8 pp over |
   | 6 | Greaves | **65.8%** | 45–65 | +0.8 pp over |

   **Two figures that were circulating did not survive.** "Greaves −3.0 pp under band at the cap"
   was never measured; the real reading on the pre-T-10 tree at 21:50 was **44.2%**, −0.8 pp under,
   and after T-10's halving landed at 21:53 it is **65.8%, out of band HIGH — the sign flipped.**
   "Maribel +2.1 pp over" was **+1.8 pp (96.8%)** at 21:50 and is **+3.6 pp (98.6%)** now.
   T-13's own ticket text is also stale: it claims Gym 1 reads 93.4% inside its target and "4 of 6
   gyms in band" — neither is true on either tree measured. **Nothing was tuned to produce any of
   this.** — `tools/harness/`

2. **A palette id is a SLOT, not a colour.** Write this down before the next re-freeze repeats it.
   The class-equal swap re-pointed every UI swatch table because the *meaning* of each slot moved:
   `c18` went from `#f7ebd3` (cream, **17.543:1** against void) to `#37630f` (dark green, **2.891:1**;
   1.078:1 against the new panel `c06`). `UI_SWATCH` re-pointed 15 of 19 roles, and
   `menu-model.ts` / `survey-view.ts` followed. — `game/ui/Palette.ts:178`, `game/menu-model.ts:76`,
   `game/survey-view.ts:253`

3. **CLOSED — the derived player sprites are on-palette and the star badge is gone.** *(T-24, DONE)*
   The 21 dead hex literals in `tools/comfy/player-views.ts` resolve through `data/palette.json` by
   slot id, `tests/gates/player-art-contract.test.ts` decodes the committed PNGs, **and the assets
   have now been rebuilt against the re-frozen palette: 16 of 16 green.** Measured by decoding the
   previous commit's bytes rather than by trusting the commit message — back **8 off-palette px** in
   `#ec9a70`×4 / `#eec092`×4, side **420 px in 11 colours** including the deleted star yellow
   `#f9db10`; both now **zero**, and the approved front is untouched (it is not in the commit).
   ⚠ **The "7 red → 16 green" span is recorded as a claim, not a measurement**: re-running the gate
   against the old bytes needs a checkout, which was not taken. The endpoints were decoded; the
   arithmetic between them was not. **T-20's side-view legs are a separate defect and are still
   open.** Two findings kept, because they will otherwise be re-derived:
   - **Two sprite roles collapse onto one swatch:** `hair` and `hairHi` both resolve to `c05`, and
     `capOutline` and `capRim` both resolve to `c17`, so the nape band and the cap edge each lose a
     tone. **The reason first recorded here was wrong and is corrected:** it said the fit had "no
     swatch between `c05` and `c07`". It does — `c06` (`#74564e`) sits between them at L\*39 against
     `c05` L\*25 and `c07` L\*41. `c06` is a low-chroma mauve-brown, so it is not in the hair ramp
     by *hue*; the collapse is real and the explanation was not. Measured by the art session in
     CIE-Lab after this file asserted it from a nearest-hex reading. A palette id is a slot, and a
     class-equal fit owes no role a neighbour — but say which axis is missing, and measure it.
   - **A dead ternary meant every "derived" row in `_acceptance.json` was describing a re-stretched
     copy rather than the shipped bytes.** The detectors were honest about a file nobody ships.

### The shape behind most of what follows: a derived artifact carrying a hand-written claim

**A generated file that states a fact in prose is right when written and wrong forever after, and
nothing goes red** — the generator that would catch the drift is the same thing that is stale, so a
rebuild does not repair the claim, it *restores* it. Three instances, all found in this tree:

1. **`tools/comfy/build-manifest-b0.ts`** — a rebuild would have reverted two of Hank's recorded art
   rejections from "REJECTED by Hank" back to "SELECTED — pending Hank" and **deleted the reasons he
   gave**. Now merge-and-refuse, with a `--self-test`.
2. **`tools/palette/build-manifest-palette.ts`** — hardcoded the freeze prose, so running it undid
   the correction someone had just made by hand. Now derives it, and refuses on an unfrozen palette
   (item 7).
3. **Fossilised test anchors** — assertions pinned to a value *measured* under an older palette
   freeze. They read as assertions and behave as snapshots. Two were found in
   `tests/unit/battle-view.test.ts`, opposite polarities of the same fault: one froze a live number
   (5.29, replaced with WCAG's own published boundary greys, item 4), the other read a frozen claim
   off live swatches (repaired by pinning the four hexes of the freeze the audit actually ran on, so
   a record of a fixed defect stops tracking the present palette). A number that came out of a
   measurement is a fossil whatever the test is named — and the second one still *passed*, on a
   coincidence the next re-freeze is under no obligation to preserve.

The rule that comes out of all three: **a claim that can drift is derived, verified, or absent.** If
a generated artifact must say something, compute it from the artifacts it describes (or check it —
the palette promotion is a sha256 comparison, not a sentence), and make the generator refuse to write
rather than write something it cannot support.

### Stale instruments and dead comments — all closed 2026-08-27

Items 5, 6, 7, 11, 12 and 13 were T-25, now **DONE in full**; items 8 and 9 were T-2, now **DONE**.
They are kept, not deleted, because the shape recurs — **item 26 is where it recurred next**, found
while closing item 6.

4. **A hex fossil can hide inside a test named for a standard.** `tests/unit/battle-view.test.ts`'s
   "BINDS — the contrast maths agrees with WCAG's own anchors" carried three assertions: two real
   anchors (21:1, 1:1) and one comparing two live palette ids against `5.29`, a number an audit had
   measured on the previous freeze. The palette swap made it read 5.696 and the test went red — not
   because legibility broke, but because the fossil moved. **Repaired by another agent at ~22:01**
   while this file was being written; recorded here because the shape recurs and the name of the
   test is what hid it.
5. **CLOSED — `tests/unit/transcription.test.ts` no longer says battles are unwired.** The arithmetic
   above the comment was always correct; only the comment was wrong, and it now names the spender.
6. **CLOSED, and structurally.** No comment anywhere in `game/` or `core/` says `seasonBoundary`
   fires at "4, 8 and 12". The docblock is now `game/scenes/OverworldScene.ts:1973-1985` and states
   the cadence as *"the first `seasonOrder.length - 1` multiples of `clock.ticksPerSeason`"* — naming
   the balance keys instead of the ticks, and saying at `:1980-1982` that it does so "because a
   comment quoting the ticks goes stale in silence." **That is the fix generalised, and it is why
   item 26 was found.**
7. **CLOSED — the manifest-palette freeze prose is corrected AND can no longer revert.** It asserted
   `data/palette.json` was "FROZEN and UNTOUCHED" after the class-equal promotion had touched it.
   Re-verified by reading both artifacts: `tools/comfy/manifest-palette.json` now says the palette
   was RE-FROZEN to the class-equal fit and "is therefore no longer UNTOUCHED", and
   `tools/palette/build-manifest-palette.ts` **derives** that prose instead of carrying it —
   `purpose`, `status`, `_seedRule`, `_generationCount` and the `palettes` block are assembled at
   write time from `data/palette.json` and `tools/palette/candidate-sources.json`; the build
   **refuses** unless the palette is `frozen: true`; and the promotion claim is decided by comparing
   `palettes.frozen.colorsSha256` against `palettes.classEqual.colorsSha256` computed from the bytes
   on disk (both `51a95b06…` today) rather than by a literal. A `--self-test` covers the refusal, the
   unpromoted wording and a moved `frozenAt`. The generator is the reason this stays closed.
8. **CLOSED — the comment block at `tests/integration/demo-beats.test.ts:252-281` describes the
   amended §10.2, and no predicate moved.** The assertions are byte-identical to what stood before;
   green before, green after. It also **dropped a figure sourced nowhere in this repo** — *"16% of
   seeds at 4 seasons"* — for the published **12.5%** (3 of 24 seeds), which §10.2
   (`docs/build-doc.md:401`) and `core/foodweb.ts:242` both carry. The test **is** that measurement.
   The deleted line is in git: `git show af82c46 -- tests/integration/demo-beats.test.ts`.
9. **CLOSED — the mesopredator filter is bound.** `isMesoLine` (`tools/harness/fixture.ts:110`,
   applied `:115`) is covered by `tests/unit/harness-fixture.test.ts`, 5 tests, whose count assertion
   at `:216` names the **eight** sites where it bites against the two where it is a no-op
   (`cindershelf`, `r4`). Twelve node files ship, but `sanctum` and `sanctum-approach` have no
   top-of-web predator, so **the honest denominator is 8 of 10 sites, not 8 of 12.** Dropping the role
   test reddens 3 of the 5; the pre-existing suite stayed **fully green** under the same sabotage.
   Note *which* two nodes are the no-ops: **`r4` is the over-catch fixture's own node**, which is
   exactly why nothing ever saw this.
10. **`tools/comfy/manifest.json`'s 9 `_deviations[]` rows are no longer dead provenance.** This file
    previously recorded them as indexing a ledger the repo no longer keeps. They are now `LB-M1…LB-M9`
    and cited by `_targetSource`, `_derivedFormRule` and `_concepts[].source` inside the same file.
    **The old item was wrong; struck.**
11. **RESOLVED at ~22:11 while this was written.** `tests/unit/__repro-battle-clock.test.ts` was
    untracked debris whose own header said "TEMPORARY reproduction — deleted once the defect is bound
    by a real test"; `tests/unit/clock-subtick.test.ts` is that test, and the repro has been deleted.
12. **CLOSED — the dead `const year` binding is gone.** A comment at `tools/harness/full-run.ts:490-491`
    stands where it was, recording that the calendar→act leak was closed by threading `act` and that
    the binding it left behind read nothing. The loop opens `const act = balance.acts.first + 1 + y;`
    at `:492`.
13. **CLOSED — re-read, and it no longer says that.** `tests/unit/lifecycle.test.ts:1646` now reads
    "0.875 → 1.0 → 1.075, plus the metamorphic ×1.15", with the old triple kept two lines below as
    the recorded T-10 before/after rather than as the rule. The item outlived the defect; struck.

### Structural, unchanged

14. **`DialogueScene` is not registered in `main.ts`.** `OverworldScene.ensureDialogueScene`
    registers it at runtime as a declared stand-in. — `game/main.ts`
15. **Two wild-trait rollers live outside `core/`.** `game/wild-battle.ts:99` `rollWildTraits` and
    `tools/harness/player.ts:240` `rollTraits` are draw-for-draw identical; `core/` has none.
    Collapsing them is a delete.
16. **`QUEST_OBJECTIVES` is in the wrong file** (`game/quests.ts:160`). Moving it needs
    `balance.json` + `Balance` + `zBalance` changed together.
17. **Sign-chain gating derives the line id from the chain id.** `PropPlacement` carries `signChain`
    (`core/types.ts:144`); `SpeciesLine` does not. — `game/scenes/OverworldScene.ts`, `core/types.ts`
18. **`balance.encounter.levelByYear` keeps a year name that both readers index by act.** The
    *coupling* is closed — `tools/harness/full-run.ts:195` `wildLevel(act, …)` — but the key name
    still lies. Renaming touches `data/balance.json`, `core/types.ts`, `core/schemas.ts`,
    `game/encounters.ts` and six test files.
19. **Gaps in the battle event union.** `battleStart` is
    `{t, kind, playerUid, enemyUid}` — no trainer identity, so a gym fight cannot be announced by the
    leader's name. `BattleEvent.damage` carries no attacker; `levelUp` carries no maxHp/curHp; no
    player-facing refusal copy is authored. — `core/types.ts:403`
20. **The seed is not randomised.** `game/boot.ts:333` `requestedSeed()` returns
    `balance.rng.defaultSeed` (**1337**) unless `?seed=N` is in the URL, so every new game gets the
    same region. This is the prior question T-14 must answer before seed *guardrails* mean anything.
21. **CLOSED — the enemy-AI tie-break is exact, and the fix moved the game the opposite way from the
    prediction.** *(T-27)* It used to score
    `((atk × power) / def) × mult × predation × midRoll`, so a tie **on paper** rarely produced equal
    doubles: over 2160 shipped pairs, 59 tied on paper, 20 disagreed as doubles, and **13 chose a
    move that was not earliest in pool.** The key is now `movePowerVs × typeMultiplier` alone
    (`moveRank`, `core/battle.ts:1364-1369`) — the dropped factors are common to every move in a pool
    and cannot reorder it in exact arithmetic, so nothing was traded away. **13 → 0 divergences;
    exactly 13 of 2160 choices changed.** The comparison was **not** loosened: the argmax is still a
    strict `>` on an exact key, so no rng enters the enemy policy.

    **The prediction was that the enemy would get stronger. It got weaker.** Odo 91.6% → **95.2%**
    full party, **+9.8 pp** at matched party; Sable **−1.4 pp** once the harness player model took
    the same key. **Nothing was tuned.** The cause: **all 13 flips trade `ambush`'s entry-turn
    priority for equal damage** — the rounding had been selecting the priority move *by accident*,
    and pool order does not know priority exists. That is now its own open question (T-37). The
    player-side change is backed by an exhaustive sweep over **8.1 million pairings**: zero real
    reorders, all 11,602 divergences exact ties.

    **The two clause-7 tests this consequence reddened are CLOSED** *(T-32, DONE)*. `harness.test.ts`
    reads **76 passed of 76** — the 77 → 76 is one deliberate deletion carried out under the deleted
    test's own written protocol, not a lost test. What replaced it is an exhaustive sweep, and the
    sabotage that justifies it is the sharpest demonstration this repo has of a green test binding
    nothing: reverting `tools/harness/arena.ts` to the pre-T-27 full-product argmax reds the new sweep
    on **78 of 104,976 pairings with the cases named**, and **the 36-sample test it replaced stays
    green.** The reasoning, including the clause in the deleted test's docblock that was deliberately
    *not* acted on, is in TICKETS T-32.

### Art and audio

22. **Ten maps are on disk and nothing else is.** `assets/final/maps/` holds the twelve nodes' art
    less bowerdeep and cindershelf — all ten committed, all ten exactly on-palette (mean ΔE 0.000,
    zero off-palette pixels, measured by `tests/gates/asset-palette-contract.test.ts`), and all ten
    still WIP against T-17's amended top-down projection. No sprite, no dex plate, no UI frame, and
    **no collision mask — 0 of the 12 declared paths exist, checked one by one; see item 41 for what
    that costs and item 43 for why promoting the twelve git-ignored ones would make it worse.**
    `tools/comfy/manifest.json` is 288 rows, `{pending: 287, approved: 1}`;
    **10 of the 288 declared `finalFile`s exist.** The B1 reproduction gate has never been run.
    *(This item read "No art is on disk. `assets/final/` holds a `.gitkeep`" until now — it was true
    when written and had been false for a day.)*
23. **Billing: about 204 billed image generations across all trials to date — and THERE IS NO
    INSTRUMENT THAT CAN CONFIRM THAT NUMBER, so it is framed as a count kept by the lane that spent
    it, never as a reading.** *(T-26 for the per-image figure, DONE)*

    **There is no credit-balance endpoint, and this is a property of the platform, not a gap in the
    client.** `tools/comfy/client.ts:157-166` probes **three** paths —
    `/api/customers/credit`, `/api/credit`, `/api/user/credit` — **all three 404**, and `credits()`
    returns `null`. Comfy Cloud exposes none. ⚠ **That 404 result is a recorded live measurement and
    nothing in the tree reproduces it**: no test asserts it and no probe response is captured, so it is
    a claim with a date on it. Its one consumer prints `credits endpoint: none`
    (`tools/comfy/b0-views.ts:61-62`), and `tools/comfy/comfy-batch.ts:484-488` prints
    `projected credits: UNKNOWN` rather than inventing a figure when `perImageCredits` is null.

    **Any dollar figure is an ESTIMATE at ≈1.12 credits per image and must never be quoted as a
    reading.** `tools/comfy/manifest.json:9` carries `perImageCredits: 1.12`, provenance on `:10`:
    dashboard **4,147 → 4,127 across 18 images at 1024²**, which is 1.11 rounded up. **1.12 is the
    1024² figure specifically** — the same key's provenance line records a later mixed batch including
    256² probes reading near **0.53**, because cost tracks pixels.

    ⚠ **THE 204 CANNOT BE RECONCILED TO ANYTHING IN THIS REPOSITORY, and that is worth stating rather
    than quietly repeating it.** `.gitignore:8` excludes `assets/raw/**`, so **no commit records a
    single trial PNG.** `tools/comfy/manifest.json` is not a ledger — 288 rows, one `recordedSeed`,
    `attempts` summing to **1**. The `tools/comfy/trials/*.json` files are **specs, not run records**:
    **11** of them totalling **68 rows** (this item previously said nine). The only countable artefact
    is PNGs on disk, and the closest defensible figure is **199** files at the top level of the 28
    `assets/raw/_trials/*/` output directories — **182** if `_`-prefixed derived files are dropped —
    against **1,014** PNGs under `assets/raw/` in total. **None of those is a billed-generation count**:
    it mixes derived and quantized outputs with generated ones, omits nine other raw directories, and
    is blind to retries, which bill (`comfy-batch.ts:425` — one try plus two retries is three billed;
    `:450-451` — up to six, worst case nine, on a map-variant row). **The spend is real and roughly
    known; the count is not measurable from here.**

    **What survives unchanged: nothing in this project is constrained by image count**, and **G13 binds
    as a *review* discipline, not a budget one** — twenty images get looked at before they are made,
    which never depended on the price.
24. **No audio exists.** `assets/audio/` holds a `.gitkeep`; zero `this.sound` calls in `game/`.
    The 11-row track list is corrected (T-21 doc half); no composer family has been shopped and there
    is no `ATTRIBUTION.md`.
25. **The Legacy beat is untested against balance.** `retirement.heirLevelFactor` = 0.5 produces a
    measured ~2.1× power drop in the same year as a level-26-plus gym, and the harness has no
    lifecycle, so nothing measures it. A gym run seeded with a post-retirement party is the mode to
    add. — `tools/harness/gym-sim.ts`

### Found on the 2026-08-27 pass

26. **CLOSED — the comments that called a season four ticks long.** *(T-42, DONE)* The ticket
    predicted three sites; there were **four** — a test docblock was carrying the same figure and was
    found while the other three were being fixed. None of the four now states the number as the
    current rule: `game/scenes/OverworldScene.ts:1830` says in as many words that this line *"said
    '4-tick' for as long as that was false"*, and `:2349`, `core/regional-events.ts:418` and
    `tests/unit/overworld-scene.test.ts:1487` each name the window as `clock.ticksPerSeason` and mark
    the old figure as the then-shipped 16-tick year. **A ticket's own count is not a measurement**, in
    this file's own standing phrasing, and this is a fourth instance of it.

27. **Layouts must be AUTHORED, not derived — and this was reached twice, independently.** Once from
    the schema side, asking what an interior could be generated from; once from the pixel side,
    asking what a map deriver could produce. Both arrived at the same wall.
    - `zNodeFile` (`core/schemas.ts:211-226`) carries exactly **two spatial fields**: `collisionMask`,
      which is a path, and `props[]`, which is a list of x/y/radius. There is nothing else in a node
      from which a layout could be inferred.
    - **The best layout that data can justify differs from what `synthesiseBorderCollision`
      (`game/collision.ts:630`) already produces by 7–14 cells out of 4096** — a fraction of a percent.
      A deriver would be a large amount of machinery to move about ten cells.

    **That convergence is the argument, and it is recorded here so nobody rebuilds a deriver later
    on the reasoning that nobody tried.** Two independent routes reached it; the answer is to author
    the layout.

28. **The G7 word-matcher has real blind spots, and this is a recorded limit — not a reopening.**
    Hank ruled the matcher sufficient under T-3 (*"declare the word-matcher sufficient and drop the
    item"*), and that ruling stands. What it cannot do is written down so nobody mistakes green for
    proof. `MORALIZING_PATTERNS` (`tests/gates/guardrails.test.ts:789-831`) is **40 fixed regexes**,
    consumed by `firstMoralizingHit` at `:833`. Probed directly against that list:
    - *"You could put the net down any time you liked."* — **clean.** (`could-have` requires the
      literal words "could have".)
    - *"Nobody made you empty the shallows."* — **clean.**

    Both plainly tell the player they did wrong. There is also a gap inside the list's own
    vocabulary: `hope-youre-happy` is `/\bhope you'?re (happy|proud|pleased)\b/i`, so **"I hope you
    are happy" passes clean** — the expanded contraction escapes the rule written for it. The gate
    catches a vocabulary, not a stance. **Do not re-raise this as a finding; it is a property.**

29. **`SCREEN_SWATCH_ID.inkFlag` is `c13` where the re-picked house `accent` is `c16`.** The flag
    swatch lives at `game/survey-view.ts:280` (table at `:272`, with the divergence noted in the
    block comment at `:265-267`); the house `accent` is `c16` in both `game/menu-model.ts:79` and
    `game/ui/Palette.ts:174`. **Every other shared role aligns** — backdrop/bg `c00`, ink/text `c03`,
    inkDim/dim `c01`, inkCollapsed/danger `c09`, vertexLive/ok `c24`. Five of six, one divergence.
    `game/survey-view.ts:270` states that `Palette.ts`'s `UI_SWATCH` "is not an alignment target and
    never was", so this is recorded as a fact about the tables, not as a defect in either.

30. **`assets/reference/` holds ten Gen 2 / Gen 3 maps — inspiration only, and they were REFETCHED
    at native size after the first set was found contaminated.** Eight under `gen2/` (Azalea,
    Cherrygrove, New Bark, Olivine, Violet, Routes 29, 32 and 42) and two under `gen3/` (Fortree,
    Lavaridge), plus a `README.md` that says so. **Never shipped, never quantized, never fed to the
    pipeline.** Hank directed the folder explicitly. The two Gen 3 maps are T-17's structural
    references: Fortree is Bowerdeep, Lavaridge is Cindershelf.

    **The first captures were browser screenshots and every figure taken from them is withdrawn.**
    They were resampled — **642×574 from a 320×288 source, not even a clean 2×** — and interpolation
    invented colour on the way: they held **673 to 2,080 distinct colours** where the native frames
    hold 12 to 18. The only figures ever published from them were the **pixel-block measurements**,
    and those are **withdrawn as unsourced**, on the same standard as the other struck claims at the
    foot of this file: not disproved, but taken from an instrument now known to have been wrong by two
    orders of magnitude, so they are not evidence of anything and must be re-measured before reuse.
    The contaminated files are deleted. `tests/gates/asset-palette-contract.test.ts` now asserts that
    each surviving capture still measures inside the band it is quoted for, so a resampled screenshot
    cannot re-enter the reference set unnoticed.

31. **SETTLED — Hild's pitch is a building, and the doc prose was the outlier.** `CAST-AND-VOICE.md`
    called it a *"marsh stall"* while `tools/comfy/manifest.json` counted it among Brackwater's five
    tarred timber buildings and gave it a door. A stall needs no interior, so the blueprint count
    hung on it: four plans or three. Hank asked first whether the phrase appears in any shipped
    dialogue. **It does not — zero occurrences in `data/dialogue.json`; it existed in exactly one
    place in this repo, that one character brief.** His ruling: *"Assuming it isn't, you can consider
    that to be like a barn, basically."* **The blueprint stands and the plan count stays four.** The
    doc is already corrected (`docs/CAST-AND-VOICE.md:187`, *"a supply barn out on the piles"*), and
    only the two contradicted words moved — the over-explainer voice, the tic of naming what she
    cannot sell first, and the "that's Odo's figure, not mine" refusal are untouched. Note "stall"
    survives correctly in two other places and neither is a defect: `CAST-AND-VOICE.md:104` lists
    "stallholders" as a name-tier category, and Bowerdeep's night market genuinely has stalls.

    **The useful part is where the disproof came from: it was already sitting inside the blueprint's
    own `_featureSource`.** Hild's shipped lines describe a **trestle** with a run long enough to have
    an end — *"Reed bait's the bundle on the end of the trestle, and it has sat there since the thaw
    looking at me"* — plus salve and tonic as stock, standing on piles over open water. None of that
    is a stall. **The evidence had been assembled by the discipline of tracing every feature back to a
    shipped line, before anybody thought to ask the question.** That is the argument for the
    `_featureSource` convention itself: it is not provenance decoration, it is the thing that settles
    a contradiction between two documents without a new measurement — and here it settled one against
    the doc that everybody would have assumed was canonical.

32. **The maps use twice the colour Gold's do, and that is most of the "MS Paint" verdict.** The art
    session measured the eight native-size Gen 2 captures: **12 to 18 distinct opaque colours, mean
    16.0**. The two Gen 3 RSE captures read **49** each — a second reason not to mix the two as style
    sources on this axis, beyond T-17's projection. Measured the same way on the same day, **the ten
    shipped maps run 17 to 32, mean 27.0**: r2 uses all 32 of the frozen palette, brackwater 31, and
    only sanctum-approach at 17 falls inside the Gold band. Both sets of figures were reproduced
    independently before being written here, file by file.

    **This does not argue against a larger palette, and the two must not be read as opposed.** A
    palette **contains** a region; a single map **uses** a subset of it — 48 available and 16 used is
    correct, 48 available and 31 used is the bug. A per-scene subset drawn from a wider shared set is
    nearer to how the hardware being imitated worked than one global list every picture dips into.
    Written into build-doc §8.4 as a locked distinction rather than left here, because the next reader
    of the palette expansion will otherwise take this finding as a reason to abandon it.

    **And the colour count is only half of it. The other half is GROUND TEXTURE, and it is the half
    that has actually been shipping wrong.** A map at 16 colours and 9% edge density is flat; a map at
    16 colours and 45% is right; a colour check cannot tell them apart. The art session's diagnosis is
    a **postprocess** fact, not a generation one: **Gold never uses a flat fill anywhere** — grass is a
    dense checkerboard between two greens, paths a fine dot pattern, tree masses a repeating weave —
    and the texture lives in the **ground**, not the objects. Their figures: a 32×32 tile of plain New
    Bark grass, seven colours and no keylines, tiled to 1024², carries **43.59%** of their whole-map
    **47.51%** by itself, against **8.83%** for our best output. ⚠ **Those three figures are WITHDRAWN
    AS UNSOURCED** — see the withdrawal register at the foot of this file. `tools/artverify/ground-comparison.png`
    is 96 native pixels of Gold ground against ours at 6×, and it is the one artefact in this finding
    a number cannot substitute for — **it is what the finding now rests on**, and it is untouched,
    because it is a picture rather than a percentage.

    **Two facts, kept split, because a combined sentence gets half-implemented.** **A — ordered dither
    buys edge density** and does nothing to the colour count. **B — a per-map colour subset buys colour
    discipline** and does nothing to edge density. Each disproves the other's sufficiency: dither at
    amplitude 45 without the subset → 40.02% in 43 colours; the subset without dither → 16 colours at
    12.88%; both together → **44.74% in 16**, against Gold's 47.51% in 17. ⚠ **The `47.51` baseline is
    withdrawn as unsourced, and the three readings quoted against it go with it** (register at the foot
    of this file). **A and B each disproving the other's sufficiency does not rest on the baseline and
    stands**; *how close to Gold this got* does rest on it and does not.

    **And the dither is source-dependent, which makes it a fragility rather than a settled recipe.** A
    ±22 ordered bias crosses a palette boundary only where the ground colour already sits near one, so
    the same amplitude transforms one source and leaves another flat. Through the same postprocess, on
    one operator, comparable to each other and to nothing else: today's baseline input read **6.89%**
    ground edge after the dither; a c64-LoRA input read **54.84%**, against **60.10%** for Gold read
    the same way. Both are real; neither is "what the dither buys". An amplitude that works is a
    property of the **pair** `(source, amplitude)`.

    **Both readings are reported and neither is capped.** `tests/gates/asset-palette-contract.test.ts`
    prints each shipped asset's colour count and ground texture against their measured bands: under its
    own operator the ten maps read **8.4–44.1% texture, mean 22.0**, against **51–79%, mean 64.2** for
    the eight Gold captures — **all ten below the texture band, nine of ten above the colour band.**
    Nothing about either number is asserted, and the reasons are at the thresholds. A colour cap at or
    above `palette.length` cannot fail at all, because every opaque pixel is already asserted to be an
    exact palette colour, and a cap below it is taste with a number painted on it. A texture cap is
    worse: the response to dither amplitude is near-linear (0 → 12.88, 24 → 24.09, 40 → 40.02,
    56 → 63.77), so a generator can be tuned to any figure named — and applied globally the dither
    speckles roofs and walls, so **a map that reached 47% by ruining its buildings would pass.** What
    the gate asserts instead is the instrument: that both published bands match the captures they came
    from, that those captures still measure what they are quoted as measuring, and that the texture
    reading actually discriminates.

    **§8.2's Sobel was tried first for the texture reading and is structurally blind to it.** A 3×3
    Sobel cancels on a period-2 checkerboard — the `x±1` samples in each row share parity, so `Gx` and
    `Gy` are identically zero. Measured on a 256² synthetic: flat ground with one object **0.78%**, the
    same image with a one-pixel dithered ground **0.78%**, while the neighbour-difference operator the
    gate uses separates them **0.39%** and **93.94%**. Benign for `overlay-diff` itself, which measures
    layout drift and is right not to see dither — but it means **that gate cannot be used to check a
    re-dithered variant kept its texture**, and it is why this one defines its own operator. Both halves
    are asserted in the gate, so the note cannot rot into a claim nobody re-measures.

33. **`tools/palette/fit.mjs` structurally cannot produce a palette APPEND, and a second generator is
    the correct shape rather than a workaround.** Two properties, both read in the file: `K = 32` is a
    module constant at `:61` with no CLI override — the flags are `--sources`, `--out`, `--outdir`,
    `--label` and nothing else (`:78-99`) — and swatch ids are **re-derived from sorted ramp
    position** at `:373`, over a sort at `:361-372` that puts the neutral ramp first by L\* and then
    groups chromatics into 30° hue families. So raising K does not add swatches to the end: it refits
    from scratch and **silently re-orders every existing id**, which destroys the one guarantee an
    append exists to preserve — `c00`–`c31` byte-identical, so that nothing already indexed against a
    slot moves (T-15's lesson: **a palette id is a SLOT, not a colour**). Recorded here because the
    obvious future instinct is *"why not just pass K to the fitter"*, and the answer is that the fitter
    is a re-freeze tool by construction and a re-freeze is exactly what an append must not be.

34. **The FOURTH incomplete ground-texture instrument: concentration plus distinct-count cannot see
    ARRANGEMENT.** The published pair — *what share do the top three colours cover, and how many
    distinct colours are in the patch* — is a histogram, and a histogram has no notion of where a
    pixel is. **Three colours in large flat patches score identically to the same three interleaved
    per pixel**, which are the two grounds the whole art direction is about telling apart. **Neighbour
    alternation — the share of adjacent pairs that differ — is the third axis, and Gold sits at
    48.7%.** Recorded beside the three that failed before it (a 3×3 Sobel blind to a period-2 dither;
    a luminance threshold of 25 against Gold's own 28.2 separation; exact-RGB density saturating on
    unquantized output) because it is the same shape: **an instrument reporting confidently on a
    property it could not resolve.** Written into build-doc §16 with them, together with the rule the
    night's edge figures produced — **an edge-density percentage means nothing without its
    definition: threshold, channels, neighbours and denominator.**

35. **The recurring dark band across the bottom edge is the prompt skeleton's own cliff-step clause
    being obeyed literally — and this is the night's highest-value fix, LoRA-free.** It was called a
    cutaway strip for hours and read as a projection failure. It is not. **Hearthollow is a flat
    meadow hamlet with no elevation**, so the model has nowhere to put the step the clause asks for
    and puts it at the frame. **Deleting the clause removes the band.** The shape of the fix is that
    the clause should be **conditional on nodes that actually have elevation** rather than carried by
    every node's prompt — but **the art lane owns the prompt files and the fix is theirs to make**;
    this is recorded, not prescribed, and no prompt file was touched from here.

    **Recorded with it because a disproof is worth more than a plausible story: the negations
    hypothesis is cleanly DISPROVEN.** The theory was that the band came from negated phrasing. All
    six negated phrases were rewritten as affirmations; **the band survived, and a second band
    appeared at the top.** That is a disproof, not a weakened hypothesis — do not re-raise negation
    as the cause.

### Opened by the 2026-08-27 05:00 pass — the progression loop landing

36. **The persistence wiring landed, THE INN HEAL HAS NOW LANDED WITH IT, and the ECONOMY half of T-12
    still has not.** ⚠ **The first two bullets of this item asserted the opposite until now and are
    corrected, not rephrased.** Damage persists (T-28), a wipe recovers (T-29), and as of the inn
    commit a damaged-but-not-wiped party has a rest it can walk to. Each half was re-read this pass
    rather than inferred:
    - **`restAtInn` heals what it charges for.** It is `innRestFor` → `applyInnRest` → `spendTicks`,
      in that order — consequence before price — and the banner reports the count. The old claim here
      (*"its whole body is `spendTicks` and a banner … it charges two ticks for a rest that changes no
      HP"*) was true when written and is false now. No line number is quoted: this file has already
      published `:1972` for this method twice while the method moved.
    - **The reader count is ONE, and it did not change — what changed is who reaches it.**
      `medicine.innRestFullHeal` still has exactly one reader anywhere in the repo,
      `restoredUids` in `core/recovery.ts`, which is the only place the flag is branched on. It now
      has **two callers**: `blackoutRecoveryFor`, the wake, and `innRestFor`, the inn. Say it that way
      round — *"its only reader is the blackout's wake"* was two claims welded together, one of which
      (the reader count) is still true and one of which (that only the blackout gets there) is not.
      The selection is deliberately REUSED rather than re-spelled, so a private copy cannot drift from
      it; a test asserts both paths produce byte-identical parties.
    - **Money still has no earner and no sink.** Re-grepped this pass: `balance.economy` ships
      `innCost` 40, `trainerPayoutPerLevel` 12, snare/bait/salve/tonic prices — **zero readers of any
      of them** outside `core/schemas.ts` and `core/types.ts`. ⚠ **The clause that followed is
      CORRECTED, not rephrased:** this file said the *only* `money` occurrence in `core/` or `game/` is
      `core/save.ts` `money: opts.money ?? 0`. There are **five** — `core/schemas.ts:826`,
      `core/types.ts:770`, `core/save.ts:4` (a doc comment), `:384` and `:420` — and **zero in
      `game/`**. What survives measurement, and what was meant: **`core/save.ts:420` is the only
      *executable statement* in the repo that touches money.** **This is why the inn heal
      shipped with the charge OFF**: turning `innCost` on today, with nothing paying the player, makes
      the inn unpayable forever and re-creates the blockable run T-29 removed. The owner's question is
      therefore ordered — an earner first, then the sink.

      ⚠ **AND THIS ITEM'S SEVERITY HAS CHANGED WITHOUT ITS FACTS CHANGING.** *"No earner, no sink,
      zero readers"* has been recorded here for two passes as an unfinished feature. **The 2026-08-27
      playtest found what it actually costs: nothing in the game can be caught, so a never-cut demo
      beat is unplayable.** The full chain is **item 45**; the work is **T-60**, which is the snare
      grant alone and is deliberately NOT this clause — the canon already specifies three snares, and
      that needs no earner, no shop and no price. **T-60 first; the economy after it.**
    - **The explicit loss penalty exists, but as the blackout's 5 ticks**, and `core/recovery.ts`'s
      header argues in prose that this *is* the penalty T-12 asks for. **That is a reading, and it is
      marked as one here.** It prices a wipe; it does not price a loss that leaves something standing.
      The header has been amended in place to say that the inn is now a way back to full but is never
      the cheaper route out of a wipe, because a wipe happens on a route with no inn to walk to.
    This is T-12's remainder and it is written up there, not as new work here.

37. **`replay()` still has ZERO production callers, and T-34 did not change that.** The party half of
    a catch is fixed — the `catch` action now carries `gained` whole and absolute
    (`core/types.ts` `GameAction`), `applyCaught` (`core/save.ts:829`) is the one applier both paths
    come through, and `tests/property/determinism.test.ts:421` — *"reproduces the WHOLE save — the
    creature included, not just the count"* — is the test that binds it. **But every caller of
    `replay` in the repo is still a test**, re-grepped: `year-turn-ux`, `wild-battle`,
    `battle-persistence`, `recovery`, `determinism` and `seams`. **L10 remains a property the suite
    asserts, not a load path the game takes.** Say it that way round: the defect closed, the scope
    did not. The determinism tests still certify less than their name suggests.

    **THE INN REST WAS A THIRD INSTANCE OF THE SAME SHAPE AND HAS LANDED; THE WHOLE UNION HAS NOW BEEN
    AUDITED, AND TWO MORE REMAIN.** A tape entry was minted for the rest and `replay()` had no arm for
    it, so live the party healed and on replay it stayed hurt — L10 false for any run that rested. The
    fix is a named `case` reusing the live path's own function, and the rest's **tape** half moved from
    `core/recovery.ts` to `core/save.ts`, enacting the ownership rule `core/recovery.ts`'s own header
    already stated: **`save.ts` owns the TAPE, `recovery.ts` owns the DECISIONS.** Because `replay()`
    has no production caller, this was **a broken invariant, not a live player-facing fault** — which is
    exactly what let it survive, and is the argument for auditing the union rather than waiting for the
    next symptom.

    `GameAction` has **14 members**. Ten have arms. **Four reach `default`, and they are not four of a
    kind:**

    | member | reaches `default` | verdict |
    |---|---|---|
    | `inn` | yes | **correct** — a price, charged by `clockFromLog` (`game/year-replay.ts:167-172`). The heal is the separate `innRest` entry |
    | `travel` | yes | **`currentNode` is not restored** — T-53, and it needs a ruling, not a patch |
    | `foray` | yes | **`forayStepsSinceTick` is not restored** — T-54 |
    | `battleAction` | yes | **dead: zero mint sites anywhere** — T-55 |

    **One asymmetry to notice, because it is the tell.** `battle` is *also* a pure price, and it got a
    **named no-op arm with a comment saying so** (`core/save.ts:1224-1242`) while its three sibling
    prices were left on `default`. A named arm that applies nothing is how a reader learns the omission
    was decided; `default` is how a reader learns nothing at all.

38. **Three comments are now false and are recorded rather than fixed**, because each sits in a file
    another lane holds. Tickets **T-44**, **T-45**, **T-46**. **All three were re-read on this pass
    and ALL THREE ARE STILL OPEN** — none of the three was closed by the commits that landed in
    between, which is worth stating because two of them sit next to code that did change.
    - `tests/unit/overworld-scene.test.ts:1194` says `GameAction` *"deliberately has no `blackout`
      member … so a string comparison here does not even typecheck."* `core/types.ts:684` is that
      member. **The test still passes and its stated reason is dead** — which is the more dangerous
      shape, because nothing will ever go red to announce it.
    - `core/recovery.ts`'s **WHAT LIVES WHERE** paragraph says `core/save.ts` *"owns the TAPE —
      `BlackoutRecovery`, `blackoutAction`, `readBlackout`, `applyBlackout`."* The **type** is
      declared at `core/types.ts:634` and re-exported by `core/save.ts:622`, so every import is
      unchanged and nothing is broken. The sentence is imprecise, not wrong about the module's job.
      ⚠ **The `:30` this item published has drifted to `:38`** — the inn commit added 182 lines above
      it — so the paragraph is named by its heading here instead, which does not move.
    - `tests/unit/manifest.test.ts:1414` — the fossilised precondition, in the verified-state section
      above. Still RED, and still one of the ten.

39. **The instrument-failure tally is ELEVEN, and the list has outgrown "instruments".** Build-doc §16
    publishes the four ground-texture instruments at `docs/build-doc.md:496`, and **as of 2026-08-27
    it also publishes №11 below** (`:498`) — which arrived in build-doc FIRST and is folded in here,
    the opposite direction to the usual handoff. The roll-up lives here so the list stays whole. Seven
    were counted before the overnight pass, two arrived with it, and **№10 and №11 arrived after it**.
    The three degenerate-limit assertions the ordering hunt turned up are **inside №8**, not counted
    separately: they are the same shape at its limit, and splitting one shape into four entries would
    inflate a tally this file uses as an argument.
    1. A 3×3 Sobel cancels on period-2 and cannot see a one-pixel dither.
    2. A luminance threshold of 25 against Gold's 28.2-step greens — passing by 3.2 points, which is
       luck rather than headroom.
    3. Exact-RGB difference saturates on unquantized output and ranks everything alike.
    4. Colour concentration is a histogram and cannot see arrangement.
    5. **The eye.** A LoRA's ground looked stippled and was 2,451 colours differing by one per
       channel. **This is the most important on this list, not an appendix**: the others have an
       instrument to blame and this one does not, and it is the fallback every reader assumes is
       always available.
    6. **A comparison that answered a different question, with a decision-sized conclusion drawn from
       it** — raw LoRA output measured against the target, when the question that decides adoption is
       LoRA *plus postprocess*. Not an instrument at all, and the widest blast radius on this list,
       **because every number in it was correct.**
    7. **An assertion whose observation channel is silenced by the code under test.** A test watched
       `console.warn` to prove a watchdog timer had been cleared — but the callback's own
       `if (settled) return` suppresses that warning *even with a live timer still pending*. **The
       assertion observed nothing and passed.** Rewritten to count live timers directly
       (`tests/unit/mapview.test.ts:380-383`, `vi.getTimerCount()`), which is what made it bind.
       *"Assert on an observable side effect"* reads like good practice right up until the side
       effect is optional.
    8. **An ordering assertion with no margin is correct and useless — and the class hunt it started
       found three more, all at the degenerate limit rather than at the margin.** The UI-contrast gate
       required an inactive role be dimmer than every live text role on the same ground. **It ran, it
       compared, and it passed** — on **5.685 against 5.816**, i.e. **1.023× dimmer**. True to three
       decimals, false at arm's length. **The guard has since been repaired**: a role that takes the
       inactive exemption and then lands above 4.5 anyway is body text wearing the tier's name, and
       the single real violation is named in an allowance that **fails if it stops being a
       violation**, so it dies when the palette append lands rather than outliving the defect
       (44 pairings → 54, zero red). **The hunt that followed swept 1,016 ordering assertions across
       70 files, ~115 of them measured on shipped data, and the answer is thin and was not padded:**
       `tests/unit/props.test.ts` asserted an array length is `>= 0` — the floor of its own domain, so
       it ran, compared and resolved nothing, while the `continue` beneath it waved through the exact
       state its own docblock calls *"a chain with no way in"*; and the palette gate held an assertion
       **comparing 100 to 100**, because both synthetics saturate a top-three share on a
       three-colour fixture. One was left unfixed and **reported as unsafe rather than bolted to a
       threshold** — a cross-ground WCAG comparison at 1.081×, on the same swatch, where no correct
       threshold could be determined. Over a luminance-only metric blind to hue, an ordering check
       cannot see a saturated green sitting level with a desaturated brown.
       — `tests/gates/ui-contrast-contract.test.ts:571-572`
    9. **A rule stated correctly, applied one category too wide.** `tools/comfy/MAP-PROMPT-RULES.md`
       R2 records that the **`negative` prompt FIELD** is inert at cfg 1.0. Sound, measured, evidence
       intact. It says nothing about the word *"no"* inside the **positive** prompt, where those are
       ordinary tokens that work — the full-bleed clause (*"no island, no plinth, no cutaway earth
       wall, no border, no blank background"*) is the one clause in that file measured as a clear
       win, **0.06% void against 13.6–31.1%**. A brief said *"keep the full-bleed clause"* and
       *"delete every negation"* in the same breath; the full-bleed clause **is** negations, the
       contradiction resolved the way it was written, and the framed-island failure returned at once —
       **6 of 27 cells on a grey matte frame, against 3 of 37 before.** **There was no bad
       measurement anywhere in this.** The distinction to keep: a term in the `negative` field is
       inert and can be ignored; **a negated phrase in the positive prompt is judged per clause, on
       evidence.** The rule that falls out: **never delete a positive-prompt clause for its FORM —
       delete it because it was measured inert.**
    10. **AN ARM THAT SKIPS EVERY ASSERTION READS AS AN ARM THAT PASSED.** The asset-palette gate's
       reference arm iterated the Gold captures and `continue`d on a missing file. Measured by moving
       `assets/reference` aside: **42 passed (42), byte-identical to the baseline run**, while the
       advisory cheerfully printed *"0 capture(s) verified, 10 absent"* — so every published Gold band
       was then a literal checked against a literal in the same file. Nothing asserted a count, and
       the old comment's premise that absence was *"not a defect"* was false: `git ls-files` lists all
       ten as committed repo content, not art-lane scratch. Repaired by asserting the absent set empty
       **by name** and pinning the capture count **twice** — against the table's length and against
       the number of captures whose assertions actually ran — because the arm can also be emptied by
       rows LEAVING the tables, which a non-zero floor cannot see. **This is T-35's vitest pair
       arriving inside a gate that did run**: an empty run and a passing run look identical, and here
       the run was not even empty.
    11. **THE FAILURE DIRECTION IS THE TELL: an instrument that under-counts reads as good news, and
       good news is what nobody checks.** This one is published in build-doc §16 (`:498`) and is
       recorded here for completeness — the only entry on this list that went the other way round.
       Two instances on 2026-08-27, in different lanes, minutes apart. **(a)** A walk of `tools/` →
       `game/` imports used a `^import … from` pattern and found **5 import sites**; several real ones
       span lines with the specifier on the closing line, and the true count is **9 across 5 files**.
       The smaller answer was also the tidier one, and it dropped `game/survey-view.ts` out of a
       dependency audit entirely. **(b)** A check that no layout puts something solid on the spawn
       tile extracted the drawing with `len(line) >= 64`; the layout files run 114 lines at widths
       from 1 to 207, so the filter matched the **header prose**, read the centre character as `' '`,
       and concluded *"0 problems"*. **The first instrument was reading comments.** It surfaced only
       because a space is not a legend character and looked odd enough to check. Same shape as the
       whole-frame `flat%` that reported 78% as a win while measuring one unbroken green field:
       **the wrong number was the more pleasant one.** The practice that falls out: when a count comes
       back lower, cleaner or greener than expected, re-derive it by a second method; when a filter
       selects the region to measure, prove it selected the region; and **prefer parsing through the
       shipped parser over a fresh regex**, because the parser cannot drift from what the code reads.

    **Two things the list produces, and they are the reason to keep it as one list.**

    **RULE ZERO SURVIVES WITH ITS SCOPE NARROWED.** *Look before trusting a number* is right, and
    **looking is a CHECK, never the answer.** A rule that told you to look and let you stop there is
    exactly what produced the LoRA reversal — item 5 is the eye reporting confidently on a property it
    could not resolve, and item 6 is a correct set of numbers answering the wrong question. Looking
    disqualifies a number; it does not qualify one.

    **RETIRE AN INSTRUMENT THAT HAS PRODUCED A WRONG ANSWER — do not merely correct the answer.** The
    art session's wrong *"c09 is a neutral"* claim came from a crude hue-family bucketer, **the same
    instrument that had produced its palette-hole error hours earlier.** Its own words: *"Second time
    from the same tool; I should have stopped using it after the first."* A corrected conclusion
    leaves the tool in service, and the tool is what produced it. **That is what turns a list of
    failures into a practice**, and it belongs beside the eleven rather than under any one of them.

40. **THE SPAWN CELL IS WALKABLE ON EVERY MAP BY CONSTRUCTION, NOT BY LUCK.** All twelve committed
    layouts author `@` at cell **(32,32)** — `*` for the sanctum — which normalises to walkable floor,
    so **native (512,512) is walkable on all twelve.**

    ⚠ **THE SECOND HALF OF THIS ITEM NO LONGER HOLDS AND IS CORRECTED, NOT REPHRASED — see item 43.**
    It read: *"Because the ControlNet round paints FROM those layouts, the collision mask and the
    painting now derive from one source and agree by construction … the reason to say* inherited
    *rather than* verified*."* **The inheritance was conditional on a round that is no longer the
    round being run**, so the guarantee is withdrawn: what survives is the *layout* half — every
    layout authors a walkable centre — which is a property of twelve `.txt` files and is checked.
    Whether the *painting* agrees with it is now an open question and is item 43.

    ⚠ **This is NOT a statement that the maps are approved.** The owner has not declared the map set
    and the round is still in flight. What is settled is the relationship between two artefacts, not
    the quality of either.

    **It was verified through `tools/mapgen`'s own `parseLayout` / `normalisedAscii` rather than
    through a fresh regex, and that mattered** — the first instrument was a `len(line) >= 64` filter
    that matched the header prose instead of the drawing and answered *"0 problems"* off the wrong
    rows. Same verdict, entirely different reason, and the first one was reading comments. It is item
    39 №11(b), and it is the argument for parsing through the shipped parser.

    **T-39 is a different question and is NOT closed by this.** `sanctum-antler-ring` still sits at
    `x: 512, y: 512` with `interactionRadius: 48` in `data/nodes/sanctum.json` — re-read this pass and
    unchanged. The spawn cell being *walkable* does not stop the player landing **inside** the
    Sanctum's only prop; those are two map rules meeting on one cell, and only one of them is now
    guaranteed.

### Opened by the 2026-08-27 doc-currency pass — collision, and the seam under it

41. **COLLISION DOES NOT EXIST TODAY, and the size of the gap is measured rather than described.**
    All twelve `data/nodes/*.json` declare a `collisionMask` at `assets/final/maps/<node>-mask.png`.
    **Zero of those twelve files exist** — checked per declared path, one `existsSync` per node, not by
    counting the directory, because a directory listing cannot tell you *which* twelve names it is
    missing. `game/collision.ts` therefore falls to `synthesiseBorderCollision` (`:630`) at every node,
    and every node runs on a border ring: **252 solid cells of 4096**, being `4 × 64 − 4`.

    **Measured through the real `loadCollision` call** — the same one `game/scenes/OverworldScene.ts:740`
    makes inside `buildNodeView`, with `pixels` null exactly as `readMaskPixelsSafe` (`:3592`) hands it
    when the PNG is absent — against each node's authored layout:

    | reading | figure |
    |---|---|
    | solid in the layout, walkable at runtime | **19.53% – 43.14%** of every node |
    | worst node | `hearthollow`, **1767 of 4096 cells** |
    | best node | `r1`, 800 of 4096 |

    **No building is solid; no water stops anyone.** ⚠ **Two figures that were circulating are
    CORRECTED here rather than repeated: "19.6% to 43.2%" and "1769" are the SYMMETRIC DIFFERENCE** —
    every cell where the two grids disagree in either direction — **not the "walkable that the layout
    says is solid" figure the sentence around them described.** The extra 2–6 cells per node run the
    other way: border cells the synthesised ring blocks that the layout leaves open, which are the edge
    corridors. Both numbers are real; only one of them answers the question that was asked, and the
    difference is small enough that nobody would have caught it by looking.

    **The fallback announces itself, but not where a grep for `console` will find it.**
    `synthesiseBorderCollision` logs **nothing** — the module is deliberately side-effect-free — and
    instead returns a `note` (`game/collision.ts:655`) reading *"SYNTHESISED collision (`<mask path>`
    did not load) — walkable except the border; NOT an authored mask"*, which reaches the player
    through the HUD line at `game/scenes/OverworldScene.ts:848`. A second note on the *refusal* path
    (`:605-608`) opens *"REFUSED mask … SYNTHESISED collision instead"*. **This file previously
    described that string as something the code logs; it is a returned field rendered on screen.**

    **Twelve masks DO exist, git-ignored, at `assets/raw/_layouts/masks/mask-<id>.png`** — `tools/mapgen`
    output. Nothing in `data/`, `game/` or the Vite-served copy points at them, and promoting them is
    item 43, not a paste.

42. **THE LAYOUT→MASK ROUND TRIP IS EXACT, AND MOST OF THE SABOTAGE EVIDENCE REPORTED FOR IT DOES NOT
    EXIST.** Both halves matter, and the second half is the one worth recording, because a proof is
    only as good as the demonstration that it can fail.

    **What IS asserted, and passes.** `tests/unit/mapgen.test.ts:339` drives all twelve real layout
    `.txt` files through `checkMaskRoundTrip` (`tools/mapgen/verify.ts:406`) and asserts `[]` — **0 of
    4096 cells differing on every node.** `tests/unit/collision.test.ts:847` round-trips random grids
    on the same pair. Re-run this pass: **110 passed of 110 across the two files.**

    ⚠ **DEMONSTRATED IS NOT PROTECTED, and that is the whole of this entry.** The round trip WAS run
    end to end through the shipped `loadCollision` — but in a throwaway harness, not in the suite, so
    nothing in this repository will notice if it breaks tomorrow.

    - **What was actually run, and where.** A scratchpad harness (`scratchpad/masktrip/roundtrip.ts:104`,
      `sabotage.ts:86`, `today.ts:45`) called `collision.loadCollision(id, node.collisionMask, pixels,
      balance)` — the real function, the same one `game/scenes/OverworldScene.ts` calls inside
      `buildNodeView`. It reported **0 of 4096 cells differing on all twelve**, and its sabotage arm
      reported a vertical flip differing in **1274** cells and a horizontal flip in **1434**
      (`sabotage-out.md:12-13`), with per-node figures for all twelve at `:45-47`. Those runs happened
      and their outputs are on disk. They were deliberately kept out of the repo — the harness was
      briefed read-only — so they are a **demonstration, not a gate**, and they expire with the
      scratchpad.
    - **What the SUITE actually protects is narrower, and the gap is the finding.**
      `tests/unit/mapgen.test.ts` round-trips all twelve through `checkMaskRoundTrip`
      (`tools/mapgen/verify.ts:406`) and asserts `[]`, but **in memory and at `readMask`** — it never
      calls `loadCollision` (zero occurrences). The equivalence to the shipped path is *argued* in
      comments at `:14-16` and `verify.ts:401-404` (`loadCollision` with no options delegates to
      `collisionFromMask` → `readMask`, readable at `game/collision.ts:664-673`) — sound argument, and
      argument is not assertion. No committed test writes a damaged PNG, flips a mask, or repaints a
      single cell.
    - **Committed sabotages that DO hold:** `tests/unit/mapgen.test.ts:588` — one alpha-0 pixel and
      `readMask` refuses the file (`usable === false`, `transparentPixels === 1`); and the strongest,
      because it is the only committed one running through the real `loadCollision`,
      `tests/unit/overworld-scene.test.ts:1345` — an all-black mask is REFUSED rather than loaded as
      authored geometry (`source === "synthesised"`, note contains `REFUSED`, `health.usable` false,
      the player is not left standing in a wall, and the HUD prints it).
    - **A correction to a correction, recorded because the shape recurs.** A doc pass reported these
      sabotages as *"unsourced"* and the figure `1274` as *"not occurring anywhere in this
      repository"*. Both statements are true OF THE REPOSITORY and both were the wrong corpus: the
      evidence was in the scratchpad, where it had been required to stay. **An instrument searching the
      wrong corpus returns a confident absence** — and absence is the most persuasive kind of clean
      answer. Cross-referenced with `docs/build-doc.md` §16's newest entry: the pleasant reading is the
      one nobody re-derives, and *"no evidence exists"* is pleasant when you are auditing someone
      else's claim.

    **So the honest statement is: the layout→mask→grid transform is an exact bijection on the twelve
    shipped layouts and on random grids, it refuses a transparent pixel and an all-black frame, and it
    has never been shown to go red on a moved cell.** That last clause is the one a promotion would
    want, and it is the one nobody has written.

43. **"THE MASK IS UPSTREAM OF THE PAINTING" NO LONGER HOLDS, and promoting the twelve masks is
    therefore NOT a clear improvement on the all-open placeholder.** This corrects item 40's second
    half. It was true while the ControlNet hint was built from `tools/mapgen/layouts/*.txt`; the art
    lane reports it is now running a round that conditions on hand-made top-down control drawings
    instead, so **the painting's composition source and the mask's source are about to be two different
    files.**

    **What is checkable from here, and it is the load-bearing half:** the ten paintings on disk were
    **not** produced from the layouts. `git show HEAD:tools/comfy/manifest.json` contains **zero**
    occurrences of "controlnet", and `tools/comfy/controlnet-graph.ts` and `tools/comfy/hint-image.ts`
    are **untracked** — the ControlNet lane has never been committed. The ten committed maps predate
    it. **The layouts and the paintings do not correspond**, and nothing reconciles them.

    **The consequence is the part that must not be lost, because the conclusion alone reads as
    caution.** A mask shipped against today's painting **blocks the painted road and leaves the painted
    buildings walkable.** That is worse than no mask: an all-open placeholder is *visibly* unfinished
    and lets the player reach everything, while a wrong mask is invisibly wrong and stops the player
    walking down a road they can see. **Correct geometry against the wrong picture is not partial
    progress.** The work this implies is T-56 (the gates) and T-57 (the ruling), not a promotion.

    **One in-tree corroboration that the two readings of a layout are already pulling apart**, from the
    art lane's own uncommitted `tools/comfy/hint-image.ts`: a layout's outer wall ring *"is doing a real
    job"* as a collision spec — it is what stops the player walking off the map — and is *"the defect"*
    as a composition brief, so the hint drops the ring the mask depends on. **The two readings of one
    file disagree**, in the file that reads it.

44. **TWO ART-LANE READINGS ARE WITHDRAWN BY THEIR OWN AUTHOR — recorded as withdrawals, on §16's
    standard: not disproved, and not evidence either.** Both are the kind that get re-cited from memory
    once the reason is gone, which is why they are written down rather than deleted.
    - **"ControlNet is refuted."** **Over-generalised.** The border ring the model reproduced **was in
      its input** — every layout is ringed by wall characters, which `tools/comfy/hint-image.ts` states
      about itself and works around. That indicts **the layouts as a hint source**, not the tool. Do not
      cite it as a verdict on ControlNet.
    - **"ControlNet at 0.9 destroys the art."** **Confounded.** It was measured against see-through
      wireframe control drawings, which make the model draw roofs on posts. The strength and the drawing
      style moved together, so the reading cannot separate them.

### Opened 2026-08-27 by the FIRST LIVE PLAYTEST — the game was driven in a browser

⚠ **PROVENANCE, AND IT BINDS EVERY ITEM IN THIS SECTION.** The bundle that was played was built from
the tree **before several of the commits that have since landed**, and `game/scenes/OverworldScene.ts`
was being edited by another lane *while the run was in progress*. **Every scene-level line number the
playtest cited is a reading against a stale tree and is NOT reproduced here** — where a line is quoted
below, it was re-read on the current tree and says so. The playtester marked their own observations
`[SAW]` and their readings of code `[INFERRED]`; **that distinction is theirs and is preserved.** An
inference does not become an observation by turning out to be right.
⚠ **And the few `game/scenes/OverworldScene.ts` lines cited below were exact when written and are
citations into a file another lane is editing this minute** — re-read one before acting on it. The HUD
citation had already drifted by one during this pass and was replaced with a symbol.

⚠ **Two rig caveats they recorded, so nothing below is mistaken for a game bug.** The driving Chrome
window was occluded, so `document.visibilityState === "hidden"` and Chrome starved `requestAnimationFrame`
— Phaser does not stop itself when hidden, so only the browser's rAF was starved. They replaced it with
a worker-driven pump (page-side only, **no repo file touched**) and measured ~110 fps. **With reliable
synthetic input they never again saw a dropped or doubled key**, so the two intermittent input findings
from the early run — a single Down moving two rows in the slot menu, and two rapid Rights advancing one
step in Settings — **are discounted by their own author** as artefacts of the extension's key dispatch.
They are recorded here as discounted rather than deleted, because "one keypress from overwriting the
wrong save" is the kind of note that gets re-found.

45. **⛔ CATCHING IS UNREACHABLE, SO DEMO BEAT 1 CANNOT BE PLAYED. This is the project's own thesis
    landing on a never-cut beat: the reachability gate proves a path to the SCREEN, not to a MECHANIC.**
    Verified end to end on the current tree, not taken from the playtest:
    - **The canon grants three snares, and the entry fires.** `data/dialogue.json:611`
      `maren.tutorial.snare` ships *"Snares first. Three of them, in the satchel by the door. The
      satchel comes back to me."* It is correctly gated on `when: { flagsUnset: ["tutorial.snare.done"] }`,
      reached by `goto` from all three starter picks, sets its flag, and `goto`s the survey tutorial.
      **The gate is right about it. The line reaches the screen.**
    - **A dialogue entry has no way to give the player anything.** The key union over all **215**
      entries is exactly fourteen keys — `chainStep, choices, goto, id, kind, lines, node, priority,
      propId, quest, setFlags, signChain, speaker, when` — counted, not assumed. `zDialogueEntry`
      (`core/dialogue-schema.ts:356`) is a **`z.strictObject`** over those same fields, so an `items`
      key would be a *validation error*, not an ignored one. **An entry can set a flag and nothing
      else.**
    - **No grant machinery exists.** `addItem|giveItem|grantItem|awardItem` returns **zero hits
      repo-wide**. Every production write to `items` is a *replace* from the battle bag as the reducer
      left it (`core/save.ts:523`, `:598`, built at `game/wild-battle.ts:484`) — spend-only, and
      structurally unable to increase a stack. The only places a snare enters a bag are two test
      constructions (`tests/unit/overworld-scene.test.ts:955`, `:3518`).
    - **No starting inventory.** `newSave` (`core/save.ts:404`) writes `items: { ...(opts.items ?? {}) }`
      at `:421` and **no caller passes `items`** — `game/boot.ts:412`,
      `game/scenes/OverworldScene.ts:566`, `tools/ui-frames/contact-sheet.ts:60`,
      `tools/harness/full-run.ts:397`. The playtester read the same fact out of `localStorage`
      `[SAW]`: `{"money":0,"items":{}, …}`.
    - **No shop — and the shop copy ships.** `vendor-hearthollow.shop` (`data/dialogue.json:4329`,
      `kind: "service"`) carries the full vendor scene: *"Snares and salve. Tonic's behind me and it
      costs what it costs."* The supply shop's SERVICE anchor
      (`data/interiors/hearthollow-supply.json:38-47`) resolves through `interiorEntryId`
      (`game/scenes/OverworldScene.ts:3693`) into `playEntry` (`:1143`) — **it plays that dialogue.**
      There is no store UI and no buy path anywhere in `core/` or `game/`. The playtester stood on both
      Kett's tile and the shop service tile and pressed `[E]` on each: both play Kett's lines `[SAW]`.
    - **The code says the consequence out loud, deliberately.** `game/wild-battle.ts:266-267`: *"No
      snare is conjured for the fight: a player with no snares cannot catch anything, which is the
      honest state and the one the economy tunes."* On screen `[SAW]`: SNARE opens `Base — /
      Weighted — / Master —`, the dash meaning zero held, and choosing one **consumed the turn with no
      message in the log at all.**

    **Build-doc §15 names it twice** — **I1** *"vertical slice playable end-to-end (**catch**, battle,
    survey moves, year turn)"* and **I2** *"cascade demo reproducible from `overcatch-script.json` in
    real play."* And `fixtures/overcatch-script.json`'s own `_why` states the standard it now fails:
    *"Nothing here is a forcing helper or a test-only shortcut: every entry is an action a player can
    take."* **Every entry in it is a `{t:"catch"}`, and the only production mint site of that action is
    `game/wild-battle.ts:396`, inside the snare throw the player cannot reach.**

    **THIS ALSO EXPLAINS THE RED CASCADE GATE — one problem, two ends.** See the note at the top of this
    file: `harness.overcatch` names a reference player holding a **weighted** snare that costs 60 and
    cannot be obtained, and `tools/harness/full-run.ts:235` hands `ref.snareTier` to `catchChance` with
    **no inventory check at all**. **Tuning the budget cannot fix a snare the player cannot get**, and
    the gate turning green would not be evidence of reachability. **The work is T-60, the shape is the
    owner's, and it is implementing shipped canon rather than inventing (G2-safe).**

    ⚠ **This is not a new discovery about the economy** — item 36 and T-12 clause 4 have recorded "no
    earner, no sink, zero readers" for two passes. **What is new is the consequence.** Both entries are
    updated in place rather than duplicated.

46. **⛔ A PARTY WIPE PERMANENTLY ENDS THE RUN — 3 of 3. OPEN AND IN FLIGHT; NOT FIXED.** `[SAW]` after
    a lost wild fight, a lost rival fight and a lost gym fight: once the last blackout-narration line
    closes, **nothing responds** — arrows, `[C]`, `[E]`, ESC twice. **It is not the harness and not a
    stopped game loop**, measured in the same instant: `{ keydownsSeen: 1, framesAdvanced: 56 over
    ~500 ms }`, and separately 142 and 148 frames on the two later reproductions. **No console error, no
    exception, no Phaser warning.** The key reaches `window`, the game steps, and the overworld does
    nothing with it. The playtester's reading of the cause — more `scene.pause()` calls than
    `scene.resume()` across a chained pair whose own comment says the pair is *"not ref-counted"* — is
    marked **`[INFERRED]` by them** and is preserved as an inference. **A lane is repairing this now and
    its work has NOT landed.** Appended to **T-29**.

47. **⛔ THE BLACKOUT HAS NO BLACK SCREEN AND DOES NOT WAKE THE PLAYER AT THE INN. Both halves are
    quoted in the owner's own ruling. OPEN AND IN FLIGHT.** Hank: *"a dialogue shows up with a black
    background saying you passed out or something like that, **and then you wake up at the inn**"* —
    recorded verbatim in `docs/TICKETS.md` T-29 and in `core/recovery.ts`'s header, both re-checked this
    pass and intact. What draws `[SAW]` is the ordinary dialogue box over the **live overworld** with
    the debug HUD still on top of it. And the player wakes where they fell: tile `18,29` before the
    fight and after the whole sequence, with the inn door at `18,24` and the interior never entered.
    **The node move is a correct no-op** — for a wipe in Hearthollow the wake node *is* Hearthollow —
    so nothing puts the player in the room the prose describes.
    ⚠ **THE TICK CHARGE IS NOT THE PART THAT FAILED.** The banner read `hearthollow 5 ticks` and the
    meter moved by five, which is `2 × innTicks + travelTicks` exactly as ruled. **The shape worth
    keeping: the test written under T-29 binds the node-level move at every shipped node and is right —
    and it cannot see that a wake node equal to the current node leaves the player standing outdoors on
    the tile they fell on. The thing asserted was the graph hop; the thing ruled was the room.**

48. **🔴 NOTHING THAT MOVES IS DRAWN — and it is the art lane, not a regression.** `[SAW]`, each with
    the placeholder's own printed label: the player is a box reading `player/player-front 32x48`; both
    battlers are boxes reading `creature-battle/battle-loamunder-e-front 96x96` and
    `battle-cindril-j-back 96x96`; TEAM's portrait is `dex-painted/dex-cindril 96x96`; the title banner
    is `ui/title-banner 208x48`. Interiors render as untextured footprints and the HUD says so:
    *"FOOTPRINT interior hearthollow-inn — 13x8 plan cells … NOT painted art."* **Only the ten painted
    node maps and the town props are real art** — consistent with item 22 and with the placeholder
    contract working as designed. **The player art that IS in the repo lives under
    `assets/approved-trials/_player-views/derived/` and is never copied anywhere the game can load it**
    — `assets/final/` holds `maps/` and nothing else. That last clause is worth acting on: it is a
    *sync* gap, not a missing asset.

49. **🔴 / 🟠 / 🟡 The rest of the ranked list, at the playtester's own severities.**
    - 🔴 **A 16-line debug HUD covers ~75% of the 480×320 screen** from the moment gameplay starts,
      bottom lines overdrawing each other, overlapping the dialogue box and the choice list, with no key
      to dismiss it — `[C]` is a separate collision overlay. Re-read on the current tree: **`this.hud`**
      is one text object created in `create()` at depth 100 with `setScrollFactor(0)`, and it is
      **unconditional** — no debug flag, no toggle, no build-time gate. **No line is published for it:
      `game/scenes/OverworldScene.ts` is being edited right now and the citation drifted by one while
      this section was being written.** **T-61.**
    - 🟠 **The battle log's arithmetic disagrees with the bar**: the log printed
      `Cindril -62 HP · Resisted` while the bar moved 58 → 2, which is **56** removed `[SAW]`. **T-62**,
      and no cause is asserted there.
    - 🟠 **The SNARE turn is consumed silently when you hold none** — no message at all. Part of
      **T-60**'s surface.
    - 🟡 **The vertical slice past R1 is unreachable in practice**: the HUD offers only `[1] travel → r1`
      from Hearthollow, Brackwater sits behind the act gate, the gate needs Maribel's badge, and the
      badge needs a creature that survives one hit `[SAW/INFERRED]`.
    - 🟡 **The starter choice does not choose the starter.** The party entry stays
      `uid: "provisional-starter"`, `lineId: "cindril-line"` after the opening beat while `questFlags`
      carries `"story.starter": "cindril-line"` as a flag only. The console says so on every new game,
      verbatim: *"no opening beat yet — seeding the PROVISIONAL starter … Lane C7's opening beat
      replaces this by passing `startNewGame({ party })`."* The playtester chose Cindril and so saw no
      mismatch; **a player choosing Puddlisk or Thornlet would set the flag and still be handed a
      Cindril** — `[INFERRED]` from the save and the console, correctly marked as such.
    - 🟡 **TEAM prints max HP only** (`hp 58`), so no screen outside a battle reports how hurt anything
      is.
    - 🟡 **SURVEY's `seasons` column prints a number identical to `count` on every row** of both nodes
      looked at. `[SAW the numbers; INFERRED that it is wrong.]`
    - **There is no autosave.** SAVE in the ESC menu is the only writer, and CONTINUE after an unsaved
      run restores the state written at NEW GAME. **Defensible design** — recorded because combined with
      item 46 a wipe costs everything since the last manual save.

50. **WHAT WORKS, AND IT IS SUBSTANTIAL — record this with the same weight as the failures.** All
    `[SAW]`: boot and title (Phaser **3.90.0**, the pinned 3.x, not 4.x); save slots with per-slot
    state, the v1-save warning rendered legibly, and an overwrite confirm whose cursor **starts on NO**;
    settings that persist across a reload; grid movement, camera follow, the foray step counter, and
    the 52-tick year meter with the correct tick costs. **Interiors work fully** — door-tile entry,
    per-tile anchors, Aldis's line, `[R]` charging exactly `innTicks` = 2, exit to the right tile, and
    indoor steps correctly **not** counting as foray steps. Dialogue: typewriter, ▼ caret,
    complete-then-advance, multi-line entries, choice lists, chained cutscenes, flags persisted to the
    save. Battles render and play, with **correct per-kind greying** (Bag/Snare/Team/Flee all greyed in
    the rival fight, only Fight selectable) and a **visibly working type chart** — Pyre took a Plant
    Bramblehog 93 → 18.
    **AND THE SURVEY IS THE STRONGEST THING IN THE BUILD.** It prints **real derived populations that
    match the overworld's encounter weights exactly** — Hearthollow reading nibbin 8/24, pollywisp 4/12,
    bramblehog 6/18, skir 6/18, loamunder 24/72, carricrow 2/6 against `flora 60/100 · lines 6 ·
    individuals 50` — ←/→ pages all **12** nodes, and TAB draws a real **food web** with tier labels and
    edges (`links 9 · collapsed 0`). **The claim this page has always made about derivation is visible
    on screen.**

    ⚠ **BEAT 7 — "an inn heals damage" — IS NOT VERIFIED ON SCREEN, and the reason is worth keeping.**
    The playtester could never construct *alive, damaged, and the overworld responsive*: every fight
    either one-shot the starter or ended in a wipe and the softlock, **and TEAM shows only max HP**, so
    **no screen in the game would have reported it even if they had.** The inn rest is asserted by tests
    and by the replay arm; it has not been seen. That is a statement about the evidence, not about the
    code.

51. **CLOSED — the quest layer's year-turn defect, the deadline guard, the release refusal, and BOTH
    quest gates rewritten to OBSERVE A DRIVEN PLAYER.** Each was re-verified against the tree, not read
    off a commit message.
    - **Quest progress is no longer destroyed at the year turn.** Age is read off the tape's own
      `gained` field rather than off the live individual — `core/quests.ts:341`
      (`if (a.gained?.age !== age) continue;`) with `stillHeld` split out as its own clause at `:303-305`,
      so *"caught as"* and *"brought back"* stop being conflated. The tape carries it
      (`core/types.ts:667`, written at `core/save.ts:861`, produced on the real catch path at
      `game/wild-battle.ts:394-395`).
    - **The deadline guard was made real rather than deleted, and the reason is G10.** It is live at
      `game/quests.ts:555`, and its own justification block says why it is reachable in play: **an
      Ancient never ages** (`core/lifecycle.ts:607-613`, `ageOneYear` returns the creature unchanged
      with an `ancientSkipped` event), is **always taken at Elder** (`game/encounters.ts:239`), and
      **`data/nodes/r2.json:43-47` carries one** — `undermere-line`, `count 1`, `ancient: true`. What
      made the guard fire at all was moving the deadline off the wall clock onto each tape entry's own
      year (`core/quests.ts:391-392`).
    - **Release no longer offers a creature `applyRelease` would throw on.** The guard is `here()` at
      `game/quests.ts:770`, applied at `:774`/`:779`, resolving against the save's **own `nodeStates`**
      — the exact key set `applyRelease` sees — and returning `null` (filter nothing) when the question
      is unanswerable rather than refusing falsely. What it prevents is `applyRelease` (`core/ecosim.ts:819`) throwing an
      `EcosimError` for a line with no population at the node.
    - **The release refusal now says WHICH reason, and five tests can finally see it.**
      `releaseRefusal` (`game/quests.ts:791-798`) returns two distinct sentences, and the banner
      (`game/scenes/OverworldScene.ts:2002`) and the HUD (`:3520`) read the **same function**, so the
      advertisement cannot drift from the behaviour. **The production change had passed 125/125 while
      completely unverified**; five tests now pin a specific reason and three more observe the mechanism
      without pinning one.
    - **BOTH QUEST GATES WERE REWRITTEN TO OBSERVE, NOT TO CONFIRM A ROW EXISTS.** The expander is
      **deleted** — a repo-wide search returns no live code, only the tombstone at
      `tests/gates/reachability.test.ts:325-338` recording what it used to certify. Turn-in flags are
      now observed by **building a maximal player per node** — held counts capped by the node's own
      standing count, real `catchAction`s onto the tape, half of them put back through the real
      `releaseIntoNode`, the whole graph walked, retirement driven — and asking the **real**
      `syncQuestFlags` (`questTurnInWrites()` at `:402`, with a binder at `:917` asserting the
      observations are not vacuous). Two new gates: **GATE 2f** (`tests/gates/quest-layer.test.ts:1462`)
      checks the objective against a **measured** world and takes the table as an argument so a sabotage
      can hand it a damaged copy; **GATE 2g** (`:1660`) requires the objective's node to be one the
      **quest's own copy names**, with a single reviewed exemption whose adjacency is re-derived rather
      than waved through.
    - **F6, F7 and F8 are closed** — three tautologies replaced, **and that count belongs to F7 alone**;
      F6 was a season check that grepped a kind's *name*, F8 was the census. ⚠ **The labels F6/F7/F8
      exist only in a commit message**: a repo-wide search finds them in exactly one comment
      (`tests/gates/quest-layer.test.ts:990`) and nowhere in these docs, which is why the substance is
      written out here instead of the labels.
    - **The value-aware precondition census immediately surfaced a flag that had never been reviewed
      because its own `false` write counted as a writer: `story.blackout.woke`.** `narration.blackout`
      lowers it to `false`, so a key-based census counted that entry as its writer, while its real
      writer is a bare literal in `core/recovery.ts`. It is now driven through the real
      `applyBlackoutRecovery`, and the two reviewed exemption lists are both **empty**.

52. **MEASURED, AND KEEP IT: THE GREEDY YIELD EQUALS EACH NODE'S SHIPPED STANDING COUNT, EXACTLY.**
    `TAKEABLE_AT` (`tests/gates/quest-layer.test.ts:698-733`) asks how many individuals a player working
    one node could ever take over the whole run. **Because a population at zero does not breed**, the
    answer is the node's own shipped count and nothing more. Verified two ways — by summing
    `populations[<line>].count` in each `data/nodes/*.json`, and by executing the real engine
    (`core/ecosim`, `core/foodweb`, `core/rng`) over `yearsTotal` × 4 seasons:

    | r1 | r2 | r3 | r4 | sanctum |
    |---|---|---|---|---|
    | **67** | **71** | **70** | **44** | **3** |

    The identity holds at **all twelve** nodes, not only these five (hearthollow 50, brackwater 52,
    bowerdeep 52, cindershelf 31, duskhollow 26, r5 35, sanctum-approach 3). The mechanism is in the
    source: births are `count × breedRate × foodFactor × presenceMult` (`core/ecosim.ts:550`),
    identically zero at `count === 0`, and nothing re-seeds an emptied population.
    ⚠ **This is a measured FLOOR, not a ceiling** — the gate's own words — and it is the honest
    denominator for any question about what a node can supply.

## What is next

The work queue is `docs/TICKETS.md`, and it is ordered. This is the shape of it.

0. **THE SNARE GRANT (T-60), AND THE WIPE SOFTLOCK THAT IS ALREADY IN FLIGHT (item 46).** These are
   ahead of everything below because they are the two things that stop a player playing. **T-60's
   shape is the owner's** — a general `items` grant on the dialogue schema, or a flag-driven grant in
   code — but that three snares are owed is not in question: the canon says so in the player's own
   tutorial. **It is not the economy, and it must not be answered by shipping a shop.**
1. **Get a ruling on the cascade budget** (the section at the top). Nothing about beat 1 is settled
   until a knob moves or the beat's site changes, and no agent may pick either under G6/G14.
   ⚠ **And read the two-ends note first**: the knob alone cannot make the beat playable, because the
   gate's reference player is holding a snare the game cannot supply (item 45). **Both halves are
   needed; neither substitutes for the other.**
2. **Finish T-12 — the ECONOMY half, which is now the whole of the remainder.** T-28, T-29 and T-30
   shipped together: damage, levels, XP and the bag persist, a wipe blacks out and wakes healed at an
   inn for 5 ticks, and XP carries across fights. **The inn heal has since landed too**, so T-28's
   clause-2 shortfall is closed and this list no longer names it. What is left of T-28's own
   *done when* is the money: **no earner, no sink, and no town shop sells anything.** The order is
   forced rather than chosen — an earner has to exist before `innCost` can be switched on, because a
   priced inn with no income is a run that blocks. Item 36 above is the measured state.
3. **Get a ruling on which artefact is authored first — the painting or the collision layout**
   (**T-57**). This is ahead of the collision work rather than beside it: **the twelve masks already
   exist**, git-ignored, and promoting them today would block the painted road and open the painted
   house (item 43). Landing them is then a **gate recalibration** (**T-56**), not an art approval.
4. **Fix the replay union's three remaining gaps** (**T-53**, **T-54**, **T-55**). T-53 is a decision,
   not a patch — an existing assertion pins the current behaviour deliberately.
   ~~**Repair the player-sprite assets** (T-24)~~ — **DONE**; the gate reads 16 of 16. **T-20's side
   view is a separate, still-open geometry defect and the green gate is not evidence about it.**
5. **Re-author the maps top-down** (T-17, amended). Three of the nine rejects retire at the root and
   `r5`'s defect inverts, so the reject list is smaller than it looks. **Colour discipline is part of
   the re-author, not a separate pass** — item 32: the shipped ten run 17–32 colours against Gold's
   12–18, and nine of the ten are flagged above the band by the palette gate's advisory.
6. **Run the B1 reproduction gate** (build-doc §15, Lane B) — one asset per pixel class reproduced
   from `manifest.json` byte-identically. Nothing multi-version starts before it passes.
7. **Give the harness a lifecycle mode** so the Legacy beat is measured rather than asserted.
8. **Batch the vertical-slice art** (B3/B4). G13 still binds — no batch of 20 or more without an
   explicit `--confirm` — but it binds as a *review* gate now, not a budget one: the whole manifest
   is about 8% of the balance.
9. **Audio** (C8): retirement cue first, then the pack, then the DSP season presets.

## Waiting on the owner

- **WHAT SHAPE THE SNARE GRANT TAKES** (**T-60**). **Not whether** — the canon already grants three
  snares in Maren's tutorial, so building it is implementing shipped content, not inventing it
  (G2-safe). The two candidates, recorded without a preference: **(A)** a general `items` grant on the
  dialogue schema — a real change, since `zDialogueEntry` is a `strictObject` — which makes the canon
  the source and gives every later grant the same door; or **(B)** a flag-driven grant in code, which
  needs no schema change but puts the number three in code beside a line of dialogue that also states
  it, where the two can disagree in silence. **No agent may pick.** A is content-authoring (G2's
  territory); B puts a gameplay quantity in code, which G11's spirit and this file's own
  *derived, verified, or absent* rule both point away from.

- **The cascade budget.** The knob table at the top of this file is the choice. `battleTicks` or
  `ticksPerYear`; `encounterTileFraction` cannot reach r2. ⚠ **Read it together with T-60**: the two
  are one problem from opposite ends, and the knob cannot reach the other end.

- **WHETHER THE STARTER'S FIRST FIGHT IS ACCEPTABLE — now confirmed on screen, not only in a model**
  (**T-38**, whose full table is below). The 2026-08-27 playtest `[SAW]`, on the **first random
  encounter of a new game, in the starting town, on turn one, at full health**: Cindril **Lv 5, 58/58**
  against a wild **Lv 5 Loamunder, 111/111**. Cindril's Singe removed **24** (five more turns needed);
  the Loamunder's Sunder removed **≥58 in one hit** — `Party down`. The rival's **Lv 6 Nibbin** did the
  same. **Cindril's best move, Pyre, reads 58 — exactly its own HP total.** ⚠ **This is a balance
  question for the owner and NOT a defect for an agent to patch** (G2, G14, T-11's ruling). What the
  playtest adds beyond the numbers is the consequence, which is not a balance claim: **combined with
  the wipe softlock (item 46), a new player's run ends inside a minute**, and the slice past R1 is
  unreachable in practice.

- **When the painting and the collision layout disagree, which one is authored first?** (**T-57**.)
  The engine reads geometry from `tools/mapgen/layouts/*.txt`; the art lane is drawing composition from
  hand-made top-down control drawings. **Nothing reconciles them**, and the ten paintings on disk were
  not produced from the layouts — the ControlNet lane is untracked and the committed manifest contains
  no reference to it. **No answer is proposed here**, and no agent may pick one: it decides whether the
  mask is correct on generation or must be traced back off a picture after every art round. **The
  consequence while it is open is item 43**: the twelve masks exist but promoting them makes the game
  worse than the all-open placeholder, because a mask that is exact against the wrong picture blocks
  the road the player can see.
- **Whether Greaves and Maribel get tuned** now that the ruler is honest. T-13's ruling was
  explicitly "do not lower Greaves's levels as part of this ticket — if it still feels wrong
  afterward, that is a separate, deliberate call." This is that call.
- **T-14's prior question**, which is not a guardrail question yet: should the seed be randomised at
  all, and over what set? Restricting the set to seeds where the cascade reads well would be
  selecting for an outcome (G6, and the owner's own T-2 ruling). Randomising freely is consistent
  with both.
- The move display name **Daunt** (id `snarl`) is an exact Pokémon Shuffle skill name, found after
  it was adopted. Recorded, unchanged.
- Unruled IP near-matches: **Focus** (Cassette Beasts move), **Miasma** and **Shade** (Digimon
  attacks), **Burrow** (Temtem / Coromon / Monster Sanctuary). *Soak* and *Douse* are ruled kept.
  Under T-23 these are recorded and not to be re-raised.
- Whether `r4` gets a content edit to put the cascade beat on the walkable slice. Under G2 an agent
  may not decide it. Note this is now entangled with the budget question above: `r4` is the fixture's
  node and is `walkable: false`, and the feasibility gate measures `brackwater` and `r2`.
- **Whether `node.walkable` gets a real reader, or the claim gets dropped** (**T-36**). The flag gates
  nothing: `travelTo` refuses only on adjacency and the act ladder, so the player walks all twelve
  nodes. `docs/build-doc.md:202`, cut line **C-1** (`:456`) and `docs/content-bible.md:162` all
  describe a vignette-card fallback that **does not exist in `game/`**. Either build it or delete the
  language — an agent may not pick, because C-1 is a cut line and the content half is G2's.
- **Whether the enemy AI should value moving first** (**T-37**). T-27 made the tie-break exact, and
  the exact key is blind to move `priority` — which is the whole of Odo's +9.8 pp. Leaving it means
  the roster is the lever (pool order is authored order); ranking priority in re-opens every gym band
  measured under T-13. It moves published win rates either way.
- **Whether the starter's opening matchup is acceptable** (**T-38**). **T-38's own claim was wrong,
  and the truth is worse than the claim, not milder** — read this as a correction, not a rephrasing.
  The ticket said *"four of R1's six lines beat the level-5 starter one-on-one at level 1."* Measured,
  that is false for every starter: at level 1 it is **Cindril 1 of 6, Puddlisk 2 of 6, Thornlet 0 of
  6.** But level 1 is not what Route 1 produces. At the levels it actually rolls (4–8, ages weighted
  by the real encounter table), the granted **juvenile** starter reads:

  | starter | wins | **one-shot** | lines that beat it |
  |---|---|---|---|
  | Cindril | 21.3% | **78.7%** | 3 of 6 |
  | Puddlisk | 14.1% | **84.8%** | 6 of 6 |
  | Thornlet | 25.0% | **74.8%** | 5 of 6 |

  **The starter loses roughly four fifths of its first encounters in one hit.** How the ticket got it
  wrong is instructive: it computed ~78 damage using **attack 61, which is the level-1 *Adult*'s**
  figure, against a starter granted as a **Juvenile** — it mixed ages. Correcting the age makes the
  conclusion *stronger*, not weaker: a level-1 juvenile Loamunder's true band is **67–82**, so the
  **minimum** roll already exceeds the Fire starter's 58 HP and the one-shot is certain rather than
  likely. The effect is starter-specific as flagged — the same move is *resisted* by Thornlet and
  Puddlisk, which is why their one-shot rates come from other lines.

  Two things that make this decidable rather than alarming. **This was predicted in writing**:
  `data/balance.json`'s `age._multiplier` note recorded this instrument reading a 66.2% loss rate
  after T-10 and said the T-11 Producer re-spend would move it. It has — to about 80%. This is a known
  consequence arriving on schedule, not a surprise. And **T-28/T-29 HAVE NOW LANDED, which is what
  changes the weight of it.** When this was first written a first encounter that wiped the starter
  cost nothing, because nothing in `game/` called `applyBattleResult`. It does now, from all four
  finish handlers, and a wipe costs 5 ticks and a walk back.

  **The slice was re-measured with both wirings in, and the two readings below are the same finding
  T-38 already carries, seen from the other side of the change — not two new items.** Measured over
  **24 encounters at `hearthollow`** with persistence and recovery both live:

  | reading | figure |
  |---|---|
  | catches | **10** in the MODEL — ⚠ **zero on screen**, see the note under the table |
  | wipes | **4**, at 5 ticks each |
  | ticks spent on wakes | **20 of the run's 40** |
  | where year 1 ends | `hearthollow` |

  1. ⚠ **"The vertical slice catches again" IS A READING OF A PLAYER THE SHIPPED GAME CANNOT PRODUCE,
     and it is MARKED rather than deleted, because the figures beside it are unaffected.** The harness
     hands its reference player a snare tier as a parameter with **no inventory check at all**
     (`tools/harness/full-run.ts:235`), and builds a gym bag outright (`tools/harness/player.ts:495`,
     *"one salve per party member, nothing else"*). A real player holds none of it — item 45, **T-60**.
     **So the ten catches are a property of the model, and the screen shows zero.** What stands
     unchanged: the wipes, the ticks, and **half the run's ticks going on waking up.**
  2. **The opening is always lost.** The **first three encounters are all losses**: the granted
     juvenile starter loses to Elders and Adults alike, and the run only becomes viable once the
     fourth encounter's catch enlarges the party. That is the T-38 table arriving in a real run —
     ~80% losses and ~79% one-shots, now with the loss persisting.

  **Nothing was tuned to produce any of these numbers and nothing should be** — levels, rosters, stats
  and balance values are Hank's, G2 and T-11's ruling both forbid an agent retuning them, and G14
  forbids moving a target to accommodate a result. This is material for the decision, not a
  recommendation attached to one.

- **How many buildings should have an interior** — a scope question, and only Hank can answer it.
  **The gap is now written up as T-48**, which names the three towns with no interior at all
  (Bowerdeep, Cindershelf, Duskhollow) and records that the Sanctum having none is what bible §6 asks
  for, not a gap. **Two adjacent tickets came out of the same look and are NOT his to answer** —
  **T-47**, every interior door coordinate is a guess the painted map will settle, and **T-50**, the
  door facing↔wall check living only in the test layer.
  What he said, verbatim: *"This game is nowhere near deep enough to need twenty homes in a town. A
  town should be a handful of buildings, and nearly all of the buildings should have an accessible
  interior."* What exists: **four blueprints** — inn and supply shop in Hearthollow and Brackwater.
  What the art manifest itemises, read out of `tools/comfy/manifest.json`'s `_nodes` block directly:
  **Hearthollow, five buildings** — Warden Maren's field station, a gym hall, the inn, the supply shop
  and a deep-thatched cottage; **Brackwater, five** — a fishery shed, an angler's hut, a gym hall, the
  inn and the supply barn, plus a ferry landing that is not a building. So *"nearly all"* read
  literally is ten rooms across the two walkable towns and thirty-odd across the region.

  **Four is not a failure to have tried; it is a different reading of scope**, and "the inn and the
  shop are the ones that matter, the cottage does not need an inside" is an entirely reasonable answer
  that nothing he said rules out. Three facts he may want while deciding. **The engine is not the
  constraint** — a new interior is a `data/interiors/*.json` file and its citations, not code; the
  model, the loader, the tests and now the scene layer are all generic. **The gym hall is a different
  question from the rest**: gyms are challenged today by a keypress from the town node — `challengeGym`
  — with no building, no door and no position, yet six shipped leader lines already describe a room
  with a door and a bench (Noct's *"Room's dark. It stays dark. Bring a lamp for the walk down"*,
  Odo's *"Badge is in the tin by the door"*, Sable's *"Six on the bench."*), so making one enterable
  changes how gyms are challenged and not just how many rooms exist. And **under G2 every added
  interior must derive from canon** the way the existing four do — every physical feature traced in
  `_featureSource` to a shipped line, every gap named in `_canonSilent` rather than filled. For a
  building the corpus barely mentions there may be nothing to derive from, and where the canon is
  silent that is part of what he is deciding, not a licence to invent an inside.

- **What shape a map edge exit takes in the data** (**T-49**). The maps paint two edge exits each —
  bottom back toward Hearthollow, top on toward the Sanctum, with Hearthollow and the Sanctum painting
  one apiece — and **nothing can walk through any of them.** Travel is still the number-key menu keyed
  on `adjacency`, and `travelTo`'s own docblock says why: the node schema carries no exit or portal
  positions, so *"a door prop kind would change this, and that is a content decision, not one to
  invent here (G2)."* The question is whether `props[]` gains an exit kind carrying a destination and
  an edge, or the exit derives from `adjacency` plus which edge the art painted. The code half is
  decidable once that is; an agent may not pick the first.

- **Two questions the epilogue's season fix handed over rather than answered.** The finale's survey
  used to stamp `seasonOf(save)` onto counts projected six years forward, so four saves differing only
  in `save.tick` produced one byte-identical projection under four different season labels — and the
  label is not a caption: the page computes the breed column and the dormant/migrating note **from
  it**, so the same animal at the same number carried the opposite biological claim depending on when
  the player happened to stop. It is now **derived from the published horizon** — the season the region
  stands in when the projection stops — which is what every other survey in the game names. The two
  open questions are content: **should the projection begin at the player's own season instead of
  always the first**, and **should an ending print a calendar at all?** Note the season was
  deliberately NOT dropped the way the year was: the year was a caption and removing it removed a
  falsehood, while the season is load-bearing, so removing it would delete information instead.

- **When the palette expands to 48, relative to the top-down map re-author** — a sequencing question
  the art session raised and neither of us should settle. The 48-colour fit was made over **18 raw
  sources that are the isometric maps T-17 is now replacing**. Landing it before the top-down recipe
  settles may mean fitting it twice, and the second pass is the expensive one: everything already
  quantized against the new 48 has to be regenerated again. Recorded as open, not as a decision.

- **Whether the pipeline adopts a LoRA — REOPENED, and the earlier "the LoRA lost" conclusion is
  REVERSED.** The comparison that produced it measured **raw LoRA output against Gold**. That is
  correct as far as it goes, and it answers *"does the LoRA alone produce Gold's ground"* — but the
  question that decides adoption is **"does the LoRA plus our postprocess produce it"**, and that
  combination had never been run. It has been now. Both inputs through the same dither:

  | input to the same dither | ground edge after |
  |---|---|
  | today's baseline | **6.89%** |
  | c64-LoRA cell | **54.84%** (Gold **60.10%** on the same operator) |

  **The LoRA and the dither are multiplicative, not alternatives.** The LoRA does not supply the
  texture — it supplies the **substrate the dither has nothing to bite on without**. Stated plainly,
  because this trade gets habitually understated: **dropping the LoRA is not "lose a little polish";
  it is the ground stays flat.** The same measurement is what established the dither's
  source-dependence (item 32), so the two are one finding read from two ends.

  **`docs/build-doc.md:418` states "zero LoRAs"** in the *How was AI used?* answer, which is written
  for an external audience. **It is still true today, and it has NOT been touched.** An approval to
  edit that sentence was reported through the art session — but that approval was **conditional on a
  LoRA winning**, so it may now apply after all. **The conditionality is recorded and deliberately
  not acted on.** Whether a LoRA is adopted, and whether that sentence changes, is the owner's call;
  no agent may make either, and the sentence must not move ahead of the ruling on the first one.

**Struck from this file, having been checked and found false:** the claim that
`tools/comfy/manifest.json`'s `_deviations[]` rows index a ledger the repo no longer keeps (item 10);
the two prose-lint corpus structural failures (`G8-ASSERT-CHOP`, `G9-SHAPE-SIG`), both now CLEAN;
the "seven dialogue lines state a six-year run length" item — all seven were reworded and the pin in
`tests/unit/dialogue.test.ts:2338` was inverted to assert that **no** line states a run length; and
the "cascade beat is not on the walkable slice" item as previously worded, which described a content
mismatch and not the arithmetic shortfall that now gates it.

**Struck on 2026-08-27, same standard:** the claim that **no ControlNet exists for this model
family** — nine Z-Image-Turbo ControlNets are installed, loading through `ModelPatchLoader` rather
than `ControlNetLoader`, which is why a search for the latter found nothing; **locked decision L4
therefore needs no amendment** and every field it locks (`docs/build-doc.md:42`) is unchanged. The
claim that **nobody knows what one image costs** — it is 1.12 credits at 1024², measured (item 23),
and with it the *scarcity framing* that this file and TICKETS both carried. The **"16% of seeds"**
release figure that lived in `tests/integration/demo-beats.test.ts`, which was sourced nowhere in
this repo; the published number is 12.5%. And `tools/comfy/MAP-PROMPT-RULES.md` **R2 as a statement
of fact** — the negative prompt's inertness is a property of **cfg 1.0**, not of the pipeline: at
cfg 1.0 two graphs differing only in the negative produced a 0-byte difference over 3,145,728, and
at 25 steps / cfg 4.0 the same experiment moved **98.4% of bytes**. **R2 stands as a decision
anyway** — raising cfg fixed no defect class, lost the projection, and degraded mean CIEDE2000
palette fit 4.185 → 5.402 (~29% worse). Do not edit that file; the correction lives in TICKETS'
Closed table.

**Withdrawn on the collision pass, 2026-08-27, and written up in full as items 42 and 44:** the four
sabotage claims cited for the layout→mask round trip — *one repainted cell reports exactly one
mismatch*, *a vertical flip reports 1274*, and *truncated / byte-corrupted PNGs throw*. **Two of the
four are not merely unasserted but absent**: `1274` occurs nowhere in this repository and no flip
sabotage exists. The round trip's own claim — 0 of 4096 on all twelve — **stands and is green**, as do
the transparent-pixel and all-black refusals. And the art lane's **"ControlNet is refuted"**
(over-generalised: the border ring the model reproduced was in its input) and **"ControlNet at 0.9
destroys the art"** (confounded with the wireframe control drawings it was measured against), both
withdrawn by their author. **None of the six is disproved; none is evidence either.**

**Withdrawn later on 2026-08-27, for want of a sound instrument rather than for being disproved:**
the **pixel-block measurements taken from the first `assets/reference/` captures** (item 30). Those
captures were resampled browser screenshots holding 673–2,080 colours where the native frames hold
12–18, so nothing measured on them is sourced. They are the only figures ever published from that set.
And **one cell of the img2img denoise sweep** in `assets/approved-trials/_player-views/README.md`:
`denoise 0.92` at 8 steps is `int(8/0.92) = 8`, the full schedule, so that row was **txt2img** and is
not evidence about img2img at all. Its recorded failure — *"a different face, a different bag"* — is
what a fresh generation produces, not identity drift. **The finding it belonged to is narrowed, not
refuted:** "img2img on this model cannot turn a view" now rests on six valid cells rather than seven,
and re-measuring on a schedule-count ladder is worth doing eventually and is not urgent. A companion
claim that **two** of the seven cells were suspect is withdrawn too — 0.86 measured as a real 9-step
img2img, distinct from 0.80's 10. One cell was invalid, and the two-cell figure was a reading of a gap
between measurements stated with a measurement's confidence.

**Withdrawn on the same standard, same day — Gold's `47.51%` whole-map edge density, cited six times
across this file, `docs/build-doc.md` and `docs/TICKETS.md`.** An independent re-measurement of **the
same eight `assets/reference/gen2/` captures** could not reproduce it: at 1:1 native the property
reads **50.4–78.8%**, and density-matched at 2× it reads **30.3–51.5%**. **No threshold reproduces
47.51.** Its author has withdrawn it **pending republication with the operator attached** — threshold,
channels, neighbours and denominator — and it is recorded rather than deleted precisely because it may
come back and turn out fine. **Not disproved; not evidence either.** *As a consequence rather than a
separate withdrawal* — mark a reading as a reading — the figures published beside it in the same
session cannot be read against it: **43.59%**, **8.83%**, **44.74%**, **40.02%**, **12.88%** and the
amplitude ladder `0 → 12.88, 24 → 24.09, 40 → 40.02, 56 → 63.77`. **Three things are explicitly NOT
withdrawn and are not to be marked.** The **colour** figures — 12 to 18 distinct opaque colours, mean
**16.0** over those same eight captures — were re-derived and **reproduce exactly**; item 32's colour
half is sound. The palette gate's own band constants `GOLD_EDGE_LOW / HIGH / MEAN` = **51.0 / 78.7 /
64.2** are computed by **its own** operator over the same PNGs and are unaffected — a band that ships
with the code that produced it is the thing a bare percentage in prose is not. And the qualitative
finding — **Gold's ground is dithered everywhere and ours is a flat fill** — rests on
`tools/artverify/ground-comparison.png`, which is a picture. **The lesson is in build-doc §16: an
edge-density percentage means nothing without its definition.** Every edge figure quoted that night
without its operator attached produced **two numbers for one property**.

**`tools/artverify/EVAL-STANDARD.md` still publishes the withdrawn figure at `:143`, `:145`, `:147`
and `:165`, and `tests/gates/asset-palette-contract.test.ts` carries it in a comment at `:703` and
`:716`.** Neither file is corrected here — the art lane and the gate's owner hold them. The gate's
**asserted** constants are the unaffected ones; only its prose quotes the struck figure.
