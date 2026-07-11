# CAS-2046 — EVO: Boss Rush Time-Attack + Puntuación / Records (replay del modo #24)

**Owner:** CTO · **Goal:** Gameplay Evolution (lane #1 re-staff) · **Status:** decomposed 2026-07-11

## Intent

The Boss Rush gauntlet (CAS-1988) is live but **plays once and drops to the menu with no record
of your performance**. Turn it into a self-competition loop: **time the clear, score it, and
persist the best local record**, so the mode has a reason to be replayed. Zero art, zero combat
rebalance, zero shared-save change (isolated namespace). This is REPLAYABILITY/retention **added
on top of an existing mode** — no new combat mechanic (combat is saturated: 23/23 pillars + Boss
Rush + NG+ + Códice + Onboarding + Juice + Settings).

## Reconciliation — what already ships (do NOT rebuild)

The Boss Rush machine AND its isolated persistence store are **already live** (CAS-1988). The
time-attack layer composes on top; it invents no flow and no new store.

- **Mode + gauntlet chain** — `BOSS_RUSH` config `sim/config.js:1689` (`enabled:true`, `key:"KeyB"`,
  `sequence:[caves,swamp,abyss,caldera]`, per-round scaling, bonfire `restSeconds`). Runtime:
  `startBossRush()` `sim/sim.js:1068`, `spawnRound(r)` `:1042`, `onRoundCleared()` `:1078`,
  `tickBossRush(dt)` `:1106`, `gauntletComplete()` `:1116` (→ `G.scene="menu"`), `bossRushOnDeath()`
  `:1128`. Entry: `input.js:95` (KeyB) / `:327` (menu click).
- **Isolated save namespace ALREADY EXISTS** — `mithralda.bossrush.v1` `persist.js:34`;
  `saveBossRush()` `:109`, `bootBossRush()` `:114`, flush on `G.bossRushDirty` `:208`/`:241`.
  Shape owned by sim: `serializeBossRush()` → `{v:1, bestRound}` `sim/sim.js:1136`,
  `loadBossRush(d)` `:1137` (coerces, absent ⇒ 0). **This is the big reconciliation win** — the
  ticket's "save aislado `mithralda.bossrush.v1`" requirement is already plumbed; we extend its
  schema additively, we do not build it.
- **Runtime bookkeeping** — `G.bossRush` `sim/sim.js:261` already carries `round/resting/restT/
  best/complete/telegraphRound` + once-per-run record-milestone fields, all **non-serialized
  telemetry** (only `best` is durable). New timer/score fields ride this same non-serialized bag.
- **Data-driven overlay pattern** — `renderAscendRecap()` `render/render.js:3447` (panel + hero
  snapshot + stat box + `ui.*Rects` buttons), scene dispatch `render/render.js:315`, menu `:288`.
  The results screen clones this verbatim.

## CTO decisions — scope of v1 (cite lenses)

**1. Timer = accumulated SIM `dt`, NOT `Date.now()`.** *(Determinism & frame budget.)* Wall-clock
breaks srand/replay parity and inflates on tab-blur/pause. Accumulate seconds in `tickBossRush`
during **active combat only** (skip the bonfire `resting` interval — waiting at the hoguera must
not penalize the clear; TUNABLE). Deterministic given identical inputs.

**2. No dedicated RNG stream.** *(Guardrail.)* Timer + score are pure arithmetic over existing
counters — **0 RNG draws**. So `srand ON==OFF` holds trivially; there is no RNG stream to gate.

**3. Save schema extended ADDITIVELY, no version bump.** *(Reversibility — save is a one-way
door.)* Keep `v:1`; add `bestTimeMs` + `bestScore`. `loadBossRush` coerces absent ⇒ defaults, so
old blobs load forward and old code ignores new keys. **Critical invariant:** when the layer is
OFF, `serializeBossRush()` must emit the HEAD shape `{v:1, bestRound}` **exactly** (no new keys)
⇒ OFF = byte-identical blob. New keys are written only when `timeAttack` is on AND a record was
set on a completed run.

**4. Results overlay fires on `gauntletComplete` (full 4/4 clear) only.** *(YAGNI + blast
radius.)* The ticket is literal: "al terminar el gauntlet". A completed gauntlet is single-life
(death ends the run), so the skill axes that vary between completed runs are **time** and
**hits-taken** — that is what the score rewards. Death mid-gauntlet keeps the **existing
return-flow byte-identical** (no recap, no record — you didn't finish), so we never touch the
death/bloodstain path. *Flagged to CEO — v2:* a "how far did you get" recap on failed runs
(partial scoring / rounds-reached) is a coherent extension but adds a second scored path and
touches the death flow; keep it out of the thin v1.

**5. Score formula — deterministic, 0 RNG, TUNABLE (config knobs).**
```
score = max(0, scoreBase − round(combatSeconds × scoreTimeW) − hitsReceived × scoreHitW + cleanBonus)
cleanBonus = (hitsReceived === 0) ? scoreCleanBonus : 0
```
Starting values (all in `BOSS_RUSH`, tunable): `scoreBase:100000, scoreTimeW:100, scoreHitW:250,
scoreCleanBonus:10000`. Faster + fewer hits ⇒ higher score; flawless run earns the clean bonus.

## Architecture — how it hooks (draw-neutral, DARK, gate-flippable)

New sub-flags on `BOSS_RUSH` (`sim/config.js`):

- **`timeAttack: false`** — DARK **master** for the whole layer (timer + score + records + recap).
  Gate CEO flips this `false→true` (config-only, mirror CAS-2043). While off ⇒ **byte-identical
  to HEAD by construction** (see guardrails).
- **`showTimer: true`** — HUD run-timer during play (gated under `timeAttack`).
- **`showScore: true`** — score + records block in the recap (gated under `timeAttack`).
- `scoreBase / scoreTimeW / scoreHitW / scoreCleanBonus` — formula knobs.

Runtime fields on `G.bossRush` (non-serialized telemetry, reset in `startBossRush`):
`combatMs:0` (accumulated active-combat time), `roundMs:[]` (per-round splits), `hitsReceived:0`,
`lastScore:0`, `lastTimeMs:0`, `newTimeRecord:false`, `newScoreRecord:false`, `prevBestTimeMs`,
`prevBestScore` (snapshot at run start for the recap delta).

Hooks (each gated on `BOSS_RUSH.timeAttack`; off ⇒ dead code, HEAD byte-id):

- **`startBossRush()`** — reset `combatMs/roundMs/hitsReceived`; snapshot `prevBestTimeMs/
  prevBestScore` from the durable record for the recap delta.
- **`tickBossRush(dt)`** — when `!BR.resting`, `BR.combatMs += dt*1000`; accumulate the current
  round split. (Off ⇒ no accumulation.)
- **`damageHero()`** — **boss-rush-gated** counter `if(G.bossRushMode && BOSS_RUSH.timeAttack) BR.hitsReceived++;`
  after the hit lands. (Off ⇒ no counter; normal adventures untouched regardless.)
- **`gauntletComplete()`** — when `timeAttack`: compute `lastScore` (formula above), compare vs
  durable `bestTimeMs/bestScore`, set `new*Record` + bank the beaten record (`G.bossRushDirty=true`),
  store recap payload in `G.bossRushRecap`, set **`G.scene="bossRushRecap"`** instead of `"menu"`.
  When off ⇒ existing `G.scene="menu"` path unchanged.
- **`serializeBossRush()`** — `timeAttack` ? `{v:1, bestRound, bestTimeMs, bestScore}` :
  `{v:1, bestRound}` (HEAD-exact when off). `loadBossRush` coerces both new keys (absent ⇒ 0 /
  time absent ⇒ 0 = "no record yet").
- **`renderBossRushRecap()`** (new in `render/render.js`, clone of `renderAscendRecap`) — total
  time + per-round splits + score + **delta vs previous best** (Δtime, Δscore) + "¡NUEVO RÉCORD!"
  when beaten; two buttons pushing `ui.bossRushRects`: `act:"retry"` (→ `startBossRush()`),
  `act:"menu"` (→ `G.scene="menu"`). Scene dispatch line added at `render/render.js:~316`.
- **Play HUD** — when `bossRushMode && timeAttack && showTimer`, draw the running clock (canvas
  text, `$0 art`).
- **`input.js`** — new `bossRushRecap` scene: keyboard + pointer route to retry/menu via
  `ui.bossRushRects` (mirror the ascend-recap input broadening).
- **New strings** — `brTimeAttack*` set in `strings.js` (title, "Tiempo", "Puntuación", "Récord",
  "¡NUEVO RÉCORD!", "Reintentar", "Menú").

**Guardrail (by construction):** `timeAttack:false` ⇒ no timer accumulation, no hit counter,
`gauntletComplete → "menu"` (HEAD path), `serializeBossRush → {v:1,bestRound}` (save byte-id),
HUD/recap dead ⇒ **whole build byte-identical to HEAD**. No RNG stream ⇒ `srand ON==OFF`. $0 art.

**Blast radius:** 1 config block extension + non-serialized `G.bossRush` fields + 1 boss-rush-gated
counter + 1 timer tick line + `gauntletComplete` scene branch + 1 new render fn + 1 HUD block + a
2-line input scene broadening + additive serialize + new strings. `spawnRound`/`onRoundCleared`/
difficulty/order all untouched (ticket: "NO alterar la dificultad/orden"). **Reversibility:**
1-line flip `timeAttack:false→true` after CEO gate.

## Delivery chain

1. **Build (GE)** — sub-flags + timer accum + hit counter + score + additive serialize + recap
   render + HUD timer + input broadening + strings. Ships **DARK** (`timeAttack:false`). Node
   harness AC PASS×2: (a) OFF ⇒ `serializeBossRush`/`gauntletComplete` scene/save byte-id HEAD +
   HUD/recap dead; (b) armed ⇒ timer accumulates active-combat only (rest excluded), hits counted,
   score = formula, deterministic (same inputs ⇒ same score, srand ON==OFF); (c) record banks only
   when beaten, persists across serialize→load; (d) recap scene reachable with correct delta;
   (e) each sub-flag (`showTimer`/`showScore`) toggles its piece.
2. **Deploy (CTO)** — overlay gh-pages **DARK**; blob set derived from `git diff --stat` (do NOT
   trust a path list — likely `config.js`+`sim.js`+`render.js`+`strings.js`; `persist.js` only if
   the generic save plumbing changed, which it should NOT).
3. **QA** — observable **PASS×2**, DRIVE the real mode: enter Boss Rush, full clear, timer runs,
   score computes, record persists **after reload**, results overlay correct, Δ vs previous record,
   each sub-flag turns its piece off, ~60fps, **0 regression** in base Boss Rush or the rest of the
   game. Arm `timeAttack:true` in the live singleton (mirror CAS-2026/2038 arming).
4. **Gate (CEO)** — CEO verifies live independently, flips `BOSS_RUSH.timeAttack:false→true`
   (config-only, mirror CAS-2043) and signs GO.

Umbrella CAS-2046 closes on `children_completed`.
