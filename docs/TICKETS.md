# TICKETS

The work queue. Every ticket here carries a ruling Hank has already made — **these are decided, not
open.** Do not re-ask them. Where a ticket says a thing is his call, that call has been made and is
quoted.

Status vocabulary: `TODO` · `IN PROGRESS` · `DONE` · `CLOSED` (decided, no work needed).
A `DONE` ticket keeps its ruling and loses its working detail; git holds the rest.

**Order.** Work top-down within each section unless a ticket names a dependency. The one ticket that
cannot be worked by an agent — **T-1's open decision** — is first.

**Statuses below were re-verified against the working tree on 2026-08-26 between 21:43 and 22:07,
while several agents were editing it.** Where a ticket's own predicted number turned out to be wrong,
the measurement is recorded and the prediction is marked as wrong rather than quietly replaced.

**Re-verified again on 2026-08-27 across four complete runs between 09:03 and 09:25**, three of them
forced by HEAD moving mid-pass. `npx tsc --noEmit` reads **exit 0**, re-run after the last move;
`npm run test` reads **10 failed of 2,876, 2,866 passing, 3 files of 70** — **an identical failure set
on all four runs**, each of the ten named individually in STATUS's verified-state section. **The
passing total rose because tests were ADDED, not because anything regressed** (~2,848 → 2,876 over the
same 70 files, the additions being the inn-rest cases). **`main` is in sync with `origin/main`.**
**No commit hash is quoted here any more, and neither is the dirty-path count or a commit tally:**
this file has named three different HEADs in as many hours, HEAD moved four more times during this
single pass, and the dirty list read the same number twice over a different tree. "In sync with
origin" stays true; a hash does not, and neither does a count. Every dirty path belongs to a lane
working right now. ⚠ **Several lanes were writing to `tests/` and `tools/` throughout, so the passing
total above is a reading at a timestamp** — re-run before quoting it, and remember that a lower
failure count is the reading nobody re-checks (STATUS item 39 №11).

**Closing on this pass: T-12's clause 2.** The inn heals what it charges for, so T-28's largest
unlanded clause is landed and T-12's remainder is the economy alone. **T-44, T-45 and T-46 were
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

**Later on 2026-08-27: T-17's ground-texture figures are MARKED, not removed.** Gold's `47.51%`
whole-map edge density could not be reproduced and its author withdrew it pending republication with
the operator attached; the marking and what survives it are at the end of T-17. **T-17 also gains the
cause of the bottom-edge dark band** (the skeleton's cliff-step clause, obeyed literally on a node
with no elevation) and the **disproof** of the negations hypothesis. **A third question — whether the
pipeline adopts a LoRA — is REOPENED and sits in STATUS's *waiting on the owner* register, not here**,
because it is the owner's call and not work.

---

## T-1 · Revise the tick system — RULED, BUILT, one decision outstanding

**Status:** IN PROGRESS — **the build is DONE; one measurement came back and needs Hank.**
**Hank ruled 2026-08-26.** The design questions are CLOSED. Do not re-ask any of them.

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

### ⚠ THE DECISION — the cascade beat no longer clears its gate, and the named knob cannot fix it

`tests/unit/transcription.test.ts:1365` is RED. **`docs/STATUS.md` carries the full arithmetic and
the knob table; read it before ruling.** The short form:

- `brackwater/fenmaw-line` needs 19.2 removals against 11.42/yr available (78.96 encounters needed).
- `r2/fenmaw-line` needs 24.8 against 9.46/yr (103.70 encounters needed). Budget: 54.0.
- **`encounter.encounterTileFraction` cannot rescue r2 at any value.** This corrects the sentence
  that stood here. `battleTicks` puts a hard ceiling on the year at `ticksPerYear / battleTicks` =
  104 encounters, and at grass 1.0 the budget is only 84.45 — because the excursion costs
  `forayTicks + e × battleTicks` and `e` rises with the fraction. Brackwater alone clears at 0.730.
- **The binding knob is `battleTicks`** (0.038 clears r2, 0.196 clears brackwater) **or
  `ticksPerYear`** (100 clears r2, 76 clears brackwater).

