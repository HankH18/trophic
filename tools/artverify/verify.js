export const meta = {
  name: 'artverify',
  description: 'Contextually review generated art: per-image verdicts plus a whole-class style-cohesion pass',
  phases: [{ title: 'Per-image' }, { title: 'Cohesion' }],
}

const spec = args ?? {}
const images = spec.images ?? []
const className = spec.className ?? 'unknown'
const rubric = spec.rubric ?? ''
const references = spec.references ?? []

/**
 * `specPath` keeps the bulky half of the brief OFF the wire.
 *
 * The per-image brief that actually matters — the exact prompt that produced the file, the node's
 * adjacency, its props and their authored pixel coordinates — runs to tens of kilobytes across a
 * full class, and passing it inline means it is paid for twice: once composing the call and once as
 * the call's own input. So the caller writes a spec file keyed by image id, passes the path, and
 * each reviewer reads its own entry. The reviewer sees exactly the same text either way; only the
 * route changes.
 */
const specPathClause = spec.specPath
  ? `\n## Your brief for THIS image\nRead ${spec.specPath} — a JSON object with an \`images\` array. Find the entry whose \`id\` is exactly "%ID%" and use its \`intent\`, \`prompt\` and \`contract\` fields as the three sections below. Read it BEFORE you judge the image.\n`
  : ''

if (images.length === 0) return { error: 'no images given' }

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'verdict', 'isTheRightPlace', 'defects', 'edgeExits', 'centreOpen', 'readableAtPlayScale', 'oneLine'],
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'REVISE', 'REJECT'] },
    isTheRightPlace: { type: 'string', description: 'Does the picture show the thing the intent describes? Name what is actually there if it does not.' },
    defects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['what', 'where', 'severity', 'promptFix'],
        properties: {
          what: { type: 'string' },
          where: { type: 'string', description: 'Roughly where in the image, in native px or as a ninth of the frame.' },
          severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
          promptFix: { type: 'string', description: 'The wording change that would fix it. The negative prompt is INERT on this graph (cfg 1.0) — a fix that adds a negative term is not a fix.' },
        },
      },
    },
    edgeExits: { type: 'string', description: 'Which edges of the picture a walkable way-out actually reaches, and whether that matches the contract.' },
    centreOpen: { type: 'string', description: 'What occupies the exact centre of the image, and whether a character could stand there.' },
    readableAtPlayScale: { type: 'string', description: 'The player sees a 240x160 native-px window. Name anything too large (one object filling a screen) or too small (under ~16px) to read.' },
    oneLine: { type: 'string', description: 'One sentence a human could act on.' },
  },
}

phase('Per-image')

const verdicts = await parallel(images.map((im) => () =>
  agent(`You are reviewing ONE generated game asset for TROPHIC, a Game-Boy-Color-style
monster-catching RPG. Look at the image and judge it. Be specific and be hard to please — a
reviewer who passes everything is worth nothing.

## The image
Read it with the Read tool: ${im.path}

${specPathClause.replace('%ID%', im.id)}
## What it was supposed to be
${im.intent ?? '(in the spec file above)'}

## Class
${className}

## What a pass looks like for this class
${rubric}

## The exact prompt that produced it
${im.prompt ?? '(in the spec file above)'}

## Mechanical contract for THIS image
${im.contract ?? '(in the spec file above)'}

## Contracts that apply to every map in this game
- Native size 1024 x 1024 px. **The player only ever sees a 240 x 160 native-px window.** A full
  map is 4.3 screens wide and 6.4 tall. One object that fills a whole screen is too big; anything
  under about 16 native px is half a tile and unreadable.
- **The exact centre of the image, native (512,512), must be open standable ground.** The player
  spawns at the walkable tile nearest the centre on every arrival at that node.
- Props are not drawn by the engine — a sign card, antler stone, shrine or idol the node declares
  has to be visible in the painting itself.

## One thing about fixes
The graph runs at cfg 1.0, which disables classifier-free guidance. **The negative prompt is
provably inert** — two generations with wildly different negatives came out byte-identical. So a
\`promptFix\` that proposes adding a term to the negative prompt is not a fix. Every fix is a change
to the positive prompt.

## Verdicts
PASS   — usable as it stands. Minor defects may still be listed.
REVISE — the idea is right and a prompt change would get there.
REJECT — wrong place, wrong style, or a blocking contract violation.

Return the schema. \`id\` must be exactly: ${im.id}`,
    { label: `verify:${im.id}`, phase: 'Per-image', schema: VERDICT })
))

phase('Cohesion')

const COHESION = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'outliers', 'sharedDrift', 'whatHoldsThemTogether', 'lookAlikePairs'],
  properties: {
    verdict: { type: 'string', enum: ['COHERENT', 'OUTLIERS'] },
    outliers: { type: 'string', description: 'Any image that reads as coming from a different game or a different artist. Name it and say what gives it away — palette, line weight, projection, level of detail, shading.' },
    sharedDrift: { type: 'string', description: 'Anything WRONG that all of them share, which a per-image reviewer would never flag because it looks normal in context.' },
    whatHoldsThemTogether: { type: 'string' },
    lookAlikePairs: { type: 'string', description: 'Any two that a player would mistake for each other. For maps this is a defect in itself: each place is supposed to be its own place.' },
  },
}

const cohesion = await agent(`You are judging STYLE COHESION across every image in one class of
generated art for TROPHIC, a Game-Boy-Color-style monster-catching RPG.

Read all of these with the Read tool and look at them together:
${images.map((im) => `  ${im.id}: ${im.path}`).join('\n')}
${references.length ? `\nApproved style references for this project:\n${references.map((r) => `  ${r}`).join('\n')}` : ''}

Class: ${className}
Rubric: ${rubric}

You are NOT judging whether each one is individually good — another reviewer did that, and an
image can be individually perfect and still be the odd one out. Judge only whether they belong
together, and whether any two belong together TOO closely.

Two failure directions, both real:
 · An outlier — one image whose palette, line weight, projection, shading or level of detail
   marks it as from somewhere else.
 · A look-alike pair — for maps this is its own defect. The owner's words: "two of the three towns
   that were drafted look exceptionally similar to each other. We should go and have things look a
   little bit more unique than that." Each place is supposed to be its own place.

Also look for shared drift: something all of them get wrong, which no per-image reviewer would
catch because in context it looks like the house style.`,
  { label: `cohesion:${className}`, phase: 'Cohesion', schema: COHESION })

const clean = verdicts.filter(Boolean)
return {
  className,
  counts: {
    total: images.length,
    reviewed: clean.length,
    pass: clean.filter((v) => v.verdict === 'PASS').length,
    revise: clean.filter((v) => v.verdict === 'REVISE').length,
    reject: clean.filter((v) => v.verdict === 'REJECT').length,
  },
  verdicts: clean,
  cohesion,
}
