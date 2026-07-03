#!/usr/bin/env python3
# Warrior (Clarice) WALK 8-dir — put the fiery blade on the TRAILING side + fix the
# back-view nape band.
#
# Requested look: the blade hangs BEHIND the direction of travel — walk right (E) → blade
# on the LEFT; walk left (W) → blade on the RIGHT (and the same for the diagonals by their
# horizontal component). The hand-authored sheet had E/W/NE/NW with the blade on the
# LEADING side; SE/SW were already trailing. We also darken the bright grey nape band on
# the N (back) row so the back reads as the hood/cape instead of a glaring grey bar.
#
# Implementation: per affected row, lift the torch pixels (warm flame/ember/glow, lower
# body only), erase+inpaint them with the surrounding cloak, and re-stamp them TRANSLATED
# to the trailing side WITHOUT flipping — the blade keeps its authored orientation (pale
# base + flame licking the natural way), it just moves to the other side of the body. Only
# rows whose blade is on the WRONG side move, so the script is idempotent. Nothing above
# the waist (head/hat/face/eye-mark) is touched.
#
#   python3 tools/warrior-walk8-blade-trailing.py --report   # dry run
#   python3 tools/warrior-walk8-blade-trailing.py            # apply in place
import sys
from PIL import Image

SHEET = "assets/erw/hero/classes/warrior_walk8.png"
ROWS, FC = 8, 8
BUCKETS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"]
REPORT = "--report" in sys.argv
CENTER = 68            # mirror axis (≈ body centroid CLASS_AX=65, tuned to stay in-frame)
TORCH_Y_MIN = 104      # blade lives below the head; never touch y<104 (identity band)
# desired trailing side per facing row (by horizontal movement component); None = leave
DESIRED = {0: "L", 1: "L", 7: "L", 3: "R", 4: "R", 5: "R"}
# N (back) nape band recolour: bright grey hair -> muted hood tone
NAPE = {(169, 178, 162, 255): (74, 64, 78, 255),
        (122, 128, 117, 255): (52, 44, 56, 255)}


def is_torch(p):
    r, g, b, a = p
    if a <= 20:
        return False
    if r > 120 and r > b + 35:
        return True
    if r > 170 and g > 150 and b > 110:
        return True
    return False


def nearest_cloak(px, ox, oy, x, y, cw, ch, rad=8):
    for rad_i in range(1, rad + 1):
        best = None
        for dy in range(-rad_i, rad_i + 1):
            for dx in range(-rad_i, rad_i + 1):
                if max(abs(dx), abs(dy)) != rad_i:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < cw and 0 <= ny < ch:
                    p = px[ox + nx, oy + ny]
                    if p[3] > 20 and not is_torch(p):
                        d = dx * dx + dy * dy
                        if best is None or d < best[0]:
                            best = (d, p)
        if best:
            return best[1]
    return (0, 0, 0, 0)


def main():
    im = Image.open(SHEET).convert("RGBA")
    W, H = im.size
    cw, ch = W // FC, H // ROWS
    px = im.load()
    changed = 0
    for r in range(ROWS):
        want = DESIRED.get(r)
        if not want:
            continue
        oy = r * ch
        # current blade centroid across the row
        allx = [x for f in range(FC) for y in range(TORCH_Y_MIN, ch)
                for x in range(cw) if is_torch(px[f * cw + x, oy + y])]
        if not allx:
            continue
        cx = sum(allx) / len(allx)
        side = "L" if cx < 65 else "R"
        if side == want:
            continue  # already trailing -> idempotent skip
        print(f"  {BUCKETS[r]:3}: blade on {side}, want {want} -> translate to x~{2 * CENTER - int(cx)}")
        changed += 1
        if REPORT:
            continue
        for f in range(FC):
            ox = f * cw
            pts = [(x, y, px[ox + x, oy + y]) for y in range(TORCH_Y_MIN, ch)
                   for x in range(cw) if is_torch(px[ox + x, oy + y])]
            if not pts:
                continue
            fcx = sum(x for x, _, _ in pts) / len(pts)   # per-frame centroid
            delta = int(round(2 * CENTER - 2 * fcx))     # move to mirrored position, keep orientation
            for x, y, _ in pts:               # erase old blade, fill with cloak
                px[ox + x, oy + y] = nearest_cloak(px, ox, oy, x, y, cw, ch)
            for x, y, col in pts:             # re-stamp TRANSLATED (same shape, trailing side)
                nx = x + delta
                if 0 <= nx < cw:
                    px[ox + nx, oy + y] = col
    # N (back) nape band recolour
    oy = 6 * ch
    nape_px = 0
    for f in range(FC):
        ox = f * cw
        for y in range(ch):
            for x in range(cw):
                p = px[ox + x, oy + y]
                if p in NAPE:
                    nape_px += 1
                    if not REPORT:
                        px[ox + x, oy + y] = NAPE[p]
    if nape_px:
        print(f"  N  : darken nape band ({nape_px}px)")
        changed += 1
    print(f"{'[report] would change' if REPORT else 'changed'} {changed} item(s)")
    if not REPORT and changed:
        im.save(SHEET)
        print(f"wrote {SHEET}")


if __name__ == "__main__":
    main()
