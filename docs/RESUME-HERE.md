# RESUME HERE — state as of 2026-08-26, end of the overnight run

**Everything is committed and green.** `npx tsc --noEmit` clean · `npm run build` clean ·
**50 test files / 2341 tests, zero failures** · `tools/prose/prose-lint.py` 0 per-beat flags and
0 corpus structural failures · working tree clean.

Nine commits, `5b372b8` … `a5c51d8`. Nothing was pushed — that needs you.

## What the session was asked to do, and where it got to

**"The story and dialogue are a mess."** The whole 500-line corpus was rewritten and landed
(`94111b1`). What was actually wrong, measured rather than asserted: one sentence opener was shared
by 24 of 62 speakers; characters spoke the game's data model aloud ~90 times (an innkeeper said
*"Bed's two ticks off the season meter"*); the survey was written as scripture. Five passes, each
audited by agents that did not write the thing they graded.

**"The ledger is just a tool."** `ledger → survey` repo-wide — identifiers, filenames, scene keys,
tests, docs, player-facing strings. G7 keeps its rule and lost its slogan.

**Merchant and NPC names.** 41 background NPCs have given names instead of job titles
(Net-Mender → Parnel, Shaft-Hand → Nunn). Pokémon-only IP renames: Overgrow → Thicket,
Keen Eye → Bright Eye, Strong Jaw → Broad Jaw, Nessa → Hetty, Dous → Douse. No id moved.

**Story holes.** 39 of 211 entries / 83 of 499 lines were unreachable — nothing in `game/` ever
selected a `battle-*` entry, and both epilogues gated on flags nothing wrote. Wired, plus two
permanent gates (`tests/gates/reachability.test.ts`, `tests/gates/quest-layer.test.ts`).

## THE FOUR DECISIONS THAT ARE YOURS

1. **Palette** — `assets/approved-trials/_palette-candidate/_DECISION-SHEET.png`. Untouched.
2. **B-D38** — the three class-skeleton images before 154 sprites get billed. Untouched.
3. **The IP-SWEEP renames** — 18 RED, G15 makes it yours. Only the Pokémon-name subset you ruled on
   was acted on.
4. **The cascade's release clause** — see below. New, and the largest open content question.

## OPEN, AND WHY EACH IS OPEN

**The cascade's mesopredator release is structurally unreachable** — `docs/CASCADE-RELEASE.md`.
Bible §5 gives every apex its own mesopredator in its diet, so starving the apex requires depleting
the animal that is supposed to be released. On §10.2's clause the figure is **0–13% at every node**.
Three levers are measured in that document; all three are content or spec edits (G2), so none was
taken. `LANE-A-STATUS` §6.2's risk is recorded as **still open**, and the balance report now
retracts its own recommendation to move the beat to a vertical-slice node.

**A fresh line-by-line G7 read is OWED** — `docs/DIALOGUE-NOTES.md` says so. The old read analysed
text that no longer exists. A regex cannot detect tone; the gate is a human-style read.

**`tools/harness/fixture.ts`'s release repair is bound by no test** — reverting it leaves the suite
green. Filed in `DEVIATIONS.md` D-BAL-3. Same shape as the decoy knobs below.

**Owner-decision BLOCKED-FINDINGS, untouched:** BF-8 (what a battle loss costs), BF-22/23 (a live
API run and the first painted map), BF-24, BF-27/28, BF-29, BF-30, BF-31, BF-32, BF-33.

## DECIDED — NOT OPEN, so nobody re-opens it

**Attributability is no longer a universal bar.** Hank ruled: *"Not all dialogue has to be so
stylized that it can be directly tied to a character. Some things are simply normal for anyone to
say. So, let's drop that."* `CAST-AND-VOICE.md` **Appendix H** is that ruling — the four-line test
now applies only to lines doing characterisation work, not to greetings, prices, directions or the
ordinary business of a transaction. **The 53% `G13-NOUN-CARRIED` figure this file previously listed
as "the honest remaining gap in the prose" is therefore not a gap and is not to be driven down** —
ordinary speech names ordinary things, and chasing the number is how you get sixty-two aphorists.
The check stays, diagnostic-only; its actionable reading is per speaker (`duskhollow-shepherd` at
3/3), never the corpus share. Logged as `DEVIATIONS.md` **D-PR-10**. **No dialogue was rewritten.**

## THE LESSON THIS SESSION KEPT RE-LEARNING

**Decoy knobs, and tests that bind the wrong thing.** `BLOCKED-FINDINGS.md` §1.1 records it. Three
separate repairs shipped with a green test that asserted a helper nothing called: a battle-sprite
size moved into `balance.json` while the HUD kept drawing from a hardcoded 96; an RNG stream change
bound by nothing, leaving two replay harnesses replaying a stream the game had stopped opening; a
placeholder-label fix whose complete reversal left 11/11 green because no test called the writer.

Same shape as the defect that started the night: `story.vellsire.resolved` appeared in exactly three
files and **all three were tests** that set the flag themselves. 2095 tests certified a finale
nobody could reach.

**The measuring instrument is the thing to check first.** The §10.2 release metric counted *any*
prey rebounding, so a Grazer scored as mesopredator release and the report recommended a demo stage
on it. The prose linter's chorus check was five lexical regexes, every one a fossil of a shape
already removed — it read clean while 36 of 62 speakers shared a construction. Both are fixed; both
were invisible until someone asked what the green was evidence *of*.

## FIRST THINGS ON RESUME

1. **Push.** Nine commits are local only. `git push https://labs.gauntletai.com/hankholcomb/trophic.git main`
2. Rule on the four decisions above, the cascade one first — it gates whether §10.2 gets built to or amended.
3. The owed G7 read.
