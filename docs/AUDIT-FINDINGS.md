# Cross-corpus audit findings — 105 unique, blockers first

Six adversarial auditors read the finished 13-fragment corpus as a whole, each on a different
lens. Findings are CLAIMS to verify. Three were re-measured independently by the integrator and
are confirmed: the line-length collapse, the chorus, and the 400-character schema breaches.

## 1. [BLOCKER] tolm.quest.fallow.done.short (S6-quest-npcs.json)
*(found by `?`)*

**Problem.** G7 breach by placement. This is the depletion branch of the fallow-field quest — the fallback that fires whenever the Loamunder count is under 24 at turn-in — and its first line pre-rebuts the player over a population outcome. "I said it to you twice over before you agreed to it" answers an objection the player has not made, which casts the player as someone about to argue about their own catching. It is the only place in 500 lines where a character is short with the player's choices, and it lands at exactly the moment G7 exists to protect. The gate makes it worse: `when` is {"flagsSet":["quest.fallow-field.turnin"],"flagsUnset":["quest.fallow-field.done"]} with NO population condition (the .kept twin at priority 60 carries the gte-24 gate, so .short is the catch-all). The count can fall below 24 through predation and year-turn sim with the player never having touched a Loamunder — and this line then reminds them of terms they did not break. The beat also closes on a melancholy note immediately after a failure, which reads as "and you weren't there either."

**Evidence.** L0: "The field came in short of twenty-four, so the share doesn't come off the crop this year. We set the arrangement out that way between us, and I said it to you twice over before you agreed to it, so I'll keep to it."  ||  L2: "I'll be walking that fence line at the turn either way. I've walked it every year since my father had the four fields, and there's been nobody to walk it with me for most of them."

**Proposed fix.** Cut the rebuttal clause. Tolm reports the count and the consequence and moves on to his own business: "The field came in short of twenty-four, so the share doesn't come off the crop this year. That was the arrangement." Then straight into L1's east-field sowing. Also end L2 on "I'll be walking that fence line at the turn either way" — fact and business, which is what F3 wants — and move the lonely sentence elsewhere or drop it.

---

## 2. [BLOCKER] maren.epilogue.caught / maren.epilogue.released (S1-maren.json)
*(found by `?`)*

**Problem.** G7 breach by framing, in the game's final judged beat. The same mechanic is described against two different baselines, each chosen so releasing looks better. The caught branch baselines against the released state, so catching is stated as a shortfall; the released branch baselines against the empty Sanctum, so releasing is stated as a gain. Neither uses the honest common comparator, the thirty-year status quo. Reframed symmetrically both sentences stay true and neither carries a valence — which proves the valence is authored, not factual. Prosody doubles it: the released branch opens on three sentences of observed image and an awe beat, the caught branch on two flat clauses. The terminal moment of the game therefore delivers, by comparator choice and sentence rhythm, exactly the verdict G7 forbids any line from stating. Invisible per-slice; it exists only in the pair.

**Evidence.** caught L2: "With that animal in a snare, the ground round the Sanctum and along the Approach goes back to doing what it does on its own. Whatever lives out there will bring on fewer young than it would with the stag loose in there."  ||  released L2: "And while that animal is out there loose, whatever lives in the Sanctum and along the Approach will bring on half again as many young as it would with the place empty."  ||  caught L0: "You've got the stag, then. It won't age."  ||  released L0: "The stag went up the scarp and over the rim and out of sight. It stopped the once at the top, side on, long enough for me to see the whole of it against the sky. I had a pencil in my hand the entire time and I never wrote a thing down."

**Proposed fix.** Baseline both branches on the same thirty-year status quo. Caught: "…the ground round the Sanctum and along the Approach goes on bringing young on at the rate it has for the thirty years I've been walking it." Released: "…will bring on half again as many young as it has in any of the thirty years I've been walking it." Both true, both neutral. Then give the caught branch an equal-weight observed image in L0 — Maren looking at the animal in front of her the way she looks at it going over the rim — so the two endings are written at the same temperature.

---

## 3. [BLOCKER] amb.brackwater-netmender.base, vesper.post.win, odo.post.win
*(found by `?`)*

**Problem.** Three lines exceed the schema's hard cap. core/dialogue-schema.ts:346 is `text: z.string().min(1).max(400)`. validateDialogueFile() will throw on load, which fails dialogue.test.ts's very first assertion ("accepts the shipped data/dialogue.json") and takes the whole suite down before any other finding can be evaluated. The old corpus had max 229; the new one has max 443.

**Evidence.** amb.brackwater-netmender.base line[2] = 443 chars: "People come down here and ask me what's going on with the animals out on the marsh. The water's colder than it was when I started, and that's all it is. Colder water, and what comes up in a net comes up smaller, so I've taken the mesh down a gauge and I'll take it down again before I'm finished. I've had a hand in that water every winter I've worked these boards. It comes up through the gaps at a high tide and there's no keeping out of it." — vesper.post.win line[0] = 414 chars; odo.post.win line[0] = 413 chars.

**Proposed fix.** Split each of the three into two lines, or trim to ≤400. Splitting costs 3 lines (500→503), still inside the 400–560 band, but then `raw._counts.lines` must be updated to match (dialogue.test.ts:145 asserts it true against the file). Do NOT raise the zod cap — the schema comment ties 400 to "must fit the 480×320 dialogue box" and DialogueScene's paging math is built on it.

---

## 4. [BLOCKER] tolm.quest.fallow.offer (choice text)
*(found by `?`)*

**Problem.** The G7 moralizing tripwire fires on a player choice. MORALIZING_PATTERNS includes `{ name: "how-many-more", re: /\bleave them be\b|\bhow many more\b/i }`, and ALL_TEXTS is built from `e.lines` AND `e.choices` (dialogue.test.ts:98). The test "no shipped line matches a moralizing pattern" will fail. Appendix C3 named this exact string as banned, "even inside a negating sentence". It is worse than a token collision: making the player's own choice "I'll leave them be" frames restraint as the virtuous option, which is the G7 sentiment the token list exists to proxy for.

**Evidence.** "choices": [ { "text": "I'll leave them be." }, { "text": "Let me think about it." } ] — and Tolm's own line in the same entry already says it cleanly: "So: leave them alone until harvest, and I pay you a share of the crop."

**Proposed fix.** Reword the choice to Tolm's own register, e.g. "I'll leave them alone till harvest." That is a business term the player is agreeing to, not a moral posture, and it dodges the pattern. Then sweep the other 19 choice texts against MORALIZING_PATTERNS — the writers appear to have scanned lines but not choices.

---

## 5. [BLOCKER] corpus-wide (G2 rule A)
*(found by `?`)*

**Problem.** Simulating dialogue.test.ts's rule-A scan over the merged corpus yields 13 capitalised tokens that resolve to nothing in shipped data or any capped allow-list. Five are cast names newly spoken aloud (Appendix C5 anticipated this and specifies a new CAST_NAMES list, cap 48); six are ordinary English words that appear ONLY sentence-initially, so rule (c) cannot clear them and they must go into ORDINARY_WORDS, which is capped at 45 and currently holds 36. Rule B (multi-word places) is clean — 0 offenders.

**Evidence.** RULE A OFFENDERS: ['Anyone', 'Aye', 'Corbett', 'Effie', "Effie's", 'Ingram', "Key's", 'Lantern', 'Otherwise', 'STAR', 'Whit', 'Zeb', "Zeb's"] — e.g. amb.brackwater-child.base: "Corbett buys everything the boats bring in"; amb.bowerdeep-elder.base: "Whit will tell you he has been lighting that walk since before I was born"; amb.cindershelf-miner.base: "Warm? Aye, the third shaft's warm."; prop.duskhollow-sign-observatory: "STAR CENSUS — ground identities, recorded and dated."

**Proposed fix.** Add CAST_NAMES (cap 48) carrying all 41 Appendix D names per C5, with the one-way assertion C5 specifies (speakers[].name resolves INTO the list; the list is never sourced FROM raw.speakers). Separately add exactly six to ORDINARY_WORDS — Anyone, Aye, Key, Lantern, Otherwise, Star — taking it to 42 of 45. Leave BIBLE_NAMES (6) and COINED_NPC_NAMES (7) untouched.

---

## 6. [BLOCKER] tolm.quest.fallow.offer (choice text) — S6-quest-npcs.json
*(found by `?`)*

**Problem.** The rewrite introduced a G7 regression on the PLAYER'S OWN CHOICE. `MORALIZING_PATTERNS` entry `how-many-more` is `/\bleave them be\b|\bhow many more\b/i`, and Appendix C3 explicitly warned it fires even inside an innocent sentence. `tests/unit/dialogue.test.ts` "no shipped line matches a moralizing pattern" scans `ALL_TEXTS`, which includes `choices[].text`. The suite goes red. Worse than the red: this is the only place in the game where the player's own words are put in a moral register — choosing to honour a farming contract is rendered as a merciful abstention.

**Evidence.** NEW: ">> I'll leave them be. -> tolm.quest.fallow.accepted"   OLD (data/dialogue.json, clean): ">> I'll leave the field alone."

**Proposed fix.** Revert to a business phrasing. "I'll leave the Loamunder where they are." or "I'll leave the field alone." Then re-run the whole-corpus scan for the other banned tokens (`deserve`, `blame`, `lesson`, `worth it`, `know when to`), which I confirm are otherwise clean at 0 hits.

---

## 7. [BLOCKER] corpus-wide — six hand-maintained registers in tests/unit/dialogue.test.ts
*(found by `?`)*

**Problem.** Appendix C2 required every rewritten entry to be re-audited against six registers and the maps updated IN THE SAME COMMIT. This was not done, and four of the registers assert exact set equality, so they cannot be partially right. I replayed each register's own regex over the new corpus. DIET_LINE_REVIEW: 10 diffs. ACT_GATED_YEAR_CLAIMS: 13 diffs. CALENDAR_YEAR_CLAIMS: exact-set-equality, 3 extra / 2 missing. COUNT_CLAIM_REVIEW: exact-set-equality, 30 unclassified entries against 13 classified, plus 4 stale rows. FLORA_CLAIM_REVIEW: exact-set-equality against `/\bflora stock\b/i`, which now matches ZERO entries because 'flora stock' was correctly deleted as system vocabulary — so all four rows are dead and the test reds.

**Evidence.** DIET_LINE_REVIEW gains: innkeeper-duskhollow.rest, maren.starter.puddlisk, maribel.greeting. Loses: amb.cindershelf-elder.base, amb.hearthollow-elder.base, amb.r1-forager.bloom, maren.crash-survey, odo.post.win, sel.quest.wager.accepted, vendor-bowerdeep.shop. — CALENDAR extra: amb.brackwater-buyer.lowseason, amb.r1-forager.bloom, bram.mine.expanding; missing: amb.brackwater-dockhand.rebuilt, amb.r1-forager.late. — COUNT unclassified sample: amb.brackwater-buyer.base "The warden had three Fenmaw out in that marsh"; maren.crash-survey "There have been three Stonewing on the west scarp"; maribel.greeting.reach-thin "I've got the same nine Nibbin I had in spring"; ives.greeting "There are two censuses in this building". COUNT stale: gerta.greeting, prop.r2-idol-shallows, tolm.quest.fallow.done.kept, wick.act6.win. — FLORA actual: [] vs expected ['amb.r1-forager.bloom','gerta.quest.crash.done','maren.greeting.act1','maren.keystone.4'].

**Proposed fix.** Re-audit and rewrite all six maps in the integration commit. Two are not mechanical: (a) FLORA_CLAIM_REVIEW's detector must change from the literal 'flora stock' to whatever the copy now says ('the green', 'the growing', 'what's growing'), or the whole describe block is retired with a DEVIATIONS row saying why; (b) every one of the 30 new COUNT hits must be classified live/world by hand, and the three that quote a node population — maribel.greeting.reach-thin, maren.crash-survey, amb.brackwater-buyer.base — must be checked to already carry a `population` clause (they do; keep them as `live`). Also note the D19 side effect: greaves.finale.pre, wick.act3.win, wick.act6.win and maren.epilogue.released ALL lost their run-length year claims, so "the run-length claims an act gate can falsify are exactly the four named" now passes vacuously — the rewrite silently fixed D19 and nobody logged it.

---

## 8. [BLOCKER] odo.post.win — S3-gyms.json
*(found by `?`)*

**Problem.** A diet claim that `core/foodweb.ts` does not derive, introduced by the rewrite, and it escapes DIET_LINE_REVIEW because "live on" is not in PREDATION_VERB — so it ships unchecked. I ran the derivation: at `brackwater` the only mirefin edge is `mirefin-line -> reedrick-line`, and `floraFeeders` is `reedrick-line` alone. Odo's line asserts Bogling (the J form of mirefin-line) feeds on flora AND on Sporantle. Both halves are contradicted by the derivation. The old copy said only "Bogling grazes" and named no prey.

**Evidence.** NEW: "— The small ones, now. They live on weed and on Sporantle off the bottom, and they stay that size about a year."   OLD: "You read the metamorphosis. Bogling grazes, Mirefin hunts, and the marsh still counts them as one line either way."   DERIVED (brackwater): mirefin-line -> reedrick-line ; reedrick-line -> sporantle-line ; fenmaw-line -> mirefin-line, reedrick-line ; floraFeeders: reedrick-line

**Proposed fix.** Rewrite to a claim the web produces: the small ones take Reedrick off the reed edge, same as the big ones, only smaller ones. Then add the entry back to DIET_LINE_REVIEW with its new count and add a DIET_CLAIMS row `{entry:"odo.post.win", node:"brackwater", predator:"mirefin-line", prey:"reedrick-line"}`. While you are in DIET_CLAIMS, add the true-but-unregistered `{entry:"gerta.quest.crash.done", node:"r4", predator:"pyrelisk-line", prey:"cragmar-line"}` — I confirmed pyrelisk->cragmar IS derived at r4, but the copy asserts it with no row.

---

## 9. [BLOCKER] maren.starter.cindril / .puddlisk / .thornlet — S1-maren.json
*(found by `?`)*

**Problem.** `tests/unit/dialogue.test.ts` "the starter age-form years match balance.json age.yearsInClass" derives adultYear and elderYear from `balance.json` `age.yearsInClass = {J:1,A:1,E:1}` — so each starter body must contain the words "two" AND "three". The new copy contains neither in two of three entries. Three assertions fail. It is also a player-facing regression: the game no longer tells the player at what age its starter changes form, and this is the front door of the Legacy beat.

**Evidence.** NEW cindril: "Yours will be a Vulkindle by this time next year, and a Pyrevane the year after that." NEW puddlisk: "Rillisk next year, then Maelstrisk the year after that." NEW thornlet: "Bramblore next year, then Thornwald the year after."   OLD cindril: "It becomes Vulkindle at two and Pyrevane at three."   Measured: cindril has "two"? False / "three"? True (incidental). puddlisk: False / False. thornlet: False / False.

**Proposed fix.** Put the numerals back in speech, which costs nothing in plainness: "It'll be a Vulkindle at two and a Pyrevane at three, and it's the same animal the whole way through." Do the same for Puddlisk and Thornlet.

---

## 10. [BLOCKER] sanctum.vellsire.approach — S7-props.json (Appendix A1, unfixed)
*(found by `?`)*

**Problem.** Appendix A1 named this as a live defect requiring re-attribution to a narration speaker. The fragment's own `_rules` forbid changing `speaker`, so the prose pass could not fix it and nothing else did. `game/scenes/DialogueScene.ts:401` draws the name plate from `speaker?.name` with no cutscene exemption and a comment saying it is deliberately never a description. The result: never-cut demo beat #1 — the Vellsire walking down into the ring, the shot the judged video is built around — renders with the nameplate "Antler Standing-Stone" above it. The new prose makes it worse than the old, because it is now pure third-person cinematic narration in a rock's mouth.

**Evidence.** Fragment: `--- [sanctum.vellsire.approach] speaker=prop-antler-stone kind=cutscene node=sanctum` / L1: "The stag comes down into the ring from the high side of the caldera, and it does not hurry any part of the way down."   DialogueScene.ts:399-401: "// The name plate is the speaker's own `name` from the corpus's speaker table — never a description..." `const plate = this.add.text(left, y, speaker?.name ?? currentLine(this.file, this.state).speaker, {...})`

**Proposed fix.** Two lines of work outside the prose scope: add a `narration` speaker row to `data/dialogue.json` `speakers[]` with an empty or blank display name, re-point `sanctum.vellsire.approach.speaker` at it, and either give DialogueScene a `kind === "cutscene"` plate exemption or let a blank name suppress the plate. Sweep for any other `kind: "cutscene"` entry whose speaker is a prop.

---

## 11. [BLOCKER] corpus-wide
*(found by `?`)*

**Problem.** The corpus collapsed onto a uniform ~274-character line. Measured over all 500 lines: mean 101 → 274 chars, median 98 → 274, sd 28 → 73, IQR 215–331. The shortest line in the entire game is 93 characters; 404 of 500 exceed 200. By speaker kind the effect is worse, not better: generic speakers (innkeepers, vendors) now average 310 chars — LONGER than Maren's 278 — and every child speaks in 200–370-char paragraphs (bowerdeep-child: 333/370/246). Appendix F licensed length as a ceiling for lines that need it; the corpus applied it as a floor to everything, which is the brief's own diagnosed failure with the sign flipped. Real speech alternates long and clipped; with no line under 93 chars there is no emphasis anywhere. It also doubles the reading burden: at the shipped dialogue box (dialogueColumns = floor((464-16)/6) = 74 cols, bodyLines = 3, game/scenes/DialogueScene.ts:85-95,126-172) advance-presses go 501 → 869, and 368 of 500 lines now break mid-sentence across two pages — including the demo-video beats.

