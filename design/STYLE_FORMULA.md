# Mithralda — STYLE FORMULA (the visual contract)

> **SOURCE OF ART — LAW (board directive, 2026-07-12, CAS-2138 → CAS-2179).**
> The board (Carlos, owner) made this permanent and textual:
> *"ya no quiero que uses arte procedural, quiero que siempre utilices PixelLab MCP, ponlo como regla."*
>
> 1. **PixelLab MCP (`mcp__pixellab__*`) is the DEFAULT art source** for everything new —
>    characters, class variants, mobs, NPCs, props, tiles, and FX sprites.
> 2. **Procedural (code-drawn canvas) art is DEPRECATED as a default.** Do not ship new
>    procedural art unless the board explicitly asks for it. Existing procedural assets stay
>    only until replaced; no *new* procedural deliverables.
> 3. **Real board art wins where it exists.** Where the board uploaded real art (Drive
>    "Assets": hero, EPIC RPG World tilesets, combat VFX packs), integrate that. Whatever is
>    missing is **generated with PixelLab**, derived from the board's canonical main character.
> 4. **CEO art gate:** art deliverables that use procedural-by-default are rejected from now on.
> 5. **Higgsfield** stays available for richer renders / motion where PixelLab can't cover the
>    need, but it is no longer the default and never substitutes procedural back in.
>
> This LAW governs the *production source*. The *visual contract* below (palette, proportions,
> outline/shading, perspective) is unchanged — every PixelLab asset must still pass it.

Per the Higgsfield game-generation `stylization.md` contract: **one** style string per
game, inserted **byte-identical** into every asset-generation prompt of every subsystem
(sprites, animations, tiles, FX, UI). This is what makes independently generated assets
look like ONE game. With the LAW above, that single style string now also drives every
PixelLab prompt.

The style is **pinned by the brief** (the CEO's starter game already establishes a warm
earthy medieval pixel look and the main-character style), so no approval gate is required —
this FORMULA documents and freezes that existing style.

## STYLE FORMULA (use verbatim — do not paraphrase, shorten, or "improve")

> Chunky 32-pixel pixel art with crisp dithered shading and bold near-black outlines;
> sturdy compact silhouettes, heroes about two tiles tall, readable blocky shapes.
> Environment in warm earthy medieval tones — mossy greens, packed-earth browns, cold
> slate stone and teal-grey cobble — kept muted so it recedes; player classes pop in
> saturated armor and robe hues against that ground; hazards, projectiles and pickups
> are marked with a single bright signal glow (amber flame, teal-green heal, blue rune,
> gold loot). Moody torch-lit dusk atmosphere with flat ambient light. High contrast
> between actors and terrain, clean silhouettes, consistent top-down perspective on
> every asset.

## STYLE TOKEN (compressed form, for length-limited fields — ≤120 chars, frozen)

> chunky 32px pixel art, warm earthy medieval palette, near-black outlines, amber torchlight, top-down readable silhouettes

## Notes for asset producers

- **Palette is by role, not one gamma** — see [`palette.json`](palette.json). Environment
  recedes, actors contrast it, signal hues are reserved for hazards/pickups only.
- **Perspective word is `top-down`** for every asset (this is a top-down ARPG). A
  side-view character on a top-down map is the single most common cross-asset failure.
- **Key color for transparent assets**: default magenta `#FF00FF`; switch to green
  `#00FF00` when the asset's own colors are near pink/purple; blue `#0000FF` if both
  are taken. Clear enclosed key-colored regions in post, not just corner flood-fill.
- **Regeneration budget**: 2 attempts per asset, then take the best and compensate in
  code (tint/scale/1px overlap). Style drift usually heals by re-rolling the SAME prompt.
- **Re-deriving this FORMULA** is allowed only on an explicit "change the art style"
  request — it re-opens approval and invalidates existing assets.
- **100% original art** — no copyrighted or named-game references in prompts or output.

## Canonical hero base (derive, don't reinvent)

- The board's **`main character.png`** (Drive `1jCVRPdpK8OkuyOnzdI6Hjocv--UqwtNE`) is the
  canonical hero identity: a **hooded wanderer in a blue-grey cloak with a crimson sash and
  dark trousers**, south-facing. In-repo copy: [`art-reference/main_character_drive.png`](../art-reference/main_character_drive.png).
- Every new hero direction / class variant / animation **derives from this sprite** (PixelLab
  v3 `reference_image_base64` rotation, or `create_character_state` for class outfits). Keep the
  silhouette, palette family, and pose; change outfit / accent / color to express the class.
  A stranger must read "same character, different role."

## PixelLab production recipe (default pipeline)

1. **Hero + rotations** — `create_character` `mode:"v3"` with the cropped canonical sprite as
   `reference_image_base64` → 8 directions. (Reference base64 must be raw, no line breaks; crop
   to the sprite's content bbox so the payload stays small and transports cleanly.)
2. **Class variants** — `create_character_state` from the hero id with an `edit_description`
   for the class outfit; enable `use_color_palette_from_reference` unless the class intentionally
   introduces a new accent hue.
3. **Mobs / NPCs / props** — `create_character` (humanoid/quadruped) or `create_map_object`,
   prompt prefixed with the **STYLE TOKEN** above.
4. **Tiles** — `create_topdown_tileset` (Wang autotiling) for terrain; `create_map_object` with
   `background_image` for style-matched props.
5. **Animate everything** — `animate_character` (template walk/idle first, v3 for custom). No
   character ships as a static still.
6. **Composite clean** — assets that sit on tiles get transparent backgrounds (PixelLab outputs
   transparent; use Higgsfield `remove_background` only if a render needs it).
7. **Budget** — check `get_balance` before big batches; if generations would gate the work,
   raise it to the CEO (do not silently fall back to procedural — that violates the LAW).
