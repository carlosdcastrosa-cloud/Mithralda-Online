#!/usr/bin/env python3
"""Slice the walled-city tiles the game uses out of the ERW Ancient Ruins v2.3 pack.

The raw ERW tileset sheets (assets/erw/city/, ~5MB, gitignored) are the purchased
source art; the game only ships the tiny derived 32px tiles produced here. Re-run
after re-uploading the pack to regenerate them:

    python3 tools/erw-slice-city.py

Outputs (committed):
  assets/tiles/erw_wall_h.png   mossy sandstone crown over stone brick (N/S ramparts + corners)
  assets/tiles/erw_wall_v.png   stone-brick face w/ faint edge depth (E/W wall runs)
  assets/tiles/erw_flag.png     clean flagstone (plaza floor, variant A)
  assets/tiles/erw_flag2.png    flagstone variant B
  assets/props/erw_fountain.png little wall-fountain (plaza deco)
"""
import os
from PIL import Image

SRC = "assets/erw/city"
TS = 32


def cut(im, tx, ty):
    return im.crop((tx * TS, ty * TS, tx * TS + TS, ty * TS + TS))


def main():
    wall = Image.open(f"{SRC}/wall-1 - 3 tiles tall.png").convert("RGBA")
    stone = Image.open(f"{SRC}/stone ground2-transp.png").convert("RGBA")

    cap = cut(wall, 3, 9)    # grass + sandstone crown (top of a horizontal wall)
    face = cut(wall, 3, 10)  # stone-brick face (wall body)
    flag = cut(stone, 5, 7)  # clean flagstone
    flag2 = cut(stone, 6, 7)

    # erw_wall_h: compact self-contained rampart = crown (top 14px) over face (18px),
    # so a single 32px tile reads as a low mossy stone wall and tiles horizontally.
    h = Image.new("RGBA", (TS, TS), (0, 0, 0, 0))
    h.paste(cap.crop((0, 0, TS, 14)), (0, 0))
    h.paste(face.crop((0, 4, TS, 22)), (0, 14))
    h.save("assets/tiles/erw_wall_h.png")

    # erw_wall_v: stone face for vertical runs, darkened L/R edges for wall depth.
    v = face.copy()
    px = v.load()
    for y in range(TS):
        for x in (0, 1):
            r, g, b, a = px[x, y]; px[x, y] = (int(r * 0.62), int(g * 0.62), int(b * 0.66), a)
        for x in (30, 31):
            r, g, b, a = px[x, y]; px[x, y] = (int(r * 0.72), int(g * 0.72), int(b * 0.76), a)
    v.save("assets/tiles/erw_wall_v.png")

    flag.save("assets/tiles/erw_flag.png")
    flag2.save("assets/tiles/erw_flag2.png")

    fo = Image.open(f"{SRC}/little fountain1 by the wall-Water.png").convert("RGBA")
    fo.save("assets/props/erw_fountain.png")
    print("sliced 5 ERW city tiles")


if __name__ == "__main__":
    if not os.path.isdir(SRC):
        raise SystemExit(f"missing {SRC}/ — re-upload the ERW Tilesets pack and unzip it there")
    main()
