"""verify.py — check the claims this arm makes, in code, before anyone looks.

Four claims, four checks. Each one FAILS LOUDLY rather than printing a warning,
because a warning in a build log is a defect that shipped.

  1  every pixel of every delivered PNG is an exact swatch from data/palette.json
  2  every delivered PNG is exactly 16x16
  3  the twelve names the job asked for exist, in every hue
  4  drawing twice produces byte-identical files — no Math.random, no clock (G11)

It also reports what is actually there rather than what was intended: the
unique-colour count of the mock street, and which swatches the family uses.

Scope: assets/raw/_trials/tiles/v2/handdrawn/ only.
"""

import hashlib
import json
import os
import sys

from PIL import Image

import draw
import street

HERE = draw.HERE
WANTED = ["roof-top-left", "roof-top", "roof-top-right", "roof-body", "ridge", "gable",
          "eave-left", "eave", "eave-right", "wall-plain", "wall-window", "door-leaf"]


def palette_ids():
    with open(os.path.join(draw.ROOT, "data", "palette.json")) as fh:
        return {c["hex"].lower(): c["id"] for c in json.load(fh)["colors"]}


def fail(msg):
    print("FAIL " + msg)
    sys.exit(1)


def main():
    ok = {v: k for k, v in draw.PAL.items()}
    used = {}
    n = 0

    for hue in sorted(draw.HUES):
        d = os.path.join(HERE, hue)
        if not os.path.isdir(d):
            fail("hue directory %s is missing" % hue)
        have = {f[:-4] for f in os.listdir(d) if f.endswith(".png")}
        missing = [w for w in WANTED if w not in have]
        if missing:
            fail("%s is missing the named pieces %s" % (hue, missing))
        for name in sorted(have):
            im = Image.open(os.path.join(d, name + ".png")).convert("RGB")
            if im.size != (draw.N, draw.N):
                fail("%s/%s is %s, expected 16x16" % (hue, name, im.size))
            for count, col in im.getcolors(1 << 16):
                if col not in ok:
                    fail("%s/%s holds %d px of %s, which is not a frozen swatch"
                         % (hue, name, count, col))
                used[ok[col]] = used.get(ok[col], 0) + count
            n += 1

    # 4 — determinism. Redraw every piece from scratch and demand the same bytes.
    for hue in sorted(draw.HUES):
        for name in draw.all_names():
            a = open(os.path.join(HERE, hue, name + ".png"), "rb").read()
            fresh = draw.piece(name, hue).image()
            import io
            buf = io.BytesIO()
            fresh.save(buf, format="PNG")
            if hashlib.sha256(a).hexdigest() != hashlib.sha256(buf.getvalue()).hexdigest():
                fail("%s/%s is not reproducible from draw.py" % (hue, name))

    # 5 — the compat overlay is checked against compose.py ITSELF, not against a
    # remembered list. compose.py is read, never written: it is another arm's file.
    compose_py = os.path.join(draw.ROOT, "assets", "raw", "_trials", "tiles",
                              "compose", "compose.py")
    if os.path.exists(compose_py):
        import ast
        wanted = set()
        tree = ast.parse(open(compose_py).read())
        for node in tree.body:
            if not isinstance(node, ast.Assign):
                continue
            tgt = node.targets[0]
            if not isinstance(tgt, ast.Name) or tgt.id not in (
                    "ROOF_COOL", "ROOF_WARM", "EAVES", "WALL_PLASTER", "WALL_TIMBER", "DOORS"):
                continue
            for e in node.value.elts:
                wanted.add(e.value)
        compat = os.path.join(HERE, "built-compat")
        have = {f[:-4] for f in os.listdir(compat)} if os.path.isdir(compat) else set()
        gap = sorted(wanted - have)
        if gap:
            fail("built-compat/ is missing the names compose.py loads: %s" % gap)
        print("OK  built-compat/ covers all %d names compose.py's own lists ask for"
              % len(wanted))
    else:
        print("SKIP compose.py not found; the compat overlay could not be checked")

    sc, facts = street.street()
    again, _ = street.street()
    if sc.im.tobytes() != again.im.tobytes():
        fail("the mock street is not deterministic")
    scene_cols = {c for _, c in sc.im.getcolors(1 << 20)}
    stray = [c for c in scene_cols if c not in ok]
    if stray:
        fail("the mock street holds off-palette %r" % stray)

    print("OK  %d PNGs, all 16x16, all on the frozen 32" % n)
    print("OK  the twelve named pieces exist in all %d hues" % len(draw.HUES))
    print("OK  redrawing reproduces every file byte for byte")
    print("OK  the mock street is byte-identical on a second composition")
    print()
    ids = palette_ids()
    print("the family uses %d of the 32 frozen swatches:" % len(used))
    for k in sorted(used, key=lambda k: -used[k]):
        print("   %-4s %s %6d px" % (ids[k], k, used[k]))
    print()
    print("the mock street holds %d unique colours in 240x160" % len(scene_cols))
    return dict(pngs=n, swatches={ids[k]: k for k in sorted(used)},
                street_colours=len(scene_cols))


if __name__ == "__main__":
    report = main()
    with open(os.path.join(HERE, "_verify.json"), "w") as fh:
        json.dump(report, fh, indent=2, sort_keys=True)
