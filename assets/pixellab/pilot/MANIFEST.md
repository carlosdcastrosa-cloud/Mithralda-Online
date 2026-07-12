# CAS-2183 — PixelLab Pilot Asset Manifest (integration-ready)

Pilot asset set generated per `assets/pixellab/STYLE-GUIDE.md` (frozen STYLE FORMULA).
**Do NOT hand-edit these PNGs** — regenerate from the PixelLab source ids below.
Integration into `render/sprites.js` is the CTO/GE task (a separate issue that depends on this).

## Global geometry (all characters)

| Property | Value | Meaning for `render/sprites.js` |
|---|---|---|
| Frame size | **124 × 124** | `fw:124, fh:124` — PixelLab v3 emits a 124px canvas for a 64px character |
| Feet baseline | **feetY ≈ 92** | feet sit at y≈92 in every frame (body registered consistently) |
| `footPad` | **0.25** | `(fh − feetY)/fh` — shift draw DOWN by `footPad·dh` so feet land on ground. Identical mechanism to `ENEMY_STRIPS.dragon` (`footPad:0.308`) |
| Layout | single-row horizontal strip | frame *i* at `x = i·fw`; transparent background (cut-out) |
| View | low top-down 3/4 | matches game camera |

> **Why 124px not 64:** v3 renders the ~64px character inside a ~2× padded canvas
> (room for animation extents). Rather than crop (the attack sword-sweep would clip or
> mis-register the feet), the pilot keeps native frames + `footPad`, exactly like the
> existing golem/dragon bosses. The GE sets an on-screen scale (`tiles`/`size·mult`) so
> the ~61px-tall character body renders at standard mob height.

---

## 1. HERO — Warrior  → hero class slot (`CLS.warrior`)

PixelLab source: character `c19a526a-31fa-4aa9-9347-0446f5494769` ("Mithralda Warrior", hero base).
Per-direction strips (`down`=south, `up`=north, `side`=east; flip `side` for west) — matches `CLASS_DIRS`.

| PNG (`assets/pixellab/pilot/hero/`) | In-game slot | frames | fw×fh | feetY |
|---|---|---|---|---|
| `warrior_idle_down.png`  | `cls_warrior_idle_down`   | 1 | 124×124 | 92 |
| `warrior_idle_up.png`    | `cls_warrior_idle_up`     | 1 | 124×124 | 92 |
| `warrior_idle_side.png`  | `cls_warrior_idle_side`   | 1 | 124×124 | 92 |
| `warrior_walk_down.png`  | `cls_warrior_walk_down`   | 6 | 124×124 | 92 |
| `warrior_walk_up.png`    | `cls_warrior_walk_up`     | 6 | 124×124 | 92 |
| `warrior_walk_side.png`  | `cls_warrior_walk_side`   | 6 | 124×124 | 92 |
| `warrior_attack_down.png`| `cls_warrior_attack_down` | 9 | 124×124 | 92 |
| `warrior_attack_up.png`  | `cls_warrior_attack_up`   | 9 | 124×124 | 92 |
| `warrior_attack_side.png`| `cls_warrior_attack_side` | 9 | 124×124 | 92 |

- Attack frame 0 = neutral start (v3 reference frame); frames 1–8 = overhead-slash windup→strike→settle.
- Idle is a **1-frame static** (base rotation) — budget choice. Recommend adding a
  `breathing-idle` template pass (~1 gen/dir) in the full migration so idle is animated.
- Integration: `CLS.warrior` currently `{fw:22,fh:34,fc:{idle:2,walk:4,attack:3}}` → update to
  `{fw:124,fh:124,footPad:0.25,fc:{idle:1,walk:6,attack:9}}` and point the loader at these PNGs.

## 2. ENEMY — Skeleton Wight  → `ENEMY_STRIPS.skel`

PixelLab source: character `351f6f24-1a87-4e60-9960-360ec0a2ddb9` ("Mithralda Skeleton").
Reads as a dark helmed undead **wight/revenant** (palette/silhouette-coherent with the hero).
The game renders mobs **side-view**, so `*_side` are the primary drop-ins; `*_down` are bonus
(for a future 4-direction enemy system).

| PNG (`assets/pixellab/pilot/mobs/`) | In-game slot (`ENEMY_STRIPS.skel`) | frames | fw×fh | feetY |
|---|---|---|---|---|
| `skel_idle_side.png`   | `skel.idle` (side)   | 1 | 124×124 | 92 |
| `skel_walk_side.png`   | `skel.walk` (side)   | 6 | 124×124 | 92 |
| `skel_attack_side.png` | `skel.attack` (side) | 7 | 124×124 | 92 |
| `skel_idle_down.png`   | (bonus, front idle)  | 1 | 124×124 | 92 |
| `skel_walk_down.png`   | (bonus, front walk)  | 6 | 124×124 | 92 |
| `skel_attack_down.png` | (bonus, front attack)| 7 | 124×124 | 92 |

- Integration: `ENEMY_STRIPS.skel` currently `{walk:_s(6,…),idle:_s(8,…),attack:_s(7,…)}` at 64².
  Update to `{key,fc,fw:124,fh:124,footPad:0.25}` per state (like `golem`/`dragon`) and load
  from these PNGs. Attack frame 0 = neutral; 1–6 = lunge stab.

## 3. VFX — Fire Nova  → `FX_STRIP.nova`

PixelLab source: object `f916e936-672a-4b26-9071-1253e5c1afda` (selected from nova review pack
`17d0e40b-…`, candidate [2]); animation group `d52ed065-…`.

| PNG (`assets/pixellab/pilot/fx/`) | In-game slot | frames | fw×fh | anchor |
|---|---|---|---|---|
| `nova_strip.png` | `FX_STRIP.nova` (`fx_nova`) | **9** | 128×128 | center |

- FX are center-anchored (not feet) — `drawFx` centers on the effect origin. No footPad.
- Matches existing `FX_STRIP.nova = {n:9,fw:128}` geometry; load as `fx_nova` from `assets/fx/nova_strip.png`.

---

## Generation budget (this pilot)

- PixelLab Tier 1, 2000/mo. Start of task: **185 remaining** → end **126 remaining**.
- Used: **59 generations** (2× v3 character bases + walk/attack animations for both, +
  the 1 VFX object review pack alone = 20, + nova animation). Cap **≤60** — **met** (the
  20-gen object review pack is the big line item; note it for future FX budgeting).
- **Not generated** (deferred, budget-gated pending board mass-migration decision CAS-2177):
  the optional prop + ground tileset, the other 4 hero classes (derive via
  `create_character_state` from the warrior base), full 8-direction sets, and enemy hurt/death.
