# TROPHIC — Final story-logic repair plan

Synthesis of three independent planner passes (holes / mechanism / reachability) over the same
corpus, with every disputed claim re-checked against the shipped files in this session.

**Corpus as measured this session:** 211 entries, 499 lines, 62 speakers.
`when`-key histogram: `actMin` 60 · `flagsUnset` 63 · `flagsSet` 52 · `yearMin` 19 · `population`
17 · `act` 10 · `floraStock` 4 · `flagEquals` 2 · `seasons` 1 · **`years` 0**.

**Counts:** 2 blockers · 17 bugs · 12 holes · 5 thin · 5 cosmetic.

Every item below carries a verification verdict. "Verified" means I read the shipped file this
session. "Claim was wrong" means a planner asserted something the file contradicts.

---

## 0. Rulings on the disputed items

These are the places the three planners disagreed. Each is settled here with evidence.

| # | Dispute | Ruling |
|---|---|---|
| D-a | **holes-R1**: make `OverworldScene.winGym` write `runCompleteFlag` directly. **reachability-R2**: do NOT — it reintroduces a two-authorities defect. | **reachability wins. holes-R1's fix is REJECTED.** Verified `core/acts.ts:243-258`: `runIsComplete` already reads *two* authored conditions (the flag, and the badge count) and its own header plus `DEVIATIONS.md` D-Q3-15 record that this was deliberate — "Neither is computed from the other." A third writer of the same flag from `winGym` makes three. The correct fix is B1 (play the `battle-win` entry), which makes the corpus write its own flag as authored. |
| D-b | **holes-R4**: a chainless player hands the finale resolver a catch attempt against a line the encounter layer weighted to zero. | **Claim was wrong in its premise.** It is only true if the resolver rolls through the ordinary encounter-weight table. Both mechanism-R1 and reachability-R3 specify a **scripted** encounter (the `game/gym-battle.ts` shape) that builds its battler directly, which is also what keeps G3 intact. Adopted: scripted. The *residual* real problem holes-R4 found — `chain.vellsire.complete` is written by `maren.keystone.6` and read by nothing in the corpus — survives as **H5**. |
| D-c | **holes-R4 vs reachability-R4**: does the chain gate the finale too tightly, or too loosely? | **reachability wins — verified, and it is the opposite of holes' reading.** `data/nodes/sanctum.json` ships `vellsire-line {count:1, carryCap:1}`; `data/species.json` gives it habitat `["Sanctum","hidden"]`; `balance.encounter.signChainGatedHabitatTag` is `"hidden"`; `OverworldScene.unlockedSignChains()` (line 1090) unlocks it on `chain.vellsire.complete`; and `maren.keystone.6` writes that flag on `{actMin:6, flagsSet:["chain.vellsire.step9"]}` with **no Greaves requirement**. The stag is *too* available, not too gated. See **B12**. |
| D-d | **holes-R3**: fix the Star Census by changing `syncQuestFlags` (clear the flag / drop the short-circuit). **mechanism-R3 + reachability-R11**: the entry writes `false` and no code changes at all. | **mechanism/reachability win, and the mechanism is already built.** Verified `core/quests.ts:155-158` — `flagIsSet` returns false for `v === false`. Verified `core/dialogue-schema.ts:210` — `zFlagValue` is `z.union([z.boolean(), z.number(), z.string()])`, so `false` validates. Verified `game/quests.ts:376-379` — the re-arm write `due[milestoneAtFlag(def.id)] = dexIdentities(...)` **already exists** and is dead only because the owed flag is never cleared. Writing `false` from Ives's entry revives code that is already there. Zero code change. |
| D-e | **holes-R5**: wager objective becomes `catchesAtBeforeYearTurn {node:"r2", age:"E"}`. **mechanism-R5**: `holdsAgeBeforeYearTurn {age:"E"}`. | **holes wins.** Verified `game/quests.ts:169` ships `{kind:"holdsAge", age:"E"}` — no catch term. The defect is not only the missing deadline: the copy says *"caught and brought back"*, and `holdsAge` is satisfied by the player's own Juvenile starter ageing into an Elder on the bench. mechanism's shape leaves that half of the bug in. Take holes' objective shape, mechanism's lapse-writer mechanics. See **B13**. |
| D-f | **holes-R14 / mechanism-R9 / reachability-R12** all repair *Vellsire's Trail* differently. | **mechanism-R9's one-clause fix is the spine; reachability-R12's Maren entry pays the promise; holes-R14's narrowing is the alternative Hank should rule on.** mechanism's is provably acyclic (gate stone = chain step 9 → trail turn-in → Orrin → `maren.keystone.6`), costs one clause and zero new content, and makes Orrin's hand-off line literally true. holes-R14 correctly notes the residual cost: the quest is offered at act 5 and cannot close until the act-6 gate stone, so the player walks back to Duskhollow in the last act. That is a pacing call, not a logic error. See **H5** and **DO NOT FIX / user rulings**. |
| D-g | **holes-R18** wants raids for acts 2, 3 and 5. **mechanism-R13** wants exactly one (act 3, `barkhide-line`) plus a bible amendment. **reachability-R18** wants three and warns that raiding `barkhide-line` collides with `amb.bowerdeep-logger.thin`, which is authored as the *player's* consequence. | **Merged: ONE new raid, at act 3, on `mosslet-line` — not `barkhide-line`.** mechanism is right to be conservative (every raid is a balance change measured in extinctions; the shipped act-4 row was tuned over 64 seeds and retuned once). reachability is right that mechanism picked the one target that steals a player-consequence line. Verified `data/nodes/r3.json`: `mosslet-line: 8`, `barkhide-line: 10`. See **H12**. |
| D-h | **holes-R15** wants Duskhollow's dark gated on flora. **mechanism-R11** wants it restated as a disagreement, not built. **reachability-R19** wants both. | **Merged, mechanism-first.** Verified: nothing in `core/`, `game/` or `data/` models Sanctum destabilisation. Verified `noct.greeting` **already ships the honest version** — *"Orrin thinks the dark in the vale has been deepening since the Sanctum went quiet. Ives thinks Orrin needs a better lamp. I stay out of it."* Restate around that; gate the *trend* claims on `floraStock r5`; build no darkness clock. See **H7**. |
| D-i | **holes-R6**: the dex should be monotonic, read off the action tape. Unraised by the other two. | **Verified and adopted.** `game/quests.ts:228-237` — `dexIdentities` iterates `[...save.party, ...save.box]`. Releasing decrements it. *Restock the Shallows* requires four releases. Two never-cut systems contradict. See **H9**. |
| D-j | **holes-R21 / mechanism-R14 / reachability-R20** disagree on how many "six years" lines to rewrite and whether to touch `maren.epilogue.released`. | **mechanism's split wins.** Rewrite the four act-gated claims; leave the three `yearMin:6` ambient ones alone (true at their floor; a fence-mender rounding is a person, not a bug). `maren.epilogue.released` is one of the two most-quoted lines in the project — flagged for Hank rather than rewritten by an agent. See **C1**. |

**Confirmed stale in `docs/STORY-REVIEW.md`, all three planners agreeing and independently verified
by me:** D1 and D2 (the 44 year-gated entries and the First Signs dead-end) are **already fixed** —
the `when`-key histogram above shows zero `years` clauses. D12 (r4 ships healthy) is **already
fixed** — `balance.yearEvents.raids` is act-keyed with `harvestFractionOfStanding: 0.8`. Mark those
three stale in STORY-REVIEW so the next reader does not re-derive them.

---

## P0 — Two blockers that gate everything below

### P0-A — The line budget is full. 499 of 500.
**Verified.** `tests/unit/dialogue.test.ts:918-919` asserts `LINE_COUNT` between 400 and 500;
`:137` asserts `raw._counts.lines === LINE_COUNT` exactly. Measured corpus: **499 lines**.
Per-speaker ceilings at `:903-912`: `NAMED_OVER_BUDGET = {maren:72, wick:40, sel:34, bram:24}`,
`NAMED_CEILING 18`, `AMBIENT_CEILING 9`, `PROP_CEILING 30`, and the ambient **median pinned at
exactly 3** (`:955`). Measured today: maren 70, wick 37, sel 32, `prop-antler-stone` 25, bram 20.

This plan's net-new content is roughly **+70 lines**. Wick alone goes to ~49 against a ceiling of 40.
Every net-new-line repair is blocked until this is ruled on, and the failure mode if it is not is
that a writer quietly deletes good lines to make room.

**Fix:** amend bible §13.13's band and raise the constants — recommend total **400–580**, and
`{maren:80, wick:52, sel:38, bram:28}`. Keep `NAMED_CEILING`, `AMBIENT_CEILING`, `PROP_CEILING` and
the ambient median exactly where they are, so the bound stays real. The corpus's own `_budget`
field already states the reason: *"ambient speakers … carry year/population state variants the flat
budget did not price in."* Log a DEVIATIONS row naming the measured reason.
`prop-antler-stone` at 25/30 is the tightest — H5 and H6 both add to it; budget them together.

**Risk:** raising a cap is the one move that looks like weakening a test. The DEVIATIONS row must
state the measured reason, and the new ceilings must be ceilings, not removals. The
`NAMED_OVER_BUDGET` list is separately asserted to hold ≤5 names *and* that each named speaker
carries a chain or a six-act arc (`:940-945`) — all four qualify; do not add a fifth.
**`_counts.lines` is asserted exactly and must move in the same commit as any line change.**

**This is Hank's call.** If he declines, the alternative is a trim pass that names which existing
lines go — the honest place is Maren's six near-duplicate per-node greetings. Say so; do not let a
writer improvise it.

### P0-B — Two lanes want the same file. Sequence them.
`data/dialogue.json` is edited by **this plan** (conditions, priorities, `setFlags`, new entries)
and by the **voice/naming lane** (prose, speaker names, LEDGER→SURVEY copy). Those are not disjoint
file scopes. Running them concurrently corrupts the file. Execution order at the end of this
document.

**Naming-lane fact the brief gets wrong, and it needs Hank:** the brief lists **Nessa** among the
seven coined given names to keep. **She has already been renamed.** Verified `data/dialogue.json`
speakers: id `nessa`, display name **`Hetty`** — done under `DEVIATIONS.md` **D-Q2-4** as an IP
sweep move. A writer told to "keep Nessa" will rename Hetty back and undo an authorised change.
The keeper list is really: Tolm, **Hetty** (id `nessa`), Halder, Pell, Gerta, Ives, Orrin.

**Naming-lane scope, measured:** 31 ambient + 10 generic speakers carry job-title display names.
The coinages the user named (Net-Mender, Shaft-Hand, Silk-Winder, Lamp-Keeper, Old Drover,
Stilt-Town Elder, Fishery Buyer, Meadow Forager, Ferry-Hand, Canopy Elder, Steppe Elder, Vale
Elder, Cullbrand Worker) are all in that set, plus Lampwright, Vale Shepherd, Fence-Mender,
Dockhand, Logger, Miner, Farmhand, Forager, Astronomer, Field Astronomer, Cullbrand Scout,
Cullbrand Logger, five Innkeepers and five Vendors.

---

## BUGS — content the player can never reach

### B1 — Nothing in `game/` ever selects a `battle-*` entry. 35 entries, 74 lines, dead.
**Verified.** `grep` for `battle-pre|battle-win|battle-loss` across `game/`, `core/` and `tools/`
returns only the kind list in `core/dialogue-schema.ts:77-79` and a comment. Every other hit is a
test. `game/dialogue-runner.ts:93` `AUTOPLAY_KINDS = ["cutscene"]`; `:105` `TALK_KINDS =
["quest","lore","service","greeting","ambient"]`, whose own comment says *"`battle-*` are absent
because a battle scene selects them"* — and no battle scene does. `OverworldScene.challengeGym`
(`:1212`) launches the fight and `onFinished` (`:1250`) calls `winGym` without ever asking the
corpus for a line. Dead: all 18 Wick entries, the five gym leaders' pre/post, both Greaves finale
entries.

**Fix.** Add to `game/dialogue-runner.ts`:
`export const BATTLE_KINDS: readonly DialogueKind[] = ["battle-pre","battle-win","battle-loss"]`
and `battleEntryFor(file, speaker, node, kind, ctx)` as a thin delegation to `selectEntry` — **not**
a second resolver, same discipline as `talkEntryFor`. In `challengeGym`, play `battle-pre` before
`scene.launch`, launching the fight from that run's `finish` callback. In `onFinished`, call
`this.winGym(gym.id)` **first**, then play `battle-win`; on a loss play `battle-loss`. Apply the
entry's `setFlags` through `applyRunFlags`, exactly as `finishDialogue` (`:979-981`) does.

**Order is load-bearing:** `maribel.post.win` etc. also write `gym.<id>.beaten`, so playing before
`awardBadge` would advance the act mid-scene.

**Changes:** `game/dialogue-runner.ts` (+2 exports), `game/scenes/OverworldScene.ts`
(`challengeGym`, `onFinished`), `game/scenes/BattleScene.ts` if the hand-off needs it.
No entries, no flags, no conditions change.

**Risk to tests:** the existing reachability fixpoint in `tests/unit/dialogue.test.ts` must be
extended to run in "shipped build" mode (only flags `game/` actually writes are granted) and assert
211/211, not 172/211 — otherwise the green stays evidence of the corpus graph rather than of the
build. A missing entry must **flash a banner**, never no-op: gym-leader speaker ids currently equal
gym ids (verified — `maribel/odo/vesper/sable/noct/greaves` in both `data/gyms.json` and the speaker
list), and a future divergence would silently return `undefined`.

**Risk to the never-cut beats:** this is the prerequisite for B2, B3 and B5, i.e. for the finale
existing at all. Playing a cutscene inside a battle callback runs while the overworld is paused —
respect the `dialogueRunning` guard (`:283`) and the `scene.resume()` ordering or the box renders
behind the battle scene.

