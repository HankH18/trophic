# tools/artverify — contextual review of generated art

The repo already had three image checks and none of them can answer the question a human asks
first. `tools/overlay-diff` measures whether a year variant moved the layout. `tools/postprocess`
checks palette fit, idempotency and background tolerance. `tests/unit/manifest.test.ts` checks that
a row's prompt was assembled from the right authored block. All three can be green over a picture
of the wrong town.

What is missing is the contextual pass: **does this image make sense for the thing it is supposed
to be, and does it belong with the others in its class.** That is a judgement, so it is made by a
model that can see the image, against a written rubric — not by a threshold.

## Two lenses, deliberately separate

**Per-image (`verdict`)** — one reviewer per image, holding the image, the exact prompt that made
it, the node's own shipped data (adjacency, props, biome) and the mechanical art contracts. It
answers: is this the right place, is the centre standable, are the edge exits the ones adjacency
says, is every prop in the picture, is anything at a size the player could not see.

**Whole-class (`cohesion`)** — one reviewer holding every image in the class at once plus the
approved references. It answers only: does any one of these read as coming from a different game.
This lens is separate because an image can be individually perfect and still be the outlier, and a
per-image reviewer structurally cannot see that.

## Running it

    Workflow({ scriptPath: 'tools/artverify/verify.js', args: <spec> })

    spec = {
      className:  "map-town",
      rubric:     "<what a pass looks like for this class>",
      references: ["assets/approved-trials/player-APPROVED.png", …],   // optional
      images:     [{ id, path, prompt, intent, contract }]             // contract is free text
    }

`intent` is what this specific image was supposed to be; `contract` is anything mechanical that
applies to this image alone (its adjacency, its props, its spawn constraint). Both reach the
reviewer verbatim.

## What it is not

It is not a gate. It returns verdicts and defects; deciding what to regenerate is the caller's.
Nothing here writes to `manifest.json`, and a REJECT here does not move a row's status — build-doc
§8.4 and G5 own that, and a reviewer that could silently reseed a row would be a way around them.
