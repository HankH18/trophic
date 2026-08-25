# Lane A — status after integration

**What this file is.** The honest state of `core/`, `data/` and `tests/` after lanes A1 (types +
content), A2 (rng/clock/foodweb/ecosim), A3 (battle) and A4 (lifecycle/save) were merged. It is
written for the next wave of agents — Lane B (art factory) and Lane C (game shell) — so it says what
you can rely on, what is a stand-in, and what is simply not there. Where something is weak, it says
so; a green suite is not the same as a finished system, and the gaps below are the difference.

Per build-doc §16 G12, nothing here is stated in human engineering-hours.

---

## 1. Headline

| | |
|---|---|
| `npx tsc --noEmit` | **silent** (exit 0) |
| `npx vitest run` | **17 files, 788 tests, 788 passing, 0 failing, 0 skipped** |
| Core suite with **Phaser physically uninstalled** (`node_modules/phaser` moved aside) | **17 files, 788 tests passing**, `tsc --noEmit` also silent — locked decision L11 proven the strong way, not by grep |
| `data/balance.additions.*.json` | **deleted**; every key merged into `data/balance.json` and declared in `Balance` + `zBalance` |
| Gameplay constants as literals in `core/` | **none** (gated, with a per-file allowance list of 4 files / 19 values, each with a stated reason) |
| `Math.random` in the repo | **none** (gated across `core/ game/ tools/ tests/ fixtures/ data/`) |

Test counts by file:

```
237  tests/gates/guardrails.test.ts        24  tests/unit/catch.test.ts
115  tests/unit/lifecycle.test.ts          20  tests/unit/rng.test.ts
 78  tests/gates/schemas.test.ts           16  tests/property/lifecycle.test.ts
 70  tests/unit/battle.test.ts             15  tests/unit/clock.test.ts
 43  tests/unit/save.test.ts               13  tests/property/determinism.test.ts
 43  tests/unit/transcription.test.ts      10  tests/gates/extensibility.test.ts
 35  tests/property/ecosim.test.ts          9  tests/property/battle.test.ts
 34  tests/property/foodweb.test.ts         1  tests/unit/smoke.test.ts
 25  tests/integration/seams.test.ts
```

---

## 2. What is built

**`core/` — 7,173 lines of pure TypeScript, zero engine imports.**

| Module | Covers | State |
|---|---|---|
| `core/types.ts` | build-doc §7.1–§7.8 in full, plus `Balance` typing every group in balance.json | Complete. No other lane should need to edit it. |
| `core/schemas.ts` | zod validation of every `data/*.json`, at boot and headless, plus the cross-file invariants (movePool→moves, habitat→biome, adjacency symmetry, type chart is its own dual, 28-move pool, exactly 4 migrants, Ancient⇔gate) | Complete. `validateContent()` is zero-arg; `validateBundle(raw)` takes any bundle so tests can feed it garbage. |
| `core/foodweb.ts` | §7.3 derivation (the **only** place diet edges are computed), §7.2 encounter weights + bait lookup, migrant status | Complete. |
| `core/ecosim.ts` | §7.3's six numbered steps, presence effects, region stepping, catch/release, region projection for the epilogue | Complete. |
| `core/battle.ts` | §7.4 damage/status/catch/flee/XP, the pure reducer + event log, the enemy policy | Complete. |
| `core/lifecycle.ts` | §7.5 year turn, aging (boxed included), metamorphosis, retirement heir-or-boon, scripted raids | Complete. |
| `core/save.ts` | §7.8 save shape, 3 slots, versioning, deterministic replay of an action log, RNG stream snapshots | Complete. |
| `core/clock.ts` | L8 16-tick meter, seasons, year end by meter **or** gym victory | Complete. |
| `core/rng.ts` | §8.1 seeded xorshift128, per-subsystem streams, per-node child streams, stochastic rounding | Complete. |

**`data/` — all content transcribed from the bible.** 27 species lines / 35 dex identities, 28
moves + the type chart shape, 6 gym rosters (4/4/5/6/6/6), 12 node files, 32-swatch placeholder
palette, and `balance.json` carrying every tunable in one place.

---

## 3. Named tests from build-doc §10 — what exists and passes

