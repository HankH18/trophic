# Queued changes — authorised, waiting on in-flight work

## CURRENT STATE (INTEGRATOR tick — Q2 / Q3 / Q3a / Q6 landed)

**Build: GREEN, measured after everything below was in place.** `npx tsc --noEmit` silent ·
`npx vitest run` **39 files, 2012/2012 passing** · `npm run build` clean · `npm run harness` re-run and
`docs/BALANCE-REPORT.md` regenerated reproducibly. Baseline before this change was 1829/1829 at
`1e62b6ea`.

**The time model is now the two-clock model, and `docs/LANE-A-STATUS.md` §0 is the current statement
of it.** Read that first, then `core/acts.ts`'s header. Every older doc that says "six acts = six
years", "year 6", or treats `clock.yearsTotal` as a deadline is superseded.

### Verified across the stream boundary this tick, by playing rather than by calling functions

- **The act the SCENE publishes is the act the DIALOGUE reads.** `core/dialogue-schema.ts`
  `actFromFlags` is a one-line delegation to `core/acts.ts` `actOf`, and a played run now asserts they
  agree at every rung (`tests/unit/overworld-scene.test.ts` §10.5). **Sabotage-proven:** restoring the
  old `1 + badgesBeaten` derivation turns exactly one test red, at the prologue.
- **The user story works.** A slow run reaches **act 6 in calendar year 11** — badges in years
  3/5/7/9/11/11, acts 2/3/4/5/6/6 — and the shipped corpus then resolves
  `maren.finale → greaves.finale.pre → greaves.finale.post → sanctum.vellsire.approach` (two choices)
  `→ maren.epilogue.caught`, identically at year 6, 11 and 30, once and not annually.
- **The LEGACY beat holds on the act axis.** That run buried three generations; the creature standing
  in the Sanctum is `provisional-starter-heir-y4-heir-y7-heir-y10`, born in year 10.
- **Nothing reads `clock.yearsTotal` as a deadline.** Audited: every reader is a pacing readout, an
  art/tint clamp, the harness's stated pacing model, or a test loop bound. No guard, no branch, no end
  condition.
- **`game/` never derives an act from a year.** `GameRegistry.act()` and `OverworldScene.act()` both
  call `actOf`; `rollLevel` indexes the level band by act.

### BF-1 / BF-2 / BF-3

- **BF-2 DONE** — `game/gym-battle.ts` exists and `OverworldScene` `[G]` fights the town's leader; a
  win writes the badge. Verified through the real scene, six leaders in one played run.
