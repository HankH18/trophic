# Queued changes — authorised, waiting on in-flight work

Both authorised by Hank 2026-08-25. Not started yet: each collides with a file a running
workflow currently owns. Launching them now would corrupt concurrent edits, so they are
specified here in full and dispatched the moment their blockers land.

---

## Q1 — Rename the Pokémon move duplications

**Authorised:** "go ahead and rename the Pokemon move duplications."
**Blocked on:** the balance-fixes workflow, which owns `tests/unit/transcription.test.ts`.

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

---

## Q6 — `data/nodes/r4.json` ships healthy, but the bible says Cindershelf is entered mid-collapse

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
