# Final prose audit — findings from the fourth pass

## 1. [BLOCKER] /private/tmp/claude-501/-Users-hankholcomb-Documents-code-parent-folders-gauntlet-repos-trophic/d58ab7c7-bc89-47aa-ba19-fa42d827a893/scratchpad/fragments/S2-wick-greaves.json — wick.act2.loss, wick.act3.loss, wick.act4.loss, wick.act5.loss (line 1 of each); wick.act1.win, wick.act2.win (line 1 of each)

**Problem.** Wick's twelve battle beats are two sentences written six times. Four consecutive defeat beats (acts 2-5) run one armature: [I have had this ground a season/a year] + [therefore I know a specific property of it] + [you don't]. Two victory beats open on a bare unnumbered comparative compliment, which his own voice sheet forbids ('Never concedes with a maxim — he concedes with a number'). This is invisible to every check that has been run: the cross-speaker chorus scanner only fires across speakers, the structural diff preserves ids, and prose-lint reads one beat at a time. The player meets Wick more than any other character and loses to him at least once, so this is the repetition a demo video actually exposes.

**Evidence.** act2.loss: "The marsh is slow ground and I've walked it all year. I had that one before either of us put anything out." · act3.loss: "I've had this canopy on my sheet since spring, so I know which branches take a landing and which drop you. You don't yet." · act4.loss: "I've walked every part of this scarp, so I know where the ground gives out under you." · act5.loss: "All winter I've had on it. You've had an afternoon." — and act1.win: "You were quicker than me the whole way through." beside act2.win: "Your timing in the shallows is better than mine." I attributed the second of those to Odo and the first to Noct in the blind test.

**Fix.** Give each act a different reason he lost and a different reason he won, and write the six down before touching a line. Suggested assignment, one per act: act 2 he blames the tide table he was given, not his own footwork; act 3 he cites a clause that let him onto the stand early; act 4 he concedes flatly with a grade number and no explanation; act 5 he does not explain at all and changes the subject to the transfer form. For the two wins, replace the compliment with the figure his sheet says he reaches for — the returns-sheet margin in act 1, the intake grade differential in act 2. Line counts stay 1/1/1/1 and 2/2.

---

## 2. [BLOCKER] /private/tmp/.../scratchpad/fragments/S5-cindershelf.json — gerta.quest.crash.done line 2, against /private/tmp/.../scratchpad/fragments/S1-maren.json — maren.crash-survey line 2

**Problem.** The two most authoritative counting voices in the game recite the same food web, in the same order, with the same closing claim, in the same act — and Maren's own line one names Gerta, so the game deliberately puts them side by side. Beyond the chorus, Gerta's line carries none of her declared tic (a reading arrives with its units and its conditions, and she cannot state a figure without naming who took it and when), and the bible's RULE 3 says the drama of counting lives in method disputes between people who each privately think the other is sloppy. Here they agree perfectly and phrase it identically. Act 4 is the Cascade demo beat.

**Evidence.** maren.crash-survey: "If it's gone the usual way, the Cragmar and the Ashvole thinned out first, then the Pyrelisk that feed on the Ashvole, and a bird that size feels it last of all." · gerta.quest.crash.done: "Ashvole and Cragmar graze it, Pyrelisk take both, Stonewing take Pyrelisk and nothing else up there. If the green goes off that scarp it comes up through the lot of them in order." Same four species, same trophic order, same 'it comes up through them in order' claim. In the blind test I assigned Gerta's opener to Maren and Maren's opener to Sable.

**Fix.** One of them owns the trophic recital and the other owns a disagreement about it. Give Maren the chain, since hedged mechanism is her register. Rewrite Gerta's line as the thing only she has: thirty-one years of flat wall readings that say the scarp did not warm, so whatever took the Stonewing off was not the vents — a fact that contradicts Snell's folk explanation and that Maren cannot source. Same line count (3).

---

## 3. [BLOCKER] /private/tmp/.../scratchpad/fragments/S2-wick-greaves.json — entries wick.greeting.channel-thin and wick.greeting.reach-thin (not present in /Users/hankholcomb/Documents/code_parent_folders/gauntlet_repos/trophic/data/dialogue.json)

**Problem.** The fragments hold 214 entries; HEAD holds 212. Two entries exist only in the fragments. The brief's clean-structural-diff claim ('diffing all 212 entries gives zero differences') is true only because the diff was keyed on HEAD's id set, so additions were structurally invisible to it — four auditors passed over this. Worse, both additions are node=brackwater, kind=greeting with priority 41 and 40, while the incumbent wick.greeting.town has no priority field (defaults to 0). Selection is highest-priority-eligible per (speaker, node, kind), so these two shadow the incumbent greeting exactly when the population conditions hold — which is the depleted state the Cascade demo produces. A text-only pass is shipping a gameplay-visible change.

**Evidence.** Set difference over ids: `in frag not HEAD: 2 ['wick.greeting.channel-thin', 'wick.greeting.reach-thin']`, `in HEAD not frag: 0`, `line-count mismatches: 0`. Selection semantics at /Users/hankholcomb/Documents/code_parent_folders/gauntlet_repos/trophic/core/dialogue-schema.ts:685 ('highest-priority ELIGIBLE one, ties broken by file order') and :708 (`const p = e.priority ?? 0;`). The channel-thin `when` is population r2/fenmaw-line lte 1; reach-thin is r1/nibbin-line lte 4. S2's own _rules block does permit additions 'if the repair plan tells you to', with ids in the speaker's own namespace — which these are.

**Fix.** Get the integrator to confirm these two were on S2's repair plan before merging. If authorized, declare them in the merge note and in DEVIATIONS.md, and check the shadowing is intended — the player should still get wick.greeting.town in Brackwater at least once before the populations drop. If unauthorized, delete both and restore the entry set to 212. Also fix the diff harness: key it on the union of both id sets, not on HEAD's, or this class of change stays invisible.

---

## 4. [BLOCKER] corpus-wide — 36 of 62 speakers, 113 of 214 beats, all 13 fragments

**Problem.** THE FOURTH CHORUS: the clipped corrective afterthought — "assert, then chop". Every speaker's signature move is a complete sentence followed by a short fragment (<45 chars) that echoes, narrows, or negates it. Three sub-families, one armature: positive echo-restatement (21 speakers), negative corrective fragment (22 speakers), "X, not Y" appositive (13 speakers); union 36. The §2 cap is TWO speakers in the whole game. It is invisible to every existing gate: cross-speaker 5-gram overlap stays near zero because the vocabulary is fresh each time, and G5-CHORUS iterates a fixed lexical SHARED list, so a syntactic device with novel words passes every check in the file.

