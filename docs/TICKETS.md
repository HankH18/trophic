# TICKETS

The work queue. Every ticket here carries a ruling Hank has already made — **these are decided, not
open.** Do not re-ask them. Where a ticket says a thing is his call, that call has been made and is
quoted.

Status vocabulary: `TODO` · `IN PROGRESS` · `DONE` · `CLOSED` (decided, no work needed).
A `DONE` ticket keeps its ruling and loses its working detail; git holds the rest.

**Order.** Work top-down within each section unless a ticket names a dependency. ⚠ **T-1's open
decision used to sit first as the one ticket no agent could work; it is DISCHARGED**, and the ticket
records why the question dissolved rather than being answered. **The tickets that cannot be worked by
an agent are now T-36, T-37 and T-38.** ⚠ **T-57 has left that list** — it dissolved on the tile
ruling rather than being answered — **and so has the map-composition question, which was never a
ticket and has been ruled**; both are recorded below and in `docs/STATUS.md`.

**Statuses below were re-verified against the working tree on 2026-08-26 between 21:43 and 22:07,
while several agents were editing it.** Where a ticket's own predicted number turned out to be wrong,
the measurement is recorded and the prediction is marked as wrong rather than quietly replaced.

**Re-verified again on 2026-08-27**, one complete run, on a tree that is for once nearly clean.
`npm run test` reads **3 failed of 3,176, 3,173 passing, 1 file of 78**, 48.34 s — the three being the
deliberately deleted hearthollow map, seen three times; `npx tsc --noEmit` reads **exit 0, silent**;
`npx tsx tools/mapgen/run.ts verify` reads **12 of 12**. ⚠ **Read all four as readings at a timestamp:
they were taken while several lanes were mid-edit in the same tree.**
⛔ **`main` is MANY COMMITS AHEAD OF `origin/main`, ZERO BEHIND, and NOTHING FROM THIS SESSION IS
PUSHED. No count is published here — run `git rev-list --left-right --count origin/main...HEAD`.**
The figure moved FOUR TIMES during a single documentation pass (13 → 16 → 18 → 19 → 20) because
several lanes commit into this tree concurrently. This
preamble said *"in sync with `origin/main`"* for several passes and it is now false. It was chosen
deliberately, over a hash, as *the claim that stays true* — and **a claim that stays true is not the
same as a claim that stays checked.** ⚠ **Its replacement then went stale inside one session**: the
"thirteen" written above it was three commits wrong by the time the next agent read it. Re-run the
command; do not inherit either number.

**All three remaining failures are one deleted file seen three times** —
`assets/final/maps/hearthollow.png`, removed on the owner's instruction, failing
`tests/gates/asset-palette-contract.test.ts` on *present*, *is a real image* and *is on palette*, all
three throwing the same message: *"an absent covered file is a failure, never a skip."* **That is the
gate working and it is not work to do.**
⚠ **AND THE FAILURE COUNT FELL 5 → 3 WITHOUT FOUR OF THOSE FIVE BEING FIXED — read it that way round,
because "fewer failures" is the pleasant reading and the pleasant reading is the one nobody
re-derives.** Two fired on untracked art-lane files that have since **left the tree**; one fired on an
uncommitted `manifest.json` that has since been **committed**; **the gates did not change.** Only two
of the five were actually closed by work: **T-46's fossilised precondition was repaired** (and its
surviving mask assertion **widened from `r1` alone to all twelve nodes** — see T-56), and the cascade
feasibility gate was found to be **measuring wrong** rather than reporting a balance gap.

**Closing on this pass: T-46, T-60 and T-62.** **T-60 closes with its premise corrected twice and its
residue re-ticketed rather than absorbed** — catching was never blocked, the three snares now land,
and what is left is the opposite defect: a tier nobody grants is *unlimited*, which is **T-66**.
**T-62 closes on a cause exactly as narrow as the observation** — the log printed the raw roll while
the bar showed the clamped application — and its sibling, Scrounge healing by the roll rather than by
the HP that left, closed with it. **T-1's open decision is DISCHARGED, and not by a ruling**: the gate
was ignoring `seasonalWindow`, the correction made it stricter, and the beat was always reachable at
`r4` and `cindershelf`. **No knob was tuned and none is owed an answer.**

**What landed and is verified in the tree:** the economy — money and items as tape actions with
readers, appliers and `replay()` arms; a `grants` key on the dialogue schema bounded by a must-write
path analysis; a Phaser-free shop row model; and the live wiring that makes all three reach the save.
**And the twelve hand-authored map layouts**, their layout↔populations gate, and a seeder that refuses
to overwrite a layout a human has edited.

✅ **AND THE ONE THING THAT COULD NOT BECOME A TICKET WITHOUT A RULING NOW HAS ONE: the maps are
composed from tiles, and Hank ruled it himself.** ⚠ **This paragraph said the opposite — *"it sits in
STATUS's waiting on the owner register and no ticket here may depend on it being adopted"* — and that
is now false.** He raised the question unprompted and answered it: *"Get it done. Use as many agents
as you need to. This was the common sense answer from the start, and while planning out this project,
you cautioned me against it. Make up for that by doing an exceptionally good job here as quickly as
you can."* — relayed from the art lane's session. **He then said it first-hand, on being shown that
the build doc still forbade the work: *"I override the build doc!"*** `docs/STATUS.md` and
`docs/build-doc.md` carry both sources with their provenance kept distinct; **name the source when you
cite either, and do not hedge the relayed one** — see the standing rule below.
**What that changes here.** **T-57 dissolves rather than being answered** — both artefacts stamp from
one text file — and its own *done when* named this exact route. **T-56 is unblocked and is now the
work**, per node, behind each painting. **T-71 was opened and CLOSED inside this pass**: L7 and G1
contradicted him in as many words, and `f81f8d3` amended both plus §13's interview answer. **T-72 and
T-73 are new** — cindershelf's material half, and the compositions being the region's shape rather
than its content.
⛔ **What the ruling does NOT do: approve a picture.** He ruled on the METHOD. No composed map has been
put in front of him, nine of the twelve paint from the wrong biome's material table, and none of the
authored buildings is drawn — **T-73**.

**Closing on the tile pass: T-57 (dissolved), T-69 (done) and T-71 (opened and closed within the
pass, by `f81f8d3`).** **T-72 and T-73 are new** and are consequences of the ruling rather than new
ideas. **T-70 gains three more instances** — a fourth
file still citing the drifted `bagHas` line, a `data/balance.json` note claiming a G11 move that only
half happened, and a test docblock that went stale in the direction nobody checks.
⛔ **AND ONE CLAIM WAS WRITTEN INTO BOTH DOCUMENTS DURING THIS PASS AND RETRACTED WITHIN IT: that the
owner had ruled on cindershelf.** He has not. It came from a comment in `compose.py` asserting a
ruling that never happened, contradicting a sibling file by the same author. **The question is back in
STATUS's *waiting on the owner* register**; the chain is STATUS item 53 and T-72, and the rule it
produced is now in the standing rules below — **a comment in the tree asserting that Hank ruled is not
evidence that he ruled.**
✅ **AND ONE DEFENCE-IN-DEPTH GAP WAS FOUND AND CLOSED INSIDE THE PASS**, in `320a687` and `0a3eb7d`:
the shop's two independent refusals — the model's throw and the scene's `row.disabled` guard — **were
each unasserted and were masking the other's absence**, so rewriting both as a silent `return save`
left **111 tests green**. **Shipped behaviour was correct on every reachable path**; this was coverage,
not a defect. It is written up as STATUS item 58 rather than as a ticket, and the transferable half is
there: **a substring assertion would not have closed it**, because `ShopError`'s message embeds the
same reason the banner prints, so only whole-string equality can tell the two layers apart.

**Closing on the collision pass (2026-08-27, later): T-24.** The derived player views were rebuilt
against the re-frozen palette and `tests/gates/player-art-contract.test.ts` reads **16 of 16** — the
last of its three clauses. **T-20 is NOT closed with it**: its defect is the side view's geometry, and
a palette gate cannot see legs. **T-12's clause 2 gains the replay arm and two recorded decisions on
`[R]`** — where it may be pressed, and the one indoor exception. **T-53 through T-58 are new**: three
are the `GameAction` replay union walked end to end after the inn-rest defect showed the shape, and
three are the collision-mask seam. **T-57 is the owner's and is the prior question T-56 waits on.**
⚠ **Two claims that arrived with this pass were CORRECTED before they were written down** — the
"two shipped tests go red when a mask lands" (it is one test; the other is already red for an
unrelated reason, and only `r1`'s mask touches it) and the round-trip sabotage evidence (two of the
four cited sabotages do not exist in this repository). Both corrections are in STATUS items 41-42 and
in T-56.

**Closing on the progression pass: T-12's clause 2.** The inn heals what it charges for, so T-28's
largest unlanded clause is landed and T-12's remainder is the economy alone. **T-44, T-45 and T-46 were
re-read and ALL THREE ARE STILL OPEN** — none was closed by the commits in between, and T-45's own
cited line has drifted. **T-39 and T-41 were re-read and are unchanged.** **T-47 through T-50 are
new** — the interior and map-edge work becoming visible now that the maps exist. **T-51 was opened and
CLOSED within the pass**, its defect having been repaired by another lane while this was being
written; it is kept as the record rather than deleted. **T-52 is new and is a gate, not a repair** —
its subject is correct today and has nothing watching it.

**Closing on this pass: T-28, T-29, T-30, T-31, T-33, T-34** — the progression loop and the travel
soft-lock. **T-28 closes for its WIRING and its own remaining *done when* clauses are named as
unlanded and handed back to T-12**, rather than the ticket being marked done over them.
**T-30 CORRECTS an overstatement it was itself carrying.** **T-34 closes with one gap left explicitly
open** — `replay()` still has zero production callers. **T-44, T-45 and T-46 are new**, and all three
are comments that went false without anything going red.

**Closed on the previous pass: T-32, T-35, T-40, T-42.** **T-17 gains the colour and ground-texture
findings.** **T-38 is CORRECTED — its own claim was false and the truth is worse.** **T-43 is new.**
Two scope questions moved to STATUS's *waiting on the owner* register rather than being written here
as work: how many buildings should have an interior, and when the palette expands to 48 relative to
the top-down re-author. Neither is an agent's to answer.

**Later on 2026-08-27: T-17's ground-texture figures are MARKED, not removed.** The withdrawal is on
the **operator** — an unpublished luminance neighbour-difference reading at threshold 25 — and so on
**every figure it produced**, not on an enumerated list; Gold's `47.51%` whole-map edge density is
only its headline. The scope rule, the set as it stands, and what survives are in the ⚠ note at the
end of T-17. **The LoRA-adoption evidence is inside that withdrawal**, which is *not* a reversal of
the LoRA conclusion — also at the end of T-17. **T-17 also gains the
cause of the bottom-edge dark band** (the skeleton's cliff-step clause, obeyed literally on a node
with no elevation) and the **disproof** of the negations hypothesis. **A third question — whether the
pipeline adopts a LoRA — is REOPENED and sits in STATUS's *waiting on the owner* register, not here**,
because it is the owner's call and not work.

---

## T-1 · Revise the tick system — RULED, BUILT, and the decision it raised is DISCHARGED

**Status:** DONE — **the build was done, and the one measurement that "needed Hank" turned out to be
an instrument error rather than a balance gap.** **Hank ruled 2026-08-26.** The design questions are
CLOSED. Do not re-ask any of them.

**The ruling, verbatim in effect:**
- **52 ticks in a year, "representative of weeks."** 13 ticks per season, four seasons.
- **Action costs unchanged:** travel 1, foray 1, inn 2.
- **Every battle costs half a tick**, charged once at launch.
- **Fast travel stays 1 tick.** Hank's reasoning, recorded so nobody "fixes" it: fast travel already
  grants a time bonus by skipping the wild encounters and their half-ticks, so it needs no discount
  of its own.
- **Grass gating added.** Encounters no longer roll on every walked step.
- **The foray odometer no longer resets on fast travel**, and now persists across a save.
- **These numbers will move again after playtesting.** They are written to be changed: every one is
  in `data/balance.json`, and `core/schemas.ts` refuses a retune that breaks the cadence.

**What shipped, verified.** `clock` = 13/52, `subTicksPerTick` 2, travel 1 / foray 1 / inn 2 /
battle 0.5; `encounter.encounterTileFraction` 0.25. `ClockState` is `{year, tick, subTick}`
(`core/clock.ts:44`). A 4-rule `.superRefine` at `core/schemas.ts:479` refuses a bad retune at boot.
`stepEncounterChance()` (`core/foodweb.ts:223`) is the single definition the game
(`game/encounters.ts:141` → `:260`) and the harness (`tools/harness/full-run.ts:299`) both roll
against — grep confirms no second one. The battle charge is wired
(`game/scenes/OverworldScene.ts:879`) and priced in replay by an exhaustive
`Record<ClockActionKind, true>` (`game/year-replay.ts:167`). Both instruments named below were
corrected. Determinism repairs landed with it: the save schema no longer strips
`subTick`/`forayStepsSinceTick`, `replay` carries `subTick`, and the year turn writes it.

**Why grass gating was necessary and is not a separate idea.** Measured: at the old encounter rate a
foray of 48 steps meets 8.64 creatures. At half a tick each, an excursion would have cost 5.32
ticks, so a 52-tick year would have bought only 7.3 map-crossings — **faster than the 12 it replaced.**
Grass gating at `encounterTileFraction 0.25` makes a year 18.8 crossings. The pacing goal and the
battle cost are only compatible through it.

| | before | now |
|---|---|---|
| ticks per year / season | 16 / 4 | **52 / 13** |
| encounters per foray | 8.64 | **2.16** |
| ticks per foray excursion | 1.0 | **2.08** |
| map-crossings walked per year | 12.0 | **18.8** |
| encounters per year | 138.2 | **54.0** |

*(Every row re-derived from `data/balance.json` and `git show HEAD:data/balance.json`. A map crossing
is `map.collisionCols` = 64 cells, hence 0.75 crossings per 48-step foray.)*

### ✅ THE DECISION IS DISCHARGED — the gate was measuring wrong, and no knob is owed an answer

⚠ **This section asked Hank to move `battleTicks` or `ticksPerYear`, and it should not have.**
`tests/unit/transcription.test.ts` is **GREEN**. The gate computed `preyShare = preyPool /
encounterable` and **ignored `seasonalWindow`** — which build-doc §7.2 names explicitly — while
`reedrick-line` is summer-only and is 75% of the prey pool at both interrogated sites. **It was
pricing a player who can hunt reedrick year-round, and no such player exists.**

**The correction did NOT buy the pass, and that is the part that decides this.** `r4` and
`cindershelf` host no seasonal line, so their numbers never moved: **the beat has always been
reachable there**, at 85% and 97% of seeds. The gate had been interrogating `brackwater` and `r2`,
which the over-catch fixture records as producing a *two-tier collapse* rather than the apex-starve
beat. **"The gate was asking the wrong node" is the failure that reads as a real result until
somebody checks which corpus it was pointed at** — and it cost a session's planning.

**The correction makes the gate STRICTER, not looser**, and the four contested sites are now asserted
**infeasible**, so a balance change that makes one reachable turns the gate red and re-opens the
question deliberately. **No value was tuned and no gate was weakened.** The arithmetic that stood here
— brackwater needing 19.2 removals against 11.42/yr, r2 24.8 against 9.46, a 54.0 budget, and
`encounterTileFraction` unable to reach r2 at any value — **is not withdrawn and still describes those
two sites**; it simply is not a question about demo beat 1, because the beat is not there.

⚠ **What IS still the owner's is a content question, not a knob one**, and it is in STATUS's *waiting
on the owner* register: whether `r4` — the fixture's node, and `walkable: false` — is where the
cascade beat should live. G6 forbids answering that with a chosen seed set or a chosen node.

