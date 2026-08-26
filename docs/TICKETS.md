# TICKETS

The work queue. Every ticket here carries a ruling Hank has already made — **these are decided, not
open.** Do not re-ask them. Where a ticket says a thing is his call, that call has been made and is
quoted.

Status vocabulary: `TODO` · `IN PROGRESS` · `DONE` · `CLOSED` (decided, no work needed).
When a ticket is finished, mark it `DONE` and leave it. When the file gets long, delete the `DONE`
rows — git holds them.

**Order.** T-1 first, by Hank's instruction. After that, work top-down within each section unless a
ticket names a dependency.

---

## T-1 · Revise the tick system — FIRST

**Status:** TODO · **Hank:** *"one of the first things I'd like to do is revise the tick system"*

The season meter is 16 ticks (`balance.clock.ticksPerSeason`); actions spend ticks; four seasons
make a year. Hank wants this reconsidered before other systems are built on top of it.

**No design has been ruled on.** Get the shape from him before building. What is known and should be
put in front of him:

- Catching one Elder-age creature costs 7–10 of a season's 16 ticks. That is the number that makes
  Sel's wager a real gamble, so it is load-bearing for T-6.
- The calendar is unbounded — no year cap, no fail state, and a gym win no longer ends a year
  (locked decision L8 as amended). Story progress runs on **acts**, not the calendar. The two clocks
  meet nowhere. Any tick revision must keep that separation or it re-couples them.
- `advanceYear`, `ecosim.step` (one season step per boundary), regional-event windows
  (`ticksPerSeason` long), aging, retirement and boxed aging all key off this clock.

**Do not start editing.** Bring him a proposal with the blast radius measured.

---

## Content and spec

### T-2 · Cascade clause — amend §10.2 to describe what the food web produces
**Status:** TODO · **Hank:** *"letting the biomes gain a mind of their own and not forcing any
particular outcomes"* … *"keep that how it is"*

Build-doc §10.2 promises that depleting an apex's primary prey below 10% for two seasons yields
**both** the apex dying **and** the mesopredator rising. The second half is structurally
unreachable: bible §5 gives every apex a diet containing its own mesopredator, and at most nodes the
mesopredator **is** the primary prey — so the animal you must crash to starve the apex is the same
animal that is supposed to be released. It fires in 12.5% of real-play runs, 0–13% across a
128-seed sweep.

**The ruling: do not force it.** The simulation stays as it is. The specification stops promising a
guaranteed outcome and describes what the §7.3 rules actually produce.

- Amend build-doc §10.2. Do **not** tune `balance.json` and do **not** change any diet (G2).
- `tests/integration/demo-beats.test.ts` currently documents the gap; rewrite it to assert the
  amended clause.
- Guardrail G6 still binds: the cascade must emerge from the rules, never be scripted.
- Related: `tools/harness/fixture.ts` has a one-line filter making the replay credit the
  mesopredator rather than any surviving prey. **Nothing binds it — delete it and every test still
  passes.** Either bind it with a test or record that it is undefended.

### T-3 · G7 read — scope it, then retire the item
**Status:** TODO · **Hank:** *"Scope the read to the 77 entries / 173 lines; re-check only the ones
the rewrite touches and then after, declare the word-matcher sufficient and drop the item. I'm not
going to continue getting stuck in the weeds with dialogue until everything else is done, and I
didn't even pick this rule."*

1. Read the 77 entries / 173 lines that can break G7 — the ones whose trigger names a population or
   plant count, the fallback entries that fire *because* a population dropped, the quest turn-ins,
   both epilogues, retirement, the tutorial beats, the rival's 19, and the finale's 3.
2. Re-check only entries the readability pass touched.
3. Then declare the word-matcher sufficient and close this permanently.

**⚠ BLOCKER ON STEP 3, and it must be fixed or step 3 is a lie.** The permanent G7 gate does not
scan the dialogue at all. `tests/gates/guardrails.test.ts:745` reads
`const COPY_SCAN_DIRS = ["game", "core"] as const;` — `data/`, where essentially all player-facing
copy lives, is excluded. Its own header (line 721) says to widen it to `data/` "once that rewrite
has landed." **The rewrite has now landed.** Widening the constant alone is a no-op, because the
walker only collects `.ts` files and `data/` has none — the gate must be taught to read JSON.

