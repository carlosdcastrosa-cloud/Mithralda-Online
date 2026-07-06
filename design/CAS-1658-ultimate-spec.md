# CAS-1658 — Habilidad Definitiva (Ultimate) con medidor de carga — Implementation Spec

**Owner (decomp):** CTO · **Implementation:** Game Engineer (CAS-1659) · **Deploy:** CTO (CAS-1660) · **QA:** (CAS-1661) · **CEO gate:** (CAS-1662)

Evolution increment. Adds a high-impact combat payoff: an **Ultimate** in a **separate slot** from the 2 drafted actives (CAS-1570). It **charges from combat** (damage dealt + kills, **no mana**) and unleashes when ready, consuming the full meter. This spec is precise about seams; the GE refines numbers/curves.

---

## Non-negotiable house constraints (same molde as Legendarios / Conjuntos)

1. **RNG-neutral (AC4).** A run where the player does **not** draft or cast an Ultimate must produce a **byte-identical** main sim stream vs current HEAD. Achieve this by giving the Ultimate draft roll its **own dedicated append-only RNG stream** — mirror `legRng` (sim/sim.js:49) and `setRng` (sim/sim.js:54). **Never** consume main `rng`/`srand` for the Ultimate draft or charge math. Charge accumulation is **pure arithmetic** (no RNG).
2. **Save aditivo (AC5).** New field(s) added to `serializeSave()`/`loadSave()` and `metaDefault()`/`loadMeta()` **additively** — old `mithralda.meta.v*` / run saves load clean, defaulting to no-Ultimate. **Do NOT bump `SAVE_VERSION`** (sim/sim.js:608).
3. **$0 arte.** Reuse existing `resolveSpell` types + existing `addFx` VFX + existing glyphs/pips. Only if a dedicated glyph is truly wanted, PixelLab ($0) — but a text glyph (e.g. `★`) is acceptable; do not block ship on art.
4. **Móvil + escritorio** funcional, 60fps, 0 errores de consola.

---

## Confirmed seams (verified against HEAD)

| Concern | File:line | Notes |
|---|---|---|
| RNG streams (append-only molde) | sim/sim.js:33/41/49/54 | `rng`, `fxRng`, `legRng=createRNG(0x1a2b3c4d)`, `setRng=createRNG(0x5e75c0de)` — **add `ultRng=createRNG(0x???)` here, append-only** |
| Hero ability state | sim/sim.js:177 | `abilCD:[0,0], abilCDmax:[0,0], loadout:DEFAULT_LOADOUT.slice()` — add Ultimate fields alongside |
| Damage-dealt hook | sim/sim.js:1285 `hitEnemy(e,dmg,ang)` | add charge gain ∝ dmg here |
| Kill hook | sim/sim.js:1389 `killEnemy(e)` | add flat charge gain per kill here |
| Cast engine (REUSE) | sim/sim.js:1828 `resolveSpell(h,sp)` | types: nova, field, chain, buff(+heal), dash, proj, cone, blink, heal, hot |
| Ability cast reference | sim/sim.js:1797 `castAbility(slot)` | model `castUltimate()` on it, but gate on **charge≥full** not mana, consume charge not mana |
| CD tick reference | sim/sim.js:2307 | `abilCD` decremented per dt (Ultimate uses charge, not a timed CD) |
| Draft pool filter | sim/sim.js:884 `draftPool()` | new `ultimatePool()` mirror |
| Draft open/pick | sim/sim.js:424 `openDraft` / 460 `pickBoon` | extend the run-start draft flow for the 1-of-3 Ultimate pick |
| Save serialize | sim/sim.js:885 `serializeSave()` | persist drafted ultimate id (additive) |
| Save load | sim/sim.js:956 `loadSave()` | rehydrate ultimate id defensively (default none) |
| meta default/load | sim/sim.js:711 `metaDefault()` / 807 `loadMeta()` | only if any Esencia unlock is added (optional; NOT required for v1) |
| Ability config | sim/config.js:133 `ACTIVE_ABILITIES`, :156 `ABILITY_MAP` | add `ULTIMATES` array + `ULTIMATE_MAP` here (config.js, NOT sim.js) |
| HUD ability bar (REUSE radial) | render/render.js:1805 `renderAbilityBar()`, :1765 `renderConsumableSlot()` | model Ultimate slot + charge meter on these; radial pattern at 1817-1823 |
| Action bar geom | render/render.js:1756 `actionBarGeom()`, :1764 `abSlotX(i)` | slots 0..6 currently (4 spells + 2 abils + potion). Ultimate = new HUD element (own meter), not necessarily an 8th bar slot |
| Desktop keybinds | input.js:59 `ability1/2` | add `ultimate:()=>{ if(!isTouch) faceMouse(); sim.castUltimate(); }` bound to **`C`** |
| Touch buttons | input.js:306 `ab1/ab2`, :312 `abilGlyph` | add `ult` touch button reusing radial-cooldown glyph pattern |
| dev backend | sim/sim.js:2841 `export const dev` | add `ultimateState()`, `setUltRate()`, `fillUltimate()` |
| dev wrapper (MUST wire here too) | game.js:192 `window.__dev={...}` | passthrough the new dev hooks — else "not a function" (memory: cas1654) |

