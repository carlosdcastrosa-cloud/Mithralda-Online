#!/usr/bin/env python3
# Warrior (Clarice) WALK 8-dir sword/torch fix.
#
# The hand-authored 8-direction walk sheet (CAS-405, re-rowed by CAS-431) relocates
# the warrior's fiery blade/torch per facing to read direction. In the E/W/NW/NE rows,
# frames 0 and 4 left a small DISCONNECTED torch stub behind (the dim ember tail fell
# outside the bright-flame erase rect during authoring). On screen this reads as the
# "sword" looking cut off / out of place when the warrior changes direction
# ("se ve cortada o fuera de lugar").
#
# Fix: per walk cell, keep only the main (largest) torch blob; any small, far
# disconnected torch component is a leftover stub -> repaint it with the surrounding
# cloak (nearest opaque non-torch neighbour) so the silhouette stays clean. Idempotent
# and re-runnable; only touches stray warm pixels, never the head/cloak/hat identity.
#
#   python3 tools/warrior-walk8-torch-fix.py --report   # dry run, list components
#   python3 tools/warrior-walk8-torch-fix.py            # apply in place
import sys
from collections import deque
from PIL import Image

SHEET = "assets/erw/hero/classes/warrior_walk8.png"
ROWS, FC = 8, 8
BUCKETS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"]
REPORT = "--report" in sys.argv
# The torch/blade only ever occupies the lower body. The head band (crimson hat trim)
# and the red eye-mark are ALSO warm-coloured, so any torch mask must stay strictly
# below the head to avoid touching the character's identity. The authored head sits at
# y<=114 across the whole gait bob; the blade never rises above ~y115. The leftover
# stub sits at y120-135, so a y>=117 floor keeps the stub in range while excluding the
# warm bottom edge of the face/eye-mark (a size~18 blob at y112-114 that also shows up
# in the non-buggy S/SE/SW frames and must never be touched).
TORCH_Y_MIN = 117


def is_torch(p):
    """Warm flame / ember / pale-glow colour (used to avoid inpainting FROM the torch)."""
    r, g, b, a = p
    if a <= 20:
        return False
    if r > 120 and r > b + 35:          # warm flame / ember core
        return True
    if r > 170 and g > 150 and b > 110:  # pale glow halo
        return True
    return False


def components(mask, W, H, bridge=2):
    """8-connected components, bridging gaps up to `bridge` px so a flame core and its
    halo stay one blob while a far-away stub stays separate."""
    seen = [[False] * W for _ in range(H)]
    comps = []
    for sy in range(H):
        for sx in range(W):
            if not mask[sy][sx] or seen[sy][sx]:
                continue
            q = deque([(sx, sy)])
            seen[sy][sx] = True
            comp = []
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dy in range(-bridge, bridge + 1):
                    for dx in range(-bridge, bridge + 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < W and 0 <= ny < H and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            q.append((nx, ny))
            comps.append(comp)
    return comps


def nearest_fill(px, x, y, W, H, r=5):
    """Colour of the nearest opaque, non-torch pixel within radius r (else transparent)."""
    for rad in range(1, r + 1):
        best = None
        for dy in range(-rad, rad + 1):
            for dx in range(-rad, rad + 1):
                if max(abs(dx), abs(dy)) != rad:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    p = px[nx, ny]
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
    total_removed = 0
    for r in range(ROWS):
        for f in range(FC):
            ox, oy = f * cw, r * ch
            # only consider torch pixels strictly below the head band (see TORCH_Y_MIN)
            mask = [[(y >= TORCH_Y_MIN and is_torch(px[ox + x, oy + y]))
                     for x in range(cw)] for y in range(ch)]
            comps = components(mask, cw, ch)
            if len(comps) <= 1:
                continue
            comps.sort(key=len, reverse=True)
            main_comp = comps[0]
            mcx = sum(x for x, _ in main_comp) / len(main_comp)
            mcy = sum(y for _, y in main_comp) / len(main_comp)
            for c in comps[1:]:
                ccx = sum(x for x, _ in c) / len(c)
                ccy = sum(y for _, y in c) / len(c)
                gap = ((ccx - mcx) ** 2 + (ccy - mcy) ** 2) ** 0.5
                # a real fragment: clearly smaller than the main blob AND detached from it
                if len(c) < 0.6 * len(main_comp) and gap > 15:
                    bb = (min(x for x, _ in c), min(y for _, y in c),
                          max(x for x, _ in c), max(y for _, y in c))
                    print(f"  {BUCKETS[r]:3} f{f}: remove stub size={len(c)} "
                          f"bbox=x{bb[0]}-{bb[2]} y{bb[1]}-{bb[3]} gap={gap:.0f}px")
                    total_removed += 1
                    if not REPORT:
                        for x, y in c:
                            px[ox + x, oy + y] = nearest_fill(px, ox + x, oy + y, W, H)
    print(f"{'[report] would remove' if REPORT else 'removed'} {total_removed} stub(s)")
    if not REPORT and total_removed:
        im.save(SHEET)
        print(f"wrote {SHEET}")


if __name__ == "__main__":
    main()
