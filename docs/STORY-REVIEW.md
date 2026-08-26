# TROPHIC — Story Review

*Assembled for Hank's review pass. Reading order: §0 → §1 → §2 → §3 → §4 → §5 → §6.*
*Sources: `docs/content-bible.md` §4/§6/§7/§8/§9/§10, `data/dialogue.json` (211 entries / 499 lines / 62 speakers), `core/dialogue-schema.ts`, `docs/DIALOGUE-NOTES.md`, `data/gyms.json`, `data/nodes/*.json`, `data/balance.json`, `docs/QUEUED-CHANGES.md`.*

> **CURRENCY — read before §6. Updated 2026-08-25.**
>
> **`data/dialogue.json` is being rewritten line by line as this note is written.** Every blockquoted
> line in this document is a **verbatim quotation of the corpus as it stood when the review was
> assembled**, and quotations are deliberately *not* being edited to match later copy — a quote
> rewritten to say what its source does not say is a fabrication. Treat every blockquote here as
> historical evidence of what was authored, not as a description of the shipped line. The entry
> **ids** are stable and are the reliable handle; the **counts in the source line above (211 / 499 /
> 62) have moved** and are left as the review's own provenance rather than a live figure.
>
> This also covers the six places this document quotes a line containing the word **"ledger"**.
> **Line numbers are deliberately not given** — this document is edited often and any number written
> here is wrong by the next edit (the first draft of this very note cited six numbers that its own
> insertion had already invalidated). Run `grep -n ledger docs/STORY-REVIEW.md`; the hits outside
> this paragraph are the six. The *feature* is now called the **survey** everywhere in
> code and prose (`docs/DEVIATIONS.md` D-SURV-1…D-SURV-10); those six are in-world dialogue
> quotations and are intentionally untouched. This document's own prose already says "survey".
>
> **Three decisions in §6 are closed** — D1, D2 and D12 carry a RESOLVED note in place. The other
> seventeen were re-checked against the current tree on the same date; **§6 opens with a status table
> giving each one a verdict**, so nothing here needs re-deriving before you read it.

---

## 0. How to read this document

### The three states

Every item in this document carries exactly one of these tags. Nothing is untagged.

| Tag | Means |
|---|---|
| **[WRITTEN]** | Authored copy exists in `data/dialogue.json`. It is quoted here verbatim. |
| **[OUTLINED]** | The content bible describes it in a line or two. Nobody has written it. |
| **[MISSING]** | Implied by the design, and neither written nor outlined. |

Where a beat is written but the *system* behind it does not exist, it is tagged **[WRITTEN]** with a separate note — the copy is real, the mechanism is not.

### The thing to know before anything else

> ## NOTHING IN `game/` READS `data/dialogue.json`.
>
> Verified this session: the only importers of `core/dialogue-schema.ts` or `data/dialogue.json` anywhere in the repo are the schema's own test (`tests/unit/dialogue.test.ts`) and documentation. `grep` across `game/`, `tools/` and `core/` returns nothing else.
>
> **So every single [WRITTEN] line below currently reaches zero players.** 87 green tests prove the file is well-formed, internally consistent and truthful about the game's own rules. They do not prove that one line has ever appeared on screen. This is build-order step **C7**, queued as **Q7** in `docs/QUEUED-CHANGES.md`, and it was not in the Lanes B+C wave.
>
> The same is true of the quest system: **all 12 `*.turnin` / milestone flags the quests gate on are in the test's `EXTERNAL_FLAGS` list — flags that dialogue *reads* and nothing *writes*.** There is no quest tracker, no turn-in, no sign-chain reader, no prop interaction. The copy is finished. The plumbing is not started.

### The other thing to know: Q3 changes the spine, and 44 entries do not know that yet

You authorised **Q3** — story progresses on badges and quest flags; the calendar runs independently and is unbounded. The dialogue file was written *before* that, against the bible's "six acts = six years" equation.

**44 of 211 entries gate on an exact calendar year (`years: [N]`)**, including the entire rival arc, both Greaves cutscenes, the finale, the Vellsire choice and both epilogues. Under Q3, a player who reaches the Sanctum in year 8 sees none of them. The full list and the recommended act/calendar split are §6 D1.

### Counts at a glance

| Section | WRITTEN | OUTLINED | MISSING | Notes |
|---|---|---|---|---|
| §2 Acts (6 acts × 5 slots) | 24 | 3 | 3 | 30 slots: gym / rival / act event / town ageing / story beats |
| §3 Side quests — **copy** | 10 | 0 | 0 | all ten authored |
| §3 Side quests — **logic** | 0 | 0 | 10 | no quest system exists |
| §4 Ancient chains — **steps** | 24 | 0 | 0 | 11 + 7 + 6, all authored, all contiguous |
| §4 Ancient chains — **the catch each gates** | 0 | 0 | 3 | nothing reads `chain.*.complete` |
| §5 Regional events — **copy** | 3 | 0 | 1 | Bloom Year has no copy of its own |
| §5 Regional events — **season-long per Q2** | 1 | 0 | 3 | only the Migration is season-long, and by accident |
| §6 Decisions | — | — | — | 20 items, each answerable in a sentence |

Dialogue budget check against bible §13.13 (~10 lines/named NPC, ~3/ambient, 400–500 total): **499 lines**, in band. Maren runs 70, Wick 37, Sel 32 — the four chain-carriers and arc-carriers are deliberately over the flat budget; every ambient speaker is at 3 except the ones carrying state variants.

---

## 1. The spine, in one page

### Premise

**Fallowmere** is a region whose keystone went out of it a generation ago. Warden **Maren** counts what is left. She hands you a juvenile, three snares and a survey notebook, and the survey is the whole argument: *catching decrements a real number at a real place, and the number is printed.*

> **Maren, opening — [WRITTEN]**
> "Maren. Warden of Fallowmere, which mostly means I count things and then write the counts down."
> "There used to be a keystone in this region. A stag. Vellsire. It went out of Fallowmere a generation back and nothing has stood in for it since."
> "Read it before you set out. Read it when you come back. **The difference between the two readings is the only report I want from you.**"

### The three-way engine

The game does not have a villain and a hero. It has three positions on the same measured fact, and the player is a fourth.

**Maren — method, never verdict.** An ecologist. She explains keystones, tree rings, the order a web empties in, and she refuses to advise. Her retirement line is deliberately unsentimental — *"It's out of years. That's all that has happened; it isn't hurt and it isn't sick."* She is not a conscience; she is an instrument.

**Wick — the rival, and the strongest writing in the file.** A Cullbrand apprentice your age, six encounters, one per act. He is not a strawman: he *concedes the opposing empirical claim and wins on a different axis*.

> **Wick, Act 3 — [WRITTEN]**
> "Vesper will tell you the Webvern count can't take the orders Halder is writing. **She's probably right. She's also on the road.**"
> "I'm not asking you to agree with me. I'm asking you to notice that **nobody in Bowerdeep is outside the trade**."

He implicates the player's own town in the payout (*"four towns ate off that payout, including yours"*), and he says outright that he has never found the argument that beats Greaves. In Act 6 he changes sides on **arithmetic, not conscience**, and insists on the distinction:

> **Wick, Act 6 — [WRITTEN]**
> "I'm not going in with him. **Not a change of heart — I want that on the record, because it isn't one.**"
> "It's a change of arithmetic. Cinder Steppe taught me what the column looks like after the last draw. **There's nothing under it.**"

That single decision is what lets the game carry a counter-argument without any character moralising at the player.

**Greaves — the Cullbrand Company, scaled.** He keeps the same book Maren does and calls it something else.

> **Greaves, Act 3 — [WRITTEN]**
> "You keep a warden's ledger. So do I — mine is called an inventory and it balances to the individual."
> "**We will disagree about very little except who the columns belong to.**"

> **Greaves, finale — [WRITTEN]**
> "The stag is a keystone. **A keystone is an input. An input with no owner is an input going to waste.**"

### The finale, and its honest costs

Greaves breaches the Sanctum with six teams and a transport cradle. You beat him. Then the Vellsire comes down into the antler ring and **nothing forces the choice** — the game states the two outcomes and stops talking.

> **The approach — [WRITTEN]** (`sanctum.vellsire.approach`)
> "It comes down into the ring without hurrying, and it is larger than the carvings made it."
> "Beast and Dark. Elder, and it has been Elder longer than the stones have been standing, and it will not be anything else."
> "**It waits inside the ring. Whatever happens next happens because you do it.**"
> → CHOICE: *"Set the snare."* · CHOICE: *"Stand aside and let it pass."*

The choice records an **attempt**, not an outcome — the encounter decides, because bible §4 says Ancients are very hard catches. Both epilogues are Maren reading the same six nodes out of the same book.

> **Caught — [WRITTEN]**
> "It's yours. Ancients don't age, so it stays exactly as it is for as long as you do."
> "**Breeding in every node adjacent to the Sanctum runs at the base rate now.** That's the whole of the difference, and it is a real one — four seasons to see it, eight to be sure of it."

> **Released — [WRITTEN]**
> "It went up the scarp and over the rim and it did not hurry."
> "**Breeding in every node adjacent to the Sanctum runs at one and a half while it is out there. That is not a story. It is a coefficient, and it will show.**"
> "**You don't own the thing you spent six years finding.** That is the other half of the entry and I am writing it down too."

**Both halves are true of the shipped data.** `balance.ecosim.keystoneBreedMult = 1.5` and `presenceRadiusNodes = 1`. The epilogue is not flavour text; it is the constant, read aloud. This is the single best piece of writing-to-mechanism in the project.

---

## 2. Act by act

Each act gives: where, the gym and its exact shipped roster, what the player learns mechanically, the story beats, the Cullbrand/regional event, the rival encounter, and the town ageing arc — with the actual copy that carries each.

**Note on the `year` field.** `data/gyms.json` still calls its index `year`. Q3 says rename it to an **act index**. The rosters below are the shipped ones (`data/gyms.json`, sizes 3/4/5/6/6/6 after the D-A5-G1 amendment).

---

### ACT 1 — Hearthollow · Meadow Reach (R1)

**Gym: Maribel — Beast — [WRITTEN]**
Bramblehog (A) L8 · Skir (A) L8 · **signature "Old Nib" — Nibbin (E) L8, Thick Pelt**.
*Three slots, not four: the duplicate Nibbin (A) was cut by measurement (DEVIATIONS D-A5-G1) and the signature dropped its +2 level premium (D-A5-G2).*

> "Maribel. I keep beasts — not the clever lines, the ones that were here first and will be here after."
> "**And Old Nib, who is twelve. Elders don't get quick. They get certain.**"
> On a win: "You waited out the Thick Pelt instead of hammering it. Most people hammer it."

**Learns mechanically — [WRITTEN]:** starter choice and its three-year clock; snares and bait-crafted-from-the-web; the survey as a before/after reading; sign cards and Instinct; migrant legibility.

> "Three young ones on the bench there. Cindril, Puddlisk, Thornlet. All hatched this spring, all juveniles, all with three years in them."
> "**Three years is what a juvenile has. Pick the one you'd rather walk beside for all three.**"
> "Bait improves the odds. You craft bait from what the target eats, and what the target eats is in the web, **so learn the web**."
> "Cards flag migrants too. Pollywisp is a spring animal — out of spring the card will read **dormant** rather than **absent**. Those are different words for a reason."

Each starter branch is written and each names its three forms:

