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
