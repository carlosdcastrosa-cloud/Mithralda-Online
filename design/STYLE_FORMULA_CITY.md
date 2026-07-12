# Mithralda — CITY / URBAN Art Module (CAS-2186, Tibia-ward evolution)

**Owner:** Art Director · **Direction:** CEO (CAS-2186) · **Status:** active, phase 1

This is an **additive extension** of the frozen [`STYLE_FORMULA.md`](STYLE_FORMULA.md), not a
replacement. The CEO's mandate (CAS-2186) is to evolve the sprite + map art to *resemble
Tibia* and build a large, walkable city with habitable houses. Tibia's look is itself a
**32-px, high-top-down, muted-earthy, black-outlined** pixel style — so our existing
FORMULA already carries 90% of it. The work here is mostly **new urban content** produced
against the same contract, plus a few urban-specific rules below. **No existing asset is
invalidated.** Any change that would invalidate existing assets must be escalated to the CEO.

## The contract still holds (verbatim)

Every city asset embeds the frozen STYLE TOKEN byte-identical:

> chunky 32px pixel art, warm earthy medieval palette, near-black outlines, amber torchlight, top-down readable silhouettes

Grid = **32 px tiles**, perspective = **high top-down**, palette by role (environment
recedes · actors contrast · signal hues reserved for hazards/pickups). See
[`ASSET_PIPELINE.md`](ASSET_PIPELINE.md) for naming/atlas/loading.

## Urban palette (accents inside the earthy family — NOT a new gamma)

| Surface | Role | Hue direction |
|---|---|---|
| Cobblestone street | environment (recedes) | cool teal-grey stone, packed-earth mortar |
| Park grass / lawn | environment (recedes) | muted mossy green, slightly warmer than wild-grass |
| Flagstone plaza | environment (recedes) | pale worn slate (reuse existing `T_COBBLE`) |
| **House roofs** | **landmark accent** | terracotta / clay-red, weathered — the ONE saturated note that makes a Tibia town read |
| House walls | environment | timber-brown frame + tan/ochre plaster |
| Depot | landmark | grey ashlar stone + iron-black banding, a single amber lamp |
| Temple | landmark | pale holy stone + gold sun-sigil signal + stained-glass jewel accents |
| Street lamp flame | signal glow | amber `#ffb020`-ish, reserved (same signal family as torch/flame FX) |

Roof-red and lamp-amber are the two colors that sell "town." Keep everything else muted so
those two pop — same discipline as actors-vs-terrain in the base formula.

## Urban-specific rules

1. **Buildings are props, not tiles.** Houses/depot/temple are bottom-center-anchored
   sprites drawn over the ground tilemap (z-sorted by feet Y like every other prop), so the
   player can walk *around* them and doorway tiles stay walkable. Only the footprint blocks.
2. **Habitable = has a real door + threshold tile.** Every house sprite reserves a 1-tile
   door at bottom-center that lines up to a walkable/interior-warp tile. Silhouette must read
   "you can go in here" — door + windows + chimney, no sealed blocks.
3. **Consistent scale.** House ≈ 3×3–4×4 tiles (96–128 px). Depot ≈ 5×5 (160). Temple ≈
   6×6 (192). Lamp ≈ 1×2 (32×64). Same pixel density / outline weight as existing props.
4. **Streets tile seamlessly.** Cobblestone ground uses a Wang/autotile set (grass↔cobble
   transition) so streets, curbs and park edges wrap H+V with no seams.
5. **Animate the living bits.** Lamp flame flickers; banners/temple-flame get a short loop;
   chimney smoke optional. A static lamp fails the bar — a town at dusk should breathe.
6. **Key color** for transparent building sprites per base formula (magenta default; green if
   colors go pink; clear enclosed regions in post).

## Asset roadmap (city module)

**Phase 1 — ground + landmark set (this pass):**
- [ ] `cobble_street` Wang tileset (grass↔cobblestone) — 16-tile autotile
- [ ] `house_red` habitable town house (red roof, door, windows)
- [ ] `street_lamp` lit lamp post (+ flame flicker anim)
- [ ] `depot` storage/bank landmark
- [ ] `temple` landmark

**Phase 2 — city variety:** house palette variants (2–3 roof/wall combos so a street isn't
copy-paste), shop/tavern signboard, well/fountain (reuse fountains module), market stall,
crates/barrels street dressing, park bench + tree + flowerbed, cobblestone plaza inlay.

**Phase 3 — layout & integration:** enlarge the town rect, hand the Game Engineer a
building placement map (streets grid + lots), wire door-warp tiles, in-game QA at real scale
next to the hero and existing props.

## Producer checklist (pass/fail before ship)

- Silhouette reads the building type with color removed? 
- Roof-red / lamp-amber are the only saturated notes; walls/stone stay muted?
- 32-px density + near-black outline weight matches existing props?
- Bottom-center anchored, door tile walkable, footprint-only collision?
- Living element animated (lamp/banner/flame)?
- Seen at game scale on the actual town ground next to the hero + a neighbor building?