| Named test | Spec | Where | State |
|---|---|---|---|
| `pop_bounds` | §10.2 | `property/ecosim.test.ts`, `integration/seams.test.ts` | **passes** — integer, within `[populationFloor, carryCap]`, on the live path AND the replay path |
| `det_sim` | §10.2 | `property/ecosim.test.ts`, `property/determinism.test.ts` | **passes** |
| `det_replay` | §8.1, §10.2 | `property/determinism.test.ts`, `unit/save.test.ts`, `property/lifecycle.test.ts` | **passes** — including a mid-run save/load/continue that reproduces the uninterrupted run's draw sequence |
| `cascade_emerges` | §10.2 | `property/ecosim.test.ts`, `unit/transcription.test.ts` | **passes, with a documented weakening** — see §6 below. This is the most important caveat in this file. |
| `migrant_legibility` | §10.2 | `property/foodweb.test.ts` | **passes** |
| `ext_add_species` (INV-1) | §6, §10.3 | `gates/extensibility.test.ts` | **passes** — written at integration; did not previously exist |
| `ext_add_node` (INV-2) | §6, §10.3 | `gates/extensibility.test.ts` | **passes** — written at integration; **it found a real defect** (see §7, I10) |
| `ext_retune` (INV-3) | §6, §10.3 | `property/ecosim.test.ts` + `gates/guardrails.test.ts` | **passes** |
| `no_magic_numbers` (INV-4) | §6, §10.3 | `gates/guardrails.test.ts` | **passes** — now repo-wide over `core/`, was two files |
| `no_shadow_tables` | §8.3, §10.3 | `gates/guardrails.test.ts` + `property/foodweb.test.ts` | **passes** |
| no-`Math.random` | §8.1, §10.3 | `gates/guardrails.test.ts` | **passes** — repo-wide, was four files |
| `no_phaser_in_core` | L11, §10 | `gates/guardrails.test.ts` | **passes** — direct + transitive import-closure walk, and verified physically |
| `perf_sim` | §12 | `property/ecosim.test.ts` | **passes** |
| `overlay_diff` | §8.2, §10.4 | — | **DOES NOT EXIST.** Lane B scope; `tools/overlay-diff/` is empty. |
| harness gym-sim / round-robin / full-run | §10.5 | — | **DOES NOT EXIST.** Lane A5; `tools/harness/` is empty. |
| postprocess idempotency, manifest seed reuse | §10.4 | — | **DOES NOT EXIST.** Lane B scope. |

**Every gate is proven to bind, not merely to be green.** Each one is run a second time inside the
test against a deliberately corrupted copy of its own input, and at integration all five were
sabotaged against the real tree (a `37` in `core/battle.ts`, a `Math.random` in `core/lifecycle.ts`,
a direct and a transitive Phaser import, a role table, a `rollTable` key in a node JSON, an
undeclared balance key) — 7 of 7 turned red, and the tree restored green.

---

## 4. What Lane B (art) can depend on

- **`data/palette.json`** — 32 swatches, ids `c00`–`c31`, `frozen: false`. The **ids are the stable
  contract**; gate B0 is a value swap, not a restructure. Nothing in `core/` reads a hex.
- **`data/nodes/*.json`** — every node already declares `mapAsset`, `collisionMask` and
  `yearVariants: {}`. `yearVariants` stays empty until a variant passes overlay-diff; the schema
  accepts keys `"2".."6"` only, and `core/lifecycle.ts` `mapAssetForYear` already resolves the swap.
- **`balance.overlayDiff`** — IoU threshold, Sobel threshold, dilation, the denoise ladder and the
  regen cap are all in `balance.json`. The tool needs no constants of its own.
- **`balance.map`** — virtual resolution, native map size, render scale, the 16px collision grid,
  the 32×48 player sprite and the 32px tile step.
- **Asset count correction (DEVIATIONS D2):** build-doc §9.7's "154 battle sprites" is wrong. The
  bible's own line arithmetic does not close; the correct figure is **150** (24 aging lines × 3
  forms + 3 Ancients × 1 form = 75 forms × front/back). Read §9.7's 154 as 150.
- **`props[]`** in the node files already carry the sign-chain trailheads (antler stones, shell-kiln
  shrines, sunken idols) with positions and interaction radii, so prop art has a manifest to work to.

**What Lane B must NOT expect from Lane A:** nothing in `core/` reads an image, and no code path
fails if an asset is missing — the paths are data. That is deliberate, and it also means a typo in a
`mapAsset` path will not be caught by any Lane A test.

---

## 5. What Lane C (game shell) can depend on

Everything below is exercised headlessly by the suite, so it is real, not aspirational.

