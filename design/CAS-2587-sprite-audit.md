# CAS-2587 — Game Sprite Audit (Art Director)

**Date:** 2026-07-17 · **Owner:** Art Director · **Delegated from:** CAS-2586 (AUDIT SPRITES)
**Served build at audit time:** `0a45234850cd` (813 files), EVO#98 arc live.

Full audit of every sprite/visual asset the game loads. Method: (1) inventoried
`assets/**` + the render loader (`render/sprites.js` `loadAllAssets`), (2) mirrored every
loader path against disk to detect 404s, (3) classified each combat/NPC/prop/tile entity as
real-art vs. procedural, (4) checked style/palette/scale/orientation against
[`STYLE_FORMULA.md`](STYLE_FORMULA.md).

---

## 1. Inventory (what the game loads)

**~1,057 source PNGs (~47 MB)** across `assets/{char,class,tiles,tiles_fountains,props,fx,ui,
atlas,board,clarice,erw,packs,pixellab,qa}`. The production loader is `render/sprites.js →
loadAllAssets()` (per-file `loadImg`); the `assets/atlas/*` artifact is **legacy and not
consumed** by this build.

Loader surface = **196 load-keys**, all verified present on disk:

| Group | Keys | On disk |
|---|---|---|
| Char anim strips (`assets/char/`) — mage/golem/moose/merchant/healernpc/blacksmithnpc | 13 | ✅ |
| Player class sprites (`assets/class/`) — 5 classes × {idle,walk,attack} × {down,up,side} | 45 | ✅ |
| Ground tiles (`assets/tiles/` + fountains tilesets) | 18 | ✅ |
| City props (`assets/pixellab/city/`) — houses/depot/temple/lamp/tavern/well/bench/park | 12 | ✅ |
| Generic + ERW monument props | 19 | ✅ |
| Forest props (`assets/props/forest/`) | 60 | ✅ |
| Swamp props (`assets/props/swamp/`) | 5 | ✅ |
| Enemy single-frame cutouts (`ENEMY_IMG`) | 8 | ✅ |
| Enemy per-state animation strips (`ENEMY_STRIPS`) | 35 | ✅ |
| Combat VFX strips (`assets/fx/` + pilot nova) | 11 | ✅ |
| UI icons (spells/slots/hud/altar) | 39 | ✅ |

**Result: 0 missing files, 0 broken references in the entire loader surface.** Category (a)
"missing/404 assets" is **clean at the source**.

---

## 2. Render split — real art vs. procedural

- **Real PNG art:** all 5 player classes; all tiles; all props; all combat VFX; all UI icons;
  and **21 of 23** combat sprite keys (PixelLab FOUNTAINS cutouts/strips + EPIC RPG World
  golem/moose). Bosses (dragon, golem, bogtyrant, calderatyrant) carry correct feet-anchor
  metadata (`footPad`/`bodyScale`/`tiles`).
- **Procedural code-drawn (`SP` ASCII grids in `render/sprites.js`):** used as the
  load-window/degradation fallback for every mob, **plus** as the *only* art for two sprite
  keys that have no PNG at all → see HIGH findings below.

---

## 3. Findings (prioritized by severity)

### 🔴 HIGH — pure-procedural placeholders (violate the SOURCE-OF-ART LAW)

Only **two** combat sprite keys have no real art and always render as tiny procedural blobs:

| # | Sprite key | Used by | Current art | Severity |
|---|---|---|---|---|
| H1 | `rat` | `rat` mob (common tier-1 forest, spd 132) **+ daily quest "Plaga de Ratas" spawns 8** | procedural **11×7-px** ASCII blob (`SP.rat`) | HIGH |
| H2 | `adv` | `adv` neutral adventurer **+ `healer` combat mob** (`arch:"healer"`, real spawner) | procedural humanoid blob (`SP.adv`) | HIGH |

`STYLE_FORMULA.md` (board LAW, CAS-2138): *procedural art is deprecated as a default; new art
comes from PixelLab.* These two blobs are the last combat entities shipping procedural-only
art. **Fix (this pass):** generated FOUNTAINS-style 64-px side-view cutouts via PixelLab,
same `ENEMY_IMG` single-cutout pipeline (drawn with the existing CAS-203 breathe/walk-bob so
they are animated, not static). Integration = one `ENEMY_IMG` entry each (additive).

### 🟡 MEDIUM — none open

- `fx_nova` was previously flagged (fire-nova strip reused for mage-arcane / priest-holy
  casts). **Already resolved** by CAS-2216 (per-cast element tint, `render/render.js:1991`).
  Verified — no action.

### 🟢 LOW / follow-up polish

| # | Item | Note |
|---|---|---|
| L1 | `healer` mob shares the generic `adv` sprite | Even after H2, the healer reads as a generic mercenary, not a green-robed healer. A distinct healer cutout is Phase-2 polish (matches `healernpc` green-robe family). Follow-up. |
| L2 | `assets/atlas/atlas.{png,json}` is legacy/unused (~64 KB) | Not served, not loaded, cannot break a deploy. Optional cleanup — out of audit scope. |
| L3 | Corrected a suspected 404 set | The char-anim loader only loads *declared* `fc` states, so `mage_cast`/`merchant_walk`/etc. are **never requested** — no wasted loads. (Initial inventory flagged these; disk cross-check disproved it.) |

---

## 4. Style / scale / orientation checks

- **Palette:** all mob cutouts share the frozen cold dark-fantasy FOUNTAINS palette + near-black
  outline (CAS-209). Consistent. New rat/adv embed the STYLE TOKEN byte-identical.
- **Scale/alignment:** boss feet-anchor metadata present and correct; skel pilot strips use
  `footPad 0.25 + bodyScale 2.03`. No mismatched-resolution or floating-feet defects found.
- **Orientation:** side-view mobs mirror by facing; hero uses 3-dir + mirror. No direction bugs.

**Overall:** the sprite set is in strong shape. The only genuine high-severity defects are the
two procedural placeholders (H1 rat, H2 adv), both fixed in this pass.

---

## 5. Disposition

- H1 `rat`, H2 `adv` → real PixelLab cutouts generated + integrated into `ENEMY_IMG` (additive,
  0 impact on the EVO config-flag arc). QA loop for in-game verification.
- L1 (distinct healer sprite) → Phase-2 follow-up.
- L2/L3 → no action needed.
