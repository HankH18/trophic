"""look.py — contact sheets of the material candidates, at sizes a decision can
be made at. Nothing here composes a map; it exists so the ground-material choice
for '.' and 'o' is made by looking rather than by argument.

Scope: assets/raw/_trials/tiles/v2/compose/ only.
"""

import os
import sys

from PIL import Image

import lib

HERE = os.path.dirname(os.path.abspath(__file__))

FIELDS = [
    ("ground", ["short-grass-%d" % i for i in range(1, 9)]),
    ("ground", ["tall-grass-%d" % i for i in range(1, 9)]),
    ("ground", ["turf-%d" % i for i in range(1, 9)]),
    ("ground", ["plaza-%d" % i for i in range(1, 9)]),
    ("path", ["path-1", "path-2", "path-3", "path-4"]),
    ("path", ["pave-1", "pave-2", "pave-3"]),
    ("path", ["mouth-1", "mouth-2"]),
    ("nature", ["o-1", "o-2"]),
    ("nature", ["water-1", "water-2", "water-3"]),
    ("nature", ["T-mass-1", "T-mass-2", "T-mass-3"]),
    ("nature", ["R-1", "R-2", "R-3"]),
    ("nature", ["T-crown-1", "bush-1", "bush-2"]),
]


def field(fam, names, cols=8, rows=8, scale=1):
    """A cols x rows patch of one material, variants chosen the way the composer
    chooses them, so the sheet shows the LATTICE the map will have."""
    im = Image.new("RGB", (cols * 16, rows * 16))
    px = im.load()
    for r in range(rows):
        for c in range(cols):
            name = lib.pick(names, c, r, "ground:look")
            src = lib.load(fam, name).load()
            o = lib.fnv("orient|%s|%d|%d" % (name, c, r)) % 4
            for y in range(16):
                for x in range(16):
                    sx = 15 - x if o & 1 else x
                    sy = 15 - y if o & 2 else y
                    px[c * 16 + x, r * 16 + y] = src[sx, sy]
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    return im


def sheet(out, scale):
    pad = 6
    tiles = [field(f, n, scale=scale) for f, n in FIELDS]
    w = max(t.width for t in tiles)
    per = 4
    cols = per
    rows = (len(tiles) + per - 1) // per
    im = Image.new("RGB", (cols * (w + pad) + pad, rows * (tiles[0].height + pad) + pad),
                   (0x04, 0x03, 0x08))
    for i, t in enumerate(tiles):
        x = pad + (i % per) * (w + pad)
        y = pad + (i // per) * (t.height + pad)
        im.paste(t, (x, y))
    im.save(out)
    print("wrote", out, im.size)


def pieces(out, scale=4):
    hues = ["green", "red", "blue", "ochre"]
    names = ["roof-top-left", "roof-top", "roof-top-right", "roof-left", "roof-body",
             "roof-right", "ridge-left", "ridge", "ridge-right", "gable",
             "eave-left", "eave", "eave-right",
             "wall-mid-left", "wall-mid", "wall-mid-window", "wall-mid-right",
             "wall-left", "wall-plain", "wall-window", "wall-right", "door-leaf"]
    n = 16 * scale
    im = Image.new("RGB", (len(names) * n, len(hues) * n), (0x04, 0x03, 0x08))
    for r, hue in enumerate(hues):
        for c, nm in enumerate(names):
            t = lib.load("hd:" + hue, nm).resize((n, n), Image.NEAREST)
            im.paste(t, (c * n, r * n))
    im.save(out)
    print("wrote", out, im.size, "cols:", " ".join(names))


if __name__ == "__main__":
    sheet(os.path.join(HERE, "_look-ground-4x.png"), 4)
    sheet(os.path.join(HERE, "_look-ground-1x.png"), 1)
    pieces(os.path.join(HERE, "_look-pieces-4x.png"))