**No value was tuned and no gate was weakened.** G14 forbids moving the gate to accommodate this and
G6 forbids answering it with a chosen seed set or a chosen node.

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
**Status:** IN PROGRESS — **clauses 1, 2 and 3 are DONE (T-28 · T-29 · T-30 · T-33 · T-34, then the
inn heal, all landed 2026-08-27). CLAUSE 4, THE MONEY, IS THE WHOLE REMAINDER.** · **Hank:** *"Close
the loop, Health persists, plus an explicit penalty. Set up the new items to be sold in towns, giving
a purpose for the money."*

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

**The `innCost` charge is deliberately still OFF**, and that is not an oversight — see clause 4. With
no earner anywhere in the repo, switching it on makes the inn unpayable forever and re-creates the
blockable run T-29 removed. **The owner's remaining question is therefore ordered: an earner first,
then the sink.**

**❌ Clause 4 — items sold in the town shops.** No shop sells anything. `balance.economy` ships
`innCost` 40, `trainerPayoutPerLevel` 12, and snare / bait / salve / tonic prices, and **every one of
them has zero readers** outside `core/schemas.ts` and `core/types.ts`. The only `money` occurrence in
`core/` or `game/` is still `core/save.ts:420` `money: opts.money ?? 0` — no earner, no spender.

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
for our best output. ⚠ **Those three figures are WITHDRAWN AS UNSOURCED** — see the note at the end of
this ticket, and STATUS's withdrawal register. See `tools/artverify/ground-comparison.png`; it is the
one artefact here that a number cannot substitute for, **and with the figures struck it is what the
finding rests on** — it is untouched, being a picture rather than a percentage. **Work the two facts separately, because a combined sentence gets
half-implemented:**

- **A — ordered dither buys EDGE DENSITY.** It does nothing to the colour count.
- **B — a per-map colour subset buys COLOUR DISCIPLINE.** It does nothing to edge density.

Measured, each disproving the other's sufficiency: dither at amplitude 45 without the subset →
**40.02% in 43 colours**; the subset without dither → **16 colours at 12.88%**; both together →
**44.74% in 16**, against Gold's 47.51% in 17. ⚠ **The `47.51` baseline is withdrawn as unsourced and
the three readings quoted against it go with it.** **A and B each disproving the other's sufficiency
does not rest on the baseline and stands**; *how close to Gold this got* does rest on it and does not.

**And the dither is SOURCE-DEPENDENT, so treat it as a fragility, not a settled recipe.** A ±22
ordered bias crosses a palette boundary only where the ground colour already sits near one, so the
same amplitude transforms one source and leaves another flat: through the same postprocess, on one
operator, today's baseline input read **6.89%** ground edge and a c64-LoRA input read **54.84%**
(Gold **60.10%** the same way). Both are real. An amplitude that works is a property of the **pair**
`(source, amplitude)`, so do not carry one number into the re-author as *what the dither buys*.

**Both readings are reported and NEITHER is capped**, by `tests/gates/asset-palette-contract.test.ts`'s
advisory, for the reasons recorded at their thresholds. A colour cap at or above `palette.length`
cannot fail at all, and a cap below it is taste with a number painted on it. A texture cap is worse:
the response to dither amplitude is near-linear (0 → 12.88, 24 → 24.09, 40 → 40.02, 56 → 63.77), so a
generator can be tuned to any figure named — and applied globally the dither speckles roofs and walls,
so **a map that reached 47% by ruining its buildings would pass a hard assertion.** That is the
ControlNet-0.9 failure exactly, and the gate refuses to invite it twice.

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

⚠ **The withdrawal this ticket's texture figures are marked against.** Gold's **`47.51%`** whole-map
edge density — cited twice in this ticket, twice in `docs/build-doc.md` §8.4 and twice in
`docs/STATUS.md` — **cannot be reproduced.** An independent re-measurement of the **same eight
`assets/reference/gen2/` captures** reads **50.4–78.8% at 1:1 native** and **30.3–51.5%
density-matched at 2×**; **no threshold reproduces 47.51.** Its author withdrew it **pending
republication with the operator attached**, and it is marked rather than deleted on this queue's
standing practice — a withdrawn claim is recorded, because it may be republished and turn out fine.
**Not disproved; not evidence either.** *As a consequence rather than a separate withdrawal:* the
figures published beside it in the same session — 43.59, 8.83, 44.74, 40.02, 12.88 and the amplitude
ladder — cannot be read against it. **What the re-author must NOT drop, because it survived
re-measurement:** the **colour** half of this ticket — Gold at **12 to 18 distinct opaque colours,
mean 16.0**, against the shipped ten at 17–32 — **reproduces exactly and is untouched**; so are the
palette gate's own band constants `GOLD_EDGE_LOW / HIGH / MEAN` = **51.0 / 78.7 / 64.2**, which are
computed by its own operator over the same PNGs. **The general rule is in build-doc §16: an
edge-density percentage means nothing without its definition** — threshold, channels, neighbours,
denominator. `tools/artverify/EVAL-STANDARD.md` still publishes the struck figure and is the art
lane's to correct.

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
**Status:** TODO — **and it has regressed, see T-24** · **Hank:** *"fix the side view in code, then
derive the walk frames the same way."*

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
**Status:** **code half DONE; asset half handed to the art session, which owns `assets/`**