**Evidence.** Hearthollow elder: "...the far latch drops if you don't lift it. Not this gate." | Brackwater elder: "Drought year, flood year, same mark. Same mark." | Duskhollow elder: "Four the year before that, and four the year before that... Nine is nine." | Hearthollow child: "...she wrote her in as a Nibbin. Just Nibbin." | Cindershelf child: "Bigger than a cart. Bigger than two carts. Bigger than the inn." | Cindershelf elder: "One of them kept his gloves on indoors in high summer. Gloves. In a room with a fire in it." | Gerta: "Off the wall, mind. Not out of the air. Air moves." | Maren: "Three in the satchel by the door, yours to keep. The satchel isn't." | Bram: "...so it isn't that. And it isn't a vent." | Noct: "The room's dark. It stays dark." | Sel: "You'll see it off the dock at half tide. Half tide, not low water." | Hetty: "Fishery cut me to half hours two seasons back. Half." | r2-ferryhand: "His boat's no faster. It isn't." | r1-forager: "...turned up two Nibbin. Two." | vendor-hearthollow: "Weighted ones when the smith has iron. None since spring. None coming that I've heard of." | vendor-cindershelf: "No master snares since the contract closed. No tonic either. None coming." | duskhollow-astronomer: "Third hour, nothing. Fourth hour, nothing." | cindershelf-worker: "The overalls are company issue. No company here to issue them now." | sanctum-approach-scout: "The people I report to would not want that said out loud. I have said it." | Tolm: "I didn't put them there. I don't feed them." | bowerdeep-silkwinder: "...whatever the market tells you. Webvern make it."

**Fix.** Do NOT sweep the fragments out — that is the deletion move that refilled the vacuum three times. License it to exactly two owners where it is characterological (Sable, whose sheet says "answers with the shortest true sentence available and then stops"; Hetty, whose tic is self-correction) and give every other speaker a DIFFERENT second move, decided in advance and written down: one who runs the sentence past where it should stop, one who answers a question nobody asked, one who leaves the thought unfinished, one who repeats the whole clause rather than a fragment, one who simply stops after one sentence. Add lint rule G8-AFTERTHOUGHT: flag any sentence under ~45 chars whose content-word set is ≥50% shared with the previous sentence, OR which opens on Not/No/None/Never/Nothing and depends on the previous sentence; cap 2 speakers. Without a mechanical rule this returns in round five.

---

## 5. [BLOCKER] 22 speakers — S1-maren, S2-wick-greaves, S3-gyms, S4-brackwater, S5-cindershelf, S6-quest-npcs, S7-props, S8a-e, S9-services

**Problem.** The negative sub-family above is B1 — the negation-correction epigram, the bible's loudest named ban ("No character may negate a noun in order to substitute a better one") — surviving in DISTRIBUTED form, split across two sentences instead of one. prose-lint's B1-ANTITHESIS reports 0 because its regex (lines 84-86) only matches the copular template `that/it/this + is not ... that/it/this is`. Move the negation off the copula and across a full stop and the ban evaporates while the rhetorical move is identical.

**Evidence.** prop-shell-kiln-shrine: "The plates have the colour of fired clay. They are not clay." — that IS "That's not clay, that's X" with the serial numbers filed off. | Gerta: "The eight has never moved, they tell you. It has." | Orrin: "I am sorry about the light in here. It is not the lamp." | Pell: "They put the lamps out coming through. Not on purpose." | Wick: "You were quicker than me the whole way through. Not just at the end." | Maren: "The animal's out of working years. Not hurt, not ill." | Odo: "The far bank's moved out since the spring. Not much." | Sel: "Deep edge of the channel. Not the reed side." | Sable: "Then the other Ashvole. No." | vendor-brackwater: "And Reedrick come through in the summer. Not before." | Appositive form, 13 speakers: innkeeper-duskhollow "Rule eleven, and it's theirs, not mine"; r3-logger "Marks come down from the town, not from us"; Hetty "Brackmarsh side, not the channel mouth"; Orrin "The marks are cut in, not painted"; Tolm "the share comes off the crop, not out of my pocket".

**Fix.** Broaden B1-ANTITHESIS to catch (a) a sentence-initial Not/No/None/Never fragment immediately following an assertion and (b) the `<clause>, not <clause>` appositive, then cap both at two speakers rather than banning outright — the construction is fine for one or two people and lethal at 22. Rewrite the other 20 by making the correction positive ("The far bank's moved out since the spring. A foot, two at the outside.") or by cutting the qualifier and letting the first sentence stand.

---

## 6. [BLOCKER] amb.hearthollow-elder.* (S8a), amb.brackwater-elder.* (S8b), amb.bowerdeep-elder.base (S8c), amb.cindershelf-elder.base (S8d), amb.duskhollow-elder.base (S8e)

**Problem.** THE FIVE TOWN ELDERS ARE STILL ONE ELDER — 5 of 5. Round three removed tenure-as-a-count from their openers; what survived is the STANCE tenure existed to serve. Every one of the five is an old person being doubted about a specific fact who is not having it, and every one closes the beat by re-asserting that fact against a named or generic doubter. Five towns, five fragments, one temperament — the collision only visible from the role-across-towns vantage, and it is still there.

**Evidence.** Hearthollow: "I watched one drop, come up with nothing, go up, drop again twenty foot along. Thirty. It was thirty foot." and "Mind the gate on your way through... Not this gate. The one down past the mill, where they" | Brackwater: "The water comes up to that mark and it does not go over. Drought year, flood year, same mark. Same mark. Ask me where the line is and I'll walk you down to it." | Bowerdeep: "The lampkeeper will tell you he was lighting that walk before I was born. He was born after me and he knows it perfectly well." | Cindershelf: "...both were gone by the fourth contract. Third was the good one. People get those two the wrong way round." | Duskhollow: "Nine jars of oil last year... Every bill is in the drawer under the window and I add them up myself. Nine is nine." plus "The woman at the inn is thirty years old and she tells me to open my shutters at night."

