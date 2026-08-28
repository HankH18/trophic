"""compare.py — our street beside the reference, both 240x160, both at 1:1.

The only honest test of a 16px tile is the reference at the same size on the
same screen. Everything looks fine at 8x. This puts New Bark Town's own
240x160 next to ours, unscaled, and then repeats the pair at 3x for detail.

The reference crop is READ ONLY and is never written back anywhere.

Scope: assets/raw/_trials/tiles/v2/handdrawn/ only.
"""

import os

from PIL import Image, ImageDraw

import draw
import street

HERE = draw.HERE
REF = os.path.join(draw.ROOT, "assets", "reference", "gen2", "new-bark-town-gsc.png")
VW, VH = 240, 160
GAP, PAD, HEAD = 10, 10, 16
BG = (39, 41, 64)
FG = (210, 224, 226)


def reference_window():
    """The 15x10 cells of New Bark that hold the most house per screen."""
    im = Image.open(REF).convert("RGB")
    return im.crop((16, 0, 16 + VW, VH))


def pair(a, b, k, label_a, label_b):
    aa, bb = street.scale(a, k), street.scale(b, k)
    w = PAD + aa.width + GAP + bb.width + PAD
    h = HEAD + max(aa.height, bb.height) + PAD
    out = Image.new("RGB", (w, h), BG)
    out.paste(aa, (PAD, HEAD))
    out.paste(bb, (PAD + aa.width + GAP, HEAD))
    d = ImageDraw.Draw(out)
    d.text((PAD, 4), label_a, fill=FG)
    d.text((PAD + aa.width + GAP, 4), label_b, fill=FG)
    return out


if __name__ == "__main__":
    sc, _ = street.street()
    ref = reference_window()
    rows = [pair(ref, sc.im, 1, "reference 240x160 1:1", "ours 240x160 1:1"),
            pair(ref, sc.im, 3, "reference 3x", "ours 3x")]
    w = max(r.width for r in rows)
    h = sum(r.height for r in rows)
    out = Image.new("RGB", (w, h), BG)
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height
    out.save(os.path.join(HERE, "_compare.png"))
    print("wrote _compare.png  %dx%d" % out.size)
