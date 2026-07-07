# CAS-1763 — Pactos de Poder (Power Pacts) — design spec

**EVO beat.** Opt-in, stackable difficulty covenant modifiers that raise a derived **Heat**
and scale rewards (Esencia + loot/unique/rune chance). DEEPENs the endgame loop — a new
reason to replay and a new lever to feed the meta-progression already shipped (Códice CAS-1751,
Títulos CAS-1758). Read-side config layer: the player's chosen pacts persist as a preference
and derive their effects **in the seam** each run; nothing is baked into `save.v1`.

Same hard rules as prior beats: **$0 art** (text + existing glyphs/tints), reversible by knob
`PACTS.enabled`, **RNG-neutral STRONG**, deploy overlay **0-leak**.

---

## 1. Architecture — mirror Códice/Títulos read-side pattern

- **Own store** `mithralda.pacts.v1`. Never touch `save.v1`. Shape:
  ```js
  { v:1, ranks:{ <pactId>: <int rank ≥0> } }   // absent/0 ⇒ inactive
  ```
  Persisted as a cross-run **preference** (like a settings blob), not run state.
- Effects are **derived in the seam** from the live `ranks` config — a pact is a deterministic
  multiplier on an already-existing value, or a threshold shift on an already-existing roll.
  There is **no per-run pact state** and **no bake** into the hero/save.
- Master kill-switch `PACTS.enabled` in `sim/config.js`. `false` ⇒ zero store I/O, zero
  evaluation, no HUD/panel affordance, and the sim/`srand` sequence + `save.v1` serialization are
  **byte-identical** to a build without the feature.

## 2. `sim/config.js` — the `PACTS` knob (mirror CODEX/TITLES block)

Fixed table (YAGNI — not a generic rules engine). Conservative defaults; **all heat→reward tuning
lives in 1–2 knobs** so telemetry can retune without a logic re-deploy (DoD).

```js
export const PACTS = {
  enabled:true,
  // Each def: id, name (ES), rank cap, heat contributed PER rank, and the per-rank effect.
  // effect.kind selects the seam hook; mag is per-rank magnitude.
  defs:[
    { id:"cruento",   name:"Pacto Cruento",     max:5, heat:10, effect:{kind:"enemyDmg", mag:0.10} }, // +10% daño enemigo/rango
    { id:"vigor",     name:"Pacto de Vigor",    max:5, heat:8,  effect:{kind:"enemyHp",  mag:0.15} }, // +15% HP enemigo/rango
    { id:"celeridad", name:"Pacto de Celeridad",max:3, heat:12, effect:{kind:"enemySpd", mag:0.08} }, // +8% velocidad enemigo/rango
    { id:"jauria",    name:"Pacto de Jauría",   max:3, heat:15, effect:{kind:"eliteRate",mag:0.25} }, // +25% prob. promoción élite/rango
    { id:"fragil",    name:"Pacto Frágil",      max:3, heat:12, effect:{kind:"healCut",  mag:0.20} }, // -20% curación jugador/rango
  ],
  // ── HEAT → REWARD tuning (the ONLY balance knobs; keep conservative) ─────────────
  essencePerHeat:0.004,  // Esencia mult = 1 + essencePerHeat*heat   (heat 100 ⇒ +40%)
  dropPerHeat:0.003,     // drop/unique/rune chance mult = 1 + dropPerHeat*heat (heat 100 ⇒ +30%)
  rewardHeatCap:150,     // clamp heat used for the reward mult (defensive; effects still stack)
};
```

Ship conservative. If balance is uncertain, ship modest multipliers and file a tuning follow-up —
do **not** widen scope.

## 3. Seam hooks (where each effect applies) — NO new RNG draws

Helper contract (all read the live `ranks`, all short-circuit on `!PACTS.enabled`):

```js
function pactHeat(){ /* Σ ranks[id]*def.heat, 0 if disabled */ }
function pactStatMul(kind){ /* 1 + Σ(rank*mag) over defs whose effect.kind===kind; 1.0 if none/disabled */ }
function pactRewardMul(kind){ /* kind∈{essence,drop}: 1 + perHeat*min(heat,cap); 1.0 if disabled */ }
```

