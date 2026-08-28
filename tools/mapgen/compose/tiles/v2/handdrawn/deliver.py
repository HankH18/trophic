"""deliver.py — the review sheets, the drop-in aliases, and the manifest.

Nothing here draws a pixel of art. It arranges what draw.py made, writes the
compatibility names compose.py asks for today, records what was decided and
why in manifest.json, and copies the sheets to ~/Downloads/trophic-review/.

Scope: assets/raw/_trials/tiles/v2/handdrawn/ only (plus the delivery copy).
"""

import json
import os
import shutil

from PIL import Image, ImageDraw

import draw
import street

HERE = draw.HERE
OUT = os.path.expanduser("~/Downloads/trophic-review")
BG = (39, 41, 64)
FG = (210, 224, 226)


# ── the names compose.py asks for today ──────────────────────────────────────
# assets/raw/_trials/tiles/compose/compose.py has FOUR roles — roof, eave, wall,
# door — and picks a variant per cell from a flat list. That model cannot say
# which COLUMN a cell is in, so it cannot ask for a corner; and its one eave list
# is shared by every house, so it cannot keep a house's eave in its roof's hue.
#
# So this overlay is deliberately SINGLE-HUE. A red roof over a green eave is
# visibly broken, and shipping that to prove a point would be worse than
# shipping one good green house. The four hues are there the moment the composer
# learns columns; until then it gets green.
#
# It is an OVERLAY on the existing built/ family, not a replacement: compose.py
# also loads built/fence-1..3 for the `F` legend character, and those are not
# this arm's to draw.
COMPAT = {
    "roof-1": ("green", "roof-body"),
    "roof-2": ("green", "roof-body"),
    "roof-3": ("green", "roof-body"),
    "roof-4": ("green", "roof-body"),
    "eave-1": ("green", "eave"),
    "eave-2": ("green", "eave"),
    "eave-3": ("green", "eave"),
    "wall-1": ("green", "wall-plain"),
    "wall-2": ("green", "wall-window"),
    "wall-3": ("green", "wall-plain"),
    "wall-4": ("green", "wall-plain"),
    "door-1": ("green", "door-leaf"),
    "door-2": ("green", "door-leaf"),
}


def write_compat():
    d = os.path.join(HERE, "built-compat")
    os.makedirs(d, exist_ok=True)
    for alias, (hue, name) in COMPAT.items():
        draw.piece(name, hue).image().save(os.path.join(d, alias + ".png"))
    return d


# ── sheets ───────────────────────────────────────────────────────────────────
def framed(images, gap=10, pad=10):
    w = max(i.width for i in images) + pad * 2
    h = sum(i.height for i in images) + gap * (len(images) - 1) + pad * 2
    out = Image.new("RGB", (w, h), BG)
    y = pad
    for i in images:
        out.paste(i, (pad, y))
        y += i.height + gap
    return out


def hue_row():
    """The same footprint, four times, one hue each. This is the answer to
    'five houses are not one house five times' — and it is worth seeing at 1:1,
    because at 1:1 the hue is nearly the only thing telling them apart."""
    cols = 4 * 6 + 3 * 1
    sc = street.Scene(cols, 6)
    sc.grass()
    for i, hue in enumerate(street.HUE_ORDER):
        sc.house(c0=i * 7, r0=0, w=6, h=6, hue=hue)
    sc.south_shadow()
    return sc.im


