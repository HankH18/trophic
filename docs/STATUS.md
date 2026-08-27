# TROPHIC — status

A 2D monster-catching RPG whose region is a living ecosystem: every catch decrements a real per-node
population, the food web is derived from those numbers rather than authored beside them, and the
calendar ages every creature and map underneath the story. **A run is playable end to end today** —
Hearthollow → R1 → Brackwater → R2 on foot, catching off the node's real counts, quests, gyms and
badges, a year turn that ages the party and the box, a retirement that puts an heir in the party,
and the Sanctum with the Vellsire choice and the epilogue survey. Everything on screen is a labelled
placeholder; no generated art is on disk and no audio exists.

---

## ⚠ THE OPEN DECISION — the year-1 over-catch beat no longer clears its gate

`tests/unit/transcription.test.ts:1358` is **RED**, and it is red on the shipped numbers, not on
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

**Measured 2026-08-26, 21:43–22:11, against a working tree that several agents were editing while
it was being measured. It never settled.** Committed HEAD is `ca9d073`; **nothing below is
committed.** `git status` went 55 → 74 → 78 → 80 dirty paths inside half an hour; `data/species.json`
changed at 22:00:20 between consecutive test runs; a failing `tests/unit/battle-view.test.ts`
assertion was repaired by another agent between the 21:59 and 22:03 runs; and `tsc` read clean at
22:03 and dirty at 22:10 on a *different* file each time. **Every figure here is a snapshot.
Re-measure before quoting one.**

- `npx tsc --noEmit` — **exit 1 at 22:10**, two errors, both
  `tests/unit/overworld-scene.test.ts:543` (`'tick'` / `'subTick'` not on `AdvanceYearResult`).
  The same command read **exit 0 at 22:03** and exit 1 at 21:46 and 21:52 with errors in
  `game/scenes/YearTurnScene.ts` / `tests/unit/year-turn-ux.test.ts`. Four runs, three different
  error sets: an agent mid-refactor, not a settled defect.
  Note `cmd | tail; echo $?` reports **tail's** status, not the command's — that mistake has already
  reported this repo's prose linter as exit 0 when it is exit 1.
- `npm run test` — **12 failed / 2401 passed at 22:11, 5 files of 53.** The same command read
  2 failed at 21:43, 16 at 21:59 and 18 at 22:03. **Exactly one is a settled defect:**
  - **`transcription.test.ts:1358`** — the cascade feasibility gate, the section at the top of this
    file. It fails on `data/balance.json` + node counts and has read the same numbers in every run.
  - The other **11 are in-flight work**. **7** are downstream of T-11's `data/species.json` Producer
    re-spend, whose pinned tables are being re-derived as this is written — `battle-view.test.ts` (2
    fixture replays + 1 caption), `battle.test.ts` (2 fixture replays), `catch.test.ts` (2 Instinct
    tables). Several of those tests carried the **old** Producer template as a hand-typed literal,
    and the count has been falling run over run as they are corrected. **4** are `manifest.test.ts`
    ("the committed rows equal a fresh derivation"), which went red between 21:59 and 22:03 as the
    art lane edited `tools/comfy/manifest.json`. **None of these is evidence of a defect and none
    should be quoted as one.**
- `npm run build` — **did not complete at 21:52**: its `tsc --noEmit` gate failed on the in-flight
  refactor. No current bundle-size figure; the stale one has been dropped rather than carried.
- `python3 tools/prose/prose-lint.py data/dialogue.json` (22:00) — **exit 1**, 214 entries,
  63 speakers, 509 lines. 27 control assertions green over 7 structural checks. **0 corpus
  structural failures** — the two this file previously carried, `G8-ASSERT-CHOP` and `G9-SHAPE-SIG`,
  are both **CLEAN** now. 3 per-beat advisory flags, all `R1-SUBJECT-SWITCH`, 3 speakers.
  **The non-zero exit is not evidence of a structural failure**: `tools/prose/prose-lint.py:1085`
  exits on `beat_total + fails ≠ 0`, so three advisory flags alone produce exit 1.
- `git status --porcelain | wc -l` — **80** (22:11); it read 55 at 21:43. Seven untracked paths:
  `tests/gates/dex-path-contract.test.ts`, `tests/unit/clock-subtick.test.ts`,
  `tests/unit/battle-launch-guards.test.ts`, `tools/comfy/trial.ts`, `tools/comfy/trials/`,
  `tools/comfy/MAP-PROMPT-RULES.md`, `tools/artverify/`. The temporary
  `tests/unit/__repro-battle-clock.test.ts` was deleted at ~22:11, which closes one of T-25's items.

## What is built