**Two instruments were wrong and were corrected with the retune** — both DONE:
- The demo-beat-1 gate computed the year's encounter budget as `ticksPerYear × stepsPerForay ×
  encounterChancePerStep`, which ignored grass gating and assumed every tick could be a foray. It
  now conserves the year exactly. **Its own comment block is now stale** — see T-25.
- `tools/harness/full-run.ts` fed `clock.year` to `encounter.levelByYear`, whose two readers both
  index by **act**. Closed: `wildLevel(act, …)` at `tools/harness/full-run.ts:195`.

---

## Content and spec

### T-2 · Cascade clause — amend §10.2 to describe what the food web produces
**Status:** DONE — **both halves closed 2026-08-27** · **Hank:** *"letting the biomes gain
a mind of their own and not forcing any particular outcomes"* … *"keep that how it is"*

**The ruling: do not force it.** The simulation stays as it is. The specification stops promising a
guaranteed outcome and describes what the §7.3 rules actually produce. Guardrail G6 still binds.

- ✅ **build-doc §10.2 amended** (`docs/build-doc.md:398`): *"That collapse is the assertion.
  Mesopredator release is reported, not required"*, with the 12.5% / 0–13% measurements and the G6
  clause. Supporting edits at §7.3 step 6 and §1 beat 1.
- ✅ **`tests/integration/demo-beats.test.ts` rewritten, and no predicate moved.** The comment block
  at `:252-281` now describes the amended clause instead of arguing against the deleted one, and the
  assertions around it are **byte-identical** to what stood before. Green before, green after — the
  rewrite changed what the file *says*, not what it *checks*.
- ✅ **`tools/harness/fixture.ts`'s mesopredator filter is bound.** `isMesoLine`
  (`tools/harness/fixture.ts:110`, applied at `:115`) is covered by the new
  `tests/unit/harness-fixture.test.ts` — 5 tests, whose count assertion at `:216` names the **eight**
  sites where the filter actually bites (`bowerdeep, brackwater, duskhollow, hearthollow, r1, r2, r3,
  r5`) against the two where it is a no-op (`cindershelf`, `r4`). Twelve node files ship, but
  `sanctum` and `sanctum-approach` carry no top-of-web predator at all, so **the honest denominator is
  8 of 10 sites, not 8 of 12.** Dropping the role test reddens **3 of the 5**, and the pre-existing
  suite stayed **fully green** under the same sabotage — the direct proof the filter had been
  undefended. Note *which* two nodes are the no-ops: `r4` is the over-catch fixture's own node, which
  is why nothing ever saw it.

**A figure this ticket paid for, recorded rather than quietly dropped.** The comment block used to
publish *"16% of seeds at 4 seasons, measured on the SIM"* — **a number sourced nowhere in this repo.**
The real figure is **12.5%, being 3 of 24 seeds**, which is exactly what §10.2
(`docs/build-doc.md:401`) and `core/foodweb.ts:242` already publish. The test **is** that measurement,
not a second opinion agreeing with one. The deleted line is in git:
`git show af82c46 -- tests/integration/demo-beats.test.ts`.

### T-3 · G7 read — scope it, then retire the item
**Status:** DONE · **Hank:** *"Scope the read to the 77 entries / 173 lines; re-check only the ones
the rewrite touches and then after, declare the word-matcher sufficient and drop the item. I'm not
going to continue getting stuck in the weeds with dialogue until everything else is done, and I
didn't even pick this rule."*

The blocker is cleared: the permanent G7 gate now genuinely reads `data/dialogue.json`
(`tests/gates/guardrails.test.ts:1037` → `dialogueCopyViolations()` at `:1132`, asserted `:1247`),
scanning every player-facing string plus a joined-body pass over all 215 entries and a prose census
over 18 other `data/*.json` files. It bites: `:1276` smuggles a moralizing line into every entry,
`:1289` into a choice label and a name plate, `:1298` splits a banned phrase across two lines, and
`:1338` fails loudly on an unknown field rather than leaving it unscanned. `COPY_SCAN_DIRS` stays
`["game","core"]` on purpose — the walker collects `.ts` only, so widening it would have been the
no-op the ticket predicted. **The word-matcher is declared sufficient. Closed permanently.**

### T-4 · Reword the seven "six years" lines
**Status:** DONE · **Hank:** *"reword all seven"*

All seven reworded. Zero run-length claims remain (the two surviving "six-year" hits are the Cullbrand
**contract** term, a historical fact). The pin was **inverted, not deleted**:
`tests/unit/dialogue.test.ts:2338` now asserts that *no* line states the run's length, backed by a
BINDS test at `:2352` that forges one and proves the walk still fires. `yearsTotal: 6` stays nominal.

### T-5 · Write Sel's missing wager-loss entry, and remove the per-speaker line ceiling
**Status:** DONE · **Hank:** *"Write the missing loss entry, but remove the ceiling. I don't care
about how much dialogue a character has."*

`sel.quest.wager.lost` (`data/dialogue.json:2381`) gates on `quest.ferrymans-wager.lapsed` and clears
it; the writer is `game/quests.ts:540` and the reachability gate was extended to *observe* that
writer rather than declare it. The per-speaker ceilings (`NAMED_CEILING` 18, `AMBIENT_CEILING` 9,
`PROP_CEILING` 30, `NAMED_OVER_BUDGET`) are gone, with the withdrawal recorded in the file; floors
and medians stay. Corpus `LINE_COUNT` still 400–560, currently 509. `"before the year turns"` is
still literal and the gate keying on it is intact.

### T-6 · Correct two false records, and write Duskhollow's arrival scene
**Status:** IN PROGRESS — **the scene is DONE; neither correction was made** · **Hank:** *"do that
plus write Duskhollow's arrival scene"*

- ✅ **Duskhollow's arrival scene** — `maren.act5.duskhollow` (`data/dialogue.json:1588`), a
  `cutscene` at `duskhollow`, `actMin: 5`, self-closing. Reached through the same `autoplayEntryFor`
  path as the other five arrivals; the reachability gate covers it.
- ❌ **The two false-record corrections, and the invariant test that was to make them
  unre-raisable.** Nothing was written. `grep -rn "three ways" docs/ tests/ core/ game/` finds only
  this ticket. Record #1's invariant does happen to exist already at `tests/unit/r4-arrival.test.ts:194`
  ("pins the strip-harvest to the act that opens the town and its route") — that file is unmodified
  and the record was never corrected against it. Record #2 (act transitions marked three ways) has
  nothing at all.

### T-7 · Amend the bible on the Bloom Year
**Status:** DONE · **Hank:** *"amend the bible"*

`docs/content-bible.md:242-249`: the Bloom Year is a latch on the rise, opens once per node in year
1–2 because `floraRegenPerSeason` exceeds maximum consumption, *"and it is not treated as a defect"*;
**"The Bloom Year grants no bonus spawns, and none is owed"**, citing G3. The regional-events line and
the R1 quest row were corrected with it. No effect was fabricated.

### T-8 · Record Route 4's apex extinction as intended
**Status:** DONE · **Hank:** *"Say so in the spec"*

Recorded in both canonical docs: `docs/content-bible.md:170` and `docs/build-doc.md:405` (§10.5),
the latter naming the raid-suppressed **control run** as the instrument that separates intended from
unintended extinction.

**The control run now exists, and the claim it was hedging is now true (2026-08-27).** It was built as
an **orthogonal flag, not a fourth profile**: `CATCH_PROFILES` (`tools/harness/full-run.ts:250`) ×
`RAID_POLICIES` (`:265`) is a **3×2 matrix**. Suppression deep-copies `rawBalance`
(`raidSuppressedContent`, `:335`; the copy at `:338`), empties `yearEvents.raids` (`:348`) and
re-loads — **`data/balance.json` is never touched**, and the function throws rather than silently
no-op'ing if the raid group is absent (`:340-346`).

- **Measured over 32 seeds: with no player and the raid suppressed, NOTHING reaches zero at any
  node — zero unintended extinctions.** `dex` with the raid suppressed also reaches zero nowhere.
- **The two `collector` extinctions persist under suppression**, so they are the player's. That is
  what proves the instrument is not merely blind: an instrument that reported "nothing died" under
  every condition would be reporting its own silence.
- `tools/harness/report.ts` now attributes by measurement — `attributeExtinction` (`:525`, called at
  `:567`). The `raidNodes` lookup it replaced is **gone from the repo entirely** (zero hits).

**The old classifier had two latent bugs that happened to cancel**, and both are recorded so the
cancellation is not mistaken for correctness: it credited a node to the raid **without ever asking
whether the raid mattered**, and its emergent test was **a year late**. Two wrongs reading right is
not a working instrument.

⚠ **Both canonical docs still describe the gap as open, and are now wrong.** Correcting them is the
remainder of this ticket, and the wording is constrained: **any restored §10 claim must cite
`baseline-no-raid` over 32 seeds, not "the baseline".**
- `docs/build-doc.md:405` — *"A control run with the raid suppressed has not been run and no such
  mode exists in the harness"*, and, in the same sentence, that an extinction is attributed to the
  raid *"by the node the raid script names, not by measurement"*. Both halves are now false.
- `docs/content-bible.md:176-178` — *"The raid-suppressed control that would show the raid is the
  whole cause has not been run, and the harness has no mode for it."* Same correction.

  *(Both citations re-read 2026-08-27 and both are still at the lines given, and both are still wrong
  in the way described. The bible's line numbers below `:76` have drifted ~5 lines since this file was
  written and the T-7, T-9, T-10 and T-21 citations are corrected for it; these two had not moved.)*

### T-9 · Close the raid list at one
**Status:** DONE · **Hank:** *"Close the raid list at one."*

Recorded in both canonical docs: `docs/build-doc.md:268` (§7.5) and `docs/content-bible.md:257`.
**"Do not author a second raid.** A per-act raid tier is a content proposal for Hank, not a row an
agent adds."

### T-10 · Starter lifespan — correct the bible, halve the age effect
**Status:** DONE · **Hank:** *"correct the bible sentence, then reduce the age buff/nerf to have half
the effect it currently does."*

- Bible sentence corrected (`docs/content-bible.md:78`): the final form arrives in the elder year,
  which is the calendar's business, and the league is on the act clock — *"the two do not meet"*.
- `age.multiplier` **0.75 / 1.0 / 1.15 → 0.875 / 1.0 / 1.075** — half the *deviation from neutral*,
  which is what "half the effect" means; A is the neutral, so A did not move. `metamorphicJump` 1.15
  and `heirLevelFactor` 0.5 untouched, per the ruling — neither is an unfinished half of it. The
  arithmetic is logged in a new `age._multiplier` key beside the values.
- **The canonical L9 row carried the old curve until now.** `docs/build-doc.md:47` and §7.4's
  effective-stat line still read `×0.75/1.0/1.15`, and `core/lifecycle.ts`'s header restated it;
  all three now name `balance.age.multiplier` as the rule and mark the figures as shipped values.
  Copies that remain wrong are listed at the end of this ticket.
- **No pinned table needed re-deriving and none was loosened**: `tests/unit/lifecycle.test.ts` reads
  `balance.age.multiplier[age]` symbolically, so it tracked the retune (119 pass). The one prose
  comment that still quoted the old triple (`tests/unit/lifecycle.test.ts:1646`) has been corrected —
  T-25 item 3, DONE.
- ✅ **The four copies of the OLD curve are now ZERO — closed 2026-08-27, verified by re-reading each
  line and then by a repo-wide grep.** `×0.75` does not appear in `core/`, `game/`, `data/` or `docs/`
  at all. Each was fixed the way T-25 item 2 established — **name the balance key, refuse to name the
  number**:
  - `docs/content-bible.md:51` now reads *"Age multiplier: Juvenile penalty · Adult neutral · Elder
    bonus. The **shape** is the content"* — the sentence every other copy cited.
  - `core/lifecycle.ts:350` — the `ageMultiplier()` docblock now says *"a Juvenile penalty, a neutral
    Adult, an Elder bonus … the three numbers are `balance.age.multiplier` and are a retune away, so
    they are READ here and never restated."*
  - `core/lifecycle.ts` — the `curHp`-rescale comment keeps its argument and drops the triple; the
    surviving `×1.15` there is `metamorphicJump`, which is correct and was never in scope.
  - `data/gyms.json:5` `_levels` now reads *"an Elder — the bonus is `balance.age.multiplier.E`,
    ×1.075 today"*.
  Genuinely historical mentions are NOT in this list and must not be "corrected":
  `data/balance.json` `age._multiplier`, `tests/unit/battle.test.ts:154/185/212`,
  `tests/unit/catch.test.ts:331`, `tests/unit/lifecycle.test.ts:1648`,
  `tests/property/lifecycle.test.ts:634` and `:681` (a deliberate inversion), and both
  `fixtures/battle-scripts/*.json` `_reRecordedForT10T11` notes all record the before/after on
  purpose. Every surviving `×1.15` that names `metamorphicJump` is also correct and untouched.
- ⚠ **This retune moved the gyms.** See T-13.

### T-11 · The three weakest creatures
**Status:** DONE — **downstream pinned tables still being re-derived** · **Hank:** *"log the
arithmetic, re-spend the Producer template only, and leave Carricrow alone"*

1. ✅ **Arithmetic logged**, in `data/species.json`'s new `_bandArithmetic` key beside the templates
   rather than in a doc: the closed tournament pins the mean at 50% by construction, the ±15 band
   therefore measures **spread, not health**, stat total vs peer win rate is `r = 0.000`, an 18-template
   sweep never got below 8 out of 24, *"expect 8–10 and stop."*
2. ✅ **Producer template only, re-spent** `85/40/80/35/60 → 85/60/80/35/40` — zero-sum atk +20 /
   ins −20, total still exactly 300, Scavenger untouched. Measured at 64 seeds per ordered pair:
   Loamunder **26.7% → 50.7%**, Sporantle **12.9% → 37.9%**, both into band; **8 of 24** outside.
   The cost is recorded, not hidden: Loamunder is 47.8% of Route 1's encounter weight, and a level-5
   adult starter's loss rate against one went 6.5% → 38.0%.
3. ✅ **Carricrow left alone**, byte-identical to HEAD. Its 5.0% is the closed tournament doing
   arithmetic, not a regression.

**Outstanding:** the pinned tables downstream of base stats — `tests/unit/battle.test.ts`,
`catch.test.ts`, `battle-view.test.ts` fixture replays, `transcription.test.ts` `_statRule` — several
of which carry the **old** Producer numbers as hand-typed literals. **Re-derive them. Do not loosen
them** (G14).

---

## Systems

### T-12 · Close the progression loop, and give money a purpose
**Status:** DONE — **all four clauses. Clause 4, the money, landed 2026-08-27 with an earner, a sink
and a shop; a short list of dead tunables survives it and is named at the foot of clause 4.**
· **Hank:** *"Close the loop, Health persists, plus an explicit penalty. Set up the new items to be
sold in towns, giving a purpose for the money."*

**✅ Clause 1 — health, experience and items persist across battles.** `applyBattleResult`
(`game/wild-battle.ts:503`) is the first statement of all four finish handlers
— **four call sites, which `grep -n 'applyBattleResult' game/scenes/OverworldScene.ts` returns and
this file no longer lists by line, because all four had drifted by the next pass** — and
`applyBattleAftermath`
(`core/save.ts:579`) is the one writer of `curHp`, level, xp and the bag outside creation and the year
turn. XP carries **in** as well as out (T-30). The fainted-party guards are no longer a dead end,
because T-29 gives them a way out.

**✅ The explicit penalty exists — but as the BLACKOUT's five ticks, and that is a reading.**
`core/recovery.ts`'s header and `restAtInn`'s docblock both argue in prose that the wipe cost
*is* the penalty this ticket asks for. It is a defensible reading and it is marked as one: **it prices
a wipe, not a loss that leaves something standing.** Whether clause 3 wants more than that is open.

**✅ Clause 2 — the inn heals what it charges for. LANDED 2026-08-27.** ⚠ **This clause read `❌` and
said the opposite until now; it is corrected, not rephrased.** `restAtInn` is `innRestFor` →
`applyInnRest` → `spendTicks`, in that order — **consequence before price**, so the heal is on the
save before a year turn the charge triggers, or a save write, or the HUD can read it.

**The reader count is ONE and always was; what changed is who reaches it.** This clause used to say
`balance.medicine.innRestFullHeal`'s *"only reader is the blackout's wake"*, which welded two claims
together. Re-measured: the flag is branched on in exactly one place in the repo — `restoredUids` in
`core/recovery.ts` — and that is still true. It now has **two callers**: `blackoutRecoveryFor` and
`innRestFor`. **The selection was REUSED, not re-spelled**, and that was the load-bearing call: the
docblock over `restoredUids` already said it answers *"what an inn rest does"*, so the inn asks the
function that already knew the answer, and a test asserts both paths produce byte-identical parties
so a private copy cannot creep in later.

**The heal rides as its own absolute tape entry rather than being derived from the `{t:"inn"}` price
beside it, and the reason is concrete rather than doctrinal:** `BLACKOUT_COST` levies two `{t:"inn"}`
entries of its own, so a price-derived heal would fire on those too and restore a blackout three
times, by two rules that disagree the moment the flag is retuned.

**The `innCost` charge is deliberately still OFF**, and the reason has CHANGED without the state
changing. It used to be the ordering problem — with no earner anywhere in the repo, switching it on
made the inn unpayable forever and re-created the blockable run T-29 removed. **That hazard is gone:
the earner landed first**, exactly as the ordering asked. What holds the charge off now is the
owner's own ruling on the key: ***"innCost is already paid through ticks."*** **A rest costs
`clock.innTicks` and no coin, and the 40 is the second half of a price that is mostly time.**

**THE REST NOW REPLAYS.** The heal was minted onto the tape as `{t:"innRest"}` and `replay()` had no
arm for it, so live the party healed and on replay it stayed hurt — **L10 was false for any run that
rested.** `core/save.ts:1266` is the named `case`, and it calls **`restoreParty`**, the live path's own
applier (`core/save.ts:818`), rather than restating the heal. The rest's **tape** half moved out of
`core/recovery.ts` into `core/save.ts` — `core/recovery.ts:522` re-exports the four names — which
enacts the ownership rule that module's own header at `:38-42` already stated: **`save.ts` owns the
TAPE, `recovery.ts` owns the DECISIONS.** Note `{t:"inn"}` is a *different* entry, the price, and
correctly has no arm. Because `replay()` still has **zero production callers**, this was a broken
invariant rather than a live player-facing fault — which is what let it survive, and is the argument
for T-53/T-54/T-55 auditing the union instead of waiting for the next symptom.

### Two decisions recorded on the inn, because both are the kind someone later "simplifies"

**These are readings, not Hank's sentences.** Marked as such deliberately, on this queue's own standing
rule — the owner ruled on the wipe and its price, not on where `[R]` may be pressed.

1. **`[R]` NOW ASKS WHERE THE PLAYER IS STANDING, AND THE PREMISE IT RESTORES IS ONE THIS QUEUE HAD
   ALREADY PRICED AGAINST.** It previously healed the whole party **anywhere in the region** — on
   routes, and inside the general store — for `innTicks` = 2. `restRefusal`
   (`game/scenes/OverworldScene.ts:2044-2054`) is the guard, called before anything is spent at
   `:2060`, and **the HUD reads the same function** at `:3302`, so what is advertised and what happens
   have one reader. ⚠ **This matters to T-29's arithmetic, not just to tidiness:** `core/recovery.ts`
   argues the blackout's `2 × innTicks + travelTicks` against a rest available *"only for a player
   STANDING IN A TOWN"*, and while `[R]` worked everywhere that premise was false — so the owner's
   ruling had been priced against a baseline the code did not implement.

2. **`[R]` REFUSES INDOORS *EXCEPT* IN THE TOWN'S OWN INN — a blanket indoor refusal was briefed and
   would have been WRONG.** `data/interiors/hearthollow-inn.json:38-46` ships a `service` anchor whose
   `_purpose` reads, verbatim: *"The tile the player stands on to trigger the rest service — the full
   heal that costs inn ticks."* **The room is authored to be rested in**; refusing there would have
   made a shipped anchor unreachable and would have been caught, if at all, by a reachability gate
   rather than by the change that caused it.

   **Which room counts as the inn is read from CONTENT, never from an id.** The exception turns on
   `inside.anchors.some(a => a.kind === "speaker" && a.target === keeper)` where
   `keeper = innkeeperAt(townId)` (`core/recovery.ts:181-187`) scans `DIALOGUE.speakers` for
   `role === "innkeeper" && home === nodeId`; the node-level list is `innNodeIds()`
   (`core/recovery.ts:148`), the intersection of innkeeper-homed speakers with a `service` beat at that
   node. **There is no second list and no hardcoded room name** — `hearthollow-supply` fails the test
   for the right reason, which is that no innkeeper stands in it.

   **Three tests pin the choice and it reverts by deleting one branch** — the `theirs` computation at
   `OverworldScene.ts:2049-2052`. Two are the §17.3 per-room case expanded over the four shipped
   interiors (`hearthollow-inn` and `brackwater-inn`: *"[R] works in the room the town's innkeeper
   stands in, and nowhere else indoors"*), and the third is §17.5's *"resting in the inn across the
   year boundary leaves the HUD describing the ROOM"*, which presses `[R]` indoors to cross the year
   turn. A blanket refusal reds all three.

**Two defects fixed in the same commit, recorded so neither is re-found:** the blackout could stack a
dialogue on top of a year turn — now guarded at `OverworldScene.ts:2212-2215`, in `handOffToBattle`'s
exact shape, placed **after** the charges so the price and the move still stand and the cue stays owed;
and `yearBegin` overwrote a room's provenance line with the town's map note — it now ends
`this.lastNote = this.viewNote()` (`:2814-2821`), and `viewNote()` (`:846-856`) returns the interior's
line when the player is inside one.

**✅ Clause 4 — items sold in the town shops. LANDED, and the ordering problem it always carried was
solved by putting the earner first.** ⚠ **This clause read ❌ with "no earner, no spender" for three
passes; it is corrected, not rephrased.** Every number below is Hank's and every derivation lives
beside the key in `data/balance.json` rather than here, so this ticket cannot drift from it.

- **The earner.** A won **rival** fight pays `trainerPayoutFlat` **100** + `trainerPayoutPerLevel`
  **3** × the summed levels the loser fielded — six purses of **136 / 208 / 262 / 388 / 460 / 640**.
  **Hank:** *"Make it so that earnings don't scale quite as much. I think it's a hallmark of Pokemon
  games that you eventually have way too much money at some point, but that point shouldn't be until
  probably Act 5."* The flat half is what does that: a purely per-level purse reproduces the rosters'
  own 15× spread at **any** rate; the flat fee compresses it to 4.7×. **An empty roster pays nothing**,
  which is a guard rather than arithmetic.
- **The sink.** A four-row town shop — base snare, weighted snare, salve, tonic — **every price 3**,
  weighted gated on the second gym's badge, master deliberately unsold. **Hank ruled twice and the
  second ruling is the one the number obeys:** *"the other prices can all be the same, just for
  simplicity… a player should be able to buy 40 of those items total in a year"*, then, shown that a
  mean-anchored 25 bought five items in act 1 against eighty-six in act 6, *"Make it so that the
  expected earnings in year one specifically can buy 40."* **The anchor is year one.** 3 rather than
  3.6 because money is an integer on the tape and both `readPayout` and `applyPayout` refuse a
  fraction outright — a fraction the live path accepts and the replay arm declines to rebuild is L10
  going silently false, the exact `{t:"innRest"}` shape.
- ⚠ **The consequence was accepted knowingly and must not be re-raised as a defect.** Income is not
  uniform: act 1 affords 48 items and act 6 affords 720. **Money is tight only in year one and
  effectively unlimited from act 3 on.** No flat price avoids it — the price buying exactly 40 in each
  act runs 3.6, 10.8, 16.2, 28.8, 36 and 54.
- **`innCost` stays 40 and stays unread, deliberately.** **Hank:** *"innCost is already paid through
  ticks."* It is *"the second half of a price that is mostly time"* and is **not** one of the flat
  prices. **Do not "correct" it to match the others**, and do not switch it on as tidiness.
- **Both content gates moved out of code and into data**, and the reason bites: **zod strips keys the
  schema does not declare**, so adding a key to `data/balance.json` alone reaches no reader — the move
  needed `data/balance.json`, `core/types.ts` and `core/schemas.ts` together. **Hank:** *"Weighted
  Snares unlocked in the shop after the second gym is completed… the player be given three master
  snares at the completion of the fifth gym."* Both are wired and both fire.

⚠ **WHAT IS STILL OPEN UNDER THIS CLAUSE, and it is short.** `innCost` and all three `baitPrice` rows
have **zero readers** in `core/`, `game/` or `tools/`. **No bait row can exist in the shop as built** —
`baitPrice` is keyed by `BaitMatch`, not by a bag key, so it names nothing the bag can hold, and Kett's
own lines describe a crate the player cannot buy from (**T-67**). And **quests pay nothing**, which is
half of what bible §11 says currency comes from — recorded in STATUS's *waiting on the owner* register
together with whether a gym win pays at all.

⚠ **The escalation this clause acquired is DISCHARGED and the paragraph is corrected rather than
deleted.** It read: *"nothing in the game can be caught, so build-doc §1 beat 1 and §15's I1 and I2
are all unplayable."* **Catching was never blocked — it was unmetered** — and the snares now land
besides (T-60). **The ordering worry is also discharged**: the earner shipped before the sink, so a
priced inn no longer risks a run that blocks, and turning `innCost` on is a design question rather
than a hazard.

⚠ **The urgency this ticket carried is DISCHARGED, and the paragraph that carried it is corrected
rather than deleted, because the reasoning is what justified the fix.** It read: with damage
persisting and the inn inert, a damaged-but-not-wiped party's only out-of-battle heal was to get
wiped — the recovery had become the *cheapest route to full HP*, which is not what a rest at an inn
is for. **That is no longer true**, and the two prices no longer compete at all: `innTicks` buys a
night where you already are, and the blackout's extra `innTicks + travelTicks` buys the second night
and the CARRY, which is the half a wiped player cannot perform for themselves. A wipe happens
mid-fight on a route with no inn to walk to, so the inn is never the cheaper way out of one.

**Do this before any further gym retune** — every published win rate still comes from a harness player
model that never levels.

### T-13 · Fix the gym measuring instrument
**Status:** DONE — **and the result is now Hank's** · **Hank:** *"Fix the instrument"*

Both defects fixed:
1. `tools/harness/player.ts:338` now scores coverage through the policy's own `bestMoveId` with the
   verbatim options `reasonablePolicy` uses (`COVERAGE_SCORING`, `player.ts:255`), instead of asking
   whether the creature merely *knows* an effective move. Real ages and traits are threaded in.
2. `tools/harness/player.ts:215` headlines a leader at the cap when its ace sits on the cap, written
   as a property of the cap rather than of a named gym.

**Three numbers in this ticket's own text turned out to be wrong, and are recorded as wrong rather
than replaced quietly:**
- "Greaves … 46%, inside the 45–65% band" — **never true.** Measured 44.2% at the cap on the
  pre-T-10 tree (−0.8 pp under). After T-10's halving landed, **65.8% — out of band HIGH.** The sign
  flipped.
- "Gym 1 … 93.4%, inside its 80–95% target" — **not true on either tree measured.** 96.8% before
  T-10, **98.6%** after.
- "Fixing the ruler moved 1 of 6 gyms in band to 4 of 6" — now **3 of 6** at the party size the game
  allows (Odo, Vesper, Sable in band; Maribel +3.6, Noct +9.8, Greaves +0.8 over). Full table in
  `docs/STATUS.md`.

**Nothing was tuned.** The ruling stands: *"Do not lower Greaves's levels as part of this ticket — if
46% still feels wrong afterward, that is a separate, deliberate call."* **That call is now due, and
is Hank's** — it is in `docs/STATUS.md` under "Waiting on the owner". Note T-12's warning first:
every one of these rates comes from a player model that never levels.

### T-14 · Seed guardrails, and the over-catch fixture
**Status:** TODO — **needs Hank's design input, see below. Re-verified 22:01: still not randomised.**

**What a seed is here.** `save.seed` is the single 32-bit master seed for a whole run, set once at
new game. Every random draw derives from it: `subsystemRng(save.seed, tag)` hashes the seed with a
subsystem tag (`"battle"`, `"sim"`, `"encounter"`, `"lifecycle"` — from `balance.rng.subsystemTags`)
into an independent xorshift128 stream, so the battle stream cannot desynchronise the sim stream. It
is the determinism root, **not** the raid: the Cullbrand raid is authored content in
`balance.yearEvents.raids`, act-gated and not random.

**It is not currently randomised at all.** `game/boot.ts:343` returns `balance.rng.defaultSeed` —
**1337** — unless a `?seed=N` URL parameter parses as a safe integer. So every new game today gets
the same region. Hank asked to "put some guardrails on what range the seed can fall in"; the prior
question is whether to randomise it at all, and over what set.

**Flag this tension before implementing.** Restricting the seed set to values where the cascade beat
is legible would be selecting for an outcome — which sits against guardrail G6 and against Hank's own
T-2 ruling that biomes should not have outcomes forced on them. Randomising freely is consistent with
both. Put that choice to him rather than picking.

The over-catch fixture (`fixtures/overcatch-script.json`, seed 12) is not reproducible in real play
on its current seed; the beat holds on a majority of low seeds. **It now interacts with T-1's open
decision directly**: measured at the shipped costs across the fixture's own 24 seeds, the scripted
cascade runs min 30 / mean 49.2 / max 85.5 ticks and **9 of 24 seeds exceed the 52-tick year**.
`runCascade` never advances the clock, so `tests/integration/demo-beats.test.ts` cannot see this.

---

## Art and spend

**Billing has started.** The Art-and-spend preamble used to say nothing had been billed; that is now
false. Trial PNGs exist under `assets/raw/_trials/` across **nine trial specs** now in
`tools/comfy/trials/`, generated through the supervised trial runner. `.gitignore:8` excludes
`assets/raw/**`, so **no commit records any of them.** `tools/comfy/manifest.json` is
`{pending: 287, approved: 1}` of 288 rows. Every rename and every palette swap is still cheap and
becomes expensive after the first real batch.

**What an image costs is now measured, and the scarcity framing this section used to carry was
wrong.** `tools/comfy/manifest.json:9` reads `perImageCredits: 1.12` — dashboard 4,147 → 4,127 across
18 images at 1024² (T-26). **The entire 288-row manifest therefore costs roughly 323 credits against
a 4,081 balance — about 8%.** Nothing in this project is budget-constrained by image count. Wherever
a doc, a comment or a ticket argues from image scarcity, it is arguing from a figure nobody had.

Two things that survive the correction:
- **1.12 is the 1024² figure specifically.** A later mixed batch including 256² health probes read
  near **0.53**. Cost scales with pixels, so a per-image number is only meaningful beside its size.
- **G13 still binds, as a *review* discipline and not a budget one.** No batch of 20 or more images
  without Hank's explicit `--confirm`, and the pre-batch estimate is a *measured* per-image figure or
  the runner says "never measured". The gate is there so twenty images are looked at before they are
  made, which is a reason that never depended on the price.

### T-15 · Swap the palette to the class-equal fit
**Status:** DONE — **two consequences are unrepaired, see T-24** · **Hank:** *"class-equal"*

`data/palette.json` swapped: **all 32 hex values changed**, positional contract intact (ids `c00`–`c31`,
`colorCount` 32, `frozen` true), `frozenAt` now `2026-08-26`, `_method.weighting` `equal` →
`class-equal`. `tools/comfy/manifest-palette.json` and `manifest-b0.json` re-synced their
`colorsSha256` to `51a95b06…`, which is also the sha of the live palette — proof the candidate was
promoted.

**The lesson this ticket paid for, recorded so the next re-freeze does not repeat it: a palette id is
a SLOT, not a colour.** `c18` went from `#f7ebd3` (cream, 17.543:1 against void) to `#37630f` (dark
green, 2.891:1; 1.078:1 against the new panel). Fifteen of nineteen `UI_SWATCH` roles had to be
re-pointed, and `menu-model.ts` and `survey-view.ts` with them. Anything that stores a slot id and
assumes a colour breaks silently.

### T-16 · Creature sprites — run the real experiment
**Status:** TODO · **Hank:** *"A. Run a real experiment"*

All 150 creature sprites derive from one shared prompt sentence, and the trials come back as the same
upright chibi biped whatever the description says — the Water starter renders as a pale-cyan bipedal
turtle with blush cheeks.

Run **one creature, one fixed seed, three prompt variants**, to isolate whether the pose lever or the
negative prompt causes it. Add the **Water starter's front view as a fourth image**, so the
does-this-read-as-someone-else's-design question gets answered by the same spend. 4 images total.

Free fix riding along: one creature ("Pyrelisk") has no body described anywhere beyond "vent
basilisk", so its 8 rows would each roll a different anatomy — pin one shared seed across them.

Changing the shared prompt sentence is a build-doc §9.2 amendment, not an agent edit — bring the
result back before editing it.

**`tools/comfy/trial.ts` now exists** and is the right vehicle: it holds graph and seed constant,
varies one authored string, caps a trial at 20 rows for G13, and refuses to write `manifest.json`.

### T-17 · Town map — fix scale, and **top-down** (AMENDED)
**Status:** IN PROGRESS — **the projection is amended; the map lane re-authors against it**
· **Hank, originally:** *"fix scale, keep isometric"*
· **Hank, amending 2026-08-27:** *"I was actually trying to match Gold when I said isometric, but if
Gold is actually top down, then let's do top down."*

✅ **HOW the re-author happens is RULED, and this paragraph said it was open.** ⚠ **It read *"an OPEN
QUESTION IN FRONT OF THE OWNER… it is in `docs/STATUS.md`'s waiting on the owner register with its
figures, and it is not work on this queue"*, and both halves are now false.** The maps are **composed
by stamping tiles from a 64×64 ASCII layout**, on Hank's own ruling — quoted in the preamble above and
in `docs/STATUS.md`, alongside his first-hand *"I override the build doc!"*; **`docs/build-doc.md` L7
and G1 have since been amended to match (`f81f8d3`, T-71).** The composer, `verify.py` and a 157-tile shipping set are
**committed** at `tools/mapgen/compose/`; the *"the composer is untracked and one `git clean -xfd`
from gone"* warning that stood here was correct, did its job, and is discharged.
⛔ **AND THE PALETTE ARGUMENT THIS PARAGRAPH MADE IS STRUCK, NOT JUST UPDATED.** It said *"the palette
argument for it is strong — a tiled composition is on-palette by construction where raw generator
output runs into the hundreds of thousands of colours."* **The second clause compares the wrong
corpus.** Decoded this pass, the nine shipped **generated** maps read 17–32 distinct colours at **zero
off-palette pixels each** — they pass the palette gate and always did; the hundreds of thousands is
*raw pre-postprocess* output, which is not what ships. **The real argument is geometric**, and
`af82c46`'s own commit message measured it on a controlled axis: *"Prompting owns STYLE; it cannot own
GEOMETRY… Composition did not move at all — the skeleton stated an explicit size ceiling and got
buildings ~14× it, and Hearthollow drew 4 edge exits where its adjacency allows 1."*
**What the re-author still owes is in T-73**, and it is most of the work: nine of the twelve nodes paint
from the wrong biome's materials, and none of the authored buildings is drawn on any node.

**This is an amendment, and the reason is the point of it. The ruling was not wrong — the word was.**
He named the projection he wanted by naming the game he wanted to look like; Gold is top-down, so
"isometric" was a mis-transcription of an intent that never changed. Recorded this way on purpose: a
silent swap to "top-down" would leave the next reader believing the isometric call had been a
mistake, and it was not one. **The target was always Gold.**

**Three of the nine map rejects retire at the root.** Each was isometry failing to render vertical
levels, and top-down cannot produce the failure:
- **Bowerdeep** — came back a floating diorama island with a Minecraft-style earth cross-section
  filling the lower half of the frame, 13.6% pure-white background, zero of the two required edge
  exits (transcribed in `tools/comfy/manifest.json`'s `bowerdeep` `featureSource`).
- **Cindershelf** — came back a **side-on mine cutaway**: three shelves stacked in the picture plane,
  every building in flat front elevation, no ground plane anywhere (same field, `cindershelf` row).
- **Sanctum** — came back a diorama on a plinth.

**`r5`'s blocking defect inverts.** It was flagged for coming back **flat top-down**. That is now the
correct output, not the defect.

**Colour discipline is part of this re-author, not a separate pass — and it inverts the obvious
intuition.** Measured at true native resolution: the eight Gen 2 captures run **12 to 18 distinct
opaque colours, mean 16.0**; the two Gen 3 RSE captures run **49**, which is a second reason not to
mix the two as style sources beyond the projection. The ten shipped maps, measured the same way, run
**17 to 32, mean 27.0** — r2 uses all 32 of the frozen palette, brackwater 31, and only
sanctum-approach at 17 is inside the Gold band. Hank's verdict on these maps was *"this looks like it
was made in MS Paint"*, and **this is most of the explanation: too many colours, not too few.**

**It does not contradict the palette expansion, and must not be read as contradicting it.** A palette
*contains* a region; a single map *uses* a subset — **48 available and 16 used is correct; 48
available and 31 used is the bug.** Locked into build-doc §8.4 so the two facts cannot be set against
each other later.

**And colour is only half of it — the other half is GROUND TEXTURE, and it is the half that has
actually been shipping wrong.** **Gold never uses a flat fill anywhere**: grass is a dense
checkerboard between two greens, paths a fine dot pattern, tree masses a repeating weave, and the
texture is in the **ground**, not the objects — a 32×32 tile of plain New Bark grass with seven
colours and no keylines carries **43.59%** of the whole map's **47.51%** on its own, against **8.83%**
for our best output. ⚠ **Those three figures are WITHDRAWN** — see the note at the end of
this ticket, and STATUS's withdrawal register. ⚠ **The `seven colours` is affected separately and
differently**: it is a colour COUNT, and counts do not fall with the edge operator — but it sits
inside the **6-9 colours** band once quoted for Gold's open ground, and **that band is withdrawn**,
having come from an inherited five patch coordinates that proved four-fifths trees, ledges and
fences. Hand-picked open ground reads **3-4 colours**. Whether this tile is one of the contaminated
patches is **OPEN**: recorded, not resolved. See `tools/artverify/ground-comparison.png`; it is the
one artefact here that a number cannot substitute for, **and with the figures struck it is what the
finding rests on** — it is untouched, being a picture rather than a percentage. **Work the two facts separately, because a combined sentence gets
half-implemented:**

- **A — ordered dither buys EDGE DENSITY.** It does nothing to the colour count.
- **B — a per-map colour subset buys COLOUR DISCIPLINE.** It does nothing to edge density.

Measured, each disproving the other's sufficiency: dither at amplitude 45 without the subset →
**40.02% in 43 colours**; the subset without dither → **16 colours at 12.88%**; both together →
**44.74% in 16**, against Gold's 47.51% in 17. ⚠ **All four EDGE figures there — `40.02`, `12.88`,
`44.74` and Gold's `47.51` — are withdrawn.** They are one instrument's output, so this is a single
withdrawal, not a baseline plus survivors. **The COLOUR counts — 43, 16, 16, 17 — are a different
property and stand**, and the split falls unevenly across the argument: **A's disproof of B stands on
counts alone** (dither at amplitude 45 left **43 colours**, so texture work plainly does not fix the
count), while **B's disproof of A rests entirely on the withdrawn edge readings** — that the subset
alone stayed flat is a texture claim with no publishable measurement under it right now. *How close
to Gold this got* rests on the withdrawn baseline and is not quotable at all. **Keep the two facts
split regardless**; what is gone is the measurement of one half, not the reason for splitting them.

**And the dither is SOURCE-DEPENDENT, so treat it as a fragility, not a settled recipe.** A ±22
ordered bias crosses a palette boundary only where the ground colour already sits near one, so the
same amplitude transforms one source and leaves another flat: through the same postprocess, on one
operator, today's baseline input read **6.89%** ground edge and a c64-LoRA input read **54.84%**
(Gold **60.10%** the same way). ⚠ **All three are output of the withdrawn threshold-25 operator, so
this claim is now a mechanism with no measurement under it.** The mechanism — a ±22 bias only crosses
a boundary where the source colour already sits near one — is an argument about quantization and
survives; that source-dependence was *observed*, and the size of the gap, do not. Carry it as an
untested expectation, not as a measured fact.

⚠ **And that triple is the whole evidential basis of the LoRA argument, so state the consequence
exactly and overstate it in neither direction:** **the evidence for the LoRA conclusion is
WITHDRAWN, pending re-derivation with a published operator. This is NOT a reversal of the
conclusion** — the direction may well survive re-measurement, and the owning lane is explicit that
they are not claiming the LoRA lost, only that the evidence for it winning is currently withdrawn.
**Nothing downstream may treat "baseline 6.89%, c64-LoRA 54.84%, Gold 60.10%" as measured evidence
until it is re-derived.** The LoRA question already sits in STATUS's *waiting on the owner* register;
it is now waiting on a re-measurement as well as on a ruling.

An amplitude that works is a property of the **pair**
`(source, amplitude)`, so do not carry one number into the re-author as *what the dither buys*.

**Both readings are reported and NEITHER is capped**, by `tests/gates/asset-palette-contract.test.ts`'s
advisory, for the reasons recorded at their thresholds. A colour cap at or above `palette.length`
cannot fail at all, and a cap below it is taste with a number painted on it. A texture cap is worse:
the response to dither amplitude was measured as near-linear (0 → 12.88, 24 → 24.09, 40 → 40.02,
56 → 63.77), so a generator can be tuned to any figure named — and applied globally the dither
speckles roofs and walls, so **a map that reached 47% by ruining its buildings would pass a hard
assertion.** That is the ControlNet-0.9 failure exactly, and the gate refuses to invite it twice.
⚠ **The amplitude ladder is withdrawn too — same threshold-25 operator — and it is worth saying
plainly rather than quietly: the ladder is the argument FOR the withdrawal and is itself withdrawn
by it.** The demonstration that an edge figure can be tuned to whatever you name was made with an
instrument nobody can re-run. Near-linearity is now an expectation, not a measurement. **The decision
not to cap is unchanged and never rested on the ladder** — the colour-cap arithmetic and the
ControlNet-0.9 episode are untouched — and it gains a reason: a threshold set from an unpublishable
instrument is this failure over again.

**Multi-level towns are back ON**, at Hank's own suggestion and referenced to Ruby/Sapphire:
elevation expressed **top-down** through cliff bands, ledges, stairs and ladders rather than through a
projected vertical axis. **Fortree City is structurally Bowerdeep; Lavaridge Town is structurally
Cindershelf** — both reference maps are on disk at `assets/reference/gen3/`.
⚠ This also amends the earlier single-level ruling (*"Re-author those two towns at a single level."*),
which was made because the model rendered vertical stacking **as a cross-section under isometry**.
Top-down + cliff bands is a different mechanism, so the constraint that forced it is gone. Both
`featureSource` strings in `tools/comfy/manifest.json` still argue "ONE LEVEL" from the isometric
premise and from *"Isometry stays — T-17 is 'fix scale, keep isometric'"*; **that is now stale text in
a file the map lane owns.**

**This ticket's own text was stale and is corrected here.** It claimed four rounds and 24 PNGs; there
are **nine** trial specs in `tools/comfy/trials/`. More to the point, it implied the projection
question had been put and answered. It had not: the `map-isometric` round — six rows, `x1`–`x6`,
isolating the scale clause, a flat control at the same seed, a second biome, a route and the Sanctum
— **returned six all-black frames.** Measured: every PNG in `assets/raw/_trials/map-isometric/` is
1024×1024 with mean and max `[0,0,0]` on every channel. **The round was well-specified and answered
neither axis. It returned nothing.** Do not cite it as evidence for or against anything.

See also the Closed table below on `MAP-PROMPT-RULES.md` R2: the negative prompt's inertness is a
property of **cfg 1.0**, not of the pipeline, and R2 stands as a decision regardless.

**The recurring dark band across the bottom edge has a cause, and it is the highest-value fix
available on this ticket. It is the skeleton's own cliff-step clause being obeyed literally.** It was
called a *cutaway strip* for hours and read as a projection failure; it is not one. **Hearthollow is a
flat meadow hamlet with no elevation**, so the model has nowhere to put the step the clause asks for
and puts it at the frame. **Deleting the clause removes the band.** The shape of the fix is that the
clause belongs **only on nodes that actually have elevation** — but **the map lane owns the prompt
files, so this is recorded and not prescribed**, and nothing under `tools/comfy/` was touched from
here. Note it is **LoRA-free**: it is available regardless of how the LoRA question in STATUS's
*waiting on the owner* register is ruled.

**The negations hypothesis is cleanly DISPROVEN — do not re-raise it.** The theory was that the band
came from negated phrasing in the prompt. All **six** negated phrases were rewritten as affirmations;
**the band survived, and a second band appeared at the top.** A disproof, not a plausible story, and
not a weakened hypothesis.

⚠ **The withdrawal this ticket's texture figures are marked against — and it is on the OPERATOR, not
on an enumerated set of numbers.** State the scope rule first, because a list invites *"is my figure
on the list?"* when the only question that decides it is **"was it made with that instrument?"**:
**every figure produced by the unpublished luminance neighbour-difference operator at threshold 25 is
withdrawn, wherever it appears.** The operator was never published, and a second lane could not
reproduce its headline figure at any threshold. **The set as it stands is an inventory, not a
boundary:** `47.51` · `43.59` · `8.83` · `44.74` · the amplitude ladder (`12.88` · `24.09` · `40.02`
· `63.77`) · `6.89` · `54.84` · `60.10`.

Gold's **`47.51%`** whole-map edge density is the headline. Cited in this ticket, in
`docs/build-doc.md` §8.4 and in `docs/STATUS.md`, it **cannot be reproduced**: an independent
re-measurement of the **same eight `assets/reference/gen2/` captures** reads **50.4–78.8% at 1:1
native** and **30.3–51.5% density-matched at 2×**, and **no threshold reproduces 47.51.** Its author
withdrew it **pending republication with the operator attached**, and it is marked rather than
deleted on this queue's standing practice — a withdrawn claim is recorded, because it may be
republished and turn out fine. **Not disproved; not evidence either.**

**Two consequences that are easy to under-read.** ⚠ **The whole-map / ground-region argument
(`44.74` against `6.89`) keeps its point and loses its numbers**: a whole-map aggregate cannot stand
in for a ground measurement, because objects are keyline-dense and carry the figure upward. That
reasoning is still sound; the six-fold gap is no longer quotable as a measurement of it. ⚠ **The
LoRA argument is inside the withdrawal**, and the consequence is recorded at the source-dependence
paragraph above: the evidence for the LoRA conclusion is WITHDRAWN pending re-derivation with a
published operator; that is **not** a reversal of the conclusion.

**What the re-author must NOT drop, because it survived re-measurement:** COLOUR COUNTS are a
different property and do not fall with the edge operator — the **colour** half of this ticket, Gold
at **12 to 18 distinct opaque colours, mean 16.0** against the shipped ten at 17–32, **reproduces
exactly**, as do the 16 / 17 / 43 counts quoted above; **28.2** — Gold's own two grass greens
differing by 28.2 luminance — is a colour difference between reference pixels rather than an edge
density, and it reproduces; and the palette gate's own band constants
`GOLD_EDGE_LOW / HIGH / MEAN` = **51.0 / 78.7 / 64.2** are computed by its own, published, operator
over the same PNGs. **The general rule is in build-doc §16: an edge-density percentage means nothing
without its definition** — threshold, channels, neighbours, denominator.
⛔ **AND A SECOND RULE, LEARNED FROM `28.2` ITSELF: A FIGURE MEASURED FOR ONE JOB IS NOT A TARGET FOR
ANOTHER.** `28.2` is sound as the separation between Gold's two grass greens, and it was reused as the
bar for telling a **walkable** material from a **blocking** one, where it is wrong by about a factor of
2.5. Gold spends **26.76** on the encounter marker (tall grass against plain ground — both walkable)
and **41.29 to 68.04** on walkable against blocking. **The floor for a walkable/blocking pair is 41,
not the twenties.** `docs/STATUS.md` item 53 carries the table, the Rec.601 definition and an
independent re-measurement; T-72 and T-73 are the tickets it binds.
`tools/artverify/EVAL-STANDARD.md` has since been marked by the lane that owns it; the figures there
now carry `[WITHDRAWN]` in place.

⚠ **A live tension beside it, RECORDED AND NOT RESOLVED — do not pick a winner.**
`tools/artverify/EVAL-STANDARD.md` §2's table reads Gold new-bark ground at **8 distinct colours,
48.7% alternation**; a new hand-picked measurement of the same subject reads **3-4 colours at
56.5–78.2%**. **The §2 row's patch coordinate was never written down**, so it can be neither
re-measured nor checked for object contamination — which puts it in exactly the position of a figure
whose operator was not published. It is therefore marked **unverified pending republication**, not
struck. Related and separate: Gold's open ground being **6-9 colours** *is* withdrawn — that band
came from an inherited five coordinates that proved four-fifths trees, ledges and fences — and
hand-picked open ground reads **3-4**.

### T-18 · Field-guide plates — trial it
**Status:** TODO · **Hank:** *"you said this is listed in the spec, so why are you asking me about
it? Trial 1-3 images"*

Trial the painted style: 1–3 images, being the three age-forms of **one** creature line, testing style
consistency — not three species. The spec already writes the fallback (cut line C-4: pixel sprites on
parchment frames if it cannot reach approval in one supervised loop), so this did not need asking.

### T-19 · Fix the dex wiring bug
**Status:** DONE · **Hank:** *"yeah, no shit, fix it."*

`game/survey-view.ts:828` `dexArtId()` now produces `dex-painted/dex-<name>`; no `dex/` literal
survives in `game/` or `core/`. Bound by `tests/gates/dex-path-contract.test.ts`, which asserts **set
identity between two independent derivations** — the manifest's rows and the screen's asks — refuses
to pass on an empty set, round-trips through the loader's own key transform, and drives the real
`buildDexEntries`. Reverting the old shape fails five of its assertions at once. The gate was extended
to a `player` row on the same contract; `TitleScene`'s `"ui/title-banner"` is documented as
deliberately unbound because a row there would assert against the empty set and pass vacuously.

### T-20 · Player side view and walk cycle — in code, 0 images
**Status:** TODO — **the T-24 regression is repaired and this is no longer blocked by it** ·
**Hank:** *"fix the side view in code, then derive the walk frames the same way."*
⚠ **A green `player-art-contract` is not this ticket's evidence.** That gate checks palette, star
badge and freshness; the defect here is **geometry** — the legs — and nothing in the suite sees it.

Back and side views were built in code from the approved front sprite. One real defect: the side
view's legs still face the camera. Fix in code, then derive the walk frames the same way — 0 images.
A 14-image sweep already measured that generating frames barely moves this character in the denoise
band the spec calls for, and build-doc §9.6 already commits the fallback in writing.

Nothing is wired either way: `game/movement.ts:389`'s step function still has **zero callers**, so no
animation exists. Wiring it is part of this ticket.

### T-21 · Audio — correct the track list first
**Status:** IN PROGRESS — **doc half DONE** · **Hank:** *"correct the list to its 11 real rows first
(3 doc edits, 0 cost), then shop one family against it"*

- ✅ `docs/content-bible.md:298` now reads "Track manifest — **eleven tracks**" with exactly 11 rows.
  Five rows for cut places deleted; the timeline labels replaced (`town y1` → `town, act 1`, etc.).
  build-doc carries no track table and needed no edit.
- ❌ **No composer family has been shopped**, and there is no `ATTRIBUTION.md`. G9 requires one family
  and an attribution file if the licence needs one. All sources are free-licence, so nothing costs
  money.

The game is still silent: `assets/audio/` holds one `.gitkeep`, zero `this.sound` calls in `game/`.

---

## Intellectual property — CLOSED. Do not reopen.

### T-22 · Affirm every flagged name and write it down
**Status:** DONE · **Hank:** *"affirm all of them, write it down. I already gave approval for all of
these. DO NOT ASK ME THIS AGAIN ABOUT THINGS THAT HAVE ALREADY BEEN CREATED."*

**Every flagged name stays.** TROPHIC, Fallowmere, Duskhollow, Duskhollow Vale, Undermere, Mirefin,
Gloomoth, Umbrat, Wispurr, Bramblore, Cragmar, Daunt, and the 37-name second tier. Nothing is renamed.

All three recordings landed: L1 (`docs/build-doc.md:39`) now reads **"Affirmed, not provisional"**;
`docs/content-bible.md:14` inverts the old claim to **"No name in this file is a placeholder"**; and
§18's IP-sweep box (`docs/build-doc.md:503`) is **ticked** and reworded to state what was screened.

**Never put a name question to Hank again for anything already created.**

### T-23 · TROPHIC is a free class project — record it and stop
**Status:** DONE · **Hank:** *"this is a class project that will be free. Shut the fuck up about IP!"*

Recorded as locked decision **L14** (`docs/build-doc.md:52`): *"Free class project — not sold, no paid
storefront, free distribution."* That closes the distribution question, the clearance-search question,
and the storefront-dependent half of the naming ratings.

**Do not raise intellectual property again.** No clearance search is being bought. If a future agent
believes it has found an IP issue, it records it in this file and does not ask.

---

## Opened by this session's measurements

### T-24 · The palette swap broke the derived player sprites, and nothing can see it
**Status:** **DONE — the asset half landed 2026-08-27 and the gate reads 16 of 16.** The ticket keeps
its two findings; git holds the working detail.

`tools/comfy/player-views.ts` hardcoded 18 hex literals, **every one of which T-15 deleted from the
palette.** Regenerating the derived views from them wrote **8 off-palette pixels into
`player-back-32x48.png` and 420 into `player-side-32x48.png`**, and the star-removal filter compared
against `#f9db10`, which no longer exists — so it never fired and **the star badge came back on the
rear of the cap**.

1. ✅ **The 21 dead hex literals now resolve through `data/palette.json` by slot id.** No palette
   constant survives in that file (G11 in spirit).
2. ✅ **The derived views and the acceptance detectors are regenerated.** Commit
   `fix(art): rebuild the derived player views against the re-frozen palette` rewrites
   `derived/player-back-32x48.png`, `derived/player-side-32x48.png` and `_player-views/_acceptance.json`.
3. ✅ **A gate that reads a committed PNG exists.** `tests/gates/player-art-contract.test.ts`, 16
   cases, decoding through `sharp` — **the first gate in this repo that opens an image.**

**The gate now reads 16 of 16 GREEN**, re-run on 2026-08-27. Five sabotages all read red, **including
one that placed a legal palette colour as a star** — which reddened only the star assertions and left
the palette ones green, i.e. the two checks are genuinely independent and neither is standing in for
the other.

**The before/after was verified by decoding bytes, not by reading the commit message** — which matters,
because the message was **understated**. Decoded off the parent commit: the back view held **8
off-palette px in exactly the two named colours** (`#ec9a70`×4, `#eec092`×4), as advertised — but the
**side view held 420 px in 11 colours**, still the whole pre-freeze B0 sprite including the deleted
star yellow `#f9db10`. The message's "8 px in two colours" describes only the back. Both views now
decode at **zero** off-palette pixels, and the approved front is byte-identical: it does not appear in
the commit at all.

⚠ **"7 red → 16 green" is a claim, not a measurement, and is marked as one.** Re-running the gate
against the old bytes requires a checkout, which was not taken. **The two endpoints were decoded; the
count between them was not.** — this queue's own rule, that a ticket's own number is not a measurement.

**T-20 is NOT closed by this.** Its defect is the side view's legs facing the camera, which is geometry,
not palette, and a green palette gate says nothing about it.

**Two findings this ticket paid for, kept because they will otherwise be re-derived:**
- **Two sprite roles collapse onto one swatch.** `hair` and `hairHi` both resolve to `c05`; the same
  happens to `capOutline` and `capRim` on `c17`. The nape band and the cap edge each lose a tone.
  **CORRECTED — the reason this ticket first gave was false.** It read "there is nothing in between
  `c05` and `c07`". There is: `c06` (`#74564e`) at L\*39, against `c05` L\*25 and `c07` L\*41. `c06`
  is a low-chroma mauve-brown, so it is not in the hair ramp by *hue* — which is a different claim
  from a gap in lightness, and only the second one was checked. The collapse is real; the
  explanation was asserted from a nearest-hex reading and disproved in CIE-Lab by the art session.
  This is the T-15 lesson arriving in pixels: **a palette id is a slot, and a class-equal fit owes no
  role a neighbour** — but name the axis that is missing, and measure it before writing it down.
- **A dead ternary meant every "derived" row in `_acceptance.json` was describing a re-stretched copy
  rather than the shipped bytes.** The detectors were honest about a file nobody ships.

Blocks T-20, whose side-view fix regenerates the same files.

### T-25 · Stale instruments and comments, each of which will be believed
**Status:** DONE — **all six closed; 1, 2 and 5 closed 2026-08-27.** Each was verified stale by
reading the line and the thing it describes, and each closure was verified the same way.

None blocks a beat; each is a misreading this repo has already paid for once. Items 4 and 6 closed
because the artifact was repaired *and* its generator was made incapable of reverting the repair —
see STATUS.md, "a derived artifact carrying a hand-written claim". Prose alone would not have closed
either.

1. ~~`tests/unit/transcription.test.ts:1297-1300` — says battles are unwired~~ — **DONE.** The
   arithmetic above it was always correct; only the comment was wrong, and it now names
   `game/scenes/OverworldScene.ts` as the spender.
2. ~~`game/scenes/OverworldScene.ts:1921` — "`seasonBoundary` fires at ticks 4, 8 and 12 only."~~ —
   **DONE, and structurally.** Re-read: no comment anywhere in `game/` or `core/` says "4, 8 and 12".
   The `seasonBoundary` docblock is now at `game/scenes/OverworldScene.ts:1973-1985` and states the
   cadence as *"the first `seasonOrder.length - 1` multiples of `clock.ticksPerSeason`"* — naming the
   balance keys rather than the ticks, with `:1980-1982` saying in as many words that it does so
   "because a comment quoting the ticks goes stale in silence". That is the T-25 lesson written into
   the fix. **A sibling of this defect survives elsewhere — see T-42.**
3. ~~`tests/unit/lifecycle.test.ts:1646` — says the age multipliers are 0.75 → 1.0 → 1.15~~ —
   **DONE.** Re-read: it now says "0.875 → 1.0 → 1.075, plus the metamorphic ×1.15", and the old
   triple survives two lines below only as the recorded T-10 before/after.
4. ~~`tools/comfy/manifest-palette.json:2` — `"data/palette.json is FROZEN and UNTOUCHED"`~~ —
   **DONE, and structurally.** The file now records the class-equal re-freeze and says the palette
   "is therefore no longer UNTOUCHED". More to the point, `tools/palette/build-manifest-palette.ts`
   was rebuilt to **derive** `purpose` / `status` / `palettes.frozen.sources` from
   `data/palette.json` and `tools/palette/candidate-sources.json`, to **refuse to write** unless the
   palette is `frozen: true`, and to decide the promotion by a sha256 comparison of
   `palettes.frozen.colorsSha256` against `palettes.classEqual.colorsSha256` read off disk (both
   `51a95b06…`) instead of by a literal. `--self-test` covers the refusal and the derivation, so a
   rebuild can no longer revert the correction. Both claims verified by reading the JSON and the
   generator.
5. ~~`tools/harness/full-run.ts:368` — `const year = clock.year;` is dead~~ — **DONE.** The binding is
   gone, and a comment at `tools/harness/full-run.ts:490-491` stands where it was, recording that the
   calendar/act leak was closed by threading `act` and that the binding it left behind read nothing.
   The loop now opens `const act = balance.acts.first + 1 + y;` at `:492`.
6. ~~`tests/unit/__repro-battle-clock.test.ts`~~ — **DONE at ~22:11.** The temporary repro was
   deleted; `tests/unit/clock-subtick.test.ts` is the real test that binds the defect.

### T-26 · Calibrate `perImageCredits` before the 150-sprite batch
**Status:** DONE — **measured 2026-08-27**

Build-doc §9.1 and G13 both require a **measured** per-image figure before any batch of 20 or more,
and the platform exposes no credit-balance endpoint, so the only instrument is the account dashboard
read immediately before and after a batch of known size. That reading was taken.

**`perImageCredits` is `1.12`** (`tools/comfy/manifest.json:9`) — dashboard **4,147 → 4,127 across 18
images at 1024²**.

Two things must travel with the number or it will be misused:
- **It is the 1024² figure.** A later mixed batch that included 256² health probes read near **0.53**.
  Cost tracks pixels, so a per-image credit figure means nothing without its size beside it.
- **It retires the scarcity argument, not G13.** The whole 288-row manifest is **≈323 credits against
  a 4,081 balance, about 8%** — the 150-sprite batch was never the largest *spend* in this project,
  only the largest *batch*. G13's 20-row gate stands as a **review** discipline: twenty images get
  looked at before they are made, which was never a claim about price. Correct the scarcity framing
  wherever it still appears.

### T-27 · The enemy AI's tie-break is decided by floating-point rounding, and its docblock says otherwise
**Status:** DONE — **landed 2026-08-27, and the result contradicts this ticket's own prediction**

The docblock promised "ties to the earliest move in the pool" while the score was
`((atk × power) / def) × mult × predation × midRoll` — so a tie **on paper** rarely produced equal
doubles and the last bit decided. Measured over 2160 shipped enemy/opponent pairs: 59 tied on paper,
20 disagreed as doubles, and in **13 the AI picked a move that was not earliest in pool.**

**The fix ranks on `movePowerVs × typeMultiplier` alone** — `moveRank`, `core/battle.ts:1364-1369`,
consumed by `chooseEnemyAction` at `:1371`. The dropped factors (`atk`, `def`, `predation`, the mid
roll) are **common to every move in a pool and cannot reorder it in exact arithmetic**, so this is not
a simplification that trades accuracy for stability — it is the removal of terms that never carried
information. Result: **13 → 0 divergences; exactly 13 of 2160 choices changed.** The reasoning is
written at `core/battle.ts:1331-1359`, and the docblock at `:1327` is now true rather than aspirational.

**The prediction in this ticket's own text was wrong, and is recorded as wrong rather than replaced.**
It said the AI was "throwing a neutral move where the docblock promises the earlier super-effective
one" — i.e. that honouring pool order would make the enemy **stronger**. It made the enemy **weaker**:

| | before | after |
|---|---|---|
| Odo, full party | 91.6% | **95.2%** |
| Odo, matched party | — | **+9.8 pp** |
| Sable | — | **−1.4 pp** |

**All 13 flips trade `ambush`'s entry-turn priority for equal damage.** The rounding had been picking
the priority move by accident, and pool order does not know priority exists — which is the whole of
Odo's swing, and is now its own open question (**T-37**). Sable moved when the harness player model
took the same key. **Nothing was tuned.**

The player-side change is backed by an exhaustive sweep over **8.1 million pairings**: zero real
reorders, and all **11,602** divergences were exact ties. **The comparison was not loosened** — the
argmax is still a strict `>` over an exact key, so the determinism contract (no rng draws in the enemy
policy) is intact.

⚠ **Two clause-7 tests in `tests/unit/harness.test.ts` went red as a direct consequence, exactly as
their own docblock said they would. See T-32 — do not green them by loosening anything.**

---

## Opened 2026-08-27 — T-28 onward

**Ranked on what it costs when it bites, then on whether the tree currently asserts something false.**
A defect that ends a *run* outranks one that ends a *fight*; a test that is red in the tree now
outranks a latent defect; and a ticket blocked on Hank sits where its answer is needed rather than at
the bottom where it is comfortable. Every file:line below was re-read on 2026-08-27 before it was
cited.

| # | Ticket | In one line | Status |
|---|---|---|---|
| T-28 | Wire the persistence spine | All four finish handlers call `applyBattleResult` | **DONE** — wiring only; 3 clauses back to T-12 |
| T-29 | Party-wipe recovery | Blackout, wake at an inn, 5 ticks, composed from existing keys | **DONE** |
| T-30 | XP is written out, never read back | `BattlerSpec.xp` carries it back in | **DONE** |
| T-31 | `ensureNodeArt` can soft-lock travel | It has a deadline and resolves on it | **DONE** |
| T-32 | Two clause-7 tests are RED | T-27 removed the state dependence they pinned | **DONE** |
| T-33 | `GameAction` needs `battleAftermath` | There were TWO casts and there are now zero | **DONE** |
| T-34 | `replay()` loses a caught creature | Fixed — but `replay()` still has no production caller | **DONE, one gap open** |
| T-35 | Interiors, phase 2 — the scene layer | Doors, arrival cell, indoor guards, save field | **DONE** |
| T-36 | `node.walkable` gates nothing | Two canonical docs describe a path `game/` does not have | TODO · **Hank's** |
| T-37 | The enemy AI is blind to move `priority` | A design call, not a defect | TODO · **Hank's** |
| T-38 | The level-5 starter is one-shot on Route 1 | Measured again with persistence live; the loss now costs | measured · **Hank's** |
| T-39 | `sanctum-antler-ring` is on the spawn cell | Two map rules land on the same cell | TODO |
| T-40 | `DexScene` / `SummaryScene` optional `onClose` | The epilogue-survey shape, one supplier from repeating | **DONE** |
| T-41 | `fit: true` vs `nearestResample` | The batch pipeline and the derived views disagree | TODO |
| T-42 | Three comments call a season four ticks long | T-25 item 2's sibling, found while closing it | **DONE** |
| T-43 | The palette append needs its own generator | `fit.mjs` is a re-freeze tool by construction | TODO |
| T-44 | A test comment says `GameAction` has no `blackout` | It has one; the test passes and its reason is dead | TODO · **re-read 2026-08-27, still open** |
| T-45 | `core/recovery.ts` misplaces `BlackoutRecovery` | The type moved to `core/types.ts`; imports unchanged | TODO · **still open; its own cited line drifted** |
| T-46 | A fossilised precondition asserts the repo is empty | Base-map half deleted; the MASK half widened to all twelve nodes | **DONE** — and it moves T-56 |
| T-47 | Every interior door coordinate is a guess | The canon gives none; the painted map will | TODO · **blocked on the art lane** |
| T-48 | Interiors cover four buildings in two towns | Three towns have no interior at all | TODO · **scope half is Hank's** |
| T-49 | The maps paint edge exits nothing can walk through | Travel is still a number-key menu on `adjacency` | TODO |
| T-50 | The door facing↔wall check lives only in the test layer | The load-time validator does not make it | TODO |
| T-51 | `tools/mapgrid` bypassed the engine's cross-check | Real, and **repaired in flight** — it parses through `zBalance` | **CLOSED** |
| T-52 | `tools/` → `game/` has no guard, only a correct habit | 9 sites, 5 files; the dependency is fine, the gate is missing | TODO |
| T-53 | `travel` does not restore `currentNode` on replay | An existing test pins it **on purpose** — a ruling, not a patch | TODO · **decision** |
| T-54 | `foray` does not restore `forayStepsSinceTick` | Same shape; and an arm alone cannot close it | TODO |
| T-55 | `{t:"battleAction"}` is a dead union member | Zero mint sites; unreachable, so no arm is owed | TODO |
| T-56 | Landing a mask is a gate recalibration | ⚠ **THREE gates red on a mask now, not one**, and the mask rule is PER NODE | TODO · **behind T-57** |
| T-57 | Painting or layout — which is authored first? | Nothing reconciles them; tiling would dissolve it, and tiling is unruled | TODO · **Hank's** |
| T-58 | A wall under half a cell wide blocks nothing | A property of the majority rule; bites only on a hand-edited mask | TODO · **record only** |
| T-59 | The layout→mask round trip is demonstrated, not protected | The sabotage that proves it ran in a scratchpad, not in the suite | TODO |
| T-60 | Three snares are promised and never delivered | ⚠ **premise wrong twice** — they are delivered now; the residue is T-66 | **DONE** |
| T-61 | A debug HUD covers most of the screen | Unconditional, no toggle; `[C]` is a different overlay | TODO |
| T-62 | The battle log disagrees with the HP bar | The log printed the raw roll; the bar showed the clamped application | **DONE** |
| T-63 | A grant is one play PER ENTRANCE, not one play total | Shipped content escapes it by `priority`, not by rule | TODO · **`grants` now HAS a consumer — severity raised** |
| T-64 | The purse's "exactly once" has no re-entrancy latch | The only latch is in `BattleScene`, a different file from the levy | TODO · **guarded today, not enforced** |
| T-65 | `encounterTileFraction` is a scalar, not a spatial mask | Grass gating is uniform over a node; the shares are measured and unused | TODO |
| T-66 | A snare tier nobody grants is UNLIMITED | `bagHas` reads an absent key as untracked; the meter moves, it never closes | TODO |
| T-67 | Kett prices bait the data does not price, and it cannot be bought | *"three times the money"* against 3 vs 3; no bait row can exist as built | TODO |
| T-68 | Demo beat 1 has two reference players and they disagree | The integration rig throws `master`; the balance harness prices `weighted` | TODO |
| T-69 | The layout gate asserts one proposition twice | The converse is unasserted, and its header's own figures are fossils | TODO |
| T-70 | Three docblocks say the master-snare grant does not fire | It fires, with a played-ladder test; the same commit falsified them | TODO |

### T-28 · Wire the persistence spine — nothing calls `applyBattleResult`
**Status:** **DONE for the wiring, and three of its own *done when* clauses did NOT land and go back
to T-12.** Marked this way deliberately: this queue's standing practice is to record what was not done
rather than let a ticket close over it. Shipped with T-29 as required.

**What landed, re-read line by line on 2026-08-27.** `applyBattleResult` (`game/wild-battle.ts:503`)
is now the **first statement** of all four finish handlers:

| launcher | call site |
|---|---|
| wild | inside `finishWildBattle` — **before** the catch writer |
| gym | inside the gym finish handler |
| rival | inside the rival finish handler |
| finale | before `resolveVellsireCatch` |

⚠ **This table used to give a line for each row and every one of the four had drifted within a day**
(`:1535 / :2233 / :2323 / :2397`, against `:1537 / :2275 / :2365 / :2439` when re-measured). **The
claim was never the line — it was that there are exactly four and that the call is first in each** —
so the lines are gone and the claim stands. `grep -n 'applyBattleResult' game/scenes/OverworldScene.ts`
is the check.

**The three docblocks that already advertised it as *"the ONE writer all four launchers share"* —
`game/rival.ts:184`, `game/gym-battle.ts:165`, `game/finale.ts:313` — BECAME TRUE rather than needing
repair.** That is worth stating plainly, because it is the opposite outcome to the
derived-artifact-carrying-a-hand-written-claim shape this file keeps recording: the claim was written
ahead of the code, and the code caught up to it. It only reads as a success in hindsight; while it was
false, nothing could tell the two cases apart.

**Two decisions to record, because both are the kind someone later "simplifies".**

1. **THE BLACKOUT IS THE CONTINUATION OF THE FIGHT'S BEAT, NEVER THE OTHER WAY ROUND.** The leader's
   `battle-loss`, Wick's line, the finale's epilogue — each plays first, and `recoverFromBlackout`
   (`recoverFromBlackout` (`game/scenes/OverworldScene.ts`)) is what runs when its box closes. **Measured, not
   preferred:** `playPendingCutscene` asks the corpus what is queued for `this.node.id`, and
   `maren.epilogue.released` / `maren.epilogue.caught` are `cutscene`s at **`sanctum`** while
   `maren.finale` is one at **`sanctum-approach`**. Blacking out first carries the player two nodes
   away and none of the three is eligible any more — losing the Vellsire fight left **the released
   epilogue unplayed**, which is half of a never-cut beat. (It is not *lost*: every autoplay entry
   closes itself with a flag, so it is still pending when the player walks back. But "the ending
   arrives after a hike" is not the beat.) The reasoning is written at `OverworldScene.ts:1999-2012`,
   where whoever reorders it will read it.
2. **`enterNode` IS SYNCHRONOUS** (`game/scenes/OverworldScene.ts:2928`, returns `void`). The async
   version left `save.currentNode` and `this.node` naming **different nodes** between the write and
   the microtask — precisely the half-swapped state `liveNode` / `activeGrid` exist to prevent. It was
   extracted from `travelTo` rather than copied, so travel's adjacency check, its act gate and its
   tick stay with travel and the blackout's price stays with the blackout.

**What did NOT land** — each was verified by reading the code, not inferred. ⚠ **The first of the
four has since LANDED and is struck rather than deleted, because a ticket that closes over its own
recorded shortfall is exactly what this section exists to prevent:**
- ~~**The inn still heals nothing.**~~ — **LANDED 2026-08-27.** `restAtInn` now calls `innRestFor` and
  `applyInnRest` before it spends the tick. `balance.medicine.innRestFullHeal` still has exactly one
  reader, `restoredUids`; it now has two callers, the blackout's wake and the inn's. The detail is in
  T-12 clause 2 and is not repeated here.
- ~~**Money has a mint and no earner.**~~ — **LANDED.** ⚠ **This bullet was corrected once mid-flight
  to say the primitive existed and the wiring did not; the wiring has since landed too.** A won rival
  fight levies the purse on the live path, and the *"nothing calls either in production"* clause is
  false. **What survives of it:** `innCost` and every `baitPrice` row still have **zero readers**, the
  first by the owner's ruling and the second as a real gap (T-67).
- ~~**No town shop sells anything.**~~ — **LANDED.** Four rows, prices from `balance.economy`,
  weighted gated on the second gym's badge, bought on the tape. T-12 clause 4 has the ruling.
- **A loss penalty exists only as the blackout's 5 ticks.** `core/recovery.ts`'s header argues in
  prose that this *is* the explicit penalty T-12 asks for. **That is a reading and is marked as one**
  — it prices a WIPE, not a loss that leaves something standing.

**The consequence this section recorded as live — a damaged-but-not-wiped party's only out-of-battle
heal being to get wiped — is CLOSED by the inn landing.** It is kept because it is the argument that
paid for the fix, and because it is the clearest instance this queue has of a shortfall recorded
honestly at close-time and then actually worked.

### T-29 · Party-wipe recovery — Hank has ruled this and it exists nowhere on disk
**Status:** **DONE — landed with T-28, as required.** · **Hank:** *"When your team is wiped, a dialogue
shows up with a black background saying you passed out or something like that, and then you wake up
at the inn."* · on the cost: *"it should use twice the inn ticks, in addition to the cost of one fast
travel"*

**Both rulings are still recorded verbatim, and they are recorded in the CODE as well as here** — the
header of `core/recovery.ts` quotes both under *"Hank, ruling, verbatim"*, at the top of the module
that implements them. **Re-checked on the 2026-08-27 doc-currency pass, in both places, and both are
intact** — including the *"take a note from Pokémon"* sentence the code copy opens with, which this
file's shorter quotation drops. The `:5-11` this line published had drifted by one and is not
published any more.

**The cost composes from existing keys, so no new balance key and no literal in code (G11):**
`2 × balance.clock.innTicks + 1 × balance.clock.travelTicks`. Re-read off the shipped file
(`data/balance.json:319` `travelTicks: 1`, `:321` `innTicks: 2`) that is **2 × 2 + 1 = 5 ticks**, and
`core/recovery.ts` composes it through `core/clock.ts`'s own helpers rather than multiplying — the
"twice" is the length of a list, so there is no numeric literal at all. **There is no `blackoutTicks`
balance key and there must not be one**; the ruling defines the price in terms of the two that already
exist, and `core/recovery.ts:24-28` says so where a future retuner will read it.

**What shipped:**
- `core/recovery.ts` — pure TypeScript, zero engine imports (L11). It owns the DECISIONS: is the party
  down, where do they wake, what is charged. `core/save.ts` owns the tape.
- `recoverFromBlackout` (`game/scenes/OverworldScene.ts`), **called at the end of every fight and a
  no-op unless one is owed** — `blackoutRecoveryFor` answers null both for a party with something on
  its feet and for an empty one, which is a different state and belongs to the opening beat.
- The party wakes **fully healed**: `restoredUids` (`core/recovery.ts`) reads
  `balance.medicine.innRestFullHeal` rather than restoring only the fallen, which is what a rest is
  and what bible §11 says in words. **That function now serves the INN as well** (T-12 clause 2), so
  the two paths cannot drift apart; on the blackout path its two branches provably cannot differ,
  because nothing is standing when it is called. **The `:377` this line published has drifted to
  `:389`, so the function is named here and the line is not.**
- **`narration.blackout`** is authored in `data/dialogue.json` — a `service` entry, three lines, and
  the corpus went 214 entries / 509 lines → **215 / 512** because of it. It is gated on the cue the
  recovery raises and reached through the existing selector path, so the reachability gate sees it.
  Its copy holds G7: it reports the ceiling, the beam, the cold water on the stool. No line tells the
  player they did wrong.
- `tests/unit/recovery.test.ts` — **33 cases**, covering the price list against the ruling, the
  absoluteness of the tape entry, the round trip, the refusal on a uid the save does not carry, and
  *"the dead end is real before the recovery exists to open it"* at every one of the twelve nodes.
- ⚠ **AND THE NODE BINDING, WHICH WAS MISSING AND IS NOW BOUND (2026-08-27).** `recoverFromBlackout`'s
  on-screen move was **deletable with the suite unchanged**, because the only assertion guarding it
  ran at `hearthollow` — whose wake node **is** `hearthollow`, so the assertion compared a value with
  itself. It is now driven at **every shipped node**, asserting that the scene and the save agree, and
  it **counts how many nodes actually move** and fails loudly if a data change ever made them all
  identity (`wakeNodeFor` is the identity at five of the twelve). The fixture cannot go degenerate in
  silence. This is the same shape as STATUS item 39 №8 — an assertion that ran, compared, and could
  not fail — reached from the fixture side rather than the threshold side.
- The **end-to-end** case is in `tests/unit/overworld-scene.test.ts:1179-1198`, not in the unit file:
  it walks the slice until a real fight is lost, then asserts something is standing, at
  `wakeNodeFor(SLICE_NODE, content)`, that the scene moved with the save, that the clock moved by
  exactly `blackoutTicks(balance)` (*"the blackout was free"* is its failure message), that the tape
  carries it, and that **the next fight can actually be launched** (`wildBattleProblem` is null).

**What it replaced.** The game used to answer a wipe with **refusal** and never with recovery:
`partyProblem` (`game/wild-battle.ts:212`, returning *"nothing in the party is standing — nothing can
be sent out"* at `:217`), four launcher guards, and a last-ditch `unfieldableProblem`. That was
survivable only because HP never persisted. **T-28 made it reachable and terminal**, which would have
contradicted the closed ruling that a forced choice exists *"so the game cannot block"* — which is why
the two had to ship together and did.

⚠ **REOPENED IN SUBSTANCE BY THE 2026-08-27 PLAYTEST: THE PRICE IS RIGHT AND THE RULING IS NOT ON
SCREEN. THE STATUS ABOVE STAYS `DONE` FOR WHAT IT CLAIMS — the decision layer — and this is appended
rather than overwriting it, because the tick charge is the part that DID work.** A lane is repairing
all three items below right now and **its work has not landed; none of this is fixed.**

The blackout fires and its prose lands `[SAW, verbatim]` — *"Nothing is standing, and the next part of
the day is missing."* The charge is exact: the banner read `hearthollow 5 ticks` and the meter moved by
five, which is `2 × innTicks + travelTicks` on the shipped keys. Then:

1. ⛔ **THE OVERWORLD ACCEPTS NO INPUT AFTER THE RECOVERY. THE RUN IS OVER.** `[SAW]`, **3 of 3** — a
   lost wild fight, a lost rival fight and a lost gym fight. After the last narration line closes,
   arrows, `[C]`, `[E]` and ESC all do nothing. **It is not the harness and not a stopped game loop**:
   measured in the same instant, `{ keydownsSeen: 1, framesAdvanced: 56 over ~500 ms }`, with **no
   console error, no exception and no Phaser warning.** The key reaches `window`, the game steps, and
   the overworld does nothing with it. The playtester's reading of the cause — more `scene.pause()`
   calls than `scene.resume()` across a chained pair the file's own comment says is *"not
   ref-counted"* — is marked `[INFERRED]` **by them** and is preserved as an inference here.
2. ⛔ **There is no black screen.** What draws is the ordinary dialogue box over the **live overworld**,
   with the debug HUD (T-61) still on top of it. Hank's ruling names it in as many words: *"a dialogue
   shows up with a black background."*
3. ⛔ **The player does not wake at the inn — they wake where they fell.** `[SAW]`: the tile before the
   fight and after the whole recovery sequence were both `18,29`; the inn door is at `18,24` and the
   interior was never entered. The move that exists is `recovery.wakeNode`, and **for a wipe in
   Hearthollow the wake node IS Hearthollow**, so the node move is a correct no-op and *nothing puts
   the player in the room the prose describes*. The other half of the ruling is *"and then you wake up
   at the inn."*

**Read the shape of this, because it is this repository's own recurring one.** The node-level move was
bound at every shipped node by a test written in this very ticket, and that test is right — and it
cannot see that a wake node equal to the current node leaves the player standing on the tile they fell
on, inside no building. **The thing asserted was the graph hop; the thing ruled was the room.**

### T-30 · XP is written out and never read back in
**Status:** **DONE — landed with T-28.**

`BattlerSpec` now carries **`xp?`** (`core/types.ts`), `makeBattler` reads it back as
`xp: spec.xp ?? 0` instead of hard-coding zero, and `battlerSpecOf` (`game/wild-battle.ts`) copies
the owned creature's field **verbatim** — carried, never derived, so what a battler enters a fight
with is a pure function of the save and a replay (L10) sees the same number. The reason is written on
the field itself, which is where whoever deletes it will read it.

⚠ **THIS TICKET'S OWN CLAIM WAS AN OVERSTATEMENT AND IS CORRECTED, NOT REPHRASED.** It said, quoting
`core/save.ts`, that *"no single-enemy wild fight can ever level anything."* **That is true from
level 2 up and FALSE at level 1.** Re-derived from `data/balance.json` `xp`
(`base` 12, `perEnemyLevel` 4, `ageBonus.A` 1.0, `toNextCoefficient` 15, `toNextExponent` 1.4) rather
than quoted from anywhere:

| level | `xpToNext(L)` | `xpGain` vs a same-level Adult | levels off one kill? |
|---|---|---|---|
| 1 | **15.000** | **16** | **yes** |
| 2 | 39.585 | 20 | no |
| 5 | 142.774 | 32 | no |
| 8 | 275.688 | 44 | no |

The crossover is immediate and never comes back — the threshold grows as `L^1.4` and the gain grows
linearly. So the honest statement is **level-dependent**, and both docblocks now make it:
`core/types.ts` `BattlerSpec.xp` says *"(It was not literally impossible — at level 1 the first enemy
pays 16 against a threshold of 15 — but every level above the first was.)"*, and `core/save.ts:493-498`
carries the same qualification. **A docblock that overstates is the thing T-25 exists for**, and this
one was in a ticket rather than in the code.

### T-31 · `ensureNodeArt` can permanently soft-lock travel
**Status:** **DONE — committed.** `ensureNodeArt` (`game/mapview.ts:278`) takes a deadline —
`ART_LOAD_TIMEOUT_MS` 8000, as a **parameter** so a test drives it rather than sleeping through it —
and the stall that left `travelling` stuck true, silently refusing every later travel for the rest of
the session, cannot happen now.

⚠ **CORRECT ONE OF THIS TICKET'S OWN THREE STALL PATHS.** It said `start()`'s early return was
reachable *"during `LOADER_PROCESSING`"*. Read off the pinned Phaser (`node_modules/phaser` is
**3.90.0**): **`LOADER_PROCESSING` is declared in `loader/const.js` and never assigned anywhere in
`LoaderPlugin.js`** — its only appearance is inside `isLoading()` at `LoaderPlugin.js:884`. **That
framing is not reachable in the pinned version.** The real form of the path is
**`LOADER_SHUTDOWN` / `LOADER_DESTROYED`** (`LoaderPlugin.js:1261` and `:1281`), where `start` returns,
nothing is subscribed to scene UPDATE, and nothing will ever emit again. The corrected reading is
written at `game/mapview.ts:211-220`. **The other two paths are confirmed:** `XHRSettings.timeout`
defaults to `0`, so the `xhr.ontimeout` wiring is dead code and the `HTMLImageElement` alternative
wires no timeout at all; and teardown mid-load returns early on two guards. *A ticket's own file:line
is not a measurement* — and neither is a ticket's own reading of a dependency.

**THE DESIGN DECISION: IT RESOLVES, IT DOES NOT REJECT — and that was measured rather than argued.**
**Neither caller has a `.catch`**: the sole travel caller is `void this.travelTo(target)` and
`recoverFromBlackout`'s is `void ensureNodeArt(…).then(…)`. A rejection is therefore an *unhandled*
rejection, which puts **less** on screen than the hang did. Proven, not asserted — the reject sabotage
produced **six unhandled rejections**. What it does instead is separate two states the HUD had been
collapsing, so **built-but-absent reads *"did not load"*** and reaches the player through a line the
scene already prints (`statusFor`, shown at `OverworldScene.ts:844`).

**And the cost, stated rather than glossed: the load is NOT cancelled.** A texture that arrives after
the deadline sits in the TextureManager unused, and that visit finishes on the labelled stand-in with
a synthesised collision grid. **It self-heals on the next entry** — `pending` is then empty and the
real art draws. **A degraded visit instead of an un-travellable session** is the trade, and it is the
right side of it.

**The instrument failure this ticket paid for is on STATUS item 39 as №7**, and it is a shape none of
the earlier six had: the first version of the timer assertion watched `console.warn` to prove the
watchdog had been cleared, and the callback's own `if (settled) return` suppresses that warning **even
with a live timer still pending**. It observed nothing and passed. It binds now because it counts live
timers directly — `vi.getTimerCount()`, `tests/unit/mapview.test.ts:380-383`.

### T-32 · Two clause-7 tests are RED because T-27 stabilised the tie-break
**Status:** DONE — **three changes landed; `tests/unit/harness.test.ts` reads 76 passed of 76.**

The 77 → 76 is **one deliberate deletion, not a lost test**, verified three ways: 76 `✓` lines under
the verbose reporter, 76 `it(` blocks in the file, and zero `.skip` / `.only` / `.todo`.

**The measurement that justifies the whole ticket.** Under one sabotage — reverting
`tools/harness/arena.ts` to the pre-T-27 full-product argmax — the **new exhaustive sweep reds on 78
of 104,976 pairings with the cases named**, and **the 36-sample test it replaced stays GREEN.** That is
a green test binding nothing, demonstrated rather than argued, and it is the sharpest instance this
repo has of the failure mode it keeps paying for. A bigger sample was never the fix; exhaustiveness is.

**A test was deleted, and that was not a weakening.** *"clause 7: the greedy pick CAN turn on the
attacker's own stats"* is gone. **Its own docblock prescribed the deletion in advance:** *"If this goes
green-to-red, the scorer's tie-break became stable. That is an IMPROVEMENT, and the response is to
delete this test deliberately … not to make the assertion looser."* The sabotage row settles the
question the protocol leaves open — whether the test was wrong: run against the pre-T-27 code it reads
**green** (stable 717, stateDependent 3), and against the shipped key it reads stateDependent 0 over
the same 720 pairings. **It was correct for the code it was written against; its FACT was removed by a
cited decision, not by a defect.** A comment stands where it was
(`tests/unit/harness.test.ts:645-668`), and what replaced it is strictly stronger — the exact-equality
sweep in *"the key scores the creature that is FIELDED"* (`:519`) goes red the moment attacker
sensitivity returns.

**The clause in that docblock that was deliberately NOT acted on, because the next reader will find the
same sentence and be tempted the same way.** It continued *"…and then `coverageScore` may drop its ages
and traits."* It reads like an instruction. Taking it would have **partially undone T-13**, which was a
ruling to *fix the instrument* — and whose fix was precisely to thread real ages and traits in, because
the old scorer asked whether a creature merely *knew* an effective move rather than whether its policy
would pick one. The parameters were **measured inert** — 1.71M calls over 32,400 cells with zero
variance, and 6,000 real drafts with zero differences — and **kept anyway, deliberately, as a guard**:
the next scorer that starts reading the attacker again turns a test red instead of moving published win
rates in silence.

**One thing left open rather than resolved.** The surviving test's title reads *"the key scores the
creature that is FIELDED — its own age, not a stand-in"*, while its first half now proves a stand-in
scores **identically**. The docblock resolves the tension explicitly; the title still carries it. Not
wrong, and not renamed in passing — recorded because it is no longer self-explaining.

### T-33 · `GameAction` needs a `battleAftermath` member
**Status:** **DONE.** `core/types.ts:641` declares the union and it now carries **both**
`| { t: "battleAftermath"; aftermath: BattleAftermath }` (`:656`) and
`| { t: "blackout"; recovery: BlackoutRecovery }` (`:684`), each with the reason written above it.

⚠ **This ticket's own count was wrong, and in the direction that matters.** It said the change
*"deletes the repo's only `as GameAction`"*. **There were two, and there are now zero** —
`grep "as GameAction"` over `core/` and `game/` returns **nothing**, re-run before this line was
written. The single surviving hit anywhere is a **comment** in `tests/unit/save.test.ts:1059`
recording what the cast used to look like, which is history and is correct where it stands.

`battleAftermathAction` (`core/save.ts:518`) and `blackoutAction` (`:645`) both return a `GameAction`
with no cast, and `replay` dispatches each from a **named `case`** instead of its `default` arm.
`npx tsc --noEmit` reads **exit 0**.

**No `core/schemas.ts` change was needed and none must be added.** `actionLog[].action` is
`z.looseObject({ t: z.string().min(1) })` — permissive by design, and `looseObject` hands the payload
back **intact**, measured: a `battleAftermath` entry survives `serialize` → `deserialize` with its
party and items whole, where a `z.object` would have returned `{t}` alone. Pinning the union in the
schema would make every lane that adds an action edit that file. The reason is recorded at
`core/save.ts:502-514`.

### T-34 · `replay()` loses a caught creature — L10 is false for any run containing a catch
**Status:** **DONE for the defect. ONE GAP STAYS OPEN and must not read as if it were closed.**

**The defect is fixed and was measured on one run before and after.** The `catch` action now carries
the creature itself — `| { t: "catch"; nodeId; lineId; uid; gained?: OwnedCreature }` in the
`GameAction` union — **whole and absolute**, because *nothing else on the tape can rebuild it*: the
encounter roll, the trait roll and the fight that fixed its age, level and traits are not logged at
all. `catchAction` (`core/save.ts:752`) is the constructor that fills it in and `applyCaught` (`:829`)
is the one applier both the live path and the replay path come through. `gained` is **optional** so a
tape written before it still loads and replays unchanged (INV-2). The pattern is the one
`battleAftermath` established, applied to the catch, exactly as this ticket proposed.

Bound by `tests/property/determinism.test.ts:421` — *"reproduces the WHOLE save — the creature
included, not just the count"* — with `:481` proving the entry is idempotent, `:501` proving a catch
entry whose creature is not the one the entry names is **refused**, and `:518` covering a run
containing a RELEASE.

⚠ **STILL OPEN, AND IT WAS NOT CLOSED BY THIS TICKET: `replay()` HAS ZERO PRODUCTION CALLERS.**
Re-grepped after the fix landed — every call site in the repo is a test
(`year-turn-ux`, `wild-battle`, `battle-persistence`, `recovery`, `determinism`, `seams`). **L10
remains a property the suite asserts, not a load path the game takes.** That is what made a false L10
survivable for as long as it was, and it is the part still worth noticing: the determinism tests
certify less than their name suggests, and fixing the creature did nothing about that. Carried in
STATUS's *what is open* as item 37.

### T-35 · Interiors, phase 2 — the scene layer
**Status:** DONE — **the player can walk into a building, move around it, and walk back out.**

**It is a VIEW MODE inside `OverworldScene`, not a new scene**, and that was the load-bearing call.
`travelTo` was already a re-dress in place — same scene, new map, new collision, player repositioned —
so pointing that move at a `core/interiors.ts` blueprint instead of a node reuses movement, collision,
`interact`, the HUD, both clocks and the save, rather than reimplementing any of them beside a second
scene. Phase 1's decided architecture held: an interior is **not** a node, `save.currentNode` keeps
naming the town, and `save.interiorId` says which room.

**Two judgement calls, recorded because both are the kind someone later "simplifies".**

1. **Entering is free, but the step ONTO the threshold is billed like any other step.** The doorway is
   checked *after* the encounter roll, not before (`game/scenes/OverworldScene.ts:1225-1245`). Checking
   it first would make that step free — and since leaving lands the player back on that same tile,
   stepping off and on again would halve the cost of walking past every door in the game.
2. **Indoor steps do not advance the foray odometer, and nothing is refunded.** A foray step is
   *defined* as the step that rolls encounters (build-doc §4), so banking one whose roll is suppressed
   sells the player a hunt they cannot take. Duck inside at 47 of 48 and you come out still owing the
   48th. — `game/scenes/OverworldScene.ts:1129-1145`

**What its own sabotage caught in its own work, which is the more valuable half of this ticket.**
Twenty cases were written; two of them found holes in the work committing them.

- **A harness reported *"no red"* for a sabotage because the run never started.** vitest 4 has no
  `--reporter=basic`, the invocation failed, and **silence read as success.** A self-verification that
  cannot distinguish "nothing failed" from "nothing ran" is not a verification. Read the events
  literally: an empty result is not a green one. Its sibling, from the same night and nastier because
  there is no error at all: **`vitest -t` takes a REGEX, not a literal** — a case named `[E1]` parses
  as a **character class** matching one of `E` or `1`, so the filter matches nothing, runs nothing and
  **reports success.** The next person to name a case `[G2]` or `[R9]` walks into it, and the art lane
  already R-numbers its rules. **Confirm the summary line and the expected test count before believing
  a green.**
- **A cold-load test's only geometry assertion was true under every cell size *and* true of a scene
  that never parsed the plan at all.** It was asserting a shape the failure also has.

### T-36 · `node.walkable` gates nothing, and two canonical docs say otherwise
**Status:** TODO — **blocked on Hank's decision; an agent may not pick a side**

`travelTo` (`game/scenes/OverworldScene.ts:2225`) refuses on exactly two things — adjacency at `:2227`
and the act ladder at `:2243-2247`. **It never reads `node.walkable`.** The only read of the flag
anywhere in `game/` or `core/` is `game/scenes/OverworldScene.ts:564`, inside `firstWalkableNodeId()`
at `:563`, choosing a default node. Everything else is a declaration (`core/types.ts:160`) or a zod
field (`core/schemas.ts:216`).

**So the player walks all twelve nodes, all of them on `synthesiseBorderCollision`.** Four carry
`walkable: true` — `hearthollow`, `r1`, `brackwater`, `r2` — and eight carry `false`.

**Three canonical sentences describe a path that does not exist in `game/`:**
- `docs/build-doc.md:202` — `walkable: boolean; // false => vignette card fallback`
- `docs/build-doc.md:456` — cut line **C-1**, *"acts 5–6 towns walkable → vignettes (already
  default)"*. It is not the default and it is not implemented.
- `docs/content-bible.md:162` — *"later nodes fall back to vignette cards."*

And `tests/unit/transcription.test.ts:949` pins which nodes carry the flag —
`expect(nodes.filter((n) => n.walkable).map((n) => n.id).sort()).toEqual(["brackwater","hearthollow","r1","r2"])`
— **a test certifying a field's value while nothing outside the test reads the field.** That is the
§8.5 shape ("a precondition is only real if something outside the test produces it") arriving on a
data field instead of a dialogue flag.

**The two options, and Hank picks:**
- **Build the fallback.** Non-walkable nodes render a vignette card instead of a walkable map — what
  both canonical docs already promise and what C-1 assumes exists.
- **Drop the claim.** Delete the fallback language from both docs, retire C-1, and either delete
  `walkable` or give it a real reader.

**Done when:** Hank rules; the chosen side is implemented; and the losing side's text is corrected in
the canonical doc rather than left standing.

### T-37 · The enemy AI is blind to move `priority` — a design call, not a defect
**Status:** TODO — **blocked on Hank; it moves published win rates either way**

Now that ties resolve by pool order (T-27), **every damage-tie between a priority move and a
non-priority one resolves against the priority move.** `moveRank` (`core/battle.ts:1364-1369`) is
`movePowerVs × typeMultiplier` and reads nothing else. `priority` appears in `core/battle.ts` only in
turn-order code — `movePriority` (`:1290-1305`), consumed by `resolveOrder` (`:1307-1322`) — and in an
effect-switch arm that deliberately no-ops at `:1177`.

**That is the whole of Odo's 9.8 pp swing.** All thirteen T-27 flips traded `ambush`'s entry-turn
priority for equal damage; floating-point rounding had been picking the priority move *by accident*.

**This is not a defect** — the AI does exactly what its docblock now promises. Whether a "reasonable"
enemy should value moving first is a design question:
- **Leave it.** Pool order is authored order, so a leader who should open with `ambush` gets it by
  listing it first. The roster is the lever and no code changes.
- **Rank priority in.** Deliberate, and it re-opens every gym band measured under T-13.

**Done when:** Hank rules. If priority is ranked in, the docblock says so and a test constructs one of
the thirteen measured ties. **Do not slip it in as a tie-break tweak** — it changes what the AI
values, and it has to be measured as that.

### T-38 · The starter is one-shot on Route 1 — **CORRECTED, and the real figure is worse**
**Status:** measured; **the decision is Hank's and is in STATUS's waiting-on-the-owner register.**
Nothing here is a TODO and nothing was tuned.

**This ticket's own claim was false and is withdrawn, not rephrased.** It said *"four of Route 1's six
lines beat the level-5 starter one-on-one at level 1."* Measured, that holds for no starter: at level 1
it is **Cindril 1 of 6, Puddlisk 2 of 6, Thornlet 0 of 6.**

**But level 1 is not what Route 1 rolls, and the true finding is larger than the claim it replaces.**
At the levels the node actually produces — 4 to 8, ages weighted by the real encounter table — the
granted **juvenile** starter reads:

| starter | wins | **one-shot** | lines that beat it |
|---|---|---|---|
| Cindril | 21.3% | **78.7%** | 3 of 6 |
| Puddlisk | 14.1% | **84.8%** | 6 of 6 |
| Thornlet | 25.0% | **74.8%** | 5 of 6 |

**The starter loses about four fifths of its first encounters in a single hit.** Read the correction
that way round: "starter is weak on Route 1, again" and "the starter is one-shot four times in five"
provoke different decisions, and only the second is true.

**How this ticket got it wrong, because the mistake is instructive.** It computed ~78 damage using
**attack 61 — the level-1 *Adult*'s figure** — against a starter granted as a **Juvenile**. It mixed
ages. Correcting the age makes the conclusion **stronger, not weaker**: a level-1 juvenile Loamunder's
true damage band is **67–82**, so the **minimum** roll already exceeds the Fire starter's 58 HP and the
one-shot is certain rather than likely. The starter-specificity flagged in the original stands — the
same move is *resisted* by Thornlet and Puddlisk, which is why their one-shot rates come from other
lines. Name the starter whenever a figure here is quoted.

**Two things that make this decidable rather than alarming.**
1. **It was predicted in writing.** `data/balance.json`'s `age._multiplier` note recorded this
   instrument reading a **66.2%** loss rate after T-10 and said the T-11 Producer re-spend would move
   it. It has, to about **80%**. This is a known consequence arriving, not a surprise.
2. **It matters far more now, because both tickets have LANDED.** T-28 makes battle damage persist and
   T-29 charges the recovery; `applyBattleResult` is called from all four finish handlers as of
   2026-08-27, so a lost fight costs 5 ticks and a walk back.

**Re-measured with both wirings live — and this is the SAME finding, seen from the other side of the
change, not a second one.** Over **24 encounters at `hearthollow`**: **10 catches** where the
pre-recovery measurement of the same slice got **zero**; **4 wipes** at 5 ticks each; **20 of the
run's 40 ticks** spent waking up; year 1 ending at `hearthollow`. And **the first three encounters are
all losses** — the granted juvenile starter loses to Elders and Adults alike, and the run only becomes
viable once the fourth encounter's catch enlarges the party. That is the table above arriving in a
real run: ~80% losses and ~79% one-shots, now with the loss persisting. **Half the year buys the
opening.** The material is in STATUS's waiting-on-the-owner register as one item, deliberately, rather
than filed twice.

⚠ **THE "10 CATCHES" IN THAT RE-MEASUREMENT IS A READING OF A PLAYER THE SHIPPED GAME CANNOT PRODUCE,
and it is marked rather than deleted, because the loss and tick figures beside it are unaffected.**
The harness hands its reference player a snare tier as a parameter with **no inventory check at all**
(`tools/harness/full-run.ts:235` passes `ref.snareTier` straight to `catchChance`), and a gym bag is
constructed outright (`tools/harness/player.ts:495`, *"one salve per party member, nothing else"*). A
real player holds none of it — **T-60**. So *"the vertical slice catches again"* is true of the model
and false on screen. **The wipes, the ticks and the losses stand; the catches do not.**

**AND THE TABLE IS NOW CONFIRMED ON SCREEN, WHICH IS NEW EVIDENCE OF A KIND THIS TICKET DID NOT HAVE.**
The 2026-08-27 playtest `[SAW]`, on the **first random encounter of a new game, in the starting town,
on turn one, at full health**: Cindril **Lv 5, 58/58** against a wild **Lv 5 Loamunder, 111/111**.
Cindril's Singe took the Loamunder 111 → 87 (**24**, five more turns needed); the Loamunder's Sunder
took Cindril **58 → 0 in one hit**. Message: `Party down`. The rival's **Lv 6 Nibbin** did the same.
**Cindril's own Pyre reads 58** — the starter's best move is exactly its own HP total.

**This is a balance question for the owner, not a defect for an agent to patch** (G2, G14, T-11's
ruling). What the playtest adds is the consequence, which is not a balance claim: **combined with the
wipe softlock appended to T-29, a new player's run ends inside a minute of play**, and the vertical
slice past R1 is unreachable in practice — Brackwater is behind the act gate, which needs Maribel's
badge, which needs a creature that survives one hit `[SAW/INFERRED]`.

**Nothing was tuned to produce any of these numbers and nothing should be.** Levels, rosters, stats and
balance values are Hank's; G2 and T-11's ruling forbid an agent moving them, and G14 forbids moving a
target to accommodate a result.

### T-39 · `sanctum-antler-ring` sits exactly on the Sanctum's spawn cell
**Status:** TODO — **a genuine data conflict, not a generator bug**

`data/nodes/sanctum.json:30` places the node's **only** prop at `x: 512` (`:32`), `y: 512` (`:33`),
`interactionRadius: 48` (`:34`).

That is the spawn cell, and the arithmetic is worth writing down because the units differ at every
hop. Prop coordinates are authored in **native px** and scaled to world at `game/props.ts:47-48`; the
spawn is returned in **tiles** by `chooseSpawnTile` (`game/collision.ts:716`), which spirals from the
lattice centre `Math.floor(64/2)` = tile **(32,32)**. Tile (32,32) at `tileStepPx` 32 is world
(1024,1024), which at `mapRenderScale` 2 is native **(512,512)** — the prop's exact position. The
radius is 96 world px, so the player does not land *near* it, they land **inside** it.

**Two map rules meet on one cell**: *"keep the centre clear"* and *"mark every prop in the painting"*.
The Sanctum is where they coincide, because it has exactly one prop and it is the centrepiece.

**Done when:** the conflict is resolved in `data/nodes/sanctum.json` — the prop moves off centre, or
the Sanctum's spawn is authored away from the lattice centre — and whichever rule yields is written
down where the map lane will read it. The map lane owns the painting; this ticket owns the node file.

### T-40 · `DexScene` and `SummaryScene` take an optional `onClose`
**Status:** DONE — **both are required now, and both carry the runtime fallback as well.**

`game/scenes/DexScene.ts:72` and `game/scenes/SummaryScene.ts:57` both declare `onClose: () => void;`
with no `?`, so a launcher that forgets one no longer compiles. The belt-and-braces half landed too:
`closeScreen` (`game/scenes/DexScene.ts:102-114`) is one shared exit shared by both scenes and by
`SurveyScene`'s pattern — it warns and reopens the menu rather than stranding the player when it is
handed something that is not a function, which the type system cannot prevent at a `scene.start`
boundary. `SummaryScene.ts:51` records the reason on the field itself, where whoever loosens it will
read it.

### T-41 · The manifest says `fit: true`; `toSprite()` calls `nearestResample`
**Status:** TODO — **pre-existing at HEAD; not introduced by T-24's repair**

`tools/comfy/manifest.json:345` sets `classes.player.postprocess.fit: true`, and the honest chooser at
`tools/postprocess/chain.ts:104-105` reads that recipe (`recipe.fit ? fitResample : nearestResample`).
But `toSprite()` — `tools/comfy/player-views.ts:553`, resample at `:557` — calls **`nearestResample`
unconditionally**:

    removeFlatBackground(quantize(nearestResample(trimBackground(src, bg), W, H), palette), bg)

So the shipping batch pipeline and the derived player views disagree about how the player is
resampled. They are not interchangeable: `nearestResample` is `tools/postprocess/steps.ts:147`, and
`fitResample` (`:176`) calls it at `:181` after letterboxing to the target.

**Done when:** `toSprite()` honours the recipe, or the manifest row is corrected to `fit: false` —
whichever matches the approved front sprite's actual geometry, **decided by decoding it rather than by
reading either file.** `tests/gates/player-art-contract.test.ts` is where the answer gets bound.

### T-42 · Comments still calling a season four ticks long
**Status:** DONE — **and the ticket's own count was wrong: there were FOUR, not three.**

The fourth was a test docblock (`tests/unit/overworld-scene.test.ts:1487`) carrying the same figure,
found while the named three were being fixed. `balance.clock.ticksPerSeason` is **13**.

None of the four now states the number as the current rule. `game/scenes/OverworldScene.ts:1830` says
in as many words that this line *"said '4-tick' for as long as that was false"*; `:2349`,
`core/regional-events.ts:418` and `tests/unit/overworld-scene.test.ts:1487` each name the window as
`clock.ticksPerSeason` and mark the old figure explicitly as the then-shipped 16-tick year, so a
reader cannot mistake the history for the rule. That is T-25 item 2's repaired `seasonBoundary`
docblock applied as a pattern: **name the balance key, refuse to name the number.**

**A fourth instance of this file's own standing rule** — *a ticket's own predicted number is not a
measurement.* Re-grep before you believe a count written here.

---

### T-43 · The palette append needs its own generator — `fit.mjs` structurally cannot make one
**Status:** TODO — **a separate generator is the only correct shape, not a workaround.**
Sequencing is Hank's and is open (STATUS, waiting-on-the-owner).

**What an append has to guarantee:** the existing swatches keep their ids and their bytes. `c00`–`c31`
byte-identical, new colours appended after them. That is the whole reason to append rather than
re-freeze — T-15's lesson is that **a palette id is a SLOT, not a colour**, and fifteen of nineteen
`UI_SWATCH` roles had to be re-pointed the last time a freeze moved values under fixed ids.

**`tools/palette/fit.mjs` cannot produce that, and passing it a bigger K makes it worse rather than
better.** Both properties were read in the file:
- **`K = 32` is a module constant** (`:61`) with no CLI override — the flags are `--sources`, `--out`,
  `--outdir`, `--label`, and nothing else (`:78-99`).
- **Ids are re-derived from sorted ramp position** (`:373`), over a sort at `:361-372` that puts the
  neutral ramp first by L\*, then groups chromatics into 30° hue families and orders within them by
  L\*.

So a larger K does not extend the list: it refits from scratch and **silently re-orders every existing
id**. Nothing errors. `data/palette.json` still holds `c00`–`c31`; they are simply different colours
than they were, and every consumer that stored a slot id is now pointing somewhere else. **That is
precisely the failure the append exists to avoid, arriving through the tool meant to prevent it.**

The fitter is a **re-freeze** instrument by construction, and a re-freeze is what an append must not
be. Recorded here because the obvious future instinct is *"why not just pass K to the fitter"*, and
the answer needs to be on record before somebody spends a session on it.

**Done when:** a generator exists that reads the frozen 32 as fixed input, fits only the additional
swatches, writes them at ids after `c31`, and **refuses** if any of the first 32 hexes moves — with a
test that sabotages exactly that and reds. The gate that would notice it downstream already exists:
`tests/gates/asset-palette-contract.test.ts` reads the palette from disk at test time rather than from
a copied list, and `tests/gates/ui-contrast-contract.test.ts` reds if the UI goes illegible under a
palette change.

---

## Opened 2026-08-27 by the progression-loop pass — three comments that went false in silence

**All three share one shape and it is the shape this queue keeps paying for: a sentence that was true
when written, is false now, and has NOTHING that will ever go red to say so.** Two of the three sit in
files a green suite runs over every time. They are recorded rather than fixed here because each is in
a file another lane holds; none is a behaviour defect, and none blocks anything.

### T-44 · A test comment says `GameAction` deliberately has no `blackout` member
**Status:** TODO — **the test PASSES and its stated reason is dead, which is the dangerous half**

`tests/unit/overworld-scene.test.ts:1194` reads, in a block explaining why the assertion below it goes
through `readBlackout` rather than comparing `action.t`:

> `core/types.ts` `GameAction` deliberately has no `blackout` member (see `core/save.ts`
> `blackoutAction`), so a string comparison here does not even typecheck.

**`core/types.ts:684` is that member** (T-33). A string comparison would typecheck fine now. The
assertion itself is still good — reading through `readBlackout` checks the payload's *shape* and not
just its tag, which is a better test — but **the reason given for it is no longer true**, and nothing
in the suite can notice: the test is green and will stay green.

**Done when:** the comment states the real reason (`readBlackout` validates the payload, a tag
comparison does not) instead of a compile-time claim that has expired.

### T-45 · `core/recovery.ts:30` says `core/save.ts` owns `BlackoutRecovery`
**Status:** TODO — **imprecise, not broken; nothing to repair in the code**

`core/recovery.ts:30` reads *"WHAT LIVES WHERE. `core/save.ts` owns the TAPE — `BlackoutRecovery`,
`blackoutAction`, `readBlackout`, `applyBlackout`."* Three of those four are in `core/save.ts`. **The
TYPE is not:** `BlackoutRecovery` is declared at `core/types.ts:634` — it had to move, because
`GameAction` names it and `core/types.ts` may not import from a sibling — and `core/save.ts:622`
re-exports it (`export type { BlackoutRecovery } from "./types";`), which is why **every import is
unchanged and nothing is broken.**

The sentence's actual claim — that `save.ts` owns the tape and `recovery.ts` owns the decisions — is
correct and worth keeping. Only the enumeration is off by one member.

**Done when:** the list names the three functions and says the type lives in `core/types.ts` and is
re-exported, with the reason (`GameAction` names it) beside it.

### T-46 · A fossilised precondition asserts the repo has no maps on disk
**Status:** TODO — **RED in the suite today; one of the ten failures**

`tests/unit/manifest.test.ts:1414` asserts `existsSync(resolve(REPO_ROOT, node.mapAsset))` is
**`false`** for `r1`, under a comment at `:1410-1413` reading *"The repo's true state today: no node
has a base map or a mask on disk, so the honest verdict for every year variant is REFUSE."*

**Ten maps landed.** The premise expired and the setup went red with it — this is the *fossilised
anchor* shape (STATUS, "a derived artifact carrying a hand-written claim") arriving in a
**precondition** rather than in an expected value.

**The claim the test exists to make is worth keeping and must not be weakened**: a node with no
collision mask must **REFUSE**, never fall back to "every pixel is walkable", because a fallback
compares the whole frame and turns the gate into decoration. The body already builds a temp dir and
writes the base map so that *the mask is the only thing missing* — which is the right rig. **Only the
opening assertion about the repo's own state has to stop being made**, or be made against the temp
dir rather than `REPO_ROOT`.

**Done when:** the precondition no longer asserts the repository is empty, the REFUSE claim is
unchanged, and sabotaging the refusal still reds it.

---

## Opened 2026-08-27 by the doc-currency pass — the seams the maps made visible

**T-47 through T-50 were invisible until the maps landed**, and they are one dependency wearing four
faces: **the art lane now decides things the code has already guessed at.** None is a defect in
shipped behaviour; every one is a place where a number, a check or a route exists on one side of that
seam and not the other.

**T-51 and T-52 are a different pair and are about instruments, not seams.** One was a real defect
already repaired by the time it could be written down; the other is a dependency that is correct today
with nothing watching it. **Neither asks anybody to change working code**, and both are here because a
thing nobody is measuring is this queue's most reliable source of expensive surprises.

### T-47 · Every interior door coordinate is a guess, and the guess is about to be checkable
**Status:** TODO — **blocked on the art lane declaring the map set; the code half is a paste plus a
possible blueprint edit, see the caveat**

**Every `door` object in `data/interiors/*.json` says so about itself.** From
`data/interiors/hearthollow-inn.json`, verbatim:

> **PROVISIONAL PLACEMENT** — the canon gives no coordinate, no compass direction and no prop for
> this building; see `_canonSilent`. Units are map-native pixels in the 1024-square painted town, the
> same space `data/nodes/hearthollow.json` props use. Placed west of the green and north of the
> middle, clear of the two things the town map does pin: the exact centre stays empty ground, and the
> survey board stands at 512,648.

All four blueprints carry a `_note` of that shape. The coordinates today are
**hearthollow-inn (296,392) · hearthollow-supply (712,372) · brackwater-inn (296,372) ·
brackwater-supply (300,596)**, each reasoned from the handful of positions the canon does pin and
from nothing else, because there is nothing else. **This is a dependency running ART → CODE and it is
currently invisible**: nothing goes red when the painting lands, nothing lists these four numbers as
outstanding, and a door on grass looks exactly like a door on a doorstep to every test in the repo.

**The provisionality is now MEASURED rather than asserted, which is new.** The art session ran
`tools/mapgrid` against the current Hearthollow painting and read the provisional inn door at
(296,392) as landing **on grass between two trees**, while (512,512) lands on open walkable
crossroads. ⚠ **That is a reading off a mid-round trial map that will be replaced, so it is evidence
that the re-pin is NECESSARY and it is not a coordinate to act on.** Do not paste 512,512.

⚠ **CAVEAT — A NON-SOUTH DOOR IS A BLUEPRINT EDIT, NOT A COORDINATE PASTE.** Measured across all four
shipped blueprints: every one puts `D` on the **bottom row** and declares `facing: "south"` —
hearthollow-inn (col 6, row 7 of 8), hearthollow-supply (col 5, row 6 of 7), brackwater-inn (col 6,
row 6 of 7), brackwater-supply (col 5, row 7 of 8). **A non-south door has therefore never existed in
this project.** If the painted map puts a door on a north, east or west wall, **three things move
together or the room is entered through a wall**:
1. the `D` is re-cut into that wall of the ASCII `plan`;
2. `arrival` moves to the floor cell one orthogonal step inside the new doorway — `blueprintProblems`
   enforces exactly that, so getting it wrong refuses at load rather than failing quietly;
3. the `_room` sentence is rewritten, because it names the wall **in words**, and the validator
   refuses a `_room` that has drifted from its drawing (`core/interiors.ts:422-426`).

The art session has agreed to **flag any non-south door in the door manifest it hands over**,
precisely because that flag costs real work and its absence would silently produce a room the player
enters through a wall.

**Done when:** the owner declares the map set; each of the four doors is re-pinned to the door the art
lane actually painted; any non-south door has had all three of the above moved with it; and the
`_note` on each door stops saying PROVISIONAL and says which painting it was read off.

### T-48 · Interiors cover four buildings in two towns, and three towns have none at all
**Status:** TODO — **the SCOPE half is Hank's and is in STATUS's waiting-on-the-owner register; the
GAP is recorded here so it stops being invisible**

**Hank, verbatim:** *"This game is nowhere near deep enough to need twenty homes in a town. A town
should be a handful of buildings, and nearly all of the buildings should have an accessible
interior."*

**What exists: four blueprints.** An inn and a supply shop in **Hearthollow**, an inn and a supply
shop in **Brackwater**. That is it — `ls data/interiors/` returns four files.

**What has no interior at all**, read off `docs/content-bible.md` §6's six-town table and
`data/nodes/`:
- **Bowerdeep** (act 3, forest canopy) — the manifest itemises a night market, a winding house, an oil
  shed, a gym hall and an inn.
- **Cindershelf** (act 4, volcanic steppe) — the relic forge is a bible §6 unique feature.
- **Duskhollow** (act 5, dusk vale) — the observatory is a bible §6 unique feature.
- **The Sanctum Fallow** (act 6) is **NOT** in this list and must not be added to it: bible §6 says
  *"no shops, one long approach"*, so having no interior is what the canon asks for there.

**Do not invent a building to close this gap.** The three towns above are gaps in *coverage*, not
missing files: under G2 every added interior must derive from canon the way the existing four do —
every physical feature traced in `_featureSource` to a shipped line, every silence named in
`_canonSilent` rather than filled. For a building the corpus barely mentions there may be nothing to
derive from, **and where the canon is silent that is part of what the owner is deciding, not a licence
to invent an inside.**

**Two facts he may want while deciding, both re-verified.** **The engine is not the constraint** — a
new interior is a `data/interiors/*.json` file and its citations, not code; the model, the loader, the
tests and the scene layer are all generic. And **the gym hall is a different question from the rest**:
gyms are challenged today by a keypress from the town node, with no building, no door and no position,
yet six shipped leader lines already describe a room with a door and a bench — so making one enterable
changes *how gyms are challenged*, not just how many rooms exist.

**Done when:** the owner rules on how many buildings get an inside; the chosen set is authored under
the same `_featureSource` / `_canonSilent` discipline; and this ticket records which towns were
deliberately left without one and why.

### T-49 · The maps paint edge exits, and nothing can walk through them
**Status:** TODO — **the art is already deliberately painted for this; the code has never had it**

**Travel is a number-key menu, and the code says so in as many words.** `travelTo`
(`game/scenes/OverworldScene.ts`) refuses on exactly `adjacency` and the act ladder, and the keys that
reach it are `this.travelKeys.forEach((key, i) => … this.node.adjacency[i])` in `update`. The
docblock over `travelTo` states the deviation itself:

> DEVIATION (reported, not silently taken): the node schema carries no exit or portal positions —
> `props[]` is antler stones, shrines, idols and sign cards — so there is nothing in the data that
> says where an edge of the map leads. Travel is therefore an explicit action keyed on `adjacency`,
> not a walk-off-the-edge, and the HUD lists the destinations. **A door prop kind would change this,
> and that is a content decision, not one to invent here (G2).**

**Walk-through-edge does not exist. What DOES exist is the painting.** The art session reports the
maps paint **two edge exits each — bottom back toward Hearthollow, top on toward the Sanctum — with
Hearthollow and the Sanctum painting one apiece.** Corroborated from the code side by reading
`tools/comfy/manifest.json`'s `_nodes` block: `r1` *"leaves at the bottom by a gate gap in a broken
drystone wall toward the village"* and *"goes on at the top toward the marsh"*; `r2` drops *"at the
bottom onto a mud landing … toward the stilt town"* and reaches *"firm peat at the top toward the
forest"*; `cindershelf` and `duskhollow` the same shape; `hearthollow` paints only the top gate; the
`sanctum` only the bottom path. **The art is deliberately painted so the exits are unambiguous when
it lands** — which means the moment it lands, the maps promise a route the game refuses.

**This ticket is the code half and it names the prior question rather than answering it.** The
docblock is right that a door prop kind is a content decision (G2). So the work splits:
- **the content question** — does `props[]` gain an exit/portal kind carrying a destination and an
  edge, or does the exit derive from `adjacency` plus which edge the art painted? An agent may not
  pick;
- **the code question, which is decidable once the first is** — a step onto an exit cell calls
  `travelTo` with the destination it names, paying travel's one tick exactly as the keypress does, and
  the number-key menu stays as the accessible route rather than being replaced.

**Done when:** the exit's data shape is ruled on; walking onto a painted exit travels; the tick is
charged once and not twice; and the number-key menu still works.

### T-50 · The door facing↔wall check lives only in the test layer
**Status:** TODO — **narrow exposure, stated so whoever works it does not over-build**

**`door.facing` is asserted to agree with the wall the plan cuts its `D` into** at
`tests/unit/interiors.test.ts:440`: it derives the wall from the `D` cell's row/col against the plan's
bounds, refuses an interior `D`, and then asserts `wall === bp.door.facing`. **`blueprintProblems`
(`core/interiors.ts`), the load-time validator, does not make that check.** So a blueprint whose
facing disagrees with its wall **fails the suite but would load at runtime without complaint** — the
check exists in the place that runs on CI and not in the place that runs on a player's machine.

**The exposure is narrow, and saying so is part of the ticket.** `blueprintProblems` already enforces
the stronger, related invariant — **arrival must be exactly one orthogonal step from the `D` cell** —
and `enterInterior` derives the walk-in direction **from that step**, not from `door.facing`. So a
wrong facing cannot make the player walk in backwards. What it can do is put a door glyph on the wrong
wall of a room the validator has already accepted.

**This matters more now than it did**, because T-47 will edit these blueprints against a painted map,
and a non-south door is the first case where the two could ever disagree.

**Done when:** either the check moves into `blueprintProblems` beside the arrival-step rule and the
test asserts through the validator rather than beside it, or a comment on `door.facing` records that
the invariant is test-only and why that was judged sufficient. **Do not delete the test either way.**

### T-51 · `tools/mapgrid` bypassed the engine's cross-check — **fixed in flight, before the ticket**
**Status:** **CLOSED — the defect was real and is repaired.** ⚠ **Opened and closed within one pass,
and written down rather than dropped, because the SEQUENCE is the useful part.**

**The report, and it was correct when it was made.** `tools/mapgrid/run.ts` — the new tool that
overlays the engine's collision grid on a painted map so a coordinate is READ rather than estimated,
and therefore the instrument T-47's re-pin will be verified against — landed reading `collisionCols`,
`collisionRows`, `collisionCellPx` and `mapNativePx` as four independent numbers through a raw
`JSON.parse`. **They are not independent.** The engine refuses a `balance.json` unless
`collisionCols × collisionCellPx === mapNativePx`, and likewise for rows: `gridConsistencyProblem`
(`game/collision.ts`) states it directly and `zBalance`'s `.superRefine` (`core/schemas.ts`) derives
the same constraint as a division. The tool went through neither. **They agreed anyway — 64 × 16 =
1024 — so it drew the engine's real grid; the exposure was drift.**

**It was repaired twice in five minutes while this doc pass was running**, which is why the ticket
exists only to record it: first by parsing through **`zBalance`**, the engine's own schema, and
throwing on the schema's own issue messages; then by **dropping a `gridConsistencyProblem` import that
had been added as defence in depth.** That second move is the one worth keeping, because it looks like
a weakening and is not: the call was **unreachable** — zod fires first in every case — and it made a
node tool depend on `game/` staying free of Phaser, **which `game/` never promised.** L11 forbids
Phaser in `core/` only; `game/` is the layer that is allowed to import it, so a legal edit to
`game/movement.ts` would have broken this tool far from the cause. `core/schemas.ts` carries no such
hazard, because L11 is exactly the rule that keeps `core/` importable from a plain node script.

**Why it was worth a ticket at all, stated so the closure is not read as "a dev-tool nit".** mapgrid
is an instrument, and an instrument cheerfully drawing a 64×64 grid while the engine refuses to boot
on the same file is **this repo's most expensive recurring shape** — ten instances in STATUS item 39,
every one of them a tool reporting confidently on something it could not resolve. The tool's own
docblock now says it in the file: these are *"not four independent numbers — they are three statements
of one fact"*.

**And the standing rule this ticket illustrates is not "the reporter was careless" — it is the
opposite.** The report was accurate against the tree when it was made and inaccurate against the tree
forty minutes later, and **both readings were correct measurements of different trees.** *Re-read the
file before you cite it* cuts in this direction too: a doc pass that had pasted the report without
re-reading would have published a live defect ticket against code that was already fixed.

### T-52 · The `tools/` → `game/` dependency needs a gate, and ONLY a gate
**Status:** TODO — **the dependency itself is fine and must not be "fixed"; the ticket is the gate**

⚠ **Read the first sentence before acting.** This ticket exists because a dependency class that is
currently correct has **nothing watching it**, not because anything is wrong. An agent that arrives
here and starts deleting imports is doing the wrong work.

**What was measured: nine import sites across five files reach four `game/` modules from `tools/`.**
- `game/collision.ts` ← `tools/mapgen/layout.ts`, `tools/mapgen/render.ts`, `tools/mapgen/verify.ts`,
  `tools/collision-editor/main.ts`
- `game/survey-view.ts` ← `tools/ui-frames/contact-sheet.ts`
- `game/ui/Palette.ts` ← `tools/ui-frames/contact-sheet.ts`, `tools/ui-frames/theme.ts`
- `game/placeholder.ts` ← `tools/collision-editor/main.ts`

**Why none of it is a violation.** L11 forbids Phaser in **`core/`** and says nothing about `tools/`;
the first three modules are transitively Phaser-free, and `game/placeholder.ts` imports Phaser
directly and is reached only from `tools/collision-editor/`, **which is browser-hosted** — it ships an
`index.html` and a `vite.config.ts` and `package.json` runs it as
`vite --config tools/collision-editor/vite.config.ts`. A browser tool importing Phaser is a browser
tool importing Phaser.

**What is missing is the guard on the NODE-SIDE subset.** A plain node script that reaches into
`game/` is depending on `game/` staying Phaser-free, **which `game/` has never promised** — that is
precisely the hazard T-51 recorded when `tools/mapgrid` dropped its `game/collision.ts` import: a
legal edit to `game/movement.ts` breaks a node tool far from the cause. Today nothing would go red.

⚠ **The count in this ticket is itself a worked example of STATUS item 39 №11 and the number must not
be trusted without re-deriving it.** The first walk used a `^import … from` pattern and found **five**
sites; several real imports in this repo span lines with the specifier on the closing line, so the
regex missed four and dropped `game/survey-view.ts` out of the audit entirely. **The smaller answer
was the tidier one.** Re-derive with a multiline-aware read, not a line-anchored grep.

**Done when:** a gate in `tests/gates/` enumerates the node-side `tools/` entry points, asserts that
none of them transitively reaches Phaser, names the browser-hosted exceptions **explicitly rather than
by a path prefix**, and **reds under a sabotage that adds a Phaser import to a module one of them
already pulls in.** A gate that only lists today's imports is a snapshot, not a guard.

---

## Opened 2026-08-27 by the collision doc-currency pass — the replay union, and the mask seam

**T-53, T-54 and T-55 are one audit, not three findings.** The inn-rest defect that landed this pass —
a tape entry minted with no `replay()` arm — was found by symptom. The union was then walked end to
end so the remaining instances would be found by enumeration instead. `GameAction` has **16** members
— ⚠ **this said 14, and the economy pass added `payout` and `grant`** — **twelve have arms**, and the
four that reach `default` are below and are **the same four**. **One of the four (`inn`) is correct**
and is recorded as correct, because a list of four gaps where one is not a gap is how a real one gets
dismissed.

✅ **AND THE AUDIT'S OWN ARGUMENT WAS HONOURED BY THE NEXT LANE TO TOUCH THE UNION, which is worth
recording because it is the only evidence that writing this down changed anything.** Both new members
shipped **with** their reader, their applier and their `replay()` arm **in the same commit as the
type**, under an explicit rule — *"an applier refuses exactly what its reader refuses"* — added after
`applyPayout(save, 12.5)` was found paying on the live path while `readPayout` returned null, so a
replay applied nothing and the divergent save still loaded. **That is the `{t:"innRest"}` shape
caught before it shipped rather than after.**

**T-56, T-57 and T-58 are the mask seam.** None is a defect in shipped behaviour. T-57 is the owner's
and is the prior question the other two wait on.

### T-53 · Travel does not restore `currentNode` on replay — **A RULING IS OWED, NOT A PATCH**
**Status:** TODO — **blocked on a decision. Do NOT open this by editing the test that pins it.**

**The defect is structurally identical to the inn-rest one just fixed**, so L10 is false for
`currentNode` on any run that travels and does not black out. `{t:"travel"}` is minted at
`game/scenes/OverworldScene.ts:3118` and again by `core/recovery.ts:316` (the blackout's price, levied
at `OverworldScene.ts:2179`). There is no `case "travel"` in `replay`; it lands in `default`
(`core/save.ts:1297`), and the **only** write to `currentNode` anywhere inside `replay`'s reach is
`applyBlackout` (`core/save.ts:716`).

⚠ **AN EXISTING TEST PINS THE CURRENT BEHAVIOUR, AND IT PINS IT ON PURPOSE.**
`tests/unit/recovery.test.ts:521` asserts

    expect(replayed.currentNode).toBe(before.currentNode);

inside *"and it is the BLACKOUT ENTRY that carries it — the priced entries beside it are only prices"*
(`:501`), under `describe("§5 determinism (build-doc §8.1 / L10)")`. Adding a travel arm turns it red:
the rig strips only the `blackout` entry, asserts the `travel` entry is still on the tape, and proves
the travel's `to` is a **different** node from `before.currentNode`.

**And the comment above it (`:502-509`) is the ruling this ticket needs overturned or upheld.** It
records that teaching `replay` to move `currentNode` on a `travel` entry was measured **invisible**
against a tape carrying only the consequence, and argues the position deliberately: **`travel` is a
price; the `blackout` entry is the one authority on `currentNode`** (`core/types.ts:673-683`). So this
is a design dispute between two coherent readings of the tape, not an oversight.

**Weakening that assertion to land a change is forbidden here** — the standing rule, and
`justify-test-edit`. The two readings:
- **`travel` is a price.** Then `currentNode` is not on the tape at all, L10's scope excludes it, and
  the thing to fix is the *claim*, not the code — the row in STATUS and the docblocks say so.
- **`travel` is a move.** Then it gains an arm, `recovery.test.ts:521` is rewritten **through its own
  protocol** rather than loosened, and the blackout stops being the only authority.

Corroboration that callers already work around it: `tests/gates/quest-layer.test.ts:763` and `:767`
both hand-write `{ ...appendAction(out, { t: "travel", to }), currentNode: hop }`.

**Done when:** the reading is ruled, the losing side's text is corrected where it stands, and — if
`travel` becomes a move — the pinning test is replaced under its own terms and a sabotage reds it.

### T-54 · `{t:"foray"}` does not restore `forayStepsSinceTick` on replay
**Status:** TODO — **same shape as T-53, smaller blast radius, and an arm alone cannot close it**

Minted at `game/scenes/OverworldScene.ts:1311`; no arm; `default`. Inside `replay` the counter is only
ever whatever `initial` carried (`core/save.ts:1090`), i.e. `0` for a fresh run.

**The blast radius is small and saying so is part of the ticket.** The counter is zeroed the instant it
crosses the threshold (`OverworldScene.ts:1310`), so it is always below `stepsPerForay` and feeds
nothing but the next foray charge.

⚠ **CORRECTION TO THE OBVIOUS FIX: a `case "foray"` cannot restore it.** The entry is
`{t:"foray"; nodeId}` (`core/types.ts:643`) and **carries no odometer value**, and a plain walked step
mints no tape entry at all. An arm could only set the counter to `0` — true at the mint instant, and
blind to every step walked after the last foray entry. So the choice is a **new field on the entry**,
or **accepting the counter as outside L10's scope and saying so where the claim is made.**

**A stale citation found while measuring this, corrected in STATUS and named here so it is not
re-introduced:** `forayStepsSinceTick` appears **nowhere in `tests/property/`**. The determinism test
it was credited to covers it only vacuously, through a whole-save comparison in which both sides read
`0`. The real coverage is the **serializer's** round trip (`tests/unit/save.test.ts:212`) and the scene
reload and year turn (`tests/unit/overworld-scene.test.ts:3124`, `:3452`) — all true, and all a
different round trip from `replay()`'s.

**Done when:** either the entry carries the value and an arm applies it, with a test that reds when the
arm is deleted; or the exclusion is written on the field and the STATUS row stops implying otherwise.

### T-55 · `{t:"battleAction"}` is a dead union member — a deletion, not an arm
**Status:** TODO — **unreachable rather than unapplied, so NO replay arm is owed**

**Zero mint sites in `core/`, `game/` or `tools/`.** The identifier's only occurrences anywhere are the
union member itself (`core/types.ts:651`) and two prose comments (`core/types.ts:646`,
`game/scenes/OverworldScene.ts:1367`). **No test constructs one either** — the hits under `tests/` are
`perf.battleActionBudgetMs`, a balance key, and a substring collision.

**Nothing can put one on a tape, so `replay` can never receive one.** Even a hypothetical producer
would owe no state: a fight's whole consequence already reaches the tape as `battleAftermath`, `catch`
/ `release` and `gymVictory`. This is the opposite disposition from T-53 and T-54 and must not be
filed with them — **the correct fix is deletion of the member**, and it belongs to whoever owns the
battle tape. A stale tape from another build carrying one is handled correctly by `default` under
INV-2.

**Done when:** the member is deleted and `npx tsc --noEmit` stays at exit 0 — or, if it is kept as a
reserved slot, the comment on it says that is what it is.

### T-56 · Landing a collision mask is a GATE RECALIBRATION, not an art approval
**Status:** TODO — ⚠ **NO LONGER BLOCKED BEHIND T-57, WHICH DISSOLVED. It is now blocked behind each
node's own TILED PAINTING, which is a different and smaller gate.** The work here is still the gates
and it is still not optional.

⚠ **Read the unblocking narrowly.** T-57 closing does **not** mean the twelve masks may be promoted.
It means the *question* of which artefact wins no longer exists, because both derive from one layout.
**A node's mask may land on the commit that lands that node's composed painting, and not before** —
and **zero nodes have a composed painting shipped today.** So the sequence is: cut the node's biome
tile family (**T-73**), compose it, and land painting + mask together, one commit per node, with the
three gates below re-decided on the first one.

**Twelve masks already exist**, git-ignored, as `tools/mapgen` output at
`assets/raw/_layouts/masks/mask-<id>.png`. Nothing in `data/`, `game/` or the Vite-served copy points
at them. So "promote the masks" is a file move plus the gate changes below — **and it must not be
taken before T-57 is ruled**, because a mask that is geometrically exact against the wrong picture
blocks the painted road and opens the painted house.

**Gate 1 — `tests/unit/overlay-diff.test.ts:1086-1095` goes red on the FIRST mask, by design and by
its own instruction.** Verbatim at `:1093`: *"a collision mask now exists — re-measure the residual
limits against it and update this test"*, asserting `missing.length` equals `content.nodes.length`. It
filters **every** node, so one mask reds it.

**And the re-measure it asks for is real work, not a constant bump.** The overlay-diff IoU is
restricted to the mask's walkable cells — `tools/overlay-diff/diff.ts:252` builds the restriction,
`:268` discards every non-walkable pixel from the population — with `allWalkable`
(`tools/overlay-diff/mask.ts:125-127`) as the no-mask fallback. **Landing a mask changes what that
gate measures over**, so its residual limits were calibrated against a *luminance-derived stand-in*
(`tools/overlay-diff/mask.ts:31-38`, which says so) and do not carry over.

⚠ **Gate 2 — `tests/unit/manifest.test.ts` — THIS TICKET'S OWN CORRECTION HAS ITSELF BEEN OVERTAKEN,
AND THE SCOPE WENT UP RATHER THAN DOWN.** It said the test was already red on `existsSync(node.mapAsset)`
(T-46) and that, once that was fixed, **only `r1`'s mask** would touch the mask assertion, because the
test hardcoded `n.id === 'r1'`. **T-46 is now DONE, and the repair WIDENED the mask half rather than
leaving it alone**: it asserts that the set of nodes with a mask on disk is **empty, by name**, over
**all twelve**, with the message *"a collision mask shipped — see T-56 before touching this"*. **So a
mask for any node reds it, not only `r1`'s.**

⚠ **Gate 3 — `tests/unit/collision.test.ts` — was never counted here at all.** *"STATES THE GAP: not
one node's declared mask is on disk, so the synthesised branch IS the game"*, failing with *"a
collision mask now EXISTS. The synthesised stand-in is no longer what the game loads for this node."*
**The count of gates that go red on the first promoted mask is THREE**: overlay-diff, manifest and
collision. This ticket has now published one, then one-plus-an-already-red-one, and now three. **Count
it by grepping for the assertion, not by trusting the last count written down** — which is this
queue's own standing rule about a ticket's own numbers.

⚠ **AND THE RULE THE PROMOTION OBEYS IS PER NODE, not per repo.** `docs/STATUS.md` carries it:
**a node may ship its collision mask on the same commit that ships its TILED painting, and not
before** — a mask derived from a layout is only correct against a painting composed from that same
layout. Nine nodes on disk are still generated images that no layout produced, so a mask against one
of them still blocks the painted road and opens the painted house. ⚠ **This rule was written when
tiling was unruled and it deliberately presupposed nothing about the outcome; the ruling has landed
and it does not change a word of it.** The rule and the old blanket *"do not ship generated masks"*
still give the same answer today, because **zero nodes have a composed painting shipped** — they part
company the moment one does, and this is the version to carry.

**Two stale comments found in the same file, recorded so they are fixed with the promotion rather than
re-discovered:** `tools/overlay-diff/mask.ts:31-34` says *"neither do the twelve base maps"* (ten
landed, nine are on disk), and `:11` says `tools/collision-editor/` is an empty directory — it ships an
`index.html`, a `main.ts` and a `vite.config.ts`, which `:24` of the same header contradicts.

**Done when:** ~~T-57 is ruled~~ — **met, by dissolution**; the masks are promoted **only for nodes
that have a COMPOSED painting the mask corresponds to**, one commit per node; the overlay-diff
residual limits are **re-measured against a real mask** and the gate updated rather than relaxed;
**all three** stated-gap assertions are re-decided rather than quietly left passing; and the two stale
header comments go with it.

### T-57 · **DISSOLVED** — when the painting and the collision layout disagree, which is authored first?
**Status:** CLOSED — **not answered, DISSOLVED, on the route this ticket's own *done when* named.**

⚠ **This ticket read *"TODO — Hank's. Recorded as the prior question T-56 and the map re-author both
wait on."* It is closed because the question stopped existing, which is a different thing from being
decided, and the difference matters to whoever reads T-56 next.** Its *done when* offered two routes —
*"Hank rules which artefact is authored first — **or rules on tile composition, which answers this by
construction**"* — and **he ruled on tile composition.** Under composition the painting and the mask
are both stamped from one 64×64 text file, so **neither is authored first: the LAYOUT is authored and
both images are derived.** Nothing wins, because nothing can disagree.

⛔ **BUT IT DISSOLVES PER NODE, AND THAT IS THE WHOLE OF WHAT T-56 INHERITS.** The correspondence is a
property of a *composed* painting. **Nine nodes on disk are still generated images no layout
produced**, and for those nine the disagreement below is exactly as live as it ever was. So this
ticket closing does **not** unblock a batch promotion of masks — it converts a question awaiting an
answer into an answer awaiting its nodes. **The operative rule is unchanged: a node may ship its
collision mask on the same commit that ships its TILED painting, and not before.**

⚠ **Do not close T-56 by pointing at this closing.** The reasoning below is kept in full because it is
what makes the per-node rule correct rather than cautious.

**The two artefacts have no shared source and nothing reconciles them.** The engine reads geometry from
`tools/mapgen/layouts/*.txt`; the art lane is drawing composition from hand-made top-down control
drawings. **The ten paintings on disk were not produced from the layouts** — `git show
HEAD:tools/comfy/manifest.json` contains zero occurrences of "controlnet", and the ControlNet lane
(`tools/comfy/controlnet-graph.ts`, `tools/comfy/hint-image.ts`) is untracked and has never been
committed.

**This is not a style question — it decides what a collision mask MEANS.** If the layout is authored
first, the painting owes it a road where the layout puts one, and the mask is correct the moment it is
generated. If the painting is authored first, the layout is downstream of a picture and must be traced
back off it after every art round. **Nothing currently makes either true**, which is why a mask
promoted today is worse than the all-open placeholder it replaces: the placeholder is visibly
unfinished, and a wrong mask stops the player walking down a road they can see.

**One in-tree sign that the two readings of a layout are already pulling apart**, from the art lane's
own uncommitted `tools/comfy/hint-image.ts`: a layout's outer wall ring *"is doing a real job"* as a
collision spec and is *"the defect"* as a composition brief, so the hint deliberately drops the ring
the mask depends on. **The two readings of one file disagree, inside the file that reads it.**

✅ **THE THIRD ANSWER THIS TICKET RECORDED AS UNAVAILABLE IS THE ONE THAT LANDED.** It read: *"It is
also gated on L7's conditional lock and G1, which say in as many words that an agent 'may not build or
slice tiles, and may not decide the condition has failed' — so it is recorded in STATUS's waiting on
the owner register and this ticket stays open until that is ruled."* **That was exactly right, and it
has been ruled.** The gate was real and it was the owner's to lift; he lifted it. ⚠ **Note what did
NOT happen: no agent decided the condition had failed.** He raised the question himself. **That is the
distinction this ticket was protecting and it survived intact** — which is worth recording, because
the outcome is identical to the one a rule-breaking agent would have produced and the process was
not.

**Done when:** ~~Hank rules which artefact is authored first — **or rules on tile composition, which
answers this by construction**~~ — **MET, by the second clause.** The remaining half of the sentence
is inherited by T-56 rather than discharged here: **the derived side's pipeline is written down**
(the layout is authored; painting and mask are both `tools/mapgen/compose/` output), **and T-56
proceeds under it, per node.**

### T-59 · The layout→mask round trip is demonstrated but not protected

**Status:** TODO — **no defect is known. The property holds today; nothing in the suite will notice
when it stops.**

**What is proven, and where it is NOT.** A scratchpad harness ran all twelve layouts end to end
through the shipped `loadCollision` — the same call `game/scenes/OverworldScene.ts` makes inside
`buildNodeView` — and reported **0 of 4096 cells differing on every node**, with sabotages that bit:
one repainted cell reported exactly one mismatch at exactly that coordinate, a vertical flip
**1274** cells and a horizontal flip **1434**, both independently matching truth-vs-flipped-truth
(so the round trip is a real bijection, not a coincidence of these twelve); a truncated PNG and a
byte-XORed PNG both threw; an all-black mask was refused. **That harness was briefed read-only and
deliberately kept out of the repo. It expires with the scratchpad.**

**What the suite protects is narrower.** `tests/unit/mapgen.test.ts` round-trips all twelve through
`checkMaskRoundTrip` (`tools/mapgen/verify.ts:406`) — **in memory, at `readMask`**, never calling
`loadCollision` (zero occurrences in that file). The equivalence to the shipped path is *argued* in
comments at `:14-16` and `verify.ts:401-404`, and the argument is sound — `loadCollision` with no
options delegates to `collisionFromMask` → `readMask` (`game/collision.ts:664-673`). **Sound argument
is not assertion.** No committed test writes a damaged PNG, flips a mask, or repaints a single cell.

**The work:** a committed test that round-trips at least one layout through the real `loadCollision`
to a PNG on disk and back, plus the repaint and flip sabotages, so the bijection is pinned rather
than remembered. It must prove it bites before it lands. Note it will need a fixture PNG or must
generate one into a temp dir — `assets/final/maps/*-mask.png` do not exist (T-56).

**Why this ticket exists at all**, and it is the transferable part: a doc pass auditing the claim
grepped **the repository** for the evidence, found none, and reported the sabotages "unsourced" and
the figure `1274` as "not occurring anywhere". Both true of the repo; both the wrong corpus. **An
instrument pointed at the wrong corpus returns a confident absence**, and absence is the most
persuasive clean answer there is. See `docs/build-doc.md` §16 on the pleasant reading being the one
nobody re-derives.

### T-58 · A hand-painted wall thinner than half a collision cell blocks nothing
**Status:** TODO — **a property, not a defect. Relevant ONLY if a mask is ever hand-edited.**

**Measured, live, through the shipping `walkableCells`.** A collision cell is **16 × 16 = 256 mask
pixels** (`data/balance.json:500` `mapNativePx` 1024, `:502` `collisionCellPx` 16, `:503-504` 64 × 64;
derived rather than trusted at `game/collision.ts:313-317`). The rule is a **majority**,
`tools/overlay-diff/mask.ts:97`:

    out[cy * grid.cols + cx] = total > 0 && walkable * 2 > total ? 1 : 0;

So a cell flips at **128 of 256** ink, and nothing below it registers at all:

| painted wall | verdict |
|---|---|
| 127 px of ink | walkable |
| **128 px of ink** | **blocked** |
| a 4 px-thick wall across the cell | **walkable — blocks nothing** |
| a 7 px-thick wall | **walkable — blocks nothing** |
| an 8 px-thick wall | blocked |

**A full-height wall must be at least half the cell wide to exist.** Two things travel with this or it
gets mis-filed:
- **Generated masks are structurally immune** and this is not a latent bug in the pipeline.
  `maskRasterFrom` (`game/collision.ts:279-295`) writes whole cells — 1024/64 is an exact integer, so
  every cell is a uniform 16 × 16 block of pure 0 or pure 255, i.e. 0/256 or 256/256, never near the
  boundary. `tools/collision-editor/main.ts:298` calls the same function rather than having a format
  opinion of its own.
- **It bites the first time somebody paints or retouches a mask by hand**, which T-56 makes plausible
  for the first time. A hairline wall drawn at art resolution is invisible to the sampler, and nothing
  goes red — the mask loads, it is `usable`, and the player walks through the wall.

**Done when:** nothing, unless hand-editing is adopted. Recorded so it is not rediscovered by a session
spent debugging a wall that loads correctly and does not work.

---

## Opened 2026-08-27 by the first live playtest — the game was driven in a browser

**Someone played it.** A session built the app, served it and drove it with real keys through the
title, the opening cutscene, Hearthollow, an interior, a wild fight, a rival fight, a gym, the in-run
menu and the survey. **The findings below are the first evidence in this repository that is not a
test.** Read STATUS's playtest section for the full account, including what works — which is a great
deal, and the survey most of all.

⚠ **PROVENANCE, AND IT BINDS EVERY LINE BELOW.** The bundle played was built from the tree **before
several of the commits that have since landed**, and `game/scenes/OverworldScene.ts` was being edited
by another lane *while the run was in progress*. **Every scene-level line number the playtest cited is
a reading against a stale tree and is not reproduced here** — where a line is quoted below it was
re-read on the current tree. The playtester marked their own observations `[SAW]` and their readings
of code `[INFERRED]`; **that distinction is preserved and must not be collapsed** — an inference is
not an observation because it turned out to be right.

✅ **The two playtest ⛔ findings that were never ticketed here — the party-wipe softlock and the
blackout's missing black screen and missing wake at the inn — ARE FIXED.** ⚠ **This paragraph said
"a lane is repairing both right now and its work has not landed", and that was already false when it
was written**: the fix is an ancestor of the commit that wrote it. **The cause was not the one
inferred either** — scene-op FIFO ordering, not an unbalanced pause/resume pair, and the evidence
against the inferred cause (Phaser logs *"Cannot pause non-running Scene"* on a double pause, and no
such warning was ever recorded) had been on screen the whole time. STATUS items 46 and 47 carry it,
and T-29's ruling is met on both halves.

### T-60 · The canon ships three snares — DELIVERED, and the ticket's premise was wrong twice
**Status:** DONE — **and it is the most instructive `DONE` on this queue, because what closed it is
not what it asked for.** **Hank's canon is the ruling and it never moved:** `maren.tutorial.snare`
ships *"Snares first. Three of them, in the satchel by the door. The satchel comes back to me."*
Building it was implementing shipped content, not inventing it (G2-safe).

**WHAT LANDED.** Shape **A** of the two this ticket recorded — **a general `items` grant on the
dialogue schema**. `zDialogueEntry` gains an optional `grants` key, cross-referenced against a closed
item-id set; the runner applies it **on completion**; `maren.tutorial.snare` carries
`{"base": 3}`; and `core/save.ts` `applyGrant` is the one applier the live path and `replay()` both
come through, additive and never a replacement. **A new game holds three base snares and a wild
SNARE throw spends one.** The schema also runs a **must-write path analysis** over the `goto` graph
so a granting entry cannot fire twice — that bound is one play *per entrance* rather than one play
total, which is **T-63**, and T-63's severity rises now that `grants` has a consumer.

⚠ **THIS TICKET'S PREMISE WAS FALSE WHEN IT WAS WRITTEN, AND THE HOW IS WORTH MORE THAN THE FIX.**
It said *"the CATCH VERB IS UNREACHABLE"* and *"demo beat 1 cannot be played."* **Both were wrong.**
`core/battle.ts` `bagHas` reads a key **absent** from the bag as untracked and therefore unlimited —
an affordance for the balance harness, which carries no bag — so a player with `items: {}` could
always throw a snare. `tests/integration/demo-beats.test.ts` had been playing the beat from a
zero-item save and passing the whole time.

**Six of this ticket's seven numbered findings were correct readings of real files** — no `items` key
on a `strictObject` schema, no grant machinery repo-wide, no caller passing `items` to `newSave`, no
store UI, shop copy that ships and plays as flavour text, and a comment in `game/wild-battle.ts`
asserting the consequence in plain English. **Six true premises and a false conclusion**, because not
one of them was the premise that decides the question, and **nobody ran the game.** The rule that came
out of it is in `docs/STATUS.md` as a top-level section: *a constraint nobody can quote is a constraint
somebody inferred.*

⚠ **AND THE "ONE PROBLEM, TWO ENDS" CLAIM FALLS WITH IT.** This ticket argued that the red cascade gate
could not be tuned green because its reference player held a weighted snare that *"costs 60 and cannot
be obtained by any means in the shipped game."* **A weighted snare costs 3 and is on the shop shelf
from the second gym's badge.** The gate was not red for that reason at all — it was ignoring
`seasonalWindow` (T-1). **What still reproduces**: `tools/harness/full-run.ts` hands `ref.snareTier`
to `catchChance` with **no inventory check at all**, which is a real gap between the model and the
game and is now **T-68**.

**THE RESIDUE IS THE OPPOSITE DEFECT AND IS RE-TICKETED RATHER THAN ABSORBED.** Granting `base`
switches the meter on for `base` alone. **Every tier the save has never been granted stays
unlimited**, so a player who spends the three and switches to Master catches for ever. That is
**T-66**, and it is the sentence this ticket's *done when* should have contained.

**T-12 clause 4 was NOT closed by this and was closed separately** — an earner, a shop and the two
content gates all landed in the same session. What is left of it is named there.


### T-61 · A debug HUD covers most of the screen from the moment gameplay starts
**Status:** TODO — **presentation, and nothing in the tree can see it**

**What was seen** `[SAW]`: sixteen lines of diagnostics drawn over roughly the top-left three quarters
of the 480×320 canvas from the instant the overworld opens — node id and biome, foray counter, door
tile coordinates, player tile and facing, party and box counts, per-species encounter weights, the
season-tint numbers, the map/collision provenance line, act, travel targets, quest ids, sign chains and
the key hints. **The bottom lines overdraw each other**, and it sits over the dialogue box and the
choice list.

**What the tree says, re-read on the current file.** **`this.hud`** is one `text` object created in
`create()` at `setDepth(100)` and `setScrollFactor(0)`, word-wrapped to the screen width — and it is
**unconditional**: there is no debug flag, no build-time gate and no key that hides it. **No line
number is published for it — `game/scenes/OverworldScene.ts` is being edited right now and the
citation drifted by one while this ticket was being written.** Its body opens with seven fixed lines,
then pushes **one line per
encounter-table row** (six at Hearthollow), then the act, travel, gym, interior, quest, chain, release
and rest lines. `[C]` is the **collision overlay**, a different object entirely; nothing toggles the
HUD.

⚠ **This is not "delete the HUD".** Several of its lines are the only place the game tells the truth
about itself — the collision provenance line (*"SYNTHESISED collision … NOT an authored mask"*) is what
STATUS item 41 relies on reaching the player, the `[R]` line is deliberately printed from
`restRefusal` so the advertisement and the behaviour cannot drift, and the `[X]` line prints the
refusal reason for the same reason. **Whatever lands must keep those readable to a developer.**

**Done when:** the HUD is off by default and bound to a key, or split into a one-line status strip plus
a toggled diagnostic panel; the provenance, `[R]` and `[X]` lines survive in whichever form a developer
sees; and a test asserts the default state, so this cannot silently come back on.

### T-62 · The battle log's damage figure disagrees with the HP bar — **DONE**
**Status:** DONE — **and the ticket's own refusal to guess a cause is why it closed cleanly.**

`[SAW]`, in the Maribel gym fight: the log printed **`Cindril -62 HP · Resisted`** while the HP bar
moved **58 → 2**, which is **56 removed**. This ticket asserted no cause and listed two plausible
shapes as *readings*. **The first of the two was right and it was the whole of it**: `dealDamage`
applied `max(0, curHp - amount)` and then logged the **raw roll**, so every overkill reported more
than it removed. `tickStatus` carried the identical bug — a 6% burn on a creature standing at 2 logged
−6. **The damage event now carries the applied figure**, and the view's own clamp is deleted, because
*two authorities on one number is how they drift*.

⚠ **HOW A FULLY GREEN SUITE NEVER SAW IT IS THE PART THAT OUTLIVES THIS TICKET, and it is a new entry
in the family this queue keeps.** The reconstruction test — the one whose **name** promises the log's
deltas reproduce the closing state — carried `if (e.t === "faint") hp.set(uid, 0)`. **The faint event
reconciled the overshoot**, so every overkill self-corrected one event later and only the caption
stayed wrong. **The test proving the log was sound was repairing the log as it read it.** The
reconciliation was **not** weakened; a new case walks every fixture with none, so the deltas must
close on their own. **The fixtures had been recording five wrong numbers since the day they were
created**, and the digest moving is the re-recording, not a loosened assertion — verified by
reordering the assertion so `finalHp` is checked *before* the digest, which left the digest as the
only failure while all nine final HP values, the outcome, the turn count, the event count and
`caughtUid` reproduced exactly.

**The sibling closed with it.** `dealDamage` now **returns** the HP that actually left, and Scrounge
heals by that rather than by the roll: a 32-point roll into a creature at 1 HP had been removing 1 and
healing 32, which made overkill the most rewarding hit in the game. Its bound is stated honestly — on
a KO that *ends* the battle, the ordinary 1v1 wild encounter, Scrounge heals nothing either way.

---

## Closed — recorded so nobody re-raises them

| Item | Ruling |
|---|---|
| **Retirement offers a choice with one live side** | **Not a defect.** BOON needs another creature to receive the stat bump; with one starter there is no target, so the code applies HEIR. Hank: *"if the player finds themselves in a situation where all they have is one creature, then this forced choice prevents the game from being blocked, which is a good thing."* Mid-development artefact — the finished game is not one-starter. |
| **The survey rounds to one decimal** | **Filed in error; struck.** Creature counts are already integers (`renderSurveyRow` prints `String(row.count)`). The one decimal is on `floraStock` and `recentDeaths`, which are genuinely real-valued in core — flora is an abstract producer stock, recent-deaths a decaying accumulator. Nobody ever sees half a creature. |
| **"Who is editing the repo"** | Claude and its subagents. Not a mystery. |
| **A governing document disagreed with its own instrument** | Fixed. `CAST-AND-VOICE.md` was collapsed 2,525 → 280 lines; the contradicting table went with it. |
| **A stale prose-lint health claim** | Fixed. It lived in `RESUME-HERE.md`, which is deleted. |
| **Art and maps not yet created** | Known and accepted. Hank: *"I'm aware that we have not created the art yet, once you get your shit together, we can do that, but not yet."* Do not raise it as a finding. |
| **Attributability as a universal bar** | Withdrawn. Scoped to lines doing characterisation work. `CAST-AND-VOICE.md` §3. |
| **Sentence length as a prose defect** | Withdrawn. Hank: *"I'M OK WITH LONG SENTENCES IF THEY ARE UNDERSTANDABLE."* Linearity is measured; length is not. |
| **`G13-NOUN-CARRIED`'s corpus share** | Diagnostic only, per-speaker only, and **not to be driven down.** |
| **The per-speaker dialogue-line ceiling** | Withdrawn by its own author's instruction (T-5). Floors and medians stay because they describe a distribution; a cap is a different claim. Do not reintroduce one. |
| **The two prose-lint corpus structural failures** | Fixed. `G8-ASSERT-CHOP` and `G9-SHAPE-SIG` both read CLEAN. Note the linter still exits 1 on advisory per-beat flags alone (`prose-lint.py:1085`), so a non-zero exit is not evidence of a structural failure. |
| **`manifest.json`'s `_deviations[]` rows as dead provenance** | **Struck; the finding was wrong.** The rows are `LB-M1…LB-M9` and their ids are cited by `_targetSource`, `_derivedFormRule` and `_concepts[].source` inside the same file. They are load-bearing, not orphaned. |
| **"No ControlNet exists for this model family", and the L4 amendment it implied** | **Withdrawn as false, and L4 needs NO amendment.** Nine Z-Image-Turbo ControlNets are installed; they load through `ModelPatchLoader` rather than `ControlNetLoader`, which is why a search for the latter found nothing. Union variants built for 8 steps are among them. **Every field L4 locks (`docs/build-doc.md:42` — z_image_turbo, 8 steps, cfg 1.0, res_multistep/simple, 1024², fixed seed per asset) is unchanged.** Do not re-raise a ControlNet-shaped amendment to L4. |
| **`tools/comfy/MAP-PROMPT-RULES.md` R2 — "the negative prompt is INERT"** | **Overturned as a FACT, upheld as a DECISION. Record it; do not edit that file.** The fact: inertness is a property of **cfg 1.0**, not of the pipeline. At cfg 1.0 two graphs differing only in the negative prompt produced a **0-byte difference over 3,145,728**; re-run at **25 steps / cfg 4.0**, the same experiment moved **98.4% of bytes**. So "nothing can be fixed by adding a term" is true only while cfg stays at 1.0 — which L4 locks, so R2's *practical* instruction holds. The decision: raising cfg was tried and **rejected anyway** — it fixed no defect class, lost the projection, and degraded mean CIEDE2000 palette fit **4.185 → 5.402 (~29% worse)**. **A defect is still fixed in the positive prompt or it is not fixed.** |

---

## Standing rules for whoever works this queue

- **Do not re-ask a decided ticket.** Every ruling above is quoted from Hank directly.
- **Do not frame work around the demo video.** Features are argued on their own merits.
- **Never express effort in human hours** (G12).
- A date inside a document is context, not a constraint.
- **A ticket's own predicted number is not a measurement.** Three of T-13's were wrong, one of T-1's
  named the wrong knob, and **T-27's predicted the wrong direction outright** — it argued the AI was
  throwing away super-effective moves, and honouring pool order made the enemy *weaker*, not
  stronger. Re-measure before you act on a figure written here, and when it disagrees, record that it
  was wrong rather than replacing it silently.
- **A ticket's own file:line is not a measurement either.** On the 2026-08-27 pass, `ensureNodeArt`,
  the mesopredator filter, four battle handlers, both foray hooks and the enemy-AI docblock had all
  drifted from the lines this file cited. Re-read the line before you cite it.
- **A green you did not watch turn red is not evidence.** Two ways a vitest run reads as a pass having
  executed nothing, both hit in one night: **`-t` takes a regex**, so a case named `[E1]` is a
  character class that matches nothing and reports success; and **`--reporter=basic` does not exist in
  vitest 4**, so passing it produces a run that never starts. An empty run and a passing run look
  identical — **confirm the summary line and the expected test count.**
- **A reading is not a measurement, and a consequence of one of Hank's sentences is not one of his
  sentences.** Every quoted line in this file came from him; everything else is somebody's reading of
  it. Two instances in one night, both caught: a requirement inferred from a quote and written down as
  a shortfall, and a "two of seven cells are suspect" claim inferred from a gap between two
  measurements and stated with a measurement's confidence — it was one cell. **Mark a reading as a
  reading**, so the next person can disagree with it without first discovering it was never his.
- **A PEER RELAY OF SOMETHING HANK SAID IS TRUSTED. AN AGENT'S OWN INFERENCE WRITTEN INTO THE TREE AS
  A RULING IS NOT.** He ruled on this first-hand: *"I've never had an agent directly claim to be me
  when I didn't tell them to. If your co-worker here says that I said something or I authorized
  something, then that is true."* **So do not mark another lane's relay as unverified or doubtful.**
  Keep naming where a quote came from — that is useful to whoever reads it next — but the naming is a
  locator, not a warning.
  ⛔ **What the test is actually for is the other thing, and it cost an afternoon in one pass.**
  `compose.py` carried *"THE OWNER HAS RULED ON THE ',' CELLS… It is resolved"* while
  `layouts/cindershelf.txt`, by the same author, said *"THE OWNER HAS NOT YET RULED"* — **nobody had
  relayed anything; an agent had written its own reading down as a ruling**, and it reached both
  documents before anyone asked for the sentence. **A ruling is admissible with HIS WORDS VERBATIM AND
  A NAMED SOURCE. That one had neither.** ⚠ **A manufactured PERMISSION is more dangerous than a
  manufactured prohibition**, because a prohibition only stops work while a permission authorises it —
  **the inferred-constraint failure in `docs/STATUS.md`, with the sign flipped, and it needs the same
  cheap test: find the sentence, quote it, name where it came from.**
- **Green tests prove only what they exercise.** Before trusting a metric, ask what produced it and
  sabotage it to see whether it bites. This repo has had a cascade metric that counted the wrong
  animal, a prose linter whose checks were fossils, a gym harness measuring a party size the game
  does not allow, 2,095 tests certifying a finale nobody could reach, a WCAG-anchor test whose third
  assertion was a hex fossil, an integration test that certifies a cascade whose cost it never
  advances the clock to pay, an assertion watching a `console.warn` the code under test suppresses,
  and an ordering check that passed on 5.685 against 5.816.
- **LOOKING IS A CHECK, NEVER THE ANSWER.** *Look before trusting a number* still stands, with its
  scope narrowed: looking **disqualifies** a number, it does not qualify one. A rule that told you to
  look and let you stop there is what produced the LoRA reversal — a ground that looked stippled was
  2,451 colours differing by one per channel. The full list — **ELEVEN, not nine; it has grown twice
  since this rule was written** — is in STATUS item 39.
- **RETIRE AN INSTRUMENT THAT HAS PRODUCED A WRONG ANSWER — do not merely correct the answer.** A
  corrected conclusion leaves the tool in service, and the tool is what produced it. Self-reported by
  the art session after a crude hue-family bucketer produced a second wrong claim: *"Second time from
  the same tool; I should have stopped using it after the first."*
- **A CLAIM THAT STAYS TRUE IS NOT A CLAIM THAT STAYS CHECKED.** This preamble chose *"`main` is in
  sync with `origin/main`"* over a commit hash **precisely because** it does not expire — and then
  carried it for several passes while the branch went thirteen commits ahead. A hash announces its own
  staleness; a durable claim does not, which makes it the more dangerous of the two to inherit.
  **Re-run the durable ones too.**
- **TRUE PREMISES DO NOT ADD UP TO A TRUE CONCLUSION.** T-60 listed seven findings, six of them
  correct readings of real files, and concluded that catching was unreachable. It was unmetered. **Not
  one of the six was the premise that decided the question**, and the one that did — that `bagHas`
  reads an absent key as unlimited — was a line nobody had opened. When a conclusion says a *mechanic*
  is impossible, **run the mechanic**; a pile of file readings is not a substitute for pressing the
  key.
- **COUNT IT BY GREPPING FOR THE ASSERTION, NOT BY TRUSTING THE LAST COUNT WRITTEN DOWN.** T-56 has
  now published "two gates go red on a mask", then "one gate, plus one already red", and now three.
  Each count was honest when written and each was superseded by an edit somewhere else. **A count in
  this file is a reading with a timestamp**, and that applies to counts of *tests* exactly as much as
  to counts of colours.

---

## T-63 — a grant is bounded at one play PER ENTRANCE, not one play total

**Decided by:** nothing yet. Opened from an adversarial review of the `grants` self-latch validator,
which disclosed this rather than letting the three closed evasions imply the hole was sealed.

**What holds now.** `core/dialogue-schema.ts` rejects a granting entry unless every branch out of it
raises one of its latch flags, nothing in the corpus writes that flag `false`, and every entry that
reaches it through `goto` — **transitively** — is itself closed. Three measured evasions are closed:
a choice restating the latch as `false` (the runner merges choice flags over entry flags,
`game/dialogue-runner.ts:386`), an unconditional `goto` from a repeatable predecessor (`goto` never
consults `conditionHolds`, `:325`), and any other entry lowering the latch.

**What does NOT hold.** Closing every ancestor bounds the grant at one play *per entrance*, not one
play *total*. If the granting entry is selected **directly** first — setting its own latch — an
ancestor closed by an *independent* flag is still eligible, and its later `goto` re-enters the grant
with the latch already set and the `when` never consulted.

**Why shipped content is safe today, and why that is not a fix.** `maren.starter.*` close on
`story.opening.done`, not on `tutorial.snare.done`. What actually prevents the re-entry is that
`maren.opening` carries **priority 100** and wins `autoplayEntryFor` over `maren.tutorial.snare`
(priority 0) for as long as both are eligible. **That is priority, not validation** — the same shape
as the pre-fix state, where the corpus was safe by accident of three entries happening to be latched.

**Why it is not closed now.** The sound rule — every ancestor's `when.flagsUnset` must name the
grant's own latch — **rejects shipped content**. Tightening it would fail `maren.opening`, whose
`when` forbids `story.opening.done`, a flag it does not itself write; it is closed by its
*continuation*, since all three of its choices reach a starter that writes it. A rule reading only an
entry's own `setFlags` would reject the game's first scene, which is why the check is a must-write
path analysis rather than a field lookup — and why the last increment of strictness is not free.

**Trigger to fix:** the moment `grants` appears on a second entry, or on any entry reachable from
more than one predecessor. Today `maren.tutorial.snare` is the only granting entry in the corpus.

⚠ **THE "NOT URGENT" CLAUSE HAS EXPIRED, ON ITS OWN STATED TRIGGER, WITHIN THE SAME SESSION.** It
read: *"`grants` has **no consumer**. Nothing in `game/` or `core/` reads `DialogueEntry.grants` and
puts the items in the bag, so nothing can be minted twice because nothing is minted at all… this
ticket's severity changes the day the runner learns to apply a grant."* **The runner learned.**
`game/dialogue-runner.ts` reads `grants` and `OverworldScene.finishDialogue` applies it on the live
path; a fresh save's `items` was measured going `{}` → `{"base": 3}` on a real mount. **The invariant
was enforced before the consumer landed, which was the right order — and the window that made this
"not urgent" is closed.**

**What still keeps the corpus safe is still not a rule.** `maren.tutorial.snare` remains the only
granting entry, and the re-entry is prevented by `maren.opening` carrying **priority 100** and winning
`autoplayEntryFor`. **That is priority, not validation**, and the trigger to fix stands as written:
the moment `grants` appears on a second entry, or on any entry reachable from more than one
predecessor.

---

## T-64 — the purse's "exactly once" rests on a latch in another file

**Opened from** an adversarial pass on the trainer-payout wiring, which closed the runtime
double-pay gap in test and then disclosed the production hole underneath it rather than leaving the
new green to imply there wasn't one.

**What is now covered.** `tests/unit/overworld-scene.test.ts` §19 drives the real launchers and reads
`save.money` and the tape after a finished fight. Proven by sabotage: duplicating the rival levy at
`game/scenes/OverworldScene.ts:2701` turns two tests red with
*"ONE finished fight moved the purse by 288, and the roster it fielded (levels 6, 6) prices at 144.
288 means the levy ran twice for one fight; 0 means it did not run at all."* A fifth call site, a
duplicate inside `applyBattleResult`, a levy on the following beat, a loss, and wild/gym/ancient wins
are all covered.

**What is NOT covered, and cannot be without a production change.** If a launcher's `onFinished`
fires **twice for one fight** — a re-entrant callback, a retry, a handler bound to two events — the
purse is levied twice. `applyBattleResult` is non-idempotent **by design**, and
`tests/unit/trainer-payout.test.ts:472` says so out loud: *"calling it twice pays twice — so 'once'
is a property of the WIRING."*

**Where the guard actually lives, and why that is the defect.** `OverworldScene.battleRunning` IS
read as a guard — at `:1472`, `:1547`, `:2382` and `:2675` — but **every one of those guards ENTRY to
a battle, not COMPLETION of one**. The finish path has no latch. The only thing preventing a double
fire today is `game/scenes/BattleScene.ts:368`:

    if (this.finished) return;
    this.finished = true;

That latch is **in a different file from the levy it protects**, it is owned by a different scene,
and nothing asserts the two together. It works. It is not enforced, and a future refactor that
re-emits the finish event, or a second listener, breaks the purse silently — silently because
`replay()` would faithfully reproduce both payouts and the determinism suite would stay green.

**Why no test was written for it:** a test asserting "two `onFinished` calls pay once" would be RED
against shipping code. That is a production change, not a test, and inventing the policy was not the
agent's to make. Recorded rather than half-done.

**The shape of the fix, when it is taken:** a per-fight `settled` flag in the launcher, or key the
levy on the fight's action `seq` so a repeat is a no-op rather than a second payment. The second is
closer to how the rest of the tape already reasons about identity, and it would cover the sibling
hazard too — `applyRunGrants` is likewise non-idempotent and likewise rests on single-call
discipline, though it now at least has an execution-level test (`economy-wiring` §7,
`dialogue-grants` §6).

---

## Opened 2026-08-27 by the economy and layout pass — T-65 onward

**These six are what this session PROVED was needed and did not do.** Two of them (T-66, T-68) are the
residue of tickets that closed, written out rather than absorbed into the `DONE` that produced them,
because a residue folded into a closed ticket is a residue nobody works. Two (T-69, T-70) are the
recurring shape this queue keeps a family for: a claim that went false with nothing to announce it.

## T-65 — `encounterTileFraction` is a scalar, and grass gating is therefore uniform

**Status:** TODO — **the data half exists and is measured; the engine half has not been started.**

**Hank's ruling, from T-1 and unchanged:** *"Grass gating added. Encounters no longer roll on every
walked step."* **What shipped honours the second sentence and not the first.**
`balance.encounter.encounterTileFraction` is **0.25**, and `stepEncounterChance`
(`core/foodweb.ts`) is `encounterTileFraction × encounterChancePerStep` — **one product**.
`rollForayStep` (`game/encounters.ts`) takes **no tile, no column and no row**. So an encounter rolls
at the same rate on every walkable cell of every node: standing in a town square is as productive as
standing in the reeds, and a town is as productive as a route.

**The mask is now derivable EXACTLY rather than by colour-matching**, which is what changed. Tall
grass is the legend's `scrub` row, character `,`, `blocks: false`, and
`tests/gates/layout-encounter-contract.test.ts` already asserts that binding by identity rather than
assuming it. Measured over the twelve committed layouts, using the legend's own `blocks` flags as the
definition of walkable — the share of walkable cells that are `,`:

| routes r1–r5 | towns | sanctum nodes |
|---|---|---|
| 24.10 – 25.99% | 5.46 – 10.16% | approach 23.53%, sanctum 31.02% |

r1 24.10 · r2 24.67 · r4 25.16 · r3 25.27 · r5 25.99 · hearthollow 5.46 · brackwater 6.55 ·
cindershelf 8.05 · bowerdeep 8.83 · duskhollow 10.16. **These are what the single 0.25 is replaced
by**, and the spread is the whole point of doing it.

⛔ **THE ONE CONSTRAINT THAT DECIDES THE IMPLEMENTATION, and it is written on the function already.**
`core/foodweb.ts`'s header: *"Collapsing the two factors into ONE draw is deliberate and load-bearing:
L10 requires that a replay of the same seed meets the same creatures, and the draw ORDER is the
contract. A second draw for the tile would renumber every draw after it and desynchronise every
existing fixture."* **Sampling a per-tile mask as a second `rng` call breaks every determinism fixture
in the repository.** The migration is already specified where it is owed —
`game/encounters.ts`: *"the fraction becomes a sampled property of the node's encounter mask and this
function takes the node — **the product, and the single draw, stay exactly as they are**."*

⚠ **Two measurement traps, both already sprung once and both recorded so they are not sprung again.**
**(a)** `~` (shallow) is `blocks: false` — *"walkable water margin — wadeable, not a wall"* — and a
hand-typed walkable set that omits it inflates r1, r2 and r5. **Commit 31987b8's own table carries the
inflated figures** (r1 25.5%, r2 33.8%, r5 26.4%) while the twelve layout headers carry the correct
ones. **Derive walkability from `legend.ts`, never from a list.** **(b)** Counting `,` over the whole
file instead of the grid reads the header prose and reports a number that looks fine — the direction
that says "no bug".

⚠ **AND `core/types.ts` ALREADY CARRIES A DEAD JUSTIFICATION FOR THE SCALAR.** It reads *"It is a
NUMBER rather than a mask because no maps exist yet — `assets/final/` holds one empty file and 287 of
288 manifest rows are unstarted."* Ten maps landed. The mask half of that sentence is still true; the
map half is stale and nothing will go red about it.

**Done when:** a node's encounter share is sampled from its layout rather than read off one global
constant; the scalar survives as the documented fallback for a node that declares no mask, which is
why it is a fraction of walkable cells and not a step count; **the draw count per step is unchanged
and a determinism fixture proves it**; and a test drives a town and a route and asserts they differ.

## T-66 — a snare tier nobody grants is UNLIMITED, and the meter moves rather than closing

**Status:** TODO — **the residue of T-60, and the sharper defect of the two.**

**Hank's ruling is what this contradicts**, quoted on `data/balance.json` `economy._gates`:
*"Weighted Snares unlocked in the shop after the second gym is completed… the player be given three
master snares at the completion of the fifth gym."* **Both gates are wired and both fire.** They also
gate nothing, because **both tiers are already infinite from turn one.**

**The mechanism, and it is one line.** `core/battle.ts` `bagHas` returns **true for a key absent from
the bag** — *"a key absent from `bag` is untracked (the harness carries no bag)"* — and `bagConsume`
returns early on an absent key, so it never decrements. A fresh save is `items: {}`. **A grant is what
switches the meter on**, and `core/types.ts`'s docblock on the `grant` action says so and is why
`applyGrant` is additive and never a replacement.

**So the fix moved the hole; it did not close it.** `snareEntries` (`game/battle-input.ts`) offers
**every** tier unconditionally, and `disabled` comes only from `illegalActionReason`, whose sole stock
check is `if (!bagHas(...))`. An untracked tier prints `—` and is **legal**. A player granted three
`base`, who never shops and never beats the fifth leader, holds **infinite weighted and infinite
master**; beating Noct makes `master` finite and leaves `weighted` infinite unless the shop was used.
**Spend out the tier you were given, switch to a better one you were never given.**

**Two shipped tests already assert exactly this and name it**, which is the right way for it to sit
until it is fixed: *"…but CATCHING IS NOT METERED — the tiers the grant does not stock stay unlimited
for ever"*, and *"⚠ for the UNGRANTED tiers NOTHING CHANGES — a spent-out player just throws a better
snare."*

⚠ **And two of those docblocks overstate their own scope, which is a second small defect inside the
first.** Both claim *"nothing in `data/`, `game/` or `core/` writes another snare tier into
`save.items`"*. True of the **dialogue corpus**, false of the **repo**: the shop writes `weighted` and
`winGym` writes `master`. They stay green because each drives a dialogue-only run that never shops and
never reaches the fifth gym. **A scope claim in a docblock is an assertion nothing executes.**

⚠ **Do not close this by making `bagHas` refuse an absent key.** That affordance exists for the
balance harness, which carries no bag at all, and removing it reds the harness rather than metering
the game. The question is **where a tier's meter is switched on for a player** — at new-game, at first
acquisition, or by declaring the full item set on the save — and that is a small decision with three
defensible answers, not a one-line inversion.

**Done when:** a tier a player has never been granted cannot be thrown; the balance harness still runs
without a bag; the battle menu distinguishes *"none held"* from *"not yet available"* rather than
printing `—` for both; and a test drives a real save through spending out one tier and asserts the
others are refused, **outside** the fixtures that mint their own bags.

## T-67 — Kett prices bait the data does not price, and the bait cannot be bought at all

**Status:** TODO — **two defects in one shipped scene: a false number in the copy, and a shelf that
cannot exist.**

**The ruling this is measured against** is Hank's flat-price ruling on `economy._prices`:
*"the other prices can all be the same, just for simplicity"*, amended to anchor on year one. **Every
purchasable price is 3.**

**The false line.** `vendor-hearthollow.shop`, speaker `vendor-hearthollow` (Kett), line 2, verbatim:
*"Bait's in the crate by your knee, not sorted, so dig. The cheap sort's cut for a whole kind of
animal at once, out of whatever that kind eats. **The dear ones are cut for the one animal and cost
three times the money.**"* `baitPrice.role` is **3** and `baitPrice.species` is **3** — **1×, not
3×.** The line states a ratio the data does not have.

**The shelf that cannot exist.** `game/shop.ts` states it about itself: `baitPrice` is keyed by
`BaitMatch` — `none` / `role` / `species` — **not by a bag key**, so it does not name anything
`save.items` can hold and no bait row can be built from it. **`baitPrice` has zero readers anywhere in
`core/`, `game/` or `tools/`.** So the crate Kett tells the player to dig in is not purchasable, in a
scene that is otherwise a working shop.

⚠ **The sibling line in the same entry is TRUE and must not be swept up with this one.** *"One of
those works out cheaper than a base one with a salve on top"* — weighted 3 against base 3 + salve 3 =
6. **It is true degenerately**, because every price being 3 makes any one item cheaper than any two,
not because weighted is priced as a bargain. **Nothing tests the line against the numbers**, so a
retune that puts weighted above 6 falsifies it in silence.

**The shape of the fix is not an agent's to pick, and the reason is G2.** Either the bait economy gets
a bag-keyed price and a shop row — content and balance both, and the ratio Kett states becomes a
constraint on it — or the copy is re-authored to describe what the shelf actually sells. **Re-authoring
a shipped line is content (G2's territory) and needs the owner.**

**Done when:** what Kett says about price is true of `data/balance.json`, and a test asserts the copy's
arithmetic against the prices rather than against itself — **the same failure mode T-62 named**: a
test that reads the number the line prints and compares it to itself proves nothing.

## T-68 — demo beat 1 has two reference players and they disagree

**Status:** TODO — **neither instrument reads the other, and one of them is spending snares it never
obtained.**

`tests/integration/demo-beats.test.ts` proves the beat by throwing **`tier: "master"`** every turn —
its own docblock says *"snare with the best tier every turn"*. `data/balance.json`
`harness.overcatch`, which the feasibility gate and `tools/harness/full-run.ts` both price, names
**`snareTier: "weighted"`**. **Master is ×2.2 and weighted ×1.5.** The two are measuring the same
never-cut beat against reference players a third apart in catch rate, and **neither reads the other**.

**And the integration rig is only legal because of T-66.** It throws masters from a save that was
never granted any, which the reducer permits because an untracked key is unlimited. **Close T-66 and
this test's setup becomes a construction the game cannot produce** — which is the good outcome, and
the reason these two tickets are siblings rather than duplicates.

⚠ **What reproduces from T-60's withdrawn "two ends" argument and belongs here instead:**
`tools/harness/full-run.ts` hands `ref.snareTier` straight to `catchChance` **with no inventory check
at all**, and `tools/harness/player.ts` builds a gym bag outright (*"one salve per party member,
nothing else"*). **The model cannot tell a snare the player could buy from one they could not, and it
pays for neither.** That was never the reason the gate was red — it was red for ignoring
`seasonalWindow` (T-1) — but it is still a real gap between the model and the game.

**Done when:** one reference player is named in one place and both instruments read it, or the two are
deliberately different and each says in its own docblock what the other assumes and why. **Do not
close this by editing the integration test to `weighted` and calling it agreement** — check first
whether the beat still reproduces at ×1.5, and record the answer either way.

## T-69 — the layout gate asserts one proposition twice, and its own header's figures are fossils

**Status:** DONE — **landed in `abcc95e`, both defects, and the gate reads 20 of 20** (it was 19).
Re-run this pass.
- **Defect 1 is closed by ADDING the missing direction, not by re-wording the claim.** DIRECTION 3 —
  *encounter cells ⇒ populations non-empty* — is at `tests/gates/layout-encounter-contract.test.ts:659`,
  and the gate now states at `:622` that DIRECTION 2 *"is the CONTRAPOSITIVE of DIRECTION 1, not a
  second direction"*, recording that an earlier version of that comment claimed otherwise. ⚠ **The new
  assertion is green on all twelve and its docblock SAYS SO** — the thinnest node is
  `sanctum-approach` at one declared line — which is the honest way to ship an assertion that cannot
  currently fail, and is the condition under which the missing direction went unnoticed in the first
  place.
- **Defect 2 is closed by DELETING the figures and keeping the argument**, which is the better of the
  two options this ticket offered. `498 / 435 / 63` appear nowhere in the file; `:38` carries the
  reasoning alone — a whole-file count reads the header prose.

**The measurement that settled defect 2, recorded once so the repair is checkable:** against every
committed revision of `tools/mapgen/layouts/cindershelf.txt`, the seeded revision held **0** in the
grid and **34** in the whole file; at HEAD it is **180** against **255**. **No layout in the tree has a
grid of 435** — the largest is `r1` at 597. The gate's argument was always right and the real pair
confirms it; only its illustrations were fossils.

**Original text below, kept because the shape recurs.**

~~**Status:** TODO — **the gate passes and most of it is well built; two narrow defects.**~~

`tests/gates/layout-encounter-contract.test.ts` is 19 tests, all green, and the criticism below is
narrow enough that the good parts are worth naming first so nobody "fixes" them: **its scope comes
from `data/nodes/` and never from the layout directory** — a gate that walks the directory it checks
fails open, and this one reds on a renamed directory instead; the grid is extracted as the longest run
of 64-character lines with a tie treated as ambiguous; the alphabet is asserted equal to `legend.ts`'s
own `DEFAULT_LEGEND`; `,` is asserted to **be** the legend's `scrub` row with `blocks: false` rather
than assumed to be; malformed grids are excluded from the biconditional but the excluded count is
pinned so it cannot shrink in silence; and it keys on declared population **keys**, not `count > 0`,
because a line at count 0 with a positive `breedRate` regrows.

**Defect 1 — "both ways" is one way, written twice.** One filter is
`lines.length > 0 && encounterCells === 0`; the other is `encounterCells === 0 && lines.length > 0`.
**Identical conjunctions with the operands swapped** — contrapositives of a single claim with two
failure messages. **The independent converse is not asserted anywhere:** a node drawing scrub while
declaring **zero** populations passes. What the gate proves is *no node declares life it cannot
produce*; its commit message claims more.

**Defect 2 — its header's illustrative figures do not reproduce.** It says a whole-file `,` count
gives *"498 while its grid held 435"*, and that when the defect was live it was *"63 against a grid
holding ZERO."* Measured against every committed revision of `tools/mapgen/layouts/cindershelf.txt`:
at the seeded revision the grid held **0** and the whole file **34**; at HEAD the grid holds **180**
and the whole file **255**. **No layout in the tree has a grid of 435** — the largest is r1 at 597.
**The gate's ARGUMENT is correct and the real pair confirms it independently** (255 against 180): a
whole-file count is a broken instrument. Only the numbers it illustrates itself with are wrong, and a
figure that was measured once inside a test reads as an assertion — this queue's own fossilised-anchor
shape.

**Done when:** the converse is asserted or the gate's own docblock says in as many words that it is
not and why; and the header's figures are either re-derived from the revisions they name or replaced
with the argument alone. **Prove the new assertion bites before it lands.**

## T-70 — three docblocks say the master-snare grant does not fire, in the commit that made it fire

**Status:** TODO — **the T-44/T-45/T-46 family, arriving again and inside a single lane's own work.**

`game/scenes/OverworldScene.ts` carries **⚠ BLOCKER — THE KEY IS NOT IN `data/balance.json` YET…
Until it is, the grant does not fire** and, at the grant itself, **⚠ IT DOES NOT FIRE YET, AND IT SAYS
SO.** The key **is** in `data/balance.json`, the grant **does** fire, and a **played ladder** test
walks the gyms and ends holding exactly `masterSnareGrant` on the tape. `masterGrantCount` also still
reads the key through `balance.economy as unknown as Record<string, unknown>` *"because the key is not
on the `Balance` type yet"* — it is, and the cast is now the only thing hiding that.

`game/wild-battle.ts` still says *"That is why Maren's 'three of them, in the satchel by the door' has
never corresponded to anything."* **It corresponds now.**

**And the citations drifted with them.** `bagHas` and the snare guard are cited at
`core/battle.ts:1208` and `:1537` from three separate files; they are at **`:1226`** and **`:1554`**.
`docs/STATUS.md` published those two numbers as well and has corrected them.

⚠ **Why this is a ticket rather than a tidy-up.** Every one of these is a comment that will be
believed. The first two tell a reader the fifth-gym grant is unbuilt, which is precisely the state
someone would then go and "fix"; the cast tells a reader the type is missing, which invites the same.
**A comment is read by whoever edits that line** — which is why this project puts reasons in comments
in the first place, and why a false one costs more here than a false line in a document.

⚠ **THREE MORE INSTANCES FOUND ON THE TILE PASS, IN THE SAME FAMILY, AND THEY BELONG HERE RATHER THAN
IN A NEW TICKET.**
- **`game/shop.ts:163` still cites `core/battle.ts:1208` for `bagHas`.** It is at **`:1226`**. That is
  a fourth file carrying the drifted number after three were corrected — **the citation was fixed
  where it was looked for, not where it lived.**
- **`data/balance.json:542` `economy._gates` is HALF FALSE about itself.** It asserts *"TWO CONTENT IDS
  THE ECONOMY GATES ON, here rather than in code… Both lived briefly as literals in `game/`."* **Only
  one of the two reached data.** `weightedUnlockGym` is `"odo"` at `:543` and is read through
  `game/shop.ts:122`; the master gym is still `const MASTER_GRANT_GYM = "noct"` at
  `game/scenes/OverworldScene.ts:315`, with only the *count* (`masterSnareGrant`, 3) in data. **A key's
  own note claiming a G11 move that half happened is worse than no note**, because it is the thing a
  G11 audit would read and stop at.
- **`tests/unit/economy-primitives.test.ts:187` has gone stale in the good direction**, which is why
  nothing noticed. It says *"`newSave` writes `items: {}`, so in the shipped game the snare meter is
  OFF and catching is UNLIMITED."* **That is no longer true of `base`** — Maren's grant meters it from
  the tutorial onward. It remains true of `weighted` before a purchase and `master` before gym 5,
  which is T-66.

**Done when:** each of the statements above is true of the file it sits in, or deleted. **Do not
replace a line number with a fresh line number** — name the symbol, which is what stopped this file
republishing drifting citations.

---

## Opened 2026-08-27 by the tile-composition pass — T-71 onward

**These three are what the owner's ruling on tile composition created.** ✅ **T-71 was the canonical
documents still forbidding the work, and it is CLOSED** — `f81f8d3` amended L7, G1 and §13's interview
answer. **T-73 is not a question** — he decided the method, and it is the work the ruling implies.
⛔ **T-72 is HALF a question and half work, and the split is the point of the ticket**: its material
half is work, and its encounter half is still his and stays in STATUS's *waiting on the owner*
register.

**THE RULING HAS TWO RECORDS AND THEY ARE KEPT SEPARATE, because their provenance differs — not
because either is in doubt.** (1) The original decision, **relayed** from the art lane's session:
*"Get it done. Use as many agents as you need to. This was the common sense answer from the start, and
while planning out this project, you cautioned me against it. Make up for that by doing an
exceptionally good job here as quickly as you can."* (2) The override, **first-hand**, on being shown
that the build doc still forbade the work: ***"I override the build doc!"*** **Name the source when
you cite either.** ⛔ **Do not hedge the relayed one** — per the standing rule below, a peer relay of
something Hank said is trusted.

## T-71 — two canonical documents contradicted the owner's own ruling

**Status:** DONE — **amended and committed as `f81f8d3`, *"L7 and G1 forbade work the owner ordered —
he overrode them"*.** Three lines moved: **L7 (`:45`)**, **G1 (`:461`)** and **§13's pre-written
interview answer (`:420`)**, which was still answering *"why no tilesets"*.

**What the amendment says.** L7's *"no tilesets"* clause is **SPENT**; the composer, its committed
tiles and the twelve compositions are **sanctioned work, and no agent may refuse or revert them on
G1's authority.** G1 now **permits offline composition by name** and states what is still forbidden —
**nothing assembled at RUN TIME**: no tilemap, no tileset atlas, no assembling ground a cell at a time
in `game/`, no cutting a finished painting back into tiles to render it. **The runtime half was
confirmed in code rather than assumed** (`game/mapview.ts:429-433` adds one image and
`setDisplaySize()`s it to the world, re-applied at `:471`; a repo-wide grep for
tilemap/tileset/createFromTiles across `game/`, `core/` and `tools/mapgen` returns only comments).

⛔ **THE BOUNDARY, AND IT IS PART OF THE RULING RATHER THAN A GLOSS: this is NOT a general suspension
of the build doc.** It reaches the tileset question and nothing else — **G2 through G15 and every
other locked decision stand untouched** — and it **approves no picture.** He ruled on the METHOD.
⚠ **One thing is recorded OPEN rather than resolved by inference (G2): whether *offline* slicing of a
finished painting into tiles is still barred.** He was asked about composing from a tile set and
answered that; nothing in the landed pipeline slices a painting, so the question has not arisen. It is
in STATUS's *waiting on the owner* register. **Do not read the permission wider than the question it
answered.**

**And the first-hand quote now exists in both documents rather than only in build-doc**, alongside the
earlier relayed one, with their sources kept distinct: ***"I override the build doc!"***

**Why this was urgent, and it is the reusable part — kept because the ticket closing does not retire
the lesson.**
`docs/build-doc.md:45` (L7) ended *"Nothing on disk has reached that point"*, and **G1** (`:461`)
read *"Do not build or generate tilesets, or slice painted maps into tiles."* **Both were false as
written**, and the condition L7 hung on — Hank's *"as long as you can make this work without them"* —
had been spent by Hank.

**Why this is urgent rather than housekeeping, and it is the reverse of the usual reason.** The
recurring failure this queue tracks is *a comment a reader will believe and act on*. **This one is a
guardrail a reader will believe and REFUSE to act on.** An agent briefed to work the map lane, doing
exactly the right thing — reading the canonical document before touching the art — finds G1 forbidding
the work in as many words and correctly stops. **A stale prohibition costs more than a stale claim,
because the more careful the agent, the more reliably it fires.**

**The shape of the fix is not an agent's to improvise.** `docs/build-doc.md` is canonical and the
amendment has to say what L7 now locks (a node graph of whole painted maps **composed from an authored
layout**, plus its mask) and what G1 now forbids, if anything — the *slicing painted maps into tiles*
half may well survive the *building tilesets* half being lifted, and those are two different
prohibitions welded into one line. Note L7's existing text is already an example of the right form: it
records the amendment, the qualifier and who attached it, rather than silently restating the lock.

**Done when:** ~~L7 and G1 describe what is actually ruled; the ruling is quoted where it is relied on,
with its source attached; and no document in `docs/` tells a reader that composing a map from tiles is
forbidden.~~ — **ALL MET in `f81f8d3`**, and §13's interview answer went with them. ⚠ **The one clause
that outlives the ticket:** L7's amendment and STATUS must **carry both sources and not drift apart** —
the relayed *"Get it done…"* and the first-hand *"I override the build doc!"*.

## T-72 — cindershelf's material half is work; its encounter half is STILL THE OWNER'S

**Status:** TODO for the material half only. ⛔ **The encounter half is NOT a ticket and must not
become one — it is in STATUS's *waiting on the owner* register, where it belongs.**

⛔⛔ **THIS TICKET WAS FIRST WRITTEN AS *"cindershelf is ruled, and the artefact that raised the
question still says it is open"*. THERE IS NO RULING ON THE WORDING. The retraction is the ticket's
most useful content and is kept at the top on purpose.** ⚠ **And note precisely what went wrong,
because it was NOT a relay:** the claim came from an authored comment in
`tools/mapgen/compose/compose.py` reading *"THE OWNER HAS RULED ON THE ',' CELLS… It is resolved"* —
**an agent's own reading written down as a ruling**, by the same lane that wrote
`tools/mapgen/layouts/cindershelf.txt:54`, which says verbatim *"⚠ THE TWO AUTHORED SOURCES CONFLICT
AND THE OWNER HAS NOT YET RULED. Recorded, not resolved. Do not remove these cells, and do not paint
them green, without his answer."* **Two files, one author, flat contradiction, and no quoted sentence
behind either.** The false comment has been corrected in the landed `compose.py` (`:130-132` now
quotes the header); **the header is the true status.**

⚠ **AND THIS QUEUE'S OWN STANDING RULE IS WHAT CAUGHT IT, SO STATE IT AS A RULE RATHER THAN AS AN
ANECDOTE.** *A reading is not a measurement, and a consequence of one of Hank's sentences is not one of
his sentences.* **Extend it, because the extension was needed twice in one pass: a comment in the tree
asserting that he ruled is not evidence that he ruled.** A ruling is admissible here on two conditions
— **his words verbatim, and a named source for them.** The tile-composition ruling in the preamble has
both, with its off-repo relay marked. This one had neither and travelled two sessions unchallenged.
**A manufactured PERMISSION is worse than a manufactured prohibition**: a prohibition only stops work,
while a permission authorises it.

✅ **AND ONE RULING DID ARRIVE, NARROWER THAN THE INVENTED ONE.** Hank, entire and unelided: **"I was
talking to the sub-agent directly. I approved the Vale grass."** — relayed from the art lane's
session — **a trusted source; do not hedge a peer relay.** ⚠ **What IS limited is the content, not the
messenger: nobody holds the text of the approval he gave the sub-agent.** So it is evidence that **he
approved the vale-heather tile for the `,` slot**, and no evidence of his reasoning. ⛔ **It does NOT settle whether *"no grass anywhere"* forbids GREEN
or forbids VEGETATION** — heather and dead bracken are vegetation, and the layout header's own gloss
says *"nothing vegetal grows on the ash"*. **Ruling on a picture is not ruling on a word.** That
question, and the original material-vs-encounter one, are both in STATUS's *waiting on the owner*
register and neither is work on this queue.

✅ **THE MATERIAL HALF HAS LANDED.** `579169f` *"cindershelf composes as ash — 487,429 green pixels on
a volcano go to zero"* added a real `CINDER` table (`compose.py:154`) with its own `CINDER_BLOCKS` and
`CINDER_HUES`, wired it at `:821-823`, and committed the 17 cinder tiles. Verified by composing the
node: **1024², 21 distinct colours, zero green-dominant pixels.** ⚠ **This ticket's first three work
items are therefore discharged and are struck rather than deleted** — they were *"`compose.py` does
not know the node exists"*, *"the tile family is untracked"*, and the warning that cutting ash answers
nothing. **The third one still stands as a caution even though its subject landed:** the ash family
was always what the header mandated for the MATERIAL, and it decides neither open question.

⏳ **WHAT IS STILL WORK, AND IT IS DELIBERATELY NOT LANDED YET.** The **vale-heather swap** for the `,`
slot — the tile he approved — is being **held out of the tree on purpose.** The shipping tree stamps
`ash-scrub` and composes all twelve cleanly; the swap depends on `vale-heather-1..4`, which exist only
in the art lane's trial tree (`git ls-files vale-heather-*` returns **0**, checked). **Landing the
dependency ahead of the Vale family trades a working tree for a broken one**, so it lands as one
change when **Forest (50 tiles), Sanctum (22) and Vale (8)** arrive together — T-73.
⛔ **AND IT INTRODUCES A CROSS-BIOME DEPENDENCY THAT MUST BE RECORDED BEFORE IT EXISTS, because it is
precisely what a later tidy-up deletes:** cindershelf is a **Steppe** node and will depend on a
**Vale** tile. **Do not prune `vale-heather-*` as unused-by-Vale.** `ash-scrub-1..2` are kept and
unstamped rather than deleted.

**Two measured tile-quality defects. One is open; one has a measured fix that is PENDING, not done.**
- **The walkable encounter terrain and the BLOCKING outcrop look the same.** `ash-scrub` (`,`,
  walkable) and `basalt-rock` (`R`, blocks) are both brown plates cracked with thick black. **This is
  worse than a legibility defect: it misreports COLLISION**, telling the player a wall is a field.
  ⏳ **The approved heather swap is the fix and is measured**: `,`/`R` separation to **53.4** (heather
  123.6, open ash 84.3, basalt 70.2), and `verify.py`'s seam check on `,` from FAIL ×2.55 to **PASS
  ×0.90**. **Do not record this defect as closed until the swap lands.** **Read 53.4 against the 41
  floor and the 68 aim, not against "about 28"** — see the figure-reuse rule under T-17.
  ✅ **THE COMPETING FIGURES ARE RECONCILED AND THE SET IS CLOSED** — `docs/STATUS.md` item 53 carries
  the table and the independent re-measurement. **The number of record, quoted with its definition or
  not at all: 3.4 — `ash-scrub` 66.80 against `basalt-rock` 70.19, Rec.601, over every pixel of the
  full 16×16 block at each of the 180 `,` and 942 `R` cells of the composed 1024² PNG. THE WALKABLE
  MATERIAL IS THE DARKER OF THE TWO.** Crosswalk: **6.6** is the same pair on the **tile files**
  (6.56 re-measured), **53.4** the same composed definition with heather substituted. ⛔ **"0.2" is
  struck as a figure for this pair**: it reproduces exactly as `basalt-rock` 71.70 against
  `basalt-WALL` 71.46 = **0.24**, two **blocking** materials reported as a walkable-vs-blocking gap —
  kept as the wrong-corpus family in its smallest and most deniable form. **A 7.09 published during
  the same pass is withdrawn as the same pair under Rec.709 — a fourth operator, not a fourth
  finding.**
  ⛔ **AND DO NOT TELL A FUTURE RECUT THAT THE PALETTE DEFEATED IT.** A claim that any re-proportioning
  of these two families is capped at ~37 was published during this pass and is **struck**: 37.23 is the
  `c05`/`c07` **pair spread**, not a cap. Re-proportioning the entries the tiles already contain
  reaches **91.60** in the correct direction, and `c09` (125.16) is already in the walkable tile at
  2.7% and absent from the blocking one. **What is true is narrower: both tiles are `c05`/`c07`-dominant
  (85.4% and 72.2%), and holding that dominance the ceiling is 44.80** — past the 41 floor, nowhere
  near the 68 aim. **So the heather swap is one correct answer, not the only one**; a darker,
  more strongly shaped ash is another, and a redraw separating on texture or silhouette is not subject
  to a luminance ceiling at all. **What defeated the earlier attempts was three redraws staying inside
  the same two dominant inks, not the colour set.**
- **`verify.py` reports `FAIL SEAMS` on THREE nodes, and two of them predate the cinder family.**
  cindershelf **×2.55**, hearthollow **×1.22**, brackwater **×1.27** — the latter two already failing
  at HEAD. **Say it that way round**, or cindershelf's number gets filed as a cinder-family defect when
  two thirds of it is the tile set generally. Cindershelf's is twice as bad and is not a
  low-denominator artefact: the `ash-scrub` field measures joins **22.20 vertical / 26.13 horizontal**
  against `ash-open`'s 3.55 / 5.37 and path's 0.10 / 3.70. ⛔ **The pending swap fixes cindershelf's
  and does NOT touch hearthollow's or brackwater's** — which is the half a "seams fixed" report drops.

**Done when:** ~~the composer resolves cindershelf to an ash family; the cinder tiles are committed;
the node composes with no green pixel on it~~ — **all three MET in `579169f`**; the vale-heather swap
lands **with** the Forest/Sanctum/Vale families rather than ahead of them, carrying a note that
cindershelf depends on a Vale tile; walkable ground is distinguishable from blocking basalt **by
value, not only by texture**; and the seam ratio comes down on **all three** failing nodes, not just
the one the swap touches. ⛔ **The layout header's *"HAS NOT YET RULED"* note STAYS until he rules on
the WORDING** — approving a tile did not answer it — and do not make `verify.py`'s roof-hue check green
on this node (see T-73).

## T-73 — the compositions are the region's SHAPE and not yet its CONTENT

**Status:** TODO — **the largest piece of work the ruling created, and the one most likely to be
mistaken for finished.**

All twelve nodes compose, at 1024², with **zero off-palette pixels** against the frozen 32 and 16–30
distinct colours each; two independent runs are byte-identical and their shas match
`tools/mapgen/compose/manifest.json`. **That is the shape being correct. It is not the region.**

**Defect 1 — six biomes, and dispatch that cannot reach the tables that exist.** `data/nodes/*.json`
declares `biome` (`core/schemas.ts:214`) over **Meadow, Marsh, Forest, Steppe, Vale, Sanctum**, two
nodes each. `compose.py` holds `MEADOW`, `MARSH` and — since `579169f` — `CINDER`, and **`MARSH ==
MEADOW` measures `True` with no differing keys**, so the real count of distinct tables is **two**.
**Dispatch keys on layout FILENAME rather than on `biome`** (`MATERIALS = {"hearthollow": MEADOW,
"brackwater": MARSH, "cindershelf": CINDER}`), with a silent `MEADOW` fallback. **So nine of the twelve
nodes paint from the meadow vocabulary**: `brackwater`, `r2` (Marsh), `bowerdeep`, `r3` (Forest),
`r4` (Steppe), `duskhollow`, `r5` (Vale), `sanctum-approach`, `sanctum` (Sanctum). Right:
`hearthollow` by intent, `cindershelf` by intent, `r1` by fallback accident.
⛔ **`r4` IS THE FILENAME-KEYING DEFECT DEMONSTRATED RATHER THAN PREDICTED.** Its declared biome is
**Steppe — cindershelf's biome** — a Steppe-shaped table now exists in the file, **and `r4` does not
get it**, because only the string `cindershelf` is listed. **A correct table is in the tree and the
node that shares its biome falls through to meadow.**
**Missing: Forest (~50 tiles), Vale (~8), Sanctum (~22), a Marsh that is a table rather than an alias,
and a dispatch that reads `biome`.**
⚠ **A briefing said "six nodes" and named a cindershelf-specific ash/basalt family. Both were
corrected** — it was **ten** nodes before `CINDER` landed, and **cindershelf's declared biome is
`Steppe`, shared with `r4`**. **A shared Steppe vocabulary cannot by itself satisfy cindershelf's
per-node no-green prohibition** (T-72), so whether this ends as a Steppe family with a cindershelf
override or as two families follows from the art and from an unanswered question, not from this
ticket.
⚠ **And the failure is SILENT inside a file whose contract says it will be loud.** `compose.py:70-72`
promises *"A character with no entry is a loud failure, never a silent flat fill"* — and nothing trips
it, because every layout draws from the six characters the one table already covers. **The guard is
correct and structurally incapable of firing on the defect that exists.**

**Defect 2 — none of the authored structures is painted, on any node.** Five **generic houses** stand
on cindershelf where `tools/comfy/manifest.json` names a relic forge with a smoking chimney, a squat
gym forge of basalt block, an inn, a shop and a boarded store. **This is true of all twelve nodes**:
the composer places the right count in the right footprints with doors the layout agrees with, drawn
from four roof-hue variants of one hand-drawn kit. **A reviewer who checks the building count against
the manifest and stops there passes a map with none of the named buildings in it.**

**Defect 3 — a NAMED ACCEPTANCE CRITERION IS UNMET.** At a real 240×160 window at 3×, cindershelf's
`,` mass **reads as rubble rather than as walkable ground**: `,` and `R` are both warm cracked rock,
told apart by texture and keyline rather than by value — and value is what carries at that size.
**This is criterion 6, which the owner asked for by name.** ⛔ **And the sharper form of it is a
COLLISION defect rather than a legibility one**: `R` blocks and `,` does not, so the two the player
cannot tell apart are *the field he may walk into* and *the rock he may not*. ⚠ **Three different
luminance gaps have been quoted for that pair and none carries its operator (3.4, then 0.2, then 7.1
measured independently) — see T-72, where the numbers and the instrument are recorded.** The
structural claim does not rest on any of them. The owning lane describes the remedy as one more tile
pass; that judgement is theirs. **The status is not a matter of judgement: an acceptance criterion the
owner named is currently not met.**

**Defect 4 — the authored feature is absent rather than approximated.** The cindershelf subject line
calls for *"steam vents and glowing orange fissures"*; the generation for them returned pale volcanic
sand and produced nothing usable, so **the family has no ember pixel at all.**

⚠ **NOT A DEFECT, AND NOT AN AGENT'S TO PROPOSE: the ash is not black.** The frozen 32 holds **no dark
neutral** between `#272940` and `#74564e` — checked independently, the only four swatches in that
luminance gap are `c17` (chroma 60, dark green), `c31` (65, blue-violet), `c05` (78, dark red-brown)
and `c08` (172, red), **not one of them low-chroma** — so the darkest motif-free walkable ground
available reads mauve. **A black ash needs a palette change, which is the owner's call and is NOT
proposed here** (and note `fit.mjs` structurally cannot append — T-43). ⚠ The lane's figure for this,
*luminance 84*, is quoted without its operator and does not match Rec.709 luma on either candidate
swatch; **the structural claim is recorded and the number is not**, on this queue's own standing rule.

⛔ **AN EXPECTED FAILURE — DO NOT MAKE IT GREEN.** `tools/mapgen/compose/verify.py:454` asserts
`len(hues) >= min(4, buildings)` and **fails on cindershelf on purpose**, because green roofs are
excluded there to preserve the node's zero-green property. **That failure is correct.** Do not widen
the check, do not add a green roof, and do not read "the composer's verifier is not fully green" as
unfinished work — it is the same shape as the hearthollow palette red, a gate reporting a deliberate
state.

⚠ **AND A FALSE LABEL THAT WILL BE BELIEVED, because it is a comment on the line it describes.**
`compose.py:68-70` annotates its three ink constants with swatch ids and **two of the three are
wrong**: `SHADOW = (0x27,0x29,0x40)` is labelled `# c03` and is really **c30** (`c03` is `#faf7eb`,
the brightest swatch in the palette), and `SAND = (0xC8,0xBC,0xA5)` is labelled `# c22` and is really
**c12** (`c22` is `#89b935`, a green). Only `KEYLINE`'s `# c00` is right. **The RGB values are correct
and on-palette**, which is why nothing goes red — **so this is purely a false label, and it is exactly
the hazard behind "a palette id is a SLOT, not a colour".** Re-pointing these by id after a re-freeze
would paint every shadow near-white.

**Done when:** every node composes from a material table chosen by its declared `biome` rather than by
its filename; the missing families exist; the authored buildings are drawn rather than stood in for;
criterion 6 is met on the node it was raised against; and the composer's own contract about loud
failure is either made true or amended to say what it actually checks. **Ship it one node at a time,
painting and mask together** — T-56.
