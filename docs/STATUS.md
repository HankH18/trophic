# TROPHIC — status

A 2D monster-catching RPG whose region is a living ecosystem: every catch decrements a real per-node
population, the food web is derived from those numbers rather than authored beside them, and the
calendar ages every creature and map underneath the story.

## ⛔ THE GAME WAS PLAYED — AND THE HEADLINE THAT SAID BEAT 1 WAS UNPLAYABLE WAS WRONG, TWICE

**On 2026-08-27 somebody drove the built app in a browser with real keys** — title, opening cutscene,
Hearthollow, an interior, a wild fight, a rival fight, a gym, the in-run menu, the survey. **It is the
first evidence on this page that is not a test**, and it is written up as items 45–50. **A great deal
works, the survey most of all** (item 50 — do not read this section as a verdict on the build).

⚠⚠ **THE CORRECTION ABOVE WAS ITSELF FALSE, AND THIS IS THE SECOND TIME THIS HEADLINE HAS BEEN WRONG
IN THE SAME PLACE. IT IS CORRECTED AGAIN, WITH A MEASUREMENT THIS TIME.** It read: *"**Nothing in the
shipped game can be caught.** … `newSave` starts the bag empty and no caller passes one … **So
build-doc §1 beat 1 (the cascade — never-cut) and §15's I1 and I2 are all unplayable**"*.

**CATCHING WAS NEVER BLOCKED. IT IS UNMETERED.** Measured twice by independent agents, the second
driving the real `game/boot.ts startNewGame`, a zod storage round-trip and the production battle seam:

    [ADV] REAL save.items      = {}
    [ADV] items AFTER zod parse round-trip = {}
    [ADV] illegalActionReason(snare base) = null
    [ADV] snareEntries = [base disabled:false, weighted disabled:false, master disabled:false]

The full loop completes from a brand-new game: the snare throws at the shipped ~14.3% base chance,
`caught` fires, the node population moves **24 → 23**, and the creature lands in the party. 50 throws,
0 refusals, 8 catches.

**WHY.** `core/battle.ts:1208` `bagHas` returns TRUE for a key ABSENT from the bag — "untracked", an
affordance for the balance harness, which carries no bag — and `bagConsume` at :1214 returns early on
an absent key, so it never decrements. `core/save.ts:421` gives a fresh save `items: {}`. The guard at
`core/battle.ts:1537` therefore never fires for a new player. **The guard is sound**: with
`items: {base: 2}` two throws decrement and the third is refused with `actionRejected`. The economy is
enforced only for a key that is PRESENT, and nothing writes one. That is why Maren's *"three of them,
in the satchel by the door"* has never corresponded to anything — not because the player has none, but
because the player effectively has infinite.

**HOW IT SURVIVED 2,954 PASSING TESTS.** Every catching test mints its own bag —
`items: {master: 99}` at `tests/unit/wild-battle.test.ts:68` and `tests/property/determinism.test.ts:390`,
`{master: 4}` at `tests/unit/overworld-scene.test.ts:3153`. **No test in `tests/` asserted anything
about the player's real starting inventory**, so the suite's green about catching was evidence about
FIXTURES. `game/wild-battle.ts:266` asserted the opposite of the truth in plain English and never went
red; that comment now records what was measured.

**And `tests/integration/demo-beats.test.ts` runs the cascade beat today** from a zero-item save and
passes, 6/6. **Beat 1 was reachable the whole time.** The claim that it could not be played was wrong
when it was written and was inherited as a premise by a later session, which planned work around it.
⚠ **The lesson is the one this file keeps re-learning: a confident absence is the cheapest thing an
instrument produces.** Both false versions of this headline were written from reading, not running.

⚠ **A party wipe ended the run** — 3 of 3, from a wild loss, a rival loss and a gym loss (item 46).
**FIXED and landed** in `9e3e4e7` *"a party wipe no longer ends the run, and the blackout does what it
says"*, which is an ANCESTOR of the commit that wrote the sentence claiming it had not landed
(`366051f`). The cause was scene-op FIFO ordering, not the pause/resume imbalance first inferred; the
blackout now draws a real black curtain and wakes the player inside the inn, both halves of the ruling
having been missing on screen.

**What is true underneath both:** damage, levels, XP and the bag persist across battles; a rest at an
inn heals what it charges for, **replays**, and asks where the player is standing before it does; a
wiped party is charged, moved and healed correctly in the save. **And as of this pass the ECONOMY is
real on the live path** — a won rival fight pays a purse, a town shop spends it, Maren's tutorial line
hands over the three snares it has always promised, and every one of those movements goes on the tape
with a `replay()` arm (item 55). **Nine painted maps are on disk** — ten are committed and
`hearthollow.png` is deleted on purpose — **and everything that moves is a labelled placeholder**: no
player sprite, no creature sprite, no dex plate, no UI frame, no audio, **and no collision**. ✅ **AND
HOW A MAP GETS PAINTED IS NO LONGER AN OPEN QUESTION — the owner ruled that the maps are composed from
tiles**, the composer and a 157-tile set are committed, and all twelve nodes compose palette-clean at
1024². ⛔ **But not one composition is shipped, nine of the twelve paint from the wrong biome's
materials, and none of the authored buildings is drawn on any node** — the tiled-maps section below is
the account, and it is the section on this page most likely to be read as further along than it is.
⚠ **"No collision" is still the
largest gap in the *engine***: all twelve nodes run on a synthesised border ring, so **19.5% to 43.1%
of every node is walkable that its layout says is solid**, no building is solid and no water stops
anyone — item 41, and the reason it is not simply fixed is item 43.

---

## ✅ RESOLVED — the over-catch gate was measuring wrong, and the beat was reachable all along

**The gate was not reporting a balance gap. It was a THIRD instrument error, of exactly the family
its own comment block already documented twice.** `preyShare = preyPool / encounterable` **ignored
`seasonalWindow`**. `reedrick-line` is summer-only and is 18 of brackwater's 24-strong prey pool and
24 of r2's 32 — 75% at both. `core/foodweb.ts` `encounterWeights()` marks an out-of-season line
INACTIVE and `rollEncounter()` gates on `active`, so three seasons in four most of that pool cannot be
encountered at all. **The flat share priced a player who can hunt reedrick year-round, and no such
player exists.** Origin: build-doc §7.2 specifies *"encounter weight of species s = populations[s].count
… FILTERED BY `seasonalWindow`"* — the assertion implemented that sentence with the first filter
missing.

**Measured against the simulator** (100 seeds, one year, real seams — `stepEncounterChance` →
`encounterWeights` → `rollEncounter` → `encounterCatchChance` → `applyCatch`, charging foray and battle
ticks as `tools/harness/full-run.ts` does):

| site | gate before | gate after | simulated | needed | |
|---|---|---|---|---|---|
| brackwater | 11.42 | **3.63** | 3.14 | 19.20 | not the beat's site |
| r2 | 9.46 | **1.72** | 1.15 | 24.80 | not the beat's site |
| bowerdeep | 5.89 | **6.56** | 6.54 | 7.20 | not the beat's site |
| r3 | 5.53 | **6.19** | — | 10.80 | not the beat's site |
| **r4** | 9.08 | **9.08** | 8.49 | **6.80** | **PASSES — the recorded beat** |
| **cindershelf** | 8.28 | **8.28** | — | **3.20** | **PASSES** |

**The correction did not buy the pass.** r4 and cindershelf host no seasonal line, so their numbers
never moved — **the beat has always been reachable there**, at 85% and 97% of seeds respectively. The
gate was interrogating brackwater and r2, which `fixtures/overcatch-script.json` records as producing a
**two-tier collapse** rather than the apex-starve beat. ⚠ **"The gate was asking the wrong node" is the
failure that reads as a real result until somebody checks which corpus it was pointed at** — the same
shape as every other instrument error in build-doc §16, and it cost a session's planning.

**Zero constants in `data/balance.json` moved.** The correction makes the gate STRICTER, not looser:
the shortfall at brackwater widened from 7.78 to 15.57 and at r2 from 15.34 to 23.08.

⚠ **AND A NEAR-MISS WORTH KEEPING, because it was caught by review rather than by the suite.** The
first version of this fix went green by `continue`-ing past the four failing sites with a **tautology**
left in their place — `contestedAt(n, id).every((p) => prey.includes(p))`, where `contestedAt` is
`prey.filter(...)` and therefore a subset of `prey` BY CONSTRUCTION. It could not fail. It also cited
coverage in `tests/property/ecosim.test.ts` that does not exist: that test FORCES the removal by direct
field assignment (`pop.count = Math.min(pop.count, target)`) with no `applyCatch`, no `rollEncounter`
and no tick budget — it proves the web propagates a removal that has already happened, where the
removed assertion proved a removal is ACHIEVABLE BY PLAYING. **Different properties.** The skip is now
replaced by a falsifiable pin: the four sites are asserted INFEASIBLE, so a balance change that makes
one reachable turns the gate red and asks whether the beat should move. Proven to bind by sabotage.

    AssertionError: brackwater: 19.2 removals needed to starve fenmaw-line,
    only 11.4/yr available: expected 11.423076923076922 to be greater than or equal to 19.2

⚠ **THE "ONE PROBLEM, TWO ENDS" NOTE THAT STOOD HERE IS HALF WITHDRAWN, AND IT IS THE HALF THAT DID
THE ARGUING.** It read that the gate prices a reference player holding a weighted snare which *"costs
**60** and cannot be obtained by any means in the shipped game"*, so **tuning could not make the beat
playable**. **Both clauses are now false.** A weighted snare costs **3** — every purchasable price is
3 under the owner's year-one anchor — and it is **on the shop's shelf from the second gym's badge
onward**. The reference player is ordinary.

**What reproduces, and is still worth carrying:** `data/balance.json` `harness.overcatch` names that
player — `snareTier: "weighted"`, `baitMatch: "species"`, `referenceHpFrac 0.5`, `yearsBudget 1` — and
`tools/harness/full-run.ts` hands `ref.snareTier` straight to `catchChance` **with no inventory check
at all.** That is still true and is still a gap between the model and the game: the harness cannot
tell a snare it could buy from one it could not. **It is no longer a reason the gate's arithmetic
cannot be trusted**, because the tier it assumes is purchasable.

⚠ **AND THE SIBLING DISAGREEMENT IS UNRESOLVED AND IS NOW THE SHARPER ONE.**
`tests/integration/demo-beats.test.ts` proves the beat by throwing **`tier: "master"`** every turn,
while `harness.overcatch` prices **`weighted`**. Master is ×2.2 and weighted ×1.5. **Neither reads the
other**, and the integration rig is throwing masters it never obtained — which is legal only because
an ungranted tier is untracked and therefore infinite (item 56). **Two instruments, two reference
players, one beat** — **T-68**.

