# Mithralda — STYLE FORMULA · FOUNTAINS edition (dark-fantasy re-style)

> **Status: ADOPTED — board-approved 2026-06-29 (approval `c360188d`, [CAS-200]).**
> This is now the **frozen canonical art style** and **SUPERSEDES** the warm-earthy
> medieval formula in [`STYLE_FORMULA.md`](STYLE_FORMULA.md) (kept in git as history).
> The existing warm assets are invalidated and get replaced FOUNTAINS-style,
> tile-by-tile / sprite-by-sprite, by the CAS-200 first batch (integration: CAS-201)
> and the follow-up rollout batches. Re-deriving this formula again requires a fresh
> explicit "change the art style" request + new board approval.

Reference mood (CEO research): **FOUNTAINS** (Steam app 1841240) — top-down pixel
art, dark-fantasy, gritty war-torn empire, Souls-like / Metroidvania tone,
stylized (slightly cartoonish) blood/FX over photorealism, **gameplay-clarity
first**: readable silhouettes, a limited but moody palette, dramatic light/shadow.

---

## STYLE FORMULA (use verbatim — do not paraphrase, shorten, or "improve")

> Chunky 32-pixel pixel art, top-down, with crisp dithered shading and bold
> near-black outlines; sturdy compact silhouettes, heroes about two tiles tall.
> Dark-fantasy mood of a war-torn empire: a cold, desaturated, gloom-soaked
> palette — ash-grey stone, blue-black shadow, slate cobble, sickly muted moss,
> dead bog-teal water — kept dim so terrain sinks into shadow. Actors read as
> pale steel-and-leather silhouettes rim-lit cold against the dark, never bright.
> Lighting is high-contrast and dramatic: a flat near-black ambient with a single
> warm torch pool that falls off fast into blue-black; everything outside the pool
> is crushed to shadow. Only signal hues are allowed to glow — amber torchlight,
> stylized crimson blood, blue-white rune magic, teal soul-light, gold loot — and
> they appear ONLY on hazards, FX and pickups, never on terrain. Consistent
> top-down perspective on every asset; silhouette must read before any color.

## STYLE TOKEN (compressed, ≤120 chars, frozen — for length-limited prompt fields)

> chunky 32px top-down pixel art, cold desaturated dark-fantasy gloom, near-black outlines, dramatic torch light, crimson blood signal

---

## The visual contract, broken down

### 1. Pixel density & geometry (UNCHANGED from warm formula — keeps assets drop-in)
- **Base tile = 32×32 px.** Heroes ≈ 2 tiles tall. Same cell geometry as the
  current shipped assets so every reskin is a byte-for-byte size match and the
  engineer wires them in with zero layout change.
- **Outline:** bold 1-px near-black `#0a0c10` around every actor/prop silhouette.
  Tiles are outline-less internally (they tessellate) but use the darkest palette
  step at their seams.
- **Shading:** 3-step ramp per material (dark / base / light) + **dither** on the
  dark→base transition for grit. No smooth gradients, no anti-aliasing.

### 2. Palette — by readability ROLE, not one flat gamma
Single source of truth: [`palette.fountains.json`](palette.fountains.json). The
eye must instantly separate **terrain (recedes) → actors (cold contrast) → signal
(the only glow)**. The whole frame is darker and 40–55% less saturated than the
warm formula.

**Environment (sinks into gloom — cold, desaturated):**
| role | base | light | dark |
|---|---|---|---|
| stone | `#2b2f38` | `#3a4150` | `#1b1f26` |
| cobble | `#23303a` | `#33424f` | `#161e26` |
| dirt / grave-earth | `#2c2925` | `#3a352d` | `#1c1a16` |
| moss (sickly) | `#26302a` | `#334036` | `#19211c` |
| bog water | `#142329` | `#234048` | glint `#5f8e90` |
| ash | `#322f29` | `#423d33` | `#1f1d18` |
| outline `#0a0c10` · void/bg `#06070a` · night `#0a0d12` · blood-stain `#3f1216` |

**Actors (pale, cold, never bright — pop only by contrast against the dark):**
- shared: skin `#a87f53` / skin_dark `#7d5a38`, steel `#aab4c2` / steel_dark
  `#6b7480`, leather `#2c2d34`, boot `#181920`, bone `#c7bc9c`.
- per-class accent shifts within the family (silhouette + base stay shared):
  warrior body `#525a68` cape `#6e2326` (dried blood) accent `#b08c44`;
  mage body `#263c47` cape `#1c2d35` accent `#6f86c8` orb `#79cdc6`;
  paladin steelier + cold gold; druid muted bog-green; priest ash-white.

**Signal (RESERVED — the only saturated/glowing hues; never on terrain/actors):**
- torch/flame `#ef8a2e` → light `#ffc24d` → core `#fff0c2`
- **blood (stylized, slightly cartoonish per FOUNTAINS)** `#b3242a` → dark `#6e1418`
- heal `#4fbf6a` · rune/magic `#5a8aff` · arcane-teal `#45c7c0`
- soul / wisp light `#7fe0d0` · loot gold `#e0b94a` → light `#ffe39a`

### 3. Lighting & shadow convention (the FOUNTAINS signature)
- **Ambient is near-black**, value ~20–25%. The map is dark by default.
- **One dominant warm light** (torch / brazier / fire FX) casts a tight radial
  pool that falls off fast into cold blue-black. Light = warm, shadow = cold;
  this color-temperature split is what sells the dark-fantasy mood.
- **Rim light:** actors get a cold 1-px highlight on the silhouette edge facing
  away from the torch — they read as shapes carved out of the gloom.
- **Contact shadow:** every actor/prop sits on a hard near-black ellipse (no
  soft blur), grounding it on the dark floor.
- **Contrast > color.** When in doubt, push darker and let the silhouette + the
  one signal glow carry readability.

### 4. Producer rules
- **Perspective is `top-down`** on every asset (most common cross-asset failure).
- **Key color for transparency:** magenta `#FF00FF` default; green `#00FF00` if
  the asset is pink/purple; blue `#0000FF` if both are taken. Clear enclosed
  key regions in post, not just corner flood-fill.
- **Regeneration budget:** 2 attempts/asset, then take the best and compensate in
  code (tint / 1-px overlap). Style drift heals by re-rolling the SAME prompt.
- **Reskin transform (for converting warm-formula assets to this style):**
  desaturate ×0.55, pull hue toward cold (blend toward 210°), multiply lightness
  ~0.78, crush shadows to blue-black floor, keep highlights faintly warm. This is
  implemented in `tools/cas200-fountains-restyle.mjs` and is the canonical recolor.
- **100% original art** — no copyrighted or named-game assets in prompts/output.
  "FOUNTAINS" names a *mood*, not source art; nothing is copied from that game.

[CAS-200]: /CAS/issues/CAS-200
