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

`when` is the whole state model. `years` / `yearMin` / `yearMax` gate the act; `seasons` gates the
four migrant windows; `flagsSet` / `flagsUnset` / `flagEquals` read `SaveFile.questFlags`;
`population` and `floraStock` read the **live** `SaveFile.nodeStates`, which is what makes a town's
lines change as its web does rather than as a script says. Among the entries matching a
`(speaker, node, kind)` request the game takes the highest `priority`; every greeting/ambient group
ships exactly one unconditional fallback, so nobody is ever mute and selection is never ambiguous.

`core/dialogue-schema.ts` exports `conditionHolds()` and `selectEntry()` so the game layer never has
to re-implement that resolution, and the test proves the resolution actually switches lines.

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
| 11 | the antler ring | The Sanctum Fallow | year 6 |

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
predecessor's flag **or before its predecessor's year**, that no step re-fires, and that all three
terminal flags are reachable by a **value-aware** flag fixpoint seeded from a documented list of
fourteen externally-granted flags.

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
| Six prop chain steps had no year gate and could open before the NPC step they follow | — | `yearMin` matched to the predecessor |

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

`core/dialogue-schema.ts` reads `balance.clock.yearsTotal` and `balance.ecosim.floraMax` from
`data/balance.json` rather than re-typing 6 and 100, so a retune cannot leave the dialogue schema
validating against a different world than the sim (G11 / INV-3).

Four numeric literals remain and are **structural shape bounds, not gameplay constants**: a line body
is at most 400 characters, a choice prompt at most 120, an entry at most 8 lines, and a choice list at
most 4 options. No formula reads any of them and no `balance.json` retune can move them. They need an
allowance row in `MAGIC_NUMBER_ALLOWANCE` in `tests/gates/guardrails.test.ts`, which is another lane's
file:

```
"core/dialogue-schema.ts": {
  values: [4, 8, 120, 400],
  why: "zod SHAPE bounds on the dialogue text surface, never read by a formula: a line body is at " +
       "most 400 characters and a choice prompt 120 (they must fit the 480x320 dialogue box), an " +
       "entry is at most 8 lines and a choice list at most 4 options. The two values that ARE " +
       "gameplay constants — the 1..6 year range and the 0..100 flora ceiling — are read from " +
       "balance.json (clock.yearsTotal, ecosim.floraMax), so no retune can move anything left here",
},
```
