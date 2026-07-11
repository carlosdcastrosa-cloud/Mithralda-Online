# CAS-2078 / CAS-2080 — Pactos increment (Option B)

**Thin, additive-only** extension of the **live** CAS-1763 *Pactos de Poder* covenant
(`PACTS.enabled:true`, build `c852c60d7993`). The base is NOT rebuilt. This increment
was approved by the CEO as **Option B**: **D1** an in-run HUD badge + **D2** three new
modifier `effect.kind`s, each wired to an existing seam.

Ref base design: `design/cas1763-power-pacts.md`.

## Invariants (unchanged from CAS-1763)
- **RNG-neutral STRONG.** Every new modifier is a *threshold-shift on a roll that already
  fires* or *pure arithmetic on a value the sim already reads*. ZERO new RNG draws.
- **Byte-identical at heat=0.** New defs default rank 0 ⇒ not opted-in ⇒ every mul is
  EXACTLY `1.0` ⇒ the scaled value equals baseline ⇒ `srand ON==OFF`, `save.v1` untouched.
- **Own store.** Ranks persist through the existing `mithralda.pacts.v1` blob
  (`serializePacts`/`loadPacts`). No new store, no new save key. `save.v1` intact.
- **$0 art.** Badge + panel are pure canvas (reuse existing tints/labels).

## D2 — three new modifier defs (`sim/config.js` `PACTS.defs`)

| id | name | kind | max | heat/rank | per-rank mag | seam |
|----|------|------|-----|-----------|--------------|------|
| `presagio`  | Pacto de Presagio  | `variantRate` | 3 | 13 | +0.35 | `maybeVariant` chance threshold |
| `corrosion` | Pacto de Corrosión | `statusBuild` | 3 | 11 | +0.20 | `addBuildup` (hero side) |
| `quebranto` | Pacto de Quebranto | `enemyPoise`  | 3 | 14 | +0.15 | `poiseCeil` + `tryParry` window |

Helpers (`sim/sim.js`, next to `pactRewardMul`): `pactVariantMul()`, `pactBuildupMul()`,
`pactPoiseMul()` reuse `pactStatMul(kind)` → `1 + Σ(rank·mag)`; `pactParryMul()` reuses the
inverse `pactStatMulInv("enemyPoise")` → `max(0.5, 1 − Σ(rank·mag))` (floored so the parry
window never collapses to unparryable). All return `1.0` at heat=0.

### (a) `variantRate` — Encounter-Variants chance (CAS-2071 seam)
`maybeVariant` reads `chance = ENCOUNTER_VARIANTS.chancePerZone[zone]`; after the existing
`if(!(chance>0)) return e` early-out we scale `chance = min(1, chance·pactVariantMul())`.
The `enemyVariantRng` seed + single `srand()` gate is **unchanged** — only the threshold
moves (exact mirror of the `eliteRate` pact in `maybeAffix`). A base-0 zone (town) stays 0
⇒ variant-free. Off ⇒ chance unchanged ⇒ same gate result ⇒ byte-identical.

### (b) `statusBuild` — hero status-buildup (CAS-1931 seam)
`addBuildup` adds `type.build · srcAmt · (boss?bossBuildMul:1) · (isHero? pactBuildupMul() :1)`.
Only the **hero-side** feed (`isHero=true`, i.e. enemy afflictions landing on the player) is
accelerated — a difficulty covenant, never a player buff. Enemy-side bleed (`isHero=false`)
is untouched. Pure arithmetic; `×1` at heat=0.

### (c) `enemyPoise` — poise ceiling ↑ + parry window ↓ (CAS-1826 / CAS-1785 seams)
- `poiseCeil`: `m = ngPoiseMul() · (e.variantPoiseMul||1) · pactPoiseMul()` — raises the
  élite/boss postura ceiling (harder to stagger). Same multiplicative layer as NG+ and the
  Bastión variant.
- `tryParry`: `h.parryT = (PARRY.windowMs/1000) · pactParryMul()` — narrows the active parry
  window by the SAME covenant. Timing only, 0 RNG. Floored at `0.5×`.

## D1 — INTENSIDAD HUD badge (`render/render.js` `renderPactBadge`)
Compact top-centre pill over the game area, drawn from `sim.pactsSnap()` (PURE read, 0 sim):
`⚔ INTENSIDAD · Ardor N` + `Esencia ×X  Botín ×Y` + a chip row of the active pacts and their
ranks. HARD-GATED: only drawn while `PACTS.enabled && scene==="play" && heat>0`. A run with no
pact ranked ⇒ heat 0 ⇒ nothing drawn ⇒ byte-identical to HEAD. Today the Ardor/mults are only
visible in the Pactos menu (`renderPacts`); this closes the in-run feedback gap.

The Pactos menu panel (`renderPacts`) row **stride** now sizes to fit N rows above the footer;
it caps at 45px (the pre-increment stride) on a normal viewport ⇒ the existing 5-row layout is
byte-identical, and the 8-row table never clips on a short window.

## Blobs touched
- `sim/config.js` — 3 new `PACTS.defs` entries.
- `sim/sim.js` — 4 mul helpers, `PACT_EFFECT_LABEL` entries, 4 seam branches (poiseCeil,
  tryParry, maybeVariant chance, addBuildup), 4 `dev.pact*` QA probes.
- `render/render.js` — `renderPactBadge` + its call; adaptive Pactos panel row stride.
- `input.js` — **untouched** (pact rows iterate `ui.pactRects`/`snap.items` dynamically).

## Verification
`node tools/cas2080-pacts-increment.mjs` — content (5→8), heat=0 byte-id seams, AC-a/b/c
per-seam shift, AC-RNG-STRONG (48-draw srand ON==OFF), persistence round-trip + clamp, reward
scaling. Regression green: `cas1763-pacts`, `cas1785-parry`, `cas1826-poise`,
`cas1931-status-buildup`. (`cas2071-variants` AC0 `enabled default false` is a pre-existing
stale assertion superseded by the CAS-2075 live flip — fails identically on HEAD.)

## Downstream chain (siblings after Build)
Deploy → QA OBSERVABLE ×2 (desktop+mobile: rank each new pact in a run, observe the seam
effect + the INTENSIDAD badge; verify OFF==baseline) → Gate CEO (`e77e7f98`) for live GO/NO-GO.
