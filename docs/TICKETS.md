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

**Re-verified again on 2026-08-27 at 04:36, and the earlier claim that the tree had settled is
retracted — six lanes are live in it.** `npx tsc --noEmit` reads **exit 0**; `npm run test` reads
**10 failed, 3 files of 67**, stable across four consecutive runs, every one accounted for in STATUS's
verified-state section (the passing total is not stable — other lanes were adding tests as this was
written); **`main` is in sync with `origin/main`**. **No commit hash is quoted here any
more:** this file has named three different HEADs in as many hours and each was stale before the
paragraph around it was finished. "In sync with origin" stays true; a hash does not.

**Closing on this pass: T-32, T-35, T-40, T-42.** **T-17 gains the colour and ground-texture
findings.** **T-38 is CORRECTED — its own claim was false and the truth is worse.** **T-43 is new.**
Two scope questions moved to STATUS's *waiting on the owner* register rather than being written here
as work: how many buildings should have an interior, and when the palette expands to 48 relative to
the top-down re-author. Neither is an agent's to answer.

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

- ✅ **build-doc §10.2 amended** (`docs/build-doc.md:370`): *"That collapse is the assertion.
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
(`docs/build-doc.md:373`) and `core/foodweb.ts:242` already publish. The test **is** that measurement,
not a second opinion agreeing with one. The deleted line is in git:
`git show af82c46 -- tests/integration/demo-beats.test.ts`.

### T-3 · G7 read — scope it, then retire the item
**Status:** DONE · **Hank:** *"Scope the read to the 77 entries / 173 lines; re-check only the ones
the rewrite touches and then after, declare the word-matcher sufficient and drop the item. I'm not
going to continue getting stuck in the weeds with dialogue until everything else is done, and I
didn't even pick this rule."*

The blocker is cleared: the permanent G7 gate now genuinely reads `data/dialogue.json`
(`tests/gates/guardrails.test.ts:1037` → `dialogueCopyViolations()` at `:1132`, asserted `:1247`),
scanning 592 player-facing strings plus a joined-body pass over all 214 entries and a prose census
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

`docs/content-bible.md:237-246`: the Bloom Year is a latch on the rise, opens once per node in year
1–2 because `floraRegenPerSeason` exceeds maximum consumption, *"and it is not treated as a defect"*;
**"The Bloom Year grants no bonus spawns, and none is owed"**, citing G3. The regional-events line and
the R1 quest row were corrected with it. No effect was fabricated.

### T-8 · Record Route 4's apex extinction as intended
**Status:** DONE · **Hank:** *"Say so in the spec"*

Recorded in both canonical docs: `docs/content-bible.md:170` and `docs/build-doc.md:377` (§10.5),
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
- `docs/build-doc.md:377` — *"A control run with the raid suppressed has not been run and no such
  mode exists in the harness"*, and, in the same sentence, that an extinction is attributed to the
  raid *"by the node the raid script names, not by measurement"*. Both halves are now false.
- `docs/content-bible.md:176-178` — *"The raid-suppressed control that would show the raid is the
  whole cause has not been run, and the harness has no mode for it."* Same correction.

### T-9 · Close the raid list at one
**Status:** DONE · **Hank:** *"Close the raid list at one."*

Recorded in both canonical docs: `docs/build-doc.md:268` (§7.5) and `docs/content-bible.md:252`.
**"Do not author a second raid.** A per-act raid tier is a content proposal for Hank, not a row an
agent adds."

### T-10 · Starter lifespan — correct the bible, halve the age effect
**Status:** DONE · **Hank:** *"correct the bible sentence, then reduce the age buff/nerf to have half
the effect it currently does."*

