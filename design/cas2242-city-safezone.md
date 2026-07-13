# CAS-2242 — Zona Segura / Santuario de Ciudad (city safe zone, HP regen)

**Status:** built DARK (`SAFEZONE.enabled:false`), OBSERVABLE self-verify 20/20 PASS → routing QA OBSERVABLE (b5c10283) → CEO Gate (byte-verify DARK + flip LIVE).

## North Star (MMORPG)
The city is the shared world's **social/rest hub**. This ships as a proper **PvE sanctuary**: a
deterministic, server-authority-ready safe zone. The regen **authority lives in `sim`** (`tickSafeZone`),
derived purely from `dt` + hero position — identical on every client by construction, ready for authoritative
netcode with no rewrite. Render only adds a cosmetic affordance; it never owns the mechanic.

## What it does (Batch 1 = regen only)
1. **Passive HP regen** while the hero is inside the **"Ciudad" region bbox** (the SAME POI bbox +
   `cityMargin` that ZONE_BANNER/minimap already use — no new geometry). Rate = `regenPct × maxHp` per
   second. Deterministic tick, **0 RNG**.
2. **Post-damage pause**: taking damage arms `regenDelay` (2 s) during which regen holds — you don't heal
   while being hit (Tibia/Souls feel). Same pattern as `STAMINA.regenDelay`.
3. **Temple sanctuary**: within `templeRadius` of the Templo POI, the rate is ×`templeMul` (accelerated
   healing). The Templo is already the respawn landmark → thematically the healing shrine.
4. **Visual affordance**: a discreet procedural "Zona segura" shield badge (top-right of the play area,
   low-alpha pulse). $0 art, render-only, cosmetic — 0 sim/save.

`safeZone.noAggro` (mobs don't chase inside the city) is a **reserved sub-flag, NOT shipped in Batch 1** —
it touches enemy AI/netcode and would need its own determinism pass. Regen goes LIVE first.

## Config (`SAFEZONE` in `sim/config.js`, DARK)
| knob | value | meaning |
|---|---|---|
| `enabled` | `false` | DARK. Reversible `true→false` + redeploy. |
| `regenPct` | `0.045` | HP-max fraction regenerated per second inside the city (~22 s from 1→100 %). |
| `regenDelay` | `2.0` | seconds regen is paused after taking damage. |
| `templeMul` | `2.5` | rate multiplier inside the Templo radius. |
| `templeRadius` | `220` | px around the Templo POI for accelerated regen. |
| `cityMargin` | `300` | px the POI bbox is expanded by = safe-zone extent (mirrors ZONE_BANNER). |
| `noAggro` | `false` | reserved sub-flag — NOT Batch 1. |
| `epochMs` | `0` | reserved shared-clock anchor (DAYNIGHT/WEATHER pattern), MMORPG-safe. |

Numbers are CEO FEEL/BALANCE knobs — retune is a cheap, reversible edit (no logic rebuild).

## Architecture
- **`sim/sim.js`** (authority):
  - `safeZoneGeom()` — memoized-per-world bbox `[x0,y0,x1,y1]` + Templo anchor, derived from `world.deco`
    POIs (`prop_city_temple/depot/tavern/well`). 0 RNG.
  - `inSafeZone(x,y)` — pure bbox test.
  - `tickSafeZone(h,dt)` — gated; post-pause → regen `pactHeal(maxHp×rate×dt)` toward maxHp (×`templeMul`
    near Templo). Routes through `pactHeal` so the Fragile Pact healCut applies (×1.0 without a pact).
    Called in the hero tick right after `tickStamina`.
  - `damageHero` sets `h._safeRegenPauseT = regenDelay` (gated) at the `h.hp-=real` site.
  - `_safeRegenPauseT` is a **transient** field (outside the `serializeSave` allowlist), only ever written
    when the flag is ON ⇒ absent in DARK ⇒ save byte-identical, no new key.
  - `dev.safeZone(p)` QA hook: reads authoritative state; `{enabled}` in-memory flip, `{pause}`, `{setHp}`
    for deterministic observation. Exposed as `__dev.safeZone` (game.js).
- **`render/render.js`** (cosmetic): `renderSafeZoneBadge()` gated by `SAFEZONE.enabled`, draws the shield
  pip when `inCitySafe(hero)` (render-side bbox from `mapBlips` + `SAFEZONE.cityMargin`). New import
  `SAFEZONE` from config.js.

## DARK byte-identity (`enabled:false` ⇒ == HEAD)
- `tickSafeZone` returns immediately when OFF → HP/state untouched.
- `damageHero` pause write is gated → `_safeRegenPauseT` never created → save byte-id, no new key.
- Regen is pure arithmetic (bbox compare + HP add) → **0 srand draws** → srand ON==OFF.
- `renderSafeZoneBadge` only called under the gate → frame byte-identical.
- Verified: `worldFingerprint` identical across OFF→ON→OFF; HP frozen with flag OFF inside the city.

## Anti-CAS-2220 (flip = consistent-HEAD overlay)
`render/render.js` gains a **new import from `config.js`** (`SAFEZONE`). The LIVE flip therefore MUST deploy
`config.js` + `render/render.js` + `sim/sim.js` + `game.js` **together** (consistent-HEAD overlay), never
config-only over a stale render (would boot-crash: render importing a symbol the served config lacks).
Preflight: `{render.js imports} ⊆ {config.js exports}` before flip.

## Verification
`tools/cas2242-safezone-qa.mjs` — 20/20 OBSERVABLE PASS (900×640, headless Chromium, 62 fps):
DARK default false · bbox+temple derived · HP frozen with flag OFF inside city (DARK) · worldFingerprint
stable · outside=no regen · inside=regens (+9.1 HP/1.5 s) · Templo ×2.5 faster (+23) · pause holds then
resumes · real enemy hit arms the pause (end-to-end `damageHero`) · clamps at maxHp · badge draws ON /
absent OFF · 60 fps · 0 JS errors.
