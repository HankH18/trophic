# TROPHIC — status

A 2D monster-catching RPG whose region is a living ecosystem: every catch decrements a real per-node
population, the food web is derived from those numbers rather than authored beside them, and the
calendar ages every creature and map underneath the story. **A run is playable end to end today** —
Hearthollow → R1 → Brackwater → R2 on foot, catching off the node's real counts, quests, gyms and
badges, a year turn that ages the party and the box, a retirement that puts an heir in the party,
and the Sanctum with the Vellsire choice and the epilogue survey, and buildings the player can walk
into. **A fight now costs something and is survivable**: damage, levels, XP and the bag persist
across battles, and a wiped party blacks out and wakes at an inn instead of holding an unactable
save. **Ten painted maps are on disk and everything else on screen is a labelled placeholder** — no
sprite, no dex plate, no UI frame, no collision mask, and no audio exists. The ten maps are WIP
against T-17's amended top-down projection.

---

## ⚠ THE OPEN DECISION — the year-1 over-catch beat no longer clears its gate

`tests/unit/transcription.test.ts:1365` is **RED**, and it is red on the shipped numbers, not on
anything in flight. It gates build-doc §1 beat 1 / §15 I2 — the cascade, a never-cut beat.

    AssertionError: brackwater: 19.2 removals needed to starve fenmaw-line,
    only 11.4/yr available: expected 11.423076923076922 to be greater than or equal to 19.2

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

**Re-measured 2026-08-27 at 05:43 and again at 05:47, both runs complete.** Seven lanes have landed
since the 04:36 pass and the systems tree has largely settled: the working tree is down from **20
dirty paths to 6**, and every source path left in it belongs to the art lane. The FAILURE set repeats
across consecutive runs; the passing count and the dirty-path count are still not health figures.

- `npx tsc --noEmit` — **exit 0.** Silence, which is clean.
  Note `cmd | tail; echo $?` reports **tail's** status, not the command's — that mistake has already
  reported this repo's prose linter as exit 0 when it is exit 1.
- `npm run test` — **10 failed of 2,848; 3 files failed of 70.** Identical on both runs (2,838
  passing each time). **The totals moved because tests were ADDED, not because anything regressed**:
  67 files → 70 and ~2,760 → 2,848, carrying `tests/unit/recovery.test.ts` (33 cases),
  `tests/unit/mapview.test.ts` and `tests/unit/mapgen.test.ts`. The ten failures are the same ten,
  in the same three files:
  - **`tests/gates/player-art-contract.test.ts` — 7 failed / 9 passed of 16**, confirmed by running
    the file alone. *Correctly* red: it decodes the committed sprites and reports real defects the art
    session owns (T-24). Verbatim: `player-back-32x48.png` *"holds 8 px in 2 colour(s) that
    data/palette.json does not contain: #ec9a70×4 #eec092×4"*; `player-side-32x48.png` holds 420 px in
    11; the star badge fails on the cap rows and on the whole rear view; and the freshness assertion
    reports the committed back view disagreeing with a fresh derivation in **333 px**, first at (10,4).
  - **`tests/unit/manifest.test.ts` — 2 failures, and they are two different things.**
    **`:336`** — *"the escape DOES move the seed for a derived row"* — is the art lane mid-flight in
    `tools/comfy/manifest.json` (`map-hearthollow` reads seed `623472248`/version 1 where the test
    derives `2278748833`/version 2) and is not a defect. **This is NOT the `:345` this section named
    before**; the citation had drifted and is corrected here.
    **`:1414` is a fossilised PRECONDITION**: it asserts `existsSync(r1.mapAsset)` is `false`, under a
    comment at `:1410-1413` reading *"The repo's true state today: no node has a base map or a mask on
    disk."* Ten maps landed; the premise expired. The claim the test exists to make — a maskless node
    must REFUSE, never fall back to "every pixel walkable" — is untouched and worth keeping; only its
    setup needs to stop asserting the repo is empty. Recorded as **T-46**, not edited here.
  - **`tests/unit/transcription.test.ts:1365` — 1 failure.** The cascade feasibility gate, the section
    at the top of this file. Re-read verbatim off this run and **unmoved**: *"brackwater: 19.2 removals
    needed to starve fenmaw-line, only 11.4/yr available"*, 11.423076923076922 against 19.2. Settled,
    and it is the owner's decision, not a defect to fix.
  - **`tests/unit/harness.test.ts` is GREEN — 76 of 76.** The two clause-7 reds this section carried
    are closed (T-32); the 77 → 76 is one deliberate deletion, not a lost test.