**What changed.** T-1's retune gave battles a tick cost and gated encounters to tall grass. The
year's encounter budget fell from **138.24 to 54.0** — the old figure being `16 ticks × 48 steps ×
0.18`, correct for the old regime (verified against `git show HEAD:data/balance.json`: 16 ticks/year,
no `battleTicks`, no `encounterTileFraction`).

**Both walkable apex sites now fall short.** Re-derived independently of the test, from
`data/balance.json` + `data/nodes/*.json` + `data/species.json`:

| site | removals needed | net removals available/yr | encounters/yr **required** |
|---|---|---|---|
| `brackwater/fenmaw-line` | 19.20 | 11.42 | **78.96** |
| `r2/fenmaw-line` | 24.80 | 9.46 | **103.70** |

Budget available: **54.0**.

**`encounterTileFraction` CANNOT rescue r2, at any value.** This corrects the statement in T-1's own
ruling text that names it as the knob. Charging `battleTicks` puts a hard asymptotic ceiling on the
year at `ticksPerYear / battleTicks` = **104.0** encounters — and grass fraction 1.0 (every tile an
encounter tile) yields only **84.45**, because an excursion costs `forayTicks + e × battleTicks` and
`e` grows with the fraction. r2 needs 103.70. The algebraic solution for r2 is a fraction of ~80,
i.e. past the asymptote. Brackwater alone would clear at fraction **0.730**.

**The binding knob is `battleTicks`** — or `ticksPerYear`. Solved against the shipped rest:

| knob | value that clears brackwater (78.96) | value that clears r2 (103.70) |
|---|---|---|
| `encounter.encounterTileFraction` | 0.730 | **impossible** (ceiling 84.45 at 1.0) |
| `clock.battleTicks` (grass 0.25) | 0.196 | **0.038** — effectively free |
| `clock.ticksPerYear` (shipped tf/bt) | 76 | 100 |

**Nothing was tuned and no gate was weakened.** Under T-1's own ruling this is the owner's call, and
under G14 the gate does not move to accommodate it. G6 also binds: a seed set or a node chosen for
its outcome is not an answer.

**The green next door is not evidence the beat is affordable.**
`tests/integration/demo-beats.test.ts` passes, and separately measures a *different node* — the
fixture pins `r4`, while the feasibility gate above asserts `brackwater` and `r2`. ⛔ **THIS SENTENCE
USED TO SAY "`r4`, WHICH IS `walkable: false`", AND THAT CLAUSE IS STRUCK: the flag gates nothing.**
`travelTo` refuses on adjacency and the act ladder and never reads `node.walkable`, so a player walks
all twelve nodes — **`r4` is not off the slice, it is behind the act-4 gate and behind the encounter
budget**, which are two real barriers and not the same barrier as the one this file kept naming. The
distinction matters because *"the node is not walkable"* reads as unfixable-without-a-content-edit,
while *"the act ladder opens it in act 4"* reads as a pacing fact. **T-36 is the ticket, and the flag's
own status is the owner's; nothing about the cascade argument depends on it.** Worse, `runCascade`
(`tests/integration/demo-beats.test.ts:163`) **never
advances the clock**, and its `forays` / `battles` fields are computed and **never asserted** (grep
for `.forays` / `.battles` in that file returns nothing). Priced at the shipped costs across its own
24 seeds — measured by replaying `runCascade` verbatim outside the suite:

    min 30 · mean 49.21 · max 85.5 ticks   ·   9 of 24 seeds exceed the 52-tick year
    (seeds 2, 5, 7, 9, 10, 17, 19, 20, 21)

So the beat that test certifies costs more than a year at over a third of its seeds, and the test
cannot see it.

---

## ⚠ A CONSTRAINT NOBODY CAN QUOTE IS A CONSTRAINT SOMEBODY INFERRED

**The most expensive thing found in this project is not a code bug.** The owner's rule for
`assets/reference/gen2/` is *"inspiration only, don't copy."* An agent wrote it down as *"inspiration
only, never shipped, never quantized, never a palette source, **never fed to the pipeline**."* Only
the first three clauses are his. **The fourth was inferred**, and it hardened into a constraint
nobody re-examined — so for this project's entire life the generator never saw a Pokémon screenshot.
The graph starts from `EmptySD3LatentImage`, pure noise, a text prompt and a hand-drawn line drawing,
and was asked to invent Gold's rendering idiom from first principles. It could not. **Four rounds of
postprocess were spent trying to recover contrast the generator was never given a way to produce.**
The owner, on finding it: *"If we don't feed to the pipeline, then how are we using it for
inspiration?"*

**THE SAME FAILURE RAN IN THE CODE LANE THE SAME DAY, and it is worth putting the two side by side.**
This file's headline said *"catching is unreachable; demo beat 1 cannot be played."* Nobody had run
it. `core/battle.ts:1208` reads an ABSENT bag key as unlimited, so catching was never blocked — it
was unmetered, and `tests/integration/demo-beats.test.ts` had been playing the beat from a zero-item
save and passing the whole time. A session inherited that headline as a premise and planned an
entire workstream around it. **Neither lane was defeated by a hard problem. Both were defeated by a
sentence nobody went back and checked.**

**The rule, and it costs almost nothing to apply:** when a constraint is BLOCKING — when it is the
reason a lane cannot proceed, or the reason a beat is declared unreachable — go and find the sentence
it came from. Quote it. If there is no sentence to quote, **it is a hypothesis wearing a rule's
clothes**, and it must be tested before anything is planned around it. §3.8 of this file already
records the miniature version: *"an earlier draft said 'a plus-shaped junction is a grid'. That was
inferred, not quoted, and it was wrong."* It is the same failure at three different scales.

⚠ **This is distinct from the wrong-corpus family in build-doc §16, and the difference matters.** A
wrong-corpus reading is an instrument pointed at the wrong thing and answering truthfully. An
inferred constraint is not measured at all — it is a claim that was never an observation, repeated
until it acquired the authority of one. No instrument catches it, because none is ever aimed at it.
**"Verified rather than reported" is the distinction that did all the work in both lanes today.**

---

## ⛔ THE HEARTHOLLOW RED IS CORRECT BEHAVIOUR — DO NOT MAKE IT GREEN

`assets/final/maps/hearthollow.png` is **deleted on purpose, by the owner's instruction.** He saw the
map repeatedly in the Comfy UI, called it *"by far the worst image that has been generated for this
project"*, and ordered the town started from scratch; 343 hearthollow rasters were removed across
every trial directory. Only `assets/raw/_layouts/control-hearthollow.png` and
`masks/mask-hearthollow.png` survive, because those are DATA rather than pictures.

**Three tests in `tests/gates/asset-palette-contract.test.ts` therefore fail** — *is present,
non-empty, and decodes*; *is a real image, not an empty or flat one*; *every opaque pixel is an exact
`data/palette.json` colour*. **That is the gate doing its job**: a node declares a map and the map is
not there.

⚠ **DO NOT teach the gate to tolerate the absence, and do not restore the file.** ⚠ **The replacement
is no longer being GENERATED — it will be COMPOSED**, and the red clears when it lands. The third
assertion is the one most likely to catch a hurried drop-in: a frame that merely decodes still fails
unless every opaque pixel is an exact frozen-32 colour before it reaches `assets/final/`. ⛔ **And it
does not land alone**: under the per-node rule a composed painting ships on the same commit as the
collision mask derived from its layout, so clearing this red is the first instance of the T-56 gate
recalibration rather than a file drop. **hearthollow composes today** — 1024², zero off-palette, 30
distinct colours — **and it is not ready to ship**: its buildings are generic houses rather than the
five the manifest names (T-73).

---

## ✅ THE MAPS ARE COMPOSED FROM TILES — THE OWNER RULED IT HIMSELF, AND L7'S CONDITION IS SPENT

**A map is no longer being generated as a whole image.** The round now shipping authors a **64×64
ASCII layout** — one character per 16-px collision cell — and paints the map by **stamping a tile per
cell** into a 1024² PNG, offline. **The engine is not touched and nothing is assembled at run time:**
`game/mapview.ts` still loads ONE PNG per node and `setDisplaySize()`s it to the 2048 world (`:430-433`,
`:471`), and that file has not changed since before any of this work began. Read that as the *runtime*
half being untouched, which it is.

⚠ **THIS SECTION READ *"L7'S OWN QUALIFIER SAYS THAT IS THE OWNER'S CALL"* AND SAT IN THE *WAITING ON
THE OWNER* REGISTER. THE REASONING WAS RIGHT AND THE CONCLUSION WAS STALE — HE HAD ALREADY ANSWERED.**
The reasoning is worth keeping, because it is the reasoning that would apply again: L7's text
(`docs/build-doc.md:45`) is *"no tilesets — **conditionally**"* on Hank's own qualifier ***"as long as
you can make this work without them"***, the same row says an agent *"may not build or slice tiles,
and may not decide the condition has failed"*, and **G1** (`:461`) says it flatly. **An agent could
not take this decision.** It did not have to. He raised it himself, unprompted — *"What would it take
for us to just switch to tiles? This image bullshit has eaten up almost all of the time that I have
for this project"* — was given the scope it would cost, and ruled, verbatim:

> **"Get it done. Use as many agents as you need to. This was the common sense answer from the start,
> and while planning out this project, you cautioned me against it. Make up for that by doing an
> exceptionally good job here as quickly as you can."**

**There are now TWO records of him spending that condition, and they are kept separate because their
provenance differs — not because either is in doubt.**
1. **The original decision, RELAYED.** The exchange above happened in the **art lane's session** and
   reached this file between sessions. **No commit or artefact in the tree carries it; `git log -S`
   will not find it.** The source is named so a later reader knows where to look, not because a peer
   relay is suspect — see the note below.
2. **The override, FIRST-HAND, in answer to being shown that the build doc still forbade the work:**

   > **"I override the build doc!"**

   Said directly, needing no hedge, and now recorded in `docs/build-doc.md` at L7 and G1 as well.
   ⚠ **Both documents must carry both sources and must not drift apart** — this file previously
   carried only the weaker relayed one, which is how a first-hand ruling ends up looking like the
   softer of the two.

✅ **AND THE STANDING RULE ON PROVENANCE HAS CHANGED, FIRST-HAND, WHICH CHANGES HOW EVERY NOTE LIKE
THIS ONE SHOULD READ.** Hank, to this session: ***"I've never had an agent directly claim to be me
when I didn't tell them to. If your co-worker here says that I said something or I authorized
something, then that is true."*** **So a relay from another lane is TRUSTED.** Keep naming where a
quote came from — that is useful to whoever reads it next — but **drop any framing that treats a peer
relay as doubtful or unverified.** ⛔ **What still needs checking is the different thing that actually
went wrong here: an AGENT'S OWN INFERENCE written into the tree as if it were a ruling.** That is what
the cindershelf `compose.py` comment was (item 53), and what caught it was its sibling layout header
saying the opposite — not scepticism about a relay.

**What the ruling settles, and what it does not.** It settles **L7's condition**, which was his to
spend and nobody else's: holding the scope, he decided the whole-canvas route could not carry the
maps. It settles **G1 for this work** on the same authority. **It does not approve any picture** — he
ruled on the METHOD, and no composed map has been put in front of him. Do not read an approval of
tiles as an approval of a tiled Hearthollow.

✅ **TWO CANONICAL DOCUMENTS CONTRADICTED HIM FOR A WHILE. THEY HAVE BEEN AMENDED — `f81f8d3`,
*"L7 and G1 forbade work the owner ordered — he overrode them"* — AND T-71 IS CLOSED.** ⚠ **Kept as
history rather than deleted, because the failure mode it names is reusable and is the nastiest kind
this file tracks.** What stood: `docs/build-doc.md:45` still ended L7 with *"Nothing on disk has
reached that point"*, and **G1** (`:461`) still read *"Do not build or generate tilesets, or slice
painted maps into tiles"* — **forbidding, in as many words, work the owner had ordered and that had
already landed.** ⛔ **A stale PROHIBITION is worse than a stale claim, and it fires hardest on the
most careful agent**: one briefed to the map lane, doing exactly the right thing by reading the
canonical document before touching the art, would have found G1 and correctly stopped — or raised
sanctioned work as a guardrail violation. **The more disciplined the reader, the more reliably the
defect triggers.** That is the transferable part.

**What the amendment says, so it is not paraphrased loosely here.** L7's *"no tilesets"* clause is
**SPENT**, and the composer, its committed tiles and the twelve compositions are **sanctioned work
that no agent may refuse or revert on G1's authority**. G1 now permits offline composition **by name**
and states what remains forbidden — **nothing assembled at RUN TIME**: no tilemap, no tileset atlas,
no assembling ground a cell at a time in `game/`, and no cutting a finished painting back into tiles
to render it. **The runtime half was confirmed in code rather than assumed**: `game/mapview.ts:429-433`
adds one image and `setDisplaySize()`s it to the world, re-applied at `:471`, and a repo-wide grep for
`tilemap` / `tileset` / `createFromTiles` across `game/`, `core/` and `tools/mapgen` returns only
comments.

⛔ **AND THE BOUNDARY IS EXPLICIT, BECAUSE THIS IS EXACTLY THE PERMISSION SOMEBODY WILL READ TOO
WIDELY. This is NOT a general suspension of the build doc.** It reaches the tileset question and
nothing else: **G2 through G15 and every other locked decision stand untouched.** And it **approves no
picture** — he ruled on the METHOD, and no composed map has been put in front of him.

### ⛔ THE PALETTE ARGUMENT FOR TILES IS STRUCK — THE ARGUMENT, NOT ONLY THE FIGURE

This section, and the register at the foot of this file, argued the tile round on **colour**: that the
palette gate requires every opaque pixel to be one of the frozen 32, that generated output runs to
hundreds of thousands of colours, and that a tiled composition is on-palette by construction. **The
last clause is true. The argument built on it is not, and correcting the number alone would leave the
argument standing.** Re-measured this pass by decoding every PNG in `assets/final/maps/` against
`data/palette.json` (`colorCount: 32`, `frozen: true`), alpha dropped:

| shipped generated map | distinct opaque colours | off-palette pixels |
|---|---|---|
| brackwater | 31 | **0** |
| duskhollow | 28 | **0** |
| r1 | 30 | **0** |
| r2 | 32 | **0** |
| r3 | 27 | **0** |
| r4 | 24 | **0** |
| r5 | 26 | **0** |
| sanctum-approach | 17 | **0** |
| sanctum | 26 | **0** |

**Range 17–32, median 27, against a frozen 32. Every one of the nine PASSES the palette gate, and
always has.** The gate asserts palette *membership* and it caps nothing — item 32 says why a cap would
be taste with a number painted on it — so **a finished generated map has never failed it.** The
sentence that said generated maps fail the palette gate was never true of anything in
`assets/final/`.

⚠ **AND `398,485` HAS ACQUIRED A SOURCE SINCE THIS FILE WITHDREW IT AS UNSOURCED, WHICH MAKES IT WORSE
RATHER THAN BETTER.** It now exists on disk exactly once outside this document, at
`tools/mapgen/compose/verify.py:89`, as a hardcoded `print` inside the composer's own verifier: *"Gold's
own town maps run 12-18; the first tiled attempt ran 21; a generated town ran 398,485 and failed this
gate outright."* **That is the tile lane's script asserting the tile lane's case, in prose it prints
rather than computes.** Two separate faults, and they must not be collapsed:
- **It is circular.** The claim's only source is a file that states it; nothing measures it. That is
  precisely the *derived artifact carrying a hand-written claim* shape this file keeps a section for
  — right when written, wrong forever after, and a rebuild *restores* the claim instead of repairing
  it. The withdrawal stands: not disproved, not evidence either.
- **It is a corpus mismatch, which is the fault that decided the argument.** Even granting the
  magnitude — raw pre-postprocess generator output genuinely runs into the hundreds of thousands, at
  **222,814–413,217** across fourteen trials — that figure is **RAW output on one side set against a
  FINISHED tiled composition on the other.** The finished generated artefacts are the nine in the
  table above. Comparing an unquantized intermediate against a shipped file answers a question nobody
  asked, and it is build-doc §16's wrong-corpus family arriving in the art lane's own verifier.

⚠ **"A tiled map is 21 colours" belongs to round one only.** The v2 compositions read **30**. Against
a frozen 32 that is **two colours of headroom, not eleven** — and **three more biome tile families are
still to be cut** (Forest ~50 tiles, Sanctum ~22, Vale ~8), plus a Marsh that is a real table rather
than an alias, each of which will want swatches it does not yet spend. ⚠ **The count of missing
families has been three, then four, then three again inside this pass** — a briefing said three, it
measured four (Forest, Steppe, Vale, Sanctum), and then `CINDER` landed. ⚠ **And "three" is itself
generous: `CINDER` is keyed to `cindershelf` and does not serve `r4`, its Steppe sibling**, so Steppe
is covered for one of its two nodes. **Do not quote this count without re-deriving `MATERIALS` against
the six declared biomes and the twelve node files.** `verify.py` records where
the 30 goes and is honest about it: ground, nature, rock, water and fence cost 20, and each extra roof
hue adds 3–4, so the brief's own *"different buildings get different roof hues"* is what takes
hearthollow from 23 at one hue to 30 at three or four. **That is a real trade between two stated
requirements, and quoting 21 hides it.** Quote the round with the number or do not quote the number.

### WHAT SURVIVES, AND IT IS THE REAL REASON: EVERY FAILURE OF THE GENERATED PATH WAS A COMPOSITION FAILURE

Not one of the defects that ended the generated round was a colour defect. The enumeration, as the art
lane reported it:

- lanes that dead-end in open field
- **four edge exits where the node's own contract allows one**
- props standing on the arrival tile
- gibberish signage
- **ten buildings against a contract of five**
- and, twice, the owner was handed back the exact town he had already ordered deleted

**Every one of those is a question about WHERE THINGS ARE, and a diffusion model answers it by
sampling.** A prompt cannot say *exactly five buildings, one exit, nothing on the arrival cell* in a
form the sampler is obliged to honour, and four rounds of postprocess never touched any of it, because
postprocess operates on pixels and these are facts about layout.

✅ **AND THIS ONE DOES NOT REST ON A RELAY — THE TREE CORROBORATES IT, IN THE MAP LANE'S OWN COMMIT.**
`af82c46`'s message is the strongest in-repo evidence on this page for why the generated round ended,
and it was sitting in `git log` the whole time this file was arguing colour. Verbatim:

> **MAPS — all 12 generated, all 12 judged, NONE approved. 0 PASS / 3 REVISE / 9 REJECT, 121 defects
> (39 blocking)** … **10 finals in `assets/final/maps/` are EVIDENCE, not art.**
>
> **Prompting owns STYLE; it cannot own GEOMETRY.** Measured on one controlled axis: same subject,
> same seed 42, only the class skeleton changed. Style moved (keyline ink 3.62% → 4.67%, grayscale
> 2.54% → 1.20%, full bleed held). **Composition did not move at all** — the skeleton stated an
> explicit size ceiling and got buildings ~14× it, **and Hearthollow drew 4 edge exits where its
> adjacency allows 1, omitting the only legal one.**

**That is the argument, made by the lane that ran the experiment, on a controlled axis, before anybody
proposed tiles.** Style responded to the prompt and composition did not move *at all* — which is
exactly the property that makes a text layout the right instrument and a sampler the wrong one.

⚠ **Provenance on the rest of the enumeration, held to the same standard as the ruling above: it is
the art lane's, relayed, and the trial rasters it describes are under `assets/raw/**`, which
`.gitignore` excludes, so most of it is not reproducible here.** Two items check out in the tree and
one does not:
- **The edge exits reproduce exactly.** `checkEdgeCorridors` (`tools/mapgen/verify.ts:119-156`)
  requires the number of edge-touching corridors to equal `node.adjacency.length`, with left and right
  sealed and at most one each on top and bottom; `data/nodes/hearthollow.json` declares **one**
  adjacency (`r1`). So *four exits where the contract allows one* is a hearthollow-shaped violation
  stated correctly, and it is **not** in tension with T-49's *"two edge exits each"*, which describes
  the route maps, where adjacency is 2.
- **The contract of five buildings is in the tree**, in the prompt that states it —
  `tools/comfy/trials/blackcheck2.json`, *"a tiny meadow hamlet of **only five buildings**"* — and in
  `tools/comfy/manifest.json`'s `_nodes` block, which itemises the same five.
- **The observed count of ten is NOT locatable here**, because the raster it was counted on is
  git-ignored. Recorded as the lane's reading rather than as a measurement, on this file's standing
  standard: not disproved, not evidence either. What the tree corroborates about size is the commit's
  own *"buildings ~14× [the ceiling]"*, which is a different defect from a count.

**Tiles move composition out of the model and into a text file.** The 64×64 layout is authored, it is
read by a program rather than sampled, and a contract violation in it is a `verify` failure with a
node id and a cell range rather than a picture somebody has to notice. **And the second half is worth
as much as the first: the painting and the collision mask are stamped from that one file**, so
painting↔collision correspondence is a property of the construction rather than something an art round
can drift away from. That is what dissolves T-57, and it is a better answer than either side of it.

**The judgement that the tiled map is the better map remains a JUDGE'S, and is still marked as one:**
*"the generated image is the better picture, the tiled image is the better map, and it is the only one
of the two that can ship."* The owner has not said that sentence. **What he has ruled is the method**,
and the quote is above.

### What is actually in the tree, and what is not

✅ **THE COMPOSER IS NOW IN THE REPOSITORY, AND THIS SUBSECTION SAID THE OPPOSITE.** It read *"OUT,
AND THIS IS THE LOAD-BEARING HALF: THE TILE COMPOSER IS NOT IN THE REPOSITORY … the tiled maps are a
TRIAL whose only copy is untracked, and any agent running `git clean -xfd` in this shared tree deletes
the pipeline outright."* **That was true and is now false**, closed by two commits — `f0da7c7` *"land
the tile composer's source, which was untracked and unrecoverable"* and `9b9accd` *"land the shipping
tile set — all twelve nodes now compose."*

**IN, committed, and measured this pass.**
- The twelve hand-authored layouts at `tools/mapgen/layouts/*.txt`, all 64×64 with a closed alphabet;
  `tools/mapgen/legend.ts`, fifteen cell kinds each carrying an explicit `blocks` flag; the seeder's
  refusal to overwrite a hand-edited layout; and `npx tsx tools/mapgen/run.ts verify` at **12 of 12**.
- **`tools/mapgen/compose/` — 169 tracked files**, of which **157 are tile PNGs**
  (`git ls-files 'tools/mapgen/compose/tiles/*.png' | wc -l` → 157), plus `compose.py`, `lib.py`,
  `verify.py`, `deliver.py`, `look.py` and `manifest.json`. `git status --porcelain` on that tree is
  empty.
- **All twelve nodes compose, run rather than inferred.** `python3 compose.py ../layouts/<id>.txt
  <out>.png`, twelve times: **12 of 12, every output 1024×1024, ZERO off-palette pixels against the
  frozen 32**, unique opaque colours **16–30** per node (sanctum 16 · r5 17 · r4 18 ·
  sanctum-approach 18 · r1 20 · r3 20 · r2 23 · cindershelf 29 · duskhollow 29 · bowerdeep 30 ·
  brackwater 30 · hearthollow 30).
- **It is deterministic and it proves it.** Two independent runs are byte-identical, `verify.py`
  refuses a `random` or clock import in either source file, and the sha256 of a fresh hearthollow and
  brackwater **match the shas recorded in `tools/mapgen/compose/manifest.json`** — so the manifest is
  a check rather than a sentence, which is the standard the palette manifest had to be repaired to
  meet (item 7).
- `tests/gates/layout-encounter-contract.test.ts` — **20 tests, 20 passing**, re-run this pass. It was
  19 and gained a third direction; see item 54.

⛔⛔ **AND HERE IS THE THING SOMEBODY OPENING THOSE TWELVE PNGs WOULD OTHERWISE CONCLUDE IS FINISHED,
BECAUSE THEY LOOK FINISHED: THE REGION HAS SIX BIOMES AND THE COMPOSER HAS ONE MATERIAL VOCABULARY.**
The twelve compositions are **structurally correct and not correctly coloured.** `data/nodes/*.json`
declares `biome` (`core/schemas.ts:214`) over six values — **Meadow, Marsh, Forest, Steppe, Vale,
Sanctum**, two nodes each. `compose.py` holds `MEADOW`, `MARSH` and — since `579169f` — `CINDER`, and
dispatches on:

    MATERIALS = {"hearthollow": MEADOW, "brackwater": MARSH, "cindershelf": CINDER}

⚠ **Three separate defects sit in that one line, and they must not be collapsed into "biome art is
pending".**
1. **It is keyed by LAYOUT FILENAME, not by `biome`** — the field that actually carries the answer is
   never read — **with a silent `MEADOW` fallback** (`materials_for`). Nine of the twelve nodes reach
   it by falling through. ⛔ **`r4` is the sharpest case and it is no longer hypothetical: its biome is
   `Steppe`, the same as cindershelf's, a Steppe-shaped table now EXISTS in the file, and `r4` does
   not get it** — because only the string `cindershelf` is listed. **A correct table in the tree that
   the node sharing its biome cannot reach is the filename key doing exactly what it was flagged for.**
2. **`MARSH` IS `MEADOW`.** `MARSH = dict(MEADOW)` then re-states `":"` with the value it already had;
   re-measured after `CINDER` landed, `MARSH == MEADOW` is still `True`, with **no differing keys**.
   So the count of DISTINCT tables is **two, not three**, and *brackwater* paints from the meadow
   vocabulary as surely as `r2` does. The
   file is honest about why in its own comments — nothing in either drawing lane ever drew a plank,
   and *"this composer does not draw art"* — but a documented placeholder and a second table are not
   the same object, and this file has repeatedly been wrong by counting the intent instead of the
   effect.
3. **The failure is SILENT, in a file whose own contract says it will be loud.** `compose.py:70-72`:
   *"A character with no entry is a loud failure, never a silent flat fill."* Nothing ever trips it,
   because every layout draws from the six characters the one table already covers (`, . : ^ o ~`) —
   **so the guard is real, correct, and structurally incapable of firing on the defect that exists.**
   Same shape as every stub-blindness entry in item 39.

**So the correct statement is: THREE nodes are right and NINE are painting somebody else's biome.**
⚠ **Updated mid-pass — a `CINDER` table landed in `579169f` and cindershelf moved into the correct
column.** `hearthollow` is Meadow and mapped to Meadow; `cindershelf` is now mapped to its own
`CINDER`; `r1` is Meadow and correct *by fallback accident*. Wrong: `brackwater`, `r2` (Marsh),
`bowerdeep`, `r3` (Forest), **`r4` (Steppe)**, `duskhollow`, `r5` (Vale), `sanctum-approach`,
`sanctum` (Sanctum).
⛔ **AND `r4` IS THE FILENAME-KEYING DEFECT BITING EXACTLY WHERE IT WAS PREDICTED TO.** `r4`'s declared
biome is **Steppe — the same as cindershelf's** — and a Steppe table now exists, **and `r4` does not
get it**, because dispatch keys on the layout's filename and only `cindershelf` is listed. **A correct
table is in the tree and the node that shares its biome falls through to meadow.** Re-measured:
`MEADOW == MARSH` is still `True`, and `MATERIALS` now holds three keys.
**The families still to be cut are Forest (~50 tiles), Vale (~8) and Sanctum (~22), plus a Marsh that
is real rather than an alias, plus the dispatch reading `biome` so Steppe reaches `r4`** — and
`git ls-files tools/mapgen/compose/tiles/` holds **no** forest, vale, sanctum or marsh ground kind —
outside the meadow set (short-grass, tall-grass, turf) and the seventeen `cinder/` tiles, there is
nothing. ⚠ **Say "committed" rather than "exists", because the two came apart three times during this
pass**: `tiles/cinder/` appeared **untracked** with 17 files mid-write, was committed in `579169f`
before the write finished, and `vale-heather-*` — a tile the owner has approved — **is still tracked
nowhere** (`git ls-files` returns 0) and is deliberately being held out until the Vale family can land
with it (item 53). **An untracked tile is a tile one `git clean` from gone.**

⚠ **A BRIEFING THIS PASS INHERITED SAID "SIX NODES PAINT AS MEADOWS" AND NAMED THE MISSING FAMILIES AS
"Forest, Vale, Sanctum and an ash/basalt family for cindershelf". BOTH HALVES WERE CORRECTED, AND IN
THE DIRECTION THAT MAKES IT LARGER.** It was **ten** nodes, not six, because Marsh is an alias — nine
now that `CINDER` has landed. And **cindershelf's declared biome is `Steppe`, which it SHARES with
`r4`** — so the family the schema asks for is `Steppe`, not a cindershelf-specific one. ⛔ **That
distinction is load-bearing and the tree has now demonstrated it rather than merely risking it**: the
table that landed is keyed `cindershelf`, so `r4` still paints as a meadow. **And the reason a
per-biome table alone will not do is item 53's open conflict** — `tools/comfy/manifest.json` forbids
grass *at cindershelf specifically*, twice, while `r4` carries no such clause. **A single `Steppe`
vocabulary cannot satisfy a per-node prohibition and a per-biome table at the same time**, so whether
this ends as a `Steppe` family with a cindershelf override, or two families, is **entangled with a
question the owner has not answered.** Recorded open under G2; an agent may not pick.

⚠ **And `tools/mapgen/compose/manifest.json` already carries a claim its own tree does not support** —
it lists `v2/ground/` as holding *"plaza x8 loaded but unused"* and **no plaza tile is committed.** A
derived artefact carrying a hand-written claim, on day one of the artefact's life. Fix it where the
section on that shape says to: derive it, or make the generator refuse to write it.

⛔ **THE COMPOSED PNGs ARE DELIBERATELY NOT SHIPPED, AND THAT IS A RULE RATHER THAN A BACKLOG.** None
of the twelve is in `assets/final/maps/`, and none should be dropped there in a batch. **A node's
painting lands with its collision mask, one commit per node**, because a layout-derived mask is only
correct against a painting composed from that same layout — the per-node rule already stated below and
in item 43. **Nine nodes in `assets/final/maps/` are still GENERATED images**, and that was re-checked
this pass by a method that can actually tell them apart rather than by trusting provenance: matching
every 16×16 cell against the 130 committed 16×16 tiles, the nine shipped maps score **0 of 4096
(0.0%)** and a composed output scores 6.1–28.4%; distinct-cell share runs **47.1–99.7%** shipped
(`r1` is 4084 of 4096) against 6.9–19.1% composed. **A tile composition reuses cells and a diffusion
image does not.** ⚠ **Palette conformance CANNOT discriminate them** — both sides read zero
off-palette — which is one more way of saying the palette was never the axis this decision turned on.

### ⛔ WHAT THE COMPOSED MAPS DO NOT YET DO — read this before opening one and concluding it is finished

**Six things, five of them open defects and one an expected failure that must not be "fixed".** They
are here rather than in the ticket queue because the failure mode this section keeps guarding against
is somebody opening a palette-clean 1024² PNG of the right shape and reading it as done. **The
compositions are structurally correct. They are not the authored region.**

1. ⛔ **THE ENCOUNTER TERRAIN DOES NOT READ AS WALKABLE, AND THIS IS A NAMED ACCEPTANCE CRITERION —
   the owner asked for criterion 6 by name and it is NOT MET.** Viewed at a real 240×160 window at 3×,
   cindershelf's `,` mass reads as **rubble** rather than as ground a player walks into: `,` and `R`
   are both warm cracked rock, told apart by **texture and keyline, not by value** — and value is what
   carries at 3×. ⛔ **The sharper form is a COLLISION defect rather than a legibility one**: `R`
   blocks and `,` does not, so the two the player cannot separate are *the field he may walk into* and
   *the rock he may not*. ⚠ **FOUR luminance gaps have now been quoted for that pair and none carries
   its operator — the four, plus an independent reading with its corpus named, are in item 53**; the
   structural claim rests on none of them. ⏳ **A measured fix exists and is deliberately NOT LANDED**:
   the vale-heather tile the owner approved for the `,` slot is reported to take the separation to
   **53.4** and the seam check to **PASS ×0.90**, and it is being held until the Vale family can land
   with it (item 53). **Do not record this as fixed.** The lane describes the remedy as one more tile
   pass rather than a structural problem, and that judgement is theirs, not this file's. **Record it
   at full weight anyway**: an unmet criterion the owner named is not a polish item.
2. ⛔ **NO GLOWING ORANGE FISSURES, WHICH THE SUBJECT LINE EXPLICITLY NAMES.**
   `tools/comfy/manifest.json` `_nodes.cindershelf.feature` calls for *"steam vents and glowing orange
   fissures"*; the generation for them returned pale volcanic sand and produced nothing usable, **so
   the family has no ember pixel at all.** The authored feature is absent rather than approximated.
3. ⚠ **THE ASH IS NOT BLACK, AND THIS IS A PALETTE FACT RATHER THAN A CUTTING FAILURE.** The frozen 32
   holds **no dark neutral** between `#272940` and `#74564e`, so the darkest motif-free walkable ground
   available reads **mauve**. **Independently checked here, and it holds**: sorted by Rec.709 luma the
   only four swatches in that gap are `c17 #054114` (chroma 60, dark green), `c31 #303271` (65,
   blue-violet), `c05 #642c16` (78, dark red-brown) and `c08 #c72a1b` (172, red) — **not one of them is
   low-chroma**, and the neighbours bounding the gap, `c30 #272940` (chroma 25) and `c06 #74564e` (38),
   are the only near-neutrals anywhere near that band. **A black ash would need a palette change, which
   is the owner's and is NOT being proposed here.**

   ⛔ **AND THIS CLAIM SURVIVES THE STRUCK ONES AROUND IT — DO NOT SWEEP IT UP WITH THEM. It is a
   different claim from the contrast defect, and both are true.** *"A black ash is unavailable"* and
   *"the walkable/blocking separation is unreachable"* are **not** the same statement, and merging them
   produces the false conclusion that the palette caused the contrast defect. **Re-measured here:**
   every entry in the `#272940`–`#74564e` window is strongly chromatic (chroma **60–172**) and the only
   neutral in it is `c30` itself, which is navy — **so a black ash is genuinely unavailable.** ✅ **But
   a 55–130 warm separation is readily available, so the CONTRAST defect was a RECUT, not a palette
   limitation.**

   ⚠ **AND THE CONSTRAINT IS HOW THE TILES WERE DRAWN, NOT WHAT COLOURS THEY HAD. This paragraph
   claimed the opposite and is corrected — the correction is the useful half.** It read: *"A pure `c07`
   plate reads 95.47 and a pure `c05` plate reads 58.24, so ANY reshuffle within that shared set is
   capped at a separation of ~37.23… a different material was structurally required."* ⛔ **37.23 is
   the spread of the `c05`/`c07` PAIR. It is not a cap on re-proportioning, and treating it as one
   turned a fact about two inks into a false claim about the palette.**

   **Measured over the entries actually present in the committed tiles** — ash-scrub carries six
   (`c05` 58.6% · `c07` 26.8% · `c00` 7.0% · `c04` 4.3% · **`c09` 2.7%** · `c06` 0.6%), basalt-rock
   five (`c07` 62.5% · `c00` 16.6% · `c05` 9.7% · `c04` 7.3% · `c06` 3.9%):

   | proportions free, entries unchanged | achievable mean luminance |
   |---|---|
   | ash-scrub | **3.87 – 125.16** (`c00` – `c09`) |
   | basalt-rock | **3.87 – 95.47** (`c00` – `c07`) |
   | ceiling using only the **five entries BOTH tiles carry** (extremes `c00` 3.87 and `c07` 95.47) | **91.60**, available in **either** direction |
   | ceiling once ash-scrub spends its **`c09`** (125.16) | **121.29**, and **only with the WALKABLE tile brighter** |
   | `c05`/`c07` pair spread only | *37.23 — the figure that was mistaken for a cap* |

   ⚠ **BOTH CEILINGS ARE TRUE OF DIFFERENT QUESTIONS AND EACH IS USELESS WITHOUT ITS CONDITION — which
   is the whole point of this passage, since a bound stated without its condition closes options that
   are open.** `c00` and `c07` are the darkest and lightest entries **both** tiles carry, so the 91.60
   ceiling holds whichever tile is made the brighter one — **including the shipped sign, walkable
   darker.** **121.29 is not available in the shipped sign at all**: it needs `c09`, which is in
   ash-scrub and absent from basalt-rock, so reaching it means making the **walkable** tile the bright
   one and inverting the convention. **Quote the number with the direction, or it recommends a recut
   that flips the sign rule.**

   **Either way, re-proportioning the colours these tiles already contain reaches 91.60 — past the 41
   floor and past the 70.5–77.2 aim.** ⚠ **And `c09` at 125.16 was already sitting in the WALKABLE tile
   at 2.7% and is absent from the blocking one** — the rung the heather fix reached for was in the
   drawer the whole time.

   ✅ **THE TRUE CLAIM, WHICH IS WEAKER AND IS THE ONE THE MEASUREMENT SUPPORTS:** no re-proportioning
   that keeps **both tiles `c05`/`c07`-dominant** gets anywhere near the aim — and both are, at
   **85.4%** and **72.2%**. ⚠ **Measured exactly, holding those dominances and pushing each remainder
   to its extreme (scrub's to `c00` 3.87, rock's to `c06` 94.06), the ceiling is 44.80** — scrub floor
   50.27 against rock ceiling 95.07. ⛔ **So a dominance-preserving recut SCRAPES PAST THE 41 FLOOR and
   comes nowhere near the 68 AIM.** State it that way: not *"cannot clear the bar"*, which depends on
   which bar is meant, but **44.80 against a round 41 floor (43.40 measured) and a 70.5–77.2 aim.**

   ⛔ **WHY THIS MATTERS RATHER THAN BEING PEDANTRY, and it is the reason the weaker claim is the one
   to keep.** The struck version says the heather swap was **structurally required**. The true one says
   it was **one correct answer among several** — a darker, more strongly shaped ash is another, and a
   redraw separating on **texture or silhouette** rather than on mean value is not subject to a
   luminance ceiling at all. **Recording it as forced would tell a future recut that the colour set
   defeated it, when what actually defeated it was three redraws that all stayed inside the same two
   dominant inks.** That is more useful to the next person and **less flattering to the pipeline, which
   is usually the sign it is the true one.**

   ⚠ **KEEP THIS SEPARATE FROM THE PALETTE CLAIM DIRECTLY ABOVE.** *"The ash cannot be black"* **is** a
   genuine palette limit — the window holds no dark neutral. *"The two materials could not be
   separated"* **is not** — it is a drawing decision. **Two adjacent claims, one true of the palette and
   one true of the draughtsman, and merging them produces the false conclusion that the palette caused
   the contrast defect.**

   ⚠ The lane's earlier figure — *luminance 84* — is quoted without its operator and does not match
   Rec.709 luma on `c06` (91.8) or `c18` (83.6); on this file's own standing rule a bare luminance
   figure without its definition is not re-measurable, so **the structural claim is recorded and that
   number is not.**
4. ⛔ **NONE OF THE AUTHORED STRUCTURES IS PAINTED, ON ANY NODE — and this belongs at the same
   prominence as the six-biomes item above.** Five **generic houses** stand on cindershelf where
   `tools/comfy/manifest.json` names a relic forge with a smoking chimney, a squat gym forge of basalt
   block, an inn, a shop and a boarded store. **This is true of all twelve nodes.** The composer places
   the right number of buildings, in the right footprints, with doors the layout agrees with — and they
   are *houses*, drawn from four roof-hue variants of one hand-drawn kit
   (`tools/mapgen/compose/tiles/v2/handdrawn/{blue,green,ochre,red}`, 22 pieces each). **So the maps
   are the region's SHAPE and not yet the region's CONTENT**, and a reader who checks the building
   count against the manifest and stops there will get a pass on a map that has none of the named
   buildings in it.
5. ⛔ **A SEAM CHECK FAILS ON THREE NODES, AND TWO OF THEM PREDATE THE CINDER FAMILY.** `verify.py`
   reports `FAIL SEAMS` at **×2.55** on cindershelf, **×1.22** on hearthollow and **×1.27** on
   brackwater — the latter two already failing at HEAD. **Say it that way round**, because a reader
   given only cindershelf's number files it as a cinder-family defect when two thirds of it is the tile
   set generally. **Cindershelf's is twice as bad and is not a low-denominator artefact**: its
   `ash-scrub` field measures joins **22.20 vertical / 26.13 horizontal** against `ash-open`'s
   3.55 / 5.37 and path's 0.10 / 3.70. ⏳ **The pending heather swap is reported to take cindershelf's
   to PASS ×0.90 and does NOT touch hearthollow's or brackwater's**, which is the half a "seams fixed"
   report would drop.
6. ✅ **AN EXPECTED FAILURE, RECORDED SO NOBODY MAKES IT GREEN.** `tools/mapgen/compose/verify.py:454`
   asserts `len(hues) >= min(4, buildings)` — *"%d roof hues over %d buildings"* — and it **FAILS on
   cindershelf on purpose**, because green roofs are excluded on that node to preserve its
   **zero-green** property. **That failure is correct.** ⛔ Do not widen the check, do not add a green
   roof to cindershelf, and do not read "the composer's verifier is not fully green" as unfinished
   work. It is the same shape as the hearthollow palette red: a gate reporting a deliberate state.

⚠ **AND A SMALL ONE THAT WILL BE BELIEVED, BECAUSE IT IS A COMMENT ON THE LINE IT DESCRIBES.**
`compose.py:68-70` labels its three ink constants with swatch ids, and **two of the three ids are
wrong**: `SHADOW = (0x27,0x29,0x40)` is annotated `# c03` and is actually **c30** (`c03` is
`#faf7eb`, the brightest swatch in the palette), and `SAND = (0xC8,0xBC,0xA5)` is annotated `# c22` and
is actually **c12** (`c22` is `#89b935`, a green). Only `KEYLINE`'s `# c00` is right. **The RGB values
are correct and on-palette** — which is why nothing goes red and why the compositions still measure
zero off-palette — **so this is purely a false label, and it is the exact hazard item 2 names: a
palette id is a SLOT, not a colour.** Anyone re-pointing these by id after a re-freeze would paint the
shadows near-white.

**`tools/mapgen/render.ts` is NOT the stamper, and it is easy to mistake for one.** It writes the two
*derived* images per layout — the collision mask, through the engine's own `maskRasterFrom`, and the
flat ControlNet control image. **It never paints a map.**

### What the tiling settles — and it is no longer conditional

⚠ **This subsection was headed *"What the tiling WOULD settle, if it is adopted — recorded as
conditional, not as done"*. The condition it was waiting on has been met by the ruling above, so the
conditionals are removed rather than left standing as hedges nobody re-reads.**

**T-57 stops being a choice and becomes a construction.** Its open question is *when the painting and
the collision layout disagree, which is authored first* — and under tiling the question **dissolves
rather than being answered**: the painting and the mask are both stamped from the same 64×64 text
file, so they cannot disagree. The layout is authored; both images are downstream. **That is better
than either side of T-57**, and T-57's own *done when* names this exact route — *"Hank rules which
artefact is authored first — **or rules on tile composition, which answers this by construction**."*
**He has ruled on tile composition.**

⚠ **BUT IT DISSOLVES PER NODE, NOT AT A STROKE, AND THE DIFFERENCE IS THE WHOLE OF T-56.** The
correspondence is a property of a *composed* painting. **Nine of the nodes on disk are still generated
images that no layout produced**, and for those nine the disagreement T-57 describes is exactly as
live as it was. So the ruling changes T-57 from *a question awaiting an answer* to *an answer awaiting
its nodes*, and the operative rule is unchanged and is the one immediately below.

⚠ **THE COLLISION-MASK RULE, AND IT IS PER NODE — the looser version reintroduces the exact defect it
replaces.** This supersedes the blanket *"do not ship generated masks"* in item 43. The rule:

> **A node may ship its collision mask on the same commit that ships its TILED painting, and not
> before.** A mask derived from a layout is only correct against a painting composed from that same
> layout.

**Nine nodes in `assets/final/maps/` are still generated images** (ten tracked; hearthollow deleted),
and none of them was produced from a layout — four independent signals say so and are recorded in item
43. **A layout-derived mask against one of those still blocks the painted road and leaves the painted
buildings walkable.** The blanket rule and the per-node rule agree today, because zero nodes have a
tiled painting; they diverge the moment one does, and the per-node one is the one to carry.

⚠ **AND THE COUNT OF GATES THAT RED ON A MASK IS THREE, NOT ONE — T-56's briefing is corrected.**
All twelve nodes declare `collisionMask` at `assets/final/maps/<id>-mask.png` and **zero of the twelve
exist**, checked one path at a time. Three committed tests assert that absence and each is written to
go red the day it stops being true: `tests/unit/manifest.test.ts:1432` (now over **all twelve** nodes,
widened this session from `r1` alone, with the message *"a collision mask shipped — see T-56 before
touching this"*), `tests/unit/collision.test.ts:471-491` (*"STATES THE GAP: not one node's declared
mask is on disk, so the synthesised branch IS the game"*), and `tests/unit/overlay-diff.test.ts:1086-1095`.
**That is the recalibration T-56 describes, and it is now three files rather than one.** Twelve
layout-derived masks do exist, git-ignored, at `assets/raw/_layouts/masks/mask-<id>.png`; nothing in
`data/`, `game/` or the served copy points at them, and promotion is still T-56 behind T-57.

### ✅ The encounter mask — derivable exactly, and the engine half has LANDED (**T-65**)

Tall grass is a **cell kind** in the layout — `,`, the legend's `scrub` row, `blocks: false` — so a
per-node encounter mask is now derivable **exactly** rather than by colour-matching a painting.
`tests/gates/layout-encounter-contract.test.ts` already binds `,` to that legend row by identity.

✅ **AND THE ENGINE HALF IS NO LONGER OWED — this subsection said "nothing has started on it" and that
is false as of `240a16d`.** `core/foodweb.ts` `encounterMaskFromLayout` builds the mask,
`game/encounters.ts:279` `encounterMaskFor` resolves it per node and returns `null` — never an empty
mask — for a node that declares none, and **`game/scenes/OverworldScene.ts:2605` calls it on the live
path.** 177 tests pass across `tests/unit/encounter-mask.test.ts` and the two layout gates. **The
single-draw constraint below was preserved rather than worked around** (*"a step off the grass still
costs exactly one draw"*), and G3 is separately bound: the mask decides WHETHER a step meets something
and never WHICH animal. **The paragraph that follows is kept because it is the reason the
implementation took the shape it did, not because it is still owed.**

**The engine half as it stood before that landed:**
`balance.encounter.encounterTileFraction` is **0.25** (`data/balance.json:422`) and it is a **SCALAR,
not a spatial mask**: `stepEncounterChance` (`core/foodweb.ts:223-225`) is
`encounterTileFraction × encounterChancePerStep`, one product, and `rollForayStep`
(`game/encounters.ts:259`) takes **no tile, no column and no row** — so an encounter rolls at the same
rate on every walkable cell of a node, grass or not.

⚠ **THE SINGLE DRAW IS NOT AN IMPLEMENTATION DETAIL AND THE MIGRATION MUST PRESERVE IT.** The
function's own header says why (`core/foodweb.ts:216-218`): *"Collapsing the two factors into ONE draw
is deliberate and load-bearing: L10 requires that a replay of the same seed meets the same creatures,
and the draw ORDER is the contract. A second draw for the tile would renumber every draw after it and
desynchronise every existing fixture."* **A per-tile mask sampled as a second `rng` call breaks every
determinism fixture in the repository.** The migration is already written down in the code that owes
it — `game/encounters.ts:134-135`: *"the fraction becomes a sampled property of the node's encounter
mask and this function takes the node — the product, and the single draw, stay exactly as they are."*
**Nothing anywhere in `game/` or `core/` reads a layout today**; the only per-cell encounter counting
in the tree is inside the gate's test file.

⚠ **And one clause of that forward commitment has EXPIRED without going red.** `core/types.ts:1076-1077`
justifies the scalar with *"no maps exist yet — `assets/final/` holds one empty file and 287 of 288
manifest rows are unstarted."* Ten maps landed. The mask half of the same sentence is still true; the
map half is a year out of date and nothing will ever announce it.

**Measured, per node, using the legend's own `blocks` flags as the
definition of walkable** — the share of walkable cells that are `,`:

| routes (r1–r5) | towns (5) | sanctum nodes |
|---|---|---|
| **24.10% – 25.99%** | **5.46% – 10.16%** | sanctum-approach 23.53%, sanctum **31.02%** |

r1 24.10 · r2 24.67 · r4 25.16 · r3 25.27 · r5 25.99 · hearthollow 5.46 · brackwater 6.55 ·
cindershelf 8.05 · bowerdeep 8.83 · duskhollow 10.16. **These are what the single 0.25 would be
replaced by**, and the spread is the point: a town would fall to a fifth of the shipped rate and a
route would stay near it.

⚠ **THE `~` CELL IS WHY THIS HAS TO BE MEASURED THROUGH THE LEGEND AND NOT BY HAND.** `~` (shallow)
is `blocks: false` — *"walkable water margin — wadeable, not a wall"* — and a hand-typed walkable set
that omitted it inflated r1, r2 and r5 by counting their wade margins as solid. **Commit 31987b8's
own table carries the inflated figures** (r1 25.5%, r2 33.8%, r5 26.4%); the twelve layout **headers**
carry the correct ones and agree with the legend-derived measurement above. A commit message is not a
measurement, and here the file it landed disagrees with it.

⚠ **AND THE SANCTUM NODES ARE OUTSIDE THE ROUTE BAND — do not write "routes run 24–26%" without
saying which nodes that names.** Stated over all seven non-town nodes the range is **23.53% – 31.02%**.

---

## ⛔ YEAR-VARIANT MAPS ARE A STRETCH GOAL — THE OWNER SAID SO FIRST-HAND, AND §9.5 WAS DESCRIBING A PIPELINE THAT NO LONGER EXISTS

Two separate things happened to the same feature and they must not be collapsed into one. **The owner
demoted it**, and **independently of that, the method the build doc specified for it had already
stopped existing.** Either alone would be worth writing down; together they mean a careful reader of
§9.5 was being sent down a path with nothing at the end of it.

### The ruling — FIRST-HAND, to this session's transcript, not relayed

> **"We are going to get rid of that as a current goal and make it a stretch goal for the future. The
> year changes, that is. If there was an easy way to put a filter for season changes, that'd be great
> to keep, but otherwise we can ditch that too."**

**Provenance, stated the way this file states every other one:** said directly, in this session, in
answer to nothing an agent proposed. It is **not** a relay from another lane, and it is **not** a
consequence somebody drew from a sentence of his — it is the sentence. This matters for exactly the
reason the standing rule in `docs/TICKETS.md` gives: a first-hand ruling recorded loosely ends up
looking like the softer of two records, and the tiled-maps ruling above is in this file twice because
that already happened once.

It is now **§15 stretch item S6** in the build doc, and §9.5, §1, §7.5, §9.7 and §13 all carry the
demotion.

⚠ **IT SUPERSEDES CUT LINE C-2, AND SAYING SO IS THE POINT.** C-2 read *"year variants beyond year 2
for non-slice nodes"* — i.e. it permitted cutting variants **only** past year 2 and **only** away from
Hearthollow / R1 / Brackwater / R2. The ruling covers the slice nodes and year 2 as well, so **C-2 no
longer describes the binding decision** and nobody should quote it to argue a slice-node year-2 variant
is still owed. C-2 is struck through rather than deleted in the build doc, because the 28 manifest rows
were generated to its shape and `tests/unit/manifest.test.ts` still names it.

⚠ **DEMO BEAT 1 IS NOT CUT. ITS MAP THIRD IS DEFERRED.** Build-doc §1 beat 1 is *"hammer a prey species
in year 1; open year 2 with its predator gone, a new apex risen, **and the aged map**"*. The ecology
two-thirds are **built and gated**: `tests/integration/demo-beats.test.ts` is I2, and it ran green here
— `1 passed (1) · 6 passed (6)`, watched, not inherited from a previous pass. The aged map is the third
that the owner has now deferred. **Record it that way in both directions**: do not let "beat 1 is
never-cut" be read as an obligation to ship variant art, and do not let "year variants are a stretch
goal" be read as licence to touch the cascade half.

### What §9.5 actually said, and why it was false

Verbatim, the whole of the old body paragraph:

> *"img2img on the approved base map, denoise start 0.35, prompt appends the node's aging arc (bible
> §6: "docks rot", "canopy thins", "vents flare", …), layout frozen; every candidate runs
> `overlay-diff` (§8.2) before entering the node JSON. Budget: ≤ 3 regen attempts per variant, then
> that year reuses the nearest passing variant (visual continuity beats variant count)."*

**The false clause is "img2img on the approved base map", and it is false because there is no generated
base map any more.** Verified here, not taken on report: `tools/mapgen/layouts/` holds twelve 64×64
ASCII layouts (one character per 16-px collision cell — `hearthollow.txt` is 154 lines including its
header commentary, 93 characters to the row); `tools/mapgen/compose/compose.py`'s own docstring opens
*"paint one 1024x1024 map PNG by stamping tiles per collision cell"*; `tools/mapgen/land.ts` lands the
painting **and** the mask from that same text file into `assets/final/maps/`, where twelve maps and
twelve masks now sit. The composer is deterministic by FNV-1a hash of `(col,row)` — no `Math.random`,
no clock (G11) — and `verify.py` asserts it by composing twice and diffing.

**This is the same shape as the L7/G1 problem this file records above, pointed the other way.** There,
a canonical doc forbade work the owner had ordered, so the more carefully an agent read it the more
reliably it refused. Here, a canonical doc *described a process that no longer runs*, so the more
carefully an agent read it the more reliably it went looking for an approved base map to denoise. Both
failures are invisible to a test suite and both punish diligence.

**What was NOT wrong, and is preserved rather than erased:** the intent. The aging arcs are authored
content and still valid — `docs/content-bible.md:153-160` (the Towns table's **Aging arc** column, six
arcs) and `docs/content-bible.md:168-169`, verbatim, *"**Routes have no aging arc here**; a route
inherits the arc of the town sharing its biome"*, which is how six arcs cover twelve nodes. The 28
`map-variant` manifest rows already append the arc and the year to the base subject exactly as §9.5
specified — `map-hearthollow-y2` ends *"…, 2D game asset, fields flourish or wither with Route 1 health,
year 2 of six"* — and the route rows carry their town's arc verbatim, `map-r1-*` Hearthollow's,
`map-sanctum-approach-y2` the Sanctum's. **So what changed is the METHOD, not the intent.** §9.5 now
says that in those words.

⚠ **THE BIBLE IS NOT EDITED FOR THIS AND SHOULD NOT BE.** `docs/content-bible.md:153-160` and `:167-169`
describe **authored content and its intent**, both of which survive intact; the demotion is a *schedule*
decision and the build doc is where schedule lives (CLAUDE.md: where the two overlap, the build doc
wins). ⚠ The one line to read carefully is `docs/content-bible.md:167` — *"The **Aging arc** column stays
on the calendar: a player who rushes sees a younger town, correctly."* **That is the intent, not shipped
behaviour.** No town's art changes with the calendar today; what changes on screen with the year is the
tint's `yearDarkening` term. Nobody should read `:167` as a description of the running game.

⛔ **DO NOT DELETE THE 28 MANIFEST ROWS.** They are the authored record this stretch goal restarts from,
`tests/unit/manifest.test.ts` binds their count, their `mode: "img2img"`, their `initImage` (each node's
own `mapAsset`), their denoise (against `balance.overlayDiff.denoiseStart`, not a literal) and their
overlay-diff `gate` string, and that file is currently held by another lane.

### The first thing S6 must decide is a GUARDRAIL problem, and it is worth more than the feature was

**Every authored aging arc is CONDITIONAL. `yearVariants` is not.** Four of the six branch outright:
*"fields flourish **or** wither with Route 1 health"*, *"docks rot **or** get rebuilt"*, *"canopy thins
**if** Barkhide over-caught"*, *"vents flare, mine expands **or** closes"*. But the schema is
`yearVariants: Partial<Record<2|3|4|5|6, string>>` — `core/types.ts:162`, `core/schemas.ts:218` — **a
flat key per year with no branch in it**, and each manifest row carries **both outcomes in one subject
string**, because a prompt can hold an ambiguity and a filename cannot. **Nothing anywhere in the tree
says which branch a save takes, or where that would be read.** `mapAssetForYear` resolves by year and
by nothing else.

⛔ **A map that always withers regardless of how the region was played is a SCRIPTED CASCADE, and G6
forbids scripting the cascade — it must emerge from the §7.3 rules.** So the naive revival — one image
per year, wither ladder — is not merely thin, it violates a guardrail: it is the sim's outcome
pre-decided in a file path, at the one node the demo beat is about. **Which means the branch is
plausibly the feature and not an omission in it**, and either way it is a content decision.

**RECORDED OPEN, NOT RESOLVED (G2).** It is in the *Waiting on the owner* register below. An agent may
not pick a branch, may not decide the arcs are decorative, and may not decide one image per year is
"close enough" — those are three different ways of inventing a value. Whoever picks S6 up starts from
the ruling, not from the ladder.

### The 28 rows are unevenly spread ON PURPOSE — this is the shape, not "28 of 60 missing"

Measured off `tools/comfy/manifest.json`: `hearthollow`, `r1`, `brackwater`, `r2` carry **y2–y6, five
each**; `bowerdeep`, `r3`, `cindershelf`, `r4`, `duskhollow`, `r5`, `sanctum-approach`, `sanctum` carry
**y2 only**. 4×5 + 8×1 = **28**, inside §9.7's cap of 30, matching what C-2 used to permit. The other
eight nodes resolve **downward** for years 3–6, which is what §7.5 step 6's fallback is for. The
manifest states this itself in `_yearVariantPolicy`, and `manifest.test.ts` binds it by name, including
`expect(byId.has('map-sanctum-y3')).toBe(false)`. **Anyone diffing 28 against a mental 12×5 = 60 will
report a shortfall that was never authored.** Every one of the 28 is `status: "pending"` and the class
is `trialled: false` — the img2img graph was never trialled, so a revival's first run is a SUPERVISED
gate regardless.

### The season filter is KEPT, and it is decoupled — verified, not assumed

The ruling keeps the season tint if it is cheap. **It is already built and it does not touch the
year-variant path at all.** `MapView.setSeason` (`game/mapview.ts:452-456`) sets `this.season`,
recomputes `seasonTint(this.balance, season, this.year)` and calls `applySeasonTint` — **it never
touches the texture**; the texture swap lives in the separate `setYear`. `this.year` in that call is
the calendar year, which is what the tint's darkening term reads; it is not the variant asset.
`game/mapview.ts:451` states the spec on the line directly above: *"Hard Req 6 — season is a runtime
multiply, never a different texture."* **So demoting year variants costs the season filter nothing.**

⛔ **AND HERE IS A NUMBER THIS PASS WAS HANDED AND HAD TO CORRECT — THE FOUR ΔL FIGURES EVERYBODY IS
QUOTING ARE MEASURED ON THE WRONG COLOURS.** The figures in circulation are, on a mid-grey source,
Rec.601 luma, Phaser multiply `out = src × tint/255`: spring rgb(198,232,178) → **−19.7**, summer
rgb(255,224,160) → **−14.6**, autumn rgb(226,150,76) → **−45.5**, winter rgb(150,186,226) → **−37.7**.
**That arithmetic is correct** — reproduced here to two decimals: −19.74, −14.57, −45.53, −37.75. **But
those are the RAW AUTHORED PRESETS in `balance.seasonTint`, and the raw preset is not what reaches
`setTint`.** `game/season-tint.ts` `hueOf` first normalises each preset so its brightest channel is
exactly 255 — deliberately, because a multiply preset carries a dimming nobody asked for on top of the
one the spec names — and then applies `seasonBrightness` and `yearDarkening`. **Measured by running the
shipped `seasonTint()` itself, at `clock.startYear` (year 1):**

| season | authored preset | ΔL of the preset | **what `setTint` actually gets** | **ΔL on screen, y1** | ΔL on screen, y6 |
|---|---|---|---|---|---|
| spring | rgb(198,232,178) a0.10 | −19.74 | **rgb(218,255,196)** | **−8.93** | −56.56 |
| summer | rgb(255,224,160) a0.12 | −14.57 | **rgb(255,229,174)** | **−12.30** | −58.66 |
| autumn | rgb(226,150,76) a0.18 | −45.53 | **rgb(230,152,77)** | **−44.29** | −77.84 |
| winter | rgb(150,186,226) a0.22 | −37.75 | **rgb(127,157,191)** | **−51.75** | −82.32 |

**Two of the conclusions people are drawing from the preset figures are wrong, and one is worse than
advertised.**
1. **The spring/summer order INVERTS.** On the presets, summer is the brighter of the pair (−14.6 vs
   −19.7). On screen, **summer is the darker** (−12.30 vs −8.93 — spring is brighter). `seasonBrightness
   .summer = 1.15` cannot brighten a multiply, so `season-tint.ts` spends the surplus moving the hue
   toward white instead; summer is therefore *the least tinted season*, not the brightest picture.
2. **Winter, not autumn, is the darkest season on screen** (−51.75 vs −44.29). The preset table says the
   opposite, because winter's authored blue is normalised up and then scaled by `brightness 0.75`.
3. **The spring/summer collision is REAL and TIGHTER than the warning says.** The preset figures put the
   pair 5.1 apart; on the shipped path at year 1 they are **3.37 apart**, and by year 6 they are **2.10
   apart** (−56.56 vs −58.66). They separate on **hue**, not on brightness, and a green meadow is the
   worst case for that. **This is still an open art question**, and it should be decided against the
   numbers in the right-hand columns, not the left. ⚠ A twelve-map × four-tint contact sheet is
   **reported** to be rendering in the art lane for the owner to judge from; **that is a relay, not
   something checked here** — nothing matching it was found on disk during this pass, and the search
   was shallow. Confirm before waiting on it.

**The lesson is this file's own standing one, and it caught a figure that was otherwise fine:** the ΔL
values were quoted *with* their operator, which is what the project spent the day learning to demand —
and they were still the wrong numbers, because the operator named was the last step of a three-step
chain. **Naming the operator is necessary and not sufficient; name the INPUT too.**

### Two open items on the season seam

1. **THE SEASON SEAM HAD NO BEHAVIOUR TEST — AND A LANE LANDED ONE WHILE THIS SECTION WAS BEING
   WRITTEN, WHICH IS WHY THE ITEM READS THE WAY IT DOES.** The gap was real and is stated first: what
   covered `setSeason`, `seasonTintTable`, `SeasonTintPreset` and `applySeasonOverlay` was
   `tests/unit/balance-inv3.test.ts` BF-13, an **INV-3 balance-invariant** test by construction and by
   its own words — it retunes a hue in a *copy* of balance and asserts the 24-bit colour handed to a
   fake `setTint` moves. A real binding, and the right test for what it tests, **but it proves the file
   reads balance, not that the map changes colour when the season turns**; `applySeasonOverlay` appears
   in the test tree only inside a symbol→file census in `year-turn-ux.test.ts`.
   ⚠ **`tests/unit/season-tint-onscreen.test.ts` now exists and is aimed at exactly this**, driving
   `restAtInn` → `spendTicks` → `seasonBoundary` → `handleClockEvents` → `MapView.setSeason` →
   `setTint` through the real `OverworldScene`, with a §5 that proves its own recorder is not vacuous
   and a docblock that names the Proxy-swallows-`setTint` stub trap it was built to avoid. **It is
   another lane's in-flight work, not a landed gate**: at the moment it was read it was **untracked**
   and **RED** — `1 failed | 11 passed (12)`, `ReferenceError: minPairwise is not defined` at `:787`.
   ⛔ **Do not touch that file, and do not record the gap as closed on the strength of this note.** The
   failing case is *"the seasons separate on HUE, further than they separate on BRIGHTNESS"* — i.e. the
   one case that would measure the spring/summer collision below, and the one that is not yet running.
   **This item is a reading with a timestamp** (the standing rule in `docs/TICKETS.md`): re-run the
   file before believing either the gap or its closure.
2. ✅ **`yearDarkening` IS KEYED TO AN AUDIO CONSTANT — CONFIRMED, not merely flagged.** This reached the
   pass as "flagged, not confirmed, an agent is tracing it"; it is confirmed by reading the line.
   `game/season-tint.ts:249-253` is `clamp(1 - balance.audio.yearDarkenPerYear * min(elapsed, deepest),
   0, 1)`, and its sibling `seasonBrightness` (`:224-232`) reads `balance.audio.seasonBrightness`. **So
   the two magnitudes that decide how the painted map looks live in the `audio` group** — `audio` has
   exactly four keys and two of them are the map's. `balance.json`'s own `_seasonTint` note names them
   there and bible §12a is where the aging-darkens idea comes from, so this is a shared constant rather
   than a typo, and moving it is a schema change with an INV-3 gate attached. **It is not a defect and
   it is not urgent. It is a trap**: an agent grepping `balance.json` for a *visual* year-darkening key
   finds nothing, and an agent retuning `audio` to fix a sound changes the picture.

---

## Verified state

**Re-measured on 2026-08-27, one complete run, on a tree that is for once nearly clean.** What landed
since the last readings: **the economy primitives, the dialogue `grants` key, the shop row model and
the live wiring that puts all three on the save**; **the cascade gate's seasonal-window correction**;
**Scrounge healing by the HP that actually left the target**; **the twelve hand-authored map
layouts, their contract gate and the seeder refusal that protects them**; **the layout gate's missing
third direction**; **the tile composer and its 157-tile shipping set, with all twelve nodes composing
palette-clean at 1024²**; and **the shop's two refusal layers, each pinned by sabotage**. **No sha and
no commit tally is written here** — `git log` holds both, and each rots inside a single pass, which
this one demonstrated twice.

⚠ **Read the figures below as READINGS AT A TIMESTAMP, not as the tree's health** — but this pass is
the first in some time where that caveat is nearly idle. **The FAILURE SET is the stable part** and
is named case by case, and it is now a set of one thing seen three times.

- `npx tsc --noEmit` — **exit 0, silent.** Re-measured this pass on the current HEAD.
  **The instrument lesson this entry has carried twice is kept, because it is still true:**
  `cmd | tail; echo $?` reports **tail's** status, not the command's — and in **zsh** a `PIPESTATUS`
  read written for bash comes back empty. It bit again on this pass: both `tsc` and the mapgen
  verifier first read as exit 0 through a pipe and had to be re-run bare to learn their real status,
  and the mapgen one was genuinely 0 while the prose linter was genuinely 1.
- `npm run test` — **3 failed of 3,176; 3,173 passing; 1 file failed of 78**, 48.34 s. Re-run this
  pass; the three failures are the same deleted hearthollow map, seen three times.
  **The passing total rose because tests were ADDED, not because anything was repaired**: 2,950 →
  3,169 → **3,176** over 70 → 78 files, the additions belonging to the economy primitives, the
  dialogue grants, the shop, the live-path wiring, the layout↔populations gate and the seeder guard,
  and the newest seven to the layout gate's third direction (19 → 20 tests) and the shop's two
  refusal layers. ⚠ **Read this as a reading at a timestamp and nothing more: it was taken while two
  other lanes were mid-edit in the same tree**, and the count moved twice during this pass.
  **AND THE FAILURE COUNT FELL, 5 → 3, and three of those five left without being fixed.** Say it
  that way round, because "fewer failures" is the pleasant reading and this file's own rule is that
  the pleasant reading is the one nobody re-derives. Two of the five (`tests/property/foodweb.test.ts`
  no-shadow-tables, `tests/unit/postprocess.test.ts` BF-5) fired on **untracked art-lane files that
  are no longer in the tree**; the seed half of `tests/unit/manifest.test.ts` fired on an
  **uncommitted `tools/comfy/manifest.json` that has since been committed**. **The gates did not
  change and nothing was repaired — the files they were reading left.** The cascade-gate failure is
  gone for a different and real reason: it was **measuring wrong**, and the correction is the
  §7.2 seasonal-window section at the top of this file.
  - **`tests/gates/asset-palette-contract.test.ts` — 3 failures, ONE root cause, one message.**
    *"is present, non-empty, and decodes"*, *"is a real image, not an empty or flat one"* and
    *"every opaque pixel is an exact `data/palette.json` colour"*, all three on
    `assets/final/maps/hearthollow.png` and all three throwing the identical error out of the gate's
    own `census` helper: *"committed under `assets/final/` but is missing from the working tree. This
    gate asserts over shipped pixels: an absent covered file is a failure, never a skip."*
    ⛔ **This is CORRECT BEHAVIOUR and is not work to do** — the file is deleted on the owner's
    instruction and a replacement is being generated. See the section below. **It is not a palette
    violation**: no pixel was measured, because there was no file to decode.
  - ✅ **T-46 IS CLOSED — the fossilised precondition was repaired, not merely gone green.** The
    `existsSync(r1.mapAsset) === false` half is **deleted**, and the surviving MASK half was
    **widened from `r1` alone to all twelve nodes**: it now asserts the set of nodes with a mask on
    disk is empty, by name. **That widening changes T-56** — the briefing there said only `r1`'s
    mask touches this test, and that is no longer true; a mask promoted for **any** node reds it.
    The same commit fixed a second defect in the same file that nobody had reported: the
    `_versions` escape test **replaced** the map rather than extending it, wiping the twelve
    `map-*` rows the manifest ships at version 2, so a deep-equal claiming *"nothing else in the
    manifest moved"* had itself moved twelve rows in its own setup.
- `python3 tools/prose/prose-lint.py data/dialogue.json` — **exit 1**, **215 entries, 63 speakers,
  512 lines**. 27 control assertions green over 7 structural checks. **0 corpus structural
  failures.** 3 per-beat advisory flags, all `R1-SUBJECT-SWITCH`, 3 speakers
  (`vesper.post.loss`, `amb.r2-ferryhand.base`, `amb.duskhollow-lampwright.base`).
  **The non-zero exit is not evidence of a structural failure**: `tools/prose/prose-lint.py:1085`
  exits on `beat_total + fails ≠ 0`, so three advisory flags alone produce exit 1.
  ⚠ **The corpus totals did not move** — 215/63/512 before the economy pass and after it. The
  `grants` key that landed this session is a **schema** field, not a line, so it adds nothing the
  linter counts.
- `npx tsx tools/mapgen/run.ts verify` — **exit 0, 12 of 12 nodes ok, 0 failures.** Eight checks per
  node (`checkEdgeCorridors`, `checkSpawn`, `checkPropAnchors`, `checkFootprintBand`,
  `checkFootprintClearance`, `checkSettlementOnly`, `checkReachability`, `checkMaskRoundTrip`), and
  the same functions are imported by `tests/unit/mapgen.test.ts` and by the seeder, so a hand edit
  that breaks a layout goes red in both places rather than in the CLI alone.
- `git` — ⚠ **`main` IS MANY COMMITS AHEAD OF `origin/main`, ZERO BEHIND, AND NOTHING FROM THIS
  SESSION IS PUSHED.** ⛔ **DO NOT READ THE AHEAD-COUNT OFF THIS LINE. RUN
  `git rev-list --left-right --count origin/main...HEAD`** (behind on the left, ahead on the right).
  ⚠ **The number moved FOUR TIMES during the pass that wrote this entry, and that is the entry.** It
  was published as **thirteen**; measured **sixteen** at the top of the pass, **eighteen** in the
  middle, **nineteen** as this sentence was drafted, and **twenty** before the paragraph was finished —
  the layout gate's missing direction and the two commits that landed the tile composer and its tile
  set, then the shop's two refusal tests (`320a687`, `0a3eb7d`), then cindershelf's ash family
  (`579169f`), then more. **Several lanes are committing into this tree concurrently, so any count
  written here is stale by construction rather than by neglect** — which is a different failure from
  the one that produced *"in sync with origin"*, and needs the opposite remedy: not a fresher number,
  but no number. Before all of it this entry read *"in sync with origin;
  everything is pushed"* for several passes, a phrasing chosen precisely as the claim that stays true
  while a hash does not. **A claim that stays true is not a claim that stays checked — and a claim that
  was just measured is not a claim that is still true.** Run the command; inherit no number on this
  line, this one included.
  **The working tree is nearly clean and lanes are live in it.** Two deletions —
  `assets/final/maps/hearthollow.png`, which is the failure set above and is deliberate, and
  `.claude/scheduled_tasks.lock`, which is the harness — a lane holding `core/save.ts`, these two docs
  being written, and four untracked paths: `assets/approved-trials/_palette-refreeze/`,
  `tools/comfy/npcs-contact-sheet.mjs`, `tools/comfy/trials/sheet-b2-evidence.mjs`, and
  ⚠ **`tools/mapgen/compose/tiles/cinder/`, which is 17 tile PNGs of the cindershelf family being cut
  right now and is the one entry on this list that would be expensive to lose** (item 53). **Run
  `git status --porcelain` and read it; do not read it here** — this listing was accurate for about as
  long as it took to write.

## What is built

| Subsystem | State | Where it lives |
|---|---|---|
| Battle engine | Pure reducer `(state, action, rng) → {state, events[]}`; no Phaser | `core/battle.ts` |
| Ecosystem sim | Per-node integer populations, one clamp, one write path | `core/ecosim.ts` |
| Food web | Diet edges derived from node data; nothing else may compute them | `core/foodweb.ts` |
| Calendar clock | **52 ticks/year, 13/season, `subTicksPerTick` 2**; `ClockState` is `{year, tick, subTick}`; unbounded, no cap, no fail state | `core/clock.ts:64` |
| Tick costs | travel 1 · foray 1 · inn 2 · **battle 0.5, charged at launch** and wired — `spendTicks("battle", …)` inside `handOffToBattle`, which is the single launcher all four fights go through | `data/balance.json` `clock` |
| Cadence validation | A 4-rule `.superRefine` refuses a retune at boot: year = season × seasons; `startTick` in range; every cost an exact multiple of `1/subTicksPerTick`; no cost ≥ a season | `core/schemas.ts:479` |
| Encounter rate | Grass-gated. `stepEncounterChance()` is the **single** definition the game and the harness both roll against — no second one exists | `core/foodweb.ts:223` |
| Catching | **BUILT, REACHABLE, AND METERED FOR THE TIERS THE GAME HANDS OUT — not for the others.** ⚠ **This row read "BUILT AND UNREACHABLE" and was wrong twice over**; it is corrected, not rephrased. The reducer, the tiers, the bait maths, `{t:"catch"}` and `applyCaught` exist and are tested; a new game now **holds three base snares** from Maren's own tutorial line, and throwing one spends it. **The hole that remains is that `bagHas` reads an ABSENT key as unlimited**, so every tier the save has never been granted is infinite — item 56 | `core/battle.ts:1226`/`:1554`, `game/wild-battle.ts`, `core/save.ts` `applyCaught` |
| Economy | **REAL ON THE LIVE PATH, BOTH DIRECTIONS.** `money` has exactly one writer (`applyPayout`) and `items` exactly one (`applyGrant`), each with a reader, an applier and a `replay()` arm, and each refusing precisely what its reader refuses. A won **rival** fight pays `trainerPayoutFlat + trainerPayoutPerLevel × Σ(enemy levels)`; the shop spends it. **`innCost` (40) and every `baitPrice` still have ZERO readers** — the inn charges only ticks, and bait cannot be bought at all | `core/save.ts` `applyPayout`/`applyGrant`, `data/balance.json` `economy` |
| Town shop | **A PHASER-FREE ROW MODEL that buys on the tape.** Four rows — base snare, weighted snare, salve, tonic, every price 3 — with weighted gated on the second gym's badge through `core/acts.ts` `badgeFlagFor`, master deliberately **not** sold, and affordability decided at the row so `applyPayout`'s overdraw throw is unreachable through the UI. The vendor is identified by the corpus's own `role: "vendor"` speaker tag, never by `kind === "service"` | `game/shop.ts`, `game/scenes/OverworldScene.ts` `openShop`/`buySelected` |
| Dialogue grants | **An entry may carry `grants`, and one does.** `maren.tutorial.snare` ships `{"base": 3}`; the runner applies it on completion. The schema cross-references the id set and runs a **must-write path analysis** over the `goto` graph so a granting entry cannot fire twice — bounded at one play **per entrance**, which is T-63 | `core/dialogue-schema.ts`, `game/dialogue-runner.ts`, `data/dialogue.json` |
| Act model | Badges + quest flags gate towns, routes, raids, rival, finale | `core/acts.ts` |
| Lifecycle | Aging, retirement, heirs, boxed aging, Cullbrand raid on act entry | `core/lifecycle.ts` |
| Save + replay | Action log replays byte-identically **for the ten members that have an arm**; `subTick` and `forayStepsSinceTick` survive the SERIALIZER's round trip and the year turn. ⚠ **The citation this row carried was wrong and is corrected**: `forayStepsSinceTick` appears **nowhere** in `tests/property/`, and was covered there only vacuously by a whole-save comparison where both sides read 0. Its real coverage is `tests/unit/save.test.ts:212` (canonical keys) and `tests/unit/overworld-scene.test.ts:3124`/`:3452`. Through `replay()` it does **not** survive — T-54 | `core/save.ts`, `tests/unit/save.test.ts`, `tests/unit/overworld-scene.test.ts` |
| Content + schemas | 27 species lines (3 Ancients), 28 moves, 6 gyms, 12 nodes; zod-validated at boot | `data/`, `core/schemas.ts` |
| Age multipliers | **Halved toward neutral: J 0.875 · A 1.0 · E 1.075** (was 0.75 / 1.0 / 1.15; A is the neutral, so A did not move). `metamorphicJump` 1.15 and `heirLevelFactor` 0.5 deliberately untouched — not an unfinished half of T-10. Lifecycle tests read the key symbolically, so no table needed re-deriving. **The canonical L9 row and §7.4 carried the old curve until now** and are corrected to name `balance.age.multiplier` as the rule. **The four copies of the OLD curve TICKETS T-10 enumerated are now ZERO** — re-grepped 2026-08-27: `docs/content-bible.md:51` reads *"Juvenile penalty · Adult neutral · Elder bonus"*, `core/lifecycle.ts:350` reads the same and says the numbers are *"READ here and never restated"*, and `data/gyms.json:5` now names `balance.age.multiplier.E`, *"×1.075 today"*. `×0.75` no longer appears in `core/`, `game/`, `data/` or `docs/` at all | `data/balance.json` `age`, `docs/build-doc.md:47` |
| Producer template | **Re-spent 85/40/80/35/60 → 85/60/80/35/40** — zero-sum, total still 300, Scavenger untouched, Carricrow untouched. Measured: Loamunder 26.7% → 50.7%, Sporantle 12.9% → 37.9%, both into band; 8 of 24 lines outside the ±15 band. The closed-tournament arithmetic is recorded in `_bandArithmetic` beside the templates, not in a doc | `data/species.json` |
| Dialogue corpus | **215 entries, 512 lines, 63 speakers**; every entry has a path to the screen | `data/dialogue.json`, `game/dialogue-runner.ts` |
| G7 gate | **Now reads `data/dialogue.json`** — every player-facing string plus a joined-body pass, and a prose census over 18 other `data/*.json` files | `tests/gates/guardrails.test.ts` `dialogueCopyViolations`, `:1129` |
| Quests | Objectives, flag writers, sign chains. **Progress survives the year turn** — age is read off the tape's own `gained`, not off the aged individual — the deadline guard fires (it is reachable through Ancients, which never age, G10), and release refuses with a **named reason** both the key and the HUD read from one function | `core/quests.ts:341`, `game/quests.ts:555`/`:770`/`:791` |
| Quest gates | **They OBSERVE a driven player** rather than confirming a row exists: the expander is deleted, turn-in flags come from a maximal player per node put through the real `syncQuestFlags`, GATE 2f checks satisfiability against a **measured** world, GATE 2g requires the objective's node to be one the quest's own copy names | `tests/gates/quest-layer.test.ts:1462`/`:1660`, `tests/gates/reachability.test.ts:402` |
| Overworld | Walk, collision, travel, encounters, inn, gym challenge, talk, release | `game/scenes/OverworldScene.ts` |
| Walkable slice | ⚠ **The FLAG says `hearthollow`, `r1`, `brackwater`, `r2` and the other 8 are travel-only. THE GAME DOES NOT.** All twelve are walked — `travelTo` reads adjacency and the act ladder and never the flag, all twelve ship a composed map and a collision mask, and all twelve pass the spawn-and-connectivity gate. The row is what the data declares, not what the player meets (**T-36**). | `data/nodes/*.json` `walkable` |
| Battle scene | A replayer over `BattleEvent[]` — it holds no rules | `game/scenes/BattleScene.ts`, `game/ui/` |
| Year turn + retirement | Meter fills → year turn → prompt → heir in the party | `game/scenes/YearTurnScene.ts`, `RetirementScene.ts` |
| Finale | Vellsire choice, both outcomes written and flagged, epilogue survey. **The epilogue's season is DERIVED from the projection's published horizon, not stamped from `save.tick`** — it is not a caption, the breed column and the dormant/migrating note are computed from it, so a stamped label made the same animal at the same number carry the opposite biological claim depending on when the player stopped | `game/finale.ts` |
| Rival | One encounter per act, each with pre/win/loss copy | `game/rival.ts`, `data/dialogue.json` |
| Survey | Real per-node counts plus run history | `game/survey-view.ts`, `game/survey-history.ts` |
| Balance harness | Gym sim, type round-robin, full-run cascade; now pays travel/foray/battle ticks and rolls the grass-gated rate | `tools/harness/` |
| Harness control run | **`CATCH_PROFILES` × `RAID_POLICIES` = a 3×2 matrix**, raid suppression as an orthogonal flag rather than a fourth profile. Deep-copies `rawBalance` and empties `yearEvents.raids` in memory — `data/balance.json` is never touched. Extinctions attributed by measurement (`attributeExtinction`), not by a node lookup | `tools/harness/full-run.ts:250`/`:265`/`:335`, `report.ts:525` |
| Battle persistence | **WIRED (T-28).** `applyBattleResult` is the first statement of all four finish handlers — wild, gym, rival, finale. **The four line numbers this row used to publish had all drifted by the next pass and are not published any more**; `grep -n 'applyBattleResult' game/scenes/OverworldScene.ts` returns exactly four call sites and that is the claim. `applyBattleAftermath` is the one writer of `curHp`/level/xp/bag outside creation and the year turn. The three docblocks that already called it *"the ONE writer all four launchers share"* **became true rather than needing repair** | `game/wild-battle.ts`, `core/save.ts` |
| XP carry-in | `BattlerSpec.xp` exists, `makeBattler` reads it back as `xp: spec.xp ?? 0`, `battlerSpecOf` copies it verbatim — carried, never derived, so a replay sees the same number (T-30) | `core/types.ts` `BattlerSpec`, `core/battle.ts` |
| Party-wipe recovery | Pure TS, zero engine imports. A wipe plays the fight's own losing beat, THEN blacks out, wakes the party healed at an inn and charges `2 × innTicks + 1 × travelTicks` = **5 ticks**, composed from existing keys — there is no `blackoutTicks` and there must not be one (T-29). The on-screen move is bound at **every shipped node**, and the test counts how many wake nodes actually differ so the fixture cannot go degenerate in silence. **It can no longer stack a dialogue on top of a year turn** — guarded after the charges, so the price and the move still stand and the cue stays owed. ⚠ **The premise `core/recovery.ts` prices the blackout against — a rest available "only for a player STANDING IN A TOWN" — was FALSE until `[R]` gained its location check**, so the owner's 2×inn+travel ruling had been priced against a baseline the code did not implement. It is true now. ✅ **AND THE ON-SCREEN HALF NOW LANDS TOO — items 46 and 47 are CLOSED, and this row previously said the opposite.** The softlock was scene-op FIFO ordering rather than the pause/resume imbalance first inferred; the blackout draws a real curtain held until the chain ends, and the wake enters the inn's interior rather than stopping at the town. Cost logic untouched | `core/recovery.ts`, `game/scenes/OverworldScene.ts` `recoverFromBlackout` |
| Inn rest | **HEALS WHAT IT CHARGES FOR, REPLAYS, AND ASKS WHERE YOU ARE STANDING.** `restAtInn` is `restRefusal` → `innRestFor` → `applyInnRest` → `spendTicks`: refusal, then consequence, then price. The selection is the blackout's own `restoredUids` **reused, not re-spelled**; the heal rides as its own absolute `{t:"innRest"}` tape entry rather than being derived from the `{t:"inn"}` **price** beside it, because the blackout levies two of those itself — and `replay()` now has a named `case "innRest"` arm that calls the same `restoreParty` the live path does. **`[R]` refuses off-town and indoors except in the town's own inn** — the room is identified from CONTENT, not from an id. **The `innCost` charge stays OFF** until money has an earner | `core/recovery.ts` `innRestFor`/`applyInnRest`/`innkeeperAt`, `core/save.ts` `restoreParty`, `game/scenes/OverworldScene.ts` `restAtInn`/`restRefusal` |
| Art-load deadline | `ensureNodeArt` takes a timeout (8000 ms default, a parameter so a test drives it) and **resolves** on it. A hung loader now costs one degraded visit instead of refusing travel for the rest of the session (T-31) | `game/mapview.ts` `ART_LOAD_TIMEOUT_MS`, `:278` |
| Enemy AI tie-break | Ranks on `movePowerVs × typeMultiplier` alone — the dropped factors are common to a pool and cannot reorder it. 13 → 0 divergences; the argmax is still an exact strict `>` | `core/battle.ts:1371` |
| Player art contract | **The first gate here that decodes a PNG** (via `sharp`): palette exactness, star-badge absence, no new swatches, and a freshness check against a live re-derivation. **GREEN — 16 of 16, re-run 2026-08-27.** The derived back and side views were rebuilt against the re-frozen palette; decoded off the previous commit they held **8 off-palette px** (back) and **420 in 11 colours** (side, still carrying the deleted star yellow), and both now decode at **zero** (T-24) | `tests/gates/player-art-contract.test.ts` |
| Asset palette contract | Every PNG the bundle ships out of `assets/final/`, decoded: exact palette membership, no vacuous pass, deletion detected by anchoring the scope to git. The advisory now prints each asset's distinct-colour count **against the measured Gold band 12–18**, and asserts that band against the reference captures it was derived from. The count itself is a reading aid and caps nothing — see item 32 | `tests/gates/asset-palette-contract.test.ts` |
| UI contrast contract | The UI cannot go illegible on a palette change without going red | `tests/gates/ui-contrast-contract.test.ts` |
| Interiors | Blueprints, plans, and a **view mode inside `OverworldScene`** — the player walks in, moves around and walks back out; `save.currentNode` keeps naming the town and `save.interiorId` says which room. Four plans: inn and supply shop in both walkable towns. ⚠ **Every door coordinate is PROVISIONAL and says so in its own `_note`** — the canon gives none, so all four were reasoned from the few positions it does pin, and each must be re-pinned to the door the art lane actually painted (**T-47**). Three towns have no interior at all (**T-48**) | `core/interiors.ts`, `data/interiors/*.json`, `game/scenes/OverworldScene.ts` |
| Art pipeline | Comfy Cloud client, batch runner, postprocess, overlay diff; **plus a supervised trial runner** (`tools/comfy/trial.ts`, `TRIAL_ROW_CAP` 20 for G13) | `tools/comfy/`, `tools/postprocess/` |
| Palette | 32 positional swatches, **re-frozen 2026-08-26 to the class-equal fit** — all 32 hex values changed, ids/count/`frozen` intact | `data/palette.json` |
| Dex art path | `dexArtId()` produces `dex-painted/dex-<name>`; bound by a 9-test set-identity gate | `game/survey-view.ts:868`, `tests/gates/dex-path-contract.test.ts` |
| Placeholders | Every missing asset draws as a labelled, unmistakably unfinished stand-in | `game/placeholder.ts`, `tools/postprocess/placeholder.ts` |
| Prose lint | Structural corpus checks with positive and negative controls | `tools/prose/prose-lint.py` |

## What is open

### Consequences of an honest ruler — deliberately not tuned

1. **Three of six gyms sit outside their bands, and the ruler moved twice in twenty minutes.**
   T-13 repaired the instrument, then T-10's age-multiplier halving and T-11's Producer re-spend
   moved what it measures. Measured with `npx tsx tools/harness/run.ts --mode gym --seeds 500`
   at **21:59**, inputs hash-checked byte-stable across the run, **at the party size the game
   allows**:

   | gym | leader | full party | target | verdict |
   |---|---|---|---|---|
   | 1 | Maribel | **98.6%** | 80–95 | +3.6 pp over |
   | 2 | Odo | 91.6% | 80–95 | in band |
   | 3 | Vesper | 65.0% | 60–80 | in band |
   | 4 | Sable | 75.8% | 60–80 | in band |
   | 5 | Noct | **74.8%** | 45–65 | +9.8 pp over |
   | 6 | Greaves | **65.8%** | 45–65 | +0.8 pp over |

   **Two figures that were circulating did not survive.** "Greaves −3.0 pp under band at the cap"
   was never measured; the real reading on the pre-T-10 tree at 21:50 was **44.2%**, −0.8 pp under,
   and after T-10's halving landed at 21:53 it is **65.8%, out of band HIGH — the sign flipped.**
   "Maribel +2.1 pp over" was **+1.8 pp (96.8%)** at 21:50 and is **+3.6 pp (98.6%)** now.
   T-13's own ticket text is also stale: it claims Gym 1 reads 93.4% inside its target and "4 of 6
   gyms in band" — neither is true on either tree measured. **Nothing was tuned to produce any of
   this.** — `tools/harness/`

2. **A palette id is a SLOT, not a colour.** Write this down before the next re-freeze repeats it.
   The class-equal swap re-pointed every UI swatch table because the *meaning* of each slot moved:
   `c18` went from `#f7ebd3` (cream, **17.543:1** against void) to `#37630f` (dark green, **2.891:1**;
   1.078:1 against the new panel `c06`). `UI_SWATCH` re-pointed 15 of 19 roles, and
   `menu-model.ts` / `survey-view.ts` followed. — `game/ui/Palette.ts:178`, `game/menu-model.ts:76`,
   `game/survey-view.ts:253`

3. **CLOSED — the derived player sprites are on-palette and the star badge is gone.** *(T-24, DONE)*
   The 21 dead hex literals in `tools/comfy/player-views.ts` resolve through `data/palette.json` by
   slot id, `tests/gates/player-art-contract.test.ts` decodes the committed PNGs, **and the assets
   have now been rebuilt against the re-frozen palette: 16 of 16 green.** Measured by decoding the
   previous commit's bytes rather than by trusting the commit message — back **8 off-palette px** in
   `#ec9a70`×4 / `#eec092`×4, side **420 px in 11 colours** including the deleted star yellow
   `#f9db10`; both now **zero**, and the approved front is untouched (it is not in the commit).
   ⚠ **The "7 red → 16 green" span is recorded as a claim, not a measurement**: re-running the gate
   against the old bytes needs a checkout, which was not taken. The endpoints were decoded; the
   arithmetic between them was not. **T-20's side-view legs are a separate defect and are still
   open.** Two findings kept, because they will otherwise be re-derived:
   - **Two sprite roles collapse onto one swatch:** `hair` and `hairHi` both resolve to `c05`, and
     `capOutline` and `capRim` both resolve to `c17`, so the nape band and the cap edge each lose a
     tone. **The reason first recorded here was wrong and is corrected:** it said the fit had "no
     swatch between `c05` and `c07`". It does — `c06` (`#74564e`) sits between them at L\*39 against
     `c05` L\*25 and `c07` L\*41. `c06` is a low-chroma mauve-brown, so it is not in the hair ramp
     by *hue*; the collapse is real and the explanation was not. Measured by the art session in
     CIE-Lab after this file asserted it from a nearest-hex reading. A palette id is a slot, and a
     class-equal fit owes no role a neighbour — but say which axis is missing, and measure it.
   - **A dead ternary meant every "derived" row in `_acceptance.json` was describing a re-stretched
     copy rather than the shipped bytes.** The detectors were honest about a file nobody ships.

### The shape behind most of what follows: a derived artifact carrying a hand-written claim

**A generated file that states a fact in prose is right when written and wrong forever after, and
nothing goes red** — the generator that would catch the drift is the same thing that is stale, so a
rebuild does not repair the claim, it *restores* it. Three instances, all found in this tree:

1. **`tools/comfy/build-manifest-b0.ts`** — a rebuild would have reverted two of Hank's recorded art
   rejections from "REJECTED by Hank" back to "SELECTED — pending Hank" and **deleted the reasons he
   gave**. Now merge-and-refuse, with a `--self-test`.
2. **`tools/palette/build-manifest-palette.ts`** — hardcoded the freeze prose, so running it undid
   the correction someone had just made by hand. Now derives it, and refuses on an unfrozen palette
   (item 7).
3. **Fossilised test anchors** — assertions pinned to a value *measured* under an older palette
   freeze. They read as assertions and behave as snapshots. Two were found in
   `tests/unit/battle-view.test.ts`, opposite polarities of the same fault: one froze a live number
   (5.29, replaced with WCAG's own published boundary greys, item 4), the other read a frozen claim
   off live swatches (repaired by pinning the four hexes of the freeze the audit actually ran on, so
   a record of a fixed defect stops tracking the present palette). A number that came out of a
   measurement is a fossil whatever the test is named — and the second one still *passed*, on a
   coincidence the next re-freeze is under no obligation to preserve.

The rule that comes out of all three: **a claim that can drift is derived, verified, or absent.** If
a generated artifact must say something, compute it from the artifacts it describes (or check it —
the palette promotion is a sha256 comparison, not a sentence), and make the generator refuse to write
rather than write something it cannot support.

### Stale instruments and dead comments — all closed 2026-08-27

Items 5, 6, 7, 11, 12 and 13 were T-25, now **DONE in full**; items 8 and 9 were T-2, now **DONE**.
They are kept, not deleted, because the shape recurs — **item 26 is where it recurred next**, found
while closing item 6.

4. **A hex fossil can hide inside a test named for a standard.** `tests/unit/battle-view.test.ts`'s
   "BINDS — the contrast maths agrees with WCAG's own anchors" carried three assertions: two real
   anchors (21:1, 1:1) and one comparing two live palette ids against `5.29`, a number an audit had
   measured on the previous freeze. The palette swap made it read 5.696 and the test went red — not
   because legibility broke, but because the fossil moved. **Repaired by another agent at ~22:01**
   while this file was being written; recorded here because the shape recurs and the name of the
   test is what hid it.
5. **CLOSED — `tests/unit/transcription.test.ts` no longer says battles are unwired.** The arithmetic
   above the comment was always correct; only the comment was wrong, and it now names the spender.
6. **CLOSED, and structurally.** No comment anywhere in `game/` or `core/` says `seasonBoundary`
   fires at "4, 8 and 12". The docblock is now `game/scenes/OverworldScene.ts:1973-1985` and states
   the cadence as *"the first `seasonOrder.length - 1` multiples of `clock.ticksPerSeason`"* — naming
   the balance keys instead of the ticks, and saying at `:1980-1982` that it does so "because a
   comment quoting the ticks goes stale in silence." **That is the fix generalised, and it is why
   item 26 was found.**
7. **CLOSED — the manifest-palette freeze prose is corrected AND can no longer revert.** It asserted
   `data/palette.json` was "FROZEN and UNTOUCHED" after the class-equal promotion had touched it.
   Re-verified by reading both artifacts: `tools/comfy/manifest-palette.json` now says the palette
   was RE-FROZEN to the class-equal fit and "is therefore no longer UNTOUCHED", and
   `tools/palette/build-manifest-palette.ts` **derives** that prose instead of carrying it —
   `purpose`, `status`, `_seedRule`, `_generationCount` and the `palettes` block are assembled at
   write time from `data/palette.json` and `tools/palette/candidate-sources.json`; the build
   **refuses** unless the palette is `frozen: true`; and the promotion claim is decided by comparing
   `palettes.frozen.colorsSha256` against `palettes.classEqual.colorsSha256` computed from the bytes
   on disk (both `51a95b06…` today) rather than by a literal. A `--self-test` covers the refusal, the
   unpromoted wording and a moved `frozenAt`. The generator is the reason this stays closed.
8. **CLOSED — the comment block at `tests/integration/demo-beats.test.ts:252-281` describes the
   amended §10.2, and no predicate moved.** The assertions are byte-identical to what stood before;
   green before, green after. It also **dropped a figure sourced nowhere in this repo** — *"16% of
   seeds at 4 seasons"* — for the published **12.5%** (3 of 24 seeds), which §10.2
   (`docs/build-doc.md:401`) and `core/foodweb.ts:242` both carry. The test **is** that measurement.
   The deleted line is in git: `git show af82c46 -- tests/integration/demo-beats.test.ts`.
9. **CLOSED — the mesopredator filter is bound.** `isMesoLine` (`tools/harness/fixture.ts:110`,
   applied `:115`) is covered by `tests/unit/harness-fixture.test.ts`, 5 tests, whose count assertion
   at `:216` names the **eight** sites where it bites against the two where it is a no-op
   (`cindershelf`, `r4`). Twelve node files ship, but `sanctum` and `sanctum-approach` have no
   top-of-web predator, so **the honest denominator is 8 of 10 sites, not 8 of 12.** Dropping the role
   test reddens 3 of the 5; the pre-existing suite stayed **fully green** under the same sabotage.
   Note *which* two nodes are the no-ops: **`r4` is the over-catch fixture's own node**, which is
   exactly why nothing ever saw this.
10. **`tools/comfy/manifest.json`'s 9 `_deviations[]` rows are no longer dead provenance.** This file
    previously recorded them as indexing a ledger the repo no longer keeps. They are now `LB-M1…LB-M9`
    and cited by `_targetSource`, `_derivedFormRule` and `_concepts[].source` inside the same file.
    **The old item was wrong; struck.**
11. **RESOLVED at ~22:11 while this was written.** `tests/unit/__repro-battle-clock.test.ts` was
    untracked debris whose own header said "TEMPORARY reproduction — deleted once the defect is bound
    by a real test"; `tests/unit/clock-subtick.test.ts` is that test, and the repro has been deleted.
12. **CLOSED — the dead `const year` binding is gone.** A comment at `tools/harness/full-run.ts:490-491`
    stands where it was, recording that the calendar→act leak was closed by threading `act` and that
    the binding it left behind read nothing. The loop opens `const act = balance.acts.first + 1 + y;`
    at `:492`.
13. **CLOSED — re-read, and it no longer says that.** `tests/unit/lifecycle.test.ts:1646` now reads
    "0.875 → 1.0 → 1.075, plus the metamorphic ×1.15", with the old triple kept two lines below as
    the recorded T-10 before/after rather than as the rule. The item outlived the defect; struck.

### Structural, unchanged

14. **`DialogueScene` is not registered in `main.ts`.** `OverworldScene.ensureDialogueScene`
    registers it at runtime as a declared stand-in. — `game/main.ts`
15. **Two wild-trait rollers live outside `core/`.** `game/wild-battle.ts:99` `rollWildTraits` and
    `tools/harness/player.ts:240` `rollTraits` are draw-for-draw identical; `core/` has none.
    Collapsing them is a delete.
16. **`QUEST_OBJECTIVES` is in the wrong file** (`game/quests.ts:160`). Moving it needs
    `balance.json` + `Balance` + `zBalance` changed together.
17. **Sign-chain gating derives the line id from the chain id.** `PropPlacement` carries `signChain`
    (`core/types.ts:144`); `SpeciesLine` does not. — `game/scenes/OverworldScene.ts`, `core/types.ts`
18. **`balance.encounter.levelByYear` keeps a year name that both readers index by act.** The
    *coupling* is closed — `tools/harness/full-run.ts:195` `wildLevel(act, …)` — but the key name
    still lies. Renaming touches `data/balance.json`, `core/types.ts`, `core/schemas.ts`,
    `game/encounters.ts` and six test files.
19. **Gaps in the battle event union.** `battleStart` is
    `{t, kind, playerUid, enemyUid}` — no trainer identity, so a gym fight cannot be announced by the
    leader's name. `BattleEvent.damage` carries no attacker; `levelUp` carries no maxHp/curHp; no
    player-facing refusal copy is authored. — `core/types.ts:403`
20. **The seed is not randomised.** `game/boot.ts:333` `requestedSeed()` returns
    `balance.rng.defaultSeed` (**1337**) unless `?seed=N` is in the URL, so every new game gets the
    same region. This is the prior question T-14 must answer before seed *guardrails* mean anything.
21. **CLOSED — the enemy-AI tie-break is exact, and the fix moved the game the opposite way from the
    prediction.** *(T-27)* It used to score
    `((atk × power) / def) × mult × predation × midRoll`, so a tie **on paper** rarely produced equal
    doubles: over 2160 shipped pairs, 59 tied on paper, 20 disagreed as doubles, and **13 chose a
    move that was not earliest in pool.** The key is now `movePowerVs × typeMultiplier` alone
    (`moveRank`, `core/battle.ts:1364-1369`) — the dropped factors are common to every move in a pool
    and cannot reorder it in exact arithmetic, so nothing was traded away. **13 → 0 divergences;
    exactly 13 of 2160 choices changed.** The comparison was **not** loosened: the argmax is still a
    strict `>` on an exact key, so no rng enters the enemy policy.

    **The prediction was that the enemy would get stronger. It got weaker.** Odo 91.6% → **95.2%**
    full party, **+9.8 pp** at matched party; Sable **−1.4 pp** once the harness player model took
    the same key. **Nothing was tuned.** The cause: **all 13 flips trade `ambush`'s entry-turn
    priority for equal damage** — the rounding had been selecting the priority move *by accident*,
    and pool order does not know priority exists. That is now its own open question (T-37). The
    player-side change is backed by an exhaustive sweep over **8.1 million pairings**: zero real
    reorders, all 11,602 divergences exact ties.

    **The two clause-7 tests this consequence reddened are CLOSED** *(T-32, DONE)*. `harness.test.ts`
    reads **76 passed of 76** — the 77 → 76 is one deliberate deletion carried out under the deleted
    test's own written protocol, not a lost test. What replaced it is an exhaustive sweep, and the
    sabotage that justifies it is the sharpest demonstration this repo has of a green test binding
    nothing: reverting `tools/harness/arena.ts` to the pre-T-27 full-product argmax reds the new sweep
    on **78 of 104,976 pairings with the cases named**, and **the 36-sample test it replaced stays
    green.** The reasoning, including the clause in the deleted test's docblock that was deliberately
    *not* acted on, is in TICKETS T-32.

### Art and audio

22. **NINE maps are on disk, ten are in HEAD, and nothing else is art.** ⚠ **This item read "ten on
    disk" until now and the arithmetic has moved under it, in the one direction a count is never
    expected to move.** `assets/final/maps/` holds the twelve nodes' art less bowerdeep and
    cindershelf — ten committed — **and `hearthollow.png` has since been deleted from the working
    tree on the owner's instruction**, so the directory holds nine: brackwater, duskhollow, r1, r2,
    r3, r4, r5, sanctum-approach, sanctum. All ten were exactly on-palette when measured (mean ΔE
    0.000, zero off-palette pixels, `tests/gates/asset-palette-contract.test.ts`), and all ten are
    still WIP against T-17's amended top-down projection. **The deletion is the whole of this pass's
    red suite** and it is the gate working — see the hearthollow section above. No sprite, no dex plate, no UI frame, and
    **no collision mask — 0 of the 12 declared paths exist, checked one by one; see item 41 for what
    that costs and item 43 for why promoting the twelve git-ignored ones would make it worse.**
    `tools/comfy/manifest.json` is 288 rows, `{pending: 287, approved: 1}` — re-counted this pass and
    unmoved by the art lane's commit; **9 of the 288 declared `finalFile`s exist.** The B1
    reproduction gate has never been run.
    *(This item read "No art is on disk. `assets/final/` holds a `.gitkeep`" until now — it was true
    when written and had been false for a day.)*
23. **Billing: about 204 billed image generations across all trials to date — and THERE IS NO
    INSTRUMENT THAT CAN CONFIRM THAT NUMBER, so it is framed as a count kept by the lane that spent
    it, never as a reading.** *(T-26 for the per-image figure, DONE)*

    **There is no credit-balance endpoint, and this is a property of the platform, not a gap in the
    client.** `tools/comfy/client.ts:157-166` probes **three** paths —
    `/api/customers/credit`, `/api/credit`, `/api/user/credit` — **all three 404**, and `credits()`
    returns `null`. Comfy Cloud exposes none. ⚠ **That 404 result is a recorded live measurement and
    nothing in the tree reproduces it**: no test asserts it and no probe response is captured, so it is
    a claim with a date on it. Its one consumer prints `credits endpoint: none`
    (`tools/comfy/b0-views.ts:61-62`), and `tools/comfy/comfy-batch.ts:484-488` prints
    `projected credits: UNKNOWN` rather than inventing a figure when `perImageCredits` is null.

    **Any dollar figure is an ESTIMATE at ≈1.12 credits per image and must never be quoted as a
    reading.** `tools/comfy/manifest.json:9` carries `perImageCredits: 1.12`, provenance on `:10`:
    dashboard **4,147 → 4,127 across 18 images at 1024²**, which is 1.11 rounded up. **1.12 is the
    1024² figure specifically** — the same key's provenance line records a later mixed batch including
    256² probes reading near **0.53**, because cost tracks pixels.

    ⚠ **THE 204 CANNOT BE RECONCILED TO ANYTHING IN THIS REPOSITORY, and that is worth stating rather
    than quietly repeating it.** `.gitignore:8` excludes `assets/raw/**`, so **no commit records a
    single trial PNG.** `tools/comfy/manifest.json` is not a ledger — 288 rows, one `recordedSeed`,
    `attempts` summing to **1**. The `tools/comfy/trials/*.json` files are **specs, not run records**:
    **11** of them totalling **68 rows** (this item previously said nine). The only countable artefact
    is PNGs on disk, and the closest defensible figure is **199** files at the top level of the 28
    `assets/raw/_trials/*/` output directories — **182** if `_`-prefixed derived files are dropped —
    against **1,014** PNGs under `assets/raw/` in total. **None of those is a billed-generation count**:
    it mixes derived and quantized outputs with generated ones, omits nine other raw directories, and
    is blind to retries, which bill (`comfy-batch.ts:425` — one try plus two retries is three billed;
    `:450-451` — up to six, worst case nine, on a map-variant row). **The spend is real and roughly
    known; the count is not measurable from here.**

    **What survives unchanged: nothing in this project is constrained by image count**, and **G13 binds
    as a *review* discipline, not a budget one** — twenty images get looked at before they are made,
    which never depended on the price.
24. **No audio exists.** `assets/audio/` holds a `.gitkeep`; zero `this.sound` calls in `game/`.
    The 11-row track list is corrected (T-21 doc half); no composer family has been shopped and there
    is no `ATTRIBUTION.md`.
25. **The Legacy beat is untested against balance.** `retirement.heirLevelFactor` = 0.5 produces a
    measured ~2.1× power drop in the same year as a level-26-plus gym, and the harness has no
    lifecycle, so nothing measures it. A gym run seeded with a post-retirement party is the mode to
    add. — `tools/harness/gym-sim.ts`

### Found on the 2026-08-27 pass

26. **CLOSED — the comments that called a season four ticks long.** *(T-42, DONE)* The ticket
    predicted three sites; there were **four** — a test docblock was carrying the same figure and was
    found while the other three were being fixed. None of the four now states the number as the
    current rule: `game/scenes/OverworldScene.ts:1830` says in as many words that this line *"said
    '4-tick' for as long as that was false"*, and `:2349`, `core/regional-events.ts:418` and
    `tests/unit/overworld-scene.test.ts:1487` each name the window as `clock.ticksPerSeason` and mark
    the old figure as the then-shipped 16-tick year. **A ticket's own count is not a measurement**, in
    this file's own standing phrasing, and this is a fourth instance of it.

27. **Layouts must be AUTHORED, not derived — and this was reached twice, independently.** Once from
    the schema side, asking what an interior could be generated from; once from the pixel side,
    asking what a map deriver could produce. Both arrived at the same wall.
    - `zNodeFile` (`core/schemas.ts:211-226`) carries exactly **two spatial fields**: `collisionMask`,
      which is a path, and `props[]`, which is a list of x/y/radius. There is nothing else in a node
      from which a layout could be inferred.
    - **The best layout that data can justify differs from what `synthesiseBorderCollision`
      (`game/collision.ts:630`) already produces by 7–14 cells out of 4096** — a fraction of a percent.
      A deriver would be a large amount of machinery to move about ten cells.

    **That convergence is the argument, and it is recorded here so nobody rebuilds a deriver later
    on the reasoning that nobody tried.** Two independent routes reached it; the answer is to author
    the layout.

28. **The G7 word-matcher has real blind spots, and this is a recorded limit — not a reopening.**
    Hank ruled the matcher sufficient under T-3 (*"declare the word-matcher sufficient and drop the
    item"*), and that ruling stands. What it cannot do is written down so nobody mistakes green for
    proof. `MORALIZING_PATTERNS` (`tests/gates/guardrails.test.ts:789-831`) is **40 fixed regexes**,
    consumed by `firstMoralizingHit` at `:833`. Probed directly against that list:
    - *"You could put the net down any time you liked."* — **clean.** (`could-have` requires the
      literal words "could have".)
    - *"Nobody made you empty the shallows."* — **clean.**

    Both plainly tell the player they did wrong. There is also a gap inside the list's own
    vocabulary: `hope-youre-happy` is `/\bhope you'?re (happy|proud|pleased)\b/i`, so **"I hope you
    are happy" passes clean** — the expanded contraction escapes the rule written for it. The gate
    catches a vocabulary, not a stance. **Do not re-raise this as a finding; it is a property.**