### B2 — `story.greaves.beaten` has exactly one writer and nothing plays it. The Vellsire cutscene is dead.
**Verified.** The only writer in the repo is `data/dialogue.json:1620` — entry `greaves.finale.post`,
`kind: "battle-win"`, which B1 shows nothing plays. `sanctum.vellsire.approach` gates on
`{actMin:6, flagsSet:["story.greaves.beaten"], flagsUnset:["story.vellsire.resolved"]}`.
`balance.acts.runCompleteFlag` is the same key (`data/balance.json:199`), and
`core/acts.ts:253-259` papers over the gap with a badge-count fallback, so the act ladder works and
nobody noticed. `OverworldScene.winGym:1271` writes `gym.greaves.beaten` via `awardBadge` — a
different key.

**Fix.** B1 is the fix; playing `greaves.finale.post` on the win writes the flag as authored.
**Do not add a second writer in `winGym`** — see ruling D-a.

**Changes:** none beyond B1. Add one assertion.

**Risk:** `runIsComplete` already returns true at six badges independently of the flag, so
`onRunComplete` and the `RUN_COMPLETE_SHOWN_FLAG` latch (`core/acts.ts:272`) already fire *before*
the Vellsire beat. Wiring the flag must not make the ending fire twice — check the latch ordering
in the year-turn `finish` path.

**New test:** "the shipped build reaches the ring" — a headless run that awards all six badges
through the real `challengeGym`/`winGym` and asserts `selectPropEntry(DIALOGUE,
"sanctum-antler-ring", "sanctum", ctx)` returns `sanctum.vellsire.approach`.
`tests/unit/overworld-scene.test.ts:1549-1600` currently asserts epilogue *selection* from
hand-set flags and says so in its own header — it will not catch a missing writer.

### B3 — `story.vellsire.resolved` and `story.vellsire.outcome` have no writer anywhere. Both epilogues are dead.
**Verified.** My flag census over the corpus puts both in the read-never-written set (14 externally
granted flags). `grep` across `game/` and `core/` returns three comments and zero writers —
`game/quests.ts:396`, `core/quests.ts:8`, `core/dialogue-schema.ts:730`, each naming the gap as
declared (D-INT-4). `tests/unit/overworld-scene.test.ts:1584,1595` sets both by hand and its header
says *"It is the game layer's write and the game layer does not exist yet."*
`story.vellsire.attempt` — written by the approach's two choices — is in the write-only set.

**Fix.** New module `game/finale.ts` exporting `resolveVellsire(save, content, rng)`, called from
`OverworldScene`'s dialogue `finish` callback whenever the run wrote `story.vellsire.attempt`:

- `attempt === "release"` → `{resolved:true, outcome:"released"}`, populations untouched.
- `attempt === "catch"` → run a **scripted** Ancient encounter (the `game/gym-battle.ts` shape,
  battler built directly, **not** through the encounter-weight table — G3 stays intact) against
  `sanctum` / `vellsire-line` on the seeded catch stream. `core/battle.ts` already supports
  `kind:"ancient"` and `game/battle-view.ts` already carries the framing. A successful snare →
  `outcome:"caught"` plus the catch decrement. **A failed snare → `outcome:"released"`.**

All odds from `data/balance.json` (`baseCatchAncient`); no `Math.random` (G11).

**Changes:** new `game/finale.ts`; `game/scenes/OverworldScene.ts`; `game/wild-battle.ts`
(shared catch path). `story.vellsire.attempt` leaves the write-only list.
No entry conditions change.

**New content: ONE entry.** `maren.epilogue.released.attempted` — speaker maren, node sanctum,
kind cutscene, **priority 96** (above the two existing epilogues at 95), `when: {actMin:6,
flagsSet:["story.vellsire.resolved"], flagsUnset:["story.epilogue.shown"], flagEquals:[
{key:"story.vellsire.outcome", value:"released"}, {key:"story.vellsire.attempt", value:"catch"}]}`,
`setFlags: {"story.epilogue.shown": true}`. 3 lines in Maren's register: the snare did not hold; the
counts are the released counts and the coefficient applies exactly as it does when you stood aside,
because the animal is out there either way; and she is writing down that it was *tried*, not that it
was chosen. Reuse the `keystoneBreedMult` / `presenceRadiusNodes` phrasing the released epilogue
already ships — no new vocabulary. **+3 lines; maren 70 → 73, over her 72 ceiling. Blocked on P0-A.**

**DEVIATIONS row required:** *a failed snare resolves as released.* Bible §4 makes Ancients very hard
catches, so this is the common outcome. A third terminal state would need a third full epilogue on
the most-watched beat in the demo; the odds satisfy §4, not a third ending.

**Risk to the never-cut beats:** this is the last thirty seconds of the demo video. Two latches must
survive: `story.epilogue.shown` (the fix DIALOGUE-NOTES §8 already made) and
`RUN_COMPLETE_SHOWN_FLAG`. `walkTheEnding()` in `tests/unit/overworld-scene.test.ts` currently
*stands in* for this write — once the writer exists that stand-in must be **deleted and replaced
with the real call**, or the test keeps certifying an absence. Determinism: the catch roll must draw
from a tagged subsystem stream or `tests/property/determinism.test.ts` fixtures move. Verify G10
("Caught Ancients never age") survives a caught Vellsire through a year turn in `core/lifecycle.ts`
— Maren's caught epilogue asserts it.

### B4 — The rival has no trigger, no roster and no module. 18 entries, 37 lines, dead.
**Verified.** `grep -rli rival game/ core/ data/*.json` returns only doc comments
(`core/acts.ts:14`, `game/year-events.ts`, `OverworldScene` arrival comments). `data/gyms.json`
holds six rows — `maribel/odo/vesper/sable/noct/greaves` — and no rival. Wick exists in the shipped
game as exactly one always-eligible greeting in Brackwater. Bible §8's *"Battles you each act"* and
*"His team always includes Carricrow"* are unbuilt. This is also why B5's flag has no writer.

**Fix, in order.**
1. **DATA** — new `data/rival.json` mirroring the `GymLeader` shape: `{id:"wick", act:N, node:"rN",
   slots:[…], signature:{…}}`, one row per act 1–6, `sanctum-approach` for act 6. **A new data file
   is a `core/types.ts` + `core/schemas.ts` change** — `z.object` strips undeclared keys, so an
   undeclared block silently never arrives (the INV-3 trap; `tests/gates/guardrails.test.ts`
   `balance_keys_survive_validation` exists for exactly this).
2. **CODE** — `game/rival.ts` shaped exactly like `game/gym-battle.ts`: `rivalAtNode`,
   `rivalBattleProblem` (gate on `actMin` and `flagsUnset rival.act<N>.fought`), launcher.
3. **TRIGGER** — on ARRIVAL at the route, beside `playPendingCutscene()` in `travelTo`
   (`OverworldScene:1712-1715`), which already runs after the tick is spent so a seasonal clause
   reads the arrival season.
4. **SELECTION** — through B1's `battleEntryFor`.

**New content: rosters only, no prose.** All 18 entries are already written.
**⚠ G2 CONSTRAINS THE ROSTERS AND THIS NEEDS HANK'S RULING BEFORE A LINE IS WRITTEN.** The bible
states only that Wick's team always includes Carricrow and that he is a Cullbrand apprentice the
player's age. Every other slot is invented content. Recommended shape, drawn **only** from species
already living on that act's route so no species is invented — act1 r1: Nibbin(J), Carricrow(J);
act2 r2: Bogling(J), Reedrick(A), Carricrow(A); act3 r3: Mosslet(A), Webvern(A), Carricrow(A);
act4 r4: Ashvole(A), Pyrelisk(A), Cragmar(A), Carricrow(A); act5 r5: Umbrat(A), Wispurr(A),
Gloomoth(A), **Carricrow(E)** — his act-5 line already says *"my Carricrow is an Elder now"*, so that
slot is transcribed, not chosen; act6: as act5 plus one Duskstalk(A). Log as a DEVIATIONS row naming
it authored-not-derived.

**Risk:** six new fights change the difficulty curve the balance harness measured for gyms
(`docs/BALANCE-REPORT.md` measured gym 1 at 26% against an 80–95% target and Hank cut a slot for it).
**Re-run the harness before locking levels**, and keep Wick under the act's leader or the badge
ladder inverts. An arrival-triggered battle can strand a fainted party on a route — the trigger must
respect the same refusal `challengeGym` does, and **say** it on the banner. Wick's `.pre` entries
use `actMin` deliberately (DIALOGUE-NOTES §8) so a late player meets him out of order — accepted
trade, do not narrow to equality.

### B5 — `maren.finale` gates on a flag only the rival's act-6 win writes.
**Verified.** `wick.act6.win` `setFlags` = `{rival.act6.fought, rival.act6.result, story.greaves.entered}`.
`maren.finale` `when` = `{actMin:6, flagsSet:["story.greaves.entered"], flagsUnset:["story.finale.spoken"]}`.
So Maren's send-off at the rim requires beating a rival who cannot be fought (B4) — and after B4, a
player who *loses* to Wick still never sees it (B6).

**Fix.** Move `story.greaves.entered` off the rival. Cheapest with no code change: hang it on
`prop.sanctum-approach-antler-gate` (already `actMin:6`), or author a new act-6 arrival cutscene at
`sanctum-approach` that writes it. `amb.sanctum-approach-scout.base` already carries the image
(six teams, the cradle already through the gate) and can be the speaker. **The send-off must not
depend on beating the rival, because nothing else in the act ladder does.**

holes-R1's alternative — change `maren.finale`'s `when` to `{actMin:6, flagsUnset:["story.finale.spoken"]}`
— also works and costs nothing, but loses the causal beat. **Recommend the arrival cutscene;** accept
the `when` change if P0-A is declined.

**Changes:** entries `maren.finale`, `wick.act6.win` (keeps writing the flag, but nothing gates on
it), plus one new cutscene. **+2 lines. Blocked on P0-A.**

### B6 — Losing to the rival permanently closes the encounter, and its own line promises the opposite.
**Verified.** For every act N, `wick.act<N>.loss` writes `rival.act<N>.fought: true` — the same flag
the win writes, and the only thing `wick.act<N>.pre`'s `flagsUnset` reads. And `wick.act6.loss`'s
authored line is: *"Then I hold the approach a while longer. Come back when your team has slept."*
It cannot be come back to.

**Fix.** Remove `rival.act<N>.fought` from all six `wick.act<N>.loss` entries. A loss records
nothing, so `pre` stays eligible and the rematch the copy promises exists.

**Changes:** six entries' `setFlags`. No new content.

**Risk:** the pre-battle speech now replays on every arrival until the player wins. That is how a
Gold rival behaves and is acceptable, but the four-line act-6 speech repeating verbatim is not —
add a shorter re-challenge variant at higher priority gated on a new `rival.act<N>.attempted` flag.
If B15's rename lands in the same pass, move the whole `rival.*` namespace once.

### B7 — *The Fallow Field* destroys its own offer, and one catch does it.
**Verified, and this is the sharpest single find in the three plans.**
`data/nodes/hearthollow.json` ships `loamunder-line: {count: 24, breedRate: 0.09, carryCap: 72}`.
`tolm.quest.fallow.offer` `when` = `{flagsUnset:[…], population:[{node:"hearthollow",
lineId:"loamunder-line", op:"gte", value:24}]}`. **Exactly at the threshold.**

Catching a single Loamunder in Hearthollow before speaking to Tolm makes the offer ineligible with
no line, no banner and no explanation — the quest whose entire subject is *do not catch the
producers* is closed by catching one producer, before the player has been told the producers matter.
It reopens only when breeding carries the count back over 24, which in act 1 takes several seasons.

**Fix.** Delete the `population` clause from `tolm.quest.fallow.offer`'s `when`, leaving
`flagsUnset: ["quest.fallow-field.done","quest.fallow-field.taken"]`. The `>= 24` clause belongs on
the **settlement**, where it already correctly is (`tolm.quest.fallow.done.kept`, priority 60) —
that is where the copy's twenty-four lives (*"twenty-four of them there at harvest"*). Leave it
there untouched: the kept/short branch is the mechanism.

**Changes:** one `when` clause deleted.

**Optional new content (recommended, +3 lines, blocked on P0-A):**
`tolm.quest.fallow.offer.short`, priority 59, `when:{flagsUnset:[…], population:[{…, op:"lt",
value:24}]}` — Tolm states the standing count and offers the same arrangement against it. This turns
a silent failure into the game's own point. G7: numbers only, no reproach.

**Risk:** the quest can now be accepted below 24, so `done.short` becomes the likely ending for a
player who catches in town. That is the designed consequence. Re-check that
`{kind:"yearTurnedSinceAccepted"}` still produces a turn-in at a low count, so acceptance yields a
settlement line rather than silence.

### B8 — *Forge a Legacy* turns itself in before the player has ever met Bram.
**Verified.** `game/quests.ts:203` gives it `{kind:"flagSet", flag: RETIREMENT_MILESTONE_FLAG}` —
the **same flag** `bram.quest.forge.offer` gates on. And the quest has **no acceptance**: verified
against `core/quests.ts:100-134`, `acceptFlag` is derived from entries whose `when.flagsSet` names a
*written* flag in the quest namespace, and `bram.quest.forge.offer` carries `quest.forge-a-legacy.done`
in `flagsUnset`, not `flagsSet`, and has **no `choices`**. So `acceptFlag` is `null`, `questStage`
returns `"open"` from the start, and on the first `syncQuestFlags` after any retirement anywhere the
same call writes `lifecycle.first-retirement` and then immediately `quest.forge-a-legacy.turnin`.
When the player finally reaches Cindershelf in act 4, `bram.quest.forge.done` (priority 59)
out-prioritises `.offer` (58) and they hear *"There. Cooled, seated, and it will not come loose"*
having never heard the ask.

