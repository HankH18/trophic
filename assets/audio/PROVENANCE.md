# assets/audio — provenance and licence

Every audio file in this directory is **redistributed inside the shipped game**. That makes it
different from `assets/reference/`, which is pipeline input only and never leaves the machine, and
it is why this file exists: a clone of this repository must be able to verify the licence of every
sound it ships **without asking anyone**.

`tests/gates/audio-cue-contract.test.ts` enforces this file. It fails if an audio file has no row
here, if a row is missing its source URL, author, licence or retrieval date, if a row describes a
file that is not present, or if a licence is anything other than CC0 / public domain.

## The rule

- **CC0 or public domain only.** Not CC-BY, not NonCommercial, not ShareAlike, not "free to use".
- **The licence must be verified on the source page itself**, not on an aggregator, a blog, or a
  mirror. Paste the URL of the page that actually states the licence.
- **If a licence is ambiguous in any way, the file does not go in this directory.**

This is stricter than `docs/content-bible.md` §12a, which says "License CC0 preferred; CC-BY
acceptable with an attribution file". The gate refuses CC-BY because an attribution obligation the
build cannot prove it is honouring is a licence risk rather than a licence. If Hank rules that a
CC-BY pack plus a shipped attribution file is acceptable, `ALLOWED_LICENCES` in the gate is the one
place that changes.

§12a's sourcing rule also binds whatever is curated, verbatim: *"all BGM from a single CC0 pack or a
single composer's pack family — mixing packs causes the audio version of style drift (inconsistent
instrumentation reads as amateur faster than any single weak track)."*

## Where a file goes

The cue layer matches a file to a cue **by basename**, so curating a sound is dropping it in and
nothing else — there is no manifest to edit. `game/audio.ts` holds the cue ids.

| Kind | Directory | Example |
|---|---|---|
| music | `music/` | `music/retirement-legacy.ogg` |
| jingle | `jingle/` | `jingle/catch-success.ogg` |
| sfx | `sfx/` | `sfx/menu-confirm.ogg` |

A cue whose file is absent is a silent no-op. Nothing breaks, nothing throws, and the game boots and
plays exactly as it does now.

## The pack

All eleven music cues come from **one pack by one composer**, which is what §12a's sourcing rule
asks for: *"all BGM from a single CC0 pack or a single composer's pack family."*

- **Pack:** 15 Melodic RPG Chiptunes
- **Page:** <https://opengameart.org/content/15-melodic-rpg-chiptunes>
- **Composer:** Aureolus_Omicron
- **Licence, read on that page on 2026-08-28:** the page's `License(s):` field reads **`CC0`** and
  links only to <http://creativecommons.org/publicdomain/zero/1.0/> — it is the sole licence listed.
  Its `Copyright/Attribution Notice` field reads, verbatim: **"CC0. No credit required."**
- **Verified how:** the page's own served HTML was read directly, not an aggregator's summary or a
  search-result snippet. This matters — the same composer's *other six* OpenGameArt submissions are
  CC-BY 4.0 / OGA-BY 3.0, so "this author is CC0" is false as a generalisation. The licence was
  checked on the pack's own page, and the same check was made on the two sibling packs named below.
- **Format:** Ogg Vorbis, stereo, 44.1 kHz, ~256 kbps. 29 MB for the eleven tracks.
- **Also CC0 by the same composer, verified the same way, not currently used:**
  <https://opengameart.org/content/4-music-box-tracks> and
  <https://opengameart.org/content/15-strange-retro-sfx>. They are recorded here because they are
  the sanctioned places to look first if a cue needs replacing — staying inside one composer's
  family is the rule, and these are already licence-cleared.

⚠ **No track was auditioned.** Every mapping below was made by reading the track's title against
§12a's Mood spec column. Three known gaps are recorded at the bottom of this file.

## Files

The cue layer matches these by basename, so replacing a track is overwriting one file.

| File | Source URL | Author | Licence | Retrieved |
|---|---|---|---|---|
| music/title.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/hearthollow.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/brackwater.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/route.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/wild-battle.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/trainer-battle.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/finale.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/ancient.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/retirement-legacy.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/festival.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |
| music/ending-credits.ogg | https://opengameart.org/content/15-melodic-rpg-chiptunes | Aureolus_Omicron | CC0 | 2026-08-28 |

## Open curation gaps

Three things are known to be wrong or unverified. None of them is a reason to hold the layer, and
each is fixed by dropping one file over the named one.

1. **Nothing was listened to.** The mapping is by track title against §12a's Mood spec. This is the
   first thing to check by ear, and the bible is explicit that curation happens against the mood
   table "not by browsing vibes" — which is exactly what a title-only match is. Highest priority:
   `music/retirement-legacy.ogg`, because §12a says of that cue, verbatim: *"this cue carries the
   game's emotional beat; pick it first."* It is currently `rpgchip02_bittersweet_story`, chosen
   because "bittersweet" is the closest title to "tender … resolves upward". Unverified.

2. **Neither battle track meets the "loopable under 45s" budget.** §12a specifies the Wild battle
   cue as "driving, loopable under 45s". Derived from file size at the pack's stated 256 kbps,
   `wild-battle.ogg` runs ≈125 s and `trainer-battle.ogg` ≈85 s. Both are over. No track in this
   pack is under 45 s. The only surveyed CC0 pack that natively satisfies the budget is
   SketchyLogic's "NES Shooter Music" (<https://opengameart.org/content/nes-shooter-music-5-tracks-3-jingles>,
   `License(s): CC0`, verified 2026-08-28) whose loops all run under 47 s — but taking one track
   from it would break §12a's single-pack rule, so it was not used. This pack also ships MIDI
   source (`15_melodic_rpg_chiptunes_mid.zip`, 15.8 kB, same CC0), which under CC0 may be trimmed
   and re-rendered to make a sub-45 s loop in the pack's own voice.

3. **`ending-credits.ogg` does not satisfy its spec.** §12a asks for a "title theme reprise,
   thinned" — a cue defined by its *relationship* to the Title track, which no stock pack can
   supply. `rpgchip05_pavane` is standing in as a slow closing piece. The pack's CC0 MIDI source is
   the honest route to a real reprise.

**One further judgement call, recorded rather than hidden:** this pack is rendered from General
MIDI, so it reads as soundfont-RPG rather than Game Boy DMG. The best-matching GB-authentic CC0
pack surveyed was Not Jam's Music Pack 2 (<https://not-jam.itch.io/not-jam-music-pack-2>), whose
page declares CC0 three separate ways and which states it leans "closer to strict Gameboy
limitations" — but itch.io's name-your-price download requires an interactive browser session and
could not be fetched here. If DMG texture matters more than the cue coverage this pack gives, that
is the pack to swap the family to.