Declaring the word-matcher sufficient while it looks at nothing is exactly the failure this repo
keeps hitting. Fix the gate, then close the item.

### T-4 · Reword the seven "six years" lines
**Status:** TODO · **Hank:** *"reword all seven"*

Seven lines say the run took six years. The calendar is unbounded and story runs on acts, so a slow
player reaches the finale in year 11 while the HUD prints the real year on screen next to a speaker
saying "six." Reword all seven. `yearsTotal: 6` stays as the nominal length.

The six that state it as a run length: `wick.act6.win`, `greaves.finale.pre`,
`maren.epilogue.released`, `amb.hearthollow-fenceman.late`, `amb.brackwater-netmender.late`,
`amb.r1-forager.late`; plus `wick.act3.win`'s "three years running". Pinned by
`tests/unit/dialogue.test.ts:2335` — update the pin with the copy.

### T-5 · Write Sel's missing wager-loss entry, and remove the per-speaker line ceiling
**Status:** TODO · **Hank:** *"Write the missing loss entry, but remove the ceiling. I don't care
about how much dialogue a character has."*

Sel bets you can catch an Elder Mirefin before the year turns. Losing writes a flag **nothing
reads**, so he silently re-offers the identical bet and the player is never told they lost. Write
the loss entry.

**Remove the per-speaker line ceiling** in `tests/unit/dialogue.test.ts` — Hank does not want dialogue
volume capped per character. Removing a cap he set is not weakening a test; say so in the commit.
Keep the corpus-level budget (`LINE_COUNT` 400–560) unless he says otherwise.

**Do not reword the deadline.** A gate keys on the literal phrase "before the year turns" to prove
the quest has a real deadline.

### T-6 · Correct two false records, and write Duskhollow's arrival scene
**Status:** TODO · **Hank:** *"do that plus write Duskhollow's arrival scene"*

Two filed records are structurally false and should be corrected, with an invariant test so they
cannot be re-raised: the same balance row both opens Cinder Steppe and fires the raid, so there is
no reachable "before" state; and act transitions are already marked three ways.

What is genuinely missing: **Duskhollow is the only act-opening town with no arrival cutscene.** The
other five have one. Write it — reuses existing machinery, no schema change, roughly one entry.

### T-7 · Amend the bible on the Bloom Year
**Status:** TODO · **Hank:** *"amend the bible"*

The bible promises bonus spawns when a route's plants thrive. Plant stock can structurally never
fall (regrowth 8/season exceeds maximum possible consumption), so the bloom window opens once per
location in years 1–2 and can never recur. The bonus-spawn half was deliberately never built,
because guardrail G3 forbids a second spawn table. Amend the bible to match. Do not fabricate an
effect the sim cannot back.

### T-8 · Record Route 4's apex extinction as intended
**Status:** TODO · **Hank:** *"Say so in the spec"*

Route 4's apex reaching zero is caused by the Cullbrand Company raid, not by an unintended
imbalance — a control run with no raid shows nothing goes extinct unprompted anywhere, and the bible
independently pins this collapse to this place and act. Say so in the spec.

### T-9 · Close the raid list at one
**Status:** TODO · **Hank:** *"Close the raid list at one."*

One raid ships against seven acts. Widening it at the same 80%-of-standing-stock intensity was
measured to exterminate lines at the two starter routes. The shipped dialogue already treats the
contract as finished. Record the decision so nobody authors more.

### T-10 · Starter lifespan — correct the bible, halve the age effect
**Status:** TODO · **Hank:** *"correct the bible sentence, then reduce the age buff/nerf to have half
the effect it currently does."*

The bible says the starter "peaks right before the league, then retires." Acts and the calendar are
decoupled, so "the league" has no fixed year and no lifespan table can satisfy that sentence.
Correct the bible sentence — the shipped dialogue already agrees with the game.

Then **halve the age multiplier's effect.** This is the juvenile/adult/elder stat multiplier, and it
is the dominant term in two separate complaints: a juvenile starter loses ~74% of Route 1 fights
while an adult at the same level 5 loses only 11%, and 76% of the heir's "2.1× power drop" is this
multiplier resetting, not the level halving. Halving it addresses both.

It is a `balance.json` retune (G11 — no gameplay constant is a literal in code). Expect the pinned
lifecycle test tables to move; re-derive them, do not loosen them. Leave `heirLevelFactor` at 0.5.