This is the only quest on the never-cut LEGACY beat.

**Fix.**
1. Add `choices` to `bram.quest.forge.offer`: *"I'll bring it."* → `setFlags
   {"quest.forge-a-legacy.taken": true}`, `goto: "bram.quest.forge.accepted"`; *"Not yet."* →
   `goto: "bram.quest.forge.declined"`. `acceptFlag` then resolves to `.taken` and the turn-in
   cannot precede the offer.
2. Add `"quest.forge-a-legacy.taken"` to the offer's own `flagsUnset` or the offer re-fires.
3. Change the objective row to `{kind:"visitedSince", node:"r4"}` — an objective kind that already
   exists — and reword the accepted line so the ingot comes off the steppe. The trip becomes the
   quest's content. Keep the existing honest DEVIATION comment: the relic and the ingot are still
   not shipped items.

**New content: two entries, +3 lines. Blocked on P0-A.**
`bram.quest.forge.accepted` (priority 58, `when:{flagsSet:["quest.forge-a-legacy.taken"]}`) — 2
lines: where on the steppe the ingot comes from, and what a set relic does that the offer does not
say. `bram.quest.forge.declined` (`when:{}`) — 1 line: the relic keeps, it does not go brittle.
Bram 20 → 23 against 24.

**⚠ Priority trap, and mechanism-R2 caught its own error here:** a `when:{}` quest-kind entry is an
unconditional fallback for Bram at Cindershelf and **will starve the Kilnback chain** if it outranks
`bram.warm.*`. Set `bram.quest.forge.declined` to **priority 53**, below every `bram.warm.*` and
below `gerta.warm.testimony` at 54. Do not rely on the `said` set to save it.

**Risk:** adding an acceptance changes `questStage` from `"open"` to `"unoffered"` until taken, which
changes what `stillOwed()` reports — check any HUD or test asserting the owed list.

### B9 — Every completed quest's thank-you line fires forever, and it is the first thing the town says.
**Verified by census.** Ten quest turn-in entries write a completion flag and carry **no
`flagsUnset` naming it**: `maren.quest.first-signs.done` (61), `tolm.quest.fallow.done.kept` (60),
`tolm.quest.fallow.done.short` (59), `sel.quest.wager.done`, `bram.quest.forge.done`,
`gerta.quest.crash.done`, `nessa.quest.restock.done`, `halder.quest.silk.done`,
`pell.quest.lanternless.done`, `orrin.quest.trail.done` (all 59). Nothing ever clears the `*.turnin`
flag they read — `syncQuestFlags` writes it once and `questStage` then returns `"done"`, which only
stops it being re-written.

Because `talkEntryFor` walks `TALK_KINDS` with `quest` **first** (`game/dialogue-runner.ts:105`, and
its comment says the ordering is load-bearing) and these sit at 59–61 — above every greeting (0),
ambient (0), service (0) and lore (50–52) in the same room — a town whose quests are finished answers
[E] with its completion lines before anything else, every visit, forever. In Hearthollow that is
*"Three cards. Loamunder, Nibbin…"* and *"Count's short of twenty-four…"* for the whole back half of
the game. **This is the mechanical half of the user's "sounds totally nonsensical."**

It is the identical defect class `story.epilogue.shown` was added to fix (DIALOGUE-NOTES §8).

**Fix.** Add `flagsUnset` to each `.done` entry naming the completion flag it writes. Both
`tolm.quest.fallow.done.kept` and `.short` get `flagsUnset:["quest.fallow-field.done"]` — they share
the flag, `.kept` at 60 already beats `.short` at 59, so the population clause still picks the branch;
**comment that one settlement per harvest is the intent** or a later reader will "fix" it.

**New content: nine standing "after" lines, 1–2 each, ~14 lines. Blocked on P0-A.**
`kind: greeting`, priority 0, `when: {flagsSet:["quest.<id>.done"]}` — the giver in their normal
register, referring to the finished thing as past. **Verify every giver still has something to say:**
Tolm, Hetty, Halder, Pell, Gerta, Ives and Orrin each currently have exactly one unconditional entry.
Adding `flagsUnset` without a fallback silences the speaker and the town goes quiet where it used to
over-speak.

**New test (G14):** *no entry that writes a flag stays eligible after writing it* — for every entry
with `setFlags`, assert at least one written key appears in its own `when.flagsUnset`, with an
explicit commented allow-list for the deliberately repeatable ones (the census after B11, the
always-eligible fallbacks, and the battle entries B6 clears).

**Risk to tests:** the reachability fixpoint walks flags constructively, so a contradiction (a flag
both required and forbidden by one entry) fails loud — which is the guard working.

### B10 — Ten of seventeen prop placements have no unconditional fallback, including the one the game points at in the first hour.
**Verified by enumeration.** Cross-referencing `data/nodes/*.json` prop placements against the
corpus's prop entries:

| Placement | Node | Only entry | Fallback? |
|---|---|---|---|
| `r1-antler-north` | r1 | `prop.r1-antler-north` (p50, `chain.vellsire.step1`) | **none** |
| `r2-antler-causeway` | r2 | p50, step3 | **none** |
| `r3-antler-canopy` | r3 | p50, step4 | **none** |
| `r4-antler-vent` | r4 | p50, step4 | **none** |
| `r5-antler-vale` | r5 | p50, step4 | **none** |
| `sanctum-approach-antler-gate` | sanctum-approach | p50, step8 | **none** |
| `cindershelf-shrine-mine` | cindershelf | p50, flags | **none** |
| `cindershelf-shrine-deep` | cindershelf | p50, flags | **none** |
| `brackwater-idol-dock` | brackwater | p50, flags | **none** |
| `r2-idol-shallows` | r2 | p50, flags | **none** |
| `sanctum-antler-ring` | sanctum | p50 `actMin:6` + the approach at 95 | act-gated only |

`OverworldScene.interact()` answers a gated miss with the banner *"&lt;prop&gt; — nothing more to read."*
On Meadow Reach the game **explicitly sends the player to that stone**: `amb.r1-forager.base` says
*"There's a stone up north cut like antlers. Nobody in Hearthollow put it there"* and
`prop.r1-antler-south` says *"The line points at its northern twin"* — and the twin says nothing
until *First Signs* is turned in and Maren's keystone talk is heard. The same entry also closes
forever after one read (`flagsUnset: chain.vellsire.step2`), so returning to re-read it gets the
banner too.

**Fix.** Give every chain-gated prop an always-eligible fallback at **priority 0** that describes the
object physically and advances nothing — exactly the pattern `prop.r1-antler-south` and
`prop.sanctum-approach-antler-inner` already use (both verified as unconditional).

**New content: ten entries, 2 lines each, ~20 lines. Blocked on P0-A.** Register: flat physical
description, no lore claim, no chain hint — the stone as an object.

**⚠ Placement trap:** `selectEntryWhere` takes the strictly-higher priority and breaks ties by file
order, so each fallback must sit **after** its gated sibling in the file, or be priority 0 while the
gated one keeps its non-zero priority. `sanctum-antler-ring` carries `prop.sanctum-antler-ring` (50)
*and* `sanctum.vellsire.approach` (95) on the same `propId` — anything added there must sit below
both, and `selectPropEntry` discriminates on `propId`, so a variant with the wrong `propId` never
fires.

**New test:** for every prop placement in `data/nodes/*.json`, `selectPropEntry` returns an entry
under an empty flag bag at that prop's unlock act.

### B11 — *The Star Census* pays exactly one milestone, ever, and has no ending.
**Verified.** `game/quests.ts:369-370` — `if (flagIsSet(next.questFlags, def.owedFlag)) continue;`
skips any quest whose owed flag is set, and nothing clears `quest.star-census.milestone`. The re-arm
write at `:376-379` (`due[milestoneAtFlag(def.id)] = dexIdentities(...)`) is therefore dead after the
first grant. Combined with B9 — `ives.quest.census.milestone` carries no `flagsUnset` and sits at
priority 59 above the offer's 58 — Ives says *"Another milestone. Here's the plate, still tacky"*
every visit for the rest of the run. And `questDefinition` computes `completionFlags = []` (the
milestone entry has no `setFlags` at all), so `questStage` can never return `"done"`: it is the only
one of ten quests with no terminal state.

**Fix — zero code changes. See ruling D-d.**
1. Give `ives.quest.census.milestone` `setFlags: {"quest.star-census.milestone": false}`. `flagIsSet`
   returns false for `v === false` (`core/quests.ts:155-158`), `zFlagValue` admits boolean
   (`core/dialogue-schema.ts:210`). Ives **consumes** the milestone when he pays the plate;
   `syncQuestFlags` re-arms on the next rise using the `milestoneAtFlag` bookkeeping that is already
   written. The loop becomes a real once-per-growth cycle.
2. Author the ending: `game/quests.ts` writes a new external flag `quest.star-census.complete` when
   `dexIdentities` reaches the full identity count **derived from `content.species` × age forms**
   — never the literal 35 (G11).

**New content: one entry, 3 lines. Blocked on P0-A.** `ives.quest.census.complete` — priority 60,
`when:{flagsSet:["quest.star-census.complete"], flagsUnset:["quest.star-census.done"]}`,
`setFlags:{"quest.star-census.done": true}`: the census is full; the observatory's own copy is not;
what the finished set is for. Ives 5 → 8, inside the 18 ceiling.

**Copy correction in the same pass:** `ives.quest.census.milestone` line 2 asserts *"Thirty-five
identities in the full census"* at **every** firing, including the first when the player may hold
two. Reword to state the target rather than the achievement, or move that line to the new completion
entry where it is true.

**Risk to tests:** writing `false` from a dialogue entry is a shape the corpus has not used — verify
`applyRunFlags` writes it rather than skipping falsy values, and check `tests/unit/save.test.ts` does
not assert flags are truthy. `EXTERNAL_FLAGS` in `tests/unit/dialogue.test.ts` is asserted exactly,
so `quest.star-census.complete` must be added or the reachability test goes red.
`quest.star-census.done` becomes a new write-only orphan until the completion entry reads it.

### B12 — The Vellsire can be snared in an ordinary foray before the finale exists.
**Verified — see ruling D-c.** `data/nodes/sanctum.json`: `vellsire-line {count:1, carryCap:1}`.
`data/species.json`: habitat `["Sanctum","hidden"]`. `balance.encounter.signChainGatedHabitatTag`:
`"hidden"`. `OverworldScene.unlockedSignChains()` (`:1090-1105`) unlocks it on
`chain.vellsire.complete`, written by `maren.keystone.6` — a `lore` entry at `sanctum-approach`,
`{actMin:6, flagsSet:["chain.vellsire.step9"]}`, **requiring nothing of Greaves**. So at act 6 a
player can complete the chain, walk into `sanctum`, forage, roll the stag and snare it before
`story.greaves.beaten`, before the ring cutscene. The approach cutscene then plays against a node
whose Vellsire count is 0, narrating an animal the survey says is gone, and offers a catch-or-release
choice that is moot.

**Fix — two guards, both data-shaped.**
1. New balance keys under `encounter`: `finaleGateFlag` (`"story.greaves.beaten"`) and
   `finaleGatedNode` (`"sanctum"`), each with a `_source` note citing bible §8's finale, read by
   `unlockedSignChains()`. No node or line id typed in code (G11/G2).
2. Add `population: [{node:"sanctum", lineId:"vellsire-line", op:"gte", value:1}]` to
   `sanctum.vellsire.approach`'s `when`, so the cutscene cannot narrate a stag that is not there.

The two Ancients that **should** stay wild are unaffected: `kilnback-line` (cindershelf, verified
count 1) and `undermere-line` (r2, verified count 1). Only `sanctum` is gated.

**Risk:** B3's resolver builds its battler directly, so gating the weight table must not block the
resolver's own encounter — that is why B3 specifies a scripted encounter. Adding a balance key
requires `core/types.ts` + `core/schemas.ts` declarations or `zBalance` strips it (INV-3).

**New test:** act 6, chain complete, `story.greaves.beaten` unset ⇒ `vellsire-line` absent from the
sanctum encounter weights; set ⇒ present only via the finale resolver.