| Subsystem | State | Where it lives |
|---|---|---|
| Battle engine | Pure reducer `(state, action, rng) → {state, events[]}`; no Phaser | `core/battle.ts` |
| Ecosystem sim | Per-node integer populations, one clamp, one write path | `core/ecosim.ts` |
| Food web | Diet edges derived from node data; nothing else may compute them | `core/foodweb.ts` |
| Calendar clock | **52 ticks/year, 13/season, `subTicksPerTick` 2**; `ClockState` is `{year, tick, subTick}`; unbounded, no cap, no fail state | `core/clock.ts:44` |
| Tick costs | travel 1 · foray 1 · inn 2 · **battle 0.5, charged at launch** and wired (`OverworldScene.ts:879`) | `data/balance.json` `clock` |
| Cadence validation | A 4-rule `.superRefine` refuses a retune at boot: year = season × seasons; `startTick` in range; every cost an exact multiple of `1/subTicksPerTick`; no cost ≥ a season | `core/schemas.ts:479` |
| Encounter rate | Grass-gated. `stepEncounterChance()` is the **single** definition the game and the harness both roll against — no second one exists | `core/foodweb.ts:223` |
| Act model | Badges + quest flags gate towns, routes, raids, rival, finale | `core/acts.ts` |
| Lifecycle | Aging, retirement, heirs, boxed aging, Cullbrand raid on act entry | `core/lifecycle.ts` |
| Save + replay | Action log replays byte-identically; `subTick` and `forayStepsSinceTick` survive the round trip and the year turn | `core/save.ts`, `tests/property/determinism.test.ts` |
| Content + schemas | 27 species lines (3 Ancients), 28 moves, 6 gyms, 12 nodes; zod-validated at boot | `data/`, `core/schemas.ts` |
| Age multipliers | **Halved toward neutral: J 0.875 · A 1.0 · E 1.075** (was 0.75 / 1.0 / 1.15; A is the neutral, so A did not move). `metamorphicJump` 1.15 and `heirLevelFactor` 0.5 deliberately untouched — not an unfinished half of T-10. Lifecycle tests read the key symbolically, so no table needed re-deriving. **The canonical L9 row and §7.4 carried the old curve until now** and are corrected to name `balance.age.multiplier` as the rule; **four copies outside `docs/` still state the old curve as current** — enumerated in TICKETS T-10 | `data/balance.json` `age`, `docs/build-doc.md:47` |
| Producer template | **Re-spent 85/40/80/35/60 → 85/60/80/35/40** — zero-sum, total still 300, Scavenger untouched, Carricrow untouched. Measured: Loamunder 26.7% → 50.7%, Sporantle 12.9% → 37.9%, both into band; 8 of 24 lines outside the ±15 band. The closed-tournament arithmetic is recorded in `_bandArithmetic` beside the templates, not in a doc | `data/species.json` |
| Dialogue corpus | **214 entries, 509 lines, 63 speakers**; every entry has a path to the screen | `data/dialogue.json`, `game/dialogue-runner.ts` |
| G7 gate | **Now reads `data/dialogue.json`** — 592 player-facing strings plus a joined-body pass, and a prose census over 18 other `data/*.json` files | `tests/gates/guardrails.test.ts:1037` |
| Quests | Objectives, flag writers, sign chains | `core/quests.ts`, `game/quests.ts` |
| Overworld | Walk, collision, travel, encounters, inn, gym challenge, talk, release | `game/scenes/OverworldScene.ts` |
| Walkable slice | `hearthollow`, `r1`, `brackwater`, `r2`; the other 8 nodes are travel-only | `data/nodes/*.json` `walkable` |
| Battle scene | A replayer over `BattleEvent[]` — it holds no rules | `game/scenes/BattleScene.ts`, `game/ui/` |
| Year turn + retirement | Meter fills → year turn → prompt → heir in the party | `game/scenes/YearTurnScene.ts`, `RetirementScene.ts` |
| Finale | Vellsire choice, both outcomes written and flagged, epilogue survey | `game/finale.ts` |
| Rival | One encounter per act, each with pre/win/loss copy | `game/rival.ts`, `data/dialogue.json` |
| Survey | Real per-node counts plus run history | `game/survey-view.ts`, `game/survey-history.ts` |
| Balance harness | Gym sim, type round-robin, full-run cascade; now pays travel/foray/battle ticks and rolls the grass-gated rate | `tools/harness/` |
| Art pipeline | Comfy Cloud client, batch runner, postprocess, overlay diff; **plus a supervised trial runner** (`tools/comfy/trial.ts`, `TRIAL_ROW_CAP` 20 for G13) | `tools/comfy/`, `tools/postprocess/` |
| Palette | 32 positional swatches, **re-frozen 2026-08-26 to the class-equal fit** — all 32 hex values changed, ids/count/`frozen` intact | `data/palette.json` |
| Dex art path | `dexArtId()` produces `dex-painted/dex-<name>`; bound by a 9-test set-identity gate | `game/survey-view.ts:828`, `tests/gates/dex-path-contract.test.ts` |
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

