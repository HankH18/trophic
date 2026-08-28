"""deliver.py — the review images, and the player-window crops the judging
happens in.

The camera window is the thing that decides: the player sees 240x160 NATIVE at a
time = 15 x 10 collision cells. A whole 1024 map shrunk to fit a page is a
picture nobody will ever see; a 240x160 crop is the picture the game shows.

Scope: assets/raw/_trials/tiles/v2/compose/ only, plus ~/Downloads/trophic-review/.
"""

import json
import os
import re
import sys

from PIL import Image

import compose
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.expanduser("~/Downloads/trophic-review")
LAYOUTS = os.path.join(lib.TILES, "layouts")

VW, VH = 240, 160          # what the player sees, in native px
INK = (0x04, 0x03, 0x08)
PAPER = (0xD2, 0xE0, 0xE2)   # c02
RED = (0xC7, 0x2A, 0x1B)     # c08


# ── a 5x7 pixel alphabet, for LABELS ON THE SHEET — never on a tile ──────────
FONT = {
    " ": ["     "] * 7,
    "A": [" 111 ", "1   1", "1   1", "11111", "1   1", "1   1", "1   1"],
    "B": ["1111 ", "1   1", "1111 ", "1   1", "1   1", "1   1", "1111 "],
    "C": [" 1111", "1    ", "1    ", "1    ", "1    ", "1    ", " 1111"],
    "D": ["1111 ", "1   1", "1   1", "1   1", "1   1", "1   1", "1111 "],
    "E": ["11111", "1    ", "1111 ", "1    ", "1    ", "1    ", "11111"],
    "F": ["11111", "1    ", "1111 ", "1    ", "1    ", "1    ", "1    "],
    "G": [" 1111", "1    ", "1    ", "1  11", "1   1", "1   1", " 1111"],
    "H": ["1   1", "1   1", "11111", "1   1", "1   1", "1   1", "1   1"],
    "I": ["11111", "  1  ", "  1  ", "  1  ", "  1  ", "  1  ", "11111"],
    "J": ["11111", "   1 ", "   1 ", "   1 ", "   1 ", "1  1 ", " 11  "],
    "K": ["1   1", "1  1 ", "1 1  ", "11   ", "1 1  ", "1  1 ", "1   1"],
    "L": ["1    ", "1    ", "1    ", "1    ", "1    ", "1    ", "11111"],
    "M": ["1   1", "11 11", "1 1 1", "1   1", "1   1", "1   1", "1   1"],
    "N": ["1   1", "11  1", "1 1 1", "1  11", "1   1", "1   1", "1   1"],
    "O": [" 111 ", "1   1", "1   1", "1   1", "1   1", "1   1", " 111 "],
    "P": ["1111 ", "1   1", "1   1", "1111 ", "1    ", "1    ", "1    "],
    "Q": [" 111 ", "1   1", "1   1", "1   1", "1 1 1", "1  1 ", " 11 1"],
    "R": ["1111 ", "1   1", "1   1", "1111 ", "1 1  ", "1  1 ", "1   1"],
    "S": [" 1111", "1    ", "1    ", " 111 ", "    1", "    1", "1111 "],
    "T": ["11111", "  1  ", "  1  ", "  1  ", "  1  ", "  1  ", "  1  "],
    "U": ["1   1", "1   1", "1   1", "1   1", "1   1", "1   1", " 111 "],
    "V": ["1   1", "1   1", "1   1", "1   1", "1   1", " 1 1 ", "  1  "],
    "W": ["1   1", "1   1", "1   1", "1 1 1", "1 1 1", "11 11", "1   1"],
    "X": ["1   1", "1   1", " 1 1 ", "  1  ", " 1 1 ", "1   1", "1   1"],
    "Y": ["1   1", "1   1", " 1 1 ", "  1  ", "  1  ", "  1  ", "  1  "],
    "Z": ["11111", "    1", "   1 ", "  1  ", " 1   ", "1    ", "11111"],
    "0": [" 111 ", "1   1", "1  11", "1 1 1", "11  1", "1   1", " 111 "],
    "1": ["  1  ", " 11  ", "  1  ", "  1  ", "  1  ", "  1  ", " 111 "],
    "2": [" 111 ", "1   1", "    1", "   1 ", "  1  ", " 1   ", "11111"],
    "3": ["1111 ", "    1", "    1", " 111 ", "    1", "    1", "1111 "],
    "4": ["   1 ", "  11 ", " 1 1 ", "1  1 ", "11111", "   1 ", "   1 "],
    "5": ["11111", "1    ", "1111 ", "    1", "    1", "1   1", " 111 "],
    "6": [" 111 ", "1    ", "1    ", "1111 ", "1   1", "1   1", " 111 "],
    "7": ["11111", "    1", "   1 ", "  1  ", " 1   ", " 1   ", " 1   "],
    "8": [" 111 ", "1   1", "1   1", " 111 ", "1   1", "1   1", " 111 "],
    "9": [" 111 ", "1   1", "1   1", " 1111", "    1", "    1", " 111 "],
    "-": ["     ", "     ", "     ", "11111", "     ", "     ", "     "],
    ".": ["     ", "     ", "     ", "     ", "     ", " 11  ", " 11  "],
    ",": ["     ", "     ", "     ", "     ", " 11  ", " 11  ", " 1   "],
    "(": ["   1 ", "  1  ", " 1   ", " 1   ", " 1   ", "  1  ", "   1 "],
    ")": [" 1   ", "  1  ", "   1 ", "   1 ", "   1 ", "  1  ", " 1   "],
    ":": ["     ", " 11  ", " 11  ", "     ", " 11  ", " 11  ", "     "],
    "/": ["    1", "    1", "   1 ", "  1  ", " 1   ", "1    ", "1    "],
    "x": ["     ", "     ", "1   1", " 1 1 ", "  1  ", " 1 1 ", "1   1"],
    "+": ["     ", "  1  ", "  1  ", "11111", "  1  ", "  1  ", "     "],
    "'": ["  1  ", "  1  ", "     ", "     ", "     ", "     ", "     "],
    "%": ["11  1", "11  1", "   1 ", "  1  ", " 1   ", "1  11", "1  11"],
}


