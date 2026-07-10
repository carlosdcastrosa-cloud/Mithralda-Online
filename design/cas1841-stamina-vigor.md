# CAS-1841 — Estamina / Vigor (economía de recursos) · Pilar 8 Souls-like

**Owner:** CTO (decomposition + números) · **Chain:** Build → Deploy → QA → Gate CEO
**Producto (CEO):** los 7 pilares vivos son todos **OFENSIVOS/REACTIVOS aditivos** (Telegrafía · Esquiva CAS-1814 · Parada CAS-1785 · Habilidades · Poise CAS-1826 · Combos CAS-1831 · Backstab CAS-1836) — cada uno DA poder, ninguno COBRA. Falta el eje de **ECONOMÍA DE RECURSO**: una barra de estamina/vigor que hace de las acciones de PODER decisiones con coste, sin estrangular el momento-a-momento (el ataque ligero L nunca cuesta).

---

## Decisión de arquitectura: un recurso transitorio + un gate por acción de poder (≈$0 arte, 0 RNG)

El mapeo confirma que TODAS las acciones de poder ya pasan por funciones-export discretas y que la barra HUD reusa la primitiva `bar()`/`fillBar()` (DOM, mirror HP/MP). Sólo añadimos **un campo transitorio `h.stam`**, **una función `spendStam()` gate**, **un tick de regen** y **una barra HUD gated**. Cero mecánica paralela, cero arte.

| Necesidad | Maquinaria existente a REUSAR | Ref |
|---|---|---|
| Barra HUD (mirror HP/MP) | `bar(sw, fillCol, grooveCol, icon)` + `fillBar(node,cur,max)` (DOM) | hud.js:243/355, nodes.hp/mp 266-267 |
| Feed de estado al HUD | objeto snapshot con `hp/maxHp/mp/maxMp` | game.js:154 |
| Gate de acción — Esquiva | `doRoll()` export | sim.js:3152 |
| Gate de acción — Parada | `tryParry()` export | sim.js:1881 |
| Gate de acción — Pesado | `heavyAttack()` export | sim.js:1925 |
| Gate de acción — Finisher combo | rama `h._comboFin=(comboCount>=chainLen)` | sim.js:1905-1908 |
| Gate de acción — Habilidad | `castAbility(slot)` (tras gate maná) | sim.js:2601 |
| Gate de acción — Ultimate | `castUltimate()` (tras gate carga) | sim.js:2626 |
| Feedback "sin recurso" | `audio.sfx.deny()` + `toast()` (mirror `notEnoughMP`) | sim.js:1556, 2589 |
| Tick de timers transitorios | bloque `// timers` tras `tickCombo(h,dt)` | sim.js:3223-3225 |
| Campo transitorio init (mirror comboCount:0) | literal `newHero` | sim.js:303-304 |

**Clave del efecto:** la estamina es un **recurso transitorio del héroe** (`h.stam`, refill a tope en respawn/nuevo-run como `h.mp`) que las acciones de PODER consumen vía un único helper `spendStam(h,cost)`. El ataque ligero L **nunca** llama a `spendStam` ⇒ el combate momento-a-momento es intocable.

### `spendStam` — el único punto de decisión (100% aritmético, 0 RNG)
```js
// CAS-1841: gate de estamina. OFF ⇒ return true SIN tocar estado ⇒ byte-idéntico.
// Sin suficiente ⇒ deny (flash de barra + sfx existente), NO ejecuta, NO va a coste 0.
function spendStam(h, cost){
  if(!STAMINA.enabled || !h) return true;          // knob OFF ⇒ nunca gatea
  if((h.stam||0) < cost){ h._stamFlash=STAMINA.flashS; audio.sfx.deny(); return false; }
  h.stam -= cost; h._stamRegenPauseT = STAMINA.regenDelay; return true;
}
```
- **OFF byte-id:** `STAMINA.enabled=false` ⇒ `return true` inmediato, `h.stam`/`h._stamFlash`/`h._stamRegenPauseT` **jamás se tocan** ⇒ toda acción corre exactamente como HEAD.
- **0 RNG:** comparación + resta. Sin draws, **NO se crea `staminaRng`** (nada que sembrar) ⇒ srand ON==OFF trivial.

