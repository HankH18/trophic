# Lanes B + C — status after integration

**What this file is.** The honest state of `game/`, `tools/` and the shipped app after lanes B
(art factory) and C1–C6 (game shell) were merged and wired. It is written for the next wave, so it
says what is proven, how it was proven, what is a stand-in, and what is simply not there. Its
companion is `docs/LANE-A-STATUS.md`, which is still accurate about `core/` except where the
time-model amendment (below) has overtaken it.

Per build-doc §16 G12, nothing here is stated in human engineering-hours.

---

## 0. Read this first — the tree moved while this was written

A second workstream (the **time-model amendment**, `docs/DEVIATIONS.md` D-Q2-1 / D-Q3-1) landed in
`core/` **during** this integration pass. It is a real redesign, not a tweak:

- L8's "year = gym victory **or** full meter" became "year = full meter". `core/clock.ts` no longer
  exports `gymVictory` or `isOver`, and `YearEndReason` has one member.
- **The calendar is unbounded.** There is no final year and no six-year cap.
- Story progression moved to a **second clock**: `core/acts.ts` + `balance.acts.gates`, driven by
  badges and quest flags. `GymLeader.year` → `GymLeader.act`; `RaidScript.year` → `RaidScript.act`.
- New: `core/acts.ts`, `core/regional-events.ts`, `data/dialogue.json`.

Consequences for everything below: measurements taken **before** that landed are marked
`@HEAD a4ab9e0`; measurements taken after are marked `@post-acts`. Where the two disagree the
post-acts reading is the current truth. The single biggest behavioural change is in §3.

---

## 1. Headline

| | |
|---|---|
| `npx tsc --noEmit` | **silent** (exit 0) |
| `npx vitest run` | **37 files, 1914 tests, 1914 passing, 0 failing, 0 skipped** |
| `npm run build` | **green** (148 modules, `dist/` written) |
| Scenes registered in `game/main.ts` | **10 of 10** — Boot, Title, Menu, Overworld, Battle, Ledger, Dex, Summary, YearTurn, Retirement |
| Scenes actually reachable by playing | **9 of 10** (Retirement needs a year in which something retires; reached headlessly, see §5) |
| Real generated art in `assets/final/` | **none** — every visual is a labelled placeholder |

Both counts are a moving target: the suite went 34 files / 1829 tests → 35 / 1883 → 38 / 1917 →
37 / 1914 **during this pass** as the time-model workstream landed. Re-measure before quoting.
For one window mid-pass the tree was RED repo-wide (`core/clock.ts` had lost `isOver`/`gymVictory`
while `game/` and `tests/` still imported them, and the browser showed the C1 watchdog panel
`TROPHIC failed to start — the module graph did not load`). That window has closed; it is recorded
because it is what a half-landed `core/` change looks like from the shell, and the watchdog worked.

---

## 2. What is built and wired

`game/` is 22 modules + 10 scenes + 7 UI widgets, ~13.7k lines. The routing, verified live rather
than by reading:

```
BootScene ──> TitleScene ──> MenuScene(slots) ──> [startNewGame|continueGame] ──> OverworldScene
                  ^                                                                    |
                  |                                                       ESC          v
                  +──────────── MenuScene(session) <──────────────────────────── (in-run menu)
                                   |    |    |
                                   v    v    v
                              Ledger   Dex   Summary        (each closes back to MenuScene)

OverworldScene ── encounter ──> BattleScene ── onFinished ──> catch applied, Battle stopped, resumed
OverworldScene ── clock yearEnd ──> YearTurnScene ── retirement prompt ──> RetirementScene ──> back
```

- `game/scene-keys.ts` is the single key registry; every `scene.start` / `scene.launch` in the
  shipped code asks `sceneRegistered()` first, so an unbuilt lane produces a stated refusal on
  screen instead of Phaser's silent `console.warn` no-op.
- The overworld↔battle seam is `game/wild-battle.ts` (engine-free): `buildWildBattle` in,
  `applyWildBattleOutcome` out. `BattleScene` contains no damage, catch or turn-order arithmetic —
  it renders `core/battle.ts`'s event log. L11 holds: `core/` still has zero engine imports.
- The overworld↔year-turn seam is `driveYearTurn`/`finishYearTurn` (`game/scenes/YearTurnScene.ts`),
  which is also what the headless path uses when the scene is not registered.

---