- Bible sentence corrected (`docs/content-bible.md:76`): the final form arrives in the elder year,
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
- **Four copies of the OLD curve are still stated as the current rule**, each outside the doc scope
  that corrected L9 and each verified by reading the line:
  - `docs/content-bible.md:51` — "Age multiplier: Juvenile ×0.75 · Adult ×1.0 · Elder ×1.15." The
    bible is canonical for content, and this is the sentence every other copy cites.
  - `core/lifecycle.ts:349` — the `ageMultiplier()` docblock, `/** bible §2 — Juvenile ×0.75 · Adult
    ×1.0 · Elder ×1.15. */`, above a body that reads `balance.age.multiplier[age]`.
  - `core/lifecycle.ts:639` — "The age multiplier grows (J 0.75 → A 1.0 → E 1.15)", in the comment
    that explains why `curHp` is rescaled at a transition. The argument is sound; the numbers are not.
  - `data/gyms.json:5` `_levels` — "Old Nib is still unambiguously the ace: Elder (×1.15)". The ace
    claim may still hold at ×1.075 and the roster is unaffected, but the figure is the old one.
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
**Status:** IN PROGRESS — **the persistence spine landed 2026-08-27; the wiring did not. The remainder
is T-28, and it ships with T-29.** · **Hank:** *"Close the loop, Health persists, plus an explicit
penalty. Set up the new items to be sold in towns, giving a purpose for the money."*

**What landed:** `applyBattleResult` (`game/wild-battle.ts:471`), `applyBattleAftermath`
(`core/save.ts:601`), the `battleAftermath` action-log entry, and
`tests/unit/battle-persistence.test.ts`. **What did not:** anything calling it. The four sub-claims
below were all true when written; the first two are now true only because the spine is unwired.

**The largest build ticket here.** Today, losing a battle costs nothing:

- `save.party[].curHp` has **zero writers**. The only writers anywhere are `core/lifecycle.ts:458`
  (creation-time) and `:638` (year-turn rescale of an already-defined value); `game/wild-battle.ts:115`
  only reads it. Damage evaporates between fights, so the inn's rest heals nothing it needs to.
- **Experience and levels are never written back.** `core/battle.ts:980`/`:1014` mutate the in-battle
  `Battler` only; `game/battle-view.ts:890` renders the `levelUp` event. No assignment to
  `OwnedCreature.level` or `.xp` exists in `game/`. A creature carried six in-game years is exactly
  as strong on the last day as the first.
- **The item bag is a copy** (`game/wild-battle.ts:244`, `gym-battle.ts:152`, `rival.ts:171`,
  `finale.ts:274`, copied again at `core/battle.ts:574`), so consumables are effectively infinite.
- **Nothing spends money.** The only occurrence outside the type and schema is
  `core/save.ts:417` `money: opts.money ?? 0`. No earner, no spender.

Deliver all of it:
1. Health, experience and items persist across battles. Wire the fainted-party guards.
2. The inn heals what it charges for.
3. An explicit loss penalty. The constant goes in `balance.json` (G11), never in code.
4. **Items sold in the five town shops**, so money has a sink and the penalty bites.

Touches `game/` battle-end handlers, the four fainted-party guards, the shop service beats, and ~6
test files. **Do this before any further gym retune** — every win rate still comes from a player
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
for our best output. See `tools/artverify/ground-comparison.png`; it is the one artefact here that a
number cannot substitute for. **Work the two facts separately, because a combined sentence gets
half-implemented:**

- **A — ordered dither buys EDGE DENSITY.** It does nothing to the colour count.
- **B — a per-map colour subset buys COLOUR DISCIPLINE.** It does nothing to edge density.

Measured, each disproving the other's sufficiency: dither at amplitude 45 without the subset →
**40.02% in 43 colours**; the subset without dither → **16 colours at 12.88%**; both together →
**44.74% in 16**, against Gold's 47.51% in 17.

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

- ✅ `docs/content-bible.md:293` now reads "Track manifest — **eleven tracks**" with exactly 11 rows.
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
§18's IP-sweep box (`docs/build-doc.md:452`) is **ticked** and reworded to state what was screened.

**Never put a name question to Hank again for anything already created.**

### T-23 · TROPHIC is a free class project — record it and stop
**Status:** DONE · **Hank:** *"this is a class project that will be free. Shut the fuck up about IP!"*