> Cindril — "It becomes Vulkindle at two and Pyrevane at three. **You'll meet all three; they are the same animal wearing its age.**"
> Puddlisk — "It becomes Rillisk at two and Maelstrisk at three. **Same animal, three names, one life.**"
> Thornlet — "Bramblore at two, Thornwald at three. **The last name is the one the meadow remembers.**"

**Story beats — [WRITTEN]:** the opening cutscene chain (`maren.opening` → starter → snare tutorial → survey tutorial), *First Signs*, Vellsire chain step 1 (Maren on what a keystone *is*) and step 2 (the north antler stone).

**Cullbrand act event — [MISSING].** No raid is authored for act 1. `balance.yearEvents.raids` contains exactly one raid (act 4). `game/year-events.ts` `raidCoverage()` was deliberately built to *report* this gap rather than let an agent invent one (G2).

**Rival — [WRITTEN].** Wick on Meadow Reach. His introduction is the game's cleanest statement of the Company's position:

> "The Company pays by the head and doesn't ask whose head. **That's not sentiment. That's a price list.**"
> "Carricrow's mine. **Everyone laughs at that until the year a web goes over and the crows are the only thing still worth catching.**"

**Town ageing (bible: *"fields flourish or wither with Route 1 health"*) — [WRITTEN].** Two entries on `r1.floraStock`, and they are honest ecology rather than mood:

> Bloom (`floraStock ≥ 80`): "Reach came in green right down to the fence line. I've not seen it come that far since I was droving."
> Thin (`floraStock ≤ 45`): "Reach is short this year. Grass came up but it's thin and the ground shows through on the rise. **The fields follow the Reach. Always have. Tolm's west side shows it first.**"

*Caveat: both gate on `yearMin: 2`, so neither can fire during act 1 itself.*

**Shipped populations:** Hearthollow — Loamunder 24, Nibbin 8, Bramblehog 6, Pollywisp 4, Skir 6, Carricrow 2 · R1 — Loamunder 32, Nibbin 11, Bramblehog 7, Pollywisp 6, Skir 8, Carricrow 3, flora 78.

**Act 1 tally:** 4 WRITTEN · 0 OUTLINED · 1 MISSING.

---

### ACT 2 — Brackwater · Brackmarsh (R2)

**Gym: Odo — Water — [WRITTEN]**
Bogling = `mirefin-line` (J) L14 · Reedrick (A) L14 · Mirefin (A) L14 · **signature Fenmaw (E) L16**.

> "Odo. I fish this marsh and I fight out of it, and **the two are the same skill at different speeds**."
> "Bogling first, because everyone underestimates a tadpole. Then Reedrick. Then the Mirefin it grew into."
> "Last is a Fenmaw Elder. **She has taken the bottom out of two survey boats and neither of them was mine.**"
> On a win: "You read the metamorphosis. Bogling grazes, Mirefin hunts, and **the marsh still counts them as one line either way**."