29. **`SCREEN_SWATCH_ID.inkFlag` is `c13` where the re-picked house `accent` is `c16`.** The flag
    swatch lives at `game/survey-view.ts:280` (table at `:272`, with the divergence noted in the
    block comment at `:265-267`); the house `accent` is `c16` in both `game/menu-model.ts:79` and
    `game/ui/Palette.ts:174`. **Every other shared role aligns** — backdrop/bg `c00`, ink/text `c03`,
    inkDim/dim `c01`, inkCollapsed/danger `c09`, vertexLive/ok `c24`. Five of six, one divergence.
    `game/survey-view.ts:270` states that `Palette.ts`'s `UI_SWATCH` "is not an alignment target and
    never was", so this is recorded as a fact about the tables, not as a defect in either.

30. **`assets/reference/` holds ten Gen 2 / Gen 3 maps — inspiration only, and they were REFETCHED
    at native size after the first set was found contaminated.** Eight under `gen2/` (Azalea,
    Cherrygrove, New Bark, Olivine, Violet, Routes 29, 32 and 42) and two under `gen3/` (Fortree,
    Lavaridge), plus a `README.md` that says so. **Never shipped, never quantized, never fed to the
    pipeline.** Hank directed the folder explicitly. The two Gen 3 maps are T-17's structural
    references: Fortree is Bowerdeep, Lavaridge is Cindershelf.

    **The first captures were browser screenshots and every figure taken from them is withdrawn.**
    They were resampled — **642×574 from a 320×288 source, not even a clean 2×** — and interpolation
    invented colour on the way: they held **673 to 2,080 distinct colours** where the native frames
    hold 12 to 18. The only figures ever published from them were the **pixel-block measurements**,
    and those are **withdrawn as unsourced**, on the same standard as the other struck claims at the
    foot of this file: not disproved, but taken from an instrument now known to have been wrong by two
    orders of magnitude, so they are not evidence of anything and must be re-measured before reuse.
    The contaminated files are deleted. `tests/gates/asset-palette-contract.test.ts` now asserts that
    each surviving capture still measures inside the band it is quoted for, so a resampled screenshot
    cannot re-enter the reference set unnoticed.