### B13 — *Ferryman's Wager* has a deadline in three lines of copy and none in the code, and the player's own starter closes it.
**Verified.** `game/quests.ts:169` — `{kind: "holdsAge", age: "E"}`. No clock term, no catch term.
The copy asserts the deadline three times: the offer (*"caught and brought back before the year
turns"*), `sel.quest.wager.done`, and `sel.tale.3` (*"You took an Elder Mirefin out of the channel
before the year turned. That's the wager and you won it"*). A Juvenile starter becomes an Elder in
its third year (`balance.age.lifespanYears.J = 3`) and closes the wager while the player is nowhere
near the marsh. Bible §9 calls this the push-your-luck showcase. It was never armed.

`sel.tale.3` gates step 4 of the 7-step Undermere chain.

**Fix — see ruling D-e.**
1. `core/quests.ts`: new objective kind `{kind:"catchesAtBeforeYearTurn", node, age, count}` —
   `catchesAt` restricted to `world.acceptedYear === world.year`. `acceptedYear` is already stamped
   by `syncQuestFlags` (`game/quests.ts:359`) and already read by `yearTurnedSinceAccepted`, so **no
   new save field**.
2. `game/quests.ts`: the row becomes `{kind:"catchesAtBeforeYearTurn", node:"r2", age:"E", count:1}`.
   Species stays unchecked (the existing header requires it; the species-name gate in
   `tests/property/foodweb.test.ts` forbids the literal) — record it in the row's deviation comment
   as the neighbouring rows do.
3. Add a **lapse writer** in `syncQuestFlags`: when a quest is `"accepted"`, its owed flag unset, and
   `world.year > world.acceptedYear`, write `quest.<id>.lapsed: true` **and clear** `.taken` and the
   `.acceptedAt` / `.acceptedYear` stamps so the offer returns.

**Clearing is mandatory, not polish:** `chain.undermere.step4` gates on `quest.ferrymans-wager.done`,
so a lapse that could not be retried would dead-end the Undermere chain and with it
`chain.undermere.complete` and the Undermere Ancient hunt.

**New content: one entry, 3 lines. Blocked on P0-A.** `sel.quest.wager.lapsed` — speaker sel, node
brackwater, kind quest, priority 57, `when:{flagsSet:["quest.ferrymans-wager.lapsed"],
flagsUnset:["quest.ferrymans-wager.done"]}`, `setFlags:{"quest.ferrymans-wager.lapsed": false}` (the
same consume-the-pump shape as B11). Sel's register: the year turned and the Elder did not arrive;
what an Elder costs you to spend, said as arithmetic; the offer stands, the Mirefin do not.
Sel 32 → 35, over his 34 ceiling.

**Risk:** clearing a flag inside `syncQuestFlags` is the first place that module **unsets** anything,
and the module is documented as idempotent — guard the lapse write on `.lapsed` already set. **G7 is
the live hazard on this copy:** a failure line is the single easiest place in 500 to write a
reprimand. Sel is amused, not disappointed. The reachability fixpoint walks flags only and will not
see a year-based lapse — it needs its own test asserting that a lapse followed by a retake still
reaches Undermere step 4.

### B14 — Two lines state a rule Hank removed, at the two moments the player is most likely to be reading.
**Verified verbatim.**
`maribel.post.win` line 2 — *"Badge's yours. The festival closes the year once you've taken it —
Hearthollow does the whole green with lanterns."* **This is the first badge in the game.**
`festival.hearthollow` line 1 — *"Lanterns on the green. The festival closes the year, and the year
closes whether the meter runs out or the badge comes in."*

`data/balance.json` `clock._source` reads: *"year = FULL METER; … **A gym victory no longer ends a
year**"* (D-Q2-1). `YearTurnScene` documents refusing the second trigger by name. Both lines were
flagged in STORY-REVIEW §5.1 as *must change* and neither has changed.

**Fix — net zero lines.** Reword both to the shipped rule: the festival spans the year's final season
and the year turns when the meter fills. Drop *"or the badge comes in"* entirely. Maribel's badge
line should say what a badge **is** (see H1) rather than what it closes. Stay inside the shipped
`clock` vocabulary (meter, season, tick) so a retune of `ticksPerSeason` cannot make them false
again.

**Secondary, and the reason it also matters for H8:** `festival.hearthollow` and `festival.brackwater`
are both `kind:cutscene` at **priority 65**, gated only on `event.festival.open`, with no one-shot
flag — so they re-fire on every arrival for the whole festival season, and they **outrank
`maren.retirement` at priority 55** (H8). Only 2 of 6 towns have festival copy at all.

### B15 — `rival.act<N>.result` is inverted relative to the entry kind.
**Verified.** `wick.act1.win` (`kind: "battle-win"`, which everywhere else in the corpus means *the
player won* — `maribel.post.win` writes `gym.maribel.beaten`) writes `rival.act1.result: "loss"`,
and `wick.act1.loss` writes `"win"`. Same on all six acts. Internally consistent only if the field
silently means *Wick's* result, which no key, comment or reader states. All six are in the
write-only set, so the bug is currently invisible and will be expensive the moment anything reads
them (H3 wants to).

**Fix — do it now, while nothing reads it and the rename is free.** Rename to
`rival.act<N>.playerResult` with `"win"` on the `battle-win` entry and `"loss"` on the `battle-loss`
entry, matching the kind name. Twelve entries.

**New test (G14), cheap and permanent:** *a `battle-win` entry never records a player loss* — assert
for every `battle-win` entry that no `setFlags` value is the string `"loss"`, and the mirror for
`battle-loss`.

**Risk:** none functionally today. Combine with B6's `rival.act<N>.attempted` so the namespace moves
once. Save-file migration is not worth building for a flag nothing reads — record "old saves lose the
record" in DEVIATIONS.

### B16 — The entire quest layer has zero tests, which is why B7, B8, B11 and B13 were invisible.
**Verified.** `grep -rln 'core/quests|game/quests|questDefinitions|objectiveHolds|QUEST_OBJECTIVES|syncQuestFlags' tests/`
returns nothing. `core/quests.ts` (317 lines, the objective evaluator) and `game/quests.ts` (482
lines, the ten-row objective table, the flag writers, the release verb) are the modules that make ten
authored quests closable and that publish `lifecycle.first-retirement`, and **not one assertion
anywhere exercises either.** The suite is 2095 green across 42 files and none of that green is
evidence about this layer. G14 says nothing is done before its named tests exist and pass.

**Fix. Add `tests/unit/quests.test.ts` BEFORE B7/B8/B11/B13 land**, so each repair is proved by a
test that was red first. Minimum bindings:

- every corpus quest resolves a `QuestDefinition` and has a row in `QUEST_OBJECTIVES`;
- `stillOwed()` on a fresh save equals `externallyGrantedFlags(DIALOGUE)` exactly (measured today: 14
  keys);
- **each quest's turn-in flag is not written before its acceptance** — the assertion B8 fails today;
- **`dexIdentitiesRisen` grants a second milestone after a second rise** — the assertion B11 fails
  today;
- **an Elder held into the following year does not close the wager** — the assertion B13 fails today;
- **the fallow offer survives one catch in Hearthollow** — the assertion B7 fails today;
- `releaseIntoNode` moves the live count by exactly one and survives a save round-trip;
- `syncQuestFlags` run twice writes nothing the first run did not.

Prove each binding by sabotage in the DIALOGUE-NOTES §6 style — flip the objective row, delete the
acceptance, confirm red. Drive the **real** `DIALOGUE` corpus and the real content loader, never a
hand-built fixture quest table: the point of `core/quests.ts` is that the bill is derived from the
shipped corpus.

**Risk:** writing these turns the suite red in four places on purpose. That is the correct order and
must not be reversed by fixing first and asserting after. **Under no circumstances may a red
assertion be relaxed to land the wave** — `justify-test-edit` applies to every existing assertion
these sit beside.

### B17 — The LEDGER→SURVEY rename has a slice that hard-fails if done by halves.
**Verified.** 15 lines across 15 entries carry the word. Beyond the prose, it is load-bearing in the
**condition model**: entry id `maren.tutorial.ledger` and flag `tutorial.ledger.done`.
`maren.tutorial.snare` reaches it by `goto: "maren.tutorial.ledger"`, and the schema validates every
`goto` against the entry-id set — so renaming the entry without the goto is a
`DialogueValidationError` at boot, not a silent miss. The flag is asserted by string at
`tests/unit/dialogue-runner.test.ts:332` and the id at `tests/unit/dialogue.test.ts:1745, 2014`.
`game/survey-view.ts` and `game/survey-history.ts` already use the new word — the corpus is the half
that is behind.

**Entries carrying the word:** `maren.tutorial.ledger`, `maren.tutorial.release`, `maren.keystone.3`,
`maren.keystone.6`, `maren.greeting.sanctum-approach`, `maren.crash-survey`, `greaves.act3.intro`,
`wick.act1.loss`, `maribel.greeting.reach-thin`, `nessa.quest.restock.offer`, `gerta.quest.crash.offer`,
`prop.hearthollow-signpost`, `amb.hearthollow-child.base`, `amb.hearthollow-child.older`,
`amb.r4-worker.arrival`.

**Fix — two passes, never one find-and-replace.**
**Pass A (mechanical, must be one atomic edit):** entry id → `maren.tutorial.survey`; flag →
`tutorial.survey.done`; `maren.tutorial.snare`'s `goto`; the three test-file string assertions.
**Pass B (authored, per line):** the fifteen player-facing lines are **rewritten, not substituted** —
four of them are metaphor, not vocabulary:
- `greaves.act3.intro`: *"You keep a warden's ledger. So do I — mine is called an **inventory** and it
  balances to the individual… We will disagree about very little except who the **columns** belong to."*
  The whole Greaves/Maren mirror is ledger-vs-inventory. "Survey vs inventory" is not the same joke
  and "columns" stops following. Move **both** terms: *"You keep a warden's count. So do I; mine is
  called an inventory"* preserves the mirror and the columns still follow.
- `maren.keystone.3`: *"A cut stump is a **ledger with the pages stacked instead of bound**"* —
  STORY-REVIEW calls this the strongest lore beat in the game and the image is specifically a bound
  book. Keep the bound-book image by naming the notebook.
- `maren.tutorial.release`: *"The ledger records it identically. It does not care which direction the
  number moved"* — the accounting sense (a ledger takes debits and credits) is the whole point.
- `sel.docks.rotting`: *"That's not a saying. That's the **accounting**."* — leave it. A fisherman
  describing a levy says "accounting" and no biologist objects.

**Also in Pass B, and it is the user's actual complaint:** four lines read the survey as sacred
rather than as a tool. `prop.hearthollow-signpost` — *"Corrections welcome; guesses are not."*
`maren.keystone.6` — *"I will be reading it."* `wick.act1.loss` — *"Keep the ledger — it's the part
of this you're ahead on."* `maren.greeting.sanctum-approach` — *"I'll be at the rim with the ledger.
That's where I'll stay."* Flatten all four in the same pass: a warden with a clipboard, not a scribe
with a relic.

**Out of this plan's scope but must be surfaced:** `tools/comfy/manifest.json` carries the word in an
art-prompt subject (twice) and as the **asset key `ledger-panel`** with `source: "bible §12 screens —
ecology ledger"`. Renaming an asset key may break the manifest→generated-file mapping. **Art lane's
call; do not rename it from here.**

**Risk:** a partial rename is a boot failure via the goto cross-reference — which is the *good*
outcome. The bad outcome is renaming the flag and not the tests, which turns green red in a way that
invites someone to fix the test instead of the data. Extend the existing end-to-end opening-chain
test (DIALOGUE-NOTES §8) to walk `maren.opening → starter → snare → survey` by `goto`, because the
reachability fixpoint walks *flags*, not gotos, and `game/dialogue-runner.ts` reports an unknown
`goto` as a `problem` rather than throwing — it would fail quietly on screen.
Save compat: an old save replays the one-screen tutorial once. Record it in DEVIATIONS rather than
building a migration.

---

## HOLES — the story does not hold together

### H1 — The game's entire progression axis has no in-world reason. ⚠ CONTENT CHANGE, bible §8 amendment.
**Verified.** `balance.acts.gates` opens Brackwater at 1 badge, Bowerdeep at 2, Cindershelf at 3,
Duskhollow at 4 and **the Sanctum at 5**. Across all 499 lines the words *"league"* and *"gym"*
appear **zero times**. Badges are handed over with *"Badge's yours."* / *"Badge."* ×4 and nobody ever
says what a badge is, who issues them, why a warden's field assistant collects them, or that they
open the Sanctum gate. `noct.post.win` puts the fifth badge and the gate in adjacent sentences —
*"Badge. The gate to the Sanctum Approach opens off the vale road, and it has been shut my whole
life"* — with no stated causal link, so it reads as coincidence. Maren, who sends the player out,
never mentions leaders at all; her stated ask is *"the difference between the two readings."*

The player has one motive (count things for Maren) and performs a different activity (beat five
leaders) with no bridge.

**⚠ THIS IS NEW LORE AND G2 FORBIDS INVENTING CONTENT. It must be an explicit bible §8 amendment
authorised by Hank with a DEVIATIONS row, not a quiet insertion.**

**Proposed fix.** Establish the badge economy once, in the opening, and pay it off once, at the gate.
The register the user asked for is working-biologist, not chosen-one: **badges are the region's
warranting system** — a leader's mark is what says this person may work a node unsupervised. That is
exactly the credential a warden's assistant needs, exactly the thing that opens a sealed reserve, and
it gives Greaves a reason to have forty years of records and no badges, which is his whole character.

**New content: ~8 lines, no new entries. Blocked on P0-A.**
1. Two lines appended to `maren.tutorial.ledger`/`.survey`, which already ends by pointing at the
   north gate: a warden's assistant cannot work a node on their own word; each of the five leaders
   warrants their own biome, and five marks is what the Sanctum's seal was written to require.
   **Do not explain more than that.**
2. One line added to each of the five `post.win` entries, in that leader's own voice, naming what
   **their** mark warrants — Maribel the meadow, Odo the channel, Vesper the canopy, Sable the vents,
   Noct the vale. This also stops the five badge lines being five identical words.
3. `noct.post.win` line 2 becomes causal: the fifth mark is what the gate reads.

**Risk:** keep it a credential and **not a tournament** — "league" is the Pokémon word and
`docs/IP-SWEEP.md` is already open on eighteen names. Do not let warranting imply the player is being
watched or judged (G7): it is paperwork, not permission-to-be-good.

### H2 — Greaves knows something the story says only the player can know, and two mysteries are raised in the finale and never paid. ⚠ CONTENT CHANGE, bible §8 amendment.
**Verified.** The Vellsire's survival is established exclusively by the 11-step chain: Orrin's
archive is *"the only place it exists as a document"*, Orrin says *"I have waited a long time for
someone with the legs for it"*, Maren *"has been the other half of this file for eleven years and
does not know it"*, and the trail's direction is something *"nobody guessed."* Yet Greaves reaches
the caldera **first**, with six teams and *"a cradle built to hold something that weighs as much as a
barge"* — sized to an animal nobody has seen in thirty years. Nothing anywhere says how he knows.

Adjacent and unpaid: **three speakers assert the sealed gate was already open and nobody opened it**
— Maren (*"It has not been open in my lifetime, and it was not us who opened it"*), the Cullbrand
scout (*"The gate was already open when we got here. Nobody wants to say that out loud"*), Noct
(*"shut my whole life"*) — and no line answers it or acknowledges it as permanently unanswered.

**Proposed fix — answer the first, deliberately close the second.**
1. **Greaves' source is already sitting in his own act-3 line:** *"You keep a warden's ledger. So do
   I — mine is called an inventory and it balances to the individual."* The answer that costs nothing
   and strengthens the theme: **Cullbrand buys records.** Forty years of intake books; bought shut
   mines, failed fisheries, the estates of dead wardens. He did not find the stag; he bought the
   pages that put it there. That makes his *"I've been buying for forty"* load-bearing instead of
   rhetorical, and makes the player's eleven steps the **first time anyone read the stones rather
   than the ledgers** — two routes to one answer, which is the game's whole argument.
2. **The gate: state that nobody knows, in a character's voice, once.** A named unanswered question
   is a motif; one nobody mentions is a dropped thread. `prop.sanctum-approach-antler-inner`
   **already says** the seal was cut from the inside and the tools are still there under a century of
   ash — and nothing picks it up. It just needs one character to notice it.

**New content: ~5 lines, no new entries. Blocked on P0-A.**
One line to `greaves.act3.intro` (the Company buys books before it buys stock, and there are more
warden's records in Cullbrand's vault than in Fallowmere); two to `greaves.finale.pre` (where the
forty years came from, and the plain statement that he did not need the stones); one to
`orrin.vanishing` (the archive is the only copy in Fallowmere, and Orrin has been asked for it before,
by a buyer, and refused — which makes Greaves' knowledge half-witnessed rather than authorial, and
gives Orrin a stake); one to `maren.keystone.6` or `maren.greeting.act6` picking up the inner stone.

**Risk:** Greaves must not become a schemer with a plan — his power is that he is boring and correct.
Keep record-buying as **procurement, not conspiracy**. **Do not resolve the gate**; resolving it
invites a whodunnit the game has no room for. The repair is that a character says it is unresolved.

### H3 — The rival reads nothing the player has done, and the game records his record six times and reads it zero.
**Verified.** All 18 Wick entries gate on `actMin` plus a `rival.act<N>.fought` flag. Not one
`population` clause, not one `floraStock` clause, not one player-set flag anywhere in the arc. Bible
§8 promises *"the routes he's worked are visibly degraded when you reach them."* Separately all six
`rival.act<N>.result` flags are written and read by nothing (my census), so his act-5 *"Five for
five"* is asserted unconditionally, and the values are inverted (B15). **Nothing in 499 lines reads
the player's own survey back at them** — and this is the beat where the rival and the game's only
mechanism are supposed to touch, and the beat the CASCADE demo video needs a voice for.

Compounding: act 5 he says *"I have never found the one that beats it. Bring me the argument when you
have it."* There is no mechanism by which the player can bring him anything. Act 6 he supplies the
argument himself, sourced to Cinder Steppe, which he already knew about in act 4 and defended in the
same breath. Nothing changed between act 4 and act 6 except the player showing up.

**Fix.**
1. **One population-gated `battle-pre` variant per act at priority 81** (base stays 80 as the
   unconditional fallback), each reading a threshold **already in the file** so the world speaks with
   one voice: act 1 → `r1 nibbin-line lte 4` (`maribel.greeting.reach-thin`, `amb.r1-forager.thin`);
   act 2 → `r2 fenmaw-line lte 1` (`amb.brackwater-buyer.lowseason`, `amb.r2-ferryhand.apex`);
   act 3 → `r3 barkhide-line lte 4` (`amb.bowerdeep-logger.thin`); act 4 → `r4 stonewing-line lte 1`
   (`maren.crash-survey`, `amb.r4-worker.emptied`); act 5 → `r5 umbrat-line lte 10`.
   **Reusing a sibling's threshold is not optional** — a fifth threshold for the same fact is a second
   source of truth, and two people in one town disagreeing about one count reads as a bug.
2. **Cash the act-5 promise as the act-6 branch.** `wick.act6.pre.recovered` / `.emptied`, selected by
   the player's own survey: the argument the player "brought" is the region, read back. He must still
   refuse the change-of-heart framing (*"a change of arithmetic"*) — that refusal **is** the
   character and must survive both branches.
3. **Make his record claims true.** `wick.act5.pre` reads `rival.act4.playerResult` so *"Five for
   five"* is only said when it is. Add one line to `wick.act4.pre` stating what would change his
   mind, so act 5's *"bring me the argument"* has an antecedent instead of arriving cold.

**New content: ~9 entries, ~20 lines. Blocked on P0-A — this alone takes Wick from 37 to ~49
against a ceiling of 40.**

**Risk — the largest G7 surface in the plan.** Each line must **price** the count, never judge it: he
is a buyer, the number is a price, the Company's position is that a thin line is a market signal, and
he must never address what the player did. His existing act-4 line — *"It's a scheduling error with a
number attached"* — is the register. `DIALOGUE-NOTES` §4 says the vocabulary scan cannot detect
placement, and a population-gated rival line is exactly the placement case (it fires **only** when
the player has driven a count down). **Every one needs a documented human read, twice, not a green
regex.** Do not let the variants starve the base entries. `tests/unit/dialogue.test.ts` enumerates by
hand the ten entries carrying an act **equality** and asserts the exact clause table — these use
`actMin`, so add them to that bucket or the table goes red. **Blocked on B4** — nothing plays a
`battle-pre` until the rival has a trigger.

### H4 — *Silk Shortage* is half a dilemma, and the half that ships promises a payoff that cannot happen.
**Verified.** `halder.quest.silk.offer`'s second choice writes `quest.silk-shortage.heard-vesper`,
which is **read by nothing** (my census). `quest.silk-shortage.result` only ever takes `"delivered"`
and is **read by nothing**. There is no refusal outcome; a player who walks away leaves the quest
open forever. And `halder.quest.silk.done` line 2 makes an explicit promise: *"Vesper will have the
new canopy count by the festival. She always does, **and she always reads it out**."* Verified:
**Vesper has zero entries carrying a `population` or `floraStock` clause.** She never reads any count
out, in any state.

Bible §9 promises *"over-catch dilemma with visible consequence either way."*
Structurally: of the three economic quests, *Fallow Field* pays more for restraint, *Restock* pays for
putting back, and the one take-branch quest's only implemented ending reads as a win. **Every branch
the game can currently reach rewards the same direction.**

**Fix.**
1. **A third choice on the offer** that writes a refusal: *"Tell him no."* → `setFlags
   {"quest.silk-shortage.result":"refused", "quest.silk-shortage.done":true}`, `goto:
   "halder.quest.silk.refused"`. The deferral choice stays as the third route.
2. **`halder.quest.silk.refused`** — 2–3 lines: the order goes unfilled, and he says plainly what
   that costs the town's wages. He is not a villain (Vesper's own line says so) and must not become
   one when refused.