**Learns mechanically — [WRITTEN]:** the **release verb** (catching's inverse); the metamorphic line as one count; the population-indexed economy.

> Maren, release tutorial: "One more thing the snare does, backwards. You can open it."
> "Release puts an individual back into whatever node you're standing in. **The count goes up by one, same arithmetic, opposite sign.**"
> "**The ledger records it identically. It does not care which direction the number moved.**"

**Story beats — [WRITTEN]:** *Restock the Shallows*, *Ferryman's Wager*, the full 7-step Undermere chain (§4), Vellsire chain steps 3–4.

**Cullbrand act event — [MISSING].** Wick delivers the act's economic argument instead, which partly covers for it:

> "Brackwater's fishery has been indexed to the Fenmaw count for sixty years. Sixty. Written into the buyer's contracts."
> "**Nobody on those stilts calls that harvesting. They call it the season, and they eat off it.**"

**Rival — [WRITTEN].** Wick on the marsh road, as above.

**Town ageing (bible: *"docks rot or get rebuilt"*) — [WRITTEN], and it is the best-realised ageing arc in the game.** Four entries, all reading the live `r2.mirefin-line` count, all routing through the town's actual finances:

> Sel, rotting (`mirefin ≤ 4`): "Third and fourth pilings are soft. Nobody's paying to drive new ones — town replaces pilings out of the fishery levy and the levy is off the Mirefin count."
> "**So the dock rots at the speed of the channel. That's not a saying. That's the accounting.**"
> Sel, rebuilt (`mirefin ≥ 9`): "New pilings on three and four. Levy came in over estimate and the town spent it on the thing that holds the town up, for once."
> "**Deck's level enough to roll a barrel down now. It has not been level since I was thirty.**"
> Dockhand, rebuilt: "Deck's level. **I keep noticing it, and then noticing that I noticed.**"

There is also an apex-collapse read on the same node — `amb.r2-ferryhand.apex` (`fenmaw ≤ 1`): *"Mirefin are everywhere in the shallows now, right up under the boards. Nessa says that follows."* That line is the cascade beat described by a townsperson who does not know he is describing it.

**Shipped populations:** Brackwater — Sporantle 24, Reedrick 18, Mirefin 6, Fenmaw 2, Carricrow 2 · R2 — Sporantle 32, Reedrick 24, Mirefin 8, Fenmaw 3, Carricrow 3, **Undermere 1**, flora 72.

**Act 2 tally:** 4 WRITTEN · 0 OUTLINED · 1 MISSING.

---

### ACT 3 — Bowerdeep · Bowerdeep Wilds (R3)

**Gym: Vesper — Poison — [WRITTEN]**
Gloomgrub = `gloomoth-line` (J) L20 · Sporantle (A) L20 · Mirefin (A) L20 · Webvern (A) L20 · **signature Webvern (E) L22, Silk-Spun (rare)**.

> "Vesper. Poison, which in Bowerdeep means rot, and **rot is the half of the canopy nobody wants on a banner**."
> "**Halder has an order out for three Webvern. I have told the council what three does to the canopy count. The council has minutes and Halder has buyers.**"
> Greeting: "Halder and I have had this argument for nine years. **He is not a villain and I am not a warden. We just price the same tree differently.**"

**Learns mechanically — [WRITTEN]:** an over-catch dilemma where both sides are true and both are paid; seasonal event mechanics via the autumn Gloomoth window; the understory/browsing edge (Barkhide hold the canopy open).

**Story beats — [WRITTEN]:** Greaves' introduction; *Silk Shortage*; *Lanternless Night*; Vellsire chain step 5 (the tree rings, the strongest single lore beat in the game) and the un-numbered trail stone at R3.

> Maren, step 5: "**A cut stump is a ledger with the pages stacked instead of bound.** Wide ring, good year. Thin ring, poor one."
> "Every stump the loggers have opened for me in Bowerdeep runs wide, wide, wide — then **three decades of thin, and the thin starts within a season of the last Vellsire count**."
> "**One stump is an anecdote. Forty is a record.**"

**Cullbrand act event — [OUTLINED].** Bible §6 names a *"Cullbrand logging subplot"* for Bowerdeep. There is no subplot: no raid, no scene, no quest. What exists is Greaves' arrival cutscene plus two ambient lines that gesture at the same legal fiction from opposite ends —

> Greaves: "Cullbrand does not log Bowerdeep. Cullbrand buys timber and silk from people who log Bowerdeep. **My lawyers consider the distinction load-bearing.**"
> Bowerdeep logger: "Cullbrand buys what I cut. Cullbrand doesn't cut it. **That distinction is in my contract and it is not in my back.**"

That pairing is good, and it is not a subplot. Decision D15.

**Rival — [WRITTEN].** Wick's best act (quoted in §1).

**Town ageing (bible: *"canopy thins if Barkhide over-caught"*) — [WRITTEN], one entry only.**

> Logger (`r3.barkhide ≤ 4`, `yearMin: 4`): "Canopy's thinning at the east stair. Not from cutting — nobody's cut there in four years."
> "**No Barkhide on that slope. The understory closed, the young trees went up together, and now the whole stand is the same age and the same height.**"

*Single-sided: there is no thriving-canopy counterpart, unlike Brackwater's rot/rebuilt pair.*

**Shipped populations:** Bowerdeep — Sporantle 24, Mosslet 7, Gloomoth 5, Barkhide 6, Webvern 6, Duskstalk 2, Carricrow 2 · R3 — Sporantle 32, Mosslet 8, Gloomoth 6, Barkhide 10, Webvern 8, Duskstalk 3, Carricrow 3, flora 84.

**Act 3 tally:** 4 WRITTEN · 1 OUTLINED · 0 MISSING.

---

### ACT 4 — Cindershelf · Cinder Steppe (R4)

**Gym: Sable — Fire — [WRITTEN]**
Ashvole (A) L26 · Cragmar (A) L26 · Ashvole (E) L26 · Stonewing (A) L26 · Pyrelisk (A) L26 · **signature Pyrelisk (E) L28**.

> "Sable. Fire type, steppe born, and everything on my bench was caught inside a day's walk of this forge."
> "Ashvole, Cragmar, an Ashvole Elder, Stonewing, Pyrelisk. Six, because **year four is where the region stops being polite**."
> "My signature is a Pyrelisk Elder off the west vents. There are not many left to catch out there, **which I mention as a fact about my bench, not about you**." ← *flagged for your ruling, §6 D3.3*

**Learns mechanically — [WRITTEN]:** reading a crashed web top-to-bottom in five numbers; scavenger weight as a death count; the relic/retirement forge.

> Gerta, on turn-in: "**Carricrow. Always Carricrow. Scavenger weight rises with recent deaths, so a crow count is a death count wearing feathers.**"
> "Flora stock went first. Ashvole and Cragmar graze it, so they followed. Pyrelisk followed the Ashvole. Stonewing had nothing left to hunt and the scarp went quiet."
> "**That's a crashed web, top to bottom, in five numbers. Now you can read one anywhere.**"

**Story beats — [WRITTEN]:** Greaves at the steppe; *After the Crash*; *Forge a Legacy*; the whole 6-step Kilnback chain (§4); Vellsire chain step 6; Maren's crash survey; the salvage-crew ambient set.

> Greaves: "**Cinder Steppe was a six-year contract. We closed it in four.**"
> "That sentence is the entire account of what happened out there. **Everything else people add to it is weather.**"
> "**Cindershelf ate for four years on that contract and is hungry in the fifth. Both halves are true and only one gets said in the tavern.**"

> Maren (`r4.stonewing ≤ 1`): "**The condors did not leave first.** The Cragmar went, then the Pyrelisk that ate the Ashvole, and the scarp emptied from the bottom up."

> Cullbrand worker, ambient: "**I was on the crew. I'm not going to tell you I wasn't.**"

**Cullbrand act event — [WRITTEN], and the only one that exists.**
`balance.yearEvents.raids` → `cullbrand-strip-harvest-r4`, year 4, node `r4`: **Ashvole −11, Cragmar −8.** The data comment is explicit that the raid touches *only the two Grazer lines* — the predator collapse above them must emerge from the §7.3 rules (G6), which is the correct construction.

**Two open problems on this raid, both already logged:**
1. **Q6** — `data/nodes/r4.json` ships *healthy* (Cragmar 10, Pyrelisk 14, Stonewing 3). Only `floraStock: 42` expresses the crash the bible promises. The dialogue was rewritten so it never asserts a collapse the survey contradicts, which is the right short-term call and not the fix.
2. **Q2** — the raid fires as an instantaneous decrement at the year turn. Your constraint is that such events last a whole season (4 ticks).

**Rival — [WRITTEN].** Wick's act 4 is the pivot of his whole arc and should be read next to his act 6:

> "You've walked it, then. I worked this steppe. Two seasons on the west scarp with a company crew."
> "And I'd work it again. **Cullbrand paid out on Cinder Steppe for four years and four towns ate off that payout, including yours.**"
> "After that the count went sideways on us and never came back. **The steppe isn't a mystery. It's a scheduling error with a number attached.**"

**Town ageing (bible: *"vents flare, mine expands or closes"*) — [WRITTEN].** A real two-sided pair on `r4.cragmar-line`:

> Expanding (`cragmar ≥ 12`): "Fifth shaft opened this spring. Town only cuts a new shaft when the steppe can feed the crews that dig it."
> "**Cragmar on the scarp again, which means grazing, which means the flora came back. The mine follows the ram, always has.**"
> Closing (`cragmar ≤ 3`): "Fourth shaft's boarded. Not collapsed — boarded. **Somebody signed that.**"

*(That last line was rewritten after the G7 audit; it previously carried a verdict. See DIALOGUE-NOTES §4.)*

**Shipped populations:** Cindershelf — Ashvole 11, Cragmar 7, Pyrelisk 8, Stonewing 2, Carricrow 2, **Kilnback 1**, flora 36 · R4 — Ashvole 14, Cragmar 10, Pyrelisk 14, Stonewing 3, Carricrow 3, flora 42.

**Act 4 tally:** 5 WRITTEN · 0 OUTLINED · 0 MISSING.

---

### ACT 5 — Duskhollow · Duskhollow Vale (R5)

**Gym: Noct — Dark — [WRITTEN]**
Gloomoth (A) L32 · Umbrat (A) L32 · Carricrow (A) L32 · Wispurr (A) L32 · Umbrat (E) L32 · **signature Duskstalk (E) L34**.

> "Noct. Dark lines. In the vale that isn't a theme, **it's just what is awake when you aren't**."
> "Daze skips turns. Bring something with Instinct or bring patience. Either works. Nothing else does."
> On a win: "Through a Duskstalk Elder. **There are four people alive who have done that and two of them are me on a good night.**"
> Greeting: "**Carricrow came into the vale eleven seasons ago and stayed. They follow deaths, so their count is a reading of somewhere else.**"

**Learns mechanically — [WRITTEN]:** dex milestones as a diegetic census; Instinct-gated sign reading at scale (six stones, escalating difficulty); winter migrant legibility.

**Story beats — [WRITTEN]:** *The Star Census*; *Vellsire's Trail*; Orrin's vanishing (Vellsire chain step 7 — the deepest lore beat in the file); Maren's step 8; the vale trail stone.

> Orrin: "**There are two hundred and six margin entries for Vellsire across ninety years.** Herds of nine, of twelve, of four. Then one entry with three separate observers on the same night: a herd of six crossing the vale toward the caldera."
> "And then the margin is empty. **Not thinning — empty, from that night, for thirty years, in a book that never misses a night.**"
> "**Animals do not stop existing on a date. They stop being where the instrument points.** Whatever went through that gate went through it all at once."

> Maren, step 8: "Three separate observers, one night, the same herd crossing the vale toward the caldera. And then nothing, for thirty years, from anyone."
> "**Animals do not stop being seen. They stop being where they were seen.**"

**Cullbrand act event — [MISSING].** No raid, no scene. Act 5's only Company presence is Wick, who is by this point arguing with himself.

**Rival — [WRITTEN], and the shortest of the six:**

> "**Greaves says a region is a stock, and a stock exists to be drawn on. It is a clean argument and I have never found the one that beats it.**"
> "Bring me the argument when you have it. Until then — Duskhollow Vale, and my Carricrow is an Elder now."
> On a loss: "Five for five. **There's a version of this where I stop showing up. Not this year.**"

**Town ageing (bible: *"dark encroaches as the Sanctum destabilizes"*) — [OUTLINED].** This is the one town ageing arc with **no state gate anywhere**. Four speakers assert the deepening dark as flat fact, in every year, regardless of anything the player does or the sim computes:

> Vale Elder: "The vale was never bright. It is darker than it was, though, and I have the lamp bills to prove it."
> Orrin: "The vale runs darker every year. Ives says my lamp is failing. **My lamp is four years old.**"
> Innkeeper: "The vale's darker than it was when I took this place on. **That's not a mood, it's on Orrin's chart.**"
> Field astronomer: "The dark has been deepening about a degree a decade. Orrin has the chart. **Nobody has an explanation on the chart.**"

The writing is good and the mechanism does not exist. Nothing in `core/` or `data/` models Sanctum destabilisation, and the lines are the only place the idea lives. Decision D8.

**Shipped populations:** Duskhollow — Umbrat 18, Wispurr 6, Carricrow 2, flora 44 · R5 — Umbrat 24, Wispurr 8, Carricrow 3, flora 58. *(Both are the thinnest nodes in the game — three lines each.)*

**Act 5 tally:** 3 WRITTEN · 1 OUTLINED · 1 MISSING.

---

### ACT 6 — Sanctum Approach · The Sanctum Fallow

**Boss: Magnate Greaves — mixed/industrial — [WRITTEN]**
Carricrow (A) L38 · Pyrelisk (A) L38 · Mirefin (A) L38 · Duskstalk (E) L38 · Fenmaw (E) L38 · **signature Stonewing (E) L40** *(exactly on the level cap)*.
Three Elders — "harvested prime specimens, which is the point of him" (bible §7).

> "**You've been counting for six years. I've been buying for forty. Only one of those moves a number on the ground.**"
> "Stand aside or don't. **The cradle is already assembled.**"
> Post: "Six teams. Forty years of records. Beaten by a child with a warden's book."
> "It's behind you, in the ring. Take it or leave it standing; **the Company is diversified either way**."

**Learns mechanically — [WRITTEN]:** the choice; the epilogue survey; the keystone coefficient made legible.

**Story beats — [WRITTEN]:** Maren at the rim; Wick's refusal; the gate stone (chain step 9); Maren's step 10 (chain complete); the antler ring (step 11); Greaves; the Vellsire; both epilogues.

> Maren, the finale: "**Greaves went through an hour ago with six teams and a transport cradle. He didn't hurry.**"
> "Go on. **I'll hold the page.**"

> The gate stone (step 9): "The gate stone. The largest of them, and the only one with the herd cut on both faces."
> "**On the outward face: six figures walking in. On the inward face: six figures standing still.**"

> The antler ring (step 11): "The ring at the caldera heart: nine stones, every one carved, every one facing inward."
> "**The herd on these is not six. On these it is one.**"
> "**The grass inside the ring is the only green thing in the Sanctum Fallow, and it is grazed short.**"

That last image is the payoff of an eleven-step chain and it lands.

**Cullbrand act event — [WRITTEN].** Greaves breaching the Sanctum *is* act 6's Cullbrand event, and unlike the other acts it is fully written on both ends: the Company scout at the approach —

> "Company scout. Six teams went up the approach this morning with a cradle on rollers."
> "I'm posted here to count what comes back down. **So far that's nothing.**"
> "**The gate was already open when we got here. Nobody wants to say that out loud, so I'm saying it to you.**"

**Rival — [WRITTEN].** Wick's act 6, quoted in §1. Note that his win-line hands the player the gate:

> "Six years. Every one of them the same result and I kept the column anyway."
> "**Gate's through the antler ring. He'll have left it open; he never expects to be followed.**"

**Site state (bible: *"revealed in the state your ecology earned"*) — [OUTLINED].** The Sanctum has six entries and **not one of them reads a population or flora figure.** The only place the player's ecology surfaces at the finale is Maren's epilogue, and even that names the six nodes without printing their numbers — the numbers are the survey UI's job, and the survey UI is not wired to this scene. The bible's promise that the Sanctum is *revealed in the state your ecology earned* is currently unfulfilled: the caldera looks the same whether you emptied Fallowmere or restored it.

**Shipped populations:** Sanctum Approach — Carricrow 3, flora 35 · The Sanctum Fallow — Carricrow 2, **Vellsire 1**, flora 50.

**Act 6 tally:** 4 WRITTEN · 1 OUTLINED · 0 MISSING.

---

### The act/calendar split you need to rule on

Bible §6 ties each of these to a *year*. Q3 says story runs on acts and the world runs on the calendar. Here is where each beat should land, with a recommendation — **surface it, do not assume it**:

| Beat | Bible ties it to | Should be | Why |
|---|---|---|---|
| Gym leaders 1–6 | year 1–6 | **ACT** | already act-safe: every `battle-pre` gates on `gym.<id>.beaten`, no year clause |
| Wick's six encounters | year 1–6 | **ACT** | currently `years:[N]` exact — unreachable off-pace (D1) |
| Greaves act 3 / act 4 / finale | year 3 / 4 / 6 | **ACT** | same defect |
| Vellsire choice + both epilogues | year 6 | **ACT** | same defect, and this is the never-cut beat |
| Cullbrand raid on R4 | year 4 | **ACT** | Q3 says so explicitly: Cindershelf must be entered mid-collapse whether that is year 2 or year 11 |
| Town ageing (docks, canopy, mine, fields) | year 2–6 | **CALENDAR** | Q3 says so explicitly; already correct — all use `yearMin` + a live population/flora clause |
| Annual Festival | closes the year | **CALENDAR** | Q2: it no longer closes the year; it spans the year's final season when the meter fills |
| Great Migration | spring/autumn | **CALENDAR** | it is a season, by definition |
| Retirement / heirs / boxed ageing | year turn | **CALENDAR** | untouched by Q3 |
| The three Ancient chains | years 1–6 via `yearMin` | **ACT** (mostly) | `yearMin` is forward-open so nothing breaks, but the gates are standing in for act prerequisites and should say so |
| Maren's keystone lectures 1–6 | years 1–6 | **ACT** | step 1 is `years:[1]` and is a hard dead-end (D2) |

---

## 3. The ten side quests

All ten have authored dialogue. **None has any implementation.** Each quest's completion condition below is written as it exists *in the shipped data* — which in every case means "a flag some system is expected to set, and no system sets it."

The twelve externally-granted flags every quest depends on, per `tests/unit/dialogue.test.ts`:
`quest.first-signs.turnin` · `quest.fallow-field.turnin` · `quest.restock-the-shallows.turnin` · `quest.ferrymans-wager.turnin` · `quest.silk-shortage.turnin` · `quest.lanternless-night.turnin` · `quest.after-the-crash.turnin` · `quest.forge-a-legacy.turnin` · `quest.star-census.milestone` · `quest.vellsires-trail.turnin` · plus `lifecycle.first-retirement` and `event.festival.open`.

---

### 1. *First Signs* — Hearthollow, Maren — **[WRITTEN]** (2 entries, 5 lines)

**Bible §9:** guided forage on R1; teaches the sign-card system.
**Trigger:** `years:[1]` + `quest.first-signs.offered` (set by the survey tutorial) + `NOT quest.first-signs.done`.
**Completion:** `quest.first-signs.turnin` — **[MISSING]**, external.
**Reward:** sets `chain.vellsire.unlocked` — i.e. **this quest is the trailhead of the entire 11-step Vellsire chain**.
**Teaches:** sign cards, Instinct as read quality, migrant legibility.

> "Walk Meadow Reach and bring me three. Any three. **Instinct decides how much a card tells you, so a sharp creature reads a poor sign better than a dull one reads a good one.**"
> Done: "Three cards. Loamunder, Nibbin, and something that scraped bark at chest height — that's Bramblehog."
> "You now know more about Meadow Reach than most of Hearthollow does. **Keep the cards; they stack up into something.**"

**Defect — see D2.** Both entries are `years:[1]`, and so is `maren.keystone.1` which consumes the reward flag. Miss this in year 1 and the Vellsire chain, *Vellsire's Trail*, and `chain.vellsire.complete` are permanently unreachable. The reachability test cannot catch this: its flag fixpoint ignores `years` entirely.

---

### 2. *The Fallow Field* — Hearthollow, Tolm — **[WRITTEN]** (5 entries, 13 lines)

**Bible §9:** a farmer begs you not to catch Loamunder; producers matter; refusing pays better long-term (R1 bloom).
**Trigger:** `years:[1]` + `NOT done` + `NOT taken`.
**Completion:** two branches on the *live count*, which is the good part —
· **kept:** `quest.fallow-field.turnin` **AND** `hearthollow.loamunder-line ≥ 24`
· **short:** `quest.fallow-field.turnin` alone (lower priority, so it is the fallback)
**Reward:** a crop share, explicitly stated as larger and recurring; sets `quest.fallow-field.result` = `kept` | `short`.
**Teaches:** Producers are the base of the web; the long game pays more than the snare.

The bible says "begs". The authored version deliberately is **not** a plea — it is a paid arrangement with the alternative stated out loud, because a plea is a moral lever and G7 forbids one:

> "There are twenty-four of them my side of the fence. **What I want is twenty-four of them there at harvest.**"
> "So: leave the Loamunder standing through the year and I'll pay you out of the crop. It's a bigger purse than the snare would fetch, and **it's a purse that comes back every year I'm farming**."
> "**You can take them instead. Buyers in Hearthollow will give you coin today for a Loamunder. I'd just rather you took my offer, and I'd rather say so plainly than have you guess.**" ← *flagged for your ruling, §6 D3.5*
> Accepted: "Count's twenty-four; I'll walk it myself at the turn of the year and **we'll compare books**."
> "**Meadow Reach has its own Loamunder and they are not mine. Nothing in this arrangement covers the Reach.**"
> Kept: "Twenty-four, and two of them juveniles I didn't have in spring. Here's your share, and it's heavier than I quoted."
> "West field came in at full weight. **Meadow Reach came in over — the bloom carried right across the fence line.**"
> Short: "Count's short of twenty-four, so the crop share doesn't trigger. **That's the arrangement working as written.**"
> "Offer's the same next spring. **Numbers are the numbers.**"

*(That last line originally continued "…and I don't hold books against people." It was cut on the G7 audit as the only line in 499 that raised blame as a concept.)*

---

### 3. *Restock the Shallows* — Brackwater, Nessa — **[WRITTEN]** (4 entries, 10 lines)

**Bible §9:** release captured Boglings; **release verb intro**; restoration raises fishery payouts.
**Trigger:** `yearMin: 2` + `NOT done` + `NOT taken`.
**Completion:** `quest.restock-the-shallows.turnin` — **[MISSING]**, external. The quest asks for **four Boglings released into R2**.
**Reward:** stated as a levy/price movement, not a purse.
**Teaches:** release is catch with the sign flipped; the metamorphic line is one count; population *is* the wage.

> "You know the line runs Bogling to Mirefin? Same animal. Tadpole in the shallows, lungfish in the channel."
> "**The Brackmarsh count is low. I want four Boglings put back into that water, and I don't mind where you get them.**"
> "Your snare opens. Stand in the shallows and open it — that's release, and **the ledger counts it the same way it counts a catch, sign reversed**."
> The optional economics branch is the best short explanation of the game's thesis anywhere in the file:
> "The buyer prices the season off that count and the levy comes off the price. **So the count is the wage, and everybody here talks about the wage and nobody talks about the count.**"
> "**It isn't fast money. It is the only money anybody here can actually move.**"
> Accepted: "Put them in on the Brackmarsh side. **There is a Fenmaw working the channel mouth and it will take a small one straight back off the count.**"
> Done: "Four in, and the Brackmarsh count on my board goes up by four. **First time it's moved up since I started the board.**"

*This quest was rebuilt after an audit: it was originally written around a four-year Bogling→Mirefin maturation lag that the sim does not model (wild populations carry one count per line, no age structure). The shipped version is priced on the single count that actually exists.*

---

### 4. *Ferryman's Wager* — Brackwater, Sel — **[WRITTEN]** (4 entries, 8 lines)

**Bible §9:** catch an Elder Mirefin before year's end; push-your-luck showcase; ferry discount.
**Trigger:** `yearMin: 2` + `NOT done` + `NOT taken`.
**Completion:** `quest.ferrymans-wager.turnin` — **[MISSING]**, external.
**Reward:** free crossings for life; **and it is step 4's gate on the Undermere chain** — the bible's "unlocked by side content" made literal.
**Teaches:** an Elder is one year from retiring, so catching one is spending a year of something.

> "A wager, then, since you're going out anyway. An Elder Mirefin, caught and brought back before the year turns."
> "**Elders are one year from retiring, so you're spending a year of something to prove a point. That's what makes it a wager and not an errand.**"
> "Win and you ride free as long as I'm poling. **Lose and you've still got a Mirefin, which is not nothing.**"
> Accepted: "Channel's the place, not the shallows — **Elders hold the deep edge where the current does the work for them**."
> Done: "Elder, and a big one. Look at the jaw on it — **that's three years of channel current**."

*"Three years", not four: the age model is derived from `balance.age.yearsInClass` by a test, so a retune cannot silently make this line false.*

**Note — Q2/Q3 interaction.** "Before the year turns" was written when a gym win could end the year early. Under Q2 the year only ends on a full meter, which makes the wager *easier and less interesting*: the deadline no longer moves. Worth a sentence from you (D20, second bullet).

---

### 5. *Silk Shortage* — Bowerdeep, Halder — **[WRITTEN]** (4 entries, 9 lines)

**Bible §9:** merchant wants 3 Webvern; gym leader objects; over-catch dilemma with visible consequence either way.
**Trigger:** `yearMin: 3` + `NOT done` + `NOT taken`.
**Completion:** `quest.silk-shortage.turnin` — **[MISSING]**, external. Three **adult** Webvern.
**Reward:** Halder's price; sets `quest.silk-shortage.result: "delivered"`.
**Teaches:** two true positions, one count, and the count moves either way.

> "Vesper has been at the council about it. Her position is that three adults out of the canopy is more than the canopy replaces in a year, **and she has the count to show it**."
> "**Both of those are true at once. That's the shape of it. I'm not going to pretend she's wrong to get you to say yes.**"
> "Three Webvern, my price, **or walk away and tell her I asked**."
> Deferred branch: "Go on then. She's more interesting than I am on this and **she'll tell you the count without rounding it**."
> Done: "Vesper will have the new canopy count by the festival. **She always does, and she always reads it out.**"

**Gap — the "either way" is one-sided.** The bible promises *visible consequence either way*. There is a `delivered` result and a `heard-vesper` deferral flag, but **no refusal outcome is authored**: no Vesper line acknowledging you declined, no canopy-count consequence entry, no `result: "refused"`. Half the dilemma is written. Decision D14.

---

### 6. *Lanternless Night* — Bowerdeep, Pell — **[WRITTEN]** (4 entries, 8 lines)

**Bible §9:** escort through the Gloomoth migration; teaches seasonal event mechanics.
**Trigger:** `yearMin: 3` **+ `seasons: ["autumn"]`** + `NOT done` + `NOT taken`. *The only quest in the game with a season gate, and it is the right one.*
**Completion:** `quest.lanternless-night.turnin` — **[MISSING]**, external.
**Reward:** unstated in copy.
**Teaches:** migrant windows; "gone" vs "migrating"; apex behaviour in the dark.

> "Gloomoth migration starts tonight. **Region-wide** — they come up out of the Wilds and go through Bowerdeep on their way to wherever they go."
> "They are Dark and Wind and **they take the lamps out as they pass. Not on purpose. They just fill the air.**"
> "I need a walk to the eastern stair and back with the relight kit. **Duskstalk work the dark stretches, and a road with its lamps out is one long dark stretch.**"
> "One night. **Autumn only — out of autumn they're not here at all, and the sign cards will read migrating rather than gone.**"
> Done: "They'll be gone by winter and the road will be quiet and **I will miss them, which I do not explain to people**."

*Content-truth note: an earlier draft said "Duskstalk hunt the migration". That edge does not exist — Apex takes Mesopredators and **large** Grazers, and Gloomoth is a non-large Grazer. The shipped line puts the Duskstalk on the dark road instead of on the moths, and `FORBIDDEN_EDGES` in the test now pins it.*

---

### 7. *After the Crash* — Cindershelf, Gerta — **[WRITTEN]** (4 entries, 8 lines)

**Bible §9:** survey of wrecked R4; reading a collapsed web; unlocks scavenger lore.
**Trigger:** `yearMin: 4` + `NOT done` + `NOT taken`.
**Completion:** `quest.after-the-crash.turnin` — **[MISSING]**, external. Five counts **plus the flora reading**.
**Reward:** sets `lore.scavenger.unlocked`.
**Teaches:** the order a web empties in; Carricrow as a death-count proxy.

> "Five counts on Cinder Steppe. Ashvole, Cragmar, Pyrelisk, Stonewing, Carricrow. **Just the numbers; I'll do the reading.**"
> "**Bring me all five and the flora reading with them. The flora reading is the one that tells you what happened; the counts tell you how far it has got.**"
> Accepted: "West scarp first, then the vent line, then the low ground. **That's the order the crews worked it in and it's the order it emptied in.**"
> Done: quoted in §2, Act 4.

*This quest originally asked for "four of them low and one of them high", which the shipped healthy r4 node contradicts. It now asks for the flora reading, because `floraStock: 42` is the only thing in that node that actually expresses a crash. If Q6 lands and r4 ships pre-crashed (or is crashed by the raid on arrival), this copy should be revisited — it is currently written to be true of a node the bible says should be wrecked and the data says is fine.*

---

### 8. *Forge a Legacy* — Cindershelf, Bram — **[WRITTEN]** (2 entries, 5 lines)

**Bible §9:** craft your first retirement relic; relic system tutorial.
**Trigger:** `yearMin: 4` + **`lifecycle.first-retirement`** — i.e. it opens off the retirement flow, which is the correct hook.
**Completion:** `quest.forge-a-legacy.turnin` — **[MISSING]**, external. Cost: the relic + one ingot.
**Reward:** a set relic as a held item.
**Teaches:** the relic loop; that legacy is a mechanic and not a sentiment.

> "One of yours has run out of years, then. **You'll have kept the relic — everyone keeps the relic, they just don't know what it's for.**"
> "Bring it here and I'll set it. **A set relic is a held item; it carries a slice of what the animal was into whatever holds it next.**"
> Done: "There. Cooled, seated, and it will not come loose."
> "**Name's stamped underneath where nobody looks. That's the part I do for free.**"

**Thinnest of the ten** at 5 lines and no branch. Given that this quest sits directly on the **Legacy** demo beat — one of the two never-cut beats — it is under-written relative to its importance. Decision D16.

---

### 9. *The Star Census* — Duskhollow, Ives — **[WRITTEN]** (2 entries, 5 lines)

**Bible §9:** dex milestones; painted dex art as collectible reward.
**Trigger:** `yearMin: 5` + `NOT quest.star-census.offered`.
**Completion:** **there is none.** The second entry gates on `quest.star-census.milestone` and is *repeatable* — it sets no `done` flag. This is the only one of the ten with no terminal state.
**Reward:** a painted plate per milestone.
**Teaches:** age forms are separate dex identities; migrant flags on cards.

> "The star census is the dex, kept properly. Every identity you've entered, **with the age forms counted separately, because a Bogling and a Mirefin are not the same page**."
> "Migrants get a flag on the card — dormant or migrating. **An absent Wispurr in summer is not a missing Wispurr, and the card must never let you confuse the two.**"
> Milestone: "Another milestone. Here's the plate, still tacky — **hold it by the edge**."
> "**Thirty-five identities in the full census. Nobody in Fallowmere has all thirty-five, including the observatory.**"

*"Thirty-five" reconciles exactly with the roster arithmetic in DEVIATIONS D2 (3 starters ×3 + 2 wild metamorphic ×2 + 22 single-name lines = 35). The content is true; the completion beat is [MISSING].*

---

### 10. *Vellsire's Trail* — Duskhollow, Orrin — **[WRITTEN]** (4 entries, 9 lines)

**Bible §9:** follow ancient sign-cards; finale setup, Instinct checks.
**Trigger:** `yearMin: 5` + `chain.vellsire.step7` (Orrin's vanishing must be read first) + `NOT done` + `NOT taken`.
**Completion:** `quest.vellsires-trail.turnin` — **[MISSING]**, external. Six stones, in order: R1, R2, R3, R4, R5, Sanctum Approach.
**Reward:** points Maren at the Sanctum; narratively hands off to keystone step 10.
**Teaches:** Instinct as a gate on information quality, escalating across six reads.

> "The antler stones are a trail and the trail has a direction. Meadow Reach, Brackmarsh, the Wilds, the steppe, the vale, the Approach."
> "Each stone carries a sign older than any card in your pouch. **Reading one needs Instinct, and reading the last one needs more Instinct than reading the first.**"
> "**Walk the trail in order and bring me what the stones say. I have waited a long time for someone with the legs for it.**"
> Accepted: "In order. **The stones were cut in order and they do not read out of it.**"
> "Take the sharpest thing on your team. **Instinct decides how much of a sign you get, and a poor read on the last stone is the same as no read at all.**"
> Declined: "**Thirty years. I can manage another season.**"
> Done: "All six. **Laid end to end they are one sentence and the sentence is a direction.**"
> "It points at the Sanctum Fallow, which everybody guessed, and **it gives a season, which nobody did**."
> "Take this to Maren. **She has been the other half of this file for eleven years and does not know it.**"

**Loose thread:** *"it gives a season, which nobody did"* is a promise the rest of the game never pays off. No entry anywhere names that season, and the finale has no seasonal gate. Either it is a deliberate unanswered note or it is a dropped thread. Decision D20.

---

### Side-quest tally

| | Copy | Trigger authored | Completion condition authored | System exists |
|---|---|---|---|---|
| WRITTEN | 10 | 10 | 9 | **0** |
| MISSING | 0 | 0 | 1 (*Star Census*) | **10** |

Build-doc §15 marks four of these as vertical-slice priority (**First Signs, Fallow Field, Restock the Shallows, Ferryman's Wager**) and puts the other six above cut line **C-3**.

---

## 4. The three Ancient lore chains

These are the deepest authored content in the game — **24 numbered steps, 82 lines**, and you have never seen them. All three are progressions: a trailhead, then lines that only open once the previous step is earned. Every step below is **[WRITTEN]**.

The test proves: steps are contiguous from 1, no step is reachable before its predecessor's flag *or* its predecessor's year, no step re-fires, and all three terminal flags are reachable. **What the test does not prove: that anything ever reads `chain.<ancient>.complete` and offers the catch.** Nothing does — [MISSING], all three.

---

### 4.1 `vellsire-chain` — 11 steps · 14 entries · 40 lines

Maren's keystone lectures alternating with the antler standing-stones, across the whole map.

| # | Speaker / prop | Node | Gate |
|---|---|---|---|
| 1 | Maren | Hearthollow | `years:[1]` + `chain.vellsire.unlocked` (*First Signs* done) |
| 2 | antler stone (north) | Meadow Reach | `step1` |
| 3 | Maren | Brackwater | `yearMin 2` + `step2` |
| 4 | antler stone (causeway) | Brackmarsh | `yearMin 2` + `step3` |
| 5 | Maren | Bowerdeep | `yearMin 3` + `step4` |
| 6 | Maren | Cindershelf | `yearMin 4` + `step5` |
| 7 | **Orrin** | Duskhollow | `yearMin 5` + `step6` |
| 8 | Maren | Duskhollow | `yearMin 5` + `step7` |
| 9 | antler stone (gate) | Sanctum Approach | `yearMin 6` + `step8` |
| 10 | Maren | Sanctum Approach | `yearMin 6` + `step9` → **`chain.vellsire.complete`** |
| 11 | the antler ring | The Sanctum Fallow | `years:[6]` |

**Step 1 — Maren, Hearthollow.** *What a keystone is.*
> "You asked what a keystone is. **It isn't the biggest animal in a region, and it isn't the strongest.**"
> "**It's the one whose absence changes the shape of everything else.** Take it out and the rest of the web rearranges around the hole."
> "Vellsire was ours. Where it grazed, the ground came back richer than it left. **Nobody has put a number on why. I would like to.**"

**Step 2 — the north antler stone, Meadow Reach.**
> "A standing stone cut into branching antlers, worn round on the weather side. It is taller than you and set deep."
> "The carving on the sheltered face is a herd, **six figures**, and a line running north from them."
> "**The stone is warm where the meadow grass banks against it. Nothing else on Meadow Reach is.**"

**Step 3 — Maren, Brackwater.** *The stones predate the counting.*
> "You read one of the antler stones on Meadow Reach. There are more — Brackmarsh, the Wilds, the steppe, the vale, the Sanctum Approach."
> "Someone set them where the herd used to pass. **The herd has not passed in thirty years and the stones are much older than thirty years.**"
> "Whoever cut them was keeping a record too. **Mine is paper. Theirs is granite. Theirs will outlast mine.**"

**Step 4 — the causeway stone, Brackmarsh.**
> "The causeway stone leans, but it leans the way it was set — **the marsh has moved around it and it has not moved with the marsh**."
> "Six figures again, and the line out of them runs east. **Someone has re-cut the line at least once; the groove has two depths.**"
> "**Whoever kept these stones kept them for long enough to need to repair them.**"

**Step 5 — Maren, Bowerdeep.** *Three thin decades in the tree rings.* (quoted in §2, Act 3)

**Step 6 — Maren, Cindershelf.** *The order a web empties in.*
> "Cinder Steppe's flora stock is at a number **I have never had cause to write before**."
> "It runs downhill in order. **The flora first, then the grazers inside two seasons, then the mesopredators, then whatever apex was living off the mesopredators.**"

**Step 7 — Orrin, Duskhollow.** *The vanishing, from the observatory margin book.* (quoted in §2, Act 5 — the single best lore beat in the file)

**Step 8 — Maren, Duskhollow.** *The last confirmed sighting.*
> "Orrin's archive has the last confirmed sighting, with a date and a sky on it. **Astronomers log everything, including things that are not stars.**"
> "Three separate observers, one night, the same herd crossing the vale toward the caldera. **And then nothing, for thirty years, from anyone.**"
> "**Animals do not stop being seen. They stop being where they were seen.**"

**Step 9 — the gate stone, Sanctum Approach.** (quoted in §2, Act 6)

**Step 10 — Maren, Sanctum Approach.** *The choice, stated without a recommendation.* → sets `chain.vellsire.complete`.
> "The Sanctum Fallow has been sealed since before the stones were cut. **The word fallow means rested, not dead. Somebody chose it carefully.**"
> "If the herd went anywhere, it went in there, and **if anything of it is left, it is one animal and it is very old**."
> "**I can't tell you what to do when you're standing in front of it. I can tell you the ledger will read differently either way, and that I will be reading it.**" ← *the most borderline line in the corpus; §6 D3.1*

**Step 11 — the antler ring, The Sanctum Fallow.** (quoted in §2, Act 6)

**Plus three un-numbered trail stones** — R3 canopy, R4 vent, R5 vale. These are not chain steps; they are three of the six stones *Vellsire's Trail* asks you to walk. Each gates on `chain.vellsire.step4` and on its own `trail.stone.*` flag so it reads exactly once.

> R3: "The forest grew up around this one. **Two trunks have closed against its sides and stopped, as if they met something they would not pass.**"
> R4: "**Vent heat has glazed the windward face to glass.** The sheltered face is untouched and sharp."
> R5: "The vale stone stands in open ground with no cover for a quarter mile in any direction. **It was meant to be seen at night.**"
> R5: "Six figures, and **the line runs up — not along the ground. Up, toward the caldera rim.**"

**And two flavour stones with no chain role**, both quietly excellent:
> R1 south: "The southern stone, snapped off at half height. The break is old enough to have grown its own lichen." · "What is left of the carving shows hooves and the bottom of a line. **The line points at its northern twin.**"
> Sanctum Approach inner: "An inner stone, unfinished. The antlers are roughed out and the herd was never cut." · "**The tools are still at its foot under a century of ash. Whoever was working stopped and did not come back.**"

---

### 4.2 `undermere-chain` — 7 steps · 7 entries · 23 lines

Sel's serpent tales alternating with the two sunken idols. **Step 4 requires a finished side quest** (*Ferryman's Wager*) — this is bible §4's "unlocked by side content" in practice.

| # | Speaker / prop | Node | Gate |
|---|---|---|---|
| 1 | Sel | Brackwater | `yearMin 2` |
| 2 | dock idol | Brackwater | `yearMin 2` + `step1` |
| 3 | Sel | Brackwater | `yearMin 2` + `step2` |
| 4 | Sel | Brackwater | `yearMin 2` + `step3` + **`quest.ferrymans-wager.done`** |
| 5 | shallows idol | Brackmarsh | `yearMin 2` + `step4` |
| 6 | Sel | Brackwater | `yearMin 2` + `step5` |
| 7 | Sel | Brackwater | `yearMin 3` + `step6` → **`chain.undermere.complete`** |

**Step 1 — Sel's pole depths.**
> "You want the crossing or you want the stories? **Most people say crossing and then ask about the stories halfway over.**"
> "Here's the one that's just measurement. **My pole is eleven feet.** Everywhere in these shallows it finds bottom with a hand to spare."
> "**Everywhere but four spots. In those four the pole goes down eleven feet and keeps going, and I've never found what's under it.**"
> "**My grandfather marked all four. I mark them still. The idols sit on their rims.**"

**Step 2 — the dock idol.**
> "A stone figure stands half under the water off the dock rim, facing out. **The shallows around it are clear and the water directly beneath it is not.**"
> "**It has no eyes. Not weathered away — never cut. The face is finished everywhere else.**"
> "The stone is not marsh stone. There is nothing in Brackwater that would cut like this."

**Step 3 — the lake-beneath-the-lake.**
> "Grandfather's word for the four spots was **the lake-beneath-the-lake**. He didn't mean it poetically; **he meant there's another water down there and ours sits on top of it**."
> "Water table here hasn't moved in my lifetime. Drought years, flood years — same line on the stilt. **That is not normal and Maren agrees with me, which she hates.**"

**Step 4 — "eyeless" (gated on the Wager).**
> "You took an Elder Mirefin out of the channel before the year turned. That's the wager and you won it, and **you're owed the rest of the tale**."
> "**Eyeless. That's the part everyone leaves out when they repeat it back to me.**"
> "**Nothing down there needs eyes.** Grandfather said it came up once through the dock spot in a flood year and **the whole town heard the pilings sing**."

**Step 5 — the Brackmarsh idol.**
> "The second idol, out where the reeds thin. Same carving, same missing eyes, **facing back across the water toward the dock**."
> "**Between the two of them the reed stops growing in a band about a boat wide.**"
> "Your pole finds nothing under that band. **Sel said it wouldn't.**"

**Step 6 — the line between the two idols.**
> "Both idols, then. The dock rim and the shallows out on Brackmarsh. They face each other across two miles of reed and **they are exactly the same carving**."
> "Line between them runs through the third spot. **I have poled that line a thousand times and never once put a boat down it at slack water.**"
> "**Slack water is the hour to try. If you're going to try, take a master snare, and take something that can swim.**"

**Step 7 — the name.** → `chain.undermere.complete`
> "Here. **Grandfather's card, and mine under it, and yours will go on top when you've read the water yourself.**"
> "**Undermere.** That's the name on the older card, **in a hand neither of us can date**."
> "**It doesn't age.** That's what the card says and that's what the water table says, **and I have stopped arguing with either**."
> "Slack water, third spot, off the Brackmarsh idol. **Go on then.**"

**Where it points:** `data/nodes/r2.json` ships `undermere-line: 1`, tagged `Marsh (hidden)` so it is gated out of ordinary encounter rolls by `encounter.signChainGatedHabitatTag`. The target exists; the gate that opens it does not.

---

### 4.3 `kilnback-chain` — 6 steps · 6 entries · 19 lines

Bram and the miner Gerta on "the warm shell below", alternating with the shell-kiln shrines. All six gate on `yearMin: 4`.

| # | Speaker / prop | Node | Gate |
|---|---|---|---|
| 1 | Bram | Cindershelf | `yearMin 4` |
| 2 | shaft-head shrine | Cindershelf | `yearMin 4` + `step1` |
| 3 | Bram | Cindershelf | `yearMin 4` + `step2` |
| 4 | **Gerta** | Cindershelf | `yearMin 4` + `step3` |
| 5 | deep shrine | Cindershelf | `yearMin 4` + `step4` |
| 6 | Bram | Cindershelf | `yearMin 4` + `step5` → **`chain.kilnback.complete`** |

**Step 1 — the warm forge floor.**
> "**Put your hand flat on the floor. Go on. That's not the forge; the forge is cold since first light.**"
> "The vents run hot in bursts — up, over, gone in an hour. **This runs steady. Steady is the strange part.**"
> "Miners have a name for it. **The warm shell below.** Third shaft has been eight degrees over every other shaft since the day it was cut, **and the difference has never once moved**."

**Step 2 — the shrine at the shaft head.**
> "A shrine at the shaft head, built from curved plates the colour of fired clay, **fitted without mortar**."
> "**The plates are not clay. Up close the grain is bone, kiln-hardened, and each plate is thicker than a door.**"
> "Miners have set candles in the joins for long enough to have worn hollows for them."

**Step 3 — what the shrines are made of.**
> "You found the shrine at the shaft head. Now look at what it's built out of, **because it isn't stone**."
> "That's shell. Kiln-fired, and thick as a door. **Every shrine in this mine is a piece of the same shell and the pieces don't match any tortoise anyone can name.**"

**Step 4 — Gerta's thirty-one-year log.** The best use of a minor NPC in the game.
> "Bram sent you for the log. Here — **thirty-one years of the third shaft, one reading a shift**."
> "Eight degrees over, flat, for three decades. **Except twice. Twice it went to fourteen for about four days and then back down.**"
> "**Both times were the winter after a vent season that never came. Whatever's down there was cold and did something about it.**"
> "Deep shrine sits at the bottom of the warm reach. Take the log to Bram and then take yourself down there."

*(Her greeting sets her up perfectly: "Nobody paid me to. **It's just that once you notice a number moving you can't stop reading it.**" — which is also a description of the player.)*

**Step 5 — the deep shrine.**
> "The deep shrine, at the bottom of the warm reach. **The air here is still and eight degrees over and it has been for thirty-one years.**"
> "**This shrine is one plate, not many. It is the size of a cart and it is curved, and it was never quarried — it was shed.**"
> "**A word is cut across the join in letters the mine stopped using: KILNBACK.**"

**Step 6 — the card.** → `chain.kilnback.complete`
> "Gerta's readings, the deep shrine, and my floor. **Three measurements, one answer.**"
> "**Kilnback.** It's on the older shrine in letters we stopped cutting before the mine existed."
> "**It doesn't age. Sable's grandmother wrote that down as a joke and the temperature log has been proving it ever since.**"
> "Take the card. Deep shrine, third shaft, when the vents are quiet. **And take something that resists Fire, because you will not out-wait it.**"

**Where it points:** `data/nodes/cindershelf.json` ships `kilnback-line: 1`. **Note the discrepancy:** bible §4 gives Kilnback's habitat as *"Steppe (hidden)"*, and every line in the chain places it under the **mine**, in the town node — which is where the data puts it. The chain and the data agree with each other and disagree with the bible's one-word habitat column. Decision D11.

**Cut-line note.** Build-doc §15 puts the Kilnback and Undermere *catch chains* at cut line **C-5** — "→ lore-only". Since neither catch is wired, both are currently already at C-5 by default, and the lore is complete. That is the cheapest possible position to be in.

---

## 5. Regional and scripted events

Bible §9 names four. Your **Q2** constraint is that each must **last a whole season — 4 ticks (`balance.clock.ticksPerSeason = 4`)** — opening at a season boundary, staying active, closing at the next, and visible in the overworld and in encounters throughout.

---

### 5.1 Annual Festival — copy **[WRITTEN]**, mechanism **instantaneous**

**Bible §9:** *"diegetic gym gate, closes the year"*. **Q2 amends this:** it no longer closes the year; it becomes the year's closing celebration, triggered by the meter filling, spanning the final season.

**Shipped code:** `game/year-events.ts` `festivalBeat()` returns a struct whose entire copy is a label — `"Y3/6"` — and `YearTurnScene` renders it as a single beat: `FESTIVAL · Y3/6`. **It is one frame of a year-turn sequence.** No season window, no overworld presence, no encounter effect.

**Shipped copy:** two entries, both gated on the external flag `event.festival.open`, and **only two of six towns have festival copy** (Hearthollow, Brackwater).

> Hearthollow: "Lanterns on the green. **The festival closes the year, and the year closes whether the meter runs out or the badge comes in.**"
> "**Everything ages at the turn. Yours, mine, and the ones in the box you haven't looked at since spring.**"
> Brackwater: "Brackwater does the festival on the water. **Every boat lit, all at once, and the whole channel goes orange.**"
> "Then the year turns and the buyer reprices the season, **and we find out what we're eating**."

**Two lines now contradict Q2 outright** and must change:
1. `festival.hearthollow` — *"…whether the meter runs out **or the badge comes in**."*
2. `maribel.post.win` — *"Badge's yours. **The festival closes the year once you've taken it** — Hearthollow does the whole green with lanterns."*

**Missing:** festival copy for Bowerdeep, Cindershelf, Duskhollow, the Sanctum Approach — **[MISSING]** (4 of 6 towns).

---

### 5.2 Great Migration — copy **[WRITTEN]**, mechanism **season-long, by accident**

**Bible §9:** *"spring — Gloomoth flocks shift spawns region-wide"*. **Bible §5 contradicts its own §9:** the locked migrant table puts Gloomoth in **autumn**, not spring. `data/species.json` ships `gloomoth-line: seasonalWindow = "autumn"`, and every authored line says autumn. The data and the dialogue agree; §9's "spring" is a bible typo. Worth one line from you to confirm (D7).

**Mechanism:** there is no migration *event*. What exists is the four-migrant seasonal window (`core/foodweb.ts` `migrantStatus` + `seasonalWindow`), which filters Gloomoth out of encounter tables outside autumn and reports *why* — `dormant` vs `migrating`. Because a season is 4 ticks by construction, **this is the only one of the four events that already satisfies Q2's duration requirement** — and it does so as a side effect of the migrant model, not because anyone built a migration event.

**What is missing:** the bible's *"shift spawns region-wide"*. The window removes Gloomoth out of season; it does not *raise* them elsewhere in season, and no other node's table changes. There is no announcement, no overworld state, no region-wide effect. **[MISSING]** as an event.

**The copy that carries it is good:**
> Pell: "**Gloomoth migration starts tonight. Region-wide** — they come up out of the Wilds and go through Bowerdeep on their way to wherever they go."
> Bowerdeep child: "**In autumn the Gloomoth come through and the lamps all go out at once and everyone shouts.**"
> Lamp-keeper: "**Out of autumn the road's quiet. The moths aren't dead, they're elsewhere, and the card says so.**"

The other three migrants each get a legibility line too — Pollywisp (spring, Hearthollow forager), Reedrick (summer, net-mender and the Brackwater vendor), Wispurr (winter, Duskhollow astronomer and vendor). That coverage is complete and correct.

---

### 5.3 Cullbrand Harvest raids — 1 of 5+ **[WRITTEN]**, and **instantaneous**

**Bible §9:** *"scripted per act, populations visibly drop at a named node"*.

**Shipped:** exactly one, in `balance.yearEvents.raids`:

```
cullbrand-strip-harvest-r4 · year 4 · node r4 · Ashvole −11 · Cragmar −8
```

`game/year-events.ts` `raidCoverage()` was written specifically to *report* the gap rather than let anyone invent the rest (G2), and `raidableYears()` correctly excludes year 1 (no turn ever begins the start year). So the honest coverage is: **raids possible in acts 2–6; one authored; four unauthored — [MISSING].**

**Three separate problems:**
1. **Four acts have no raid.** Acts 2, 3, 5 and 6 each want one and none exists as data. (Act 6 arguably has one: Greaves' Sanctum breach — but it is a cutscene, not a population event.)
2. **Q2 duration.** The raid applies as a single decrement inside `runYearTurn`. Your constraint says it should open at a season boundary and stay visible for the season.
3. **Q6.** The node it hits ships healthy, so the raid *creates* the crash rather than deepening one — and the bible wants Cindershelf entered mid-collapse. Q6 already notes the better answer: **let the raid crash r4 on act entry**, so one source of truth stays one, and a player who arrives early watches it happen.

The design of the raid data is right, and should be preserved in any fix: **a raid may only decrement harvested prey; the predator collapse above them must emerge from the §7.3 rules (G6).** That is why the target list stops at the two Grazer lines.

---

### 5.4 Bloom Year — **[MISSING]**

**Bible §9:** *"a route whose producers thrive gets bonus spawns — positive feedback made visible"*.

**Nothing implements this.** No `bloom` key in `balance.json`, no bloom event in `core/` or `game/`, no bonus-spawn multiplier anywhere. Encounter weight is the live population count and nothing else.

What *does* exist is two ambient entries that read a high live flora stock and describe a bloom — which is emergent, continuous, and arguably better than a scripted event, but is not the same thing:

> Meadow forager (`r1.floraStock ≥ 88`): "**Bloom year.** Flora stock is over anything in the warden's book and the grazers are all up with it."
> "**Everything eats better in a bloom year, including the things that eat the things that eat.**"
> Old Drover (`r1.floraStock ≥ 80`): "Reach came in green right down to the fence line. **I've not seen it come that far since I was droving.**"

So the *phrase* is written and the *feature* is not. Decision D10: either build the bonus-spawn multiplier the bible asks for, or rule that flora-driven population growth already **is** the positive feedback and drop the separate event.

---

### Event tally

| Event | Copy | Mechanism exists | Season-long (Q2) | Notes |
|---|---|---|---|---|
| Annual Festival | **[WRITTEN]** 2 of 6 towns | yes, as a label | **no — one frame** | 2 lines contradict Q2 |
| Great Migration | **[WRITTEN]** | partial (migrant window only) | **yes** (a season by construction) | no region-wide spawn shift |
| Cullbrand raids | **[WRITTEN]** 1 of 5 | yes, as data | **no — instantaneous** | Q6 conflict on the one node it hits |
| Bloom Year | **[MISSING]** as an event | **no** | n/a | phrase exists in two ambient lines |

---

## 6. Decisions

Twenty items. Each is answerable in a sentence. Ordered by how much they change.

### Status as of 2026-08-25 — read this before re-deriving anything

Every decision below was re-checked against the current code and data on 2026-08-25. Counted off the
21 rows below: **3 closed** (D1, D2, D12) · **6 that only you can rule on** — no amount of code will
close them (D3, D5, D6, D7, D11, D19) · **6 genuinely still open** (D8, D14, D15, D17, D18, D20a) ·
**5 half-closed**, where the text under them now overstates the work (D4, D9, D10, D13, D16) · and
**1 mechanically closed** (D20b).

| D | Status | What actually changed |
|---|---|---|
| **D1** | ✅ **RESOLVED** | The split shipped as recommended. The `years` condition key is used by **zero** entries. |
| **D2** | ✅ **RESOLVED** | Fixed as a side effect of D1, exactly as predicted. `maren.quest.first-signs.*` and `maren.keystone.1` are flag-gated; the year-1 dead-end is gone. |
| **D3** | 🔵 **YOUR RULING** | All five lines still ship verbatim, unedited. Code cannot rule on G7 tone. ⚠ *The whole corpus is mid-rewrite — see the currency note at the top. These five may not survive it in their quoted form.* |
| **D4** | 🟡 **HALF CLOSED** | All seven names have now been swept. `Nessa` came back a **new RED** (Galar Gym Leader, Water-type, fisher father) and is now **Hetty**; the other six screened clean. **But that pass was Pokémon-names-only** — no Digimon, Temtem, Cassette Beasts, Monster Sanctuary or trademark search, all of which the original sweep ran and all of which produced REDs elsewhere. Your approval half is untouched. |
| **D5** | 🔵 **YOUR RULING** | Ships as the paid arrangement, no plea anywhere. |
| **D6** | 🔵 **YOUR RULING** (effectively a no-op) | Gym 1 is 2 slots + 1 signature. Nothing to decide unless you want the copy adjusted. |
| **D7** | 🔵 **YOUR RULING** | Data is still autumn, and `core/regional-events.ts` now *names this decision in a comment* and refuses to fix it by inventing a season (G2). One word from you closes it. |
| **D8** | 🔴 **STILL OPEN — and slightly worse** | No destabilisation mechanism exists anywhere in `core/`. The Duskhollow lines are now `when: {}` — not year-gated, **ungated entirely** — and **one of them** — `amb.r5-astronomer.base` — asserts a measurable *rate* ("about a degree a decade") with nothing behind it. It is the only line in the corpus that asserts a rate; its Duskhollow neighbours are qualitative. |
| **D9** | 🟡 **HALF CLOSED** | The **epilogue survey now exists and is wired** (`game/finale.ts` → `game/boot.ts` launches SurveyScene). The Sanctum itself is unchanged: its one `population` clause is a presence guard, not earned-state description. |
| **D10** | 🟡 **HALF CLOSED — smaller than the text implies** | Bloom Year now ships as a real latched season-long window. Only the **bonus-spawn multiplier** is absent, and `data/balance.json` / `core/regional-events.ts` cite this decision by name for why. |
| **D11** | 🔵 **YOUR RULING** | Unchanged standoff: bible §4 says "Steppe (hidden)", the data and every line put Kilnback under the mine. |
| **D12** | ✅ **RESOLVED** | Shipped as Q6 recommended — see the note under it. |
| **D13** | 🟡 **STILL OPEN, but much cheaper than written** | The headline holds exactly: Wick has grown to 19 entries and **not one** carries a `population` or `floraStock` clause. **But D13's supporting sentence is now false** — 23 entries do read the player's survey back, including two on r4 Stonewing that are precisely the read-your-own-crash beat, and GATE 1f proves every such clause is reachable through the real sim. This is no longer "build the mechanism and write the beat"; it is "write one line on a mechanism that already ships and is gate-proven." |
| **D14** | 🔴 **STILL OPEN** | Still one outcome (`"delivered"`). No `"refused"` anywhere. The suite annotates the deferral flag as *"STORY-REVIEW D14, open"*. |
| **D15** | 🔴 **STILL OPEN** | Bowerdeep's entire Cullbrand presence is still one Greaves intro plus one ambient logger. No quest, no chain, no beat. |
| **D16** | 🟡 **Mechanically repaired, content untouched** | *Forge a Legacy* was closing itself on two [E] presses; it now has a real objective. **No prose moved** — still 5 lines. It is a slim beat, not a hole. |
| **D17** | 🔴 **STILL OPEN — now admitted in code** | *The Star Census* writes `.offered` and `.paid` and has **no terminal state at all**; `game/quests.ts` says so in as many words: *"the only quest of the ten with no terminal state."* Unlike D16, this is a hole. |
| **D18** | 🔴 **STILL OPEN** | `yearEvents.raids` still holds **exactly one** raid. What changed is the raid's *mechanics* (act-keyed, harvest-fraction) — that is D12's territory, not this one. **Six of seven acts have no raid.** |
| **D19** | 🔵 **YOUR RULING — now test-pinned** | The six lines are pinned exactly by the suite, and one real defect inside the set was fixed (`amb.r1-forager.late`'s gate corrected so it is true at its own floor). ⚠ **The exposure is seven, not six:** `wick.act3.win`'s *"three years running"* is the same failure mode and §6 does not name it. Whatever you rule should probably cover it. |
| **D20a** | 🔴 **STILL OPEN** | The Trail's unnamed season is still unnamed; nothing anywhere gates on it. |
| **D20b** | 🟢 **Mechanically closed** | The wager's deadline went from **existing only in the copy** to a real objective kind with lapse and re-arm, enforced by GATE 2d (*"a deadline the copy states is a deadline the objective has"*). The beat is stronger now than when it was flagged. |

**Two framing corrections worth carrying into the read:** D13 and D20b both got smaller since this was
written, and D8 got larger. D16 and D17 look alike in a table and are not — one is thin, the other has
no ending.

---

### The four that matter most

**D1 — Q3: 44 entries gate on an exact calendar year. Which become act flags?**
The entire rival arc (18 entries), both Greaves cutscenes, `greaves.finale.pre`/`post`, `maren.finale`, `sanctum.vellsire.approach`, both epilogues, `prop.sanctum-antler-ring`, the whole opening chain, `maren.keystone.1`, `maren.quest.first-signs.*`, `tolm.quest.fallow.offer`, `maren.greeting.y1–y6`, `amb.r4-worker.arrival`. Under Q3 a player who reaches the Sanctum in year 8 sees **none of the finale** — including the Vellsire choice and both epilogues, which are on the never-cut list.
*My recommendation:* every one of the 44 becomes a flag gate on the corresponding act/badge flag, except `maren.greeting.y1–y6` (harmless — an unconditional fallback exists) and the `amb.*.late` / town-ageing entries, which should **stay** on `yearMin` because Q3 explicitly keeps town ageing on the calendar. **Your call: confirm the split, or name a different one.**

> **✅ RESOLVED 2026-08-25 — nothing to rule on; the split shipped as recommended.** Measured on the
> current corpus: **the `years` condition key is used by exactly zero entries.** The surviving
> condition keys are `actMin`, `act`, `flagsSet`, `flagsUnset`, `flagEquals`, `yearMin`,
> `population`, `floraStock` and `seasons` — `years` is gone from the data entirely. Spot-checked on
> the beats this decision names: all eighteen `wick.act<N>.{pre,win,loss}` entries are `actMin`-gated,
> `greaves.finale.pre`/`.post`, `maren.finale`, `sanctum.vellsire.approach` and **both epilogues** are
> `actMin: 6`, and the town-ageing copy kept `yearMin` exactly as recommended. Do **not** re-derive
> this. *(The per-key counts are **deliberately not recorded here** — the corpus is mid-rewrite, so
> any histogram written down would be stale before it was read. `years` = 0 is the load-bearing
> fact, and it is the one that does not move.)*

**D2 — The Vellsire chain has a hard dead-end at year 1, and no test can see it.**
`maren.quest.first-signs.offer` and `.done` are `years:[1]`. `.done` is the only source of `chain.vellsire.unlocked`. `maren.keystone.1` requires that flag **and** `years:[1]`. So a player who does not finish *First Signs* and then return to Maren **within year 1** permanently loses: the 11-step Vellsire chain, *Vellsire's Trail*, `chain.vellsire.complete`, and the lore behind the finale. The reachability test's flag fixpoint **ignores `years` entirely** (verified in `tests/unit/dialogue.test.ts` — it walks `flagsSet` and `flagEquals` only), so 87 green tests do not touch this. **Your call: is this fixed by D1's act-gating, or does it need its own fix now?** *(D1 fixes it as a side effect, which is the cheapest route.)*

> **✅ RESOLVED 2026-08-25 — fixed as a side effect of D1, exactly as predicted.** Verified in the
> corpus: `maren.quest.first-signs.offer` is now `{flagsSet:["quest.first-signs.offered"],
> flagsUnset:["quest.first-signs.done"]}`, `.done` is `{flagsSet:["quest.first-signs.turnin"],
> flagsUnset:["quest.first-signs.done"]}`, and `maren.keystone.1` is
> `{flagsSet:["chain.vellsire.unlocked"], flagsUnset:["chain.vellsire.step1"]}`. **Not one of the
> three carries a `years` clause any more**, so the year-1 window that could permanently strand the
> 11-step Vellsire chain does not exist.
>
> **The blind spot this decision identified has also been closed, which matters more than the fix.**
> D2's real finding was that *"87 green tests do not touch this"* — the flag fixpoint ignored `years`
> entirely. There is now a permanent gate, `tests/gates/reachability.test.ts` (build-doc §8.5), whose
> whole premise is that a precondition is only real if something **outside the test** produces it. It
> reports every unreachable entry with its kind, line count and reason, and it covers non-flag clauses
> too. A defect of this shape can no longer hide behind a green suite.

**D3 — The five borderline G7 lines, quoted in full.** These were cleared by one read and flagged by an independent audit as close calls. G7 is absolute, so they are yours to rule on.

1. **`maren.keystone.6`** — *"I can't tell you what to do when you're standing in front of it. I can tell you the ledger will read differently either way, and that I will be reading it."*
   She explicitly refuses to advise and "either way" is symmetric. But *"I will be reading it"* is the closest the file comes to implying the player is watched, and after the audit cut the same motif from Wick and Greaves, **it is now the only surviving instance.** Called the most borderline line in the corpus.
2. **`maren.epilogue.caught`** — *"…That's the whole of the difference, and **it is a real one** — four seasons to see it, eight to be sure of it."*
   An ecologist insisting on the magnitude of a measured effect, and the released epilogue carries the symmetric cost. The audit agreed both epilogues are clean and named this clause as the only thumb on the scale. **It is also the line most likely to appear in the demo video.**
3. **`sable.pre`** — *"There are not many left to catch out there, which I mention as a fact about my bench, not about you."*
   Observation, in character — but a disclaimer draws attention to what it disclaims. Cutting the second clause leaves a clean observation and loses the joke.
4. **`maribel.greeting.reach-thin`** — *"Meadow Reach is thin on Nibbin this season. I breed mine at home, so my count doesn't move when the Reach's does."*
   Fires **only when the player has driven the Nibbin count down.** Survives because she gives a husbandry reason rather than a contrast; the trigger is what makes it worth a second opinion. The audit cleared it.
5. **`tolm.quest.fallow.offer`** — *"You can take them instead. Buyers in Hearthollow will give you coin today for a Loamunder. I'd just rather you took my offer, and I'd rather say so plainly than have you guess."*
   Bible §9 asks for a farmer who *"begs you not to catch Loamunder"*, so the beat must exist; it is written as a paid arrangement with an explicit alternative rather than an appeal.

**Each needs one word: keep, trim, or cut.**

**D4 — Seven coined NPC names await your approval, and none has been IP-swept.**
**Tolm** (Hearthollow farmer) · **Nessa** (Brackwater angler) · **Halder** (Bowerdeep silk merchant) · **Pell** (Bowerdeep lantern-keeper) · **Gerta** (Cindershelf miner) · **Ives** and **Orrin** (Duskhollow astronomers).
Coined to fill bible §10's *"+ ~2 quest NPCs per town"*, which names none. Each maps onto an NPC sprite class already in the asset manifest, so no new art. **I checked `docs/IP-SWEEP.md`: not one of the seven appears in it.** The sweep covered species, towns, the region and the eleven bible-named characters; these seven were coined after and are unscreened. G15 forbids shipping a coined name publicly without your check. **Your call: approve the seven as-is and add them to the sweep queue, or rename any before the dialogue is wired.**

---

### Where authored content departs from the bible

**D5 — *The Fallow Field* is an arrangement, not a plea.** Bible §9 says the farmer *"begs you not to catch Loamunder"*. Begging is a moral lever; G7 forbids one. It ships as a paid contract with the alternative stated plainly. **Confirm the read, or ask for something closer to the bible.**

**D6 — Gym 1's Beast identity now rides on one creature.** Bible §7 gave Maribel four; she fields three (D-A5-G1, authorised — the harness measured her at 26.0% against an 80–95% target). *This was your call and is recorded as the stated cost.* Flagged here only because it is a **content** consequence: her type identity is carried entirely by the signature "Old Nib". Her copy already leans on this — *"Old Nib, who is twelve. Elders don't get quick. They get certain."* **Nothing to decide unless you want the copy adjusted.**

**D7 — The Great Migration season: bible §9 says spring, bible §5 and all shipped data say autumn.** `data/species.json` ships `gloomoth-line: autumn`; every authored line says autumn; *Lanternless Night* gates on `seasons:["autumn"]`. §9's "spring" reads as a typo. **One word: confirm autumn.**

**D8 — Duskhollow's ageing arc has no mechanism.** Bible §6: *"dark encroaches as the Sanctum destabilizes."* Four speakers assert it as flat fact in every year, ungated, and **nothing anywhere models Sanctum destabilisation.** It is the only town ageing arc that reads no state. **Your call: build a state behind it, gate the lines on something real (Sanctum-adjacent flora, or Vellsire-absence duration), or accept it as unfalsifiable atmosphere.**

**D9 — The Sanctum is not "revealed in the state your ecology earned".** Bible §6 promises it; none of the six Sanctum entries reads a population or flora figure. The caldera reads identically whether you emptied Fallowmere or restored it. The epilogue names the six nodes but prints no numbers — those live in a survey UI this scene does not open. **Your call: is the epilogue survey enough, or does the Sanctum itself need state-gated description?**

**D10 — Bloom Year does not exist as a feature.** No bonus-spawn multiplier anywhere. Two ambient lines describe a bloom off live flora, which is emergent rather than scripted. **Your call: build the bonus-spawn event, or rule that flora-driven growth already is the positive feedback and strike the event from §9.**

**D11 — Kilnback's habitat.** Bible §4 says *"Steppe (hidden)"*. The data ships it in the **Cindershelf town node**, and every line of the 6-step chain places it under the mine. Data and dialogue agree; the bible's one-word column disagrees. **One word: amend the bible, or move the creature to r4.**

**D12 — Q6 is a content decision, not just a data fix.** `data/nodes/r4.json` ships healthy (Cragmar 10, Pyrelisk 14, Stonewing 3) while bible §6 wants Cindershelf entered mid-collapse. The dialogue was rewritten so it never asserts a collapse the survey contradicts — correct, and not the fix. **Q6 already recommends: let the act-4 raid crash r4 on act entry rather than shipping it pre-crashed**, so one source of truth stays one and an early arrival watches it happen. **Confirm that, or say ship it pre-crashed.**

> **✅ RESOLVED 2026-08-25 — shipped as Q6 recommended; nothing to confirm.** Verified in the data,
> not from a report: `data/nodes/r4.json` still ships **healthy** (Cragmar 10, Pyrelisk 14,
> Stonewing 3 — the exact figures this decision quotes), and the crash is applied on **act entry** by
> `core/lifecycle.ts` `enterPendingActs`, which reads `balance.yearEvents.raids`. That raid list is
> **act-keyed, not year-keyed**: the single entry `cullbrand-strip-harvest-r4` carries `"act": 4`.
> So an early arrival watches it happen and one source of truth stays one, which is what the decision
> asked for. *(Note this is D12 only. **D18** — that six of seven acts still have no raid at all — is
> a different decision and is still open.)*

---

### Beats I think are weak or missing

**D13 — Wick has no population-conditioned line, and this is the largest missing content beat in the game.**
Bible §8 promises *"the routes he's worked are visibly degraded when you reach them"*. **Not one of Wick's 15 entries reads a population, a flora stock, or any player-set flag** — his six encounters are pure `years:[N]`. Nothing anywhere in 499 lines reads the player's own survey back at them.
This is the beat where the rival and the mechanic are supposed to touch, and it is empty. It is also the hardest thing to write without crossing G7 — the line has to *report* the player's survey without commenting on it, which is exactly the failure mode the pattern scan cannot catch. **Your call: is this worth writing, and do you want to see a draft before it goes into the file?** *(I think it is the single highest-value piece of remaining story work.)*

> **⚠ CORRECTION 2026-08-25 — three claims in the paragraph above have expired.** The **headline holds**: measured now, Wick has **19** entries (not 15) and **not one** of them carries a `population` or `floraStock` clause. But: *(a)* **"his six encounters are pure `years:[N]`" is false** — the `years` key is used by **zero** entries corpus-wide; all eighteen `wick.act<N>.{pre,win,loss}` entries are `actMin`-gated (D1). *(b)* **"Nothing anywhere in 499 lines reads the player's own survey back at them" is false** — **23 entries** now carry a `population` or `floraStock` clause, two of them on r4 Stonewing, which is precisely the read-your-own-crash beat this decision asks for. *(c)* The corpus is no longer 499 lines. **What this changes for the decision:** it is no longer "build the mechanism and write the beat" — the mechanism ships and is gate-proven reachable through the real sim. It is now "write one line against a mechanism that already exists," which is a much smaller ask than the paragraph above implies.

**D14 — *Silk Shortage* only has one ending.** The bible promises *"visible consequence either way"*. There is a `delivered` result and a `heard-vesper` deferral, but **no refusal outcome**: no Vesper acknowledgement, no canopy-count consequence, no `result:"refused"`. Half a dilemma. **Your call: author the refusal branch, or accept the deferral flag as the refusal.**

**D15 — Bowerdeep's Cullbrand logging subplot does not exist.** Bible §6 names it. What ships is Greaves' arrival plus two good ambient lines about the same legal fiction from opposite ends. That is a motif, not a subplot. **Your call: is the motif sufficient, or does act 3 need an authored Cullbrand beat?**

**D16 — *Forge a Legacy* is the thinnest quest in the game and it sits on a never-cut demo beat.** Five lines, no branch, no failure state — against a beat (**Legacy**) that build-doc §1 allocates 40% of effort to alongside Cascade. **Your call: leave it, or expand it.**

**D17 — *The Star Census* has no completion.** Offer + a repeatable milestone entry, no `done` flag, no terminal beat. The only one of ten without an ending. **Your call: author a completion at 35/35, or accept it as deliberately open.**

**D18 — Four acts have no Cullbrand raid.** Bible §9 says *"scripted per act"*; one exists (act 4). The raid data model is right and the gap is honestly reported by `raidCoverage()`. **Your call: author raids for acts 2, 3, 5 (and possibly 6), or reduce §9's promise to "one scripted raid, at the act the bible pins".**

**D19 — Six lines hardcode "six years" as the length of a playthrough; Q3 makes the calendar unbounded.**
`wick.act6.win` *"Six years. Every one of them the same result…"* · `greaves.finale.pre` *"You've been counting for six years."* · `maren.epilogue.released` *"You don't own the thing you spent six years finding."* · plus the three `amb.*.late` lines (*"Six years I've mended this line…"*, *"…three times in six years…"*, *"Six years on the same four miles of Reach."*).
Under Q3 a slow player may arrive in year 11 and be told they have been counting for six. The three ambient ones are cheaply fixed by gating on `yearMin: 6` and rewording to "all these years"; the three story ones are load-bearing lines in the finale. **Your call: reword, or accept "six years" as the game's rhetorical figure regardless of the actual count.**

**D20 — Two smaller loose threads, both one sentence to rule on.**
· *Vellsire's Trail* ends on *"it gives a season, which nobody did"* — **no entry anywhere names that season and the finale has no seasonal gate.** Deliberate unanswered note, or dropped thread?
· *Ferryman's Wager* — *"caught and brought back before the year turns"* was written when a gym win could end the year early. Under Q2 the year only ends on a full meter, so the deadline no longer moves and the push-your-luck framing is weaker. Reword, or leave it?

**Also noted, no decision needed unless you disagree:**
· **The player character never speaks.** All player agency is in `choices[]`; there is no scripted player line anywhere. The bible does not settle this either way. It is a real stylistic commitment and it is currently invisible because nothing renders the choices.
· **Micro-geography was invented as texture** — Cindershelf's numbered shafts, Bowerdeep's "winding house" / "eastern stair" / lantern road, Brackwater's numbered pilings, Duskhollow's vale road and margin book, Sel's grandfather. Worth a consistency pass once the painted maps land, since the copy now assumes a layout the maps have not drawn.

---

## Appendix — where everything lives

| What | File |
|---|---|
| Every authored line | `data/dialogue.json` (211 entries, 499 lines, 62 speakers) |
| The condition/trigger model, `conditionHolds()`, `selectEntry()` | `core/dialogue-schema.ts` |
| The G7 read-through, bible gaps filled, sabotage table | `docs/DIALOGUE-NOTES.md` |
| Gym rosters and the level ramp | `data/gyms.json` |
| Populations, flora, props, sign-chain placements | `data/nodes/*.json` |
| Cullbrand raids, keystone coefficient, clock, ages | `data/balance.json` (`yearEvents`, `ecosim`, `clock`, `age`) |
| Festival beat and raid reporting | `game/year-events.ts` |
| Q2 / Q3 / Q6 / Q7 in full | `docs/QUEUED-CHANGES.md` |
| Gym-1 amendment and its measurements | `docs/DEVIATIONS.md` rows D-A5-G1…G4 |
