# TROPHIC — docs

Six documents. Each answers a different question.

**`build-doc.md`** — *how is this built?*
The canonical source: locked decisions, data schemas, gameplay formulas, the asset
pipeline, the build order and its gates, and the G1–G15 agent guardrails in §16.

**`content-bible.md`** — *what is in the game?*
The canonical source for content: type chart, stats, the move pool, the species roster,
gyms, towns, routes, quests, dialogue plan, audio.
Where the build doc inlines a formula or a schema, the build doc wins.

**`STATUS.md`** — *where does this stand right now?*
The single living document: what is built, what is open, what is next, and what is
waiting on the owner. The only file here that describes a moment in time, and therefore
the only one that has to be kept current.

**`CAST-AND-VOICE.md`** — *who speaks, and how do they sound?*
The prose standard. Read it before writing or editing any player-facing line.

**`TICKETS.md`** — *what is being worked on, and what did Hank decide?*
The work queue. Every ticket carries a ruling he has already made, quoted. These are
decided, not open — do not re-ask them.

**`README.md`** — this file.

## Where the reasons live

A reason that must not be lost belongs in a comment on the code it governs, not in a
document. A comment is read by whoever edits that line; a document is read never.

Same rule for a **measurement**: it belongs with the operator that produced it. Where the
corpus it was measured over is not in the clone — third-party reference captures,
gitignored generator output — the figure lives in `tools/artverify/published-measurements.json`
with its operator, its corpus and its parameters beside it, and CI re-asserts it. A doc may
quote such a figure; it may never be the only copy. `tools/artverify/EVAL-STANDARD.md` is the
standard a figure has to meet before it may be quoted at all.

## History

There is no archive directory. Everything ever removed from `docs/` is in git, and that
is where "why is this the way it is" is answered when the code does not answer it:

    git log -S "<the thing>" -- docs/          # commits that added or removed the claim
    git log --diff-filter=D --name-only -- docs/   # what was removed, and when

## Adding a document

Don't. Current state goes in `STATUS.md`. Work and rulings go in `TICKETS.md`. A rule
that binds future work goes in the canonical document it constrains. A reason goes in the
code, on the line it governs. There is no seventh document — no findings, notes, review,
deviations or handoff file.
