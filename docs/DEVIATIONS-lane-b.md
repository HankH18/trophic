# DEVIATIONS — Lane B (art factory)

Staged separately because Lane A agents hold `docs/DEVIATIONS.md` concurrently.
**Merge into `DEVIATIONS.md` once Lane A integration completes.**

| # | Spec ref | Deviation / finding | Rationale & action |
|---|---|---|---|
| B-D1 | handoff vs `tools/comfy/pixel-txt2img-api.json` | **The validated trial seed is `42`, not `62`.** The KSampler node's `seed` input is `42`; `62` is the *node id* of the CLIPLoader. The handoff misread one for the other. | Load-bearing for G5 (regeneration must reuse the manifest seed) and for the B1 gate (byte-identical reproduction from the manifest). Every manifest row derived from this trial records **42**. |
| B-D2 | build-doc §9.2 | **Undocumented generation parameter.** The graph contains a `ModelSamplingAuraFlow` node with `shift: 3` feeding the KSampler. §9.2's locked parameter list (model/CLIP/VAE, 8 steps, cfg 1.0, res_multistep, simple, 1024²) does not mention it. | It materially affects output, so §9.2's list is incomplete rather than wrong. Recorded as a spec addendum; the base graph is used unmodified per the handoff ("do not rewire it"). |
| B-D3 | handoff item 1 | **`player-REJECTED-cape.png` intentionally not delivered.** Five trial PNGs exist, not six; all five are distinct (no byte-identical duplicates to dedupe). Hank confirmed the sixth was the original caped main-character image and is no longer relevant. | Closed, not a gap. The handoff already excluded it from the palette source set and forbade it as an img2img seed, so it had no role beyond negative reference. L6's "no cape" is enforced by the prompt string, not by that file. |
| B-D4 | build-doc L6 / §9.2 | **The graph's embedded positive prompt is not the L6-locked player prompt.** It reads `...simple green shirt, leather satchel and walking boots...` — omitting `ranger cap with star badge` and the `no cape` exclusion. (The trial output nonetheless has the cap and star.) | Harmless to the base graph, since §9.1 injects prompt/seed per manifest row. But every player manifest row must carry the L6 string **verbatim**, including the cap clause. Flagged so no one treats the embedded prompt as canon. |
| B-D5 | build-doc §9.3 | **Measured colour counts on the trial set: 49,313–353,527 distinct RGB values** (town map is the extreme). The outputs are 1024² AI renderings *of* pixel art — anti-aliased and not grid-aligned. | Anticipated by §9.3 ("raw output is pixel-style, not grid-aligned"), so this confirms rather than contradicts the spec. Logged because the town map is by far the hardest case for the 32-colour palette quantization, and it is the class where quantization artifacts will show first. |
| B-D6 | bible §4 | **`creature-croc.png` is a class style reference only.** Its anatomy is a generic crocodilian; the trial regressed Fenmaw's canon gharial snout. | Must never be used as Fenmaw's anatomy reference or as an img2img seed for Fenmaw. §9.2's fidelity rule (front-load and repeat distinctive anatomy) exists because of this exact failure. |

## Open decision for Hank — raised, not decided

**The approved town-map trial is isometric, not axis-aligned top-down.** Roof ridges run
diagonally and the paths cross in an X. Build-doc §7.6 specifies `tile step 32px, grid movement
Gold-style` — orthogonal N/S/E/W movement. On an isometric painting the player would walk
orthogonally across roads that read at 45°.

This is a class-level style lock affecting all 12 maps *and* the collision editor, and Hard Req 5
means each mask is authored once and must survive all six years — so it is expensive to revisit
after B4. Options are in the B0 briefing. Not blocking; needs a call before B4.

## Live-API findings (Lane B build-out)

| # | Spec ref | Finding | Action |
|---|---|---|---|
| B-D7 | build-doc §8.4 / §9.2 | **Player-class negative prompt extended.** `cape, cloak, hood, mantle` appended to the frozen negative, for the player class ONLY. | L6 forbids a cape and the new style reference *has* one; without this the model reproduces it. §9.2 forbids `cape`/`cloak` in the positive prompt — this is the negative-side enforcement of the same lock. All other classes use the frozen negative unchanged. |
| B-D8 | build-doc §9.1 | **Comfy Cloud does NOT implement `GET /api/history/{id}`** (404s forever), unlike local ComfyUI. Job outputs are delivered ONLY over the WebSocket `executed` message *while the job runs*. `GET /api/job/{id}/status` exists and is authoritative for terminal state but carries no outputs. | Load-bearing for the batch runner: the socket must be OPEN BEFORE submitting, or the output is unrecoverable and the job still bills. `tools/comfy/client.ts` connects first, then submits. §9.1's "polls/WebSockets" is therefore WebSocket-only in practice. |
| B-D9 | build-doc §9.2 | **The validated trial's prompt skeleton differs from §9.2's.** The trial graph says `retro 90s handheld RPG style`; §9.2's skeleton says `retro 90s handheld monster-taming RPG style`, and the trial has no `[PALETTE NOTE]` segment. | The trial string is what actually produced the approved art, so it is the empirical style lock and is used verbatim. §9.2's skeleton is treated as the documented intent, the trial string as the operative one. |
| B-D10 | build-doc §9.1 / G13 | **No credit-balance endpoint found** (`/api/customers/credit`, `/api/credit`, `/api/user/credit` all 404). Balance is visible only in the dashboard (4,197 before this session's generations). | G13's pre-batch credit estimate cannot be computed from the API. The runner will estimate from a measured per-image cost derived by reading the dashboard before/after a known batch, and print that with the `--confirm` gate. |

**Verified working:** `POST /api/prompt` → `wss://cloud.comfy.org/ws` (`executed` / `execution_success`) → `GET /api/view`. Same graph + same seed produced **byte-identical output across two runs** (sha256 `ff9290ee44efb7ec…`), which is the reproduction property the B1 gate needs. ~4-6s per 1024² generation.