31. **SETTLED — Hild's pitch is a building, and the doc prose was the outlier.** `CAST-AND-VOICE.md`
    called it a *"marsh stall"* while `tools/comfy/manifest.json` counted it among Brackwater's five
    tarred timber buildings and gave it a door. A stall needs no interior, so the blueprint count
    hung on it: four plans or three. Hank asked first whether the phrase appears in any shipped
    dialogue. **It does not — zero occurrences in `data/dialogue.json`; it existed in exactly one
    place in this repo, that one character brief.** His ruling: *"Assuming it isn't, you can consider
    that to be like a barn, basically."* **The blueprint stands and the plan count stays four.** The
    doc is already corrected (`docs/CAST-AND-VOICE.md:187`, *"a supply barn out on the piles"*), and
    only the two contradicted words moved — the over-explainer voice, the tic of naming what she
    cannot sell first, and the "that's Odo's figure, not mine" refusal are untouched. Note "stall"
    survives correctly in two other places and neither is a defect: `CAST-AND-VOICE.md:104` lists
    "stallholders" as a name-tier category, and Bowerdeep's night market genuinely has stalls.

    **The useful part is where the disproof came from: it was already sitting inside the blueprint's
    own `_featureSource`.** Hild's shipped lines describe a **trestle** with a run long enough to have
    an end — *"Reed bait's the bundle on the end of the trestle, and it has sat there since the thaw
    looking at me"* — plus salve and tonic as stock, standing on piles over open water. None of that
    is a stall. **The evidence had been assembled by the discipline of tracing every feature back to a
    shipped line, before anybody thought to ask the question.** That is the argument for the
    `_featureSource` convention itself: it is not provenance decoration, it is the thing that settles
    a contradiction between two documents without a new measurement — and here it settled one against
    the doc that everybody would have assumed was canonical.

32. **The maps use twice the colour Gold's do, and that is most of the "MS Paint" verdict.** The art
    session measured the eight native-size Gen 2 captures: **12 to 18 distinct opaque colours, mean
    16.0**. The two Gen 3 RSE captures read **49** each — a second reason not to mix the two as style
    sources on this axis, beyond T-17's projection. Measured the same way on the same day, **the ten
    shipped maps run 17 to 32, mean 27.0**: r2 uses all 32 of the frozen palette, brackwater 31, and
    only sanctum-approach at 17 falls inside the Gold band. Both sets of figures were reproduced
    independently before being written here, file by file.

    **This does not argue against a larger palette, and the two must not be read as opposed.** A
    palette **contains** a region; a single map **uses** a subset of it — 48 available and 16 used is
    correct, 48 available and 31 used is the bug. A per-scene subset drawn from a wider shared set is
    nearer to how the hardware being imitated worked than one global list every picture dips into.
    Written into build-doc §8.4 as a locked distinction rather than left here, because the next reader
    of the palette expansion will otherwise take this finding as a reason to abandon it.

    **And the colour count is only half of it. The other half is GROUND TEXTURE, and it is the half
    that has actually been shipping wrong.** A map at 16 colours and 9% edge density is flat; a map at
    16 colours and 45% is right; a colour check cannot tell them apart. The art session's diagnosis is
    a **postprocess** fact, not a generation one: **Gold never uses a flat fill anywhere** — grass is a
    dense checkerboard between two greens, paths a fine dot pattern, tree masses a repeating weave —
    and the texture lives in the **ground**, not the objects. Their figures: a 32×32 tile of plain New
    Bark grass, seven colours and no keylines, tiled to 1024², carries ~~43.59%~~ of their whole-map
    ~~47.51%~~ by itself, against ~~8.83%~~ for our best output. ⚠ **Those three figures are WITHDRAWN
    AS UNSOURCED, on the OPERATOR rather than by enumeration** — see the withdrawal register at the
    foot of this file. ⚠ **And the "seven colours" here is itself now in question**: the owning lane's
    re-measurement puts Gold's open ground at **3–4** distinct colours, and attributes the 6–9 range
    this figure sits inside to **contaminated patches** — five inherited coordinates that proved to be
    four-fifths trees, ledges and fences. **Recorded open, not corrected here**, because this patch is
    a different one (New Bark, not the route-29 coordinates now published) and its own coordinate was
    never written down either. Same position as the §2 row: a figure whose patch cannot be located
    cannot be re-measured, and picking between it and its replacement would be a guess. `tools/artverify/ground-comparison.png`
    is 96 native pixels of Gold ground against ours at 6×, and it is the one artefact in this finding
    a number cannot substitute for — **it is what the finding now rests on**, and it is untouched,
    because it is a picture rather than a percentage.

    **Two facts, kept split, because a combined sentence gets half-implemented.** **A — ordered dither
    buys edge density** and does nothing to the colour count. **B — a per-map colour subset buys colour
    discipline** and does nothing to edge density. Each disproves the other's sufficiency: dither at
    amplitude 45 without the subset → ~~40.02%~~ in 43 colours; the subset without dither → 16 colours
    at ~~12.88%~~; both together → ~~44.74%~~ in 16, against ~~Gold's 47.51%~~ in 17. ⚠ **ALL FOUR edge
    figures are withdrawn, and the withdrawal is on the OPERATOR rather than on a list of numbers:**
    every figure produced by the unpublished luminance neighbour-difference operator at threshold 25
    falls, wherever it appears. The right question about any edge percentage in this file is not *is it
    on the list* but *was it made with that instrument* — a list invites the first question and the
    first question is the wrong one. **The COLOUR counts — 43, 16, 17 — are unaffected and reproduce
    exactly.** **A and B each disproving the other's sufficiency does not rest on any of these numbers
    and stands**; *how close to Gold this got* rested entirely on them and does not.

    **And the dither is source-dependent, which makes it a fragility rather than a settled recipe.** A
    ±22 ordered bias crosses a palette boundary only where the ground colour already sits near one, so
    the same amplitude transforms one source and leaves another flat. Through the same postprocess, on
    one operator, comparable to each other and to nothing else: today's baseline input read ~~6.89%~~
    ground edge after the dither; a c64-LoRA input read ~~54.84%~~, against ~~60.10%~~ for Gold read
    the same way. ⚠ **All three are withdrawn — the same unpublished operator.** The sentence that
    stood here said "Both are real"; it is struck, because as written it is now false.
    **The structural claim survives the loss of its numbers, and it is the part that mattered:** an
    amplitude that works is a property of the **pair** `(source, amplitude)`, not of the amplitude.
    That follows from the mechanism — a ±22 bias crosses a palette boundary only where the ground
    colour already sits near one — and not from the measurement. What can no longer be quoted is **how
    far apart the two sources were**.

    **Both readings are reported and neither is capped.** `tests/gates/asset-palette-contract.test.ts`
    prints each shipped asset's colour count and ground texture against their measured bands: under its
    own operator the ten maps read **8.4–44.1% texture, mean 22.0**, against **51–79%, mean 64.2** for
    the eight Gold captures — **all ten below the texture band, nine of ten above the colour band.**
    Nothing about either number is asserted, and the reasons are at the thresholds. A colour cap at or
    above `palette.length` cannot fail at all, because every opaque pixel is already asserted to be an
    exact palette colour, and a cap below it is taste with a number painted on it. A texture cap is
    worse: the response to dither amplitude is near-linear (~~0 → 12.88, 24 → 24.09, 40 → 40.02,
    56 → 63.77~~ — the ladder falls with the rest of the operator, and there is a lesson sitting in
    that: **the ladder is the argument FOR the withdrawal and is itself withdrawn**, which is exactly
    what a figure without its instrument is worth), so a generator can be tuned to any figure named — and applied globally the dither
    speckles roofs and walls, so **a map that reached 47% by ruining its buildings would pass.** What
    the gate asserts instead is the instrument: that both published bands match the captures they came
    from, that those captures still measure what they are quoted as measuring, and that the texture
    reading actually discriminates.

    **§8.2's Sobel was tried first for the texture reading and is structurally blind to it.** A 3×3
    Sobel cancels on a period-2 checkerboard — the `x±1` samples in each row share parity, so `Gx` and
    `Gy` are identically zero. Measured on a 256² synthetic: flat ground with one object **0.78%**, the
    same image with a one-pixel dithered ground **0.78%**, while the neighbour-difference operator the
    gate uses separates them **0.39%** and **93.94%**. ✅ **Those two are NOT withdrawn**, and the
    distinction is the scope rule doing its job: they come from the gate's OWN `edgePercent`, defined
    in `tests/gates/asset-palette-contract.test.ts` and shipped with a control that re-runs the
    synthetic every suite (flat `< 5%`, dithered `> 80%`, ratio `> 10`, Sobel blindness `< 1`). A
    published operator travelling with its code — the standing of `GOLD_EDGE_LOW/HIGH/MEAN`, not of
    the threshold-25 family. **Always quote them with that attribution**: bare, they look exactly like
    the withdrawn figures, which is why they were flagged. **Construction pinned:** the control's
    own synthetic at **256²**, object box scaled proportionally to **96–160**, reproducing to two
    decimals (`0.39` / `93.94`, ratio 241×) — **independently in two lanes**. The control ships at
    **128²**, where the same operator reads `0.78` / `94.13`. ⚠ **Digit collision, before anyone
    quotes the 128² row:** `edgePercent` flat reads `0.78%` there, the same two digits as the Sobel
    pair it is contrasted with. Three `0.78`s across two operators in one sentence about how they
    differ — **not agreement**: the Sobel is blind, `edgePercent` is reading a genuinely near-flat
    image. Same shape as `61.444…` in `tests/unit/battle.test.ts`, which is `79 × 70 / 90` damage
    arithmetic and not an edge figure. **A caveat became a coordinate here, which is the move to
    copy**: "treat the decimals as illustrative" was replaced by a construction anyone can rebuild. Benign for `overlay-diff` itself, which measures
    layout drift and is right not to see dither — but it means **that gate cannot be used to check a
    re-dithered variant kept its texture**, and it is why this one defines its own operator. Both halves
    are asserted in the gate, so the note cannot rot into a claim nobody re-measures.