### T-11 · The three weakest creatures
**Status:** TODO · **Hank:** *"log the arithmetic, re-spend the Producer template only, and leave
Carricrow alone"*

Carricrow 7.9%, Sporantle 12.9%, Loamunder 26.7% in peer fights. Stats come from **role templates** —
every non-Ancient line spends exactly 300 base points, no per-species hand-tuning — so the two
Producers and the one Scavenger being the three worst is structural, not luck.

1. **Log the arithmetic**: the 24 lines fight only each other, so their mean is mathematically pinned
   at 50% and a ±15-point band structurally excludes ~10 of them however points are spent. Record
   this so nobody chases it again.
2. **Re-spend the Producer template only.** Re-spending both leaves the out-of-band count at 10 of 24
   anyway and makes the finale harder.
3. **Leave Carricrow alone** — it is the only high-Instinct line and catch success now scales with
   Instinct, making it the best catcher in the region. The bible frames it as a non-fighter on purpose.

---

## Systems

### T-12 · Close the progression loop, and give money a purpose
**Status:** TODO · **Hank:** *"Close the loop, Health persists, plus an explicit penalty. Set up the
new items to be sold in towns, giving a purpose for the money."*

**The largest build ticket here.** Today, losing a battle costs nothing — and the hole is wider than
that:

- `save.party.curHp` has **zero writers**. Damage evaporates between fights, so the inn's rest action
  heals nothing it needs to.
- **Experience and levels are never written back.** A creature never actually trains. A creature
  carried six in-game years is exactly as strong on the last day as the first.
- The item bag is a copy, so consumables are effectively infinite.
- Nothing anywhere spends money.

Deliver all of it:
1. Health, experience and items persist across battles. Wire the fainted-party guards.
2. The inn heals what it charges for.
3. An explicit loss penalty. The constant goes in `balance.json` (G11), never in code.
4. **Items sold in the five town shops**, so money has a sink and the penalty bites.

Touches `game/` battle-end handlers, the four fainted-party guards, the shop service beats, and ~6
test files. **Do this before any further gym retune** — every win rate currently comes from a player
model that never levels.

### T-13 · Fix the gym measuring instrument
**Status:** TODO · **Hank:** *"Fix the instrument"*

Not the fights — the ruler. Two defects:

1. `tools/harness/player.ts:219` scores a creature as "covering" a matchup if it merely **knows** an
   effective move, never checking whether the greedy policy would actually pick it over a bigger
   neutral hit. That changes which creatures the model drafts.
2. Gym 6 (Greaves) should be headlined at the **level cap**, where the fight actually happens — 46%,
   inside the 45–65% band — not the 36.2% figure measured at a level the player cannot be at, since
   his ace sits exactly on the cap.

Gym 1 is already understood as an artefact: 93.4% at the party size the game allows, inside its
80–95% target. Fixing the ruler once already moved "1 of 6 gyms in band" to "4 of 6" without
touching a game value. Change what you measure before you change the game. **Do not lower Greaves's
levels as part of this ticket** — if 46% still feels wrong afterward, that is a separate, deliberate call.

### T-14 · Seed guardrails, and the over-catch fixture
**Status:** TODO — **needs Hank's design input, see below**

**What a seed is here.** `save.seed` is the single 32-bit master seed for a whole run, set once at
new game. Every random draw derives from it: `subsystemRng(save.seed, tag)` hashes the seed with a
subsystem tag (`"battle"`, `"sim"`, `"encounter"` — from `balance.rng.subsystemTags`) into an
independent xorshift128 stream, so the battle stream cannot desynchronise the sim stream. It is the
determinism root, **not** the raid: the Cullbrand raid is authored content in
`balance.yearEvents.raids`, act-gated and not random.

**It is not currently randomised at all.** `requestedSeed()` returns `balance.rng.defaultSeed` — a
fixed constant — unless overridden by a `?seed=N` URL parameter. So every new game today gets the
same region. Hank asked to "put some guardrails on what range the seed can fall in"; the prior
question is whether to randomise it at all, and over what set.

**Flag this tension before implementing.** Restricting the seed set to values where the cascade beat
is legible would be selecting for an outcome — which sits against guardrail G6 and against Hank's own
T-2 ruling that biomes should not have outcomes forced on them. Randomising freely is consistent with
both. Put that choice to him rather than picking.