`tools/comfy/player-views.ts` hardcoded 18 hex literals, **every one of which T-15 deleted from the
palette.** Regenerating the derived views from them wrote **8 off-palette pixels into
`player-back-32x48.png` and 420 into `player-side-32x48.png`**, and the star-removal filter compared
against `#f9db10`, which no longer exists — so it never fired and **the star badge came back on the
rear of the cap**.

1. ✅ **The 21 dead hex literals now resolve through `data/palette.json` by slot id.** No palette
   constant survives in that file (G11 in spirit).
2. ⏳ **Regenerate the three derived views and the acceptance detectors** — the art session's, because
   the bytes are under `assets/`.
3. ✅ **A gate that reads a committed PNG exists.** `tests/gates/player-art-contract.test.ts`, 16
   cases, decoding through `sharp` — **the first gate in this repo that opens an image.**

**The gate is RED, and that is the correct state: 7 failed / 9 passed** against the committed sprites.
It is reporting real defects in files another session owns, so it is not this ticket's job to green
it. Verbatim from the run: `player-back-32x48.png` *"holds 8 px in 2 colour(s) that data/palette.json
does not contain: #ec9a70×4 #eec092×4"*; the star badge fails on the cap rows and on the whole rear
view; `back` and `side` each introduce swatches the approved front does not use; and the freshness
assertion reports the committed back view disagreeing with a fresh derivation in **333 px**, first at
(10,4). Five sabotages all read red, **including one that placed a legal palette colour as a star** —
which reddened only the star assertions and left the palette ones green, i.e. the two checks are
genuinely independent and neither is standing in for the other.

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
| T-46 | A fossilised precondition asserts the repo is empty | Ten maps landed; the precondition is RED | TODO · **still open, still one of the ten** |
| T-47 | Every interior door coordinate is a guess | The canon gives none; the painted map will | TODO · **blocked on the art lane** |
| T-48 | Interiors cover four buildings in two towns | Three towns have no interior at all | TODO · **scope half is Hank's** |
| T-49 | The maps paint edge exits nothing can walk through | Travel is still a number-key menu on `adjacency` | TODO |
| T-50 | The door facing↔wall check lives only in the test layer | The load-time validator does not make it | TODO |
| T-51 | `tools/mapgrid` bypassed the engine's cross-check | Real, and **repaired in flight** — it parses through `zBalance` | **CLOSED** |
| T-52 | `tools/` → `game/` has no guard, only a correct habit | 9 sites, 5 files; the dependency is fine, the gate is missing | TODO |

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
- **Money still has no earner and no sink.** Re-grepped 2026-08-27: `balance.economy`'s `innCost`,
  `trainerPayoutPerLevel` and the four price groups have **zero readers** outside `core/schemas.ts`
  and `core/types.ts`, and `save.money` is written once and read nowhere.
- **No town shop sells anything.**
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

**Nothing was tuned to produce any of it and nothing should be** (G2, G14, and T-11's own ruling).

**Nothing was tuned to produce these numbers and nothing should be.** Levels, rosters, stats and
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
  2,451 colours differing by one per channel. The full list of nine is in STATUS item 39.
- **RETIRE AN INSTRUMENT THAT HAS PRODUCED A WRONG ANSWER — do not merely correct the answer.** A
  corrected conclusion leaves the tool in service, and the tool is what produced it. Self-reported by
  the art session after a crude hue-family bucketer produced a second wrong claim: *"Second time from
  the same tool; I should have stopped using it after the first."*