- `python3 tools/prose/prose-lint.py data/dialogue.json` — **exit 1**, **215 entries, 63 speakers,
  512 lines** (was 214 / 509; the new entry is `narration.blackout`, T-29). 27 control assertions
  green over 7 structural checks. **0 corpus structural failures.** 3 per-beat advisory flags, all
  `R1-SUBJECT-SWITCH`, 3 speakers.
  **The non-zero exit is not evidence of a structural failure**: `tools/prose/prose-lint.py:1085`
  exits on `beat_total + fails ≠ 0`, so three advisory flags alone produce exit 1.
- `git` — **`main` is in sync with `origin/main`; everything is pushed.** **No commit hash is quoted
  here any more, deliberately.** This section has named three different HEADs in as many hours and each
  was stale before the paragraph around it was finished — "in sync with origin" is a claim that stays
  true, a hash is a claim that expires. One session owns the index by Hank's instruction; the art lane
  does not commit. `git status --porcelain` is **6 paths** as this is written — `.claude/scheduled_tasks.lock`,
  and the art lane in `tools/comfy/manifest.json`, `tools/artverify/EVAL-STANDARD.md`, `tools/mapgen/`,
  `tests/unit/mapgen.test.ts` and `assets/approved-trials/_palette-refreeze/`. **The dirty-path count
  moves under you and is not a health figure.**

## What is built

