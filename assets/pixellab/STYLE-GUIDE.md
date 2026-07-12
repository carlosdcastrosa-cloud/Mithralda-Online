# Mithralda — PixelLab Style Guide (STYLE FORMULA)

**Status:** FROZEN v1 — this is the single durable standard every PixelLab generation
must reference. Board mandate CAS-2177 (replace all procedural art with PixelLab; use
PixelLab exclusively for any new sprite/effect). Authored under CAS-2183 (Art Director).

> **Rule #1:** New art that diverges from this formula is *wrong even if it looks nice*.
> If the formula must change, propose the change to the CEO — do not quietly drift.

---

## 1. Camera & projection

| Param | Locked value | Notes |
|---|---|---|
| `view` | **`low top-down`** | ~20° from above, classic 3/4 ARPG. Matches the game's existing camera. Do **not** use `high top-down` or `side` for characters/mobs. |
| Body facing | 8-direction rotation | PixelLab v3 always emits 8 directions. In-game the ENEMY_STRIPS path uses the **side (east)** view (flipped for west); the hero class path uses **down / up / side**. |
| Anchor | **feet at frame bottom** | Every character/mob frame is bottom-anchored: `feetY = frame height` (the render bottom-anchors the draw). Bosses with empty rows below the feet use a `footPad` fraction (see dragon in `render/sprites.js`). |

## 2. Canonical sizes

| Asset class | Frame size (px) | In render as |
|---|---|---|
| **Standard character / mob** (hero, skeleton, wolf, bandit…) | **64 × 64** | drops into `ENEMY_STRIPS` default (`_s` → `fw:64, fh:64`) |
| **Boss** | 96–133 (per boss) | uses `tiles` scale + optional `footPad` (golem 96, dragon 133) |
| **VFX / FX strip** | 64–128 square | `FX_STRIP` frame `fw` (fire 64, nova 128, thorn 128, holy/impact/crit/spark 96) |
| **Prop / map object** | 32–96 | single frame, transparent bg |
| **Ground tile** | 32 (Wang 16/32) | `create_topdown_tileset`, corner autotiling |

> **Why 64:** it is the existing PixelLab mob frame size in this repo (`skel`, `orc`,
> `wolf`, `bat` are all 64²). Generating at 64 makes pilot mobs **drop-in** for the
> existing 64² slots with zero rescale. The hero is generated at 64 too so the whole
> roster shares one pixel density.

## 3. Palette direction

Pulled from the frozen in-game palette (`render/palette.js`). Every generation should
read as if lit by this palette — muted, cold, dark-fantasy, with disciplined warm accents.

| Role | Hex | Use |
|---|---|---|
| Base stone / steel | `#2b2f38` `#3a4150` `#1b1f26` | armor, bone shadow, rock, structure |
| Steel-blue cool | `#234048` `#5f8e90` | metal highlights, cold magic, undead glow |
| Muted green | `#3e5040` `#50644c` `#2b392e` | cloth, moss, druid/nature |
| Earth / leather | `#4a3f30` `#5d5040` `#332b20` | straps, wood, tabard shadow |
| **Warm accent — gold** | `#e0b94a` `#ffe39a` `#a87f2e` | trim, UI, essence, rare highlights only |
| **Warm accent — ember** | `#ef8a2e` `#ffc24d` | fire VFX, torches, danger |
| Blood / signal red | `#b3242a` | crimson tabard, damage, HP |
| Outline | `#0a0c10` | near-black selective outline |

**Discipline:** colors come from this table, not picked per-asset. Class/mob variants
shift **hue/accent within the family** (e.g. crimson tabard → green cloak) — they do **not**
introduce a new palette. Warm gold/ember are *accents*, never the dominant field.

## 4. Line, shading, detail

| Param | Locked value | PixelLab arg |
|---|---|---|
| Outline | selective dark outline (near-black `#0a0c10`) | `outline: "selective outline"` |
| Shading | medium — soft form shadows, 2–3 value steps, **no harsh dithering** | `shading: "medium shading"` / `detail: "medium detail"` |
| Detail | medium — readable silhouette first, texture second | `detail: "medium detail"` |

