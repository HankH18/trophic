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

## Not yet built

- **img2img graph** — does not exist and cannot be retrieved; it was never trialled. Build it from
  the stock Comfy Cloud img2img template with the same model/settings (VAEEncode + LoadImage
  replacing `EmptySD3LatentImage`, denoise < 1.0). Its first run — map year-variant (§9.5) or the
  walk-cycle trial (§9.6) — is a **SUPERVISED validation gate**, same standing as the painted-dex
  trial (§9.4).
- **Cloud API client + manifest runner** — build order B1, gated behind B0.
