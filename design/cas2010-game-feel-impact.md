# CAS-2010 — Game-Feel / Impact Pass v1 (knob `JUICE`)

**Owner:** CTO (decompose) → GE (build) → CTO (deploy) → QA (PASS×2 + FEEL) → Gate CEO.
**Lens:** player experience (lane 1). Make the deep 24-mechanic kit *feel* contundente without a 25th mechanic. $0 art, presentation-only, RNG-neutral, reversible.

---

## §0. RECONCILIATION FINDING (read first — this is a BORROW, not a build-from-scratch)

The ticket is written as if impact feedback does not exist. **It already does, and ships live** (CAS-127 juice contract, CAS-272 juice v2, CAS-273 juice polish). Grounding audit of the live tree:

| Primitive | Status today | Seam |
|---|---|---|
| Hit-stop engine (`G.hitstop` state, `freeze(n)` "longest-wins" request, consume+early-return in `update()`) | **LIVE** | `sim/sim.js:202`, `:1864`, `:4061` |
| `freeze()` firing on hit-pop (crit-scaled), kill-confirm, parry, parry-riposte, hero-hurt | **LIVE** | `:2639`, `:2685`, `:4919`, `:4892`, `:4954` |
| `shakeAdd(a)` — escalated by event, **reduce-motion + `settings.shake` gated** | **LIVE** | def `:1860`; ~50 call sites incl. crit `:2618`, backstab `:2637`, combo-punish `:2633`, kills/boss |
| Hit-flash / impact fx / crit+backstab floaters | **LIVE** | `render/render.js` impact/strikeflash/crunch fx; floaters `:2618/:2634/:2638` |
| Juice dev harness + `juiceState()` contract | **LIVE** | `sim/sim.js:8434`; `tools/cas127-juice.mjs`, `cas273-juice.mjs` |
| Accessibility master switch (`reduceMotion` zeroes shake) | **LIVE** | `sim/sim.js:8449`, settings menu `render/render.js:3479` |

**What is genuinely MISSING vs. the ticket — the actual v1 scope:**

1. **No `JUICE` knob.** Shake is gated by `settings.shake`+`reduceMotion`; **hit-stop (`freeze`) is UNGATED** — it does not honor `reduceMotion` and has no off switch. This is a real accessibility defect (motion-sensitive players cannot disable freeze-frames).
2. **Hit-stop coverage gaps.** `freeze()` does NOT fire on four CORE verbs that the ticket names and that read flat today: **backstab** (`:2637` shake only), **combo-finisher / execute-punish** (`:2633` shake only), **poise-break / stagger** (`:2527` fx+floater only, no shake, no freeze), **boss phase-2 transition** (SIGNATURE_BOSS — confirm at build; `shakeAdd` present, `freeze` to verify/add).
3. **No unified sub-flag control.** `hitStop` / `screenShake` / `flash` cannot be toggled independently.

**CTO decision (Build-vs-Buy-vs-Borrow + Boring-where-it-counts):** Do **NOT** rewrite the working hit-stop engine into a new present-clock module. Reuse `freeze()` / `shakeAdd()` as-is; the v1 pass is a **thin gating + coverage layer**: add one `JUICE` knob, route the existing (and 4 new) calls through it, and give `freeze()` the same reduce-motion/off-switch discipline `shakeAdd()` already has. Small blast radius over proven code beats a purity refactor.

---

## §1. Scope

**In:** `JUICE` config knob; gate all hit-stop + shake + impact-flash behind it with independent sub-flags; extend `freeze()`+`shakeAdd()` to backstab / combo-finisher / poise-break-stagger / boss-phase-2; make `freeze()` reduce-motion-aware. Ships **`enabled:true` LIVE** (realce de sistemas ya vivos — no dark flip).

**Out:** new mechanics, new art/assets, new render primitives, sim/damage/RNG changes, any change to `settings.shake`/`reduceMotion` semantics beyond wiring hit-stop into them.

---