| Subsystem | State | Where it lives |
|---|---|---|
| Battle engine | Pure reducer `(state, action, rng) → {state, events[]}`; no Phaser | `core/battle.ts` |
| Ecosystem sim | Per-node integer populations, one clamp, one write path | `core/ecosim.ts` |
| Food web | Diet edges derived from node data; nothing else may compute them | `core/foodweb.ts` |
| Calendar clock | **52 ticks/year, 13/season, `subTicksPerTick` 2**; `ClockState` is `{year, tick, subTick}`; unbounded, no cap, no fail state | `core/clock.ts:64` |
| Tick costs | travel 1 · foray 1 · inn 2 · **battle 0.5, charged at launch** and wired (`OverworldScene.ts:1418`, inside `handOffToBattle`) | `data/balance.json` `clock` |
| Cadence validation | A 4-rule `.superRefine` refuses a retune at boot: year = season × seasons; `startTick` in range; every cost an exact multiple of `1/subTicksPerTick`; no cost ≥ a season | `core/schemas.ts:479` |
| Encounter rate | Grass-gated. `stepEncounterChance()` is the **single** definition the game and the harness both roll against — no second one exists | `core/foodweb.ts:223` |
| Act model | Badges + quest flags gate towns, routes, raids, rival, finale | `core/acts.ts` |
| Lifecycle | Aging, retirement, heirs, boxed aging, Cullbrand raid on act entry | `core/lifecycle.ts` |
| Save + replay | Action log replays byte-identically; `subTick` and `forayStepsSinceTick` survive the round trip and the year turn | `core/save.ts`, `tests/property/determinism.test.ts` |
| Content + schemas | 27 species lines (3 Ancients), 28 moves, 6 gyms, 12 nodes; zod-validated at boot | `data/`, `core/schemas.ts` |
| Age multipliers | **Halved toward neutral: J 0.875 · A 1.0 · E 1.075** (was 0.75 / 1.0 / 1.15; A is the neutral, so A did not move). `metamorphicJump` 1.15 and `heirLevelFactor` 0.5 deliberately untouched — not an unfinished half of T-10. Lifecycle tests read the key symbolically, so no table needed re-deriving. **The canonical L9 row and §7.4 carried the old curve until now** and are corrected to name `balance.age.multiplier` as the rule. **The four copies of the OLD curve TICKETS T-10 enumerated are now ZERO** — re-grepped 2026-08-27: `docs/content-bible.md:51` reads *"Juvenile penalty · Adult neutral · Elder bonus"*, `core/lifecycle.ts:350` reads the same and says the numbers are *"READ here and never restated"*, and `data/gyms.json:5` now names `balance.age.multiplier.E`, *"×1.075 today"*. `×0.75` no longer appears in `core/`, `game/`, `data/` or `docs/` at all | `data/balance.json` `age`, `docs/build-doc.md:47` |
| Producer template | **Re-spent 85/40/80/35/60 → 85/60/80/35/40** — zero-sum, total still 300, Scavenger untouched, Carricrow untouched. Measured: Loamunder 26.7% → 50.7%, Sporantle 12.9% → 37.9%, both into band; 8 of 24 lines outside the ±15 band. The closed-tournament arithmetic is recorded in `_bandArithmetic` beside the templates, not in a doc | `data/species.json` |
| Dialogue corpus | **215 entries, 512 lines, 63 speakers**; every entry has a path to the screen | `data/dialogue.json`, `game/dialogue-runner.ts` |
| G7 gate | **Now reads `data/dialogue.json`** — every player-facing string plus a joined-body pass, and a prose census over 18 other `data/*.json` files | `tests/gates/guardrails.test.ts` `dialogueCopyViolations`, `:1129` |
| Quests | Objectives, flag writers, sign chains | `core/quests.ts`, `game/quests.ts` |
| Overworld | Walk, collision, travel, encounters, inn, gym challenge, talk, release | `game/scenes/OverworldScene.ts` |
| Walkable slice | `hearthollow`, `r1`, `brackwater`, `r2`; the other 8 nodes are travel-only | `data/nodes/*.json` `walkable` |
| Battle scene | A replayer over `BattleEvent[]` — it holds no rules | `game/scenes/BattleScene.ts`, `game/ui/` |
| Year turn + retirement | Meter fills → year turn → prompt → heir in the party | `game/scenes/YearTurnScene.ts`, `RetirementScene.ts` |
| Finale | Vellsire choice, both outcomes written and flagged, epilogue survey | `game/finale.ts` |
| Rival | One encounter per act, each with pre/win/loss copy | `game/rival.ts`, `data/dialogue.json` |
| Survey | Real per-node counts plus run history | `game/survey-view.ts`, `game/survey-history.ts` |
| Balance harness | Gym sim, type round-robin, full-run cascade; now pays travel/foray/battle ticks and rolls the grass-gated rate | `tools/harness/` |
| Harness control run | **`CATCH_PROFILES` × `RAID_POLICIES` = a 3×2 matrix**, raid suppression as an orthogonal flag rather than a fourth profile. Deep-copies `rawBalance` and empties `yearEvents.raids` in memory — `data/balance.json` is never touched. Extinctions attributed by measurement (`attributeExtinction`), not by a node lookup | `tools/harness/full-run.ts:250`/`:265`/`:335`, `report.ts:525` |
| Battle persistence | **WIRED (T-28).** `applyBattleResult` is the first statement of all four finish handlers — wild `game/scenes/OverworldScene.ts:1535`, gym `:2233`, rival `:2323`, finale `:2397` — and `applyBattleAftermath` is the one writer of `curHp`/level/xp/bag outside creation and the year turn. The three docblocks that already called it *"the ONE writer all four launchers share"* **became true rather than needing repair** | `game/wild-battle.ts:503`, `core/save.ts:579` |
| XP carry-in | `BattlerSpec.xp` exists, `makeBattler` reads it back as `xp: spec.xp ?? 0`, `battlerSpecOf` copies it verbatim — carried, never derived, so a replay sees the same number (T-30) | `core/types.ts` `BattlerSpec`, `core/battle.ts` |
| Party-wipe recovery | Pure TS, zero engine imports. A wipe plays the fight's own losing beat, THEN blacks out, wakes the party healed at an inn and charges `2 × innTicks + 1 × travelTicks` = **5 ticks**, composed from existing keys — there is no `blackoutTicks` and there must not be one (T-29) | `core/recovery.ts`, `game/scenes/OverworldScene.ts:2050` `recoverFromBlackout` |
| Art-load deadline | `ensureNodeArt` takes a timeout (8000 ms default, a parameter so a test drives it) and **resolves** on it. A hung loader now costs one degraded visit instead of refusing travel for the rest of the session (T-31) | `game/mapview.ts` `ART_LOAD_TIMEOUT_MS`, `:278` |
| Enemy AI tie-break | Ranks on `movePowerVs × typeMultiplier` alone — the dropped factors are common to a pool and cannot reorder it. 13 → 0 divergences; the argmax is still an exact strict `>` | `core/battle.ts:1371` |
| Player art contract | **The first gate here that decodes a PNG** (via `sharp`): palette exactness, star-badge absence, no new swatches, and a freshness check against a live re-derivation. Currently and correctly RED | `tests/gates/player-art-contract.test.ts` |
| Asset palette contract | Every PNG the bundle ships out of `assets/final/`, decoded: exact palette membership, no vacuous pass, deletion detected by anchoring the scope to git. The advisory now prints each asset's distinct-colour count **against the measured Gold band 12–18**, and asserts that band against the reference captures it was derived from. The count itself is a reading aid and caps nothing — see item 32 | `tests/gates/asset-palette-contract.test.ts` |
| UI contrast contract | The UI cannot go illegible on a palette change without going red | `tests/gates/ui-contrast-contract.test.ts` |
| Interiors | Blueprints, plans, and a **view mode inside `OverworldScene`** — the player walks in, moves around and walks back out; `save.currentNode` keeps naming the town and `save.interiorId` says which room. Four plans: inn and supply shop in both walkable towns | `core/interiors.ts`, `data/interiors/*.json`, `game/scenes/OverworldScene.ts` |
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