**Fix.** Assign five different old ages before touching a line, and write the assignment down. One elder is doubted and fights it (keep exactly one — Brackwater's post-mark is strongest). One does not remember and knows it (the Bowerdeep lampkeeper already owns the losing-count device; give confusion to an elder instead of a second insister). One is uninterested in the past and wants to talk about this week. One agrees with everything the player says. One is wrong about a fact another speaker corrects, filling B15's contradiction quota, which currently contains no elder.

---

## 7. [BLOCKER] amb.hearthollow-child.base/.older (S8a), amb.brackwater-child.base (S8b), amb.bowerdeep-child.base (S8c), amb.cindershelf-child.base (S8d), amb.duskhollow-child.base (S8e)

**Problem.** THE FIVE TOWN CHILDREN ARE STILL ONE CHILD — 5 of 5. Every child's beat is the same two-part gesture: a boast of privileged access ("I have / I saw / I'll see it first") plus a thwarting adult who won't take them seriously. Four of five additionally run the identical escalating word-echo. They are separable only by scenery — mill step, boat, moths, mine, shutters. Swap the props and no reader could tell which town any of them is from.

**Evidence.** Privileged access, all five: Tibb "Maren let me hold the survey book" | Jem "I've got a boat name... Corbett hasn't got one and he's been here for ever" | Fitch "One went down my collar and got away out of both hands. Look at my shirt." | Cob "There's a shrine at the bottom of the third shaft bigger than a cart... I've not seen it and nobody's taking me down" | Fay "So if a Wispurr comes past my window I'll see it before anybody." ||| Thwarting adult, four of five: "Da says I'm not to keep on at her about it. I'm going to keep on." / "Auntie Hetty went quiet at her supper when I said it." / "nobody's taking me down, so that's that." / "People keep asking me about the mine." ||| Escalating echo, four of five: "Bigger than a cart. Bigger than two carts. Bigger than the inn." / "Louder than the winch. Louder than anything here." / "Off the moths, off the wings, that's where it comes off" and "poof, poof, poof" / "she wrote her in as a Nibbin. Just Nibbin."

**Fix.** Same method: decide five different childhoods first. Keep exactly one boaster (Tibb — the survey-book beat is the bible's own model line and earns it). Make one child frightened rather than proud. Make one answer a different question than the one asked and wander off. Make one bored and monosyllabic — Cob's "The mine's boring" is the right instinct, then contradicted by two lines of enthusiastic escalation. Make one parrot an adult's opinion verbatim without understanding it. Strip the escalating triple from four of the five; it is one writer's tic wearing five sprites.

---

## 8. [BLOCKER] corpus-wide — measured by merging into a clean HEAD worktree with tools/prose/merge.py --write, then `npx vitest run`

**Problem.** This pass takes the suite from 1 red to 8 red. Seven failures are new and only two of them are the Vellsire speaker amendment the fix authorises. The brief's premise ("2230/2234, and the four reds are test-side amendments the integrator is making separately") is not what this corpus produces, so the integrator is not holding the reds you think they are holding.

**Evidence.** Baseline (previous pass, docs/wip-prose/fragments merged): `Tests  1 failed | 2234 passed (2235)` — only "every declared speaker is actually used (no dead NPC rows)". This pass: `Tests  8 failed | 2227 passed (2235)`. The eight: G2 rule A; "every unaccounted capitalised token resolves to a shipped species"; "the predation-verb lines are exactly the hand-reviewed ones"; "every seasonal claim matches species.json seasonalWindow"; "the Vellsire choice resolves at the last act in ANY calendar year"; "every act-gated line that names a span in years has been read and classified"; "every line that names a count has been read and classified"; overworld-scene.test.ts "the finale, the Vellsire choice and an epilogue all resolve at act 6 in year 11". Merge report: `entries in: 214   original: 212   new: 2` and `STRUCTURAL CHANGES (1) ~ sanctum.vellsire.approach: speaker 'prop-antler-stone' -> 'narration'`; `WROTE data/dialogue.json — {'speakers': 63, 'entries': 214, 'lines': 503}`.

**Fix.** Publish the eight reds as the pass's own deliverable, split into (a) the two Vellsire lookups the fix legitimately invalidates — dialogue.test.ts:1958 `selectEntry(file, "prop-antler-stone", "sanctum", ...)` and overworld-scene.test.ts:1705 `play("prop-antler-stone", "sanctum", "cutscene")`, both of which just need the string changed to "narration" — and (b) the six that are prose defects or gate-coverage losses, listed below. Do not hand the integrator a corpus whose red count doubled without saying so.

---

## 9. [BLOCKER] greaves.finale.loss L0, nessa.quest.restock.offer L2, nessa.quest.restock.done L1, prop.r1-sign-forage L1, amb.hearthollow-child.base L1, amb.brackwater-child.base L2, amb.duskhollow-lampwright.base L2, amb.duskhollow-shepherd.base L2, innkeeper-duskhollow.rest L1

**Problem.** G2 — a "violating one fails the task" guardrail — goes red on six capitalised tokens that resolve to nothing in the game's content, and the stricter companion test hard-fails on one of them. None of the six is an invented species/place/person: three are ordinary sentence-initial words the corpus happens to use nowhere else in lowercase, and "Da"/"Auntie" come verbatim out of the bible's own model lines. So the corpus is not lying — but the gate is red and cannot be closed by editing prose alone, and closing it spends the cap that exists to make widening expensive.

**Evidence.** `AssertionError: expected [ 'Argue', 'Auntie', 'Chalk', …(3) ] to deeply equal []` at dialogue.test.ts:596, offenders `Argue, Auntie, Chalk, Da, Neither, Too`; and `AssertionError: Neither is not a shipped species` at dialogue.test.ts:694. Sources: greaves.finale.loss L0 "…is not affected by it. **Neither** is the view I took of you when we first met…"; amb.hearthollow-child.base L1 "**Da** says I'm not to keep on at her about it. I'm going to keep on."; amb.brackwater-child.base L2 "…and **Auntie** Hetty went quiet at her supper when I said it."; innkeeper-duskhollow.rest L1 "**Argue** about the shutters up the hill, not with me."; amb.duskhollow-lampwright.base L2 "**Too** fine and it will not draw."; nessa.quest.restock.offer L2 "**Chalk**, damp on the third column…". Both "Da" and "Auntie Hetty" are bible-sanctioned: CAST-AND-VOICE.md:936 Tibb's MODEL LINE is "…**Da** says I'm not to ask her again." and :1064 Jem's is "…**Auntie** Hetty's got a board with chalk on it…".

**Fix.** Amend `ORDINARY_WORDS` in tests/unit/dialogue.test.ts with the six, and log the row in docs/DEVIATIONS.md as a G2 allow-list amendment with the bible line numbers as its warrant. The list is currently 36 entries against `expect(ORDINARY_WORDS.length).toBeLessThanOrEqual(45)`, so 42 fits — but note in the row that the pass consumed six of nine remaining slots, because that cap is the only thing stopping the corpus certifying its own vocabulary.

---

## 10. [BLOCKER] maren.keystone.2 L1 (S1-maren.json) — Vellsire chain step 2

**Problem.** The clause added to this line by THIS pass is false against two of the eight stones the line's own immediately-preceding sentence enumerates. It is on the keystone chain, which is the spine of never-cut demo beat #1, and no test covers it (the props and the lecture live in different fragments, so no writer saw both).

**Evidence.** NEW L1: "Somebody set them where that herd used to pass, and whoever cut them was keeping a tally, **because the same six figures are on every one of them.**" (OLD L1 stopped at "…keeping a tally.") L0 enumerates eight stones: "You read one of the stones out on the Reach. There are more. **Another on the Reach**, one on the causeway here, one in the Wilds, one on the steppe, one in the vale, **two on the Approach**." Two of those eight carry no six figures: `prop.r1-antler-south` — "The southern stone is snapped off at about half its height. What is left of the carving is hooves and the bottom of a line" — and `prop.sanctum-approach-antler-inner` — "A second stone further up the road, left unfinished… **the face where the herd would go has not been cut at all.**" The six-figure claim is correct for the other six (`prop.r1-antler-north`, `prop.r2-antler-causeway`, `prop.r3-antler-canopy`, `prop.r4-antler-vent`, `prop.r5-antler-vale`, `prop.sanctum-approach-antler-gate`), which is exactly the six-stone trail Orrin sets: "Meadow Reach, then Brackmarsh, then the Wilds, then the steppe, then the vale, then the Approach."

**Fix.** Scope the clause to the stones that carry the carving — e.g. "…keeping a tally, because the six that still have a face carry the same six figures." Keep it inside the same line count.

---

## 11. [MAJOR] /private/tmp/.../scratchpad/fragments/S9-services.json — innkeeper-hearthollow.rest, innkeeper-bowerdeep.rest, innkeeper-cindershelf.rest, innkeeper-duskhollow.rest (line 2 of each)

**Problem.** Four of the five innkeepers land the identical clause — [Your animals/creatures] + [recovery verb] + [by/at a time of day] — in the same slot of the same beat. The bible's §2 hard cap is two speakers per construction in the whole game, and this frame applies to shapes, not sentences. It slipped every scan: 'Your animals will be right by morning' and 'Your animals will be round by daylight' share a 4-gram and diverge on the fifth word, so the 5-gram overlap check reports clean. CRITICAL for the next pass's plan: all ten service speakers live in this ONE fragment, so a single writer held all five innkeepers at once and they still converged. The brief's root-cause theory ('the five live in five fragments, so nobody has seen more than one') does not apply here, and a by-role cut will not prevent it recurring.

**Evidence.** Aldis: "Bed's at the back and your animals will be right by morning." · Yule: "Your animals come down fit for the evening and that's in the rate, I don't charge separate for it." · Berit: "Your creatures pick up overnight on either side." · Effie: "Your animals will be round by daylight, more or less." Elsbet is the only one who omits it entirely — and hers is the only innkeeper beat I would not want to lose. My cohort scan: the innkeeper 4-gram 'your animals will be' is shared by innkeeper-hearthollow and innkeeper-duskhollow.

**Fix.** Elsbet is the model: she conveys the same information by not conveying it. Decide up front what each innkeeper does INSTEAD of stating the heal, and write the five down: Aldis has already done it and won't be thanked; Yule prices it into the rate and moves on; Berit attributes it to the hot spring rather than to the beds; Effie forgets to mention it and mentions the shutters rule again. At most one innkeeper says the words 'your animals'.

---

## 12. [MAJOR] /private/tmp/.../scratchpad/fragments/S1-maren.json — maren.keystone.2, against /private/tmp/.../scratchpad/fragments/S6-quest-npcs.json — orrin.quest.trail.offer

**Problem.** Maren and Orrin share the antler-stone quest register wholesale: both enumerate the same six regions in the same order in line 1, and both give the same copy-the-face instruction in line 3. Two record-keepers, one quest voice. Orrin's sheet says he describes the physical state of a record before its contents and reads aloud from documents rather than summarising them; Maren's says she gives the age and provenance of a figure before the figure. Neither tic is doing any work here — what is doing the work is a shared errand-giving register that belongs to neither of them.

**Evidence.** maren.keystone.2 L1: "Another on the Reach, one on the causeway here, one in the Wilds, one on the steppe, one in the vale, two on the Approach." · orrin.quest.trail.offer L1: "Meadow Reach, then Brackmarsh, then the Wilds, then the steppe, then the vale, then the Approach." — and maren.keystone.2 L3: "Some season I'll sit at the causeway stone and copy the face off." beside orrin.quest.trail.offer L3: "Copy what you can read, and where you cannot, write that down as well." I attributed Orrin's L3 to Maren in the blind test.

**Fix.** Only one of them enumerates. Orrin should keep the list, because he says where it came from ('I copied that order out of a surveyor's letter of the sixtieth year') and reading a list off a document is his declared tic. Cut the enumeration from maren.keystone.2 L1 and replace it with what she actually has: which of the stones she has physically stood at this season and which she is taking on Orrin's word. That also restores the method-provenance split her sheet is built on. Line counts stay 3 and 3.

---

## 13. [MAJOR] /private/tmp/.../scratchpad/fragments/S8b-amb-brackwater.json — amb.brackwater-elder.base lines 2 and 3

**Problem.** Ulla's grandfather collides with Sel's grandfather inside the same town, and the collision is with load-bearing bible canon. Sel's grandfather appears in six lines across five entries (the card, the four deep places, the lake-beneath-the-lake, the eyeless figure, the Undermere name) and is the spine of the Sel tale chain. Giving the Brackwater elder a grandfather who also cut a mark in the same water is the strongest single reason this beat is unattributable — I assigned it to Sel. It is also a silent deviation from her own voice sheet, which specifies a MOTHER and a different subject: 'Never tells the whole of her mother's story about the pilings.' Under G2 that is a discrepancy for DEVIATIONS.md, not a free change.

**Evidence.** amb.brackwater-elder.base: "I'm not going to talk about my grandfather." / "He cut a mark in it, down at the water line." Against sel.tale.1: "My grandfather marked those four and I mark the same four, only I shifted one of his a foot east." and sel.tale.5: "Here. My grandfather's card, and mine underneath his on the same string." Grep for 'grandfather' across all 13 fragments returns six Sel lines and this one Ulla line — no other speaker.

**Fix.** Restore the mother the voice sheet specifies, and take the mark off the water line so it does not sit in Sel's material at all: her mother cut the mark, and the beat is about the post rather than about what is under the channel. The refusal ('I'm not going to talk about') is good and should stay — it is the most in-voice thing she says. Line count stays 3.

---

## 14. [MAJOR] /private/tmp/.../scratchpad/fragments/S9-services.json — vendor-hearthollow.shop, vendor-bowerdeep.shop, vendor-cindershelf.shop, vendor-duskhollow.shop

**Problem.** Four of the five vendors hinge on the same grievance — master or weighted snares they cannot get — and two of them close on the same construction. Kett and Annis additionally share the verbatim sentence 'None coming.', and Annis's opener is a three-negation list followed by a verdict, which is the B5 cadence the bible bans by name. Separately, Hild and Hesk share one joke: a seasonal bait they are stuck sitting on for half the year. Five stock lists is not five vendors.

**Evidence.** Kett: "Weighted ones when the smith has iron. None since spring. None coming that I've heard of." · Annis: "No master snares since the contract closed. No tonic either. None coming." · Zeb: "Master snares, now. Two a year come up here. Well. One." · Hesk: "Master snare in the drawer these eighteen months." And Hild: "Reed bait, the bundle on the end of the trestle, and it has sat there since the thaw looking at me." beside Hesk: "Wispurr bait only moves in the winter, so I buy it at the autumn and sit on it."

**Fix.** Assign each vendor a different scarcity and write the five down. Annis keeps the snare shortage — it is her whole situation, the Company store next door is boarded, and it is the only place the shortage is load-bearing. Kett's problem becomes the smith's iron rather than the snares; Zeb's is that he oversells what he does have; Hesk's is that the observatory walks past her door to buy direct, which her sheet already gives her. Cut 'None coming.' from one of the two mouths, and rewrite Annis's opener so it is not three negations and a verdict.

---

## 15. [MAJOR] 21 speakers — pell.greeting, orrin.greeting, ives.greeting, amb.bowerdeep-lampkeeper.base, amb.r5-astronomer.base, amb.r2-ferryhand.base, amb.brackwater-elder.base, amb.bowerdeep-logger.base, amb.r4-worker.base, amb.sanctum-approach-scout.base, amb.hearthollow-fenceman.base, amb.brackwater-buyer.base, nessa.greeting, odo.greeting.fishery-low, maren.greeting.*, innkeeper-duskhollow.rest, vendor-bowerdeep.shop, amb.r3-logger.base, greaves.act3.intro, maribel.greeting, wick.greeting.reach-thin

**Problem.** THE TERRITORIAL DEMARCATION OPENER. 21 speakers open a beat by drawing a property line round their own patch of work; 13 do it in the identical two-move form "THAT belongs to them / THIS belongs to me," naming the rival. This is §4 decision 6 ("keep the deference and sharpen it into a rivalry") plus §3's trade-instrument table applied by all thirteen writers to their own slice — the spec offered a device and everyone independently reached for it. 21 speakers against a cap of 2, and it is why the world reads administratively partitioned rather than lived in: nobody's first instinct is anything but jurisdiction.

**Evidence.** Orrin: "Ives has the eyepiece and the ground census, through the arch on the left. I have the shelves." | Bowerdeep lampkeeper: "Pell has the stair. Mine's the walk, and mine is two hundred and eleven." | Pell: "The lantern road's mine. Winding house out to the eastern stair." | Ives: "Two censuses in this building. The one overhead is the sky and belongs to everybody. The one on the ground is animals, and it is mine." | r5-astronomer: "This is the field station. The observatory has the better roof." | r2-ferryhand: "I take the second boat when Sel's is full, which is most days." | Odo: "Hetty has the shallows figure. Hers is better than mine." | Hetty: "That board by the door is mine, all of it, and nobody asked me for a line of it." | Brackwater elder: "My post is the second one past the steps." | Logger: "I'm my own crew, me. One saw, one man." | r4-worker: "Salvage, that's me. On my own out here since the spring." | Scout: "Company scout. My instruction is to write down what comes back down." | innkeeper-duskhollow: "Rule eleven, and it's theirs, not mine."

**Fix.** Cap the explicit "X has the A, I have the B" split at two — Pell/Whit own it by design (§4's deliberate duplicate-sprite rivalry) and Ives/Orrin own it as the observatory feud. Everyone else opens on something that is not jurisdiction: a complaint about weather, a transaction already in progress, a question to the player, a physical action, or mid-sentence in a conversation with somebody else.

---

## 16. [MAJOR] 18 speakers, 42 entries — heaviest in S1-maren (11), S4-brackwater/sel (6), S2-wick (4), S5-cindershelf/bram (4), S6-quest-npcs (orrin 3, gerta 2, tolm, halder, pell)

**Problem.** THE IMPERATIVE BEAT-CLOSER. 18 speakers end a beat on a second-person imperative, and 9 on the narrower move of telling the player where and when to find them again. Two compounding problems: (a) a construction at 18 speakers against a cap of 2; (b) five of the 18 are not licensed for second-person instruction at all under B7 — permission is restricted to Maren, Gerta, Bram, Orrin and explicit shop-tutorial lines — yet the ferryhand, the r5 astronomer, the Brackwater elder, the Bowerdeep innkeeper and the Bowerdeep child all close on one. It also quietly breaks CHECK 5: an ambient crowd whose default exit line is an instruction to the player is a crowd that exists to serve the player.

**Evidence.** Return-invitation, 9 speakers: Maren "Come and see it whenever you're passing." | Wick "Come and find me after dark." and "Come back when your team's slept." | Noct "Come back down when you want." | Gerta "Find me at the third shaft head if you get a day spare." | Halder "Come back either way, because the order stands." | Pell "Ask again before the moths are through." | Orrin "Come up when the six are walked, in whatever order the year gives you." | Sel "Go on, and be back before the evening barge." | Odo "Want me again before dark, stand at the stilts and wait." ||| Unlicensed B7: r5-astronomer "Stand off the east side of the glass while I am reading." | brackwater-elder "Ask me where the line is and I'll walk you down to it." | r2-ferryhand "I'll point it out on the way. You don't have to look." | innkeeper-bowerdeep "Take it up yourself, I've been up twice already."

**Fix.** Strip the return-invitation to two owners (quest-givers who genuinely gate on a return trip: Gerta and Orrin). Everyone else ends on their own business continuing without the player — the barge, the fence, the kettle — which is what CHECK 5 is actually asking for. Add a lint rule counting sentence-initial imperative verbs in a beat's final sentence, capped at 2 unlicensed speakers.

---

## 17. [MAJOR] 18 speakers — amb.r2-ferryhand.base/.quiet, amb.bowerdeep-silkwinder.base, amb.cindershelf-elder.base, innkeeper-brackwater.rest, innkeeper-cindershelf.rest, gerta.warm.testimony, amb.hearthollow-forager.base, amb.r1-forager.late, amb.brackwater-buyer.base, amb.bowerdeep-elder.base, nessa.greeting, amb.duskhollow-shepherd.base, amb.sanctum-approach-scout.base, amb.cindershelf-worker.base, vendor-brackwater.shop, sable.post.loss, maren.keystone.1

**Problem.** ROUND TWO'S VINDICATION STANCE IS NOT GONE — it lost its trigger words and kept its posture. 18 speakers still position themselves against an absent generic collective ("people", "they", "the market", "you'll say") who has it wrong, hasn't asked, or won't believe them, and the beat's job is to set that party right. Round two was 35 entries and condemned the corpus; this is 18 of 62 speakers, the same order as round one's 24-speaker "Nobody…" opener. prose-lint's ABSOLUTE pattern only catches sentence-initial Nobody/Everyone/Nothing/No one, so the identical stance mid-sentence reports zero.

**Evidence.** silkwinder: "And the moths make none of it, whatever the market tells you. Webvern make it. People who have never had a hand on the stuff still want a number for it." | cindershelf-elder: "People get those two the wrong way round." | hearthollow-forager: "...people mix those two up constantly." | Gerta: "The eight has never moved, they tell you. It has." | r2-ferryhand: "People will stand on that bank a quarter hour for his rather than get in with mine." and "...nobody has ever once asked me to open the fare book." | innkeeper-brackwater: "You'll say you won't sleep... Man in the end room last week told me flat he'd not shut an eye. He was snoring through the floor by ten." | duskhollow-shepherd: "You'll not believe that till you've seen the lambs." | brackwater-buyer: "People bring me marsh figures every spring... I price off the channel. Clause four." | Hetty: "That board by the door is mine, all of it, and nobody asked me for a line of it." | bowerdeep-elder: "...he knows it perfectly well." | r1-forager: "Wet springs, I still say."

**Fix.** Cap at two (Hetty's defensiveness is her sheet's stated trait; the Brackwater buyer's indifference to marsh figures is a plot point). For the other 16, delete the wrong third party entirely rather than replacing it — the fact stands without a strawman to beat. Extend ABSOLUTE beyond sentence-initial position and add "people <verb>" / "they tell you" / "you'll say" / "whatever X tells you" / "nobody ever asked" to the SHARED list.

---

## 18. [MAJOR] The ten shopkeepers — innkeeper-{hearthollow,brackwater,bowerdeep,cindershelf,duskhollow}.rest and vendor-{hearthollow,brackwater,bowerdeep,cindershelf,duskhollow}.shop (S9-services)

**Problem.** The ten shopkeepers read as two people, not ten. All five VENDORS share one default emotional stance — aggrieved scarcity — and four of five close on stock they cannot get or trade they has lost. All five INNKEEPERS carry the same put-upon aside about being unappreciated or overruled. Appendix G named this exact tier ("Not children, not innkeepers, not vendors") as where uniformity shows most; the length problem there was fixed and the stance was not.

**Evidence.** Vendors: hearthollow "Weighted ones when the smith has iron. None since spring. None coming that I've heard of." | brackwater "Tonic when I've got it in, and I've none this week. Wet spring. The wet does for the lot of it." | cindershelf "No master snares since the contract closed. No tonic either. None coming." | duskhollow "Master snare in the drawer these eighteen months... The observatory buys its oil off the lampwright direct, and walks past this door to do it." | bowerdeep "Master snares, now. Two a year come up here. Well. One." ||| Innkeepers: hearthollow "Boots are by the fire, they were wringing. Kettle's on. I'll not be thanked for either." | bowerdeep "Take it up yourself, I've been up twice already." | duskhollow "Argue about the shutters up the hill, not with me." and "They had me read all twenty-two out loud before they'd let me sign." | brackwater "...told me flat he'd not shut an eye. He was snoring through the floor by ten." | cindershelf "Hot water's the one thing here nobody's ever been charged for."

**Fix.** The stock report is mechanically required; the grievance attached to it is not. Give two vendors a different relationship to scarcity — one delighted because it has put his prices up, one who genuinely does not know and does not care to find out — and give at least two innkeepers a stance that is not put-upon: one openly pleased to have a guest, one who will not stop talking about something irrelevant to the room.

---

## 19. [MAJOR] odo.post.win L0, wick.act2.pre L1, prop.sanctum-antler-ring L2, amb.r1-forager.base L2 (content-truth gate, dialogue.test.ts:881)

**Problem.** The pass reworded three real predation/grazing claims into verbs the content-truth detector cannot see, and simultaneously introduced a false positive. The claims are still made on screen; the gate that binds them to core/foodweb.ts now covers three fewer entries. This is the failure mode the test file's own header names — a detector going dead while reporting green — and it happened again inside the pass that was supposed to be safe.

**Evidence.** `the predation-verb lines are exactly the hand-reviewed ones, count for count` fails with: `amb.r1-forager.base: 1 diet line(s), reviewed 0` / `odo.post.win: reviewed 1 but has no diet line now` / `prop.sanctum-antler-ring: reviewed 1 but has no diet line now` / `wick.act2.pre: reviewed 1 but has no diet line now`. odo.post.win OLD: "They **eat** the same Reedrick the big ones eat" → NEW: "They **take** the same Reedrick the big ones take" — `PREDATION_VERB` (dialogue.test.ts:803) matches `eats?|ate|hunts?|graze[sd]?|browse…`, not "take". wick.act2.pre lost "Down here they call it the season, and they **eat** off it." prop.sanctum-antler-ring OLD: "the only grass in the Sanctum Fallow that anything has been **grazing**" → NEW: "The grass elsewhere in the Sanctum Fallow stands to the knee." And the new false positive is a human eating lunch: amb.r1-forager.base L2 OLD "I have my dinner against it" → NEW "it's where I stop and **eat**." All three surviving claims are TRUE against the web (Bogling→Reedrick via `webRole` at adult; Fenmaw→Mirefin) — they are simply no longer bound.

**Fix.** Restore a covered verb in odo.post.win ("take the same Reedrick" → "eat the same Reedrick" costs nothing and is Odo's plainer register anyway), and reword amb.r1-forager.base L2 off the word "eat" ("it's where I stop for my dinner"). Then update DIET_LINE_REVIEW for wick.act2.pre and prop.sanctum-antler-ring as deliberate deletions, in the same commented style the COUNT_CLAIM_REVIEW removals already use. Note the same laundering already exists pre-pass and uncovered in amb.brackwater-buyer.base ("Fenmaw **take** Mirefin") and nessa.quest.restock.accepted ("it'll **have** a Bogling **off** you") — widen PREDATION_VERB rather than chase verbs forever.

---

## 20. [MAJOR] wick.greeting.channel-thin (S2-wick-greaves.json, new entry) vs amb.brackwater-buyer.lowseason

**Problem.** Wick's new world-state read states the opposite economics to Corbett's, under the IDENTICAL population gate, in the same room. Both are eligible at once and the player can hear them back to back. Separately, it is the only world-state read at Brackwater with no time gate, while making claims that need elapsed time to be true.

**Evidence.** NEW `wick.greeting.channel-thin`, when = `{"population":[{"node":"r2","lineId":"fenmaw-line","op":"lte","value":1}]}`, L0: "I've carried the channel on my sheet all season and not written a Fenmaw on it once. **The buyers have put their rate up twice since**, and my schedule still shows the old one." `amb.brackwater-buyer.lowseason`, when = `{"yearMin":3,"population":[{"node":"r2","lineId":"fenmaw-line","op":"lte","value":1}]}`, L1: "Mirefin come up thick with nothing taking them and then the channel goes empty. There is a clause for that… and **it sets the price low**." Corbett IS the Brackwater buyer (`{'id': 'brackwater-buyer', 'name': 'Corbett'}`), and the third speaker on the same state agrees with him: amb.r2-ferryhand.apex L1 "**Mirefin are right up under the boat now.**" On timing: r2 ships `fenmaw-line count 3`, so the gate can hold in year 1, at which point "all season" and "twice since" have no elapsed time behind them — every sibling read at this node (sel.docks.rotting, sel.docks.rebuilt, amb.brackwater-dockhand.rot/.rebuilt, amb.brackwater-buyer.lowseason) carries `yearMin: 3` for exactly that reason. Wick's two new entries carry no year or act gate at all, so the CALENDAR_YEAR_CLAIMS test cannot see them either.

**Fix.** Reconcile the direction: if the point is that Wick's schedule is stale, have him say the rate moved and his column did not, without asserting which way the market went — or say it moved DOWN, which is what Corbett's clause and the ferryhand's thick Mirefin both imply. Add `"yearMin": 3` to `wick.greeting.channel-thin` to match every neighbour and make "all season / twice since" true at first firing. (`wick.greeting.reach-thin`'s claims are same-day — "since before light" — so it needs no gate.) Note the `when` object is one of the fields the merge diffs, so this is a repair-plan change, not a prose edit.

---

## 21. [MAJOR] pell.quest.lanternless.offer L1–L2 (S6-quest-npcs.json)

**Problem.** The rewrite deleted the only occurrence of the season word from a seasonal entry, breaking the assertion whose whole purpose is to stop the review table drifting off the copy. The entry is season-gated so nothing false reaches the screen — but the binding between the prose and `species.json` `seasonalWindow` is gone, which is what the test was built to prevent.

**Evidence.** `AssertionError: pell.quest.lanternless.offer: expected 'moths start tonight. gloomoth, up out…' to contain 'autumn'` at dialogue.test.ts:907 — the loop is commented "and the claim actually appears in the entry, so the table cannot drift off the copy". OLD L1: "…a flame won't hold, and **every autumn** I'm short-handed for it." NEW L1: "That many in the air at once and a flame won't hold." `gloomoth-line` seasonalWindow is `autumn`; the entry's own `when` is `{"actMin":3,"seasons":["autumn"],…}`, so it fires only in autumn.

**Fix.** Put the word back inside the existing line count — "every autumn I'm short-handed for it" fits L1, or "one night, this autumn" fits L2. Restoring the word is cheaper and safer than amending the CLAIMS table, because the table is the only thing tying nine entries to species.json.

---

## 22. [MAJOR] sanctum.vellsire.approach (S7-props.json) + data/dialogue.json speakers[] — the `narration` row

**Problem.** The re-attribution works where it matters and I could not break it in the real game path, but it leaves three loose ends, one of which re-arms the exact defect A1 named. The narration row is `kind:"generic"` with `portrait: "prop-antler-stone"` — the standing-stone art is still the art bound to the Vellsire's arrival, so the moment DialogueScene draws portraits (lane B), demo beat #1 gets a picture of a rock over the stag.

**Evidence.** Merged speaker row: `{'id': 'narration', 'name': ' ', 'kind': 'generic', 'role': 'narration', 'portrait': 'prop-antler-stone'}`. Rendering verified end to end: `OverworldScene.playPendingCutscene()` → `autoplayEntryFor(DIALOGUE, this.node.id, this.dialogueCtx())`, and game/dialogue-runner.ts:166 selects on `e.node === node && e.kind === kind` — no speaker term — so the beat fires; DialogueScene.ts:401 `const plate = this.add.text(left, y, speaker?.name ?? …)` then draws `" "`, i.e. a blank plate row, with the box layout unchanged. The two broken assertions are both speaker-keyed test helpers, not game code: dialogue.test.ts:1958 `selectEntry(file, "prop-antler-stone", "sanctum", "cutscene", ctx)` → `expected undefined to be 'sanctum.vellsire.approach'`, and overworld-scene.test.ts:1705 `const approach = play("prop-antler-stone", "sanctum", "cutscene")` → the ending walk returns `[wick.act6.pre, wick.act6.win, maren.finale, maren.epilogue.caught]` with `sanctum.vellsire.approach` missing, and `walked.choiceCount` silently collapses to 0. Sibling sweep: `sanctum.vellsire.approach` is the ONLY `kind:"cutscene"` entry with a prop speaker in the whole corpus (the other cutscenes are maren ×9, greaves ×2, and the two festivals spoken in-character by Judd and Ulla).

**Fix.** Point the two test helpers at "narration" (that also turns the currently-red "no dead NPC rows" test green, so the merge nets +1 there). Give the narration row a portrait that is not a prop — or a sentinel the art lane can see, e.g. `portrait: "narration"` — and log the row in DEVIATIONS.md against A1 so the next lane does not re-bind the rock. Consider a real `kind === "cutscene"` plate exemption in DialogueScene rather than relying on a single space surviving future trims.

---

## 23. [MINOR] /private/tmp/.../scratchpad/fragments/S3-gyms.json — sable.greeting line 2, against /private/tmp/.../scratchpad/fragments/S9-services.json — innkeeper-cindershelf.rest line 1

**Problem.** Sable and Berit have swapped registers. Sable's sheet is 'short bursts with the gaps left in, no softeners, no small talk, no decoration' and 'answers with the shortest true sentence available and then stops'; her greeting is a 175-character hospitable line that opens with a softener and volunteers domestic detail about her own cellar. Berit's line is shorter and blunter than Sable's. Both beats are also built on the same warm-side/cold-side contrast in the same town. Related and worth watching in the same pass: the gym-leader tier was the least differentiated in my blind test — five of nine misses paired a gym leader with someone outside that tier.

**Evidence.** sable.greeting: "Take a coat up. Ground's warm under the west path, warm since the last flare, and my cellar's warm off the same seam. Nine years of that and the walls in there are dry to the touch." · innkeeper-cindershelf.rest: "Vent side's warmer and it shakes. Other side's cold and it doesn't." I attributed Sable's line to Berit.

**Fix.** Cut the cellar and the coat. Sable states the fact and stops: the ground is warm under the west path and has been since the last flare, and Gerta is at the third shaft head. Let Berit keep warm-versus-cold, since it is her stock explanation to guests. Line count stays 2.

---

## 24. [MINOR] /private/tmp/.../scratchpad/fragments/S8b-amb-brackwater.json — amb.brackwater-elder.base, against /private/tmp/.../scratchpad/fragments/S8e-amb-duskhollow.json — amb.duskhollow-elder.base

**Problem.** The elder cohort is much better than the brief expects — the tenure-as-credential opener is genuinely gone and Judd, Dunstan and Ebba are three distinct people. But Ulla and Idony still run one device: an old woman with a private long-run physical record she keeps herself, which does not move, which contradicts what the town says, and which she closes by re-grounding in the object within arm's reach. Two speakers is at the bible's cap rather than over it, so this is a watch item rather than a violation — but it is the residue of 'the five elders are one elder' and it is the thing that will read as a chorus if a third elder ever drifts toward it. Ebba is already halfway there ('People get those two the wrong way round').

**Evidence.** Ulla: "He cut a mark in it, down at the water line. The water comes up to that mark and it does not go over. Drought year, flood year, same mark. Same mark. Ask me where the line is and I'll walk you down to it." · Idony: "Every bill is in the drawer under the window and I add them up myself. Nine is nine." / "There was a wick in my hand when you came through that door." Both end on the proving object in reach.

**Fix.** Do not rewrite either — they are both good lines. Just take one of the two off the closing move: let Idony end on the argument with the innkeeper rather than on the wick in her hand, so only Ulla finishes by producing the object. And note the pairing in DIALOGUE-NOTES.md so the next writer who reaches for it knows the slot is taken.

---

## 25. [MINOR] maren.opening, maren.epilogue.caught, maren.epilogue.released, odo.pre, sel.tale.3, bram.warm.3, pell.quest.lanternless.declined, amb.cindershelf-shafthand.base — plus sable.post.win, sel.tale.5, gerta.warm.testimony

**Problem.** Exact-sentence cap breach at the smallest scale. "Right." opens a beat for SIX distinct speakers across seven entries; "Here." for THREE. The §2 cap is two speakers for any construction, and the existing suite's chorus assertion fails a repeated sentence across three or more speakers — this should not have survived either gate. Six people clearing their throat identically reads instantly as one writer's habit of starting a beat before deciding what it is.

**Evidence.** maren.opening L0 "Right. You came up here after work..." | odo.pre L1 "Right. Bogling first, then Reedrick." | sel.tale.3 L0 "Right. You got your Mirefin inside the year..." | bram.warm.3 L0 "Right. So you got down to the deep shrine." | pell.quest.lanternless.declined L0 "Right. I'll walk it dark, then." | amb.cindershelf-shafthand.base L0 "Right. A vent opens, the ground round it goes soft..." ||| "Here.": sable.post.win L1 "Here. Your badge." | sel.tale.5 L0 "Here. My grandfather's card..." | gerta.warm.testimony L0 "...Here. One reading a shift..."

**Fix.** Keep "Right." for two — Bram and Odo, where the beat is a hand-off mid-work — and cut it from the other four; maren.opening is stronger starting on "You came up here after work." Same for "Here.": keep Sel's and Sable's, cut Gerta's.

---

## 26. [MINOR] corpus-wide — 62 of 87 two-line beats (71%)

**Problem.** Beat silhouette is still a template in the two-line beats, which is nearly half the corpus. 62 of 87 run short-setup → long-payoff. prose-lint's G6-RHYTHM was written against the three-line case (it measures the sub-100 quota only where `len(ls) == 3`) and its second clause only asks that ≥20% of multi-line beats END short. Neither notices the two-line beat has one fixed shape: hook, then paragraph. Three-line beats are genuinely varied by comparison — the longest line lands at index 0/1/2 in 13/32/34 beats — so this is the last uniform silhouette standing.

**Evidence.** innkeeper-brackwater.rest 43 → 169 | amb.r2-ferryhand.quiet 73 → 153 | amb.r2-ferryhand.apex 57 → 153 | amb.hearthollow-elder.bloom 57 → 178 | amb.r4-worker.arrival 86 → 229 | amb.bowerdeep-logger.thin 120 → 182 | amb.r1-forager.bloom 73 → 198 | amb.duskhollow-elder and amb.cindershelf-worker repeat the same ordering across S8b/S8c/S8e.

**Fix.** Invert roughly a third of them: put the substance first and let the short line land second as the thing the speaker adds after they have already said their piece. Extend G6-RHYTHM to the two-line case with a cap near 60% on either ordering, so the fix cannot re-converge on the inverse.

---

## 27. [MINOR] vesper.pre L1 (S3-gyms.json)

**Problem.** A live ledger figure with no `population` clause, which the rewrite has now made invisible to the count-claim gate as well. The HUD can contradict this line on the same screen the moment the player catches a Webvern — the exact defect COUNT_CLAIM_REVIEW exists to catch (D12: "a line that names a count with no `population` clause is a line the HUD can contradict").

**Evidence.** NEW L1: "**Eight in that canopy.** From the ground, with a glass, the last week of summer, walked by me." `data/nodes/r3.json` ships `webvern-line: {count: 8}`, so the figure is true at ship and drifts thereafter; `vesper.pre`'s `when` is `{"flagsUnset":["gym.vesper.beaten"]}` — no population clause. The entry has now fallen off COUNT_CLAIM_REVIEW entirely (`expected […] to deeply equal […]` drops "vesper.pre") because the rewrite changed L0 "three Webvern" → "three **full-grown** Webvern", and the detector regex is `\b<NUM>[- ]…Webvern\b`. The row it fell off was classified "world" for Halder's ORDER — so the live figure in L1 was never the thing being reviewed.

**Fix.** Either add `{"node":"r3","lineId":"webvern-line","op":"gte","value":8}` (a `when` change, so repair-plan not prose), or reword to a non-quoting form ("A canopy that size carries eight, near enough"). Then re-add vesper.pre to COUNT_CLAIM_REVIEW classified "live", with the comment naming L1 rather than L0.

---

## 28. [MINOR] amb.hearthollow-elder.base L2 (S8a-amb-hearthollow.json)

**Problem.** The only line in the merged 503 that ends without terminal punctuation. It is plainly meant as Judd losing the thread mid-sentence, but with no ellipsis or dash it will render in the box as a truncated string — and the corpus has just been through a scripted merge, which is exactly where a truncation bug would come from. A reviewer watching the demo cannot tell craft from corruption.

**Evidence.** NEW L2: "Mind the gate on your way through, the far latch drops if you don't lift it. Not this gate. The one down past the mill, **where they**" — scanning all 503 lines for a terminal `[.!?…—"']` returns exactly one hit, this one. The same beat signals its other trail-off explicitly, with a dash: L1 "Grass does well up there. Always has. **Which is — anyway.**" OLD L2 closed cleanly: "Mind the gate on your way through. Have I told you about the gate."

**Fix.** End it with the mark the same speaker already uses — "…down past the mill, where they —" or an ellipsis. One character.

---

## 29. [MINOR] sable.pre L0 (S3-gyms.json) — pre-existing, unchanged by this pass

**Problem.** The spoken roster order does not match `data/gyms.json` slot order, and game/gym-battle.ts:93 sends the team out in exactly that order. The self-correction that follows repairs the Ashvole's position relative to the first Ashvole but leaves it wrong relative to Stonewing and Pyrelisk. Nothing in the suite checks prose against roster order, so it is green and always has been.

**Evidence.** sable.pre L0: "Ashvole. Cragmar. **Stonewing. Pyrelisk. Then the other Ashvole.** No. The warm one's **second**, she comes out after the first." data/gyms.json sable slots, in order: `ashvole-line A`, `cragmar-line A`, `ashvole-line E`, `stonewing-line A`, `pyrelisk-line A`, signature `pyrelisk-line E`. game/gym-battle.ts:93: `return [...gym.slots, gym.signature];`. The Elder Ashvole is the third unit out, not the second, and it precedes Stonewing and Pyrelisk rather than following them.

**Fix.** Leave it if the misspeak-then-correct is deliberate — but say so in DIALOGUE-NOTES so the next auditor does not re-file it. If it is to be true, "Ashvole. Cragmar. Then the warm one — she's the second Ashvole. Stonewing. Pyrelisk." is the data order in Sable's register. Worth adding a cheap gate: for each `*.pre`, assert every species named appears in that leader's roster.

---