**Boot.** `validateContent()` (core/schemas.ts) parses every `data/*.json` from static imports —
works in the browser and in vitest, no `fs`. It throws a readable `ContentValidationError` listing
every issue with its file label.

**Save/load.** `newSave`, `serialize`/`deserialize`, `writeSlot`/`readSlot`/`listSlots`/`deleteSlot`
against a `StorageLike` (hand it `window.localStorage`). `SaveVersionError` carries the found and
expected versions and a message you can show. `openStreams`/`captureStreams`/`withStreamState` make
a mid-run save resume on exactly the RNG position it was saved at.

**Overworld / encounters.** `encounterWeights(node, idx, balance, {season, unlockedSignChains})`
returns **every** line with its weight and an `active` flag — so the dex and sign cards can say *why*
something is absent (migrating vs wiped out) from the same call the encounter roll uses.
`rollEncounter` picks from it. Weights are the live counts: catching to extinction drops a line to
weight 0 automatically (verified end to end).

**Battle scene.** `makeBattleContext(content, predationOracleFromWebs([web]))` then `startBattle` /
`step`. The scene is a **renderer of `events[]`**: replaying the log's deltas from the opening state
reproduces the closing state exactly (tested). Absolutes (HP, level, form name, types, `statMods`,
`lureActive`) are read off `BattleState`. `illegalActionReason(state, action, ctx)` lets you grey a
button *before* stepping, and a refused action now also emits `{t:"actionRejected", reason}` so you
can explain it afterwards. `evaded` and `lureChanged` were added at integration for the same reason.

**Catch → ledger (Hard Req 2).** `caughtIndividual(state, ctx)` returns
`{uid, lineId, formName, age, level, traits, nodeId, ancient, metamorphosed}` — every field has a
home in `newOwnedCreature`'s options, so nothing is lost in the hand-off. Applying it is the
caller's job (see the gap in §6).

**Year turn.** `runYearTurn(save, deps)` returns the new save, the retirement `prompts[]`, the
retirees, an event log, the map-variant swaps, and `seasonStepRan`. `advanceYear` answers the
prompts for you (harness/headless). `resolveRetirement` applies one player choice.
`retirementChoiceProblem` / `boonTargetUids` let C6 grey out an unapplicable choice instead of
discovering it mid-turn. `retiresBeyondFinalYear` lets C4's card render an heir's year-7 projection
honestly.

**Clock.** `advanceAction(clock, "travel"|"foray"|"inn", balance)` → `{clock, events}`.
**Read this carefully — it is the seam most likely to be re-broken:**

> `seasonBoundary` fires at ticks 4, 8 and 12 only. The year's **fourth** season step is run by
> `runYearTurn` (build-doc §7.5 step 5), which reports it as `{t:"seasonStep", nodeId, season}`.
> Run `ecosim` on `seasonBoundary`; run `runYearTurn` on `yearEnd`; **do not do both for the same
> season**. `gymVictory` emits no `seasonBoundary` at all, for the same reason.

The invariant to hold onto: over a six-year game there are exactly **24 season steps** — 18 clock
boundaries plus 6 year turns.

**Ledger / epilogue.** Read `save.nodeStates[nodeId].populations[lineId].count` directly (§8.3 says
the ledger UI reads `nodeStates` objects, and no other module may restate the numbers).
`projectRegion` (core/ecosim.ts) is what the Hard Req 7 epilogue needs — it is a ledger read of a
projection, not a second sim.

---

## 6. Honest gaps — read this section before trusting anything above

### 6.1 Nothing wires a battle catch to the ledger. (Lane C dependency, not a Lane A defect.)

The pieces all exist and compose — `caughtIndividual` → `appendAction({t:"catch", nodeId, lineId})`
→ `replay` (or `applyCatch` for the live path) → the count moves. **It is proven end to end**, with
a real battle against the shipped R1 data, in
`tests/integration/seams.test.ts` ("Hard Req 2: a real battle catch moves a real number"): the
ledger goes 11 → 10 and the derived encounter weight follows. But **that test is the join**. There
is no function in `core/` or `game/` that does it, and a test in the seams file asserts that fact so
the day someone adds the real wiring, the stand-in fails and gets replaced. Same for release.

### 6.2 `cascade_emerges` is weaker than build-doc §10.2 states, and this is the biggest risk to the never-cut demo beat.