Recorded as locked decision **L14** (`docs/build-doc.md:54`): *"Free class project — not sold, no paid
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
| T-28 | Wire the persistence spine | `applyBattleResult` exists and nothing calls it | TODO |
| T-29 | Party-wipe recovery | Ruled by Hank, on disk nowhere; T-28 makes a wipe terminal | TODO |
| T-30 | XP is written out, never read back | `makeBattler` zeroes it every fight | TODO |
| T-31 | `ensureNodeArt` can soft-lock travel | An unsettled promise strands `travelling` forever | TODO |
| T-32 | Two clause-7 tests are RED | T-27 removed the state dependence they pinned | TODO |
| T-33 | `GameAction` needs `battleAftermath` | One line; deletes the repo's only `as GameAction` | TODO |
| T-34 | `replay()` loses a caught creature | L10 is false for any run containing a catch | TODO |
| T-35 | Interiors, phase 2 — the scene layer | Doors, arrival cell, indoor guards, save field | TODO |
| T-36 | `node.walkable` gates nothing | Two canonical docs describe a path `game/` does not have | TODO · **Hank's** |
| T-37 | The enemy AI is blind to move `priority` | A design call, not a defect | TODO · **Hank's** |
| T-38 | The level-5 starter is one-shot on Route 1 | 78 damage against 58 HP, and a loss now persists | TODO |
| T-39 | `sanctum-antler-ring` is on the spawn cell | Two map rules land on the same cell | TODO |
| T-40 | `DexScene` / `SummaryScene` optional `onClose` | The epilogue-survey shape, one supplier from repeating | TODO |
| T-41 | `fit: true` vs `nearestResample` | The batch pipeline and the derived views disagree | TODO |
| T-42 | Three comments call a season four ticks long | T-25 item 2's sibling, found while closing it | TODO |

### T-28 · Wire the persistence spine — nothing calls `applyBattleResult`
**Status:** TODO — **T-12's remainder. Ships together with T-29; read that one before starting.**

T-12's spine landed: `applyBattleResult` (`game/wild-battle.ts:471`) appends a `battleAftermath` action
and applies it (`:476`), and `applyBattleAftermath` (`core/save.ts:601`) is the only writer of
`save.party[].curHp`, level and xp outside creation and the year turn. **What is missing is the
wiring.**

- **Zero production callers.** Every caller in the repo is a test —
  `tests/unit/battle-persistence.test.ts:293, 336, 394, 418, 457, 482, 529`.
- **Three docblocks already advertise it as *"the ONE writer all four launchers share"***:
  `game/rival.ts:184`, `game/gym-battle.ts:165`, `game/finale.ts:313`. **All three are false today** —
  the derived-artifact-carrying-a-hand-written-claim shape, arriving in a docblock.
- The four handlers, re-read (the `:1033 / :1559 / :1646 / :1716` this queue used to carry are each
  about four lines high): wild `onFinished` at `game/scenes/OverworldScene.ts:1006` →
  `finishWildBattle` `:1024` (body `:1029`, `applyWildBattleOutcome` `:1035`); gym inline
  `:1555-1567`; rival inline `:1642-1653`; finale inline `:1712-1731`.
- **The inn heals nothing.** `restAtInn` (`game/scenes/OverworldScene.ts:1423`) spends two ticks and
  prints a banner (`:1424-1427`). No party HP write at all.

Each of the four is one line — `this.save = applyBattleResult(this.save, result.state);` — but landing
only that is the dangerous half: the moment `curHp` persists, an unhealed party has no recovery.

**Done when:** all four handlers call it; the inn heals what it charges for; a loss penalty reads its
constant from `data/balance.json` (G11 — never a literal); the five town shops sell items so money has
a sink and the penalty bites; the three docblocks above are true; and **T-29 ships in the same
change.**

### T-29 · Party-wipe recovery — Hank has ruled this and it exists nowhere on disk
**Status:** TODO — **urgent, and paired with T-28** · **Hank:** *"When your team is wiped, a dialogue
shows up with a black background saying you passed out or something like that, and then you wake up
at the inn."* · on the cost: *"it should use twice the inn ticks, in addition to the cost of one fast
travel"*

**The cost composes from existing keys, so no new balance key and no literal in code (G11):**
`2 × balance.clock.innTicks + 1 × balance.clock.travelTicks`. On the shipped file
(`data/balance.json:321` and `:319`) that is **2 × 2 + 1 = 5 ticks**.

**Nothing like it exists.** Grep across `game/` and `data/dialogue.json` for wipe / blackout / "passed
out" / whiteout returns zero recovery paths. What exists is **refusal**, not recovery:

- `partyProblem` — `game/wild-battle.ts:201`, the one shared clause; `:206` returns *"nothing in the
  party is standing — nothing can be sent out"*.
- Four launcher guards reach it: `game/wild-battle.ts:218`, `game/gym-battle.ts:75`,
  `game/rival.ts:99`, `game/finale.ts:280`; called from `game/scenes/OverworldScene.ts:975, 1477,
  1604, 1673, 2377`.
- Last-ditch `unfieldableProblem` at `game/scenes/OverworldScene.ts:951`, from `handOffToBattle`
  (`:897`) at `:921-925`.
- Pinned by `tests/unit/battle-launch-guards.test.ts` §1 `:137`, §2 `:187` (`:205` pins the exact
  string), §3 `:219`, §4 `:246`.
- `game/rival.ts:94` and `game/scenes/OverworldScene.ts:1465` **already note** that an
  arrival-triggered fight can strand a fainted party on a route.

**Net: the game refuses every fight forever and never offers a way to un-wipe.** It is unreachable
today only because HP never persists — the inn heals nothing and the year turn keeps a zero at zero.
**T-28 makes it reachable and terminal**, which contradicts the closed ruling that a forced choice
exists *"so the game cannot block"*.

**G7 binds hard on the copy.** Black screen, passed out, wake at the inn. No line may tell the player
they did wrong, imply guilt, or draw a lesson from the wipe.

**Done when:** a wipe is detected at battle end; the blackout dialogue is authored in
`data/dialogue.json` and reachable through the existing selector path, so the reachability gate can
see it; the party wakes healed at the inn; the clock is charged `2 × innTicks + 1 × travelTicks` read
from `balance.clock`; and a test drives a real wipe end to end and asserts the run continues.

### T-30 · XP is written out and never read back in
**Status:** TODO — **depends on T-28; without the writeback there is nothing to carry**

`core/battle.ts:529` — `makeBattler` (`:487-492`) hard-codes `xp: 0`. `BattlerSpec`
(`core/types.ts:299-313`) has **no `xp` field**, so `battlerSpecOf` (`game/wild-battle.ts:113`) cannot
carry one even in principle. Banked XP is reset to zero at the start of every fight.

Measured on shipped balance:
- `xpGain` (`core/battle.ts:882`) against a level-5 enemy = `floor(12 + 4 × 5 × 1.0)` = **32**.
- `xpToNext` (`core/battle.ts:887`) at level 5 = `15 × 5^1.4` = **142.77**.

So at the level the starter is granted at, a creature needs about **4.5 wins to level and banks none
of them**: no wild fight can ever level a level-5 creature.

⚠ **One claim to correct while you are in there.** `core/save.ts:509-511` states this as *"no
single-enemy wild fight can ever level anything"*. **That is too strong.** At level 1, `xpGain` = 16
against `xpToNext(1)` = 15.0, so a level-1 creature **does** level off a single kill; the crossover is
immediate after that (L2: 20 vs 39.59). The claim is true at level 5 and false at level 1, and a
docblock that overstates is the thing T-25 exists for.

**Done when:** `BattlerSpec` carries `xp?`, `makeBattler` reads it instead of zeroing it,
`battlerSpecOf` sets it, the `core/save.ts` docblock states the level-dependent truth, and a test
carries XP across two consecutive fights and levels a creature on the second.

### T-31 · `ensureNodeArt` can permanently soft-lock travel
**Status:** TODO — **on the never-cut walkable slice**

`ensureNodeArt` (`game/mapview.ts:130`) builds its promise at `:137-141`, and its **only** settle path
is `scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve())` at `:139`. No
`FILE_LOAD_ERROR` listener, no `reject`, no timer. (There is an early-out at `:136` when nothing is
pending, which is why this has never been noticed.)

`travelTo` (`game/scenes/OverworldScene.ts:2225`) sets `this.travelling = true` at `:2249`, opens
`try {` at `:2250`, awaits `ensureNodeArt` at `:2252`, and clears the flag in `finally` at `:2266`.
**If the promise never settles, the `finally` never runs.** Seven sites early-return on that flag —
`:1087, :1126, :1266, :1424, :1595, :1750`, plus `travelTo`'s own guard at `:2226` — so travel, foray,
inn and menu actions are **silently refused for the rest of the session**. No error, no message, no
way back.