**Evidence.** Shortest 12 lines in the whole corpus start at 93 chars ('Ashvole. Cragmar. Then the old Ashvole, and she's the warmer of the two. Stonewing. Pyrelisk.'). Typical generic line, innkeeper-bowerdeep.rest L1, 296 chars: "You sleep the daylight through, and the ones you brought in come down fit for the evening. Key's on the hook by the stair, take it up yourself, I'm not walking up there twice. And if you want the room again tomorrow, tell me before you go out tonight. Otherwise it's let at dawn to somebody coming off the market." Old corpus for comparison: mean 101, sd 28, max 229, 499/500 lines fitting one page.

**Proposed fix.** Re-cut for VARIANCE, not for length. Target a bimodal distribution: keep the 250–350-char paragraphs for Maren, Sel, Greaves, Orrin and the lore beats where the length is doing work, and push the ambient/generic/child/prop lines back toward 90–180 so the long ones land. Concretely, aim for sd ≥ 90 and at least 120 lines under 140 chars. Every ambient speaker's three lines should not all be the same size — give each at least one short one. Then re-measure pages: the goal is well under 600 total advance-presses.

---

## 12. [BLOCKER] corpus-wide
*(found by `?`)*

**Problem.** The chorus the measured diagnosis capped at two speakers is back, as a shared BEAT-CLOSER shape rather than a shared sentence. 71 of 212 entries end their final line on the same move — a recurring, low-stakes friction with a third party who says or does the same thing over and over — spread across 39 of 62 speakers. Per ambient slice: Hearthollow 12/14, Brackwater 13/13, Bowerdeep 6/7, Cindershelf 7/8, Duskhollow 6/7. Two sub-shapes account for nearly all of it: (a) 'and I've told him twice / I'll tell him again' and (b) 'and I've stopped / given up / never asked'. DEFECT 2's cap was 'no construction may be shared by more than TWO speakers in the entire game'; this is at 39. The existing chorus check in dialogue.test.ts fails a shared SENTENCE and cannot see a shared SHAPE (Appendix C6 predicted exactly this).

**Evidence.** Shape (a): amb.hearthollow-farmhand.base closes "I've told him that twice." · amb.brackwater-elder.base closes "I've told him where the bucket goes. I'll tell him again tomorrow." · amb.r1-forager.late closes "I still say it's the wet springs, and I've told her so twice, and she just says her bit again the year after." · amb.bowerdeep-elder.base closes "I have put all of this to him plainly and I shall put it to him again when he next comes past with his ladder." · amb.duskhollow-elder.base closes "She agreed with me both times and I'm still buying the oil." · amb.bowerdeep-child.base closes "he's said next time three times now, and I'm still stood here minding it." · amb.cindershelf-shafthand.base closes "I'm on nights six days in eight and I've put in twice to be moved." Shape (b): amb.bowerdeep-silkwinder.base "Now two of the other stalls have got hold of it, and I've stopped wasting my breath." · amb.r4-worker.base "I've given up putting the lids back on." · amb.hearthollow-forager.base "I've not found anything that helps it, so I've given over looking." · amb.hearthollow-fenceman.late "I've not measured it and I'll not be measuring it." · amb.brackwater-dockhand.rebuilt "nobody actually told me it had, so I'm not going to be the one who brings it up." · amb.cindershelf-miner.base "The boss has had me on the low workings ever since, and I've never asked him to move me."

**Proposed fix.** Enforce the two-speaker cap on this shape the way the diagnosis enforced it on the old ones. Allow it for at most two speakers per settlement (it is a real and good move — it earns its place in Bowerdeep's Dunstan/Whit rivalry and in the r1-forager/tracker dispute), and re-close the rest on something structurally different: a piece of unfinished business, a flat observation with no comment attached, a question the speaker asks and does not wait for, an instruction to nobody in particular, or simply stopping mid-thought. Add the shape scanner Appendix C6 specifies so this cannot silently regrow.

---

## 13. [BLOCKER] amb.brackwater-netmender.base · vesper.post.win · odo.post.win
*(found by `?`)*

**Problem.** Three lines exceed the schema's hard 400-character cap. core/dialogue-schema.ts:346 is `text: z.string().min(1).max(400)`. validateContent runs at boot and BootScene.ts:111 renders 'CONTENT VALIDATION FAILED'. Merging these fragments as they stand does not red a test — it bricks the game on launch, including in the demo video.

**Evidence.** amb.brackwater-netmender.base L2 = 443 chars: "People come down here and ask me what's going on with the animals out on the marsh. The water's colder than it was when I started, and that's all it is. Colder water, and what comes up in a net comes up smaller, so I've taken the mesh down a gauge and I'll take it down again before I'm finished. I've had a hand in that water every winter I've worked these boards. It comes up through the gaps at a high tide and there's no keeping out of it." · vesper.post.win L0 = 414 · odo.post.win L0 = 413.

**Proposed fix.** Cut each to ≤400. All three are already two-page lines, so the cut costs nothing in pacing — the netmender's last sentence ('It comes up through the gaps at a high tide and there's no keeping out of it.') and Vesper's 'and I have looked, because tonics are not cheap and I buy a great many of them' are each removable without touching the information. Then add a hard `max(400)` assertion to the fragment pipeline so this cannot recur.

---

## 14. [BLOCKER] corpus-wide (tests/unit/dialogue.test.ts)
*(found by `?`)*

**Problem.** The corpus reds the shipped dialogue gate in five separate assertions. I ran the test's own regexes and registers against the fragments. (1) G2 rule A: 13 offenders. Five are newly SPOKEN cast names — COINED_NPC_NAMES holds 7 and is capped at 8, and Appendix C5's `CAST_NAMES` list (cap 48) has not been added. Six are ordinary sentence-initial words missing from ORDINARY_WORDS (36/45, so they fit). (2) DIET_LINE_REVIEW: 10 diffs. (3) COUNT_CLAIM_REVIEW: 30 unclassified entries + 4 stale rows. (4) ACT_GATED_YEAR_CLAIMS: 13 diffs. (5) CALENDAR_YEAR_CLAIMS: 3 new + 2 stale. Appendix C warned these registers assert exact set equality and 'must be updated in the same commit'; nothing in the fragments indicates that was done. Rule B (multi-word places) passes clean, and the G7 vocabulary scan is clean at 0 hits.

**Evidence.** Rule A offenders: Corbett (amb.brackwater-buyer.base, amb.brackwater-child.base, festival.brackwater), Effie / Effie's (amb.duskhollow-elder.base), Ingram (amb.duskhollow-elder.base, vendor-duskhollow.shop), Whit (amb.bowerdeep-elder.base), Zeb / Zeb's (amb.bowerdeep-child.base, amb.bowerdeep-silkwinder.base), plus Anyone, Aye, Key's, Lantern, Otherwise, STAR. DIET_LINE_REVIEW sample: "amb.hearthollow-elder.base: reviewed 1 but has NO diet line now", "maren.crash-survey: reviewed 1 but has NO diet line now", "innkeeper-duskhollow.rest: NOW 1 diet line(s), reviewed 0". ACT_GATED_YEAR_CLAIMS sample: "maren.starter.cindril: NOW 1, reviewed 0", "sel.quest.wager.offer: reviewed 1 but names no year span now".

**Proposed fix.** Land the Appendix C5 `CAST_NAMES` list (all 41 names, cap 48, with its own collision assertions) rather than raising COINED_NPC_NAMES; add Anyone/Aye/Key/Lantern/Otherwise/Star to ORDINARY_WORDS (lands at 42/45); and re-derive all four content-truth registers from the new text in the same commit, re-reading each new row rather than pasting the computed set. Note that 26 of the 30 COUNT hits are the ordinary-English false positives C2 predicted ('one of them', 'two of them', 'one standing') and classify as `world` — but see the Corbett finding below for the one that is real.

---

## 15. [BLOCKER] amb.brackwater-netmender.base (line 2), vesper.post.win (line 0), odo.post.win (line 0)
*(found by `?`)*

**Problem.** Three lines exceed the schema's hard 400-character cap on line text (443, 414, 413). core/dialogue-schema.ts:346 is `text: z.string().min(1).max(400)`. On merge, validateDialogue() throws DialogueValidationError, BootScene.ts:111 shows CONTENT VALIDATION FAILED, and tests/unit/dialogue.test.ts:136 `it("accepts the shipped data/dialogue.json")` fails before any other assertion in the file gets to run. Appendix F's 'let lines be longer' was read as 'no ceiling'; the ceiling is 400 and it is enforced by zod, not by taste.

**Evidence.** amb.brackwater-netmender.base[2] (443 chars): "People come down here and ask me what's going on with the animals out on the marsh. The water's colder than it was when I started, and that's all it is. Colder water, and what comes up in a net comes up smaller, so I've taken the mesh down a gauge and I'll take it down again before I'm finished. I've had a hand in that water every winter I've worked these boards. It comes up through the gaps at a high tide and there's no keeping out of it."  ·  vesper.post.win[0] (414): "...A tonic lifts it straight off. I have not found anything else that does, and I have looked, because tonics are not cheap and I buy a great many of them."  ·  odo.post.win[0] (413): "Fair fight, and you had the better of it. ... Same fish. I've had the one animal in my hands at both sizes."

**Proposed fix.** Cut each to <=400 without losing the content. The netmender's line loses nothing by dropping "and that's all it is" and "I've had a hand in that water every winter I've worked these boards" (the wet-hands detail already lands in the last sentence). Vesper's loses nothing by ending at "...I have looked." Odo's loses nothing by dropping "Fair fight, and you had the better of it." — the badge line that follows already concedes. Then add a length assertion to the writer's own checklist: `max(len) <= 400` is a one-line check and it would have caught all three.

---

## 16. [BLOCKER] corpus-wide (at least 35 entries, 27 of 62 speakers)
*(found by `?`)*

**Problem.** THE CHORUS. Every beat that is not an instruction ends on the same rhetorical move: the speaker reports having raised something with an authority, a neighbour or a relative, and reports that nothing came of it. It is deployed by the magnate, the warden, the rival, both children in three of five towns, four of five town elders, the ferryman, the fisherman, the gym leader, the dockhand, the lampwright, the silk-winder and the salvage worker. Individually each line is plain, literal and unclever — it passes F1, F2, F3 and prose-lint with zero flags. Collectively it is one writer's hand visible in 27 mouths, which is precisely the defect §2's hard cap names: 'no construction may be shared by more than two speakers in the whole game… This applies to rhetorical frames, not merely to sentences.' The first corpus ended every beat on a wry epigram; this one ends every beat on a wry grievance. Same slot, same function, same tell. Supporting measure: the word 'twice' appears 52 times across 24 of 62 speakers, almost always as 'I told/asked him twice' — the tic that carries the shape.

**Evidence.** greaves.act4.steppe: "...the board has read the first one every year and has never once asked me about the second." · maren.greeting.act6: "I've asked every person out here I can think to ask, and nobody has been able to tell me a thing." · maren.keystone.2: "I've asked in five towns now and I've never found anybody who could tell me either." · wick.act5.win: "They agree with me at intake and then go off and do it however they were going to do it anyway." · vesper.pre: "I have asked the council to put both of those figures on the same page and so far nobody has." · noct.greeting: "...neither one has ever once asked me what I think." · sel.docks.rotting: "I've told the harbourmaster about those two pilings twice. He has written back both times to say that he agrees with me. ... I still don't know what a man is meant to do with a letter." · amb.hearthollow-farmhand.base: "I've told him that twice." · amb.r1-forager.late: "I've told her so twice, and she just says her bit again the year after." · amb.duskhollow-elder.base: "She agreed with me both times and I'm still buying the oil." · amb.duskhollow-lampwright.base: "...I put a card in the box with the gauge on it, and people throw the card away." · amb.bowerdeep-child.base: "...he's said next time three times now, and I'm still stood here minding it." · amb.brackwater-dockhand.rebuilt: "...nobody actually told me it had, so I'm not going to be the one who brings it up." · amb.cindershelf-shafthand.base: "I'm on nights six days in eight and I've put in twice to be moved."

**Proposed fix.** Cap the shape the way §2 caps every other one: at most two speakers in the corpus. That means rewriting roughly 30 terminal beats onto shapes that are not grievances. The available registers are already in the corpus and underused — end on an instruction (bram.warm.3 'Mind the last ladder, third rung's split.'), on business (maren.finale 'Go on up. I'll not keep you.'), on an enthusiasm (nessa.quest.restock.done's new pencil), on a plain unfinished thought (sel.tale.3 '...and then he died, so.'), on a straight fact with no complaint attached, on a boast (amb.r2-ferryhand.base 'His boat is not faster.'), or simply mid-subject. Do the pass with all 212 last sentences printed in one column — the shape is invisible per slice and obvious in a list. Separately, cut 'twice' from at least 15 of its 24 speakers; it is one person's counting habit, not a regional one.

---

## 17. [BLOCKER] corpus-wide (G2 gate, tests/unit/dialogue.test.ts:566)
*(found by `?`)*

**Problem.** G2 rule A fails on eleven unaccounted capitalised tokens. Five are the new cast names spoken aloud by other characters — Appendix C/D require a NEW capped CAST_NAMES list for exactly this, and the working-tree test still ships only the seven-name COINED_NPC_NAMES with its cap asserted at 8, so the names cannot be added to the existing list either. Six are ordinary English words that appear only sentence-initially, so rule (c) cannot clear them; ORDINARY_WORDS is at 36 of its cap of 45, so those six fit, but nobody added them.

**Evidence.** Unresolvable coined names: Ingram x4 (amb.duskhollow-elder.base, vendor-duskhollow.shop), Corbett x3 (amb.brackwater-buyer.base, amb.brackwater-child.base, festival.brackwater), Zeb/Zeb's x3 (amb.bowerdeep-child.base, amb.bowerdeep-silkwinder.base), Whit x2 (amb.bowerdeep-elder.base), Effie/Effie's x3 (amb.duskhollow-elder.base). Unresolvable ordinary words: "Lantern" (pell.greeting "Lantern road's mine." — corpus has lowercase 'lanterns' but never 'lantern'), "STAR" (prop.duskhollow-sign-observatory "STAR CENSUS"), "Anyone" (same entry), "Aye" (amb.cindershelf-miner.base "Warm? Aye, the third shaft's warm."), "Key's" (innkeeper-bowerdeep.rest "Key's on the hook by the stair"), "Otherwise" (same entry). Rule B (multi-word places) is clean.

**Proposed fix.** Add the CAST_NAMES list Appendix D specifies — a new capped list, not a raise of COINED_NPC_NAMES, whose cap of 8 exists to hold a property. Only the names actually SPOKEN need slots (display names are not scanned): Ingram, Corbett, Zeb, Whit, Effie — five, not forty-one. Then add Lantern, Star, Anyone, Aye, Key, Otherwise to ORDINARY_WORDS (36 -> 42, still under the cap of 45), or dodge four of them for free by rewording: "The lantern road's mine", "anybody who wants to read it", "Warm? It is, aye", "The key's on the hook".

---

## 18. [BLOCKER] maren.starter.cindril, maren.starter.puddlisk, maren.starter.thornlet
*(found by `?`)*

**Problem.** The three starter beats lost their binding to balance.json's age.yearsInClass. tests/unit/dialogue.test.ts:890 computes adultYear = word[1 + yearsInClass.J] = "two" and elderYear = word[1 + J + A] = "three" and asserts each starter entry names BOTH. The rewrite replaced the absolute years with relative ones, so the copy no longer says when metamorphosis happens in game years and the assertion that keeps copy and balance data in step now fails five times. This is not table staleness — the binding itself is gone, and if yearsInClass ever changes nothing will notice.

**Evidence.** BASELINE maren.starter.cindril: "It becomes Vulkindle at two and Pyrevane at three."  NEW: "Yours will be a Vulkindle by this time next year, and a Pyrevane the year after that." (contains "three" only in "when its three years are up", no "two").  NEW puddlisk: "Rillisk next year, then Maelstrisk the year after that." (neither "two" nor "three").  NEW thornlet: "Bramblore next year, then Thornwald the year after." (neither; "third year" is not "three").

**Proposed fix.** Put the years back in Maren's own plain register, without the schema-speak the rewrite was right to remove. E.g. "It'll be a Vulkindle at two and a Pyrevane at three, and it's the same animal the whole way through." That satisfies the assertion, keeps Appendix F's plainness, and restores the only place the player is told the metamorphosis calendar in absolute terms.

---

## 19. [BLOCKER] maren.epilogue.caught, maren.epilogue.released
*(found by `?`)*

**Problem.** Both endings lost the numeric statement of their cost, and the caught branch lost the magnitude entirely. tests/unit/dialogue.test.ts:2689 asserts each epilogue body matches /rate|breeding|coefficient|count/i — 'the epilogue states the cost of each ending in numbers, not in judgement'. Both now fail. The rewrite was right to delete "It is a coefficient" and "runs at the base rate" (banned system vocabulary), but it deleted the FIGURE with the word. The released branch still carries a rate in words ("half again as many young" = the 1.5 keystoneBreedMult); the caught branch carries none at all — only "fewer young". These two entries are the payoff of the never-cut Cascade beat, the only flagEquals branch in the game, and the brief's own instruction is that the epilogues stay numeric.

**Evidence.** BASELINE caught: "Breeding in every node adjacent to the Sanctum runs at the base rate now. That's the whole of the difference, and it is a real one — four seasons to see it, eight to be sure of it."  NEW caught: "With that animal in a snare, the ground round the Sanctum and along the Approach goes back to doing what it does on its own. Whatever lives out there will bring on fewer young than it would with the stag loose in there."  NEW released: "...whatever lives in the Sanctum and along the Approach will bring on half again as many young as it would with the place empty."

**Proposed fix.** Give the caught branch the same arithmetic the released branch has, in the same plain register: "...will bring on two young where it would have brought on three with the stag loose in there" states 1.0 against 1.5 without naming a coefficient. Then either the regex passes on 'breeding' if you use the word, or update the assertion to test for a stated ratio rather than a vocabulary list — but only after the caught branch actually states one. Do not update the regex to make the current copy pass; the copy is what regressed.

---

## 20. [BLOCKER] tolm.quest.fallow.offer (choice text)
*(found by `?`)*

**Problem.** A newly-written choice string trips the G7 moralizing tripwire. tests/unit/dialogue.test.ts:2671 asserts no shipped text matches any MORALIZING_PATTERN, and ALL_TEXTS includes choice text (dialogue.test.ts:106-109). The 'how-many-more' pattern is /\bleave them be\b|\bhow many more\b/i. The choice was reworded in this pass from wording that did not match to wording that does. It is a regex false positive in spirit — the player is agreeing to honour a farm deal, not being lectured — but the gate is red either way, and it was green before.

**Evidence.** BASELINE tolm.quest.fallow.offer choices: ["I'll leave the field alone.", "I'll think about it."]  ·  NEW choices: ["I'll leave them be.", "Let me think about it."]  ·  MORALIZING_PATTERNS entry: { name: "how-many-more", re: /\bleave them be\b|\bhow many more\b/i }

**Proposed fix.** Reword the choice, do not weaken the pattern. "I'll leave them where they are." or "I'll leave the field alone." both keep Tolm's register and clear the scan. justify-test-edit applies: the tripwire is not wrong, the new string is.

---

## 21. [BLOCKER] corpus-wide (amb.brackwater-buyer.base, amb.brackwater-child.base, festival.brackwater, amb.duskhollow-elder.base, vendor-duskhollow.shop, amb.bowerdeep-elder.base, amb.bowerdeep-child.base, amb.bowerdeep-silkwinder.base)
*(found by `?`)*

**Problem.** The rewrite coins FIVE new proper nouns that characters speak aloud — Corbett, Effie, Ingram, Whit, Zeb. None resolves to anything in data/species.json, data/nodes/, data/gyms.json or any allow-list, and none appears lowercase anywhere in the corpus, so rule (c) cannot clear them. They must go into COINED_NPC_NAMES, which currently holds 7 (Tolm, Hetty, Halder, Pell, Gerta, Ives, Orrin — all spoken, none removable) against `expect(COINED_NPC_NAMES.length).toBeLessThanOrEqual(8)` at tests/unit/dialogue.test.ts:623. 7 + 5 = 12. The corpus cannot pass G2 as written and cannot be made to pass without breaking an asserted cap. I ran the gate's exact logic (title-casing, plural-stripping, LOWERCASE_CORPUS fallback, the `I` exemption) over all 13 fragments to confirm. Budget for new spoken names is ONE, not five. Each slice added one or two; only the whole-corpus view shows the budget is blown. (The gate also flags Anyone / Aye / Key's / Lantern / Otherwise / STAR, but those are ordinary words that fit ORDINARY_WORDS at 36 of cap 45 — they are not the problem.)

**Evidence.** brackwater-buyer: "Corbett. I buy the season here on behalf of an office that is not in this town" · duskhollow-elder: "Ingram will tell you his oil is as good as it ever was, and Ingram would, wouldn't he." · duskhollow-elder: "Effie tells me to shut my shutters at night... I've said all of that to Effie twice this week." · bowerdeep-elder: "Whit will tell you he has been lighting that walk since before I was born, and Whit is younger than I am." · bowerdeep-silkwinder: "Zeb's lad goes round the market telling people the moths make the silk."

**Proposed fix.** Speaker DISPLAY names are not scanned — only line and choice text — so the names can stay on the nameplates and leave the prose. Keep at most ONE spoken name (Corbett is the strongest candidate: three speakers use it and it is the buyer's own self-introduction). Demote the other four to roles the corpus already has speaker rows for: Ingram → "the lampwright", Whit → "the lampkeeper", Zeb → "the stallholder" / "the man whose stall I mind", Effie → "my niece". Then add Corbett to COINED_NPC_NAMES (8 of 8) and Anyone/Aye/Key/Lantern/Otherwise/Star to ORDINARY_WORDS (42 of 45).

---

## 22. [BLOCKER] bram.quest.forge.offer L2 and vendor-cindershelf.shop L2
*(found by `?`)*

**Problem.** Two speakers now send the player to fetch an item and visit a shop that do not exist. game/quests.ts:238 states the deviation in terms: "the relic and the ingot are not items the shipped economy carries, so no cost is taken." There is no ingot item anywhere outside dialogue and docs, and no shaft-head store in data/nodes/cindershelf.json (its only two props are the two shrines). The old data/dialogue.json contained ONE vague mention (line 2525, "Bring the relic and one ingot off the shaft-head store"); the rewrite kept it AND added a second, far more actionable one that gives the player directions. A player will walk up the hill behind the shop looking for a store that isn't there. This is a new player-facing dead end introduced by the rewrite.

**Evidence.** bram.quest.forge.offer L2: "You bring me the relic and one ingot off the shaft-head store, and I'll not ask you for anything past that." · vendor-cindershelf.shop L2: "he'll want an ingot off the shaft-head store to go with it. I don't keep ingots. Never have. You want the shaft-head store for those, and that's up the hill behind me."

**Proposed fix.** Cut the fetch entirely — the quest objective is `{kind: "visitedSince", node: "cindershelf"}`, i.e. come back to Bram's town, and the copy should name that and nothing else. Bram: "Bring it here and I'll set it. It wants a day and a night to cool once it's set..." Vendor: drop the whole ingot sentence and end on "Bram takes it at the forge, up the hill behind me." Do not replace one invented errand with another.

---

## 23. [MAJOR] corpus-wide
*(found by `?`)*

**Problem.** "Twice" / "both times" is the corpus's machine signature and has replaced the counting-aphorism the first version was rejected for. 49 occurrences across 24 of 62 speakers. Worse than the raw count is the rhetorical slot: the beat "I raised it twice and nothing came of it" is spoken by TEN distinct speakers (maren, wick, sel, tolm, r1-forager, hearthollow-farmhand, bowerdeep-silkwinder, brackwater-elder, duskhollow-elder, duskhollow-child). The measured diagnosis set the cap at TWO speakers per construction and said it would be checked. Wick alone reaches for "twice" in eight lines across seven of his twelve entries. It also collides with finding 1: Tolm's "I said it to you twice" is this same tic pointed at the player.

**Evidence.** maren.greeting.act2: "I've asked him twice how he knows and got a story both times." · sel.docks.rotting: "I've told the harbourmaster about those two pilings twice. He has written back both times to say that he agrees with me." · amb.r1-forager.late: "I've told her so twice, and she just says her bit again the year after." · amb.hearthollow-farmhand.base: "I need them for getting the crop in. I've told him that twice." · amb.duskhollow-elder.base: "I've said all of that to Effie twice this week. She agreed with me both times and I'm still buying the oil." · amb.bowerdeep-silkwinder.base: "I've asked about it twice and both times I got the same answer." · wick.act6.pre: "I asked about it twice and I got nothing back either time." · sable.post.win: "He's turned me away twice over that, and both times he was right, and both times I walked back down with the thing still in my hand."

**Proposed fix.** Keep the tic in at most two speakers where it characterises (Wick's grade-obsessed record-keeping earns it; Gerta's paired readings earn it). Everywhere else replace the number with what that speaker's trade would reach for: once, three winters running, every time he comes past with the ladder, since the spring, at every turn of the year, and never at all. A person complaining about a neighbour does not usually have a count.

---

## 24. [MAJOR] corpus-wide — the ambient tier (S8a–S8e), plus maribel, sable, gerta, tolm, orrin, noct
*(found by `?`)*

**Problem.** Every ambient speaker is built on one armature: a standing, unresolved disagreement with a named third party, raised repeatedly, never won. It is the successor to the "Nobody…/Everyone…" opener the diagnosis measured at 24 speakers. The tightest surface form — "<Name> will tell you X" followed by the speaker correcting X — opens lines for five speakers in four towns (hearthollow-elder, bowerdeep-elder, duskhollow-elder, gerta, sable), and the underlying structure runs through 20-plus. The design asked for a bore, someone wrong, someone repetitive, someone who dodges the question — and got all four, but built each out of the identical part. Over a playthrough Fallowmere has one grievance and 62 mouths for it, which is the chorus failure the brief names.

**Evidence.** amb.hearthollow-elder.base: "Tolm will tell you it was always this one. Tolm was in short trousers the year they moved the gate…" · amb.bowerdeep-elder.base: "Whit will tell you he has been lighting that walk since before I was born, and Whit is younger than I am." · amb.duskhollow-elder.base: "Ingram will tell you his oil is as good as it ever was, and Ingram would, wouldn't he." · gerta.warm.testimony: "Bram will tell you it has never moved at all. Bram is working off my numbers and he's got them a bit wrong." · sable.greeting: "Gerta'll tell you the third shaft is warm." · amb.r2-ferryhand.base: "everybody waits for his. His boat isn't faster. It isn't… His boat is not faster." · amb.brackwater-elder.base: "My nephew tells people I cut a fresh mark and forgot. I did not cut a fresh mark." · amb.cindershelf-miner.base: "My sister says I don't hear her on purpose. I do hear her." · maribel.greeting.reach-thin: "Tolm thinks I'm daft for it, and he says so every time he walks past the gate."

**Proposed fix.** Cap the "<Name> will tell you X" opener at two speakers. Rebuild at least a third of the ambient tier off a different spine: someone who AGREES with a neighbour and says so warmly; someone with no opinion who just describes their morning; someone whose three lines are one uninterrupted piece of business (the lampkeeper's counting and the dockhand's rope are already close to this and should be the model); someone who asks the player a question and does not wait for the answer. Not everyone needs an antagonist.

---

## 25. [MAJOR] gerta.quest.crash.done (S5-cindershelf.json)
*(found by `?`)*

**Problem.** Content-truth defect: the turn-in asserts a specific trophic collapse as fact with no population condition on the entry. Its `when` is {"flagsSet":["quest.after-the-crash.turnin"],"flagsUnset":["quest.after-the-crash.done"]}. A recovering steppe is reachable in the same window — bram.mine.expanding gates on r4 / cragmar-line gte 12 at yearMin 5 and says "Cragmar are back up on the high scarp, grazing ground that had nothing growing on it two years back." So the game can say in one building that Cragmar are thriving on regrown scarp and in the next that Cragmar went second in a collapse off that same scarp. L0 compounds it by asserting what the player's own figures say without reading them.

**Evidence.** L0: "You've put down more Carricrow than that ground ought to be feeding, and it isn't because the birds are doing well for themselves."  ||  L1: "The growing went first on that scarp, and that's off your green figure, not off anything I've walked. Ashvole and Cragmar both graze that growth, so those two went next. Pyrelisk take both Ashvole and Cragmar, so the Pyrelisk went after them. Stonewing take Pyrelisk and nothing else up there, so once the Pyrelisk were gone the Stonewing had nothing."

**Proposed fix.** Split the turn-in the way bram.mine.expanding/closing is split: gate the collapse account on the r4 populations that make it true (stonewing/pyrelisk low), and author a second turn-in for a steppe that is holding, where Gerta gets her numbers and reads a different order out of them. Having a woman who refuses to put a guess in the log narrate a cascade she cannot see is out of character as well as out of true.

---

## 26. [MAJOR] S2-wick-greaves.json (all 24 entries)
*(found by `?`)*

**Problem.** Wick and Greaves still read zero world state — the fragment contains no `population` or `floraStock` key anywhere. verified-facts.md named this the biggest story hole and the rewrite did not close it. The G7 consequence is structural and only visible corpus-wide: every reaction to what the player has actually done to the region is spoken by ambient villagers reporting material hardship — soft pilings, a boarded fourth shaft, an empty nest, no stick worth walking in for, a bad week on the stilts — and never by the character whose whole dramatic function is to argue that harvesting is legitimate. The pressure is one-directional. The player hears the cost of their catching from fourteen depletion-gated entries and hears the case for it from nobody looking at the same numbers.

**Evidence.** Wick's only engagement with a depleted region is act-gated backstory about somebody else's contract — wick.act4.pre: "I'd work it again if they put me back on that crew, and I'm not going to dress that up for you. The scarp went empty in the fifth year and it hasn't come back since." And greaves.finale.pre concedes figures he has never watched move: "You have been counting for the warden since before we met in Bowerdeep, and she has your figures, and I have no quarrel with the figures."

**Proposed fix.** Give Wick two population-gated variants on routes he already walks — one where the player's take on r1 or r2 shows up on his intake sheet as a good month for him, one where it shows up as a route not worth putting a man on. He is paid by the head; he is the one person in Fallowmere with a professional reason to notice and no reason to disapprove. If adding entries is outside the writers' remit, escalate rather than ship the imbalance, and log it in DEVIATIONS.md.

---

## 27. [MAJOR] sel.greeting, sel.service.ferry, innkeeper-brackwater.rest, innkeeper-cindershelf.rest, vendor-bowerdeep.shop, bram.quest.forge.offer
*(found by `?`)*

**Problem.** Six speakers share the "I know your type already" preemption — the character predicts a fault, an ignorance or a demand in the player before the player has done or said anything. Individually each is warm and well written. Six times it is a house style, and it is the corpus's only remaining route to the risk Appendix F names by name: irreverence curdling into sarcasm aimed at the player. vendor-bowerdeep's is the one that tips over — "of course you will" needles the player for wanting the best snare, i.e. comments on the player's appetite for catching, in a shop, in a game about catching. Sel's is the other exposure because it is the first sentence he ever speaks and it scripts the player as a chancer angling for a cheaper fare.

**Evidence.** vendor-bowerdeep.shop L2: "The heavy snares now, the ones that'll hold near enough anything — you'll be wanting one of those, of course you will, and I haven't got one." · sel.greeting L0: "They do move for people who have done me a favour, only I keep that list in my head and not on the post, so it's no good you standing there looking for it." · sel.service.ferry L0: "half of them trail a hand over the side anyway, and then they've a wet sleeve the whole way over, and by the time we're on the far side that has somehow turned into my doing." · innkeeper-brackwater.rest L0: "You'll lie down and you'll decide you're not going to sleep." · innkeeper-cindershelf.rest L0: "People ask me for the quiet side, and then about the middle of the night they're down the stairs in their stockings wanting the vent side after all." · bram.quest.forge.offer L1: "I say that part twice to every single person who stands where you're standing, because they go off out of here thinking it's the whole of the old one back again."

**Proposed fix.** Fix vendor-bowerdeep unconditionally — move the anticipation off the player and onto the trade: "The heavy snares, the ones that'll hold near enough anything. I haven't got one. They come up twice a year and they're gone the same night." Same for Sel's greeting: let the rate be the rate without imagining the player's angle. Keep at most two of the remaining four; the innkeepers' versions are the most earned, because a bed is a thing you are being sold and the player's comfort is genuinely their business.

---

## 28. [MAJOR] corpus-wide
*(found by `?`)*

**Problem.** THE CHORUS WAS REPLACED, NOT REMOVED. The measured diagnosis capped any shared construction at TWO speakers and named the "Nobody…/Everyone…" opener as the offender at 23 uses / 19 speakers. That one shrank to 14/12 — and a new negative-absolute took its place at four and a half times the old rate. "never" now appears 91 times across 35 of the 62 speakers (was 20 across 16). The verbatim intensifier "never once" is used by 9 speakers (was 5). A twelve-year-old, a magnate, a ferryman, a gym leader and a lamp-keeper all reach for the same construction. No individual slice reviewer could see this; only the whole corpus shows it.

**Evidence.** Nine speakers, "never once", verbatim: maren.greeting.act3 "I have never once had a page of my own for what's above it." / greaves.act4.steppe "the board has read the first one every year and has never once asked me about the second." / maribel.pre "it's never once lost her a fight" / odo.post.win "he has never once had change in the box" / vesper.post.loss "I have never once seen her beaten to it." / sel.tale.4 "I have never once let the boat sit still over that place at slack water" / bram.greeting "warm at the far end where I have never once had a fire" / halder.quest.silk.deferred "I have never once got away from that table in under an hour." / amb.duskhollow-lampwright.base "I've never once had to ask twice for the money". Related shared frames: "and I have never…" 7 speakers; "I have never been able to…" 3 speakers (brackwater-buyer, orrin, sel).

**Proposed fix.** Hold "never once" to two speakers total — keep it where it is load-bearing (Vesper's old Webvern; Greaves's board) and rewrite the other seven into each speaker's own idiom: a flat past tense ("the board has read the first one every year and has not asked me about the second"), a habitual ("he doesn't carry change, he never has"), or simple deletion of the intensifier. Then re-run the count: target ≤40 total uses of "never" across ≤15 speakers, roughly double the old corpus rather than 4.5×.

---

## 29. [MAJOR] corpus-wide (32 entries across 21 speakers)
*(found by `?`)*

**Problem.** A single emotional shape now ends a sixth of all beats: the speaker's unresolved grievance about being unheard, unpaid, or unable to find out. F3 forbids structural cleverness in a beat's last sentence and the writers obeyed — none of these is an epigram. But the RESULT is the same defect the epigrams caused: the reader learns the cadence and stops hearing the character. Every settlement, every tier, from the warden to a child, exits on "and nobody answered / and I've told them twice / and I've given up asking".

**Evidence.** maren.greeting.act6 "…and I've asked every person out here I can think to ask, and nobody has been able to tell me a thing." / maren.keystone.2 "I've asked in five towns now and I've never found anybody who could tell me either." / amb.hearthollow-fenceman.base "Wire's gone up again this year and nobody's said why." / amb.r1-forager.base "I've asked about it three years running and nobody I've asked knows who did it, or when they did it." / amb.r1-forager.late "I still say it's the wet springs, and I've told her so twice, and she just says her bit again the year after." / amb.hearthollow-farmhand.base "I've told him that twice." / amb.bowerdeep-silkwinder.base "Now two of the other stalls have got hold of it, and I've stopped wasting my breath." / amb.hearthollow-forager.base "I've not found anything that helps it, so I've given over looking." / amb.r4-worker.base "I've given up putting the lids back on." / amb.brackwater-dockhand.rebuilt "…and nobody actually told me it had, so I'm not going to be the one who brings it up."

**Proposed fix.** Cut this shape to at most 10 of the 32. The brief's own model lines show two other legitimate exits that are barely used: a piece of unfinished business (Mott: "I know the post is down again and I'm the one putting it back up") and a plain fact with no attitude on it. Redistribute — end some beats mid-thought, some on a chore, some on a neighbour, and let two or three simply stop without any closing move at all. That is what makes the ten that remain land.

---

## 30. [MAJOR] corpus-wide (dialogue.test.ts COUNT_CLAIM_REVIEW)
*(found by `?`)*

**Problem.** The register asserts exact set equality against every entry whose text matches the count regex. The rewrite changes membership by 34 entries. This is the C2 trap firing exactly as predicted: the regex fires on ordinary English ("one of them", "there are two", "Two of them"), not just on quoted populations. Test "every line that names a count has been read and classified" will fail with a 34-item diff.

**Evidence.** MUST ADD (30, with the matched fragment): amb.brackwater-buyer.base['three Fenmaw'], amb.brackwater-buyer.lowseason['one Fenmaw','there are two'], amb.brackwater-netmender.base['one of them'], amb.cindershelf-worker.base['Two of them'], amb.hearthollow-child.base['one of them'], amb.r2-ferryhand.apex['one of them'], amb.r4-worker.arrival['two of them'], amb.r4-worker.base['four of them'], amb.r4-worker.emptied['There were two'], gerta.warm.testimony['one of them','down to eight'], halder.quest.silk.accepted['one of them'], innkeeper-duskhollow.rest['two of them'], innkeeper-hearthollow.rest['one of them'], ives.greeting['There are two'], maren.crash-survey['three Stonewing'], maren.keystone.3['forty of them'], maren.keystone.5['one of them'], maren.starter.cindril['one standing'], maribel.greeting.reach-thin['nine Nibbin'], nessa.quest.restock.economics['there are two'], nessa.quest.restock.offer['four of them'], odo.greeting.fishery-low['Two of them'], prop.sanctum-antler-ring['one of them'], sable.pre['six of them'], sel.tale.4['one standing'], sel.tale.5['one of them'], wick.act1.pre['one of them'], wick.act1.win['one standing'], wick.act4.pre['one of them'], wick.act5.win['there are two']. MUST REMOVE (4): gerta.greeting, prop.r2-idol-shallows, tolm.quest.fallow.done.kept, wick.act6.win.

**Proposed fix.** Classify each addition. Only four are genuinely live-ledger reads and they all already carry a population clause: amb.brackwater-buyer.base ('three Fenmaw', but it is UNGATED — see the second half of this fix), amb.brackwater-buyer.lowseason, maren.crash-survey, amb.r4-worker.emptied. The rest are `world`. CRITICAL: the companion test "a line that quotes the live ledger reads the live ledger" fails any `live` row whose entry has no `when.population` clause — amb.brackwater-buyer.base says "The warden had three Fenmaw out in that marsh the last time she walked it" with `when: {}`, so either classify it `world` on the grounds that it is her stale report rather than the live number, or add a population clause. Note tolm.quest.fallow.done.kept dropping out means its numeral moved: it now reads "You've left me my twenty-four" — verify the regex genuinely misses it before deleting the row.

---

## 31. [MAJOR] corpus-wide (dialogue.test.ts DIET_LINE_REVIEW / PREDATION_VERB)
*(found by `?`)*

**Problem.** Seven entries that still make diet claims no longer trip the predation-verb guard, because the rewrite consistently swapped explicit verbs for idiomatic ones the regex does not know — "live off", "doing well off", "after the", "taking". The test will red with 7 stale rows. The dangerous part is the obvious fix: deleting those rows turns the suite green while silently removing review coverage from copy that still asserts food-web edges, and DIET_CLAIMS still lists four of the seven as reviewed diet claims. That is a guard being disarmed to make a test pass.

**Evidence.** maren.crash-survey still claims a diet — "then the Pyrelisk that live off the pair of them" — and DIET_CLAIMS still holds `{entry:"maren.crash-survey", predator:"pyrelisk-line", prey:"ashvole-line"}`, but PREDATION_VERB has no "live off". Same pattern: odo.post.win "They live on weed and on Sporantle off the bottom… they're up in the reed edge taking Reedrick"; amb.hearthollow-elder.base "Skir come over the hedge about dusk after the Nibbin in the tussock"; amb.r1-forager.bloom "The Skir will be doing well off the Nibbin too"; vendor-bowerdeep.shop "It's after the moss on the rail"; sel.quest.wager.accepted "My grandfather baited for them with a Reedrick"; amb.cindershelf-elder.base. Meanwhile three NEW entries trip the regex on false positives: maribel.greeting ("She's eating, just not much"), maren.starter.puddlisk ("what something had been eating"), innkeeper-duskhollow.rest ("hunting for it in the dark").

**Proposed fix.** Extend PREDATION_VERB with the idioms the new register actually uses — `lives?/live(s)? (on|off)`, `doing well off`, `taking`, `come(s)? .{0,20}after`, `baited? for` — BEFORE touching DIET_LINE_REVIEW, so the seven entries come back into coverage rather than falling out of it. Then set the counts to what the extended regex actually measures, and add the three false-positive entries with their reviewed counts. Deleting a stale row is only correct when the claim is gone from the prose; here it is not.

---

## 32. [MAJOR] corpus-wide (game/scenes/DialogueScene.ts paging)
*(found by `?`)*

**Problem.** The register change has a UX consequence nobody has costed. dialogueColumns() computes floor((480 - 8*2 - 8*2)/6) = 74 columns and `bodyLines` is 3, so a page holds ~222 characters. With a median line of 273 chars, 368 of 500 lines (73.6%) now need two or more pages, and every one of them breaks mid-sentence at a fixed row boundary. The corpus costs 869 advance-presses where the old one cost roughly 500. Appendix C7 predicted exactly this and tried to prevent it with a 90–200 character band; Appendix F withdrew that band, correctly, but nothing was done about the box.

**Evidence.** Wrapped-row histogram at 74 columns: {2 rows: 16 lines, 3: 116, 4: 153, 5: 151, 6: 63, 7: 1}. With bodyLines=3 only 132/500 lines fit one page. bodyLines=5 → 436/500 fit, 564 presses, box height 94px. bodyLines=6 → 499/500 fit, 501 presses, box height 8*2 + 13*(6+1) = 107px of the 320px virtual screen.

**Proposed fix.** Raise `bodyLines` from 3 to 6 in defaultDialogueStyle() (game/scenes/DialogueScene.ts:93). That puts 499 of 500 lines on a single page at a box occupying a third of the screen — proportionally normal for the Gen-II reference. It is a one-number change and pageOf/pageCount already take bodyLines as a parameter. If the box height is unacceptable, bodyLines=5 still recovers 436/500. This is an owner decision, not a silent one: log it in DEVIATIONS alongside the C7 band withdrawal.

---

## 33. [MAJOR] amb.bowerdeep-child.base
*(found by `?`)*

**Problem.** The single surviving instance of a character reciting the data model, and it is also factually wrong twice in one sentence. (a) "they're Dark and Wind already" names two type enums as capitalised nouns — the exact defect the measured diagnosis indicted ("Cindril. Fire, mesopredator…"). (b) It is FALSE: species.json gives gloomoth-line types J:[Poison,Plant], A/E:[Dark,Wind]. The Gloomgrub is NOT Dark and Wind; that is the adult it has not become, so "already" inverts the actual fact. (c) "that's where the silk comes off them" is false — silk is webvern-line, and amb.bowerdeep-silkwinder.base says so explicitly three entries away. The child is not framed as wrong, and asserts "everybody knows that".

**Evidence.** "Gloomgrub are the little ones and they're Dark and Wind already, everybody knows that, and then they go up in the high lines and they come back down twice the size with the wings on, and that's where the silk comes off them." vs data/species.json gloomoth-line types={'J': ['Poison','Plant'], 'A': ['Dark','Wind']} and amb.bowerdeep-silkwinder.base "The moths make no silk. It's Webvern that make it, up in the high lines."

**Proposed fix.** Strip the type names entirely and let the child describe what a child sees: "Gloomgrub are the little ones down in the leaf litter, and then they go up in the high lines and they come back down twice the size with the wings on." If the silk error is meant to characterise him as wrong, it needs the silkwinder to name HIM rather than "Zeb's lad" — otherwise it reads as an authorial mistake, and it is the corpus's only uncorrected false ecology claim.

---

## 34. [MAJOR] sel.tale.1 vs sel.tale.4
*(found by `?`)*

**Problem.** Sel contradicts himself about the length of his own pole, inside the same lore chain, about the same claim. The pole's length is the entire evidentiary basis of the Undermere chain — it is the instrument by which he knows the four places are bottomless — so the number is load-bearing, not decoration. No slice reviewer would catch it because both entries are in the same fragment but four entries apart.

**Evidence.** sel.tale.1: "The story starts with my pole… Eleven feet, near enough… In the four the whole eleven feet of pole goes down and there is still nothing under the end of it." — sel.tale.4: "I have had twelve foot of pole down there and found nothing under it at all."

**Proposed fix.** Make tale.4 read "eleven foot of pole". Or, if the discrepancy is meant as a teller's drift, one of the two has to acknowledge it out loud — an unmarked drift on the chain's only measurement reads as an error, not as character.

---

## 35. [MAJOR] corpus-wide (dialogue.test.ts ACT_GATED_YEAR_CLAIMS and CALENDAR_YEAR_CLAIMS)
*(found by `?`)*

**Problem.** Both year registers assert exact membership and both break, and a third assertion — the hardcoded list naming the four run-length claims — breaks as a consequence, because three of its four named entries no longer contain a year span at all.

**Evidence.** ACT_GATED_YEAR_CLAIMS — ADD 8: amb.r4-worker.arrival, bram.warm.2, maren.epilogue.caught, maren.greeting.act3, maren.greeting.act5, maren.keystone.3, maren.keystone.6, maren.starter.cindril (1 line each). REMOVE 5: greaves.finale.pre, prop.cindershelf-shrine-deep, sel.quest.wager.offer, wick.act3.win, wick.act6.win. The assertion `expect(...run-length...).toEqual(["greaves.finale.pre","maren.epilogue.released","wick.act3.win","wick.act6.win"])` cannot hold once three of those four leave the map. CALENDAR_YEAR_CLAIMS — ADD 3: amb.brackwater-buyer.lowseason (yearMin 3, "forty years"), amb.r1-forager.bloom (yearMin 2, "three years"), bram.mine.expanding (yearMin 5, "two years"). REMOVE 2: amb.brackwater-dockhand.rebuilt, amb.r1-forager.late.

**Proposed fix.** Classify the three CALENDAR additions as `says: null` — all three are facts about the world (a dead author, the forager's own picking history, the scarp's regrowth), not about this run — and update the run-length assertion to whatever set actually survives (maren.epilogue.released alone, on current text). One coverage note worth acting on: amb.r1-forager.late drops out only because its copy moved from "Six years" to "the eighth year I've come up for the picking" — an ORDINAL, which the SPAN regex does not match. It still fires from yearMin 6 and still names a span. Add `eighth|seventh|ninth|tenth` etc. to the SPAN alternation rather than letting the entry go unguarded.

---

## 36. [MAJOR] corpus-wide (6 speakers)
*(found by `?`)*

**Problem.** A running gag about long-winded informants is told by six different speakers. The measured diagnosis's cap is two speakers for any shared construction, and this is stronger than a construction — it is the same joke, about the same handful of people, with the same punch. It reads as one author's tic distributed across a town.

**Evidence.** maren.greeting.act2 "I've asked him twice how he knows and got a story both times." / wick.act2.win "He takes an hour over it." / nessa.quest.restock.economics "Sel will take you through the pilings at some length, if you've got the afternoon for it." / amb.brackwater-dockhand.rot "Ask Sel why. Take a cushion, he'll be a while about it." / amb.r2-ferryhand.quiet "Sel would tell you what it means, only he'd take twenty minutes over it" / vendor-brackwater.shop "he'll tell you properly, though he'll take his time over it." / halder.quest.silk.deferred "I have never once got away from that table in under an hour."

**Proposed fix.** Keep two — the dockhand's "Take a cushion" is the best of them and Wick's is character-establishing. Rewrite the other four so the reason for deferring is different each time: the ferry-hand should defer because it is not his to tell (he already says that in his base entry), the vendor because he is busy, Halder because he likes Vesper, Nessa because she is short of time. Same routing function, four different reasons.

---

## 37. [MAJOR] corpus-wide
*(found by `?`)*

**Problem.** ONE TEMPERAMENT ACROSS 62 SPEAKERS. The corpus's universal rhetorical move is now thwarted testimony — a person who said something, or asked for something, and was not heeded. The narrow form ("I said/asked/told it twice / three times / four times") appears in 11 distinct speakers; the broad family — a complaint filed and ignored, a correction that would not take, a rate nobody will explain, a relative who cannot be shifted — is present in at least 24 of 62. This is structurally identical to DEFECT 2 in the measured diagnosis, with new subject matter. It reads as one writer's temperament distributed across a cast, which is exactly what the owner heard the first time.

**Evidence.** [hearthollow-farmhand] "I've told him that twice." · [r1-forager] "I've told her so twice, and she just says her bit again the year after." · [bowerdeep-silkwinder] "I've asked about it twice and both times I got the same answer." · [duskhollow-elder] "I've said all of that to Effie twice this week. She agreed with me both times and I'm still buying the oil." · [sel] "I've told the harbourmaster about those two pilings twice. He has written back both times to say that he agrees with me." · [cindershelf-shafthand] "I'm on nights six days in eight and I've put in twice to be moved." · [maren] "I've asked him twice how he knows and got a story both times." · [wick] "I asked about it twice and I got nothing back either time." · [duskhollow-child] "I've asked her four times now." · [bowerdeep-child] "he's said next time three times now, and I'm still stood here minding it." · [odo] "Two of them have asked me when it comes back. Both of them asked me twice." · [vesper] "I have asked the council to put both of those figures on the same page and so far nobody has." · [greaves] "the board has read the first one every year and has never once asked me about the second."

**Proposed fix.** Do not rewrite line by line — the lines are good. Redistribute temperament. Take roughly a third of these speakers off the grievance axis entirely and give them a different relation to being heard: someone whose complaint WAS acted on and who is faintly embarrassed about it; someone who never told anybody because it is not his business; someone who is simply too busy to have an opinion; someone who is pleased with how his week went. Cap the explicit "I said it N times" construction at two speakers in the whole game, the same cap the measured diagnosis set for every other shared construction.

---

## 38. [MAJOR] amb.hearthollow-child.base / amb.brackwater-child.base / amb.bowerdeep-child.base / amb.cindershelf-child.base / amb.duskhollow-child.base
*(found by `?`)*

**Problem.** The five town children are one child written five times. Every one of them runs the same three beats: an adult imposes a rule or refuses something, the child holds a stubborn or mistaken belief, and the beat closes on a declaration of persistence. Four of the five end a line on some form of "and I'm going to do it anyway." Four of the five report a named guardian's prohibition in the same grammar ("My da says…", "My mum won't have me…", "Mother says…", "My brother says he'll tell on me").

**Evidence.** [hearthollow-child] "My da says I'm not to keep on at Maren about it and I am going to keep on at her about it." · [duskhollow-child] "Mother says we'll see when she means no, so I'm going up to ask him again anyway." · [cindershelf-child] "My brother says he'll tell on me if I go in the gym when there's a fight on. So I sit on the step outside the door and I can hear all of it from there anyway." · [brackwater-child] "Sel says sit in the middle and don't trail your hand in the water. I sit at the front. I trail my hand." · [bowerdeep-child] "My mum won't have me on the east stair after dark because of the Duskstalk, so I stand at the bottom of the steps and watch the lamps from there."

**Proposed fix.** Keep one defiant child. Make the others different kinds of child: one who is frightened of the thing everyone else finds ordinary; one who is proud of a job he does badly; one who is quoting an adult verbatim and has no idea what it means; one who does not want to talk to the player at all and says so. Remove the guardian-prohibition grammar from at least three of the five.

---

## 39. [MAJOR] amb.hearthollow-elder.base / amb.brackwater-elder.base / amb.bowerdeep-elder.base / amb.cindershelf-elder.base / amb.duskhollow-elder.base
*(found by `?`)*

**Problem.** The five town elders are one elder. Each opens on a tenure credential (B4, still banned by §2 and not withdrawn by Appendix F), each contains a deliberately repeated sentence, and each has a relative or neighbour who contradicts them. Separately: of the five in-conversation repeaters the brief's per-settlement quota asks for, FOUR are the town elder — the quota was filled by applying one template per town rather than by casting five different people.

**Evidence.** Openers: [hearthollow-elder] "I drove cattle up there fifty years" / "I had cattle on the Reach fifty-two years." · [brackwater-elder] "The water has never been over that mark. Not in my life, and I'm eighty-one." · [bowerdeep-elder] "I was born on the floor. I brought up my family on the walk, and I have spent these last years up in the canopy." · [cindershelf-elder] "Four contracts have come into this town in my life. I was in the town for all four of them." · [duskhollow-elder] "Four jars I bought the year I was married. Nine jars I bought last year."   Repeats: brackwater-elder "Same mark. Same mark." · duskhollow-elder "Four jars the year I was married. Nine jars last year. Same rooms, same two lamps." (verbatim re-run of L1) · cindershelf-elder "I don't say which three." (×2) · hearthollow-elder "I've told you about the gate already, I expect."   Contradicting relative: elder's daughter, elder's nephew, elder's wife/Whit, elder's mother, Effie.

**Proposed fix.** Move the repeater role off the elder in at least three towns — give it to the lampkeeper (who already does it beautifully: "That happens most nights now. Most nights."), a vendor, a dockhand. Strip the tenure credential from at least three elder openers; a person who has lived somewhere sixty years usually does not lead with the number. Give one elder no relative at all.

---

## 40. [MAJOR] corpus-wide — the "ordinary person" quota
*(found by `?`)*

**Problem.** The brief's requirement that not everyone be sharp was satisfied with two devices, applied at scale. An aching body part appears in 14 speakers; a relative who disagrees with the speaker appears in 19. Both are good devices; neither survives being the answer to "how do I make this person ordinary" nineteen times.

**Evidence.** Bodies: [hearthollow-forager] "There's nothing left in the right one — no gristle" · [bowerdeep-logger] "My back went two summers ago" · [brackwater-elder] "My knees are no good on the steps now." · [brackwater-dockhand] "It aches on the cold mornings now" · [cindershelf-miner] "My left ear's been no good since the year they cut the fourth shaft." · [cindershelf-elder] "My eyes aren't good enough for that shelf now" · [orrin] "Ives says the trouble is my eyes" · [bowerdeep-lampkeeper] "I'm slower round the walk than I was" · [maren] "I've not had a proper night's sleep since I came up here."   Relatives: elder's daughter, elder's nephew, miner's sister, netmender's son, logger's wife, worker's wife, astronomer's landlady, Wick's landlady, Tolm's wife, Bram's brother's wife, Odo's mother, Noct's mother, Sel's brother and grandfather, plus all five children's guardians.

**Proposed fix.** Replace roughly half of each with devices that are not about decline or domestic friction: a person who is new to the job and enthusiastic, a person with a hobby unrelated to their work, a person who is proud of a small piece of equipment, a person who is bored and says so, a person who mishears the player's question and answers a different one.

---

## 41. [MAJOR] maren.finale / wick.act6.pre / amb.sanctum-approach-scout.base
*(found by `?`)*

**Problem.** Three speakers in three different fragments deliver the same two facts in near-identical words, in the same node, within one scene. Because they were written in separate slices (S1, S2, S8e), no slice reviewer could see it. On the approach the player will hear "six teams and a cradle on rollers" three times running, which is the last beat before the finale.

**Evidence.** [maren.finale] "Greaves went through about an hour ago. Six teams with him and a cradle up on rollers, and he never hurried a step of it" · [wick.act6.pre] "Greaves went up past the gate stone about an hour ago. Six teams went with him, and a cradle on rollers that I saw the build sheet for" · [amb.sanctum-approach-scout.base] "Six teams went up the approach this morning. They took a cradle up with them on rollers, four men to a corner of it."

**Proposed fix.** Give each speaker only what that speaker would actually have. The scout counts men and writes a sheet — leave the cradle with him. Wick has the build sheet, so give him only the rating and drop the teams. Maren was not watching the equipment at all; give her what she noticed, which the line already has and then buries: that Greaves never hurried a step of it.

---

## 42. [MAJOR] sel.tale.1 / sel.tale.4 — S4-brackwater.json
*(found by `?`)*

**Problem.** Sel's pole changes length between two beats of the same chain, and the pole IS the evidence his whole tale rests on — he offers to let the player measure it. The old copy was consistent (eleven both times). This is a rewrite-introduced F2 failure that no single-slice reviewer could catch, because the two entries are gated four chain steps apart.

**Evidence.** sel.tale.1 L2: "The story starts with my pole, and you're welcome to measure the pole yourself if you think I'm inventing any of this. Eleven feet, near enough." L3: "In the four the whole eleven feet of pole goes down and there is still nothing under the end of it."   sel.tale.4 L2: "I have had twelve foot of pole down there and found nothing under it at all."

**Proposed fix.** Make sel.tale.4 read "I have had the whole eleven feet down there and found nothing under it at all." Also sweep Sel's other measurements across the five tales — he is the corpus's most number-dense speaker and his tale is the Undermere chain's only evidence.

---

## 43. [MAJOR] maren.tutorial.snare / vendor-hearthollow.shop / vendor-bowerdeep.shop / vendor-cindershelf.shop / vendor-duskhollow.shop / sel.tale.4
*(found by `?`)*

**Problem.** The three snare tiers are given four different spoken names across five shops, and one of those names collides with the neighbouring tier. "Weighted" is the middle tier; "heavy" and "heaviest" and "strong" are used for the top tier by three different speakers. A player who hears Maren teach plain/weighted/the-smith's-best cannot map any vendor's stock onto it, and Duskhollow's "strong snare in the drawer" is genuinely ambiguous between the two upper tiers. Removing the enum names ('master snare', 'weighted snare') was correct; replacing them with four synonyms was not.

**Evidence.** [maren.tutorial.snare] "The plain ones let go of anything that fights you hard. A weighted one holds better, and the smith's best will hold nearly anything at all" · [vendor-hearthollow] "A plain snare comes in under a salve… The weighted ones come up from the smith when he's iron to spare" · [vendor-bowerdeep] "The heavy snares now, the ones that'll hold near enough anything" · [vendor-cindershelf] "No heavy snares since the contract closed… What I have got is plain snares" · [vendor-duskhollow] "there's a strong snare in the drawer under the counter that I've had eighteen months" · [sel.tale.4] "Take the heaviest snare you've got"

**Proposed fix.** Fix one spoken name per tier and hold it across all six speakers — plain / weighted / the smith's best reads naturally in every mouth. Then let characters vary the framing, not the noun: "none of the smith's best in since the contract closed", "a weighted one in the drawer I've had eighteen months", "take the best snare you've got".

---

## 44. [MAJOR] maribel.pre / maribel.post.win / noct.pre
*(found by `?`)*

**Problem.** Four of five gym leaders field animals aged 11 to 20 in a world whose stated working life is three years, and the rewrite made two of those ages numerically explicit for the first time. Maren teaches the three-year rule in the opening cutscene and the player meets a twelve-year-old Nibbin at the first gym, one building away. This is the premise of the never-cut Legacy beat being contradicted by the first opponent in the game, and the corpus now states the age three times rather than gesturing at it.

**Evidence.** [maren.opening] "A young animal like that has about three years of work in it, and at the end of the three it comes back here to the station and stops. That's the same for whichever one you take."   [maribel.pre] "Old Nib's twelve this spring. She's been slow since she was about eight" · [maribel.post.win] "She's twelve. She'd far sooner stand than move." · [noct.pre] "Then the Duskstalk. I've had her twenty years." (OLD noct text was vague: "a Duskstalk Elder that has been on my team since before the observatory had a roof.") · [sable.post.win] "Eleven years I've had her"   balance.json: age.yearsInClass = {J:1, A:1, E:1}

**Proposed fix.** Either soften the ages back to the old vagueness, or — better, because it is a real answer and costs one clause — have Maren name the exception she is already almost naming: three years of WORK, then the animal is retired and lives on, and a gym leader's bench is animals long past their working years who fight standing still. Maribel already says Old Nib "doesn't have to chase anything", which is that idea; let Maren set it up so the player is not caught out.

---

## 45. [MAJOR] corpus-wide — data/dialogue.json speakers[]
*(found by `?`)*

**Problem.** Five coined given names are spoken in lines, but the fragments contain only `entries` — `speakers[]` was never touched, so every display name is still a role label. Corbett self-introduces and survives. Ingram, Effie, Whit and Zeb resolve to nobody the player can find: the person the corpus calls Ingram wears the nameplate "Lampwright", Effie wears "Innkeeper", Whit wears "Lamp-Keeper", Zeb wears "Night Market Vendor". Appendix A7's fix (the Duskhollow oil trade is Ingram's, Hesk grumbles) depends entirely on the player knowing who Ingram is, and they cannot.

**Evidence.** [amb.duskhollow-elder.base] "Ingram will tell you his oil is as good as it ever was, and Ingram would, wouldn't he." · [vendor-duskhollow.shop] "The observatory takes its lamps off Ingram direct." — but duskhollow-lampwright's speakers[] name is "Lampwright".   [amb.bowerdeep-elder.base] "Whit will tell you he has been lighting that walk since before I was born" — bowerdeep-lampkeeper's name is "Lamp-Keeper".   [amb.bowerdeep-child.base] "then Zeb shouted at me" · [amb.bowerdeep-silkwinder.base] "Zeb's lad goes round the market telling people the moths make the silk" — vendor-bowerdeep's name is "Night Market Vendor".   [amb.duskhollow-elder.base] "Effie tells me to shut my shutters at night" — innkeeper-duskhollow's name is "Innkeeper".

**Proposed fix.** Rename the four speakers in `data/dialogue.json` `speakers[]` in the same commit: duskhollow-lampwright -> "Ingram", bowerdeep-lampkeeper -> "Whit", vendor-bowerdeep -> "Zeb", innkeeper-duskhollow -> "Effie". Then add Appendix C5's ONE-WAY assertion (every token in every `speakers[].name` resolves to CAST_NAMES ∪ BIBLE_NAMES ∪ COINED_NPC_NAMES) and do NOT invert it — `dialogue.test.ts:564` exists to stop the file certifying its own inventions. If the display names are deliberately staying as role labels, then the four names must come OUT of the lines instead.

---

## 46. [MAJOR] corpus-wide — the G2 allow-list amendment (the verbatim deliverable)
*(found by `?`)*

**Problem.** I re-ran the test's rule A and rule B logic over the merged 212-entry / 500-line corpus. RULE B: zero offenders. RULE A: 13 offending tokens resolving to 11 base names — five coined cast names actually spoken, and six ordinary English words the scan cannot clear because they appear only sentence-initially or in an all-caps sign header. Note that only 5 of Appendix D's 41 names are spoken anywhere in the corpus; C5 nonetheless mandates allow-listing all 41 in a new capped list so a later cross-reference does not red the suite, and I verified every one of C5's defence assertions against shipped data.

**Evidence.** RULE A offenders, verbatim from the scan: Anyone (prop.duskhollow-sign-observatory: "Anyone who wants to read it may come up and read it where it sits.") · Aye (amb.cindershelf-miner.base: "Warm? Aye, the third shaft's warm.") · Corbett ×3 · Effie, Effie's (amb.duskhollow-elder.base) · Ingram ×4 · Key's (innkeeper-bowerdeep.rest: "Key's on the hook by the stair") · Lantern (pell.greeting: "Lantern road's mine." — corpus has lowercase "lanterns" but never "lantern") · Otherwise (innkeeper-bowerdeep.rest) · STAR (prop.duskhollow-sign-observatory: "STAR CENSUS — ground identities, recorded and dated.") · Whit ×2 · Zeb, Zeb's ×3.   VERIFIED: zero of the 41 collide with any species form/dexId, node id or display word, gym name, nickname, trait name, move name, type, role, status or DOMAIN_NOUN; zero first-three-letter collisions among the 41; zero lowercase homographs in the new corpus; none of the six new ordinary words is a species name, place head, or trait word.

**Proposed fix.** In tests/unit/dialogue.test.ts: (1) append these six to ORDINARY_WORDS, keeping it alphabetical — "Anyone", "Aye", "Key", "Lantern", "Otherwise", "Star" — taking it from 36 to 42 against its cap of 45. (2) Add a NEW capped list, declared as a literal ABOVE `const KNOWN_NAMES` so the :564 no-raw.speakers guard still passes: `const CAST_NAMES = ["Aldis","Kett","Judd","Tibb","Rask","Tamsin","Mott","Elsbet","Hild","Gunn","Parnel","Jem","Ulla","Corbett","Yule","Zeb","Garrow","Cass","Fitch","Dunstan","Whit","Berit","Annis","Snell","Nunn","Ebba","Cob","Rowe","Effie","Hesk","Bly","Idony","Fay","Ingram","Alwin","Isbel","Vann","Hurst","Slade","Pinder","Dorn"] as const;` (3) Spread CAST_NAMES into BOTH `KNOWN_NAMES` and the `accounted` set inside "every unaccounted capitalised token resolves to a shipped species". (4) Add `expect(CAST_NAMES.length).toBeLessThanOrEqual(48);` to the cap block and leave BIBLE_NAMES (6, cap 8) and COINED_NPC_NAMES (7, cap 8) at their exact current values. With this applied I measured rule A = 0 offenders, rule B = 0 offenders, and the species-resolution test yields 35 names (needs >=15) with zero non-species leftovers.

---

## 47. [MAJOR] maren.quest.first-signs.offer
*(found by `?`)*

**Problem.** The line that teaches the player the dormant/migrating mechanic teaches it backwards, and the prop sign standing on the same node states the rule correctly. core/foodweb.ts:473 returns `distance === 1 ? "migrating" : "dormant"`; balance.clock.seasonOrder is [spring, summer, autumn, winter]; Pollywisp's seasonalWindow is "spring". Summer is distance 1 from spring, so a Pollywisp card read in summer comes back MIGRATING. dialogue.test.ts's seasonal register checks only that the named season matches seasonalWindow, so this passes green — it is invisible to the gate and visible to the player on the first foray of the tutorial quest.

**Evidence.** maren.quest.first-signs.offer L2: "Pollywisp are a spring animal on the Reach. Read a card on one in summer and it comes back dormant, and you'll not meet a Pollywisp out there in summer however long you walk." Contradicted by prop.r1-sign-forage L1, on Meadow Reach: "a card marked MIGRATING means the animal's season is the one just before this one or the one just after, so it is on its way in or out. A card marked DORMANT means the animal's season is further off than that".

**Proposed fix.** Either change Maren's word to 'migrating', or move her example to a species where 'dormant' is true in the season she names — Ives already has the correct pairing at ives.quest.census.offer L2 ('A Wispurr you can't find in summer', winter window, distance 2 = dormant). Then extend the seasonal register in dialogue.test.ts to assert the WORD as well as the season, by calling migrantStatus, so this class of error is machine-caught next time.