> **Silhouette reads first.** The shape alone must communicate the character/class before
> any color. If the silhouette is mushy, the asset fails the bar regardless of shading.

## 5. The reproducible "seed" — how we stay consistent

PixelLab's `create_character` (standard/v3/pro) has **no `seed` parameter** — so
consistency is enforced three ways, in priority order:

1. **Locked style prompt prefix (below)** — prepend to *every* character/object/tile description.
2. **Derive, don't reinvent** — new characters/class variants are generated with
   `create_character_state` (identity-preserving edit, **and it DOES take `seed`**) from the
   canonical base, or by feeding a locked base sprite as `reference_image_base64` into
   `create_character` v3 (rotates that exact sprite). A stranger should instantly see
   "same character, different role."
3. **Fixed numeric seed `70012`** for every tool that accepts one
   (`create_character_state`, `create_1_direction_object` style refs, `create_object_state`,
   `create_isometric_tile`, `create_topdown_tileset`, `create_tiles_pro`, `create_font`).

### Locked STYLE PROMPT PREFIX (copy verbatim, prepend to every description)

```
dark-fantasy top-down ARPG pixel art, muted stone-grey and steel-blue palette with
warm gold and ember accents, clean selective near-black outline, medium shading,
readable silhouette, low top-down 3/4 RPG view
```

### Locked param block (characters & standard mobs)

```
mode:  v3            # highest quality, 2–9 gens, always 8 directions
size:  64            # canonical standard-character density
view:  low top-down
outline: selective outline
detail:  medium detail
# (v3 treats shading/proportions as ignored; outline/detail are soft guidance)
```

### Canonical base characters (the reference set — reuse, don't regenerate)

| Character | PixelLab id | Role |
|---|---|---|
| Mithralda Warrior (hero base) | `c19a526a-31fa-4aa9-9347-0446f5494769` | hero + class-variant source (derive Paladin/Mage/Druid/Priest via `create_character_state`) |
| Mithralda Skeleton (mob base) | `351f6f24-1a87-4e60-9960-360ec0a2ddb9` | undead-family source |

> To add the other four classes later: `create_character_state(character_id=<warrior>,
> edit_description="… wearing <class> outfit …", seed=70012)` — keeps silhouette, palette
> family, and pose; only outfit/accent changes. **Do not** run a fresh `create_character`
> for a class variant.

## 6. Animation standard

- **Everything animates. A static still fails the bar.** Every character/mob ships at
  minimum `idle` + `walk`; combatants add `attack`. Rich mobs add `hurt` + `death`.
- Engine: `animate_character` **v3** (1 gen/direction, cheap, re-rollable) or **template**
  (`walk`, `breathing-idle`, `roundhouse-kick`, …; 1 gen/direction). **Never `pro`** for
  routine work (20–40 gens/direction).
- Only generate the directions the game consumes: enemies need **side (east)**; hero needs
  **south (down), north (up), east (side)**. This keeps each animation at 1–3 gens.
- Frame counts follow the existing repo convention: walk 6, idle 8, attack 7 (standard mobs).
- Motion has weight: anticipation → strike → settle, eased, loops clean. No linear robotic slides.

## 7. Delivery format (integration-ready)

- Download each animation as a **single-row horizontal strip PNG** (frame = square, N frames).
- Standard mobs → `assets/pixellab/fountains/anim/{key}.png`, key matches `ENEMY_STRIPS`.
- Hero classes → `assets/class/{cls}_{state}_{dir}.png` (down/up/side).
- Ship a **manifest** mapping each PNG → in-game slot, frame count, frame size, feetY —
  matching `render/sprites.js` `ENEMY_STRIPS` / `CLS` / `FX_STRIP` conventions.
- Transparent background (PixelLab characters export cut-out). Verify at real game scale.

## 8. Budget note

PixelLab Tier 1 = 2000 gens/month. Track spend with `get_balance` before large batches.
Full mass-migration is **gated on a board budget decision** — do not mass-generate without it.
