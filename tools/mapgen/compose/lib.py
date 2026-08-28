"""Shared helpers for the hearthollow tile composer trial.

Scope: assets/raw/_trials/tiles/v2/compose/ only. Nothing here is imported by the game,
by tools/, or by any test. It reads the four tile families the parallel trials cut,
reads tools/mapgen/layouts/*.txt through the SAME conventions tools/mapgen/render.ts
uses, and paints one 1024x1024 PNG.

Determinism (G11): every "random" choice in this file comes from FNV-1a over an
explicit key string built from the cell coordinate. There is no Math.random, no
random module, no clock, no seed file. Running twice gives a byte-identical PNG,
and that is asserted in verify.py.
"""

import json
import os

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), *([".."] * 3)))
TILES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tiles")
HERE = os.path.dirname(os.path.abspath(__file__))


# ── balance: everything about the coordinate space is DERIVED, never assumed ──
def balance_map():
    with open(os.path.join(ROOT, "data", "balance.json")) as fh:
        return json.load(fh)["map"]


def dims():
    """The layout coordinate space, derived the way tools/mapgen/layout.ts layoutDims does.

    cellPx is cross-checked against mapNativePx/cols exactly as layoutDims does, so a
    retune of balance.map moves the layout and this composer together instead of
    silently painting somewhere else.
    """
    m = balance_map()
    cols, rows = int(m["collisionCols"]), int(m["collisionRows"])
    cell, native = int(m["collisionCellPx"]), int(m["mapNativePx"])
    if cols * cell != native or rows * cell != native:
        raise SystemExit(
            "balance.map is inconsistent: %dx%d cells of %dpx do not tile %dpx"
            % (cols, rows, cell, native)
        )
    derived = native // cols
    if derived != cell:
        raise SystemExit("collisionCellPx %d != mapNativePx/cols %d" % (cell, derived))
    return dict(cols=cols, rows=rows, cell=cell, native=native, scale=int(m["mapRenderScale"]),
                vw=int(m["virtualWidth"]), vh=int(m["virtualHeight"]))


# ── the layout file, parsed the way tools/mapgen/layout.ts parseLayout does ───
BODY_SEPARATOR = "---"


def parse_layout(path, d):
    text = open(path).read().replace("\r\n", "\n").split("\n")
    if BODY_SEPARATOR not in text:
        raise SystemExit("%s: no '---' separator (the header and body cannot be told apart, "
                         "because '#' is both the comment marker and the wall character)" % path)
    cut = text.index(BODY_SEPARATOR)
    body = [l for l in text[cut + 1:] if l != ""]
    if len(body) != d["rows"]:
        raise SystemExit("%s: body has %d lines, expected %d" % (path, len(body), d["rows"]))
    for r, line in enumerate(body):
        if len(line) != d["cols"]:
            raise SystemExit("%s: row %d is %d chars, expected %d" % (path, r, len(line), d["cols"]))
    return body


# ── the legend, transcribed from tools/mapgen/legend.ts DEFAULT_LEGEND ────────
# char -> (kind, blocks, anchor). Verbatim from legend.ts; verify.py re-reads
# legend.ts and asserts this table still agrees with it character for character,
# so it cannot drift into a second source of truth.
LEGEND = {
    ".": ("open-ground", False, False),
    ",": ("scrub", False, False),
    ":": ("path-corridor", False, False),
    "o": ("centre-clearing", False, False),
    "~": ("shallow", False, False),
    "#": ("wall", True, False),
    "B": ("building-footprint", True, False),
    "T": ("tree-mass", True, False),
    "W": ("water", True, False),
    "R": ("rock", True, False),
    "F": ("fence", True, False),
    "*": ("prop-anchor", False, True),
    "@": ("spawn-anchor", False, True),
    "^": ("edge-mouth", False, True),
    "D": ("door-anchor", False, True),
}


def blocks(ch):
    return LEGEND[ch][1]


# ── the frozen palette ────────────────────────────────────────────────────────
def palette():
    with open(os.path.join(ROOT, "data", "palette.json")) as fh:
        p = json.load(fh)
    out = []
    for k, v in p.items():
        if k.startswith("_"):
            continue
        if isinstance(v, str) and v.startswith("#") and len(v) == 7:
            out.append(v.lower())
        elif isinstance(v, dict) and isinstance(v.get("hex"), str):
            out.append(v["hex"].lower())
        elif isinstance(v, list):
            for e in v:
                if isinstance(e, str) and e.startswith("#"):
                    out.append(e.lower())
                elif isinstance(e, dict) and isinstance(e.get("hex"), str):
                    out.append(e["hex"].lower())
    return sorted(set(out))


def palette_rgb():
    return [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in palette()]


def snap(rgb, pal):
    """Nearest palette colour. Only ever used on pixels this file itself blends;
    a pixel copied verbatim out of a tile is already an exact palette colour."""
    best, bd = pal[0], 1 << 30
    for p in pal:
        dr, dg, db = rgb[0] - p[0], rgb[1] - p[1], rgb[2] - p[2]
        dd = dr * dr + dg * dg + db * db
        if dd < bd:
            bd, best = dd, p
    return best


# ── determinism: FNV-1a over an explicit key. No Math.random, no random module ─
def fnv(key):
    h = 0x811C9DC5
    for ch in key:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def pick(variants, col, row, salt):
    """Choose one of `variants` from the CELL COORDINATE. Same layout -> same PNG."""
    return variants[fnv("%s|%d|%d" % (salt, col, row)) % len(variants)]


def jitter(col, row, salt, lo, hi):
    """A deterministic integer in [lo, hi] for this cell and purpose."""
    return lo + fnv("%s|%d|%d" % (salt, col, row)) % (hi - lo + 1)


# ── tiles ─────────────────────────────────────────────────────────────────────
# ── where a family's PNGs live ───────────────────────────────────────────────
# The v2 families are the two lanes this recompose exists to bring together:
#   ground/           the DRAWN ground (short-grass, tall-grass, turf, plaza)
#   handdrawn/<hue>/  the DRAWN building family the judge picked outright
# Everything else is still the first round's cut families, unmodified.
FAMILY_DIR = {
    "ground": os.path.join(TILES, "v2", "ground"),
}
for _hue in ("green", "red", "blue", "ochre"):
    FAMILY_DIR["hd:" + _hue] = os.path.join(TILES, "v2", "handdrawn", _hue)


def family_dir(family):
    return FAMILY_DIR.get(family, os.path.join(TILES, family))


def load(family, name):
    path = os.path.join(family_dir(family), name + ".png")
    if not os.path.exists(path):
        raise SystemExit("no such tile: %s/%s (%s)" % (family, name, path))
    im = Image.open(path).convert("RGB")
    if im.size != (16, 16):
        raise SystemExit("%s/%s is %s, expected 16x16" % (family, name, im.size))
    return im


def load_set(family, names):
    return [load(family, n) for n in names]