3. **The derived player sprites are off-palette, and the star badge is back on the cap's rear —
   the code half is repaired and a gate now sees it.** *(T-24)*
   The 21 dead hex literals in `tools/comfy/player-views.ts` now resolve through `data/palette.json`
   by slot id, and `tests/gates/player-art-contract.test.ts` decodes the committed PNGs. The
   **assets** are still wrong, and the gate reads RED reporting exactly that. Two findings kept:
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
    still WIP against T-17's amended top-down projection. No sprite, no dex plate, no UI frame, no
    collision mask exists. `tools/comfy/manifest.json` is 288 rows, `{pending: 287, approved: 1}`;
    **10 of the 288 declared `finalFile`s exist.** The B1 reproduction gate has never been run.
    *(This item read "No art is on disk. `assets/final/` holds a `.gitkeep`" until now — it was true
    when written and had been false for a day.)*
23. **Billing is now calibrated, and the scarcity framing this file used to carry was wrong.**
    *(T-26, DONE)* `tools/comfy/manifest.json:9` reads **`perImageCredits: 1.12`** — dashboard
    **4,147 → 4,127 across 18 images at 1024²**. **The entire 288-row manifest costs roughly 323
    credits against a 4,081 balance, about 8%.** Nothing in this project is constrained by image
    count, and any argument that reasons from image scarcity is reasoning from a figure nobody had.
    Two qualifications: **1.12 is the 1024² figure specifically** — a later mixed batch including
    256² health probes read near **0.53**, because cost tracks pixels — and **G13 still binds as a
    *review* discipline**, not a budget one: twenty images get looked at before they are made, which
    never depended on the price. Trial PNGs live under `assets/raw/_trials/` across **nine** trial
    specs in `tools/comfy/trials/`; `.gitignore:8` excludes `assets/raw/**`, so **no commit records
    any of them.**
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

