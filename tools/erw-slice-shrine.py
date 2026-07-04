#!/usr/bin/env python3
"""Slice the central-shrine props the game uses out of the ERW Ancient Ruins v2.3 Atlas-Props.

The raw Atlas-Props sheets (assets/erw/props/, gitignored) are the purchased source art; the
game ships only the tiny derived cut-outs produced here. Re-run after re-uploading the pack:

    python3 tools/erw-slice-shrine.py

Boxes are pixel bounding rects located once (connected-component scan of Atlas-Props 2.png);
each crop is trimmed to its alpha bbox. Outputs (committed):
  assets/props/erw_altar.png   greek-key canopy shrine  (the plaza centerpiece, wired in)
  assets/props/erw_sun.png     radiant sun ground glyph (wired in, W of the altar)
  assets/props/erw_altar2.png  greek-key altar basin    (alternate centerpiece)
  assets/props/erw_sword.png   mossy fallen-sword monument (alternate centerpiece)
  assets/props/erw_foot.png    colossus foot            (alternate centerpiece)
The crescent moon E of the altar is drawn procedurally in render.js (no moon art in the pack).
"""
import os
from PIL import Image

SRC = "assets/erw/props"
A2 = "Atlas-Props 2.png"

# (file, left, top, right, bottom) rects in the source sheet; trimmed to content bbox on cut.
CUTS = {
    "erw_altar":  (A2,  26,  34, 170, 223),
    "erw_altar2": (A2, 173, 227, 279, 414),
    "erw_sword":  (A2, 617, 580, 726, 848),
    "erw_foot":   (A2, 326, 589, 415, 725),
    "erw_sun":    (A2, 398, 772, 522, 878),
}


def main():
    cache = {}
    for name, (f, l, t, r, b) in CUTS.items():
        im = cache.get(f) or cache.setdefault(f, Image.open(f"{SRC}/{f}").convert("RGBA"))
        cr = im.crop((l, t, r, b))
        bb = cr.getbbox()
        if bb:
            cr = cr.crop(bb)
        cr.save(f"assets/props/{name}.png")
    print(f"sliced {len(CUTS)} shrine props")


if __name__ == "__main__":
    if not os.path.isdir(SRC):
        raise SystemExit(f"missing {SRC}/ — re-upload the ERW Props pack (Atlas-Props sheets) there")
    main()