3. **Give Vesper the count she is promised to read** — `vesper.canopy.delivered` and
   `vesper.canopy.refused`, `flagEquals` on `quest.silk-shortage.result`, each carrying a live
   `population` clause on `r3 webvern-line` (verified ships 8, carryCap 24; Halder asks for three
   adults, so *"below what the canopy replaces"* is supported by the shipped data at `lte 5`).
   She reads the number and the replacement rate, with **no verdict attached** (G7).

**⚠ A real trap, caught by reachability-R13 and verified at `core/quests.ts:119-123`:**
`completionFlags` collects `setFlags` **only from entries whose `when.flagsSet` includes the owed
flag** (the turn-in). A refusal that writes `.done` from a *choice*, without gating on the turn-in,
will **not** be counted as a completion flag, so `questStage` reports `"open"` forever. Either gate
the refusal entry on the turn-in too, or widen `completionFlags` in `core/quests.ts`. Check this
before authoring.

**New content: 3 entries + 1 choice, ~8 lines. Blocked on P0-A.**
`quest.silk-shortage.result` and `.heard-vesper` both leave the write-only list.

**Risk:** G7 is the whole difficulty — Vesper reading the count after the player's choice is the
closest the game comes to a character responding to a moral decision, and it must stay a **reading**.
The refusal branch must not make conservation both the paid choice and the applauded one: Halder's
refusal lines must carry the cost as concretely as the delivery lines carry the trade. Verify the new
`flagEquals` entries do not starve Vesper's unconditional greeting.

### H5 — *Vellsire's Trail* feeds nothing, names a season it never states, and its hand-off is chronologically impossible.
**Verified, three separate promises broken.**
(a) `orrin.quest.trail.done` ends on *"Take this to Maren. She has been the other half of this file
for eleven years and does not know it."* `quest.vellsires-trail.done` is read by exactly one thing —
the offer's own `flagsUnset`. **Maren has no entry that reads it.**
(b) `orrin.quest.trail.done` also says the archive *"gives a season, which nobody did."* **No entry
anywhere names that season.** Verified: `seasons` appears in exactly **one** entry in the whole
corpus (`pell.quest.lanternless.offer`, autumn).
(c) `orrin.quest.trail.accepted`: *"In order. The stones were cut in order and they do not read out
of it."* But `trail.stone.r1` and `trail.stone.r2` are written by the chain's own prop entries in
acts 1–2, years before the quest is offered at act 5. **The player has already read two of the six
out of order by construction**, and the r3/r4/r5 stones carry no `chainStep` at all, gating only on
`chain.vellsire.step4` and their own flag, so they read in any order too.

And `chain.vellsire.complete` — the 11-step chain's payoff — is written by `maren.keystone.6` and
read by **no corpus entry** (only by `unlockedSignChains()`), so the eleven steps are invisible to the
story they belong to.