36. **The persistence wiring landed; the ECONOMY half of T-12 did not, and the gap is now load-bearing
    in a way it was not before.** Damage persists (T-28) and a wipe recovers (T-29), so a **damaged
    but not wiped** party has exactly one out-of-battle heal in the game today: getting wiped. Each
    half was re-read rather than inferred:
    - **`restAtInn` (`game/scenes/OverworldScene.ts:1972`) still heals nothing.** Its whole body is
      `spendTicks("inn", …)` and a banner. It charges two ticks for a rest that changes no HP.
    - **`data/balance.json` already declares the rule and nothing reads it.**
      `medicine.innRestFullHeal` is `true`, and its only reader in the repo is `core/recovery.ts:377`
      — the blackout's wake. The inn's own action does not consult it. So the key is not missing; the
      call is.
    - **Money still has no earner and no sink.** `balance.economy` ships `innCost` 40,
      `trainerPayoutPerLevel` 12, snare/bait/salve/tonic prices — and `grep` finds **zero readers of
      any of them** outside `core/schemas.ts` and `core/types.ts`. The only `money` occurrence in
      `core/` or `game/` is still `core/save.ts:420` `money: opts.money ?? 0`.
    - **The explicit loss penalty exists, but as the blackout's 5 ticks**, and both
      `core/recovery.ts:21` and `game/scenes/OverworldScene.ts:1986` argue in prose that this *is*
      the penalty T-12 asks for. **That is a reading, and it is marked as one here.** It prices a
      wipe; it does not price a loss that leaves something standing.
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

38. **Three comments are now false and are recorded rather than fixed**, because each sits in a file
    another lane holds. Tickets **T-44**, **T-45**, **T-46**.
    - `tests/unit/overworld-scene.test.ts:1194` says `GameAction` *"deliberately has no `blackout`
      member … so a string comparison here does not even typecheck."* `core/types.ts:684` is that
      member. **The test still passes and its stated reason is dead** — which is the more dangerous
      shape, because nothing will ever go red to announce it.
    - `core/recovery.ts:30` says `core/save.ts` *"owns the TAPE — `BlackoutRecovery`, …"*. The
      **type** moved to `core/types.ts:634` and `core/save.ts:622` re-exports it, so every import is
      unchanged and nothing is broken. The sentence is imprecise, not wrong about the module's job.
    - `tests/unit/manifest.test.ts:1414` — the fossilised precondition, in the verified-state section
      above.

39. **The instrument-failure tally is NINE, and the list has outgrown "instruments".** It is written
    into build-doc §16, which currently publishes **four** of them (`docs/build-doc.md:496`) —
    correcting that section is handed to whoever owns build-doc; the roll-up is here so it is not
    lost in the handoff. Seven of the nine were counted before tonight's pass; two arrived with it.
    1. A 3×3 Sobel cancels on period-2 and cannot see a one-pixel dither.
    2. A luminance threshold of 25 against Gold's 28.2-step greens — passing by 3.2 points, which is
       luck rather than headroom.
    3. Exact-RGB difference saturates on unquantized output and ranks everything alike.
    4. Colour concentration is a histogram and cannot see arrangement.
    5. **The eye.** A LoRA's ground looked stippled and was 2,451 colours differing by one per
       channel. **This is the most important of the nine, not an appendix**: the others have an
       instrument to blame and this one does not, and it is the fallback every reader assumes is
       always available.
    6. **A comparison that answered a different question, with a decision-sized conclusion drawn from
       it** — raw LoRA output measured against the target, when the question that decides adoption is
       LoRA *plus postprocess*. Not an instrument at all, and the widest blast radius of the nine,
       **because every number in it was correct.**
    7. **An assertion whose observation channel is silenced by the code under test.** A test watched
       `console.warn` to prove a watchdog timer had been cleared — but the callback's own
       `if (settled) return` suppresses that warning *even with a live timer still pending*. **The
       assertion observed nothing and passed.** Rewritten to count live timers directly
       (`tests/unit/mapview.test.ts:380-383`, `vi.getTimerCount()`), which is what made it bind.
       *"Assert on an observable side effect"* reads like good practice right up until the side
       effect is optional.
    8. **An ordering assertion with no margin is correct and useless.** The UI-contrast gate required
       an inactive role be dimmer than every live text role on the same ground. **It ran, it
       compared, and it passed** — on **5.685 against 5.816**, i.e. **1.023× dimmer**. True to three
       decimals, false at arm's length. Over a luminance-only metric blind to hue, an ordering check
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
    failures into a practice**, and it belongs beside the nine rather than under any one of them.