3. **The derived player sprites are now off-palette, and the star badge is back on the cap's rear.**
   *(T-24)*
   `tools/comfy/player-views.ts:213-219` hardcodes 18 hex literals, **every one of which the swap
   deleted**. Regenerating from them wrote 8 off-palette pixels into the back view and 420 into the
   side view, and the star-removal filter compares against `#f9db10`, which no longer exists, so it
   never fires. `_acceptance.json`'s identity detectors read `0` / `[]` / `null` as a result.
   **No gate reads a committed PNG**, so this is invisible to a green suite.

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

### Stale instruments and dead comments — items 5, 6, 7, 11, 12, 13 are T-25 (7, 11 and 13 now closed); items 8 and 9 are T-2

4. **A hex fossil can hide inside a test named for a standard.** `tests/unit/battle-view.test.ts`'s
   "BINDS — the contrast maths agrees with WCAG's own anchors" carried three assertions: two real
   anchors (21:1, 1:1) and one comparing two live palette ids against `5.29`, a number an audit had
   measured on the previous freeze. The palette swap made it read 5.696 and the test went red — not
   because legibility broke, but because the fossil moved. **Repaired by another agent at ~22:01**
   while this file was being written; recorded here because the shape recurs and the name of the
   test is what hid it.
5. **`tests/unit/transcription.test.ts:1297-1300` says battles are unwired.** It states "nothing in
   `game/` ever spends it … As WIRED, battles are free and the real budget is 112.32."
   `game/scenes/OverworldScene.ts:879` spends it. The comment is stale; the arithmetic above it is not.
6. **`game/scenes/OverworldScene.ts:1921` says `seasonBoundary` fires at ticks 4, 8 and 12.** It now
   fires at 13, 26 and 39. Its own header calls it "THE SEAM MOST LIKELY TO BE RE-BROKEN."
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
8. **`tests/integration/demo-beats.test.ts:252-281` argues against a §10.2 that no longer exists.**
   It quotes "strictly rising within 4 seasons" and calls the shortfall "not a licence to ship the
   beat as is"; §10.2 was amended under T-2 to assert the collapse and *report* release. The test is
   green while describing a superseded spec.
9. **`tools/harness/fixture.ts:142`'s one-line mesopredator filter is still undefended.** `grep` for
   `isMesoLine` / `releasedLineId` in `tests/` returns zero. At `r4` it is provably a no-op, so
   deleting it changes nothing and every test still passes. Bind it or record it as undefended —
   T-2 asked for one of the two and neither happened.
10. **`tools/comfy/manifest.json`'s 9 `_deviations[]` rows are no longer dead provenance.** This file
    previously recorded them as indexing a ledger the repo no longer keeps. They are now `LB-M1…LB-M9`
    and cited by `_targetSource`, `_derivedFormRule` and `_concepts[].source` inside the same file.
    **The old item was wrong; struck.**
11. **RESOLVED at ~22:11 while this was written.** `tests/unit/__repro-battle-clock.test.ts` was
    untracked debris whose own header said "TEMPORARY reproduction — deleted once the defect is bound
    by a real test"; `tests/unit/clock-subtick.test.ts` is that test, and the repro has been deleted.
12. **`tools/harness/full-run.ts:368` `const year = clock.year;` is dead** — nothing in the loop body
    reads it. Vestige of the closed calendar→act coupling.
13. **CLOSED — re-read, and it no longer says that.** `tests/unit/lifecycle.test.ts:1646` now reads
    "0.875 → 1.0 → 1.075, plus the metamorphic ×1.15", with the old triple kept two lines below as
    the recorded T-10 before/after rather than as the rule. The item outlived the defect; struck.

### Structural, unchanged

14. **`DialogueScene` is not registered in `main.ts`.** `OverworldScene.ensureDialogueScene`
    registers it at runtime as a declared stand-in. — `game/main.ts`
15. **Two wild-trait rollers live outside `core/`.** `game/wild-battle.ts:90` `rollWildTraits` and
    `tools/harness/player.ts:238` `rollTraits` are draw-for-draw identical; `core/` has none.
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
    player-facing refusal copy is authored. — `core/types.ts:386`
20. **The seed is not randomised.** `game/boot.ts:333` `requestedSeed()` returns
    `balance.rng.defaultSeed` (**1337**) unless `?seed=N` is in the URL, so every new game gets the
    same region. This is the prior question T-14 must answer before seed *guardrails* mean anything.