---

## Design (v1 — GE refines numbers)

### 1. Ultimate pool (config.js — 4 entries, reuse resolvers)
Add `ULTIMATES` after `ACTIVE_ABILITIES`. Each entry uses an existing `resolveSpell` `type`:

- **`torbellino`** — Torbellino: `type:"nova"` big radius melee AoE. glyph `✳`. fx reuse `novacast`+`shockring`.
- **`meteoro`** — Meteoro: `type:"field"` (or big `nova`) large-area burst + brief DoT. glyph `☄`. fx reuse `novacast`.
- **`bastion`** — Bastión: `type:"buff"` def buff (brief near-invuln via high `def` amt) **+ `heal`**. glyph `⛨`. fx reuse `buffaura`.
- **`tormenta`** — Tormenta de Cadenas: `type:"chain"` many `jumps`, big `range`. glyph `⚡`. fx reuse `chainbolt`.

Each Ultimate has NO `cost` (mana) and NO timed `cd`; gated purely by charge.

### 2. Charge meter (per-hero, transient + drafted id persisted)
Hero fields (sim/sim.js:177 area):
```
ultId:null,          // drafted ultimate id for this run (null = none → RNG-neutral baseline)
ultCharge:0,         // 0..1 normalized meter
```
- **Gain on damage** (hitEnemy): `h.ultCharge = min(1, h.ultCharge + dmg * ULT_CHARGE_PER_DMG)` — only when `h.ultId`. Pick a legible constant so a normal wave fills it over ~2–3 fights.
- **Gain on kill** (killEnemy): `+= ULT_CHARGE_PER_KILL` (small flat bump for readability).
- **Guard**: all charge math gated behind `if(h.ultId)` so a no-Ultimate run touches nothing (RNG-neutral + zero perf on baseline).

### 3. Run-start draft 1-of-3 (dedicated `ultRng`)
- Pool has 4 → offer **3-of-4** chosen via **`ultRng`** (dedicated append-only stream, seed e.g. `0x117a1a7e`). Player picks 1 → `h.ultId`. This mirrors the exact leg/set molde QA already verifies (byte-id of main stream regardless of ult draft).
- Alternative acceptable to GE: pool of exactly 3 → offer all 3 → **zero RNG**. Either satisfies AC4; the dedicated-stream 3-of-4 is preferred for variety + molde consistency. **Do NOT** route the Ultimate pick through main `srand`.
- Hook into the existing run-start draft flow (openDraft/pickBoon) as a separate step, or a dedicated small ultimate-draft panel — GE's call; keep it one clear pick that persists for the run.

