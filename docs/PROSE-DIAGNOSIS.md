# What is actually wrong with TROPHIC's prose — MEASURED, trust these numbers
Counted over all 499 lines + 27 choice texts in data/dialogue.json at commit 64b04b5.
Do not re-derive this. It is ground truth for the rewrite.

---

## DEFECT 1 — characters speak the game's internal data model aloud

This is the single biggest reason it reads as machine-written. Someone wrote dialogue from a
spec, and the spec's vocabulary came with it. ~90 instances. Nobody in a real story says these:

| uses | phrase spoken by a character | what it really is |
|---:|---|---|
| 32 | "count" / "the counts" | `nodeState.count`, a variable |
| 6 | "line" meaning a species ("Bogling and Mirefin are one line") | `lineId`, a database key |
| 5 | "node" ("puts it back into whatever node you're standing in") | a data structure |
| 5 | "Instinct" as a spoken noun ("Bring something with Instinct") | a stat field |
| 4 | "flora stock" ("Meadow Reach is holding at a decent flora stock") | `nodeState.floraStock` |
| 4 | "juvenile" as a spoken class ("Three years is what a juvenile has") | an age enum |
| 4 | "the web" ("what the target eats is in the web, so learn the web") | the derived graph |
| 4 | "two ticks" ("Bed's two ticks off the season meter") | the clock unit + a UI widget |
| 3 | "mesopredator" ("Cindril. Fire, mesopredator, and quicker off the mark") | a role enum |
| 2 | "master snare" / "weighted snare" as spoken nouns | a tier enum |
| 2 | "breeding runs at the base rate" / "runs at one and a half" | `balance.json` |
| 1 | "It is a coefficient, and it will show" | `keystoneBreedMult` |
| 1 | "the ledger counts it the same way, sign reversed" | arithmetic, not speech |
| 1 | "Role bait's cheap and works on anything of that role" | an item enum, read as a tooltip |

**Worst offenders, verbatim:**
- Innkeeper: *"Bed's two ticks off the season meter and everything you're carrying comes back up to full."*
  — an innkeeper describing the HUD.
- Maren: *"Release puts an individual back into whatever node you're standing in. The count goes up
  by one, same arithmetic, opposite sign."*
- Maren: *"Breeding in every node adjacent to the Sanctum runs at one and a half while it is out
  there. That is not a story. It is a coefficient, and it will show."*
- Market Vendor: *"Role bait's cheap and works on anything of that role. Species bait costs and
  works properly."* — a shop tooltip with a person's face on it.
- Maren: *"Cindril. Fire, mesopredator, and quicker off the mark…"* — reading a stat block aloud.

**THE RULE:** a character may describe the WORLD; they may never name the SYSTEM. A warden says
"there were about forty of them on the rise last spring and I make it half that now." She does not
say "the count." A fisherman says "the young ones and the big ones are the same fish." He does not
say "one line." An innkeeper says "sleep till morning." Not "two ticks."
Tutorial information still has to reach the player — through what a person would actually say
while showing you, or through UI, never through a character reciting the schema.

---

## DEFECT 2 — 62 speakers, one voice. Measured by shared construction.

| construction | uses | **distinct speakers** |
|---|---:|---:|
| "Nobody…" / "Everyone…" / "Nothing…" sentence opener | 28 | **24** |
| "That's the…" / "That's all…" / "That's what…" | 28 | **13** |
| "and I/he/she do/did/have" tag | 12 | **10** |
| "X, and Y, and Z" triad | 10 | 7 |
| "and that is…" / "and it is…" | 8 | 5 |
| "X is what Y" cleft ("Three years is what a juvenile has") | 5 | 4 |
| "That's not X. That's Y." | 3 | 3 |

24 of 62 speakers reach for the same "Nobody…/Everyone…" opener. A twelve-year-old, a sixty-year-old
ferryman and an industrial magnate all land the same wry epigram at the end of the same beat.

**CAP FOR THE REWRITE: no construction above may be shared by more than TWO speakers in the entire
game.** That is checkable, and it will be checked.

---

## DEFECT 3 — the survey is written as scripture

The user's own words: *"I see a bunch of talk about counting and ledgers being this sacred thing.
That's weird. The ledger is just a tool, and people that work with creatures track them just like
any real-life biologist would."*

Now-forbidden register, all verbatim from the corpus:
- "Read it before you set out. Read it when you come back. The difference between the two readings
  is the only report I want from you."
- "Go on. I'll hold the page."
- "Keep the ledger — it's the part of this you're ahead on."
- "we'll compare books" · "Mine is paper. Theirs is granite. Theirs will outlast mine."
- "A cut stump is a ledger with the pages stacked instead of bound."
- "a crow count is a death count wearing feathers"
- "That's not a saying. That's the accounting."
- "That is the other half of the entry and I am writing it down too."
- "I'll be at the rim with the ledger. That's where I'll stay."

**What replaces it.** Real field biologists do not revere their datasheets. They are behind on
data entry. They trust their own transects and squint at everyone else's. They argue about method.
They lose the pencil. They say "I haven't walked the east side since March, so don't quote me."
Counting is a chore that happens to be load-bearing. It is how these people know things — which
is exactly why it must be treated as ordinary. Reverence makes it decoration; drudgery makes it real.

The word is now **survey**, never "ledger" (user's decision this session, full rename incl. code).

---

## DEFECT 4 — nobody in this world is ordinary

Nobody rambles. Nobody is boring. Nobody misunderstands. Nobody repeats themselves. Nobody trails
off. Nobody is cheerful. Nobody is stupid. Nobody is wrong. Nobody dislikes the player. Every
single one of the 62 is a laconic aphorist with a wry closer.

Real towns have: a bore who tells you the same story twice; someone who over-explains their job;
someone defensive about being bad at it; someone cheerful and unhelpful; someone who resents the
warden; a child who has facts wrong; someone who does not care that you exist. **Ration the good
lines.** An epigram lands only when the surrounding speech is ordinary.