---

## 48. [MAJOR] vendor-cindershelf.shop
*(found by `?`)*

**Problem.** The only bait line in Cindershelf is inverted on both halves against core/foodweb.ts's baitMatchFor. Ashvole is a Steppe Grazer, and neither Cindershelf nor r4 ships a creature Producer (DEVIATIONS D12), so ashvole-line's derived diet is EMPTY — no species bait can ever match an Ashvole. The code comment at core/foodweb.ts:576-582 exists precisely for this case: 'the cheap role-generic Producer bait would match nothing at exactly the nodes where a Grazer is the only thing to bait', and the flora extension makes the CHEAP Producer role bait the only thing that works. That same cheap bait also matches Cragmar, the other flora-feeding Grazer at both Steppe nodes. So the expensive single-species bait does not exist and the cheap one is not only available but universal.

**Evidence.** vendor-cindershelf.shop L1: "The ash bait brings an Ashvole and it brings nothing else, so I've no cheap one to stand beside it." Against core/foodweb.ts:569-583 — `if (diet.includes(baitTag)) return "species"` (diet is empty for ashvole-line at r4/cindershelf) and `if (feedsOnFlora(resolved, targetLineId) && FLORA_ROLE_TAGS.has(baitTag)) return "role"`.

**Proposed fix.** Flip it: the cheap bait is the one that works up here and it brings Cragmar as well as Ashvole. Something like — 'Only the cheap bait works on this steppe. Nothing grows up here for anybody to cut a proper one out of, so it's the cheap mat or nothing, and it'll fetch you a Cragmar as often as an Ashvole.' Cross-check the same rule against vendor-brackwater's reed bait (correct as written — sporantle-tagged bait matches only Reedrick in the marsh) and vendor-duskhollow's Wispurr bait (correct — umbrat-tagged bait matches Wispurr).