33. **`tools/palette/fit.mjs` structurally cannot produce a palette APPEND, and a second generator is
    the correct shape rather than a workaround.** Two properties, both read in the file: `K = 32` is a
    module constant at `:61` with no CLI override — the flags are `--sources`, `--out`, `--outdir`,
    `--label` and nothing else (`:78-99`) — and swatch ids are **re-derived from sorted ramp
    position** at `:373`, over a sort at `:361-372` that puts the neutral ramp first by L\* and then
    groups chromatics into 30° hue families. So raising K does not add swatches to the end: it refits
    from scratch and **silently re-orders every existing id**, which destroys the one guarantee an
    append exists to preserve — `c00`–`c31` byte-identical, so that nothing already indexed against a
    slot moves (T-15's lesson: **a palette id is a SLOT, not a colour**). Recorded here because the
    obvious future instinct is *"why not just pass K to the fitter"*, and the answer is that the fitter
    is a re-freeze tool by construction and a re-freeze is exactly what an append must not be.

34. **The FOURTH incomplete ground-texture instrument: concentration plus distinct-count cannot see
    ARRANGEMENT.** The published pair — *what share do the top three colours cover, and how many
    distinct colours are in the patch* — is a histogram, and a histogram has no notion of where a
    pixel is. **Three colours in large flat patches score identically to the same three interleaved
    per pixel**, which are the two grounds the whole art direction is about telling apart. **Neighbour
    alternation — the share of adjacent pairs that differ — is the third axis, and Gold sits at
    48.7%.** Recorded beside the three that failed before it (a 3×3 Sobel blind to a period-2 dither;
    a luminance threshold of 25 against Gold's own 28.2 separation; exact-RGB density saturating on
    unquantized output) because it is the same shape: **an instrument reporting confidently on a
    property it could not resolve.** Written into build-doc §16 with them, together with the rule the
    night's edge figures produced — **an edge-density percentage means nothing without its
    definition: threshold, channels, neighbours and denominator.**

35. **The recurring dark band across the bottom edge is the prompt skeleton's own cliff-step clause
    being obeyed literally — and this is the night's highest-value fix, LoRA-free.** It was called a
    cutaway strip for hours and read as a projection failure. It is not. **Hearthollow is a flat
    meadow hamlet with no elevation**, so the model has nowhere to put the step the clause asks for
    and puts it at the frame. **Deleting the clause removes the band.** The shape of the fix is that
    the clause should be **conditional on nodes that actually have elevation** rather than carried by
    every node's prompt — but **the art lane owns the prompt files and the fix is theirs to make**;
    this is recorded, not prescribed, and no prompt file was touched from here.

    **Recorded with it because a disproof is worth more than a plausible story: the negations
    hypothesis is cleanly DISPROVEN.** The theory was that the band came from negated phrasing. All
    six negated phrases were rewritten as affirmations; **the band survived, and a second band
    appeared at the top.** That is a disproof, not a weakened hypothesis — do not re-raise negation
    as the cause.

### Opened by the 2026-08-27 05:00 pass — the progression loop landing

36. **The persistence wiring landed, THE INN HEAL HAS NOW LANDED WITH IT, and the ECONOMY half of T-12
    still has not.** ⚠ **The first two bullets of this item asserted the opposite until now and are
    corrected, not rephrased.** Damage persists (T-28), a wipe recovers (T-29), and as of the inn
    commit a damaged-but-not-wiped party has a rest it can walk to. Each half was re-read this pass
    rather than inferred:
    - **`restAtInn` heals what it charges for.** It is `innRestFor` → `applyInnRest` → `spendTicks`,
      in that order — consequence before price — and the banner reports the count. The old claim here
      (*"its whole body is `spendTicks` and a banner … it charges two ticks for a rest that changes no
      HP"*) was true when written and is false now. No line number is quoted: this file has already
      published `:1972` for this method twice while the method moved.
    - **The reader count is ONE, and it did not change — what changed is who reaches it.**
      `medicine.innRestFullHeal` still has exactly one reader anywhere in the repo,
      `restoredUids` in `core/recovery.ts`, which is the only place the flag is branched on. It now
      has **two callers**: `blackoutRecoveryFor`, the wake, and `innRestFor`, the inn. Say it that way
      round — *"its only reader is the blackout's wake"* was two claims welded together, one of which
      (the reader count) is still true and one of which (that only the blackout gets there) is not.
      The selection is deliberately REUSED rather than re-spelled, so a private copy cannot drift from
      it; a test asserts both paths produce byte-identical parties.
    - ✅ **MONEY NOW HAS AN EARNER, A SINK AND A SHOP, AND THIS BULLET IS SUPERSEDED RATHER THAN
      REPHRASED — see item 55 for the landed state.** ⚠ **It has said "no earner the player can
      reach" for three passes and it is now false.** A won **rival** fight levies a purse on the live
      path; the town shop spends it; both halves go on the tape through `applyPayout` and
      `applyGrant`, each with a `replay()` arm. What survives from this bullet, unchanged and still
      the reason the inn charges no coin: **`innCost` still has zero readers**, deliberately — the
      owner's ruling is *"innCost is already paid through ticks."* **The ordering worry that stood
      here is discharged**: the earner landed before the sink, so a priced inn is no longer the thing
      that would make a run unpayable, and turning `innCost` on is now a design question rather than
      a blocker. The `baitPrice` rows are the one price still reaching nothing at all.

      ⚠ **AND THE SEVERITY THIS ITEM ACQUIRED IS DISCHARGED, TWICE OVER, WHICH IS WORTH SAYING
      PLAINLY BECAUSE THE ESCALATION IS STILL WRITTEN ABOVE IT.** The clause read: *"nothing in the
      game can be caught, so a never-cut demo beat is unplayable."* **Both halves were false.**
      Catching was never blocked — it was UNMETERED, and the headline at the top of this file records
      how that was measured. And the snare grant has since landed anyway: a new game holds three base
      snares from Maren's own line. **The residue is not "no snares"; it is the opposite** — the
      tiers nobody hands out are still infinite, which is item 56.
    - **The explicit loss penalty exists, but as the blackout's 5 ticks**, and `core/recovery.ts`'s
      header argues in prose that this *is* the penalty T-12 asks for. **That is a reading, and it is
      marked as one here.** It prices a wipe; it does not price a loss that leaves something standing.
      The header has been amended in place to say that the inn is now a way back to full but is never
      the cheaper route out of a wipe, because a wipe happens on a route with no inn to walk to.
    This is T-12's remainder and it is written up there, not as new work here.

37. **`replay()` still has ZERO production callers, and T-34 did not change that.** The party half of
    a catch is fixed — the `catch` action now carries `gained` whole and absolute
    (`core/types.ts` `GameAction`), `applyCaught` (`core/save.ts:829`) is the one applier both paths
    come through, and `tests/property/determinism.test.ts:421` — *"reproduces the WHOLE save — the
    creature included, not just the count"* — is the test that binds it. **But every caller of
    `replay` in the repo is still a test**, re-grepped: `year-turn-ux`, `wild-battle`,
    `battle-persistence`, `recovery`, `determinism` and `seams`. **L10 remains a property the suite
    asserts, not a load path the game takes.** Say it that way round: the defect closed, the scope
    did not. The determinism tests still certify less than their name suggests.

    **THE INN REST WAS A THIRD INSTANCE OF THE SAME SHAPE AND HAS LANDED; THE WHOLE UNION HAS NOW BEEN
    AUDITED, AND TWO MORE REMAIN.** A tape entry was minted for the rest and `replay()` had no arm for
    it, so live the party healed and on replay it stayed hurt — L10 false for any run that rested. The
    fix is a named `case` reusing the live path's own function, and the rest's **tape** half moved from
    `core/recovery.ts` to `core/save.ts`, enacting the ownership rule `core/recovery.ts`'s own header
    already stated: **`save.ts` owns the TAPE, `recovery.ts` owns the DECISIONS.** Because `replay()`
    has no production caller, this was **a broken invariant, not a live player-facing fault** — which is
    exactly what let it survive, and is the argument for auditing the union rather than waiting for the
    next symptom.

    `GameAction` has **16 members** — ⚠ **this said 14 and the economy pass added two**, `payout` and
    `grant`. **Twelve have arms**, and both new members shipped **with** their arms and their
    appliers in the same commit as the type, which is the order the inn-rest defect argued for: the
    invariant was enforced before the consumer landed rather than after the symptom. **The four that
    reach `default` are the same four, and they are not four of a kind:**

    | member | reaches `default` | verdict |
    |---|---|---|
    | `inn` | yes | **correct** — a price, charged by `clockFromLog` (`game/year-replay.ts:167-172`). The heal is the separate `innRest` entry |
    | `travel` | yes | **`currentNode` is not restored** — T-53, and it needs a ruling, not a patch |
    | `foray` | yes | **`forayStepsSinceTick` is not restored** — T-54 |
    | `battleAction` | yes | **dead: zero mint sites anywhere** — T-55 |

    **One asymmetry to notice, because it is the tell.** `battle` is *also* a pure price, and it got a
    **named no-op arm with a comment saying so** (`core/save.ts:1224-1242`) while its three sibling
    prices were left on `default`. A named arm that applies nothing is how a reader learns the omission
    was decided; `default` is how a reader learns nothing at all.

38. **Three comments are now false and are recorded rather than fixed**, because each sits in a file
    another lane holds. Tickets **T-44**, **T-45**, **T-46**. ⚠ **T-46 IS NOW CLOSED** — the
    precondition was repaired and the surviving mask assertion widened to all twelve nodes; **T-44 and
    T-45 were re-read on this pass and both are still open.** **And the shape recurred immediately, in
    the economy lane**: three more docblocks went false inside the commit that falsified them, which
    is item 57.
    - `tests/unit/overworld-scene.test.ts:1194` says `GameAction` *"deliberately has no `blackout`
      member … so a string comparison here does not even typecheck."* `core/types.ts:684` is that
      member. **The test still passes and its stated reason is dead** — which is the more dangerous
      shape, because nothing will ever go red to announce it.
    - `core/recovery.ts`'s **WHAT LIVES WHERE** paragraph says `core/save.ts` *"owns the TAPE —
      `BlackoutRecovery`, `blackoutAction`, `readBlackout`, `applyBlackout`."* The **type** is
      declared at `core/types.ts:634` and re-exported by `core/save.ts:622`, so every import is
      unchanged and nothing is broken. The sentence is imprecise, not wrong about the module's job.
      ⚠ **The `:30` this item published has drifted to `:38`** — the inn commit added 182 lines above
      it — so the paragraph is named by its heading here instead, which does not move.
    - ✅ **`tests/unit/manifest.test.ts` — the fossilised precondition is REPAIRED and this bullet is
      closed.** The base-map half is deleted, the mask half now names all twelve nodes, and the suite
      is green on it. See the verified-state section above.

39. **The instrument-failure tally is ELEVEN, and the list has outgrown "instruments".** Build-doc §16
    publishes the four ground-texture instruments at `docs/build-doc.md:496`, and **as of 2026-08-27
    it also publishes №11 below** (`:498`) — which arrived in build-doc FIRST and is folded in here,
    the opposite direction to the usual handoff. The roll-up lives here so the list stays whole. Seven
    were counted before the overnight pass, two arrived with it, and **№10 and №11 arrived after it**.
    The three degenerate-limit assertions the ordering hunt turned up are **inside №8**, not counted
    separately: they are the same shape at its limit, and splitting one shape into four entries would
    inflate a tally this file uses as an argument.
    1. A 3×3 Sobel cancels on period-2 and cannot see a one-pixel dither.
    2. A luminance threshold of 25 against Gold's 28.2-step greens — passing by 3.2 points, which is
       luck rather than headroom.
    3. Exact-RGB difference saturates on unquantized output and ranks everything alike.
    4. Colour concentration is a histogram and cannot see arrangement.
    5. **The eye.** A LoRA's ground looked stippled and was 2,451 colours differing by one per
       channel. **This is the most important on this list, not an appendix**: the others have an
       instrument to blame and this one does not, and it is the fallback every reader assumes is
       always available.
    6. **A comparison that answered a different question, with a decision-sized conclusion drawn from
       it** — raw LoRA output measured against the target, when the question that decides adoption is
       LoRA *plus postprocess*. Not an instrument at all, and the widest blast radius on this list,
       **because every number in it was correct.**
    7. **An assertion whose observation channel is silenced by the code under test.** A test watched
       `console.warn` to prove a watchdog timer had been cleared — but the callback's own
       `if (settled) return` suppresses that warning *even with a live timer still pending*. **The
       assertion observed nothing and passed.** Rewritten to count live timers directly
       (`tests/unit/mapview.test.ts:380-383`, `vi.getTimerCount()`), which is what made it bind.
       *"Assert on an observable side effect"* reads like good practice right up until the side
       effect is optional.
    8. **An ordering assertion with no margin is correct and useless — and the class hunt it started
       found three more, all at the degenerate limit rather than at the margin.** The UI-contrast gate
       required an inactive role be dimmer than every live text role on the same ground. **It ran, it
       compared, and it passed** — on **5.685 against 5.816**, i.e. **1.023× dimmer**. True to three
       decimals, false at arm's length. **The guard has since been repaired**: a role that takes the
       inactive exemption and then lands above 4.5 anyway is body text wearing the tier's name, and
       the single real violation is named in an allowance that **fails if it stops being a
       violation**, so it dies when the palette append lands rather than outliving the defect
       (44 pairings → 54, zero red). **The hunt that followed swept 1,016 ordering assertions across
       70 files, ~115 of them measured on shipped data, and the answer is thin and was not padded:**
       `tests/unit/props.test.ts` asserted an array length is `>= 0` — the floor of its own domain, so
       it ran, compared and resolved nothing, while the `continue` beneath it waved through the exact
       state its own docblock calls *"a chain with no way in"*; and the palette gate held an assertion
       **comparing 100 to 100**, because both synthetics saturate a top-three share on a
       three-colour fixture. One was left unfixed and **reported as unsafe rather than bolted to a
       threshold** — a cross-ground WCAG comparison at 1.081×, on the same swatch, where no correct
       threshold could be determined. Over a luminance-only metric blind to hue, an ordering check
       cannot see a saturated green sitting level with a desaturated brown.
       — `tests/gates/ui-contrast-contract.test.ts:571-572`
    9. **A rule stated correctly, applied one category too wide.** `tools/comfy/MAP-PROMPT-RULES.md`
       R2 records that the **`negative` prompt FIELD** is inert at cfg 1.0. Sound, measured, evidence
       intact. It says nothing about the word *"no"* inside the **positive** prompt, where those are
       ordinary tokens that work — the full-bleed clause (*"no island, no plinth, no cutaway earth
       wall, no border, no blank background"*) is the one clause in that file measured as a clear
       win, **0.06% void against 13.6–31.1%**. A brief said *"keep the full-bleed clause"* and
       *"delete every negation"* in the same breath; the full-bleed clause **is** negations, the
       contradiction resolved the way it was written, and the framed-island failure returned at once —
       **6 of 27 cells on a grey matte frame, against 3 of 37 before.** **There was no bad
       measurement anywhere in this.** The distinction to keep: a term in the `negative` field is
       inert and can be ignored; **a negated phrase in the positive prompt is judged per clause, on
       evidence.** The rule that falls out: **never delete a positive-prompt clause for its FORM —
       delete it because it was measured inert.**
    10. **AN ARM THAT SKIPS EVERY ASSERTION READS AS AN ARM THAT PASSED.** The asset-palette gate's
       reference arm iterated the Gold captures and `continue`d on a missing file. Measured by moving
       `assets/reference` aside: **42 passed (42), byte-identical to the baseline run**, while the
       advisory cheerfully printed *"0 capture(s) verified, 10 absent"* — so every published Gold band
       was then a literal checked against a literal in the same file. Nothing asserted a count, and
       the old comment's premise that absence was *"not a defect"* was false: `git ls-files` lists all
       ten as committed repo content, not art-lane scratch. Repaired by asserting the absent set empty
       **by name** and pinning the capture count **twice** — against the table's length and against
       the number of captures whose assertions actually ran — because the arm can also be emptied by
       rows LEAVING the tables, which a non-zero floor cannot see. **This is T-35's vitest pair
       arriving inside a gate that did run**: an empty run and a passing run look identical, and here
       the run was not even empty.
    11. **THE FAILURE DIRECTION IS THE TELL: an instrument that under-counts reads as good news, and
       good news is what nobody checks.** This one is published in build-doc §16 (`:498`) and is
       recorded here for completeness — the only entry on this list that went the other way round.
       Two instances on 2026-08-27, in different lanes, minutes apart. **(a)** A walk of `tools/` →
       `game/` imports used a `^import … from` pattern and found **5 import sites**; several real ones
       span lines with the specifier on the closing line, and the true count is **9 across 5 files**.
       The smaller answer was also the tidier one, and it dropped `game/survey-view.ts` out of a
       dependency audit entirely. **(b)** A check that no layout puts something solid on the spawn
       tile extracted the drawing with `len(line) >= 64`; the layout files run 114 lines at widths
       from 1 to 207, so the filter matched the **header prose**, read the centre character as `' '`,
       and concluded *"0 problems"*. **The first instrument was reading comments.** It surfaced only
       because a space is not a legend character and looked odd enough to check. Same shape as the
       whole-frame `flat%` that reported 78% as a win while measuring one unbroken green field:
       **the wrong number was the more pleasant one.** The practice that falls out: when a count comes
       back lower, cleaner or greener than expected, re-derive it by a second method; when a filter
       selects the region to measure, prove it selected the region; and **prefer parsing through the
       shipped parser over a fresh regex**, because the parser cannot drift from what the code reads.

    **Two things the list produces, and they are the reason to keep it as one list.**

    **RULE ZERO SURVIVES WITH ITS SCOPE NARROWED.** *Look before trusting a number* is right, and
    **looking is a CHECK, never the answer.** A rule that told you to look and let you stop there is
    exactly what produced the LoRA reversal — item 5 is the eye reporting confidently on a property it
    could not resolve, and item 6 is a correct set of numbers answering the wrong question. Looking
    disqualifies a number; it does not qualify one.

    **RETIRE AN INSTRUMENT THAT HAS PRODUCED A WRONG ANSWER — do not merely correct the answer.** The
    art session's wrong *"c09 is a neutral"* claim came from a crude hue-family bucketer, **the same
    instrument that had produced its palette-hole error hours earlier.** Its own words: *"Second time
    from the same tool; I should have stopped using it after the first."* A corrected conclusion
    leaves the tool in service, and the tool is what produced it. **That is what turns a list of
    failures into a practice**, and it belongs beside the eleven rather than under any one of them.

40. **THE SPAWN CELL IS WALKABLE ON EVERY MAP BY CONSTRUCTION, NOT BY LUCK.** All twelve committed
    layouts author `@` at cell **(32,32)** — `*` for the sanctum — which normalises to walkable floor,
    so **native (512,512) is walkable on all twelve.**

    ⚠ **THE SECOND HALF OF THIS ITEM NO LONGER HOLDS AND IS CORRECTED, NOT REPHRASED — see item 43.**
    It read: *"Because the ControlNet round paints FROM those layouts, the collision mask and the
    painting now derive from one source and agree by construction … the reason to say* inherited
    *rather than* verified*."* **The inheritance was conditional on a round that is no longer the
    round being run**, so the guarantee is withdrawn: what survives is the *layout* half — every
    layout authors a walkable centre — which is a property of twelve `.txt` files and is checked.
    Whether the *painting* agrees with it is now an open question and is item 43.

    ⚠ **This is NOT a statement that the maps are approved.** The owner has not declared the map set
    and the round is still in flight. What is settled is the relationship between two artefacts, not
    the quality of either.

    **It was verified through `tools/mapgen`'s own `parseLayout` / `normalisedAscii` rather than
    through a fresh regex, and that mattered** — the first instrument was a `len(line) >= 64` filter
    that matched the header prose instead of the drawing and answered *"0 problems"* off the wrong
    rows. Same verdict, entirely different reason, and the first one was reading comments. It is item
    39 №11(b), and it is the argument for parsing through the shipped parser.

    **T-39 is a different question and is NOT closed by this.** `sanctum-antler-ring` still sits at
    `x: 512, y: 512` with `interactionRadius: 48` in `data/nodes/sanctum.json` — re-read this pass and
    unchanged. The spawn cell being *walkable* does not stop the player landing **inside** the
    Sanctum's only prop; those are two map rules meeting on one cell, and only one of them is now
    guaranteed.

### Opened by the 2026-08-27 doc-currency pass — collision, and the seam under it

41. **COLLISION DOES NOT EXIST TODAY, and the size of the gap is measured rather than described.**
    All twelve `data/nodes/*.json` declare a `collisionMask` at `assets/final/maps/<node>-mask.png`.
    **Zero of those twelve files exist** — checked per declared path, one `existsSync` per node, not by
    counting the directory, because a directory listing cannot tell you *which* twelve names it is
    missing. `game/collision.ts` therefore falls to `synthesiseBorderCollision` (`:630`) at every node,
    and every node runs on a border ring: **252 solid cells of 4096**, being `4 × 64 − 4`.

    **Measured through the real `loadCollision` call** — the same one `game/scenes/OverworldScene.ts:740`
    makes inside `buildNodeView`, with `pixels` null exactly as `readMaskPixelsSafe` (`:3592`) hands it
    when the PNG is absent — against each node's authored layout:

    | reading | figure |
    |---|---|
    | solid in the layout, walkable at runtime | **19.53% – 43.14%** of every node |
    | worst node | `hearthollow`, **1767 of 4096 cells** |
    | best node | `r1`, 800 of 4096 |

    **No building is solid; no water stops anyone.** ⚠ **Two figures that were circulating are
    CORRECTED here rather than repeated: "19.6% to 43.2%" and "1769" are the SYMMETRIC DIFFERENCE** —
    every cell where the two grids disagree in either direction — **not the "walkable that the layout
    says is solid" figure the sentence around them described.** The extra 2–6 cells per node run the
    other way: border cells the synthesised ring blocks that the layout leaves open, which are the edge
    corridors. Both numbers are real; only one of them answers the question that was asked, and the
    difference is small enough that nobody would have caught it by looking.

    **The fallback announces itself, but not where a grep for `console` will find it.**
    `synthesiseBorderCollision` logs **nothing** — the module is deliberately side-effect-free — and
    instead returns a `note` (`game/collision.ts:655`) reading *"SYNTHESISED collision (`<mask path>`
    did not load) — walkable except the border; NOT an authored mask"*, which reaches the player
    through the HUD line at `game/scenes/OverworldScene.ts:848`. A second note on the *refusal* path
    (`:605-608`) opens *"REFUSED mask … SYNTHESISED collision instead"*. **This file previously
    described that string as something the code logs; it is a returned field rendered on screen.**

    **Twelve masks DO exist, git-ignored, at `assets/raw/_layouts/masks/mask-<id>.png`** — `tools/mapgen`
    output. Nothing in `data/`, `game/` or the Vite-served copy points at them, and promoting them is
    item 43, not a paste.

42. **THE LAYOUT→MASK ROUND TRIP IS EXACT, AND MOST OF THE SABOTAGE EVIDENCE REPORTED FOR IT DOES NOT
    EXIST.** Both halves matter, and the second half is the one worth recording, because a proof is
    only as good as the demonstration that it can fail.

    **What IS asserted, and passes.** `tests/unit/mapgen.test.ts:339` drives all twelve real layout
    `.txt` files through `checkMaskRoundTrip` (`tools/mapgen/verify.ts:406`) and asserts `[]` — **0 of
    4096 cells differing on every node.** `tests/unit/collision.test.ts:847` round-trips random grids
    on the same pair. Re-run this pass: **110 passed of 110 across the two files.**

    ⚠ **DEMONSTRATED IS NOT PROTECTED, and that is the whole of this entry.** The round trip WAS run
    end to end through the shipped `loadCollision` — but in a throwaway harness, not in the suite, so
    nothing in this repository will notice if it breaks tomorrow.

    - **What was actually run, and where.** A scratchpad harness (`scratchpad/masktrip/roundtrip.ts:104`,
      `sabotage.ts:86`, `today.ts:45`) called `collision.loadCollision(id, node.collisionMask, pixels,
      balance)` — the real function, the same one `game/scenes/OverworldScene.ts` calls inside
      `buildNodeView`. It reported **0 of 4096 cells differing on all twelve**, and its sabotage arm
      reported a vertical flip differing in **1274** cells and a horizontal flip in **1434**
      (`sabotage-out.md:12-13`), with per-node figures for all twelve at `:45-47`. Those runs happened
      and their outputs are on disk. They were deliberately kept out of the repo — the harness was
      briefed read-only — so they are a **demonstration, not a gate**, and they expire with the
      scratchpad.
    - **What the SUITE actually protects is narrower, and the gap is the finding.**
      `tests/unit/mapgen.test.ts` round-trips all twelve through `checkMaskRoundTrip`
      (`tools/mapgen/verify.ts:406`) and asserts `[]`, but **in memory and at `readMask`** — it never
      calls `loadCollision` (zero occurrences). The equivalence to the shipped path is *argued* in
      comments at `:14-16` and `verify.ts:401-404` (`loadCollision` with no options delegates to
      `collisionFromMask` → `readMask`, readable at `game/collision.ts:664-673`) — sound argument, and
      argument is not assertion. No committed test writes a damaged PNG, flips a mask, or repaints a
      single cell.
    - **Committed sabotages that DO hold:** `tests/unit/mapgen.test.ts:588` — one alpha-0 pixel and
      `readMask` refuses the file (`usable === false`, `transparentPixels === 1`); and the strongest,
      because it is the only committed one running through the real `loadCollision`,
      `tests/unit/overworld-scene.test.ts:1345` — an all-black mask is REFUSED rather than loaded as
      authored geometry (`source === "synthesised"`, note contains `REFUSED`, `health.usable` false,
      the player is not left standing in a wall, and the HUD prints it).
    - **A correction to a correction, recorded because the shape recurs.** A doc pass reported these
      sabotages as *"unsourced"* and the figure `1274` as *"not occurring anywhere in this
      repository"*. Both statements are true OF THE REPOSITORY and both were the wrong corpus: the
      evidence was in the scratchpad, where it had been required to stay. **An instrument searching the
      wrong corpus returns a confident absence** — and absence is the most persuasive kind of clean
      answer. Cross-referenced with `docs/build-doc.md` §16's newest entry: the pleasant reading is the
      one nobody re-derives, and *"no evidence exists"* is pleasant when you are auditing someone
      else's claim.

    **So the honest statement is: the layout→mask→grid transform is an exact bijection on the twelve
    shipped layouts and on random grids, it refuses a transparent pixel and an all-black frame, and it
    has never been shown to go red on a moved cell.** That last clause is the one a promotion would
    want, and it is the one nobody has written.

43. **"THE MASK IS UPSTREAM OF THE PAINTING" NO LONGER HOLDS, and promoting the twelve masks is
    therefore NOT a clear improvement on the all-open placeholder.** This corrects item 40's second
    half. It was true while the ControlNet hint was built from `tools/mapgen/layouts/*.txt`; the art
    lane reports it is now running a round that conditions on hand-made top-down control drawings
    instead, so **the painting's composition source and the mask's source are about to be two different
    files.**

    **What is checkable from here, and it is the load-bearing half:** the ten paintings on disk were
    **not** produced from the layouts. `git show HEAD:tools/comfy/manifest.json` contains **zero**
    occurrences of "controlnet", and `tools/comfy/controlnet-graph.ts` and `tools/comfy/hint-image.ts`
    are **untracked** — the ControlNet lane has never been committed. The ten committed maps predate
    it. **The layouts and the paintings do not correspond**, and nothing reconciles them.

    **The consequence is the part that must not be lost, because the conclusion alone reads as
    caution.** A mask shipped against today's painting **blocks the painted road and leaves the painted
    buildings walkable.** That is worse than no mask: an all-open placeholder is *visibly* unfinished
    and lets the player reach everything, while a wrong mask is invisibly wrong and stops the player
    walking down a road they can see. **Correct geometry against the wrong picture is not partial
    progress.** The work this implies is T-56 (the gates) and T-57 (the ruling), not a promotion.

    ⚠ **THE RULE THIS ITEM STATES IS NOW SUPERSEDED, AND ONLY BY BEING MADE PER NODE — do not carry
    the looser version forward.** *"Do not ship generated masks"* was right while every node was in
    the same state. The tiled round makes them differ, and the replacement is in the tiled-maps
    section above: **a node may ship its collision mask on the same commit that ships its TILED
    painting, and not before.** The two rules give the same answer today, because zero nodes have a
    tiled painting; they part company the moment one does, and taking the blanket version at that
    point would block a correct mask while taking a blanket *"masks are fine now"* would reintroduce
    exactly the defect this item describes on the nine nodes that are still generated images.

    **One in-tree corroboration that the two readings of a layout are already pulling apart**, from the
    art lane's own uncommitted `tools/comfy/hint-image.ts`: a layout's outer wall ring *"is doing a real
    job"* as a collision spec — it is what stops the player walking off the map — and is *"the defect"*
    as a composition brief, so the hint drops the ring the mask depends on. **The two readings of one
    file disagree**, in the file that reads it.

44. **TWO ART-LANE READINGS ARE WITHDRAWN BY THEIR OWN AUTHOR — recorded as withdrawals, on §16's
    standard: not disproved, and not evidence either.** Both are the kind that get re-cited from memory
    once the reason is gone, which is why they are written down rather than deleted.
    - **"ControlNet is refuted."** **Over-generalised.** The border ring the model reproduced **was in
      its input** — every layout is ringed by wall characters, which `tools/comfy/hint-image.ts` states
      about itself and works around. That indicts **the layouts as a hint source**, not the tool. Do not
      cite it as a verdict on ControlNet.
    - **"ControlNet at 0.9 destroys the art."** **Confounded.** It was measured against see-through
      wireframe control drawings, which make the model draw roofs on posts. The strength and the drawing
      style moved together, so the reading cannot separate them.

### Opened 2026-08-27 by the FIRST LIVE PLAYTEST — the game was driven in a browser

⚠ **PROVENANCE, AND IT BINDS EVERY ITEM IN THIS SECTION.** The bundle that was played was built from
the tree **before several of the commits that have since landed**, and `game/scenes/OverworldScene.ts`
was being edited by another lane *while the run was in progress*. **Every scene-level line number the
playtest cited is a reading against a stale tree and is NOT reproduced here** — where a line is quoted
below, it was re-read on the current tree and says so. The playtester marked their own observations
`[SAW]` and their readings of code `[INFERRED]`; **that distinction is theirs and is preserved.** An
inference does not become an observation by turning out to be right.
⚠ **And the few `game/scenes/OverworldScene.ts` lines cited below were exact when written and are
citations into a file another lane is editing this minute** — re-read one before acting on it. The HUD
citation had already drifted by one during this pass and was replaced with a symbol.

⚠ **Two rig caveats they recorded, so nothing below is mistaken for a game bug.** The driving Chrome
window was occluded, so `document.visibilityState === "hidden"` and Chrome starved `requestAnimationFrame`
— Phaser does not stop itself when hidden, so only the browser's rAF was starved. They replaced it with
a worker-driven pump (page-side only, **no repo file touched**) and measured ~110 fps. **With reliable
synthetic input they never again saw a dropped or doubled key**, so the two intermittent input findings
from the early run — a single Down moving two rows in the slot menu, and two rapid Rights advancing one
step in Settings — **are discounted by their own author** as artefacts of the extension's key dispatch.
They are recorded here as discounted rather than deleted, because "one keypress from overwriting the
wrong save" is the kind of note that gets re-found.

45. **⛔ WITHDRAWN IN FULL — "CATCHING IS UNREACHABLE, SO DEMO BEAT 1 CANNOT BE PLAYED" WAS FALSE WHEN
    IT WAS WRITTEN, AND IS FALSE TWICE OVER NOW. It is kept, hollowed out, because the reasoning that
    produced it is the most expensive mistake recorded in this file and deleting it would delete the
    lesson.** The headline at the top of this file carries the measurement that refuted it.
    - **It was false when written.** `core/battle.ts` `bagHas` reads an ABSENT bag key as unlimited,
      so a player with `items: {}` could always throw a snare. **The verb was UNMETERED, not
      unreachable**, and `tests/integration/demo-beats.test.ts` had been playing the beat from a
      zero-item save and passing the whole time. **Every one of the six bullets this item used to
      carry was a correct reading of a file** — no `items` key on `zDialogueEntry`, no grant
      machinery, no starting inventory, no shop UI, and a comment in `game/wild-battle.ts` asserting
      the consequence in plain English. **Six true premises and a false conclusion**, because not one
      of them was the premise that decides the question, and nobody ran the game to find out.
    - **It is false again now, for a second and independent reason.** The economy landed: an entry
      may carry `grants`, `maren.tutorial.snare` carries `{"base": 3}`, the runner applies it on
      completion, and a shop and a fifth-gym master grant write to the bag as well — **items 55 and
      56**. **A new game holds three base snares.**
    - **What survives, and it is the part worth carrying forward:** *the reachability gate proves a
      path to the SCREEN, not to a MECHANIC.* That sentence was the item's real content and it is
      true independently of the false conclusion it was attached to. **The residual defect is the
      inverse of the one claimed here** — not that no tier can be held, but that any tier never
      granted is infinite (item 56).

    **Build-doc §15's two integration gates still name the verb** — **I1** *"vertical slice playable
    end-to-end (**catch**, battle, survey moves, year turn)"* and **I2** *"cascade demo reproducible
    from `overcatch-script.json` in real play"* — and `fixtures/overcatch-script.json`'s own `_why`
    still states the standard: *"Nothing here is a forcing helper or a test-only shortcut: every entry
    is an action a player can take."* **That standard is met on the base tier and is met by an
    accident on the others**, which is the honest reading of it today.

    ⚠ **AND THE "ONE PROBLEM, TWO ENDS" READING OF THE CASCADE GATE FALLS WITH THIS ITEM.** It argued
    that the red gate could not be fixed by tuning because its reference player held a weighted snare
    nothing could supply. **The gate is no longer red, and it was not red for that reason**: it was
    measuring `preyShare` without the seasonal window §7.2 specifies, and the correction is the
    resolved section at the top of this file. `harness.overcatch` does still hand `ref.snareTier` to
    `catchChance` with **no inventory check at all** — that part reproduces — but a weighted snare is
    now purchasable after the second gym, so the reference player is no longer impossible. **Two
    claims were welded together here and only the second survives.**

46. **✅ CLOSED — A PARTY WIPE NO LONGER ENDS THE RUN.** ⚠ **This item read "OPEN AND IN FLIGHT; NOT
    FIXED" and that was already false when it was written**; the fix is an ANCESTOR of the commit that
    wrote the sentence. The headline at the top of this file carries the correction. **The cause was
    not the one inferred below and the difference is instructive**: it was **scene-op FIFO ordering**,
    not an unbalanced pause/resume pair. `DialogueScene.finish()` is `onDone(state)` then
    `scene.stop()`, and every `ScenePlugin` call is queued FIFO, so everything the overworld did
    inside `onDone` was queued **ahead of the box's own teardown** — a chained beat produced
    `resume · stop · start · pause · stop`, and the overworld's last op was a pause with nothing alive
    to resume it. **Counting pauses against resumes could not have found it**, and Phaser logs
    *"Cannot pause non-running Scene"* on a double pause, which was never seen — so the evidence
    against the inferred cause was already on the screen. The fix is a latch held for the duration of
    `onDone`, with `playEntry` queueing instead of launching inside that window. **The observation
    below is kept verbatim as the record of what was seen**; only its verdict has moved. `[SAW]` after
    a lost wild fight, a lost rival fight and a lost gym fight: once the last blackout-narration line
    closes, **nothing responds** — arrows, `[C]`, `[E]`, ESC twice. **It is not the harness and not a
    stopped game loop**, measured in the same instant: `{ keydownsSeen: 1, framesAdvanced: 56 over
    ~500 ms }`, and separately 142 and 148 frames on the two later reproductions. **No console error, no
    exception, no Phaser warning.** The key reaches `window`, the game steps, and the overworld does
    nothing with it. The playtester's reading of the cause — more `scene.pause()` calls than
    `scene.resume()` across a chained pair whose own comment says the pair is *"not ref-counted"* — is
    marked **`[INFERRED]` by them** and is preserved as an inference. **A lane is repairing this now and
    its work has NOT landed.** Appended to **T-29**.

47. **✅ CLOSED — THE BLACKOUT NOW DRAWS A BLACK SCREEN AND WAKES THE PLAYER INSIDE THE INN.** ⚠ **This
    item also read "OPEN AND IN FLIGHT" against a fix that had already landed.** Both halves shipped
    in the same commit as item 46. The black screen did not exist because a comment claimed an empty
    name plate *"is what makes it read as a black screen"* — **a claim about the name plate while the
    ordinary box drew over the live map**, and the false comment was corrected where it stood; a
    curtain now fills the virtual screen in the palette's void role, above the HUD, and is held until
    the **chain** ends rather than the beat. And the wake reached the town but not the room, because
    `wakeNodeFor` answers the **town** — which at every inn town is the town already stood in, so the
    move was the identity. It now enters the inn's **interior**, derived through the same innkeeper
    predicate the rest refusal uses, never a name match. **Cost logic untouched.** The observation
    below is kept as the record of what was seen. Hank: *"a dialogue shows up with a black
    background saying you passed out or something like that, **and then you wake up at the inn**"* —
    recorded verbatim in `docs/TICKETS.md` T-29 and in `core/recovery.ts`'s header, both re-checked this
    pass and intact. What draws `[SAW]` is the ordinary dialogue box over the **live overworld** with
    the debug HUD still on top of it. And the player wakes where they fell: tile `18,29` before the
    fight and after the whole sequence, with the inn door at `18,24` and the interior never entered.
    **The node move is a correct no-op** — for a wipe in Hearthollow the wake node *is* Hearthollow —
    so nothing puts the player in the room the prose describes.
    ⚠ **THE TICK CHARGE IS NOT THE PART THAT FAILED.** The banner read `hearthollow 5 ticks` and the
    meter moved by five, which is `2 × innTicks + travelTicks` exactly as ruled. **The shape worth
    keeping: the test written under T-29 binds the node-level move at every shipped node and is right —
    and it cannot see that a wake node equal to the current node leaves the player standing outdoors on
    the tile they fell on. The thing asserted was the graph hop; the thing ruled was the room.**

48. **🔴 NOTHING THAT MOVES IS DRAWN — and it is the art lane, not a regression.** `[SAW]`, each with
    the placeholder's own printed label: the player is a box reading `player/player-front 32x48`; both
    battlers are boxes reading `creature-battle/battle-loamunder-e-front 96x96` and
    `battle-cindril-j-back 96x96`; TEAM's portrait is `dex-painted/dex-cindril 96x96`; the title banner
    is `ui/title-banner 208x48`. Interiors render as untextured footprints and the HUD says so:
    *"FOOTPRINT interior hearthollow-inn — 13x8 plan cells … NOT painted art."* **Only the ten painted
    node maps and the town props are real art** — consistent with item 22 and with the placeholder
    contract working as designed. **The player art that IS in the repo lives under
    `assets/approved-trials/_player-views/derived/` and is never copied anywhere the game can load it**
    — `assets/final/` holds `maps/` and nothing else. That last clause is worth acting on: it is a
    *sync* gap, not a missing asset.

49. **🔴 / 🟠 / 🟡 The rest of the ranked list, at the playtester's own severities.**
    - 🔴 **A 16-line debug HUD covers ~75% of the 480×320 screen** from the moment gameplay starts,
      bottom lines overdrawing each other, overlapping the dialogue box and the choice list, with no key
      to dismiss it — `[C]` is a separate collision overlay. Re-read on the current tree: **`this.hud`**
      is one text object created in `create()` at depth 100 with `setScrollFactor(0)`, and it is
      **unconditional** — no debug flag, no toggle, no build-time gate. **No line is published for it:
      `game/scenes/OverworldScene.ts` is being edited right now and the citation drifted by one while
      this section was being written.** **T-61.**
    - ✅ **CLOSED — the battle log's arithmetic no longer disagrees with the bar** *(T-62)*. `[SAW]`:
      `Cindril -62 HP · Resisted` against a bar moving 58 → 2, six apart. The cause was exactly what
      the observation described and nothing more: `dealDamage` applied `max(0, curHp - amount)` and
      then logged the **raw roll**, so every overkill reported more than it removed; `tickStatus` had
      the identical bug. **The damage event now carries the applied figure**, and the view's own clamp
      is gone — *"two authorities on one number is how they drift."*
      ⚠ **How a full green suite never saw it is the transferable part.** The reconstruction test —
      the one whose *name* promises the log's deltas reproduce the closing state — carried
      `if (e.t === "faint") hp.set(uid, 0)`. **The faint event reconciled the overshoot**, so every
      overkill self-corrected one event later and only the caption stayed wrong. **The test proving
      the log was sound was repairing the log as it read it.** The reconciliation was not weakened; a
      new case walks every fixture with none, so the deltas must close on their own. **The fixtures
      had been recording five wrong numbers since they were created.**
      **And the sibling landed this session**: `dealDamage` now returns the HP that actually left, and
      Scrounge heals by that rather than by the roll — a 32-point roll into a creature at 1 HP had been
      removing 1 and healing 32, which made overkill the most rewarding hit in the game.
    - **The SNARE turn is no longer consumed silently for a player who holds none, because a new game
      no longer holds none** — Maren's tutorial grants three base snares. ⚠ **What the observation
      actually pointed at is still live and is now item 56**: an *ungranted* tier is untracked, so it
      is offered, printed `—`, and legal.
    - 🟡 **The vertical slice past R1 is unreachable in practice**: the HUD offers only `[1] travel → r1`
      from Hearthollow, Brackwater sits behind the act gate, the gate needs Maribel's badge, and the
      badge needs a creature that survives one hit `[SAW/INFERRED]`.
    - 🟡 **The starter choice does not choose the starter.** The party entry stays
      `uid: "provisional-starter"`, `lineId: "cindril-line"` after the opening beat while `questFlags`
      carries `"story.starter": "cindril-line"` as a flag only. The console says so on every new game,
      verbatim: *"no opening beat yet — seeding the PROVISIONAL starter … Lane C7's opening beat
      replaces this by passing `startNewGame({ party })`."* The playtester chose Cindril and so saw no
      mismatch; **a player choosing Puddlisk or Thornlet would set the flag and still be handed a
      Cindril** — `[INFERRED]` from the save and the console, correctly marked as such.
    - 🟡 **TEAM prints max HP only** (`hp 58`), so no screen outside a battle reports how hurt anything
      is.
    - 🟡 **SURVEY's `seasons` column prints a number identical to `count` on every row** of both nodes
      looked at. `[SAW the numbers; INFERRED that it is wrong.]`
    - **There is no autosave.** SAVE in the ESC menu is the only writer, and CONTINUE after an unsaved
      run restores the state written at NEW GAME. **Defensible design** — recorded because combined with
      item 46 a wipe costs everything since the last manual save.

50. **WHAT WORKS, AND IT IS SUBSTANTIAL — record this with the same weight as the failures.** All
    `[SAW]`: boot and title (Phaser **3.90.0**, the pinned 3.x, not 4.x); save slots with per-slot
    state, the v1-save warning rendered legibly, and an overwrite confirm whose cursor **starts on NO**;
    settings that persist across a reload; grid movement, camera follow, the foray step counter, and
    the 52-tick year meter with the correct tick costs. **Interiors work fully** — door-tile entry,
    per-tile anchors, Aldis's line, `[R]` charging exactly `innTicks` = 2, exit to the right tile, and
    indoor steps correctly **not** counting as foray steps. Dialogue: typewriter, ▼ caret,
    complete-then-advance, multi-line entries, choice lists, chained cutscenes, flags persisted to the
    save. Battles render and play, with **correct per-kind greying** (Bag/Snare/Team/Flee all greyed in
    the rival fight, only Fight selectable) and a **visibly working type chart** — Pyre took a Plant
    Bramblehog 93 → 18.
    **AND THE SURVEY IS THE STRONGEST THING IN THE BUILD.** It prints **real derived populations that
    match the overworld's encounter weights exactly** — Hearthollow reading nibbin 8/24, pollywisp 4/12,
    bramblehog 6/18, skir 6/18, loamunder 24/72, carricrow 2/6 against `flora 60/100 · lines 6 ·
    individuals 50` — ←/→ pages all **12** nodes, and TAB draws a real **food web** with tier labels and
    edges (`links 9 · collapsed 0`). **The claim this page has always made about derivation is visible
    on screen.**

    ⚠ **BEAT 7 — "an inn heals damage" — IS NOT VERIFIED ON SCREEN, and the reason is worth keeping.**
    The playtester could never construct *alive, damaged, and the overworld responsive*: every fight
    either one-shot the starter or ended in a wipe and the softlock, **and TEAM shows only max HP**, so
    **no screen in the game would have reported it even if they had.** The inn rest is asserted by tests
    and by the replay arm; it has not been seen. That is a statement about the evidence, not about the
    code.

51. **CLOSED — the quest layer's year-turn defect, the deadline guard, the release refusal, and BOTH
    quest gates rewritten to OBSERVE A DRIVEN PLAYER.** Each was re-verified against the tree, not read
    off a commit message.
    - **Quest progress is no longer destroyed at the year turn.** Age is read off the tape's own
      `gained` field rather than off the live individual — `core/quests.ts:341`
      (`if (a.gained?.age !== age) continue;`) with `stillHeld` split out as its own clause at `:303-305`,
      so *"caught as"* and *"brought back"* stop being conflated. The tape carries it
      (`core/types.ts:667`, written at `core/save.ts:861`, produced on the real catch path at
      `game/wild-battle.ts:394-395`).
    - **The deadline guard was made real rather than deleted, and the reason is G10.** It is live at
      `game/quests.ts:555`, and its own justification block says why it is reachable in play: **an
      Ancient never ages** (`core/lifecycle.ts:607-613`, `ageOneYear` returns the creature unchanged
      with an `ancientSkipped` event), is **always taken at Elder** (`game/encounters.ts:239`), and
      **`data/nodes/r2.json:43-47` carries one** — `undermere-line`, `count 1`, `ancient: true`. What
      made the guard fire at all was moving the deadline off the wall clock onto each tape entry's own
      year (`core/quests.ts:391-392`).
    - **Release no longer offers a creature `applyRelease` would throw on.** The guard is `here()` at
      `game/quests.ts:770`, applied at `:774`/`:779`, resolving against the save's **own `nodeStates`**
      — the exact key set `applyRelease` sees — and returning `null` (filter nothing) when the question
      is unanswerable rather than refusing falsely. What it prevents is `applyRelease` (`core/ecosim.ts:819`) throwing an
      `EcosimError` for a line with no population at the node.
    - **The release refusal now says WHICH reason, and five tests can finally see it.**
      `releaseRefusal` (`game/quests.ts:791-798`) returns two distinct sentences, and the banner
      (`game/scenes/OverworldScene.ts:2002`) and the HUD (`:3520`) read the **same function**, so the
      advertisement cannot drift from the behaviour. **The production change had passed 125/125 while
      completely unverified**; five tests now pin a specific reason and three more observe the mechanism
      without pinning one.
    - **BOTH QUEST GATES WERE REWRITTEN TO OBSERVE, NOT TO CONFIRM A ROW EXISTS.** The expander is
      **deleted** — a repo-wide search returns no live code, only the tombstone at
      `tests/gates/reachability.test.ts:325-338` recording what it used to certify. Turn-in flags are
      now observed by **building a maximal player per node** — held counts capped by the node's own
      standing count, real `catchAction`s onto the tape, half of them put back through the real
      `releaseIntoNode`, the whole graph walked, retirement driven — and asking the **real**
      `syncQuestFlags` (`questTurnInWrites()` at `:402`, with a binder at `:917` asserting the
      observations are not vacuous). Two new gates: **GATE 2f** (`tests/gates/quest-layer.test.ts:1462`)
      checks the objective against a **measured** world and takes the table as an argument so a sabotage
      can hand it a damaged copy; **GATE 2g** (`:1660`) requires the objective's node to be one the
      **quest's own copy names**, with a single reviewed exemption whose adjacency is re-derived rather
      than waved through.
    - **F6, F7 and F8 are closed** — three tautologies replaced, **and that count belongs to F7 alone**;
      F6 was a season check that grepped a kind's *name*, F8 was the census. ⚠ **The labels F6/F7/F8
      exist only in a commit message**: a repo-wide search finds them in exactly one comment
      (`tests/gates/quest-layer.test.ts:990`) and nowhere in these docs, which is why the substance is
      written out here instead of the labels.
    - **The value-aware precondition census immediately surfaced a flag that had never been reviewed
      because its own `false` write counted as a writer: `story.blackout.woke`.** `narration.blackout`
      lowers it to `false`, so a key-based census counted that entry as its writer, while its real
      writer is a bare literal in `core/recovery.ts`. It is now driven through the real
      `applyBlackoutRecovery`, and the two reviewed exemption lists are both **empty**.

52. **MEASURED, AND KEEP IT: THE GREEDY YIELD EQUALS EACH NODE'S SHIPPED STANDING COUNT, EXACTLY.**
    `TAKEABLE_AT` (`tests/gates/quest-layer.test.ts:698-733`) asks how many individuals a player working
    one node could ever take over the whole run. **Because a population at zero does not breed**, the
    answer is the node's own shipped count and nothing more. Verified two ways — by summing
    `populations[<line>].count` in each `data/nodes/*.json`, and by executing the real engine
    (`core/ecosim`, `core/foodweb`, `core/rng`) over `yearsTotal` × 4 seasons:

    | r1 | r2 | r3 | r4 | sanctum |
    |---|---|---|---|---|
    | **67** | **71** | **70** | **44** | **3** |

    The identity holds at **all twelve** nodes, not only these five (hearthollow 50, brackwater 52,
    bowerdeep 52, cindershelf 31, duskhollow 26, r5 35, sanctum-approach 3). The mechanism is in the
    source: births are `count × breedRate × foodFactor × presenceMult` (`core/ecosim.ts:550`),
    identically zero at `count === 0`, and nothing re-seeds an emptied population.
    ⚠ **This is a measured FLOOR, not a ceiling** — the gate's own words — and it is the honest
    denominator for any question about what a node can supply.

### Opened by the 2026-08-27 layout pass — the twelve layouts, and what they made visible

53. **⚠ CINDERSHELF SPLITS INTO A DECIDED HALF AND AN OPEN HALF, AND THE TWO MUST NOT BE MERGED BACK
    TOGETHER.** *(**T-72**.)* **He approved a PICTURE. Nobody has ruled on the WORDING.**

    ✅ **DECIDED — the owner approved the vale-heather tile for cindershelf's `,` slot.** His words,
    entire, nothing elided:

    > **"I was talking to the sub-agent directly. I approved the Vale grass."**

    ⚠ **PROVENANCE, and it is narrower than it looks.** Source: Hank, to the art-lane session, in that
    session's transcript; it reaches this file **relayed between sessions** and is **not reproducible
    from this repository** — the same caveat the L7 ruling carries. **And record it at exactly this
    width and no wider: nobody holds the text of the approval he gave the sub-agent.** The art lane was
    not in that exchange. **So the quote is evidence that the act happened, not evidence of its
    reasoning** — it tells us he approved something he looked at, and nothing about what he took the
    approval to mean.

    ⛔ **STILL OPEN, AND THIS IS THE HALF THE ONE ABOVE WILL SWALLOW IF IT IS LET TO: does *"no grass
    anywhere over the whole picture"* mean no GREEN, or no VEGETATION?** **Heather and dead bracken are
    vegetation.** The swap keeps the no-green reading of that clause and gives up the no-vegetation
    one, and **there is no record of him ruling on the wording** — the layout header's own gloss says
    the clause is *"binding on the MATERIAL: nothing vegetal grows on the ash, and no tree stands on
    it"*, which the swap does not satisfy. **This is in the *waiting on the owner* register as the cost
    of the swap, explicitly not resolved by it.** ⚠ **The reusable form, and it is why this item is
    split rather than summarised: RULING ON A PICTURE IS NOT RULING ON A WORD.** If the wording binds,
    the `,` cells are what has to be revisited — which is the original question, unchanged.

    ⛔⛔ **AND BEFORE ANY OF THAT: THIS ENTRY WAS ONCE WRITTEN AS RULED ON A CLAIM THAT WAS NOT HIS, AND
    THE RETRACTION IS THE MOST USEFUL THING IN THE ITEM.** `tools/mapgen/compose/compose.py` carried an
    authored comment reading *"THE OWNER HAS RULED ON THE ',' CELLS… It is resolved"*, written by the
    same lane that wrote `tools/mapgen/layouts/cindershelf.txt:54`, which says verbatim *"⚠ THE TWO
    AUTHORED SOURCES CONFLICT AND THE OWNER HAS NOT YET RULED. Recorded, not resolved. Do not remove
    these cells, and do not paint them green, without his answer."* **Two files by one lane, flatly
    contradicting each other, and at that moment no evidence of a ruling anywhere.** The false comment
    was corrected in the landed `compose.py` (`:130-132` now quotes the header). ⚠ **Note what the real
    quote, when it arrived, turned out to authorise: something NARROWER than the invented comment
    claimed** — an approved tile, not a resolved conflict. **The invention was not merely unsourced; it
    was wider than the truth**, which is the usual direction and the reason the test is worth applying
    every time.

    ⚠ **THIS IS THE INFERRED-CONSTRAINT FAILURE WITH THE SIGN FLIPPED, AND THAT IS WHY IT IS WORTH THE
    SPACE.** The section above on constraints nobody can quote describes an agent hardening a
    *prohibition* nobody had issued. Here a lane manufactured a *permission* nobody had issued — and a
    manufactured permission is the more dangerous of the two, because a prohibition only stops work
    while a permission authorises it. **The test is identical either way and it costs nothing: find the
    sentence, quote it, name where it came from.** The L7 ruling in the tiled-maps section passes that
    test — verbatim words, named source, and its relay marked. **This one had neither a quote nor a
    source, and it travelled two sessions before anybody asked.**

    **So the conflict stands, unchanged, and it is the owner's.** ⚠ **Until this pass it existed only
    in a layout header** — recorded correctly, in a comment on the artefact it governs, and a comment
    is not a living document. Nobody reading `docs/` could have found it.
    - **The art side forbids grass, and says so twice.** `tools/comfy/manifest.json`
      `_nodes.cindershelf.feature` (`:580`) reads *"black volcanic ash, cracked basalt, steam vents
      and glowing orange fissures and **no grass anywhere over the whole picture**, ore-cart rails
      laid flat across the ash"*, and the sibling `featureSource` (`:581`) records **why** the clause
      was added: *"This clause turned two-volcanoes-on-a-lawn into basalt and ash."*
    - **The data side declares six populations.** `data/nodes/cindershelf.json:17-48`:
      `ashvole-line` 11, `cragmar-line` 7, `pyrelisk-line` 8, `stonewing-line` 2, `carricrow-line` 2,
      `kilnback-line` 1.
    - **The layout resolves it one way and marks the resolution as provisional.** It carries **180
      `,` cells** — counted independently off the grid, 8.05% of walkable — under the reading that
      the clause binds the **MATERIAL**: they are warm ash, vent margin and fissure edge, encounter
      terrain by legend *kind* only, **to be painted as ash and never as grass or heather.** The
      header says so at `:47-55` and ends *"⚠ THE TWO AUTHORED SOURCES CONFLICT AND THE OWNER HAS NOT
      YET RULED. Recorded, not resolved. Do not remove these cells, and do not paint them green,
      without his answer."*
    - **What the other ruling would cost, stated so the question is decidable:** if the clause binds
      the ENCOUNTER KIND rather than the material, cindershelf has **no wild encounters at all** and
      its six declared populations become decoration — a node that reports counts in the survey and
      can never produce one of them. **G2 forbids an agent picking**, and it is in the *waiting on
      the owner* register.

    ✅ **THE MATERIAL HALF HAS LANDED WHILE THIS ITEM WAS BEING WRITTEN, AND IT IS THE ASH, NOT THE
    HEATHER.** `579169f` *"cindershelf composes as ash — 487,429 green pixels on a volcano go to zero"*
    added a real `CINDER` table (`compose.py:154`), its own `CINDER_BLOCKS` and `CINDER_HUES`, wired it
    at `:821-823` — `MATERIALS = {"hearthollow": MEADOW, "brackwater": MARSH, "cindershelf": CINDER}` —
    and **committed the 17 cinder tiles** that were untracked two paragraphs ago. Verified here by
    composing the node: **1024², 21 distinct colours, and ZERO green-dominant pixels.** ⚠ **Three
    sentences in this item asserted "untracked" or "composes with tall-grass" and each was true when
    written; all are superseded.** ⛔ **And it is still not the answer to the open half** — cutting an
    ash family is what the layout header already mandated for the MATERIAL, an instruction never in
    doubt. **What is in doubt is whether the `,` cells should be encounter terrain at all, and no tile
    answers that.**

    ⏳ **THE VALE-HEATHER SWAP IS PENDING AND IS DELIBERATELY BEING HELD OUT OF THE TREE. Do not record
    it as done and do not land it early.** The shipping tree stamps `ash-scrub` for `,` and composes
    all twelve cleanly; the swap depends on `vale-heather-1..4`, which exist **only in the art lane's
    trial tree** (`git ls-files` for `vale-heather-*` returns **0**, checked). **Landing the dependency
    before the Vale family would trade a working tree for a broken one**, so it lands as one change
    when Forest (**50** tiles), Sanctum (**22**) and Vale (**8**) arrive together.
    ⚠ **AND IT CREATES A CROSS-BIOME DEPENDENCY THAT MUST BE WRITTEN DOWN NOW, BECAUSE IT IS EXACTLY
    WHAT A LATER TIDY-UP DELETES:** cindershelf, a Steppe node, will depend on a **Vale** tile. **Do
    not prune `vale-heather-*` as unused-by-Vale.** `ash-scrub-1..2` are kept and unstamped rather than
    deleted.

    ⚠ **TWO MEASURED TILE-QUALITY DEFECTS, ONE OPEN AND ONE WITH A PENDING FIX, AND THE FIRST NOW HAS
    FOUR NUMBERS IN CIRCULATION FOR ONE PROPERTY.**
    - **The walkable encounter terrain and the BLOCKING outcrop are hard to tell apart.**
      `ash-scrub` (`,`, walkable) and `basalt-rock` (`R`, blocks) are both brown plates cracked with
      thick black, so **a player cannot tell the patch he may walk into from the rock he may not** —
      which is a worse defect than the criterion-6 legibility item, because it misreports collision
      rather than terrain type.
      ⏳ **The swap above is the fix, measured and NOT YET APPLIED**: it is reported to take the `,`/`R`
      separation to **53.4** (heather 123.6, open ash 84.3, basalt 70.2) and `verify.py`'s seam check on
      `,` from **FAIL ×2.55 to PASS ×0.90**. **Recorded as pending with its measurement attached, not
      as closed** — it closes when the swap lands. **Read 53.4 against the round 41 floor (43.40 measured)
      and the 70.5–77.2 aim established below, NOT against "about 28"** — it clears the floor and approaches the aim, which
      is a considerably better result than the bar it was originally set against.

      ⛔ **AND THE BAR ITSELF WAS WRONG, BY ABOUT A FACTOR OF 2.5. THIS IS THE CORRECTION THAT MATTERS
      MOST IN THIS ITEM, BECAUSE THE OLD TARGET IS LOOSE OUTSIDE THIS FILE.** *"Gold separates its tall
      and short grass by about 28"* is **verified as a number and WRONG as a target for collision
      legibility.** Gold spends two different contrast budgets on two different jobs, and ~28 is the
      smaller one:

      ⛔ **AND THE FIRST VERSION OF THIS TABLE WAS ARITHMETIC ON A VALUE THAT DOES NOT EXIST. It read
      `tree mass 115.72`, and BOTH derived figures — an aim of `68.04` and a floor of `41.29` — were
      differences taken against it.** The corrected table, every row reproduced independently here:

      | Gold pair | job | separation |
      |---|---|---|
      | plain ground **183.7556** − tall grass **157.0033** | **both walkable** — the ENCOUNTER marker | **26.75** |
      | plain ground − tree pair (**113.2503** / **106.5190**) | walkable vs **BLOCKING** | **70.51 – 77.24** (73.87 against the pair's mean) |
      | tall grass **157.0033** − lightest whole tree tile **113.60** | **darkest walkable vs lightest blocking — the MEASURED MINIMUM** | **43.40** |

      **So ~28 answers *which ground has encounters in it*. *Which ground can I walk into* is a
      different question with a different budget, and Gold spends 70.5–77.2 on it — MORE than the 68
      it was credited with.**
      ⛔ **AND THE FLOOR MUST BE WRITTEN AS WHAT IT IS: 41 IS A CONSERVATIVE ROUND NUMBER, NOT AN
      OBSERVATION.** The measured minimum behind it is **43.40**, and 41 is safe precisely because it
      sits below that. **Do not present 41 as measured** — quote it as the round floor and 43.40 as the
      measurement, or the next reader will go looking for the tile pair that produced 41 and not find
      one. The art lane set the original target too low itself, has accepted this, and asked for it to
      be recorded.

      ✅ **VERIFIED HERE INDEPENDENTLY, AND THE METHOD IS WORTH KEEPING BECAUSE IT IS NOT A SCREENSHOT
      READING.** Exact-byte clustering over all eight `assets/reference/gen2/` captures: **8,640 tiles
      → 246 clusters**, every capture an exact multiple of 16 in both axes (**zero remainder — all 1×
      native**), Rec.601 as defined above. Reproduced to four decimals: plain ground **183.7556 at
      n=811**, tall grass **157.0033 at n=328**, the tree pair **113.2503** and **106.5190** at
      **n=706 each** — one 16×32 tree counted twice, which is why the counts are identical.

      ⛔ **`115.72` IS A PHANTOM. IT IS NOT IN THE CORPUS AT ALL, AND IT IS THE ONE FIGURE HERE THAT WAS
      NEVER MEASURED.** ⚠ **This entry previously called it "grouping-dependent" and put the band at
      110–116. That was right as far as it went and it did not go far enough** — the consequence is
      that *both* the aim and the floor were differences against a number with no cluster behind it.
      **The nearest cluster is 115.27 at n=4**, with nothing else above n=10 anywhere near it; the
      tree tiles that actually carry the corpus are the n=706 pair. **A figure that fails to reproduce
      is not merely unsupported — everything derived from it has to be re-derived, and the derived
      figures are usually the ones that have already travelled.**
      ✅ **The direction of the error is the reassuring half and it is worth stating: every correction
      here moved the blocking budget UP** — the aim from 68.04 to 70.51–77.24, and the measured minimum
      to 43.40 above the round 41. **The claim "~28 is the encounter budget and the blocking budget is
      far above it" was never in doubt; only the numbers attached to it were.**

      ⚠ **TWO CORPUS FINDINGS THAT BEAR DIRECTLY ON THE PER-BIOME GUARD WHEN IT SHIPS, recorded here
      because they would otherwise be discovered the hard way.**
      1. ⛔ **157 IS NOT A SIGNATURE FOR "ENCOUNTER TERRAIN".** Gold's brown dirt **path** clusters at
         **157.75 (n=330)** and **157.87 (n=298)** — **628 occurrences across those two, nearly twice
         tall grass's 328, and LIGHTER than tall grass by under one luminance unit.** ⚠ **Two further
         clusters sit in the same band (157.83 n=44, 157.79 n=25), taking the near-157.8 population to
         697** — which strengthens the point rather than softening it. **So a guard that keys terrain
         off a luminance band near 157 will also select walkable PATH.** Mean luminance alone cannot
         separate encounter terrain from a road in the corpus we are imitating.
      2. ⚠ **A cluster at 126.41 (n=135) is a tree crown clipped by the top edge of the rip.** It is
         **blocking**, and tall grass sits only **30.59** above it. **Judged a rip artifact** — a
         partial tile, not a design decision — **but recorded so a later reader who finds it does not
         conclude the floor is 30.**
      ✅ **THE COMPETING FIGURES ARE NOW RECONCILED AND THE SET IS CLOSED. Every one of them was
      right about a different corpus, and the reconciliation is below — reproduced independently here,
      to the digit, rather than accepted.** **The number of record, and it is quoted with its
      definition every time or not at all:**

      > **3.4 — `ash-scrub` 66.80 against `basalt-rock` 70.19. Rec.601 luminance
      > (`0.299R + 0.587G + 0.114B`, 8-bit sRGB, no gamma linearisation), averaged over every pixel of
      > the full 16×16 block at each of the 180 `,` cells (46,080 px) and 942 `R` cells (241,152 px) of
      > the composed 1024² PNG. ⚠ THE WALKABLE MATERIAL IS THE DARKER OF THE TWO — record the sign; it
      > was being dropped.**

      **Re-measured here off the layout grid and the composed PNG: `,` 66.80 over 180 cells / 46,080 px,
      `R` 70.19 over 942 cells / 241,152 px, gap 3.39, walkable darker.** Exact.

      **The crosswalk, so the figures reconcile instead of competing** — one pair, three corpora:

      | figure | corpus | measured here |
      |---|---|---|
      | **6.6** | the TILE FILES (`ash-scrub` vs `basalt-rock`, all px) | **6.56** — 65.14 against 71.70 |
      | **3.4** | the COMPOSED tiles, per cell, as defined above | **3.39** — 66.80 against 70.19 |
      | **53.4** | the same composed definition, heather substituted | pending; the tile is not in the tree |

      ⛔ **AND ONE OF THE FOUR IS STRUCK OUTRIGHT: "0.2" IS NOT A FIGURE FOR THIS PAIR AT ALL.** It does
      not reproduce for `ash-scrub` vs `basalt-rock` under any formula or corpus. **It reproduces
      exactly as `basalt-rock` 71.70 against `basalt-WALL` 71.46 = 0.24 on the tile files** — confirmed
      here — **which is two BLOCKING materials compared with each other and then reported as a
      walkable-versus-blocking gap.** ⚠ **Kept as an example rather than deleted quietly, because it is
      the wrong-corpus family in its smallest and most deniable form**: a real measurement, correctly
      taken, attached to the wrong question, and indistinguishable from a right answer once the labels
      are gone. **The struck 7.09 published here earlier is the same pair as the 6.6 under Rec.709
      instead of Rec.601** — a fourth operator, not a fourth finding; it is withdrawn in favour of the
      Rec.601 reading so that one definition governs the whole set.
    - **A SEAM CHECK FAILS ON THREE NODES, AND IT IS PRE-EXISTING RATHER THAN INTRODUCED.** `verify.py`
      reports `FAIL SEAMS` at **×2.55** on cindershelf, and **hearthollow (×1.22)** and **brackwater
      (×1.27)** already fail it at HEAD. **Say it that way round** — a reader seeing only cindershelf's
      number would file it as a cinder-family defect, and two thirds of it is the tile set generally.
      **Cindershelf's is twice as bad and is not a low-denominator artefact**: the `ash-scrub` field
      measures joins **22.20 vertical / 26.13 horizontal** against `ash-open`'s 3.55 / 5.37 and path's
      0.10 / 3.70. ⏳ **The pending heather swap is reported to take cindershelf's `,` seam to PASS
      ×0.90 — pending, not applied.** ⛔ **Hearthollow's and brackwater's failures are NOT touched by
      it and stay open**, which is the half a "seams fixed" report would quietly drop.

54. ✅ **CLOSED — THE GATE NOW ASSERTS THE DIRECTION IT WAS MISSING, AND ITS HEADER'S FOSSILS ARE
    GONE.** *(**T-69**, DONE.)* ⚠ **This item is corrected rather than deleted, because both halves of
    it were true when written and the repair is the interesting part.** Landed in `abcc95e` *"the
    layout gate asserts the direction it was missing, and stops calling itself a biconditional"*.
    Re-measured this pass: **20 tests, 20 passing** (it was 19).
    - **DIRECTION 3 exists** — *encounter cells ⇒ populations non-empty*, at
      `tests/gates/layout-encounter-contract.test.ts:659`, and its own docblock names it *"THE ONE THE
      OTHER TWO DO NOT COVER"*: a node that **paints** encounter terrain while declaring no species is
      grass a player can walk into forever, rolling against an empty table. **It is green on all
      twelve today** — the thinnest is `sanctum-approach` at one declared line — and the docblock says
      so, which is the right way to ship an assertion that cannot currently fail: *"that is exactly the
      condition under which an unasserted direction goes unnoticed."*
    - **The gate stopped calling itself a biconditional where it is not one.** `:622` now says in as
      many words that DIRECTION 2 *"is the CONTRAPOSITIVE of DIRECTION 1, not a second direction"*, and
      records that an earlier version of the comment claimed otherwise.
    - **The header's two fossil figures are deleted, not re-derived.** `498 / 435 / 63` appear nowhere
      in the file; `:38` now carries the argument alone — a whole-file count reads the header prose —
      which is what T-69 asked for and the better of the two options it offered.

    **What the item said before, kept because the shape recurs:** the gate asserted one proposition
    twice — `lines.length > 0 && encounterCells === 0` against `encounterCells === 0 && lines.length > 0`,
    identical conjunctions with the operands swapped, two failure messages for one claim — and its
    commit message called that "both ways". **Most of the gate was well built even then**, and the
    good parts still are: its scope comes from `data/nodes/` and never from the layout directory, so a
    renamed directory reds it instead of failing open; the grid is the longest run of 64-character
    lines with a tie treated as ambiguous; the alphabet is asserted equal to `legend.ts`'s own
    `DEFAULT_LEGEND`; `,` is asserted to **be** the legend's `scrub` row with `blocks: false` rather
    than assumed to be; and it keys on declared population **keys**, not `count > 0`, because a line at
    count 0 with a positive `breedRate` regrows.

    **And the figures the fossils got wrong, kept once here so the repair is checkable rather than
    trusted.** The header used to illustrate itself with *"498 while its grid held 435"* and *"63
    against a grid holding ZERO"*. Measured against every committed revision of
    `tools/mapgen/layouts/cindershelf.txt`: at the seeded revision the grid held **0** and the whole
    file **34**; at HEAD the grid holds **180** and the whole file **255**. **No layout in the tree has
    a grid of 435** — the largest is `r1` at 597. **The gate's ARGUMENT was always correct and the real
    pair confirms it independently** (255 against 180): a whole-file count is a broken instrument. Only
    the numbers it illustrated itself with were wrong — **a figure measured once inside a test reads as
    an assertion**, which is this file's fossilised-anchor shape, and the fix was to delete the figures
    and keep the argument.

### Opened by the 2026-08-27 economy pass — money moves, and the meter still has a hole

55. **✅ THE ECONOMY IS REAL ON THE LIVE PATH, AND THE ORDER IT LANDED IN IS THE PART WORTH KEEPING.**
    Every number below is the owner's, quoted where `data/balance.json` records him, and the
    derivations live beside the keys rather than in this file.
    - **An earner exists.** A won **rival** fight pays `trainerPayoutFlat` **100** +
      `trainerPayoutPerLevel` **3** × the summed levels the loser fielded, so the six rival purses run
      **136 / 208 / 262 / 388 / 460 / 640**. Hank's ruling, recorded verbatim in
      `data/balance.json` `economy._trainerPayout`: *"Make it so that earnings don't scale quite as
      much. I think it's a hallmark of Pokemon games that you eventually have way too much money at
      some point, but that point shouldn't be until probably Act 5."* A purely per-level purse could
      not do that — the rosters' summed levels run 12/36/54/96/120/180 and **any** flat rate
      reproduces that same 15× spread; the flat fee compresses it to 4.7×.
    - **Sinks exist.** Every purchasable price is **3**. Hank ruled twice and the key records both:
      first *"the other prices can all be the same, just for simplicity… a player should be able to
      buy 40 of those items total in a year"*, then, shown that a mean-anchored 25 bought five items
      in act 1 against eighty-six in act 6, *"Make it so that the expected earnings in year one
      specifically can buy 40."* **The anchor is year one.** 3 rather than 3.6 because money is an
      integer on the tape and both `readPayout` and `applyPayout` refuse a fraction outright.
      ⚠ **The consequence was accepted knowingly and must not be re-discovered as a defect**: income
      is not uniform, act 1 affords 48 items and act 6 affords 720, so **money is tight only in year
      one and effectively unlimited from act 3 on.** No flat price avoids it.
    - **`innCost` is deliberately not one of them.** Hank: *"innCost is already paid through ticks."*
      It stays 40 and stays unread; a rest costs `clock.innTicks` and no coin.
    - **Both content gates moved out of code and into data**, and the reason is recorded where it
      bites: zod **strips** keys the schema does not declare, so adding a key to `data/balance.json`
      alone reaches no reader — the move needed `data/balance.json`, `core/types.ts` and
      `core/schemas.ts` together. `weightedUnlockGym` is `"odo"`, `masterSnareGrant` is 3, and Hank's
      ruling is quoted on the key: *"Weighted Snares unlocked in the shop after the second gym is
      completed… the player be given three master snares at the completion of the fifth gym."*
    - ⚠ **THE FIFTH-GYM MASTER GRANT IS WIRED AND FIRES — a briefing this pass inherited said it did
      not, and that was wrong.** `grantMasterSnares` runs from `winGym`, gated on the fifth leader,
      and a **played ladder** test walks the gyms and ends holding exactly `masterSnareGrant` on the
      tape, with siblings proving no earlier leader grants and that a doubled finish grants once.
      **What is genuinely still a literal in code is the GYM ID** — `MASTER_GRANT_GYM = "noct"` — only
      the count moved to data.
    - ⚠ **What is still dead:** `innCost` and all three `baitPrice` rows have **zero readers** in
      `core/`, `game/` or `tools/`. **There is no bait row in the shop and there cannot be one as
      built** — `baitPrice` is keyed by `BaitMatch`, not by a bag key, so it does not name anything
      the bag can hold, and Kett's shipped lines describe a crate the player cannot buy from and state
      a price ratio the data does not have. **T-67.**

56. **⛔ THE SNARE METER HAS A HOLE THAT MOVES RATHER THAN CLOSING, AND IT IS THE SHARPEST STATEMENT
    OF THE `bagHas` AFFORDANCE THIS FILE HAS MANAGED.** *(**T-66**.)* `bagHas` (`core/battle.ts:1226`) returns
    **true for a key absent from the bag** — *"a key absent from `bag` is untracked (the harness
    carries no bag)"* — and `bagConsume` (`:1231`) returns early on an absent key, so it never
    decrements. A fresh save is `items: {}`. **A grant is what switches the meter on**, and
    `core/types.ts`'s own docblock on the `grant` action says so and explains why the applier is
    additive and never a replacement.
    - **Three tiers, three different states, and no UI distinguishes them.** `snareEntries`
      (`game/battle-input.ts:205-209`) offers **every** tier unconditionally; `disabled` comes only
      from `illegalActionReason`, whose sole stock check is `if (!bagHas(...))`. An untracked tier
      prints `—` and is **legal**.
    - **So the fix moves the hole; it does not close it.** A player granted three `base`, who never
      visits the shop and never beats the fifth leader, is metered on `base` and holds **infinite
      `weighted` and infinite `master`**. Beat Noct and `master` becomes finite too — and `weighted`
      is *still* infinite unless the shop was used. **Spending out the tier you were given and
      switching to a better one you were never given is the shipped behaviour.**
    - **Two passing tests assert exactly this and name it**, which is the right way for it to be
      recorded: *"…but CATCHING IS NOT METERED — the tiers the grant does not stock stay unlimited
      for ever"*, and *"⚠ for the UNGRANTED tiers NOTHING CHANGES — a spent-out player just throws a
      better snare."*
    - ⚠ **And two of those test docblocks overstate their own scope.** Both claim *"nothing in
      `data/`, `game/` or `core/` writes another snare tier into `save.items`"*. That is true of the
      **dialogue corpus** and false of the **repo**: the shop writes `weighted` and `winGym` writes
      `master`. They stay green because each drives a dialogue-only run that never shops and never
      reaches the fifth gym. **A scope claim in a docblock is an assertion nothing executes.**

57. **THREE DOCBLOCKS AND A HANDFUL OF CITATIONS WENT FALSE IN THE SAME COMMIT THAT MADE THEM FALSE**
    *(**T-70**.)*
    — the recurring shape, arriving again, and recorded rather than fixed here because they sit in
    files this pass does not own.
    - `game/scenes/OverworldScene.ts` still carries **⚠ BLOCKER — THE KEY IS NOT IN
      `data/balance.json` YET… Until it is, the grant does not fire** and **⚠ IT DOES NOT FIRE YET,
      AND IT SAYS SO.** It is, and it does. `masterGrantCount` also still reads the key through
      `balance.economy as unknown as Record<string, unknown>` *"because the key is not on the
      `Balance` type yet"* — it is, and the cast is now the only thing hiding that.
    - `game/wild-battle.ts` still says *"That is why Maren's 'three of them, in the satchel by the
      door' has never corresponded to anything."* It corresponds now.
    - **`bagHas` and the snare guard are cited at `core/battle.ts:1208` and `:1537` from three
      files**; they are at **`:1226`** and **`:1554`**. This file published those two numbers as well
      and they are corrected above. **A file:line in a comment is a measurement with a shelf life**,
      which is this queue's own standing rule arriving in the code lane.

58. ✅ **CLOSED WITHIN THE PASS THAT FOUND IT — THE SHOP HAD TWO INDEPENDENT REFUSALS AND EACH WAS
    MASKING THE OTHER'S ABSENCE.** ⚠ **Recorded even though it closed, because the shape is the most
    instructive one on this page: two correct layers of defence, neither asserted, and the suite
    reading green off the fact that they cover for each other.** ⛔ **And say the diagnosis in the
    right order — SHIPPED BEHAVIOUR WAS CORRECT ON EVERY REACHABLE PATH. This was a test-coverage gap
    on defence-in-depth, never a live defect.**
    - **The two layers.** `game/shop.ts:229-230` throws `ShopError` for an id the shelf is not
      offering and for an already-greyed row; `game/scenes/OverworldScene.ts:1396-1399` returns early
      on `row.disabled` and banners the reason. **The scene's guard is the layer a player meets**; the
      model's throw is the belt behind it. The shelf is modal — `update()` returns before every other
      key while `this.shop !== null` — and `buySelected` hands `buy` a row `shopRows` just derived from
      the same save, so **neither throw is reachable through the UI.** Both files already said so in
      comments, and both comments were right.
    - **The gap, measured before it was closed.** Rewriting both refusals as a silent `return save`
      left **111 tests GREEN** across `shop`, `overworld-shop`, `economy-wiring` and
      `economy-primitives`; there were **zero `toThrow` in either shop test file**. Every refusal probe
      ran through a helper guarded by `if (!attempt.threw)`, and a silent no-op returns an identical
      object, so `serialize(attempt.save) === serialize(save)` passed either way. **Nothing in the
      suite could tell a throw from a no-op.**
    - **THE PART WORTH KEEPING IS WHY A SUBSTRING ASSERTION WOULD NOT HAVE FIXED IT.** `ShopError`'s
      message embeds the row's own `reason`, so with the scene guard deleted the banner *still*
      contains the id and the reason and the save is *still* untouched — the throw precedes every
      write. The two layers are distinguishable only by the exact string they put on screen:
      `base — costs 3, purse holds 0` from the scene against
      `base — "base" cannot be bought — costs 3, purse holds 0` from the model. **So the test asserts
      whole-string equality, and a `contains` check would have passed the sabotage and certified a
      layer that was gone.** The banner is also named by POSITION rather than found by searching the
      HUD, because `refreshHud` prints every greyed row's reason into the shelf anyway — **a search
      would have passed even if the key press was never answered.**
    - **Both layers are now pinned, by sabotage, in `320a687` and `0a3eb7d`.** Deleting the scene
      guard reds both refusal tests at the equality and leaves the positive control and the
      stale-shelf race green, which is correct — neither depends on that layer.
    - **One correction the closing work made to itself, worth carrying:** a purchase appends **two**
      tape actions, not one — `payout(-price)` and `grant({id: 1})` — because core's contract is that
      an entry is a price **or** an absolute consequence and never both.

### Opened 2026-08-28 by the eight-domain content survey — agents DROVE the scenes instead of reading them

⚠ **READ THE INSTRUMENT BEFORE THE RESULTS, BECAUSE IT IS WHAT MAKES THEM DIFFERENT FROM EVERY EARLIER
PASS ON THIS PAGE.** Eight domains were audited by agents that started from a fresh save, drove the
real scenes through the real seams, and reported what came back — not by agents reading files and
inferring. **That is the correction this file has been asking for since item 45**, where a confident
absence read out of source cost a session's planning, and it is why two of the findings below are
withdrawals rather than defects: **driving something is also how you find out your alarm was wrong.**

⚠ **Everything below is a reading at `240a16d`–`4f1e7aa`, taken while five other lanes were committing
into the same tree.** One item closed underneath the survey while the survey was writing it up; that is
recorded in place rather than tidied away.

59. **THE ANCIENTS ARE THE MOST COMPLETELY BUILT AREA AUDITED, AND — the part nobody had evidence for
    before — THEY ARE REACHABLE END TO END.** Not "the code exists"; the animals were found, fought,
    caught, and the numbers moved.
    - **G10 holds UNDER MEASUREMENT, not by inspection.** Six real year turns over a party and a box
      each holding all three Ancients produced **six `ancientSkipped` events per turn** and left every
      Ancient at age **E** with the never-ageing sentinel intact, while **mortal controls in both
      cohorts aged and retired twice.** ⚠ **The controls are what make this evidence**: a lifecycle
      that aged nothing would have produced the same six skips and the same unchanged Ancients. And a
      **replay of the tape rebuilds the same never-ageing animal**, so the property survives the
      serialisation boundary rather than living only in memory.
    - **Both minor Ancients are reachable through the authored chain, not through a test fixture.** The
      Kilnback chain was driven to `complete` at act 4 and the Undermere chain to `complete` at act 3 —
      the latter **satisfying the Ferryman's Wager by actually snaring an Elder at `r2` in the right
      year** rather than by writing the flag. Each was then rolled, fought and caught through the real
      encounter → battle → catch path, **moving the node's real number 1 → 0.**
    - **The Vellsire beat is live on the real scene.** The approach cutscene fires unprompted at the
      ring; both branches write their flags; the snare opens a scripted `kind:"ancient"` fight; **a
      real reducer catch (19 of 60 seeds) moves the Sanctum's count and plays `maren.epilogue.caught`**,
      and standing aside plays `maren.epilogue.released`. Both epilogue ids exist in `data/dialogue.json`
      (`:4154`, `:4193`) and `game/finale.ts` reads both. **This is the never-cut Vellsire choice,
      played rather than asserted.**

60. ⚠ **THE UNDERMERE'S PRESENCE EFFECT IS INVERTED AGAINST THE BIBLE'S EVIDENT INTENT — AND IT IS THE
    OWNER'S, NOT A BUG TO FIX (G2).** Catching the serpent that "steadies the marsh water table" makes
    the marsh **richer**.
    - **The mechanism, verified in data rather than inferred.** `data/balance.json`
      `ecosim.presenceEffects.waterTable` is `{mode: "typeBreedFloor", type: "Water", magnitudeKey:
      "waterTableBreedFloor"}` and the magnitude is **0.15** — a floor on the breed rate of
      **Water-typed** lines. `core/ecosim.ts:540-542` applies it over `webTypes(line, balance)`, which
      is the line's **adult-age-class** types (`ecosim.webRoleAgeClass` is `"A"`).
    - **At `r2`, the Water-typed lines are the PREDATORS.** mirefin-line (Water/Poison,
      Mesopredator, breedRate **0.045**) and fenmaw-line (Water, Apex, **0.030**) — both floored from
      well under 0.15 up to it. **reedrick-line, the grazer the marsh actually runs on, is Plant/Wind**
      and is floored by nothing. So removing the Ancient removes a subsidy that was flowing to the
      things that eat the marsh, and the marsh rebounds.
    - **Measured over 120 seeds: catching the serpent leaves the region RICHER by 73.9 individuals**,
      with r2 reedrick going **9.9 → 43.9**.
    - ⚠ **ONE CORRECTION TO THE FINDING, WHICH DOES NOT OVERTURN IT.** The survey said the two
      predators are *the only* Water lines at `r2`. **They are not — `undermere-line` is itself
      Water/Dark and stands at `r2`**, and `derivePresence` (`core/ecosim.ts:275-313`) does **not**
      exclude the source line, so while the serpent is free it floors **its own** breeding too (its
      `carryCap: 1` is what actually holds it, not its breed rate). Radius is 1
      (`presenceRadiusNodes`), so the floor also reaches `brackwater` and `bowerdeep`. **Three Water
      lines, not two. The grazer is still not one of them, which is the whole finding.**
    - ⛔ **THE CODE IS NOT WRONG AGAINST THE SPEC, WHICH IS EXACTLY WHY THIS IS THE OWNER'S.**
      `docs/build-doc.md:235` (§7.3) says, verbatim: *"Undermere: Water breedRate floor"* — and that is
      what shipped, magnitude and all. **`data/balance.json`'s `_presenceEffects` already recorded, in
      advance, that the bible did not say which type an effect acts on or whether it multiplies or
      floors, and that both had to be decided in code.** This is that recorded ambiguity arriving with
      a sign attached. **An agent may not re-point the effect at Plant, may not invert it, and may not
      declare the bible to have meant something else (G2).**
    - **For contrast, and to show the finding is about this effect rather than about presence effects
      in general:** the Kilnback's `ventWarmth` is **correct-signed** — Δ **−31.7** when it is caught —
      and the Vellsire's keystone is correct-signed but tiny (item 61). ⚠ **AND A SECOND SPEC
      MISMATCH FOUND IN THE SAME SENTENCE, recorded open rather than resolved:** §7.3's sibling clause
      reads *"Kilnback: Fire spawns active"*, and what ships is a **×1.25 Fire breed multiplier**, not
      a spawn activation. The `_presenceEffects` note covers it under the same admitted gap. **Two
      clauses of one sentence, one implemented as written and one not.**

61. ⚠ **THE NEVER-CUT EPILOGUE SURVEY HAS ALMOST NOTHING TO REPORT, AND THAT IS A DESIGN QUESTION
    ABOUT A NEVER-CUT FEATURE.** The beat WORKS — item 59 played it — and its measurable consequence
    is **1.6 individuals of one scavenger line, region-wide, averaged over 120 seeds.**
    - **Why, arithmetically, and it is not a tuning problem.** `presenceRadiusNodes` is **1**, so the
      Vellsire's keystone reaches exactly two nodes: `sanctum`, whose populations are
      `carricrow-line 2` (carryCap 6) and `vellsire-line 1` (**breedRate 0, carryCap 1** — the Ancient
      cannot breed at all), and `sanctum-approach`, whose only population is `carricrow-line 3`
      (carryCap 9). **The entire reach of the region's keystone is five scavengers under a combined
      cap of fifteen.** A ×1.5 breed multiplier on that produces about what was measured.
    - ⛔ **NOTHING HERE IS AN AGENT'S TO CHANGE.** Widening the radius, raising the multiplier, or
      giving the Sanctum more populations are three different ways of inventing content (G2), and G6
      forbids arranging the outcome. **The question — should the ending's survey have something to
      say, and if so does the keystone need reach or does the Sanctum need animals — is in the
      *waiting on the owner* register.**

62. ✅ **A LIVE REACHABILITY DEFECT IN THE SHIPPED DEX — FOUND BY DRIVING IT, AND CLOSED BY ANOTHER
    LANE WHILE THIS WAS BEING WRITTEN.** *(**T-79**.)* Recorded in full anyway, because the reason the
    suite could not see it outlives the defect.
    - **The defect, true at `240a16d`.** `game/scenes/MenuScene.ts:583-588` built a `DexSceneData`
      **without `unlockedSignChains`**, though `game/scenes/DexScene.ts:63` declares the field and
      `DexScene:231-233` honours it. Absent, the chain reaches `core/foodweb.ts:750` as `undefined`,
      `!(unlocked?.has(id) ?? false)` is `true`, and the line is emitted `{weight: 0, active: false}`.
      **`balance.encounter.signChainGatedHabitatTag` is `"hidden"`, carried by exactly the three
      Ancients** — so **the shipped dex printed *"not in the wild encounter pool"* for all three,
      forever, including for a player standing on the animal with the chain closed.** `MenuScene` was
      the only construction site, so there was no second path that worked.
    - ✅ **Fixed in `4f1e7aa`.** `MenuScene.ts:642` now passes
      `unlockedSignChains: unlockedSignChainsOf(registry.save(), content)`, backed by
      `game/ui/SignChains.ts:58-80`, which derives the gated lines from the habitat tag and the
      `chain.<stem>.complete` flags **rather than from a hardcoded species list**.
      `tests/unit/ui-frame-panel.test.ts` §7 asserts the real hand-off carries the field, 32/32 green.
    - ⛔ **THE PART TO KEEP: `tests/gates/dex-path-contract.test.ts` PASSED THROUGHOUT, AND WAS RIGHT
      TO.** All thirteen of its cases assert **asset-key and manifest grammar** — set identity, no
      spellable `back` key, injectivity of dex identity → sprite. It never imports `MenuScene`, and at
      `:396` it calls `buildDexEntries(content.species, "spring", balance)` **with no `opts` at all**,
      so `unlockedSignChains` is `undefined` inside the gate itself. Its case named *"THE ANCIENTS —
      the dex asks for the one form their line actually ships"* checks `creatureArtId` against
      manifest rows. **A gate on key grammar is structurally incapable of seeing a data hand-off, and
      its green was never evidence about one.** This is the §8.5 shape on a scene prop instead of a
      dialogue flag: **the field is declared, honoured, and never supplied.**

63. **ECOLOGY IS THE MOST FINISHED DOMAIN IN THE PROJECT, AND IT IS REACHABLE RATHER THAN MERELY
    BUILT.** Each of these was produced by driving the shipped path, and each moved a number a player
    can read:
    - A real catch moved sporantle **32 → 31**, and the survey row said **31**.
    - **The shipped overcatch script drove r4's apex to 0**, with the survey rendering the starvation
      season as `0.030 → 0.000` the step before.
    - A boxed skir aged **J → A → E** and **retired from the box**, while two caught Ancients never
      aged — G10 and the box rule in one run.
    - **reedrick appeared 273 times in summer and ZERO times in the other three seasons**, through the
      live roll on a real grass cell. That is `seasonalWindow` reaching the player rather than the
      harness.
    - **Catching the Undermere flipped r2's survey from `presence: Undermere` to `presence: none`.**
    - **The player reads populations in three places**, and **19 population-gated NPC entries** narrate
      the web in plain working-people register — a count independently reproduced against
      `data/dialogue.json`. G7 holds: none of them tells the player they did wrong.
    - **G3, G6, G7 and G10 hold under sabotage-bound gates**, and **the encounter mask agrees with the
      collision mask cell-for-cell on all twelve nodes against the shipped PNG bytes.**

64. ⚠ **A CONTROL BOTH CANONICAL DOCS RECORD AS NEVER RUN AND IMPOSSIBLE IN THE HARNESS HAS NOW BEEN
    RUN TWICE, BY TWO DIFFERENT SEAMS — AND THE DOCS STILL SAY IT HAS NOT.** *(**T-8**, **T-76**.)*
    - **The survey's route:** `core/lifecycle.ts` `enterPendingActs` already accepts a `yearEvents`
      override — ⚠ **a field on `ActEntryDeps` (`:966`), not a positional parameter**, and an empty
      array is truthy in JS, so `yearEvents: []` genuinely suppresses rather than falling through to
      the default. **With the raid off, r4's apex reaches 0 in 0 of 64 seeds at arrival years 1, 4 and
      7, and never even touches ≤1.**
    - ✅ **AND T-8 HAD ALREADY RUN IT, BY THE OTHER SEAM, ON 2026-08-27** — `CATCH_PROFILES` ×
      `RAID_POLICIES` as a 3×2 matrix in `tools/harness/full-run.ts`, deep-copying balance rather than
      editing it, **32 seeds, nothing reaches zero anywhere.** ⚠ **The survey did not know that
      ticket existed, which is what makes the agreement worth something**: two seams, two scales, one
      answer, and a defect in the suppression itself would have to exist twice in two unrelated places
      to survive both. **"The raid is the whole cause" is confirmed.**
    - ⛔ **`docs/build-doc.md:502` and `docs/content-bible.md:176-178` BOTH STILL CARRY IT AS
      UNMEASURED, AND NEITHER FILE IS THIS PASS'S TO EDIT.** The exact sentences and the constrained
      replacement wording are in **T-8**; the work is **T-76**. ⚠ **§10.5 is not a heading** — it is
      numbered item 5 inside `## 10. Test Plan` at `:490`, on one unbroken line at `:502`, and the
      cite T-8 carried (`:405`) had drifted.

65. ⚠ **content-bible §6's FLAT CLAIM IS A MAJORITY OUTCOME EARLY AND A MINORITY OUTCOME LATE — AND
    THERE ARE NOW THREE PUBLISHED FIGURE SETS FOR ONE BEAT, MEASURING THREE DIFFERENT PROPERTIES.**
    ⛔ **This is a number for the owner. G6 forbids tuning it upward and G2 forbids an agent rewriting
    the bible's reading of its own arrival.**
    - **The bible's sentence** (`docs/content-bible.md:172-178`): *"Route 4's Apex reaching zero is the
      intended reading of that arrival, not an imbalance."* Stated flat, for every arrival.
    - **What the survey measured** — apex REACHES ZERO, raid ON, no player, **64 seeds**:
      **42/64 at a year-1 arrival, 33/64 at year 4, 18/64 at year 7**; the weaker ≤1 falling from
      **62/64 to 35/64**. ⚠ **These three figures could not be re-derived by this pass and are carried
      as the survey's own reading**, on the same standard this file applies to every other unreproduced
      number.
    - **What `data/balance.json` publishes** (`_standingStock`, beside `harvestFractionOfStanding`):
      **39 of 64 at year 1, 1 of 64 at year 4, and "the Apex never goes at all" by year 7** — and these
      are explicitly the **PRE-fix** figures, the ones that motivated the fraction. ✅ **So the
      survey's claim that balance publishes only pre-fix numbers is CORRECT**, and the fix moved year 4
      from 1/64 to 33/64 and year 7 from never to 18/64. **`harvestFractionOfStanding` fixed the
      HARVEST; it did not remove the arrival-year dependence of the COLLAPSE.**
    - ⛔ **AND A THIRD SET THAT WILL BE MIS-CITED IF THIS IS NOT WRITTEN DOWN.**
      `tests/unit/r4-arrival.test.ts:344-345` says the property held *"in 33/64, 14/64 and 5/64 seeds
      at the three later arrivals; it now holds in all of them."* **That test asserts a DIFFERENT AND
      WEAKER property** — `isStarvingOrGone`, not "reaches zero" — **over four arrivals keyed in
      SEASONS (`preSeasons` 0 / 12 / 24 / 40), and its seed constant is `SEEDS = 32`, not 64.** So its
      "holds in all of them" does **not** contradict the survey's 42/33/18, and **must not be read as
      "the apex reaches zero at every arrival."** ⚠ **A docblock publishing `/64` denominators in a
      file whose constant is 32 is an unsourced figure by this file's own standard** — recorded open;
      the denominator needs re-deriving or the comment needs correcting (**T-77**).

66. **EIGHT OF TWELVE NODE FILES STILL SAY `walkable: false`, AND SEVEN CANONICAL PASSAGES — NOT THREE
    — STILL DESCRIBE A VIGNETTE FALLBACK THAT DOES NOT EXIST.** *(**T-36**.)* All twelve now ship a
    composed map **and** a collision mask (24 files, all present on disk), all twelve pass the
    spawn-and-connectivity gate, and **travel never consults the flag**: `travelTo` refuses on being
    indoors, on adjacency, and on the act gate, and the only game-side read of `node.walkable` anywhere
    is `firstWalkableNodeId()` choosing a **default start node**. **`"vignette"` appears nowhere in
    `core/`, `game/` or `tools/`.**
    ⛔ **THIS MATTERS BEYOND THE FLAG, AND THE CORRECTION HAS BEEN MADE ON THIS PAGE RATHER THAN
    NOTED.** This file's own cascade analysis cited *"r4 is `walkable: false`"* in three places as a
    reason demo beat 1 sits off the playable slice. **It is not a reason.** The clause is struck from
    all three; **the real barriers are the act-4 gate and the encounter budget**, which are two
    different facts with two different remedies, and neither of them is a content edit to a boolean.
    ⚠ **T-36's own enumeration was three of seven** — the four it missed are build-doc §1's effort
    line, **locked decision L7's status column**, §15's build step C9, and content-bible's audio rule
    that cuts eight location themes *because* those nodes ship as vignettes. **Ruling "drop the claim"
    therefore reopens the audio pack and amends a locked decision**; the ticket now says so.

67. **`fixtures/overcatch-script.json`'s SEED-12 RATIONALE IS FALSE — AND ITS NUMBERS ARE FINE, WHICH
    IS THE WHOLE OF THE FINDING.** *(**T-78**.)* The file is named in `docs/build-doc.md:508` (§11) as
    *"the demo cascade as an action log — used by tests AND by the demo-recording flow"*, and its `_why`
    justifies the seed as *"chosen because the release is legible on video (1 → 3 rather than 1 → 1)"*.
    - ✅ **The recorded trace is EXACT and CURRENT** — re-derived byte-for-byte this pass through
      `applyCatch` + `step` on the `core/save.ts` `replay` path: opening `{ashvole 14, carricrow 3,
      cragmar 10, pyrelisk 14, stonewing 3}`, trace `8/2 · 1/1 · 1/0 · 2/0 · 2/0 · 3/0 · 3/0 · 3/0`.
      **Nothing about the fixture's arithmetic is stale.**
    - ⛔ **The REASON is false on the path a video would record.** `tests/integration/demo-beats.test.ts:372-381`
      already says so in a comment and pins it in an assertion: the replay path drives one RNG for the
      whole log, the game draws from **per-subsystem streams** (§8.1), and at seed 12 *"the prey sits
      at its floor for all six remaining seasons"* — **`1 → 1`, the exact outcome the fixture says it
      was chosen to avoid.** `expect(fixtureSeed[last]).toBe(FLOOR)` is green, 6/6. **Seed 24 is the
      legible one.** The fixture and the test have disagreed in writing for some time, in the same
      repository, and nothing goes red because they are testing different things.

68. ⚠ **TWO ALARMING FINDINGS WERE WITHDRAWN ON CHECKING, AND THE REASONS ARE WORTH MORE THAN THE
    FINDINGS WOULD HAVE BEEN.** Recorded here in full; the register at the foot carries the short form.
    - ⛔ **WITHDRAWN: "eleven of twelve shipped maps are painted PNGs the composer does not produce,
      and the walkable/blocking sign has FLIPPED on three nodes."** Re-running the shipped composer
      fresh on four nodes gave **byte-identical output, props included**, and the sign is **positive on
      all twelve.** ⚠ **The verifier measured inside a SEVEN-MINUTE WINDOW — 03:45 to 03:52 — during
      which the maps were swapped and reverted underneath it.** **THREE separate findings that night
      were poisoned by that one window.**
      ✅ **THE DURABLE FIX IS A PROVENANCE FINGERPRINT, and it is already evidenced rather than
      proposed: one lane carried an md5 over the concatenated artefacts it measured, and ITS findings
      survived re-checking. The lanes that did not carry one produced findings that did not.** That is
      the entire difference between the three withdrawn and the one that stood. It is now a standing
      rule in `docs/TICKETS.md`. ⚠ **A timestamp is not a substitute** — several lanes commit into this
      tree concurrently, so "I measured the files on disk" is not a statement about *which* files.
    - ⛔ **WITHDRAWN BY THE LANE THAT MEASURED IT: "10 of 12 maps are below the composer's 41
      walkable/blocking luminance floor."** The four worst **read instantly at viewport scale**, by
      eye. **The floor is the wrong instrument for these maps, and the reason is specific rather than
      hand-waving.** Gold's 41-to-68 figure came from **grass against tree mass — both green** — where
      luminance was the ONLY separator available. **These biomes separate by HUE**: tan decking against
      blue water, tan ash path against dark purple-brown ash field. **A luminance mean cannot see a hue
      separation**, so it reports a failure that is not there. ⚠ **This does not un-strike `41`**: it
      remains the floor for a pair that separates on VALUE (the `28.2` entry in the register at the
      foot is unchanged). It says the instrument must be chosen against the pair being judged.

69. ⛔ **AND THE SAME PASS COMMITTED WRONG-INSTRUMENT #2 FROM OUR OWN LIST — BY THE LANE THAT WROTE
    THE RULE AGAINST IT. THIS IS THE MOST USEFUL ITEM ON THE PAGE.**
    - **What happened.** The pass used a **hardcoded walkable set**, mistyping **five of the nine** real
      characters and inventing one that does not exist.
    - **The real sets, derived from `DEFAULT_LEGEND` (`tools/mapgen/legend.ts:66-192`) and confirmed
      independently this pass:** walkable `.,:o~*@^D` — nine, including the four ANCHOR characters that
      `assertLegendWellFormed` keeps out of the blocking half — and blocking `#BTWRF` — six.
    - **T-65 carries the rule, in as many words: *"Derive walkability from `legend.ts`, never from a
      list."*** It was written after a hand-typed set inflated r1, r2 and r5 by omitting `~`. **The
      lane that wrote it sprang it.**
    - ⚠ **THE LESSON, AND IT GENERALISES FURTHER THAN THIS REPO: KNOWING THE FAILURE MODE DOES NOT
      IMMUNISE YOU AGAINST IT.** Having read the rule, having written the rule, and having the source
      open in front of you are three different states, and **only the third one derives.** Every other
      entry in this file's register is an argument for checking a claim; **this one is an argument for
      re-deriving a fact you are certain of**, which is a strictly more expensive habit and is the only
      one that would have caught it.

70. **TWO PROP DEFECTS SURVIVED CHECKING, AND A DESIGN TENSION CAME WITH THEM — collision is correct
    and unchanged, so none of this is a bug.** ⚠ **These are the art lane's measurements and were NOT
    re-derived by this pass; they are recorded as that lane's readings.**
    - **`cindershelf-shrine-mine` at ΔL 30.2 — reads by eye**, because the separation it has is a HUE
      separation and ΔL cannot see it (item 68). **Not a defect on the corrected instrument.**
    - **`sanctum-approach-antler-inner` at ΔL 38.3 — genuinely fails**, and the reason is structural
      rather than numerical: **its east face abuts the rock mass keyline-against-keyline**, so there is
      no separator of any kind at that edge, hue or value.
    - ⛔ **23 WALKABLE CELLS ARE NOW MORE THAN HALF COVERED BY PROP ART, WORST `r3-antler-canopy` AT
      95.3% — so a player walks through what looks like stone.** **Collision is correct and was not
      changed**: the cells are walkable in the mask because the layout says they are, and the props
      overlay the painting rather than entering it (build-doc §7.6: props *"are not baked into
      collision"*). ⚠ **So the picture and the rule disagree in the direction that is safe for the
      engine and confusing for the player** — the opposite of item 43's mask hazard, and it arrived
      with the props landing in `7a27540`. **This is a design tension for the owner: either the prop
      art shrinks, or the cells under it become blocking, and the second is a content edit to twelve
      layouts.** It is in the *waiting on the owner* register.

## What is next

The work queue is `docs/TICKETS.md`, and it is ordered. This is the shape of it.

⚠ **THE THREE ITEMS THAT STOOD AT THE HEAD OF THIS LIST — the snare grant, the wipe softlock and
the cascade budget — HAVE ALL BEEN DISCHARGED, TWO BY LANDING AND ONE BY TURNING OUT TO BE AN
INSTRUMENT ERROR.** They are not silently dropped: the grant is item 55, the softlock is item 46, and
the gate is the resolved section at the top of this file. **The list below is renumbered against what
is actually left**, and what is left is smaller and more of it is the owner's.

0. **CUT THE FOUR MISSING BIOME TILE FAMILIES, AND SHIP EACH NODE'S PAINTING WITH ITS MASK, ONE
   COMMIT PER NODE.** ⚠ **This item read *"GET A RULING ON WHETHER THE MAPS MAY BE COMPOSED FROM
   TILES"* and that ruling has been given** — the quote and its provenance are in the tiled-maps
   section above. It is first for the same reason it was before: everything in the art lane and half
   of the collision work hangs on it. What it is, now that it is work rather than a question:
   **Forest (~50 tiles), Vale (~8) and Sanctum (~22) have no tile family at all; Marsh is an alias of
   Meadow rather than a table; the dispatch keys on layout filename instead of on `biome`, so `r4`
   cannot reach the Steppe table that already exists; and nine of the twelve nodes therefore paint as
   meadows.** ✅ **Cindershelf's ash family HAS landed** (`579169f`) and is the shape the rest should
   follow. ⛔ **It did not answer cindershelf's two open questions and must not be reported as though
   it had** (item 53). Until the remaining families are cut, the composed PNGs are the region's
   shape and not its content, **and none of them may be dropped into `assets/final/maps/` in a
   batch**: a node's painting lands with the collision mask derived from the same layout, one commit
   at a time, or it reintroduces the exact defect item 43 describes.
1. **Close the snare meter — the tiers nobody grants are still infinite** (item 56). This is the
   residue of T-60 rather than a new idea, and it is a small, decidable change: an untracked key
   reads as unlimited, so the fix is deciding *where* a tier's meter is switched on, not inventing a
   policy. **It is what stands between "the player has snares" and "snares are a resource."**
2. **Finish T-12's clause 4 — and what is left of it is now a short list, not the whole clause.**
   The earner, the sink, the shop and the two content gates all landed (item 55). What remains:
   **`innCost` has no reader** and the owner's *"already paid through ticks"* is why; **no
   `baitPrice` row can be bought**, because `baitPrice` is keyed by `BaitMatch` rather than by a bag
   key, so the crate Kett describes is unpurchasable; and **quests pay nothing**, which is half of
   what bible §11 says currency comes from.
3. **Land the collision masks node by node, behind the paintings** (**T-56**). ⚠ **This item read
   *"get a ruling on which artefact is authored first"* (**T-57**) and that question has dissolved
   rather than been answered** — both artefacts stamp from one text file, so neither is authored
   first. What is left is not a decision but a **gate recalibration** across **three** test files, and
   it is not optional: `tests/unit/manifest.test.ts`, `tests/unit/collision.test.ts` and
   `tests/unit/overlay-diff.test.ts` each go red on the first promoted mask by design, and
   overlay-diff's residual limits were calibrated against a luminance-derived stand-in and must be
   **re-measured**, not bumped. ⛔ **The rule that governs the order is per node**: promoting a mask
   against one of the nine generated maps still blocks the painted road and opens the painted house
   (item 43).
4. ~~**Make grass gating spatial** (**T-65**)~~ — ✅ **DONE, and it reached the live path rather than
   only the model.** `core/foodweb.ts` `encounterMaskFromLayout` builds the mask, `game/encounters.ts:279`
   `encounterMaskFor` resolves it per node, and **`game/scenes/OverworldScene.ts:2605` calls it**, so a
   town square is no longer as productive as the reeds for a real player. 177 tests pass across
   `tests/unit/encounter-mask.test.ts` and the two layout gates. ⛔ **The constraint that decided the
   implementation held**: the mask costs no extra `rng` draw — *"a step off the grass still costs
   exactly one draw"* and *"a whole seeded walk replays identically"* are named cases, so no
   determinism fixture was renumbered. **And G3 is bound in the same file**: the mask gates WHETHER a
   step meets something and never WHICH animal it meets.
5. **Fix the replay union's three remaining gaps** (**T-53**, **T-54**, **T-55**). T-53 is a decision,
   not a patch — an existing assertion pins the current behaviour deliberately.
   ~~**Repair the player-sprite assets** (T-24)~~ — **DONE**; the gate reads 16 of 16. **T-20's side
   view is a separate, still-open geometry defect and the green gate is not evidence about it.**
6. **Re-author the maps top-down** (T-17, amended) — ⚠ **and HOW is now settled: by composition, per
   item 0.** Three of the nine rejects retire at the root and `r5`'s defect inverts, so the reject
   list is smaller than it looks. **Colour discipline comes along for free rather than being a
   separate pass** — the compositions read 16–30 distinct colours at zero off-palette, against the
   shipped generated maps' 17–32 and Gold's 12–18. ⚠ **But do not carry item 32's colour reading over
   as the ARGUMENT for the change**: the shipped maps pass the palette gate, the gate caps nothing,
   and the case for composition is geometric. The colour figures are a consequence, not a reason.
7. **Run the B1 reproduction gate** (build-doc §15, Lane B) — one asset per pixel class reproduced
   from `manifest.json` byte-identically. Nothing multi-version starts before it passes.
8. **Give the harness a lifecycle mode** so the Legacy beat is measured rather than asserted.
9. **Batch the vertical-slice art** (B3/B4). G13 still binds — no batch of 20 or more without an
   explicit `--confirm` — but it binds as a *review* gate now, not a budget one: the whole manifest
   is about 8% of the balance.
10. **Audio** (C8): retirement cue first, then the pack, then the DSP season presets.

## Waiting on the owner

✅ **ONE ENTRY LEFT THIS REGISTER BY BEING ANSWERED, AND IT IS RECORDED AS A DEPARTURE RATHER THAN
DELETED**, because "it is no longer here" is indistinguishable from "somebody removed it".
- **WHETHER THE MAPS MAY BE COMPOSED FROM TILES — RULED. He raised it himself and answered it
  himself.** *"Get it done. Use as many agents as you need to. This was the common sense answer from
  the start, and while planning out this project, you cautioned me against it. Make up for that by
  doing an exceptionally good job here as quickly as you can."* The full account, **including the
  first-hand override *"I override the build doc!"* that followed it, and the source of each**, is the
  tiled-maps section at the top of this file. ⚠ **The argument this entry
  used to make was the wrong one and is struck there too:** it argued colour, and the nine shipped
  generated maps read 17–32 distinct colours at **zero off-palette pixels** — they pass the palette
  gate and always did. What ended the generated round was **composition**, and `af82c46`'s own commit
  message says so on a controlled axis.

⛔ **AND ONE ENTRY WAS REMOVED FROM THIS REGISTER DURING THIS PASS AND HAS BEEN PUT BACK.** The
cindershelf question below was written up as ruled, on a relayed report that turned out to be somebody
reading a comment which itself asserted a ruling that never happened. **It is open. It is his.** The
chain is item 53, and the rule it produced is directly below.

⚠ **THE TEST THIS REGISTER APPLIES TO ANY REPORTED RULING: it enters as ANSWERED only with (a) the
owner's words verbatim and (b) a named source for them.** ⛔ **The test is about WORDS AND A SOURCE,
not about trusting the messenger** — a relay from another lane is trusted (see the standing rule in
the tiled-maps section). The tile ruling has both, from two sources. The cindershelf report had
**neither**: it was an agent's own inference, written into `compose.py` as though it were a ruling,
and it moved a question out of this register for the length of an afternoon. **A consequence of one of
his sentences is not one of his sentences** — least of all when a sibling file by the same author says
the opposite.

- ⛔ **WHICH BRANCH OF A CONDITIONAL AGING ARC A SAVE TAKES — NEW, AND IT IS THE GATE ON STRETCH GOAL
  S6.** He demoted year-variant maps to a stretch goal first-hand this session (*"We are going to get
  rid of that as a current goal and make it a stretch goal for the future. The year changes, that
  is."* — the full account is the year-variants section above). **The question that outlives the
  demotion is not "when do we build it", it is a guardrail question that must be answered before
  anybody generates a single image.** Four of the six authored arcs branch on play —
  `docs/content-bible.md:155-158`, verbatim: *"fields flourish **or** wither with Route 1 health"*,
  *"docks rot **or** get rebuilt"*, *"canopy thins **if** Barkhide over-caught"*, *"vents flare, mine
  expands **or** closes"* — while `yearVariants` (`core/types.ts:162`, `core/schemas.ts:218`) is a flat
  key 2–6 with **no branch**, and each of the 28 manifest rows carries **both outcomes in one subject
  string**. Nothing reads a branch anywhere. **One image per year is therefore a wither ladder that
  runs whatever the player did — a scripted cascade, which G6 forbids.** So the branch is plausibly the
  feature. ⛔ **An agent may not pick it, may not declare the arcs decorative, and may not decide one
  image per year is close enough** — those are three ways of inventing a value (G2). **Nothing is
  blocked on this today**, because S6 is not current work; it is registered so that a revival starts
  from a ruling instead of from a ladder.

- **The cascade budget — the question has CHANGED SHAPE, because the gate that framed it was
  measuring wrong.** ⚠ **The knob table is no longer a decision waiting to be made.** `preyShare`
  ignored `seasonalWindow`, the correction made the gate stricter rather than looser, and it did not
  buy the pass: **r4 and cindershelf never moved and always passed**, at 85% and 97% of seeds. The
  gate is green and the four contested sites are now asserted **infeasible**, so a balance change
  that makes one reachable turns it red and asks the question again. **What is genuinely still his**
  is the sibling entry below — whether `r4` is where the beat should live. ⛔ **The clause "which is
  `walkable: false`" has been struck from that sentence and from its sibling: the flag gates nothing,
  `travelTo` never reads it, and `r4` is walked like every other node.** What actually stands between a
  player and the beat at `r4` is the **act-4 gate** and the **encounter budget** — both real, neither
  the flag. **No knob is owed an answer today**, and nothing should be tuned to produce one.

- **DO GYM WINS PAY?** Unruled, and until now recorded only in a comment. `docs/content-bible.md:285`
  reads, verbatim: *"- Currency from quests + trainer battles; sinks: snares, bait mats, inn,
  forge."* **`gym` is a distinct `BattleKind`** — the four launchers stamp `wild`, `trainer`, `gym`
  and `ancient` — and a won gym pays **zero**, bound by a passing test that walks all three non-payers
  with a non-vacuity control. `game/wild-battle.ts` states the question rather than answering it, and
  is right to: *"the bible's audio manifest groups them ('Trainer/gym battle'), its economy line does
  not, and inventing the wider reading would mint currency no document asks for."*
  ⚠ **The other half of that sentence pays nothing either: "Currency from quests."** No quest path
  awards a coin. **So the only earner in the shipped game is a won rival fight** — six of them across
  the run — and a fresh save holds `money: 0`, which means nothing at all can be bought until Wick is
  beaten at r1. **Both halves are his to rule; neither is an agent's to invent (G2).**

- ⛔ **IS *OFFLINE* SLICING OF A FINISHED PAINTING INTO TILES STILL BARRED?** **Recorded open rather
  than resolved by inference (G2), and it is the boundary of the tile ruling rather than a new
  subject.** He was asked about **composing from a tile set** and answered that; **nothing in the
  landed pipeline slices a painting** — its tiles are authored as tiles — so the question has not
  arisen in practice. **Do not read the permission wider than the question it answered.** G1's amended
  text records it open in the same terms.

- ⛔ **CINDERSHELF, AND IT IS NOW TWO QUESTIONS RATHER THAN ONE. He approved a PICTURE; nobody has
  ruled on the WORDING.** Item 53 has both halves and the false-ruling chain that preceded them.
  1. **DOES *"no grass anywhere over the whole picture"* MEAN NO GREEN, OR NO VEGETATION?** He approved
     the vale-heather tile for the `,` slot — *"I was talking to the sub-agent directly. I approved the
     Vale grass."* (relayed from the art lane's session — a trusted source, per the standing rule
     above; **but nobody holds the text of the approval he gave the sub-agent**, so it is evidence the
     act happened and not of its reasoning, which is a limit on the CONTENT rather than on the relay). **Heather and
     dead bracken are vegetation.** The swap keeps the no-GREEN reading and gives up the
     no-VEGETATION one, which the layout header's own gloss asserts — *"nothing vegetal grows on the
     ash"*. ⛔ **This is the cost of the swap and is explicitly not resolved by it. Ruling on a picture
     is not ruling on a word.**
  2. **AND THE ORIGINAL QUESTION IS UNTOUCHED BY EITHER: does the clause bind the MATERIAL or the
     ENCOUNTER TERRAIN?** `tools/comfy/manifest.json` forbids grass twice,
     `data/nodes/cindershelf.json` declares six populations, and the layout carries 180 encounter
     cells under the material reading. **If it binds the terrain instead, cindershelf has no wild
     encounters and six declared populations become decoration.** ⚠ **The ash family has now landed
     and that is NOT the answer** — the material half was never in doubt.

  Note the node also PASSES the cascade feasibility gate today, so both answers touch more than one
  lane.

- **WHETHER THE STARTER'S FIRST FIGHT IS ACCEPTABLE — now confirmed on screen, not only in a model**
  (**T-38**, whose full table is below). The 2026-08-27 playtest `[SAW]`, on the **first random
  encounter of a new game, in the starting town, on turn one, at full health**: Cindril **Lv 5, 58/58**
  against a wild **Lv 5 Loamunder, 111/111**. Cindril's Singe removed **24** (five more turns needed);
  the Loamunder's Sunder removed **≥58 in one hit** — `Party down`. The rival's **Lv 6 Nibbin** did the
  same. **Cindril's best move, Pyre, reads 58 — exactly its own HP total.** ⚠ **This is a balance
  question for the owner and NOT a defect for an agent to patch** (G2, G14, T-11's ruling). What the
  playtest adds beyond the numbers is the consequence, which is not a balance claim: **combined with
  the wipe softlock (item 46), a new player's run ends inside a minute**, and the slice past R1 is
  unreachable in practice.

- **When the painting and the collision layout disagree, which one is authored first?** (**T-57**.)
  The engine reads geometry from `tools/mapgen/layouts/*.txt`; the art lane is drawing composition from
  hand-made top-down control drawings. **Nothing reconciles them**, and the paintings on disk were
  not produced from the layouts — the ControlNet lane is untracked and the committed manifest contains
  no reference to it. **No answer is proposed here**, and no agent may pick one: it decides whether the
  mask is correct on generation or must be traced back off a picture after every art round. **The
  consequence while it is open is item 43**: the twelve masks exist but promoting them makes the game
  worse than the all-open placeholder, because a mask that is exact against the wrong picture blocks
  the road the player can see.
  ✅ **THE TILING RULING HAS DISSOLVED THIS ONE — PER NODE, AS EACH PAINTING LANDS, RATHER THAN AT A
  STROKE.** ⚠ **This paragraph read *"contingent on a ruling nobody has made"* and that is now false.**
  Under tiling the painting and the mask are both stamped from the same 64×64 text file, so they
  cannot disagree — correspondence by construction rather than by a choice of which artefact wins,
  which is better than either side this ticket offered, and T-57's own *done when* names this exact
  route. **But nine nodes on disk are still generated images no layout produced**, and for those nine
  the disagreement is exactly as live as before. So the mask rule is unchanged and is the operative
  one: **a node may ship its mask on the same commit that ships its tiled painting, and not before.**
  What is now owed is not a ruling — it is twelve paintings, one commit each.
- **Whether Greaves and Maribel get tuned** now that the ruler is honest. T-13's ruling was
  explicitly "do not lower Greaves's levels as part of this ticket — if it still feels wrong
  afterward, that is a separate, deliberate call." This is that call.
- **T-14's prior question**, which is not a guardrail question yet: should the seed be randomised at
  all, and over what set? Restricting the set to seeds where the cascade reads well would be
  selecting for an outcome (G6, and the owner's own T-2 ruling). Randomising freely is consistent
  with both.
- The move display name **Daunt** (id `snarl`) is an exact Pokémon Shuffle skill name, found after
  it was adopted. Recorded, unchanged.
- Unruled IP near-matches: **Focus** (Cassette Beasts move), **Miasma** and **Shade** (Digimon
  attacks), **Burrow** (Temtem / Coromon / Monster Sanctuary). *Soak* and *Douse* are ruled kept.
  Under T-23 these are recorded and not to be re-raised.
- Whether `r4` gets a content edit to put the cascade beat on the walkable slice. Under G2 an agent
  may not decide it. Note this is now entangled with the budget question above: `r4` is the fixture's
  node, and the feasibility gate measures `brackwater` and `r2`. ⛔ **The words "and is `walkable:
  false`" are struck from this entry.** They were doing argumentative work they could not support —
  the flag has no reader on the travel path, so it never kept anybody off `r4`. **The question that
  survives is a pacing and content one**: the beat's node opens at act 4, and whether that is where the
  never-cut cascade should live is his. **The question that does NOT survive is "is r4 reachable" — it
  is, and has been.**
- **Whether `node.walkable` gets a real reader, or the claim gets dropped** (**T-36**). The flag gates
  nothing: `travelTo` refuses only on adjacency and the act ladder, so the player walks all twelve
  nodes. `docs/build-doc.md:202`, cut line **C-1** (`:456`) and `docs/content-bible.md:162` all
  describe a vignette-card fallback that **does not exist in `game/`**. Either build it or delete the
  language — an agent may not pick, because C-1 is a cut line and the content half is G2's.
- **Whether the enemy AI should value moving first** (**T-37**). T-27 made the tie-break exact, and
  the exact key is blind to move `priority` — which is the whole of Odo's +9.8 pp. Leaving it means
  the roster is the lever (pool order is authored order); ranking priority in re-opens every gym band
  measured under T-13. It moves published win rates either way.
- **Whether the starter's opening matchup is acceptable** (**T-38**). **T-38's own claim was wrong,
  and the truth is worse than the claim, not milder** — read this as a correction, not a rephrasing.
  The ticket said *"four of R1's six lines beat the level-5 starter one-on-one at level 1."* Measured,
  that is false for every starter: at level 1 it is **Cindril 1 of 6, Puddlisk 2 of 6, Thornlet 0 of
  6.** But level 1 is not what Route 1 produces. At the levels it actually rolls (4–8, ages weighted
  by the real encounter table), the granted **juvenile** starter reads:

  | starter | wins | **one-shot** | lines that beat it |
  |---|---|---|---|
  | Cindril | 21.3% | **78.7%** | 3 of 6 |
  | Puddlisk | 14.1% | **84.8%** | 6 of 6 |
  | Thornlet | 25.0% | **74.8%** | 5 of 6 |

  **The starter loses roughly four fifths of its first encounters in one hit.** How the ticket got it
  wrong is instructive: it computed ~78 damage using **attack 61, which is the level-1 *Adult*'s**
  figure, against a starter granted as a **Juvenile** — it mixed ages. Correcting the age makes the
  conclusion *stronger*, not weaker: a level-1 juvenile Loamunder's true band is **67–82**, so the
  **minimum** roll already exceeds the Fire starter's 58 HP and the one-shot is certain rather than
  likely. The effect is starter-specific as flagged — the same move is *resisted* by Thornlet and
  Puddlisk, which is why their one-shot rates come from other lines.

  Two things that make this decidable rather than alarming. **This was predicted in writing**:
  `data/balance.json`'s `age._multiplier` note recorded this instrument reading a 66.2% loss rate
  after T-10 and said the T-11 Producer re-spend would move it. It has — to about 80%. This is a known
  consequence arriving on schedule, not a surprise. And **T-28/T-29 HAVE NOW LANDED, which is what
  changes the weight of it.** When this was first written a first encounter that wiped the starter
  cost nothing, because nothing in `game/` called `applyBattleResult`. It does now, from all four
  finish handlers, and a wipe costs 5 ticks and a walk back.

  **The slice was re-measured with both wirings in, and the two readings below are the same finding
  T-38 already carries, seen from the other side of the change — not two new items.** Measured over
  **24 encounters at `hearthollow`** with persistence and recovery both live:

  | reading | figure |
  |---|---|
  | catches | **10** in the MODEL — ⚠ **zero on screen**, see the note under the table |
  | wipes | **4**, at 5 ticks each |
  | ticks spent on wakes | **20 of the run's 40** |
  | where year 1 ends | `hearthollow` |

  1. ⚠ **THE MARK ON THIS ROW IS NARROWED, NOT LIFTED.** It used to read *"a player the shipped game
     cannot produce"*, and that is no longer true: a real player now holds three base snares from the
     opening beat, so the model and the screen are no longer on opposite sides of a wall. **What
     reproduces and still makes the model optimistic**: the harness hands its reference player a snare
     **tier** as a parameter with **no inventory check at all** (`tools/harness/full-run.ts`), and
     builds a gym bag outright (`tools/harness/player.ts`, *"one salve per party member, nothing
     else"*). It cannot tell a snare the player could buy from one they could not, and it pays for
     neither. **So the ten catches are still a property of the model** — but of a model that is now
     optimistic by a purse rather than by an impossibility. What stands entirely unchanged: the wipes,
     the ticks, and **half the run's ticks going on waking up.**
  2. **The opening is always lost.** The **first three encounters are all losses**: the granted
     juvenile starter loses to Elders and Adults alike, and the run only becomes viable once the
     fourth encounter's catch enlarges the party. That is the T-38 table arriving in a real run —
     ~80% losses and ~79% one-shots, now with the loss persisting.

  **Nothing was tuned to produce any of these numbers and nothing should be** — levels, rosters, stats
  and balance values are Hank's, G2 and T-11's ruling both forbid an agent retuning them, and G14
  forbids moving a target to accommodate a result. This is material for the decision, not a
  recommendation attached to one.

- **How many buildings should have an interior** — a scope question, and only Hank can answer it.
  **The gap is now written up as T-48**, which names the three towns with no interior at all
  (Bowerdeep, Cindershelf, Duskhollow) and records that the Sanctum having none is what bible §6 asks
  for, not a gap. **Two adjacent tickets came out of the same look and are NOT his to answer** —
  **T-47**, every interior door coordinate is a guess the painted map will settle, and **T-50**, the
  door facing↔wall check living only in the test layer.
  What he said, verbatim: *"This game is nowhere near deep enough to need twenty homes in a town. A
  town should be a handful of buildings, and nearly all of the buildings should have an accessible
  interior."* What exists: **four blueprints** — inn and supply shop in Hearthollow and Brackwater.
  What the art manifest itemises, read out of `tools/comfy/manifest.json`'s `_nodes` block directly:
  **Hearthollow, five buildings** — Warden Maren's field station, a gym hall, the inn, the supply shop
  and a deep-thatched cottage; **Brackwater, five** — a fishery shed, an angler's hut, a gym hall, the
  inn and the supply barn, plus a ferry landing that is not a building. So *"nearly all"* read
  literally is ten rooms across the two walkable towns and thirty-odd across the region.

  **Four is not a failure to have tried; it is a different reading of scope**, and "the inn and the
  shop are the ones that matter, the cottage does not need an inside" is an entirely reasonable answer
  that nothing he said rules out. Three facts he may want while deciding. **The engine is not the
  constraint** — a new interior is a `data/interiors/*.json` file and its citations, not code; the
  model, the loader, the tests and now the scene layer are all generic. **The gym hall is a different
  question from the rest**: gyms are challenged today by a keypress from the town node — `challengeGym`
  — with no building, no door and no position, yet six shipped leader lines already describe a room
  with a door and a bench (Noct's *"Room's dark. It stays dark. Bring a lamp for the walk down"*,
  Odo's *"Badge is in the tin by the door"*, Sable's *"Six on the bench."*), so making one enterable
  changes how gyms are challenged and not just how many rooms exist. And **under G2 every added
  interior must derive from canon** the way the existing four do — every physical feature traced in
  `_featureSource` to a shipped line, every gap named in `_canonSilent` rather than filled. For a
  building the corpus barely mentions there may be nothing to derive from, and where the canon is
  silent that is part of what he is deciding, not a licence to invent an inside.

- **What shape a map edge exit takes in the data** (**T-49**). The maps paint two edge exits each —
  bottom back toward Hearthollow, top on toward the Sanctum, with Hearthollow and the Sanctum painting
  one apiece — and **nothing can walk through any of them.** Travel is still the number-key menu keyed
  on `adjacency`, and `travelTo`'s own docblock says why: the node schema carries no exit or portal
  positions, so *"a door prop kind would change this, and that is a content decision, not one to
  invent here (G2)."* The question is whether `props[]` gains an exit kind carrying a destination and
  an edge, or the exit derives from `adjacency` plus which edge the art painted. The code half is
  decidable once that is; an agent may not pick the first.

- **Two questions the epilogue's season fix handed over rather than answered.** The finale's survey
  used to stamp `seasonOf(save)` onto counts projected six years forward, so four saves differing only
  in `save.tick` produced one byte-identical projection under four different season labels — and the
  label is not a caption: the page computes the breed column and the dormant/migrating note **from
  it**, so the same animal at the same number carried the opposite biological claim depending on when
  the player happened to stop. It is now **derived from the published horizon** — the season the region
  stands in when the projection stops — which is what every other survey in the game names. The two
  open questions are content: **should the projection begin at the player's own season instead of
  always the first**, and **should an ending print a calendar at all?** Note the season was
  deliberately NOT dropped the way the year was: the year was a caption and removing it removed a
  falsehood, while the season is load-bearing, so removing it would delete information instead.

- **When the palette expands to 48, relative to the top-down map re-author** — a sequencing question
  the art session raised and neither of us should settle. The 48-colour fit was made over **18 raw
  sources that are the isometric maps T-17 is now replacing**. Landing it before the top-down recipe
  settles may mean fitting it twice, and the second pass is the expensive one: everything already
  quantized against the new 48 has to be regenerated again. Recorded as open, not as a decision.

- **Whether the pipeline adopts a LoRA — REOPENED, and its EVIDENCE IS NOW WITHDRAWN.** ⚠ Read this
  entry carefully; it is easy to misread in both directions. The comparison that reopened it measured
  **raw LoRA output against Gold**, which answers *"does the LoRA alone produce Gold's ground"* —
  where the question that decides adoption is **"does the LoRA plus our postprocess produce it"**.
  That combination was run, and running it is what reopened the question. **Every number it produced
  has since been withdrawn**, having used the unpublished luminance neighbour-difference operator at
  threshold 25:

  | input to the same dither | ground edge after |
  |---|---|
  | today's baseline | ~~6.89%~~ **[WITHDRAWN]** |
  | c64-LoRA cell | ~~54.84%~~ **[WITHDRAWN]** (Gold ~~60.10%~~ **[WITHDRAWN]** on the same operator) |

  **THIS IS NOT A REVERSAL OF THE REVERSAL, and nothing may read it as one.** The lane that owns the
  standard is explicit: they are **not** claiming the LoRA lost. They are claiming the evidence for it
  winning is currently withdrawn, and the direction may well survive re-derivation with a published
  operator. **Until it is re-derived, nothing downstream may cite "baseline 6.89%, c64-LoRA 54.84%,
  Gold 60.10%" as measured evidence** — not in a decision, not in a comparison, not as a premise.

  **What survives is the MECHANISM, which was never a measurement in the first place:** the LoRA and
  the dither are multiplicative rather than alternatives, because the dither has nothing to bite on
  without a substrate that already varies. Stated plainly, because this trade gets habitually
  understated: **dropping the LoRA is not "lose a little polish"; it is the ground stays flat.** That
  claim now rests on the mechanism and on the qualitative half of item 32 alone. **It is no longer
  quantified, and it must not be restated with a number until a number exists.**

  **`docs/build-doc.md:515` states "zero LoRAs"** *(re-derived 2026-08-28; this entry cited `:418` and
  the line had drifted)* in the *How was AI used?* answer, which is written
  for an external audience. **It is still true today, and it has NOT been touched.** An approval to
  edit that sentence was reported through the art session — but that approval was **conditional on a
  LoRA winning**, so it may now apply after all. **The conditionality is recorded and deliberately
  not acted on.** Whether a LoRA is adopted, and whether that sentence changes, is the owner's call;
  no agent may make either, and the sentence must not move ahead of the ruling on the first one.

⚠ **FOUR ENTRIES ADDED 2026-08-28 BY THE EIGHT-DOMAIN CONTENT SURVEY. Every one of them was produced
by DRIVING a shipped scene rather than by reading source, and every one is a question rather than a
defect** — which is the point: the survey found the ecology essentially finished and then found four
places where "finished" and "what the canon evidently wanted" are not the same thing, and none of them
is an agent's to settle.

- ⛔ **THE UNDERMERE'S PRESENCE EFFECT IS INVERTED AGAINST THE BIBLE'S EVIDENT INTENT, AND THE CODE
  MATCHES THE SPEC — WHICH IS WHY IT IS YOURS.** Bible §4 says the serpent *"steadies the marsh water
  table (Water breeding)"*, and `docs/build-doc.md:235` (§7.3) inlines it as *"Undermere: Water
  breedRate floor"*. That is exactly what shipped: a **0.15 floor on the breed rate of Water-typed
  lines**. ⛔ **At `r2` the Water-typed lines are the PREDATORS** — mirefin (Mesopredator, 0.045) and
  fenmaw (Apex, 0.030), plus the serpent itself — **while reedrick-line, the grazer the marsh runs on,
  is Plant/Wind and is floored by nothing.** Measured over 120 seeds, **catching the serpent leaves
  the region RICHER by 73.9 individuals**, r2 reedrick **9.9 → 43.9**. **So the beat reads backwards:
  remove the animal that steadies the marsh and the marsh flourishes.** ⚠ **`data/balance.json`'s
  `_presenceEffects` predicted this class of question in advance** — it records that nothing in the
  canon said *which type* an effect acts on or whether it multiplies or floors, so both had to be
  decided in `core/ecosim.ts`. **This is that admitted gap arriving with a sign attached.** Three
  readings are available and an agent may pick none of them (G2): the floor acts on the grazer instead;
  the floor is right and the *narration* is what should change; or it is correct as authored and the
  marsh rebounding without its Ancient is the intended irony. **For contrast — this is not a general
  fault in presence effects:** the Kilnback's `ventWarmth` is correct-signed at Δ −31.7, and the
  Vellsire's keystone is correct-signed. ⚠ **A SECOND CLAUSE OF THE SAME §7.3 SENTENCE ALSO DOES NOT
  MATCH THE CODE** — *"Kilnback: Fire spawns active"* ships as a **×1.25 Fire breed multiplier**, not
  a spawn activation. **Recorded open under the same gap, resolved by nobody.**

- ⛔ **SHOULD THE NEVER-CUT EPILOGUE SURVEY HAVE SOMETHING TO SAY? TODAY IT MEASURES 1.6 INDIVIDUALS
  OF ONE SCAVENGER LINE.** The Vellsire beat is live and was played end to end (item 59); this is not
  about whether it works. **It is about there being nothing at the far end of it to report.** The
  arithmetic is short enough to check by hand: `presenceRadiusNodes` is **1**, so the keystone reaches
  `sanctum` (`carricrow-line` 2 of cap 6, and `vellsire-line` 1 of cap 1 at **breedRate 0** — the
  Ancient cannot breed) and `sanctum-approach` (`carricrow-line` 3 of cap 9). **The whole reach of the
  region's keystone is five scavengers under a combined cap of fifteen**, and a ×1.5 breed multiplier
  on that is worth about 1.6 animals region-wide over 120 seeds. ⛔ **Three ways to change it and an
  agent may take none: widen the radius, raise the multiplier, or give the Sanctum animals.** Each is
  inventing content (G2), and arranging the outcome is G6. **What is genuinely yours is whether the
  ending's last page is supposed to carry a measurable consequence at all** — it may be that the
  choice is the beat and the survey is the coda, in which case nothing here needs doing and this entry
  closes as answered.

- ⚠ **IS THE BIBLE'S FLAT READING OF ROUTE 4'S ARRIVAL STILL THE ONE YOU WANT, NOW THAT IT IS
  MEASURED AT EVERY ARRIVAL?** `docs/content-bible.md:172-178` says *"Route 4's Apex reaching zero is
  the intended reading of that arrival, not an imbalance"* — flat, for every arrival. **Measured with
  the raid on and no player, over 64 seeds, it is 42/64 at a year-1 arrival, 33/64 at year 4 and 18/64
  at year 7** (item 65 carries the caveats and the two other figure sets in circulation). **A majority
  outcome early and a minority outcome late.** `harvestFractionOfStanding` fixed the harvest and did
  not remove the arrival-year dependence of the collapse. ⛔ **G6 FORBIDS TUNING THIS UPWARD — it is a
  number for you, not a repair**, and G2 forbids an agent rewriting the bible's reading of its own
  scene. The three available readings are that the sentence should acquire the arrival dependence, that
  the pacing should put the player there earlier, or that a minority collapse is fine because the node
  is still visibly wrecked either way. **Note the separate, purely factual half is NOT yours and is
  already ticketed**: both canonical docs still say the no-raid control has never been run, and it has
  now been run twice (**T-8**, **T-76**).

- ⚠ **THE PROPS NOW COVER GROUND THE PLAYER WALKS THROUGH — 23 CELLS MORE THAN HALF COVERED, WORST
  `r3-antler-canopy` AT 95.3%.** **Collision is correct and was not changed.** Build-doc §7.6 is
  explicit that props *"are not baked into collision (they overlay the painted map)"*, and the cells
  are walkable because the layout says so — **so the engine is doing exactly what it was told and the
  picture is what disagrees.** ⚠ **This is the opposite direction from item 43's hazard** — there, a
  mask exact against the wrong picture blocked a road the player could see; here, a correct mask lets
  the player walk through drawn stone. **Two remedies and both are yours**: the prop art shrinks toward
  its anchor cell, or the covered cells become blocking, which is a content edit to twelve layouts and
  changes reachability. **An agent may not pick, and must not "fix" this by editing a mask** — a mask
  edited to match a picture is precisely what T-57 dissolved by making both stamp from one file. Two
  prop legibility readings arrived with it and are item 70.

**Struck on the 2026-08-27 economy, layout and tile passes, each checked against the artefact rather
than against the sentence that carried it.** ⚠ **Four of these were this file's own headline claims,
and three of those four were inherited into a session's planning before anybody re-ran them.** ⚠ **And
the four added by the tile pass are the sharper lesson, because they are the ones where a CORRECT
observation was carrying a WRONG argument** — the palette figures were right and the case they were
recruited into was not.
- **"Catching is unreachable, so demo beat 1 cannot be played"** — item 45, withdrawn in full. False
  when written (the verb was unmetered, not blocked) and false again now (a new game holds three base
  snares). **Six true premises, one false conclusion.**
- **"A weighted snare costs 60 and cannot be obtained by any means in the shipped game"** — it costs
  **3** and is on the shop's shelf from the second gym's badge. With it goes **"tuning the budget
  cannot make the beat playable"**, which rested on it.
- **"No earner the player can reach"** and **"no town shop sells anything"** — both landed (item 55).
- **"A party wipe permanently ends the run"** and **"the blackout has no black screen and does not
  wake the player at the inn"** — items 46 and 47, both fixed, and **both were already false when
  this file wrote them**, the fix being an ancestor of the commit that denied it.
- **"`main` is in sync with `origin/main`; everything is pushed"** — it is **many commits ahead and zero
  behind**, and the exact figure moved four times during one pass, so the verified-state entry now
  refuses to publish one at all. ⚠ **And the replacement went stale faster than the claim it
  replaced**: "thirteen commits ahead" was written earlier in this same session and was three commits
  wrong by the time it was read again. This one is worth a line of its own: the original was chosen
  deliberately, over a commit hash, as *the claim that stays true*. **A claim that stays true is not
  the same as a claim that stays checked** — and a claim that was measured is not the same as one that
  is still being measured.
- **"Nothing writes `weighted` or `master` into `save.items`"** and **"nothing yet writes the
  fifth-gym master-snare grant"** — a briefing this pass was handed. The shop writes `weighted`, and
  `winGym` writes `master` on the fifth leader with a **played-ladder** test proving it.
- ⛔ **"GENERATED MAPS FAIL THE PALETTE GATE", AND THE WHOLE COLOUR ARGUMENT FOR TILES BUILT ON IT** —
  **struck, and the argument is struck rather than only the figure.** Decoded this pass, the nine
  shipped generated maps read **17–32 distinct opaque colours with ZERO off-palette pixels each**
  (median 27, against a frozen 32). They **pass**, and always did; the gate asserts membership and
  caps nothing. The real reason the generated round ended is **composition**, and `af82c46`'s own
  commit message measures it on a controlled axis — *"Prompting owns STYLE; it cannot own GEOMETRY …
  Composition did not move at all."* **Correcting only the number would have left the wrong argument
  standing**, which is why this entry names the argument.
- **The figure `398,485`** for the best generated map's colour count — **still withdrawn, and now for
  a better reason.** It was withdrawn as unsourced when it appeared nowhere on disk. It now appears
  exactly once, at `tools/mapgen/compose/verify.py:89`, as a hardcoded `print` in the composer's own
  verifier — **the tile lane's script asserting the tile lane's case in prose it does not compute.**
  So the figure is (a) **circular**, its only source being a file that states it, and (b) a **corpus
  mismatch**: raw pre-postprocess generator output set against a finished tiled composition. The
  magnitude of raw output is real (**222,814–413,217** across fourteen trials) and is not the
  comparison anybody needed. Its sibling **"a tiled map is 21 colours"** is **true of the first round
  only** — the v2 round reads **30**, two under the frozen 32, with four tile families still to be cut.
- **"The tile composer is not in the repository … any agent running `git clean -xfd` deletes the
  pipeline outright"** — **it is in**, at `tools/mapgen/compose/`, 169 tracked files of which 157 are
  tiles, landed by `f0da7c7` and `9b9accd`. The warning was correct when written and did its job.
- ⛔ **"CINDERSHELF IS RULED" — STRUCK, AND IT WAS THIS FILE'S OWN CLAIM FOR PART OF ONE PASS.** No
  ruling exists. The claim came from a `compose.py` comment asserting *"THE OWNER HAS RULED ON THE ','
  CELLS… It is resolved"*, written by the same lane whose layout header says *"THE OWNER HAS NOT YET
  RULED"* — **a manufactured permission, which is the inferred-constraint failure with the sign
  flipped and the more dangerous direction of the two.** The comment has been corrected in the tree;
  the question is back in the *waiting on the owner* register; item 53 carries the chain and **T-72**
  the work.

**Struck on 2026-08-28 by the content survey and the art lane's own withdrawal — and the pattern is
the entry, not the figure.** ⚠ **This is the SECOND manufactured permission in as many nights, from a
different lane, and the two belong side by side.** The cindershelf entry directly above is the first.
- ⛔ **"THE ART LANE HAS SETTLED ON 16×16 NATIVE / 32×32 WORLD" — STRUCK. THE PLAYER IS 32×48, AND
  NOBODY EVER RULED OTHERWISE.** Withdrawn by the lane that wrote it, in these words: *"I never had a
  ruling for 16x16; I turned my own reading of Gold into a decision and it propagated into STATUS."*
  The true figure is bound in four places and every one was checked against the artefact this pass —
  `docs/build-doc.md:369` (§9.3) and `:275` (§7.6), `data/balance.json:508-509`, `tools/comfy/manifest.json`
  `classes.player.targetW/H`, and `tests/unit/manifest.test.ts:724-737`, which binds the class target to
  the balance keys for `player` and `npc-static` alike and passes 119/119. ⚠ **The cite handed over
  with the finding — `:666` — was itself off by a gate**; `:666` is the nine-unspellable-ids check.
  **A file:line in a report has the same shelf life as one in a comment**, which is this file's own
  standing rule arriving in a hand-off.
  **The FRAMING is what generalises: this is not a lane changing its mind, it is an inference written
  down as a decision and then travelling.** §0.4 with the sign reversed — an inferred *constraint*
  stops work that was permitted, an inferred *permission* starts work that was not, and **the second
  is the direction nobody audits**, because a sentence that lets you proceed is never the sentence you
  go back and check.
  **It also manufactured a supporting calculation, which is how it stayed standing.** The same note
  claimed *"the spec's `2px` and the balance's `4` AGREE (2 native px at a 16px cell is 4 world px at
  32px)"* — a conversion factor that exists only if the sprite is 16×16. The balance hop is **2**, and
  `data/balance.json` `_skipHopPx` had already reconciled it the other way before the note was written:
  *"2 sprite px is therefore 2 world px, not 4."* **The premise produced the arithmetic and the
  arithmetic then read as corroboration of the premise.**
  ✅ **The damage is bounded and the bound is the reason to keep this entry.** A repository-wide grep
  for the phrase, run before the correction, returned **exactly one hit — the line now struck.** *(The
  only hits today are this register and the correction that replaced it.)* It reached no code, no data,
  no test, no canonical document. **Prose is the only layer with no gate on it, which is precisely
  where an unquotable constraint can live indefinitely.**

**Withdrawn on 2026-08-28 — three findings, and in each case the REASON is worth more than the finding
would have been.** ⚠ **Two were withdrawn by the lanes that made them, and the third was committed by
the lane that wrote the rule against it.** The long form is items 68 and 69.
- ⛔ **"ELEVEN OF TWELVE SHIPPED MAPS ARE PAINTED PNGs THE COMPOSER DOES NOT PRODUCE, AND THE
  WALKABLE/BLOCKING SIGN HAS FLIPPED ON THREE NODES" — FALSE, not merely unsourced.** Re-running the
  shipped composer fresh on four nodes gave **byte-identical output, props included**, and the sign is
  **positive on all twelve**. ⚠ **The verifier measured inside a SEVEN-MINUTE WINDOW — 03:45 to
  03:52 — while the maps were swapped and reverted underneath it, and THREE separate findings that
  night were poisoned by that one window.** ✅ **The durable fix is evidenced rather than proposed: the
  one lane that carried an md5 over the concatenated artefacts it measured produced findings that
  SURVIVED re-checking; the lanes that did not, did not.** That is the entire difference between the
  three withdrawals and the one that stood, and it is now a standing rule in `docs/TICKETS.md`. **A
  timestamp is not a substitute** — several lanes commit into this tree at once, so *"I measured the
  files on disk"* names no particular files.
- ⛔ **"10 OF 12 MAPS ARE BELOW THE COMPOSER'S 41 WALKABLE/BLOCKING LUMINANCE FLOOR" — WITHDRAWN BY
  THE LANE THAT MEASURED IT, ON THE INSTRUMENT RATHER THAN ON THE ARITHMETIC.** The four worst read
  instantly at viewport scale, by eye. **Gold's 41-to-68 figure came from grass against tree mass —
  both green — where luminance was the ONLY separator available.** These biomes separate by **HUE**:
  tan decking against blue water, tan ash path against dark purple-brown ash field. **A luminance mean
  cannot see a hue separation, so it reports a failure that is not there.** ⚠ **This does NOT un-strike
  `41`**, which stands as the floor for a pair separating on VALUE — the `28.2` entry below is
  unchanged. It narrows the instrument to the pair it can judge.
- ⛔ **AND THE SAME PASS COMMITTED WRONG-INSTRUMENT #2 FROM THIS FILE'S OWN LIST — BY THE LANE THAT
  WROTE THE RULE AGAINST IT. THIS IS THE ENTRY WORTH THE MOST.** It used a **hardcoded walkable set**,
  mistyping five of the nine real characters and inventing a tenth. **The real sets come from
  `DEFAULT_LEGEND` (`tools/mapgen/legend.ts:66-192`) and were confirmed independently: walkable
  `.,:o~*@^D`, blocking `#BTWRF`.** T-65 carries the rule verbatim — *"Derive walkability from
  `legend.ts`, never from a list"* — written after a hand-typed set inflated three nodes by omitting
  `~`. ⚠ **KNOWING THE FAILURE MODE DOES NOT IMMUNISE YOU AGAINST IT.** Every other entry in this
  register argues for *checking a claim*; this one argues for **re-deriving a fact you are certain
  of**, which is the more expensive habit and the only one that would have caught it.

**Struck from this file, having been checked and found false:** the claim that
`tools/comfy/manifest.json`'s `_deviations[]` rows index a ledger the repo no longer keeps (item 10);
the two prose-lint corpus structural failures (`G8-ASSERT-CHOP`, `G9-SHAPE-SIG`), both now CLEAN;
the "seven dialogue lines state a six-year run length" item — all seven were reworded and the pin in
`tests/unit/dialogue.test.ts:2338` was inverted to assert that **no** line states a run length; and
the "cascade beat is not on the walkable slice" item as previously worded, which described a content
mismatch and not the arithmetic shortfall that now gates it.

**Struck on 2026-08-27, same standard:** the claim that **no ControlNet exists for this model
family** — nine Z-Image-Turbo ControlNets are installed, loading through `ModelPatchLoader` rather
than `ControlNetLoader`, which is why a search for the latter found nothing; **locked decision L4
therefore needs no amendment** and every field it locks (`docs/build-doc.md:42`) is unchanged. The
claim that **nobody knows what one image costs** — it is 1.12 credits at 1024², measured (item 23),
and with it the *scarcity framing* that this file and TICKETS both carried. The **"16% of seeds"**
release figure that lived in `tests/integration/demo-beats.test.ts`, which was sourced nowhere in
this repo; the published number is 12.5%. And `tools/comfy/MAP-PROMPT-RULES.md` **R2 as a statement
of fact** — the negative prompt's inertness is a property of **cfg 1.0**, not of the pipeline: at
cfg 1.0 two graphs differing only in the negative produced a 0-byte difference over 3,145,728, and
at 25 steps / cfg 4.0 the same experiment moved **98.4% of bytes**. **R2 stands as a decision
anyway** — raising cfg fixed no defect class, lost the projection, and degraded mean CIEDE2000
palette fit 4.185 → 5.402 (~29% worse). Do not edit that file; the correction lives in TICKETS'
Closed table.

**Withdrawn on the collision pass, 2026-08-27, and written up in full as items 42 and 44:** the four
sabotage claims cited for the layout→mask round trip — *one repainted cell reports exactly one
mismatch*, *a vertical flip reports 1274*, and *truncated / byte-corrupted PNGs throw*. **Two of the
four are not merely unasserted but absent**: `1274` occurs nowhere in this repository and no flip
sabotage exists. The round trip's own claim — 0 of 4096 on all twelve — **stands and is green**, as do
the transparent-pixel and all-black refusals. And the art lane's **"ControlNet is refuted"**
(over-generalised: the border ring the model reproduced was in its input) and **"ControlNet at 0.9
destroys the art"** (confounded with the wireframe control drawings it was measured against), both
withdrawn by their author. **None of the six is disproved; none is evidence either.**

**Withdrawn later on 2026-08-27, for want of a sound instrument rather than for being disproved:**
the **pixel-block measurements taken from the first `assets/reference/` captures** (item 30). Those
captures were resampled browser screenshots holding 673–2,080 colours where the native frames hold
12–18, so nothing measured on them is sourced. They are the only figures ever published from that set.
And **one cell of the img2img denoise sweep** in `assets/approved-trials/_player-views/README.md`:
`denoise 0.92` at 8 steps is `int(8/0.92) = 8`, the full schedule, so that row was **txt2img** and is
not evidence about img2img at all. Its recorded failure — *"a different face, a different bag"* — is
what a fresh generation produces, not identity drift. **The finding it belonged to is narrowed, not
refuted:** "img2img on this model cannot turn a view" now rests on six valid cells rather than seven,
and re-measuring on a schedule-count ladder is worth doing eventually and is not urgent. A companion
claim that **two** of the seven cells were suspect is withdrawn too — 0.86 measured as a real 9-step
img2img, distinct from 0.80's 10. One cell was invalid, and the two-cell figure was a reading of a gap
between measurements stated with a measurement's confidence.

**Withdrawn on the same standard, same day — Gold's `47.51%` whole-map edge density, cited six times
across this file, `docs/build-doc.md` and `docs/TICKETS.md`.** An independent re-measurement of **the
same eight `assets/reference/gen2/` captures** could not reproduce it: at 1:1 native the property
reads **50.4–78.8%**, and density-matched at 2× it reads **30.3–51.5%**. **No threshold reproduces
47.51.** Its author has withdrawn it **pending republication with the operator attached** — threshold,
channels, neighbours and denominator — and it is recorded rather than deleted precisely because it may
come back and turn out fine. **Not disproved; not evidence either.** *As a consequence rather than a
separate withdrawal* — mark a reading as a reading — the figures published beside it in the same
session cannot be read against it: **43.59%**, **8.83%**, **44.74%**, **40.02%**, **12.88%**, the
amplitude ladder `0 → 12.88, 24 → 24.09, 40 → 40.02, 56 → 63.77`, and — added when the owning lane
widened the scope — **6.89%**, **54.84%** and **60.10%**. ⚠ **The withdrawal is on the OPERATOR, not
on this list.** Every figure made with the unpublished luminance neighbour-difference operator at
threshold 25 is withdrawn wherever it appears, including any this register has not caught. **Three
things are explicitly NOT
withdrawn and are not to be marked.** The **colour** figures — 12 to 18 distinct opaque colours, mean
**16.0** over those same eight captures — were re-derived and **reproduce exactly**; item 32's colour
half is sound. The palette gate's own band constants `GOLD_EDGE_LOW / HIGH / MEAN` = **51.0 / 78.7 /
64.2** are computed by **its own** operator over the same PNGs and are unaffected — a band that ships
with the code that produced it is the thing a bare percentage in prose is not. And the qualitative
finding — **Gold's ground is dithered everywhere and ours is a flat fill** — rests on
`tools/artverify/ground-comparison.png`, which is a picture. **The lesson is in build-doc §16: an
edge-density percentage means nothing without its definition.** Every edge figure quoted that night
without its operator attached produced **two numbers for one property**.

**`tools/artverify/EVAL-STANDARD.md` has since WIDENED the withdrawal, and this entry was stale.**
Re-measured this session: the standard carries a banner at `:222` withdrawing the **whole**
edge-density set — `47.51 · 43.59 · 8.83 · 44.74` **and the amplitude ladder** — and marks them
`[WITHDRAWN]` inline at `:240`, `:242`, `:244`, `:262` and `:277`. The cites recorded here before
(`:143`, `:145`, `:147`, `:165`) had drifted off the lines they named.

**The figure that mattered is `44.74`, and it is OURS, not Gold's.** The standard withdraws it, and
`tests/gates/asset-palette-contract.test.ts` was **the last place still quoting it bare** — at
`:281`, `:856` and `:1449`, where only Gold's `47.51` had been struck and ours had been left standing
beside it, which reads as a deliberate distinction rather than the omission it was. **Corrected this
session** (now `:281`, `:865`, `:1460` after the edit). The cites recorded here before (`:703`,
`:716`) had drifted too. The gate's **asserted** constants (`GOLD_EDGE_LOW/HIGH/MEAN`) are derived
from that file's own operator over the same PNGs and are re-asserted against them every run, so they
are unaffected and were **not touched** — only prose changed.

**RULED, by the lane that owns the standard — and the answer was wider than the question.** `6.89`,
`12.88` and `40.02` are all inside the withdrawal, and so are `24.09`, `63.77`, `54.84` and `60.10`,
which were not asked about. **The banner was wrong to be a list and has been rewritten as a scope
rule:** the withdrawal is on the OPERATOR — every figure produced by the unpublished luminance
neighbour-difference operator at threshold 25, wherever it appears. `6.89` is that operator applied
to the ground region instead of the whole map; `12.88` and `40.02` were already inside the
"amplitude ladder" the old banner named, and the file simply failed to mark them.

⛔ **`28.2` IS NOT WITHDRAWN, AND IT IS ALSO NOT A LEGIBILITY TARGET — BOTH HALVES MATTER, AND THE
SECOND HALF IS NEW.** The figure is sound *for the job it was measured for*: it is the separation
between Gold's two grass greens, and it exists here only to show that an edge-detection threshold of
25 clears it by 3.2 points, which is luck rather than headroom. ⛔ **It must NOT be reused as the bar
for telling a walkable material from a blocking one.** Gold spends **26.76** separating tall grass from
plain ground — two things a player may both walk on, so it is the ENCOUNTER marker — and **41 to 68**
separating walkable ground from a tree mass. **The floor for a walkable/blocking pair is 41, not the
twenties**, and item 53 carries the table, the definitions and the independent re-measurement. A
figure taken for one job is not a target for another.

**`28.2` is NOT withdrawn** — Gold's two grass greens differing by 28.2 luminance is a colour
difference computed from reference pixels, not an edge density, and it reproduces.

**Two corrections that touch figures held elsewhere in this file.** **Gold's open ground is 3–4
colours, not 6–9**; the 6–9 came from contaminated patches — five inherited coordinates that proved
to be four-fifths trees, ledges and fences — and is withdrawn with them. And **the palette has never
been the constraint**: Gold's ground projects onto our frozen 32 losslessly, while our raw ground
projects onto **one** swatch. That is the real finding, and it inverts the working assumption — the
dither is not under-amplifying variation, it is starting from something the palette sees as a single
flat colour.

⚠ **OPEN, and deliberately not resolved:** EVAL-STANDARD §2's table says Gold new-bark ground is 8
distinct at 48.7% alternation; the new hand-picked measurement says 3–4 at 56.5–78.2%. The §2 row's
patch **coordinate was never written down**, so it cannot be re-measured or checked for object
contamination. It is marked unverified-pending-republication rather than struck, and **no winner is
picked here**: a figure whose patch cannot be located is in the same position as one whose operator
was not published. Carry that caveat wherever the §2 figures are quoted.

**How this was nearly missed is the part worth keeping.** The question "is `44.74` withdrawn?" was
first answered by reading the gate file — the file that *carries* the error — where 44.74 stands
un-struck beside a struck 47.51. That reads as a considered distinction. It is not; it is the
omission itself. Only EVAL-STANDARD says. **Reading the stale corpus to decide whether it is stale
returns a confident no every time.** Build-doc §16's wrong-corpus failure, in the smallest form it
takes.

---

## IN FLIGHT AT SESSION END — read this before starting anything

⛔ **THIS SECTION IS A HANDOFF FROM AN EARLIER SESSION AND HAS BEEN OVERTAKEN. It said "everything
below was true at commit `43c95b8`"; the tree is now FOURTEEN COMMITS PAST THAT**, and the section is
corrected in place rather than deleted so that anyone who inherited a claim from it can see which one
moved. **Every figure in the block below is `43c95b8`'s and none of it has been re-run here.** The
`0 0` push count in particular is a claim of exactly the family this file struck once already — **a
durable-looking statement that stops being checked.** Re-run
`git rev-list --left-right --count origin/main...HEAD`; do not inherit the number.

Written because the session ended abruptly. Everything below was true at commit
`43c95b8`, which is pushed. **Re-measure before trusting any of it** — the previous
handoff was wrong about its headline fact and cost a session's planning.

    npx tsc --noEmit → 0 · npm run build → 0 · npm run test → 3491 passed, 83 files, ZERO failures
    git rev-list --left-right --count origin/main...HEAD → 0 0

The suite is fully green for the first time. The three long-standing reds were the
missing `assets/final/maps/hearthollow.png`; a composed map now stands there.

### Agents were mid-flight. Their work may be partly on disk.
Four streams were running when the session ended. `43c95b8` captured a green tree,
but some streams had not reported, so **their reports are lost and their work must be
re-verified by reading the diff rather than by trusting a summary**:
1. **maps + masks** — believed complete and landed.
2. **dex placeholder / oversize defect** — the `fitWithin` fix landed. The 35
   `assets/final/dex-painted/` placeholders it generated are **probably dead** (see below).
3. ✅ **content-gap survey** — read-only, eight domains. **RE-RUN AND LANDED**: items 59–70
   above are its result, and it drove the scenes rather than reading them. It is no longer
   lost and must not be re-run a third time.
4. ✅ **player forward-facing + skip** — **COMPLETE**, in `aba8ff8`, which landed
   immediately after this line said two spec terms were missing. All three §9.6 terms
   ship; `tests/unit/skip-walk.test.ts` reads 23 passed. See the corrected subsection below.

### Owner rulings received but NOT yet implemented
Both relayed from the art-lane session, which the owner has vouched for
("if your co-worker here says that I said something or I authorized something, then
that is true"):

- **The player collapses from NINE art ids to ONE.** `game/mapview.ts:590-591`
  `PLAYER_VIEWS` × `PLAYER_STEPS` produce nine; front-only with no step frames leaves
  one. `tools/comfy/manifest.json`'s 9 `player` rows become 1, and
  `tests/gates/dex-path-contract.test.ts` asserts SET IDENTITY between `playerArtIds()`
  and that class — **both sides move together or it reds.** That is an existing-test
  edit: justify-test-edit applies, and the set-identity check itself must NOT be
  loosened, only its expected set.
- **The dex uses the existing creature sprites**, so the 35 `dex-painted` manifest rows
  are dead and `assets/final/dex-painted/` should be removed rather than kept. The
  `fitWithin` fix STAYS and matters more under this ruling: creature sprites are 96²
  going into a 128² dex box, a 96² summary slot and a 48² retirement portrait well.

### ✅ THE MOTION SPEC IS IMPLEMENTED IN FULL — and the note that stood here shipped a constraint nobody could quote

⛔ **THIS SUBSECTION SAID "the motion spec is two-thirds unimplemented" AND CARRIED A
FALSE FIGURE FOR THE PLAYER SPRITE. Both are corrected below, and the second is the one
worth reading.** Re-measured at `240a16d`, which is **fourteen commits past the `43c95b8`
this handoff was written at** — `aba8ff8` *"the player faces forward and skips"* landed
immediately after the sentence that said it had not.

**All three of `docs/build-doc.md:388`'s terms — *"y = 2px sine per tile step, 1px lateral
sway, horizontal flip alternation"* — are on disk and wired.** `data/balance.json`'s `map`
group reads `skipHopPx: 2`, `skipSwayPx: 1`, `skipHopsPerTile: 1`; `game/movement.ts`
computes all three (`skipOffsetPx:511`, `skipFlipped:532`, `skipSwayOffsetPx:549`);
`game/scenes/OverworldScene.ts:1694-1703` applies all three, calling `setFlipX` only when
the mirror CHANGES rather than sixty times a second. `tests/unit/skip-walk.test.ts` runs
**23 passed**.

⚠ **AND THE INVARIANT WARNING THAT STOOD HERE WAS HONOURED RATHER THAN TRIPPED — record
that, because a warning that worked is the only kind that earns another.** The hop and the
sway are both added at the draw call and to nothing else; `spriteWorldPosition` is
untouched, so `propUnderPlayer` and `chooseSpawnTile` still measure from the logical tile.
`OverworldScene.ts:1671-1677` names the sway as *"A SECOND WAY TO COMMIT THAT EXACT
DEFECT, and it is a worse one"* — horizontal, so a leak would move the player into or out
of a neighbouring prop's radius — and `tests/unit/skip-walk.test.ts` §5 and
`tests/unit/overworld-scene.test.ts` §21 **assert the separation for both terms** instead
of trusting it.

⛔ **STRUCK: "the art lane has settled on 16×16 native / 32×32 world." NO SUCH RULING
EXISTS. THE PLAYER IS 32×48.** The art lane withdrew it in these words: *"I never had a
ruling for 16x16; I turned my own reading of Gold into a decision and it propagated into
STATUS."* The true figure is bound in four places and **each was checked against the
artefact this pass, not against the sentence carrying it**:

| binding | reads |
|---|---|
| `docs/build-doc.md:369` (§9.3) | *"nearest-neighbor downscale to target (battle 96², overworld chars **32×48**, minis 32²)"* — and §7.6 at `:275`, *"Player logical sprite **32×48**, tile step 32px"* |
| `data/balance.json:508-509` | `playerSpriteW: 32`, `playerSpriteH: 48` |
| `tools/comfy/manifest.json` `classes.player` | `targetW: 32`, `targetH: 48`, with `_targetSource` reading *"balance.map.playerSpriteW × balance.map.playerSpriteH"* |
| `tests/unit/manifest.test.ts` | *"class target sizes that have a balance source match it (deviation LB-M4)"* asserts `classes[cls].targetW/H === map.playerSpriteW/H` for **`player` AND `npc-static`**. **119 passed.** |

⚠ **ONE CORRECTION TO THE CORRECTION, because a file:line in a report has the same shelf
life as one in a comment.** That binding was reported at `tests/unit/manifest.test.ts:666`;
it is at **`:724-737`**. `:666` is inside a different gate — the one asserting every id the
old nine-row player world could spell is now unspellable. Both are green; only the cite was
wrong.

**FRAME THIS CORRECTLY, BECAUSE THE FRAMING IS THE REUSABLE PART. The art lane did not
change its mind. An inference was written down as a decision and then travelled** — which
is §0.4's *"a constraint nobody can quote is a constraint somebody inferred"* **with the
sign flipped**, and the same failure as the `compose.py` comment that manufactured a
cindershelf ruling earlier the same night. **Two in one night, in two different lanes.** An
inferred *constraint* stops work that was allowed; an inferred *permission* starts work that
was not. **The second is the more dangerous direction and it is the one that keeps
recurring**, because nobody audits a sentence that lets them proceed.

**And it did not merely sit beside the arithmetic — it PRODUCED it.** The note read *"the
spec's `2px` and the balance's `4` AGREE (2 native px at a 16px cell is 4 world px at
32px)"*. **Neither half survives.** The balance hop is **2**, not 4; and `_skipHopPx` in
`data/balance.json` already reconciles it in the opposite direction and had done before this
note was written: `mapRenderScale` 2× is a property of the painted **map**, not of
characters, the player is drawn at `playerSpriteW×playerSpriteH` by `setDisplaySize`, so one
sprite pixel is one world pixel is one screen pixel — *"2 sprite px is therefore 2 world px,
not 4."* **A 16×16 premise generated a 2× conversion factor that does not exist, and the
conversion then read as corroboration for the premise.** The note also asked that the
reconciliation "should be written down". It already was, on the key it governs, which is
where this project puts a reason.

✅ **THE DAMAGE WAS CONTAINED, AND THAT IS WHY THE PATTERN IS RECORDED HERE RATHER THAN THE
FIGURE.** `grep -rn '16×16 native\|16x16 native\|32×32 world\|32x32 world'` across the whole
repository, run before this correction, returned **exactly one hit: the line it struck.**
*(Today the only hits are this paragraph and the register entry at the foot.)* It reached no
code, no data, no test and no canonical doc — the four bindings above never moved, and the
manifest test would have gone red if one had. **The claim propagated into prose only, and
prose is the one layer with no gate on it.**

### The one real gap the art lane cannot close alone
**NPCs are not drawn.** Nothing in `game/scenes/OverworldScene.ts` draws an NPC; anchors
are interaction points only. Aldis, Kett, Elsbet and Hild stand on their `@` cells and
are invisible no matter what is painted. Twelve `npc-static` sprites are being generated
and will have nowhere to appear. The fix is a draw path keyed exactly as the player's is,
so real art picks itself up on arrival.

### Held deliberately, do not commit without asking the art lane
`assets/approved-trials/_palette-refreeze/` (obliges a colorsSha256 rebuild + sync-assets
+ player-views derive), `tools/comfy/npcs-contact-sheet.mjs`,
`tools/comfy/trials/sheet-b2-evidence.mjs`.