21. **`core/battle.ts`'s enemy-AI tie-break is decided by floating-point rounding, and shipped
    content hits it.** *(T-27)* The docblock at `core/battle.ts:1318` promises "ties to the earliest move in
    the pool", and the loop's `score > bestScore` is strict, so *bit-identical* doubles do keep pool
    order. But the score is `((atk × power) / def) × mult × predation × midRoll` — so a tie on paper
    (40 × 1.5 = 60 × 1.0) generally does **not** produce equal doubles, and the last bit decides.
    Measured over all six shipped gym rosters as the enemy, every non-Ancient line × J/A/E at the
    slot's level, calling the real `chooseEnemyAction`:

        2160 pairs · 59 tie on paper · 39 also equal as doubles (pool order holds)
                                     · 20 disagree (rounding decides)
                                     · 13 chose a move that is NOT earliest in pool

    In all 13 the AI throws a neutral move where the docblock promises the earlier super-effective
    one. Example, Odo's gym: `mirefin-line(A,L14)` vs `cindril-line(A,L14)`, `dous` paper 60 /
    actual 93.63636363636362603 against `ambush` paper 60 / actual 93.63636363636364024 — pool order
    says `dous`, the AI picks `ambush`. This is the **game's** AI. `tools/harness/player.ts:275-303`
    already documents the same instability for the player-side scorer; `core/battle.ts` does not.

### Art and audio

22. **No art is on disk.** `assets/final/` holds a `.gitkeep`. `tools/comfy/manifest.json` is 288
    rows, `{pending: 287, approved: 1}`. The B1 reproduction gate has never been run.
23. **Billing has started, and it is not being calibrated.** *(T-26)* At least **24 trial PNGs** have been
    generated across four map-trial rounds (`assets/raw/_trials/map-town-style`, `map-style-round2`,
    `map-style-round3`, and a `map-route-shape` spec), and the count was still rising at 22:00.
    `.gitignore:8` excludes `assets/raw/**`, so **no commit records any of them.**
    `tools/comfy/manifest.json:9` `perImageCredits` is still `null` — the dashboard was not read
    before or after a batch of known size, which is the one way build-doc §9.1 says the figure can
    be obtained.
24. **No audio exists.** `assets/audio/` holds a `.gitkeep`; zero `this.sound` calls in `game/`.
    The 11-row track list is corrected (T-21 doc half); no composer family has been shopped and there
    is no `ATTRIBUTION.md`.
25. **The Legacy beat is untested against balance.** `retirement.heirLevelFactor` = 0.5 produces a
    measured ~2.1× power drop in the same year as a level-26-plus gym, and the harness has no
    lifecycle, so nothing measures it. A gym run seeded with a post-retirement party is the mode to
    add. — `tools/harness/gym-sim.ts`

## What is next

1. **Get a ruling on the cascade budget** (the section at the top). Nothing about beat 1 is settled
   until a knob moves or the beat's site changes, and no agent may pick either under G6/G14.
2. **Finish T-11's re-derivation.** 12 tests are red behind an in-flight `data/species.json` edit.
   Pinned tables get re-derived, never loosened (G14).
3. **Repair the palette fallout** — `tools/comfy/player-views.ts`'s 18 dead hex literals, and a gate
   that reads a committed PNG so item 3 above cannot recur silently.
4. **Close the stale instruments in items 4–13.** Each is a comment, a delete, a pin or a binding
   test; none blocks a beat, and each is one of the misreadings this repo keeps paying for.
5. **Run the B1 reproduction gate** (build-doc §15, Lane B) — one asset per pixel class reproduced
   from `manifest.json` byte-identically. Nothing multi-version starts before it passes.
6. **Give the harness a lifecycle mode** so the Legacy beat is measured rather than asserted.
7. **Batch the vertical-slice art** (B3/B4) — G13 still binds: no batch of 20 or more without an
   explicit `--confirm` and a *measured* per-image figure.
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

**Struck from this file, having been checked and found false:** the claim that
`tools/comfy/manifest.json`'s `_deviations[]` rows index a ledger the repo no longer keeps (item 10);
the two prose-lint corpus structural failures (`G8-ASSERT-CHOP`, `G9-SHAPE-SIG`), both now CLEAN;
the "seven dialogue lines state a six-year run length" item — all seven were reworded and the pin in
`tests/unit/dialogue.test.ts:2338` was inverted to assert that **no** line states a run length; and
the "cascade beat is not on the walkable slice" item as previously worded, which described a content
mismatch and not the arithmetic shortfall that now gates it.
