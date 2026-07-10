# CAS-1847 — Enfoque de Objetivo (Lock-On / Target Focus)

**Owner:** CTO (decomposición + números) · **Chain:** Build → Deploy → QA → Gate CEO
**Eje:** 9ª feature Souls-like. Unifica los 8 pilares vivos (Telegrafía·Esquiva·Parada·Habilidades·Poise·Combos·Backstab·Estamina) dándole al jugador **control fino de `facing`** contra un objetivo elegido en este ARPG top-down.

**Sinergia central (por qué el hueco es real):** hoy `h.facing` sigue la dirección de MOVIMIENTO cuando no se apunta con el ratón (`sim.js:3294`, `if(!io.aimActive) h.facing=atan2(mv[1],mv[0])`). Eso hace que casi todos los pilares reactivos dependan de a-dónde-caminas: el arco de Backstab (CAS-1836), el contra de Parada (CAS-1785), la orientación de Combos (CAS-1831) y todo golpe melee leen `h.facing` **en el instante del swing**. El Lock-On **desacopla `facing` del movimiento**: mientras hay lock, el héroe auto-encara al objetivo y el movimiento pasa a **strafe** (orbitar/retroceder sin dejar de mirar al enemigo). Es el pegamento que convierte los 8 pilares en un kit de duelo controlado.

---

## Decisión de arquitectura: 1 seam maestro (override de `h.facing`) + geometría/input puro ($0 arte, 0 RNG)

El mapeo del código confirma el atajo elegante: **NO hay que tocar cada sitio de ataque.** Todo el combate melee/backstab/parry/combo deriva su dirección de `h.facing` en el momento del swing. Por tanto, **si sobreescribimos `h.facing` para que apunte al objetivo cada frame mientras hay lock, los 4 pilares se orientan al target GRATIS**, y el movimiento (`h.vx/h.vy` desde `mv`, `sim.js:3282`) queda intacto ⇒ **strafe automático**. Blast radius mínimo, un solo punto de verdad.

| Necesidad | Maquinaria existente a REUSAR / seam | Ref |
|---|---|---|
| Auto-encarar (melee/backstab/parry/combo orientan al target) | **override de `h.facing`** tras la resolución de facing | sim.js:3294 |
| Strafe (movimiento desacoplado del facing) | `h.vx=mv[0]*sp; h.vy=mv[1]*sp` — YA independiente de facing | sim.js:3282 |
| Detección de tap (edge) para la tecla de lock | patrón `if(code===KEY && FEATURE.enabled){ sim.fn(); return; }` (mirror KeyH parry / KeyN heavy) | input.js:251,255 |
| Suprimir default del navegador (Tab=focus) | añadir la tecla al gate `e.preventDefault()` | input.js:120 |
| Lista de enemigos + geometría | `G.enemies` (array), `e.x/e.y/e.hp/e.dead`, `Math.hypot`, `atan2` | sim.js |
| Estado transitorio del héroe (no serializado) | mirror `comboCount`/`stam`/`frenzyStacks` en `newHero` | sim.js:262,303,307 |
| Reticle $0 arte (canvas procedural) | `ctx.arc`/chevrons animados con `G.t`, mirror drawFx rings | render/render.js |
| Knob | `export const LOCK_ON = {...}` junto a BACKSTAB/STAMINA | config.js:1142 |
| Banner/ayuda | `STR.*` | strings.js |

---

## Requisitos NO-NEGOCIABLES (patrón de la casa — DoD EVO)

1. **0 RNG — geometría/input puro.** El lock es selección por distancia (sort determinista) + override de ángulo. **Sin draws ⇒ NO se crea `lockOnRng`** (nada que sembrar). El sort de candidatos usa distancia con **tie-break por índice de array** (determinista, sin RNG). QA verifica srand ON==OFF **byte-idéntico con lock FIRING real** (target adquirido + facing override + un melee aterrizando). Lección CAS-1836/1841: probar la feature disparando, no sólo el flag.
2. **Sin save nuevo — estado transitorio.** `h.lockTarget` (referencia al enemigo), `h.lockCd` (debounce), `h._lockAng` si hace falta — todos transitorios en `newHero`, mirror `comboCount`/`stam` (NUNCA en el allowlist de `serializeSave`). `G.enemies` no se serializa, así que la referencia no arrastra al enemigo al save. ⇒ `save.v1` byte-idéntico ON/OFF, y **NO se crea `mithralda.lockon.v1`**.
3. **$0 arte.** Reticle 100% procedural (canvas): anillo + chevrones rotando con `G.t`. Sin PNG, sin PixelLab.
4. **Loop core intacto / OFF byte-id.** `LOCK_ON.enabled=false` ⇒ ninguna rama corre (input inerte, sin override, sin reticle, sin estado) ⇒ comportamiento **byte-idéntico** a HEAD (facing/save/srand/render). **Sin pulsar la tecla, comportamiento IDÉNTICO a hoy** aun con la feature ON.