---

## 49. [MAJOR] vesper.pre / halder.quest.silk.offer / halder.quest.silk.accepted
*(found by `?`)*

**Problem.** The moral arithmetic of the silk quest is computed against the wrong node, and the two speakers disagree about which node it is. Vesper's figure of six is Bowerdeep the TOWN (bowerdeep.json webvern-line count = 6). Halder's order is off Bowerdeep WILDS, which he says twice, and r3.json webvern-line count = 8. So 'Six, and he wants three' is 8-and-he-wants-three at the node the player will actually catch them in — and Halder attributes her figure to the Wilds while she says she walked the town canopy. This is the load-bearing number in the only quest in the game that stages a conservation argument, and nothing in the corpus flags the mismatch as a methodology dispute.

**Evidence.** vesper.pre L2: "I walked the town canopy myself in the last week of summer and I made it six Webvern. Six, and he wants three." · halder.quest.silk.offer L1: "Her case is that three grown Webvern out of the canopy over Bowerdeep Wilds is more than that canopy puts back in a year. She walks those high lines herself and she has a figure for what's up there". · halder.quest.silk.accepted L1: "They hang in the high lines out in Bowerdeep Wilds, above where the loggers are cutting."

**Proposed fix.** Pick one node and make both mouths say it. Simplest: change Vesper's line to "I walked the Wilds myself in the last week of summer and I made it eight Webvern. Eight, and he wants three" — that is the true r3 count and the arithmetic still carries her case. Alternatively keep her six and make it an explicit methodology fight (she counts the town canopy, he orders off the Wilds, and neither will use the other's transect), which would be better in voice but needs a line in Halder's mouth acknowledging it.

