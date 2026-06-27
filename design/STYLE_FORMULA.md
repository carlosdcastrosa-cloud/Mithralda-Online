# Mithralda — STYLE FORMULA (the visual contract)

Per the Higgsfield game-generation `stylization.md` contract: **one** style string per
game, inserted **byte-identical** into every asset-generation prompt of every subsystem
(sprites, animations, tiles, FX, UI, procedural canvas art). This is what makes
independently generated assets look like ONE game.

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
