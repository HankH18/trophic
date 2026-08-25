# tools/comfy — asset factory

`pixel-txt2img-api.json` is the **validated trial graph** in Comfy API format, exported from the
ideation session. Per the handoff: **do not rewire it.** It is the base graph for every pixel
txt2img class; per-class "workflows" are this graph with `prompt` and `seed` injected per
manifest row (build-doc §9.1–9.2).

Verified contents: `z_image_turbo_bf16` UNET · `qwen_3_4b` CLIP (lumina2) · `ae` VAE ·
`ModelSamplingAuraFlow` shift 3 · KSampler **seed 42**, 8 steps, cfg 1.0, `res_multistep`,
`simple`, denoise 1.0 · `EmptySD3LatentImage` 1024×1024 · the locked negative prompt.

Two corrections to the handoff are logged in `docs/DEVIATIONS-lane-b.md` (B-D1 seed is 42 not 62;
B-D2 the `shift: 3` node is undocumented in §9.2).

## Writing a subject: name anatomy by its SHAPE, never by its species term

**The rule.** A subject string may keep the bible's species term — it must, G2 protects it — but the
term is never allowed to be the only thing carrying a distinctive feature. Say the shape beside it.

> `bulk gharial with a long narrow gharial snout` → a generic crocodile.
> `bulk gharial with an extremely long thin tube-shaped snout, a narrow needle-like jaw far longer
> than the head is wide` → a gharial.

Both were generated. The second is `assets/raw/palette-trials/pt-fenmaw-b.png`, the first is
`pt-fenmaw.png`, same seed, same graph, same class view.

**Why the obvious fix does not work.** §9.2 already says "front-load and repeat distinctive anatomy",
and the failing prompt above *did* front-load and repeat it — twice. Repetition is not the missing
piece. This model reads the specialist term as its common relative (`gharial` → crocodile), so
repeating the term only repeats the wrong animal. The same collapse is visible across the trial set:
`lungfish` → a generic fish blob, the `wyrm` of `spider-wyrm` → gone, leaving a plain spider,
`spore-antlered` → plain deer antlers, `eyeless` → a serpent with large eyes, `will-o-wisp` → an
ordinary black cat, `dusk moth` → butterfly filaments, `mudball tadpole` → a bipedal blob with no
tail. Every one of those is six shipped sprites (three age forms × front/back).

**How to apply it.** Subjects are DERIVED, so never hand-edit a `rows[].subject` or `rows[].prompt`:
edit `manifest._concepts.<DexName>.text` and run `npx tsx tools/comfy/comfy-batch.ts rebuild`.
`tests/unit/manifest.test.ts` asserts the committed rows equal a fresh derivation, so a hand-edit is
caught. Seeds are pure in `(id, version)`, so rewording a subject moves no seed and does not engage
G5. Record the evidence in that concept's `source` field — say whether the fix was verified
generatively or only reasoned.

**The boundary this must not cross (G2).** You are changing the PROMPT that generates the art, never
the creature. The bible's name, type, role, habitat and concept term stay exactly as they are and
stay *in* the string. Restating "gharial" as its own geometry is a pipeline fidelity fix; deciding
that Fenmaw is some other animal is a G2 violation. If the bible's term does not fix an anatomy —
`vent basilisk` reads as a mythic serpent or a crested lizard and the bible names neither — then
there is nothing to restate, and inventing one to make the generator happy is the violation. Leave it
and flag it for a supervised first generation instead; `_concepts.Pyrelisk.source` is the worked
example.

Logged as `manifest._deviations` **LB-M9** and `docs/DEVIATIONS-lane-b.md` **B-D33**.

## Not yet built

- **img2img graph** — does not exist and cannot be retrieved; it was never trialled. Build it from
  the stock Comfy Cloud img2img template with the same model/settings (VAEEncode + LoadImage
  replacing `EmptySD3LatentImage`, denoise < 1.0). Its first run — map year-variant (§9.5) or the
  walk-cycle trial (§9.6) — is a **SUPERVISED validation gate**, same standing as the painted-dex
  trial (§9.4).
- **Cloud API client + manifest runner** — build order B1, gated behind B0.