## What is next

The work queue is `docs/TICKETS.md`, and it is ordered. This is the shape of it.

1. **Get a ruling on the cascade budget** (the section at the top). Nothing about beat 1 is settled
   until a knob moves or the beat's site changes, and no agent may pick either under G6/G14.
2. **Finish T-12 — the ECONOMY half, now that the progression half has landed.** T-28, T-29 and T-30
   shipped together: damage, levels, XP and the bag persist, a wipe blacks out and wakes healed at an
   inn for 5 ticks, and XP carries across fights. What did NOT land is the rest of T-28's own
   *done when*: **the inn still heals nothing** (`restAtInn` spends ticks and prints a banner, and
   `balance.medicine.innRestFullHeal` is read only by the blackout), **money still has no earner or
   sink**, and **no town shop sells anything**. Item 36 above is the measured state.
3. **Repair the player-sprite assets** (T-24's remaining half). The code half and the gate are done;
   the committed PNGs are not, and the gate is correctly RED against them.
4. **Re-author the maps top-down** (T-17, amended). Three of the nine rejects retire at the root and
   `r5`'s defect inverts, so the reject list is smaller than it looks. **Colour discipline is part of
   the re-author, not a separate pass** — item 32: the shipped ten run 17–32 colours against Gold's
   12–18, and nine of the ten are flagged above the band by the palette gate's advisory.
5. **Run the B1 reproduction gate** (build-doc §15, Lane B) — one asset per pixel class reproduced
   from `manifest.json` byte-identically. Nothing multi-version starts before it passes.
6. **Give the harness a lifecycle mode** so the Legacy beat is measured rather than asserted.
7. **Batch the vertical-slice art** (B3/B4). G13 still binds — no batch of 20 or more without an
   explicit `--confirm` — but it binds as a *review* gate now, not a budget one: the whole manifest
   is about 8% of the balance.
8. **Audio** (C8): retirement cue first, then the pack, then the DSP season presets.

## Waiting on the owner

- **The cascade budget.** The knob table at the top of this file is the choice. `battleTicks` or
  `ticksPerYear`; `encounterTileFraction` cannot reach r2.
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
  | catches | **10** — the pre-recovery measurement of the same slice was **zero** |
  | wipes | **4**, at 5 ticks each |
  | ticks spent on wakes | **20 of the run's 40** |
  | where year 1 ends | `hearthollow` |

  1. **The vertical slice catches again, and half the year buys it.** Ten catches where the
     pre-recovery run got none — the recovery is what makes the slice playable at all — and **half the
     run's ticks go on waking up.**
  2. **The opening is always lost.** The **first three encounters are all losses**: the granted
     juvenile starter loses to Elders and Adults alike, and the run only becomes viable once the
     fourth encounter's catch enlarges the party. That is the T-38 table arriving in a real run —
     ~80% losses and ~79% one-shots, now with the loss persisting.

  **Nothing was tuned to produce any of these numbers and nothing should be** — levels, rosters, stats
  and balance values are Hank's, G2 and T-11's ruling both forbid an agent retuning them, and G14
  forbids moving a target to accommodate a result. This is material for the decision, not a
  recommendation attached to one.

- **How many buildings should have an interior** — a scope question, and only Hank can answer it.
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