### 4. Cast (`castUltimate()` — model on castAbility)
```
export function castUltimate(){
  const h=G.hero; if(!h||h.rolling||h.stun>0) return;
  if(!h.ultId) return;
  if(h.ultCharge < 1) { toast(...); audio.sfx.deny(); return; }   // not ready
  const sp = ULTIMATE_MAP[h.ultId]; if(!sp) return;
  h.ultCharge = 0;                                                 // consume full meter (CD-by-charge)
  h.specialAnim=SPECIAL_ANIM_DUR; h.hurtAnim=0;
  if(sp.sfx && audio.sfx[sp.sfx]) audio.sfx[sp.sfx]();
  resolveSpell(h, sp);                                             // REUSE engine
}
```
No mana spend, no timed CD — the "cooldown" is refilling the meter.

### 5. HUD (render.js — reuse radial/pip)
- Ultimate slot glyph near the action bar (its own element, e.g. above the potion slot or centered), with a **charge meter** (radial arc from renderAbilityBar:1817-1823, or a horizontal pip bar) filling 0→1.
- When `ultCharge≥1`: a clear **"listo"** indicator (glow/pulse/color flip). Reuse existing color/pulse; no new asset.
- Desktop + mobile: desktop shows key hint `C`; mobile adds a radial touch button (input.js `ult`).

### 6. Save (additive)
- `serializeSave()`: add `ult:h.ultId` (additive, no version bump). Optionally `ultCharge` too (nice-to-have — resume mid-charge).
- `loadSave()`: `h.ultId = (d.ult && ULTIMATE_MAP[d.ult]) ? d.ult : null;` — old saves lack `d.ult` → `null` → RNG-neutral baseline.

### 7. Dev hooks (for QA harness) — wire in BOTH sim.js dev AND game.js:192 wrapper
- `ultimateState()` → `{id, charge, ready}`
- `fillUltimate()` → set charge=1 (QA: verify unleash + consume)
- `setUltId(id)` → force a drafted ultimate (QA: verify each effect)
- `setUltRate(x)` → neutralize/scale draft roll for the determinism harness (mirror `setLegRate`/`setSetRate` — QA silences it to isolate the byte-id comparison, per cas1655 AC4 confound fix)

---

## Acceptance criteria → verification mapping
- **AC1** Ultimate slot + charge meter visible (desktop+mobile) → HUD render check.
- **AC2** Meter fills on damage/kills, shows "listo", unleash consumes + applies correct effect → `fillUltimate`/`setUltId` + resolveSpell effect assert.
- **AC3** Run-start 1-of-3 offered; choice persists the run → draft panel + `h.ultId` stable.
- **AC4** RNG-neutral: no-Ultimate run byte-identical to HEAD → dedicated `ultRng`; harness silences ult draft (`setUltRate(0)`) and compares main stream byte-id (leg/set molde).
- **AC5** Additive save: old save loads clean; new `ult` persists save/reload.
- **AC6** 60fps, 0 console errors, desktop+mobile.
- **AC7** md5 live==HEAD of touched files after deploy; QA 2× vs `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/`.

## Headless harness (GE deliverable)
`tools/cas1659-ultimate.mjs` — mirror `tools/cas1653-sets.mjs`: real `castUltimate`/`hitEnemy`/`killEnemy`, all AC1-AC6, **[AC-RNG-STRONG]** determinism A/B with `setUltRate(0)` proving main stream byte-identical to a no-feature reference. All PASS before handing to CTO deploy.

## Files expected to change
`sim/config.js` (ULTIMATES), `sim/sim.js` (ultRng, hero fields, hooks, castUltimate, draft, save, dev), `render/render.js` (HUD meter), `input.js` (C key + touch), `game.js` (dev wrapper), `version.js`/version.json (deploy stamp — CTO). Keep the diff surgical and RNG-neutral.