### Regen — tick transitorio (0 RNG)
```js
function tickStamina(h,dt){ if(!STAMINA.enabled||!h) return;
  if(h._stamFlash>0) h._stamFlash=Math.max(0,h._stamFlash-dt);
  if(h._stamRegenPauseT>0){ h._stamRegenPauseT=Math.max(0,h._stamRegenPauseT-dt); return; } // pausa breve tras gastar
  if(h.stam<STAMINA.max) h.stam=Math.min(STAMINA.max,(h.stam||0)+STAMINA.regen*dt);
}
```
Llamar en el bloque `// timers` justo tras `tickCombo(h,dt);` (sim.js:3225). OFF ⇒ return inmediato ⇒ byte-id.

---

## DECISIONES CTO (lentes citadas)

1. **Ship `enabled:true` con tuning GENEROSO** — Pilar 8 va LIVE como los otros 7. Default preserva el feel: pool 100, regen 22/s (≈4.5 s a tope), **L ligero gratis**, esquiva 25 (4 esquivas desde tope + regen mientras juegas). El jugador sólo topa vacío al **spamear** poder — que es exactamente la decisión que la feature quiere crear. *(Lente Critical-path: shipear el pilar vivo, no dormido.)*
2. **Los NÚMEROS son decisión de FEEL/BALANCE del CEO** — igual que el retune de dash en Esquiva CAS-1814. El Gate CEO puede pedir retune; es **edición de knob barata y reversible** (Reversibility), sin rebuild de lógica. Si el CEO prefiere shipear DORMIDO, `enabled:false` es byte-id inmediato.
3. **Cero save nuevo** — `h.stam` refilla a tope cada run (mirror `h.mp` en respawn/fountain/newHero) ⇒ **transitorio**, fuera del allowlist de `serializeSave` ⇒ `save.v1` byte-idéntico ON/OFF, y **NO se crea `mithralda.stamina.v1`** (supera DoD #2; mirror exacto POISE/COMBO/BACKSTAB). *(Blast radius: 0 superficie de save nueva.)*
4. **0 RNG, sin stream nuevo** — geometría/aritmética pura. srand ON==OFF byte-idéntico con estamina **firing real** (gastar + deny + regen). *(Determinismo.)*
5. **L ligero NUNCA gateado** — `heroAttack()` intocado. El finisher de combo, si NO hay estamina, degrada a **ligero normal** (no se bloquea el golpe, sólo pierde el bonus finisher). *(No estrangular el momento-a-momento — restricción dura del issue.)*
6. **1 solo knob** `STAMINA` en `sim/config.js` (junto a COMBO/BACKSTAB). `enabled:false` ⇒ ninguna rama corre ⇒ byte-idéntico a HEAD (dmg/knock/save/srand/DOM: la barra NO se crea).

---

## Seams de implementación (guía precisa GE)

### 1) Knob — `sim/config.js` (junto a `BACKSTAB`)
```js
export const STAMINA = {
  enabled:true,
  max:100, regen:22,          // por segundo; pool lleno ~4.5 s ocioso
  regenDelay:0.35,            // pausa de regen tras gastar (feel)
  flashS:0.4,                 // duración del flash rojo de barra en deny
  cost:{ dodge:25, parry:20, heavy:30, finisher:30, ability:25, ultimate:40 }
};
```

### 2) Campo transitorio — `sim/sim.js` `newHero` (junto a `comboCount:0`, ~303)
```js
stam: STAMINA.max, _stamFlash:0, _stamRegenPauseT:0,   // CAS-1841: transitorio, NO serializado
```
Refill a tope donde `h.mp=h.maxMp` en respawn/fountain/full-heal (mirror MP): sim.js:1542, 2915, 2973, 2980, 3032. (Aditivo `h.stam=STAMINA.max`.)

### 3) Helper + tick — `sim/sim.js` (junto a `tickCombo`, ~1870)
`spendStam()` y `tickStamina()` como arriba. Llamar `tickStamina(h,dt);` tras `tickCombo(h,dt);` (sim.js:3225).

### 4) Gates de acción (early-return, tras los gates existentes)
- `doRoll()` (3152): tras `if(h.rolling||h.rollCD>0) return;` → `if(!spendStam(h,STAMINA.cost.dodge)) return;`
- `tryParry()` (1881): tras el gate de cooldown → `if(!spendStam(h,STAMINA.cost.parry)) return false;`
- `heavyAttack()` (1925): tras `cfg.type!=="melee"` gate → `if(!spendStam(h,STAMINA.cost.heavy)) return;`
- **Finisher combo** (1907-1908): degradar si sin estamina —
  ```js
  h._comboFin = (h.comboCount>=COMBO.chainLen);
  if(h._comboFin){ if(spendStam(h,STAMINA.cost.finisher)){ h.comboCount=0; } else { h._comboFin=false; } }
  ```
  (OFF ⇒ `spendStam` true ⇒ finisher siempre dispara ⇒ byte-id con COMBO.)
- `castAbility(slot)` (2601): tras el gate de maná (`h.mp<sp.cost`), **antes** de `h.mp-=sp.cost` → `if(!spendStam(h,STAMINA.cost.ability)) return;`
- `castUltimate()` (2626): tras el gate de carga (`ultCharge<1`), antes de `h.ultCharge=0` → `if(!spendStam(h,STAMINA.cost.ultimate)) return false;`

### 5) HUD — barra (mirror HP/MP), **gated** en `STAMINA.enabled`
- `game.js:154` feed: añadir `stam:h.stam, stamMax:CFG_STAMINA_MAX, stamFlash:h._stamFlash` (sólo cuando `STAMINA.enabled`; ausente OFF ⇒ HUD no pinta barra ⇒ DOM byte-id).
- `hud.js` (~267): crear `nodes.stam=bar(sw, C.stamf, C.stamb, "⚡")` **sólo si** `STAMINA.enabled`; en el repaint `fillBar(nodes.stam, s.stam, s.stamMax)` + clase `.flash` cuando `s.stamFlash>0`. Colores nuevos en la paleta `C` (verde-vigor, p.ej. `stamf:"#3fae55", stamb:"#0f2413"`), $0 arte.

### 6) strings.js — feedback
- `notEnoughStamina: "Vigor insuficiente"` (mirror `notEnoughMP`). El toast es opcional (el flash de barra + `deny()` ya cumplen la restricción); si se usa, mirror del patrón `notEnoughMP`.

---

## DoD de QA (PASS×2 live desktop+mobile, md5 live==HEAD por archivo tocado)

- **AC1 — OFF byte-id:** `STAMINA.enabled=false` ⇒ doRoll/parry/heavy/finisher/ability/ultimate + save + srand + DOM (sin barra) byte-idénticos a HEAD pre-feature.
- **AC2 — RNG-neutral STRONG:** srand ON==OFF byte-idéntico con estamina **firing real** (48-draw: gastar hasta vaciar, deny disparado, regen corriendo). 0 draws nuevos (NO `staminaRng`).
- **AC3 — coste real:** con `enabled:true`, cada acción de poder resta su `cost` exacto de `h.stam`; el ligero L **no resta nada** (medir `h.stam` antes/después de un swing L = 0 delta).
- **AC4 — sin recurso ⇒ deny, no coste-0:** vaciar `h.stam`; doRoll/parry/heavy/ability/ultimate ⇒ **no se ejecutan** (rolling/parryT/atkCD/mp/ultCharge sin cambio), `_stamFlash` armado, `sfx.deny` llamado; el finisher degrada a ligero (`_comboFin=false`, el golpe SÍ aterriza). El ligero L sigue disponible.
- **AC5 — regen + pausa:** `h.stam` sube `regen`/s hasta `max`; tras gastar, `_stamRegenPauseT` pausa la regen `regenDelay` s antes de reanudar.
- **AC6 — save byte-id:** `h.stam` no entra a `serializeSave`; `save.v1` idéntico ON/OFF; NO existe `mithralda.stamina.v1`.
- **REG:** frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab siguen srand ON==OFF.
- **Feel (nota Gate CEO):** con defaults, juego normal (L + esquiva ocasional) rara vez topa vacío; sólo el spam de poder estrangula. Los NÚMEROS son decisión del CEO (retune = edición de knob).

---

## Cadena (patrón CTO-umbrella)

Build (GE) → Deploy overlay 0-leak (CTO) → QA PASS×2 live (QA) → **Gate final CEO** (veredicto GO + decisión de tuning/enable). Umbrella CAS-1841 cierra por `issue_children_completed` en el heartbeat del CTO.