## §2. The `JUICE` knob (single source of truth)

Add to `sim/config.js` (mirror the shape of existing knobs like `COMBAT_CODEX`):

```js
// CAS-2010 — Game-Feel / Impact Pass v1. Presentation-only, RNG-neutral, $0 art.
// Gates the EXISTING hit-stop (freeze) + screen-shake (shakeAdd) + impact-flash layer
// plus the v1 coverage extensions. enabled:true ships LIVE (realce, no dark flip).
// Each sub-flag is an independent accessibility off-switch; ALL sub-flags off ⇒ combat
// reads exactly as a no-juice baseline (no freeze, no shake) — motion-safe.
export const JUICE = {
  enabled: true,
  hitStop:     true,   // micro freeze-frames on impact verbs; also honors settings.reduceMotion
  screenShake: true,   // escalated camera shake (already reduceMotion+settings.shake gated)
  flash:       true,   // impact tint / crit+backstab floater polish
  hitStopCapFrames: 9, // hard cap (frames @60fps ≈ 150ms) — matches current longest freeze; DoD 60fps guard
};
```

**Gate discipline (GE, single-source):**
- `freeze(n)` becomes: `if(!JUICE.enabled || !JUICE.hitStop || G.settings.reduceMotion) return; n=Math.min(n,JUICE.hitStopCapFrames); if(n>G.hitstop) G.hitstop=n;` — one edit closes the accessibility gap for **every** call site at once.
- `shakeAdd(a)` gains the `JUICE.enabled && JUICE.screenShake` guard on top of its existing `reduceMotion`/`settings.shake` gate. (Do not remove existing gates.)
- Impact-flash / crit-floater polish gated by `JUICE.enabled && JUICE.flash` at the render/fx seam.

---

## §3. Trigger → seam map (reuse existing calls; add the 4 gaps)

| Verb | Shake today | Hit-stop today | v1 action |
|---|---|---|---|
| Crit | ✅ `shakeAdd(3.5)` `:2618` | ✅ `freeze` scaled `:2639` | gate only |
| Parry / riposte | ✅ `:4919` | ✅ `:4919/:4892` | gate only |
| Kill / boss-kill | ✅ | ✅ `:2685` | gate only |
| Hero hurt | ✅ | ✅ `:4954` | gate only |
| **Backstab** | ✅ `shakeAdd(6)` `:2637` | ❌ | **add `freeze(6)`** |
| **Combo-finisher / execute-punish** | ✅ `shakeAdd(7)` `:2633` | ❌ | **add `freeze(5)`** |
| **Poise-break / stagger** | ❌ `:2527` | ❌ | **add `shakeAdd(5)` + `freeze(6)`** |
| **Boss phase-2 transition** | ~`shakeAdd` `:4329/4344` (verify) | ❌ (verify) | **add `freeze(9)`** (capped) |

Freeze magnitudes reuse the existing scale (kill=8/9, parry=6, hurt=4, hit-pop 2–7). All ≤ `hitStopCapFrames`.

---

## §4. Determinism / RNG-neutral — the load-bearing DoD (GE must prove)

`freeze()` and `shakeAdd()` **consume zero RNG** (`srand`) — they only touch presentation state (`G.hitstop`, `G.shake`, both un-serialized, transient). The hit-stop early-return in `update()` gates BEFORE any `srand()` draw. Therefore:

- **RNG-neutral (0 new draws):** toggling `JUICE.enabled`/sub-flags changes the `srand` draw **count and sequence by exactly zero**. Harness asserts identical draw log on/off.
- **Seeded reproducibility (byte-identical):** same seed + same config, run twice ⇒ byte-identical state hash. `freeze` early-return is deterministic given the same `update()` call sequence.
- **Sub-flags OFF ⇒ no-juice baseline:** with `hitStop:false` (or `enabled:false`) `freeze()` is a no-op ⇒ `update()` never early-returns ⇒ sim advances identically to a build with no hit-stop. Harness drives N `update()` calls with `JUICE.hitStop` off and asserts the tick count / state matches the un-frozen baseline.

