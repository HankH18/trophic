# Dialogue notes — `data/dialogue.json`

Companion to the dialogue content (build-doc §15 C7, bible §13.13). Four things live here that
cannot live in the JSON: the bible gaps that had to be filled, the G7 read-through, the exact limits
of what the automated checks can prove, and the defects an independent audit found.

Owned files for this lane: `data/dialogue.json`, `core/dialogue-schema.ts`,
`tests/unit/dialogue.test.ts`, this file. `docs/DEVIATIONS.md` and `docs/DEVIATIONS-*.md` belong to
another lane, so every gap below is recorded here and needs a DEVIATIONS row added at integration.

---

## 1. Shape of the file

```
data/dialogue.json
├─ _source / _guardrail / _budget / _conditionModel / _chains / _counts   ← documentation keys
├─ speakers[]   62 rows: id, name, kind (named|generic|ambient|prop), role?, home?, portrait
└─ entries[]   211 rows: id, speaker, node, kind, quest?, signChain?, chainStep?, propId?,
                         priority?, when?, lines[], choices?, setFlags?, goto?
```

**499 lines across 62 speakers** — 300 across 17 named NPCs, 129 across 31 ambient, 45 across 4 prop
readers, 25 across 10 innkeepers/vendors. `portrait` is a row id in `tools/comfy/manifest.json`, so
every speaker is drawable with art the asset lane has already planned; nothing here implies a new
sprite class.

`when` is the whole state model, and since Q3 it carries **two independent clocks** (§8):

- **`act` / `actMin` / `actMax` — the STORY clock.** Derived from badges and quest flags by
  `actFromFlags()`; every story beat gates on this, so it fires whenever the player earns it, in any
  calendar year.
- **`years` / `yearMin` / `yearMax` — the WORLD clock.** Unbounded, never waits for the player, and
  only world-ageing copy reads it.

`seasons` gates the four migrant windows; `flagsSet` / `flagsUnset` / `flagEquals` read
`SaveFile.questFlags`; `population` and `floraStock` read the **live** `SaveFile.nodeStates`, which is
what makes a town's lines change as its web does rather than as a script says. Among the entries
matching a `(speaker, node, kind)` request the game takes the highest `priority`; every
greeting/ambient group ships exactly one unconditional fallback, so nobody is ever mute and selection
is never ambiguous.

`core/dialogue-schema.ts` exports `conditionHolds()`, `selectEntry()` and `actFromFlags()` so the game
layer never has to re-implement condition resolution **or** the badge ladder, and the test proves the
resolution actually switches lines. `DialogueContext.act` is deliberately **required**: an act clause
that passed because nobody supplied an act is how the finale stops firing with nothing going red.

---

## 2. Bible gaps filled (G2 — nothing silent)

None of these invents a species, move, type, town, node or roster entry; those are all verbatim from
the shipped data, and the test proves it.