---

## Seams de implementación (guía precisa para el GE)

### 1) Knob — `sim/config.js` (junto a `BACKSTAB`, ~línea 1142)
```js
export const LOCK_ON = { enabled:true, key:"Tab", range:340, cycleCd:0.14, reticleCol:"#ffd15c" };
```
- `range` (px) = radio de adquisición/mantenimiento; `cycleCd` = debounce entre ciclos; `key` = tecla de toggle/ciclo (Tab: libre, canónica; requiere preventDefault). **`range` y `key` son decisión FEEL/BALANCE del CEO** (retune = knob barato, mirror dash CAS-1814 / stamina CAS-1841).

### 2) Estado transitorio — `sim/sim.js`, en `newHero` (~262, junto a `comboCount`/`stam`)
```js
lockTarget:null, lockCd:0,   // CAS-1847: enfoque de objetivo (transitorio, NO serializado)
```

### 3) Adquirir/ciclar — `sim/sim.js`, export nuevo (llamado desde input)
```js
// CAS-1847: tap de la tecla de lock. Sin target ⇒ adquiere el válido más cercano; con target ⇒ cicla
// al SIGUIENTE más cercano (wrap). Geometría pura, 0 RNG, sort determinista (dist, tie-break índice).
export function cycleLock(){
  const h=G.hero; if(!LOCK_ON.enabled || G.scene!=="play" || !h || h.dead || h.lockCd>0) return;
  h.lockCd=LOCK_ON.cycleCd;
  const r2=LOCK_ON.range*LOCK_ON.range;
  const cand=[]; // {e, d2, i}
  for(let i=0;i<G.enemies.length;i++){ const e=G.enemies[i];
    if(e.dead||e.hp<=0) continue; const dx=e.x-h.x, dy=e.y-h.y, d2=dx*dx+dy*dy;
    if(d2<=r2) cand.push({e,d2,i}); }
  if(!cand.length){ h.lockTarget=null; return; }
  cand.sort((a,b)=> a.d2-b.d2 || a.i-b.i);           // determinista, sin RNG
  const cur=cand.findIndex(c=>c.e===h.lockTarget);
  h.lockTarget = cand[(cur+1)%cand.length].e;         // cur=-1 (sin target) ⇒ el más cercano
}
```

### 4) Validación + auto-clear — `sim/sim.js`, en el update del héroe (tick), gated
```js
// CAS-1847: mantener el lock sólo mientras el objetivo esté vivo y en rango. Sin LOS en v1 (YAGNI).
if(LOCK_ON.enabled){ if(h.lockCd>0) h.lockCd-=dt;
  const t=h.lockTarget;
  if(t && (t.dead || t.hp<=0 || (t.x-h.x)**2+(t.y-h.y)**2 > LOCK_ON.range*LOCK_ON.range || G.enemies.indexOf(t)<0))
    h.lockTarget=null; }
```

### 5) **Override de facing (SEAM MAESTRO)** — `sim/sim.js`, TRAS la resolución de facing (~3294)
Debe correr **último** para ser autoritativo sobre movimiento Y ratón, y correr **aunque el héroe esté quieto** (strafe en el sitio):
```js
// CAS-1847: con lock activo, el héroe AUTO-ENCARA al objetivo ⇒ melee/backstab(CAS-1836)/parry(CAS-1785)/
// combos(CAS-1831) se orientan al target (todos leen h.facing en el swing). El movimiento (h.vx/vy) queda
// intacto ⇒ STRAFE. OFF o sin target ⇒ no toca nada ⇒ byte-id.
if(LOCK_ON.enabled && h.lockTarget && !h.lockTarget.dead)
  h.facing = Math.atan2(h.lockTarget.y - h.y, h.lockTarget.x - h.x);
```
**Decisión CTO:** el lock GANA sobre `io.aimActive` (ratón) — mientras hay lock, todo (incl. ranged) apunta al objetivo; es el comportamiento Souls-like más limpio y el más fácil de razonar/probar. Sin lock ⇒ comportamiento idéntico a hoy.

