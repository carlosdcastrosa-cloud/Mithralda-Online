# CAS-2035 — EVO: Pantalla Resumen de Ciclo NG+ ("Ciclo N recap", overlay data-driven)

**Owner:** CTO · **Goal:** Gameplay Evolution · **Status:** decomposed 2026-07-11

## Intent

When a player closes a conquest cycle (APEX — the 4 CONQUEST_ZONES bosses down) and the
World-Tier ascend offer fires, show a **data-driven recap of the cycle just completed** and a
**preview of what NG+ N+1 escalates**, so the ascend decision is informed instead of a blind
"Ascend / Stay". This is the missing ceremony moment: today the player accepts a climb without
seeing what it costs them or grants them.

## Reconciliation — what already ships (do NOT rebuild)

The whole ascend machine is live via CAS-450 + CAS-2024 (NG+). The recap **composes on top of
it**; it invents no flow.

- **Ascend scene + prompt** — `offerAscend()` `sim/sim.js:722` sets `G.ascend={tier:t+1}` and
  `G.scene="ascend"`; `renderAscend()` `render/render.js:3407` draws the panel; accept/skip via
  `acceptAscend()`/`declineAscend()` `sim/sim.js:732/747`. Input: keyboard `input.js:199`,
  pointer `ascendTap` `input.js:580`.
- **Per-tier mods (the preview data)** — `worldTierMods()` `sim/sim.js:772` (hp/dmg/affix ×),
  `ngEssMul()` `sim/sim.js:775`, `ngLootFloor()` `sim/sim.js:768`, `ngPoiseMul()`; already
  surfaced read-only via the `dev.ngState()` hook `sim/sim.js:5233` (the exact table QA
  validated per-tier in CAS-2032). `WORLD_TIER` / `NG_PLUS` config `sim/config.js:1605/1616`.
- **Cycle snapshot** — `conquestSnap()` `sim/sim.js:531` → `{tier,cap,down,pct}`.
- **Hero/meta stats** — hero `lvl`, gear on `h`, banked Esencia `ensureMeta().essence`
  (`sim/sim.js:920`). All durable, all already computed.
- **Copy** — `ng*` string set `strings.js:390` (`ngAscendName(t)` = "Ciclo N · NG+", etc.).

## CTO decision — scope of v1

**Data-driven from ALREADY-DURABLE + derivable state only. NO new save field** (preserves the
CAS-2024 invariant: NG+ rides `conquest.tier`, 0 new serialized state, 0 save regression). The
recap reads counters that already exist; it stores nothing new.

v1 recap content (all derivable at the ascend moment):

1. **Cycle header** — "Ciclo N · Dominios conquistados 4/4" (`conquestSnap`, `STR.conquestProgress`).
2. **Hero snapshot** — class, level (`h.lvl`), Esencia banked (`ensureMeta().essence`), gear
   highlight (best equipped rarity/name from `h`).
3. **NG+ N+1 escalation preview** — THE HOOK. The numeric deltas that apply IF you ascend, for
   `tier+1`: enemy HP +X% / DMG +X% (`WORLD_TIER.hpPct/dmgPct × k`), loot floor → rarity
   (`ngLootFloor`), Esencia ×M (`ngEssMul(tier+1)`), poise× if the sub-flag is on. This is
   genuinely new information — today nothing tells the player what a climb does numerically.
4. **Framing copy** — reuse `ng*` strings ("Los dominios renacen…").

### Deferred to v2 (flagged to CEO) — cycle-scoped run stats

A richer recap would show **kills / bosses / time / deaths THIS CYCLE**. A cycle spans multiple
runs (death→retry), so those need **persisted cross-run accumulators** = a new save-schema field.
That is a one-way door (save format) and trips the confirm-gate on its own ticket — out of scope
for a thin, reversible v1. Domain lenses: **Reversibility** (avoid a one-way save change for a
cosmetic panel) + **YAGNI** (the escalation preview already carries the screen). `G.recap`
(built at *death*, `sim/sim.js:3567`) is per-*run*, not per-*cycle*, so it does not cover this
honestly — do not fake cycle totals from a single run.

## Architecture — how it hooks (draw-neutral, DARK, gate-flippable)

New sub-flag **`NG_PLUS.recap: false`** next to `reframePrompt` in `sim/config.js`. Gating:

- `offerAscend()`: when `NG_PLUS.enabled && NG_PLUS.recap`, set `G.scene="ascendRecap"` instead
  of `"ascend"` (same `G.ascend={tier:t+1}` payload). When the flag is **off ⇒ byte-identical to
  HEAD** (scene stays `"ascend"`, `renderAscend` untouched).
- New `renderAscendRecap()` in `render/render.js` (own function, `renderAscend` left byte-id):
  draws the recap + preview + the **same two buttons** pushing `ui.ascendRects` with
  `act:"accept"`/`act:"skip"` so the existing input path is reused verbatim.
- `input.js`: broaden the two ascend scene checks (`input.js:199` keyboard, `input.js:580`
  pointer) to also match `"ascendRecap"` → route to `acceptAscend`/`declineAscend` unchanged.
- **Zero RNG**: the recap is pure read + arithmetic over existing helpers. No `srand`/`frr`
  draw on any recap path (the accept/skip fx already live in `acceptAscend`). `enabled:false` OR
  `recap:false` ⇒ `srand` + `save.v1` byte-identical to HEAD **by construction**.

**Blast radius:** isolated to one new scene value + one new render fn + a 2-line input scene
broadening + 1 config sub-flag + new `ng*Recap` strings. `renderAscend`/`acceptAscend`/save
format all untouched. **Reversibility:** 1-line flip `recap:false→true` after CEO gate.

## Delivery chain

1. **Build (GE)** — `NG_PLUS.recap` sub-flag + `renderAscendRecap()` + `offerAscend` scene
   branch + input scene broadening + `ng*Recap` strings. Ships **DARK** (`recap:false`). Harness
   AC PASS×2: (a) off ⇒ ascend scene/render/save byte-id HEAD; (b) armed ⇒ scene `ascendRecap`,
   recap reads match `ngState()` per-tier table; (c) accept/skip still drive
   `acceptAscend`/`declineAscend`; (d) 0 srand draws on recap path.
2. **Deploy (CTO)** — overlay gh-pages DARK (blob set = `config.js` + `sim.js` + `render.js` +
   `strings.js`; derive from `git diff --stat`, do not trust a path list).
3. **QA** — observable PASS×2: arm `recap:true` in the live singleton, drive apex→ascend→recap
   both platforms, verify data-driven preview values equal `ngState(tier+1)`, ~60fps, 0 err.
4. **Gate (CEO)** — flip `NG_PLUS.recap:false→true`.

Umbrella CAS-2035 closes on `children_completed`.