- **BF-3 DONE for the one that was false.** `tests/integration/seams.test.ts:329`'s "HONEST GAP:
  nothing in production wires battle's catch to the ledger yet" was a **green test asserting the
  negation of the truth** — its source list named ten files and the wiring landed in an eleventh
  (`game/wild-battle.ts`). Replaced by two tests that RUN `applyCatchToSave` and walk every `core/`
  and `game/` source (D-INT-1). `tests/unit/wild-battle.test.ts:5`'s stale note is corrected.
  **The other seven were checked and are honest:** `demo-beats.test.ts:241` and `:359` both assert a
  MEASURED content fact and both are written to go red when the gap closes ("the release is now a law
  — rewrite this test to assert it"). They are not false-greens and were left alone.
  **A NEW instance of the class was found while integrating and fixed (D-INT-2):** the overworld test
  rig had never completed a single year turn — the stub registers `YearTurn`, nothing answered it, and
  `isHandedOver()` stayed true for ever. Measured: 5000 `[R]` presses bought **one** year. Every §10.2 /
  §10.3 claim about behaviour "across the year turn" was evidence about the tick before it.
- **BF-1 STILL OPEN.** Nothing in `game/` calls `selectEntry` or `conditionHolds`. This is Q7.

> **`tools/harness/probe.ts` is a REAL MODULE** imported by `measure.ts`. NOT a scratch file.

| Change | State |
|---|---|
| **Q2** ticks-only calendar | **DONE.** `YearEndReason` has one member; `gymVictory()` / `isOver()` gone and their absence asserted. Bible §9's four events are 4-tick windows, and the festival's window is 4 ticks *measured through the running scene* (it was 8). D-Q2-1 / D-Q2-2 / D-Q2-4. |
| **Q3** story decoupled from the calendar | **DONE.** `core/acts.ts` is the second clock; raids fire on act entry; the run ends on an act condition; no cap, no fail state. Proven by playing to act 6 in year 11. D-Q3-1 … D-Q3-15, D-INT-3. |
| **Q3a** the 44 year-gated entries | **DONE for the gates**, and cross-checked against the real act producer. Copy that states a run length the unbounded calendar can falsify is Hank's D19 ruling and was NOT rewritten (G2) — the list is below. |
| **Q6** r4 crashed by the raid, not shipped crashed | **DONE**, and the defect was not the one Q6 describes: the authored `remove` values were priced against r4's SHIPPED counts, so by the time anyone arrived the raid was too small (apex reached 0 in 39/64 seeds at the shipped state, 1/64 after twelve seasons of world). The harvest now takes the standing stock. Harness re-run. D-Q6-1 … D-Q6-3. |
| Q4 / Q5 / Q8 / BF-5 / BF-2 / BF-3 | **DONE** |
| **Q1** renames | **OUTSTANDING and now dispatchable** — `tests/`, `data/gyms.json` and `docs/content-bible.md` are free. Needs **Digimon** screening. |
| **Q7** dialogue wiring (C7) + **Q3b** quest system | **OUTSTANDING — the largest remaining item in the repo**, and three concrete consequences are named below. |
| Palette evidence regeneration | unchanged by this wave |
| 36 blocked findings | `docs/BLOCKED-FINDINGS.md` §8. **Land BF-7 before BF-4.** |

### What Q7 owes, concretely — found by integrating, not by reading

1. **`story.vellsire.resolved` and `story.vellsire.outcome` have NO WRITER ANYWHERE.** The Vellsire
   choice writes `story.vellsire.attempt` (`"catch"` / `"release"`), which nothing reads; both
   epilogues require `resolved` set and `outcome` equal to `"caught"` / `"released"`. This is a
   declared seam — an Ancient can refuse the snare, so the ENCOUNTER owes the outcome — but until C7
   exists **the epilogue cannot fire in a real session, however the player plays**. D-INT-4.
2. **`story.opening.done` is written by a declared provisional stand-in** in `OverworldScene`
   (`OverworldHooks.onOpeningBeat`), not by the corpus's opening chain. C7 removes it by TAKING the
   hook, not by editing scene code.
3. **All 12 quest turn-in flags and the three `chain.*.complete` flags are read and never written**
   (Q3b). The three Ancient hunts cannot be completed.

### Dialogue copy the amended L8 has made false — for whoever lands Q7

Not fixed here: `data/dialogue.json` is the story lane's file and no copy was rewritten (G2 — copy
rulings are Hank's). Named so they are not lost:

- `maribel.post.win` (line 1658) and line 5053 still tell the player a badge can close the year
  (*"the year closes whether the meter runs out or the badge comes in"*). Both false under the amended
  L8; both already flagged in `docs/STORY-REVIEW.md` §828/§835.
- `greaves.act4.steppe` and `wick.act4.pre` state a fixed calendar span for an act-driven event.
- `maren.keystone.4` reads Cinder Steppe's flora as remarkable; measured, it is at the ceiling (100)
  at every realistic arrival, and after D-Q6-1 the crash is in the four population numbers instead.
- `gerta.quest.crash.offer` is a **restore candidate**: the line it replaced ("four of them low and
  one of them high") is close to literally true again now that the raid takes the standing stock.

**Open for Hank:** palette variant (class-equal recommended — evidence being regenerated now, since the
old sheet showed candidates as solid rectangles at the pre-fix tolerance) · **B-D38: three images
(Fenmaw, Mirefin, Wispurr front) to de-risk the 154-sprite batch** · five borderline G7 lines in
`docs/DIALOGUE-NOTES.md` · every rename in `docs/IP-SWEEP.md` (G15).

**Never:** >=20-image batch (G13) · swap `data/palette.json` without Q4 (done) · weaken a test to go green.

---

*The sections below are the SPECS, kept verbatim as they were authorised. Each one now carries a
LANDED note where it landed; where there is no such note it is outstanding. The state table above is
the summary — these are the details, and the "Blocked on" lines in them are historical.*

---

## Q1 — Rename the Pokémon move duplications

**Authorised:** "go ahead and rename the Pokemon move duplications."
**Blocked on:** ~~the balance-fixes workflow, which owns `tests/unit/transcription.test.ts`.~~
**UNBLOCKED 2026-08-25** — `tests/`, `data/gyms.json` and `docs/content-bible.md` are free. Still
outstanding; still needs the Digimon screening the constraints below spell out.

From `docs/IP-SWEEP.md`, rated RED — real Pokémon moves:

| ours | the collision | severity |
|---|---|---|
| **Harden** | Pokémon Normal/Status, *"Raises the user's Defense by one stage."* Ours: `+Defense`. **Same name AND same effect** — the worst single case in the move set. | rename |
| **Screech** | Pokémon Normal/Status, *"Lowers the target's Defense by two stages."* Ours: `−enemy Defense`. **Same name AND same effect.** | rename |
| **Snarl** | Pokémon Dark/Special/55, lowers Sp. Atk. Ours: `−enemy Attack` — same name, closely analogous effect. | rename |
| **Roost** | Pokémon Flying/Status, recovers half max HP. Ours is only the `altName` on `burrow-roost` (*skip turn, +evasion*). | **delete the `altName` field, keep "Burrow"** — cheapest fix in the whole sweep |

Also re-check while in there (AMBER, Hank has not ruled): **Focus** (a Cassette Beasts move, and
Pokémon owns the Focus Energy / Focus Blast / Focus Punch space), **Miasma** and **Shade** (both
`coined:true`, both exact attack-name matches in Digimon titles).

**Constraints.** Replacements must (a) be screened against the Pokémon move AND ability lists,
Cassette Beasts, Monster Sanctuary, Temtem, Coromon **and Digimon** — Digimon was missing from the
original screen and immediately produced two exact hits when added, so it is not optional; (b) keep
the bible's register — prefer compounds over single common words, because every collision found in
this sweep was a single common English word; (c) preserve each move's stated effect exactly (G2 —
effects are content, only the NAME changes).

**Blast radius:** `data/moves.json`, any `movePool` reference in `data/species.json`, gym slot moves
in `data/gyms.json`, `data/dialogue.json`, `tests/unit/transcription.test.ts` (which pins the named
bible moves), and `docs/content-bible.md` §3. Log every rename in `docs/DEVIATIONS.md` with the
collision that forced it.

---

## Q2 — Time advances on ticks only; gym victory no longer ends the year

> **LANDED 2026-08-25 — implemented as specified.** `YearEndReason = "meter"`; no `gymVictory` and
> no `isOver` in `core/clock.ts`, absence asserted at `tests/unit/clock.test.ts:166,181`. The four
> bible §9 events are season-long (4-tick) windows in `core/regional-events.ts`, and the festival's
> window is measured at 4 ticks THROUGH THE RUNNING SCENE — it was 8, because the year-filling tick
> emits no `seasonBoundary` and the flag survived into spring. Logged as an authorised L8 amendment
> in `docs/DEVIATIONS.md` D-Q2-1 with Hank's quote, plus D-Q2-2 / D-Q2-4.

**Authorised:** "I don't want the passage of time to be forced based on gyms or stages. I want it to
move forward based on ticks or actions exclusively."
**Blocked on:** the Lanes B+C workflow, which owns `game/scenes/YearTurnScene.ts` and is compiling
against the current clock API.

**What changes.** Locked decision **L8** currently reads *"16-tick season meter; travel 1 / foray 1 /
inn 2; year = gym victory or full meter."* It becomes **"year = full meter"**. In `core/clock.ts`,
`YearEndReason` drops `"gymVictory"` and the `gymVictory()` year-end path is removed. A gym win is
still a gym win — it just no longer skips the calendar.

**Why this is good for this game, not merely what was asked:** the world ageing on its own schedule
regardless of the player's progress is a stronger statement of the game's thesis than a calendar that
waits for you to succeed. It also removes a perverse incentive — under the old rule, winning a gym
*cost* you the rest of that year's ticks.

**Hank's constraint on annual events:** *"events like that last for a whole season and not just for
one in-game day."* So the Annual Festival, the Great Migration, Cullbrand raids and Bloom Year become
**season-long windows (4 ticks)**, not instantaneous fires. They open at a season boundary, stay
active for the season, and close at the next — visible in the overworld and in encounters for the
whole duration.

**Bible §9 consequence:** the Annual Festival is described as a *"diegetic gym gate, closes the
year"*. It no longer closes the year. Keep it as the year's closing celebration, triggered by the
meter filling, spanning the final season.

**Blast radius:** `core/clock.ts` (the `YearEndReason` union, `gymVictory()`, the event stream),
`core/lifecycle.ts` (year-turn entry), `game/scenes/YearTurnScene.ts`, `tools/harness/` (its year
model), `tests/unit/clock.test.ts`, `tests/property/*`, `docs/build-doc.md` L8 and §4's runtime
narrative, `docs/content-bible.md` §9. Log in `docs/DEVIATIONS.md` as an authorised L8 amendment —
build-doc says locked decisions are never relitigated, so this must be recorded as Hank overriding
his own lock, with the quote.

### Superseded — see Q3

Q2 originally asked what happens if a player reaches year 6 without five badges. Hank's answer
dissolves the question: **there is no year-6 gate.** See Q3.

---

## Q3 — Decouple story progression from the calendar entirely

> **LANDED 2026-08-25.** Every consequence listed below is built: no cap and no fail state; the
> year-variant clamp resolves the highest available variant (with a test recording that NO shipped
> node has one, so the clamp's green is not mistaken for evidence about shipped art); raids fire on
> act entry; town ageing stays on the calendar; `data/gyms.json`'s `year` field is now `act`.
> **The one thing this spec did not anticipate:** the act gate on travel locked every new save inside
> Hearthollow, because NEITHER of the ladder's inputs had a writer in `game/` — `story.opening.done`
> is dialogue's (Q7) and `winGym` had no caller anywhere in the repo. Both writers exist now
> (`game/gym-battle.ts` is new; `[G]` fights the town's leader). See D-Q3-11.

**Authorised:** "Why is year six a hard gate in the first place? I feel like the game should progress
based on the player going through the gyms and side events, not based on year progression. Simply
switch out the time check points for event check points."

**Where the year-6 gate came from.** Nobody designed it. Content-bible §6 opens "Six acts = six
years" and the whole doc inherits that equation — towns are listed by year, gym leaders by year, map
variants indexed 2-6. Years and acts were never two things; they were one axis wearing two names.
Q2 (time advances on ticks only) breaks the equation, and once broken, "year 6" is just a number the
calendar happens to reach.

### The model

**Two independent clocks, neither driving the other.**

**1. The calendar — ticks -> seasons -> years. Never waits, never ends.**
Drives: creature aging and retirement, boxed-creature aging (G10), `ecosim.step()` at every season
boundary, map year-variant art, season tint. It is the world's clock and it is indifferent to the
player.

**2. Acts — driven by badges and quest flags. Never driven by time.**
Drives: town/route unlocks, story beats, Cullbrand raid scripts, rival encounters, and the finale.

A fast player reaches the Sanctum with young creatures. A slow player reaches the same content having
buried two generations. **Both see the whole story.** The difference is written in the ledger and in
who is standing beside you at the end — which is precisely the game's thesis, and a better expression
of it than a countdown.

### Consequences to implement

- **No fail state, no time limit, no year cap.** The finale triggers on its act condition whenever the
  player earns it.
- **Year-variant art clamps.** Years can exceed 6; `yearVariants` only ever holds 2-6. Show the
  highest available (build-doc §9.5 already establishes this fallback: "that year reuses the nearest
  passing variant"). A year-9 Hearthollow renders as year-6 Hearthollow.
- **Cullbrand raids fire on ACT, not year.** Bible §6 wants Cindershelf entered "mid-collapse"; that
  must hold whether the player arrives in year 2 or year 11, so it is an act trigger.
- **Town aging arcs stay on the CALENDAR** (docks rot, canopy thins). A player who rushes sees a
  younger town, and that is correct — the town ages with the world, not with the plot.
- **`data/gyms.json` `year` field becomes an act index**, not a calendar year. Rename it so nobody
  re-conflates them.
- **Bible §6's "Six acts = six years"** is amended to "six acts; the calendar runs independently."
  Six remains the *expected* year count under normal pacing — a correlation, not a rule.

### Q3a — 44 dialogue entries gate on an exact calendar year and Q3 breaks them

> **LANDED 2026-08-25.** All 44 decided — story on the act axis, town-decay lines left on the
> calendar. `core/dialogue-schema.ts` `actFromFlags` is now a one-line delegation to `core/acts.ts`
> `actOf`; it used to be a second derivation (`1 + badgesBeaten`) that agreed at every rung EXCEPT the
> prologue, which is the one rung the entire opening chain was gated on. The 18 rival entries and
> `amb.r4-worker.arrival` moved from act EQUALITY to `actMin`. Both epilogues gained the `flagsUnset`
> that stops them replaying for ever.
> **Cross-checked at integration (D-INT-3):** the act the scene publishes equals the act the corpus
> derives at every rung of a PLAYED run, and the whole ending resolves identically at year 6, 11 and
> 30. **Still open:** the D19 copy ruling (Hank's), and the two Vellsire outcome flags nothing writes.

Found by the story review, not by me. `data/dialogue.json` was authored BEFORE Q3, against the
bible's "six acts = six years" equation. **44 of 211 entries gate on `years: [N]`** — an exact
calendar year — and that set includes **the entire rival arc, both Greaves cutscenes, the finale,
the Vellsire choice and both epilogues.**

Under Q3 the calendar is unbounded and decoupled from progress, so **a player who reaches the
Sanctum in year 8 sees none of them.** The game's ending would silently not fire.

This is the single largest piece of Q3's implementation and it is content work, not a code change:
each of the 44 needs a decision between an **act** gate (story — most of them) and a **calendar**
gate (world ageing — the town-decay lines legitimately stay on the calendar). The full list and a
recommended split per entry are in `docs/STORY-REVIEW.md` §6 D1.

**Do not ship Q3 without this.** A decoupled calendar with year-gated story copy is strictly worse
than the coupled version it replaced.

### Q3b — the quest system does not exist at all

Also from the story review: all ten side quests have finished copy, and **all 12 `*.turnin` /
milestone flags they gate on are flags that dialogue READS and nothing WRITES.** There is no quest
tracker, no turn-in, no sign-chain reader, no prop interaction. Likewise nothing reads
`chain.*.complete`, so the three Ancient hunts cannot currently be completed.

Scope this with Q7 (wiring dialogue into `game/`) — they are the same missing layer.

### What does NOT change

Aging, lifespans (J3/A2/E1), retirement, heirs, the ecosim, determinism, and the six-year property
tests are all untouched — `det_sim` still validates a six-year trajectory, it just no longer means
"a whole playthrough".

### The pressure question, answered

Removing the deadline does not remove the stakes. Creatures age and retire on the calendar, so a slow
player spends generations to get the same distance. That is the anti-hoarding pressure the lifespan
system already provides, and it is enough. No artificial timer is needed, and adding one would
contradict G7 — the ledger is the moral, not a clock.

---

## Q4 — `backgroundTolerance` 12 -> 24. HARD BLOCKER on any palette swap.

**Not authorised yet — but it is a defect fix, not a preference.** Found and measured by the palette
agent (B-D22); flagged rather than fixed because `tools/postprocess/` belongs to a concurrent workflow.

**The bug.** Build-doc §9.3's chain runs background removal (step 3) AFTER quantize (step 2). Removal
matches a declared white key with `backgroundTolerance: 12` — so what it must match is not white, it is
**whatever the palette maps white to**. The frozen palette's lightest swatch is `#fdfdfb` (deviation 4)
and passes **by luck**. The candidate's is `#fbfaf2` (13) and the class-equal variant's is `#faf7eb`
(20). Both fail.

**Measured through the real chain:** background removal removes NOTHING — player 1536/1536 pixels
opaque, Puddlisk 9216/9216. Every sprite would ship with an opaque off-white rectangle behind it.

**Fix:** `backgroundTolerance` 12 -> 24, verified to restore removal under all three palettes with
margin (each palette's second-lightest swatch sits at deviation 41-45, well clear of 24).

**This must land in the same change as any palette swap.** A swap without it ships every sprite with a
visible box around it.

### LANDED 2026-08-25 — reproduced, fixed, and the class of bug closed

**Reproduced first, through `chain.ts::processRaster` on real art** (approved player at 32×48;
`pt-puddlisk` and `pt-fenmaw-b` at 96²). Isolating step 3 — same trim, same fit, same quantize, only
the removal tolerance varying:

| sprite | palette | tol 12 | tol 24 |
|---|---|---|---|
| player | frozen | 311 cleared → 985 opaque | 311 cleared → 998 opaque |
| player | candidate | **0 cleared → 1296/1296 opaque** | 311 cleared → 998 opaque |
| player | class-equal | **0 cleared → 1296/1296 opaque** | 311 cleared → 998 opaque |
| Puddlisk | frozen | 2327 cleared → 6025 opaque | 2327 cleared → 6131 opaque |
| Puddlisk | candidate | **0 cleared → 8352/8352 opaque** | 2330 cleared → 6121 opaque |
| Puddlisk | class-equal | **0 cleared → 8352/8352 opaque** | 2330 cleared → 6119 opaque |
| Fenmaw | frozen | 4413 cleared → 4707 opaque | 4413 cleared → 4707 opaque |
| Fenmaw | candidate | **0 cleared → 9120/9120 opaque** | 4414 cleared → 4704 opaque |
| Fenmaw | class-equal | **0 cleared → 9120/9120 opaque** | 4423 cleared → 4701 opaque |

(1296 / 8352 / 9120 is the *whole fitted subject box* — trim runs before quantize on genuinely white
raw pixels, so it still works; what fails is step 3, and it fails completely. B-D22 reported the frame
totals 1536 / 9216; the letterbox padding is transparent either way and the conclusion is identical.)

**Margin at 24, measured on the swatches themselves:** the palette's image of white sits at **4**
(frozen `#fdfdfb`) / **13** (candidate `#fbfaf2`) / **20** (class-equal `#faf7eb`); the *second*-lightest
at **44** (`#f7ebd3`) / **41** (`#d6d9e2`) / **45** (`#d2e0e2`). So 24 clears the key by 4–20 and stays
clear of the next swatch by 17–21. **It cannot eat content:** every pixel the fill clears is the
palette's white-image and nothing else (1 distinct colour in all nine palette×sprite runs), and on the
frozen palette 12 and 24 clear byte-identical sets — the change is a no-op on today's shipped palette.

**The number is not the fix; the invariant is.** `tests/unit/postprocess.test.ts` now asserts, per
palette discovered on disk and per class that runs removal: the palette's image of the background key
is INSIDE `backgroundTolerance`, and **every other swatch is OUTSIDE it**. Proved it bites in both
directions — reverting to 12 turns **6** tests red (3 per candidate palette); raising to 50 turns **3**
red as the second-lightest swatch enters tolerance. `backgroundTolerance` was already config
(`manifest.classes.<c>.postprocess`), so G11 needed no change.

**Still open — a sibling this change did not own:** `tools/comfy/player-views.ts:411` hardcodes
`const BG = { key: WHITE, tolerance: 12 }` as a literal and runs the same chain with it. Same bug, plus
a G11 literal. One-line fix for whoever next owns `tools/comfy/*.ts`. See B-D35.

---

## Q5 — Fenmaw's snout: the model reads "gharial" as "crocodile"

**Not a bug, an actionable generation finding (B-D6 root-caused).** Fenmaw has regressed to a generic
crocodilian in **every** trial so far, including one whose subject already applied build-doc §9.2's
fidelity rule (it front-loads and repeats "long narrow gharial snout" twice). One generation per
hypothesis isolated it:

- **Confirmed:** replacing the *adjective* with the *shape* — `extremely long thin tube-shaped snout, a
  narrow needle-like jaw far longer than the head is wide` — produces a correct gharial. The word
  "gharial" is simply read as "crocodile" by this model.
- Partly: the class's `facing the viewer` view foreshortens the one identifying feature; a
  three-quarter view showed the length but doubled the jaw at that seed.

**Why this matters before B3:** Fenmaw is a bible §4 Apex with three age forms x front/back = six
sprites, and all six would ship as generic crocs. Generalise the lesson into the manifest's subject
derivation: **name distinctive anatomy by its SHAPE, never by its species term.** Audit the other
subjects for the same failure mode before the 154-sprite batch — likely candidates are any line whose
identity rests on a term the model may collapse to a common relative (basilisk, condor, gharial,
lungfish, wyrm).

### LANDED 2026-08-25 — rule generalised, roster audited against the trials on disk

**Diagnosis verified independently before implementing.** `pt-fenmaw.png` is a broad blunt-muzzled
crocodilian; `pt-fenmaw-b.png`, same seed and graph, has a genuinely long thin tube-shaped snout far
longer than the head is wide. Confirmed.

**The rule, now in `tools/comfy/README.md` and `manifest._deviations` LB-M9:** name distinctive
anatomy by its SHAPE, never by its species term. The bible's term STAYS in the string — G2 protects
it — the shape is added beside it, and the derivation front-loads and repeats both.

**Audited every creature concept against the trial PNGs actually on disk.** Rewritten (in
`_concepts`, then `comfy-batch rebuild`; **no seed moved** — `deriveSeed` is pure in `(id, version)`):

| line | was | now | evidence |
|---|---|---|---|
| Fenmaw | `bulk gharial with a long narrow gharial snout` | `…with an extremely long thin tube-shaped gharial snout, a narrow needle-like jaw far longer than the head is wide` | **CONFIRMED generatively** (`pt-fenmaw` vs `pt-fenmaw-b`) |
| Mirefin | `stalking lungfish` | `…, a long eel-shaped fish body that walks on four stubby limb-like fins` | failure measured (`pt-mirefin`: generic bipedal fish blob) |
| Webvern | `canopy weaver spider-wyrm` | `…, a long serpentine dragon body carried on eight spider legs` | failure measured (`pt-webvern`: a plain spider, no wyrm) |
| Sporantle | `spore-antlered fungus beast, a decomposer` | `…, its antlers branching mushroom stalks tipped with round spore caps` | failure measured (`pt-sporantle`: plain deer antlers) |
| Undermere | `eyeless serpent` | `…with a smooth blank head, no eyes and no eye sockets` | failure measured (`pt-undermere`: large prominent eyes) |
| Bogling | `mudball tadpole` | `…, a legless round mud-brown body tapering into one broad paddle tail` | failure measured (`pt-bogling`: bipedal blob, arms, legs, no tail) |
| Wispurr | `will-o-wisp cat` | `…wreathed in pale drifting ghost-light` | failure measured (`pt-wispurr`: ordinary black cat, no light at all) |
| Gloomoth | `migratory dusk moth` | `…, a broad furred moth body with wide feathered antennae and soft scalloped wings` | failure measured (`pt-gloomoth`: bare butterfly filaments, smooth body) |
| Stonewing | `obsidian condor` | `…, a vast vulture with enormous broad wings, long fingered wingtips and a bare head` | **neither** — no Stonewing trial exists; rewritten on the rule alone |

**Deliberately NOT rewritten — `Pyrelisk`, `vent basilisk`.** This is the G2 line and it is recorded in
`_concepts.Pyrelisk.source`: a shape restatement is legitimate only where the term already fixes the
anatomy. `gharial` fixes a snout, `lungfish` a body plan, `condor` a wingspan. `basilisk` fixes
nothing — mythic serpent or crested lizard, and bible §4 row 20 names neither — so choosing one would
be inventing anatomy, which is the violation. Flagged for a supervised first generation instead.
Every other concept (`stag`, `crow`, `vole`, `hare`, `tortoise`, `boar`, `ram`, `kestrel`, `newt`,
`hedgehog`, `elk`, `rat`, `shadow cat`, `sod clump`, `reed wader`, `wisp-moth`, `grub`, `fox kit`) is a
common word the model renders correctly — `pt-duskstalk` confirms this directly — and was left alone.

**Not verified, and it should not be claimed:** only Fenmaw's fix has been through the generator.
The other eight have a measured failure and a reasoned fix. **No verification generation was run** —
G13 caps batches at 20 and the credits are Hank's.

**A second, larger failure mode was found while auditing and is NOT fixed by any of this (B-D38):**
Bogling, Puddlisk, Mirefin and Wispurr all render as the same chibi bipedal mascot regardless of what
the subject says, and Gloomoth lost its six insect legs to the same stance. That prior looks like the
§9.2-locked class skeleton, not the subject — so it is a spec deviation and Hank's call. **At the
first supervised B3 batch, generate Fenmaw, Mirefin and Wispurr front views and look at them before
the remaining 148 rows are billed.**

---

## Q6 — `data/nodes/r4.json` ships healthy, but the bible says Cindershelf is entered mid-collapse

> **LANDED 2026-08-25 — and the defect was not the one this section describes.** The decision held
> (r4 ships healthy; the act-4 raid crashes it), but measuring the mechanism instead of trusting it
> showed it did not work: `targets[].remove` was priced against r4's SHIPPED counts while the ecosim
> steps every node at every season boundary, so the node the player arrives into is not the file. At
> the shipped state the tier above the harvest sat at a food ratio of 0.179 and the apex reached 0 in
> 39/64 seeds; after twelve seasons of untouched world, 0.658 and 1/64. Fixed by taking the STANDING
> STOCK (`balance.yearEvents.harvestFractionOfStanding: 0.8`, derived from the authored 11-of-14 and
> 8-of-10 so the beat as authored does not move). `npm run harness` re-run, `docs/BALANCE-REPORT.md`
> regenerated. G6 intact: nothing in `core/ecosim.ts` knows a raid happened. D-Q6-1 … D-Q6-3.

Content-bible §6: Cindershelf is *"arrival mid-collapse — Route 4's web already crashed by Cullbrand
strip-harvest."* The shipped node contradicts it: **Cragmar 10, Pyrelisk 14, Stonewing 3 — healthy
populations.** Only `floraStock: 42` hints at anything wrong.

The dialogue was rewritten so it no longer asserts a collapse the data does not ship — the right
short-term call, since NPC copy claiming a crash that the ledger contradicts is worse than silence
(Hard Req 2: the ledger shows real numbers). **But the node data is the real fix.**

**Care needed:** r4's populations feed the ecosim and the balance harness measured its six-year
trajectories against these exact values (`docs/BALANCE-REPORT.md` — r4 is where the emergent Stonewing
starvation was observed). Changing them invalidates those measurements, so re-run `npm run harness`
in the same change and update the report. Interacts with **Q3**: under act-gating, the raid that
crashes r4 fires on act, so decide whether r4 ships pre-crashed or is crashed by the raid script on
arrival. The latter is better — it keeps one source of truth and lets a player who arrives early see
it happen.

---

## Q7 — `data/dialogue.json` is not wired to anything

499 lines, 211 entries, 62 speakers, 87 green tests — and **nothing in `game/` reads the file.** The
tests prove it is well-formed, self-consistent and truthful about the game's rules; they do not prove
one line ever reaches a player. This is build-order **C7**, which was not in the Lanes B+C wave.

`core/dialogue-schema.ts` already exports `conditionHolds()` and `selectEntry()`, so the game layer
must NOT reinvent condition resolution — wire to those.

---

## Q8 — magic-number allowance row for `core/dialogue-schema.ts`

Blocked on the balance-fixes workflow, which owns `tests/gates/guardrails.test.ts`. Add verbatim:

```
"core/dialogue-schema.ts": { values: [4, 8, 120, 400], why: "zod SHAPE bounds on the dialogue text
surface, never read by a formula: a line body is at most 400 characters and a choice prompt 120 (they
must fit the 480x320 dialogue box), an entry is at most 8 lines and a choice list at most 4 options.
The two values that ARE gameplay constants — the 1..6 year range and the 0..100 flora ceiling — are
read from balance.json (clock.yearsTotal, ecosim.floraMax), so no retune can move anything left here" }
```

Note the year range hardcode was already flagged and fixed by that agent — it now reads
`clock.yearsTotal`, which is also what makes it survive **Q3** (years become unbounded).
