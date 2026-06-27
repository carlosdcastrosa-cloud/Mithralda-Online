#!/usr/bin/env python3
"""
ERW asset pipeline (CAS-74) — reproducibly fetch the board's real EPIC RPG World
Drive packs, extract a curated, game-ready subset onto the 32px tile grid, and
emit assets/erw/manifest.json describing tile + animation-sheet geometry.

The raw packs are large (~3300 files); we commit only the curated subset the
game actually uses. Re-run any time to regenerate:  python3 tools/erw_pipeline.py

Stdlib only (urllib + zipfile + struct). No third-party deps, no PIL.
"""
import os, re, json, struct, urllib.request, zipfile, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, "assets", "erw")
CACHE= os.path.join("/tmp", "erw_cache")

# Real Drive packs the board provided (CAS-53 / CAS-74).
PACKS = {
    "ancient_ruins": "1vMtMWdNro4WCzZKG7PCaMJBsLNcP3Kk5",
    "sewers":        "192xNd568zRIDSU4nNfZCjnuFn5BTbZ2y",
    "old_prison":    "1wA4rP6eDpHJa0MJaTJh5qUtSi9KPGadc",
}
MAIN_CHAR_ID = "1jCVRPdpK8OkuyOnzdI6Hjocv--UqwtNE"  # 256x256 hooded hero, single pose

# Curated tilesets (32px grid) -> dest filename. substring match within the zip.
TILESETS = {
    "ancient_ruins": {
        "Tilesets/stone ground-transp.png":      "tiles/ruins_stone_ground.png",
        "Tilesets/stone ground2-transp.png":     "tiles/ruins_stone_ground2.png",
        "Tilesets/grass-mid tone-transp.png":    "tiles/ruins_grass.png",
        "Tilesets/grass-dark-transp.png":        "tiles/ruins_grass_dark.png",
        "Tilesets/full tile water.png":          "tiles/ruins_water.png",
        "Tilesets/flooded grass-full tiles variations.png": "tiles/ruins_flooded_grass.png",
    },
    "sewers": {
        "Tilesets/Animated sewage water tiles (full tile).png": "tiles/sewer_water.png",
    },
}

# Curated mob/NPC roster. For each, pull single-action strips (idle/run/walk/atk/death/hurt).
# (pack, "Characters/<folder>/" prefix substring) -> dest slug
ROSTER = {
    "ancient_ruins": [("Characters/Moose/",            "moose"),
                      ("Characters/Stone  Golem/",     "stone_golem"),
                      ("Characters/NPC merchant/",     "npc_merchant")],
    "sewers":        [("Characters/Mutant Rat/",       "mutant_rat"),
                      ("Characters/Viper/",            "viper"),
                      ("Characters/Beholder/",         "beholder")],
    "old_prison":    [("Characters/Skeleton 1/no shield/", "skeleton"),
                      ("Characters/Mage Skeleton/Mage Skeleton no shield/", "mage_skeleton"),
                      ("Characters/Assassin like enemy/", "assassin")],
}
ACTION_RE = re.compile(r'(idle|run|walk|atk|attack|death|hurt|projectile)', re.I)
# skip multi-variant FX clutter; keep the clean single-action strips
SKIP_RE   = re.compile(r'(all animation|all effects|only |no effect|no fx|antecipation|smear|with rusty|with shield|atlas|dust effect\.png)', re.I)
DIM_RE    = re.compile(r'(\d+)x(\d+)')

def png_dims(b):
    return struct.unpack('>II', b[16:24]) if b[:8] == b'\x89PNG\r\n\x1a\n' else (None, None)

def download(name, fid):
    os.makedirs(CACHE, exist_ok=True)
    dst = os.path.join(CACHE, name + (".png" if name == "main_char" else ".zip"))
    if os.path.exists(dst) and os.path.getsize(dst) > 4000:
        return dst
    url = f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"
    print(f"  downloading {name} ...")
    urllib.request.urlretrieve(url, dst)
    return dst

def write(dest_rel, data):
    p = os.path.join(OUT, dest_rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data)
    w, h = png_dims(data[:64])
    return {"path": f"assets/erw/{dest_rel}", "w": w, "h": h, "bytes": len(data)}

def frame_geo(fname, w, h):
    """Infer frame geometry. ERW encodes frame size as WxH in the filename."""
    m = DIM_RE.search(fname)
    if m and w and h:
        fw, fh = int(m.group(1)), int(m.group(2))
        if fw and fh and w % fw == 0:
            return {"frameW": fw, "frameH": fh, "frames": w // fw, "rows": max(1, h // fh)}
    # single-row strip fallback: unknown frame width, height == sheet height
    return {"frameW": None, "frameH": h, "frames": None, "rows": 1}

def main():
    manifest = {"source": "EPIC RPG World packs (board Drive, CAS-53/CAS-74)",
                "grid": 32, "tiles": {}, "characters": {}, "hero": {}}
    os.makedirs(OUT, exist_ok=True)

    # hero
    hero = download("main_char", MAIN_CHAR_ID)
    with open(hero, "rb") as f:
        manifest["hero"] = write("hero/hero_hooded.png", f.read())
    manifest["hero"]["note"] = "single 256x256 pose; movement = procedural or needs walk-sheet"

    for pack, fid in PACKS.items():
        zp = zipfile.ZipFile(download(pack, fid))
        names = zp.namelist()
        # tilesets
        for sub, dest in TILESETS.get(pack, {}).items():
            hit = next((n for n in names if sub in n), None)
            if hit:
                manifest["tiles"][dest] = write(dest, zp.read(hit))
                manifest["tiles"][dest]["from"] = hit
            else:
                print(f"  !! tileset not found: {sub}")
        # roster
        for prefix, slug in ROSTER.get(pack, []):
            strips = [n for n in names if prefix in n and n.lower().endswith(".png")
                      and ACTION_RE.search(n) and not SKIP_RE.search(n)]
            entry = {"pack": pack, "anims": {}}
            for n in strips:
                data = zp.read(n)
                w, h = png_dims(data[:64])
                action = ACTION_RE.search(n).group(1).lower()
                action = {"walk": "run", "atk": "attack"}.get(action, action)
                base = os.path.basename(n).replace(" ", "_")
                rec = write(f"mobs/{slug}/{base}", data)
                rec.update(frame_geo(base, w, h))
                entry["anims"].setdefault(action, []).append(rec)
            if entry["anims"]:
                manifest["characters"][slug] = entry
            else:
                print(f"  !! no strips matched for {slug}")

    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    nt = len(manifest["tiles"]); nc = len(manifest["characters"])
    print(f"\nOK: {nt} tilesets, {nc} characters, hero={'yes' if manifest['hero'] else 'no'}")
    print(f"manifest -> assets/erw/manifest.json")

if __name__ == "__main__":
    main()