| Effect | Seam | Hook (verified) |
|---|---|---|
| `enemyHp`  | `applyZoneScale(e,zone)` **just before `return e`** | `sim/sim.js:1506–1526` — multiply `e.tpl.hp` by `pactStatMul("enemyHp")`, then `e.hp=e.maxHp=e.tpl.hp`. Pure arithmetic. |
| `enemyDmg` | same fn | multiply `e.tpl.dmg` by `pactStatMul("enemyDmg")`. |
| `enemySpd` | same fn | multiply `e.tpl.spd` by `pactStatMul("enemySpd")` (`Math.max(1, …)`). |
| `eliteRate`| existing affix/champion **promotion threshold** | multiply the promotion RATE by `pactStatMul("eliteRate")` at `maybeAffix`/champion gate (the roll already draws — **shift the threshold only, never add a body/draw**). See `sim/sim.js:1543`, `1584`, `1601`. |
| `healCut`  | player heal application (potions/regen/lifesteal-on-heal) | multiply the heal amount by `pactStatMul_inv("healCut")` = `max(0, 1 - Σ rank*mag)`. Pure arithmetic. GE locates the heal sites (potion apply, regen tick). |
| `essence` reward | `essenceForRun(h,r)` **before final `Math.floor`** | `sim/sim.js:1153–1155` — `raw *= pactRewardMul("essence")`. Pure arithmetic. |
| `drop/unique/rune` reward | `maybeLegendary` / `maybeSetPiece` / `maybeSocketRune` + trash `gearChance` | multiply each rate/threshold by `pactRewardMul("drop")`. These draw from their **own** streams (legRng/setRng/runeRng) or srand for trash — shift the threshold only, **never add a draw**. `sim/sim.js:1901–1917`. |

**Arena is out of scope** for v1 (its own scaling path at `:702/:738`); pacts apply to the world
hunt loop. Note it as a possible follow-up; do not touch arena in this build.

## 4. RNG-neutral STRONG (AC-RNG-STRONG) — the load-bearing invariant

Pacts change gameplay **by design** when active, so the guarantee is stated precisely and is
checkable by the harness (fixed spawn/roll script, count srand draws):

1. **Knob OFF** (`PACTS.enabled=false`): md5 dist == HEAD 7/7 in the deploy set, `save.v1`
   byte-identical, `srand` sequence byte-identical to HEAD. Whole system short-circuits.
2. **Enabled but heat=0** (default player state, no ranks): `srand` sequence AND `save.v1`
   byte-identical to HEAD. Every multiplier defaults to `1.0`; no threshold moves; no store write
   until the player actually sets a rank. Enabling the feature with no pact chosen is a **total no-op**.
3. **Pacts active** (heat>0): **pacts NEVER add or remove an RNG draw.** Every effect is either
   (a) pure arithmetic on a stat/heal/essence value (draws nothing), or (b) a threshold shift on a
   roll that already happens (same draw, different boolean). Therefore for a **fixed harness script**
   the raw `srand` (and legRng/setRng/runeRng) draw **stream is byte-identical ON==OFF** — only
   derived stat values / branch outcomes differ. If any effect cannot be done without a fresh draw,
   it MUST use a dedicated `pactRng = createRNG(0x7ac70001)` stream, never the authoritative `srand`.

