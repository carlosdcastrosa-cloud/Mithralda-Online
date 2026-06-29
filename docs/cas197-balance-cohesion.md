# CAS-197 — Stage-1 balance & cohesion tuning pass

**Scope:** tune the rapidly-deepened Stage-1 systems *together* — combat consumables
(CAS-192), daily-loop (CAS-194), and the *Coliseo Eterno* world-boss (CAS-196) — across
the power curve. Fork-neutral, data-driven, deploy-light. Each system was QA'd in
isolation; this pass audits the **cross-system invariants** and documents before/after
for everything inspected. Per the AC: **no blind nerfs/buffs** — every value is either
changed-with-justification or verified-cohesive-and-left-unchanged.

## TL;DR

The deepened systems audited as **already cohesive** — gates are evenly spaced, the
reward ladder is monotonic and proportionate, and the consumable economy sits in a
"meaningful but not mandatory" band. **One genuine cross-system gap** was found and
closed: the combined attack-speed term had no global ceiling. Net code change is a single
forward-looking guardrail (zero regression to any shipped build) plus 9 new headless
balance assertions that lock the invariants in.

---

## 1. Power-curve cohesion (gates + zone scaling)

`heroPower = upg tiers bought (max 11) + (level − 1)`. Gates:

| Gate | Req | Δ from prev |
|------|-----|-------------|
| Abismo (`ABYSS_POWER_REQ`)  | 8  | — |
| Cripta (`FROST_POWER_REQ`)  | 13 | **+5** |
| Coliseo (`TRIAL_POWER_REQ`) | 18 | **+5** |

- **Spacing is even (+5/+5)** → no difficulty cliff between tiers. **Unchanged.**
- Trash scaling climbs smoothly into the deepest zone: `hpMul` abyss→frost ×1.286,
  frost→trial ×1.278 (the deepest jump is *not* steeper than the prior one). **Unchanged.**
- The Coliseo gate (18) requires the status-stack-capable build the finale already
  demands, so talents/affixes/consumables **deepen** the climb, they don't trivialise the
  gate. Verified — **no change.**

## 2. Consumable economy

| Consumable | Price | CD | Effect |
|-----------|-------|----|--------|
| Poción de furia | 55 g | 14 s | +50% atk-speed · 6 s |
| Antídoto | 35 g | 10 s | purge veneno/quemadura/lentitud |
| Poción mayor | 50 g | 12 s | heal 60% max HP |

Reference economy: merchant upgrade tiers start at 50–70 g; basic potion 15 g; capstone
gold 200 → 600 g (arena → coliseo). Consumables sit **above a basic potion, below a
permanent power tier** — a renewable tactical sink, not mandatory. Cooldowns (10–14 s)
gate spam. The *greater* potion heals a **fraction of max HP**, so it scales with the
build (≈60 HP early → 240+ HP at endgame) where the flat-50 base potion does not —
keeping it the endgame heal without a flat re-tune. **No price/CD change.**

Daily-loop interaction: streak/contract rewards are gold + XP (+ day-7 HP potions); they
feed the same gold pool consumables draw from, no double-dip or runaway. **Unchanged.**

## 3. World-boss / Coliseo balance

Capstone reward ladder (`HUNTS[*].boss`):

| Boss | HP | gold | xp | signature |
|------|----|----|----|-----------|
| Tirano (abyss) | 1500 | 360 | 640 | — |
| Guardián (frost, **the win**) | 2200 | 480 | 820 | — |
| Avatar (coliseo, optional) | 3000 | 600 | 1000 | `bonusDrop:1` → double epic |

- Ladder is **monotonic on every axis** and the optional world-boss out-rewards the
  finale **proportionately** (×1.36 hp / ×1.25 gold / ×1.22 xp — all ≤ 1.6). The
  higher gate (18 > 13) and double-epic signature justify the richer haul. **Unchanged.**
- Phase 1 carapace (immune → status-shatter) + phase 2 enrage (densest radial slam) read
  as challenging-but-fair at the gated power level; the trial harness already proves both
  phases fire and resolve. **Unchanged.**
- **Status-less answer preserved (cross-system):** the carapace Nova applies a slow; the
  *antídoto* consumable purges exactly that slow — so a non-status build is never
  hard-walled, it just fights slower. New assertion B4 locks this relationship.

## 4. The one change — combined attack-speed cohesion cap

**Gap:** three independent systems add into the single `atkCD`-shortening `atkspd` term —
loot affixes (CAS-117, self-capped `AFFIX_CAP.atkspd = 40`), talents (CAS-119, self-capped
`TT_CAP.atkspd = 30`), and the *furia* consumable (CAS-192, `+50` for its window). Each
capped itself; **nothing capped the SUM**, so the three could compound without a ceiling
and let a fully-stacked build race the gated world-boss past intent / risk the swing
cadence.

**Change:**

| Value | Before | After |
|-------|--------|-------|
| Global combined atkspd ceiling | *(none — unbounded sum)* | `ATKSPD_TOTAL_CAP = 130` |

- 130 = current theoretical max (40 + 30 + 50 = 120) **plus headroom**, so **every shipped
  build is byte-for-byte unchanged today** (real builds peak ~104: affix 40 + a single
  class's atkspd node ~14 + furia 50). This is a forward guardrail, not a live nerf.
- Applied at the **one** summation site via a new shared `heroAtkspd(h)` helper, read by
  both the swing formula (`heroAttack`) and the harness cadence read-out, so they can
  never drift apart. Deterministic, no per-frame allocation, Stage-2-safe.

## 5. Verification

- `npm run trial` — **31/31 PASS** (22 original CAS-196 ACs + 9 new CAS-197 balance
  assertions: B1 gate spacing, B2 zone-scaling smoothness, B3 reward ladder + proportion,
  B4 consumable band + status-less answer, B5 atkspd cap clamp + bounded fury window).
- Regression: `npm run consumables` ✓, `npm run verify` (determinism + smoke, 60 fps) ✓,
  `npm run finale` ✓, `npm run talents` ✓, `npm run skills` ✓.
- Deploy: gh-pages (`npm run backup-host-publish`); `version.json` build == HEAD; live
  HTTP 200, 60 fps, 0 JS errors — handed to QA (b5c10283) for a directed live re-test.
