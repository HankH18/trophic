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

`tests/unit/transcription.test.ts:1358` is RED. **`docs/STATUS.md` carries the full arithmetic and
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
**Status:** IN PROGRESS — **doc half DONE, test half NOT DONE** · **Hank:** *"letting the biomes gain
a mind of their own and not forcing any particular outcomes"* … *"keep that how it is"*

**The ruling: do not force it.** The simulation stays as it is. The specification stops promising a
guaranteed outcome and describes what the §7.3 rules actually produce. Guardrail G6 still binds.

- ✅ **build-doc §10.2 amended** (`docs/build-doc.md:370`): *"That collapse is the assertion.
  Mesopredator release is reported, not required"*, with the 12.5% / 0–13% measurements and the G6
  clause. Supporting edits at §7.3 step 6 and §1 beat 1.
- ❌ **`tests/integration/demo-beats.test.ts` was NOT rewritten.** Its diff is 23 lines of T-1
  `subTick` plumbing and nothing else. `:252-281` still argues against the *old* clause — it quotes
  "strictly rising within 4 seasons" and says the shortfall "is not a licence to ship the beat as
  is." The test is green while describing a spec that no longer exists.
- ❌ **`tools/harness/fixture.ts:142`'s one-line mesopredator filter is still undefended.** The file
  is unmodified. `grep -rn "isMesoLine\|releasedLineId" tests/` returns zero, and at `r4` the filter
  is provably a no-op. **Bind it with a test or record it as undefended** — the ticket asked for one
  of the two and neither happened.

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
**Status:** TODO — **all four sub-claims re-verified still true 21:58** · **Hank:** *"Close the loop,
Health persists, plus an explicit penalty. Set up the new items to be sold in towns, giving a purpose
for the money."*

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
false. **24 trial PNGs** exist across four map-trial rounds under `assets/raw/_trials/`, generated
through the new supervised trial runner. `.gitignore:8` excludes `assets/raw/**`, so **no commit
records any of them.** `assets/final/` still holds one empty file and `tools/comfy/manifest.json` is
`{pending: 287, approved: 1}` of 288 rows. Every rename and every palette swap is still cheap and
becomes expensive after the first real batch.

**Nobody still knows what one image costs** — `tools/comfy/manifest.json:9` records
`perImageCredits: null` and the platform exposes no credit-balance endpoint. **24 generations have
now run past a dashboard that could have been read.** See T-26.

Guardrail G13 still binds: **no batch of 20 or more images without Hank's explicit `--confirm`**, and
the pre-batch estimate is a *measured* per-image figure or the runner says "never measured".

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

### T-17 · Town map — fix scale, keep isometric
**Status:** IN PROGRESS — **24 images spent across four rounds; check it is still answering the
ruling** · **Hank:** *"fix scale, keep isometric"*

Four trial specs are in `tools/comfy/trials/` (`map-town-style`, `map-style-round2`,
`map-style-round3`, `map-route-shape`) with 24 PNGs on disk. Round 1's recorded conclusion, carried in
round 2's own `question` field: *"the SUBJECT enumeration is the whole lever and the negative prompt
is inert at cfg 1.0 (t3 vs t4 were pixel-identical)."*

⚠ **Possible drift from the ruling.** The trial questions are about building count, street grid and
edge exits. The ruling was **fix scale, keep isometric**. Before spending more, state in the spec
which round answered the scale question and which answered isometry, or say plainly that neither did.

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
**Status:** TODO — **evidence: raw pixel audit of the committed PNGs against the live palette**

`tools/comfy/player-views.ts:213-219` hardcodes 18 hex literals, **every one of which T-15 deleted
from the palette.** Regenerating the derived views from them wrote **8 off-palette pixels into
`player-back-32x48.png` and 420 into `player-side-32x48.png`** (11 dead hexes), and the star-removal
filter at `player-views.ts:262` compares against `#f9db10`, which no longer exists — so it never
fires and **the star badge is back on the rear of the cap**, which is defect #1 in that file's own
header list. `_acceptance.json`'s identity detectors read `0` / `[]` / `null` as a result.

Deliver:
1. Resolve those colours through `data/palette.json` instead of literals (G11 in spirit: no palette
   constant in code).
2. Regenerate the three derived views and the acceptance detectors.
3. **A gate that reads a committed PNG.** None of the seven files in `tests/gates/` opens an image,
   which is exactly why a full green suite says nothing about this. Without it the next re-freeze
   does the same damage silently.