> Design consequence: the `eliteRate` pact modifies the **promotion probability of a mob that is
> already spawning**, it does **not** spawn extra bodies (extra bodies ⇒ extra draws ⇒ breaks #3).

## 5. UI — panel + affordance ($0 art)

- **Scene** `"pacts"`, keybind **`KeyL`** (free; K=Códice, Y=Títulos, T=talentos, V=mastery,
  C=customize, U=ultimate — all taken; L is clear). Fixed alias mirroring KeyK/KeyY:
  `if(code==="KeyL"){ ACTIONS.pacts(); return; }` and scene handler
  `if(G.scene==="pacts"){ if(code==="KeyL"||code==="Escape"){ G.scene="play"; } … }`.
  `ACTIONS.pacts:()=>{ if(PACTS.enabled) G.scene="pacts"; }`.
- **Sidebar glyph** `⚔` (distinct from ◆ Códice / ◈ Títulos), appended in the HUD button row and
  the menu list, gated on `PACTS.enabled`.
- **Panel** mirrors `renderTitles`/`renderCodex` (`render/render.js`, read-friendly text list):
  one row per pact — name, current rank / max, per-rank effect text, heat contribution. Footer
  shows **total Heat** and the **current reward multipliers** (Esencia ×, botín ×). Rows are
  **interactive**: tap/click a pact to **+1 rank** (wraps to 0 at max), so the player builds their
  covenant here. Each change writes `mithralda.pacts.v1` (dirty-flush like codex/titles) and marks
  `G.pactsDirty`. HUD may show a compact `⚔ Heat N` readout while heat>0 (optional, text-only).
- Provide QA/dev hooks: `pactsSnap()` view-model (enabled, ranks, heat, essMul, dropMul, items[])
  and `setPactRank(id,rank)` / `equipPactRank`-style setter, plus `__dev`/`__pacts` accessors
  mirroring `titlesSnap`/`equipTitle` so the live harness can drive it headless.

## 6. Persistence (`persist.js`) — own store, mirror bootTitles

- `KEY_PACTS="mithralda.pacts.v1"`, `readPacts/savePacts/serializePacts/loadPacts`, `bootPacts()`
  in the boot sequence after `bootTitles()`, and a `G.pactsDirty` flush in the same seam as
  `codexDirty`/`titlesDirty`. `loadPacts` validates against `PACTS.defs` (drop unknown ids, clamp
  rank to `[0,max]`). **Do not** add anything to the `save.v1` whitelist.

## 7. Deploy — overlay 0-leak (mirror CAS-1760)

Deploy set is exactly the 7 game-core blobs (reuse `tools/casNNNN-deploy.mjs` shape):
`game.js, hud.js, input.js, persist.js, render/render.js, sim/config.js, sim/sim.js` + regenerated
`version.json` (new build id). Overlay ONLY the touched blobs onto `origin/gh-pages`; everything
else byte-identical.

## 8. Acceptance criteria (for QA LIVE PASS×2, desktop + móvil, browser-per-pass)

- **AC0 (deploy integrity):** md5 of the served blobs == HEAD for all 7 in the deploy set;
  `version.json` build id updated; 0-leak (no other paths changed).
- **AC1 (heat + activation):** setting ranks raises total Heat in panel/HUD; multiple pacts stack;
  `mithralda.pacts.v1` persists across reload; effects present in-run (enemy tougher, etc.).
- **AC2 (reward scaling):** with heat>0, `essenceForRun` and drop/unique/rune rates scale by the
  configured multipliers (verify via `pactsSnap()` essMul/dropMul + a deterministic essence readout).
- **AC3 (persistence/preference):** chosen config survives run end + reload; no `save.v1` growth.
- **AC-RNG-STRONG:** (i) `PACTS.enabled=false` ⇒ md5==HEAD 7/7, `save.v1` byte-id, `srand` byte-id;
  (ii) enabled + heat=0 ⇒ `srand` + `save.v1` byte-id to HEAD; (iii) enabled + an active stat pact ⇒
  raw `srand` draw stream (48-draw fixed script) **byte-identical** to OFF (pacts add/remove no draws).
- **REG:** Códice (CAS-1751), Títulos (CAS-1758), runes/sets/uniques loot regression clean; 60fps
  desktop + móvil.

## 9. Chain (CTO decomposes)

1. **Build** (GE) — impl §2–§6 + harness (`tools/cas176x-pacts.mjs`) proving AC-RNG-STRONG.
2. **Deploy** (CTO) — gh-pages overlay 0-leak, publish `version.json`.
3. **QA LIVE PASS×2** (QA) — against the live build, all ACs above.
4. **Gate CEO** — deliverable: version.json live + md5 live==HEAD 7/7 + QA PASS×2 + RNG-neutral OFF.
   Closing the gate closes this umbrella by `children_completed`.