def label(im, text, pad=10):
    out = Image.new("RGB", (im.width + pad * 2, im.height + pad + 18), BG)
    ImageDraw.Draw(out).text((pad, 4), text, fill=FG)
    out.paste(im, (pad, 18))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    write_compat()

    sc, facts = street.street()
    tall, tall_facts = street.tall_street()

    # T2-10 — the required sheet. No text: it is art being judged at 1:1, and a
    # caption printed beside a 16px tile is a thumb over the lens. Two windows:
    # the four-house street, and the two real layout footprints.
    t10 = framed([sc.im, tall.im, street.scale(sc.im, 3), street.scale(tall.im, 3)])
    t10.save(os.path.join(HERE, "_T2-10.png"))

    hr = hue_row()
    t12 = framed([label(hr, "the same 6x4 footprint, four roof hues, 1:1"),
                  label(street.scale(hr, 3), "and at 3x")])
    t12.save(os.path.join(HERE, "_T2-12.png"))

    t13 = framed([street.contact_sheet()])
    t13.save(os.path.join(HERE, "_T2-13.png"))

    named = [
        ("T2-10-buildings-handdrawn.png", os.path.join(HERE, "_T2-10.png")),
        # Lettered, not numbered: several arms deliver into this one folder and
        # T2-11/12/13 are already spoken for. The required sheet keeps its
        # number; everything supporting it sits under the same number.
        ("T2-10a-buildings-handdrawn-vs-gold.png", os.path.join(HERE, "_compare.png")),
        ("T2-10b-buildings-handdrawn-hues.png", os.path.join(HERE, "_T2-12.png")),
        ("T2-10c-buildings-handdrawn-pieces.png", os.path.join(HERE, "_T2-13.png")),
    ]
    for dest, src in named:
        shutil.copyfile(src, os.path.join(OUT, dest))

    manifest = {
        "arm": "handdrawn",
        "generations": 0,
        "method": (
            "Every pixel is placed by rule in draw.py. Nothing was generated, cut, "
            "traced or retouched. The grammar — row structure, outline weight, the "
            "overhang, the plaster cycle, the window and door construction — was "
            "measured pixel by pixel off assets/reference/gen2/new-bark-town-gsc.png "
            "at 1:1; the colours, the roof hues and the cross-gable are ours."
        ),
        "namedPieces": [
            "roof-top-left", "roof-top", "roof-top-right", "roof-body", "ridge", "gable",
            "eave-left", "eave", "eave-right", "wall-plain", "wall-window", "door-leaf"],
        "extraPieces": {
            "roof-left / roof-right": "roof body carrying the silhouette's side keyline",
            "ridge-left / ridge-right": "the crest row at the roof's own edge",
            "wall-left / wall-right": "the bottom wall course's corner post and stud",
            "wall-mid": "an UPPER wall course, no foundation — see wallCourses below",
            "wall-mid-window": "a window on the upper course, where the reference puts it",
            "wall-mid-left / wall-mid-right": "the upper course's corner post and stud",
        },
        "hues": {k: v for k, v in draw.HUES.items()},
        "hueRamp": "hi (crest) > field > rib > shade (eave only). Four swatches each.",
        "ribStep": (
            "The field-to-rib step is deliberately small. A large step is what turns "
            "a ribbed roof into corrugated sheeting, which is the exact read this "
            "family exists to replace. Structure comes from the crest row, the eave, "
            "the ridge and the outline — not from the ribs."
        ),
        "outline": (
            "c00 #040308 on every face of the silhouette EXCEPT the bottom: the "
            "reference has no bottom keyline, it has a foundation lip standing on "
            "the ground, and copying the lip is what stops the house looking pasted on."
        ),
        "wallCourses": (
            "compose.py spends every row above the eave on roof. The layouts in "
            "tools/mapgen/layouts/ author footprints 6 and 7 cells tall, so that rule "
            "produces 64px of unbroken roof — a barn. street.py gives anything 5 or "
            "more cells tall a SECOND wall course, which is what the reference's own "
            "big house does: windows on the upper course, door on the lower."
        ),
        "compatOverlay": (
            "built-compat/ carries the thirteen names compose.py loads today. It is "
            "SINGLE-HUE on purpose: compose.py's one shared eave list cannot follow a "
            "per-house roof hue, and a red roof over a green eave is worse than one "
            "good green house. It is an overlay on the existing built/ family, not a "
            "replacement — fence-1..3 are not this arm's to draw."
        ),
        "integrationNeeded": (
            "To use the four hues and the corner pieces, compose.py's plan_buildings "
            "needs to report a cell's COLUMN role (left / interior / right) alongside "
            "its row role, and choose the hue once per footprint from the anchor. "
            "street.py::Scene.house is a working reference implementation of both."
        ),
        "text": "none, on any tile, at any size",
        "determinism": (
            "FNV-1a over the footprint anchor decides hue, door column, window "
            "columns, ridge row and gable cell. No Math.random, no random module, no "
            "clock. verify.py redraws everything and byte-compares (G11)."
        ),
        "mockStreet": [
            dict(hue=f["hue"], cells="%dx%d" % f["size"], at=list(f["at"]),
                 wallCourses=f["courses"]) for f in facts],
        "tallWindow": [
            dict(hue=f["hue"], cells="%dx%d" % f["size"], at=list(f["at"]),
                 wallCourses=f["courses"], ridgeRow=f["ridge"]) for f in tall_facts],
        "delivered": [d for d, _ in named],
    }
    with open(os.path.join(HERE, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)

    for dest, _ in named:
        print("delivered", os.path.join(OUT, dest))


if __name__ == "__main__":
    main()