The over-catch fixture (`fixtures/overcatch-script.json`, seed 12) is not reproducible in real play
on its current seed; the beat holds on a majority of low seeds. **It was not verified whether ticks
are the cause** — the evidence points at seed choice, not the clock. Re-measure before treating it as
evidence for anything, and note it interacts with T-1.

---

## Art and spend

**Nothing has been billed yet.** `assets/final/` holds one empty file; 287 of 288 manifest rows are
unstarted. Every rename and every palette swap is free right now and expensive after the batch.

**Nobody knows what one image costs** — `tools/comfy/manifest.json:9` records `perImageCredits: null`
and the platform exposes no credit-balance endpoint. Read the account dashboard immediately before
and after the first batch of known size to calibrate it. That is free if attached to a trial already
authorised below.

Guardrail G13 still binds: **no batch of 20 or more images without Hank's explicit `--confirm`.**
Every trial below is under 20 and does not need it. The 150-sprite batch does.

### T-15 · Swap the palette to the class-equal fit
**Status:** TODO · **Hank:** *"class-equal"*

Swap `data/palette.json` to the class-equal fit — the one that fixes water while protecting the
player character's own colours. 32 hex values in one file, 0 images. Do it **before** any generation,
because every image is force-snapped to whatever is live.

Keep the positional contract intact: the 32 ids `c00..c31`, the count, and the `frozen`/`frozenAt`
pair are what every downstream consumer indexes against. Only the hex values move.

### T-16 · Creature sprites — run the real experiment
**Status:** TODO · **Hank:** *"A. Run a real experiment"*

All 150 creature sprites derive from one shared prompt sentence, and the trials come back as the same
upright chibi biped whatever the description says — the Water starter renders as a pale-cyan bipedal
turtle with blush cheeks.

Run **one creature, one fixed seed, three prompt variants**, to isolate whether the pose lever or the
negative prompt causes it. Add the **Water starter's front view as a fourth image**, so the
does-this-read-as-someone-else's-design question gets answered by the same spend. 4 images total.

Free fix riding along: one creature ("Pyrelisk") has no body described anywhere beyond "vent
basilisk", so its 8 rows would each roll a different anatomy — pin one shared seed across them.

Changing the shared prompt sentence is a build-doc §9.2 amendment, not an agent edit — bring the
result back before editing it.

### T-17 · Town map — fix scale, keep isometric
**Status:** TODO · **Hank:** *"fix scale, keep isometric"*

The map came back isometric rather than flat top-down. It does not break movement — the engine never
reads the picture — but at game scale the roads are too narrow to read as roads and one house fills
most of a screen. Re-trial keeping the isometric look and fixing scale. 4–8 images.

### T-18 · Field-guide plates — trial it
**Status:** TODO · **Hank:** *"you said this is listed in the spec, so why are you asking me about
it? Trial 1-3 images"*

Trial the painted style: 1–3 images, being the three age-forms of **one** creature line, testing style
consistency — not three species. The spec already writes the fallback (cut line C-4: pixel sprites on
parchment frames if it cannot reach approval in one supervised loop), so this did not need asking.

### T-19 · Fix the dex wiring bug
**Status:** TODO · **Hank:** *"yeah, no shit, fix it."*

The guide screen asks for `dex/<name>` (`game/survey-view.ts:788`) and the pipeline can only produce
`dex-painted/dex-<name>`. **Zero of 35 plates could reach the screen.** Independent of T-18's style
ruling — fix it now.

### T-20 · Player side view and walk cycle — in code, 0 images
**Status:** TODO · **Hank:** *"fix the side view in code, then derive the walk frames the same way."*

Back and side views were built in code from the approved front sprite. One real defect: the side
view's legs still face the camera. Fix in code, then derive the walk frames the same way — 0 images.
A 14-image sweep already measured that generating frames barely moves this character in the denoise
band the spec calls for, and build-doc §9.6 already commits the fallback in writing.

Note nothing is wired either way: `game/movement.ts:389`'s step function has **zero callers**, so no
animation exists yet. Wiring it is part of this ticket.

### T-21 · Audio — correct the track list first
**Status:** TODO · **Hank:** *"correct the list to its 11 real rows first (3 doc edits, 0 cost), then
shop one family against it"*