---

## 50. [MAJOR] amb.brackwater-buyer.base
*(found by `?`)*

**Problem.** An unconditioned ambient quotes a live node count with no `population` clause, and it is the count on the game's headline demo beat. r2.json fenmaw-line count = 3, and Corbett states that figure with `when: {}` — so it fires in every year and every act. The only alternative variant, amb.brackwater-buyer.lowseason, is gated `yearMin: 3`. Demo beat 1 is 'hammer a prey species in year 1; open year 2 with its predator gone', so in the exact scenario the video is built around, Corbett stands on the dock in year 2 stating the pre-crash figure while the survey screen shows zero. This is a regression this rewrite introduced: the old line quoted no number at all. It also defeats dialogue.test.ts's 'a line that quotes the live ledger reads the live ledger' assertion, which exists for precisely this defect (D12).

**Evidence.** NEW amb.brackwater-buyer.base L2: "The warden had three Fenmaw out in that marsh the last time she walked it, and Fenmaw take Mirefin, and Mirefin is the animal my contract is written on." OLD line for the same beat carried no figure: "The Fenmaw at the top of that marsh keep the Mirefin spread out. Sounds backwards. It isn't."

**Proposed fix.** Either drop the numeral from the base line (the diet claim and the contract point both survive without it — 'The warden has Fenmaw out in that marsh, and Fenmaw take Mirefin, and Mirefin is the animal my contract is written on'), or split it into population-gated variants the way sel.docks.rotting/rebuilt already do, and drop the `yearMin: 3` on lowseason so a year-2 crash has somewhere to land. Then classify the entry in COUNT_CLAIM_REVIEW as `live`.

---

## 51. [MAJOR] vesper.post.loss
*(found by `?`)*

**Problem.** Vesper asserts an unconditional turn-order guarantee the battle engine does not grant. Her Webvern's role move is Ambush ('60 power, always first on entry turn'), whose effect is `{kind:"priority", scope:"entryTurn"}`, and core/battle.ts:1296 grants the priority only when `battler.enteredOnTurn === state.turn` — her own entry turn, once. Every turn after that is decided on Speed, and a player can outspeed a level-22 Elder Webvern (Silk-Spun is +10% spd, rare, not a priority effect). Because Vesper is written as the scrupulously accurate character elsewhere — 'I would rather tell you that now than have you find it out halfway through' — the overclaim reads as an authoring error rather than a boast, and the player disproves it in the second exchange.

**Evidence.** vesper.post.loss L0: "She gets her strike in before whatever you send at her, every single time, however quick the animal is, and I have never once seen her beaten to it." Against core/battle.ts:1294-1296 and data/moves.json `ambush` → `effects: [{"kind": "priority", "scope": "entryTurn"}]`.

**Proposed fix.** Scope it to what the engine does: "She gets her strike in the moment she comes out, before whatever you've got standing there, however quick it is. After that she's on her own speed like anything else — but that first one is usually enough." Same check is worth running on vesper.pre L1 ('She is the fastest thing I have ever handled') — that one is fine, it is a comparative, not a guarantee.

---

## 52. [MAJOR] amb.duskhollow-shepherd.base
*(found by `?`)*

**Problem.** An unconditioned ambient goes flatly false at the story's biggest beat, in the mouth of the one character positioned to know better. The Sanctum gate stands open from act 6; Maren, Wick and the Cullbrand scout all remark on it. The shepherd has `when: {}` and no act-6 variant, and he tells the player he walks past that gate twice a day. Once the player has walked through the gate themselves, he is still saying it has never been opened.

**Evidence.** amb.duskhollow-shepherd.base L2: "The Sanctum gate is up at the head of the vale road. It hasn't been opened in my lifetime that I know of, and my father said the same about his. I go up past it in the morning with the dogs and I come back down past it at dusk." Against maren.greeting.act6: "The gate is standing open. It hasn't been open in my lifetime." and amb.sanctum-approach-scout.base L2: "The gate was already open when we got here."

**Proposed fix.** Add an act-6-gated shepherd variant (`when: {actMin: 6}`) — he is the best possible witness for it, since he is the only person in the game who passes it daily and would notice the morning it changed, and it costs nothing: give it his three lines' worth or reuse the beat. If a new entry is out of scope, re-cast L2 so it survives the change ('I go up past it in the morning with the dogs and come back down past it at dusk, and the step at the foot of it stays dry, which is the only reason I ever stop there') and move the never-opened claim to a character who does not walk past it.

---

## 53. [MAJOR] odo.post.win
*(found by `?`)*

**Problem.** CONTENT TRUTH: Odo states a diet the food web does not derive, and the error is newly introduced. Bogling is the J form of mirefin-line, whose role at webRoleAgeClass 'A' is Mesopredator, so core/foodweb.ts derives its diet at brackwater/r2 as [reedrick-line] and nothing else. Sporantle is a Producer and is NOT in that diet. Because baitMatchFor() matches a species bait only when the bait's tag is in the target's derived diet, a player who takes Odo at his word and buys a Sporantle bait to catch Boglings gets "none" — and Boglings are exactly what Hetty's quest one street away asks for four of. The engine's own rule is stated correctly two entries earlier by Maren ("You make bait out of whatever the animal you're after eats"), so the corpus contradicts itself on the mechanic it just taught.

**Evidence.** NEW odo.post.win[0]: "The small ones, now. They live on weed and on Sporantle off the bottom, and they stay that size about a year. Bogling, we call them, while they're small. After that they're up in the reed edge taking Reedrick and we call them Mirefin."  ·  BASELINE odo.post.win[0]: "You read the metamorphosis. Bogling grazes, Mirefin hunts, and the marsh still counts them as one line either way." (vague, and therefore not falsifiable)  ·  Derived: brackwater DIET mirefin-line -> ['reedrick-line']; sporantle-line role=Producer.

**Proposed fix.** Keep the metamorphosis point, drop the invented prey. "The small ones stay that size about a year, and they take the same Reedrick the big ones take, just smaller ones. Bogling, we call them, while they're small..." — same beat, same voice, and it now agrees with the bait rule. Note that this entry is also one of the three over the 400-char cap, so it is being touched anyway.

---

## 54. [MAJOR] innkeeper-hearthollow.rest, innkeeper-brackwater.rest, innkeeper-bowerdeep.rest, innkeeper-cindershelf.rest, innkeeper-duskhollow.rest
*(found by `?`)*