def text(im, x, y, s, scale=2, fg=INK):
    """Labels on the SHEET, drawn in a hand-built 5x7 alphabet. No tile carries a
    glyph — that defect killed several generated rounds and is not being drawn
    back in; this ink lands on the sheet's own margin, never inside a map crop."""
    px = im.load()
    cx = x
    for chch in s:
        g = FONT.get(chch, FONT.get(chch.upper(), FONT[" "]))
        for ry, row in enumerate(g):
            for rx, bit in enumerate(row):
                if bit != "1":
                    continue
                for a in range(scale):
                    for b in range(scale):
                        xx, yy = cx + rx * scale + a, y + ry * scale + b
                        if 0 <= xx < im.width and 0 <= yy < im.height:
                            px[xx, yy] = fg
        cx += 6 * scale
    return cx


def scaled(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def window(png, cell_c, cell_r, cell=16, k=3):
    """The 240x160 the player actually sees, centred as near (cell_c,cell_r) as
    the map edge allows, then NEAREST-magnified for the sheet."""
    im = Image.open(png).convert("RGB")
    x = min(max(cell_c * cell + cell // 2 - VW // 2, 0), im.width - VW)
    y = min(max(cell_r * cell + cell // 2 - VH // 2, 0), im.height - VH)
    return scaled(im.crop((x, y, x + VW, y + VH)), k), (x, y)


def stack(rows, pad=10, label_h=26, bg=INK, fg=PAPER):
    """Vertical layout that keeps each row's OWN size. frame() pads every cell to
    the largest, which is right for a grid of equal crops and wrong for a 1024
    map above a pair of 480x320 windows."""
    laid = []
    for row in rows:
        w = sum(t.width for t, _ in row) + pad * (len(row) - 1)
        h = max(t.height for t, _ in row)
        laid.append((row, w, h))
    W = max(w for _, w, _ in laid) + pad * 2
    H = sum(h + label_h + pad for _, _, h in laid) + pad
    im = Image.new("RGB", (W, H), bg)
    y = pad
    for row, w, h in laid:
        x = pad
        for t, cap in row:
            text(im, x, y + 4, cap, 2, fg)
            im.paste(t, (x, y + label_h))
            x += t.width + pad
        y += h + label_h + pad
    return im


def frame(tiles, cols, pad=10, label_h=26, bg=INK, fg=PAPER):
    """A grid of (image, caption) with the caption in the margin above each."""
    w = max(t[0].width for t in tiles)
    h = max(t[0].height for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    im = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + label_h + pad) + pad), bg)
    for i, (t, cap) in enumerate(tiles):
        x = pad + (i % cols) * (w + pad)
        y = pad + (i // cols) * (h + label_h + pad)
        text(im, x, y + 4, cap, 2, fg)
        im.paste(t, (x, y + label_h))
    return im


# ── the collision overlay ────────────────────────────────────────────────────
def overlay(png, comp, k=1):
    """Red wash on every cell the mask calls blocked, nothing on any cell it
    calls walkable. Drawn from comp.blocked(), which reads the same layout the
    engine's gridFromAscii reads — so a red cell the player can walk into, or a
    clear cell they cannot, is a real disagreement and not a drawing choice."""
    im = Image.open(png).convert("RGB")
    px = im.load()
    n = comp.cell
    for r in range(comp.rows):
        for c in range(comp.cols):
            if not comp.blocked(c, r):
                continue
            for y in range(n):
                for x in range(n):
                    xx, yy = c * n + x, r * n + y
                    cur = px[xx, yy]
                    px[xx, yy] = ((cur[0] + RED[0] * 2) // 3,
                                  (cur[1] + RED[1]) // 3,
                                  (cur[2] + RED[2]) // 3)
    return scaled(im, k) if k != 1 else im


# ── where the four player windows go ─────────────────────────────────────────
def pick_windows(comp):
    """One arrival tile, one on a building, one on an encounter patch, one on a
    path junction — chosen from the layout, not by taste."""
    out = []
    cols, rows = comp.cols, comp.rows

    out.append((32, 32, "ARRIVAL (32,32)"))

    # A building: the footprint whose door anchor is nearest the arrival tile, so
    # the window is one the player really reaches, framed on the door.
    best = None
    for comp_cells in comp.building_components():
        c0 = min(c for c, _ in comp_cells)
        c1 = max(c for c, _ in comp_cells)
        r1 = max(r for _, r in comp_cells)
        cc, rr = (c0 + c1) // 2, r1 - 1
        d = (cc - 32) ** 2 + (rr - 32) ** 2
        if best is None or d < best[0]:
            best = (d, cc, rr)
    out.append((best[1], best[2], "BUILDING (%d,%d)" % (best[1], best[2])))

    # An encounter patch: the centroid of the largest 4-connected run of ','.
    scrub = [(c, r) for r in range(rows) for c in range(cols)
             if comp.resolve_char(c, r) == ","]
    if scrub:
        seen, best_run = set(), []
        for s in scrub:
            if s in seen:
                continue
            stack, run = [s], []
            seen.add(s)
            while stack:
                c, r = stack.pop()
                run.append((c, r))
                for nc, nr in ((c + 1, r), (c - 1, r), (c, r + 1), (c, r - 1)):
                    if (nc, nr) in seen or (nc, nr) not in set(scrub):
                        continue
                    seen.add((nc, nr))
                    stack.append((nc, nr))
            if len(run) > len(best_run):
                best_run = run
        cc = sum(c for c, _ in best_run) // len(best_run)
        rr = sum(r for _, r in best_run) // len(best_run)
        out.append((cc, rr, "ENCOUNTER (%d,%d) %d CELLS" % (cc, rr, len(best_run))))
    else:
        out.append((32, 32, "NO ENCOUNTER GROUND ON THIS MAP"))

    # A junction: a lane cell with the most lane ARMS — a neighbour that itself
    # continues in the same direction, so a wide stretch of decking does not
    # count as a four-way fork. Ties break on distance from the arrival window,
    # farthest first, so the sheet does not show the same ground twice.
    def is_path(c, r):
        return comp.ground_class(c, r) == "path"
    # A 6-cell margin, because a "junction" found at row 2 is the edge-mouth
    # corridor and the window round it is half off the map.
    cands = []
    for r in range(6, rows - 6):
        for c in range(6, cols - 6):
            if not is_path(c, r):
                continue
            arms = sum(1 for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1))
                       if is_path(c + dc, r + dr) and is_path(c + 2 * dc, r + 2 * dr))
            far = (c - 32) ** 2 + (r - 32) ** 2
            cands.append((arms, far, c, r))
    if cands:
        cands.sort(key=lambda t: (-t[0], -t[1], t[2], t[3]))
        arms, _, c, r = cands[0]
        out.append((c, r, "JUNCTION (%d,%d) %d ARMS" % (c, r, arms)))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    maps = {}
    for name, num in (("hearthollow", 40), ("brackwater", 41)):
        layout = os.path.join(LAYOUTS, name + ".txt")
        png = os.path.join(HERE, "_out-%s.png" % name)
        comp, stats = compose.compose(layout, png)
        maps[name] = (comp, stats, png)

        # T2-40 / T2-41 — the map itself. The whole 1024 at 1:1, then two of the
        # 240x160 windows the player is actually inside, because nobody ever sees
        # the map whole and a sheet that only shows it whole is not evidence.
        full = Image.open(png).convert("RGB")
        picks = pick_windows(comp)
        wins = [(window(png, c, r, k=2)[0], cap) for (c, r, cap) in picks[:2]]
        sheet = stack([[(full, "%s — THE WHOLE 1024x1024 MAP AT 1:1" % name.upper())], wins])
        out = os.path.join(OUT, "T2-%d-%s-v2.png" % (num, name))
        sheet.save(out)
        print("wrote", out, sheet.size)

    # T2-42 — the collision overlay, both maps.
    tiles = []
    for name in ("hearthollow", "brackwater"):
        comp, _, png = maps[name]
        ov = overlay(png, comp)
        tiles.append((ov, "%s — RED = BLOCKED BY THE MASK" % name.upper()))
    sheet = frame(tiles, cols=2)
    out = os.path.join(OUT, "T2-42-collision-overlay-v2.png")
    sheet.save(out)
    print("wrote", out, sheet.size)

    # T2-43 — four player windows per map, at 3x.
    tiles = []
    for name in ("hearthollow", "brackwater"):
        comp, _, png = maps[name]
        for (c, r, cap) in pick_windows(comp):
            w, _ = window(png, c, r, k=3)
            tiles.append((w, "%s %s" % (name[:4].upper(), cap)))
    sheet = frame(tiles, cols=4)
    out = os.path.join(OUT, "T2-43-player-windows-v2.png")
    sheet.save(out)
    print("wrote", out, sheet.size)


if __name__ == "__main__":
    main()
