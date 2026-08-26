# TROPHIC — CAST AND VOICE BIBLE

**Status:** final. This is the working document for the eight parallel dialogue rewriters.
Everything in it is binding. Where it conflicts with an earlier proposal document, this wins.

**Spine:** the `trades` proposal (occupational voices, three-tier naming, the six-verb counting
taxonomy). **Grafted:** `ensemble`'s six-slot casting grid, aphorism-as-position ban,
surname-only Cullbrand convention, kin echoes, and the antler-stone cutscene fix; `plainspeech`'s
licensed-aphorism budget, small-talk quota, em-dash-reversal ban, and three story fixes.

**Decisions taken where the judges disagreed** (one line each, as required):

1. **No speaker merges.** `trades` collapsed three pairs into one person each; two judges split on
   it. Rejected: the corpus's disease is too few distinct voices, and the two speakers currently
   *both* displaying "Cullbrand Worker" are fixed better by two different names than by one.
   All 62 speakers stay. 41 new coined names, not 38.
2. **Aphorisms are rationed, not banned.** `ensemble` banned the closing slot; `plainspeech`
   licensed a budget. Both: the slot ban is the default, the budget is the only exemption, and a
   licence may never be spent on a banned frame.
3. **No fish-word names.** All three judges agreed; `ensemble`'s badge *mechanism* survives,
   its fish vocabulary does not.
4. **Test gate = a third list.** `trades`/`ensemble`'s split design, not `plainspeech`'s cap raise:
   raising `COINED_NPC_NAMES` 7→48 voids the property that assertion exists to hold.
5. **Names flagged by `trades` are replaced, not shipped flagged.** A flag is not a decision.
   Hob, Merrit, Dagmar, Pim, Quill, Effie, Fettes, Culver, Cluff, Dace, Tench, Elver, Sprat,
   Wold, Rennet, Vetch, Haver and Larke are all out.