## 3. I1 — the vertical slice, driven in a real browser

**Method** (record it so nobody repeats the dead ends): `npm run dev`, then Chrome. Two traps cost
real time and are worth knowing.

1. **A background tab does not run the game.** `document.visibilityState === "hidden"` freezes
   `requestAnimationFrame`, so the Phaser loop stops. Screenshots still show the last painted frame,
   which makes a frozen game look like a broken one. Fix used: step the loop by hand —
   `game.step(t, dt)` in a loop, with the game found via
   `Phaser.Display.Canvas.CanvasPool.pool` → the `TextureManager` entry → `.game`.
2. **`setTimeout` is clamped to ~1s in a hidden tab**, so any driver that awaits timers hangs and the
   CDP call times out. Await microtasks (`await Promise.resolve()`) and drive time through the
   manual step instead.
3. Phaser's `Key.onUp` clears `_justDown`, so a synthetic keydown+keyup inside one frame is
   **invisible** to `Phaser.Input.Keyboard.JustDown` — which is how the overworld reads travel, the
   collision overlay and the inn. Hold the key across at least one stepped frame.

**What genuinely works** `@HEAD a4ab9e0` — driven end to end, screenshots taken:

| Beat | Result |
|---|---|
| Boot → Title | title screen, honest `PLACEHOLDER ui/title-banner 208x48 unbuilt` banner |
| NEW GAME → slot | slot list, 3 slots, `startNewGame` writes the slot |
| Overworld | Hearthollow renders; HUD prints every line's live count, the derived weight total, the season meter, the tint and the provenance of both the map and the mask |
| Walking | WASD/arrows move on the synthesised mask; foray steps accrue; the camera follows |
| Travel | `[1] travel → r1` moved the save to `r1` and logged `{t:"travel", to:"r1"}` |
| Wild encounter | `pollywisp-line J L8 · trait dulled-sense` — rolled off the seeded encounter stream |
| Battle | Battle scene launched, overworld paused; cards, HP bars, menu, message box all render |
| Catch | Master snare → `outcome: "caught"` → **r1 loamunder 32 → 31**, party 1 → 2, action log `{t:"catch", nodeId:"r1", lineId:"loamunder-line", uid:…}` |
| Ledger | opened from the in-run menu: **`Loamunder 31 96 0.090`** — the decremented number, on screen |
| Menu round trip | Ledger → menu → overworld returned the player to the tile they were standing on |
| Year turn | 8 × `[R] inn` filled the meter; tick 15 + 2 carried into Y2 tick 1; YearTurn scene ran its 3 beats; party aged J→A and A→E; back to the overworld |

`@post-acts` re-drive on the current tree: new game → encounter → battle → **catch pollywisp 4 → 3
at hearthollow** → year turn → banner `year 1 ended (meter) → Y2`, starter aged J→A. The loop still
plays.

### 3.1 ⚠ The slice is NO LONGER WALKABLE past Hearthollow

`@post-acts`, pressing `[1]` at Hearthollow prints:

> `r1 opens in act 1 · act 0`