**Fix — see ruling D-f.**
1. **One clause, zero new content, and it fixes the hand-off:** add `quest.vellsires-trail.done` to
   `maren.keystone.6`'s `when.flagsSet` (currently `{actMin:6, flagsSet:["chain.vellsire.step9"],
   flagsUnset:["chain.vellsire.step10"]}`). The ordering becomes gate stone (step 9) → all six trail
   stones read → Orrin's turn-in → Maren's step 10 → `chain.vellsire.complete`, and Orrin's hand-off
   line becomes **literally true**. Provably acyclic; the alternative (moving the sixth stone onto
   `prop.sanctum-approach-antler-inner`) creates a cycle.
2. **Author the Maren scene the quest points at**, which is also where the season gets named:
   `maren.trail.received`, kind lore, `when:{actMin:5, flagsSet:["quest.vellsires-trail.done"],
   flagsUnset:["lore.trail.read"]}` — 4 lines: two records, paper and granite, laid beside each other
   for the first time in eleven years, and the direction they agree on. Give it a **lower priority
   than `maren.keystone.6` (50)** so it cannot starve chain step 10.
3. **Name the season.** The corpus already supplies the answer: `sanctum.vellsire.approach` says
   *"The grass inside the ring is the only green thing in the Sanctum Fallow, and it is grazed
   short"*, and `wick.act5.loss` establishes Wispurr and the ridge as winter. **Winter.** State it in
   Orrin's turn-in and in the new Maren entry.
4. **⚠ NEVER put a `seasons` clause on `sanctum.vellsire.approach` or on either epilogue.** A
   seasonal gate on a never-cut beat would make the ending wait up to twelve ticks. Pay the season
   off as a *flavour variant* of `prop.sanctum-antler-ring` (same `propId`, priority above the base,
   `seasons:["winter"]`, 1 line) that has an unconditional sibling.
5. **Make "in order" true, or change what Orrin says.** Either add `chainStep` 4a/4b/4c to the three
   unnumbered r3/r4/r5 props and gate each on the previous stone's flag (data only, no prose), or
   reword the offer/accepted to acknowledge the two already read: *"two of them you have already
   stood in front of."* **Recommend the reword** — it costs two lines and cannot dead-end.

**New content: ~7 lines. Blocked on P0-A. `prop-antler-stone` is at 25/30 — budget with H6.**

**Risk:** `chain.vellsire.complete` gates the wild Vellsire hunt, so a trail the player cannot finish
costs the wild Ancient. **Verify all six `trail.stone.*` writers are on props that actually exist in
`data/nodes/*.json` before landing the clause** — the chain-reachability fixpoint treats
`quest.vellsires-trail.turnin` as externally grantable and will stay green either way; that green
proves the flag graph, not the placements. The finale cutscene does **not** gate on the chain
(verified) and must stay that way. `tests/unit/dialogue.test.ts` asserts no chain step is gated to an
earlier act than its predecessor — the contiguity check will bite if numbering drifts. Adding sequence
gates to r3/r4/r5 can dead-end if a stone's route is unreachable in its act — verified they unlock in
acts 3/4/5, so it is safe, but check again after H12's raid lands.

**Residual pacing cost Hank should rule on:** the quest is offered at act 5 and the gate stone is
`actMin:6`, so completion requires walking back to Duskhollow in the last act. holes-R14's
alternative — narrow `trail.stone.*` to the five walkable stones so the quest closes in act 5 — fixes
that, but changes a shipped objective whose comment cites *"Six is never typed anywhere"* as a virtue.

### H6 — The Sanctum is not "revealed in the state your ecology earned", and the game's whole argument is made on a screen that shows no numbers.
**Verified.** Across all entries at `sanctum` and `sanctum-approach`, **not one carries a
`population` or `floraStock` clause** — every one gates on `actMin` and flags only. The caldera, the
antler ring, the approach, Maren at the rim and the Cullbrand scout read identically whether the
player emptied Fallowmere or restored it. Both epilogues **name** the six nodes and print **no
number** — the numbers live in the survey UI, which this scene does not open. Bible §6 promises the
finale site is *"revealed in the state your ecology earned."* G7 says the numbers are the moral.

**Fix — two parts, and the second is the one that matters for the demo.**
1. **State-gate the two set-pieces**, thresholds derived from shipped numbers, base entries kept as
   unconditional fallbacks. `prop.sanctum-antler-ring.thin` (same `propId`, priority 51,
   `floraStock sanctum lte 35`) — split the existing image into a version where the ring is the only
   green thing and a version where it is not green either. `maren.greeting.sanctum-approach.thin`
   (priority 41, `floraStock sanctum-approach lte 25`; verified the node ships 35, the lowest in the
   region) — what she is writing at the rim becomes a reading, not a posture.
   `amb.sanctum-approach-scout.thin` — the scout counting what came back down against what the routes
   he walked up looked like.
2. **⭐ MAKE THE EPILOGUE OPEN THE SURVEY. This is the single highest-value demo-video change in the
   whole plan and it needs no new prose at all.** `game/survey-view.ts` and `game/survey-history.ts`
   already exist and already render per-node populations with a before/after reading — which is
   precisely *"the difference between the two readings"*, Maren's stated ask in the opening line of
   the game. The epilogue cutscene should hand off to the survey with the run's first reading and its
   last, side by side. The copy already promises it: *"in the same hand as the ones I took the week
   you started."*

**New content: ~6 lines for part 1; zero for part 2. Blocked on P0-A.**

**Risk:** the epilogue is the last thing in the demo video — build the survey as a hand-off **after**
the last epilogue line, never as a replacement for it, and `story.epilogue.shown` must still latch
exactly once. **Never gate an existing Sanctum entry on state; add variants above them.** A depleted
Sanctum is the single most tempting place in the corpus to write a verdict — the ring's line must
describe the grass and stop. `prop-antler-stone` is at 25/30 and H5 also adds to it.

### H7 — Duskhollow's ageing arc asserts a mechanism nothing models — the only town arc that reads no state.
**Verified.** Bible §6 gives Duskhollow *"dark encroaches as the Sanctum destabilizes."* Nothing in
`core/`, `game/` or `data/` models Sanctum destabilisation, a darkness level, or a lamp economy.
Four speakers assert the deepening dark as flat, ungated fact, every one with `when: {}`:
`orrin.greeting` (*"The vale runs darker every year… My lamp is four years old"*),
`amb.duskhollow-elder.base` (*"I have the lamp bills to prove it"*), `innkeeper-duskhollow.rest`
(*"That's not a mood, it's on Orrin's chart"*), `amb.r5-astronomer.base` (*"deepening about a degree a
decade… Nobody has an explanation on the chart"*).

Every other town's arc reads live state — Brackwater's docks on `r2.mirefin-line`, Cindershelf's
shafts on `r4.cragmar-line`, Bowerdeep's canopy on `r3.barkhide-line`, Hearthollow's fields on
`r1.floraStock`. Duskhollow alone is unfalsifiable atmosphere, and it is the town that sets up the
finale.

**Fix — RESTATE, DO NOT BUILD. See ruling D-h.** A darkness state would be a fifth clock nothing else
reads, plus art-lane tint work, against one town's ageing cell.
1. **Keep exactly one ungated assertion and make it a DISAGREEMENT.** `noct.greeting` already ships
   the honest version — *"Orrin thinks the dark in the vale has been deepening since the Sanctum went
   quiet. Ives thinks Orrin needs a better lamp. I stay out of it."* Reframe Orrin's and the
   innkeeper's lines to sit **inside** that disagreement instead of settling it.
2. **Gate the two that assert a TREND** on something the sim has. Verified node states: `r5` flora 58,
   `duskhollow` flora 44 — the thinnest in the game, three lines each (Umbrat 24, Wispurr 8,
   Carricrow 3). Derive the pair from r1's shipped neighbours (45 "thin" / 80 "bloom") rather than
   choosing: `floraStock r5 lte 45` and `gte 70` straddle 58 the way r1's straddle 78.
3. **Add the bright counterpart** so the arc is two-sided like Brackwater's: `orrin.greeting.holding`
   and `amb.duskhollow-elder.clear`, 2 lines each — the chart has flattened this decade and neither of
   them knows why either. **A chart that only goes one way is a mood; a chart that can flatten is a
   measurement.**
4. Amend bible §6's Duskhollow ageing cell to name the vale's flora and the observatory's
   disagreement instead of Sanctum destabilisation, with a DEVIATIONS row.

**⚠ `orrin.greeting` and `amb.duskhollow-elder.base` are their groups' only unconditional fallbacks.**
Gate **new** entries and leave those two ungated with reworded copy, or the speakers go silent.

**Risk:** `r5` has only three lines, so its flora moves differently from r1's — verify through
`core/ecosim.ts` that it actually crosses 45 and 70 under play, or the gates are decorative.
`tests/unit/dialogue.test.ts` maintains a hand-kept `FLORA_CLAIM_REVIEW` table asserting that a line
quoting live flora reads live flora — every reworded line must be reclassified in it or coverage
silently drops.

### H8 — The Legacy beat's explainer is Hearthollow-only, autoplay-only, and outranked by the festival.
**Verified.** `maren.retirement` — the entry that explains heir-vs-boon, on build-doc §16's never-cut
LEGACY beat — is `kind: "cutscene"`, node `hearthollow`, **priority 55**, `when: {yearMin:2,
flagsSet:["lifecycle.first-retirement"], flagsUnset:["lifecycle.first-retirement.spoken"]}`. It is
reachable only by `playPendingCutscene()`, and only in Hearthollow. A starter that retires at the
year turn while the player is at Cindershelf explains nothing until they walk back.

Worse, `festival.hearthollow` is also a Hearthollow cutscene at **priority 65** with no self-closing
flag — and `autoplayEntryFor` returns only the single highest-priority eligible cutscene while
`playPendingCutscene` plays exactly one per call. **During the festival window the festival beats the
retirement beat** and the explainer is deferred again.

Meanwhile `bram.quest.forge.offer` (act 4, Cindershelf, gated on `lifecycle.first-retirement`) can
open a quest **about** the retirement before the game has said what a retirement is.

And `game/scenes/RetirementScene.ts` — 1407 lines, the scene `game/scene-keys.ts` annotates as
build-doc §1's never-cut Legacy beat, the beat bible §12a says to pick the music for **first** — has
**zero authored corpus lines**. It renders numbers and no voice.

**Fix.**
1. **Raise `maren.retirement` above `festival.hearthollow`** (priority 66+). A first retirement is a
   one-shot that closes itself; the festival is a season-long window that will still be open next
   arrival.
2. **Give it non-Hearthollow reach.** Author sibling `lore`-kind entries for Maren at each of the
   five other town nodes, same `lifecycle.first-retirement` / `!…spoken` guard, so [E] reaches it
   wherever the player is. Maren already has a greeting in every town, so her presence is
   established. **The node-agnostic alternative is a `core/dialogue-schema.ts` change** (`node` is
   required and `selectEntry` keys on it) — surface that choice to Hank, do not invent a wildcard.
3. **Make `bram.quest.forge.offer` require `lifecycle.first-retirement.spoken`** so the relic quest
   cannot precede the explanation.
4. **Author lines for the RetirementScene itself** — `lifecycle.retirement.heir` and
   `lifecycle.retirement.boon`, 2 lines each, played at the moment the choice is taken, not by an NPC
   later. Register: unsentimental, Maren's own (*"It's out of years. That's all that has happened"*);
   the heir named as a juvenile of the same line, the boon as the retiree's name carried on a
   teammate. **These are the game's emotional beat and they are currently silent.**

**New content: ~19 lines. Blocked on P0-A — this is the biggest single Maren add and she is at 70/72.**

**Risk:** five duplicated Maren entries drift apart under later edits — comment them as one beat.
Raising the retirement priority changes which cutscene autoplays on a festival arrival; verify the
festival still fires on the following arrival (it will — `autoplayed` is per visit and the retirement
closes itself). **Do not gate anything on `story.starter` without a fallback** (T2). Q3 decoupled the
clocks, so nothing guarantees the starter retires before act 6 — see the measurement gap at the end.

### H9 — The dex shrinks when the player does the thing the game teaches, and two never-cut systems contradict.
**Verified.** `game/quests.ts:228-237` — `dexIdentities` counts `lineId:formName` over
`[...save.party, ...save.box]`: creatures the player is **currently holding**. Ives's copy says
*"Every identity you've **entered**, with the age forms counted separately."* So releasing a creature
— the verb Maren teaches and *Restock the Shallows* requires four of — **decrements the census**; a
retirement replaces the retiree with a different-aged heir and can decrement it; and *"thirty-five
identities in the full census"* requires holding all thirty-five simultaneously.

The two verbs the game is built to teach — release and restoration — are the two that destroy census
progress.

**Fix.** Make the dex a **record read off the action tape**, the same L10-replayable construction
`hasRetired` already uses: derive identities from `save.actionLog`'s catches, union
`sign.<node>.linesMet` (which `recordLineMet` already stores) and the currently-held set. **Monotonic
by construction.** Then `dexIdentitiesRisen` becomes honest and B11's completion entry becomes
reachable. **Do not add a new save field if the tape can answer it** — a second store is a second
thing to keep in sync.

**Changes:** `game/quests.ts`. No entries. One copy correction, already listed under B11.

**Risk:** `dexIdentities` is also read by `DexScene` and by the year-turn's identity beat, so changing
its basis changes two other surfaces. Check the survey does not now claim the player holds something
they released.

### H10 — *The Fallow Field* promises an annual repeat its own flags forbid, and remembers a result nothing reads.
**Verified.** Both endings say so explicitly. `tolm.quest.fallow.done.kept`: *"Same arrangement next
year, if you're still walking."* `.done.short`: *"Offer's the same next spring. Numbers are the
numbers."* The offer gates on `flagsUnset:["quest.fallow-field.done","quest.fallow-field.taken"]` and
**both are permanently set at turn-in**, so the arrangement can never be entered again. This is the
quest whose entire subject is an arrangement that *"comes back every year I'm farming."* And
`quest.fallow-field.result` (`"kept"`/`"short"`) is written and read by nothing.

**Fix.** The objective is already `{kind:"yearTurnedSinceAccepted"}` and `syncQuestFlags` already
stamps `acceptedYear`. **Add a re-arm:** when `.done` is set and a further year has turned, clear
`.done`, `.taken`, `.turnin` and the stamps, leaving `.result` as the record of the **last**
settlement. **That is the same repeatable-objective mechanism B11 needs — build it once, use it
twice.** Then give `result` a reader: Tolm's second-and-later offers acknowledge how last year went,
which is the only place in 499 lines where a quest outcome is remembered.

**New content: two offer variants, ~6 lines. Blocked on P0-A.**
`tolm.quest.fallow.offer.again.kept` (`flagEquals result="kept"`) — same fence, last year's crop
share came in over quote so he is raising it; he walks the count himself now.
`.again.short` (`value:"short"`) — he sowed the east twice and made it up, the west is still fallow,
the offer is unchanged because the arithmetic is unchanged. Both carry the original's two choices.
Neither may quote a number the survey contradicts.

**Risk:** an annual re-arm is an income loop — Tolm's purse is *"bigger than the snare would fetch."*
Make the payout the crop share it already is (a share of a crop that only exists when the count held),
which is self-limiting. **The re-arm must be edged on the year turn, not a standing condition** —
`syncQuestFlags` runs on every save move, and this is the exact trap `RUN_COMPLETE_SHOWN_FLAG` exists
for.

### H11 — Thirteen flags are written and read by nothing.
**Verified by census across the corpus, `game/`, `core/` and `tools/`:**
`chain.kilnback.step6`, `chain.undermere.step7`, `lore.scavenger.unlocked`,
`quest.fallow-field.result`, `quest.silk-shortage.heard-vesper`, `quest.silk-shortage.result`,
`rival.act1…6.result` (six), `story.starter`, `story.vellsire.attempt`.

*(Correction to reachability-R17's list: `trail.stone.r1/r2/sanctum-approach` appear write-only to a
naive scan but ARE read — `everyCorpusFlagWithPrefix "trail.stone."` reads them by prefix. Not a
defect.)*

**Fix — resolve each, do not delete in bulk.**
`story.vellsire.attempt` → read by B3. `quest.silk-shortage.heard-vesper` and `.result` → read by H4.
`rival.act<N>.result` → renamed by B15, read by H3. `quest.fallow-field.result` → read by H10.
`lore.scavenger.unlocked` → T3. `story.starter` → T2.
`chain.kilnback.step6` / `chain.undermere.step7` → the chains are 6 and 7 steps but only 6 and 6 are
gated; either gate the last step or drop the write. **One-line rulings, not repairs.**

**New test (G14):** *no flag is written and never read* — `flagsWritten(file)` minus `flagsRead(file)`
minus an explicit, commented allow-list of the flags read by `game/` code. **The allow-list is the
trap:** derive the game-side readers by grepping the flag name at test time, or keep the list tiny and
commented with the reading `file:line`. `WRITE_ONLY_FLAGS` is asserted to equal the written-never-read
set exactly, so every removal and its reader must land in the same change.

### H12 — Four of six acts have no Cullbrand raid, and the antagonist operates once.
**Verified.** `balance.yearEvents.raids` holds **exactly one row** —
`{id:"cullbrand-strip-harvest-r4", act:4, nodeId:"r4", targets:[{ashvole-line, remove:11},
{cragmar-line, remove:8}]}`. Bible §9 says *"scripted per act."* `raidCoverage()` was deliberately
built to **report** the gap rather than let an agent invent numbers (correct, G2). The consequence:
Greaves is introduced in act 3, does one thing in act 4, and reappears at the finale — the antagonist
whose *"operations are the scripted, large-scale version of the player's own over-catching"* operates
once. Bible §6's *"Cullbrand logging subplot"* for Bowerdeep does not exist.

**Fix — see ruling D-g. ONE new raid, not four.**
Add `cullbrand-strip-harvest-r3`, act 3, node r3, targets **`mosslet-line`** (verified ships 8) —
**not `barkhide-line`**, because `amb.bowerdeep-logger.thin` fires on `r3 barkhide-line lte 4` and is
authored as the **player's** consequence; a scripted raid would fire that line for something the
player did not do. G6 is absolute: a raid may decrement **only** the harvested prey; the canopy
thinning above it must emerge from §7.3, which is why the shipped row stops at the two Grazer lines.
`harvestFractionOfStanding: 0.8` already scales any authored count to any standing stock; state in
the row's `_source` which authored number the fraction reproduces, exactly as the r4 row does.

**Act 1 gets no raid, deliberately** — the player has not yet learned to read a survey, and bible §6's
act-4 beat is *"the collapse mechanic taught at scale, no tutorial text needed"*, which only works if
act 4 is the first time. **Amend bible §9** from *"scripted per act"* to *"scripted at the acts the
bible names"*, with a DEVIATIONS row citing `raidCoverage()`'s honest report as the standing statement
of the gap.

**Optional new content: `greaves.act3.logging`, 2 lines**, firing after the raid — he declines to own
the stand that was cut, in the register of *"my lawyers consider the distinction load-bearing."*

**Risk — HIGH BLAST RADIUS ON BALANCE.** The shipped act-4 row was tuned over 64 seeds and retuned
once (D-Q6-1) because act-keying broke it. A raid at act 3 alters r3's standing stock **before the
player fights Vesper**, and gym difficulty is harness-measured. It also changes encounter weights on
r3, which **are** the live population. **Re-run `npm run harness` and regenerate
`docs/BALANCE-REPORT.md` before accepting; put the measurement in the row's `_source`. If it
destabilises the act, do not tune the raid to hide it — report it and drop the raid.**

---

## THIN — real but small

### T1 — *Forge a Legacy* is five lines with no branch on a beat build-doc §1 weights at 40%.
**Verified.** Two entries, five lines, the thinnest quest in the game. B8 fixes its ordering; this is
the separate charge that once fixed it is still the least content in the game at the moment the game
is most about something.

**Fix.** After B8's accepted/declined pair, add the beat the quest is actually about: the relic
carries a slice of what the animal **was**, so the moment worth writing is Bram asking whose it was.
**Recommended (cheaper and better than a starter branch):** one entry, `bram.quest.forge.done.starter`
at priority 60, whose copy names the retiree **by its stamped name** rather than its line —
`bram.quest.forge.done` already ships *"Name's stamped underneath where nobody looks."* 2 lines.
A three-way `flagEquals story.starter` branch is +6 lines and three entries for one beat: the wrong
trade. Keep the quest four entries deep, not eight.

Optionally make the forge a standing service (`bram.quest.forge.again`) — `sable.post.win` already
sends the player there and today that pointer leads to a finished quest. Do not make relics a
currency loop.

**Risk:** the temptation here is sentiment; G7 forbids a lesson and the bible's own note is that
legacy is a mechanic. Bram's register is a man working while he talks.

### T2 — `story.starter` has no reader, and a test comment asserts one that does not exist.
**Verified.** Written by all three `maren.starter.*` entries; in the write-only set.
`tests/unit/dialogue.test.ts` `WRITE_ONLY_FLAGS` annotates it *"which starter was chosen — the Legacy
beat reads it"*, and the Legacy beat does not read it. In 499 lines no line ever refers to the
player's starter again: not at metamorphosis, not at retirement, not at the forge, not at the finale.

**Fix — Hank's call, two honest options.** **(a) Acknowledge it:** three
`maribel.greeting.starter.<line>` variants at priority 41 above her unconditional fallback, 1 line
each. **(b) Delete it:** remove `setFlags["story.starter"]` from the three starter entries and the row
from `WRITE_ONLY_FLAGS`. **Recommend (b)** if T1 takes the stamped-name route, which makes the flag
unnecessary — but say so to Hank rather than deciding silently, because deletion forecloses any
future reader.

**Do not leave a test comment asserting a reader that does not exist.** That is the actual defect.

### T3 — *After the Crash*'s reward is inert.
**Verified.** `lore.scavenger.unlocked` is written by `gerta.quest.crash.done` and read by nothing.
Bible §9 says the quest *"unlocks scavenger lore"* and no lore opens.

**Fix.** One `noct.lore.scavenger` entry, priority 50, `when:{flagsSet:["lore.scavenger.unlocked"]}`,
2 lines. Noct already ships the seed (*"They follow deaths, so their count is a reading of somewhere
else"*) and Gerta the payoff (*"a crow count is a death count wearing feathers"*). **Do not tighten
the objective** — recording which nodes were surveyed is a save-shape change and is not worth it.

**Risk:** `tests/unit/dialogue.test.ts` `DIET_CLAIMS` / `FORBIDDEN_EDGES` pin predation claims
count-for-count. Scavenger weight rising with `recentDeaths` is an **ecosim rule, not a diet edge** —
phrase it as the rule. `WRITE_ONLY_FLAGS` must lose the row in the same change.

### T4 — Nothing marks entering an act, which is now the story clock.
**Verified.** `core/acts.ts` has an `ACT_ENTERED_FLAG` latch and `enterPendingActs` fires each act's
scripts; the only player-facing acknowledgement is `winGym`'s debug banner and Maren's six
`greeting.act<N>` entries, which the player must walk to Maren to hear. The region opens two new
nodes, fires a raid script, advances the rival and changes the level band, and the game says nothing.

**Fix.** Six act-entry cutscenes keyed on the existing latch, playing wherever the player is standing.
**This is also the natural home for H1's badge payoff** and for naming the two nodes that just
unlocked — a navigational need the game currently meets only through Maren's greetings.
**Speaker: not a character — the player's own field notebook.** That keeps the voice consistent with
the survey and avoids putting a narrator in a game that has none. The player character never speaks
(an unstated but real stylistic commitment) and a notebook is not a voice.

**⚠ Schema decision to surface, not assume:** a node-agnostic entry is a capability the corpus does
not have — `selectEntry` keys on (speaker, node, kind) and every entry names a node. Either add a
wildcard (`core/dialogue-schema.ts`, with reachability-fixpoint consequences) or author six entries ×
the nodes the player can plausibly be in. **Surface the choice.**

**+12 lines. Blocked on P0-A.**

**Confirmed NOT a problem, contrary to DIALOGUE-NOTES §8 item 4:** there is no window before the act-4
raid fires. `winGym` → `advanceActs()` → `enterPendingActs` applies the raid at the moment the badge
is awarded, which is before r4 unlocks. **r4 is always already crashed on first arrival.** The
never-cut CASCADE beat is intact.

### T5 — Ten of seventeen named speakers read no live state; the ecology game's characters mostly cannot see the ecology.
**Verified.** Entries carrying a `population` or `floraStock` clause exist for maren, sel, bram, tolm,
maribel and odo plus seven ambient speakers. **Zero** for wick, greaves, vesper, sable, noct, gerta,
nessa/Hetty, halder, pell, ives and orrin. Several make the promise explicitly: Hetty keeps *"the
board"* and says *"the Brackmarsh count on my board goes up by four… I will see it on the board before
I see it in the creel"* — she has no board-reading entry. Vesper *"always reads it out"* (H4). Gerta
says *"I'll do the reading"* and has none. Sable's bench is *"caught inside a day's walk of this
forge"* and never notices when there is nothing left to catch there.

**Fix.** One state-gated variant each, 2 lines, threshold **reused from a sibling entry at that
node**, never invented. Priority order: Wick (H3, six acts) → Hetty (`r2 mirefin-line`, reuse Sel's
exact pair so the town agrees with itself) → Vesper (H4) → Gerta (`r4 cragmar-line`, Bram already uses
lte 3 / gte 12) → Sable (`r4 pyrelisk-line`, ships 14) → Halder (`r3 webvern-line`, ships 8) →
Orrin/Ives (`r5 floraStock`, reuse H7's derived pair) → Noct (`r5 carricrow-line`, ships 3) → Pell
(`r3 gloomoth-line`, ships 6, autumn window).

**~20 lines. Blocked on P0-A. Every one of these speakers has exactly one unconditional entry, which
stays as the group's fallback — do not gate any speaker's only entry.**

**Risk:** the largest G7 surface after H3. Each must be a **reading**, never a verdict: a number, the
thing it is a number about, and what that person does differently because of it. Each needs a human
read at the entry level and again on screen.

---

## COSMETIC

### C1 — Run-length claims on an unbounded calendar.
**Verified.** `balance.clock._yearsTotal` says explicitly *"NOT A CAP. The calendar is unbounded —
year may be 9 or 40."* Four act-gated lines name a year count anyway: `wick.act3.win` (*"Three years
running"*, `actMin:3`, sayable in calendar year 1), `wick.act6.win` (*"Six years. Every one of them
the same result"*), `greaves.finale.pre` (*"You've been counting for six years"*),
`maren.epilogue.released` (*"the thing you spent six years finding"*).

**Fix — see ruling D-j. Four rewrites, net zero lines.** Wick counts **encounters**, not years —
*"Three for three"* / *"Every time, the same result and I kept the column anyway"* — which is true at
any pace and better in the voice of a man who keeps a column. Greaves' *"six years" vs "forty"* is a
**ratio** and survives as *"You have been counting since you could carry a snare. I have been buying
for forty"* — the forty is his, not the player's, and is not on the calendar.

**Leave the three `yearMin: 6` ambient lines alone** (`amb.hearthollow-fenceman.late`,
`amb.brackwater-netmender.late`, `amb.r1-forager.late`): true at their floor, and a fence-mender
rounding in year 9 is a person, not the game lying. `wick.act1.pre`'s *"Cullbrand apprentice, second
year"* is his own tenure and is fine.

**⚠ `maren.epilogue.released`'s line is called out in STORY-REVIEW as one of the two best in the
project and the one most likely to be in the demo video. Hank rewrites it or rules to accept the
drift — an agent should not.** If C1's rewrites also read `rival.act<N>.playerResult` (B15), *"three
for three"* becomes **true** rather than assumed, and the flags are already written.

**Risk to tests:** four tests pin the run-length sets count-for-count and classify each line
`world` / `run-length`. The published enumeration must move with the copy, or the suite goes red for
the right reason and is then fixed the wrong way.

### C2 — *First Signs*' turn-in names three species the player may not have met.
**Verified.** Objective is `{kind:"distinctLinesMetAt", node:"r1", count:3}` — **any** three of the
six lines on Meadow Reach. `maren.quest.first-signs.done` says *"Three cards. Loamunder, Nibbin, and
something that scraped bark at chest height — that's Bramblehog."* A player who read Skir, Pollywisp
and Carricrow hears Maren name three animals they never found. **This is the game's first quest**, and
it is the content-truth class the audit already fixed nine instances of (DIALOGUE-NOTES §5).

**Fix.** Reword line 1 so it does not enumerate. The line's real content is that three cards are a
reading of a place, not a list — which is more in character for someone who cares about the difference
between two readings. **Do not tighten the objective:** "any three" is what the offer asks for and is
the right rule. Net zero lines.

**Risk:** this entry sets `chain.vellsire.unlocked`, the trailhead of the 11-step chain — the id, its
`setFlags` and its `when` must not move, only the prose. Line 2 (*"Keep the cards; they stack up into
something"*) is the trailhead pointer and must survive.

### C3 — The forge has the wrong owner in the line that names its right owner.
**Verified.** `wick.act4.win`: *"**Sable's forge** takes relics. If you've lost one to age this year,
take it to **Bram** before it goes brittle."* `bram.greeting` opens *"Bram. Forge is mine"* and
`sable.post.win` says *"Bram's forge is behind the gym."* **Fix:** *"Bram's forge takes relics"*, or
the location (*"the forge behind Sable's gym"*), which is what Wick, an outsider, would say. One line,
net zero. Verify no test quotes it verbatim.

### C4 — Three bible-vs-data disagreements, each one word.
All three verified; all three are the **bible** being wrong, not the data.
**(a) Migration season** — bible §9 says spring; bible §5, `data/species.json`
(`gloomoth-line: seasonalWindow = "autumn"`), every authored line, and the corpus's single `seasons`
clause all say **autumn**. Amend §9.
**(b) Kilnback habitat** — bible §4's column says *"Steppe (hidden)"*; `data/species.json` ships
`["Steppe","hidden"]` but the population is 1 in `data/nodes/cindershelf.json` (the **town**), and all
six chain steps place it under the mine. Data and dialogue agree; the column disagrees. Amend the
column.
**(c) Bloom Year** — bible §9 promises *"bonus spawns"*; `core/regional-events.ts` ships the window and
deliberately ships **no** encounter multiplier, because building one would be a **G3 violation**
(`core/foodweb.ts` is the only module that may compute an encounter weight). The two ambient bloom
lines are **true as written** — flora drives breeding and encounter weight *is* the live population.
**Amend the bible sentence; do not build the multiplier.**
Each gets a DEVIATIONS row. `core/regional-events.ts`'s header and
`balance.regionalEvents._bloomFraction` both currently say the decision is unruled and must be
updated to point at the row.

### C5 — The survey is written as sacred; the user says it is a tool.
Folded into **B17 Pass B** — the four reverence lines are listed there. Recorded separately so the
voice lane does not lose it: `prop.hearthollow-signpost`, `maren.keystone.6`, `wick.act1.loss`,
`maren.greeting.sanctum-approach`. A warden with a clipboard, not a scribe with a relic.

---

## DO NOT FIX

### Already fixed — verified this session, and the docs are stale
1. **STORY-REVIEW D1** (44 entries gate on an exact calendar year). **Verified fixed.** The
   `when`-key histogram over all 211 entries shows `years: 0`, `yearMax: 0`, `actMax: 0`. The two-clock
   split is executed and the surviving 19 `yearMin` clauses are exactly the town-ageing and
   `amb.*.late` entries D1 says should stay on the calendar. **Mark §0 and §6 stale.**
2. **STORY-REVIEW D2** (First Signs / `maren.keystone.1` dead-end losing the Vellsire chain). **Claim
   is false against the current file.** Verified entry by entry: the offer gates on
   `{flagsSet:["quest.first-signs.offered"], flagsUnset:["quest.first-signs.done"]}` and
   `maren.keystone.1` on `{flagsSet:["chain.vellsire.unlocked"], flagsUnset:["chain.vellsire.step1"]}`
   — not one year clause. `quest.first-signs.turnin` IS written by `syncQuestFlags`, fed by
   `recordLineMet` at `OverworldScene.ts:719`. **Mark stale.**
3. **STORY-REVIEW D12** (r4 ships healthy against the CASCADE beat). **Verified fixed, better than
   asked.** `yearEvents` is act-keyed (D-Q3-1) with `harvestFractionOfStanding: 0.8` (D-Q6-1), so the
   raid takes `max(remove, round(count × 0.8))` and *"arrival mid-collapse"* holds at any standing
   stock and any calendar year. G6 intact — only the two Grazer lines are scripted. **Mark stale.**
4. **DIALOGUE-NOTES §8 item 4** ("no line for the window before the act-4 raid"). **That window does
   not exist** — see T4. Moot.

### Genuinely the user's decision — named
5. **P0-A: raise the line budget, or trim.** ~+70 lines against a hard `<= 500`. Not an agent's call.
6. **B4: Wick's six battle rosters.** Bible §8 states only that his team always includes Carricrow.
   Every other slot is invented content and **G2 forbids inventing it**. A recommended shape is
   given; it needs Hank's word, not a guess.
7. **H1: what a badge is.** New lore in a project where G2 forbids inventing content. Must be an
   explicit bible §8 amendment authorised by Hank with a DEVIATIONS row.
8. **H2: Cullbrand buys records; the gate stays unexplained.** New backstory for a bible-canon
   character. Same amendment requirement.
9. **C1: `maren.epilogue.released`.** One of the two best lines in the project and the one most likely
   to be in the demo video. Rewrite it once, carefully, by hand — or rule to accept the drift. Both
   are legitimate.
10. **T2: acknowledge or delete `story.starter`.** Deletion forecloses a future reader; that is a
    design call.
11. **H5 residual: the act-6 walk-back to Duskhollow.** Accept it, or narrow `trail.stone.*` to the
    five walkable stones (which changes a shipped objective whose comment cites *"Six is never typed
    anywhere"* as a virtue).
12. **The `Nessa` / `Hetty` contradiction.** The brief names Nessa a keeper; D-Q2-4 already renamed
    her display name to **Hetty**. Hank must confirm which stands before the naming lane runs, or a
    writer will silently revert an authorised IP change.
13. **T4 / H8: whether to add a node wildcard to `core/dialogue-schema.ts`.** Every entry currently
    names a node and `selectEntry` keys on it. Adding a wildcard has reachability-fixpoint
    consequences. Surface, do not invent.
14. **Every name question.** Species, moves, types, statuses, towns, the region, and the bible-canon
    characters (Maren, Wick, Greaves, Maribel, Odo, Vesper, Sable, Noct, Bram, Sel) are out of scope
    per the brief and `docs/IP-SWEEP.md` is pending Hank's ruling on 18 items. **Nothing in this plan
    renames any of them.**
15. **The five borderline G7 lines (STORY-REVIEW D3).** A taste ruling Hank has explicitly reserved
    (`docs/QUEUED-CHANGES.md` decision 3). Note for whoever rules: `maren.keystone.6`'s *"I will be
    reading it"* is the only surviving instance of the watched-player motif after the audit cut it
    from Wick and Greaves — and it is also touched by B17 and H2. **Rule before those land, not
    after.**
16. **Bible §9 says the farmer "begs" (STORY-REVIEW D5).** The shipped paid-arrangement framing is
    the **correct** reading: begging is a moral lever and G7 forbids one, and the user's own brief
    says people who work with creatures track them like biologists do. **Amend the bible's word, do
    not rewrite Tolm.** (The gating half of that quest IS a real bug — see B7.)

### Refused on a guardrail
17. **Building a Duskhollow darkness state.** A fifth axis nothing else reads, plus art-lane tint
    work, against one town's ageing cell. H7 restates instead, at zero mechanism cost.
18. **Building the Bloom-Year bonus-spawn multiplier.** **G3**: `core/foodweb.ts` is the only module
    that may compute an encounter weight. C4(c) rules the bible sentence instead.
19. **Raids for acts 1, 2 and 5.** Every raid is a balance change measured in extinctions. H12 adds
    exactly one, measured. Act 1 deliberately gets none.
20. **A third Vellsire outcome for a failed snare.** A third terminal state means a third full
    epilogue on the most-watched beat in the demo. B3 collapses it into "released" with one variant
    and a DEVIATIONS row.
21. **A save-file migration for the renamed flags** (`rival.act<N>.result`, `tutorial.ledger.done`).
    One is read by nothing; the other replays a one-screen tutorial. A migration framework for two
    keys costs more than it saves. **Record the replay in DEVIATIONS.**

### Left alone on purpose
22. **Shop / inn / forge / ferry / quest-log copy describing screens that do not exist.** There is no
    ShopScene, InnScene, ForgeScene or QuestLogScene. These are **build** gaps at their own cut
    lines, not story lies; the copy becomes true when the screens land. Two were verified TRUE against
    shipped data and must not be touched: the innkeepers' *"two ticks"* (`balance.clock.innTicks = 2`)
    and the snare tiers.
23. **Tightening *Restock the Shallows* and *After the Crash* to the species/counts their copy
    names.** Both deviations are honestly documented in `game/quests.ts` and both done-lines are true
    of what the objective checks. *Silk Shortage* is the exception and is repaired in H4, because
    there the count the copy argues about **is** the dilemma.
24. **Micro-geography invented as texture** (Cindershelf's numbered shafts, Bowerdeep's winding house
    and eastern stair, Brackwater's numbered pilings, Sel's grandfather). Consistent within itself,
    some of the best writing in the file, and only a problem once painted maps exist to contradict it.
    **Revisit after the art lane, not now.**
25. **The player character's silence.** All agency is in `choices[]`; there is no scripted player line
    anywhere. A real and defensible stylistic commitment the bible does not settle. **T4's field-
    notebook act markers are written to preserve it.** A speaking protagonist is a separate decision
    with a large blast radius.
26. **The `said`-set repeat model in `talkEntryFor`.** Working as designed. It is the reason the
    `maren.crash-survey` (52) / `maren.keystone.4` (50) collision at Cindershelf is survivable, and
    removing it would make chain step 6 — and `chain.vellsire.complete` — unreachable. The genuine
    defect adjacent to it is B9, which is data.
27. **`tools/comfy/manifest.json`'s `ledger-panel` asset key.** Renaming it may break the
    manifest→generated-file mapping. **Art lane's call.**

---

## EXECUTION ORDER

### Wave 0 — decisions and the safety net. Nothing else starts.
| | Work | Owner |
|---|---|---|
| 0.1 | **P0-A** budget ruling; **B4** roster ruling; **H1** and **H2** bible §8 amendments; the **Nessa/Hetty** contradiction; **C1**'s epilogue line | **Hank.** Six rulings, then agents move. |
| 0.2 | **B16** — `tests/unit/quests.test.ts`, written to be **RED** at B7, B8, B11, B13 | One agent, `tests/` only. Runs concurrently with 0.1. |
| 0.3 | Mark STORY-REVIEW D1/D2/D12 and DIALOGUE-NOTES §8 item 4 stale | Same agent as 0.2, docs only. |

**B16 must land before any of B7/B8/B11/B13.** Each repair is then proved by a test that was red
first. Do not reverse this.

### Wave 1 — the wiring. Sequential within, because it is one dependency chain.
```
B1 (battle-kind selection)
 ├─→ B2 (greaves flag: verified as a consequence of B1 — assertion only)
 ├─→ B4 (rival roster + module + trigger)   [needs 0.1 ruling]
 │     ├─→ B6 (loss no longer closes the encounter)
 │     └─→ B15 (result-flag rename; do it with B6 so the namespace moves once)
 └─→ B5 (story.greaves.entered off the rival)
B3 (finale resolver)  ── independent of B1's selection, but its epilogue is only
                          reachable once B2 lands. Ship B1 first.
B12 (finale encounter gate) ── must land WITH B3; B3's scripted encounter is what
                          makes B12 safe.
```
**One agent owns Wave 1** — `game/dialogue-runner.ts`, `game/scenes/OverworldScene.ts`,
`game/finale.ts`, `game/rival.ts`, `data/rival.json`, `core/types.ts`, `core/schemas.ts`,
`data/balance.json`. **Then an independent adversarial verifier who did not do the work** walks a
headless run from a fresh save to both epilogues and reports what the green is evidence of.

### Wave 2 — quest-layer repairs. Parallel-safe on disjoint quests.
All are red-first against Wave 0's tests.

| Stream | Repairs | Files |
|---|---|---|
| **2a** | **B7** (fallow offer) + **H10** (annual re-arm) | `data/dialogue.json` **Tolm entries only**; `game/quests.ts` fallow row |
| **2b** | **B8** (forge acceptance) + **T1** (forge beat) | `data/dialogue.json` **Bram entries only**; `game/quests.ts` forge row |
| **2c** | **B11** (census pump + ending) + **H9** (monotonic dex) | `data/dialogue.json` **Ives entries only**; `game/quests.ts` dex + census |
| **2d** | **B13** (wager deadline + lapse) | `data/dialogue.json` **Sel entries only**; `core/quests.ts` + `game/quests.ts` |

**⚠ 2a and 2c both want the repeatable-objective re-arm. Build it ONCE, in 2a, and 2c consumes it.**
Sequence those two; 2b and 2d run alongside either.
**⚠ All four touch `game/quests.ts`.** Give one agent the `game/quests.ts`/`core/quests.ts` edits as
an integration step and let the four streams write only their own speaker's entries. Disjoint
speaker sets are NOT disjoint files here.

### Wave 3 — corpus-only structural repairs. Highly parallel, disjoint speaker sets.
No code. Each stream owns its speakers' entries and nothing else.

| Stream | Repairs | Speakers owned |
|---|---|---|
| **3a** | **B9** (ten turn-ins self-close + nine after-lines) | **All ten quest givers** — must be one agent; it is a single invariant |
| **3b** | **B10** (ten prop fallbacks) | `prop-*` speakers only |
| **3c** | **B14** (festival rule) + **H8** (retirement reach/priority) | maren, maribel, the festival elders |
| **3d** | **H4** (silk refusal + Vesper's count) | halder, vesper |
| **3e** | **H5** (trail: clause, Maren receipt, season, order) | orrin, maren-trail, `prop-antler-stone` |
| **3f** | **H7** (Duskhollow restated) | orrin, noct, the two duskhollow ambients, the innkeeper |
| **3g** | **H3** (Wick reads the region) | wick only — **blocked on B4** |
| **3h** | **H6** (Sanctum state + survey hand-off) | `prop-antler-stone`, maren-sanctum, the scout |

**⚠ 3c, 3e and 3h all touch Maren or `prop-antler-stone`.** `prop-antler-stone` is at 25/30 and 3e +
3h + H5's season variant all add to it. **Sequence 3e → 3h**, and give Maren's entries to 3c as
owner with 3e/3h filing their Maren lines through it.

### Wave 4 — content additions and polish. Parallel.
**H11** (flag census + the new G14 test) · **H12** (the one raid — **must re-run the harness**) ·
**T3** · **T4** (needs the schema ruling) · **T5** (ten state variants, disjoint speakers, highly
parallel) · **C2** · **C3** · **C4** (docs only).

### Wave 5 — the rename and the voice pass. LAST, and alone.
**B17 Pass A** (id + flag + goto + three test files, one atomic edit) then **Pass B** (fifteen line
rewrites incl. **C5**), then the **voice/naming lane** (41 job-title speakers → given names, the
whole-corpus register pass, **C1**'s four rewrites).

**This wave runs alone.** Every earlier wave edits `data/dialogue.json` structurally; this one edits
it as prose. Running them together corrupts the file. **`_counts.lines` updates last, in this wave,
in the same commit as the final line change** — it is asserted exactly.

### Standing rules for every wave
- **Every wave gets an independent adversarial verifier who did not do the work.**
- **Never weaken an assertion to land a wave.** `justify-test-edit` applies to every existing
  assertion these repairs sit beside. B16's four deliberate reds are fixed by fixing the code.
- **`_counts.lines` and the budget constants move together, once, in Wave 5.**
- **Re-run `npm run harness` after B4 and after H12.** Both are balance-visible.
- Run `npx tsc --noEmit`, `npm run test` and `npm run build` at every wave boundary.

---

## Measurement gap I could not close

**Whether a fast player can reach act 6 before their Juvenile starter's three years expire** — which
would silently delete the never-cut LEGACY beat under the Q3 clock split. The act ladder needs five
badges and nothing else; the calendar needs ~48 ticks for three years at 16 ticks/year with
foray = 1, travel = 1, inn = 2. Level pacing probably protects it (the act-5 gym is L32–34) but
nothing **guarantees** it and no test asserts it. H8's copy is written to work in both cases.
**A gate on the calendar would re-couple the clocks Hank just separated, so the correct mitigation is
a line that works either way, not a rule.** The real answer needs a balance-harness run, which is not
a story task.
