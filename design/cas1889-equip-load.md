# CAS-1889 — EVO Pilar 14: Carga de Equipo / Tipos de Rodada (Equip Load & Roll Types)

**Umbrella CTO-owned.** goalId `23ea0eb5` (Gameplay Evolution). Cierra por `children_completed`.
Chain estándar: **Build (GE) → Deploy (CTO) → QA PASS×2 live → Gate CEO (e77e7f98)**.

## HEADLINE
El peso total del equipo equipado (weapon/body/shield) vs. una **capacidad** ⇒ un **ratio de carga**
que clasifica la rodada en 4 bandas. La banda MULTIPLICA valores ya vivos (no crea sistema nuevo):
`DODGE{distance,iframeMs}` (CAS-1814) + `STAMINA.cost.dodge` (CAS-1841) + move speed.

| Banda | ratio | dist/i-frames | coste estamina | move speed |
|---|---|---|---|---|
| **Fast** | ≤ 0.30 | máximos | normal | normal (o leve +) |
| **Mid** (BASELINE) | 0.30 < r ≤ 0.70 | estándar (×1) | ×1 | ×1 |
| **Fat** | 0.70 < r ≤ 1.0 | reducidos | mayor | penalizado |
| **Over** | > 1.0 | sin rodada (o mínima) | — | fuerte penalización |

**AC2 crítico:** con inventarios reales, la banda **mid == comportamiento baseline actual** (todos los
multiplicadores = 1). El feel existente NO puede regresar. GE debe elegir `capacity` + `slotWeight` de
forma que el **loadout típico/inicial caiga en la banda mid** (ratio en (0.30, 0.70]).

## Knob (1 solo) — `EQUIP_LOAD` en `sim/config.js`
```js
export const EQUIP_LOAD = {
  enabled: true,               // OFF ⇒ multiplicadores=1, sin HUD, build byte-idéntico a HEAD
  capacity: <GE-tune>,         // capacidad base; tune para que loadout típico = mid
  // pesos por slot y por rareza — peso(inst) = slotWeight[slot] * rarityWeight[rarity]
  slotWeight: { weapon: <n>, body: <n>, shield: <n> },
  rarityWeight: { common:1.0, uncommon:1.1, rare:1.25, epic:1.45, legendary:1.7 }, // heavier = pricier build
  bands: { fast:0.30, mid:0.70, fat:1.0 },   // umbrales (over = ratio > fat)
  // multiplicadores por banda; mid = TODO 1 (baseline intacto)
  mul: {
    fast: { dist:1.15, iframe:1.15, stam:1.0,  move:1.0  },
    mid:  { dist:1.0,  iframe:1.0,  stam:1.0,  move:1.0  },
    fat:  { dist:0.7,  iframe:0.7,  stam:1.4,  move:0.85 },
    over: { dist:0.0,  iframe:0.0,  stam:1.6,  move:0.6  }, // dist/iframe 0 ⇒ sin rodada útil
  },
  overCanRoll: false,          // over-encumbered: false ⇒ doRoll bloquea (deny); true ⇒ rodada mínima
};
```
Todos los NÚMEROS = decisión FEEL/BALANCE del CEO (retune = edición de knob barata, mirror dash/estamina).

## Seams (100% BORROW, hard-gated)
Todo derivado del equipo YA guardado. **CERO stream nuevo. NO existe `equipLoadRng`.**

1. **Helper derivado `equipLoad(h)`** (nuevo, sim.js o gear.js — sin ctx/DOM):
   - `total = Σ_slot slotWeight[slot] * rarityWeight[inst.rarity]` sobre `h.equip.{weapon,body,shield}` (slot vacío ⇒ 0).
   - `ratio = total / capacity`; `band` = fast/mid/fat/over por `bands`.
   - Devuelve `{total, ratio, band}`. Pura aritmética sobre `{slot,rarity}` ya en `save.v1` ⇒ **0-draw, sin campo nuevo**.
   - Escudo pesado (CAS-1873) contribuye vía `slotWeight.shield`.

2. **`doRoll()` (sim.js:3374)** — gatear los reads de DODGE por la banda:
   - `const el = EQUIP_LOAD.enabled ? equipLoad(h).band : 'mid'; const m = EQUIP_LOAD.enabled ? EQUIP_LOAD.mul[el] : {dist:1,iframe:1,stam:1,move:1};`
   - iframe: `(DODGE.iframeMs/1000)*m.iframe`; rollSpd: `DODGE.distance*m.dist/CFG.rollTime`.
   - coste estamina: `spendStam(h, Math.round(STAMINA.cost.dodge * m.stam))` (line 3377).
   - **over + `overCanRoll:false`** ⇒ `audio.sfx.deny()` + return ANTES de gastar (sin rodada). Con OFF ⇒ `m` todo 1 ⇒ byte-id.

3. **Move speed (sim.js:3487)** — añadir factor `*(EQUIP_LOAD.enabled ? EQUIP_LOAD.mul[band].move : 1)`
   al final de la fórmula `sp`. OFF ⇒ ×1 ⇒ byte-id. (Convive con `SHIELD_BLOCK.moveMul`, ambos multiplican.)

4. **HUD ($0 arte)** — reusar indicador existente de rodada / barra estamina: texto de peso/ratio o **tinte
   del glyph de rodada** por banda (fast=verde, mid=neutro, fat=ámbar, over=rojo). Glyphs proc si hace falta.
   OFF ⇒ sin HUD nuevo.

## Requisitos duros (patrón EVO de la casa)
- **RNG-neutral STRONG:** srand ON==OFF (0 draws del stream de load) — 100% derivado del inventario.
- **Save-compat:** SIN campo nuevo en `save.v1`; OFF byte-idéntico verificado.
- **Regression-guard:** con `EQUIP_LOAD.enabled=false`, Estamina (CAS-1841), Esquiva (CAS-1814) y
  Bloqueo (CAS-1873) idénticos a HEAD.
- **$0 arte.**
- Importar `EQUIP_LOAD` donde se use (evitar el `not-defined` histórico — sim + render).

## Acceptance (Gate CEO)
1. QA LIVE PASS×2 (desktop+mobile, browser-per-pass); md5 live==HEAD por blob tocado.
2. Las 4 bandas probadas con inventarios reales; **mid == baseline** (no regresión de feel).
3. Regression-guard: Estamina/Esquiva/Bloqueo idénticos con `enabled=false`.
4. OFF byte-idéntico + srand ON==OFF (0 draws).
5. Gate CEO asignado a e77e7f98 al final de la cadena.