Depends on nothing. Blocks T-20, whose side-view fix regenerates the same files.

### T-25 · Stale instruments and comments, each of which will be believed
**Status:** TODO — **three remain (1, 2, 5); items 3, 4 and 6 are DONE.** Each was verified stale by
reading the line and the thing it describes, and each closure was verified the same way.

None blocks a beat; each is a misreading this repo has already paid for once. Items 4 and 6 closed
because the artifact was repaired *and* its generator was made incapable of reverting the repair —
see STATUS.md, "a derived artifact carrying a hand-written claim". Prose alone would not have closed
either.

1. `tests/unit/transcription.test.ts:1297-1300` — says "nothing in `game/` ever spends it … As WIRED,
   battles are free and the real budget is 112.32." `game/scenes/OverworldScene.ts:879` spends it.
   The arithmetic above the comment is correct; only the comment is wrong.
2. `game/scenes/OverworldScene.ts:1921` — "`seasonBoundary` fires at ticks 4, 8 and 12 only." It fires
   at 13, 26 and 39. Its own header calls it "THE SEAM MOST LIKELY TO BE RE-BROKEN."
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
5. `tools/harness/full-run.ts:368` — `const year = clock.year;` is dead; nothing in the loop reads it.
6. ~~`tests/unit/__repro-battle-clock.test.ts`~~ — **DONE at ~22:11.** The temporary repro was
   deleted; `tests/unit/clock-subtick.test.ts` is the real test that binds the defect.

### T-26 · Calibrate `perImageCredits` before the 150-sprite batch
**Status:** TODO — **evidence: `tools/comfy/manifest.json:9` is `null`; 24 images have been generated**

Build-doc §9.1 and G13 both require a **measured** per-image figure before any batch of 20 or more,
and the platform exposes no credit-balance endpoint, so the only instrument is the account dashboard
read immediately before and after a batch of known size. Four trial rounds have now run past it
without a reading. Attach the reading to the next trial — it is free.

Blocks the 150-sprite batch (T-16's follow-on), which is the largest spend in the project.

### T-27 · The enemy AI's tie-break is decided by floating-point rounding, and its docblock says otherwise
**Status:** TODO — **evidence: measured over all six shipped gym rosters**

`core/battle.ts:1318` promises "ties to the earliest move in the pool". The comparison is strict
(`score > bestScore`), so bit-identical doubles do keep pool order — but the score is
`((atk × power) / def) × mult × predation × midRoll`, so a tie **on paper** rarely produces equal
doubles and the last bit decides. Measured over 2160 shipped enemy/opponent pairs: 59 tie on paper,
20 disagree as doubles, and in **13 the AI picks a move that is not earliest in pool** — throwing a
neutral move where the docblock promises the earlier super-effective one. Example: Odo's
`mirefin-line(A,L14)` vs `cindril-line(A,L14)`, `dous` 93.63636363636362603 against `ambush`
93.63636363636364024.

This is the **game's** AI, not only the harness — it changes fights the player actually has.
`tools/harness/player.ts:275-303` already documents the same instability for the player-side scorer.

Decide the tie deliberately and say so in the docblock, then bind it with a test that constructs one
of the 13 measured cases. **Do not "fix" it by loosening a comparison** — the determinism contract
(no rng draws in the enemy policy) depends on the argmax staying exact.

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

---

## Standing rules for whoever works this queue

- **Do not re-ask a decided ticket.** Every ruling above is quoted from Hank directly.
- **Do not frame work around the demo video.** Features are argued on their own merits.
- **Never express effort in human hours** (G12).
- A date inside a document is context, not a constraint.
- **A ticket's own predicted number is not a measurement.** Three of T-13's were wrong, and one of
  T-1's named the wrong knob. Re-measure before you act on a figure written here, and when it
  disagrees, record that it was wrong rather than replacing it silently.
- **Green tests prove only what they exercise.** Before trusting a metric, ask what produced it and
  sabotage it to see whether it bites. This repo has had a cascade metric that counted the wrong
  animal, a prose linter whose checks were fossils, a gym harness measuring a party size the game
  does not allow, 2,095 tests certifying a finale nobody could reach, a WCAG-anchor test whose third
  assertion was a hex fossil, and an integration test that certifies a cascade whose cost it never
  advances the clock to pay.