### 6) Input — `input.js`
- En el edge handler (~251/255), tras parry/heavy:
```js
if(code===LOCK_ON.key && LOCK_ON.enabled){ sim.cycleLock(); return; }
```
- En el gate de `preventDefault` (~120), añadir la tecla de lock cuando `LOCK_ON.enabled` (Tab mueve el foco del navegador si no se suprime):
```js
if(md || playAction(e.code) || e.code==="Digit1" || e.code==="Escape" || (LOCK_ON.enabled && e.code===LOCK_ON.key)) e.preventDefault();
```
- **Móvil:** añadir un botón de lock al cluster de controles táctiles (mirror botones de habilidad existentes) que llame a `sim.cycleLock()`. Si el cluster es complejo, v1 puede ser desktop-first con follow-up móvil, PERO la función `cycleLock` es cross-platform y QA la ejercita directamente en ambos viewports.

### 7) Reticle $0 arte — `render/render.js`, tras dibujar enemigos, gated `LOCK_ON.enabled && h.lockTarget`
Anillo + 4 chevrones rotando con `G.t` en `LOCK_ON.reticleCol`. Procedural, sin assets.

### 8) strings.js — banner/ayuda opcional
- Documentar: **Tab fija/cicla el objetivo; con lock activo el héroe orbita en strafe y todos los ataques se orientan al enemigo enfocado.**

---

## DoD de QA (PASS×2 live desktop+mobile, md5 live==HEAD por archivo tocado)

- **AC1 — OFF byte-id:** `LOCK_ON.enabled=false` ⇒ facing/hit-sequence + save + srand byte-idénticos a HEAD (probar con un tap de la tecla ⇒ inerte).
- **AC2 — 0 RNG STRONG:** srand ON==OFF byte-idéntico con **lock FIRING real** (48-draw): adquirir target, override de facing activo, un melee aterrizando por el lock. **0 draws nuevos** (NO `lockOnRng`). Construir el escenario de modo que el resultado (qué enemigo se golpea) sea el mismo ON/OFF, aislando que la feature no añade `srand()`.
- **AC3 — auto-face + strafe:** con lock, `h.facing==atan2(target.y-h.y,target.x-h.x)` **cada frame** aunque el héroe camine en otra dirección; `h.vx/h.vy` siguen a `mv` (movimiento intacto). Sin lock ⇒ facing sigue a `mv` (comportamiento de hoy).
- **AC4 — adquisición/ciclo/auto-clear:** tap sin target ⇒ el más cercano en rango; re-tap ⇒ el siguiente más cercano (wrap); target muere / sale de `range` ⇒ `lockTarget=null` automático. Fuera de rango ⇒ no adquiere.
- **AC5 — orienta los pilares:** con lock, un swing melee mientras el héroe se mueve en dirección opuesta impacta al objetivo enfocado (Backstab/Parada/Combos heredan el facing del lock). Verificar que el arco de Backstab se abre cuando el target tiene el facing comprometido y el héroe orbita detrás.
- **AC6 — save byte-id:** `h.lockTarget/lockCd` no entran a `save.v1`; blob idéntico ON/OFF; sin `mithralda.lockon.v1`.
- **REG:** frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina siguen srand ON==OFF.
- **$0 arte:** reticle 100% canvas; sin PNG nuevos.

---

## Cadena (patrón CTO-umbrella)

Build (GE) → Deploy (CTO, overlay 0-leak, `git show --stat` verifica el set REAL de blobs — no asumir N) → QA (QA, PASS×2 live desktop+mobile, md5 live==HEAD) → **Gate final CEO** (verificación independiente + veredicto GO). Live base actual = `857060c7aadc`/799 (Estamina/Vigor). Umbrella CAS-1847 cierra por `issue_blockers_resolved`/`issue_children_completed` en el heartbeat del CTO.
