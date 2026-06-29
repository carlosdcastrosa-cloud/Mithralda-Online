# CAS-221 — Drive asset intake: Clarice (warrior) + 4 support packs

**Owner:** Art Director · **Hand-off:** CAS-220 (CTO/Engineer) integrates the warrior swap.
**Source:** 5 zips shared by the board (carlosdcastrosa@gmail.com) on Google Drive.
All files decoded, catalogued, and the game-ready PNGs committed under `assets/`.

---

## 0. TL;DR — which zip is Clarice

| zip | Drive title (hash) | Pack | Role |
|-----|--------------------|------|------|
| 1 | a2ee5d1d… (40 KB) | **Creature character** | reptilian **beast mob/boss** |
| 2 | dbe8b77e… (182 KB) | **dark_demon_3** (claw + warlock) | **demon enemies** |
| 3 | 05305e8d… (62 KB) | **healer_pack** | **healer / caster** (NPC or support enemy) |
| 4 | c7353074… (718 KB) | **blacksmith** | **humanoid melee fighter** + forge town scene |
| 5 | c5adfe33… (942 KB) | **forest_topdown_pack** | **environment tileset + nature props** |

**Clarice (the warrior) = the humanoid fighter in zip 4 (`blacksmith/blacksmith_pack/character/`).**
It is the *only* humanoid in the five packs with a complete melee-warrior kit
(idle stance, walk, attack, death) — shield + flail/sickle. The healer (zip 3) is the
only other humanoid but is a robed spell-caster (magic FX rows), not a warrior, so it
does not match the "(warrior)" requirement. The other three packs are mobs / tiles.
Each pack ships **6 colour variants** of its character (files `1.png`–`6.png`), the same
recolour pattern we use for the classes (CAS-167). For Clarice, `clarice_v1.png` is the
default palette; the board/engineer can pick another variant for the final look.

> The pack is themed "blacksmith" (its bottom-left swatch + a forge-work animation row +
> a forge scene shipped alongside). The fighter rows are a full combat set, so it works as
> the warrior; the forge row is available as an optional town/craft idle. If the board
> actually meant a different character by "Clarice," re-point is trivial — the assets for
> all packs are already staged.

---

## 1. CLARICE manifest (warrior) — `assets/clarice/clarice_v1.png` … `clarice_v6.png`

- **Sheet:** 384 × 448 px, RGBA. **Grid: 6 columns × 7 rows. Frame = 64 × 64 px.**
- **Layout:** each *row* is one animation, frames left→right. Character art is ~40 px tall
  inside the 64 px cell (lots of headroom — engineer should anchor by feet, not cell top).
- **6 palette variants** `clarice_v1..v6.png` — identical frame layout, different colours.

| row (0-idx) | y-range px | state | usable frames | notes / fps |
|-------------|-----------|-------|---------------|-------------|
| 0 | 0–63   | **CRAFT / forge-work** (optional town idle) | 6 | hammering at anvil; ~8 fps. Optional — not needed for the in-world warrior. |
| 1 | 64–127 | (prop) anvil-only frame | 1 | **skip** — leftover prop, no character. |
| 2 | 128–191| **IDLE** (ready stance, shield) | 6 | loop ~6 fps. Use as the in-world idle. |
| 3 | 192–255| **WALK / run** | 6 | loop ~10 fps. |
| 4 | 256–319| **DEATH** (collapses to ground) | 6 | play-once ~8 fps, hold last frame. |
| 5 | 320–383| **ATTACK** (shield-bash → flail/sickle arc → slash) | 6 | play-once ~12 fps. |
| 6 | 384–447| palette swatches (bottom-left only) | 0 | **skip** — legend, not animation. |

**No dedicated HURT row.** Recommend a 2-frame flash/recoil from the idle row, or reuse
the first death frame as a brief stagger (matches how other classes degrade gracefully).
**Directionality:** single side-facing set (faces right). Mirror horizontally for left —
same approach as the existing class strips in `assets/erw/hero/classes/`.

### Integration notes for CAS-220
- The in-world renderer already slices per-state strips (CAS-209 `ENEMY_STRIP` /
  per-state strip renderer in `render/`). Clarice is a *grid atlas*, not separate strips:
  slice with `srcX = col*64`, `srcY = row*64`, `w=h=64`. Either (a) draw straight from the
  atlas with row/col offsets, or (b) pre-slice rows 2/3/4/5 into horizontal strips
  (`clarice_idle.png`, `_walk.png`, `_attack.png`, `_death.png`) to match the existing
  strip pipeline. Option (b) is closest to current code.
- Scale: figure ≈ 40 px in a 64 px cell. Current hero target is ~1.5 tiles / 48 px
  (CAS-208, `CLASS_ANIM_SCALE` ≈ 0.30 baseline). Tune scale so Clarice's *figure* (not the
  64 px cell) lands at ~48 px; expect a larger scale factor than the current strips because
  of the cell headroom.