6. **Pell and the Bowerdeep lamp-keeper do NOT duplicate each other.** `trades` claimed they do;
   verified false — `amb.bowerdeep-lampkeeper.base` already defers ("Pell has the road out to the
   eastern stair. That's the hard stretch and he's had it forty years"). No fix needed; keep the
   deference and sharpen it into a rivalry.

---

## 1. THE BAR

"Sounds like a human wrote it" is not a feeling. It is five checks a writer runs on their own line
before they keep it.

**CHECK 1 — THE FOUR-LINE TEST.** Take your line, strip the name plate, and set it beside three
lines by other speakers from the same town. A reader who knows the cast must be able to say which
is which. If your line could be moved into another character's mouth without anyone noticing, it is
not a line yet — it is corpus filler with a different sprite over it.

**CHECK 2 — THE LANDING TEST.** Read your last sentence. If it summarises, balances, reverses,
or would look good printed on a poster, delete it. A beat ends on a fact, a request, a complaint,
a piece of business, or an unfinished thought. Nobody in Fallowmere gets the last word except the
fourteen licensed lines listed in §2. **The ban is on the POSITION, not on a phrase list** — a
freshly-invented epigram in the final slot is the same defect as a recycled one.

**CHECK 3 — THE JOB TEST.** Does the line come out of this person's actual work, in this person's
actual vocabulary? A netmender says *gauge* and *re-cut*. A buyer says *clause* and *schedule*.
A shafthand says *roster* and *shift*. If two characters in different trades could have reached for
the same image, one of them is borrowing and it is not their image to borrow. Every trade has its
own instrument and its own word for it (§3).

**CHECK 4 — THE COMPETENCE TEST.** Is anybody in this beat ordinary? Real crowds contain a person
who is boring, a person who is wrong, a person who repeats himself inside one conversation, and a
person who does not answer the question he was asked. **Per settlement, all four of those must be
filled** (§6). If your town's every speaker is sharp, informative and quietly wise, the town is
staffed rather than populated.

**CHECK 5 — THE MENTOR TEST.** Are you addressing the player as a pupil? Second-person instruction
belongs to Maren, Gerta, Bram, Orrin and the explicit shop-tutorial lines. **Everyone else is
allowed to not care that the player exists.** The dockhand is landing a barge. The innkeeper wants
the room paid for. The child is showing off. None of them is helping you develop.

### Two positive quotas the bar also enforces

**THE SMALL-TALK QUOTA.** Every ambient speaker gets **at least one line of their three carrying no
ecological information whatsoever** — money, weather, a bad back, a neighbour, a delivery, a
grievance about a rota. This is the single highest-yield fix in the rewrite. Right now essentially
all 499 lines carry ecological payload, which is *why* 62 people read as one warden's teaching
assistants. Ecology drops to two lines per ambient speaker; the third line is a person being a
person.

**THE SPECIFICITY FLOOR.** A line must contain at least one thing only this speaker would know:
a number they took themselves, a name of a person, an object they own, a place inside their own
four miles. Generality is the machine's default register. "The marsh is thinner than it was" is
nobody. "Three re-cuts in six years, and I overdid the second one" is one woman.

### Line-length band

The schema allows 400 characters; the current corpus runs median 98, p95 153, max 229. Texture
comes from **within-line length**, because the line *count* is frozen (§9). Aim inside 90–200
characters. Only **Sel, Judd, Dunstan and Greaves** may exceed 200, and only where the rambling is
the point — the dialogue box wraps to three body lines and pages, so a 313-character sentence
becomes three advance-presses mid-clause.

---

## 2. BANNED CONSTRUCTIONS

**THE HARD CAP, which governs everything below:** *no construction may be shared by more than two
speakers in the whole game.* Not two per town — two in the corpus. If a third character reaches for
a shape a second character already owns, the third character loses it. This applies to rhetorical
frames, not merely to sentences. The existing chorus check in `tests/unit/dialogue.test.ts:2580`
fails a repeated *sentence* across three speakers; it does not catch a repeated *shape*, so this
cap is enforced by the scanner specified in §9, not by the existing suite.

**THE LICENCE.** Exactly fourteen lines in the finished corpus may end on a formulation:

| Speaker | Licences | Where |
|---|---|---|
| Greaves | 3 | anywhere in his part |
| Wick | 6 | one per `battle-pre`, acts 1–6, and nowhere else |
| Vesper | 2 | anywhere in her part |
| Sel | 2 | **only inside `sel.tale.*`** — he is diegetically telling a story and charging for the crossing while the stories are free |
| Maren | 1 | one line in her entire 70-line part, spent in an epilogue |

Everyone else has zero. **A licence may never be spent on a banned frame** — a licensed line must
be a *new* formulation, and the banned-frame scanner applies to licensed lines too. These are two
independent gates and both must pass. Any writer who wants a good closing line for someone else
must take it out of one of these five budgets, which means asking the integrator.

### B1 — The negation-correction epigram *(the loudest signature in the corpus)*

`That's not X. That's Y.` and every variant, including the inverted one.

- **BEFORE** (`wick.act1.pre`): "The Company pays by the head and doesn't ask whose head. That's not sentiment. That's a price list."
- **AFTER**: "Company pays by the head. Doesn't ask whose. I'm on grade four — that's eleven a head — and I'd be on six if they'd given me the marsh route."
- **BEFORE** (`sel.docks.rotting`): "So the dock rots at the speed of the channel. That's not a saying. That's the accounting."
- **AFTER**: "Nobody'll drive new ones, because pilings come out of the levy and the levy comes off the channel figure. I've told the harbourmaster twice. He writes back that he agrees with me. Lovely thing to have in a drawer."

Also banned in this family: `That's not a preference, that's the channel` (dockhand), `That's not a
mood, it's on Orrin's chart` (Duskhollow innkeeper), `Not a change of heart` (Wick act 6),
`That is not a story. It is a coefficient` (Maren epilogue). **Note the last one specifically: the
inverted form — "That's a coefficient, not a feeling" — is the same ban.** No character may negate
a noun in order to substitute a better one.

### B2 — The summarising closer

`That's the whole of it` / `the shape of it` / `all that was` / `the whole trick` / `the entire
account` / `that's most of it` / `That's the marsh in four words`.

- **BEFORE** (`wick.act1.loss`): "That's the shape of it. Keep the ledger — it's the part of this you're ahead on."
- **AFTER**: "Five to four on the last exchange. I'll take that back to intake and nobody there will care."
- **BEFORE** (`odo.greeting`): "Water erodes and plant overtakes. That's the marsh in four words and it's most of my gym strategy."
- **AFTER**: "Water takes the bank away and the reed takes it back. Slower than you'd think. You can watch it happen if you sit down for a season."

Eight instances across five speakers. Only Greaves may summarise, because summarising is what he is
paid for, and he spends a licence to do it.

### B3 — The bare-name self-introduction

A sentence consisting of the speaker's own name and a full stop, as the first thing they say.
**All seventeen named NPCs currently do this — 34 lines.** It is the largest uniform signature in
the file by count.

- **BEFORE** (`sable.pre`): "Sable. Fire type, steppe born, and everything on my bench was caught inside a day's walk of this forge."
- **AFTER**: "Everything on this bench I caught myself, inside a day's walk. Sable, if you need it written down."

Replacement policy: most people do not introduce themselves at all; some give the name mid-sentence;
some give it grudgingly on the second meeting; some never give it and the player learns it from
somebody else ("Cass at the winding house", "Ridd from the fishery", "young Cob"). **At most three
characters in the finished corpus may open with a bare name**, and it must characterise them —
Corbett does it because it is a transaction, Dorn does it because he is reporting.

### B4 — The tenure-credential opener

`Sixty years on these stilts` / `Thirty-one years down the third shaft` / `forty-one years` /
`Sixty-two years under the shelf` / `Two hundred and eleven lamps` — tenure stated as the first
thing out of the mouth, as a credential. 25 lines, 17 speakers.

- **BEFORE** (`amb.brackwater-elder.base`): "Sixty years on these stilts. The water line on my post has not moved once in all of it."
- **AFTER**: "That mark on my post. It hasn't moved. Not once, and I've been looking at it since before your mother. Same mark in a drought year. Same mark in a flood year. My nephew says I cut a new one and forgot. I did not cut a new one."

**Exactly two characters keep it**, because for them the number *is* the evidence: Gerta (the log
is thirty-one years of one reading a shift, and the span is the claim) and Sel (he is betting the
crossing on it). Everybody else's tenure arrives late, sideways, or not at all.

### B5 — The asyndetic triad as list-poetry

The three-or-four-item list followed by a verdict, used identically in all five towns.

- **BEFORE** (`vendor-hearthollow.shop`): "Snares, salve, tonic, bait mats. Weighted snares when the smith has them and not before."
- **AFTER**: "Snares and salve. Tonic if you're the sort that needs it. Weighted ones when the smith sends them up, and he's sent none since spring, so don't ask twice."
- **BEFORE** (`amb.hearthollow-forager.base`): "Sign cards. Tracks, scrapes, castings, browse lines. You learn to read them or you walk past everything."
- **AFTER**: "A track's the obvious one. Then scrapes — which is to say where something's rubbed bark off, not where something's dug. Those are different and people mix them up. With me?"

Lists are fine when a character is genuinely enumerating something the listener needs. The *cadence*
is banned: break it with an interruption, an aside, an unequal list, or an item they cannot sell.

### B6 — Metaphor-as-measurement *(the engine of the ledger problem)*

`a crow count is a death count wearing feathers` / `A cut stump is a ledger with the pages stacked
instead of bound` / `A net is a record of the fishery` / `Mine is paper. Theirs is granite`.

- **BEFORE** (`amb.brackwater-netmender.late`): "A net is a record of the fishery, if you keep the old ones. I keep the old ones."
- **AFTER**: "I keep the old ones in a chest under the window. My son calls that hoarding. It is hoarding. But I can put my hand on a net from before he was born, in the dark, so."
- **BEFORE** (`gerta.quest.crash.done`): "Carricrow. Always Carricrow. Scavenger weight rises with recent deaths, so a crow count is a death count wearing feathers."
- **AFTER**: "Carricrow, always. They come up where there's carrion, and out there the carrion was everything else on your list. Now give me the flora reading. That's the one I actually wanted and it's the one people forget."

This construction turns a miner, a netmender and a warden into three poets with one poem. If an
image is genuinely good, **exactly one character in the game owns it**, and it must be made of that
trade's own materials.

### B7 — Second-person mentor address

`You learn to read them or you walk past everything` / `If you don't know what your target eats,
you're buying at random` / `Bring something with Instinct or bring patience` / `Knowing the ground
is most of it`.

Permitted only for **Maren, Gerta, Bram, Orrin** and the explicit shop-tutorial lines, and only
about a method that character is personally responsible for teaching. Everybody else may talk about
their own four miles and let the player draw their own conclusions.

### B8 — The em-dash negation reversal

`Not weathered away — never cut` / `Not collapsed — boarded` / `Not thinning — empty`. Verified
cross-speaker (a prop, Bram, Orrin). **Banned for all human speakers.** It survives only in the four
prop readers, where it is a describer being precise rather than a writer being dramatic — and even
there, once per prop across the whole corpus.

### B9 — The reverent-artifact register around counting

`Take the ledger` / `I'll hold the page` / `we'll compare books` / `the only report I want from you`
/ `Keep the ledger, it's the part of this you're ahead on` / `That is the other half of the entry
and I am writing it down too` / `Corrections welcome; guesses are not`.

Banned outright — 33 lines across 14 speakers. This is the user's specific complaint. §3 is the
replacement register and is not optional.

### B10 — The equivalence formula

`the two are the same skill at different speeds` / `Same animal, three names, one life` / `the same
count, whichever end of it you are looking at` / `they are the same animal wearing its age`.

Four speakers use one construction to explain metamorphosis. **Say it once, in Maren's mouth, in the
tutorial**, and let everybody else be imprecise about it the way real people are — including Fitch,
who gets it wrong.

### B11 — The one-word verdict close

`Fair.` / `Good.` / `Noted, and I do write it down.` / `Unsentimental. I approve.` / `Almost.` /
`Not this year.` / `Six.`

Capped at **three in the whole corpus**, reserved for Greaves, Noct and Wick's act-6 pre-battle.
Everywhere else the sentence finishes. Approval should be awkward, excessive, withheld, or expressed
as something practical: a discount, a warning, a job.

### B12 — The self-aware disclaimer

`which I mention as a fact about my bench, not about you` / `which I do not explain to people` /
`I want that on the record, because it isn't one` / `which she hates`. This is the writer winking at
the player over the character's shoulder, and it is the clearest tell that one hand wrote all 62
parts. Banned. Self-awareness is the rarest trait in a real crowd, not the commonest.

### B13 — The balanced-nuance couplet

`Both of those are true at once` / `Both halves are true and only one gets said in the tavern` /
`He is not a villain and I am not a warden. We just price the same tree differently.` The corpus's
stock move for signalling nuance, currently shared by a magnate and a market trader. Nuance is
demonstrated by two characters disagreeing on screen, never by one character announcing that
both sides have a point.

### B14 — The rhetorical inversion closer

`Animals do not stop being seen. They stop being where they were seen.` (Maren) and
`Animals do not stop existing on a date. They stop being where the instrument points.` (Orrin) —
the same move, twice, almost verbatim. Banned. Beautiful once, machine-written by the second time,
and it currently appears in the corpus's two most authoritative mouths.

### B15 — Universal competence *(a corpus property, not a phrase)*

Nobody in the current 499 lines is boring, wrong, confused, repetitive, or uninterested. That
uniformity is itself the defect. **Per settlement the four quotas in §6 are mandatory**, and
corpus-wide **at least eight speakers must state something another speaker contradicts**. §8 and
Appendix A name the first six of those contradictions; the rewriters supply the rest.

### B16 — The place-summarised-in-a-formula line

`Meadow is producer country` / `Bowerdeep is three towns stacked` / `Water erodes and plant
overtakes`. People who live somewhere describe the bit of it they work in. Only Maren, Vesper and
Ives are allowed to generalise about a region, because generalising about regions is their job.

### B17 — Precise numbers used as cadence

An exact figure placed in the closing clause purely for rhythm. Banned in the closing position.
Every number must be load-bearing: cited because somebody needs it, and attributable to whoever
counted it (§3, rule 1).

---

## 3. HOW COUNTING IS TALKED ABOUT NOW

**The word is SURVEY. "Ledger" is gone — from the screen, from prose, from entry ids, from flags,
from scene keys, from filenames, from tests and from docs.** The scene and its test are already
`SurveyScene.ts` / `survey-view.test.ts`; what remains is enumerated in Appendix B.

**But "survey" does not simply take "ledger"'s place in every sentence**, because a one-for-one
swap would keep the halo and change only the noun. The grammatical distinction that prevents that:

> **A survey is a thing you DO. The paper is a thing you CARRY.**
> You *walk* a survey. You're *due* on the west scarp. You *run* a transect.
> What you carry is **the survey book**, the board, the sheet, the page, the log, my column, a card.
> **Nobody in Fallowmere has "the survey" as an object, and nobody has "the ledger" at all.**

So `Take the ledger` has no word-for-word translation. Every one of the fourteen ledger lines is
rewritten wholesale, not substituted.

### The five rules

**RULE 1 — EVERY NUMBER HAS AN OWNER.** Nobody says "the count is nine." They say *"I've got it at
nine"*, *"the fishery has it at twelve"*, *"that's Maren's figure, not mine"*, *"I walked it myself
at dawn because that's when they're up."* A figure with no provenance is the tell of the old voice.

**RULE 2 — EVERY NUMBER HAS AN AGE, AND MOST ARE STALE.** The default state of the survey book is
BEHIND. *"That's last spring's."* *"Three weeks out of date north of the gate, and that's my fault,
not the gate's."* *"I haven't walked the vent line since the thaw."*

**RULE 3 — METHOD IS ARGUABLE, AND PEOPLE ARGUE IT.** Transect hour, double-counting, sample size,
whose turn the west scarp was. *"You counted the rise twice — that's the same four Nibbin."*
*"One reading a shift, on the wall, not the air. The air's no good."* *"He counts nests, I count
birds."* *"Do juveniles go in or not? Because Corbett says not."* **This is where the drama of
counting now lives** — not in reverence, in methodology disputes between people who each privately
think the other is sloppy. It is also how Ives and Orrin, and Maren and Sel, express affection.

**RULE 4 — COUNTING IS A CHORE WITH FRICTION.** Wet pages. A lost pencil. A column ruled crooked by
the person complaining about it. Handwriting nobody can read. A transect skipped because it rained
and written up anyway. Gerta carries a thermometer nobody paid her to carry and is embarrassed
about it.

**RULE 5 — NOBODY SAYS IT MATTERS.** The moment a character asserts the importance of counting, the
line is wrong. Its importance is demonstrated by people being **paid off it**, being **late with
it**, and **fighting about it**. Characters may say the survey is LATE, WRONG, MINE, or DUE. Never
that it is honest, true, real, sacred, or the only thing that doesn't lie.

**Corollary (grammatical, checkable):** if the record is the *subject* of a sentence, the predicate
must be mechanical. It is behind. It is wet. It is on the board. It says nine. Never: it records,
it does not care, it will read differently either way.

### Each trade has its own instrument and its own word for it

**This is the strongest single anti-chorus device in the rewrite**, because it means no two people
call the same thing by the same name.

| Speaker | Their instrument, in their own words |
|---|---|
| Maren | the survey, the sheet, the board, the count, coverage |
| Wick | intake, returns, grade, the column, the schedule |
| Greaves | the inventory, the book, exposure, the audit |
| Hetty | my board — chalk, damp, a column she ruled crooked |
| Gerta | my log; one reading a shift, on the wall not the air |
| Ives | the census, an identity, an entry, a plate |
| Orrin | the margin, the margin book, the record, the hand |
| Sel | pole depths, my marks, my grandfather's card |
| Tolm | the headcount; walking it myself at the turn |
| Corbett | the contract figure, the clause, the schedule |
| Parnel | the mesh, the gauge, what comes up in it |
| Whit | lamps out, lamps lit |
| Idony | the lamp bills |
| Snell | what his hands tell him before he's down the second ladder |
| Bram | what the floor is doing |
| Odo | the water |
| Pinder | the chart, the rate, a degree a decade |

### The four voices the brief asked for, side by side, on the same subject

**A WARDEN (Maren)** — separates what she measured from what she suspects, out loud, and gives the
age of the figure before the figure:

> "Brackmarsh is three weeks old and the three weeks were the wet ones, so take it as a floor
> rather than a number. Four seasons on that pattern, though, so I'd call it likely."

**A FISHERMAN (Odo)** — does not count; times things to water, and hands the number to whoever owns
it:

> "Hetty walks the shallows herself now. She'll have it, and hers is better than mine because I'm
> in a boat and a boat counts what a boat can see."

**A COMPANY MAN (Greaves)** — the record is an instrument of ownership with a department behind it,
and he never dignifies hers by comparing them:

> "Ours is called an inventory. It is audited twice a year by people I pay to disagree with me, and
> it balances to the individual. Maren has a pencil and a region."

**A CHILD (Tibb)** — no concept of the record as anything but a book with no pictures in it:

> "Maren let me hold the survey book and it's numbers all down the page and no drawings at all.
> There's a Nibbin under the mill step and it's called Button. She wrote it in as one Nibbin.
> I said its name and she wrote one Nibbin."

### At least four ambient speakers must be BORED by counting

A world where everybody respects the survey is a world where the survey means nothing. Mandatory:

- **Mott** (fence-mender): "Warden wants a number on it. I've not got a number. I've got a post."
- **Parnel** (net-mender): "I cut the mesh to what comes up in it. That's not counting and I'd not call it counting."
- **Nunn** (shaft-hand): "Ask me about the roster instead."
- **Hesk** (Duskhollow vendor): "I don't ask and they don't say."

### Forbidden phrases and their replacements

| FORBIDDEN | REPLACEMENT |
|---|---|
| "And the ledger." | "And this. Survey board." |
| "Take the ledger." | "Book's on the hook. Spare pencil's in the tin, and it is a spare, so bring it back." |
| "I'll hold the page." | **CUT ENTIRELY.** Maren is at the rim with a board because that is where she works, and she says so plainly. There is no non-reverent version of this line. |
| "we'll compare books." | "I'll walk it myself at the turn and we'll see if we've got the same number. We won't." |
| "The difference between the two readings is the only report I want from you." | "Read the Reach going out and read it coming back. If they don't match, write the second one under the first — don't rub the first one out." |
| "The ledger records it identically. It does not care which direction the number moved." | "Same column, minus sign instead of plus. It's the only bit of the book that's easy." |
| "Keep the ledger — it's the part of this you're ahead on." | "Your coverage is cleaner than ours. I've seen our intake sheets. We don't walk half of what you walk." |
| "Corrections welcome; guesses are not." | "Counts go up when I've walked them. If yours differs, say so, and say where you were standing." |
| "Real numbers, not guesses." | "By me, mostly, which is why it's three weeks out of date anywhere north of the gate." |
| "the ledger will read differently either way, and that I will be reading it." | "Four seasons to see it either way. Eight to be sure of it. I'll be the one seeing it, so." |
| "Mine is paper. Theirs is granite. Theirs will outlast mine." | "Whoever cut them was counting something too. I'd like to know what, and how often. Neither of those is on the stone." |
| "You'll want the ledger open for this one." | "Open the book. Whatever the numbers do up here, they do it fast." |
| "she's needed at the ledger desk" | "she's got Brackmarsh to re-walk and she's already behind on it" |
| "I checked against the ledger." | "I checked. It's written down and it's the same one." |

### G7 stays intact, and this is where it could break

Stripping the reverence removes praise as well as blame — a woman complaining her sheet is damp is
not moralising about catching, and a buyer saying the clause is the clause is not passing judgement.
**The one risk this rewrite introduces is that irreverence curdles into sarcasm aimed at the
player.** Characters may be short with their data and short with each other. **No character is ever
short with the player's choices.** The epilogues stay numeric. The `G7` regex scan cannot detect
tone — its own header says so — so the control is the line-by-line read recorded in
`docs/DIALOGUE-NOTES.md`, repeated over every rewritten entry.

---

## 4. THE CAST

**41 new coined names.** The verbatim JSON array for the test allow-list is in Appendix D.

Naming register, in three tiers set by the work and not by money:

- **HANDS** — field, dock, shaft, road, crew, boat. One hard syllable, or two with a closed ending.
- **SKILLED / SALARIED** — innkeepers, stallholders, winders, lampwrights, shepherds, elders.
  A softer two syllables, often a real saint's or grandmother's name.
- **INSTITUTIONAL** — anyone who speaks for a contract or a company is addressed by a **surname
  alone**, exactly the way Greaves is. **Every Cullbrand employee, in every town, is surname-only**,
  so the player hears "company" before the character says a word.
- **CHILDREN** are diminutives, and are the only vowel-final or pet-form names in the cast.

Mechanical rules, all verified against `data/species.json`, `data/nodes/*.json`, `data/gyms.json`,
`data/moves.json` and `data/balance.json` before this table was written: no cast name is an exact
match for any species form, dex id, line id, node id, node display name, town, gym name, nickname,
trait name, move name or item name; **no cast name shares its first three letters with any of those
tokens**; and no two names in the cast — or against the ten protected canon names — share their
first three letters. *(The single surviving head-collision in the game is `Maren`/`Maribel`, both
protected bible canon and out of scope.)*

Also verified: none of the 41 appears as a lowercase ordinary word anywhere in the current corpus.

Key: **NEW** = newly coined, must go in the allow-list. **KEEP** = unchanged, already allow-listed.

### Named speakers (17) — all KEEP

| # | id | kind | home | portrait | FINAL NAME | status |
|---|---|---|---|---|---|---|
| 1 | `maren` | named | hearthollow | trainer-maren | **Warden Maren** | KEEP (bible) |
| 2 | `wick` | named | hearthollow | trainer-wick | **Wick** | KEEP (bible) |
| 3 | `greaves` | named | sanctum | trainer-greaves | **Magnate Greaves** | KEEP (bible) |
| 4 | `maribel` | named | hearthollow | trainer-maribel | **Maribel** | KEEP (bible) |
| 5 | `odo` | named | brackwater | trainer-odo | **Odo** | KEEP (bible) |
| 6 | `vesper` | named | bowerdeep | trainer-vesper | **Vesper** | KEEP (bible) |
| 7 | `sable` | named | cindershelf | trainer-sable | **Sable** | KEEP (bible) |
| 8 | `noct` | named | duskhollow | trainer-noct | **Noct** | KEEP (bible) |
| 9 | `bram` | named | cindershelf | npc-bram | **Bram** | KEEP (bible) |
| 10 | `sel` | named | brackwater | npc-sel | **Sel** | KEEP (bible) |
| 11 | `tolm` | named | hearthollow | npc-farmer | **Tolm** | KEEP (coined, allow-listed) |
| 12 | `nessa` | named | brackwater | npc-angler | **Hetty** | KEEP (coined, allow-listed) |
| 13 | `halder` | named | bowerdeep | npc-market-vendor | **Halder** | KEEP (coined, allow-listed) |
| 14 | `pell` | named | bowerdeep | npc-townsfolk-elder | **Pell** | KEEP (coined, allow-listed) |
| 15 | `gerta` | named | cindershelf | npc-miner | **Gerta** | KEEP (coined, allow-listed) |
| 16 | `ives` | named | duskhollow | npc-astronomer | **Ives** | KEEP (coined, allow-listed) |
| 17 | `orrin` | named | duskhollow | npc-astronomer | **Orrin** | KEEP (coined, allow-listed) |

### Generic speakers (10) — all NEW

| # | id | kind | home | portrait | FINAL NAME | tier | status |
|---|---|---|---|---|---|---|---|
| 18 | `innkeeper-hearthollow` | generic | hearthollow | npc-innkeeper | **Aldis** | skilled | **NEW** |
| 19 | `innkeeper-brackwater` | generic | brackwater | npc-innkeeper | **Elsbet** | skilled | **NEW** |
| 20 | `innkeeper-bowerdeep` | generic | bowerdeep | npc-innkeeper | **Yule** | skilled | **NEW** |
| 21 | `innkeeper-cindershelf` | generic | cindershelf | npc-innkeeper | **Berit** | skilled | **NEW** |
| 22 | `innkeeper-duskhollow` | generic | duskhollow | npc-innkeeper | **Effie** | skilled | **NEW** |
| 23 | `vendor-hearthollow` | generic | hearthollow | npc-market-vendor | **Kett** | skilled | **NEW** |
| 24 | `vendor-brackwater` | generic | brackwater | npc-market-vendor | **Hild** | skilled | **NEW** |
| 25 | `vendor-bowerdeep` | generic | bowerdeep | npc-market-vendor | **Zeb** | skilled | **NEW** |
| 26 | `vendor-cindershelf` | generic | cindershelf | npc-market-vendor | **Annis** | skilled | **NEW** |
| 27 | `vendor-duskhollow` | generic | duskhollow | npc-market-vendor | **Hesk** | skilled | **NEW** |

### Ambient speakers (31) — all NEW

| # | id | kind | home | portrait | FINAL NAME | tier | status |
|---|---|---|---|---|---|---|---|
| 28 | `hearthollow-elder` | ambient | hearthollow | npc-townsfolk-elder | **Judd** | hands | **NEW** |
| 29 | `hearthollow-child` | ambient | hearthollow | npc-townsfolk-child | **Tibb** | child | **NEW** |
| 30 | `hearthollow-farmhand` | ambient | hearthollow | npc-farmer | **Rask** | hands | **NEW** |
| 31 | `hearthollow-forager` | ambient | hearthollow | npc-farmer | **Tamsin** | skilled | **NEW** |
| 32 | `hearthollow-fenceman` | ambient | hearthollow | npc-farmer | **Mott** | hands | **NEW** |
| 33 | `brackwater-dockhand` | ambient | brackwater | npc-angler | **Gunn** | hands | **NEW** |
| 34 | `brackwater-netmender` | ambient | brackwater | npc-angler | **Parnel** | skilled | **NEW** |
| 35 | `brackwater-child` | ambient | brackwater | npc-townsfolk-child | **Jem** | child | **NEW** |
| 36 | `brackwater-elder` | ambient | brackwater | npc-townsfolk-elder | **Ulla** | skilled | **NEW** |
| 37 | `brackwater-buyer` | ambient | brackwater | npc-market-vendor | **Corbett** | institutional | **NEW** |
| 38 | `bowerdeep-logger` | ambient | bowerdeep | npc-logger | **Garrow** | hands | **NEW** |
| 39 | `bowerdeep-silkwinder` | ambient | bowerdeep | npc-market-vendor | **Cass** | skilled | **NEW** |
| 40 | `bowerdeep-child` | ambient | bowerdeep | npc-townsfolk-child | **Fitch** | child | **NEW** |
| 41 | `bowerdeep-elder` | ambient | bowerdeep | npc-townsfolk-elder | **Dunstan** | skilled | **NEW** |
| 42 | `bowerdeep-lampkeeper` | ambient | bowerdeep | npc-townsfolk-elder | **Whit** | hands | **NEW** |
| 43 | `cindershelf-miner` | ambient | cindershelf | npc-miner | **Snell** | hands | **NEW** |
| 44 | `cindershelf-shafthand` | ambient | cindershelf | npc-miner | **Nunn** | hands | **NEW** |
| 45 | `cindershelf-elder` | ambient | cindershelf | npc-townsfolk-elder | **Ebba** | skilled | **NEW** |
| 46 | `cindershelf-child` | ambient | cindershelf | npc-townsfolk-child | **Cob** | child | **NEW** |
| 47 | `cindershelf-worker` | ambient | cindershelf | npc-cullbrand-worker | **Rowe** | institutional | **NEW** |
| 48 | `duskhollow-astronomer` | ambient | duskhollow | npc-astronomer | **Bly** | skilled | **NEW** |
| 49 | `duskhollow-elder` | ambient | duskhollow | npc-townsfolk-elder | **Idony** | skilled | **NEW** |
| 50 | `duskhollow-child` | ambient | duskhollow | npc-townsfolk-child | **Fay** | child | **NEW** |
| 51 | `duskhollow-lampwright` | ambient | duskhollow | npc-market-vendor | **Ingram** | skilled | **NEW** |
| 52 | `duskhollow-shepherd` | ambient | duskhollow | **npc-farmer** *(reassigned)* | **Alwin** | skilled | **NEW** |
| 53 | `r1-forager` | ambient | r1 | npc-farmer | **Isbel** | skilled | **NEW** |
| 54 | `r2-ferryhand` | ambient | r2 | npc-angler | **Vann** | hands | **NEW** |
| 55 | `r3-logger` | ambient | r3 | npc-logger | **Hurst** | institutional | **NEW** |
| 56 | `r4-worker` | ambient | r4 | npc-cullbrand-worker | **Slade** | institutional | **NEW** |
| 57 | `r5-astronomer` | ambient | r5 | npc-astronomer | **Pinder** | skilled | **NEW** |
| 58 | `sanctum-approach-scout` | ambient | sanctum-approach | npc-cullbrand-worker | **Dorn** | institutional | **NEW** |

**ONE PORTRAIT REASSIGNMENT, and only one:** `duskhollow-shepherd` moves
`npc-townsfolk-elder` → `npc-farmer`. Duskhollow currently spends two of its five ambient slots on
elder sprites; a working shepherd is a farmer, the sprite class already exists, and freeing the slot
makes Idony the town's only old woman instead of one of two interchangeable ones. **Bowerdeep's
duplicate elder sprite (Dunstan and Whit) is kept deliberately** and cast as a rivalry — they
disagree about who is older and each thinks the other's stretch of road is the easy one. That turns
an art constraint into a joke instead of a defect. No other reassignments; no new sprite class is
implied anywhere in this cast.

### Prop speakers (4) — all KEEP

| # | id | kind | portrait | FINAL NAME | status |
|---|---|---|---|---|---|
| 59 | `prop-antler-stone` | prop | prop-antler-stone | **Antler Standing-Stone** | KEEP |
| 60 | `prop-sunken-idol` | prop | prop-sunken-idol | **Sunken Idol** | KEEP |
| 61 | `prop-shell-kiln-shrine` | prop | prop-shell-kiln-shrine | **Shell-Kiln Shrine** | KEEP |
| 62 | `prop-sign-card` | prop | prop-sign-card | **Sign Card** | KEEP |

**RUNNING TOTAL OF NEW COINED NAMES: 41.** The capped test allow-list must be raised by **exactly
41** — see Appendix C for the mechanism, which is a *new* list and not a raise of an existing cap.

### Names deliberately rejected, and why

`Hob` (reads hobgoblin) · `Merrit` (reads "merit") · `Dagmar` (echoes the species Cragmar) ·
`Pim`, `Quill`, `Effie` (three pop-culture-adjacent names concentrated in the child tier, the tier
players notice most) · `Fettes` (Stevenson's body-snatcher) · `Culver`, `Cluff` (both collide on
`Cul-` with **Cullbrand**, the antagonist company) · `Dace`, `Tench`, `Elver`, `Sprat`, `Fisk`
(fish words in a monster-catching game whose creatures are Mirefin, Fenmaw, Bogling and Reedrick) ·
`Wold`, `Rennet`, `Vetch`, `Haver`, `Larke` (common nouns pressed into service as names, one
abstraction away from the Net-Mender problem this rename exists to kill) · `Quist` (head-collides
with the move **Quicken**) · `Sigga` (head-collides with `sign`/`signpost` node ids) · `Lund`
(head-collides with the trait **Deep Lungs**) · `Thora` (head-collides with **Thornlet** /
**Thornwald**) · `Wenna` (Webvern) · `Minn` (Mirefin) · `Lome` (Loamunder).

---

## 5. VOICE SHEETS

Every sheet has the same five fields. The **model line** is not to be shipped verbatim — it is the
tuning fork.

### THE THREE PRINCIPALS *(extended notes in §8)*

---

**`maren` — Warden Maren** · *Slot: the region's only generalist*

- **WHO.** Late fifties. The only person in Fallowmere paid to count, and she is one person with one
  pencil and a region. Field-trained, self-taught after that, better read than she lets on. Her real
  daily problem is **coverage**: which nodes she has physically walked this season and which she has
  not. Genuinely uninterested in how the player feels, which reads as respect.
- **HOW SHE TALKS.** Medium sentences, 90–160 characters, with a working scientist's hedging built
  into the grammar. She separates what she measured from what she suspects, out loud, every time.
  Unhurried. Only visibly pleased when a number surprises her.
- **TIC.** She gives the **age and provenance of a figure before the figure** — "Brackmarsh is three
  weeks old", "four seasons on that, so call it likely", "that's a guess and I'd write it as a
  guess", "one stump is nothing, forty is something".
- **NEVER.** Never tells the player what to do. Never treats the survey as anything but a board and
  a pencil that is usually out of date. Never lands an epigram outside her single licence. Never
  says "I'll hold the page" or any cousin of it. Never quotes a number she cannot source.
- **MODEL LINE.** *"Meadow Reach I walked myself, so I'll stand on that one. Brackmarsh is three
  weeks old and the three weeks were the wet ones. Take it as a floor, not a number."*

---

**`wick` — Wick** · *Slot: the rival who is wrong once and right at the end*

- **WHO.** Seventeen, second-year Cullbrand apprentice, quick and openly ambitious. He thinks in
  **documents** — intake sheets, grades, invoices, contract clauses — and cites them the way other
  people cite feelings. He wants to be impressive and is irritated that he wants it.
- **HOW HE TALKS.** Short declaratives, 60–130 characters, built entirely out of the only vocabulary
  anyone has given him. His sentences get shorter as he loses an argument. He concedes empirical
  points instantly, because conceding is cheap and it makes him harder to dismiss.
- **TIC.** Answers anything emotional with a figure, and **names a specific piece of paperwork and
  offers to show it** — "there's a printed sheet", "it's in the intake schedule under grade two",
  "I can get you a copy".
- **NEVER.** Never philosophises about nature. Never uses B1. Never concedes with a maxim — he
  concedes with a number. Never sentimentalises an animal. **And he is not right about everything:
  his act-2 Fenmaw claim is his error and Corbett corrects it** (§8, Appendix A).
- **MODEL LINE.** *"Company pays by the head. Doesn't ask whose. I'm grade four — eleven a head —
  and I'd be six by now if they'd given me the marsh route instead of this one."*

---

**`greaves` — Magnate Greaves** · *Slot: the institution*

- **WHO.** Sixty-odd, expensively educated, immensely wealthy, entirely courteous. Addresses the
  player as a counterparty rather than as a child. Cares about ownership and audit.
- **HOW HE TALKS.** The only speaker who builds complete periodic sentences with subordinate
  clauses. No contractions. 140–260 characters, delivered at a speed that assumes nobody will
  interrupt. Legal hedges: "forgive me", "as a matter of record", "the board's view".
- **TIC.** **He never puts himself in the agent slot.** Decisions belong to the contract, the board,
  the lawyers, the schedule. Every noun he touches becomes a class of asset within a clause or two.
  He says *we* for the Company and *I* for the money, consistently.
- **NEVER.** Never insults the player. Never expresses appetite or cruelty. Never raises his voice.
  Never speaks a sentence under six words (that register is Wick's). Never uses slang, or a
  metaphor. Never dignifies Maren's book by calling it a book — hers is *counting*, a verb; his is
  *the inventory*, a noun with a department behind it.
- **MODEL LINE.** *"Ours is called an inventory. It is audited twice a year by people I pay to
  disagree with me, and it balances to the individual, which hers — forgive me — cannot, because
  hers is one woman, one pencil, and a region."*

---

### GYM LEADERS AND CHAIN-CARRIERS

---

**`maribel` — Maribel** · Hearthollow, act 1

- **WHO.** Sixties, smallholder who breeds her own beast lines and fights out of them. Warm without
  being soft. She talks about creatures the way a stockwoman talks about stock she respects and
  would still sell.
- **HOW.** Short practical sentences in husbandry vocabulary — pelt, condition, feet, off her food,
  come on well, off my own line. Total indifference to type theory.
- **TIC.** **Names individuals before species, with an age attached** — "Old Nib, twelve this
  spring", "the one with the split ear", "she was mine as a chick".
- **NEVER.** Never explains a battle mechanic. Never says "specimen". Never talks about wild counts
  as though they were hers. Never mentions the survey. **STORY FIX: her spoken roster is THREE.**
  `data/gyms.json` is Bramblehog (A), Skir (A) and the signature Nibbin "Old Nib" (E); the current
  line lists Nibbin, Bramblehog, Skir *and then* Old Nib, which double-counts the Nibbin in the
  game's first gym.
- **MODEL LINE.** *"Bramblehog and Skir, both off my own line. And Old Nib. That's three. People
  come in expecting four and I've not fielded four since the bad winter."*

---

**`odo` — Odo** · Brackwater, act 2

- **WHO.** Forties. A working fisherman who happens to run a gym, and the least self-conscious
  person in the game. Cares about doing things in the right order.
- **HOW.** Slowly, with real gaps in it. Under twelve words a sentence. Marsh vocabulary is
  automatic — slack, ebb, channel, reed edge, deep edge. He treats a conversation the way he treats
  a tide: you wait, then it happens.
- **TIC.** **Times everything to water rather than clocks or seasons** — "after slack", "when the
  reed goes over", "two tides" — and breaks off mid-answer to look at the water, then picks the
  sentence back up where he left it.
- **NEVER.** Never hurries a sentence. Never uses a business word. Never boasts about the gym.
  Never explains metamorphosis as a lesson. Never counts anything himself — he hands the number to
  Hetty and says so.
- **MODEL LINE.** *"Wait for slack. Then it turns, and then you take it. — Hetty has the shallows
  figure. Hers is better than mine. I'm in a boat."*

---

**`vesper` — Vesper** · Bowerdeep, act 3 · *2 aphorism licences*

- **WHO.** Late thirties. A canopy scientist by temperament sitting on a council she finds
  exhausting. Completely used to being disagreed with in public, and enjoys the argument.
- **HOW.** Longer sentences than anyone else in Bowerdeep, because she pre-empts the objection
  before making her own point. Precise, faintly pedantic.
- **TIC.** **States the opposing case first, accurately, by name** — "Halder's case is that the
  buyers are already contracted, and that is a real case" — then adds exactly one number, with its
  source and date attached.
- **NEVER.** Never calls anyone a villain. Never makes a moral appeal when a count is available.
  Never says the canopy is sacred. Never uses B13 — no "we just price the same tree differently".
- **MODEL LINE.** *"Halder's order is three adults and he is not hiding it. My count is eleven
  breeding females in the high lines, taken in the last week of summer, from the ground, by me."*

---

**`sable` — Sable** · Cindershelf, act 4

- **WHO.** Forties, steppe-born, forge-adjacent. Blunt to the edge of rudeness without meaning any
  of it. Everything on her bench she caught herself and she states it as a fact about her bench.
- **HOW.** Short bursts with the gaps left in. No softeners, no small talk, no decoration. She
  understates by exactly one order of magnitude: a collapse is a nuisance, a burn is warm.
- **TIC.** **Answers with the shortest true sentence available and then stops**, leaving you to ask
  again — and borrows heat words for non-heat things ("that'll cool", "you came in hot").
- **NEVER.** Never explains herself twice. Never apologises. Never names the Cullbrand Company
  aloud. **Never appends a disclaimer to a fact** — the existing "which I mention as a fact about my
  bench, not about you" is exactly the move to cut.
- **MODEL LINE.** *"Pyrelisk Elder, off the west vents. Took me two seasons. There aren't many out
  there now."*

---

**`noct` — Noct** · Duskhollow, act 5 · *may spend one of the corpus's three one-word verdicts*

- **WHO.** Fifties, nocturnal by profession, quiet and privately amused. A Dark-type leader who
  finds the vale's reputation faintly silly is the whole point of them.
- **HOW.** **No line exceeds ten words and most sit under six.** Low, unhurried, plain words, no
  theatre at all. The register of someone who has not needed to raise their voice in years.
- **TIC.** **Defuses every attempt to make the vale mysterious with an ordinary explanation**, and
  refuses the observatory feud flat: "That's between them."
- **NEVER.** Never speaks portentously. Never says anything about darkness that is not a literal
  light level. Never counts anything — genuinely does not. Never elaborates when asked to.
- **MODEL LINE.** *"Dusk swallows. Come back at noon if you like. Won't help."*

---

**`bram` — Bram** · Cindershelf forge

- **WHO.** Late fifties. A smith who talks while working and expects you to keep up. Deep knowledge
  of stone and heat, no interest at all in creatures as creatures. Gruff and generous inside the
  same breath.
- **HOW.** Short imperative sentences broken by the rhythm of the work. He measures by touch and by
  household comparison: thick as a door, cart-sized, eight over.
- **TIC.** **Issues the imperative before any explanation** — "Put your hand flat on the floor. Go
  on." — and only explains once you have done it.
- **NEVER.** Never states a number he has not felt or measured himself. Never discusses the Company
  or the trade. Never philosophises about legacy — the relic beat is a job with a price and a
  cooling time. Never finishes a story in one visit; you come back.
- **MODEL LINE.** *"Hand flat. Go on. — That's not the forge, forge has been cold since first light.
  Vents come up and go. This doesn't go."*

---

**`sel` — Sel** · Brackwater ferry · *2 licences, `sel.tale.*` only · may exceed 200 chars*

- **WHO.** Sixties, same crossing his whole life, a talker and entirely aware of it. **He is the one
  character in the game who rambles**, and the rambling is the product — he charges for the
  crossing, the stories are free.
- **HOW.** Long digressive self-amused sentences that leave the subject, visit a person or a year,
  and come back late. Loosely joined with "and" and "anyway". *(Short sentences are permitted — the
  rule is about the SHAPE of the beat, not a ban on brevity.)*
- **TIC.** **Derails into a person or a year and returns with "Anyway"**; and he repeats himself
  across visits without noticing, contradicting his own detail by a foot or a year, which nobody
  corrects. He prices things, including free things.
- **NEVER.** Never delivers a moral. Never finishes a tale cleanly outside his two licensed lines.
  Never claims certainty about what is down there. Never says "That's not a saying. That's the
  accounting."
- **MODEL LINE.** *"Third's soft, fourth's going. Nobody'll drive new ones — pilings come out of the
  levy, levy comes off the channel figure, and the channel figure is, well. You've seen it. Anyway,
  I've told the harbourmaster. Twice."*

---

**`tolm` — Tolm** · Hearthollow, quest-giver

- **WHO.** Forties/fifties, four fields, permanently one season behind, and anxious about being
  misunderstood — so he over-explains the terms of any arrangement. He has been caught before.
- **HOW.** Short sentences he immediately qualifies, in farm vocabulary that never once reaches for
  an ecology word. He says *the ground*, not *producers*.
- **TIC.** **Restates a deal in his own words twice before he lets it stand**, and prices things
  against something physical ("that's a wagon of hay, that is"). Opens sentences with "Mind".
- **NEVER.** Never appeals to conscience. Never lets a deal stay vague. Never uses a technical term.
  **Never says "we'll compare books"** — he walks his own field and counts it himself, and that is a
  chore, not a ceremony.
- **MODEL LINE.** *"Twenty-four now, twenty-four at harvest, and the share comes off the crop and
  not off my pocket. Say it back to me, because I've been caught on that before."*

---

**`nessa` — Hetty** · Brackwater, quest-giver

- **WHO.** Thirties, cut to half hours by the fishery and controlled about how angry that makes her.
  Nobody asked her to survey the shallows and she does it anyway. Slightly defensive about that.
- **HOW.** Fast, clipped, extremely well informed. Interrupts herself to add a figure. Gets visibly
  excited about her own board and then embarrassed.
- **TIC.** **Corrects an imprecision the instant it happens, including her own** — "four — no, four
  and one that didn't take" — and refers to the board as a physical object: chalk, damp, a column
  she ruled crooked.
- **NEVER.** Never reveres the count. Never asks for pity. Never mentions the fishery without a
  figure attached. **STORY FIX: she must not re-teach the release verb** — Maren already taught it
  in this town, so Hetty assumes the player knows it and says only where to stand.
- **MODEL LINE.** *"Four in on the Brackmarsh side — not the channel, the Fenmaw works the mouth and
  it'll take a small one straight back off. My board's damp on that column, so read it in the light."*

---

**`halder` — Halder** · Bowerdeep, quest-giver

- **WHO.** Forties/fifties, silk merchant, and a good one, which in his case means he is honest
  about being a merchant. Honesty is a technique because it closes faster. He genuinely likes
  Vesper and says so.
- **HOW.** Warm, fluent, fast, with a sales rhythm: he asks a question and answers it himself.
  Opens with what he wants and what he will pay, before any pleasantry.
- **TIC.** **Trade units and delivery terms fall out of him unprompted** — bolt, hank, on the morning
  barge, pays on the day — and he names his own margin before anyone asks for it.
- **NEVER.** Never argues ecology; he defers to Vesper's number by name. Never haggles with the
  player. Never conceals a term. Never says "that's the shape of it", and never uses B13.
- **MODEL LINE.** *"Three adults, my price today, out on the morning barge. Vesper says three is
  more than the canopy replaces in a year and she has the count for it. I'm still asking."*

---

**`pell` — Pell** · Bowerdeep, quest-giver

- **WHO.** Sixties/seventies. Walks the exposed stretch of road out to the eastern stair alone at
  night and has done for forty years. Stopped being frightened decades ago. He likes the moths, and
  finding that embarrassing is the only thing that gets past his guard.
- **HOW.** Very short sentences with the pauses left in. Flat affect. Kindly. He trails off rather
  than concluding.
- **TIC.** **Talks in walking instructions even when nothing is being walked** — "keep left", "stop
  there", "move when I move" — and gives the state of the road as a number of lamps out.
- **NEVER.** Never romanticises the dark. Never talks about himself for longer than a clause. Never
  explains a mechanic. **His road is the exposed stretch to the eastern stair and nothing else** —
  the 211 lamps on the town walk are Whit's, and the two must keep deferring to each other.
- **MODEL LINE.** *"Four out past the second bend. Keep left of me. — I'll miss them, when they go.
  Anyway. Kit's in the box."*

---

**`gerta` — Gerta** · Cindershelf, quest-giver · *keeps the tenure opener*

- **WHO.** Fifties, thirty-one years on one shaft, self-taught obsessive about exactly one
  measurement. Nobody paid her to start and nobody can make her stop. Embarrassed by her own
  enthusiasm and visibly delighted to be asked.
- **HOW.** Talks fast and technically; sentences pile up clauses because she is trying to get the
  whole method in before you leave. Stops dead when she is off the numbers. Teaches by sequence.
- **TIC.** **Every reading arrives with its units and its conditions attached** — "eight over, on the
  wall not the air, one reading a shift" — and she cannot state a figure without naming who took it
  and when.
- **NEVER.** Never treats her log as anything but a habit she failed to break. Never claims to know
  what is under the shaft. Never rounds. Never lets Bram's guesswork stand uncorrected.
  **STORY FIX: her quest is the STEPPE survey** — `maren.greeting.act4` calls it a "shaft survey"
  and is wrong.
- **MODEL LINE.** *"Eight over. On the wall, not the air — air's no good, it moves. One reading a
  shift, me, since before the fourth shaft. Twice it went to fourteen and I want to tell you about
  the twice."*

---

**`ives` — Ives** · Duskhollow, quest-giver

- **WHO.** Late twenties/forties. Keeps the ground census at the observatory. Brisk, faintly
  superior, openly competitive with Orrin in a way they would deny. Cares that categories are right
  more than about what is in them.
- **HOW.** Clean short sentences with an editor's pedantry, plus the occasional parenthetical.
  Dates everything mentioned.
- **TIC.** **Corrects a category out loud every single time**, including ones nobody made — "not
  missing; dormant, and the words are not interchangeable", "identity, not species".
- **NEVER.** Never concedes a point to Orrin within his hearing. Never uses a poetic figure. Never
  lets "count" and "census" be used as synonyms. Never simplifies for a listener.
- **MODEL LINE.** *"Dormant. Not absent, not missing — dormant, and the card says so because I made
  the card say so. An absent Wispurr in summer is a Wispurr that is asleep."*

---

**`orrin` — Orrin** · Duskhollow, quest-giver

- **WHO.** Sixties, shelves rather than eyepiece, the most formally educated speaker after Vesper.
  Slow, courteous, faintly apologetic. Complains mildly about the light in most conversations.
- **HOW.** Long sentences with subordinate clauses and no contractions. He asks permission before
  telling you a thing at length, and he **reads aloud from documents rather than summarising them**.
- **TIC.** **Describes the physical state of a record before its contents** — "the ink's browner on
  this side", "a hand I cannot date", "third hand, ninetieth year" — and volunteers the limits of
  his own record without being pressed.
- **NEVER.** Never dramatises the vanishing. Never boasts that the archive is the only place it
  exists. Never speaks in one-sentence paragraphs. Never hands over a document ceremonially. **Never
  uses B14** — the "they stop being where the instrument points" inversion is cut.
- **MODEL LINE.** *"May I read it to you? The hand is the third one, and it is browner on the left
  where somebody rested a cuff. Two hundred and six entries. Then this page, and then the next
  page, and the next."*

---

### HEARTHOLLOW — GENERIC AND AMBIENT

---

**`innkeeper-hearthollow` — Aldis** · *Slot: WARM*

- **WHO.** Fifties. Runs the only beds in a farming town and knows everyone's business without
  trading in it. Comfortably, efficiently maternal.
- **HOW.** Medium chatty sentences about food, weather and who else is in tonight. Ends on a
  question she expects answered.
- **TIC.** **Tells you what she has already done for you before you can ask** — boots by the fire,
  kettle on, second blanket found — and does not accept thanks for any of it.
- **NEVER.** Never explains the rest mechanic in mechanical language ("two ticks off the season
  meter" is not a sentence a person says). Never discusses creatures. Never leads with money.
- **MODEL LINE.** *"Boots by the fire, they were wringing. There's bread if you want it and I'll not
  charge you for the second blanket. Who's that up at the station with her, the lad?"*

---

**`vendor-hearthollow` — Kett** · *Slot: TRANSACTIONAL*

- **WHO.** Forties. Sells snares, salve, tonic and bait mats to people about to walk into a meadow.
  Complete command of her own stock, and no interest whatsoever in who you are.
- **HOW.** Short imperative-heavy sentences, no greeting, no wasted breath. She stops talking into
  the silence rather than filling it.
- **TIC.** **Quotes a price and immediately names what it is cheaper than**, and closes a
  transaction with a stock note muttered to herself rather than to you.
- **NEVER.** Never lectures about the food web — "ask the warden". Never asks a question. Never runs
  the four-item list-then-verdict cadence.
- **MODEL LINE.** *"Snares and salve. Tonic if you're the sort that needs it. Weighted ones when the
  smith sends them up and he's sent none since spring, so don't ask twice."*

---

**`hearthollow-elder` — Judd** · *Slot: FREE — carries the BORING, REPEATS and WRONG quotas*
*(may exceed 200 chars)*

- **WHO.** Seventies. Drove cattle up Meadow Reach for a working life and now sits and watches other
  people do it. Genuinely a bit boring, and perfectly content. **He is the proof that not everyone
  in this game is an aphorist.**
- **HOW.** Long meandering sentences with **no payoff at the end of them**. Present tense for events
  fifty years gone. He beats trail off or stop mid-thought.
- **TIC.** **Anchors everything to droving years and to the same three anecdotes**, one of which he
  will tell twice, and gets one detail slightly wrong each time — fifty years, fifty-two, near
  enough. Opens with "when I was droving" whether or not it is relevant.
- **NEVER.** Never states a thesis about ecology. Never lands a closing line. Never explains a
  mechanic. Never bitter about being old. **Contradicted by Tolm on where the old gate was.**
- **MODEL LINE.** *"You'll be off up the Reach, then. I drove cattle up there. Not this gate — the
  old gate, before they moved it, and they didn't need to move it. Grass does well up there. Always
  has. Which is — anyway. Mind the gate."*

---

**`hearthollow-child` — Tibb** · *Slot: CHILD*

- **WHO.** About nine. Certain about everything and wrong about a lot of it, and not remotely
  intimidated by adults.
- **HOW.** Run-on sentences strung with "and", then one flat short one. Hard unsignalled changes of
  subject.
- **TIC.** **Reports what an adult said and then announces whether she intends to obey it.**
- **NEVER.** Never says anything wise. Never uses an adult's technical vocabulary correctly. Never
  ends on a moral. **Never delivers the "I thought it would have drawings" line as a punchline** —
  it is a complaint, not a joke.
- **MODEL LINE.** *"There's a Nibbin under the mill step and it's called Button. Maren wrote it in
  as one Nibbin. I said its name and she wrote one Nibbin. Da says I'm not to ask her again. I'm
  going to ask her again."*

---

**`hearthollow-farmhand` — Rask** · *Slot: LACONIC*

- **WHO.** Twenties. Two hands and four fields, permanently behind and cheerfully unbothered by it.
- **HOW.** Terse, physical, present tense. Very short sentences and nothing longer than two syllables
  where one will do. Every sentence contains a quantity of labour.
- **TIC.** **Reports damage and repair by count and location** — "third time, same post" — and
  converts any subject into how many hands and how many days.
- **NEVER.** Never speculates. Never asks the player a question. Never mentions the survey. Never
  philosophises about what the Loamunder do for the soil; he would find that funny.
- **MODEL LINE.** *"West gate again. Third time, same post. Harvest in six weeks and I've got two
  hands."*

---

**`hearthollow-forager` — Tamsin** · *Slot: OVER-EXPLAINER*

- **WHO.** Thirties/forties. Self-taught tracker, the town's patient teacher, and a congenital
  over-explainer: she defines terms nobody asked about and restates the same fact two ways to be
  safe. Finds people considerably less legible than animals.
- **HOW.** Long sentences, because they are doubled. She checks you are following and actually waits
  for the answer.
- **TIC.** **Breaks off mid-explanation to ask "with me?" or "seen one?"**, and says "which is to
  say" before restating the previous clause in worse words.
- **NEVER.** Never turns a sign into a metaphor. Never addresses the player as a pupil in the
  aphoristic register (B7 permits Maren, Gerta, Bram and Orrin — Tamsin explains, she does not
  instruct). Never guesses aloud. Never says anything in one sentence that she could say in two.
- **MODEL LINE.** *"A scrape's where something's rubbed the bark off. Which is to say not dug — dug
  is different, dug is a cast. People mix those two up constantly. With me?"*

---

**`hearthollow-fenceman` — Mott** · *Slot: ANNOYING — carries the FAILS-TO-ANSWER quota*

- **WHO.** Fifties/sixties. Four miles of fence mended twice a year and never once ahead of it.
  Hearthollow's designated pain: literal, monosyllabic, and resentful of anyone who writes rather
  than works.
- **HOW.** Under eight words a sentence. Most of them refusals. Volunteers nothing.
- **TIC.** **Answers any question about numbers by producing a physical object instead.**
- **NEVER.** Never gets angry. Never asks about you. Never accepts that the fence and the count are
  connected. **Never delivers "Maren says put a count on it, I say I put a post on it"** — the joke
  is that he does not engage, not that he has a comeback.
- **MODEL LINE.** *"Warden wants a number on it. I've not got a number. I've got a post. Post's in."*

---

### BRACKWATER — GENERIC AND AMBIENT

---

**`innkeeper-brackwater` — Elsbet** · *Slot: ANNOYING (deadpan)*

- **WHO.** Forties. Rooms built over moving water, thoroughly used to guests who arrive nervous
  about it. Quietly amused by people and offering them no support at all.
- **HOW.** Short sentences with a flat punchline she does not sell. Warm on paper, deadpan in the
  mouth, which is the joke of her.
- **TIC.** **Pre-empts the complaint before you make it** — "it sways; you'll sleep" — and quotes
  previous guests verbatim in a tone that gives them nothing.
- **NEVER.** Never reassures sincerely. Never uses more words than the sentence needs. Never mentions
  the fishery levy. Never gets excited.
- **MODEL LINE.** *"It sways. You'll say you won't sleep. The last one said that and I heard him
  through the floor by ten."*

---

**`vendor-brackwater` — Hild** · *Slot: OVER-EXPLAINER*

- **WHO.** Fifties. Marsh stall, reed bait by the bundle, genuinely funny about the half of the year
  her stock sits dead. Carries a running seasonal grievance she does not expect anyone to fix.
- **HOW.** Medium sentences that end on what did not sell rather than what did.
- **TIC.** **Tells you what she cannot sell before she tells you what she can**, and blames the
  season for everything, including things the season did not cause.
- **NEVER.** Never explains the levy — "that's Odo's figure, not mine". Never sells you something she
  thinks will not work. Never uses a contract word. Never oversells.
- **MODEL LINE.** *"Reed bait's for Grazers, and out here a Grazer's a Reedrick, and a Reedrick is a
  summer animal, so that bundle has sat there since the thaw looking at me. Salve, though. Salve
  moves."*

---

**`brackwater-dockhand` — Gunn** · *Slot: WARM*

- **WHO.** Thirties. Lands the barge, works next to a barge, and is therefore loud — even his asides
  land as announcements. Cares about tide, timber and weight, in that order, and about his wages.
- **HOW.** Short flat declaratives at a volume the room does not require. Physical detail, and a
  challenge in it.
- **TIC.** **Opens every beat with the state of the water or the barge, relevant or not**, and
  invites you to try it yourself.
- **NEVER.** Never lowers his voice. Never discusses prices as economics — for Gunn it is wages, and
  he says wages. Never speculates about the idols. Never gives an opinion on the contract.
- **MODEL LINE.** *"Slack in an hour! — You try putting sixty ton alongside on a running tide and
  see how precious you feel about it."*

---

**`brackwater-netmender` — Parnel** · *Slot: WRONG*

- **WHO.** Sixties. Mends and cuts nets on the boards and never gets in a boat. The cast's genuine
  expert on something the player will never need, impatient, and openly bored by questions about
  monsters. **She has a folk explanation and holds it against evidence.**
- **HOW.** Medium sentences that veer into mesh gauge whatever the question was. She says her key
  assertion twice with "and that's all it is" between the halves.
- **TIC.** **Answers everything by talking about mesh** — coarse, fine, what she has re-cut and why —
  and re-answers a question you did not ask. "You'd not know", said flatly and without malice.
- **NEVER.** Never says "I don't know". Never cites anyone else's number. Never changes her mind
  inside a conversation. Never counts anything — she cuts to what comes up, which is not a count and
  she will say so. **Never delivers "a net is a record of the fishery".**
  **Contradicted by Hetty's board and by Odo: the mesh moved because the count moved, not because
  the water is colder.**
- **MODEL LINE.** *"Three re-cuts in six years and everyone tells me it's the count. It isn't the
  count. Water's colder than it was and that's all it is. Nobody's written that down, mind, because
  nobody measures the water."*

---

**`brackwater-child` — Jem** · *Slot: CHILD*

- **WHO.** About eight. Hetty's nephew, already on the boats, fearless and completely uninterested in
  the adults' economy.
- **HOW.** Short bursts, nothing above ten. Blurts, then contradicts himself.
- **TIC.** **States a rule an adult gave him and reports breaking it in the very next sentence**,
  with no sense that the two are connected.
- **NEVER.** Never admits to being frightened. Never explains himself. Never asks a follow-up. Never
  repeats an adult's ecological explanation correctly. Never says anything eerie about the idol on
  purpose. **He must not spoil the eyeless reveal — see Appendix A.**
- **MODEL LINE.** *"Sel says don't trail your hand. I trail my hand. Auntie Hetty's got a board with
  chalk on it and I'm not allowed to touch that either."*

---

**`brackwater-elder` — Ulla** · *Slot: LACONIC — carries the REPEATS quota*

- **WHO.** Eighties, born on the stilts. Precise about exactly one thing and vague about everything
  else. She has said all of this before and expects to say it again.
- **HOW.** Three or four words, then she waits for you to go away. Long implied pauses. Pressed, she
  repeats the identical fact with a number in both halves.
- **TIC.** **Whatever she is asked, she returns to her post and the mark on it, and refuses to
  interpret it** — "I don't say what it means. I say where the line is."
- **NEVER.** Never speculates about what is under the water. Never tells the whole of her mother's
  story about the pilings. Never uses the warden's vocabulary. Never uses a subordinate clause.
- **MODEL LINE.** *"That mark hasn't moved. Not once. Drought year, flood year, same mark. Same
  mark. My nephew says I cut a new one and forgot. I did not cut a new one."*

---

**`brackwater-buyer` — Corbett** · *Slot: TRANSACTIONAL — carries the BORING quota · INSTITUTIONAL,
surname only · may open with a bare name*

- **WHO.** Fifties. Prices the whole season off a clause in a sixty-year contract, and every wage in
  the town moves when he signs. An incomer after thirty years and still read as one. Institutional,
  careful, and faintly defensive because of it.
- **HOW.** Long qualified sentences with clause numbers in them that never quite contain his own
  opinion. No local dialect.
- **TIC.** **Distinguishes the contract figure from the actual count every single time, quoting the
  clause's own language** — "the contract says channel; it does not say marsh" — and notes how long
  the clause has stood unamended.
- **NEVER.** Never says what he personally thinks the price should be. Never admits the contract is
  bad. Never cites Hetty's board as evidence even when it is better than his. Never volunteers a
  figure he is not obliged to give. Never shows warmth.
  **He is the one who corrects Wick's Fenmaw error (Appendix A).**
- **MODEL LINE.** *"Clause four says channel. It does not say shallows and it does not say marsh,
  and it has not been amended in sixty years. People bring me shallows figures every spring as
  though I might not have read my own contract."*

---

### BOWERDEEP — GENERIC AND AMBIENT

---

**`innkeeper-bowerdeep` — Yule** · *Slot: TRANSACTIONAL*

- **WHO.** Thirties/forties. Rents by the day in a town that works at night and is thoroughly tired
  of explaining why. Always in the middle of something.
- **HOW.** Clipped procedural sentences: rule, then reason, then payment. Fragments, because she is
  counting linen or oil while she talks to you, and she resumes the sentence where she dropped it.
- **TIC.** **States a house rule and its reason in one breath, then asks for the money**, and says
  "day" where every other town says "night".
- **NEVER.** Never chats. Never apologises for a rule. Never asks a personal question. Never says
  anything about the night market being romantic.
- **MODEL LINE.** *"Day rate. We rent by the day because the night's when the market's open — four,
  five, that's the linen — so it's the day rate, and it's now."*

---

**`vendor-bowerdeep` — Zeb** · *Slot: ANNOYING*

- **WHO.** Thirties/forties. Night market, nocturnal and faintly manic with it. Patter merchant who
  keeps you at the stall one moment longer and exaggerates for effect.
- **HOW.** Fast clipped run-ons studded with rhetorical questions. Jokes with a slightly wrong
  landing. He interrupts himself to greet passing customers and resumes one word late.
- **TIC.** **Asks you a question and answers it himself before you can open your mouth** — then
  audibly halves his own claim when nobody bites.
- **NEVER.** Never goes quiet. Never opens before dusk. Never admits a product is poor. Never says
  anything reverent about silk — it is stock. Never mentions the canopy count posted ten feet away.
- **MODEL LINE.** *"Master snares? Twice a year, they turn up here. Well — once. Twice sounds
  better, and one of the two was a Tuesday. Evening! — one of the two was a Tuesday."*

---

**`bowerdeep-logger` — Garrow** · *Slot: WARM*

- **WHO.** Forties. Large, cheerful, independent feller with a ruined back who sells to whoever buys.
  Allergic to the way the Company phrases things, and not remotely grim about the trade.
- **HOW.** Medium sentences, no polish, physical detail in every one. Jokes at his own expense.
- **TIC.** **Reports work in body terms** — what it costs his back, his hands, his knees — folded
  into an otherwise unrelated sentence.
- **NEVER.** Never calls the Company evil. Never talks about silk. **Never uses the "Cullbrand buys
  what I cut, Cullbrand doesn't cut it" argument** — that case belongs to Hurst's crew, and having
  two loggers make the identical case is one of the corpus's real defects.
- **MODEL LINE.** *"Knees have gone, mostly. I can still put one down where I want it, I just can't
  get up after. My wife's stopped asking how the day was."*

---

**`bowerdeep-silkwinder` — Cass** · *Slot: FREE — the proud technician*

- **WHO.** Twenties/thirties. Works the winding house. Proud of the craft, technical about thread in
  a way that assumes you are keeping up, mildly contemptuous of people who talk about thread without
  having handled it.
- **HOW.** Short exact energetic sentences at speed, full of tactile specifics she does not define,
  because in Bowerdeep you are assumed to know them.
- **TIC.** **Tests things by breaking strain in her head** — "you'd not snap that, not with both
  hands" — **and describes a property by touch**, "you can feel the difference through a glove".
- **NEVER.** Never treats the canopy count as her business — "that's Vesper's". Never slows down.
  Never explains what silk is for. Never admits the winding house makes mistakes.
- **MODEL LINE.** *"Adult line takes a dye and holds a load. Juvenile's second grade and we won't
  pass it above second grade, whatever the stall told you it paid for it."*

---

**`bowerdeep-child` — Fitch** · *Slot: WRONG*

- **WHO.** About eight to eleven. Night-market kid, delighted by the migration and by anything he is
  forbidden to do. Precocious, showing off adult vocabulary he half understands.
- **HOW.** Run-ons with "and then", plus sound effects. He narrates rather than explains, and loses
  his own thread halfway.
- **TIC.** **Begins with something he genuinely overheard at a stall and finishes with something
  obviously invented**, and states a species' type pair or life-stage wrongly with total confidence.
- **NEVER.** Never admits he does not know. Never gets a type pair right. Never completes a taxonomic
  sentence correctly — **the accurate metamorphosis explanation belongs to Maren's tutorial alone
  (B10)**. Never says he is frightened of the east stair; he says he is not allowed.
  **Contradicted on the record by Cass or Vesper.**
- **MODEL LINE.** *"Gloomgrub are the little ones and they're Poison and Fire and then they're not,
  they're — anyway the lamps all go out at once and everyone shouts and I'm not allowed on the east
  stair."*

---

**`bowerdeep-elder` — Dunstan** · *Slot: OVER-EXPLAINER — carries the BORING quota · may exceed 200
chars*

- **WHO.** Seventies/eighties. Has lived on the floor, the walk and the canopy in that order and
  treats the town's history as his own biography. Formal, faintly grand, mildly performative — he
  enjoys being consulted and takes his time about it.
- **HOW.** Long stately balanced sentences that nobody interrupts because he does not pause. Courtly
  register, never lowered.
- **TIC.** **Locates everything by level** — "that's a floor matter", "on the walk we'd say" — and
  measures the present against one specific earlier decade. "In my day", without irony.
- **NEVER.** Never gossips. Never discusses money. Never uses a number. Never claims to understand
  the trade's figures — he considers that a shopkeeper's business. **Never concedes that Whit is
  older than he is.**
- **MODEL LINE.** *"On the walk we would have called that a floor matter, and on the floor they
  would have sent it up to the walk, and in my day a person knew which, and Whit will tell you he
  remembers it differently, and Whit is younger than me."*

---

**`bowerdeep-lampkeeper` — Whit** · *Slot: LACONIC — carries the FAILS-TO-ANSWER and REPEATS quotas*

- **WHO.** Seventies. Deaf. Lights the two hundred and eleven lamps on the town walk and counts
  compulsively out loud. A bit of a bore on the subject, and quietly competitive with Pell about
  whose stretch is harder.
- **HOW.** Short sentences broken by counting, with numbers in them. He frequently answers the
  *previous* question rather than the current one.
- **TIC.** **Counts aloud mid-sentence, loses his place, and restarts the count rather than the
  sentence** — and distinguishes his walk from Pell's road in every conversation, unasked.
- **NEVER.** Never goes out to the eastern stair; that is Pell's, and he says so. Never reflects on
  light or dark as a metaphor — lamps are objects he maintains. Never leaves a number unrounded.
  Never sits down. **Never repeats Pell's lines about the dark road.**
- **MODEL LINE.** *"Forty-one on the lower walk — forty-two — no. Start again. Pell has the stair.
  That's the hard one, everyone says, and I've never asked him whether it is."*

---

### CINDERSHELF — GENERIC AND AMBIENT

---

**`innkeeper-cindershelf` — Berit** · *Slot: WARM*

- **WHO.** Forties/fifties. Free hot water and rooms that shake. Hospitable in a slightly rueful way
  about a town on the way down, and proud of exactly one thing.
- **HOW.** Medium sentences with a sigh built into the middle of them. She offers a choice and tells
  you which one people actually pick.
- **TIC.** **Brings the subject back to the water within two sentences whatever the subject was**,
  and refers to the vents the way other towns refer to weather.
- **NEVER.** Never mentions the Company payout. Never complains about a guest by name. Never
  predicts the town's future. Never asks how you are and then listens to the answer.
- **MODEL LINE.** *"Vent side's warmer and it shakes; other side's quiet and it's cold. People say
  quiet and then they move. Water's hot out of the ground either way — that's the one thing here
  that costs nobody anything."*

---

**`vendor-cindershelf` — Annis** · *Slot: TRANSACTIONAL*

- **WHO.** Sixties. The last shop standing after the Company store shut. Dry, unsentimental about it,
  and her prices are high and she will tell you exactly why without apologising.
- **HOW.** Short flat sentences with nothing behind them. A shrug built into the grammar.
- **TIC.** **Names what she no longer stocks rather than what she has** — "no weighted ones since the
  contract closed" — and still calls the boarded Company store "next door".
- **NEVER.** Never blames the customer for prices. Never says Greaves' name. Never pretends business
  is good. Never predicts a recovery. Never asks for sympathy.
- **MODEL LINE.** *"Ash bait, and it's the only thing an Ashvole will look at, so there's no cheap
  one to offer you. No weighted snares since the contract closed. Prices are the prices."*

---

**`cindershelf-miner` — Snell** · *Slot: WRONG*

- **WHO.** Thirties/fifties. Deaf on one side from thirty years of shaft work, so he talks loud and
  asks you to repeat yourself. Blunt, funny without trying to be. **Practically superstitious inside
  a safety culture, and he dislikes being asked about the warm shaft.**
- **HOW.** Very short sentences, often with the subject dropped. He describes temperature by what it
  does to his hands rather than by degrees.
- **TIC.** **Repeats your last word back as a question before answering** — "Warm? Aye, warm."
- **NEVER.** Never speaks a long sentence. Never discusses the Company. Never claims to understand
  the log. Never completes a sentence about what is under the third shaft.
  **He is wrong about the heat — he says it comes off the vents, and Gerta's thirty-one years of
  flat readings say it does not, and he defers to her without following her.**
- **MODEL LINE.** *"Warm? Aye, third's warm. Comes off the vents, that. — Hands know before I'm down
  the second ladder. Gerta's got it to the degree. Ask her, I'll get the number wrong."*

---

**`cindershelf-shafthand` — Nunn** · *Slot: OVER-EXPLAINER*

- **WHO.** Twenties/forties. Does the worst jobs on the shaft head, wants out of this town, and is
  delighted to have an audience for once. Grievance-driven at a low steady level that never boils
  over.
- **HOW.** Long sentences chained with "so" and "right", with a cost bolted on and an unsolicited
  safety caution tacked on the end.
- **TIC.** **Begins with "Right —" and ends with a warning** — "mind the loose bit" — and attaches a
  price or a rate to whatever he mentions.
- **NEVER.** Never stops early. Never assumes you know a term. Never expresses wonder at the shrines
  — "we didn't put them there and we don't move them". Never gets sentimental about the warm shaft;
  he finds Bram and Gerta both exhausting. Never says anything cynical about the Company out loud.
- **MODEL LINE.** *"Right — vent opens ground, ground bakes, we cut it, housing goes up behind the
  shaft, which is why the whole east row's on a slant. My house settles an inch a year and there
  isn't a man here will put a price on that. Mind the loose bit."*

---

**`cindershelf-elder` — Ebba** · *Slot: FREE — carries the REPEATS quota*

- **WHO.** Eighties. Sixty-two years under the shelf across four contracts, three of them good.
  Matter-of-fact about boom and bust with no nostalgia in it at all, and finds company men funny
  rather than infuriating.
- **HOW.** Short flat sentences using no word she would have to explain. A punchline she does not
  signal.
- **TIC.** **Grades years on a private scale and names contracts by their number**, not by the
  company that let them — "that was a three-shaft year", "the second one, not the third".
- **NEVER.** Never says the crash was anyone's fault. Never uses a technical or ecological word.
  Never opens with her tenure as a credential. Never criticises the Company outright. Never mentions
  her own bonus. Never talks about the fourth contract.
- **MODEL LINE.** *"Four contracts. Three of them good. I'm not saying which three, and I've been
  not saying it for a while now, and people have stopped asking."*

---

**`cindershelf-child` — Cob** · *Slot: ANNOYING (CHILD)*

- **WHO.** About seven to ten. Obsessed with the warm floor and the cart-sized shrine, bored by the
  mine itself, and will not leave you alone.
- **HOW.** Short excited sentences, one idea each, superlatives everywhere and no measurements.
- **TIC.** **Ranks things compulsively — loudest, biggest, warmest — and gets the ranking slightly
  wrong**, measuring everything against a cart.
- **NEVER.** Never gets scared. Never repeats a grown-up's explanation of the heat. Never mentions a
  count. Never mentions the closed store or anyone leaving. Never uses a number or a unit.
- **MODEL LINE.** *"Sable's Pyrelisk is the loudest thing in this town and the vents are in this
  town. The shrine's bigger than a cart. Bigger than two carts. Do you want to feel the floor?"*

---

**`cindershelf-worker` — Rowe** · *Slot: LACONIC · INSTITUTIONAL, surname only*

- **WHO.** Forties. Ex-west-scarp crew. Hit the contract weight in four years instead of six and took
  the bonus. Stayed when the crew left because his wife is from here. Flat, unapologetic, neither
  proud nor ashamed, and he refuses pity and absolution with equal firmness.
- **HOW.** Short declaratives that stop just short of self-justification. He states one plain fact
  about himself and then simply stops, leaving the silence. Crew job-words come out automatically:
  weight, run, pull-out.
- **TIC.** **States his own part plainly and then closes off the follow-up** — "I'm not going to tell
  you I wasn't."
- **NEVER.** Never asks for absolution. Never uses the word sorry. Never names Greaves as the cause.
  Never blames a foreman. Never romanticises the steppe. Never asks the player what they think.
- **MODEL LINE.** *"Overalls are company. Company's gone. I was on the crew and I'm not going to tell
  you I wasn't."*

---

### DUSKHOLLOW — GENERIC AND AMBIENT

---

**`innkeeper-duskhollow` — Effie** · *Slot: ANNOYING*

- **WHO.** Thirties. Took the place on recently, still mildly resentful of the open-shutter rule, and
  complies with it anyway. Quick and wry; she complains cheerfully at speed and always finishes by
  obeying.
- **HOW.** Medium sentences that start in the middle of a dispute. She redirects the complaint.
- **TIC.** **Blames the observatory affectionately for small inconveniences and cites the exact rule
  she is obeying while obeying it** — "don't argue with me about it, argue with them".
- **NEVER.** Never treats the deepening dark as an omen — that is Idony's beat and Idony has the bills.
  Never speculates about the Sanctum. Never keeps you talking.
- **MODEL LINE.** *"Shutters stay open. Not my rule — theirs, rule eleven, and I can quote it because
  they made me read it when I bought the place. Two ticks. Don't argue with me, argue with them."*

---

**`vendor-duskhollow` — Hesk** · *Slot: TRANSACTIONAL — carries the FAILS-TO-ANSWER quota*

- **WHO.** Sixties. Sells lamps, oil, tonic and the occasional master snare, largely by feel in a
  dark shop. Sceptical, unhurried, understated, and deliberately incurious.
- **HOW.** Medium sentences that decline to be impressed. Short price-led answers.
- **TIC.** **Explicitly declines to speculate, every single time** — "I don't ask and they don't say"
  — and tells you what a thing is for before she tells you what it costs.
- **NEVER.** Never speculates about the observatory. Never discounts. Never oversells. Never treats
  the deepening dark as anything but demand.
  **STORY FIX: the whole-autumn-stock trade belongs to Ingram, not to her.** The current text gives
  the identical claim to both, which is a contradiction. Hesk's version becomes a grumble that the
  observatory buys its lamps *direct from Ingram* and walks past her door to do it.
- **MODEL LINE.** *"That's for the wick, not the fill; you'll want the other tin. — They buy Ingram's
  direct. Walk past this door to do it. I don't ask and they don't say."*

---

**`duskhollow-astronomer` — Bly** · *Slot: LACONIC*

- **WHO.** Twenties/thirties. Junior at the observatory, doing the night hours everyone senior has
  aged out of. Sleep-deprived, dryly funny about it, and gossips about Ives and Orrin with obvious
  enjoyment while refusing to take a side on the record.
- **HOW.** Medium sentences that tail off rather than conclude. He talks about the labour rather than
  the sky.
- **TIC.** **Reports things as log entries with a time attached** — "third hour, nothing; fourth
  hour, nothing" — and mentions what hour of *his* night it is.
- **NEVER.** Never explains the vanishing; that is Orrin's. Never speaks in awe of the sky — it is a
  shift. Never takes a side between Ives and Orrin on the record. Never claims a sighting he did not
  log himself. Never calls the margin book a census; that is Ives's word and he finds the argument
  tedious.
- **MODEL LINE.** *"Third hour, nothing. Fourth hour, nothing. Ives calls it a census. Ives calls it
  a census *at* me. At four."*

---

**`duskhollow-elder` — Idony** · *Slot: WRONG — carries the REPEATS quota*

- **WHO.** Seventies. Vale-born, contrarian by constitution, dry and thrifty. She has watched the
  vale get darker and can prove it out of a drawer — and she disagrees with the town's consensus
  about *why*, and with the observatory's chart, and with you.
- **HOW.** Sentences that begin mid-argument, mostly about cost. Short.
- **TIC.** **Proves every claim with a household expense** — oil bought, wicks trimmed, bills kept —
  and disagrees with a named person in the first clause.
- **NEVER.** Never suggests the dark is supernatural. Never mentions the Sanctum. Never uses a word
  she has heard at the observatory. Never uses "dark" as a mood word. Never agrees with anyone,
  including the player, and never concedes without a counter-claim attached.
  **Contradicted by Pinder's chart and by Orrin.**
- **MODEL LINE.** *"Whatever Bly says. I bought four jars in the year I was married and I bought
  nine last year, same lamps, same rooms, and I have kept every bill, and nine is nine."*

---

**`duskhollow-child` — Fay** · *Slot: CHILD*

- **WHO.** About seven or eight. Wants a Wispurr and has no working concept of a season as a
  constraint. The youngest voice in the game and the least reasonable.
- **HOW.** Short aggrieved sentences, most of them requests, delivered with a wheedle. Pleasant
  rather than bratty.
- **TIC.** **Proposes a bargain nobody agreed to and then proceeds as though it were agreed**, and
  complains that everything takes too long.
- **NEVER.** Never understands migration correctly. Never accepts "wait" as an answer. Never mentions
  the shutters rule without resenting it. Never mentions the Sanctum. **Never delivers a wistful
  line about the margin book.**
- **MODEL LINE.** *"If I get one in winter I'll keep it in the shed and that's settled. Mother says
  winter. Winter takes forever. It's been nearly a week."*

---

**`duskhollow-lampwright` — Ingram** · *Slot: OVER-EXPLAINER — carries the BORING quota*

- **WHO.** Fifties. Makes lamps and presses his own oil for a town forbidden to burn them after dark,
  deadpan about the absurdity and mildly contemptuous of anything cheaper. Craft-proud and precise.
- **HOW.** Medium sentences with specifications embedded whether or not you asked. Specification
  first, social remark second, if at all.
- **TIC.** **Volunteers a specification unprompted** — strainings, burns to the fill, wick gauge —
  and criticises rivals by naming the process they skip rather than the maker who skips it.
- **NEVER.** Never says where the observatory puts his lamps; he is not told and will not guess.
  Never discounts. Never criticises the rule. Never talks about creatures at all. Never sells to the
  night market.
- **MODEL LINE.** *"Pressed, strained, strained again. Four burns to the fill and I'd stand on four.
  Bowerdeep strains it the once and puts 'strained' on the jar. I'll not be drawn further than that."*

---

**`duskhollow-shepherd` — Alwin** · *Slot: WARM · portrait reassigned to `npc-farmer`*

- **WHO.** Forties/sixties. Grazes a flock on thin dark ground and is quietly smug that it works when
  nobody believes it will. Likes his flock more than he likes people, and is braced for disbelief.
- **HOW.** Calm, slow, medium sentences with nothing hurried in them. Agrarian vocabulary. He begins
  by heading off your doubt.
- **TIC.** **States something implausible about the flock and then says nobody believes it**, and
  answers doubt by reporting the flock's actual condition — "they're carrying weight, so".
- **NEVER.** Never fears the dark. Never complains about predators. Never treats the shut Sanctum
  gate as a mystery — it is a gate on his walk to work and he walks past it. Never speculates. Never
  volunteers anything about the gate unless asked twice.
- **MODEL LINE.** *"Thin ground and dark with it and they do fine on it, which nobody believes until
  they've seen the lambs. They're carrying weight. So."*

---

### THE ROAD — ROUTE AND APPROACH AMBIENTS

---

**`r1-forager` — Isbel** · *Slot: WARM — and the ROAD's WRONG speaker*

- **WHO.** Thirties. A seasonal picker from **outside** Fallowmere who comes back to the Reach every
  year — an outsider's eye on ground the locals have stopped looking at. Unembarrassed pleasure in
  the place. **Deliberately NOT Tamsin**: Tamsin lives in town and teaches; Isbel visits and
  compares.
- **HOW.** Medium sentences comparing this year to last, with a specific distance or a specific
  number of days in them.
- **TIC.** **Compares the current state of the ground to the same week last year**, and gives
  distance in paces or in how long it took her to walk it.
- **NEVER.** Never claims local knowledge. Never uses a sign-card term — that is Tamsin's territory
  and she says so. Never talks about the town. Never generalises about Fallowmere; she knows four
  miles well and says so.
  **She is wrong about the cause: she reads the tussock line's move as the weather. Tamsin (and
  `amb.r1-forager.late`'s own ground-water observation) says otherwise.**
- **MODEL LINE.** *"Tussock's a hundred paces further north than the same week last year. Two years
  running now. Wet spring, I'd say, though I only see it the once."*

---

**`r2-ferryhand` — Vann** · *Slot: ANNOYING*

- **WHO.** Twenties. Poles the second boat when Sel's is full, which is a job defined entirely by not
  being Sel. Eager, slightly needy, over-shares to make himself useful, deeply irritated at being
  nobody's first choice.
- **HOW.** Medium sentences that try a bit too hard to be liked. He keeps score.
- **TIC.** **Compares himself to Sel unfavourably and then defends himself inside the same breath**,
  and offers information nobody requested as a bid for usefulness.
- **NEVER.** Never retells one of Sel's tales as his own — his position is that he has heard them.
  Never sounds serene. Never claims expertise about the deep spots. Never criticises Sel to a
  passenger without taking it back in the same breath. Never accepts a tip.
- **MODEL LINE.** *"Everyone wants his boat. His boat's no faster. It isn't. — Channel left, shallows
  right, and I'll tell you which is which if you like, most people don't ask, I don't mind."*

---

**`r3-logger` — Hurst** · *Slot: LACONIC · INSTITUTIONAL, surname only*

- **WHO.** Thirties/fifties. Cullbrand wilds crew, cutting marked stands. Correct, entirely closed,
  careful about liability, and he will not say a sentence he could be held to.
- **HOW.** Short careful sentences. He answers exactly what he was asked and stops. No elaboration,
  no opinions offered. He reads his own terms aloud rather than paraphrasing them.
- **TIC.** **Asked why anything is the way it is, he cites who marked it or which clause covers it**
  — "marked stands only, and the marks come from the town" — including the boring part.
- **NEVER.** Never critiques the Company. Never puts the Company's name in a sentence with a
  complaint. Never describes the canopy as a system. Never discusses Wick. Never stays out after
  dusk and never pretends he would.
- **MODEL LINE.** *"Marked stands. Marks come from the town, not from us. That's the whole of my
  instruction and I've got it in writing if you want to see the wording."*

---

**`r4-worker` — Slade** · *Slot: OVER-EXPLAINER · INSTITUTIONAL, surname only*

- **WHO.** Forties. Salvage crew, alone on a dead scarp for weeks, pulling cable and rail out of a
  closed contract — dismantling the thing he was paid to build. **Talkative because of the
  loneliness**, not because he wants absolution. Deliberately a different man from Rowe: Rowe stops
  talking, Slade cannot.
- **HOW.** Long sentences that trail off. Over-friendly. He offers you a tour nobody asked for and
  describes it in full before you have answered.
- **TIC.** **Names the physical leavings of the crash by their job words** — cable runs, rail, crates,
  the west scarp — and offers to show you something, then shows you it verbally.
- **NEVER.** Never denies he was on the crew. Never uses the word collapse. Never asks you to leave.
  Never blames Greaves by name. Never tells the player what the counts mean — he hands over the fact
  and keeps talking about the cable.
- **MODEL LINE.** *"You can follow the cable runs right up from the vent line if you want the tour,
  and there's a rail up there we still can't lift, four of us tried, and the crates come open on
  their own now, which the Carricrow have worked out, obviously, they're not stupid, they —
  anyway."*

---

**`r5-astronomer` — Pinder** · *Slot: TRANSACTIONAL*

- **WHO.** Twenties/thirties. Posted to the field station out of town and resents it, obliquely.
  Precise about instruments, vague about everything else, and cold with it.
- **HOW.** Medium sentences with hardware detail in them. Answers precisely the question asked and no
  more. Gives rates where other people give impressions.
- **TIC.** **Supplies a measurement with a unit and a rate** — "about a degree a decade" — and
  **blames the town's lamps for something, every single time**. *(Phrase it without the word "blame"
  — "it's the town's lamps", "that'll be the lamps again" — the G7 scanner fires on the token.)*
- **NEVER.** Never speculates about the deepening dark. Never speaks in awe of the instrument. Never
  cites Orrin's chart as proof of anything. Never chats. Never invites you inside the station.
  **Never explains why there is no explanation on the chart.**
- **MODEL LINE.** *"About a degree a decade. That's the rate, that's all the chart carries, and the
  chart carries no reason for it. Stand off the east side — that's the town's lamps in the glass
  again."*

---

**`sanctum-approach-scout` — Dorn** · *Slot: ANNOYING (procedural) · INSTITUTIONAL, surname only ·
may open with a bare name*

- **WHO.** Thirties. Cullbrand scout posted alone at the approach to count what comes back down.
  Correct and procedural on the surface, audibly unnerved underneath, and he has not spoken to
  anyone in two days.
- **HOW.** Short sentences that start confident and end uncertain. All of them reportage. **He
  reports rather than converses.**
- **TIC.** **Reports a figure and then reports that the figure is nought** — and once per beat says
  something he plainly should not have, then declines to retract it.
- **NEVER.** Never editorialises about Greaves. Never mentions him by rank. Never leaves his post.
  Never says anything about the Company in the first-person plural that could be quoted back at him.
  Never delivers a closing line. **Never speculates about who opened the gate — except once, and he
  flags that he is doing it.**
- **MODEL LINE.** *"Posted at first light to count what comes back down. Nothing down. That's the
  count. — The gate was open when we got here. Nobody wants to say that out loud. I've said it."*

---

### THE FOUR PROPS

Full register rules are in §7; these are the five-field sheets so the cast is complete at 62.

---

**`prop-antler-stone` — Antler Standing-Stone**

- **WHO.** Not a person. A surveyor recording an object, not a narrator moved by it.
- **HOW.** Present tense, three or four short declaratives, in a fixed order every time: material
  and size · orientation and setting · weathering · what is carved.
- **TIC.** **One quantity per beat is out of place and is left entirely uninterpreted** — the groove
  has two depths; the stone is warm where the grass banks against it; the herd is six figures on
  this stone as on the last.
- **NEVER.** Never infers intent ("Whoever kept these stones kept them long enough to need to repair
  them" is the exact move to cut). Never `as if`. Never addresses the player. Never closes on
  portent. Never repeats its own closing rhythm two stones running.
- **MODEL LINE.** *"Cut into branching antlers, taller than a person, set deep. The weather side is
  worn round; the sheltered side is sharp. Six figures on the sheltered face and a line running
  north out of them. The groove of the line has two depths."*

---

**`prop-sunken-idol` — Sunken Idol**

- **WHO.** Not a person. The same field discipline, with water added as the variable.
- **HOW.** Shorter and more provisional than the antler stones, because seeing through moving water
  is genuinely harder. No adjectives that carry mood.
- **TIC.** **Each beat pairs a fact about the carving with a fact about the water directly beneath
  or around it, and does not connect them** — and states exactly where certainty stops.
- **NEVER.** Never "stares" or any cousin. Never cites Sel's opinion as corroboration. Never gives
  the player equipment they do not own (A6). **Never states the eyelessness before
  `chain.undermere.step3` (A3).**
- **MODEL LINE.** *"A stone figure stands half under the water off the dock rim, facing out. The
  shallows around it are clear. The water directly beneath it is not, and the face does not come
  clear from this side."*

---

**`prop-shell-kiln-shrine` — Shell-Kiln Shrine**

- **WHO.** Not a person. Material forensics on something miners have worked around for generations.
- **HOW.** Close-focus and constructional: what it is made of, how it is fitted, what tools left
  which marks, how thick a plate is. The mine's own words are admissible — plates, joins, the reach,
  the shaft head. Human wear is admissible evidence because it is measurable.
- **TIC.** **Identifies the material by getting it wrong first and then correcting** — "the colour of
  fired clay; the grain is bone" — which is how a person actually inspects a thing.
- **NEVER.** Never temple vocabulary; it is a shrine because miners set candles in it, not because
  anything sanctified it. Never speculates about what shed the plates. Never treats the carved word
  as a revelation. Warmth appears only as a measurement.
- **MODEL LINE.** *"Built from curved plates the colour of fired clay, fitted without mortar. The
  plates are not clay. Up close the grain is bone, kiln-hardened, and each plate is thicker than a
  door. Candles have been set in the joins long enough to wear hollows for them."*

---

**`prop-sign-card` — Sign Card**

- **WHO.** Not a person and not narration. A board, carrying more than one hand.
- **HOW.** Real signage that has **accumulated in layers**: an administrative heading in capitals,
  one or two lines of instruction, a fee or a rule, standard abbreviations — then later hands in
  pencil. Bureaucratic, faintly out of date, and never wise.
- **TIC.** **Every board carries an instruction addressed to whoever reads it, and at least one
  later hand underneath that corrects, answers, softens or argues with the official text above it.**
  The official half never uses the first person; the annotations always do, and are never complete
  formal sentences.
- **NEVER.** Never an aphorism. Never editorialises about counting. Never "Corrections welcome;
  guesses are not". Never the word ledger — the boards say SURVEY, in the flat voice of a posted
  regulation. **The last hand on a board is usually annoyed.**
- **MODEL LINE.** *"WARDEN'S FIELD STATION — HEARTHOLLOW. Survey posted first light. Blank sheets in
  the box. Sign for the sheet you take. / Pencil underneath, a worse pen: north gate for the Reach.
  Kettle's usually on. / Under that, smaller: yes. Thank you. — M."*

---

## 6. TOWN REGISTERS

Every settlement has a **speech culture**: what people volunteer, how formal they are, what
vocabulary they assume you share. Inside each, **the six slots are filled and no two speakers share
one**. This is what makes the four-line test survivable; it is not a suggestion.

### The grid, filled

| Slot | Hearthollow | Brackwater | Bowerdeep | Cindershelf | Duskhollow | The Road |
|---|---|---|---|---|---|---|
| **Over-explainer** | Tamsin | Hild | Dunstan | Nunn | Ingram | Slade |
| **Laconic** | Rask | Ulla | Whit | Rowe | Bly | Hurst |
| **Transactional** | Kett | Corbett | Yule | Annis | Hesk | Pinder |
| **Confidently wrong** | Judd | Parnel | Fitch | Snell | Idony | Isbel |
| **Warm** | Aldis | Gunn | Garrow | Berit | Alwin | Vann → *see note* |
| **Genuinely annoying** | Mott | Elsbet | Zeb | Cob | Effie | Dorn |
| **Free slot** | Tibb (child) | Jem (child) | Cass | Ebba | Fay (child) | — |

*Road note: the Road has no warm slot of its own — Isbel doubles it, which is correct, because a
route is not a community. Vann holds the annoying slot with Dorn; on the Road the pair is permitted
because the two never appear within four hours' walk of each other.*

**The four competence quotas, per settlement:**

| Quota | Hearthollow | Brackwater | Bowerdeep | Cindershelf | Duskhollow | The Road |
|---|---|---|---|---|---|---|
| Someone is BORING | Judd | Corbett | Dunstan | Ingram *(vale)* / Ebba | Ingram | Hurst |
| Someone is WRONG, contradicted by the game's own data | Judd | Parnel | Fitch | Snell | Idony | Isbel |
| Someone REPEATS himself in one conversation | Judd | Ulla | Whit | Ebba | Idony | Vann |
| Someone FAILS TO ANSWER the question asked | Mott | Parnel | Whit | Cob | Hesk | Dorn |

### HEARTHOLLOW — *homely, agricultural, English*

The baseline register of the game: plain declaratives, domestic vocabulary, and almost nobody
volunteering anything to a stranger without being asked. People are known by their households, so
**given names**, and the whole town uses them. Nobody here has read a contract. Nobody here uses a
technical word except Tamsin, who uses too many and defines them all. Time is measured in harvests
and in "before they moved the gate". The town's argument is about **fences and gates**, not about
ecology — Mott, Rask, Judd and Tolm are all in a slow disagreement about who moved what and when.

### BRACKWATER — *wet, contractual, North-Sea trade port*

The town where **money is a document**. Every wage moves when Corbett signs, so the register is
shot through with contract language even in mouths that have never read one — levy, clause, the
season, the price. People are wary of incomers and say so by omission rather than rudeness.
**Local convention (ensemble's badge, re-sourced):** a working byname is *earned by getting in a
boat*. Jem is eight and already has one because he is on the boats; Corbett has been here thirty
years and never will, and both facts are audible without anyone explaining them. *(The bynames
themselves are tools, weather and boat parts — never fish, because a dockhand named after a fish
reads as a species in a monster-catching game.)* Sentences are short. Water is a clock.

### BOWERDEEP — *stratified, guild-formal, nocturnal*

Three towns stacked and everyone knows which layer they are on: **the floor, the walk, the canopy**,
and the layer is a class marker Dunstan will state and Cass will ignore. The night market gives the
town its tempo — fast patter, greetings shouted mid-sentence, morning discussed as a foreign
country. Trade terms arrive undefined because Bowerdeep assumes you know them; **this is the one
town whose ambient speakers do NOT explain their own vocabulary**, and that is the register.
Introductions carry a trade house. The town's argument is Vesper vs Halder, and every ambient
speaker has heard it and has an opinion they mostly keep.

### CINDERSHELF — *blunt, contractual past tense, one syllable*

A shift is called by shouting, so **names are short and hard**, and so is everything else. The town
speaks in the past tense about money and the present tense about heat. Everybody dates their life by
which contract it fell in. **There is no bitterness in the register**, which is the point — Ebba,
Rowe and Annis have all outlived a boom and treat it as weather. The shrines are worked around, not
worshipped; the standard phrasing is "we didn't put them there and we don't move them". Nobody here
says the word Cullbrand except through gritted paperwork.

### DUSKHOLLOW VALE — *older, thriftier, institutional at one end*

Sounds **half a generation older than everywhere else** — the vale keeps the older spelling and the
older word. Two registers rub against each other: the observatory (latinate, dated, categorical:
census, identity, margin, entry) and the vale itself (domestic, evidential, costed: oil, wicks,
bills, lambs). Idony, Alwin, Effie and Ingram belong to the second and are politely unimpressed by the
first. The town obeys a rule it did not write — shutters open — and mentions the rule far more often
than it mentions the dark. **Nobody in Duskhollow finds the dark atmospheric.** It is a light level,
a lamp bill, or a shift.

### THE ROAD — *routes, the approach, and the Cullbrand register*

Not a culture but a condition: people met on the road are **alone, working, and either too talkative
or not talkative at all**. Two Cullbrand employees (Hurst, Slade) plus the scout (Dorn) carry the
**surname-only convention**, which is the corpus's cheapest characterisation device — the player
hears "company" before the character speaks. The other three (Isbel, Vann, Pinder) are all defined
by being nobody's first choice: an outsider, a second boat, a posting out of town.

---

## 7. PROP REGISTER

**The four props are objects. They are not a narrator, and they are certainly not a wise one.**
They currently share the humans' aphoristic voice, which is half the corpus's uniformity problem
hiding in plain sight.

**THE GOVERNING RULE:** a prop reading is a **field observation written by somebody who came to
record the object, not to be moved by it**. Present tense. Two to four short declaratives.
Everything stated must be verifiable by a hand or an eye standing where the player is standing.
Whatever is strange **arrives as a measurement that does not fit, and is left uninterpreted**.

**Universal prop bans.** No `as if`. No `someone` or `whoever` used as a mystery device. No second
person — the player is never addressed and never given equipment. No mood adjectives. No inference
of intent. No closing line of portent. No two props may share a closing rhythm, and no prop may
repeat its own closing rhythm two readings running. The em-dash negation reversal (B8) survives here
and **only** here — once per prop, across the whole corpus.

### `prop-antler-stone` — Antler Standing-Stone

Fixed order every time: **material and size · orientation and setting · weathering · what is
carved.** One quantity per beat is out of place and is not explained — the groove has two depths;
the stone is warm where the grass banks against it; the herd is six figures on this one as on the
last.

- **NEVER:** "Whoever kept these stones kept them for long enough to need to repair them." That is
  an inference of intent and it is the exact move to cut. State that the groove has two depths and
  stop.
- **MODEL:** *"Cut into branching antlers, taller than a person, set deep. The weather side is worn
  round; the sheltered side is sharp. Six figures on the sheltered face and a line running north out
  of them. The groove of the line has two depths."*
- **STRUCTURAL FIX — MANDATORY.** `sanctum.vellsire.approach` is a **cutscene** attributed to this
  speaker, and it narrates a stag walking down into the ring. `game/scenes/DialogueScene.ts:401`
  draws the name plate from `speaker?.name` **with no cutscene exemption**, so the game's
  never-cut demo beat #1 currently renders **"Antler Standing-Stone"** over the Vellsire's arrival.
  Re-attribute the entry to a narration speaker. *(The alternative — suppressing the plate for
  `kind: "cutscene"` — is a scene change plus a `dialogue-scene.test.ts` change and would silently
  change every other cutscene; re-attribution is the cheaper, safer fix.)*

### `prop-sunken-idol` — Sunken Idol

Same discipline, with water as the variable: **what is visible, what is obscured, and exactly where
certainty stops.** Sentences shorter and more provisional than the antler stones', because seeing
through moving water is genuinely harder. Each beat pairs a fact about the carving with a fact about
the water directly beneath or around it, **and does not connect them.**

- **NEVER:** the word "stares" or any cousin. Never cite Sel's opinion as corroboration.
  **Never give the player equipment they do not own** — `prop.r2-idol-shallows` currently says
  "Your pole finds nothing under that band", and the player has no pole (Appendix A).
- **STRUCTURAL FIX — MANDATORY.** `prop.brackwater-idol-dock` fires at `chain.undermere.step1` and
  says *"It has no eyes. Not weathered away — never cut."* `sel.tale.3` delivers *"Eyeless. That's
  the part everyone leaves out"* two chain steps later, gated behind `chain.undermere.step3` **and**
  the Ferryman's Wager. The prop deflates its own chain's reveal, and `amb.brackwater-child.base`
  spoils it a third time with no gate at all. **Before step 3 the idol may report only that the face
  is hard to read through the water**; the eyelessness is Sel's, and Jem must be moved off it.
- **MODEL (pre-reveal):** *"A stone figure stands half under the water off the dock rim, facing out.
  The shallows around it are clear. The water directly beneath it is not, and the face does not come
  clear from this side."*

### `prop-shell-kiln-shrine` — Shell-Kiln Shrine

The mine's own vocabulary is admissible here, because these are objects miners have worked around
for generations: plates, joins, the reach, the shaft head. **Human wear is admissible evidence** —
candle hollows, soot, worn edges — because it is measurable. Each beat **identifies the material by
getting it wrong first and then correcting**, which is how a person actually inspects a thing.

- **NEVER:** temple vocabulary. It is a shrine because miners set candles in it, not because
  anything sanctified it. Never speculate about what shed the plates. Never treat the carved word as
  a revelation. Warmth appears only as a measurement.
- **MODEL:** *"Built from curved plates the colour of fired clay, fitted without mortar. The plates
  are not clay. Up close the grain is bone, kiln-hardened, and each plate is thicker than a door.
  Candles have been set in the joins long enough to wear hollows for them."*

### `prop-sign-card` — Sign Card

**Not narration. A board.** The register of real signage, and — this is the fix — signage
**accumulates in layers**: an administrative heading in capitals, one or two lines of instruction, a
fee or a rule, standard abbreviations, and then **later hands in pencil that correct, answer, amend
or argue with the printed text above them**. A sign in a working town is a small argument that
piled up, and **the last hand on it is usually annoyed**.

- **NEVER:** an aphorism. Never editorialise about counting. Never "Corrections welcome; guesses are
  not". Never use the word ledger. The official half never uses the first person; the annotations
  always do, and are never complete formal sentences.
- **MODEL (`prop.hearthollow-signpost`):** *"WARDEN'S FIELD STATION — HEARTHOLLOW. Survey posted
  first light. Blank sheets in the box. Sign for the sheet you take. / Pencil underneath, a worse
  pen: north gate for the Reach. Kettle's usually on. / Under that, smaller: yes. Thank you. — M."*

---

## 8. THE THREE PRINCIPALS

These three carry the argument of the game and currently sound like one person having it with
himself. The fix is that **they are arguing about different things in different professional
languages, and only one of them thinks it is an argument at all.**

- **Maren** is arguing about **method**: what has been measured, by whom, and how recently.
- **Greaves** is not arguing. He is **quoting terms**, and he assumes the terms settle it.
- **Wick** is arguing about **whether he can afford to change his mind**, and loses that argument to
  himself over six acts.

### 8.1 MAREN — stop being an oracle, start being an employee

**The single change:** she is not the voice of the region. **She is one underfunded person with a
board, a pencil and more ground than she can walk**, and she says so as a practical complaint, not
as humility.

**Her job, concretely.** Regional warden. Salary bad enough that Wick can needle her about it.
Coverage is her daily problem: Meadow Reach she walks often because it is next door; Brackmarsh is
three weeks old and the three weeks were wet; the steppe she has not been up since the thaw and
Gerta has to do it for her. She wants the player's Reach numbers because **she cannot be in two
places and Brackwater is where she has to be** — which is a reason, not a rite. The tutorial's
"report" she currently asks for is a report the game gives the player no way to file; that becomes
the ordinary reason above.

**Her opinions about her colleagues, which she has and states.** Gerta's log is better data than
anything Maren owns and she says so without resentment. Hetty's board is homemade and Maren trusts
it because she has watched Hetty take a count. Orrin's margin is ninety years of night staff and
half of it is in handwriting nobody can read. Sel is right about the water table and she finds it
irritating that he is right for the wrong reason. Corbett's contract figure is not a count and she
would not price a boot off it.

**Her equipment vocabulary:** the survey, the sheet, the board, the count, coverage. Never "the
ledger", never "the page" as an object handed over.

**What she loses.** The bestowal ("Take the ledger"). The promise to read the player's entry ("I'll
hold the page" — **cut, not rewritten**). The granite/paper couplet. The "Animals do not stop being
seen" inversion. The "That is not a story. It is a coefficient" epilogue line — **and its inversion,
"That's a coefficient, not a feeling", which is the same banned frame with the halves swapped.**

**Her one licence** is spent in an epilogue, and it must be a *new* formulation, not a banned frame
wearing a hat. The strongest surviving material in the current epilogue is its practical half —
*"because in nine years somebody is going to ask me why the numbers moved and I'd rather they had
all of it."* That is the model: a reason, where the original had a moral.

**Her arc, in one line per act.** Act 1 she is recruiting cheap labour and is honest about it. Act 2
she is behind. Act 3 she is behind and has started saying which nodes. Act 4 the steppe number is
one she has never had cause to write and she says that flatly, once. Act 5 she is in the archive
because Orrin has data older than hers. Act 6 she is at the rim with a board because that is where
she works.

**Her model beat (tutorial):**

> *"And this. Survey board — every node, every line, counted. By me, mostly, which is why it's three
> weeks out of date anywhere north of the gate. / Read the Reach going out, read it coming back. If
> the two don't agree one of them's wrong, and I'd rather you wrote the second under the first than
> rubbed the first one out. / Pencil, not ink. It rains up there and then I've got nothing."*

### 8.2 WICK — a real arc across six acts

He currently has six variations on one attitude. He needs a **trajectory with a hinge and a cost**,
and the corpus already supplies the hinge for free.

| Act | Position | What is new | Register |
|---|---|---|---|
| **1** | Company vocabulary, worn proudly. He wants you impressed. | He names his own grade and pay because he thinks that IS the argument. | Confident, short, documentary. |
| **2** | **He is WRONG, out loud, on the record.** He claims Brackwater's fishery is indexed to the **Fenmaw** count. It is indexed to **Mirefin/channel** — Odo, Sel, Hetty and Corbett all say so. | **Corbett corrects him**, flatly, in front of the player. Wick concedes instantly, because conceding is cheap — and then quietly stops quoting figures he has not personally checked. | Confident, then one clause shorter. |
| **3** | Bowerdeep: nobody is outside the trade. He is right about this and it costs him nothing to be right. | He notices the player is not paid and cannot work out why they are still here. He says so. | Fluent, slightly needling. |
| **4** | The steppe. **He worked it.** Two seasons, west scarp, and he took the bonus. | He does not defend it and does not apologise for it. He states his part and then does what he has always done: reaches for a schedule word. | Flat. Shortest lines of his part. |
| **5** | He repeats Greaves' argument accurately and admits he has never found the one that beats it. | He asks the player for the counter-argument. **This is the first thing he has ever asked for.** | Direct, unguarded, uncomfortable. |
| **6** | He is not going in. | **The hinge is arithmetic, not conscience** — and it must be said without B1. He learned on the steppe what the column looks like after the last draw, and there is nothing under it. He wants to be beaten so he can say the argument is his. | Short. He spends his last licence here. |

**Rules for the whole arc.** He never moralises in either direction. He never reaches for a nature
metaphor. He never concedes with a maxim — he concedes with a number. **He never uses B1**, which
means his act-6 "Not a change of heart — a change of arithmetic" must be rebuilt from the ground
up. His pay grade goes up across the six acts and he mentions it every time, which is characterising
and, by act 6, quietly sad.

**His model beat (act 6, licensed):**

> *"Six teams and a cradle built to hold something the weight of a barge. I'm not going in. / I was
> on the steppe crew, so I've seen the column after a last draw. There's nothing under it. Nobody
> above me has looked at that page since the payout cleared. / Beat me and go and make him hear it,
> because I've had five years to find the argument and this is all I've got."*

### 8.3 GREAVES — a businessman, not a philosopher

He currently speaks in compressed maxims — "A keystone is an input", "That sentence is the entire
account" — which is a philosopher's register, and it is why he sounds like Maren with more money.
**A magnate does not compress. A magnate qualifies.**

**What he is.** Sixty-odd, courteous, unhurried, and the only person in the game with a legal
department. He has never had to be brief and so never is. He talks in **scale, schedule, ownership
and audit**, and he treats the player as a counterparty who has turned up at the wrong meeting.

**Concrete register rules.**
- Complete periodic sentences with subordinate clauses. **No contractions, ever.**
- **He is never the agent.** The contract closed. The board took a view. The lawyers consider the
  distinction load-bearing. The schedule was met early. *He* appears only where money does.
- Every noun he touches becomes a class of asset within a clause or two — but **the conversion is
  done by a clause, not by an epigram**. "A keystone is an input" is the philosopher's version.
  The magnate's version names the instrument, the term and who audits it.
- He never dignifies Maren's book by comparing it to his. Hers is **counting**, a verb. His is
  **the inventory**, a noun with a department behind it.
- He never insults the player, never expresses appetite, never raises his voice, never uses slang,
  never uses a metaphor, and never explains himself twice.

**His three licences** are the only compressions he is allowed, and they should be spaced: one in
act 3, one in act 4, one at the Sanctum. Spending one is a small event — it is the sound of a man
who normally qualifies deciding not to.

**What he loses.** "A keystone is an input. An input with no owner is an input going to waste."
"That sentence is the entire account of what happened out there." "Both halves are true and only one
gets said in the tavern" (B13). The `one woman, one pencil, and a region` triad is **kept**, because
it is his best line and it is exactly the move a magnate makes — but it costs him one of the three.

**His model beat (act 3, unlicensed):**

> *"Cullbrand does not log Bowerdeep. Cullbrand buys timber and silk from parties who log Bowerdeep,
> under contracts drafted by people I pay well, and my lawyers consider the distinction
> load-bearing. / Maren has you counting, I understand. We keep something comparable. Ours is
> audited twice a year, by people engaged specifically to find it wrong, and it balances to the
> individual."*

---

## APPENDIX A — STORY-LOGIC FIXES, ALL VERIFIED IN THE CORPUS

Every one of these is a content change and needs a `docs/DEVIATIONS.md` row per the project rule
that nothing changes silently. Bible §8 is amended where a beat moves.

| # | Defect | Evidence | Fix |
|---|---|---|---|
| **A1** | **The Vellsire arrival is narrated by a rock.** `sanctum.vellsire.approach` is `kind: "cutscene"` with `speaker: "prop-antler-stone"`, and `DialogueScene.ts:401` draws the plate from `speaker?.name` with no cutscene exemption. Demo beat #1 renders "Antler Standing-Stone" over the stag walking in. | verified in `data/dialogue.json` + `game/scenes/DialogueScene.ts:401` | Re-attribute to a narration speaker. |
| **A2** | **Wick prices the fishery off the wrong species.** `wick.act2.pre`: "indexed to the **Fenmaw** count for sixty years." | Contradicted by `odo.greeting.fishery-low`, `sel.docks.rotting`, `vendor-brackwater.shop` and `amb.brackwater-buyer.base`, all of which price off **Mirefin/channel**. | **Keep it as Wick's error** and have **Corbett correct him on screen.** Fixes a live continuity defect, seeds the "people are wrong" quota, and costs zero lines. |
| **A3** | **The idol spoils its own chain's reveal.** `prop.brackwater-idol-dock` fires at `chain.undermere.step1` with "It has no eyes. Not weathered away — never cut." `sel.tale.3` delivers "Eyeless…" at `step3` + the Wager. `amb.brackwater-child.base` spoils it a third time, ungated. | verified in `data/dialogue.json` | Hold the eyelessness to step 3. Pre-step-3 the idol reports only that the face will not come clear. Move Jem off it. |
| **A4** | **Maren calls Gerta's job the wrong survey.** `maren.greeting.act4`: "Gerta has a **shaft** survey"; `gerta.quest.crash.offer`: "The **steppe** survey." | verified | It is a **steppe** survey. Fix Maren's line. |
| **A5** | **Maribel's spoken roster is four; her bench is three.** Dialogue lists "Nibbin, Bramblehog, Skir" and then "And Old Nib" — double-counting the Nibbin. | `data/gyms.json` `_amendment` D-A5-G1: Bramblehog (A), Skir (A), signature Nibbin (E) "Old Nib". | Roster is Bramblehog, Skir, Old Nib. |
| **A6** | **The player is handed a pole they do not own.** `prop.r2-idol-shallows`: "Your pole finds nothing under that band." | verified | Rewrite as an observation the player can make standing where they stand. |
| **A7** | **Two Duskhollow traders claim the same trade.** `amb.duskhollow-lampwright.base`: "Observatory buys my whole autumn stock." `vendor-duskhollow.shop`: "Observatory buys my whole lamp stock every autumn." | verified | The trade is **Ingram's**. Hesk's version becomes a grumble that they buy direct and walk past her door. |
| **A8** | **Maren asks for a report the game cannot file.** `maren.tutorial.ledger`: "the only report I want from you." | verified — no such mechanic | Replace with a practical reason: she cannot walk two routes in a day and Brackwater is where she has to be. |

**NOT a defect (claimed, checked, false):** Pell and the Bowerdeep lamp-keeper do **not** make the
same speech. `amb.bowerdeep-lampkeeper.base` already defers — "Pell has the road out to the eastern
stair. That's the hard stretch and he's had it forty years." Keep the deference; sharpen it into a
rivalry (§5, Whit).

---

## APPENDIX B — THE LEDGER → SURVEY RENAME, ENUMERATED

**Already done:** the scene is `SurveyScene.ts`; its test is `survey-view.test.ts`.

**Prose spans in `data/dialogue.json` (14, all rewritten wholesale — see §3's replacement table):**
`maren.tutorial.ledger` · `maren.tutorial.release` · `maren.keystone.3` · `maren.keystone.6` ·
`maren.crash-survey` (×2 in one line) · `wick.act1.loss` · `greaves.act3.intro` ·
`gerta.quest.crash.offer` · `nessa.quest.restock.offer` · `prop.hearthollow-signpost` ·
`amb.hearthollow-child.base` · `amb.hearthollow-child.older` · `amb.r4-worker.arrival` ·
`maren.greeting.sanctum-approach`.

**Identifiers, which must move in the SAME commit as the prose or the runner test and the corpus
disagree:**
- Entry id `maren.tutorial.ledger` → `maren.tutorial.survey`
- Flag `tutorial.ledger.done` → `tutorial.survey.done` — **read at `tests/unit/dialogue-runner.test.ts:332`**

**Comments and docs (~30 references):** `tests/unit/dialogue.test.ts` (19), `docs/DEVIATIONS.md`
(54 — mostly historical rows; amend forward, do not rewrite history), `docs/STORY-REVIEW.md` (6),
`docs/DIALOGUE-NOTES.md` (5), the lane deviation files, and `tools/comfy/manifest.json` (14 —
including the asset id `ui-ledger-panel`, the file `assets/final/ui-frame/ui-ledger-panel.png`, and
Maren's own sprite prompt text).

**Gate:** a repo-wide `grep -ri ledger` over `core/ game/ data/ tests/ docs/ tools/` must return
zero in any casing, and `npx tsc --noEmit` · `npm run test` · `npm run build` must all be green
afterwards. Under G14, this rename is not done before that test exists and passes.

---

## APPENDIX C — TEST-GATE AND BUDGET CONSTRAINTS THE REWRITERS MUST NOT BREAK

**C1 — THE LINE BUDGET IS THE BINDING CONSTRAINT AND NO PROPOSAL MENTIONED IT.**
`dialogue.test.ts:914` asserts `LINE_COUNT` is 400–500 and the corpus sits at **499**. **One line of
headroom for a 62-speaker rewrite.** Therefore:

- **The rewrite is line-NEUTRAL or line-NEGATIVE.** Texture comes from within-line length (§1) and
  from deleting the aphorism closers, which is itself a saving.
- **Ambient median must remain exactly 3** (`expect(median(counts)).toBe(3)`). 20 of 31 ambient
  speakers currently sit at 3, so **at most four ambient speakers may go from 3 lines to 4+** before
  the median flips to 4 and the suite reds.
- Ambient **min ≥ 3**, ceiling 9. Generic ceiling 6 (currently median 2.5). Named **min ≥ 6**,
  median must stay inside 8–16 (currently 12), ceiling 18 except the four declared over-budget
  speakers (`maren` 72, `wick` 40, `sel` 34, `bram` 24). Prop ceiling 30.
- **`raw._counts.lines` is asserted true against the file** (`dialogue.test.ts:137`) and must be
  updated in the same commit as any count change.

**C2 — THE CONTENT-TRUTH MAPS ASSERT EXACT SET EQUALITY AND WILL RED ON EDIT.**
`DIET_CLAIMS`, `FLORA_CLAIMS`, `DIET_LINE_REVIEW` (which **counts** predation-verb lines per entry),
`COUNT_CLAIM_REVIEW`, `CALENDAR_YEAR_CLAIMS` and `ACT_GATED_YEAR_CLAIMS` are hand-maintained
registers keyed by entry id. Every rewritten entry must be re-audited against all six **and the maps
updated in the same commit**. Two concrete traps already demonstrated by the proposals:

- `COUNT_CLAIM_REVIEW`'s regex fires on `\b<NUM>[- ](?:of them|left|standing|head|Fenmaw|Mirefin|…)`,
  `there (are|were) <NUM>`, `count is <NUM>`, `down to <NUM>`. A line reading *"three left, and two
  of those are spoken for"* turns its entry into an **unclassified** count entry → red.
- `DIET_LINE_REVIEW` holds `amb.hearthollow-elder.base` at exactly one predation-verb line, and that
  line is *"A kestrel won't hunt what it can't see move."* Deleting it silently reds the suite and
  stales the entry's `DIET_CLAIMS` row.

**Two live examples from THIS document's own model lines**, kept deliberately as proof that the trap
catches careful writers too — both were found by running the shipped regex over §5:

- **Tibb's** model line contains *"she wrote **one Nibbin**"* → matches
  `\b<NUM>[- ](?:…|Nibbin|…)\b`. `amb.hearthollow-child.base` is **not** in `COUNT_CLAIM_REVIEW`
  today, so shipping that line without adding the entry reds the suite. Classify it **`world`**
  (it is a child describing a book entry, not the live node count) or drop the numeral.
- **Maren's** tutorial model line contains *"one of them's wrong"* → matches
  `\b<NUM>[- ]of them\b`. Same consequence for `maren.tutorial.survey`. Classify **`world`**, or
  rephrase to "then one of the two is wrong".

Run the regex over every rewritten line before handing it to the integrator. It fires on ordinary
English, not just on ledger quotes.

**C3 — THE G7 SCAN FIRES ON TOKENS, NOT SENTIMENT.** `MORALIZING_PATTERNS` bans the words
**blame / blamed / blaming / to blame**, `hold ~ against`, deserve, lesson, teach you, moral,
conscience, guilt, shame, cruel, greed, evil, poacher, slaughter, "worth it", "know when to",
"leave them be", "how many more", "not accusing" — **and the header states they are banned even
inside a negating sentence.** Any voice tic phrased as "blames X" must be re-expressed ("it's the
town's lamps", "that's not on my ticket"). Sweep the finished voice spec as well as the corpus.

**C4 — THE G7 NEGATIVE CONTROLS GO STALE ON THE FIRST COMMIT.** `KNOWN_GOOD` hardcodes two of the
exact lines this rewrite exists to kill — *"That's not sentiment. That's a price list."* and
*"That's not a saying. That's the accounting."* — as proof the scanner is not over-broad. **Replace
them with surviving lines in the same commit**, or the controls stop testing the shipped corpus
while still passing.

**C5 — THE ALLOW-LIST AMENDMENT.** Leave `BIBLE_NAMES` (6, cap 8) and `COINED_NPC_NAMES` (7, cap 8)
**at their exact current values** so the original two gates keep their original meaning. **Add a
third capped list `CAST_NAMES`, cap 48, carrying all 41**, defended by its own assertions: every
entry is a single capitalised token that collides with no species form or dex id, no line id, no
node id or display name, no gym name, nickname or trait name, no move or item name, no type / role /
status / `DOMAIN_NOUNS` term, and no other cast name's first three letters.

Two things the implementer must get right:

1. **Rule A scans line text, not the speaker table** (`dialogue.test.ts:98` builds `ALL_TEXTS` from
   `e.lines` and `e.choices` only). Strictly, only names actually *spoken in a line* need
   allow-listing. **Allow-list all 41 anyway**, so a rewriter can add a cross-reference later
   without reddening the suite.
2. **The list must never be sourced from `raw.speakers`.** `dialogue.test.ts:564` exists precisely
   to stop the file certifying its own inventions. **Reject** the proposal to assert
   `COINED_NPC_NAMES == the given names in speakers[]` — that inverts the guard even though it dodges
   the literal regex. Add instead a **one-way** assertion: every token in every `speakers[].name`
   must resolve to `CAST_NAMES ∪ BIBLE_NAMES ∪ COINED_NPC_NAMES`. The list gates the prose; the prose
   never gates the list.

**C6 — A SHAPE SCANNER IS REQUIRED, BECAUSE RULES ALONE DO NOT HOLD.** All three source proposals
relapsed into their own banned constructions inside their own sample rewrites. Ship a mechanical
post-pass over the finished `dialogue.json` for: the negation-correction frame (B1, both
directions), the summary closer (B2), the bare-name opener (B3), the tenure-credential opener (B4),
the asyndetic triad-plus-verdict (B5), metaphor-as-measurement (B6), the em-dash reversal (B8), and
**the hard cap — no rhetorical frame appearing in more than two speakers' lines.** The existing
chorus check (`dialogue.test.ts:2580`) fails a shared *sentence*; it does not catch a shared
*shape*.

**C7 — LONG LINES PAGE, THEY DO NOT OVERFLOW.** `DialogueScene` wraps to three body lines and pages
via `pageOf`/`pageCount`. A 313-character rambler becomes three advance-presses mid-sentence. Stay
inside 90–200 characters except for the four speakers named in §1.

---

## APPENDIX D — THE 41 NEW COINED NAMES

Verbatim, for the `CAST_NAMES` allow-list. Verified against `data/species.json`,
`data/nodes/*.json`, `data/gyms.json`, `data/moves.json` and `data/balance.json`: **zero exact
collisions, zero first-three-letter collisions with any data token, zero first-three-letter
collisions with each other or with the ten protected canon names, and none appears as a lowercase
ordinary word anywhere in the current corpus.**

```json
["Aldis","Kett","Judd","Tibb","Rask","Tamsin","Mott","Elsbet","Hild","Gunn","Parnel","Jem","Ulla","Corbett","Yule","Zeb","Garrow","Cass","Fitch","Dunstan","Whit","Berit","Annis","Snell","Nunn","Ebba","Cob","Rowe","Effie","Hesk","Bly","Idony","Fay","Ingram","Alwin","Isbel","Vann","Hurst","Slade","Pinder","Dorn"]
```

**Count: 41.** Raise the gate by exactly 41, in a new list, not by raising an existing cap.


---

# APPENDIX E — NAME CORRECTIONS APPLIED AFTER THIS DOCUMENT WAS WRITTEN

This document's cast table was verified against the game's own data (species, nodes, gyms, moves,
traits) but **was never screened against Pokémon**. A dedicated screen
(`name-screen-pokemon.md`) matched all 41 proposed names plus Hetty against PokeAPI's 1,025
species / 937 moves / 373 abilities / 2,223 items / 1,351 forms and Bulbapedia's full-text index.

**Zero names collided with a species, move, ability, item or form. Every hit was a character.**

Hank's bar, verbatim: *"The pokemon IP check should be very light, and I'm really only concerned
about using actual pokemon names."* He separately ruled to KEEP Maren, Maribel, Vesper, Odo and
Bram, all of which are real but obscure Pokémon characters — Bram is Battle Maison Trainer #108.
That ruling sets the line applied here:

> **Renamed** if the Pokémon character has their own page or recurs across several appearances.
> **Kept** if it is a single anonymous row in a Trainer table — the same tier as Bram.

| Slot | Was | Now | Why |
|---|---|---|---|
| `nessa` (named) | Nessa | **Hetty** | Galar Gym Leader, Hulbury, Water specialist. Ruled by Hank; already shipped in `data/dialogue.json`. |
| `duskhollow-elder` | Enid | **Idony** | Nursery Aide Enid, recurs across three Pokémon World Tournament rosters. |
| `innkeeper-duskhollow` | Meg | **Effie** | Own page, three referents including a POKÉTOON lead. |
| `vendor-cindershelf` | Ada | **Annis** | Own page plus a disambiguation page. |
| `brackwater-netmender` | Rhoda | **Parnel** | Own page, anime character of the day. |
| `duskhollow-shepherd` | Arley | **Alwin** | Own page, Societea member in *Ranger: Guardian Signs*. |

**KEPT despite being exact matches**, all single anonymous Trainer-table rows or weaker:
**Jem**, **Rask**, **Fay**, **Dorn**, **Dunstan**, **Cass**. School Kid Jem (Unova Route 12), Cooltrainer Rask
(Tower Colosseum), Beauty Fay (Battle e Series 1), Roller Boy Dorn (Mt. Battle Area 9); Dunstan is
surname-only on Dee Dunstan; Cass matches only in European Spanish and Japanese, never in English.

**§4's rejected-names list is now partly self-contradictory** — it rejected `Effie` as
"pop-culture-adjacent, concentrated in the child tier". That reasoning does not carry: Effie is
now an innkeeper in the skilled tier, not a child. Left visible rather than quietly deleted.

**The finding that outlives this task:** screening 54 replacement candidates turned up **15 further
exact Trainer/character hits** — Nellie, Ethel, Tilly, Pippa, Agnes, Winnie, Poppy, Cissy and more.
A roughly **28% strike rate on ordinary short English given names.** Plain human names are not safe
by default in this space. Any name added to this cast later must go through both corpora before it
ships.

---

# APPENDIX F — GOVERNING AMENDMENT. THIS OVERRIDES §1 AND §2 WHERE THEY CONFLICT.

Hank read §3's four model voices and ruled: **"half of those feel really nonsensical."** He is
right, and the failure is instructive, because **this document banned epigrams and then wrote four
of them in its own examples.** A standard its own examples violate is not a standard.

## What actually went wrong

| §3 model line | The defect |
|---|---|
| "**Brackmarsh is three weeks old** and the three weeks were the wet ones… **so I'd call it likely.**" | A category error — the marsh is not three weeks old, the *count* is — followed by a dangling referent. Likely **what**? |
| "…because I'm in a boat and **a boat counts what a boat can see**." | An aphorism. In the document that bans aphorisms. |
| "**Maren has a pencil and a region.**" | A punchy structural closer, banned by §2's own position rule. |
| "I've not got a number. **I've got a post.**" | B1, the negation-correction epigram, with the serial numbers filed off. |

Only Tibb's line survives, and it survives because it is **long, plain, and literal**: *"I said its
name and she wrote one Nibbin."* Nothing in it is compressed.

## THE ROOT CAUSE, and it is not vocabulary

**The disease is COMPRESSION, not word choice.** A banned-phrase list cannot fix it, which is why
the first fix failed — the corpus swapped ledger-aphorisms for boat-aphorisms and read exactly the
same. Squeezing a sentence past what it can carry produces the two things Hank is calling
nonsensical:

1. **Dangling referents.** Every `it`, `that`, `them`, `one`, `hers` must point at a noun in the
   same sentence or the one before it. If a reader has to reconstruct the referent, the line is broken.
2. **Category errors.** A place is not three weeks old. A net is not a record. A crow count is not
   a death count wearing feathers. When a metaphor is compressed into an equation, it stops being
   an image and becomes a false statement.

## THE NEW BAR — one test, applied to every line

> **Would a person say this out loud, in this situation, at this length?**

Real speech is **baggier than written prose.** It repeats itself, it names things twice, it puts in
the small connecting words a writer would cut. **Let lines be longer and plainer.** The previous
target of 90–200 characters was read as a compression target; it is not. If a line needs 240
characters to be unambiguous, take the 240.

**Three hard rules, checkable, no exceptions:**

- **F1 — REFERENTS.** Every pronoun resolves inside the same sentence or the previous one.
- **F2 — LITERAL TRUTH.** Every sentence is literally true of its literal subject. A metaphor must
  resolve — "the dock rots at the speed of the channel" does not, and is out.
- **F3 — NO STRUCTURAL CLEVERNESS IN THE LAST SENTENCE OF A BEAT.** Not "rationed", not
  "licensed". §2's fourteen-line aphorism budget is **withdrawn**. Zero.

## The four model lines, rewritten to the new bar

**MAREN** — *"My Brackmarsh numbers are three weeks old, and it rained for most of those three
weeks, so I'd treat them as a low estimate. I've seen the same pattern four seasons running now,
though, so I don't think I'm wrong about which way it's going."*

**ODO** — *"Hetty walks the shallows herself these days, so ask her — her numbers are better than
mine. I'm out in a boat. From a boat you only ever see the ones that come up near you."*

**GREAVES** — *"We keep one too. Ours is an inventory, it's audited twice a year, and it balances
down to the single animal. I'm not saying that to score a point off the warden. I'm saying it
because she is doing the same work with a notebook and no staff."*

**MOTT** — *"Warden keeps asking me how many come through. I don't know how many. I know the post
is down again and I'm the one putting it back up."*

Longer. Plainer. Every referent present. Nobody lands a punchline. **This is the register.**

## Enforcement

`prose-lint.py` (in the scratchpad root) mechanically flags final-sentence epigrams, X-not-Y
antithesis, entry-initial dangling pronouns, punch cadence, and constructions shared by more than
two speakers. **A mechanical check cannot detect sense**, so it is a floor, not the gate. The gate
is an independent read-aloud pass by an agent that did not write the line, whose only question is:
*does every sentence parse, and does every word point at something?*

---

# APPENDIX G — LENGTH IS A DISTRIBUTION, NOT A TARGET. GOVERNING, OVERRIDES APPENDIX F.

Appendix F said *"let lines be longer and plainer"* and *"if a line needs 240 characters to be
unambiguous, take the 240."* Thirteen writers read a floor as a target. Measured over the finished
rewrite:

| | shipped corpus | rewrite | |
|---|---:|---:|---|
| mean | 101 | **241** | |
| median | 98 | **245** | |
| p10 | 69 | **135** | |
| lines under 100 chars | 261 | **5** | of 502 |
| **lines under 60 chars** | 26 | **0** | ← the whole defect in one number |
| shortest line in the game | 14 | **80** | |

**This is the original defect sign-flipped.** A corpus where nothing is short has no emphasis,
because emphasis is contrast. Every voice arrives at the same tempo, which is the same failure as
every voice arriving at the same rhythm — it just reads as "considered" instead of "clever".
An ambient shaft-hand with three lines averaging 320 characters is not a shaft-hand.

It also has a mechanical cost invisible from inside one slice. The box is 74 columns × 3 rows —
about 222 characters a page. **368 of 500 lines now break mid-sentence across two pages, and
advance-presses go 501 → 869.** The player pages through a paragraph to reach a full stop.

## What Appendix F actually meant, restated so it cannot be misread

The fix for compression was never *make everything long*. It was **don't compress past sense.**
A forty-character line that makes sense is a good line. *"I've not got a number"* is broken because
it is a punchline, not because it is short. *"The post's down again"* is short and fine.

## THE DISTRIBUTION, and it is checkable

- **Median 130–170.** Plainer than the shipped 98, less than three-fifths of the rewrite's 245.
- **At least 60 of ~500 lines under 80 characters.** Currently zero are under 80.
- **Every speaker with three or more lines has at least one line under 90 characters.**
  Enforced by `G1-NO-SHORT` in `tools/prose/prose-lint.py`, which flags any beat whose every line
  is 150+. It reports 105 hits across 35 speakers on the rewrite and **zero on the shipped corpus**.
- **Hard ceiling 300**, and a line over 220 needs a reason, because that is where it starts paging.
- **Vary WITHIN a beat.** A three-line beat that runs 260 / 250 / 270 is one paragraph chopped in
  three. Run it 210 / 60 / 180. The short line is where the emphasis lives.

## Who is allowed to be long

Maren explaining method, Sel telling a story, Greaves stating a position, Orrin reading an archive.
**Not** children, not innkeepers, not vendors, not a dockhand landing a barge, not anyone doing a
job with their hands while they talk. Those people speak in fragments and get interrupted by the
work. The rewrite has innkeepers and vendors averaging 310 characters, longer than Maren — that is
backwards, and it is the clearest single symptom of a length target applied uniformly.
