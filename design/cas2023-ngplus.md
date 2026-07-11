# CAS-2023 — NG+ / Nueva Partida Plus (design + decomposition)

**Owner:** CTO. **Ships DARK** (`NG_PLUS.enabled:false`), 1-line flip after CEO gate GO.
Precedent: Boss Rush (CAS-1988) — opt-in mode reusing live systems, own CEO gate, not board.

---

## 0. THE RECONCILIATION (the load-bearing CTO call)

The ticket asks for NG+: opt-in cycle-restart at the APEX end condition, carry gear/Esencia/unlocks,
deterministic escalation, better rewards, cap. **Before building anything, I audited what already
ships — and most of the NG+ loop is ALREADY LIVE as CAS-450 World Tier / Conquista.** The config
comment at `sim/config.js:1588` literally calls CAS-450 *"NG+ ligero."*

What CAS-450 already delivers today (live, QA-green):

| NG+ requirement (ticket)                     | Already live via CAS-450?                                   | Seam |
|----------------------------------------------|-------------------------------------------------------------|------|
| Opt-in prompt at 4-zone APEX end condition   | ✅ `offerAscend()` → `"ascend"` scene, accept/decline        | sim.js:717-748, 675-678 |
| NEVER forced (can decline, keep playing)     | ✅ `declineAscend()` stays on tier, re-offers next cycle     | sim.js:746 |
| Carry gear / Esencia / unlocks over restart  | ✅ hero object untouched; only tier bumps + world re-arms    | sim.js:732-742 |
| World reset / repopulate on accept           | ✅ `G.hunts=initHunts()` re-arms every climax; curses clear  | sim.js:738-741 |
| Deterministic escalated difficulty           | ✅ `worldTierMods()` hp×/dmg×/affix× per tier, MULTIPLICATIVE| sim.js:748-752, applyZoneScale |
| RNG-neutral (0 extra draws, byte-id baseline)| ✅ tier-1 → `null` path; no RNG in accept/decline            | sim.js:748-752 |
| Save-isolated, 0 regression                  | ✅ `conquest.{tier,bossesDown}` additive; absent ⇒ tier 1    | sim.js:1721-1725 |
| Cap on cycles                                 | ✅ `WORLD_TIER.cap:5`; offer stops at cap                    | config.js:1605, sim.js:723 |

**Decision (build-vs-buy-vs-borrow + YAGNI + reversibility):** NG+ v1 does **NOT** re-implement
the scaler, the carry-over, the world-reset, or the opt-in prompt. Rebuilding any of those would
duplicate a load-bearing, save-durable, QA-proven system (CAS-450) — a one-way-door regression risk
for **zero** new player value. NG+ v1 is a **thin escalation + framing layer that COMPOSES on top of
CAS-450**, gated by its own `NG_PLUS` knob.

**This changes the shape of the lane and I am flagging it to the CEO at the gate:** NG+ is a *small*
increment, not a major new lane. That is the honest read. The net-new player value below is real and
worth shipping (it deepens the replay reward curve), but it is measured in a config-heavy build, not
a new subsystem. If the CEO wanted a *bigger* NG+ (e.g. mirrored enemy palettes, new affixes, a
distinct NG+ boss variant), that is net-new **art/design scope** that trips the confirmation gate and
belongs on its own ticket — I will surface that option, not assume it.

---

## 1. What NG+ v1 genuinely ADDS over CAS-450

CAS-450 escalates enemy hp/dmg/affix-rate and pays an apex draft, but the **reward-per-cycle curve is
flat** past the apex bump. The roguelite retention driver the ticket wants is *"climbing tiers pays
visibly better loot."* Three net-new, draw-neutral escalations + a framing polish:

1. **Loot rarity floor rises per cycle.** Today the base drop floor is fixed (`e.rwdMinR||cfgH.minR`).
   NG+ lifts the min-rarity by `lootFloorPerTier × (tier−1)`, capped at legendary. Draw-neutral: it
   shifts the `minR` argument at the **existing** `rollGearInst` call sites — same draw count, exactly
   the CAS-450 affix-threshold pattern (move the threshold, don't add a draw).
2. **+Esencia rewards scale per cycle.** Multiply Esencia grants (champion 25, signature-boss bonus,
   affix drip) by `1 + essMulPerTier × (tier−1)`. Pure arithmetic at the grant site — **0 draws**.
3. **(sub-flag, default off) Enemy poise× per cycle.** `poisePctPerTier` adds a poise multiplier in the
   `worldTierMods`/`applyZoneScale` layer (post-spawn clone, like hp/dmg) — **0 draws**. Default 0 so
   v1 ships without touching the poise/stagger balance the CAS-2004 pass just tuned; CEO can flip it on.
4. **Framing:** strengthen CAS-450's modest `"ascend"` scene copy into an explicit **"Ciclo N+1 /
   Nueva Partida Plus"** prompt (render/strings only) so the opt-in reads as NG+, not a quiet tier bump.

Everything else the ticket lists (carry-over, world reset, cap, opt-in, determinism, save-isolation)
is **already satisfied by CAS-450 and reused verbatim** — the acceptance criteria below assert that
reuse rather than rebuild.

---

## 2. The knob (single, sub-flags all apagables, DARK)

```js
// sim/config.js — near WORLD_TIER (CAS-450), because NG_PLUS is its reward-layer companion.
export const NG_PLUS = {
  enabled: false,          // DARK ship. Flip 1-line → true after CEO gate GO. Reversible.
  // Reward escalation layered ON TOP of CAS-450 WORLD_TIER enemy scaling.
  // Reads h.conquest.tier (already durable, already carried over) — NG_PLUS adds NO new save state.
  lootFloorPerTier: 1,     // +N min-rarity steps per World Tier above 1 (clamped ≤ legendary). draw-neutral.
  essMulPerTier:   0.25,   // +25% Esencia rewards per tier above 1. 0 draws (arithmetic at grant).
  poisePctPerTier: 0.0,    // sub-flag: enemy poise× per tier (0 = OFF; post-spawn clone, 0 draws).
  reframePrompt:   true,   // sub-flag: explicit "Ciclo N+1 / NG+" copy on the CAS-450 ascend scene.
  cap: 5,                  // align with WORLD_TIER.cap; the ascend offer already stops here.
};
```

**enabled:false ⇒ byte-identical to HEAD:** every net-new seam is `if(NG_PLUS.enabled)`-gated and, when
off, returns the pre-existing value (loot floor = `e.rwdMinR||cfgH.minR`; Esencia mul = 1; poise mul =
1; prompt copy = CAS-450 string). The CAS-450 ascend loop runs unchanged. `save.v1` + `srand`
fingerprint byte-id.

**Save:** **NO new save field.** NG+ rides `conquest.tier` (CAS-450, already additive & durable). This
is strictly better than the ticket's suggested `mithralda.ngplus.v1` — 0 new serialized state ⇒ 0 save
regression *by construction*, nothing to arm/clear. (Recorded as a deliberate deviation from the
ticket's "save aislado" suggestion: the isolated save it asks for already exists as `conquest`.)

**RNG-neutral STRONG:** no new RNG stream is created. Loot-floor shifts an existing param; Esencia and
poise are draw-free. `srand` order is never touched at any tier, on or off.

---

## 3. Seams for the Build (GE) — exact hook points

- **Loot floor** — `sim/sim.js:~2949` (champion/capstone clear) `rollGearInst(srand,win[0],win[1], minR)`
  and the APEX bonus drop `~2986`: replace `minR` with `ngLootFloor(minR, tier)` helper (clamps ≤ 4).
  Same call, same draw.
- **Esencia** — wrap the Esencia grant sites: champion (`CHAMPION.essence`), signature-boss
  `rewards.essenceBonus` (sim.js:2822-2825), affix drip (`MOB_AFFIX_ESSENCE`). Multiply by
  `ngEssMul(tier)`. Pure math.
- **Poise (sub-flag)** — extend `worldTierMods()` (sim.js:748) to also return `poiseMul` when
  `NG_PLUS.enabled && poisePctPerTier>0`, applied in the same `applyZoneScale` clone layer as hp/dmg.
- **Prompt reframe** — `strings.js` ascend copy (`ascendName`/`ascendAccepted`/the offer prompt) +
  the `"ascend"` scene render: show "Ciclo N+1 / Nueva Partida Plus" framing when
  `NG_PLUS.enabled && reframePrompt`. Render/strings only — 0 sim, 0 RNG.
- **Blob set:** GE derives the EXACT deploy blob set from `git diff --stat <parent>..HEAD` over the
  full tree (lesson CAS-2018: never trust the ticket path-list — `strings.js` is served from root and
  is easy to miss). Expected ≈ `config.js + sim.js + strings.js` (+ `render.js` iff ascend scene copy
  lives there).

---

## 4. Chain (umbrella CTO-owned, closes on children_completed)

1. **Build (GE)** — implement the `NG_PLUS` knob + 4 gated seams DARK. Dev harness AC0-N incl.
   OFF==HEAD byte-id (srand + save fingerprint), tier-scaled loot floor + Esencia ON, poise sub-flag,
   cap clamp, and — critically — assert CAS-450 ascend/carry-over path is UNCHANGED (no rebuild). PASS×2.
2. **Deploy (CTO)** — overlay blob set to gh-pages, `md5 served==HEAD`, DARK `enabled:false`, 0-leak
   diff = exactly the blob set + version.json.
3. **QA OBSERVABLE PASS×2 (QA)** — DRIVE the real sim loop (lesson CAS-1947, not just byte-correct):
   arm `NG_PLUS.enabled=true` at runtime, drive a full conquest cycle → APEX → accept ascend → verify
   tier 2 loot floor lifted + Esencia scaled + carry-over intact + world re-armed; OFF==HEAD byte-id.
   Boot smoke desktop+mobile 0-err ~60fps.
4. **Gate CEO (e77e7f98)** — review SERVED DARK diff + QA evidence + **the reconciliation call above**
   (NG+ = thin layer over CAS-450, not a new lane). On GO, CTO verifies live + flips 1-line.

**DoD:** chain done + live byte-verified DARK + CEO GO + (on GO) flip live-verified.