- Class-select screen uses static strips + `__BUILD` cache-bust (CAS-167/199). Provide
  Clarice's idle row there.

---

## 2. The other 4 packs — catalogue + usage recommendation

### zip 1 — "Creature character" → `assets/packs/creature_beast/`  (BEAST MOB/BOSS)
Side-view reptilian beast. **Clean horizontal strips, frame = 133 × 133 px, single row each:**

| file | sheet px | frames | state |
|------|----------|--------|-------|
| `Idle.png` | 1330×133 | 10 | idle |
| `walk.png` | 1330×133 | 10 | walk/run |
| `Attack 1.png` | 1197×133 | 9 | attack (bite/lunge) |
| `Attack 2.png` | 2261×133 | 17 | attack (heavy combo) |
| `Death.png` | 931×133 | 7 | death |
| `Hurt.png` | 399×133 | 3 | hurt |
| `Preview.png` | 850×550 | — | reference |

**Use as:** a new high-tier **beast mob or zone boss** (FOUNTANS dark-zone). 133 px frames
are large — scale down to mob size. Easiest pack to wire (already per-state strips).

### zip 2 — "dark_demon_3" → `assets/packs/dark_demon/`  (DEMON ENEMIES)
Two enemies, grid atlases, **frame = 96 × 96 px**, 6 cols:
- `claw/1..6.png` — 576×480, **6×5 grid**. Melee demon (claw swipes). Rows ≈ idle, walk, attack, death (+ swatch row).
- `warlock/1..6.png` — 576×672, **6×7 grid**. Caster demon (throws fireball — projectile FX in lower rows). Rows ≈ idle, walk, cast, attack, death, FX (+ swatch).
- 6 colour variants each.

**Use as:** mid/late-game **demon enemies or a mini-boss** (warlock = ranged caster mob,
claw = aggressive melee). Fits the FOUNTANS dark-fantasy palette.

### zip 3 — "healer_pack" → `assets/packs/healer/`  (HEALER / CASTER)
- `healer/1..6.png` — 384×512, **6×8 grid, frame 64×64**, 6 colour variants. Rows ≈
  idle, idle2, walk, death/knockdown, cast, FX, FX (+ swatch). Robed figure, yellow magic.
- `prop_sheet.png` (192×176), `scene_sheet.png` (240×80) — accompanying props/scene tiles.

**Use as:** a **healer NPC** (town) or a **support enemy** (the "healer" archetype already
exists in combat — CAS-126 green-tether healer). Could re-skin that archetype with real art.

### zip 4 — "blacksmith" (scene half) → `assets/packs/blacksmith_scene/`  (TOWN PROPS)
The fighter went to `assets/clarice/`. The rest is a **town/forge scene**:
- `furnace.png` 96×160, `props.png` 128×64, `blacksmith_bg.png` 560×466 (shop backdrop)
- `props/` — barrels (16×32), columns (80×46), furnaces (16×32/16×48), racks (32×32)
- `tent/` — roof/decor/shadow (112×112 each)

**Use as:** dress the **town / merchant / forge area**. Pairs naturally with the merchant
shop (CAS-192 consumables / shop). Animated furnace GIFs exist in source (`furnace_*_work.gif`)
— not committed (use the static `furnace.png` or have engineer build a 2-frame glow).

### zip 5 — "forest_topdown_pack" → `assets/packs/forest_topdown/`  (TILESET + PROPS)
- `tileset/tileset.png` 352×672 + `tileset/props_sheet.png` 432×272 — **top-down autotile
  ground tileset** (16 px tiles) with autotile guide (`autotile_guide3.png`) and
  `collision_grid_guide.png`.
- `props/` — pines (32×80, 48×96), trees w/ yellow autumn variants (48×80, 64×96), rocks
  (many 16/32/48 px), bushes, flowers, grass, dead logs.

**Use as:** a **green/forest overworld biome** — a warm counterpart to the cold FOUNTANS
zones. Tiles are 16 px (vs our 32 px world) → engineer scales 2× or re-samples. Big content
opportunity for a new zone, lower priority than the warrior swap.

---

## 3. Files committed (game-ready PNGs only)
- `assets/clarice/clarice_v1.png … clarice_v6.png` — Clarice atlases (6 palettes).
- `assets/packs/creature_beast/` — 6 strips + preview.
- `assets/packs/dark_demon/{claw,warlock}/1..6.png`.
- `assets/packs/healer/` — `healer/1..6.png` + prop/scene sheets.
- `assets/packs/blacksmith_scene/` — furnace, props, bg, `props/`, `tent/`.
- `assets/packs/forest_topdown/` — `tileset/`, `props/`, guides.

Skipped (redundant source / non-game): inner `.zip`s, `.gif`s, `all_prop.jpg`,
`*_big`/`all_props_pic` reference images, GMS project export.

*Frame grids verified with a pure-stdlib PNG alpha analyzer (per-cell occupancy) +
visual row inspection of rendered strips.*