§10.2 asks for: apex → 0, **and mesopredator count strictly rising within 4 seasons**. On the
shipped content the second clause is **not a per-run law**. Lane A2 measured the strict rise at
**16% of seeds at 4 seasons** (39% at 16) at `r4`, and in the majority of successful cascades the
mesopredator **co-extincts** rather than being released. What is asserted instead:

- per-run **laws**: a starving population strictly declines and does not breed; the apex reaches 0
  within `cascade.apexCollapseSeasons`; extinction is permanent; every line the dead apex ate takes
  exactly zero predation from it afterwards; and *nothing at the node preys on the mesopredator any
  more* (the "new apex risen" clause), asserted whether or not the mesopredator survived;
- the **rise** in aggregate over every cascade, counting co-extinct cases as the 0 they are.

Consequence for the demo: **the complete beat (apex gone AND the tier below released and rising)
occurs at exactly one shipped node, `r4`**, and `fixtures/overcatch-script.json` targets it with a
recorded seed (12) chosen for legibility. Reproducing the beat at a *vertical-slice* node
(Hearthollow/R1/Brackwater/R2, which is where the video is shot per build-doc §1) is **not
demonstrated**. Closing it needs either a release-scale `breedRate` on mesopredator lines in
`data/nodes/*.json` or larger shipped counts — both content edits under DEVIATIONS D9's licence, and
both properly the balance harness's call (A5). See `docs/DEVIATIONS-lane-a2.md` A2-D1 and A2-D10.

### 6.3 There is no balance harness. (Lane A5.)

`tools/harness/` is empty. So:

- the §10.5 gym win-rate bands (80–95 / 60–80 / 45–65) are **unmeasured** — the gym levels are an
  assigned ramp (8/14/20/26/32/38, signature +2, DEVIATIONS D9), not a tuned one;
- the type-chart round-robin (flag any line outside 35–65%) has **never been run**, so "no line is
  strictly dominant" rests on the stat-template argument, not on data;
- the full-run sim ("no unintended extinction under normal play") is **unverified**;
- the over-catch feasibility figure in §6.2 is an **upper-bound calculation**, not a played run.

Every number in `balance.json` should be read as *plausible and internally consistent*, not *tuned*.

### 6.4 Two lifecycle numbers are known-suspicious and were left alone deliberately.

- **Starter timing (D-A4-9).** The shipped J3/A2/E1 schedule makes a year-1 starter reach its final
  form in year 3 and retire at the year-3→4 turn — three years before the year-6 league, where bible
  §4 says it "peaks right before the league, then retires". build-doc §1's never-cut Legacy beat
  still holds (measured: the heir is an Elder Pyrevane in year 6), but the flavour does not. Fixing
  it means retuning `balance.age`, which is an A5 decision.
- **Heir power cliff (D-A4-10).** `heirLevelFactor 0.5` is implemented verbatim and produces a
  measured ~2.1× drop (parent Pyrevane E L22 atk 133 → heir Cindril J L11 atk 64) in the same year
  as a level-26 gym. Spec-faithful, probably unplayable, flagged for the harness.

### 6.5 Content the bible leaves open was assigned by rule, not measured.

Per-species `baseStats`, gym levels, and every node's `count`/`breedRate`/`carryCap`/`floraStock` are
agent-authored under published rules written into the data files (`_statRule`, `_levels`,
`_pyramid`, `_breedRule`) and test-enforced against those rules. That makes them *auditable*, not
*right*. Twelve move names, thirteen trait names and one boon-copy string are **coined** and are in
scope for the G15 IP sweep.

### 6.6 Stubs and things that are typed but not built.

- `game/` is a `console.info` and an `export {}`. No scenes exist.
- `tools/harness/`, `tools/overlay-diff/`, `tools/collision-editor/` are empty directories.
- `data/dialogue.json` (build-doc §5) **does not exist**; no dialogue is written.
- `yearVariants` is `{}` on every node — no year-2..6 map art has passed overlay-diff, because
  overlay-diff does not exist.
- `balance.yearEvents.raids` holds **one** raid, the bible-pinned year-4 R4 strip-harvest. The other
  per-act Cullbrand raids (bible §9) are unwritten content, not numbers to invent.
- Ghost gym teams are schema-only, correctly (Hard Req 9 / G8).
- `fixtures/mega-node.json` does **not** stress 27 lines — bible §5's habitat clause admits at most
  7 lines at any biome, so build-doc §11/§13's "all 27 lines at one node" is not constructible. The
  fixture was repurposed to bind the habitat clause; the O(n²) cost claim is measured separately
  (A2-D9).