**Not live today**, because Phaser emits `COMPLETE` even when a file 404s. Three paths stall it anyway:
1. **`XHRSettings.timeout` defaults to `0`** — no timeout — so a hung connection fires neither `load`
   nor `error` and the loader never completes.
2. **`start()` is a silent no-op unless the loader is IDLE or COMPLETE**, so two overlapping travels
   can leave the second waiting on a `COMPLETE` that already fired.
3. **Teardown mid-load.**

**Done when:** the promise has both an error branch and a bounded timeout, each of which settles it;
`travelling` cannot outlive the await (cleared on any settle, not only on success); and a test that
deliberately never fires `COMPLETE` proves travel still recovers.

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
**Status:** TODO — **one line, and it unblocks T-34's named case**

`core/types.ts:565` declares the `GameAction` union — `travel`, `foray`, `inn`, `battle`,
`battleAction`, `catch`, `release`, `seasonStep`, `gymVictory`, `yearTurn`, `retirement`. **No
`battleAftermath`.** Two consequences, both documented in place:

- `battleAftermathAction` (`core/save.ts:537`) ends in the repo's **only** `as GameAction` cast, at
  `core/save.ts:547`, under a comment naming the missing member.
- `replay` has to consume the entry in its `default` arm (`core/save.ts:864-882`) instead of a named
  `case`, for the reason written at `:866-869`: a `case` label will not compile without the member.

The exact line is already written out at `core/save.ts:531-532`:

    | { t: "battleAftermath"; aftermath: BattleAftermath }

**No `core/schemas.ts` change is needed.** `actionLog[].action` is
`z.looseObject({ t: z.string().min(1) })` at `core/schemas.ts:824`, permissive by design — the
rationale is at `:783`.

**Done when:** the member is in the union, the cast at `core/save.ts:547` is deleted, `replay` reads it
in a named `case`, and `npx tsc --noEmit` still reads exit 0.

### T-34 · `replay()` loses a caught creature — L10 is false for any run containing a catch
**Status:** TODO — **measured: live party `[starter, wild-loamunder]` replays to `[starter]`**

`replay()` is `core/save.ts:719`. The party half of a catch is delegated to `ReplayDeps.applyOther`,
declared **optional** at `core/save.ts:651` and called at `:829, :834, :839, :861, :881`. The only
implementor is `replayRegionHooks(...).applyOther` at `game/year-replay.ts:135-139`, which resyncs the
ecosim population mirror and **adds no creature to the party**; the inner `deps.applyOther` it
delegates to has no production supplier anywhere (the sole implementation in the repo is a test stub,
`tests/unit/save.test.ts:948`). `core/save.ts:716-717` says so in prose.

**The `battleAftermath` entry added on 2026-08-27 is exactly the pattern this needs** —
`applyBattleResult` appends one (`game/wild-battle.ts:476`) and `replay` re-applies it
(`core/save.ts:879-880`). Do the same for the catch.

⚠ **Scope this honestly: `replay()` has ZERO production callers.** Every call site is a test —
`tests/unit/year-turn-ux.test.ts:3131, 3153, 3203, 3363`, `tests/unit/wild-battle.test.ts:241`,
`tests/unit/battle-persistence.test.ts:491, 513, 517, 540, 612`. **L10 is a property the suite
asserts, not a load path the game takes.** That is what made a false L10 survivable, and it is also
the thing to notice: the determinism tests are certifying less than their name suggests.

**Done when:** a replayed run containing a catch reproduces the live party exactly, and the thing that
proves it is a determinism test that actually catches a creature.

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
- `docs/build-doc.md:428` — cut line **C-1**, *"acts 5–6 towns walkable → vignettes (already
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
2. **It matters far more now than when it was first noted**, because a lost fight is about to cost
   something: T-28 makes battle damage persist and T-29 charges the recovery. Nothing in `game/` calls
   `applyBattleResult` yet — verified by grep — and both tickets are in flight.

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
  assertion was a hex fossil, and an integration test that certifies a cascade whose cost it never
  advances the clock to pay.