The 16-track list is stale: 5 tracks are for places cut from the game and 6 are labelled by a timeline
replaced everywhere else. Correct it to its 11 real rows — 3 doc edits, no cost. **Then** shop one
composer family against the corrected list. Guardrail G9 requires one family and an attribution file
if the licence needs one. All sources are free-licence, so nothing costs money.

The game is currently silent: zero files in `assets/audio/`, zero `this.sound` calls in `game/`.

---

## Intellectual property — CLOSED. Do not reopen.

### T-22 · Affirm every flagged name and write it down
**Status:** TODO (the writing-down) · **Hank:** *"affirm all of them, write it down. I already gave
approval for all of these. DO NOT ASK ME THIS AGAIN ABOUT THINGS THAT HAVE ALREADY BEEN CREATED."*

**Every flagged name stays.** TROPHIC, Fallowmere, Duskhollow, Duskhollow Vale, Undermere, Mirefin,
Gloomoth, Umbrat, Wispurr, Bramblore, Cragmar, Daunt, and the 37-name second tier. Nothing is renamed.

Work remaining is recording only:
- Amend locked decision L1 to state the names are affirmed, not provisional.
- Fix `content-bible.md`'s "All names are placeholders" line — it is now false.
- Tick build-doc §18's IP-sweep checklist box, reworded to state what was actually screened.

**Never put a name question to Hank again for anything already created.**

### T-23 · TROPHIC is a free class project — record it and stop
**Status:** TODO · **Hank:** *"this is a class project that will be free. Shut the fuck up about IP!"*

Record in build-doc §3 as a locked-decision row: **not sold, no paid storefront, free distribution.**
That closes the distribution question, the clearance-search question, and the storefront-dependent
half of the naming ratings.

**Do not raise intellectual property again.** No clearance search is being bought. If a future agent
believes it has found an IP issue, it records it in this file and does not ask.

---

## Closed — recorded so nobody re-raises them

| Item | Ruling |
|---|---|
| **Retirement offers a choice with one live side** | **Not a defect.** BOON needs another creature to receive the stat bump; with one starter there is no target, so the code applies HEIR. Hank: *"if the player finds themselves in a situation where all they have is one creature, then this forced choice prevents the game from being blocked, which is a good thing."* Mid-development artefact — the finished game is not one-starter. |
| **The survey rounds to one decimal** | **Filed in error; struck.** Creature counts are already integers (`renderSurveyRow` prints `String(row.count)`). The one decimal is on `floraStock` and `recentDeaths`, which are genuinely real-valued in core — flora is an abstract producer stock, recent-deaths a decaying accumulator. Nobody ever sees half a creature. |
| **"Who is editing the repo"** | Claude and its subagents. Not a mystery. |
| **A governing document disagreed with its own instrument** | Fixed. `CAST-AND-VOICE.md` was collapsed 2,525 → 280 lines; the contradicting table went with it. |
| **A stale prose-lint health claim** | Fixed. It lived in `RESUME-HERE.md`, which is deleted. |
| **Art and maps not yet created** | Known and accepted. Hank: *"I'm aware that we have not created the art yet, once you get your shit together, we can do that, but not yet."* Do not raise it as a finding. |
| **Attributability as a universal bar** | Withdrawn. Scoped to lines doing characterisation work. `CAST-AND-VOICE.md` §3. |
| **Sentence length as a prose defect** | Withdrawn. Hank: *"I'M OK WITH LONG SENTENCES IF THEY ARE UNDERSTANDABLE."* Linearity is measured; length is not. |
| **`G13-NOUN-CARRIED`'s corpus share** | Diagnostic only, per-speaker only, and **not to be driven down.** |

---

## Standing rules for whoever works this queue

- **Do not re-ask a decided ticket.** Every ruling above is quoted from Hank directly.
- **Do not frame work around the demo video.** Features are argued on their own merits.
- **Never express effort in human hours** (G12).
- A date inside a document is context, not a constraint.
- **Green tests prove only what they exercise.** Before trusting a metric, ask what produced it and
  sabotage it to see whether it bites. This repo has had a cascade metric that counted the wrong
  animal, a prose linter whose checks were fossils, a gym harness measuring a party size the game
  does not allow, and 2,095 tests certifying a finale nobody could reach.