`balance.acts.gates` opens `r1` at act 1, which requires the quest flag **`story.opening.done`**.
That flag is written only by `data/dialogue.json` (Warden Maren's opening chain) and **nothing in
`game/` plays dialogue** — there is no dialogue runner scene. So a new save is locked in Hearthollow
and build-doc §1's never-cut vertical slice (Hearthollow → R1 → Brackwater → R2) cannot be walked.

The gate itself is well built — it refuses out loud and names the act. What is missing is the thing
that satisfies it (build-doc §15 **C7**, the opening beat). **This is the single highest-priority
item for the next wave**: without it the region is one node.

---

## 4. I2 — the cascade, measured on the game path

`tests/integration/demo-beats.test.ts` (new, 5 tests) replays `fixtures/overcatch-script.json`
through the **production** functions — `rollForay` → `buildWildBattle` → `core/battle.ts`
`startBattle`/`step` → `applyWildBattleOutcome` → `stepRegionStates`. Nothing in it calls
`applyCatch`. Sabotage-checked: disabling the production population write turns 3 of the 5 red.

**What holds.** Over 24 seeds at `r4`:

- **The apex reaches 0 in 24 / 24 seeds**, by season 3. `stonewing-line 3 → 2 → 1 → 0`. Half the
  never-cut beat — "open year 2 with its predator gone" — is a **law on the played path**, not a
  coin flip.
- Every catch moves the real number, in an unbroken chain: `pyrelisk-line 14→13→12→…→1`. 13 catches
  cost **7 clock ticks** of foraying, so the over-catch is comfortably affordable inside one year.

**What does not hold.**

- **The release is a minority outcome: 5 / 24 seeds (21%)** show the mesopredator rise off its floor
  within the script's 8 seasons. In 17 / 24 it sits at 1 forever; in 2 / 24 it goes extinct as well.
  This agrees with LANE-A-STATUS §6.2's 16%-at-4-seasons figure, measured independently on the game
  path rather than the sim path.
- **The recorded fixture seed does not reproduce its own recorded trace in play.**
  `fixtures/overcatch-script.json` is seed 12 and records `1 · 1 · 2 · 2 · 3 · 3 · 3`. That trace
  comes off `core/save.ts` `replay`, which drives **one** RNG for the whole action log; the game
  draws from the **per-subsystem** streams (build-doc §8.1). At seed 12 on the game path the prey
  stays at 1 for all six remaining seasons. **Seed 24 is the one that shows the whole beat on the
  game path** (`prey 1 → 2 → 3`, apex 0) and is the seed to shoot the video on until the fixture is
  re-recorded.
- **Catching one animal too many kills the beat.** Extinction is permanent, so the 14th catch (the
  script has 14) removes the animal the release is supposed to happen to — measured: `prey 0, apex 0`
  and nothing rebounds. The demo protocol must stop at 1, and the ledger is what tells the player to.
- `r4` is **not** in the vertical slice and is act-4 content. With §3.1 unresolved the cascade cannot
  be produced by playing at all, at any node.

---

## 5. I3 — the legacy, measured on the game path

Same file. Six years of `driveYearTurn`/`finishYearTurn` with the retirement prompts answered by the
scene's own headless branch:

| year opened | party | starter present |
|---|---|---|
| 2 | `cindril-line A L5 provisional-starter` | yes |
| 3 | `cindril-line E L5 provisional-starter` | yes |
| 4 | `cindril-line J L2 provisional-starter-heir-y4` | **no — retired** |
| 5 | `cindril-line A L2 …-heir-y4` | no |
| 6 | `cindril-line E L2 …-heir-y4` | no |
| 7 | `cindril-line J L1 …-heir-y4-heir-y7` | no |

- **The beat survives**: the starter retires before the league and a creature descended from it is in
  the party at the finale. Asserted, not merely observed.
- **The flavour does not.** bible §4 wants the starter to peak *right before* the league; it is gone
  at the year-3→4 turn, three years early. This is LANE-A-STATUS §6.4 / D-A4-9 confirmed on the
  played path. It is a `balance.age` retune, not a code fix.
- **The heir power cliff is real and visible**: parent L5 → heir **L2** (`heirLevelFactor 0.5`), and
  a *second* generation retires at the year-6→7 turn. D-A4-10.
- Under the amended, unbounded calendar there is no longer a "final year" to stop at; the loop above
  is bounded by `balance.clock.yearsTotal` as an *expectation*, which is what that key now means.

---

## 6. Named build-doc §10 gates — Lanes B and C

| Named test | Where | State |
|---|---|---|
| `overlay_diff` (§8.2, §10.4) | `tests/unit/overlay-diff.test.ts` (65) | **exists and passes** — but see §8: it has never been run against a real map or a real mask, because none exist |
| postprocess idempotency (§10.4) | `tests/unit/postprocess.test.ts` (42) | **passes** |
| manifest seed reuse / versioned reseed (§10.4) | `tests/unit/manifest.test.ts` (116) | **passes**, including the refusal paths (`--force` over an approved row, prompt/workflow hash locks) |
| collision mask round trip (§7.6) | `tests/unit/collision.test.ts` (69) | **passes** — the editor's encoder and the runtime sampler are proved to agree cell-for-cell |
| encounter derivation, no shadow table (G3) | `tests/unit/encounters.test.ts` (38), `tests/gates/guardrails.test.ts` | **passes** |
| battle renderer holds no rules (L11) | `tests/unit/battle-view.test.ts` (138) | **passes** — structural: the scene source is scanned for damage/catch arithmetic |
| overworld executed, not grepped | `tests/unit/overworld-scene.test.ts` (23) | **passes** — the scene is run against a recorder Phaser stub |
| ledger reads `nodeStates` and nothing else (§8.3) | `tests/unit/ledger-view.test.ts` (93) | **passes** |
| year turn / retirement UX | `tests/unit/year-turn-ux.test.ts` (67) | **passes** |
| **I2 cascade on the game path** | `tests/integration/demo-beats.test.ts` | **new, passes** — with the honest-gap assertions of §4 |
| **I3 legacy on the game path** | `tests/integration/demo-beats.test.ts` | **new, passes** |
| `no_magic_numbers` over `game/` (INV-4) | — | **DOES NOT EXIST.** The gate walks `CORE_FILES` only. Nothing would catch a gameplay constant entering a scene. See §9. |
| I1 vertical slice, automated | — | **DOES NOT EXIST.** §3 was driven by hand. There is no headless or scripted walk of Title → Overworld → Battle → Ledger. |

---

## 7. What is a placeholder

**All art.** `assets/final/` is empty, so `hasRealAsset()` answers `false` for everything and every
image on screen is `game/placeholder.ts`'s flat hatched rectangle with the asset id, the pixel size
and the slot drawn on it. That is deliberate and it is honest — a reviewer can read the exact
manifest row that is missing off the screen. Specifically:

- **Maps**: `PLACEHOLDER map — assets/final/maps/<node>.png not built · SYNTHESISED`, tiled 1024².
- **Collision masks**: none exist, so the overworld synthesises "walkable except the border" and
  says so on the HUD: `collision (… did not load) — walkable except the border; NOT an authored mask`.
- **Battle sprites**: 96² stand-ins naming `creature-battle/battle-<line>-<age>-<facing>`. The slot
  was 72² and is now 96² per build-doc §9.3 — fixed at integration, with the measured headroom
  recorded in `game/ui/BattleLayout.ts`.
- **Season tint**: the HUD prints `PROVISIONAL hues` while the tint table is a stand-in rather than
  data.

**The starting party.** `game/boot.ts` `startingParty` seeds a **provisional starter** — the first
line carrying the `"starter"` habitat sentinel, at `balance.xp.starterLevel`, uid
`provisional-starter` — and says so on the console at every new game. C7's opening beat replaces it
by passing `startNewGame({ party })`; nothing else changes.

**The overworld HUD** is a debug readout, not a designed HUD: it is nearly screen-wide and tall
enough to sit over the player. Everything on it is true; none of it is composed.

---

## 8. What is stubbed or missing

- **The opening beat (C7).** No dialogue runner, no Warden Maren, no starter choice, no
  `story.opening.done`. Blocks §3.1, which blocks everything downstream.
- **Gyms.** No gym battle, no badge is ever awarded, `GymLeader` rosters are data nobody fights.
  Under the act model badges are what open acts 2–6, so **acts 2+ are unreachable** as well.
- **The finale / epilogue ledger (Hard Req 7).** `LedgerSceneData` already takes `title` and
  `histories` and `buildLedgerPage` already renders `projectRegion`'s output — but nothing opens the
  ledger over a projection. The seam is ready and tested; the launcher is C9's.
- **Bag and quests** are rows in the in-run menu that say `Not built yet`.
- **Loss has no consequence.** A wild battle the player loses prints `— loss` and returns to the
  overworld with the party untouched: `OwnedCreature` carries no HP, so nothing is hurt, nothing is
  healed and nothing costs anything. There is no blackout, no return-to-town, no fee.
- **`assets/final/` is empty**, so Hard Req 5 (overlay-diff separating a year variant from a
  displaced feature) is **unmeasured against real art**. Every separation figure in
  `docs/DEVIATIONS-lane-b.md` rests on a luminance-derived stand-in mask over palette trials. This is
  the largest remaining risk in Lane B and it cannot be closed from `tools/`.
- **`yearVariants` is `{}` on every node** — no aged map art exists, so build-doc §1's "and the aged
  map" is a code path with no content behind it.
- **Ghost gym teams** are schema-only, correctly (Hard Req 9 / G8).

---

## 9. The honest gap list for the next wave

Ordered by what blocks the judged output.

1. **C7's opening beat.** Sets `story.opening.done`, hands over a real starter, and unlocks r1.
   Until it exists the game is one node and neither never-cut beat can be produced by playing.
2. **A gym battle and a badge.** Acts 2–6 — and therefore Brackwater, Bowerdeep, Cindershelf,
   Duskhollow and every route past r1 — are gated behind badges nothing awards.
3. **Re-record `fixtures/overcatch-script.json` against the game path**, or re-seed it to 24. Its
   recorded trace is a `replay()` artefact and is not what the game produces (§4).
4. **Decide the cascade's release clause.** 21% is not a demo. Either retune the mesopredator's
   `breedRate`/counts in `data/nodes/*.json` (a content edit under D9's licence, properly the balance
   harness's call) or state in the video that the released tier is the *absence of predation*, which
   IS a per-run law, rather than a rising number.
5. **Battle loss consequences.** Today a wipe is free. Whatever the design is — blackout to the last
   town, a fee, party HP in the save — it needs `OwnedCreature` to carry HP, which is a `core/` change.
6. **`no_magic_numbers` over `game/`.** The gate is scoped to `core/`, so nothing stops a gameplay
   constant entering a scene. Extending it needs a per-file allowance census agreed across C1–C6
   first; done unilaterally it turns every lane red at once.
7. **An automated I1 walk.** §3 was driven by hand through a browser. A scripted slice test — even a
   headless one over the recorder stub — would stop the next core change from silently unrouting the
   game the way the act gate silently un-walked it.
8. **Real art.** Everything in §7. Nothing in the game *fails* without it; everything in the game
   *looks* unfinished with it missing, and Hard Req 5 stays unmeasured.
9. **Inlined palette hexes** still ship in `DexScene`, `LedgerScene`, `SummaryScene`, `YearTurnScene`,
   `OverworldScene` and `RetirementScene`. `game/menu-model.ts` + `game/ui/Palette.ts` is the worked
   example of doing it properly (palette ids resolved through `swatchHex`, with a measured-contrast
   test); the rest of the scenes have not been converted.
10. **A wild Ancient can be fielded below Elder.** `game/encounters.ts` rolls
    `balance.encounter.ageWeights` without consulting `line.ancient`, while
    `core/lifecycle.ts` pins an *owned* Ancient to `E` and the art manifest ships Ancients as one
    form. That is 12 `(line, age, facing)` sprite keys with no manifest row.
11. **`game/placeholder.ts` `textureFor` falls back silently.** A wrong texture key and an unbuilt
    asset are indistinguishable at runtime. A boot-time census of "keys asked for that are in no
    manifest row" would make the next key mismatch loud instead of invisible.
12. **`tools/postprocess/run.ts:102` has finding 11's twin** — a mistyped `--class`/`--id` filters
    every row out and exits 0. `assertFiltersMatch` is already exported from
    `tools/comfy/comfy-batch.ts`; the fix is one import and one call.

### Core gaps reported by the lanes and still open

- No wild-creature trait roller in `core/`: `rollWildTraits` exists twice (`game/wild-battle.ts` and
  `tools/harness/player.ts`), deliberately draw-for-draw identical, waiting to collapse onto one
  core function beside `rollHeirChoice`.
- `EncounterWeight` cannot express "sign-chain gated" — `game/encounters.ts` infers it from the live
  count, and Hard Req 10 depends on that inference.
- `BattleEvent.damage` carries no attacker, `moveUsed` carries no target, `levelUp` carries no new
  `curHp`, and `battleStart` carries no trainer identity. Each is one field on an event; together
  they are why the battle renderer infers three things it should be told.
- `data/balance.json` declares no **battle sprite size** (only `map.playerSpriteW/H`), so 96² is a
  literal in `game/ui/BattleLayout.ts` with its reason written next to it.
- There is still no `lifecycle` subsystem RNG tag; the heir stream is keyed
  `sim:heir:y<year>` off the save seed.

---

## 10. If you change one thing, check these

- **Touching `core/clock.ts`, `core/acts.ts` or `balance.acts`** → re-drive §3. The act gate is what
  turned a walkable region into a single node, and no test caught it because no test walks.
- **Touching `game/scene-keys.ts` or the `SCENES` array in `game/main.ts`** → a scene that is not in
  that array does not exist, and every menu that routes to it will say so on screen rather than fail.
- **Touching `game/wild-battle.ts`** → it is the only join between an encounter and the ledger.
  `tests/unit/wild-battle.test.ts` and `tests/integration/demo-beats.test.ts` both bind it; the
  second one goes red if the population write is disabled.
- **Adding a constant to a scene** → it will not be caught by any gate today (§9 item 6). Put it in
  `data/balance.json` anyway.