| # | Gap | What was filled | Risk |
|---|---|---|---|
| D-1 | bible §10 says "+ ~2 quest NPCs per town" and names none | Seven given names coined: **Tolm** (Hearthollow farmer, *The Fallow Field*), **Nessa** (Brackwater angler, *Restock the Shallows*), **Halder** (Bowerdeep silk merchant, *Silk Shortage*), **Pell** (Bowerdeep lantern-keeper, *Lanternless Night*), **Gerta** (Cindershelf miner, *After the Crash* + the Kilnback chain), **Ives** and **Orrin** (Duskhollow astronomers, *The Star Census* and *Vellsire's Trail*) | Low. Each maps onto an NPC sprite class already in the asset manifest, so no new art. Needs the G15 IP sweep like every other coined name. |
| D-2 | bible §10 gives ambient townsfolk no names | Trade labels, not personal names — "Old Drover", "Net-Mender", "Shaft-Hand", "Fishery Buyer" | None. Keeps the coined-name surface as small as possible. |
| D-3 | bible §9 names four quests by effect but not by giver | Assigned to Halder, Pell and Gerta; *First Signs* to Maren and *Forge a Legacy* to Bram, both of whom the bible already names for that role | Low. |
| D-4 | bible §4 says the Ancient hunts are "gated behind rare sign-card chains unlocked by side content" but does not specify the chains | Three chains with explicit step counts and flag gating (§3). The *content* is the bible's own four required lore surfaces; only the step structure is new. | Low, but the gate that unlocks a catch attempt must be wired by the quest/encounter lane against `chain.<ancient>.complete`. |
| D-5 | Micro-geography inside named towns | Invented as texture: Cindershelf's numbered shafts, Bowerdeep's "winding house" / "eastern stair" / lantern road, Brackwater's numbered pilings, Duskhollow's vale road and margin book, Sel's grandfather | Medium-low. Worth a pass once the B4/B6 painted maps land. |
| D-6 | Number of dialogue "kinds" | `battle-post` split into `battle-win` / `battle-loss` — one kind gave gym leaders two entries with identical (empty) conditions, making selection arbitrary | None — schema-only. |
| D-7 | The player character never speaks | All player agency is in `choices[]`; no scripted player line. The bible does not settle this either way. | None. |

Two proper nouns appear in dialogue that exist in the bible but in no shipped data file:
**Fallowmere** and **Cullbrand**. With the four bible-named NPCs that likewise appear in no data file
(Maren, Wick, Bram, Sel) they are the entire contents of `BIBLE_NAMES`, which the test caps.

---

## 3. The Ancient lore chains

bible §4 marks four lore surfaces as *required content*. All four are present, and all three chains
are progressions — a trailhead, then lines that open only once the previous step is earned.

**`vellsire-chain` — Maren's keystone lectures + the Duskhollow astronomers (steps 1–11)**

| Step | Who / what | Where | Opens on |
|---|---|---|---|
| 1 | Maren — what a keystone *is* | Hearthollow | *First Signs* finished |
| 2 | antler standing-stone | Meadow Reach | step 1 |
| 3 | Maren — the stones predate the counting | Brackwater | step 2 |
| 4 | antler standing-stone | Brackmarsh | step 3 |
| 5 | Maren — three thin decades in the tree rings | Bowerdeep | step 4 |
| 6 | Maren — the order a web empties in | Cindershelf | step 5 |
| 7 | **Orrin — the vanishing**, from the observatory margin book | Duskhollow | step 6 |
| 8 | Maren — the last confirmed sighting | Duskhollow | step 7 |
| 9 | antler standing-stone, the gate stone | Sanctum Approach | step 8 |
| 10 | Maren — the choice, stated without a recommendation | Sanctum Approach | step 9 → `chain.vellsire.complete` |
| 11 | the antler ring | The Sanctum Fallow | act 6 |

The three route stones that are *not* numbered steps (Bowerdeep Wilds, Cinder Steppe, Duskhollow
Vale) are part of the six-stone trail *Vellsire's Trail* asks you to walk; each sets a `trail.stone.*`
flag and each gates on its own flag so it reads once.

**`undermere-chain` — Sel's serpent tales (steps 1–7)**
Sel's pole depths → the dock idol → the lake-beneath-the-lake → *Ferryman's Wager* + "eyeless" → the
Brackmarsh idol → the line between the two idols → Sel hands over his grandfather's card and the name
*Undermere* → `chain.undermere.complete`. Step 4 requires a finished side quest, which is the bible's
"unlocked by side content" in practice.

**`kilnback-chain` — Bram and the miners on "the warm shell below" (steps 1–6)**
Bram's warm forge floor → the shrine at the shaft head → Bram on what the shrines are *made of* →
Gerta's thirty-one-year temperature log → the deep shrine with KILNBACK cut across the join → Bram
hands over the card → `chain.kilnback.complete`.

The test proves each chain's steps are contiguous from 1, that no step is reachable before its
predecessor's flag **or before its predecessor's act** (it was *year* before Q3 — see §8; with the
chains off the calendar the year form of that assertion no longer bites, so the act form was added
beside it rather than replacing it), that no step re-fires, and that all three terminal flags are
reachable by a **value-aware** flag fixpoint seeded from a documented list of fourteen
externally-granted flags.

The `yearMin` on each chain step was never about the calendar — it stood in for "you can reach the
town this step is in". Q3 made that distinction load-bearing, so every one of them is now an
`actMin`. Row 11 of the vellsire chain (`prop.sanctum-antler-ring`, the antler ring) was
`years: [6]` and is now `actMin: 6`.

---

## 4. G7 — the read-through

> **G7. Do not write moralizing copy about catching anywhere — numbers only; the ledger is the moral.**

### What the automated scan does

`tests/unit/dialogue.test.ts` scans every line, every choice prompt **and every entry's joined body**
(so a phrase split across two lines is not invisible) against 39 patterns covering explicit
guilt/blame vocabulary, the reprimand register, loaded nouns, second-person accusation and the stock
ecological sermon. It is checked in both directions: **19 positive controls** must all be caught, and
**7 negative controls** — real observational lines, including the bible's own examples — must not
fire. There is also a chorus check: no sentence may be repeated across three or more speakers.

Words that only ever appear in a reprimand are banned **outright, even inside a negating sentence**.
"That isn't cruelty, it's a price list" would have been a good line and is not in the file, because a
scanner with exemptions is not a scanner.

### What the automated scan cannot do

**It cannot detect tone, and it is labelled a vocabulary tripwire for that reason.** These are all
reprimands and none of them is reliably catchable:

- "There were nine Fenmaw here the week you walked in. Say the number back to me."
- "I do not need the ledger to know which way you walked."
- "The marsh was fuller when you arrived."

It also cannot see *placement* — a neutral line fired immediately after a catch becomes a comment on
the catch. Treat a green scan as "no banned vocabulary", never as "G7 satisfied".

### The read

**Every one of the 499 lines was read individually against one question: is this an observation, or
a judgement?** An independent adversarial audit then re-read all of them and found five I had
cleared. All five were fixed; the reasoning is recorded because the calls are close.

**Fixed after the audit disagreed with my read:**

1. `tolm.quest.fallow.done.short` — was *"Numbers are the numbers; **I don't hold books against
   people**."* I had shipped this deliberately, as a line whose job is to defuse the failure branch.
   The audit's objection is correct and better: it is the only line in 499 that raises blame as a
   *concept*, and raising it presupposes it was available. It now ends at "Numbers are the numbers."
   The pattern list gained `\bhold \w+ against\b` so it cannot come back.
2. The **"I'll read your entry" motif** ran three times in the finale — Maren, Wick and Greaves.
   Individually neutral; stacked, it assembles anticipatory judgement out of observational parts (and
   is a craft repetition defect besides). Wick's and Greaves' are cut; Maren's stays, because hers is
   the one attached to a refusal to advise. A chorus check now fails any sentence three speakers share.
3. `wick.act6.pre` — was *"this is the argument, finally, and it's mine, **not yours**"*, which is
   unconditioned and assigns the player an anti-harvest position they may never have held. Now "and
   it's mine."
4. `bram.mine.closing` — was *"boarded, **which is worse, because boarding is a decision**"*, and it
   fires **because the player depleted Cragmar**. A value judgement inside a depletion-gated entry is
   the exact failure mode. Now "boarded. Somebody signed that." — same observation, no verdict.
5. `amb.brackwater-dockhand.rot` — dropped *"You can do that arithmetic standing right here."* A
   second-person imperative inviting the conclusion, again on a depletion-gated entry.

**Still flagged for a human ruling — quoted in full:**

1. `maren.keystone.6` — *"I can't tell you what to do when you're standing in front of it. I can tell
   you the ledger will read differently either way, and that I will be reading it."*
   My judgement: observation. She explicitly refuses to advise and "either way" is symmetric. But
   "I will be reading it" is the closest the file comes to implying the player is watched, and it is
   now the only surviving instance of that motif. **The most borderline line in the corpus.**
2. `maren.epilogue.caught` — *"Breeding in every node adjacent to the Sanctum runs at the base rate
   now. That's the whole of the difference, and **it is a real one** — four seasons to see it, eight
   to be sure of it."*
   My judgement: observation — an ecologist insisting on the magnitude of a measured effect, and the
   released epilogue carries the symmetric cost (*"You don't own the thing you spent six years
   finding."*). The audit agreed the epilogues are clean and named this clause as the only thumb on
   the scale. It is also the line most likely to appear in the demo video.
3. `sable.pre` — *"There are not many left to catch out there, which I mention as a fact about my
   bench, not about you."* Observation, in character, but a disclaimer draws attention to what it
   disclaims. Cutting the second clause leaves a clean observation and loses the joke.
4. `maribel.greeting.reach-thin` — *"Meadow Reach is thin on Nibbin this season. I breed mine at home,
   so my count doesn't move when the Reach's does."* Fires **only when the player has driven the
   Nibbin count down**. Survives because she gives a husbandry reason rather than a contrast; the
   trigger is what makes it worth a second opinion. The audit cleared it.
5. `tolm.quest.fallow.offer` — *"You can take them instead. Buyers in Hearthollow will give you coin
   today for a Loamunder. I'd just rather you took my offer, and I'd rather say so plainly than have
   you guess."* Bible §9 asks for a farmer who "begs you not to catch Loamunder", so the beat must
   exist; it is written as a paid arrangement with an explicit alternative rather than an appeal.

**Judged clean, with the reasoning, because these are the load-bearing ones:**

- **Wick is persuasive, not a strawman** — the audit's verdict too, and it called him "the strongest
  thing in the file". He concedes the opposing empirical claim and wins on a different axis
  (*"Vesper will tell you the Webvern count can't take the orders Halder is writing. **She's probably
  right.** She's also on the road."*), he implicates the player's own town in the payout, and he says
  outright that he has never found the argument that beats Greaves. He changes position in Act 6 on
  **arithmetic**, not conscience: *"Not a change of heart — I want that on the record, because it
  isn't one. It's a change of arithmetic… There's nothing under it."* That decision is what lets the
  game hold a counter-argument without any character moralising at the player.
- **Maren is an ecologist, not a conscience.** She never evaluates a catch. Method, mechanism, and a
  refusal to advise. The retirement line is deliberately unsentimental: *"It's out of years. That's
  all that has happened; it isn't hurt and it isn't sick."*
- **Townsfolk disagree with each other, not with the player.** Vesper objects to Halder's order;
  Halder answers *"I'm not going to pretend she's wrong to get you to say yes."*
- **The Cullbrand workers own their own history.** *"I was on the crew. I'm not going to tell you I
  wasn't."*
- **Population-triggered lines report, they do not comment.** *"Walked the tussock line all morning
  for two Nibbin. It used to take about ten minutes."*

### Rule for anyone adding lines later

Run the scan, then read the new lines yourself against the same question. A line that passes the
regex and fails the read is exactly the failure mode the regex exists alongside, not instead of.

---

## 5. Content-truth defects found by the audit, and fixed

The copy had been written against the **bible's** models rather than the **shipped** ones. Every one
of these is now checked by a test, so the class cannot recur silently.

| Defect | Ground truth | Fix |
|---|---|---|
| Starter age forms said the final form arrives "at four" (×3 lines) | `balance.age.yearsInClass = {J:1,A:1,E:1}` — a juvenile taken in year 1 is Elder in year **three** and retires in year four | "at three"; a test derives the years from `balance.json` |
| *Restock the Shallows* was built on a four-year Bogling→Mirefin maturation lag (×4 lines) | wild populations carry **one count per line**, no age structure; a released Bogling raises `mirefin-line` immediately | rewritten around the single count the fishery is priced on |
| Elder Mirefin was "four years of channel current" | same model | "three years" |
| *"It stalks Reedrick and **Bogling** both"* — a bait instruction | Bogling is the J form of `mirefin-line`; the web reads adult roles (`ecosim.webRoleAgeClass = "A"`), so this is self-predation | Reedrick only; a generic self-predation test now scans every line |
| *"**Duskstalk hunt the migration**"* | Apex takes Mesopredators and **large** Grazers; Gloomoth is a non-large Grazer, so the edge does not exist | rewritten; `FORBIDDEN_EDGES` pins it |
| *"**Producers** went with the flora"* on Cinder Steppe | r4 ships no Producer-role line; its base is the abstract flora stock | "Flora stock went first. Ashvole and Cragmar graze it…" |
| Reed bait's Grazer targets listed Bogling | same web-role issue | Reedrick only |
| *"You'll find four of them low and one of them high"* | r4 ships healthy counts; only `floraStock: 42` expresses the crash | the survey now asks for the flora reading |
| The salvage crew asserted an emptied scarp **unconditionally** | the node ships Cragmar 10 / Pyrelisk 14 / Stonewing 3 | split into a neutral base plus `amb.r4-worker.emptied` behind a population gate |
| The vanishing was "thirty years" in four places and "two decades" in one | — | "three decades"; a chronology test now requires one figure |
| The steppe contract was "six years" for Wick and "closed in four" for Greaves | — | Wick says four; a test pins the pair |
| *"Wispurr are winter animals **and it is winter**"* with no `seasons` clause | the entry fires in any season of year 5 | reworded; a test fails any line naming the current season without a `seasons` gate |
| The Vellsire choice jumped straight to `maren.epilogue.caught` — "It's yours" with no catch attempt | bible §4: Ancients are "very hard catches" | the choice now records `story.vellsire.attempt`; the encounter writes `story.vellsire.outcome` |
| Three trail stones had no `flagsUnset`, so they re-fired forever | — | each gates on its own flag |
| Six prop chain steps had no year gate and could open before the NPC step they follow | — | `yearMin` matched to the predecessor (now `actMin`, §8) |

### Defects the audit found that are NOT mine to fix

- **`data/nodes/r4.json` ships healthy populations** (Cragmar 10, Pyrelisk 14, Stonewing 3) while
  bible §6 says Cindershelf is "arrival **mid-collapse** — Route 4's web already crashed by Cullbrand
  strip-harvest". Only `floraStock: 42` expresses the crash. The dialogue has been rewritten so it no
  longer asserts a collapse the data does not ship, but **the node data is the real fix** and
  `data/nodes/` is read-only to this lane.
- **Nothing in `game/` reads `data/dialogue.json`.** The schema's only importer is its own test, so
  87 green tests prove the file is well-formed, self-consistent and truthful about the game's rules —
  not that a single line reaches a player. The 14 `EXTERNAL_FLAGS` are asserted to be exactly the
  documented list, but nothing checks any system ever *sets* them. That seam belongs to lane C.
- **Wick has no population- or flag-conditioned lines.** Bible §8 promises "the routes he's worked
  are visibly degraded when you reach them", and no line anywhere reads the player's own ledger back
  at them. The audit called this the largest missing content beat in the file. Writing it would mean
  crossing the G7 line very carefully, and it is the highest-value remaining dialogue work.

---

## 6. What the tests bind, proved by sabotage

87 assertions. Sixteen deliberate sabotages were injected and every one turned the suite red:

| Sabotage | Caught by |
|---|---|
| epilogue gates on `"catch"` instead of `"caught"` | outcome-vocabulary assertion |
| both epilogues gate on `"caught"` (one ending dead) | distinct-outcome assertion |
| a chain step requires and forbids the same flag | self-blocking-condition assertion |
| a chain step moved back to year 1 behind a year-3 prerequisite | chain year-ordering assertion |
| a quest gated on a count above `carryCap` | reachable-population assertion |
| "It stalks Reedrick and Bogling both" reinstated | self-predation scan |
| a new diet line added to an already-reviewed entry | count-exact predation-verb review |
| "The Ash Steppe" inserted into a line | G2 rule B (multi-word places) |
| "Grimwyrm" inserted into a line | G2 rule A (per token) |
| starter age form set back to "at four" | age-model assertion vs `balance.json` |
| "two decades" reinstated | chronology assertion |
| an ungated line claiming a species is absent | absence-must-be-population-gated assertion |
| a chain step number skipped | contiguity assertion |
| 30 lines added to one entry | schema `lines` bound (module fails to load) |
| 12 lines spread across Maren's entries | per-speaker ceiling + total budget |
| an unused speaker row added | dead-speaker assertion |

The G2 allow-lists are all capped, none may contain a species name, a trait-name fragment or a place
head, and `KNOWN_NAMES` is asserted **not** to be sourced from `dialogue.json`'s own speaker table —
a file must not be able to certify its own inventions.

---

## 7. Known gate interaction

`core/dialogue-schema.ts` reads every world bound from `data/balance.json` rather than re-typing it,
so a retune cannot leave the dialogue schema validating against a different world than the sim
(G11 / INV-3): `ecosim.floraMax` is the flora ceiling, `clock.startYear` is the year floor, and
`acts.first` / `acts.last` are the act range.

**What `clock.yearsTotal` means changed under Q3.** It used to be the ceiling on a year in a
condition (`zYear` was `min(1).max(yearsTotal)`), which is precisely the assumption that made a
year-8 run lose the finale. The calendar is now unbounded, so `zYear` has a floor and no ceiling, and
the value is exported as **`NOMINAL_YEARS`** — the span a normally paced run reaches, a correlation
and not a rule. It is still read from `balance.json`, and the tests use it to probe well past it.

### The act ladder is `core/acts.ts`, and this module has none of its own

**This is the correction of a shipped defect, not a refinement.** Q3a bounded the act axis with
`ACTS_TOTAL = ACT_GYM_IDS.length` — the gym count — and derived the act itself with a local
`actFromFlags()` that returned `1 + badgesBeaten`. Both were wrong in the same way, and the way was
invisible:

> **There are six gyms and SEVEN acts.** `balance.acts.first` is **0** — the prologue, the act a
> brand-new save is in until Maren's opening chain writes `story.opening.done`. `1 + beaten` cannot
> return 0 and `min(1)` cannot express it.

So the corpus gated `maren.opening`, the three starter branches and both tutorials on `act: [1]`,
which is the act you reach *by finishing them*, while `game/registry.ts` and `OverworldScene` handed
`actOf()`'s answer — 0. The game's first scene did not fire, the three entries that write
`story.opening.done` were themselves behind the gate that flag opens, and **nothing was red**,
because every test supplied its own act and agreed with the corpus rather than with the game.

What ships now:

- **`actFromFlags()` is a one-line delegation to `core/acts.ts` `actOf()`** and must never grow a
  body. One authority, one implementation. A second derivation of a value that already has an
  authority is the bug, every time.
- **`FIRST_ACT` / `LAST_ACT` are read from `balance.acts`**, so `zAct` admits act 0 and a
  prologue-only line is authorable. `ACTS_TOTAL` is gone; `ACT_GYM_IDS` remains and is documented as
  *not* the ladder.
- **`conditionHolds()` / `selectEntry()` throw on a context off either clock** rather than answering
  `false`. An act outside the ladder made every `act` clause false and every unclaused entry
  eligible — a game rendering fallback lines everywhere and reporting nothing, which is the exact
  silent failure the "act is required, never optional" rule was written to prevent.
- A test reads the SOURCE of the two bound declarations, because the gym count and `acts.last` are
  both 6 today and no assertion on their *values* can tell them apart. Add a seventh leader and the
  conflation returns silently; that assertion is the only thing that survives the day it does.

Four numeric literals remain and are **structural shape bounds, not gameplay constants**: a line body
is at most 400 characters, a choice prompt at most 120, an entry at most 8 lines, and a choice list at
most 4 options. No formula reads any of them and no `balance.json` retune can move them. The
`MAGIC_NUMBER_ALLOWANCE` row in `tests/gates/guardrails.test.ts` keeps those four values unchanged —
this change added no literal — and its `why` has been corrected, because it described a 1..6 year
range this file no longer enforces and said nothing about the act range at all. **That file is
another lane's; the edit is prose inside the row that documents THIS module, and it is called out in
the change report.**

---

## 8. Q3a — the 44 year-gated entries, and the two clocks that replaced the one

**What was wrong.** `data/dialogue.json` was authored against content-bible §6's opening equation,
*"Six acts = six years"*, so it gated progression on the calendar. **44 of 211 entries carried
`years: [N]`** — an exact calendar year — and that set was the entire rival arc, both Greaves
cutscenes, `greaves.finale.pre` / `.post`, `maren.finale`, `sanctum.vellsire.approach`, both
epilogues, `prop.sanctum-antler-ring`, the whole opening chain, `maren.keystone.1`,
`maren.quest.first-signs.*`, `tolm.quest.fallow.offer`, Maren's six town greetings, and
`amb.r4-worker.arrival`.

Under Q3 (Hank's authorised amendment to locked decision L8 — see `docs/DEVIATIONS.md`) the calendar
is unbounded and carries no progression. **A player who reached the Sanctum in year 8 saw none of the
ending**, including the Vellsire choice and both epilogues, which are on build-doc §16's never-cut
list — and nothing went red, because the reachability fixpoint walked flags only and never looked at
`years`.

**The rule the split was made on.** Is the beat about the STORY or about the WORLD?
Story — the rival, Greaves, the finale, the choice, the epilogues, quest-givers, tutorials, the lore
chains — gates on the **act**, so it fires whenever the player earns it, in any calendar year.
World — docks rotting, the canopy thinning, the mine opening a shaft, a child growing up — stays on
the **calendar**, because the town ages with the world and not with the plot.

### The split, by bucket

**A — the 44, all moved off the calendar.**

| Entries | Was | Now | Why |
|---|---|---|---|
| `maren.opening`, the three `maren.starter.*` | `years: [1]` | **`act: [0]`** + `flagsUnset: story.opening.done` | **CORRECTED — this shipped as `act: [1]` and deadlocked the game.** Act 0 is the prologue and is where a brand-new save is; act 1 is what finishing this chain OPENS, so gating the chain on act 1 put the three writers of `story.opening.done` behind the gate that flag opens. The starters now also read the flag they write, so no act-ladder change can make them loop. |
| `maren.tutorial.snare`, `maren.tutorial.ledger` | `years: [1]` | **no act clause**, flags only | **CORRECTED from `act: [1]`.** They are `goto` targets of the starter entry that WRITES `story.opening.done`, so they straddle the act 0 → 1 boundary and an act clause on either side of it can strand them. Their own `tutorial.*.done` flags are the guard. |
| `maren.quest.first-signs.offer`, `.done`, `maren.keystone.1` | `years: [1]` | **no calendar or act gate**, flags only | this was **D2**, a hard dead-end: `.done` is the only source of `chain.vellsire.unlocked`, and `maren.keystone.1` needed that flag *and* year 1, so a player who did not turn *First Signs* in within year 1 permanently lost the 11-step Vellsire chain, *Vellsire's Trail* and the lore behind the finale. Gating on the flags alone is the fix |
| `tolm.quest.fallow.offer` | `years: [1]` | flags only **+ `population: hearthollow.loamunder-line gte 24`** | A quest offer must not expire on a clock — but this one quotes the ledger (*"There are twenty-four of them my side of the fence"*) and losing `years: [1]` left it with no clause of any kind, so it could assert a number the on-screen ledger contradicted, forever, on both clocks. Its own completion beat one entry away already carried exactly this clause. |
| `maren.greeting.y1`–`y6` → **renamed** `maren.greeting.act1`–`act6` | `years: [N]` | `act: [N]` | each is that act's arrival pointer in that act's town (*"Talk to Gerta before you go up the steppe"*), and the id said `y` for a year it no longer means |
| the 18 rival entries `wick.act1..6.{pre,win,loss}` | `years: [N]` | **`actMin: N`** — a floor | **CORRECTED from the equality.** The stated reason for the equality — *"`actMin` would leave his act-1 lines still firing at Meadow Reach in act 6"* — is false: every `.pre` already carries `flagsUnset: rival.actN.fought`, and each route hosts exactly one Wick battle, so `.win`/`.loss` cannot collide either. What the equality DID do is delete each encounter at the moment the player earned a reason to walk that act's route: `balance.acts.gates` opens town *N* and route *N* in the SAME act, and Wick stands on the route while the gym is in the town — so beating gym *N* advanced the save to act *N+1* and lost `wick.actN.*` permanently, for playing efficiently. |
| `greaves.act3.intro`, `greaves.act4.steppe` | `years: [3]` / `[4]` | `actMin: 3` / `4` | one-shot cutscenes already guarded by `story.greaves.met` / `.steppe`, so a floor is strictly better than an equality — a player who blows past Bowerdeep still gets the introduction on the way back, instead of meeting Greaves for the first time at the finale |
| `maren.finale`, `greaves.finale.pre`, `greaves.finale.post`, `sanctum.vellsire.approach`, `maren.epilogue.caught`, `maren.epilogue.released`, `prop.sanctum-antler-ring` | `years: [6]` | `actMin: 6` (both epilogues **+ `flagsUnset: story.epilogue.shown`**) | the never-cut beats. Act 6 is the last act, so a floor and an equality are the same set — the floor is used because it cannot be broken by a later act being added. **CORRECTION:** `actMin: 6` is forward-open on a clock that never stops, so it terminates nothing. The two epilogues wrote `story.epilogue.shown` and **nothing read it**, so the last cutscene in the game replayed on every further word with Maren at the Sanctum, in year 6 and year 30 alike — the old `years: [6]` had been the only thing ending them. `maren.finale` one entry away already had the pattern. |
| `amb.r4-worker.arrival` | `years: [4]` | **`actMin: 4`** + a one-shot `story.steppe.arrival.seen` guard | **CORRECTED from `act: [4]`, same defect as the rival arc.** Act 4 opens cindershelf AND r4, so Sable's badge is takeable without ever walking r4 — and this is the only line that frames the crash on arrival, for exactly the early arriver Q6 is written for. The floor alone would have made it the permanent r4 ambient and buried `.base`; the seen-flag makes it what its id says it is. |

**B — 32 `yearMin` gates that were standing in for an act prerequisite, also moved.** This is beyond
the literal 44 and it is the same defect: a `yearMin: 5` quest offer is story driven by time, which
is the thing Q3 removes. Left alone, Q3 would have shipped a decoupled calendar with year-gated story
copy, which `docs/QUEUED-CHANGES.md` says is *"strictly worse than the coupled version it replaced"*.
Every one is a `yearMin: N` → `actMin: N` with N unchanged, so the authored pacing is preserved
exactly, on the axis it actually meant:

`maren.tutorial.release` · `maren.keystone.2`–`.6` · `maren.crash-survey` · `sel.tale.1`–`.5` ·
`sel.quest.wager.offer` · `bram.warm.1`–`.3` · `bram.quest.forge.offer` · `gerta.warm.testimony` ·
`gerta.quest.crash.offer` · `nessa.quest.restock.offer` · `halder.quest.silk.offer` ·
`pell.quest.lanternless.offer` (keeps its `seasons: ["autumn"]`) · `ives.quest.census.offer` ·
`orrin.vanishing` · `orrin.quest.trail.offer` · the six chain props
(`prop.brackwater-idol-dock`, `prop.r2-idol-shallows`, `prop.r2-antler-causeway`,
`prop.cindershelf-shrine-mine`, `prop.cindershelf-shrine-deep`,
`prop.sanctum-approach-antler-gate`) · `amb.r4-worker.emptied`.

Two of those deserve their reasoning stated, because they look like world lines:
`maren.crash-survey` and `amb.r4-worker.emptied` both read a live population (`r4.stonewing-line ≤ 1`)
and both had a `yearMin: 4`. The population clause is the world; the year floor was standing in for
*"you are in the steppe act"*. Under Q3 the raid that crashes r4 fires on **act**, so a year-floor
would leave a player standing in the crash with nobody able to describe it.

**C — 19 entries that stay on the calendar, deliberately.** Town ageing and retirement:
`sel.docks.rotting` / `.rebuilt` · `bram.mine.expanding` / `.closing` · `amb.bowerdeep-logger.thin` ·
`amb.hearthollow-elder.bloom` / `.thin` · `amb.hearthollow-child.older` ·
`amb.hearthollow-fenceman.late` · `amb.brackwater-dockhand.rot` / `.rebuilt` ·
`amb.brackwater-buyer.lowseason` · `amb.brackwater-netmender.late` · `amb.r1-forager.thin` /
`.bloom` / `.late` · `amb.r2-ferryhand.quiet` / `.apex` · `maren.retirement`.
All are `yearMin` — forward-open — so every one of them has a sensible reading at year 12 and at
year 30. A test names fourteen of them and fails if any migrates to the act axis.

**Where this departs from `docs/STORY-REVIEW.md` §6 D1's recommendation.** D1 suggested leaving
`maren.greeting.y1–y6` on the calendar as *"harmless — an unconditional fallback exists"*. That is
true of the mechanism and not of the content: the fallback is Maren's generic station line, so a fast
player arriving at Cindershelf in year 1 would lose *"Gerta has a shaft survey she can't finish
alone. Talk to her before you go up the steppe"* — a navigational pointer, not flavour. They are
act-gated instead. Everything else follows D1.

### What the tests now bind

`tests/unit/dialogue.test.ts` §7b. The load-bearing ones:

- **No entry anywhere is unreachable.** A *constructive* fixpoint over the whole condition space, not
  just the chain flags: for every one of the 211 entries a `DialogueContext` is built from its own
  clauses and handed to the shipped `conditionHolds()`. Contradictory clauses (a `gte 9` and an
  `lte 4` on the same count, a flag required and forbidden, a count above `carryCap`) produce no
  witness and fail. A second assertion checks the witness is a world a player could actually hold —
  every flag in it reachable, every count inside its node's cap — so the first cannot pass by the
  builder inventing a context.
- **The same sweep repeated at years 6, 8, 12 and 30.** This is the shipped defect's exact shape:
  fine at year 6, silent at year 8.
- **The finale, the Vellsire choice and both epilogues resolve at act 6 in all four of those years**,
  named individually, through `selectEntry()`.
- **And do NOT resolve at act 5**, however late the calendar runs — each probe carrying only the
  flags its own target needs, so it is the act clause being tested and not a flag standing in for one.
- **The rival arc fires in every act in every year**, all six acts × five years.
- **A world-ageing line still reads sensibly at year 12** — `sel.docks.rotting` / `.rebuilt` /
  fallback switch on the Mirefin count, and the calendar-gated ambient set is still speaking.
- **The split itself is published** as an act-floor table and asserted exactly, so a deleted act gate
  and a drifted one both fail.
- **A chain step is never gated to an earlier ACT than its predecessor.** The year form of this
  assertion still exists but no longer bites (every chain step's year floor is now 1), so the act
  form was added beside it rather than replacing it.

**Proved by sabotage — seventeen injections, every one red:** each of the four never-cut beats put
back on `years: [6]`; a rival encounter put back on `years: [3]`; the finale's act gate deleted;
each epilogue's act gate deleted; a chain step moved back an act; a chain step's act gate deleted; a
rival encounter loosened from `act: [N]` to `actMin: N`; Greaves' introduction drifted one act; an
unreachable population (`gte 999`); a contradictory population pair; a `yearMax` ceiling on a world
line; town ageing migrated to the act axis; an act past the last act; and a seventh "six years" line.

### Repairs made after the first Q3a pass, and what now binds them

Every item below was a defect an independent verifier reproduced against the shipped file. The
sabotage sweep that proves each repair is bound is in §6's format: **fifteen corpus injections and
four schema injections, every one red**, with `data/dialogue.json` and `core/dialogue-schema.ts`
restored byte-identical (md5 checked) after each.

| Injection | Caught by |
|---|---|
| `maren.opening` back to `act: [1]` — the deadlock itself | *a brand-new save is in the prologue and Maren opens the game there* (3 tests red) |
| a starter's act clause deleted | *every story beat carries exactly the act clause the split put on it* |
| `act: [1]` restored on a tutorial | same, + *an act equality is only used where the door is meant to close* |
| either epilogue's `flagsUnset` deleted | *an epilogue plays once and is then over, in every calendar year* |
| one rival entry, or all 18, back to `act: [N]` | *an encounter the player walked past is still waiting on its route in a later act* (4 red) |
| `wick.actN.pre` loses its `rival.actN.fought` guard | *…and is gone once it has actually been fought* |
| `amb.r4-worker.arrival` back to `act: [4]` | the exact-clause table + the equality enumeration |
| `tolm.quest.fallow.offer` loses its population clause | *a line that quotes the live ledger reads the live ledger* |
| `maren.greeting.act1` loses its floraStock clause | *a line that quotes live flora reads live flora* |
| `amb.r1-forager.late` back to `yearMin: 5` | *a run-length claim on the calendar is true at the year it first fires* |
| a new write-only flag appears | *every flag the corpus writes is either read by the corpus or a named output* |
| `zAct` floor back to 1 | the shipped file no longer validates at all |
| `actFromFlags` back to `1 + beaten` | *the dialogue act axis is core/acts.ts and agrees with it at every rung* |
| `assertContext` gutted | *a context off either clock throws instead of quietly answering false* |
| `LAST_ACT` counted off the gym table | *the act bounds are read from balance.acts, never counted off the gym table* |

**The test that mattered most did not exist before.** Every probe in the suite supplied its own act
number, so all of them agreed with a corpus that disagreed with the game. There is now one that
never types an act: it builds a flag bag, asks `core/acts.ts` `actOf()` what act that is — the same
call `game/registry.ts` makes — and walks the opening chain forward through the shipped
`selectEntry()`, one beat at a time, re-deriving the act after every flag write.

**The act-FLOOR table is gone**, replaced by an exact-CLAUSE table. A floor could not tell `act: [1]`
from no act clause at all — both floor to 1 — so every row reading `1` bound nothing, which a
verifier demonstrated by deleting `act: [1]` from both tutorials and watching the suite stay green.
The clause itself is asserted now, so a deleted gate, a drifted gate, an `actMin` narrowed to an
equality and an equality widened to a floor are all four visible. Beside it, the ten entries that
legitimately carry an act EQUALITY are enumerated by hand, so an eleventh is a decision.

### Still open — flagged, not fixed

1. **D19's forward drift is still Hank's ruling.** `docs/STORY-REVIEW.md` D19 flags six lines that
   hardcode *"six years"* as the length of a run; under an unbounded calendar a year-12 player can
   be told they have been counting for six. **A seventh belongs on the list: `wick.act3.win` —
   *"Three years running."*** — which is act-anchored, so it can be said in act 3 of year 1. The
   four story ones (`wick.act3.win`, `wick.act6.win`, `greaves.finale.pre`, `maren.epilogue.released`)
   are load-bearing finale lines. **Nothing was rewritten — the ruling is Hank's.** Four tests now
   pin the sets so the ruling has an exact checklist: act-gated lines naming a year span are
   enumerated count-for-count and classified `world` / `run-length`, and **calendar-gated ones are
   too, which they were not before** — that omission is what let item 2 below sit unnoticed.
2. **FIXED, and it was a gate bug rather than a copy bug.** `amb.r1-forager.late` stated *"Six years
   on the same four miles of Reach"* behind `yearMin: 5`, so it was false at its own earliest
   firing — before Q3 as well as after. Its two siblings (`amb.hearthollow-fenceman.late`,
   `amb.brackwater-netmender.late`) say "six years" behind `yearMin: 6` and are true at their floor;
   this one disagreed with its own gate. The gate moved to 6. **No copy changed**, the forward drift
   past year 6 is untouched, and it stays D19's to rule on. A test now asserts that a calendar-gated
   run-length claim is true at the year it first fires.
3. **FIXED — `maren.greeting.act1` now reads the flora it claims.** *"Meadow Reach is holding at a
   decent flora stock this year"* carries `floraStock: r1 gte 46`. **The threshold is DERIVED, not
   invented (G2):** the shipped neighbours call r1 "thin" at `lte 45`, so "decent" is the weakest
   claim consistent with both the copy and a number already in the file. `gte 80` was available and
   is "bloom", not "decent". A greeting group always ships an unconditional fallback, so the clause
   cannot mute Maren.
4. **MISSING — no act-4 arrival line for a player who arrives before the raid.** Unchanged. Q6
   recommends letting the act-4 raid crash r4 on entry, which means a player can stand on the steppe
   in the window before the raid fires, and there is no line for that window. `amb.r4-worker.arrival`
   is now a floor and a one-shot, so the arriver gets the framing whenever they arrive — but it is
   the crash's copy, not the before-copy. Nothing was written to fill it.
5. **MISSING — no beat marks entering an act.** Unchanged. Progression is an act index nothing
   announces; Maren's `greeting.act1`–`act6` are the closest thing and they are greetings.
6. **REVIEWED, deliberately unclaused — `maren.keystone.4`.** *"Cinder Steppe's flora stock is at a
   number I have never had cause to write before"* has no `floraStock` clause, and it is the one
   abundance line that keeps none. It names **no figure**, so there is nothing the ledger can
   contradict; and it is step 5 of the **Vellsire chain**, so a live gate on it would strand the
   chain — and with it `chain.vellsire.complete`, *Vellsire's Trail* and the lore behind the finale —
   if r4's flora recovered. Trading a vague claim for a new dead-end is the wrong trade. Classified
   `world` in the published review table so the decision is visible rather than absent.

### G7 re-read of every entry whose firing context changed

G7 is absolute and the vocabulary scan cannot see *placement* (§4), so every re-gated entry was read
again against the same question: is this an observation, or a judgement? **No line was rewritten and
none needed to be.** Two are worth recording because their context genuinely moved:

- **`maren.crash-survey`** and **`amb.r4-worker.emptied`** fire on `r4.stonewing-line ≤ 1`. With the
  year floor gone they can now fire in an early calendar year — which, since the act-4 raid may not
  have fired yet in a fast run, means they can be describing a crash the **player's own ledger**
  caused rather than the Company's. Both are clean: *"The condors did not leave first. The Cragmar
  went, then the Pyrelisk that ate the Ashvole, and the scarp emptied from the bottom up"* is
  mechanism with no addressee and no verdict, and the salvage worker's *"I was on the crew. I'm not
  going to tell you I wasn't"* keeps the Company's own history on the page. Flagged as a **watch
  item** rather than a violation: this is exactly the placement case §4 says the regex cannot catch,
  so it wants a human read once the lines are actually on screen (Q7).
- **`bram.mine.closing`** was already fixed for this class after the audit (§4 item 4) and stays on
  the calendar, so its context did not move.

**Re-read again for the repair pass, because three sets moved further than the first pass moved them.**
No line was rewritten and none needed to be; the vocabulary scan and the entry-level scan are both
still clean, and these are the placement questions a regex cannot answer:

- **The rival's 18 entries can now be met LATE.** `actMin` means a player who took every badge
  without walking the routes can meet Wick for the first time on r1 in act 6 and hear *"Wick.
  Cullbrand apprentice, second year"*. That is a continuity oddity, not a G7 one — there is no
  addressee and no verdict — and it is the identical trade the first pass already accepted for
  Greaves' introductions, where the alternative is meeting a recurring character for the first time
  at the finale, or never. Losing the encounter is strictly worse than hearing it out of order.
- **`amb.r4-worker.arrival` can now fire in act 5 or 6.** Its copy — *"I was on the crew. I'm not
  going to tell you I wasn't"* — is the Company's own history and reads the same whenever it is
  said. It is now a one-shot, so it says it once.
- **`tolm.quest.fallow.offer` is population-gated**, so a player who has already taken the west
  field below 24 will not be offered the quest. That is the correct silence: he cannot ask you to
  keep twenty-four standing when there are nine, and Hard Req 2 plus D12 both say silence beats a
  claim the ledger contradicts. It is **not a dead-end** — Loamunder breed, so the offer returns
  when the field does, which is exactly the arithmetic the quest is about.

The five borderline lines in §4 are untouched and still await Hank's *keep / trim / cut*.