**Guardrail:** GE must NOT touch `sim.js` damage/tick/roll logic. The ONLY sim edits allowed are: the `freeze()`/`shakeAdd()` gate bodies + the 4 new `freeze/shakeAdd` call sites at existing verb seams. `git show --stat` on the build commit must show sim.js touched ONLY in those regions (config/render blobs otherwise).

---

## §5. Accessibility

- `settings.reduceMotion` = master off for **both** shake (already) **and** hit-stop (new). Motion-sensitive players get a fully flat, freeze-free combat.
- `JUICE` sub-flags give granular control (e.g. keep flash, drop shake+freeze).
- ALL sub-flags off ⇒ byte-identical *feel* to a no-juice baseline (no freeze, no shake); floaters/damage numbers remain (legibility, not motion).

## §6. 60fps / frame budget

Hit-stop pauses the sim but the RAF loop keeps calling `render()` every frame — freeze does **not** drop frames, it holds them. Cap = `hitStopCapFrames` (≈150ms) so no single event stalls perceptibly. QA must confirm sustained ~60fps through a crit/backstab/stagger burst desktop+mobile.

## §7. Deploy (0-leak)

Blobs: `sim/config.js` (knob), `sim/sim.js` (gate bodies + 4 call sites — presentation state only), and `render/render.js` **iff** flash gating touches it. `git show --stat` must touch EXACTLY those + `version.json`. `md5 served==HEAD` for each. No other file changes. Rollback = revert the presentation blobs (1 knob flip `enabled:false` also fully disables live).

---

## §8. Acceptance Criteria (harness `tools/cas2010-juice.mjs`, go-forward)

- **AC0** `node --check` clean on all edited blobs; boot 0 JS-errors.
- **AC1** `JUICE` knob exists with `enabled/hitStop/screenShake/flash/hitStopCapFrames`; `enabled:true`.
- **AC2** `freeze()` honors `JUICE.enabled && JUICE.hitStop && !reduceMotion` and caps at `hitStopCapFrames`.
- **AC3** `shakeAdd()` honors `JUICE.enabled && JUICE.screenShake` (plus existing gates); existing gates intact.
- **AC4** Hit-stop now fires on backstab, combo-finisher, poise-break/stagger, boss phase-2 (observe `G.hitstop>0` after each event via dev spawn + forced trigger).
- **AC5 (RNG-neutral):** `srand` draw log identical with `JUICE` on vs off — 0 new draws.
- **AC6 (reproducibility):** same seed run-twice ⇒ byte-identical state hash, `JUICE` on.
- **AC7 (off==baseline):** `JUICE.hitStop:false` ⇒ `update()` never early-returns; N-tick state matches un-frozen baseline. `reduceMotion:true` ⇒ `G.hitstop` stays 0 through a forced crit.
- **AC8 (24 systems green):** existing fullbuild regression (delta of `cas2005`) still 24/24 wired.
- **AC9 (60fps sanity):** no per-frame allocation added; freeze holds frames, doesn't drop them.
- **AC10** All sub-flags off ⇒ combat produces no freeze and no shake (motion-safe), floaters intact.

## §9. Chain

1. **Build (GE)** — knob + gates + 4 coverage seams + `tools/cas2010-juice.mjs` (AC0–AC10, PASS×2). Ships `enabled:true`.
2. **Deploy (CTO)** — 0-leak overlay to gh-pages, version flip, `md5 served==HEAD`.
3. **QA** — PASS×2 desktop+mobile vs LIVE: 24 systems green, boot 0-err, ~60fps sustained through impact burst, sub-flags/reduceMotion off-switch verified, + FEEL report (¿golpes contundentes? antes/después).
4. **Gate CEO** — served==doc + FEEL ⇒ GO/NO-GO. Rollback = revert presentation blobs.

**No-gated** (realce, reversible, $0 art). Ships LIVE on Gate GO.