### 6.7 Weaknesses in the test suite itself.

- **`tests/gates/guardrails.test.ts` is 237 of the 788 tests**, mostly one per file per gate. Raw
  test count is a bad measure of coverage here; the honest figure is that the four named gates cover
  the 9 files in `core/` and the 54 source/data files under `core/ game/ tools/ tests/ fixtures/ data/`.
- `no_magic_numbers` allows any literal **≤ 1** everywhere. A gameplay constant of `0.42` in a new
  core file would pass. This is inherited from A2's original gate and is a real hole; tightening it
  needs a per-file expected-literal census rather than a threshold.
- The `no_shadow_tables` species-name sweep matches **string literals only**. A shadow table built
  from computed keys would pass the grep half; the structural half (A2's relabelling gate over
  `core/ecosim.ts`) covers the sim but not `core/battle.ts` or a future `game/` file.
- The G6 relabelling gate is scoped to `core/ecosim.ts`. Nothing structurally prevents a *scene*
  from special-casing a species.
- Several property tests run at `numRuns` 100–300. That is enough to catch a systematic error and
  not enough to catch a rare one.

---

## 7. Cross-lane defects found and fixed at integration

All five were reproduced against the shipped data before anything was changed, and each fix is
pinned by a test that goes red when the fix is reverted (verified). Full write-ups in
`docs/DEVIATIONS.md` §Integration, rows I1–I11.

| | Defect | Measured |
|---|---|---|
| **I4** | **The fourth season ran twice a year.** `core/clock.ts` cued it (§4) and `core/lifecycle.ts` ran it (§7.5 step 5). A caller doing the documented thing ran 5 season steps a year, not 4. | +25% ecology on every six-year trajectory; ledgers demonstrably differ under the two accountings |
| **I10** | **Adding a node moved every other node's trajectory** — `stepAll` cost the parent RNG one draw *per node*, so region size phase-shifted every stream from the next season on. INV-2 was false, and lane A2's comment claimed it was true. | Adding one node moved Hearthollow's bramblehog 6→9, loamunder 42→43, pollywisp 6→5 over two years, six graph hops away |
| **I3** | **Two implementations of the population write.** `core/save.ts` restated §7.3 step 4's clamp without the upper bound, and `applyCatch` used a literal `0` where replay read `populationFloor`. | A replayed release at carrying capacity gave **22 against a cap of 21** (r1 bramblehog); L10's byte-identical-replay claim was false |
| **I1/I2** | Three lanes' `balance.additions.*.json` merged and deleted; the duplicated `retirement.boonStatPct` removed. **No key collided** between lanes. | A retune of `stats.boonModPct` alone used to move lifecycle to 1.25 while battle stayed at 1.10 |
| **I6** | The save version had **three** homes; the literal type pin made bumping `balance.party.saveVersion` produce a save the build that wrote it could not load. | Verified after the fix at `saveVersion: 3` |

**One seam was clean:** `core/battle.ts` holds no diet table. Its `PredationOracle` is built only
from `FoodWeb` objects produced by `core/foodweb.ts`, `baitMatchOf` delegates to `baitMatchFor`, and
`unwiredPredationOracle()` throws rather than silently reporting "no predation". Verified pair-by-pair
against the derived R2 web, including directionality and per-node scoping.

**One RNG:** `core/rng.ts` is the only generator in the repo. `core/battle.ts` and
`core/lifecycle.ts` take one injected (structurally, via `asBattleRng` / `RandomFn`) rather than
constructing one; no module shifts bits of its own.

---

## 8. If you change one thing, check these

- **Touching `core/clock.ts` or `core/lifecycle.ts`'s year turn** → re-read §5's clock note. The
  24-season-steps invariant is asserted in `tests/integration/seams.test.ts` and
  `tests/unit/clock.test.ts`; if you make it 30 again, both go red, and that is the point.
- **Adding a tunable** → it goes in `data/balance.json` **and** `Balance` (core/types.ts) **and**
  `zBalance` (core/schemas.ts), in one change. `zBalance` is a plain `z.object` and strips
  undeclared keys, so a key with no schema entry is a decoy that no reader ever sees.
  `balance_keys_survive_validation` fails on exactly that.
- **Adding a species or a node** → `tests/gates/extensibility.test.ts` is the spec. If you needed to
  edit `core/`, INV-1 or INV-2 is broken.
- **Writing anything that decides what eats what** → don't. Call `core/foodweb.ts`.