**Problem.** Tutorial information was deleted along with the vocabulary that carried it. Resting at an inn costs balance.clock.innTicks = 2 of a 4-tick season — the most expensive action in the game, double a travel or a foray (travelTicks 1, forayTicks 1). Four of the five baseline innkeepers said so as "two ticks". The rewrite correctly removed "two ticks" (banned system vocabulary, and the measured diagnosis's single worst offender) and replaced it with nothing. Grepping the whole new corpus finds no line anywhere that tells the player resting costs time. The brief is explicit: "Tutorial information still has to reach the player, but through what a person would actually say while showing you" — the deletion satisfied the first half and dropped the second.

**Evidence.** BASELINE: innkeeper-hearthollow "Bed's two ticks off the season meter and everything you're carrying comes back up to full."; innkeeper-brackwater "Two ticks, full heal..."; innkeeper-cindershelf "Two ticks."; innkeeper-duskhollow "Two ticks, and the shutters stay open...".  NEW, all five, full-heal only: "Your animals will be right by the morning" / "Your creatures will sleep, and they'll be sound again when you come down" / "the ones you brought in come down fit for the evening" / "your creatures will pick up by the time you're down" / "your animals will have come round by daylight all the same".  balance.json clock: { ticksPerSeason: 4, travelTicks: 1, forayTicks: 1, innTicks: 2 }.

**Proposed fix.** One innkeeper — probably Aldis at Hearthollow, since that is where the player learns everything else — says the cost in human units, once: "A night here is half a season gone, mind. If you've somewhere to be before the turn, sleep rough and keep the days." That is what an innkeeper would actually say, it names no tick and no meter, and it restores the only warning the player gets before spending the game's scarcest resource.

---

## 55. [MAJOR] tests/unit/dialogue.test.ts — six hand-curated review tables
*(found by `?`)*

**Problem.** The rewrite invalidates six review tables whose whole purpose is to force a human read when the copy moves. These are not defects in the prose, but they are unmerged work and G14 says nothing is done before its named tests pass. Reporting them because each row that changed is a claim somebody must re-read, and the count of changed rows is large enough that skimming them is how a real error gets through.

**Evidence.** DIET_LINE_REVIEW (predation-verb count per entry): 10 diffs — NEW innkeeper-duskhollow.rest ("hunting for it in the dark"), maren.starter.puddlisk ("what something had been eating"), maribel.greeting ("She's eating, just not much"); GONE amb.cindershelf-elder.base, amb.hearthollow-elder.base, amb.r1-forager.bloom, maren.crash-survey, odo.post.win, sel.quest.wager.accepted, vendor-bowerdeep.shop.  ·  ACT_GATED_YEAR_CLAIMS: 13 diffs (8 new entries now name a year span incl. maren.greeting.act3/.act5, maren.keystone.3/.6, bram.warm.2; 5 reviewed entries no longer do, incl. greaves.finale.pre, wick.act6.win, sel.quest.wager.offer).  ·  CALENDAR_YEAR_CLAIMS: extra amb.brackwater-buyer.lowseason, amb.r1-forager.bloom, bram.mine.expanding; missing amb.brackwater-dockhand.rebuilt, amb.r1-forager.late.  ·  COUNT_CLAIM_REVIEW: 30 extra entries now name a count, 4 reviewed ones no longer do.  ·  FLORA_CLAIM_REVIEW: expects 4 entries containing "flora stock"; the corpus now contains zero (correctly — it is banned vocabulary).  ·  D19 "six years" pin: expects exactly 6 entries, finds 2 (amb.brackwater-netmender.late, amb.hearthollow-fenceman.late).  Passing unchanged: vanishing duration (one value, '30'), Cullbrand steppe duration (['four','six']), chorus sentence check, G7 entry-body scan, all budget ceilings, all reachability/witness assertions.

**Proposed fix.** Re-derive each table from the merged corpus and re-read every row that moved, in that order — the tables are the review, so regenerating them mechanically without reading defeats them. Two need a decision rather than a regeneration: FLORA_CLAIM_REVIEW is now empty because 'flora stock' was correctly purged, so the assertion needs to key on the live-abundance CLAIM (maren.greeting.act1 still says "The green's holding up out on the Reach this year" behind its floraStock clause) rather than on the banned phrase; and the D19 six-years pin dropped from 6 to 2, which is Hank's ruling to close, not a table to silently shrink.

---

## 56. [MAJOR] corpus-wide (small-talk quota, 31 ambient speakers)
*(found by `?`)*

**Problem.** The single highest-variety slot in the design is the least varied thing in the corpus. §1's small-talk quota exists so each ambient speaker gets one line of three that is a person being a person — the bible's own list is "money, weather, a bad back, a neighbour, a delivery, a grievance about a rota". In the shipped corpus that slot is filled, for half the ambient cast, by one of exactly two templates: a body that has worn out, or a wage that has not moved. Weather never appears as small talk at all. The quota is technically met and the effect it was supposed to buy — texture — is not delivered.

**Evidence.** Body complaint, 9 of 31 ambient speakers (18 speakers corpus-wide): hearthollow-forager "There's nothing left in the right one — no gristle"; brackwater-elder "My knees are no good on the steps now"; brackwater-dockhand "It aches on the cold mornings now"; bowerdeep-logger "My back went two summers ago"; bowerdeep-lampkeeper "I'm slower round the walk than I was"; cindershelf-miner "My left ear's been no good since the year they cut the fourth shaft"; cindershelf-elder "My eyes aren't good enough for that shelf now"; cindershelf-worker "One writes about his knee"; r1-forager. Pay grievance, 7 more: brackwater-dockhand "I'm on the same day-rate as the lad who ties her off"; bowerdeep-silkwinder "The rate for a bolt hasn't shifted since the spring before last"; bowerdeep-child "he never has a copper on him when he comes back"; hearthollow-fenceman "Posts and wire cost more than they did"; r3-logger "none of that is paid time"; r4-worker "it's less than they paid me to lay it"; r5-astronomer.

**Proposed fix.** Redistribute roughly eight of the sixteen. The registers the corpus already proves it can write and barely uses: weather (zero instances), food, a delivery that came in wrong, a rota, a dog, a wedding, a debt owed the other way, something the speaker is simply pleased about. Two speakers already show what it looks like — the r2 ferry-hand's flat insistence that his boat is not slower, and the Bowerdeep child's moth down the collar — and neither is an ache or a wage. Note this is the same disease as the closer finding at a different scale: one writer reaching for one register.

---

## 57. [MAJOR] corpus-wide — 31 of 62 speakers
*(found by `?`)*

**Problem.** THE HEADLINE. The banned tenure-credential opener (B4) is now the corpus's default way of establishing a speaker, and it combines with two other shared shapes into a single house stance: state your years → assert an absolute negative → report saying it twice and being ignored. Measured across all 13 fragments: tenure credential in 31 of 62 speakers (95 hits); "I have never (once)…" in 17 speakers (37 hits); "said/asked it twice" / "both times" / "nobody could tell me" in 25 speakers. 22 speakers carry ≥2 of the three; 9 carry all three (maren, sel, wick, hearthollow-elder, hearthollow-child, r1-forager, r2-ferryhand, cindershelf-miner, bowerdeep-silkwinder). The cap is TWO. This is the direct successor to the old "Nobody…" opener shared by 24 of 62 — same defect, new subject matter, which is precisely how the corpus failed the first two times. It also re-imports B15: making almost every speaker a correct person who is not listened to is universal competence dressed as pathos.

**Evidence.** tenure: sel "I've had this crossing forty-one years, six trips a day" · gerta "Thirty-one years I've been down the third shaft" · brackwater-buyer "I have been doing it for thirty years" · hearthollow-elder "I had cattle on the Reach fifty-two years" · brackwater-dockhand "I've been at this since I was seventeen" · bowerdeep-silkwinder "I've been pulling it off the frames since I was fourteen" · bram "I've had this warm floor under my feet my whole working life" · vesper "I caught all five myself, from the ground, over eleven years" — plus 23 more. ignored: sel "I've told the harbourmaster about those two pilings twice. He has written back both times to say that he agrees with me." · r1-forager "I've told her so twice, and she just says her bit again the year after." · bowerdeep-silkwinder "I've asked about it twice and both times I got the same answer" · hearthollow-farmhand "I need them for getting the crop in. I've told him that twice." · duskhollow-elder "I've said all of that to Effie twice this week. She agreed with me both times and I'm still buying the oil." · wick "I asked about it twice and I got nothing back either time." · cindershelf-miner "She's had that wrong about me for twenty years and there's no shifting her off it."

**Proposed fix.** One integrator pass, no line rewriting needed beyond deletion. (1) Strip the tenure figure from roughly twenty of the thirty-one — the specificity floor is already met by their objects and places (a netmender has gauges, a dockhand has a rope and a day-rate), so the years are redundant, not identifying. Keep tenure where it is the point: Gerta's thirty-one years IS her character, Sel's forty-one years is the joke, Maren's eleven years is the arc. (2) Cut "I have never once…" to at most two speakers. (3) See F4 for the third leg. (4) Give at least six of the nine all-three speakers the opposite stance — someone who WAS listened to, someone who never said anything, someone who was wrong and got corrected and doesn't mind.

---

## 58. [MAJOR] corpus-wide — 25 speakers, 43 uses
*(found by `?`)*

**Problem.** "Twice" and "both times" have become the corpus's shared rhetorical beat — B17 (precise numbers used as cadence) at scale. Forty-three uses across twenty-five of sixty-two speakers, and in most of them the number is doing rhetorical work rather than reporting a real count: it is the writer's tic for 'this has been going on'. It is the load-bearing half of the unheeded stance in F3, and it is the single easiest thing to measure and to fix.

**Evidence.** odo "Two of them have asked me when it comes back. Both of them asked me twice." · sable "He's turned me away twice over that, and both times he was right, and both times I walked back down with the thing still in my hand." · r4-worker "We had the winch on it twice. The winch gave out both times" · gerta "The eight moved twice. Both times it went to fourteen" · maren "I've asked him twice how he knows and got a story both times" · tolm "I said it to you twice over before you agreed to it" · bram "I have made a noise about it twice already" · wick has seven uses on his own · plus 18 more speakers.

**Proposed fix.** Cap it at two speakers. Gerta's "The eight moved twice. Both times it went to fourteen" is a real measurement and should survive; Sable's "both times he was right" is her voice. Everywhere else, delete the count or replace it with the ordinary way a person says the same thing — "I keep telling him", "he's heard it from me before", "I've stopped asking", or nothing at all. Do not substitute "three times" — that is the same defect with a different number.

---

## 59. [MAJOR] amb.brackwater-buyer.base L2
*(found by `?`)*

**Problem.** The only line in the corpus that states a live population as a hard number is ungated. Its `when` is `{}` with no priority; the `.lowseason` variant that would replace it requires `yearMin: 3` AND r2 fenmaw ≤ 1. Brackmarsh ships with fenmaw count 3 (data/nodes/r2.json), so the line is true at world-start and false the moment the player touches the marsh — which the never-cut demo beat instructs them to do in year 1. In years 1–2 the player can stand in Brackwater with zero Fenmaw in Brackmarsh, open the survey, and hear Corbett say there are three. Every other live-number line in the corpus is population- or flora-gated (maren.crash-survey on stonewing ≤ 1, sel.docks.rotting on mirefin ≤ 4, amb.hearthollow-elder.thin on floraStock ≤ 45); this one is not.

**Evidence.** amb.brackwater-buyer.base L2 (when: {}): "The warden had three Fenmaw out in that marsh the last time she walked it, and Fenmaw take Mirefin, and Mirefin is the animal my contract is written on."

**Proposed fix.** The rewrite may not change `when`, so fix it in the text: make the figure explicitly second-hand and stale, which is also more in voice for a man who prices off a schedule and files everyone else's numbers. "The warden's last marsh figure had Fenmaw in it, and Fenmaw take Mirefin, and Mirefin is the animal my contract is written on." If the integrator is allowed to touch conditions, the cleaner fix is to drop `yearMin: 3` from `.lowseason` so the low-season variant can fire in year 1.

---

## 60. [MAJOR] ives.quest.census.offer L0, ives.quest.census.milestone L1, prop.duskhollow-sign-observatory L0
*(found by `?`)*

**Problem.** One piece of system vocabulary survived the purge, in the one character built around the counting system. "Identity" / "identities" is the schema's own noun: data/species.json carries `"_counts": {"lines": 27, "dexIdentities": 35}` and the quest engine's objective kind is literally `dexIdentitiesRisen` (game/quests.ts:265). Ives says "Thirty-five identities" and the number is 35. This is DEFECT 1 exactly — a character reading a field name aloud — and the prose linter's TOOLTIP list does not contain the word, so no mechanical check caught it. Nobody, naturalist or otherwise, says "thirty-five identities".

**Evidence.** ives.quest.census.offer L0: "I want a card for every animal you've taken and kept. One card each, by identity — which means the Bogling gets a card and the Mirefin gets a card" · ives.quest.census.milestone L1: "Thirty-five identities in the full census, and nobody in Fallowmere has all thirty-five written down." · prop.duskhollow-sign-observatory L0: "STAR CENSUS — ground identities, recorded and dated."

**Proposed fix.** Use the word a person cataloguing animals would use, which the line already supplies in its own gloss: "One card each, by name — which means the Bogling gets a card and the Mirefin gets a card, because they don't look alike"; "Thirty-five names in the full census"; "STAR CENSUS — ground animals, named and dated." No mechanic changes; `dexIdentitiesRisen` stays where it belongs, in the engine.

---

## 61. [MAJOR] vesper.pre L2 vs halder.quest.silk.offer L1 and halder.quest.silk.accepted L1
*(found by `?`)*

**Problem.** The number at the centre of the game's one genuinely two-sided argument is attached to the wrong place. Vesper's figure is for the TOWN canopy (data/nodes/bowerdeep.json, webvern count 6 — her "six" is exact and beautifully verified). Halder's order is filled from Bowerdeep Wilds (data/nodes/r3.json, webvern count 8), as his own acceptance line states. But Halder summarises Vesper's case as being about the Wilds canopy, and Vesper answers with a count of a different node. Three texts by three hands, and the six and the three are not measurements of the same thing. Nothing in the corpus signals that they are talking past each other, so it reads as an error rather than as characterisation.

**Evidence.** vesper.pre L2: "Halder wants three grown Webvern out of the canopy. He is not hiding that... I walked the town canopy myself in the last week of summer and I made it six Webvern. Six, and he wants three." · halder.quest.silk.offer L1: "Her case is that three grown Webvern out of the canopy over Bowerdeep Wilds is more than that canopy puts back in a year." · halder.quest.silk.accepted L1: "They hang in the high lines out in Bowerdeep Wilds, above where the loggers are cutting."

**Proposed fix.** Pick one canopy and make all three texts name it. The Wilds is the correct one because that is where the quest actually takes the Webvern from, so change Vesper's line to "I walked the high lines out in the Wilds myself in the last week of summer" and make her figure eight (r3 webvern = 8), or keep her six and have her say plainly that she has only ever counted the town side and that nobody has counted the Wilds — which is more in her voice and also fixes the prop sign at prop.bowerdeep-sign-market, whose struck-out "eleven / nine / seven" currently belongs to no node at all.

---

## 62. [MAJOR] orrin.quest.trail.done L2 vs maren.greeting.act5 and maren.keystone.5 L0/L2
*(found by `?`)*

**Problem.** The payoff line of the game's central mystery quest asserts something the player has already been shown to be false. Orrin says the idea of comparing their two records has never once occurred to either of them. But maren.greeting.act5 (act 5) has Maren in Orrin's archive every morning for a week reading his margins, and maren.keystone.5 has her reporting four days in it, quoting his opinion back, and having no answer for him. Both are reachable before orrin.quest.trail.done, which is gated only on the quest turn-in flag. The scene the whole Vellsire chain builds toward is undercut by two Maren entries the player has almost certainly already heard.

**Evidence.** orrin.quest.trail.done L2: "She has been working at the same question from the other end for as long as I have known her, and in all that time it has not once occurred to either of us to put the two sets of papers on one table." · maren.greeting.act5: "Orrin's archive goes back ninety years... so I've been up there every morning this week reading margins." · maren.keystone.5 L0: "I've been in that archive four days now, and I've read every one of those margin entries myself" · maren.keystone.5 L2: "Orrin says a book like that doesn't simply stop being written in, and I've not got an answer for him."

**Proposed fix.** Narrow Orrin's claim to what is actually still untrue: they have compared notes, but never laid the stones' evidence beside the book's. "She has been reading my margins all week and I have had the whole of her side of it. Neither of us had the stones. That is the piece that was missing, and you have just walked it in." Keeps the payoff, removes the contradiction, and is warmer besides.

---

## 63. [MAJOR] maren.finale L0, wick.act6.pre L0, amb.sanctum-approach-scout.base L0, greaves.finale.pre L2
*(found by `?`)*

**Problem.** Four speakers describe Greaves's ascent in what is nearly the same sentence, three of them opening on the identical noun phrase "Six teams" and pairing it with "a cradle... on rollers". The cap is two. Because these are consecutive beats in the finale, the player hears the same sentence three times in a row from three different mouths — the most conspicuous chorus in the corpus, in the corpus's most important scene.

**Evidence.** maren.finale L0: "Greaves went through about an hour ago. Six teams with him and a cradle up on rollers" · wick.act6.pre L0: "Six teams went with him, and a cradle on rollers that I saw the build sheet for" · sanctum-approach-scout L0: "Six teams went up the approach this morning. They took a cradle up with them on rollers, four men to a corner of it."

**Proposed fix.** Each of the three sees a different part of it, from a different job. Maren counts what went past her and how fast: "He went through about an hour ago and he never hurried a step of it." Wick has the paperwork and only the paperwork: "I saw the build sheet for the thing on the rollers. It's rated to carry the weight of a barge." The scout has his instruction and his empty sheet, and should not describe the ascent at all — he was told to write down what comes BACK. Nobody but the scout needs to say "six teams".

---

## 64. [MAJOR] maren.greeting.act6, noct.post.win L1, amb.duskhollow-shepherd.base L2, amb.sanctum-approach-scout.base L2
*(found by `?`)*

**Problem.** Four speakers own the same beat — "that gate has been shut my whole life / it is open now" — in the same construction (a lifetime span plus an absolute negative). Cap is two. Two of them additionally pair it with the corpus's other shared shape, "I have asked everyone and nobody could tell me", so the beat and the stance arrive together four times.

**Evidence.** maren.greeting.act6: "The gate is standing open. It hasn't been open in my lifetime. It wasn't me that opened it, and I've asked every person out here I can think to ask, and nobody has been able to tell me a thing." · noct.post.win L1: "It's been shut my whole life and my mother's before that. I've never been through it and I've never met anybody who has." · duskhollow-shepherd L2: "It hasn't been opened in my lifetime that I know of, and my father said the same about his." · sanctum-approach-scout L2: "The gate was already open when we got here... Somebody opened that gate before we arrived, and I do not know who"

**Proposed fix.** Keep it for Maren (it is her act-6 turn) and the scout (it is his job and his one act of disobedience). Noct should give the player directions and nothing else — "about a mile up past the last lamp" is already the useful half of his line. The shepherd already has the best version of a person who simply doesn't think about it and should keep only that: "The only time I stop there is to get a stone out of my boot, because the step at the foot of it stays dry."

---

## 65. [MAJOR] amb.bowerdeep-child.base L1
*(found by `?`)*

**Problem.** A false type claim that nothing in the corpus corrects, in a game where type is a mechanic the player acts on. Gloomgrub is the J form of gloomoth-line and is Poison/Plant (data/species.json); Dark/Wind is the ADULT Gloomoth. The child is the town's designated wrong person and his OTHER error is corrected on the page — bowerdeep-silkwinder explicitly rebuts "Zeb's lad" about the silk, which is a genuinely lovely cross-reference — but the type error is left standing, so the player has no way to read it as characterisation rather than as information. Content truth also asks that copy not be wrong about its own game.

**Evidence.** amb.bowerdeep-child.base L1: "Gloomgrub are the little ones and they're Dark and Wind already, everybody knows that, and then they go up in the high lines and they come back down twice the size with the wings on, and that's where the silk comes off them." (Gloomgrub J = Poison/Plant; Gloomoth A/E = Dark/Wind.) · amb.bowerdeep-silkwinder.base L2: "Zeb's lad goes round the market telling people the moths make the silk. The moths make no silk."

**Proposed fix.** Either make it true — "Gloomgrub are the little ones and they go up in the high lines and come back down twice the size with the wings on" (drop the types; the change IS the interesting part and it is real) — or extend the silkwinder's rebuttal by four words so the error is visibly the child's: "...telling people the moths make the silk, and that the little ones are already dark ones. They're neither."

---

## 66. [MAJOR] maren.tutorial.snare L2, vendor-bowerdeep.shop L2, vendor-duskhollow.shop L0, vendor-cindershelf.shop L0, vendor-hearthollow.shop L0
*(found by `?`)*

**Problem.** The top snare tier has four different names across five speakers and none of them is the word on the screen. SNARE_TIERS is `["base", "weighted", "master"]` (core/types.ts:292) and the snares pane labels rows by typesetting the id (game/battle-input.ts:207 via itemLabel), so the player reads "Master". The tutorial calls it "the smith's best", two shops call it "heavy", one calls it "strong". A player who has been told the tutorial word cannot tell whether "a strong snare in the drawer" is the middle tier or the top one, and the middle tier is the one the game's own feasibility gate assumes they buy (balance.json harness `snareTier: "weighted"`). The base tier is at least consistent ("plain" in all three shops), and "weighted" matches the UI — only the top tier is unnamed.

**Evidence.** maren.tutorial.snare L2: "A weighted one holds better, and the smith's best will hold nearly anything at all" · vendor-bowerdeep.shop L2: "The heavy snares now, the ones that'll hold near enough anything" · vendor-duskhollow.shop L0: "there's a strong snare in the drawer under the counter that I've had eighteen months" · vendor-cindershelf.shop L0: "No heavy snares since the contract closed"

**Proposed fix.** Pick one spoken word for the top tier and use it in all five places. "Heavy" is the best candidate: it is already used by two of the five, it reads as trade speech rather than as a tier name, and it sits naturally against "plain" and "weighted". Change Maren's "the smith's best" to "the heavy ones" (keeping her cost joke) and vendor-duskhollow's "strong snare" to "heavy snare". Note separately that vendor-hearthollow is the only shop that calls bait "mats" — since it is the tutorial shop, that second noun is worth losing too.

---

## 67. [MINOR] amb.hearthollow-child.base, amb.brackwater-child.base, amb.bowerdeep-child.base, amb.cindershelf-child.base, amb.duskhollow-child.base
*(found by `?`)*

**Problem.** All five children in five towns are built on one move: an adult forbids or denies something, the child announces continued defiance. Three of the five close a line on it, and two of those closers are near-identical sentences written by different agents working different slices. The cap is two speakers per construction.

**Evidence.** amb.hearthollow-child.base: "My da says I'm not to keep on at Maren about it and I am going to keep on at her about it." · amb.duskhollow-child.base: "…and Mother says we'll see when she means no, so I'm going up to ask him again anyway." · amb.brackwater-child.base: "Sel says sit in the middle and don't trail your hand in the water. I sit at the front. I trail my hand." · amb.cindershelf-child.base: "Nobody will take me down to see it… My brother says he'll tell on me if I go in the gym when there's a fight on. So I sit on the step outside the door." · amb.bowerdeep-child.base: "…he says next time, next time, and he's said next time three times now, and I'm still stood here minding it."

**Proposed fix.** Keep two defiant children. Rewrite the other three off different childhoods: one straightforwardly proud of a job an adult gave him who has a detail of it wrong; one frightened of something harmless who says so; one simply reciting at length something an adult told her, with no opinion attached. The cindershelf child's "Do you want to feel it? You have to be quick, because he comes back" is the best line any of them has and does not need the defiance frame around it.

---

## 68. [MINOR] festival.hearthollow (S8a-amb-hearthollow.json), L1
*(found by `?`)*

**Problem.** An ambient speaker delivers the G10 boxed-aging rule in second person, to the player. The brief reserves second-person instruction for Maren, Gerta, Bram, Orrin and the explicit shop lines, on the ground that nobody else is helping the player develop. This is a system fact routed through a droving elder who otherwise does not care the player exists. "Whatever you've got put away" also carries the faintest edge of a remark about storing animals out of sight — the one place in the entry where a neutral fact touches the player's own conduct.

**Evidence.** L1: "Every beast on the place gets a year older at the turn. It makes no odds whether it's been out on the grass all year or shut up in the byre where nobody's laid eyes on it since spring. It's a year older either way, the one in the byre the same as the one on the grass. I'd think it's the same for whatever you've got put away, but you'd know about that better than I would."

**Proposed fix.** Stop at "the one in the byre the same as the one on the grass." The byre/grass image already carries the rule and lands harder without the reach across to the player; the elder goes on talking about his cattle and the player draws the inference. If the rule must be explicit it belongs to Maren at the year turn or to the YearTurnScene copy, not to an ambient.

---

## 69. [MINOR] maren.epilogue.released, L3
*(found by `?`)*

**Problem.** In the branch where the player let the stag go, the closing line looks back at the catch as the awkward part of the record. "This part included" singles out the snaring as something a person might want left out — so the last sentence of the release ending gently characterises the player's earlier action as a blemish Maren is scrupulous enough to record anyway. Mild, and clearly meant as her completeness ethic, but it is the only sentence in either epilogue that evaluates rather than reports, and it sits in terminal position.

**Evidence.** L3: "I'll write in the book that you had that stag in a snare and that you opened the snare again. In nine years somebody is going to walk into the station and ask me why the numbers moved, and I'd rather they got the whole of it from me, this part included, than half of it off somebody who wasn't up here."

**Proposed fix.** Drop "this part included": "…and I'd rather they got the whole of it from me than half of it off somebody who wasn't up here." Nothing is lost — "the whole of it" already carries the completeness ethic.

---

## 70. [MINOR] odo.greeting.fishery-low (S3-gyms.json), L0
*(found by `?`)*

**Problem.** Of the fourteen depletion-gated entries in the corpus this is the only one that reports the consequence as human unhappiness rather than as a material fact. Every other one stays on things: soft timber, boards across the fourth shaft, a nest with nothing round it, no stick worth walking in for, two Nibbin in a whole tussock. "A miserable week of it" is feeling, delivered by a gym leader in the second town, immediately after the player has been catching Mirefin on r2 — the earliest depletion gate most players will trip. It does not accuse and does not moralise, so it is not a violation. It is the closest the corpus comes, and it is in the worst position to be the closest.

**Evidence.** L0: "Brackmarsh has gone quiet on Mirefin. — Hold on. The ebb's starting and I want to see what it takes off the near bank. — The fishery pays out less when the marsh is short, and the men on the stilts have had a miserable week of it. Two of them have asked me when it comes back. Both of them asked me twice."

**Proposed fix.** Convert the feeling to a fact and let the player supply the feeling: "The fishery pays out less when the marsh is short, so the men on the stilts have been on a bad week's money." The two men asking when it comes back already does the emotional work, and does it the right way round — through behaviour, not adjectives. (This line also carries the "asked me twice" tic from finding 3.)

---

## 71. [MINOR] corpus-wide — live-state entries
*(found by `?`)*

**Problem.** The live-state voice of the region leans negative, and three regions have only a negative voice. Counting condition gates across all 13 fragments: 14 entries fire on a depleted or thinned state, 9 on an abundant or recovered one. Brackwater and Cindershelf are properly balanced — sel.docks.rotting/rebuilt, dockhand.rot/rebuilt, bram.mine.closing/expanding are exemplary paired writing and should be the model. But Bowerdeep's ONLY live-state entry in the entire game is amb.bowerdeep-logger.thin; there is no counterpart anywhere in that town for a canopy that is holding. r3/barkhide, r2/reedrick and r4/stonewing likewise each have a depletion gate and no abundance gate. So in half the regions the world only ever speaks up to say it has got worse, and the player who keeps a region healthy is met there with silence.

**Evidence.** Depletion-only gates with no positive twin: amb.bowerdeep-logger.thin {"yearMin":4,"population":[{"node":"r3","lineId":"barkhide-line","op":"lte","value":4}]} · amb.r2-ferryhand.quiet (reedrick-line lte 10) · maren.crash-survey and amb.r4-worker.emptied (stonewing-line lte 1). Compare the balanced pair: sel.docks.rotting (mirefin lte 4) / sel.docks.rebuilt (mirefin gte 9).

**Proposed fix.** Add abundance twins for at least r3/barkhide and r4/stonewing, in the same plain register as the existing pairs — the logger with more marked stands than he can get to, the salvage worker watching two Stonewing lift off the rock above the cable run the way he already describes them doing when he started. Silence reads as disapproval when the only time the world speaks is to report a loss.

---

## 72. [MINOR] corpus-wide (line budget — the exact numbers to reconcile)
*(found by `?`)*

**Problem.** Every budget assertion in dialogue.test.ts passes on the merged corpus, but two have zero or near-zero headroom and the integrator needs the exact figures before touching anything.

**Evidence.** TOTAL: 212 entries, 62 speakers, 500 lines, 20 choices — exactly line-neutral against the shipped 212/62/500, so `raw._counts.lines` stays 500 (dialogue.test.ts:145) UNLESS the three over-length lines are split, which takes it to 503. LINE_COUNT band is 400–560 (the test was already raised from 400–500; Appendix C1's "one line of headroom" is stale). NAMED (n=17 ≥15): min 7 (ives) ≥6 ✓; median 12 ∈ [8,16] ✓; over-budget maren 70/72, wick 37/40, sel 32/34, bram 20/24 ✓; under NAMED_CEILING 18 — orrin 16, tolm 15, gerta 14, greaves 13, nessa 12, halder 11, maribel 10, odo 10, pell 10, vesper 8, sable 8, noct 8, ives 7 ✓. AMBIENT (n=31 ≥24): min 3 ✓; median exactly 3 ✓; max 9 — hearthollow-elder 9 and r1-forager 9 sit ON AMBIENT_CEILING with ZERO headroom. GENERIC: max 3, ceiling 6 ✓. PROP: prop-antler-stone 25, ceiling 30 ✓.

**Proposed fix.** Two things constrain any further edit. (1) Ambient median is 3 because exactly 20 of 31 speakers sit at 3; moving five of them to 4+ flips the median and reds `expect(median(counts)).toBe(3)`. Four is the maximum that may rise. (2) hearthollow-elder and r1-forager cannot gain a single line. If the three over-length lines are split, put the splits on maren/vesper/odo (all well under their ceilings) and update _counts.lines to 503 in the same commit.

---

## 73. [MINOR] vesper.pre vs halder.quest.silk.offer / halder.quest.silk.accepted
*(found by `?`)*

**Problem.** Vesper's figure is measured on a different node from the one Halder is harvesting, and nothing in the corpus notices. Her count of six is exactly right for the `bowerdeep` node (webvern-line: 6), so it is not a data error — but Halder's order is explicitly from `r3` Bowerdeep Wilds, where webvern-line is 8. The whole dispute therefore rests on two people quoting different places at each other, which is a genuinely good field-biology conflict that the writing never surfaces, so it reads as an authorial slip instead.

**Evidence.** vesper.pre: "I walked the town canopy myself in the last week of summer and I made it six Webvern. Six, and he wants three." — halder.quest.silk.offer: "three grown Webvern out of the canopy over Bowerdeep Wilds is more than that canopy puts back in a year" — halder.quest.silk.accepted: "They hang in the high lines out in Bowerdeep Wilds, above where the loggers are cutting." data/nodes: bowerdeep webvern-line=6, r3 webvern-line=8.

**Proposed fix.** Give Halder one clause that names the mismatch, in his own untroubled register — something like "and her six is the town canopy, mind, not the Wilds, which is the one place my order actually comes out of; I've put that to her and she says it's the same trees." That converts an invisible inconsistency into the methodological argument the brief asked for, costs one clause, and adds no line.

---

## 74. [MINOR] maribel.pre, maribel.post.win, noct.pre, sable.post.win
*(found by `?`)*

**Problem.** NPC-held creatures are given ages of 8, 11, 12 and 20 years, while data/balance.json sets age.yearsInClass to {J:1, A:1, E:1} and lifespanYears to {J:3, A:2, E:1} — a maximum of three years from Juvenile. Maren states the three-year rule in the opening cutscene, and the retirement-at-three beat is one of the two never-cut demo beats. The twelve-year-old Nibbin is PRE-EXISTING (it is in the shipped corpus at maribel.pre), so this is not a regression the rewrite introduced — but the rewrite added two more in the same family, which turns one oddity into a pattern the player will notice across three gyms.

**Evidence.** maren.opening: "A young animal like that has about three years of work in it, and at the end of the three it comes back here to the station and stops. That's the same for whichever one you take." vs maribel.pre "Old Nib's twelve this spring. She's been slow since she was about eight"; noct.pre "Then the Duskstalk. I've had her twenty years. She was in this room before I was."; sable.post.win "Eleven years I've had her and she's not been off her feet in this room before today." balance.json age.lifespanYears = {J:3, A:2, E:1}.

**Proposed fix.** Do not silently rewrite — G2 territory and the twelve is bible-adjacent (content-bible.md:133 fixes Old Nib as Nibbin (E), the age is not specified). Either (a) get an owner ruling that trained/penned animals outlive working ones and put ONE line somewhere saying so — Maren is the natural mouth for it and already scopes her rule to "whichever one you take" — or (b) bring Sable's and Noct's new numbers down to something inside the model and leave the pre-existing twelve alone. Log whichever in DEVIATIONS. Option (a) is better: it costs one clause and it stops three separate gyms reading as errors.

---

## 75. [MINOR] tests/unit/dialogue.test.ts KNOWN_GOOD
*(found by `?`)*

**Problem.** C4's prediction has come true: the G7 scanner's negative controls now quote lines that no longer exist in the corpus, including two of the exact aphorisms this rewrite was commissioned to kill. The controls still pass — they are string literals — so the test goes green while proving nothing about the shipped file. A scanner whose over-breadth check samples a deleted corpus is decorative.

**Evidence.** KNOWN_GOOD contains "The Company pays by the head and doesn't ask whose head. That's not sentiment. That's a price list." and "So the dock rots at the speed of the channel. That's not a saying. That's the accounting." — neither appears anywhere in the 13 fragments. Also stale: "Meadow Reach is thin on Nibbin this season. I breed mine at home, so my count doesn't move when the Reach's does." (the word "count" is now absent from the entire corpus).

**Proposed fix.** Replace all seven KNOWN_GOOD entries with lines actually present in the new file, chosen to sit near the patterns without tripping them — e.g. maren.greeting.act2 "My Brackmarsh numbers are three weeks old and it rained through most of those weeks, so take what I tell you about the marsh as a low estimate."; amb.r1-forager.thin "I walked the whole tussock this morning and turned up two Nibbin. Two."; wick.act1.pre "The Company pays by the head and it doesn't ask whose head." Do it in the same commit as the corpus swap, or the control silently detaches again.

---

## 76. [MINOR] sel.quest.wager.offer, sel.quest.wager.done, sel.tale.3
*(found by `?`)*

**Problem.** The last age-class enum still spoken aloud as a capitalised noun. "Elder" is on the DOMAIN_NOUNS allow-list so the G2 gate passes it, but the measured diagnosis banned age classes as spoken classes ("juvenile" as a spoken class, 4 uses, DEFECT 1). It is one speaker only and a fisherman plausibly has a word for a big old fish — but the capital letter is what makes it read as a game label rather than a trade word.

**Evidence.** sel.quest.wager.offer: "An Elder Mirefin, out of the channel, caught and brought back to this dock before the year turns. A big old one off the deep water, not one of the young ones out of the shallows." — the second sentence already says the whole thing in his own register. sel.quest.wager.done: "An Elder, and a heavy one at that."

**Proposed fix.** Lowercase it or drop it. "A big old Mirefin out of the channel, off the deep water, not one of the young ones out of the shallows" loses nothing — the quest's completion condition is checked in code, not in the noun. If the capital is wanted as the wager's formal term, keep it in the offer only and drop it from the other two.

---

## 77. [MINOR] corpus-wide (prose-lint.py)
*(found by `?`)*

**Problem.** Reporting the linter result as instructed: all 13 fragments return TOTAL 0 structural flags across all six checks (F3-EPIGRAM, F2-CATEGORY, B1-ANTITHESIS, F1-DANGLING, F2-EQUATION, TOOLTIP). Nothing remains to attribute to a writer who skipped the tool, and I found no line the linter should have caught but did not on its own terms. The caveat the brief asked for stands and is now concrete: the linter is blind to every one of the four whole-corpus defects above, because none of them is a sentence shape — the "never" chorus, the unheeded-grievance beat-ender, the six-speaker Sel gag and Sel's eleven-vs-twelve-foot pole all pass it clean.

**Evidence.** Per-fragment output, identical across S1–S9: "F3-EPIGRAM 0 hits across 0 speakers / F2-CATEGORY 0 / B1-ANTITHESIS 0 / F1-DANGLING 0 / F2-EQUATION 0 / TOOLTIP 0 / TOTAL 0 structural flags". Entry counts 32+24+22+18+14+25+18+14+13+7+8+7+10 = 212, matching the shipped file exactly.

**Proposed fix.** No action on the linter itself. If it is going to be run again after the fixes above, add one cheap corpus-level check it currently lacks and which would have caught the headline finding: flag any single word or two-word frame used by more than two distinct speakers (the diagnosis's own cap). That is a whole-corpus pass, not a per-fragment one, so it has to run over the merged file.

---

## 78. [MINOR] maren.epilogue.caught / maren.epilogue.released — S1-maren.json
*(found by `?`)*

**Problem.** Two separate issues in the game's last two entries. (a) `tests/unit/dialogue.test.ts` "the epilogue states the cost of each ending in numbers, not in judgement" asserts each body matches /rate|breeding|coefficient|count/i; both now match nothing, so the test fails — correctly, because the old copy said "runs at the base rate" and "It is a coefficient", which was exactly the tooltip register the rewrite was told to kill. (b) The two branches measure against different baselines, so the pair does not compose and the only stated consequence of catching is a negative one — which is how a game grades a choice.

**Evidence.** caught L3: "Whatever lives out there will bring on fewer young than it would with the stag loose in there."   released L3: "whatever lives in the Sanctum and along the Approach will bring on half again as many young as it would with the place empty."   Old caught: "Breeding in every node adjacent to the Sanctum runs at the base rate now."

**Proposed fix.** Change the test's regex to something the plain copy can satisfy — /young|breeding|four seasons/i — rather than changing the prose back. Then give both branches the SAME baseline: caught says the ground goes back to what it does with nothing in it; released says it brings on half again as many as it would with nothing in it. Same yardstick, both branches, no grade.

---

## 79. [MINOR] prop.r2-idol-shallows — S7-props.json
*(found by `?`)*

**Problem.** A surviving B1 negation-correction, in the exact phrasing Appendix A3 quoted as the original defect. It was moved down the chain rather than removed. It is also the last sentence of its display page, which is the F3 position. Separately: the calibrated prose-lint reports B1-ANTITHESIS at 0 hits corpus-wide, so the linter has a hole on the em-dash-plus-repetition form of B1.

**Evidence.** "The carving is the same as the carving at the dock, so far as that one can be seen at all. The eyes on this one were never cut — not weathered away, never cut."   (Appendix A3 cites the original as: "It has no eyes. Not weathered away — never cut.")

**Proposed fix.** State it once, flat: "The eyes on this one were never cut at all." And add the `X — not Y, <repeat of X>` shape to prose-lint's B1 detector, which currently misses it.

---

## 80. [MINOR] festival.brackwater / amb.cindershelf-worker.base
*(found by `?`)*

**Problem.** Two beats end on a three-beat punch cadence with a deflating third clause — the structural cleverness F3 forbids in a beat's last sentence, at zero tolerance. These are the two best jokes in the corpus, which is precisely why they are the two that break the rule. Everything else in the F3 scan (I checked all 212 entry-final sentences) lands on business, a request, a complaint or an unfinished thought, so the discipline is otherwise excellent.

**Evidence.** [festival.brackwater] "My mother waited on these steps. Her mother before her. I bring a stool now."   [amb.cindershelf-worker.base] "Two of them still write to me at the turn of the year. One writes about his knee. The other one has a boy now."

**Proposed fix.** Both survive with one more clause of ordinary business after them, which is what a person actually does after saying something like that. "I bring a stool now. My daughter fetches it down for me and takes it back up after."

---

## 81. [MINOR] amb.bowerdeep-child.base — S8c
*(found by `?`)*

**Problem.** The child states two falsehoods. The silk one is deliberate and works, because the silkwinder corrects it on screen in the same town. The type one is corrected by nobody, so it reads as an authoring error rather than as a child being wrong — and it is checkable by the player against the creature's own card. Gloomgrub is the J form: types Poison/Plant. Dark/Wind is the adult Gloomoth.

**Evidence.** "Gloomgrub are the little ones and they're Dark and Wind already, everybody knows that, and then they go up in the high lines and they come back down twice the size with the wings on, and that's where the silk comes off them."   species.json gloomoth-line: types {J:[Poison,Plant], A:[Dark,Wind], E:[Dark,Wind]}, formNames {J:Gloomgrub, A:Gloomoth}.   Correction present for silk only: [amb.bowerdeep-silkwinder.base] "The moths make no silk. It's Webvern that make it."

**Proposed fix.** Either extend the silkwinder's existing correction by one clause to cover the type claim, or drop "and they're Dark and Wind already, everybody knows that" so the child is wrong about exactly one checkable thing that somebody on screen fixes.

---

## 82. [MINOR] prop.r1-antler-south — S7-props.json
*(found by `?`)*

**Problem.** The south stone is completely ungated (`when: {}`) and refers to the north stone, which is gated behind `chain.vellsire.step1`. A player who walks the south end of Meadow Reach first — which is the ordinary thing to do before Maren has explained keystones — reads a description pointing at a stone they cannot yet read. This shape pre-dates the rewrite, but the new copy makes the forward reference more concrete than the old one did.

**Evidence.** NEW south (when={}): "The line runs off the broken edge, and it runs in the direction of the stone up on the north rise."   north (when={flagsSet:[chain.vellsire.step1]}): "A standing stone up on the north rise, cut from a single block of granite into branching antlers."   OLD south: "The line points at its northern twin."

**Proposed fix.** Either gate the south stone behind step1 as well, or make its description self-contained: "The line runs off the broken edge, north, toward the high ground."

---

## 83. [MINOR] FLORA_CLAIMS rows in tests/unit/dialogue.test.ts — amb.cindershelf-elder.base and vendor-brackwater.shop
*(found by `?`)*

**Problem.** Two FLORA_CLAIMS rows now describe copy that no longer exists, and they pass silently: the test only checks that the entry id still exists and that the edge is derivable, never that the entry still MAKES the claim. So the register quietly stops binding anything.

**Evidence.** Row `{entry:"amb.cindershelf-elder.base", node:"r4", grazer:"cragmar-line"}` — the new entry's only ecology line is "There were Stonewing on the west scarp when I was a girl. A pair of them, off the same shelf of rock, year after year." No Cragmar, no grazing.   Row `{entry:"vendor-brackwater.shop", node:"brackwater", grazer:"reedrick-line"}` — the new entry is a bait line: "It's a Reedrick bait and there's nothing else out there will look at it."

**Proposed fix.** Delete both rows in the integration commit, and add the missing half of the guard — for each claim row, assert the entry body still names the grazer, the way the seasonal-claims test already does with `expect(bodyOf(c.entry).toLowerCase()).toContain(c.season)`.

---

## 84. [MINOR] KNOWN_GOOD in tests/unit/dialogue.test.ts (Appendix C4)
*(found by `?`)*

**Problem.** The G7 negative controls still hardcode two of the exact lines this rewrite exists to kill. They keep passing, so the control keeps proving the scanner is not over-broad — but it proves it against copy that no longer ships, which is the definition of a stale test.

**Evidence.** KNOWN_GOOD contains: "The Company pays by the head and doesn't ask whose head. That's not sentiment. That's a price list." and "So the dock rots at the speed of the channel. That's not a saying. That's the accounting."

**Proposed fix.** Replace both with surviving lines that are genuinely at risk of a false positive — e.g. [amb.r4-worker.emptied] "The nest on the west scarp is empty. I go past it every time I'm up there for the rail, and there's nothing on it and nothing round it." and [amb.r1-forager.thin] "I walked the whole tussock this morning and turned up two Nibbin. Two."

---

## 85. [MINOR] maren.tutorial.survey — S1-maren.json
*(found by `?`)*

**Problem.** The tutorial that teaches the SURVEY screen never uses the word 'survey'. Maren calls it "the board" three times. `game/scenes/MenuScene.ts:560` labels the menu row "SURVEY". A first-time player is taught a mechanic under one noun and offered it in the menu under another. Separately, the beat still carries the skeleton of the forbidden reverent line the measured diagnosis quoted, softened but structurally intact.

**Evidence.** "And this is the board. Every place in the region down one side…" / "Read it off the board before you go out the north gate, then read it again when you come back in, and then you'll know what your morning came to."   (Forbidden original: "Read it before you set out. Read it when you come back. The difference between the two readings is the only report I want from you.")   MenuScene.ts:560 = "SURVEY".

**Proposed fix.** Have Maren name it once, in passing, the way a person names their own paperwork: "And this is the survey board." One word, and the menu row now matches. Optionally break the two-reading parallelism so the skeleton goes too.

---

## 86. [MINOR] corpus-wide — numeral tic
*(found by `?`)*

**Problem.** 'Eleven' is doing far more work than any other number: 17 uses across 10 speakers, including three unrelated characters with an eleven-year tenure, an eleven-foot pole, a rule eleven, a clause eleven, 211 lamps, eleven a head and eleven crossings. Individually every one is fine; at corpus scale it reads as the author's favourite number rather than as measurement.

**Evidence.** [maren.opening] "a fair part of eleven years" · [vesper.pre] "I caught all five myself, from the ground, over eleven years" · [sable.post.win] "Eleven years I've had her" · [sel.tale.1] "Eleven feet, near enough" · [innkeeper-duskhollow.rest] "That's rule eleven" · [amb.brackwater-buyer.lowseason] "it is clause eleven, and clause eleven sets the price" · [amb.bowerdeep-lampkeeper.base] "So I light the two hundred and eleven" · [wick.act1.pre] "which comes to eleven a head" · [amb.duskhollow-astronomer.base] "Eleven crossings in one night last winter"

**Proposed fix.** Redistribute. Vesper's and Sable's tenures do not need to match Maren's; the pole can be ten feet; rule eleven and clause eleven should not both be eleven. Leave Maren's eleven years — it is load-bearing and repeated deliberately across three of her entries.

---

## 87. [MINOR] data/dialogue.json _counts block
*(found by `?`)*

**Problem.** The fragments carry no `_counts`, and `dialogue.test.ts:137` asserts the file's own metadata is true against the file. The integrator must regenerate it or the very first test in the suite fails. I verified the correct values by merging all 13 fragments and diffing field-by-field against the shipped file: entry set identical (212, none added, none removed), line total identical (500), and zero `speaker`/`node`/`kind`/`priority`/`when`/`signChain`/`propId`/`setFlags`/`goto` fields lost or changed. The prose pass was structurally clean.

**Evidence.** Measured on the merged corpus: old entries 212 / new entries 212 / added [] / removed [] / total old lines 500 / new 500. No LOST FIELD, CHANGED, NEW FIELD, LINE-KEYS or CHOICE-GOTO diffs were reported by the field-by-field comparison.

**Proposed fix.** Set `_counts` to {speakers: 62, entries: 212, lines: 500}. If the four speaker renames in the coined-names finding are applied, `speakers` stays 62.

---

## 88. [MINOR] maribel.greeting.reach-thin
*(found by `?`)*

**Problem.** Maribel claims nine penned Nibbin in Hearthollow, but hearthollow.json's whole nibbin-line count is 8, and the player can read that figure on the survey screen while standing in front of her. The corpus itself establishes elsewhere that a named NPC's headcount of animals around a town IS the node count — tolm.quest.fallow.offer's twenty-four Loamunder is gated on `population hearthollow loamunder-line gte 24` and matches the node exactly. So the penned/wild distinction is not one the game's numbers actually draw.

**Evidence.** maribel.greeting.reach-thin L0: "Mine are penned up here and fed by hand, so I've got the same nine Nibbin I had in spring and I'll have the same nine at harvest." hearthollow.json: `nibbin-line {count: 8, carryCap: 24}`.

**Proposed fix.** Change nine to a number that cannot collide — six, or four — or drop the numeral ('I've got the same Nibbin I had in spring and I'll have the same at harvest'). Her point is the feed bill and Tolm's opinion of it, neither of which needs a figure.

---

## 89. [MINOR] prop.sanctum-antler-ring
*(found by `?`)*

**Problem.** The prop says the ring grass is the only green thing in the Sanctum, but sanctum.json ships floraStock 50 out of a floraMax of 100 — greener than Cindershelf (36), Cinder Steppe (42), Duskhollow (44) or the Approach (35) — and game/survey-view.ts:608 renders that number to the player as `flora 50.0/100.0`. A player who opens the survey on the same screen reads a mid-range flora stock against copy saying the place is bare.

**Evidence.** prop.sanctum-antler-ring L2: "The grass inside the ring is short and even, and it is the only green thing in the Sanctum Fallow. It has been grazed down close, and the dung lying in it has not dried out yet."

**Proposed fix.** Weaken the absolute — 'it is the only grass in the Sanctum Fallow that anything has been at' — which keeps the observation (something is grazing here) and stops competing with a number the HUD prints. Alternatively drop sanctum.floraStock toward the Approach's 35, but that touches sim state and is the more invasive fix.

---

## 90. [MINOR] amb.hearthollow-elder.base · maren.crash-survey · sel.quest.wager.accepted · amb.cindershelf-elder.base
*(found by `?`)*

**Problem.** The rewrite replaced explicit predation and grazing verbs with idiom throughout — good prose, but it silently un-anchors the only machine-checkable diet gate in the repo. dialogue.test.ts's PREDATION_VERB regex matches eats/hunts/stalks/preys/grazes/browses/feeds-on; the new phrasings ('after the Nibbin', 'live off', 'taking Reedrick', 'after the moss') match none of them. Four hand-reviewed DIET_CLAIMS / FLORA_CLAIMS rows now document claims their entries no longer visibly make, and amb.cindershelf-elder.base's FLORA_CLAIMS row (cragmar grazing at r4) has no Cragmar in the text at all any more.

**Evidence.** amb.hearthollow-elder.base L1: "Skir come over the hedge about dusk after the Nibbin in the tussock." (DIET_CLAIMS row: skir-line → nibbin-line @ hearthollow) · maren.crash-survey L1: "then the Pyrelisk that live off the pair of them" (DIET_CLAIMS row: pyrelisk-line → ashvole-line @ r4) · amb.cindershelf-elder.base now contains no Cragmar and no grazing verb, but holds a FLORA_CLAIMS row {node: r4, grazer: cragmar-line}.

**Proposed fix.** Do not put the verbs back — the idiom is better writing. Instead widen PREDATION_VERB to cover the paraphrases the corpus actually uses ('after', 'live off', 'take/taking', 'come to', 'work') when a species name is in the same sentence, re-derive DIET_LINE_REVIEW from the widened regex, and delete the FLORA_CLAIMS row for amb.cindershelf-elder.base since the claim is gone. Otherwise the diet gate is now decorative on a third of its rows.

---

## 91. [MINOR] amb.bowerdeep-child.base
*(found by `?`)*

**Problem.** The child states a species type that is wrong in a way nothing in the corpus corrects, so it reads as an authoring error rather than the mandated 'child who has facts wrong'. Gloomgrub is gloomoth-line age J, whose types are ['Poison','Plant']; Dark/Wind is the ADULT form's typing. The corpus does correct the second half of her sentence (the silk claim) through bowerdeep-silkwinder — but it corrects it against 'Zeb's lad', not her, and it never touches the type claim.

**Evidence.** amb.bowerdeep-child.base L1: "Gloomgrub are the little ones and they're Dark and Wind already, everybody knows that, and then they go up in the high lines and they come back down twice the size with the wings on, and that's where the silk comes off them." data/species.json gloomoth-line: `types: {J: ["Poison","Plant"], A: ["Dark","Wind"]}`.

**Proposed fix.** Give it a visible correction in the same town so the error is legible as the child's and not the writer's — the silkwinder is right there and already in the business of putting market rumours straight; one clause from her ('and they're not dark till they've got the wings on, whatever gets said at the stalls') carries both halves. Or soften the child's certainty from 'everybody knows that' to something that flags it as hearsay she is repeating.

---

## 92. [MINOR] tests/unit/dialogue.test.ts KNOWN_GOOD
*(found by `?`)*

**Problem.** The G7 scanner's negative controls hardcode two lines this rewrite deleted, so after the merge the controls no longer test the shipped corpus while still passing — exactly the staleness Appendix C4 predicted. The scanner itself is fine (0 hits across the new corpus), but its proof that it is not over-broad becomes a proof about text that no longer exists.

**Evidence.** KNOWN_GOOD contains "The Company pays by the head and doesn't ask whose head. That's not sentiment. That's a price list." and "So the dock rots at the speed of the channel. That's not a saying. That's the accounting." — both are B1/B6 constructions the rewrite exists to remove, and neither survives in the fragments.

**Proposed fix.** Replace both with surviving observational lines in the same commit — e.g. amb.r1-forager.thin L0 ("I walked the whole tussock this morning and turned up two Nibbin. Two. Last year I'd have seen a dozen before I got as far as the gate") and amb.r4-worker.emptied L0 ("The nest on the west scarp is empty... The white streak down the rock under it has gone grey"). Both are real, both quote losses, and neither trips a pattern.

---

## 93. [MINOR] vendor-cindershelf.shop
*(found by `?`)*

**Problem.** CONTENT TRUTH: the shop describes a bait that the game's bait rule cannot implement. A species bait matches only when its tag is a lineId in the target's derived diet (core/foodweb.ts baitMatchFor). Ashvole is a Grazer at cindershelf/r4 with NO creature Producer at either node, so its derived diet is empty and no species bait for Ashvole can exist; the only bait that works on it is a role-Producer bait, which by the same rule also works on Cragmar (the other flora feeder at both steppe nodes). So "brings an Ashvole and it brings nothing else" is false in both directions. The claim is inherited from the baseline, but the rewrite amplified it from a subordinate clause into the line's main assertion.

**Evidence.** NEW vendor-cindershelf.shop[1]: "The ash bait brings an Ashvole and it brings nothing else, so I've no cheap one to stand beside it."  ·  BASELINE: "Ingots, snares, salve, and ash bait, which is the only thing an Ashvole will look at."  ·  Derived: cindershelf DIET ashvole-line -> [] (flora only); feedsOnFlora(ashvole-line) = true, feedsOnFlora(cragmar-line) = true, so a Producer-role bait matches both.

**Proposed fix.** Make the vendor right about his own stock: "The ash bait's the cheap sort — anything up there that eats the green will come to it, so that's your Ashvole and your Cragmar both. I've nothing cut for one animal only since the Company cart stopped." Same complaint, same voice, and it now describes the bait the engine actually resolves — which also happens to teach the role-vs-species distinction a second time, in the town where the cheap bait is the only one that works.

---

## 94. [MINOR] amb.hearthollow-fenceman.base, amb.brackwater-elder.base, amb.cindershelf-elder.base, amb.brackwater-child.base, festival.brackwater, amb.cindershelf-worker.base
*(found by `?`)*

**Problem.** Residual terminal cleverness — the negate-then-mirror epigram, and the arranged triad-plus-deflation. F3 is zero exceptions, not a small budget. The fence-mender case is the most instructive: Appendix F specifically identified this character's model line as B1 with the serial numbers filed off and supplied a rewrite; his second line correctly adopts it, and his first line reinstates the same move in a new costume. That is the compression disease surviving a direct, named correction.

**Evidence.** amb.hearthollow-fenceman.base[1]: "I don't put a name to it. Somebody else can put a name to it." (compare Appendix F's approved MOTT: "I don't know how many. I know the post is down again and I'm the one putting it back up.")  ·  amb.hearthollow-fenceman.late[1]: "I've not measured it and I'll not be measuring it."  ·  amb.brackwater-elder.base[2]: "I've told him where the bucket goes. I'll tell him again tomorrow."  ·  festival.brackwater[1]: "My mother waited on these steps. Her mother before her. I bring a stool now."  ·  amb.cindershelf-worker.base[2]: "One writes about his knee. The other one has a boy now."  ·  amb.brackwater-child.base[2]: "He's old. He wears the wrong boots for a boat."

**Proposed fix.** Six rewrites, all terminal sentences. The test is mechanical: if the last sentence mirrors, balances, or reverses the one before it, it is arranged. "Somebody else can put a name to it" becomes "That's not my end of it — the warden wants a name on it and I've said she's welcome to come and watch for one." "I bring a stool now" becomes something that does not land: "My mother waited on these steps and so did hers. I'm on a stool these days, and I get down there early enough to get the dry end of it."

---

## 95. [MINOR] maren.greeting.act2, odo.greeting.fishery-low
*(found by `?`)*

**Problem.** Two of Appendix F's four rewritten model lines shipped near-verbatim. §5 is explicit that a model line "is not to be shipped verbatim — it is the tuning fork". Odo's case carries a second, sharper problem: the borrowed clause is a generalisation about boats sitting in the last sentence of the beat, which is the position F3 zeroes out. Appendix F sanctioned it as a demonstration of plainness; F3 bans the position. Where those two conflict, F3 is the rule and the model line is the illustration.

**Evidence.** Appendix F MAREN: "My Brackmarsh numbers are three weeks old, and it rained for most of those three weeks, so I'd treat them as a low estimate."  SHIPPED maren.greeting.act2: "My Brackmarsh numbers are three weeks old and it rained through most of those weeks, so take what I tell you about the marsh as a low estimate."  ·  Appendix F ODO: "...I'm out in a boat. From a boat you only ever see the ones that come up near you."  SHIPPED odo.greeting.fishery-low: "...because I'm out in a boat, and from a boat you only ever see the ones that come up near you." (final sentence of the beat)

**Proposed fix.** Rewrite both in the character's own particulars rather than the document's. Maren already has better material three entries away ("I get about four hours of work out of a day before the light goes and the damp gets into the pages") — let the act-2 greeting use the rain concretely instead of summarising it. For Odo, move the boat clause off the end and finish on business: "...ask her, not me. She'll have a number and I never will — I'm out in a boat and I only see what comes up alongside. She's on the Brackmarsh side most mornings before the tide's up."

---

## 96. [MINOR] vesper.post.win, sel.tale.4, noct.pre
*(found by `?`)*

**Problem.** B7 second-person mechanic instruction outside the permitted set. §2 B7 restricts teaching the player a method to Maren, Gerta, Bram, Orrin and the explicit shop lines, "and only about a method that character is personally responsible for teaching". Three gym-adjacent beats teach a battle mechanic in the second person. Vesper's is the clearest — it is a straight item tutorial (status cure) in a leader's mouth. Noct's is defensible as a leader describing her own team and is arguably protected by its G7-safe framing ("It's nothing you've done"), and Sel's slack-water instructions are quest logistics rather than a mechanic. Flagging all three so the line gets drawn deliberately rather than by accident.

**Evidence.** vesper.post.win[0]: "A tonic lifts it straight off. I have not found anything else that does, and I have looked, because tonics are not cheap and I buy a great many of them."  ·  sel.tale.4[2]: "If you're going down there, go at slack water, and not an hour before it and not an hour after it... Take the heaviest snare you've got, and take something that can swim."  ·  noct.pre[2]: "Everything I put out can make an animal stop where it stands and do nothing at all for a bit. It doesn't happen often and there's no warning before it comes. It's nothing you've done."

**Proposed fix.** Vesper's is the one to change: recast it as a fact about her own practice rather than an instruction to the player — "I carry tonics for it. Nothing else I have tried lifts it, and they are not cheap, so I buy a great many." The player draws the same conclusion and Vesper stops being a tutorial. Sel and Noct can stand as written; record the ruling in DIALOGUE-NOTES so a later reader does not re-open it.

---

## 97. [MINOR] gerta.warm.testimony vs bram.mine.closing
*(found by `?`)*

**Problem.** A continuity collision between two entries that can be live at the same time. Gerta's stated method depends on the fourth shaft being open and comparable; Bram's depleted-state greeting says it has been boarded up. gerta.warm.testimony is act-4 lore behind the Kilnback chain and bram.mine.closing is a yearMin-5 population-gated greeting, so a player on a slow run can hear the second and then the first. Nobody in either entry notices.

**Evidence.** gerta.warm.testimony[1]: "The third sits eight degrees over the fourth, and I compare against the fourth because the two shafts are cut to the same depth."  ·  bram.mine.closing[0] (when: cragmar-line @ r4 lte 3, yearMin 5): "Fourth shaft's boarded up now. It didn't fall in, mind. ... now there are boards across the fourth."  ·  bram.mine.closing[1]: "The third stays open while I'm still here."

**Proposed fix.** One clause in Gerta closes it and improves her: "...and I compare against the fourth, which I can still get into whatever they've nailed across the mouth of it — I've a key and nobody has asked for it back." That also fills a friction beat (Rule 4) rather than costing one.

---

## 98. [MINOR] maren.keystone.5 L1 and orrin.vanishing L2
*(found by `?`)*

**Problem.** Maren and Orrin deliver the same archive fact in near-identical phrasing, and it is one of the two attribution failures in my thirty-four-line blind round — I read Maren's line as Orrin's. Two speakers is at the cap, so this is not a chorus violation, but it dilutes the one detail Orrin owns outright and wastes the reveal: whichever the player hears second lands as repetition.

**Evidence.** maren.keystone.5 L1: "There are herds of nine in there, and herds of twelve, and herds of four, written by different people on different nights" · orrin.vanishing L2: "There are two hundred and six margin entries for Vellsire in ninety years of pages. Herds of nine, of twelve, of four, and almost all of them inside the same three weeks of the year."

**Proposed fix.** Give the herd sizes to Orrin alone — they are his pages and his count of 206. Maren keeps only what is hers: that different people wrote them on different nights, that not one recorded a method, and that she would have done the same at three in the morning in the cold. She never needs to say the numbers.

---

## 99. [MINOR] sel.docks.rotting L0 and amb.brackwater-dockhand.rot L0
*(found by `?`)*

**Problem.** Two speakers report the same fact about the same object under the IDENTICAL trigger — both entries carry `when: {yearMin: 3, population: [{node: "r2", lineId: "mirefin-line", op: "lte", value: 4}]}` — so the player who walks Brackwater in a thin year hears about the soft third piling twice within a few steps. This is the third of my four attribution failures: I read the dockhand's line as Sel's, because the piling is Sel's owned object (he wrote the letters, he keeps them in a tin in the boat).

**Evidence.** sel.docks.rotting L0: "The third piling's soft and the fourth is going the same way, and nobody's driving new ones" · amb.brackwater-dockhand.rot L0: "Tide's out, so you can see the bottom of the third piling for once. Gone soft about a foot above the mud."

**Proposed fix.** Leave the diagnosis with Sel, who has campaigned about it, and leave the dockhand with what only a man walking sixty ton over it would say — which his own L1 already has: "I've stopped standing over the third piling when she comes alongside. I stand further up the boards now." Cut his L0 diagnosis and open him on that.

---

## 100. [MINOR] amb.hearthollow-elder.thin L0
*(found by `?`)*

**Problem.** The only line in either blind round I could not attribute at all. It is a bare ecological readout with no trace of the speaker in it — no droving, no cattle, no daughter, no Tolm — and it could belong equally to hearthollow-elder, hearthollow-forager or r1-forager, all of whom are on the same ground. Note that the sibling entry gets this right: amb.hearthollow-elder.bloom L0 carries "when I was droving" and is instantly attributable. The state-reactive variants are where signature is most likely to be dropped, because the ecological payload crowds it out.

**Evidence.** amb.hearthollow-elder.thin L0: "The Reach is short this year. The grass came up and then it stopped, and up on the rise you can see the bare ground through the grass, which you can't do in a good year." (compare .bloom L0: "I don't remember the grass ever getting that far down the slope when I was droving, and I was droving up there a long while.")

**Proposed fix.** Put the cattle back in, which also gives the reading an owner and an age the way every other survey line in this corpus has one: "The Reach is short this year. I'd have had to bring the beasts down off that rise a month early in a year like this one, and I can remember doing it twice." (If F4 is applied, drop the count and end on "and I remember doing it.")

---

## 101. [MINOR] maren.opening L2 / maren.greeting.act3 / maren.epilogue.caught L3, vesper.pre L0, sable.post.win L0
*(found by `?`)*

**Problem.** Three unrelated characters give their personal tenure as exactly eleven years. Combined with F3, this is the tenure-credential defect showing its seams: the number is not chosen from the character, it is the writer's default span. "Eleven" appears seventeen times in the corpus overall, which is fine where it is a measurement (Sel's eleven-foot pole, the observatory's rule eleven, Corbett's clause eleven, the lampkeeper's 211 lamps); it is only the three identical careers that read as authorship.

**Evidence.** maren.opening L2: "I have spent a fair part of eleven years looking for something that is" · vesper.pre L0: "I caught all five myself, from the ground, over eleven years." · sable.post.win L0: "Eleven years I've had her and she's not been off her feet in this room before today."

**Proposed fix.** Eleven is Maren's — it is stated three times in her part and it is load-bearing for the Vellsire arc. Vesper's canopy work and Sable's Stonewing should carry numbers that come out of their own lives (Vesper is arguing with Halder about a nine-year-old dispute; Sable took two seasons to catch her second Pyrelisk). If F3 is applied, both of these lines lose the figure entirely.

---

## 102. [MINOR] tolm.quest.fallow.done.short L0
*(found by `?`)*

**Problem.** The closest thing in the corpus to a G7 breach. It is a contract consequence rather than a moral, and Tolm's repeat-yourself trait is established and good — but this is the failure branch, the player has just lost the payment, and the sentence that lands on it is the farmer establishing that he warned them. Appendix F's new risk is irreverence curdling into sarcasm aimed at the player; this is not sarcasm, but it is the one line in 520 that is short with the player's outcome. Note the corpus is otherwise clean here: both epilogues report the stag without a hint of judgment either way, which is exactly right.

**Evidence.** tolm.quest.fallow.done.short L0: "The field came in short of twenty-four, so the share doesn't come off the crop this year. We set the arrangement out that way between us, and I said it to you twice over before you agreed to it, so I'll keep to it."

**Proposed fix.** Keep the consequence and drop the reminder — the terms hold whether or not he restates that he stated them. "The field came in short of twenty-four, so the share doesn't come off the crop this year. That was the arrangement and I'll keep to it either way." His L2 already offers it again next spring, which is the generous note the beat should end on.

---

## 103. [MINOR] corpus-wide — wick.* and greaves.* (23 live-state entries, neither speaker among them)
*(found by `?`)*

**Problem.** The design docs named this the biggest story hole (verified-facts, D13) and the finished corpus does not close it. I re-checked the fragments directly: 23 entries read `population` or `floraStock`, across 14 speakers, and wick and greaves are still both at zero. The rival whose whole function is to argue about harvesting and the antagonist whose position is that a region is a stock to draw on remain the only two characters who never notice what the player has actually done to the region, while ambient foragers react to it. This is not a defect of the writing pass — the rules correctly forbade touching `when` — but the whole-corpus view is where it has to be reported, because it will not be visible from any single slice.

**Evidence.** Every wick and greaves entry has a flag/act-only `when`, e.g. wick.act4.pre speaks about the emptied steppe entirely as scripted history — "The scarp went empty in the fifth year and it hasn't come back since" — and greaves.finale.pre L0 concedes the player's figures in the abstract: "she has your figures, and I have no quarrel with the figures" — without either line reading a single live number.

**Proposed fix.** Out of scope for a text-only pass, so log it rather than patch it. When conditions can be touched, the cheapest fix is two entries in namespaces that already exist: a `wick.act4.pre` variant gated on r4 pyrelisk or stonewing being low in which he sees the player's steppe and not his own memory of it, and a `greaves.finale.pre` variant gated on r2 or r4 population in which the man who audits to the individual animal quotes the player's own damage back at them. Both are two lines each and both close the hole the docs called the biggest one.

---

## 104. [MINOR] wick.act1.loss L0
*(found by `?`)*

**Problem.** Invented telemetry. The battle engine keeps HP, statuses and events; it does not score exchanges, and nothing on screen ever shows the player a 4–3. Wick is the character whose credibility rests entirely on having actually looked things up and written them down — "It's all on my own returns, and anybody at intake can go and look at them" — so a precise number the player cannot check is the one kind of number he should not produce. Vesper's "by the sixth exchange" is fine by contrast because the toxin ramp makes it checkable.

**Evidence.** wick.act1.loss L0: "Four to three on the exchanges, so it was closer than my returns sheet is going to make it look, and I'll say so on the sheet."

**Proposed fix.** Give him something he could genuinely have counted — which is also more in character, since counting badly and then correcting himself is his whole arc. "Closer than my returns sheet is going to make it look, and I'll say so on the sheet. You had me on the back foot twice and I got out of it both times, and that isn't a thing the sheet has a column for." (Or, if F4 is applied, cut the count and keep only the sheet.)

---

## 105. [MINOR] corpus-wide — 5-gram sweep
*(found by `?`)*

**Problem.** Three exact verbatim frames are each shared by three distinct speakers, one over the cap. These are the only literal repetitions in the corpus worth acting on — the rest of the shared 5-grams are ordinary prepositional phrases ("at the bottom of the", "in the middle of the") that no reader would notice. Two of the three are the absolute-negative frame from F3 appearing in identical words rather than merely in identical shape.

**Evidence.** "and I have never once": maren, sel, vesper · "I have never been able to": brackwater-buyer, orrin, sel · "and not one of them": hearthollow-child, maren, sel (Sel appears in all three)

**Proposed fix.** Sel is in all three and should lose all three — he has the most distinctive vocabulary in the game (pole, bottom, slack, the marks, the crossing) and does not need a shared frame to carry a beat. That drops each to two speakers and clears the cap without touching Maren, Vesper, Orrin or Corbett.

---
