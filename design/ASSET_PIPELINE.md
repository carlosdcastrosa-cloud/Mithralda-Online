# Mithralda — Original Art & Asset Pipeline

Stage-1 pipeline for producing, naming, packing, and loading 100% original pixel-art
assets. Owns three things: the **style contract**, the **dimension/naming standards**, and
the **atlas/loading strategy** that keeps first-load fast (the "no entry friction" deploy
invariant).

Related: [`STYLE_FORMULA.md`](STYLE_FORMULA.md) (visual contract) · [`palette.json`](palette.json)
(palette by role) · [`assets.csv`](assets.csv) (asset manifest) · `tools/build-atlas.mjs`
(packer).

---

## 1. Style contract

Every generated or hand-/code-drawn asset embeds the **STYLE FORMULA** byte-identical
(see `STYLE_FORMULA.md`). Palette comes from `palette.json`, organized **by readability
role** (environment recedes · actors contrast · signal hues reserved for hazards/pickups).
100% original art — no copyrighted or named-game references in prompts, code, or output.

## 2. Dimension & grid standards

| Quantity | Value | Notes |
|---|---|---|
| Tile size (`TS`) | **32 px** | World, movement, and collision anchor to this grid. |
| Character display height | **~2 tiles (~64 px)** | Heroes/NPCs read as ~2 tiles tall on screen. |
| Class sprite source frame | **22 × 34 px** | Horizontal frame strip; drawn bottom-center, scaled up at render. |
| Enemy (mage) source frame | **88 × 72 px** | Larger animated boss-class strip. |
| Tiles | **32 × 32 px** | Seamless, flat even lighting, no focal object, wraps H+V. |
| Props | native px | Anchored bottom-center; per-prop render scale lives in `PROP_SCALE` (game.js). |
| Color format | **8-bit RGBA, non-interlaced PNG** | Uniform across all source assets (atlas requires this). |

**Sprite sheets are horizontal frame strips**: a sheet of N frames is `N·fw × fh`. Frame
counts/sizes are declared in `game.js` (`ANIM`, `CLS`). Animation logic slices frames at
draw time (`drawImage(img, fidx*fw, 0, fw, fh, …)`) — the atlas does not change this.

## 3. Naming → load-key convention

The packer derives each asset's runtime **load-key** from its folder; `game.js` uses the
same keys. Keep these in lockstep (the per-file fallback list in `game.js` is the source of
truth the packer mirrors):

| Folder | File example | Load-key |
|---|---|---|
| `assets/char/` | `mage_walk.png` | `mage_walk` |
| `assets/class/` | `warrior_idle_down.png` | `cls_warrior_idle_down` |
| `assets/tiles/` | `cave_floor.png` | `cave_floor` |
| `assets/props/` | `barrel.png` | `prop_barrel` |

## 4. Atlas / loading strategy

**Problem:** the client otherwise issues ~68 separate image requests at boot — slow first
paint on the weakest target (mobile browsers).

**Solution:** `tools/build-atlas.mjs` packs every source sheet into a single
`assets/atlas/atlas.png` (one RGBA8 PNG) plus `assets/atlas/atlas.json` (key → `{x,y,w,h}`).
At boot the client makes **one** request, then slices each sheet back into an offscreen
canvas at its original dimensions. Every existing draw call works unchanged.

- **Zero runtime dependencies** — the packer uses only Node built-ins (`zlib` for the PNG
  codec). The deployed game is static; there is no build step at deploy time.
- **Deterministic** — assets are walked in sorted order, so the artifact is reproducible
  and diff-friendly.
- **Self-verifying** — the packer pixel-checks every packed region against its source and
  re-decodes the output PNG before writing. Build fails loudly on any mismatch.
- **Graceful fallback** — if `atlas.json`/`atlas.png` is missing or fails to load, the
  client automatically falls back to per-file loading. The game never *depends* on the
  atlas being present, so a stale or absent atlas can never break a deploy.

Current result: 68 sheets → 1024×553 atlas, ~46 KB (smaller than the 87 KB of loose PNGs),
68/68 regions pixel-verified.

### Rebuild after changing any source art

```bash
node tools/build-atlas.mjs        # regenerates assets/atlas/{atlas.png,atlas.json}
```

Commit the regenerated atlas alongside the changed source PNGs. **The atlas is a build
artifact — never hand-edit it.** Edit source PNGs in `assets/{char,class,tiles,props}/`
and rebuild.

## 5. Adding a new asset

1. Produce the PNG as **8-bit RGBA** at the standard dimensions (§2), embedding the STYLE
   FORMULA and `palette.json` roles.
2. Drop it in the matching `assets/<folder>/` so its load-key follows §3.
3. Register it in `game.js` (the per-file loader list + any `ANIM`/`CLS`/`PROP_SCALE`
   metadata) so the fallback path and frame slicing know about it.
4. `node tools/build-atlas.mjs` and commit source + regenerated atlas.
5. Add/track the row in [`assets.csv`](assets.csv).

## 6. Generation tools

Higgsfield generation tools (`generate_image`, 2D-animation, textures) may drive original
sprite/tile production. Always read the platform's `stylization.md` / `textures.md` /
`2d-animation.md` references first, embed the STYLE FORMULA byte-identical, and honor the
2-attempt regeneration budget. Procedurally code-drawn art (canvas textures, FX) is an
asset too and embeds the same FORMULA.
